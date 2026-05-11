"use client";

import { useState, useTransition } from "react";
import { AddItemDialogShell, Field } from "./dialog-shell";
import { addStopAction, updateStopAction } from "@/app/(actions)/add-item-actions";
import { useToast } from "@/components/ui/Toast";

export type StopDialogInitial = {
  purpose?: string;
  name?: string;
  startTime?: string;
  durationMin?: number;
  notes?: string;
};

export function AddStopDialog({
  tripId, defaultDate, onClose, editing,
}: {
  tripId: string;
  defaultDate: string;
  onClose: () => void;
  editing?: { itemId: string; initial: StopDialogInitial };
}) {
  const { addToast } = useToast();
  const [submitting, startSubmit] = useTransition();
  const init = editing?.initial;
  const [purpose, setPurpose] = useState(init?.purpose ?? "換乘");
  const [name, setName] = useState(init?.name ?? "");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(init?.startTime ?? "12:00");
  const [duration, setDuration] = useState(init?.durationMin ?? 30);
  const [notes, setNotes] = useState(init?.notes ?? "");

  function submit() {
    startSubmit(async () => {
      const payload = {
        tripId, date,
        title: name.trim() || purpose,
        startTime, durationMin: duration,
        purpose: purpose.trim() || null,
        notes: notes.trim() || null,
      };
      const r = editing
        ? await updateStopAction(editing.itemId, payload)
        : await addStopAction(payload);
      if (r.ok) {
        addToast({ kind: "success", message: editing ? "已儲存變更" : "已新增中繼" });
        onClose();
      } else addToast({ kind: "error", message: r.error });
    });
  }

  return (
    <AddItemDialogShell
      title={editing ? "🚉 編輯中繼站" : "🚉 新增中繼站"}
      submitLabel={editing ? "儲存變更" : "新增"}
      submitting={submitting}
      canSubmit={name.trim().length > 0 || purpose.trim().length > 0}
      onSubmit={submit} onClose={onClose}
    >
      <Field label="用途">
        <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="換乘 / 寄物 / 等待"
               className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
      </Field>
      <Field label="名稱（選填）">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="台北車站 北一門"
               className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="日期">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="時間">
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none" />
        </Field>
        <Field label="停留（分）">
          <input type="number" min="0" value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)}
                 className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none" />
        </Field>
      </div>
      <Field label="備註">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full rounded-md border border-hairline bg-canvas p-2 text-body-sm focus:border-ink focus:outline-none" />
      </Field>
    </AddItemDialogShell>
  );
}
