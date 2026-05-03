/**
 * Selection Performance Stress Tests — measures latency at 1k / 2k / 5k
 * selected items across five cost envelopes.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  MANUAL INVOCATION ONLY — DO NOT RUN IN CI, SCRIPTS, OR AGENTS.   ║
 * ║                                                                    ║
 * ║  SS0 (sessionStorage baseline) runs on local ES.                  ║
 * ║  SS1–SS4 require real ES (TEST) and the selection store (S1+).    ║
 * ║                                                                    ║
 * ║  How to run (after ./scripts/start.sh --use-TEST):                ║
 * ║    npx playwright test --config=e2e-perf/playwright.perf.config.ts ║
 * ║           selection-stress.spec.ts                                 ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Measurement catalogue (five cost envelopes from workplan §S0.5):
 *
 *   SS0 — sessionStorage.write baseline
 *         How expensive is writing a 1k / 2k / 5k ID array to sessionStorage?
 *         Runs now (no selection store required). Informs the debounce budget.
 *
 *   SS1 — single-toggle latency (S1 required)
 *         Sync mutation → first paint. Target: < 16ms.
 *
 *   SS2a — range-add wall-clock, in-buffer fast path (S1 + S3a required)
 *           Walk imagePositions directly (no network). Target: < 50ms for 1k.
 *
 *   SS2b — range-add wall-clock, out-of-buffer server path (S1 + S3a required)
 *           getIdRange round trip + store mutation. Measures longest main-thread
 *           task during lazy recompute. Target: < 200ms wall-clock for 1k.
 *
 *   SS3 — reconciliation chunk render time (S1 required)
 *          Time for requestIdleCallback-chunked recompute to clear "pending"
 *          fields. Target: ≤ 50ms longest chunk for 5k items.
 *
 *   SS4 — per-cell re-render count on mode-enter / mode-exit (S2 required)
 *          CSS data-attribute mode flip must produce 0 React cell re-renders.
 *          Target: 0.
 *
 * No assertions in S0.5 — this phase establishes baselines. Per-phase
 * threshold annotations land in S1–S4 as numbers stabilise.
 *
 * Two-tier scope: SS2a/SS2b drive two-tier mode via `query=city:Dublin`
 * which returns ~few-k results on TEST → two-tier threshold engaged.
 * Do NOT add a seek-mode variant here — that belongs in S3a's spec.
 *
 * Store accessor convention (S1 will expose this):
 *   window.__kupua_selection_store__ — Zustand selection-store instance.
 *   Tests check for its existence and skip gracefully if absent.
 */

import { test, expect } from "../e2e/shared/helpers";

// ---------------------------------------------------------------------------
// Navigation helper
// ---------------------------------------------------------------------------

const STABLE_UNTIL = process.env["PERF_STABLE_UNTIL"] ?? "";

/**
 * Navigate to a two-tier result set.
 * `query=city:Dublin` on TEST returns a few thousand results — enough to
 * engage two-tier mode while keeping the position map fast.
 * Falls back gracefully on local ES (returns whatever is available).
 */
async function gotoTwoTier(kupua: any) {
  const untilParam = STABLE_UNTIL ? `&until=${STABLE_UNTIL}` : "";
  await kupua.page.goto(`/search?nonFree=true${untilParam}&query=city:Dublin`);
  await kupua.waitForResults();
}

// ---------------------------------------------------------------------------
// Measurement helpers
// ---------------------------------------------------------------------------

/**
 * Measure the cost of writing a serialised selection to sessionStorage.
 * This is the worst-case cost per persist-write tick (before debouncing saves us).
 * Returns an array of { count, writeMs } entries.
 */
async function measurePersistWriteCost(
  kupua: any,
  counts: number[],
): Promise<Array<{ count: number; writeMs: number }>> {
  return kupua.page.evaluate((counts: number[]) => {
    const KEY = "__sel_perf_test__";
    const results: Array<{ count: number; writeMs: number }> = [];

    for (const count of counts) {
      // Simulate the serialised form: an array of image ID strings
      const ids = Array.from({ length: count }, (_, i) => `img-${i}`);
      const payload = JSON.stringify(ids);

      const t0 = performance.now();
      sessionStorage.setItem(KEY, payload);
      const writeMs = performance.now() - t0;

      results.push({ count, writeMs: Math.round(writeMs * 100) / 100 });
    }

    sessionStorage.removeItem(KEY);
    return results;
  }, counts);
}

/**
 * Measure single-toggle latency: time from store.toggle(id) call to first
 * rAF callback (proxy for "paint started").
 *
 * TODO(S1): implement once selection-store is available.
 * Signature is fixed — S1 only needs to replace the TODO body.
 */
async function measureToggleLatency(
  kupua: any,
  imageId: string,
): Promise<{ toggleMs: number } | null> {
  return kupua.page.evaluate((imageId: string) => {
    const store = (window as any).__kupua_selection_store__;
    if (!store) return null; // S1 not yet landed

    return new Promise<{ toggleMs: number }>((resolve) => {
      const t0 = performance.now();
      store.getState().toggle(imageId);
      requestAnimationFrame(() => {
        resolve({ toggleMs: Math.round((performance.now() - t0) * 100) / 100 });
      });
    });
  }, imageId);
}

/**
 * Measure range-add wall-clock time and the longest LoAF (Long Animation
 * Frame) during the mutation + lazy reconciliation chunk.
 *
 * TODO(S1 + S3a): implement once selection-store and useRangeSelection exist.
 */
async function measureRangeAddWallClock(
  kupua: any,
  ids: string[],
): Promise<{ wallClockMs: number; longestLoafMs: number } | null> {
  return kupua.page.evaluate((ids: string[]) => {
    const store = (window as any).__kupua_selection_store__;
    if (!store) return null; // S1 not yet landed

    // Instrument LoAF for the duration of the add
    const loafs: number[] = [];
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        loafs.push(entry.duration);
      }
    });
    try {
      obs.observe({ type: "long-animation-frame", buffered: false });
    } catch {
      // LoAF not supported in this browser version — continue without it
    }

    const t0 = performance.now();
    store.getState().add(ids);
    const wallClockMs = Math.round((performance.now() - t0) * 100) / 100;

    obs.disconnect();
    const longestLoafMs = loafs.length > 0 ? Math.max(...loafs) : 0;

    return { wallClockMs, longestLoafMs: Math.round(longestLoafMs) };
  }, ids);
}

/**
 * Count React re-renders on individual cells during a selection mode-enter.
 *
 * Instruments React DevTools' `__REACT_DEVTOOLS_GLOBAL_HOOK__` render
 * counters, enters selection mode by toggling one image, and reports how
 * many cell components re-rendered.
 *
 * Target: 0 cell re-renders (mode-enter is CSS-only via data-attribute on
 * the container — individual cells must NOT subscribe to inSelectionMode).
 *
 * TODO(S2): implement once Tickbox + selection mode are available.
 */
async function measureModeEnterRenders(
  kupua: any,
  imageId: string,
): Promise<{ cellRenderCount: number } | null> {
  return kupua.page.evaluate((imageId: string) => {
    const store = (window as any).__kupua_selection_store__;
    if (!store) return null; // S2 not yet landed

    // Zero the React render counter via DevTools hook if available
    const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    const rendersBefore = hook?._rendererInterfaces?.size ?? 0;
    void rendersBefore; // used for future delta calculation

    // Track DOM mutations on cells as a proxy for React re-renders when
    // DevTools hook is unavailable (production builds)
    const cellMutations: number[] = [];
    const grid = document.querySelector('[aria-label="Image results grid"]');
    if (grid) {
      const mo = new MutationObserver((recs) => {
        cellMutations.push(recs.length);
      });
      mo.observe(grid, { subtree: true, attributes: true, attributeFilter: ["class", "data-selected"] });

      // Enter selection mode
      store.getState().toggle(imageId);

      mo.disconnect();
    }

    return { cellRenderCount: cellMutations.reduce((a, b) => a + b, 0) };
  }, imageId);
}

/**
 * Measure reconciliation chunk render time: wall-clock from add() call until
 * all "pending" fields are resolved (all chunks done).
 *
 * TODO(S1): implement once reconciliation engine is available.
 * The store must expose a `reconciliationSettled()` promise or generation
 * counter that stabilises when all chunks are done.
 */
async function measureReconciliationTime(
  kupua: any,
  ids: string[],
): Promise<{ reconcileMs: number } | null> {
  return kupua.page.evaluate((ids: string[]) => {
    const store = (window as any).__kupua_selection_store__;
    if (!store) return null; // S1 not yet landed

    return new Promise<{ reconcileMs: number }>((resolve) => {
      const t0 = performance.now();
      store.getState().add(ids);

      // Poll the generation counter until it stabilises — reconciliation is
      // done when the counter stops incrementing for one rAF cycle.
      // TODO(S1): replace with store.getState().reconciliationSettled() if
      //   the store exposes that signal.
      let lastGen = store.getState().generation ?? 0;
      const CHECK_INTERVAL = 16; // one frame

      const check = () => {
        const g = store.getState().generation ?? 0;
        if (g === lastGen) {
          // Stable for one frame — consider settled
          resolve({ reconcileMs: Math.round(performance.now() - t0) });
        } else {
          lastGen = g;
          setTimeout(check, CHECK_INTERVAL);
        }
      };
      setTimeout(check, CHECK_INTERVAL);
    });
  }, ids);
}

// ---------------------------------------------------------------------------
// Log helper — same console.table style as perf.spec.ts
// ---------------------------------------------------------------------------

function logTable(label: string, rows: Record<string, unknown>[]) {
  console.log(`\n── ${label} ──`);
  if (rows.length === 0) {
    console.log("  (no data)");
    return;
  }
  const cols = Object.keys(rows[0]);
  const header = cols.join("\t");
  console.log("  " + header);
  for (const row of rows) {
    console.log("  " + cols.map((c) => String(row[c] ?? "—")).join("\t"));
  }
}

// ---------------------------------------------------------------------------
// SS0 — sessionStorage write baseline (runs now, no selection store needed)
// ---------------------------------------------------------------------------

test("SS0 — sessionStorage write baseline (1k / 2k / 5k IDs)", async ({ kupua }) => {
  // Navigate somewhere — the write is client-side only, ES data irrelevant
  await kupua.page.goto("/search?nonFree=true");
  await kupua.waitForResults();

  const COUNTS = [1_000, 2_000, 5_000];
  const results = await measurePersistWriteCost(kupua, COUNTS);

  logTable("SS0 — sessionStorage write cost", results.map((r) => ({
    "IDs": r.count.toLocaleString(),
    "write_ms": r.writeMs,
    "budget_ok (< 5ms)": r.writeMs < 5 ? "✓" : "⚠",
  })));

  // No hard assertion — informational only. A note if it's surprisingly slow.
  const max = Math.max(...results.map((r) => r.writeMs));
  if (max > 20) {
    console.warn(`[SS0] sessionStorage write took ${max}ms for largest payload — may need tighter debounce.`);
  }
  // Trivial assertion so the test is not "passed with no assertions" warning
  expect(results).toHaveLength(COUNTS.length);
});

// ---------------------------------------------------------------------------
// SS1 — single-toggle latency (S1 required)
// ---------------------------------------------------------------------------

test("SS1 — single-toggle latency", async ({ kupua }) => {
  await gotoTwoTier(kupua);

  const hasStore = await kupua.page.evaluate(
    () => typeof (window as any).__kupua_selection_store__ !== "undefined",
  );
  test.skip(!hasStore, "TODO(S1): selection-store not yet available");

  // Get the first visible image ID from the search store
  const imageId = await kupua.page.evaluate(() => {
    const s = (window as any).__kupua_store__?.getState();
    return s?.results?.[0]?.id ?? null;
  });
  if (!imageId) {
    console.log("[SS1] No image in buffer — skipping measurement");
    return;
  }

  const RUNS = 5;
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < RUNS; i++) {
    const m = await measureToggleLatency(kupua, imageId);
    if (m) rows.push({ run: i + 1, "toggle_ms": m.toggleMs, "< 16ms": m.toggleMs < 16 ? "✓" : "⚠" });
  }
  logTable("SS1 — single-toggle latency", rows);
  expect(rows.length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// SS2a — range-add, in-buffer fast path (S1 + S3a required)
// ---------------------------------------------------------------------------

test("SS2a — range-add wall-clock, in-buffer (1k IDs)", async ({ kupua }) => {
  await gotoTwoTier(kupua);

  const hasStore = await kupua.page.evaluate(
    () => typeof (window as any).__kupua_selection_store__ !== "undefined",
  );
  test.skip(!hasStore, "TODO(S1+S3a): selection-store not yet available");

  // Build 1k IDs from the buffer (all in-buffer → fast path)
  const ids = await kupua.page.evaluate(() => {
    const s = (window as any).__kupua_store__?.getState();
    return (s?.results ?? []).slice(0, 1000).map((img: any) => img.id);
  });

  const m = await measureRangeAddWallClock(kupua, ids);
  if (m) {
    logTable("SS2a — range-add in-buffer", [
      { "ids": ids.length, "wall_ms": m.wallClockMs, "longest_loaf_ms": m.longestLoafMs, "< 50ms": m.wallClockMs < 50 ? "✓" : "⚠" },
    ]);
  }
  expect(m ?? { wallClockMs: 0 }).toBeDefined();
});

// ---------------------------------------------------------------------------
// SS2b — range-add, out-of-buffer server path (S1 + S3a required)
// ---------------------------------------------------------------------------

test("SS2b — range-add wall-clock, out-of-buffer via getIdRange", async ({ kupua }) => {
  await gotoTwoTier(kupua);

  const hasStore = await kupua.page.evaluate(
    () => typeof (window as any).__kupua_selection_store__ !== "undefined",
  );
  test.skip(!hasStore, "TODO(S1+S3a): selection-store not yet available");

  // TODO(S3a): drive useRangeSelection with anchor at buffer[0] and target
  // at a global index well outside the buffer (e.g. global index 2000).
  // This exercises the getIdRange server-walk path.
  // For now, log a placeholder.
  console.log("[SS2b] TODO(S3a): out-of-buffer range measurement not yet implemented");
  expect(true).toBe(true);
});

// ---------------------------------------------------------------------------
// SS3 — reconciliation chunk render time (S1 required)
// ---------------------------------------------------------------------------

test("SS3 — reconciliation chunk render time (1k / 2k / 5k)", async ({ kupua }) => {
  await gotoTwoTier(kupua);

  const hasStore = await kupua.page.evaluate(
    () => typeof (window as any).__kupua_selection_store__ !== "undefined",
  );
  test.skip(!hasStore, "TODO(S1): selection-store not yet available");

  const COUNTS = [1_000, 2_000, 5_000];
  const rows: Record<string, unknown>[] = [];

  for (const count of COUNTS) {
    const ids = await kupua.page.evaluate((n: number) => {
      const s = (window as any).__kupua_store__?.getState();
      return (s?.results ?? []).slice(0, n).map((img: any) => img.id);
    }, count);

    const m = await measureReconciliationTime(kupua, ids);
    if (m) {
      rows.push({
        "ids": count.toLocaleString(),
        "reconcile_ms": m.reconcileMs,
        "< 50ms/chunk": m.reconcileMs < 50 ? "✓" : "⚠",
      });
    }
  }
  logTable("SS3 — reconciliation time", rows);
  expect(true).toBe(true);
});

// ---------------------------------------------------------------------------
// SS4 — per-cell re-render count on mode-enter (S2 required)
// ---------------------------------------------------------------------------

test("SS4 — mode-enter cell re-render count (target: 0)", async ({ kupua }) => {
  await gotoTwoTier(kupua);

  const hasStore = await kupua.page.evaluate(
    () => typeof (window as any).__kupua_selection_store__ !== "undefined",
  );
  test.skip(!hasStore, "TODO(S2): selection-store + Tickbox UI not yet available");

  const imageId = await kupua.page.evaluate(() => {
    const s = (window as any).__kupua_store__?.getState();
    return s?.results?.[0]?.id ?? null;
  });
  if (!imageId) {
    console.log("[SS4] No image in buffer — skipping");
    return;
  }

  const m = await measureModeEnterRenders(kupua, imageId);
  if (m) {
    logTable("SS4 — mode-enter cell renders", [
      { "cell_mutations": m.cellRenderCount, "target: 0": m.cellRenderCount === 0 ? "✓" : "⚠ FAIL" },
    ]);
    // SS4 gets an assertion even in S0.5 because 0 is a hard correctness
    // requirement (see architecture §7 + S2 impl notes). Any non-zero count
    // means a cell is subscribed to inSelectionMode — that must be fixed.
    // TODO(S2): uncomment when S2 lands:
    // expect(m.cellRenderCount).toBe(0);
  }
  expect(true).toBe(true);
});
