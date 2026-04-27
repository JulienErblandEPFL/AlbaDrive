import { describe, expect, it } from "vitest";
import { expandCityToNearby, findCityFlexible } from "./expand";

describe("findCityFlexible", () => {
  it("finds an exact label match", () => {
    expect(findCityFlexible("München")?.label).toBe("München");
    expect(findCityFlexible("Bern")?.label).toBe("Bern");
  });

  it("finds via diacritic-insensitive match", () => {
    expect(findCityFlexible("munchen")?.label).toBe("München");
    expect(findCityFlexible("MUNCHEN")?.label).toBe("München");
    expect(findCityFlexible("shkoder")?.label).toBe("Shkodër");
    expect(findCityFlexible("korce")?.label).toBe("Korçë");
    expect(findCityFlexible("zurich")?.label).toBe("Zürich");
    expect(findCityFlexible("geneve")?.label).toBe("Genève");
    expect(findCityFlexible("nis")?.label).toBe("Niš");
  });

  it("trims whitespace before matching", () => {
    expect(findCityFlexible("  München  ")?.label).toBe("München");
    expect(findCityFlexible("  shkoder\n")?.label).toBe("Shkodër");
  });

  it("returns null for empty input", () => {
    expect(findCityFlexible("")).toBeNull();
    expect(findCityFlexible("   ")).toBeNull();
  });

  it("returns null for an unknown city", () => {
    expect(findCityFlexible("Nowhereville")).toBeNull();
    expect(findCityFlexible("xyz123")).toBeNull();
  });
});

describe("expandCityToNearby", () => {
  it("returns origin first at distance 0", () => {
    const r = expandCityToNearby("Bern", 50);
    expect(r.origin?.label).toBe("Bern");
    expect(r.matches[0]?.city.label).toBe("Bern");
    expect(r.matches[0]?.distanceKm).toBe(0);
  });

  it("expand('Bern', 50) includes Biel/Bienne", () => {
    const r = expandCityToNearby("Bern", 50);
    const labels = r.matches.map((m) => m.city.label);
    expect(labels).toContain("Bern");
    expect(labels).toContain("Biel/Bienne");
  });

  it("expand('München', 50) returns just München (Augsburg ~57km is outside)", () => {
    const r = expandCityToNearby("München", 50);
    const labels = r.matches.map((m) => m.city.label);
    expect(labels).toEqual(["München"]);
  });

  it("expand('Tirana', 50) returns Tirana + Durrës + Elbasan, sorted by distance", () => {
    const r = expandCityToNearby("Tirana", 50);
    const labels = r.matches.map((m) => m.city.label);
    expect(labels[0]).toBe("Tirana");
    expect(labels).toContain("Durrës");
    expect(labels).toContain("Elbasan");
    // distances must be monotonic non-decreasing
    for (let i = 1; i < r.matches.length; i++) {
      expect(r.matches[i].distanceKm).toBeGreaterThanOrEqual(
        r.matches[i - 1].distanceKm,
      );
    }
  });

  it("respects the radius parameter", () => {
    const tight = expandCityToNearby("Tirana", 5);
    expect(tight.matches.map((m) => m.city.label)).toEqual(["Tirana"]);

    const wide = expandCityToNearby("München", 100);
    expect(wide.matches.map((m) => m.city.label)).toContain("Augsburg");
  });

  it("flexible match ('munchen') resolves to München", () => {
    const r = expandCityToNearby("munchen", 50);
    expect(r.origin?.label).toBe("München");
    expect(r.matches[0]?.city.label).toBe("München");
  });

  it("flexible match ('shkoder') resolves to Shkodër", () => {
    const r = expandCityToNearby("shkoder", 50);
    expect(r.origin?.label).toBe("Shkodër");
    expect(r.matches[0]?.city.label).toBe("Shkodër");
  });

  it("returns { origin: null, matches: [] } for unknown input", () => {
    const r = expandCityToNearby("Atlantis", 50);
    expect(r.origin).toBeNull();
    expect(r.matches).toEqual([]);
  });

  it("returns { origin: null, matches: [] } for empty input", () => {
    expect(expandCityToNearby("", 50)).toEqual({ origin: null, matches: [] });
    expect(expandCityToNearby("   ", 50)).toEqual({ origin: null, matches: [] });
  });
});
