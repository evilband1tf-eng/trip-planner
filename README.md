# 行程规划 · Trip Planner

一个手机与电脑都能用的行程规划网站：左侧菜单管理行程，按天记录每一段安排，支持自定义新增 / 删除菜单。

## 功能

- **左侧菜单栏**：第一项固定为「首页」，进入站点默认停留在首页；支持一键折叠 / 展开（移动端为抽屉式菜单）
- **自定义菜单**：菜单栏最后一个菜单下方有「＋」与垃圾桶两个图标
  - 点「＋」新建行程，新行程会自动成为一个菜单项
  - 点垃圾桶进入删除模式，每个可删除菜单右侧出现红色垃圾桶，点击后弹出二次确认；首页不可删除
- **行程管理**：首页展示统计与行程卡片；点击菜单进入行程详情，按「第 N 天」分组管理安排（日期、时间、内容、地点、备注，支持增删改）
- **行程封面图**：新建 / 编辑行程时可导入一张图片，首页卡片顶部固定 80px 高的图片区按比例完整显示，点击可放大查看
- **安排图片**：每一天的具体安排也可单独导入图片，条目内以 56px 高缩略图等比展示，点击放大
- **响应式**：桌面端固定侧边栏，移动端汉堡按钮 + 抽屉菜单，卡片自适应单列 / 双列
- **两种存储模式**：有后端时走接口，纯静态托管（如 GitHub Pages）时自动降级为浏览器本地存储，功能完全一致

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 + React Router（HashRouter） |
| 后端 | Node.js + Express（`server/`） |
| 数据库 | 极简 JSON 文件库（`server/data/db.json`，首次启动自动生成示例数据） |

## 目录结构

```
.
├── client/                 # 前端源码
│   ├── index.html
│   └── src/
│       ├── api/            # 数据层：remote（接口）/ local（localStorage）双实现
│       ├── components/     # 弹窗、图标选择器等
│       ├── layout/         # 侧边栏 + 整体布局
│       ├── pages/          # 首页、行程详情
│       ├── store/          # 全局数据 Context
│       └── utils/          # 日期 / 状态工具
├── server/                 # Express 接口 + JSON 数据库
├── scripts/                # Excel 行程导入脚本
├── .github/workflows/      # GitHub Pages 自动部署
└── vite.config.ts
```

## 本地开发

需要 Node.js 18+（推荐 20/22）。

```bash
npm install
npm run dev          # 同时启动前端(5173)与接口(8787)
```

打开 <http://localhost:5173> 即可。开发环境下前端把 `/api` 代理到 `http://127.0.0.1:8787`。

其他命令：

```bash
npm run build        # 构建前端到 dist/
npm start            # 生产模式：启动接口并托管 dist/（http://localhost:8787）
npm run typecheck    # TypeScript 类型检查
```

## 数据存储说明

启动时会自动探测 `GET /api/health`：

- 探测成功 → 使用服务端 JSON 数据库（数据文件 `server/data/db.json`，已加入 `.gitignore`，不会提交到仓库）
- 探测失败（例如部署在 GitHub Pages）→ 自动使用浏览器 `localStorage`，数据保存在当前浏览器

也可在 `.env` 中强制指定：`VITE_DATA_MODE=local` 或 `VITE_DATA_MODE=remote`（参考 `.env.example`）。接口部署在其他域名时，用 `VITE_API_BASE=https://your-api.com/api` 指定。

> 纯静态托管时数据只存在于访问者的浏览器里，换设备 / 清缓存会丢失；想要多设备同步，就把 `server/` 部署到任意 Node 托管平台，并把前端 `VITE_API_BASE` 指向它。

## 导入 Excel 行程

`scripts/import-itinerary.mjs` 可以把 Excel 行程表导入为站点数据（覆盖写入 `server/data/db.json`）。

表格要求：表头行包含「日期」「城市」「行程」，可选「支出」；每行一天，「行程」单元格内换行分隔多个安排，行首的 `1.` `2.` 会被去掉，形如 `10:20` 的时间会被识别为安排时间。

```bash
npm run import:itinerary -- "../实际行程.xlsx" \
  --name "2026圣诞欧洲14日游" \
  --destination "法国 · 瑞士 · 意大利"
```

导入后重启服务（`npm run dev`）即可看到数据。

## 发布到公网（GitHub Pages + Render，数据共享）

目标：朋友打开 `https://<你的用户名>.github.io/trip-planner/` 就能看到同一份行程。前端托管在 GitHub Pages，数据统一存在 Render 上的接口里。

### 第 1 步：把代码推到 GitHub

先在 GitHub 网页新建一个**空仓库**（不要勾选 README / .gitignore），例如 `trip-planner`，然后在项目根目录执行（把 `<你的用户名>` 换成自己的）：

```bash
git init
git add .
git commit -m "feat: 行程规划网站"
git branch -M main
git remote add origin https://github.com/<你的用户名>/trip-planner.git
git push -u origin main
```

> `server/data/`（你的真实行程）、`node_modules`、`dist` 已在 `.gitignore` 里，不会被推上去。

### 第 2 步：部署后端到 Render（免费）

1. 注册并登录 <https://render.com>，用 GitHub 账号授权。
2. 右上角 **New → Blueprint**，选中刚推送的仓库，Render 会读取仓库内的 `render.yaml` 自动创建服务。
   - 手动创建也行：**New → Web Service** → 选仓库 → Runtime `Node` → Build Command `npm ci` → Start Command `npm start` → Plan `Free`。
3. 部署完拿到接口域名，形如 `https://trip-planner-api.onrender.com`，先访问 `https://trip-planner-api.onrender.com/api/health`，应返回 `{"ok":true,...}`。

> 免费实例闲置 15 分钟会休眠，朋友首次打开需要等十几秒到几十秒（前端探测超时已放宽到 25 秒，会自动等待唤醒）。

**接着配置持久化存储（必做，否则重新部署就丢数据）**：

1. 注册 <https://upstash.com>，**Create Database** → 名称随意（如 `trip-planner`）→ 类型 `Regional` 或 `Global` → 区域选 `ap-southeast-1`（新加坡，离 Render 节点最近）→ Free 计划。
2. 进入数据库详情页的 **REST API** 区域，复制 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`。
3. 在 Render 服务页 **Environment → Add Environment Variable** 里加这两条（Key 用上面两个名字），保存后会自动重新部署。
4. 再访问 `/api/health`，`storage` 字段应为 `upstash-redis`（没配时是 `json-file`，即写本地临时磁盘）。

### 第 3 步：告诉前端接口地址

仓库 **Settings → Secrets and variables → Actions → Variables → New repository variable**：

- Name：`VITE_API_BASE`
- Value：`https://trip-planner-api.onrender.com/api`（结尾要带 `/api`）

### 第 4 步：开启 GitHub Pages

仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。此后每次 push 到 `main` 都会自动构建发布，地址形如 `https://<你的用户名>.github.io/trip-planner/`。

> 项目使用相对路径 + HashRouter，部署在子路径下不会 404。
> 如果没配第 3 步的变量，站点仍能打开，但会退回浏览器本地存储，朋友看不到你的行程。

### 第 5 步：把本地真实行程同步到线上

线上后端初始只有示例数据，本地导入过的真实行程用一条命令推上去：

```bash
npm run sync:remote -- https://trip-planner-api.onrender.com/api
```

脚本会先清空线上行程菜单再按 `server/data/db.json` 重建，可重复执行。

### 上线后的注意事项

- **数据持久化**：配好 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 后，所有数据存在 Upstash 免费 Redis 里，重新部署、重启、休眠唤醒都不会丢；`/api/health` 的 `storage` 是 `upstash-redis` 才算生效。没配时退回写本地 `server/data/db.json`，而 Render 免费实例磁盘是临时的，重启即重置成示例数据。
- **没有登录鉴权**：拿到链接的人都能查看和修改行程。
- **图片**：图片压缩后以 data URL 存在行程记录里，会随同步一起上传，不需要额外的对象存储。
- **只想发布静态站**：删掉仓库变量 `VITE_API_BASE` 再 push 一次即可。

## 自定义

- 主题色 / 圆角：`client/src/theme.ts`
- 全局样式与响应式断点：`client/src/styles.css`
- 菜单图标候选：`client/src/components/MenuIcon.tsx` 中的 `MENU_ICON_OPTIONS`
