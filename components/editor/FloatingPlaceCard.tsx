"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  Star,
  MapPin,
  Clock,
  GripVertical,
  X,
  Sparkles,
  ExternalLink,
  Edit3,
  Loader2,
  ImagePlus,
  Trash2,
  Save,
  StickyNote,
  Info,
  Image as ImageIcon,
} from "lucide-react";
import { getPlace, type MockScheduleItem } from "@/lib/mock-schedule";
import { PlaceIconChip } from "@/lib/place-icon";
import { PriceWithLocal } from "@/components/common/PriceWithLocal";
import { aiReestimateStayAction } from "@/app/(actions)/ai-actions";
import { updateItemMetadataAction } from "@/app/(actions)/schedule-actions";
import {
  addPhotoAction,
  deletePhotoAction,
  listPhotosAction,
  type PhotosResult,
} from "@/app/(actions)/photo-actions";
import {
  applyFlightSuggestionAction,
  suggestFlightInfoAction,
  type FlightSuggestResult,
} from "@/app/(actions)/flight-actions";
import { Plane } from "lucide-react";
import { KindMetadataForm } from "@/components/editor/KindMetadataForm";
import { KIND_LABEL, defaultMetadataForKind } from "@/lib/schedule-item-metadata";

const CARD_WIDTH = 360;
const VIEWPORT_PADDING = 8;

type Tab = "overview" | "notes" | "photos";

// Phase 10b — viewport-anchored draggable place detail card with three tabs:
//   · 概覽 — Google Place facts + AI re-estimate (view-only)
//   · 筆記 — note textarea + per-kind metadata (edit mode)
//   · 相片 — base64 photo upload (dev) / external URL (prod)
//
// Rendered via Portal into <body> with `position: fixed` so it floats above
// every panel and isn't clipped by overflow.
export function FloatingPlaceCard({
  item,
  tripId,
  region,
  baseCurrency = "TWD",
  dayDate,
  onClose,
  initialAnchor,
}: {
  item: MockScheduleItem;
  tripId?: string;
  region?: string;
  baseCurrency?: string;
  dayDate?: string; // YYYY-MM-DD — used by FLIGHT AI lookup
  onClose: () => void;
  initialAnchor?: { top: number; right: number };
}) {
  const place = getPlace(item.placeId);
  const cardRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const dragStart = useRef<{ pointerX: number; pointerY: number; top: number; left: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  // ─ Edit form state (Notes tab) ─
  const [editing, setEditing] = useState(false);
  const initialMetadata = (item.metadata ?? defaultMetadataForKind(item.kind)) as Record<string, unknown>;
  const [draftNote, setDraftNote] = useState(item.note ?? "");
  const [draftMeta, setDraftMeta] = useState<Record<string, unknown>>(initialMetadata);
  const [saving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset draft when the selected item changes
  useEffect(() => {
    setDraftNote(item.note ?? "");
    setDraftMeta((item.metadata ?? defaultMetadataForKind(item.kind)) as Record<string, unknown>);
    setEditing(false);
    setSaveError(null);
  }, [item.id, item.note, item.metadata, item.kind]);

  // ─ AI re-estimate (Overview tab) ─
  const [aiResult, setAiResult] = useState<{ minutes: number; rationale: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPending, startAi] = useTransition();

  // ─ Photo state (Photos tab) ─
  const [photos, setPhotos] = useState<PhotosResult | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, startPhoto] = useTransition();

  // ─ Flight AI auto-fill (FLIGHT only) ─
  const [flightLookupPending, startFlightLookup] = useTransition();
  const [flightLookupError, setFlightLookupError] = useState<string | null>(null);

  async function handleFlightLookup() {
    if (!tripId) return;
    const flightNumber = (draftMeta.flightNumber as string | null | undefined)?.trim();
    if (!flightNumber) {
      setFlightLookupError("請先填入航班號碼");
      return;
    }
    const date = dayDate ?? new Date().toISOString().slice(0, 10);
    setFlightLookupError(null);
    startFlightLookup(async () => {
      const res: FlightSuggestResult = await suggestFlightInfoAction({ flightNumber, date });
      if (!res.ok) {
        setFlightLookupError(res.error);
        return;
      }
      // Merge into local draft (user wins where they've already typed)
      const ai = res.info;
      setDraftMeta((prev) => ({
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
      // Persist immediately — user can still edit and save again afterwards.
      const persist = await applyFlightSuggestionAction({
        tripId,
        flightItemId: item.id,
        info: ai,
        date,
      });
      if (!persist.ok) setFlightLookupError(persist.error ?? "套用失敗");
    });
  }

  // Lazy-load photos when the tab opens (or item changes while open)
  useEffect(() => {
    if (tab !== "photos") return;
    let cancelled = false;
    setPhotoError(null);
    (async () => {
      const res = await listPhotosAction(item.id);
      if (cancelled) return;
      setPhotos(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, item.id]);

  // Initialise position once mounted
  useEffect(() => {
    setMounted(true);
    const top = initialAnchor?.top ?? 96;
    const right = initialAnchor?.right ?? 24;
    const left = window.innerWidth - CARD_WIDTH - right;
    setPos({ top, left });
  }, [initialAnchor]);

  // Close on Escape (unless we're typing in an editable field)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/i.test(target.tagName)) return;
      if (editing) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  // Re-clamp on resize
  useEffect(() => {
    if (!pos) return;
    function onResize() {
      setPos((p) => (p ? clampToViewport(p, cardRef.current) : p));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos]);

  if (!place || !mounted || !pos) return null;

  function handlePointerDown(e: React.PointerEvent) {
    setDragging(true);
    if (!pos) return;
    dragStart.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      top: pos.top,
      left: pos.left,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.pointerX;
    const dy = e.clientY - dragStart.current.pointerY;
    const next = clampToViewport(
      {
        top: dragStart.current.top + dy,
        left: dragStart.current.left + dx,
      },
      cardRef.current,
    );
    setPos(next);
  }
  function handlePointerUp(e: React.PointerEvent) {
    setDragging(false);
    dragStart.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  async function handleSave() {
    if (!tripId) return;
    setSaveError(null);
    startSave(async () => {
      try {
        await updateItemMetadataAction(tripId, item.id, draftMeta, draftNote);
        setEditing(false);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  function handleCancel() {
    setDraftNote(item.note ?? "");
    setDraftMeta((item.metadata ?? defaultMetadataForKind(item.kind)) as Record<string, unknown>);
    setEditing(false);
    setSaveError(null);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !tripId) return;
    setPhotoError(null);
    for (const file of Array.from(files)) {
      try {
        // Downscale large images client-side to keep base64 under cap
        const { base64, mimeType, byteSize } = await readAndMaybeShrink(file);
        await new Promise<void>((resolve) => {
          startPhoto(async () => {
            const res = await addPhotoAction({
              tripId,
              scheduleItemId: item.id,
              mimeType,
              base64,
              byteSize,
            });
            if (res.ok) {
              setPhotos((prev) =>
                prev && prev.ok
                  ? { ok: true, photos: [...prev.photos, res.photo] }
                  : { ok: true, photos: [res.photo] },
              );
            } else {
              setPhotoError(res.error);
            }
            resolve();
          });
        });
      } catch (e) {
        setPhotoError(e instanceof Error ? e.message : "上傳失敗");
      }
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!tripId) return;
    setPhotoError(null);
    startPhoto(async () => {
      const res = await deletePhotoAction({ tripId, photoId });
      if (res.ok) {
        setPhotos((prev) =>
          prev && prev.ok
            ? { ok: true, photos: prev.photos.filter((p) => p.id !== photoId) }
            : prev,
        );
      } else {
        setPhotoError(res.error ?? "刪除失敗");
      }
    });
  }

  const hasGoogleCoords = place.mapX !== 0 || place.mapY !== 0;
  const googleMapsUrl = hasGoogleCoords && item.placeId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${encodeURIComponent(item.placeId)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + place.address)}`;

  const card = (
    <div
      ref={cardRef}
      style={{
        top: pos.top,
        left: pos.left,
        width: CARD_WIDTH,
        position: "fixed",
        maxHeight: "calc(100vh - 16px)",
      }}
      className={`z-50 flex flex-col overflow-hidden rounded-lg border border-hairline bg-canvas shadow-pop ${
        dragging ? "shadow-lg" : ""
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Drag handle */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`flex flex-shrink-0 items-center justify-between border-b border-hairline-soft bg-surface-soft px-2 py-1 ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <div className="flex items-center gap-1 text-muted-soft">
          <GripVertical size={12} strokeWidth={1.8} />
          <span className="text-[10px] uppercase tracking-wide">{KIND_LABEL[item.kind]} · 可拖曳</span>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-canvas hover:text-ink"
          aria-label="關閉"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>

      {/* Hero */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-hairline-soft p-3">
        <PlaceIconChip iconKey={place.iconKey} size={22} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-muted">{place.category}</p>
          <h3 className="truncate text-title-sm text-ink">{place.name}</h3>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-shrink-0 border-b border-hairline-soft bg-canvas">
        <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>
          <Info size={11} strokeWidth={1.8} />
          概覽
        </TabBtn>
        <TabBtn active={tab === "notes"} onClick={() => setTab("notes")}>
          <StickyNote size={11} strokeWidth={1.8} />
          筆記
          {(item.note || (item.metadata && Object.keys(item.metadata).length > 0)) && (
            <span className="h-1 w-1 rounded-full bg-brand-accent" />
          )}
        </TabBtn>
        <TabBtn active={tab === "photos"} onClick={() => setTab("photos")}>
          <ImageIcon size={11} strokeWidth={1.8} />
          相片
          {(item.photoCount ?? 0) > 0 && (
            <span className="rounded-pill bg-surface-card px-1 text-[9px] text-muted">
              {item.photoCount}
            </span>
          )}
        </TabBtn>
      </div>

      {/* Tab body — the only scrollable region */}
      <div className="flex-1 overflow-y-auto">
        {tab === "overview" && (
          <div className="space-y-2 p-3">
            <div className="flex items-center gap-3 text-caption text-muted">
              <span className="flex items-center gap-1">
                <Star size={12} fill="#fb923c" stroke="#fb923c" />
                <span className="font-medium text-ink">{place.rating}</span>
                <span className="text-muted-soft">({place.ratingCount.toLocaleString()})</span>
              </span>
              <span className="flex items-center gap-1 truncate">
                <MapPin size={12} strokeWidth={1.8} />
                <span className="truncate">{place.address}</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-md border border-hairline-soft bg-surface-soft p-2">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-soft">時段</p>
                <p className="font-mono text-body-sm text-ink">
                  {item.startTime}–{item.endTime}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-soft">建議停留</p>
                <p className="text-body-sm text-ink flex items-center gap-1">
                  <Clock size={12} strokeWidth={1.8} className="text-muted" />
                  {fmtMinutes(item.durationMin)}
                </p>
              </div>
            </div>

            {place.reviewSnippet && (
              <div className="rounded-md bg-surface-card p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted">REVIEWS</p>
                <p className="mt-0.5 text-caption leading-relaxed text-body">"{place.reviewSnippet}"</p>
              </div>
            )}

            {item.hasTicket && (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-2">
                <div className="flex items-center justify-between">
                  <p className="text-caption text-ink">🎫 已登記票卷</p>
                  <PriceWithLocal amount={2400} size="sm" align="right" />
                </div>
              </div>
            )}

            <button
              disabled={!tripId || !item.placeId || aiPending}
              onClick={() => {
                if (!tripId || !item.placeId) return;
                setAiError(null);
                startAi(async () => {
                  const res = await aiReestimateStayAction({
                    tripId,
                    googlePlaceId: item.placeId!,
                    ...(region ? { region } : {}),
                  });
                  if (res.ok) setAiResult(res.result);
                  else setAiError(res.error);
                });
              }}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-brand-accent bg-brand-accent/5 py-1.5 text-caption text-brand-accent hover:bg-brand-accent/10 disabled:opacity-60"
            >
              {aiPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} fill="currentColor" />}
              {aiPending ? "AI 估算中…" : "請 AI 重新估算停留時間"}
            </button>
            {aiResult && (
              <div className="rounded-md border border-success/30 bg-success/5 p-2 text-[11px] text-ink">
                <p className="font-medium">AI 建議：{fmtMinutes(aiResult.minutes)}</p>
                <p className="mt-0.5 text-muted leading-relaxed">{aiResult.rationale}</p>
                <p className="mt-1 text-[10px] text-muted-soft">
                  已寫入景點預設停留；現有 schedule item 不會自動調整。
                </p>
              </div>
            )}
            {aiError && (
              <div className="rounded-md border border-error/30 bg-error/5 p-2 text-[11px] text-error">
                估算失敗：{aiError}
              </div>
            )}
          </div>
        )}

        {tab === "notes" && (
          <div className="space-y-3 p-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-muted">備註</span>
                {!editing && tripId && (
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1 text-[11px] text-brand-accent hover:underline"
                  >
                    <Edit3 size={10} strokeWidth={1.8} />
                    編輯
                  </button>
                )}
              </div>
              {editing ? (
                <textarea
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  rows={3}
                  placeholder="這個地方的提醒、想法、或必看必玩…"
                  className="w-full rounded-md border border-hairline bg-canvas p-2 text-body-sm focus:border-ink focus:outline-none"
                />
              ) : item.note ? (
                <p className="whitespace-pre-wrap rounded-md bg-surface-soft p-2 text-caption leading-relaxed text-ink">
                  {item.note}
                </p>
              ) : (
                <p className="rounded-md border border-dashed border-hairline-soft p-2 text-[11px] text-muted-soft">
                  尚未填寫
                </p>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  {KIND_LABEL[item.kind]}細節
                </span>
              </div>
              {editing ? (
                <div className="space-y-2">
                  {item.kind === "FLIGHT" && (
                    <div className="space-y-1.5 rounded-md border border-brand-accent/30 bg-brand-accent/5 p-2">
                      <button
                        disabled={flightLookupPending || !tripId}
                        onClick={handleFlightLookup}
                        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-brand-accent bg-canvas py-1.5 text-caption text-brand-accent hover:bg-brand-accent/10 disabled:opacity-60"
                      >
                        {flightLookupPending ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Plane size={12} strokeWidth={1.8} />
                        )}
                        {flightLookupPending ? "查詢中…" : "請 AI 補完航班資訊"}
                      </button>
                      <p className="text-[10px] leading-relaxed text-muted">
                        填好航班號碼後按下，AI 會自動補完航空公司 / 機場 / 起降時間 / 是否國際。
                        已填欄位不會被覆蓋。
                      </p>
                      {flightLookupError && (
                        <p className="text-[11px] text-error">{flightLookupError}</p>
                      )}
                    </div>
                  )}
                  <KindMetadataForm
                    kind={item.kind}
                    value={draftMeta}
                    onChange={setDraftMeta}
                    baseCurrency={baseCurrency}
                  />
                </div>
              ) : (
                <MetadataReadout metadata={item.metadata ?? null} />
              )}
            </div>

            {editing && (
              <>
                {saveError && (
                  <p className="rounded-md border border-error/30 bg-error/5 p-2 text-[11px] text-error">
                    {saveError}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2 border-t border-hairline-soft pt-3">
                  <button
                    onClick={handleCancel}
                    disabled={saving}
                    className="text-caption text-muted hover:text-ink"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !tripId}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-button text-on-primary hover:opacity-90 disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} strokeWidth={1.8} />}
                    儲存
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "photos" && (
          <div className="space-y-2 p-3">
            {!photos ? (
              <div className="flex items-center gap-2 text-caption text-muted">
                <Loader2 size={12} className="animate-spin" />
                載入中…
              </div>
            ) : !photos.ok ? (
              <p className="rounded-md border border-error/30 bg-error/5 p-2 text-[11px] text-error">
                {photos.error}
              </p>
            ) : photos.photos.length === 0 ? (
              <p className="rounded-md border border-dashed border-hairline-soft p-3 text-center text-[11px] text-muted-soft">
                還沒有照片，按下方上傳
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {photos.photos.map((p) => (
                  <div
                    key={p.id}
                    className="group relative overflow-hidden rounded-md border border-hairline-soft bg-surface-soft"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.src}
                      alt={p.caption ?? ""}
                      className="aspect-square w-full object-cover"
                    />
                    {p.caption && (
                      <p className="absolute inset-x-0 bottom-0 truncate bg-ink/60 px-1 py-0.5 text-[9px] text-on-primary">
                        {p.caption}
                      </p>
                    )}
                    <button
                      disabled={photoBusy}
                      onClick={() => handleDeletePhoto(p.id)}
                      className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded bg-ink/70 text-on-primary group-hover:flex disabled:opacity-50"
                      aria-label="刪除照片"
                    >
                      <Trash2 size={10} strokeWidth={1.8} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photoError && (
              <p className="rounded-md border border-error/30 bg-error/5 p-2 text-[11px] text-error">
                {photoError}
              </p>
            )}

            <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-hairline bg-canvas py-1.5 text-caption text-ink hover:border-ink">
              {photoBusy ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} strokeWidth={1.8} />}
              {photoBusy ? "上傳中…" : "新增照片"}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
                disabled={photoBusy || !tripId}
              />
            </label>
          </div>
        )}
      </div>

      {/* Footer — Google Maps deeplink (always visible) */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-hairline-soft bg-surface-soft px-3 py-1.5">
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-brand-accent hover:underline"
        >
          <ExternalLink size={10} strokeWidth={1.8} />
          在 Google Maps 開啟
        </a>
        <span className="font-mono text-[10px] text-muted-soft">
          {item.startTime}–{item.endTime}
        </span>
      </div>
    </div>
  );

  return createPortal(card, document.body);
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1 border-b-2 px-2 py-2 text-caption transition-colors ${
        active
          ? "border-ink text-ink"
          : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function MetadataReadout({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return (
      <p className="rounded-md border border-dashed border-hairline-soft p-2 text-[11px] text-muted-soft">
        尚未填寫
      </p>
    );
  }
  const entries = Object.entries(metadata).filter(
    ([, v]) => v !== null && v !== undefined && v !== "" && v !== false,
  );
  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-hairline-soft p-2 text-[11px] text-muted-soft">
        尚未填寫
      </p>
    );
  }
  return (
    <ul className="space-y-1 rounded-md bg-surface-soft p-2">
      {entries.map(([k, v]) => (
        <li key={k} className="flex justify-between gap-2 text-[11px]">
          <span className="text-muted">{labelFor(k)}</span>
          <span className="truncate text-right text-ink">{formatVal(v)}</span>
        </li>
      ))}
    </ul>
  );
}

function labelFor(key: string): string {
  const map: Record<string, string> = {
    hasTicket: "需購票",
    ticketPrice: "票價",
    ticketCurrency: "幣別",
    expectedDurationMin: "預估遊覽（分）",
    expectedQueueMin: "排隊（分）",
    openingHours: "營業時間",
    bookingRef: "預訂編號",
    reservationRequired: "已預約",
    reservationTime: "預約時間",
    reservationName: "預約姓名",
    reservationRef: "預約編號",
    averagePrice: "人均",
    partySize: "人數",
    currency: "幣別",
    cuisine: "菜系",
    vegetarianFriendly: "素食友善",
    mustTry: "想吃",
    dressCode: "服裝",
    checkInTime: "入住",
    checkOutTime: "退房",
    checkOutDate: "退房日期",
    roomType: "房型",
    bookingPlatform: "訂房平台",
    totalCost: "總金額",
    breakfastIncluded: "含早餐",
    cancellationPolicy: "取消政策",
    contactPhone: "電話",
    wifiPassword: "WiFi 密碼",
    pickupLocation: "取車地點",
    pickupTime: "取車時間",
    pickupDate: "取車日期",
    returnLocation: "還車地點",
    returnTime: "還車時間",
    returnDate: "還車日期",
    carModel: "車型",
    vendor: "公司",
    fuelPolicy: "油料政策",
    insuranceIncluded: "含保險",
    driverLicense: "駕照",
    notes: "備註",
    flightNumber: "航班",
    airline: "航空公司",
    depAirport: "出發機場",
    arrAirport: "抵達機場",
    depTime: "起飛",
    arrTime: "抵達",
    arrDate: "抵達日期",
    seatNumber: "座位",
    terminal: "航廈",
    gate: "登機門",
    isInternational: "國際航班",
    checkInBufferMin: "check-in（分）",
    immigrationBufferMin: "入境（分）",
    baggageAllowance: "行李",
    trainNumber: "車號",
    operator: "營運",
    depStation: "出發站",
    arrStation: "抵達站",
    carriage: "車廂",
    isReserved: "對號座",
    budget: "預算",
    plan: "計畫",
    alternativePlan: "備案",
    purpose: "用途",
    derivedFrom: "來源",
  };
  return map[key] ?? key;
}

function formatVal(v: unknown): string {
  if (v === true) return "✓";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return String(v);
}

// Read a File and return its base64 + mime type. Photos > ~3 MB get a canvas
// downscale pass so we stay under the 4 MB SQLite cap.
async function readAndMaybeShrink(
  file: File,
): Promise<{ base64: string; mimeType: string; byteSize: number }> {
  const SHRINK_THRESHOLD = 3 * 1024 * 1024;
  if (file.size <= SHRINK_THRESHOLD) {
    const base64 = await fileToBase64(file);
    return { base64, mimeType: file.type || "image/jpeg", byteSize: file.size };
  }
  // Downscale via canvas
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const MAX_DIM = 1600;
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法處理影像");
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", 0.85);
  const base64 = out.split(",")[1] ?? "";
  return { base64, mimeType: "image/jpeg", byteSize: Math.floor((base64.length * 3) / 4) };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const r = fr.result as string;
      resolve(r.split(",")[1] ?? "");
    };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function clampToViewport(
  pos: { top: number; left: number },
  el: HTMLElement | null,
): { top: number; left: number } {
  const w = typeof window === "undefined" ? 1024 : window.innerWidth;
  const h = typeof window === "undefined" ? 768 : window.innerHeight;
  const cardW = el?.offsetWidth ?? CARD_WIDTH;
  const cardH = el?.offsetHeight ?? 400;
  return {
    top: Math.min(Math.max(VIEWPORT_PADDING, pos.top), Math.max(VIEWPORT_PADDING, h - cardH - VIEWPORT_PADDING)),
    left: Math.min(Math.max(VIEWPORT_PADDING, pos.left), Math.max(VIEWPORT_PADDING, w - cardW - VIEWPORT_PADDING)),
  };
}

function fmtMinutes(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
  }
  return `${min} 分`;
}
