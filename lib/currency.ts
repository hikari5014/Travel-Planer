// Currency conversion utilities.
// Phase 0a: hardcoded rates as a stub. Phase 2 will fetch from a free API
// (frankfurter.app or exchangerate.host) on a manual refresh button.

export type CurrencyCode = "TWD" | "JPY" | "USD" | "EUR" | "KRW" | "THB" | "HKD" | "SGD" | "CNY" | "GBP" | "MYR" | "VND";

export type CurrencyRates = {
  base: CurrencyCode; // base = "1 TWD"
  // value is "1 base unit" expressed in the target currency
  // e.g., rates.JPY = 4.76 means 1 TWD = 4.76 JPY
  rates: Partial<Record<CurrencyCode, number>>;
  fetchedAt: string; // ISO datetime
  source: string;
};

export type CurrencySettings = {
  primary: CurrencyCode; // user's home/budget currency, e.g. TWD
  local: CurrencyCode;   // current trip's local currency, e.g. JPY
};

// Mock rates (updated 2026-04). Real values come from API in Phase 2.
export const mockRates: CurrencyRates = {
  base: "TWD",
  rates: {
    TWD: 1,
    JPY: 4.76,
    USD: 0.031,
    EUR: 0.029,
    KRW: 42.3,
    THB: 1.06,
    HKD: 0.24,
    SGD: 0.041,
    CNY: 0.225,
    GBP: 0.024,
    MYR: 0.143,
    VND: 769,
  },
  fetchedAt: "2026-04-28T08:00:00Z",
  source: "exchangerate.host (mock)",
};

export const defaultCurrencySettings: CurrencySettings = {
  primary: "TWD",
  local: "JPY",
};

export const currencyMeta: Record<CurrencyCode, { symbol: string; name: string; flag: string; decimals: number }> = {
  TWD: { symbol: "NT$", name: "新台幣",   flag: "🇹🇼", decimals: 0 },
  JPY: { symbol: "¥",   name: "日圓",     flag: "🇯🇵", decimals: 0 },
  USD: { symbol: "$",   name: "美元",     flag: "🇺🇸", decimals: 2 },
  EUR: { symbol: "€",   name: "歐元",     flag: "🇪🇺", decimals: 2 },
  KRW: { symbol: "₩",   name: "韓圓",     flag: "🇰🇷", decimals: 0 },
  THB: { symbol: "฿",   name: "泰銖",     flag: "🇹🇭", decimals: 0 },
  HKD: { symbol: "HK$", name: "港幣",     flag: "🇭🇰", decimals: 0 },
  SGD: { symbol: "S$",  name: "新加坡幣", flag: "🇸🇬", decimals: 2 },
  CNY: { symbol: "¥",   name: "人民幣",   flag: "🇨🇳", decimals: 2 },
  GBP: { symbol: "£",   name: "英鎊",     flag: "🇬🇧", decimals: 2 },
  MYR: { symbol: "RM",  name: "馬來令吉", flag: "🇲🇾", decimals: 2 },
  VND: { symbol: "₫",   name: "越南盾",   flag: "🇻🇳", decimals: 0 },
};

// Convert from primary currency to target currency, using current rates.
export function convert(
  amountInPrimary: number,
  to: CurrencyCode,
  rates: CurrencyRates = mockRates,
  primary: CurrencyCode = "TWD",
): number {
  if (to === primary) return amountInPrimary;
  const pRate = rates.rates[primary];
  const tRate = rates.rates[to];
  if (!pRate || !tRate) return amountInPrimary;
  // primary base equiv → target
  return (amountInPrimary / pRate) * tRate;
}

// Phase 14m fix — centralized base-currency conversion for Expense rows.
// fxRateToBase is "1 base unit = X currency units" (matches Settings.fxRates
// shape, where TWD=1 anchors). To convert a JPY amount to TWD:
//   twd = jpy / fxRateToBase[JPY]
//
// Resolution order:
//   1. If currency === baseCurrency → no conversion (return amount as-is)
//   2. Use savedFxRate (the rate snapshot stored on the Expense row at
//      creation time — preserves history)
//   3. Fall back to current fxRates table from Settings (so old rows with
//      null fxRateToBase still display correctly with today's rate)
//   4. Final fallback: return original amount (logs a warning); UI can
//      annotate "未換算" but this prevents nonsense like ¥3,000 → NT$ 3,000
export function convertToBase(
  amount: number,
  currency: string,
  baseCurrency: string,
  savedFxRate: number | null | undefined,
  currentFxRates: Record<string, number> | null | undefined,
): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === baseCurrency) return amount;
  if (savedFxRate && savedFxRate > 0) return amount / savedFxRate;
  const live = currentFxRates?.[currency];
  if (typeof live === "number" && live > 0) return amount / live;
  return amount;
}

// Pick the right fxRate snapshot to save on a NEW Expense row at creation
// time. Returns null when conversion is unnecessary (currency === base) or
// when no rate is available; null is acceptable because read-side falls back
// to current rates.
export function pickFxRateForSnapshot(
  currency: string,
  baseCurrency: string,
  currentFxRates: Record<string, number> | null | undefined,
): number | null {
  if (currency === baseCurrency) return null;
  const r = currentFxRates?.[currency];
  if (typeof r === "number" && r > 0) return r;
  return null;
}

export function formatCurrency(amount: number, code: CurrencyCode, opts: { compact?: boolean } = {}): string {
  const meta = currencyMeta[code];
  const compact = opts.compact ?? false;
  // Only swap to "M" abbreviation when the amount is one million or more.
  // Anything below shows the full digit count (no .k suffix).
  if (compact && Math.abs(amount) >= 1_000_000) {
    const m = amount / 1_000_000;
    return `${meta.symbol} ${m.toLocaleString("zh-TW", {
      minimumFractionDigits: amount % 1_000_000 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    })}M`;
  }
  return `${meta.symbol} ${amount.toLocaleString("zh-TW", {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  })}`;
}

// Lightweight summary string for "last updated" display
export function formatRateAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "剛剛";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小時前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase B1 — Money branded type (additive, doesn't replace existing API yet)
// ─────────────────────────────────────────────────────────────────────────────
//
// Money pairs an amount with its currency at the type level so the compiler
// can prevent the classes of bugs that have caused repeated currency-display
// regressions:
//
//   - "amount in primary currency" assumed implicitly (PR #1 taxi fare bug)
//   - JPY value passed where TWD expected, no compile error, double-converted
//   - Forgotten conversion when summing mixed-currency rows
//
// Branded structurally: `__brand: "Money"` is type-only (won't appear in
// runtime objects or JSON output), but two different Money<C> types are
// structurally distinct so the compiler can enforce conversions explicitly.
//
// Existing API (`convert`, `convertToBase`, `pickFxRateForSnapshot`,
// `formatCurrency`) stays in place — both APIs coexist while service / UI
// layers are migrated piece-by-piece in subsequent commits.
// ─────────────────────────────────────────────────────────────────────────────

declare const __moneyBrand: unique symbol;
export type Money<C extends CurrencyCode = CurrencyCode> = {
  readonly amount: number;
  readonly currency: C;
  readonly [__moneyBrand]: true;
};

// Constructor — the ONLY supported way to mint a Money value. The cast is
// scoped here; downstream code stays cast-free.
export function money<C extends CurrencyCode>(amount: number, currency: C): Money<C> {
  return { amount, currency } as unknown as Money<C>;
}

// Convenience: empty / zero-value Money for nullish aggregation paths.
export function zeroMoney<C extends CurrencyCode>(currency: C): Money<C> {
  return money(0, currency);
}

// Runtime predicate — useful at deserialization boundaries (LLM JSON,
// imported payloads) where we receive plain `{ amount, currency }` objects
// and want to upcast safely after validation.
export function isMoney(x: unknown): x is Money {
  if (!x || typeof x !== "object") return false;
  const v = x as { amount?: unknown; currency?: unknown };
  return (
    typeof v.amount === "number" &&
    typeof v.currency === "string" &&
    v.currency in currencyMeta
  );
}

// Convert a Money value to a target currency.
//
//   src.currency === target → returned as-is (no rate lookup)
//   snapshot provided AND target === rates.base → uses snapshot
//     (matches Phase 14m Expense.fxRateToBase semantics; preserves
//      transaction-time rate so historic rows don't drift with FX changes)
//   otherwise → src → rates.base → target via current rates
//   missing rate on either leg → returns src.amount tagged as target
//     (preserves the legacy "silent fallback" behaviour from convertToBase;
//      callers that want strictness can compose a checked variant later)
export function toCurrency<T extends CurrencyCode>(
  src: Money,
  target: T,
  rates: CurrencyRates,
  snapshot?: number | null,
): Money<T> {
  if (src.currency === target) return money(src.amount, target);

  // Snapshot path only meaningful when target is the rates.base anchor —
  // matches how Expense.fxRateToBase is stored (rate of src against base).
  if (snapshot && snapshot > 0 && target === rates.base) {
    return money(src.amount / snapshot, target);
  }

  const srcRate = rates.rates[src.currency];
  const tgtRate = rates.rates[target];
  if (!srcRate || !tgtRate) {
    return money(src.amount, target);
  }
  // src → base → target. rates.rates[X] = "1 base unit = X currency units"
  const baseAmount = src.amount / srcRate;
  return money(baseAmount * tgtRate, target);
}

// Sum a list of (possibly null) Money values, normalised to a single target
// currency. Each item is converted via current rates before summing, so the
// result is a single Money<T> with no leftover unit ambiguity.
export function sumMoney<T extends CurrencyCode>(
  items: ReadonlyArray<Money | null | undefined>,
  target: T,
  rates: CurrencyRates,
): Money<T> {
  let total = 0;
  for (const m of items) {
    if (!m) continue;
    total += toCurrency(m, target, rates).amount;
  }
  return money(total, target);
}

// Format a Money value for display. Thin wrapper over the existing
// formatCurrency() so callers don't have to unwrap manually.
export function formatMoney(value: Money, opts: { compact?: boolean } = {}): string {
  return formatCurrency(value.amount, value.currency, opts);
}
