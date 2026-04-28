import "server-only";
import { prisma } from "@/lib/db";

// Live FX rates via frankfurter.app — no API key required.
// Endpoint: https://api.frankfurter.app/latest?base=TWD
// Phase 2 hook: settings page calls refreshFxRates() on a button click.

const FX_BASE_API = "https://api.frankfurter.app";

// Frankfurter doesn't include TWD as base. Use USD as the bridge currency.
// rates returned: 1 USD = X TARGET. To express "1 TWD = Y JPY", we compute
//   (USD/TWD) is given by base=USD&symbols=TWD → 1 USD = U TWD
//   1 TWD = (1/U) USD
//   1 TWD in JPY = (1/U) * (rates.JPY)

const TARGETS = ["JPY", "USD", "EUR", "KRW", "THB", "HKD", "SGD", "CNY", "GBP", "MYR", "VND"] as const;

export async function fetchLatestFxRates(): Promise<{ rates: Record<string, number>; fetchedAt: Date }> {
  const url = new URL("/latest", FX_BASE_API);
  url.searchParams.set("from", "USD");
  url.searchParams.set("to", [...TARGETS, "TWD"].filter((c) => c !== "USD").join(","));
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`FX API ${res.status}`);
  const body = (await res.json()) as { rates?: Record<string, number> };
  const r = body.rates ?? {};
  const usdInTwd = r.TWD;
  if (!usdInTwd) throw new Error("FX 回應缺少 TWD");
  // rates relative to TWD as base (1 TWD = X target)
  const rates: Record<string, number> = { TWD: 1, USD: 1 / usdInTwd };
  for (const c of TARGETS) {
    if (c === "USD") continue;
    if (typeof r[c] === "number") {
      rates[c] = r[c] / usdInTwd;
    }
  }
  return { rates, fetchedAt: new Date() };
}

export async function refreshFxRates() {
  const { rates, fetchedAt } = await fetchLatestFxRates();
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", fxRates: JSON.stringify(rates), fxFetchedAt: fetchedAt },
    update: { fxRates: JSON.stringify(rates), fxFetchedAt: fetchedAt },
  });
  return { rates, fetchedAt };
}
