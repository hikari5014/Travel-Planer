"use client";

import { useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteTripAction } from "@/app/(actions)/trip-actions";

// Phase 14m — small destructive icon-button overlaid on the top-right of a
// TripCard. Hidden until the card is hovered (group-hover). Single confirm
// dialog before destruction; cascades through Plans / Days / ScheduleItems
// / Transports / Tickets / Expenses / AISuggestions / Photos / TripShare /
// TripMember (all relations have onDelete: Cascade in schema.prisma).
export function DeleteTripButton({
  tripId,
  tripTitle,
}: {
  tripId: string;
  tripTitle: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = window.confirm(
          `確定刪除「${tripTitle}」？\n\n此操作會永久移除：所有方案、每日行程、行程項目、交通段、票券、花費、AI 建議、照片、分享連結與成員。\n\n此操作無法復原。`,
        );
        if (!ok) return;
        startTransition(async () => {
          try {
            await deleteTripAction(tripId);
          } catch (err) {
            window.alert(err instanceof Error ? err.message : "刪除失敗");
          }
        });
      }}
      disabled={pending}
      className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-canvas/90 text-muted opacity-0 shadow-soft-elevation transition-opacity hover:bg-error hover:text-on-primary group-hover:opacity-100 disabled:opacity-50"
      aria-label="刪除旅程"
      title="刪除旅程"
    >
      {pending ? (
        <Loader2 size={13} strokeWidth={2} className="animate-spin" />
      ) : (
        <Trash2 size={13} strokeWidth={2} />
      )}
    </button>
  );
}
