// Mock data for editor demo (Phase 0a — visual prototype only).
// Real data will come from Prisma in Phase 0b/1a.

import { resolvePlaceIcon, type PlaceIconKey } from "@/lib/place-icon";

export type ScheduleKind = "ATTRACTION" | "MEAL" | "LODGING" | "FREE" | "TRANSPORT_STOP";
export type TransportMode = "DRIVING" | "TRANSIT" | "WALKING" | "CUSTOM";

export type MockPlace = {
  id: string;
  name: string;
  category: string; // 寺院 / 餐廳 / 咖啡 / 神社 ...
  rating: number;
  ratingCount: number;
  address: string;
  // Demo-only positions in a 0-1000 grid for the stylized map
  mapX: number;
  mapY: number;
  // Auto-resolved icon (system picks; user can override later)
  iconKey: PlaceIconKey;
  // Optional photo URL (real Google Places photo). Demo: undefined → fall back to icon chip.
  photoUrl?: string;
  reviewSnippet: string;
  defaultStayMinutes: number;
};

export type MockScheduleItem = {
  id: string;
  kind: ScheduleKind;
  placeId?: string;
  startTime: string; // HH:mm
  endTime: string;
  durationMin: number;
  isAllDay?: boolean;
  isTimeLocked?: boolean;
  hasTicket?: boolean;
  note?: string;
};

export type MockTransport = {
  id?: string; // present when sourced from DB; absent for hard-coded mocks
  fromItemId: string;
  toItemId: string;
  mode: TransportMode;
  distanceM: number;
  durationSec: number;
  estimatedCost?: number; // TWD
  needsParking?: boolean;
  manuallyEdited?: boolean;
  notes?: string | null;
  transitLine?: string | null;
  originLabel?: string | null;
  destinationLabel?: string | null;
  parkingPlaceId?: string | null;
  parkingPlaceName?: string | null;
};

export type MockDay = {
  id: string;
  date: string; // ISO
  dayIndex: number;
  weekday: string;
  items: MockScheduleItem[];
  transports: MockTransport[];
};

export type MockPlan = {
  id: string;
  name: string;
  isDefault?: boolean;
  totalCost: number;
  totalDistanceKm: number;
  totalDurationHours: number;
  costBreakdown: { food: number; lodging: number; transport: number; ticket: number; misc: number };
  description: string;
  pace: "輕鬆" | "標準" | "緊湊";
};

// ───────────────────────────────────────────────────────────────
// Places
// ───────────────────────────────────────────────────────────────
function makePlace(p: Omit<MockPlace, "iconKey"> & { iconKey?: PlaceIconKey }): MockPlace {
  return {
    ...p,
    iconKey: p.iconKey ?? resolvePlaceIcon(p.category),
  };
}

export const mockPlaces: Record<string, MockPlace> = {
  hotel: makePlace({
    id: "hotel",
    name: "京都 K's House",
    category: "住宿",
    rating: 4.5,
    ratingCount: 2103,
    address: "京都市下京區七條",
    mapX: 470,
    mapY: 720,
    reviewSnippet: "近京都車站、乾淨舒適、適合自助行旅人。",
    defaultStayMinutes: 600,
  }),
  kiyomizu: makePlace({
    id: "kiyomizu",
    name: "清水寺",
    category: "寺院",
    rating: 4.6,
    ratingCount: 12431,
    address: "京都市東山區清水",
    mapX: 720,
    mapY: 540,
    reviewSnippet: "由清水舞台俯瞰京都市景，春櫻秋楓皆為極致。",
    defaultStayMinutes: 120,
  }),
  ninenzaka: makePlace({
    id: "ninenzaka",
    name: "二年坂・產寧坂",
    category: "歷史街道",
    rating: 4.4,
    ratingCount: 8821,
    address: "京都市東山區",
    mapX: 690,
    mapY: 510,
    reviewSnippet: "京都最有味道的石板坡道，町家咖啡與傳統工藝並列。",
    defaultStayMinutes: 60,
  }),
  machiya: makePlace({
    id: "machiya",
    name: "町家午餐 · 京豆庵",
    category: "餐廳",
    rating: 4.7,
    ratingCount: 542,
    address: "京都市東山區八坂",
    mapX: 660,
    mapY: 480,
    reviewSnippet: "百年町家改裝，京懷石午間定食，需訂位。",
    defaultStayMinutes: 90,
  }),
  fushimi: makePlace({
    id: "fushimi",
    name: "伏見稻荷大社",
    category: "神社",
    rating: 4.7,
    ratingCount: 24988,
    address: "京都市伏見區深草",
    mapX: 580,
    mapY: 760,
    reviewSnippet: "千本鳥居名列京都必訪第一，建議下午前往避開人潮。",
    defaultStayMinutes: 150,
  }),
  ramen: makePlace({
    id: "ramen",
    name: "本家第一旭 京都本店",
    category: "拉麵",
    rating: 4.3,
    ratingCount: 6711,
    address: "京都市下京區東塩小路",
    mapX: 490,
    mapY: 690,
    reviewSnippet: "京都拉麵元祖，醬油豬骨湯頭，深夜至凌晨也營業。",
    defaultStayMinutes: 45,
  }),
};

// ───────────────────────────────────────────────────────────────
// Days (Day 1-7, but only Day 3 is fully populated for the demo)
// ───────────────────────────────────────────────────────────────
export const mockDays: MockDay[] = [
  {
    id: "d1",
    date: "2026-05-12",
    dayIndex: 1,
    weekday: "二",
    items: [],
    transports: [],
  },
  {
    id: "d2",
    date: "2026-05-13",
    dayIndex: 2,
    weekday: "三",
    items: [],
    transports: [],
  },
  {
    id: "d3",
    date: "2026-05-14",
    dayIndex: 3,
    weekday: "四",
    items: [
      {
        id: "i1",
        kind: "LODGING",
        placeId: "hotel",
        startTime: "00:00",
        endTime: "23:59",
        durationMin: 0,
        isAllDay: true,
      },
      {
        id: "i2",
        kind: "ATTRACTION",
        placeId: "kiyomizu",
        startTime: "09:00",
        endTime: "11:00",
        durationMin: 120,
        isTimeLocked: true,
      },
      {
        id: "i3",
        kind: "ATTRACTION",
        placeId: "ninenzaka",
        startTime: "11:15",
        endTime: "12:30",
        durationMin: 75,
      },
      {
        id: "i4",
        kind: "MEAL",
        placeId: "machiya",
        startTime: "13:00",
        endTime: "14:30",
        durationMin: 90,
        hasTicket: true,
        note: "已訂位 · 訂位編號 K-3142",
      },
      {
        id: "i5",
        kind: "ATTRACTION",
        placeId: "fushimi",
        startTime: "15:30",
        endTime: "18:00",
        durationMin: 150,
      },
      {
        id: "i6",
        kind: "MEAL",
        placeId: "ramen",
        startTime: "19:00",
        endTime: "19:45",
        durationMin: 45,
      },
    ],
    transports: [
      { fromItemId: "i2", toItemId: "i3", mode: "WALKING", distanceM: 700, durationSec: 600 },
      { fromItemId: "i3", toItemId: "i4", mode: "WALKING", distanceM: 400, durationSec: 360 },
      { fromItemId: "i4", toItemId: "i5", mode: "TRANSIT", distanceM: 5800, durationSec: 1500, estimatedCost: 220 },
      { fromItemId: "i5", toItemId: "i6", mode: "TRANSIT", distanceM: 4500, durationSec: 1380, estimatedCost: 220 },
    ],
  },
  { id: "d4", date: "2026-05-15", dayIndex: 4, weekday: "五", items: [], transports: [] },
  { id: "d5", date: "2026-05-16", dayIndex: 5, weekday: "六", items: [], transports: [] },
  { id: "d6", date: "2026-05-17", dayIndex: 6, weekday: "日", items: [], transports: [] },
  { id: "d7", date: "2026-05-18", dayIndex: 7, weekday: "一", items: [], transports: [] },
];

// ───────────────────────────────────────────────────────────────
// Plans (three for compare demo)
// ───────────────────────────────────────────────────────────────
export const mockPlans: MockPlan[] = [
  {
    id: "p1",
    name: "預設方案",
    isDefault: true,
    pace: "標準",
    totalCost: 78400,
    totalDistanceKm: 142,
    totalDurationHours: 168,
    costBreakdown: { food: 18400, lodging: 38000, transport: 8400, ticket: 9800, misc: 3800 },
    description: "經典景點 + 在地餐廳 + 中等住宿，平衡選擇。",
  },
  {
    id: "p2",
    name: "省錢方案",
    pace: "輕鬆",
    totalCost: 52000,
    totalDistanceKm: 89,
    totalDurationHours: 168,
    costBreakdown: { food: 11000, lodging: 24000, transport: 5500, ticket: 8500, misc: 3000 },
    description: "民宿 + 步行/公車 + 自炊輕食，預算優先。",
  },
  {
    id: "p3",
    name: "親子方案",
    pace: "緊湊",
    totalCost: 96500,
    totalDistanceKm: 168,
    totalDurationHours: 168,
    costBreakdown: { food: 22000, lodging: 52000, transport: 9000, ticket: 9500, misc: 4000 },
    description: "家庭房 + 計程車接駁 + 親子友善景點，便利優先。",
  },
];

// Helpers — `getPlace` first consults a runtime override (set by the editor
// when DB data is available) before falling back to the in-module mocks. This
// lets existing components keep their import unchanged while Phase 1a swaps
// real Place rows in.
let placesOverride: Record<string, MockPlace> | null = null;

export function setPlacesOverride(record: Record<string, MockPlace> | null) {
  placesOverride = record;
}

export function getPlace(id: string | undefined): MockPlace | undefined {
  if (!id) return undefined;
  return placesOverride?.[id] ?? mockPlaces[id];
}

export function modeLabel(mode: TransportMode): string {
  return { DRIVING: "駕車", TRANSIT: "大眾運輸", WALKING: "步行", CUSTOM: "自訂" }[mode];
}

export function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

export function fmtDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
}

export function fmtTwd(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `NT$ ${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  return `NT$ ${amount.toLocaleString("zh-TW")}`;
}
