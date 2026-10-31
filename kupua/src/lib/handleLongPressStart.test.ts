/**
 * @vitest-environment jsdom
 */

/**
 * Tests for handleLongPressStart helper.
 *
 * Covers the three branches:
 * - No anchor (mode entry): toggle + setAnchor.
 * - Same anchor (re-anchor): setAnchor only, no toggle.
 * - Different anchor: dispatch old-anchor AddRangeEffect with endpoint chaining.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDragSelect, handleLongPressStart } from "@/lib/handleLongPressStart";
import type { AddRangeEffect } from "@/lib/dispatchClickEffects";
import type { Image } from "@/types/image";
import { useSelectionStore } from "@/stores/selection-store";
import { useSearchStore } from "@/stores/search-store";
import { buildSearchKey, extractSortValues, retainSortValues } from "@/lib/image-offset-cache";

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

vi.mock("@/lib/image-offset-cache", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/image-offset-cache")>(),
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
    params: { nonFree: "true" },
  };
}

function makeCtx(overrides: {
  cellId?: string;
  handleRange?: ((effect: AddRangeEffect) => void) | undefined;
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
      getImage: vi.fn(() => ({ id: overrides.cellId ?? "img-1" } as unknown as Image)),
      orderBy: undefined as string | undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  retainSortValues("", [], [], true);
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
  it("uses a retained anchor tuple before metadata hydration completes", () => {
    const handleRange = vi.fn();
    const { ctx } = makeCtx({ cellId: "img-2", anchorId: "img-1", handleRange });
    const searchKey = buildSearchKey({ nonFree: "true" });
    const cursor = [1234567890, "img-1"];
    retainSortValues(searchKey, [{ id: "img-1" } as Image], [cursor]);

    handleLongPressStart(ctx);

    expect(handleRange.mock.calls[0][0].anchorSortValues).toEqual(cursor);
    expect(extractSortValues).toHaveBeenCalledWith({ id: "img-2" }, undefined, searchKey);
  });

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

    expect(effect.reanchorToTarget).toBe(true);
    expect(selState.setAnchor).not.toHaveBeenCalled();
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

describe("createDragSelect", () => {
  // Loaded window: ids a..f at global positions 10..15.
  const ids = ["a", "b", "c", "d", "e", "f"];
  let selected: Set<string>;

  function setup(initial: string[], loaded = ids) {
    selected = new Set(initial);
    vi.mocked(useSelectionStore.getState).mockReturnValue({
      selectedIds: selected,
      add: vi.fn((more: string[]) => more.forEach((id) => selected.add(id))),
      remove: vi.fn((less: string[]) => less.forEach((id) => selected.delete(id))),
      setAnchor: vi.fn(),
    } as unknown as ReturnType<typeof useSelectionStore.getState>);
    vi.mocked(useSearchStore.getState).mockReturnValue({
      imagePositions: new Map(ids.map((id, i) => [id, 10 + i])),
      results: loaded.map((id) => ({ id })),
      params: { nonFree: "true" },
    } as unknown as ReturnType<typeof useSearchStore.getState>);
  }

  it("paints a range and un-paints what it added when dragged back", () => {
    setup(["a"]);
    const handleRange = vi.fn();
    const drag = createDragSelect(() => ({ handleRange, orderBy: undefined }));
    drag.prime("b", false);
    drag.enter("b", "e");
    expect([...selected].sort()).toEqual(["a", "b", "c", "d", "e"]);
    drag.enter("b", "c");
    expect([...selected].sort()).toEqual(["a", "b", "c"]);
    drag.end();
    expect(handleRange).not.toHaveBeenCalled();
  });

  it("starting on a selected image erases, and never touches unselected ones", () => {
    setup(["a", "b", "c", "d", "f"]);
    const drag = createDragSelect(() => ({ handleRange: vi.fn(), orderBy: undefined }));
    drag.prime("c", true);
    drag.enter("c", "f");
    expect([...selected].sort()).toEqual(["a", "b"]);
    drag.enter("c", "d");
    expect([...selected].sort()).toEqual(["a", "b", "f"]);
  });

  it("an id evicted from the buffer mid-drag is not treated as leaving the range", () => {
    setup(["a", "b", "c", "d", "e", "f"]);
    const drag = createDragSelect(() => ({ handleRange: vi.fn(), orderBy: undefined }));
    drag.prime("a", true);
    drag.enter("a", "c");
    expect([...selected].sort()).toEqual(["d", "e", "f"]);
    // Auto-scroll moved the buffer: a and b are no longer loaded.
    vi.mocked(useSearchStore.getState).mockReturnValue({
      imagePositions: new Map(ids.map((id, i) => [id, 10 + i])),
      results: ["c", "d", "e", "f"].map((id) => ({ id })),
      params: { nonFree: "true" },
    } as unknown as ReturnType<typeof useSearchStore.getState>);
    drag.enter("a", "e");
    expect([...selected].sort()).toEqual(["f"]);
  });

  it.each([false, true])("fills an unloaded part of the range on release (erase=%s)", (erase) => {
    setup(erase ? ["b", "e"] : [], ["b", "e"]);
    const handleRange = vi.fn();
    const drag = createDragSelect(() => ({ handleRange, orderBy: undefined }));
    drag.prime("b", erase);
    drag.enter("b", "e");
    expect(selected.has("b")).toBe(!erase);
    drag.end();
    expect(handleRange).toHaveBeenCalledWith(expect.objectContaining({
      op: "add-range", anchorId: "b", anchorGlobalIndex: 11, targetId: "e", targetGlobalIndex: 14,
    }));
  });
});
