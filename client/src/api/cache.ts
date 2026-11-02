import type { AppState, User } from '../types';

/**
 * 浏览器侧缓存：让冷启动时先渲染上次同步的数据，而不是干等接口。
 * 只缓存云端数据，本机模式的示例数据不入缓存，避免下次被误当成云端数据。
 */

const SNAPSHOT_KEY = 'trip-planner:snapshot';
const USER_KEY = 'trip-planner:last-user';

// localStorage 一般只有 5MB，留出余量；图片是 data URL，体积很大
const MAX_SNAPSHOT_CHARS = 2 * 1024 * 1024;

export interface CachedSnapshot {
  at: number;
  state: AppState;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 隐私模式下写入失败时忽略
  }
}

/** 读取上次成功加载的云端数据快照 */
export function readSnapshot(): CachedSnapshot | null {
  const cached = readJson<CachedSnapshot>(SNAPSHOT_KEY);
  if (!cached || typeof cached.at !== 'number' || !cached.state) return null;
  if (!Array.isArray(cached.state.menus) || !Array.isArray(cached.state.itineraries)) return null;
  return cached;
}

/** 缓存云端数据；超过容量时剥离图片再存，避免写满 localStorage */
export function writeSnapshot(state: AppState): void {
  const at = Date.now();
  if (JSON.stringify({ at, state }).length <= MAX_SNAPSHOT_CHARS && writeJson(SNAPSHOT_KEY, { at, state })) {
    return;
  }
  const slim: AppState = {
    ...state,
    itineraries: state.itineraries.map((one) => ({ ...one, images: [] })),
  };
  writeJson(SNAPSHOT_KEY, { at, state: slim });
}

export function clearSnapshot(): void {
  remove(SNAPSHOT_KEY);
}

/** 记住最近一次校验通过的云端身份，冷启动时先按它渲染 */
export function readCachedUser(): User | null {
  const user = readJson<User>(USER_KEY);
  if (!user || typeof user.id !== 'string' || typeof user.role !== 'string') return null;
  return user;
}

export function writeCachedUser(user: User): void {
  writeJson(USER_KEY, user);
}

export function clearCachedUser(): void {
  remove(USER_KEY);
}
