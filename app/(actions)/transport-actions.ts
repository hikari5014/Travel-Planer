"use server";

import { revalidatePath } from "next/cache";
import {
  resetTransportToAuto,
  updateTransport,
  type TransportUpdateInput,
} from "@/lib/services/transport-service";
import {
  placesParkingNearby,
  upsertPlaceFromGoogle,
  type PlaceSearchResult,
} from "@/lib/services/place-service";
import { prisma } from "@/lib/db";

export async function updateTransportAction(
  tripId: string,
  transportId: string,
  input: TransportUpdateInput,
) {
  await updateTransport(transportId, input);
  revalidatePath(`/trips/${tripId}`);
}

export async function resetTransportAction(tripId: string, transportId: string) {
  await resetTransportToAuto(transportId);
  revalidatePath(`/trips/${tripId}`);
}

// Parking suggestion for a DRIVING segment. Resolves the Transport's "to"
// schedule item's place, queries Google Places for nearby parking lots
// within `radiusM`, and returns the candidates. The user picks one in the
// UI; setTransportParking persists the choice.
export async function suggestParkingAction(
  transportId: string,
  radiusM: number = 500,
): Promise<{ ok: true; results: PlaceSearchResult[] } | { ok: false; error: string }> {
  try {
    const transport = await prisma.transport.findUnique({
      where: { id: transportId },
      include: { toItem: { include: { place: true } } },
    });
    if (!transport?.toItem?.place) return { ok: false, error: "找不到目的景點的座標" };
    const p = transport.toItem.place;
    if (p.lat == null || p.lng == null) {
      return { ok: false, error: "目的景點沒有 lat/lng — 請先選一個 Google 收錄的景點" };
    }
    const results = await placesParkingNearby(p.lat, p.lng, radiusM);
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setTransportParkingAction(
  tripId: string,
  transportId: string,
  parking: PlaceSearchResult,
) {
  await upsertPlaceFromGoogle(parking);
  await prisma.transport.update({
    where: { id: transportId },
    data: { parkingPlaceId: parking.googlePlaceId },
  });
  revalidatePath(`/trips/${tripId}`);
}

export async function clearTransportParkingAction(tripId: string, transportId: string) {
  await prisma.transport.update({
    where: { id: transportId },
    data: { parkingPlaceId: null },
  });
  revalidatePath(`/trips/${tripId}`);
}
