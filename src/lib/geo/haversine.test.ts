import { describe, expect, it } from "vitest";
import { haversineKm } from "./haversine";

describe("haversineKm", () => {
  it("returns 0 for the same point", () => {
    const p = { lat: 46.9481, lng: 7.4474 };
    expect(haversineKm(p, p)).toBe(0);
  });

  it("is symmetric", () => {
    const a = { lat: 46.2044, lng: 6.1432 }; // Genève
    const b = { lat: 46.5197, lng: 6.6323 }; // Lausanne
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });

  it("Genève ↔ Lausanne ≈ 50 km", () => {
    const geneve = { lat: 46.2044, lng: 6.1432 };
    const lausanne = { lat: 46.5197, lng: 6.6323 };
    const d = haversineKm(geneve, lausanne);
    // ground truth ~49.7 km
    expect(d).toBeGreaterThan(45);
    expect(d).toBeLessThan(55);
  });

  it("Bern ↔ Biel/Bienne ≈ 26 km", () => {
    const bern = { lat: 46.9481, lng: 7.4474 };
    const biel = { lat: 47.1368, lng: 7.2467 };
    const d = haversineKm(bern, biel);
    expect(d).toBeGreaterThan(20);
    expect(d).toBeLessThan(32);
  });

  it("München ↔ Augsburg ≈ 57 km", () => {
    const munich = { lat: 48.1351, lng: 11.582 };
    const augsburg = { lat: 48.3717, lng: 10.8983 };
    const d = haversineKm(munich, augsburg);
    expect(d).toBeGreaterThan(50);
    expect(d).toBeLessThan(65);
  });

  it("Pristina ↔ Tirana ≈ 200 km", () => {
    const pristina = { lat: 42.6629, lng: 21.1655 };
    const tirana = { lat: 41.3275, lng: 19.8187 };
    const d = haversineKm(pristina, tirana);
    expect(d).toBeGreaterThan(180);
    expect(d).toBeLessThan(220);
  });

  it("antipodal points are ≈ half the Earth's circumference", () => {
    const north = { lat: 0, lng: 0 };
    const south = { lat: 0, lng: 180 };
    const d = haversineKm(north, south);
    // π · R ≈ 20015 km
    expect(d).toBeGreaterThan(19000);
    expect(d).toBeLessThan(21000);
  });
});
