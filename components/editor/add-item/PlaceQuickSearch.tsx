"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { searchPlacesAction } from "@/app/(actions)/schedule-actions";
import type { PlaceSearchResult } from "@/lib/services/place-service";

// Phase 14c — minimal place-search input shared by the kind dialogs.
// Search Google Places (debounced); pick a result OR fall back to typing
// a custom name (no lat/lng).

export type QuickPlace = {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  ratingCount?: number;
  iconKey?: string;
  googlePlace?: PlaceSearchResult; // present when user picked a Google result
};

export function PlaceQuickSearch({
  value,
  onChange,
  placeholder,
  hasGoogleKey,
  fallbackCategory,
}: {
  value: QuickPlace | null;
  onChange: (v: QuickPlace | null) => void;
  placeholder?: string;
  hasGoogleKey?: boolean;
  fallbackCategory?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!query.trim() || !hasGoogleKey) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchPlacesAction(query);
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, hasGoogleKey]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-hairline bg-surface-soft p-2">
        <MapPin size={13} className="text-muted-soft" />
        <div className="flex-1 truncate">
          <div className="truncate text-body-sm text-ink">{value.name}</div>
          {value.address && <div className="truncate text-[10px] text-muted-soft">{value.address}</div>}
        </div>
        <button type="button" onClick={() => { onChange(null); setQuery(""); }}
                className="text-muted-soft hover:text-ink">
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 rounded-md border border-hairline bg-canvas px-2">
        <Search size={12} className="text-muted-soft" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "搜尋地點"}
          className="h-9 flex-1 bg-transparent text-body-sm focus:outline-none"
        />
        {searching && <Loader2 size={11} className="animate-spin text-muted-soft" />}
        {query && !searching && (
          <button type="button" onClick={() => { setQuery(""); setResults([]); }}
                  className="text-muted-soft hover:text-ink">
            <X size={11} />
          </button>
        )}
      </div>
      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-md border border-hairline bg-canvas shadow-soft-elevation">
          {results.length === 0 && !searching && (
            <button
              type="button"
              onClick={() => {
                onChange({ name: query.trim(), iconKey: undefined });
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-body-sm hover:bg-surface-soft"
            >
              <span className="text-ink">使用「{query.trim()}」</span>
              <span className="ml-1 text-[10px] text-muted-soft">（無經緯度，可後續手動補）</span>
            </button>
          )}
          {results.map((r) => (
            <button
              key={r.googlePlaceId}
              type="button"
              onClick={() => {
                onChange({
                  name: r.name,
                  address: r.address ?? undefined,
                  lat: r.lat ?? undefined,
                  lng: r.lng ?? undefined,
                  rating: r.rating ?? undefined,
                  ratingCount: r.ratingCount ?? undefined,
                  iconKey: r.iconKey,
                  googlePlace: r,
                });
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left hover:bg-surface-soft"
            >
              <div className="text-body-sm text-ink">{r.name}</div>
              {r.address && <div className="text-[10px] text-muted-soft">{r.address}</div>}
            </button>
          ))}
        </div>
      )}
      {!hasGoogleKey && (
        <p className="mt-1 text-[10px] text-muted-soft">
          未設定 Google Maps key — 直接輸入名稱即可（將建立自定地點 / 類別：{fallbackCategory ?? "其他"}）。
        </p>
      )}
    </div>
  );
}
