"use server";

import { revalidatePath } from "next/cache";
import {
  createShareLink,
  joinTripViaToken,
  listShareLinks,
  listTripMembers,
  pingTripMembership,
  removeMember,
  revokeShareLink,
  updateMemberRole,
} from "@/lib/services/share-service";

export async function createShareLinkAction(input: {
  tripId: string;
  role: "editor" | "viewer";
  label?: string;
}) {
  const result = await createShareLink({
    tripId: input.tripId,
    role: input.role,
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
  });
  revalidatePath(`/trips/${input.tripId}`);
  return result;
}

export async function listShareLinksAction(tripId: string) {
  return listShareLinks(tripId);
}

export async function listTripMembersAction(tripId: string) {
  return listTripMembers(tripId);
}

export async function revokeShareLinkAction(tripId: string, shareId: string, removeMembers = false) {
  await revokeShareLink(shareId, removeMembers);
  revalidatePath(`/trips/${tripId}`);
}

export async function removeMemberAction(tripId: string, targetUserId: string) {
  await removeMember(tripId, targetUserId);
  revalidatePath(`/trips/${tripId}`);
}

export async function updateMemberRoleAction(
  tripId: string,
  targetUserId: string,
  role: "editor" | "viewer",
) {
  await updateMemberRole(tripId, targetUserId, role);
  revalidatePath(`/trips/${tripId}`);
}

// Called from the /join landing page with the URL token.
export async function joinTripViaTokenAction(tripId: string, rawToken: string) {
  return joinTripViaToken(tripId, rawToken);
}

// Heartbeat — touched by the editor every ~5s while focused. Updates
// TripMember.lastSeenAt (or User.lastSeenAt for the owner) so the active-
// members UI can highlight who's currently editing.
export async function pingTripMembershipAction(tripId: string) {
  await pingTripMembership(tripId);
}
