import { describe, it, expect, beforeEach } from "vitest";
import { MapSnapshotStore, SessionStorageSnapshotStore } from "./history-snapshot";
import type { HistorySnapshot } from "./history-snapshot";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeSnap(overrides?: Partial<HistorySnapshot>): HistorySnapshot {
  return {
    searchKey: '["nonFree","true"]',
    anchorImageId: "img-001",
    anchorIsPhantom: false,
    anchorCursor: ["2026-03-20T14:30:00.000Z", "img-001"],
    anchorOffset: 42,
    viewportRatio: 0.35,
    ...overrides,
  };
}

// ===========================================================================
// MapSnapshotStore
// ===========================================================================

describe("MapSnapshotStore", () => {
  let store: MapSnapshotStore;

  beforeEach(() => {
    store = new MapSnapshotStore();
  });

  it("get returns undefined for unknown key", () => {
    expect(store.get("missing")).toBeUndefined();
  });

  it("set then get returns the snapshot", () => {
    const snap = makeSnap();
    store.set("key-1", snap);
    expect(store.get("key-1")).toEqual(snap);
  });

  it("delete removes the entry", () => {
    store.set("key-1", makeSnap());
    store.delete("key-1");
    expect(store.get("key-1")).toBeUndefined();
  });

  it("overwrites an existing entry", () => {
    store.set("key-1", makeSnap({ anchorOffset: 10 }));
    store.set("key-1", makeSnap({ anchorOffset: 99 }));
    expect(store.get("key-1")?.anchorOffset).toBe(99);
    expect(store.size).toBe(1);
  });

  it("evicts the oldest entry when over LRU cap", () => {
    // Fill to capacity + 1
    for (let i = 0; i <= 50; i++) {
      store.set(`key-${i}`, makeSnap({ anchorOffset: i }));
    }
    // key-0 should have been evicted (it was the oldest)
    expect(store.get("key-0")).toBeUndefined();
    // key-1 should still exist
    expect(store.get("key-1")).toBeDefined();
    expect(store.size).toBe(50);
  });

  it("get promotes entry to most-recently-used", () => {
    // Fill to capacity
    for (let i = 0; i < 50; i++) {
      store.set(`key-${i}`, makeSnap({ anchorOffset: i }));
    }
    // Touch key-0 (the oldest) to promote it
    store.get("key-0");
    // Add one more — should evict key-1 (now the oldest), not key-0
    store.set("key-new", makeSnap());
    expect(store.get("key-0")).toBeDefined();
    expect(store.get("key-1")).toBeUndefined();
  });
});

// ===========================================================================
// SessionStorageSnapshotStore
// ===========================================================================

describe("SessionStorageSnapshotStore", () => {
  let store: SessionStorageSnapshotStore;

  beforeEach(() => {
    sessionStorage.clear();
    store = new SessionStorageSnapshotStore();
  });

  it("get returns undefined for unknown key", () => {
    expect(store.get("missing")).toBeUndefined();
  });

  it("set then get round-trips through JSON", () => {
    const snap = makeSnap();
    store.set("key-1", snap);
    const retrieved = store.get("key-1");
    expect(retrieved).toEqual(snap);
  });

  it("delete removes the entry", () => {
    store.set("key-1", makeSnap());
    store.delete("key-1");
    expect(store.get("key-1")).toBeUndefined();
    expect(sessionStorage.getItem("kupua:histSnap:key-1")).toBeNull();
  });

  it("handles corrupt JSON gracefully", () => {
    sessionStorage.setItem("kupua:histSnap:corrupt", "not-json{{{");
    store = new SessionStorageSnapshotStore(); // rebuild order
    expect(store.get("corrupt")).toBeUndefined();
    // Entry should have been cleaned up
    expect(sessionStorage.getItem("kupua:histSnap:corrupt")).toBeNull();
  });

  it("evicts oldest entry when over LRU cap", () => {
    for (let i = 0; i <= 50; i++) {
      store.set(`key-${i}`, makeSnap({ anchorOffset: i }));
    }
    expect(store.get("key-0")).toBeUndefined();
    expect(sessionStorage.getItem("kupua:histSnap:key-0")).toBeNull();
    expect(store.get("key-1")).toBeDefined();
    expect(store.size).toBe(50);
  });

  it("reconstructs order from existing sessionStorage on construction", () => {
    // Pre-populate sessionStorage
    sessionStorage.setItem(
      "kupua:histSnap:existing-key",
      JSON.stringify(makeSnap()),
    );
    // Create a new store instance — should find the existing entry
    const newStore = new SessionStorageSnapshotStore();
    expect(newStore.get("existing-key")).toBeDefined();
    expect(newStore.size).toBe(1);
  });
});
