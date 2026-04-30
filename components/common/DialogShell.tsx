"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Phase 10f — viewport-aware modal shell.
//
// Universal layout pattern for full-screen-overlay dialogs:
//  · Backdrop: fixed inset, click-to-close, semi-transparent
//  · Card: max-w + max-h clamp to viewport (so it never escapes)
//  · Sticky header (always visible) + scrollable body + sticky footer
//
// Replaces ad-hoc Portal patterns scattered through Phase 6-9 dialogs.
// Existing dialogs (TransportEditDialog / ParkingPicker / MapClickAddPopup
// / PlaceSearchDialog / ShareDialog) are migrated to this in Tier 1 of
// Phase 10f so the "popup runs off the bottom" bug never recurs.

export type DialogShellProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Header right slot (e.g. status pill). The X button is added automatically. */
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  /** Tailwind class for max width. Defaults to max-w-lg. */
  maxWidth?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** When true, clicking the backdrop dismisses. Default true. */
  dismissOnBackdrop?: boolean;
  /** When true, ESC dismisses. Default true. */
  dismissOnEscape?: boolean;
  /** z-index override (defaults to z-[80]) — higher dialogs above floating cards. */
  zIndex?: number;
};

export function DialogShell({
  title,
  subtitle,
  headerExtra,
  footer,
  maxWidth = "max-w-lg",
  onClose,
  children,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  zIndex = 80,
}: DialogShellProps) {
  useEffect(() => {
    if (!dismissOnEscape) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, dismissOnEscape]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      onClick={dismissOnBackdrop ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
      style={{ zIndex }}
      className="fixed inset-0 flex items-start justify-center bg-ink/40 backdrop-blur-sm overflow-y-auto py-[min(8vh,4rem)] px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full ${maxWidth} flex-col overflow-hidden rounded-lg border border-hairline bg-canvas shadow-pop`}
        style={{ maxHeight: "calc(100vh - min(16vh, 8rem))" }}
      >
        {/* Sticky header */}
        <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-hairline-soft px-4 py-3">
          <div className="min-w-0 flex-1">
            {typeof title === "string" ? (
              <h2 className="text-title-md text-ink">{title}</h2>
            ) : (
              title
            )}
            {subtitle && (
              <div className="mt-1 text-caption text-muted">
                {subtitle}
              </div>
            )}
          </div>
          {headerExtra}
          <button
            onClick={onClose}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-card hover:text-ink"
            aria-label="關閉"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {/* Optional sticky footer */}
        {footer && (
          <div className="flex-shrink-0 border-t border-hairline-soft bg-surface-soft px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
