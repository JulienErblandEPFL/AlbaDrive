// src/app/[locale]/(main)/bookings/actions.ts
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
import type { BookingRow, BookingStatus, TripStatus } from "@/types/database.types";

export async function requestBooking(rawData: unknown): Promise<ActionResult<BookingRow>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: { code: "errors.common.auth_required" } };
  }

  // Verify passenger has a phone number — required for WhatsApp after acceptance
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single();

  if (!profile?.phone) {
    return { success: false, error: { code: "errors.booking.phone_required" } };
  }

  const parsed = requestBookingSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: { code: parsed.error.issues[0].message } };
  }

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("driver_id, available_seats, status")
    .eq("id", parsed.data.trip_id)
    .is("deleted_at", null)
    .single();

  if (tripError || !trip) {
    return { success: false, error: { code: "errors.trip.not_found" } };
  }
  if (trip.driver_id === user.id) {
    return { success: false, error: { code: "errors.booking.self_booking" } };
  }
  if (trip.status !== "open") {
    return { success: false, error: { code: "errors.booking.trip_closed" } };
  }
  if (trip.available_seats < parsed.data.seats_requested) {
    return {
      success: false,
      error: {
        code: "errors.booking.not_enough_seats",
        params: { count: trip.available_seats },
      },
    };
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
      return { success: false, error: { code: "errors.booking.duplicate_active" } };
    }
    console.error("[requestBooking]", dbError.message);
    return { success: false, error: { code: "errors.booking.request_failed" } };
  }

  revalidatePath("/bookings");
  return { success: true, data: booking as BookingRow };
}

export async function acceptBooking(rawData: unknown): Promise<ActionResult<BookingRow>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: { code: "errors.common.auth_required" } };
  }

  const parsed = acceptBookingSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: { code: parsed.error.issues[0].message } };
  }

  type BookingWithTripData = {
    status: BookingStatus;
    passenger_id: string;
    seats_requested: number;
    trip: { driver_id: string; status: TripStatus; available_seats: number };
  };

  const { data: booking, error: fetchError } = (await supabase
    .from("bookings")
    .select("status, passenger_id, seats_requested, trip:trips(driver_id, status, available_seats)")
    .eq("id", parsed.data.booking_id)
    .is("deleted_at", null)
    .single()) as { data: BookingWithTripData | null; error: Error | null };

  if (fetchError || !booking) {
    return { success: false, error: { code: "errors.booking.not_found" } };
  }

  const trip = booking.trip;

  if (trip.driver_id !== user.id) {
    return { success: false, error: { code: "errors.common.unauthorized" } };
  }
  if (booking.status !== "pending") {
    return { success: false, error: { code: "errors.booking.only_pending_acceptable" } };
  }
  if (trip.available_seats < booking.seats_requested) {
    return { success: false, error: { code: "errors.booking.no_seats" } };
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
    return { success: false, error: { code: "errors.booking.accept_failed" } };
  }

  revalidatePath("/bookings");
  return { success: true, data: updated as BookingRow };
}

export async function cancelBooking(rawData: unknown): Promise<ActionResult> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: { code: "errors.common.auth_required" } };
  }

  const parsed = cancelBookingSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: { code: parsed.error.issues[0].message } };
  }

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("passenger_id, status")
    .eq("id", parsed.data.booking_id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !booking) {
    return { success: false, error: { code: "errors.booking.not_found" } };
  }
  if (booking.passenger_id !== user.id) {
    return { success: false, error: { code: "errors.common.unauthorized" } };
  }
  if (!["pending", "accepted"].includes(booking.status)) {
    return { success: false, error: { code: "errors.booking.not_cancellable" } };
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
    return { success: false, error: { code: "errors.booking.cancel_failed" } };
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
    return { success: false, error: { code: "errors.common.auth_required" } };
  }

  const parsed = getWhatsAppLinkSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: { code: parsed.error.issues[0].message } };
  }

  // Step 1: Verify booking exists and caller is a party to it
  type BookingWithDriver = {
    status: BookingStatus;
    passenger_id: string;
    trip: { driver_id: string };
  };

  const { data: booking, error: bookingError } = (await supabase
    .from("bookings")
    .select("status, passenger_id, trip:trips(driver_id)")
    .eq("id", parsed.data.booking_id)
    .is("deleted_at", null)
    .single()) as { data: BookingWithDriver | null; error: Error | null };

  if (bookingError || !booking) {
    return { success: false, error: { code: "errors.booking.not_found" } };
  }

  const driverId = booking.trip.driver_id;
  const isDriver = driverId === user.id;
  const isPassenger = booking.passenger_id === user.id;

  if (!isDriver && !isPassenger) {
    return { success: false, error: { code: "errors.common.unauthorized" } };
  }

  // CRITICAL: double-verify status server-side before exposing any phone number
  if (booking.status !== "accepted") {
    return { success: false, error: { code: "errors.whatsapp.only_for_accepted" } };
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
    return { success: false, error: { code: "errors.whatsapp.contact_unavailable" } };
  }

  // Step 3: Fetch own profile to verify we also have a phone
  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single();

  if (!ownProfile?.phone) {
    return { success: false, error: { code: "errors.whatsapp.no_phone" } };
  }

  // Build wa.me link — strip all non-digit chars from E.164 number
  const otherPhone = otherParty.phone.replace(/\D/g, "");

  // French pre-filled messages (recipient-locale extraction lives in step A9 / Phase D2)
  const message = isPassenger
    ? encodeURIComponent(
        `Bonjour, je vous contacte concernant notre trajet sur AlbaDrive. Vous avez accepté ma réservation — pouvons-nous organiser le point de rendez-vous ?`,
      )
    : encodeURIComponent(
        `Bonjour, je suis votre conducteur AlbaDrive. Votre réservation est confirmée — parlons de l'organisation du rendez-vous.`,
      );

  return {
    success: true,
    data: {
      role: isDriver ? "driver" : "passenger",
      other_party_name: otherParty.full_name,
      link_to_contact: `https://wa.me/${otherPhone}?text=${message}`,
    },
  };
}
