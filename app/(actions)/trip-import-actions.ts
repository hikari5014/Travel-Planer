"use server";

import { revalidatePath } from "next/cache";
import {
  importSingleDayIntoPlan,
  importTripFromPayload,
  type ImportResult,
  type SingleDayImportResult,
} from "@/lib/services/trip-import-service";
import { naturalLanguageToImportPayload } from "@/lib/services/trip-import-llm";

export type ImportActionResult =
  | { ok: true; result: ImportResult }
  | { ok: false; error: string; details?: string };

// Phase 15 — strip an optional markdown code fence around the pasted JSON.
// The schema doc now asks the LLM to wrap output in ```json … ``` (so the
// chat UI shows a copy button). Most chat clients strip the fence on copy,
// but if the user copies the whole block manually we accept that too.
function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  // Drop the opening fence line (e.g. ```json) and the trailing fence.
  const withoutOpen = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "");
  return withoutOpen.replace(/\n?```\s*$/, "").trim();
}

// Path 1: paste JSON directly (no LLM cost).
export async function importTripFromJsonAction(rawJson: string): Promise<ImportActionResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(rawJson));
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

// Phase 14m commit 3 — single-day variant. Imports JSON into a specific Day
// of a specific Plan. On conflict (target day already has items) the plan
// is auto-cloned as "方案 N" and the import lands in the clone.
export type SingleDayImportActionResult =
  | { ok: true; result: SingleDayImportResult }
  | { ok: false; error: string; details?: string };

export async function importSingleDayFromJsonAction(
  tripId: string,
  planId: string,
  dayId: string,
  rawJson: string,
): Promise<SingleDayImportActionResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(rawJson));
  } catch (e) {
    return { ok: false, error: "JSON 格式錯誤", details: e instanceof Error ? e.message : String(e) };
  }
  try {
    const result = await importSingleDayIntoPlan(tripId, planId, dayId, parsed);
    revalidatePath(`/trips/${tripId}`);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: "匯入失敗", details: e instanceof Error ? e.message : String(e) };
  }
}

export async function importSingleDayFromNlAction(
  tripId: string,
  planId: string,
  dayId: string,
  rawText: string,
): Promise<SingleDayImportActionResult> {
  if (!rawText.trim()) return { ok: false, error: "請先描述行程內容" };
  let payload: unknown;
  try {
    payload = await naturalLanguageToImportPayload(rawText);
  } catch (e) {
    return { ok: false, error: "AI 解析失敗", details: e instanceof Error ? e.message : String(e) };
  }
  try {
    const result = await importSingleDayIntoPlan(tripId, planId, dayId, payload);
    revalidatePath(`/trips/${tripId}`);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: "匯入失敗", details: e instanceof Error ? e.message : String(e) };
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
