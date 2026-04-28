// Tunables for the price-suggestion helper. Keep separate from src/lib/geo/
// (proximity search) so the two domains can evolve independently.

// Passenger cost-share factor — applied at seed time when fuel_prices is
// populated. Documented here for visibility even though range.ts itself
// receives chf_per_km already-multiplied. If you change this constant,
// you also need to re-seed fuel_prices.
export const PASSENGER_SHARE_FACTOR = 0.5;

export const RANGE_FACTORS = { low: 0.85, typical: 1.0, high: 1.15 } as const;
export const HIGH_PRICE_WARNING_MULTIPLIER = 1.5;
export const ROUNDING_STEP_CHF = 0.5;
export const ORS_TIMEOUT_MS = 3000;
export const HAVERSINE_ROAD_FACTOR = 1.3;
