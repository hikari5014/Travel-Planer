"use client";

import {
  Plane,
  Hotel,
  UtensilsCrossed,
  Ticket,
  Car,
  Coffee,
  Wifi,
  Footprints,
  Fuel,
} from "lucide-react";

// Phase 14d/14e — render a kind-specific "at a glance" summary for any
// ScheduleItem with metadataJson. Used by:
//   - FloatingPlaceCard overview tab (Hero 下方一塊)
//   - ScheduleListView row 旁邊的 inline summary (compact mode)
// The component is read-only display; editing happens in FloatingPlaceCard's
// notes tab via KindMetadataForm.

type AnyMeta = Record<string, unknown>;

type Props = {
  kind: string;
  metadata: AnyMeta | null | undefined;
  // "card" = full block (used in FloatingPlaceCard); "row" = single-line
  // condensed version (used in list view).
  variant?: "card" | "row";
  // If the item has all-day items (typically LODGING), surface 入退住 dates.
  itemContext?: { isAllDay?: boolean; startTime?: string; endTime?: string };
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function fmtMoney(amount: number, currency?: string | null) {
  return `${currency ?? ""} ${Math.round(amount).toLocaleString()}`.trim();
}

export function KindSummaryBlock({ kind, metadata, variant = "card" }: Props) {
  if (!metadata) return null;
  const m = metadata;

  if (kind === "FLIGHT") return <FlightSummaryBlock m={m} variant={variant} />;
  if (kind === "LODGING") return <LodgingSummaryBlock m={m} variant={variant} />;
  if (kind === "MEAL") return <MealSummaryBlock m={m} variant={variant} />;
  if (kind === "ATTRACTION") return <AttractionSummaryBlock m={m} variant={variant} />;
  if (kind === "CAR_RENTAL") return <CarRentalSummaryBlock m={m} variant={variant} />;
  if (kind === "FREE") return <FreeSummaryBlock m={m} variant={variant} />;
  if (kind === "TRANSPORT_STOP") return <StopSummaryBlock m={m} variant={variant} />;
  return null;
}

// ─── FLIGHT ────────────────────────────────────────────────────────────────
function FlightSummaryBlock({ m, variant }: { m: AnyMeta; variant: "card" | "row" }) {
  const fn = str(m.flightNumber);
  const airline = str(m.airline);
  const dep = str(m.depAirport);
  const arr = str(m.arrAirport);
  const depT = str(m.depTime);
  const arrT = str(m.arrTime);
  const price = num(m.ticketPrice);
  const cur = str(m.ticketCurrency) ?? str(m.currency);
  const seat = str(m.seatNumber);
  const pnr = str(m.bookingRef);

  if (variant === "row") {
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <Plane size={11} className="text-brand-accent" />
        {fn && <span className="font-mono text-ink">{fn}</span>}
        {airline && <span className="text-muted">{airline}</span>}
        {dep && arr && <span className="font-mono text-ink">· {dep} → {arr}</span>}
        {depT && arrT && <span className="font-mono text-muted">· {depT}–{arrT}</span>}
      </span>
    );
  }
  return (
    <Block icon={<Plane size={13} className="text-brand-accent" />} title="飛航資訊">
      {fn && <Row label="航班">{fn} {airline ? <span className="text-muted">· {airline}</span> : null}</Row>}
      {dep && arr && <Row label="航線">{dep} → {arr}</Row>}
      {depT && arrT && <Row label="時刻">{depT} → {arrT} <span className="text-muted-soft">當地時間</span></Row>}
      {str(m.terminal) && <Row label="航廈">{str(m.terminal)}</Row>}
      {seat && <Row label="座位">{seat}</Row>}
      {pnr && <Row label="PNR">{pnr}</Row>}
      {price != null && <Row label="機票">{fmtMoney(price, cur)}</Row>}
      {str(m.aircraftType) && <Row label="機型">{str(m.aircraftType)}</Row>}
      {str(m.baggageAllowance) && <Row label="行李">{str(m.baggageAllowance)}</Row>}
      {str(m.mealNote) && <Row label="餐食">{str(m.mealNote)}</Row>}
    </Block>
  );
}

// ─── LODGING ───────────────────────────────────────────────────────────────
function LodgingSummaryBlock({ m, variant }: { m: AnyMeta; variant: "card" | "row" }) {
  const nights = num(m.nights);
  const total = num(m.totalCost);
  const cur = str(m.ticketCurrency) ?? str(m.currency);
  const guests = num(m.guestCount) ?? 1;
  const perNight = nights && total ? Math.round(total / nights) : null;
  const perPerNight = nights && total && guests ? Math.round(total / nights / guests) : null;
  const platform = str(m.bookingPlatform);
  const ref = str(m.bookingRef);

  if (variant === "row") {
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <Hotel size={11} className="text-success" />
        {nights && <span className="text-ink">{nights} 晚</span>}
        {total != null && <span className="font-mono text-ink">{fmtMoney(total, cur)}</span>}
        {platform && <span className="text-muted">· {platform}</span>}
        {ref && <span className="font-mono text-muted-soft">{ref}</span>}
      </span>
    );
  }
  return (
    <Block icon={<Hotel size={13} className="text-success" />} title="住宿資訊">
      {nights && <Row label="總共">{nights} 晚 {bool(m.isFirstNight) ? "（本筆為入住第 1 晚）" : (num(m.nightIndex) ? `（本筆為第 ${num(m.nightIndex)} 晚）` : "")}</Row>}
      {total != null && (
        <div className="mt-1.5 mb-1">
          <span className="font-display text-[24px] leading-none text-ink">{fmtMoney(total, cur)}</span>
          {(perNight != null || perPerNight != null) && (
            <div className="mt-0.5 text-[10px] text-muted-soft">
              {perNight != null && <>每晚 {fmtMoney(perNight, cur)}</>}
              {perNight != null && perPerNight != null && <> · </>}
              {perPerNight != null && <>每人每晚 {fmtMoney(perPerNight, cur)}（{guests} 人）</>}
            </div>
          )}
        </div>
      )}
      {(str(m.checkInTime) || str(m.checkOutTime)) && (
        <Row label="時間">
          入住 {str(m.checkInTime) ?? "—"} · 退房 {str(m.checkOutTime) ?? "—"}
        </Row>
      )}
      {platform && <Row label="平台">{platform}</Row>}
      {ref && <Row label="訂房">{ref}</Row>}
      {bool(m.breakfastIncluded) && <Row label="早餐">含</Row>}
      {bool(m.parkingAvailable) && (
        <Row label="停車">
          有
          {num(m.parkingFeePerNight) != null && num(m.parkingFeePerNight)! > 0
            ? `（${fmtMoney(num(m.parkingFeePerNight)!, cur)} / 晚）`
            : "（含房價）"}
        </Row>
      )}
      {str(m.wifiPassword) && (
        <Row label={<><Wifi size={10} className="-mt-0.5 inline" /> Wi-Fi</>}>
          <span className="font-mono">{str(m.wifiPassword)}</span>
        </Row>
      )}
      {str(m.cancellationPolicy) && <Row label="退訂">{str(m.cancellationPolicy)}</Row>}
    </Block>
  );
}

// ─── MEAL ──────────────────────────────────────────────────────────────────
function MealSummaryBlock({ m, variant }: { m: AnyMeta; variant: "card" | "row" }) {
  const period = str(m.mealPeriod);
  const periodLabel =
    period === "BREAKFAST" ? "早餐" :
    period === "LUNCH" ? "午餐" :
    period === "DINNER" ? "晚餐" :
    period === "LATE_NIGHT" ? "宵夜" : null;
  const avg = num(m.averagePrice);
  const party = num(m.partySize);
  const total = avg && party ? avg * party : null;
  const cur = str(m.ticketCurrency) ?? str(m.currency);

  if (variant === "row") {
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <UtensilsCrossed size={11} className="text-badge-pink" />
        {periodLabel && <span className="text-ink">{periodLabel}</span>}
        {avg != null && <span className="font-mono text-muted">人均 {fmtMoney(avg, cur)}</span>}
        {party && <span className="text-muted-soft">× {party} 人</span>}
      </span>
    );
  }
  return (
    <Block icon={<UtensilsCrossed size={13} className="text-badge-pink" />} title="餐飲資訊">
      {periodLabel && <Row label="時段">{periodLabel}</Row>}
      {str(m.cuisine) && <Row label="菜系">{str(m.cuisine)}</Row>}
      {avg != null && (
        <Row label="人均">
          {fmtMoney(avg, cur)}
          {party ? <> × {party} 人 = <span className="font-mono text-ink">{fmtMoney(total ?? 0, cur)}</span></> : null}
        </Row>
      )}
      {str(m.reservationRef) && <Row label="訂位">{str(m.reservationRef)}</Row>}
      {str(m.reservationPlatform) && <Row label="平台">{str(m.reservationPlatform)}</Row>}
      {str(m.mustTry) && (
        <Row label="必點">
          <div className="text-[11px]">
            {str(m.mustTry)!.split("\n").map((line, i) => (
              <div key={i}>· {line}</div>
            ))}
          </div>
        </Row>
      )}
      {str(m.specialRequests) && <Row label="特殊">{str(m.specialRequests)}</Row>}
    </Block>
  );
}

// ─── ATTRACTION ────────────────────────────────────────────────────────────
function AttractionSummaryBlock({ m, variant }: { m: AnyMeta; variant: "card" | "row" }) {
  const tickets = Array.isArray(m.tickets)
    ? (m.tickets as Array<{ label?: string; unitPrice?: number; quantity?: number }>)
    : null;
  const cur = str(m.ticketCurrency);
  const total =
    tickets && tickets.length > 0
      ? tickets.reduce((s, t) => s + (Number(t.unitPrice) || 0) * (Number(t.quantity) || 0), 0)
      : num(m.ticketPrice) ?? 0;
  const dur = num(m.expectedDurationMin);

  if (variant === "row") {
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <Ticket size={11} className="text-badge-orange" />
        {dur && <span className="text-muted">滯留 {dur} 分</span>}
        {total > 0 && <span className="font-mono text-ink">{fmtMoney(total, cur)}</span>}
      </span>
    );
  }
  return (
    <Block icon={<Ticket size={13} className="text-badge-orange" />} title="景點資訊">
      {dur && <Row label="滯留">{dur} 分鐘</Row>}
      {bool(m.reservationRequired) && <Row label="預約">需預約 {str(m.bookingRef) ?? ""}</Row>}
      {tickets && tickets.length > 0 && (
        <div className="mt-1.5">
          <div className="text-caption text-muted-soft">票價</div>
          {tickets.map((t, i) => {
            const p = Number(t.unitPrice) || 0;
            const q = Number(t.quantity) || 0;
            return (
              <div key={i} className="flex justify-between text-[11px]">
                <span className="text-ink">{t.label ?? "票券"}</span>
                <span className="font-mono text-muted">
                  {fmtMoney(p, cur)} × {q} = <span className="text-ink">{fmtMoney(p * q, cur)}</span>
                </span>
              </div>
            );
          })}
          <div className="mt-1 border-t border-hairline-soft pt-1 text-right text-body-sm font-mono text-ink">
            合計 {fmtMoney(total, cur)}
          </div>
        </div>
      )}
      {!tickets && total > 0 && <Row label="票價">{fmtMoney(total, cur)}</Row>}
      {str(m.openingHours) && <Row label="開放">{str(m.openingHours)}</Row>}
      {str(m.highlights) && (
        <Row label="重點">
          <div>
            {str(m.highlights)!.split("\n").map((line, i) => (
              <div key={i}>· {line}</div>
            ))}
          </div>
        </Row>
      )}
    </Block>
  );
}

// ─── CAR_RENTAL ────────────────────────────────────────────────────────────
function CarRentalSummaryBlock({ m, variant }: { m: AnyMeta; variant: "card" | "row" }) {
  const role = str(m.segmentRole);
  const days = num(m.rentalDays);
  const total = num(m.totalCost);
  const cur = str(m.ticketCurrency) ?? str(m.currency);
  const vendor = str(m.vendor);

  if (variant === "row") {
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <Car size={11} className="text-warning" />
        <span className="text-ink">{role === "RETURN" ? "還車" : "取車"}</span>
        {vendor && <span className="text-muted">{vendor}</span>}
        {days && <span className="text-muted-soft">· {days} 天</span>}
        {total != null && role !== "RETURN" && <span className="font-mono text-ink">{fmtMoney(total, cur)}</span>}
      </span>
    );
  }
  return (
    <Block icon={<Car size={13} className="text-warning" />} title={role === "RETURN" ? "還車" : "取車"}>
      {vendor && <Row label="租車公司">{vendor}</Row>}
      {str(m.carModel) && <Row label="車型">{str(m.carModel)}</Row>}
      {str(m.bookingRef) && <Row label="訂位代號">{str(m.bookingRef)}</Row>}
      {(str(m.pickupDate) || str(m.pickupTime)) && (
        <Row label="取車">{str(m.pickupDate)} {str(m.pickupTime)} {str(m.pickupLocation) ? `· ${str(m.pickupLocation)}` : ""}</Row>
      )}
      {(str(m.returnDate) || str(m.returnTime)) && (
        <Row label="還車">{str(m.returnDate)} {str(m.returnTime)} {str(m.returnLocation) ? `· ${str(m.returnLocation)}` : ""}</Row>
      )}
      {num(m.dailyRate) != null && days && (
        <Row label="租金">
          {fmtMoney(num(m.dailyRate)!, cur)} / 天 × {days} 天
        </Row>
      )}
      {num(m.insurancePerDay) != null && num(m.insurancePerDay)! > 0 && (
        <Row label={`保險（${str(m.insuranceTier) ?? ""}）`}>
          <Fuel size={10} className="mr-0.5 inline" />
          {fmtMoney(num(m.insurancePerDay)!, cur)} / 天
        </Row>
      )}
      {str(m.fuelPolicy) && <Row label="加油">
        {str(m.fuelPolicy) === "FULL_TO_FULL" ? "滿油還" :
         str(m.fuelPolicy) === "FULL_TO_EMPTY" ? "同油位還" :
         str(m.fuelPolicy) === "PRE_PURCHASED" ? "預購油" : "其他"}
      </Row>}
      {str(m.addOns) && <Row label="加裝">{str(m.addOns)}</Row>}
      {total != null && role !== "RETURN" && (
        <div className="mt-1.5 border-t border-hairline-soft pt-1.5 text-right">
          <span className="font-display text-[20px] leading-none text-ink">{fmtMoney(total, cur)}</span>
          <span className="ml-2 text-[10px] text-muted-soft">總費用</span>
        </div>
      )}
      {str(m.driverLicense) && <Row label="駕照">{str(m.driverLicense)}</Row>}
    </Block>
  );
}

// ─── FREE ──────────────────────────────────────────────────────────────────
function FreeSummaryBlock({ m, variant }: { m: AnyMeta; variant: "card" | "row" }) {
  const budget = num(m.budget);
  const cur = str(m.ticketCurrency) ?? str(m.currency);
  if (variant === "row") {
    if (budget == null) return null;
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <Coffee size={11} className="text-muted" />
        <span className="font-mono text-muted">預算 {fmtMoney(budget, cur)}</span>
      </span>
    );
  }
  return (
    <Block icon={<Coffee size={13} className="text-muted" />} title="自由時間">
      {str(m.plan) && <Row label="計劃">{str(m.plan)}</Row>}
      {budget != null && <Row label="預算">{fmtMoney(budget, cur)}</Row>}
      {str(m.alternativePlan) && <Row label="備案">{str(m.alternativePlan)}</Row>}
    </Block>
  );
}

// ─── TRANSPORT_STOP ────────────────────────────────────────────────────────
function StopSummaryBlock({ m, variant }: { m: AnyMeta; variant: "card" | "row" }) {
  const purpose = str(m.purpose);
  const derived = str(m.derivedFrom);
  if (variant === "row") {
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <Footprints size={11} className="text-muted-soft" />
        {purpose && <span className="text-muted">{purpose}</span>}
        {derived === "FLIGHT_CHECKIN" && <span className="text-brand-accent">機場 check-in</span>}
        {derived === "FLIGHT_IMMIGRATION" && <span className="text-brand-accent">入境取行李</span>}
      </span>
    );
  }
  return (
    <Block icon={<Footprints size={13} className="text-muted-soft" />} title="中繼">
      {purpose && <Row label="用途">{purpose}</Row>}
      {derived === "FLIGHT_CHECKIN" && <Row label="衍生">機場 check-in（飛航緩衝）</Row>}
      {derived === "FLIGHT_IMMIGRATION" && <Row label="衍生">入境 / 取行李（飛航緩衝）</Row>}
    </Block>
  );
}

// ─── shared bits ────────────────────────────────────────────────────────────
function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-md border border-hairline-soft bg-surface-soft p-3">
      <div className="flex items-center gap-1.5 text-caption-uppercase text-muted-soft">
        {icon} {title}
      </div>
      <div className="space-y-0.5 text-[11px]">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-14 flex-shrink-0 text-muted-soft">{label}</span>
      <span className="text-ink">{children}</span>
    </div>
  );
}
