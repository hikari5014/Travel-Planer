"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

// Phase 12f — minimal portal-rendered toast. No new packages.
//
// Usage:
//   const { addToast } = useToast();
//   addToast({ kind: "error", message: "未能儲存", action: { label: "重試", onClick: ... } });

export type ToastKind = "success" | "error" | "info";
export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
  durationMs?: number; // default 4000; null/0 = sticky until dismissed
};

type ToastContextValue = {
  addToast: (t: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Soft no-op when unmounted — better than crashing on a rare error path.
    return {
      addToast: () => "",
      removeToast: () => {
        /* noop */
      },
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const removeToast = useCallback((id: string) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) {
      clearTimeout(tm);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((cur) => [...cur, { ...t, id }]);
      const dur = t.durationMs ?? 4000;
      if (dur > 0) {
        const tm = setTimeout(() => removeToast(id), dur);
        timers.current.set(id, tm);
      }
      return id;
    },
    [removeToast],
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((tm) => clearTimeout(tm));
      timers.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>,
    document.body,
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = toast.kind === "error" ? AlertTriangle : toast.kind === "success" ? CheckCircle2 : Info;
  const tone =
    toast.kind === "error"
      ? "border-error/40 bg-error/5 text-error"
      : toast.kind === "success"
        ? "border-success/40 bg-success/5 text-success"
        : "border-hairline bg-canvas text-ink";
  return (
    <div
      className={`pointer-events-auto flex items-start gap-2 rounded-md border bg-canvas px-3 py-2 shadow-soft-elevation ${tone}`}
    >
      <Icon size={14} strokeWidth={1.8} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 text-[12px]">{toast.message}</div>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          className="rounded-md px-2 py-0.5 text-[11px] font-medium hover:bg-surface-card"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md p-0.5 text-muted-soft hover:text-ink"
        aria-label="關閉"
      >
        <X size={11} />
      </button>
    </div>
  );
}
