/**
 * 把 Upstash 里的旧版整块数据（trip-planner:state:v1）迁移成
 * Cloudflare Pages Functions 版使用的拆分结构：
 *   - trip-planner:state:v2          文字数据 + 账号 + 会话（不含图片）
 *   - trip-planner:img:v1:i:<id>:<n> 安排图片（逐张）
 *   - trip-planner:img:v1:m:<id>     行程封面
 * 同时把管理员密码从 scrypt 转成 Workers 支持的 PBKDF2。
 *
 * 旧 key 原样保留，迁移失败或想回滚都不受影响；重复运行是幂等的。
 *
 * 用法（凭证从 Render 控制台 Environment 或 Upstash 控制台复制）：
 *   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io \
 *   UPSTASH_REDIS_REST_TOKEN=xxx \
 *   TRIP_ADMIN_PASS=你的管理员密码 \
 *   npm run migrate:cloudflare
 */
import crypto from 'node:crypto';
import readline from 'node:readline';
import { Writable } from 'node:stream';

/** 交互式询问；secret=true 时隐藏输入内容（凭证不进聊天 / shell 历史） */
function ask(question, secret = false) {
  return new Promise((resolve) => {
    const out = new Writable({
      write(chunk, _enc, cb) {
        if (!secret) process.stdout.write(chunk);
        cb();
      },
    });
    process.stdout.write(question);
    const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

/** 容错：剥掉误粘贴的「变量名=」前缀与首尾引号，只留真正的值 */
const unwrap = (value) =>
  String(value)
    .trim()
    .replace(/^[A-Za-z_][A-Za-z0-9_]*=/, '')
    .replace(/^["']|["']$/g, '')
    .trim();

const REDIS_URL = unwrap(process.env.UPSTASH_REDIS_REST_URL || (await ask('Upstash REST URL（形如 https://xxx.upstash.io）: '))).replace(/\/$/, '');
const REDIS_TOKEN = unwrap(process.env.UPSTASH_REDIS_REST_TOKEN || (await ask('Upstash REST TOKEN（隐藏输入）: ', true)));
const ADMIN_PASS = process.env.TRIP_ADMIN_PASS || (await ask('管理员密码（隐藏输入）: ', true));
const SOURCE_KEY = process.env.STATE_KEY || 'trip-planner:state:v1';
const TARGET_KEY = process.env.STATE_KEY_V2 || 'trip-planner:state:v2';

const MAX_ITEM_IMAGES = 9;
const PBKDF2_ITERATIONS = 10000;
const ROLES = ['admin', 'editor', 'viewer'];

if (!REDIS_URL || !REDIS_TOKEN) {
  console.error('缺少 Upstash REST URL / TOKEN。');
  process.exit(1);
}
if (!ADMIN_PASS) {
  console.error('缺少管理员密码。');
  process.exit(1);
}

const TRANSIENT = /terminated|fetch failed|ECONNRESET|ETIMEDOUT|EPIPE|socket|network|aborted/i;

async function redis(command, attempt = 1) {
  try {
    const response = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) throw new Error(`Upstash 请求失败（HTTP ${response.status}）`);
    const data = await response.json();
    if (data?.error) throw new Error(`Upstash 返回错误：${data.error}`);
    return data?.result;
  } catch (error) {
    // 仅网络类抖动重试；Upstash 逻辑错误直接抛出。SET/GET 均幂等，重试安全。
    if (TRANSIENT.test(String(error?.message || error)) && attempt < 5) {
      const wait = attempt * 2000;
      console.warn(`网络抖动（${error.message}），${wait / 1000}s 后重试（${attempt}/4）…`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      return redis(command, attempt + 1);
    }
    throw error;
  }
}

const toHex = (buffer) => Buffer.from(buffer).toString('hex');

function verifyScrypt(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function hashPbkdf2(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(password), salt, PBKDF2_ITERATIONS, 64, 'sha256');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function main() {
  console.log(`读取旧数据：${SOURCE_KEY}`);
  const raw = await redis(['GET', SOURCE_KEY]);
  if (!raw) throw new Error(`Upstash 里没有 ${SOURCE_KEY}，请确认 STATE_KEY 环境变量与 Render 一致`);
  const state = JSON.parse(raw);
  if (!Array.isArray(state.menus) || !Array.isArray(state.itineraries)) {
    throw new Error('旧数据格式不正确（缺少 menus / itineraries 数组）');
  }
  console.log(`旧数据：${state.menus.length} 个菜单 / ${state.itineraries.length} 条安排 / 约 ${(raw.length / 1024 / 1024).toFixed(2)} MB`);

  const commands = [];
  let imageCount = 0;
  let imageChars = 0;

  for (const menu of state.menus) {
    if (typeof menu.order !== 'number') menu.order = 0;
    const cover = typeof menu.image === 'string' && menu.image.startsWith('data:image/') ? menu.image : '';
    menu.imageCount = cover ? 1 : 0;
    menu.image = '';
    if (cover) {
      commands.push(['SET', `trip-planner:img:v1:m:${menu.id}`, JSON.stringify(cover)]);
      imageCount += 1;
      imageChars += cover.length;
    }
  }

  for (const item of state.itineraries) {
    const legacy = typeof item.image === 'string' && item.image ? [item.image] : [];
    const images = (Array.isArray(item.images) ? item.images : legacy)
      .filter((one) => typeof one === 'string' && one.startsWith('data:image/'))
      .slice(0, MAX_ITEM_IMAGES);
    delete item.image;
    item.images = [];
    item.imageCount = images.length;
    if (typeof item.linkName !== 'string') item.linkName = '';
    if (typeof item.linkUrl !== 'string') item.linkUrl = '';
    images.forEach((one, index) => {
      commands.push(['SET', `trip-planner:img:v1:i:${item.id}:${index}`, JSON.stringify(one)]);
      imageCount += 1;
      imageChars += one.length;
    });
  }

  if (!Array.isArray(state.users)) state.users = [];
  const admin = state.users.find((one) => one.username === 'admin');
  if (!admin) throw new Error('旧数据里没有 admin 账号，无法继续');
  if (String(admin.password || '').startsWith('scrypt$')) {
    if (!verifyScrypt(ADMIN_PASS, admin.password)) {
      throw new Error('TRIP_ADMIN_PASS 与线上管理员密码不一致，无法转换加密格式');
    }
    admin.password = hashPbkdf2(ADMIN_PASS);
    console.log('管理员密码已从 scrypt 转换为 PBKDF2');
  } else if (String(admin.password || '').startsWith('pbkdf2$')) {
    console.log('管理员密码已是 PBKDF2 格式，跳过转换');
  } else {
    throw new Error('管理员密码格式无法识别');
  }
  const unconverted = state.users.filter((one) => String(one.password || '').startsWith('scrypt$'));
  if (unconverted.length) {
    console.warn(`注意：还有 ${unconverted.length} 个账号（${unconverted.map((one) => one.username).join('、')}）的密码无法自动转换，`);
    console.warn('迁移后请用管理员在网页「账号管理」里为它们重置密码。');
  }
  state.users.forEach((user) => {
    if (!ROLES.includes(user.role)) user.role = 'viewer';
    if (typeof user.nickname !== 'string' || !user.nickname) user.nickname = user.username;
  });

  if (!Array.isArray(state.sessions)) state.sessions = [];
  const now = Date.now();
  state.sessions = state.sessions.filter((session) => session && session.expiresAt > now);

  console.log(`写入图片 ${imageCount} 张（约 ${(imageChars / 1024 / 1024).toFixed(2)} MB），逐张写入…`);
  for (const command of commands) {
    await redis(command);
  }
  await redis(['SET', TARGET_KEY, JSON.stringify(state)]);
  console.log(`完成：${TARGET_KEY} 已写入（${(JSON.stringify(state).length / 1024).toFixed(1)} KB，不含图片）。`);
  console.log(`旧 key ${SOURCE_KEY} 未改动，确认新后端正常后可自行删除。`);
}

main().catch((error) => {
  console.error(`迁移失败：${error.message}`);
  process.exit(1);
});