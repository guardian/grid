/**
 * Unit tests for useDataWindow — two-tier virtualisation index mapping.
 *
 * Tests the core index semantics that change when `positionMap !== null`:
 * - getImage: global→buffer-local mapping
 * - findImageIndex: returns global vs buffer-local
 * - reportVisibleRange: extend triggers with buffer-relative thresholds
 * - reportVisibleRange: viewport anchor buffer-local lookup
 * - virtualizerCount: total vs buffer length
 *
 * These are pure-logic tests using the Zustand store directly, not rendering
 * React components. We call useDataWindow indirectly by setting store state
 * and calling the functions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useSearchStore } from "@/stores/search-store";
import type { Image } from "@/types/image";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal Image object for testing. */
function makeImage(id: string): Image {
  return {
    id,
    uploadTime: "2024-01-01T00:00:00Z",
    uploadedBy: "test",
    softDeletedMetadata: undefined,
    source: { uri: "", name: "", id: "" },
    metadata: {
      description: id,
      credit: undefined,
      byline: undefined,
      title: undefined,
      copyright: undefined,
      copyrightNotice: undefined,
      suppliersReference: undefined,
      keywords: [],
      subjects: [],
      specialInstructions: undefined,
      subLocation: undefined,
      city: undefined,
      state: undefined,
      country: undefined,
      dateTaken: undefined,
      people: [],
    },
    usages: [],
    exports: [],
    collections: [],
    leases: { leases: [], lastModified: undefined },
    usageRights: { category: "handout" },
  } as unknown as Image;
}

/** Set up store state for two-tier mode. */
function setupTwoTier(opts: {
  bufferOffset: number;
  bufferSize: number;
  total: number;
}) {
  const images = Array.from({ length: opts.bufferSize }, (_, i) =>
    makeImage(`img-${opts.bufferOffset + i}`),
  );

  // Build imagePositions map — maps each image ID to its global position
  const imagePositions = new Map<string, number>();
  images.forEach((img, i) => {
    imagePositions.set(img.id, opts.bufferOffset + i);
  });

  // Build a minimal position map (just needs to be non-null for twoTier)
  const positionMap = {
    length: opts.total,
    ids: Array.from({ length: opts.total }, (_, i) => `img-${i}`),
    sortValues: Array.from({ length: opts.total }, (_, i) => [i]),
  };

  // Also add all position map entries to imagePositions
  for (let i = 0; i < opts.total; i++) {
    imagePositions.set(`img-${i}`, i);
  }

  useSearchStore.setState({
    results: images,
    bufferOffset: opts.bufferOffset,
    total: opts.total,
    imagePositions,
    positionMap,
  });

  return { images, imagePositions };
}

/** Set up store state for normal (non-two-tier) mode. */
function setupNormal(opts: {
  bufferOffset: number;
  bufferSize: number;
  total: number;
}) {
  const images = Array.from({ length: opts.bufferSize }, (_, i) =>
    makeImage(`img-${opts.bufferOffset + i}`),
  );

  const imagePositions = new Map<string, number>();
  images.forEach((img, i) => {
    imagePositions.set(img.id, opts.bufferOffset + i);
  });

  useSearchStore.setState({
    results: images,
    bufferOffset: opts.bufferOffset,
    total: opts.total,
    imagePositions,
    positionMap: null,
  });

  return { images, imagePositions };
}

// ---------------------------------------------------------------------------
// Since useDataWindow is a hook, we test its logic by extracting the pure
// functions. For getImage/findImageIndex, we replicate the callback logic.
// ---------------------------------------------------------------------------

/**
 * Replicate the getImage logic from useDataWindow.
 * This tests the pure mapping without needing React rendering.
 */
function getImageLogic(
  index: number,
  twoTier: boolean,
  bufferOffset: number,
  results: (Image | undefined)[],
): Image | undefined {
  if (twoTier) {
    const localIdx = index - bufferOffset;
    if (localIdx < 0 || localIdx >= results.length) return undefined;
    return results[localIdx];
  }
  if (index < 0 || index >= results.length) return undefined;
  return results[index];
}

/**
 * Replicate the findImageIndex logic from useDataWindow.
 */
function findImageIndexLogic(
  imageId: string,
  twoTier: boolean,
  imagePositions: Map<string, number>,
  bufferOffset: number,
  resultsLength: number,
): number {
  const globalIdx = imagePositions.get(imageId);
  if (globalIdx == null) return -1;
  if (twoTier) return globalIdx;
  const localIdx = globalIdx - bufferOffset;
  if (localIdx < 0 || localIdx >= resultsLength) return -1;
  return localIdx;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useDataWindow two-tier index mapping", () => {
  beforeEach(() => {
    useSearchStore.setState({
      results: [],
      bufferOffset: 0,
      total: 0,
      imagePositions: new Map(),
      positionMap: null,
    });
  });

  // -------------------------------------------------------------------------
  // twoTier derivation
  // -------------------------------------------------------------------------

  describe("twoTier boolean", () => {
    it("is false when positionMap is null", () => {
      setupNormal({ bufferOffset: 0, bufferSize: 100, total: 100 });
      expect(useSearchStore.getState().positionMap).toBeNull();
    });

    it("is true when positionMap is non-null", () => {
      setupTwoTier({ bufferOffset: 0, bufferSize: 100, total: 5000 });
      expect(useSearchStore.getState().positionMap).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // virtualizerCount
  // -------------------------------------------------------------------------

  describe("virtualizerCount", () => {
    it("equals results.length in normal mode", () => {
      setupNormal({ bufferOffset: 500, bufferSize: 200, total: 10000 });
      const s = useSearchStore.getState();
      const twoTier = s.positionMap !== null;
      const count = twoTier ? s.total : s.results.length;
      expect(count).toBe(200);
    });

    it("equals total in two-tier mode", () => {
      setupTwoTier({ bufferOffset: 500, bufferSize: 200, total: 10000 });
      const s = useSearchStore.getState();
      const twoTier = s.positionMap !== null;
      const count = twoTier ? s.total : s.results.length;
      expect(count).toBe(10000);
    });
  });

  // -------------------------------------------------------------------------
  // getImage
  // -------------------------------------------------------------------------

  describe("getImage", () => {
    it("normal mode: returns image at buffer-local index", () => {
      setupNormal({ bufferOffset: 100, bufferSize: 50, total: 500 });
      const s = useSearchStore.getState();
      const img = getImageLogic(0, false, s.bufferOffset, s.results);
      expect(img?.id).toBe("img-100");
      const img2 = getImageLogic(49, false, s.bufferOffset, s.results);
      expect(img2?.id).toBe("img-149");
    });

    it("normal mode: returns undefined for out-of-range index", () => {
      setupNormal({ bufferOffset: 100, bufferSize: 50, total: 500 });
      const s = useSearchStore.getState();
      expect(getImageLogic(-1, false, s.bufferOffset, s.results)).toBeUndefined();
      expect(getImageLogic(50, false, s.bufferOffset, s.results)).toBeUndefined();
    });

    it("two-tier: returns image at global index within buffer", () => {
      setupTwoTier({ bufferOffset: 1000, bufferSize: 200, total: 5000 });
      const s = useSearchStore.getState();
      const img = getImageLogic(1000, true, s.bufferOffset, s.results);
      expect(img?.id).toBe("img-1000");
      const img2 = getImageLogic(1199, true, s.bufferOffset, s.results);
      expect(img2?.id).toBe("img-1199");
    });

    it("two-tier: returns undefined for global index before buffer", () => {
      setupTwoTier({ bufferOffset: 1000, bufferSize: 200, total: 5000 });
      const s = useSearchStore.getState();
      expect(getImageLogic(999, true, s.bufferOffset, s.results)).toBeUndefined();
      expect(getImageLogic(0, true, s.bufferOffset, s.results)).toBeUndefined();
    });

    it("two-tier: returns undefined for global index after buffer", () => {
      setupTwoTier({ bufferOffset: 1000, bufferSize: 200, total: 5000 });
      const s = useSearchStore.getState();
      expect(getImageLogic(1200, true, s.bufferOffset, s.results)).toBeUndefined();
      expect(getImageLogic(4999, true, s.bufferOffset, s.results)).toBeUndefined();
    });

    it("two-tier: returns undefined for negative index", () => {
      setupTwoTier({ bufferOffset: 1000, bufferSize: 200, total: 5000 });
      const s = useSearchStore.getState();
      expect(getImageLogic(-1, true, s.bufferOffset, s.results)).toBeUndefined();
    });

    it("two-tier: buffer at start, index 0 works", () => {
      setupTwoTier({ bufferOffset: 0, bufferSize: 200, total: 5000 });
      const s = useSearchStore.getState();
      const img = getImageLogic(0, true, s.bufferOffset, s.results);
      expect(img?.id).toBe("img-0");
    });

    it("two-tier: exact buffer boundaries", () => {
      setupTwoTier({ bufferOffset: 500, bufferSize: 100, total: 2000 });
      const s = useSearchStore.getState();
      // First item in buffer
      expect(getImageLogic(500, true, s.bufferOffset, s.results)?.id).toBe("img-500");
      // Last item in buffer
      expect(getImageLogic(599, true, s.bufferOffset, s.results)?.id).toBe("img-599");
      // Just outside
      expect(getImageLogic(499, true, s.bufferOffset, s.results)).toBeUndefined();
      expect(getImageLogic(600, true, s.bufferOffset, s.results)).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // findImageIndex
  // -------------------------------------------------------------------------

  describe("findImageIndex", () => {
    it("normal mode: returns buffer-local index", () => {
      setupNormal({ bufferOffset: 100, bufferSize: 50, total: 500 });
      const s = useSearchStore.getState();
      const idx = findImageIndexLogic("img-100", false, s.imagePositions, s.bufferOffset, s.results.length);
      expect(idx).toBe(0);
      const idx2 = findImageIndexLogic("img-149", false, s.imagePositions, s.bufferOffset, s.results.length);
      expect(idx2).toBe(49);
    });

    it("normal mode: returns -1 for image outside buffer", () => {
      setupNormal({ bufferOffset: 100, bufferSize: 50, total: 500 });
      const s = useSearchStore.getState();
      const idx = findImageIndexLogic("img-99", false, s.imagePositions, s.bufferOffset, s.results.length);
      expect(idx).toBe(-1);
      const idx2 = findImageIndexLogic("img-150", false, s.imagePositions, s.bufferOffset, s.results.length);
      expect(idx2).toBe(-1);
    });

    it("normal mode: returns -1 for unknown image", () => {
      setupNormal({ bufferOffset: 0, bufferSize: 50, total: 500 });
      const s = useSearchStore.getState();
      expect(findImageIndexLogic("nonexistent", false, s.imagePositions, s.bufferOffset, s.results.length)).toBe(-1);
    });

    it("two-tier: returns global index", () => {
      setupTwoTier({ bufferOffset: 1000, bufferSize: 200, total: 5000 });
      const s = useSearchStore.getState();
      const idx = findImageIndexLogic("img-1050", true, s.imagePositions, s.bufferOffset, s.results.length);
      expect(idx).toBe(1050); // global, not buffer-local 50
    });

    it("two-tier: returns global index even for images outside buffer", () => {
      setupTwoTier({ bufferOffset: 1000, bufferSize: 200, total: 5000 });
      const s = useSearchStore.getState();
      // img-500 is at global position 500, but outside the buffer [1000..1199]
      const idx = findImageIndexLogic("img-500", true, s.imagePositions, s.bufferOffset, s.results.length);
      expect(idx).toBe(500); // returns global, even though not in buffer
    });

    it("two-tier: returns -1 for unknown image", () => {
      setupTwoTier({ bufferOffset: 0, bufferSize: 100, total: 5000 });
      const s = useSearchStore.getState();
      expect(findImageIndexLogic("nonexistent", true, s.imagePositions, s.bufferOffset, s.results.length)).toBe(-1);
    });
  });

  // -------------------------------------------------------------------------
  // Extend trigger boundaries (logic test)
  // -------------------------------------------------------------------------

  describe("extend trigger logic (two-tier)", () => {
    const EXTEND_THRESHOLD = 50;

    /**
     * Replicate the extend trigger logic from reportVisibleRange.
     * Returns which triggers would fire.
     */
    function checkExtends(
      globalStart: number,
      globalEnd: number,
      bufferOffset: number,
      bufferLen: number,
      total: number,
    ): { forward: boolean; backward: boolean; skipped: boolean } {
      const viewportOverlapsOrNearBuffer =
        globalEnd > bufferOffset - EXTEND_THRESHOLD &&
        globalStart < bufferOffset + bufferLen + EXTEND_THRESHOLD;

      if (!viewportOverlapsOrNearBuffer) {
        return { forward: false, backward: false, skipped: true };
      }

      const forward = globalEnd > bufferOffset + bufferLen - EXTEND_THRESHOLD && bufferOffset + bufferLen < total;
      const backward = globalStart < bufferOffset + EXTEND_THRESHOLD && bufferOffset > 0;
      return { forward, backward, skipped: false };
    }

    it("fires forward extend near buffer end", () => {
      // Buffer: [500..699], viewport at [640..660]
      const r = checkExtends(640, 660, 500, 200, 5000);
      expect(r.forward).toBe(true);
      expect(r.backward).toBe(false);
      expect(r.skipped).toBe(false);
    });

    it("fires backward extend near buffer start", () => {
      // Buffer: [500..699], viewport at [510..530]
      const r = checkExtends(510, 530, 500, 200, 5000);
      expect(r.forward).toBe(false);
      expect(r.backward).toBe(true);
      expect(r.skipped).toBe(false);
    });

    it("fires neither when viewport is in buffer middle", () => {
      // Buffer: [500..699], viewport at [580..620]
      const r = checkExtends(580, 620, 500, 200, 5000);
      expect(r.forward).toBe(false);
      expect(r.backward).toBe(false);
      expect(r.skipped).toBe(false);
    });

    it("skips extends when viewport is far from buffer", () => {
      // Buffer: [500..699], viewport at [2000..2020]
      const r = checkExtends(2000, 2020, 500, 200, 5000);
      expect(r.skipped).toBe(true);
    });

    it("does not skip when viewport is just outside threshold", () => {
      // Buffer: [500..699], viewport at [440..460] — within threshold of buffer start
      const r = checkExtends(440, 460, 500, 200, 5000);
      expect(r.skipped).toBe(false);
      expect(r.backward).toBe(true);
    });

    it("does not fire forward when buffer covers end of results", () => {
      // Buffer: [4800..4999], total=5000, viewport near end
      const r = checkExtends(4960, 4980, 4800, 200, 5000);
      expect(r.forward).toBe(false); // bufferOffset + bufferLen = 5000 = total
    });

    it("does not fire backward when bufferOffset is 0", () => {
      // Buffer: [0..199], viewport near start
      const r = checkExtends(10, 30, 0, 200, 5000);
      expect(r.backward).toBe(false); // bufferOffset = 0
    });
  });

  // -------------------------------------------------------------------------
  // Viewport anchor (logic test)
  // -------------------------------------------------------------------------

  describe("viewport anchor (two-tier)", () => {
    it("converts global midpoint to buffer-local for anchor lookup", () => {
      setupTwoTier({ bufferOffset: 1000, bufferSize: 200, total: 5000 });
      const s = useSearchStore.getState();

      // Viewport at [1050..1070], midpoint = 1060
      const midPoint = (1050 + 1070) / 2; // 1060
      const localMid = Math.round(midPoint) - s.bufferOffset; // 1060 - 1000 = 60
      expect(localMid).toBe(60);
      expect(s.results[localMid]?.id).toBe("img-1060");
    });

    it("skips anchor when viewport is outside buffer", () => {
      setupTwoTier({ bufferOffset: 1000, bufferSize: 200, total: 5000 });
      const s = useSearchStore.getState();

      // Viewport at [3000..3020], midpoint = 3010
      const midPoint = (3000 + 3020) / 2; // 3010
      const localMid = Math.round(midPoint) - s.bufferOffset; // 3010 - 1000 = 2010
      // Should be outside buffer
      expect(localMid).toBeGreaterThanOrEqual(s.results.length);
    });

    it("skips anchor when viewport is before buffer", () => {
      setupTwoTier({ bufferOffset: 1000, bufferSize: 200, total: 5000 });
      const s = useSearchStore.getState();

      // Viewport at [0..20]
      const localMid = Math.round(10) - s.bufferOffset; // 10 - 1000 = -990
      expect(localMid).toBeLessThan(0);
    });
  });
});


// ---------------------------------------------------------------------------
// Velocity-aware adaptive forward-extend trigger
// ---------------------------------------------------------------------------

import {
  _updateForwardVelocity,
  forwardExtendThreshold,
} from "@/hooks/useDataWindow";
import { PAGE_SIZE } from "@/constants/tuning";

describe("forwardExtendThreshold (velocity-aware)", () => {
  it("returns base threshold (50) at zero velocity", () => {
    expect(forwardExtendThreshold(0)).toBe(50);
  });

  it("returns base threshold for negative (upward) velocity", () => {
    expect(forwardExtendThreshold(-2)).toBe(50);
    expect(forwardExtendThreshold(-100)).toBe(50);
  });

  it("widens linearly with positive velocity", () => {
    // 0.1 items/ms × 400ms lookahead = 40 items ahead → 50 + 40 = 90
    expect(forwardExtendThreshold(0.1)).toBe(90);
    // 0.25 items/ms × 400ms = 100 items ahead → 50 + 100 = 150
    expect(forwardExtendThreshold(0.25)).toBe(150);
  });

  it("caps at PAGE_SIZE (no benefit beyond one fetch in flight)", () => {
    // 10 items/ms is absurdly fast; should clamp to PAGE_SIZE
    expect(forwardExtendThreshold(10)).toBe(PAGE_SIZE);
    expect(forwardExtendThreshold(1000)).toBe(PAGE_SIZE);
  });
});

describe("_updateForwardVelocity (EMA)", () => {
  it("returns 0 on first call (no prevTime)", () => {
    expect(_updateForwardVelocity(100, 1000, 0, 0, 0)).toBe(0);
  });

  it("returns 0 on idle gap > IDLE_RESET_MS (250ms)", () => {
    // dt = 300ms — too long; treat as fresh
    expect(_updateForwardVelocity(200, 1300, 1000, 100, 0.5)).toBe(0);
  });

  it("returns 0 on non-monotonic clock (dt <= 0)", () => {
    expect(_updateForwardVelocity(200, 900, 1000, 100, 0.5)).toBe(0);
    expect(_updateForwardVelocity(200, 1000, 1000, 100, 0.5)).toBe(0);
  });

  it("applies EMA: 0.4 × instant + 0.6 × prevEma", () => {
    // delta = 50 items in 100ms = 0.5 items/ms instant
    // prevEma = 0.1 → result = 0.4 × 0.5 + 0.6 × 0.1 = 0.20 + 0.06 = 0.26
    const v = _updateForwardVelocity(150, 1100, 1000, 100, 0.1);
    expect(v).toBeCloseTo(0.26, 5);
  });

  it("smooths bursty input: spike doesn't dominate after one sample", () => {
    // Steady 0.05 items/ms baseline, then 1.0 spike — EMA still well below 1.0
    let v = 0.05;
    v = _updateForwardVelocity(110, 1100, 1000, 100, v); // steady
    // Spike: +200 items in 100ms = 2.0 items/ms
    v = _updateForwardVelocity(310, 1200, 1100, 110, v);
    expect(v).toBeLessThan(1.0); // tempered by EMA
    expect(v).toBeGreaterThan(0.5); // but still reflects the burst
  });

  it("captures backwards velocity as negative", () => {
    // delta = -50 items in 100ms
    const v = _updateForwardVelocity(50, 1100, 1000, 100, 0);
    expect(v).toBeLessThan(0);
  });
});
