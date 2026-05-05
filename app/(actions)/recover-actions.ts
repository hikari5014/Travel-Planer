"use server";

import { revalidatePath } from "next/cache";
import { claimAllOrphans, scanOrphans } from "@/lib/services/backup-service";

export async function scanOrphansAction() {
  return scanOrphans();
}

export async function claimAllOrphansAction() {
  const result = await claimAllOrphans();
  revalidatePath("/");
  revalidatePath("/settings");
  return result;
}
