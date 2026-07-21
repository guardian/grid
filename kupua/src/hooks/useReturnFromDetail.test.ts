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
import { renderHook, act } from "@testing-library/react";
import type { Virtualizer } from "@tanstack/react-virtual";

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
// ---------------------------------------------------------------------------

// vi.mock factories are hoisted; variables they reference must also be hoisted.
const { mockStoreSetState } = vi.hoisted(() => ({
  mockStoreSetState: vi.fn(),
}));

let mockFocusMode: "explicit" | "phantom" = "explicit";

vi.mock("@/stores/ui-prefs-store", () => ({
  getEffectiveFocusMode: () => mockFocusMode,
}));

// Stub useSearchStore.setState to capture phantom-pulse calls.
vi.mock("@/stores/search-store", () => ({
  useSearchStore: Object.assign(
    () => ({ focusedImageId: null }),
    {
      getState: () => ({ focusedImageId: null }),
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
  // Make requestAnimationFrame fire synchronously so scroll-centering
  // assertions don't need timer management.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
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
    const scrollToIndex = vi.fn();
    const virtualizer = { scrollToIndex } as unknown as Virtualizer<HTMLDivElement, Element>;
    const findImageIndex = vi.fn().mockReturnValue(7);
    const flatIndexToRow = vi.fn().mockReturnValue(3);

    // User entered detail on img-1 with explicit focus on img-1.
    // During detail, navigated prev/next — now wasViewing (imageParam) is
    // still "img-1" (the one we're returning from), but focusedImageId
    // reflects the initial entry image, which is different from wasViewing
    // only when traversal was used. Actually: wasViewing = prevImageParam.current
    // (the image param at last render), and previousFocus = focusedImageId at
    // close time. To trigger centering: wasViewing !== previousFocus.
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

    // wasViewing = "img-2", previousFocus = "img-1" → wasViewing !== previousFocus
    // → scroll centering should fire (via rAF, but jsdom runs rAF synchronously).
    expect(findImageIndex).toHaveBeenCalledWith("img-2");
    // scrollToIndex is inside requestAnimationFrame; jsdom fires rAF synchronously
    // in act(), so we can assert it here.
    expect(scrollToIndex).toHaveBeenCalledWith(3, { align: "center" });
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
