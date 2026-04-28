import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }));

import { createServerClient } from "@/lib/supabase/server";
import { getFuelPrice } from "./fuel";

type AnyMock = ReturnType<typeof vi.fn>;

describe("getFuelPrice", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns CH rate with CHF currency tag", async () => {
    (createServerClient as unknown as AnyMock).mockResolvedValue({
      rpc: () =>
        Promise.resolve({
          data: [{ chf_per_km: 0.0629, currency: "CHF" }],
          error: null,
        }),
    });
    expect(await getFuelPrice("CH")).toEqual({
      chfPerKm: 0.0629,
      currency: "CHF",
      source: "db",
    });
  });

  it("returns DE rate with EUR currency tag", async () => {
    (createServerClient as unknown as AnyMock).mockResolvedValue({
      rpc: () =>
        Promise.resolve({
          data: [{ chf_per_km: 0.0564, currency: "EUR" }],
          error: null,
        }),
    });
    expect(await getFuelPrice("DE")).toEqual({
      chfPerKm: 0.0564,
      currency: "EUR",
      source: "db",
    });
  });

  it("returns null when the RPC returns no rows", async () => {
    (createServerClient as unknown as AnyMock).mockResolvedValue({
      rpc: () => Promise.resolve({ data: [], error: null }),
    });
    expect(await getFuelPrice("US")).toBeNull();
  });

  it("returns null on RPC error (defensive)", async () => {
    (createServerClient as unknown as AnyMock).mockResolvedValue({
      rpc: () =>
        Promise.resolve({ data: null, error: { message: "boom" } }),
    });
    expect(await getFuelPrice("CH")).toBeNull();
  });
});
