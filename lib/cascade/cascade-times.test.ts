// Standalone test for cascadeTimes. Run via:
//   pnpm tsx lib/cascade/cascade-times.test.ts
// No external deps — uses node:assert.

import assert from "node:assert/strict";
import {
  cascadeTimes,
  flightItemDurationMin,
  parseHM,
  fmtHM,
  type CascadeItemInput,
  type CascadeTransportInput,
} from "./cascade-times";

let pass = 0;
let fail = 0;
const failures: { name: string; err: unknown }[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    fail++;
    failures.push({ name, err });
    console.log(`  ✗ ${name}`);
  }
}
function describe(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ─── small helpers ──────────────────────────────────────────────────────────

let nextId = 0;
function mkItem(p: Partial<CascadeItemInput> & { startTime: string; durationMin: number; orderIndex: number }): CascadeItemInput {
  return {
    id: p.id ?? `i${nextId++}`,
    kind: p.kind ?? "ATTRACTION",
    startTime: p.startTime,
    durationMin: p.durationMin,
    isTimeLocked: p.isTimeLocked ?? false,
    isAllDay: p.isAllDay ?? false,
    orderIndex: p.orderIndex,
    metadataJson: p.metadataJson ?? null,
  };
}
function mkTransport(p: Partial<CascadeTransportInput> & { fromItemId: string; toItemId: string; durationSec: number | null }): CascadeTransportInput {
  return {
    id: p.id ?? `t${nextId++}`,
    fromItemId: p.fromItemId,
    toItemId: p.toItemId,
    mode: p.mode ?? "WALKING",
    durationSec: p.durationSec,
    manuallyEdited: p.manuallyEdited ?? false,
    isFree: p.isFree ?? false,
  };
}

// ─── 1. Empty / single item ─────────────────────────────────────────────────
describe("Empty / single item", () => {
  test("empty day → empty arrays", () => {
    const r = cascadeTimes([], []);
    assert.equal(r.items.length, 0);
    assert.equal(r.transports.length, 0);
  });

  test("single item — startTime preserved", () => {
    const a = mkItem({ id: "a", startTime: "10:00", durationMin: 90, orderIndex: 0 });
    const r = cascadeTimes([a], []);
    assert.equal(r.items[0].startTime, "10:00");
    assert.equal(r.items[0].endTime, "11:30");
    assert.equal(r.items[0].conflict, false);
    assert.equal(r.transports.length, 0);
  });
});

// ─── 2. Normal 3-stop day with transports ───────────────────────────────────
describe("Normal 3-stop day", () => {
  test("A 60min → 15min walk → B 90min → 30min walk → C 45min", () => {
    const a = mkItem({ id: "a", startTime: "09:00", durationMin: 60, orderIndex: 0 });
    const b = mkItem({ id: "b", startTime: "00:00", durationMin: 90, orderIndex: 1 });
    const c = mkItem({ id: "c", startTime: "00:00", durationMin: 45, orderIndex: 2 });
    const t1 = mkTransport({ fromItemId: "a", toItemId: "b", durationSec: 15 * 60 });
    const t2 = mkTransport({ fromItemId: "b", toItemId: "c", durationSec: 30 * 60 });
    const r = cascadeTimes([a, b, c], [t1, t2]);
    assert.equal(r.items[0].startTime, "09:00");
    assert.equal(r.items[0].endTime, "10:00");
    assert.equal(r.items[1].startTime, "10:15"); // 10:00 + 15min walk
    assert.equal(r.items[1].endTime, "11:45");
    assert.equal(r.items[2].startTime, "12:15"); // 11:45 + 30min walk
    assert.equal(r.items[2].endTime, "13:00");
    assert.equal(r.transports[0].departAt, "10:00");
    assert.equal(r.transports[0].arriveAt, "10:15");
    assert.equal(r.transports[0].effectiveDurationSec, 900);
  });
});

// ─── 3. Locked middle item (no conflict) ────────────────────────────────────
describe("Locked middle item", () => {
  test("B locked at 14:00 — A finishes 13:30 + 15min walk = 13:45 < 14:00, no conflict", () => {
    const a = mkItem({ id: "a", startTime: "13:00", durationMin: 30, orderIndex: 0 });
    const b = mkItem({ id: "b", startTime: "14:00", durationMin: 60, orderIndex: 1, isTimeLocked: true });
    const t1 = mkTransport({ fromItemId: "a", toItemId: "b", durationSec: 15 * 60 });
    const r = cascadeTimes([a, b], [t1]);
    assert.equal(r.items[0].startTime, "13:00");
    assert.equal(r.items[0].endTime, "13:30");
    assert.equal(r.items[1].startTime, "14:00"); // locked anchor
    assert.equal(r.items[1].endTime, "15:00");
    assert.equal(r.items[1].conflict, false);
  });

  test("locked item with predecessor overrun → conflict=true but locked time held", () => {
    const a = mkItem({ id: "a", startTime: "13:00", durationMin: 90, orderIndex: 0 });
    const b = mkItem({ id: "b", startTime: "14:00", durationMin: 60, orderIndex: 1, isTimeLocked: true });
    const t1 = mkTransport({ fromItemId: "a", toItemId: "b", durationSec: 15 * 60 });
    const r = cascadeTimes([a, b], [t1]);
    // A ends 14:30; +15min = 14:45; B is locked at 14:00 → conflict
    assert.equal(r.items[0].endTime, "14:30");
    assert.equal(r.items[1].startTime, "14:00");
    assert.equal(r.items[1].conflict, true);
    // cursor resumes from 15:00 (= locked B endTime)
  });
});

// ─── 4. Free transport ──────────────────────────────────────────────────────
describe("Free transport", () => {
  test("isFree=true → places sit flush", () => {
    const a = mkItem({ id: "a", startTime: "10:00", durationMin: 60, orderIndex: 0 });
    const b = mkItem({ id: "b", startTime: "00:00", durationMin: 30, orderIndex: 1 });
    const t1 = mkTransport({ fromItemId: "a", toItemId: "b", durationSec: null, isFree: true });
    const r = cascadeTimes([a, b], [t1]);
    assert.equal(r.items[0].endTime, "11:00");
    assert.equal(r.items[1].startTime, "11:00"); // flush
    assert.equal(r.transports[0].effectiveDurationSec, 0);
    assert.equal(r.transports[0].departAt, "11:00");
    assert.equal(r.transports[0].arriveAt, "11:00");
  });
});

// ─── 5. Manual transport ────────────────────────────────────────────────────
describe("Manual transport", () => {
  test("manuallyEdited=true with explicit durationSec → cascade uses it", () => {
    const a = mkItem({ id: "a", startTime: "10:00", durationMin: 60, orderIndex: 0 });
    const b = mkItem({ id: "b", startTime: "00:00", durationMin: 30, orderIndex: 1 });
    const t1 = mkTransport({
      fromItemId: "a",
      toItemId: "b",
      durationSec: 25 * 60,
      manuallyEdited: true,
    });
    const r = cascadeTimes([a, b], [t1]);
    assert.equal(r.items[1].startTime, "11:25");
  });
});

// ─── 6. FLIGHT with depTime/arrTime ─────────────────────────────────────────
describe("FLIGHT items", () => {
  test("FLIGHT with metadata depTime=08:00 arrTime=10:30 → 150 min", () => {
    const meta = JSON.stringify({ depTime: "08:00", arrTime: "10:30" });
    const f = mkItem({ id: "f", kind: "FLIGHT", startTime: "08:00", durationMin: 0, orderIndex: 0, metadataJson: meta });
    const r = cascadeTimes([f], []);
    assert.equal(r.items[0].startTime, "08:00");
    assert.equal(r.items[0].endTime, "10:30");
    assert.equal(r.items[0].durationMin, 150);
    assert.equal(r.items[0].arrDayOffset, 0);
  });

  test("FLIGHT cross-midnight (red-eye) → arrDayOffset=1", () => {
    const meta = JSON.stringify({ depTime: "23:30", arrTime: "01:15" });
    const f = mkItem({ id: "f", kind: "FLIGHT", startTime: "23:30", durationMin: 0, orderIndex: 0, metadataJson: meta });
    const r = cascadeTimes([f], []);
    // 23:30 → 01:15 next day = 1h 45m = 105 min
    assert.equal(r.items[0].durationMin, 105);
    assert.equal(r.items[0].arrDayOffset, 1);
    // endTime is fmtHM(23:30 + 105) = fmtHM(1530) → mod 1440 → 90 min → "01:30"… wait math
    // 23*60+30 = 1410; 1410 + 105 = 1515; mod 1440 = 75 = "01:15"
    assert.equal(r.items[0].endTime, "01:15");
  });

  test("FLIGHT with explicit arrDayOffset=1 in metadata", () => {
    const meta = JSON.stringify({ depTime: "10:00", arrTime: "08:00", arrDayOffset: 1 });
    const f = mkItem({ id: "f", kind: "FLIGHT", startTime: "10:00", durationMin: 0, orderIndex: 0, metadataJson: meta });
    const r = cascadeTimes([f], []);
    // 10:00 dep + 22h flight (e.g. transpacific) → arrives 08:00 next day
    assert.equal(r.items[0].durationMin, 22 * 60);
    assert.equal(r.items[0].arrDayOffset, 1);
  });

  test("FLIGHT buddy (CHECK-IN derivedFrom) uses item.durationMin verbatim", () => {
    // Buddies must NOT be re-derived from depTime/arrTime — they wrap the flight.
    const meta = JSON.stringify({ depTime: "08:00", arrTime: "10:30", derivedFrom: "FLIGHT_CHECKIN" });
    const buddy = mkItem({ id: "b", kind: "FLIGHT", startTime: "06:00", durationMin: 120, orderIndex: 0, metadataJson: meta });
    const r = cascadeTimes([buddy], []);
    assert.equal(r.items[0].durationMin, 120);
    assert.equal(r.items[0].endTime, "08:00");
  });
});

// ─── 7. First item not at day start (preserve declared startTime) ──────────
describe("First item anchor", () => {
  test("first item declared 11:00 — cascade does not snap to 09:00", () => {
    const a = mkItem({ id: "a", startTime: "11:00", durationMin: 30, orderIndex: 0 });
    const r = cascadeTimes([a], []);
    assert.equal(r.items[0].startTime, "11:00");
  });
});

// ─── 8. All-day item passthrough ────────────────────────────────────────────
describe("All-day item", () => {
  test("LODGING all-day item emits 00:00–23:59 unchanged, doesn't advance cursor", () => {
    const lodge = mkItem({
      id: "l", kind: "LODGING", startTime: "00:00", durationMin: 0, orderIndex: 0, isAllDay: true,
    });
    const a = mkItem({ id: "a", startTime: "09:00", durationMin: 60, orderIndex: 1 });
    const r = cascadeTimes([lodge, a], []);
    assert.equal(r.items[0].startTime, "00:00");
    assert.equal(r.items[0].endTime, "23:59");
    // 'a' anchors itself (cursor was null after lodge)
    assert.equal(r.items[1].startTime, "09:00");
  });
});

// ─── 9. Mixed locked + free + auto + flight (integration) ───────────────────
describe("Mixed integration", () => {
  test("4-item day: auto place → free → locked place → 30min walk → flight", () => {
    const flightMeta = JSON.stringify({ depTime: "16:00", arrTime: "18:00" });
    const a = mkItem({ id: "a", startTime: "10:00", durationMin: 60, orderIndex: 0 });
    const b = mkItem({ id: "b", startTime: "12:00", durationMin: 60, orderIndex: 1, isTimeLocked: true });
    const f = mkItem({ id: "f", kind: "FLIGHT", startTime: "16:00", durationMin: 0, orderIndex: 2, metadataJson: flightMeta });
    const t1 = mkTransport({ fromItemId: "a", toItemId: "b", durationSec: null, isFree: true });
    const t2 = mkTransport({ fromItemId: "b", toItemId: "f", durationSec: 30 * 60 });
    const r = cascadeTimes([a, b, f], [t1, t2]);
    assert.equal(r.items[0].endTime, "11:00");
    assert.equal(r.items[1].startTime, "12:00"); // locked
    assert.equal(r.items[1].endTime, "13:00");
    assert.equal(r.items[2].startTime, "13:30"); // 13:00 + 30min walk
    assert.equal(r.items[2].endTime, "15:30");   // 13:30 + 120min flight
    assert.equal(r.items[2].durationMin, 120);
  });
});

// ─── 10. flightItemDurationMin direct tests ─────────────────────────────────
describe("flightItemDurationMin helper", () => {
  test("dep before arr same day", () => {
    const r = flightItemDurationMin({ depTime: "08:00", arrTime: "10:30" });
    assert.deepEqual(r, { durationMin: 150, arrDayOffset: 0 });
  });

  test("missing depTime → null", () => {
    const r = flightItemDurationMin({ arrTime: "10:30" });
    assert.equal(r, null);
  });

  test("dep > arr without offset → assume +1d", () => {
    const r = flightItemDurationMin({ depTime: "23:00", arrTime: "01:00" });
    assert.deepEqual(r, { durationMin: 120, arrDayOffset: 1 });
  });
});

// ─── 11. parseHM / fmtHM round-trip ─────────────────────────────────────────
describe("HM helpers", () => {
  test("parseHM round-trip", () => {
    assert.equal(parseHM("00:00"), 0);
    assert.equal(parseHM("13:45"), 13 * 60 + 45);
    assert.equal(parseHM("23:59"), 23 * 60 + 59);
  });
  test("fmtHM wraps modulo 24h", () => {
    assert.equal(fmtHM(25 * 60 + 30), "01:30"); // 25:30 wraps to 01:30
    assert.equal(fmtHM(-30), "23:30"); // negative wraps
  });
});

// ─── 12. transportTimes parallel array ──────────────────────────────────────
describe("Transport times output", () => {
  test("transports array aligns with input order", () => {
    const a = mkItem({ id: "a", startTime: "10:00", durationMin: 30, orderIndex: 0 });
    const b = mkItem({ id: "b", startTime: "00:00", durationMin: 30, orderIndex: 1 });
    const c = mkItem({ id: "c", startTime: "00:00", durationMin: 30, orderIndex: 2 });
    const t1 = mkTransport({ id: "t1", fromItemId: "a", toItemId: "b", durationSec: 600 });
    const t2 = mkTransport({ id: "t2", fromItemId: "b", toItemId: "c", durationSec: 1200 });
    const r = cascadeTimes([a, b, c], [t1, t2]);
    assert.equal(r.transports.length, 2);
    assert.equal(r.transports[0].id, "t1");
    assert.equal(r.transports[0].departAt, "10:30");
    assert.equal(r.transports[0].arriveAt, "10:40");
    assert.equal(r.transports[1].id, "t2");
    assert.equal(r.transports[1].departAt, "11:10");
    assert.equal(r.transports[1].arriveAt, "11:30");
  });
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n─────────────────────────────`);
console.log(`Total: ${pass + fail}    Pass: ${pass}    Fail: ${fail}`);
if (fail > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) {
    console.log(`\n  ✗ ${f.name}`);
    console.log(`    ${f.err instanceof Error ? f.err.message : String(f.err)}`);
  }
  process.exit(1);
}
