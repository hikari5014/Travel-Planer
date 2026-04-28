"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Search, Plus, X, Star, MapPin, Sparkles } from "lucide-react";
import { searchPlacesAction, addScheduleItemAction, createPlaceAndAddAction } from "@/app/(actions)/schedule-actions";
import { PlaceIconChip, placeIconRegistry, type PlaceIconKey, resolvePlaceIcon } from "@/lib/place-icon";

type SearchResult = Awaited<ReturnType<typeof searchPlacesAction>>[number];

const KIND_OPTIONS: { value: "ATTRACTION" | "MEAL" | "LODGING" | "FREE"; label: string }[] = [
  { value: "ATTRACTION", label: "景點" },
  { value: "MEAL", label: "餐飲" },
  { value: "LODGING", label: "住宿（整日）" },
  { value: "FREE", label: "自由時間" },
];

const ICON_OPTIONS: { key: PlaceIconKey; label: string }[] = [
  { key: "landmark", label: "景點" },
  { key: "shrine", label: "神社" },
  { key: "temple", label: "寺院" },
  { key: "restaurant", label: "餐廳" },
  { key: "ramen", label: "麵食" },
  { key: "cafe", label: "咖啡" },
  { key: "lodging", label: "住宿" },
  { key: "machiya", label: "町家" },
  { key: "park", label: "公園" },
  { key: "mountain", label: "山景" },
  { key: "shopping", label: "購物" },
  { key: "museum", label: "美術館" },
];

export function PlaceSearchDialog({
  tripId,
  dayId,
  onClose,
}: {
  tripId: string;
  dayId: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [tab, setTab] = useState<"search" | "create">("search");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (tab !== "search") return;
    const t = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      try {
        const r = await searchPlacesAction(query);
        setResults(r);
      } catch {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, tab]);

  // Focus search on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handlePick(place: SearchResult) {
    setError(null);
    startTransition(async () => {
      try {
        await addScheduleItemAction({
          tripId,
          dayId,
          placeId: place.googlePlaceId,
          kind: place.iconKey === "lodging" ? "LODGING" : place.iconKey === "restaurant" || place.iconKey === "ramen" || place.iconKey === "cafe" ? "MEAL" : "ATTRACTION",
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "加入失敗");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-24 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-lg bg-canvas shadow-pop"
      >
        {/* Header / tabs */}
        <div className="flex items-center justify-between border-b border-hairline-soft px-md py-sm">
          <div className="flex items-center gap-px rounded-md bg-surface-soft p-0.5">
            <button
              onClick={() => setTab("search")}
              className={`flex items-center gap-1 rounded-sm px-2.5 py-1 text-caption transition-colors ${
                tab === "search" ? "bg-canvas text-ink shadow-soft-elevation" : "text-muted hover:text-ink"
              }`}
            >
              <Search size={11} /> 搜尋
            </button>
            <button
              onClick={() => setTab("create")}
              className={`flex items-center gap-1 rounded-sm px-2.5 py-1 text-caption transition-colors ${
                tab === "create" ? "bg-canvas text-ink shadow-soft-elevation" : "text-muted hover:text-ink"
              }`}
            >
              <Plus size={11} /> 新增地點
            </button>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink"
            aria-label="關閉"
          >
            <X size={14} />
          </button>
        </div>

        {error && (
          <div className="border-b border-hairline-soft bg-error/5 px-md py-2 text-caption text-error">
            {error}
          </div>
        )}

        {tab === "search" ? (
          <div className="space-y-2 p-md">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft" />
              <input
                ref={searchInputRef}
                type="search"
                placeholder="搜尋地點（從本地快取）…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10 w-full rounded-md border border-hairline bg-canvas pl-9 pr-3 text-body-sm focus:border-ink focus:outline-none"
              />
            </div>

            <p className="text-[11px] text-muted-soft">
              {process.env.NEXT_PUBLIC_GOOGLE_MAPS_JS_KEY
                ? "已設定 Google Maps key — Phase 2 起會接 Places Autocomplete"
                : "Google Maps key 未設定 — 目前只搜尋本地快取。也可切換到「新增地點」自訂建立"}
            </p>

            <ul className="max-h-80 overflow-y-auto">
              {results.length === 0 && query.trim() && (
                <li className="py-3 text-center text-caption text-muted-soft">
                  沒有符合的本地結果，可切到「新增地點」
                </li>
              )}
              {results.map((p) => (
                <li key={p.googlePlaceId}>
                  <button
                    disabled={pending}
                    onClick={() => handlePick(p)}
                    className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-surface-soft disabled:opacity-60"
                  >
                    <PlaceIconChip iconKey={p.iconKey} size={18} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm text-ink">{p.name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-muted">
                        <span>{p.category}</span>
                        {p.rating !== null && (
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
                    <span className="text-[10px] text-muted-soft">+ 加入 Day</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <CreatePlaceForm tripId={tripId} dayId={dayId} onCreated={onClose} pending={pending} startTransition={startTransition} setError={setError} />
        )}
      </div>
    </div>
  );
}

function CreatePlaceForm({
  tripId,
  dayId,
  onCreated,
  pending,
  startTransition,
  setError,
}: {
  tripId: string;
  dayId: string;
  onCreated: () => void;
  pending: boolean;
  startTransition: (cb: () => void) => void;
  setError: (msg: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("景點");
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState<"ATTRACTION" | "MEAL" | "LODGING" | "FREE">("ATTRACTION");
  const [iconKey, setIconKey] = useState<PlaceIconKey>("landmark");

  // Auto-resolve icon on category change unless user touches it.
  const [iconTouched, setIconTouched] = useState(false);
  useEffect(() => {
    if (!iconTouched) setIconKey(resolvePlaceIcon(category));
  }, [category, iconTouched]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !category.trim()) {
      setError("請輸入名稱與類型");
      return;
    }
    startTransition(async () => {
      try {
        await createPlaceAndAddAction({
          tripId,
          dayId,
          kind,
          name,
          category,
          address: address || undefined,
          iconKey,
        });
        onCreated();
      } catch (err) {
        setError(err instanceof Error ? err.message : "建立失敗");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-md">
      <Field label="名稱">
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120}
               className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="類型">
          <input value={category} onChange={(e) => setCategory(e.target.value)} required maxLength={60}
                 placeholder="寺院 / 拉麵 / 咖啡 / 公園…"
                 className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="行程類別">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}
                  className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none">
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="地址（選填）">
        <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200}
               className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none" />
      </Field>
      <Field label={`Icon (auto-resolved: ${placeIconRegistry[iconKey].label})`}>
        <div className="flex flex-wrap gap-1">
          {ICON_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => { setIconKey(o.key); setIconTouched(true); }}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                iconKey === o.key
                  ? "border-ink bg-surface-card"
                  : "border-hairline bg-canvas hover:border-ink/40"
              }`}
            >
              <PlaceIconChip iconKey={o.key} size={12} />
              <span>{o.label}</span>
            </button>
          ))}
          {iconTouched && (
            <button type="button" onClick={() => setIconTouched(false)}
                    className="text-[10px] text-muted-soft hover:text-ink underline">
              還原自動
            </button>
          )}
        </div>
      </Field>

      <div className="flex items-center justify-end gap-2 border-t border-hairline-soft pt-3">
        <button type="submit" disabled={pending}
                className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-button text-on-primary hover:bg-primary-active disabled:opacity-60">
          {pending ? "新增中…" : "建立並加入 Day"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
