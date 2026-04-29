import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { ensureCurrentUser, getCurrentUserId } from "@/lib/auth/current-user";

// Phase 8 — link-based collaboration helpers.
// Tokens follow the public-secret pattern: the raw token lives only in the
// share URL (?t=...) the owner copies. We store SHA-256(token) so a DB leak
// doesn't reveal active links.

export type TripRole = "owner" | "editor" | "viewer";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// 22-char URL-safe token (~128 bits of entropy). Short enough to share via
// chat, long enough to be unguessable.
function generateToken(): string {
  return randomBytes(16).toString("base64url");
}

// ─────────────────────────────────────────────────────────────────────────────
// Access check — central permission helper. Use everywhere a service needs
// to verify the current user can read or write a Trip.
// ─────────────────────────────────────────────────────────────────────────────

export async function getTripRole(tripId: string, userId?: string): Promise<TripRole | null> {
  const uid = userId ?? (await getCurrentUserId());
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { userId: true },
  });
  if (!trip) return null;
  if (trip.userId === uid) return "owner";
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: uid } },
  });
  if (!member || member.removedAt) return null;
  return member.role as TripRole;
}

export async function canEditTrip(tripId: string): Promise<boolean> {
  const role = await getTripRole(tripId);
  return role === "owner" || role === "editor";
}

export async function canViewTrip(tripId: string): Promise<boolean> {
  return (await getTripRole(tripId)) !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Share-link CRUD
// ─────────────────────────────────────────────────────────────────────────────

export type SharePublic = {
  id: string;
  tripId: string;
  token: string; // raw token — only returned at creation; subsequent reads omit
  role: "editor" | "viewer";
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  memberCount: number;
};

export type ShareListItem = Omit<SharePublic, "token">;

export async function createShareLink(input: {
  tripId: string;
  role: "editor" | "viewer";
  label?: string;
  expiresAt?: Date | null;
}): Promise<SharePublic> {
  const role = await getTripRole(input.tripId);
  if (role !== "owner") throw new Error("只有旅程擁有者才能建立分享連結");
  const me = await ensureCurrentUser();

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const share = await prisma.tripShare.create({
    data: {
      tripId: input.tripId,
      tokenHash,
      role: input.role,
      label: input.label ?? null,
      createdById: me.id,
      expiresAt: input.expiresAt ?? null,
    },
  });
  return {
    id: share.id,
    tripId: share.tripId,
    token: rawToken,
    role: share.role as "editor" | "viewer",
    label: share.label,
    createdAt: share.createdAt.toISOString(),
    expiresAt: share.expiresAt?.toISOString() ?? null,
    revokedAt: null,
    memberCount: 0,
  };
}

export async function listShareLinks(tripId: string): Promise<ShareListItem[]> {
  const role = await getTripRole(tripId);
  if (role !== "owner") return [];
  const shares = await prisma.tripShare.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { members: true } } },
  });
  return shares.map((s) => ({
    id: s.id,
    tripId: s.tripId,
    role: s.role as "editor" | "viewer",
    label: s.label,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt?.toISOString() ?? null,
    revokedAt: s.revokedAt?.toISOString() ?? null,
    memberCount: s._count.members,
  }));
}

export async function revokeShareLink(shareId: string, removeMembers: boolean = false) {
  const share = await prisma.tripShare.findUnique({ where: { id: shareId } });
  if (!share) return;
  const role = await getTripRole(share.tripId);
  if (role !== "owner") throw new Error("只有旅程擁有者才能撤銷分享連結");

  await prisma.$transaction(async (tx) => {
    await tx.tripShare.update({
      where: { id: shareId },
      data: { revokedAt: new Date() },
    });
    if (removeMembers) {
      await tx.tripMember.updateMany({
        where: { joinedViaShareId: shareId, removedAt: null },
        data: { removedAt: new Date() },
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Joining via token — called when someone visits /trip/:id?t=:token
// ─────────────────────────────────────────────────────────────────────────────

export async function joinTripViaToken(
  tripId: string,
  rawToken: string,
): Promise<{ ok: true; role: "editor" | "viewer" } | { ok: false; error: string }> {
  const tokenHash = hashToken(rawToken);
  const share = await prisma.tripShare.findFirst({
    where: { tripId, tokenHash },
  });
  if (!share) return { ok: false, error: "分享連結無效" };
  if (share.revokedAt) return { ok: false, error: "分享連結已被撤銷" };
  if (share.expiresAt && share.expiresAt < new Date()) {
    return { ok: false, error: "分享連結已過期" };
  }

  const me = await ensureCurrentUser();

  // Owner doesn't need a TripMember row — short-circuit.
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { userId: true },
  });
  if (trip?.userId === me.id) return { ok: true, role: "editor" };

  await prisma.tripMember.upsert({
    where: { tripId_userId: { tripId, userId: me.id } },
    create: {
      tripId,
      userId: me.id,
      role: share.role,
      joinedViaShareId: share.id,
    },
    update: {
      // If they previously joined and were removed, restore + bump role.
      removedAt: null,
      lastSeenAt: new Date(),
      role: share.role,
      joinedViaShareId: share.id,
    },
  });

  return { ok: true, role: share.role as "editor" | "viewer" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Member listing / management
// ─────────────────────────────────────────────────────────────────────────────

export type MemberPublic = {
  userId: string;
  displayName: string;
  role: TripRole;
  joinedAt: string;
  lastSeenAt: string;
  isOwner: boolean;
  isMe: boolean;
};

export async function listTripMembers(tripId: string): Promise<MemberPublic[]> {
  const me = await getCurrentUserId();
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { userId: true, owner: true, createdAt: true },
  });
  if (!trip) return [];

  const out: MemberPublic[] = [];
  // Owner first
  if (trip.owner) {
    out.push({
      userId: trip.owner.id,
      displayName: trip.owner.displayName,
      role: "owner",
      joinedAt: trip.createdAt.toISOString(),
      lastSeenAt: trip.owner.lastSeenAt.toISOString(),
      isOwner: true,
      isMe: trip.owner.id === me,
    });
  }
  const members = await prisma.tripMember.findMany({
    where: { tripId, removedAt: null },
    include: { user: true },
    orderBy: { joinedAt: "asc" },
  });
  for (const m of members) {
    if (m.userId === trip.userId) continue; // owner already added
    out.push({
      userId: m.userId,
      displayName: m.user.displayName,
      role: m.role as TripRole,
      joinedAt: m.joinedAt.toISOString(),
      lastSeenAt: m.lastSeenAt.toISOString(),
      isOwner: false,
      isMe: m.userId === me,
    });
  }
  return out;
}

export async function removeMember(tripId: string, targetUserId: string) {
  const role = await getTripRole(tripId);
  if (role !== "owner") throw new Error("只有擁有者可以移除成員");
  await prisma.tripMember.update({
    where: { tripId_userId: { tripId, userId: targetUserId } },
    data: { removedAt: new Date() },
  });
}

export async function updateMemberRole(tripId: string, targetUserId: string, role: "editor" | "viewer") {
  const myRole = await getTripRole(tripId);
  if (myRole !== "owner") throw new Error("只有擁有者可以變更成員角色");
  await prisma.tripMember.update({
    where: { tripId_userId: { tripId, userId: targetUserId } },
    data: { role },
  });
}

// Touch lastSeenAt — called periodically by the editor to power "active now"
// avatars without a websocket.
export async function pingTripMembership(tripId: string) {
  const me = await getCurrentUserId();
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { userId: true },
  });
  if (!trip) return;
  if (trip.userId === me) {
    await prisma.user.update({ where: { id: me }, data: { lastSeenAt: new Date() } });
    return;
  }
  await prisma.tripMember.updateMany({
    where: { tripId, userId: me, removedAt: null },
    data: { lastSeenAt: new Date() },
  });
  await prisma.user.update({ where: { id: me }, data: { lastSeenAt: new Date() } });
}
