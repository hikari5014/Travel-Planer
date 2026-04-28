export type MockTrip = {
  id: string;
  title: string;
  subtitle: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;
  coverColor: string; // gradient classes
  /**
   * Cover icon key. Maps to an icon in `lib/place-icon.tsx`. Used when no
   * uploaded cover photo exists. Falls back to "landmark" when undefined.
   */
  coverIconKey?: import("@/lib/place-icon").PlaceIconKey;
  planCount: number;
  totalCost: number; // TWD
  status: "active" | "past" | "upcoming";
  destination: string;
};

export const mockTrips: MockTrip[] = [
  {
    id: "kyoto-7d",
    title: "京都七日漫遊",
    subtitle: "賞櫻、寺院、町家咖啡",
    startDate: "2026-05-12",
    endDate: "2026-05-18",
    coverColor: "from-[#e8a55a] to-[#cc785c]",
    coverIconKey: "temple",
    planCount: 3,
    totalCost: 78400,
    status: "active",
    destination: "京都 / 大阪",
  },
  {
    id: "hokkaido-5d",
    title: "北海道夏日",
    subtitle: "富良野花田、小樽海岸線",
    startDate: "2026-06-03",
    endDate: "2026-06-07",
    coverColor: "from-[#5db8a6] to-[#181715]",
    coverIconKey: "park",
    planCount: 1,
    totalCost: 52000,
    status: "active",
    destination: "札幌 / 富良野",
  },
  {
    id: "tainan-2d",
    title: "台南週末走食",
    subtitle: "古蹟、小吃、巷弄咖啡",
    startDate: "2026-07-20",
    endDate: "2026-07-21",
    coverColor: "from-[#cc785c] to-[#a9583e]",
    coverIconKey: "ramen",
    planCount: 2,
    totalCost: 8200,
    status: "active",
    destination: "台南",
  },
  {
    id: "tokyo-2025",
    title: "東京跨年",
    subtitle: "已完成 · 2025/12",
    startDate: "2025-12-28",
    endDate: "2026-01-02",
    coverColor: "from-[#252320] to-[#181715]",
    coverIconKey: "landmark",
    planCount: 1,
    totalCost: 64500,
    status: "past",
    destination: "東京",
  },
  {
    id: "yilan-2025",
    title: "宜蘭親子兩日",
    subtitle: "已完成 · 2025/10",
    startDate: "2025-10-15",
    endDate: "2025-10-16",
    coverColor: "from-[#5db872] to-[#5db8a6]",
    coverIconKey: "mountain",
    planCount: 2,
    totalCost: 12300,
    status: "past",
    destination: "宜蘭",
  },
];

export function formatTwd(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `NT$ ${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  return `NT$ ${amount.toLocaleString("zh-TW")}`;
}

export function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sm = s.getMonth() + 1;
  const sd = s.getDate();
  const em = e.getMonth() + 1;
  const ed = e.getDate();
  if (sm === em) return `${sm}/${sd}–${ed}`;
  return `${sm}/${sd} – ${em}/${ed}`;
}

export function tripDurationDays(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}
