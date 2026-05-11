"use client";

import { useState, useTransition } from "react";
import { AddItemDialogShell, Field } from "./dialog-shell";
import { addCarRentalAction, updateCarRentalAction } from "@/app/(actions)/add-item-actions";
import { useToast } from "@/components/ui/Toast";
import { useCurrencyContext } from "@/lib/currency-context";
import { currencyMeta, type CurrencyCode } from "@/lib/currency";
import { PlaceQuickSearch, type QuickPlace } from "./PlaceQuickSearch";

const INSURANCE_TIERS: Array<{ k: "BASIC" | "PREMIUM" | "FULL" | "NONE"; label: string }> = [
  { k: "NONE", label: "無" },
  { k: "BASIC", label: "基本險" },
  { k: "PREMIUM", label: "進階險" },
  { k: "FULL", label: "全險" },
];
const FUEL_POLICIES: Array<{ k: "FULL_TO_FULL" | "FULL_TO_EMPTY" | "PRE_PURCHASED" | "OTHER"; label: string }> = [
  { k: "FULL_TO_FULL", label: "滿油還" },
  { k: "FULL_TO_EMPTY", label: "同油位還" },
  { k: "PRE_PURCHASED", label: "預購油" },
  { k: "OTHER", label: "其他" },
];

export type CarRentalDialogInitial = {
  pickup: QuickPlace;
  returnPlace?: QuickPlace | null;
  sameLocation?: boolean;
  pickupDate?: string;
  pickupTime?: string;
  returnDate?: string;
  returnTime?: string;
  vendor?: string;
  carModel?: string;
  bookingRef?: string;
  dailyRate?: number | null;
  ticketCurrency?: CurrencyCode;
  insuranceTier?: "BASIC" | "PREMIUM" | "FULL" | "NONE";
  insurancePerDay?: number | null;
  fuelPolicy?: "FULL_TO_FULL" | "FULL_TO_EMPTY" | "PRE_PURCHASED" | "OTHER";
  addOns?: string;
  addOnTotal?: number | null;
  driverLicense?: string;
  notes?: string;
};

export function AddCarRentalDialog({
  tripId, defaultDate, onClose, hasGoogleKey, editing,
}: {
  tripId: string;
  defaultDate: string;
  onClose: () => void;
  hasGoogleKey?: boolean;
  editing?: { itemId: string; initial: CarRentalDialogInitial };
}) {
  const ctx = useCurrencyContext();
  const baseCurrency = ctx?.primary ?? "TWD";
  const { addToast } = useToast();
  const [submitting, startSubmit] = useTransition();

  const init = editing?.initial;
  const [pickup, setPickup] = useState<QuickPlace | null>(init?.pickup ?? null);
  const [returnPlace, setReturnPlace] = useState<QuickPlace | null>(init?.returnPlace ?? null);
  const [sameLocation, setSameLocation] = useState(init?.sameLocation ?? true);
  const [pickupDate, setPickupDate] = useState(init?.pickupDate ?? defaultDate);
  const [pickupTime, setPickupTime] = useState(init?.pickupTime ?? "10:00");
  const [returnDate, setReturnDate] = useState(init?.returnDate ?? addDays(defaultDate, 3));
  const [returnTime, setReturnTime] = useState(init?.returnTime ?? "10:00");
  const [vendor, setVendor] = useState(init?.vendor ?? "");
  const [carModel, setCarModel] = useState(init?.carModel ?? "");
  const [bookingRef, setBookingRef] = useState(init?.bookingRef ?? "");
  const [dailyRate, setDailyRate] = useState(init?.dailyRate != null ? String(init.dailyRate) : "");
  const [ticketCurrency, setTicketCurrency] = useState<CurrencyCode>(init?.ticketCurrency ?? baseCurrency);
  const [insuranceTier, setInsuranceTier] = useState<"BASIC" | "PREMIUM" | "FULL" | "NONE">(init?.insuranceTier ?? "BASIC");
  const [insurancePerDay, setInsurancePerDay] = useState(init?.insurancePerDay != null ? String(init.insurancePerDay) : "");
  const [fuelPolicy, setFuelPolicy] = useState<"FULL_TO_FULL" | "FULL_TO_EMPTY" | "PRE_PURCHASED" | "OTHER">(init?.fuelPolicy ?? "FULL_TO_FULL");
  const [addOns, setAddOns] = useState(init?.addOns ?? "");
  const [addOnTotal, setAddOnTotal] = useState(init?.addOnTotal != null ? String(init.addOnTotal) : "");
  const [driverLicense, setDriverLicense] = useState(init?.driverLicense ?? "");
  const [notes, setNotes] = useState(init?.notes ?? "");

  const days = Math.max(1, Math.round(
    (new Date(returnDate + "T00:00:00Z").getTime() - new Date(pickupDate + "T00:00:00Z").getTime()) / 86400000,
  ));
  const total =
    (Number(dailyRate) || 0) * days +
    (Number(insurancePerDay) || 0) * days +
    (Number(addOnTotal) || 0);

  function submit() {
    if (!pickup) return;
    startSubmit(async () => {
      const payload = {
        tripId,
        pickupPlace: pickup.googlePlace ? { googlePlace: pickup.googlePlace, name: pickup.name } : { name: pickup.name, address: pickup.address, lat: pickup.lat, lng: pickup.lng },
        returnPlace: sameLocation
          ? (pickup.googlePlace ? { googlePlace: pickup.googlePlace, name: pickup.name } : { name: pickup.name })
          : (returnPlace?.googlePlace ? { googlePlace: returnPlace.googlePlace, name: returnPlace.name } : { name: returnPlace?.name ?? pickup.name }),
        sameLocation,
        pickupDate, pickupTime, returnDate, returnTime,
        vendor: vendor.trim() || null,
        carModel: carModel.trim() || null,
        bookingRef: bookingRef.trim() || null,
        dailyRate: dailyRate ? Number(dailyRate) : null,
        ticketCurrency,
        insuranceTier,
        insurancePerDay: insurancePerDay ? Number(insurancePerDay) : null,
        fuelPolicy,
        addOns: addOns.trim() || null,
        addOnTotal: addOnTotal ? Number(addOnTotal) : null,
        driverLicense: driverLicense.trim() || null,
        notes: notes.trim() || null,
      };
      const r = editing
        ? await updateCarRentalAction(editing.itemId, payload)
        : await addCarRentalAction(payload);
      if (r.ok) {
        addToast({ kind: "success", message: editing ? "已儲存變更" : `已新增 ${days} 天租車` });
        onClose();
      } else addToast({ kind: "error", message: r.error });
    });
  }

  const codes = Object.keys(currencyMeta) as CurrencyCode[];

  return (
    <AddItemDialogShell
      title={editing ? "🚗 編輯租車" : "🚗 新增租車"}
      submitLabel={editing ? "儲存變更" : `新增 ${days} 天租車`}
      submitting={submitting} canSubmit={!!pickup}
      onSubmit={submit} onClose={onClose}
    >
      <Field label="取車地點 *">
        <PlaceQuickSearch value={pickup} onChange={setPickup} placeholder="租車公司 / 機場店"
                          hasGoogleKey={hasGoogleKey} fallbackCategory="租車" />
      </Field>
      <label className="flex items-center gap-2 text-body-sm">
        <input type="checkbox" checked={sameLocation} onChange={(e) => setSameLocation(e.target.checked)} />
        同地點還車
      </label>
      {!sameLocation && (
        <Field label="還車地點">
          <PlaceQuickSearch value={returnPlace} onChange={setReturnPlace} placeholder="還車地點"
                            hasGoogleKey={hasGoogleKey} fallbackCategory="租車" />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="取車日期 *">
          <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="取車時間 *">
          <input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="還車日期 *" hint={`${days} 天`}>
          <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="還車時間 *">
          <input type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="租車公司">
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Toyota Rentacar / Hertz"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="車型">
          <input value={carModel} onChange={(e) => setCarModel(e.target.value)} placeholder="Yaris (5-seater)"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="訂位代號">
          <input value={bookingRef} onChange={(e) => setBookingRef(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      </div>

      <div className="rounded-md border border-hairline-soft bg-surface-soft p-3 text-[11px]">
        <Field label="每日租金">
          <div className="flex gap-1.5">
            <input type="number" min="0" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)}
                   className="h-9 flex-1 rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
            <select value={ticketCurrency} onChange={(e) => setTicketCurrency(e.target.value as CurrencyCode)}
                    className="h-9 w-20 rounded-md border border-hairline bg-canvas px-1 font-mono text-[11px] focus:border-ink focus:outline-none">
              {codes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="self-center text-muted-soft">× {days} 天</span>
          </div>
        </Field>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="保險">
            <select value={insuranceTier} onChange={(e) => setInsuranceTier(e.target.value as "BASIC" | "PREMIUM" | "FULL" | "NONE")}
                    className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none">
              {INSURANCE_TIERS.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="保險加價 / 天">
            <input type="number" min="0" value={insurancePerDay} onChange={(e) => setInsurancePerDay(e.target.value)}
                   className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
          </Field>
          <Field label="加裝項目">
            <input value={addOns} onChange={(e) => setAddOns(e.target.value)} placeholder="GPS, 兒童椅"
                   className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
          </Field>
          <Field label="加裝費用">
            <input type="number" min="0" value={addOnTotal} onChange={(e) => setAddOnTotal(e.target.value)}
                   className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
          </Field>
          <Field label="加油政策" span={2}>
            <select value={fuelPolicy} onChange={(e) => setFuelPolicy(e.target.value as "FULL_TO_FULL" | "FULL_TO_EMPTY" | "PRE_PURCHASED" | "OTHER")}
                    className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none">
              {FUEL_POLICIES.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
            </select>
          </Field>
        </div>
        {total > 0 && (
          <div className="mt-2 border-t border-hairline-soft pt-1.5 text-right">
            <span className="font-display text-[20px] leading-none text-ink">
              {ticketCurrency} {total.toLocaleString()}
            </span>
            <span className="ml-2 text-[10px] text-muted-soft">總費用</span>
          </div>
        )}
      </div>

      <Field label="駕照 / 國際駕照備註">
        <input value={driverLicense} onChange={(e) => setDriverLicense(e.target.value)} placeholder="已備國際駕照影本"
               className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
      </Field>
      <Field label="備註">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full rounded-md border border-hairline bg-canvas p-2 text-body-sm focus:border-ink focus:outline-none" />
      </Field>
    </AddItemDialogShell>
  );
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
