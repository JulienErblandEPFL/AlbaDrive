import "@testing-library/jest-dom";

// Stub Next.js server-only APIs used inside Server Actions
// (next/cache and next/headers are not available in Vitest's jsdom environment)
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}));
