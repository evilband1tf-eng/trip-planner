import type { ReactNode } from 'react';
import { Button, Menu, Tooltip } from 'antd';
import {
  CloseOutlined,
  DeleteOutlined,
  DownOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppData } from '../store/AppDataProvider';
import { useAuth } from '../store/AuthProvider';
import { MenuIcon } from '../components/MenuIcon';
import type { MenuItem } from '../types';

interface SideMenuProps {
  collapsed: boolean;
  mobile?: boolean;
  onToggle: () => void;
  deleteMode: boolean;
  onToggleDeleteMode: () => void;
  onAdd: () => void;
  onRequestDelete: (menu: MenuItem) => void;
  onNavigate?: () => void;
}

export function SideMenu({
  collapsed,
  mobile = false,
  onToggle,
  deleteMode,
  onToggleDeleteMode,
  onAdd,
  onRequestDelete,
  onNavigate,
}: SideMenuProps) {
  const { menus } = useAppData();
  const { isAdmin, canEdit } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const toggleIcon: ReactNode = mobile ? <CloseOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />;

  const items = [
    ...menus.map((menu) => ({
      key: `/p/${menu.id}`,
      icon: <MenuIcon name={menu.icon} />,
      label: collapsed ? (
        menu.name
      ) : (
        <span className="side-menu-label">
          <span className="side-menu-text">{menu.name}</span>
          {canEdit && deleteMode && menu.type !== 'home' ? (
            <Button
              type="text"
              size="small"
              className="side-menu-delete"
              aria-label={`删除${menu.name}`}
              icon={<DeleteOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onRequestDelete(menu);
              }}
            />
          ) : (
            <DownOutlined className="side-menu-arrow" />
          )}
        </span>
      ),
    })),
    // 账号管理仅管理员可见
    ...(isAdmin
      ? [
          {
            key: '/accounts',
            icon: <TeamOutlined />,
            label: collapsed ? (
              '账号管理'
            ) : (
              <span className="side-menu-label">
                <span className="side-menu-text">账号管理</span>
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="side-menu">
      <div className={`side-menu-top${collapsed ? ' is-collapsed' : ''}`}>
        {!collapsed && <span className="side-menu-brand">行程规划</span>}
        <Tooltip title={mobile ? '收起菜单' : collapsed ? '展开菜单' : '收起菜单'} placement="right">
          <Button type="text" className="side-menu-toggle" aria-label="切换菜单显示" icon={toggleIcon} onClick={onToggle} />
        </Tooltip>
      </div>

      <div className="side-menu-body">
        <Menu
          className="side-menu-nav"
          mode="inline"
          inlineCollapsed={collapsed && !mobile}
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => {
            navigate(key);
            onNavigate?.();
          }}
        />

        {!collapsed && canEdit && (
          <div className="side-menu-tools">
            <Tooltip title="新建行程" placement="right">
              <Button type="text" className="tool-btn" aria-label="新建行程" icon={<PlusOutlined />} onClick={onAdd} />
            </Tooltip>
            <Tooltip title={deleteMode ? '退出删除模式' : '删除行程'} placement="right">
              <Button
                type="text"
                className={`tool-btn${deleteMode ? ' is-danger' : ''}`}
                aria-label={deleteMode ? '退出删除模式' : '删除行程'}
                icon={<DeleteOutlined />}
                onClick={onToggleDeleteMode}
              />
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}
