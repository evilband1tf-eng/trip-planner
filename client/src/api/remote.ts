import type { AppState, ItineraryInput, ItineraryItem, MenuInput, MenuItem } from '../types';
import type { DataSource } from './types';

async function request<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const data = (await response.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      // 响应体不是 JSON 时使用默认提示
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function createRemoteSource(base: string): DataSource {
  return {
    mode: 'remote',
    load: () => request<AppState>(base, '/state'),
    createMenu: (input: MenuInput) =>
      request<MenuItem>(base, '/menus', { method: 'POST', body: JSON.stringify(input) }),
    updateMenu: (id: string, patch: Partial<MenuInput>) =>
      request<MenuItem>(base, `/menus/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    deleteMenu: (id: string) =>
      request<void>(base, `/menus/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    createItinerary: (input: ItineraryInput) =>
      request<ItineraryItem>(base, '/itineraries', { method: 'POST', body: JSON.stringify(input) }),
    updateItinerary: (id: string, patch: Partial<ItineraryInput>) =>
      request<ItineraryItem>(base, `/itineraries/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    deleteItinerary: (id: string) =>
      request<void>(base, `/itineraries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };
}
