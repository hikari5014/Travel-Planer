import { notFound } from "next/navigation";
import { loadHandbookTrip } from "@/lib/services/pdf-data-service";
import { HandbookView } from "@/components/handbook/HandbookView";
import { PrintHandbookView } from "@/components/handbook/PrintHandbookView";
import { defaultExportConfig, type ColorMode, type FontScale, type Orientation, type PaperSize, type SectionKey } from "@/lib/export-config";
import type { Metadata } from "next";

// Phase 14k — public mobile travel handbook (default).
// Phase 14n — paper-sized printable variant when ?paper=A4|A5|Letter is set.
// URL: /h/<tripId>. No auth — anyone with the link can view (CUIDs are
// unguessable, so security-through-obscurity is acceptable for v1).
// Read-only; intended for opening on a phone during the trip OR printing.

type PageProps = {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

const PAPER_SIZES: PaperSize[] = ["A4", "A5", "Letter"];
const ORIENTATIONS: Orientation[] = ["portrait", "landscape"];
const FONT_SCALES: FontScale[] = ["small", "normal", "large"];
const COLOR_MODES: ColorMode[] = ["color", "mono"];

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export default async function HandbookPage({ params, searchParams }: PageProps) {
  const { tripId } = await params;
  const sp = await searchParams;
  const trip = await loadHandbookTrip(tripId);
  if (!trip) notFound();

  // Print mode = paper query param present (any valid paper). Otherwise mobile.
  const paperParam = typeof sp.paper === "string" ? sp.paper : undefined;
  if (paperParam && (PAPER_SIZES as string[]).includes(paperParam)) {
    const sectionsParam = typeof sp.sections === "string" ? sp.sections.split(",") : null;
    const sections: Record<SectionKey, boolean> = sectionsParam
      ? Object.fromEntries(
          (Object.keys(defaultExportConfig.sections) as SectionKey[]).map((k) => [
            k,
            sectionsParam.includes(k),
          ]),
        ) as Record<SectionKey, boolean>
      : defaultExportConfig.sections;
    const config = {
      paper: pickEnum(paperParam, PAPER_SIZES, "A4"),
      orientation: pickEnum(sp.orient, ORIENTATIONS, "portrait"),
      fontScale: pickEnum(sp.font, FONT_SCALES, "normal"),
      color: pickEnum(sp.color, COLOR_MODES, "color"),
      sections,
    };
    return <PrintHandbookView trip={trip} config={config} />;
  }

  return <HandbookView trip={trip} />;
}
