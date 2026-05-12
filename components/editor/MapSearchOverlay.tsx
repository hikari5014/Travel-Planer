"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, MapPin, Plus, Search, Star, X } from "lucide-react";
import {
  addScheduleItemAction,
  searchKakaoPlacesAction,
  searchPlacesAction,
} from "@/app/(actions)/schedule-actions";
import { PlaceIconChip } from "@/lib/place-icon";
import type { PlaceSearchResult } from "@/lib/services/place-service";

// Compact search bar that lives ON TOP of the map (top-right corner). Click to
// expand into an input + result list; pick a result to add it to the current
// day's schedule. Replaces the round-trip of "open right list → press +
// → search dialog → pick". Coexists with the bottom-of-list "+" button.
//
// Phase P1 — adds a Google / Kakao toggle. When the trip looks Korean
// (baseCurrency=KRW or destination matches Korea) we default to Kakao
// because its POI database is much richer for 한국 places.

type SearchSource = "google" | "kakao";

export function MapSearchOverlay({
  tripId,
  dayId,
  hasGoogleKey,
  hasKakaoRestKey,
  defaultSource = "google",
}: {
  tripId: string;
  dayId: string;
  hasGoogleKey: boolean;
  hasKakaoRestKey?: boolean;
  // EditorShell suggests this based on trip.baseCurrency / destination.
  defaultSource?: SearchSource;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, startAdd] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SearchSource>(
    defaultSource === "kakao" && hasKakaoRestKey ? "kakao" : "google",
  );
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

  // Debounced search — re-runs on query OR source change so toggling tabs
  // immediately re-queries the same input on the new provider.
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
        const r =
          source === "kakao"
            ? await searchKakaoPlacesAction(q)
            : await searchPlacesAction(q);
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, source]);

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

  const isKakaoResult = (p: PlaceSearchResult) => p.googlePlaceId.startsWith("kakao:");

  return (
    <div ref={wrapRef} className="absolute left-3 top-3 z-30">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full bg-canvas/95 px-4 py-2.5 text-body-sm font-medium text-ink shadow-soft-elevation backdrop-blur hover:bg-canvas hover:shadow-pop"
          title="在地圖上直接搜尋並加入景點"
        >
          <Search size={16} strokeWidth={2} />
          搜尋並加入
        </button>
      ) : (
        <div className="w-[360px] overflow-hidden rounded-lg border border-hairline bg-canvas/95 shadow-pop backdrop-blur">
          {/* Provider tabs — only shown when both sources are usable. */}
          {hasKakaoRestKey && (
            <div className="flex border-b border-hairline-soft text-[11px]">
              <button
                onClick={() => setSource("google")}
                className={`flex flex-1 items-center justify-center gap-1 px-2 py-2 transition-colors ${
                  source === "google"
                    ? "border-b-2 border-ink text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                🌐 Google
              </button>
              <button
                onClick={() => setSource("kakao")}
                className={`flex flex-1 items-center justify-center gap-1 px-2 py-2 transition-colors ${
                  source === "kakao"
                    ? "border-b-2 border-ink text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                🇰🇷 Kakao（韓國準）
              </button>
            </div>
          )}
          <div className="relative border-b border-hairline-soft">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                source === "kakao"
                  ? "검색 / 搜尋韓國 POI（中文或韓文皆可）…"
                  : hasGoogleKey
                    ? "搜尋景點 / 餐廳 / 地址…"
                    : "搜尋本地快取…"
              }
              className="h-12 w-full bg-transparent pl-10 pr-10 text-body-sm focus:outline-none"
            />
            <button
              onClick={() => {
                setOpen(false);
                setQuery("");
              }}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink"
            >
              <X size={12} />
            </button>
          </div>
          {source === "google" && !hasGoogleKey && (
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
              {source === "kakao"
                ? "Kakao 沒有結果。可切到 Google 或試韓文 / 英文關鍵字"
                : "沒有結果。可試試完整地址 / 英文名稱"}
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
                        {isKakaoResult(p) ? (
                          <span className="flex-shrink-0 rounded-pill bg-badge-pink/15 px-1 py-px text-[8px] text-badge-pink">
                            K
                          </span>
                        ) : p.source === "google" ? (
                          <span className="flex-shrink-0 rounded-pill bg-brand-accent/15 px-1 py-px text-[8px] text-brand-accent">
                            G
                          </span>
                        ) : null}
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
