# Ratings & Reviews — Design

> Status: approved 2026-04-24 — ready for implementation plan.
> Scope: bidirectional user-to-user reviews tied to completed trips.
> Not covered: i18n (parked, separate spec), review moderation UI, edit flow, email notifications.

---

## 1. Problem

Today, once a trip completes, there is no signal about trust between users. A passenger picking between two drivers on the same route has nothing to distinguish them; a driver evaluating a booking request has no prior signal about the passenger. The WhatsApp handoff stays in place for coordination — this feature adds **reputation**, not communication.

## 2. Goals & Non-goals

**Goals**

- Let a driver rate a passenger, and a passenger rate a driver, **only** after a trip they shared has been marked `completed`.
- Surface a driver's aggregate rating publicly on trip listings so passengers can evaluate before booking.
- Surface a passenger's aggregate rating + comments to the driver when that passenger has requested a seat on one of the driver's trips.
- Let each user see the reviews they've received on their own dashboard.
- Enforce all access rules at both the database (RLS) and server action layer.

**Non-goals (MVP)**

- No editing or deleting reviews via the UI. Support handles abuse manually.
- No moderation dashboard, no flagging flow.
- No notifications (email/push) about received reviews.
- No profile pages for browsing other users' full review history.
- No i18n — review UI ships in French, localized in a later pass.

## 3. Data Model

### 3.1 New table: `reviews`

```sql
create table reviews (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references trips(id) on delete cascade,
  reviewer_id     uuid not null references auth.users(id) on delete cascade,
  reviewee_id    uuid not null references auth.users(id) on delete cascade,
  rating          smallint not null check (rating between 1 and 5),
  comment         text,
  created_at      timestamptz not null default now(),
  unique (reviewer_id, reviewee_id, trip_id),
  check (reviewer_id <> reviewee_id),
  check (comment is null or char_length(comment) <= 1000)
);

create index reviews_reviewee_idx on reviews (reviewee_id);
create index reviews_trip_idx on reviews (trip_id);
```

### 3.2 Role derivation (no stored role column)

The reviewee's role on the trip is derived at query time:

- If `reviewee_id = trips.driver_id` → review is **about the driver**.
- Else → review is **about a passenger** (who must have had an accepted booking on that trip).

Storing a `role` column would duplicate information already in `trips.driver_id` and risk drift. All aggregation queries join `reviews → trips` and use this derivation.

### 3.3 Security-definer helpers (SQL functions)

Two new helpers alongside existing `is_trip_driver` / `has_accepted_booking_with`:

- **`has_booking_on_drivers_trip(driver_user_id uuid, passenger_user_id uuid) returns boolean`**
  True if there exists a booking with `status in ('pending', 'accepted')` where the booking's trip has `driver_id = driver_user_id` and `passenger_id = passenger_user_id`. Used to gate a driver's view of a passenger's reviews — a driver can see the reviews of anyone who has an open booking request on one of their trips.

- **`can_review(reviewer uuid, reviewee uuid, trip uuid) returns boolean`**
  Encapsulates the eligibility rule (see §4.2) so both the INSERT RLS policy and the Server Action share one source of truth.

## 4. Access Control

### 4.1 Visibility matrix

| Viewer | What they can read | Mechanism |
|---|---|---|
| Anyone (anon or authed) browsing `/trips`, `/trips/[id]` | Driver aggregate: `avg(rating)`, `count(*)` only | Extended `profiles_public` view subquery |
| Driver viewing a booking (pending or accepted) on their own trip | That passenger's aggregate **+ individual comments** | `get_passenger_review_summary(user_id)` RPC, gated on `has_booking_on_drivers_trip(auth.uid(), user_id)` |
| Passenger whose booking on a driver's trip is `accepted` | That driver's aggregate **+ individual comments** | `get_driver_review_details(user_id)` RPC, gated on `has_accepted_booking_with(auth.uid(), user_id)` |
| Any authed user, looking at their own reviews | All reviews where `reviewee_id = auth.uid()` | Owner SELECT policy on `reviews` |
| Any authed user, looking at reviews they authored | All reviews where `reviewer_id = auth.uid()` | Owner SELECT policy on `reviews` |
| Anyone else | Nothing | Default deny |

The `reviews` table itself has **no broad public SELECT policy**. Aggregate data reaches the public only through the view's subquery, which projects `avg()/count()` without row-level detail.

### 4.2 Review eligibility (one rule, enforced twice)

A review insert is allowed iff **all** of the following hold:

1. `reviewer_id = auth.uid()` (enforced by RLS and by the Server Action).
2. `reviewer_id <> reviewee_id`.
3. The trip's `status = 'completed'`.
4. `now() - trips.departure_at <= interval '30 days'`.
5. Either:
   - Reviewer is the trip's driver (`reviewer_id = trips.driver_id`) **and** reviewee has an `accepted` booking on that trip, **or**
   - Reviewer has an `accepted` booking on that trip **and** reviewee is the trip's driver.
6. The unique constraint `(reviewer_id, reviewee_id, trip_id)` is not violated (one review per direction per trip).

These checks live inside `can_review(...)` and are called from both the RLS `with check` clause and the Server Action. The Server Action is preferred for error messaging; the RLS policy is the defense-in-depth.

### 4.3 RLS policies on `reviews`

```sql
alter table reviews enable row level security;

-- Read: reviewer or reviewee only (own reviews, both authored and received)
create policy reviews_select_own on reviews
  for select using (
    auth.uid() = reviewer_id or auth.uid() = reviewee_id
  );

-- Insert: reviewer must be auth.uid() and eligibility must pass
create policy reviews_insert_eligible on reviews
  for insert with check (
    auth.uid() = reviewer_id
    and can_review(reviewer_id, reviewee_id, trip_id)
  );

-- No update, no delete (write-once; support handles exceptions)
```

RPCs `get_passenger_review_summary` and `get_driver_review_details` are declared `security definer` and perform their own access checks before returning data.

## 5. Aggregation

Chosen approach: **subquery inside the `profiles_public` view**. No triggers, no materialized view, no cache — recomputed per read.

The view is rewritten to:

```sql
create or replace view profiles_public
with (security_invoker = false) as
select
  p.id,
  p.full_name,
  p.avatar_url,
  (
    select coalesce(round(avg(r.rating)::numeric, 1), 0)
    from reviews r
    join trips t on t.id = r.trip_id
    where r.reviewee_id = p.id and t.driver_id = p.id
  ) as driver_rating_avg,
  (
    select count(*)
    from reviews r
    join trips t on t.id = r.trip_id
    where r.reviewee_id = p.id and t.driver_id = p.id
  ) as driver_rating_count
from profiles p
where p.deleted_at is null;
```

Rationale:

- MVP volume (hundreds of trips) — subqueries are cheap; indexes on `reviews(reviewee_id)` and `trips(driver_id)` make them constant-ish.
- No triggers means no drift recovery when a trigger fails silently.
- If volume forces a change later, swap to trigger-maintained columns on `profiles` — the view contract stays stable, consumers don't change.

The **passenger aggregate** deliberately is **not** exposed through `profiles_public`. It's returned only by `get_passenger_review_summary(user_id)`, gated on `has_booking_on_drivers_trip`.

**Display threshold:** when `driver_rating_count < 3`, the UI shows `"Nouveau conducteur"` instead of a rating. Prevents a single 1-star from dominating. Same rule for passenger side.

## 6. Server Actions

New file: `src/app/(main)/reviews/actions.ts`.

```ts
// All return ActionResult<T> — never throw.

submitReview({
  tripId: string,
  revieweeId: string,
  rating: 1|2|3|4|5,
  comment?: string  // max 1000 chars
}): Promise<ActionResult>

getPassengerReviewSummary(userId: string): Promise<ActionResult<{
  avg: number
  count: number
  recent: Array<{ id: string; rating: number; comment: string | null; reviewerDisplayName: string; createdAt: string }>  // up to 3 most recent, non-null comments only
}>>

getDriverReviewDetails(userId: string): Promise<ActionResult<{
  avg: number
  count: number
  recent: Array<{ id: string; rating: number; comment: string | null; reviewerDisplayName: string; createdAt: string }>  // up to 3 most recent, non-null comments only
}>>
```

- Zod validation (`safeParse`, never `parse`).
- `submitReview` does its own pre-insert eligibility checks via `can_review(...)` RPC for clean error messages, then inserts. On duplicate-unique violation, returns `"Vous avez déjà laissé un avis pour ce trajet."`.
- The two "get" actions re-check the relationship server-side before calling the RPC. Defense in depth.
- **Pseudonymization happens inside the Node Server Action**, not in the RPC — the RPC returns raw `full_name`, the action converts to `"<FirstName> <LastInitial>."` before returning to the client. Keeps the transform unit-testable and avoids SQL string gymnastics. The raw `full_name` is never passed to a Client Component.
- `revalidatePath('/dashboard')` after successful `submitReview`.

Validation schema: `src/lib/validations/review.schema.ts`.

```ts
export const submitReviewSchema = z.object({
  tripId: z.uuid(),
  revieweeId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().or(z.literal("")),
});
```

## 7. UI Touch Points

### 7.1 New components

- **`components/ui/StarRating.tsx`** — presentational + interactive variants. Uses lucide `Star` / `StarHalf`. Props:
  ```ts
  type StarRatingProps =
    | { mode: "display"; value: number; count?: number; size?: "sm" | "md" | "lg" }
    | { mode: "interactive"; value: number; onChange: (v: number) => void };
  ```
  Interactive variant drives the review form. Display variant is used in trip cards, trip detail, and on the dashboard.

- **`app/(main)/reviews/ReviewModal.tsx`** — client component, opened from the dashboard. Uses `react-hook-form` + `zodResolver(submitReviewSchema)`. 5-star interactive rating + optional comment textarea. Calls `submitReview`, closes modal on success, shows inline error string on failure. No new route — modal on top of `/dashboard`.

### 7.2 Modified components

- **`TripCard`** (`src/app/(main)/trips/components/TripCard.tsx`): add `<StarRating mode="display" value={driver_rating_avg} count={driver_rating_count} size="sm" />` next to driver name. Falls back to `"Nouveau conducteur"` pill if `count < 3`.
- **`/trips/[id]` driver block**: same aggregate display, medium size.
- **`DashboardTabs` → `DriverTripCard`**:
  - For each accepted passenger on a `completed` trip where the driver hasn't yet reviewed: "Laisser un avis" button → opens `ReviewModal` preseeded with `revieweeId = passenger.id`, `tripId = trip.id`.
  - For each pending or accepted booking: display passenger's aggregate rating (via `getPassengerReviewSummary`) next to the request row. Collapsible panel to show up to the 3 most recent comments.
- **`DashboardTabs` → `PassengerBookingCard`**:
  - For each `completed` trip's booking where the passenger hasn't yet reviewed: "Laisser un avis" button → `ReviewModal` with `revieweeId = trip.driver_id`.
  - For each `accepted` booking: driver aggregate + collapsible recent comments via `getDriverReviewDetails`.

### 7.3 What does *not* change

- Navbar, landing page, auth flow, booking actions, WhatsApp link flow — all untouched.
- `profiles_public` consumers continue to work unchanged; the view gains columns but preserves existing ones.

## 8. Defaults & Policy Choices

| Policy | Value | Rationale |
|---|---|---|
| Review window | 30 days post `departure_at` | Prevents indefinite moderation tail; long enough to cover the "I'll do it later" case |
| Edit window | none (write-once) | Ships fewer moving parts; support handles bad reviews |
| Delete | no user-facing path | Same as above |
| Display threshold | aggregate shown only when `count >= 3` | Avoids one review dominating display |
| Reviewer display | pseudonymized to `"Jean D."` (first name + last initial) server-side | Reduces PII leakage in review surfaces |
| Comment max length | 1000 chars | Soft ceiling for UI + DB |
| Self-review | blocked (CHECK + action-level) | |
| Review on cancelled/open trip | blocked (status must be `completed`) | |

## 9. Tests

New file: `src/app/(main)/reviews/actions.test.ts`. Vitest + the shared Supabase mock factory in `src/lib/test-utils/supabase-mock.ts`. Follows the existing French-error-message convention.

Covered cases:

- `submitReview` success: driver → passenger on completed trip with accepted booking.
- `submitReview` success: passenger → driver on completed trip with accepted booking.
- `submitReview` rejected: trip status is not `completed` → French error.
- `submitReview` rejected: no accepted booking linking reviewer and reviewee on that trip.
- `submitReview` rejected: `reviewer_id = reviewee_id`.
- `submitReview` rejected: duplicate (unique violation) → "Vous avez déjà laissé un avis pour ce trajet."
- `submitReview` rejected: trip departure > 30 days ago.
- `submitReview` rejected: zod validation fails (rating out of range, comment too long).
- `getPassengerReviewSummary`: returns empty when caller has no booking relationship; returns data when caller is a driver with the passenger on one of their trips.
- `getDriverReviewDetails`: returns empty before booking accepted; returns data after.
- Display-name pseudonymization: `"Jean Dupont"` → `"Jean D."`.

RLS smoke tests (optional, run only if the Supabase test helper is available in dev): verify insert as anon user fails, insert with mismatched `reviewer_id` fails.

## 10. Files Touched Summary

**Created**

- `supabase/migrations/20260424XXXXXX_create_reviews.sql` — table, indexes, helpers, RPCs, view rewrite.
- `src/app/(main)/reviews/actions.ts`
- `src/app/(main)/reviews/actions.test.ts`
- `src/app/(main)/reviews/ReviewModal.tsx`
- `src/lib/validations/review.schema.ts`
- `src/components/ui/StarRating.tsx`

**Modified**

- `src/app/(main)/trips/components/TripCard.tsx` — add rating badge
- `src/app/(main)/trips/[id]/page.tsx` and driver block — add rating
- `src/app/(main)/dashboard/DriverTripCard.tsx` — review CTA + passenger rating surface
- `src/app/(main)/dashboard/PassengerBookingCard.tsx` — review CTA + driver rating surface
- `src/types/database.types.ts` — append `reviews` row type, `ReviewRow`, extended `profiles_public` shape (hand-maintained narrowing block per existing pattern)
- `project.md` — update "Current State" and the schema section

## 11. Open risks / deferred decisions

- **Reputation gaming via cancel-and-rebook.** Unique is `(reviewer_id, reviewee_id, trip_id)`, so the same pair could theoretically accumulate many reviews across many trips together. Acceptable — it reflects reality (frequent carpooler pairs should be able to keep reviewing).
- **A 1-star review on a "Nouveau conducteur".** Until count ≥ 3, aggregate is hidden. But the 1-star still counts. If someone's first trip goes badly and they never drive again, the review is invisible to anyone. Acceptable: this user isn't coming back, and hiding it also protects them from piling on.
- **Passenger aggregate visible to the driver on *pending* bookings.** Means a driver can decline based on rating. That's the intended signal; it's also a bias surface. Documented here; no mitigation planned for MVP.
- **Storage size.** 1 KB per review × unbounded rows. Trivially fine for years of MVP volume.
- **If `profiles_public` is consumed by other features later** (e.g. trip search returning driver info), the added aggregate columns travel along implicitly. Verified against current consumers in §7.3.
