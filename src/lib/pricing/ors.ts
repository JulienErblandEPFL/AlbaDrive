// OpenRouteService Directions v2 client. Wraps fetch with:
//   - 3s timeout via AbortController (config: ORS_TIMEOUT_MS)
//   - typed error classes for caller branching
//   - sanity check vs. Haversine: rejects implausible distances
//     (e.g. ORS returns a Russia-routed path due to a bad coord)
//
// The API key lives in process.env.ORS_API_KEY — never sent to the client.
import { ORS_TIMEOUT_MS } from "./config";
import { haversineKm } from "@/lib/geo";

const ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car";
const SANITY_FACTOR = 2.0; // ORS distance must not exceed 2× Haversine

export class OrsConfigError extends Error {
  constructor() {
    super("ORS_API_KEY missing");
  }
}
export class OrsRateLimitError extends Error {
  constructor() {
    super("ORS rate limit");
  }
}
export class OrsResponseError extends Error {
  constructor(
    public status: number,
    message?: string,
  ) {
    super(message ?? `ORS HTTP ${status}`);
  }
}
export class OrsTimeoutError extends Error {
  constructor() {
    super("ORS timeout");
  }
}

type LatLng = { lat: number; lng: number };

export async function fetchOrsDistance(
  origin: LatLng,
  destination: LatLng,
): Promise<{ km: number; durationSeconds: number }> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) throw new OrsConfigError();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ORS_TIMEOUT_MS);
  try {
    const url =
      `${ORS_URL}?api_key=${apiKey}` +
      `&start=${origin.lng},${origin.lat}&end=${destination.lng},${destination.lat}`;
    const res = await fetch(url, { signal: ctrl.signal }).catch(
      (err: unknown) => {
        const name = (err as { name?: string } | null)?.name;
        const message = (err as { message?: string } | null)?.message;
        if (name === "AbortError") throw new OrsTimeoutError();
        throw new OrsResponseError(0, message);
      },
    );
    if (res.status === 429) throw new OrsRateLimitError();
    if (!res.ok) throw new OrsResponseError(res.status);

    const json = await res.json();
    const summary = json?.features?.[0]?.properties?.summary;
    if (!summary || typeof summary.distance !== "number") {
      throw new OrsResponseError(res.status, "ORS response shape unexpected");
    }
    const km = summary.distance / 1000;
    const sanityKm = haversineKm(origin, destination);
    if (km > sanityKm * SANITY_FACTOR) {
      throw new OrsResponseError(
        res.status,
        `ORS sanity check failed: ${km}km vs ${sanityKm}km haversine`,
      );
    }
    return { km, durationSeconds: Math.round(summary.duration ?? 0) };
  } finally {
    clearTimeout(timer);
  }
}
