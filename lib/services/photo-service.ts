import "server-only";
import { prisma } from "@/lib/db";

// Phase 10b — Photo storage.
//
// Dev mode stashes the bytes as base64 inside SQLite (`Photo.data`). Prod
// will swap to R2 / Cloudinary by writing to `Photo.url` instead — the
// reader (`listPhotos`) returns whichever is set.
//
// We cap inline payloads at 4 MB so the SQLite row + JSON envelope stays
// under request body limits. Larger files should be downsized client-side
// before upload (the FloatingPlaceCard does a canvas resize pass).

const MAX_INLINE_BYTES = 4 * 1024 * 1024;

export type StoredPhoto = {
  id: string;
  caption: string | null;
  mimeType: string;
  src: string; // ready-to-use src= for <img/>: data URL or remote URL
  byteSize: number | null;
  orderIndex: number;
  createdAt: string;
};

export async function listPhotos(scheduleItemId: string): Promise<StoredPhoto[]> {
  const rows = await prisma.photo.findMany({
    where: { scheduleItemId },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    caption: r.caption,
    mimeType: r.mimeType,
    src: r.url ?? (r.data ? `data:${r.mimeType};base64,${r.data}` : ""),
    byteSize: r.byteSize,
    orderIndex: r.orderIndex,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addPhoto(input: {
  scheduleItemId: string;
  mimeType: string;
  base64: string; // pure base64, no data: prefix
  byteSize?: number;
  caption?: string;
}): Promise<StoredPhoto> {
  if (!input.base64) throw new Error("空的圖片資料");
  // base64 is ~4/3 the source size; quick guard
  const approxBytes = Math.floor((input.base64.length * 3) / 4);
  if (approxBytes > MAX_INLINE_BYTES) {
    throw new Error(`照片太大（約 ${(approxBytes / 1024 / 1024).toFixed(1)} MB），上限 4 MB`);
  }

  const last = await prisma.photo.findFirst({
    where: { scheduleItemId: input.scheduleItemId },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });

  const row = await prisma.photo.create({
    data: {
      scheduleItemId: input.scheduleItemId,
      mimeType: input.mimeType,
      data: input.base64,
      byteSize: input.byteSize ?? approxBytes,
      caption: input.caption ?? null,
      orderIndex: (last?.orderIndex ?? 0) + 1,
    },
  });

  return {
    id: row.id,
    caption: row.caption,
    mimeType: row.mimeType,
    src: `data:${row.mimeType};base64,${row.data}`,
    byteSize: row.byteSize,
    orderIndex: row.orderIndex,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function deletePhoto(id: string): Promise<void> {
  await prisma.photo.delete({ where: { id } });
}

export async function updatePhotoCaption(id: string, caption: string | null): Promise<void> {
  await prisma.photo.update({
    where: { id },
    data: { caption: caption ?? null },
  });
}
