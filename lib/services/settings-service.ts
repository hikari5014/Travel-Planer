import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encryptString, decryptString, maskKey } from "@/lib/crypto";
import type { CurrencyCode } from "@/lib/currency";
import { getCurrentUserId } from "@/lib/auth/current-user";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const llmProviderSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(40),
  kind: z.enum(["openai", "anthropic", "google", "custom"]),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().min(1),
  apiKeyEnc: z.string().min(1),       // ciphertext (base64)
  lastTestedAt: z.string().nullable().optional(),
});
export type StoredLLMProvider = z.infer<typeof llmProviderSchema>;

export type LLMProviderPublic = Omit<StoredLLMProvider, "apiKeyEnc"> & {
  apiKeyMask: string; // safe to show in UI
};

export const mapProviderSchema = z.enum(["osm", "mapbox", "google", "kakao"]);
export type MapProvider = z.infer<typeof mapProviderSchema>;

export const settingsUpdateSchema = z.object({
  baseCurrency: z.string().length(3).optional(),
  localCurrency: z.string().length(3).optional(),
  defaultFuelPricePerLiter: z.number().min(0).max(500).optional(),
  defaultFuelEfficiencyKmPerL: z.number().min(0.1).max(100).optional(),
  // Phase 12g — flight buffer defaults (in minutes)
  defaultFlightCheckInBufferMinIntl: z.number().int().min(0).max(600).optional(),
  defaultFlightCheckInBufferMinDomestic: z.number().int().min(0).max(600).optional(),
  defaultFlightImmigrationBufferMinIntl: z.number().int().min(0).max(600).optional(),
  defaultFlightImmigrationBufferMinDomestic: z.number().int().min(0).max(600).optional(),
  defaultProviderId: z.string().nullable().optional(),
  defaultModel: z.string().nullable().optional(),
  monthlyBudgetUsd: z.number().min(0).max(10_000).nullable().optional(),
  mapProvider: mapProviderSchema.optional(),
});
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Singleton accessor
// ─────────────────────────────────────────────────────────────────────────────

// Settings rows are now per-user. id === userId. Phase 0–6 single-user mode
// resolves to "default-user" via getCurrentUserId(). Old `SETTINGS_ID` const
// is preserved as an alias to avoid breaking older callers, but new code
// should call getSettingsId() so the user-scoping is explicit.
export async function getSettingsId(): Promise<string> {
  return getCurrentUserId();
}
// @deprecated — call getSettingsId() instead.
export const SETTINGS_ID = "default-user";

async function ensureSettings() {
  const id = await getSettingsId();
  return prisma.settings.upsert({
    where: { id },
    update: {},
    create: { id },
  });
}

export type SettingsView = {
  baseCurrency: CurrencyCode;
  localCurrency: CurrencyCode;
  defaultFuelPricePerLiter: number;
  defaultFuelEfficiencyKmPerL: number;
  defaultFlightCheckInBufferMinIntl: number;
  defaultFlightCheckInBufferMinDomestic: number;
  defaultFlightImmigrationBufferMinIntl: number;
  defaultFlightImmigrationBufferMinDomestic: number;
  defaultProviderId: string | null;
  defaultModel: string | null;
  monthlyBudgetUsd: number | null;
  fxRates: Record<string, number>;
  fxFetchedAt: string | null;
  mapProvider: MapProvider;
  hasGoogleMapsKey: boolean;
  googleMapId: string | null;
  hasMapboxKey: boolean;
  hasAviationStackKey: boolean;
  hasAeroDataBoxKey: boolean;
  // Phase 15 — Kakao Maps JavaScript SDK key (Korean transit)
  hasKakaoJavascriptKey: boolean;
  // Phase P1 — Kakao Local REST API key (Korean POI search)
  hasKakaoRestApiKey: boolean;
  taxiRegionRatesJson: string | null;
  recommendWeightsJson: string | null;
  llmProviders: LLMProviderPublic[];
};

export async function getSettingsView(): Promise<SettingsView> {
  const s = await ensureSettings();

  let providersRaw: StoredLLMProvider[] = [];
  try {
    const parsed = JSON.parse(s.llmProviders) as unknown;
    if (Array.isArray(parsed)) {
      providersRaw = parsed.map((p) => llmProviderSchema.parse(p));
    }
  } catch {
    /* ignore malformed; treat as empty */
  }

  const fxRates: Record<string, number> = (() => {
    try {
      const r = s.fxRates ? JSON.parse(s.fxRates) : {};
      return typeof r === "object" && r ? r : {};
    } catch {
      return {};
    }
  })();

  return {
    baseCurrency: s.baseCurrency as CurrencyCode,
    localCurrency: s.localCurrency as CurrencyCode,
    defaultFuelPricePerLiter: s.defaultFuelPricePerLiter,
    defaultFuelEfficiencyKmPerL: s.defaultFuelEfficiencyKmPerL,
    defaultFlightCheckInBufferMinIntl: s.defaultFlightCheckInBufferMinIntl,
    defaultFlightCheckInBufferMinDomestic: s.defaultFlightCheckInBufferMinDomestic,
    defaultFlightImmigrationBufferMinIntl: s.defaultFlightImmigrationBufferMinIntl,
    defaultFlightImmigrationBufferMinDomestic: s.defaultFlightImmigrationBufferMinDomestic,
    defaultProviderId: s.defaultProviderId,
    defaultModel: s.defaultModel,
    monthlyBudgetUsd: s.monthlyBudgetUsd,
    fxRates,
    fxFetchedAt: s.fxFetchedAt?.toISOString() ?? null,
    mapProvider: (s.mapProvider as MapProvider) ?? "osm",
    hasGoogleMapsKey: !!s.googleMapsApiKeyEnc,
    googleMapId: s.googleMapId ?? null,
    hasMapboxKey: !!s.mapboxApiKeyEnc,
    hasAviationStackKey: !!s.aviationStackKeyEnc,
    hasAeroDataBoxKey: !!s.aeroDataBoxKeyEnc,
    hasKakaoJavascriptKey: !!s.kakaoJavascriptKeyEnc,
    hasKakaoRestApiKey: !!s.kakaoRestApiKeyEnc,
    taxiRegionRatesJson: s.taxiRegionRatesJson ?? null,
    recommendWeightsJson: s.recommendWeightsJson ?? null,
    llmProviders: providersRaw.map((p) => {
      let mask = "—";
      try {
        mask = maskKey(decryptString(p.apiKeyEnc));
      } catch {
        mask = "(無法解密)";
      }
      const { apiKeyEnc: _enc, ...rest } = p;
      return { ...rest, apiKeyMask: mask } satisfies LLMProviderPublic;
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

// All mutation helpers below resolve the row via ensureSettings() so the
// id matches whatever getCurrentUserId() returns. Phase 8 introduced the
// cookie-based identity; pinning writes to a hard-coded SETTINGS_ID would
// route them to the wrong row when the user's cookie value isn't
// "default-user" (= cause of Phase 8 "form silently doesn't save" bug).

export async function updateSettings(input: SettingsUpdateInput) {
  const s = await ensureSettings();
  return prisma.settings.update({
    where: { id: s.id },
    data: input,
  });
}

export async function setGoogleMapsKey(rawKey: string | null) {
  const s = await ensureSettings();
  return prisma.settings.update({
    where: { id: s.id },
    data: { googleMapsApiKeyEnc: rawKey ? encryptString(rawKey) : null },
  });
}

export async function setGoogleMapId(mapId: string | null) {
  const s = await ensureSettings();
  return prisma.settings.update({
    where: { id: s.id },
    data: { googleMapId: mapId || null },
  });
}

export async function getGoogleMapsKey(): Promise<string | null> {
  const s = await ensureSettings();
  if (!s.googleMapsApiKeyEnc) return null;
  return decryptString(s.googleMapsApiKeyEnc);
}

export async function setMapboxKey(rawKey: string | null) {
  const s = await ensureSettings();
  return prisma.settings.update({
    where: { id: s.id },
    data: { mapboxApiKeyEnc: rawKey ? encryptString(rawKey) : null },
  });
}

export async function getMapboxKey(): Promise<string | null> {
  const s = await ensureSettings();
  if (!s.mapboxApiKeyEnc) return null;
  return decryptString(s.mapboxApiKeyEnc);
}

export async function setAviationStackKey(rawKey: string | null) {
  const s = await ensureSettings();
  return prisma.settings.update({
    where: { id: s.id },
    data: { aviationStackKeyEnc: rawKey ? encryptString(rawKey) : null },
  });
}

export async function getAviationStackKey(): Promise<string | null> {
  const s = await ensureSettings();
  if (!s.aviationStackKeyEnc) return null;
  return decryptString(s.aviationStackKeyEnc);
}

export async function setAeroDataBoxKey(rawKey: string | null) {
  const s = await ensureSettings();
  return prisma.settings.update({
    where: { id: s.id },
    data: { aeroDataBoxKeyEnc: rawKey ? encryptString(rawKey) : null },
  });
}

export async function getAeroDataBoxKey(): Promise<string | null> {
  const s = await ensureSettings();
  if (!s.aeroDataBoxKeyEnc) return null;
  return decryptString(s.aeroDataBoxKeyEnc);
}

// Phase 15 — Kakao Maps JavaScript SDK key for Korean transit lookup.
export async function setKakaoJavascriptKey(rawKey: string | null) {
  const s = await ensureSettings();
  return prisma.settings.update({
    where: { id: s.id },
    data: { kakaoJavascriptKeyEnc: rawKey ? encryptString(rawKey) : null },
  });
}

export async function getKakaoJavascriptKey(): Promise<string | null> {
  const s = await ensureSettings();
  if (!s.kakaoJavascriptKeyEnc) return null;
  return decryptString(s.kakaoJavascriptKeyEnc);
}

// Phase P1 — Kakao Local REST API key (server-side Korean POI search).
export async function setKakaoRestApiKey(rawKey: string | null) {
  const s = await ensureSettings();
  return prisma.settings.update({
    where: { id: s.id },
    data: { kakaoRestApiKeyEnc: rawKey ? encryptString(rawKey) : null },
  });
}

export async function getKakaoRestApiKey(): Promise<string | null> {
  const s = await ensureSettings();
  if (!s.kakaoRestApiKeyEnc) return null;
  return decryptString(s.kakaoRestApiKeyEnc);
}

// Phase 11 — point-to-point picker config (taxi region rates + recommendation weights)
export async function setTaxiRegionRatesRaw(jsonRaw: string | null) {
  const s = await ensureSettings();
  return prisma.settings.update({
    where: { id: s.id },
    data: { taxiRegionRatesJson: jsonRaw },
  });
}

export async function getTaxiRegionRatesRaw(): Promise<string | null> {
  const s = await ensureSettings();
  return s.taxiRegionRatesJson ?? null;
}

export async function setRecommendWeightsRaw(jsonRaw: string | null) {
  const s = await ensureSettings();
  return prisma.settings.update({
    where: { id: s.id },
    data: { recommendWeightsJson: jsonRaw },
  });
}

export async function getRecommendWeightsRaw(): Promise<string | null> {
  const s = await ensureSettings();
  return s.recommendWeightsJson ?? null;
}

export async function setMapProvider(provider: MapProvider) {
  const s = await ensureSettings();
  return prisma.settings.update({
    where: { id: s.id },
    data: { mapProvider: provider },
  });
}

// LLM provider CRUD
export async function addLLMProvider(input: {
  label: string;
  kind: StoredLLMProvider["kind"];
  baseUrl?: string;
  defaultModel: string;
  rawApiKey: string;
}): Promise<string> {
  const s = await ensureSettings();
  const id = `${input.kind}-${Math.random().toString(36).slice(2, 8)}`;
  const next: StoredLLMProvider = {
    id,
    label: input.label,
    kind: input.kind,
    baseUrl: input.baseUrl,
    defaultModel: input.defaultModel,
    apiKeyEnc: encryptString(input.rawApiKey),
  };
  const list = readProviders(s.llmProviders);
  list.push(next);
  await prisma.settings.update({
    where: { id: s.id },
    data: {
      llmProviders: JSON.stringify(list),
      // First provider added becomes default automatically.
      defaultProviderId: s.defaultProviderId ?? id,
      defaultModel: s.defaultModel ?? input.defaultModel,
    },
  });
  return id;
}

export async function removeLLMProvider(id: string) {
  const s = await ensureSettings();
  const list = readProviders(s.llmProviders).filter((p) => p.id !== id);
  await prisma.settings.update({
    where: { id: s.id },
    data: {
      llmProviders: JSON.stringify(list),
      defaultProviderId:
        s.defaultProviderId === id ? (list[0]?.id ?? null) : s.defaultProviderId,
    },
  });
}

export async function getDecryptedProviderKey(id: string): Promise<string | null> {
  const s = await ensureSettings();
  const p = readProviders(s.llmProviders).find((x) => x.id === id);
  if (!p) return null;
  return decryptString(p.apiKeyEnc);
}

function readProviders(json: string): StoredLLMProvider[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => llmProviderSchema.parse(p));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FX rates (Phase 2 will hit a real API; Phase 0b just stores values)
// ─────────────────────────────────────────────────────────────────────────────

export async function setFxRates(rates: Record<string, number>) {
  await ensureSettings();
  await prisma.settings.update({
    where: { id: (await ensureSettings()).id },
    data: { fxRates: JSON.stringify(rates), fxFetchedAt: new Date() },
  });
}
