-- ============================================================
-- MIGRATION 001: profiles
-- Extends auth.users with public user data.
-- CRITICAL: phone is E.164, NEVER exposed via profiles_public view.
-- ============================================================

-- ============================================================
-- SHARED UTILITY: set_updated_at()
-- Reused by all tables. Defined here first.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- TABLE: profiles
-- ============================================================
CREATE TABLE public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT        NOT NULL CHECK (length(trim(full_name)) >= 2),
  -- E.164 enforced at DB level. Application must also validate with Zod.
  phone      TEXT        NOT NULL CHECK (phone ~ '^\+[1-9]\d{6,14}$'),
  avatar_url TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One phone number per active (non-deleted) user
CREATE UNIQUE INDEX profiles_phone_unique_idx
  ON public.profiles (phone)
  WHERE deleted_at IS NULL;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- PUBLIC VIEW: profiles_public
-- Safe for trip listings and any non-sensitive display.
-- The `phone` column is INTENTIONALLY excluded.
-- Runs as SECURITY DEFINER (postgres owner) so it bypasses
-- the profiles RLS — this is correct since it exposes no PII.
-- ============================================================
CREATE VIEW public.profiles_public AS
  SELECT id, full_name, avatar_url
  FROM public.profiles
  WHERE deleted_at IS NULL;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- A user can read their own full profile (including phone)
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id AND deleted_at IS NULL);

-- CROSS-TABLE POLICY — added in migration 003 after helper functions exist:
-- "profiles_select_accepted_booking_party"

-- A user can only create their own profile row
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- A user can only update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING  (auth.uid() = id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = id);
