import dayjs from 'dayjs';
import type { ItineraryItem, MenuItem } from '../types';

export const HOME_MENU_ID = 'home';

export type TripStatus = 'planning' | 'upcoming' | 'ongoing' | 'finished';

export const STATUS_META: Record<TripStatus, { text: string; color: string }> = {
  planning: { text: '待规划', color: 'default' },
  upcoming: { text: '未开始', color: 'blue' },
  ongoing: { text: '进行中', color: 'green' },
  finished: { text: '已结束', color: 'default' },
};

export function getTripStatus(menu: MenuItem): TripStatus {
  if (!menu.startDate) return 'planning';
  const start = dayjs(menu.startDate).startOf('day');
  const end = dayjs(menu.endDate || menu.startDate).endOf('day');
  const today = dayjs().startOf('day');
  if (today.isBefore(start)) return 'upcoming';
  if (today.isAfter(end)) return 'finished';
  return 'ongoing';
}

export function formatRange(start?: string, end?: string): string {
  if (!start && !end) return '未设置日期';
  if (start && !end) return dayjs(start).format('YYYY年M月D日');
  if (!start && end) return `至 ${dayjs(end).format('YYYY年M月D日')}`;
  return `${dayjs(start).format('YYYY年M月D日')} - ${dayjs(end).format('M月D日')}`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function weekdayText(date: string): string {
  return WEEKDAYS[dayjs(date).day()];
}

export function dayNumber(menu: MenuItem, date: string): number {
  if (!menu.startDate) return 0;
  return dayjs(date).diff(dayjs(menu.startDate), 'day') + 1;
}

export function groupByDate(items: ItineraryItem[]): Record<string, ItineraryItem[]> {
  const map: Record<string, ItineraryItem[]> = {};
  [...items]
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.createdAt.localeCompare(b.createdAt))
    .forEach((item) => {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    });
  return map;
}

/**
 * 生成需要展示的日期列表：
 * 既包含行程起止区间内的每一天，也包含区间外单独添加过的日期
 */
export function buildDayList(menu: MenuItem, items: ItineraryItem[], maxDays = 120): string[] {
  const dates = new Set<string>(items.map((item) => item.date).filter(Boolean));

  if (menu.startDate) {
    const end = menu.endDate && !dayjs(menu.endDate).isBefore(menu.startDate) ? menu.endDate : menu.startDate;
    let cursor = dayjs(menu.startDate);
    const last = dayjs(end);
    let guard = 0;
    while (!cursor.isAfter(last) && guard < maxDays) {
      dates.add(cursor.format('YYYY-MM-DD'));
      cursor = cursor.add(1, 'day');
      guard += 1;
    }
  }

  return [...dates].sort();
}
