import type { User, UserRole } from '../types';

export const ROLE_META: Record<UserRole, { label: string; color: string; description: string }> = {
  admin: { label: '管理员', color: 'gold', description: '可管理所有账号，拥有全部编辑权限' },
  editor: { label: '可查看编辑', color: 'blue', description: '可以查看，也可以新增 / 修改行程' },
  viewer: { label: '仅查看', color: 'default', description: '只能查看行程，不能做任何修改' },
};

/** 头像里显示的字：优先昵称首字 */
export function avatarText(user: User): string {
  const source = (user.nickname || user.username || '?').trim();
  return source.slice(0, 1).toUpperCase();
}
