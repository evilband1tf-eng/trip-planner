import { useState } from 'react';
import { App as AntApp, Form, Input, Modal, Radio } from 'antd';
import { ROLE_META } from '../utils/auth';
import type { User, UserInput, UserRole } from '../types';

interface UserFormModalProps {
  open: boolean;
  /** 传入表示编辑，否则是新建 */
  initial?: User | null;
  onCancel: () => void;
  onSubmit: (values: UserInput) => Promise<boolean>;
}

interface UserFormValues {
  username: string;
  nickname?: string;
  password?: string;
  role: UserRole;
}

const ROLE_OPTIONS: UserRole[] = ['viewer', 'editor', 'admin'];

export function UserFormModal({ open, initial, onCancel, onSubmit }: UserFormModalProps) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<UserFormValues>();
  const [submitting, setSubmitting] = useState(false);

  // 预填依赖挂载时的 initialValues；调用方每次打开都会换 key，
  // 连同 Form.useForm() 实例一起重建，避免读上一次账号的残留值。
  const isEdit = Boolean(initial);

  const handleFinish = async (values: UserFormValues) => {
    const password = values.password?.trim() ?? '';
    if (!isEdit && !password) {
      message.warning('请设置登录密码');
      return;
    }

    setSubmitting(true);
    const ok = await onSubmit({
      username: values.username.trim(),
      nickname: values.nickname?.trim(),
      password: password || undefined,
      role: values.role,
    });
    setSubmitting(false);
    if (ok) onCancel();
  };

  return (
    <Modal
      open={open}
      title={isEdit ? '编辑账号' : '新增账号'}
      okText="保存"
      cancelText="取消"
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnHidden
      centered
    >
      <Form<UserFormValues>
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          username: initial?.username ?? '',
          nickname: initial?.nickname ?? '',
          role: initial?.role ?? 'viewer',
          password: '',
        }}
        onFinish={handleFinish}
      >
        <Form.Item
          name="username"
          label="登录账号"
          rules={[
            { required: true, message: '请填写登录账号' },
            { pattern: /^[A-Za-z0-9_.@-]{3,20}$/, message: '3-20 位字母、数字或 _ . @ -' },
          ]}
        >
          <Input placeholder="用于登录，3-20 位" autoComplete="off" />
        </Form.Item>

        <Form.Item name="nickname" label="昵称" rules={[{ max: 20, message: '昵称不能超过 20 个字符' }]}>
          <Input placeholder="不填则与登录账号相同" />
        </Form.Item>

        <Form.Item
          name="password"
          label={isEdit ? '登录密码（留空表示不修改）' : '登录密码'}
          rules={[
            { required: !isEdit, message: '请设置登录密码' },
            { min: 6, message: '密码至少 6 位' },
          ]}
        >
          <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
        </Form.Item>

        <Form.Item name="role" label="权限">
          <Radio.Group className="role-group">
            {ROLE_OPTIONS.map((role) => (
              <Radio key={role} value={role} disabled={role === 'admin' && initial?.username === 'admin'}>
                <span className="role-option">
                  <span className="role-option-label">{ROLE_META[role].label}</span>
                  <span className="role-option-desc">{ROLE_META[role].description}</span>
                </span>
              </Radio>
            ))}
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  );
}
