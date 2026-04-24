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
