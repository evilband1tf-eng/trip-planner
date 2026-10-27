import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHomeMenu, createSeedState } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REDIS_KEY = process.env.STATE_KEY || 'trip-planner:state:v1';
const USE_REDIS = Boolean(REDIS_URL && REDIS_TOKEN);

export const HOME_MENU_ID = 'home';
export const STORAGE_MODE = USE_REDIS ? 'upstash-redis' : 'json-file';

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
  return next;
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
