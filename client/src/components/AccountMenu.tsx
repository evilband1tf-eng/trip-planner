import { useState } from 'react';
import { App as AntApp, Avatar, Dropdown, Form, Input, Modal } from 'antd';
import { DownOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthProvider';
import { avatarText, ROLE_META } from '../utils/auth';

interface ProfileForm {
  nickname: string;
  oldPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

interface AccountMenuProps {
  /** 移动端只显示头像 */
  compact?: boolean;
}

export function AccountMenu({ compact = false }: AccountMenuProps) {
  const { user, logout, updateSelf } = useAuth();
  const { message, modal } = AntApp.useApp();
  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileKey, setProfileKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ProfileForm>();

  if (!user) return null;

  const openProfile = () => {
    setProfileKey((value) => value + 1);
    setProfileOpen(true);
  };

  const handleLogout = () => {
    modal.confirm({
      title: '退出登录',
      content: '退出后需要重新输入账号密码才能查看行程。',
      okText: '退出登录',
      cancelText: '取消',
      okButtonProps: { danger: true },
      centered: true,
      onOk: async () => {
        await logout();
        message.success('已退出登录');
        navigate('/p/home', { replace: true });
      },
    });
  };

  const handleProfileSubmit = async (values: ProfileForm) => {
    const newPassword = values.newPassword?.trim() ?? '';
    if (newPassword) {
      if (!values.oldPassword) {
        message.warning('修改密码需要先填写原密码');
        return;
      }
      if (newPassword !== values.confirmPassword) {
        message.warning('两次输入的新密码不一致');
        return;
      }
    }

    setSaving(true);
    try {
      await updateSelf({
        nickname: values.nickname.trim(),
        oldPassword: values.oldPassword,
        newPassword: newPassword || undefined,
      });
      message.success('信息已更新');
      setProfileOpen(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const items = [
    {
      key: 'header',
      label: (
        <div className="account-menu-head">
          <div className="account-menu-name">{user.nickname}</div>
          <div className="account-menu-meta">
            {user.username} · {ROLE_META[user.role].label}
          </div>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    { key: 'profile', icon: <UserOutlined />, label: '修改信息' },
    { type: 'divider' as const },
    { key: 'logout', danger: true, icon: <LogoutOutlined />, label: '退出登录' },
  ];

  return (
    <>
      <Dropdown
        trigger={['hover', 'click']}
        placement="bottomRight"
        menu={{
          items,
          onClick: ({ key }) => {
            if (key === 'profile') openProfile();
            if (key === 'logout') handleLogout();
          },
        }}
      >
        <button type="button" className={`account-trigger${compact ? ' is-compact' : ''}`}>
          <Avatar size={compact ? 28 : 32} className="account-avatar">
            {avatarText(user)}
          </Avatar>
          {!compact && (
            <>
              <span className="account-name">{user.nickname}</span>
              <DownOutlined className="account-caret" />
            </>
          )}
        </button>
      </Dropdown>

      <Modal
        open={profileOpen}
        title="修改信息"
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onCancel={() => setProfileOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
        centered
      >
        <Form<ProfileForm>
          key={profileKey}
          form={form}
          layout="vertical"
          initialValues={{ nickname: user.nickname }}
          onFinish={handleProfileSubmit}
          preserve={false}
        >
          <Form.Item label="登录账号">
            <Input value={user.username} disabled />
          </Form.Item>
          <Form.Item
            name="nickname"
            label="昵称"
            rules={[
              { required: true, message: '请填写昵称' },
              { max: 20, message: '昵称不能超过 20 个字符' },
            ]}
          >
            <Input placeholder="显示在右上角和账号列表里" />
          </Form.Item>

          <div className="form-section-title">修改密码（不修改可留空）</div>
          <Form.Item name="oldPassword" label="原密码">
            <Input.Password placeholder="修改密码时必填" autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ min: 6, message: '密码至少 6 位' }]}>
            <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码">
            <Input.Password placeholder="再输入一次新密码" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
