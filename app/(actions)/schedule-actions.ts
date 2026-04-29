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
  placeDetailsByGoogleId,
  placesNearby,
  searchPlaces,
  upsertPlaceFromGoogle,
  type PlaceSearchResult,
} from "@/lib/services/place-service";
import type { PlaceIconKey } from "@/lib/place-icon";

export async function searchPlacesAction(query: string) {
  return searchPlaces(query);
}

// Result envelope so server-side errors are visible client-side instead of
// being swallowed by Next.js's generic "An unexpected response" wrapper.
export type PlacesLookupResult =
  | { ok: true; results: PlaceSearchResult[] }
  | { ok: false; error: string; hint?: string };

// Click-on-map at lat/lng → nearby POIs.
export async function placesNearbyAction(lat: number, lng: number): Promise<PlacesLookupResult> {
  try {
    const results = await placesNearby(lat, lng, 80, 10);
    return { ok: true, results };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, hint: hintForError(msg) };
  }
}

// Click-on-map landed on a labeled Google POI → we already have the placeId,
// fetch its full details (cheaper + more accurate than nearby fuzzy match).
export async function placeByIdAction(googlePlaceId: string): Promise<PlacesLookupResult> {
  try {
    const place = await placeDetailsByGoogleId(googlePlaceId);
    return { ok: true, results: place ? [place] : [] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, hint: hintForError(msg) };
  }
}

function hintForError(msg: string): string | undefined {
  // Common Places (New) failure modes — surface a fix tip in the UI.
  if (/REQUEST_DENIED|API_KEY_HTTP_REFERRER_BLOCKED|requests-from-referer-.*-are-blocked/i.test(msg)) {
    return "你的 Google API Key 設了「HTTP referrer 限制」，但伺服器端呼叫沒有 referer 標頭就會被擋。請在 Cloud Console → Credentials 建立另一把伺服器用 Key（無 referrer 限制 / 改 IP 限制），或臨時解除 referrer 限制做測試。";
  }
  if (/billing|BILLING_DISABLED/i.test(msg)) {
    return "Google Cloud 專案尚未啟用 billing。即使在 $200 免費額度內也要綁卡。";
  }
  if (/not enabled|API has not been used|SERVICE_DISABLED/i.test(msg)) {
    return "請至 Google Cloud Console → APIs & Services → Library 啟用「Places API (New)」。";
  }
  if (/quota|RESOURCE_EXHAUSTED/i.test(msg)) {
    return "已超過 API 配額，請至 Cloud Console 檢查 Quotas 設定。";
  }
  return undefined;
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
