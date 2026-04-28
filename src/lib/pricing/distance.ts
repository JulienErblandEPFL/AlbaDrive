// Cache layer: reads from public.route_distances; on miss, calls ORS;
// on ORS failure, falls back to haversineKm × HAVERSINE_ROAD_FACTOR.
// Writes BOTH directions on first fetch (one ORS call → two cache rows).
//
// Asymmetry note: real-world driving distance can differ ~0.5–1% between
// A→B and B→A (one-ways, ferries). For the Europe ↔ Balkans corridor we
// accept that error in exchange for halving cache misses.

import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { findCity } from "@/lib/constants/cities";
import { haversineKm } from "@/lib/geo";
import {
  fetchOrsDistance,
  OrsConfigError,
  OrsRateLimitError,
  OrsResponseError,
  OrsTimeoutError,
} from "./ors";
import { HAVERSINE_ROAD_FACTOR } from "./config";
import type { RouteDistance } from "./types";

function isOrsError(err: unknown): boolean {
  return (
    err instanceof OrsConfigError ||
    err instanceof OrsRateLimitError ||
    err instanceof OrsResponseError ||
    err instanceof OrsTimeoutError
  );
}

function serviceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function getRouteDistance(
  originLabel: string,
  destinationLabel: string,
): Promise<RouteDistance> {
  // 1. Cache lookup
  const sb = await createServerClient();
  const cached = await sb
    .from("route_distances")
    .select("distance_km, duration_seconds, source")
    .eq("origin_label", originLabel)
    .eq("destination_label", destinationLabel)
    .maybeSingle();

  if (cached.data) {
    return {
      km: Number(cached.data.distance_km),
      durationSeconds: cached.data.duration_seconds ?? null,
      source: cached.data.source as RouteDistance["source"],
    };
  }

  // 2. Resolve coords
  const origin = findCity(originLabel);
  const destination = findCity(destinationLabel);
  if (!origin || !destination) {
    return { km: 0, durationSeconds: null, source: "haversine_fallback" };
  }

  // 3. Try ORS
  let result: RouteDistance;
  try {
    const ors = await fetchOrsDistance(origin, destination);
    result = {
      km: ors.km,
      durationSeconds: ors.durationSeconds,
      source: "ors",
    };
  } catch (err) {
    if (!isOrsError(err)) throw err;
    const km = haversineKm(origin, destination) * HAVERSINE_ROAD_FACTOR;
    result = { km, durationSeconds: null, source: "haversine_fallback" };
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        "[pricing] ORS unavailable, fell back:",
        (err as Error).message,
      );
    }
  }

  // 4. Write both directions to cache (best-effort, never block)
  try {
    const writer = serviceRoleClient();
    await writer.from("route_distances").upsert(
      [
        {
          origin_label: originLabel,
          destination_label: destinationLabel,
          distance_km: result.km,
          duration_seconds: result.durationSeconds,
          source: result.source,
        },
        {
          origin_label: destinationLabel,
          destination_label: originLabel,
          distance_km: result.km,
          duration_seconds: result.durationSeconds,
          source: result.source,
        },
      ],
      { onConflict: "origin_label,destination_label" },
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        "[pricing] route_distances cache write failed:",
        (err as Error).message,
      );
    }
  }

  return result;
}
