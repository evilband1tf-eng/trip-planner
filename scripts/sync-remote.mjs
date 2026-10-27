/**
 * 把本地数据（server/data/db.json）同步到线上后端。
 * 用于本地导入 Excel 行程后，把真实行程推到已部署的接口上。
 *
 * 用法：
 *   npm run sync:remote -- https://trip-planner-api.onrender.com/api
 *   TRIP_ADMIN_USER=admin TRIP_ADMIN_PASS=****** npm run sync:remote -- <api>
 *   也可以接在参数后面：npm run sync:remote -- <api> <账号> <密码>
 *
 * 说明：接口需要登录，脚本会先登录拿 token；会先删除线上所有行程菜单
 *（首页菜单受保护，不会被删除），再按本地数据重建，因此是幂等的。
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, '..', 'server', 'data', 'db.json');

const base = (process.argv[2] || '').replace(/\/$/, '');
const argUser = process.argv[3] || '';
const argPass = process.argv[4] || '';
if (!base) {
  console.error('用法: npm run sync:remote -- https://<你的后端域名>/api [账号] [密码]');
  process.exit(1);
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** 输入时不回显密码 */
function askSecret(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
    rl._writeToOutput = () => {};
  });
}

let token = '';

async function login() {
  const username = process.env.TRIP_ADMIN_USER || argUser || (await ask('管理员账号：'));
  const password = process.env.TRIP_ADMIN_PASS || argPass || (await askSecret('管理员密码：'));

  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(`登录失败：${detail.message || response.status}`);
  }
  const data = await response.json();
  if (data.user.role !== 'admin' && data.user.role !== 'editor') {
    throw new Error('该账号没有编辑权限，无法同步行程');
  }
  token = data.token;
  console.log(`已登录：${data.user.nickname}（${data.user.username}）`);
}

function readLocalState() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    console.error(`读不到本地数据文件：${DB_FILE}\n请先在本地导入行程（npm run import:itinerary ...）或运行过一次 npm run dev。`);
    process.exit(1);
  }
}

async function request(method, urlPath, body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${method} ${urlPath} 失败：${response.status} ${detail}`);
  }
  return response.status === 204 ? null : response.json();
}

async function main() {
  const local = readLocalState();
  const localMenus = Array.isArray(local.menus) ? local.menus : [];
  const localItems = Array.isArray(local.itineraries) ? local.itineraries : [];
  const tripMenus = localMenus.filter((menu) => menu.type !== 'home');

  console.log(`接口地址: ${base}`);
  console.log(`本地数据: ${tripMenus.length} 个行程 / ${localItems.length} 条安排`);

  await login();

  const remote = await request('GET', '/state');
  const remoteTrips = (remote.menus || []).filter((menu) => menu.type !== 'home');
  console.log(`线上现有: ${remoteTrips.length} 个行程`);

  for (const menu of remoteTrips) {
    await request('DELETE', `/menus/${menu.id}`);
  }
  if (remoteTrips.length) console.log(`已清理线上旧行程 ${remoteTrips.length} 个`);

  const idMap = new Map();
  for (const menu of tripMenus) {
    const created = await request('POST', '/menus', {
      name: menu.name,
      icon: menu.icon,
      destination: menu.destination,
      startDate: menu.startDate,
      endDate: menu.endDate,
      note: menu.note,
      image: menu.image,
    });
    idMap.set(menu.id, created.id);
    console.log(`+ 行程「${created.name}」`);
  }

  let pushed = 0;
  for (const item of localItems) {
    const menuId = idMap.get(item.menuId);
    if (!menuId) continue;
    await request('POST', '/itineraries', {
      menuId,
      date: item.date,
      time: item.time,
      title: item.title,
      location: item.location,
      notes: item.notes,
      image: item.image,
    });
    pushed += 1;
  }

  console.log(`完成：${idMap.size} 个行程、${pushed} 条安排已同步到线上。`);
}

main().catch((error) => {
  console.error(`同步失败：${error.message}`);
  if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(error.message)) {
    console.error('提示：免费实例休眠后首次访问需要几十秒唤醒，稍等片刻重试即可。');
  }
  if (/401|登录/.test(error.message)) {
    console.error('提示：可用 TRIP_ADMIN_USER / TRIP_ADMIN_PASS 环境变量或命令行参数传入账号密码。');
  }
  process.exit(1);
});
