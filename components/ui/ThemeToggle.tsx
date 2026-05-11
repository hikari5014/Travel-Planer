"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/lib/theme-context";

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, cycle } = useTheme();
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  const label = mode === "light" ? "淺色" : mode === "dark" ? "深色" : "系統";
  return (
    <button
      type="button"
      onClick={cycle}
      title={`目前：${label} — 點擊切換`}
      aria-label="切換主題"
      className={
        "inline-flex h-9 w-9 items-center justify-center rounded-md border border-hairline bg-canvas text-muted hover:border-ink hover:text-ink " +
        (className ?? "")
      }
    >
      <Icon size={14} strokeWidth={1.8} />
    </button>
  );
}
