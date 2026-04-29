"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import {
  listTripMembersAction,
  pingTripMembershipAction,
} from "@/app/(actions)/share-actions";
import type { MemberPublic } from "@/lib/services/share-service";

// Heartbeat + active-now badge for a trip. Mounted in EditorHeader.
//
// Strategy (cheap + good enough for occasional collab):
// · Send a heartbeat every 15s while the tab is focused
// · Re-fetch the member list every 30s; "active" = lastSeenAt within 60s
// · No WebSocket / SSE — keeps the Cloudflare Worker bundle light. If
//   real-time collaboration becomes a need we can swap in a Durable
//   Object channel without changing the UI.

const HEARTBEAT_MS = 15_000;
const REFRESH_MS = 30_000;
const ACTIVE_WINDOW_MS = 60_000;

export function PresenceIndicator({ tripId }: { tripId: string }) {
  const [members, setMembers] = useState<MemberPublic[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchMembers() {
      try {
        const m = await listTripMembersAction(tripId);
        if (!cancelled) setMembers(m);
      } catch {
        /* ignore — non-critical */
      }
    }
    async function ping() {
      try {
        await pingTripMembershipAction(tripId);
      } catch {
        /* ignore */
      }
    }

    // Run immediately on mount
    fetchMembers();
    ping();

    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") ping();
    }, HEARTBEAT_MS);
    const refresh = setInterval(fetchMembers, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      clearInterval(refresh);
    };
  }, [tripId]);

  const now = Date.now();
  const active = members.filter(
    (m) => now - new Date(m.lastSeenAt).getTime() < ACTIVE_WINDOW_MS,
  );

  // Solo trip → don't render anything (no benefit showing "1 active" alone)
  if (members.length <= 1) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-pill bg-surface-card px-2 py-1 text-caption text-ink hover:bg-surface-strong"
        title={`${members.length} 名成員，${active.length} 人現在在線`}
      >
        <Users size={11} strokeWidth={2} />
        <span className="text-[11px]">{members.length}</span>
        {active.length > 1 && (
          <span className="ml-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[240px] rounded-lg border border-hairline bg-canvas p-2 shadow-soft-elevation"
          onMouseLeave={() => setOpen(false)}
        >
          <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-soft">
            成員（{members.length}）
          </p>
          <ul className="space-y-0.5">
            {members.map((m) => {
              const isActive = now - new Date(m.lastSeenAt).getTime() < ACTIVE_WINDOW_MS;
              return (
                <li
                  key={m.userId}
                  className="flex items-center gap-2 rounded px-2 py-1 text-caption"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-success" : "bg-muted-soft"}`} />
                  <span className="truncate text-ink">{m.displayName}</span>
                  {m.isMe && <span className="ml-auto text-[10px] text-muted-soft">你</span>}
                  {!m.isMe && m.isOwner && <span className="ml-auto text-[10px] text-muted-soft">擁有者</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
