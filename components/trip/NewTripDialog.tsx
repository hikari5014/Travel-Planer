"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { createTripAction } from "@/app/(actions)/trip-actions";

const COVER_PRESETS = [
  { iconKey: "landmark",   color: "from-[#3b82f6] to-[#8b5cf6]", label: "城市" },
  { iconKey: "temple",     color: "from-[#fb923c] to-[#ef4444]", label: "寺廟古蹟" },
  { iconKey: "mountain",   color: "from-[#34d399] to-[#0ea5e9]", label: "自然山景" },
  { iconKey: "ramen",      color: "from-[#ec4899] to-[#fb923c]", label: "美食" },
  { iconKey: "park",       color: "from-[#34d399] to-[#0f766e]", label: "公園庭園" },
  { iconKey: "shopping",   color: "from-[#8b5cf6] to-[#ec4899]", label: "購物" },
];

export function NewTripDialog() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cover, setCover] = useState(COVER_PRESETS[0]);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Default dates: tomorrow + 7 days
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const weekLater = new Date(today.getTime() + 8 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Open via #new-trip URL fragment so dashboard quick action / NewTripTile work.
  useEffect(() => {
    function handleHash() {
      if (window.location.hash === "#new-trip") setOpen(true);
    }
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeDialog();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function closeDialog() {
    setOpen(false);
    setError(null);
    if (window.location.hash === "#new-trip") history.replaceState(null, "", window.location.pathname);
  }

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      formData.set("coverIconKey", cover.iconKey);
      formData.set("coverColor", cover.color);
      await createTripAction(formData);
      // createTripAction redirects on success — won't return.
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
      setPending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-button text-on-primary transition-colors hover:bg-primary-active"
      >
        <Plus size={14} strokeWidth={2.2} />
        新增旅程
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={closeDialog}
        >
          <div
            ref={dialogRef}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-lg bg-canvas shadow-pop"
          >
            <div className="flex items-center justify-between border-b border-hairline-soft px-md py-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-soft">NEW TRIP</p>
                <h2 className="text-title-md text-ink">新增旅程</h2>
              </div>
              <button
                onClick={closeDialog}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink"
                aria-label="關閉"
              >
                <X size={14} />
              </button>
            </div>

            <form action={handleSubmit} className="space-y-3 p-md">
              {error && (
                <div className="rounded-md border border-error/40 bg-error/5 px-3 py-2 text-caption text-error">
                  {error}
                </div>
              )}

              <Field label="旅程名稱">
                <input
                  name="title"
                  required
                  maxLength={80}
                  placeholder="例如：京都七日漫遊"
                  className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none"
                />
              </Field>

              <Field label="副標題（選填）">
                <input
                  name="subtitle"
                  maxLength={120}
                  placeholder="主題、節奏、同行對象…"
                  className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none"
                />
              </Field>

              <Field label="目的地">
                <input
                  name="destination"
                  maxLength={80}
                  placeholder="京都 / 大阪"
                  className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="開始日">
                  <input
                    type="date"
                    name="startDate"
                    required
                    defaultValue={fmt(tomorrow)}
                    className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none"
                  />
                </Field>
                <Field label="結束日">
                  <input
                    type="date"
                    name="endDate"
                    required
                    defaultValue={fmt(weekLater)}
                    className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm focus:border-ink focus:outline-none"
                  />
                </Field>
              </div>

              <Field label="封面樣式">
                <div className="grid grid-cols-3 gap-2">
                  {COVER_PRESETS.map((p) => (
                    <button
                      key={p.iconKey}
                      type="button"
                      onClick={() => setCover(p)}
                      className={`relative h-14 overflow-hidden rounded-md bg-gradient-to-br ${p.color} text-[11px] text-white shadow-sm ring-2 transition-all ${
                        cover.iconKey === p.iconKey ? "ring-ink" : "ring-transparent hover:ring-hairline"
                      }`}
                    >
                      <span className="absolute bottom-1 left-1.5">{p.label}</span>
                    </button>
                  ))}
                </div>
              </Field>

              <div className="flex items-center justify-end gap-2 border-t border-hairline-soft pt-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="inline-flex h-9 items-center rounded-md border border-hairline bg-canvas px-3 text-button text-ink hover:border-ink"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
                >
                  {pending ? "建立中…" : "建立並開始規劃"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
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
