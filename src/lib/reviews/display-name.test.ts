// src/lib/reviews/display-name.test.ts
import { describe, it, expect } from "vitest";
import { pseudonymizeName } from "./display-name";

describe("pseudonymizeName", () => {
  it("converts 'Jean Dupont' to 'Jean D.'", () => {
    expect(pseudonymizeName("Jean Dupont")).toBe("Jean D.");
  });

  it("leaves a single-token name unchanged", () => {
    expect(pseudonymizeName("Jean")).toBe("Jean");
  });

  it("collapses middle names using the last token's initial", () => {
    expect(pseudonymizeName("Jean Marie Dupont")).toBe("Jean D.");
  });

  it("preserves hyphenated first names", () => {
    expect(pseudonymizeName("Jean-Marie Dupont")).toBe("Jean-Marie D.");
  });

  it("uppercases the last initial", () => {
    expect(pseudonymizeName("agim hoxha")).toBe("agim H.");
  });

  it("returns '?' for an empty or whitespace-only name", () => {
    expect(pseudonymizeName("")).toBe("?");
    expect(pseudonymizeName("   ")).toBe("?");
  });

  it("tolerates multiple internal spaces", () => {
    expect(pseudonymizeName("Jean   Dupont")).toBe("Jean D.");
  });
});
