/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act, fireEvent, screen } from "@testing-library/react";
import { Scrubber } from "./Scrubber";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/scroll-container-ref", () => ({
  getScrollContainer: () => null,
  useScrollContainerGeneration: () => 0,
}));

vi.mock("@/lib/orchestration/search", () => ({
  getThumbResetGeneration: () => 0,
}));

vi.mock("@/lib/perceived-trace", () => ({
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
    positionMapLoaded: false,
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

describe("Scrubber seek-mode position sync", () => {
  const TRACK_HEIGHT = 600;

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
