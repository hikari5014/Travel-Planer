"use client";

import {
  Plane,
  Hotel,
  UtensilsCrossed,
  Camera,
  CarFront,
  Coffee,
  MapPin,
  Train,
  Footprints,
  Car,
  Bike,
  Bus,
} from "lucide-react";
import type {
  PdfPlace,
  PdfScheduleItem,
  PdfTransport,
  PdfTripData,
  PdfDay,
} from "@/lib/services/pdf-data-service";
import type { ExportConfig, PaperSize } from "@/lib/export-config";
import { fontScaleMul } from "@/lib/export-config";

// Phase 14n — replaces the @react-pdf/renderer pipeline. Paper-sized HTML
// pages rendered with real mm units and CSS @page so the browser can print
// them directly (and "Save as PDF" via the print dialog produces a clean
// output without server-side font/layout issues).
//
// Same data shape as HandbookView (PdfTripData) but laid out as fixed-size
// pages with page-break-after rules.

type Props = {
  trip: PdfTripData;
  config: ExportConfig;
};

const KIND_ICON: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  FLIGHT: Plane,
  LODGING: Hotel,
  MEAL: UtensilsCrossed,
  ATTRACTION: Camera,
  CAR_RENTAL: CarFront,
  FREE: Coffee,
  TRANSPORT_STOP: Train,
};
const KIND_LABEL: Record<string, string> = {
  FLIGHT: "飛機",
  LODGING: "住宿",
  MEAL: "餐飲",
  ATTRACTION: "景點",
  CAR_RENTAL: "租車",
  FREE: "自由時間",
  TRANSPORT_STOP: "中繼",
};
const MODE_ICON: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  WALKING: Footprints,
  DRIVING: Car,
  TRANSIT: Train,
  BICYCLING: Bike,
  TAXI: Car,
  FLIGHT: Plane,
  CUSTOM: Bus,
};
const MODE_LABEL: Record<string, string> = {
  WALKING: "步行",
  DRIVING: "駕車",
  TRANSIT: "大眾運輸",
  BICYCLING: "騎車",
  TAXI: "計程車",
  FLIGHT: "航班",
  CUSTOM: "自訂",
};

const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  Letter: { w: 215.9, h: 279.4 },
};

function pageDims(config: ExportConfig) {
  const dims = PAPER_MM[config.paper];
  return config.orientation === "portrait"
    ? { w: dims.w, h: dims.h }
    : { w: dims.h, h: dims.w };
}

function googleMapsLink(place: PdfPlace | undefined): string | null {
  if (!place) return null;
  const name = encodeURIComponent(place.name);
  if (place.id && !place.id.startsWith("local-") && !place.id.startsWith("airport-")) {
    return `https://www.google.com/maps/search/?api=1&query=${name}&query_place_id=${place.id}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${name}`;
}

function formatDuration(secs: number): string {
  const mins = Math.round(secs / 60);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}小時${m}分` : `${h}小時`;
  }
  return `${mins}分`;
}

function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${m} m`;
}

export function PrintHandbookView({ trip, config }: Props) {
  const dims = pageDims(config);
  const isMono = config.color === "mono";
  const fontMul = fontScaleMul[config.fontScale];

  // Each <Page> wraps a paper-sized .print-page. Print stylesheet sets
  // @page size matching `dims` so browser print uses the right paper.
  return (
    <div className={`print-root ${isMono ? "print-mono" : ""}`} style={{ fontSize: `${10 * fontMul}pt` }}>
      <style>{`
        @page {
          size: ${dims.w}mm ${dims.h}mm;
          margin: 0;
        }
        @media print {
          html, body { background: #fff !important; }
          .print-screen-only { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; page-break-after: always; break-after: page; }
          .print-page:last-child { page-break-after: auto; }
        }
        @media screen {
          .print-root { background: #f4f4f5; padding: 24px 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; gap: 16px; }
        }
        .print-page {
          width: ${dims.w}mm;
          height: ${dims.h}mm;
          background: #fff;
          color: #0a0a0a;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04);
          padding: 14mm 14mm;
          box-sizing: border-box;
          position: relative;
          font-family: var(--font-sans-cjk, 'Noto Sans TC'), var(--font-sans, Inter), system-ui, sans-serif;
        }
        .print-mono .print-page { color: #000; }
        .print-mono .accent { color: #444 !important; background: #f4f4f5 !important; }
      `}</style>

      <PrintToolbar />

      {config.sections.cover && <CoverPage trip={trip} dims={dims} />}
      {config.sections.toc && <TocPage trip={trip} config={config} dims={dims} />}
      {config.sections.tripMap && <TripMapPage trip={trip} dims={dims} />}
      {config.sections.preTripNotes && trip.ai.some((s) => s.category === "PRE_TRIP_NOTES") && (
        <AiPage title="行前注意事項" subtitle="Pre-trip notes" sections={trip.ai.filter((s) => s.category === "PRE_TRIP_NOTES")} dims={dims} />
      )}
      {config.sections.packingChecklist && trip.ai.some((s) => s.category === "PACKING_CHECKLIST") && (
        <AiPage title="行李清單" subtitle="Packing checklist" sections={trip.ai.filter((s) => s.category === "PACKING_CHECKLIST")} dims={dims} checklist />
      )}
      {config.sections.dailySchedule && trip.days.map((day) => (
        <DayPage key={day.id} day={day} places={trip.places} baseCurrency={trip.baseCurrency} dims={dims} />
      ))}
      {config.sections.costSummary && <CostPage trip={trip} dims={dims} />}
      {config.sections.tickets && trip.tickets.length > 0 && <TicketsPage trip={trip} dims={dims} />}
      {config.sections.backCover && <BackCoverPage trip={trip} dims={dims} />}
    </div>
  );
}

function PrintToolbar() {
  return (
    <div className="print-screen-only fixed right-4 top-4 z-50 flex gap-1.5 rounded-md border border-hairline bg-canvas/95 p-1.5 shadow-soft-elevation backdrop-blur">
      <button
        type="button"
        onClick={() => typeof window !== "undefined" && window.print()}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] text-on-primary hover:bg-primary-active"
      >
        🖨 列印 / 儲存為 PDF
      </button>
    </div>
  );
}

function CoverPage({ trip, dims }: { trip: PdfTripData; dims: { w: number; h: number } }) {
  return (
    <section className="print-page" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div>
        <p style={{ fontSize: "9pt", letterSpacing: "0.2em", color: "#666", textTransform: "uppercase" }}>Travel Handbook</p>
        <h1 style={{ fontSize: dims.w > 200 ? "44pt" : "28pt", fontWeight: 600, lineHeight: 1.05, marginTop: "8mm", letterSpacing: "-0.02em" }}>
          {trip.title}
        </h1>
        {trip.subtitle && (
          <p style={{ fontSize: "13pt", color: "#444", marginTop: "4mm" }}>{trip.subtitle}</p>
        )}
      </div>
      <div>
        <div style={{ borderTop: "1px solid #d4d4d8", paddingTop: "6mm" }}>
          <p style={{ fontSize: "11pt", color: "#0a0a0a" }}>
            {trip.destination ? `${trip.destination} · ` : ""}
            {trip.startDate} ~ {trip.endDate}
          </p>
          <p style={{ fontSize: "9pt", color: "#666", marginTop: "2mm" }}>
            {trip.totalDays} 天 · {trip.days.reduce((s, d) => s + d.items.length, 0)} 個行程點 · {trip.totalDistanceKm.toFixed(0)} km 總距離
          </p>
        </div>
      </div>
    </section>
  );
}

function TocPage({ trip, config, dims: _ }: { trip: PdfTripData; config: ExportConfig; dims: { w: number; h: number } }) {
  const sections: Array<{ label: string; subtitle?: string }> = [];
  if (config.sections.cover) sections.push({ label: "封面" });
  if (config.sections.toc) sections.push({ label: "目錄" });
  if (config.sections.tripMap) sections.push({ label: "全趟行程一覽" });
  if (config.sections.preTripNotes && trip.ai.some((s) => s.category === "PRE_TRIP_NOTES")) {
    sections.push({ label: "行前注意事項" });
  }
  if (config.sections.packingChecklist && trip.ai.some((s) => s.category === "PACKING_CHECKLIST")) {
    sections.push({ label: "行李清單" });
  }
  if (config.sections.dailySchedule) {
    trip.days.forEach((d) => sections.push({ label: `Day ${d.dayIndex} · ${d.date}（週${d.weekday}）`, subtitle: `${d.items.length} 個項目` }));
  }
  if (config.sections.costSummary) sections.push({ label: "費用總表" });
  if (config.sections.tickets && trip.tickets.length > 0) sections.push({ label: "票券附頁", subtitle: `${trip.tickets.length} 張` });
  if (config.sections.backCover) sections.push({ label: "封底" });
  return (
    <section className="print-page">
      <p style={{ fontSize: "9pt", letterSpacing: "0.18em", color: "#666", textTransform: "uppercase" }}>Table of Contents</p>
      <h2 style={{ fontSize: "20pt", fontWeight: 600, marginTop: "2mm", marginBottom: "8mm" }}>目錄</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {sections.map((s, i) => (
          <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3mm 0", borderBottom: "1px solid #e5e5e5" }}>
            <span style={{ fontSize: "11pt" }}>{s.label}</span>
            {s.subtitle && <span style={{ fontSize: "9pt", color: "#888" }}>{s.subtitle}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DayPage({
  day,
  places,
  baseCurrency,
  dims,
}: {
  day: PdfDay;
  places: Record<string, PdfPlace>;
  baseCurrency: string;
  dims: { w: number; h: number };
}) {
  const allDay = day.items.filter((i) => i.isAllDay);
  const timed = day.items.filter((i) => !i.isAllDay);
  const transportsByFrom = new Map(day.transports.map((t) => [t.fromItemId, t]));
  return (
    <section className="print-page" style={{ display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "1px solid #d4d4d8", paddingBottom: "3mm", marginBottom: "4mm" }}>
        <div>
          <p style={{ fontSize: "8pt", letterSpacing: "0.2em", color: "#888", textTransform: "uppercase" }}>Day {day.dayIndex}</p>
          <h2 style={{ fontSize: "16pt", fontWeight: 600, marginTop: "1mm" }}>{day.date}（週{day.weekday}）</h2>
        </div>
        <p style={{ fontSize: "9pt", color: "#666" }}>{day.items.length} 個項目</p>
      </header>

      {allDay.length > 0 && (
        <div style={{ marginBottom: "3mm" }}>
          {allDay.map((it) => (
            <ItemRow key={it.id} item={it} place={it.placeId ? places[it.placeId] : undefined} baseCurrency={baseCurrency} compact />
          ))}
        </div>
      )}

      {timed.length === 0 && allDay.length === 0 && (
        <p style={{ fontSize: "10pt", color: "#888" }}>這天沒有安排行程</p>
      )}

      {timed.map((it, idx) => {
        const next = timed[idx + 1];
        const transport = transportsByFrom.get(it.id);
        const place = it.placeId ? places[it.placeId] : undefined;
        return (
          <div key={it.id}>
            <ItemRow item={it} place={place} baseCurrency={baseCurrency} />
            {next && transport && (
              <TransportLine
                transport={transport}
                fromPlace={place}
                toPlace={next.placeId ? places[next.placeId] : undefined}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}

function ItemRow({
  item,
  place,
  baseCurrency,
  compact,
}: {
  item: PdfScheduleItem;
  place: PdfPlace | undefined;
  baseCurrency: string;
  compact?: boolean;
}) {
  const Icon = KIND_ICON[item.kind] ?? MapPin;
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const mapLink = googleMapsLink(place);
  return (
    <article style={{ borderBottom: "1px solid #e5e5e5", padding: "3mm 0", display: "flex", gap: "4mm" }}>
      <div style={{ width: "14mm", flexShrink: 0, paddingTop: "1mm" }}>
        {!compact ? (
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "9pt", color: "#0a0a0a" }}>
            <div>{item.startTime}</div>
            <div style={{ color: "#999", fontSize: "8pt" }}>{item.endTime}</div>
          </div>
        ) : (
          <div style={{ fontSize: "8pt", color: "#888" }}>整日</div>
        )}
      </div>
      <div style={{ width: "8mm", flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: "1.5mm" }}>
        <Icon size={14} strokeWidth={1.6} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "2mm" }}>
          <h3 style={{ fontSize: "11pt", fontWeight: 600, color: "#0a0a0a" }}>{place?.name ?? "—"}</h3>
          <span style={{ fontSize: "8pt", color: "#888" }}>{KIND_LABEL[item.kind] ?? item.kind}</span>
          {place && place.rating > 0 && (
            <span style={{ fontSize: "8pt", color: "#888" }}>★ {place.rating.toFixed(1)}</span>
          )}
        </div>
        {place?.address && (
          <p style={{ fontSize: "8pt", color: "#666", marginTop: "0.5mm" }}>{place.address}</p>
        )}
        {place?.summary && (
          <p style={{ fontSize: "9pt", color: "#444", marginTop: "1mm" }}>{place.summary}</p>
        )}
        <ItemMeta kind={item.kind} meta={meta} baseCurrency={baseCurrency} />
        {item.note && (
          <p style={{ fontSize: "9pt", color: "#0a0a0a", marginTop: "1mm", padding: "1.5mm 2mm", background: "#f4f4f5", borderRadius: "1mm" }}>
            {item.note}
          </p>
        )}
        {mapLink && (
          <p style={{ fontSize: "7pt", color: "#888", marginTop: "1mm" }}>
            <a className="print-screen-only accent" href={mapLink} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6" }}>
              ↗ Google Maps 導航
            </a>
            <span className="print-only" style={{ display: "none" }}>{mapLink}</span>
          </p>
        )}
      </div>
    </article>
  );
}

function ItemMeta({ kind, meta, baseCurrency }: { kind: string; meta: Record<string, unknown>; baseCurrency: string }) {
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const cur = (v: unknown) => str(v) ?? baseCurrency;
  const money = (a: number, c: string) => `${c} ${Math.round(a).toLocaleString()}`;
  const rows: string[] = [];
  if (kind === "FLIGHT") {
    if (str(meta.flightNumber)) rows.push(`${str(meta.flightNumber)}${str(meta.airline) ? ` · ${str(meta.airline)}` : ""}`);
    if (str(meta.depAirport) && str(meta.arrAirport)) rows.push(`${str(meta.depAirport)} → ${str(meta.arrAirport)}`);
    if (str(meta.seatNumber)) rows.push(`座位 ${str(meta.seatNumber)}`);
    if (str(meta.bookingRef)) rows.push(`PNR ${str(meta.bookingRef)}`);
    if (num(meta.ticketPrice)) rows.push(`機票 ${money(num(meta.ticketPrice)!, cur(meta.ticketCurrency))}`);
  } else if (kind === "LODGING") {
    if (num(meta.totalCost) && num(meta.nights)) rows.push(`${money(num(meta.totalCost)!, cur(meta.ticketCurrency))} (${num(meta.nights)} 晚)`);
    if (str(meta.checkInTime) || str(meta.checkOutTime)) rows.push(`${str(meta.checkInTime) ?? "—"}入 / ${str(meta.checkOutTime) ?? "—"}退`);
    if (str(meta.bookingRef)) rows.push(`訂房 ${str(meta.bookingRef)}`);
  } else if (kind === "MEAL") {
    if (num(meta.averagePrice) && num(meta.partySize)) {
      rows.push(`${money(num(meta.averagePrice)! * num(meta.partySize)!, cur(meta.ticketCurrency))} (${num(meta.partySize)} 人)`);
    }
    if (str(meta.cuisine)) rows.push(str(meta.cuisine)!);
    if (str(meta.reservationRef)) rows.push(`訂位 ${str(meta.reservationRef)}`);
  } else if (kind === "ATTRACTION") {
    const tickets = Array.isArray(meta.tickets) ? (meta.tickets as Array<{ unitPrice?: number; quantity?: number }>) : null;
    if (tickets && tickets.length > 0) {
      const total = tickets.reduce((s, t) => s + (t.unitPrice ?? 0) * (t.quantity ?? 0), 0);
      if (total > 0) rows.push(`票價 ${money(total, cur(meta.ticketCurrency))}`);
    }
    if (str(meta.openingHours)) rows.push(str(meta.openingHours)!);
  } else if (kind === "CAR_RENTAL") {
    if (str(meta.vendor) || str(meta.carModel)) rows.push(`${str(meta.vendor) ?? ""} ${str(meta.carModel) ?? ""}`.trim());
    if (num(meta.totalCost)) rows.push(money(num(meta.totalCost)!, cur(meta.ticketCurrency)));
  }
  if (rows.length === 0) return null;
  return (
    <p style={{ fontSize: "8pt", color: "#444", marginTop: "1mm" }}>
      {rows.map((r, i) => (
        <span key={i}>{i > 0 && <span style={{ color: "#bbb" }}> · </span>}{r}</span>
      ))}
    </p>
  );
}

function TransportLine({
  transport,
  fromPlace: _from,
  toPlace: _to,
}: {
  transport: PdfTransport;
  fromPlace: PdfPlace | undefined;
  toPlace: PdfPlace | undefined;
}) {
  const Icon = MODE_ICON[transport.mode] ?? Footprints;
  const parts: string[] = [MODE_LABEL[transport.mode] ?? transport.mode];
  if (transport.durationSec > 0) parts.push(formatDuration(transport.durationSec));
  if (transport.distanceM > 0) parts.push(formatDistance(transport.distanceM));
  if (transport.fareAmount && transport.fareAmount > 0) parts.push(`${transport.fareCurrency ?? ""} ${transport.fareAmount.toLocaleString()}`);
  if (transport.transitLine) parts.push(transport.transitLine);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2mm", padding: "1.5mm 0 1.5mm 22mm", color: "#666", fontSize: "8pt" }}>
      <Icon size={11} strokeWidth={1.6} />
      <span>{parts.join(" · ")}</span>
    </div>
  );
}

function CostPage({ trip, dims: _ }: { trip: PdfTripData; dims: { w: number; h: number } }) {
  const total = trip.totalCost;
  const cb = trip.costBreakdown;
  const items = [
    { label: "餐飲", amount: cb.food },
    { label: "住宿", amount: cb.lodging },
    { label: "交通", amount: cb.transport },
    { label: "票卷", amount: cb.ticket },
    { label: "其他", amount: cb.misc },
  ];
  return (
    <section className="print-page">
      <p style={{ fontSize: "9pt", letterSpacing: "0.18em", color: "#666", textTransform: "uppercase" }}>Cost Summary</p>
      <h2 style={{ fontSize: "20pt", fontWeight: 600, marginTop: "2mm", marginBottom: "8mm" }}>費用總表</h2>
      <div style={{ borderTop: "1px solid #d4d4d8", borderBottom: "1px solid #d4d4d8", padding: "6mm 0", marginBottom: "6mm" }}>
        <p style={{ fontSize: "9pt", color: "#666" }}>本方案總計（換算 {trip.baseCurrency}）</p>
        <p style={{ fontSize: "30pt", fontWeight: 600, marginTop: "2mm" }}>
          {trip.baseCurrency} {Math.round(total).toLocaleString()}
        </p>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((row) => (
          <li key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "3mm 0", borderBottom: "1px solid #e5e5e5", fontSize: "11pt" }}>
            <span>{row.label}</span>
            <span style={{ fontFamily: "ui-monospace, monospace" }}>{trip.baseCurrency} {Math.round(row.amount).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TicketsPage({ trip, dims: _ }: { trip: PdfTripData; dims: { w: number; h: number } }) {
  return (
    <section className="print-page">
      <p style={{ fontSize: "9pt", letterSpacing: "0.18em", color: "#666", textTransform: "uppercase" }}>Tickets</p>
      <h2 style={{ fontSize: "20pt", fontWeight: 600, marginTop: "2mm", marginBottom: "8mm" }}>票券附頁</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {trip.tickets.map((t) => (
          <li key={t.id} style={{ borderBottom: "1px solid #e5e5e5", padding: "3mm 0", display: "flex", justifyContent: "space-between", gap: "4mm" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "11pt", fontWeight: 600 }}>{t.title}</p>
              {t.placeName && <p style={{ fontSize: "9pt", color: "#666" }}>{t.placeName} · Day {t.dayIndex}</p>}
              {t.bookingRef && <p style={{ fontSize: "9pt", color: "#444", fontFamily: "ui-monospace, monospace" }}>{t.bookingRef}</p>}
            </div>
            <div style={{ textAlign: "right", fontFamily: "ui-monospace, monospace", fontSize: "10pt" }}>
              {t.currency} {t.price.toLocaleString()}
              {t.quantity > 1 && <p style={{ fontSize: "8pt", color: "#666" }}>× {t.quantity}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Phase 14n — overview page listing all places by day. Skips a real map
// image (Static Maps would need server-side fetch + key) in favour of a
// printable place index that complements the day-by-day pages.
function TripMapPage({ trip, dims: _ }: { trip: PdfTripData; dims: { w: number; h: number } }) {
  const dayColors = [
    "#3b82f6", "#fb923c", "#f472b6", "#a78bfa", "#34d399",
    "#f59e0b", "#64748b", "#10b981", "#ef4444", "#0ea5e9",
  ];
  return (
    <section className="print-page">
      <p style={{ fontSize: "9pt", letterSpacing: "0.18em", color: "#666", textTransform: "uppercase" }}>Trip Overview</p>
      <h2 style={{ fontSize: "20pt", fontWeight: 600, marginTop: "2mm", marginBottom: "6mm" }}>全趟行程一覽</h2>
      <div style={{ borderTop: "1px solid #d4d4d8", paddingTop: "4mm" }}>
        {trip.days.map((d, i) => {
          const color = dayColors[i % dayColors.length];
          const placeNames = d.items
            .map((it) => (it.placeId ? trip.places[it.placeId]?.name : null))
            .filter((n): n is string => !!n);
          return (
            <div key={d.id} style={{ marginBottom: "4mm", paddingBottom: "3mm", borderBottom: "1px solid #e5e5e5" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: "4mm",
                    height: "4mm",
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <p style={{ fontSize: "11pt", fontWeight: 600 }}>
                  Day {d.dayIndex} · {d.date}（週{d.weekday}）
                </p>
                <p style={{ fontSize: "9pt", color: "#888", marginLeft: "auto" }}>{placeNames.length} 站</p>
              </div>
              {placeNames.length > 0 && (
                <p style={{ fontSize: "9pt", color: "#444", marginTop: "1.5mm", paddingLeft: "7mm", lineHeight: 1.6 }}>
                  {placeNames.join(" → ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: "8pt", color: "#888", marginTop: "4mm", textAlign: "right" }}>
        總共 {trip.days.reduce((s, d) => s + d.items.length, 0)} 個行程點 · {trip.totalDistanceKm.toFixed(0)} km
      </p>
    </section>
  );
}

// Phase 14n — generic AI section page (PRE_TRIP_NOTES / PACKING_CHECKLIST).
// Each section has a Chinese + English title and bilingual bullets;
// checklist mode shows an unchecked square in front of each line.
function AiPage({
  title,
  subtitle,
  sections,
  dims: _,
  checklist,
}: {
  title: string;
  subtitle: string;
  sections: PdfTripData["ai"];
  dims: { w: number; h: number };
  checklist?: boolean;
}) {
  return (
    <section className="print-page">
      <p style={{ fontSize: "9pt", letterSpacing: "0.18em", color: "#666", textTransform: "uppercase" }}>{subtitle}</p>
      <h2 style={{ fontSize: "20pt", fontWeight: 600, marginTop: "2mm", marginBottom: "6mm" }}>{title}</h2>
      {sections.map((s, i) => (
        <div key={i} style={{ marginBottom: "5mm", borderTop: i === 0 ? "1px solid #d4d4d8" : "none", paddingTop: i === 0 ? "4mm" : 0 }}>
          <h3 style={{ fontSize: "12pt", fontWeight: 600 }}>
            {s.zhTitle}
            <span style={{ fontWeight: 400, color: "#888", marginLeft: "2mm", fontSize: "10pt" }}>{s.enTitle}</span>
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: "2mm 0 0 0" }}>
            {s.bullets.map((b, j) => (
              <li key={j} style={{ display: "flex", gap: "2.5mm", padding: "1.5mm 0", borderBottom: "1px solid #f4f4f5" }}>
                {checklist ? (
                  <span style={{ display: "inline-block", width: "3.5mm", height: "3.5mm", border: "1px solid #888", flexShrink: 0, marginTop: "1mm" }} />
                ) : (
                  <span style={{ color: "#888", flexShrink: 0 }}>·</span>
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: "10pt", color: "#0a0a0a" }}>{b.zh}</p>
                  {b.en && <p style={{ fontSize: "8pt", color: "#888", marginTop: "0.5mm" }}>{b.en}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function BackCoverPage({ trip, dims: _ }: { trip: PdfTripData; dims: { w: number; h: number } }) {
  return (
    <section className="print-page" style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ borderTop: "1px solid #d4d4d8", paddingTop: "6mm" }}>
        <p style={{ fontSize: "9pt", letterSpacing: "0.18em", color: "#888", textTransform: "uppercase" }}>End of Handbook</p>
        <p style={{ fontSize: "12pt", color: "#0a0a0a", marginTop: "2mm" }}>{trip.title}</p>
        <p style={{ fontSize: "9pt", color: "#666", marginTop: "2mm" }}>由「旅遊規劃 Z」產出</p>
      </div>
    </section>
  );
}
