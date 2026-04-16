// src/app/(main)/bookings/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import {
  requestBookingSchema,
} from "@/lib/validations/booking.schema";
import type { ActionResult } from "@/types/actions";
import type { BookingRow } from "@/types/database.types";

export async function requestBooking(rawData: unknown): Promise<ActionResult<BookingRow>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  // Verify passenger has a phone number — required for WhatsApp after acceptance
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single();

  if (!profile?.phone) {
    return {
      success: false,
      error: "Please complete your profile with a phone number before requesting a booking.",
    };
  }

  const parsed = requestBookingSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("driver_id, available_seats, status")
    .eq("id", parsed.data.trip_id)
    .is("deleted_at", null)
    .single();

  if (tripError || !trip) {
    return { success: false, error: "Trip not found." };
  }
  if (trip.driver_id === user.id) {
    return { success: false, error: "You cannot book your own trip." };
  }
  if (trip.status !== "open") {
    return { success: false, error: "This trip is no longer accepting bookings." };
  }
  if (trip.available_seats < parsed.data.seats_requested) {
    return { success: false, error: `Only ${trip.available_seats} seat(s) available.` };
  }

  const { data: booking, error: dbError } = await supabase
    .from("bookings")
    .insert({
      trip_id: parsed.data.trip_id,
      passenger_id: user.id,
      seats_requested: parsed.data.seats_requested,
      passenger_message: parsed.data.passenger_message ?? null,
    })
    .select()
    .single();

  if (dbError) {
    if ((dbError as { code?: string }).code === "23505") {
      return { success: false, error: "You already have an active booking for this trip." };
    }
    console.error("[requestBooking]", dbError.message);
    return { success: false, error: "Failed to request booking. Please try again." };
  }

  revalidatePath("/bookings");
  return { success: true, data: booking };
}

// Stubs — implemented in Tasks 6, 7, 8
export async function acceptBooking(_rawData: unknown): Promise<ActionResult<BookingRow>> {
  return { success: false, error: "Not implemented" };
}

export async function cancelBooking(_rawData: unknown): Promise<ActionResult> {
  return { success: false, error: "Not implemented" };
}

export async function getWhatsAppLink(_rawData: unknown): Promise<ActionResult<{
  role: "driver" | "passenger";
  other_party_name: string;
  link_to_contact: string;
}>> {
  return { success: false, error: "Not implemented" };
}
