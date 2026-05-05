"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AddItemDialogShell, Field } from "./dialog-shell";
import { addAttractionAction } from "@/app/(actions)/add-item-actions";
import { useToast } from "@/components/ui/Toast";
import { useCurrencyContext } from "@/lib/currency-context";
import { currencyMeta, type CurrencyCode } from "@/lib/currency";
import { PlaceQuickSearch, type QuickPlace } from "./PlaceQuickSearch";

type Tier = { label: string; unitPrice: string; quantity: string };

export function AddAttractionDialog({
  tripId, defaultDate, onClose, hasGoogleKey,
}: { tripId: string; defaultDate: string; onClose: () => void; hasGoogleKey?: boolean }) {
  const ctx = useCurrencyContext();
  const baseCurrency = ctx?.primary ?? "TWD";
  const { addToast } = useToast();
  const [submitting, startSubmit] = useTransition();

  const [place, setPlace] = useState<QuickPlace | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState(90);
  const [reservationRequired, setReservationRequired] = useState(false);
  const [bookingRef, setBookingRef] = useState("");
  const [tickets, setTickets] = useState<Tier[]>([{ label: "成人", unitPrice: "", quantity: "2" }]);
  const [ticketCurrency, setTicketCurrency] = useState<CurrencyCode>(baseCurrency);
  const [openingHours, setOpeningHours] = useState("");
  const [highlights, setHighlights] = useState("");
  const [notes, setNotes] = useState("");

  const tickets_total = tickets.reduce((s, t) => {
    const p = Number(t.unitPrice) || 0;
    const q = Number(t.quantity) || 0;
    return s + p * q;
  }, 0);

  function addTier() { setTickets([...tickets, { label: "兒童", unitPrice: "", quantity: "1" }]); }
  function removeTier(i: number) { setTickets(tickets.filter((_, j) => j !== i)); }
  function updateTier(i: number, patch: Partial<Tier>) {
    setTickets(tickets.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }

  function submit() {
    if (!place) return;
    startSubmit(async () => {
      const cleanTickets = tickets
        .filter((t) => Number(t.unitPrice) > 0 && Number(t.quantity) > 0)
        .map((t) => ({ label: t.label, unitPrice: Number(t.unitPrice), quantity: Number(t.quantity) }));
      const r = await addAttractionAction({
        tripId,
        date,
        place: place.googlePlace
          ? { googlePlace: place.googlePlace, name: place.name }
          : { name: place.name, address: place.address, lat: place.lat, lng: place.lng },
        startTime,
        durationMin: duration,
        reservationRequired,
        bookingRef: bookingRef.trim() || null,
        tickets: cleanTickets.length > 0 ? cleanTickets : null,
        ticketCurrency,
        openingHours: openingHours.trim() || null,
        highlights: highlights.trim() || null,
        notes: notes.trim() || null,
      });
      if (r.ok) { addToast({ kind: "success", message: "已新增景點" }); onClose(); }
      else addToast({ kind: "error", message: r.error });
    });
  }

  const codes = Object.keys(currencyMeta) as CurrencyCode[];

  return (
    <AddItemDialogShell
      title="📍 新增景點" submitLabel="新增景點"
      submitting={submitting} canSubmit={!!place}
      onSubmit={submit} onClose={onClose}
    >
      <Field label="景點 *">
        <PlaceQuickSearch value={place} onChange={setPlace} placeholder="景點名稱 / 地址" hasGoogleKey={hasGoogleKey} fallbackCategory="景點" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="日期 *">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="預計到訪">
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="滯留（分）">
          <input type="number" min="0" value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-body-sm">
        <input type="checkbox" checked={reservationRequired} onChange={(e) => setReservationRequired(e.target.checked)} />
        需預約
      </label>
      {reservationRequired && (
        <Field label="預約代號">
          <input value={bookingRef} onChange={(e) => setBookingRef(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      )}

      <div className="rounded-md border border-hairline-soft bg-surface-soft p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-caption-uppercase text-muted-soft">票價（多種）</p>
          <select value={ticketCurrency} onChange={(e) => setTicketCurrency(e.target.value as CurrencyCode)}
                  className="h-7 w-20 rounded-md border border-hairline bg-canvas px-1 font-mono text-[11px] focus:border-ink focus:outline-none">
            {codes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {tickets.map((t, i) => (
          <div key={i} className="mb-1.5 flex gap-1.5 text-[11px]">
            <input value={t.label} onChange={(e) => updateTier(i, { label: e.target.value })} placeholder="成人 / 兒童"
                   className="h-8 w-24 rounded-md border border-hairline bg-canvas px-2 focus:border-ink focus:outline-none" />
            <input type="number" min="0" value={t.unitPrice} onChange={(e) => updateTier(i, { unitPrice: e.target.value })} placeholder="800"
                   className="h-8 flex-1 rounded-md border border-hairline bg-canvas px-2 font-mono focus:border-ink focus:outline-none" />
            <span className="self-center text-muted-soft">×</span>
            <input type="number" min="0" value={t.quantity} onChange={(e) => updateTier(i, { quantity: e.target.value })}
                   className="h-8 w-14 rounded-md border border-hairline bg-canvas px-2 font-mono focus:border-ink focus:outline-none" />
            <span className="self-center w-20 text-right font-mono text-muted">
              = {((Number(t.unitPrice) || 0) * (Number(t.quantity) || 0)).toLocaleString()}
            </span>
            {tickets.length > 1 && (
              <button type="button" onClick={() => removeTier(i)}
                      className="text-muted-soft hover:text-ink">
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addTier}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-hairline px-2 text-[11px] text-muted hover:border-ink hover:text-ink">
          <Plus size={10} /> 加票種
        </button>
        {tickets_total > 0 && (
          <div className="mt-2 border-t border-hairline-soft pt-1.5 text-right font-mono text-body-sm text-ink">
            合計：{ticketCurrency} {tickets_total.toLocaleString()}
          </div>
        )}
      </div>

      <Field label="開放時間">
        <input value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} placeholder="9:00-17:00 週一公休"
               className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
      </Field>
      <Field label="重點導覽 / 必看">
        <textarea value={highlights} onChange={(e) => setHighlights(e.target.value)} rows={2} placeholder="一行一個"
                  className="w-full rounded-md border border-hairline bg-canvas p-2 text-body-sm focus:border-ink focus:outline-none" />
      </Field>
      <Field label="備註">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full rounded-md border border-hairline bg-canvas p-2 text-body-sm focus:border-ink focus:outline-none" />
      </Field>
    </AddItemDialogShell>
  );
}
