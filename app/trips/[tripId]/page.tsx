import { notFound } from "next/navigation";
import { EditorShell } from "@/components/editor/EditorShell";
import { loadEditorTrip } from "@/lib/services/editor-loader";

// Server Component — single DB round-trip per request, hands the result to a
// client shell that owns all editor state (view toggle, drag, floating card).
export default async function TripEditorPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const trip = await loadEditorTrip(tripId);
  if (!trip) notFound();
  return <EditorShell trip={trip} />;
}
