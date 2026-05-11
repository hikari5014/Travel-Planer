import "server-only";
import { z } from "zod";
import { decode } from "@googlemaps/polyline-codec";
import { prisma } from "@/lib/db";
import { generateJsonWithGrounding } from "./ai-service";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { convert, type CurrencyCode } from "@/lib/currency";
import type {
  DrivingFuelEstimate,
  DrivingSegments,
  DrivingSegment,
  RestArea,
} from "./driving-segments-types";

// ─── Tier 1: free fuel estimate from polyline distance ──────────────────────

export async function computeFuelEstimateFromTransport(transportId: string): Promise<DrivingFuelEstimate | null> {
  const t = await prisma.transport.findUnique({
    where: { id: transportId },
    select: { distanceMeters: true },
  });
  if (!t || !t.distanceMeters) return null;

  const userId = await getCurrentUserId();
  const settings = await prisma.settings.findUnique({ where: { id: userId } });
  const pricePerLiter = settings?.defaultFuelPricePerLiter ?? 35;
  const efficiency = settings?.defaultFuelEfficiencyKmPerL ?? 15;
  const currency = settings?.baseCurrency ?? "TWD";

  const km = t.distanceMeters / 1000;
  const liters = km / efficiency;
  const cost = Math.round(liters * pricePerLiter * 100) / 100;
  return {
    liters: Math.round(liters * 100) / 100,
    cost,
    currency,
    pricePerLiter,
    efficiencyKmPerL: efficiency,
  };
}

// ─── Tier 2: LLM grounded breakdown (segments + tolls + rest areas) ────────

const SegmentZ = z.object({
  kind: z.enum(["surface", "toll-road", "highway"]),
  distanceM: z.number().nonnegative(),
  durationSec: z.number().nonnegative(),
  roadName: z.string().max(120).optional(),
  tollAmount: z.number().nonnegative().optional(),
  tollCurrency: z.string().length(3).optional(),
});
const RestAreaZ = z.object({
  name: z.string().min(1).max(80),
  kmFromStart: z.number().nonnegative(),
  direction: z.enum(["outbound", "either"]).optional().default("either"),
  type: z.enum(["PA", "SA", "rest-stop"]).optional().default("rest-stop"),
  notes: z.string().max(200).optional(),
});
const DrivingLLMResponseZ = z.object({
  segments: z.array(SegmentZ).max(40),
  restAreas: z.array(RestAreaZ).max(30).optional().default([]),
  notes: z.string().max(500).optional(),
});

const SYSTEM_PROMPT = `你是熟悉道路網的旅遊規劃顧問，能透過 Google 搜尋取得最新的高速公路、收費站與服務區資訊。

給定一段自駕路線（起點、終點、總距離公里、預估時間、概略路徑描述），請：

1. 將路線拆成數個 segment，每段標註：
   - kind：surface（一般平面道路）、toll-road（收費平面或快速道路）、highway（高速公路）
   - distanceM、durationSec
   - roadName（如「國道一號」「首都高速 C2」「阪神高速 11 號池田線」）
   - 若該段有過路費，估 tollAmount + tollCurrency（TWD/JPY/KRW…）
2. 在 restAreas 列出該路線經過的休息站（PA / SA / 一般休息站）：
   - name、kmFromStart（從起點起算公里）
   - direction：outbound（與本次行進方向一致）或 either
   - type、notes（如「7-11、加油站、景觀台」）
3. 重要：請使用 Google 搜尋驗證收費金額與服務區是否仍營運（資料常變動）。
4. 不確定的欄位請省略，不要猜測；寧缺勿假。
5. 只回合法 JSON。`;

type EstimateInput = {
  transportId: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  originName?: string;
  destName?: string;
  totalDistanceM: number;
  totalDurationSec: number;
  encodedPolyline?: string | null;
};

export async function estimateDrivingSegments(input: EstimateInput): Promise<DrivingSegments> {
  // Sample 5 anchor points along the polyline so the prompt stays small
  // (full polylines are thousands of points). If no polyline, just use
  // origin + destination.
  const anchors: Array<[number, number]> = [];
  if (input.encodedPolyline) {
    try {
      const pts = decode(input.encodedPolyline) as Array<[number, number]>;
      if (pts.length > 0) {
        const step = Math.max(1, Math.floor(pts.length / 6));
        for (let i = 0; i < pts.length; i += step) {
          anchors.push(pts[i]);
          if (anchors.length >= 7) break;
        }
        if (anchors[anchors.length - 1] !== pts[pts.length - 1]) anchors.push(pts[pts.length - 1]);
      }
    } catch {
      anchors.length = 0;
    }
  }
  if (anchors.length === 0) {
    anchors.push([input.originLat, input.originLng], [input.destLat, input.destLng]);
  }

  const prompt = `路線：${input.originName ?? `(${input.originLat},${input.originLng})`} → ${input.destName ?? `(${input.destLat},${input.destLng})`}
總距離：${(input.totalDistanceM / 1000).toFixed(1)} km
預估時間：${Math.round(input.totalDurationSec / 60)} 分
方向：去程 (outbound)
路徑經緯度錨點（依序，從起點到終點）：
${anchors.map((p, i) => `  ${i + 1}. ${p[0].toFixed(4)}, ${p[1].toFixed(4)}`).join("\n")}

請以 JSON 回應，schema：
{
  "segments": [
    { "kind": "surface"|"toll-road"|"highway", "distanceM": number, "durationSec": number, "roadName"?: string, "tollAmount"?: number, "tollCurrency"?: "TWD"|"JPY"|"KRW"|... }
  ],
  "restAreas": [
    { "name": string, "kmFromStart": number, "direction"?: "outbound"|"either", "type"?: "PA"|"SA"|"rest-stop", "notes"?: string }
  ],
  "notes"?: string
}`;

  const result = await generateJsonWithGrounding({
    system: SYSTEM_PROMPT,
    prompt,
    schema: DrivingLLMResponseZ,
    metadata: { feature: "driving-segments", transportId: input.transportId },
  });

  const fuel = await computeFuelEstimateFromTransport(input.transportId);
  if (!fuel) {
    throw new Error("找不到燃料設定。請至 /settings 設定每公升油價與每公升公里數。");
  }

  // Aggregate toll total
  let tollTotal: { amount: number; currency: string } | undefined;
  for (const s of result.data.segments) {
    if (s.tollAmount && s.tollCurrency) {
      if (!tollTotal) tollTotal = { amount: 0, currency: s.tollCurrency };
      if (tollTotal.currency === s.tollCurrency) tollTotal.amount += s.tollAmount;
    }
  }
  if (tollTotal) tollTotal.amount = Math.round(tollTotal.amount);

  const segments: DrivingSegment[] = result.data.segments.map((s) => ({
    kind: s.kind,
    distanceM: Math.round(s.distanceM),
    durationSec: Math.round(s.durationSec),
    ...(s.roadName ? { roadName: s.roadName } : {}),
    ...(s.tollAmount ? { tollAmount: s.tollAmount } : {}),
    ...(s.tollCurrency ? { tollCurrency: s.tollCurrency } : {}),
  }));
  const restAreas: RestArea[] = result.data.restAreas.map((r) => ({
    name: r.name,
    kmFromStart: r.kmFromStart,
    direction: r.direction,
    type: r.type,
    ...(r.notes ? { notes: r.notes } : {}),
  }));

  const persisted: DrivingSegments = {
    schemaVersion: 1,
    segments,
    ...(tollTotal ? { tollTotal } : {}),
    fuelEstimate: fuel,
    restAreas,
    estimatedAt: new Date().toISOString(),
    groundingSources: result.groundingSources,
    modelUsed: result.modelUsed,
    tier: "full",
    ...(result.data.notes ? { notes: result.data.notes } : {}),
  };

  // Phase 13 — auto-aggregate cost. fuel.cost is already in baseCurrency
  // (taken from Settings); tolls might be in different currency (e.g. JPY
  // when driving in Japan). Convert tolls → baseCurrency via Settings.fxRates
  // before summing. If conversion fails (no rate), fall back to fuel only.
  let totalCost = fuel.cost;
  let costCurrency = fuel.currency;
  if (tollTotal && tollTotal.amount > 0) {
    if (tollTotal.currency === fuel.currency) {
      totalCost += tollTotal.amount;
    } else {
      try {
        const userId = await getCurrentUserId();
        const settingsRow = await prisma.settings.findUnique({ where: { id: userId } });
        const ratesObj: Record<string, number> = settingsRow?.fxRates
          ? JSON.parse(settingsRow.fxRates) ?? {}
          : {};
        const fxRates = { base: "TWD" as CurrencyCode, rates: ratesObj as Partial<Record<CurrencyCode, number>>, fetchedAt: "", source: "" };
        const tollInBase = convert(
          tollTotal.amount,
          fuel.currency as CurrencyCode,
          fxRates,
          tollTotal.currency as CurrencyCode,
        );
        totalCost += tollInBase;
      } catch {
        // Skip toll if conversion fails; user can manually edit estimatedCost
      }
    }
  }
  totalCost = Math.round(totalCost * 100) / 100;

  // Don't overwrite a user-set estimatedCost — only auto-fill when transport
  // isn't manuallyEdited or estimatedCost is null. The "重設為自動" button
  // flips manuallyEdited back to false if user wants the LLM result later.
  const existing = await prisma.transport.findUnique({
    where: { id: input.transportId },
    select: { manuallyEdited: true, estimatedCost: true },
  });
  const shouldWriteCost = !existing?.manuallyEdited || existing.estimatedCost == null;

  await prisma.transport.update({
    where: { id: input.transportId },
    data: {
      drivingSegmentsJson: JSON.stringify(persisted),
      ...(shouldWriteCost
        ? { estimatedCost: totalCost, fareCurrency: costCurrency, fareAmount: totalCost }
        : {}),
    },
  });

  return persisted;
}

// Convenience wrapper used by the server action — looks up Transport + its
// scheduleItem chain to pull names + lat/lng for the prompt.
export async function estimateDrivingSegmentsForTransport(
  transportId: string,
): Promise<DrivingSegments> {
  const t = await prisma.transport.findUnique({
    where: { id: transportId },
    include: {
      fromItem: { include: { place: true } },
      toItem: { include: { place: true } },
    },
  });
  if (!t) throw new Error("找不到 Transport");
  const fp = t.fromItem.place;
  const tp = t.toItem.place;
  if (!fp?.lat || !fp?.lng || !tp?.lat || !tp?.lng) {
    throw new Error("起點或終點缺少經緯度，無法呼叫 LLM 估算");
  }
  return estimateDrivingSegments({
    transportId,
    originLat: fp.lat,
    originLng: fp.lng,
    destLat: tp.lat,
    destLng: tp.lng,
    originName: fp.name,
    destName: tp.name,
    totalDistanceM: t.distanceMeters ?? 0,
    totalDurationSec: t.durationSec ?? 0,
    encodedPolyline: t.encodedPolyline,
  });
}

// Reset/clear stored estimate.
export async function clearDrivingSegments(transportId: string): Promise<void> {
  await prisma.transport.update({
    where: { id: transportId },
    data: { drivingSegmentsJson: null },
  });
}
