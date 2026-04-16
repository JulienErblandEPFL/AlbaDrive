-- ============================================================
-- MIGRATION 003: bookings + cross-table RLS + helpers
--
-- This migration finalises the entire RLS model.
-- Cross-table policies (profiles ↔ bookings ↔ trips) are defined
-- HERE — after all tables exist — using SECURITY DEFINER helpers
-- to avoid infinite recursion in RLS evaluation.
--
-- Booking statuses:
--   pending      → driver has not yet responded
--   accepted     → driver accepted; WhatsApp link unlocked for BOTH parties
--   declined     → driver declined (or auto-declined when trip is full)
--   cancelled    → passenger cancelled their own booking
--   trip_cancelled → driver cancelled the trip (set by trigger in migration 002)
-- ============================================================

-- ============================================================
-- TABLE: bookings
-- ============================================================
CREATE TABLE public.bookings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id           UUID        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  passenger_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seats_requested   SMALLINT    NOT NULL DEFAULT 1 CHECK (seats_requested >= 1),
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN (
                                  'pending', 'accepted', 'declined',
                                  'cancelled', 'trip_cancelled'
                                )),
  passenger_message TEXT,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent a passenger from booking the same trip twice (active bookings only)
CREATE UNIQUE INDEX bookings_no_duplicate_active_idx
  ON public.bookings (trip_id, passenger_id)
  WHERE status NOT IN ('cancelled', 'trip_cancelled', 'declined')
    AND deleted_at IS NULL;

-- Driver's booking list (via trip_id lookup)
CREATE INDEX bookings_trip_idx
  ON public.bookings (trip_id)
  WHERE deleted_at IS NULL;

-- Passenger's booking history
CREATE INDEX bookings_passenger_idx
  ON public.bookings (passenger_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER bookings_set_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TRIGGER: on_booking_accepted
-- Atomically decrements available_seats.
-- If seats reach 0: marks trip 'full' AND auto-declines all
-- other pending bookings on that trip.
-- The CHECK (available_seats >= 0) acts as a DB-level safety net
-- against over-booking if the Server Action check somehow fails.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_booking_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_available SMALLINT;
BEGIN
  -- Decrement atomically and capture new seat count in one statement
  UPDATE public.trips
  SET
    available_seats = available_seats - NEW.seats_requested,
    updated_at      = NOW()
  WHERE id = NEW.trip_id
  RETURNING available_seats INTO v_new_available;

  -- If the trip is now full, update status and auto-decline pending bookings
  IF v_new_available = 0 THEN
    UPDATE public.trips
    SET status = 'full', updated_at = NOW()
    WHERE id = NEW.trip_id;

    UPDATE public.bookings
    SET
      status     = 'declined',
      updated_at = NOW()
    WHERE trip_id    = NEW.trip_id
      AND id         != NEW.id
      AND status     = 'pending'
      AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_booking_accepted
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status = 'accepted')
  EXECUTE FUNCTION public.handle_booking_accepted();

-- ============================================================
-- TRIGGER: on_booking_seat_return
-- When a passenger cancels an ACCEPTED booking, their seats
-- are returned to the trip. If the trip was 'full', it re-opens.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_booking_seat_return()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.trips
  SET
    available_seats = LEAST(available_seats + OLD.seats_requested, total_seats),
    -- Re-open only if the trip was full (not if it's cancelled/completed)
    status          = CASE
                        WHEN status = 'full' THEN 'open'
                        ELSE status
                      END,
    updated_at      = NOW()
  WHERE id     = OLD.trip_id
    AND status NOT IN ('cancelled', 'completed');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_booking_seat_return
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status = 'accepted' AND NEW.status = 'cancelled')
  EXECUTE FUNCTION public.handle_booking_seat_return();

-- ============================================================
-- SECURITY DEFINER HELPER FUNCTIONS
-- These bypass RLS intentionally to avoid infinite recursion
-- when cross-table policies reference each other.
-- Each function is narrowly scoped to a single boolean check.
-- ============================================================

-- Is the current user the driver of a given trip?
CREATE OR REPLACE FUNCTION public.is_trip_driver(p_trip_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips
    WHERE id        = p_trip_id
      AND driver_id = auth.uid()
      AND deleted_at IS NULL
  );
$$;

-- Does the current user have any booking on a given trip?
CREATE OR REPLACE FUNCTION public.is_trip_passenger(p_trip_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE trip_id      = p_trip_id
      AND passenger_id = auth.uid()
      AND deleted_at   IS NULL
  );
$$;

-- CRITICAL PRIVACY CHECK:
-- Does the current user share an ACCEPTED booking with a given profile?
-- Used to unlock phone number access for WhatsApp link generation.
-- Both directions are checked (driver ↔ passenger).
CREATE OR REPLACE FUNCTION public.has_accepted_booking_with(p_profile_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    INNER JOIN public.trips t ON t.id = b.trip_id
    WHERE b.status     = 'accepted'
      AND b.deleted_at IS NULL
      AND t.deleted_at IS NULL
      AND (
        -- Current user is the passenger, other party is the driver
        (b.passenger_id = auth.uid() AND t.driver_id = p_profile_id)
        OR
        -- Current user is the driver, other party is the passenger
        (t.driver_id = auth.uid() AND b.passenger_id = p_profile_id)
      )
  );
$$;

-- ============================================================
-- CROSS-TABLE RLS: profiles
-- Added here (not in migration 001) because the helper function
-- depends on bookings and trips both existing.
-- ============================================================

-- CRITICAL PRIVACY RULE:
-- A user can read another user's full profile (including phone) ONLY IF
-- they share an accepted booking — as driver or as passenger.
-- This is the gatekeeper for WhatsApp link generation.
CREATE POLICY "profiles_select_accepted_booking_party"
  ON public.profiles FOR SELECT
  USING (
    deleted_at IS NULL
    AND id != auth.uid()
    AND public.has_accepted_booking_with(id)
  );

-- ============================================================
-- CROSS-TABLE RLS: trips
-- A passenger can view a trip they have a booking on (any status),
-- so they can track updates (e.g. trip_cancelled).
-- ============================================================
CREATE POLICY "trips_select_booked_passenger"
  ON public.trips FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.is_trip_passenger(id)
  );

-- ============================================================
-- ROW LEVEL SECURITY: bookings
-- ============================================================
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- A passenger can view their own bookings
CREATE POLICY "bookings_select_passenger"
  ON public.bookings FOR SELECT
  USING (passenger_id = auth.uid() AND deleted_at IS NULL);

-- A driver can view all bookings on their trips
-- Uses helper to avoid bookings → trips → bookings infinite recursion
CREATE POLICY "bookings_select_driver"
  ON public.bookings FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.is_trip_driver(trip_id)
  );

-- A passenger can create a booking (passenger_id must equal their uid)
CREATE POLICY "bookings_insert_passenger"
  ON public.bookings FOR INSERT
  WITH CHECK (passenger_id = auth.uid());

-- A passenger can update only their own booking (to cancel)
CREATE POLICY "bookings_update_passenger"
  ON public.bookings FOR UPDATE
  USING  (passenger_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (passenger_id = auth.uid());

-- A driver can update bookings on their trips (accept / decline)
CREATE POLICY "bookings_update_driver"
  ON public.bookings FOR UPDATE
  USING (
    deleted_at IS NULL
    AND public.is_trip_driver(trip_id)
  );
