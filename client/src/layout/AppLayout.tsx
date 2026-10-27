import { useState } from 'react';
import { Alert, App as AntApp, Button, Drawer, Layout } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SideMenu } from './SideMenu';
import { AccountMenu } from '../components/AccountMenu';
import { TripFormModal } from '../components/TripFormModal';
import { useAppData } from '../store/AppDataProvider';
import { useAuth } from '../store/AuthProvider';
import { useIsMobile } from '../hooks/useIsMobile';
import type { MenuInput, MenuItem } from '../types';

const { Content, Sider } = Layout;

const SIDER_WIDTH = 264;
const SIDER_COLLAPSED_WIDTH = 76;

export function AppLayout() {
  const { menus, createMenu, deleteMenu } = useAppData();
  const { canEdit } = useAuth();
  const { message, modal } = AntApp.useApp();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const activeMenu = menus.find((menu) => `/p/${menu.id}` === location.pathname);
  const pageTitle =
    location.pathname === '/accounts' ? '账号管理' : (activeMenu?.name ?? '行程规划');

  const handleToggleDeleteMode = () => {
    if (!canEdit) return;
    if (deleteMode) {
      setDeleteMode(false);
      return;
    }
    setDeleteMode(true);
    if (isMobile) {
      setDrawerOpen(true);
    } else {
      setCollapsed(false);
    }
    message.info('已进入删除模式，点击菜单右侧的垃圾桶图标即可删除');
  };

  const handleRequestDelete = (menu: MenuItem) => {
    modal.confirm({
      title: `确认删除「${menu.name}」？`,
      content: '该行程下的所有安排都会一并删除，且无法恢复。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      centered: true,
      onOk: async () => {
        const ok = await deleteMenu(menu.id);
        if (!ok) return;
        message.success(`已删除「${menu.name}」`);
        if (location.pathname === `/p/${menu.id}`) navigate('/p/home', { replace: true });
      },
    });
  };

  const handleCreateSubmit = async (values: MenuInput) => {
    const menu = await createMenu(values);
    if (!menu) return false;
    message.success('行程已创建');
    setDrawerOpen(false);
    navigate(`/p/${menu.id}`);
    return true;
  };

  const sideMenu = (mobile: boolean) => (
    <SideMenu
      collapsed={mobile ? false : collapsed}
      mobile={mobile}
      onToggle={() => (mobile ? setDrawerOpen(false) : setCollapsed((value) => !value))}
      deleteMode={deleteMode}
      onToggleDeleteMode={handleToggleDeleteMode}
      onAdd={() => setCreateOpen(true)}
      onRequestDelete={handleRequestDelete}
      onNavigate={mobile ? () => setDrawerOpen(false) : undefined}
    />
  );

  return (
    <Layout className="app-shell">
      {isMobile ? (
        <>
          <div className="app-mobile-header">
            <Button
              type="text"
              className="app-mobile-trigger"
              aria-label="打开菜单"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
            />
            <span className="app-mobile-title">{pageTitle}</span>
            <AccountMenu compact />
          </div>

          <Drawer
            placement="left"
            width={288}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            closable={false}
            className="app-drawer"
            styles={{ body: { padding: 0 } }}
          >
            {sideMenu(true)}
          </Drawer>
        </>
      ) : (
        <Sider
          theme="light"
          className="app-sider"
          width={SIDER_WIDTH}
          collapsedWidth={SIDER_COLLAPSED_WIDTH}
          collapsed={collapsed}
          trigger={null}
        >
          {sideMenu(false)}
        </Sider>
      )}

      <Layout className="app-main">
        {!isMobile && (
          <div className="app-topbar">
            <span className="app-topbar-title">{pageTitle}</span>
            <AccountMenu />
          </div>
        )}

        <Content className="app-content">
          {deleteMode && (
            <Alert
              type="warning"
              showIcon
              closable
              className="app-delete-alert"
              message="删除模式：点击菜单右侧的垃圾桶图标即可删除对应行程"
              onClose={() => setDeleteMode(false)}
            />
          )}
          <Outlet />
        </Content>
      </Layout>

      {canEdit && (
        <TripFormModal
          open={createOpen}
          title="新建行程"
          onCancel={() => setCreateOpen(false)}
          onSubmit={handleCreateSubmit}
        />
      )}
    </Layout>
  );
}
