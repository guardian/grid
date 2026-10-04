/** @vitest-environment jsdom */

import { useLayoutEffect, useState, type ComponentProps, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Image } from "@/types/image";
import type { AiSearchResult, ImageByIdResult, SearchParams, SortValues } from "@/dal/types";
import type { EnrichmentFields } from "@/stores/enrichment-store";
import { MockDataSource } from "@/dal/mock-data-source";
import { ApiDataSource } from "@/dal/api-data-source";
import { useSearchStore } from "@/stores/search-store";
import { useEnrichmentStore } from "@/stores/enrichment-store";
import { ImageDetail } from "./ImageDetail";
import { useReturnFromDetail } from "@/hooks/useReturnFromDetail";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import type { Virtualizer } from "@tanstack/react-virtual";
import { chooseDetailReturn, type DetailReturnTarget, type DetailEntry } from "@/lib/detail-return";
import { historySearchContinuity } from "@/lib/search-continuity";

vi.hoisted(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
});

const fixture = vi.hoisted(() => ({
  resident: [] as Image[],
  search: { nonFree: "true", orderBy: "-uploadTime" },
  navigate: vi.fn(),
  cached: vi.fn(() => null as { cursor: [number, string] | null; offset: number } | null),
  markNavigation: vi.fn(),
  relativeMedia: false,
  mediaProps: [] as ComponentProps<"img">[],
  composed: false,
  realDismiss: false,
  spa: true,
  prepareScroll: vi.fn(),
  traverse: (_imageId: string) => {},
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => fixture.navigate,
  useRouter: () => ({ history: { subscribe: () => () => {} } }),
  useSearch: () => fixture.search,
}));
vi.mock("@/hooks/useDataWindow", () => ({ useDataWindow: () => {
  const state = useSearchStore((state) => state);
  return fixture.composed ? {
    total: state.total,
    findImageIndex: (imageId: string) => {
      const ordinal = state.imagePositions.get(imageId);
      return ordinal === undefined ? -1 : isTwoTierFromTotal(state.total) ? ordinal : ordinal - state.bufferOffset;
    },
    getImage: (index: number) => state.results[isTwoTierFromTotal(state.total) ? index - state.bufferOffset : index],
  } : {
    total: fixture.resident.length,
    findImageIndex: (imageId: string) => fixture.resident.findIndex((image) => image.id === imageId),
    getImage: (index: number) => fixture.resident[index],
  };
} }));
vi.mock("@/hooks/useImageTraversal", () => ({ useImageTraversal: () => ({
  prevImage: undefined, nextImage: undefined, currentGlobalIndex: -1,
  goToPrev: vi.fn(), goToNext: vi.fn(),
}) }));
vi.mock("@/hooks/useFullscreen", () => ({ useFullscreen: () => ({ isFullscreen: false, toggleFullscreen: vi.fn() }) }));
vi.mock("@/hooks/useCursorAutoHide", () => ({ useCursorAutoHide: () => ({ cursorHidden: false }) }));
vi.mock("@/hooks/useKeyboardShortcut", () => ({ useKeyboardShortcut: vi.fn() }));
vi.mock("@/hooks/useSwipeCarousel", () => ({ useSwipeCarousel: () => ({ swipedRef: { current: false }, lastSwipeTimeRef: { current: 0 } }) }));
vi.mock("@/hooks/useSwipeDismiss", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useSwipeDismiss")>();
  return { useSwipeDismiss: (options: Parameters<typeof actual.useSwipeDismiss>[0]) =>
    actual.useSwipeDismiss({ ...options, enabled: fixture.realDismiss && options.enabled }) };
});
vi.mock("@/hooks/usePinchZoom", () => ({ usePinchZoom: vi.fn() }));
vi.mock("@/lib/image-urls", () => ({
  getFullImageUrl: (image: Image) => fixture.relativeMedia ? `/__detail_media/full/${image.id}.gif` : `data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7#${image.id}`,
  getThumbnailUrl: (image: Image) => fixture.relativeMedia ? `/__detail_media/thumb/${image.id}.gif` : undefined,
  getZoomImageUrl: () => undefined,
}));
vi.mock("@/lib/image-prefetch", () => ({
  isFullResLoaded: () => false, markFullResLoaded: vi.fn(),
  onFullResDecoded: () => () => {}, getCarouselImageUrl: () => undefined,
}));
vi.mock("@/components/StableImg", () => ({ StableImg: ({ imgRef, ...props }: ComponentProps<"img"> & { imgRef?: React.Ref<HTMLImageElement> }) => {
  fixture.mediaProps.push(props);
  return <img ref={imgRef} {...props} />;
} }));
vi.mock("@/components/ImageMetadata", () => ({ ImageMetadata: ({ image, overlay }: { image: Image; overlay?: EnrichmentFields }) => (
  <span data-testid="metadata">{image.id}: {image.metadata.title}{overlay?.cost ? ` [${overlay.cost}]` : ""}</span>
) }));
vi.mock("@/components/UsagesSection", () => ({ UsagesSection: () => null, countDisplayUsages: () => 0 }));
vi.mock("@/components/PanelLayout", () => ({ AccordionSection: ({ children }: { children: ReactNode }) => <section>{children}</section> }));
vi.mock("@/lib/reset-to-home", () => ({ resetToHome: vi.fn() }));
vi.mock("@/lib/orchestration/search", () => ({
  scrollFocusedIntoView: fixture.prepareScroll, markUserInitiatedNavigation: fixture.markNavigation,
  pushNavigateAsPopstate: vi.fn(), consumeDetailEnteredViaSpaFlag: () => fixture.spa,
}));
vi.mock("@/lib/image-offset-cache", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/image-offset-cache")>(),
  storeImageOffset: vi.fn(), getImageOffset: fixture.cached,
  buildSearchKey: () => "detail-test", extractSortValues: vi.fn(),
}));

function makeImage(imageId: string): Image {
  return { id: imageId, metadata: { title: `Title ${imageId}` }, usages: [] } as unknown as Image;
}

function found(imageId: string, enrichment?: EnrichmentFields): ImageByIdResult {
  return { image: makeImage(imageId), enrichment };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

describe("KUP-004 standalone detail identity", () => {
  const initialState = useSearchStore.getState();
  let dataSource: MockDataSource;
  let transitions: { requested: string; displayed: string | null; text: string }[];

  function Detail({ imageId }: { imageId: string }) {
    useLayoutEffect(() => {
      transitions.push({
        requested: imageId,
        displayed: document.querySelector("[data-detail-image-id]")?.getAttribute("data-detail-image-id") ?? null,
        text: document.body.textContent ?? "",
      });
    }, [imageId]);
    return <ImageDetail imageId={imageId} />;
  }

  beforeEach(() => {
    dataSource = new MockDataSource();
    useSearchStore.setState({ ...initialState, dataSource });
    fixture.resident = [];
    fixture.composed = false;
    fixture.realDismiss = false;
    fixture.spa = true;
    fixture.relativeMedia = false;
    fixture.mediaProps = [];
    fixture.cached.mockReset().mockReturnValue(null);
    fixture.markNavigation.mockClear();
    transitions = [];
    history.replaceState({}, "", "/search");
  });

  afterEach(() => {
    cleanup();
    useSearchStore.setState(initialState, true);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("terminates a relative thumbnail fallback after two media errors", () => {
    fixture.relativeMedia = true;
    fixture.resident = [makeImage("A")];
    render(<Detail imageId="A" />);
    const image = screen.getByAltText("Title A") as HTMLImageElement;
    fireEvent.error(image);
    expect(image.getAttribute("src")).toBe("/__detail_media/thumb/A.gif");
    expect(image.src).not.toBe(image.getAttribute("src"));
    fireEvent.error(image);
    expect(screen.getByText("Image preview not available")).toBeTruthy();
    expect(screen.queryByAltText("Title A")).toBeNull();
  });

  it("never publishes a previous image's failure in the next identity's layout commit", () => {
    fixture.resident = [makeImage("A"), makeImage("B")];
    const mounted = render(<Detail imageId="A" />);
    fireEvent.error(screen.getByAltText("Title A"));
    expect(screen.getByText("Image preview not available")).toBeTruthy();
    mounted.rerender(<Detail imageId="B" />);
    expect(transitions.at(-1)?.text).not.toContain("Image preview not available");
    expect(screen.getByAltText("Title B").getAttribute("src")).toContain("#B");
  });

  it("ignores captured obsolete media callbacks after a newer image takes over the stable element", async () => {
    fixture.relativeMedia = true;
    fixture.resident = [makeImage("A"), makeImage("B")];
    const mounted = render(<Detail imageId="A" />);
    const image = screen.getByAltText("Title A") as HTMLImageElement;
    const obsolete = fixture.mediaProps.at(-1)!;
    mounted.rerender(<Detail imageId="B" />);
    expect(screen.getByAltText("Title B")).toBe(image);
    const { markFullResLoaded } = await import("@/lib/image-prefetch");
    vi.mocked(markFullResLoaded).mockClear();
    act(() => {
      const event = { target: image, currentTarget: image } as unknown as React.SyntheticEvent<HTMLImageElement>;
      obsolete.onError?.(event);
      obsolete.onLoad?.(event);
    });
    expect(image.getAttribute("src")).toBe("/__detail_media/full/B.gif");
    expect(screen.queryByText("Image preview not available")).toBeNull();
    expect(markFullResLoaded).not.toHaveBeenCalled();
    fireEvent.load(image);
    expect(markFullResLoaded).toHaveBeenCalledExactlyOnceWith("B");
  });

  it.each(["null", "undefined", "reject", "success"])("never renders loaded A as pending B, then handles %s", async (outcome) => {
    const pending = deferred<ImageByIdResult | undefined>();
    const lookup = vi.spyOn(dataSource, "getById").mockResolvedValueOnce(found("A")).mockReturnValueOnce(pending.promise);
    const view = render(<Detail imageId="A" />);
    await act(async () => {});
    expect(screen.getByTestId("metadata").textContent).toBe("A: Title A");
    expect(screen.getByAltText("Title A").getAttribute("src")).toContain("#A");
    const wrapper = view.container.firstElementChild;
    const imageContainer = screen.getByAltText("Title A").parentElement?.parentElement?.parentElement;
    view.rerender(<Detail imageId="B" />);
    expect(transitions.at(-1)).toMatchObject({ requested: "B", displayed: null });
    expect(view.container.firstElementChild).toBe(wrapper);
    expect(view.container.contains(imageContainer ?? null)).toBe(true);
    expect(screen.getByRole("button", { name: /Back to search/ })).toBeTruthy();
    expect(screen.queryByText("A: Title A")).toBeNull();
    expect(screen.queryByAltText("Title A")).toBeNull();
    await act(async () => {
      if (outcome === "reject") pending.reject(new Error("unavailable"));
      else pending.resolve(outcome === "success" ? found("B") : outcome === "null" ? null as unknown as undefined : undefined);
    });
    expect(lookup.mock.calls.map(([imageId]) => imageId)).toEqual(["A", "B"]);
    expect(screen.queryByText("A: Title A")).toBeNull();
    expect(view.container.firstElementChild).toBe(wrapper);
    expect(view.container.contains(imageContainer ?? null)).toBe(true);
    if (outcome === "success") {
      expect(screen.getByTestId("metadata").textContent).toBe("B: Title B");
      expect(screen.getByAltText("Title B").getAttribute("src")).toContain("#B");
    } else {
      expect(screen.getByText("Image not found")).toBeTruthy();
      const back = vi.spyOn(history, "back").mockImplementation(() => {});
      fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
      expect(back).toHaveBeenCalledOnce();
      expect(fixture.markNavigation).toHaveBeenCalledOnce();
    }
  });

  it("does not carry A's absence or delayed loading into B's transition", async () => {
    vi.useFakeTimers();
    vi.spyOn(dataSource, "getById").mockResolvedValueOnce(undefined).mockReturnValueOnce(new Promise(() => {}));
    const view = render(<Detail imageId="A" />);
    await act(async () => {});
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByText("Image not found")).toBeTruthy();
    view.rerender(<Detail imageId="B" />);
    expect(transitions.at(-1)?.text).not.toContain("Image not found");
    expect(transitions.at(-1)?.text).not.toContain("Loading image");
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByText(/Loading image/)).toBeTruthy();
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    fireEvent.keyDown(document.body, { key: "Backspace" });
    expect(back).toHaveBeenCalledOnce();
  });

  it.each(["success", "reject"])("ignores obsolete A %s during rapid A-B-C-A navigation", async (outcome) => {
    const requests = Array.from({ length: 4 }, () => deferred<ImageByIdResult | undefined>());
    const lookup = vi.spyOn(dataSource, "getById");
    requests.forEach((request) => lookup.mockReturnValueOnce(request.promise));
    const view = render(<Detail imageId="A" />);
    view.rerender(<Detail imageId="B" />);
    view.rerender(<Detail imageId="C" />);
    view.rerender(<Detail imageId="A" />);
    await act(async () => {
      if (outcome === "reject") requests[0].reject(new Error("obsolete"));
      else requests[0].resolve(found("A"));
      requests[1].resolve(found("B"));
      requests[2].resolve(undefined);
    });
    expect(screen.queryByTestId("metadata")).toBeNull();
    expect(screen.queryByText("Image not found")).toBeNull();
    await act(async () => requests[3].resolve(found("A")));
    expect(screen.getByTestId("metadata").textContent).toBe("A: Title A");
    expect(lookup).toHaveBeenCalledTimes(4);
  });

  it("gives resident B precedence over pending standalone completion and keeps the detail mounted", async () => {
    const pending = deferred<ImageByIdResult | undefined>();
    const lookup = vi.spyOn(dataSource, "getById").mockReturnValueOnce(pending.promise);
    const view = render(<Detail imageId="A" />);
    fixture.resident = [makeImage("B")];
    view.rerender(<Detail imageId="B" />);
    const wrapper = view.container.querySelector("[data-detail-image-id]");
    await act(async () => pending.resolve(found("A")));
    expect(screen.getByTestId("metadata").textContent).toBe("B: Title B");
    expect(lookup).toHaveBeenCalledTimes(1);
    fixture.resident = [makeImage("C")];
    view.rerender(<Detail imageId="C" />);
    expect(view.container.querySelector("[data-detail-image-id]")).toBe(wrapper);
    expect(transitions.at(-1)).toMatchObject({ requested: "C", displayed: "C" });
    expect(history.state._detailEntryImageId).toBe("A");
  });

  it("hands the standalone image's own overlay to the metadata panel without publishing it", async () => {
    vi.spyOn(dataSource, "getById").mockResolvedValueOnce(found("A", { cost: "overquota" }));
    useEnrichmentStore.getState().setEnrichment(new Map());
    render(<Detail imageId="A" />);
    await act(async () => {});
    expect(screen.getByTestId("metadata").textContent).toBe("A: Title A [overquota]");
    expect(useEnrichmentStore.getState().data.has("A")).toBe(false);
    act(() => useEnrichmentStore.getState().setEnrichment(new Map([["fresh-search", { valid: true }]])));
    expect(screen.getByTestId("metadata").textContent).toBe("A: Title A [overquota]");
  });

  it("never shows a standalone overlay under another image", async () => {
    vi.spyOn(dataSource, "getById")
      .mockResolvedValueOnce(found("A", { cost: "overquota" }))
      .mockResolvedValueOnce(found("B"));
    const view = render(<Detail imageId="A" />);
    await act(async () => {});
    view.rerender(<Detail imageId="B" />);
    await act(async () => {});
    expect(screen.getByTestId("metadata").textContent).toBe("B: Title B");
    fixture.resident = [makeImage("A")];
    view.rerender(<Detail imageId="A" />);
    expect(screen.getByTestId("metadata").textContent).toBe("A: Title A");
  });

  it("cancels an obsolete standalone request when the requested image changes", () => {
    const lookup = vi.spyOn(dataSource, "getById").mockReturnValue(new Promise(() => {}));
    const view = render(<Detail imageId="A" />);
    const signal = lookup.mock.calls[0][1];
    expect(signal?.aborted).toBe(false);
    view.rerender(<Detail imageId="B" />);
    expect(signal?.aborted).toBe(true);
    expect(lookup.mock.calls[1][1]?.aborted).toBe(false);
  });

  it("makes no singleton request while traversing resident images", () => {
    const lookup = vi.spyOn(dataSource, "getById");
    fixture.resident = [makeImage("A"), makeImage("B"), makeImage("C")];
    const view = render(<Detail imageId="A" />);
    for (const imageId of ["B", "C", "B", "A"]) view.rerender(<Detail imageId={imageId} />);
    expect(screen.getByTestId("metadata").textContent).toBe("A: Title A");
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("bounded detail return composition", () => {
  const initialState = useSearchStore.getState();
  const initialPrefs = useUiPrefsStore.getState();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  let close: () => void;
  const center = vi.fn();

  function List({ imageId, table = false, policy }: { imageId: string; table?: boolean;
    policy?: (entry: DetailEntry, imageId: string) => DetailReturnTarget }) {
    const [current, setCurrent] = useState<string | undefined>(imageId);
    const state = useSearchStore((state) => state);
    close = () => {
      history.replaceState({ kupuaKey: "list" }, "", "/search");
      setCurrent(undefined);
    };
    fixture.traverse = setCurrent;
    useReturnFromDetail({ imageParam: current,
      setFocusedImageId: state.setFocusedImageId,
      findImageIndex: (target) => {
        const ordinal = state.imagePositions.get(target);
        return ordinal === undefined ? -1 : isTwoTierFromTotal(state.total) ? ordinal : ordinal - state.bufferOffset;
      },
      virtualizer: { scrollToIndex: center } as unknown as Virtualizer<HTMLDivElement, Element>,
      flatIndexToRow: (index) => table ? index : Math.floor(index / 4),
      scrollRowToCenter: table ? (row) => center(row, { align: "center" }) : undefined,
      chooseReturn: policy,
    });
    return current ? <ImageDetail imageId={current} /> : <span>List ready</span>;
  }

  function flushFrames() {
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    });
  }

  beforeEach(() => {
    fixture.composed = true;
    fixture.realDismiss = false;
    fixture.spa = true;
    fixture.cached.mockReset().mockReturnValue(null);
    fixture.prepareScroll.mockReset();
    center.mockReset();
    frames.clear();
    nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const handle = ++nextFrame;
      frames.set(handle, callback);
      return handle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => frames.delete(handle));
    vi.spyOn(history, "back").mockImplementation(() => close());
    history.replaceState({ kupuaKey: "detail", _bareListSynthesized: true,
      _detailOriginKupuaKey: "list", _detailEntryImageId: "A" }, "", "/search?image=B");
  });

  afterEach(() => {
    cleanup();
    useSearchStore.setState(initialState, true);
    useUiPrefsStore.setState(initialPrefs, true);
    fixture.composed = false;
    fixture.realDismiss = false;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  for (const mode of ["explicit", "phantom"] as const) {
    for (const table of [false, true]) {
      it.each([
        { timing: "early", original: false, total: 5000 },
        { timing: "settled", original: false, total: 5000 },
        { timing: "early", original: true, total: 5000 },
        { timing: "settled", original: true, total: 5000 },
        { timing: "early", original: false, total: 800 },
        { timing: "early", original: false, total: 70000 },
      ])(`B9 ${mode} ${table ? "table" : "grid"}: $timing original=$original total=$total actual close`, async ({ timing, original, total }) => {
        const dataSource = new MockDataSource(total);
        const targetId = `img-${Math.floor(total / 2)}`;
        const target = await dataSource.searchAfter({ orderBy: "-uploadTime", ids: targetId, length: 1 }, null);
        const pending = deferred<typeof target>();
        const searchAfter = vi.spyOn(dataSource, "searchAfter");
        searchAfter.mockReturnValueOnce(pending.promise);
        const lookup = vi.spyOn(dataSource, "getById");
        const restore = vi.spyOn(useSearchStore.getState(), "restoreAroundCursor");
        fixture.cached.mockReturnValue({ cursor: target.sortValues[0] as [number, string], offset: Math.floor(total / 2) });
        if (original) history.replaceState({ ...history.state, _detailEntryImageId: targetId }, "");
        useUiPrefsStore.setState({ focusMode: mode, _pointerCoarse: false });
        useSearchStore.setState({ ...initialState, dataSource, total, results: [], restoreAroundCursor: restore,
          imagePositions: new Map(), focusedImageId: null, params: { orderBy: "-uploadTime" } });
        render(<List imageId={targetId} table={table} />);
        await act(async () => {});
        expect(screen.getByTestId("metadata").textContent).toContain(targetId);
        expect(useSearchStore.getState().loading).toBe(true);
        expect(useSearchStore.getState().imagePositions.has(targetId)).toBe(false);
        if (timing === "settled") await act(async () => pending.resolve(target));
        fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
        expect(screen.getByText("List ready")).toBeTruthy();
        if (timing === "early") {
          flushFrames();
          expect(center).not.toHaveBeenCalled();
          await act(async () => pending.resolve(target));
        }
        flushFrames();
        const state = useSearchStore.getState();
        const ordinal = state.imagePositions.get(targetId)!;
        const index = isTwoTierFromTotal(total) ? ordinal : ordinal - state.bufferOffset;
        expect(state.focusedImageId).toBe(targetId);
        if (original) expect(center).not.toHaveBeenCalled();
        else expect(center).toHaveBeenCalledExactlyOnceWith(table ? index : Math.floor(index / 4), { align: "center" });
        expect(restore).toHaveBeenCalledOnce();
        if (total > 1000) expect(searchAfter).toHaveBeenCalledTimes(3);
        expect(lookup).toHaveBeenCalledTimes(1);
        const requests = searchAfter.mock.calls.length;
        flushFrames();
        expect(searchAfter).toHaveBeenCalledTimes(requests);
      });
    }
  }

  it.each(["cancel", "complete", "backspace", "traversed"])("B12 reload B then traverse back A: %s preserves return policy", async (outcome) => {
    vi.useFakeTimers();
    fixture.composed = false;
    fixture.realDismiss = true;
    fixture.resident = [makeImage("A"), makeImage("B")];
    useSearchStore.setState({ ...initialState, focusedImageId: "B", results: fixture.resident,
      imagePositions: new Map([["A", 0], ["B", 8]]) });
    useUiPrefsStore.setState({ focusMode: "phantom", _pointerCoarse: true });
    render(<List imageId="B" />);
    if (outcome !== "traversed") act(() => fixture.traverse("A"));
    const image = screen.getByAltText(outcome === "traversed" ? "Title B" : "Title A");
    const container = image.closest('[data-testid="detail-image-container"]') ?? image.parentElement!.parentElement!.parentElement!;
    const touch = (type: string, vertical: number, timestamp: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: type === "touchend" ? [] : [{ clientX: 100, clientY: vertical }] }, timeStamp: { value: timestamp } });
      fireEvent(container, event);
    };
    if (outcome === "backspace") fireEvent.keyDown(document.body, { key: "Backspace" });
    else {
      touch("touchstart", 100, 0);
      touch("touchmove", outcome === "cancel" ? 125 : 300, 500);
      touch("touchend", 125, 600);
      act(() => vi.advanceTimersByTime(250));
    }
    flushFrames();
    if (outcome === "traversed") {
      expect(fixture.prepareScroll).toHaveBeenCalledOnce();
      expect(center).toHaveBeenCalledExactlyOnceWith(2, { align: "center" });
    } else {
      expect(fixture.prepareScroll).not.toHaveBeenCalled();
      expect(center).not.toHaveBeenCalled();
    }
    expect(screen.queryByText("List ready") !== null).toBe(outcome !== "cancel");
    expect(useSearchStore.getState().focusedImageId).toBe(outcome === "complete" || outcome === "backspace" ? "A" : "B");
  });

  it.each(["focus", "same-id-focus", "reopen", "history"])("pending return yields to %s while retaining useful cursor publication", async (intent) => {
    const dataSource = new MockDataSource(5000);
    const target = await dataSource.searchAfter({ ids: "img-2500", length: 1 }, null);
    const pending = deferred<typeof target>();
    const read = vi.spyOn(dataSource, "searchAfter").mockReturnValueOnce(pending.promise);
    fixture.cached.mockReturnValue({ cursor: target.sortValues[0] as [number, string], offset: 2500 });
    useSearchStore.setState({ ...initialState, dataSource, total: 5000, results: [], imagePositions: new Map(), params: {} });
    useUiPrefsStore.setState({ focusMode: "explicit", _pointerCoarse: false });
    render(<List imageId="img-2500" />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
    const obsolete = [...frames.values()];
    const seekGeneration = useSearchStore.getState()._seekGeneration;
    act(() => {
      if (intent === "focus") useSearchStore.getState().setFocusedImageId("new-focus");
      if (intent === "same-id-focus") useSearchStore.getState().setFocusedImageId("img-2500");
      if (intent === "reopen") fixture.traverse("img-2500");
      if (intent === "history") history.replaceState({ kupuaKey: "unrelated" }, "", "/search");
    });
    await act(async () => pending.resolve(target));
    flushFrames();
    act(() => obsolete.forEach((callback) => callback(0)));
    expect(center).not.toHaveBeenCalled();
    expect(useSearchStore.getState().imagePositions.has("img-2500")).toBe(true);
    expect(read.mock.calls.filter(([params]) => params.ids === "img-2500")).toHaveLength(1);
    if (intent === "focus" || intent === "same-id-focus") {
      expect(useSearchStore.getState()._seekGeneration).toBe(seekGeneration);
      expect(useSearchStore.getState().focusedImageId).toBe(intent === "focus" ? "new-focus" : "img-2500");
    }
  });

  it.each(["native", "center"] as const)("policy substitution %s keeps identity, publication and retirement invariant", (placement) => {
    useSearchStore.setState({ ...initialState, results: [makeImage("B")], total: 1,
      imagePositions: new Map([["B", 0]]), focusedImageId: "A", loading: false });
    const reads = vi.spyOn(useSearchStore.getState().dataSource, "searchAfter");
    const policy = vi.fn((entry: DetailEntry, imageId: string) => ({ ...chooseDetailReturn(entry, imageId), placement }));
    render(<List imageId="B" policy={policy} />);
    fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
    expect(policy).toHaveBeenCalledExactlyOnceWith({ imageId: "A", key: "detail", originKey: "list" }, "B");
    expect(useSearchStore.getState().focusedImageId).toBe("B");
    flushFrames();
    expect(center).toHaveBeenCalledTimes(placement === "center" ? 1 : 0);
    expect(reads).not.toHaveBeenCalled();
    flushFrames();
    expect(center).toHaveBeenCalledTimes(placement === "center" ? 1 : 0);
  });

  it("keeps return ownership when useful history publication supplies a different focus without new focus intent", () => {
    useSearchStore.setState({ ...initialState, results: [], total: 5000, loading: true,
      imagePositions: new Map(), focusedImageId: null });
    fixture.composed = false;
    fixture.resident = [makeImage("B")];
    render(<List imageId="B" />);
    fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
    flushFrames();
    act(() => useSearchStore.setState({ results: [makeImage("B")], imagePositions: new Map([["B", 8]]),
      loading: false, focusedImageId: "history-anchor" }));
    flushFrames();
    expect(useSearchStore.getState().focusedImageId).toBe("B");
    expect(center).toHaveBeenCalledExactlyOnceWith(2, { align: "center" });
  });

  describe("pending policy substitution", () => {
    for (const placement of ["native", "center"] as const) {
      it.each([false, true])(`${placement} retains publication and retirement invariant (new intent=%s)`, (obsolete) => {
        fixture.composed = false;
        fixture.resident = [makeImage("B")];
        useSearchStore.setState({ ...initialState, results: [], total: 5000, loading: true,
          imagePositions: new Map(), focusedImageId: null });
        const reads = vi.spyOn(useSearchStore.getState().dataSource, "searchAfter");
        const policy = vi.fn((entry: DetailEntry, imageId: string) => ({ ...chooseDetailReturn(entry, imageId), placement }));
        render(<List imageId="B" policy={policy} />);
        fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
        const obsoleteCallbacks = [...frames.values()];
        flushFrames();
        expect(center).not.toHaveBeenCalled();
        if (obsolete) act(() => useSearchStore.getState().setFocusedImageId("new-focus"));
        act(() => useSearchStore.setState({ results: [makeImage("B")], imagePositions: new Map([["B", 8]]), loading: false }));
        flushFrames();
        act(() => obsoleteCallbacks.forEach(callback => callback(0)));
        expect(useSearchStore.getState().imagePositions.get("B")).toBe(8);
        expect(useSearchStore.getState().focusedImageId).toBe(obsolete ? "new-focus" : "B");
        expect(center).toHaveBeenCalledTimes(!obsolete && placement === "center" ? 1 : 0);
        expect(reads).not.toHaveBeenCalled();
        expect(policy).toHaveBeenCalledOnce();
      });
    }
  });

  for (const outcome of ["success", "absent", "refused", "unavailable"] as const) {
    it(`API composed close with held ${outcome} preserves adapter contracts and bounded reads`, async () => {
      const corpus = new MockDataSource(5000);
      const targetId = "img-2500";
      const target = await corpus.searchAfter({ ids: targetId, length: 1 }, null);
      const pending = deferred<void>();
      const requests: { path: string; body: Record<string, unknown> }[] = [];
      vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input, window.location.origin);
        const path = url.pathname;
        const body = init?.body ? JSON.parse(init.body as string) as Record<string, unknown> : {};
        requests.push({ path, body });
        const params: SearchParams = { orderBy: body.orderBy as string | undefined,
          ids: body.ids as string | undefined, length: body.length as number | undefined,
          offset: body.offset as number | undefined };
        if (path === `/api/images/${targetId}`) return Response.json({ data: target.hits[0] });
        if (path === "/api/images/rank") return Response.json({ rank: await corpus.countBefore(params, body.sortValues as SortValues) });
        if (path === "/api/images/search-after") {
          if (params.ids === targetId) {
            await pending.promise;
            if (outcome === "unavailable") throw new TypeError("fixture unavailable");
            if (outcome === "refused") return new Response("{}", { status: 403 });
            if (outcome === "absent") return Response.json({ data: [], total: 0, sortValues: [] });
          }
          const result = await corpus.searchAfter(params, body.sortValues as SortValues ?? null, null,
            init?.signal ?? undefined, body.reverse as boolean, body.seekToEnd as boolean);
          return Response.json({ data: result.hits.map(data => ({ data })), total: result.total, sortValues: result.sortValues });
        }
        if (path === "/api/images/window") {
          const result = await corpus.searchAfter(params, null);
          return Response.json({ data: result.hits.map(data => ({ data })), offset: params.offset,
            total: result.total, sortValues: result.sortValues, rawHitCount: result.hits.length });
        }
        throw new Error(`Unexpected fixture request ${path}`);
      }));
      const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
      fixture.cached.mockReturnValue({ cursor: target.sortValues[0] as [number, string], offset: 2500 });
      useUiPrefsStore.setState({ focusMode: "phantom", _pointerCoarse: false });
      useSearchStore.setState({ ...initialState, dataSource: new ApiDataSource(), total: 5000,
        results: [], imagePositions: new Map(), params: {} });
      render(<List imageId={targetId} table />);
      await act(async () => {});
      expect(screen.getByTestId("metadata").textContent).toContain(targetId);
      fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
      expect(screen.getByText("List ready")).toBeTruthy();
      flushFrames();
      expect(center).not.toHaveBeenCalled();
      await act(async () => pending.resolve());
      flushFrames();
      expect(useSearchStore.getState().loading).toBe(false);
      expect(requests.filter(request => request.body.ids === targetId)).toHaveLength(1);
      expect(requests.some(request => !request.path.startsWith("/api/"))).toBe(false);
      if (outcome === "success") {
        expect(useSearchStore.getState().focusedImageId).toBe(targetId);
        expect(center).toHaveBeenCalledExactlyOnceWith(2500, { align: "center" });
        expect(requests).toHaveLength(5);
        expect(warnings).not.toHaveBeenCalled();
      } else if (outcome === "absent") {
        expect(center).not.toHaveBeenCalled();
        expect(useSearchStore.getState().imagePositions.has(targetId)).toBe(false);
        const before = requests.length;
        flushFrames();
        expect(requests).toHaveLength(before);
      } else {
        expect(requests.filter(request => request.path === "/api/images/window")).toHaveLength(1);
        expect(useSearchStore.getState()._cursorRestore).toBeNull();
      }
    });
  }

  it("finite AI absence makes no ordinary cursor/window reads and close remains usable", async () => {
    const dataSource = new MockDataSource(50);
    const pages = vi.spyOn(dataSource, "searchAfter");
    fixture.cached.mockReturnValue({ cursor: [1, "img-40"], offset: 40 });
    useSearchStore.setState({ ...initialState, dataSource, total: 1, results: [makeImage("A")],
      imagePositions: new Map([["A", 0]]), params: { aiQuery: "finite fixture" }, focusedImageId: null });
    render(<List imageId="img-40" />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
    flushFrames();
    expect(screen.getByText("List ready")).toBeTruthy();
    expect(pages).not.toHaveBeenCalled();
    expect(center).not.toHaveBeenCalled();
    expect(useSearchStore.getState().imagePositions.has("img-40")).toBe(false);
  });

  it("cold synthesis retains its finalized origin and does not return into unrelated native history", () => {
    fixture.spa = false;
    fixture.composed = false;
    fixture.resident = [makeImage("B")];
    history.replaceState({ kupuaKey: "detail", _detailEntryImageId: "A" }, "", "/search?image=B");
    useSearchStore.setState({ ...initialState, focusedImageId: "unrelated-focus", loading: false });
    render(<List imageId="B" />);
    expect(history.state._detailOriginKupuaKey).toBeTruthy();
    expect(history.state._detailOriginKupuaKey).not.toBe("list");
    fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
    flushFrames();
    expect(useSearchStore.getState().focusedImageId).toBe("unrelated-focus");
    expect(center).not.toHaveBeenCalled();
    fixture.spa = true;
  });

  it.each(["different", "same-id"])("late failure keeps useful fallback data but retires placement after %s focus intent", async (intent) => {
    const dataSource = new MockDataSource(5000);
    const target = await dataSource.searchAfter({ ids: "img-2500", length: 1 }, null);
    const pending = deferred<typeof target>();
    const requests = vi.spyOn(dataSource, "searchAfter").mockReturnValueOnce(pending.promise);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fixture.cached.mockReturnValue({ cursor: target.sortValues[0] as [number, string], offset: 2500 });
    useSearchStore.setState({ ...initialState, dataSource, total: 5000, results: [], imagePositions: new Map(), params: {} });
    render(<List imageId="img-2500" />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
    const seekGeneration = useSearchStore.getState()._seekGeneration;
    act(() => useSearchStore.getState().setFocusedImageId(intent === "different" ? "new-focus" : "img-2500"));
    await act(async () => pending.reject(new Error("late restore failure")));
    flushFrames();
    expect(useSearchStore.getState().results.length).toBeGreaterThan(0);
    expect(useSearchStore.getState().loading).toBe(false);
    expect(useSearchStore.getState()._seekGeneration).toBe(seekGeneration);
    expect(useSearchStore.getState()._browseNavigation).toBeNull();
    expect(center).not.toHaveBeenCalled();
    expect(requests.mock.calls.filter(([params]) => params.ids)).toHaveLength(1);
  });

  it.each(["success", "absent", "failure"])("early close plus newer clear retires history %s presentation but keeps coherent data", async (outcome) => {
    const dataSource = new MockDataSource(5000);
    const target = await dataSource.searchAfter({ ids: "img-2500", length: 1 }, null);
    const pending = deferred<typeof target>();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const originalRead = dataSource.searchAfter.bind(dataSource);
    const read = vi.spyOn(dataSource, "searchAfter").mockImplementation((...args) =>
      args[0].ids === "img-2500" ? pending.promise : originalRead(...args));
    vi.spyOn(dataSource, "fetchPositionIndex").mockResolvedValue(null);
    fixture.composed = false;
    fixture.resident = [(await dataSource.getById("img-2499"))!.image];
    useSearchStore.setState({ ...initialState, dataSource, results: [], total: 0,
      imagePositions: new Map(), focusedImageId: null, params: {} });
    useUiPrefsStore.setState({ focusMode: "explicit", _pointerCoarse: false });
    history.replaceState({ kupuaKey: "detail", _bareListSynthesized: true,
      _detailEntryImageId: "img-2500", _detailOriginKupuaKey: "list" }, "", "/search?image=img-2499");
    render(<List imageId="img-2499" />);
    const continuity = historySearchContinuity({ searchKey: "detail-test", anchorImageId: "img-2500",
      anchorIsPhantom: false, anchorOffset: 2499, viewportRatio: 0.25, newCountSince: null }, {});
    let work!: Promise<void>;
    act(() => { work = useSearchStore.getState().search(undefined, { continuity }); });
    await act(async () => {});
    expect(read.mock.calls.some(([params]) => params.ids === "img-2500")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
    act(() => useSearchStore.getState().setFocusedImageId(null));
    const generation = useSearchStore.getState().sortAroundFocusGeneration;
    const reset = useSearchStore.getState()._scrollReset.gen;
    await act(async () => {
      if (outcome === "failure") pending.reject(new Error("fixture history lookup failure"));
      else pending.resolve(outcome === "success" ? target : { ...target, hits: [], sortValues: [] });
      await work;
    });
    flushFrames();
    expect(useSearchStore.getState().imagePositions.has("img-2499")).toBe(outcome === "success");
    expect(useSearchStore.getState().results.length).toBeGreaterThan(0);
    expect(useSearchStore.getState().focusedImageId).toBeNull();
    expect(["retired", undefined]).toContain(useSearchStore.getState()._searchContinuity?.phase);
    expect(useSearchStore.getState().sortAroundFocusGeneration).toBe(generation);
    expect(useSearchStore.getState()._scrollReset.gen).toBe(reset);
    expect(center).not.toHaveBeenCalled();
  });

  it.each(["different", "same-id"])("newer %s focus during fallback retains data but not old presentation", async (intent) => {
    const dataSource = new MockDataSource(5000);
    const target = await dataSource.searchAfter({ ids: "img-2500", length: 1 }, null);
    const lookup = deferred<typeof target>();
    const fallback = deferred<void>();
    const originalRead = dataSource.searchAfter.bind(dataSource);
    const read = vi.spyOn(dataSource, "searchAfter").mockReturnValueOnce(lookup.promise)
      .mockImplementationOnce(async (...args) => { await fallback.promise; return originalRead(...args); });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fixture.cached.mockReturnValue({ cursor: target.sortValues[0] as [number, string], offset: 2500 });
    useSearchStore.setState({ ...initialState, dataSource, results: [], total: 5000, imagePositions: new Map(), params: {} });
    render(<List imageId="img-2500" />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
    await act(async () => lookup.reject(new Error("fixture restore failure")));
    expect(read).toHaveBeenCalledTimes(2);
    const generation = useSearchStore.getState()._seekGeneration;
    const nextFocus = intent === "same-id" ? "img-2500" : "new-focus";
    act(() => useSearchStore.getState().setFocusedImageId(nextFocus));
    await act(async () => fallback.resolve());
    flushFrames();
    expect(useSearchStore.getState().results.length).toBeGreaterThan(0);
    expect(useSearchStore.getState().loading).toBe(false);
    expect(useSearchStore.getState().focusedImageId).toBe(nextFocus);
    expect(useSearchStore.getState()._seekGeneration).toBe(generation);
    expect(useSearchStore.getState()._browseNavigation).toBeNull();
    expect(center).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("cursorless pending restoration is reused on re-entry without another window read", async () => {
    const dataSource = new MockDataSource(5000);
    const pending = deferred<void>();
    const originalRead = dataSource.searchAfter.bind(dataSource);
    const read = vi.spyOn(dataSource, "searchAfter").mockImplementationOnce(async (...args) => {
      const result = await originalRead(...args);
      await pending.promise;
      return result;
    });
    fixture.cached.mockReturnValue({ cursor: null, offset: 2500 });
    useSearchStore.setState({ ...initialState, dataSource, total: 5000, results: [], imagePositions: new Map(), params: {} });
    render(<List imageId="img-2500" />);
    await act(async () => {});
    expect(useSearchStore.getState()._cursorRestore?.imageId).toBe("img-2500");
    fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
    act(() => fixture.traverse("img-2500"));
    await act(async () => {});
    expect(read).toHaveBeenCalledOnce();
    await act(async () => pending.resolve());
    flushFrames();
    expect(useSearchStore.getState().loading).toBe(false);
    expect(useSearchStore.getState()._cursorRestore).toBeNull();
    expect(read).toHaveBeenCalledOnce();
    expect(center).not.toHaveBeenCalled();
  });

  for (const outcome of ["success", "empty", "absence", "failure"] as const) {
    it.each(["clear", "different"])(`pending AI history ${outcome} retains newer %s intent through finite publication`, async (intent) => {
      const dataSource = new ApiDataSource();
      const pending = deferred<AiSearchResult | null>();
      const ai = vi.spyOn(dataSource, "searchByAi").mockReturnValue(pending.promise);
      const pages = vi.spyOn(dataSource, "searchAfter");
      vi.spyOn(dataSource, "fetchPositionIndex").mockResolvedValue(null);
      fixture.composed = false;
      fixture.resident = [makeImage("B")];
      useSearchStore.setState({ ...initialState, dataSource, results: [], total: 0,
        imagePositions: new Map(), focusedImageId: null, params: { aiQuery: "fixture" } });
      useUiPrefsStore.setState({ focusMode: "explicit", _pointerCoarse: false });
      render(<List imageId="B" />);
      const continuity = historySearchContinuity({ searchKey: "detail-test", anchorImageId: "A",
        anchorIsPhantom: false, anchorOffset: 0, viewportRatio: 0.25, newCountSince: null }, { aiQuery: "fixture" });
      let work!: Promise<void>;
      act(() => { work = useSearchStore.getState().search(undefined, { continuity }); });
      await act(async () => {});
      fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
      const focus = intent === "clear" ? null : "new-focus";
      act(() => useSearchStore.getState().setFocusedImageId(focus));
      const generation = useSearchStore.getState().sortAroundFocusGeneration;
      const reset = useSearchStore.getState()._scrollReset.gen;
      await act(async () => {
        if (outcome === "failure") pending.reject(new TypeError("fixture API failure"));
        else pending.resolve(outcome === "absence" ? null : {
          hits: outcome === "success" ? [Object.assign(makeImage("A"), { __aiScore: 2 }),
            Object.assign(makeImage("B"), { __aiScore: 1 })] : [],
          total: 200, sortValues: outcome === "success" ? [[1, "A"], [0.5, "B"]] : [],
        });
        await work;
      });
      flushFrames();
      expect(useSearchStore.getState().focusedImageId).toBe(focus);
      expect(useSearchStore.getState().total).toBe(outcome === "success" ? 2 : 0);
      expect(useSearchStore.getState().loading).toBe(false);
      expect(useSearchStore.getState().sortAroundFocusGeneration).toBe(generation);
      expect(useSearchStore.getState()._scrollReset.gen).toBe(reset);
      expect(center).not.toHaveBeenCalled();
      expect(ai).toHaveBeenCalledOnce();
      expect(pages).not.toHaveBeenCalled();
    });
  }

  it.each(["replace-old-history", "adopt-history-then-clear"].flatMap(scenario =>
    (["top", "neighbours"] as const).map(fallback => ({ scenario, fallback }))))(
    "pending AI $scenario uses the latest history presentation's focus intent with $fallback fallback", async ({ scenario, fallback }) => {
    const dataSource = new ApiDataSource();
    const pending = deferred<AiSearchResult | null>();
    const ai = vi.spyOn(dataSource, "searchByAi").mockReturnValue(pending.promise);
    const pages = vi.spyOn(dataSource, "searchAfter");
    fixture.composed = false;
    fixture.resident = [makeImage("B")];
    useSearchStore.setState({ ...initialState, dataSource, total: 0, results: [],
      imagePositions: new Map(), focusedImageId: null, params: { aiQuery: "fixture" } });
    useUiPrefsStore.setState({ focusMode: "explicit", _pointerCoarse: false });
    render(<List imageId="B" />);
    const destination = { ...historySearchContinuity({ searchKey: "detail-test", anchorImageId: "A",
      anchorIsPhantom: false, anchorOffset: 0, viewportRatio: 0.25, newCountSince: null }, { aiQuery: "fixture" }),
      fallback: fallback === "top" ? "top" as const : undefined };
    const launch = scenario === "replace-old-history" ? destination : {
      provenance: "user" as const, targetId: "A", focus: "target" as const, placement: { kind: "ratio" as const, ratio: 0.25 },
    };
    let work!: Promise<void>;
    act(() => { work = useSearchStore.getState().search(undefined, { continuity: launch }); });
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Back to search/ }));
    if (scenario === "replace-old-history") act(() => useSearchStore.getState().setFocusedImageId(null));
    act(() => {
      history.replaceState({ kupuaKey: "new-destination" }, "", "/search?aiQuery=fixture&orderBy=uploadTime");
      useSearchStore.getState().setParams({ orderBy: "uploadTime" });
      useSearchStore.getState().resortAiBuffer("uploadTime", destination);
    });
    if (scenario === "adopt-history-then-clear") act(() => useSearchStore.getState().setFocusedImageId(null));
    const generation = useSearchStore.getState().sortAroundFocusGeneration;
    await act(async () => {
      pending.resolve({ hits: [Object.assign(makeImage("A"), { __aiScore: 2, uploadTime: "2026-01-02T00:00:00Z" }),
        Object.assign(makeImage("B"), { __aiScore: 1, uploadTime: "2026-01-01T00:00:00Z" })],
        total: 200, sortValues: [[2, "A"], [1, "B"]] });
      await work;
    });
    flushFrames();
    expect(useSearchStore.getState().focusedImageId).toBe(scenario === "replace-old-history" ? "A" : null);
    expect(useSearchStore.getState().sortAroundFocusGeneration).toBe(generation + (scenario === "replace-old-history" ? 1 : 0));
    expect(useSearchStore.getState().total).toBe(2);
    expect(useSearchStore.getState().params.orderBy).toBe("uploadTime");
    expect(center).not.toHaveBeenCalled();
    expect(ai).toHaveBeenCalledOnce();
    expect(pages).not.toHaveBeenCalled();
  });
});