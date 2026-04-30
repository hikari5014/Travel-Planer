"use client";

import type { ScheduleKind } from "@/lib/mock-schedule";
import type {
  AttractionMetadata,
  CarRentalMetadata,
  FlightMetadata,
  FreeMetadata,
  LodgingMetadata,
  MealMetadata,
  TrainMetadata,
  TransportStopMetadata,
} from "@/lib/schedule-item-metadata";

// Phase 10c — kind-aware metadata editor.
// Each kind renders a distinct set of fields. Missing values are nullable;
// the parent dialog passes the parsed metadata + onChange callback.

type AnyMeta = Record<string, unknown>;

export function KindMetadataForm({
  kind,
  value,
  onChange,
  baseCurrency,
}: {
  kind: ScheduleKind;
  value: AnyMeta;
  onChange: (next: AnyMeta) => void;
  baseCurrency: string;
}) {
  function set<K extends string>(key: K, v: unknown) {
    onChange({ ...value, [key]: v === "" ? null : v });
  }

  switch (kind) {
    case "ATTRACTION":
      return <AttractionFields v={value as AttractionMetadata} set={set} baseCurrency={baseCurrency} />;
    case "MEAL":
      return <MealFields v={value as MealMetadata} set={set} baseCurrency={baseCurrency} />;
    case "LODGING":
      return <LodgingFields v={value as LodgingMetadata} set={set} baseCurrency={baseCurrency} />;
    case "CAR_RENTAL":
      return <CarRentalFields v={value as CarRentalMetadata} set={set} baseCurrency={baseCurrency} />;
    case "FLIGHT":
      return <FlightFields v={value as FlightMetadata} set={set} baseCurrency={baseCurrency} />;
    case "TRAIN":
      return <TrainFields v={value as TrainMetadata} set={set} baseCurrency={baseCurrency} />;
    case "FREE":
      return <FreeFields v={value as FreeMetadata} set={set} baseCurrency={baseCurrency} />;
    case "TRANSPORT_STOP":
      return <TransportStopFields v={value as TransportStopMetadata} set={set} />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Common helpers
// ─────────────────────────────────────────────────────────────────────────────

type Setter = (key: string, v: unknown) => void;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <p className="mt-1 text-[10px] text-muted-soft">{hint}</p>}
    </label>
  );
}

function Text({ value, onChange, placeholder, type = "text", inputMode }: {
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "time" | "date";
  inputMode?: "numeric" | "decimal";
}) {
  return (
    <input
      type={type}
      value={value == null ? "" : value}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none"
    />
  );
}

function TextArea({ value, onChange, rows = 2, placeholder }: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value ?? ""}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-hairline bg-canvas p-2 text-body-sm focus:border-ink focus:outline-none"
    />
  );
}

function Toggle({ value, onChange, label }: { value: boolean | null | undefined; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-caption text-ink">
      <input
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-ink"
      />
      {label}
    </label>
  );
}

function PriceRow({
  label,
  amount,
  currency,
  onAmount,
  onCurrency,
  baseCurrency,
}: {
  label: string;
  amount: number | null | undefined;
  currency: string | null | undefined;
  onAmount: (v: number | null) => void;
  onCurrency: (v: string) => void;
  baseCurrency: string;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          value={amount == null ? "" : amount}
          onChange={(e) => {
            const n = e.target.value === "" ? null : Number(e.target.value);
            onAmount(Number.isFinite(n as number) ? (n as number) : null);
          }}
          placeholder="金額"
          className="h-9 flex-1 rounded-md border border-hairline bg-canvas px-2 font-mono text-body-sm focus:border-ink focus:outline-none"
        />
        <input
          type="text"
          value={currency ?? baseCurrency}
          maxLength={3}
          onChange={(e) => onCurrency(e.target.value.toUpperCase())}
          className="h-9 w-16 rounded-md border border-hairline bg-canvas px-2 font-mono text-[11px] uppercase focus:border-ink focus:outline-none"
        />
      </div>
    </Field>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-kind field fragments
// ─────────────────────────────────────────────────────────────────────────────

function AttractionFields({ v, set, baseCurrency }: { v: AttractionMetadata; set: Setter; baseCurrency: string }) {
  return (
    <div className="space-y-3">
      <Toggle label="需要購票進入" value={v.hasTicket} onChange={(x) => set("hasTicket", x)} />
      {v.hasTicket && (
        <PriceRow
          label="單張票價"
          amount={v.ticketPrice ?? null}
          currency={v.ticketCurrency ?? null}
          onAmount={(x) => set("ticketPrice", x)}
          onCurrency={(x) => set("ticketCurrency", x)}
          baseCurrency={baseCurrency}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="預估遊覽時間（分）" hint="覆蓋此景點的預設停留">
          <Text type="number" inputMode="numeric" value={v.expectedDurationMin ?? null} onChange={(s) => set("expectedDurationMin", s ? Number(s) : null)} />
        </Field>
        <Field label="預估排隊（分）">
          <Text type="number" inputMode="numeric" value={v.expectedQueueMin ?? null} onChange={(s) => set("expectedQueueMin", s ? Number(s) : null)} />
        </Field>
      </div>
      <Field label="營業時間">
        <Text value={v.openingHours ?? null} onChange={(s) => set("openingHours", s)} placeholder="例：09:00–17:00（週一公休）" />
      </Field>
      <Field label="預訂編號（如有）">
        <Text value={v.bookingRef ?? null} onChange={(s) => set("bookingRef", s)} />
      </Field>
    </div>
  );
}

function MealFields({ v, set, baseCurrency }: { v: MealMetadata; set: Setter; baseCurrency: string }) {
  return (
    <div className="space-y-3">
      <Toggle label="已預約" value={v.reservationRequired} onChange={(x) => set("reservationRequired", x)} />
      {v.reservationRequired && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="預約時間">
            <Text type="time" value={v.reservationTime ?? null} onChange={(s) => set("reservationTime", s)} />
          </Field>
          <Field label="人數">
            <Text type="number" inputMode="numeric" value={v.partySize ?? null} onChange={(s) => set("partySize", s ? Number(s) : null)} />
          </Field>
          <Field label="預約姓名">
            <Text value={v.reservationName ?? null} onChange={(s) => set("reservationName", s)} />
          </Field>
          <Field label="預約編號">
            <Text value={v.reservationRef ?? null} onChange={(s) => set("reservationRef", s)} />
          </Field>
        </div>
      )}
      <PriceRow
        label="人均預算"
        amount={v.averagePrice ?? null}
        currency={v.currency ?? null}
        onAmount={(x) => set("averagePrice", x)}
        onCurrency={(x) => set("currency", x)}
        baseCurrency={baseCurrency}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="菜系">
          <Text value={v.cuisine ?? null} onChange={(s) => set("cuisine", s)} placeholder="壽司 / 拉麵 / 義式" />
        </Field>
        <div className="flex items-end pb-1">
          <Toggle label="素食友善" value={v.vegetarianFriendly} onChange={(x) => set("vegetarianFriendly", x)} />
        </div>
      </div>
      <Field label="必吃 / 想嘗試的菜色">
        <TextArea value={v.mustTry ?? null} onChange={(s) => set("mustTry", s)} />
      </Field>
      <Field label="服裝要求">
        <Text value={v.dressCode ?? null} onChange={(s) => set("dressCode", s)} placeholder="休閒 / smart casual" />
      </Field>
    </div>
  );
}

function LodgingFields({ v, set, baseCurrency }: { v: LodgingMetadata; set: Setter; baseCurrency: string }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="入住時間">
          <Text type="time" value={v.checkInTime ?? null} onChange={(s) => set("checkInTime", s)} />
        </Field>
        <Field label="退房時間">
          <Text type="time" value={v.checkOutTime ?? null} onChange={(s) => set("checkOutTime", s)} />
        </Field>
        <Field label="退房日期" hint="跨夜時填">
          <Text type="date" value={v.checkOutDate ?? null} onChange={(s) => set("checkOutDate", s)} />
        </Field>
        <Field label="房型">
          <Text value={v.roomType ?? null} onChange={(s) => set("roomType", s)} placeholder="雙人房 / Twin / Suite" />
        </Field>
      </div>
      <PriceRow
        label="總金額"
        amount={v.totalCost ?? null}
        currency={v.currency ?? null}
        onAmount={(x) => set("totalCost", x)}
        onCurrency={(x) => set("currency", x)}
        baseCurrency={baseCurrency}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="訂房平台">
          <Text value={v.bookingPlatform ?? null} onChange={(s) => set("bookingPlatform", s)} placeholder="Booking / Agoda / 直接" />
        </Field>
        <Field label="訂房編號">
          <Text value={v.bookingRef ?? null} onChange={(s) => set("bookingRef", s)} />
        </Field>
      </div>
      <Toggle label="含早餐" value={v.breakfastIncluded} onChange={(x) => set("breakfastIncluded", x)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="聯絡電話">
          <Text value={v.contactPhone ?? null} onChange={(s) => set("contactPhone", s)} />
        </Field>
        <Field label="WiFi 密碼">
          <Text value={v.wifiPassword ?? null} onChange={(s) => set("wifiPassword", s)} />
        </Field>
      </div>
      <Field label="取消政策">
        <TextArea value={v.cancellationPolicy ?? null} onChange={(s) => set("cancellationPolicy", s)} placeholder="例：入住前 48h 可免費取消" />
      </Field>
    </div>
  );
}

function CarRentalFields({ v, set, baseCurrency }: { v: CarRentalMetadata; set: Setter; baseCurrency: string }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="取車地點">
          <Text value={v.pickupLocation ?? null} onChange={(s) => set("pickupLocation", s)} placeholder="羽田機場 T2" />
        </Field>
        <Field label="還車地點">
          <Text value={v.returnLocation ?? null} onChange={(s) => set("returnLocation", s)} placeholder="同地點 / 成田機場" />
        </Field>
        <Field label="取車日期">
          <Text type="date" value={v.pickupDate ?? null} onChange={(s) => set("pickupDate", s)} />
        </Field>
        <Field label="取車時間">
          <Text type="time" value={v.pickupTime ?? null} onChange={(s) => set("pickupTime", s)} />
        </Field>
        <Field label="還車日期">
          <Text type="date" value={v.returnDate ?? null} onChange={(s) => set("returnDate", s)} />
        </Field>
        <Field label="還車時間">
          <Text type="time" value={v.returnTime ?? null} onChange={(s) => set("returnTime", s)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="租車公司">
          <Text value={v.vendor ?? null} onChange={(s) => set("vendor", s)} placeholder="TOYOTA Rent / Hertz" />
        </Field>
        <Field label="車型">
          <Text value={v.carModel ?? null} onChange={(s) => set("carModel", s)} placeholder="Camry / Vitz" />
        </Field>
      </div>
      <PriceRow
        label="總金額"
        amount={v.totalCost ?? null}
        currency={v.currency ?? null}
        onAmount={(x) => set("totalCost", x)}
        onCurrency={(x) => set("currency", x)}
        baseCurrency={baseCurrency}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="預訂編號">
          <Text value={v.bookingRef ?? null} onChange={(s) => set("bookingRef", s)} />
        </Field>
        <Field label="加油政策">
          <select
            value={v.fuelPolicy ?? ""}
            onChange={(e) => set("fuelPolicy", e.target.value || null)}
            className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-body-sm focus:border-ink focus:outline-none"
          >
            <option value="">—</option>
            <option value="FULL_TO_FULL">取滿還滿</option>
            <option value="FULL_TO_EMPTY">滿油起 / 隨意還</option>
            <option value="PRE_PURCHASED">預購油票</option>
            <option value="OTHER">其他</option>
          </select>
        </Field>
      </div>
      <Toggle label="含基本保險" value={v.insuranceIncluded} onChange={(x) => set("insuranceIncluded", x)} />
      <Field label="駕照資訊">
        <Text value={v.driverLicense ?? null} onChange={(s) => set("driverLicense", s)} placeholder="國際駕照 + 台灣駕照" />
      </Field>
      <Field label="備註">
        <TextArea value={v.notes ?? null} onChange={(s) => set("notes", s)} />
      </Field>
    </div>
  );
}

function FlightFields({ v, set, baseCurrency }: { v: FlightMetadata; set: Setter; baseCurrency: string }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="航班號" hint="例：BR189">
          <Text value={v.flightNumber ?? null} onChange={(s) => set("flightNumber", s.toUpperCase())} placeholder="BR189" />
        </Field>
        <Field label="航空公司">
          <Text value={v.airline ?? null} onChange={(s) => set("airline", s)} placeholder="EVA Air" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="出發機場 (IATA)">
          <Text value={v.depAirport ?? null} onChange={(s) => set("depAirport", s.toUpperCase())} placeholder="TPE" />
        </Field>
        <Field label="抵達機場 (IATA)">
          <Text value={v.arrAirport ?? null} onChange={(s) => set("arrAirport", s.toUpperCase())} placeholder="NRT" />
        </Field>
        <Field label="出發時間">
          <Text type="time" value={v.depTime ?? null} onChange={(s) => set("depTime", s)} />
        </Field>
        <Field label="抵達時間">
          <Text type="time" value={v.arrTime ?? null} onChange={(s) => set("arrTime", s)} />
        </Field>
        <Field label="抵達日期" hint="跨日航班才填">
          <Text type="date" value={v.arrDate ?? null} onChange={(s) => set("arrDate", s)} />
        </Field>
        <Field label="航廈 / 登機門">
          <Text value={v.terminal ?? null} onChange={(s) => set("terminal", s)} placeholder="T1 / Gate B7" />
        </Field>
      </div>
      <PriceRow
        label="機票價格"
        amount={v.ticketPrice ?? null}
        currency={v.currency ?? null}
        onAmount={(x) => set("ticketPrice", x)}
        onCurrency={(x) => set("currency", x)}
        baseCurrency={baseCurrency}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="訂位代號 (PNR)">
          <Text value={v.bookingRef ?? null} onChange={(s) => set("bookingRef", s.toUpperCase())} placeholder="ABC123" />
        </Field>
        <Field label="座位">
          <Text value={v.seatNumber ?? null} onChange={(s) => set("seatNumber", s)} placeholder="32A" />
        </Field>
      </div>
      <Toggle
        label="國際航班（影響緩衝時間預設值）"
        value={v.isInternational}
        onChange={(x) => {
          set("isInternational", x);
          // Re-default buffers when international toggles
          set("checkInBufferMin", x ? 120 : 60);
          set("immigrationBufferMin", x ? 60 : 30);
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="check-in 提前（分）" hint="自動建一筆機場前置 ScheduleItem">
          <Text type="number" inputMode="numeric" value={v.checkInBufferMin ?? null} onChange={(s) => set("checkInBufferMin", s ? Number(s) : null)} />
        </Field>
        <Field label="入境 / 取行李（分）" hint="抵達後自動預留">
          <Text type="number" inputMode="numeric" value={v.immigrationBufferMin ?? null} onChange={(s) => set("immigrationBufferMin", s ? Number(s) : null)} />
        </Field>
      </div>
      <Field label="行李規定">
        <Text value={v.baggageAllowance ?? null} onChange={(s) => set("baggageAllowance", s)} placeholder="託運 23kg × 2 / 隨身 7kg" />
      </Field>
    </div>
  );
}

function TrainFields({ v, set, baseCurrency }: { v: TrainMetadata; set: Setter; baseCurrency: string }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="車號">
          <Text value={v.trainNumber ?? null} onChange={(s) => set("trainNumber", s)} placeholder="のぞみ 207" />
        </Field>
        <Field label="營運公司">
          <Text value={v.operator ?? null} onChange={(s) => set("operator", s)} placeholder="JR / 台鐵 / 高鐵" />
        </Field>
        <Field label="出發站">
          <Text value={v.depStation ?? null} onChange={(s) => set("depStation", s)} />
        </Field>
        <Field label="抵達站">
          <Text value={v.arrStation ?? null} onChange={(s) => set("arrStation", s)} />
        </Field>
        <Field label="出發時間">
          <Text type="time" value={v.depTime ?? null} onChange={(s) => set("depTime", s)} />
        </Field>
        <Field label="抵達時間">
          <Text type="time" value={v.arrTime ?? null} onChange={(s) => set("arrTime", s)} />
        </Field>
        <Field label="車廂">
          <Text value={v.carriage ?? null} onChange={(s) => set("carriage", s)} placeholder="5 号車" />
        </Field>
        <Field label="座位">
          <Text value={v.seatNumber ?? null} onChange={(s) => set("seatNumber", s)} placeholder="12A" />
        </Field>
      </div>
      <PriceRow
        label="票價"
        amount={v.ticketPrice ?? null}
        currency={v.currency ?? null}
        onAmount={(x) => set("ticketPrice", x)}
        onCurrency={(x) => set("currency", x)}
        baseCurrency={baseCurrency}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="訂位編號">
          <Text value={v.bookingRef ?? null} onChange={(s) => set("bookingRef", s)} />
        </Field>
        <div className="flex items-end pb-1">
          <Toggle label="對號座" value={v.isReserved} onChange={(x) => set("isReserved", x)} />
        </div>
      </div>
    </div>
  );
}

function FreeFields({ v, set, baseCurrency }: { v: FreeMetadata; set: Setter; baseCurrency: string }) {
  return (
    <div className="space-y-3">
      <PriceRow
        label="預算"
        amount={v.budget ?? null}
        currency={v.currency ?? null}
        onAmount={(x) => set("budget", x)}
        onCurrency={(x) => set("currency", x)}
        baseCurrency={baseCurrency}
      />
      <Field label="想做什麼">
        <TextArea value={v.plan ?? null} onChange={(s) => set("plan", s)} placeholder="逛街、咖啡、放空…" rows={3} />
      </Field>
      <Field label="備案" hint="天氣不好 / 太累時的替代計畫">
        <TextArea value={v.alternativePlan ?? null} onChange={(s) => set("alternativePlan", s)} rows={2} />
      </Field>
    </div>
  );
}

function TransportStopFields({ v, set }: { v: TransportStopMetadata; set: Setter }) {
  const isAuto = v.derivedFrom === "FLIGHT_CHECKIN" || v.derivedFrom === "FLIGHT_IMMIGRATION";
  return (
    <div className="space-y-3">
      {isAuto && (
        <p className="rounded-md border border-warning/30 bg-warning/5 p-2 text-[11px] text-ink">
          ⚙️ 此為飛行模塊自動產生（{v.derivedFrom === "FLIGHT_CHECKIN" ? "check-in" : "入境 / 取行李"}）。
          編輯航班資訊時會自動重算。
        </p>
      )}
      <Field label="用途 / 備註">
        <TextArea value={v.purpose ?? null} onChange={(s) => set("purpose", s)} placeholder="等候、轉乘、行李寄放…" />
      </Field>
    </div>
  );
}
