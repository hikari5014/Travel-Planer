"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTrip, deleteTrip, tripCreateSchema } from "@/lib/services/trip-service";

export async function createTripAction(formData: FormData) {
  const parsed = tripCreateSchema.safeParse({
    title: formData.get("title") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    destination: formData.get("destination") ?? "",
    subtitle: formData.get("subtitle") ?? "",
    baseCurrency: formData.get("baseCurrency") || "TWD",
    coverIconKey: formData.get("coverIconKey") || "landmark",
    coverColor: formData.get("coverColor") || "from-[#3b82f6] to-[#8b5cf6]",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(issue?.message ?? "輸入有誤");
  }
  const tripId = await createTrip(parsed.data);
  revalidatePath("/");
  redirect(`/trips/${tripId}`);
}

export async function deleteTripAction(tripId: string) {
  await deleteTrip(tripId);
  revalidatePath("/");
}
