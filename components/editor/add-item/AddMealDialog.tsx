"use client";

import { useState, useTransition } from "react";
import { AddItemDialogShell, Field } from "./dialog-shell";
import { addMealAction, updateMealAction } from "@/app/(actions)/add-item-actions";
import { useToast } from "@/components/ui/Toast";
import { useCurrencyContext } from "@/lib/currency-context";
import { currencyMeta, type CurrencyCode } from "@/lib/currency";
import { PlaceQuickSearch, type QuickPlace } from "./PlaceQuickSearch";

const PERIODS: Array<{ key: "BREAKFAST" | "LUNCH" | "DINNER" | "LATE_NIGHT"; label: string; t: string }> = [
  { key: "BREAKFAST", label: "早餐", t: "08:00" },
  { key: "LUNCH", label: "午餐", t: "12:30" },
  { key: "DINNER", label: "晚餐", t: "18:30" },
  { key: "LATE_NIGHT", label: "宵夜", t: "22:00" },
];

export type MealDialogInitial = {
  restaurant: QuickPlace;
  period?: "BREAKFAST" | "LUNCH" | "DINNER" | "LATE_NIGHT";
  time?: string;
  durationMin?: number;
  partySize?: number;
  averagePrice?: number | null;
  ticketCurrency?: CurrencyCode;
  reservationRef?: string;
  reservationPlatform?: string;
  cuisine?: string;
  mustTry?: string;
  specialRequests?: string;
  notes?: string;
};

export function AddMealDialog({
  tripId, defaultDate, onClose, hasGoogleKey, editing,
}: {
  tripId: string;
  defaultDate: string;
  onClose: () => void;
  hasGoogleKey?: boolean;
  editing?: { itemId: string; initial: MealDialogInitial };
}) {
  const ctx = useCurrencyContext();
  const baseCurrency = ctx?.primary ?? "TWD";
  const { addToast } = useToast();
  const [submitting, startSubmit] = useTransition();

  const init = editing?.initial;
  const [restaurant, setRestaurant] = useState<QuickPlace | null>(init?.restaurant ?? null);
  const [date, setDate] = useState(defaultDate);
  const [period, setPeriod] = useState<"BREAKFAST" | "LUNCH" | "DINNER" | "LATE_NIGHT">(init?.period ?? "LUNCH");
  const [time, setTime] = useState(init?.time ?? "12:30");
  const [duration, setDuration] = useState(init?.durationMin ?? 60);
  const [partySize, setPartySize] = useState(init?.partySize ?? 2);
  const [averagePrice, setAveragePrice] = useState(init?.averagePrice != null ? String(init.averagePrice) : "");
  const [ticketCurrency, setTicketCurrency] = useState<CurrencyCode>(init?.ticketCurrency ?? baseCurrency);
  const [reservationRef, setReservationRef] = useState(init?.reservationRef ?? "");
  const [reservationPlatform, setReservationPlatform] = useState(init?.reservationPlatform ?? "");
  const [cuisine, setCuisine] = useState(init?.cuisine ?? "");
  const [mustTry, setMustTry] = useState(init?.mustTry ?? "");
  const [specialRequests, setSpecialRequests] = useState(init?.specialRequests ?? "");
  const [notes, setNotes] = useState(init?.notes ?? "");

  const total = averagePrice ? Number(averagePrice) * partySize : 0;

  function submit() {
    if (!restaurant) return;
    startSubmit(async () => {
      const payload = {
        tripId,
        date,
        restaurant: restaurant.googlePlace
          ? { googlePlace: restaurant.googlePlace, name: restaurant.name }
          : { name: restaurant.name, address: restaurant.address, lat: restaurant.lat, lng: restaurant.lng },
        mealPeriod: period,
        reservationTime: time,
        durationMin: duration,
        partySize,
        averagePrice: averagePrice ? Number(averagePrice) : null,
        ticketCurrency,
        reservationRef: reservationRef.trim() || null,
        reservationPlatform: reservationPlatform.trim() || null,
        cuisine: cuisine.trim() || null,
        mustTry: mustTry.trim() || null,
        specialRequests: specialRequests.trim() || null,
        notes: notes.trim() || null,
      };
      const r = editing
        ? await updateMealAction(editing.itemId, payload)
        : await addMealAction(payload);
      if (r.ok) {
        addToast({ kind: "success", message: editing ? "已儲存變更" : "已新增餐飲" });
        onClose();
      } else addToast({ kind: "error", message: r.error });
    });
  }

  const codes = Object.keys(currencyMeta) as CurrencyCode[];

  return (
    <AddItemDialogShell
      title={editing ? "🍴 編輯餐飲" : "🍴 新增餐飲"}
      submitLabel={editing ? "儲存變更" : "新增餐飲"}
      submitting={submitting} canSubmit={!!restaurant}
      onSubmit={submit} onClose={onClose}
    >
      <Field label="餐廳 *">
        <PlaceQuickSearch value={restaurant} onChange={setRestaurant} placeholder="餐廳名稱" hasGoogleKey={hasGoogleKey} fallbackCategory="餐廳" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="日期 *">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="預訂時間">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      </div>
      <Field label="用餐時段">
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button key={p.key} type="button"
              onClick={() => { setPeriod(p.key); setTime(p.t); }}
              className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] ${
                period === p.key ? "border-ink bg-ink text-on-primary" : "border-hairline bg-canvas hover:border-ink"
              }`}>{p.label}</button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="預估用餐（分）">
          <input type="number" min="0" value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="人數">
          <input type="number" min="1" value={partySize} onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      </div>
      <Field label={`預估人均${total > 0 ? `（總計 ${ticketCurrency} ${total.toLocaleString()}）` : ""}`}>
        <div className="flex gap-1.5">
          <input type="number" min="0" value={averagePrice} onChange={(e) => setAveragePrice(e.target.value)}
                 className="h-9 flex-1 rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
          <select value={ticketCurrency} onChange={(e) => setTicketCurrency(e.target.value as CurrencyCode)}
                  className="h-9 w-20 rounded-md border border-hairline bg-canvas px-1 font-mono text-[11px] focus:border-ink focus:outline-none">
            {codes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="訂位代號">
          <input value={reservationRef} onChange={(e) => setReservationRef(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="預訂平台">
          <input value={reservationPlatform} onChange={(e) => setReservationPlatform(e.target.value)} placeholder="TableCheck / inline / 電話"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="菜系">
          <input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="壽司 / 拉麵 / 義式"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="特殊需求">
          <input value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} placeholder="兒童椅 / 過敏"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="必點 / 推薦菜色" span={2}>
          <textarea value={mustTry} onChange={(e) => setMustTry(e.target.value)} rows={2} placeholder="一行一個"
                    className="w-full rounded-md border border-hairline bg-canvas p-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="備註" span={2}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    className="w-full rounded-md border border-hairline bg-canvas p-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      </div>
    </AddItemDialogShell>
  );
}
