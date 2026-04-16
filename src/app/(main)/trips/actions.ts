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

export async function cancelTrip(rawData: unknown): Promise<ActionResult> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = cancelTripSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { data: trip, error: fetchError } = await supabase
    .from("trips")
    .select("driver_id, status")
    .eq("id", parsed.data.trip_id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !trip) {
    return { success: false, error: "Trip not found." };
  }
  if (trip.driver_id !== user.id) {
    return { success: false, error: "Unauthorized." };
  }
  if (trip.status === "cancelled" || trip.status === "completed") {
    return { success: false, error: `Trip is already ${trip.status}.` };
  }

  const { error: updateError } = await supabase
    .from("trips")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.trip_id)
    .single();

  if (updateError) {
    console.error("[cancelTrip]", updateError.message);
    return { success: false, error: "Failed to cancel trip. Please try again." };
  }

  revalidatePath("/trips");
  return { success: true };
}
