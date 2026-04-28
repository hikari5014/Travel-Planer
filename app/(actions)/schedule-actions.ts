"use server";

import { revalidatePath } from "next/cache";
import {
  addScheduleItem,
  deleteScheduleItem,
  moveItemToDay,
  reorderItemsInDay,
  updateItemTimes,
} from "@/lib/services/schedule-service";
import { createCustomPlace, searchPlaces } from "@/lib/services/place-service";
import type { PlaceIconKey } from "@/lib/place-icon";

export async function searchPlacesAction(query: string) {
  return searchPlaces(query);
}

export async function addScheduleItemAction(input: {
  tripId: string;
  dayId: string;
  placeId: string;
  kind: "ATTRACTION" | "MEAL" | "LODGING" | "FREE";
  startTime?: string;
  isAllDay?: boolean;
}) {
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
