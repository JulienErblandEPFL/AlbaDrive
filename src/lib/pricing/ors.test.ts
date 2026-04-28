import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fetchOrsDistance,
  OrsConfigError,
  OrsRateLimitError,
  OrsResponseError,
  OrsTimeoutError,
} from "./ors";

const munich = { lat: 48.1351, lng: 11.582 };
const augsburg = { lat: 48.3717, lng: 10.8983 };

describe("fetchOrsDistance", () => {
  beforeEach(() => {
    vi.stubEnv("ORS_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns parsed distance and duration on success", async () => {
    (fetch as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          features: [
            { properties: { summary: { distance: 57000, duration: 2400 } } },
          ],
        }),
    });
    const r = await fetchOrsDistance(munich, augsburg);
    expect(r).toEqual({ km: 57, durationSeconds: 2400 });
  });

  it("throws OrsConfigError when ORS_API_KEY is missing", async () => {
    vi.stubEnv("ORS_API_KEY", "");
    await expect(fetchOrsDistance(munich, augsburg)).rejects.toThrow(
      OrsConfigError,
    );
  });

  it("throws OrsRateLimitError on 429", async () => {
    (fetch as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      ok: false,
      status: 429,
    });
    await expect(fetchOrsDistance(munich, augsburg)).rejects.toThrow(
      OrsRateLimitError,
    );
  });

  it("throws OrsResponseError on other 4xx/5xx", async () => {
    (fetch as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      ok: false,
      status: 503,
    });
    await expect(fetchOrsDistance(munich, augsburg)).rejects.toThrow(
      OrsResponseError,
    );
  });

  it("throws OrsTimeoutError when fetch is aborted", async () => {
    (
      fetch as unknown as { mockImplementation: (fn: unknown) => void }
    ).mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_, reject) => {
        init.signal!.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    });
    vi.useFakeTimers();
    const promise = fetchOrsDistance(munich, augsburg);
    vi.advanceTimersByTime(3001);
    await expect(promise).rejects.toThrow(OrsTimeoutError);
    vi.useRealTimers();
  });

  it("rejects responses with implausibly high distances", async () => {
    // 5000km between Munich and Augsburg = clearly bad routing
    (fetch as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          features: [
            {
              properties: {
                summary: { distance: 5000000, duration: 180000 },
              },
            },
          ],
        }),
    });
    await expect(fetchOrsDistance(munich, augsburg)).rejects.toThrow(
      OrsResponseError,
    );
  });
});
