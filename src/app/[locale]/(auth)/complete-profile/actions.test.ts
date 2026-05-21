import { describe, expect, it, vi, beforeEach } from "vitest";
import { MOCK_USER } from "@/lib/test-utils/supabase-mock";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { completeProfile } from "./actions";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type AnyMock = ReturnType<typeof vi.fn>;

function buildClient(upsert: AnyMock) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: MOCK_USER.id } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({ upsert }),
  };
}

describe("completeProfile country", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts country when provided", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    (createServerClient as unknown as AnyMock).mockResolvedValue(buildClient(upsert));

    await completeProfile({
      full_name: "Ada Lovelace",
      phone: "+41791234567",
      country: "CH",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: MOCK_USER.id,
        full_name: "Ada Lovelace",
        phone: "+41791234567",
        country: "CH",
      }),
      expect.any(Object),
    );
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("upserts without country when omitted", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    (createServerClient as unknown as AnyMock).mockResolvedValue(buildClient(upsert));

    await completeProfile({
      full_name: "Ada Lovelace",
      phone: "+41791234567",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({ country: expect.anything() }),
      expect.any(Object),
    );
  });
});
