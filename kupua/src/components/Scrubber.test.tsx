/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
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

describe("Scrubber flash guard (seek mode)", () => {
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

    // Phase 2: sort change without focus — position drops to 0, loading=false.
    // This is the bug scenario: the flash guard previously blocked this write.
    rerender(
      <Scrubber {...seekModeProps({ currentPosition: 0, loading: false })} />,
    );
    await act(async () => {});

    const resetTop = getThumbTop(container);
    expect(resetTop).toBe(0);
  });

  it("suppresses thumb jump when loading=true (sort-around-focus transient)", async () => {
    // Phase 1: deep position.
    const { rerender, container } = render(
      <Scrubber {...seekModeProps({ currentPosition: 650_000 })} />,
    );
    act(() => fireResizeObserver(TRACK_HEIGHT));
    await act(async () => {});

    const deepTop = getThumbTop(container);
    expect(deepTop).not.toBeNull();
    expect(deepTop!).toBeGreaterThan(50);

    // Phase 2: transient zero while loading — flash guard should suppress.
    rerender(
      <Scrubber {...seekModeProps({ currentPosition: 0, loading: true })} />,
    );
    await act(async () => {});

    const guardedTop = getThumbTop(container);
    // Flash guard kicks in: thumb stays at the deep position.
    expect(guardedTop).toBeGreaterThan(50);
  });
});
