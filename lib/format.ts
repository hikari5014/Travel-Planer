// Tiny formatting helpers reused across server and client.
// For currency rendering, always use formatCurrency / formatMoney from
// lib/currency.ts — the legacy formatTwd helper was removed in Phase B4
// since it hard-coded "NT$" regardless of the trip's actual baseCurrency.

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
  // Currency that totalCost is denominated in (Trip.baseCurrency). Lets
  // PriceWithLocal correctly convert to the user's primary on display.
  baseCurrency: string;
  // Phase B3 — Money mirror; preferred for new code. Existing totalCost +
  // baseCurrency kept as fallback during call-site migration.
  totalCostMoney?: import("@/lib/currency").Money;
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
