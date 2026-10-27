import type { AppState, ItineraryItem, MenuInput, MenuItem } from '../types';
import type { DataSource } from './types';
import { createId, createSeedState } from './seed';
import { cleanImages } from '../utils/image';

const STORAGE_KEY = 'trip-planner:state:v1';

const nowISO = () => new Date().toISOString();
const text = (value?: string) => (value ?? '').trim();

function readState(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalize(createSeedState());
    return normalize(JSON.parse(raw) as AppState);
  } catch {
    return normalize(createSeedState());
  }
}

function normalize(state: AppState): AppState {
  const menus = (Array.isArray(state.menus) ? state.menus : []).map((menu) =>
    typeof menu.image === 'string' ? menu : { ...menu, image: '' },
  );
  if (!menus.some((menu) => menu.id === 'home')) {
    menus.unshift({
      id: 'home',
      name: '首页',
      type: 'home',
      icon: 'home',
      destination: '',
      startDate: '',
      endDate: '',
      note: '',
      image: '',
      order: 0,
      createdAt: nowISO(),
    });
  }
  return {
    menus: [...menus].sort((a, b) => a.order - b.order),
    itineraries: Array.isArray(state.itineraries)
      ? state.itineraries.map((item) => {
          // 兼容早期只有单张 image 的数据
          const { image: legacyImage, ...rest } = item as ItineraryItem & { image?: string };
          return { ...rest, images: cleanImages(item.images ?? (legacyImage ? [legacyImage] : [])) };
        })
      : [],
  };
}

function writeState(state: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 忽略隐私模式下写入失败的异常
  }
}

export function createLocalSource(): DataSource {
  let state = readState();
  writeState(state);

  return {
    mode: 'local',
    async load() {
      state = readState();
      return state;
    },
    async createMenu(input) {
      const maxOrder = state.menus.reduce((max, menu) => Math.max(max, menu.order), 0);
      const menu: MenuItem = {
        id: createId('menu'),
        name: text(input.name),
        type: 'trip',
        icon: input.icon || 'compass',
        destination: text(input.destination),
        startDate: text(input.startDate),
        endDate: text(input.endDate),
        note: text(input.note),
        image: text(input.image),
        order: maxOrder + 1,
        createdAt: nowISO(),
      };
      state = { ...state, menus: [...state.menus, menu] };
      writeState(state);
      return menu;
    },
    async updateMenu(id, patch) {
      const target = state.menus.find((menu) => menu.id === id);
      if (!target) throw new Error('菜单不存在');
      const next: MenuItem = {
        ...target,
        ...Object.fromEntries(
          ['name', 'icon', 'destination', 'startDate', 'endDate', 'note', 'image']
            .filter((key) => patch[key as keyof MenuInput] !== undefined)
            .map((key) => [key, text(patch[key as keyof MenuInput])]),
        ),
      };
      state = { ...state, menus: state.menus.map((menu) => (menu.id === id ? next : menu)) };
      writeState(state);
      return next;
    },
    async deleteMenu(id) {
      if (id === 'home') throw new Error('首页菜单不可删除');
      state = {
        menus: state.menus.filter((menu) => menu.id !== id),
        itineraries: state.itineraries.filter((item) => item.menuId !== id),
      };
      writeState(state);
    },
    async createItinerary(input) {
      const item: ItineraryItem = {
        id: createId('item'),
        menuId: input.menuId,
        date: text(input.date),
        time: text(input.time),
        title: text(input.title),
        location: text(input.location),
        notes: text(input.notes),
        images: cleanImages(input.images),
        createdAt: nowISO(),
      };
      state = { ...state, itineraries: [...state.itineraries, item] };
      writeState(state);
      return item;
    },
    async updateItinerary(id, patch) {
      const target = state.itineraries.find((item) => item.id === id);
      if (!target) throw new Error('行程安排不存在');
      const textFields = ['date', 'time', 'title', 'location', 'notes'] as const;
      const next: ItineraryItem = {
        ...target,
        ...Object.fromEntries(
          textFields.filter((key) => patch[key] !== undefined).map((key) => [key, text(patch[key])]),
        ),
        images: patch.images === undefined ? target.images : cleanImages(patch.images),
      };
      state = {
        ...state,
        itineraries: state.itineraries.map((item) => (item.id === id ? next : item)),
      };
      writeState(state);
      return next;
    },
    async deleteItinerary(id) {
      state = { ...state, itineraries: state.itineraries.filter((item) => item.id !== id) };
      writeState(state);
    },
  };
}
