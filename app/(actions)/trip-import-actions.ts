"use server";

import { revalidatePath } from "next/cache";
import {
  importTripFromPayload,
  type ImportResult,
} from "@/lib/services/trip-import-service";
import { naturalLanguageToImportPayload } from "@/lib/services/trip-import-llm";

export type ImportActionResult =
  | { ok: true; result: ImportResult }
  | { ok: false; error: string; details?: string };

// Path 1: paste JSON directly (no LLM cost).
export async function importTripFromJsonAction(rawJson: string): Promise<ImportActionResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    return {
      ok: false,
      error: "JSON 格式錯誤",
      details: e instanceof Error ? e.message : String(e),
    };
  }
  try {
    const result = await importTripFromPayload(parsed);
    revalidatePath("/");
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: "匯入失敗",
      details: e instanceof Error ? e.message : String(e),
    };
  }
}

// Path 2: natural-language description (uses internal LLM).
export async function importTripFromNlAction(rawText: string): Promise<ImportActionResult> {
  if (!rawText.trim()) {
    return { ok: false, error: "請先描述行程內容" };
  }
  let payload: unknown;
  try {
    payload = await naturalLanguageToImportPayload(rawText);
  } catch (e) {
    return {
      ok: false,
      error: "AI 解析失敗",
      details: e instanceof Error ? e.message : String(e),
    };
  }
  try {
    const result = await importTripFromPayload(payload);
    revalidatePath("/");
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: "匯入失敗",
      details: e instanceof Error ? e.message : String(e),
    };
  }
}
