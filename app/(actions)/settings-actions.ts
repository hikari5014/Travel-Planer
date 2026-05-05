"use server";

import { revalidatePath } from "next/cache";
import {
  addLLMProvider,
  mapProviderSchema,
  removeLLMProvider,
  setFxRates,
  setGoogleMapId,
  setGoogleMapsKey,
  setAviationStackKey,
  setAeroDataBoxKey,
  setMapboxKey,
  setRecommendWeightsRaw,
  setTaxiRegionRatesRaw,
  setMapProvider,
  settingsUpdateSchema,
  updateSettings,
} from "@/lib/services/settings-service";
import { refreshFxRates } from "@/lib/services/fx-service";

export async function updateSettingsAction(formData: FormData) {
  const parsed = settingsUpdateSchema.safeParse({
    baseCurrency: formData.get("baseCurrency") || undefined,
    localCurrency: formData.get("localCurrency") || undefined,
    defaultFuelPricePerLiter: formData.get("defaultFuelPricePerLiter")
      ? Number(formData.get("defaultFuelPricePerLiter"))
      : undefined,
    defaultFuelEfficiencyKmPerL: formData.get("defaultFuelEfficiencyKmPerL")
      ? Number(formData.get("defaultFuelEfficiencyKmPerL"))
      : undefined,
    defaultFlightCheckInBufferMinIntl: formData.get("defaultFlightCheckInBufferMinIntl")
      ? Number(formData.get("defaultFlightCheckInBufferMinIntl"))
      : undefined,
    defaultFlightCheckInBufferMinDomestic: formData.get("defaultFlightCheckInBufferMinDomestic")
      ? Number(formData.get("defaultFlightCheckInBufferMinDomestic"))
      : undefined,
    defaultFlightImmigrationBufferMinIntl: formData.get("defaultFlightImmigrationBufferMinIntl")
      ? Number(formData.get("defaultFlightImmigrationBufferMinIntl"))
      : undefined,
    defaultFlightImmigrationBufferMinDomestic: formData.get("defaultFlightImmigrationBufferMinDomestic")
      ? Number(formData.get("defaultFlightImmigrationBufferMinDomestic"))
      : undefined,
    monthlyBudgetUsd: formData.get("monthlyBudgetUsd")
      ? Number(formData.get("monthlyBudgetUsd"))
      : undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "輸入有誤");
  }
  await updateSettings(parsed.data);
  revalidatePath("/settings");
}

export async function setGoogleMapsKeyAction(formData: FormData) {
  const raw = (formData.get("googleMapsKey") as string)?.trim();
  await setGoogleMapsKey(raw || null);
  revalidatePath("/settings");
}

export async function setGoogleMapIdAction(formData: FormData) {
  const raw = (formData.get("googleMapId") as string)?.trim();
  await setGoogleMapId(raw || null);
  revalidatePath("/settings");
  revalidatePath("/trips/[tripId]", "page");
}

export async function setMapboxKeyAction(formData: FormData) {
  const raw = (formData.get("mapboxKey") as string)?.trim();
  await setMapboxKey(raw || null);
  revalidatePath("/settings");
}

export async function setAviationStackKeyAction(formData: FormData) {
  const raw = (formData.get("aviationStackKey") as string)?.trim();
  await setAviationStackKey(raw || null);
  revalidatePath("/settings");
}

export async function setAeroDataBoxKeyAction(formData: FormData) {
  const raw = (formData.get("aeroDataBoxKey") as string)?.trim();
  await setAeroDataBoxKey(raw || null);
  revalidatePath("/settings");
}

// Phase 11 — taxi region rates + recommendation weights
// 直接接 JSON string（client 端用 textarea 編輯方便先跑起來，未來再美化）
export async function setTaxiRegionRatesAction(formData: FormData) {
  const raw = (formData.get("taxiRegionRates") as string)?.trim();
  if (raw) {
    try {
      JSON.parse(raw);
    } catch {
      throw new Error("taxiRegionRates 必須是合法 JSON");
    }
  }
  await setTaxiRegionRatesRaw(raw || null);
  revalidatePath("/settings");
}

export async function setRecommendWeightsAction(formData: FormData) {
  const raw = (formData.get("recommendWeights") as string)?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.time !== "number" || typeof parsed.cost !== "number") {
        throw new Error();
      }
    } catch {
      throw new Error("recommendWeights 必須是 { time, cost, comfort, co2 } 的 JSON 物件");
    }
  }
  await setRecommendWeightsRaw(raw || null);
  revalidatePath("/settings");
}

export async function setMapProviderAction(formData: FormData) {
  const value = (formData.get("mapProvider") as string)?.trim();
  const parsed = mapProviderSchema.safeParse(value);
  if (!parsed.success) throw new Error("地圖供應商代號錯誤");
  await setMapProvider(parsed.data);
  revalidatePath("/settings");
  // Trips' editor pages also read provider — invalidate them too.
  revalidatePath("/trips/[tripId]", "page");
}

export type AddProviderResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string };

// useActionState-friendly signature: takes prev state + formData, returns
// { ok, error? } so the form can show the error inline. Throwing inside a
// server action makes it disappear silently to the user (Next.js shows a
// generic dev-mode toast at best); returning structured results is much
// kinder.
export async function addLLMProviderAction(
  _prev: AddProviderResult | null,
  formData: FormData,
): Promise<AddProviderResult> {
  try {
    const label = ((formData.get("label") as string) ?? "").trim();
    const kindRaw = (formData.get("kind") as string) ?? "openai";
    const baseUrl = ((formData.get("baseUrl") as string) ?? "").trim() || undefined;
    const defaultModel = ((formData.get("defaultModel") as string) ?? "").trim();
    const rawApiKey = ((formData.get("rawApiKey") as string) ?? "").trim();
    if (!label) return { ok: false, error: "請填寫顯示名稱" };
    if (!defaultModel) return { ok: false, error: "請填寫 Model 名稱" };
    if (!rawApiKey) return { ok: false, error: "請填寫 API Key" };
    if (!["openai", "anthropic", "google", "custom"].includes(kindRaw)) {
      return { ok: false, error: `未知的 provider 種類：${kindRaw}` };
    }
    if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
      return { ok: false, error: "Base URL 必須以 http:// 或 https:// 開頭" };
    }
    const kind = kindRaw as "openai" | "anthropic" | "google" | "custom";
    const providerId = await addLLMProvider({
      label,
      kind,
      ...(baseUrl ? { baseUrl } : {}),
      defaultModel,
      rawApiKey,
    });
    revalidatePath("/settings");
    return { ok: true, providerId };
  } catch (e) {
    // Surface ANY thrown error so the user sees it instead of a blank form.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[addLLMProviderAction] failed:", msg);
    return { ok: false, error: msg };
  }
}

export async function removeLLMProviderAction(id: string) {
  await removeLLMProvider(id);
  revalidatePath("/settings");
}

export async function refreshFxRatesAction() {
  const { rates, fetchedAt } = await refreshFxRates();
  revalidatePath("/settings");
  return { rates, fetchedAt: fetchedAt.toISOString() };
}

// Manually pasted rates (for offline editing / debugging).
export async function setFxRatesAction(formData: FormData) {
  const json = (formData.get("fxRatesJson") as string)?.trim();
  if (!json) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("FX rates 必須是合法 JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("FX rates 必須是物件");
  await setFxRates(parsed as Record<string, number>);
  revalidatePath("/settings");
}
