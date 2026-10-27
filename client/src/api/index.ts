import type { DataSource } from './types';
import { createLocalSource } from './local';
import { createRemoteSource } from './remote';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '/api';
const FORCE_MODE = (import.meta.env.VITE_DATA_MODE as string | undefined) || '';

// 配置了完整地址（线上后端）时，免费实例从休眠中唤醒可能要几十秒，需要更长的探测时间
const PROBE_TIMEOUT = /^https?:\/\//i.test(API_BASE) ? 25000 : 2500;

let sourcePromise: Promise<DataSource> | null = null;

/**
 * 探测服务端是否可用：
 * - 本地开发 / 自建服务（npm run dev 或 npm start）：使用服务端 JSON 数据库
 * - 静态托管（如 GitHub Pages）：自动降级为浏览器本地存储，站点无需后端也能用
 */
async function probeRemote(): Promise<boolean> {
  if (FORCE_MODE === 'local') return false;
  if (FORCE_MODE === 'remote') return true;

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT);
    const response = await fetch(`${API_BASE}/health`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    window.clearTimeout(timer);
    if (!response.ok) {
      console.warn(`[trip-planner] 接口不可用（HTTP ${response.status}），已退回本地存储：${API_BASE}/health`);
      return false;
    }
    const data = (await response.json()) as { ok?: boolean };
    const healthy = data?.ok === true;
    if (!healthy) console.warn('[trip-planner] 健康检查未通过，已退回本地存储', data);
    return healthy;
  } catch (error) {
    console.warn(`[trip-planner] 接口探测失败，已退回本地存储：${API_BASE}/health`, error);
    return false;
  }
}

export function getDataSource(): Promise<DataSource> {
  if (!sourcePromise) {
    sourcePromise = (async () => {
      const remoteAvailable = await probeRemote();
      return remoteAvailable ? createRemoteSource(API_BASE) : createLocalSource();
    })();
  }
  return sourcePromise;
}
