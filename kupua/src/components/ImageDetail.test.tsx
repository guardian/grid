/** @vitest-environment jsdom */

import { useLayoutEffect, type ComponentProps, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Image } from "@/types/image";
import type { ImageByIdResult } from "@/dal/types";
import type { EnrichmentFields } from "@/stores/enrichment-store";
import { MockDataSource } from "@/dal/mock-data-source";
import { useSearchStore } from "@/stores/search-store";
import { useEnrichmentStore } from "@/stores/enrichment-store";
import { ImageDetail } from "./ImageDetail";

vi.hoisted(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
});

const fixture = vi.hoisted(() => ({
  resident: [] as Image[],
  search: { nonFree: "true", orderBy: "-uploadTime" },
  navigate: vi.fn(),
  cached: vi.fn(() => null as { cursor: [number, string]; offset: number } | null),
  markNavigation: vi.fn(),
  relativeMedia: false,
  mediaProps: [] as ComponentProps<"img">[],
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => fixture.navigate,
  useRouter: () => ({ history: { subscribe: () => () => {} } }),
  useSearch: () => fixture.search,
}));
vi.mock("@/hooks/useDataWindow", () => ({ useDataWindow: () => ({
  total: fixture.resident.length,
  findImageIndex: (imageId: string) => fixture.resident.findIndex((image) => image.id === imageId),
  getImage: (index: number) => fixture.resident[index],
}) }));
vi.mock("@/hooks/useImageTraversal", () => ({ useImageTraversal: () => ({
  prevImage: undefined, nextImage: undefined, currentGlobalIndex: -1,
  goToPrev: vi.fn(), goToNext: vi.fn(),
}) }));
vi.mock("@/hooks/useFullscreen", () => ({ useFullscreen: () => ({ isFullscreen: false, toggleFullscreen: vi.fn() }) }));
vi.mock("@/hooks/useCursorAutoHide", () => ({ useCursorAutoHide: () => ({ cursorHidden: false }) }));
vi.mock("@/hooks/useKeyboardShortcut", () => ({ useKeyboardShortcut: vi.fn() }));
vi.mock("@/hooks/useSwipeCarousel", () => ({ useSwipeCarousel: () => ({ swipedRef: { current: false }, lastSwipeTimeRef: { current: 0 } }) }));
vi.mock("@/hooks/useSwipeDismiss", () => ({ useSwipeDismiss: vi.fn() }));
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
  scrollFocusedIntoView: vi.fn(), markUserInitiatedNavigation: fixture.markNavigation,
  pushNavigateAsPopstate: vi.fn(), consumeDetailEnteredViaSpaFlag: () => true,
}));
vi.mock("@/lib/image-offset-cache", () => ({
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