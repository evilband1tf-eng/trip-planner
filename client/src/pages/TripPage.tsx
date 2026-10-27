import { useState } from 'react';
import { App as AntApp, Button, Card, Empty, Image, Popconfirm, Tag, Tooltip } from 'antd';
import {
  CalendarOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EnvironmentOutlined,
  ExpandAltOutlined,
  PlusOutlined,
  ScheduleOutlined,
  ShrinkOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAppData } from '../store/AppDataProvider';
import { useAuth } from '../store/AuthProvider';
import { MenuIcon } from '../components/MenuIcon';
import { ItineraryFormModal } from '../components/ItineraryFormModal';
import { TripFormModal } from '../components/TripFormModal';
import { buildDayList, dayNumber, formatRange, getTripStatus, groupByDate, STATUS_META, weekdayText } from '../utils/trip';
import type { ItineraryInput, ItineraryItem, MenuInput, MenuItem } from '../types';

interface TripPageProps {
  menu: MenuItem;
}

export function TripPage({ menu }: TripPageProps) {
  const { itemsOf, createItinerary, updateItinerary, deleteItinerary, updateMenu } = useAppData();
  const { canEdit } = useAuth();
  const { message } = AntApp.useApp();

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>();
  const [dateLocked, setDateLocked] = useState(false);
  const [tripEditOpen, setTripEditOpen] = useState(false);
  // 折叠的日期，默认全部展开
  const [collapsedDates, setCollapsedDates] = useState<string[]>([]);
  // 每次打开弹窗都换 key，让弹窗连同表单实例一起重建（否则会读到上一次的残留值）
  const [formSeq, setFormSeq] = useState(0);
  const [tripFormSeq, setTripFormSeq] = useState(0);

  const items = itemsOf(menu.id);
  const grouped = groupByDate(items);
  const days = buildDayList(menu, items);
  const status = getTripStatus(menu);
  const today = dayjs().format('YYYY-MM-DD');

  const toggleDate = (date: string) => {
    setCollapsedDates((prev) => (prev.includes(date) ? prev.filter((one) => one !== date) : [...prev, date]));
  };

  /** 全部日期都已折叠时，按钮改为「打开全部」 */
  const allCollapsed = days.length > 0 && days.every((date) => collapsedDates.includes(date));
  const toggleAllDates = () => {
    setCollapsedDates(allCollapsed ? [] : [...days]);
  };

  /** locked=true 时表示从某一天的卡片点「添加」，日期固定为该天不可修改 */
  const openCreate = (date?: string, locked = false) => {
    setFormSeq((seq) => seq + 1);
    setEditingItem(null);
    setDateLocked(locked);
    setDefaultDate(date || menu.startDate || today);
    setFormOpen(true);
  };

  const openEdit = (item: ItineraryItem) => {
    setFormSeq((seq) => seq + 1);
    setEditingItem(item);
    setDateLocked(false);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingItem(null);
    setDateLocked(false);
  };

  const handleSubmit = async (values: ItineraryInput) => {
    if (editingItem) {
      const ok = await updateItinerary(editingItem.id, values);
      if (ok) message.success('安排已更新');
      return ok;
    }
    const created = await createItinerary(values);
    if (created) message.success('安排已添加');
    return Boolean(created);
  };

  const handleTripUpdate = async (values: MenuInput) => {
    const ok = await updateMenu(menu.id, values);
    if (ok) message.success('行程信息已更新');
    return ok;
  };

  return (
    <div className="page trip-page">
      <Card className="trip-header-card">
        <div className="trip-header">
          <span className="trip-header-icon">
            <MenuIcon name={menu.icon} />
          </span>

          <div className="trip-header-main">
            <div className="trip-header-title">
              <h1>{menu.name}</h1>
              <Tag color={STATUS_META[status].color}>{STATUS_META[status].text}</Tag>
            </div>
            <div className="trip-header-meta">
              <span>
                <EnvironmentOutlined /> {menu.destination || '未填写目的地'}
              </span>
              <span>
                <CalendarOutlined /> {formatRange(menu.startDate, menu.endDate)}
              </span>
              <span>
                <ScheduleOutlined /> {items.length} 项安排
              </span>
            </div>
            {menu.note && <div className="trip-header-note">{menu.note}</div>}
          </div>

          <div className="trip-header-actions">
            {canEdit && (
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  setTripFormSeq((seq) => seq + 1);
                  setTripEditOpen(true);
                }}
              >
                编辑行程
              </Button>
            )}
            {canEdit && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
                添加安排
              </Button>
            )}
            {days.length > 0 && (
              <Button
                icon={allCollapsed ? <ExpandAltOutlined /> : <ShrinkOutlined />}
                onClick={toggleAllDates}
              >
                {allCollapsed ? '打开全部' : '折叠全部'}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {days.length === 0 ? (
        <Card className="empty-card">
          <Empty
            description={canEdit ? '这个行程还没有安排，先添加第一条吧' : '这个行程还没有安排'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            {canEdit && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
                添加安排
              </Button>
            )}
          </Empty>
        </Card>
      ) : (
        <div className="day-list">
          {days.map((date) => {
            const list = grouped[date] ?? [];
            const index = dayNumber(menu, date);
            const isToday = date === today;
            const isCollapsed = collapsedDates.includes(date);
            // 折叠后在日期后面显示当天第一个安排的地点
            const firstSpot = list[0] ? list[0].location || list[0].title : '';
            return (
              <Card
                key={date}
                className={`day-card${isToday ? ' is-today' : ''}${isCollapsed ? ' is-collapsed' : ''}`}
                title={
                  <div
                    className="day-title"
                    role="button"
                    tabIndex={0}
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleDate(date)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleDate(date);
                      }
                    }}
                  >
                    <DownOutlined className={`day-caret${isCollapsed ? ' is-collapsed' : ''}`} />
                    {index > 0 && <span className="day-badge">第 {index} 天</span>}
                    <span>{dayjs(date).format('M月D日')}</span>
                    <span className="day-week">{weekdayText(date)}</span>
                    {isToday && <Tag color="processing">今天</Tag>}
                    {isCollapsed && (
                      <span className="day-collapsed-spot">
                        <EnvironmentOutlined /> {firstSpot || '暂无安排'}
                      </span>
                    )}
                  </div>
                }
                extra={
                  canEdit ? (
                    <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => openCreate(date, true)}>
                      添加
                    </Button>
                  ) : (
                    <span className="day-count">{list.length} 项</span>
                  )
                }
              >
                {list.length === 0 ? (
                  <div className="day-empty">暂无安排</div>
                ) : (
                  <div className="day-items">
                    {list.map((item) => (
                      <div className="day-item" key={item.id}>
                        <div className="day-item-time">{item.time || '全天'}</div>
                        <div className="day-item-body">
                          <div className="day-item-title">{item.title}</div>
                          {item.location && (
                            <div className="day-item-sub">
                              <EnvironmentOutlined /> {item.location}
                            </div>
                          )}
                          {item.notes && <div className="day-item-notes">{item.notes}</div>}
                          {item.images?.length ? (
                            <div className={`day-item-thumbs${item.images.length === 1 ? ' is-single' : ''}`}>
                              <Image.PreviewGroup>
                                {item.images.map((src, imageIndex) => (
                                  <div className="day-item-thumb" key={`${item.id}-${imageIndex}`}>
                                    <Image
                                      src={src}
                                      alt={`${item.title} 图片 ${imageIndex + 1}`}
                                      preview={{ mask: null }}
                                    />
                                  </div>
                                ))}
                              </Image.PreviewGroup>
                            </div>
                          ) : null}
                        </div>
                        {canEdit && (
                          <div className="day-item-actions">
                            <Tooltip title="编辑">
                              <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                aria-label="编辑安排"
                                onClick={() => openEdit(item)}
                              />
                            </Tooltip>
                            <Popconfirm
                              title="删除这条安排？"
                              description="删除后无法恢复。"
                              okText="删除"
                              cancelText="取消"
                              okButtonProps={{ danger: true }}
                              onConfirm={async () => {
                                const ok = await deleteItinerary(item.id);
                                if (ok) message.success('已删除');
                              }}
                            >
                              <Tooltip title="删除">
                                <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="删除安排" />
                              </Tooltip>
                            </Popconfirm>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {canEdit && (
        <>
          <ItineraryFormModal
            key={`itinerary-${formSeq}`}
            open={formOpen}
            menuId={menu.id}
            defaultDate={defaultDate}
            initial={editingItem}
            dateLocked={dateLocked}
            onCancel={closeForm}
            onSubmit={handleSubmit}
          />

          <TripFormModal
            key={`trip-${tripFormSeq}`}
            open={tripEditOpen}
            title="编辑行程"
            initial={menu}
            onCancel={() => setTripEditOpen(false)}
            onSubmit={handleTripUpdate}
          />
        </>
      )}
    </div>
  );
}
