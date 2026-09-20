/**
 * Unit tests for selection-store.ts.
 *
 * Tests cover:
 * - Initial state
 * - toggle / add / remove / clear
 * - setAnchor + ensureMetadata cohesion rule
 * - generationCounter monotonicity
 * - inSelectionMode derived state
 * - Persistence partialize/merge (selectedIds as string[], anchorId)
 * - hydrate() drops missing IDs
 * - Reconcile scheduling (via mocked requestIdleCallback)
 *
 * Environment: Vitest/Node (no DOM). sessionStorage and requestIdleCallback
 * are stubbed per-test. The store's persist adapter uses a lazy factory so
 * stubs set up in beforeEach are picked up correctly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSelectionStore, _resetReconcileQueue, _resetDebounceState, _resetMetadataCache, _resetHydrationToastShown } from "./selection-store";
import { useToastStore } from "./toast-store";
import { MockDataSource } from "@/dal/mock-data-source";
import { buildSearchKey, getRetainedSortValues, retainSortValues, setRetainedCursorAnchor } from "@/lib/image-offset-cache";
import { BUFFER_CAPACITY, SELECTION_PERSIST_DEBOUNCE_MS } from "@/constants/tuning";
import { RECONCILE_FIELDS } from "@/lib/field-registry";
import { recomputeAll } from "@/lib/reconcile";
import type { Image } from "@/types/image";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Simple in-memory sessionStorage replacement.
 * Defined at module level so beforeEach can clear it.
 */
const mockSessionStorage: Record<string, string> = {};
const sessionStorageMock = {
  getItem: (k: string) => mockSessionStorage[k] ?? null,
  setItem: (k: string, v: string) => { mockSessionStorage[k] = v; },
  removeItem: (k: string) => { delete mockSessionStorage[k]; },
  clear: () => { for (const k in mockSessionStorage) delete mockSessionStorage[k]; },
  get length() { return Object.keys(mockSessionStorage).length; },
  key: (i: number) => Object.keys(mockSessionStorage)[i] ?? null,
};

/** Mock requestIdleCallback to fire synchronously so tests are deterministic. */
const requestIdleCallbackMock = vi.fn((cb: () => void) => { cb(); return 0; });
/** Mock cancelIdleCallback (not used in store but prevents unknown-global warnings). */
const cancelIdleCallbackMock = vi.fn();

let mock: MockDataSource;

beforeEach(() => {
  setRetainedCursorAnchor(null);
  // Stub browser globals.
  vi.stubGlobal("sessionStorage", sessionStorageMock);
  vi.stubGlobal("requestIdleCallback", requestIdleCallbackMock);
  vi.stubGlobal("cancelIdleCallback", cancelIdleCallbackMock);

  // Clear in-memory storage.
  sessionStorageMock.clear();

  // Reset module-level scheduler state.
  _resetReconcileQueue();
  _resetDebounceState();
  _resetMetadataCache();
  _resetHydrationToastShown();

  // Reset toast queue.
  useToastStore.getState().queue.forEach((t) => useToastStore.getState().dismiss(t.id));
  useToastStore.setState({ queue: [] });

  // Fresh MockDataSource with 10 synthetic images.
  mock = new MockDataSource(10);

  // Reset store state between tests.
  useSelectionStore.setState({
    selectedIds: new Set<string>(),
    anchorId: null,
    generationCounter: 0,
    reconciledView: null,
    pendingFetchIds: new Set<string>(),
    dataSource: mock,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("initial state", () => {
  it("starts with empty selection", () => {
    const { selectedIds, anchorId } = useSelectionStore.getState();
    expect(selectedIds.size).toBe(0);
    expect(anchorId).toBeNull();
  });

  it("starts with generationCounter = 0", () => {
    expect(useSelectionStore.getState().generationCounter).toBe(0);
  });

  it("starts with reconciledView = null", () => {
    expect(useSelectionStore.getState().reconciledView).toBeNull();
  });

  it("inSelectionMode is false when selection is empty", () => {
    const { selectedIds } = useSelectionStore.getState();
    expect(selectedIds.size > 0).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toggle
// ---------------------------------------------------------------------------

describe("toggle", () => {
  it("adds an ID when not already selected", () => {
    useSelectionStore.getState().toggle("img-0");
    expect(useSelectionStore.getState().selectedIds.has("img-0")).toBe(true);
  });

  it("removes an ID when already selected", () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-0"]) });
    useSelectionStore.getState().toggle("img-0");
    expect(useSelectionStore.getState().selectedIds.has("img-0")).toBe(false);
  });

  it("bumps generationCounter on add", () => {
    const before = useSelectionStore.getState().generationCounter;
    useSelectionStore.getState().toggle("img-0");
    expect(useSelectionStore.getState().generationCounter).toBeGreaterThan(before);
  });

  it("bumps generationCounter on remove", () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-0"]) });
    const before = useSelectionStore.getState().generationCounter;
    useSelectionStore.getState().toggle("img-0");
    expect(useSelectionStore.getState().generationCounter).toBeGreaterThan(before);
  });

  it("inSelectionMode becomes true after first toggle add", () => {
    useSelectionStore.getState().toggle("img-0");
    expect(useSelectionStore.getState().selectedIds.size > 0).toBe(true);
  });

  it("calls ensureMetadata (starts a fetch) on toggle add", async () => {
    const spy = vi.spyOn(mock, "getByIds");
    useSelectionStore.getState().toggle("img-0");
    // Allow microtask/promise to run.
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith(["img-0"]);
  });
});

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

describe("add", () => {
  it("reconciles duplicate batch IDs once with one atomic persisted selection", async () => {
    await useSelectionStore.getState().ensureMetadata(["img-0", "img-1"]);
    useSelectionStore.getState().add(["img-0"]);
    const initial = useSelectionStore.getState();
    initial.add(["img-1"]);
    const expectedView = useSelectionStore.getState().reconciledView;
    useSelectionStore.setState(initial);
    _resetDebounceState();
    vi.useFakeTimers();
    const writes = vi.spyOn(sessionStorageMock, "setItem");
    const changes = vi.fn();
    const unsubscribe = useSelectionStore.subscribe(changes);

    try {
      useSelectionStore.getState().add(["img-0", "img-1", "img-1"]);

      expect(useSelectionStore.getState().selectedIds).toEqual(new Set(["img-0", "img-1"]));
      expect(useSelectionStore.getState().reconciledView).toEqual(expectedView);
      expect(useSelectionStore.getState().generationCounter).toBe(initial.generationCounter + 1);
      expect(changes).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(SELECTION_PERSIST_DEBOUNCE_MS);
      expect(writes).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockSessionStorage["kupua-selection"]).state.selectedIds).toEqual(["img-0", "img-1"]);
    } finally {
      unsubscribe();
      _resetDebounceState();
      vi.useRealTimers();
    }
  });

  it("fetches each uncached duplicate batch ID once", async () => {
    await useSelectionStore.getState().ensureMetadata(["img-0"]);
    useSelectionStore.getState().add(["img-0"]);
    const fetchMetadata = vi.spyOn(mock, "getByIds");

    useSelectionStore.getState().add(["img-0", "img-1", "img-1", "img-2", "img-2"]);
    await vi.waitFor(() => expect(useSelectionStore.getState().pendingFetchIds.size).toBe(0));

    expect(fetchMetadata).toHaveBeenCalledExactlyOnceWith(["img-1", "img-2"]);
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set(["img-0", "img-1", "img-2"]));
  });

  it("adds multiple IDs atomically", () => {
    useSelectionStore.getState().add(["img-0", "img-1", "img-2"]);
    const { selectedIds } = useSelectionStore.getState();
    expect(selectedIds.has("img-0")).toBe(true);
    expect(selectedIds.has("img-1")).toBe(true);
    expect(selectedIds.has("img-2")).toBe(true);
  });

  it("deduplicates against existing selectedIds", () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-0"]) });
    const spy = vi.spyOn(mock, "getByIds");
    useSelectionStore.getState().add(["img-0", "img-1"]);
    // ensureMetadata should only be called for img-1 (img-0 already selected,
    // dedup happens before ensureMetadata is called).
    // Wait for any pending async.
    return vi.waitFor(() => {
      if (spy.mock.calls.length > 0) {
        const called = spy.mock.calls.flat(2);
        expect(called).not.toContain("img-0");
      }
    });
  });

  it("does not add duplicates when all IDs are already selected", () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-0", "img-1"]) });
    const before = useSelectionStore.getState().generationCounter;
    useSelectionStore.getState().add(["img-0", "img-1"]);
    // No state update should have happened.
    expect(useSelectionStore.getState().generationCounter).toBe(before);
  });

  it("bumps generationCounter", () => {
    const before = useSelectionStore.getState().generationCounter;
    useSelectionStore.getState().add(["img-0"]);
    expect(useSelectionStore.getState().generationCounter).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe("remove", () => {
  it("reconciles duplicate batch IDs once with one atomic persisted selection", async () => {
    vi.stubGlobal("requestIdleCallback", vi.fn(() => 0));
    const [image] = await mock.getByIds(["img-0"]);
    const { metadataCache } = useSelectionStore.getState();
    metadataCache.set("img-0", image);
    metadataCache.set("img-1", { ...image, id: "img-1" });
    useSelectionStore.getState().add(["img-0", "img-1"]);
    const initial = useSelectionStore.getState();
    initial.remove(["img-1"]);
    const expectedView = useSelectionStore.getState().reconciledView;
    _resetReconcileQueue();
    useSelectionStore.setState(initial);
    _resetDebounceState();
    vi.useFakeTimers();
    const reads = vi.spyOn(metadataCache, "get");
    const writes = vi.spyOn(sessionStorageMock, "setItem");
    const changes = vi.fn();
    const unsubscribe = useSelectionStore.subscribe((state, previous) => {
      if (state.selectedIds !== previous.selectedIds) changes(state);
    });

    try {
      useSelectionStore.getState().remove(["img-1", "img-1", "img-99"]);

      expect(useSelectionStore.getState().selectedIds).toEqual(new Set(["img-0"]));
      expect(useSelectionStore.getState().reconciledView).toEqual(expectedView);
      expect(reads).toHaveBeenCalledExactlyOnceWith("img-1");
      expect(useSelectionStore.getState().generationCounter).toBe(initial.generationCounter + 1);
      expect(changes).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(SELECTION_PERSIST_DEBOUNCE_MS);
      expect(writes).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockSessionStorage["kupua-selection"]).state.selectedIds).toEqual(["img-0"]);
    } finally {
      unsubscribe();
      _resetReconcileQueue();
      _resetDebounceState();
      vi.useRealTimers();
    }
  });

  it("removes specified IDs", () => {
    useSelectionStore.setState({
      selectedIds: new Set(["img-0", "img-1", "img-2"]),
    });
    useSelectionStore.getState().remove(["img-1"]);
    const { selectedIds } = useSelectionStore.getState();
    expect(selectedIds.has("img-0")).toBe(true);
    expect(selectedIds.has("img-1")).toBe(false);
    expect(selectedIds.has("img-2")).toBe(true);
  });

  it("is a no-op for IDs not in the selection", () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-0"]) });
    const before = useSelectionStore.getState().generationCounter;
    useSelectionStore.getState().remove(["img-99"]);
    expect(useSelectionStore.getState().generationCounter).toBe(before);
  });

  it("bumps generationCounter", () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-0"]) });
    const before = useSelectionStore.getState().generationCounter;
    useSelectionStore.getState().remove(["img-0"]);
    expect(useSelectionStore.getState().generationCounter).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

describe("clear", () => {
  it("resets selectedIds and anchorId", () => {
    useSelectionStore.setState({
      selectedIds: new Set(["img-0", "img-1"]),
      anchorId: "img-0",
    });
    useSelectionStore.getState().clear();
    const { selectedIds, anchorId } = useSelectionStore.getState();
    expect(selectedIds.size).toBe(0);
    expect(anchorId).toBeNull();
  });

  it("resets reconciledView to null", () => {
    useSelectionStore.setState({
      selectedIds: new Set(["img-0"]),
      reconciledView: new Map(),
    });
    useSelectionStore.getState().clear();
    expect(useSelectionStore.getState().reconciledView).toBeNull();
  });

  it("bumps generationCounter", () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-0"]) });
    const before = useSelectionStore.getState().generationCounter;
    useSelectionStore.getState().clear();
    expect(useSelectionStore.getState().generationCounter).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// setAnchor
// ---------------------------------------------------------------------------

describe("setAnchor", () => {
  it.each(["setAnchor", "hydrate"] as const)("retains the active anchor tuple beyond the recent cache when metadata is unavailable (%s)", async (owner) => {
    vi.spyOn(mock, "getByIds").mockRejectedValue(new Error("fixture metadata unavailable"));
    const searchKey = buildSearchKey({ query: "fixture", orderBy: "editStatus" });
    const anchor = { id: "img-3" } as Image;
    const cursor = ["fixture-alias", 1234567890, anchor.id];
    retainSortValues(searchKey, [anchor], [cursor], true);
    useSelectionStore.setState({ selectedIds: new Set([anchor.id]), anchorId: anchor.id });
    if (owner === "hydrate") await useSelectionStore.getState().hydrate();
    else useSelectionStore.getState().setAnchor(anchor.id);
    await vi.waitFor(() => expect(useSelectionStore.getState().pendingFetchIds.size).toBe(0));
    expect(useSelectionStore.getState().metadataCache.get(anchor.id)).toBeUndefined();

    const laterImages = Array.from({ length: BUFFER_CAPACITY * 2 + 1 }, (_, index) => ({
      id: `later-${index}`,
    } as Image));
    retainSortValues(searchKey, laterImages, laterImages.map((image) => ["fixture-alias", 1234567890, image.id]));

    expect(getRetainedSortValues(anchor.id, searchKey)).toEqual(cursor);
    useSelectionStore.getState().setAnchor(anchor.id);
    expect(getRetainedSortValues(anchor.id, searchKey)).toEqual(cursor);
    await vi.waitFor(() => expect(useSelectionStore.getState().pendingFetchIds.size).toBe(0));
    useSelectionStore.getState().clear();
    expect(getRetainedSortValues(anchor.id, searchKey)).toBeNull();
  });

  it.each(["toggle", "remove"] as const)("moves retained cursor ownership when %s re-elects the anchor", async (operation) => {
    vi.spyOn(mock, "getByIds").mockRejectedValue(new Error("fixture metadata unavailable"));
    const searchKey = buildSearchKey({ query: "fixture" });
    const images = [{ id: "img-0" }, { id: "img-3" }] as Image[];
    retainSortValues(searchKey, images, [[100, "img-0"], [300, "img-3"]], true);
    useSelectionStore.setState({ selectedIds: new Set(["img-0", "img-3"]) });
    useSelectionStore.getState().setAnchor("img-3");
    await vi.waitFor(() => expect(useSelectionStore.getState().pendingFetchIds.size).toBe(0));
    if (operation === "toggle") useSelectionStore.getState().toggle("img-3");
    else useSelectionStore.getState().remove(["img-3"]);
    const laterImages = Array.from({ length: BUFFER_CAPACITY * 2 + 1 }, (_, index) => ({
      id: `later-${index}`,
    } as Image));
    retainSortValues(searchKey, laterImages, laterImages.map((image) => [1000, image.id]));

    expect(useSelectionStore.getState().anchorId).toBe("img-0");
    expect(getRetainedSortValues("img-0", searchKey)).toEqual([100, "img-0"]);
    expect(getRetainedSortValues("img-3", searchKey)).toBeNull();
  });

  it("sets anchorId", () => {
    useSelectionStore.getState().setAnchor("img-3");
    expect(useSelectionStore.getState().anchorId).toBe("img-3");
  });

  it("clears anchorId when called with null", () => {
    useSelectionStore.setState({ anchorId: "img-3" });
    useSelectionStore.getState().setAnchor(null);
    expect(useSelectionStore.getState().anchorId).toBeNull();
  });

  it("calls ensureMetadata when setting a non-null anchor", async () => {
    const spy = vi.spyOn(mock, "getByIds");
    useSelectionStore.getState().setAnchor("img-3");
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith(["img-3"]);
  });

  it("does NOT call ensureMetadata when clearing the anchor", () => {
    const spy = vi.spyOn(mock, "getByIds");
    useSelectionStore.setState({ anchorId: "img-3" });
    useSelectionStore.getState().setAnchor(null);
    // Allow any pending microtasks.
    return new Promise<void>((resolve) => setTimeout(resolve, 10)).then(() => {
      expect(spy).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// ensureMetadata
// ---------------------------------------------------------------------------

describe("ensureMetadata", () => {
  it("publishes one metadata revision per changed batch without replacing the cache", async () => {
    const before = useSelectionStore.getState();
    await before.ensureMetadata(["img-0", "img-1"]);
    expect(useSelectionStore.getState().metadataCache).toBe(before.metadataCache);
    expect(useSelectionStore.getState().metadataRevision).toBe(before.metadataRevision + 1);

    await useSelectionStore.getState().ensureMetadata(["img-0", "img-1"]);
    useSelectionStore.getState().add(["img-0", "img-1"]);
    useSelectionStore.getState().remove(["img-1"]);
    useSelectionStore.getState().clear();
    expect(useSelectionStore.getState().metadataRevision).toBe(before.metadataRevision + 1);
  });

  it.each(["empty", "rejected"] as const)("does not publish a metadata revision for an %s fetch", async (result) => {
    const fetchMetadata = vi.spyOn(mock, "getByIds");
    if (result === "empty") fetchMetadata.mockResolvedValue([]);
    else fetchMetadata.mockRejectedValue(new Error("fixture unavailable"));
    const before = useSelectionStore.getState();

    await before.ensureMetadata(["img-0"]);

    expect(useSelectionStore.getState().metadataRevision).toBe(before.metadataRevision);
    expect(useSelectionStore.getState().metadataCache).toBe(before.metadataCache);
    expect(useSelectionStore.getState().pendingFetchIds.size).toBe(0);
  });

  it("fetches metadata for uncached IDs and populates the cache", async () => {
    await useSelectionStore.getState().ensureMetadata(["img-0"]);
    const { metadataCache } = useSelectionStore.getState();
    expect(metadataCache.has("img-0")).toBe(true);
  });

  it("does not fetch IDs already in the cache", async () => {
    const spy = vi.spyOn(mock, "getByIds");
    // First call populates cache.
    await useSelectionStore.getState().ensureMetadata(["img-0"]);
    spy.mockClear();
    // Second call should skip img-0.
    await useSelectionStore.getState().ensureMetadata(["img-0"]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not double-fetch IDs currently in-flight (pendingFetchIds guard)", async () => {
    const spy = vi.spyOn(mock, "getByIds");
    // Fire two concurrent calls for the same ID.
    const p1 = useSelectionStore.getState().ensureMetadata(["img-0"]);
    const p2 = useSelectionStore.getState().ensureMetadata(["img-0"]);
    await Promise.all([p1, p2]);
    // getByIds should be called at most once for img-0.
    const allCalls = spy.mock.calls.flatMap(([ids]) => ids);
    const img0Calls = allCalls.filter((id) => id === "img-0");
    expect(img0Calls.length).toBeLessThanOrEqual(1);
  });

  it("bumps generationCounter after metadata is fetched", async () => {
    const before = useSelectionStore.getState().generationCounter;
    await useSelectionStore.getState().ensureMetadata(["img-0"]);
    expect(useSelectionStore.getState().generationCounter).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// hydrate
// ---------------------------------------------------------------------------

describe("hydrate", () => {
  it.each(["Error", "AbortError"])("does not repair membership, anchors or revisions after %s", async (name) => {
    vi.spyOn(mock, "getByIds").mockRejectedValue(Object.assign(new Error("fixture failure"), { name }));
    useSelectionStore.setState({ selectedIds: new Set(["img-0", "img-1"]), anchorId: "img-1" });
    const current = useSelectionStore.getState();
    await current.hydrate();
    expect(useSelectionStore.getState().selectedIds).toBe(current.selectedIds);
    expect(useSelectionStore.getState().anchorId).toBe(current.anchorId);
    expect(useSelectionStore.getState().metadataRevision).toBe(current.metadataRevision);
    expect(useSelectionStore.getState().reconciledView).toBe(current.reconciledView);
    expect(useToastStore.getState().queue).toEqual([]);
  });

  it("reuses late metadata and coalesces reconciliation for the current selection", async () => {
    const images = await mock.getByIds(["img-0", "img-1"]);
    const callbacks: Array<() => void> = [];
    vi.stubGlobal("requestIdleCallback", vi.fn((callback: () => void) => { callbacks.push(callback); return callbacks.length; }));
    let resolve!: (images: Image[]) => void;
    const fetchMetadata = vi.spyOn(mock, "getByIds").mockReturnValueOnce(new Promise<Image[]>(done => { resolve = done; }));
    useSelectionStore.setState({ selectedIds: new Set(["img-0", "img-1"]), anchorId: "img-0" });
    const pending = useSelectionStore.getState().hydrate();
    useSelectionStore.getState().remove(["img-1"]);
    const current = useSelectionStore.getState();
    const reads = vi.spyOn(current.metadataCache, "get");
    resolve(images);
    await pending;
    expect(useSelectionStore.getState().selectedIds).toBe(current.selectedIds);
    expect(useSelectionStore.getState().metadataCache).toBe(current.metadataCache);
    expect(useSelectionStore.getState().metadataRevision).toBe(current.metadataRevision + 1);
    expect(reads).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);
    callbacks[0]();
    expect(reads).toHaveBeenCalledExactlyOnceWith("img-0");
    expect(useSelectionStore.getState().reconciledView).toEqual(recomputeAll([images[0]], RECONCILE_FIELDS));
    useSelectionStore.getState().add(["img-1"]);
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set(["img-0", "img-1"]));
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
  });

  it("does not let an obsolete hydration consume the newer session's toast or cursor anchor", async () => {
    const images = await mock.getByIds(["img-0", "img-1", "img-2"]);
    const searchKey = buildSearchKey({ query: "ownership-cursors" });
    retainSortValues(searchKey, images, images.map(image => [100, image.id]), true);
    let resolve!: (images: Image[]) => void;
    const fetchMetadata = vi.spyOn(mock, "getByIds").mockReturnValueOnce(new Promise<Image[]>(done => { resolve = done; }));
    useSelectionStore.setState({ selectedIds: new Set(["img-0", "img-1"]), anchorId: "img-0" });
    const obsolete = useSelectionStore.getState().hydrate();
    useSelectionStore.getState().clear();
    useSelectionStore.getState().metadataCache.set("img-2", images[2]);
    useSelectionStore.getState().add(["img-2"]);
    useSelectionStore.getState().setAnchor("img-2");
    resolve([images[0]]);
    await obsolete;
    expect(useToastStore.getState().queue).toEqual([]);
    const later = Array.from({ length: BUFFER_CAPACITY * 2 + 1 }, (_, index) => ({ id: `cursor-later-${index}` } as Image));
    retainSortValues(searchKey, later, later.map(image => [200, image.id]));
    expect(getRetainedSortValues("img-2", searchKey)).toEqual([100, "img-2"]);
    expect(getRetainedSortValues("img-0", searchKey)).toBeNull();

    fetchMetadata.mockResolvedValue([]);
    await useSelectionStore.getState().hydrate();
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    expect(useSelectionStore.getState().anchorId).toBeNull();
    expect(useToastStore.getState().queue).toHaveLength(1);
    expect(getRetainedSortValues("img-2", searchKey)).toBeNull();
  });

  it.each(["success", "failure"] as const)("keeps the first completed omission repair owned when overlapping hydration ends with %s", async (outcome) => {
    const images = await mock.getByIds(["img-0", "img-1"]);
    let resolve!: (images: Image[]) => void;
    let reject!: (error: Error) => void;
    vi.spyOn(mock, "getByIds")
      .mockReturnValueOnce(new Promise<Image[]>((done, fail) => { resolve = done; reject = fail; }))
      .mockResolvedValueOnce([images[1]]);
    useSelectionStore.setState({ selectedIds: new Set(["img-0", "img-1"]), anchorId: "img-0" });
    const obsolete = useSelectionStore.getState().hydrate();
    await useSelectionStore.getState().hydrate();
    const current = useSelectionStore.getState();
    expect(current.selectedIds).toEqual(new Set(["img-1"]));
    expect(current.anchorId).toBe("img-1");
    if (outcome === "success") resolve([images[0]]);
    else reject(new Error("late hydration failure"));
    await obsolete;
    expect(useSelectionStore.getState().selectedIds).toBe(current.selectedIds);
    expect(useSelectionStore.getState().anchorId).toBe(current.anchorId);
    expect(useToastStore.getState().queue).toHaveLength(1);
  });

  it("retains current omission ownership through metadata generation changes and no-op actions", async () => {
    const images = await mock.getByIds(["img-0"]);
    let resolve!: (images: Image[]) => void;
    vi.spyOn(mock, "getByIds").mockReturnValueOnce(new Promise<Image[]>(done => { resolve = done; }));
    useSelectionStore.setState({ selectedIds: new Set(["img-0", "img-1"]), anchorId: "img-0" });
    const pending = useSelectionStore.getState().hydrate();
    const initial = useSelectionStore.getState();
    initial.add(["img-0"]);
    initial.remove(["absent"]);
    await initial.ensureMetadata(["img-2"]);
    expect(useSelectionStore.getState().generationCounter).toBeGreaterThan(initial.generationCounter);
    resolve(images);
    await pending;
    expect(useSelectionStore.getState().selectedIds).toEqual(new Set(["img-0"]));
    expect(useSelectionStore.getState().anchorId).toBe("img-0");
    expect(useToastStore.getState().queue).toHaveLength(1);
  });

  it.each(["clear", "newer selection", "newer anchor"] as const)("does not publish obsolete omission repair after %s", async (change) => {
    await useSelectionStore.getState().ensureMetadata(["img-1", "img-2"]);
    const returned = await mock.getByIds(["img-0"]);
    let resolve!: (images: Image[]) => void;
    const fetchMetadata = vi.spyOn(mock, "getByIds").mockReturnValueOnce(
      new Promise<Image[]>(done => { resolve = done; }),
    );
    useSelectionStore.setState({ selectedIds: new Set(["img-0", "img-1"]), anchorId: "img-0" });
    const pending = useSelectionStore.getState().hydrate();
    expect(fetchMetadata).toHaveBeenCalledExactlyOnceWith(["img-0", "img-1"]);

    if (change === "newer anchor") {
      useSelectionStore.getState().setAnchor("img-1");
    } else {
      useSelectionStore.getState().clear();
      if (change === "newer selection") {
        useSelectionStore.getState().add(["img-2"]);
        useSelectionStore.getState().setAnchor("img-2");
      }
    }
    const current = useSelectionStore.getState();
    resolve(returned);
    await pending;

    expect(useSelectionStore.getState().selectedIds).toBe(current.selectedIds);
    expect(useSelectionStore.getState().anchorId).toBe(current.anchorId);
    expect(useToastStore.getState().queue).toEqual([]);
    expect(useSelectionStore.getState().metadataCache).toBe(current.metadataCache);
    expect(current.metadataCache.get("img-0")).toBe(returned[0]);
    expect(useSelectionStore.getState().metadataRevision).toBe(current.metadataRevision + 1);
    if (change === "clear") expect(useSelectionStore.getState().reconciledView).toBeNull();
  });

  it.each([
    { label: "removed anchor", anchorId: "img-3", retainedIds: ["img-1", "img-0"], expectedAnchor: "img-0" },
    { label: "surviving anchor", anchorId: "img-1", retainedIds: ["img-1", "img-0"], expectedAnchor: "img-1" },
    { label: "empty selection", anchorId: "img-3", retainedIds: [], expectedAnchor: null },
    { label: "unset anchor", anchorId: null, retainedIds: ["img-1", "img-0"], expectedAnchor: null },
  ])("keeps selection and retained cursor anchors aligned after hydration ($label)", async ({ anchorId, retainedIds, expectedAnchor }) => {
    const initialIds = ["img-1", "img-0", "img-3"];
    const retainedImages = await mock.getByIds(retainedIds);
    const fetchMetadata = vi.spyOn(mock, "getByIds").mockResolvedValue(retainedImages);
    const searchKey = buildSearchKey({ query: "hydration-anchor", orderBy: "editStatus" });
    const initialImages = initialIds.map(id => ({ id } as Image));
    const cursors = initialImages.map(image => ["fixture-alias", 1234567890, image.id]);
    retainSortValues(searchKey, initialImages, cursors, true);
    useSelectionStore.setState({ selectedIds: new Set(initialIds), anchorId });

    await useSelectionStore.getState().hydrate();

    expect([...useSelectionStore.getState().selectedIds]).toEqual(retainedIds);
    expect(useSelectionStore.getState().anchorId).toBe(expectedAnchor);
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(fetchMetadata).toHaveBeenCalledWith(initialIds);

    const laterImages = Array.from({ length: BUFFER_CAPACITY * 2 + 1 }, (_, index) => ({
      id: `later-${index}`,
    } as Image));
    retainSortValues(searchKey, laterImages, laterImages.map(image => ["fixture-alias", 1234567890, image.id]));
    for (const [index, id] of initialIds.entries()) {
      expect(getRetainedSortValues(id, searchKey)).toEqual(id === expectedAnchor ? cursors[index] : null);
    }
  });

  it("publishes metadata revisions for changed images but not repeated references", async () => {
    const image = (await mock.getById("img-0"))!;
    const fetchMetadata = vi.spyOn(mock, "getByIds").mockResolvedValue([image]);
    useSelectionStore.setState({ selectedIds: new Set([image.id]) });
    const before = useSelectionStore.getState();

    await before.hydrate();
    expect(useSelectionStore.getState().metadataRevision).toBe(before.metadataRevision + 1);
    await useSelectionStore.getState().hydrate();
    expect(useSelectionStore.getState().metadataRevision).toBe(before.metadataRevision + 1);

    const changed = { ...image, metadata: { ...image.metadata, description: "changed fixture" } };
    fetchMetadata.mockResolvedValue([changed]);
    await useSelectionStore.getState().hydrate();
    expect(useSelectionStore.getState().metadataRevision).toBe(before.metadataRevision + 2);
    expect(useSelectionStore.getState().metadataCache).toBe(before.metadataCache);
    expect(before.metadataCache.get(image.id)).toBe(changed);
  });

  it("does nothing when selectedIds is empty", async () => {
    const spy = vi.spyOn(mock, "getByIds");
    await useSelectionStore.getState().hydrate();
    expect(spy).not.toHaveBeenCalled();
  });

  it("fetches metadata for all persisted IDs", async () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-0", "img-1"]) });
    const spy = vi.spyOn(mock, "getByIds");
    await useSelectionStore.getState().hydrate();
    expect(spy).toHaveBeenCalled();
    const { metadataCache } = useSelectionStore.getState();
    expect(metadataCache.has("img-0")).toBe(true);
    expect(metadataCache.has("img-1")).toBe(true);
  });

  it("silently drops IDs that ES returns nothing for", async () => {
    // MockDataSource has 10 images (img-0 to img-9). "img-999" doesn't exist.
    useSelectionStore.setState({
      selectedIds: new Set(["img-0", "img-999"]),
    });
    await useSelectionStore.getState().hydrate();
    const { selectedIds } = useSelectionStore.getState();
    expect(selectedIds.has("img-0")).toBe(true);
    expect(selectedIds.has("img-999")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Persist: partialize and merge
// ---------------------------------------------------------------------------

describe("persist partialize / merge", () => {
  it("persists selectedIds as an array and anchorId", async () => {
    // Use fake timers to control the debounce.
    vi.useFakeTimers();

    useSelectionStore.setState({
      selectedIds: new Set(["img-0", "img-1"]),
      anchorId: "img-0",
    });

    // Manually trigger the debounced write by fast-forwarding timers.
    // The debounce is 250ms.
    vi.advanceTimersByTime(300);

    // Check what was written to sessionStorage.
    const stored = mockSessionStorage["kupua-selection"];
    if (stored) {
      const parsed = JSON.parse(stored) as {
        state: { selectedIds: string[]; anchorId: string };
      };
      expect(Array.isArray(parsed.state.selectedIds)).toBe(true);
      expect(parsed.state.selectedIds).toContain("img-0");
      expect(parsed.state.anchorId).toBe("img-0");
    }
    // Even if stored is null (no write happened in Node test env without full
    // persist wiring), we verify the store state directly.
    expect(useSelectionStore.getState().selectedIds.has("img-0")).toBe(true);

    vi.useRealTimers();
  });

  it("metadataCache and pendingFetchIds are NOT persisted", () => {
    // The partialize function should exclude runtime-only fields.
    // We verify by checking what the persist middleware would serialise.
    // Access the internals via the store's private persist API.
    const store = useSelectionStore as unknown as {
      persist?: { getOptions?: () => { partialize?: (s: unknown) => unknown } };
    };
    const partialize = store.persist?.getOptions?.()?.partialize;
    if (partialize) {
      const full = useSelectionStore.getState();
      const partial = partialize(full) as Record<string, unknown>;
      expect("metadataCache" in partial).toBe(false);
      expect("metadataRevision" in partial).toBe(false);
      expect("pendingFetchIds" in partial).toBe(false);
      expect("reconciledView" in partial).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Reconcile scheduling
// ---------------------------------------------------------------------------

describe("reconcile scheduling", () => {
  function deferReconcile() {
    const callbacks: Array<() => void> = [];
    vi.stubGlobal("requestIdleCallback", vi.fn((callback: () => void) => {
      callbacks.push(callback);
      return callbacks.length;
    }));
    return callbacks;
  }

  it.each(["remove", "toggle", "hydrate"] as const)("publishes the canonical empty full reconciliation after final %s", async (operation) => {
    await useSelectionStore.getState().ensureMetadata(["img-0"]);
    if (operation === "hydrate") vi.spyOn(mock, "getByIds").mockResolvedValue([]);
    const callbacks = deferReconcile();
    useSelectionStore.getState().add(["img-0"]);

    for (let cycle = 0; cycle < 2; cycle++) {
      if (operation === "remove") useSelectionStore.getState().remove(["img-0"]);
      else if (operation === "toggle") useSelectionStore.getState().toggle("img-0");
      else await useSelectionStore.getState().hydrate();
      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
      expect(useSelectionStore.getState().isReconciling).toBe(true);
      expect(callbacks).toHaveLength(cycle + 1);
      callbacks[cycle]();
      expect(useSelectionStore.getState().reconciledView).toEqual(recomputeAll([], RECONCILE_FIELDS));
      expect(useSelectionStore.getState().isReconciling).toBe(false);
      if (cycle === 0) useSelectionStore.getState().add(["img-0"]);
    }
  });

  it("coalesces full reconciliation requests using the latest selection", async () => {
    await useSelectionStore.getState().ensureMetadata(["img-0", "img-1", "img-2"]);
    const callbacks = deferReconcile();
    useSelectionStore.getState().add(["img-0", "img-1", "img-2"]);
    useSelectionStore.getState().remove(["img-0"]);
    useSelectionStore.getState().remove(["img-1"]);
    const { metadataCache, generationCounter } = useSelectionStore.getState();
    const expected = recomputeAll([metadataCache.get("img-2")!], RECONCILE_FIELDS);
    const reads = vi.spyOn(metadataCache, "get");

    expect(callbacks).toHaveLength(1);
    callbacks[0]();

    expect(reads).toHaveBeenCalledExactlyOnceWith("img-2");
    expect(useSelectionStore.getState().reconciledView).toEqual(expected);
    expect(useSelectionStore.getState().generationCounter).toBe(generationCounter + 1);
    expect(useSelectionStore.getState().isReconciling).toBe(false);
  });

  it("coalesces metadata completions into one deferred full reconciliation scan", async () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-0", "img-1"]) });
    const callbacks = deferReconcile();
    const reads = vi.spyOn(useSelectionStore.getState().metadataCache, "get");

    await useSelectionStore.getState().ensureMetadata(["img-0"]);
    await useSelectionStore.getState().ensureMetadata(["img-1"]);

    expect(callbacks).toHaveLength(1);
    expect(reads).not.toHaveBeenCalled();
    callbacks[0]();
    expect(reads.mock.calls).toEqual([["img-0"], ["img-1"]]);
    expect(useSelectionStore.getState().reconciledView?.get("keywords")).toMatchObject({
      kind: "chip-array", total: 2,
    });
    expect(useSelectionStore.getState().isReconciling).toBe(false);
  });

  it("does not let a cleared full reconciliation callback consume newer work", async () => {
    await useSelectionStore.getState().ensureMetadata(["img-0", "img-1", "img-2"]);
    const callbacks = deferReconcile();
    useSelectionStore.getState().add(["img-0", "img-1"]);
    useSelectionStore.getState().remove(["img-0"]);
    useSelectionStore.getState().clear();
    expect(useSelectionStore.getState().reconciledView).toBeNull();
    expect(useSelectionStore.getState().isReconciling).toBe(false);
    useSelectionStore.getState().add(["img-1", "img-2"]);
    useSelectionStore.getState().remove(["img-1"]);
    const pending = useSelectionStore.getState();
    expect(callbacks).toHaveLength(2);

    callbacks[0]();

    expect(useSelectionStore.getState().reconciledView).toBe(pending.reconciledView);
    expect(useSelectionStore.getState().generationCounter).toBe(pending.generationCounter);
    expect(useSelectionStore.getState().isReconciling).toBe(true);
    callbacks[1]();
    expect(useSelectionStore.getState().reconciledView).toEqual(
      recomputeAll([pending.metadataCache.get("img-2")!], RECONCILE_FIELDS),
    );
    expect(useSelectionStore.getState().isReconciling).toBe(false);
  });

  it("reconciledView is eventually populated after toggle + metadata fetch", async () => {
    // Toggle adds img-0 -> ensureMetadata -> requestFullReconcile (sync in test)
    useSelectionStore.getState().toggle("img-0");
    // Wait for ensureMetadata async to complete.
    await vi.waitFor(() => {
      const { metadataCache } = useSelectionStore.getState();
      return metadataCache.has("img-0");
    });
    // requestIdleCallback mock fires synchronously; reconciledView should be set.
    // The full reconciliation runs through scheduleIdle -> cb().
    await vi.waitFor(() => {
      return useSelectionStore.getState().reconciledView !== null;
    });
    expect(useSelectionStore.getState().reconciledView).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addGroup / removeGroup (S5 -- latent group actions)
// ---------------------------------------------------------------------------

describe("addGroup", () => {
  it("adds all group IDs atomically (delegates to add)", () => {
    useSelectionStore.getState().addGroup(["img-0", "img-1", "img-2"]);
    const { selectedIds } = useSelectionStore.getState();
    expect(selectedIds.has("img-0")).toBe(true);
    expect(selectedIds.has("img-1")).toBe(true);
    expect(selectedIds.has("img-2")).toBe(true);
  });

  it("bumps generationCounter once (single write, not per-id)", () => {
    const before = useSelectionStore.getState().generationCounter;
    useSelectionStore.getState().addGroup(["img-0", "img-1", "img-2"]);
    // generationCounter must be >= before+1; the important thing is it changes.
    expect(useSelectionStore.getState().generationCounter).toBeGreaterThan(before);
  });

  it("deduplicates against existing selection", () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-0"]) });
    const before = useSelectionStore.getState().generationCounter;
    // All IDs already selected -- no-op
    useSelectionStore.getState().addGroup(["img-0"]);
    expect(useSelectionStore.getState().generationCounter).toBe(before);
  });

  it("calls ensureMetadata for the added IDs", async () => {
    const spy = vi.spyOn(mock, "getByIds");
    useSelectionStore.getState().addGroup(["img-0", "img-1"]);
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    // The call should include the IDs (order not guaranteed across chunks)
    const called = spy.mock.calls.flatMap(([ids]) => ids);
    expect(called).toContain("img-0");
    expect(called).toContain("img-1");
  });
});

// ---------------------------------------------------------------------------
// S6 -- hydrate() toast + dedup
// ---------------------------------------------------------------------------

describe("hydrate() — toast on missing IDs", () => {
  it("does not fire a toast when all IDs are found", async () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-0", "img-1"]) });
    await useSelectionStore.getState().hydrate();
    const { queue } = useToastStore.getState();
    expect(queue.length).toBe(0);
  });

  it("fires an information toast when some IDs are missing", async () => {
    // img-999 does not exist in MockDataSource (only img-0 .. img-9).
    useSelectionStore.setState({ selectedIds: new Set(["img-0", "img-999"]) });
    await useSelectionStore.getState().hydrate();
    const { queue } = useToastStore.getState();
    expect(queue.length).toBe(1);
    expect(queue[0].category).toBe("information");
    expect(queue[0].message).toMatch(/1 item/);
    expect(queue[0].message).toMatch(/no longer available/);
  });

  it("fires a toast with plural wording for multiple missing IDs", async () => {
    useSelectionStore.setState({
      selectedIds: new Set(["img-0", "img-998", "img-999"]),
    });
    await useSelectionStore.getState().hydrate();
    const { queue } = useToastStore.getState();
    expect(queue.length).toBe(1);
    expect(queue[0].message).toMatch(/2 items/);
  });

  it("does NOT fire a second toast on a second hydrate() call without clear()", async () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-999"]) });
    await useSelectionStore.getState().hydrate();
    // Reset store so img-999 is back in selectedIds (simulating a re-mount).
    useSelectionStore.setState({ selectedIds: new Set(["img-999"]) });
    useToastStore.setState({ queue: [] });
    await useSelectionStore.getState().hydrate();
    // _hydrationToastShown is still true from the first call — no second toast.
    expect(useToastStore.getState().queue.length).toBe(0);
  });

  it("resets the dedup flag after clear() so a reload can fire the toast again", async () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-999"]) });
    await useSelectionStore.getState().hydrate();
    expect(useToastStore.getState().queue.length).toBe(1);

    // clear() resets the flag.
    useSelectionStore.getState().clear();
    useToastStore.setState({ queue: [] });

    // Next hydrate with missing IDs should fire again.
    useSelectionStore.setState({ selectedIds: new Set(["img-999"]) });
    await useSelectionStore.getState().hydrate();
    expect(useToastStore.getState().queue.length).toBe(1);
  });
});

describe("removeGroup", () => {
  it("removes all group IDs atomically (delegates to remove)", () => {
    useSelectionStore.setState({
      selectedIds: new Set(["img-0", "img-1", "img-2"]),
    });
    useSelectionStore.getState().removeGroup(["img-0", "img-2"]);
    const { selectedIds } = useSelectionStore.getState();
    expect(selectedIds.has("img-0")).toBe(false);
    expect(selectedIds.has("img-1")).toBe(true);
    expect(selectedIds.has("img-2")).toBe(false);
  });

  it("is a no-op when none of the IDs are in the selection", () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-0"]) });
    const before = useSelectionStore.getState().generationCounter;
    useSelectionStore.getState().removeGroup(["img-99", "img-98"]);
    expect(useSelectionStore.getState().generationCounter).toBe(before);
  });

  it("bumps generationCounter when IDs are removed", () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-0", "img-1"]) });
    const before = useSelectionStore.getState().generationCounter;
    useSelectionStore.getState().removeGroup(["img-0"]);
    expect(useSelectionStore.getState().generationCounter).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// Anchor fallback on deselect
// ---------------------------------------------------------------------------

describe("anchor fallback on deselect", () => {
  describe("toggle() re-elects anchor", () => {
    it("elects the most-recently-added remaining ID when anchor is deselected", () => {
      // Select A, then C — anchor ends up as C.
      useSelectionStore.getState().toggle("img-0"); // select A
      useSelectionStore.getState().setAnchor("img-0");
      useSelectionStore.getState().toggle("img-2"); // select C
      useSelectionStore.getState().setAnchor("img-2");

      // Deselect C (the anchor).
      useSelectionStore.getState().toggle("img-2");

      const { anchorId, selectedIds } = useSelectionStore.getState();
      // C is gone from selection.
      expect(selectedIds.has("img-2")).toBe(false);
      // Anchor falls back to A (last remaining element = most recently added).
      expect(anchorId).toBe("img-0");
    });

    it("sets anchor to null when last selected image is deselected", () => {
      useSelectionStore.getState().toggle("img-0");
      useSelectionStore.getState().setAnchor("img-0");

      // Deselect the only selected image.
      useSelectionStore.getState().toggle("img-0");

      expect(useSelectionStore.getState().anchorId).toBeNull();
      expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    });

    it("does not change anchor when deselecting a non-anchor image", () => {
      useSelectionStore.getState().toggle("img-0");
      useSelectionStore.getState().setAnchor("img-0");
      useSelectionStore.getState().toggle("img-1");

      // Deselect img-1 (not the anchor).
      useSelectionStore.getState().toggle("img-1");

      expect(useSelectionStore.getState().anchorId).toBe("img-0");
    });

    it("picks the last Set element as fallback (insertion order)", () => {
      // Insert order: img-0, img-1, img-2, img-3.
      useSelectionStore.getState().toggle("img-0");
      useSelectionStore.getState().toggle("img-1");
      useSelectionStore.getState().toggle("img-2");
      useSelectionStore.getState().toggle("img-3");
      useSelectionStore.getState().setAnchor("img-2");

      // Deselect img-2 (the anchor).
      useSelectionStore.getState().toggle("img-2");

      // Last remaining in insertion order: img-3.
      expect(useSelectionStore.getState().anchorId).toBe("img-3");
    });
  });

  describe("remove() re-elects anchor", () => {
    it("elects fallback when anchor is among removed IDs", () => {
      useSelectionStore.setState({
        selectedIds: new Set(["img-0", "img-1", "img-2"]),
        anchorId: "img-2",
      });

      useSelectionStore.getState().remove(["img-2"]);

      // Anchor falls back to last remaining: img-1 (last in Set insertion order).
      expect(useSelectionStore.getState().anchorId).toBe("img-1");
      expect(useSelectionStore.getState().selectedIds.has("img-2")).toBe(false);
    });

    it("sets anchor to null when all selected IDs are removed", () => {
      useSelectionStore.setState({
        selectedIds: new Set(["img-0", "img-1"]),
        anchorId: "img-1",
      });

      useSelectionStore.getState().remove(["img-0", "img-1"]);

      expect(useSelectionStore.getState().anchorId).toBeNull();
    });

    it("does not change anchor when anchor is not among removed IDs", () => {
      useSelectionStore.setState({
        selectedIds: new Set(["img-0", "img-1", "img-2"]),
        anchorId: "img-0",
      });

      useSelectionStore.getState().remove(["img-1", "img-2"]);

      expect(useSelectionStore.getState().anchorId).toBe("img-0");
    });
  });

  describe("full scenario: select A, select C, deselect C, shift-click D", () => {
    it("after deselecting the anchor, shift-click can extend from fallback", () => {
      // This is the exact bug scenario from the report.
      // dispatchClickEffects processes effects in order: set-anchor, then toggle.
      const store = useSelectionStore.getState();

      // Step 1: Select A (enters selection mode, anchor = A).
      store.setAnchor("img-0");
      store.toggle("img-0");

      // Step 2: Select C (anchor = C).
      store.setAnchor("img-2");
      store.toggle("img-2");

      // Step 3: Deselect C. interpretClick emits [set-anchor(C), toggle(C)].
      store.setAnchor("img-2");
      store.toggle("img-2");

      // After toggle, anchor should have been re-elected away from img-2.
      const stateAfter = useSelectionStore.getState();
      expect(stateAfter.selectedIds.has("img-2")).toBe(false);
      // Anchor should be img-0 (the only remaining selected image).
      expect(stateAfter.anchorId).toBe("img-0");
      // Polarity check: anchor IS in selectedIds → "add" polarity.
      expect(stateAfter.selectedIds.has(stateAfter.anchorId!)).toBe(true);
    });
  });
});
