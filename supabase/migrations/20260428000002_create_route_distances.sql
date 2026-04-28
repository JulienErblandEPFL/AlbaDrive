-- ============================================================
-- MIGRATION 006: route_distances
-- Cache of OpenRouteService driving-distance lookups keyed on
-- canonical city labels from src/lib/constants/cities.ts.
--
-- Asymmetry trade-off: real-world driving distance can differ
-- by 0.5–1% between A→B and B→A (one-ways, ferries). For our
-- corridor we accept that error in exchange for halving cache
-- misses — one ORS call writes both directions.
-- ============================================================
CREATE TABLE public.route_distances (
  origin_label      TEXT         NOT NULL,
  destination_label TEXT         NOT NULL,
  distance_km       NUMERIC(7,2) NOT NULL CHECK (distance_km > 0),
  duration_seconds  INTEGER      CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  source            TEXT         NOT NULL CHECK (source IN ('ors', 'haversine_fallback')),
  fetched_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (origin_label, destination_label)
);

ALTER TABLE public.route_distances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "route_distances_select_authenticated"
  ON public.route_distances FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.route_distances TO authenticated;
-- No INSERT/UPDATE/DELETE policy — service-role only.
