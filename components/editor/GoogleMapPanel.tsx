"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Marker,
  useMap,
} from "@vis.gl/react-google-maps";
import { MapPin } from "lucide-react";
import type { MockDay } from "@/lib/mock-schedule";
import type { EditorPlace } from "@/lib/services/editor-loader";
import { PlaceIconBare } from "@/lib/place-icon";

// Google-Maps-backed map panel. Two render paths:
//
//  · WITH `mapId` (Cloud-Console-generated): uses AdvancedMarker so we get
//    rich custom HTML pins (numbered + per-place icon).
//  · WITHOUT `mapId`: uses legacy Marker (default Google pin + label) so the
//    map still renders. AdvancedMarker requires a real Map ID — passing a
//    fake string makes the entire map fail with "this page didn't load
//    Google Maps correctly".
export function GoogleMapPanel({
  apiKey,
  mapId,
  day,
  places,
  selectedItemId,
  onSelectItem,
  onBackgroundClick,
}: {
  apiKey: string;
  mapId?: string | null;
  day: MockDay;
  places: Record<string, EditorPlace>;
  selectedItemId?: string;
  onSelectItem: (id: string) => void;
  onBackgroundClick?: () => void;
}) {
  const points = useMemo(() => {
    return day.items
      .filter((i) => !i.isAllDay && i.placeId)
      .map((it) => {
        const p = it.placeId ? places[it.placeId] : undefined;
        if (!p || p.lat == null || p.lng == null) return null;
        return { item: it, place: p, lat: p.lat, lng: p.lng };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }, [day, places]);

  const allDayPoints = useMemo(() => {
    return day.items
      .filter((i) => i.isAllDay && i.placeId)
      .map((it) => {
        const p = it.placeId ? places[it.placeId] : undefined;
        if (!p || p.lat == null || p.lng == null) return null;
        return { item: it, place: p, lat: p.lat, lng: p.lng };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }, [day, places]);

  // Fallback center: average lat/lng if available, else Tokyo
  const center = useMemo(() => {
    const all = [...points, ...allDayPoints];
    if (all.length === 0) return { lat: 35.6762, lng: 139.6503 };
    const lat = all.reduce((s, p) => s + p.lat, 0) / all.length;
    const lng = all.reduce((s, p) => s + p.lng, 0) / all.length;
    return { lat, lng };
  }, [points, allDayPoints]);

  const useAdvanced = !!mapId;

  return (
    <div
      className="relative h-full overflow-hidden rounded-lg border border-hairline bg-canvas"
      onClick={(e) => {
        if (e.target === e.currentTarget) onBackgroundClick?.();
      }}
    >
      <div className="pointer-events-none absolute left-1/2 top-3 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-pill bg-canvas/90 px-3 py-1.5 backdrop-blur shadow-soft-elevation">
        <span className="flex items-center gap-1 text-caption-uppercase text-muted">
          <MapPin size={11} strokeWidth={2} />
          DAY {day.dayIndex}
        </span>
        <span className="text-caption text-muted-soft">
          · {points.length} 站 · Google Maps
        </span>
      </div>

      <APIProvider apiKey={apiKey}>
        <Map
          {...(mapId ? { mapId } : {})}
          defaultCenter={center}
          defaultZoom={13}
          gestureHandling="greedy"
          disableDefaultUI={false}
          className="h-full w-full"
        >
          <Polyline points={points.map((p) => ({ lat: p.lat, lng: p.lng }))} />

          {points.map((pt, idx) =>
            useAdvanced ? (
              <AdvancedMarker
                key={pt.item.id}
                position={{ lat: pt.lat, lng: pt.lng }}
                onClick={() => onSelectItem(pt.item.id)}
              >
                <div
                  className={`flex flex-col items-center ${pt.item.id === selectedItemId ? "scale-110" : ""}`}
                  style={{ transform: "translate(-50%, -100%)" }}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-canvas shadow-soft-elevation ${
                      pt.item.id === selectedItemId ? "border-brand-accent" : "border-ink"
                    }`}
                  >
                    <PlaceIconBare iconKey={pt.place.iconKey} size={14} />
                  </div>
                  <div className="mt-1 rounded-full bg-brand-accent px-1.5 text-[10px] font-semibold text-white">
                    {idx + 1}
                  </div>
                </div>
              </AdvancedMarker>
            ) : (
              <Marker
                key={pt.item.id}
                position={{ lat: pt.lat, lng: pt.lng }}
                label={{
                  text: String(idx + 1),
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: "600",
                }}
                onClick={() => onSelectItem(pt.item.id)}
              />
            ),
          )}

          {allDayPoints.map((pt) =>
            useAdvanced ? (
              <AdvancedMarker
                key={pt.item.id}
                position={{ lat: pt.lat, lng: pt.lng }}
                onClick={() => onSelectItem(pt.item.id)}
              >
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-ink bg-badge-emerald text-white"
                  style={{ transform: "translate(-50%, -50%)" }}
                >
                  <PlaceIconBare iconKey={pt.place.iconKey} size={12} />
                </div>
              </AdvancedMarker>
            ) : (
              <Marker
                key={pt.item.id}
                position={{ lat: pt.lat, lng: pt.lng }}
                onClick={() => onSelectItem(pt.item.id)}
              />
            ),
          )}

          <FitBounds points={[...points, ...allDayPoints].map((p) => ({ lat: p.lat, lng: p.lng }))} />
        </Map>
      </APIProvider>
    </div>
  );
}

// Polyline rendered via google.maps.Polyline since vis.gl doesn't ship one.
function Polyline({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  const polyRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;
    if (points.length < 2) {
      polyRef.current?.setMap(null);
      return;
    }
    polyRef.current?.setMap(null);
    const poly = new google.maps.Polyline({
      path: points,
      geodesic: false,
      strokeColor: "#3b82f6",
      strokeOpacity: 0.95,
      strokeWeight: 4,
      map,
    });
    polyRef.current = poly;
    return () => {
      poly.setMap(null);
    };
  }, [map, points]);

  return null;
}

// Auto-fit on first paint when there are >=2 points.
function FitBounds({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!map || fitted.current || points.length < 2) return;
    const b = new google.maps.LatLngBounds();
    points.forEach((p) => b.extend(p));
    map.fitBounds(b, 80);
    fitted.current = true;
  }, [map, points]);
  return null;
}
