import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHomeMenu, createSeedState } from './seed.js';
import { createToken, hashPassword, ROLES, SESSION_TTL, verifyPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REDIS_KEY = process.env.STATE_KEY || 'trip-planner:state:v1';
const USE_REDIS = Boolean(REDIS_URL && REDIS_TOKEN);

export const HOME_MENU_ID = 'home';
export const STORAGE_MODE = USE_REDIS ? 'upstash-redis' : 'json-file';

/** 内置管理员：首次启动（或数据里没有 admin）时自动创建 */
export const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'wlf010918';
const DEFAULT_ADMIN_NICKNAME = '管理员';

/**
 * 存储策略：
 * - 配置了 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN → 存 Upstash Redis（云平台磁盘是临时的，必须外部存储）
 * - 否则 → 本地 JSON 文件（server/data/db.json），便于本地开发
 * 两者共用同一份内存态，读写接口一致。
 */
let state = null;

async function redisCall(command) {
  const response = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`Upstash 请求失败（HTTP ${response.status}）`);
  const data = await response.json();
  if (data?.error) throw new Error(`Upstash 返回错误：${data.error}`);
  return data?.result;
}

function readLocalFile() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return createSeedState();
  }
}

/** 补齐缺失字段，兼容早期版本的存量数据 */
function normalize(raw) {
  const next = raw && typeof raw === 'object' ? raw : createSeedState();
  if (!Array.isArray(next.menus)) next.menus = [];
  if (!Array.isArray(next.itineraries)) next.itineraries = [];

  if (!next.menus.some((menu) => menu.id === HOME_MENU_ID)) {
    next.menus.unshift(createHomeMenu());
  }
  next.menus.forEach((menu, index) => {
    if (typeof menu.order !== 'number') menu.order = index;
    if (typeof menu.image !== 'string') menu.image = '';
  });
  next.itineraries.forEach((item) => {
    if (typeof item.image !== 'string') item.image = '';
  });

  // 账号体系：早期版本的数据里没有 users，需要补上内置管理员
  if (!Array.isArray(next.users)) next.users = [];
  next.users.forEach((user) => {
    if (!ROLES.includes(user.role)) user.role = 'viewer';
    if (typeof user.nickname !== 'string') user.nickname = '';
    if (!user.nickname) user.nickname = user.username;
  });
  if (!next.users.some((user) => user.username === DEFAULT_ADMIN_USERNAME)) {
    next.users.unshift(createAdminRecord());
  }

  // 会话：过期的直接丢弃
  if (!Array.isArray(next.sessions)) next.sessions = [];
  const now = Date.now();
  next.sessions = next.sessions.filter((session) => session && session.expiresAt > now);
  return next;
}

function createAdminRecord() {
  const now = new Date().toISOString();
  return {
    id: newId(),
    username: DEFAULT_ADMIN_USERNAME,
    nickname: DEFAULT_ADMIN_NICKNAME,
    password: hashPassword(DEFAULT_ADMIN_PASSWORD),
    role: 'admin',
    createdAt: now,
    updatedAt: now,
  };
}

async function persist() {
  if (USE_REDIS) {
    await redisCall(['SET', REDIS_KEY, JSON.stringify(state)]);
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
}

/** 启动时调用：把数据载入内存 */
export async function initStore() {
  if (!USE_REDIS) {
    state = normalize(readLocalFile());
    return;
  }

  try {
    const raw = await redisCall(['GET', REDIS_KEY]);
    if (raw) {
      state = normalize(JSON.parse(raw));
      console.log(`[db] 已从 Upstash 载入数据（${state.menus.length} 个菜单 / ${state.itineraries.length} 条安排）`);
      return;
    }
    state = normalize(createSeedState());
    await persist();
    console.log('[db] Upstash 中暂无数据，已写入示例数据');
  } catch (error) {
    console.error(`[db] 读取 Upstash 失败：${error.message}；暂用内存示例数据（重启会丢失）`);
    state = normalize(createSeedState());
  }
}

const newId = () => crypto.randomUUID();

const byOrder = (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

export function getState() {
  if (!state) return { menus: [], itineraries: [] };
  return {
    menus: [...state.menus].sort(byOrder),
    itineraries: [...state.itineraries],
  };
}

export function findMenu(id) {
  return state?.menus.find((menu) => menu.id === id);
}

export async function createMenu(input) {
  const maxOrder = state.menus.reduce((max, menu) => Math.max(max, menu.order), 0);
  const menu = {
    id: newId(),
    name: cleanText(input.name),
    type: 'trip',
    icon: cleanText(input.icon) || 'compass',
    destination: cleanText(input.destination),
    startDate: cleanText(input.startDate),
    endDate: cleanText(input.endDate),
    note: cleanText(input.note),
    image: cleanText(input.image),
    order: maxOrder + 1,
    createdAt: new Date().toISOString(),
  };
  state.menus.push(menu);
  await persist();
  return menu;
}

export async function updateMenu(id, patch) {
  const menu = findMenu(id);
  if (!menu) return null;
  ['name', 'icon', 'destination', 'startDate', 'endDate', 'note', 'image'].forEach((key) => {
    if (patch[key] !== undefined) menu[key] = cleanText(patch[key]);
  });
  if (!menu.name) menu.name = '未命名行程';
  await persist();
  return menu;
}

export async function deleteMenu(id) {
  if (id === HOME_MENU_ID) return false;
  const exists = state.menus.some((menu) => menu.id === id);
  if (!exists) return false;
  state.menus = state.menus.filter((menu) => menu.id !== id);
  state.itineraries = state.itineraries.filter((item) => item.menuId !== id);
  await persist();
  return true;
}

export async function createItinerary(input) {
  const menu = findMenu(input.menuId);
  if (!menu || menu.type === 'home') return null;
  const item = {
    id: newId(),
    menuId: menu.id,
    date: cleanText(input.date),
    time: cleanText(input.time),
    title: cleanText(input.title),
    location: cleanText(input.location),
    notes: cleanText(input.notes),
    image: cleanText(input.image),
    createdAt: new Date().toISOString(),
  };
  state.itineraries.push(item);
  await persist();
  return item;
}

export async function updateItinerary(id, patch) {
  const item = state.itineraries.find((one) => one.id === id);
  if (!item) return null;
  ['date', 'time', 'title', 'location', 'notes', 'image'].forEach((key) => {
    if (patch[key] !== undefined) item[key] = cleanText(patch[key]);
  });
  if (!item.title) item.title = '未命名安排';
  await persist();
  return item;
}

export async function deleteItinerary(id) {
  const exists = state.itineraries.some((item) => item.id === id);
  if (!exists) return false;
  state.itineraries = state.itineraries.filter((item) => item.id !== id);
  await persist();
  return true;
}

/* ------------------------------ 账号 / 会话 ------------------------------ */

/** 带 HTTP 状态码的业务异常，路由层直接透传 */
const fail = (status, message) => Object.assign(new Error(message), { status });

/** 对外返回的用户信息，永远不带密码散列 */
const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  nickname: user.nickname,
  role: user.role,
  createdAt: user.createdAt,
});

const adminCount = () => state.users.filter((user) => user.role === 'admin').length;

export function listUsers() {
  return state.users
    .map(publicUser)
    .sort((a, b) => (a.role === b.role ? a.createdAt.localeCompare(b.createdAt) : a.role === 'admin' ? -1 : 1));
}

function assertUsernameFree(username, exceptId) {
  const taken = state.users.some((user) => user.username === username && user.id !== exceptId);
  if (taken) throw fail(400, '该登录账号已存在');
}

/** 登录校验：账号不存在或密码不对都返回 null，不泄露是哪一种 */
export function authenticateUser(username, password) {
  const user = state.users.find((one) => one.username === username);
  if (!user) return null;
  if (!verifyPassword(password, user.password)) return null;
  return user;
}

export async function createSession(userId) {
  const token = createToken();
  const now = Date.now();
  state.sessions = state.sessions.filter((session) => session.expiresAt > now);
  state.sessions.push({ token, userId, createdAt: new Date(now).toISOString(), expiresAt: now + SESSION_TTL });
  await persist();
  return token;
}

/** 根据 token 找到当前用户，token 失效返回 null */
export function userOfToken(token) {
  if (!token) return null;
  const session = state.sessions.find((one) => one.token === token);
  if (!session || session.expiresAt <= Date.now()) return null;
  const user = state.users.find((one) => one.id === session.userId);
  return user ?? null;
}

export async function deleteSession(token) {
  const before = state.sessions.length;
  state.sessions = state.sessions.filter((session) => session.token !== token);
  if (state.sessions.length !== before) await persist();
}

/** 某个账号被修改 / 删除后，强制其所有会话重新登录 */
export async function dropSessionsOf(userId) {
  const before = state.sessions.length;
  state.sessions = state.sessions.filter((session) => session.userId !== userId);
  if (state.sessions.length !== before) await persist();
}

export async function createUser(input) {
  const username = cleanText(input.username);
  const password = String(input.password ?? '');
  const nickname = cleanText(input.nickname) || username;
  const role = ROLES.includes(input.role) ? input.role : 'viewer';

  assertUsernameFree(username);
  const now = new Date().toISOString();
  const user = {
    id: newId(),
    username,
    nickname,
    password: hashPassword(password),
    role,
    createdAt: now,
    updatedAt: now,
  };
  state.users.push(user);
  await persist();
  return publicUser(user);
}

export async function updateUser(id, patch) {
  const user = state.users.find((one) => one.id === id);
  if (!user) throw fail(404, '账号不存在');

  if (patch.username !== undefined) {
    const username = cleanText(patch.username);
    if (!username) throw fail(400, '登录账号不能为空');
    assertUsernameFree(username, id);
    user.username = username;
  }
  if (patch.nickname !== undefined) {
    user.nickname = cleanText(patch.nickname) || user.username;
  }
  if (patch.role !== undefined && ROLES.includes(patch.role) && patch.role !== user.role) {
    if (user.username === DEFAULT_ADMIN_USERNAME) throw fail(400, '内置管理员不可以修改权限');
    if (user.role === 'admin' && adminCount() <= 1) throw fail(400, '至少要保留一个管理员');
    user.role = patch.role;
  }
  if (patch.password !== undefined && String(patch.password) !== '') {
    user.password = hashPassword(patch.password);
  }

  user.updatedAt = new Date().toISOString();
  await persist();
  return publicUser(user);
}

/** 用户自己修改昵称 / 密码；改密码需验证原密码 */
export async function updateSelf(id, { nickname, oldPassword, newPassword }) {
  const user = state.users.find((one) => one.id === id);
  if (!user) throw fail(404, '账号不存在');

  if (newPassword !== undefined && String(newPassword) !== '') {
    if (!verifyPassword(String(oldPassword ?? ''), user.password)) throw fail(400, '原密码不正确');
    user.password = hashPassword(newPassword);
  }
  if (nickname !== undefined) {
    user.nickname = cleanText(nickname) || user.username;
  }

  user.updatedAt = new Date().toISOString();
  await persist();
  return publicUser(user);
}

export async function deleteUser(id) {
  const user = state.users.find((one) => one.id === id);
  if (!user) throw fail(404, '账号不存在');
  if (user.username === DEFAULT_ADMIN_USERNAME) throw fail(400, '内置管理员账号不可删除');
  if (user.role === 'admin' && adminCount() <= 1) throw fail(400, '至少要保留一个管理员');

  state.users = state.users.filter((one) => one.id !== id);
  state.sessions = state.sessions.filter((session) => session.userId !== id);
  await persist();
  return true;
}
