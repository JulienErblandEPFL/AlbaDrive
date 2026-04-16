// src/lib/test-utils/supabase-mock.ts
import { vi } from "vitest";

export const MOCK_USER = { id: "user-driver-123", email: "driver@test.com" };
export const MOCK_PASSENGER = { id: "user-passenger-456", email: "passenger@test.com" };

/**
 * Builds a Supabase client mock where `single()` is the terminal call.
 * Use `mockSingle` to control what each query returns.
 *
 * For sequences (multiple .from() calls in one action), use:
 *   mockSingle.mockResolvedValueOnce(firstResult)
 *              .mockResolvedValueOnce(secondResult)
 */
export function buildSupabaseMock({
  user = MOCK_USER,
  authError = null,
}: {
  user?: { id: string; email: string } | null;
  authError?: { message: string } | null;
} = {}) {
  const mockSingle = vi.fn();

  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: mockSingle,
  };

  const mockFrom = vi.fn().mockReturnValue(chain);

  const mockClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authError ? null : user },
        error: authError,
      }),
    },
    from: mockFrom,
  };

  return { mockClient, mockSingle, mockFrom, chain };
}
