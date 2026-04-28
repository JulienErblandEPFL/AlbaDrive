// Pure low/typical/high price-range calculator. Input semantics:
//   - distanceKm: road distance for the trip (not Haversine)
//   - chfPerKm: per-passenger cost-sharing rate from fuel_prices
//     (already includes the 0.50 passenger_share_factor — see migration 007)
//   - currency: jurisdiction tag for forward-compat. Phase 1 always
//     formats UI in CHF regardless. Carried through unchanged.
//
// Output is the per-passenger contribution range in CHF (numeric value;
// the UI applies Intl.NumberFormat). The driver's revenue when the car
// fills up is intentionally NOT modelled here — see project.md cost-
// sharing legal posture.
import { RANGE_FACTORS, ROUNDING_STEP_CHF } from "./config";
import type { PriceRange, PricingCurrency } from "./types";

function roundToStep(v: number, step: number): number {
  return Math.round(v / step) * step;
}

export function calculatePriceRange(input: {
  distanceKm: number;
  chfPerKm: number;
  currency: PricingCurrency;
}): PriceRange {
  if (input.distanceKm <= 0 || input.chfPerKm <= 0) {
    return { currency: input.currency, low: 0, typical: 0, high: 0 };
  }
  const base = input.distanceKm * input.chfPerKm;
  return {
    currency: input.currency,
    low: roundToStep(base * RANGE_FACTORS.low, ROUNDING_STEP_CHF),
    typical: roundToStep(base * RANGE_FACTORS.typical, ROUNDING_STEP_CHF),
    high: roundToStep(base * RANGE_FACTORS.high, ROUNDING_STEP_CHF),
  };
}
