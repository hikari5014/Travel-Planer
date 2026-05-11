"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";

// Phase 14c — common shell for the 7 add-item dialogs. Header + scrollable
// body + footer with Cancel / Submit. Closes on Esc + click outside.

export function AddItemDialogShell({
  title,
  subtitle,
  submitLabel,
  submitting,
  canSubmit,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  submitLabel: string;
  submitting?: boolean;
  canSubmit?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const focusable = root.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    focusable?.focus();
  }, []);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-[min(8vh,4rem)] backdrop-blur-sm"
    >
      <div
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-hairline bg-canvas shadow-soft-elevation"
        style={{ maxHeight: "calc(100vh - min(16vh, 8rem))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline-soft px-5 py-3">
          <div className="min-w-0">
            <p className="text-caption-uppercase text-muted-soft">Add Item</p>
            <h2 className="truncate text-title-md text-ink">{title}</h2>
            {subtitle && <p className="text-caption text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!submitting && (canSubmit ?? true)) onSubmit();
          }}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto p-5">{children}</div>
          <div className="flex items-center justify-end gap-2 border-t border-hairline-soft bg-surface-soft px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-md px-4 text-button text-muted hover:text-ink"
            >
              ✕ 取消
            </button>
            <button
              type="submit"
              disabled={submitting || canSubmit === false}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-button text-on-primary hover:bg-primary-active disabled:opacity-60"
            >
              {submitting && <Loader2 size={12} className="animate-spin" />}
              ✓ {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Common labelled field wrapper.
export function Field({
  label,
  hint,
  children,
  span,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  span?: 1 | 2;
}) {
  return (
    <label className={`block ${span === 2 ? "col-span-2" : ""}`}>
      <span className="mb-0.5 block text-caption text-muted">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[10px] text-muted-soft">{hint}</span>}
    </label>
  );
}
