"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, MapPin, Plus, Search, Star, X } from "lucide-react";
import {
  addScheduleItemAction,
  searchPlacesAction,
} from "@/app/(actions)/schedule-actions";
import { PlaceIconChip } from "@/lib/place-icon";
import type { PlaceSearchResult } from "@/lib/services/place-service";

// Compact search bar that lives ON TOP of the map (top-right corner). Click to
// expand into an input + result list; pick a result to add it to the current
// day's schedule. Replaces the round-trip of "open right list → press +
// → search dialog → pick". Coexists with the bottom-of-list "+" button.

export function MapSearchOverlay({
  tripId,
  dayId,
  hasGoogleKey,
}: {
  tripId: string;
  dayId: string;
  hasGoogleKey: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, startAdd] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Focus on open
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Click outside to collapse
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchPlacesAction(q);
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  function pick(p: PlaceSearchResult) {
    setError(null);
    startAdd(async () => {
      try {
        await addScheduleItemAction({
          tripId,
          dayId,
          placeId: p.googlePlaceId,
          kind:
            p.iconKey === "lodging"
              ? "LODGING"
              : p.iconKey === "restaurant" || p.iconKey === "ramen" || p.iconKey === "cafe"
                ? "MEAL"
                : "ATTRACTION",
          googlePlace: p,
        });
        setOpen(false);
        setQuery("");
        setResults([]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加入失敗");
      }
    });
  }

  return (
    <div ref={wrapRef} className="absolute left-3 top-3 z-30">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-pill bg-canvas/95 px-3 py-1.5 text-caption text-ink shadow-soft-elevation backdrop-blur hover:bg-canvas"
          title="在地圖上直接搜尋並加入景點"
        >
          <Search size={12} strokeWidth={2} />
          搜尋並加入
        </button>
      ) : (
        <div className="w-[320px] overflow-hidden rounded-lg border border-hairline bg-canvas/95 shadow-soft-elevation backdrop-blur">
          <div className="relative border-b border-hairline-soft">
            <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={hasGoogleKey ? "搜尋景點 / 餐廳 / 地址…" : "搜尋本地快取…"}
              className="h-10 w-full bg-transparent pl-9 pr-9 text-body-sm focus:outline-none"
            />
            <button
              onClick={() => {
                setOpen(false);
                setQuery("");
              }}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted hover:bg-surface-card hover:text-ink"
            >
              <X size={12} />
            </button>
          </div>
          {!hasGoogleKey && (
            <p className="px-3 py-1 text-[10px] text-muted-soft">
              Google Maps key 未設定 — 結果限本地。
            </p>
          )}
          {searching && (
            <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-muted">
              <Loader2 size={11} className="animate-spin" />
              搜尋中…
            </div>
          )}
          {!searching && query && results.length === 0 && (
            <p className="px-3 py-3 text-center text-caption text-muted-soft">
              沒有結果。可試試完整地址 / 英文名稱
            </p>
          )}
          {results.length > 0 && (
            <ul className="max-h-72 overflow-y-auto p-1">
              {results.map((p) => (
                <li key={p.googlePlaceId}>
                  <button
                    disabled={adding}
                    onClick={() => pick(p)}
                    className="flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-surface-soft disabled:opacity-60"
                  >
                    <PlaceIconChip iconKey={p.iconKey} size={16} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-caption text-ink">
                        <span className="truncate">{p.name}</span>
                        {p.source === "google" && (
                          <span className="flex-shrink-0 rounded-pill bg-brand-accent/15 px-1 py-px text-[8px] text-brand-accent">
                            G
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted">
                        <span>{p.category}</span>
                        {p.rating !== null && p.rating !== undefined && (
                          <>
                            <span className="text-muted-soft">·</span>
                            <span className="flex items-center gap-0.5">
                              <Star size={8} fill="#fb923c" stroke="#fb923c" />
                              {p.rating}
                            </span>
                          </>
                        )}
                        {p.address && (
                          <>
                            <span className="text-muted-soft">·</span>
                            <span className="flex items-center gap-0.5 truncate">
                              <MapPin size={8} />
                              <span className="truncate">{p.address}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Plus size={12} className="text-muted-soft" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="border-t border-hairline-soft bg-error/5 px-3 py-1 text-[11px] text-error">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
