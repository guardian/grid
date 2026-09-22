// @vitest-environment jsdom

import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
vi.mock("@tanstack/react-router", () => ({ useSearch: () => routeParams }));

import { useSearchStore } from "@/stores/search-store";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import type { Image } from "@/types/image";
import { clearDensityFocusRatio, useScrollEffects, type ScrollGeometry } from "./useScrollEffects";

const routeParams = { nonFree: "true" };
const initialState = useSearchStore.getState();
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
const table: ScrollGeometry = { columns: 1, rowHeight: 32, headerOffset: 36, preserveScrollLeftOnSort: true };
const grid: ScrollGeometry = { columns: 4, rowHeight: 303, headerOffset: 0, preserveScrollLeftOnSort: false, minCellWidth: 280 };

beforeEach(() => {
  vi.useFakeTimers();
  frames.clear();
  nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const handle = ++nextFrame;
    frames.set(handle, callback);
    return handle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => { frames.delete(handle); });
  clearDensityFocusRatio();
  const results = Array.from({ length: 800 }, (_, index) => ({ id: `image-${index + 200}` }) as Image);
  useSearchStore.setState({ ...initialState, results, total: 70000, bufferOffset: 200, focusedImageId: "image-400",
    imagePositions: new Map(results.map((image, index) => [image.id, index + 200])) }, true);
});

afterEach(() => {
  cleanup();
  clearDensityFocusRatio();
  frames.clear();
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useSearchStore.setState(initialState, true);
});

function frame() {
  act(() => {
    const pending = [...frames];
    frames.clear();
    for (const [, callback] of pending) callback(performance.now());
  });
}

function mountDensity(initialGeometry: ScrollGeometry, strict = false) {
  const dimensions = { width: 1120, height: 600 };
  let geometry = initialGeometry;
  const container = document.createElement("div");
  document.body.appendChild(container);
  Object.defineProperties(container, {
    clientWidth: { get: () => dimensions.width },
    clientHeight: { get: () => dimensions.height },
    scrollHeight: { get: () => {
      const state = useSearchStore.getState();
      const count = isTwoTierFromTotal(state.total) ? state.total : state.results.length;
      return Math.ceil(count / geometry.columns) * geometry.rowHeight + geometry.headerOffset;
    } },
  });
  const parentRef = { current: container };
  const scrollToIndex = vi.fn((index: number, options?: { align?: string }) => {
    container.scrollTop = options?.align === "end"
      ? container.scrollHeight - container.clientHeight
      : Math.max(0, index * geometry.rowHeight + geometry.headerOffset - container.clientHeight / 2);
  });
  const virtualizer = { options: { count: 0 }, range: { startIndex: 0, endIndex: 1 },
    scrollToIndex, scrollToOffset: vi.fn(), measure: vi.fn(), getVirtualItems: () => [] } as unknown as Virtualizer<HTMLDivElement, Element>;
  const reportVisibleRange = vi.fn();
  const loadMore = vi.fn().mockResolvedValue(undefined);
  const findImageIndex = (imageId: string) => {
    const state = useSearchStore.getState();
    return (state.imagePositions.get(imageId) ?? -1) - (isTwoTierFromTotal(state.total) ? 0 : state.bufferOffset);
  };
  const view = renderHook((props: { geometry: ScrollGeometry }) => {
    const state = useSearchStore();
    geometry = props.geometry;
    const twoTier = isTwoTierFromTotal(state.total);
    virtualizer.options.count = Math.ceil((twoTier ? state.total : state.results.length) / geometry.columns);
    useScrollEffects({ virtualizer, parentRef, geometry, reportVisibleRange, loadMore,
      resultsLength: state.results.length, total: state.total, bufferOffset: state.bufferOffset,
      focusedImageId: state.focusedImageId, findImageIndex, twoTier });
  }, { initialProps: { geometry }, wrapper: strict ? StrictMode : undefined });
  return { ...view, container, dimensions, scrollToIndex,
    changeGeometry: (next: ScrollGeometry) => view.rerender({ geometry: next }) };
}

function transition(sourceGeometry = grid, targetGeometry = table, extremum?: "top" | "bottom") {
  const source = mountDensity(sourceGeometry);
  frame();
  frame();
  source.container.scrollTop = extremum === "top" ? 0 : extremum === "bottom"
    ? source.container.scrollHeight - source.container.clientHeight
    : Math.floor((isTwoTierFromTotal(useSearchStore.getState().total) ? 400 : 200) / sourceGeometry.columns) * sourceGeometry.rowHeight + sourceGeometry.headerOffset - 300;
  source.unmount();
  source.container.remove();
  const target = mountDensity(targetGeometry, true);
  return target;
}

describe("KUP-017 saved density geometry and input lifetime", () => {
  for (const direction of ["grid-table", "table-grid"] as const) {
    it(`preserves the source ratio across ${direction} and Strict Mode replay`, () => {
      const target = direction === "grid-table" ? transition() : transition(table, grid);
      expect(frames.size).toBe(1);
      frame();
      expect(target.container.scrollTop).toBe(0);
      frame();
      expect(target.container.scrollTop).toBe(direction === "grid-table" ? 6136 : 14853);
      expect(frames.size).toBe(0);
    });
  }

  it("uses current columns and viewport size without cancelling a valid restore", () => {
    const target = transition(table, grid);
    frame();
    target.dimensions.width = 840;
    target.dimensions.height = 720;
    target.changeGeometry({ ...grid, columns: 3 });
    frame();
    expect(target.container.scrollTop).toBe(19638);
  });

  it("uses the current sticky-header measurement", () => {
    const target = transition();
    frame();
    target.dimensions.height = 720;
    target.changeGeometry({ ...table, headerOffset: 72 });
    frame();
    expect(target.container.scrollTop).toBe(6112);
  });

  it("uses global indexed coordinates without waiting for a position map", () => {
    useSearchStore.setState({ total: 12000, positionMap: null });
    const target = transition();
    frame();
    frame();
    expect(useSearchStore.getState().positionMap).toBeNull();
    expect(target.container.scrollTop).toBe(12536);
  });

  it("recomputes the local index after a same-context prepend and compensation", () => {
    const target = transition();
    frame();
    act(() => {
      const results = Array.from({ length: 1000 }, (_, index) => ({ id: `image-${index}` }) as Image);
      useSearchStore.setState({ results, bufferOffset: 0, _prependGeneration: 1, _lastPrependCount: 200,
        imagePositions: new Map(results.map((image, index) => [image.id, index])) });
    });
    frame();
    expect(target.container.scrollTop).toBe(12536);
  });

  for (const extremum of ["top", "bottom"] as const) {
    it(`retains the ${extremum} extremum`, () => {
      const target = transition(grid, table, extremum);
      frame();
      frame();
      expect(target.container.scrollTop).toBe(extremum === "top" ? 0 : target.container.scrollHeight - target.container.clientHeight);
      if (extremum === "bottom") expect(target.scrollToIndex).toHaveBeenCalledWith(799, { align: "end" });
    });
  }

  for (const input of ["wheel", "touch", "keyboard"] as const) {
    it(`respects newer ${input} input between frames`, () => {
      const target = transition();
      frame();
      act(() => {
        target.container.scrollTop = 320;
        const event = input === "wheel" ? new WheelEvent("wheel", { deltaY: 320 })
          : input === "touch" ? new Event("touchmove")
          : new KeyboardEvent("keydown", { key: "PageDown", bubbles: true });
        target.container.dispatchEvent(event);
      });
      frame();
      expect(target.container.scrollTop).toBe(320);
      expect(frames.size).toBe(0);
    });
  }

  it("does not treat native-input editing or zoom-wheel geometry as list navigation", () => {
    const target = transition();
    frame();
    const input = document.createElement("input");
    target.container.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      target.container.dispatchEvent(new WheelEvent("wheel", { deltaY: 20, ctrlKey: true }));
    });
    frame();
    expect(target.container.scrollTop).toBe(6136);
  });

  it("does not cancel restoration for a key consumed by another control", () => {
    const target = transition();
    frame();
    const control = document.createElement("button");
    control.addEventListener("keydown", (event) => event.stopPropagation());
    target.container.appendChild(control);
    act(() => control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    frame();
    expect(target.container.scrollTop).toBe(6136);
  });

  it("still observes Home in capture phase before a control consumes the key", () => {
    const target = transition();
    frame();
    const control = document.createElement("button");
    control.addEventListener("keydown", (event) => event.stopPropagation());
    target.container.appendChild(control);
    act(() => control.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    frame();
    expect(target.container.scrollTop).toBe(0);
  });

  it("cancels queued work on disposal without consuming the saved state", () => {
    const target = transition();
    frame();
    target.unmount();
    target.container.remove();
    expect(frames.size).toBe(0);
    const successor = mountDensity(table, true);
    frame();
    frame();
    expect(successor.container.scrollTop).toBe(6136);
  });

  it("does not apply a record cleared by a newer reset", () => {
    const target = transition();
    frame();
    clearDensityFocusRatio();
    frame();
    expect(target.container.scrollTop).toBe(0);
  });
});