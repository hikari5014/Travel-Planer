// Phase 11 — taxi/rideshare rate table for point-to-point cost estimation.
//
// Real-time pricing (Uber/Lyft API) requires OAuth + business accounts and is
// out of scope. Instead we estimate from DRIVE distance + duration using a
// public-rate snapshot per region:
//
//     fare ≈ baseFare + perKm × km + perMin × min
//
// Rates are conservative averages from each city's published taxi tariffs
// (early-2025 reference). Users override per-region in /settings; the
// override is merged on top of the built-in defaults.

export type RegionCode =
  | "TW"  // Taiwan (Taipei average)
  | "JP"  // Japan (Tokyo average)
  | "KR"  // Korea (Seoul average)
  | "HK"  // Hong Kong
  | "TH"  // Thailand (Bangkok average)
  | "SG"  // Singapore
  | "US"  // United States (urban average)
  | "EU"  // Europe (Paris/Berlin average)
  | "MY"  // Malaysia (Kuala Lumpur)
  | "VN"  // Vietnam (Ho Chi Minh)
  | "PH"  // Philippines (Manila)
  | "AU"; // Australia (Sydney)

export type TaxiRate = {
  baseFare: number;   // 起跳價（含起跳里程）
  perKm: number;      // 之後每公里
  perMin: number;     // 等待 / 慢行加成（每分鐘）
  currency: string;   // ISO-4217
  notes?: string;     // 備註，例如尖峰加成
};

// 內建費率 — 來源：各國官方計程車公會 / 2024-2025 公開資費。
// 不含夜間 / 節日 / 機場 / 高速公路附加費。
export const BUILT_IN_TAXI_RATES: Record<RegionCode, TaxiRate> = {
  TW: { baseFare: 85, perKm: 25, perMin: 5, currency: "TWD", notes: "起程 1.25 km；夜間 23:00-06:00 +20 元" },
  JP: { baseFare: 500, perKm: 420, perMin: 90, currency: "JPY", notes: "起程 1.052 km（東京 23 區）" },
  KR: { baseFare: 4800, perKm: 850, perMin: 130, currency: "KRW", notes: "中型計程車（一般）；起程 1.6 km" },
  HK: { baseFare: 27, perKm: 11, perMin: 1.7, currency: "HKD", notes: "市區紅色 taxi；起程 2 km" },
  TH: { baseFare: 35, perKm: 7, perMin: 2, currency: "THB", notes: "曼谷市區；起程 1 km" },
  SG: { baseFare: 4.1, perKm: 0.7, perMin: 0.3, currency: "SGD", notes: "標準 saloon；尖峰另加 25%" },
  MY: { baseFare: 3, perKm: 1.25, perMin: 0.25, currency: "MYR", notes: "Budget taxi；起程 1 km" },
  VN: { baseFare: 12000, perKm: 16500, perMin: 0, currency: "VND", notes: "Vinasun / Mai Linh（4-seat）" },
  PH: { baseFare: 45, perKm: 13.5, perMin: 2, currency: "PHP", notes: "Manila；起程 1 km" },
  AU: { baseFare: 4.6, perKm: 2.29, perMin: 0.95, currency: "AUD", notes: "雪梨；尖峰時段另加 20%" },
  US: { baseFare: 3.5, perKm: 1.7, perMin: 0.5, currency: "USD", notes: "都市平均；尖峰倍率因車隊而異" },
  EU: { baseFare: 4, perKm: 2, perMin: 0.5, currency: "EUR", notes: "西歐都市平均；柏林 / 巴黎稍高" },
};

// 已知的 bbox（minLat, maxLat, minLng, maxLng）— 第一輪 region detection
// 用來避免直接打 Geocoding API 的常見熱區，省 quota。順序 = 優先序。
const BBOX_TABLE: Array<{ region: RegionCode; box: [number, number, number, number] }> = [
  { region: "TW", box: [21.5, 25.5, 119.5, 122.2] },
  { region: "JP", box: [30.0, 46.0, 128.5, 146.5] },
  { region: "KR", box: [33.0, 39.0, 124.5, 130.0] },
  { region: "HK", box: [22.1, 22.6, 113.8, 114.5] },
  { region: "TH", box: [5.5, 20.5, 97.5, 105.7] },
  { region: "SG", box: [1.2, 1.5, 103.6, 104.1] },
  { region: "MY", box: [0.8, 7.5, 99.5, 119.5] },
  { region: "VN", box: [8.5, 23.5, 102.0, 110.0] },
  { region: "PH", box: [4.5, 21.5, 116.5, 127.0] },
  { region: "AU", box: [-44.0, -10.0, 113.0, 154.0] },
  // EU bbox 故意比較寬，且放在 US 之前 — 萬一兩者都不命中再回頭
  { region: "EU", box: [35.0, 71.0, -10.5, 30.5] },
  { region: "US", box: [24.0, 49.5, -125.5, -66.5] },
];

// 純函式 bbox 偵測（離線、零延遲）。
export function detectRegionByBbox(lat: number, lng: number): RegionCode | null {
  for (const { region, box } of BBOX_TABLE) {
    const [minLat, maxLat, minLng, maxLng] = box;
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      return region;
    }
  }
  return null;
}

// 把 user override merge 進 built-in（key 對 key 覆蓋；新增 region 也接受）。
export function mergeRates(
  overrides: Partial<Record<string, TaxiRate>> | null | undefined,
): Record<string, TaxiRate> {
  const out: Record<string, TaxiRate> = { ...BUILT_IN_TAXI_RATES };
  if (overrides) {
    for (const [code, rate] of Object.entries(overrides)) {
      if (rate && typeof rate.baseFare === "number" && typeof rate.perKm === "number") {
        out[code] = rate;
      }
    }
  }
  return out;
}

// 估算函式 — 純函式，無副作用。distanceM 與 durationSec 來自 Routes DRIVE。
export function estimateTaxiCost(
  rate: TaxiRate,
  distanceM: number,
  durationSec: number,
): { fareAmount: number; currency: string; breakdown: { base: number; km: number; min: number } } {
  const km = distanceM / 1000;
  const min = durationSec / 60;
  const kmCost = Math.max(0, km) * rate.perKm;
  const minCost = Math.max(0, min) * rate.perMin;
  const fareAmount = Math.round((rate.baseFare + kmCost + minCost) * 100) / 100;
  return {
    fareAmount,
    currency: rate.currency,
    breakdown: {
      base: rate.baseFare,
      km: Math.round(kmCost * 100) / 100,
      min: Math.round(minCost * 100) / 100,
    },
  };
}
