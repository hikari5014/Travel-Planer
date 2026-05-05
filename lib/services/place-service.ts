import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolvePlaceIcon, type PlaceIconKey } from "@/lib/place-icon";
import { suggestStayMinutes } from "./heuristic-stay";
import { getGoogleMapsKey } from "./settings-service";

// ─────────────────────────────────────────────────────────────────────────────
// Search & lookup
// ─────────────────────────────────────────────────────────────────────────────

export type PlaceSearchResult = {
  googlePlaceId: string;
  name: string;
  category: string;
  address: string | null;
  rating: number | null;
  iconKey: PlaceIconKey;
  source: "cache" | "google";
  // Optional fields populated from Google Places (kept for the dialog hover):
  lat?: number;
  lng?: number;
  ratingCount?: number;
};

// Search the local cache + Google Places (New) when a key is configured.
// Local hits come first (instant, free), Google hits fill the rest.
// On Google call failure we silently fall back to cache-only — the user
// still sees their existing data.
export async function searchPlaces(query: string, limit = 8): Promise<PlaceSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const cached = await searchPlacesInCache(q, limit);
  const cachedIds = new Set(cached.map((p) => p.googlePlaceId));

  const key = await getGoogleMapsKey();
  if (!key) return cached;

  try {
    const remote = await searchPlacesViaGoogle(q, key, limit);
    const fresh = remote.filter((r) => !cachedIds.has(r.googlePlaceId));
    return [...cached, ...fresh].slice(0, limit);
  } catch (err) {
    // Log on the server, return cache-only to keep UX responsive.
    console.warn("[place-service] Google Places search failed:", err instanceof Error ? err.message : err);
    return cached;
  }
}

async function searchPlacesInCache(q: string, limit: number): Promise<PlaceSearchResult[]> {
  const rows = await prisma.place.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { category: { contains: q } },
        { address: { contains: q } },
      ],
    },
    take: limit,
    orderBy: [{ ratingCount: "desc" }, { name: "asc" }],
  });
  return rows.map((p) => ({
    googlePlaceId: p.googlePlaceId,
    name: p.name,
    category: p.category,
    address: p.address,
    rating: p.rating,
    iconKey: (p.iconKey as PlaceIconKey) ?? "landmark",
    source: "cache" as const,
    ...(p.lat != null ? { lat: p.lat } : {}),
    ...(p.lng != null ? { lng: p.lng } : {}),
    ...(p.ratingCount != null ? { ratingCount: p.ratingCount } : {}),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Places API (New) — POST /v1/places:searchText
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
// FieldMask is required; we ask only for what the dialog actually needs.
// ─────────────────────────────────────────────────────────────────────────────

const PLACES_SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.primaryType",
].join(",");

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  types?: string[];
};

async function searchPlacesViaGoogle(
  query: string,
  apiKey: string,
  limit: number,
): Promise<PlaceSearchResult[]> {
  const res = await fetch(PLACES_SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACES_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "zh-TW",
      pageSize: Math.min(limit, 20),
    }),
    // Disable any Next.js caching — search results are user-driven.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Places ${res.status}: ${body.slice(0, 200)}`);
  }
  const body = (await res.json()) as { places?: GooglePlace[] };
  const places = body.places ?? [];

  return places.map((p) => {
    const category = humanCategoryFromTypes(p.primaryType, p.types);
    return {
      googlePlaceId: p.id,
      name: p.displayName?.text ?? p.id,
      category,
      address: p.formattedAddress ?? null,
      rating: p.rating ?? null,
      ratingCount: p.userRatingCount,
      iconKey: resolvePlaceIcon(category),
      source: "google" as const,
      ...(p.location?.latitude != null ? { lat: p.location.latitude } : {}),
      ...(p.location?.longitude != null ? { lng: p.location.longitude } : {}),
    };
  });
}

// Map a Google Places `primaryType` to a CJK label our place-icon resolver
// understands (e.g. "restaurant" → "餐廳"). Fall back to the raw token.
function humanCategoryFromTypes(primary?: string, types?: string[]): string {
  const raw = primary ?? types?.[0] ?? "place";
  const map: Record<string, string> = {
    restaurant: "餐廳",
    cafe: "咖啡",
    food: "餐廳",
    bakery: "麵包店",
    bar: "酒吧",
    lodging: "住宿",
    hotel: "飯店",
    train_station: "車站",
    subway_station: "捷運站",
    bus_station: "公車站",
    airport: "機場",
    park: "公園",
    museum: "博物館",
    art_gallery: "美術館",
    tourist_attraction: "景點",
    place_of_worship: "宗教",
    shopping_mall: "購物中心",
    store: "商店",
    convenience_store: "便利商店",
    supermarket: "超市",
    parking: "停車場",
    gas_station: "加油站",
    hospital: "醫院",
    pharmacy: "藥局",
    library: "圖書館",
    movie_theater: "電影院",
    night_club: "夜店",
    spa: "SPA",
    gym: "健身房",
    zoo: "動物園",
    aquarium: "水族館",
  };
  return map[raw] ?? raw.replace(/_/g, " ");
}

export async function getPlace(googlePlaceId: string) {
  return prisma.place.findUnique({ where: { googlePlaceId } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Create / upsert
// ─────────────────────────────────────────────────────────────────────────────

export const placeCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  address: z.string().max(200).optional().default(""),
  iconKey: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  ratingCount: z.number().int().min(0).optional(),
  reviewSnippet: z.string().max(400).optional(),
  // For demo, accept x/y for stylized map until lat/lng arrive in Phase 2+
  mapX: z.number().optional(),
  mapY: z.number().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

// User-entered places get a synthetic id so Phase 2 can swap them for real
// Google ids without breaking foreign keys.
export async function createCustomPlace(input: z.input<typeof placeCreateSchema>) {
  const parsed = placeCreateSchema.parse(input);
  const iconKey = (parsed.iconKey as PlaceIconKey | undefined) ?? resolvePlaceIcon(parsed.category);
  const id = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return prisma.place.create({
    data: {
      googlePlaceId: id,
      name: parsed.name,
      originalName: parsed.name,
      category: parsed.category,
      address: parsed.address || null,
      iconKey,
      rating: parsed.rating ?? null,
      ratingCount: parsed.ratingCount ?? null,
      reviewSnippet: parsed.reviewSnippet ?? null,
      mapX: parsed.mapX ?? null,
      mapY: parsed.mapY ?? null,
      lat: parsed.lat ?? null,
      lng: parsed.lng ?? null,
      defaultStayMinutes: suggestStayMinutes(iconKey),
      defaultStaySource: "HEURISTIC",
      fetchedAt: new Date(),
    },
  });
}

// Search for nearby parking lots — used by the DRIVING-segment "規劃停車場"
// button in the schedule list. Same Nearby Search endpoint, restricted to
// the "parking" type so we only get garages/lots back.
export async function placesParkingNearby(
  lat: number,
  lng: number,
  radiusM = 500,
): Promise<PlaceSearchResult[]> {
  const apiKey = await getGoogleMapsKey();
  if (!apiKey) return [];

  const res = await fetch(PLACES_NEARBY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACES_FIELD_MASK,
    },
    body: JSON.stringify({
      languageCode: "zh-TW",
      maxResultCount: 8,
      includedTypes: ["parking"],
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusM,
        },
      },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Places parking ${res.status}: ${body.slice(0, 200)}`);
  }
  const body = (await res.json()) as { places?: GooglePlace[] };
  const places = body.places ?? [];
  return places.map((p) => ({
    googlePlaceId: p.id,
    name: p.displayName?.text ?? p.id,
    category: "停車場",
    address: p.formattedAddress ?? null,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount,
    iconKey: "parking" as const,
    source: "google" as const,
    ...(p.location?.latitude != null ? { lat: p.location.latitude } : {}),
    ...(p.location?.longitude != null ? { lng: p.location.longitude } : {}),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Place Details (New) — single GET when we already know the placeId (e.g.
// the user clicked a labeled POI on Google Maps and the JS SDK gave us the
// id directly). Cheaper + more accurate than searchNearby fuzzy match.
// ─────────────────────────────────────────────────────────────────────────────

const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "types",
  "primaryType",
].join(",");

export async function placeDetailsByGoogleId(googlePlaceId: string): Promise<PlaceSearchResult | null> {
  const apiKey = await getGoogleMapsKey();
  if (!apiKey) return null;
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(googlePlaceId)}?languageCode=zh-TW`;
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Place details ${res.status}: ${body.slice(0, 200)}`);
  }
  const p = (await res.json()) as GooglePlace;
  const category = humanCategoryFromTypes(p.primaryType, p.types);
  return {
    googlePlaceId: p.id,
    name: p.displayName?.text ?? p.id,
    category,
    address: p.formattedAddress ?? null,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount,
    iconKey: resolvePlaceIcon(category),
    source: "google" as const,
    ...(p.location?.latitude != null ? { lat: p.location.latitude } : {}),
    ...(p.location?.longitude != null ? { lng: p.location.longitude } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reverse search — given lat/lng (e.g. user clicked the map), find the
// closest named POI within `radiusM` so they don't have to type the name.
// Uses the same Places (New) endpoint with a Nearby Search request.
// ─────────────────────────────────────────────────────────────────────────────

const PLACES_NEARBY_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";

export async function placesNearby(
  lat: number,
  lng: number,
  radiusM = 60,
  limit = 10,
): Promise<PlaceSearchResult[]> {
  const apiKey = await getGoogleMapsKey();
  if (!apiKey) return [];

  const res = await fetch(PLACES_NEARBY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACES_FIELD_MASK,
    },
    body: JSON.stringify({
      languageCode: "zh-TW",
      maxResultCount: Math.min(limit, 20),
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusM,
        },
      },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Places nearby ${res.status}: ${body.slice(0, 200)}`);
  }
  const body = (await res.json()) as { places?: GooglePlace[] };
  const places = body.places ?? [];
  return places.map((p) => {
    const category = humanCategoryFromTypes(p.primaryType, p.types);
    return {
      googlePlaceId: p.id,
      name: p.displayName?.text ?? p.id,
      category,
      address: p.formattedAddress ?? null,
      rating: p.rating ?? null,
      ratingCount: p.userRatingCount,
      iconKey: resolvePlaceIcon(category),
      source: "google" as const,
      ...(p.location?.latitude != null ? { lat: p.location.latitude } : {}),
      ...(p.location?.longitude != null ? { lng: p.location.longitude } : {}),
    };
  });
}

// Persist a Google Places hit into the local cache. Called when the user
// picks a Google search result so subsequent lookups (and the editor map)
// have lat/lng + icon ready. Idempotent via upsert on googlePlaceId.
export async function upsertPlaceFromGoogle(input: PlaceSearchResult) {
  const iconKey = input.iconKey ?? resolvePlaceIcon(input.category);
  // Phase 12a — preserve any user-edited display name on refresh. The Google
  // canonical name always lands in `originalName`; `name` (denormalized cache)
  // = `userEditedName ?? originalName`.
  const existing = await prisma.place.findUnique({
    where: { googlePlaceId: input.googlePlaceId },
    select: { userEditedName: true },
  });
  const displayName = existing?.userEditedName ?? input.name;
  return prisma.place.upsert({
    where: { googlePlaceId: input.googlePlaceId },
    update: {
      name: displayName,
      originalName: input.name,
      category: input.category,
      address: input.address ?? null,
      iconKey,
      rating: input.rating ?? null,
      ratingCount: input.ratingCount ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      fetchedAt: new Date(),
    },
    create: {
      googlePlaceId: input.googlePlaceId,
      name: input.name,
      originalName: input.name,
      category: input.category,
      address: input.address ?? null,
      iconKey,
      rating: input.rating ?? null,
      ratingCount: input.ratingCount ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      defaultStayMinutes: suggestStayMinutes(iconKey),
      defaultStaySource: "HEURISTIC",
      fetchedAt: new Date(),
    },
  });
}

// Phase 12a — set or clear a user-defined display name override for a Place.
// Pass null/empty to revert to the canonical `originalName`. Keeps the
// denormalized `name` cache in sync.
export async function setPlaceUserEditedName(
  googlePlaceId: string,
  userEditedName: string | null,
) {
  const trimmed = userEditedName?.trim() || null;
  const place = await prisma.place.findUnique({
    where: { googlePlaceId },
    select: { originalName: true },
  });
  if (!place) throw new Error("找不到 Place");
  return prisma.place.update({
    where: { googlePlaceId },
    data: {
      userEditedName: trimmed,
      name: trimmed ?? place.originalName,
    },
  });
}
