// src/app/[locale]/(main)/trips/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createTripSchema, cancelTripSchema } from "@/lib/validations/trip.schema";
import {
  getSuggestedPriceRange as suggestPriceRange,
  type PriceRangeResult,
} from "@/lib/pricing";
import type { ActionResult } from "@/types/actions";
import type { TripRow } from "@/types/database.types";

export async function createTrip(rawData: unknown): Promise<ActionResult<TripRow>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: { code: "errors.common.auth_required" } };
  }

  const parsed = createTripSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: { code: parsed.error.issues[0].message } };
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
    return { success: false, error: { code: "errors.trip.create_failed" } };
  }

  revalidatePath("/trips");
  return { success: true, data: trip as TripRow };
}

export async function cancelTrip(rawData: unknown): Promise<ActionResult> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: { code: "errors.common.auth_required" } };
  }

  const parsed = cancelTripSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: { code: parsed.error.issues[0].message } };
  }

  const { data: trip, error: fetchError } = await supabase
    .from("trips")
    .select("driver_id, status")
    .eq("id", parsed.data.trip_id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !trip) {
    return { success: false, error: { code: "errors.trip.not_found" } };
  }
  if (trip.driver_id !== user.id) {
    return { success: false, error: { code: "errors.common.unauthorized" } };
  }
  if (trip.status === "cancelled" || trip.status === "completed") {
    return {
      success: false,
      error: { code: "errors.trip.already_status", params: { status: trip.status } },
    };
  }

  const { error: updateError } = await supabase
    .from("trips")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.trip_id)
    .single();

  if (updateError) {
    console.error("[cancelTrip]", updateError.message);
    return { success: false, error: { code: "errors.trip.cancel_failed" } };
  }

  revalidatePath("/trips");
  return { success: true };
}

export async function getSuggestedPriceRange(input: {
  originLabel: string;
  destinationLabel: string;
}): Promise<ActionResult<PriceRangeResult | null>> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: { code: "errors.common.auth_required" } };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("country")
    .eq("id", user.id)
    .maybeSingle();

  try {
    const result = await suggestPriceRange({
      originLabel: input.originLabel,
      destinationLabel: input.destinationLabel,
      driverCountry: profile?.country ?? null,
    });
    return { success: true, data: result };
  } catch (err) {
    console.error("[getSuggestedPriceRange]", (err as Error).message);
    return {
      success: false,
      error: { code: "errors.pricing.suggestion_failed" },
    };
  }
}
