"use server";

import { revalidatePath } from "next/cache";
import {
  resetTransportToAuto,
  updateTransport,
  type TransportUpdateInput,
} from "@/lib/services/transport-service";

export async function updateTransportAction(
  tripId: string,
  transportId: string,
  input: TransportUpdateInput,
) {
  await updateTransport(transportId, input);
  revalidatePath(`/trips/${tripId}`);
}

export async function resetTransportAction(tripId: string, transportId: string) {
  await resetTransportToAuto(transportId);
  revalidatePath(`/trips/${tripId}`);
}
