// src/app/(main)/trips/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createTripSchema, cancelTripSchema } from "@/lib/validations/trip.schema";
import type { ActionResult } from "@/types/actions";
import type { TripRow } from "@/types/database.types";

export async function createTrip(rawData: unknown): Promise<ActionResult<TripRow>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = createTripSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { data: trip, error: dbError } = await supabase
    .from("trips")
    .insert({
      driver_id: user.id,
      ...parsed.data,
      available_seats: parsed.data.total_seats,
    })
    .select()
    .single();

  if (dbError) {
    console.error("[createTrip]", dbError.message);
    return { success: false, error: "Failed to create trip. Please try again." };
  }

  revalidatePath("/trips");
  return { success: true, data: trip };
}

// Stub — implemented in Task 4
export async function cancelTrip(_rawData: unknown): Promise<ActionResult> {
  return { success: false, error: "Not implemented" };
}
