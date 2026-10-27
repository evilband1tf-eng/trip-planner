import { useMemo, useState } from 'react';
import { Col, DatePicker, Form, Input, Modal, Row, TimePicker } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { ItineraryInput, ItineraryItem } from '../types';
import { ImageListPicker } from './ImageListPicker';

interface ItineraryFormValues {
  date: Dayjs;
  time?: Dayjs | null;
  title: string;
  location?: string;
  notes?: string;
  images?: string[];
  linkName?: string;
  linkUrl?: string;
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

  // 预填完全依赖本组件挂载时的 initialValues。
  // 调用方（TripPage）每次打开都会给本组件换一个 key，从而连同 Form.useForm() 的
  // 表单实例一起重建——只给 <Form> 加 key 是没用的，旧实例的 store 会盖掉 initialValues。
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
        images: initial.images ?? [],
        linkName: initial.linkName ?? '',
        linkUrl: initial.linkUrl ?? '',
      };
    }
    return {
      date: dayjs(defaultDate || undefined),
      time: null,
      title: '',
      location: '',
      notes: '',
      images: [],
      linkName: '',
      linkUrl: '',
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
      images: values.images ?? [],
      linkName: values.linkName?.trim() ?? '',
      linkUrl: values.linkUrl?.trim() ?? '',
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

        <Row gutter={12}>
          <Col xs={24} sm={10}>
            <Form.Item
              name="linkName"
              label="路线名称"
              rules={[{ max: 30, message: '最多 30 个字符' }]}
            >
              <Input placeholder="例如：酒店→埃菲尔铁塔" maxLength={30} allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} sm={14}>
            <Form.Item
              name="linkUrl"
              label="路线链接"
              rules={[
                {
                  validator: (_, value) => {
                    const url = String(value ?? '').trim();
                    if (!url) return Promise.resolve();
                    return /^https?:\/\//i.test(url)
                      ? Promise.resolve()
                      : Promise.reject(new Error('需以 http:// 或 https:// 开头'));
                  },
                },
              ]}
              extra="粘贴 Google 地图路线链接；手机上点击会直接打开 Google Maps"
            >
              <Input placeholder="https://maps.app.goo.gl/..." allowClear />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={3} maxLength={200} showCount placeholder="交通、预约、注意事项…" />
        </Form.Item>

        <Form.Item name="images" label="图片">
          <ImageListPicker />
        </Form.Item>
      </Form>
    </Modal>
  );
}
