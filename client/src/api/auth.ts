import type { SelfUpdateInput, User, UserInput } from '../types';
import { apiRequest, clearToken, getToken, setToken } from './client';

/** 登录（失败时抛出 ApiError，带服务端提示文案） */
export async function login(username: string, password: string): Promise<User> {
  const data = await apiRequest<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    skipAuthRedirect: true,
  });
  setToken(data.token);
  return data.user;
}

/** 用本地保存的 token 换取当前用户；返回 null 表示未登录 / 已失效 */
export async function fetchMe(): Promise<User | null> {
  if (!getToken()) return null;
  try {
    return await apiRequest<User>('/auth/me', { skipAuthRedirect: true });
  } catch {
    clearToken();
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    if (getToken()) await apiRequest<void>('/auth/logout', { method: 'POST' });
  } catch {
    // 退出失败也清掉本地 token，避免卡在已登录状态
  } finally {
    clearToken();
  }
}

export async function updateSelf(input: SelfUpdateInput): Promise<User> {
  return apiRequest<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(input) });
}

export async function listUsers(): Promise<User[]> {
  return apiRequest<User[]>('/users');
}

export async function createUser(input: UserInput): Promise<User> {
  return apiRequest<User>('/users', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateUser(id: string, input: Partial<UserInput>): Promise<User> {
  return apiRequest<User>(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteUser(id: string): Promise<void> {
  return apiRequest<void>(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
