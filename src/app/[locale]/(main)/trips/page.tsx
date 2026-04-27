// Public search page — accessible without authentication.
// searchParams drive filterable, shareable URLs.
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createServerClient } from "@/lib/supabase/server";
import { TripCard } from "./components/TripCard";
import { SearchBar } from "./components/SearchBar";
import { MapPin } from "lucide-react";
import type { SupportedLocale } from "@/i18n/routing";
import type { LocationJsonb } from "@/types/database.types";
import {
  expandCityToNearby,
  MAX_TRIPS_PER_PAGE,
  PROXIMITY_RADIUS_KM,
} from "@/lib/geo";
import {
  buildCanonical,
  buildLocaleAlternates,
  getOgAlternateLocales,
  getOgLocale,
} from "@/lib/intl/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: SupportedLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "trips.metadata" });
  return {
    title: t("searchTitle"),
    alternates: {
      canonical: buildCanonical(locale, "/trips"),
      languages: buildLocaleAlternates("/trips"),
    },
    openGraph: {
      title: t("searchTitle"),
      locale: getOgLocale(locale),
      alternateLocale: getOgAlternateLocales(locale),
      type: "website",
    },
  };
}

type SearchParams = {
  from?: string;
  to?: string;
  date?: string;
};

export default async function TripsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: SupportedLocale }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const { from, to, date } = await searchParams;
  const t = await getTranslations({ locale, namespace: "trips.search" });

  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date().toISOString();

  // Expand city inputs to nearby cities (within PROXIMITY_RADIUS_KM).
  // If input doesn't match a known city, expansion.origin is null and we
  // skip that side of the filter (per Bonus Option (i): run the search
  // anyway with whatever's recognized).
  const fromExpansion = from?.trim()
    ? expandCityToNearby(from, PROXIMITY_RADIUS_KM)
    : null;
  const toExpansion = to?.trim()
    ? expandCityToNearby(to, PROXIMITY_RADIUS_KM)
    : null;

  // Build filtered query — LIMIT enforced at the Supabase query layer so
  // Postgres can short-circuit; never rely on JS .slice() after fetching.
  let query = supabase
    .from("trips")
    .select(
      "id, origin, destination, departure_at, total_seats, available_seats, price_per_seat, vehicle_description, notes, status, driver_id"
    )
    .eq("status", "open")
    .is("deleted_at", null)
    .gt("departure_at", now)
    .order("departure_at", { ascending: true })
    .limit(MAX_TRIPS_PER_PAGE);

  if (fromExpansion?.origin) {
    const labels = fromExpansion.matches.map((m) => m.city.label);
    query = query.or(
      labels.map((l) => `origin->>label.eq.${l}`).join(","),
    );
  }
  if (toExpansion?.origin) {
    const labels = toExpansion.matches.map((m) => m.city.label);
    query = query.or(
      labels.map((l) => `destination->>label.eq.${l}`).join(","),
    );
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

  // Tier the results into "primary" (origin matches the canonical from-city
  // exactly) and "nearby" (origin within radius but a different city). Only
  // active when the from input resolved to a known city.
  const fromOriginLabel = fromExpansion?.origin?.label ?? null;
  const primaryTrips = fromOriginLabel
    ? browsableTrips.filter(
        (t) => (t.origin as { label?: string }).label === fromOriginLabel,
      )
    : browsableTrips;
  const nearbyTrips = fromOriginLabel
    ? browsableTrips.filter(
        (t) => (t.origin as { label?: string }).label !== fromOriginLabel,
      )
    : [];
  const tierEnabled = fromOriginLabel !== null;

  // Batch-fetch driver names + aggregate ratings (from profiles_public view)
  const driverIds = [...new Set(browsableTrips.map((t) => t.driver_id))];
  const { data: driverProfiles } =
    driverIds.length > 0
      ? await supabase
          .from("profiles_public")
          .select("id, full_name, driver_rating_avg, driver_rating_count")
          .in("id", driverIds)
      : { data: [] };

  const tCard = await getTranslations({ locale, namespace: "trips.card" });

  const driverById = Object.fromEntries(
    (driverProfiles ?? []).map((p) => [
      p.id,
      {
        name: p.full_name ?? tCard("driverFallback"),
        rating_avg: p.driver_rating_avg != null ? Number(p.driver_rating_avg) : 0,
        rating_count: p.driver_rating_count != null ? Number(p.driver_rating_count) : 0,
      },
    ])
  );

  const isFiltered = !!(from || to || date);
  const summaryKey = isFiltered ? "summaryFound" : "summaryAvailable";

  return (
    <div>
      {/* ── Photo banner with SearchBar ─────────────────────── */}
      <div className="relative h-56 sm:h-72 overflow-hidden">
        <Image
          src="/images/pristina.webp"
          alt={t("headerImageAlt")}
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
            {t("headerTitle")}
          </h1>
          <p className="text-stone-300 text-sm mb-5 drop-shadow text-center">
            {t("headerSubtitle")}
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
          {t(summaryKey, { count: browsableTrips.length })}
        </p>

        {isFiltered && (
          <Link
            href="/trips"
            className="text-xs text-stone-400 hover:text-red-700 transition-colors underline underline-offset-2"
          >
            {t("clearFilters")}
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
            {isFiltered ? t("emptyNoResultsTitle") : t("emptyNoTripsTitle")}
          </p>
          <p className="text-stone-500 text-sm mb-6">
            {isFiltered
              ? t("emptyNoResultsDescription")
              : t("emptyNoTripsDescription")}
          </p>
          {isFiltered ? (
            <Link
              href="/trips"
              className="inline-flex items-center h-10 px-5 rounded-xl border border-stone-200 text-stone-700 text-sm font-semibold hover:bg-stone-50 transition-colors"
            >
              {t("emptyViewAll")}
            </Link>
          ) : (
            <Link
              href={user ? "/trips/create" : "/register"}
              className="inline-flex items-center h-10 px-5 rounded-xl bg-red-800 text-white text-sm font-semibold hover:bg-red-900 transition-colors"
            >
              {t("emptyPropose")}
            </Link>
          )}
        </div>
      ) : tierEnabled ? (
        <div className="flex flex-col gap-8">
          {primaryTrips.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-stone-700 mb-3">
                {t("primarySection", { city: fromOriginLabel })}
              </h2>
              <div className="flex flex-col gap-4">
                {primaryTrips.map((trip) => (
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
                    driverName={driverById[trip.driver_id]?.name ?? tCard("driverFallback")}
                    driverRatingAvg={driverById[trip.driver_id]?.rating_avg ?? 0}
                    driverRatingCount={driverById[trip.driver_id]?.rating_count ?? 0}
                    currentUserId={user?.id ?? ""}
                  />
                ))}
              </div>
            </section>
          )}
          {nearbyTrips.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">
                {t("nearbySection")}
              </h2>
              <div className="flex flex-col gap-4">
                {nearbyTrips.map((trip) => (
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
                    driverName={driverById[trip.driver_id]?.name ?? tCard("driverFallback")}
                    driverRatingAvg={driverById[trip.driver_id]?.rating_avg ?? 0}
                    driverRatingCount={driverById[trip.driver_id]?.rating_count ?? 0}
                    currentUserId={user?.id ?? ""}
                  />
                ))}
              </div>
            </section>
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
              driverName={driverById[trip.driver_id]?.name ?? tCard("driverFallback")}
              driverRatingAvg={driverById[trip.driver_id]?.rating_avg ?? 0}
              driverRatingCount={driverById[trip.driver_id]?.rating_count ?? 0}
              currentUserId={user?.id ?? ""}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
