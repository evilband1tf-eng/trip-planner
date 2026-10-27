import type { ComponentType, CSSProperties } from 'react';
import {
  CameraOutlined,
  CarryOutOutlined,
  CoffeeOutlined,
  CompassOutlined,
  EnvironmentOutlined,
  FlagOutlined,
  GiftOutlined,
  GlobalOutlined,
  HomeOutlined,
  SendOutlined,
  WalletOutlined,
} from '@ant-design/icons';

export interface MenuIconOption {
  value: string;
  label: string;
  Component: ComponentType<{ className?: string; style?: CSSProperties }>;
}

/** 新建 / 编辑行程时可选的图标 */
export const MENU_ICON_OPTIONS: MenuIconOption[] = [
  { value: 'compass', label: '旅程', Component: CompassOutlined },
  { value: 'camera', label: '景点', Component: CameraOutlined },
  { value: 'flag', label: '计划', Component: FlagOutlined },
  { value: 'carry', label: '美食', Component: CarryOutOutlined },
  { value: 'send', label: '交通', Component: SendOutlined },
  { value: 'environment', label: '目的地', Component: EnvironmentOutlined },
  { value: 'gift', label: '购物', Component: GiftOutlined },
  { value: 'coffee', label: '休闲', Component: CoffeeOutlined },
  { value: 'wallet', label: '预算', Component: WalletOutlined },
  { value: 'global', label: '出境', Component: GlobalOutlined },
];

const ICON_MAP: Record<string, MenuIconOption['Component']> = {
  home: HomeOutlined,
  ...Object.fromEntries(MENU_ICON_OPTIONS.map((option) => [option.value, option.Component])),
};

interface MenuIconProps {
  name?: string;
  className?: string;
  style?: CSSProperties;
}

export function MenuIcon({ name, className, style }: MenuIconProps) {
  const Component = (name && ICON_MAP[name]) || CompassOutlined;
  return <Component className={className} style={style} />;
}
