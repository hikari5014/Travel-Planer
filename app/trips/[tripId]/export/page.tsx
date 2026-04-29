import { notFound } from "next/navigation";
import { loadCompareTrip } from "@/lib/services/editor-loader";
import { ExportPageClient } from "./ExportPageClient";

// Server component — loads light trip metadata for the page chrome + total
// cost (used in the side panel). PDF generation itself is offloaded to
// /api/export/pdf which loads the full payload server-side.
export default async function ExportPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const trip = await loadCompareTrip(tripId);
  if (!trip) notFound();
  const defaultPlan = trip.plans.find((p) => p.isDefault) ?? trip.plans[0];
  const totalCost = defaultPlan?.totalCost ?? 0;
  return <ExportPageClient tripId={trip.tripId} tripTitle={trip.tripTitle} totalCost={totalCost} />;
}
