// 首次启动时写入的示例数据（可随时在页面中删除）
const pad = (n) => String(n).padStart(2, '0');

function fmt(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayOffset(offset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

const iso = (offset) => fmt(dayOffset(offset));
const now = new Date().toISOString();

export function createHomeMenu() {
  return {
    id: 'home',
    name: '首页',
    type: 'home',
    icon: 'home',
    destination: '',
    startDate: '',
    endDate: '',
    note: '',
    image: '',
    order: 0,
    createdAt: now,
  };
}

export function createSeedState() {
  const kyotoId = 'seed-kyoto';
  const daliId = 'seed-dali';

  return {
    menus: [
      createHomeMenu(),
      {
        id: kyotoId,
        name: '京都赏枫五日游',
        type: 'trip',
        icon: 'camera',
        destination: '日本 · 京都',
        startDate: iso(-2),
        endDate: iso(2),
        note: '红叶季，重点安排寺院与和服体验。',
        image: '',
        order: 1,
        createdAt: now,
      },
      {
        id: daliId,
        name: '大理周末慢旅行',
        type: 'trip',
        icon: 'flag',
        destination: '云南 · 大理',
        startDate: iso(12),
        endDate: iso(14),
        note: '环海骑行 + 古城闲逛，节奏放慢。',
        image: '',
        order: 2,
        createdAt: now,
      },
    ],
    itineraries: [
      {
        id: 'seed-kyoto-1',
        menuId: kyotoId,
        date: iso(-2),
        time: '09:30',
        title: '抵达关西机场，前往京都站',
        location: '关西国际机场',
        notes: '购买 ICOCA 卡，入住酒店放行李。',
        image: '',
        createdAt: now,
      },
      {
        id: 'seed-kyoto-2',
        menuId: kyotoId,
        date: iso(-2),
        time: '16:00',
        title: '清水寺 + 二年坂散步',
        location: '清水寺',
        notes: '日落前登高看全景。',
        image: '',
        createdAt: now,
      },
      {
        id: 'seed-kyoto-3',
        menuId: kyotoId,
        date: iso(-1),
        time: '08:00',
        title: '岚山竹林与渡月桥',
        location: '岚山',
        notes: '尽量早去避开人流。',
        image: '',
        createdAt: now,
      },
      {
        id: 'seed-kyoto-4',
        menuId: kyotoId,
        date: iso(),
        time: '10:00',
        title: '和服体验 + 伏见稻荷大社',
        location: '伏见稻荷',
        notes: '和服店需提前一天确认预约。',
        image: '',
        createdAt: now,
      },
      {
        id: 'seed-kyoto-5',
        menuId: kyotoId,
        date: iso(1),
        time: '11:30',
        title: '锦市场午餐',
        location: '锦市场',
        notes: '玉子烧、鳗鱼饭。',
        image: '',
        createdAt: now,
      },
      {
        id: 'seed-dali-1',
        menuId: daliId,
        date: iso(12),
        time: '10:20',
        title: '飞抵大理，入住洱海边民宿',
        location: '大理机场',
        notes: '提前联系民宿接机。',
        image: '',
        createdAt: now,
      },
      {
        id: 'seed-dali-2',
        menuId: daliId,
        date: iso(13),
        time: '09:00',
        title: '洱海生态廊道骑行',
        location: '才村码头',
        notes: '租电助力车，全程约 30 公里。',
        image: '',
        createdAt: now,
      },
      {
        id: 'seed-dali-3',
        menuId: daliId,
        date: iso(14),
        time: '15:00',
        title: '大理古城闲逛返程',
        location: '大理古城',
        notes: '购买鲜花饼伴手礼。',
        image: '',
        createdAt: now,
      },
    ],
  };
}
