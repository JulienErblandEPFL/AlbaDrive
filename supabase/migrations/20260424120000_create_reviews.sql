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
