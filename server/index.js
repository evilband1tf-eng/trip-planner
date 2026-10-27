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
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;

const app = express();
app.use(cors());
// 行程图片以 data URL 形式随请求提交，放宽请求体上限
app.use(express.json({ limit: '8mb' }));

const MAX_IMAGE_CHARS = 4 * 1024 * 1024;

/** 校验行程封面图（允许为空），返回错误文案或 null */
function checkImage(image) {
  if (image === undefined || image === '') return null;
  if (typeof image !== 'string' || !image.startsWith('data:image/')) return '图片格式不正确';
  if (image.length > MAX_IMAGE_CHARS) return '图片过大，请换一张小一点的照片';
  return null;
}

/** 统一捕获异步处理函数的异常，避免存储层报错时进程挂掉 */
const wrap = (handler) => (req, res) => {
  Promise.resolve(handler(req, res)).catch((error) => {
    console.error('[api] 处理请求失败：', error);
    if (!res.headersSent) res.status(500).json({ message: '服务端存储异常，请稍后重试' });
  });
};

const api = express.Router();

// 前端通过该接口判断是否启用服务端存储（否则退回浏览器本地存储）
api.get('/health', (_req, res) => {
  res.json({ ok: true, storage: STORAGE_MODE, time: new Date().toISOString() });
});

api.get('/state', (_req, res) => {
  res.json(getState());
});

api.post(
  '/menus',
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
  wrap(async (req, res) => {
    if (req.params.id === 'home') return res.status(400).json({ message: '首页菜单不可删除' });
    const ok = await deleteMenu(req.params.id);
    if (!ok) return res.status(404).json({ message: '菜单不存在' });
    return res.status(204).end();
  }),
);

api.post(
  '/itineraries',
  wrap(async (req, res) => {
    const title = String(req.body?.title ?? '').trim();
    const date = String(req.body?.date ?? '').trim();
    if (!title) return res.status(400).json({ message: '请填写行程安排内容' });
    if (!date) return res.status(400).json({ message: '请选择日期' });
    const imageError = checkImage(req.body?.image);
    if (imageError) return res.status(400).json({ message: imageError });

    const item = await createItinerary({ ...req.body, title, date });
    if (!item) return res.status(400).json({ message: '行程菜单不存在' });
    return res.status(201).json(item);
  }),
);

api.patch(
  '/itineraries/:id',
  wrap(async (req, res) => {
    const imageError = checkImage(req.body?.image);
    if (imageError) return res.status(400).json({ message: imageError });

    const item = await updateItinerary(req.params.id, req.body ?? {});
    if (!item) return res.status(404).json({ message: '行程安排不存在' });
    return res.json(item);
  }),
);

api.delete(
  '/itineraries/:id',
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
