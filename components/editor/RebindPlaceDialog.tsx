"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X, MapPin, Loader2, Info } from "lucide-react";
import { PlaceQuickSearch, type QuickPlace, type SearchSource } from "@/components/editor/add-item/PlaceQuickSearch";
import { rebindItemPlaceAction } from "@/app/(actions)/schedule-actions";
import { useToast } from "@/components/ui/Toast";

// Phase 14m commit 5 — modal that lets the user pick a Google Places result
// and rebind a ScheduleItem to it. Sibling rows of the same logical booking
// are updated server-side (LODGING nights / CAR_RENTAL pickup-return).
// metadataJson / notes are preserved across the rebind.
//
// Phase P2 — adds a Kakao tab for the most common painful case: AI-imported
// Korean places with Chinese names that Google can't find (e.g. 「松亭3代豬肉湯飯」
// → Kakao knows it as 「송정3대국밥」). User can search by either Korean or
// Chinese keyword; Kakao maps both to the actual POI.
export function RebindPlaceDialog({
  tripId,
  itemId,
  currentPlaceName,
  region,
  hasGoogleKey,
  hasKakaoRestKey,
  defaultSource = "google",
  onClose,
}: {
  tripId: string;
  itemId: string;
  currentPlaceName: string;
  region?: string;
  hasGoogleKey?: boolean;
  hasKakaoRestKey?: boolean;
  defaultSource?: SearchSource;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<QuickPlace | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [source, setSource] = useState<SearchSource>(
    defaultSource === "kakao" && hasKakaoRestKey ? "kakao" : "google",
  );
  const { addToast } = useToast();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const seedQuery = region ? `${currentPlaceName} ${region}` : currentPlaceName;

  function submit() {
    if (submitting) return;
    if (!picked?.googlePlace) return;
    startSubmit(async () => {
      const r = await rebindItemPlaceAction(tripId, itemId, picked.googlePlace!);
      if (r.ok) {
        addToast({
          kind: "success",
          message: r.updatedItemIds.length > 1
            ? `已重綁地點（同步更新 ${r.updatedItemIds.length} 個關聯項目）`
            : "已重綁地點",
        });
        onClose();
      } else {
        addToast({ kind: "error", message: r.error });
      }
    });
  }

  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg border border-hairline bg-canvas shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline-soft bg-surface-soft px-4 py-2.5">
          <div className="flex items-center gap-2">
            <MapPin size={14} strokeWidth={1.8} className="text-muted" />
            <h2 className="text-body-sm font-semibold text-ink">重新綁定 Google 地點</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-canvas hover:text-ink"
            aria-label="關閉"
          >
            <X size={12} strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-start gap-2 rounded-md border border-hairline-soft bg-surface-soft p-2.5 text-[11px] text-muted">
            <Info size={11} strokeWidth={1.8} className="mt-0.5 flex-shrink-0" />
            <p>
              此操作會更換地點資訊（評分、地址、座標、類別、照片）。
              你已填的旅行筆記、票價、訂房資訊等<span className="text-ink">不會</span>被覆蓋。
              {region ? null : ""}
            </p>
          </div>

          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-soft">
              目前地點
            </p>
            <p className="text-body-sm text-ink">{currentPlaceName}</p>
          </div>

          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-soft">
              {source === "kakao" ? "新地點（從 Kakao 搜尋）" : "新地點（從 Google 搜尋）"}
            </p>
            {hasKakaoRestKey && (
              <div className="mb-2 inline-flex overflow-hidden rounded-pill border border-hairline text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    setSource("google");
                    setPicked(null);
                  }}
                  className={`px-3 py-1 transition-colors ${
                    source === "google"
                      ? "bg-ink text-on-primary"
                      : "bg-canvas text-muted hover:text-ink"
                  }`}
                >
                  🌐 Google
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSource("kakao");
                    setPicked(null);
                  }}
                  className={`border-l border-hairline px-3 py-1 transition-colors ${
                    source === "kakao"
                      ? "bg-ink text-on-primary"
                      : "bg-canvas text-muted hover:text-ink"
                  }`}
                >
                  🇰🇷 Kakao（韓國準）
                </button>
              </div>
            )}
            <PlaceQuickSearch
              value={picked}
              onChange={setPicked}
              placeholder={source === "kakao" ? "검색 / 搜尋韓國 POI…" : "搜尋 Google 地點"}
              hasGoogleKey={hasGoogleKey}
              seedQuery={seedQuery}
              alwaysOpen
              fallbackCategory="景點"
              source={source}
            />
          </div>

        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline-soft bg-surface-soft px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-hairline bg-canvas px-3 py-1.5 text-button text-ink hover:border-ink disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!picked?.googlePlace || submitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-button text-on-primary hover:bg-primary-active disabled:opacity-50"
          >
            {submitting && <Loader2 size={11} strokeWidth={2} className="animate-spin" />}
            確認重新綁定
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
