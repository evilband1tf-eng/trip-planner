import { App as AntApp, Button, ConfigProvider, Result, Skeleton } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { HashRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { AppDataProvider, useAppData } from './store/AppDataProvider';
import { HomePage } from './pages/HomePage';
import { TripPage } from './pages/TripPage';
import { themeConfig } from './theme';

function MenuRoute() {
  const { menuId } = useParams();
  const { menus, ready } = useAppData();
  const navigate = useNavigate();

  if (!ready) {
    return (
      <div className="page">
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  const menu = menus.find((one) => one.id === menuId);
  if (!menu) {
    return (
      <Result
        status="404"
        title="页面不存在"
        subTitle="该行程可能已被删除"
        extra={
          <Button type="primary" onClick={() => navigate('/p/home', { replace: true })}>
            返回首页
          </Button>
        }
      />
    );
  }

  return menu.type === 'home' ? <HomePage /> : <TripPage menu={menu} />;
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      <AntApp>
        <HashRouter>
          <AppDataProvider>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/p/home" replace />} />
                <Route path="/p/:menuId" element={<MenuRoute />} />
                <Route path="*" element={<Navigate to="/p/home" replace />} />
              </Route>
            </Routes>
          </AppDataProvider>
        </HashRouter>
      </AntApp>
    </ConfigProvider>
  );
}
