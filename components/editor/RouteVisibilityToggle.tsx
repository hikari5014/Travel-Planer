"use client";

import { Eye, EyeOff, MousePointerClick } from "lucide-react";
import type { RouteVisibility } from "@/lib/polyline";

// 3-way segmented toggle pinned to the map. Lets the user choose how route
// polylines (the lines showing real Google Directions routes between
// schedule items) are drawn:
//   · always — every segment all the time
//   · hover  — only when the cursor is over its list/week row (default)
//   · hidden — never
//
// Mounted in EditorShell beneath the search overlay so it doesn't fight
// the Google built-in controls (now at top-right / bottom-right).

export function RouteVisibilityToggle({
  value,
  onChange,
}: {
  value: RouteVisibility;
  onChange: (v: RouteVisibility) => void;
}) {
  const options: { id: RouteVisibility; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; title: string }[] = [
    { id: "always", label: "全部", icon: Eye, title: "始終顯示所有路線" },
    { id: "hover", label: "懸停", icon: MousePointerClick, title: "滑鼠懸停在列表項目時才顯示" },
    { id: "hidden", label: "關閉", icon: EyeOff, title: "完全不顯示路線" },
  ];

  return (
    <div className="flex items-center gap-px rounded-full bg-canvas/95 p-0.5 shadow-soft-elevation backdrop-blur">
      {options.map((opt) => {
        const isActive = opt.id === value;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            title={opt.title}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
              isActive
                ? "bg-ink text-on-primary"
                : "text-muted hover:text-ink"
            }`}
          >
            <opt.icon size={11} strokeWidth={2} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
