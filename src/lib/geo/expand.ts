import { CITIES, type City } from "@/lib/constants/cities";
import { haversineKm } from "./haversine";
import { normalizeForSearch } from "./normalize";

export type ExpandedMatch = {
  city: City;
  distanceKm: number;
};

export type ExpansionResult = {
  origin: City | null;
  matches: ExpandedMatch[];
};

/**
 * Find a city in the allowlist by exact label, or by diacritic-insensitive
 * normalized match. Returns `null` if the input doesn't match a known city.
 */
export function findCityFlexible(input: string): City | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const exact = CITIES.find((c) => c.label === trimmed);
  if (exact) return exact;

  const needle = normalizeForSearch(trimmed);
  if (!needle) return null;

  const flexible = CITIES.find((c) => normalizeForSearch(c.label) === needle);
  return flexible ?? null;
}

/**
 * Expand a city input into the origin city plus all cities within `radiusKm`,
 * sorted by distance ascending (origin first at distance 0). If the input
 * doesn't match a known city, returns `{ origin: null, matches: [] }`.
 */
export function expandCityToNearby(
  input: string,
  radiusKm: number,
): ExpansionResult {
  const origin = findCityFlexible(input);
  if (!origin) return { origin: null, matches: [] };

  const matches = CITIES
    .map<ExpandedMatch>((city) => ({
      city,
      distanceKm: haversineKm(origin, city),
    }))
    .filter((m) => m.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return { origin, matches };
}
