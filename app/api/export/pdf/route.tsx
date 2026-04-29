import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { defaultExportConfig, type ExportConfig } from "@/lib/export-config";
import { loadPdfTrip } from "@/lib/services/pdf-data-service";
import { TripPdfDocument } from "@/lib/services/pdf-document";

// Streams a PDF for the given trip + export config. Body shape:
// { tripId: string, config?: ExportConfig }
// Force Node runtime — react-pdf relies on Node modules.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { tripId?: string; config?: ExportConfig };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const tripId = body.tripId;
  if (!tripId) return NextResponse.json({ error: "missing_tripId" }, { status: 400 });

  const config: ExportConfig = body.config ?? defaultExportConfig;

  const data = await loadPdfTrip(tripId);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const buffer = await renderToBuffer(<TripPdfDocument data={data} config={config} />);
  // NextResponse expects BodyInit; convert Node Buffer to Uint8Array.
  const pdfBytes = new Uint8Array(buffer);

  const filename = `${data.title.replace(/[^a-zA-Z0-9一-龥]+/g, "_")}-${data.startDate}.pdf`;
  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
