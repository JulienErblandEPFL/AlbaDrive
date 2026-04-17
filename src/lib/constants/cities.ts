// src/lib/constants/cities.ts
// Pre-geocoded cities on the Europe ↔ Balkans corridor.
// Using approximate city-centre coordinates (WGS84).
import type { LocationJsonb } from "@/types/database.types";

export type City = LocationJsonb & { country: string; region: string };

export const CITIES: City[] = [
  // ── Switzerland ──────────────────────────────────────────
  { label: "Genève", lat: 46.2044, lng: 6.1432, country: "CH", region: "Suisse" },
  { label: "Zürich", lat: 47.3769, lng: 8.5417, country: "CH", region: "Suisse" },
  { label: "Bern", lat: 46.9481, lng: 7.4474, country: "CH", region: "Suisse" },
  { label: "Basel", lat: 47.5596, lng: 7.5886, country: "CH", region: "Suisse" },
  { label: "Lausanne", lat: 46.5197, lng: 6.6323, country: "CH", region: "Suisse" },
  { label: "Lugano", lat: 46.0037, lng: 8.9511, country: "CH", region: "Suisse" },
  { label: "Biel/Bienne", lat: 47.1368, lng: 7.2467, country: "CH", region: "Suisse" },
  { label: "Winterthur", lat: 47.4990, lng: 8.7266, country: "CH", region: "Suisse" },
  // ── Germany ──────────────────────────────────────────────
  { label: "München", lat: 48.1351, lng: 11.5820, country: "DE", region: "Allemagne" },
  { label: "Frankfurt", lat: 50.1109, lng: 8.6821, country: "DE", region: "Allemagne" },
  { label: "Stuttgart", lat: 48.7758, lng: 9.1829, country: "DE", region: "Allemagne" },
  { label: "Berlin", lat: 52.5200, lng: 13.4050, country: "DE", region: "Allemagne" },
  { label: "Hamburg", lat: 53.5753, lng: 10.0153, country: "DE", region: "Allemagne" },
  { label: "Köln", lat: 50.9333, lng: 6.9500, country: "DE", region: "Allemagne" },
  { label: "Düsseldorf", lat: 51.2217, lng: 6.7762, country: "DE", region: "Allemagne" },
  { label: "Nürnberg", lat: 49.4521, lng: 11.0767, country: "DE", region: "Allemagne" },
  { label: "Augsburg", lat: 48.3717, lng: 10.8983, country: "DE", region: "Allemagne" },
  { label: "Ulm", lat: 48.3988, lng: 9.9903, country: "DE", region: "Allemagne" },
  // ── France ───────────────────────────────────────────────
  { label: "Paris", lat: 48.8566, lng: 2.3522, country: "FR", region: "France" },
  { label: "Lyon", lat: 45.7640, lng: 4.8357, country: "FR", region: "France" },
  { label: "Marseille", lat: 43.2965, lng: 5.3698, country: "FR", region: "France" },
  { label: "Strasbourg", lat: 48.5734, lng: 7.7521, country: "FR", region: "France" },
  { label: "Mulhouse", lat: 47.7508, lng: 7.3359, country: "FR", region: "France" },
  { label: "Grenoble", lat: 45.1885, lng: 5.7245, country: "FR", region: "France" },
  // ── Austria ──────────────────────────────────────────────
  { label: "Wien", lat: 48.2082, lng: 16.3738, country: "AT", region: "Autriche" },
  { label: "Graz", lat: 47.0707, lng: 15.4395, country: "AT", region: "Autriche" },
  { label: "Innsbruck", lat: 47.2692, lng: 11.4041, country: "AT", region: "Autriche" },
  { label: "Linz", lat: 48.3069, lng: 14.2858, country: "AT", region: "Autriche" },
  // ── Italy ─────────────────────────────────────────────────
  { label: "Milano", lat: 45.4654, lng: 9.1859, country: "IT", region: "Italie" },
  { label: "Roma", lat: 41.9028, lng: 12.4964, country: "IT", region: "Italie" },
  { label: "Torino", lat: 45.0703, lng: 7.6869, country: "IT", region: "Italie" },
  { label: "Bologna", lat: 44.4949, lng: 11.3426, country: "IT", region: "Italie" },
  { label: "Venezia", lat: 45.4408, lng: 12.3155, country: "IT", region: "Italie" },
  // ── Belgium / Netherlands ─────────────────────────────────
  { label: "Bruxelles", lat: 50.8503, lng: 4.3517, country: "BE", region: "Belgique" },
  // ── Balkans: Albania ─────────────────────────────────────
  { label: "Tirana", lat: 41.3275, lng: 19.8187, country: "AL", region: "Albanie" },
  { label: "Durrës", lat: 41.3246, lng: 19.4565, country: "AL", region: "Albanie" },
  { label: "Shkodër", lat: 42.0683, lng: 19.5126, country: "AL", region: "Albanie" },
  { label: "Vlorë", lat: 40.4678, lng: 19.4836, country: "AL", region: "Albanie" },
  { label: "Gjirokastër", lat: 40.0763, lng: 20.1393, country: "AL", region: "Albanie" },
  { label: "Korçë", lat: 40.6186, lng: 20.7809, country: "AL", region: "Albanie" },
  { label: "Elbasan", lat: 41.1125, lng: 20.0822, country: "AL", region: "Albanie" },
  // ── Balkans: Kosovo ──────────────────────────────────────
  { label: "Pristina", lat: 42.6629, lng: 21.1655, country: "XK", region: "Kosovo" },
  { label: "Prizren", lat: 42.2139, lng: 20.7397, country: "XK", region: "Kosovo" },
  { label: "Peja", lat: 42.6595, lng: 20.2883, country: "XK", region: "Kosovo" },
  { label: "Gjilan", lat: 42.4617, lng: 21.4694, country: "XK", region: "Kosovo" },
  { label: "Ferizaj", lat: 42.3703, lng: 21.1483, country: "XK", region: "Kosovo" },
  { label: "Mitrovica", lat: 42.8914, lng: 20.8660, country: "XK", region: "Kosovo" },
  // ── Balkans: North Macedonia ─────────────────────────────
  { label: "Skopje", lat: 41.9981, lng: 21.4254, country: "MK", region: "Macédoine du Nord" },
  { label: "Tetovë", lat: 42.0097, lng: 20.9716, country: "MK", region: "Macédoine du Nord" },
  // ── Balkans: Serbia (transit) ─────────────────────────────
  { label: "Beograd", lat: 44.8176, lng: 20.4633, country: "RS", region: "Serbie" },
  { label: "Niš", lat: 43.3209, lng: 21.8954, country: "RS", region: "Serbie" },
] as const;

/** Look up a City by its label (O(n) — fine for small list) */
export function findCity(label: string): City | undefined {
  return CITIES.find((c) => c.label === label);
}

/** Group cities by region for the <select> optgroup UI */
export function citiesByRegion(): Record<string, City[]> {
  return CITIES.reduce<Record<string, City[]>>((acc, city) => {
    if (!acc[city.region]) acc[city.region] = [];
    acc[city.region].push(city);
    return acc;
  }, {});
}
