import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolvePlaceIcon, type PlaceIconKey } from "@/lib/place-icon";
import { suggestStayMinutes } from "./heuristic-stay";

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
  source: "cache" | "stub";
};

// Phase 1a: search the local Place cache. When a Google Maps key is set,
// Phase 2+ extends this to call Google Places Autocomplete in parallel.
export async function searchPlaces(query: string, limit = 8): Promise<PlaceSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
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
    source: "cache",
  }));
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
// Accept the input shape (allows omitted optional fields) and rely on parse()
// to apply defaults.
export async function createCustomPlace(input: z.input<typeof placeCreateSchema>) {
  const parsed = placeCreateSchema.parse(input);
  const iconKey = (parsed.iconKey as PlaceIconKey | undefined) ?? resolvePlaceIcon(parsed.category);
  const id = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return prisma.place.create({
    data: {
      googlePlaceId: id,
      name: parsed.name,
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
