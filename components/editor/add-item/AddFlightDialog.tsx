"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { AddItemDialogShell, Field } from "./dialog-shell";
import { PlaceQuickSearch, type QuickPlace } from "./PlaceQuickSearch";
import { addFlightAction, updateFlightAction } from "@/app/(actions)/add-item-actions";
import { suggestFlightInfoAction, type FlightSuggestResult } from "@/app/(actions)/flight-actions";
import { useToast } from "@/components/ui/Toast";
import { useCurrencyContext } from "@/lib/currency-context";
import { currencyMeta, type CurrencyCode } from "@/lib/currency";

export type FlightDialogInitial = {
  flightNumber?: string;
  airline?: string;
  depAirport?: string;
  depTime?: string;
  depTerminal?: string;
  arrAirport?: string;
  arrTime?: string;
  arrTerminal?: string;
  arrDateOffset?: number;
  isInternational?: boolean;
  checkInBufferMin?: number;
  immigrationBufferMin?: number;
  ticketPrice?: number | null;
  ticketCurrency?: CurrencyCode;
  bookingRef?: string;
  seatNumber?: string;
  aircraftType?: string;
  baggageAllowance?: string;
  mealNote?: string;
  notes?: string;
};

export function AddFlightDialog({
  tripId,
  defaultDate,
  hasGoogleKey,
  onClose,
  editing,
}: {
  tripId: string;
  defaultDate: string;
  hasGoogleKey?: boolean;
  onClose: () => void;
  editing?: { itemId: string; initial: FlightDialogInitial };
}) {
  const ctx = useCurrencyContext();
  const baseCurrency = ctx?.primary ?? "TWD";
  const { addToast } = useToast();
  const [submitting, startSubmit] = useTransition();
  const [looking, startLookup] = useTransition();

  const init = editing?.initial;
  const [flightNumber, setFlightNumber] = useState(init?.flightNumber ?? "");
  const [airline, setAirline] = useState(init?.airline ?? "");
  const [date, setDate] = useState(defaultDate);
  const [depAirport, setDepAirport] = useState(init?.depAirport ?? "");
  const [depTime, setDepTime] = useState(init?.depTime ?? "");
  const [depTerminal, setDepTerminal] = useState(init?.depTerminal ?? "");
  const [arrAirport, setArrAirport] = useState(init?.arrAirport ?? "");
  const [arrTime, setArrTime] = useState(init?.arrTime ?? "");
  const [arrTerminal, setArrTerminal] = useState(init?.arrTerminal ?? "");
  const [arrDateOffset, setArrDateOffset] = useState(init?.arrDateOffset ?? 0);
  const [depPlace, setDepPlace] = useState<QuickPlace | null>(null);
  const [arrPlace, setArrPlace] = useState<QuickPlace | null>(null);
  const [isInternational, setIsInternational] = useState(init?.isInternational ?? true);
  const [checkInBuffer, setCheckInBuffer] = useState(init?.checkInBufferMin ?? 120);
  const [immigrationBuffer, setImmigrationBuffer] = useState(init?.immigrationBufferMin ?? 60);
  const [ticketPrice, setTicketPrice] = useState(init?.ticketPrice != null ? String(init.ticketPrice) : "");
  const [ticketCurrency, setTicketCurrency] = useState<CurrencyCode>(init?.ticketCurrency ?? baseCurrency);
  const [bookingRef, setBookingRef] = useState(init?.bookingRef ?? "");
  const [seatNumber, setSeatNumber] = useState(init?.seatNumber ?? "");
  const [aircraftType, setAircraftType] = useState(init?.aircraftType ?? "");
  const [baggageAllowance, setBaggageAllowance] = useState(init?.baggageAllowance ?? "");
  const [mealNote, setMealNote] = useState(init?.mealNote ?? "");
  const [notes, setNotes] = useState(init?.notes ?? "");

  function aiLookup() {
    if (!flightNumber.trim()) return;
    startLookup(async () => {
      const r: FlightSuggestResult = await suggestFlightInfoAction({
        flightNumber: flightNumber.trim(),
        date,
      });
      if (!r.ok) {
        addToast({ kind: "error", message: r.error });
        return;
      }
      const ai = r.info;
      if (ai.airline) setAirline(ai.airline);
      if (ai.depAirport) setDepAirport(ai.depAirport);
      if (ai.arrAirport) setArrAirport(ai.arrAirport);
      if (ai.depTime) setDepTime(ai.depTime);
      if (ai.arrTime) setArrTime(ai.arrTime);
      if (ai.terminal) setDepTerminal(ai.terminal);
      if (ai.isInternational != null) {
        setIsInternational(ai.isInternational);
        setCheckInBuffer(ai.isInternational ? 120 : 60);
        setImmigrationBuffer(ai.isInternational ? 60 : 30);
      }
      if (ai.arrDateOffset && ai.arrDateOffset > 0) setArrDateOffset(ai.arrDateOffset);
      addToast({ kind: "success", message: `已從 ${r.source} 帶入資料` });
    });
  }

  function submit() {
    startSubmit(async () => {
      const payload = {
        tripId,
        date,
        flightNumber: flightNumber.trim(),
        airline: airline.trim() || null,
        depAirport: depAirport.trim().toUpperCase(),
        arrAirport: arrAirport.trim().toUpperCase(),
        depTime,
        arrTime,
        arrDateOffset,
        depTerminal: depTerminal.trim() || null,
        arrTerminal: arrTerminal.trim() || null,
        isInternational,
        checkInBufferMin: checkInBuffer,
        immigrationBufferMin: immigrationBuffer,
        ticketPrice: ticketPrice ? Number(ticketPrice) : null,
        ticketCurrency,
        bookingRef: bookingRef.trim() || null,
        seatNumber: seatNumber.trim() || null,
        aircraftType: aircraftType.trim() || null,
        baggageAllowance: baggageAllowance.trim() || null,
        mealNote: mealNote.trim() || null,
        notes: notes.trim() || null,
        depGooglePlace: depPlace?.googlePlace
          ? {
              googlePlaceId: depPlace.googlePlace.googlePlaceId,
              name: depPlace.googlePlace.name,
              category: depPlace.googlePlace.category,
              address: depPlace.googlePlace.address,
              rating: depPlace.googlePlace.rating,
              ratingCount: depPlace.googlePlace.ratingCount ?? null,
              iconKey: depPlace.googlePlace.iconKey,
              lat: depPlace.googlePlace.lat,
              lng: depPlace.googlePlace.lng,
            }
          : null,
        arrGooglePlace: arrPlace?.googlePlace
          ? {
              googlePlaceId: arrPlace.googlePlace.googlePlaceId,
              name: arrPlace.googlePlace.name,
              category: arrPlace.googlePlace.category,
              address: arrPlace.googlePlace.address,
              rating: arrPlace.googlePlace.rating,
              ratingCount: arrPlace.googlePlace.ratingCount ?? null,
              iconKey: arrPlace.googlePlace.iconKey,
              lat: arrPlace.googlePlace.lat,
              lng: arrPlace.googlePlace.lng,
            }
          : null,
      };
      const r = editing
        ? await updateFlightAction(editing.itemId, payload)
        : await addFlightAction(payload);
      if (r.ok) {
        addToast({ kind: "success", message: editing ? "已儲存變更" : "已新增飛航行程" });
        onClose();
      } else {
        addToast({ kind: "error", message: r.error });
      }
    });
  }

  const canSubmit =
    flightNumber.trim().length > 0 &&
    depAirport.trim().length >= 2 &&
    arrAirport.trim().length >= 2 &&
    /^\d{2}:\d{2}$/.test(depTime) &&
    /^\d{2}:\d{2}$/.test(arrTime);

  const codes = Object.keys(currencyMeta) as CurrencyCode[];

  return (
    <AddItemDialogShell
      title={editing ? "✈ 編輯飛航行程" : "✈ 新增飛航行程"}
      submitLabel={editing ? "儲存變更" : "新增飛航行程"}
      submitting={submitting}
      canSubmit={canSubmit}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="航班號 *">
        <div className="flex gap-1.5">
          <input
            value={flightNumber}
            onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
            placeholder="JL5042"
            className="h-9 flex-1 rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none"
          />
          <button
            type="button"
            onClick={aiLookup}
            disabled={looking || !flightNumber.trim()}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-dashed border-brand-accent bg-brand-accent/5 px-2 text-[11px] text-brand-accent hover:bg-brand-accent/10 disabled:opacity-60"
          >
            {looking ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            AI 補完
          </button>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="航空公司">
          <input value={airline} onChange={(e) => setAirline(e.target.value)} placeholder="China Airlines"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="日期 *">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      </div>

      <div className="rounded-md border border-hairline-soft bg-surface-soft p-3">
        <p className="mb-2 text-caption-uppercase text-muted-soft">出發</p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="機場 IATA *">
            <input value={depAirport} onChange={(e) => setDepAirport(e.target.value.toUpperCase())} placeholder="TSA"
                   className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm uppercase focus:border-ink focus:outline-none" />
          </Field>
          <Field label="時刻 *">
            <input type="time" value={depTime} onChange={(e) => setDepTime(e.target.value)}
                   className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
          </Field>
          <Field label="航廈">
            <input value={depTerminal} onChange={(e) => setDepTerminal(e.target.value)} placeholder="1"
                   className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
          </Field>
        </div>
        <div className="mt-2">
          <p className="mb-1 text-[10px] text-muted-soft">機場（Google 搜尋 — 不正確可重搜）</p>
          <PlaceQuickSearch
            value={depPlace}
            onChange={setDepPlace}
            hasGoogleKey={hasGoogleKey}
            placeholder="搜尋出發機場"
            seedQuery={depAirport.trim() ? `${depAirport.trim()} airport` : ""}
            alwaysOpen
            fallbackCategory="機場"
          />
        </div>
      </div>
      <div className="rounded-md border border-hairline-soft bg-surface-soft p-3">
        <p className="mb-2 text-caption-uppercase text-muted-soft">抵達</p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="機場 IATA *">
            <input value={arrAirport} onChange={(e) => setArrAirport(e.target.value.toUpperCase())} placeholder="HND"
                   className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm uppercase focus:border-ink focus:outline-none" />
          </Field>
          <Field label="時刻 *">
            <input type="time" value={arrTime} onChange={(e) => setArrTime(e.target.value)}
                   className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
          </Field>
          <Field label="航廈">
            <input value={arrTerminal} onChange={(e) => setArrTerminal(e.target.value)} placeholder="3"
                   className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
          </Field>
        </div>
        <div className="mt-2">
          <p className="mb-1 text-[10px] text-muted-soft">機場（Google 搜尋 — 不正確可重搜）</p>
          <PlaceQuickSearch
            value={arrPlace}
            onChange={setArrPlace}
            hasGoogleKey={hasGoogleKey}
            placeholder="搜尋抵達機場"
            seedQuery={arrAirport.trim() ? `${arrAirport.trim()} airport` : ""}
            alwaysOpen
            fallbackCategory="機場"
          />
        </div>
        <Field label="跨日抵達 (+N 天)">
          <input type="number" min="0" max="2" value={arrDateOffset} onChange={(e) => setArrDateOffset(Math.max(0, Math.min(2, Number(e.target.value) || 0)))}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-body-sm">
        <input type="checkbox" checked={isInternational} onChange={(e) => {
          setIsInternational(e.target.checked);
          setCheckInBuffer(e.target.checked ? 120 : 60);
          setImmigrationBuffer(e.target.checked ? 60 : 30);
        }} />
        國際航班（影響緩衝預設值）
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check-in 提早（分）" hint="顯示在卡片內（不另建 item）">
          <input type="number" min="0" value={checkInBuffer} onChange={(e) => setCheckInBuffer(Number(e.target.value) || 0)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="入境取行李（分）" hint="顯示在卡片內（不另建 item）">
          <input type="number" min="0" value={immigrationBuffer} onChange={(e) => setImmigrationBuffer(Number(e.target.value) || 0)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="機票價格">
          <div className="flex gap-1.5">
            <input type="number" min="0" value={ticketPrice} onChange={(e) => setTicketPrice(e.target.value)} placeholder="31000"
                   className="h-9 flex-1 rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
            <select value={ticketCurrency} onChange={(e) => setTicketCurrency(e.target.value as CurrencyCode)}
                    className="h-9 w-20 rounded-md border border-hairline bg-canvas px-1 font-mono text-[11px] focus:border-ink focus:outline-none">
              {codes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </Field>
        <Field label="訂位代號 (PNR)">
          <input value={bookingRef} onChange={(e) => setBookingRef(e.target.value.toUpperCase())} placeholder="ABC123"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="座位">
          <input value={seatNumber} onChange={(e) => setSeatNumber(e.target.value)} placeholder="12A"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="機型">
          <input value={aircraftType} onChange={(e) => setAircraftType(e.target.value)} placeholder="B738"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="行李額度" span={2}>
          <input value={baggageAllowance} onChange={(e) => setBaggageAllowance(e.target.value)} placeholder="託運 23kg × 1 / 隨身 7kg"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="餐食 / 特殊需求" span={2}>
          <input value={mealNote} onChange={(e) => setMealNote(e.target.value)} placeholder="素食 / VGML"
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="備註" span={2}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                 className="w-full rounded-md border border-hairline bg-canvas p-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      </div>
    </AddItemDialogShell>
  );
}
