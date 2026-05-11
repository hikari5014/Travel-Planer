// Rule-based parser for Google Maps transit text.
// Pure function, no external deps. Used by TransitGoogleMapsPanel as the
// default parsing path so we don't hit LLM quota.

export type ParsedCurrency =
  | "JPY"
  | "TWD"
  | "USD"
  | "EUR"
  | "GBP"
  | "KRW"
  | "CNY"
  | "HKD";

export type ParsedTransit = {
  durationMinutes: number | null;
  fareAmount: number | null;
  fareCurrency: ParsedCurrency | null;
  routeName: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  transferCount: number | null;
  notes: string | null;
  _confidence: {
    duration: number;
    fare: number;
    routeName: number;
    times: number;
  };
};

type Lang = "zh" | "ja" | "en";

function detectLang(raw: string): Lang {
  if (/[぀-ゟ゠-ヿ]/.test(raw)) return "ja"; // hiragana/katakana
  // Without kana, distinguish zh vs ja-with-only-kanji using strong zh markers.
  // ¥ defaults to JPY unless an explicit zh marker (元 / 捷運 / NT$ / 公車 / 巴士 / 鐘 / 鐵) is present.
  if (/元|捷運|NT\$|公車|巴士|鐘|鐵/.test(raw)) return "zh";
  if (/[一-鿿]/.test(raw)) return "ja";
  return "en";
}

function preClean(raw: string): string {
  return raw
    .replace(/[　 ]/g, " ")
    .replace(/[–—~〜至到]/g, "-")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

// ─── Rule 1: duration ────────────────────────────────────────────────────────

function parseDuration(text: string): { value: number | null; confidence: number } {
  // 1.1 "1 hr 27 min" / "1h 27m"
  let m = text.match(
    /(\d+)\s*(?:hr|h|hour|hours)\s*(\d+)\s*(?:min|minute|minutes|m)\b/i,
  );
  if (m) return { value: Number(m[1]) * 60 + Number(m[2]), confidence: 1.0 };

  // 1.2 「1 小時 27 分」/「1 時間 27 分」
  m = text.match(/(\d+)\s*(?:小時|時間)\s*(\d+)\s*(?:分鐘|分)/);
  if (m) return { value: Number(m[1]) * 60 + Number(m[2]), confidence: 1.0 };

  // 1.3 「2 小時」/「2 hr」(only hours)
  m = text.match(/(\d+)\s*(?:小時|時間)\b/);
  if (m) return { value: Number(m[1]) * 60, confidence: 0.9 };
  m = text.match(/(\d+)\s*(?:hr|hours?|h)\b(?!\s*\d)/i);
  if (m) return { value: Number(m[1]) * 60, confidence: 0.9 };

  // 1.4 minutes only
  m = text.match(/(\d+)\s*(?:minutes?|min)\b/i);
  if (m) return { value: Number(m[1]), confidence: 0.9 };
  m = text.match(/(\d+)\s*(?:分鐘|分)(?!\s*鐘)/);
  if (m) return { value: Number(m[1]), confidence: 0.9 };
  m = text.match(/(\d+)\s*m\b(?!\w)/); // "27 m" but not "27mph"
  if (m && !/\b\d+\s*km\b/i.test(text.slice(Math.max(0, (m.index ?? 0) - 5), (m.index ?? 0) + 6))) {
    return { value: Number(m[1]), confidence: 0.7 };
  }

  // 1.5 "0:27 total" — only with explicit duration keyword nearby
  const totalRegex = /(?:duration|total|合計|總時間)[^\n]{0,15}?(\d+):(\d{2})/i;
  const t = text.match(totalRegex);
  if (t) return { value: Number(t[1]) * 60 + Number(t[2]), confidence: 0.5 };

  return { value: null, confidence: 0 };
}

// ─── Rule 2: fare / currency ─────────────────────────────────────────────────

type FareHit = { amount: number; currency: ParsedCurrency; confidence: number };

function parseFare(text: string, lang: Lang): { value: number | null; currency: ParsedCurrency | null; confidence: number; multiple: boolean } {
  const hits: FareHit[] = [];

  function addAll(re: RegExp, currency: ParsedCurrency, confidence: number) {
    const matches = text.matchAll(re);
    for (const m of matches) {
      const num = Number((m[1] ?? "").replace(/,/g, ""));
      if (Number.isFinite(num) && num > 0) {
        hits.push({ amount: num, currency, confidence });
      }
    }
  }

  // 2.1 ¥123 / 123 円  (JPY default; Chinese-only context disambiguates to CNY later)
  addAll(/¥\s*(\d{1,3}(?:,\d{3})*|\d+)/g, "JPY", 0.95);
  addAll(/(\d{1,3}(?:,\d{3})*|\d+)\s*円/g, "JPY", 0.98);

  // 2.2 JPY 123
  addAll(/\bJPY\s*(\d{1,3}(?:,\d{3})*|\d+)/gi, "JPY", 0.98);

  // 2.3 NT$ / TWD / 元 (only in zh context)
  addAll(/NT\$\s*(\d{1,3}(?:,\d{3})*|\d+)/g, "TWD", 0.98);
  addAll(/\bTWD\s*(\d{1,3}(?:,\d{3})*|\d+)/gi, "TWD", 0.98);
  if (lang === "zh") {
    addAll(/(\d{1,3}(?:,\d{3})*|\d+)\s*元/g, "TWD", 0.9);
    addAll(/\$\s*(\d{1,3}(?:,\d{3})*|\d+)/g, "TWD", 0.7); // bare $ in zh-TW Google Maps means TWD
  }

  // 2.4 USD
  addAll(/US\$\s*(\d+(?:\.\d{1,2})?)/g, "USD", 0.98);
  addAll(/\bUSD\s*(\d+(?:\.\d{1,2})?)/gi, "USD", 0.98);

  // 2.5 EUR
  addAll(/€\s*(\d+(?:[.,]\d{1,2})?)/g, "EUR", 0.95);
  addAll(/\bEUR\s*(\d+(?:[.,]\d{1,2})?)/gi, "EUR", 0.98);

  // 2.6 GBP
  addAll(/£\s*(\d+(?:[.,]\d{1,2})?)/g, "GBP", 0.95);
  addAll(/\bGBP\s*(\d+(?:[.,]\d{1,2})?)/gi, "GBP", 0.98);

  // 2.7 KRW
  addAll(/₩\s*(\d{1,3}(?:,\d{3})*|\d+)/g, "KRW", 0.95);
  addAll(/\bKRW\s*(\d{1,3}(?:,\d{3})*|\d+)/gi, "KRW", 0.98);
  addAll(/(\d{1,3}(?:,\d{3})*|\d+)\s*원/g, "KRW", 0.95);

  // 2.8 CNY (¥ in pure-zh context with no kana → CNY rather than JPY)
  if (lang === "zh") {
    // Re-tag JPY hits as CNY when in zh context. Keep only one set.
    for (const h of hits) {
      if (h.currency === "JPY") h.currency = "CNY";
    }
  }
  addAll(/\bCNY\s*(\d+(?:\.\d{1,2})?)/gi, "CNY", 0.98);
  addAll(/RMB\s*(\d+(?:\.\d{1,2})?)/gi, "CNY", 0.95);

  // 2.9 HKD
  addAll(/HK\$\s*(\d+(?:\.\d{1,2})?)/g, "HKD", 0.98);
  addAll(/\bHKD\s*(\d+(?:\.\d{1,2})?)/gi, "HKD", 0.98);

  if (hits.length === 0) {
    // 2.10 fallback — bare number near keyword
    const fallback = text.match(/(?:fare|price|cost|票價|價格|費用)[^\n]{0,20}?(\d+(?:,\d{3})*)/i);
    if (fallback) {
      const num = Number(fallback[1].replace(/,/g, ""));
      // Currency guess from lang
      const currency: ParsedCurrency =
        lang === "ja" ? "JPY" : lang === "zh" ? "TWD" : "USD";
      return { value: num, currency, confidence: 0.5, multiple: false };
    }
    return { value: null, currency: null, confidence: 0, multiple: false };
  }

  // De-duplicate identical (amount, currency) pairs (regex overlap can double-count)
  const seen = new Set<string>();
  const unique = hits.filter((h) => {
    const k = `${h.amount}-${h.currency}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Pick lowest amount (IC fare preference)
  unique.sort((a, b) => a.amount - b.amount);
  const chosen = unique[0];
  const multiple = unique.length > 1;
  return {
    value: chosen.amount,
    currency: chosen.currency,
    confidence: multiple ? 0.85 : chosen.confidence,
    multiple,
  };
}

// ─── Rule 3: time range ──────────────────────────────────────────────────────

function to24h(h: number, m: number, ampm: string | undefined): string | null {
  let hour = h;
  if (ampm) {
    const a = ampm.toLowerCase();
    if (a === "pm" && hour < 12) hour += 12;
    if (a === "am" && hour === 12) hour = 0;
  }
  if (hour < 0 || hour > 23 || m < 0 || m > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseTimes(text: string): {
  departure: string | null;
  arrival: string | null;
  confidence: number;
  warning: string | null;
} {
  // 3.1 range "9:14 AM - 9:41 AM" / "9:14 - 9:41"
  const range = text.match(
    /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/,
  );
  if (range) {
    const dep = to24h(Number(range[1]), Number(range[2]), range[3]);
    const arr = to24h(Number(range[4]), Number(range[5]), range[6]);
    if (dep && arr) return { departure: dep, arrival: arr, confidence: 1.0, warning: null };
  }

  // 3.2 / 3.3 standalone depart / arrive markers
  let dep: string | null = null;
  let arr: string | null = null;
  const depM = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?\s*(?:出發|発|depart|leave)/i);
  if (depM) dep = to24h(Number(depM[1]), Number(depM[2]), depM[3]);
  const arrM = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?\s*(?:抵達|到達|着|arrive)/i);
  if (arrM) arr = to24h(Number(arrM[1]), Number(arrM[2]), arrM[3]);
  if (dep || arr) {
    return {
      departure: dep,
      arrival: arr,
      confidence: dep && arr ? 0.8 : 0.5,
      warning: null,
    };
  }

  return { departure: null, arrival: null, confidence: 0, warning: null };
}

function timeDiffMinutes(dep: string, arr: string): number {
  const [dh, dm] = dep.split(":").map(Number);
  const [ah, am] = arr.split(":").map(Number);
  let diff = ah * 60 + am - (dh * 60 + dm);
  if (diff < 0) diff += 24 * 60; // cross-day
  return diff;
}

// ─── Rule 4: route name ──────────────────────────────────────────────────────

const ROUTE_KEYWORDS = [
  // zh — rail / metro
  "線", "鐵", "高鐵", "新幹線", "捷運", "地鐵",
  // zh — JR/private rail proper names
  "JR", "東京Metro", "都營", "東急", "京王", "小田急", "京急", "京成", "西武", "東武",
  "阪急", "阪神", "京阪", "近鐵", "南海", "台鐵", "台高鐵",
  // ja
  "メトロ", "ライン",
  // en — generic rail
  "Line", "Metro", "Subway", "Shinkansen", "Rail", "Railway", "Express", "Limited Express", "Rapid",
  // en — JR variants
  "JR East", "JR West", "JR Central", "JR Kyushu", "JR Hokkaido", "JR Shikoku",
  "Tokyo Metro", "Toei", "Tokyu", "Keio", "Odakyu", "Keikyu", "Keisei", "Seibu", "Tobu",
  "Hankyu", "Hanshin", "Keihan", "Kintetsu", "Nankai",
  // bus / tram / ferry / flight
  "巴士", "公車", "客運", "バス", "Bus", "Coach",
  "路面電車", "輕軌", "電車", "トラム", "Tram", "Tramway", "Light Rail", "LRT",
  "渡輪", "渡船", "フェリー", "船", "Ferry", "Boat",
  "航班", "班機", "便", "フライト", "Flight", "Airline",
];

const NOISE_KEYWORDS = [
  "往", "for", "方向", "direction", "platform", "Platform", "月台", "番線",
  "分鐘", "min", "票價", "元", "fare",
];

function lineHasKeyword(line: string, keywords: string[]): boolean {
  const lower = line.toLowerCase();
  return keywords.some((k) => {
    if (/^[A-Za-z]/.test(k)) return lower.includes(k.toLowerCase());
    return line.includes(k);
  });
}

function isPureNumberOrTime(line: string): boolean {
  const stripped = line.trim();
  if (/^[\d:.,\s\-/]+$/.test(stripped)) return true;
  if (/^[\d:]+\s*(AM|PM|am|pm)\s*-\s*[\d:]+\s*(AM|PM|am|pm)?$/.test(stripped)) return true;
  return false;
}

function cleanRouteLine(line: string): string {
  return line
    .replace(/Platform\s*\d+/gi, "")
    .replace(/月台\s*\d+/g, "")
    .replace(/\d+\s*番線/g, "")
    .replace(/Train\s*\d+/gi, "")
    .replace(/列車\s*\d+/g, "")
    .replace(/班次\s*\d+/g, "")
    .replace(/\s*for\s+\S+\s*$/i, "")
    .replace(/\s*往\s*\S+\s*$/, "")
    .trim();
}

function parseRouteName(text: string, lines: string[]): { value: string | null; confidence: number } {
  const candidates: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || isPureNumberOrTime(trimmed)) continue;
    const hasRoute = lineHasKeyword(trimmed, ROUTE_KEYWORDS);
    if (!hasRoute) continue; // route keyword required to be a candidate
    // Don't reject lines that mix route + noise; cleanRouteLine strips noise tail
    const cleaned = cleanRouteLine(trimmed);
    if (cleaned) candidates.push(cleaned);
  }

  if (candidates.length === 0) {
    // Fallback: scan inline patterns (sometimes single-line "27 min · JR Yamanote Line")
    const inlineMatch = text.match(/[·•・|]\s*([^·•・|\n]*?(?:Line|線|Metro|Express|Bus|バス|Shinkansen)[^·•・|\n]*)/i);
    if (inlineMatch) {
      return { value: inlineMatch[1].trim(), confidence: 0.7 };
    }
    return { value: null, confidence: 0 };
  }

  if (candidates.length === 1) {
    return { value: candidates[0], confidence: 0.85 };
  }

  // Multi-segment join (transfer)
  // De-duplicate consecutive identical lines
  const dedup: string[] = [];
  for (const c of candidates) {
    if (dedup.length === 0 || dedup[dedup.length - 1] !== c) dedup.push(c);
  }
  return { value: dedup.join(" → "), confidence: 0.9 };
}

// ─── Rule 5: notes & transfer count ──────────────────────────────────────────

function parseTransferCount(text: string): number | null {
  const m =
    text.match(/(\d+)\s*(?:次轉乘|次乘換|次乗換)/) ??
    text.match(/(\d+)\s*transfers?/i) ??
    text.match(/乗換\s*(\d+)\s*回/);
  if (m) return Number(m[1]);
  if (/\b(?:no|0)\s+transfers?\b/i.test(text) || /無轉乘|無乘換/.test(text)) return 0;
  return null;
}

function buildNotes(
  text: string,
  transferCount: number | null,
  fareMultiple: boolean,
  timeWarning: string | null,
): string | null {
  const parts: string[] = [];
  if (transferCount !== null && transferCount > 0) parts.push(`${transferCount} 次轉乘`);
  if (fareMultiple) parts.push("已選擇較低票價（如 IC 卡）");
  if (timeWarning) parts.push(timeWarning);

  // Train number / platform extraction
  const train = text.match(/(?:Train|列車|班次)\s*(\d{2,5})/i);
  if (train) parts.push(`班次 ${train[1]}`);
  const platform = text.match(/(?:Platform|月台)\s*(\d+)/i) ?? text.match(/(\d+)\s*番線/);
  if (platform) parts.push(`月台 ${platform[1]}`);

  return parts.length === 0 ? null : parts.join("、");
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export function parseTransitText(raw: string): ParsedTransit {
  const empty: ParsedTransit = {
    durationMinutes: null,
    fareAmount: null,
    fareCurrency: null,
    routeName: null,
    departureTime: null,
    arrivalTime: null,
    transferCount: null,
    notes: null,
    _confidence: { duration: 0, fare: 0, routeName: 0, times: 0 },
  };

  if (!raw || !raw.trim()) return empty;

  const cleaned = preClean(raw);
  const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);
  const lang = detectLang(cleaned);

  const dur = parseDuration(cleaned);
  const fare = parseFare(cleaned, lang);
  const times = parseTimes(cleaned);
  const route = parseRouteName(cleaned, lines);
  const transfers = parseTransferCount(cleaned);

  // Sanity check: arrival - departure ≈ duration (±5 min); if not, warn
  let timeWarning: string | null = null;
  let timesConfidence = times.confidence;
  if (times.departure && times.arrival && dur.value !== null) {
    const diff = timeDiffMinutes(times.departure, times.arrival);
    if (Math.abs(diff - dur.value) > 5) {
      timeWarning = "出發/抵達時間與總時間不符，可能跨日，請確認";
      timesConfidence = Math.min(timesConfidence, 0.5);
    }
  }

  const notes = buildNotes(cleaned, transfers, fare.multiple, timeWarning);

  return {
    durationMinutes: dur.value,
    fareAmount: fare.value,
    fareCurrency: fare.currency,
    routeName: route.value,
    departureTime: times.departure,
    arrivalTime: times.arrival,
    transferCount: transfers,
    notes,
    _confidence: {
      duration: dur.confidence,
      fare: fare.confidence,
      routeName: route.confidence,
      times: timesConfidence,
    },
  };
}

// Helper for UI: count canonical filled fields (used for LLM gating decision)
export function filledFieldCount(p: ParsedTransit): number {
  let n = 0;
  if (p.durationMinutes !== null) n++;
  if (p.fareAmount !== null) n++;
  if (p.routeName !== null) n++;
  if (p.departureTime !== null && p.arrivalTime !== null) n++;
  return n;
}
