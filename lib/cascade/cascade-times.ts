// Pure-function time cascade engine for Phase 12a.
//
// Walks the day's items in order, propagating time forward:
//   - each item.endTime  = startTime + duration
//   - next item.startTime = previous endTime + transportSec/60 (0 if isFree)
//
// Locked items (`isTimeLocked=true`) act as anchors: they never shift, even if
// a predecessor would push past them. Such overlaps are emitted as `conflict=true`
// for the UI to render a red ring; the cascade itself continues from the locked
// item's verbatim endTime.
//
// FLIGHT items: the cascade uses their own duration (depTime → arrTime, which
// already accounts for crossing midnight via `arrDayOffset`). Buffer rows
// (CHECK-IN, IMMIGRATION) live as separate ScheduleItems via the existing
// flight-service.expandFlightSchedule, so the cascade just walks them naturally.
//
// IMPORTANT: this file MUST stay free of `server-only` imports. Phase 12f's
// week-view optimistic store calls it client-side every gesture frame; a
// server-only import would crash hydration.

export type CascadeItemInput = {
  id: string;
  kind: string;
  startTime: string;        // "HH:MM"
  durationMin: number;      // current value in DB; cascade will preserve unless overridden by metadataJson (FLIGHT)
  isTimeLocked: boolean;
  isAllDay: boolean;
  orderIndex: number;
  // FLIGHT items carry their own dep/arr time in metadataJson; cascade
  // overrides durationMin from these when present.
  metadataJson?: string | null;
};

export type CascadeTransportInput = {
  id: string;
  fromItemId: string;
  toItemId: string;
  mode: string;
  durationSec: number | null;
  manuallyEdited: boolean;
  isFree: boolean;
};

export type CascadeOptions = {
  // FLIGHT buffer defaults (used only when item.metadataJson lacks per-flight overrides).
  defaultCheckInBufferMinIntl?: number;     // default 120
  defaultCheckInBufferMinDomestic?: number; // default 60
  defaultImmigrationBufferMinIntl?: number; // default 60
  defaultImmigrationBufferMinDomestic?: number; // default 30
};

export type CascadeItemTime = {
  id: string;
  startTime: string;        // "HH:MM"
  endTime: string;          // "HH:MM"
  durationMin: number;      // possibly recomputed for FLIGHT
  arrDayOffset: number;     // 0 = same day; 1 = arrives +1d; ...
  conflict: boolean;        // true if this item's anchor pushed back into a predecessor
};

export type CascadeTransportTime = {
  id: string;
  effectiveDurationSec: number; // resolved (free → 0)
  departAt: string;             // "HH:MM" — equals from-item.endTime
  arriveAt: string;             // "HH:MM" — equals to-item.startTime
};

export type CascadeResult = {
  items: CascadeItemTime[];
  transports: CascadeTransportTime[];
};

// ─── helpers ────────────────────────────────────────────────────────────────

export function parseHM(s: string): number {
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fmtHM(min: number): string {
  const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

type FlightMeta = {
  depTime?: string;
  arrTime?: string;
  arrDayOffset?: number;
  isInternational?: boolean;
  checkInBufferMin?: number;
  immigrationBufferMin?: number;
  // CHECK-IN / IMMIGRATION buddies carry this
  derivedFrom?: string;
};

function parseFlightMeta(json: string | null | undefined): FlightMeta | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed != null ? (parsed as FlightMeta) : null;
  } catch {
    return null;
  }
}

// Compute the effective duration of a FLIGHT ScheduleItem from its metadata.
// Returns null when metadata doesn't have enough info; caller falls back to
// item.durationMin.
export function flightItemDurationMin(meta: FlightMeta): { durationMin: number; arrDayOffset: number } | null {
  if (!meta.depTime || !meta.arrTime) return null;
  const dep = parseHM(meta.depTime);
  const arr = parseHM(meta.arrTime);
  let offset = meta.arrDayOffset ?? 0;
  let totalMin = arr + offset * 24 * 60 - dep;
  // No explicit offset and arr <= dep → assume next-day flight.
  if (offset === 0 && totalMin <= 0) {
    offset = 1;
    totalMin += 24 * 60;
  }
  if (totalMin <= 0) return null; // pathological
  return { durationMin: totalMin, arrDayOffset: offset };
}

// ─── main entry ─────────────────────────────────────────────────────────────

export function cascadeTimes(
  items: CascadeItemInput[],
  transports: CascadeTransportInput[],
  options: CascadeOptions = {},
): CascadeResult {
  const _ = options; // reserved for future buffer overrides
  void _;

  const sortedItems = [...items].sort((a, b) => a.orderIndex - b.orderIndex);
  const transportByFromId = new Map<string, CascadeTransportInput>();
  for (const t of transports) transportByFromId.set(t.fromItemId, t);

  const itemTimes: CascadeItemTime[] = [];
  const transportTimes: CascadeTransportTime[] = [];

  if (sortedItems.length === 0) return { items: [], transports: [] };

  // Cursor tracks the next available minute. Allowed to exceed 24*60 to
  // represent crossing midnight (used only for arrDayOffset on the next item).
  let cursor: number | null = null;

  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i];

    if (item.isAllDay) {
      // All-day items don't participate in cascade — emit verbatim.
      itemTimes.push({
        id: item.id,
        startTime: item.startTime,
        endTime: "23:59",
        durationMin: item.durationMin,
        arrDayOffset: 0,
        conflict: false,
      });
      continue;
    }

    // ── Resolve this item's startTime ───
    const declaredStart = parseHM(item.startTime);
    let start: number;
    let conflict = false;

    if (cursor === null) {
      // First non-all-day item — anchor at its declared startTime.
      start = declaredStart;
    } else if (item.isTimeLocked) {
      // Locked items are anchors. If cursor is past, mark conflict but
      // emit the locked time verbatim and continue from there.
      start = declaredStart;
      // Compare modulo day length: if item declared "08:00" but cursor is
      // 1500, the locked item is in the past relative to cascade — definite conflict.
      if (cursor > start) conflict = true;
    } else {
      // Auto items follow the cursor (gets pushed forward by predecessors).
      start = cursor;
    }

    // ── Resolve this item's duration ───
    let durationMin = Math.max(0, item.durationMin);
    let arrDayOffset = 0;

    if (item.kind === "FLIGHT") {
      const meta = parseFlightMeta(item.metadataJson ?? null);
      if (meta && !meta.derivedFrom) {
        // Real FLIGHT row (not a CHECK-IN / IMMIGRATION buddy): override
        // duration from depTime/arrTime so the cascade reflects flight-time.
        const flightDur = flightItemDurationMin(meta);
        if (flightDur) {
          durationMin = flightDur.durationMin;
          arrDayOffset = flightDur.arrDayOffset;
        }
      }
    }

    const end = start + durationMin;

    itemTimes.push({
      id: item.id,
      startTime: fmtHM(start),
      endTime: fmtHM(end),
      durationMin,
      arrDayOffset,
      conflict,
    });

    // ── Advance the cursor past this item + the outgoing transport ───
    cursor = end;
    const t = transportByFromId.get(item.id);
    if (t) {
      const dur = t.isFree ? 0 : Math.max(0, t.durationSec ?? 0);
      transportTimes.push({
        id: t.id,
        effectiveDurationSec: dur,
        departAt: fmtHM(end),
        arriveAt: fmtHM(end + Math.ceil(dur / 60)),
      });
      cursor = end + Math.ceil(dur / 60);
    }
  }

  return { items: itemTimes, transports: transportTimes };
}
