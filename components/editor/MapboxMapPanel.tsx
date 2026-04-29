"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin } from "lucide-react";
import type { MapPanelProps } from "./map-types";
import { ROUTE_COLOR, decodePolylineToLatLng, shouldDrawPolyline } from "@/lib/polyline";

// Mapbox GL JS panel. Same shape as OsmMapPanel; differences are the style
// URL and access token. Uses mapbox/streets-v12 by default — caller can swap.

export function MapboxMapPanel({
  apiKey,
  styleUrl = "mapbox://styles/mapbox/streets-v12",
  ...rest
}: MapPanelProps & { apiKey: string; styleUrl?: string }) {
  const {
    day,
    places,
    selectedItemId,
    onSelectItem,
    onBackgroundClick,
    onMapClick,
    flyTo,
    routeVisibility = "hover",
    hoveredTransportId = null,
  } = rest;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const onSelectRef = useRef(onSelectItem);
  onSelectRef.current = onSelectItem;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = apiKey;
    const initial = points[0] ?? { lat: 35.6762, lng: 139.6503 };
    const m = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [initial.lng, initial.lat],
      zoom: 13,
    });
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    m.on("click", (e) => {
      if ((e.originalEvent.target as HTMLElement)?.closest(".mapboxgl-marker")) return;
      onBackgroundClick?.();
      const cb = onMapClickRef.current;
      if (cb && e.lngLat) cb(e.lngLat.lat, e.lngLat.lng);
    });
    mapRef.current = m;
    return () => {
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, styleUrl]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current = [];

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
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .addTo(m);
      markersRef.current.push(marker);
    }

    // ─ Phase 9c — per-Transport polylines ─
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
        if (!hasRealRoute) {
          const fp = day.items.find((i) => i.id === t.fromItemId)?.placeId
            ? places[day.items.find((i) => i.id === t.fromItemId)!.placeId!]
            : undefined;
          const tp = day.items.find((i) => i.id === t.toItemId)?.placeId
            ? places[day.items.find((i) => i.id === t.toItemId)!.placeId!]
            : undefined;
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
            ...(!hasRealRoute ? { "line-dasharray": [2, 2] } : {}),
          },
        });
      }
    };
    if (m.isStyleLoaded()) addAllRoutes();
    else m.once("load", addAllRoutes);

    if (points.length >= 2) {
      const b = new mapboxgl.LngLatBounds();
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
          · {points.filter((p) => !p.allDay).length} 站 · Mapbox
        </span>
      </div>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
