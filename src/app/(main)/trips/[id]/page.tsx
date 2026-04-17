// src/app/(main)/trips/[id]/page.tsx
// Public trip detail page — visible to all visitors.
// Booking CTA is conditional on authentication and ownership.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Calendar, Users, Euro, Car, MessageSquare, MapPin } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { BookingSection } from "./BookingSection";
import type { LocationJsonb, TripStatus } from "@/types/database.types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: trip } = await supabase
    .from("trips")
    .select("origin, destination, departure_at")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!trip) return { title: "Trajet introuvable — AlbaDrive" };

  const origin = (trip.origin as unknown as LocationJsonb).label;
  const destination = (trip.destination as unknown as LocationJsonb).label;
  const date = format(new Date(trip.departure_at), "d MMM yyyy", { locale: fr });

  return {
    title: `${origin} → ${destination} · ${date} — AlbaDrive`,
  };
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rawTrip } = await supabase
    .from("trips")
    .select(
      "id, origin, destination, departure_at, total_seats, available_seats, price_per_seat, vehicle_description, notes, status, driver_id"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!rawTrip) notFound();

  const { data: driver } = await supabase
    .from("profiles_public")
    .select("full_name")
    .eq("id", rawTrip.driver_id)
    .single();

  const trip = {
    ...rawTrip,
    origin: rawTrip.origin as unknown as LocationJsonb,
    destination: rawTrip.destination as unknown as LocationJsonb,
    price_per_seat: rawTrip.price_per_seat ? Number(rawTrip.price_per_seat) : null,
    status: rawTrip.status as TripStatus,
  };

  const driverName = driver?.full_name ?? "Conducteur";
  const isCancelled = trip.status === "cancelled" || trip.status === "completed";
  const isOwnTrip = user?.id === trip.driver_id;
  const isFull = trip.available_seats === 0;

  const formattedDate = format(
    new Date(trip.departure_at),
    "EEEE d MMMM yyyy 'à' HH'h'mm",
    { locale: fr }
  );

  const tripPath = `/trips/${id}`;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {/* Back */}
      <Link
        href="/trips"
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Tous les trajets
      </Link>

      <div className="flex flex-col gap-6">
        {/* Route card */}
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          {/* Route visualization */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="w-3 h-3 rounded-full bg-stone-400" />
              <div className="w-px h-8 bg-stone-200" />
              <div className="w-3 h-3 rounded-full border-2 border-red-800 bg-white" />
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xl font-bold text-stone-900">
                  {trip.origin.label}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold text-stone-600">
                  {trip.destination.label}
                </p>
              </div>
            </div>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2.5 bg-stone-50 rounded-xl px-4 py-3">
              <Calendar className="w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
              <span className="text-sm text-stone-700 capitalize">{formattedDate}</span>
            </div>

            <div className="flex items-center gap-2.5 bg-stone-50 rounded-xl px-4 py-3">
              <Users className="w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
              <span className="text-sm text-stone-700">
                {trip.available_seats}/{trip.total_seats} place
                {trip.total_seats !== 1 ? "s" : ""} disponible
                {trip.available_seats !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex items-center gap-2.5 bg-stone-50 rounded-xl px-4 py-3">
              <Euro className="w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
              <span className="text-sm text-stone-700">
                {trip.price_per_seat && trip.price_per_seat > 0
                  ? `${trip.price_per_seat} CHF / siège`
                  : "Gratuit"}
              </span>
            </div>

            {trip.vehicle_description && (
              <div className="flex items-center gap-2.5 bg-stone-50 rounded-xl px-4 py-3">
                <Car className="w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
                <span className="text-sm text-stone-700">{trip.vehicle_description}</span>
              </div>
            )}
          </div>

          {/* Notes */}
          {trip.notes && (
            <div className="mt-4 flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <MessageSquare className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm text-amber-900 leading-relaxed">{trip.notes}</p>
            </div>
          )}

          {/* Driver */}
          <div className="mt-5 pt-5 border-t border-stone-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <span className="text-red-800 font-bold text-sm">
                {driverName[0]?.toUpperCase() ?? "?"}
              </span>
            </div>
            <div>
              <p className="text-xs text-stone-400">Conducteur</p>
              <p className="text-sm font-semibold text-stone-900">{driverName}</p>
            </div>
          </div>
        </div>

        {/* Booking section */}
        {isCancelled ? (
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 text-center">
            <p className="text-sm font-medium text-stone-500">
              Ce trajet n&apos;est plus disponible.
            </p>
          </div>
        ) : isFull && !isOwnTrip ? (
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 text-center">
            <p className="text-sm font-medium text-stone-600">
              Ce trajet est complet.
            </p>
            <Link
              href="/trips"
              className="inline-flex items-center gap-1.5 mt-3 text-sm text-red-700 hover:underline"
            >
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              Voir d&apos;autres trajets
            </Link>
          </div>
        ) : (
          <BookingSection
            tripId={trip.id}
            availableSeats={trip.available_seats}
            isAuthenticated={!!user}
            isOwnTrip={isOwnTrip}
            tripPath={tripPath}
          />
        )}
      </div>
    </div>
  );
}
