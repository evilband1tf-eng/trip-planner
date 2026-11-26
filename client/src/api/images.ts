import { useEffect, useState } from 'react';
import { apiRequest } from './client';
import type { ItineraryItem, MenuItem } from '../types';

/**
 * 云端图片按需加载：/state 只带数量标记，图片在展示 / 编辑时单独取。
 * 进程内缓存同一会话只取一次；上传成功后直接写入缓存，省一次往返。
 */

const itemCache = new Map<string, Promise<string[]>>();
const menuCache = new Map<string, Promise<string>>();

function cached<T>(map: Map<string, Promise<T>>, key: string, fetcher: () => Promise<T>): Promise<T> {
  let promise = map.get(key);
  if (!promise) {
    promise = fetcher().catch((error) => {
      map.delete(key);
      throw error;
    });
    map.set(key, promise);
  }
  return promise;
}

export function getItemImages(id: string): Promise<string[]> {
  return cached(itemCache, id, () => apiRequest<string[]>(`/itineraries/${encodeURIComponent(id)}/images`));
}

export function getMenuImage(id: string): Promise<string> {
  return cached(menuCache, id, () => apiRequest<string>(`/menus/${encodeURIComponent(id)}/image`));
}

export function primeItemImages(id: string, images: string[]): void {
  itemCache.set(id, Promise.resolve(images));
}

export function primeMenuImage(id: string, image: string): void {
  menuCache.set(id, Promise.resolve(image));
}

export function dropItemImages(id: string): void {
  itemCache.delete(id);
}

export function dropMenuImage(id: string): void {
  menuCache.delete(id);
}

/** 列表缩略图：有内联图片直接用，否则按 imageCount 异步取 */
export function useItemImages(item: ItineraryItem): string[] {
  const inline = item.images ?? [];
  const [fetched, setFetched] = useState<string[]>([]);
  const needsFetch = inline.length === 0 && (item.imageCount ?? 0) > 0;

  useEffect(() => {
    if (!needsFetch) return undefined;
    let alive = true;
    getItemImages(item.id)
      .then((images) => {
        if (alive) setFetched(images);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.id, needsFetch]);

  return inline.length ? inline : fetched;
}

/** 行程封面：同上 */
export function useMenuImage(menu: MenuItem): string {
  const inline = menu.image || '';
  const [fetched, setFetched] = useState('');
  const needsFetch = !inline && (menu.imageCount ?? 0) > 0;

  useEffect(() => {
    if (!needsFetch) return undefined;
    let alive = true;
    getMenuImage(menu.id)
      .then((image) => {
        if (alive) setFetched(image);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [menu.id, needsFetch]);

  return inline || fetched;
}