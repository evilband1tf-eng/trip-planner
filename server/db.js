import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHomeMenu, createSeedState } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

export const HOME_MENU_ID = 'home';

/**
 * 极简 JSON 文件数据库：启动时读入内存，每次写操作后落盘。
 * 数据文件未纳入版本管理（见 .gitignore），首次启动自动写入示例数据。
 */
let state = loadState();

function loadState() {
  let next;
  try {
    next = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    next = createSeedState();
  }

  if (!Array.isArray(next.menus)) next.menus = [];
  if (!Array.isArray(next.itineraries)) next.itineraries = [];

  // 兜底的“首页”菜单，保证第一个菜单始终存在且不可删除
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

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
}

const newId = () => crypto.randomUUID();

const byOrder = (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

export function getState() {
  return {
    menus: [...state.menus].sort(byOrder),
    itineraries: [...state.itineraries],
  };
}

export function findMenu(id) {
  return state.menus.find((menu) => menu.id === id);
}

export function createMenu(input) {
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
  persist();
  return menu;
}

export function updateMenu(id, patch) {
  const menu = findMenu(id);
  if (!menu) return null;
  ['name', 'icon', 'destination', 'startDate', 'endDate', 'note', 'image'].forEach((key) => {
    if (patch[key] !== undefined) menu[key] = cleanText(patch[key]);
  });
  if (!menu.name) menu.name = '未命名行程';
  persist();
  return menu;
}

export function deleteMenu(id) {
  if (id === HOME_MENU_ID) return false;
  const exists = state.menus.some((menu) => menu.id === id);
  if (!exists) return false;
  state.menus = state.menus.filter((menu) => menu.id !== id);
  state.itineraries = state.itineraries.filter((item) => item.menuId !== id);
  persist();
  return true;
}

export function createItinerary(input) {
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
  persist();
  return item;
}

export function updateItinerary(id, patch) {
  const item = state.itineraries.find((one) => one.id === id);
  if (!item) return null;
  ['date', 'time', 'title', 'location', 'notes', 'image'].forEach((key) => {
    if (patch[key] !== undefined) item[key] = cleanText(patch[key]);
  });
  if (!item.title) item.title = '未命名安排';
  persist();
  return item;
}

export function deleteItinerary(id) {
  const exists = state.itineraries.some((item) => item.id === id);
  if (!exists) return false;
  state.itineraries = state.itineraries.filter((item) => item.id !== id);
  persist();
  return true;
}
