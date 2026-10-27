/** 接口基础地址与统一请求封装（含登录 token 注入） */
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '/api';

// 配置了完整地址（线上后端）时，免费实例从休眠中唤醒可能要几十秒，需要更长的探测时间
export const PROBE_TIMEOUT = /^https?:\/\//i.test(API_BASE) ? 25000 : 2500;

const TOKEN_KEY = 'trip-planner:token';

/** 登录态失效时广播，AuthProvider 收到后回到登录页 */
export const AUTH_EXPIRED_EVENT = 'trip-planner:auth-expired';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // 隐私模式下写入失败时忽略，当前会话仍可用
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 忽略
  }
}

interface RequestOptions extends RequestInit {
  /** 登录接口本身不需要因为 401 触发跳登录 */
  skipAuthRedirect?: boolean;
}

export async function apiRequest<T>(path: string, init?: RequestOptions): Promise<T> {
  const { skipAuthRedirect, headers, ...rest } = init ?? {};
  const token = getToken();
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string> | undefined),
  };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    // 避免浏览器用 ETag 缓存返回 304（304 会让 response.ok 为 false）
    cache: 'no-store',
    ...rest,
    headers: finalHeaders,
  });

  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const data = (await response.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      // 响应体不是 JSON 时使用默认提示
    }
    if (response.status === 401 && token && !skipAuthRedirect) {
      clearToken();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
