import type { AppState, ItineraryInput, ItineraryItem, MenuInput, MenuItem } from '../types';
import type { DataSource } from './types';
import { apiRequest } from './client';
import { dropItemImages, dropMenuImage, primeItemImages, primeMenuImage } from './images';

const MAX_ITEM_IMAGES = 9;

const cleanImages = (value: string[] | undefined): string[] =>
  (value ?? []).filter((one) => typeof one === 'string' && one.startsWith('data:image/')).slice(0, MAX_ITEM_IMAGES);

/** 图片逐张以原始文本上传，避免大 JSON 超出 Workers 免费档 CPU 限制 */
async function uploadItemImages(id: string, images: string[]): Promise<void> {
  for (let index = 0; index < images.length; index += 1) {
    await apiRequest(`/images/item/${encodeURIComponent(id)}/${index}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: images[index],
    });
  }
  primeItemImages(id, images);
}

export function createRemoteSource(): DataSource {
  return {
    mode: 'remote',
    load: () => apiRequest<AppState>('/state'),
    createMenu: async (input: MenuInput) => {
      const menu = await apiRequest<MenuItem>('/menus', { method: 'POST', body: JSON.stringify(input) });
      if (menu.image) primeMenuImage(menu.id, menu.image);
      return menu;
    },
    updateMenu: async (id: string, patch: Partial<MenuInput>) => {
      const menu = await apiRequest<MenuItem>(`/menus/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (patch.image !== undefined) primeMenuImage(id, menu.image || '');
      return menu;
    },
    deleteMenu: async (id: string) => {
      await apiRequest<void>(`/menus/${encodeURIComponent(id)}`, { method: 'DELETE' });
      dropMenuImage(id);
    },
    createItinerary: async (input: ItineraryInput) => {
      const images = cleanImages(input.images);
      const item = await apiRequest<ItineraryItem>('/itineraries', {
        method: 'POST',
        body: JSON.stringify({ ...input, images: undefined, imageCount: images.length }),
      });
      await uploadItemImages(item.id, images);
      return { ...item, images };
    },
    updateItinerary: async (id: string, patch: Partial<ItineraryInput>) => {
      if (patch.images === undefined) {
        return apiRequest<ItineraryItem>(`/itineraries/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      }
      const images = cleanImages(patch.images);
      const item = await apiRequest<ItineraryItem>(`/itineraries/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...patch, images: undefined, imageCount: images.length }),
      });
      await uploadItemImages(id, images);
      return { ...item, images };
    },
    deleteItinerary: async (id: string) => {
      await apiRequest<void>(`/itineraries/${encodeURIComponent(id)}`, { method: 'DELETE' });
      dropItemImages(id);
    },
  };
}