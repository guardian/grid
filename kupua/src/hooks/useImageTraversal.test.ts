/**
 * @vitest-environment jsdom
 *
 * Session lifecycle regression test for useImageTraversal.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useSearchStore } from "@/stores/search-store";
import type { Image } from "@/types/image";
import { useImageTraversal } from "./useImageTraversal";
import { prefetchNearbyImages } from "@/lib/image-prefetch";
import { createMemoryHistory } from "@tanstack/react-router";
import { MockDataSource } from "@/dal/mock-data-source";
import type { SortValues } from "@/dal/types";
import { POST_EXTEND_COOLDOWN_MS } from "@/constants/tuning";

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

  it("skips unavailable slots in both directions and settles an unavailable tail", () => {
    const { images } = setupBuffer({ bufferOffset: 0, bufferSize: 5, total: 5 });
    images[1].__availability = "unavailable";
    images[2].__availability = "deleted";
    images[4].__availability = "deleted";
    const extendForward = vi.fn();
    useSearchStore.setState({ extendForward });
    const onNavigate = vi.fn();
    const view = renderHook(({ id }) => useImageTraversal(id, onNavigate), { initialProps: { id: "img-0" } });
    expect(view.result.current.nextImage?.id).toBe("img-3");
    act(() => view.result.current.goToNext());
    expect(onNavigate).toHaveBeenLastCalledWith(images[3], 3);
    view.rerender({ id: "img-3" });
    expect(view.result.current.prevImage?.id).toBe("img-0");
    expect(view.result.current.canGoNext).toBe(false);
    act(() => view.result.current.goToNext());
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(extendForward).not.toHaveBeenCalled();
    act(() => view.result.current.goToPrev());
    expect(onNavigate).toHaveBeenLastCalledWith(images[0], 0);
    view.unmount();
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

describe("traversal through duplicate-only extension", () => {
  afterEach(() => {
    cleanup();
    useSearchStore.getState().abortExtends();
    useSearchStore.setState(useSearchStore.getInitialState(), true);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([{ direction: "forward", retry: false }, { direction: "backward", retry: false }, { direction: "forward", retry: true }] as const)("Unit B settles $direction terminal demand and preserves a later explicit retry=$retry", async ({ direction, retry }) => {
    const source = new MockDataSource(10_000);
    const params = { orderBy: "-uploadTime", nonFree: "true" };
    const initial = await source.searchAfter({ ...params, offset: 2000, length: 200 }, null);
    const boundary = (direction === "forward" ? initial.sortValues.at(-1) : initial.sortValues[0])!;
    const later = await source.searchAfter({ ...params, length: 200 }, boundary, null, undefined, direction === "backward");
    const read = vi.spyOn(source, "searchAfter").mockResolvedValueOnce({ hits: [], sortValues: [], total: 0 }).mockResolvedValue(later);
    useSearchStore.setState({ ...useSearchStore.getInitialState(), dataSource: source, params,
      results: initial.hits, bufferOffset: 2000, total: 10_000,
      imagePositions: new Map(initial.hits.map((image, index) => [image.id, 2000 + index])),
      startCursor: initial.sortValues[0], endCursor: initial.sortValues.at(-1)!,
    }, true);
    vi.useFakeTimers({ toFake: ["Date"] });
    useSearchStore.getState().abortExtends();
    vi.setSystemTime(Date.now() + 2100);
    const navigate = vi.fn();
    const origin = direction === "forward" ? initial.hits.at(-1)!.id : initial.hits[0].id;
    const cancelled = vi.fn();
    const view = renderHook(() => useImageTraversal(origin, navigate, undefined, cancelled));
    await act(async () => {
      if (direction === "forward") view.result.current.goToNext();
      else view.result.current.goToPrev();
    });
    expect(read).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(useSearchStore.getState().total).toBe(10_000);
    await act(async () => {
      if (retry) view.result.current.goToNext();
      else if (direction === "forward") await useSearchStore.getState().extendForward();
      else await useSearchStore.getState().extendBackward();
    });
    expect(navigate).toHaveBeenCalledTimes(retry ? 1 : 0);
    if (!retry) act(() => {
      if (direction === "forward") view.result.current.goToNext();
      else view.result.current.goToPrev();
    });
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate.mock.calls[0][0].id).toBe(direction === "forward" ? later.hits[0].id : later.hits.at(-1)!.id);
    view.unmount();
  });

  it.each([
    { direction: "forward", duringCooldown: false, depart: false, repeat: false },
    { direction: "backward", duringCooldown: false, depart: false, repeat: false },
    { direction: "forward", duringCooldown: true, depart: false, repeat: false },
    { direction: "forward", duringCooldown: true, depart: true, repeat: false },
    { direction: "forward", duringCooldown: true, depart: false, repeat: true },
  ] as const)(
    "keeps $direction duplicate-only continuation owned through cooldown $duringCooldown, departure $depart and repeat $repeat",
    async ({ direction, duringCooldown, depart, repeat }) => {
      const dataSource = new MockDataSource(10_000);
      const params = { orderBy: "-uploadTime", nonFree: "true" };
      const initial = await dataSource.searchAfter({ ...params, offset: 2000, length: 200 }, null);
      const boundary = (direction === "forward" ? initial.sortValues.at(-1) : initial.sortValues[0])!;
      const fresh = await dataSource.searchAfter({ ...params, length: 200 }, boundary, null, undefined, direction === "backward");
      const backward = duringCooldown
        ? await dataSource.searchAfter({ ...params, length: 200 }, initial.sortValues[0], null, undefined, true)
        : undefined;
      const duplicate = initial.hits[100];
      const progressedCursor: SortValues = [Number(boundary[0]) + (direction === "forward" ? -1 : 1), duplicate.id];
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const read = vi.spyOn(dataSource, "searchAfter")
        .mockRejectedValue(new Error("Unexpected extra extension"))
        .mockImplementationOnce(async () => {
          await held;
          return { hits: [duplicate], sortValues: [progressedCursor], total: 10_000 };
        });
      if (backward) read.mockResolvedValueOnce(backward);
      read.mockResolvedValueOnce(fresh);
      useSearchStore.setState({
        ...useSearchStore.getInitialState(), dataSource, params,
        results: initial.hits, bufferOffset: 2000, total: 10_000,
        imagePositions: new Map(initial.hits.map((image, index) => [image.id, 2000 + index])),
        startCursor: initial.sortValues[0], endCursor: initial.sortValues.at(-1)!,
      }, true);
      vi.useFakeTimers({ toFake: ["Date"] });
      useSearchStore.getState().abortExtends();
      vi.setSystemTime(Date.now() + 2100);
      const navigate = vi.fn();
      const origin = direction === "forward" ? initial.hits.at(-1)!.id : initial.hits[0].id;
      const view = renderHook(({ imageId }: { imageId: string | null }) => useImageTraversal(imageId, navigate),
        { initialProps: { imageId: origin as string | null } });

      try {
        await act(async () => {
          if (direction === "forward") view.result.current.goToNext();
          else view.result.current.goToPrev();
        });
        if (duringCooldown) await act(async () => { await useSearchStore.getState().extendBackward(); });
        await act(async () => { release(); await read.mock.results[0].value; });
        if (duringCooldown) {
          expect(read).toHaveBeenCalledTimes(2);
          if (repeat) act(() => view.result.current.goToNext());
          if (depart) view.rerender({ imageId: null });
          vi.setSystemTime(Date.now() + POST_EXTEND_COOLDOWN_MS);
        }
        if (depart) {
          await act(async () => { await new Promise(resolve => setTimeout(resolve, POST_EXTEND_COOLDOWN_MS + 10)); });
          expect(read).toHaveBeenCalledTimes(2);
          expect(navigate).not.toHaveBeenCalled();
          return;
        }

        await waitFor(() => expect(navigate).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ id: direction === "forward" ? fresh.hits[0].id : fresh.hits.at(-1)!.id }),
          direction === "forward" ? 2200 : 1999,
        ));
        expect(read).toHaveBeenCalledTimes(duringCooldown ? 3 : 2);
        expect(read.mock.calls[duringCooldown ? 2 : 1][1]).toEqual(progressedCursor);
        for (const image of initial.hits) {
          expect(useSearchStore.getState().results.find((candidate) => candidate?.id === image.id)).toBe(image);
        }
      } finally {
        release();
      }
    },
  );
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

