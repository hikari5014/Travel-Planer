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
  isFlightSegment,
  onClose,
}: {
  tripId: string;
  transport: MockTransport;
  fromName: string;
  toName: string;
  region?: string;
  // 兩端都是機場 / 任一端 ScheduleItem.kind === FLIGHT / Transport.mode 已是 FLIGHT
  // 都算飛行段 — 走 v1 的航班 metadata 表單。
  isFlightSegment?: boolean;
  onClose: () => void;
}) {
  const useV1 = transport.mode === "FLIGHT" || isFlightSegment === true;
  if (useV1) {
    return (
      <TransportEditDialog
        tripId={tripId}
        transport={transport}
        fromName={fromName}
        toName={toName}
        {...(region ? { region } : {})}
        // 航段被偵測為飛行但 transport.mode 還沒更新（例如剛加完景點還在
        // WALKING auto-default），帶 initialMode=FLIGHT 讓 dialog 一開就停
        // 在飛行表單。
        initialMode={transport.mode === "FLIGHT" ? undefined : "FLIGHT"}
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
