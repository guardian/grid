/**
 * @vitest-environment jsdom
 *
 * Unit tests for useReturnFromDetail — focus / scroll restore on detail close.
 *
 * These tests exercise the transition `imageParam present → absent` that fires
 * when the user closes the image-detail overlay.  The critical case is
 * **phantom mode**, where `focusedImageId` is always null (phantom mode never
 * sets an explicit focus), and the guard `if (previousFocus === null) return`
 * must NOT bail out.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { Virtualizer } from "@tanstack/react-virtual";

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
// ---------------------------------------------------------------------------

// vi.mock factories are hoisted; variables they reference must also be hoisted.
const { mockStoreSetState, mockSearchGeneration, mockStoreState } = vi.hoisted(() => ({
  mockStoreSetState: vi.fn(),
  mockSearchGeneration: vi.fn(() => 0),
  mockStoreState: { focusedImageId: null as string | null },
}));

let mockFocusMode: "explicit" | "phantom" = "explicit";

vi.mock("@/stores/ui-prefs-store", () => ({
  getEffectiveFocusMode: () => mockFocusMode,
}));

// Stub useSearchStore.setState to capture phantom-pulse calls.
vi.mock("@/stores/search-store", () => ({
  getSearchGeneration: mockSearchGeneration,
  useSearchStore: Object.assign(
    () => ({ focusedImageId: null }),
    {
      getState: () => mockStoreState,
      setState: mockStoreSetState,
    },
  ),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks are declared
// ---------------------------------------------------------------------------

import { useReturnFromDetail } from "./useReturnFromDetail";
import { suppressReturnFromDetail } from "./useReturnFromDetail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVirtualizer(): Virtualizer<HTMLDivElement, Element> {
  return {
    scrollToIndex: vi.fn(),
  } as unknown as Virtualizer<HTMLDivElement, Element>;
}

interface Props {
  imageParam: string | undefined;
  focusedImageId: string | null;
  setFocusedImageId: (id: string | null) => void;
  findImageIndex: (id: string) => number;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  flatIndexToRow: (flatIndex: number) => number;
  scrollRowToCenter?: (rowIndex: number) => void;
}

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    imageParam: "img-1",
    focusedImageId: null,
    setFocusedImageId: vi.fn(),
    findImageIndex: vi.fn().mockReturnValue(-1),
    virtualizer: makeVirtualizer(),
    flatIndexToRow: vi.fn().mockReturnValue(0),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockFocusMode = "explicit";
  mockStoreSetState.mockClear();
  mockSearchGeneration.mockReturnValue(0);
  mockStoreState.focusedImageId = null;
  history.replaceState({}, "");
  // Make requestAnimationFrame fire synchronously so scroll-centering
  // assertions don't need timer management.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useReturnFromDetail — phantom mode", () => {
  it("calls setFocusedImageId(wasViewing) when detail closes with null focusedImageId in phantom mode", () => {
    // Bug #8: in phantom mode focusedImageId is always null, yet closing the
    // detail must still call setFocusedImageId so the list scrolls back.
    mockFocusMode = "phantom";
    const setFocusedImageId = vi.fn();
    const props = makeProps({ imageParam: "img-1", focusedImageId: null, setFocusedImageId });

    const { rerender } = renderHook((p: Props) => useReturnFromDetail(p), {
      initialProps: props,
    });

    // Simulate closing the detail overlay
    act(() => {
      rerender({ ...props, imageParam: undefined });
    });

    expect(setFocusedImageId).toHaveBeenCalledOnce();
    expect(setFocusedImageId).toHaveBeenCalledWith("img-1");
  });

  it("emits a phantom pulse when detail closes in phantom mode", () => {
    mockFocusMode = "phantom";
    const props = makeProps({ imageParam: "img-1", focusedImageId: null });

    const { rerender } = renderHook((p: Props) => useReturnFromDetail(p), {
      initialProps: props,
    });

    act(() => {
      rerender({ ...props, imageParam: undefined });
    });

    expect(mockStoreSetState).toHaveBeenCalledWith({
      _phantomPulseImageId: "img-1",
    });
  });
});

describe("useReturnFromDetail — explicit mode", () => {
  it("does NOT call setFocusedImageId when focusedImageId is null in explicit mode (intentional reset)", () => {
    // The guard exists to protect against resetToHome: when something
    // intentionally clears focusedImageId before the detail closes (e.g. logo
    // click), we must not re-set it.  This only applies in explicit mode.
    mockFocusMode = "explicit";
    const setFocusedImageId = vi.fn();
    const props = makeProps({ imageParam: "img-1", focusedImageId: null, setFocusedImageId });

    const { rerender } = renderHook((p: Props) => useReturnFromDetail(p), {
      initialProps: props,
    });

    act(() => {
      rerender({ ...props, imageParam: undefined });
    });

    expect(setFocusedImageId).not.toHaveBeenCalled();
  });

  it("calls setFocusedImageId(wasViewing) when explicit mode has a non-null previous focus", () => {
    mockFocusMode = "explicit";
    const setFocusedImageId = vi.fn();
    const props = makeProps({
      imageParam: "img-1",
      focusedImageId: "img-1",
      setFocusedImageId,
    });

    const { rerender } = renderHook((p: Props) => useReturnFromDetail(p), {
      initialProps: props,
    });

    act(() => {
      rerender({ ...props, imageParam: undefined });
    });

    expect(setFocusedImageId).toHaveBeenCalledOnce();
    expect(setFocusedImageId).toHaveBeenCalledWith("img-1");
  });

  it("scrolls to center when user navigated to a different image via prev/next in detail (explicit mode)", () => {
    mockFocusMode = "explicit";
    history.replaceState({ _detailEntryImageId: "img-1" }, "");
    const scrollToIndex = vi.fn();
    const virtualizer = { scrollToIndex } as unknown as Virtualizer<HTMLDivElement, Element>;
    const findImageIndex = vi.fn().mockReturnValue(7);
    const flatIndexToRow = vi.fn().mockReturnValue(3);

    // User entered detail on img-1, then navigated to img-2. History state
    // preserves img-1 as immutable entry identity while imageParam changes.
    const props = makeProps({
      imageParam: "img-2",   // user navigated to img-2 in detail
      focusedImageId: "img-1", // explicit focus is on img-1 (the entry image)
      virtualizer,
      findImageIndex,
      flatIndexToRow,
    });

    const { rerender } = renderHook((p: Props) => useReturnFromDetail(p), {
      initialProps: props,
    });

    act(() => {
      rerender({ ...props, imageParam: undefined });
    });

    // Closing img-2 differs from entry img-1, so centering should fire.
    expect(findImageIndex).toHaveBeenCalledWith("img-2");
    // scrollToIndex is inside requestAnimationFrame; jsdom fires rAF synchronously
    // in act(), so we can assert it here.
    expect(scrollToIndex).toHaveBeenCalledWith(3, { align: "center" });
  });

  it("centers a traversed image when reload restoration changed focus to the closing image", () => {
    mockFocusMode = "explicit";
    history.replaceState({ _detailEntryImageId: "img-1" }, "");
    const scrollToIndex = vi.fn();
    const virtualizer = { scrollToIndex } as unknown as Virtualizer<HTMLDivElement, Element>;
    const props = makeProps({
      imageParam: "img-2",
      focusedImageId: "img-2",
      virtualizer,
      findImageIndex: vi.fn().mockReturnValue(7),
      flatIndexToRow: vi.fn().mockReturnValue(3),
    });

    const { rerender } = renderHook((p: Props) => useReturnFromDetail(p), {
      initialProps: props,
    });

    act(() => {
      rerender({ ...props, imageParam: undefined });
    });

    expect(scrollToIndex).toHaveBeenCalledWith(3, { align: "center" });
  });

  it("preserves native position when reload restoration changed focus without traversal", () => {
    mockFocusMode = "explicit";
    history.replaceState({ _detailEntryImageId: "img-1" }, "");
    const findImageIndex = vi.fn().mockReturnValue(7);
    const scrollToIndex = vi.fn();
    const props = makeProps({
      imageParam: "img-1",
      focusedImageId: "img-2",
      findImageIndex,
      virtualizer: { scrollToIndex } as unknown as Virtualizer<HTMLDivElement, Element>,
    });

    const { rerender } = renderHook((p: Props) => useReturnFromDetail(p), {
      initialProps: props,
    });

    act(() => {
      rerender({ ...props, imageParam: undefined });
    });

    expect(findImageIndex).not.toHaveBeenCalled();
    expect(scrollToIndex).not.toHaveBeenCalled();
  });

  it("rebases entry identity when forward navigation starts a new detail session", () => {
    mockFocusMode = "explicit";
    history.replaceState({ _detailEntryImageId: "img-1" }, "");
    const findImageIndex = vi.fn().mockReturnValue(7);
    const scrollToIndex = vi.fn();
    const props = makeProps({
      imageParam: undefined,
      focusedImageId: "img-2",
      findImageIndex,
      virtualizer: { scrollToIndex } as unknown as Virtualizer<HTMLDivElement, Element>,
    });

    const { rerender } = renderHook((p: Props) => useReturnFromDetail(p), {
      initialProps: props,
    });

    act(() => {
      rerender({ ...props, imageParam: "img-2" });
    });
    act(() => {
      rerender({ ...props, imageParam: undefined });
    });

    expect(findImageIndex).not.toHaveBeenCalled();
    expect(scrollToIndex).not.toHaveBeenCalled();
    expect(history.state._detailEntryImageId).toBe("img-2");
  });
});

describe("useReturnFromDetail — suppressReturnFromDetail (resetToHome)", () => {
  it("skips scroll restoration in phantom mode when suppressReturnFromDetail was called", () => {
    // Regression: on mobile (phantom mode), pressing Home from image detail
    // cleared focusedImageId, but useReturnFromDetail re-set focus to the
    // old image and scrolled to it instead of staying at the top.
    mockFocusMode = "phantom";
    const setFocusedImageId = vi.fn();
    const props = makeProps({ imageParam: "img-1", focusedImageId: null, setFocusedImageId });

    const { rerender } = renderHook((p: Props) => useReturnFromDetail(p), {
      initialProps: props,
    });

    suppressReturnFromDetail();

    act(() => {
      rerender({ ...props, imageParam: undefined });
    });

    expect(setFocusedImageId).not.toHaveBeenCalled();
  });

  it("suppress flag is consumed (one-shot) — next close works normally", () => {
    mockFocusMode = "phantom";
    const setFocusedImageId = vi.fn();
    const props = makeProps({ imageParam: "img-1", focusedImageId: null, setFocusedImageId });

    const { rerender } = renderHook((p: Props) => useReturnFromDetail(p), {
      initialProps: props,
    });

    // First close: suppressed
    suppressReturnFromDetail();
    act(() => {
      rerender({ ...props, imageParam: undefined });
    });
    expect(setFocusedImageId).not.toHaveBeenCalled();

    // Re-enter detail
    act(() => {
      rerender({ ...props, imageParam: "img-2" });
    });

    // Second close: NOT suppressed — normal phantom restore fires
    act(() => {
      rerender({ ...props, imageParam: undefined });
    });
    expect(setFocusedImageId).toHaveBeenCalledOnce();
    expect(setFocusedImageId).toHaveBeenCalledWith("img-2");
  });

  it("stale flag from Home-on-grid must not suppress a later, unrelated detail close", () => {
    // Regression: Home pressed while already on the grid (no detail open)
    // still calls suppressReturnFromDetail() — but the closing-transition
    // branch never runs (no wasViewing), so the flag was never consumed.
    // It then leaked into the NEXT, entirely unrelated detail session:
    //   Home -> enter image A -> traverse to image K -> exit
    // produced focus stuck on A instead of updating to K.
    mockFocusMode = "explicit";
    const setFocusedImageId = vi.fn();
    // Mount already on the grid — no detail open.
    const props = makeProps({ imageParam: undefined, focusedImageId: null, setFocusedImageId });

    const { rerender } = renderHook((p: Props) => useReturnFromDetail(p), {
      initialProps: props,
    });

    // Home clicked from the grid: sets the flag, but there's no closing
    // transition here to consume it (imageParam stays undefined).
    suppressReturnFromDetail();
    act(() => {
      rerender({ ...props, imageParam: undefined });
    });
    expect(setFocusedImageId).not.toHaveBeenCalled();

    // Enter image A — fresh detail session opens. This must clear the
    // stale flag left over from the Home click above.
    act(() => {
      rerender({ ...props, imageParam: "img-A", focusedImageId: "img-A" });
    });

    // Traverse to image K.
    act(() => {
      rerender({ ...props, imageParam: "img-K", focusedImageId: "img-A" });
    });

    // Exit: focus must update to the last-viewed image (K), not be
    // suppressed by the stale flag.
    act(() => {
      rerender({ ...props, imageParam: undefined, focusedImageId: "img-A" });
    });

    expect(setFocusedImageId).toHaveBeenCalledOnce();
    expect(setFocusedImageId).toHaveBeenCalledWith("img-K");
  });
});

describe("KUP-018 queued return ownership and geometry", () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;

  beforeEach(() => {
    frames.clear();
    nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const handle = ++nextFrame;
      frames.set(handle, callback);
      return handle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => { frames.delete(handle); });
  });

  function frame() {
    act(() => {
      const pending = [...frames];
      frames.clear();
      for (const [, callback] of pending) callback(0);
    });
  }

  function closeAfterTraversal() {
    const scrollToIndex = vi.fn();
    const props = makeProps({ imageParam: "img-1", focusedImageId: "img-1",
      setFocusedImageId: vi.fn((imageId) => { mockStoreState.focusedImageId = imageId; }),
      virtualizer: { scrollToIndex } as unknown as Virtualizer<HTMLDivElement, Element>,
      findImageIndex: vi.fn(() => 12), flatIndexToRow: (index) => Math.floor(index / 2) });
    const view = renderHook((current: Props) => useReturnFromDetail(current), { initialProps: props });
    act(() => view.rerender({ ...props, imageParam: "img-2" }));
    const closed = { ...props, imageParam: undefined };
    act(() => view.rerender(closed));
    expect(frames.size).toBe(1);
    expect(props.setFocusedImageId).toHaveBeenCalledExactlyOnceWith("img-2");
    return { view, props, closed, scrollToIndex };
  }

  it("centers the original valid return exactly once", () => {
    const fixture = closeAfterTraversal();
    expect(fixture.scrollToIndex).not.toHaveBeenCalled();
    frame();
    frame();
    expect(fixture.scrollToIndex).toHaveBeenCalledExactlyOnceWith(6, { align: "center" });
  });

  for (const change of ["reopen", "dispose", "query", "history", "focus", "clear-focus"] as const) {
    it(`does not apply a return after ${change}`, () => {
      const fixture = closeAfterTraversal();
      act(() => {
        if (change === "reopen") fixture.view.rerender({ ...fixture.props, imageParam: "img-3" });
        if (change === "dispose") fixture.view.unmount();
        if (change === "query") mockSearchGeneration.mockReturnValue(1);
        if (change === "history") history.replaceState({ ...history.state, kupuaKey: "new-entry" }, "");
        if (change === "focus") mockStoreState.focusedImageId = "img-3";
        if (change === "clear-focus") mockStoreState.focusedImageId = null;
      });
      frame();
      expect(fixture.scrollToIndex).not.toHaveBeenCalled();
    });
  }

  for (const change of ["columns", "buffer-origin", "header"] as const) {
    it(`recalculates a valid return using current ${change}`, () => {
      const fixture = closeAfterTraversal();
      const scrollRowToCenter = vi.fn();
      act(() => fixture.view.rerender({ ...fixture.closed,
        findImageIndex: change === "buffer-origin" ? vi.fn(() => 32) : fixture.props.findImageIndex,
        flatIndexToRow: change === "columns" ? (index) => Math.floor(index / 4) : fixture.props.flatIndexToRow,
        scrollRowToCenter: change === "header" ? scrollRowToCenter : undefined }));
      frame();
      if (change === "header") {
        expect(scrollRowToCenter).toHaveBeenCalledExactlyOnceWith(6);
        expect(fixture.scrollToIndex).not.toHaveBeenCalled();
      } else {
        expect(fixture.scrollToIndex).toHaveBeenCalledExactlyOnceWith(change === "columns" ? 3 : 16, { align: "center" });
      }
    });
  }

  it("does not redirect a missing original target to another focus", () => {
    const fixture = closeAfterTraversal();
    act(() => fixture.view.rerender({ ...fixture.closed, findImageIndex: vi.fn(() => -1) }));
    frame();
    expect(fixture.scrollToIndex).not.toHaveBeenCalled();
  });

  it("keeps ordinary rerenders and callback replacement from cancelling a valid return", () => {
    const fixture = closeAfterTraversal();
    act(() => fixture.view.rerender({ ...fixture.closed, focusedImageId: "img-2",
      findImageIndex: vi.fn(() => 12), flatIndexToRow: (index) => Math.floor(index / 2) }));
    frame();
    expect(fixture.scrollToIndex).toHaveBeenCalledExactlyOnceWith(6, { align: "center" });
  });
});
