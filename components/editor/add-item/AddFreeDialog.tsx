"use client";

import { useState, useTransition } from "react";
import { AddItemDialogShell, Field } from "./dialog-shell";
import { addFreeAction } from "@/app/(actions)/add-item-actions";
import { useToast } from "@/components/ui/Toast";
import { useCurrencyContext } from "@/lib/currency-context";
import { currencyMeta, type CurrencyCode } from "@/lib/currency";

export function AddFreeDialog({
  tripId, defaultDate, onClose,
}: { tripId: string; defaultDate: string; onClose: () => void }) {
  const ctx = useCurrencyContext();
  const baseCurrency = ctx?.primary ?? "TWD";
  const { addToast } = useToast();
  const [submitting, startSubmit] = useTransition();

  const [title, setTitle] = useState("自由活動");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("14:00");
  const [duration, setDuration] = useState(120);
  const [budget, setBudget] = useState("");
  const [ticketCurrency, setTicketCurrency] = useState<CurrencyCode>(baseCurrency);
  const [locationName, setLocationName] = useState("");
  const [notes, setNotes] = useState("");

  function submit() {
    startSubmit(async () => {
      const r = await addFreeAction({
        tripId, date, title: title.trim(),
        startTime, durationMin: duration,
        budget: budget ? Number(budget) : null,
        ticketCurrency,
        place: locationName.trim() ? { name: locationName.trim() } : null,
        notes: notes.trim() || null,
      });
      if (r.ok) { addToast({ kind: "success", message: "已新增自由時間" }); onClose(); }
      else addToast({ kind: "error", message: r.error });
    });
  }

  const codes = Object.keys(currencyMeta) as CurrencyCode[];

  return (
    <AddItemDialogShell title="☕ 新增自由時間" submitLabel="新增" submitting={submitting}
      canSubmit={title.trim().length > 0} onSubmit={submit} onClose={onClose}
    >
      <Field label="標題 / 描述 *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="購物時間 / 散步 / 休息"
               className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="日期">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="開始">
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="持續（分）">
          <input type="number" min="0" value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      </div>
      <Field label="地點（選填）">
        <input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="心齋橋商店街"
               className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
      </Field>
      <Field label="預算">
        <div className="flex gap-1.5">
          <input type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)}
                 className="h-9 flex-1 rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
          <select value={ticketCurrency} onChange={(e) => setTicketCurrency(e.target.value as CurrencyCode)}
                  className="h-9 w-20 rounded-md border border-hairline bg-canvas px-1 font-mono text-[11px] focus:border-ink focus:outline-none">
            {codes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </Field>
      <Field label="備註">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full rounded-md border border-hairline bg-canvas p-2 text-body-sm focus:border-ink focus:outline-none" />
      </Field>
    </AddItemDialogShell>
  );
}
