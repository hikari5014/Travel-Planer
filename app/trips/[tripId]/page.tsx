"use client";

import { use, useState } from "react";
import { EditorHeader, type EditorView } from "@/components/editor/EditorHeader";
import { TopDayStrip } from "@/components/editor/TopDayStrip";
import { ScheduleListView } from "@/components/editor/ScheduleListView";
import { ScheduleListCompare } from "@/components/editor/ScheduleListCompare";
import { WeekGridView } from "@/components/editor/WeekGridView";
import { MapPanel } from "@/components/editor/MapPanel";
import { FloatingPlaceCard } from "@/components/editor/FloatingPlaceCard";
import { ResizablePanes } from "@/components/editor/ResizablePanes";
import { mockDays, mockPlans } from "@/lib/mock-schedule";
import { mockTrips } from "@/lib/mock-trips";

export default function TripEditorPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = use(params);
  const trip = mockTrips.find((t) => t.id === tripId) ?? mockTrips[0];

  const [view, setView] = useState<EditorView>("list");
  const [planId, setPlanId] = useState(mockPlans[0].id);
  const [comparePlanIds, setComparePlanIds] = useState<string[]>([]);
  const [dayId, setDayId] = useState("d3");
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>("i2");
  const [floatingOpen, setFloatingOpen] = useState(true);

  const currentDay = mockDays.find((d) => d.id === dayId) ?? mockDays[2];
  const selectedItem = currentDay.items.find((i) => i.id === selectedItemId);

  // Inline list-comparison mode auto-hides the map (per user request).
  const inListCompare = view === "list" && comparePlanIds.length > 1;

  const comparePlans = inListCompare
    ? mockPlans.filter((p) => comparePlanIds.includes(p.id))
    : [];

  function handleSelectItem(id: string) {
    setSelectedItemId(id);
    setFloatingOpen(true);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <EditorHeader
        tripId={trip.id}
        tripTitle={trip.title}
        plans={mockPlans}
        currentPlanId={planId}
        comparePlanIds={comparePlanIds}
        view={view}
        onViewChange={setView}
        onPlanChange={setPlanId}
        onComparePlansChange={setComparePlanIds}
      />

      {/* Week view shows all days inline already → hide the day strip to save vertical space. */}
      {view !== "grid" && (
        <TopDayStrip
          days={mockDays}
          currentDayId={dayId}
          onDayChange={setDayId}
          totalCost={78400}
          totalDistanceKm={142}
          totalItems={14}
          totalTickets={6}
        />
      )}

      <div className="flex-1 overflow-hidden bg-surface-soft">
        {inListCompare ? (
          // Map auto-collapsed: full-width compare view
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
                    days={mockDays}
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

      {/* Floating place card lives at the page root so it can be dragged
          anywhere on screen, including over compare columns or off the map. */}
      {floatingOpen && selectedItem && (
        <FloatingPlaceCard
          item={selectedItem}
          onClose={() => setFloatingOpen(false)}
        />
      )}
    </div>
  );
}
