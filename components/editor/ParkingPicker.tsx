"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, ParkingCircle, Star, X } from "lucide-react";
import {
  setTransportParkingAction,
  suggestParkingAction,
  clearTransportParkingAction,
} from "@/app/(actions)/transport-actions";
import type { PlaceSearchResult } from "@/lib/services/place-service";

// Suggests parking lots near the destination of a DRIVING transport leg.
// Mounted from TransportRow's parking pill.

export function ParkingPicker({
  tripId,
  transportId,
  toName,
  currentParkingName,
  onClose,
}: {
  tripId: string;
  transportId: string;
  toName: string;
  currentParkingName?: string | null;
  onClose: () => void;
}) {
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, startPick] = useTransition();
  const [clearing, startClear] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await suggestParkingAction(transportId);
      if (cancelled) return;
      if (res.ok) setResults(res.results);
      else {
        setError(res.error);
        setResults([]);
      }
    })();
    return () => { cancelled = true; };
  }, [transportId]);

  function pick(p: PlaceSearchResult) {
    setError(null);
    startPick(async () => {
      try {
        await setTransportParkingAction(tripId, transportId, p);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "設定失敗");
      }
    });
  }

  function clearPark() {
    setError(null);
    startClear(async () => {
      try {
        await clearTransportParkingAction(tripId, transportId);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "清除失敗");
      }
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[80] flex items-start justify-center bg-ink/30 px-4 pt-24 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-lg border border-hairline bg-canvas shadow-soft-elevation"
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline-soft px-4 py-3">
          <div>
            <p className="text-caption-uppercase text-muted-soft">PARKING</p>
            <h2 className="flex items-center gap-1.5 text-title-md text-ink">
              <ParkingCircle size={16} strokeWidth={1.8} className="text-warning" />
              選擇停車場
            </h2>
            <p className="mt-1 text-caption text-muted">在「{toName}」附近 500m 內</p>
            {currentParkingName && (
              <p className="mt-1 text-[11px] text-success">目前已選：{currentParkingName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        {results === null ? (
          <div className="flex items-center gap-2 p-4 text-caption text-muted">
            <Loader2 size={14} className="animate-spin" />
            搜尋附近停車場…
          </div>
        ) : results.length === 0 ? (
          <div className="space-y-1 p-4 text-caption text-muted">
            <p>附近 500m 內沒有 Google 已收錄的停車場。</p>
            <p>可手動把附近的停車場加為自訂景點，再回來這裡選。</p>
          </div>
        ) : (
          <ul className="max-h-72 overflow-y-auto p-2">
            {results.map((p) => (
              <li key={p.googlePlaceId}>
                <button
                  disabled={picking}
                  onClick={() => pick(p)}
                  className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-surface-soft disabled:opacity-60"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-warning/15">
                    <ParkingCircle size={16} strokeWidth={1.8} className="text-warning" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm text-ink">{p.name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      {p.rating !== null && p.rating !== undefined && (
                        <>
                          <span className="flex items-center gap-0.5">
                            <Star size={9} fill="#fb923c" stroke="#fb923c" />
                            {p.rating}
                          </span>
                          <span className="text-muted-soft">·</span>
                        </>
                      )}
                      {p.address && <span className="truncate">{p.address}</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-soft">選擇</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div className="mx-4 mb-2 flex items-start gap-1.5 rounded-md border border-error/30 bg-error/5 p-2 text-caption text-error">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-hairline-soft bg-surface-soft px-4 py-3">
          {currentParkingName ? (
            <button
              onClick={clearPark}
              disabled={clearing}
              className="text-caption text-muted hover:text-ink disabled:opacity-60"
            >
              清除已選停車場
            </button>
          ) : <span />}
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md px-3 text-button text-muted hover:text-ink"
          >
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
