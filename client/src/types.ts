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
  /** 安排图片，前端压缩后以 data URL 存储 */
  image: string;
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
  image?: string;
}

/** remote 表示数据存在服务端，local 表示降级到浏览器本地存储 */
export type DataMode = 'remote' | 'local';
