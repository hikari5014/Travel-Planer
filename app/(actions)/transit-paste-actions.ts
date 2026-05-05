"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseTransitText, type ParsedTransit } from "@/lib/services/transit-rule-parser";
import { parseTransitWithLlm } from "@/lib/services/transit-llm-parser";
import type { TransitSteps } from "@/lib/services/transit-steps-types";

export async function parseTransitPasteRuleBasedAction(rawText: string): Promise<ParsedTransit> {
  return parseTransitText(rawText);
}

export type LlmParseResult =
  | { ok: true; parsed: ParsedTransit; steps: TransitSteps | null }
  | { ok: false; error: string };

export async function parseTransitPasteLlmAction(rawText: string): Promise<LlmParseResult> {
  try {
    const { flat, steps } = await parseTransitWithLlm(rawText);
    return { ok: true, parsed: flat, steps };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI 解析失敗";
    return { ok: false, error: message };
  }
}

// Phase 12b — write the parsed step timeline to a Transport row. Called from
// TransportEditDialogV2 after the user clicks 「套用」 in the paste panel.
export async function applyTransitStepsAction(
  tripId: string,
  transportId: string,
  steps: TransitSteps | null,
): Promise<void> {
  await prisma.transport.update({
    where: { id: transportId },
    data: {
      transitStepsJson: steps ? JSON.stringify(steps) : null,
    },
  });
  revalidatePath(`/trips/${tripId}`);
}
