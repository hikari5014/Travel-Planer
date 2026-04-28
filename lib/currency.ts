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
