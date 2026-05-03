"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Plane, Sparkles } from "lucide-react";
import {
  applyFlightSuggestionToTransportAction,
  suggestFlightInfoAction,
} from "@/app/(actions)/flight-actions";
import { updateTransportAction } from "@/app/(actions)/transport-actions";
import { KindMetadataForm } from "@/components/editor/KindMetadataForm";
import type { MockTransport } from "@/lib/mock-schedule";

// Phase 11.3 — extracted FLIGHT info panel (was inside TransportEditDialog v1).
// Now embedded inside V2 picker so we have a single non-flight + flight UI.
//
// Self-contained:
//   · Reads transport.metadata for initial flightMeta
//   · Renders KindMetadataForm (FLIGHT) + AI 補完 inline button
//   · After AI lookup, persists via applyFlightSuggestionToTransport
//   · "儲存覆蓋" button calls updateTransport with mode=FLIGHT + metadataJson
//   · "切換為地面段" link lets user back out (sets mode back to DRIVING)

export function FlightInfoPanel({
  tripId,
  transport,
  onClose,
  onSwitchToGround,
}: {
  tripId: string;
  transport: MockTransport;
  onClose: () => void;
  onSwitchToGround: () => void;
}) {
  const transportId = transport.id;
  const [flightMeta, setFlightMeta] = useState<Record<string, unknown>>(
    (transport.metadata ?? {}) as Record<string, unknown>,
  );
  const [flightLookupPending, startFlightLookup] = useTransition();
  const [flightLookupError, setFlightLookupError] = useState<string | null>(null);
  const [flightLookupSource, setFlightLookupSource] =
    useState<"aviationstack" | "ai" | "iata-only" | null>(null);
  const [saving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Auto-derive distance / duration / cost from metadata so they stay in sync
  // with the saved Transport.* fields (the V2 picker doesn't show these for
  // FLIGHT mode; we just persist them on save).
  const [derivedDistanceM, setDerivedDistanceM] = useState(transport.distanceM);
  const [derivedDurationSec, setDerivedDurationSec] = useState(transport.durationSec);
  const [derivedCost, setDerivedCost] = useState<number | null>(
    transport.estimatedCost ?? null,
  );

  useEffect(() => {
    const m = flightMeta as Record<string, unknown>;
    const depAirport = typeof m.depAirport === "string" ? m.depAirport : null;
    const arrAirport = typeof m.arrAirport === "string" ? m.arrAirport : null;
    const depTime = typeof m.depTime === "string" ? m.depTime : null;
    const arrTime = typeof m.arrTime === "string" ? m.arrTime : null;
    const arrDateOffset =
      typeof m.arrDateOffset === "number"
        ? Math.max(0, Math.min(2, m.arrDateOffset))
        : 0;
    const ticketPrice = typeof m.ticketPrice === "number" ? m.ticketPrice : null;

    if (depAirport && arrAirport) {
      import("@/lib/iata-airports").then(({ distanceBetweenAirports }) => {
        const d = distanceBetweenAirports(depAirport, arrAirport);
        if (d != null) setDerivedDistanceM(d);
      });
    }
    if (depTime && arrTime && /^\d{2}:\d{2}$/.test(depTime) && /^\d{2}:\d{2}$/.test(arrTime)) {
      const [dh, dm] = depTime.split(":").map(Number);
      const [ah, am] = arrTime.split(":").map(Number);
      const depM = (dh ?? 0) * 60 + (dm ?? 0);
      let arrM = (ah ?? 0) * 60 + (am ?? 0) + arrDateOffset * 24 * 60;
      if (arrM <= depM) arrM += 24 * 60;
      const totalMin = Math.min(48 * 60, arrM - depM);
      setDerivedDurationSec(totalMin * 60);
    }
    if (ticketPrice != null && ticketPrice > 0) setDerivedCost(ticketPrice);
  }, [flightMeta]);

  const flightDate = new Date().toISOString().slice(0, 10);

  async function handleFlightLookup() {
    if (!transportId) return;
    const flightNumber = (flightMeta.flightNumber as string | null | undefined)?.trim();
    if (!flightNumber) {
      setFlightLookupError("請先填入航班號碼");
      return;
    }
    setFlightLookupError(null);
    setFlightLookupSource(null);
    startFlightLookup(async () => {
      const r = await suggestFlightInfoAction({ flightNumber, date: flightDate });
      if (!r.ok) {
        setFlightLookupError(r.error);
        return;
      }
      const ai = r.info;
      setFlightLookupSource(r.source);
      setFlightMeta((prev) => ({
        ...prev,
        airline: prev.airline ?? ai.airline ?? null,
        depAirport: prev.depAirport ?? ai.depAirport ?? null,
        arrAirport: prev.arrAirport ?? ai.arrAirport ?? null,
        depCity: prev.depCity ?? ai.depCity ?? null,
        arrCity: prev.arrCity ?? ai.arrCity ?? null,
        depTime: prev.depTime ?? ai.depTime ?? null,
        arrTime: prev.arrTime ?? ai.arrTime ?? null,
        terminal: prev.terminal ?? ai.terminal ?? null,
        isInternational: prev.isInternational ?? ai.isInternational ?? null,
      }));
      const persist = await applyFlightSuggestionToTransportAction({
        tripId,
        transportId,
        info: ai,
        date: flightDate,
      });
      if (!persist.ok) setFlightLookupError(persist.error ?? "套用失敗");
    });
  }

  async function handleSave() {
    if (!transportId) return;
    setSaveError(null);
    startSave(async () => {
      try {
        await updateTransportAction(tripId, transportId, {
          mode: "FLIGHT",
          distanceMeters: derivedDistanceM,
          durationSec: derivedDurationSec,
          estimatedCost: derivedCost,
          metadataJson:
            Object.keys(flightMeta).length > 0 ? JSON.stringify(flightMeta) : null,
        });
        onClose();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1 text-caption font-medium text-ink">
          <Plane size={12} strokeWidth={2} className="text-brand-accent" />
          航班資訊
          <span className="ml-1 text-[10px] font-normal text-muted">
            飛機段不查 Google Routes
          </span>
        </p>
        <button
          type="button"
          onClick={onSwitchToGround}
          className="text-[10px] text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          切換為地面段
        </button>
      </div>

      <KindMetadataForm
        kind="FLIGHT"
        value={flightMeta}
        onChange={setFlightMeta}
        baseCurrency="TWD"
        flightLookup={{ onLookup: handleFlightLookup, loading: flightLookupPending }}
      />

      {flightLookupError && (
        <p className="rounded-md border border-error/30 bg-error/5 p-2 text-[11px] text-error">
          {flightLookupError}
        </p>
      )}
      {flightLookupSource && (
        <p className="text-[11px] text-muted">
          資料來源：
          {flightLookupSource === "aviationstack" ? (
            <span className="font-medium text-success">AviationStack（真實航班資料）</span>
          ) : flightLookupSource === "ai" ? (
            <span className="text-warning">AI 推估（建議再次確認）</span>
          ) : (
            <span>內建 IATA 航空公司對照</span>
          )}
        </p>
      )}

      {saveError && (
        <p className="rounded-md border border-error/30 bg-error/5 p-2 text-[11px] text-error">
          {saveError}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-hairline-soft pt-2">
        <button
          onClick={handleSave}
          disabled={saving || !transportId}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
        >
          {saving ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Sparkles size={11} fill="currentColor" />
          )}
          儲存航班資訊
        </button>
      </div>
    </div>
  );
}
