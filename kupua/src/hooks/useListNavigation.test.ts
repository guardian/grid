// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => routeParams,
}));

import { MockDataSource } from "@/dal/mock-data-source";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import { useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";
import { useListNavigation } from "./useListNavigation";
import { clearDensityFocusRatio, useScrollEffects } from "./useScrollEffects";

const routeParams = { nonFree: "true" };
const initialSearch = useSearchStore.getState();
const initialSelection = useSelectionStore.getState();
const initialPreferences = useUiPrefsStore.getState();
const initialFullscreen = Object.getOwnPropertyDescriptor(document, "fullscreenElement");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("requestIdleCallback", vi.fn(() => 1));
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
  clearDensityFocusRatio();
  useSearchStore.setState(initialSearch, true);
  useSelectionStore.setState({ ...initialSelection, selectedIds: new Set(), anchorId: null }, true);
  useUiPrefsStore.setState({ ...initialPreferences, focusMode: "explicit", _pointerCoarse: false }, true);
});

afterEach(() => {
  cleanup();
  clearDensityFocusRatio();
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (initialFullscreen) Object.defineProperty(document, "fullscreenElement", initialFullscreen);
  else Reflect.deleteProperty(document, "fullscreenElement");
  useSearchStore.setState(initialSearch, true);
  useSelectionStore.setState(initialSelection, true);
  useUiPrefsStore.setState(initialPreferences, true);
});

async function mountNavigation(windowed: boolean, mode: "explicit" | "selection" | "phantom" | "none", total = windowed ? 12000 : 300) {
  const source = new MockDataSource(total);
  const params = { nonFree: "true", orderBy: "-uploadTime", length: windowed ? 200 : total };
  const firstPage = await source.searchAfter(params, null, null);
  const origin = firstPage.hits[0].id;
  useSearchStore.setState({
    dataSource: source,
    params,
    results: firstPage.hits,
    total,
    imagePositions: new Map(firstPage.hits.map((image, index) => [image.id, index])),
    bufferOffset: 0,
    focusedImageId: mode === "none" ? null : origin,
    startCursor: firstPage.sortValues[0],
    endCursor: firstPage.sortValues.at(-1),
    loading: false,
  });
  if (mode === "selection") useSelectionStore.setState({ selectedIds: new Set([origin]), anchorId: origin });
  if (mode === "phantom") useUiPrefsStore.setState({ focusMode: "phantom" });

  const container = document.createElement("div");
  document.body.appendChild(container);
  Object.defineProperties(container, {
    clientHeight: { value: 600 },
    clientWidth: { value: 1000 },
    scrollHeight: { get: () => {
      const state = useSearchStore.getState();
      return (isTwoTierFromTotal(state.total) ? state.total : state.results.length) * 32;
    } },
  });
  const parentRef = { current: container };
  const scrollToIndex = vi.fn((index: number) => { container.scrollTop = Math.max(0, (index + 1) * 32 - 600); });
  const virtualizer = {
    options: { count: total },
    range: { startIndex: 0, endIndex: 10 },
    scrollToIndex,
    scrollToOffset: vi.fn((offset: number) => { container.scrollTop = offset; }),
    measure: vi.fn(),
    getVirtualItems: () => [],
  } as unknown as Virtualizer<HTMLDivElement, Element>;
  const loadMore = vi.fn().mockResolvedValue(undefined);
  const reportVisibleRange = vi.fn();
  const geometry = { rowHeight: 32, columns: 1, headerOffset: 0, preserveScrollLeftOnSort: true };
  const findImageIndex = (imageId: string) => {
    const state = useSearchStore.getState();
    return (state.imagePositions.get(imageId) ?? -1) - (isTwoTierFromTotal(state.total) ? 0 : state.bufferOffset);
  };
  let seekWork: Promise<void> | undefined;
  const seekRequests: Promise<void>[] = [];
  const seek = vi.fn((offset: number) => {
    seekWork = useSearchStore.getState().seek(offset);
    seekRequests.push(seekWork);
    return seekWork;
  });
  renderHook(() => {
    const state = useSearchStore();
    const twoTier = isTwoTierFromTotal(state.total);
    const virtualizerCount = twoTier ? state.total : state.results.length;
    virtualizer.options.count = virtualizerCount;
    useScrollEffects({ virtualizer, parentRef, geometry, reportVisibleRange, resultsLength: state.results.length,
      total: state.total, bufferOffset: state.bufferOffset, loadMore, focusedImageId: state.focusedImageId,
      findImageIndex, twoTier });
    useListNavigation({ virtualizer, scrollRef: parentRef, columnsPerRow: 1, rowHeight: 32, headerHeight: 0,
      focusedImageId: state.focusedImageId, setFocusedImageId: state.setFocusedImageId, virtualizerCount,
      getImage: (index) => {
        const current = useSearchStore.getState();
        return current.results[index - (twoTier ? current.bufferOffset : 0)];
      }, findImageIndex, resultsLength: state.results.length, total: state.total, loadMore,
      onEnter: vi.fn(), imageParam: undefined, flatIndexToRow: (index) => index, bufferOffset: state.bufferOffset, seek });
  });
  scrollToIndex.mockClear();
  return {
    origin, source, scrollToIndex, seek, container,
    dispatchKey: (key: string, target: HTMLElement = container) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    },
    finishSeek: () => Promise.all(seekRequests),
    holdRead: () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const original = source.searchAfter.bind(source);
      const read = vi.spyOn(source, "searchAfter").mockImplementationOnce(async (...args) => {
        await gate;
        if (args[3]?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
        return original(...args);
      });
      return { release, read };
    },
    pressEnd: async () => {
      await act(async () => {
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
        await seekWork;
      });
    },
  };
}

describe("KUP-013 End producer and post-seek consumer", () => {
  for (const windowed of [false, true]) {
    for (const mode of ["explicit", "selection", "phantom", "none"] as const) {
      it(`${windowed ? "windowed" : "resident"} End preserves ${mode} focus policy and reaches the tail`, async () => {
        const fixture = await mountNavigation(windowed, mode);
        await fixture.pressEnd();
        const state = useSearchStore.getState();
        const lastImage = state.results.at(-1)!;
        expect(state.bufferOffset + state.results.length).toBe(state.total);
        expect(fixture.scrollToIndex).toHaveBeenCalledWith(state.total - 1, { align: "end" });
        expect(fixture.container.scrollTop).toBeGreaterThan(0);
        expect(fixture.seek).toHaveBeenCalledTimes(windowed ? 1 : 0);
        expect(state._pendingFocusAfterSeek).toBeNull();
        expect(state.focusedImageId).toBe(mode === "explicit" ? lastImage.id : mode === "none" ? null : fixture.origin);
        if (mode === "selection") {
          expect(useSelectionStore.getState().selectedIds).toEqual(new Set([fixture.origin]));
          expect(useSelectionStore.getState().anchorId).toBe(fixture.origin);
          act(() => useSelectionStore.getState().clear());
          expect(useSearchStore.getState().focusedImageId).toBe(fixture.origin);
        }
      });
    }
  }

  for (const mode of ["explicit", "selection", "phantom", "none"] as const) {
    it(`uses buffer-local End coordinates in seek tier with ${mode} focus`, async () => {
      const fixture = await mountNavigation(true, mode, 70000);
      await fixture.pressEnd();
      const state = useSearchStore.getState();
      expect(state.bufferOffset + state.results.length).toBe(70000);
      expect(state._seekTargetGlobalIndex).toBe(-1);
      expect(fixture.scrollToIndex).toHaveBeenCalledWith(state.results.length - 1, { align: "end" });
      expect(state.focusedImageId).toBe(mode === "explicit" ? state.results.at(-1)!.id : mode === "none" ? null : fixture.origin);
      expect(state._pendingFocusAfterSeek).toBeNull();
    });
  }

  for (const startMode of ["selection", "phantom", "none"] as const) {
    it(`does not acquire focus permission when ${startMode} ends during the seek`, async () => {
      const fixture = await mountNavigation(true, startMode);
      const held = fixture.holdRead();
      act(() => fixture.dispatchKey("End"));
      expect(held.read).toHaveBeenCalledOnce();
      act(() => {
        useSelectionStore.getState().clear();
        useUiPrefsStore.getState().setFocusMode("explicit");
        if (startMode === "none") useSearchStore.getState().setFocusedImageId("img-1");
      });
      await act(async () => { held.release(); await fixture.finishSeek(); });
      expect(useSearchStore.getState().focusedImageId).toBe(startMode === "none" ? "img-1" : fixture.origin);
      expect(fixture.scrollToIndex).toHaveBeenCalledWith(11999, { align: "end" });
      expect(useSearchStore.getState()._pendingFocusAfterSeek).toBeNull();
    });
  }

  for (const change of ["focus", "clear-focus", "selection", "phantom"] as const) {
    it(`retains newer ${change} intent during an explicit End seek`, async () => {
      const fixture = await mountNavigation(true, "explicit");
      const held = fixture.holdRead();
      act(() => fixture.dispatchKey("End"));
      expect(held.read).toHaveBeenCalledOnce();
      act(() => {
        if (change === "focus") useSearchStore.getState().setFocusedImageId("img-1");
        if (change === "clear-focus") useSearchStore.getState().setFocusedImageId(null);
        if (change === "selection") useSelectionStore.getState().add(["img-1"]);
        if (change === "phantom") useUiPrefsStore.getState().setFocusMode("phantom");
      });
      const expectedFocus = useSearchStore.getState().focusedImageId;
      await act(async () => { held.release(); await fixture.finishSeek(); });
      expect(useSearchStore.getState().focusedImageId).toBe(expectedFocus);
      expect(fixture.scrollToIndex).toHaveBeenCalledWith(11999, { align: "end" });
      expect(useSearchStore.getState()._pendingFocusAfterSeek).toBeNull();
    });
  }

  it("does not attach End focus or edge scrolling to a newer seek", async () => {
    const fixture = await mountNavigation(true, "explicit");
    const held = fixture.holdRead();
    act(() => fixture.dispatchKey("End"));
    expect(held.read).toHaveBeenCalledOnce();
    await act(async () => { await useSearchStore.getState().seek(7000); });
    await act(async () => { held.release(); await fixture.finishSeek(); });
    expect(useSearchStore.getState().focusedImageId).toBe(fixture.origin);
    expect(fixture.scrollToIndex).not.toHaveBeenCalledWith(11999, { align: "end" });
    expect(useSearchStore.getState()._pendingFocusAfterSeek).toBeNull();
    expect(useSearchStore.getState()._seekTargetGlobalIndex).toBe(7000);
  });

  it("Home supersedes pending End even while the original first page is still resident", async () => {
    const fixture = await mountNavigation(true, "explicit");
    const held = fixture.holdRead();
    act(() => fixture.dispatchKey("End"));
    expect(held.read).toHaveBeenCalledOnce();
    act(() => fixture.dispatchKey("Home"));
    expect(held.read.mock.calls[0][3]?.aborted).toBe(true);
    expect(held.read).toHaveBeenCalledOnce();
    await act(async () => { held.release(); await fixture.finishSeek(); });
    expect(useSearchStore.getState().focusedImageId).toBe(fixture.origin);
    expect(useSearchStore.getState().bufferOffset).toBe(0);
    expect(fixture.container.scrollTop).toBe(0);
    expect(useSearchStore.getState()._pendingFocusAfterSeek).toBeNull();
  });

  for (const outcome of ["failure", "abort"] as const) {
    it(`discards End focus intent after request ${outcome}`, async () => {
      const fixture = await mountNavigation(true, "explicit");
      if (outcome === "failure") {
        vi.spyOn(fixture.source, "searchAfter").mockRejectedValueOnce(new Error("local read failure"));
        await fixture.pressEnd();
        expect(useSearchStore.getState().error).toBe("local read failure");
      } else {
        const held = fixture.holdRead();
        act(() => fixture.dispatchKey("End"));
        expect(held.read).toHaveBeenCalledOnce();
        act(() => useSearchStore.getState().abortExtends());
        expect(held.read.mock.calls[0][3]?.aborted).toBe(true);
        await act(async () => { held.release(); await fixture.finishSeek(); });
      }
      expect(useSearchStore.getState().focusedImageId).toBe(fixture.origin);
      expect(fixture.scrollToIndex).not.toHaveBeenCalledWith(11999, { align: "end" });
      expect(useSearchStore.getState()._pendingFocusAfterSeek).toBeNull();
    });
  }

  for (const target of ["input", "fullscreen"] as const) {
    it(`does not intercept End from ${target}`, async () => {
      const fixture = await mountNavigation(true, "explicit");
      const input = document.createElement("input");
      fixture.container.appendChild(input);
      if (target === "fullscreen") vi.spyOn(document, "fullscreenElement", "get").mockReturnValue(fixture.container);
      let event!: KeyboardEvent;
      act(() => { event = fixture.dispatchKey("End", target === "input" ? input : fixture.container); });
      expect(event.defaultPrevented).toBe(false);
      expect(fixture.seek).not.toHaveBeenCalled();
      expect(fixture.scrollToIndex).not.toHaveBeenCalled();
    });
  }
});