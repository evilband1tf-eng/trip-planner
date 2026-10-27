import type { AppState, ItineraryInput, ItineraryItem, MenuInput, MenuItem } from '../types';

/** 数据源抽象：服务端 API 与浏览器本地存储实现同一套接口 */
export interface DataSource {
  mode: 'remote' | 'local';
  load(): Promise<AppState>;
  createMenu(input: MenuInput): Promise<MenuItem>;
  updateMenu(id: string, patch: Partial<MenuInput>): Promise<MenuItem>;
  deleteMenu(id: string): Promise<void>;
  createItinerary(input: ItineraryInput): Promise<ItineraryItem>;
  updateItinerary(id: string, patch: Partial<ItineraryInput>): Promise<ItineraryItem>;
  deleteItinerary(id: string): Promise<void>;
}
