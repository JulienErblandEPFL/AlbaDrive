// src/app/(main)/trips/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServerClient } from "@/lib/supabase/server";
import { buildSupabaseMock, MOCK_USER } from "@/lib/test-utils/supabase-mock";
import { createTrip, cancelTrip } from "./actions";

vi.mock("@/lib/supabase/server");

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
    expect((result as { error: string }).error).toBe("Authentication required.");
  });

  it("returns error when departure_at is in the past", async () => {
    const result = await createTrip({
      ...VALID_TRIP_INPUT,
      departure_at: new Date(Date.now() - 1000).toISOString(),
    });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("future");
  });

  it("returns error when total_seats is 0", async () => {
    const result = await createTrip({ ...VALID_TRIP_INPUT, total_seats: 0 });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBeDefined();
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
    expect((result as { error: string }).error).toBe("Failed to create trip. Please try again.");
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
    expect((result as { error: string }).error).toBe("Authentication required.");
  });

  it("returns error when trip_id is not a valid UUID", async () => {
    const result = await cancelTrip({ trip_id: "not-a-uuid" });

    expect(result.success).toBe(false);
  });

  it("returns error when trip is not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "No rows" } });

    const result = await cancelTrip({ trip_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Trip not found.");
  });

  it("returns Unauthorized when user is not the driver", async () => {
    mockSingle.mockResolvedValue({
      data: { driver_id: "someone-else-id", status: "open" },
      error: null,
    });

    const result = await cancelTrip({ trip_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Unauthorized.");
  });

  it("returns error when trip is already cancelled", async () => {
    mockSingle.mockResolvedValue({
      data: { driver_id: MOCK_USER.id, status: "cancelled" },
      error: null,
    });

    const result = await cancelTrip({ trip_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("cancelled");
  });

  it("successfully cancels an open trip", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { driver_id: MOCK_USER.id, status: "open" }, error: null })
      .mockResolvedValueOnce({ data: {}, error: null });

    const result = await cancelTrip({ trip_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(true);
  });
});
