import { useMemo, useState } from 'react';
import { Col, DatePicker, Form, Input, Modal, Row, TimePicker } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { ItineraryInput, ItineraryItem } from '../types';
import { ImagePicker } from './ImagePicker';

interface ItineraryFormValues {
  date: Dayjs;
  time?: Dayjs | null;
  title: string;
  location?: string;
  notes?: string;
  image?: string;
}

interface ItineraryFormModalProps {
  open: boolean;
  menuId: string;
  defaultDate?: string;
  initial?: ItineraryItem | null;
  /** 从某天卡片点「添加」时锁定日期，仅新建生效 */
  dateLocked?: boolean;
  onCancel: () => void;
  onSubmit: (values: ItineraryInput) => Promise<boolean>;
}

export function ItineraryFormModal({
  open,
  menuId,
  defaultDate,
  initial,
  dateLocked = false,
  onCancel,
  onSubmit,
}: ItineraryFormModalProps) {
  const [form] = Form.useForm<ItineraryFormValues>();
  const [saving, setSaving] = useState(false);

  // 每次打开都递增 key，让 Form 重新挂载并直接读取 initialValues，
  // 避免依赖 destroyOnClose 与 setFieldsValue 的执行时序（时序不稳定时会丢失预填内容）
  const [openCount, setOpenCount] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }

  const isEdit = Boolean(initial);
  const lockDate = dateLocked && !isEdit;

  const initialValues = useMemo<ItineraryFormValues>(() => {
    if (initial) {
      return {
        date: dayjs(initial.date),
        time: initial.time
          ? dayjs(`${initial.date || dayjs().format('YYYY-MM-DD')}T${initial.time}:00`)
          : null,
        title: initial.title,
        location: initial.location,
        notes: initial.notes,
        image: initial.image || '',
      };
    }
    return {
      date: dayjs(defaultDate || undefined),
      time: null,
      title: '',
      location: '',
      notes: '',
      image: '',
    };
  }, [initial, defaultDate]);

  const handleOk = async () => {
    let values: ItineraryFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSaving(true);
    const ok = await onSubmit({
      menuId,
      date: values.date.format('YYYY-MM-DD'),
      time: values.time ? values.time.format('HH:mm') : '',
      title: values.title.trim(),
      location: values.location?.trim() ?? '',
      notes: values.notes?.trim() ?? '',
      image: values.image ?? '',
    });
    setSaving(false);
    if (ok) onCancel();
  };

  return (
    <Modal
      open={open}
      title={isEdit ? '编辑行程安排' : '添加行程安排'}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onCancel}
      destroyOnClose
      maskClosable={!saving}
      width={520}
    >
      <Form
        key={openCount}
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        className="form-compact"
        initialValues={initialValues}
      >
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="date"
              label="日期"
              rules={[{ required: true, message: '请选择日期' }]}
              extra={lockDate ? '日期由所在的日期卡片决定，不可修改' : undefined}
            >
              <DatePicker
                style={{ width: '100%' }}
                placeholder="选择日期"
                disabled={lockDate}
                allowClear={!lockDate}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="time" label="时间（可选）">
              <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={5} placeholder="选择时间" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="title"
          label="安排内容"
          rules={[{ required: true, message: '请输入安排内容' }, { max: 60, message: '最多 60 个字符' }]}
        >
          <Input placeholder="例如：清水寺 + 二年坂散步" maxLength={60} allowClear />
        </Form.Item>

        <Form.Item name="location" label="地点">
          <Input placeholder="例如：清水寺" maxLength={40} allowClear />
        </Form.Item>

        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={3} maxLength={200} showCount placeholder="交通、预约、注意事项…" />
        </Form.Item>

        <Form.Item name="image" label="图片">
          <ImagePicker />
        </Form.Item>
      </Form>
    </Modal>
  );
}
