"use server";

import { revalidatePath } from "next/cache";
import {
  addScheduleItem,
  commitDayEdits,
  deleteScheduleItem,
  moveItemToDay,
  reorderItemsInDay,
  splitTransportAndInsertPlace,
  updateItemTimes,
  updateScheduleItemMetadata,
  updateScheduleItemKind,
  type CommitDayEditsResult,
  type DayEditOp,
} from "@/lib/services/schedule-service";
import {
  createCustomPlace,
  placeDetailsByGoogleId,
  placesNearby,
  searchPlaces,
  setPlaceUserEditedName,
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
  kind:
    | "ATTRACTION"
    | "MEAL"
    | "LODGING"
    | "FREE"
    | "FLIGHT"
    | "CAR_RENTAL"
    | "TRAIN";
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
  kind:
    | "ATTRACTION"
    | "MEAL"
    | "LODGING"
    | "FREE"
    | "FLIGHT"
    | "CAR_RENTAL"
    | "TRAIN";
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

// Phase 10h — change an existing ScheduleItem's kind in-place. Used when the
// user adds a place before realising it should be FLIGHT / TRAIN / CAR_RENTAL.
export async function updateItemKindAction(
  tripId: string,
  itemId: string,
  newKind:
    | "ATTRACTION"
    | "MEAL"
    | "LODGING"
    | "FREE"
    | "FLIGHT"
    | "CAR_RENTAL"
    | "TRAIN"
    | "TRANSPORT_STOP",
) {
  await updateScheduleItemKind(itemId, newKind);
  revalidatePath(`/trips/${tripId}`);
}

// Phase 10c — write kind-specific metadata + optional note in one call.
// Used by FloatingPlaceCard's edit form. Recalc plan expenses runs
// automatically inside updateScheduleItemMetadata.
export async function updateItemMetadataAction(
  tripId: string,
  itemId: string,
  metadata: Record<string, unknown> | null,
  note?: string | null,
) {
  await updateScheduleItemMetadata(itemId, metadata, note);
  revalidatePath(`/trips/${tripId}`);
}

// Phase 12d — split a Transport at a specific time, inserting a new place
// in between. Used by the WeekGridView click-on-path / drag-placeholder
// flows. Forwards a Google Places hit so the place is upserted before the
// FK insert (same pattern as addScheduleItemAction's googlePlace argument).
export async function splitTransportAndInsertPlaceAction(input: {
  tripId: string;
  transportId: string;
  googlePlace: PlaceSearchResult;
  kind:
    | "ATTRACTION"
    | "MEAL"
    | "LODGING"
    | "FREE"
    | "TRANSPORT_STOP"
    | "FLIGHT"
    | "CAR_RENTAL"
    | "TRAIN";
  atTime: string; // "HH:MM"
}) {
  await upsertPlaceFromGoogle(input.googlePlace);
  await splitTransportAndInsertPlace({
    transportId: input.transportId,
    googlePlaceId: input.googlePlace.googlePlaceId,
    kind: input.kind,
    atTime: input.atTime,
  });
  revalidatePath(`/trips/${input.tripId}`);
}

// Phase 12a — user-edited place name override. Pass empty / null to revert
// the display name back to the canonical Google name.
export async function setPlaceNameAction(
  tripId: string,
  googlePlaceId: string,
  userEditedName: string | null,
) {
  await setPlaceUserEditedName(googlePlaceId, userEditedName);
  revalidatePath(`/trips/${tripId}`);
}

// Phase 12f — batched, optimistically-staged edits from the week-view
// optimistic store. ops are applied in order under a single transaction
// with optimistic-version check on Day.version.
export async function commitDayEditsAction(
  tripId: string,
  dayId: string,
  ops: DayEditOp[],
  baseVersion: number,
): Promise<CommitDayEditsResult> {
  const r = await commitDayEdits(dayId, ops, baseVersion);
  if (r.ok) revalidatePath(`/trips/${tripId}`);
  return r;
}
