import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cookies } from "next/headers";
import type { ActionError } from "@/types/actions";

// ── Supabase mocks ────────────────────────────────────────────────────────
// Module-scope spies so individual tests can override return values.
const mockGetUser = vi.fn(async () => ({ data: { user: null as null | { id: string } } }));
const mockEq = vi.fn(async () => ({ error: null as null | { message: string } }));
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ update: mockUpdate }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

import { setLocale } from "./actions";

describe("setLocale", () => {
  let cookieSet: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    cookieSet = vi.fn();
    vi.mocked(cookies).mockReturnValue({
      getAll: vi.fn(() => []),
      set: cookieSet,
    } as never);

    // Defaults: anonymous request, profile update would succeed if reached.
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockEq.mockResolvedValue({ error: null });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it.each(["fr", "en", "de", "sq"] as const)(
    "writes the NEXT_LOCALE cookie when locale is %s (anonymous)",
    async (locale) => {
      const result = await setLocale({ locale });

      expect(result.success).toBe(true);
      expect(cookieSet).toHaveBeenCalledWith(
        "NEXT_LOCALE",
        locale,
        expect.objectContaining({ path: "/", sameSite: "lax" }),
      );
      // No profile write on anonymous requests.
      expect(mockUpdate).not.toHaveBeenCalled();
    },
  );

  it("rejects with a validation code when the locale is unsupported", async () => {
    const result = await setLocale({ locale: "it" });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe(
      "validation.locale.invalid",
    );
    expect(cookieSet).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects when no locale is provided", async () => {
    const result = await setLocale({});

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe(
      "validation.locale.invalid",
    );
    expect(cookieSet).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects when input is not an object", async () => {
    const result = await setLocale("fr");

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe(
      "validation.locale.invalid",
    );
    expect(cookieSet).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("persists preferred_locale to the user's profile when authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-abc-123" } } });

    const result = await setLocale({ locale: "de" });

    expect(result.success).toBe(true);
    expect(cookieSet).toHaveBeenCalledWith(
      "NEXT_LOCALE",
      "de",
      expect.objectContaining({ path: "/" }),
    );
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpdate).toHaveBeenCalledWith({ preferred_locale: "de" });
    expect(mockEq).toHaveBeenCalledWith("id", "user-abc-123");
  });

  it("still returns success and writes the cookie when profile persistence fails", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-xyz" } } });
    mockEq.mockResolvedValue({ error: { message: "permission denied" } });

    const result = await setLocale({ locale: "sq" });

    expect(result.success).toBe(true);
    expect(cookieSet).toHaveBeenCalledWith(
      "NEXT_LOCALE",
      "sq",
      expect.objectContaining({ path: "/" }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("user-xyz"),
      "permission denied",
    );
  });
});
