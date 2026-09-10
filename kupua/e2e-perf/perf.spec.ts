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
 * ║  Cluster gate enforced by run-audit.mjs (probes total ≥ 100k once     ║
 * ║  at startup and refuses to run otherwise). Direct `npx playwright   ║
 * ║  test` invocations bypass the gate — by design, for debugging.       ║
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
import { test, expect } from "./helpers";
import {
  GRID_ROW_HEIGHT,
  GRID_MIN_CELL_WIDTH,
  TABLE_ROW_HEIGHT,
} from "@/constants/layout";
import { deriveNavigationTiming, landingElapsedMs, sanitizeLayoutShift } from "./p14-metrics.mjs";

// Pin to explicit focus mode — P4a/b, P6, P12–P15 use focusNthItem.
test.beforeEach(async ({ kupua }) => {
  await kupua.ensureExplicitMode();
});

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
 * always set by run-audit.mjs — the harness probes the cluster once at
 * startup and refuses to run if it's missing).  It is
 * omitted for local ES where the total is tiny and date-filtering would
 * likely return zero results anyway.
 */
async function gotoPerfSearch(kupua: any, extraParams?: string) {
  const untilParam = STABLE_UNTIL ? `&until=${STABLE_UNTIL}` : "";
  const extra = extraParams ? `&${extraParams}` : "";
  await kupua.page.goto(`/search?nonFree=true${untilParam}${extra}`);
  await kupua.waitForResults();
}

// ---------------------------------------------------------------------------
// Guard: per-test cluster checks live in the harness (run-audit.mjs probes
// once at startup and refuses to run if total < 100k or PERF_STABLE_UNTIL is
// missing). Tests assume real data and a pinned corpus. Direct invocations
// via `npx playwright test --config=…` bypass that probe — by design, for
// debugging — and produce meaningless metrics on local ES.
// ---------------------------------------------------------------------------

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
      sources: Array<{
        role: string;
        previousRect: { x: number; y: number; width: number; height: number };
        currentRect: { x: number; y: number; width: number; height: number };
      }>;
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
            const role = el?.matches('.flex-1 img[draggable="false"]')
              ? "detail-image"
              : el?.closest("[data-detail-image-id]")
                ? "detail-surface"
                : el?.getAttribute("role") ?? el?.tagName?.toLowerCase() ?? "other";
            const rect = (value: DOMRectReadOnly) => ({
              x: value.x,
              y: value.y,
              width: value.width,
              height: value.height,
            });
            return {
              role,
              previousRect: rect(s.previousRect),
              currentRect: rect(s.currentRect),
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

async function installP1BootstrapProbes(kupua: any) {
  await kupua.page.addInitScript(() => {
    const layoutShifts: any[] = [];
    const longFrames: any[] = [];
    const frameTimes: number[] = [];
    const paintEntries: Array<{ name: string; startTime: number }> = [];
    const esRequests: any[] = [];
    const mutationStats = {
      additions: 0,
      removals: 0,
      attributeChanges: 0,
      textChanges: 0,
      bursts: [] as any[],
    };
    let rafRunning = true;
    let lastFrameTime = performance.now();

    try {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          layoutShifts.push({
            value: entry.value,
            hadRecentInput: entry.hadRecentInput,
            time: entry.startTime,
            sources: (entry.sources ?? []).map((source: any) => {
              const element = source.node as Element | null;
              const rect = (value: DOMRectReadOnly) => ({
                x: value.x,
                y: value.y,
                width: value.width,
                height: value.height,
              });
              return {
                role: element?.getAttribute("role") ?? element?.tagName?.toLowerCase() ?? "other",
                previousRect: rect(source.previousRect),
                currentRect: rect(source.currentRect),
              };
            }),
          });
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch { /* layout-shift unsupported */ }
    try {
      const loafObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          longFrames.push({
            duration: entry.duration,
            blockingDuration: entry.blockingDuration,
            startTime: entry.startTime,
            scripts: (entry.scripts ?? []).map((script: any) => ({
              invoker: script.invoker,
              duration: script.duration,
              sourceURL: (script.sourceURL ?? "").split("/").pop() ?? "",
            })),
          });
        }
      });
      loafObserver.observe({ type: "long-animation-frame", buffered: true });
    } catch { /* long-animation-frame unsupported */ }
    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          paintEntries.push({ name: entry.name, startTime: entry.startTime });
        }
      });
      paintObserver.observe({ type: "paint", buffered: true });
    } catch { /* paint entries unsupported */ }
    try {
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
          if (entry.name.includes("/es/")) {
            esRequests.push({
              url: entry.name.split("/es/").pop() ?? "",
              transferSize: entry.transferSize ?? 0,
              duration: entry.duration,
              startTime: entry.startTime,
            });
          }
        }
      });
      resourceObserver.observe({ type: "resource", buffered: true });
    } catch { /* resource timing unavailable */ }

    const mutationObserver = new MutationObserver((mutations) => {
      let adds = 0;
      let removes = 0;
      let attrs = 0;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          adds += mutation.addedNodes.length;
          removes += mutation.removedNodes.length;
        } else if (mutation.type === "attributes") {
          attrs++;
        } else {
          mutationStats.textChanges++;
        }
      }
      mutationStats.additions += adds;
      mutationStats.removals += removes;
      mutationStats.attributeChanges += attrs;
      if (adds || removes || attrs) {
        mutationStats.bursts.push({ time: performance.now(), adds, removes, attrs });
      }
    });
    mutationObserver.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    const rafLoop = (now: number) => {
      if (!rafRunning) return;
      frameTimes.push(now - lastFrameTime);
      lastFrameTime = now;
      requestAnimationFrame(rafLoop);
    };
    requestAnimationFrame(rafLoop);

    (window as any).__perfProbes = {
      layoutShifts,
      longFrames,
      frameTimes,
      scrollVelocities: [],
      mutationStats,
      paintEntries,
      blankFlashes: { count: 0, totalDurationMs: 0, maxDurationMs: 0, _pending: new Map() },
      esRequests,
      stop: () => {
        rafRunning = false;
        mutationObserver.disconnect();
      },
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
        shiftDetails: unexpectedShifts,
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
      console.log(`    value=${s.value.toFixed(4)} t=${Math.round(s.time)}ms sources=[${s.sources.map((src: any) => {
        const previous = src.previousRect;
        const current = src.currentRect;
        return `${src.role} ${Math.round(previous.x)},${Math.round(previous.y)} ${Math.round(previous.width)}x${Math.round(previous.height)} → ${Math.round(current.x)},${Math.round(current.y)} ${Math.round(current.width)}x${Math.round(current.height)}`;
      }).join(", ")}]`);
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
  // severeRate = severe per 1000 frames — refresh-rate-independent.
  // Raw `severe` count doubles at 120Hz vs 60Hz; severeRate stays stable.
  const severeRate = snap.jank.frameCount > 0
    ? Math.round(snap.jank.jankyFrames50ms / snap.jank.frameCount * 1000 * 10) / 10
    : 0;
  const line = JSON.stringify({
    id,
    timestamp: new Date().toISOString(),
    cls: Number(snap.cls.total.toFixed(4)),
    clsMax: Number(snap.cls.maxSingle.toFixed(4)),
    maxFrame: Math.round(snap.jank.maxFrameMs),
    severe: snap.jank.jankyFrames50ms,
    severeRate,
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
// Per-image render timing during traversal (migrated from experiments.spec.ts)
//
// Measures whether each image renders before the user moves to the next one,
// and THE most important metric: how long the landing image takes to appear
// after the user stops traversing.
// ---------------------------------------------------------------------------

interface ImageRenderTiming {
  index: number;
  direction: "forward" | "backward";
  srcChanged: boolean;
  srcChangeMs: number;
  rendered: boolean;
  renderMs: number;
}

interface LandingImageTiming {
  alreadyRendered: boolean;
  renderMs: number;
  networkMs: number;
  rendered: boolean;
  cacheHit: boolean;
}

interface TraversalCommit {
  expectedId: string;
  committedEpochMs: number;
  committedPerformanceMs: number;
}

/**
 * Press an arrow key and measure how long until the detail-view image renders.
 * Returns once the image renders OR maxWaitMs elapses (whichever is first).
 * Total wall-clock time per call ≈ maxWaitMs (matches the old waitForTimeout).
 */
async function traverseAndMeasure(
  page: any,
  direction: "forward" | "backward",
  index: number,
  maxWaitMs: number,
  expectedId: string,
): Promise<{ timing: ImageRenderTiming; commit: TraversalCommit }> {
  const srcBefore = await page.evaluate(() => {
    const img = document.querySelector('.flex-1 img[draggable="false"]') as HTMLImageElement | null;
    return img?.src ?? "";
  });

  const key = direction === "forward" ? "ArrowRight" : "ArrowLeft";
  const t0 = Date.now();
  await page.keyboard.press(key);
  const commitHandle = await page.waitForFunction((targetId: string) => {
    const urlId = new URL(location.href).searchParams.get("image");
    const renderedId = document.querySelector("[data-detail-image-id]")?.getAttribute("data-detail-image-id");
    return urlId === targetId && renderedId === targetId
      ? { committedEpochMs: Date.now(), committedPerformanceMs: performance.now() }
      : false;
  }, expectedId, { timeout: 5_000 });
  const commit = await commitHandle.jsonValue();

  let srcChanged = false;
  let srcChangeMs = 0;
  let rendered = false;
  let renderMs = 0;

  const pollInterval = 30;
  const deadline = t0 + maxWaitMs;

  while (Date.now() < deadline) {
    const status = await page.evaluate((prevSrc: string) => {
      const img = document.querySelector('.flex-1 img[draggable="false"]') as HTMLImageElement | null;
      if (!img) return { src: "", changed: false, complete: false, hasSize: false };
      return {
        src: img.src,
        changed: img.src !== prevSrc,
        complete: img.complete,
        hasSize: img.naturalWidth > 0 && img.naturalHeight > 0,
      };
    }, srcBefore);

    const elapsed = Date.now() - t0;

    if (status.changed && !srcChanged) {
      srcChanged = true;
      srcChangeMs = elapsed;
    }

    if (status.changed && status.complete && status.hasSize && !rendered) {
      rendered = true;
      renderMs = elapsed;
      break;
    }

    await page.waitForTimeout(pollInterval);
  }

  // Capture final state if timed out
  if (!rendered) {
    const finalStatus = await page.evaluate((prevSrc: string) => {
      const img = document.querySelector('.flex-1 img[draggable="false"]') as HTMLImageElement | null;
      return {
        changed: img?.src !== prevSrc,
        complete: img?.complete ?? false,
        hasSize: (img?.naturalWidth ?? 0) > 0,
      };
    }, srcBefore);
    if (finalStatus.changed && !srcChanged) {
      srcChanged = true;
      srcChangeMs = Date.now() - t0;
    }
    if (finalStatus.changed && finalStatus.complete && finalStatus.hasSize) {
      rendered = true;
      renderMs = Date.now() - t0;
    }
  }

  // Wait remaining interval so total time ≈ maxWaitMs (preserves timing fidelity)
  const elapsed = Date.now() - t0;
  const remaining = maxWaitMs - elapsed;
  if (remaining > 10) await page.waitForTimeout(remaining);

  return {
    timing: { index, direction, srcChanged, srcChangeMs, rendered, renderMs },
    commit: { expectedId, ...commit },
  };
}

/**
 * After traversal stops, measure how long until the current image renders.
 * Also captures network timing from PerformanceResourceTiming.
 */
async function waitForLandingImage(
  page: any,
  landing: TraversalCommit,
  maxWaitMs = 5000,
): Promise<LandingImageTiming> {
  const pollInterval = 20;

  const initial = await page.evaluate((expectedId: string) => {
    const renderedId = document.querySelector("[data-detail-image-id]")
      ?.getAttribute("data-detail-image-id");
    const img = document.querySelector('.flex-1 img[draggable="false"]') as HTMLImageElement | null;
    if (!img) return { matches: false, complete: false, hasSize: false, src: "" };
    return { matches: renderedId === expectedId, complete: img.complete, hasSize: img.naturalWidth > 0 && img.naturalHeight > 0, src: img.src ?? "" };
  }, landing.expectedId);

  if (initial.matches && initial.complete && initial.hasSize) {
    const renderMs = landingElapsedMs(landing.committedEpochMs, Date.now());
    const netInfo = await getImageNetworkTiming(page, initial.src, landing.committedEpochMs);
    return { alreadyRendered: renderMs === 0, renderMs, networkMs: netInfo.networkMs, rendered: true, cacheHit: netInfo.cacheHit };
  }

  let landingSrc = initial.src;
  const deadline = landing.committedEpochMs + maxWaitMs;

  while (Date.now() < deadline) {
    await page.waitForTimeout(pollInterval);
    const status = await page.evaluate((expectedId: string) => {
      const renderedId = document.querySelector("[data-detail-image-id]")
        ?.getAttribute("data-detail-image-id");
      const img = document.querySelector('.flex-1 img[draggable="false"]') as HTMLImageElement | null;
      if (!img) return { matches: false, complete: false, hasSize: false, src: "" };
      return { matches: renderedId === expectedId, complete: img.complete, hasSize: img.naturalWidth > 0 && img.naturalHeight > 0, src: img.src ?? "" };
    }, landing.expectedId);
    landingSrc = status.src;
    if (status.matches && status.complete && status.hasSize) {
      const renderMs = landingElapsedMs(landing.committedEpochMs, Date.now());
      const netInfo = await getImageNetworkTiming(page, landingSrc, landing.committedEpochMs);
      return { alreadyRendered: false, renderMs, networkMs: netInfo.networkMs, rendered: true, cacheHit: netInfo.cacheHit };
    }
  }

  return { alreadyRendered: false, renderMs: maxWaitMs, networkMs: 0, rendered: false, cacheHit: false };
}

async function prepareP14Scenario(kupua: any, direction: "forward" | "backward", steps: number) {
  await gotoPerfSearch(kupua);
  const startRank = direction === "forward" ? 3 : steps + 3;
  await kupua.openDetailForNthItem(startRank);
  await kupua.page.waitForFunction(() => {
    const image = document.querySelector('.flex-1 img[draggable="false"]') as HTMLImageElement | null;
    return !!image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  }, { timeout: 10_000 });

  const expectedSequence = await kupua.page.evaluate(({ rank, count, traversalDirection }) => {
    const state = (window as any).__kupua_store__?.getState();
    if (!state) throw new Error("P14 search store unavailable");
    const delta = traversalDirection === "forward" ? 1 : -1;
    const indices = Array.from({ length: count }, (_, index) => rank + delta * (index + 1));
    const sequence = indices.map((index) => state.results[index]?.id);
    if (sequence.some((id) => !id)) throw new Error("P14 expected sequence exceeds the loaded buffer");
    return sequence as string[];
  }, { rank: startRank, count: steps, traversalDirection: direction });

  await injectPerfProbes(kupua);
  await kupua.page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  ));
  await resetPerfProbes(kupua);
  await kupua.page.evaluate(() => performance.clearResourceTimings());
  return { expectedSequence, startRank };
}

async function traverseExpectedSequence(
  page: any,
  direction: "forward" | "backward",
  expectedSequence: string[],
  cadenceMs: number,
) {
  const timings: ImageRenderTiming[] = [];
  let finalCommit: TraversalCommit | null = null;
  for (const [index, expectedId] of expectedSequence.entries()) {
    const step = await traverseAndMeasure(page, direction, index, cadenceMs, expectedId);
    finalCommit = step.commit;
    if (index === expectedSequence.length - 1) {
      await page.evaluate(() => performance.mark("p14:t_stop"));
    }
    timings.push(step.timing);
  }
  if (!finalCommit) throw new Error("P14 traversal committed no steps");
  return { timings, finalCommit };
}

async function getImageNetworkTiming(page: any, imgSrc: string, t0: number): Promise<{ networkMs: number; cacheHit: boolean }> {
  return page.evaluate(({ src, originTime }: { src: string; originTime: number }) => {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const matching = entries.filter(e => src.includes(e.name) || e.name.includes(src.split("?")[0]));
    if (matching.length === 0) return { networkMs: 0, cacheHit: false };
    const latest = matching[matching.length - 1];
    const responseAbsoluteMs = performance.timeOrigin + latest.responseEnd;
    const relativeMs = responseAbsoluteMs - originTime;
    const cacheHit = (latest.transferSize ?? -1) === 0;
    return { networkMs: Math.max(0, Math.round(relativeMs)), cacheHit };
  }, { src: imgSrc, originTime: t0 });
}

function summariseTraversal(timings: ImageRenderTiming[], landing: LandingImageTiming) {
  const rendered = timings.filter(t => t.rendered);
  return {
    renderedCount: rendered.length,
    renderedTotal: timings.length,
    avgRenderMs: rendered.length > 0 ? Math.round(rendered.reduce((s, t) => s + t.renderMs, 0) / rendered.length) : 0,
    maxRenderMs: rendered.length > 0 ? Math.round(Math.max(...rendered.map(t => t.renderMs))) : 0,
    swappedNotRendered: timings.filter(t => t.srcChanged && !t.rendered).length,
    landingAlreadyRendered: landing.alreadyRendered,
    landingRenderMs: Math.round(landing.renderMs),
    landingNetworkMs: Math.round(landing.networkMs),
    landingCacheHit: landing.cacheHit,
    landingRendered: landing.rendered,
  };
}

function logTraversalSummary(id: string, timings: ImageRenderTiming[], landing: LandingImageTiming) {
  const rendered = timings.filter(t => t.rendered);
  const swapped = timings.filter(t => t.srcChanged && !t.rendered);
  const landingStr = landing.alreadyRendered
    ? "already rendered [prefetch hit]"
    : landing.rendered
      ? `${landing.renderMs}ms (network: ${landing.networkMs}ms${landing.cacheHit ? ", cache hit" : ""})`
      : "NOT rendered (5s timeout)";
  console.log(`  [${id}] Images: ${rendered.length}/${timings.length} rendered, ${swapped.length} swapped-not-rendered`);
  if (rendered.length > 0) {
    const avg = Math.round(rendered.reduce((s, t) => s + t.renderMs, 0) / rendered.length);
    console.log(`  [${id}] Render timing: avg=${avg}ms, max=${Math.max(...rendered.map(t => t.renderMs))}ms`);
  }
  console.log(`  [${id}] ★ Landing image: ${landingStr}`);
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
    await installP1BootstrapProbes(kupua);
    await kupua.page.goto(
      STABLE_UNTIL
        ? `/search?nonFree=true&until=${STABLE_UNTIL}`
        : "/search?nonFree=true",
    );
    await kupua.waitForResults();
    await kupua.page.evaluate(() => new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    ));

    const total = (await kupua.getStoreState()).total;
    console.log(`  [P1] total=${total}${STABLE_UNTIL ? `, stable_until=${STABLE_UNTIL}` : ""}`);

    const snap = await collectPerfSnapshot(kupua, "P1: Initial Load");
    const browserTiming = await kupua.page.evaluate(() => ({
      navigation: performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming,
      paints: performance.getEntriesByType("paint").map((entry) => ({
        name: entry.name,
        startTime: entry.startTime,
      })),
    }));
    const navigationTiming = deriveNavigationTiming(browserTiming.navigation, browserTiming.paints);
    logPerfReport("P1: Initial Load", snap);
    emitMetric("P1", snap, {
      scenarioRevision: 2,
      completionBoundary: "first-results-visible-plus-two-frames",
      probeStart: "pre-navigation-init-script",
      ...navigationTiming,
    });

    expect(snap.cls.total).toBeLessThan(0.25);
  });

  // ─── P2: Mousewheel scroll ────────────────────────────────────────
  test("P2: mousewheel scroll — jank, CLS, DOM churn during fast scroll", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    expect(gridBox).not.toBeNull();

    // rAF-based smooth scroll at 50px/frame (~3,000px/s) for 4 seconds.
    // Wheel events rubberband at buffer boundaries because extends take
    // 200-500ms; rAF smooth scroll keeps scroll events flowing continuously.
    console.log(`  [P2] Smooth-scrolling for 4s at 50px/frame (~3,000px/s)...`);
    const gridSelector = '[aria-label="Image results grid"]';
    await kupua.page.evaluate(
      ({ selector, pxPf }: { selector: string; pxPf: number }) => {
        const el = document.querySelector(selector) as HTMLElement;
        if (!el) return;
        const state = { running: true, scrolled: 0, frames: 0 };
        (window as any).__smoothScroll = state;
        function tick() {
          if (!state.running) return;
          const before = el.scrollTop;
          el.scrollTop += pxPf;
          state.scrolled += el.scrollTop - before;
          state.frames++;
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { selector: gridSelector, pxPf: 50 },
    );
    await kupua.page.waitForTimeout(4000);
    const scrollResult = await kupua.page.evaluate(() => {
      const state = (window as any).__smoothScroll;
      if (!state) return { scrolled: 0, frames: 0 };
      state.running = false;
      return { scrolled: Math.round(state.scrolled), frames: state.frames };
    });
    console.log(`  [P2] Scrolled ${scrollResult.scrolled}px in ${scrollResult.frames} frames`);
    await kupua.page.waitForTimeout(2000);

    const snap = await collectPerfSnapshot(kupua, "P2: Fast Scroll");
    logPerfReport("P2: Mousewheel Fast Scroll", snap);
    emitMetric("P2", snap);

    expect(snap.cls.total).toBeLessThan(0.1);
  });

  // ─── P3: Seek buffer replacement (date sort) ─────────────────────
  test("P3: scrubber seek to 50% — reflow and instability during buffer replacement", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    

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

    console.log(`  [P5] Closing left panel while right remains open...`);
    const results = kupua.page.locator('[aria-label="Image results grid"]');
    const widthBeforeClose = await results.evaluate((element) => element.getBoundingClientRect().width);
    await kupua.page.keyboard.press("Alt+[");
    await expect(kupua.page.getByRole("separator", { name: "Resize left panel (double-click to close)" })).toHaveCount(0);
    await expect(kupua.page.getByRole("separator", { name: "Resize right panel (double-click to close)" })).toHaveCount(1);
    await kupua.page.waitForFunction(async (previousWidth: number) => {
      const element = document.querySelector('[aria-label="Image results grid"]');
      if (!element) return false;
      const first = element.getBoundingClientRect();
      if (first.width <= previousWidth) return false;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const second = element.getBoundingClientRect();
      return Math.abs(first.width - second.width) <= 1
        && Math.abs(first.left - second.left) <= 1;
    }, widthBeforeClose, { timeout: 5_000 });
    const widthAfterClose = await results.evaluate((element) => element.getBoundingClientRect().width);

    const snapClose = await collectPerfSnapshot(kupua, "P5c: Left panel closed, right remains open");
    logPerfReport("P5c: Left Panel Close", snapClose);
    emitMetric("P5c", snapClose, {
      scenarioRevision: 2,
      completionBoundary: "left-absent-right-present-stable-results-geometry",
      resultsWidthDeltaPx: Math.round(widthAfterClose - widthBeforeClose),
    });
    await kupua.page.evaluate(() => { (window as any).__perfProbes?.stop(); });
    await kupua.page.keyboard.press("Alt+]");
  });

  // ─── P6: Sort change with focus — "Never Lost" path ───────────────
  test("P6: sort change — CLS and jank during sort-around-focus", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    

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

    const trackBox = await kupua.scrubber.boundingBox();
    expect(trackBox).not.toBeNull();
    const thumbBox = await kupua.scrubberThumb.boundingBox();
    expect(thumbBox).not.toBeNull();
    await kupua.scrubber.hover();
    await kupua.page.waitForFunction(() =>
      (window as any).__kupua_store__?.getState().sortDistribution !== null,
      { timeout: 15_000 },
    );

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(500);
    await resetPerfProbes(kupua);

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

    const snap = await collectPerfSnapshot(kupua, "P7: Scrubber continuous drag");
    logPerfReport("P7: Scrubber Continuous Drag (release excluded)", snap);
    emitMetric("P7", snap, {
      scenarioRevision: 2,
      completionBoundary: "final-pointermove-before-release",
      dragSteps: steps,
      stepIntervalMs: 30,
      releaseExcluded: true,
    });
    await kupua.page.evaluate(() => { (window as any).__perfProbes?.stop(); });
    await kupua.page.mouse.up();
    await kupua.page.waitForFunction(() => {
      const state = (window as any).__kupua_store__?.getState();
      return state && !state.loading && !state._seekInFlight;
    }, { timeout: 30_000 });

    expect(snap.cls.total).toBeLessThan(0.05);
  });

  // ─── P8: Table view scroll with extend/evict ──────────────────────
  test("P8: table scroll — jank during extend + evict cycles", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    

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

    // Turbo scroll: deltaY=400 at 50ms intervals (matching experiments.spec.ts
    // calibration). Smaller deltas than the old 1500px prevent rubberbanding at
    // the buffer boundary — extends arrive before scrollTop exhausts the buffer.
    // 80 events × 400px × 50ms = ~4 seconds of aggressive scroll.
    console.log(`  [P8] Fast table scroll (80 wheel events, 400px @ 50ms)...`);
    for (let i = 0; i < 80; i++) {
      await kupua.page.mouse.wheel(0, 400);
      await kupua.page.waitForTimeout(50);
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

  // ─── P11: Thumbnail reflow — 3 seeks, simplified ──────────────────
  // Measures CLS from images loading after seek lands.
  // Reduced to 3 seek positions (was 5). Credit sort variant → P11b.
  test("P11: thumbnail reflow — CLS from image loading after seek (3 positions)", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = (await kupua.getStoreState()).total;
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

  // ─── P13: Image detail enter/exit ─────────────────────────────────
  // Tests the opacity-0 overlay pattern. Measures: transition jank,
  // scroll position restoration accuracy, CLS on return.
  test("P13: image detail enter/exit — overlay transition and scroll restoration", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    

    // Scroll down a bit so we have a non-trivial scroll position to restore
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    await kupua.page.mouse.move(gridBox!.x + 200, gridBox!.y + 200);
    for (let i = 0; i < 5; i++) {
      await kupua.page.mouse.wheel(0, 600);
      await kupua.page.waitForTimeout(50);
    }
    await kupua.page.waitForTimeout(500);

    const focusedId = await kupua.page.evaluate(() => {
      const getViewportAnchor = (window as any).__kupua_getViewportAnchorId__;
      const id = typeof getViewportAnchor === "function" ? getViewportAnchor() : null;
      const container = document.querySelector('[aria-label="Image results grid"]');
      const cell = id ? container?.querySelector(`[data-image-id="${CSS.escape(id)}"]`) : null;
      const cellRect = cell?.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect();
      if (!id || !cellRect || !containerRect || cellRect.bottom <= containerRect.top || cellRect.top >= containerRect.bottom) {
        throw new Error("P13 app-owned viewport anchor is not visibly rendered");
      }
      return id;
    });
    const targetCell = gridEl.locator(`[data-image-id="${focusedId}"]`);
    const beforePlacement = await targetCell.evaluate((cell) => {
      const container = cell.closest('[aria-label="Image results grid"]');
      if (!container) throw new Error("P13 results container unavailable");
      const cellRect = cell.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return {
        top: cellRect.top - containerRect.top,
        left: cellRect.left - containerRect.left,
      };
    });

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(300);
    await resetPerfProbes(kupua);

    await targetCell.dblclick();
    await kupua.page.waitForFunction((targetId) => {
      const routeId = new URL(location.href).searchParams.get("image");
      const renderedId = document.querySelector("[data-detail-image-id]")?.getAttribute("data-detail-image-id");
      return routeId === targetId && renderedId === targetId;
    }, focusedId, { timeout: 5_000 });
    await kupua.waitForDecodedDetailImage(focusedId!);

    const snapEnter = await collectPerfSnapshot(kupua, "P13: Enter detail");
    logPerfReport("P13a: Enter Image Detail", snapEnter);
    emitMetric("P13a", snapEnter, {
      scenarioRevision: 2,
      completionBoundary: "decoded-stable-detail",
      detailDecoded: true,
    });
    await resetPerfProbes(kupua);

    await kupua.closeDetailViaBackspace();
    await kupua.page.waitForFunction(async (targetId: string) => {
      const store = (window as any).__kupua_store__?.getState();
      const container = document.querySelector('[aria-label="Image results grid"]')
        ?? document.querySelector('[aria-label="Image results table"]');
      const cell = document.querySelector(`[data-image-id="${CSS.escape(targetId)}"]`);
      if (!store || store.focusedImageId !== targetId || !container || !cell) return false;
      const firstCell = cell.getBoundingClientRect();
      const firstContainer = container.getBoundingClientRect();
      if (firstCell.bottom <= firstContainer.top || firstCell.top >= firstContainer.bottom) return false;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const secondCell = cell.getBoundingClientRect();
      const secondContainer = container.getBoundingClientRect();
      return Math.abs(firstCell.top - secondCell.top) <= 1
        && Math.abs(firstCell.left - secondCell.left) <= 1
        && Math.abs(firstContainer.top - secondContainer.top) <= 1
        && Math.abs(firstContainer.left - secondContainer.left) <= 1;
    }, focusedId, { timeout: 10_000 });

    const snapExit = await collectPerfSnapshot(kupua, "P13: Exit detail");
    logPerfReport("P13b: Exit Image Detail", snapExit);
    const afterTop = await kupua.getFocusedCellTop();
    const afterLeft = await kupua.getFocusedCellLeft();
    expect(await kupua.isFocusedCellVisible()).toBe(true);
    emitMetric("P13b", snapExit, {
      scenarioRevision: 2,
      completionBoundary: "visible-stable-focused-destination",
      focusVisible: true,
      focusDriftPx: Math.round((afterTop ?? 0) - beforePlacement.top),
      focusHorizontalDriftPx: Math.round((afterLeft ?? 0) - beforePlacement.left),
    });
  });

  // ─── P14: Image traversal (prev/next) ─────────────────────────────
  // Each cadence is a separate test and therefore a fresh browser context.
  // Exact expected identities are captured from the pinned ordered buffer and
  // validated in memory only; emitted metrics retain no image identity.
  const p14Scenarios = [
    { id: "P14a", label: "normal forward", direction: "forward", steps: 10, cadenceMs: 500, speed: "normal" },
    { id: "P14b", label: "fast forward", direction: "forward", steps: 15, cadenceMs: 200, speed: "fast" },
    { id: "P14c", label: "fast backward", direction: "backward", steps: 10, cadenceMs: 200, speed: "fast" },
    { id: "P14d", label: "rapid discrete forward", direction: "forward", steps: 20, cadenceMs: 80, speed: "rapid" },
  ] as const;

  for (const scenario of p14Scenarios) {
    test(`${scenario.id}: image traversal — ${scenario.label}`, async ({ kupua }) => {
      const setup = await prepareP14Scenario(kupua, scenario.direction, scenario.steps);
      const traversal = await traverseExpectedSequence(
        kupua.page,
        scenario.direction,
        setup.expectedSequence,
        scenario.cadenceMs,
      );
      const landing = await waitForLandingImage(kupua.page, traversal.finalCommit);
      const observationRemaining = Math.max(
        0,
        3_000 - (Date.now() - traversal.finalCommit.committedEpochMs),
      );
      if (observationRemaining > 0) await kupua.page.waitForTimeout(observationRemaining);

      const snap = await collectPerfSnapshot(kupua, `${scenario.id}: ${scenario.label}`);
      const clsEvents = snap.cls.shiftDetails.map((shift) =>
        sanitizeLayoutShift(shift, traversal.finalCommit.committedPerformanceMs)
      );
      logTraversalSummary(scenario.id, traversal.timings, landing);
      logPerfReport(
        `${scenario.id}: ${scenario.label} (${scenario.steps} @ ${scenario.cadenceMs}ms)`,
        snap,
      );
      emitMetric(scenario.id, snap, {
        scenarioRevision: 2,
        cacheClass: "fresh-browser-context",
        startRank: setup.startRank,
        committedSteps: traversal.timings.length,
        traversals: scenario.steps,
        cadenceMs: scenario.cadenceMs,
        speed: scenario.speed,
        direction: scenario.direction,
        clsEvents,
        ...summariseTraversal(traversal.timings, landing),
      });
      expect(traversal.timings).toHaveLength(scenario.steps);
      expect(landing.rendered).toBe(true);
    });
  }

  // ─── P15: Image detail fullscreen persistence ─────────────────────
  // Tests fullscreen persistence across image changes (Fullscreen API).
  // Measures: jank during fullscreen toggle, CLS during image swap in fullscreen.
  test("P15: image detail fullscreen — persists across image traversal", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const startId = await kupua.openDetailForNthItem(3);
    await kupua.waitForDecodedDetailImage(startId);

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(300);
    await resetPerfProbes(kupua);

    await kupua.page.keyboard.press("f");
    await kupua.waitForImageDetailFullscreenState(startId, true);
    await kupua.waitForDecodedDetailImage(startId);

    const snapFsEnter = await collectPerfSnapshot(kupua, "P15: Enter fullscreen");
    logPerfReport("P15a: Enter Fullscreen", snapFsEnter);
    emitMetric("P15a", snapFsEnter, {
      scenarioRevision: 2,
      completionBoundary: "native-fullscreen-decoded-stable-detail",
    });
    await resetPerfProbes(kupua);

    const expectedSequence = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__?.getState();
      const currentId = document.querySelector("[data-detail-image-id]")?.getAttribute("data-detail-image-id");
      const currentPosition = currentId ? store?.imagePositions?.get(currentId) : null;
      if (!store || currentPosition == null) throw new Error("P15 traversal setup unavailable");
      const local = currentPosition - store.bufferOffset;
      const sequence = [store.results[local + 1]?.id, store.results[local + 2]?.id];
      if (sequence.some((id) => !id)) throw new Error("P15 expected traversal sequence unavailable");
      return sequence as string[];
    });
    for (const expectedId of expectedSequence) {
      await kupua.page.keyboard.press("ArrowRight");
      await kupua.page.waitForFunction((targetId) => {
        const routeId = new URL(location.href).searchParams.get("image");
        const renderedId = document.querySelector("[data-detail-image-id]")?.getAttribute("data-detail-image-id");
        return routeId === targetId && renderedId === targetId && document.fullscreenElement !== null;
      }, expectedId, { timeout: 5_000 });
      await kupua.waitForDecodedDetailImage(expectedId);
    }
    const finalId = expectedSequence[expectedSequence.length - 1];

    const snapFsTraverse = await collectPerfSnapshot(kupua, "P15: Fullscreen traverse");
    logPerfReport("P15b: Traverse in Fullscreen", snapFsTraverse);
    emitMetric("P15b", snapFsTraverse, {
      scenarioRevision: 2,
      completionBoundary: "two-decoded-fullscreen-commits",
      traversals: 2,
      committedSteps: expectedSequence.length,
    });
    await resetPerfProbes(kupua);

    await kupua.page.keyboard.press("f");
    await kupua.waitForImageDetailFullscreenState(finalId, false);
    await kupua.waitForDecodedDetailImage(finalId);

    const snapFsExit = await collectPerfSnapshot(kupua, "P15: Exit fullscreen");
    logPerfReport("P15c: Exit Fullscreen", snapFsExit);
    emitMetric("P15c", snapFsExit, {
      scenarioRevision: 2,
      completionBoundary: "app-toggle-native-exit-decoded-stable-windowed-detail",
    });

    await kupua.closeDetailViaBackspace();
  });

  // ─── P16: Table column resize ─────────────────────────────────────
  // Tests CSS-variable width path + canvas measurement.
  // Frame rate during drag should show near-zero React re-renders.
  test("P16: table column resize — drag and double-click fit", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await kupua.switchToTable();
    await expect(kupua.page.locator('[aria-label="Image results table"]')).toBeVisible();

    await injectPerfProbes(kupua);
    await kupua.page.waitForTimeout(300);
    await resetPerfProbes(kupua);

    const handle = kupua.page.getByRole("separator", { name: "Resize Category column" });
    await expect(handle).toHaveCount(1);
    const header = handle.locator("xpath=ancestor::*[@role='columnheader'][1]");
    await expect(header).toHaveCount(1);
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    const widthBeforeDrag = await header.evaluate((element) => element.getBoundingClientRect().width);
    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;

    await kupua.page.mouse.move(startX, startY);
    await kupua.page.mouse.down();
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      await kupua.page.mouse.move(startX + (100 * i) / steps, startY);
      await kupua.page.waitForTimeout(15);
    }
    await kupua.page.mouse.up();
    await expect.poll(
      () => header.evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    ).toBeGreaterThan(Math.round(widthBeforeDrag + 80));
    const widthAfterDrag = await header.evaluate((element) => element.getBoundingClientRect().width);

    const snapDrag = await collectPerfSnapshot(kupua, "P16: Column resize drag");
    logPerfReport("P16a: Column Resize Drag", snapDrag);
    emitMetric("P16a", snapDrag, {
      scenarioRevision: 2,
      completionBoundary: "stable-observed-column-width-after-drag",
      widthDeltaPx: Math.round(widthAfterDrag - widthBeforeDrag),
    });
    await resetPerfProbes(kupua);

    await header.dblclick();
    await expect.poll(
      () => header.evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    ).not.toBe(Math.round(widthAfterDrag));
    const widthAfterFit = await header.evaluate((element) => element.getBoundingClientRect().width);

    const snapAutoFit = await collectPerfSnapshot(kupua, "P16: Column auto-fit");
    logPerfReport("P16b: Column Double-Click Auto-Fit", snapAutoFit);
    emitMetric("P16b", snapAutoFit, {
      scenarioRevision: 2,
      completionBoundary: "stable-observed-column-width-after-auto-fit",
      widthDeltaPx: Math.round(widthAfterFit - widthAfterDrag),
    });
  });
});




