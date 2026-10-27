import { useState } from 'react';
import { App as AntApp, Button, Card, Col, Empty, Image, Row, Tag } from 'antd';
import {
  ArrowRightOutlined,
  CalendarOutlined,
  PlusOutlined,
  ScheduleOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../store/AppDataProvider';
import { useAuth } from '../store/AuthProvider';
import { MenuIcon } from '../components/MenuIcon';
import { TripFormModal } from '../components/TripFormModal';
import { formatRange, getTripStatus, STATUS_META } from '../utils/trip';
import type { MenuInput, MenuItem } from '../types';

function sortTrips(a: MenuItem, b: MenuItem): number {
  if (a.startDate && b.startDate) return a.startDate.localeCompare(b.startDate);
  if (a.startDate) return -1;
  if (b.startDate) return 1;
  return a.order - b.order;
}

export function HomePage() {
  const { trips, itineraries, mode, createMenu } = useAppData();
  const { canEdit } = useAuth();
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

  const sortedTrips = [...trips].sort(sortTrips);

  const stats = {
    total: trips.length,
    ongoing: trips.filter((trip) => getTripStatus(trip) === 'ongoing').length,
    upcoming: trips.filter((trip) => getTripStatus(trip) === 'upcoming').length,
    plans: itineraries.length,
  };

  const handleCreate = async (values: MenuInput) => {
    const menu = await createMenu(values);
    if (!menu) return false;
    message.success('行程已创建，开始添加安排吧');
    navigate(`/p/${menu.id}`);
    return true;
  };

  return (
    <div className="page home-page">
      <Card className="home-hero">
        <div className="home-hero-inner">
          <div className="home-hero-text">
            <div className="home-hero-date">
              {dayjs().format('YYYY年M月D日 dddd')}
              {mode && (
                <Tag color={mode === 'remote' ? 'blue' : 'default'} className="home-mode-tag">
                  {mode === 'remote' ? '云端数据' : '本地数据'}
                </Tag>
              )}
            </div>
            <h1 className="home-hero-title">把每一次出发，都提前安排好</h1>
            <p className="home-hero-desc">
              在左侧菜单里创建你的行程，按天记录交通、住宿与游玩安排，随时随地查看与调整。
            </p>
            <div className="home-hero-actions">
              {canEdit && (
                <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                  新建行程
                </Button>
              )}
              {sortedTrips.length > 0 && (
                <Button
                  size="large"
                  icon={<ArrowRightOutlined />}
                  onClick={() => navigate(`/p/${sortedTrips[0].id}`)}
                >
                  继续规划最近行程
                </Button>
              )}
            </div>
          </div>
          <div className="home-hero-badge">
            <span className="home-hero-badge-num">{stats.total}</span>
            <span className="home-hero-badge-label">个行程</span>
          </div>
        </div>
      </Card>

      <Row gutter={[12, 12]} className="home-stats">
        {[
          { label: '行程总数', value: stats.total, suffix: '个' },
          { label: '进行中', value: stats.ongoing, suffix: '个' },
          { label: '未开始', value: stats.upcoming, suffix: '个' },
          { label: '行程安排', value: stats.plans, suffix: '条' },
        ].map((item) => (
          <Col xs={12} md={6} key={item.label}>
            <Card className="stat-card">
              <div className="stat-label">{item.label}</div>
              <div className="stat-value">
                {item.value}
                <span className="stat-suffix">{item.suffix}</span>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <div className="section-head">
        <h2 className="section-title">我的行程</h2>
        {canEdit && (
          <Button type="link" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建
          </Button>
        )}
      </div>

      {sortedTrips.length === 0 ? (
        <Card className="empty-card">
          <Empty description="还没有行程" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            {canEdit && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新建行程
              </Button>
            )}
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {sortedTrips.map((trip) => {
            const status = getTripStatus(trip);
            const count = itineraries.filter((item) => item.menuId === trip.id).length;
            return (
              <Col xs={24} sm={12} xl={8} key={trip.id}>
                <Card
                  hoverable
                  className="trip-card"
                  onClick={() => navigate(`/p/${trip.id}`)}
                  cover={
                    trip.image ? (
                      <div className="trip-card-cover" onClick={(event) => event.stopPropagation()}>
                        <Image
                          src={trip.image}
                          alt={`${trip.name} 行程图片`}
                          preview={{ mask: <span className="trip-card-cover-mask">点击查看大图</span> }}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      </div>
                    ) : undefined
                  }
                >
                  <div className="trip-card-head">
                    <span className="trip-card-icon">
                      <MenuIcon name={trip.icon} />
                    </span>
                    <div className="trip-card-titles">
                      <div className="trip-card-title">{trip.name}</div>
                      <div className="trip-card-sub">
                        <EnvironmentOutlined /> {trip.destination || '未填写目的地'}
                      </div>
                    </div>
                    <Tag color={STATUS_META[status].color} className="trip-card-tag">
                      {STATUS_META[status].text}
                    </Tag>
                  </div>

                  <div className="trip-card-meta">
                    <CalendarOutlined /> {formatRange(trip.startDate, trip.endDate)}
                  </div>

                  <div className="trip-card-foot">
                    <span className="trip-card-count">
                      <ScheduleOutlined /> {count} 项安排
                    </span>
                    <span className="trip-card-link">
                      进入规划 <ArrowRightOutlined />
                    </span>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <TripFormModal
        open={createOpen}
        title="新建行程"
        onCancel={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}
