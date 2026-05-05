import { notFound } from "next/navigation";
import { loadHandbookTrip } from "@/lib/services/pdf-data-service";
import { HandbookView } from "@/components/handbook/HandbookView";
import type { Metadata } from "next";

// Phase 14k — public mobile travel handbook.
// URL: /h/<tripId>. No auth — anyone with the link can view (CUIDs are
// unguessable, so security-through-obscurity is acceptable for v1).
// Read-only; intended for opening on a phone during the trip.

type PageProps = {
  params: Promise<{ tripId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tripId } = await params;
  const trip = await loadHandbookTrip(tripId);
  if (!trip) return { title: "找不到行程" };
  return {
    title: `${trip.title} — 旅遊手冊`,
    description: trip.subtitle || `${trip.destination} · ${trip.startDate} ~ ${trip.endDate}`,
    robots: { index: false, follow: false },
  };
}

export default async function HandbookPage({ params }: PageProps) {
  const { tripId } = await params;
  const trip = await loadHandbookTrip(tripId);
  if (!trip) notFound();
  return <HandbookView trip={trip} />;
}
