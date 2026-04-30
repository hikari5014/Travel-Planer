// Common IATA airport codes → { name, lat, lng }. Used to compute great-circle
// distance for FLIGHT transports without hitting an external API. Covers the
// East Asian travel corridor + major US/EU hubs. Add as needed.
//
// Coordinates are runway-centroid approximations; sufficient for trip-level
// distance display (within ±1 km error).

export const IATA_AIRPORTS: Record<string, { name: string; lat: number; lng: number }> = {
  // ─ Taiwan
  TPE: { name: "桃園國際機場", lat: 25.0797, lng: 121.2342 },
  TSA: { name: "臺北松山機場", lat: 25.0697, lng: 121.5520 },
  KHH: { name: "高雄國際機場", lat: 22.5771, lng: 120.3502 },
  RMQ: { name: "臺中國際機場", lat: 24.2647, lng: 120.6210 },
  TNN: { name: "臺南機場", lat: 22.9504, lng: 120.2057 },
  HUN: { name: "花蓮機場", lat: 24.0231, lng: 121.6182 },

  // ─ Japan
  HND: { name: "東京羽田機場", lat: 35.5494, lng: 139.7798 },
  NRT: { name: "東京成田機場", lat: 35.7647, lng: 140.3863 },
  KIX: { name: "關西國際機場", lat: 34.4347, lng: 135.2440 },
  ITM: { name: "大阪伊丹機場", lat: 34.7855, lng: 135.4382 },
  NGO: { name: "名古屋中部機場", lat: 34.8584, lng: 136.8054 },
  CTS: { name: "札幌新千歲機場", lat: 42.7752, lng: 141.6923 },
  FUK: { name: "福岡機場", lat: 33.5859, lng: 130.4509 },
  OKA: { name: "那霸機場", lat: 26.1958, lng: 127.6458 },
  HIJ: { name: "廣島機場", lat: 34.4361, lng: 132.9192 },
  SDJ: { name: "仙台機場", lat: 38.1397, lng: 140.9171 },
  KOJ: { name: "鹿兒島機場", lat: 31.8034, lng: 130.7196 },
  KMI: { name: "宮崎機場", lat: 31.8772, lng: 131.4485 },

  // ─ Korea
  ICN: { name: "首爾仁川機場", lat: 37.4602, lng: 126.4407 },
  GMP: { name: "首爾金浦機場", lat: 37.5586, lng: 126.7906 },
  PUS: { name: "釜山金海機場", lat: 35.1795, lng: 128.9382 },
  CJU: { name: "濟州機場", lat: 33.5113, lng: 126.4930 },

  // ─ China
  PEK: { name: "北京首都機場", lat: 40.0801, lng: 116.5846 },
  PKX: { name: "北京大興機場", lat: 39.5099, lng: 116.4106 },
  PVG: { name: "上海浦東機場", lat: 31.1443, lng: 121.8083 },
  SHA: { name: "上海虹橋機場", lat: 31.1979, lng: 121.3363 },
  CAN: { name: "廣州白雲機場", lat: 23.3924, lng: 113.2988 },
  SZX: { name: "深圳寶安機場", lat: 22.6393, lng: 113.8108 },
  XIY: { name: "西安咸陽機場", lat: 34.4471, lng: 108.7516 },
  CTU: { name: "成都雙流機場", lat: 30.5784, lng: 103.9472 },

  // ─ HK / Macau
  HKG: { name: "香港國際機場", lat: 22.3080, lng: 113.9185 },
  MFM: { name: "澳門國際機場", lat: 22.1496, lng: 113.5916 },

  // ─ SE Asia
  BKK: { name: "曼谷蘇凡納布機場", lat: 13.6900, lng: 100.7501 },
  DMK: { name: "曼谷廊曼機場", lat: 13.9126, lng: 100.6068 },
  SIN: { name: "新加坡樟宜機場", lat: 1.3644, lng: 103.9915 },
  KUL: { name: "吉隆坡國際機場", lat: 2.7456, lng: 101.7099 },
  CGK: { name: "雅加達蘇加諾機場", lat: -6.1256, lng: 106.6559 },
  DPS: { name: "峇里島伍拉萊機場", lat: -8.7484, lng: 115.1675 },
  MNL: { name: "馬尼拉機場", lat: 14.5086, lng: 121.0194 },
  HAN: { name: "河內內排機場", lat: 21.2187, lng: 105.8042 },
  SGN: { name: "胡志明新山一機場", lat: 10.8189, lng: 106.6519 },

  // ─ Middle East / India
  DXB: { name: "杜拜國際機場", lat: 25.2532, lng: 55.3657 },
  DOH: { name: "多哈哈馬德機場", lat: 25.2731, lng: 51.6080 },
  IST: { name: "伊斯坦堡機場", lat: 41.2753, lng: 28.7519 },
  DEL: { name: "德里英迪拉機場", lat: 28.5562, lng: 77.1000 },
  BOM: { name: "孟買恰特拉帕蒂機場", lat: 19.0896, lng: 72.8656 },

  // ─ Oceania
  SYD: { name: "雪梨機場", lat: -33.9399, lng: 151.1753 },
  MEL: { name: "墨爾本機場", lat: -37.6690, lng: 144.8410 },
  AKL: { name: "奧克蘭機場", lat: -37.0082, lng: 174.7917 },

  // ─ North America
  LAX: { name: "洛杉磯國際機場", lat: 33.9416, lng: -118.4085 },
  SFO: { name: "舊金山國際機場", lat: 37.6213, lng: -122.3790 },
  JFK: { name: "紐約甘迺迪機場", lat: 40.6413, lng: -73.7781 },
  EWR: { name: "紐華克機場", lat: 40.6895, lng: -74.1745 },
  SEA: { name: "西雅圖機場", lat: 47.4502, lng: -122.3088 },
  ORD: { name: "芝加哥歐海爾機場", lat: 41.9742, lng: -87.9073 },
  YVR: { name: "溫哥華機場", lat: 49.1939, lng: -123.1844 },
  YYZ: { name: "多倫多皮爾遜機場", lat: 43.6777, lng: -79.6248 },
  HNL: { name: "檀香山機場", lat: 21.3245, lng: -157.9251 },

  // ─ Europe
  LHR: { name: "倫敦希斯洛機場", lat: 51.4700, lng: -0.4543 },
  CDG: { name: "巴黎戴高樂機場", lat: 49.0097, lng: 2.5479 },
  FRA: { name: "法蘭克福機場", lat: 50.0379, lng: 8.5622 },
  AMS: { name: "阿姆斯特丹機場", lat: 52.3105, lng: 4.7683 },
  MAD: { name: "馬德里機場", lat: 40.4983, lng: -3.5676 },
  FCO: { name: "羅馬菲烏米奇諾機場", lat: 41.8003, lng: 12.2389 },
  ZRH: { name: "蘇黎世機場", lat: 47.4647, lng: 8.5492 },
  HEL: { name: "赫爾辛基機場", lat: 60.3172, lng: 24.9633 },
};

// Great-circle distance in meters (haversine).
export function haversineMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const R = 6371000; // earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(a))));
}

// Compute great-circle distance between two airports given their IATA codes.
// Returns null if either code is unknown.
export function distanceBetweenAirports(depIata: string, arrIata: string): number | null {
  const dep = IATA_AIRPORTS[depIata.toUpperCase()];
  const arr = IATA_AIRPORTS[arrIata.toUpperCase()];
  if (!dep || !arr) return null;
  return haversineMeters(dep.lat, dep.lng, arr.lat, arr.lng);
}
