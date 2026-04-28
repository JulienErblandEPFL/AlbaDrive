// Resolves the current per-passenger cost-sharing rate (chf/km) for a
// driver's country via the SECURITY DEFINER RPC `current_fuel_price`.
// Returns `null` when the RPC has no row for the country (e.g. an
// unsupported jurisdiction). Defensive: also returns `null` on RPC error.
import { createServerClient } from "@/lib/supabase/server";
import type { PricingCurrency } from "./types";

export async function getFuelPrice(
  countryCode: string,
): Promise<{ chfPerKm: number; currency: PricingCurrency; source: "db" } | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("current_fuel_price", {
    p_country_code: countryCode,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.chf_per_km == null) return null;
  return {
    chfPerKm: Number(row.chf_per_km),
    currency: row.currency as PricingCurrency,
    source: "db",
  };
}
