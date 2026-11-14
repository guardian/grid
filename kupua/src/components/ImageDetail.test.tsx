/** @vitest-environment jsdom */

import { useLayoutEffect, useState, type ComponentProps, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Image } from "@/types/image";
import type { AiSearchResult, ImageByIdResult, SearchParams, SortValues } from "@/dal/types";
import { attachEnrichment, type EnrichmentFields } from "@/stores/enrichment-store";
import { MockDataSource } from "@/dal/mock-data-source";
import { ApiDataSource } from "@/dal/api-data-source";
import { useSearchStore } from "@/stores/search-store";
import { useEnrichmentStore } from "@/stores/enrichment-store";
import { ImageDetail } from "./ImageDetail";
import { SettingsMenu } from "./SettingsMenu";
import { HiJoshuaProvider } from "./HiJoshua";
import { useReturnFromDetail } from "@/hooks/useReturnFromDetail";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import type { Virtualizer } from "@tanstack/react-virtual";
import { chooseDetailReturn, type DetailReturnTarget, type DetailEntry } from "@/lib/detail-return";
import { historySearchContinuity } from "@/lib/search-continuity";
import { createLabelOperation } from "@/lib/label-operation";
import { createLabelReadback, publishUnavailableImages } from "@/lib/image-publication";
import { resetImageFreshnessForTests } from "@/lib/image-read-freshness";
import { useSelectionStore, _resetMetadataCache } from "@/stores/selection-store";
import { useImageActionStore } from "@/stores/image-action-store";
import { applyLegacyCropParams } from "@/lib/crop/crop-options";

vi.hoisted(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
});

const fixture = vi.hoisted(() => ({
  resident: [] as Image[],
  search: { nonFree: "true", orderBy: "-uploadTime" } as Record<string, string | undefined>,
  navigate: vi.fn(),
  cached: vi.fn(() => null as { cursor: [number, string] | null; offset: number } | null),
  markNavigation: vi.fn(),
  relativeMedia: false,
  mediaProps: [] as ComponentProps<"img">[],
  composed: false,
  realDismiss: false,
  realCursor: false,
  realPinch: false,
  realCarousel: false,
  canGoNext: false,
  cancelTraversal: () => {},
  touchCapable: false,
  nextImage: undefined as Image | undefined,
  compact: false,
  fullscreen: false,
  toggleFullscreen: vi.fn(),
  spa: true,
  swiped: false,
  prepareScroll: vi.fn(),
  cropShortcut: () => {},
  sessionInvalidated: false,
  sessionListeners: new Set<() => void>(),
  traverse: (_imageId: string) => {},
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => fixture.navigate,
  useRouter: () => ({ history: { subscribe: () => () => {} } }),
  useSearch: () => fixture.search,
}));
vi.mock("@/hooks/useDataWindow", () => ({ getViewportAnchorId: () => null, useDataWindow: () => {
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
vi.mock("@/hooks/useImageTraversal", () => ({ useImageTraversal: (_imageId: string, _navigate: unknown, _history: unknown, onCancelled?: () => void) => {
  fixture.cancelTraversal = onCancelled ?? (() => {});
  return {
  prevImage: undefined, nextImage: fixture.nextImage, currentGlobalIndex: -1,
  canGoNext: fixture.canGoNext || !!fixture.nextImage,
  goToPrev: vi.fn(), goToNext: vi.fn(),
}; } }));
vi.mock("@/hooks/useFullscreen", () => ({ useFullscreen: () => ({ isFullscreen: fixture.fullscreen, toggleFullscreen: fixture.toggleFullscreen }) }));
vi.mock("@/hooks/useCursorAutoHide", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useCursorAutoHide")>();
  return { useCursorAutoHide: (active: boolean, surface?: React.RefObject<HTMLElement | null>) =>
    actual.useCursorAutoHide(fixture.realCursor && active, fixture.realCursor ? surface : undefined) };
});
vi.mock("@/hooks/useKeyboardShortcut", () => ({ useKeyboardShortcut: vi.fn((key: string, run: () => void) => {
  if (key === "c") fixture.cropShortcut = run;
}) }));
vi.mock("@/lib/grid-api-instance", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/grid-api-instance")>(),
  isGridSessionInvalidated: () => fixture.sessionInvalidated,
  subscribeGridSessionInvalidation: (listener: () => void) => {
    fixture.sessionListeners.add(listener);
    return () => { fixture.sessionListeners.delete(listener); };
  },
}));
vi.mock("@/hooks/useSwipeCarousel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useSwipeCarousel")>();
  return { useSwipeCarousel: (options: Parameters<typeof actual.useSwipeCarousel>[0]) => {
    const gesture = actual.useSwipeCarousel({ ...options, enabled: fixture.realCarousel && options.enabled });
    return fixture.realCarousel ? gesture : { swipedRef: { current: fixture.swiped }, lastSwipeTimeRef: { current: 0 } };
  } };
});
vi.mock("@/hooks/useSwipeDismiss", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useSwipeDismiss")>();
  return { useSwipeDismiss: (options: Parameters<typeof actual.useSwipeDismiss>[0]) =>
    actual.useSwipeDismiss({ ...options, enabled: fixture.realDismiss && options.enabled }) };
});
vi.mock("@/hooks/usePinchZoom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/usePinchZoom")>();
  return { usePinchZoom: (options: Parameters<typeof actual.usePinchZoom>[0]) =>
    actual.usePinchZoom({ ...options, enabled: fixture.realPinch && options.enabled }) };
});
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
  <><span data-testid="metadata">{image.id}: {image.metadata.title}{overlay?.cost ? ` [${overlay.cost}]` : ""}</span>
    <span data-testid="original-metadata">{image.originalMetadata?.title} {String(image.fileMetadata?.fixture ?? "")}</span></>
) }));
vi.mock("@/components/UsagesSection", () => ({ UsagesSection: () => null, countDisplayUsages: () => 0 }));
vi.mock("@/components/crop/CropEditor", () => ({ CropEditor: ({ onClose }: { onClose: () => void }) => (
  <button onClick={onClose}>Cancel crop</button>
) }));
vi.mock("@/components/PanelLayout", () => ({ AccordionSection: ({ children }: { children: ReactNode }) => <section>{children}</section>, useIsCompact: () => fixture.compact }));
vi.mock("@/hooks/useShell", () => ({ useIsCompact: () => fixture.compact, isCompactNow: () => fixture.compact,
  useTouchCapable: () => fixture.touchCapable }));
vi.mock("@/lib/reset-to-home", () => ({ resetToHome: vi.fn() }));
vi.mock("@/lib/orchestration/search", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/orchestration/search")>(),
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

function makeCroppableImage(imageId: string): Image {
  const image = makeImage(imageId);
  attachEnrichment(image, { valid: true, invalidReasons: {}, resource: { uri: `https://api.example.test/images/${imageId}`,
    links: [{ rel: "crops", href: `https://crop.example.test/crops/${imageId}` }] } });
  return image;
}

function imageTouch(element: Element, type: string, points: { clientX: number; clientY: number }[], timestamp: number,
  remaining: { clientX: number; clientY: number }[] = []) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: type === "touchend" || type === "touchcancel" ? remaining : points },
    changedTouches: { value: points }, timeStamp: { value: timestamp },
  });
  fireEvent(element, event);
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
  const initialPrefs = useUiPrefsStore.getState();
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
    sessionStorage.clear();
    dataSource = new MockDataSource();
    useSearchStore.setState({ ...initialState, dataSource });
    fixture.resident = [];
    fixture.nextImage = undefined;
    fixture.touchCapable = false;
    fixture.canGoNext = false;
    fixture.composed = false;
    fixture.realDismiss = false;
    fixture.spa = true;
    fixture.relativeMedia = false;
    fixture.mediaProps = [];
    fixture.cached.mockReset().mockReturnValue(null);
    fixture.markNavigation.mockClear();
    fixture.navigate.mockClear();
    fixture.toggleFullscreen.mockClear();
    fixture.sessionInvalidated = false;
    fixture.search = { nonFree: "true", orderBy: "-uploadTime" };
    transitions = [];
    history.replaceState({}, "", "/search");
  });

  afterEach(() => {
    cleanup();
    useImageActionStore.setState({ prepared: [] });
    useSearchStore.setState(initialState, true);
    useUiPrefsStore.setState(initialPrefs, true);
    fixture.compact = false;
    fixture.realCursor = false;
    fixture.realPinch = false;
    fixture.realCarousel = false;
    fixture.fullscreen = false;
    fixture.swiped = false;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(["spa", "synthesized"] as const)("retains the old %s detail-entry guard without adding another list entry", entry => {
    fixture.spa = entry === "spa";
    fixture.resident = [makeImage("A")];
    history.replaceState({ kupuaKey: "detail", _detailEntryImageId: "A",
      ...(entry === "spa" ? { _detailOriginKupuaKey: "list" } : { _bareListSynthesized: true }),
    }, "", "/search?image=A");
    const push = vi.spyOn(history, "pushState");
    render(<Detail imageId="A" />);
    expect(push).not.toHaveBeenCalled();
    expect(history.state._bareListSynthesized).toBe(true);
    expect(history.state._detailEntryImageId).toBe("A");
  });

  it("prepares detail actions for the open image rather than the search selection", () => {
    fixture.resident = [makeImage("A")];
    useSelectionStore.setState({ selectedIds: new Set(["unrelated-selection"]) });
    render(<Detail imageId="A" />);
    fireEvent.click(screen.getByRole("button", { name: "Share with URL" }));
    expect(useImageActionStore.getState().prepared.at(-1)?.targetIds).toEqual(["A"]);
    expect(screen.getByRole("group", { name: "Image actions" }).getAttribute("data-surface")).toBe("detail");
    expect(screen.getByRole("button", { name: "Full frame options" }).getAttribute("title")).toBe("Crop full frame");
  });

  it("shows Original, full frame and crops in a left rail and selects their previews without sending actions", () => {
    fixture.relativeMedia = true;
    const image = makeImage("A");
    image.source = { mimeType: "image/jpeg", dimensions: { width: 6000, height: 4000 }, size: 1048576 };
    const fullAsset = { mimeType: "image/jpeg", dimensions: { width: 6000, height: 4000 }, secureUrl: "https://assets.example.test/full.jpg" };
    const cropAsset = { mimeType: "image/jpeg", dimensions: { width: 1600, height: 900 }, secureUrl: "https://assets.example.test/crop.jpg" };
    image.exports = [
      { id: "full", specification: { type: "full", bounds: { x: 0, y: 0, width: 6000, height: 4000 } }, master: fullAsset, assets: [fullAsset] },
      { id: "crop", specification: { type: "crop", aspectRatio: "16:9", bounds: { x: 0, y: 0, width: 1600, height: 900 } }, master: cropAsset, assets: [cropAsset], author: "Fixture Author", date: "2026-11-12T10:00:00Z" },
    ];
    fixture.resident = [image];
    const view = render(<Detail imageId="A" />);
    const rail = screen.getByRole("complementary", { name: "Image original and crops select" });
    expect(within(rail).getByRole("region", { name: "Original image" }).textContent).toContain("6000");
    expect(within(rail).getByRole("region", { name: "Original image" }).textContent).toContain("1.05 MB");
    expect(within(rail).getByRole("region", { name: "Full frame" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Full frame options" })).toBeNull();
    expect(within(rail).getByText("video")).toBeTruthy();
    expect(within(rail).getByText("(16:9)")).toBeTruthy();
    expect(within(rail).getByTitle(/Cropped by Fixture Author at/)).toBeTruthy();
    fireEvent.click(within(rail).getByRole("button", { name: "View 1600 by 900 crop" }));
    fixture.search = fixture.navigate.mock.calls.at(-1)![0].search(fixture.search);
    view.rerender(<Detail imageId="A" />);
    expect(screen.getByAltText("Title A").getAttribute("src")).toBe(cropAsset.secureUrl);
    fireEvent.error(screen.getByAltText("Title A"));
    expect(screen.queryByAltText("Title A")).toBeNull();
    expect(screen.getByText("Image preview not available")).toBeTruthy();
    fireEvent.click(within(rail).getByRole("button", { name: "View original image" }));
    fixture.search = fixture.navigate.mock.calls.at(-1)![0].search(fixture.search);
    view.rerender(<Detail imageId="A" />);
    expect(screen.getByAltText("Title A").getAttribute("src")).not.toBe(cropAsset.secureUrl);
    expect(useImageActionStore.getState().prepared).toEqual([]);
  });

  it("shows the newest repeated crop once without retaining another image's rows", () => {
    const first = makeImage("A");
    const second = makeImage("B");
    const crop = (id: string, width: number) => ({ id, specification: { type: "full" },
      assets: [{ mimeType: "image/jpeg", dimensions: { width, height: 100 }, secureUrl: `https://assets.example.test/${id}-${width}.jpg` }] });
    first.exports = [
      { ...crop("repeated", 100), author: "Earlier author", date: "2026-11-12T10:00:00Z" },
      { ...crop("repeated", 200), author: "Latest author", date: "2026-11-12T11:00:00Z" },
    ];
    second.exports = [crop("new", 300)];
    fixture.resident = [first, second];
    const view = render(<Detail imageId="A" />);
    const fullFrames = () => within(screen.getByRole("complementary", { name: "Image original and crops select" }))
      .getAllByRole("button", { name: "View full frame" });
    expect(fullFrames()).toHaveLength(1);
    expect(screen.getByTitle(/Cropped by Latest author at/)).toBeTruthy();
    fireEvent.click(fullFrames()[0]);
    fixture.search = fixture.navigate.mock.calls.at(-1)![0].search(fixture.search);
    view.rerender(<Detail imageId="A" />);
    expect(screen.getByAltText("Title A").getAttribute("src")).toBe("https://assets.example.test/repeated-200.jpg");
    for (let step = 0; step < 3; step++) {
      view.rerender(<Detail imageId="B" />);
      expect(fullFrames()).toHaveLength(1);
      expect(screen.queryByText("100 \u00d7 100")).toBeNull();
      view.rerender(<Detail imageId="A" />);
      expect(fullFrames()).toHaveLength(1);
      expect(screen.getByTitle(/Cropped by Latest author at/)).toBeTruthy();
      expect(screen.queryByText("300 \u00d7 100")).toBeNull();
    }
    expect(first.exports).toHaveLength(2);
  });

  it("applies mandatory ratios to saved crops and full-frame shortcuts, but not default ratios", () => {
    const image = makeCroppableImage("A");
    image.exports = ["16:9", "4:3", undefined].map((aspectRatio, index) => ({
      id: `crop-${index}`, specification: { type: "crop", aspectRatio, bounds: { x: 0, y: 0, width: 1600 + index, height: 900 } },
      assets: [{ mimeType: "image/jpeg", dimensions: { width: 1600 + index, height: 900 }, secureUrl: `https://assets.example.test/crop-${index}.jpg` }],
    }));
    fixture.resident = [image];
    applyLegacyCropParams(new URLSearchParams("defaultCropType=video"));
    render(<Detail imageId="A" />);
    const choices = () => screen.getAllByRole("button", { name: /View .* crop$/ }) as HTMLButtonElement[];
    expect(choices().every(button => !button.disabled)).toBe(true);
    act(() => applyLegacyCropParams(new URLSearchParams("cropType=video")));
    expect(choices().map(button => button.disabled)).toEqual([false, true, true]);
    expect(choices()[1].title).toBe("16:9 crops only");
    expect(screen.queryByRole("button", { name: "Full frame options" })).toBeNull();
    expect((screen.getByRole("button", { name: "View original image" }) as HTMLButtonElement).disabled).toBe(false);
    act(() => applyLegacyCropParams(new URLSearchParams("cropType=freeform")));
    expect(choices().map(button => button.disabled)).toEqual([true, true, false]);
  });

  it("reads a saved crop from the URL and replaces its choice without changing history ownership", () => {
    const image = makeCroppableImage("A");
    image.exports = [{ id: "saved", specification: { type: "crop", aspectRatio: "16:9" },
      assets: [{ mimeType: "image/jpeg", dimensions: { width: 1600, height: 900 }, secureUrl: "https://assets.example.test/saved.jpg" }] }];
    fixture.resident = [image];
    fixture.search = { image: "A", crop: "saved", query: "has:crops" };
    history.replaceState({ kupuaKey: "detail", _detailOriginKupuaKey: "list" }, "", "/search?image=A&crop=saved");
    const savedAssets = image.exports[0].assets;
    image.exports = [{ ...image.exports[0], assets: [] }];
    const view = render(<Detail imageId="A" />);
    expect(screen.queryByAltText("Title A")).toBeNull();
    expect(screen.getByText("Image preview not available")).toBeTruthy();
    image.exports = [{ ...image.exports[0], assets: savedAssets }];
    view.rerender(<Detail imageId="A" />);
    expect(screen.getByAltText("Title A").getAttribute("src")).toBe("https://assets.example.test/saved.jpg");
    fireEvent.error(screen.getByAltText("Title A"));
    expect(screen.queryByAltText("Title A")).toBeNull();
    image.exports = [{ ...image.exports[0], assets: [] }];
    view.rerender(<Detail imageId="A" />);
    expect(screen.queryByAltText("Title A")).toBeNull();
    image.exports = [{ ...image.exports[0], assets: [{ mimeType: "image/jpeg", dimensions: { width: 1600, height: 900 }, secureUrl: "https://assets.example.test/renewed.jpg" }] }];
    view.rerender(<Detail imageId="A" />);
    expect(screen.getByAltText("Title A").getAttribute("src")).toBe("https://assets.example.test/renewed.jpg");
    fireEvent.click(screen.getByRole("button", { name: "View original image" }));
    const options = fixture.navigate.mock.calls.at(-1)?.[0];
    expect(options.replace).toBe(true);
    expect(options.state).toMatchObject({ kupuaKey: "detail", _detailOriginKupuaKey: "list" });
    expect(options.search(fixture.search)).toEqual({ image: "A", crop: undefined, query: "has:crops" });
    fixture.search = options.search(fixture.search);
    view.rerender(<Detail imageId="A" />);
    fireEvent.error(screen.getByAltText("Title A"));
    expect(screen.queryByAltText("Title A")).toBeNull();
    fixture.relativeMedia = true;
    view.rerender(<Detail imageId="A" />);
    expect(screen.getByAltText("Title A").getAttribute("src")).toBe("/__detail_media/full/A.gif");
  });

  it("hides full-frame creation for a crop covering the full oriented image", () => {
    const image = makeCroppableImage("A");
    image.source = { mimeType: "image/jpeg", dimensions: { width: 600, height: 400 }, orientedDimensions: { width: 400, height: 600 } };
    image.exports = [{ id: "existing", specification: { type: "crop", bounds: { x: 0, y: 0, width: 400, height: 600 } } }];
    fixture.resident = [image];
    render(<Detail imageId="A" />);
    expect(screen.queryByRole("button", { name: "Full frame options" })).toBeNull();
    expect(screen.getByRole("button", { name: "Crop image" }).hasAttribute("disabled")).toBe(false);
  });

  it("does not mount crop thumbnails for offscreen mobile neighbours", () => {
    fixture.compact = true;
    fixture.touchCapable = true;
    const first = makeImage("A");
    const second = makeImage("B");
    first.exports = [{ id: "current-crop", specification: { type: "crop" },
      assets: [{ mimeType: "image/jpeg", dimensions: { width: 200, height: 100 }, secureUrl: "https://assets.example.test/current.jpg" }] }];
    const analyse = vi.spyOn(first.exports, "entries");
    const originalObserver = globalThis.IntersectionObserver;
    const originalResizeObserver = globalThis.ResizeObserver;
    let measure: (() => void) | undefined;
    let measuredRegion: Element | undefined;
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { measure = callback; }
      observe(element: Element) { measuredRegion = element; }
      disconnect() {}
    });
    let enterViewport: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: typeof enterViewport) { enterViewport = callback; }
      observe() {}
      disconnect = disconnect;
    });
    second.exports = [{ id: "neighbour-crop", specification: { type: "crop" },
      assets: [{ mimeType: "image/jpeg", dimensions: { width: 200, height: 100 }, secureUrl: "https://assets.example.test/neighbour.jpg" }] }];
    fixture.resident = [first, second];
    fixture.nextImage = second;
    render(<Detail imageId="A" />);
    expect(document.querySelector('[data-detail-page="next"] section[aria-label="Image crops"]')).toBeNull();
    expect(document.querySelector('img[src="https://assets.example.test/neighbour.jpg"]')).toBeNull();
    expect(analyse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Expand Image details" }));
    expect(analyse).not.toHaveBeenCalled();
    act(() => enterViewport?.([{ isIntersecting: true }]));
    expect(analyse).toHaveBeenCalledOnce();
    const original = screen.getByRole("region", { name: "Original image" });
    const heading = within(original).getByRole("heading");
    const thumbnail = within(original).getByRole("button", { name: "View original image" });
    expect(heading.parentElement).toBe(thumbnail.parentElement);
    const constraint = document.createElement("div");
    constraint.style.width = "calc((100% - 0.5rem) / 2)";
    expect(heading.parentElement?.style.width).toBe(constraint.style.width);
    vi.spyOn(measuredRegion!, "getBoundingClientRect").mockReturnValue({ height: 320 } as DOMRect);
    act(() => measure?.());
    fireEvent.click(screen.getByRole("button", { name: "Collapse Image details" }));
    expect(screen.queryByRole("region", { name: "Original image", hidden: true })).toBeNull();
    expect((measuredRegion as HTMLElement).style.minHeight).toBe("320px");
    expect(disconnect).toHaveBeenCalled();
    Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, writable: true, value: originalObserver });
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: originalResizeObserver });
  });

  it("keeps detail navigation behind an owned action popup and closes it on target change", () => {
    fixture.resident = [makeImage("A"), makeImage("B")];
    const view = render(<Detail imageId="A" />);
    const chevron = screen.getByRole("button", { name: "Full frame options" }).querySelector("path")!;
    expect(chevron.getAttribute("d")).toBe("M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z");
    fireEvent.click(screen.getByRole("button", { name: "Full frame options" }));
    expect(chevron.getAttribute("d")).toBe("M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z");
    expect(fireEvent.keyDown(document, { key: "Backspace" })).toBe(true);
    expect(screen.getByRole("button", { name: "Full frame options" }).getAttribute("aria-expanded")).toBe("true");
    view.rerender(<Detail imageId="B" />);
    expect(screen.getByRole("button", { name: "Full frame options" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps detail Actions inside the header and closes them when the card toggles", () => {
    fixture.compact = true;
    fixture.touchCapable = true;
    fixture.resident = [makeImage("A"), makeImage("B")];
    fixture.nextImage = fixture.resident[1];
    render(<Detail imageId="A" />);
    const trigger = screen.getByRole("button", { name: "Image actions" });
    const header = screen.getByRole("button", { name: "Expand Image details" });
    expect(screen.queryByRole("button", { name: "Full frame options" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cannot crop" }).hasAttribute("disabled")).toBe(true);
    expect(header.textContent).toBe("Title A");
    expect(header.parentElement?.contains(trigger)).toBe(true);
    expect(document.querySelector('[data-detail-page="next"][inert] button[aria-label="Image actions"]')).not.toBeNull();
    fireEvent.click(trigger);
    expect(screen.queryByRole("button", { name: "Details" })).toBeNull();
    fireEvent.click(header);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(screen.queryByRole("button", { name: "Close details" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Image details" }));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: "Expand Image details" })).toBeTruthy();
  });

  it("hides mobile detail controls on an image tap without leaving detail", () => {
    vi.useFakeTimers();
    fixture.compact = true;
    fixture.resident = [makeImage("A")];
    useUiPrefsStore.setState({ _pointerCoarse: true });
    render(<Detail imageId="A" />);
    const image = screen.getByAltText("Title A");
    const card = screen.getByRole("region", { name: "Image details" });
    const toolbar = screen.getByRole("banner");
    expect(card.classList.contains("chrome-fade")).toBe(true);
    expect(toolbar.classList.contains("chrome-fade")).toBe(true);
    fireEvent.click(image);
    act(() => { vi.advanceTimersByTime(350); });
    expect(screen.queryByRole("region", { name: "Image details" })).toBeNull();
    for (const chrome of [card, toolbar]) {
      expect(chrome.getAttribute("data-visible")).toBe("false");
      expect(chrome.getAttribute("aria-hidden")).toBe("true");
      expect(chrome.hasAttribute("inert")).toBe(true);
      expect(chrome.style.visibility).toBe("");
    }
    expect(screen.getByAltText("Title A")).toBe(image);
    fireEvent.click(image);
    act(() => { vi.advanceTimersByTime(350); });
    expect(screen.getByRole("region", { name: "Image details" })).toBe(card);
    expect(toolbar.getAttribute("data-visible")).toBe("true");
  });

  it("does not enter fullscreen on an image tap in touch-enabled desktop detail", () => {
    vi.useFakeTimers();
    fixture.resident = [makeImage("A")];
    useUiPrefsStore.setState({ _pointerCoarse: true });
    render(<Detail imageId="A" />);
    fireEvent.click(screen.getByAltText("Title A"));
    act(() => { vi.advanceTimersByTime(350); });
    expect(fixture.toggleFullscreen).not.toHaveBeenCalled();
    expect(screen.getByTestId("metadata").closest("aside")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("menuitemradio", { name: /Click to focus/ }).getAttribute("disabled")).toBeNull();
  });

  it.each([
    ["desktop", false, false, "bg-grid-bg"],
    ["compact", true, false, "bg-black"],
    ["fullscreen", false, true, "bg-black"],
  ] as const)("uses the %s image background", (_mode, compact, fullscreen, background) => {
    fixture.compact = compact;
    fixture.fullscreen = fullscreen;
    fixture.resident = [makeImage("A")];
    render(<Detail imageId="A" />);
    expect(screen.getByTestId("detail-image-container").classList.contains(background)).toBe(true);
  });

  it.each([false, true])("touch taps reveal desktop controls without activating hidden buttons, fullscreen=%s", fullscreen => {
    vi.useFakeTimers();
    fixture.realCursor = true;
    fixture.fullscreen = fullscreen;
    fixture.resident = [makeImage("A")];
    const mounted = render(<Detail imageId="A" />);
    const image = screen.getByAltText("Title A");
    const label = fullscreen ? "Exit full screen" : "Full screen";
    const touchClick = (target: Element) => {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "pointerType", { value: "touch" });
      fireEvent.touchStart(target);
      fireEvent.mouseMove(document);
      fireEvent(target, event);
    };
    touchClick(screen.getByRole("button", { name: label }));
    expect(fixture.toggleFullscreen).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: label }).firstElementChild?.classList.contains("opacity-100")).toBe(true);
    touchClick(screen.getByRole("button", { name: label }));
    expect(fixture.toggleFullscreen).toHaveBeenCalledOnce();
    fixture.fullscreen = !fullscreen;
    mounted.rerender(<Detail imageId="A" />);
    const currentLabel = fixture.fullscreen ? "Exit full screen" : "Full screen";
    expect(screen.getByRole("button", { name: currentLabel }).firstElementChild?.classList.contains("opacity-100")).toBe(true);
    act(() => { vi.advanceTimersByTime(2100); });
    if (fixture.fullscreen) expect(screen.queryByRole("button", { name: currentLabel })).toBeNull();
    else expect(screen.getByRole("button", { name: currentLabel }).firstElementChild?.classList.contains("opacity-0")).toBe(true);
    touchClick(image);
    expect(screen.getByRole("button", { name: currentLabel }).firstElementChild?.classList.contains("opacity-100")).toBe(true);
  });

  it.each([false, true])("renders adjacent swipe previews by touch capability, touch=%s", touchCapable => {
    fixture.touchCapable = touchCapable;
    fixture.relativeMedia = true;
    fixture.resident = [makeImage("A"), makeImage("B")];
    fixture.nextImage = fixture.resident[1];
    render(<Detail imageId="A" />);
    expect(document.querySelector('[data-detail-page="next"] img') !== null).toBe(touchCapable);
  });

  it("does not dismiss desktop detail on a downward finger swipe", () => {
    fixture.realDismiss = true;
    fixture.resident = [makeImage("A")];
    useUiPrefsStore.setState({ _pointerCoarse: true });
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    const clock = vi.spyOn(performance, "now");
    render(<Detail imageId="A" />);
    const surface = screen.getByTestId("detail-image-container");
    for (const [type, vertical, timestamp] of [["touchstart", 100, 1000], ["touchmove", 300, 1100], ["touchend", 300, 1200]] as const) {
      clock.mockReturnValue(timestamp);
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: type === "touchend" ? [] : [{ clientX: 100, clientY: vertical }] },
        changedTouches: { value: [{ clientX: 100, clientY: vertical }] },
      });
      fireEvent(surface, event);
    }
    expect(back).not.toHaveBeenCalled();
  });

  it.each([false, true])("image swipe-up drags only the card with sheet snap rules (fullscreen=%s)", (fullscreen) => {
    fixture.compact = true;
    fixture.fullscreen = fullscreen;
    fixture.realDismiss = true;
    fixture.resident = [makeImage("A")];
    useUiPrefsStore.setState({ _pointerCoarse: true });
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    render(<Detail imageId="A" />);
    const image = screen.getByAltText("Title A");
    const container = image.closest('[data-testid="detail-image-container"]')!;
    const wrapper = document.querySelector<HTMLElement>("[data-detail-image-id]")!;
    const card = screen.queryByRole("region", { name: "Image details" });
    const peek = card?.style.translate;
    const clock = vi.spyOn(performance, "now");
    const touch = (type: string, vertical: number, timestamp: number) => {
      clock.mockReturnValue(timestamp);
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: type === "touchend" ? [] : [{ clientX: 100, clientY: vertical }] },
        changedTouches: { value: [{ clientX: 100, clientY: vertical }] },
        timeStamp: { value: timestamp },
      });
      fireEvent(container, event);
    };
    touch("touchstart", 400, 0);
    touch("touchmove", 350, 1000);
    expect(card!.style.translate).not.toBe(peek);
    touch("touchend", 350, 1100);
    expect(card!.style.translate).toBe(peek);
    expect(screen.getByRole("button", { name: "Expand Image details" }).getAttribute("aria-expanded")).toBe("false");
    touch("touchstart", 400, 2000);
    touch("touchmove", 100, 3000);
    expect(image.style.transform).toBe("");
    expect(wrapper.style.transform).toBe("");
    expect(card!.style.translate).not.toBe(peek);
    touch("touchend", 100, 3100);
    expect(screen.getByRole("button", { name: "Collapse Image details" }).getAttribute("aria-expanded")).toBe("true");
    expect(image.style.transform).toBe("");
    expect(wrapper.style.transform).toBe("");
    expect(back).not.toHaveBeenCalled();
  });

  it("collapses the expanded drawer before a second image swipe closes detail", () => {
    fixture.compact = true;
    fixture.realDismiss = true;
    fixture.resident = [makeImage("A")];
    useUiPrefsStore.setState({ _pointerCoarse: true });
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    const clock = vi.spyOn(performance, "now");
    render(<Detail imageId="A" />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Image details" }));
    const surface = screen.getByAltText("Title A").closest('[data-testid="detail-image-container"]')!;
    const touch = (type: string, vertical: number, timestamp: number) => {
      clock.mockReturnValue(timestamp);
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: type === "touchend" ? [] : [{ clientX: 100, clientY: vertical }] },
        changedTouches: { value: [{ clientX: 100, clientY: vertical }] },
        timeStamp: { value: timestamp },
      });
      fireEvent(surface, event);
    };
    touch("touchstart", 100, 1000);
    touch("touchmove", 260, 1100);
    touch("touchend", 260, 1150);
    expect(back).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Expand Image details" }).getAttribute("aria-expanded")).toBe("false");
    touch("touchstart", 100, 2000);
    touch("touchmove", 260, 2100);
    touch("touchend", 260, 2150);
    expect(back).toHaveBeenCalledOnce();
  });

  it("post-swipe suppression allows keyboard activation while rejecting pointer clicks", () => {
    fixture.compact = true;
    fixture.swiped = true;
    fixture.resident = [makeImage("A")];
    render(<Detail imageId="A" />);
    const toggle = screen.getByRole("button", { name: "Expand Image details" });
    fireEvent.click(toggle, { detail: 1 });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle, { detail: 0 });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("releases an abandoned boundary swipe so the current image can be dragged again", async () => {
    fixture.compact = true;
    fixture.realCarousel = true;
    fixture.canGoNext = true;
    fixture.resident = [makeImage("A")];
    render(<Detail imageId="A" />);
    const surface = screen.getByTestId("detail-image-container");
    const strip = surface.parentElement!.parentElement!;
    Object.defineProperty(strip.parentElement!, "offsetWidth", { value: 300 });
    const completed = deferred<void>();
    const animation = { finished: completed.promise, cancel: vi.fn() };
    strip.animate = vi.fn(() => animation as unknown as Animation);
    imageTouch(surface, "touchstart", [{ clientX: 250, clientY: 100 }], 1000);
    imageTouch(surface, "touchmove", [{ clientX: 50, clientY: 100 }], 1500);
    imageTouch(surface, "touchend", [{ clientX: 50, clientY: 100 }], 1600);
    await act(async () => completed.resolve());
    act(() => fixture.cancelTraversal());
    expect(animation.cancel).toHaveBeenCalledOnce();
    expect(screen.getByAltText("Title A").getAttribute("src")).toContain("#A");
    imageTouch(surface, "touchstart", [{ clientX: 150, clientY: 100 }], 2000);
    imageTouch(surface, "touchmove", [{ clientX: 130, clientY: 100 }], 2500);
    expect(strip.style.transform).not.toBe("");
    const spring = { finished: new Promise<void>(() => {}), cancel: vi.fn() };
    strip.animate = vi.fn(() => spring as unknown as Animation);
    imageTouch(surface, "touchend", [{ clientX: 130, clientY: 100 }], 2600);
    imageTouch(surface, "touchstart", [{ clientX: 150, clientY: 100 }], 2700);
    expect(spring.cancel).toHaveBeenCalledOnce();
    imageTouch(surface, "touchcancel", [], 2800);
  });

  it.each(["sideways", "downward"])("does not resume a %s gesture after one finger leaves a pinch", direction => {
    fixture.compact = true;
    fixture.realCarousel = direction === "sideways";
    fixture.realDismiss = direction === "downward";
    fixture.resident = [makeImage("A")];
    render(<Detail imageId="A" />);
    const surface = screen.getByTestId("detail-image-container");
    const target = direction === "sideways" ? surface.parentElement!.parentElement! : surface.closest("[data-detail-image-id]")!;
    const point = (distance: number) => ({ clientX: 100 + (direction === "sideways" ? distance : 0),
      clientY: 100 + (direction === "downward" ? distance : 0) });
    const second = { clientX: 250, clientY: 250 };
    imageTouch(surface, "touchstart", [point(0)], 1000);
    imageTouch(surface, "touchmove", [point(20)], 1050);
    expect((target as HTMLElement).style.transform).not.toBe("");
    imageTouch(surface, "touchstart", [point(20), second], 1075);
    imageTouch(surface, "touchend", [second], 1100, [point(20)]);
    imageTouch(surface, "touchmove", [point(80)], 1150);
    expect((target as HTMLElement).style.transform).toBe("");
    imageTouch(surface, "touchend", [point(80)], 1200);
    imageTouch(surface, "touchstart", [point(0)], 2000);
    imageTouch(surface, "touchmove", [point(20)], 2050);
    expect((target as HTMLElement).style.transform).not.toBe("");
    imageTouch(surface, "touchcancel", [], 2100);
  });

  it("keeps button touches and keyboard activation out of image zoom", () => {
    fixture.compact = true;
    fixture.realPinch = true;
    fixture.resident = [makeImage("A")];
    render(<Detail imageId="A" />);
    const toggle = screen.getByRole("button", { name: "Expand Image details" });
    const image = screen.getByAltText("Title A");
    const point = [{ clientX: 100, clientY: 100 }];
    imageTouch(toggle, "touchstart", point, 1000);
    imageTouch(toggle, "touchend", point, 1050);
    imageTouch(toggle, "touchstart", point, 1100);
    imageTouch(toggle, "touchend", point, 1150);
    expect(image.style.transform).toBe("");
    fireEvent.keyDown(toggle, { key: " " });
    expect(image.style.transform).toBe("");
  });

  it("does not treat a cancelled image drag as a double-tap and normalizes a cancelled near-fit pinch", () => {
    fixture.compact = true;
    fixture.realPinch = true;
    fixture.resident = [makeImage("A")];
    render(<Detail imageId="A" />);
    const surface = screen.getByTestId("detail-image-container");
    const image = screen.getByAltText("Title A");
    const origin = [{ clientX: 100, clientY: 100 }];
    const moved = [{ clientX: 150, clientY: 100 }];
    imageTouch(surface, "touchstart", origin, 1000);
    imageTouch(surface, "touchmove", moved, 1050);
    imageTouch(surface, "touchend", moved, 1100);
    imageTouch(surface, "touchstart", moved, 1200);
    imageTouch(surface, "touchend", moved, 1250);
    expect(image.style.transform).toBe("");
    imageTouch(surface, "touchstart", [{ clientX: 0, clientY: 100 }, { clientX: 100, clientY: 100 }], 2000);
    imageTouch(surface, "touchmove", [{ clientX: 0, clientY: 100 }, { clientX: 102, clientY: 100 }], 2050);
    imageTouch(surface, "touchcancel", [], 2100);
    expect(image.style.transform).toBe("");
  });

  it("starts zoom from fit after the displayed image changes", () => {
    fixture.fullscreen = true;
    fixture.realPinch = true;
    fixture.resident = [makeImage("A"), makeImage("B")];
    const mounted = render(<Detail imageId="A" />);
    fireEvent.keyDown(document.body, { key: " " });
    expect(screen.getByAltText("Title A").style.transform).toContain("scale3d(3,");
    mounted.rerender(<Detail imageId="B" />);
    fireEvent.keyDown(document.body, { key: "+" });
    expect(screen.getByAltText("Title B").style.transform).toContain("scale3d(1.5,");
  });

  it("retains card focus while resetting incoming metadata scroll", () => {
    fixture.compact = true;
    fixture.resident = [makeImage("A"), makeImage("B")];
    const mounted = render(<Detail imageId="A" />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Image details" }));
    const toggle = screen.getByRole("button", { name: "Collapse Image details" });
    const card = screen.getByRole("region", { name: "Image details" });
    const content = card.lastElementChild as HTMLElement;
    content.scrollTop = 100;
    toggle.focus();
    mounted.rerender(<Detail imageId="B" />);
    expect(document.activeElement).toBe(toggle);
    expect(content.scrollTop).toBe(0);
    const action = document.createElement("button");
    content.appendChild(action);
    action.focus();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Expand Image details" })).toBe(toggle);
    expect(content.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it.each([false, true])("keeps compact Settings usable after a swipe, fullscreen=%s", fullscreen => {
    fixture.compact = true;
    fixture.fullscreen = fullscreen;
    fixture.swiped = true;
    fixture.resident = [makeImage("A")];
    render(<Detail imageId="A" />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }), { detail: 1 });
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "Settings" }), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps detail Settings usable without results controls or the app fullscreen command", () => {
    fixture.resident = [makeImage("A")];
    render(<Detail imageId="A" />);
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const menu = within(screen.getByRole("menu"));
    expect(menu.queryByRole("button", { name: /full screen/i })).toBeNull();
    expect(menu.queryByRole("button", { name: "Smaller thumbnails" })).toBeNull();
    expect(menu.queryByRole("button", { name: "Bigger thumbnails" })).toBeNull();
    expect(menu.queryByRole("menuitemcheckbox", { name: /Lock this view|View locked as Home/ })).toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
  });

  it("offers results zoom and Lock View only when the menu is opted in", () => {
    useUiPrefsStore.setState({ density: "grid" });
    const mounted = render(<SettingsMenu showViewControls />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const menu = within(screen.getByRole("menu"));
    expect(menu.getByRole("button", { name: "Smaller thumbnails" })).toBeTruthy();
    expect(menu.getByRole("button", { name: "Bigger thumbnails" })).toBeTruthy();
    expect(menu.getByRole("menuitemcheckbox", { name: /Lock this view|View locked as Home/ })).toBeTruthy();
    expect(menu.queryByRole("button", { name: /full screen/i })).toBeNull();
    mounted.rerender(<SettingsMenu />);
    expect(menu.queryByRole("button", { name: "Smaller thumbnails" })).toBeNull();
    expect(menu.queryByRole("button", { name: "Bigger thumbnails" })).toBeNull();
    expect(menu.queryByRole("menuitemcheckbox", { name: /Lock this view|View locked as Home/ })).toBeNull();
  });

  it("opens Hello, Joshua from Settings or Shift+F12 without changing the saved preference on dismissal", () => {
    localStorage.removeItem("kupua-allow-editing");
    localStorage.removeItem("kupua-allow-uploads");
    render(<HiJoshuaProvider><SettingsMenu /><SettingsMenu /></HiJoshuaProvider>);
    const settings = screen.getAllByRole("button", { name: "Settings" })[1];
    settings.focus();
    fireEvent.click(settings);
    fireEvent.click(screen.getByRole("menuitem", { name: "Hello, Joshua" }));
    expect(screen.getByRole("dialog", { name: "Hello, Joshua" })).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Allow real uploads" }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "Allow real uploads" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Allow editing" }));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem("kupua-allow-editing")).toBeNull();
    expect(localStorage.getItem("kupua-allow-uploads")).toBeNull();
    expect(document.activeElement).toBe(settings);
    fireEvent.click(settings);
    fireEvent.click(screen.getByRole("menuitem", { name: "Hello, Joshua" }));
    fireEvent.keyDown(document.body, { key: "F12", shiftKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document.body, { key: "F12", shiftKey: true });
    expect((screen.getByRole("checkbox", { name: "Allow editing" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Allow real uploads" }) as HTMLInputElement).checked).toBe(false);
  });

  it("keeps shared Settings dismissal and focus handling but hides it in image fullscreen", () => {
    let fullscreen: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreen });
    try {
      render(<SettingsMenu />);
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      expect(screen.getByRole("menu")).toBeTruthy();
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole("menu")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Settings" }));
      act(() => { fullscreen = document.body; document.dispatchEvent(new Event("fullscreenchange")); });
      expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
      act(() => { fullscreen = null; document.dispatchEvent(new Event("fullscreenchange")); });
      expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
      expect(screen.queryByRole("menu")).toBeNull();
    } finally {
      cleanup();
      Reflect.deleteProperty(document, "fullscreenElement");
    }
  });

  it.each(["content", "handle"])("a second finger cancels an owned %s pull without collapsing the card", surface => {
    fixture.compact = true;
    fixture.resident = [makeImage("A")];
    render(<Detail imageId="A" />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Image details" }));
    const card = screen.getByRole("region", { name: "Image details" });
    const content = card.lastElementChild as HTMLElement;
    const target = surface === "content" ? content : screen.getByRole("button", { name: "Collapse Image details" }).parentElement!;
    const rest = card.style.translate;
    const touch = (type: string, vertical: number, fingers = 1) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: type === "touchend" ? [] : Array.from({ length: fingers }, (_, index) => ({ clientX: 100 + index * 20, clientY: vertical })) },
        changedTouches: { value: [{ clientX: 100, clientY: vertical }] },
      });
      fireEvent(target, event);
    };
    touch("touchstart", 100);
    touch("touchmove", 130);
    touch("touchmove", 200);
    expect(card.style.translate).not.toBe(rest);
    touch("touchstart", 200, 2);
    touch("touchend", 200);
    expect(card.style.translate).toBe(rest);
    expect(content.style.overflowY).toBe("");
    expect(screen.getByRole("button", { name: "Collapse Image details" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("disables Cannot crop and refuses the Crop shortcut for an ineligible image", () => {
    const image = makeImage("A");
    attachEnrichment(image, { valid: false, invalidReasons: { no_rights: "No rights to use this image" }, resource: { links: [] } });
    fixture.resident = [image];
    render(<Detail imageId="A" />);
    const button = screen.getByRole("button", { name: "Cannot crop" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    act(() => fixture.cropShortcut());
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("crop-backdrop")).toBeNull();
  });

  it("does not expose saved crops through a deep link without the advertised crops relation", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    try {
      const image = makeImage("A");
      attachEnrichment(image, { valid: true, invalidReasons: {}, resource: { links: [] } });
      image.exports = [{ id: "saved", specification: { type: "crop" }, assets: [{ mimeType: "image/jpeg",
        dimensions: { width: 100, height: 100 }, secureUrl: "https://assets.example.test/withheld.jpg" }] }];
      fixture.resident = [image];
      fixture.search = { image: "A", crop: "saved" };
      render(<Detail imageId="A" />);
      expect(screen.queryByRole("region", { name: "Image crops" })).toBeNull();
      expect(screen.getByAltText("Title A").getAttribute("src")).not.toBe("https://assets.example.test/withheld.jpg");
      expect((screen.getByRole("button", { name: "Cannot crop" }) as HTMLButtonElement).disabled).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });

  it("withdraws Crop entry and its shortcut when the session is invalidated", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    try {
      fixture.resident = [makeCroppableImage("A")];
      render(<Detail imageId="A" />);
      expect((screen.getByRole("button", { name: "Crop image" }) as HTMLButtonElement).disabled).toBe(false);
      act(() => { fixture.sessionInvalidated = true; fixture.sessionListeners.forEach(listener => listener()); });
      expect((screen.getByRole("button", { name: "Cannot crop" }) as HTMLButtonElement).disabled).toBe(true);
      act(() => fixture.cropShortcut());
      expect(fixture.navigate).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });

  it.each(["target", "capability"] as const)("cancels deferred Crop when its %s changes during fullscreen exit", async change => {
    fixture.resident = [makeCroppableImage("A"), makeCroppableImage("B")];
    const pending = deferred<void>();
    const overlays = useEnrichmentStore.getState();
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: vi.fn(() => pending.promise) });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.body });
    try {
      const view = render(<Detail imageId="A" />);
      fireEvent.click(screen.getByRole("button", { name: "Crop image" }));
      expect(fixture.navigate).not.toHaveBeenCalled();
      if (change === "target") view.rerender(<Detail imageId="B" />);
      else act(() => useEnrichmentStore.setState({ data: new Map([["A", { valid: false, resource: { links: [] } }]]) }));
      await act(async () => pending.resolve());
      expect(fixture.navigate).not.toHaveBeenCalled();
      expect(screen.queryByTestId("crop-backdrop")).toBeNull();
    } finally {
      useEnrichmentStore.setState(overlays, true);
      Reflect.deleteProperty(document, "exitFullscreen");
      Reflect.deleteProperty(document, "fullscreenElement");
    }
  });

  it("pushes a unique crop entry while preserving its detail and list origins", () => {
    fixture.resident = [makeCroppableImage("A")];
    history.replaceState({ kupuaKey: "detail", _detailOriginKupuaKey: "list",
      _detailEntryImageId: "A" }, "", "/search?image=A");
    render(<Detail imageId="A" />);
    fireEvent.click(screen.getByRole("button", { name: "Crop image" }));
    const options = fixture.navigate.mock.calls.at(-1)?.[0];
    expect(options?.state).toMatchObject({ _cropOriginKupuaKey: "detail", _detailOriginKupuaKey: "list" });
    expect(options.state.kupuaKey).not.toBe("detail");
    expect(options.search({ image: "A", query: "city:Dublin" })).toMatchObject({ image: "A", query: "city:Dublin", cropping: "true" });
  });

  it("returns to detail from a reloaded crop entry using durable history state", async () => {
    fixture.resident = [makeImage("A")];
    fixture.search = { image: "A", cropping: "true" };
    history.replaceState({ kupuaKey: "crop", _cropOriginKupuaKey: "detail", _detailOriginKupuaKey: "list" }, "", "/search?image=A&cropping=true");
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    render(<Detail imageId="A" />);
    expect(screen.getByTestId("crop-backdrop")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel crop" }));
    expect(back).toHaveBeenCalledOnce();
    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it.each([false, true])("admits only editor media on a history crop entry, fullscreen=%s", async fullscreen => {
    const image = makeCroppableImage("A");
    image.exports = [{ id: "saved", specification: { type: "crop" }, assets: [{ mimeType: "image/jpeg",
      dimensions: { width: 100, height: 100 }, secureUrl: "https://assets.example.test/saved.jpg" }] }];
    const analyse = vi.spyOn(image.exports, "entries");
    fixture.resident = [image];
    fixture.search = { image: "A", crop: "saved", cropping: "true" };
    fixture.fullscreen = fullscreen;
    const exit = vi.fn(async () => {});
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: fullscreen ? document.body : null });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    try {
      render(<Detail imageId="A" />);
      await screen.findByRole("button", { name: "Cancel crop" });
      expect(analyse).not.toHaveBeenCalled();
      expect(fixture.mediaProps).toHaveLength(0);
      expect(exit).toHaveBeenCalledTimes(fullscreen ? 1 : 0);
    } finally {
      Reflect.deleteProperty(document, "fullscreenElement");
      Reflect.deleteProperty(document, "exitFullscreen");
    }
  });

  it("keeps Crop cancellable while its image is still loading", () => {
    fixture.resident = [];
    fixture.search = { image: "A", cropping: "true" };
    history.replaceState({ kupuaKey: "crop", _cropOriginKupuaKey: "detail", _detailOriginKupuaKey: "list" }, "", "/search?image=A&cropping=true");
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    render(<Detail imageId="A" />);
    expect(screen.getByTestId("crop-backdrop")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to image" }));
    expect(back).toHaveBeenCalledOnce();
  });

  it("preserves app fullscreen and waits for image fullscreen exit before opening Crop", async () => {
    fixture.resident = [makeCroppableImage("A")];
    const pending = deferred<void>();
    const exit = vi.fn(() => pending.promise);
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => document.documentElement });
    render(<Detail imageId="A" />);
    fireEvent.click(screen.getByRole("button", { name: "Crop image" }));
    expect(exit).not.toHaveBeenCalled();
    fixture.navigate.mockClear();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => document.body });
    fireEvent.click(screen.getByRole("button", { name: "Crop image" }));
    expect(fixture.navigate).not.toHaveBeenCalled();
    await act(async () => pending.resolve());
    expect(exit).toHaveBeenCalledOnce();
    expect(fixture.navigate).toHaveBeenCalledOnce();
    delete (document as unknown as Record<string, unknown>).fullscreenElement;
    delete (document as unknown as Record<string, unknown>).exitFullscreen;
  });

  it("terminates a relative thumbnail fallback after two media errors", () => {
    fixture.relativeMedia = true;
    fixture.fullscreen = true;
    fixture.realPinch = true;
    fixture.nextImage = makeImage("B");
    fixture.resident = [makeImage("A"), makeImage("B")];
    const mounted = render(<Detail imageId="A" />);
    const image = screen.getByAltText("Title A") as HTMLImageElement;
    fireEvent.error(image);
    expect(image.getAttribute("src")).toBe("/__detail_media/thumb/A.gif");
    expect(image.src).not.toBe(image.getAttribute("src"));
    fireEvent.error(image);
    expect(screen.getByText("Image preview not available")).toBeTruthy();
    expect(screen.queryByAltText("Title A")).toBeNull();
    fireEvent.keyDown(document.body, { key: " " });
    expect(image.style.transform).toBe("");
    mounted.rerender(<Detail imageId="B" />);
    fireEvent.keyDown(document.body, { key: "+" });
    expect(screen.getByAltText("Title B").style.transform).toContain("scale3d(1.5,");
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
      expect(screen.getByText(outcome === "reject" ? "Image could not be loaded" : "Image unavailable")).toBeTruthy();
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
    expect(screen.getByText("Image unavailable")).toBeTruthy();
    view.rerender(<Detail imageId="B" />);
    expect(transitions.at(-1)?.text).not.toContain("Image unavailable");
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
    expect(screen.queryByText("Image unavailable")).toBeNull();
    await act(async () => requests[3].resolve(found("A")));
    expect(screen.getByTestId("metadata").textContent).toBe("A: Title A");
    expect(lookup).toHaveBeenCalledTimes(4);
  });

  it.each(["absent", "failed"] as const)("settles cold unavailable detail after a %s read", async outcome => {
    resetImageFreshnessForTests();
    publishUnavailableImages(["A"], "unavailable");
    const lookup = vi.spyOn(dataSource, "getById");
    if (outcome === "absent") lookup.mockResolvedValue(undefined);
    else lookup.mockRejectedValue(new Error("Synthetic required read failure"));
    const view = render(<Detail imageId="A" />);
    try {
      await act(async () => {});
      expect(screen.getByText("Image unavailable")).toBeTruthy();
      expect(screen.queryByText(/Loading image/)).toBeNull();
      expect(lookup).toHaveBeenCalledOnce();
    } finally {
      view.unmount();
      resetImageFreshnessForTests();
    }
  });

  it.each([false, true])("withholds standalone media after lifecycle publication (loaded=%s)", async loaded => {
    resetImageFreshnessForTests();
    const pending = deferred<ImageByIdResult | undefined>();
    const lookup = vi.spyOn(dataSource, "getById").mockReturnValue(pending.promise);
    const view = render(<Detail imageId="A" />);
    try {
      if (loaded) await act(async () => pending.resolve(found("A")));
      act(() => publishUnavailableImages(["A"], "deleted"));
      expect(screen.getByText("Image deleted")).toBeTruthy();
      expect(screen.getByTestId("detail-image-container").querySelector("img")).toBeNull();
      expect(screen.queryByRole("button", { name: "Crop image" })).toBeNull();
      await act(async () => pending.resolve(found("A")));
      expect(screen.getByText("Image deleted")).toBeTruthy();
      expect(screen.getByTestId("detail-image-container").querySelector("img")).toBeNull();
      view.unmount();
      render(<Detail imageId="A" />);
      expect(screen.getByText("Image deleted")).toBeTruthy();
      expect(lookup).toHaveBeenCalledOnce();
    } finally {
      view.unmount();
      resetImageFreshnessForTests();
    }
  });

  it.each(["add", "remove"] as const)("settles cold-detail failure after unsuccessful %s observation", async action => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    resetImageFreshnessForTests();
    const oldRead = deferred<ImageByIdResult | undefined>();
    vi.spyOn(dataSource, "getById").mockReturnValueOnce(oldRead.promise);
    vi.spyOn(dataSource, "getByIds").mockRejectedValue(new Error("Synthetic observation failure"));
    const view = render(<Detail imageId="A" />);
    const resource = { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/A" }] };
    const operation = createLabelOperation(async () => ({ outcome: "unknown" }), createLabelReadback(dataSource));
    try {
      await act(async () => {
        await operation.confirm({ action, label: "news", targetIds: ["A"] }, new Map([["A", { resource }]]));
      });
      expect(operation.getSnapshot()?.items[0]).toMatchObject({ state: "unknown", observation: "unavailable" });
      await act(async () => oldRead.reject(new Error("Synthetic singleton failure")));
      expect(screen.queryByText(/Loading image/)).toBeNull();
      expect(screen.getByText("Image could not be loaded")).toBeTruthy();
      expect(screen.queryByTestId("metadata")).toBeNull();
    } finally {
      operation.cancelObservation();
      view.unmount();
      resetImageFreshnessForTests();
      vi.unstubAllEnvs();
    }
  });

  it.each(["add", "remove"] as const)("publishes full standalone %s readback and actually rejects a released older same-ID completion", async action => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    resetImageFreshnessForTests();
    const oldRead = deferred<ImageByIdResult | undefined>();
    const full = { ...makeImage("A"), metadata: { title: "Accepted title" },
      originalMetadata: { title: "Original camera title" }, fileMetadata: { fixture: "EXIF retained" },
      userMetadata: { labels: action === "remove" ? [] : ["news"], lastModified: "2026-11-06T00:00:00Z" } };
    const lean = { ...full, originalMetadata: undefined, fileMetadata: undefined };
    const lookup = vi.spyOn(dataSource, "getById").mockReturnValueOnce(oldRead.promise)
      .mockResolvedValueOnce({ image: full, enrichment: { resource: { links: [] }, actions: [] } });
    vi.spyOn(dataSource, "getByIds").mockResolvedValue([lean]);
    const view = render(<Detail imageId="A" />);
    const resource = { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/A" }] };
    const operation = createLabelOperation(async () => ({ outcome: "acknowledged" }), createLabelReadback(dataSource));
    try {
      await act(async () => {
        await operation.confirm({ action, label: "news", targetIds: ["A"] }, new Map([["A", { resource }]]));
      });
      expect(screen.getByTestId("metadata").textContent).toBe("A: Accepted title");
      expect(screen.getByTestId("original-metadata").textContent).toContain("Original camera title EXIF retained");
      expect(operation.getSnapshot()?.items[0].observation).toBe("observed");
      expect(lookup).toHaveBeenCalledTimes(2);
      expect(lookup.mock.calls[0][1]?.aborted).toBe(false);
      await act(async () => oldRead.resolve(found("A", { resource })));
      expect(screen.getByTestId("metadata").textContent).toBe("A: Accepted title");
      expect(screen.getByTestId("original-metadata").textContent).toContain("Original camera title EXIF retained");
      expect(lookup).toHaveBeenCalledTimes(2);
      lookup.mockResolvedValueOnce(found("A", { resource }));
      await act(async () => view.rerender(<Detail key="new-owner" imageId="A" />));
      expect(screen.queryByText("Image not found")).toBeNull();
      expect(screen.getByText("Image unavailable")).toBeTruthy();
    } finally {
      await act(async () => oldRead.resolve(undefined));
      view.unmount();
      resetImageFreshnessForTests();
      vi.unstubAllEnvs();
    }
  });

  it("publishes to surviving selection after standalone departure and same-ID re-entry", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    resetImageFreshnessForTests();
    _resetMetadataCache();
    useSelectionStore.setState({ selectedIds: new Set(["A"]), anchorId: "A" });
    const fullRead = deferred<ImageByIdResult | undefined>();
    const returningRead = deferred<ImageByIdResult | undefined>();
    const image = { ...makeImage("A"), metadata: { title: "Readback" },
      userMetadata: { labels: ["news"], lastModified: "2026-11-06T00:00:00Z" } };
    const lookup = vi.spyOn(dataSource, "getById").mockResolvedValueOnce(found("A"))
      .mockReturnValueOnce(fullRead.promise).mockResolvedValueOnce(found("B")).mockReturnValueOnce(returningRead.promise);
    vi.spyOn(dataSource, "getByIds").mockResolvedValue([image]);
    const view = render(<Detail imageId="A" />);
    await act(async () => {});
    const resource = { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/A" }] };
    const operation = createLabelOperation(async () => ({ outcome: "acknowledged" }), createLabelReadback(dataSource));
    try {
      await act(async () => { await operation.confirm({ action: "add", label: "news", targetIds: ["A"] }, new Map([["A", { resource }]])); });
      expect(lookup).toHaveBeenCalledTimes(2);
      view.rerender(<Detail imageId="B" />);
      view.rerender(<Detail imageId="A" />);
      expect(lookup.mock.calls[1][1]?.aborted).toBe(true);
      await act(async () => fullRead.resolve({ image }));
      expect(useSelectionStore.getState().metadataCache.get("A")?.userMetadata?.labels).toEqual(["news"]);
      expect(operation.getSnapshot()?.items[0].observation).toBe("observed");
      expect(screen.queryByTestId("metadata")).toBeNull();
      await act(async () => returningRead.resolve({ image: { ...image, originalMetadata: { title: "Returned full projection" } } }));
      expect(screen.getByTestId("metadata").textContent).toBe("A: Readback");
      expect(screen.getByTestId("original-metadata").textContent).toContain("Returned full projection");
      expect(lookup).toHaveBeenCalledTimes(4);
    } finally {
      await act(async () => { fullRead.resolve(undefined); returningRead.resolve(undefined); });
      operation.cancelObservation();
      view.unmount();
      useSelectionStore.getState().clear();
      resetImageFreshnessForTests();
      vi.unstubAllEnvs();
    }
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
    history.replaceState({ kupuaKey: "detail",
      _detailOriginKupuaKey: "list", _detailEntryImageId: "A" }, "", "/search?image=B");
  });

  afterEach(() => {
    cleanup();
    useSearchStore.setState(initialState, true);
    useUiPrefsStore.setState(initialPrefs, true);
    fixture.composed = false;
    fixture.realDismiss = false;
    fixture.compact = false;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("Home publication cannot start the first cached restore while detail remains mounted", async () => {
    const dataSource = new MockDataSource(5000);
    const target = await dataSource.searchAfter({ ids: "img-2500", length: 1 }, null);
    fixture.cached.mockReturnValue({ cursor: target.sortValues[0] as [number, string], offset: 2500 });
    useUiPrefsStore.setState({ density: "grid", focusMode: "explicit", _pointerCoarse: false });
    useSearchStore.setState({ ...initialState, dataSource, total: 0, results: [], bufferOffset: 200,
      imagePositions: new Map(), focusedImageId: null, params: { nonFree: "true" }, pitId: null });
    const read = vi.spyOn(dataSource, "searchAfter");
    const originalSearch = useSearchStore.getState().search;
    const published = deferred<void>();
    const completion = deferred<void>();
    vi.spyOn(useSearchStore.getState(), "search").mockImplementation(async (...args) => {
      await originalSearch(...args);
      published.resolve();
      await completion.promise;
    });
    render(<List imageId="img-2500" />);
    await act(async () => {});
    expect(read).not.toHaveBeenCalled();
    const { resetToHome } = await vi.importActual<typeof import("@/lib/reset-to-home")>("@/lib/reset-to-home");
    const navigateHome = vi.fn(() => close());
    let home!: Promise<void>;
    try {
      await act(async () => { home = resetToHome(navigateHome); await published.promise; });
      expect(screen.getByTestId("metadata").textContent).toContain("img-2500");
      expect(navigateHome).not.toHaveBeenCalled();
      expect(fixture.cached).toHaveBeenCalled();
      expect(read).toHaveBeenCalledOnce();
      expect(useSearchStore.getState()).toMatchObject({ bufferOffset: 0, loading: false, _cursorRestore: null });
    } finally {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      await act(async () => { completion.resolve(); await home; });
      act(() => vi.runOnlyPendingTimers());
      await act(async () => {});
    }
    expect(navigateHome).toHaveBeenCalledOnce();
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
    fixture.compact = true;
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
          ids: (body.ids as string[] | undefined)?.join(","), length: body.length as number | undefined,
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
      expect(requests.filter(request => (request.body.ids as string[] | undefined)?.join(",") === targetId)).toHaveLength(1);
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
        expect(requests.filter(request => request.path === "/api/images/window")).toHaveLength(0);
        expect(useSearchStore.getState().error).not.toBeNull();
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
  });

  it.each(["different", "same-id"])("late identity failure preserves newer %s focus without a numeric substitute", async (intent) => {
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
    expect(useSearchStore.getState().results).toEqual([]);
    expect(useSearchStore.getState().error).not.toBeNull();
    expect(useSearchStore.getState().focusedImageId).toBe(intent === "different" ? "new-focus" : "img-2500");
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
    history.replaceState({ kupuaKey: "detail",
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

  it.each(["different", "same-id"])("newer %s focus during neighbour loading retains data but not old presentation", async (intent) => {
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
    await act(async () => lookup.resolve(target));
    expect(read).toHaveBeenCalledTimes(3);
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
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("cursorless pending identity restoration is reused on re-entry without a second lookup", async () => {
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
    expect(read).toHaveBeenCalledTimes(3);
    expect(read.mock.calls.filter(([params]) => params.ids === "img-2500")).toHaveLength(1);
    expect(useSearchStore.getState().imagePositions.get("img-2500")).toBe(2500);
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