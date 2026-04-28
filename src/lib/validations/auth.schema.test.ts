import { describe, expect, it } from "vitest";
import { completeProfileSchema } from "./auth.schema";

describe("completeProfileSchema country", () => {
  it("accepts a valid ISO-3166 alpha-2 code", () => {
    const r = completeProfileSchema.safeParse({
      full_name: "Ada Lovelace",
      phone: "+41791234567",
      country: "CH",
    });
    expect(r.success).toBe(true);
  });

  it("accepts undefined country (optional)", () => {
    const r = completeProfileSchema.safeParse({
      full_name: "Ada Lovelace",
      phone: "+41791234567",
    });
    expect(r.success).toBe(true);
  });

  it("rejects lowercase / 3-letter codes with the i18n key", () => {
    const r = completeProfileSchema.safeParse({
      full_name: "Ada Lovelace",
      phone: "+41791234567",
      country: "ch",
    });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toBe("validation.auth.country.format");
  });
});
