/**
 * @vitest-environment jsdom
 *
 * Viewport anchor skeleton-zone clearing (Bug #4).
 *
 * When the viewport is fully in the skeleton zone (two-tier mode, outside
 * the loaded buffer), _viewportAnchorId must be cleared to null — not left
 * stale at the last valid value. Consumers (buildHistorySnapshot,
 * density-focus, sort-around-focus) use null to skip anchor-based logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing modules under test
// ---------------------------------------------------------------------------

// matchMedia is not available in jsdom; stub it.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock("@/stores/ui-prefs-store", () => ({
  getEffectiveFocusMode: () => "phantom",
}));

// ---------------------------------------------------------------------------
// Imports — AFTER mocks
// ---------------------------------------------------------------------------

import { useSearchStore } from "@/stores/search-store";
import {
  getViewportAnchorId,
  resetViewportAnchor,
  useDataWindow,
  _resetForwardVelocity,
} from "@/hooks/useDataWindow";
import type { Image } from "@/types/image";

// ---------------------------------------------------------------------------
// Helpers (duplicated from useDataWindow.test.ts — minimal subset)
// ---------------------------------------------------------------------------

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

function setupTwoTier(opts: {
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

  const positionMap = {
    length: opts.total,
    ids: Array.from({ length: opts.total }, (_, i) => `img-${i}`),
    sortValues: Array.from({ length: opts.total }, (_, i) => [i]),
  };

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
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("viewport anchor skeleton-zone clearing (Bug #4)", () => {
  beforeEach(() => {
    resetViewportAnchor();
    _resetForwardVelocity();
    useSearchStore.setState({
      results: [],
      bufferOffset: 0,
      total: 0,
      loading: false,
      error: null,
      focusedImageId: null,
      imagePositions: new Map(),
      positionMap: null,
    });
  });

  it("clears anchor when viewport moves entirely into skeleton zone", () => {
    // Buffer at [1000..1199], total=5000
    setupTwoTier({ bufferOffset: 1000, bufferSize: 200, total: 5000 });

    const { result } = renderHook(() => useDataWindow());

    // Step 1: report visible range inside buffer → anchor should be set
    result.current.reportVisibleRange(1050, 1070);
    expect(getViewportAnchorId()).toBe("img-1060");

    // Step 2: report visible range entirely outside buffer (skeleton zone)
    // → anchor must be cleared to null (Bug #4: was stale before fix)
    result.current.reportVisibleRange(3000, 3020);
    expect(getViewportAnchorId()).toBeNull();
  });
});
