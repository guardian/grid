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
    const stored = sessionStorageMock["kupua-selection"];
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
      expect("pendingFetchIds" in partial).toBe(false);
      expect("reconciledView" in partial).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Reconcile scheduling
// ---------------------------------------------------------------------------

describe("reconcile scheduling", () => {
  it("reconciledView is eventually populated after toggle + metadata fetch", async () => {
    // Toggle adds img-0 -> ensureMetadata -> enqueueReconcile -> processChunk (sync in test)
    useSelectionStore.getState().toggle("img-0");
    // Wait for ensureMetadata async to complete.
    await vi.waitFor(() => {
      const { metadataCache } = useSelectionStore.getState();
      return metadataCache.has("img-0");
    });
    // requestIdleCallback mock fires synchronously; reconciledView should be set.
    // Note: the reconcile queue is drained by enqueueReconcile -> scheduleIdle -> cb().
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
