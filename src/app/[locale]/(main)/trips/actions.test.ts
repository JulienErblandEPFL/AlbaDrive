// src/app/(main)/trips/actions.test.ts
import type { ActionError } from "@/types/actions";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServerClient } from "@/lib/supabase/server";
import { buildSupabaseMock, MOCK_USER } from "@/lib/test-utils/supabase-mock";
import { createTrip, cancelTrip, getSuggestedPriceRange } from "./actions";
import { getSuggestedPriceRange as orchestrator } from "@/lib/pricing";

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/pricing", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pricing")>(
    "@/lib/pricing",
  );
  return {
    ...actual,
    getSuggestedPriceRange: vi.fn(),
  };
});

const VALID_TRIP_INPUT = {
  origin: { label: "Genève, Suisse", lat: 46.2044, lng: 6.1432, place_id: "node/1" },
  destination: { label: "Tirana, Albanie", lat: 41.3275, lng: 19.8187, place_id: "node/2" },
  departure_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // +7 days
  total_seats: 3,
  price_per_seat: 45.00,
};

const MOCK_TRIP = {
  id: "trip-abc-123",
  driver_id: MOCK_USER.id,
  ...VALID_TRIP_INPUT,
  available_seats: 3,
  status: "open",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  vehicle_description: null,
  notes: null,
  deleted_at: null,
};

describe("createTrip", () => {
  let mockSingle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { mockClient, mockSingle: single } = buildSupabaseMock();
    mockSingle = single;
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);
  });

  it("returns error when user is not authenticated", async () => {
    const { mockClient } = buildSupabaseMock({ user: null, authError: { message: "No session" } });
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);

    const result = await createTrip(VALID_TRIP_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.common.auth_required");
  });

  it("returns error when departure_at is in the past", async () => {
    const result = await createTrip({
      ...VALID_TRIP_INPUT,
      departure_at: new Date(Date.now() - 1000).toISOString(),
    });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("validation.trip.departure_at.future");
  });

  it("returns error when total_seats is 0", async () => {
    const result = await createTrip({ ...VALID_TRIP_INPUT, total_seats: 0 });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBeDefined();
  });

  it("returns error when origin label is missing", async () => {
    const result = await createTrip({
      ...VALID_TRIP_INPUT,
      origin: { label: "", lat: 46.2, lng: 6.1 },
    });

    expect(result.success).toBe(false);
  });

  it("creates a trip and returns it on valid input", async () => {
    mockSingle.mockResolvedValue({ data: MOCK_TRIP, error: null });

    const result = await createTrip(VALID_TRIP_INPUT);

    expect(result.success).toBe(true);
    expect((result as { data: typeof MOCK_TRIP }).data!.id).toBe("trip-abc-123");
    expect((result as { data: typeof MOCK_TRIP }).data!.available_seats).toBe(3);
  });

  it("returns generic error (not raw DB message) when DB fails", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "duplicate key value violates unique constraint" },
    });

    const result = await createTrip(VALID_TRIP_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.trip.create_failed");
  });
});

describe("cancelTrip", () => {
  let mockSingle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { mockClient, mockSingle: single } = buildSupabaseMock();
    mockSingle = single;
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);
  });

  it("returns error when unauthenticated", async () => {
    const { mockClient } = buildSupabaseMock({ user: null, authError: { message: "No session" } });
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);

    const result = await cancelTrip({ trip_id: "trip-abc-123" });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.common.auth_required");
  });

  it("returns error when trip_id is not a valid UUID", async () => {
    const result = await cancelTrip({ trip_id: "not-a-uuid" });

    expect(result.success).toBe(false);
  });

  it("returns error when trip is not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "No rows" } });

    const result = await cancelTrip({ trip_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.trip.not_found");
  });

  it("returns Unauthorized when user is not the driver", async () => {
    mockSingle.mockResolvedValue({
      data: { driver_id: "someone-else-id", status: "open" },
      error: null,
    });

    const result = await cancelTrip({ trip_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.common.unauthorized");
  });

  it("returns error when trip is already cancelled", async () => {
    mockSingle.mockResolvedValue({
      data: { driver_id: MOCK_USER.id, status: "cancelled" },
      error: null,
    });

    const result = await cancelTrip({ trip_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    const err = (result as { error: ActionError }).error;
    expect(err.code).toBe("errors.trip.already_status");
    expect(err.params?.status).toBe("cancelled");
  });

  it("successfully cancels an open trip", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { driver_id: MOCK_USER.id, status: "open" }, error: null })
      .mockResolvedValueOnce({ data: {}, error: null });

    const result = await cancelTrip({ trip_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(true);
  });
});

describe("getSuggestedPriceRange (Server Action)", () => {
  let mockMaybeSingle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { mockClient, mockMaybeSingle: maybe } = buildSupabaseMock();
    mockMaybeSingle = maybe;
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);
  });

  it("returns auth_required when not signed in", async () => {
    const { mockClient } = buildSupabaseMock({
      user: null,
      authError: { message: "No session" },
    });
    vi.mocked(createServerClient).mockResolvedValue(mockClient as any);

    const result = await getSuggestedPriceRange({
      originLabel: "Bern",
      destinationLabel: "Lyon",
    });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe(
      "errors.common.auth_required",
    );
  });

  it("returns success with the orchestrator result for an authed user", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { country: "CH" },
      error: null,
    });
    (orchestrator as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      range: { currency: "CHF", low: 15, typical: 17.5, high: 20.5 },
      distanceKm: 280,
      source: "ors",
      fuelCountry: "CH",
      chfPerKm: 0.0629,
    });

    const result = await getSuggestedPriceRange({
      originLabel: "Bern",
      destinationLabel: "Lyon",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.range.typical).toBe(17.5);
      expect(result.data?.range.currency).toBe("CHF");
      expect(result.data?.fuelCountry).toBe("CH");
    }
    // Driver country was passed through from the profile
    expect(orchestrator).toHaveBeenCalledWith(
      expect.objectContaining({ driverCountry: "CH" }),
    );
  });

  it("returns success with data:null when orchestrator returns null", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    (orchestrator as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    const result = await getSuggestedPriceRange({
      originLabel: "Atlantis",
      destinationLabel: "Lyon",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
    // Profile lookup returned no row → driverCountry is null
    expect(orchestrator).toHaveBeenCalledWith(
      expect.objectContaining({ driverCountry: null }),
    );
  });

  it("returns suggestion_failed when the orchestrator throws", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { country: "CH" },
      error: null,
    });
    (orchestrator as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("kaboom"),
    );

    const result = await getSuggestedPriceRange({
      originLabel: "Bern",
      destinationLabel: "Lyon",
    });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe(
      "errors.pricing.suggestion_failed",
    );
  });
});
