// @vitest-environment jsdom

import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const preview = vi.hoisted(() => {
  const results: Image[] = ["image-first", "image-next"].map(id => ({ id, metadata: {},
    uploadTime: "2026-11-01T00:00:00Z", uploadedBy: "fixture",
    source: { mimeType: "image/jpeg", dimensions: { width: 400, height: 300 } } }));
  const state = { focusedImageId: results[0].id as string | null, results, bufferOffset: 0,
    imagePositions: new Map(results.map((image, index) => [image.id, index])),
    setFocusedImageId: vi.fn((focusedImageId: string | null) => { useSearchStore.setState({ focusedImageId }); }) };
  return { state, enter: null as null | (() => void), scroll: vi.fn() };
});

vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ history: {} }) }));
vi.mock("@/stores/search-store", async () => ({ useSearchStore: (await import("zustand")).create(() => preview.state) }));
vi.mock("@/stores/ui-prefs-store", () => ({ getEffectiveFocusMode: () => "explicit" }));
vi.mock("@/hooks/useImageTraversal", () => ({
  useImageTraversal: (_imageId: string | null, navigate: (image: typeof preview.state.results[number]) => void) => ({
    prevImage: preview.state.results[0], nextImage: preview.state.results[1],
    goToPrev: () => navigate(preview.state.results[0]), goToNext: () => navigate(preview.state.results[1]),
  }),
}));
vi.mock("@/hooks/useCursorAutoHide", () => ({ useCursorAutoHide: () => ({ cursorHidden: false, navMouseEnter: vi.fn(), navMouseLeave: vi.fn() }) }));
vi.mock("@/hooks/usePinchZoom", () => ({ usePinchZoom: vi.fn() }));
vi.mock("@/hooks/useKeyboardShortcut", () => ({ useKeyboardShortcut: vi.fn() }));
vi.mock("@/lib/image-prefetch", () => ({ prefetchNearbyImages: vi.fn(), getCarouselImageUrl: () => "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" }));
vi.mock("@/lib/image-urls", () => ({ getZoomImageUrl: () => undefined }));
vi.mock("@/lib/orchestration/search", () => ({
  registerEnterPreview: (enter: (() => void) | null) => { preview.enter = enter; },
  scrollFocusedIntoView: preview.scroll,
}));
vi.mock("@/lib/perceived-trace", () => ({ beginTraceInteraction: () => "test-exit", traceInteraction: vi.fn() }));

import { requestFullscreenExit, shouldRecoverFullscreenBack } from "./fullscreen-exit";
import { FullscreenPreview } from "@/components/FullscreenPreview";
import { useSearchStore } from "@/stores/search-store";
import type { Image } from "@/types/image";

describe("requestFullscreenExit", () => {
  it("does not finalize when exitFullscreen rejects", async () => {
    const finalize = vi.fn();
    const recover = vi.fn();

    const exited = await requestFullscreenExit(
      () => Promise.reject(new Error("denied")),
      () => true,
      finalize,
      recover,
    );

    expect(exited).toBe(false);
    expect(finalize).not.toHaveBeenCalled();
    expect(recover).toHaveBeenCalledOnce();
  });

  it("finalizes successful exit when fullscreenchange did not do so", async () => {
    const finalize = vi.fn();

    const exited = await requestFullscreenExit(
      () => Promise.resolve(),
      () => false,
      finalize,
    );

    expect(exited).toBe(true);
    expect(finalize).toHaveBeenCalledOnce();
  });

  it("does not finalize while native fullscreen remains active", async () => {
    const finalize = vi.fn();

    const exited = await requestFullscreenExit(
      () => Promise.resolve(),
      () => true,
      finalize,
    );

    expect(exited).toBe(false);
    expect(finalize).not.toHaveBeenCalled();
  });
});

describe("shouldRecoverFullscreenBack", () => {
  it("recovers only while the same preview and native fullscreen remain active", () => {
    expect(shouldRecoverFullscreenBack(true, true)).toBe(true);
    expect(shouldRecoverFullscreenBack(false, true)).toBe(false);
    expect(shouldRecoverFullscreenBack(true, false)).toBe(false);
    expect(shouldRecoverFullscreenBack(false, false)).toBe(false);
  });
});

describe("KUP-027 mounted settlement with mocked native lifecycle", () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  let fullscreenElement: Element | null = null;
  const descriptors = {
    request: Object.getOwnPropertyDescriptor(Element.prototype, "requestFullscreen"),
    exit: Object.getOwnPropertyDescriptor(document, "exitFullscreen"),
    element: Object.getOwnPropertyDescriptor(document, "fullscreenElement"),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    frames.clear();
    nextFrame = 0;
    fullscreenElement = null;
    preview.state.focusedImageId = "image-first";
    useSearchStore.setState(preview.state);
    preview.scroll.mockClear();
    history.replaceState({}, "");
    vi.spyOn(history, "back").mockImplementation(() => {});
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const handle = ++nextFrame;
      frames.set(handle, callback);
      return handle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => { frames.delete(handle); });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
    Object.defineProperty(Element.prototype, "requestFullscreen", { configurable: true, value: async function(this: Element) {
      fullscreenElement = this;
      document.dispatchEvent(new Event("fullscreenchange"));
    } });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    } });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const [target, property, descriptor] of [
      [Element.prototype, "requestFullscreen", descriptors.request],
      [document, "exitFullscreen", descriptors.exit],
      [document, "fullscreenElement", descriptors.element],
    ] as const) {
      if (descriptor) Object.defineProperty(target, property, descriptor);
      else Reflect.deleteProperty(target, property);
    }
    frames.clear();
  });

  function frame() {
    act(() => {
      const pending = [...frames];
      frames.clear();
      for (const [, callback] of pending) callback(0);
    });
  }

  async function exitAfterTraversal() {
    const view = render(createElement(FullscreenPreview));
    await act(async () => { preview.enter!(); });
    act(() => vi.advanceTimersByTime(500));
    act(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(useSearchStore.getState().focusedImageId).toBe("image-next");
    await act(async () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true })));
    expect(document.fullscreenElement).toBeNull();
    expect(history.back).toHaveBeenCalledOnce();
    return view;
  }

  it("waits for the unchanged resize quiet period and finalizes once", async () => {
    await exitAfterTraversal();
    act(() => window.dispatchEvent(new Event("resize")));
    act(() => vi.advanceTimersByTime(149));
    expect(frames.size).toBe(0);
    act(() => vi.advanceTimersByTime(1));
    expect(frames.size).toBe(1);
    frame();
    act(() => vi.advanceTimersByTime(1000));
    frame();
    expect(preview.scroll).toHaveBeenCalledOnce();
    expect(history.back).toHaveBeenCalledOnce();
  });

  it("updates loaded fullscreen alt when the resident title changes", async () => {
    const titlePage = (title: string) => preview.state.results.map((image, index) =>
      index === 0 ? { ...image, metadata: { title } } : image);
    useSearchStore.setState({ results: titlePage("Earlier title") });
    const view = render(createElement(FullscreenPreview));
    await act(async () => { preview.enter!(); });
    const image = view.container.querySelector("img")!;
    expect(image.alt).toBe("");
    act(() => image.dispatchEvent(new Event("load")));
    expect(image.alt).toBe("Earlier title");
    act(() => useSearchStore.setState({ results: titlePage("Published title") }));
    expect(view.container.querySelector("img")).toBe(image);
    expect(image.alt).toBe("Published title");
  });

  it("retains the one-second safety cap during continuing resize", async () => {
    await exitAfterTraversal();
    for (let step = 0; step < 10; step++) {
      act(() => window.dispatchEvent(new Event("resize")));
      act(() => vi.advanceTimersByTime(100));
    }
    expect(frames.size).toBe(1);
    frame();
    expect(preview.scroll).toHaveBeenCalledOnce();
  });

  for (const phase of ["quiet-period", "queued-frame"] as const) {
    it(`disposed ${phase} work cannot invoke the current view's centering`, async () => {
      const previous = await exitAfterTraversal();
      if (phase === "queued-frame") act(() => vi.advanceTimersByTime(50));
      previous.unmount();
      render(createElement(FullscreenPreview));
      act(() => vi.advanceTimersByTime(1000));
      frame();
      expect(preview.scroll).not.toHaveBeenCalled();
    });
  }

  it("a new preview during resize settling keeps the older exit inert", async () => {
    await exitAfterTraversal();
    act(() => window.dispatchEvent(new Event("resize")));
    await act(async () => { preview.enter!(); });
    act(() => vi.advanceTimersByTime(500));
    frame();
    expect(document.fullscreenElement).not.toBeNull();
    expect(document.querySelector('[data-fullscreen-preview="active"]')).not.toBeNull();
    expect(preview.scroll).not.toHaveBeenCalled();
    expect(history.back).toHaveBeenCalledOnce();
  });
});