export type DistanceSource = "ors" | "haversine_fallback";

// Forward-compat: documents the natural jurisdiction currency for the rate.
// Phase 1 always renders CHF in the UI regardless of this value (see plan).
export type PricingCurrency = "CHF" | "EUR";

export type RouteDistance = {
  km: number;
  source: DistanceSource;
  durationSeconds: number | null;
};

export type PriceRange = {
  currency: PricingCurrency;
  low: number;
  typical: number;
  high: number;
};

export type PriceRangeResult = {
  range: PriceRange;
  distanceKm: number;
  source: DistanceSource;
  fuelCountry: string;
  chfPerKm: number;
};
