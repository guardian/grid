/** @vitest-environment jsdom */

import { useLayoutEffect, type ComponentProps, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Image } from "@/types/image";
import { MockDataSource } from "@/dal/mock-data-source";
import { useSearchStore } from "@/stores/search-store";
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
  getFullImageUrl: (image: Image) => `data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7#${image.id}`,
  getThumbnailUrl: () => undefined,
  getZoomImageUrl: () => undefined,
}));
vi.mock("@/lib/image-prefetch", () => ({
  isFullResLoaded: () => false, markFullResLoaded: vi.fn(),
  onFullResDecoded: () => () => {}, getCarouselImageUrl: () => undefined,
}));
vi.mock("@/components/StableImg", () => ({ StableImg: ({ imgRef, ...props }: ComponentProps<"img"> & { imgRef?: React.Ref<HTMLImageElement> }) => <img ref={imgRef} {...props} /> }));
vi.mock("@/components/ImageMetadata", () => ({ ImageMetadata: ({ image }: { image: Image }) => <span data-testid="metadata">{image.id}: {image.metadata.title}</span> }));
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

  it.each(["null", "undefined", "reject", "success"])("never renders loaded A as pending B, then handles %s", async (outcome) => {
    const pending = deferred<Image | undefined>();
    const lookup = vi.spyOn(dataSource, "getById").mockResolvedValueOnce(makeImage("A")).mockReturnValueOnce(pending.promise);
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
      else pending.resolve(outcome === "success" ? makeImage("B") : outcome === "null" ? null as unknown as undefined : undefined);
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
    const requests = Array.from({ length: 4 }, () => deferred<Image | undefined>());
    const lookup = vi.spyOn(dataSource, "getById");
    requests.forEach((request) => lookup.mockReturnValueOnce(request.promise));
    const view = render(<Detail imageId="A" />);
    view.rerender(<Detail imageId="B" />);
    view.rerender(<Detail imageId="C" />);
    view.rerender(<Detail imageId="A" />);
    await act(async () => {
      if (outcome === "reject") requests[0].reject(new Error("obsolete"));
      else requests[0].resolve(makeImage("A"));
      requests[1].resolve(makeImage("B"));
      requests[2].resolve(undefined);
    });
    expect(screen.queryByTestId("metadata")).toBeNull();
    expect(screen.queryByText("Image not found")).toBeNull();
    await act(async () => requests[3].resolve(makeImage("A")));
    expect(screen.getByTestId("metadata").textContent).toBe("A: Title A");
    expect(lookup).toHaveBeenCalledTimes(4);
  });

  it("gives resident B precedence over pending standalone completion and keeps the detail mounted", async () => {
    const pending = deferred<Image | undefined>();
    const lookup = vi.spyOn(dataSource, "getById").mockReturnValueOnce(pending.promise);
    const view = render(<Detail imageId="A" />);
    fixture.resident = [makeImage("B")];
    view.rerender(<Detail imageId="B" />);
    const wrapper = view.container.querySelector("[data-detail-image-id]");
    await act(async () => pending.resolve(makeImage("A")));
    expect(screen.getByTestId("metadata").textContent).toBe("B: Title B");
    expect(lookup).toHaveBeenCalledTimes(1);
    fixture.resident = [makeImage("C")];
    view.rerender(<Detail imageId="C" />);
    expect(view.container.querySelector("[data-detail-image-id]")).toBe(wrapper);
    expect(transitions.at(-1)).toMatchObject({ requested: "C", displayed: "C" });
    expect(history.state._detailEntryImageId).toBe("A");
  });
});