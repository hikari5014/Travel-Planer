"use server";

import { revalidatePath } from "next/cache";
import {
  addLLMProvider,
  removeLLMProvider,
  setFxRates,
  setGoogleMapsKey,
  settingsUpdateSchema,
  updateSettings,
} from "@/lib/services/settings-service";

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

// Phase 2 will wire this to a real API; for Phase 0b it just persists whatever
// the user pasted (used for seeding / testing the backup roundtrip).
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
