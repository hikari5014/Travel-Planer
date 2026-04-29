"use client";

import { useTransition } from "react";
import { Map as MapIcon, Layers, Compass } from "lucide-react";
import type { MapProvider } from "@/lib/services/settings-service";

// 3-way provider toggle. Submits a Server Action on click without needing a
// form button — the choice IS the action. Each option shows whether its key
// is configured so the user understands fallback behavior.

export function MapProviderPicker({
  current,
  hasGoogleKey,
  hasMapboxKey,
  setMapProviderAction,
}: {
  current: MapProvider;
  hasGoogleKey: boolean;
  hasMapboxKey: boolean;
  setMapProviderAction: (formData: FormData) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  function pick(provider: MapProvider) {
    if (provider === current) return;
    const fd = new FormData();
    fd.append("mapProvider", provider);
    startTransition(() => setMapProviderAction(fd));
  }

  const options: {
    id: MapProvider;
    title: string;
    sub: string;
    icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
    requiresKey: boolean;
    keyConfigured: boolean;
    accent: string;
    accentSoft: string;
  }[] = [
    {
      id: "osm",
      title: "OpenStreetMap",
      sub: "免費 / 不用 key / 無流量限制",
      icon: Layers,
      requiresKey: false,
      keyConfigured: true,
      accent: "border-badge-emerald bg-badge-emerald/5",
      accentSoft: "text-badge-emerald",
    },
    {
      id: "mapbox",
      title: "Mapbox",
      sub: "50k 載圖/月免費 · 不用綁卡",
      icon: Compass,
      requiresKey: true,
      keyConfigured: hasMapboxKey,
      accent: "border-badge-violet bg-badge-violet/5",
      accentSoft: "text-badge-violet",
    },
    {
      id: "google",
      title: "Google Maps",
      sub: "$200/月 credit · 亞洲覆蓋最強",
      icon: MapIcon,
      requiresKey: true,
      keyConfigured: hasGoogleKey,
      accent: "border-brand-accent bg-brand-accent/5",
      accentSoft: "text-brand-accent",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {options.map((opt) => {
        const isCurrent = opt.id === current;
        const disabled = opt.requiresKey && !opt.keyConfigured;
        return (
          <button
            key={opt.id}
            onClick={() => !disabled && pick(opt.id)}
            disabled={disabled || isPending}
            className={`flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors ${
              isCurrent
                ? `${opt.accent} ring-1 ring-ink/20`
                : disabled
                  ? "border-hairline-soft bg-surface-soft opacity-50"
                  : "border-hairline bg-canvas hover:border-ink"
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <opt.icon size={16} strokeWidth={1.8} />
              {isCurrent && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${opt.accentSoft}`}>
                  使用中
                </span>
              )}
              {!isCurrent && opt.requiresKey && !opt.keyConfigured && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning">
                  缺 Key
                </span>
              )}
              {!isCurrent && opt.requiresKey && opt.keyConfigured && (
                <span className="rounded-full bg-surface-card px-2 py-0.5 text-[10px] text-muted">
                  Key 已存
                </span>
              )}
            </div>
            <p className="text-title-sm text-ink">{opt.title}</p>
            <p className="text-[11px] leading-tight text-muted">{opt.sub}</p>
          </button>
        );
      })}
    </div>
  );
}
