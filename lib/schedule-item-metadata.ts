import { z } from "zod";
import type { ScheduleKind } from "@/lib/mock-schedule";

// Phase 10c — per-kind structured metadata.
//
// Each ScheduleItem.kind carries its own set of fields, all optional, all
// validated by a Zod schema below. Stored as JSON on ScheduleItem.metadataJson
// + surfaced through MockScheduleItem.metadata.
//
// recalcPlanExpenses() reads these to derive auto-Expense rows. Adding a new
// kind requires:
//   1. Add a Zod schema here + entry in KIND_SCHEMAS
//   2. Add a kind branch in pickMetadataExpenses (expense-service.ts)
//   3. Add a form fragment in KindMetadataForm.tsx

// Common reusable fragments
const optionalNumber = z.number().nullable().optional();
const optionalString = z.string().nullable().optional();
const optionalBool = z.boolean().nullable().optional();

// ─────────────────────────────────────────────────────────────────────────────
// ATTRACTION — 景點 / 觀光點
// ─────────────────────────────────────────────────────────────────────────────
export const attractionMetadataSchema = z.object({
  hasTicket: optionalBool, // "需要購票"
  ticketPrice: optionalNumber, // 單張票價
  ticketCurrency: optionalString, // ISO code, default falls to baseCurrency
  openingHours: optionalString, // free text — Google Places hours go elsewhere
  expectedQueueMin: optionalNumber, // 預估排隊
  expectedDurationMin: optionalNumber, // 預估遊覽時間（覆蓋 Place.defaultStayMinutes）
  bookingRef: optionalString,
});
export type AttractionMetadata = z.infer<typeof attractionMetadataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// MEAL — 餐廳 / 用餐
// ─────────────────────────────────────────────────────────────────────────────
export const mealMetadataSchema = z.object({
  reservationRequired: optionalBool,
  reservationTime: optionalString, // HH:MM
  reservationRef: optionalString, // 訂位編號
  reservationName: optionalString, // 訂位姓名
  averagePrice: optionalNumber, // 人均
  partySize: optionalNumber, // 用餐人數
  currency: optionalString,
  cuisine: optionalString, // 菜系
  vegetarianFriendly: optionalBool,
  mustTry: optionalString, // 必點 / 想吃
  dressCode: optionalString,
});
export type MealMetadata = z.infer<typeof mealMetadataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// LODGING — 飯店 / 住宿
// ─────────────────────────────────────────────────────────────────────────────
export const lodgingMetadataSchema = z.object({
  checkInTime: optionalString, // HH:MM
  checkOutTime: optionalString,
  checkOutDate: optionalString, // YYYY-MM-DD if multi-night
  roomType: optionalString,
  bookingRef: optionalString,
  bookingPlatform: optionalString, // "Booking", "Agoda", "直接訂"
  totalCost: optionalNumber,
  currency: optionalString,
  breakfastIncluded: optionalBool,
  cancellationPolicy: optionalString,
  contactPhone: optionalString,
  wifiPassword: optionalString,
});
export type LodgingMetadata = z.infer<typeof lodgingMetadataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// CAR_RENTAL — 租車
// ─────────────────────────────────────────────────────────────────────────────
export const carRentalMetadataSchema = z.object({
  pickupLocation: optionalString,
  pickupTime: optionalString, // HH:MM
  pickupDate: optionalString, // YYYY-MM-DD
  returnLocation: optionalString,
  returnTime: optionalString,
  returnDate: optionalString,
  carModel: optionalString,
  vendor: optionalString, // "Hertz", "Times", "TOYOTA Rent"
  bookingRef: optionalString,
  totalCost: optionalNumber,
  currency: optionalString,
  fuelPolicy: z.enum(["FULL_TO_FULL", "FULL_TO_EMPTY", "PRE_PURCHASED", "OTHER"]).nullable().optional(),
  insuranceIncluded: optionalBool,
  driverLicense: optionalString,
  notes: optionalString,
});
export type CarRentalMetadata = z.infer<typeof carRentalMetadataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// FLIGHT — 飛機
// ─────────────────────────────────────────────────────────────────────────────
export const flightMetadataSchema = z.object({
  flightNumber: optionalString, // "BR189"
  airline: optionalString, // "EVA Air"
  depAirport: optionalString, // IATA code "TPE"
  arrAirport: optionalString, // "NRT"
  depCity: optionalString,
  arrCity: optionalString,
  depTime: optionalString, // HH:MM local at depAirport
  arrTime: optionalString, // HH:MM local at arrAirport
  arrDate: optionalString, // YYYY-MM-DD if next-day arrival
  ticketPrice: optionalNumber,
  currency: optionalString,
  bookingRef: optionalString, // PNR
  seatNumber: optionalString,
  terminal: optionalString,
  gate: optionalString,
  // Buffer minutes — Q4: domestic 60/30, international 120/60
  isInternational: optionalBool,
  checkInBufferMin: optionalNumber, // default 120 international / 60 domestic
  immigrationBufferMin: optionalNumber, // default 60 international / 30 domestic
  baggageAllowance: optionalString,
});
export type FlightMetadata = z.infer<typeof flightMetadataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// TRAIN — 火車 / 高鐵 / 新幹線
// ─────────────────────────────────────────────────────────────────────────────
export const trainMetadataSchema = z.object({
  trainNumber: optionalString, // "新幹線 のぞみ 207 号"
  operator: optionalString, // "JR", "台鐵", "高鐵"
  depStation: optionalString,
  arrStation: optionalString,
  depTime: optionalString,
  arrTime: optionalString,
  carriage: optionalString, // "5 号車"
  seatNumber: optionalString, // "12A"
  ticketPrice: optionalNumber,
  currency: optionalString,
  bookingRef: optionalString,
  isReserved: optionalBool, // 對號座 vs 自由座
});
export type TrainMetadata = z.infer<typeof trainMetadataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// FREE — 自由時間
// ─────────────────────────────────────────────────────────────────────────────
export const freeMetadataSchema = z.object({
  budget: optionalNumber, // 預算
  currency: optionalString,
  plan: optionalString, // 想做什麼
  alternativePlan: optionalString, // 備案 (天氣/疲累時)
});
export type FreeMetadata = z.infer<typeof freeMetadataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// TRANSPORT_STOP — 中繼點 (FLIGHT 衍生的 check-in / immigration 也走這個)
// ─────────────────────────────────────────────────────────────────────────────
export const transportStopMetadataSchema = z.object({
  purpose: optionalString, // "Check-in" / "Immigration" / 自由文字
  // FLIGHT-derived helpers stamp this so we know not to recalc them again.
  derivedFrom: z.enum(["FLIGHT_CHECKIN", "FLIGHT_IMMIGRATION", "USER"]).nullable().optional(),
});
export type TransportStopMetadata = z.infer<typeof transportStopMetadataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Master switch — used by KindMetadataForm + recalcPlanExpenses
// ─────────────────────────────────────────────────────────────────────────────

export const KIND_SCHEMAS = {
  ATTRACTION: attractionMetadataSchema,
  MEAL: mealMetadataSchema,
  LODGING: lodgingMetadataSchema,
  CAR_RENTAL: carRentalMetadataSchema,
  FLIGHT: flightMetadataSchema,
  TRAIN: trainMetadataSchema,
  FREE: freeMetadataSchema,
  TRANSPORT_STOP: transportStopMetadataSchema,
} as const satisfies Record<ScheduleKind, z.ZodTypeAny>;

export type AnyKindMetadata =
  | AttractionMetadata
  | MealMetadata
  | LodgingMetadata
  | CarRentalMetadata
  | FlightMetadata
  | TrainMetadata
  | FreeMetadata
  | TransportStopMetadata;

// Lenient parser — strips invalid fields rather than throwing. Used at the
// boundary where we read user-entered metadata (forgiving) vs at the API
// boundary where we want strict (KIND_SCHEMAS[kind].parse).
export function parseKindMetadata(
  kind: ScheduleKind,
  raw: unknown,
): AnyKindMetadata {
  const schema = KIND_SCHEMAS[kind] ?? freeMetadataSchema;
  const result = schema.safeParse(raw ?? {});
  if (result.success) return result.data as AnyKindMetadata;
  return {} as AnyKindMetadata;
}

// Defaults applied when first creating a metadata row. Most are null;
// FLIGHT carries domestic/international buffer defaults.
export function defaultMetadataForKind(kind: ScheduleKind): AnyKindMetadata {
  if (kind === "FLIGHT") {
    return {
      isInternational: true,
      checkInBufferMin: 120,
      immigrationBufferMin: 60,
    } as FlightMetadata;
  }
  return {};
}

// Friendly labels per kind (used in the form header + add-place dialog)
export const KIND_LABEL: Record<ScheduleKind, string> = {
  ATTRACTION: "景點",
  MEAL: "餐廳",
  LODGING: "住宿",
  CAR_RENTAL: "租車",
  FLIGHT: "飛機",
  TRAIN: "火車 / 高鐵",
  FREE: "自由時間",
  TRANSPORT_STOP: "中繼 / 等待",
};
