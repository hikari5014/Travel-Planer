"use server";

import { revalidatePath } from "next/cache";
import {
  addLLMProvider,
  mapProviderSchema,
  removeLLMProvider,
  setFxRates,
  setGoogleMapId,
  setGoogleMapsKey,
  setMapboxKey,
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

export async function setMapProviderAction(formData: FormData) {
  const value = (formData.get("mapProvider") as string)?.trim();
  const parsed = mapProviderSchema.safeParse(value);
  if (!parsed.success) throw new Error("地圖供應商代號錯誤");
  await setMapProvider(parsed.data);
  revalidatePath("/settings");
  // Trips' editor pages also read provider — invalidate them too.
  revalidatePath("/trips/[tripId]", "page");
}

export async function addLLMProviderAction(formData: FormData) {
  const label = (formData.get("label") as string)?.trim();
  const kind = formData.get("kind") as "openai" | "anthropic" | "google" | "custom";
  const baseUrl = (formData.get("baseUrl") as string)?.trim() || undefined;
  const defaultModel = (formData.get("defaultModel") as string)?.trim();
  const rawApiKey = (formData.get("rawApiKey") as string)?.trim();
  if (!label || !defaultModel || !rawApiKey) {
    throw new Error("請填齊 Label、Model、API Key");
  }
  await addLLMProvider({ label, kind, baseUrl, defaultModel, rawApiKey });
  revalidatePath("/settings");
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
