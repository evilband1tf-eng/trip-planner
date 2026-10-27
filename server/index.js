import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import {
  getState,
  createMenu,
  updateMenu,
  deleteMenu,
  createItinerary,
  updateItinerary,
  deleteItinerary,
  initStore,
  STORAGE_MODE,
  MAX_ITEM_IMAGES,
  authenticateUser,
  createSession,
  userOfToken,
  deleteSession,
  dropSessionsOf,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  updateSelf,
} from './db.js';
import { ROLES } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;

const app = express();
app.use(cors());
// 图片以 data URL 形式随请求提交（一条安排最多 9 张），放宽请求体上限
app.use(express.json({ limit: '32mb' }));

const MAX_IMAGE_CHARS = 4 * 1024 * 1024;

/** 校验单张图片（允许为空），返回错误文案或 null */
function checkImage(image) {
  if (image === undefined || image === '') return null;
  if (typeof image !== 'string' || !image.startsWith('data:image/')) return '图片格式不正确';
  if (image.length > MAX_IMAGE_CHARS) return '图片过大，请换一张小一点的照片';
  return null;
}

/** 校验安排的图片数组（允许为空），返回错误文案或 null */
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

/** 校验路线链接（允许为空）：只放行 http/https，避免 javascript: 之类的危险协议 */
function checkLink(url) {
  if (url === undefined || url === null || url === '') return null;
  if (typeof url !== 'string') return '链接格式不正确';
  const value = url.trim();
  if (!/^https?:\/\//i.test(value)) return '链接需以 http:// 或 https:// 开头';
  if (value.length > 1000) return '链接过长，请换一个短一点的';
  return null;
}

/** 校验路线名称（允许为空） */
function checkLinkName(name) {
  if (name === undefined || name === null || name === '') return null;
  if (typeof name !== 'string') return '路线名称格式不正确';
  if (name.trim().length > 30) return '路线名称不能超过 30 个字符';
  return null;
}

/** 统一捕获异步处理函数的异常，避免存储层报错时进程挂掉 */
const wrap = (handler) => (req, res) => {
  Promise.resolve(handler(req, res)).catch((error) => {
    if (error?.status) {
      if (!res.headersSent) res.status(error.status).json({ message: error.message });
      return;
    }
    console.error('[api] 处理请求失败：', error);
    if (!res.headersSent) res.status(500).json({ message: '服务端存储异常，请稍后重试' });
  });
};

/* --------------------------------- 鉴权 --------------------------------- */

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  nickname: user.nickname,
  role: user.role,
  createdAt: user.createdAt,
});

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return '';
  return token.trim();
}

/** 校验登录态，把用户挂到 req.user / req.token 上 */
function requireAuth(req, res, next) {
  const token = bearerToken(req);
  const user = userOfToken(token);
  if (!user) return res.status(401).json({ message: '登录状态已失效，请重新登录' });
  req.user = user;
  req.token = token;
  return next();
}

/** 可编辑：管理员与「可查看编辑」账号 */
function requireEditor(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'editor') {
    return res.status(403).json({ message: '当前账号只有查看权限，无法修改行程' });
  }
  return next();
}

/** 账号管理：只有管理员 */
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: '只有管理员可以管理账号' });
  }
  return next();
}

const USERNAME_PATTERN = /^[A-Za-z0-9_.@-]{3,20}$/;
const MIN_PASSWORD_LENGTH = 6;

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

const api = express.Router();

// 前端通过该接口判断是否启用服务端存储（否则退回浏览器本地存储）
api.get('/health', (_req, res) => {
  res.json({ ok: true, storage: STORAGE_MODE, time: new Date().toISOString() });
});

api.post(
  '/auth/login',
  wrap(async (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) return res.status(400).json({ message: '请输入账号和密码' });

    const user = authenticateUser(username, password);
    if (!user) return res.status(401).json({ message: '账号或密码不正确' });

    const token = await createSession(user.id);
    return res.json({ token, user: publicUser(user) });
  }),
);

api.get('/auth/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

api.post(
  '/auth/logout',
  requireAuth,
  wrap(async (req, res) => {
    await deleteSession(req.token);
    return res.status(204).end();
  }),
);

// 修改自己的昵称 / 密码
api.patch(
  '/auth/me',
  requireAuth,
  wrap(async (req, res) => {
    const { nickname, oldPassword, newPassword } = req.body ?? {};
    const error = checkAccountInput({ nickname, password: newPassword, requirePassword: false });
    if (error) return res.status(400).json({ message: error });

    const user = await updateSelf(req.user.id, { nickname, oldPassword, newPassword });
    return res.json(publicUser(user));
  }),
);

/* ------------------------------- 账号管理 ------------------------------- */

api.get('/users', requireAuth, requireAdmin, (_req, res) => {
  res.json(listUsers());
});

api.post(
  '/users',
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    const nickname = String(req.body?.nickname ?? '').trim();
    const role = ROLES.includes(req.body?.role) ? req.body.role : 'viewer';

    if (!username) return res.status(400).json({ message: '请填写登录账号' });
    if (!password) return res.status(400).json({ message: '请填写登录密码' });
    const error = checkAccountInput({ username, nickname, password, requirePassword: true });
    if (error) return res.status(400).json({ message: error });

    const user = await createUser({ username, nickname, password, role });
    return res.status(201).json(user);
  }),
);

api.patch(
  '/users/:id',
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const { username, nickname, password, role } = req.body ?? {};
    const error = checkAccountInput({ username, nickname, password, requirePassword: false });
    if (error) return res.status(400).json({ message: error });
    if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ message: '权限设置不正确' });

    const user = await updateUser(req.params.id, { username, nickname, password, role });
    // 密码被重置后，让该账号的旧登录态失效
    if (password !== undefined && String(password) !== '') await dropSessionsOf(user.id);
    return res.json(user);
  }),
);

api.delete(
  '/users/:id',
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    if (req.params.id === req.user.id) return res.status(400).json({ message: '不能删除当前登录的账号' });
    await deleteUser(req.params.id);
    return res.status(204).end();
  }),
);

/* ------------------------------- 行程数据 ------------------------------- */

api.get('/state', requireAuth, (_req, res) => {
  res.json(getState());
});

api.post(
  '/menus',
  requireAuth,
  requireEditor,
  wrap(async (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ message: '请填写行程名称' });
    if (name.length > 30) return res.status(400).json({ message: '行程名称不能超过 30 个字符' });
    const imageError = checkImage(req.body?.image);
    if (imageError) return res.status(400).json({ message: imageError });

    const menu = await createMenu({ ...req.body, name });
    return res.status(201).json(menu);
  }),
);

api.patch(
  '/menus/:id',
  requireAuth,
  requireEditor,
  wrap(async (req, res) => {
    const imageError = checkImage(req.body?.image);
    if (imageError) return res.status(400).json({ message: imageError });

    const menu = await updateMenu(req.params.id, req.body ?? {});
    if (!menu) return res.status(404).json({ message: '菜单不存在' });
    return res.json(menu);
  }),
);

api.delete(
  '/menus/:id',
  requireAuth,
  requireEditor,
  wrap(async (req, res) => {
    if (req.params.id === 'home') return res.status(400).json({ message: '首页菜单不可删除' });
    const ok = await deleteMenu(req.params.id);
    if (!ok) return res.status(404).json({ message: '菜单不存在' });
    return res.status(204).end();
  }),
);

api.post(
  '/itineraries',
  requireAuth,
  requireEditor,
  wrap(async (req, res) => {
    const title = String(req.body?.title ?? '').trim();
    const date = String(req.body?.date ?? '').trim();
    if (!title) return res.status(400).json({ message: '请填写行程安排内容' });
    if (!date) return res.status(400).json({ message: '请选择日期' });
    const imageError = checkImages(req.body?.images);
    if (imageError) return res.status(400).json({ message: imageError });
    const linkError = checkLink(req.body?.linkUrl) || checkLinkName(req.body?.linkName);
    if (linkError) return res.status(400).json({ message: linkError });

    const item = await createItinerary({ ...req.body, title, date });
    if (!item) return res.status(400).json({ message: '行程菜单不存在' });
    return res.status(201).json(item);
  }),
);

api.patch(
  '/itineraries/:id',
  requireAuth,
  requireEditor,
  wrap(async (req, res) => {
    const imageError = checkImages(req.body?.images);
    if (imageError) return res.status(400).json({ message: imageError });
    const linkError = checkLink(req.body?.linkUrl) || checkLinkName(req.body?.linkName);
    if (linkError) return res.status(400).json({ message: linkError });

    const item = await updateItinerary(req.params.id, req.body ?? {});
    if (!item) return res.status(404).json({ message: '行程安排不存在' });
    return res.json(item);
  }),
);

api.delete(
  '/itineraries/:id',
  requireAuth,
  requireEditor,
  wrap(async (req, res) => {
    const ok = await deleteItinerary(req.params.id);
    if (!ok) return res.status(404).json({ message: '行程安排不存在' });
    return res.status(204).end();
  }),
);

app.use('/api', api);

// 请求体过大（通常是图片太大）时返回 JSON 错误，方便前端提示
app.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: '图片过大，请换一张小一点的照片' });
  }
  return next(err);
});

// 生产环境下顺带托管前端构建产物
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

async function start() {
  await initStore();
  app.listen(PORT, () => {
    console.log(`[trip-planner] API server ready: http://127.0.0.1:${PORT} （存储：${STORAGE_MODE}）`);
  });
}

start().catch((error) => {
  console.error('[trip-planner] 启动失败：', error);
  process.exit(1);
});
