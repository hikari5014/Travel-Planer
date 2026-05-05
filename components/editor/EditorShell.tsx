"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { EditorHeader, type EditorView } from "@/components/editor/EditorHeader";
import { TopDayStrip } from "@/components/editor/TopDayStrip";
import { ScheduleListView } from "@/components/editor/ScheduleListView";
import { ScheduleListCompare } from "@/components/editor/ScheduleListCompare";
import { WeekGridView } from "@/components/editor/WeekGridView";
import { MapPanel } from "@/components/editor/MapPanel";
import type { MapProvider } from "@/lib/services/settings-service";

// Lazy-load map panels — each pulls a heavy GL library, only one is used per
// session, so we load the chosen one on demand.
const GoogleMapPanel = dynamic(
  () => import("@/components/editor/GoogleMapPanel").then((m) => m.GoogleMapPanel),
  { ssr: false, loading: () => <MapLoadingPlaceholder label="載入 Google Maps…" /> },
);
const MapboxMapPanel = dynamic(
  () => import("@/components/editor/MapboxMapPanel").then((m) => m.MapboxMapPanel),
  { ssr: false, loading: () => <MapLoadingPlaceholder label="載入 Mapbox…" /> },
);
const OsmMapPanel = dynamic(
  () => import("@/components/editor/OsmMapPanel").then((m) => m.OsmMapPanel),
  { ssr: false, loading: () => <MapLoadingPlaceholder label="載入 OpenStreetMap…" /> },
);

function MapLoadingPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-hairline bg-surface-soft text-caption text-muted">
      {label}
    </div>
  );
}
import { FloatingPlaceCard } from "@/components/editor/FloatingPlaceCard";
import { ResizablePanes } from "@/components/editor/ResizablePanes";
import { MapClickAddPopup } from "@/components/editor/MapClickAddPopup";
import { MapSearchOverlay } from "@/components/editor/MapSearchOverlay";
import { RouteVisibilityToggle } from "@/components/editor/RouteVisibilityToggle";
import { TransportHoverPopover } from "@/components/editor/TransportHoverPopover";
import { TransportEditDialogRouter } from "@/components/editor/TransportEditDialogRouter";
import { getPlace } from "@/lib/mock-schedule";
import { setPlacesOverride, type MockDay, type MockPlace, type MockPlan, type MockScheduleItem, type MockTransport } from "@/lib/mock-schedule";
import type { EditorTrip } from "@/lib/services/editor-loader";
import { PlaceSearchDialog } from "@/components/editor/PlaceSearchDialog";
import { AddItemKindPicker } from "@/components/editor/AddItemKindPicker";
import { moveItemToDayAction, updateItemTimesAction } from "@/app/(actions)/schedule-actions";
import { appendDayAction } from "@/app/(actions)/plan-actions";
import { CurrencyProvider } from "@/lib/currency-context";
import type { CurrencyCode, CurrencyRates } from "@/lib/currency";

// Editor's client shell. Everything here runs in the browser; the server
// component (page.tsx) does the DB query once and hands the result down.
export function EditorShell({
  trip,
  googleMapsKey,
  googleMapId,
  mapboxKey,
  mapProvider,
  currency,
  role,
}: {
  trip: EditorTrip;
  googleMapsKey?: string | null;
  googleMapId?: string | null;
  mapboxKey?: string | null;
  mapProvider?: MapProvider;
  currency: {
    primary: CurrencyCode;
    local: CurrencyCode;
    rates: CurrencyRates;
    fetchedAt: string | null;
  };
  role: "owner" | "editor" | "viewer";
}) {
  const isOwner = role === "owner";
  const [view, setView] = useState<EditorView>("list");
  const [planId, setPlanId] = useState(trip.defaultPlanId || trip.plans[0]?.id || "");
  const [comparePlanIds, setComparePlanIds] = useState<string[]>([]);
  // Default to the first day with items, falling back to day 1.
  const initialDayId =
    trip.days.find((d) => d.items.some((i) => !i.isAllDay))?.id ?? trip.days[0]?.id ?? "";
  const [dayId, setDayId] = useState(initialDayId);
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(() => {
    const d = trip.days.find((x) => x.id === initialDayId);
    return d?.items.find((i) => !i.isAllDay)?.id;
  });
  const [floatingOpen, setFloatingOpen] = useState(true);
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);
  const [mapClickCoord, setMapClickCoord] = useState<{ lat: number; lng: number; placeId?: string } | null>(null);
  // Phase 9c — polyline visibility + hover state.
  // Persists to localStorage so user's choice survives reload.
  const [routeVisibility, setRouteVisibility] = useState<"always" | "hover" | "hidden">(() => {
    if (typeof window === "undefined") return "hover";
    const stored = window.localStorage.getItem("editor:routeVisibility");
    return (stored as "always" | "hover" | "hidden" | null) ?? "hover";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("editor:routeVisibility", routeVisibility);
  }, [routeVisibility]);
  const [hoveredTransportId, setHoveredTransportId] = useState<string | null>(null);
  // Phase 9.6 — popover state. Only set when hover came from the MAP
  // polyline (not from list-row hover, which doesn't have viewport coords).
  const [mapHoverPopover, setMapHoverPopover] = useState<{
    transportId: string;
    x: number;
    y: number;
  } | null>(null);
  // Phase 9.6 — when the popover is clicked, open the edit dialog. We
  // keep this state SEPARATE from ScheduleListView's own editing state so
  // map-click and list-click don't interfere; only one dialog opens at a
  // time in practice (user can't be in both at once).
  const [editingFromMap, setEditingFromMap] = useState<MockTransport | null>(null);
  // Double-click on a list/week-view item → flies the map to its lat/lng.
  // Stored as { itemId, ts } so the same id repeated still re-fires the
  // panel's flyTo effect (ts changes each time).
  const [focusItem, setFocusItem] = useState<{ itemId: string; ts: number } | null>(null);
  const handleFocusItem = (id: string) => setFocusItem({ itemId: id, ts: Date.now() });
  // Resolve focus target → lat/lng once, pass it down to map panels.
  const focusTarget = (() => {
    if (!focusItem) return null;
    const it = trip.daysByPlanId[planId]?.flatMap((d) => d.items).find((i) => i.id === focusItem.itemId);
    const place = it?.placeId ? trip.places[it.placeId] : null;
    if (!place || place.lat == null || place.lng == null) return null;
    return { lat: place.lat, lng: place.lng, ts: focusItem.ts };
  })();

  // Convert places to MockPlace shape and register the override so existing
  // components' getPlace(placeId) lookups resolve to DB rows.
  const placesAsMock = useMemo(() => {
    const out: Record<string, MockPlace> = {};
    for (const [id, p] of Object.entries(trip.places)) {
      out[id] = {
        id: p.id,
        name: p.name,
        category: p.category,
        rating: p.rating,
        ratingCount: p.ratingCount,
        address: p.address,
        mapX: p.mapX,
        mapY: p.mapY,
        iconKey: p.iconKey,
        reviewSnippet: p.reviewSnippet,
        defaultStayMinutes: p.defaultStayMinutes,
      };
    }
    return out;
  }, [trip.places]);
  // Apply override synchronously so the very first render's getPlace lookups
  // resolve. (Module state — fine for single-user local mode; Phase 6 SaaS
  // will switch to a React context.)
  setPlacesOverride(placesAsMock);
  useEffect(() => () => setPlacesOverride(null), []);

  // Per-plan day map for compare view
  const days = useMemo(() => trip.daysByPlanId[planId] ?? trip.days, [trip, planId]);
  const compareDayMap = useMemo(() => {
    if (comparePlanIds.length <= 1) return null;
    const result: Record<string, MockDay[]> = {};
    for (const pid of comparePlanIds) {
      result[pid] = (trip.daysByPlanId[pid] ?? []).map((d) => convertDay(d));
    }
    return result;
  }, [trip, comparePlanIds]);

  const currentDayDb = days.find((d) => d.id === dayId) ?? days[0];
  const currentDay = currentDayDb ? convertDay(currentDayDb) : EMPTY_DAY;
  const selectedItem = currentDay.items.find((i) => i.id === selectedItemId);

  // ─ Phase 9.6 popover handlers (depend on currentDay) ─
  const handlePolylineHover = (transportId: string | null, x?: number, y?: number) => {
    if (transportId && x != null && y != null) {
      setMapHoverPopover({ transportId, x, y });
      setHoveredTransportId(transportId);
    } else {
      setMapHoverPopover(null);
      setHoveredTransportId(null);
    }
  };
  const handlePolylineClick = (transportId: string) => {
    const t = currentDay.transports.find((tt) => tt.id === transportId);
    if (t) setEditingFromMap(t);
    setMapHoverPopover(null);
  };
  const popoverContext = (() => {
    const id = mapHoverPopover?.transportId ?? editingFromMap?.id;
    if (!id) return null;
    const t = currentDay.transports.find((tt) => tt.id === id);
    if (!t) return null;
    const fromItem = currentDay.items.find((i) => i.id === t.fromItemId);
    const toItem = currentDay.items.find((i) => i.id === t.toItemId);
    const fromPlace = fromItem?.placeId ? getPlace(fromItem.placeId) : undefined;
    const toPlace = toItem?.placeId ? getPlace(toItem.placeId) : undefined;
    const isFlightSegment =
      t.mode === "FLIGHT" ||
      fromItem?.kind === "FLIGHT" ||
      toItem?.kind === "FLIGHT" ||
      (fromPlace?.iconKey === "airport" && toPlace?.iconKey === "airport");
    return {
      transport: t,
      fromName: fromPlace?.name ?? "",
      toName: toPlace?.name ?? "",
      isFlightSegment,
    };
  })();

  const inListCompare = view === "list" && comparePlanIds.length > 1;

  const comparePlans: MockPlan[] = inListCompare
    ? comparePlanIds
        .map((id) => trip.plans.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => ({
          id: p.id,
          name: p.name,
          isDefault: p.isDefault,
          totalCost: p.totalCost,
          totalDistanceKm: p.totalDistanceKm,
          totalDurationHours: p.totalDurationHours,
          costBreakdown: p.costBreakdown,
          description: p.description,
          pace: (p.pace as MockPlan["pace"]) ?? "標準",
        }))
    : [];

  // Aggregate stats for the day strip (current plan totals)
  const currentPlan = trip.plans.find((p) => p.id === planId) ?? trip.plans[0];
  const totalsForStrip = useMemo(() => {
    const planDays = trip.daysByPlanId[planId] ?? [];
    const totalItems = planDays.reduce((s, d) => s + d.items.filter((i) => !i.isAllDay).length, 0);
    const totalDistance = planDays.reduce(
      (s, d) => s + d.transports.reduce((ss, t) => ss + (t.distanceM ?? 0), 0),
      0,
    );
    const totalTickets = planDays.reduce((s, d) => s + d.items.filter((i) => i.hasTicket).length, 0);
    return { totalItems, totalDistance, totalTickets };
  }, [trip, planId]);

  function handleSelectItem(id: string) {
    setSelectedItemId(id);
    setFloatingOpen(true);
  }

  // Compose all-Days array (mock-typed) for week view & day strip
  const mockDaysAll: MockDay[] = useMemo(
    () => days.map((d) => convertDay(d)),
    [days],
  );

  // For ScheduleListCompare we hand the converted current day from each compared plan.
  const compareDayPerPlan = useMemo(() => {
    if (!compareDayMap) return null;
    const out: Record<string, MockDay> = {};
    for (const [pid, ds] of Object.entries(compareDayMap)) {
      out[pid] = ds.find((d) => d.id === dayId) ?? ds[0] ?? EMPTY_DAY;
    }
    return out;
  }, [compareDayMap, dayId]);

  return (
    <CurrencyProvider value={currency}>
    <div className="flex h-screen flex-col overflow-hidden">
      <EditorHeader
        tripId={trip.id}
        tripTitle={trip.title}
        plans={trip.plans.map((p) => ({
          id: p.id,
          name: p.name,
          isDefault: p.isDefault,
          totalCost: p.totalCost,
          totalDistanceKm: p.totalDistanceKm,
          totalDurationHours: p.totalDurationHours,
          costBreakdown: p.costBreakdown,
          description: p.description,
          pace: (p.pace as MockPlan["pace"]) ?? "標準",
        }))}
        currentPlanId={planId}
        comparePlanIds={comparePlanIds}
        view={view}
        isOwner={isOwner}
        onViewChange={setView}
        onPlanChange={setPlanId}
        onComparePlansChange={setComparePlanIds}
      />

      {view !== "grid" && (
        <TopDayStrip
          days={mockDaysAll}
          currentDayId={dayId}
          onDayChange={setDayId}
          totalCost={currentPlan?.totalCost ?? 0}
          totalCostCurrency={trip.baseCurrency as import("@/lib/currency").CurrencyCode}
          totalDistanceKm={Math.round(totalsForStrip.totalDistance / 1000)}
          totalItems={totalsForStrip.totalItems}
          totalTickets={totalsForStrip.totalTickets}
          onAddDay={async () => { await appendDayAction(trip.id); }}
        />
      )}

      <div className="flex-1 overflow-hidden bg-surface-soft">
        {inListCompare && compareDayPerPlan ? (
          <ScheduleListCompare
            comparePlans={comparePlans}
            day={currentDay}
            selectedItemId={selectedItemId}
            onSelectItem={handleSelectItem}
          />
        ) : (
          <ResizablePanes
            storageKey="editor:left-width"
            initialLeftFraction={0.36}
            minLeftPx={320}
            minRightPx={400}
            left={
              <div className="h-full overflow-y-auto bg-canvas">
                {view === "list" ? (
                  <ScheduleListView
                    day={currentDay}
                    tripId={trip.id}
                    selectedItemId={selectedItemId}
                    onSelectItem={handleSelectItem}
                    onFocusItem={handleFocusItem}
                    onAddPlace={() => setPlaceSearchOpen(true)}
                    onHoverTransport={setHoveredTransportId}
                    googleMapsKey={googleMapsKey}
                  />
                ) : (
                  <WeekGridView
                    days={mockDaysAll}
                    tripId={trip.id}
                    selectedDayId={dayId}
                    selectedItemId={selectedItemId}
                    onSelectItem={handleSelectItem}
                    onFocusItem={handleFocusItem}
                    hasGoogleKey={!!googleMapsKey}
                    onUpdateItemTimes={(itemId, startTime, endTime) =>
                      updateItemTimesAction(trip.id, itemId, startTime, endTime)
                    }
                    onMoveItemToDay={(itemId, targetDayId) =>
                      moveItemToDayAction(trip.id, itemId, targetDayId)
                    }
                  />
                )}
              </div>
            }
            right={
              <div className="relative h-full p-2">
                <MapSearchOverlay
                  tripId={trip.id}
                  dayId={dayId}
                  hasGoogleKey={!!googleMapsKey}
                />
                {/* Polyline visibility toggle — pinned bottom-center so it
                    sits between Google's bottom-left mapTypeControl and
                    bottom-right zoom controls without overlap. */}
                <div className="pointer-events-auto absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
                  <RouteVisibilityToggle
                    value={routeVisibility}
                    onChange={setRouteVisibility}
                  />
                </div>
                {(() => {
                  // Resolve which map panel to render. Provider preference comes
                  // from Settings; if the chosen provider lacks its key we
                  // gracefully fall back to OSM (free) → SVG mock.
                  const provider: MapProvider = mapProvider ?? "osm";
                  // Common hook: clicking empty map area opens the
                  // "add destination here" popup. Google panel may pass a
                  // placeId when the click landed on a labeled POI, in
                  // which case we'll fetch that one directly.
                  const handleMapClick = (lat: number, lng: number, placeId?: string) =>
                    setMapClickCoord(placeId ? { lat, lng, placeId } : { lat, lng });

                  if (provider === "google" && googleMapsKey) {
                    return (
                      <GoogleMapPanel
                        apiKey={googleMapsKey}
                        mapId={googleMapId ?? null}
                        day={currentDay}
                        places={trip.places}
                        selectedItemId={selectedItemId}
                        onSelectItem={handleSelectItem}
                        onBackgroundClick={() => setFloatingOpen(false)}
                        onMapClick={handleMapClick}
                        flyTo={focusTarget}
                        routeVisibility={routeVisibility}
                        hoveredTransportId={hoveredTransportId}
                        onPolylineHover={handlePolylineHover}
                        onPolylineClick={handlePolylineClick}
                      />
                    );
                  }
                  if (provider === "mapbox" && mapboxKey) {
                    return (
                      <MapboxMapPanel
                        apiKey={mapboxKey}
                        day={currentDay}
                        places={trip.places}
                        selectedItemId={selectedItemId}
                        onSelectItem={handleSelectItem}
                        onBackgroundClick={() => setFloatingOpen(false)}
                        onMapClick={handleMapClick}
                        flyTo={focusTarget}
                        routeVisibility={routeVisibility}
                        hoveredTransportId={hoveredTransportId}
                        onPolylineHover={handlePolylineHover}
                        onPolylineClick={handlePolylineClick}
                      />
                    );
                  }
                  if (provider === "osm") {
                    return (
                      <OsmMapPanel
                        day={currentDay}
                        places={trip.places}
                        selectedItemId={selectedItemId}
                        onSelectItem={handleSelectItem}
                        onBackgroundClick={() => setFloatingOpen(false)}
                        onMapClick={handleMapClick}
                        flyTo={focusTarget}
                        routeVisibility={routeVisibility}
                        hoveredTransportId={hoveredTransportId}
                        onPolylineHover={handlePolylineHover}
                        onPolylineClick={handlePolylineClick}
                      />
                    );
                  }
                  // Provider chosen but no key → fall back to SVG mock so the
                  // page is still usable instead of crashing.
                  return (
                    <MapPanel
                      day={currentDay}
                      selectedItemId={selectedItemId}
                      onSelectItem={handleSelectItem}
                      onBackgroundClick={() => setFloatingOpen(false)}
                    />
                  );
                })()}
              </div>
            }
          />
        )}
      </div>

      {floatingOpen && selectedItem && (
        <FloatingPlaceCard
          item={selectedItem}
          tripId={trip.id}
          region={trip.destination}
          baseCurrency={currency.primary}
          dayDate={currentDay.date}
          onClose={() => setFloatingOpen(false)}
        />
      )}
      {placeSearchOpen && (
        <AddItemKindPicker
          tripId={trip.id}
          defaultDate={currentDay.date}
          hasGoogleKey={!!googleMapsKey}
          onClose={() => setPlaceSearchOpen(false)}
        />
      )}
      {mapClickCoord && (
        <MapClickAddPopup
          tripId={trip.id}
          dayId={dayId}
          lat={mapClickCoord.lat}
          lng={mapClickCoord.lng}
          placeId={mapClickCoord.placeId}
          hasGoogleKey={!!googleMapsKey}
          onClose={() => setMapClickCoord(null)}
        />
      )}
      {/* Phase 9.6 — hover popover for map polylines */}
      {mapHoverPopover && popoverContext && (
        <TransportHoverPopover
          transport={popoverContext.transport}
          fromName={popoverContext.fromName}
          toName={popoverContext.toName}
          x={mapHoverPopover.x}
          y={mapHoverPopover.y}
          onClick={() => handlePolylineClick(mapHoverPopover.transportId)}
        />
      )}
      {/* Phase 9.6 / 11 — dialog opened from clicking the map popover */}
      {editingFromMap && popoverContext && (
        <TransportEditDialogRouter
          tripId={trip.id}
          transport={editingFromMap}
          fromName={popoverContext.fromName}
          toName={popoverContext.toName}
          isFlightSegment={popoverContext.isFlightSegment}
          region={trip.destination}
          onClose={() => setEditingFromMap(null)}
        />
      )}
    </div>
    </CurrencyProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion helpers — DB shape → mock-schedule shape consumed by components.
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_DAY: MockDay = {
  id: "empty",
  date: new Date().toISOString().slice(0, 10),
  dayIndex: 1,
  weekday: "一",
  items: [],
  transports: [],
};

function convertDay(d: EditorTrip["days"][number]): MockDay {
  const items: MockScheduleItem[] = d.items.map((it) => ({
    id: it.id,
    kind: it.kind,
    placeId: it.placeId ?? undefined,
    startTime: it.startTime,
    endTime: it.endTime,
    durationMin: it.durationMin,
    isAllDay: it.isAllDay,
    isTimeLocked: it.isTimeLocked,
    hasTicket: it.hasTicket,
    note: it.note ?? undefined,
    metadata: it.metadata,
    parentFlightScheduleItemId: it.parentFlightScheduleItemId,
    photoCount: it.photoCount,
  }));
  const transports: MockTransport[] = d.transports.map((t) => ({
    id: t.id,
    fromItemId: t.fromItemId,
    toItemId: t.toItemId,
    mode: t.mode,
    distanceM: t.distanceM,
    durationSec: t.durationSec,
    estimatedCost: t.estimatedCost ?? undefined,
    needsParking: t.needsParking,
    manuallyEdited: t.manuallyEdited,
    notes: t.notes,
    transitLine: t.transitLine,
    originLabel: t.originLabel,
    destinationLabel: t.destinationLabel,
    parkingPlaceId: t.parkingPlaceId,
    parkingPlaceName: t.parkingPlaceName,
    encodedPolyline: t.encodedPolyline,
    fareCurrency: t.fareCurrency,
    fareAmount: t.fareAmount,
    trafficLevel: t.trafficLevel,
    directionsFetchedAt: t.directionsFetchedAt,
    hasModesSummary: t.hasModesSummary,
    metadata: t.metadata,
    routeOptionsJson: t.routeOptionsJson,
    selectedOptionId: t.selectedOptionId,
    displayColor: t.displayColor,
    isFree: t.isFree,
    transitStepsJson: t.transitStepsJson,
    drivingSegmentsJson: t.drivingSegmentsJson,
  }));
  return {
    id: d.id,
    version: d.version,
    date: d.date,
    dayIndex: d.dayIndex,
    weekday: d.weekday,
    items,
    transports,
  };
}
