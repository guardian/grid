/**
 * @vitest-environment jsdom
 */

/**
 * Tests for handleLongPressStart helper.
 *
 * Covers the three branches:
 * - No anchor (mode entry): toggle + setAnchor.
 * - Same anchor (re-anchor): setAnchor only, no toggle.
 * - Different anchor: handleRange called with correct AddRangeEffect shape,
 *   then setAnchor moves anchor to the new cell.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleLongPressStart } from "@/lib/handleLongPressStart";
import { useSelectionStore } from "@/stores/selection-store";
import { useSearchStore } from "@/stores/search-store";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/stores/selection-store", () => ({
  useSelectionStore: {
    getState: vi.fn(),
  },
}));

vi.mock("@/stores/search-store", () => ({
  useSearchStore: {
    getState: vi.fn(),
  },
}));

vi.mock("@/lib/image-offset-cache", () => ({
  extractSortValues: vi.fn((_img, _orderBy) => [1234567890, "img-x"]),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSelState(overrides: {
  anchorId?: string | null;
  selectedIds?: Set<string>;
  metadataCache?: Map<string, object>;
} = {}) {
  return {
    anchorId: overrides.anchorId ?? null,
    selectedIds: overrides.selectedIds ?? new Set<string>(),
    metadataCache: {
      get: vi.fn((id: string) => overrides.metadataCache?.get(id) ?? undefined),
    },
    toggle: vi.fn(),
    setAnchor: vi.fn(),
  };
}

function makeSearchState(positions: Record<string, number> = {}) {
  return {
    imagePositions: new Map(Object.entries(positions)),
  };
}

function makeCtx(overrides: {
  cellId?: string;
  handleRange?: ReturnType<typeof vi.fn>;
  anchorId?: string | null;
  selectedIds?: Set<string>;
  metadataCache?: Map<string, object>;
  positions?: Record<string, number>;
} = {}) {
  const selState = makeSelState({
    anchorId: overrides.anchorId,
    selectedIds: overrides.selectedIds,
    metadataCache: overrides.metadataCache,
  });
  const searchState = makeSearchState(overrides.positions ?? {});

  vi.mocked(useSelectionStore.getState).mockReturnValue(selState as never);
  vi.mocked(useSearchStore.getState).mockReturnValue(searchState as never);

  return {
    selState,
    ctx: {
      cellId: overrides.cellId ?? "img-1",
      handleRange: overrides.handleRange,
      findImageIndex: vi.fn(() => 0),
      getImage: vi.fn(() => ({ id: overrides.cellId ?? "img-1" })),
      orderBy: undefined as string | undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleLongPressStart -- no anchor (mode entry)", () => {
  it("toggles + sets anchor when no anchor exists", () => {
    const { ctx, selState } = makeCtx({ cellId: "img-1", anchorId: null });

    handleLongPressStart(ctx);

    expect(selState.toggle).toHaveBeenCalledWith("img-1");
    expect(selState.setAnchor).toHaveBeenCalledWith("img-1");
  });

  it("does nothing when cellId is empty string", () => {
    const { ctx, selState } = makeCtx({ cellId: "" });

    handleLongPressStart(ctx);

    expect(selState.toggle).not.toHaveBeenCalled();
    expect(selState.setAnchor).not.toHaveBeenCalled();
  });
});

describe("handleLongPressStart -- same anchor (re-anchor only)", () => {
  it("re-anchors but does NOT toggle off the already-selected anchor cell", () => {
    const selectedIds = new Set(["img-1"]);
    const { ctx, selState } = makeCtx({
      cellId: "img-1",
      anchorId: "img-1",
      selectedIds,
    });

    handleLongPressStart(ctx);

    expect(selState.toggle).not.toHaveBeenCalled();
    expect(selState.setAnchor).toHaveBeenCalledWith("img-1");
  });
});

describe("handleLongPressStart -- different anchor (range)", () => {
  it("calls handleRange with correct AddRangeEffect and moves anchor", () => {
    const handleRange = vi.fn();
    const selectedIds = new Set(["img-1"]);
    const anchorImg = { id: "img-1" };
    const metadataCache = new Map([["img-1", anchorImg]]);
    const positions = { "img-1": 10, "img-2": 15 };

    const { ctx, selState } = makeCtx({
      cellId: "img-2",
      anchorId: "img-1",
      selectedIds,
      metadataCache: metadataCache as Map<string, object>,
      positions,
      handleRange,
    });

    handleLongPressStart(ctx);

    expect(handleRange).toHaveBeenCalledOnce();
    const effect = handleRange.mock.calls[0][0];
    expect(effect.op).toBe("add-range");
    expect(effect.anchorId).toBe("img-1");
    expect(effect.targetId).toBe("img-2");
    expect(effect.anchorGlobalIndex).toBe(10);
    expect(effect.targetGlobalIndex).toBe(15);
    // extractSortValues is mocked to return [1234567890, "img-x"] for both
    expect(effect.anchorSortValues).toEqual([1234567890, "img-x"]);
    expect(effect.targetSortValues).toEqual([1234567890, "img-x"]);

    // Anchor moves to the target cell for chaining subsequent long-presses.
    expect(selState.setAnchor).toHaveBeenCalledWith("img-2");
    expect(selState.toggle).not.toHaveBeenCalled();
  });

  it("falls back to toggle+setAnchor when handleRange is not provided", () => {
    const selectedIds = new Set(["img-1"]);
    const { ctx, selState } = makeCtx({
      cellId: "img-2",
      anchorId: "img-1",
      selectedIds,
      handleRange: undefined,
    });

    handleLongPressStart(ctx);

    // handleRange absent: falls into the !selectedIds.has(cellId) branch
    expect(selState.toggle).toHaveBeenCalledWith("img-2");
    expect(selState.setAnchor).toHaveBeenCalledWith("img-2");
  });

  it("passes null anchorGlobalIndex when anchor not in imagePositions", () => {
    const handleRange = vi.fn();
    const selectedIds = new Set(["img-1"]);
    // No positions for anchor
    const { ctx } = makeCtx({
      cellId: "img-2",
      anchorId: "img-1",
      selectedIds,
      positions: { "img-2": 15 },
      handleRange,
    });

    handleLongPressStart(ctx);

    const effect = handleRange.mock.calls[0][0];
    expect(effect.anchorGlobalIndex).toBeNull();
  });
});
