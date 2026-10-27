import type { DataSource } from './types';
import { API_BASE, PROBE_TIMEOUT } from './client';
import { createLocalSource } from './local';
import { createRemoteSource } from './remote';

const FORCE_MODE = (import.meta.env.VITE_DATA_MODE as string | undefined) || '';

let sourcePromise: Promise<DataSource> | null = null;

/**
 * 探测服务端是否可用：
 * - 本地开发 / 自建服务（npm run dev 或 npm start）：使用服务端数据库
 * - 静态托管（如 GitHub Pages，且后端不可达）：自动降级为浏览器本地存储
 * /health 是唯一无需登录的接口，因此可以直接用来探测
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
      return remoteAvailable ? createRemoteSource() : createLocalSource();
    })();
  }
  return sourcePromise;
}
