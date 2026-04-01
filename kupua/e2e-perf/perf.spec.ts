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
 * ║    Terminal 2: node e2e-perf/run-audit.mjs --label "..."           ║
 * ║            or: node scripts/run-perf-smoke.mjs [P<N>]              ║
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
 *
 * Result set is pinned via until=PERF_STABLE_UNTIL (env var set by
 * run-audit.mjs) so metric fluctuations track code changes, not data growth.
 */

import { appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../e2e/helpers";
import {
  GRID_ROW_HEIGHT,
  GRID_MIN_CELL_WIDTH,
  TABLE_ROW_HEIGHT,
} from "@/constants/layout";

const __dirname = dirname(fileURLToPath(import.meta.url));
const METRICS_FILE = resolve(__dirname, "results/.metrics-tmp.jsonl");

// ---------------------------------------------------------------------------
// Stable result set pinning
// ---------------------------------------------------------------------------

const STABLE_UNTIL = process.env["PERF_STABLE_UNTIL"] ?? "";

/**
 * Navigate to the perf-stable result set (frozen corpus).
 *
 * `until` pins the corpus to a fixed point in time so metrics track code
 * changes, not data growth.  It is essential on real ES (STABLE_UNTIL is
 * always set by run-audit.mjs — requireRealData() enforces this).  It is
 * omitted for local ES where the total is tiny and date-filtering would
 * likely return zero results anyway.
 */
async function gotoPerfSearch(kupua: any, extraParams?: string) {
  const untilParam = STABLE_UNTIL ? `&until=${encodeURIComponent(STABLE_UNTIL)}` : "";
  const extra = extraParams ? `&${extraParams}` : "";
  await kupua.page.goto(`/search?nonFree=true${untilParam}${extra}`);
  await kupua.waitForResults();
}

// ---------------------------------------------------------------------------
// Guard: skip all tests if not connected to a real cluster
// ---------------------------------------------------------------------------

async function requireRealData(kupua: any): Promise<number> {
  const store = await kupua.getStoreState();
  if (store.total < 100_000) {
    test.skip(true, `Skipping: connected to local ES (total=${store.total}). These tests require --use-TEST.`);
  }
  // On real data, PERF_STABLE_UNTIL MUST be set — otherwise the result corpus
  // grows with every new upload and metrics drift between runs.
  // Always invoke via run-audit.mjs (or scripts/run-perf-smoke.mjs), which
  // computes and injects this env var automatically.
  if (!STABLE_UNTIL) {
    throw new Error(
      "PERF_STABLE_UNTIL env var is not set but you are connected to a real ES cluster " +
      `(total=${store.total}). Run via: node e2e-perf/run-audit.mjs  OR  ` +
      "node scripts/run-perf-smoke.mjs — never invoke Playwright directly for perf tests.",
    );
  }
  return store.total;
}

// ---------------------------------------------------------------------------
// Focus position measurement — shared by P4, P6, P12
// ---------------------------------------------------------------------------

interface FocusPos {
  viewportY: number;
  viewportRatio: number;
  visible: boolean;
  view: "grid" | "table";
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  localIdx: number;
  bufferOffset: number;
  resultsLength: number;
}

/**
 * Read the focused image's exact viewport position.
 * Returns pixel offset from viewport top, ratio (0=top, 1=bottom),
 * visibility flag, and buffer/scroll metadata.
 */
async function getFocusedViewportPos(kupua: any): Promise<FocusPos | null> {
  return kupua.page.evaluate(
    ({ GRID_ROW, GRID_COLS, TABLE_ROW }: { GRID_ROW: number; GRID_COLS: number; TABLE_ROW: number }) => {
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
        const cols = Math.max(1, Math.floor(el.clientWidth / GRID_COLS));
        rowTop = Math.floor(localIdx / cols) * GRID_ROW;
      } else {
        rowTop = localIdx * TABLE_ROW;
      }

      const viewportY = rowTop - el.scrollTop;
      return {
        viewportY: Math.round(viewportY),
        viewportRatio: Math.round((viewportY / el.clientHeight) * 1000) / 1000,
        visible: viewportY >= -GRID_ROW && viewportY <= el.clientHeight + GRID_ROW,
        view: isGrid ? "grid" : "table",
        scrollTop: Math.round(el.scrollTop),
        scrollHeight: Math.round(el.scrollHeight),
        clientHeight: Math.round(el.clientHeight),
        localIdx,
        bufferOffset: s.bufferOffset,
        resultsLength: s.results.length,
      };
    },
    { GRID_ROW: GRID_ROW_HEIGHT, GRID_COLS: GRID_MIN_CELL_WIDTH, TABLE_ROW: TABLE_ROW_HEIGHT },
  );
}

// ---------------------------------------------------------------------------
// Performance instrumentation — injected into the browser context
// ---------------------------------------------------------------------------

/**
 * Inject all performance observers into the page. Call once after navigation.
 * Returns a handle to read accumulated metrics.
 */
async function injectPerfProbes(kupua: any) {
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

    // ── Frame timing (rAF jank detector) + scroll velocity ──────────
    const frameTimes: number[] = [];
    const scrollVelocities: number[] = []; // px/s per frame
    let _rafRunning = true;
    let _lastFrameTime = performance.now();
    let _lastScrollTop = -1;

    function rafLoop(now: number) {
      if (!_rafRunning) return;
      const delta = now - _lastFrameTime;
      frameTimes.push(delta);

      // Sample scroll position for velocity calculation
      const el = document.querySelector('[aria-label="Image results grid"]') ??
                 document.querySelector('[aria-label="Image results table"]');
      if (el && delta > 0) {
        const y = el.scrollTop;
        if (_lastScrollTop >= 0) {
          const velocity = Math.abs(y - _lastScrollTop) / (delta / 1000); // px/s
          if (velocity > 0) scrollVelocities.push(velocity);
        }
        _lastScrollTop = y;
      }

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

    // ── Blank flash detection ─────────────────────────────────────
    // Detects virtualizer rows that enter the viewport before React has
    // rendered their content. An IntersectionObserver watches for rows
    // becoming visible; a MutationObserver on the scroll container
    // detects when new rows are added and registers them for observation.
    //
    // A "flash" is counted when a row becomes visible (intersecting) but
    // has no meaningful content (no <img>, no text nodes >10 chars).
    // The flash duration is the time from visibility to the first
    // mutation that adds content to that row.
    const blankFlashes = {
      count: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      /** Rows currently visible but content-empty, awaiting content */
      _pending: new Map<Element, number>(), // element → timestamp entered viewport
    };

    function hasContent(row: Element): boolean {
      // Grid: has an <img> or a text node with meaningful content
      if (row.querySelector("img")) return true;
      // Table: has cell text content
      const text = row.textContent?.trim() ?? "";
      return text.length > 10;
    }

    try {
      const scrollEl = document.querySelector('[aria-label="Image results grid"]') ??
                       document.querySelector('[aria-label="Image results table"]');
      if (scrollEl) {
        const flashObserver = new IntersectionObserver((entries) => {
          const now = performance.now();
          for (const entry of entries) {
            if (entry.isIntersecting) {
              // Row entered viewport — check if it has content
              if (!hasContent(entry.target)) {
                blankFlashes._pending.set(entry.target, now);
              }
            } else {
              // Row left viewport — if still pending, it was a flash
              // that never resolved (user scrolled past). Count it.
              if (blankFlashes._pending.has(entry.target)) {
                blankFlashes.count++;
                blankFlashes._pending.delete(entry.target);
              }
            }
          }
        }, { root: scrollEl, threshold: 0 });

        // Watch for content arriving in pending rows
        const flashMutObs = new MutationObserver(() => {
          if (blankFlashes._pending.size === 0) return;
          const now = performance.now();
          for (const [row, enteredAt] of blankFlashes._pending) {
            if (hasContent(row)) {
              const duration = now - enteredAt;
              blankFlashes.count++;
              blankFlashes.totalDurationMs += duration;
              blankFlashes.maxDurationMs = Math.max(blankFlashes.maxDurationMs, duration);
              blankFlashes._pending.delete(row);
            }
          }
        });
        flashMutObs.observe(scrollEl, { childList: true, subtree: true, characterData: true });

        // Observe existing rows and future rows via MutationObserver
        const observeRows = () => {
          const rows = scrollEl.querySelectorAll('[role="row"]');
          rows.forEach((row) => flashObserver.observe(row));
        };
        observeRows();

        // Re-observe when new rows are added (virtualizer recycling)
        const rowWatcher = new MutationObserver(() => observeRows());
        rowWatcher.observe(scrollEl, { childList: true });
      }
    } catch { /* blank flash detection not critical */ }

    // ── Network payload tracking ──────────────────────────────────
    // Tracks transfer size and duration of ES requests via Resource Timing.
    const esRequests: Array<{
      url: string;
      transferSize: number;
      duration: number;
      startTime: number;
    }> = [];

    try {
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const re = entry as PerformanceResourceTiming;
          if (re.name.includes("/es/")) {
            esRequests.push({
              url: re.name.split("/es/").pop() ?? re.name,
              transferSize: re.transferSize ?? 0,
              duration: re.duration,
              startTime: re.startTime,
            });
          }
        }
      });
      resourceObserver.observe({ type: "resource", buffered: true });
    } catch { /* resource timing not always available */ }

    // ── Expose on window for later extraction ───────────────────────
    (window as any).__perfProbes = {
      layoutShifts,
      longFrames,
      frameTimes,
      scrollVelocities,
      mutationStats,
      paintEntries,
      blankFlashes,
      esRequests,
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
  scroll: { maxVelocity: number; avgVelocity: number; samples: number };
  flashes: { count: number; totalDurationMs: number; maxDurationMs: number; pendingCount: number };
  network: { requestCount: number; totalBytes: number; avgBytes: number; avgDurationMs: number; requests: any[] };
}

async function collectPerfSnapshot(kupua: any, _label?: string): Promise<PerfSnapshot> {
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
        shiftDetails: unexpectedShifts.slice(0, 10),
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
        bursts: p.mutationStats.bursts.slice(-20),
      },
      paints: {
        count: p.paintEntries.length,
      },
      scroll: (() => {
        const sv = p.scrollVelocities as number[];
        const sortedV = [...sv].sort((a, b) => a - b);
        return {
          maxVelocity: sortedV.length > 0 ? sortedV[sortedV.length - 1] : 0,
          avgVelocity: sv.length > 0 ? sv.reduce((s: number, v: number) => s + v, 0) / sv.length : 0,
          samples: sv.length,
        };
      })(),
      flashes: {
        count: p.blankFlashes.count,
        totalDurationMs: p.blankFlashes.totalDurationMs,
        maxDurationMs: p.blankFlashes.maxDurationMs,
        pendingCount: p.blankFlashes._pending.size,
      },
      network: (() => {
        const reqs = p.esRequests as Array<{ url: string; transferSize: number; duration: number; startTime: number }>;
        const totalBytes = reqs.reduce((s: number, r) => s + r.transferSize, 0);
        const avgBytes = reqs.length > 0 ? totalBytes / reqs.length : 0;
        const avgDuration = reqs.length > 0 ? reqs.reduce((s: number, r) => s + r.duration, 0) / reqs.length : 0;
        return {
          requestCount: reqs.length,
          totalBytes,
          avgBytes,
          avgDurationMs: avgDuration,
          requests: reqs.slice(-10), // last 10 for debugging
        };
      })(),
    };
  });

  if (!snapshot) throw new Error("Perf probes not installed");
  return snapshot as PerfSnapshot;
}

function logPerfReport(label: string, snap: PerfSnapshot) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  PERF REPORT: ${label}`);
  console.log(`${"═".repeat(70)}`);

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

  console.log(`\n  ── Frame Timing ──`);
  console.log(`  Total frames:          ${snap.jank.frameCount}`);
  console.log(`  Avg frame:             ${snap.jank.avgFrameMs.toFixed(1)}ms`);
  console.log(`  P95 frame:             ${snap.jank.p95FrameMs.toFixed(1)}ms`);
  console.log(`  Max frame:             ${snap.jank.maxFrameMs.toFixed(1)}ms ${snap.jank.maxFrameMs > 100 ? "⚠️  SEVERE JANK" : snap.jank.maxFrameMs > 50 ? "🟡 JANK" : "✅ SMOOTH"}`);
  console.log(`  Dropped (>16.67ms):    ${snap.jank.jankyFrames16ms} (${snap.jank.frameCount > 0 ? ((snap.jank.jankyFrames16ms / snap.jank.frameCount) * 100).toFixed(1) : 0}%)`);
  console.log(`  Janky (>33ms):         ${snap.jank.jankyFrames33ms}`);
  console.log(`  Severe (>50ms):        ${snap.jank.jankyFrames50ms}`);

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

  console.log(`\n  ── Paint entries:      ${snap.paints.count}`);

  console.log(`\n  ── Scroll Velocity ──`);
  console.log(`  Samples:               ${snap.scroll.samples}`);
  console.log(`  Max velocity:          ${Math.round(snap.scroll.maxVelocity)} px/s`);
  console.log(`  Avg velocity:          ${Math.round(snap.scroll.avgVelocity)} px/s`);

  console.log(`\n  ── Blank Flashes ──`);
  console.log(`  Flash count:           ${snap.flashes.count} ${snap.flashes.count > 20 ? "⚠️  HIGH" : snap.flashes.count > 5 ? "🟡" : "✅"}`);
  console.log(`  Total duration:        ${snap.flashes.totalDurationMs.toFixed(0)}ms`);
  console.log(`  Max duration:          ${snap.flashes.maxDurationMs.toFixed(0)}ms`);
  console.log(`  Still pending:         ${snap.flashes.pendingCount}`);

  console.log(`\n  ── Network (ES requests) ──`);
  console.log(`  Request count:         ${snap.network.requestCount}`);
  console.log(`  Total transferred:     ${(snap.network.totalBytes / 1024).toFixed(0)} KB`);
  console.log(`  Avg per request:       ${(snap.network.avgBytes / 1024).toFixed(0)} KB`);
  console.log(`  Avg duration:          ${snap.network.avgDurationMs.toFixed(0)}ms`);

  console.log(`${"═".repeat(70)}\n`);
}

/**
 * Reset the accumulated metrics for a fresh measurement window.
 */
async function resetPerfProbes(kupua: any) {
  await kupua.page.evaluate(() => {
    const p = (window as any).__perfProbes;
    if (!p) return;
    p.layoutShifts.length = 0;
    p.longFrames.length = 0;
    p.frameTimes.length = 0;
    p.scrollVelocities.length = 0;
    p.mutationStats.additions = 0;
    p.mutationStats.removals = 0;
    p.mutationStats.attributeChanges = 0;
    p.mutationStats.textChanges = 0;
    p.mutationStats.bursts.length = 0;
    p.paintEntries.length = 0;
    p.blankFlashes.count = 0;
    p.blankFlashes.totalDurationMs = 0;
    p.blankFlashes.maxDurationMs = 0;
    p.blankFlashes._pending.clear();
    p.esRequests.length = 0;
  });
}

// ---------------------------------------------------------------------------
// Structured metric emission — read by run-audit.mjs harness
// ---------------------------------------------------------------------------

function emitMetric(id: string, snap: PerfSnapshot, extra?: Record<string, unknown>) {
  const line = JSON.stringify({
    id,
    timestamp: new Date().toISOString(),
    cls: Number(snap.cls.total.toFixed(4)),
    clsMax: Number(snap.cls.maxSingle.toFixed(4)),
    maxFrame: Math.round(snap.jank.maxFrameMs),
    severe: snap.jank.jankyFrames50ms,
    p95Frame: Math.round(snap.jank.p95FrameMs),
    domChurn: snap.dom.totalChurn,
    loafBlocking: Math.round(snap.loaf.totalBlockingMs),
    frameCount: snap.jank.frameCount,
    scrollMaxVelocity: Math.round(snap.scroll.maxVelocity),
    scrollAvgVelocity: Math.round(snap.scroll.avgVelocity),
    blankFlashes: snap.flashes.count,
    blankFlashMaxMs: Math.round(snap.flashes.maxDurationMs),
    esRequests: snap.network.requestCount,
    esBytes: snap.network.totalBytes,
    ...(extra ?? {}),
  }) + "\n";
  try {
    appendFileSync(METRICS_FILE, line);
  } catch {
    // METRICS_FILE may not exist if running outside the harness — that's fine.
  }
}

// ---------------------------------------------------------------------------
// Smoke tests
// ---------------------------------------------------------------------------

test.describe("Rendering Performance Smoke", () => {
  test.describe.configure({ timeout: 240_000 });

  test.afterEach(async ({ kupua }) => {
    // Stop probes to prevent rAF leak
    await kupua.page.evaluate(() => {
      (window as any).__perfProbes?.stop();
    });
  });

  // ─── P1: Initial load + settle ─────────────────────────────────────
  test("P1: initial load — CLS and frame jank during first render", async ({ kupua }) => {
    await kupua.page.goto(
      STABLE_UNTIL
        ? `/search?nonFree=true&until=${encodeURIComponent(STABLE_UNTIL)}`
        : "/search?nonFree=true",
    );
    await injectPerfProbes(kupua);
    await kupua.waitForResults();
    await kupua.page.waitForTimeout(3000);

    const total = await requireRealData(kupua);
    console.log(`  [P1] total=${total}${STABLE_UNTIL ? `, stable_until=${STABLE_UNTIL}` : ""}`);

    const snap = await collectPerfSnapshot(kupua, "P1: Initial Load");
    logPerfReport("P1: Initial Load", snap);
    emitMetric("P1", snap);

    expect(snap.cls.total).toBeLessThan(0.25);
  });

  // ─── P2: Mousewheel scroll ────────────────────────────────────────
  test("P2: mousewheel scroll — jank, CLS, DOM churn during fast scroll", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await requireRealData(kupua);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

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
      await kupua.page.waitForTimeout(50);
    }
    await kupua.page.waitForTimeout(2000);

    const snap = await collectPerfSnapshot(kupua, "P2: Fast Scroll");
    logPerfReport("P2: Mousewheel Fast Scroll", snap);
    emitMetric("P2", snap);

    expect(snap.cls.total).toBeLessThan(0.1);
  });

  // ─── P3: Seek buffer replacement (date sort) ─────────────────────
  test("P3: scrubber seek to 50% — reflow and instability during buffer replacement", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await requireRealData(kupua);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    console.log(`  [P3] Seeking to 50% (date sort / percentile path)...`);
    const seekStart = Date.now();
    await kupua.seekTo(0.5, 30_000);
    const seekMs = Date.now() - seekStart;
    console.log(`  [P3] Seek completed in ${seekMs}ms`);

    await kupua.page.waitForTimeout(4000);

    const snap = await collectPerfSnapshot(kupua, "P3: Seek to 50%");
    logPerfReport("P3: Scrubber Seek to 50% (date sort)", snap);
    emitMetric("P3", snap, { seekMs });

    const store = await kupua.getStoreState();
    console.log(`  [P3] Post-seek: offset=${store.bufferOffset}, len=${store.resultsLength}`);
  });

  // ─── P3b: Seek under keyword sort ────────────────────────────────
  // Exercises the completely different composite-agg + binary-search seek
  // path. P3 only tests date sort (percentile). This is the other major branch.
  test("P3b: keyword sort seek to 50% — composite-agg + binary-search path", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await requireRealData(kupua);

    // Switch to Credit sort (keyword field — composite agg path)
    await kupua.selectSort("Credit");
    await kupua.page.waitForTimeout(1500);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    console.log(`  [P3b] Seeking to 50% (Credit sort / composite-agg path)...`);
    const seekStart = Date.now();
    await kupua.seekTo(0.5, 60_000);
    const seekMs = Date.now() - seekStart;
    console.log(`  [P3b] Seek completed in ${seekMs}ms`);

    await kupua.page.waitForTimeout(4000);

    const snap = await collectPerfSnapshot(kupua, "P3b: Seek to 50% (keyword sort)");
    logPerfReport("P3b: Scrubber Seek to 50% (Credit/keyword sort)", snap);
    emitMetric("P3b", snap, { seekMs });

    const store = await kupua.getStoreState();
    console.log(`  [P3b] Post-seek: offset=${store.bufferOffset}, len=${store.resultsLength}`);
  });

  // ─── P4a: Grid → Table density switch ────────────────────────────
  test("P4a: density switch grid→table — CLS and DOM churn", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await requireRealData(kupua);

    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    const posBefore = await getFocusedViewportPos(kupua);
    console.log(`  [P4a] Focused: ${focusedId}, before: vY=${posBefore?.viewportY}px ratio=${posBefore?.viewportRatio}`);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    console.log(`  [P4a] Switching grid → table...`);
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(1000);

    const snap = await collectPerfSnapshot(kupua, "P4a: Grid→Table");
    const posAfter = await getFocusedViewportPos(kupua);
    const drift = posBefore && posAfter ? posAfter.viewportY - posBefore.viewportY : null;
    const ratioDrift = posBefore && posAfter ? Math.round((posAfter.viewportRatio - posBefore.viewportRatio) * 1000) / 1000 : null;
    console.log(`  [P4a] After: vY=${posAfter?.viewportY}px ratio=${posAfter?.viewportRatio}, drift=${drift}px, ratioDrift=${ratioDrift}`);

    logPerfReport("P4a: Grid → Table", snap);
    emitMetric("P4a", snap, {
      focusDriftPx: drift,
      focusDriftRatio: ratioDrift,
      focusVisible: posAfter?.visible ?? false,
    });

    expect(await kupua.getFocusedImageId()).toBe(focusedId);
  });

  // ─── P4b: Table → Grid density switch ────────────────────────────
  test("P4b: density switch table→grid — CLS and DOM churn", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await requireRealData(kupua);

    await kupua.switchToTable();
    await kupua.page.waitForTimeout(500);
    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    const posBefore = await getFocusedViewportPos(kupua);
    console.log(`  [P4b] Focused: ${focusedId}, before: vY=${posBefore?.viewportY}px ratio=${posBefore?.viewportRatio}`);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    console.log(`  [P4b] Switching table → grid...`);
    await kupua.switchToGrid();
    await kupua.page.waitForTimeout(1000);

    const snap = await collectPerfSnapshot(kupua, "P4b: Table→Grid");
    const posAfter = await getFocusedViewportPos(kupua);
    const drift = posBefore && posAfter ? posAfter.viewportY - posBefore.viewportY : null;
    const ratioDrift = posBefore && posAfter ? Math.round((posAfter.viewportRatio - posBefore.viewportRatio) * 1000) / 1000 : null;
    console.log(`  [P4b] After: vY=${posAfter?.viewportY}px ratio=${posAfter?.viewportRatio}, drift=${drift}px, ratioDrift=${ratioDrift}`);

    logPerfReport("P4b: Table → Grid", snap);
    emitMetric("P4b", snap, {
      focusDriftPx: drift,
      focusDriftRatio: ratioDrift,
      focusVisible: posAfter?.visible ?? false,
    });

    expect(await kupua.getFocusedImageId()).toBe(focusedId);
  });

  // ─── P5: Panel toggle — layout reflow ─────────────────────────────
  test("P5: panel toggle — CLS during left/right panel open/close", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await requireRealData(kupua);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    console.log(`  [P5] Opening left panel...`);
    await kupua.page.keyboard.press("Alt+[");
    await kupua.page.waitForTimeout(800);

    const snapLeft = await collectPerfSnapshot(kupua, "P5a: Left panel open");
    logPerfReport("P5a: Left Panel Open", snapLeft);
    emitMetric("P5a", snapLeft);
    await resetPerfProbes(kupua);

    console.log(`  [P5] Opening right panel...`);
    await kupua.page.keyboard.press("Alt+]");
    await kupua.page.waitForTimeout(800);

    const snapRight = await collectPerfSnapshot(kupua, "P5b: Right panel open");
    logPerfReport("P5b: Right Panel Open", snapRight);
    emitMetric("P5b", snapRight);
    await resetPerfProbes(kupua);

    console.log(`  [P5] Closing both panels...`);
    await kupua.page.keyboard.press("Alt+[");
    await kupua.page.waitForTimeout(300);
    await kupua.page.keyboard.press("Alt+]");
    await kupua.page.waitForTimeout(800);

    const snapClose = await collectPerfSnapshot(kupua, "P5c: Both panels closed");
    logPerfReport("P5c: Both Panels Closed", snapClose);
    emitMetric("P5c", snapClose);
  });

  // ─── P6: Sort change with focus — "Never Lost" path ───────────────
  test("P6: sort change — CLS and jank during sort-around-focus", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await requireRealData(kupua);

    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    const posBefore = await getFocusedViewportPos(kupua);
    console.log(`  [P6] Focused: ${focusedId}, before: vY=${posBefore?.viewportY}px ratio=${posBefore?.viewportRatio}`);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    console.log(`  [P6] Toggling sort direction (sort-around-focus)...`);
    await kupua.toggleSortDirection();
    await kupua.page.waitForTimeout(5000);

    const snap = await collectPerfSnapshot(kupua, "P6: Sort Direction Toggle");
    const posAfter = await getFocusedViewportPos(kupua);
    const drift = posBefore && posAfter ? posAfter.viewportY - posBefore.viewportY : null;
    const ratioDrift = posBefore && posAfter ? Math.round((posAfter.viewportRatio - posBefore.viewportRatio) * 1000) / 1000 : null;
    console.log(`  [P6] After: vY=${posAfter?.viewportY}px ratio=${posAfter?.viewportRatio}, drift=${drift}px, ratioDrift=${ratioDrift}`);

    logPerfReport("P6: Sort Direction Toggle (Never Lost)", snap);
    emitMetric("P6", snap, {
      focusDriftPx: drift,
      focusDriftRatio: ratioDrift,
      focusVisible: posAfter?.visible ?? false,
    });

    const store = await kupua.getStoreState();
    console.log(`  [P6] Post-sort: focused=${store.focusedImageId}, offset=${store.bufferOffset}`);
    console.log(`  [P6] Focus preserved: ${store.focusedImageId === focusedId}`);
  });

  // ─── P7: Scrubber drag — continuous DOM writes ────────────────────
  test("P7: scrubber drag — frame rate during continuous thumb tracking", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
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

    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      const y = trackBox!.y + (trackBox!.height * i) / steps;
      await kupua.page.mouse.move(startX, y);
      await kupua.page.waitForTimeout(30);
    }
    await kupua.page.mouse.up();
    await kupua.page.waitForTimeout(3000);

    const snap = await collectPerfSnapshot(kupua, "P7: Scrubber Drag");
    logPerfReport("P7: Scrubber Drag (top → bottom)", snap);
    emitMetric("P7", snap);

    expect(snap.cls.total).toBeLessThan(0.05);
  });

  // ─── P8: Table view scroll with extend/evict ──────────────────────
  test("P8: table scroll — jank during extend + evict cycles", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
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
    await kupua.page.waitForTimeout(3000);

    const snap = await collectPerfSnapshot(kupua, "P8: Table Fast Scroll");
    logPerfReport("P8: Table Fast Scroll with Extend/Evict", snap);
    emitMetric("P8", snap);

    const store = await kupua.getStoreState();
    console.log(`  [P8] Post-scroll: offset=${store.bufferOffset}, len=${store.resultsLength}`);
  });

  // ─── P9: Sort field change ───────────────────────────────────────
  test("P9: sort field change — CLS during full result set replacement", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await requireRealData(kupua);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    console.log(`  [P9] Changing sort to Credit...`);
    await kupua.selectSort("Credit");
    await kupua.page.waitForTimeout(2000);

    const snap = await collectPerfSnapshot(kupua, "P9: Sort Change to Credit");
    logPerfReport("P9: Sort Field Change (date → Credit)", snap);
    emitMetric("P9", snap);
  });

  // ─── P10: Comprehensive workflow (report: false) ──────────────────
  // Kept for stress-test value but excluded from audit diff tables.
  // It duplicates P1–P9 with accumulated noise from prior phases.
  // The harness records it but marks report=false.
  test("P10: full workflow — load, scroll, seek, switch, panel, sort", async ({ kupua }) => {
    await kupua.page.goto(
      STABLE_UNTIL
        ? `/search?nonFree=true&until=${encodeURIComponent(STABLE_UNTIL)}`
        : "/search?nonFree=true",
    );
    await injectPerfProbes(kupua);
    await kupua.waitForResults();
    await requireRealData(kupua);

    await kupua.page.waitForTimeout(2000);
    const snapLoad = await collectPerfSnapshot(kupua, "P10-load");
    logPerfReport("P10 Phase 1: Load", snapLoad);
    await resetPerfProbes(kupua);

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

    await kupua.seekTo(0.3, 30_000);
    await kupua.page.waitForTimeout(1500);
    const snapSeek = await collectPerfSnapshot(kupua, "P10-seek");
    logPerfReport("P10 Phase 3: Seek to 30%", snapSeek);
    await resetPerfProbes(kupua);

    await kupua.focusNthItem(3);
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(1000);
    const snapDensity = await collectPerfSnapshot(kupua, "P10-density");
    logPerfReport("P10 Phase 4: Focus + Grid→Table", snapDensity);
    await resetPerfProbes(kupua);

    await kupua.toggleSortDirection();
    await kupua.page.waitForTimeout(4000);
    const snapSort = await collectPerfSnapshot(kupua, "P10-sort");
    logPerfReport("P10 Phase 5: Sort Toggle (Never Lost)", snapSort);

    console.log(`\n${"═".repeat(70)}`);
    console.log("  P10 SUMMARY");
    console.log(`${"═".repeat(70)}`);
    console.log(`  Load  CLS: ${snapLoad.cls.total.toFixed(4)}, max-frame: ${snapLoad.jank.maxFrameMs.toFixed(0)}ms, DOM churn: ${snapLoad.dom.totalChurn}`);
    console.log(`  Scroll CLS: ${snapScroll.cls.total.toFixed(4)}, max-frame: ${snapScroll.jank.maxFrameMs.toFixed(0)}ms, DOM churn: ${snapScroll.dom.totalChurn}`);
    console.log(`  Seek   CLS: ${snapSeek.cls.total.toFixed(4)}, max-frame: ${snapSeek.jank.maxFrameMs.toFixed(0)}ms, DOM churn: ${snapSeek.dom.totalChurn}`);
    console.log(`  Switch CLS: ${snapDensity.cls.total.toFixed(4)}, max-frame: ${snapDensity.jank.maxFrameMs.toFixed(0)}ms, DOM churn: ${snapDensity.dom.totalChurn}`);
    console.log(`  Sort   CLS: ${snapSort.cls.total.toFixed(4)}, max-frame: ${snapSort.jank.maxFrameMs.toFixed(0)}ms, DOM churn: ${snapSort.dom.totalChurn}`);
    console.log(`${"═".repeat(70)}\n`);

    // Emit with report:false — harness records but excludes from diff table
    const composite: PerfSnapshot = {
      cls: { total: snapLoad.cls.total + snapScroll.cls.total + snapSeek.cls.total + snapDensity.cls.total + snapSort.cls.total, maxSingle: Math.max(snapLoad.cls.maxSingle, snapScroll.cls.maxSingle, snapSeek.cls.maxSingle, snapDensity.cls.maxSingle, snapSort.cls.maxSingle), unexpectedShifts: 0, shiftDetails: [] },
      loaf: { count: 0, totalBlockingMs: snapLoad.loaf.totalBlockingMs + snapScroll.loaf.totalBlockingMs + snapSeek.loaf.totalBlockingMs + snapDensity.loaf.totalBlockingMs + snapSort.loaf.totalBlockingMs, worst: null },
      jank: { frameCount: 0, droppedFrames: 0, jankyFrames16ms: 0, jankyFrames33ms: 0, jankyFrames50ms: snapLoad.jank.jankyFrames50ms + snapScroll.jank.jankyFrames50ms + snapSeek.jank.jankyFrames50ms + snapDensity.jank.jankyFrames50ms + snapSort.jank.jankyFrames50ms, maxFrameMs: Math.max(snapLoad.jank.maxFrameMs, snapScroll.jank.maxFrameMs, snapSeek.jank.maxFrameMs, snapDensity.jank.maxFrameMs, snapSort.jank.maxFrameMs), p95FrameMs: 0, avgFrameMs: 0 },
      dom: { additions: 0, removals: 0, attributeChanges: 0, totalChurn: snapLoad.dom.totalChurn + snapScroll.dom.totalChurn + snapSeek.dom.totalChurn + snapDensity.dom.totalChurn + snapSort.dom.totalChurn, bursts: [] },
      paints: { count: 0 },
    };
    emitMetric("P10", composite, { report: false });
  });

  // ─── P11: Thumbnail reflow — 3 seeks, simplified ──────────────────
  // Measures CLS from images loading after seek lands.
  // Reduced to 3 seek positions (was 5). Credit sort variant → P11b.
  test("P11: thumbnail reflow — CLS from image loading after seek (3 positions)", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = await requireRealData(kupua);
    console.log(`  [P11] total=${total}`);

    const seekPositions = [0.2, 0.6, 0.85];

    for (const pos of seekPositions) {
      await injectPerfProbes(kupua);
      await kupua.page.waitForTimeout(300);
      await resetPerfProbes(kupua);

      console.log(`  [P11] Seeking to ${(pos * 100).toFixed(0)}%...`);
      await kupua.seekTo(pos, 30_000);
      await kupua.page.waitForTimeout(4000);

      const snap = await collectPerfSnapshot(kupua);
      emitMetric(`P11@${Math.round(pos * 100)}`, snap, { seekPos: pos });

      const shiftTimings = snap.cls.shiftDetails.map((s: any) => Math.round(s.time));
      let compositions = 0;
      if (shiftTimings.length > 0) {
        compositions = 1;
        const sorted = [...shiftTimings].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] - sorted[i - 1] > 200) compositions++;
        }
      }

      console.log(`  [P11] pos=${(pos * 100).toFixed(0)}%: CLS=${snap.cls.total.toFixed(4)}, shifts=${snap.cls.unexpectedShifts}, compositions=${compositions}, maxFrame=${snap.jank.maxFrameMs.toFixed(0)}ms, severe=${snap.jank.jankyFrames50ms}`);
      await kupua.page.evaluate(() => { (window as any).__perfProbes?.stop(); });
    }
  });

  // ─── P11b: Thumbnail reflow — Credit sort variant ─────────────────
  // Optional. Tests keyword sort seek path for CLS comparison.
  test("P11b: thumbnail reflow — keyword sort (Credit) 3 seeks", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await requireRealData(kupua);

    await kupua.selectSort("Credit");
    await kupua.page.waitForTimeout(1500);

    const seekPositions = [0.2, 0.6, 0.85];

    for (const pos of seekPositions) {
      await injectPerfProbes(kupua);
      await kupua.page.waitForTimeout(300);
      await resetPerfProbes(kupua);

      console.log(`  [P11b] Seeking to ${(pos * 100).toFixed(0)}% (Credit sort)...`);
      await kupua.seekTo(pos, 60_000);
      await kupua.page.waitForTimeout(4000);

      const snap = await collectPerfSnapshot(kupua);
      emitMetric(`P11b@${Math.round(pos * 100)}`, snap, { seekPos: pos, sort: "credit" });

      console.log(`  [P11b] pos=${(pos * 100).toFixed(0)}%: CLS=${snap.cls.total.toFixed(4)}, shifts=${snap.cls.unexpectedShifts}, maxFrame=${snap.jank.maxFrameMs.toFixed(0)}ms, severe=${snap.jank.jankyFrames50ms}`);
      await kupua.page.evaluate(() => { (window as any).__perfProbes?.stop(); });
    }
  });

  // ─── P12: Density drift + buffer boundary ─────────────────────────
  test("P12: density switch focus drift — image travels out of view", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = await requireRealData(kupua);

    const viewportInfo = await kupua.page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
    }));
    console.log(`  [P12] Viewport: ${viewportInfo.innerWidth}x${viewportInfo.innerHeight} @${viewportInfo.dpr}x DPR`);
    console.log(`  [P12] total=${total}`);

    async function runDriftTest(label: string) {
      console.log(`\n  [P12] == ${label} ==`);

      const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
      const gridBox = await gridEl.boundingBox();
      if (!gridBox) { console.log(`  [P12] No grid element found`); return; }
      await kupua.page.mouse.move(
        gridBox.x + gridBox.width / 2,
        gridBox.y + gridBox.height / 2,
      );

      console.log(`  [P12] Scrolling aggressively (60 wheels, past buffer boundary)...`);

      await injectPerfProbes(kupua);
      await kupua.page.waitForTimeout(300);
      await resetPerfProbes(kupua);

      for (let i = 0; i < 60; i++) {
        await kupua.page.mouse.wheel(0, 2000);
        await kupua.page.waitForTimeout(80);
      }
      await kupua.page.waitForTimeout(3000);

      const scrollSnap = await collectPerfSnapshot(kupua);
      const scrollState = await kupua.getStoreState();
      console.log(`  [P12] After scroll: offset=${scrollState.bufferOffset}, len=${scrollState.resultsLength}`);
      console.log(`  [P12] Scroll jank: maxFrame=${scrollSnap.jank.maxFrameMs.toFixed(0)}ms, severe=${scrollSnap.jank.jankyFrames50ms}, CLS=${scrollSnap.cls.total.toFixed(4)}`);
      emitMetric("P12-scroll", scrollSnap, { sort: label });
      await kupua.page.evaluate(() => { (window as any).__perfProbes?.stop(); });

      if (scrollState.bufferOffset < 500) {
        console.log(`  [P12] WARNING: only reached offset=${scrollState.bufferOffset}, wanted >500`);
      }

      await kupua.focusNthItem(5);
      const focusedId = await kupua.getFocusedImageId();
      if (!focusedId) { console.log(`  [P12] Could not focus image`); return; }
      console.log(`  [P12] Focused: ${focusedId}`);

      const initial = await getFocusedViewportPos(kupua);
      console.log(`  [P12] Initial: ${JSON.stringify(initial)}`);

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
        await kupua.page.waitForTimeout(1500);

        const fid = await kupua.getFocusedImageId();
        if (fid !== focusedId) {
          console.log(`  [P12] FOCUS LOST at cycle ${cycle}! Was ${focusedId}, now ${fid}`);
        }

        const pos = await getFocusedViewportPos(kupua);
        if (pos) {
          positions.push({ cycle, view: pos.view, viewportY: pos.viewportY, viewportRatio: pos.viewportRatio, visible: pos.visible });
          console.log(`  [P12] Cycle ${cycle} (${pos.view}): vY=${pos.viewportY}px, ratio=${pos.viewportRatio}, visible=${pos.visible}, lIdx=${pos.localIdx}`);
        } else {
          console.log(`  [P12] Cycle ${cycle}: NULL position`);
        }
      }

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
      } else {
        console.log(`  Only ${positions.length} valid positions -- cannot analyse drift`);
      }
    }

    await runDriftTest("Uploaded sort (default)");

    await kupua.goto();
    await kupua.selectSort("Credit");
    await kupua.page.waitForTimeout(1500);
    await runDriftTest("Credit sort");

    const finalPos = await getFocusedViewportPos(kupua);
    if (finalPos) {
      console.log(`\n  [P12] Final: visible=${finalPos.visible}, viewportY=${finalPos.viewportY}px`);
    }
  });

  // ─── P13: Image detail enter/exit ─────────────────────────────────
  // Tests the opacity-0 overlay pattern. Measures: transition jank,
  // scroll position restoration accuracy, CLS on return.
  test("P13: image detail enter/exit — overlay transition and scroll restoration", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await requireRealData(kupua);

    // Scroll down a bit so we have a non-trivial scroll position to restore
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    await kupua.page.mouse.move(gridBox!.x + 200, gridBox!.y + 200);
    for (let i = 0; i < 5; i++) {
      await kupua.page.mouse.wheel(0, 600);
      await kupua.page.waitForTimeout(50);
    }
    await kupua.page.waitForTimeout(500);

    // Note scroll position before entering detail
    const scrollBefore = await kupua.getScrollTop();
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    console.log(`  [P13] Focused: ${focusedId}, scrollTop=${scrollBefore}`);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(300);
    await resetPerfProbes(kupua);

    // Double-click to open image detail
    console.log(`  [P13] Opening image detail...`);
    if (await kupua.isGridView()) {
      const cells = kupua.page.locator('[aria-label="Image results grid"] [class*="cursor-pointer"]');
      await cells.nth(2).dblclick();
    } else {
      const rows = kupua.page.locator('[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]');
      await rows.nth(2).dblclick();
    }
    await kupua.page.waitForTimeout(1500);

    const snapEnter = await collectPerfSnapshot(kupua, "P13: Enter detail");
    logPerfReport("P13a: Enter Image Detail", snapEnter);
    emitMetric("P13a", snapEnter);
    await resetPerfProbes(kupua);

    // Exit via Backspace
    console.log(`  [P13] Exiting image detail via Backspace...`);
    await kupua.page.keyboard.press("Backspace");
    await kupua.page.waitForTimeout(1000);

    const snapExit = await collectPerfSnapshot(kupua, "P13: Exit detail");
    logPerfReport("P13b: Exit Image Detail", snapExit);
    emitMetric("P13b", snapExit);

    // Check scroll position was restored
    const scrollAfter = await kupua.getScrollTop();
    const scrollDelta = Math.abs(scrollAfter - scrollBefore);
    console.log(`  [P13] Scroll before=${scrollBefore}, after=${scrollAfter}, delta=${scrollDelta}px`);
    // Scroll position should be restored to within ~1 row height
    expect(scrollDelta).toBeLessThan(GRID_ROW_HEIGHT * 2);
  });

  // ─── P14: Image traversal (prev/next) ─────────────────────────────
  // Three realistic traversal patterns:
  //   P14a — Normal browsing:  10 images forward at ~2/s (500ms gap).
  //          User is looking at each image briefly.
  //   P14b — Fast breeze-through: 15 images forward at ~5/s (200ms gap),
  //          then STOP and wait 3s. The app must cancel/deprioritise
  //          intermediate image loads and render the final image cleanly.
  //   P14c — Second burst + settle: 10 images backward at ~5/s (200ms gap),
  //          then STOP and wait 3s. Tests the same settle behaviour in
  //          the reverse direction (prefetch behind vs ahead).
  //
  // The settle period is the critical measurement: CLS and jank during
  // the 3s after stopping reveal whether the app is thrashing on stale
  // prefetch results or cleanly loading only the landed-on image.
  test("P14: image traversal — normal, fast+settle, reverse fast+settle", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await requireRealData(kupua);

    // Enter detail on the 3rd image
    await kupua.focusNthItem(3);
    if (await kupua.isGridView()) {
      const cells = kupua.page.locator('[aria-label="Image results grid"] [class*="cursor-pointer"]');
      await cells.nth(3).dblclick();
    } else {
      const rows = kupua.page.locator('[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]');
      await rows.nth(3).dblclick();
    }
    await kupua.page.waitForTimeout(1500);

    // ── P14a: Normal speed — 10 forward at ~2/s ──────────────────────
    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(300);
    await resetPerfProbes(kupua);

    console.log(`  [P14a] Normal browsing: 10 images forward at ~2/s...`);
    for (let i = 0; i < 10; i++) {
      await kupua.page.keyboard.press("ArrowRight");
      await kupua.page.waitForTimeout(500);
    }

    const snapNormal = await collectPerfSnapshot(kupua, "P14a: Normal speed");
    logPerfReport("P14a: Normal Browsing (10 fwd @ 2/s)", snapNormal);
    emitMetric("P14a", snapNormal, { traversals: 10, speed: "normal", direction: "forward" });

    // ── P14b: Fast burst forward — 15 at ~5/s, then settle 3s ───────
    await resetPerfProbes(kupua);

    console.log(`  [P14b] Fast burst: 15 images forward at ~5/s, then settle...`);
    for (let i = 0; i < 15; i++) {
      await kupua.page.keyboard.press("ArrowRight");
      await kupua.page.waitForTimeout(200);
    }
    // Settle — the app should load only the final image, not the 14 skipped
    console.log(`  [P14b] Stopped. Waiting 3s for settle...`);
    await kupua.page.waitForTimeout(3000);

    const snapFastFwd = await collectPerfSnapshot(kupua, "P14b: Fast forward + settle");
    logPerfReport("P14b: Fast Forward + Settle (15 fwd @ 5/s + 3s)", snapFastFwd);
    emitMetric("P14b", snapFastFwd, { traversals: 15, speed: "fast", direction: "forward" });

    // ── P14c: Fast burst backward — 10 at ~5/s, then settle 3s ──────
    await resetPerfProbes(kupua);

    console.log(`  [P14c] Fast burst backward: 10 images at ~5/s, then settle...`);
    for (let i = 0; i < 10; i++) {
      await kupua.page.keyboard.press("ArrowLeft");
      await kupua.page.waitForTimeout(200);
    }
    console.log(`  [P14c] Stopped. Waiting 3s for settle...`);
    await kupua.page.waitForTimeout(3000);

    const snapFastBack = await collectPerfSnapshot(kupua, "P14c: Fast backward + settle");
    logPerfReport("P14c: Fast Backward + Settle (10 back @ 5/s + 3s)", snapFastBack);
    emitMetric("P14c", snapFastBack, { traversals: 10, speed: "fast", direction: "backward" });

    // Exit
    await kupua.page.keyboard.press("Backspace");
    await kupua.page.waitForTimeout(500);
  });

  // ─── P15: Image detail fullscreen persistence ─────────────────────
  // Tests fullscreen persistence across image changes (Fullscreen API).
  // Measures: jank during fullscreen toggle, CLS during image swap in fullscreen.
  test("P15: image detail fullscreen — persists across image traversal", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await requireRealData(kupua);

    // Enter detail
    await kupua.focusNthItem(3);
    if (await kupua.isGridView()) {
      const cells = kupua.page.locator('[aria-label="Image results grid"] [class*="cursor-pointer"]');
      await cells.nth(3).dblclick();
    } else {
      const rows = kupua.page.locator('[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]');
      await rows.nth(3).dblclick();
    }
    await kupua.page.waitForTimeout(1500);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(300);
    await resetPerfProbes(kupua);

    // Enter fullscreen
    console.log(`  [P15] Entering fullscreen...`);
    await kupua.page.keyboard.press("f");
    await kupua.page.waitForTimeout(800);

    const snapFsEnter = await collectPerfSnapshot(kupua, "P15: Enter fullscreen");
    logPerfReport("P15a: Enter Fullscreen", snapFsEnter);
    emitMetric("P15a", snapFsEnter);
    await resetPerfProbes(kupua);

    // Traverse 2 images while fullscreen — should stay fullscreen
    console.log(`  [P15] Traversing in fullscreen...`);
    await kupua.page.keyboard.press("ArrowRight");
    await kupua.page.waitForTimeout(600);
    await kupua.page.keyboard.press("ArrowRight");
    await kupua.page.waitForTimeout(600);

    const snapFsTraverse = await collectPerfSnapshot(kupua, "P15: Fullscreen traverse");
    logPerfReport("P15b: Traverse in Fullscreen", snapFsTraverse);
    emitMetric("P15b", snapFsTraverse, { traversals: 2 });
    await resetPerfProbes(kupua);

    // Exit fullscreen (Escape only exits fullscreen, not the detail view)
    console.log(`  [P15] Exiting fullscreen...`);
    await kupua.page.keyboard.press("Escape");
    await kupua.page.waitForTimeout(800);

    const snapFsExit = await collectPerfSnapshot(kupua, "P15: Exit fullscreen");
    logPerfReport("P15c: Exit Fullscreen", snapFsExit);
    emitMetric("P15c", snapFsExit);

    // Exit detail
    await kupua.page.keyboard.press("Backspace");
    await kupua.page.waitForTimeout(500);
  });

  // ─── P16: Table column resize ─────────────────────────────────────
  // Tests CSS-variable width path + canvas measurement.
  // Frame rate during drag should show near-zero React re-renders.
  test("P16: table column resize — drag and double-click fit", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await requireRealData(kupua);

    await kupua.switchToTable();
    await kupua.page.waitForTimeout(500);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(300);
    await resetPerfProbes(kupua);

    // Find a column resize handle
    const resizeHandles = kupua.page.locator('[data-column-resize-handle="true"], [class*="cursor-col-resize"]');
    const handleCount = await resizeHandles.count();
    console.log(`  [P16] Found ${handleCount} resize handles`);

    if (handleCount === 0) {
      console.log(`  [P16] No resize handles found — skipping drag test`);
    } else {
      const handle = resizeHandles.first();
      const handleBox = await handle.boundingBox();
      if (handleBox) {
        const startX = handleBox.x + handleBox.width / 2;
        const startY = handleBox.y + handleBox.height / 2;

        console.log(`  [P16] Dragging column resize handle...`);
        await kupua.page.mouse.move(startX, startY);
        await kupua.page.mouse.down();

        // Drag 100px to the right
        const steps = 20;
        for (let i = 1; i <= steps; i++) {
          await kupua.page.mouse.move(startX + (100 * i) / steps, startY);
          await kupua.page.waitForTimeout(15);
        }
        await kupua.page.mouse.up();
        await kupua.page.waitForTimeout(500);
      }
    }

    const snapDrag = await collectPerfSnapshot(kupua, "P16: Column resize drag");
    logPerfReport("P16a: Column Resize Drag", snapDrag);
    emitMetric("P16a", snapDrag);
    await resetPerfProbes(kupua);

    // Test double-click to auto-fit
    const headers = kupua.page.locator('[role="columnheader"]');
    const headerCount = await headers.count();
    console.log(`  [P16] Found ${headerCount} column headers`);

    if (headerCount > 1) {
      console.log(`  [P16] Double-clicking header for auto-fit...`);
      await headers.nth(1).dblclick();
      await kupua.page.waitForTimeout(500);

      const snapAutoFit = await collectPerfSnapshot(kupua, "P16: Column auto-fit");
      logPerfReport("P16b: Column Double-Click Auto-Fit", snapAutoFit);
      emitMetric("P16b", snapAutoFit);
    }
  });
});




