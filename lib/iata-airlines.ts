// IATA airline code → name lookup. Lets the flight form auto-fill the
// "airline" field from a typed flight number prefix even when no API key
// is configured. Covers ~80 carriers most relevant to East Asian travel
// + the major US/EU lines. Add as needed.

export const IATA_AIRLINES: Record<string, string> = {
  // ─ Taiwan
  CI: "China Airlines 中華航空",
  BR: "EVA Air 長榮航空",
  AE: "Mandarin Airlines 華信航空",
  B7: "UNI Air 立榮航空",
  IT: "Tigerair Taiwan 台灣虎航",
  JX: "Starlux 星宇航空",

  // ─ Japan
  JL: "Japan Airlines 日本航空",
  NH: "ANA 全日空",
  MM: "Peach Aviation 樂桃航空",
  GK: "Jetstar Japan 日本捷星",
  BC: "Skymark Airlines",
  "7G": "Star Flyer",
  HD: "AirDo",
  NU: "Japan Transocean Air",

  // ─ Korea
  KE: "Korean Air 大韓航空",
  OZ: "Asiana Airlines 韓亞航空",
  LJ: "Jin Air 真航空",
  TW: "T'way Air",
  "7C": "Jeju Air",
  ZE: "Eastar Jet",

  // ─ China (PRC)
  CA: "Air China 中國國際航空",
  CZ: "China Southern 南方航空",
  MU: "China Eastern 東方航空",
  HU: "Hainan Airlines 海南航空",
  "3U": "Sichuan Airlines 川航",
  ZH: "Shenzhen Airlines 深圳航空",
  MF: "Xiamen Air 廈門航空",
  "9C": "Spring Airlines 春秋航空",

  // ─ Hong Kong / Macau
  CX: "Cathay Pacific 國泰",
  KA: "Cathay Dragon",
  HX: "Hong Kong Airlines",
  UO: "HK Express",
  NX: "Air Macau 澳門航空",

  // ─ SE Asia
  TG: "Thai Airways 泰國航空",
  TR: "Scoot",
  SQ: "Singapore Airlines 新加坡航空",
  MI: "SilkAir",
  VN: "Vietnam Airlines 越南航空",
  VJ: "VietJet Air",
  AK: "AirAsia",
  D7: "AirAsia X",
  PR: "Philippine Airlines 菲律賓航空",
  "5J": "Cebu Pacific",
  GA: "Garuda Indonesia 印尼鷹航",
  QZ: "Indonesia AirAsia",
  MH: "Malaysia Airlines 馬航",
  OD: "Malindo Air / Batik Air",

  // ─ Middle East / India
  EK: "Emirates 阿聯酋",
  EY: "Etihad",
  QR: "Qatar Airways 卡達",
  SV: "Saudia",
  TK: "Turkish Airlines 土耳其航空",
  AI: "Air India",
  "6E": "IndiGo",
  SG: "SpiceJet",

  // ─ Oceania
  QF: "Qantas",
  JQ: "Jetstar",
  VA: "Virgin Australia",
  NZ: "Air New Zealand",

  // ─ North America
  AA: "American Airlines 美國航空",
  UA: "United Airlines 聯合航空",
  DL: "Delta Air Lines 達美航空",
  AS: "Alaska Airlines",
  WN: "Southwest Airlines",
  B6: "JetBlue",
  HA: "Hawaiian Airlines",
  AC: "Air Canada 加拿大航空",
  WS: "WestJet",

  // ─ Europe
  BA: "British Airways",
  LH: "Lufthansa",
  AF: "Air France",
  KL: "KLM",
  IB: "Iberia",
  AY: "Finnair",
  LX: "Swiss",
  OS: "Austrian",
  SK: "SAS",
  TP: "TAP Portugal",
  EI: "Aer Lingus",
  AZ: "ITA Airways",
  FR: "Ryanair",
  U2: "easyJet",
  W6: "Wizz Air",
};

export function lookupAirlineByIata(flightNumber: string): string | null {
  const normalized = flightNumber.trim().toUpperCase();
  // Match 2-letter prefix (most common) or 3-character (with digit, e.g. 7C)
  const m = normalized.match(/^([0-9]?[A-Z][A-Z0-9])\d/);
  if (!m) return null;
  const code = m[1] ?? "";
  return IATA_AIRLINES[code] ?? null;
}
