"use server";

import { parseTransitText, type ParsedTransit } from "@/lib/services/transit-rule-parser";
import { parseTransitWithLlm } from "@/lib/services/transit-llm-parser";

export async function parseTransitPasteRuleBasedAction(rawText: string): Promise<ParsedTransit> {
  return parseTransitText(rawText);
}

export type LlmParseResult =
  | { ok: true; parsed: ParsedTransit }
  | { ok: false; error: string };

export async function parseTransitPasteLlmAction(rawText: string): Promise<LlmParseResult> {
  try {
    const parsed = await parseTransitWithLlm(rawText);
    return { ok: true, parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI 解析失敗";
    return { ok: false, error: message };
  }
}
