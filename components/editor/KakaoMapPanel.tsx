"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, MapPin } from "lucide-react";
import type { MapPanelProps } from "./map-types";
import {
  loadKakaoSdk,
  type KakaoCustomOverlay,
  type KakaoMap,
  type KakaoMouseEvent,
  type KakaoPolyline,
} from "@/lib/kakao-sdk-loader";
import { ROUTE_COLOR, decodePolylineToLatLng, shouldDrawPolyline } from "@/lib/polyline";

// Phase P0 — Kakao Maps panel as a MapProvider option. Mirrors
// MapboxMapPanel / GoogleMapPanel feature set (numbered markers, transport
// polylines, click-to-add, flyTo) but renders via Kakao JS SDK.
//
// Kakao's strengths over Google/Mapbox in Korea:
//   - More accurate Korean POI database (small streets, recent businesses)
//   - Native Korean address rendering (지번 / 도로명)
//   - Faster tile rendering inside Korea
//
// Outside Korea the map still works but loses these advantages — that's why
// it's an explicit user choice rather than auto-detected.
//
// Limitations vs Mapbox:
//   - No public dark style; theme prop is ignored (basic map only)
//   - No native marker drag (would need DraggableMarker — out of scope)
//   - Polylines lack hover events on the same primitives; we attach mouseover
//     to each Polyline instance instead.

export function KakaoMapPanel({
  apiKey,
  ...rest
}: MapPanelProps & { apiKey: string }) {
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
    onPolylineHover,
    onPolylineClick,
  } = rest;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const polylinesRef = useRef<KakaoPolyline[]>([]);
  const polylineListenersRef = useRef<Array<{ poly: KakaoPolyline; type: string; handler: (e?: KakaoMouseEvent) => void }>>([]);
  const onSelectRef = useRef(onSelectItem);
  onSelectRef.current = onSelectItem;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onPolylineHoverRef = useRef(onPolylineHover);
  onPolylineHoverRef.current = onPolylineHover;
  const onPolylineClickRef = useRef(onPolylineClick);
  onPolylineClickRef.current = onPolylineClick;
  const onBackgroundClickRef = useRef(onBackgroundClick);
  onBackgroundClickRef.current = onBackgroundClick;

  const [sdkError, setSdkError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

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

  // ─ SDK load + map init (once per apiKey) ─
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    setSdkError(null);
    setSdkReady(false);
    loadKakaoSdk(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.kakao?.maps) return;
        const { kakao } = window;
        const initial = points[0] ?? { lat: 37.5665, lng: 126.978 }; // Seoul default
        const m = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(initial.lat, initial.lng),
          level: 5,
        });
        mapRef.current = m;
        // Click on empty map → onMapClick. Kakao emits 'click' on Map; the
        // event has e.latLng. We have no way to detect "did this click land
        // on a marker" via the same handler (custom overlays absorb their
        // own clicks), so this fires for empty-area clicks only.
        kakao.maps.event.addListener(m, "click", (e?: KakaoMouseEvent) => {
          onBackgroundClickRef.current?.();
          if (e?.latLng) {
            onMapClickRef.current?.(e.latLng.getLat(), e.latLng.getLng());
          }
        });
        setSdkReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setSdkError(err.message);
      });
    return () => {
      cancelled = true;
      mapRef.current = null;
    };
  }, [apiKey, points]);

  // ─ Markers (custom overlays for the numbered style) ─
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !sdkReady || !window.kakao?.maps) return;
    const { kakao } = window;

    // Clear previous overlays
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    for (const p of points) {
      const selected = p.id === selectedItemId;
      const html = p.allDay
        ? `<div style="width:24px;height:24px;border:2px solid #111;background:#34d399;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.18);cursor:pointer;"></div>`
        : `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
            <div style="width:30px;height:30px;border-radius:9999px;background:#fff;border:2px solid ${
              selected ? "#3b82f6" : "#111"
            };box-shadow:0 2px 8px rgba(0,0,0,0.18);display:flex;align-items:center;justify-content:center;font-weight:600;color:#111;">${p.idx}</div>
            <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${
              selected ? "#3b82f6" : "#111"
            };margin-top:-2px;"></div>
           </div>`;

      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      wrapper.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onSelectRef.current(p.id);
      });

      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(p.lat, p.lng),
        content: wrapper,
        yAnchor: 1,
        xAnchor: 0.5,
        clickable: true,
        zIndex: 10,
        map: m,
      });
      overlaysRef.current.push(overlay);
    }

    // ─ Polylines ─
    // Remove previous polyline listeners + polylines
    for (const lis of polylineListenersRef.current) {
      kakao.maps.event.removeListener(lis.poly, lis.type, lis.handler);
    }
    polylineListenersRef.current = [];
    polylinesRef.current.forEach((pl) => pl.setMap(null));
    polylinesRef.current = [];

    for (const t of day.transports) {
      const hovered = hoveredTransportId === t.id;
      if (!shouldDrawPolyline(routeVisibility, hovered)) continue;

      let coords: { lat: number; lng: number }[] = [];
      let hasRealRoute = false;
      if (t.encodedPolyline) {
        coords = decodePolylineToLatLng(t.encodedPolyline);
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
            { lat: fp.lat, lng: fp.lng },
            { lat: tp.lat, lng: tp.lng },
          ];
        }
      }
      if (coords.length < 2) continue;

      const path = coords.map((c) => new kakao.maps.LatLng(c.lat, c.lng));
      const color = t.displayColor ?? ROUTE_COLOR[t.mode] ?? ROUTE_COLOR.CUSTOM;
      const poly = new kakao.maps.Polyline({
        path,
        strokeWeight: hovered ? 6 : 4,
        strokeColor: color,
        strokeOpacity: hovered ? 1 : 0.85,
        strokeStyle: hasRealRoute ? "solid" : "shortdash",
        map: m,
      });
      polylinesRef.current.push(poly);

      // Hover / click — Kakao supports mouseover / mouseout / click on Polyline
      const tid = t.id;
      if (tid) {
        const onMove = (e?: KakaoMouseEvent) => {
          if (!e?.latLng) {
            onPolylineHoverRef.current?.(tid);
            return;
          }
          // Kakao doesn't expose pixel coords on the event, so use the centre
          // of the bounding box approximated by the map container rect — the
          // popover is roughly anchored to the cursor's last screen position.
          // (Same behaviour as MapboxMapPanel's onPolylineHover argument,
          // x/y are best-effort.)
          onPolylineHoverRef.current?.(tid);
        };
        const onLeave = () => onPolylineHoverRef.current?.(null);
        const onLineClick = () => onPolylineClickRef.current?.(tid);
        kakao.maps.event.addListener(poly, "mouseover", onMove);
        kakao.maps.event.addListener(poly, "mouseout", onLeave);
        kakao.maps.event.addListener(poly, "click", onLineClick);
        polylineListenersRef.current.push(
          { poly, type: "mouseover", handler: onMove },
          { poly, type: "mouseout", handler: onLeave },
          { poly, type: "click", handler: onLineClick },
        );
      }
    }

    // Fit bounds to all points
    if (points.length >= 2) {
      const bounds = new kakao.maps.LatLngBounds();
      points.forEach((p) => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));
      m.setBounds(bounds);
    } else if (points.length === 1) {
      m.setCenter(new kakao.maps.LatLng(points[0].lat, points[0].lng));
      m.setLevel(4);
    }
  }, [points, selectedItemId, day.transports, day.items, places, routeVisibility, hoveredTransportId, sdkReady]);

  // External flyTo (double-click on list/week item)
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !flyTo || !window.kakao?.maps) return;
    const { kakao } = window;
    m.panTo(new kakao.maps.LatLng(flyTo.lat, flyTo.lng));
    if (m.getLevel() > 4) m.setLevel(4);
  }, [flyTo]);

  return (
    <div className="relative h-full overflow-hidden rounded-lg border border-hairline bg-canvas">
      <div className="pointer-events-none absolute left-1/2 top-3 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-pill bg-canvas/90 px-3 py-1.5 backdrop-blur shadow-soft-elevation">
        <span className="flex items-center gap-1 text-caption-uppercase text-muted">
          <MapPin size={11} strokeWidth={2} />
          DAY {day.dayIndex}
        </span>
        <span className="text-caption text-muted-soft">
          · {points.filter((p) => !p.allDay).length} 站 · Kakao Map
        </span>
      </div>
      <div ref={containerRef} className="h-full w-full" />
      {sdkError && (
        <div className="absolute inset-x-3 top-14 z-30 flex items-start gap-2 rounded-md border border-error/40 bg-canvas p-3 text-[11px] text-error shadow-soft-elevation">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>
            Kakao Map 載入失敗：{sdkError}
            <br />
            請確認 developers.kakao.com 已註冊 <code>{typeof window !== "undefined" ? window.location.origin : ""}</code> 為 Web 平台 domain。
          </span>
        </div>
      )}
    </div>
  );
}
