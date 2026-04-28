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
