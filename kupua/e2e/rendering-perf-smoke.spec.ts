/**
 * Rendering Performance Smoke Tests — real ES cluster diagnostics.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  MANUAL INVOCATION ONLY — DO NOT RUN IN CI, SCRIPTS, OR AGENTS.   ║
 * ║                                                                    ║
 * ║  Same rules as manual-smoke-test.spec.ts. Human-only.             ║
 * ║                                                                    ║
 * ║  How to run:                                                       ║
 * ║    Terminal 1: ./scripts/start.sh --use-TEST                       ║
 * ║    Terminal 2: npx playwright test --config playwright.smoke.config.ts \  ║
 * ║                e2e/rendering-perf-smoke.spec.ts                    ║
 * ║            or: node scripts/run-smoke.mjs (if registered there)    ║
 * ║                                                                    ║
 * ║  All tests auto-skip if total < 100k (local ES).                  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * These tests instrument the browser with:
 *   - PerformanceObserver for layout-shift (CLS) entries
 *   - PerformanceObserver for long-animation-frame (LoAF) entries
 *   - requestAnimationFrame jank detector (frame drops)
 *   - MutationObserver for DOM churn rate
 *   - Forced reflow detection via monkeypatching offsetHeight/getBoundingClientRect
 *
 * Each scenario runs a user workflow (scroll, seek, density switch, panel
 * toggle, sort change) and dumps a detailed performance report to the
 * console for the human + agent to analyse.
 */

import { test, expect, KupuaHelpers } from "./helpers";

// ---------------------------------------------------------------------------
// Guard: skip all tests if not connected to a real cluster
// ---------------------------------------------------------------------------

async function requireRealData(kupua: KupuaHelpers): Promise<number> {
  const store = await kupua.getStoreState();
  if (store.total < 100_000) {
    test.skip(true, `Skipping: connected to local ES (total=${store.total}). These tests require --use-TEST.`);
  }
  return store.total;
}

// ---------------------------------------------------------------------------
// Performance instrumentation — injected into the browser context
// ---------------------------------------------------------------------------

/**
 * Inject all performance observers into the page. Call once after navigation.
 * Returns a handle to read accumulated metrics.
 */
async function injectPerfProbes(kupua: KupuaHelpers) {
  await kupua.page.evaluate(() => {
    // ── Layout Shift (CLS) ──────────────────────────────────────────
    const layoutShifts: Array<{
      value: number;
      hadRecentInput: boolean;
      sources: Array<{ tagName: string; id: string; className: string; rect: string }>;
      time: number;
    }> = [];

    try {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const lsEntry = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
            sources?: Array<{ node?: Node; currentRect: DOMRectReadOnly; previousRect: DOMRectReadOnly }>;
          };
          const sources = (lsEntry.sources ?? []).map((s) => {
            const el = s.node as Element | null;
            return {
              tagName: el?.tagName ?? "?",
              id: el?.id ?? "",
              className: (el?.className ?? "").toString().slice(0, 80),
              rect: `${Math.round(s.currentRect.x)},${Math.round(s.currentRect.y)} ${Math.round(s.currentRect.width)}x${Math.round(s.currentRect.height)}`,
            };
          });
          layoutShifts.push({
            value: lsEntry.value,
            hadRecentInput: lsEntry.hadRecentInput,
            sources,
            time: lsEntry.startTime,
          });
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch { /* layout-shift not supported in this browser */ }

    // ── Long Animation Frames (LoAF) ───────────────────────────────
    const longFrames: Array<{
      duration: number;
      blockingDuration: number;
      startTime: number;
      scripts: Array<{ invoker: string; duration: number; sourceURL: string }>;
    }> = [];

    try {
      const loafObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const loaf = entry as PerformanceEntry & {
            blockingDuration: number;
            scripts?: Array<{
              invoker: string;
              duration: number;
              sourceURL: string;
            }>;
          };
          longFrames.push({
            duration: loaf.duration,
            blockingDuration: loaf.blockingDuration,
            startTime: loaf.startTime,
            scripts: (loaf.scripts ?? []).map((s) => ({
              invoker: s.invoker,
              duration: s.duration,
              sourceURL: (s.sourceURL ?? "").split("/").pop() ?? "",
            })),
          });
        }
      });
      loafObserver.observe({ type: "long-animation-frame", buffered: true });
    } catch { /* LoAF not supported — Chrome 123+ only */ }

    // ── Frame timing (rAF jank detector) ────────────────────────────
    const frameTimes: number[] = [];
    let _rafRunning = true;
    let _lastFrameTime = performance.now();

    function rafLoop(now: number) {
      if (!_rafRunning) return;
      const delta = now - _lastFrameTime;
      frameTimes.push(delta);
      _lastFrameTime = now;
      requestAnimationFrame(rafLoop);
    }
    requestAnimationFrame(rafLoop);

    // ── DOM mutation counter ────────────────────────────────────────
    const mutationStats = {
      additions: 0,
      removals: 0,
      attributeChanges: 0,
      textChanges: 0,
      bursts: [] as Array<{ time: number; adds: number; removes: number; attrs: number }>,
    };
    let _burstAdds = 0, _burstRemoves = 0, _burstAttrs = 0;
    let _burstTimer: number | null = null;

    const mutObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          mutationStats.additions += m.addedNodes.length;
          mutationStats.removals += m.removedNodes.length;
          _burstAdds += m.addedNodes.length;
          _burstRemoves += m.removedNodes.length;
        } else if (m.type === "attributes") {
          mutationStats.attributeChanges++;
          _burstAttrs++;
        } else if (m.type === "characterData") {
          mutationStats.textChanges++;
        }
      }
      // Flush burst after 50ms of quiet
      if (_burstTimer !== null) clearTimeout(_burstTimer);
      _burstTimer = window.setTimeout(() => {
        if (_burstAdds > 0 || _burstRemoves > 0 || _burstAttrs > 0) {
          mutationStats.bursts.push({
            time: performance.now(),
            adds: _burstAdds,
            removes: _burstRemoves,
            attrs: _burstAttrs,
          });
        }
        _burstAdds = 0;
        _burstRemoves = 0;
        _burstAttrs = 0;
        _burstTimer = null;
      }, 50);
    });
    mutObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    // ── Paint entry counter ─────────────────────────────────────────
    const paintEntries: Array<{ name: string; startTime: number }> = [];
    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          paintEntries.push({ name: entry.name, startTime: entry.startTime });
        }
      });
      paintObserver.observe({ type: "paint", buffered: true });
    } catch { /* paint entries not always available */ }

    // ── Expose on window for later extraction ───────────────────────
    (window as any).__perfProbes = {
      layoutShifts,
      longFrames,
      frameTimes,
      mutationStats,
      paintEntries,
      stop: () => { _rafRunning = false; mutObserver.disconnect(); },
    };
  });
}

// ---------------------------------------------------------------------------
// Metric extraction + reporting
// ---------------------------------------------------------------------------

interface PerfSnapshot {
  cls: { total: number; maxSingle: number; unexpectedShifts: number; shiftDetails: any[] };
  loaf: { count: number; totalBlockingMs: number; worst: any };
  jank: { frameCount: number; droppedFrames: number; jankyFrames16ms: number; jankyFrames33ms: number; jankyFrames50ms: number; maxFrameMs: number; p95FrameMs: number; avgFrameMs: number };
  dom: { additions: number; removals: number; attributeChanges: number; totalChurn: number; bursts: any[] };
  paints: { count: number };
}

async function collectPerfSnapshot(kupua: KupuaHelpers, _label?: string): Promise<PerfSnapshot> {
  const snapshot = await kupua.page.evaluate(() => {
    const p = (window as any).__perfProbes;
    if (!p) return null;

    // CLS
    const unexpectedShifts = p.layoutShifts.filter((s: any) => !s.hadRecentInput);
    const clsTotal = unexpectedShifts.reduce((sum: number, s: any) => sum + s.value, 0);
    const clsMax = unexpectedShifts.length > 0
      ? Math.max(...unexpectedShifts.map((s: any) => s.value))
      : 0;

    // LoAF
    const totalBlocking = p.longFrames.reduce((sum: number, f: any) => sum + f.blockingDuration, 0);
    const worstLoaf = p.longFrames.length > 0
      ? p.longFrames.reduce((w: any, f: any) => f.duration > w.duration ? f : w)
      : null;

    // Frame timing
    const ft = p.frameTimes as number[];
    const sorted = [...ft].sort((a, b) => a - b);
    const p95Idx = Math.floor(sorted.length * 0.95);
    const avgFrame = ft.length > 0 ? ft.reduce((s: number, v: number) => s + v, 0) / ft.length : 0;

    return {
      cls: {
        total: clsTotal,
        maxSingle: clsMax,
        unexpectedShifts: unexpectedShifts.length,
        shiftDetails: unexpectedShifts.slice(0, 10), // cap for console
      },
      loaf: {
        count: p.longFrames.length,
        totalBlockingMs: totalBlocking,
        worst: worstLoaf,
      },
      jank: {
        frameCount: ft.length,
        droppedFrames: ft.filter((t: number) => t > 16.67).length,
        jankyFrames16ms: ft.filter((t: number) => t > 16.67).length,
        jankyFrames33ms: ft.filter((t: number) => t > 33.34).length,
        jankyFrames50ms: ft.filter((t: number) => t > 50).length,
        maxFrameMs: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
        p95FrameMs: sorted.length > 0 ? sorted[p95Idx] : 0,
        avgFrameMs: avgFrame,
      },
      dom: {
        additions: p.mutationStats.additions,
        removals: p.mutationStats.removals,
        attributeChanges: p.mutationStats.attributeChanges,
        totalChurn: p.mutationStats.additions + p.mutationStats.removals + p.mutationStats.attributeChanges,
        bursts: p.mutationStats.bursts.slice(-20), // last 20 bursts
      },
      paints: {
        count: p.paintEntries.length,
      },
    };
  });

  if (!snapshot) throw new Error("Perf probes not installed");
  return snapshot as PerfSnapshot;
}

function logPerfReport(label: string, snap: PerfSnapshot) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  PERF REPORT: ${label}`);
  console.log(`${"═".repeat(70)}`);

  // CLS
  console.log(`\n  ── Layout Shifts (CLS) ──`);
  console.log(`  Total CLS:             ${snap.cls.total.toFixed(4)} ${snap.cls.total > 0.1 ? "⚠️  POOR" : snap.cls.total > 0.05 ? "🟡 NEEDS WORK" : "✅ GOOD"}`);
  console.log(`  Max single shift:      ${snap.cls.maxSingle.toFixed(4)}`);
  console.log(`  Unexpected shifts:     ${snap.cls.unexpectedShifts}`);
  if (snap.cls.shiftDetails.length > 0) {
    console.log(`  Worst shifts:`);
    const sorted = [...snap.cls.shiftDetails].sort((a, b) => b.value - a.value);
    for (const s of sorted.slice(0, 5)) {
      console.log(`    value=${s.value.toFixed(4)} t=${Math.round(s.time)}ms sources=[${s.sources.map((src: any) => `${src.tagName}#${src.id}.${src.className.slice(0, 30)}`).join(", ")}]`);
    }
  }

  // Long frames
  console.log(`\n  ── Long Animation Frames ──`);
  console.log(`  Count:                 ${snap.loaf.count}`);
  console.log(`  Total blocking:        ${snap.loaf.totalBlockingMs.toFixed(0)}ms`);
  if (snap.loaf.worst) {
    console.log(`  Worst:                 ${snap.loaf.worst.duration.toFixed(0)}ms (blocking: ${snap.loaf.worst.blockingDuration.toFixed(0)}ms)`);
    if (snap.loaf.worst.scripts?.length > 0) {
      console.log(`    Scripts:`);
      for (const s of snap.loaf.worst.scripts.slice(0, 3)) {
        console.log(`      ${s.invoker} (${s.duration.toFixed(0)}ms) ${s.sourceURL}`);
      }
    }
  }

  // Frame jank
  console.log(`\n  ── Frame Timing ──`);
  console.log(`  Total frames:          ${snap.jank.frameCount}`);
  console.log(`  Avg frame:             ${snap.jank.avgFrameMs.toFixed(1)}ms`);
  console.log(`  P95 frame:             ${snap.jank.p95FrameMs.toFixed(1)}ms`);
  console.log(`  Max frame:             ${snap.jank.maxFrameMs.toFixed(1)}ms ${snap.jank.maxFrameMs > 100 ? "⚠️  SEVERE JANK" : snap.jank.maxFrameMs > 50 ? "🟡 JANK" : "✅ SMOOTH"}`);
  console.log(`  Dropped (>16.67ms):    ${snap.jank.jankyFrames16ms} (${snap.jank.frameCount > 0 ? ((snap.jank.jankyFrames16ms / snap.jank.frameCount) * 100).toFixed(1) : 0}%)`);
  console.log(`  Janky (>33ms):         ${snap.jank.jankyFrames33ms}`);
  console.log(`  Severe (>50ms):        ${snap.jank.jankyFrames50ms}`);

  // DOM churn
  console.log(`\n  ── DOM Mutations ──`);
  console.log(`  Additions:             ${snap.dom.additions}`);
  console.log(`  Removals:              ${snap.dom.removals}`);
  console.log(`  Attribute changes:     ${snap.dom.attributeChanges}`);
  console.log(`  Total churn:           ${snap.dom.totalChurn}`);
  if (snap.dom.bursts.length > 0) {
    console.log(`  Top 5 bursts:`);
    const sortedBursts = [...snap.dom.bursts].sort((a, b) => (b.adds + b.removes + b.attrs) - (a.adds + a.removes + a.attrs));
    for (const b of sortedBursts.slice(0, 5)) {
      console.log(`    t=${Math.round(b.time)}ms adds=${b.adds} removes=${b.removes} attrs=${b.attrs}`);
    }
  }

  // Paints
  console.log(`\n  ── Paint entries:      ${snap.paints.count}`);
  console.log(`${"═".repeat(70)}\n`);
}

/**
 * Reset the accumulated metrics for a fresh measurement window.
 */
async function resetPerfProbes(kupua: KupuaHelpers) {
  await kupua.page.evaluate(() => {
    const p = (window as any).__perfProbes;
    if (!p) return;
    p.layoutShifts.length = 0;
    p.longFrames.length = 0;
    p.frameTimes.length = 0;
    p.mutationStats.additions = 0;
    p.mutationStats.removals = 0;
    p.mutationStats.attributeChanges = 0;
    p.mutationStats.textChanges = 0;
    p.mutationStats.bursts.length = 0;
    p.paintEntries.length = 0;
  });
}

// ---------------------------------------------------------------------------
// Smoke tests
// ---------------------------------------------------------------------------

test.describe("Rendering Performance Smoke", () => {
  test.describe.configure({ timeout: 180_000 });

  test.afterEach(async ({ kupua }) => {
    // Stop probes to prevent rAF leak
    await kupua.page.evaluate(() => {
      (window as any).__perfProbes?.stop();
    });
  });

  // ─── P1: Initial load + settle ─────────────────────────────────────
  test("P1: initial load — CLS and frame jank during first render", async ({ kupua }) => {
    await kupua.page.goto("/search?nonFree=true");
    await injectPerfProbes(kupua);
    await kupua.waitForResults();
    // Let the page fully settle (images load, scrubber appears, etc.)
    await kupua.page.waitForTimeout(3000);

    const total = await requireRealData(kupua);
    console.log(`  [P1] total=${total}`);

    const snap = await collectPerfSnapshot(kupua, "P1: Initial Load");
    logPerfReport("P1: Initial Load", snap);

    // CLS should be near zero on initial load
    expect(snap.cls.total).toBeLessThan(0.25); // generous for first load
  });

  // ─── P2: Mousewheel scroll ────────────────────────────────────────
  test("P2: mousewheel scroll — jank, CLS, DOM churn during fast scroll", async ({ kupua }) => {
    await kupua.goto();
    await requireRealData(kupua);

    await injectPerfProbes(kupua);
    // Let probes stabilize
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    // Fast mousewheel scroll (simulates real user scrolling aggressively)
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    expect(gridBox).not.toBeNull();

    await kupua.page.mouse.move(
      gridBox!.x + gridBox!.width / 2,
      gridBox!.y + gridBox!.height / 2,
    );

    console.log(`  [P2] Starting fast scroll (30 wheel events)...`);
    for (let i = 0; i < 30; i++) {
      await kupua.page.mouse.wheel(0, 800);
      await kupua.page.waitForTimeout(50); // ~20fps scroll pace
    }
    // Let extends/evictions settle
    await kupua.page.waitForTimeout(2000);

    const snap = await collectPerfSnapshot(kupua, "P2: Fast Scroll");
    logPerfReport("P2: Mousewheel Fast Scroll", snap);

    // Scroll should NOT produce layout shifts — content is absolutely positioned
    expect(snap.cls.total).toBeLessThan(0.1);
  });

  // ─── P3: Scrubber seek ────────────────────────────────────────────
  test("P3: scrubber seek to 50% — reflow and instability during buffer replacement", async ({ kupua }) => {
    await kupua.goto();
    await requireRealData(kupua);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    console.log(`  [P3] Seeking to 50%...`);
    const seekStart = Date.now();
    await kupua.seekTo(0.5, 30_000);
    const seekMs = Date.now() - seekStart;
    console.log(`  [P3] Seek completed in ${seekMs}ms`);

    // Wait for thumbnails to fully load and reflow to settle (4s)
    await kupua.page.waitForTimeout(4000);

    const snap = await collectPerfSnapshot(kupua, "P3: Seek to 50%");
    logPerfReport("P3: Scrubber Seek to 50%", snap);

    const store = await kupua.getStoreState();
    console.log(`  [P3] Post-seek: offset=${store.bufferOffset}, len=${store.resultsLength}`);
  });

  // ─── P4: Density switch (grid → table → grid) ────────────────────
  test("P4: density switch — CLS and DOM churn during grid↔table", async ({ kupua }) => {
    await kupua.goto();
    await requireRealData(kupua);

    // Focus an image so we test the "Never Lost" path
    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    console.log(`  [P4] Focused: ${focusedId}`);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    // Grid → Table
    console.log(`  [P4] Switching to table...`);
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(1000);

    const snapToTable = await collectPerfSnapshot(kupua, "P4a: Grid→Table");
    logPerfReport("P4a: Grid → Table", snapToTable);

    await resetPerfProbes(kupua);

    // Table → Grid
    console.log(`  [P4] Switching back to grid...`);
    await kupua.switchToGrid();
    await kupua.page.waitForTimeout(1000);

    const snapToGrid = await collectPerfSnapshot(kupua, "P4b: Table→Grid");
    logPerfReport("P4b: Table → Grid", snapToGrid);

    // Focus should survive both switches
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
  });

  // ─── P5: Panel toggle — layout reflow ─────────────────────────────
  test("P5: panel toggle — CLS during left/right panel open/close", async ({ kupua }) => {
    await kupua.goto();
    await requireRealData(kupua);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    // Open left panel (Alt+[)
    console.log(`  [P5] Opening left panel...`);
    await kupua.page.keyboard.press("Alt+[");
    await kupua.page.waitForTimeout(800);

    const snapLeft = await collectPerfSnapshot(kupua, "P5a: Left panel open");
    logPerfReport("P5a: Left Panel Open", snapLeft);
    await resetPerfProbes(kupua);

    // Open right panel (Alt+])
    console.log(`  [P5] Opening right panel...`);
    await kupua.page.keyboard.press("Alt+]");
    await kupua.page.waitForTimeout(800);

    const snapRight = await collectPerfSnapshot(kupua, "P5b: Right panel open");
    logPerfReport("P5b: Right Panel Open", snapRight);
    await resetPerfProbes(kupua);

    // Close both — the scroll anchoring should prevent CLS
    console.log(`  [P5] Closing both panels...`);
    await kupua.page.keyboard.press("Alt+[");
    await kupua.page.waitForTimeout(300);
    await kupua.page.keyboard.press("Alt+]");
    await kupua.page.waitForTimeout(800);

    const snapClose = await collectPerfSnapshot(kupua, "P5c: Both panels closed");
    logPerfReport("P5c: Both Panels Closed", snapClose);
  });

  // ─── P6: Sort change with focus — "Never Lost" path ───────────────
  test("P6: sort change — CLS and jank during sort-around-focus", async ({ kupua }) => {
    await kupua.goto();
    await requireRealData(kupua);

    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    console.log(`  [P6] Focused: ${focusedId}`);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    // Toggle sort direction — triggers sort-around-focus
    console.log(`  [P6] Toggling sort direction (sort-around-focus)...`);
    await kupua.toggleSortDirection();
    // Sort-around-focus can take several seconds on 1M+ docs
    await kupua.page.waitForTimeout(5000);

    const snap = await collectPerfSnapshot(kupua, "P6: Sort Direction Toggle");
    logPerfReport("P6: Sort Direction Toggle (Never Lost)", snap);

    const store = await kupua.getStoreState();
    console.log(`  [P6] Post-sort: focused=${store.focusedImageId}, offset=${store.bufferOffset}`);
    console.log(`  [P6] Focus preserved: ${store.focusedImageId === focusedId}`);
  });

  // ─── P7: Scrubber drag — continuous DOM writes ────────────────────
  test("P7: scrubber drag — frame rate during continuous thumb tracking", async ({ kupua }) => {
    await kupua.goto();
    await requireRealData(kupua);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    const trackBox = await kupua.scrubber.boundingBox();
    expect(trackBox).not.toBeNull();
    const thumbBox = await kupua.scrubberThumb.boundingBox();
    expect(thumbBox).not.toBeNull();

    const startX = thumbBox!.x + thumbBox!.width / 2;
    const startY = thumbBox!.y + thumbBox!.height / 2;

    console.log(`  [P7] Starting scrubber drag...`);
    await kupua.page.mouse.move(startX, startY);
    await kupua.page.mouse.down();

    // Drag slowly from top to bottom
    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      const y = trackBox!.y + (trackBox!.height * i) / steps;
      await kupua.page.mouse.move(startX, y);
      await kupua.page.waitForTimeout(30); // ~33fps drag pace
    }
    await kupua.page.mouse.up();
    // Wait for seek after drag-release
    await kupua.page.waitForTimeout(3000);

    const snap = await collectPerfSnapshot(kupua, "P7: Scrubber Drag");
    logPerfReport("P7: Scrubber Drag (top → bottom)", snap);

    // During drag, CLS should be zero (only tooltip moves, via direct DOM writes)
    expect(snap.cls.total).toBeLessThan(0.05);
  });

  // ─── P8: Table view scroll with extend/evict ──────────────────────
  test("P8: table scroll — jank during extend + evict cycles", async ({ kupua }) => {
    await kupua.goto();
    await requireRealData(kupua);

    await kupua.switchToTable();
    await kupua.page.waitForTimeout(500);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    const tableEl = kupua.page.locator('[aria-label="Image results table"]');
    const tableBox = await tableEl.boundingBox();
    expect(tableBox).not.toBeNull();

    await kupua.page.mouse.move(
      tableBox!.x + tableBox!.width / 2,
      tableBox!.y + tableBox!.height / 2,
    );

    console.log(`  [P8] Fast table scroll (40 wheel events)...`);
    for (let i = 0; i < 40; i++) {
      await kupua.page.mouse.wheel(0, 1500);
      await kupua.page.waitForTimeout(60);
    }
    // Let extends/evictions settle
    await kupua.page.waitForTimeout(3000);

    const snap = await collectPerfSnapshot(kupua, "P8: Table Fast Scroll");
    logPerfReport("P8: Table Fast Scroll with Extend/Evict", snap);

    const store = await kupua.getStoreState();
    console.log(`  [P8] Post-scroll: offset=${store.bufferOffset}, len=${store.resultsLength}`);
  });

  // ─── P9: Sort change (field change) ───────────────────────────────
  test("P9: sort field change — CLS during full result set replacement", async ({ kupua }) => {
    await kupua.goto();
    await requireRealData(kupua);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    console.log(`  [P9] Changing sort to Credit...`);
    await kupua.selectSort("Credit");
    await kupua.page.waitForTimeout(2000);

    const snap = await collectPerfSnapshot(kupua, "P9: Sort Change to Credit");
    logPerfReport("P9: Sort Field Change (date → Credit)", snap);
  });

  // ─── P10: Comprehensive workflow ──────────────────────────────────
  test("P10: full workflow — load, scroll, seek, switch, panel, sort", async ({ kupua }) => {
    await kupua.page.goto("/search?nonFree=true");
    await injectPerfProbes(kupua);
    await kupua.waitForResults();
    await requireRealData(kupua);

    // Phase 1: settle
    await kupua.page.waitForTimeout(2000);
    const snapLoad = await collectPerfSnapshot(kupua, "P10-load");
    logPerfReport("P10 Phase 1: Load", snapLoad);
    await resetPerfProbes(kupua);

    // Phase 2: scroll
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    await kupua.page.mouse.move(gridBox!.x + 200, gridBox!.y + 200);
    for (let i = 0; i < 15; i++) {
      await kupua.page.mouse.wheel(0, 600);
      await kupua.page.waitForTimeout(80);
    }
    await kupua.page.waitForTimeout(1500);
    const snapScroll = await collectPerfSnapshot(kupua, "P10-scroll");
    logPerfReport("P10 Phase 2: Scroll", snapScroll);
    await resetPerfProbes(kupua);

    // Phase 3: seek
    await kupua.seekTo(0.3, 30_000);
    await kupua.page.waitForTimeout(1500);
    const snapSeek = await collectPerfSnapshot(kupua, "P10-seek");
    logPerfReport("P10 Phase 3: Seek to 30%", snapSeek);
    await resetPerfProbes(kupua);

    // Phase 4: focus + density switch
    await kupua.focusNthItem(3);
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(1000);
    const snapDensity = await collectPerfSnapshot(kupua, "P10-density");
    logPerfReport("P10 Phase 4: Focus + Grid→Table", snapDensity);
    await resetPerfProbes(kupua);

    // Phase 5: sort change with focus
    await kupua.toggleSortDirection();
    await kupua.page.waitForTimeout(4000);
    const snapSort = await collectPerfSnapshot(kupua, "P10-sort");
    logPerfReport("P10 Phase 5: Sort Toggle (Never Lost)", snapSort);

    // Summary
    console.log(`\n${"═".repeat(70)}`);
    console.log("  P10 SUMMARY");
    console.log(`${"═".repeat(70)}`);
    console.log(`  Load  CLS: ${snapLoad.cls.total.toFixed(4)}, max-frame: ${snapLoad.jank.maxFrameMs.toFixed(0)}ms, DOM churn: ${snapLoad.dom.totalChurn}`);
    console.log(`  Scroll CLS: ${snapScroll.cls.total.toFixed(4)}, max-frame: ${snapScroll.jank.maxFrameMs.toFixed(0)}ms, DOM churn: ${snapScroll.dom.totalChurn}`);
    console.log(`  Seek   CLS: ${snapSeek.cls.total.toFixed(4)}, max-frame: ${snapSeek.jank.maxFrameMs.toFixed(0)}ms, DOM churn: ${snapSeek.dom.totalChurn}`);
    console.log(`  Switch CLS: ${snapDensity.cls.total.toFixed(4)}, max-frame: ${snapDensity.jank.maxFrameMs.toFixed(0)}ms, DOM churn: ${snapDensity.dom.totalChurn}`);
    console.log(`  Sort   CLS: ${snapSort.cls.total.toFixed(4)}, max-frame: ${snapSort.jank.maxFrameMs.toFixed(0)}ms, DOM churn: ${snapSort.dom.totalChurn}`);
    console.log(`${"═".repeat(70)}\n`);
  });

  // ─── P11: Thumbnail reflow after seek ──────────────────────────────
  // Reproduces: "clicking scrubber randomly, wherever I land the thumbnails
  // load in two or three stages (they reflow)."
  // Measures CLS from images loading, counts how many distinct compositions
  // (layout-shift bursts) happen after a seek lands.
  test("P11: thumbnail reflow — CLS from image loading after seek", async ({ kupua }) => {
    await kupua.goto();
    const total = await requireRealData(kupua);

    const viewportInfo = await kupua.page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
    }));
    console.log(`  [P11] Viewport: ${viewportInfo.innerWidth}x${viewportInfo.innerHeight} @${viewportInfo.dpr}x DPR`);
    console.log(`  [P11] total=${total}`);

    // Test both Uploaded sort (default, date) and Credit sort (keyword)
    const sortConfigs = [
      { label: "Uploaded (default)", setup: async () => { /* already default */ } },
      { label: "Credit", setup: async () => { await kupua.selectSort("Credit"); } },
    ];

    for (const sortConfig of sortConfigs) {
      console.log(`\n  [P11] ── Sort: ${sortConfig.label} ──`);
      await sortConfig.setup();
      await kupua.page.waitForTimeout(1000);

      const seekPositions = [0.2, 0.6, 0.35, 0.8, 0.15];
      const seekResults: Array<{ pos: number; cls: number; shifts: number; maxShift: number; compositions: number; maxFrame: number; severeFrames: number }> = [];

      for (const pos of seekPositions) {
        await injectPerfProbes(kupua);
        await kupua.page.waitForTimeout(300);
        await resetPerfProbes(kupua);

        console.log(`  [P11] Seeking to ${(pos * 100).toFixed(0)}%...`);
        await kupua.seekTo(pos, 30_000);

        // Wait 4s for thumbnails to fully load — reflow happens in stages
        await kupua.page.waitForTimeout(4000);

        const snap = await collectPerfSnapshot(kupua);

        // Count distinct shift compositions (bursts separated by >200ms)
        const shiftTimings = snap.cls.shiftDetails.map((s: any) => Math.round(s.time));
        let compositions = 0;
        if (shiftTimings.length > 0) {
          compositions = 1;
          const sorted = [...shiftTimings].sort((a, b) => a - b);
          for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] - sorted[i - 1] > 200) compositions++;
          }
        }

        seekResults.push({
          pos,
          cls: snap.cls.total,
          shifts: snap.cls.unexpectedShifts,
          maxShift: snap.cls.maxSingle,
          compositions,
          maxFrame: snap.jank.maxFrameMs,
          severeFrames: snap.jank.jankyFrames50ms,
        });

        console.log(`  [P11] pos=${(pos * 100).toFixed(0)}%: CLS=${snap.cls.total.toFixed(4)}, shifts=${snap.cls.unexpectedShifts}, compositions=${compositions}, maxFrame=${snap.jank.maxFrameMs.toFixed(0)}ms, severe=${snap.jank.jankyFrames50ms}`);

        if (snap.cls.shiftDetails.length > 0) {
          const imgShifts = snap.cls.shiftDetails.filter((s: any) =>
            s.sources.some((src: any) => src.tagName === "IMG")
          ).length;
          const nonImgShifts = snap.cls.shiftDetails.length - imgShifts;
          console.log(`    IMG shifts: ${imgShifts}, non-IMG: ${nonImgShifts}`);
          const sorted = [...shiftTimings].sort((a, b) => a - b);
          if (sorted.length > 1) {
            console.log(`    Time span: ${sorted[sorted.length - 1] - sorted[0]}ms (${sorted[0]}ms → ${sorted[sorted.length - 1]}ms)`);
          }
          for (const s of snap.cls.shiftDetails.filter((s: any) => !s.sources.some((src: any) => src.tagName === "IMG")).slice(0, 3)) {
            console.log(`    non-IMG: value=${s.value.toFixed(4)} [${s.sources.map((src: any) => `${src.tagName}.${src.className.slice(0, 40)}`).join(", ")}]`);
          }
        }

        // Log LoAF if any — these are the "app freezes" during thumbnail load
        if (snap.loaf.worst) {
          console.log(`    LoAF: ${snap.loaf.worst.duration.toFixed(0)}ms (blocking ${snap.loaf.worst.blockingDuration.toFixed(0)}ms)`);
          for (const s of (snap.loaf.worst.scripts ?? []).slice(0, 2)) {
            console.log(`      ${s.invoker} (${s.duration.toFixed(0)}ms) ${s.sourceURL}`);
          }
        }

        await kupua.page.evaluate(() => { (window as any).__perfProbes?.stop(); });
      }

      // Per-sort summary
      const totalCLS = seekResults.reduce((s, r) => s + r.cls, 0);
      const avgCLS = totalCLS / seekResults.length;
      const maxCLS = Math.max(...seekResults.map(r => r.cls));
      const avgMaxFrame = seekResults.reduce((s, r) => s + r.maxFrame, 0) / seekResults.length;
      const totalSevere = seekResults.reduce((s, r) => s + r.severeFrames, 0);
      console.log(`\n  [P11] ── ${sortConfig.label} SUMMARY ──`);
      console.log(`  Avg CLS/seek:       ${avgCLS.toFixed(4)}`);
      console.log(`  Max CLS/seek:       ${maxCLS.toFixed(4)}`);
      console.log(`  Avg max frame:      ${avgMaxFrame.toFixed(0)}ms`);
      console.log(`  Total severe frames: ${totalSevere}`);
      console.log(`  Seeks with shifts:  ${seekResults.filter(r => r.shifts > 0).length}/5`);
      console.log(`  Multi-composition:  ${seekResults.filter(r => r.compositions > 1).length}/5`);
    }
  });

  // ─── P12: Density switch focus drift + buffer boundary freeze ─────
  // Tests two user-reported issues:
  // 1. "Focused image slowly travels out of view" after density switches
  // 2. "App freezes at buffer boundary" — hole at the end during scroll
  // Also tests under Credit sort (reported as worse).
  test("P12: density switch focus drift — image travels out of view", async ({ kupua }) => {
    await kupua.goto();
    const total = await requireRealData(kupua);

    const viewportInfo = await kupua.page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
    }));
    console.log(`  [P12] Viewport: ${viewportInfo.innerWidth}x${viewportInfo.innerHeight} @${viewportInfo.dpr}x DPR`);
    console.log(`  [P12] total=${total}`);

    // Helper: get focused image viewport position
    async function getFocusedViewportPos() {
      return kupua.page.evaluate(() => {
        const store = (window as any).__kupua_store__;
        if (!store) return null;
        const s = store.getState();
        const fid = s.focusedImageId;
        if (!fid) return null;
        const gIdx = s.imagePositions.get(fid);
        if (gIdx == null) return null;
        const localIdx = gIdx - s.bufferOffset;
        if (localIdx < 0 || localIdx >= s.results.length) return null;

        const grid = document.querySelector('[aria-label="Image results grid"]');
        const table = document.querySelector('[aria-label="Image results table"]');
        const el = (grid ?? table) as HTMLElement;
        if (!el) return null;

        const isGrid = !!grid;
        let rowTop: number;
        if (isGrid) {
          const cols = Math.max(1, Math.floor(el.clientWidth / 280));
          rowTop = Math.floor(localIdx / cols) * 303;
        } else {
          rowTop = localIdx * 32;
        }

        const viewportY = rowTop - el.scrollTop;
        return {
          viewportY: Math.round(viewportY),
          viewportRatio: Math.round((viewportY / el.clientHeight) * 1000) / 1000,
          visible: viewportY >= -303 && viewportY <= el.clientHeight + 303,
          view: isGrid ? "grid" : "table",
          scrollTop: Math.round(el.scrollTop),
          scrollHeight: Math.round(el.scrollHeight),
          clientHeight: Math.round(el.clientHeight),
          localIdx,
          bufferOffset: s.bufferOffset,
          resultsLength: s.results.length,
        };
      });
    }

    // Helper: run drift test for a given sort config
    async function runDriftTest(label: string) {
      console.log(`\n  [P12] == ${label} ==`);

      // Scroll PAST buffer boundary using aggressive mousewheel.
      // Buffer is 1000 entries. At ~7 cols, ~143 rows * 303px = 43k px.
      // 60 wheels * 2000px = 120k px — well past boundary. This triggers
      // extend + evict cycles, which is where the freeze + hole appear.
      const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
      const gridBox = await gridEl.boundingBox();
      if (!gridBox) { console.log(`  [P12] No grid element found`); return; }
      await kupua.page.mouse.move(
        gridBox.x + gridBox.width / 2,
        gridBox.y + gridBox.height / 2,
      );

      console.log(`  [P12] Scrolling aggressively (60 wheels, past buffer boundary)...`);

      // Inject perf probes to catch the buffer-boundary freeze
      await injectPerfProbes(kupua);
      await kupua.page.waitForTimeout(300);
      await resetPerfProbes(kupua);

      for (let i = 0; i < 60; i++) {
        await kupua.page.mouse.wheel(0, 2000);
        await kupua.page.waitForTimeout(80);
      }
      // Wait for extends/evictions to fully settle
      await kupua.page.waitForTimeout(3000);

      const scrollSnap = await collectPerfSnapshot(kupua);
      const scrollState = await kupua.getStoreState();
      console.log(`  [P12] After scroll: offset=${scrollState.bufferOffset}, len=${scrollState.resultsLength}`);
      console.log(`  [P12] Scroll jank: maxFrame=${scrollSnap.jank.maxFrameMs.toFixed(0)}ms, severe=${scrollSnap.jank.jankyFrames50ms}, CLS=${scrollSnap.cls.total.toFixed(4)}`);
      if (scrollSnap.loaf.worst) {
        console.log(`  [P12] Scroll LoAF: ${scrollSnap.loaf.worst.duration.toFixed(0)}ms (blocking ${scrollSnap.loaf.worst.blockingDuration.toFixed(0)}ms)`);
      }
      await kupua.page.evaluate(() => { (window as any).__perfProbes?.stop(); });

      // Should have scrolled past buffer boundary (offset > 0)
      if (scrollState.bufferOffset < 500) {
        console.log(`  [P12] WARNING: only reached offset=${scrollState.bufferOffset}, wanted >500`);
      }

      // Focus an image near the middle of the viewport
      await kupua.focusNthItem(5);
      const focusedId = await kupua.getFocusedImageId();
      if (!focusedId) { console.log(`  [P12] Could not focus image`); return; }
      console.log(`  [P12] Focused: ${focusedId}`);

      const initial = await getFocusedViewportPos();
      console.log(`  [P12] Initial: ${JSON.stringify(initial)}`);

      // Do 8 density switches
      type PosEntry = { cycle: number; view: string; viewportY: number; viewportRatio: number; visible: boolean };
      const positions: PosEntry[] = [];
      if (initial) {
        positions.push({ cycle: 0, view: initial.view, viewportY: initial.viewportY, viewportRatio: initial.viewportRatio, visible: initial.visible });
      }

      for (let cycle = 1; cycle <= 8; cycle++) {
        if (cycle % 2 === 1) {
          await kupua.switchToTable();
          await kupua.page.waitForSelector('[aria-label="Image results table"]', { timeout: 5000 });
        } else {
          await kupua.switchToGrid();
          await kupua.page.waitForSelector('[aria-label="Image results grid"]', { timeout: 5000 });
        }
        // Long settle for scroll restoration
        await kupua.page.waitForTimeout(1500);

        const fid = await kupua.getFocusedImageId();
        if (fid !== focusedId) {
          console.log(`  [P12] FOCUS LOST at cycle ${cycle}! Was ${focusedId}, now ${fid}`);
        }

        const pos = await getFocusedViewportPos();
        if (pos) {
          positions.push({ cycle, view: pos.view, viewportY: pos.viewportY, viewportRatio: pos.viewportRatio, visible: pos.visible });
          console.log(`  [P12] Cycle ${cycle} (${pos.view}): vY=${pos.viewportY}px, ratio=${pos.viewportRatio}, visible=${pos.visible}, sT=${pos.scrollTop}, sH=${pos.scrollHeight}, cH=${pos.clientHeight}, lIdx=${pos.localIdx}`);
        } else {
          const diag = await kupua.page.evaluate(() => {
            const store = (window as any).__kupua_store__;
            if (!store) return "no store";
            const s = store.getState();
            const fid = s.focusedImageId;
            const gIdx = fid ? s.imagePositions.get(fid) : undefined;
            const lIdx = gIdx != null ? gIdx - s.bufferOffset : "N/A";
            const hasGrid = !!document.querySelector('[aria-label="Image results grid"]');
            const hasTable = !!document.querySelector('[aria-label="Image results table"]');
            return `fid=${fid}, gIdx=${gIdx}, lIdx=${lIdx}, bufOff=${s.bufferOffset}, resLen=${s.results.length}, grid=${hasGrid}, table=${hasTable}`;
          });
          console.log(`  [P12] Cycle ${cycle}: NULL -- ${diag}`);
        }
      }

      // Analysis
      console.log(`\n  [P12] -- DRIFT ANALYSIS (${label}) --`);
      if (positions.length >= 2) {
        const first = positions[0];
        const last = positions[positions.length - 1];
        const totalDrift = last.viewportY - first.viewportY;
        const deltas = positions.slice(1).map((p, i) => p.viewportY - positions[i].viewportY);

        console.log(`  Start:              ${first.viewportY}px (ratio ${first.viewportRatio})`);
        console.log(`  End:                ${last.viewportY}px (ratio ${last.viewportRatio})`);
        console.log(`  Total drift:        ${totalDrift}px over ${positions.length - 1} switches`);
        console.log(`  Avg drift/switch:   ${(totalDrift / (positions.length - 1)).toFixed(1)}px`);
        console.log(`  Still visible:      ${last.visible}`);
        console.log(`  Per-switch deltas:  [${deltas.join(", ")}]`);
        console.log(`  Null cycles:        ${8 - (positions.length - 1)}`);

        const allPos = deltas.every(d => d >= 0);
        const allNeg = deltas.every(d => d <= 0);
        if (allPos && totalDrift > 10) console.log(`  PATTERN: monotonic DOWN drift`);
        else if (allNeg && totalDrift < -10) console.log(`  PATTERN: monotonic UP drift`);
        else if (Math.abs(totalDrift) > 100) console.log(`  PATTERN: large drift (${totalDrift}px)`);
        else console.log(`  PATTERN: stable/oscillating (${totalDrift}px)`);
      } else {
        console.log(`  Only ${positions.length} valid positions -- cannot analyse drift`);
      }
    }

    // Test 1: Uploaded sort (default, date)
    await runDriftTest("Uploaded sort (default)");

    // Test 2: Credit sort (keyword - reported as worse)
    await kupua.goto();
    await kupua.selectSort("Credit");
    await kupua.page.waitForTimeout(1500);
    await runDriftTest("Credit sort");

    // Final visibility check
    const finalPos = await getFocusedViewportPos();
    if (finalPos) {
      console.log(`\n  [P12] Final: visible=${finalPos.visible}, viewportY=${finalPos.viewportY}px`);
    }
  });
});

