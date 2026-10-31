/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act, fireEvent, screen } from "@testing-library/react";
import { Scrubber } from "./Scrubber";

const scrolling = vi.hoisted(() => ({ container: null as HTMLElement | null }));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/scroll-container-ref", () => ({
  getScrollContainer: () => scrolling.container,
  useScrollContainerGeneration: () => 0,
}));

vi.mock("@/lib/orchestration/search", () => ({
  useHomeThumbReset: () => null,
}));

vi.mock("@/lib/perceived-trace", () => ({
  beginTraceInteraction: () => "test-interaction",
  consumeTraceInteraction: () => "test-interaction",
  trace: () => {},
}));

// Capture ResizeObserver callbacks so we can fire them manually.
let resizeObserverCallback: ResizeObserverCallback | null = null;
class MockResizeObserver {
  constructor(cb: ResizeObserverCallback) {
    resizeObserverCallback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  scrolling.container = null;
  resizeObserverCallback = null;
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default props for a deep-seek scenario (>65k results, no position map). */
function seekModeProps(overrides: Partial<React.ComponentProps<typeof Scrubber>> = {}) {
  return {
    total: 1_300_000,
    currentPosition: 0,
    visibleCount: 50,
    bufferLength: 300,
    loading: false,
    onSeek: vi.fn(),
    twoTier: false,
    ...overrides,
  };
}

/**
 * Simulate a ResizeObserver firing with a given height for the track element.
 * Must be called after render — the track's callback ref registers the observer.
 */
function fireResizeObserver(height: number) {
  if (!resizeObserverCallback) throw new Error("No ResizeObserver registered");
  resizeObserverCallback(
    [{ contentRect: { height } } as unknown as ResizeObserverEntry],
    {} as ResizeObserver,
  );
}

function getThumbTop(container: HTMLElement): number | null {
  const thumb = container.querySelector<HTMLElement>("[data-scrubber-thumb]");
  if (!thumb) return null;
  const raw = thumb.style.top;
  return raw ? parseFloat(raw) : null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("B17 scrubber navigation intent", () => {
  it.each(["buffer", "indexed", "seek"] as const)("classifies %s wheel input before forwarding scroll", (regime) => {
    const container = document.createElement("div");
    Object.defineProperties(container, { scrollHeight: { value: 320000 }, clientHeight: { value: 600 } });
    scrolling.container = container;
    const onBrowsePosition = vi.fn(() => { expect(container.scrollTop).toBe(0); });
    render(<Scrubber {...seekModeProps({ total: regime === "buffer" ? 800 : regime === "indexed" ? 12000 : 70000,
      bufferLength: regime === "buffer" ? 800 : 200, twoTier: regime === "indexed", onBrowsePosition })} />);
    fireEvent.wheel(screen.getByRole("slider"), { deltaY: 4000 });
    expect(container.scrollTop).toBe(4000);
    expect(onBrowsePosition).toHaveBeenCalledTimes(regime === "indexed" ? 1 : 0);
  });

  it("uses current indexed wheel props after the scrubber changes regime", () => {
    const container = document.createElement("div");
    Object.defineProperties(container, { scrollHeight: { value: 320000 }, clientHeight: { value: 600 } });
    scrolling.container = container;
    const onBrowsePosition = vi.fn();
    const view = render(<Scrubber {...seekModeProps({ onBrowsePosition })} />);
    view.rerender(<Scrubber {...seekModeProps({ total: 12000, twoTier: true, onBrowsePosition })} />);
    fireEvent.wheel(screen.getByRole("slider"), { deltaY: 4000 });
    expect(onBrowsePosition).toHaveBeenCalledExactlyOnceWith(Math.round(4000 / 319400 * 11950));
  });

  it.each(["buffer", "indexed", "seek"] as const)("records %s intent before changing the viewport", (regime) => {
    const scrollContainer = document.createElement("div");
    Object.defineProperties(scrollContainer, { scrollHeight: { value: 320000 }, clientHeight: { value: 600 } });
    scrolling.container = scrollContainer;
    const onBrowsePosition = vi.fn((offset: number) => {
      expect(offset).toBeGreaterThan(0);
      expect(scrollContainer.scrollTop).toBe(0);
    });
    const onSeek = vi.fn();
    const total = regime === "buffer" ? 800 : regime === "indexed" ? 12000 : 70000;
    render(<Scrubber {...seekModeProps({ total, bufferLength: regime === "buffer" ? 800 : 200,
      twoTier: regime === "indexed", onSeek, onBrowsePosition })} />);
    const slider = screen.getByRole("slider", { name: "Result set position" });
    Object.defineProperty(slider, "clientHeight", { value: 600 });
    slider.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 600, right: 20,
      x: 0, y: 0, width: 20, height: 600, toJSON: () => ({}) });
    fireEvent.click(slider, { clientY: 300 });
    if (regime === "indexed") {
      expect(onBrowsePosition).toHaveBeenCalledOnce();
      expect(onBrowsePosition.mock.calls[0][0]).toBeGreaterThan(5000);
      expect(scrollContainer.scrollTop).toBeGreaterThan(0);
      expect(onSeek).not.toHaveBeenCalled();
    } else {
      expect(onBrowsePosition).not.toHaveBeenCalled();
      expect(onSeek).toHaveBeenCalledTimes(regime === "seek" ? 1 : 0);
    }
  });
});

describe("Scrubber seek-mode position sync", () => {
  const TRACK_HEIGHT = 600;

  it("B18 follows the current owner through supersession and cancellation", () => {
    const view = render(<Scrubber {...seekModeProps({ currentPosition: 650000, pendingPosition: 1040000, loading: true })} />);
    act(() => fireResizeObserver(TRACK_HEIGHT));
    expect(getThumbTop(view.container)).toBeCloseTo(1040000 / 1299950 * 580);
    view.rerender(<Scrubber {...seekModeProps({ currentPosition: 649900, pendingPosition: 325000, loading: true })} />);
    expect(getThumbTop(view.container)).toBeCloseTo(325000 / 1299950 * 580);
    view.rerender(<Scrubber {...seekModeProps({ currentPosition: 649900, pendingPosition: null, loading: true })} />);
    expect(getThumbTop(view.container)).toBeCloseTo(649900 / 1299950 * 580);
    view.rerender(<Scrubber {...seekModeProps({ currentPosition: 0, total: 70000, loading: false })} />);
    expect(getThumbTop(view.container)).toBe(0);
  });

  it("B18 keeps the requested thumb position across pending density viewport reports", () => {
    const onSeek = vi.fn();
    const view = render(<Scrubber {...seekModeProps({ currentPosition: 650000, onSeek })} />);
    act(() => fireResizeObserver(TRACK_HEIGHT));
    const slider = screen.getByRole("slider");
    Object.defineProperty(slider, "clientHeight", { value: TRACK_HEIGHT });
    slider.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 600, right: 20,
      x: 0, y: 0, width: 20, height: 600, toJSON: () => ({}) });
    fireEvent.click(slider, { clientY: 480 });
    expect(onSeek).toHaveBeenCalledOnce();
    const requestedTop = getThumbTop(view.container);
    expect(requestedTop).toBeGreaterThan(400);
    const pendingPosition = onSeek.mock.calls[0][0];
    view.rerender(<Scrubber {...seekModeProps({ currentPosition: 650000, pendingPosition, loading: true, onSeek })} />);
    view.rerender(<Scrubber {...seekModeProps({ currentPosition: 649900, pendingPosition, visibleCount: 20, loading: true, onSeek })} />);
    expect(getThumbTop(view.container)).toBeCloseTo(requestedTop!, 1);
    view.rerender(<Scrubber {...seekModeProps({ currentPosition: 649900, pendingPosition, visibleCount: 20, onSeek })} />);
    expect(getThumbTop(view.container)).toBeCloseTo(requestedTop!, 1);
    view.rerender(<Scrubber {...seekModeProps({ currentPosition: 1040000, visibleCount: 20, onSeek })} />);
    expect(getThumbTop(view.container)).toBeCloseTo(1040000 / (1300000 - 20) * 580);
    view.rerender(<Scrubber {...seekModeProps({ currentPosition: 0, onSeek })} />);
    expect(getThumbTop(view.container)).toBe(0);
  });

  it("allows thumb to reset to 0 when loading=false (sort change without focus)", async () => {
    // Phase 1: render at a deep position (~50% of 1.3M results).
    const { rerender, container } = render(
      <Scrubber {...seekModeProps({ currentPosition: 650_000 })} />,
    );

    // Fire ResizeObserver so trackHeight > 0 → thumbTop is meaningful.
    act(() => fireResizeObserver(TRACK_HEIGHT));

    // The mount callback ref sets initial thumb position.
    // Force the seek-mode discrete sync effect to run.
    await act(async () => {});

    const deepTop = getThumbTop(container);
    expect(deepTop).not.toBeNull();
    expect(deepTop!).toBeGreaterThan(50);

    // Phase 2: sort change without focus — final position is 0.
    rerender(
      <Scrubber {...seekModeProps({ currentPosition: 0, loading: false })} />,
    );
    await act(async () => {});

    const resetTop = getThumbTop(container);
    expect(resetTop).toBe(0);
  });

  it("remains clickable and exposes approximate date text without HTML", () => {
    const onSeek = vi.fn();
    const { container } = render(
      <Scrubber
        {...seekModeProps({
          currentPosition: 500_000,
          onSeek,
          getSortLabel: () =>
            'Approx. <span style="display:inline-block">Mar</span> 2024',
        })}
      />,
    );
    act(() => fireResizeObserver(TRACK_HEIGHT));

    const slider = screen.getByRole("slider", { name: "Result set position" });
    expect(slider.getAttribute("aria-valuetext")).toContain("Approx. Mar 2024");
    expect(slider.getAttribute("aria-valuetext")).not.toContain("<span");

    Object.defineProperty(slider, "clientHeight", { value: TRACK_HEIGHT });
    slider.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 20,
      bottom: TRACK_HEIGHT,
      width: 20,
      height: TRACK_HEIGHT,
      toJSON: () => ({}),
    });
    fireEvent.click(container.querySelector('[data-testid="scrubber-track"]')!, {
      clientY: TRACK_HEIGHT / 2,
    });
    expect(onSeek).toHaveBeenCalledOnce();
  });
});
