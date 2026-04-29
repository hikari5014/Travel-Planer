"use server";

import { revalidatePath } from "next/cache";
import {
  addScheduleItem,
  deleteScheduleItem,
  moveItemToDay,
  reorderItemsInDay,
  updateItemTimes,
} from "@/lib/services/schedule-service";
import {
  createCustomPlace,
  placesNearby,
  searchPlaces,
  upsertPlaceFromGoogle,
  type PlaceSearchResult,
} from "@/lib/services/place-service";
import type { PlaceIconKey } from "@/lib/place-icon";

export async function searchPlacesAction(query: string) {
  return searchPlaces(query);
}

// Click-on-map → server queries Google Places nearby (≤60m). Returns the
// closest named POIs so the user can pick (or create a custom marker if
// the spot isn't a labeled place).
export async function placesNearbyAction(lat: number, lng: number) {
  return placesNearby(lat, lng, 80, 10);
}

export async function addScheduleItemAction(input: {
  tripId: string;
  dayId: string;
  placeId: string;
  kind: "ATTRACTION" | "MEAL" | "LODGING" | "FREE";
  startTime?: string;
  isAllDay?: boolean;
  // When the user picks a Google Places search hit we receive the full row;
  // persist it into the local cache before the FK on ScheduleItem fires.
  googlePlace?: PlaceSearchResult;
}) {
  if (input.googlePlace && input.googlePlace.source === "google") {
    await upsertPlaceFromGoogle(input.googlePlace);
  }
  await addScheduleItem({
    dayId: input.dayId,
    placeId: input.placeId,
    kind: input.kind,
    ...(input.startTime ? { startTime: input.startTime } : {}),
    isAllDay: input.isAllDay ?? false,
  });
  revalidatePath(`/trips/${input.tripId}`);
}

export async function createPlaceAndAddAction(input: {
  tripId: string;
  dayId: string;
  kind: "ATTRACTION" | "MEAL" | "LODGING" | "FREE";
  name: string;
  category: string;
  address?: string;
  iconKey?: PlaceIconKey;
}) {
  const place = await createCustomPlace({
    name: input.name,
    category: input.category,
    ...(input.address ? { address: input.address } : {}),
    ...(input.iconKey ? { iconKey: input.iconKey } : {}),
  });
  await addScheduleItem({
    dayId: input.dayId,
    placeId: place.googlePlaceId,
    kind: input.kind,
    isAllDay: input.kind === "LODGING",
  });
  revalidatePath(`/trips/${input.tripId}`);
}

export async function deleteScheduleItemAction(tripId: string, itemId: string) {
  await deleteScheduleItem(itemId);
  revalidatePath(`/trips/${tripId}`);
}

export async function reorderItemsAction(tripId: string, dayId: string, orderedIds: string[]) {
  await reorderItemsInDay(dayId, orderedIds);
  revalidatePath(`/trips/${tripId}`);
}

export async function moveItemToDayAction(tripId: string, itemId: string, targetDayId: string) {
  await moveItemToDay(itemId, targetDayId);
  revalidatePath(`/trips/${tripId}`);
}

export async function updateItemTimesAction(
  tripId: string,
  itemId: string,
  startTime: string,
  endTime: string,
) {
  await updateItemTimes(itemId, startTime, endTime);
  revalidatePath(`/trips/${tripId}`);
}
