import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("./ors", () => ({
  fetchOrsDistance: vi.fn(),
  OrsConfigError: class extends Error {
    constructor() {
      super("ORS_API_KEY missing");
    }
  },
  OrsRateLimitError: class extends Error {},
  OrsResponseError: class extends Error {},
  OrsTimeoutError: class extends Error {},
}));

import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { fetchOrsDistance, OrsConfigError } from "./ors";
import { getRouteDistance } from "./distance";

type AnyMock = ReturnType<typeof vi.fn>;

function mockCacheHit(row: {
  distance_km: number;
  duration_seconds: number | null;
  source: string;
}) {
  (createServerClient as unknown as AnyMock).mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => ({ data: row, error: null }),
          }),
        }),
      }),
    }),
  });
}

function mockCacheMiss() {
  (createServerClient as unknown as AnyMock).mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  });
}

function mockServiceWriter(upsert: AnyMock) {
  (createClient as unknown as AnyMock).mockReturnValue({
    from: () => ({ upsert }),
  });
}

describe("getRouteDistance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  });

  it("returns cached row without calling ORS", async () => {
    mockCacheHit({
      distance_km: 57,
      duration_seconds: 2400,
      source: "ors",
    });

    const r = await getRouteDistance("München", "Augsburg");

    expect(r).toEqual({ km: 57, source: "ors", durationSeconds: 2400 });
    expect(fetchOrsDistance).not.toHaveBeenCalled();
  });

  it("on cache miss calls ORS and writes both directions", async () => {
    mockCacheMiss();
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockServiceWriter(upsert);
    (fetchOrsDistance as unknown as AnyMock).mockResolvedValue({
      km: 57,
      durationSeconds: 2400,
    });

    const r = await getRouteDistance("München", "Augsburg");

    expect(r).toEqual({ km: 57, source: "ors", durationSeconds: 2400 });
    expect(upsert).toHaveBeenCalledTimes(1);
    const rows = upsert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0].origin_label).toBe("München");
    expect(rows[0].destination_label).toBe("Augsburg");
    expect(rows[1].origin_label).toBe("Augsburg");
    expect(rows[1].destination_label).toBe("München");
  });

  it("falls back to haversine × 1.3 when ORS throws OrsConfigError", async () => {
    mockCacheMiss();
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockServiceWriter(upsert);
    (fetchOrsDistance as unknown as AnyMock).mockRejectedValue(
      new OrsConfigError(),
    );

    const r = await getRouteDistance("München", "Augsburg");

    expect(r.source).toBe("haversine_fallback");
    // München–Augsburg haversine ≈ 56 km × 1.3 ≈ 73 km
    expect(r.km).toBeGreaterThan(70);
    expect(r.km).toBeLessThan(80);
  });

  it("returns synthetic zero-km haversine_fallback for unknown city labels", async () => {
    mockCacheMiss();
    const r = await getRouteDistance("Atlantis", "El Dorado");
    expect(r).toEqual({ km: 0, source: "haversine_fallback", durationSeconds: null });
    expect(fetchOrsDistance).not.toHaveBeenCalled();
  });

  it("never throws — returns fallback even when both ORS and the cache write fail", async () => {
    mockCacheMiss();
    (fetchOrsDistance as unknown as AnyMock).mockRejectedValue(
      new OrsConfigError(),
    );
    const upsert = vi.fn().mockRejectedValue(new Error("DB write blew up"));
    mockServiceWriter(upsert);

    const r = await getRouteDistance("München", "Augsburg");

    expect(r.source).toBe("haversine_fallback");
    expect(r.km).toBeGreaterThan(0);
  });
});
