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
  getVisibleImageIds,
  getViewportAnchorId,
  useDataWindow,
  _resetForwardVelocity,
} from "@/hooks/useDataWindow";
import { registerScrollContainer } from "@/lib/scroll-container-ref";
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
    registerScrollContainer(null);
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
    const container = document.createElement("div");
    const image = document.createElement("div");
    image.dataset.imageId = "img-1060";
    container.append(image);
    document.body.append(container);
    container.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800, x: 0, y: 0,
      toJSON: () => ({}),
    });
    image.getBoundingClientRect = () => ({
      left: 0, top: 370, right: 800, bottom: 430, width: 800, height: 60, x: 0, y: 370,
      toJSON: () => ({}),
    });
    registerScrollContainer(container);

    const { result } = renderHook(() => useDataWindow());

    // Step 1: real rendered image inside buffer can be elected.
    result.current.reportVisibleRange(1050, 1070);
    expect(getViewportAnchorId()).toBe("img-1060");

    // Step 2: skeleton-only viewport has no real image candidate.
    image.remove();
    result.current.reportVisibleRange(3000, 3020);
    expect(getViewportAnchorId()).toBeNull();
    container.remove();
  });

  it("does not read DOM geometry during ordinary visible-range reporting", () => {
    setupTwoTier({ bufferOffset: 1000, bufferSize: 200, total: 5000 });
    const container = document.createElement("div");
    const geometryRead = vi.fn(() => ({
      left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800, x: 0, y: 0,
      toJSON: () => ({}),
    }));
    container.getBoundingClientRect = geometryRead;
    registerScrollContainer(container);
    const { result } = renderHook(() => useDataWindow());

    result.current.reportVisibleRange(1050, 1070);
    result.current.reportVisibleRange(1051, 1071);
    expect(geometryRead).not.toHaveBeenCalled();

    getViewportAnchorId();
    expect(geometryRead).toHaveBeenCalledOnce();
  });

  it("elects the rendered image nearest usable centre instead of the range midpoint", () => {
    setupTwoTier({ bufferOffset: 1000, bufferSize: 200, total: 5000 });
    const container = document.createElement("div");
    const geometric = document.createElement("div");
    geometric.dataset.imageId = "img-1059";
    const midpoint = document.createElement("div");
    midpoint.dataset.imageId = "img-1060";
    container.append(geometric, midpoint);
    document.body.append(container);
    container.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800, x: 0, y: 0,
      toJSON: () => ({}),
    });
    geometric.getBoundingClientRect = () => ({
      left: 0, top: 370, right: 800, bottom: 430, width: 800, height: 60, x: 0, y: 370,
      toJSON: () => ({}),
    });
    midpoint.getBoundingClientRect = () => ({
      left: 0, top: 430, right: 800, bottom: 490, width: 800, height: 60, x: 0, y: 430,
      toJSON: () => ({}),
    });
    registerScrollContainer(container);

    const { result } = renderHook(() => useDataWindow());
    result.current.reportVisibleRange(1050, 1070);

    expect(getViewportAnchorId()).toBe("img-1059");
    expect(getVisibleImageIds()).toContain("img-1060");
    expect(getVisibleImageIds()).not.toContain("img-1059");
    container.remove();
  });
});
