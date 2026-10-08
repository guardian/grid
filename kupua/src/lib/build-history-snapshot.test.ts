import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SearchParams } from "@/dal/types";

// ---------------------------------------------------------------------------
// Mocks — set up before importing the module under test
// ---------------------------------------------------------------------------

const mockStoreState = {
  params: { orderBy: undefined, nonFree: "true" } as SearchParams,
  focusedImageId: null as string | null,
  imagePositions: new Map<string, number>(),
  bufferOffset: 0,
  results: [] as Array<{ id: string; uploadTime: string; uploadedBy: string; source: { mimeType: string; dimensions: { width: number; height: number } }; metadata: Record<string, unknown> } | undefined>,
  newCountSince: null as string | null,
  newCount: 0,
};

vi.mock("@/stores/search-store", () => ({
  useSearchStore: Object.assign(
    // The hook itself (for React components — not used in tests)
    () => mockStoreState,
    {
      getState: () => mockStoreState,
    },
  ),
}));

let mockFocusMode: "explicit" | "phantom" = "explicit";
vi.mock("@/stores/ui-prefs-store", () => ({
  getEffectiveFocusMode: () => mockFocusMode,
}));

let mockViewportAnchorId: string | null = null;
vi.mock("@/hooks/useDataWindow", () => ({
  getViewportAnchorId: () => mockViewportAnchorId,
}));

vi.mock("@/lib/scroll-container-ref", () => ({
  getScrollContainer: () => ({
    clientHeight: 1038,
    scrollTop: 0,
  }),
}));

vi.mock("@/lib/scroll-geometry-ref", () => ({
  getScrollGeometry: () => ({ rowHeight: 303, columns: 5 }),
}));

// Now import the module under test
import { buildHistorySnapshot } from "./build-history-snapshot";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const IMG_A = {
  id: "img-a",
  uploadTime: "2026-03-20T14:30:00.000Z",
  uploadedBy: "test",
  source: { mimeType: "image/jpeg", dimensions: { width: 100, height: 100 } },
  metadata: {},
};

const IMG_B = {
  id: "img-b",
  uploadTime: "2026-03-21T10:00:00.000Z",
  uploadedBy: "test",
  source: { mimeType: "image/jpeg", dimensions: { width: 200, height: 200 } },
  metadata: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildHistorySnapshot", () => {
  beforeEach(() => {
    mockStoreState.params = { nonFree: "true", orderBy: undefined };
    mockStoreState.focusedImageId = null;
    mockStoreState.imagePositions = new Map();
    mockStoreState.bufferOffset = 0;
    mockStoreState.results = [];
    mockStoreState.newCountSince = null;
    mockStoreState.newCount = 0;
    mockFocusMode = "explicit";
    mockViewportAnchorId = null;
  });

  it("returns null anchor when no images exist", () => {
    const snap = buildHistorySnapshot();
    expect(snap.anchorImageId).toBeNull();
    expect(snap.anchorOffset).toBe(0);
  });

  it("matches URL search identity when store params include pagination", () => {
    mockStoreState.params = { query: "cats", length: 200, offset: 600, orderBy: "-uploadTime", nonFree: "true" };
    const snap = buildHistorySnapshot();
    expect(snap.searchKey).toBe(JSON.stringify([
      ["nonFree", "true"], ["orderBy", "-uploadTime"], ["query", "cats"],
    ]));
  });

  describe("anchor selection", () => {
    it("uses focusedImageId in click-to-focus mode", () => {
      mockFocusMode = "explicit";
      mockStoreState.focusedImageId = "img-a";
      mockStoreState.imagePositions = new Map([["img-a", 42]]);
      mockStoreState.bufferOffset = 0;
      mockStoreState.results = [IMG_A];
      // Override: place the image at the right position
      mockStoreState.bufferOffset = 42;
      mockStoreState.results = new Array(1);
      mockStoreState.results[0] = IMG_A;

      const snap = buildHistorySnapshot();
      expect(snap.anchorImageId).toBe("img-a");
      expect(snap.anchorOffset).toBe(42);
    });

    it("falls back to viewport anchor in click-to-focus mode with no focus", () => {
      mockFocusMode = "explicit";
      mockStoreState.focusedImageId = null;
      mockViewportAnchorId = "img-b";
      mockStoreState.imagePositions = new Map([["img-b", 10]]);
      mockStoreState.bufferOffset = 0;
      mockStoreState.results = new Array(11);
      mockStoreState.results[10] = IMG_B;

      const snap = buildHistorySnapshot();
      expect(snap.anchorImageId).toBe("img-b");
      expect(snap.anchorOffset).toBe(10);
    });

    it("uses viewport anchor in click-to-open mode (phantom)", () => {
      mockFocusMode = "phantom";
      mockStoreState.focusedImageId = "img-a"; // has focus, but ignored in phantom mode
      mockViewportAnchorId = "img-b";
      mockStoreState.imagePositions = new Map([
        ["img-a", 5],
        ["img-b", 10],
      ]);
      mockStoreState.bufferOffset = 0;
      mockStoreState.results = new Array(11);
      mockStoreState.results[5] = IMG_A;
      mockStoreState.results[10] = IMG_B;

      const snap = buildHistorySnapshot();
      // In phantom mode, focused image is not used as anchor —
      // viewport anchor wins.
      expect(snap.anchorImageId).toBe("img-b");
      expect(snap.anchorOffset).toBe(10);
    });
  });

  it("handles anchor image not in buffer when offset is known", () => {
    mockFocusMode = "explicit";
    mockStoreState.focusedImageId = "img-a";
    mockStoreState.imagePositions = new Map([["img-a", 500]]);
    mockStoreState.bufferOffset = 0;
    mockStoreState.results = new Array(100); // buffer doesn't contain position 500

    const snap = buildHistorySnapshot();
    expect(snap.anchorImageId).toBe("img-a");
    expect(snap.anchorOffset).toBe(500);
  });

  it("captures the admission boundary and pending count even without an anchor", () => {
    mockStoreState.newCountSince = "2026-04-26T10:00:00.000Z";
    mockStoreState.newCount = 134;

    const snap = buildHistorySnapshot();
    expect(snap.newCountSince).toBe("2026-04-26T10:00:00.000Z");
    expect(snap).toMatchObject({ newCount: 134, anchorImageId: null });
  });

  it("captures null newCountSince when no search has completed", () => {
    mockStoreState.newCountSince = null;

    const snap = buildHistorySnapshot();
    expect(snap.newCountSince).toBeNull();
  });
});
