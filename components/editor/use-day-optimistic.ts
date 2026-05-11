"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { commitDayEditsAction } from "@/app/(actions)/schedule-actions";
import type { DayEditOp } from "@/lib/services/schedule-service";
import { useToast } from "@/components/ui/Toast";

// Phase 12f — week-view optimistic store, scoped per-day.
//
// Lifecycle:
//   1. dispatchOp(op) appends to a queue; the UI is expected to apply the
//      visual change locally (the store does not project items itself —
//      keeping the projection inside WeekGridView avoids re-implementing
//      cascade math here).
//   2. After 600ms idle, queued ops are flushed in one commitDayEditsAction
//      with the day's last-known version.
//   3. On success, baseline version updates.
//   4. On conflict (server version moved underneath us), the queue is
//      dropped, a toast offers a refresh.
//   5. On error, ops are kept in the queue for a single retry; persistent
//      failure surfaces a toast.

type State = {
  queued: DayEditOp[];
  flushing: DayEditOp[];
  baselineVersion: number;
  status: "idle" | "debouncing" | "flushing" | "error";
};

const DEBOUNCE_MS = 600;

export function useDayOptimistic(
  tripId: string,
  dayId: string,
  initialVersion: number,
) {
  const [state, setState] = useState<State>({
    queued: [],
    flushing: [],
    baselineVersion: initialVersion,
    status: "idle",
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const { addToast } = useToast();

  // Keep baseline in sync when parent re-renders with fresh server data
  // (revalidatePath after our own commits).
  useEffect(() => {
    setState((s) =>
      s.baselineVersion === initialVersion ? s : { ...s, baselineVersion: initialVersion },
    );
  }, [initialVersion]);

  const flush = useCallback(async () => {
    const cur = stateRef.current;
    if (cur.queued.length === 0) return;
    const ops = collapseOps(cur.queued);
    setState((s) => ({ ...s, queued: [], flushing: ops, status: "flushing" }));

    const r = await commitDayEditsAction(tripId, dayId, ops, cur.baselineVersion);
    if (r.ok) {
      setState((s) => ({ ...s, flushing: [], baselineVersion: r.version, status: "idle" }));
      return;
    }
    if ("conflict" in r && r.conflict) {
      // Other actor moved Day.version forward (TripShare collaborator, or
      // our own concurrent tab). Abandon stale ops; user re-edits on fresh data.
      setState((s) => ({
        ...s,
        flushing: [],
        baselineVersion: r.serverVersion,
        status: "idle",
      }));
      addToast({
        kind: "info",
        message: "他人已修改本日內容，已載入最新版本",
        durationMs: 5000,
      });
      return;
    }
    // Generic error → keep ops queued for retry, surface toast with action.
    setState((s) => ({
      ...s,
      queued: [...cur.flushing, ...s.queued],
      flushing: [],
      status: "error",
    }));
    const errMsg = "error" in r ? r.error : "儲存失敗";
    addToast({
      kind: "error",
      message: `儲存失敗：${errMsg}`,
      action: {
        label: "重試",
        onClick: () => void flush(),
      },
      durationMs: 0,
    });
  }, [tripId, dayId, addToast]);

  const dispatchOp = useCallback(
    (op: DayEditOp) => {
      setState((s) => ({ ...s, queued: [...s.queued, op], status: "debouncing" }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void flush();
      }, DEBOUNCE_MS);
    },
    [flush],
  );

  // Flush on unmount so navigation away doesn't drop pending edits.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      // Best-effort sync flush; if user navigates away before it lands,
      // revalidatePath next time they land will reflect committed state.
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    dispatchOp,
    status: state.status,
    pendingCount: state.queued.length + state.flushing.length,
  };
}

// Collapse rules:
//   - Same itemId + updateTimes × N → keep last
//   - moveToDay then updateTimes for same item → keep both, in order
//   - Different items → keep all
function collapseOps(ops: DayEditOp[]): DayEditOp[] {
  const out: DayEditOp[] = [];
  const lastUpdateIndex = new Map<string, number>();
  for (const op of ops) {
    if (op.kind === "updateTimes") {
      const prev = lastUpdateIndex.get(op.itemId);
      if (prev != null) {
        // overwrite previous updateTimes for the same item (in place)
        out[prev] = op;
        continue;
      }
      lastUpdateIndex.set(op.itemId, out.length);
      out.push(op);
    } else {
      out.push(op);
    }
  }
  return out;
}
