# Backend Actions & Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all Server Actions (createTrip, cancelTrip, requestBooking, acceptBooking, cancelBooking, getWhatsAppLink) with Zod validation, standardized ActionResult return type, and co-located Vitest unit tests that mock Supabase.

**Architecture:** Actions live in `app/(main)/{feature}/actions.ts`, co-located with their `actions.test.ts`. All Zod schemas are centralized in `lib/validations/`. A shared `lib/test-utils/supabase-mock.ts` provides a reusable Supabase mock factory so each test file stays concise. The `lib/supabase/server.ts` is the single injection point — mocking it in tests covers all DB interactions.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (`@supabase/ssr`), Zod, Vitest, `@testing-library/react`

---

## File Map

| File | Responsibility |
|---|---|
| `types/actions.ts` | Shared `ActionResult<T>` discriminated union |
| `lib/supabase/server.ts` | Single factory for the server-side Supabase client (session-aware) |
| `lib/supabase/client.ts` | Browser-side Supabase client (for future Client Components) |
| `lib/validations/trip.schema.ts` | Zod schemas: `createTripSchema`, `cancelTripSchema` |
| `lib/validations/booking.schema.ts` | Zod schemas: `requestBookingSchema`, `acceptBookingSchema`, `cancelBookingSchema`, `getWhatsAppLinkSchema` |
| `lib/test-utils/supabase-mock.ts` | Mock factory used by all `.test.ts` files |
| `app/(main)/trips/actions.ts` | `createTrip`, `cancelTrip` |
| `app/(main)/trips/actions.test.ts` | Tests for createTrip, cancelTrip |
| `app/(main)/bookings/actions.ts` | `requestBooking`, `acceptBooking`, `cancelBooking`, `getWhatsAppLink` |
| `app/(main)/bookings/actions.test.ts` | Tests for all booking actions (incl. security tests) |
| `vitest.config.ts` | Vitest root config |
| `vitest.setup.ts` | Global test setup (env vars) |

---

## Task 0: Initialize Next.js project + install dependencies

**Files:**
- Create: `package.json` (via `create-next-app`)
- Create: `tsconfig.json`
- Create: `.env.local`

- [ ] **Step 0.1: Initialize Next.js 14 in the project root**

```bash
cd "/home/julienerbland/Documents/Privé/Projets_persos/AlbaDrive"
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-git \
  --yes
```

Expected output: `✓ Success! Created ... at ...`

- [ ] **Step 0.2: Install project dependencies**

```bash
cd "/home/julienerbland/Documents/Privé/Projets_persos/AlbaDrive"
pnpm add @supabase/ssr @supabase/supabase-js zod date-fns lucide-react react-hook-form
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom @types/node
```

- [ ] **Step 0.3: Create `.env.local` with placeholder values for tests**

```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key
SUPABASE_SERVICE_ROLE_KEY=test-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF
```

- [ ] **Step 0.4: Move existing files into the src structure**

The `types/` and `lib/` directories will live at the **root** (not inside `src/`), matching the tsconfig alias `@/*` → `./src/*`. Move them:

```bash
mkdir -p src/app/\(main\)/trips src/app/\(main\)/bookings src/app/\(auth\)
```

- [ ] **Step 0.5: Commit**

```bash
git init && git add -A && git commit -m "feat: initialize Next.js 14 project with Supabase + Vitest stack"
```

---

## Task 1: Configure Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json` (add test script)

- [ ] **Step 1.1: Write the failing smoke test to confirm Vitest isn't configured yet**

```bash
cd "/home/julienerbland/Documents/Privé/Projets_persos/AlbaDrive"
echo 'import { describe, it, expect } from "vitest"; describe("smoke", () => { it("works", () => { expect(1).toBe(1); }); });' > /tmp/smoke.test.ts
pnpm vitest run /tmp/smoke.test.ts 2>&1 | head -5
```

Expected: error (no config yet)

- [ ] **Step 1.2: Create `vitest.config.ts`**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 1.3: Create `vitest.setup.ts`**

```typescript
// vitest.setup.ts
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
```

- [ ] **Step 1.4: Add test script to `package.json`**

In `package.json`, add under `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 1.5: Run smoke test to verify Vitest is configured**

Create `src/app/(main)/trips/actions.test.ts` temporarily:
```typescript
import { describe, it, expect } from "vitest";
describe("vitest smoke test", () => {
  it("works", () => expect(1 + 1).toBe(2));
});
```

```bash
pnpm test
```

Expected output: `✓ 1 test passed`

- [ ] **Step 1.6: Commit**

```bash
git add vitest.config.ts vitest.setup.ts package.json
git commit -m "feat: configure Vitest with jsdom and Next.js stubs"
```

---

## Task 2: Shared types, Supabase clients, and mock factory

**Files:**
- Create: `src/types/actions.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/test-utils/supabase-mock.ts`
- Move: `types/database.types.ts` → `src/types/database.types.ts`

- [ ] **Step 2.1: Create `src/types/actions.ts`**

```typescript
// src/types/actions.ts
/**
 * Standardized return type for all Server Actions.
 * Actions NEVER throw — they always return this shape.
 */
export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };
```

- [ ] **Step 2.2: Create `src/lib/supabase/server.ts`**

```typescript
// src/lib/supabase/server.ts
import { createServerClient as createClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";

/**
 * Session-aware Supabase client for Server Components and Server Actions.
 * Reads/writes session cookies automatically.
 * NEVER use the service role key here — RLS must remain active.
 */
export function createServerClient() {
  const cookieStore = cookies();

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component (no response to write cookies to).
            // The middleware handles session refresh instead.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 2.3: Create `src/lib/supabase/client.ts`**

```typescript
// src/lib/supabase/client.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

/**
 * Browser-side Supabase client.
 * For use in Client Components only (event handlers, useEffect).
 * Never use this for data fetching — use Server Components instead.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2.4: Create `src/lib/test-utils/supabase-mock.ts`**

This factory is the backbone of all tests. It produces a typed mock that mimics the Supabase query builder chain.

```typescript
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
```

- [ ] **Step 2.5: Move `types/database.types.ts` to `src/types/`**

```bash
mkdir -p src/types
mv types/database.types.ts src/types/database.types.ts
rmdir types
```

- [ ] **Step 2.6: Commit**

```bash
git add src/ && git commit -m "feat: add ActionResult type, Supabase clients, and Vitest mock factory"
```

---

## Task 3: Trip Zod schemas + `createTrip` action + tests

**Files:**
- Create: `src/lib/validations/trip.schema.ts`
- Create: `src/app/(main)/trips/actions.ts`
- Create: `src/app/(main)/trips/actions.test.ts`

- [ ] **Step 3.1: Write the failing tests for `createTrip`**

```typescript
// src/app/(main)/trips/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServerClient } from "@/lib/supabase/server";
import { buildSupabaseMock, MOCK_USER } from "@/lib/test-utils/supabase-mock";
import { createTrip } from "./actions";

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
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);
  });

  it("returns error when user is not authenticated", async () => {
    const { mockClient } = buildSupabaseMock({ user: null, authError: { message: "No session" } });
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);

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
    expect((result as { data: typeof MOCK_TRIP }).data.id).toBe("trip-abc-123");
    expect((result as { data: typeof MOCK_TRIP }).data.available_seats).toBe(3);
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
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
pnpm test src/app/\(main\)/trips/actions.test.ts
```

Expected: FAIL — `createTrip` not found

- [ ] **Step 3.3: Create `src/lib/validations/trip.schema.ts`**

```typescript
// src/lib/validations/trip.schema.ts
import { z } from "zod";

export const locationSchema = z.object({
  label: z.string().min(1, "Location label is required"),
  lat: z.number({ required_error: "Latitude is required" }),
  lng: z.number({ required_error: "Longitude is required" }),
  place_id: z.string().optional(),
});

export const createTripSchema = z.object({
  origin: locationSchema,
  destination: locationSchema,
  departure_at: z
    .string()
    .datetime({ offset: true, message: "Invalid date format" })
    .refine(
      (val) => new Date(val) > new Date(),
      "Departure must be in the future"
    ),
  total_seats: z
    .number()
    .int()
    .min(1, "At least 1 seat required")
    .max(9, "Maximum 9 seats"),
  price_per_seat: z.number().nonnegative().nullable().optional(),
  vehicle_description: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export const cancelTripSchema = z.object({
  trip_id: z.string().uuid("Invalid trip ID"),
});
```

- [ ] **Step 3.4: Create `src/app/(main)/trips/actions.ts` with `createTrip`**

```typescript
// src/app/(main)/trips/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createTripSchema, cancelTripSchema } from "@/lib/validations/trip.schema";
import type { ActionResult } from "@/types/actions";
import type { TripRow } from "@/types/database.types";

export async function createTrip(rawData: unknown): Promise<ActionResult<TripRow>> {
  const supabase = createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = createTripSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  const { data: trip, error: dbError } = await supabase
    .from("trips")
    .insert({
      driver_id: user.id,
      ...parsed.data,
      available_seats: parsed.data.total_seats,
    })
    .select()
    .single();

  if (dbError) {
    console.error("[createTrip]", dbError.message);
    return { success: false, error: "Failed to create trip. Please try again." };
  }

  revalidatePath("/trips");
  return { success: true, data: trip };
}

export async function cancelTrip(rawData: unknown): Promise<ActionResult> {
  // Implemented in Task 4
  return { success: false, error: "Not implemented" };
}
```

- [ ] **Step 3.5: Run tests to verify they pass**

```bash
pnpm test src/app/\(main\)/trips/actions.test.ts
```

Expected: all 6 tests pass

- [ ] **Step 3.6: Commit**

```bash
git add src/lib/validations/trip.schema.ts src/app/\(main\)/trips/
git commit -m "feat: createTrip action with Zod validation and unit tests"
```

---

## Task 4: `cancelTrip` action + tests

**Files:**
- Modify: `src/app/(main)/trips/actions.ts` (implement `cancelTrip`)
- Modify: `src/app/(main)/trips/actions.test.ts` (add cancelTrip tests)

- [ ] **Step 4.1: Add failing tests for `cancelTrip`**

Append to `src/app/(main)/trips/actions.test.ts`:

```typescript
import { cancelTrip } from "./actions";

describe("cancelTrip", () => {
  let mockSingle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { mockClient, mockSingle: single } = buildSupabaseMock();
    mockSingle = single;
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);
  });

  it("returns error when unauthenticated", async () => {
    const { mockClient } = buildSupabaseMock({ user: null, authError: { message: "No session" } });
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);

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
    // First call: get trip for ownership check
    mockSingle.mockResolvedValueOnce({
      data: { driver_id: MOCK_USER.id, status: "open" },
      error: null,
    });
    // Second call: update returns success
    mockSingle.mockResolvedValueOnce({ data: {}, error: null });

    const result = await cancelTrip({ trip_id: "00000000-0000-0000-0000-000000000000" });

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 4.2: Run tests to verify the new ones fail**

```bash
pnpm test src/app/\(main\)/trips/actions.test.ts
```

Expected: 6 pass (createTrip), new cancelTrip tests FAIL

- [ ] **Step 4.3: Implement `cancelTrip` in `src/app/(main)/trips/actions.ts`**

Replace the stub `cancelTrip` with:

```typescript
export async function cancelTrip(rawData: unknown): Promise<ActionResult> {
  const supabase = createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = cancelTripSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  const { data: trip, error: fetchError } = await supabase
    .from("trips")
    .select("driver_id, status")
    .eq("id", parsed.data.trip_id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !trip) {
    return { success: false, error: "Trip not found." };
  }
  if (trip.driver_id !== user.id) {
    return { success: false, error: "Unauthorized." };
  }
  if (trip.status === "cancelled" || trip.status === "completed") {
    return { success: false, error: `Trip is already ${trip.status}.` };
  }

  // The DB trigger on_trip_cancelled will cascade bookings to 'trip_cancelled'
  const { error: updateError } = await supabase
    .from("trips")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.trip_id)
    .single();

  if (updateError) {
    console.error("[cancelTrip]", updateError.message);
    return { success: false, error: "Failed to cancel trip. Please try again." };
  }

  revalidatePath("/trips");
  return { success: true };
}
```

- [ ] **Step 4.4: Run full trip test suite**

```bash
pnpm test src/app/\(main\)/trips/actions.test.ts
```

Expected: all tests pass

- [ ] **Step 4.5: Commit**

```bash
git add src/app/\(main\)/trips/
git commit -m "feat: cancelTrip action with ownership check and cascade via DB trigger"
```

---

## Task 5: Booking schemas + `requestBooking` action + tests

**Files:**
- Create: `src/lib/validations/booking.schema.ts`
- Create: `src/app/(main)/bookings/actions.ts`
- Create: `src/app/(main)/bookings/actions.test.ts`

- [ ] **Step 5.1: Create `src/lib/validations/booking.schema.ts`**

```typescript
// src/lib/validations/booking.schema.ts
import { z } from "zod";

export const requestBookingSchema = z.object({
  trip_id: z.string().uuid("Invalid trip ID"),
  seats_requested: z.number().int().min(1).max(9),
  passenger_message: z.string().max(500).optional(),
});

export const acceptBookingSchema = z.object({
  booking_id: z.string().uuid("Invalid booking ID"),
});

export const cancelBookingSchema = z.object({
  booking_id: z.string().uuid("Invalid booking ID"),
});

export const getWhatsAppLinkSchema = z.object({
  booking_id: z.string().uuid("Invalid booking ID"),
});
```

- [ ] **Step 5.2: Write failing tests for `requestBooking`**

```typescript
// src/app/(main)/bookings/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServerClient } from "@/lib/supabase/server";
import { buildSupabaseMock, MOCK_USER, MOCK_PASSENGER } from "@/lib/test-utils/supabase-mock";
import { requestBooking } from "./actions";

vi.mock("@/lib/supabase/server");

const VALID_REQUEST_INPUT = {
  trip_id: "00000000-0000-0000-0000-000000000001",
  seats_requested: 1,
  passenger_message: "Bonjour, je voyage seul.",
};

const MOCK_BOOKING = {
  id: "booking-xyz-789",
  trip_id: VALID_REQUEST_INPUT.trip_id,
  passenger_id: MOCK_PASSENGER.id,
  seats_requested: 1,
  status: "pending",
  passenger_message: "Bonjour, je voyage seul.",
  deleted_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("requestBooking", () => {
  let mockSingle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { mockClient, mockSingle: single } = buildSupabaseMock({ user: MOCK_PASSENGER });
    mockSingle = single;
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);
  });

  it("returns error when unauthenticated", async () => {
    const { mockClient } = buildSupabaseMock({ user: null, authError: { message: "No session" } });
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Authentication required.");
  });

  it("returns error when passenger has no phone in profile", async () => {
    // First call: profile lookup returns no phone
    mockSingle.mockResolvedValueOnce({ data: { phone: null }, error: null });

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("phone number");
  });

  it("returns error when trip does not exist", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { phone: "+41791234567" }, error: null }) // profile
      .mockResolvedValueOnce({ data: null, error: { message: "Not found" } }); // trip

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Trip not found.");
  });

  it("returns error when passenger tries to book their own trip", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { phone: "+41791234567" }, error: null })
      .mockResolvedValueOnce({
        data: { driver_id: MOCK_PASSENGER.id, available_seats: 3, status: "open" },
        error: null,
      });

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("You cannot book your own trip.");
  });

  it("returns error when trip is full", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { phone: "+41791234567" }, error: null })
      .mockResolvedValueOnce({
        data: { driver_id: MOCK_USER.id, available_seats: 0, status: "full" },
        error: null,
      });

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("no longer accepting");
  });

  it("returns error when not enough seats for seats_requested", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { phone: "+41791234567" }, error: null })
      .mockResolvedValueOnce({
        data: { driver_id: MOCK_USER.id, available_seats: 1, status: "open" },
        error: null,
      });

    const result = await requestBooking({ ...VALID_REQUEST_INPUT, seats_requested: 2 });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("seat(s) available");
  });

  it("creates booking and returns it on valid input", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { phone: "+41791234567" }, error: null })
      .mockResolvedValueOnce({
        data: { driver_id: MOCK_USER.id, available_seats: 3, status: "open" },
        error: null,
      })
      .mockResolvedValueOnce({ data: MOCK_BOOKING, error: null });

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(true);
    expect((result as { data: typeof MOCK_BOOKING }).data.status).toBe("pending");
  });

  it("returns specific error when passenger already has an active booking", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { phone: "+41791234567" }, error: null })
      .mockResolvedValueOnce({
        data: { driver_id: MOCK_USER.id, available_seats: 3, status: "open" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "23505", message: "unique constraint violation" },
      });

    const result = await requestBooking(VALID_REQUEST_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("already have an active booking");
  });
});
```

- [ ] **Step 5.3: Run tests to verify they fail**

```bash
pnpm test src/app/\(main\)/bookings/actions.test.ts
```

Expected: FAIL — `requestBooking` not found

- [ ] **Step 5.4: Create `src/app/(main)/bookings/actions.ts` with `requestBooking`**

```typescript
// src/app/(main)/bookings/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import {
  requestBookingSchema,
  acceptBookingSchema,
  cancelBookingSchema,
  getWhatsAppLinkSchema,
} from "@/lib/validations/booking.schema";
import type { ActionResult } from "@/types/actions";
import type { BookingRow } from "@/types/database.types";

export async function requestBooking(rawData: unknown): Promise<ActionResult<BookingRow>> {
  const supabase = createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  // Verify the passenger has a phone number — required for WhatsApp after acceptance
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single();

  if (!profile?.phone) {
    return {
      success: false,
      error: "Please complete your profile with a phone number before requesting a booking.",
    };
  }

  const parsed = requestBookingSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("driver_id, available_seats, status")
    .eq("id", parsed.data.trip_id)
    .is("deleted_at", null)
    .single();

  if (tripError || !trip) {
    return { success: false, error: "Trip not found." };
  }
  if (trip.driver_id === user.id) {
    return { success: false, error: "You cannot book your own trip." };
  }
  if (trip.status !== "open") {
    return { success: false, error: "This trip is no longer accepting bookings." };
  }
  if (trip.available_seats < parsed.data.seats_requested) {
    return { success: false, error: `Only ${trip.available_seats} seat(s) available.` };
  }

  const { data: booking, error: dbError } = await supabase
    .from("bookings")
    .insert({
      trip_id: parsed.data.trip_id,
      passenger_id: user.id,
      seats_requested: parsed.data.seats_requested,
      passenger_message: parsed.data.passenger_message ?? null,
    })
    .select()
    .single();

  if (dbError) {
    if (dbError.code === "23505") {
      return { success: false, error: "You already have an active booking for this trip." };
    }
    console.error("[requestBooking]", dbError.message);
    return { success: false, error: "Failed to request booking. Please try again." };
  }

  revalidatePath("/bookings");
  return { success: true, data: booking };
}

// Stubs for Tasks 6, 7, 8
export async function acceptBooking(rawData: unknown): Promise<ActionResult<BookingRow>> {
  return { success: false, error: "Not implemented" };
}

export async function cancelBooking(rawData: unknown): Promise<ActionResult> {
  return { success: false, error: "Not implemented" };
}

export async function getWhatsAppLink(rawData: unknown): Promise<ActionResult<{
  role: "driver" | "passenger";
  other_party_name: string;
  link_to_contact: string;
}>> {
  return { success: false, error: "Not implemented" };
}
```

- [ ] **Step 5.5: Run tests**

```bash
pnpm test src/app/\(main\)/bookings/actions.test.ts
```

Expected: all 8 requestBooking tests pass

- [ ] **Step 5.6: Commit**

```bash
git add src/lib/validations/booking.schema.ts src/app/\(main\)/bookings/
git commit -m "feat: requestBooking action with profile phone check and Vitest tests"
```

---

## Task 6: `acceptBooking` action + tests

**Files:**
- Modify: `src/app/(main)/bookings/actions.ts`
- Modify: `src/app/(main)/bookings/actions.test.ts`

- [ ] **Step 6.1: Add failing tests for `acceptBooking`**

Append to `src/app/(main)/bookings/actions.test.ts`:

```typescript
import { acceptBooking } from "./actions";

const VALID_ACCEPT_INPUT = { booking_id: "00000000-0000-0000-0000-000000000099" };

describe("acceptBooking", () => {
  let mockSingle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // acceptBooking is called by the DRIVER
    const { mockClient, mockSingle: single } = buildSupabaseMock({ user: MOCK_USER });
    mockSingle = single;
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);
  });

  it("returns error when unauthenticated", async () => {
    const { mockClient } = buildSupabaseMock({ user: null, authError: { message: "No session" } });
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);

    const result = await acceptBooking(VALID_ACCEPT_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Authentication required.");
  });

  it("returns error when booking is not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "Not found" } });

    const result = await acceptBooking(VALID_ACCEPT_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Booking not found.");
  });

  it("returns Unauthorized when caller is not the trip driver", async () => {
    mockSingle.mockResolvedValue({
      data: {
        status: "pending",
        passenger_id: MOCK_PASSENGER.id,
        seats_requested: 1,
        trip: { driver_id: "another-driver-id", status: "open", available_seats: 3 },
      },
      error: null,
    });

    const result = await acceptBooking(VALID_ACCEPT_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Unauthorized.");
  });

  it("returns error when booking is not in pending status", async () => {
    mockSingle.mockResolvedValue({
      data: {
        status: "accepted",
        passenger_id: MOCK_PASSENGER.id,
        seats_requested: 1,
        trip: { driver_id: MOCK_USER.id, status: "open", available_seats: 2 },
      },
      error: null,
    });

    const result = await acceptBooking(VALID_ACCEPT_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Only pending bookings can be accepted.");
  });

  it("returns error when not enough seats", async () => {
    mockSingle.mockResolvedValue({
      data: {
        status: "pending",
        passenger_id: MOCK_PASSENGER.id,
        seats_requested: 3,
        trip: { driver_id: MOCK_USER.id, status: "open", available_seats: 2 },
      },
      error: null,
    });

    const result = await acceptBooking(VALID_ACCEPT_INPUT);

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Not enough seats available.");
  });

  it("accepts a valid pending booking", async () => {
    const updatedBooking = {
      id: VALID_ACCEPT_INPUT.booking_id,
      status: "accepted",
      passenger_id: MOCK_PASSENGER.id,
      seats_requested: 1,
    };

    mockSingle
      .mockResolvedValueOnce({
        data: {
          status: "pending",
          passenger_id: MOCK_PASSENGER.id,
          seats_requested: 1,
          trip: { driver_id: MOCK_USER.id, status: "open", available_seats: 3 },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: updatedBooking, error: null });

    const result = await acceptBooking(VALID_ACCEPT_INPUT);

    expect(result.success).toBe(true);
    expect((result as { data: typeof updatedBooking }).data.status).toBe("accepted");
  });
});
```

- [ ] **Step 6.2: Run to verify new tests fail**

```bash
pnpm test src/app/\(main\)/bookings/actions.test.ts
```

Expected: 8 pass, 6 new acceptBooking tests FAIL

- [ ] **Step 6.3: Implement `acceptBooking` in `src/app/(main)/bookings/actions.ts`**

Replace the stub:

```typescript
export async function acceptBooking(rawData: unknown): Promise<ActionResult<BookingRow>> {
  const supabase = createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = acceptBookingSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("status, passenger_id, seats_requested, trip:trips(driver_id, status, available_seats)")
    .eq("id", parsed.data.booking_id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !booking) {
    return { success: false, error: "Booking not found." };
  }
  if ((booking.trip as { driver_id: string }).driver_id !== user.id) {
    return { success: false, error: "Unauthorized." };
  }
  if (booking.status !== "pending") {
    return { success: false, error: "Only pending bookings can be accepted." };
  }
  if ((booking.trip as { available_seats: number }).available_seats < booking.seats_requested) {
    return { success: false, error: "Not enough seats available." };
  }

  // The DB trigger handle_booking_accepted will atomically:
  // 1. Decrement available_seats on the trip
  // 2. Set trip to 'full' if seats reach 0
  // 3. Auto-decline remaining pending bookings
  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({ status: "accepted" })
    .eq("id", parsed.data.booking_id)
    .select()
    .single();

  if (updateError) {
    console.error("[acceptBooking]", updateError.message);
    return { success: false, error: "Failed to accept booking. Please try again." };
  }

  revalidatePath("/bookings");
  return { success: true, data: updated };
}
```

- [ ] **Step 6.4: Run all booking tests**

```bash
pnpm test src/app/\(main\)/bookings/actions.test.ts
```

Expected: all 14 tests pass

- [ ] **Step 6.5: Commit**

```bash
git add src/app/\(main\)/bookings/
git commit -m "feat: acceptBooking action with driver ownership check"
```

---

## Task 7: `cancelBooking` action + tests

**Files:**
- Modify: `src/app/(main)/bookings/actions.ts`
- Modify: `src/app/(main)/bookings/actions.test.ts`

- [ ] **Step 7.1: Add failing tests for `cancelBooking`**

Append to `src/app/(main)/bookings/actions.test.ts`:

```typescript
import { cancelBooking } from "./actions";

describe("cancelBooking", () => {
  let mockSingle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // cancelBooking is called by the PASSENGER
    const { mockClient, mockSingle: single } = buildSupabaseMock({ user: MOCK_PASSENGER });
    mockSingle = single;
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);
  });

  it("returns error when unauthenticated", async () => {
    const { mockClient } = buildSupabaseMock({ user: null, authError: { message: "No session" } });
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);

    const result = await cancelBooking({ booking_id: "00000000-0000-0000-0000-000000000099" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Authentication required.");
  });

  it("returns error when booking is not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "Not found" } });

    const result = await cancelBooking({ booking_id: "00000000-0000-0000-0000-000000000099" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Booking not found.");
  });

  it("returns Unauthorized when caller is not the passenger", async () => {
    mockSingle.mockResolvedValue({
      data: { passenger_id: "another-passenger-id", status: "pending" },
      error: null,
    });

    const result = await cancelBooking({ booking_id: "00000000-0000-0000-0000-000000000099" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Unauthorized.");
  });

  it("returns error when booking is in a non-cancellable status", async () => {
    mockSingle.mockResolvedValue({
      data: { passenger_id: MOCK_PASSENGER.id, status: "trip_cancelled" },
      error: null,
    });

    const result = await cancelBooking({ booking_id: "00000000-0000-0000-0000-000000000099" });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("This booking cannot be cancelled.");
  });

  it("cancels a pending booking", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { passenger_id: MOCK_PASSENGER.id, status: "pending" }, error: null })
      .mockResolvedValueOnce({ data: {}, error: null });

    const result = await cancelBooking({ booking_id: "00000000-0000-0000-0000-000000000099" });

    expect(result.success).toBe(true);
  });

  it("cancels an accepted booking (returns seats via DB trigger)", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { passenger_id: MOCK_PASSENGER.id, status: "accepted" }, error: null })
      .mockResolvedValueOnce({ data: {}, error: null });

    const result = await cancelBooking({ booking_id: "00000000-0000-0000-0000-000000000099" });

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 7.2: Run to verify new tests fail**

```bash
pnpm test src/app/\(main\)/bookings/actions.test.ts
```

Expected: 14 pass, 6 cancelBooking tests FAIL

- [ ] **Step 7.3: Implement `cancelBooking` in `src/app/(main)/bookings/actions.ts`**

```typescript
export async function cancelBooking(rawData: unknown): Promise<ActionResult> {
  const supabase = createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = cancelBookingSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("passenger_id, status")
    .eq("id", parsed.data.booking_id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !booking) {
    return { success: false, error: "Booking not found." };
  }
  if (booking.passenger_id !== user.id) {
    return { success: false, error: "Unauthorized." };
  }
  if (!["pending", "accepted"].includes(booking.status)) {
    return { success: false, error: "This booking cannot be cancelled." };
  }

  // If booking was 'accepted', the DB trigger handle_booking_seat_return
  // will automatically return the seats to the trip
  const { error: updateError } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.booking_id)
    .single();

  if (updateError) {
    console.error("[cancelBooking]", updateError.message);
    return { success: false, error: "Failed to cancel booking. Please try again." };
  }

  revalidatePath("/bookings");
  return { success: true };
}
```

- [ ] **Step 7.4: Run all booking tests**

```bash
pnpm test src/app/\(main\)/bookings/actions.test.ts
```

Expected: all 20 tests pass

- [ ] **Step 7.5: Commit**

```bash
git add src/app/\(main\)/bookings/
git commit -m "feat: cancelBooking action — passengers can cancel pending or accepted bookings"
```

---

## Task 8: `getWhatsAppLink` action + security tests

This is the most security-critical action. Tests specifically probe unauthorized access paths.

**Files:**
- Modify: `src/app/(main)/bookings/actions.ts`
- Modify: `src/app/(main)/bookings/actions.test.ts`

- [ ] **Step 8.1: Add failing security tests for `getWhatsAppLink`**

Append to `src/app/(main)/bookings/actions.test.ts`:

```typescript
import { getWhatsAppLink } from "./actions";

const BOOKING_ID = "00000000-0000-0000-0000-000000000099";

describe("getWhatsAppLink — security", () => {
  let mockSingle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const { mockClient, mockSingle: single } = buildSupabaseMock({ user: MOCK_PASSENGER });
    mockSingle = single;
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);
  });

  it("returns error when unauthenticated", async () => {
    const { mockClient } = buildSupabaseMock({ user: null, authError: { message: "No session" } });
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);

    const result = await getWhatsAppLink({ booking_id: BOOKING_ID });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Authentication required.");
  });

  it("🔒 returns error when booking status is 'pending' — not yet accepted", async () => {
    mockSingle.mockResolvedValue({
      data: {
        status: "pending",        // NOT accepted
        passenger_id: MOCK_PASSENGER.id,
        trip: { driver_id: MOCK_USER.id },
      },
      error: null,
    });

    const result = await getWhatsAppLink({ booking_id: BOOKING_ID });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe(
      "WhatsApp link is only available for accepted bookings."
    );
  });

  it("🔒 returns error when caller is neither the driver nor the passenger", async () => {
    const { mockClient, mockSingle: single } = buildSupabaseMock({
      user: { id: "random-user-000", email: "hacker@evil.com" },
    });
    mockSingle = single;
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);

    mockSingle.mockResolvedValue({
      data: {
        status: "accepted",
        passenger_id: MOCK_PASSENGER.id,
        trip: { driver_id: MOCK_USER.id },
      },
      error: null,
    });

    const result = await getWhatsAppLink({ booking_id: BOOKING_ID });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe("Unauthorized.");
  });

  it("🔒 returns error when booking is 'declined' (not accepted)", async () => {
    mockSingle.mockResolvedValue({
      data: {
        status: "declined",
        passenger_id: MOCK_PASSENGER.id,
        trip: { driver_id: MOCK_USER.id },
      },
      error: null,
    });

    const result = await getWhatsAppLink({ booking_id: BOOKING_ID });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe(
      "WhatsApp link is only available for accepted bookings."
    );
  });

  it("returns passenger link (to contact driver) when called as passenger", async () => {
    // 1st call: booking check
    mockSingle.mockResolvedValueOnce({
      data: {
        status: "accepted",
        passenger_id: MOCK_PASSENGER.id,
        trip: { driver_id: MOCK_USER.id },
      },
      error: null,
    });
    // 2nd call: driver profile (RLS allows because booking is accepted)
    mockSingle.mockResolvedValueOnce({
      data: { id: MOCK_USER.id, full_name: "Artan Doci", phone: "+41791234567" },
      error: null,
    });
    // 3rd call: passenger's own profile
    mockSingle.mockResolvedValueOnce({
      data: { id: MOCK_PASSENGER.id, full_name: "Blerina Kelmendi", phone: "+49151234567" },
      error: null,
    });

    const result = await getWhatsAppLink({ booking_id: BOOKING_ID });

    expect(result.success).toBe(true);
    const data = (result as { data: { role: string; link_to_contact: string; other_party_name: string } }).data;
    expect(data.role).toBe("passenger");
    expect(data.link_to_contact).toMatch(/wa\.me\/41791234567/);
    expect(data.other_party_name).toBe("Artan Doci");
    // Verify the link does NOT contain the passenger's own number
    expect(data.link_to_contact).not.toMatch(/49151234567/);
  });

  it("returns driver link (to contact passenger) when called as driver", async () => {
    // Called as driver
    const { mockClient, mockSingle: single } = buildSupabaseMock({ user: MOCK_USER });
    mockSingle = single;
    vi.mocked(createServerClient).mockReturnValue(mockClient as any);

    mockSingle.mockResolvedValueOnce({
      data: {
        status: "accepted",
        passenger_id: MOCK_PASSENGER.id,
        trip: { driver_id: MOCK_USER.id },
      },
      error: null,
    });
    // Passenger profile (unlocked by RLS because booking is accepted)
    mockSingle.mockResolvedValueOnce({
      data: { id: MOCK_PASSENGER.id, full_name: "Blerina Kelmendi", phone: "+49151234567" },
      error: null,
    });
    // Driver's own profile
    mockSingle.mockResolvedValueOnce({
      data: { id: MOCK_USER.id, full_name: "Artan Doci", phone: "+41791234567" },
      error: null,
    });

    const result = await getWhatsAppLink({ booking_id: BOOKING_ID });

    expect(result.success).toBe(true);
    const data = (result as { data: { role: string; link_to_contact: string; other_party_name: string } }).data;
    expect(data.role).toBe("driver");
    expect(data.link_to_contact).toMatch(/wa\.me\/49151234567/);
    expect(data.other_party_name).toBe("Blerina Kelmendi");
  });
});
```

- [ ] **Step 8.2: Run to verify security tests fail**

```bash
pnpm test src/app/\(main\)/bookings/actions.test.ts
```

Expected: 20 pass, 6 getWhatsAppLink tests FAIL

- [ ] **Step 8.3: Implement `getWhatsAppLink` in `src/app/(main)/bookings/actions.ts`**

```typescript
interface WhatsAppResult {
  role: "driver" | "passenger";
  other_party_name: string;
  /** The wa.me link the current user should use to initiate contact */
  link_to_contact: string;
}

export async function getWhatsAppLink(rawData: unknown): Promise<ActionResult<WhatsAppResult>> {
  const supabase = createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentication required." };
  }

  const parsed = getWhatsAppLinkSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  // Step 1: Verify booking status and that caller is a party to the booking
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("status, passenger_id, trip:trips(driver_id)")
    .eq("id", parsed.data.booking_id)
    .is("deleted_at", null)
    .single();

  if (bookingError || !booking) {
    return { success: false, error: "Booking not found." };
  }

  const driverId = (booking.trip as { driver_id: string }).driver_id;
  const isDriver = driverId === user.id;
  const isPassenger = booking.passenger_id === user.id;

  if (!isDriver && !isPassenger) {
    return { success: false, error: "Unauthorized." };
  }

  // CRITICAL: double-verify status server-side before exposing any phone number
  if (booking.status !== "accepted") {
    return {
      success: false,
      error: "WhatsApp link is only available for accepted bookings.",
    };
  }

  // Step 2: Fetch the other party's profile.
  // The RLS policy `profiles_select_accepted_booking_party` gates access to
  // the `phone` column — it will return null if booking is not accepted.
  const otherPartyId = isDriver ? booking.passenger_id : driverId;

  const { data: otherParty, error: otherPartyError } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .eq("id", otherPartyId)
    .is("deleted_at", null)
    .single();

  if (otherPartyError || !otherParty?.phone) {
    return { success: false, error: "Contact information unavailable." };
  }

  // Step 3: Fetch own profile (to confirm we have a phone too — good practice)
  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single();

  if (!ownProfile?.phone) {
    return { success: false, error: "Your profile is missing a phone number." };
  }

  // Build the wa.me link for the OTHER party
  // Passenger is encouraged to initiate — both get a link but message differs
  const otherPhone = otherParty.phone.replace(/\D/g, "");
  const message = isPassenger
    ? encodeURIComponent("Salam! Rezervova një vend në udhëtimin tuaj. A mund të komunikojmë?")
    : encodeURIComponent("Salam! Jam shoferi i udhëtimit. Rezervimi juaj është konfirmuar.");

  return {
    success: true,
    data: {
      role: isDriver ? "driver" : "passenger",
      other_party_name: otherParty.full_name,
      link_to_contact: `https://wa.me/${otherPhone}?text=${message}`,
    },
  };
}
```

- [ ] **Step 8.4: Run the full booking test suite**

```bash
pnpm test src/app/\(main\)/bookings/actions.test.ts
```

Expected: all 26 tests pass (8 requestBooking + 6 acceptBooking + 6 cancelBooking + 6 getWhatsAppLink)

- [ ] **Step 8.5: Commit**

```bash
git add src/app/\(main\)/bookings/
git commit -m "feat: getWhatsAppLink action with double-checked security and bidirectional wa.me links"
```

---

## Task 9: Full test suite run + final verification

- [ ] **Step 9.1: Run the complete test suite**

```bash
cd "/home/julienerbland/Documents/Privé/Projets_persos/AlbaDrive"
pnpm test
```

Expected output (all green):
```
✓ src/app/(main)/trips/actions.test.ts        (12 tests)
✓ src/app/(main)/bookings/actions.test.ts     (26 tests)
─────────────────────────────────────────
Test Files  2 passed (2)
Tests       38 passed (38)
```

- [ ] **Step 9.2: Run TypeScript type check**

```bash
pnpm typecheck
```

Expected: 0 errors

- [ ] **Step 9.3: Final commit**

```bash
git add -A
git commit -m "test: full backend test suite passing — 38 tests covering all Server Actions"
```

---

## Self-Review: Spec Coverage

| Requirement | Covered by |
|---|---|
| `createTrip` with date/seats/location validation | Task 3 |
| `requestBooking` with phone check | Task 5 |
| `acceptBooking` with driver ownership check | Task 6 |
| `cancelTrip` / `cancelBooking` | Tasks 4, 7 |
| `getWhatsAppLink` — only on accepted, both parties | Task 8 |
| `{ success, data?, error? }` on ALL actions | Tasks 3–8 (enforced via ActionResult type) |
| E.164 enforced via Zod | Task 5 (schema) — validated on profile before requestBooking |
| Security: WhatsApp link on non-accepted booking → error | Task 8 Step 8.1 (4 security tests) |
| Security: unauthorized caller → error | Tasks 4, 6, 7, 8 |
| Vitest configured | Task 1 |
| Supabase mock (no real DB in tests) | Task 2 (mock factory used throughout) |
