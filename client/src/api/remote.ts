import type { AppState, ItineraryInput, ItineraryItem, MenuInput, MenuItem } from '../types';
import type { DataSource } from './types';
import { apiRequest } from './client';

export function createRemoteSource(): DataSource {
  return {
    mode: 'remote',
    load: () => apiRequest<AppState>('/state'),
    createMenu: (input: MenuInput) =>
      apiRequest<MenuItem>('/menus', { method: 'POST', body: JSON.stringify(input) }),
    updateMenu: (id: string, patch: Partial<MenuInput>) =>
      apiRequest<MenuItem>(`/menus/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    deleteMenu: (id: string) => apiRequest<void>(`/menus/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    createItinerary: (input: ItineraryInput) =>
      apiRequest<ItineraryItem>('/itineraries', { method: 'POST', body: JSON.stringify(input) }),
    updateItinerary: (id: string, patch: Partial<ItineraryInput>) =>
      apiRequest<ItineraryItem>(`/itineraries/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    deleteItinerary: (id: string) =>
      apiRequest<void>(`/itineraries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };
}
