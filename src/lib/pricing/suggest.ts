// Orchestrator: resolves the driver's country (profile → trip-origin),
// fetches the per-passenger CHF/km rate, fetches the road distance,
// and runs the pure range calculator. Returns `null` when:
//   - origin or destination isn't in the canonical city allowlist
//   - no fuel rate exists for either the driver country or trip-origin country
//   - distance resolves to 0 (synthetic fallback for unknown cities)
import { findCity } from "@/lib/constants/cities";
import { getRouteDistance } from "./distance";
import { getFuelPrice } from "./fuel";
import { calculatePriceRange } from "./range";
import type { PriceRangeResult, PricingCurrency } from "./types";

export async function getSuggestedPriceRange(input: {
  originLabel: string;
  destinationLabel: string;
  driverCountry: string | null;
}): Promise<PriceRangeResult | null> {
  const origin = findCity(input.originLabel);
  const destination = findCity(input.destinationLabel);
  if (!origin || !destination) return null;

  const candidates = [input.driverCountry, origin.country].filter(
    (c): c is string => !!c,
  );

  let chosenCountry: string | null = null;
  let chosenFuel: { chfPerKm: number; currency: PricingCurrency } | null = null;
  for (const cc of candidates) {
    const fuel = await getFuelPrice(cc);
    if (fuel) {
      chosenCountry = cc;
      chosenFuel = { chfPerKm: fuel.chfPerKm, currency: fuel.currency };
      break;
    }
  }
  if (!chosenCountry || !chosenFuel) return null;

  const distance = await getRouteDistance(
    input.originLabel,
    input.destinationLabel,
  );
  if (distance.km <= 0) return null;

  return {
    range: calculatePriceRange({
      distanceKm: distance.km,
      chfPerKm: chosenFuel.chfPerKm,
      currency: chosenFuel.currency,
    }),
    distanceKm: distance.km,
    source: distance.source,
    fuelCountry: chosenCountry,
    chfPerKm: chosenFuel.chfPerKm,
  };
}
