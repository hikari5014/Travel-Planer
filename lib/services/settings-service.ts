import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encryptString, decryptString, maskKey } from "@/lib/crypto";
import type { CurrencyCode } from "@/lib/currency";

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

export const settingsUpdateSchema = z.object({
  baseCurrency: z.string().length(3).optional(),
  localCurrency: z.string().length(3).optional(),
  defaultFuelPricePerLiter: z.number().min(0).max(500).optional(),
  defaultFuelEfficiencyKmPerL: z.number().min(0.1).max(100).optional(),
  defaultProviderId: z.string().nullable().optional(),
  defaultModel: z.string().nullable().optional(),
  monthlyBudgetUsd: z.number().min(0).max(10_000).nullable().optional(),
});
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Singleton accessor
// ─────────────────────────────────────────────────────────────────────────────

export const SETTINGS_ID = "singleton";

async function ensureSettings() {
  return prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
}

export type SettingsView = {
  baseCurrency: CurrencyCode;
  localCurrency: CurrencyCode;
  defaultFuelPricePerLiter: number;
  defaultFuelEfficiencyKmPerL: number;
  defaultProviderId: string | null;
  defaultModel: string | null;
  monthlyBudgetUsd: number | null;
  fxRates: Record<string, number>;
  fxFetchedAt: string | null;
  hasGoogleMapsKey: boolean;
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
    defaultProviderId: s.defaultProviderId,
    defaultModel: s.defaultModel,
    monthlyBudgetUsd: s.monthlyBudgetUsd,
    fxRates,
    fxFetchedAt: s.fxFetchedAt?.toISOString() ?? null,
    hasGoogleMapsKey: !!s.googleMapsApiKeyEnc,
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

export async function updateSettings(input: SettingsUpdateInput) {
  await ensureSettings();
  return prisma.settings.update({
    where: { id: SETTINGS_ID },
    data: input,
  });
}

export async function setGoogleMapsKey(rawKey: string | null) {
  await ensureSettings();
  return prisma.settings.update({
    where: { id: SETTINGS_ID },
    data: { googleMapsApiKeyEnc: rawKey ? encryptString(rawKey) : null },
  });
}

export async function getGoogleMapsKey(): Promise<string | null> {
  const s = await ensureSettings();
  if (!s.googleMapsApiKeyEnc) return null;
  return decryptString(s.googleMapsApiKeyEnc);
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
    where: { id: SETTINGS_ID },
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
    where: { id: SETTINGS_ID },
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
    where: { id: SETTINGS_ID },
    data: { fxRates: JSON.stringify(rates), fxFetchedAt: new Date() },
  });
}
