"use client";

import { useState } from "react";
import {
  Plane,
  Hotel,
  UtensilsCrossed,
  MapPin,
  Car,
  Coffee,
  Footprints,
  X,
} from "lucide-react";
import { AddFlightDialog } from "./add-item/AddFlightDialog";
import { AddLodgingDialog } from "./add-item/AddLodgingDialog";
import { AddMealDialog } from "./add-item/AddMealDialog";
import { AddAttractionDialog } from "./add-item/AddAttractionDialog";
import { AddCarRentalDialog } from "./add-item/AddCarRentalDialog";
import { AddFreeDialog } from "./add-item/AddFreeDialog";
import { AddStopDialog } from "./add-item/AddStopDialog";

// Phase 14c — kind picker. Shown when the user clicks "+ 新增" in the
// editor list view (or dashboard). Each tile opens a kind-specific dialog.

type Kind =
  | "FLIGHT"
  | "LODGING"
  | "MEAL"
  | "ATTRACTION"
  | "CAR_RENTAL"
  | "FREE"
  | "TRANSPORT_STOP";

const TILES: Array<{
  kind: Kind;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  hint: string;
  accent: string;
}> = [
  { kind: "ATTRACTION", icon: MapPin, label: "景點", hint: "觀光 / 拍照 / 體驗", accent: "text-badge-orange" },
  { kind: "MEAL", icon: UtensilsCrossed, label: "餐飲", hint: "早 / 午 / 晚 / 宵夜", accent: "text-badge-pink" },
  { kind: "LODGING", icon: Hotel, label: "住宿", hint: "飯店 / 民宿 / 多晚", accent: "text-badge-emerald" },
  { kind: "FLIGHT", icon: Plane, label: "飛航", hint: "航班 + 自動 check-in / 入境", accent: "text-brand-accent" },
  { kind: "CAR_RENTAL", icon: Car, label: "租車", hint: "取車 / 還車", accent: "text-warning" },
  { kind: "FREE", icon: Coffee, label: "自由時間", hint: "購物 / 散步 / 休息", accent: "text-muted" },
  { kind: "TRANSPORT_STOP", icon: Footprints, label: "中繼", hint: "換乘 / 等待 / 寄物", accent: "text-muted-soft" },
];

export function AddItemKindPicker({
  tripId,
  defaultDate,
  onClose,
  hasGoogleKey,
}: {
  tripId: string;
  defaultDate: string; // YYYY-MM-DD — current day in the editor
  onClose: () => void;
  hasGoogleKey?: boolean;
}) {
  const [pickedKind, setPickedKind] = useState<Kind | null>(null);

  return (
    <>
      {!pickedKind && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-[min(8vh,4rem)] backdrop-blur-sm"
        >
          <div
            className="flex w-full max-w-lg flex-col overflow-hidden rounded-lg border border-hairline bg-canvas shadow-soft-elevation"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-hairline-soft px-5 py-3">
              <div>
                <p className="text-caption-uppercase text-muted-soft">Add Item</p>
                <h2 className="text-title-md text-ink">選擇新增類型</h2>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
              {TILES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.kind}
                    type="button"
                    onClick={() => setPickedKind(t.kind)}
                    className="flex flex-col items-center gap-2 rounded-lg border border-hairline bg-canvas p-4 text-center transition-colors hover:border-primary hover:bg-surface-soft"
                  >
                    <Icon size={26} strokeWidth={1.6} className={t.accent} />
                    <span className="text-body-sm font-medium text-ink">{t.label}</span>
                    <span className="text-[10px] text-muted-soft">{t.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {pickedKind === "FLIGHT" && (
        <AddFlightDialog tripId={tripId} defaultDate={defaultDate} onClose={onClose} />
      )}
      {pickedKind === "LODGING" && (
        <AddLodgingDialog
          tripId={tripId}
          defaultDate={defaultDate}
          onClose={onClose}
          hasGoogleKey={hasGoogleKey}
        />
      )}
      {pickedKind === "MEAL" && (
        <AddMealDialog
          tripId={tripId}
          defaultDate={defaultDate}
          onClose={onClose}
          hasGoogleKey={hasGoogleKey}
        />
      )}
      {pickedKind === "ATTRACTION" && (
        <AddAttractionDialog
          tripId={tripId}
          defaultDate={defaultDate}
          onClose={onClose}
          hasGoogleKey={hasGoogleKey}
        />
      )}
      {pickedKind === "CAR_RENTAL" && (
        <AddCarRentalDialog
          tripId={tripId}
          defaultDate={defaultDate}
          onClose={onClose}
          hasGoogleKey={hasGoogleKey}
        />
      )}
      {pickedKind === "FREE" && (
        <AddFreeDialog tripId={tripId} defaultDate={defaultDate} onClose={onClose} />
      )}
      {pickedKind === "TRANSPORT_STOP" && (
        <AddStopDialog tripId={tripId} defaultDate={defaultDate} onClose={onClose} />
      )}
    </>
  );
}
