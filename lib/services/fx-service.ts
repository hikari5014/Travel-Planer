import "server-only";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth/current-user";

// Live FX rates via open.er-api.com — free, no API key required, 161
// currencies including TWD (which frankfurter.app does NOT cover).
//
// Endpoint: https://open.er-api.com/v6/latest/{BASE}
// Response shape:
//   { result: "success", base_code: "USD",
//     rates: { TWD: 32.45, JPY: 154.2, USD: 1, ... },
//     time_last_update_unix: 1730073601 }

const FX_BASE_API = "https://open.er-api.com/v6/latest";

// Currencies we display in the picker. open.er-api supplies all of these.
const TARGETS = ["TWD", "JPY", "USD", "EUR", "KRW", "THB", "HKD", "SGD", "CNY", "GBP", "MYR", "VND"] as const;

export async function fetchLatestFxRates(
  base: string = "TWD",
): Promise<{ rates: Record<string, number>; fetchedAt: Date }> {
  // open.er-api accepts any supported currency as the path segment.
  const url = `${FX_BASE_API}/${encodeURIComponent(base.toUpperCase())}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`FX API ${res.status}`);
  const body = (await res.json()) as {
    result?: string;
    base_code?: string;
    rates?: Record<string, number>;
    time_last_update_unix?: number;
    "error-type"?: string;
  };
  if (body.result !== "success" || !body.rates) {
    throw new Error(`FX API 回應錯誤：${body["error-type"] ?? "unknown"}`);
  }

  // Slim down to the currencies our UI knows about.
  const rates: Record<string, number> = {};
  for (const c of TARGETS) {
    if (typeof body.rates[c] === "number") rates[c] = body.rates[c];
  }
  // Always include base = 1 explicitly (defensive — the API returns this
  // already but missing values would otherwise break formatRateAge UI).
  rates[base.toUpperCase()] = 1;

  const fetchedAt = body.time_last_update_unix
    ? new Date(body.time_last_update_unix * 1000)
    : new Date();
  return { rates, fetchedAt };
}

export async function refreshFxRates(): Promise<{ rates: Record<string, number>; fetchedAt: Date }> {
  const userId = await getCurrentUserId();
  const settings = await prisma.settings.findUnique({ where: { id: userId } });
  const base = settings?.baseCurrency ?? "TWD";
  const { rates, fetchedAt } = await fetchLatestFxRates(base);
  await prisma.settings.upsert({
    where: { id: userId },
    create: { id: userId, fxRates: JSON.stringify(rates), fxFetchedAt: fetchedAt },
    update: { fxRates: JSON.stringify(rates), fxFetchedAt: fetchedAt },
  });
  return { rates, fetchedAt };
}
