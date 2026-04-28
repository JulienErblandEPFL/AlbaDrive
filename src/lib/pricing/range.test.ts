import { describe, expect, it } from "vitest";
import { calculatePriceRange } from "./range";

describe("calculatePriceRange", () => {
  it("Bern→Lyon at 0.0629 CHF/km (CH per-pax), 280km → 15/17.5/20.5", () => {
    const r = calculatePriceRange({
      distanceKm: 280,
      chfPerKm: 0.0629,
      currency: "CHF",
    });
    expect(r).toEqual({ currency: "CHF", low: 15, typical: 17.5, high: 20.5 });
  });

  it("Genève→Pristina at 0.0629 CHF/km, 1900km → 101.5/119.5/137.5", () => {
    const r = calculatePriceRange({
      distanceKm: 1900,
      chfPerKm: 0.0629,
      currency: "CHF",
    });
    expect(r).toEqual({
      currency: "CHF",
      low: 101.5,
      typical: 119.5,
      high: 137.5,
    });
  });

  it("carries the EUR currency tag for jurisdictions where it applies", () => {
    const r = calculatePriceRange({
      distanceKm: 280,
      chfPerKm: 0.0598,
      currency: "EUR",
    });
    expect(r.currency).toBe("EUR");
    // base 280 × 0.0598 = 16.744; low 14.23→14, typical 16.744→16.5, high 19.26→19.5
    expect(r).toEqual({ currency: "EUR", low: 14, typical: 16.5, high: 19.5 });
  });

  it("rounds to nearest 0.5", () => {
    // 100 × 0.04 = 4.0 typical; low = 3.4 → 3.5; high = 4.6 → 4.5
    const r = calculatePriceRange({
      distanceKm: 100,
      chfPerKm: 0.04,
      currency: "CHF",
    });
    expect(r).toEqual({ currency: "CHF", low: 3.5, typical: 4, high: 4.5 });
  });

  it("zero distance → 0/0/0", () => {
    expect(
      calculatePriceRange({ distanceKm: 0, chfPerKm: 0.05, currency: "CHF" }),
    ).toEqual({ currency: "CHF", low: 0, typical: 0, high: 0 });
  });

  it("very large trip is monotonic low ≤ typical ≤ high", () => {
    const r = calculatePriceRange({
      distanceKm: 5000,
      chfPerKm: 0.05,
      currency: "CHF",
    });
    expect(r.low).toBeLessThanOrEqual(r.typical);
    expect(r.typical).toBeLessThanOrEqual(r.high);
  });

  it("rejects negative inputs by returning all-zero", () => {
    expect(
      calculatePriceRange({ distanceKm: -10, chfPerKm: 0.04, currency: "CHF" }),
    ).toEqual({ currency: "CHF", low: 0, typical: 0, high: 0 });
    expect(
      calculatePriceRange({ distanceKm: 100, chfPerKm: -0.04, currency: "CHF" }),
    ).toEqual({ currency: "CHF", low: 0, typical: 0, high: 0 });
  });
});
