import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock image-urls so prefetchUrl/getCarouselImageUrl return deterministic
// URLs in the test environment (imgproxy is disabled in Node).
vi.mock("@/lib/image-urls", () => ({
  getFullImageUrl: (image: { id: string }) => `https://test/full/${image.id}`,
  getThumbnailUrl: (image: { id: string }) => `https://test/thumb/${image.id}`,
}));

// Provide a minimal DOM Image constructor for Node environment.
// The real Image is a browser global; we just need .src, .decode(), .onload.
if (typeof globalThis.Image === "undefined") {
  (globalThis as Record<string, unknown>).Image = class MockImage {
    src = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    decode() {
      return Promise.resolve();
    }
  };
}

import {
  computeCadence,
  prefetchNearbyImages,
  getPrefetchStats,
  __resetPrefetchForTests,
} from "./image-prefetch";
import type { Image } from "@/types/image";

// ---------------------------------------------------------------------------
// computeCadence — EMA smoothing (weight 0.4 on new interval)
// ---------------------------------------------------------------------------

describe("computeCadence", () => {
  it("seeds from the first interval when prevCadence is null", () => {
    expect(computeCadence(null, 200)).toBe(200);
  });

  it("applies EMA: 0.6 × prev + 0.4 × new", () => {
    // prev=200, new=100 → 200*0.6 + 100*0.4 = 120+40 = 160
    expect(computeCadence(200, 100)).toBe(160);
  });

  it("converges toward a steady interval", () => {
    let cadence = computeCadence(null, 300); // seed: 300
    // Feed a steady 200ms stream
    for (let i = 0; i < 20; i++) {
      cadence = computeCadence(cadence, 200);
    }
    // After 20 steps at 200ms, should be very close to 200
    expect(cadence).toBeCloseTo(200, 1);
  });

  it("responds to a sudden speed change", () => {
    // Stable at 400ms
    let cadence = 400;
    // Burst at 150ms × 5
    for (let i = 0; i < 5; i++) {
      cadence = computeCadence(cadence, 150);
    }
    // After 5 steps: should be well below 300 (responsive, not sluggish)
    expect(cadence).toBeLessThan(250);
    // But not instantly at 150 (smoothing prevents overshoot)
    expect(cadence).toBeGreaterThan(150);
  });

  it("handles zero interval (simultaneous calls)", () => {
    expect(computeCadence(200, 0)).toBe(120); // 200*0.6 + 0*0.4
  });

  it("handles very large intervals", () => {
    const result = computeCadence(200, 10_000);
    // 200*0.6 + 10000*0.4 = 120 + 4000 = 4120
    expect(result).toBe(4120);
  });
});

// ---------------------------------------------------------------------------
// Helpers for session tests
// ---------------------------------------------------------------------------

/** Minimal Image stub with just enough for prefetch (id + source dimensions). */
function makeImage(id: string): Image {
  return {
    id,
    source: {
      uri: `https://example.com/${id}.jpg`,
      mimeType: "image/jpeg",
      dimensions: { width: 4000, height: 3000 },
    },
    metadata: {},
    usageRights: { category: "handout" },
  } as unknown as Image;
}

/** Build a results buffer of N sequential images. */
function makeResults(n: number): Image[] {
  return Array.from({ length: n }, (_, i) => makeImage(`img-${i}`));
}

// ---------------------------------------------------------------------------
// Traversal session — open/close, inFlight tracking, cancellation
// ---------------------------------------------------------------------------

describe("prefetchNearbyImages — session behaviour", () => {
  beforeEach(() => {
    __resetPrefetchForTests();
  });

  it("opens a session on first call", () => {
    const results = makeResults(10);
    expect(getPrefetchStats().sessionOpen).toBe(false);

    prefetchNearbyImages(5, results, "forward");

    expect(getPrefetchStats().sessionOpen).toBe(true);
  });

  it("tracks in-flight requests (not unbounded)", () => {
    const results = makeResults(20);

    // Call from different positions in sequence
    for (let i = 5; i < 15; i++) {
      prefetchNearbyImages(i, results, "forward");
    }

    const stats = getPrefetchStats();
    // In-flight should be bounded by the radius (4 ahead + 1 behind = 5 max),
    // not growing with each call. Some may have been cancelled or loaded.
    expect(stats.inFlightCount).toBeLessThanOrEqual(5);
  });

  it("cancels in-flight requests that leave the radius", () => {
    const results = makeResults(20);

    // Start at position 5 — prefetches images 6,7,8,9,4
    prefetchNearbyImages(5, results, "forward");
    const afterFirst = getPrefetchStats();
    expect(afterFirst.inFlightCount).toBeGreaterThan(0);

    // Jump to position 15 — images 6-9 should be cancelled
    prefetchNearbyImages(15, results, "forward");
    const afterJump = getPrefetchStats();
    expect(afterJump.lastCancelledCount).toBeGreaterThan(0);
  });

  it("does not re-issue requests for images already in-flight", () => {
    const results = makeResults(10);

    // Two calls at the same position — second call may use sparse radius
    // (fast cadence) but should not create duplicate in-flight entries
    // for the same image IDs.
    prefetchNearbyImages(5, results, "forward");
    const first = getPrefetchStats().inFlightCount;

    prefetchNearbyImages(5, results, "forward");
    const second = getPrefetchStats().inFlightCount;

    // Second call may have fewer (sparse radius due to fast cadence) but
    // should never exceed the first (no duplicates created).
    expect(second).toBeLessThanOrEqual(first);
  });

  it("handles edge positions (start of buffer)", () => {
    const results = makeResults(10);
    prefetchNearbyImages(0, results, "forward");

    const stats = getPrefetchStats();
    // At index 0 forward: can prefetch 1,2,3,4 ahead + nothing behind
    expect(stats.inFlightCount).toBeLessThanOrEqual(4);
    expect(stats.sessionOpen).toBe(true);
  });

  it("handles edge positions (end of buffer)", () => {
    const results = makeResults(10);
    prefetchNearbyImages(9, results, "backward");

    const stats = getPrefetchStats();
    // At index 9 backward: can prefetch 8,7,6,5 + nothing behind (no index 10)
    expect(stats.inFlightCount).toBeLessThanOrEqual(4);
    expect(stats.sessionOpen).toBe(true);
  });

  it("rejects invalid indices", () => {
    const results = makeResults(10);

    prefetchNearbyImages(-1, results, "forward");
    expect(getPrefetchStats().sessionOpen).toBe(false);

    prefetchNearbyImages(10, results, "forward");
    expect(getPrefetchStats().sessionOpen).toBe(false);
  });

  it("__resetPrefetchForTests clears everything", () => {
    const results = makeResults(10);
    prefetchNearbyImages(5, results, "forward");
    expect(getPrefetchStats().sessionOpen).toBe(true);

    __resetPrefetchForTests();
    expect(getPrefetchStats().sessionOpen).toBe(false);
    expect(getPrefetchStats().inFlightCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Session 3 — Cadence-aware radius skipping + post-burst debounce
// ---------------------------------------------------------------------------

describe("prefetchNearbyImages — cadence-aware behaviour", () => {
  let mockNow: number;

  beforeEach(() => {
    __resetPrefetchForTests();
    mockNow = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => mockNow);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports isFastBurst=false on first call (no cadence yet)", () => {
    const results = makeResults(20);
    prefetchNearbyImages(10, results, "forward");
    expect(getPrefetchStats().isFastBurst).toBe(false);
  });

  it("reports isFastBurst=true after rapid calls", () => {
    const results = makeResults(20);

    // First call seeds cadence
    prefetchNearbyImages(10, results, "forward");
    // Rapid calls at 100ms intervals (well below 350ms threshold)
    for (let i = 11; i <= 15; i++) {
      mockNow += 100;
      prefetchNearbyImages(i, results, "forward");
    }

    expect(getPrefetchStats().isFastBurst).toBe(true);
  });

  it("reports isFastBurst=false after slow calls", () => {
    const results = makeResults(20);

    prefetchNearbyImages(10, results, "forward");
    // Slow calls at 500ms intervals (above 350ms threshold)
    for (let i = 11; i <= 13; i++) {
      mockNow += 500;
      prefetchNearbyImages(i, results, "forward");
    }

    expect(getPrefetchStats().isFastBurst).toBe(false);
  });

  it("uses sparse radius during fast burst (fewer in-flight)", () => {
    const results = makeResults(30);

    // Slow call — full radius (4 ahead + 1 behind = 5)
    prefetchNearbyImages(15, results, "forward");
    const fullRadiusCount = getPrefetchStats().inFlightCount;

    __resetPrefetchForTests();
    mockNow = 1000;

    // Fast burst — sparse radius (i+1, i-1, i+far, i-far = up to 4, but
    // far lookahead may overlap or be fewer)
    prefetchNearbyImages(15, results, "forward");
    for (let i = 16; i <= 20; i++) {
      mockNow += 100;
      prefetchNearbyImages(i, results, "forward");
    }
    const sparseCount = getPrefetchStats().inFlightCount;

    // Sparse should have fewer or equal in-flight than full radius
    // (cancellation + sparse radius = tighter set)
    expect(sparseCount).toBeLessThanOrEqual(fullRadiusCount);
  });

  it("post-burst debounce fires full-radius prefetch", async () => {
    vi.useFakeTimers();
    // Override performance.now within fake timers
    let fakeNow = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => fakeNow);

    const results = makeResults(30);

    // Simulate a fast burst
    prefetchNearbyImages(10, results, "forward");
    for (let i = 11; i <= 15; i++) {
      fakeNow += 100;
      prefetchNearbyImages(i, results, "forward");
    }

    const duringBurst = getPrefetchStats();
    expect(duringBurst.isFastBurst).toBe(true);

    // Advance past BURST_END_MS (280ms default)
    vi.advanceTimersByTime(300);

    // After burst-end fires, the pipeline should have issued a full-radius
    // batch. In-flight count should reflect the resting position's full radius.
    const afterBurst = getPrefetchStats();
    expect(afterBurst.inFlightCount).toBeGreaterThan(0);
    // Session should still be open (SESSION_TIMEOUT_MS not reached)
    expect(afterBurst.sessionOpen).toBe(true);

    vi.useRealTimers();
  });

  it("session closes after SESSION_TIMEOUT_MS of inactivity", async () => {
    vi.useFakeTimers();
    let fakeNow = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => fakeNow);

    const results = makeResults(20);
    prefetchNearbyImages(10, results, "forward");
    expect(getPrefetchStats().sessionOpen).toBe(true);

    // Advance past SESSION_TIMEOUT_MS (2000ms default)
    fakeNow += 2100;
    vi.advanceTimersByTime(2100);

    expect(getPrefetchStats().sessionOpen).toBe(false);

    vi.useRealTimers();
  });
});
