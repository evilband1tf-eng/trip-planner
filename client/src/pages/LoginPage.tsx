import { useState } from 'react';
import { Alert, App as AntApp, Button, Card, Form, Input } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthProvider';

interface LoginForm {
  username: string;
  password: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const { message } = AntApp.useApp();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFinish = async (values: LoginForm) => {
    setLoading(true);
    setError('');
    try {
      await login(values.username.trim(), values.password);
      message.success('登录成功');
      navigate('/p/home', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="login-brand-title">行程规划</div>
        <p className="login-brand-desc">把每一次出发，都提前安排好</p>
      </div>

      <Card className="login-card" variant="borderless">
        <h1 className="login-title">登录</h1>
        <p className="login-subtitle">请使用管理员分配的账号登录</p>

        {error && <Alert type="error" showIcon message={error} className="login-error" />}

        <Form<LoginForm> layout="vertical" size="large" onFinish={handleFinish} requiredMark={false}>
          <Form.Item
            name="username"
            label="登录账号"
            rules={[{ required: true, message: '请输入登录账号' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="请输入账号" autoComplete="username" allowClear />
          </Form.Item>

          <Form.Item
            name="password"
            label="登录密码"
            rules={[{ required: true, message: '请输入登录密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
          </Form.Item>

          <Button type="primary" htmlType="submit" block loading={loading} className="login-submit">
            登录
          </Button>
        </Form>

        <p className="login-tip">没有账号？请联系管理员为你开通，或使用管理员账号登录后台创建。</p>
      </Card>
    </div>
  );
}
