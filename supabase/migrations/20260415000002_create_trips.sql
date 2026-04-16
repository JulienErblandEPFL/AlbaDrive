-- ============================================================
-- MIGRATION 002: trips
-- A trip published by a driver on the Europe–Balkans corridor.
--
-- Location stored as JSONB: { label, lat, lng, place_id }
-- Validated at application level via Nominatim + Zod.
--
-- Statuses: open → full | cancelled | completed
-- ============================================================

CREATE TABLE public.trips (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Geocoded location from Nominatim OSM
  -- Shape: { "label": "Genève, Suisse", "lat": 46.2044, "lng": 6.1432, "place_id": "node/123" }
  origin              JSONB        NOT NULL,
  destination         JSONB        NOT NULL,

  departure_at        TIMESTAMPTZ  NOT NULL,
  total_seats         SMALLINT     NOT NULL CHECK (total_seats >= 1 AND total_seats <= 9),
  available_seats     SMALLINT     NOT NULL CHECK (available_seats >= 0),
  price_per_seat      NUMERIC(8,2) CHECK (price_per_seat >= 0),
  vehicle_description TEXT,
  notes               TEXT,
  status              TEXT         NOT NULL DEFAULT 'open'
                                   CHECK (status IN ('open', 'full', 'cancelled', 'completed')),
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT trips_available_lte_total CHECK (available_seats <= total_seats)
);

-- Search index: case-insensitive match on origin/destination label
CREATE INDEX trips_origin_label_idx
  ON public.trips ((lower(origin->>'label')))
  WHERE deleted_at IS NULL;

CREATE INDEX trips_destination_label_idx
  ON public.trips ((lower(destination->>'label')))
  WHERE deleted_at IS NULL;

-- Browse index: sorted by upcoming departure
CREATE INDEX trips_departure_idx
  ON public.trips (departure_at ASC)
  WHERE deleted_at IS NULL AND status IN ('open', 'full');

-- Driver's trip list
CREATE INDEX trips_driver_idx
  ON public.trips (driver_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trips_set_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TRIGGER: on_trip_cancelled
-- When a driver cancels a trip, all pending/accepted bookings
-- are automatically set to 'trip_cancelled' (distinct from a
-- passenger-initiated 'cancelled', per Q1 decision).
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_trip_cancelled()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.bookings
  SET
    status     = 'trip_cancelled',
    updated_at = NOW()
  WHERE trip_id    = NEW.id
    AND status     IN ('pending', 'accepted')
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_trip_cancelled
  AFTER UPDATE ON public.trips
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled')
  EXECUTE FUNCTION public.handle_trip_cancelled();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- Anyone can browse open/full non-deleted trips
CREATE POLICY "trips_select_public"
  ON public.trips FOR SELECT
  USING (
    deleted_at IS NULL
    AND status IN ('open', 'full')
  );

-- A driver can always see all their own trips (including cancelled/completed)
CREATE POLICY "trips_select_own_driver"
  ON public.trips FOR SELECT
  USING (
    deleted_at IS NULL
    AND driver_id = auth.uid()
  );

-- CROSS-TABLE POLICY — added in migration 003 after helper functions exist:
-- "trips_select_booked_passenger"

-- Only the authenticated driver can insert a trip under their own id
CREATE POLICY "trips_insert_driver"
  ON public.trips FOR INSERT
  WITH CHECK (auth.uid() = driver_id);

-- Only the driver can update their own non-deleted trip
CREATE POLICY "trips_update_driver"
  ON public.trips FOR UPDATE
  USING  (auth.uid() = driver_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = driver_id);
