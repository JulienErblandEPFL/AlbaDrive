// src/app/(main)/trips/page.tsx
// Public search page — accessible without authentication.
// searchParams drive filterable, shareable URLs.
import type { Metadata } from "next";
import Image from "next/image";
import { createServerClient } from "@/lib/supabase/server";
import { TripCard } from "./components/TripCard";
import { SearchBar } from "./components/SearchBar";
import { MapPin } from "lucide-react";
import Link from "next/link";
import type { LocationJsonb } from "@/types/database.types";

export const metadata: Metadata = {
  title: "Trajets disponibles — AlbaDrive",
};

type SearchParams = {
  from?: string;
  to?: string;
  date?: string;
};

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { from, to, date } = await searchParams;

  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date().toISOString();

  // Build filtered query
  let query = supabase
    .from("trips")
    .select(
      "id, origin, destination, departure_at, total_seats, available_seats, price_per_seat, vehicle_description, notes, status, driver_id"
    )
    .eq("status", "open")
    .is("deleted_at", null)
    .gt("departure_at", now)
    .order("departure_at", { ascending: true });

  if (from?.trim()) {
    query = query.filter("origin->>label", "ilike", `%${from.trim()}%`);
  }
  if (to?.trim()) {
    query = query.filter("destination->>label", "ilike", `%${to.trim()}%`);
  }
  if (date?.trim()) {
    // Filter for the whole calendar day (UTC)
    query = query
      .gte("departure_at", `${date}T00:00:00.000Z`)
      .lte("departure_at", `${date}T23:59:59.999Z`);
  }

  const { data: rawTrips } = await query;
  const trips = rawTrips ?? [];

  // Exclude the driver's own trips from browse view
  const browsableTrips = trips.filter((t) => t.driver_id !== user?.id);

  // Batch-fetch driver names
  const driverIds = [...new Set(browsableTrips.map((t) => t.driver_id))];
  const { data: driverProfiles } =
    driverIds.length > 0
      ? await supabase
          .from("profiles_public")
          .select("id, full_name")
          .in("id", driverIds)
      : { data: [] };

  const driverNameById = Object.fromEntries(
    (driverProfiles ?? []).map((p) => [p.id, p.full_name])
  );

  const isFiltered = !!(from || to || date);

  return (
    <div>
      {/* ── Photo banner with SearchBar ─────────────────────── */}
      <div className="relative h-56 sm:h-72 overflow-hidden">
        <Image
          src="/images/pristina.webp"
          alt="Vue de Pristina, Kosovo"
          fill
          priority
          className="object-cover object-center"
        />
        {/* Dark gradient overlay */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-stone-100 pointer-events-none"
          aria-hidden="true"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 sm:px-6 pb-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 drop-shadow-md text-center">
            Trouver un trajet
          </h1>
          <p className="text-stone-300 text-sm mb-5 drop-shadow text-center">
            Le corridor Europe ↔ Balkans
          </p>
          <div className="w-full max-w-2xl">
            <SearchBar from={from} to={to} date={date} glass />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Results summary */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="text-sm text-stone-500">
          {isFiltered ? (
            <>
              <span className="font-semibold text-stone-700">
                {browsableTrips.length}
              </span>{" "}
              trajet{browsableTrips.length !== 1 ? "s" : ""} trouvé
              {browsableTrips.length !== 1 ? "s" : ""}
            </>
          ) : (
            <>
              <span className="font-semibold text-stone-700">
                {browsableTrips.length}
              </span>{" "}
              trajet{browsableTrips.length !== 1 ? "s" : ""} disponible
              {browsableTrips.length !== 1 ? "s" : ""}
            </>
          )}
        </p>

        {isFiltered && (
          <Link
            href="/trips"
            className="text-xs text-stone-400 hover:text-red-700 transition-colors underline underline-offset-2"
          >
            Effacer les filtres
          </Link>
        )}
      </div>

      {/* Trip list */}
      {browsableTrips.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-stone-200 rounded-2xl bg-white">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 mb-4">
            <MapPin className="w-5 h-5 text-stone-400" aria-hidden="true" />
          </div>
          <p className="text-stone-900 font-semibold mb-1">
            {isFiltered ? "Aucun résultat" : "Aucun trajet disponible"}
          </p>
          <p className="text-stone-500 text-sm mb-6">
            {isFiltered
              ? "Essayez d'autres critères ou supprimez les filtres."
              : "Soyez le premier à proposer un trajet sur le corridor."}
          </p>
          {isFiltered ? (
            <Link
              href="/trips"
              className="inline-flex items-center h-10 px-5 rounded-xl border border-stone-200 text-stone-700 text-sm font-semibold hover:bg-stone-50 transition-colors"
            >
              Voir tous les trajets
            </Link>
          ) : (
            <Link
              href={user ? "/trips/create" : "/register"}
              className="inline-flex items-center h-10 px-5 rounded-xl bg-red-800 text-white text-sm font-semibold hover:bg-red-900 transition-colors"
            >
              Proposer un trajet
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {browsableTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={{
                ...trip,
                origin: trip.origin as unknown as LocationJsonb,
                destination: trip.destination as unknown as LocationJsonb,
                price_per_seat: trip.price_per_seat
                  ? Number(trip.price_per_seat)
                  : null,
              }}
              driverName={driverNameById[trip.driver_id] ?? "Conducteur"}
              currentUserId={user?.id ?? ""}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
