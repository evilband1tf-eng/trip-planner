import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getDataSource } from '../api';
import { AUTH_EXPIRED_EVENT, clearToken } from '../api/client';
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
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateSelf: (input: SelfUpdateInput) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [remote, setRemote] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    (async () => {
      try {
        const source = await getDataSource();
        if (!mounted.current) return;

        if (source.mode === 'local') {
          // 没有后端时不做登录校验，直接以本机管理员身份使用浏览器本地数据
          setRemote(false);
          setUser(LOCAL_USER);
          return;
        }

        setRemote(true);
        const current = await authApi.fetchMe();
        if (mounted.current) setUser(current);
      } catch (error) {
        console.warn('[trip-planner] 登录状态检查失败', error);
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
    const handleExpired = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const next = await authApi.login(username, password);
    setUser(next);
  }, []);

  const logout = useCallback(async () => {
    if (remote) await authApi.logout();
    clearToken();
    setUser(null);
  }, [remote]);

  const updateSelf = useCallback(async (input: SelfUpdateInput) => {
    const next = await authApi.updateSelf(input);
    setUser(next);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      user,
      isAdmin: user?.role === 'admin',
      canEdit: user?.role === 'admin' || user?.role === 'editor',
      remote,
      login,
      logout,
      updateSelf,
    }),
    [ready, user, remote, login, logout, updateSelf],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内部使用');
  return context;
}
