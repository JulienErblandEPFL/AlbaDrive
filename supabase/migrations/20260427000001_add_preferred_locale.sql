-- ============================================================
-- MIGRATION: profiles.preferred_locale
-- Per-user UI language preference. Persists across devices so a
-- returning user lands in the same language they last selected,
-- regardless of browser cookies.
--
-- - Nullable: existing rows are unaffected, no backfill needed.
-- - CHECK enforces the 4-locale set the application supports.
-- - The cookie (NEXT_LOCALE) remains the request-time source of
--   truth; this column is the cross-device persistence layer
--   read on sign-in to seed the cookie.
-- - The existing `profiles_update_own` policy already covers
--   updates of this column.
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN preferred_locale TEXT
    CHECK (preferred_locale IN ('fr', 'en', 'de', 'sq'));
