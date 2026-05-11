// Standalone test for transit-rule-parser. Run via:
//   pnpm tsx lib/services/transit-rule-parser.test.ts
// No external deps — uses node:assert.

import assert from "node:assert/strict";
import { parseTransitText, filledFieldCount } from "./transit-rule-parser";

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

// ─── 1. English (Google Maps web, en) ────────────────────────────────────────
describe("English Google Maps text", () => {
  test("basic: 27 min · ¥210 · JR Yamanote Line", () => {
    const r = parseTransitText(`27 min · ¥210
JR Yamanote Line
9:14 AM - 9:41 AM
Shinjuku → Ueno`);
    assert.equal(r.durationMinutes, 27);
    assert.equal(r.fareAmount, 210);
    assert.equal(r.fareCurrency, "JPY");
    assert.equal(r.routeName, "JR Yamanote Line");
    assert.equal(r.departureTime, "09:14");
    assert.equal(r.arrivalTime, "09:41");
    assert.equal(filledFieldCount(r), 4);
  });

  test("12-hour PM time", () => {
    const r = parseTransitText(`27 min
JR Yamanote Line
2:14 PM - 2:41 PM
¥210`);
    assert.equal(r.departureTime, "14:14");
    assert.equal(r.arrivalTime, "14:41");
  });
});

// ─── 2. Chinese (zh-TW) ──────────────────────────────────────────────────────
describe("Chinese (zh-TW)", () => {
  test("basic: 27 分鐘 / JR 山手線 / $210", () => {
    const r = parseTransitText(`27 分鐘
JR 山手線
$210
9:14 - 9:41
新宿 → 上野`);
    assert.equal(r.durationMinutes, 27);
    assert.equal(r.fareAmount, 210);
    // $ in zh context maps to TWD by Rule 2.3
    assert.equal(r.fareCurrency, "TWD");
    assert.match(r.routeName ?? "", /山手線/);
    assert.equal(r.departureTime, "09:14");
    assert.equal(r.arrivalTime, "09:41");
  });

  test("Taipei MRT with NT$ + transfer", () => {
    const r = parseTransitText(`45 分鐘
台北捷運 紅線 → 文湖線
NT$45
14:30 - 15:15
1 次轉乘`);
    assert.equal(r.durationMinutes, 45);
    assert.equal(r.fareAmount, 45);
    assert.equal(r.fareCurrency, "TWD");
    assert.equal(r.transferCount, 1);
    assert.match(r.routeName ?? "", /紅線/);
    assert.match(r.routeName ?? "", /文湖線/);
    assert.match(r.notes ?? "", /1 次轉乘/);
  });
});

// ─── 3. Japanese ─────────────────────────────────────────────────────────────
describe("Japanese", () => {
  test("basic: 27 分 / JR 山手線 / ¥210", () => {
    const r = parseTransitText(`27 分
JR 山手線
¥210
9:14 - 9:41
新宿 → 上野`);
    assert.equal(r.durationMinutes, 27);
    assert.equal(r.fareAmount, 210);
    assert.equal(r.fareCurrency, "JPY");
    assert.match(r.routeName ?? "", /山手線/);
  });
});

// ─── 4. Long route with transfer ─────────────────────────────────────────────
describe("Long route with transfer", () => {
  test("1hr 12min · ¥640 · 1 transfer (en)", () => {
    const r = parseTransitText(`1 hr 12 min · ¥640
JR Yamanote Line → Tokyo Metro Ginza Line
9:14 AM - 10:26 AM
1 transfer`);
    assert.equal(r.durationMinutes, 72);
    assert.equal(r.fareAmount, 640);
    assert.equal(r.fareCurrency, "JPY");
    assert.equal(r.transferCount, 1);
    assert.match(r.routeName ?? "", /Yamanote/);
    assert.match(r.routeName ?? "", /Ginza/);
  });
});

// ─── 5. Noise (platform / train number) ──────────────────────────────────────
describe("Noisy text", () => {
  test("ignores Platform 14 / Train 1042", () => {
    const r = parseTransitText(`27 min
JR Yamanote Line for Shibuya
Platform 14
Train 1042
¥210
9:14 - 9:41`);
    assert.equal(r.durationMinutes, 27);
    assert.equal(r.fareAmount, 210);
    assert.match(r.routeName ?? "", /JR Yamanote Line/);
    // route should NOT include "for Shibuya" or "Platform 14"
    assert.doesNotMatch(r.routeName ?? "", /Platform/);
    assert.doesNotMatch(r.routeName ?? "", /Shibuya/);
    // notes should mention platform / train
    assert.match(r.notes ?? "", /月台/);
    assert.match(r.notes ?? "", /班次/);
  });
});

// ─── 6. Multiple fares (IC + cash) ───────────────────────────────────────────
describe("Multiple fares", () => {
  test("IC ¥208 / 現金 ¥210 → picks 208", () => {
    const r = parseTransitText(`27 min
JR Yamanote Line
IC ¥208 / 現金 ¥210
9:14 - 9:41`);
    assert.equal(r.fareAmount, 208);
    assert.equal(r.fareCurrency, "JPY");
    assert.match(r.notes ?? "", /較低票價/);
  });
});

// ─── 7. Cross-day / Shinkansen overnight ─────────────────────────────────────
describe("Cross-day overnight", () => {
  test("5hr30min Shinkansen ¥14,170 (23:30-05:00)", () => {
    const r = parseTransitText(`5 hr 30 min
新幹線 のぞみ
¥14,170
23:30 - 05:00`);
    assert.equal(r.durationMinutes, 330);
    assert.equal(r.fareAmount, 14170);
    assert.equal(r.fareCurrency, "JPY");
    assert.equal(r.departureTime, "23:30");
    assert.equal(r.arrivalTime, "05:00");
    assert.match(r.routeName ?? "", /新幹線/);
    // Sanity check: 5h30 = 330; cross-day diff = 330 → consistent → no warning
    assert.doesNotMatch(r.notes ?? "", /跨日/);
  });

  test("inconsistent times trigger cross-day warning", () => {
    const r = parseTransitText(`30 min
JR Yamanote Line
¥210
23:30 - 05:00`);
    // 30 min duration but times suggest 330 min → warning
    assert.match(r.notes ?? "", /跨日/);
  });
});

// ─── 8. Empty / garbage ──────────────────────────────────────────────────────
describe("Empty / garbage input", () => {
  test("empty string → all null", () => {
    const r = parseTransitText("");
    assert.equal(r.durationMinutes, null);
    assert.equal(r.fareAmount, null);
    assert.equal(r.routeName, null);
    assert.equal(filledFieldCount(r), 0);
  });

  test("whitespace only → all null", () => {
    const r = parseTransitText("   \n\n   ");
    assert.equal(filledFieldCount(r), 0);
  });

  test("garbage text → all null", () => {
    const r = parseTransitText("hello world foo bar baz");
    assert.equal(filledFieldCount(r), 0);
  });
});

// ─── 9. Currency edge cases ──────────────────────────────────────────────────
describe("Currency edge cases", () => {
  test("USD with decimals", () => {
    const r = parseTransitText(`30 min
NJ Transit
US$ 12.50
9:00 AM - 9:30 AM`);
    assert.equal(r.fareAmount, 12.5);
    assert.equal(r.fareCurrency, "USD");
  });

  test("EUR", () => {
    const r = parseTransitText(`25 min
RER B
€3.50
10:00 - 10:25`);
    assert.equal(r.fareAmount, 3.5);
    assert.equal(r.fareCurrency, "EUR");
  });

  test("KRW won symbol", () => {
    const r = parseTransitText(`20 min
지하철 2호선
₩1,400
9:00 - 9:20`);
    assert.equal(r.fareAmount, 1400);
    assert.equal(r.fareCurrency, "KRW");
  });

  test("HKD", () => {
    const r = parseTransitText(`15 min
MTR Tsuen Wan Line
HK$11.5
8:00 - 8:15`);
    assert.equal(r.fareAmount, 11.5);
    assert.equal(r.fareCurrency, "HKD");
  });

  test("CNY (zh context with ¥)", () => {
    const r = parseTransitText(`30 分鐘
北京地鐵 1 號線
¥6
9:00 - 9:30`);
    assert.equal(r.fareAmount, 6);
    // zh context with kana-free → CNY (Rule 2.8)
    assert.equal(r.fareCurrency, "CNY");
  });
});

// ─── 10. Hours-only duration ─────────────────────────────────────────────────
describe("Hours-only duration", () => {
  test("2 hr → 120 min", () => {
    const r = parseTransitText(`2 hr
Greyhound Bus
US$ 45
8:00 AM - 10:00 AM`);
    assert.equal(r.durationMinutes, 120);
  });

  test("1 小時 30 分鐘", () => {
    const r = parseTransitText(`1 小時 30 分鐘
台鐵自強號
NT$280
8:00 - 9:30`);
    assert.equal(r.durationMinutes, 90);
  });
});

// ─── 11. filledFieldCount helper ─────────────────────────────────────────────
describe("filledFieldCount helper", () => {
  test("counts only complete time pair", () => {
    const r = parseTransitText(`27 min
JR Yamanote Line
¥210
9:14 出發`);
    // duration ✓, fare ✓, route ✓, but only departure (no arrival) → time pair = 0
    assert.equal(r.durationMinutes, 27);
    assert.equal(r.fareAmount, 210);
    assert.equal(r.departureTime, "09:14");
    assert.equal(r.arrivalTime, null);
    assert.equal(filledFieldCount(r), 3);
  });

  test("all four canonical fields", () => {
    const r = parseTransitText(`27 min
JR Yamanote Line
¥210
9:14 - 9:41`);
    assert.equal(filledFieldCount(r), 4);
  });
});

// ─── Summary ─────────────────────────────────────────────────────────────────
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
