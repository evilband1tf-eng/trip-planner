import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { App } from 'antd';
import { getDataSource } from '../api';
import type { DataSource } from '../api/types';
import type { AppState, ItineraryInput, ItineraryItem, MenuInput, MenuItem } from '../types';

interface AppDataValue {
  ready: boolean;
  mode: DataSource['mode'] | null;
  menus: MenuItem[];
  itineraries: ItineraryItem[];
  trips: MenuItem[];
  itemsOf: (menuId: string) => ItineraryItem[];
  createMenu: (input: MenuInput) => Promise<MenuItem | null>;
  updateMenu: (id: string, patch: Partial<MenuInput>) => Promise<boolean>;
  deleteMenu: (id: string) => Promise<boolean>;
  createItinerary: (input: ItineraryInput) => Promise<ItineraryItem | null>;
  updateItinerary: (id: string, patch: Partial<ItineraryInput>) => Promise<boolean>;
  deleteItinerary: (id: string) => Promise<boolean>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

const EMPTY_STATE: AppState = { menus: [], itineraries: [] };

const sortMenus = (menus: MenuItem[]) => [...menus].sort((a, b) => a.order - b.order);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { message } = App.useApp();
  const [source, setSource] = useState<DataSource | null>(null);
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const dataSource = await getDataSource();
        const next = await dataSource.load();
        if (cancelled) return;
        setSource(dataSource);
        setState({ menus: sortMenus(next.menus), itineraries: next.itineraries });
      } catch (error) {
        if (!cancelled) {
          message.error(error instanceof Error ? error.message : '数据加载失败，请刷新页面重试');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [message]);

  const fail = useCallback(
    (error: unknown, fallback: string) => {
      message.error(error instanceof Error ? error.message : fallback);
    },
    [message],
  );

  const createMenu = useCallback(
    async (input: MenuInput) => {
      if (!source) return null;
      try {
        const menu = await source.createMenu(input);
        setState((prev) => ({ ...prev, menus: sortMenus([...prev.menus, menu]) }));
        return menu;
      } catch (error) {
        fail(error, '新建行程失败');
        return null;
      }
    },
    [source, fail],
  );

  const updateMenu = useCallback(
    async (id: string, patch: Partial<MenuInput>) => {
      if (!source) return false;
      try {
        const menu = await source.updateMenu(id, patch);
        setState((prev) => ({
          ...prev,
          menus: sortMenus(prev.menus.map((one) => (one.id === id ? menu : one))),
        }));
        return true;
      } catch (error) {
        fail(error, '保存失败');
        return false;
      }
    },
    [source, fail],
  );

  const deleteMenu = useCallback(
    async (id: string) => {
      if (!source) return false;
      try {
        await source.deleteMenu(id);
        setState((prev) => ({
          menus: prev.menus.filter((menu) => menu.id !== id),
          itineraries: prev.itineraries.filter((item) => item.menuId !== id),
        }));
        return true;
      } catch (error) {
        fail(error, '删除失败');
        return false;
      }
    },
    [source, fail],
  );

  const createItinerary = useCallback(
    async (input: ItineraryInput) => {
      if (!source) return null;
      try {
        const item = await source.createItinerary(input);
        setState((prev) => ({ ...prev, itineraries: [...prev.itineraries, item] }));
        return item;
      } catch (error) {
        fail(error, '添加安排失败');
        return null;
      }
    },
    [source, fail],
  );

  const updateItinerary = useCallback(
    async (id: string, patch: Partial<ItineraryInput>) => {
      if (!source) return false;
      try {
        const item = await source.updateItinerary(id, patch);
        setState((prev) => ({
          ...prev,
          itineraries: prev.itineraries.map((one) => (one.id === id ? item : one)),
        }));
        return true;
      } catch (error) {
        fail(error, '保存失败');
        return false;
      }
    },
    [source, fail],
  );

  const deleteItinerary = useCallback(
    async (id: string) => {
      if (!source) return false;
      try {
        await source.deleteItinerary(id);
        setState((prev) => ({ ...prev, itineraries: prev.itineraries.filter((one) => one.id !== id) }));
        return true;
      } catch (error) {
        fail(error, '删除失败');
        return false;
      }
    },
    [source, fail],
  );

  const itemsOf = useCallback(
    (menuId: string) => state.itineraries.filter((item) => item.menuId === menuId),
    [state.itineraries],
  );

  const trips = useMemo(() => state.menus.filter((menu) => menu.type === 'trip'), [state.menus]);

  const value: AppDataValue = {
    ready,
    mode: source?.mode ?? null,
    menus: state.menus,
    itineraries: state.itineraries,
    trips,
    itemsOf,
    createMenu,
    updateMenu,
    deleteMenu,
    createItinerary,
    updateItinerary,
    deleteItinerary,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData 必须在 AppDataProvider 内部使用');
  return context;
}
