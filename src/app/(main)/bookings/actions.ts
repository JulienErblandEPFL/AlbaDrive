// src/app/(main)/bookings/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import {
  requestBookingSchema,
  acceptBookingSchema,
  cancelBookingSchema,
  getWhatsAppLinkSchema,
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

export async function acceptBooking(rawData: unknown): Promise<ActionResult<BookingRow>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = acceptBookingSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("status, passenger_id, seats_requested, trip:trips(driver_id, status, available_seats)")
    .eq("id", parsed.data.booking_id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !booking) {
    return { success: false, error: "Booking not found." };
  }

  const trip = booking.trip as { driver_id: string; status: string; available_seats: number };

  if (trip.driver_id !== user.id) {
    return { success: false, error: "Unauthorized." };
  }
  if (booking.status !== "pending") {
    return { success: false, error: "Only pending bookings can be accepted." };
  }
  if (trip.available_seats < booking.seats_requested) {
    return { success: false, error: "Not enough seats available." };
  }

  // DB trigger handle_booking_accepted will atomically decrement available_seats,
  // set trip to 'full' if needed, and auto-decline other pending bookings.
  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({ status: "accepted" })
    .eq("id", parsed.data.booking_id)
    .select()
    .single();

  if (updateError) {
    console.error("[acceptBooking]", updateError.message);
    return { success: false, error: "Failed to accept booking. Please try again." };
  }

  revalidatePath("/bookings");
  return { success: true, data: updated };
}

export async function cancelBooking(rawData: unknown): Promise<ActionResult> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = cancelBookingSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("passenger_id, status")
    .eq("id", parsed.data.booking_id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !booking) {
    return { success: false, error: "Booking not found." };
  }
  if (booking.passenger_id !== user.id) {
    return { success: false, error: "Unauthorized." };
  }
  if (!["pending", "accepted"].includes(booking.status)) {
    return { success: false, error: "This booking cannot be cancelled." };
  }

  // If booking was 'accepted', the DB trigger handle_booking_seat_return
  // will automatically return the seats to the trip.
  const { error: updateError } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.booking_id)
    .single();

  if (updateError) {
    console.error("[cancelBooking]", updateError.message);
    return { success: false, error: "Failed to cancel booking. Please try again." };
  }

  revalidatePath("/bookings");
  return { success: true };
}

interface WhatsAppResult {
  role: "driver" | "passenger";
  other_party_name: string;
  /** The wa.me link the current user should use to initiate contact */
  link_to_contact: string;
}

export async function getWhatsAppLink(rawData: unknown): Promise<ActionResult<WhatsAppResult>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = getWhatsAppLinkSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  // Step 1: Verify booking exists and caller is a party to it
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("status, passenger_id, trip:trips(driver_id)")
    .eq("id", parsed.data.booking_id)
    .is("deleted_at", null)
    .single();

  if (bookingError || !booking) {
    return { success: false, error: "Booking not found." };
  }

  const driverId = (booking.trip as { driver_id: string }).driver_id;
  const isDriver = driverId === user.id;
  const isPassenger = booking.passenger_id === user.id;

  if (!isDriver && !isPassenger) {
    return { success: false, error: "Unauthorized." };
  }

  // CRITICAL: double-verify status server-side before exposing any phone number
  if (booking.status !== "accepted") {
    return {
      success: false,
      error: "WhatsApp link is only available for accepted bookings.",
    };
  }

  // Step 2: Fetch the other party's profile (phone gated by RLS on accepted bookings)
  const otherPartyId = isDriver ? booking.passenger_id : driverId;

  const { data: otherParty, error: otherPartyError } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .eq("id", otherPartyId)
    .is("deleted_at", null)
    .single();

  if (otherPartyError || !otherParty?.phone) {
    return { success: false, error: "Contact information unavailable." };
  }

  // Step 3: Fetch own profile to verify we also have a phone
  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single();

  if (!ownProfile?.phone) {
    return { success: false, error: "Your profile is missing a phone number." };
  }

  // Build wa.me link for the other party — strip all non-digit chars from E.164 number
  const otherPhone = otherParty.phone.replace(/\D/g, "");
  const message = isPassenger
    ? encodeURIComponent("Salam! Rezervova një vend në udhëtimin tuaj. A mund të komunikojmë?")
    : encodeURIComponent("Salam! Jam shoferi i udhëtimit. Rezervimi juaj është konfirmuar.");

  return {
    success: true,
    data: {
      role: isDriver ? "driver" : "passenger",
      other_party_name: otherParty.full_name,
      link_to_contact: `https://wa.me/${otherPhone}?text=${message}`,
    },
  };
}
