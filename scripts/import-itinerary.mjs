#!/usr/bin/env node
/**
 * 把 Excel 行程表（.xlsx）导入为站点数据。
 *
 * 用法：
 *   node scripts/import-itinerary.mjs "../实际行程.xlsx" \
 *     --name "圣诞欧洲 14 日游" --destination "法国 · 瑞士 · 意大利"
 *
 * 表格约定（与「实际行程.xlsx」一致）：
 *   - 表头行包含「日期」「城市」「行程」，可选「支出」
 *   - 每行一天，「行程」单元格内用换行分隔多个安排，行首的 "1." "2." 会被去掉
 *   - 行首形如 "10:20" 的时间会被识别为安排时间
 *
 * 输出：server/data/db.json（覆盖写入，该文件不纳入版本管理）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      args[token.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    } else {
      args._.push(token);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const xlsxPath = path.resolve(projectRoot, args.file || args._[0] || '../实际行程.xlsx');
const outPath = path.resolve(projectRoot, args.out || 'server/data/db.json');

if (!fs.existsSync(xlsxPath)) {
  console.error(`找不到文件：${xlsxPath}`);
  process.exit(1);
}

/* ---------------- 解析 xlsx ---------------- */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsx-'));
execFileSync('unzip', ['-o', '-q', xlsxPath, '-d', tmpDir]);

const decode = (text) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const sharedXml = fs.readFileSync(path.join(tmpDir, 'xl/sharedStrings.xml'), 'utf8');
const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
  decode([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
);

const sheetXml = fs.readFileSync(path.join(tmpDir, 'xl/worksheets/sheet1.xml'), 'utf8');
const rows = [];
for (const rowMatch of sheetXml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const cells = {};
  for (const cellMatch of rowMatch[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
    const [, col, attrs, inner] = cellMatch;
    const type = /t="([^"]+)"/.exec(attrs)?.[1];
    let value = '';
    if (type === 's') value = shared[Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1])] ?? '';
    else if (type === 'inlineStr') value = decode(/<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? '');
    else value = decode(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
    if (value.trim() !== '') cells[col] = value.trim();
  }
  rows.push({ index: Number(rowMatch[1]), cells });
}

fs.rmSync(tmpDir, { recursive: true, force: true });

/* ---------------- 定位表头 ---------------- */
const headerRow = rows.find((row) => row.cells.B?.includes('日期') && row.cells.D?.includes('行程'));
if (!headerRow) {
  console.error('未找到表头行（需要包含「日期」「城市」「行程」列）');
  process.exit(1);
}

const cols = {
  day: Object.keys(headerRow.cells).find((key) => headerRow.cells[key].includes('天数')) ?? 'A',
  date: Object.keys(headerRow.cells).find((key) => headerRow.cells[key].includes('日期')) ?? 'B',
  city: Object.keys(headerRow.cells).find((key) => headerRow.cells[key].includes('城市')) ?? 'C',
  plan: Object.keys(headerRow.cells).find((key) => headerRow.cells[key].includes('行程')) ?? 'D',
  expense: Object.keys(headerRow.cells).find((key) => headerRow.cells[key].includes('支出')),
};

/* ---------------- 机票信息 ---------------- */
const flightRow = rows.find((row) => row.cells[cols.day]?.includes('去程'));
const flightOut = flightRow?.cells[cols.date] ?? '';
const flightBack = flightRow?.cells.G ?? '';

/* ---------------- 生成行程安排 ---------------- */
const pad = (n) => String(n).padStart(2, '0');

function parseDate(raw) {
  const match = /(\d{4})\s*[/\-.年]\s*(\d{1,2})\s*[/\-.月]\s*(\d{1,2})/.exec(raw ?? '');
  if (!match) return null;
  return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
}

const timePattern = /^(\d{1,2})[:：](\d{2})/;

function splitPlans(raw) {
  return String(raw ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+\s*[.、．)）]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

const dayRows = rows.filter(
  (row) => row.index > headerRow.index && parseDate(row.cells[cols.date]) && row.cells[cols.plan],
);

const tripId = `trip-${crypto.randomUUID()}`;
const now = new Date().toISOString();
const itineraries = [];
let seq = 0;

for (const row of dayRows) {
  const date = parseDate(row.cells[cols.date]);
  const city = row.cells[cols.city] ?? '';
  const expense = cols.expense ? row.cells[cols.expense] : '';
  const plans = splitPlans(row.cells[cols.plan]);

  plans.forEach((line, lineIndex) => {
    const timeMatch = timePattern.exec(line);
    const time = timeMatch ? `${pad(timeMatch[1])}:${timeMatch[2]}` : '';
    const title = timeMatch ? line.slice(timeMatch[0].length).trim() : line;
    seq += 1;
    const notes = [];
    if (lineIndex === 0 && expense) notes.push(`当日支出：${expense}`);
    itineraries.push({
      id: `imp-${String(seq).padStart(3, '0')}`,
      menuId: tripId,
      date,
      time,
      title: title || line,
      location: city,
      notes: notes.join(' '),
      createdAt: now,
    });
  });
}

const dates = dayRows.map((row) => parseDate(row.cells[cols.date])).sort();

// 出发航班早于行程第 1 天时，单独补一条「出发日」安排（该日不参与第 N 天编号）
const flightOutDate = parseDate(flightOut);
if (flightOutDate && flightOutDate < dates[0]) {
  const flightTime = /(\d{1,2})[:：](\d{2})/.exec(flightOut.replace(/\d{4}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{1,2}/, ''));
  const route = flightOut
    .replace(/\d{4}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{1,2}/, ' ')
    .replace(/\d{1,2}[:：]\d{2}/, ' ')
    .trim();
  itineraries.unshift({
    id: 'imp-flight-out',
    menuId: tripId,
    date: flightOutDate,
    time: flightTime ? `${pad(flightTime[1])}:${flightTime[2]}` : '',
    title: `出发日 · 去程航班：${route}`,
    location: '',
    notes: '建议提前 3 小时到达机场，记得带好护照与签证材料',
    createdAt: now,
  });
}

const startDate = args.start || dates[0];
const cities = [...new Set(dayRows.map((row) => row.cells[cols.city]).filter(Boolean))];

const menu = {
  id: tripId,
  name: args.name || path.basename(xlsxPath).replace(/\.xlsx?$/i, ''),
  type: 'trip',
  icon: args.icon || 'global',
  destination: args.destination || cities.slice(0, 3).join(' · '),
  startDate,
  endDate: args.end || dates[dates.length - 1],
  note: [flightOut && `去程 ${flightOut}`, flightBack && `返程 ${flightBack}`].filter(Boolean).join('；'),
  order: 1,
  createdAt: now,
};

const state = {
  menus: [
    {
      id: 'home',
      name: '首页',
      type: 'home',
      icon: 'home',
      destination: '',
      startDate: '',
      endDate: '',
      note: '',
      order: 0,
      createdAt: now,
    },
    menu,
  ],
  itineraries,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(state, null, 2), 'utf8');

console.log(`已导入：${menu.name}`);
console.log(`  日期区间：${menu.startDate} ~ ${menu.endDate}`);
console.log(`  行程天数：${dayRows.length} 天，安排条目：${itineraries.length} 条`);
console.log(`  写入文件：${outPath}`);
