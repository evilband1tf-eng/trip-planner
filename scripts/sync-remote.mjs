/**
 * 把本地数据（server/data/db.json）同步到线上后端。
 * 用于本地导入 Excel 行程后，把真实行程推到已部署的接口上。
 *
 * 用法：
 *   npm run sync:remote -- https://trip-planner-api.onrender.com/api
 *
 * 说明：会先删除线上所有行程菜单（首页菜单受保护，不会被删除），再按本地数据重建，因此是幂等的。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, '..', 'server', 'data', 'db.json');

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) {
  console.error('用法: npm run sync:remote -- https://<你的后端域名>/api');
  process.exit(1);
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
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
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
  process.exit(1);
});
