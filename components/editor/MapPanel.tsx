"use client";

import { Plus, Minus, Crosshair, Layers, MapPin } from "lucide-react";
import { getPlace, type MockDay, type MockScheduleItem } from "@/lib/mock-schedule";
import { placeIconRegistry } from "@/lib/place-icon";

// Stylized SVG map for Phase 0a demo. Replaced with @vis.gl/react-google-maps in Phase 1a.
// `onBackgroundClick` fires when the user clicks empty map area (used to close overlays).
export function MapPanel({
  day,
  selectedItemId,
  onSelectItem,
  onBackgroundClick,
}: {
  day: MockDay;
  selectedItemId?: string;
  onSelectItem: (id: string) => void;
  onBackgroundClick?: () => void;
}) {
  const timedItems = day.items.filter((i) => !i.isAllDay && i.placeId);
  const allDayItems = day.items.filter((i) => i.isAllDay && i.placeId);

  const points = timedItems
    .map((it) => {
      const p = getPlace(it.placeId);
      return p ? { x: p.mapX, y: p.mapY, item: it } : null;
    })
    .filter((p): p is { x: number; y: number; item: MockScheduleItem } => p !== null);

  const polylinePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div
      className="relative h-full overflow-hidden rounded-lg border border-hairline bg-canvas"
      onClick={(e) => {
        if (e.target === e.currentTarget) onBackgroundClick?.();
      }}
    >
      {/* Map header */}
      <div className="absolute left-3 right-3 top-3 z-20 flex items-center justify-between rounded-md bg-canvas/90 px-sm py-1.5 backdrop-blur shadow-soft-elevation">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-caption-uppercase text-muted">
            <MapPin size={11} strokeWidth={2} />
            DAY {day.dayIndex} 路線
          </span>
          <span className="text-caption text-muted-soft">京都市東山區 / 伏見區</span>
        </div>
        <div className="flex items-center gap-px">
          <MapBtn title="放大"><Plus size={12} strokeWidth={2} /></MapBtn>
          <MapBtn title="縮小"><Minus size={12} strokeWidth={2} /></MapBtn>
          <MapBtn title="定位"><Crosshair size={12} strokeWidth={2} /></MapBtn>
          <MapBtn title="圖層"><Layers size={12} strokeWidth={2} /></MapBtn>
        </div>
      </div>

      {/* Map canvas — listening for background click via wrapper above */}
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        onClick={(e) => {
          // Same logic — clicking the SVG background closes overlays.
          if (e.target === e.currentTarget) onBackgroundClick?.();
        }}
      >
        <rect width="1000" height="1000" fill="#f8f9fa" />

        <defs>
          <pattern id="paper" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#f8f9fa" />
            <circle cx="2" cy="2" r="0.4" fill="#e5e7eb" />
            <circle cx="5" cy="5" r="0.3" fill="#f3f4f6" />
          </pattern>
        </defs>

        <rect width="1000" height="1000" fill="url(#paper)" />

        {/* River */}
        <path
          d="M 380 0 Q 420 200 410 400 T 430 700 Q 450 850 470 1000"
          stroke="#dbeafe"
          strokeWidth="36"
          fill="none"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M 380 0 Q 420 200 410 400 T 430 700 Q 450 850 470 1000"
          stroke="#93c5fd"
          strokeWidth="1.5"
          fill="none"
        />

        {/* Hills */}
        <path
          d="M 700 200 Q 800 250 850 400 Q 900 550 850 720 Q 780 880 700 1000 L 1000 1000 L 1000 0 L 700 0 Z"
          fill="#f3f4f6"
          opacity="0.9"
        />

        {/* Roads */}
        <g stroke="#e5e7eb" strokeWidth="3" fill="none">
          <path d="M 0 200 L 700 200" />
          <path d="M 0 350 L 850 350" />
          <path d="M 0 500 L 870 500" />
          <path d="M 0 650 L 870 650" />
          <path d="M 0 800 L 870 800" />
          <path d="M 200 0 L 200 1000" />
          <path d="M 350 0 L 350 1000" />
          <path d="M 500 0 L 500 1000" />
          <path d="M 650 0 L 650 1000" />
          <path d="M 800 0 L 800 1000" />
        </g>

        <g stroke="#d1d5db" strokeWidth="6" fill="none" strokeLinecap="round">
          <path d="M 0 720 L 1000 720" />
          <path d="M 470 0 L 470 1000" />
        </g>

        <g fill="#9ca3af" fontSize="14" fontFamily="Inter, sans-serif">
          <text x="190" y="110">下京區</text>
          <text x="780" y="270">東山區</text>
          <text x="600" y="850">伏見區</text>
          <text x="60" y="600">中京區</text>
        </g>

        {/* All-day place markers (lodging — square chip) */}
        {allDayItems.map((item) => {
          const p = getPlace(item.placeId);
          if (!p) return null;
          return (
            <g
              key={item.id}
              transform={`translate(${p.mapX} ${p.mapY})`}
              onClick={() => onSelectItem(item.id)}
              className="cursor-pointer"
            >
              <rect x="-16" y="-16" width="32" height="32" rx="6" fill="#34d399" stroke="#111111" strokeWidth="1" />
              <foreignObject x="-12" y="-12" width="24" height="24">
                <div className="flex h-full w-full items-center justify-center text-white">
                  {renderLucide(p.iconKey, 16)}
                </div>
              </foreignObject>
            </g>
          );
        })}

        {/* Polyline through timed items — brand-accent blue */}
        {polylinePath && (
          <>
            <path d={polylinePath} stroke="#3b82f6" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.12" />
            <path d={polylinePath} stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95" />
          </>
        )}

        {/* Timed item markers — pin with icon + numbered badge */}
        {points.map((pt, idx) => {
          const isSelected = pt.item.id === selectedItemId;
          const place = getPlace(pt.item.placeId)!;
          return (
            <g
              key={pt.item.id}
              transform={`translate(${pt.x} ${pt.y})`}
              onClick={() => onSelectItem(pt.item.id)}
              className="cursor-pointer"
            >
              <ellipse cx="0" cy="38" rx="14" ry="3" fill="#111111" opacity="0.18" />
              <path
                d="M 0 -36 C -16 -36 -22 -22 -22 -10 C -22 8 0 30 0 30 C 0 30 22 8 22 -10 C 22 -22 16 -36 0 -36 Z"
                fill={isSelected ? "#111111" : "#1f2937"}
                stroke={isSelected ? "#3b82f6" : "#111111"}
                strokeWidth={isSelected ? "2.5" : "1"}
              />
              <circle cx="0" cy="-13" r="11" fill="#ffffff" />
              <foreignObject x="-9" y="-22" width="18" height="18">
                <div className="flex h-full w-full items-center justify-center text-ink">
                  {renderLucide(place.iconKey, 13)}
                </div>
              </foreignObject>
              {/* Numbered badge */}
              <circle cx="14" cy="-30" r="9" fill="#3b82f6" />
              <text
                x="14"
                y="-26"
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill="#ffffff"
                fontFamily="Inter, sans-serif"
              >
                {idx + 1}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Map footer — legend */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between rounded-md bg-canvas/90 px-sm py-1.5 text-caption backdrop-blur shadow-soft-elevation">
        <div className="flex items-center gap-3 text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-brand-accent" /> 排程順序
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-badge-emerald" /> 住宿
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full border border-warning" /> 停車場
          </span>
        </div>
        <span className="text-muted-soft">示意 · Phase 1 接 Google Maps</span>
      </div>

    </div>
  );
}

// Map iconKey → inline lucide-react icon for use inside SVG <foreignObject>.
// We import dynamically per icon to keep this self-contained.
function renderLucide(iconKey: string, size: number) {
  const entry = (placeIconRegistry as Record<string, { icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }>)[iconKey];
  if (!entry) return null;
  const Icon = entry.icon;
  return <Icon size={size} strokeWidth={2} />;
}

function MapBtn({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <button
      title={title}
      className="flex h-6 w-6 items-center justify-center rounded text-ink hover:bg-surface-card"
    >
      {children}
    </button>
  );
}

