"use server";

import { revalidatePath } from "next/cache";
import {
  addPhoto,
  deletePhoto,
  listPhotos,
  updatePhotoCaption,
  type StoredPhoto,
} from "@/lib/services/photo-service";

// Phase 10b — server actions for ScheduleItem photos.
// Result envelopes so client can show user-readable errors instead of the
// generic "An unexpected response" wrapper.

export type PhotosResult =
  | { ok: true; photos: StoredPhoto[] }
  | { ok: false; error: string };

export type PhotoResult =
  | { ok: true; photo: StoredPhoto }
  | { ok: false; error: string };

export async function listPhotosAction(scheduleItemId: string): Promise<PhotosResult> {
  try {
    const photos = await listPhotos(scheduleItemId);
    return { ok: true, photos };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "讀取失敗" };
  }
}

export async function addPhotoAction(input: {
  tripId: string;
  scheduleItemId: string;
  mimeType: string;
  base64: string;
  byteSize?: number;
  caption?: string;
}): Promise<PhotoResult> {
  try {
    const photo = await addPhoto({
      scheduleItemId: input.scheduleItemId,
      mimeType: input.mimeType,
      base64: input.base64,
      ...(input.byteSize !== undefined ? { byteSize: input.byteSize } : {}),
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
    });
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true, photo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "上傳失敗" };
  }
}

export async function deletePhotoAction(input: {
  tripId: string;
  photoId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await deletePhoto(input.photoId);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "刪除失敗" };
  }
}

export async function updatePhotoCaptionAction(input: {
  tripId: string;
  photoId: string;
  caption: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await updatePhotoCaption(input.photoId, input.caption);
    revalidatePath(`/trips/${input.tripId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "更新失敗" };
  }
}
