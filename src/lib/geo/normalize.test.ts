import { describe, expect, it } from "vitest";
import { normalizeForSearch } from "./normalize";

describe("normalizeForSearch", () => {
  it("strips German umlauts", () => {
    expect(normalizeForSearch("München")).toBe("munchen");
    expect(normalizeForSearch("Düsseldorf")).toBe("dusseldorf");
    expect(normalizeForSearch("Zürich")).toBe("zurich");
    expect(normalizeForSearch("Nürnberg")).toBe("nurnberg");
    expect(normalizeForSearch("Köln")).toBe("koln");
  });

  it("strips Albanian ë and ç", () => {
    expect(normalizeForSearch("Shkodër")).toBe("shkoder");
    expect(normalizeForSearch("Tetovë")).toBe("tetove");
    expect(normalizeForSearch("Vlorë")).toBe("vlore");
    expect(normalizeForSearch("Korçë")).toBe("korce");
    expect(normalizeForSearch("Gjirokastër")).toBe("gjirokaster");
    expect(normalizeForSearch("Durrës")).toBe("durres");
  });

  it("strips French accents", () => {
    expect(normalizeForSearch("Genève")).toBe("geneve");
  });

  it("strips Serbian háček (Niš)", () => {
    expect(normalizeForSearch("Niš")).toBe("nis");
  });

  it("is idempotent on already-ASCII input", () => {
    expect(normalizeForSearch("Bern")).toBe("bern");
    expect(normalizeForSearch("paris")).toBe("paris");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeForSearch("  München  ")).toBe("munchen");
    expect(normalizeForSearch("\tShkodër\n")).toBe("shkoder");
  });

  it("is locale-insensitive (round-trips between accented and ASCII)", () => {
    expect(normalizeForSearch("munchen")).toBe(normalizeForSearch("München"));
    expect(normalizeForSearch("shkoder")).toBe(normalizeForSearch("Shkodër"));
    expect(normalizeForSearch("KORCE")).toBe(normalizeForSearch("Korçë"));
  });

  it("handles empty input", () => {
    expect(normalizeForSearch("")).toBe("");
    expect(normalizeForSearch("   ")).toBe("");
  });
});
