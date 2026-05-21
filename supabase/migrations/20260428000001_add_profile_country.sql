-- ============================================================
-- MIGRATION 005: profiles.country
-- Optional ISO 3166-1 alpha-2 code identifying the driver's
-- home country. Used by the price-suggestion helper to pick the
-- correct fuel cost-sharing rate. Nullable: existing users keep
-- NULL and the suggestion logic falls back to the trip's origin
-- country.
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN country TEXT
    CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
