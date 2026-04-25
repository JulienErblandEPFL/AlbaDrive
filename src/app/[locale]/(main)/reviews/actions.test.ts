// src/app/(main)/reviews/actions.test.ts
import type { ActionError } from "@/types/actions";
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
    expect((result as { error: ActionError }).error.code).toBe("errors.common.auth_required");
  });

  it("returns the zod message when rating is out of range", async () => {
    setupMock(MOCK_USER);

    const result = await submitReview({ ...VALID_DRIVER_INPUT, rating: 7 });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("validation.review.rating.range");
  });

  it("returns the zod message when comment exceeds 1000 chars", async () => {
    setupMock(MOCK_USER);

    const result = await submitReview({ ...VALID_DRIVER_INPUT, comment: "a".repeat(1001) });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("validation.review.comment.too_long");
  });

  it("rejects when trip is not completed", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: "TRIP_NOT_COMPLETED", error: null });

    const result = await submitReview(VALID_DRIVER_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.review.trip_not_completed");
  });

  it("rejects when the two users did not share the trip", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: "NOT_PARTICIPANTS", error: null });

    const result = await submitReview(VALID_DRIVER_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.review.not_participants");
  });

  it("rejects when the 30-day review window has expired", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: "WINDOW_EXPIRED", error: null });

    const result = await submitReview(VALID_DRIVER_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.review.window_expired");
  });

  it("rejects self-review via RPC code", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: "SELF_REVIEW", error: null });

    const result = await submitReview({ ...VALID_DRIVER_INPUT, reviewee_id: MOCK_USER.id });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.review.self_review");
  });

  it("rejects a duplicate via RPC code", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: "DUPLICATE", error: null });

    const result = await submitReview(VALID_DRIVER_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.review.duplicate");
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
    expect((result as { error: ActionError }).error.code).toBe("errors.review.duplicate");
  });
});

import { getPassengerReviewSummary, getDriverReviewDetails } from "./actions";
import type { ReviewSummary } from "@/types/database.types";

const ANOTHER_PASSENGER = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", email: "p2@test.com" };

describe("getPassengerReviewSummary", () => {
  let mockRpc: ReturnType<typeof vi.fn>;

  function setupMock(user: { id: string; email: string } | null) {
    vi.clearAllMocks();
    const built = buildSupabaseMock({ user });
    mockRpc = vi.fn();
    const mockClient = { ...built.mockClient, rpc: mockRpc };
    vi.mocked(createServerClient).mockResolvedValue(mockClient as unknown as Awaited<ReturnType<typeof createServerClient>>);
  }

  it("returns error when unauthenticated", async () => {
    setupMock(null);

    const result = await getPassengerReviewSummary({ user_id: ANOTHER_PASSENGER.id });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.common.auth_required");
  });

  it("returns error when RPC returns null (caller has no booking with this passenger)", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await getPassengerReviewSummary({ user_id: ANOTHER_PASSENGER.id });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.review.unauthorized");
  });

  it("returns the summary with pseudonymised reviewer names", async () => {
    setupMock(MOCK_USER);
    const now = new Date().toISOString();
    mockRpc.mockResolvedValueOnce({
      data: {
        avg: 4.5,
        count: 2,
        recent: [
          { id: "r1", rating: 5, comment: "Super", reviewer_full_name: "Jean Dupont", created_at: now },
          { id: "r2", rating: 4, comment: "Bien", reviewer_full_name: "Marie Kelmendi", created_at: now },
        ],
      },
      error: null,
    });

    const result = await getPassengerReviewSummary({ user_id: ANOTHER_PASSENGER.id });

    expect(result.success).toBe(true);
    const data = (result as { data: { avg: number; count: number; recent: Array<{ reviewerDisplayName: string }> } }).data!;
    expect(data.avg).toBe(4.5);
    expect(data.count).toBe(2);
    expect(data.recent).toHaveLength(2);
    expect(data.recent[0].reviewerDisplayName).toBe("Jean D.");
    expect(data.recent[1].reviewerDisplayName).toBe("Marie K.");
  });

  it("returns empty-but-authorised when RPC returns zero count", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({
      data: { avg: 0, count: 0, recent: [] },
      error: null,
    });

    const result = await getPassengerReviewSummary({ user_id: ANOTHER_PASSENGER.id });

    expect(result.success).toBe(true);
    const data = (result as { data: { count: number } }).data!;
    expect(data.count).toBe(0);
  });
});

describe("getDriverReviewDetails", () => {
  let mockRpc: ReturnType<typeof vi.fn>;

  function setupMock(user: { id: string; email: string } | null) {
    vi.clearAllMocks();
    const built = buildSupabaseMock({ user });
    mockRpc = vi.fn();
    const mockClient = { ...built.mockClient, rpc: mockRpc };
    vi.mocked(createServerClient).mockResolvedValue(mockClient as unknown as Awaited<ReturnType<typeof createServerClient>>);
  }

  it("returns error when unauthenticated", async () => {
    setupMock(null);
    const result = await getDriverReviewDetails({ user_id: MOCK_USER.id });
    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.common.auth_required");
  });

  it("returns error when RPC returns null (no accepted booking relationship)", async () => {
    setupMock(MOCK_PASSENGER);
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await getDriverReviewDetails({ user_id: MOCK_USER.id });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe("errors.review.unauthorized");
  });

  it("returns pseudonymised recent comments about the driver", async () => {
    setupMock(MOCK_PASSENGER);
    const now = new Date().toISOString();
    mockRpc.mockResolvedValueOnce({
      data: {
        avg: 4.8,
        count: 10,
        recent: [
          { id: "r1", rating: 5, comment: "Ponctuel", reviewer_full_name: "Artan Doci", created_at: now },
        ],
      },
      error: null,
    });

    const result = await getDriverReviewDetails({ user_id: MOCK_USER.id });

    expect(result.success).toBe(true);
    const data = (result as { data: ReviewSummary }).data!;
    expect(data.recent[0].reviewerDisplayName).toBe("Artan D.");
    expect(data.recent[0].rating).toBe(5);
  });
});
