import { useMemo, useState } from 'react';
import { Col, DatePicker, Form, Input, Modal, Row } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { MenuInput, MenuItem } from '../types';
import { IconPicker } from './IconPicker';
import { ImagePicker } from './ImagePicker';

interface TripFormValues {
  name: string;
  icon: string;
  destination?: string;
  dates?: [Dayjs, Dayjs];
  note?: string;
  image?: string;
}

interface TripFormModalProps {
  open: boolean;
  title: string;
  initial?: MenuItem | null;
  onCancel: () => void;
  /** 返回 true 表示保存成功，弹窗会自动关闭 */
  onSubmit: (values: MenuInput) => Promise<boolean>;
}

export function TripFormModal({ open, title, initial, onCancel, onSubmit }: TripFormModalProps) {
  const [form] = Form.useForm<TripFormValues>();
  const [saving, setSaving] = useState(false);

  // 预填依赖挂载时的 initialValues；调用方每次打开都会换 key，
  // 连同 Form.useForm() 实例一起重建，才不会读到上一次的残留值。
  const initialValues = useMemo<TripFormValues>(() => {
    if (initial) {
      return {
        name: initial.name,
        icon: initial.icon || 'compass',
        destination: initial.destination,
        note: initial.note,
        dates: initial.startDate
          ? [dayjs(initial.startDate), dayjs(initial.endDate || initial.startDate)]
          : undefined,
        image: initial.image || '',
      };
    }
    return { name: '', icon: 'compass', destination: '', note: '', dates: undefined, image: '' };
  }, [initial]);

  const handleOk = async () => {
    let values: TripFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    const [start, end] = values.dates ?? [];
    setSaving(true);
    const ok = await onSubmit({
      name: values.name.trim(),
      icon: values.icon,
      destination: values.destination?.trim() ?? '',
      startDate: start ? start.format('YYYY-MM-DD') : '',
      endDate: end ? end.format('YYYY-MM-DD') : '',
      note: values.note?.trim() ?? '',
      image: values.image ?? '',
    });
    setSaving(false);
    if (ok) onCancel();
  };

  return (
    <Modal
      open={open}
      title={title}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onCancel}
      destroyOnHidden
      maskClosable={!saving}
      width={520}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        className="form-compact"
        initialValues={initialValues}
      >
        <Form.Item
          name="name"
          label="行程名称"
          rules={[{ required: true, message: '请输入行程名称' }, { max: 30, message: '最多 30 个字符' }]}
        >
          <Input placeholder="例如：京都赏枫五日游" maxLength={30} allowClear />
        </Form.Item>

        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="destination" label="目的地">
              <Input placeholder="例如：日本 · 京都" maxLength={40} allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="dates" label="出发日期">
              <DatePicker.RangePicker style={{ width: '100%' }} allowEmpty={[true, true]} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="icon" label="菜单图标">
          <IconPicker />
        </Form.Item>

        <Form.Item name="image" label="行程图片">
          <ImagePicker />
        </Form.Item>

        <Form.Item name="note" label="备注">
          <Input.TextArea rows={2} maxLength={200} showCount placeholder="旅行主题、注意事项…" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
