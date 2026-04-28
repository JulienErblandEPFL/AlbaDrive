import "@testing-library/jest-dom";

if (process.env.ORS_API_KEY) {
  throw new Error(
    "ORS_API_KEY is set in the test environment. Tests must mock " +
      "globalThis.fetch and never call the real OpenRouteService API. " +
      "Unset ORS_API_KEY before running pnpm test.",
  );
}

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
