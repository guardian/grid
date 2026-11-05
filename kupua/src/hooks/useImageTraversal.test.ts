/**
 * @vitest-environment jsdom
 *
 * Session lifecycle regression test for useImageTraversal.
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useSearchStore } from "@/stores/search-store";
import type { Image } from "@/types/image";
import { useImageTraversal } from "./useImageTraversal";
import { prefetchNearbyImages } from "@/lib/image-prefetch";
import { createMemoryHistory } from "@tanstack/react-router";

vi.mock("@/lib/image-prefetch", () => ({
  prefetchNearbyImages: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal Image object for testing. */
function makeImage(id: string): Image {
  return {
    id,
    uploadTime: "2024-01-01T00:00:00Z",
    uploadedBy: "test",
    softDeletedMetadata: undefined,
    source: { uri: "", name: "", id: "" },
    metadata: {
      description: id,
      credit: undefined,
      byline: undefined,
      title: undefined,
      copyright: undefined,
      copyrightNotice: undefined,
      suppliersReference: undefined,
      keywords: [],
      subjects: [],
      specialInstructions: undefined,
      subLocation: undefined,
      city: undefined,
      state: undefined,
      country: undefined,
      dateTaken: undefined,
      people: [],
    },
    usages: [],
    exports: [],
    collections: [],
    leases: { leases: [], lastModified: undefined },
    usageRights: { category: "handout" },
  } as unknown as Image;
}

/** Set up store state with a buffer at given offset. */
function setupBuffer(opts: {
  bufferOffset: number;
  bufferSize: number;
  total: number;
}) {
  const images = Array.from({ length: opts.bufferSize }, (_, i) =>
    makeImage(`img-${opts.bufferOffset + i}`),
  );

  const imagePositions = new Map<string, number>();
  images.forEach((img, i) => {
    imagePositions.set(img.id, opts.bufferOffset + i);
  });

  useSearchStore.setState({
    results: images,
    bufferOffset: opts.bufferOffset,
    total: opts.total,
    imagePositions,
    positionMap: null,
  });

  return { images, imagePositions };
}

describe("useImageTraversal — session lifecycle", () => {
  beforeEach(() => {
    useSearchStore.setState(useSearchStore.getInitialState());
  });

  it("does not resolve an old pending traversal in a reopened preview session", () => {
    setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 1000 });
    const extendForward = vi.fn();
    const extendBackward = vi.fn();
    useSearchStore.setState({ extendForward, extendBackward });
    const onNavigate = vi.fn();

    const { result, rerender } = renderHook(
      ({ imageId }: { imageId: string | null }) =>
        useImageTraversal(imageId, onNavigate),
      { initialProps: { imageId: "img-299" as string | null } },
    );

    act(() => result.current.goToNext());
    expect(extendForward).toHaveBeenCalled();

    rerender({ imageId: null });
    rerender({ imageId: "img-500" });

    act(() => {
      setupBuffer({ bufferOffset: 500, bufferSize: 200, total: 1000 });
    });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(extendBackward).not.toHaveBeenCalled();
  });
});

describe("KUP-019 pending traversal ownership", () => {
  const initial = useSearchStore.getInitialState();

  beforeEach(() => {
    vi.clearAllMocks();
    useSearchStore.setState({ ...initial, params: { query: "first", orderBy: "-uploadTime" } }, true);
  });

  afterEach(() => {
    cleanup();
    useSearchStore.setState(initial, true);
  });

  function heldWindow(direction: "forward" | "backward", publish = () => {
    setupBuffer({ bufferOffset: direction === "forward" ? 100 : 0, bufferSize: 400, total: 1000 });
  }) {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const completion = pending.then(publish);
    const action = vi.fn(() => completion);
    useSearchStore.setState({ extendForward: direction === "forward" ? action : vi.fn(), extendBackward: direction === "backward" ? action : vi.fn(), seek: action });
    return { action, complete: async () => { await act(async () => { release(); await completion; }); } };
  }

  for (const change of ["image", "query", "order", "query-roundtrip", "inactive", "unmount"] as const) {
    it(`does not transfer a pending direction across ${change}`, async () => {
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 1000 });
      const request = heldWindow("forward");
      const navigate = vi.fn();
      const view = renderHook(({ imageId }: { imageId: string | null }) => useImageTraversal(imageId, navigate),
        { initialProps: { imageId: "img-299" as string | null } });
      act(() => view.result.current.goToNext());
      expect(request.action).toHaveBeenCalledOnce();
      if (change === "image") view.rerender({ imageId: "img-110" });
      if (change === "inactive") view.rerender({ imageId: null });
      if (change === "unmount") view.unmount();
      act(() => {
        if (change === "query" || change === "query-roundtrip") useSearchStore.getState().setParams({ query: "newer" });
        if (change === "query-roundtrip") useSearchStore.getState().setParams({ query: "first" });
        if (change === "order") useSearchStore.getState().setParams({ orderBy: "uploadTime" });
      });
      await request.complete();
      expect(navigate).not.toHaveBeenCalled();
      expect(request.action).toHaveBeenCalledOnce();
    });
  }

  for (const direction of ["forward", "backward"] as const) {
    it(`ordinary pending ${direction} completes through buffer movement and callback replacement`, async () => {
      setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 1000 });
      const request = heldWindow(direction);
      const previous = vi.fn();
      const current = vi.fn();
      const origin = direction === "forward" ? "img-299" : "img-100";
      const view = renderHook(({ callback }) => useImageTraversal(origin, callback), { initialProps: { callback: previous } });
      act(() => direction === "forward" ? view.result.current.goToNext() : view.result.current.goToPrev());
      view.rerender({ callback: current });
      act(() => useSearchStore.getState().setParams({ length: 400 }));
      await request.complete();
      expect(previous).not.toHaveBeenCalled();
      expect(current).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: direction === "forward" ? "img-300" : "img-99" }), direction === "forward" ? 300 : 99);
      expect(prefetchNearbyImages).toHaveBeenCalled();
    });
  }

  it("resolves from the originating image's current coordinate after a prepend", async () => {
    setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 1000 });
    const request = heldWindow("backward", () => {
      const results = [makeImage("previous"), makeImage("img-100"), makeImage("following")];
      useSearchStore.setState({ results, bufferOffset: 98, imagePositions: new Map([["previous", 98], ["img-100", 99], ["following", 100]]) });
    });
    const navigate = vi.fn();
    const view = renderHook(() => useImageTraversal("img-100", navigate));
    act(() => view.result.current.goToPrev());
    await request.complete();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "previous" }), 98);
  });

  it("a successor pending request completes after the old origin is replaced", async () => {
    setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 1000 });
    const obsolete = heldWindow("forward", () => {});
    const navigate = vi.fn();
    const view = renderHook(({ imageId }) => useImageTraversal(imageId, navigate), { initialProps: { imageId: "img-299" } });
    act(() => view.result.current.goToNext());
    view.rerender({ imageId: "img-599" });
    act(() => setupBuffer({ bufferOffset: 400, bufferSize: 200, total: 1000 }));
    const successor = heldWindow("forward", () => { setupBuffer({ bufferOffset: 400, bufferSize: 400, total: 1000 }); });
    act(() => view.result.current.goToNext());
    await obsolete.complete();
    expect(navigate).not.toHaveBeenCalled();
    await successor.complete();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "img-600" }), 600);
  });

  it("resident traversal stays synchronous and absolute boundaries remain no-ops", () => {
    setupBuffer({ bufferOffset: 0, bufferSize: 200, total: 200 });
    const extendForward = vi.fn();
    const extendBackward = vi.fn();
    const seek = vi.fn();
    useSearchStore.setState({ extendForward, extendBackward, seek });
    const navigate = vi.fn();
    const view = renderHook(({ imageId }) => useImageTraversal(imageId, navigate), { initialProps: { imageId: "img-0" } });
    act(() => view.result.current.goToPrev());
    expect(navigate).not.toHaveBeenCalled();
    act(() => view.result.current.goToNext());
    expect(navigate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "img-1" }), 1);
    view.rerender({ imageId: "img-199" });
    act(() => view.result.current.goToNext());
    expect(navigate).toHaveBeenCalledOnce();
    expect(extendForward).not.toHaveBeenCalled();
    expect(extendBackward).not.toHaveBeenCalled();
    expect(seek).not.toHaveBeenCalled();
  });

  it("same-image same-query history departure invalidates the pending lifetime", async () => {
    setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 1000 });
    const history = createMemoryHistory({ initialEntries: ["/search?image=img-299"] });
    const request = heldWindow("forward");
    const navigate = vi.fn();
    const view = renderHook(() => useImageTraversal("img-299", navigate, history));
    act(() => view.result.current.goToNext());
    history.push("/search?image=img-299");
    await request.complete();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("repeated pending arrows retain one eventual movement rather than queuing steps", async () => {
    setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 1000 });
    const request = heldWindow("forward");
    const navigate = vi.fn();
    const view = renderHook(() => useImageTraversal("img-299", navigate));
    act(() => { view.result.current.goToNext(); view.result.current.goToNext(); });
    expect(request.action).toHaveBeenCalledTimes(2);
    await request.complete();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "img-300" }), 300);
  });

  it("a pending far seek resolves without additional requests", async () => {
    setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 1000 });
    useSearchStore.setState({ imagePositions: new Map([...useSearchStore.getState().imagePositions, ["img-600", 600]]) });
    const request = heldWindow("forward", () => { setupBuffer({ bufferOffset: 500, bufferSize: 200, total: 1000 }); });
    const navigate = vi.fn();
    const view = renderHook(() => useImageTraversal("img-600", navigate));
    act(() => view.result.current.goToNext());
    expect(request.action).toHaveBeenCalledExactlyOnceWith(601);
    await request.complete();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "img-601" }), 601);
  });
});

