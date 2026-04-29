"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin } from "lucide-react";
import type { MapPanelProps } from "./map-types";
import { ROUTE_COLOR, decodePolylineToLatLng, shouldDrawPolyline } from "@/lib/polyline";

// MapLibre GL + OpenStreetMap raster tiles. Zero cost, no API key required.
// Uses OSM tile.openstreetmap.org directly with the official attribution.
// (For production with high traffic you would self-host tiles or use MapTiler.)

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export function OsmMapPanel({
  day,
  places,
  selectedItemId,
  onSelectItem,
  onBackgroundClick,
  onMapClick,
  flyTo,
  routeVisibility = "hover",
  hoveredTransportId = null,
}: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelectItem);
  onSelectRef.current = onSelectItem;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // Filter timed + all-day items that have lat/lng
  const points = useMemo(() => {
    const out: { id: string; lat: number; lng: number; name: string; idx: number; allDay: boolean }[] = [];
    let idx = 0;
    for (const it of day.items) {
      const p = it.placeId ? places[it.placeId] : undefined;
      if (!p || p.lat == null || p.lng == null) continue;
      const allDay = !!it.isAllDay;
      if (!allDay) idx += 1;
      out.push({ id: it.id, lat: p.lat, lng: p.lng, name: p.name, idx, allDay });
    }
    return out;
  }, [day, places]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initial = points[0] ?? { lat: 35.6762, lng: 139.6503 };
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [initial.lng, initial.lat],
      zoom: 13,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("click", (e) => {
      // Markers handle their own click (selectedItem); ignore those.
      if ((e.originalEvent.target as HTMLElement)?.closest(".maplibregl-marker")) return;
      onBackgroundClick?.();
      // Empty-map click → bubble lat/lng up so the editor can open
      // "add destination here". Map's e.lngLat is reliable.
      const cb = onMapClickRef.current;
      if (cb && e.lngLat) cb(e.lngLat.lat, e.lngLat.lng);
    });
    mapRef.current = m;
    return () => {
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render markers + polyline whenever points change
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    // Wipe old markers
    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current = [];

    // Add markers
    for (const p of points) {
      const el = document.createElement("div");
      el.className = "flex flex-col items-center cursor-pointer";
      el.style.transform = "translate(-50%, -100%)";
      const selected = p.id === selectedItemId;
      el.innerHTML = p.allDay
        ? `<div style="width:24px;height:24px;border:2px solid #111;background:#34d399;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.18);"></div>`
        : `<div style="display:flex;flex-direction:column;align-items:center;">
            <div style="width:30px;height:30px;border-radius:9999px;background:#fff;border:2px solid ${selected ? "#3b82f6" : "#111"};box-shadow:0 2px 8px rgba(0,0,0,0.18);display:flex;align-items:center;justify-content:center;font-weight:600;">${p.idx}</div>
            <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${selected ? "#3b82f6" : "#111"};margin-top:-2px;"></div>
           </div>`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onSelectRef.current(p.id);
      });
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .addTo(m);
      markersRef.current.push(marker);
    }

    // ─ Polylines ──────────────────────────────────────────────────────
    // Phase 9c — one polyline per Transport segment using the real Google
    // Directions encoded polyline when present. Falls back to a straight
    // dashed line between place coords when no Routes cache exists yet.
    // Visibility / hover state lives in EditorShell.

    // Wipe ALL existing route layers/sources before re-adding (we keyed
    // them by transport id so we know what's ours).
    const existingLayers = m.getStyle().layers ?? [];
    for (const l of existingLayers) {
      if (l.id.startsWith("route-line-")) m.removeLayer(l.id);
    }
    const existingSourceIds = Object.keys(m.getStyle().sources ?? {});
    for (const sid of existingSourceIds) {
      if (sid.startsWith("route-")) m.removeSource(sid);
    }

    const addAllRoutes = () => {
      for (const t of day.transports) {
        const hovered = hoveredTransportId === t.id;
        if (!shouldDrawPolyline(routeVisibility, hovered)) continue;

        let coords: [number, number][] = [];
        let hasRealRoute = false;
        if (t.encodedPolyline) {
          const pts = decodePolylineToLatLng(t.encodedPolyline);
          coords = pts.map((p) => [p.lng, p.lat]);
          hasRealRoute = coords.length >= 2;
        }
        // Fallback: straight line from from-item's place to to-item's place.
        if (!hasRealRoute) {
          const fromP = day.items.find((i) => i.id === t.fromItemId)?.placeId;
          const toP = day.items.find((i) => i.id === t.toItemId)?.placeId;
          const fp = fromP ? places[fromP] : undefined;
          const tp = toP ? places[toP] : undefined;
          if (fp?.lat != null && fp.lng != null && tp?.lat != null && tp.lng != null) {
            coords = [
              [fp.lng, fp.lat],
              [tp.lng, tp.lat],
            ];
          }
        }
        if (coords.length < 2) continue;

        const sid = `route-${t.id}`;
        const lid = `route-line-${t.id}`;
        if (m.getSource(sid)) m.removeSource(sid);
        m.addSource(sid, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: { id: t.id },
            geometry: { type: "LineString", coordinates: coords },
          },
        });
        const color = ROUTE_COLOR[t.mode] ?? ROUTE_COLOR.CUSTOM;
        m.addLayer({
          id: lid,
          type: "line",
          source: sid,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": color,
            "line-width": hovered ? 6 : 4,
            "line-opacity": hovered ? 1 : 0.85,
            // Dashed line when we don't have a real Routes response yet
            // (Haversine fallback or place missing lat/lng).
            ...(!hasRealRoute ? { "line-dasharray": [2, 2] } : {}),
          },
        });
      }
    };
    if (m.isStyleLoaded()) addAllRoutes();
    else m.once("load", addAllRoutes);

    // Fit bounds when ≥ 2 points
    if (points.length >= 2) {
      const b = new maplibregl.LngLatBounds();
      points.forEach((p) => b.extend([p.lng, p.lat]));
      m.fitBounds(b, { padding: 60, duration: 600 });
    } else if (points.length === 1) {
      m.flyTo({ center: [points[0].lng, points[0].lat], zoom: 14 });
    }
  }, [points, selectedItemId, day.transports, places, routeVisibility, hoveredTransportId, day.items]);

  // External flyTo (double-click on a list/week item)
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !flyTo) return;
    m.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 16, duration: 700 });
  }, [flyTo]);

  return (
    <div className="relative h-full overflow-hidden rounded-lg border border-hairline bg-canvas">
      <div className="pointer-events-none absolute left-1/2 top-3 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-pill bg-canvas/90 px-3 py-1.5 backdrop-blur shadow-soft-elevation">
        <span className="flex items-center gap-1 text-caption-uppercase text-muted">
          <MapPin size={11} strokeWidth={2} />
          DAY {day.dayIndex}
        </span>
        <span className="text-caption text-muted-soft">
          · {points.filter((p) => !p.allDay).length} 站 · OpenStreetMap
        </span>
      </div>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
