import { notFound } from "next/navigation";
import { EditorShell } from "@/components/editor/EditorShell";
import { loadEditorTrip } from "@/lib/services/editor-loader";
import {
  getGoogleMapsKey,
  getMapboxKey,
  getSettingsView,
} from "@/lib/services/settings-service";

// Server Component — single DB round-trip per request, hands the result to a
// client shell that owns all editor state (view toggle, drag, floating card).
export default async function TripEditorPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const [trip, googleKey, mapboxKey, settings] = await Promise.all([
    loadEditorTrip(tripId),
    getGoogleMapsKey(),
    getMapboxKey(),
    getSettingsView(),
  ]);
  if (!trip) notFound();
  // Maps JS key + Mapbox public token are referer-restricted by design;
  // safe to hand to client.
  return (
    <EditorShell
      trip={trip}
      googleMapsKey={googleKey ?? null}
      mapboxKey={mapboxKey ?? null}
      mapProvider={settings.mapProvider}
    />
  );
}
