// src/app/(main)/dashboard/page.tsx
// Server Component — fetches all dashboard data in parallel, then delegates
// interactive rendering to the DashboardTabs Client Component.
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { DashboardTabs } from "./DashboardTabs";
import type { DriverTripItem, BookingItem } from "./DriverTripCard";
import type { PassengerBookingItem } from "./PassengerBookingCard";
import type { LocationJsonb, BookingStatus, TripStatus } from "@/types/database.types";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tableau de bord — AlbaDrive",
};

export default async function DashboardPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user!.id;

  // ── Parallel queries ────────────────────────────────────────────────────────
  const [
    { data: rawDriverTrips },
    { data: rawMyBookings },
    { data: profile },
  ] = await Promise.all([
    // Driver's trips (all statuses — policy trips_select_own_driver)
    supabase
      .from("trips")
      .select(
        "id, origin, destination, departure_at, total_seats, available_seats, price_per_seat, status"
      )
      .eq("driver_id", userId)
      .is("deleted_at", null)
      .order("departure_at", { ascending: false }),

    // Passenger's own bookings (policy bookings_select_passenger)
    supabase
      .from("bookings")
      .select("id, trip_id, seats_requested, status, passenger_message, created_at")
      .eq("passenger_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),

    // Profile for the greeting
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single(),
  ]);

  const driverTrips = rawDriverTrips ?? [];
  const myBookings = rawMyBookings ?? [];

  // ── Fetch bookings for driver's trips ────────────────────────────────────────
  const driverTripIds = driverTrips.map((t) => t.id);
  const { data: rawTripBookings } =
    driverTripIds.length > 0
      ? await supabase
          .from("bookings")
          .select("id, trip_id, passenger_id, seats_requested, status, passenger_message, created_at")
          .in("trip_id", driverTripIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
      : { data: [] };

  const tripBookings = rawTripBookings ?? [];

  // ── Fetch trip details for passenger bookings ─────────────────────────────
  const myTripIds = myBookings.map((b) => b.trip_id);
  const { data: rawBookingTrips } =
    myTripIds.length > 0
      ? await supabase
          .from("trips")
          .select("id, origin, destination, departure_at, status, driver_id")
          .in("id", myTripIds)
          .is("deleted_at", null)
      : { data: [] };

  const bookingTrips = rawBookingTrips ?? [];

  // ── Batch-fetch names from profiles_public ────────────────────────────────
  const passengerIds = [
    ...new Set(tripBookings.map((b) => b.passenger_id)),
  ];
  const driverIds = [
    ...new Set(bookingTrips.map((t) => t.driver_id).filter((id) => id !== userId)),
  ];
  const profileIds = [...new Set([...passengerIds, ...driverIds])];

  const { data: rawPublicProfiles } =
    profileIds.length > 0
      ? await supabase
          .from("profiles_public")
          .select("id, full_name")
          .in("id", profileIds)
      : { data: [] };

  const nameById = Object.fromEntries(
    (rawPublicProfiles ?? []).map((p) => [p.id, p.full_name])
  );

  // ── Assemble DriverTripItem[] ─────────────────────────────────────────────
  const driverTripItems: DriverTripItem[] = driverTrips.map((trip) => {
    const bookings: BookingItem[] = tripBookings
      .filter((b) => b.trip_id === trip.id)
      .map((b) => ({
        id: b.id,
        passenger_id: b.passenger_id,
        passenger_name: nameById[b.passenger_id] ?? "Passager",
        seats_requested: b.seats_requested,
        status: b.status as BookingStatus,
        passenger_message: b.passenger_message,
        created_at: b.created_at,
      }));

    return {
      id: trip.id,
      origin: trip.origin as unknown as LocationJsonb,
      destination: trip.destination as unknown as LocationJsonb,
      departure_at: trip.departure_at,
      total_seats: trip.total_seats,
      available_seats: trip.available_seats,
      price_per_seat: trip.price_per_seat ? Number(trip.price_per_seat) : null,
      status: trip.status as TripStatus,
      bookings,
    };
  });

  // ── Assemble PassengerBookingItem[] ───────────────────────────────────────
  const passengerBookingItems: PassengerBookingItem[] = myBookings
    .map((booking) => {
      const trip = bookingTrips.find((t) => t.id === booking.trip_id);
      if (!trip) return null;

      return {
        id: booking.id,
        trip_id: booking.trip_id,
        seats_requested: booking.seats_requested,
        status: booking.status as BookingStatus,
        passenger_message: booking.passenger_message,
        created_at: booking.created_at,
        trip: {
          id: trip.id,
          origin: trip.origin as unknown as LocationJsonb,
          destination: trip.destination as unknown as LocationJsonb,
          departure_at: trip.departure_at,
          status: trip.status as TripStatus,
          driver_id: trip.driver_id,
        },
        driver_name: nameById[trip.driver_id] ?? "Conducteur",
      } satisfies PassengerBookingItem;
    })
    .filter((b): b is PassengerBookingItem => b !== null);

  const firstName = profile?.full_name?.split(" ")[0] ?? "";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Greeting + quick CTA */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            Bonjour, {firstName} !
          </h1>
          <p className="text-stone-500 text-sm mt-0.5">
            Votre tableau de bord AlbaDrive
          </p>
        </div>
        <Link
          href="/trips/create"
          className="shrink-0 flex items-center gap-1.5 h-10 px-4 rounded-xl bg-red-800 text-white text-sm font-semibold hover:bg-red-900 transition-colors duration-150 whitespace-nowrap"
        >
          + Proposer
        </Link>
      </div>

      {/* Tabbed sections */}
      <DashboardTabs
        driverTrips={driverTripItems}
        passengerBookings={passengerBookingItems}
      />
    </div>
  );
}
