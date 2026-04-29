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
import { ROUTE_COLOR, decodePolylineToLatLng, shouldDrawPolyline } from "@/lib/polyline";

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
  onMapClick,
  flyTo,
  routeVisibility = "hover",
  hoveredTransportId = null,
  onPolylineHover,
  onPolylineClick,
}: {
  apiKey: string;
  mapId?: string | null;
  day: MockDay;
  places: Record<string, EditorPlace>;
  selectedItemId?: string;
  onSelectItem: (id: string) => void;
  onBackgroundClick?: () => void;
  // 3rd arg is a Google placeId when the user clicked a labeled POI on the
  // map; otherwise undefined and we'll do a nearby search using lat/lng.
  onMapClick?: (lat: number, lng: number, placeId?: string) => void;
  flyTo?: { lat: number; lng: number; ts: number } | null;
  routeVisibility?: "always" | "hover" | "hidden";
  hoveredTransportId?: string | null;
  onPolylineHover?: (transportId: string | null, x?: number, y?: number) => void;
  onPolylineClick?: (transportId: string) => void;
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
          streetViewControl={false}
          onClick={(e) => {
            // vis.gl's MapEvent exposes:
            //   detail.latLng    → click coords
            //   detail.placeId   → set when user clicked a labeled POI
            // Stop the default Google InfoWindow on POI clicks (we open our
            // own popup instead).
            const ll = e.detail?.latLng;
            const pid = e.detail?.placeId ?? undefined;
            if (pid) e.stop?.();
            if (ll && onMapClick) onMapClick(ll.lat, ll.lng, pid);
          }}
        >
          <TransportPolylines
            day={day}
            places={places}
            routeVisibility={routeVisibility}
            hoveredTransportId={hoveredTransportId}
            onPolylineHover={onPolylineHover}
            onPolylineClick={onPolylineClick}
          />

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
          <FlyTo target={flyTo ?? null} />
          <ControlsLayout />
        </Map>
      </APIProvider>
    </div>
  );
}

// Phase 9c — render one google.maps.Polyline per Transport segment using
// the cached encoded polyline (real route from Google Routes API). Falls
// back to a dashed straight line when no route is cached yet.
function TransportPolylines({
  day,
  places,
  routeVisibility,
  hoveredTransportId,
  onPolylineHover,
  onPolylineClick,
}: {
  day: MockDay;
  places: Record<string, EditorPlace>;
  routeVisibility: "always" | "hover" | "hidden";
  hoveredTransportId: string | null;
  onPolylineHover?: (transportId: string | null, x?: number, y?: number) => void;
  onPolylineClick?: (transportId: string) => void;
}) {
  const map = useMap();
  const polysRef = useRef<google.maps.Polyline[]>([]);
  const listenersRef = useRef<google.maps.MapsEventListener[]>([]);
  // Refs so we can wire fresh callbacks without re-creating polylines.
  const onHoverRef = useRef(onPolylineHover);
  onHoverRef.current = onPolylineHover;
  const onClickRef = useRef(onPolylineClick);
  onClickRef.current = onPolylineClick;

  useEffect(() => {
    if (!map) return;
    // Wipe previous polylines + listeners
    for (const lis of listenersRef.current) lis.remove();
    listenersRef.current = [];
    for (const p of polysRef.current) p.setMap(null);
    polysRef.current = [];

    for (const t of day.transports) {
      const hovered = hoveredTransportId === t.id;
      if (!shouldDrawPolyline(routeVisibility, hovered)) continue;

      let path: { lat: number; lng: number }[] = [];
      let hasRealRoute = false;
      if (t.encodedPolyline) {
        path = decodePolylineToLatLng(t.encodedPolyline);
        hasRealRoute = path.length >= 2;
      }
      if (!hasRealRoute) {
        const fp = day.items.find((i) => i.id === t.fromItemId)?.placeId
          ? places[day.items.find((i) => i.id === t.fromItemId)!.placeId!]
          : undefined;
        const tp = day.items.find((i) => i.id === t.toItemId)?.placeId
          ? places[day.items.find((i) => i.id === t.toItemId)!.placeId!]
          : undefined;
        if (fp?.lat != null && fp.lng != null && tp?.lat != null && tp.lng != null) {
          path = [
            { lat: fp.lat, lng: fp.lng },
            { lat: tp.lat, lng: tp.lng },
          ];
        }
      }
      if (path.length < 2) continue;

      const color = ROUTE_COLOR[t.mode] ?? ROUTE_COLOR.CUSTOM;
      const poly = new google.maps.Polyline({
        path,
        geodesic: false,
        strokeColor: color,
        strokeOpacity: hasRealRoute ? (hovered ? 1 : 0.85) : 0,
        strokeWeight: hovered ? 6 : 4,
        // Dashed icons when we don't have a real route yet (Haversine fallback)
        ...(hasRealRoute
          ? {}
          : {
              strokeOpacity: 0,
              icons: [
                {
                  icon: {
                    path: "M 0,-1 0,1",
                    strokeOpacity: 1,
                    scale: hovered ? 4 : 3,
                    strokeColor: color,
                  },
                  offset: "0",
                  repeat: "10px",
                },
              ],
            }),
        map,
      });
      polysRef.current.push(poly);
      // Phase 9.6 — hover/click bubbling
      const tid = t.id;
      if (tid) {
        const moveLis = poly.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
          const ev = (e.domEvent as MouseEvent | undefined);
          onHoverRef.current?.(tid, ev?.clientX, ev?.clientY);
        });
        const outLis = poly.addListener("mouseout", () => {
          onHoverRef.current?.(null);
        });
        const clickLis = poly.addListener("click", () => {
          onClickRef.current?.(tid);
        });
        listenersRef.current.push(moveLis, outLis, clickLis);
      }
    }
    return () => {
      for (const lis of listenersRef.current) lis.remove();
      listenersRef.current = [];
      for (const p of polysRef.current) p.setMap(null);
      polysRef.current = [];
    };
  }, [map, day.transports, day.items, places, routeVisibility, hoveredTransportId]);

  return null;
}

// Position Google's built-in controls so they don't fight with our overlays:
//  · 地圖/衛星檢視 toggle → bottom-left (user's request)
//  · zoom (+/−) → bottom-right
//  · fullscreen → top-right
// Has to run inside the map (useMap) because google.maps.ControlPosition
// constants are only available once the JS SDK has loaded.
function ControlsLayout() {
  const map = useMap();
  useEffect(() => {
    if (!map || !window.google?.maps?.ControlPosition) return;
    const CP = window.google.maps.ControlPosition;
    map.setOptions({
      mapTypeControl: true,
      mapTypeControlOptions: {
        position: CP.LEFT_BOTTOM,
        style: window.google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
      },
      zoomControl: true,
      zoomControlOptions: { position: CP.RIGHT_BOTTOM },
      fullscreenControl: true,
      fullscreenControlOptions: { position: CP.TOP_RIGHT },
      streetViewControl: false,
    });
  }, [map]);
  return null;
}

// Programmatic pan (double-click on list/week item).
function FlyTo({ target }: { target: { lat: number; lng: number; ts: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !target) return;
    map.panTo({ lat: target.lat, lng: target.lng });
    map.setZoom(16);
  }, [map, target]);
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
