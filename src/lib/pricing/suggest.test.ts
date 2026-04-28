import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./distance", () => ({ getRouteDistance: vi.fn() }));
vi.mock("./fuel", () => ({ getFuelPrice: vi.fn() }));

import { getRouteDistance } from "./distance";
import { getFuelPrice } from "./fuel";
import { getSuggestedPriceRange } from "./suggest";

type AnyMock = ReturnType<typeof vi.fn>;

describe("getSuggestedPriceRange", () => {
  beforeEach(() => vi.clearAllMocks());

  it("orchestrates distance + fuel into a price range", async () => {
    (getRouteDistance as unknown as AnyMock).mockResolvedValue({
      km: 1900,
      source: "ors",
      durationSeconds: 80000,
    });
    (getFuelPrice as unknown as AnyMock).mockResolvedValue({
      chfPerKm: 0.0629,
      currency: "CHF",
      source: "db",
    });

    const r = await getSuggestedPriceRange({
      originLabel: "Genève",
      destinationLabel: "Pristina",
      driverCountry: "CH",
    });
    expect(r).toEqual({
      range: { currency: "CHF", low: 101.5, typical: 119.5, high: 137.5 },
      distanceKm: 1900,
      source: "ors",
      fuelCountry: "CH",
      chfPerKm: 0.0629,
    });
  });

  it("falls back to trip-origin country when driverCountry is null", async () => {
    (getRouteDistance as unknown as AnyMock).mockResolvedValue({
      km: 280,
      source: "ors",
      durationSeconds: 12600,
    });
    (getFuelPrice as unknown as AnyMock).mockImplementation((cc: string) =>
      cc === "CH"
        ? Promise.resolve({ chfPerKm: 0.0629, currency: "CHF", source: "db" })
        : Promise.resolve(null),
    );

    // Bern is in CH per cities.ts
    const r = await getSuggestedPriceRange({
      originLabel: "Bern",
      destinationLabel: "Lyon",
      driverCountry: null,
    });
    expect(r?.fuelCountry).toBe("CH");
    expect(r?.range.currency).toBe("CHF");
  });

  it("returns null when neither driverCountry nor origin country has a fuel rate", async () => {
    (getRouteDistance as unknown as AnyMock).mockResolvedValue({
      km: 280,
      source: "ors",
      durationSeconds: 12600,
    });
    (getFuelPrice as unknown as AnyMock).mockResolvedValue(null);

    const r = await getSuggestedPriceRange({
      originLabel: "Bern",
      destinationLabel: "Lyon",
      driverCountry: "US",
    });
    expect(r).toBeNull();
  });

  it("returns null when origin or destination is not in the allowlist", async () => {
    const r = await getSuggestedPriceRange({
      originLabel: "Atlantis",
      destinationLabel: "Lyon",
      driverCountry: "CH",
    });
    expect(r).toBeNull();
  });
});
