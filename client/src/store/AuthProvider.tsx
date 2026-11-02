import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getDataSource } from '../api';
import { AUTH_EXPIRED_EVENT, ApiError, clearToken, getToken } from '../api/client';
import { clearCachedUser, readCachedUser, writeCachedUser } from '../api/cache';
import * as authApi from '../api/auth';
import type { SelfUpdateInput, User } from '../types';

/** 后端不可用（静态托管兜底）时使用的本机身份，本机数据仅存在浏览器里 */
const LOCAL_USER: User = {
  id: 'local-admin',
  username: 'local',
  nickname: '本机用户',
  role: 'admin',
  createdAt: '',
};

interface AuthValue {
  ready: boolean;
  user: User | null;
  isAdmin: boolean;
  /** 能否修改行程：管理员与「可查看编辑」账号 */
  canEdit: boolean;
  /** 是否跑在服务端存储模式（否则是纯前端兜底） */
  remote: boolean;
  /** 云端暂时不可达，正以缓存的云端身份展示上次同步的数据 */
  offline: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateSelf: (input: SelfUpdateInput) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // 命中过云端的设备：先用缓存身份直接渲染，避免每次打开都卡在探测上
  const cachedUser = useRef(readCachedUser()).current;
  const optimisticUser = cachedUser && getToken() ? cachedUser : null;

  const [ready, setReady] = useState(Boolean(optimisticUser));
  const [user, setUser] = useState<User | null>(optimisticUser);
  const [remote, setRemote] = useState(true);
  const [offline, setOffline] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    (async () => {
      // 接口探测失败但本设备曾连过云端时，不退成本机数据，而是等重试或让用户手动切换
      const fallbackToCache = () => {
        const cached = readCachedUser();
        if (!cached || !getToken()) return false;
        setRemote(true);
        setOffline(true);
        setUser(cached);
        return true;
      };

      try {
        const source = await getDataSource();
        if (!mounted.current) return;

        if (source.mode === 'local') {
          if (fallbackToCache()) return;
          // 没有后端时不做登录校验，直接以本机管理员身份使用浏览器本地数据
          setRemote(false);
          setUser(LOCAL_USER);
          return;
        }

        setRemote(true);
        setOffline(false);
        const current = await authApi.fetchMe();
        if (!mounted.current) return;
        if (!current) {
          clearCachedUser();
          setUser(null);
          return;
        }
        setUser(current);
        writeCachedUser(current);
      } catch (error) {
        console.warn('[trip-planner] 登录状态检查失败', error);
        if (!mounted.current) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          clearCachedUser();
          setUser(null);
          return;
        }
        fallbackToCache();
      } finally {
        if (mounted.current) setReady(true);
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, []);

  // token 失效（接口返回 401）时退回登录页
  useEffect(() => {
    const handleExpired = () => {
      clearCachedUser();
      setUser(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const next = await authApi.login(username, password);
    writeCachedUser(next);
    setUser(next);
    setOffline(false);
  }, []);

  const logout = useCallback(async () => {
    if (remote) await authApi.logout();
    clearToken();
    clearCachedUser();
    setUser(null);
  }, [remote]);

  const updateSelf = useCallback(async (input: SelfUpdateInput) => {
    const next = await authApi.updateSelf(input);
    writeCachedUser(next);
    setUser(next);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      user,
      isAdmin: user?.role === 'admin',
      canEdit: user?.role === 'admin' || user?.role === 'editor',
      remote,
      offline,
      login,
      logout,
      updateSelf,
    }),
    [ready, user, remote, offline, login, logout, updateSelf],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内部使用');
  return context;
}
