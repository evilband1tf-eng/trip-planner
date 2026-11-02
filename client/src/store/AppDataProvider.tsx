import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { App } from 'antd';
import { getDataSource } from '../api';
import { readSnapshot, writeSnapshot } from '../api/cache';
import { useAuth } from './AuthProvider';
import type { DataSource } from '../api/types';
import type { AppState, ItineraryInput, ItineraryItem, MenuInput, MenuItem } from '../types';

interface AppDataValue {
  ready: boolean;
  mode: DataSource['mode'] | null;
  /** 当前展示的是缓存快照的时间戳；拿到新数据后为 null */
  staleAt: number | null;
  /** 本次加载云端数据失败 */
  failed: boolean;
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
  const { offline } = useAuth();
  const [source, setSource] = useState<DataSource | null>(null);
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // 先用上次缓存的数据秒开，再在后台取最新数据
    const cached = readSnapshot();
    if (cached) {
      setState({ menus: sortMenus(cached.state.menus), itineraries: cached.state.itineraries });
      setStaleAt(cached.at);
      setReady(true);
    }

    // 云端不可达时保持只读展示缓存，不再退回本机示例数据
    if (offline) {
      setFailed(true);
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const dataSource = await getDataSource();
        const next = await dataSource.load();
        if (cancelled) return;
        setSource(dataSource);
        setState({ menus: sortMenus(next.menus), itineraries: next.itineraries });
        setStaleAt(null);
        setFailed(false);
      } catch (error) {
        if (!cancelled) {
          setFailed(true);
          message.error(error instanceof Error ? error.message : '数据加载失败，请刷新页面重试');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [message, offline]);

  // 数据变化后写回缓存，供下次冷启动先用（本机模式不缓存）
  useEffect(() => {
    if (!ready || offline || source?.mode !== 'remote') return undefined;
    const timer = window.setTimeout(() => writeSnapshot(state), 800);
    return () => window.clearTimeout(timer);
  }, [state, ready, offline, source]);

  const fail = useCallback(
    (error: unknown, fallback: string) => {
      message.error(error instanceof Error ? error.message : fallback);
    },
    [message],
  );

  const notReady = useCallback(() => {
    message.warning('云端未连接，暂时无法保存修改');
  }, [message]);

  const createMenu = useCallback(
    async (input: MenuInput) => {
      if (!source) {
        notReady();
        return null;
      }
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
      if (!source) {
        notReady();
        return false;
      }
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
      if (!source) {
        notReady();
        return false;
      }
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
      if (!source) {
        notReady();
        return null;
      }
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
      if (!source) {
        notReady();
        return false;
      }
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
      if (!source) {
        notReady();
        return false;
      }
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
    staleAt,
    failed,
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
