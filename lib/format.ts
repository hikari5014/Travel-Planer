// Tiny formatting helpers reused across server and client. Prefer the richer
// formatCurrency from lib/currency.ts when rendering money in user-chosen
// currency; this one is hard-coded to TWD for legacy display contexts.

export function formatTwd(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `NT$ ${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  return `NT$ ${amount.toLocaleString("zh-TW")}`;
}

export function tripDurationDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

// Trip card display shape — kept here so the dashboard <TripCard> can take
// either a real DB row mapped via TripDashboardSummary or a future template
// preview without coupling to Prisma types.
export type TripCardData = {
  id: string;
  title: string;
  subtitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  coverColor: string;
  coverIconKey: string;
  planCount: number;
  totalCost: number;
  // Phase 8 — multi-user fields. role describes the relationship of the
  // dashboard's current user to this trip; ownerDisplayName is shown on
  // joined trips so the user remembers who shared it with them.
  role?: "owner" | "editor" | "viewer";
  ownerDisplayName?: string;
};

// @deprecated alias — old name from Phase 0a. Use TripCardData going forward.
export type MockTrip = TripCardData;

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
