// src/app/(main)/reviews/actions.test.ts
import { describe, it, expect, vi } from "vitest";
import { createServerClient } from "@/lib/supabase/server";
import { buildSupabaseMock, MOCK_USER, MOCK_PASSENGER } from "@/lib/test-utils/supabase-mock";
import { submitReview } from "./actions";

vi.mock("@/lib/supabase/server");

const TRIP_ID = "11111111-1111-4111-8111-111111111111";

const VALID_DRIVER_INPUT = {
  trip_id: TRIP_ID,
  reviewee_id: MOCK_PASSENGER.id,
  rating: 5,
  comment: "Excellent passager, très ponctuel.",
};

const VALID_PASSENGER_INPUT = {
  trip_id: TRIP_ID,
  reviewee_id: MOCK_USER.id,
  rating: 4,
  comment: "Bon conducteur, trajet agréable.",
};

describe("submitReview — happy paths", () => {
  let mockRpc: ReturnType<typeof vi.fn>;
  let mockSingle: ReturnType<typeof vi.fn>;
  let chain: { insert: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> };

  function setupMock(user: { id: string; email: string } | null) {
    vi.clearAllMocks();
    const built = buildSupabaseMock({ user });
    mockSingle = built.mockSingle;
    chain = built.chain;
    mockRpc = vi.fn();
    const mockClient = {
      ...built.mockClient,
      rpc: mockRpc,
    };
    vi.mocked(createServerClient).mockResolvedValue(mockClient as unknown as Awaited<ReturnType<typeof createServerClient>>);
  }

  it("creates a review when a driver reviews their passenger", async () => {
    setupMock(MOCK_USER); // MOCK_USER is the driver
    mockRpc.mockResolvedValueOnce({ data: "OK", error: null }); // can_review_reason
    mockSingle.mockResolvedValueOnce({
      data: { id: "review-1", ...VALID_DRIVER_INPUT, reviewer_id: MOCK_USER.id, created_at: new Date().toISOString() },
      error: null,
    });

    const result = await submitReview(VALID_DRIVER_INPUT);

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("can_review_reason", {
      p_reviewee_id: VALID_DRIVER_INPUT.reviewee_id,
      p_trip_id: VALID_DRIVER_INPUT.trip_id,
    });
  });

  it("creates a review when a passenger reviews their driver", async () => {
    setupMock(MOCK_PASSENGER);
    mockRpc.mockResolvedValueOnce({ data: "OK", error: null });
    mockSingle.mockResolvedValueOnce({
      data: { id: "review-2", ...VALID_PASSENGER_INPUT, reviewer_id: MOCK_PASSENGER.id, created_at: new Date().toISOString() },
      error: null,
    });

    const result = await submitReview(VALID_PASSENGER_INPUT);

    expect(result.success).toBe(true);
  });

  it("sets reviewer_id from auth.uid, ignoring any field in the input", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: "OK", error: null });
    mockSingle.mockResolvedValueOnce({ data: { id: "review-3" }, error: null });

    await submitReview({ ...VALID_DRIVER_INPUT, reviewer_id: "attacker-id" } as never);

    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      reviewer_id: MOCK_USER.id,
    }));
  });
});

describe("submitReview — rejections", () => {
  let mockRpc: ReturnType<typeof vi.fn>;
  let mockSingle: ReturnType<typeof vi.fn>;

  function setupMock(user: { id: string; email: string } | null, authError: { message: string } | null = null) {
    vi.clearAllMocks();
    const built = buildSupabaseMock({ user, authError });
    mockSingle = built.mockSingle;
    mockRpc = vi.fn();
    const mockClient = { ...built.mockClient, rpc: mockRpc };
    vi.mocked(createServerClient).mockResolvedValue(mockClient as unknown as Awaited<ReturnType<typeof createServerClient>>);
  }

  it("returns error when unauthenticated", async () => {
    setupMock(null, { message: "No session" });

    const result = await submitReview(VALID_DRIVER_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Authentification requise.");
  });

  it("returns the zod message when rating is out of range", async () => {
    setupMock(MOCK_USER);

    const result = await submitReview({ ...VALID_DRIVER_INPUT, rating: 7 });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/entre 1 et 5/);
  });

  it("returns the zod message when comment exceeds 1000 chars", async () => {
    setupMock(MOCK_USER);

    const result = await submitReview({ ...VALID_DRIVER_INPUT, comment: "a".repeat(1001) });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/trop long/);
  });

  it("rejects when trip is not completed", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: "TRIP_NOT_COMPLETED", error: null });

    const result = await submitReview(VALID_DRIVER_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Vous ne pouvez évaluer qu'un trajet terminé.");
  });

  it("rejects when the two users did not share the trip", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: "NOT_PARTICIPANTS", error: null });

    const result = await submitReview(VALID_DRIVER_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Vous n'avez pas partagé ce trajet avec cette personne.");
  });

  it("rejects when the 30-day review window has expired", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: "WINDOW_EXPIRED", error: null });

    const result = await submitReview(VALID_DRIVER_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/30 jours/);
  });

  it("rejects self-review via RPC code", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: "SELF_REVIEW", error: null });

    const result = await submitReview({ ...VALID_DRIVER_INPUT, reviewee_id: MOCK_USER.id });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/vous-même/);
  });

  it("rejects a duplicate via RPC code", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: "DUPLICATE", error: null });

    const result = await submitReview(VALID_DRIVER_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/déjà laissé un avis/);
  });

  it("rejects a duplicate via insert unique-violation (belt & suspenders)", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: "OK", error: null });
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "unique constraint violation" },
    });

    const result = await submitReview(VALID_DRIVER_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/déjà laissé un avis/);
  });
});
