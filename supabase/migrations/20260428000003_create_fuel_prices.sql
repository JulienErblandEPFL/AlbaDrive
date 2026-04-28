-- ============================================================
-- MIGRATION 007: fuel_prices
-- Per-country per-passenger cost-sharing rate. Phase 1 ships
-- hardcoded seed values; a scheduled refresh job is deferred.
--
-- Formula:
--   chf_per_km = pump_chf_per_l × consumption_l_per_100km / 100
--                × passenger_share_factor (0.50)
--
-- Semantics: the resulting chf_per_km is what ONE PASSENGER
-- contributes per km of road distance. Aligns with Blablacar's
-- per-passenger model and the per-pax legal ceilings cited in
-- the April 2026 legal analysis (FR 0.20 €/km/pax, AT 0.15 €/km/pax).
--
-- The `currency` column documents the natural jurisdiction
-- currency for future-proofing. Phase 1 always displays CHF in
-- the UI regardless of this value.
-- ============================================================
CREATE TABLE public.fuel_prices (
  country_code   TEXT         NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  chf_per_km     NUMERIC(6,4) NOT NULL CHECK (chf_per_km > 0 AND chf_per_km < 1),
  currency       TEXT         NOT NULL DEFAULT 'CHF'
                              CHECK (currency IN ('CHF', 'EUR')),
  source         TEXT         NOT NULL,
  effective_from DATE         NOT NULL,
  notes          TEXT,
  PRIMARY KEY (country_code, effective_from)
);

ALTER TABLE public.fuel_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_prices_select_authenticated"
  ON public.fuel_prices FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.fuel_prices TO authenticated;

CREATE OR REPLACE FUNCTION public.current_fuel_price(p_country_code TEXT)
RETURNS TABLE (chf_per_km NUMERIC, currency TEXT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT chf_per_km, currency
    FROM public.fuel_prices
   WHERE country_code = p_country_code
     AND effective_from <= CURRENT_DATE
   ORDER BY effective_from DESC
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.current_fuel_price(TEXT) TO authenticated;

-- ============================================================
-- SEED — 2026-Q1 values
-- Formula: pump_chf_per_l × C/100 × 0.50; C is country-specific
-- to reflect fleet age (see plan).
-- ============================================================
INSERT INTO public.fuel_prices
  (country_code, chf_per_km, currency, source, effective_from, notes) VALUES
  ('CH', 0.0629, 'CHF', 'TCS Carburant Indikator (SP95) 2026-Q1 mean 1.85 CHF/L',
        '2026-01-01', 'C=6.8 L/100km, modern post-WLTP fleet'),
  ('DE', 0.0564, 'EUR', 'ADAC Spritpreismonitor (E10) 2026-Q1 mean 1.75 EUR/L @ EUR/CHF 0.95',
        '2026-01-01', 'C=6.8 L/100km'),
  ('FR', 0.0598, 'EUR', 'DGEC bulletin pétrolier hebdomadaire (SP95-E10) 2026-Q1 mean 1.85 EUR/L @ EUR/CHF 0.95',
        '2026-01-01', 'C=6.8 L/100km'),
  ('IT', 0.0616, 'EUR', 'MISE Osservatorio prezzi carburanti (benzina) 2026-Q1 mean 1.85 EUR/L @ EUR/CHF 0.95',
        '2026-01-01', 'C=7.0 L/100km, slightly older fleet + SUV mix'),
  ('AT', 0.0500, 'EUR', 'ÖAMTC Spritpreisrechner (Super 95) 2026-Q1 mean 1.55 EUR/L @ EUR/CHF 0.95',
        '2026-01-01', 'C=6.8 L/100km'),
  ('BE', 0.0564, 'EUR', 'SPF Économie maximumprijzen (Eurosuper 95) 2026-Q1 mean 1.75 EUR/L @ EUR/CHF 0.95',
        '2026-01-01', 'C=6.8 L/100km'),
  ('AL', 0.0712, 'EUR', 'globalpetrolprices.com Albania 2026-Q1 mean 200 ALL/L (~1.90 EUR-equiv); cross-check vs. APR weekly bulletin pre-merge',
        '2026-01-01', 'C=7.5 L/100km, older diaspora fleet'),
  ('XK', 0.0473, 'EUR', 'globalpetrolprices.com Kosovo 2026-Q1 mean 1.33 EUR/L (Kosovo retail EUR-quoted)',
        '2026-01-01', 'C=7.5 L/100km'),
  ('MK', 0.0488, 'EUR', 'RKE (Regulatory Commission for Energy and Water Services) 2026-Q1 weekly mean 80 MKD/L',
        '2026-01-01', 'C=7.5 L/100km'),
  ('RS', 0.0619, 'EUR', 'globalpetrolprices.com Serbia 2026-Q1 mean 200 RSD/L',
        '2026-01-01', 'C=7.5 L/100km');
