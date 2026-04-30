import { notFound } from "next/navigation";
import { EditorShell } from "@/components/editor/EditorShell";
import { loadEditorTrip } from "@/lib/services/editor-loader";
import {
  getGoogleMapsKey,
  getMapboxKey,
  getSettingsView,
} from "@/lib/services/settings-service";
import { getTripRole } from "@/lib/services/share-service";
import { recalcTripExpenses } from "@/lib/services/expense-service";

// Server Component — single DB round-trip per request, hands the result to a
// client shell that owns all editor state (view toggle, drag, floating card).
export default async function TripEditorPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const [trip, googleKey, mapboxKey, settings, role] = await Promise.all([
    loadEditorTrip(tripId),
    getGoogleMapsKey(),
    getMapboxKey(),
    getSettingsView(),
    getTripRole(tripId),
  ]);
  if (!trip) notFound();

  // Phase 10a — recalc auto-Expense rows on every trip page load. Idempotent
  // (wipes + rebuilds isAuto rows only). Fixes the cost-roll-up bug on
  // legacy trips without requiring the user to manually re-edit anything,
  // and ensures Plan total stays in sync after any background mutation.
  // Wrapped in catch so a recalc failure never breaks page render.
  await recalcTripExpenses(tripId).catch(() => {});

  // Maps JS key + Mapbox public token are referer-restricted by design;
  // safe to hand to client.
  const currency = {
    primary: settings.baseCurrency,
    local: settings.localCurrency,
    rates: {
      base: settings.baseCurrency,
      rates: settings.fxRates as Record<import("@/lib/currency").CurrencyCode, number>,
      fetchedAt: settings.fxFetchedAt ?? "",
      source: "open.er-api.com",
    },
    fetchedAt: settings.fxFetchedAt,
  };
  return (
    <EditorShell
      trip={trip}
      googleMapsKey={googleKey ?? null}
      googleMapId={settings.googleMapId}
      mapboxKey={mapboxKey ?? null}
      mapProvider={settings.mapProvider}
      currency={currency}
      role={role ?? "viewer"}
    />
  );
}
