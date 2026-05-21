// Pre-geocoded cities on the Europe ↔ Balkans corridor.
// Using approximate city-centre coordinates (WGS84).
// Country labels are i18n-resolved at render time via the `countries`
// namespace; only the ISO-3166 code lives here.
import type { LocationJsonb } from "@/types/database.types";

export type City = LocationJsonb & { country: string };

export const CITIES: City[] = [
  // ── Switzerland ──────────────────────────────────────────
  { label: "Genève", lat: 46.2044, lng: 6.1432, country: "CH" },
  { label: "Zürich", lat: 47.3769, lng: 8.5417, country: "CH" },
  { label: "Bern", lat: 46.9481, lng: 7.4474, country: "CH" },
  { label: "Basel", lat: 47.5596, lng: 7.5886, country: "CH" },
  { label: "Lausanne", lat: 46.5197, lng: 6.6323, country: "CH" },
  { label: "Lugano", lat: 46.0037, lng: 8.9511, country: "CH" },
  { label: "Biel/Bienne", lat: 47.1368, lng: 7.2467, country: "CH" },
  { label: "Winterthur", lat: 47.4990, lng: 8.7266, country: "CH" },
  // ── Germany ──────────────────────────────────────────────
  { label: "München", lat: 48.1351, lng: 11.5820, country: "DE" },
  { label: "Frankfurt", lat: 50.1109, lng: 8.6821, country: "DE" },
  { label: "Stuttgart", lat: 48.7758, lng: 9.1829, country: "DE" },
  { label: "Berlin", lat: 52.5200, lng: 13.4050, country: "DE" },
  { label: "Hamburg", lat: 53.5753, lng: 10.0153, country: "DE" },
  { label: "Köln", lat: 50.9333, lng: 6.9500, country: "DE" },
  { label: "Düsseldorf", lat: 51.2217, lng: 6.7762, country: "DE" },
  { label: "Nürnberg", lat: 49.4521, lng: 11.0767, country: "DE" },
  { label: "Augsburg", lat: 48.3717, lng: 10.8983, country: "DE" },
  { label: "Ulm", lat: 48.3988, lng: 9.9903, country: "DE" },
  // ── France ───────────────────────────────────────────────
  { label: "Paris", lat: 48.8566, lng: 2.3522, country: "FR" },
  { label: "Lyon", lat: 45.7640, lng: 4.8357, country: "FR" },
  { label: "Marseille", lat: 43.2965, lng: 5.3698, country: "FR" },
  { label: "Strasbourg", lat: 48.5734, lng: 7.7521, country: "FR" },
  { label: "Mulhouse", lat: 47.7508, lng: 7.3359, country: "FR" },
  { label: "Grenoble", lat: 45.1885, lng: 5.7245, country: "FR" },
  // ── Austria ──────────────────────────────────────────────
  { label: "Wien", lat: 48.2082, lng: 16.3738, country: "AT" },
  { label: "Graz", lat: 47.0707, lng: 15.4395, country: "AT" },
  { label: "Innsbruck", lat: 47.2692, lng: 11.4041, country: "AT" },
  { label: "Linz", lat: 48.3069, lng: 14.2858, country: "AT" },
  // ── Italy ─────────────────────────────────────────────────
  { label: "Milano", lat: 45.4654, lng: 9.1859, country: "IT" },
  { label: "Roma", lat: 41.9028, lng: 12.4964, country: "IT" },
  { label: "Torino", lat: 45.0703, lng: 7.6869, country: "IT" },
  { label: "Bologna", lat: 44.4949, lng: 11.3426, country: "IT" },
  { label: "Venezia", lat: 45.4408, lng: 12.3155, country: "IT" },
  // ── Belgium / Netherlands ─────────────────────────────────
  { label: "Bruxelles", lat: 50.8503, lng: 4.3517, country: "BE" },
  // ── Balkans: Albania ─────────────────────────────────────
  { label: "Tirana", lat: 41.3275, lng: 19.8187, country: "AL" },
  { label: "Durrës", lat: 41.3246, lng: 19.4565, country: "AL" },
  { label: "Shkodër", lat: 42.0683, lng: 19.5126, country: "AL" },
  { label: "Vlorë", lat: 40.4678, lng: 19.4836, country: "AL" },
  { label: "Gjirokastër", lat: 40.0763, lng: 20.1393, country: "AL" },
  { label: "Korçë", lat: 40.6186, lng: 20.7809, country: "AL" },
  { label: "Elbasan", lat: 41.1125, lng: 20.0822, country: "AL" },
  // ── Balkans: Kosovo ──────────────────────────────────────
  { label: "Pristina", lat: 42.6629, lng: 21.1655, country: "XK" },
  { label: "Prizren", lat: 42.2139, lng: 20.7397, country: "XK" },
  { label: "Peja", lat: 42.6595, lng: 20.2883, country: "XK" },
  { label: "Gjilan", lat: 42.4617, lng: 21.4694, country: "XK" },
  { label: "Ferizaj", lat: 42.3703, lng: 21.1483, country: "XK" },
  { label: "Mitrovica", lat: 42.8914, lng: 20.8660, country: "XK" },
  // ── Balkans: North Macedonia ─────────────────────────────
  { label: "Skopje", lat: 41.9981, lng: 21.4254, country: "MK" },
  { label: "Tetovë", lat: 42.0097, lng: 20.9716, country: "MK" },
  // ── Balkans: Serbia (transit) ─────────────────────────────
  { label: "Beograd", lat: 44.8176, lng: 20.4633, country: "RS" },
  { label: "Niš", lat: 43.3209, lng: 21.8954, country: "RS" },
] as const;

/** Look up a City by its label (O(n) — fine for small list) */
export function findCity(label: string): City | undefined {
  return CITIES.find((c) => c.label === label);
}

/** Group cities by ISO country code; callers translate via `countries` namespace */
export function citiesByCountry(): Record<string, City[]> {
  return CITIES.reduce<Record<string, City[]>>((acc, city) => {
    if (!acc[city.country]) acc[city.country] = [];
    acc[city.country].push(city);
    return acc;
  }, {});
}
