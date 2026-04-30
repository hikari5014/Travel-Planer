"use client";

import { TransportEditDialog } from "@/components/editor/TransportEditDialog";
import { TransportEditDialogV2 } from "@/components/editor/TransportEditDialogV2";
import type { MockTransport } from "@/lib/mock-schedule";

// Phase 11 — pick the right dialog for a Transport segment.
// FLIGHT 段保留 v1 的航班 metadata 表單（Phase 10i / 10n 的 boarding-pass
// 介面）；其他模式都走 v2 Maps-style picker。

export function TransportEditDialogRouter({
  tripId,
  transport,
  fromName,
  toName,
  region,
  onClose,
}: {
  tripId: string;
  transport: MockTransport;
  fromName: string;
  toName: string;
  region?: string;
  onClose: () => void;
}) {
  if (transport.mode === "FLIGHT") {
    return (
      <TransportEditDialog
        tripId={tripId}
        transport={transport}
        fromName={fromName}
        toName={toName}
        {...(region ? { region } : {})}
        onClose={onClose}
      />
    );
  }
  return (
    <TransportEditDialogV2
      tripId={tripId}
      transport={transport}
      fromName={fromName}
      toName={toName}
      onClose={onClose}
    />
  );
}
