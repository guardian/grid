/**
 * History snapshot — per-entry position data for back/forward restoration.
 *
 * Captured before each push-navigate, keyed by the *predecessor*
 * entry's kupuaKey. Consumed on popstate to restore scroll position
 * near where the user left each search context.
 *
 * Phase 2: capture infrastructure only — no consumer yet.
 *
 * See: exploration/docs/browser-history-analysis.md § "Future polish"
 *      exploration/docs/browser-history-future-polish-handoff.md
 */

import type { SortValues } from "@/dal";

// ---------------------------------------------------------------------------
// Snapshot shape
// ---------------------------------------------------------------------------

export interface HistorySnapshot {
  /** buildSearchKey fingerprint of the params at capture time. */
  searchKey: string;
  /** Anchor image ID per the anchor-priority rule (may be null). */
  anchorImageId: string | null;
  /** True when anchorImageId came from viewport anchor (phantom), not explicit focus. */
  anchorIsPhantom: boolean;
  /** ES sort cursor of the anchor image (null if extraction failed). */
  anchorCursor: SortValues | null;
  /** Global offset of the anchor at time of push. */
  anchorOffset: number;
  /**
   * Viewport-relative ratio of the anchor image at capture time.
   * Formula: (rowTop - scrollTop) / clientHeight.
   * Fed into saveSortFocusRatio on restore so Effect #9 positions the
   * image at the same fraction of the viewport, not always at top row.
   * Null when the anchor couldn't be located in the DOM at capture time.
   */
  viewportRatio: number | null;
  /**
   * The `newCountSince` timestamp at capture time — the freeze boundary
   * that separates "results the user has seen" from "new images".
   * On popstate restore, this is injected as an `until` cap on the initial
   * search so new images don't silently leak into back/forward results.
   * Null when the snapshot was captured before the first search completed.
   */
  newCountSince: string | null;
}

// ---------------------------------------------------------------------------
// Compile-time flags
// ---------------------------------------------------------------------------

/**
 * Permanent product knob — sessionStorage-backed snapshots survive reload.
 * Switch to false to debug whether a bug is storage-tier-related.
 */
export const PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD = true;

// Lenient searchKey matching was considered (EXPERIMENTAL_LENIENT_SEARCHKEY_MATCH)
// but removed — analysis showed snapshot.searchKey and URL-derived searchKey are
// structurally identical on every popstate, so the lenient branch was dead code.
// Strict matching is always sufficient.

// ---------------------------------------------------------------------------
// SnapshotStore interface
// ---------------------------------------------------------------------------

interface SnapshotStore {
  get(key: string): HistorySnapshot | undefined;
  set(key: string, snap: HistorySnapshot): void;
  delete(key: string): void;
}

// ---------------------------------------------------------------------------
// MapSnapshotStore — in-memory, LRU eviction
// ---------------------------------------------------------------------------

const LRU_CAP = 50;

export class MapSnapshotStore implements SnapshotStore {
  private _map = new Map<string, HistorySnapshot>();

  get(key: string): HistorySnapshot | undefined {
    const snap = this._map.get(key);
    if (snap !== undefined) {
      // Move to end (most-recently-used).
      this._map.delete(key);
      this._map.set(key, snap);
    }
    return snap;
  }

  set(key: string, snap: HistorySnapshot): void {
    // Delete first so re-inserts move to end.
    this._map.delete(key);
    this._map.set(key, snap);
    // Evict oldest (first entry) if over cap.
    if (this._map.size > LRU_CAP) {
      const oldest = this._map.keys().next().value;
      if (oldest !== undefined) this._map.delete(oldest);
    }
  }

  delete(key: string): void {
    this._map.delete(key);
  }

  /** Exposed for testing / dev-global inspection. */
  get size(): number {
    return this._map.size;
  }
}

// ---------------------------------------------------------------------------
// SessionStorageSnapshotStore — survives reload, per-tab scope
// ---------------------------------------------------------------------------

const SS_PREFIX = "kupua:histSnap:";

export class SessionStorageSnapshotStore implements SnapshotStore {
  /**
   * Track insertion order for LRU eviction. sessionStorage has no
   * iteration-order guarantee, so we maintain our own queue.
   */
  private _order: string[] = [];

  constructor() {
    // Rebuild order from existing sessionStorage keys on construction
    // (covers reload scenario where keys already exist).
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k?.startsWith(SS_PREFIX)) {
          this._order.push(k.slice(SS_PREFIX.length));
        }
      }
    } catch {
      // sessionStorage unavailable — degrade gracefully.
    }
  }

  get(key: string): HistorySnapshot | undefined {
    try {
      const raw = sessionStorage.getItem(SS_PREFIX + key);
      if (raw === null) return undefined;
      const parsed = JSON.parse(raw) as HistorySnapshot;
      // Move to end of LRU queue.
      this._order = this._order.filter((k) => k !== key);
      this._order.push(key);
      return parsed;
    } catch {
      // Corrupt entry — remove it.
      this.delete(key);
      return undefined;
    }
  }

  set(key: string, snap: HistorySnapshot): void {
    try {
      sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(snap));
      // Update LRU order.
      this._order = this._order.filter((k) => k !== key);
      this._order.push(key);
      // Evict oldest if over cap.
      while (this._order.length > LRU_CAP) {
        const oldest = this._order.shift();
        if (oldest) {
          try { sessionStorage.removeItem(SS_PREFIX + oldest); } catch { /* ignore */ }
        }
      }
    } catch {
      // sessionStorage full or blocked — ignore.
    }
  }

  delete(key: string): void {
    try { sessionStorage.removeItem(SS_PREFIX + key); } catch { /* ignore */ }
    this._order = this._order.filter((k) => k !== key);
  }

  /** Exposed for testing. */
  get size(): number {
    return this._order.length;
  }
}

// ---------------------------------------------------------------------------
// Singleton — selected by compile-time flag
// ---------------------------------------------------------------------------

export const snapshotStore: SnapshotStore = PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD
  ? new SessionStorageSnapshotStore()
  : new MapSnapshotStore();
