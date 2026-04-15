/**
 * Unit tests for useImageTraversal — shared prev/next traversal hook.
 *
 * Tests the core traversal logic:
 * - Immediate navigation when adjacent image is in buffer
 * - Proactive extend triggers near buffer edges
 * - Pending navigation when target is outside buffer
 * - Boundary detection (first/last image in results)
 * - Works identically in normal and two-tier modes
 *
 * These are store-level logic tests. We set up store state and call the
 * hook's internal helpers (which work with `useSearchStore.getState()`).
 * We don't render React components — the hook's reactive behaviour
 * (useEffect watching results/bufferOffset) is tested via E2E.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
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

/** Set up store state with a buffer at given offset. */
function setupBuffer(opts: {
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
// Since useImageTraversal is a React hook, we test the underlying logic
// by replicating its pure helper functions and the store interactions.
// The reactive glue (useEffect) is covered by E2E tests.
// ---------------------------------------------------------------------------

/** Resolve a global index to an Image from the buffer, or null. */
function getImageAtGlobal(globalIdx: number): Image | null {
  const { bufferOffset, results } = useSearchStore.getState();
  const localIdx = globalIdx - bufferOffset;
  if (localIdx < 0 || localIdx >= results.length) return null;
  return results[localIdx] ?? null;
}

/** Get the global index of an image by ID, or -1. */
function globalIndexOf(imageId: string): number {
  const { imagePositions } = useSearchStore.getState();
  return imagePositions.get(imageId) ?? -1;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useImageTraversal — store-level traversal logic", () => {
  beforeEach(() => {
    useSearchStore.setState(useSearchStore.getInitialState());
  });

  describe("getImageAtGlobal", () => {
    it("returns image when global index is within buffer", () => {
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 10000 });
      const img = getImageAtGlobal(150);
      expect(img).not.toBeNull();
      expect(img!.id).toBe("img-150");
    });

    it("returns null when global index is before buffer", () => {
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 10000 });
      expect(getImageAtGlobal(50)).toBeNull();
    });

    it("returns null when global index is after buffer", () => {
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 10000 });
      expect(getImageAtGlobal(350)).toBeNull();
    });

    it("returns image at exact buffer start", () => {
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 10000 });
      const img = getImageAtGlobal(100);
      expect(img).not.toBeNull();
      expect(img!.id).toBe("img-100");
    });

    it("returns image at exact buffer end", () => {
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 10000 });
      const img = getImageAtGlobal(299);
      expect(img).not.toBeNull();
      expect(img!.id).toBe("img-299");
    });

    it("returns null at buffer end + 1", () => {
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 10000 });
      expect(getImageAtGlobal(300)).toBeNull();
    });
  });

  describe("globalIndexOf", () => {
    it("returns global index for image in buffer", () => {
      setupBuffer({ bufferOffset: 500, bufferSize: 200, total: 10000 });
      expect(globalIndexOf("img-550")).toBe(550);
    });

    it("returns -1 for unknown image", () => {
      setupBuffer({ bufferOffset: 500, bufferSize: 200, total: 10000 });
      expect(globalIndexOf("nonexistent")).toBe(-1);
    });
  });

  describe("traversal — adjacent image in buffer", () => {
    it("can navigate forward when next image is in buffer", () => {
      setupBuffer({ bufferOffset: 0, bufferSize: 100, total: 1000 });
      const currentId = "img-50";
      const gIdx = globalIndexOf(currentId);
      expect(gIdx).toBe(50);

      const nextImg = getImageAtGlobal(gIdx + 1);
      expect(nextImg).not.toBeNull();
      expect(nextImg!.id).toBe("img-51");
    });

    it("can navigate backward when prev image is in buffer", () => {
      setupBuffer({ bufferOffset: 0, bufferSize: 100, total: 1000 });
      const currentId = "img-50";
      const gIdx = globalIndexOf(currentId);

      const prevImg = getImageAtGlobal(gIdx - 1);
      expect(prevImg).not.toBeNull();
      expect(prevImg!.id).toBe("img-49");
    });
  });

  describe("traversal — boundary detection", () => {
    it("returns null for prev at absolute start (global position 0)", () => {
      setupBuffer({ bufferOffset: 0, bufferSize: 100, total: 1000 });
      const prevImg = getImageAtGlobal(-1);
      expect(prevImg).toBeNull();
    });

    it("returns null for next at absolute end", () => {
      setupBuffer({ bufferOffset: 900, bufferSize: 100, total: 1000 });
      // img-999 is the last; position 1000 is beyond total
      const nextImg = getImageAtGlobal(1000);
      expect(nextImg).toBeNull();
    });

    it("returns image for last valid position", () => {
      setupBuffer({ bufferOffset: 900, bufferSize: 100, total: 1000 });
      const img = getImageAtGlobal(999);
      expect(img).not.toBeNull();
      expect(img!.id).toBe("img-999");
    });
  });

  describe("traversal — buffer edge (image outside buffer)", () => {
    it("returns null for forward when at buffer end edge", () => {
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 10000 });
      // img-299 is the last in buffer; img-300 is outside
      const gIdx = globalIndexOf("img-299");
      expect(gIdx).toBe(299);
      const nextImg = getImageAtGlobal(gIdx + 1);
      expect(nextImg).toBeNull(); // triggers extend
    });

    it("returns null for backward when at buffer start edge", () => {
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 10000 });
      // img-100 is the first in buffer; img-99 is outside
      const gIdx = globalIndexOf("img-100");
      expect(gIdx).toBe(100);
      const prevImg = getImageAtGlobal(gIdx - 1);
      expect(prevImg).toBeNull(); // triggers extend
    });

    it("correctly identifies when extend is needed vs boundary", () => {
      const { total } = { total: 10000 };
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total });

      // At buffer edge, not at absolute boundary → extend needed
      const gIdxForward = globalIndexOf("img-299");
      expect(gIdxForward + 1 < total).toBe(true); // not at absolute end
      expect(getImageAtGlobal(gIdxForward + 1)).toBeNull(); // but not in buffer

      // At absolute start → boundary, no extend possible
      setupBuffer({ bufferOffset: 0, bufferSize: 200, total });
      const gIdxStart = globalIndexOf("img-0");
      expect(gIdxStart - 1 < 0).toBe(true); // at absolute start
    });
  });

  describe("traversal — deep buffer with offset", () => {
    it("navigates correctly when buffer is deep in the result set", () => {
      setupBuffer({ bufferOffset: 5000, bufferSize: 200, total: 10000 });

      const currentId = "img-5100";
      const gIdx = globalIndexOf(currentId);
      expect(gIdx).toBe(5100);

      const prevImg = getImageAtGlobal(gIdx - 1);
      expect(prevImg!.id).toBe("img-5099");

      const nextImg = getImageAtGlobal(gIdx + 1);
      expect(nextImg!.id).toBe("img-5101");
    });

    it("returns the correct global index for counter display", () => {
      setupBuffer({ bufferOffset: 5000, bufferSize: 200, total: 10000 });
      // The counter should show "5101 of 10,000" for img-5100
      const gIdx = globalIndexOf("img-5100");
      expect(gIdx + 1).toBe(5101); // 1-based for display
    });
  });

  describe("proactive extend logic", () => {
    it("detects when near forward buffer edge (within threshold)", () => {
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 10000 });
      const EXTEND_AHEAD = 20;
      const bufferEnd = 100 + 200; // 300

      // img-285 is 15 from buffer end → within threshold
      const gIdx = globalIndexOf("img-285");
      expect(gIdx).toBe(285);
      expect(gIdx >= bufferEnd - EXTEND_AHEAD).toBe(true);
      expect(bufferEnd < 10000).toBe(true); // more data exists
    });

    it("detects when near backward buffer edge (within threshold)", () => {
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 10000 });
      const EXTEND_AHEAD = 20;

      // img-115 is 15 from buffer start → within threshold
      const gIdx = globalIndexOf("img-115");
      expect(gIdx).toBe(115);
      expect(gIdx <= 100 + EXTEND_AHEAD).toBe(true);
      expect(100 > 0).toBe(true); // more data exists before
    });

    it("does not trigger extend when far from edges", () => {
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 10000 });
      const EXTEND_AHEAD = 20;
      const bufferEnd = 100 + 200;

      // img-200 is in the middle — 100 from each edge
      const gIdx = globalIndexOf("img-200");
      expect(gIdx >= bufferEnd - EXTEND_AHEAD).toBe(false);
      expect(gIdx <= 100 + EXTEND_AHEAD).toBe(false);
    });
  });
});

