"use client";

import { TransportEditDialogV2 } from "@/components/editor/TransportEditDialogV2";
import type { MockTransport } from "@/lib/mock-schedule";

// Phase 11.3 — single dialog for all Transport segments. v2 picker has the
// FLIGHT mode integrated (FlightInfoPanel renders inside) so we no longer
// need the v1 fallback. Router exists only to choose the initialMode based
// on FLIGHT-segment detection.

export function TransportEditDialogRouter({
  tripId,
  transport,
  fromName,
  toName,
  fromLat,
  fromLng,
  toLat,
  toLng,
  googleMapsKey,
  kakaoMapsKey,
  isFlightSegment,
  onClose,
}: {
  tripId: string;
  transport: MockTransport;
  fromName: string;
  toName: string;
  fromLat?: number | null;
  fromLng?: number | null;
  toLat?: number | null;
  toLng?: number | null;
  googleMapsKey?: string | null;
  kakaoMapsKey?: string | null;
  region?: string; // accepted for backward compat; unused
  // 兩端都是機場 / 任一端 ScheduleItem.kind === FLIGHT / Transport.mode === FLIGHT
  isFlightSegment?: boolean;
  onClose: () => void;
}) {
  const startInFlight = transport.mode === "FLIGHT" || isFlightSegment === true;
  return (
    <TransportEditDialogV2
      tripId={tripId}
      transport={transport}
      fromName={fromName}
      toName={toName}
      fromLat={fromLat}
      fromLng={fromLng}
      toLat={toLat}
      toLng={toLng}
      googleMapsKey={googleMapsKey}
      kakaoMapsKey={kakaoMapsKey}
      {...(startInFlight ? { initialMode: "FLIGHT" as const } : {})}
      onClose={onClose}
    />
  );
}
