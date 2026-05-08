"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "@/lib/theme-context";

const OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  desc: string;
  Icon: typeof Sun;
}> = [
  { value: "light", label: "淺色", desc: "永遠使用淺色介面", Icon: Sun },
  { value: "dark", label: "深色", desc: "永遠使用深色介面", Icon: Moon },
  { value: "system", label: "跟隨系統", desc: "依作業系統偏好自動切換", Icon: Monitor },
];

export function ThemePicker() {
  const { mode, setMode } = useTheme();
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {OPTIONS.map(({ value, label, desc, Icon }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
              active
                ? "border-ink bg-surface-soft"
                : "border-hairline bg-canvas hover:border-ink"
            }`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-card text-ink">
              <Icon size={14} strokeWidth={1.8} />
            </span>
            <div>
              <p className="text-body-sm font-medium text-ink">{label}</p>
              <p className="text-[11px] text-muted-soft">{desc}</p>
            </div>
            {active && (
              <span className="rounded-pill bg-primary px-2 py-0.5 text-[10px] text-on-primary">
                目前
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
