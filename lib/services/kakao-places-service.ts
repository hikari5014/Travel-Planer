import "server-only";
import { resolvePlaceIcon } from "@/lib/place-icon";
import type { PlaceSearchResult } from "./place-service";
import { getKakaoRestApiKey } from "./settings-service";

// Kakao Local REST API — keyword search.
// https://developers.kakao.com/docs/latest/en/local/dev-guide#search-by-keyword
//
// Response shape:
//   {
//     meta: { total_count, pageable_count, is_end, same_name },
//     documents: [{
//       id, place_name, category_name, category_group_code, category_group_name,
//       phone, address_name, road_address_name, x (lng string), y (lat string),
//       place_url, distance
//     }]
//   }
//
// Note: x/y are STRING decimal degrees (WGS84), longitude-first like
// elsewhere in Kakao's API. We parse them into number lat/lng to match
// PlaceSearchResult shape used by the rest of the app.

const KAKAO_LOCAL_BASE = "https://dapi.kakao.com/v2/local";

type KakaoDocument = {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  category_group_name: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  place_url: string;
  distance: string;
};

type KakaoSearchResponse = {
  meta: { total_count: number; pageable_count: number; is_end: boolean };
  documents: KakaoDocument[];
};

// Map Kakao category_group_code → our PlaceIconKey. Kakao only has 14 groups
// so this is a small lookup; everything else falls through to resolvePlaceIcon
// on the category name.
//
// Group codes (Kakao docs): MT1=대형마트, CS2=편의점, PS3=어린이집, SC4=학교,
// AC5=학원, PK6=주차장, OL7=주유소, SW8=지하철역, BK9=은행, CT1=문화시설,
// AG2=중개업소, PO3=공공기관, AT4=관광명소, AD5=숙박, FD6=음식점, CE7=카페,
// HP8=병원, PM9=약국.
const KAKAO_GROUP_TO_HINT: Record<string, string> = {
  AT4: "tourist_attraction",
  AD5: "lodging",
  FD6: "restaurant",
  CE7: "cafe",
  SW8: "subway_station",
  CT1: "museum",
  HP8: "hospital",
  PM9: "pharmacy",
  BK9: "bank",
  CS2: "convenience_store",
  MT1: "supermarket",
  PK6: "parking",
  OL7: "gas_station",
};

export async function searchKakaoPlaces(
  query: string,
  opts: { limit?: number; center?: { lat: number; lng: number }; radiusM?: number } = {},
): Promise<PlaceSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const key = await getKakaoRestApiKey();
  if (!key) return [];

  const params = new URLSearchParams({ query: q, size: String(Math.min(15, opts.limit ?? 10)) });
  if (opts.center) {
    params.set("x", String(opts.center.lng));
    params.set("y", String(opts.center.lat));
    if (opts.radiusM) params.set("radius", String(Math.min(20000, opts.radiusM)));
  }

  try {
    const res = await fetch(`${KAKAO_LOCAL_BASE}/search/keyword.json?${params.toString()}`, {
      headers: { Authorization: `KakaoAK ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[kakao-places] search failed: ${res.status}`);
      return [];
    }
    const body = (await res.json()) as KakaoSearchResponse;
    return body.documents.map(toPlaceSearchResult);
  } catch (err) {
    console.warn(`[kakao-places] search threw: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function toPlaceSearchResult(d: KakaoDocument): PlaceSearchResult {
  // Use a "kakao:" prefix so downstream code (upsertPlaceFromGoogle etc.)
  // doesn't conflate Kakao IDs with Google place IDs. The Place table's
  // googlePlaceId column accepts strings so this works without schema
  // changes — when P3 lands we can wire a separate kakaoPlaceId column.
  const id = `kakao:${d.id}`;
  const lat = parseFloat(d.y);
  const lng = parseFloat(d.x);
  const hint = KAKAO_GROUP_TO_HINT[d.category_group_code] ?? d.category_name.split(" > ").pop() ?? "";
  const iconKey = resolvePlaceIcon(hint);

  return {
    googlePlaceId: id,
    name: d.place_name,
    category: d.category_group_name || d.category_name || "place",
    address: d.road_address_name || d.address_name || null,
    rating: null,
    iconKey,
    source: "google", // Reuse the existing literal; "kakao:" prefix in ID disambiguates downstream
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
  };
}
