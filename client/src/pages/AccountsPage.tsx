import { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Popconfirm, Result, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { createUser, deleteUser, listUsers, updateUser } from '../api/auth';
import { UserFormModal } from '../components/UserFormModal';
import { useAuth } from '../store/AuthProvider';
import { ROLE_META } from '../utils/auth';
import type { User, UserInput } from '../types';

export function AccountsPage() {
  const { user, isAdmin, remote } = useAuth();
  const { message } = AntApp.useApp();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await listUsers());
    } catch (error) {
      message.error(error instanceof Error ? error.message : '账号列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (isAdmin && remote) void reload();
    else setLoading(false);
  }, [isAdmin, remote, reload]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (target: User) => {
    setEditing(target);
    setFormOpen(true);
  };

  const handleSubmit = async (values: UserInput) => {
    try {
      if (editing) {
        await updateUser(editing.id, values);
        message.success(`账号「${values.username}」已更新`);
      } else {
        await createUser(values);
        message.success(`账号「${values.username}」已创建`);
      }
      await reload();
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
      return false;
    }
  };

  const handleDelete = async (target: User) => {
    try {
      await deleteUser(target.id);
      message.success(`账号「${target.username}」已删除`);
      await reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  if (!isAdmin) {
    return (
      <div className="page">
        <Result status="403" title="没有权限" subTitle="账号管理仅对管理员开放。" />
      </div>
    );
  }

  const columns: ColumnsType<User> = [
    {
      title: '登录账号',
      dataIndex: 'username',
      key: 'username',
      render: (value: string, record) => (
        <span className="account-cell">
          <span className="account-cell-name">{value}</span>
          {record.id === user?.id && <Tag color="blue">当前账号</Tag>}
        </span>
      ),
    },
    { title: '昵称', dataIndex: 'nickname', key: 'nickname' },
    {
      title: '权限',
      dataIndex: 'role',
      key: 'role',
      render: (role: User['role']) => <Tag color={ROLE_META[role].color}>{ROLE_META[role].label}</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      responsive: ['md'],
      render: (value: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, record) => {
        const isBuiltinAdmin = record.username === 'admin';
        const isSelf = record.id === user?.id;
        return (
          <span className="account-actions">
            <Tooltip title="编辑">
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
            </Tooltip>
            <Popconfirm
              title={`删除账号「${record.username}」？`}
              description="删除后该账号将无法登录，已登录的会话也会失效。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              disabled={isBuiltinAdmin || isSelf}
              onConfirm={() => handleDelete(record)}
            >
              <Tooltip title={isBuiltinAdmin ? '内置管理员不可删除' : isSelf ? '不能删除当前登录的账号' : '删除'}>
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={isBuiltinAdmin || isSelf}
                />
              </Tooltip>
            </Popconfirm>
          </span>
        );
      },
    },
  ];

  return (
    <div className="page accounts-page">
      <Card>
        <div className="accounts-head">
          <div>
            <h1 className="accounts-title">账号管理</h1>
            <p className="accounts-desc">
              这里创建的是可以登录本站的账号。「仅查看」只能浏览行程，「可查看编辑」可以修改行程。
            </p>
          </div>
          <div className="accounts-tools">
            <Button icon={<ReloadOutlined />} onClick={() => void reload()} loading={loading}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增账号
            </Button>
          </div>
        </div>

        {!remote && (
          <Alert
            type="warning"
            showIcon
            className="accounts-alert"
            message="当前是本地模式（未连接服务端），账号数据只存在这台设备的浏览器里。"
          />
        )}

        <Table<User>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={users}
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <UserFormModal
        open={formOpen}
        initial={editing}
        onCancel={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
