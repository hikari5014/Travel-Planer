"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Search, Plus, X, Star, MapPin, Sparkles } from "lucide-react";
import { searchPlacesAction, addScheduleItemAction, createPlaceAndAddAction } from "@/app/(actions)/schedule-actions";
import {
  PlaceIconChip,
  placeIconRegistry,
  type PlaceIconKey,
  resolvePlaceIcon,
  defaultKindForIcon,
} from "@/lib/place-icon";

type SearchResult = Awaited<ReturnType<typeof searchPlacesAction>>[number];

type AddKind =
  | "ATTRACTION"
  | "MEAL"
  | "LODGING"
  | "FREE"
  | "FLIGHT"
  | "CAR_RENTAL"
  | "TRAIN";

const KIND_OPTIONS: { value: AddKind; label: string }[] = [
  { value: "ATTRACTION", label: "景點" },
  { value: "MEAL", label: "餐飲" },
  { value: "LODGING", label: "住宿（整日）" },
  { value: "FLIGHT", label: "飛機" },
  { value: "TRAIN", label: "火車 / 高鐵" },
  { value: "CAR_RENTAL", label: "租車" },
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
  { key: "station", label: "車站" },
  { key: "airport", label: "機場" },
];

export function PlaceSearchDialog({
  tripId,
  dayId,
  hasGoogleKey,
  onClose,
}: {
  tripId: string;
  dayId: string;
  hasGoogleKey?: boolean;
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
          kind: defaultKindForIcon(place.iconKey),
          // Forward the full hit so the server upserts before FK insert.
          googlePlace: place,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "加入失敗");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-[min(8vh,4rem)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-lg bg-canvas shadow-pop"
        style={{ maxHeight: "calc(100vh - min(16vh, 8rem))" }}
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
                type="text"
                placeholder={hasGoogleKey ? "搜尋地點（Google Places + 本地快取）…" : "搜尋地點（僅本地快取）…"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10 w-full rounded-md border border-hairline bg-canvas pl-10 pr-3 text-body-sm focus:border-ink focus:outline-none"
              />
            </div>

            <p className="text-[11px] text-muted-soft">
              {hasGoogleKey
                ? "✅ Google Places API 已啟用 — 全球景點搜尋"
                : "Google Maps key 未設定 — 僅搜尋本地。可至 /settings 加入 key 啟用全球搜尋"}
            </p>

            <ul className="max-h-80 overflow-y-auto">
              {results.length === 0 && query.trim() && (
                <li className="py-3 text-center text-caption text-muted-soft">
                  {hasGoogleKey
                    ? "搜尋中… 沒有結果可改用「新增地點」自訂建立"
                    : "沒有符合的本地結果，可切到「新增地點」"}
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
                      <p className="flex items-center gap-1.5 truncate text-body-sm text-ink">
                        <span className="truncate">{p.name}</span>
                        {p.source === "google" && (
                          <span className="flex-shrink-0 rounded-pill bg-brand-accent/15 px-1.5 py-px text-[9px] font-medium text-brand-accent">
                            Google
                          </span>
                        )}
                        {p.source === "cache" && (
                          <span className="flex-shrink-0 rounded-pill bg-surface-card px-1.5 py-px text-[9px] text-muted">
                            本地
                          </span>
                        )}
                      </p>
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
  const [kind, setKind] = useState<AddKind>("ATTRACTION");
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
      <Field label={`圖示（${iconTouched ? "已手動指定" : "依分類自動選"}：${placeIconRegistry[iconKey].label}）`}>
        <div className="grid grid-cols-6 gap-1.5">
          {ICON_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => { setIconKey(o.key); setIconTouched(true); }}
              className={`flex flex-col items-center gap-1 rounded-md border p-2 transition-colors ${
                iconKey === o.key
                  ? "border-ink bg-surface-card shadow-soft-elevation"
                  : "border-hairline bg-canvas hover:border-ink/40"
              }`}
              title={o.label}
            >
              <PlaceIconChip iconKey={o.key} size={20} />
              <span className="text-[10px] leading-none text-muted">{o.label}</span>
            </button>
          ))}
        </div>
        {iconTouched && (
          <button type="button" onClick={() => setIconTouched(false)}
                  className="mt-1.5 text-[10px] text-muted-soft hover:text-ink underline">
            還原為自動依分類
          </button>
        )}
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
