import crypto from 'node:crypto';

/** scrypt 参数：单次派生 64 字节，够用且计算量适中 */
const KEY_LENGTH = 64;

export const ROLES = ['admin', 'editor', 'viewer'];

/** 会话有效期：30 天 */
export const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

/** 生成「scrypt$盐$散列」格式的密码串，不保存明文 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;

  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(password), salt, KEY_LENGTH);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export const createToken = () => crypto.randomBytes(32).toString('hex');
