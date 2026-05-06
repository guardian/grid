/**
 * Selection store — multi-image selection state for Kupua.
 *
 * Separate from search-store because selection is a UI concern orthogonal
 * to the search lifecycle. A selected image stays selected through sort
 * changes and (optionally) search changes.
 *
 * Architecture: kupua/exploration/docs/00 Architecture and philosophy/05-selections.md
 *
 * Key invariants (enforced here, not expected from callers):
 * - `setAnchor(id)` MUST call `ensureMetadata([id])` — range-select's
 *   server-walk path needs the anchor's sort values in cache.
 * - `add(ids[])` MUST call `ensureMetadata(ids)` — reconciliation cannot
 *   run on uncached items.
 * - `add(ids[])` deduplicates against `selectedIds` BEFORE calling
 *   `ensureMetadata` — avoids refetching already-cached items.
 * - `add(ids[])` is ATOMIC — one sessionStorage write per call.
 * - Persist middleware writes are DEBOUNCED (~250ms trailing edge).
 * - `window.__kupua_selection_store__` exposed for Playwright perf tests.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Image } from "@/types/image";
import type { ImageDataSource } from "@/dal/types";
import { ElasticsearchDataSource } from "@/dal";
import { RECONCILE_FIELDS } from "@/lib/field-registry";
import type { FieldDefinition } from "@/lib/field-registry";
import {
  recomputeAll,
  reconcileAdd,
  reconcileRemove,
  hasDirtyFields,
} from "@/lib/reconcile";
import type { ReconciledView, FieldReconciliation } from "@/lib/reconcile";
import {
  SELECTION_PERSIST_DEBOUNCE_MS,
  SELECTION_METADATA_LRU_CAP,
  SELECTION_RECONCILE_CHUNK_SIZE,
} from "@/constants/tuning";
import { addToast } from "@/stores/toast-store";

// ---------------------------------------------------------------------------
// LRU cache — colocated because it's an implementation detail of this store
// ---------------------------------------------------------------------------

/**
 * Simple LRU Map with O(1) get, set, and eviction.
 * Uses Map's guaranteed insertion-order iteration: oldest = first key.
 */
class LruMap<K, V> {
  private readonly cap: number;
  private readonly map: Map<K, V>;

  constructor(cap: number) {
    this.cap = cap;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Re-insert to mark as most-recently-used.
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.cap) {
      // Evict the oldest entry (first key in insertion order).
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }
}

// ---------------------------------------------------------------------------
// Debounced sessionStorage adapter
// ---------------------------------------------------------------------------

/**
 * Module-level state for the debounced writes.
 * Scoped to this module; reset between tests via `_resetDebounceState()`.
 */
const _debounceState = {
  timer: undefined as ReturnType<typeof setTimeout> | undefined,
  pendingFn: undefined as (() => void) | undefined,
};

/**
 * Guards against double-firing the hydration drop toast in a single session.
 * Set true after the toast fires; reset on clear().
 * Exported for tests only.
 */
let _hydrationToastShown = false;

/** Exported for tests only — reset the hydration toast dedup flag. */
export function _resetHydrationToastShown(): void {
  _hydrationToastShown = false;
}

/** Exported for tests only — replace the metadataCache with a fresh LruMap. */
export function _resetMetadataCache(): void {
  useSelectionStore.setState({
    metadataCache: new LruMap<string, Image>(SELECTION_METADATA_LRU_CAP),
  });
}

/** Exported for tests only — reset debounce timer between tests. */
export function _resetDebounceState(): void {
  if (_debounceState.timer !== undefined) {
    clearTimeout(_debounceState.timer);
    _debounceState.timer = undefined;
  }
  _debounceState.pendingFn = undefined;
}

/**
 * Zustand persist storage adapter backed by sessionStorage.
 *
 * Writes are debounced at ~250ms trailing edge to avoid thrashing
 * sessionStorage on rapid toggle/shift-click sequences.
 *
 * Falls back to a no-op store in non-browser environments (Vitest/Node)
 * — tests that need to verify persistence behaviour mock sessionStorage
 * with vi.stubGlobal before running store operations.
 */
const selectionStorage = createJSONStorage<PersistedSelectionState>(() => ({
  getItem: (name: string): string | null => {
    if (typeof sessionStorage === "undefined") return null;
    try {
      return sessionStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    _debounceState.pendingFn = () => {
      if (typeof sessionStorage === "undefined") return;
      try {
        sessionStorage.setItem(name, value);
      } catch {
        /* ignore quota errors */
      }
    };
    if (_debounceState.timer !== undefined) clearTimeout(_debounceState.timer);
    _debounceState.timer = setTimeout(() => {
      _debounceState.pendingFn?.();
      _debounceState.pendingFn = undefined;
      _debounceState.timer = undefined;
    }, SELECTION_PERSIST_DEBOUNCE_MS);
  },
  removeItem: (name: string): void => {
    // Removes are immediate — debounce only applies to writes.
    if (_debounceState.timer !== undefined) clearTimeout(_debounceState.timer);
    _debounceState.timer = undefined;
    _debounceState.pendingFn = undefined;
    if (typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
}));

// ---------------------------------------------------------------------------
// Chunked reconcile scheduler
// ---------------------------------------------------------------------------

/**
 * IDs waiting for reconciliation after a metadata fetch completes.
 * Processed in idle-frame chunks to avoid blocking the main thread.
 */
let _reconcileQueueSet: Set<string> = new Set();
let _reconcileQueueArr: string[] = [];
let _reconcileFrameScheduled = false;
/**
 * Set when a `reconcileRemove` has left dirty fields — the next recompute
 * cycle will use `recomputeAll` instead of incremental `reconcileAdd`.
 */
let _reconcileNeedsFullRecompute = false;

/** Exported for tests — reset queue between tests. */
export function _resetReconcileQueue(): void {
  _reconcileQueueSet = new Set();
  _reconcileQueueArr = [];
  _reconcileFrameScheduled = false;
  _reconcileNeedsFullRecompute = false;
}

function scheduleIdle(fn: () => void): void {
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(fn, { timeout: 2000 });
  } else {
    setTimeout(fn, 0);
  }
}

/**
 * Enqueue IDs for lazy reconciliation and schedule an idle-frame processor
 * if not already scheduled. Call after `ensureMetadata` resolves.
 */
function enqueueReconcile(ids: string[], fullRecompute = false): void {
  for (const id of ids) {
    if (!_reconcileQueueSet.has(id)) {
      _reconcileQueueSet.add(id);
      _reconcileQueueArr.push(id);
    }
  }
  if (fullRecompute) _reconcileNeedsFullRecompute = true;
  if (!_reconcileFrameScheduled) {
    _reconcileFrameScheduled = true;
    scheduleIdle(processReconcileChunk);
  }
}

/**
 * Process one chunk of reconciliation work in an idle frame.
 * Self-schedules for the next chunk if more work remains.
 */
function processReconcileChunk(): void {
  const chunk = _reconcileQueueArr.splice(0, SELECTION_RECONCILE_CHUNK_SIZE);
  for (const id of chunk) _reconcileQueueSet.delete(id);

  if (chunk.length === 0) {
    _reconcileFrameScheduled = false;
    return;
  }

  const state = useSelectionStore.getState();
  const { metadataCache, selectedIds, reconciledView } = state;

  let nextView: ReconciledView;

  if (_reconcileNeedsFullRecompute || reconciledView === null) {
    // Full recompute: use all currently cached selected images.
    const allCached: Image[] = [];
    for (const id of selectedIds) {
      const img = metadataCache.get(id);
      if (img !== undefined) allCached.push(img);
    }
    nextView = recomputeAll(allCached, RECONCILE_FIELDS);
    _reconcileNeedsFullRecompute = false;
  } else {
    // Incremental: fold the chunk into the existing view.
    nextView = reconciledView;
    for (const id of chunk) {
      const img = metadataCache.get(id);
      if (img !== undefined) {
        nextView = reconcileAdd(img, nextView, RECONCILE_FIELDS);
      }
      // If image not in cache yet, skip — still marked pending.
    }
    // If any dirty fields remain (from prior removes), escalate to full.
    if (hasDirtyFields(nextView)) {
      const allCached: Image[] = [];
      for (const id of selectedIds) {
        const img2 = metadataCache.get(id);
        if (img2 !== undefined) allCached.push(img2);
      }
      nextView = recomputeAll(allCached, RECONCILE_FIELDS);
    }
  }

  useSelectionStore.setState((s) => ({
    reconciledView: nextView,
    generationCounter: s.generationCounter + 1,
  }));

  if (_reconcileQueueArr.length > 0) {
    scheduleIdle(processReconcileChunk);
  } else {
    _reconcileFrameScheduled = false;
  }
}

// ---------------------------------------------------------------------------
// Field list for reconciliation
// ---------------------------------------------------------------------------

/**
 * Fields that participate in reconciliation.
 * In S4, this will be filtered to `multiSelectBehaviour === "reconcile"`.
 * In S1, we include all fields with accessors (= all fields in the registry).
 */
// RECONCILE_FIELDS is imported from field-registry.ts (exported from S4 onwards).
// It excludes always-suppress fields (IDs, filenames, dimensions, upload dates)
// so the reconciled view only contains fields meaningful across a selection.
//
// ---------------------------------------------------------------------------
// Anchor fallback helper
// ---------------------------------------------------------------------------

/**
 * Elect a fallback anchor from remaining selected IDs after the current anchor
 * has been deselected. Returns the last element of the Set (most-recently
 * individually selected) or null if empty.
 */
function electFallbackAnchor(remainingIds: Set<string>): string | null {
  if (remainingIds.size === 0) return null;
  // Set iterates in insertion order; last element = most recently added.
  let last: string | null = null;
  for (const id of remainingIds) last = id;
  return last;
}

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

/**
 * The subset of state persisted to sessionStorage.
 * `Set` serialised to `string[]` via partialize / merge.
 */
interface PersistedSelectionState {
  selectedIds: string[];
  anchorId: string | null;
}

export interface SelectionState {
  // --- Core (persisted) ---
  /** Set of selected image IDs. Sacred — never auto-pruned. */
  selectedIds: Set<string>;
  /** Sticky anchor for shift-click ranges. */
  anchorId: string | null;

  // --- Reconciliation (runtime only) ---
  /** Monotonic counter bumped on every selectedIds mutation and on each
   * reconcile chunk completion. Use as memoisation key for selectors. */
  generationCounter: number;
  /** Null until first reconcile cycle completes. */
  reconciledView: ReconciledView | null;

  // --- Internal (runtime only) ---
  /** LRU cache of Image metadata, cap SELECTION_METADATA_LRU_CAP. */
  metadataCache: LruMap<string, Image>;
  /** IDs for which a `getByIds` fetch is currently in flight. */
  pendingFetchIds: Set<string>;
  /** Data source — swappable in tests. */
  dataSource: ImageDataSource;

  // --- Actions ---
  /**
   * Toggle the selection state of a single image.
   * Also calls `ensureMetadata([id])` and `setAnchor(id)`.
   */
  toggle(id: string): void;
  /**
   * Add multiple IDs atomically (one sessionStorage write).
   * Deduplicates against existing `selectedIds`.
   * Calls `ensureMetadata(newIds)` asynchronously.
   */
  add(ids: string[]): void;
  /** Remove IDs from the selection (no-op for IDs not in `selectedIds`). */
  remove(ids: string[]): void;
  /** Clear the entire selection and reset reconciliation state. */
  clear(): void;
  /**
   * Set the anchor for shift-click range selection.
   * Also calls `ensureMetadata([id])` so range-select has sort values ready.
   */
  setAnchor(id: string | null): void;
  /**
   * Fetch metadata for the given IDs (deduped against cache and in-flight
   * requests), populate `metadataCache`, then enqueue reconciliation.
   */
  ensureMetadata(ids: string[]): Promise<void>;
  /**
   * Run on mount: batch-fetch metadata for any IDs already in `selectedIds`
   * (restored from sessionStorage). Silently drops IDs that ES returns nothing
   * for. Drift toast is S3b -- not wired here yet.
   */
  hydrate(): Promise<void>;
  /**
   * (S5) Select all images in a group atomically.
   * Latent -- no DOM target wired until grouping ships.
   * Semantics identical to add(ids) but distinct for telemetry/debuggability.
   */
  addGroup(ids: string[]): void;
  /**
   * (S5) Deselect all images in a group atomically.
   * Latent -- no DOM target wired until grouping ships.
   * Semantics identical to remove(ids) but distinct for telemetry/debuggability.
   */
  removeGroup(ids: string[]): void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSelectionStore = create<SelectionState>()(
  persist(
    (set, get) => ({
      // --- Initial state ---
      selectedIds: new Set<string>(),
      anchorId: null,
      generationCounter: 0,
      reconciledView: null,
      metadataCache: new LruMap<string, Image>(SELECTION_METADATA_LRU_CAP),
      pendingFetchIds: new Set<string>(),
      dataSource: new ElasticsearchDataSource(),

      // --- Actions ---

      toggle(id: string): void {
        const { selectedIds, metadataCache, reconciledView } = get();
        const isSelected = selectedIds.has(id);

        if (isSelected) {
          // Remove
          const newIds = new Set(selectedIds);
          newIds.delete(id);

          let newView = reconciledView;
          const cachedImg = metadataCache.get(id);
          if (cachedImg !== undefined && reconciledView !== null) {
            newView = reconcileRemove(cachedImg, reconciledView, RECONCILE_FIELDS);
            if (hasDirtyFields(newView)) {
              // Schedule a full recompute on next idle frame.
              enqueueReconcile(Array.from(newIds), /* fullRecompute */ true);
            }
          }

          // Re-elect anchor if we just deselected the current anchor.
          const newAnchor =
            get().anchorId === id
              ? electFallbackAnchor(newIds)
              : undefined; // undefined = no change

          set((s) => ({
            selectedIds: newIds,
            reconciledView: newView,
            generationCounter: s.generationCounter + 1,
            ...(newAnchor !== undefined ? { anchorId: newAnchor } : {}),
          }));
        } else {
          // Add
          const newIds = new Set(selectedIds);
          newIds.add(id);

          let newView = reconciledView;
          const cachedImg = metadataCache.get(id);
          if (cachedImg !== undefined) {
            newView = reconcileAdd(cachedImg, reconciledView, RECONCILE_FIELDS);
          } else {
            // Mark all fields pending until metadata arrives.
            newView = markPending(reconciledView, RECONCILE_FIELDS);
          }

          set((s) => ({
            selectedIds: newIds,
            reconciledView: newView,
            generationCounter: s.generationCounter + 1,
          }));

          // Fetch metadata (cohesion rule: toggle MUST call ensureMetadata).
          void get()
            .ensureMetadata([id])
            .then(() => {
              // Full recompute once metadata is available.
              enqueueReconcile(Array.from(get().selectedIds), /* fullRecompute */ true);
            });
        }
      },

      add(ids: string[]): void {
        const { selectedIds, metadataCache, reconciledView } = get();
        // Deduplicate against existing selection.
        const newIds = ids.filter((id) => !selectedIds.has(id));
        if (newIds.length === 0) return;

        // Atomic add — one state update, one sessionStorage write.
        const nextIds = new Set(selectedIds);
        for (const id of newIds) nextIds.add(id);

        // Split into cached vs uncached to avoid flicker for already-cached
        // items. All-cached: fold synchronously (view immediately correct).
        // Any-uncached: mark all pending, then full recompute after fetch.
        // Note: markPending sets every field to pending which makes the
        // incremental reconcileAdd path a no-op (pending is sticky), so we
        // must use a full recompute (fullRecompute=true) after all uncached
        // metadata arrives.
        const cachedIds: string[] = [];
        const uncachedIds: string[] = [];
        for (const id of newIds) {
          if (metadataCache.has(id)) cachedIds.push(id);
          else uncachedIds.push(id);
        }

        let newView: ReconciledView | null = reconciledView;
        if (uncachedIds.length === 0) {
          // All cached: fold synchronously — no pending flicker.
          for (const id of cachedIds) {
            const img = metadataCache.get(id)!;
            newView = reconcileAdd(img, newView, RECONCILE_FIELDS);
          }
        } else {
          // Some uncached: whole view is uncertain until metadata arrives.
          newView = markPending(reconciledView, RECONCILE_FIELDS);
        }

        set((s) => ({
          selectedIds: nextIds,
          reconciledView: newView,
          generationCounter: s.generationCounter + 1,
        }));

        if (uncachedIds.length > 0) {
          void get()
            .ensureMetadata(uncachedIds)
            .then(() => {
              // Full recompute: incremental path can't work on a pending view.
              enqueueReconcile(Array.from(get().selectedIds), /* fullRecompute */ true);
            });
        }
        // All-cached path: no async work needed — view already correct.
      },

      remove(ids: string[]): void {
        const { selectedIds, metadataCache, reconciledView } = get();
        const toRemove = ids.filter((id) => selectedIds.has(id));
        if (toRemove.length === 0) return;

        const nextIds = new Set(selectedIds);
        for (const id of toRemove) nextIds.delete(id);

        let newView = reconciledView;
        let needsFullRecompute = false;
        for (const id of toRemove) {
          const img = metadataCache.get(id);
          if (img !== undefined && newView !== null) {
            newView = reconcileRemove(img, newView, RECONCILE_FIELDS);
            if (hasDirtyFields(newView)) needsFullRecompute = true;
          }
        }

        if (needsFullRecompute) {
          enqueueReconcile(Array.from(nextIds), /* fullRecompute */ true);
        }

        // Re-elect anchor if the current anchor was among the removed IDs.
        const { anchorId } = get();
        const newAnchor =
          anchorId !== null && toRemove.includes(anchorId)
            ? electFallbackAnchor(nextIds)
            : undefined; // undefined = no change

        set((s) => ({
          selectedIds: nextIds,
          reconciledView: newView,
          generationCounter: s.generationCounter + 1,
          ...(newAnchor !== undefined ? { anchorId: newAnchor } : {}),
        }));
      },

      clear(): void {
        _resetReconcileQueue();
        // Reset hydration toast dedup so a future reload with missing IDs
        // can fire the toast again (user has cleared and restarted a session).
        _hydrationToastShown = false;
        set((s) => ({
          selectedIds: new Set<string>(),
          anchorId: null,
          reconciledView: null,
          generationCounter: s.generationCounter + 1,
        }));
      },

      setAnchor(id: string | null): void {
        set({ anchorId: id });
        if (id !== null) {
          // Cohesion rule: range-select server-walk needs anchor metadata.
          void get().ensureMetadata([id]);
        }
      },

      async ensureMetadata(ids: string[]): Promise<void> {
        const { metadataCache, pendingFetchIds, dataSource } = get();
        // Deduplicate: skip IDs already cached or currently fetching.
        const needed = ids.filter(
          (id) => !metadataCache.has(id) && !pendingFetchIds.has(id),
        );
        if (needed.length === 0) return;

        // Mark as in-flight.
        set((s) => {
          const newPending = new Set(s.pendingFetchIds);
          for (const id of needed) newPending.add(id);
          return { pendingFetchIds: newPending };
        });

        let images: Image[] = [];
        try {
          images = await dataSource.getByIds(needed);
        } catch {
          // Network / ES error — silently fail; metadata stays absent.
          // Reconcile will leave affected fields as pending.
        }

        // Populate cache and clear in-flight markers.
        const { metadataCache: cache } = get();
        for (const img of images) {
          cache.set(img.id, img);
        }

        set((s) => {
          const newPending = new Set(s.pendingFetchIds);
          for (const id of needed) newPending.delete(id);
          // Touch generationCounter so selectors know cache changed.
          return { pendingFetchIds: newPending, generationCounter: s.generationCounter + 1 };
        });
      },

      async hydrate(): Promise<void> {
        const { selectedIds, dataSource } = get();
        if (selectedIds.size === 0) return;

        const ids = Array.from(selectedIds);
        let images: Image[] = [];
        try {
          images = await dataSource.getByIds(ids);
        } catch {
          return; // Leave selection intact on network error.
        }

        const fetchedIds = new Set(images.map((img) => img.id));
        const missingIds = ids.filter((id) => !fetchedIds.has(id));

        // Populate cache.
        const { metadataCache: cache } = get();
        for (const img of images) {
          cache.set(img.id, img);
        }

        if (missingIds.length > 0) {
          // Drop IDs that no longer exist in ES and notify the user once.
          const nextIds = new Set(selectedIds);
          for (const id of missingIds) nextIds.delete(id);
          set((s) => ({
            selectedIds: nextIds,
            generationCounter: s.generationCounter + 1,
          }));

          // Fire hydration drop toast (deduped — at most once per session).
          if (!_hydrationToastShown) {
            _hydrationToastShown = true;
            addToast({
              category: "information",
              message: `${missingIds.length} item${missingIds.length === 1 ? "" : "s"} from your previous selection ${
                missingIds.length === 1 ? "is" : "are"
              } no longer available.`,
            });
          }
        } else {
          set((s) => ({ generationCounter: s.generationCounter + 1 }));
        }

        // Schedule reconciliation for all retained IDs.
        const retainedIds = ids.filter((id) => !missingIds.includes(id));
        if (retainedIds.length > 0) {
          enqueueReconcile(retainedIds);
        }
      },

      addGroup(ids: string[]): void {
        // Latent (S5): no DOM target yet -- wired when grouping ships.
        // Delegates to add() for identical semantics; distinct method for
        // telemetry / future divergence.
        get().add(ids);
      },

      removeGroup(ids: string[]): void {
        // Latent (S5): no DOM target yet -- wired when grouping ships.
        // Delegates to remove() for identical semantics; distinct method for
        // telemetry / future divergence.
        get().remove(ids);
      },
    }),
    {
      name: "kupua-selection",
      storage: selectionStorage,
      partialize: (state): PersistedSelectionState => ({
        selectedIds: Array.from(state.selectedIds),
        anchorId: state.anchorId,
      }),
      merge: (persisted, current) => {
        const p = persisted as PersistedSelectionState | undefined;
        return {
          ...current,
          selectedIds: p?.selectedIds ? new Set(p.selectedIds) : new Set<string>(),
          anchorId: p?.anchorId ?? null,
        };
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return a new ReconciledView with all `reconcile` fields marked `pending`.
 * Used when adding items whose metadata hasn't been fetched yet.
 */
function markPending(
  prevView: ReconciledView | null,
  fields: FieldDefinition[],
): ReconciledView {
  const next: ReconciledView = new Map(prevView ?? undefined);
  for (const field of fields) {
    const prev = next.get(field.id);
    // Only mark as pending if currently resolvable (don't overwrite dirty).
    if (!prev || prev.kind !== "dirty") {
      next.set(field.id, { kind: "pending" } as FieldReconciliation);
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Playwright / perf test accessor
// ---------------------------------------------------------------------------

// Expose the store via window for Playwright perf tests (same pattern as
// window.__kupua_store__ for the search-store).
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__kupua_selection_store__ =
    useSelectionStore;
}
