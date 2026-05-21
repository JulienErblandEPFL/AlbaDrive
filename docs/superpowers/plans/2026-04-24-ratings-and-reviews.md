# Ratings & Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the bidirectional user-to-user review system described in `docs/superpowers/specs/2026-04-24-ratings-and-reviews-design.md`. After a trip is `completed`, a driver can review each passenger who had an accepted booking, and each such passenger can review the driver. Public trip pages display the driver's aggregate rating; a passenger's rating is only visible to a driver on whose trip that passenger has requested a seat.

**Architecture:** One new `reviews` table with asymmetric RLS. Driver aggregate is exposed publicly through an extended `profiles_public` view (subquery, no triggers). Passenger aggregate is exposed only via a `SECURITY DEFINER` RPC gated on booking relationship. Review eligibility is centralised in one SQL function `can_review_reason(...)` used by both the RLS `WITH CHECK` and the Server Action for user-readable errors. Reviewer display names are pseudonymised (`"Jean D."`) in the Node Server Action layer, never in Client Components.

**Tech Stack:** Supabase Postgres + RLS, Next.js 16 App Router (Server Components + Server Actions), TypeScript strict, Tailwind CSS 4, `react-hook-form` + `zod`, `vitest` + `@testing-library/react`, `lucide-react` for icons.

---

## File Structure

| File | Role | Status |
|---|---|---|
| `supabase/migrations/20260424120000_create_reviews.sql` | Table, indexes, helper RPCs, view rewrite, RLS | **create** |
| `src/types/database.types.ts` | Append `ReviewRow` narrowing; regenerated base block | **modify** |
| `src/lib/validations/review.schema.ts` | `submitReviewSchema` (zod) | **create** |
| `src/lib/reviews/display-name.ts` | `pseudonymizeName(fullName)` | **create** |
| `src/lib/reviews/display-name.test.ts` | Vitest unit tests for pseudonymisation | **create** |
| `src/app/(main)/reviews/actions.ts` | `submitReview`, `getPassengerReviewSummary`, `getDriverReviewDetails` | **create** |
| `src/app/(main)/reviews/actions.test.ts` | Vitest suite for the three actions | **create** |
| `src/components/ui/StarRating.tsx` | Display + interactive star rating component | **create** |
| `src/app/(main)/reviews/ReviewModal.tsx` | Client modal opened from dashboard CTAs | **create** |
| `src/app/(main)/trips/components/TripCard.tsx` | Add driver aggregate next to name | **modify** |
| `src/app/(main)/trips/page.tsx` | Extend `profiles_public` select list | **modify** |
| `src/app/(main)/trips/[id]/page.tsx` | Add driver aggregate to detail driver block | **modify** |
| `src/app/(main)/dashboard/page.tsx` | Fetch review summaries/details in parallel | **modify** |
| `src/app/(main)/dashboard/DriverTripCard.tsx` | Passenger aggregate + "Laisser un avis" CTA | **modify** |
| `src/app/(main)/dashboard/PassengerBookingCard.tsx` | Driver details + "Laisser un avis" CTA | **modify** |
| `project.md` | Document reviews in data model + current state | **modify** |

Each task produces a self-contained commit. Tasks 1–7 are back-end + testable units (database, types, schema, actions). Tasks 8–12 are UI. Task 13 is documentation.

---

## Task 1: SQL migration

**Files:**
- Create: `supabase/migrations/20260424120000_create_reviews.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260424120000_create_reviews.sql` with the following content:

```sql
-- ============================================================
-- MIGRATION 004: reviews
--
-- Bidirectional user-to-user review system tied to COMPLETED trips.
-- See docs/superpowers/specs/2026-04-24-ratings-and-reviews-design.md
--
-- Role of the reviewee on the trip is DERIVED at query time from
-- trips.driver_id, never stored. A review row whose reviewee_id
-- matches trips.driver_id is "about the driver"; otherwise
-- "about a passenger".
-- ============================================================

-- ============================================================
-- TABLE: reviews
-- ============================================================
CREATE TABLE public.reviews (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID        NOT NULL REFERENCES public.trips(id)    ON DELETE CASCADE,
  reviewer_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewee_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating       SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT        CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One review per (reviewer, reviewee, trip) — allows A→B and B→A on the same trip
  UNIQUE (reviewer_id, reviewee_id, trip_id),
  CHECK (reviewer_id <> reviewee_id)
);

-- Aggregation-path index: "all reviews ABOUT a given user"
CREATE INDEX reviews_reviewee_idx ON public.reviews (reviewee_id);

-- Join-path index: "all reviews FOR a given trip"
CREATE INDEX reviews_trip_idx ON public.reviews (trip_id);

-- ============================================================
-- ELIGIBILITY: can_review_reason
-- Returns 'OK' when the current user (auth.uid()) is allowed to
-- insert a review of p_reviewee_id for p_trip_id. Otherwise
-- returns an error code that the Server Action maps to a
-- French user-facing message.
--
-- Codes:
--   NOT_AUTHENTICATED   – no auth.uid()
--   SELF_REVIEW         – reviewer == reviewee
--   TRIP_NOT_FOUND      – trip missing or soft-deleted
--   TRIP_NOT_COMPLETED  – trip.status <> 'completed'
--   NOT_PARTICIPANTS    – (reviewer, reviewee) don't share the
--                          required driver/accepted-passenger
--                          relationship on that trip
--   WINDOW_EXPIRED      – more than 30 days since departure_at
--   DUPLICATE           – a review from this reviewer to this
--                          reviewee on this trip already exists
--   OK                  – allowed
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_review_reason(
  p_reviewee_id UUID,
  p_trip_id     UUID
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_driver_id   UUID;
  v_status      TEXT;
  v_departure   TIMESTAMPTZ;
  v_deleted     TIMESTAMPTZ;
  v_has_booking BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'NOT_AUTHENTICATED';
  END IF;

  IF v_uid = p_reviewee_id THEN
    RETURN 'SELF_REVIEW';
  END IF;

  SELECT driver_id, status, departure_at, deleted_at
    INTO v_driver_id, v_status, v_departure, v_deleted
  FROM public.trips
  WHERE id = p_trip_id;

  IF v_driver_id IS NULL OR v_deleted IS NOT NULL THEN
    RETURN 'TRIP_NOT_FOUND';
  END IF;

  IF v_status <> 'completed' THEN
    RETURN 'TRIP_NOT_COMPLETED';
  END IF;

  IF NOW() - v_departure > INTERVAL '30 days' THEN
    RETURN 'WINDOW_EXPIRED';
  END IF;

  -- Relationship check: exactly one of these must hold.
  IF v_uid = v_driver_id THEN
    -- Reviewer is the driver; reviewee must have an accepted booking on this trip
    SELECT EXISTS (
      SELECT 1 FROM public.bookings
      WHERE trip_id       = p_trip_id
        AND passenger_id  = p_reviewee_id
        AND status        = 'accepted'
        AND deleted_at    IS NULL
    ) INTO v_has_booking;
  ELSIF p_reviewee_id = v_driver_id THEN
    -- Reviewer is a passenger; they must have an accepted booking, reviewee is the driver
    SELECT EXISTS (
      SELECT 1 FROM public.bookings
      WHERE trip_id       = p_trip_id
        AND passenger_id  = v_uid
        AND status        = 'accepted'
        AND deleted_at    IS NULL
    ) INTO v_has_booking;
  ELSE
    -- Neither reviewer nor reviewee is the driver → not a valid pairing
    v_has_booking := FALSE;
  END IF;

  IF NOT v_has_booking THEN
    RETURN 'NOT_PARTICIPANTS';
  END IF;

  -- Duplicate check (same directional review already submitted)
  IF EXISTS (
    SELECT 1 FROM public.reviews
    WHERE reviewer_id = v_uid
      AND reviewee_id = p_reviewee_id
      AND trip_id     = p_trip_id
  ) THEN
    RETURN 'DUPLICATE';
  END IF;

  RETURN 'OK';
END;
$$;

-- Boolean convenience wrapper — used by the INSERT RLS policy
CREATE OR REPLACE FUNCTION public.can_review(
  p_reviewee_id UUID,
  p_trip_id     UUID
)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.can_review_reason(p_reviewee_id, p_trip_id) = 'OK';
$$;

-- ============================================================
-- VISIBILITY: has_booking_on_my_trip
-- True if auth.uid() is the driver on any trip where
-- p_passenger_id has a pending or accepted booking.
-- Gates `get_passenger_review_summary`.
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_booking_on_my_trip(p_passenger_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    INNER JOIN public.trips t ON t.id = b.trip_id
    WHERE t.driver_id    = auth.uid()
      AND b.passenger_id = p_passenger_id
      AND b.status       IN ('pending', 'accepted')
      AND b.deleted_at   IS NULL
      AND t.deleted_at   IS NULL
  );
$$;

-- ============================================================
-- REPLACE VIEW: profiles_public
-- Add driver aggregate columns (public because every trip listing
-- already surfaces the driver's full_name publicly).
-- Passenger aggregate is NOT exposed here — it's gated behind
-- `get_passenger_review_summary`.
-- ============================================================
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public AS
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    (
      SELECT COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0)
      FROM public.reviews r
      INNER JOIN public.trips t ON t.id = r.trip_id
      WHERE r.reviewee_id = p.id
        AND t.driver_id   = p.id
    ) AS driver_rating_avg,
    (
      SELECT COUNT(*)
      FROM public.reviews r
      INNER JOIN public.trips t ON t.id = r.trip_id
      WHERE r.reviewee_id = p.id
        AND t.driver_id   = p.id
    ) AS driver_rating_count
  FROM public.profiles p
  WHERE p.deleted_at IS NULL;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- ============================================================
-- RPC: get_passenger_review_summary
-- Returns aggregate + up to 3 most-recent non-empty comments
-- about p_passenger_id AS A PASSENGER (reviewee != trip.driver_id).
-- Returns NULL if caller lacks the booking relationship.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_passenger_review_summary(p_passenger_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_avg    NUMERIC;
  v_count  BIGINT;
  v_recent JSONB;
BEGIN
  IF NOT public.has_booking_on_my_trip(p_passenger_id) THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0),
    COUNT(*)
  INTO v_avg, v_count
  FROM public.reviews r
  INNER JOIN public.trips t ON t.id = r.trip_id
  WHERE r.reviewee_id = p_passenger_id
    AND t.driver_id  <> p_passenger_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',                 sub.id,
        'rating',             sub.rating,
        'comment',            sub.comment,
        'reviewer_full_name', p.full_name,
        'created_at',         sub.created_at
      ) ORDER BY sub.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent
  FROM (
    SELECT r.id, r.rating, r.comment, r.reviewer_id, r.created_at
    FROM public.reviews r
    INNER JOIN public.trips t ON t.id = r.trip_id
    WHERE r.reviewee_id = p_passenger_id
      AND t.driver_id  <> p_passenger_id
      AND r.comment IS NOT NULL
      AND length(trim(r.comment)) > 0
    ORDER BY r.created_at DESC
    LIMIT 3
  ) sub
  INNER JOIN public.profiles p ON p.id = sub.reviewer_id;

  RETURN jsonb_build_object(
    'avg',    v_avg,
    'count',  v_count,
    'recent', v_recent
  );
END;
$$;

-- ============================================================
-- RPC: get_driver_review_details
-- Returns aggregate + up to 3 most-recent non-empty comments
-- about p_driver_id AS THE DRIVER (reviewee == trip.driver_id).
-- Gated on has_accepted_booking_with (existing helper).
-- Returns NULL if caller lacks an accepted booking relationship.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_driver_review_details(p_driver_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_avg    NUMERIC;
  v_count  BIGINT;
  v_recent JSONB;
BEGIN
  IF NOT public.has_accepted_booking_with(p_driver_id) THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0),
    COUNT(*)
  INTO v_avg, v_count
  FROM public.reviews r
  INNER JOIN public.trips t ON t.id = r.trip_id
  WHERE r.reviewee_id = p_driver_id
    AND t.driver_id   = p_driver_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',                 sub.id,
        'rating',             sub.rating,
        'comment',            sub.comment,
        'reviewer_full_name', p.full_name,
        'created_at',         sub.created_at
      ) ORDER BY sub.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent
  FROM (
    SELECT r.id, r.rating, r.comment, r.reviewer_id, r.created_at
    FROM public.reviews r
    INNER JOIN public.trips t ON t.id = r.trip_id
    WHERE r.reviewee_id = p_driver_id
      AND t.driver_id   = p_driver_id
      AND r.comment IS NOT NULL
      AND length(trim(r.comment)) > 0
    ORDER BY r.created_at DESC
    LIMIT 3
  ) sub
  INNER JOIN public.profiles p ON p.id = sub.reviewer_id;

  RETURN jsonb_build_object(
    'avg',    v_avg,
    'count',  v_count,
    'recent', v_recent
  );
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY: reviews
-- ============================================================
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- SELECT: reviewer OR reviewee — own reviews both authored and received.
-- Aggregate access for broader viewers goes through the view subquery or
-- the RPCs above (both SECURITY DEFINER), never through this policy.
CREATE POLICY "reviews_select_own"
  ON public.reviews FOR SELECT
  USING (auth.uid() = reviewer_id OR auth.uid() = reviewee_id);

-- INSERT: reviewer must be auth.uid() AND eligibility via can_review.
CREATE POLICY "reviews_insert_eligible"
  ON public.reviews FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND public.can_review(reviewee_id, trip_id)
  );

-- No UPDATE, no DELETE policies — write-once by design.
```

- [ ] **Step 2: Apply the migration to the linked Supabase project**

Run:

```bash
supabase db push
```

Expected output: `Applying migration 20260424120000_create_reviews.sql... Finished supabase db push.`

If the command fails with a syntax error, read the error line number against the SQL file and fix inline. Do not proceed until the migration is applied cleanly.

- [ ] **Step 3: Verify the table and policies exist**

Run:

```bash
supabase db remote commit --dry-run 2>&1 | tail -40
```

Or inspect directly with the Supabase MCP:

```text
mcp__plugin_supabase_supabase__list_tables  (include reviews)
mcp__plugin_supabase_supabase__execute_sql
  SELECT polname FROM pg_policies WHERE tablename = 'reviews' ORDER BY polname;
```

Expected: `reviews_insert_eligible`, `reviews_select_own`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260424120000_create_reviews.sql
git commit -m "$(cat <<'EOF'
feat(db): add reviews table, RLS, and review-eligibility RPCs

Introduces the bidirectional ratings system per the approved spec.

Schema:
- reviews (trip_id, reviewer_id, reviewee_id, rating 1-5, comment)
  with UNIQUE(reviewer_id, reviewee_id, trip_id) and reviewer <> reviewee
  CHECK. Role of reviewee is derived at query time from trips.driver_id.

Access control:
- reviews_select_own: owner (reviewer or reviewee) can read own rows.
- reviews_insert_eligible: enforces can_review(...) for WITH CHECK;
  defence in depth alongside the Server Action's pre-insert check.
- No UPDATE/DELETE — write-once.

New SQL helpers (all SECURITY DEFINER STABLE):
- can_review_reason(reviewee, trip) returns a code the action maps
  to a French user-facing error (NOT_PARTICIPANTS, TRIP_NOT_COMPLETED,
  WINDOW_EXPIRED, DUPLICATE, etc.) or 'OK'.
- can_review(reviewee, trip): boolean wrapper for the RLS policy.
- has_booking_on_my_trip(passenger): gate for passenger aggregate.
- get_passenger_review_summary(passenger): JSONB with avg/count/
  recent-3-comments, or NULL when unauthorised.
- get_driver_review_details(driver): same shape, gated on
  existing has_accepted_booking_with.

profiles_public view: dropped and recreated with two extra
computed columns (driver_rating_avg, driver_rating_count) so trip
listings can render the driver's aggregate without an extra query.
Passenger aggregate deliberately does NOT appear here — it's RPC-gated.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Regenerate TypeScript database types

**Files:**
- Modify: `src/types/database.types.ts`

- [ ] **Step 1: Regenerate the auto-emitted block**

Run:

```bash
supabase gen types typescript --linked > src/types/database.types.ts
```

This overwrites the whole file. You will re-append the hand-maintained narrowing block in the next step.

- [ ] **Step 2: Append the narrowing block**

Append the following to the very end of `src/types/database.types.ts` (it must come after everything the generator emitted):

```typescript

// ─────────────────────────────────────────────────────────────────────────────
// Project-specific narrowings (hand-maintained, not emitted by `gen types`).
// Postgres stores these as `text`/`jsonb`; the app treats them as literal
// unions / structured shapes. Re-append this block after every regeneration.
// ─────────────────────────────────────────────────────────────────────────────

export type TripStatus = "open" | "full" | "cancelled" | "completed"

export type BookingStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "trip_cancelled"

export type LocationJsonb = {
  label: string
  lat: number
  lng: number
  place_id?: string | null
}

export type TripRow = Omit<
  Database["public"]["Tables"]["trips"]["Row"],
  "status" | "origin" | "destination"
> & {
  status: TripStatus
  origin: LocationJsonb
  destination: LocationJsonb
}

export type BookingRow = Omit<
  Database["public"]["Tables"]["bookings"]["Row"],
  "status"
> & {
  status: BookingStatus
}

export type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"]

// Shape returned by the RPCs get_passenger_review_summary /
// get_driver_review_details. `null` means "caller not authorised".
export type ReviewSummaryRaw = {
  avg: number
  count: number
  recent: Array<{
    id: string
    rating: number
    comment: string | null
    reviewer_full_name: string
    created_at: string
  }>
} | null

// Shape returned by the Server Actions (after pseudonymisation).
export type ReviewSummary = {
  avg: number
  count: number
  recent: Array<{
    id: string
    rating: number
    comment: string | null
    reviewerDisplayName: string
    createdAt: string
  }>
}
```

- [ ] **Step 3: Verify typecheck passes**

Run:

```bash
pnpm typecheck
```

Expected: no errors.

If typecheck reports that a function is missing from `Database["public"]["Functions"]` (e.g. `can_review_reason`, `has_booking_on_my_trip`, `get_passenger_review_summary`, `get_driver_review_details`), the generator didn't pick up the new RPCs. Verify the migration was applied to the *linked* project (Task 1 Step 2) — not just locally — and re-run `supabase gen types typescript --linked`. If the generator emits a `has_accepted_booking_with` signature that differs from the one in the pre-existing file (argument naming changed upstream), accept the new signature and adapt any broken call sites.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.types.ts
git commit -m "$(cat <<'EOF'
chore(types): regenerate database types after reviews migration

Regenerated the auto-emitted Database type from the linked Supabase
schema and re-appended the hand-maintained narrowing block (per the
pattern documented in project.md).

Adds:
- ReviewRow alias over the generated Row type.
- ReviewSummaryRaw: the JSONB shape returned by the get_* RPCs
  (contains raw full_name — never cross the Client boundary).
- ReviewSummary: the post-pseudonymisation shape returned by the
  Server Actions to Client Components.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Zod validation schema

**Files:**
- Create: `src/lib/validations/review.schema.ts`

- [ ] **Step 1: Write the schema**

Create `src/lib/validations/review.schema.ts`:

```typescript
// src/lib/validations/review.schema.ts
import { z } from "zod";

export const submitReviewSchema = z.object({
  trip_id: z.string().uuid("Identifiant de trajet invalide."),
  reviewee_id: z.string().uuid("Identifiant d'utilisateur invalide."),
  rating: z
    .number({ required_error: "Veuillez choisir une note." })
    .int()
    .min(1, "La note doit être entre 1 et 5.")
    .max(5, "La note doit être entre 1 et 5."),
  comment: z
    .string()
    .trim()
    .max(1000, "Le commentaire est trop long (1000 caractères maximum).")
    .optional()
    .or(z.literal("")),
});

export const getReviewSummarySchema = z.object({
  user_id: z.string().uuid("Identifiant d'utilisateur invalide."),
});
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validations/review.schema.ts
git commit -m "$(cat <<'EOF'
feat(reviews): add zod validation schemas

submitReviewSchema covers the client-submittable fields (trip_id,
reviewee_id, rating 1-5, optional comment up to 1000 chars). reviewer_id
is intentionally NOT in the schema — the Server Action derives it from
auth.uid(), never trusting client input.

getReviewSummarySchema reuses the same pattern for the two summary
actions' single UUID input.

Error messages are French, matching the project-wide convention.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Pseudonymisation helper (TDD)

**Files:**
- Create: `src/lib/reviews/display-name.ts`
- Create: `src/lib/reviews/display-name.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/reviews/display-name.test.ts`:

```typescript
// src/lib/reviews/display-name.test.ts
import { describe, it, expect } from "vitest";
import { pseudonymizeName } from "./display-name";

describe("pseudonymizeName", () => {
  it("converts 'Jean Dupont' to 'Jean D.'", () => {
    expect(pseudonymizeName("Jean Dupont")).toBe("Jean D.");
  });

  it("leaves a single-token name unchanged", () => {
    expect(pseudonymizeName("Jean")).toBe("Jean");
  });

  it("collapses middle names using the last token's initial", () => {
    expect(pseudonymizeName("Jean Marie Dupont")).toBe("Jean D.");
  });

  it("preserves hyphenated first names", () => {
    expect(pseudonymizeName("Jean-Marie Dupont")).toBe("Jean-Marie D.");
  });

  it("uppercases the last initial", () => {
    expect(pseudonymizeName("agim hoxha")).toBe("agim H.");
  });

  it("returns '?' for an empty or whitespace-only name", () => {
    expect(pseudonymizeName("")).toBe("?");
    expect(pseudonymizeName("   ")).toBe("?");
  });

  it("tolerates multiple internal spaces", () => {
    expect(pseudonymizeName("Jean   Dupont")).toBe("Jean D.");
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run:

```bash
pnpm test -- src/lib/reviews/display-name.test.ts
```

Expected: FAIL — `Cannot find module './display-name'` or similar.

- [ ] **Step 3: Implement the helper**

Create `src/lib/reviews/display-name.ts`:

```typescript
// src/lib/reviews/display-name.ts

/**
 * Converts a full name like "Jean Dupont" to the pseudonymised display
 * form "Jean D." used throughout the reviews feature so a raw last name
 * never crosses the Client boundary.
 *
 * Edge cases:
 * - Single token (e.g. "Jean") → returned unchanged.
 * - Empty / whitespace-only → "?".
 * - Hyphenated first names preserved intact.
 * - Last initial is always uppercased; first token keeps its casing.
 */
export function pseudonymizeName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "?";

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];

  const first = parts[0];
  const last = parts[parts.length - 1];
  const initial = last[0]?.toUpperCase() ?? "";
  return `${first} ${initial}.`;
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run:

```bash
pnpm test -- src/lib/reviews/display-name.test.ts
```

Expected: PASS — 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reviews/display-name.ts src/lib/reviews/display-name.test.ts
git commit -m "$(cat <<'EOF'
feat(reviews): add pseudonymizeName helper

Converts "Jean Dupont" to "Jean D." so the raw last name never reaches
a Client Component in a review context. Handles single-token names,
hyphenated first names, middle names, and empty input. Covered by
seven unit tests that pin down the edge cases.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `submitReview` Server Action — happy paths (TDD)

**Files:**
- Create: `src/app/(main)/reviews/actions.ts`
- Create: `src/app/(main)/reviews/actions.test.ts`

This task implements the two success scenarios (driver → passenger, passenger → driver). Rejection paths come in Task 6 so each task produces a meaningful commit.

- [ ] **Step 1: Write the failing test — driver reviews passenger**

Create `src/app/(main)/reviews/actions.test.ts`:

```typescript
// src/app/(main)/reviews/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServerClient } from "@/lib/supabase/server";
import { buildSupabaseMock, MOCK_USER, MOCK_PASSENGER } from "@/lib/test-utils/supabase-mock";
import { submitReview } from "./actions";

vi.mock("@/lib/supabase/server");

const TRIP_ID = "00000000-0000-0000-0000-0000000aaaa1";

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
```

- [ ] **Step 2: Run the tests, verify they fail**

Run:

```bash
pnpm test -- src/app/(main)/reviews/actions.test.ts
```

Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Implement the minimal action**

Create `src/app/(main)/reviews/actions.ts`:

```typescript
// src/app/(main)/reviews/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { submitReviewSchema } from "@/lib/validations/review.schema";
import type { ActionResult } from "@/types/actions";
import type { ReviewRow } from "@/types/database.types";

type CanReviewCode =
  | "OK"
  | "NOT_AUTHENTICATED"
  | "SELF_REVIEW"
  | "TRIP_NOT_FOUND"
  | "TRIP_NOT_COMPLETED"
  | "WINDOW_EXPIRED"
  | "NOT_PARTICIPANTS"
  | "DUPLICATE";

function mapEligibilityError(code: CanReviewCode): string {
  switch (code) {
    case "NOT_AUTHENTICATED":
      return "Authentification requise.";
    case "SELF_REVIEW":
      return "Vous ne pouvez pas vous évaluer vous-même.";
    case "TRIP_NOT_FOUND":
      return "Trajet introuvable.";
    case "TRIP_NOT_COMPLETED":
      return "Vous ne pouvez évaluer qu'un trajet terminé.";
    case "WINDOW_EXPIRED":
      return "Le délai pour laisser un avis (30 jours) est dépassé.";
    case "NOT_PARTICIPANTS":
      return "Vous n'avez pas partagé ce trajet avec cette personne.";
    case "DUPLICATE":
      return "Vous avez déjà laissé un avis pour ce trajet.";
    default:
      return "Évaluation impossible. Veuillez réessayer.";
  }
}

export async function submitReview(rawData: unknown): Promise<ActionResult<ReviewRow>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentification requise." };
  }

  const parsed = submitReviewSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  // Pre-insert eligibility check via RPC — gives us a specific error code.
  // The INSERT RLS policy uses the same SQL function (can_review) as defence
  // in depth; this client-side call is purely for error messaging.
  const { data: code, error: rpcError } = await supabase.rpc("can_review_reason", {
    p_reviewee_id: parsed.data.reviewee_id,
    p_trip_id: parsed.data.trip_id,
  });

  if (rpcError) {
    console.error("[submitReview] can_review_reason", rpcError.message);
    return { success: false, error: "Évaluation impossible. Veuillez réessayer." };
  }

  if (code !== "OK") {
    return { success: false, error: mapEligibilityError(code as CanReviewCode) };
  }

  const { data: review, error: insertError } = await supabase
    .from("reviews")
    .insert({
      trip_id: parsed.data.trip_id,
      reviewer_id: user.id,
      reviewee_id: parsed.data.reviewee_id,
      rating: parsed.data.rating,
      comment: parsed.data.comment && parsed.data.comment.length > 0 ? parsed.data.comment : null,
    })
    .select()
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      return { success: false, error: mapEligibilityError("DUPLICATE") };
    }
    console.error("[submitReview]", insertError.message);
    return { success: false, error: "Évaluation impossible. Veuillez réessayer." };
  }

  revalidatePath("/dashboard");
  return { success: true, data: review as ReviewRow };
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run:

```bash
pnpm test -- src/app/(main)/reviews/actions.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/(main)/reviews/actions.ts src/app/(main)/reviews/actions.test.ts
git commit -m "$(cat <<'EOF'
feat(reviews): add submitReview action with happy-path coverage

First slice of the reviews Server Action layer — covers both success
scenarios (driver reviewing a passenger, passenger reviewing the
driver). reviewer_id is set from auth.uid() and never trusted from the
client payload; a regression test pins this down.

The action calls can_review_reason(...) RPC for a specific eligibility
code, which feeds mapEligibilityError(...) to produce a French
user-facing message. The same SQL function guards the INSERT RLS
policy as defence in depth.

Rejection paths are added in the next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `submitReview` — rejection paths (TDD)

**Files:**
- Modify: `src/app/(main)/reviews/actions.test.ts`
- Modify (if needed): `src/app/(main)/reviews/actions.ts`

Most rejection cases are already handled by `mapEligibilityError`. The tests below verify each branch end-to-end.

- [ ] **Step 1: Add the rejection tests**

Append to `src/app/(main)/reviews/actions.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests**

Run:

```bash
pnpm test -- src/app/(main)/reviews/actions.test.ts
```

Expected: PASS — 3 (happy paths) + 9 (rejections) = 12 tests green. No new implementation code should be needed; the error-mapping and zod messages already cover these paths. If any test fails, read the failure against `mapEligibilityError` and the zod schema and fix the message inline.

- [ ] **Step 3: Commit**

```bash
git add src/app/(main)/reviews/actions.test.ts
git commit -m "$(cat <<'EOF'
test(reviews): cover submitReview rejection paths

Adds the remaining nine rejection cases for submitReview: unauth,
out-of-range rating, over-length comment, each of the seven
can_review_reason codes, plus the belt-and-suspenders duplicate path
that short-circuits on a Postgres 23505 at INSERT time.

No production code change in this commit — mapEligibilityError and the
zod schema already covered these paths; this just pins them down.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `getPassengerReviewSummary` + `getDriverReviewDetails` actions (TDD)

Both share structure, so they're implemented in one task with two commits.

**Files:**
- Modify: `src/app/(main)/reviews/actions.ts`
- Modify: `src/app/(main)/reviews/actions.test.ts`

- [ ] **Step 1: Write tests for `getPassengerReviewSummary`**

Append to `src/app/(main)/reviews/actions.test.ts`:

```typescript
import { getPassengerReviewSummary, getDriverReviewDetails } from "./actions";

const ANOTHER_PASSENGER = { id: "user-passenger-789", email: "p2@test.com" };

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
    expect((result as { error: string }).error).toBe("Authentification requise.");
  });

  it("returns error when RPC returns null (caller has no booking with this passenger)", async () => {
    setupMock(MOCK_USER);
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await getPassengerReviewSummary({ user_id: ANOTHER_PASSENGER.id });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/non autoris/i);
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
```

- [ ] **Step 2: Run tests — verify they fail**

Run:

```bash
pnpm test -- src/app/(main)/reviews/actions.test.ts
```

Expected: FAIL — `getPassengerReviewSummary` / `getDriverReviewDetails` not exported.

- [ ] **Step 3: Implement both actions**

Append to `src/app/(main)/reviews/actions.ts`:

```typescript
import { getReviewSummarySchema } from "@/lib/validations/review.schema";
import { pseudonymizeName } from "@/lib/reviews/display-name";
import type { ReviewSummary, ReviewSummaryRaw } from "@/types/database.types";

function adaptSummary(raw: NonNullable<ReviewSummaryRaw>): ReviewSummary {
  return {
    avg: Number(raw.avg),
    count: Number(raw.count),
    recent: raw.recent.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      reviewerDisplayName: pseudonymizeName(r.reviewer_full_name),
      createdAt: r.created_at,
    })),
  };
}

export async function getPassengerReviewSummary(rawData: unknown): Promise<ActionResult<ReviewSummary>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentification requise." };
  }

  const parsed = getReviewSummarySchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase.rpc("get_passenger_review_summary", {
    p_passenger_id: parsed.data.user_id,
  });

  if (error) {
    console.error("[getPassengerReviewSummary]", error.message);
    return { success: false, error: "Chargement des avis impossible." };
  }

  if (data === null) {
    return { success: false, error: "Action non autorisée." };
  }

  return { success: true, data: adaptSummary(data as NonNullable<ReviewSummaryRaw>) };
}

export async function getDriverReviewDetails(rawData: unknown): Promise<ActionResult<ReviewSummary>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentification requise." };
  }

  const parsed = getReviewSummarySchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase.rpc("get_driver_review_details", {
    p_driver_id: parsed.data.user_id,
  });

  if (error) {
    console.error("[getDriverReviewDetails]", error.message);
    return { success: false, error: "Chargement des avis impossible." };
  }

  if (data === null) {
    return { success: false, error: "Action non autorisée." };
  }

  return { success: true, data: adaptSummary(data as NonNullable<ReviewSummaryRaw>) };
}
```

- [ ] **Step 4: Write tests for `getDriverReviewDetails`**

Append to `src/app/(main)/reviews/actions.test.ts`:

```typescript
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
    expect((result as { error: string }).error).toBe("Authentification requise.");
  });

  it("returns error when RPC returns null (no accepted booking relationship)", async () => {
    setupMock(MOCK_PASSENGER);
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await getDriverReviewDetails({ user_id: MOCK_USER.id });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/non autoris/i);
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
```

At the top of the test file, ensure `ReviewSummary` is imported:

```typescript
import type { ReviewSummary } from "@/types/database.types";
```

- [ ] **Step 5: Run tests — verify all pass**

Run:

```bash
pnpm test -- src/app/(main)/reviews/actions.test.ts
```

Expected: PASS — 12 (submitReview) + 4 (getPassengerReviewSummary) + 3 (getDriverReviewDetails) = 19 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/app/(main)/reviews/actions.ts src/app/(main)/reviews/actions.test.ts
git commit -m "$(cat <<'EOF'
feat(reviews): add getPassengerReviewSummary and getDriverReviewDetails

Two read-side Server Actions, symmetric in shape:

- getPassengerReviewSummary(userId): used by drivers viewing a booking
  request; calls the get_passenger_review_summary RPC, which gates on
  has_booking_on_my_trip.
- getDriverReviewDetails(userId): used by passengers after booking is
  accepted; calls get_driver_review_details, gated on the existing
  has_accepted_booking_with helper.

Both actions:
- Re-check auth at the action layer before calling the RPC.
- Treat a null RPC result as "not authorised" (defence in depth;
  the RPC itself returns null when the access check fails).
- Apply pseudonymizeName to reviewer_full_name before returning —
  the raw last name never reaches the Client.

Covered by 7 new tests including the pseudonymisation round-trip.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `StarRating` component

**Files:**
- Create: `src/components/ui/StarRating.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/ui/StarRating.tsx`:

```typescript
// src/components/ui/StarRating.tsx
"use client";

import { useState } from "react";
import { Star } from "lucide-react";

type DisplayProps = {
  mode: "display";
  /** Average rating 0.0–5.0 (already rounded to 1 decimal by the server) */
  value: number;
  /** Total review count; if < 3, caller should render a fallback instead */
  count?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
};

type InteractiveProps = {
  mode: "interactive";
  value: number;
  onChange: (v: number) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Accessible label — e.g. "Note donnée au conducteur" */
  ariaLabel?: string;
};

export type StarRatingProps = DisplayProps | InteractiveProps;

const sizePx = { sm: 14, md: 18, lg: 24 } as const;
const gapClass = { sm: "gap-0.5", md: "gap-1", lg: "gap-1.5" } as const;

export function StarRating(props: StarRatingProps) {
  const size = props.size ?? "md";
  const px = sizePx[size];

  if (props.mode === "display") {
    const full = Math.floor(props.value);
    const hasHalf = props.value - full >= 0.5;
    return (
      <span className={`inline-flex items-center ${gapClass[size]} ${props.className ?? ""}`}>
        {Array.from({ length: 5 }).map((_, i) => {
          const isFull = i < full;
          const isHalf = !isFull && i === full && hasHalf;
          return (
            <Star
              key={i}
              size={px}
              className={
                isFull
                  ? "fill-amber-400 text-amber-400"
                  : isHalf
                    ? "fill-amber-400 text-amber-400 opacity-60"
                    : "text-stone-300"
              }
              aria-hidden="true"
            />
          );
        })}
        <span className="ml-1.5 text-xs font-medium text-stone-600 tabular-nums">
          {props.value.toFixed(1)}
          {typeof props.count === "number" && (
            <span className="text-stone-400 font-normal"> ({props.count})</span>
          )}
        </span>
      </span>
    );
  }

  return <InteractiveStars {...props} />;
}

function InteractiveStars({ value, onChange, size = "md", className = "", ariaLabel }: InteractiveProps) {
  const [hover, setHover] = useState<number | null>(null);
  const px = sizePx[size];
  const displayValue = hover ?? value;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel ?? "Note"}
      className={`inline-flex items-center ${gapClass[size]} ${className}`}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const isActive = n <= displayValue;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => onChange(n)}
            className="p-1 rounded-md cursor-pointer focus-visible:outline-2 focus-visible:outline-red-800 focus-visible:outline-offset-2 transition-colors"
          >
            <Star
              size={px}
              className={
                isActive
                  ? "fill-amber-400 text-amber-400"
                  : "text-stone-300 hover:text-amber-300"
              }
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/StarRating.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add StarRating component with display and interactive modes

Reusable component for the reviews feature and anywhere else we need
a 1-5 star rating. Two discriminated modes:

- display: renders 5 lucide Stars with half-star support for .5
  increments, plus a numeric "4.3 (12)" tail; purely visual.
- interactive: 5 clickable stars with hover preview, keyboard focus,
  and ARIA radiogroup semantics. Used inside the ReviewModal.

Uses the project's amber/stone palette so it reads correctly on both
the white TripCard background and the glassmorphic dashboard cards.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `ReviewModal` component

**Files:**
- Create: `src/app/(main)/reviews/ReviewModal.tsx`

- [ ] **Step 1: Write the modal**

Create `src/app/(main)/reviews/ReviewModal.tsx`:

```typescript
// src/app/(main)/reviews/ReviewModal.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StarRating } from "@/components/ui/StarRating";
import { submitReview } from "./actions";
import { submitReviewSchema } from "@/lib/validations/review.schema";

type FormValues = z.infer<typeof submitReviewSchema>;

interface ReviewModalProps {
  tripId: string;
  revieweeId: string;
  revieweeName: string;
  /** Contextual — e.g. "votre conducteur" or "votre passager" */
  revieweeLabel: string;
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful submission so the parent can refresh */
  onSubmitted?: () => void;
}

export function ReviewModal({
  tripId,
  revieweeId,
  revieweeName,
  revieweeLabel,
  isOpen,
  onClose,
  onSubmitted,
}: ReviewModalProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(submitReviewSchema),
    defaultValues: {
      trip_id: tripId,
      reviewee_id: revieweeId,
      rating: 0 as unknown as 1,
      comment: "",
    },
  });

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Reset form when the modal closes
  useEffect(() => {
    if (!isOpen) {
      reset({ trip_id: tripId, reviewee_id: revieweeId, rating: 0 as unknown as 1, comment: "" });
      setSubmitError(null);
    }
  }, [isOpen, reset, tripId, revieweeId]);

  if (!isOpen) return null;

  const rating = watch("rating");

  function onSubmit(values: FormValues) {
    setSubmitError(null);
    startTransition(async () => {
      const result = await submitReview(values);
      if (result.success) {
        onSubmitted?.();
        onClose();
      } else {
        setSubmitError(result.error);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 id="review-modal-title" className="text-lg font-bold text-stone-900">
              Évaluer {revieweeLabel}
            </h2>
            <p className="text-sm text-stone-500 mt-0.5">{revieweeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-1 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-5 pb-5 flex flex-col gap-4">
          {/* Hidden inputs for trip_id and reviewee_id (set via defaultValues) */}
          <input type="hidden" {...register("trip_id")} />
          <input type="hidden" {...register("reviewee_id")} />

          {/* Rating */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-stone-700">Note</label>
            <StarRating
              mode="interactive"
              value={rating ?? 0}
              onChange={(v) => setValue("rating", v as 1, { shouldValidate: true })}
              size="lg"
              ariaLabel="Note du trajet"
            />
            {errors.rating && (
              <p className="text-xs text-red-600" role="alert">
                {errors.rating.message}
              </p>
            )}
          </div>

          {/* Comment */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="review-comment" className="text-sm font-medium text-stone-700">
              Commentaire <span className="text-stone-400 font-normal">(optionnel)</span>
            </label>
            <textarea
              id="review-comment"
              rows={4}
              maxLength={1000}
              placeholder="Partagez votre expérience…"
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-900 text-sm resize-none focus:border-red-800 focus:ring-2 focus:ring-red-100 outline-none placeholder:text-stone-400"
              {...register("comment")}
            />
            {errors.comment && (
              <p className="text-xs text-red-600" role="alert">
                {errors.comment.message}
              </p>
            )}
          </div>

          {submitError && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} size="sm">
              Annuler
            </Button>
            <Button type="submit" variant="primary" isLoading={isPending} size="sm">
              Envoyer l&apos;avis
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: no errors. `@hookform/resolvers` is already in the stack per `project.md`, so `zodResolver` resolves without a new dependency. If typecheck fails on a missing module, run `pnpm list @hookform/resolvers` to confirm it's installed; if not, stop and ask before adding a dependency (the project rule in `CLAUDE.md` forbids silently introducing one).

- [ ] **Step 3: Commit**

```bash
git add src/app/(main)/reviews/ReviewModal.tsx
git commit -m "$(cat <<'EOF'
feat(reviews): add ReviewModal client component

Modal form opened from the dashboard "Laisser un avis" CTAs. Uses
react-hook-form + zodResolver against the existing submitReviewSchema,
the interactive StarRating component, and a 1000-char textarea. Closes
on backdrop click, Escape key, or successful submission. Error state
is displayed inline.

No new dependency — builds on @hookform/resolvers which is already in
the stack.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: TripCard — show driver aggregate rating

**Files:**
- Modify: `src/app/(main)/trips/components/TripCard.tsx`
- Modify: `src/app/(main)/trips/page.tsx`

The TripCard currently receives `driverName: string`. We need to also pass the driver's aggregate from `profiles_public`.

- [ ] **Step 1: Extend the `profiles_public` select in `/trips/page.tsx`**

Open `src/app/(main)/trips/page.tsx`. Find the batch fetch that today reads:

```typescript
.from("profiles_public")
.select("id, full_name")
```

Replace with:

```typescript
.from("profiles_public")
.select("id, full_name, driver_rating_avg, driver_rating_count")
```

Then update the `nameById` map (or equivalent) to retain both name and rating. Example replacement for the corresponding assembly block:

```typescript
const driverById = Object.fromEntries(
  (rawPublicProfiles ?? []).map((p) => [
    p.id,
    {
      name: p.full_name ?? "Conducteur",
      rating_avg: p.driver_rating_avg != null ? Number(p.driver_rating_avg) : 0,
      rating_count: p.driver_rating_count != null ? Number(p.driver_rating_count) : 0,
    },
  ])
);
```

Then in the prop pass to `TripCard`, supply the rating:

```tsx
<TripCard
  trip={trip}
  driverName={driverById[trip.driver_id]?.name ?? "Conducteur"}
  driverRatingAvg={driverById[trip.driver_id]?.rating_avg ?? 0}
  driverRatingCount={driverById[trip.driver_id]?.rating_count ?? 0}
  currentUserId={userId}
/>
```

- [ ] **Step 2: Update the `TripCardProps` interface and JSX in `TripCard.tsx`**

In `src/app/(main)/trips/components/TripCard.tsx`:

Add these two fields to the `TripCardProps` interface next to `driverName`:

```typescript
interface TripCardProps {
  trip: { /* ...existing fields... */ };
  driverName: string;
  driverRatingAvg: number;
  driverRatingCount: number;
  currentUserId: string;
}
```

Destructure them in the component parameters:

```typescript
export function TripCard({ trip, driverName, driverRatingAvg, driverRatingCount, currentUserId }: TripCardProps) {
```

Import `StarRating`:

```typescript
import { StarRating } from "@/components/ui/StarRating";
```

In the driver-name block (around line 104 — "Conducteur :" row), replace the existing block with:

```tsx
{/* Driver name + aggregate rating */}
<div className="flex items-center gap-2 mt-3 text-xs text-stone-400 flex-wrap">
  <div className="flex items-center gap-1.5">
    <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
      <span className="text-red-800 font-bold text-[10px]">
        {driverName[0]?.toUpperCase() ?? "?"}
      </span>
    </div>
    <span>
      Conducteur :{" "}
      <span className="font-medium text-stone-600">{driverName}</span>
    </span>
  </div>
  {driverRatingCount >= 3 ? (
    <StarRating mode="display" value={driverRatingAvg} count={driverRatingCount} size="sm" />
  ) : (
    <span className="text-[10px] font-medium text-red-800 bg-red-50 rounded-full px-2 py-0.5 border border-red-100">
      Nouveau conducteur
    </span>
  )}
</div>
```

- [ ] **Step 3: Typecheck and verify in dev**

Run:

```bash
pnpm typecheck
```

Expected: no errors.

Start the dev server:

```bash
pnpm dev
```

Open `/trips` in a browser. Verify:

- Trip cards render without error.
- Drivers with < 3 reviews show the "Nouveau conducteur" pill.
- Drivers with ≥ 3 reviews show a star row and numeric rating.
- (If you have none of either today, seed a handful of reviews in the linked DB for one driver using an SQL scratch pad, then reload.)

- [ ] **Step 4: Commit**

```bash
git add src/app/(main)/trips/components/TripCard.tsx src/app/(main)/trips/page.tsx
git commit -m "$(cat <<'EOF'
feat(trips): show driver aggregate rating on TripCard

Extends the profiles_public select to pull driver_rating_avg and
driver_rating_count (now surfaced by the view), threads them through
to TripCard, and renders either:
- A "Nouveau conducteur" pill when count < 3 (avoids a single review
  dominating the display), or
- A <StarRating mode="display"> with the numeric tail (e.g. "4.3 (12)").

No extra RPC call — the aggregates come along for free on the same
join that already fetches full_name.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Trip detail page — show driver aggregate

**Files:**
- Modify: `src/app/(main)/trips/[id]/page.tsx`

- [ ] **Step 1: Extend the driver fetch and render**

Open `src/app/(main)/trips/[id]/page.tsx`. Find the block that fetches the driver profile (via `profiles_public`) and update the select to include the two new columns — same change as Task 10 Step 1 (`driver_rating_avg, driver_rating_count`).

In the driver info block (wherever it renders the driver avatar + name), add just below the name:

```tsx
import { StarRating } from "@/components/ui/StarRating";

// …inside the driver section:
{driver.driver_rating_count != null && driver.driver_rating_count >= 3 ? (
  <StarRating
    mode="display"
    value={Number(driver.driver_rating_avg)}
    count={Number(driver.driver_rating_count)}
    size="md"
    className="mt-1"
  />
) : (
  <span className="mt-1 text-xs font-medium text-red-800 bg-red-50 rounded-full px-2 py-0.5 border border-red-100 inline-block">
    Nouveau conducteur
  </span>
)}
```

- [ ] **Step 2: Typecheck and verify**

Run:

```bash
pnpm typecheck
pnpm dev
```

Open `/trips/<some-id>` and verify the driver block now includes the rating pill or stars per the count.

- [ ] **Step 3: Commit**

```bash
git add src/app/(main)/trips/[id]/page.tsx
git commit -m "$(cat <<'EOF'
feat(trips): show driver rating on the trip detail page

Mirrors the TripCard change for the /trips/[id] detail route. Uses the
same column projection from profiles_public and the same "< 3 reviews
→ Nouveau conducteur pill" rule for consistency.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Dashboard — review CTAs and rating surfaces

This is the biggest UI change. Split into three commits: (12a) fetch review summaries in the page RSC; (12b) wire `DriverTripCard`; (12c) wire `PassengerBookingCard`.

**Files:**
- Modify: `src/app/(main)/dashboard/page.tsx`
- Modify: `src/app/(main)/dashboard/DriverTripCard.tsx`
- Modify: `src/app/(main)/dashboard/PassengerBookingCard.tsx`

### Task 12a: Thread review summaries through dashboard data

This commit extends **three files** — both card interfaces and the dashboard RSC — in one atomic change so that typecheck passes before *and* after. The new field is added to each interface and the RSC populates it, but no UI consumes it yet; that's Tasks 12b and 12c.

- [ ] **Step 1: Extend the `BookingItem` interface in `DriverTripCard.tsx`**

Open `src/app/(main)/dashboard/DriverTripCard.tsx`. Add the import near the top of the file:

```typescript
import type { ReviewSummary } from "@/types/database.types";
```

Update the exported interface:

```typescript
export interface BookingItem {
  id: string;
  passenger_id: string;
  passenger_name: string;
  seats_requested: number;
  status: BookingStatus;
  passenger_message: string | null;
  created_at: string;
  /** Populated by the dashboard RSC; null when the caller isn't authorised
      to see this passenger's aggregate (should not happen in practice). */
  passenger_review_summary: ReviewSummary | null;
}
```

Do **not** change any JSX here yet — Task 12b handles rendering.

- [ ] **Step 2: Extend the `PassengerBookingItem` interface in `PassengerBookingCard.tsx`**

Open `src/app/(main)/dashboard/PassengerBookingCard.tsx`. Add:

```typescript
import type { ReviewSummary } from "@/types/database.types";
```

Update the exported interface:

```typescript
export interface PassengerBookingItem {
  id: string;
  trip_id: string;
  seats_requested: number;
  status: BookingStatus;
  passenger_message: string | null;
  created_at: string;
  trip: {
    id: string;
    origin: LocationJsonb;
    destination: LocationJsonb;
    departure_at: string;
    status: TripStatus;
    driver_id: string;
  };
  driver_name: string;
  /** Populated by the dashboard RSC only when this booking is accepted;
      null otherwise. */
  driver_review_summary: ReviewSummary | null;
}
```

Again, no JSX changes yet.

- [ ] **Step 3: Extend the dashboard RSC to fetch and thread the summaries**

Open `src/app/(main)/dashboard/page.tsx`. Add the imports:

```typescript
import { getPassengerReviewSummary, getDriverReviewDetails } from "@/app/(main)/reviews/actions";
import type { ReviewSummary } from "@/types/database.types";
```

After the existing `nameById` assembly, insert the parallel fetch:

```typescript
// ── Review summaries (parallel, gated per-caller by the RPCs) ────────────
// Drivers see summaries of pending/accepted passengers on their trips.
const passengerIdsForReview = [
  ...new Set(
    tripBookings
      .filter((b) => b.status === "pending" || b.status === "accepted")
      .map((b) => b.passenger_id)
  ),
];

// Passengers see details of the driver on each of their accepted bookings.
const driverIdsForReview = [
  ...new Set(
    myBookings
      .filter((b) => b.status === "accepted")
      .map((b) => bookingTrips.find((t) => t.id === b.trip_id)?.driver_id)
      .filter((id): id is string => typeof id === "string" && id !== userId)
  ),
];

const [passengerReviewResults, driverReviewResults] = await Promise.all([
  Promise.all(
    passengerIdsForReview.map((id) =>
      getPassengerReviewSummary({ user_id: id }).then(
        (r) => [id, r.success ? r.data! : null] as const
      )
    )
  ),
  Promise.all(
    driverIdsForReview.map((id) =>
      getDriverReviewDetails({ user_id: id }).then(
        (r) => [id, r.success ? r.data! : null] as const
      )
    )
  ),
]);

const passengerReviewsById: Record<string, ReviewSummary | null> = Object.fromEntries(passengerReviewResults);
const driverReviewsById: Record<string, ReviewSummary | null> = Object.fromEntries(driverReviewResults);
```

Update the `DriverTripItem` assembly — in the `.map((b) => ({...}))` that produces each `BookingItem`, add the new field:

```typescript
const bookings: BookingItem[] = tripBookings
  .filter((b) => b.trip_id === trip.id)
  .map((b) => ({
    id: b.id,
    passenger_id: b.passenger_id,
    passenger_name: nameById[b.passenger_id] ?? "Passager",
    seats_requested: b.seats_requested,
    status: b.status as BookingStatus,
    passenger_message: b.passenger_message,
    created_at: b.created_at,
    passenger_review_summary: passengerReviewsById[b.passenger_id] ?? null,
  }));
```

Update the `PassengerBookingItem` assembly — in the object returned inside `.map((booking) => { ... return {...} satisfies PassengerBookingItem })`, add the new field:

```typescript
return {
  id: booking.id,
  trip_id: booking.trip_id,
  seats_requested: booking.seats_requested,
  status: booking.status as BookingStatus,
  passenger_message: booking.passenger_message,
  created_at: booking.created_at,
  trip: {
    id: trip.id,
    origin: trip.origin as unknown as LocationJsonb,
    destination: trip.destination as unknown as LocationJsonb,
    departure_at: trip.departure_at,
    status: trip.status as TripStatus,
    driver_id: trip.driver_id,
  },
  driver_name: nameById[trip.driver_id] ?? "Conducteur",
  driver_review_summary: driverReviewsById[trip.driver_id] ?? null,
} satisfies PassengerBookingItem;
```

- [ ] **Step 4: Typecheck — everything must pass**

Run:

```bash
pnpm typecheck
```

Expected: **no errors**. Both interfaces now declare the new field, the RSC now populates it, and no consumer yet depends on it — so TS is happy.

- [ ] **Step 5: Commit all three files together**

```bash
git add src/app/(main)/dashboard/page.tsx src/app/(main)/dashboard/DriverTripCard.tsx src/app/(main)/dashboard/PassengerBookingCard.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): thread review summaries through dashboard data

Extends the BookingItem and PassengerBookingItem shapes with a new
review-summary field, and extends the dashboard RSC to batch-call
getPassengerReviewSummary for every pending/accepted passenger on the
current user's trips and getDriverReviewDetails for every accepted
booking's driver. Both actions are issued in parallel via Promise.all
so total latency is bounded by a single round-trip to Supabase.

No UI consumes the new fields yet — the next two commits render them
in DriverTripCard and PassengerBookingCard respectively.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 12b: Render passenger rating + "Laisser un avis" in `DriverTripCard`

The `BookingItem` interface was already extended with `passenger_review_summary` in Task 12a — this task only adds rendering and the modal CTA.

- [ ] **Step 1: Render passenger rating next to each booking row**

In `src/app/(main)/dashboard/DriverTripCard.tsx`, add the StarRating import:

```typescript
import { StarRating } from "@/components/ui/StarRating";
```

Inside the `BookingRow` component, below `<BookingStatusBadge status={booking.status} />`, add:

```tsx
{booking.passenger_review_summary && booking.passenger_review_summary.count >= 3 ? (
  <StarRating
    mode="display"
    value={booking.passenger_review_summary.avg}
    count={booking.passenger_review_summary.count}
    size="sm"
  />
) : booking.passenger_review_summary ? (
  <span className="text-[10px] font-medium text-stone-500 bg-stone-100 rounded-full px-2 py-0.5">
    Nouveau passager
  </span>
) : null}
```

And optionally, below the passenger_message block, show recent comments when present (show a small "Voir les avis" toggle if you want — for MVP, render inline up to 3 short lines):

```tsx
{booking.passenger_review_summary && booking.passenger_review_summary.recent.length > 0 && (
  <ul className="mt-2 flex flex-col gap-1 text-xs text-stone-600">
    {booking.passenger_review_summary.recent.map((r) => (
      <li key={r.id} className="flex items-start gap-1">
        <StarRating mode="display" value={r.rating} size="sm" />
        <span className="italic">«&nbsp;{r.comment}&nbsp;»</span>
        <span className="text-stone-400"> — {r.reviewerDisplayName}</span>
      </li>
    ))}
  </ul>
)}
```

- [ ] **Step 2: Add the "Laisser un avis" CTA for completed trips**

In the outer `DriverTripCard` function, add:

```typescript
import { useState } from "react";
import { ReviewModal } from "@/app/(main)/reviews/ReviewModal";
```

Inside `DriverTripCard`, manage a small modal state:

```typescript
const [reviewTarget, setReviewTarget] = useState<BookingItem | null>(null);
```

Near the cancel-trip footer, when `trip.status === "completed"` AND there's at least one `accepted` booking, render a list of review CTAs:

```tsx
{trip.status === "completed" && (
  <div className="border-t border-stone-100 px-5 py-3 flex flex-col gap-2">
    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
      Évaluer les passagers
    </p>
    {trip.bookings
      .filter((b) => b.status === "accepted")
      .map((b) => (
        <Button
          key={b.id}
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setReviewTarget(b)}
          className="w-full justify-start"
        >
          Laisser un avis sur {b.passenger_name}
        </Button>
      ))}
  </div>
)}

{reviewTarget && (
  <ReviewModal
    tripId={trip.id}
    revieweeId={reviewTarget.passenger_id}
    revieweeName={reviewTarget.passenger_name}
    revieweeLabel="votre passager"
    isOpen={true}
    onClose={() => setReviewTarget(null)}
    onSubmitted={() => router.refresh()}
  />
)}
```

- [ ] **Step 3: Typecheck and visually verify**

Run:

```bash
pnpm typecheck
pnpm dev
```

Open `/dashboard` while authenticated as a driver with some bookings. Verify:

- Pending/accepted booking rows show either a rating or "Nouveau passager" pill.
- Completed trips display a "Laisser un avis" button per accepted passenger.
- Clicking opens the ReviewModal; submitting refreshes the page.
- After you've reviewed a passenger once, a second submission shows `"Vous avez déjà laissé un avis pour ce trajet."`.

- [ ] **Step 4: Commit**

```bash
git add src/app/(main)/dashboard/DriverTripCard.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): surface passenger ratings and review CTA in driver view

BookingItem now carries the passenger's review summary (aggregate +
recent comments) fetched upstream by the dashboard RSC. Each booking
row renders either a StarRating display or a "Nouveau passager" pill
based on the count >= 3 threshold. Completed trips gain a "Laisser un
avis sur X" button per accepted booking, which opens the ReviewModal;
on success, router.refresh re-runs the RSC query so the submitted
review vanishes from the "still to review" set.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 12c: Render driver details + "Laisser un avis" in `PassengerBookingCard`

`PassengerBookingItem` was already extended with `driver_review_summary` in Task 12a — this task only adds rendering and the modal CTA.

- [ ] **Step 1: Add the needed imports**

In `src/app/(main)/dashboard/PassengerBookingCard.tsx`, add:

```typescript
import { useState } from "react";
import { StarRating } from "@/components/ui/StarRating";
import { ReviewModal } from "@/app/(main)/reviews/ReviewModal";
```

(`useState` is new; the others are new module imports. `ReviewSummary` is already imported from Task 12a.)

- [ ] **Step 2: Render driver aggregate and recent comments when accepted**

Inside the Driver block (around line 129 — the "Conducteur :" row), just after the driver_name span, add:

```tsx
{isAccepted && booking.driver_review_summary && booking.driver_review_summary.count >= 3 && (
  <StarRating
    mode="display"
    value={booking.driver_review_summary.avg}
    count={booking.driver_review_summary.count}
    size="sm"
    className="ml-1"
  />
)}
```

Below the driver row, when `isAccepted` and there are recent comments, add a small block:

```tsx
{isAccepted && booking.driver_review_summary && booking.driver_review_summary.recent.length > 0 && (
  <ul className="mb-3 flex flex-col gap-1 text-xs text-stone-600 bg-stone-50 rounded-lg px-3 py-2">
    {booking.driver_review_summary.recent.map((r) => (
      <li key={r.id} className="flex items-start gap-1">
        <StarRating mode="display" value={r.rating} size="sm" />
        <span className="italic">«&nbsp;{r.comment}&nbsp;»</span>
        <span className="text-stone-400"> — {r.reviewerDisplayName}</span>
      </li>
    ))}
  </ul>
)}
```

- [ ] **Step 3: Add "Laisser un avis" CTA for completed accepted bookings**

Inside the component, above the existing `canCancel` Cancel button, add:

```typescript
const [isReviewOpen, setReviewOpen] = useState(false);
```

And in the JSX:

```tsx
{booking.trip.status === "completed" && booking.status === "accepted" && (
  <div className="mt-2">
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => setReviewOpen(true)}
      className="w-full"
    >
      Laisser un avis sur le conducteur
    </Button>
  </div>
)}

<ReviewModal
  tripId={booking.trip.id}
  revieweeId={booking.trip.driver_id}
  revieweeName={booking.driver_name}
  revieweeLabel="votre conducteur"
  isOpen={isReviewOpen}
  onClose={() => setReviewOpen(false)}
  onSubmitted={() => router.refresh()}
/>
```

- [ ] **Step 4: Typecheck and visually verify**

Run:

```bash
pnpm typecheck
pnpm dev
```

Open `/dashboard` as a passenger with an accepted booking on a completed trip. Verify:

- Driver row shows the aggregate rating.
- Recent comments appear when the driver has any.
- "Laisser un avis sur le conducteur" button appears for completed trips; modal opens and submits correctly.

- [ ] **Step 5: Commit**

```bash
git add src/app/(main)/dashboard/PassengerBookingCard.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): surface driver details and review CTA in passenger view

PassengerBookingItem now carries the driver's review summary (gated
server-side by has_accepted_booking_with). When accepted, the
passenger card renders the aggregate rating inline with the driver
name and a small block of up to three recent comments. Completed
trips gain a "Laisser un avis sur le conducteur" button that opens
the ReviewModal; router.refresh on success re-runs the dashboard
query so the CTA disappears after submission.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Update `project.md`

**Files:**
- Modify: `project.md`

- [ ] **Step 1: Update the data model section**

In `project.md`, section `### Data model (Postgres, all RLS-enabled)`, add a new bullet after the bookings entry:

```markdown
- **`reviews`** — `trip_id`, `reviewer_id`, `reviewee_id`, `rating` (1–5 SMALLINT, CHECK-constrained), optional `comment` (max 1000 chars).
  - `UNIQUE(reviewer_id, reviewee_id, trip_id)` + `CHECK(reviewer_id <> reviewee_id)`.
  - Role of the reviewee (driver vs passenger) is **derived at query time** from `trips.driver_id`, never stored.
  - RLS: `reviews_select_own` (reviewer or reviewee can read their own rows); `reviews_insert_eligible` uses `can_review(...)` as the WITH CHECK.
  - New helpers: `can_review_reason(reviewee, trip) → text` (returns a specific error code consumed by the Server Action), `can_review(reviewee, trip) → bool`, `has_booking_on_my_trip(passenger) → bool`.
  - New RPCs: `get_passenger_review_summary(passenger) → jsonb | null` (gated on `has_booking_on_my_trip`), `get_driver_review_details(driver) → jsonb | null` (gated on `has_accepted_booking_with`).
- **`profiles_public`** view was dropped and recreated — now also exposes `driver_rating_avg` and `driver_rating_count` (computed via correlated subquery; no triggers, no materialised data). Passenger aggregate is deliberately NOT exposed here and must be fetched via `get_passenger_review_summary`.
```

- [ ] **Step 2: Update the Current State section**

In `project.md`, section `## Current State — Implemented & Functional`, add after the Bookings subsection:

```markdown
### Reviews
- **Submit** (`submitReview`) — zod-validated; pre-checks via `can_review_reason` RPC for clean French error messages; insert is defence-in-depth-gated by the `reviews_insert_eligible` RLS policy using the same `can_review(...)` boolean wrapper.
- **Driver aggregate** — flows through `profiles_public.driver_rating_avg` / `driver_rating_count`. Displayed on `/trips` TripCards and `/trips/[id]` detail page. "Nouveau conducteur" pill when count < 3.
- **Passenger summary** (`getPassengerReviewSummary`) — RPC-gated so only drivers with a pending/accepted booking from that passenger see it. Rendered inline on the driver's dashboard booking rows.
- **Driver details** (`getDriverReviewDetails`) — RPC-gated on `has_accepted_booking_with`. Rendered on the passenger's dashboard alongside accepted bookings.
- **ReviewModal** (`src/app/(main)/reviews/ReviewModal.tsx`) — dashboard CTAs on `completed` trips open this modal; uses react-hook-form + zod + `StarRating` interactive variant.
- **Pseudonymisation** — reviewer display names returned by the two `get_*` actions go through `pseudonymizeName("Jean Dupont")` → `"Jean D."` in Node before reaching the client.
- **Window** — submissions accepted up to 30 days after `departure_at` (enforced in `can_review_reason`).
```

- [ ] **Step 3: Bump the "Last synced" line**

Replace the top "Last synced" line with:

```markdown
> Last synced: 2026-04-24 against commit `<short-sha-of-latest-reviews-commit>` (branch `main`). Previous uncommitted edits (tests, `.gitignore`, `supabase/config.toml`, types block) remain the user's WIP.
```

(Replace `<short-sha>` with the result of `git log --oneline -1 | cut -d' ' -f1`.)

- [ ] **Step 4: Commit**

```bash
git add project.md
git commit -m "$(cat <<'EOF'
docs(project): reflect reviews feature in project memory

Updates project.md to describe the newly shipped reviews subsystem:
the reviews table + RLS, the new SQL helpers and RPCs, the dashboard
CTAs, and the asymmetric visibility model (driver aggregate public
via profiles_public; passenger aggregate gated through RPC).

Also bumps the Last synced line.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

After all 13 tasks are complete:

- [ ] Run the full test suite:

```bash
pnpm test
```

Expected: 39 (existing) + 26 (new reviews — 7 pseudonymize + 12 submitReview + 4 getPassengerReviewSummary + 3 getDriverReviewDetails) = 65 tests green. The pre-existing booking tests must still pass — the migration did not change any booking-facing behaviour.

- [ ] Typecheck the whole project:

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] Build:

```bash
pnpm build
```

Expected: successful production build.

- [ ] Manual smoke test (dev server):
  - Browse `/trips` — ratings render for drivers with ≥ 3 reviews, pill otherwise.
  - Open a trip detail — same rating surface.
  - Log in as a driver with a completed trip and at least one accepted passenger → can open modal, submit, see success.
  - Attempt a duplicate — shows French duplicate-error message.
  - Log in as the corresponding passenger → can also submit a review of the driver.
  - Try to review a trip that's still `open` — button doesn't render; even if called manually, action returns TRIP_NOT_COMPLETED error.

---

## Spec coverage check

| Spec section | Task |
|---|---|
| §3.1 `reviews` table | Task 1 |
| §3.2 Role derivation (not stored) | Task 1 (SQL design) |
| §3.3 Helpers (`can_review`, `has_booking_on_my_trip`) | Task 1 |
| §4.1 Visibility matrix (all rows) | Tasks 1, 10, 11, 12a-c |
| §4.2 Eligibility rules (enforced twice) | Task 1 (RLS + RPC), Tasks 5/6 (action) |
| §4.3 RLS policies | Task 1 |
| §5 Aggregation via view subquery | Task 1 |
| §6 Server actions contract | Tasks 5, 6, 7 |
| §7.1 StarRating | Task 8 |
| §7.1 ReviewModal | Task 9 |
| §7.2 TripCard integration | Task 10 |
| §7.2 trips/[id] integration | Task 11 |
| §7.2 DriverTripCard integration | Task 12b |
| §7.2 PassengerBookingCard integration | Task 12c |
| §8 Defaults (30-day window, display threshold, pseudonymisation) | Tasks 1, 4, 10-12 |
| §9 Test plan | Tasks 4, 5, 6, 7 |
| §10 Files touched | Tasks 1-13 |
| §11 Open risks | Documented in spec; no task action required |
