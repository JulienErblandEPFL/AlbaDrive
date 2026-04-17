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
    return { success: false, error: "Authentification requise." };
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
    return { success: false, error: "La création du trajet a échoué. Veuillez réessayer." };
  }

  revalidatePath("/trips");
  return { success: true, data: trip };
}

export async function cancelTrip(rawData: unknown): Promise<ActionResult> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentification requise." };
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
    return { success: false, error: "Trajet introuvable." };
  }
  if (trip.driver_id !== user.id) {
    return { success: false, error: "Action non autorisée." };
  }
  const statusLabels: Record<string, string> = { cancelled: "annulé", completed: "terminé" };
  if (trip.status === "cancelled" || trip.status === "completed") {
    return { success: false, error: `Ce trajet est déjà ${statusLabels[trip.status] ?? trip.status}.` };
  }

  const { error: updateError } = await supabase
    .from("trips")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.trip_id)
    .single();

  if (updateError) {
    console.error("[cancelTrip]", updateError.message);
    return { success: false, error: "L'annulation du trajet a échoué. Veuillez réessayer." };
  }

  revalidatePath("/trips");
  return { success: true };
}
