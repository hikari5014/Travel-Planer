"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertTriangle, Loader2, MapPin, Plus, Star, X } from "lucide-react";
import {
  addScheduleItemAction,
  createPlaceAndAddAction,
  placeByIdAction,
  placesNearbyAction,
} from "@/app/(actions)/schedule-actions";
import { PlaceIconChip, defaultKindForIcon } from "@/lib/place-icon";
import type { PlaceSearchResult } from "@/lib/services/place-service";

// Rendered by EditorShell after a map click. Two paths:
//
//  · Click landed on a labeled Google POI → we got a `placeId` directly →
//    placeByIdAction fetches its full row (1 call, accurate).
//  · Click on empty area → placesNearbyAction does an 80m fuzzy search.
//
// On either path the user picks a result + 1-click adds to the current day.
// "Add as custom marker" is the fallback when Google returns nothing or the
// API call fails.

export function MapClickAddPopup({
  tripId,
  dayId,
  lat,
  lng,
  placeId,
  hasGoogleKey,
  onClose,
}: {
  tripId: string;
  dayId: string;
  lat: number;
  lng: number;
  placeId?: string;
  hasGoogleKey: boolean;
  onClose: () => void;
}) {
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();

  // Trigger lookup on mount
  useEffect(() => {
    let cancelled = false;
    if (!hasGoogleKey) {
      setResults([]);
      return;
    }
    (async () => {
      const res = placeId
        ? await placeByIdAction(placeId)
        : await placesNearbyAction(lat, lng);
      if (cancelled) return;
      if (res.ok) {
        setResults(res.results);
      } else {
        setError(res.error);
        setHint(res.hint ?? null);
        setResults([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lng, placeId, hasGoogleKey]);

  // ESC closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function pick(place: PlaceSearchResult) {
    setError(null);
    startAdd(async () => {
      try {
        await addScheduleItemAction({
          tripId,
          dayId,
          placeId: place.googlePlaceId,
          kind: defaultKindForIcon(place.iconKey),
          googlePlace: place,
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "加入失敗");
      }
    });
  }

  function addCustom() {
    setError(null);
    const name = prompt(`為這個位置取個名字\n（${lat.toFixed(5)}, ${lng.toFixed(5)}）`, "新景點");
    if (!name) return;
    startAdd(async () => {
      try {
        await createPlaceAndAddAction({
          tripId,
          dayId,
          kind: "ATTRACTION",
          name: name.trim(),
          category: "景點",
          // Stash the clicked coords on the new place so the marker shows
          // up at the same spot.
          ...({ lat, lng } as object),
        } as Parameters<typeof createPlaceAndAddAction>[0]);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "新增失敗");
      }
    });
  }

  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-ink/30 px-4 py-[min(8vh,4rem)] backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-hairline bg-canvas shadow-soft-elevation"
        style={{ maxHeight: "calc(100vh - min(16vh, 8rem))" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline-soft px-4 py-3">
          <div>
            <p className="text-caption-uppercase text-muted-soft">ADD FROM MAP</p>
            <h2 className="text-title-md text-ink">在這個位置新增地點</h2>
            <p className="mt-1 font-mono text-[11px] text-muted-soft">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        {!hasGoogleKey ? (
          <div className="space-y-2 p-4 text-caption text-muted">
            <p>未設定 Google Maps key — 無法從附近 POI 自動查找。</p>
            <p>
              可改用下方「以自訂名稱新增」直接放上座標，或{" "}
              <Link href="/settings" className="text-brand-accent underline-offset-2 hover:underline">
                前往設定填入 key
              </Link>
              。
            </p>
          </div>
        ) : results === null ? (
          <div className="flex items-center gap-2 p-4 text-caption text-muted">
            <Loader2 size={14} className="animate-spin" />
            搜尋附近的景點 / 餐廳…
          </div>
        ) : results.length === 0 ? (
          <div className="space-y-2 p-4 text-caption text-muted">
            <p>附近 80m 內沒有 Google 已收錄的景點。</p>
            <p>可改用下方「以自訂名稱新增」。</p>
          </div>
        ) : (
          <ul className="max-h-72 overflow-y-auto p-2">
            {results.map((p) => (
              <li key={p.googlePlaceId}>
                <button
                  disabled={adding}
                  onClick={() => pick(p)}
                  className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-surface-soft disabled:opacity-60"
                >
                  <PlaceIconChip iconKey={p.iconKey} size={18} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-body-sm text-ink">
                      <span className="truncate">{p.name}</span>
                      <span className="flex-shrink-0 rounded-pill bg-brand-accent/15 px-1.5 py-px text-[9px] font-medium text-brand-accent">
                        Google
                      </span>
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      <span>{p.category}</span>
                      {p.rating !== null && p.rating !== undefined && (
                        <>
                          <span className="text-muted-soft">·</span>
                          <span className="flex items-center gap-0.5">
                            <Star size={9} fill="#fb923c" stroke="#fb923c" />
                            {p.rating}
                          </span>
                        </>
                      )}
                      {p.address && (
                        <>
                          <span className="text-muted-soft">·</span>
                          <span className="flex items-center gap-0.5 truncate">
                            <MapPin size={9} />
                            <span className="truncate">{p.address}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-soft">+ 加入</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div className="mx-4 mb-2 space-y-1.5 rounded-md border border-error/30 bg-error/5 p-3 text-caption">
            <div className="flex items-start gap-1.5">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-error" />
              <p className="font-mono text-[11px] text-error">{error}</p>
            </div>
            {hint && (
              <p className="ml-5 text-[11px] leading-relaxed text-ink">
                💡 {hint}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-hairline-soft bg-surface-soft px-4 py-3">
          <button
            onClick={addCustom}
            disabled={adding}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-hairline bg-canvas px-3 text-button text-ink hover:border-ink disabled:opacity-60"
          >
            <Plus size={12} strokeWidth={2} />
            以自訂名稱新增
          </button>
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
