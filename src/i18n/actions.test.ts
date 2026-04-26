import { describe, it, expect, vi, beforeEach } from "vitest";
import { cookies } from "next/headers";
import type { ActionError } from "@/types/actions";
import { setLocale } from "./actions";

describe("setLocale", () => {
  let cookieSet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    cookieSet = vi.fn();
    vi.mocked(cookies).mockReturnValue({
      getAll: vi.fn(() => []),
      set: cookieSet,
    } as never);
  });

  it.each(["fr", "en", "de", "sq"] as const)(
    "writes the NEXT_LOCALE cookie when locale is %s",
    async (locale) => {
      const result = await setLocale({ locale });

      expect(result.success).toBe(true);
      expect(cookieSet).toHaveBeenCalledWith(
        "NEXT_LOCALE",
        locale,
        expect.objectContaining({ path: "/", sameSite: "lax" }),
      );
    },
  );

  it("rejects with a validation code when the locale is unsupported", async () => {
    const result = await setLocale({ locale: "it" });

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe(
      "validation.locale.invalid",
    );
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("rejects when no locale is provided", async () => {
    const result = await setLocale({});

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe(
      "validation.locale.invalid",
    );
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("rejects when input is not an object", async () => {
    const result = await setLocale("fr");

    expect(result.success).toBe(false);
    expect((result as { error: ActionError }).error.code).toBe(
      "validation.locale.invalid",
    );
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
