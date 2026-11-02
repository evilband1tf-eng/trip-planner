import { Alert, Button, Space } from 'antd';
import { clearCachedUser, clearSnapshot } from '../api/cache';
import { useAppData } from '../store/AppDataProvider';
import { useAuth } from '../store/AuthProvider';

const formatClock = (at: number) => new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

/** 用户主动放弃云端，退回本机示例数据 */
function switchToLocalData() {
  clearCachedUser();
  clearSnapshot();
  window.location.reload();
}

/** 云端连接状态提示条：缓存展示、连接中、连接失败三种情况 */
export function CloudStatusBar() {
  const { offline } = useAuth();
  const { ready, staleAt, failed, mode } = useAppData();

  if (!ready) return null;

  // 本机模式由首页的数据来源标签提示，这里只处理云端相关状态
  if (offline || failed) {
    return (
      <Alert
        type="warning"
        showIcon
        className="cloud-status"
        message="未连接到云端"
        description={
          staleAt
            ? `当前展示 ${formatClock(staleAt)} 同步的数据，此处的修改无法保存到云端。`
            : '云端服务暂时不可用，稍后重试即可。'
        }
        action={
          <Space direction="vertical" size={4}>
            <Button size="small" type="primary" onClick={() => window.location.reload()}>
              重新连接
            </Button>
            <Button size="small" type="text" onClick={switchToLocalData}>
              改用本机数据
            </Button>
          </Space>
        }
      />
    );
  }

  if (staleAt && mode !== 'local') {
    return (
      <Alert
        type="info"
        showIcon
        className="cloud-status"
        message={`正在连接云端，先显示 ${formatClock(staleAt)} 同步的数据…`}
      />
    );
  }

  return null;
}
