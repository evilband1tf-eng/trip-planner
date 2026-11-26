/**
 * Cloudflare Pages Functions 版后端，接口与 Express 版（server/index.js）保持一致。
 *
 * 存储（Upstash Redis REST）：
 * - trip-planner:state:v2        文字数据 + 账号 + 会话（不含图片，几十 KB）
 * - trip-planner:img:v1:i:<id>:<n>  单条安排的第 n 张图（JSON 字符串形式的 data URL）
 * - trip-planner:img:v1:m:<id>      行程封面图
 *
 * 图片逐张以 text/plain 上传、按 key 原样透传下载，避免大 JSON 解析超出
 * Workers 免费版 10ms CPU 限制。密码用 WebCrypto PBKDF2（Workers 无 scrypt）。
 */

const STATE_KEY_DEFAULT = 'trip-planner:state:v2';
const IMG_ITEM_PREFIX = 'trip-planner:img:v1:i:';
const IMG_MENU_PREFIX = 'trip-planner:img:v1:m:';

const HOME_MENU_ID = 'home';
const MAX_ITEM_IMAGES = 9;
const MAX_IMAGE_CHARS = 4 * 1024 * 1024;
const ROLES = ['admin', 'editor', 'viewer'];
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 10000;
const USERNAME_PATTERN = /^[A-Za-z0-9_.@-]{3,20}$/;
const MIN_PASSWORD_LENGTH = 6;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

/** 已经是 JSON 文本的响应（图片透传，省去二次序列化） */
function rawJson(text, status = 200) {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

const fail = (status, message) => ({ error: json({ message }, status) });

/* ------------------------------ Upstash ------------------------------ */

function redisConfig(env) {
  const url = (env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  const token = env.UPSTASH_REDIS_REST_TOKEN || '';
  if (!url || !token) throw new Error('未配置 Upstash 环境变量');
  return { url, token };
}

async function redis(env, command) {
  const { url, token } = redisConfig(env);
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`Upstash 请求失败（HTTP ${response.status}）`);
  const data = await response.json();
  if (data?.error) throw new Error(`Upstash 返回错误：${data.error}`);
  return data?.result;
}

async function redisPipeline(env, commands) {
  const { url, token } = redisConfig(env);
  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!response.ok) throw new Error(`Upstash 请求失败（HTTP ${response.status}）`);
  const results = await response.json();
  for (const one of results) {
    if (one?.error) throw new Error(`Upstash 返回错误：${one.error}`);
  }
  return results.map((one) => one?.result);
}

const stateKey = (env) => env.STATE_KEY_V2 || STATE_KEY_DEFAULT;
const itemImgKey = (id, index) => `${IMG_ITEM_PREFIX}${id}:${index}`;
const menuImgKey = (id) => `${IMG_MENU_PREFIX}${id}`;

/* ------------------------------ 密码 / 会话 ------------------------------ */

const toHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));

async function deriveBits(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 512);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(String(password), salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, iterText, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'pbkdf2' || !saltHex || !hashHex) return false;
  const iterations = Number(iterText);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 1000000) return false;
  const expected = fromHex(hashHex);
  const actual = new Uint8Array(await deriveBits(String(password), fromHex(saltHex), iterations));
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected[i] ^ actual[i];
  return diff === 0;
}

const createToken = () => toHex(crypto.getRandomValues(new Uint8Array(32)));
const newId = () => crypto.randomUUID();

/* ------------------------------ 状态读写 ------------------------------ */

function createHomeMenu() {
  return {
    id: HOME_MENU_ID,
    name: '首页',
    type: 'home',
    icon: 'home',
    destination: '',
    startDate: '',
    endDate: '',
    note: '',
    image: '',
    imageCount: 0,
    order: 0,
    createdAt: new Date().toISOString(),
  };
}

async function normalize(env, raw) {
  const next = raw && typeof raw === 'object' ? raw : {};
  if (!Array.isArray(next.menus)) next.menus = [];
  if (!Array.isArray(next.itineraries)) next.itineraries = [];

  if (!next.menus.some((menu) => menu.id === HOME_MENU_ID)) next.menus.unshift(createHomeMenu());
  next.menus.forEach((menu, index) => {
    if (typeof menu.order !== 'number') menu.order = index;
    if (typeof menu.image !== 'string') menu.image = '';
    if (typeof menu.imageCount !== 'number') menu.imageCount = menu.image ? 1 : 0;
    menu.image = '';
  });
  next.itineraries.forEach((item) => {
    if (typeof item.imageCount !== 'number') item.imageCount = Array.isArray(item.images) ? item.images.length : 0;
    item.images = [];
    if (typeof item.linkName !== 'string') item.linkName = '';
    if (typeof item.linkUrl !== 'string') item.linkUrl = '';
  });

  if (!Array.isArray(next.users)) next.users = [];
  next.users.forEach((user) => {
    if (!ROLES.includes(user.role)) user.role = 'viewer';
    if (typeof user.nickname !== 'string') user.nickname = '';
    if (!user.nickname) user.nickname = user.username;
  });
  if (!next.users.some((user) => user.username === 'admin')) {
    const now = new Date().toISOString();
    next.users.unshift({
      id: newId(),
      username: 'admin',
      nickname: '管理员',
      password: await hashPassword(env.ADMIN_PASSWORD || 'wlf010918'),
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    });
  }

  if (!Array.isArray(next.sessions)) next.sessions = [];
  const now = Date.now();
  next.sessions = next.sessions.filter((session) => session && session.expiresAt > now);
  return next;
}

async function loadState(env) {
  const raw = await redis(env, ['GET', stateKey(env)]);
  return normalize(env, raw ? JSON.parse(raw) : null);
}

async function saveState(env, state, extraCommands = []) {
  await redisPipeline(env, [['SET', stateKey(env), JSON.stringify(state)], ...extraCommands]);
}

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  nickname: user.nickname,
  role: user.role,
  createdAt: user.createdAt,
});

const byOrder = (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);
const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

function userOfToken(state, token) {
  if (!token) return null;
  const session = state.sessions.find((one) => one.token === token);
  if (!session || session.expiresAt <= Date.now()) return null;
  return state.users.find((one) => one.id === session.userId) ?? null;
}

/* ------------------------------ 入参校验 ------------------------------ */

function checkImage(image) {
  if (image === undefined || image === '') return null;
  if (typeof image !== 'string' || !image.startsWith('data:image/')) return '图片格式不正确';
  if (image.length > MAX_IMAGE_CHARS) return '图片过大，请换一张小一点的照片';
  return null;
}

function checkImages(images) {
  if (images === undefined || images === null) return null;
  if (!Array.isArray(images)) return '图片格式不正确';
  if (images.length > MAX_ITEM_IMAGES) return `一条安排最多上传 ${MAX_ITEM_IMAGES} 张图片`;
  for (const image of images) {
    const error = checkImage(image);
    if (error) return error;
  }
  return null;
}

function checkLink(url) {
  if (url === undefined || url === null || url === '') return null;
  if (typeof url !== 'string') return '链接格式不正确';
  const value = url.trim();
  if (!/^https?:\/\//i.test(value)) return '链接需以 http:// 或 https:// 开头';
  if (value.length > 1000) return '链接过长，请换一个短一点的';
  return null;
}

function checkLinkName(name) {
  if (name === undefined || name === null || name === '') return null;
  if (typeof name !== 'string') return '路线名称格式不正确';
  if (name.trim().length > 30) return '路线名称不能超过 30 个字符';
  return null;
}

function checkAccountInput({ username, nickname, password, requirePassword }) {
  if (username !== undefined) {
    const value = String(username).trim();
    if (!USERNAME_PATTERN.test(value)) return '登录账号需为 3-20 位字母、数字或 _ . @ -';
  }
  if (nickname !== undefined && String(nickname).trim().length > 20) return '昵称不能超过 20 个字符';
  if (requirePassword || (password !== undefined && String(password) !== '')) {
    if (String(password ?? '').length < MIN_PASSWORD_LENGTH) return `密码至少 ${MIN_PASSWORD_LENGTH} 位`;
  }
  return null;
}

function checkImageCount(value) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 0 || value > MAX_ITEM_IMAGES) return '图片数量不正确';
  return null;
}

/* ------------------------------ 路由 ------------------------------ */

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/';
  const method = request.method;
  const segments = path.split('/').filter(Boolean);

  try {
    return await route(request, env, method, path, segments);
  } catch (error) {
    console.error('[api] 处理请求失败：', error);
    return json({ message: '服务端存储异常，请稍后重试' }, 500);
  }
}

async function route(request, env, method, path, seg) {
  if (method === 'GET' && path === '/health') {
    return json({ ok: true, storage: 'upstash-redis', time: new Date().toISOString() });
  }

  /* ---- 登录 ---- */

  if (method === 'POST' && path === '/auth/login') {
    const body = await readBody(request);
    if (body.error) return body.error;
    const username = String(body.data?.username ?? '').trim();
    const password = String(body.data?.password ?? '');
    if (!username || !password) return json({ message: '请输入账号和密码' }, 400);

    const state = await loadState(env);
    const user = state.users.find((one) => one.username === username);
    if (!user || !(await verifyPassword(password, user.password))) {
      return json({ message: '账号或密码不正确' }, 401);
    }
    const token = createToken();
    const now = Date.now();
    state.sessions = state.sessions.filter((session) => session.expiresAt > now);
    state.sessions.push({ token, userId: user.id, createdAt: new Date(now).toISOString(), expiresAt: now + SESSION_TTL });
    await saveState(env, state);
    return json({ token, user: publicUser(user) });
  }

  // 其余接口都要登录
  const state = await loadState(env);
  const header = String(request.headers.get('authorization') || '');
  const [scheme, token] = header.split(' ');
  const bearer = scheme?.toLowerCase() === 'bearer' && token ? token.trim() : '';
  const user = userOfToken(state, bearer);
  if (!user) return json({ message: '登录状态已失效，请重新登录' }, 401);
  const canEdit = user.role === 'admin' || user.role === 'editor';
  const isAdmin = user.role === 'admin';

  if (method === 'GET' && path === '/auth/me') return json(publicUser(user));

  if (method === 'PATCH' && path === '/auth/me') {
    const body = await readBody(request);
    if (body.error) return body.error;
    const { nickname, oldPassword, newPassword } = body.data ?? {};
    const error = checkAccountInput({ nickname, password: newPassword, requirePassword: false });
    if (error) return json({ message: error }, 400);

    const target = state.users.find((one) => one.id === user.id);
    if (newPassword !== undefined && String(newPassword) !== '') {
      if (!(await verifyPassword(String(oldPassword ?? ''), target.password))) {
        return json({ message: '原密码不正确' }, 400);
      }
      target.password = await hashPassword(newPassword);
    }
    if (nickname !== undefined) target.nickname = cleanText(nickname) || target.username;
    target.updatedAt = new Date().toISOString();
    await saveState(env, state);
    return json(publicUser(target));
  }

  if (method === 'POST' && path === '/auth/logout') {
    const before = state.sessions.length;
    state.sessions = state.sessions.filter((session) => session.token !== bearer);
    if (state.sessions.length !== before) await saveState(env, state);
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  /* ---- 账号管理 ---- */

  if (path === '/users' || (seg[0] === 'users' && seg.length === 2)) {
    if (!isAdmin) return json({ message: '只有管理员可以管理账号' }, 403);
    const id = seg[1];

    if (method === 'GET' && path === '/users') {
      const users = state.users
        .map(publicUser)
        .sort((a, b) => (a.role === b.role ? a.createdAt.localeCompare(b.createdAt) : a.role === 'admin' ? -1 : 1));
      return json(users);
    }

    if (method === 'POST' && path === '/users') {
      const body = await readBody(request);
      if (body.error) return body.error;
      const username = String(body.data?.username ?? '').trim();
      const password = String(body.data?.password ?? '');
      const nickname = String(body.data?.nickname ?? '').trim();
      const role = ROLES.includes(body.data?.role) ? body.data.role : 'viewer';
      if (!username) return json({ message: '请填写登录账号' }, 400);
      if (!password) return json({ message: '请填写登录密码' }, 400);
      const error = checkAccountInput({ username, nickname, password, requirePassword: true });
      if (error) return json({ message: error }, 400);
      if (state.users.some((one) => one.username === username)) return json({ message: '该登录账号已存在' }, 400);

      const now = new Date().toISOString();
      const created = {
        id: newId(),
        username,
        nickname: nickname || username,
        password: await hashPassword(password),
        role,
        createdAt: now,
        updatedAt: now,
      };
      state.users.push(created);
      await saveState(env, state);
      return json(publicUser(created), 201);
    }

    const target = state.users.find((one) => one.id === id);
    if (!target) return json({ message: '账号不存在' }, 404);

    if (method === 'PATCH') {
      const body = await readBody(request);
      if (body.error) return body.error;
      const { username, nickname, password, role } = body.data ?? {};
      const error = checkAccountInput({ username, nickname, password, requirePassword: false });
      if (error) return json({ message: error }, 400);
      if (role !== undefined && !ROLES.includes(role)) return json({ message: '权限设置不正确' }, 400);

      if (username !== undefined) {
        const value = cleanText(username);
        if (!value) return json({ message: '登录账号不能为空' }, 400);
        if (state.users.some((one) => one.username === value && one.id !== id)) {
          return json({ message: '该登录账号已存在' }, 400);
        }
        target.username = value;
      }
      if (nickname !== undefined) target.nickname = cleanText(nickname) || target.username;
      if (role !== undefined && ROLES.includes(role) && role !== target.role) {
        if (target.username === 'admin') return json({ message: '内置管理员不可以修改权限' }, 400);
        const admins = state.users.filter((one) => one.role === 'admin').length;
        if (target.role === 'admin' && admins <= 1) return json({ message: '至少要保留一个管理员' }, 400);
        target.role = role;
      }
      if (password !== undefined && String(password) !== '') {
        target.password = await hashPassword(password);
        state.sessions = state.sessions.filter((session) => session.userId !== id);
      }
      target.updatedAt = new Date().toISOString();
      await saveState(env, state);
      return json(publicUser(target));
    }

    if (method === 'DELETE') {
      if (id === user.id) return json({ message: '不能删除当前登录的账号' }, 400);
      if (target.username === 'admin') return json({ message: '内置管理员账号不可删除' }, 400);
      const admins = state.users.filter((one) => one.role === 'admin').length;
      if (target.role === 'admin' && admins <= 1) return json({ message: '至少要保留一个管理员' }, 400);
      state.users = state.users.filter((one) => one.id !== id);
      state.sessions = state.sessions.filter((session) => session.userId !== id);
      await saveState(env, state);
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
  }

  /* ---- 行程数据 ---- */

  if (method === 'GET' && path === '/state') {
    return json({ menus: [...state.menus].sort(byOrder), itineraries: state.itineraries });
  }

  if (method === 'POST' && path === '/menus') {
    if (!canEdit) return json({ message: '当前账号只有查看权限，无法修改行程' }, 403);
    const body = await readBody(request);
    if (body.error) return body.error;
    const name = String(body.data?.name ?? '').trim();
    if (!name) return json({ message: '请填写行程名称' }, 400);
    if (name.length > 30) return json({ message: '行程名称不能超过 30 个字符' }, 400);
    const imageError = checkImage(body.data?.image);
    if (imageError) return json({ message: imageError }, 400);

    const maxOrder = state.menus.reduce((max, menu) => Math.max(max, menu.order), 0);
    const image = cleanText(body.data?.image);
    const menu = {
      id: newId(),
      name,
      type: 'trip',
      icon: cleanText(body.data?.icon) || 'compass',
      destination: cleanText(body.data?.destination),
      startDate: cleanText(body.data?.startDate),
      endDate: cleanText(body.data?.endDate),
      note: cleanText(body.data?.note),
      image: '',
      imageCount: image ? 1 : 0,
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
    };
    state.menus.push(menu);
    const extra = image ? [['SET', menuImgKey(menu.id), JSON.stringify(image)]] : [];
    await saveState(env, state, extra);
    return json({ ...menu, image }, 201);
  }

  if (seg[0] === 'menus' && seg.length === 2) {
    const menu = state.menus.find((one) => one.id === seg[1]);
    if (!menu) return json({ message: '菜单不存在' }, 404);

    if (method === 'PATCH') {
      if (!canEdit) return json({ message: '当前账号只有查看权限，无法修改行程' }, 403);
      const body = await readBody(request);
      if (body.error) return body.error;
      const imageError = checkImage(body.data?.image);
      if (imageError) return json({ message: imageError }, 400);
      ['name', 'icon', 'destination', 'startDate', 'endDate', 'note'].forEach((key) => {
        if (body.data?.[key] !== undefined) menu[key] = cleanText(body.data[key]);
      });
      if (!menu.name) menu.name = '未命名行程';
      let image;
      const extra = [];
      if (body.data?.image !== undefined) {
        image = cleanText(body.data.image);
        menu.imageCount = image ? 1 : 0;
        extra.push(image ? ['SET', menuImgKey(menu.id), JSON.stringify(image)] : ['DEL', menuImgKey(menu.id)]);
      }
      await saveState(env, state, extra);
      return json({ ...menu, image: image !== undefined ? image : menu.image });
    }

    if (method === 'DELETE') {
      if (!canEdit) return json({ message: '当前账号只有查看权限，无法修改行程' }, 403);
      if (menu.id === HOME_MENU_ID) return json({ message: '首页菜单不可删除' }, 400);
      state.menus = state.menus.filter((one) => one.id !== menu.id);
      const removed = state.itineraries.filter((item) => item.menuId === menu.id);
      state.itineraries = state.itineraries.filter((item) => item.menuId !== menu.id);
      const extra = [['DEL', menuImgKey(menu.id)]];
      removed.forEach((item) => {
        for (let i = 0; i < MAX_ITEM_IMAGES; i += 1) extra.push(['DEL', itemImgKey(item.id, i)]);
      });
      await saveState(env, state, extra);
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
  }

  // 行程封面图：GET 透传 / PUT 单张原始上传
  if (seg[0] === 'menus' && seg[2] === 'image' && seg.length === 3) {
    const menu = state.menus.find((one) => one.id === seg[1]);
    if (!menu) return json({ message: '菜单不存在' }, 404);
    if (method === 'GET') {
      const raw = await redis(env, ['GET', menuImgKey(menu.id)]);
      return rawJson(raw || '""');
    }
    if (method === 'PUT') {
      if (!canEdit) return json({ message: '当前账号只有查看权限，无法修改行程' }, 403);
      const text = await request.text();
      const error = checkImage(text);
      if (error) return json({ message: error }, 400);
      menu.imageCount = text ? 1 : 0;
      await saveState(env, state, [
        text ? ['SET', menuImgKey(menu.id), JSON.stringify(text)] : ['DEL', menuImgKey(menu.id)],
      ]);
      return json({ ...menu, image: text });
    }
  }

  if (method === 'POST' && path === '/itineraries') {
    if (!canEdit) return json({ message: '当前账号只有查看权限，无法修改行程' }, 403);
    const body = await readBody(request);
    if (body.error) return body.error;
    const title = String(body.data?.title ?? '').trim();
    const date = String(body.data?.date ?? '').trim();
    if (!title) return json({ message: '请填写行程安排内容' }, 400);
    if (!date) return json({ message: '请选择日期' }, 400);
    const imageError = checkImages(body.data?.images) || checkImageCount(body.data?.imageCount);
    if (imageError) return json({ message: imageError }, 400);
    const linkError = checkLink(body.data?.linkUrl) || checkLinkName(body.data?.linkName);
    if (linkError) return json({ message: linkError }, 400);

    const menu = state.menus.find((one) => one.id === body.data?.menuId);
    if (!menu || menu.type === 'home') return json({ message: '行程菜单不存在' }, 400);

    // 兼容两种提交：带 images 数组（同步脚本）或只带 imageCount（前端逐张上传）
    const images = Array.isArray(body.data?.images) ? body.data.images.filter((one) => typeof one === 'string' && one.startsWith('data:image/')).slice(0, MAX_ITEM_IMAGES) : null;
    const imageCount = images ? images.length : Number(body.data?.imageCount ?? 0);
    const item = {
      id: newId(),
      menuId: menu.id,
      date,
      time: cleanText(body.data?.time),
      title,
      location: cleanText(body.data?.location),
      notes: cleanText(body.data?.notes),
      images: [],
      imageCount,
      linkName: cleanText(body.data?.linkName),
      linkUrl: cleanText(body.data?.linkUrl),
      createdAt: new Date().toISOString(),
    };
    state.itineraries.push(item);
    const extra = (images ?? []).map((one, index) => ['SET', itemImgKey(item.id, index), JSON.stringify(one)]);
    await saveState(env, state, extra);
    return json({ ...item, images: images ?? [] }, 201);
  }

  if (seg[0] === 'itineraries' && seg.length === 2) {
    const item = state.itineraries.find((one) => one.id === seg[1]);
    if (!item) return json({ message: '行程安排不存在' }, 404);

    if (method === 'PATCH') {
      if (!canEdit) return json({ message: '当前账号只有查看权限，无法修改行程' }, 403);
      const body = await readBody(request);
      if (body.error) return body.error;
      const imageError = checkImages(body.data?.images) || checkImageCount(body.data?.imageCount);
      if (imageError) return json({ message: imageError }, 400);
      const linkError = checkLink(body.data?.linkUrl) || checkLinkName(body.data?.linkName);
      if (linkError) return json({ message: linkError }, 400);

      ['date', 'time', 'title', 'location', 'notes', 'linkName', 'linkUrl'].forEach((key) => {
        if (body.data?.[key] !== undefined) item[key] = cleanText(body.data[key]);
      });
      if (!item.title) item.title = '未命名安排';

      let images;
      const extra = [];
      if (Array.isArray(body.data?.images)) {
        images = body.data.images.filter((one) => typeof one === 'string' && one.startsWith('data:image/')).slice(0, MAX_ITEM_IMAGES);
        item.imageCount = images.length;
        images.forEach((one, index) => extra.push(['SET', itemImgKey(item.id, index), JSON.stringify(one)]));
        for (let i = images.length; i < MAX_ITEM_IMAGES; i += 1) extra.push(['DEL', itemImgKey(item.id, i)]);
      } else if (body.data?.imageCount !== undefined) {
        item.imageCount = body.data.imageCount;
        for (let i = item.imageCount; i < MAX_ITEM_IMAGES; i += 1) extra.push(['DEL', itemImgKey(item.id, i)]);
      }
      await saveState(env, state, extra);
      return json({ ...item, images: images ?? [] });
    }

    if (method === 'DELETE') {
      if (!canEdit) return json({ message: '当前账号只有查看权限，无法修改行程' }, 403);
      state.itineraries = state.itineraries.filter((one) => one.id !== item.id);
      const extra = [];
      for (let i = 0; i < MAX_ITEM_IMAGES; i += 1) extra.push(['DEL', itemImgKey(item.id, i)]);
      await saveState(env, state, extra);
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
  }

  // 安排图片：GET 全部透传 / PUT 单张原始上传
  if (seg[0] === 'itineraries' && seg[2] === 'images' && seg.length === 3 && method === 'GET') {
    const item = state.itineraries.find((one) => one.id === seg[1]);
    if (!item) return json({ message: '行程安排不存在' }, 404);
    if (!item.imageCount) return rawJson('[]');
    const keys = Array.from({ length: item.imageCount }, (_, i) => itemImgKey(item.id, i));
    const values = await redis(env, ['MGET', ...keys]);
    return rawJson(`[${values.filter((one) => typeof one === 'string').join(',')}]`);
  }

  if (seg[0] === 'images' && seg[1] === 'item' && seg.length === 4 && method === 'PUT') {
    if (!canEdit) return json({ message: '当前账号只有查看权限，无法修改行程' }, 403);
    const item = state.itineraries.find((one) => one.id === seg[2]);
    if (!item) return json({ message: '行程安排不存在' }, 404);
    const index = Number(seg[3]);
    if (!Number.isInteger(index) || index < 0 || index >= MAX_ITEM_IMAGES) {
      return json({ message: '图片序号不正确' }, 400);
    }
    const text = await request.text();
    const error = checkImage(text);
    if (error) return json({ message: error }, 400);
    if (index >= item.imageCount) item.imageCount = index + 1;
    await saveState(env, state, [
      text ? ['SET', itemImgKey(item.id, index), JSON.stringify(text)] : ['DEL', itemImgKey(item.id, index)],
    ]);
    return json({ ok: true, imageCount: item.imageCount });
  }

  return json({ message: '接口不存在' }, 404);
}

async function readBody(request) {
  try {
    return { data: await request.json() };
  } catch {
    return fail(400, '请求体不是合法 JSON');
  }
}