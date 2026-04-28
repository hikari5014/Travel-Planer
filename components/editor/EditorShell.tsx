"use client";

import { useEffect, useMemo, useState } from "react";
import { EditorHeader, type EditorView } from "@/components/editor/EditorHeader";
import { TopDayStrip } from "@/components/editor/TopDayStrip";
import { ScheduleListView } from "@/components/editor/ScheduleListView";
import { ScheduleListCompare } from "@/components/editor/ScheduleListCompare";
import { WeekGridView } from "@/components/editor/WeekGridView";
import { MapPanel } from "@/components/editor/MapPanel";
import { FloatingPlaceCard } from "@/components/editor/FloatingPlaceCard";
import { ResizablePanes } from "@/components/editor/ResizablePanes";
import { setPlacesOverride, type MockDay, type MockPlace, type MockPlan, type MockScheduleItem, type MockTransport } from "@/lib/mock-schedule";
import type { EditorTrip } from "@/lib/services/editor-loader";

// Editor's client shell. Everything here runs in the browser; the server
// component (page.tsx) does the DB query once and hands the result down.
export function EditorShell({ trip }: { trip: EditorTrip }) {
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
          totalDistanceKm={Math.round(totalsForStrip.totalDistance / 1000)}
          totalItems={totalsForStrip.totalItems}
          totalTickets={totalsForStrip.totalTickets}
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
                    selectedItemId={selectedItemId}
                    onSelectItem={handleSelectItem}
                  />
                ) : (
                  <WeekGridView
                    days={mockDaysAll}
                    selectedDayId={dayId}
                    selectedItemId={selectedItemId}
                    onSelectItem={handleSelectItem}
                  />
                )}
              </div>
            }
            right={
              <div className="h-full p-2">
                <MapPanel
                  day={currentDay}
                  selectedItemId={selectedItemId}
                  onSelectItem={handleSelectItem}
                  onBackgroundClick={() => setFloatingOpen(false)}
                />
              </div>
            }
          />
        )}
      </div>

      {floatingOpen && selectedItem && (
        <FloatingPlaceCard item={selectedItem} onClose={() => setFloatingOpen(false)} />
      )}
    </div>
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
  }));
  const transports: MockTransport[] = d.transports.map((t) => ({
    fromItemId: t.fromItemId,
    toItemId: t.toItemId,
    mode: t.mode,
    distanceM: t.distanceM,
    durationSec: t.durationSec,
    estimatedCost: t.estimatedCost ?? undefined,
    needsParking: t.needsParking,
  }));
  return {
    id: d.id,
    date: d.date,
    dayIndex: d.dayIndex,
    weekday: d.weekday,
    items,
    transports,
  };
}
