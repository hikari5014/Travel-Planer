import {
  Plane,
  Hotel,
  UtensilsCrossed,
  Camera,
  Car,
  CarFront,
  Coffee,
  MapPin,
  ParkingCircle,
  Train,
  Bus,
  Footprints,
  Bike,
  ExternalLink,
} from "lucide-react";
import type {
  PdfPlace,
  PdfScheduleItem,
  PdfTransport,
  PdfTripData,
} from "@/lib/services/pdf-data-service";

// Phase 14k — public mobile-first travel handbook. Mirrors the PDF content
// but tailored for phone-screen reading + one-tap Google Maps navigation.

type TripView = PdfTripData;

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

function googleMapsLink(place: PdfPlace | undefined): string | null {
  if (!place) return null;
  const name = encodeURIComponent(place.name);
  // Google Place IDs: real Google ones don't start with "local-"/"airport-".
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

export function HandbookView({ trip }: { trip: TripView }) {
  return (
    <div className="min-h-screen bg-canvas pb-12">
      <CoverHero trip={trip} />
      <div className="mx-auto max-w-screen-sm px-4">
        {trip.days.map((day) => (
          <DaySection key={day.id} day={day} places={trip.places} baseCurrency={trip.baseCurrency} />
        ))}
        <Footer />
      </div>
    </div>
  );
}

function CoverHero({ trip }: { trip: TripView }) {
  return (
    <header className="bg-surface-dark px-4 pb-8 pt-10 text-on-primary">
      <div className="mx-auto max-w-screen-sm">
        <p className="text-[11px] uppercase tracking-[0.18em] text-on-primary/60">旅遊手冊</p>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight">{trip.title}</h1>
        {trip.subtitle && (
          <p className="mt-1 text-[14px] text-on-primary/80">{trip.subtitle}</p>
        )}
        <p className="mt-4 text-[13px] text-on-primary/70">
          {trip.destination ? `${trip.destination} · ` : ""}
          {trip.startDate} ~ {trip.endDate} · {trip.totalDays} 天
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-on-primary/60">
          <span>{trip.days.reduce((s, d) => s + d.items.length, 0)} 個行程點</span>
          <span>·</span>
          <span>{trip.totalDistanceKm.toFixed(0)} km 總距離</span>
        </div>
      </div>
    </header>
  );
}

function DaySection({
  day,
  places,
  baseCurrency,
}: {
  day: PdfTripData["days"][number];
  places: Record<string, PdfPlace>;
  baseCurrency: string;
}) {
  const allDay = day.items.filter((i) => i.isAllDay);
  const timed = day.items.filter((i) => !i.isAllDay);
  const transportsByFrom = new Map(day.transports.map((t) => [t.fromItemId, t]));
  return (
    <section className="border-t border-hairline pt-6 first:border-t-0 first:pt-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[20px] font-semibold text-ink">
          DAY {day.dayIndex} · {day.date}
        </h2>
        <span className="text-[12px] text-muted">{day.weekday}</span>
      </div>
      {allDay.length > 0 && (
        <div className="mb-4 space-y-2">
          {allDay.map((it) => (
            <ItemCard key={it.id} item={it} place={it.placeId ? places[it.placeId] : undefined} baseCurrency={baseCurrency} compact />
          ))}
        </div>
      )}
      {timed.length === 0 && allDay.length === 0 && (
        <p className="text-[13px] text-muted-soft">這天沒有安排行程</p>
      )}
      {timed.map((it, idx) => {
        const next = timed[idx + 1];
        const transport = transportsByFrom.get(it.id);
        const place = it.placeId ? places[it.placeId] : undefined;
        return (
          <div key={it.id}>
            <ItemCard item={it} place={place} baseCurrency={baseCurrency} />
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

function ItemCard({
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
  const meta = item.metadata as Record<string, unknown> | null;
  const mapLink = googleMapsLink(place);
  return (
    <article className="mb-3 overflow-hidden rounded-lg border border-hairline bg-surface-card">
      <div className="flex items-start gap-3 p-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-surface-soft">
          <Icon size={18} strokeWidth={1.8} className="text-ink" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-soft">
              {KIND_LABEL[item.kind] ?? item.kind}
            </span>
            {!compact && (
              <span className="font-mono text-[12px] text-muted">
                {item.startTime}{item.durationMin > 0 ? `–${item.endTime}` : ""}
              </span>
            )}
          </div>
          <h3 className="mt-0.5 truncate text-[16px] font-semibold text-ink">
            {place?.name ?? "—"}
          </h3>
          {place?.address && (
            <p className="mt-0.5 truncate text-[12px] text-muted">{place.address}</p>
          )}
          {place && place.rating > 0 && (
            <p className="mt-0.5 text-[12px] text-muted-soft">
              ★ {place.rating.toFixed(1)}
            </p>
          )}
        </div>
        {mapLink && (
          <a
            href={mapLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-on-primary"
          >
            <MapPin size={14} strokeWidth={2} />
            導航
          </a>
        )}
      </div>
      {meta && <ItemMetaBlock kind={item.kind} meta={meta} baseCurrency={baseCurrency} />}
      {item.note && (
        <div className="border-t border-hairline-soft bg-surface-soft px-3 py-2 text-[12px] text-ink">
          {item.note}
        </div>
      )}
    </article>
  );
}

function ItemMetaBlock({
  kind,
  meta,
  baseCurrency,
}: {
  kind: string;
  meta: Record<string, unknown>;
  baseCurrency: string;
}) {
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const bool = (v: unknown): boolean => v === true;
  const cur = (v: unknown) => str(v) ?? baseCurrency;
  const money = (a: number, c: string) => `${c} ${Math.round(a).toLocaleString()}`;

  const rows: Array<{ label: string; value: React.ReactNode }> = [];

  if (kind === "FLIGHT") {
    if (str(meta.flightNumber) || str(meta.airline)) {
      rows.push({
        label: "航班",
        value: `${str(meta.flightNumber) ?? ""} ${str(meta.airline) ?? ""}`.trim(),
      });
    }
    if (str(meta.depAirport) && str(meta.arrAirport)) {
      rows.push({ label: "航線", value: `${str(meta.depAirport)} → ${str(meta.arrAirport)}` });
    }
    if (str(meta.depTime) && str(meta.arrTime)) {
      rows.push({ label: "時刻", value: `${str(meta.depTime)} → ${str(meta.arrTime)}` });
    }
    if (str(meta.terminal)) rows.push({ label: "航廈", value: str(meta.terminal)! });
    if (str(meta.seatNumber)) rows.push({ label: "座位", value: str(meta.seatNumber)! });
    if (str(meta.bookingRef)) rows.push({ label: "PNR", value: str(meta.bookingRef)! });
    if (num(meta.ticketPrice)) {
      rows.push({ label: "機票", value: money(num(meta.ticketPrice)!, cur(meta.ticketCurrency)) });
    }
  } else if (kind === "LODGING") {
    if (num(meta.totalCost) && num(meta.nights)) {
      rows.push({
        label: "總價",
        value: `${money(num(meta.totalCost)!, cur(meta.ticketCurrency))} (${num(meta.nights)} 晚)`,
      });
    } else if (num(meta.totalCost)) {
      rows.push({ label: "總價", value: money(num(meta.totalCost)!, cur(meta.ticketCurrency)) });
    }
    if (str(meta.checkInTime) || str(meta.checkOutTime)) {
      rows.push({
        label: "入退房",
        value: `${str(meta.checkInTime) ?? "—"} / ${str(meta.checkOutTime) ?? "—"}`,
      });
    }
    if (str(meta.bookingRef)) rows.push({ label: "訂房", value: str(meta.bookingRef)! });
    if (bool(meta.breakfastIncluded)) rows.push({ label: "早餐", value: "含" });
    if (str(meta.wifiPassword)) rows.push({ label: "Wi-Fi", value: str(meta.wifiPassword)! });
  } else if (kind === "MEAL") {
    if (num(meta.averagePrice) && num(meta.partySize)) {
      const total = num(meta.averagePrice)! * num(meta.partySize)!;
      rows.push({
        label: "費用",
        value: `${money(total, cur(meta.ticketCurrency))} (${num(meta.partySize)} 人)`,
      });
    }
    if (str(meta.cuisine)) rows.push({ label: "菜系", value: str(meta.cuisine)! });
    if (str(meta.reservationRef)) rows.push({ label: "訂位", value: str(meta.reservationRef)! });
    if (str(meta.mustTry)) rows.push({ label: "推薦", value: str(meta.mustTry)! });
  } else if (kind === "ATTRACTION") {
    const tickets = Array.isArray(meta.tickets)
      ? (meta.tickets as Array<{ label?: string; unitPrice?: number; quantity?: number }>)
      : null;
    if (tickets && tickets.length > 0) {
      const total = tickets.reduce((s, t) => s + (t.unitPrice ?? 0) * (t.quantity ?? 0), 0);
      if (total > 0) {
        rows.push({ label: "票價", value: money(total, cur(meta.ticketCurrency)) });
      }
    }
    if (str(meta.openingHours)) rows.push({ label: "開放", value: str(meta.openingHours)! });
    if (str(meta.highlights)) rows.push({ label: "重點", value: str(meta.highlights)! });
  } else if (kind === "CAR_RENTAL") {
    if (str(meta.vendor) || str(meta.carModel)) {
      rows.push({
        label: "車輛",
        value: `${str(meta.vendor) ?? ""} ${str(meta.carModel) ?? ""}`.trim(),
      });
    }
    if (num(meta.totalCost)) {
      rows.push({ label: "費用", value: money(num(meta.totalCost)!, cur(meta.ticketCurrency)) });
    }
    if (str(meta.bookingRef)) rows.push({ label: "訂位", value: str(meta.bookingRef)! });
    if (str(meta.pickupTime) || str(meta.returnTime)) {
      rows.push({
        label: "取/還",
        value: `${str(meta.pickupTime) ?? "—"} / ${str(meta.returnTime) ?? "—"}`,
      });
    }
  } else if (kind === "FREE") {
    if (str(meta.plan)) rows.push({ label: "計劃", value: str(meta.plan)! });
    if (num(meta.budget)) {
      rows.push({ label: "預算", value: money(num(meta.budget)!, cur(meta.ticketCurrency)) });
    }
  }

  if (rows.length === 0) return null;
  return (
    <dl className="border-t border-hairline-soft bg-canvas px-3 py-2 text-[13px]">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-3 py-0.5">
          <dt className="w-16 flex-shrink-0 text-muted-soft">{r.label}</dt>
          <dd className="flex-1 text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TransportLine({
  transport,
  fromPlace,
  toPlace,
}: {
  transport: PdfTransport;
  fromPlace: PdfPlace | undefined;
  toPlace: PdfPlace | undefined;
}) {
  const Icon = MODE_ICON[transport.mode] ?? Footprints;
  const label = MODE_LABEL[transport.mode] ?? transport.mode;
  const parts: string[] = [label];
  if (transport.durationSec > 0) parts.push(formatDuration(transport.durationSec));
  if (transport.distanceM > 0) parts.push(formatDistance(transport.distanceM));
  if (transport.fareAmount && transport.fareAmount > 0) {
    parts.push(`${transport.fareCurrency ?? ""} ${transport.fareAmount.toLocaleString()}`);
  }
  if (transport.transitLine) parts.push(transport.transitLine);

  // Find parking info from cached transport details (not in PdfTransport
  // directly; surfaced via notes when set in editor).
  const parkingNote = (transport as unknown as { parkingPlaceName?: string | null; parkingPlaceId?: string | null }).parkingPlaceName ?? null;

  // Multi-mode → render each transit step with its line + dep/arr stops.
  return (
    <div className="ml-12 mb-3 border-l-2 border-dashed border-hairline-soft pl-4">
      <div className="flex items-center gap-2 py-1 text-[12px] text-muted">
        <Icon size={13} strokeWidth={1.8} />
        <span>{parts.join(" · ")}</span>
      </div>
      {transport.transitStepsCanonical && transport.transitStepsCanonical.steps.length > 0 && (
        <ol className="mt-1 space-y-0.5 text-[11px] text-muted-soft">
          {transport.transitStepsCanonical.steps.slice(0, 6).map((s, i) => (
            <li key={i}>
              {s.kind === "ride"
                ? `${s.lineName} · ${s.fromStation} → ${s.toStation}`
                : `步行 ${formatDuration(s.durationSec ?? 0)}`}
            </li>
          ))}
        </ol>
      )}
      {parkingNote && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parkingNote)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 rounded bg-surface-soft px-2 py-0.5 text-[11px] text-ink"
        >
          <ParkingCircle size={11} strokeWidth={1.8} />
          停車：{parkingNote}
          <ExternalLink size={9} strokeWidth={1.8} />
        </a>
      )}
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-hairline pt-6 text-center text-[11px] text-muted-soft">
      <p>由「旅遊規劃 Z」產出 · 唯讀分享</p>
    </footer>
  );
}
