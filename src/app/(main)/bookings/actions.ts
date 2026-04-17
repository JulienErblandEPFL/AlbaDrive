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
import type { BookingRow, BookingStatus, TripStatus } from "@/types/database.types";

export async function requestBooking(rawData: unknown): Promise<ActionResult<BookingRow>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentification requise." };
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
      error: "Veuillez compléter votre profil avec un numéro de téléphone avant de réserver.",
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
    return { success: false, error: "Trajet introuvable." };
  }
  if (trip.driver_id === user.id) {
    return { success: false, error: "Vous ne pouvez pas réserver votre propre trajet." };
  }
  if (trip.status !== "open") {
    return { success: false, error: "Ce trajet n'accepte plus de réservations." };
  }
  if (trip.available_seats < parsed.data.seats_requested) {
    const n = trip.available_seats;
    return {
      success: false,
      error: `Seulement ${n} place${n > 1 ? "s" : ""} disponible${n > 1 ? "s" : ""}.`,
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
      return { success: false, error: "Vous avez déjà une réservation active sur ce trajet." };
    }
    console.error("[requestBooking]", dbError.message);
    return { success: false, error: "La réservation a échoué. Veuillez réessayer." };
  }

  revalidatePath("/bookings");
  return { success: true, data: booking };
}

export async function acceptBooking(rawData: unknown): Promise<ActionResult<BookingRow>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentification requise." };
  }

  const parsed = acceptBookingSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
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
    return { success: false, error: "Réservation introuvable." };
  }

  const trip = booking.trip;

  if (trip.driver_id !== user.id) {
    return { success: false, error: "Action non autorisée." };
  }
  if (booking.status !== "pending") {
    return { success: false, error: "Seules les demandes en attente peuvent être acceptées." };
  }
  if (trip.available_seats < booking.seats_requested) {
    return { success: false, error: "Pas assez de places disponibles." };
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
    return { success: false, error: "Impossible d'accepter la réservation. Veuillez réessayer." };
  }

  revalidatePath("/bookings");
  return { success: true, data: updated };
}

export async function cancelBooking(rawData: unknown): Promise<ActionResult> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentification requise." };
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
    return { success: false, error: "Réservation introuvable." };
  }
  if (booking.passenger_id !== user.id) {
    return { success: false, error: "Action non autorisée." };
  }
  if (!["pending", "accepted"].includes(booking.status)) {
    return { success: false, error: "Cette réservation ne peut pas être annulée." };
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
    return { success: false, error: "L'annulation a échoué. Veuillez réessayer." };
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
    return { success: false, error: "Authentification requise." };
  }

  const parsed = getWhatsAppLinkSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
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
    return { success: false, error: "Réservation introuvable." };
  }

  const driverId = booking.trip.driver_id;
  const isDriver = driverId === user.id;
  const isPassenger = booking.passenger_id === user.id;

  if (!isDriver && !isPassenger) {
    return { success: false, error: "Action non autorisée." };
  }

  // CRITICAL: double-verify status server-side before exposing any phone number
  if (booking.status !== "accepted") {
    return {
      success: false,
      error: "Le lien WhatsApp n'est disponible que pour les réservations acceptées.",
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
    return { success: false, error: "Les coordonnées du contact sont indisponibles." };
  }

  // Step 3: Fetch own profile to verify we also have a phone
  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single();

  if (!ownProfile?.phone) {
    return { success: false, error: "Votre profil ne contient pas de numéro de téléphone." };
  }

  // Build wa.me link — strip all non-digit chars from E.164 number
  const otherPhone = otherParty.phone.replace(/\D/g, "");

  // French pre-filled messages
  const message = isPassenger
    ? encodeURIComponent(
        `Bonjour, je vous contacte concernant notre trajet sur AlbaDrive. Vous avez accepté ma réservation — pouvons-nous organiser le point de rendez-vous ?`
      )
    : encodeURIComponent(
        `Bonjour, je suis votre conducteur AlbaDrive. Votre réservation est confirmée — parlons de l'organisation du rendez-vous.`
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
