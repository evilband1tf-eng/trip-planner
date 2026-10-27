export type MenuType = 'home' | 'trip';

/** 侧边栏菜单项，非首页菜单同时就是一个「行程」 */
export interface MenuItem {
  id: string;
  name: string;
  type: MenuType;
  icon: string;
  destination: string;
  startDate: string;
  endDate: string;
  note: string;
  /** 行程封面图，前端压缩后以 data URL 存储 */
  image: string;
  order: number;
  createdAt: string;
}

/** 行程中的单条安排 */
export interface ItineraryItem {
  id: string;
  menuId: string;
  date: string;
  time: string;
  title: string;
  location: string;
  notes: string;
  /** 安排图片（最多 9 张），前端压缩后以 data URL 存储 */
  images: string[];
  createdAt: string;
}

export interface AppState {
  menus: MenuItem[];
  itineraries: ItineraryItem[];
}

export interface MenuInput {
  name: string;
  icon?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  note?: string;
  image?: string;
}

export interface ItineraryInput {
  menuId: string;
  date: string;
  time?: string;
  title: string;
  location?: string;
  notes?: string;
  images?: string[];
}

/** remote 表示数据存在服务端，local 表示降级到浏览器本地存储 */
export type DataMode = 'remote' | 'local';

/** admin=管理员，editor=可查看编辑，viewer=仅查看 */
export type UserRole = 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  username: string;
  nickname: string;
  role: UserRole;
  createdAt: string;
}

export interface UserInput {
  username: string;
  nickname?: string;
  /** 编辑时留空表示不修改密码 */
  password?: string;
  role: UserRole;
}

/** 修改自己的信息 */
export interface SelfUpdateInput {
  nickname?: string;
  oldPassword?: string;
  newPassword?: string;
}
