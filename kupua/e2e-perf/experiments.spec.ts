/**
 * Tuning experiments — agent-driven A/B testing of configuration knobs.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  AGENT-DRIVEN, HUMAN-SUPERVISED.                                   ║
 * ║                                                                    ║
 * ║  The agent proposes experiments, the human confirms, the agent     ║
 * ║  runs them with a headed browser while the human watches.          ║
 * ║                                                                    ║
 * ║  Prerequisites:                                                    ║
 * ║    Terminal: ./scripts/start.sh           (local, 10k docs)        ║
 * ║         or: ./scripts/start.sh --use-TEST (real, 1.3M docs)       ║
 * ║                                                                    ║
 * ║  Run:                                                              ║
 * ║    npx playwright test --config playwright.experiments.config.ts   ║
 * ║    npx playwright test --config playwright.experiments.config.ts \ ║
 * ║      -g "E1"                                                       ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  SAFETY: EXPERIMENT VALUE BOUNDS                                   ║
 * ║                                                                    ║
 * ║  When modifying source constants for experiments:                  ║
 * ║    PAGE_SIZE:        50–500   (>500 can trip ES circuit breakers)  ║
 * ║    overscan:         1–30    (>50 freezes the browser)             ║
 * ║    BUFFER_CAPACITY:  500–3000 (>5000 causes GC pauses)            ║
 * ║    EXTEND_THRESHOLD: 10–200   (must be < BUFFER_CAPACITY/2)       ║
 * ║    wheel delta:      100–3000 (>5000 can freeze virtualizer)      ║
 * ║    wheel interval:   ≥30ms    (<10ms is synthetic pathology)      ║
 * ║                                                                    ║
 * ║  Start conservative: halve/double current values, not 10×.        ║
 * ║  See e2e-perf/results/experiments/README.md for full details.     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Each experiment:
 * 1. Records the current git state (commit hash, dirty flag)
 * 2. Records the ES source (local vs real, total doc count)
 * 3. Injects a runtime config override into the page
 * 4. Runs a specific perf scenario (fast scroll, seek, density switch)
 * 5. Collects the full PerfSnapshot (including new probes: flashes,
 *    scroll velocity, network payload)
 * 6. Writes results to e2e-perf/results/experiments/
 *
 * The runtime config override mechanism:
 * - Knobs that are hardcoded constants (overscan, PAGE_SIZE, etc.) cannot
 *   be changed without modifying source and restarting Vite.
 * - For experiments, the agent MODIFIES THE SOURCE FILE, restarts Vite,
 *   runs the test, then REVERTS the change. This is explicit and auditable.
 * - This spec does NOT modify source files itself — it only measures.
 *   The agent modifies files before invoking Playwright, and reverts after.
 *
 * Result format & signal definitions: see e2e-perf/results/experiments/README.md
 */

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../e2e/shared/helpers";
import {
  GRID_ROW_HEIGHT,
  GRID_MIN_CELL_WIDTH,
  TABLE_ROW_HEIGHT,
} from "@/constants/layout";

// Pin to explicit focus mode — experiments use focusNthItem.
test.beforeEach(async ({ kupua }) => {
  await kupua.ensureExplicitMode();
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPERIMENTS_DIR = resolve(__dirname, "results/experiments");
const EXPERIMENT_LOG = resolve(EXPERIMENTS_DIR, "experiments-log.md");

// ---------------------------------------------------------------------------
// Corpus pinning — same fixed cutoff as perf tests so results are stable
// on TEST regardless of when the experiment runs.
// ---------------------------------------------------------------------------

const STABLE_UNTIL = "2026-02-15T23:59:59.999Z";

// ---------------------------------------------------------------------------
// Scroll speed tiers — named constants for reproducible, comparable scenarios.
//
// v2 recalibration: dropped the middle tier (normal @ 100px/150ms was too
// close to slow to produce different behaviour). Added turbo (400px/50ms)
// specifically to push past the buffer edge and trigger extend/evict cycles.
//
// Calibrated to real mouse/trackpad behaviour:
// - A standard mouse wheel notch produces deltaY ≈ 100px.
// - Comfortable scrolling: 3–6 notches/sec.
// - Fast flicking: 8–12 notches/sec, sometimes with 2-notch jumps.
// - Turbo: aggressive trackpad swipe or scroll acceleration — no human does
//   this routinely, but it's realistic for "frustrated user" or "find that
//   image I saw yesterday" bursts.
//
// Playwright's mouse.wheel() dispatches synthetic events without inertia —
// each event scrolls exactly the given delta. This means we model the
// USER's input, not the browser's smooth-scrolled output.
//
// See e2e-perf/results/experiments/README.md "Scroll Speed Tiers" for the
// full table and rationale.
// ---------------------------------------------------------------------------

const SCROLL_SPEEDS = {
  /** Browsing — looking at images while scrolling. 1–2 notches, relaxed pace.
   *  A picture editor scanning for the right image. ~300 px/s */
  slow:   { wheelDelta: 100,  intervalMs: 300 },
  /** Fast flick — power user who knows roughly where the image is.
   *  High-frequency notches or trackpad swipe. ~1,500–2,000 px/s */
  fast:   { wheelDelta: 200,  intervalMs: 100 },
  /** Turbo — aggressive trackpad swipe or scroll acceleration.
   *  Designed to push past the buffer edge and trigger extends.
   *  ~8,000 px/s. Still within safety bounds (delta<5000, interval≥30ms). */
  turbo:  { wheelDelta: 400,  intervalMs: 50  },
} as const;

type ScrollSpeed = keyof typeof SCROLL_SPEEDS;

// ---------------------------------------------------------------------------
// Smooth autoscroll speed tiers — simulates middle-click autoscroll.
//
// v2 recalibration: dropped moderate (8px/frame — too close to gentle to
// produce different behaviour). Added turbo (100px/frame ≈ 6,000 px/s)
// to push far past extend thresholds. Duration increased from 5s to 15s.
//
// Autoscroll (Firefox built-in, Chrome via extensions) is fundamentally
// different from wheel events: it's a CONTINUOUS rAF-driven scrollTop
// increment — no discrete notches, no event dispatching. The browser's
// native scroll engine drives it at 60fps with real smooth motion.
//
// This matters because:
// 1. Wheel events are discrete — the virtualizer processes them in batches.
//    Autoscroll is continuous — every frame has a tiny scrollTop change.
// 2. Autoscroll produces REAL scroll events from the browser engine, not
//    synthetic ones from Playwright. This exercises the exact code path
//    that fires when a real user scrolls.
// 3. Speed is analog — you can dial it from "barely moving" to "flying"
//    by adjusting px/frame. This lets you find the EXACT speed where
//    the virtualizer starts choking.
//
// Implementation: inject a rAF loop in the page that increments
// el.scrollTop by N px per frame. This is exactly what the browser's
// autoscroll does internally. The scroll event handler, virtualizer
// recycling, and extend triggers all fire naturally.
// ---------------------------------------------------------------------------

const SMOOTH_SCROLL_SPEEDS = {
  /** Barely moving — studying each row as it appears. ~1 px/frame at 60fps = ~60 px/s */
  crawl:    { pxPerFrame: 1 },
  /** Gentle drift — reading while scrolling. ~3 px/frame = ~180 px/s */
  gentle:   { pxPerFrame: 3 },
  /** Brisk — scanning headings/thumbnails only. ~20 px/frame = ~1,200 px/s */
  brisk:    { pxPerFrame: 20 },
  /** Fast autoscroll — mouse far from origin. ~50 px/frame = ~3,000 px/s */
  fast:     { pxPerFrame: 50 },
  /** Turbo — push far past extend threshold. ~100 px/frame = ~6,000 px/s.
   *  At 15s duration, this scrolls ~90,000px — enough to exhaust a 1000-item
   *  buffer multiple times and trigger extend/evict cycles. */
  turbo:    { pxPerFrame: 100 },
} as const;

type SmoothScrollSpeed = keyof typeof SMOOTH_SCROLL_SPEEDS;

// ---------------------------------------------------------------------------
// Image traversal speed tiers — for browsing through images in detail view
// or fullscreen mode (ArrowLeft/ArrowRight).
//
// v2 recalibration: dropped normal (1000ms — too close to slow to reveal
// different behaviour). Added rapid (80ms ≈ held-down arrow key, ~12/sec).
// The rapid tier tests image load cancellation: at 80ms per image, almost
// nothing will render — the app should cancel intermediate loads and only
// show the final image cleanly.
//
// Calibrated to how a picture editor reviews images:
// - Slow: studying each image, reading metadata, ~2–3 seconds per image.
// - Fast: flicking through to find the right one, ~5/sec.
// - Rapid: holding arrow key down, ~12/sec — pure cancellation stress test.
// ---------------------------------------------------------------------------

const TRAVERSAL_SPEEDS = {
  /** Studying each image — 2.5s per image. NOT USED in experiments
   *  (every image renders trivially at this speed — measures imgproxy, not app).
   *  Kept as a reference value. */
  glacial:  { intervalMs: 2500 },
  /** Deliberate browsing — reading captions, looking at each one. ~1/sec.
   *  At 1000ms, the 400ms debounced prefetch fires every step. Tests
   *  whether the prefetch pipeline actually works when it has time. */
  slow:     { intervalMs: 1000 },
  /** Moderate browsing — picture editor scanning carefully. ~2/sec.
   *  This is the speed where the prefetch pipeline matters most:
   *  fast enough that you want the next image pre-loaded, slow enough
   *  that a 400ms imgproxy fetch can complete between steps. */
  moderate: { intervalMs: 500 },
  /** Fast flick — scanning through to find a specific image. ~5/sec. */
  fast:     { intervalMs: 200  },
  /** Rapid — holding down the arrow key. ~12/sec.
   *  Most images won't render; tests cancellation and final-image accuracy. */
  rapid:    { intervalMs: 80   },
} as const;

type TraversalSpeed = keyof typeof TRAVERSAL_SPEEDS;

// Ensure output dir exists
if (!existsSync(EXPERIMENTS_DIR)) mkdirSync(EXPERIMENTS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Git state capture
// ---------------------------------------------------------------------------

function getGitState(): { commitHash: string; commitMessage: string; dirty: boolean } {
  try {
    const commitHash = execSync("git rev-parse --short HEAD", { cwd: resolve(__dirname, ".."), encoding: "utf-8" }).trim();
    const commitMessage = execSync("git log -1 --pretty=%s", { cwd: resolve(__dirname, ".."), encoding: "utf-8" }).trim();
    const diffStat = execSync("git diff --stat", { cwd: resolve(__dirname, ".."), encoding: "utf-8" }).trim();
    return { commitHash, commitMessage, dirty: diffStat.length > 0 };
  } catch {
    return { commitHash: "unknown", commitMessage: "unknown", dirty: true };
  }
}

// ---------------------------------------------------------------------------
// ES source detection
// ---------------------------------------------------------------------------

async function getEsInfo(kupua: any): Promise<{ source: "local" | "real"; total: number }> {
  const store = await kupua.getStoreState();
  return {
    source: store.total > 50_000 ? "real" : "local",
    total: store.total,
  };
}

// ---------------------------------------------------------------------------
// Perf probe injection (shared with perf.spec.ts — extracted for reuse)
// ---------------------------------------------------------------------------

// We import the probe infrastructure by re-implementing it here to avoid
// coupling to perf.spec.ts internals. The probes are identical.

async function injectProbes(page: any) {
  await page.evaluate(() => {
    // ── Layout Shift (CLS) ──
    const layoutShifts: any[] = [];
    try {
      const clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as any;
          layoutShifts.push({
            value: e.value, hadRecentInput: e.hadRecentInput,
            sources: (e.sources ?? []).map((s: any) => {
              const el = s.node as Element | null;
              return { tagName: el?.tagName ?? "?", className: (el?.className ?? "").toString().slice(0, 40) };
            }),
            time: e.startTime,
          });
        }
      });
      clsObs.observe({ type: "layout-shift", buffered: true });
    } catch {}

    // ── Long Animation Frames ──
    const longFrames: any[] = [];
    try {
      const loafObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as any;
          longFrames.push({
            duration: e.duration, blockingDuration: e.blockingDuration, startTime: e.startTime,
            scripts: (e.scripts ?? []).map((s: any) => ({
              invoker: s.invoker, duration: s.duration,
              sourceURL: (s.sourceURL ?? "").split("/").pop() ?? "",
            })),
          });
        }
      });
      loafObs.observe({ type: "long-animation-frame", buffered: true });
    } catch {}

    // ── Frame timing + scroll velocity ──
    const frameTimes: number[] = [];
    const scrollVelocities: number[] = [];
    let _rafRunning = true;
    let _lastFrameTime = performance.now();
    let _lastScrollTop = -1;

    function rafLoop(now: number) {
      if (!_rafRunning) return;
      const delta = now - _lastFrameTime;
      frameTimes.push(delta);
      const el = document.querySelector('[aria-label="Image results grid"]') ??
                 document.querySelector('[aria-label="Image results table"]');
      if (el && delta > 0) {
        const y = (el as HTMLElement).scrollTop;
        if (_lastScrollTop >= 0) {
          const v = Math.abs(y - _lastScrollTop) / (delta / 1000);
          if (v > 0) scrollVelocities.push(v);
        }
        _lastScrollTop = y;
      }
      _lastFrameTime = now;
      requestAnimationFrame(rafLoop);
    }
    requestAnimationFrame(rafLoop);

    // ── DOM mutations ──
    const mutationStats = { additions: 0, removals: 0, attributeChanges: 0, totalChurn: 0 };
    const mutObs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          mutationStats.additions += m.addedNodes.length;
          mutationStats.removals += m.removedNodes.length;
        } else if (m.type === "attributes") {
          mutationStats.attributeChanges++;
        }
      }
      mutationStats.totalChurn = mutationStats.additions + mutationStats.removals + mutationStats.attributeChanges;
    });
    mutObs.observe(document.body, { childList: true, subtree: true, attributes: true });

    // ── Blank flash detection ──
    const blankFlashes = { count: 0, totalDurationMs: 0, maxDurationMs: 0, _pending: new Map<Element, number>() };
    function hasContent(row: Element): boolean {
      if (row.querySelector("img")) return true;
      return (row.textContent?.trim() ?? "").length > 10;
    }
    try {
      const scrollEl = document.querySelector('[aria-label="Image results grid"]') ??
                       document.querySelector('[aria-label="Image results table"]');
      if (scrollEl) {
        const flashObs = new IntersectionObserver((entries) => {
          const now = performance.now();
          for (const entry of entries) {
            if (entry.isIntersecting) {
              if (!hasContent(entry.target)) blankFlashes._pending.set(entry.target, now);
            } else {
              if (blankFlashes._pending.has(entry.target)) {
                blankFlashes.count++;
                blankFlashes._pending.delete(entry.target);
              }
            }
          }
        }, { root: scrollEl, threshold: 0 });
        const flashMutObs = new MutationObserver(() => {
          if (blankFlashes._pending.size === 0) return;
          const now = performance.now();
          for (const [row, enteredAt] of blankFlashes._pending) {
            if (hasContent(row)) {
              const d = now - enteredAt;
              blankFlashes.count++;
              blankFlashes.totalDurationMs += d;
              blankFlashes.maxDurationMs = Math.max(blankFlashes.maxDurationMs, d);
              blankFlashes._pending.delete(row);
            }
          }
        });
        flashMutObs.observe(scrollEl, { childList: true, subtree: true, characterData: true });
        const observeRows = () => {
          scrollEl.querySelectorAll('[role="row"]').forEach((row) => flashObs.observe(row));
        };
        observeRows();
        new MutationObserver(() => observeRows()).observe(scrollEl, { childList: true });
      }
    } catch {}

    // ── Network payload ──
    const esRequests: any[] = [];
    const imgproxyRequests: any[] = [];
    try {
      const resObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const re = entry as PerformanceResourceTiming;
          if (re.name.includes("/es/")) {
            esRequests.push({
              url: re.name.split("/es/").pop() ?? re.name,
              transferSize: re.transferSize ?? 0,
              duration: re.duration,
            });
          }
          if (re.name.includes("/imgproxy/") || re.name.includes("/insecure/")) {
            imgproxyRequests.push({
              url: re.name.slice(-80),
              transferSize: re.transferSize ?? 0,
              duration: re.duration,
              cacheHit: (re.transferSize ?? -1) === 0,
            });
          }
        }
      });
      resObs.observe({ type: "resource", buffered: true });
    } catch {}

    (window as any).__expProbes = {
      layoutShifts, longFrames, frameTimes, scrollVelocities,
      mutationStats, blankFlashes, esRequests, imgproxyRequests,
      stop: () => { _rafRunning = false; mutObs.disconnect(); },
    };
  });
}

async function resetProbes(page: any) {
  await page.evaluate(() => {
    const p = (window as any).__expProbes;
    if (!p) return;
    p.layoutShifts.length = 0;
    p.longFrames.length = 0;
    p.frameTimes.length = 0;
    p.scrollVelocities.length = 0;
    p.mutationStats.additions = 0;
    p.mutationStats.removals = 0;
    p.mutationStats.attributeChanges = 0;
    p.mutationStats.totalChurn = 0;
    p.blankFlashes.count = 0;
    p.blankFlashes.totalDurationMs = 0;
    p.blankFlashes.maxDurationMs = 0;
    p.blankFlashes._pending.clear();
    p.esRequests.length = 0;
    p.imgproxyRequests.length = 0;
  });
}

interface ExpSnapshot {
  cls: { total: number; maxSingle: number };
  loaf: { count: number; totalBlockingMs: number; worstMs: number };
  jank: { frameCount: number; severe: number; severePerKFrames: number; maxFrameMs: number; p95FrameMs: number; avgFrameMs: number };
  dom: { totalChurn: number };
  scroll: { maxVelocity: number; avgVelocity: number; samples: number };
  flashes: { count: number; totalDurationMs: number; maxDurationMs: number; pendingCount: number };
  network: { requestCount: number; totalBytes: number; avgBytes: number; avgDurationMs: number };
  imgproxy: { requestCount: number; totalBytes: number; cacheHits: number; avgDurationMs: number };
}

async function collectSnapshot(page: any): Promise<ExpSnapshot> {
  const snap = await page.evaluate(() => {
    const p = (window as any).__expProbes;
    if (!p) return null;

    const unexpectedShifts = p.layoutShifts.filter((s: any) => !s.hadRecentInput);
    const clsTotal = unexpectedShifts.reduce((s: number, e: any) => s + e.value, 0);
    const clsMax = unexpectedShifts.length > 0 ? Math.max(...unexpectedShifts.map((e: any) => e.value)) : 0;

    const totalBlocking = p.longFrames.reduce((s: number, f: any) => s + f.blockingDuration, 0);
    const worstLoaf = p.longFrames.length > 0 ? Math.max(...p.longFrames.map((f: any) => f.duration)) : 0;

    const ft = p.frameTimes as number[];
    const sorted = [...ft].sort((a: number, b: number) => a - b);
    const p95Idx = Math.floor(sorted.length * 0.95);

    const sv = p.scrollVelocities as number[];
    const sortedV = [...sv].sort((a: number, b: number) => a - b);

    const reqs = p.esRequests as any[];
    const totalBytes = reqs.reduce((s: number, r: any) => s + r.transferSize, 0);

    const iReqs = p.imgproxyRequests as any[];
    const iTotalBytes = iReqs.reduce((s: number, r: any) => s + r.transferSize, 0);
    const iCacheHits = iReqs.filter((r: any) => r.cacheHit).length;

    return {
      cls: { total: clsTotal, maxSingle: clsMax },
      loaf: { count: p.longFrames.length, totalBlockingMs: totalBlocking, worstMs: worstLoaf },
      jank: {
        frameCount: ft.length,
        severe: ft.filter((t: number) => t > 50).length,
        severePerKFrames: ft.length > 0
          ? Math.round((ft.filter((t: number) => t > 50).length / ft.length) * 1000 * 10) / 10
          : 0,
        maxFrameMs: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
        p95FrameMs: sorted.length > 0 ? sorted[p95Idx] : 0,
        avgFrameMs: ft.length > 0 ? ft.reduce((s: number, v: number) => s + v, 0) / ft.length : 0,
      },
      dom: { totalChurn: p.mutationStats.additions + p.mutationStats.removals + p.mutationStats.attributeChanges },
      scroll: {
        maxVelocity: sortedV.length > 0 ? sortedV[sortedV.length - 1] : 0,
        avgVelocity: sv.length > 0 ? sv.reduce((s: number, v: number) => s + v, 0) / sv.length : 0,
        samples: sv.length,
      },
      flashes: {
        count: p.blankFlashes.count,
        totalDurationMs: p.blankFlashes.totalDurationMs,
        maxDurationMs: p.blankFlashes.maxDurationMs,
        pendingCount: p.blankFlashes._pending.size,
      },
      network: {
        requestCount: reqs.length,
        totalBytes,
        avgBytes: reqs.length > 0 ? totalBytes / reqs.length : 0,
        avgDurationMs: reqs.length > 0 ? reqs.reduce((s: number, r: any) => s + r.duration, 0) / reqs.length : 0,
      },
      imgproxy: {
        requestCount: iReqs.length,
        totalBytes: iTotalBytes,
        cacheHits: iCacheHits,
        avgDurationMs: iReqs.length > 0 ? iReqs.reduce((s: number, r: any) => s + r.duration, 0) / iReqs.length : 0,
      },
    };
  });
  if (!snap) throw new Error("Experiment probes not installed");
  return snap as ExpSnapshot;
}

// ---------------------------------------------------------------------------
// Probe self-test — verify that each probe actually gathered data.
//
// A probe reading 0 can mean "nothing bad happened" (great!) or "the probe
// never fired because setup was wrong" (silent bug). This function logs
// diagnostics so the agent/human can tell which case applies.
// ---------------------------------------------------------------------------

interface ProbeDiag {
  probe: string;
  ok: boolean;
  detail: string;
}

function diagnoseProbes(snap: ExpSnapshot, scenario: string): ProbeDiag[] {
  const diags: ProbeDiag[] = [];

  // Jank: frameCount should always be > 0 if rAF was running
  diags.push({
    probe: "jank/rAF",
    ok: snap.jank.frameCount > 0,
    detail: snap.jank.frameCount > 0
      ? `${snap.jank.frameCount} frames recorded`
      : "⚠️  0 frames — rAF loop may not have started",
  });

  // Scroll velocity: should have samples if the scenario involves scrolling
  const isScrollScenario = scenario.includes("scroll");
  if (isScrollScenario) {
    diags.push({
      probe: "scroll/velocity",
      ok: snap.scroll.samples > 0,
      detail: snap.scroll.samples > 0
        ? `${snap.scroll.samples} velocity samples (max ${Math.round(snap.scroll.maxVelocity)} px/s)`
        : "⚠️  0 scroll samples — scroll container not found or didn't move",
    });
  }

  // DOM churn: should always be > 0 if MutationObserver is working
  diags.push({
    probe: "dom/mutations",
    ok: snap.dom.totalChurn > 0,
    detail: snap.dom.totalChurn > 0
      ? `${snap.dom.totalChurn} mutations`
      : "⚠️  0 mutations — MutationObserver may not have been connected",
  });

  // Flashes: log what happened for transparency
  const flashDetail = snap.flashes.count > 0
    ? `${snap.flashes.count} flashes detected (max ${snap.flashes.maxDurationMs.toFixed(0)}ms)`
    : snap.flashes.pendingCount > 0
      ? `0 completed flashes but ${snap.flashes.pendingCount} still pending — scenario ended before content arrived`
      : "0 flashes — overscan likely prevents blank rows from entering viewport (this is good!)";
  diags.push({
    probe: "flashes/blank",
    ok: true, // 0 flashes is genuinely possible and fine
    detail: flashDetail,
  });

  // Network: log for context
  diags.push({
    probe: "network/es",
    ok: true,
    detail: snap.network.requestCount > 0
      ? `${snap.network.requestCount} ES requests (${(snap.network.totalBytes / 1024).toFixed(0)}KB)`
      : "0 ES requests — scenario didn't trigger extends (buffer was sufficient)",
  });

  // Imgproxy: log for traversal experiments
  diags.push({
    probe: "network/imgproxy",
    ok: true,
    detail: snap.imgproxy.requestCount > 0
      ? `${snap.imgproxy.requestCount} imgproxy requests (${snap.imgproxy.cacheHits} cache hits, avg ${snap.imgproxy.avgDurationMs.toFixed(0)}ms)`
      : "0 imgproxy requests — no image loads during scenario",
  });

  return diags;
}

function logProbeDiagnostics(diags: ProbeDiag[], experimentId: string) {
  console.log(`\n  ── Probe Self-Test: ${experimentId} ──`);
  for (const d of diags) {
    const icon = d.ok ? "✓" : "✗";
    console.log(`    ${icon} ${d.probe}: ${d.detail}`);
  }
  const broken = diags.filter(d => !d.ok);
  if (broken.length > 0) {
    console.log(`  ⚠️  ${broken.length} probe(s) may not have gathered data — results may be incomplete`);
  } else {
    console.log(`    All probes healthy.`);
  }
}

// ---------------------------------------------------------------------------
// Navigation — always pin the corpus with until= for result stability
// ---------------------------------------------------------------------------

async function gotoExperiment(kupua: any, extraParams?: string) {
  const untilParam = `until=${STABLE_UNTIL}`;
  const extra = extraParams ? `&${extraParams}` : "";
  await kupua.page.goto(`/search?nonFree=true&${untilParam}${extra}`);
  await kupua.waitForResults();
}

// ---------------------------------------------------------------------------
// Result recording
// ---------------------------------------------------------------------------

interface ExperimentResult {
  runId: string;
  timestamp: string;
  commitHash: string;
  commitMessage: string;
  dirty: boolean;
  esSource: "local" | "real";
  esTotal: number;
  experiment: string;
  config: Record<string, unknown>;
  scenario: string;
  snapshot: ExpSnapshot;
  storeState?: Record<string, unknown>;
}

function generateRunId(): string {
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `exp-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function recordResult(result: ExperimentResult) {
  const file = resolve(EXPERIMENTS_DIR, `${result.runId}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2) + "\n");
  console.log(`  📊 Result saved: ${file}`);
}

function appendToLog(line: string) {
  appendFileSync(EXPERIMENT_LOG, line + "\n");
}

// ---------------------------------------------------------------------------
// Jank normalisation — severe jank per 1000 frames.
//
// Slow scenarios record more frames than fast ones (longer measurement
// window), making raw severe counts misleading. Normalising to "per 1000
// frames" gives a directly comparable rate across speed tiers.
// ---------------------------------------------------------------------------

function severePerKFrames(snap: ExpSnapshot): number {
  if (snap.jank.frameCount === 0) return 0;
  return Math.round((snap.jank.severe / snap.jank.frameCount) * 1000 * 10) / 10;
}

// ---------------------------------------------------------------------------
// Scenarios — reusable scroll/seek workflows
//
// Each scenario uses named scroll speed tiers for reproducibility.
// Scroll speed is recorded in the snapshot (scroll.maxVelocity/avgVelocity)
// so comparisons can verify the speeds were similar between runs.
// ---------------------------------------------------------------------------

/**
 * Scroll a container using a named speed tier.
 * @param count Number of wheel events to dispatch
 * @param speed Named speed tier (slow/normal/fast)
 */
async function scrollAtSpeed(
  page: any,
  containerSelector: string,
  count: number,
  speed: ScrollSpeed,
) {
  const { wheelDelta, intervalMs } = SCROLL_SPEEDS[speed];
  const container = page.locator(containerSelector);
  const box = await container.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }
  for (let i = 0; i < count; i++) {
    await page.mouse.wheel(0, wheelDelta);
    await page.waitForTimeout(intervalMs);
  }
}

/**
 * Smooth autoscroll — injects a rAF loop that continuously increments
 * scrollTop by a fixed amount per frame. This is exactly what the browser's
 * built-in autoscroll (middle-click) does internally.
 *
 * Returns the actual distance scrolled and the number of frames executed.
 * The rAF loop runs inside the page context (real browser timing), and
 * Playwright waits on the Node side for the specified duration.
 *
 * @param durationMs How long the autoscroll runs (ms)
 * @param pxPerFrame How many pixels to scroll per animation frame
 */
async function smoothScrollFor(
  page: any,
  containerSelector: string,
  durationMs: number,
  pxPerFrame: number,
): Promise<{ scrolled: number; frames: number; actualPxPerFrame: number }> {
  // Inject the rAF loop into the page — it runs at the browser's native
  // frame rate, producing real scroll events (not synthetic ones).
  await page.evaluate(
    ({ selector, pxPf }: { selector: string; pxPf: number }) => {
      const el = document.querySelector(selector) as HTMLElement;
      if (!el) return;
      const state = { running: true, scrolled: 0, frames: 0 };
      (window as any).__smoothScroll = state;
      function tick() {
        if (!state.running) return;
        const before = el.scrollTop;
        el.scrollTop += pxPf;
        state.scrolled += el.scrollTop - before; // actual delta (may be clamped)
        state.frames++;
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    },
    { selector: containerSelector, pxPf: pxPerFrame },
  );

  // Wait for the desired duration on the Node side
  await page.waitForTimeout(durationMs);

  // Stop the rAF loop and collect results
  const result = await page.evaluate(() => {
    const state = (window as any).__smoothScroll;
    if (!state) return { scrolled: 0, frames: 0, actualPxPerFrame: 0 };
    state.running = false;
    const actualPxPerFrame = state.frames > 0 ? state.scrolled / state.frames : 0;
    return {
      scrolled: Math.round(state.scrolled),
      frames: state.frames,
      actualPxPerFrame: Math.round(actualPxPerFrame * 10) / 10,
    };
  });

  return result;
}

async function scenarioSmoothScroll(
  kupua: any,
  page: any,
  view: "table" | "grid",
  speed: SmoothScrollSpeed,
  durationMs = 5000,
): Promise<{ snapshot: ExpSnapshot; scrolled: number; frames: number; actualPxPerFrame: number }> {
  await gotoExperiment(kupua);
  if (view === "table") {
    await kupua.switchToTable();
  } else {
    await kupua.switchToGrid();
  }
  await injectProbes(page);
  await page.waitForTimeout(300);
  await resetProbes(page);

  const selector = view === "table"
    ? '[aria-label="Image results table"]'
    : '[aria-label="Image results grid"]';

  const { pxPerFrame } = SMOOTH_SCROLL_SPEEDS[speed];
  const scrollResult = await smoothScrollFor(page, selector, durationMs, pxPerFrame);

  // Let things settle
  await page.waitForTimeout(1000);

  const snapshot = await collectSnapshot(page);
  return { snapshot, ...scrollResult };
}

async function scenarioTableScroll(
  kupua: any,
  page: any,
  speed: ScrollSpeed,
  wheelCount = 30,
): Promise<ExpSnapshot> {
  await gotoExperiment(kupua);
  await kupua.switchToTable();
  await injectProbes(page);
  await page.waitForTimeout(300);
  await resetProbes(page);

  await scrollAtSpeed(page, '[aria-label="Image results table"]', wheelCount, speed);
  await page.waitForTimeout(1000);

  return collectSnapshot(page);
}

async function scenarioGridScroll(
  kupua: any,
  page: any,
  speed: ScrollSpeed,
  wheelCount = 30,
): Promise<ExpSnapshot> {
  await gotoExperiment(kupua);
  await kupua.switchToGrid();
  await injectProbes(page);
  await page.waitForTimeout(300);
  await resetProbes(page);

  await scrollAtSpeed(page, '[aria-label="Image results grid"]', wheelCount, speed);
  await page.waitForTimeout(1000);

  return collectSnapshot(page);
}

async function scenarioDensitySwitch(kupua: any, page: any): Promise<ExpSnapshot> {
  await gotoExperiment(kupua);
  await injectProbes(page);
  await page.waitForTimeout(300);

  // Seek to middle, focus, then toggle 4 times
  await kupua.seekTo(0.5);
  await kupua.focusNthItem(3);
  await resetProbes(page);

  for (let i = 0; i < 4; i++) {
    if (await kupua.isGridView()) {
      await kupua.switchToTable();
    } else {
      await kupua.switchToGrid();
    }
    await page.waitForTimeout(500);
  }

  return collectSnapshot(page);
}

// ---------------------------------------------------------------------------
// Image render timing — detects when each image fully renders during
// traversal (ArrowLeft/ArrowRight in detail or fullscreen view).
//
// Strategy: after each key press, poll the <img> in the detail view.
// Record two timestamps:
//   - srcChanged: when img.src changes (URL swap — React committed the new image)
//   - rendered:   when img.complete && img.naturalWidth > 0 (bytes decoded + painted)
//
// This lets us measure:
//   - Time-to-swap: how long React takes to commit the new URL
//   - Time-to-render: how long from key press until the image is visible
//   - Whether the image rendered at all (timeout = still loading when we moved on)
// ---------------------------------------------------------------------------

interface ImageRenderTiming {
  index: number;
  direction: "forward" | "backward";
  srcChanged: boolean;
  srcChangeMs: number;     // ms from key press until img.src changed
  rendered: boolean;
  renderMs: number;        // ms from key press until img.complete + naturalWidth > 0
  finalSrc: string;        // last 60 chars of the src (for debugging)
}

/**
 * Press an arrow key and measure how long until the image in the detail view
 * fully renders. Returns timing data for this single traversal step.
 *
 * @param maxWaitMs Maximum time to wait for render after key press.
 *   For slow traversal this should be generous (the user is waiting).
 *   For fast traversal this should match the traversal interval (we move on).
 */
async function traverseAndMeasure(
  page: any,
  direction: "forward" | "backward",
  index: number,
  maxWaitMs: number,
): Promise<ImageRenderTiming> {
  // Capture current img src before pressing the key
  const srcBefore = await page.evaluate(() => {
    const img = document.querySelector('.flex-1 img[draggable="false"]') as HTMLImageElement | null;
    return img?.src ?? "";
  });

  const key = direction === "forward" ? "ArrowRight" : "ArrowLeft";
  const t0 = Date.now();
  await page.keyboard.press(key);

  let srcChanged = false;
  let srcChangeMs = 0;
  let rendered = false;
  let renderMs = 0;
  let finalSrc = "";

  // Poll at ~30ms intervals until maxWaitMs
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
      finalSrc = status.src.slice(-60);
      break;  // Image is fully rendered — done polling
    }

    await page.waitForTimeout(pollInterval);
  }

  // Capture final state if we timed out
  if (!rendered) {
    const finalStatus = await page.evaluate((prevSrc: string) => {
      const img = document.querySelector('.flex-1 img[draggable="false"]') as HTMLImageElement | null;
      return {
        src: img?.src?.slice(-60) ?? "",
        changed: img?.src !== prevSrc,
        complete: img?.complete ?? false,
        hasSize: (img?.naturalWidth ?? 0) > 0,
      };
    }, srcBefore);
    finalSrc = finalStatus.src;
    if (finalStatus.changed && !srcChanged) {
      srcChanged = true;
      srcChangeMs = Date.now() - t0;
    }
    if (finalStatus.changed && finalStatus.complete && finalStatus.hasSize) {
      rendered = true;
      renderMs = Date.now() - t0;
    }
  }

  return { index, direction, srcChanged, srcChangeMs, rendered, renderMs, finalSrc };
}

interface TraversalResult {
  speed: string;
  mode: "detail" | "fullscreen";
  direction: "forward" | "backward" | "mixed";
  steps: number;
  timings: ImageRenderTiming[];
  snapshot: ExpSnapshot;
  /** How many images actually rendered before we moved on */
  renderedCount: number;
  /** Average render time for images that DID render (ms) */
  avgRenderMs: number;
  /** Max render time (ms) */
  maxRenderMs: number;
  /** How many images had their src swapped but didn't render in time */
  swappedButNotRendered: number;
  /** Timing for the LANDING image — the one the user actually sees after stopping. */
  landingImage: LandingImageTiming;
}

/**
 * Landing image timing — the most important measurement in traversal.
 *
 * When a user flicks through 20 images rapidly, the only image that
 * matters is the one they LAND on. This measures two things:
 *
 * 1. renderMs — time until img.complete + naturalWidth > 0 (decoded + painted).
 *    This is what the user sees. THE number.
 *
 * 2. networkMs — time until the HTTP response finished (PerformanceResourceTiming).
 *    This is the imgproxy contribution. renderMs - networkMs ≈ decode + paint time.
 *    Useful for imgproxy tuning without confounding browser decode cost.
 */
interface LandingImageTiming {
  /** Was the landing image already rendered when traversal stopped? */
  alreadyRendered: boolean;
  /** Time from traversal-stop until img.complete + naturalWidth > 0 (ms). 0 if alreadyRendered. */
  renderMs: number;
  /** Time from traversal-stop until HTTP response finished (ms). 0 if already loaded or not measurable. */
  networkMs: number;
  /** Was the image fully rendered within the timeout? */
  rendered: boolean;
  /** Was the image served from browser cache? (transferSize === 0 in PerformanceResourceTiming) */
  cacheHit: boolean;
  /** Final img src (last 60 chars) for debugging. */
  finalSrc: string;
}

/**
 * After traversal stops, measure how long until the current image renders.
 * This is the user-perceived "landing latency" — the most important number.
 *
 * Also captures network timing from PerformanceResourceTiming to isolate
 * imgproxy latency from browser decode/paint time.
 *
 * @param maxWaitMs Maximum time to wait (generous — user will wait for this).
 */
async function waitForLandingImage(
  page: any,
  maxWaitMs = 5000,
): Promise<LandingImageTiming> {
  const t0 = Date.now();
  const pollInterval = 20;

  // Check if it's already rendered
  const initial = await page.evaluate(() => {
    const img = document.querySelector('.flex-1 img[draggable="false"]') as HTMLImageElement | null;
    if (!img) return { complete: false, hasSize: false, src: "" };
    return {
      complete: img.complete,
      hasSize: img.naturalWidth > 0 && img.naturalHeight > 0,
      src: img.src ?? "",
    };
  });

  if (initial.complete && initial.hasSize) {
    return { alreadyRendered: true, renderMs: 0, networkMs: 0, rendered: true, cacheHit: true, finalSrc: initial.src.slice(-60) };
  }

  // Capture the src we're waiting for (it may change during polling if React
  // is still committing — we want the FINAL src)
  let landingSrc = initial.src;

  // Poll until rendered or timeout
  const deadline = t0 + maxWaitMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(pollInterval);
    const status = await page.evaluate(() => {
      const img = document.querySelector('.flex-1 img[draggable="false"]') as HTMLImageElement | null;
      if (!img) return { complete: false, hasSize: false, src: "" };
      return {
        complete: img.complete,
        hasSize: img.naturalWidth > 0 && img.naturalHeight > 0,
        src: img.src ?? "",
      };
    });
    landingSrc = status.src;
    if (status.complete && status.hasSize) {
      const renderMs = Date.now() - t0;
      // Now grab network timing for this specific image URL
      const netInfo = await getImageNetworkInfo(page, landingSrc, t0);
      return {
        alreadyRendered: false,
        renderMs,
        networkMs: netInfo.networkMs,
        rendered: true,
        cacheHit: netInfo.cacheHit,
        finalSrc: landingSrc.slice(-60),
      };
    }
  }

  // Timed out
  const finalSrc = await page.evaluate(() => {
    const img = document.querySelector('.flex-1 img[draggable="false"]') as HTMLImageElement | null;
    return img?.src ?? "";
  });
  return { alreadyRendered: false, renderMs: maxWaitMs, networkMs: 0, rendered: false, cacheHit: false, finalSrc: finalSrc.slice(-60) };
}

/**
 * Extract network duration and cache-hit status for a specific image URL from PerformanceResourceTiming.
 * Returns the time from t0 until the response finished, and whether it was a cache hit.
 */
async function getImageNetworkInfo(page: any, imgSrc: string, t0: number): Promise<{ networkMs: number; cacheHit: boolean }> {
  return page.evaluate(({ src, originTime }: { src: string; originTime: number }) => {
    // PerformanceResourceTiming entries use performance.now() timebase
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    // Find the most recent entry matching this URL
    const matching = entries.filter(e => src.includes(e.name) || e.name.includes(src.split("?")[0]));
    if (matching.length === 0) return { networkMs: 0, cacheHit: false };
    const latest = matching[matching.length - 1];
    // responseEnd is in performance.now() timebase (ms since page load)
    // We need time relative to our measurement start (t0 in Date.now() timebase)
    // Convert: performance.timeOrigin + responseEnd = absolute time
    const responseAbsoluteMs = performance.timeOrigin + latest.responseEnd;
    const relativeMs = responseAbsoluteMs - originTime;
    // transferSize === 0 means served from browser cache (no network transfer)
    const cacheHit = (latest.transferSize ?? -1) === 0;
    return { networkMs: Math.max(0, Math.round(relativeMs)), cacheHit };
  }, { src: imgSrc, originTime: t0 });
}

/** Enter detail view by opening the Nth image. */
async function enterDetailView(kupua: any, imageIndex = 3) {
  await kupua.focusNthItem(imageIndex);
  if (await kupua.isGridView()) {
    const cells = kupua.page.locator('[aria-label="Image results grid"] [class*="cursor-pointer"]');
    await cells.nth(imageIndex).dblclick();
  } else {
    const rows = kupua.page.locator('[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]');
    await rows.nth(imageIndex).dblclick();
  }
  // Wait for initial image to load
  await kupua.page.waitForTimeout(1500);
}

async function scenarioImageTraversal(
  kupua: any,
  page: any,
  speed: TraversalSpeed,
  mode: "detail" | "fullscreen",
  direction: "forward" | "backward",
  steps: number,
): Promise<TraversalResult> {
  await gotoExperiment(kupua);

  await enterDetailView(kupua);

  if (mode === "fullscreen") {
    await page.keyboard.press("f");
    await page.waitForTimeout(800);
  }

  await injectProbes(page);
  await page.waitForTimeout(300);
  await resetProbes(page);

  const { intervalMs } = TRAVERSAL_SPEEDS[speed];
  const timings: ImageRenderTiming[] = [];

  for (let i = 0; i < steps; i++) {
    const timing = await traverseAndMeasure(
      page,
      direction,
      i,
      intervalMs, // max wait = time until next key press
    );
    timings.push(timing);

    // Log each step for real-time visibility
    const renderStr = timing.rendered
      ? `rendered in ${timing.renderMs}ms`
      : timing.srcChanged
        ? `src swapped at ${timing.srcChangeMs}ms but not rendered`
        : `no src change`;
    console.log(`    [${i + 1}/${steps}] ${renderStr}`);

    // If we rendered before the interval, wait the remaining time
    // (the polling loop may have returned early)
    const elapsed = timing.rendered ? timing.renderMs : intervalMs;
    const remaining = intervalMs - elapsed;
    if (remaining > 0) {
      await page.waitForTimeout(remaining);
    }
  }

  // Measure landing image — THE most important measurement.
  // How long does the user wait to see the image they landed on?
  const landingImage = await waitForLandingImage(page, 5000);
  const landingStr = landingImage.alreadyRendered
    ? "already rendered"
    : landingImage.rendered
      ? `rendered in ${landingImage.renderMs}ms (network: ${landingImage.networkMs}ms, decode+paint: ${Math.max(0, landingImage.renderMs - landingImage.networkMs)}ms)`
      : `NOT rendered after 5s`;
  console.log(`    [LANDING] ${landingStr}`);

  // Brief settle for probes to finalise
  await page.waitForTimeout(500);

  const snapshot = await collectSnapshot(page);

  // Exit fullscreen if needed
  if (mode === "fullscreen") {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
  // Exit detail
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(500);

  // Compute summary stats
  const renderedTimings = timings.filter(t => t.rendered);
  const renderedCount = renderedTimings.length;
  const avgRenderMs = renderedCount > 0
    ? renderedTimings.reduce((s, t) => s + t.renderMs, 0) / renderedCount
    : 0;
  const maxRenderMs = renderedCount > 0
    ? Math.max(...renderedTimings.map(t => t.renderMs))
    : 0;
  const swappedButNotRendered = timings.filter(t => t.srcChanged && !t.rendered).length;

  return {
    speed: speed as string,
    mode,
    direction,
    steps,
    timings,
    snapshot,
    renderedCount,
    avgRenderMs,
    maxRenderMs,
    swappedButNotRendered,
    landingImage,
  };
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

test.describe("Tuning Experiments", () => {
  // Generous timeout — E6 smooth scroll runs 15s × 3 tiers × 2 views + settle
  test.describe.configure({ timeout: 300_000 });

  /**
   * E1: Table scroll at all three speed tiers.
   *
   * Measures blank flashes vs jank at the current overscan value.
   * To test different overscan values, the agent must modify source before
   * running and revert after. See README workflow.
   *
   * Runs slow → fast → turbo sequentially. Each produces a separate result
   * JSON so we can compare the same knob across interaction speeds.
   */
  test("E1: table scroll — slow/fast/turbo", async ({ kupua }) => {
    const git = getGitState();
    const overscanValue = process.env["EXP_OVERSCAN_TABLE"] ?? "current";

    for (const speed of ["slow", "fast", "turbo"] as ScrollSpeed[]) {
      // Target ~5s measurement window per tier. This ensures:
      // - Comparable frame counts across speeds (normalised jank)
      // - Enough scroll distance to trigger extends at all speeds
      //   slow: 15 × 100px = 1,500px (borderline, may not extend)
      //   fast: 50 × 200px = 10,000px (will extend)
      //   turbo: 100 × 400px = 40,000px (many extends)
      const { intervalMs } = SCROLL_SPEEDS[speed];
      const wheelCount = Math.round(5000 / intervalMs);
      const totalDelta = wheelCount * SCROLL_SPEEDS[speed].wheelDelta;

      const snap = await scenarioTableScroll(kupua, kupua.page, speed, wheelCount);
      const store = await kupua.getStoreState();
      const es = await getEsInfo(kupua);
      const runId = generateRunId();

      const scenarioName = `table-${speed}-scroll-${wheelCount}-wheels`;

      console.log(`\n  ── E1: Table Scroll (${speed}) ──`);
      console.log(`  Commit: ${git.commitHash} ${git.dirty ? "(dirty)" : ""}`);
      console.log(`  ES: ${es.source} (${es.total.toLocaleString()} docs)`);
      console.log(`  Corpus pinned: until=${STABLE_UNTIL}`);
      console.log(`  Speed tier: ${speed} (delta=${SCROLL_SPEEDS[speed].wheelDelta}px, interval=${intervalMs}ms, ${wheelCount} events, ~${totalDelta}px total)`);
      console.log(`  Results:`);
      console.log(`    Blank flashes:  ${snap.flashes.count} (max ${snap.flashes.maxDurationMs.toFixed(0)}ms)`);
      console.log(`    Severe jank:    ${snap.jank.severe} (${severePerKFrames(snap)}/1k frames)`);
      console.log(`    Max frame:      ${snap.jank.maxFrameMs.toFixed(0)}ms`);
      console.log(`    P95 frame:      ${snap.jank.p95FrameMs.toFixed(0)}ms`);
      console.log(`    DOM churn:      ${snap.dom.totalChurn}`);
      console.log(`    Scroll velocity: max=${Math.round(snap.scroll.maxVelocity)}px/s avg=${Math.round(snap.scroll.avgVelocity)}px/s`);
      console.log(`    ES requests:    ${snap.network.requestCount} (${(snap.network.totalBytes / 1024).toFixed(0)}KB total)`);
      console.log(`    Extends:        prepend=${store.prependGeneration} fwdEvict=${store.forwardEvictGeneration}`);

      // Probe self-test
      const diags = diagnoseProbes(snap, scenarioName);
      logProbeDiagnostics(diags, `E1-${speed}`);

      recordResult({
        runId, timestamp: new Date().toISOString(),
        commitHash: git.commitHash, commitMessage: git.commitMessage, dirty: git.dirty,
        esSource: es.source, esTotal: es.total,
        experiment: `E1-table-${speed}-scroll`,
        config: { overscan_table: overscanValue, speed, wheelCount, totalDelta, stableUntil: STABLE_UNTIL },
        scenario: scenarioName,
        snapshot: snap,
        storeState: {
          prependGeneration: store.prependGeneration,
          forwardEvictGeneration: store.forwardEvictGeneration,
          bufferOffset: store.bufferOffset,
          resultsLength: store.resultsLength,
        },
      });

      // Brief pause between speed tiers
      await kupua.page.waitForTimeout(500);
    }
  });

  test("E2: grid scroll — slow/fast/turbo", async ({ kupua }) => {
    const git = getGitState();
    const overscanValue = process.env["EXP_OVERSCAN_GRID"] ?? "current";

    for (const speed of ["slow", "fast", "turbo"] as ScrollSpeed[]) {
      // Target ~5s measurement window (same logic as E1)
      const { intervalMs } = SCROLL_SPEEDS[speed];
      const wheelCount = Math.round(5000 / intervalMs);
      const totalDelta = wheelCount * SCROLL_SPEEDS[speed].wheelDelta;

      const snap = await scenarioGridScroll(kupua, kupua.page, speed, wheelCount);
      const store = await kupua.getStoreState();
      const es = await getEsInfo(kupua);
      const runId = generateRunId();

      const scenarioName = `grid-${speed}-scroll-${wheelCount}-wheels`;

      console.log(`\n  ── E2: Grid Scroll (${speed}) ──`);
      console.log(`  Commit: ${git.commitHash} ${git.dirty ? "(dirty)" : ""}`);
      console.log(`  ES: ${es.source} (${es.total.toLocaleString()} docs)`);
      console.log(`  Corpus pinned: until=${STABLE_UNTIL}`);
      console.log(`  Speed tier: ${speed} (delta=${SCROLL_SPEEDS[speed].wheelDelta}px, interval=${intervalMs}ms, ${wheelCount} events, ~${totalDelta}px total)`);
      console.log(`  Results:`);
      console.log(`    Blank flashes:  ${snap.flashes.count} (max ${snap.flashes.maxDurationMs.toFixed(0)}ms)`);
      console.log(`    Severe jank:    ${snap.jank.severe} (${severePerKFrames(snap)}/1k frames)`);
      console.log(`    Max frame:      ${snap.jank.maxFrameMs.toFixed(0)}ms`);
      console.log(`    P95 frame:      ${snap.jank.p95FrameMs.toFixed(0)}ms`);
      console.log(`    DOM churn:      ${snap.dom.totalChurn}`);
      console.log(`    Scroll velocity: max=${Math.round(snap.scroll.maxVelocity)}px/s avg=${Math.round(snap.scroll.avgVelocity)}px/s`);
      console.log(`    ES requests:    ${snap.network.requestCount} (${(snap.network.totalBytes / 1024).toFixed(0)}KB total)`);
      console.log(`    Extends:        prepend=${store.prependGeneration} fwdEvict=${store.forwardEvictGeneration}`);

      // Probe self-test
      const diags = diagnoseProbes(snap, scenarioName);
      logProbeDiagnostics(diags, `E2-${speed}`);

      recordResult({
        runId, timestamp: new Date().toISOString(),
        commitHash: git.commitHash, commitMessage: git.commitMessage, dirty: git.dirty,
        esSource: es.source, esTotal: es.total,
        experiment: `E2-grid-${speed}-scroll`,
        config: { overscan_grid: overscanValue, speed, wheelCount, totalDelta, stableUntil: STABLE_UNTIL },
        scenario: scenarioName,
        snapshot: snap,
        storeState: {
          prependGeneration: store.prependGeneration,
          forwardEvictGeneration: store.forwardEvictGeneration,
          bufferOffset: store.bufferOffset,
          resultsLength: store.resultsLength,
        },
      });

      // Brief pause between speed tiers
      await kupua.page.waitForTimeout(500);
    }
  });

  test("E3: density switch baseline", async ({ kupua }) => {
    const git = getGitState();

    const snap = await scenarioDensitySwitch(kupua, kupua.page);
    const store = await kupua.getStoreState();
    const es = await getEsInfo(kupua);
    const runId = generateRunId();

    const scenarioName = "seek-50-focus-toggle-4x";

    console.log(`\n  ── E3: Density Switch ──`);
    console.log(`  Commit: ${git.commitHash} ${git.dirty ? "(dirty)" : ""}`);
    console.log(`  ES: ${es.source} (${es.total.toLocaleString()} docs)`);
    console.log(`  Corpus pinned: until=${STABLE_UNTIL}`);
    console.log(`  Results:`);
    console.log(`    CLS:            ${snap.cls.total.toFixed(4)}`);
    console.log(`    Blank flashes:  ${snap.flashes.count}`);
    console.log(`    Severe jank:    ${snap.jank.severe} (${severePerKFrames(snap)}/1k frames)`);
    console.log(`    Max frame:      ${snap.jank.maxFrameMs.toFixed(0)}ms`);
    console.log(`    DOM churn:      ${snap.dom.totalChurn}`);
    console.log(`    Extends:        prepend=${store.prependGeneration} fwdEvict=${store.forwardEvictGeneration}`);

    // Probe self-test
    const diags = diagnoseProbes(snap, scenarioName);
    logProbeDiagnostics(diags, "E3");

    recordResult({
      runId, timestamp: new Date().toISOString(),
      commitHash: git.commitHash, commitMessage: git.commitMessage, dirty: git.dirty,
      esSource: es.source, esTotal: es.total,
      experiment: "E3-density-switch",
      config: { stableUntil: STABLE_UNTIL },
      scenario: scenarioName,
      snapshot: snap,
      storeState: {
        prependGeneration: store.prependGeneration,
        forwardEvictGeneration: store.forwardEvictGeneration,
        bufferOffset: store.bufferOffset,
        resultsLength: store.resultsLength,
        focusedImageId: store.focusedImageId,
      },
    });
  });

  /**
   * E4: Image detail traversal — slow/moderate/fast/rapid.
   *
   * Measures per-image render timing in the detail (non-fullscreen) view.
   * Key questions: does the app correctly cancel intermediate loads? And
   * THE most important: how fast does the LANDING image render after the
   * user stops traversing?
   *
   * slow tier dropped — at 2500ms interval every image renders trivially;
   * it measures imgproxy latency, not app behaviour.
   *
   * moderate tier (500ms) added to capture the prefetch pipeline effect:
   * at this speed, a prefetch has ~500ms to complete between steps.
   * If the pipeline is working, images should be cache hits.
   *
   * Records per-step timing: srcChangeMs (React commits URL) and renderMs
   * (image bytes decoded + painted). Landing image timing recorded
   * separately with a generous 5s timeout.
   *
   * Browser cache is cleared before EACH speed tier to prevent cross-tier
   * contamination. Without this, moderate warms the cache for fast, and
   * fast warms it for rapid — making later tiers appear artificially fast.
   * See exploration/docs/zz Archive/traversal-perf-investigation.md for the full
   * analysis that motivated this (Phase 1 baseline showed 100% cache hits
   * on E4-fast because E4-moderate had warmed the same images).
   */
  test("E4: image detail traversal — slow/moderate/fast/rapid", async ({ kupua }) => {
    const git = getGitState();

    for (const speed of ["slow", "moderate", "fast", "rapid"] as (keyof typeof TRAVERSAL_SPEEDS)[]) {
      // Clear browser cache before each tier so results are independent.
      // Speed tiers traverse overlapping images (all start near image 3),
      // so without this, earlier tiers warm the cache for later ones.
      const cdp = await kupua.page.context().newCDPSession(kupua.page);
      await cdp.send("Network.clearBrowserCache");
      await cdp.detach();
      console.log(`  🧹 Browser cache cleared before E4-${speed}`);

      const steps = speed === "rapid" ? 20 : speed === "slow" ? 8 : speed === "moderate" ? 10 : 12;

      console.log(`\n  ── E4: Image Detail Traversal (${speed}, ${steps} images forward) ──`);
      console.log(`  Interval: ${TRAVERSAL_SPEEDS[speed].intervalMs}ms per image`);

      const result = await scenarioImageTraversal(
        kupua, kupua.page, speed, "detail", "forward", steps,
      );
      const es = await getEsInfo(kupua);

      const cacheTag = result.landingImage.cacheHit ? " [CACHE HIT]" : "";
      const landingStr = result.landingImage.alreadyRendered
        ? "already rendered when traversal stopped [CACHE HIT]"
        : result.landingImage.rendered
          ? `${result.landingImage.renderMs}ms total (network: ${result.landingImage.networkMs}ms, decode+paint: ${Math.max(0, result.landingImage.renderMs - result.landingImage.networkMs)}ms)${cacheTag}`
          : "NOT rendered (5s timeout)";

      console.log(`  Summary:`);
      console.log(`    ★ Landing image: ${landingStr}`);
      console.log(`    Rendered:      ${result.renderedCount}/${result.steps} images`);
      console.log(`    Avg render:    ${result.avgRenderMs.toFixed(0)}ms`);
      console.log(`    Max render:    ${result.maxRenderMs.toFixed(0)}ms`);
      console.log(`    Swapped but not rendered: ${result.swappedButNotRendered}`);
      console.log(`    Jank severe:   ${result.snapshot.jank.severe} (${severePerKFrames(result.snapshot)}/1k frames)`);
      console.log(`    CLS:           ${result.snapshot.cls.total.toFixed(4)}`);
      console.log(`    Imgproxy:      ${result.snapshot.imgproxy.requestCount} requests (${result.snapshot.imgproxy.cacheHits} cache hits, avg ${result.snapshot.imgproxy.avgDurationMs.toFixed(0)}ms)`);

      // Probe self-test
      const diags = diagnoseProbes(result.snapshot, `detail-${speed}-traverse`);
      logProbeDiagnostics(diags, `E4-${speed}`);

      const runId = generateRunId();
      recordResult({
        runId, timestamp: new Date().toISOString(),
        commitHash: git.commitHash, commitMessage: git.commitMessage, dirty: git.dirty,
        esSource: es.source, esTotal: es.total,
        experiment: `E4-detail-${speed}-traverse`,
        config: { speed, stableUntil: STABLE_UNTIL, mode: "detail", direction: "forward" },
        scenario: `detail-${speed}-traverse-${steps}-fwd`,
        snapshot: result.snapshot,
        storeState: {
          landingImage: result.landingImage,
          renderedCount: result.renderedCount,
          avgRenderMs: Math.round(result.avgRenderMs),
          maxRenderMs: Math.round(result.maxRenderMs),
          swappedButNotRendered: result.swappedButNotRendered,
          timings: result.timings.map(t => ({
            i: t.index,
            srcMs: t.srcChangeMs,
            renderMs: t.renderMs,
            rendered: t.rendered,
          })),
        },
      });

      await kupua.page.waitForTimeout(500);
    }
  });

  /**
   * E5: Fullscreen traversal — slow/moderate/fast/rapid.
   *
   * Same as E4 but in fullscreen mode. Images are larger (full viewport)
   * so render time may differ. Also tests that fullscreen persists across
   * image changes (no exit/re-enter flicker).
   *
   * Browser cache is cleared before EACH speed tier — same rationale as E4.
   * See exploration/docs/zz Archive/traversal-perf-investigation.md.
   *
   * slow tier dropped — same rationale as E4.
   */
  test("E5: fullscreen traversal — slow/moderate/fast/rapid", async ({ kupua }) => {
    const git = getGitState();

    for (const speed of ["slow", "moderate", "fast", "rapid"] as (keyof typeof TRAVERSAL_SPEEDS)[]) {
      // Clear browser cache before each tier (same as E4 — see doc reference above)
      const cdp = await kupua.page.context().newCDPSession(kupua.page);
      await cdp.send("Network.clearBrowserCache");
      await cdp.detach();
      console.log(`  🧹 Browser cache cleared before E5-${speed}`);

      const steps = speed === "rapid" ? 20 : speed === "slow" ? 8 : speed === "moderate" ? 10 : 12;

      console.log(`\n  ── E5: Fullscreen Traversal (${speed}, ${steps} images forward) ──`);
      console.log(`  Interval: ${TRAVERSAL_SPEEDS[speed].intervalMs}ms per image`);

      const result = await scenarioImageTraversal(
        kupua, kupua.page, speed, "fullscreen", "forward", steps,
      );
      const es = await getEsInfo(kupua);

      const cacheTag = result.landingImage.cacheHit ? " [CACHE HIT]" : "";
      const landingStr = result.landingImage.alreadyRendered
        ? "already rendered when traversal stopped [CACHE HIT]"
        : result.landingImage.rendered
          ? `${result.landingImage.renderMs}ms total (network: ${result.landingImage.networkMs}ms, decode+paint: ${Math.max(0, result.landingImage.renderMs - result.landingImage.networkMs)}ms)${cacheTag}`
          : "NOT rendered (5s timeout)";

      console.log(`  Summary:`);
      console.log(`    ★ Landing image: ${landingStr}`);
      console.log(`    Rendered:      ${result.renderedCount}/${result.steps} images`);
      console.log(`    Avg render:    ${result.avgRenderMs.toFixed(0)}ms`);
      console.log(`    Max render:    ${result.maxRenderMs.toFixed(0)}ms`);
      console.log(`    Swapped but not rendered: ${result.swappedButNotRendered}`);
      console.log(`    Jank severe:   ${result.snapshot.jank.severe} (${severePerKFrames(result.snapshot)}/1k frames)`);
      console.log(`    CLS:           ${result.snapshot.cls.total.toFixed(4)}`);
      console.log(`    Imgproxy:      ${result.snapshot.imgproxy.requestCount} requests (${result.snapshot.imgproxy.cacheHits} cache hits, avg ${result.snapshot.imgproxy.avgDurationMs.toFixed(0)}ms)`);

      // Probe self-test
      const diags = diagnoseProbes(result.snapshot, `fullscreen-${speed}-traverse`);
      logProbeDiagnostics(diags, `E5-${speed}`);

      const runId = generateRunId();
      recordResult({
        runId, timestamp: new Date().toISOString(),
        commitHash: git.commitHash, commitMessage: git.commitMessage, dirty: git.dirty,
        esSource: es.source, esTotal: es.total,
        experiment: `E5-fullscreen-${speed}-traverse`,
        config: { speed, stableUntil: STABLE_UNTIL, mode: "fullscreen", direction: "forward", cacheCleared: true },
        scenario: `fullscreen-${speed}-traverse-${steps}-fwd`,
        snapshot: result.snapshot,
        storeState: {
          landingImage: result.landingImage,
          renderedCount: result.renderedCount,
          avgRenderMs: Math.round(result.avgRenderMs),
          maxRenderMs: Math.round(result.maxRenderMs),
          swappedButNotRendered: result.swappedButNotRendered,
          timings: result.timings.map(t => ({
            i: t.index,
            srcMs: t.srcChangeMs,
            renderMs: t.renderMs,
            rendered: t.rendered,
          })),
        },
      });

      await kupua.page.waitForTimeout(500);
    }
  });

  /**
   * E6: Smooth autoscroll — finds where kupua starts choking.
   *
   * Simulates middle-click autoscroll (Firefox built-in, Chrome extensions).
   * Unlike wheel events, this is CONTINUOUS rAF-driven scrolling — the
   * browser's native scroll engine drives it at 60fps with real smooth
   * motion. No synthetic events, no discrete notches.
   *
   * Runs 3 smooth scroll speed tiers (brisk/fast/turbo) for 15 seconds each.
   * crawl (1px/frame) and gentle (3px/frame) dropped in v2 — they scroll
   * ~900px / ~2,700px in 15s, nowhere near the ~4,800px extend threshold.
   * They can't trigger extends and produce uniformly smooth jank data.
   *
   * The key output is: at what px/frame does severe jank appear?
   * This tells you the exact speed threshold where the virtualizer can't
   * keep up with the scroll rate. 15s is long enough to exhaust a 1000-item
   * buffer and trigger multiple extend/evict cycles.
   *
   * Each tier produces a separate result JSON with the actual scroll
   * distance, frame count, and measured px/frame (may differ from target
   * if the container hit its scroll limit).
   */
  test("E6: smooth autoscroll — brisk/fast/turbo", async ({ kupua }) => {
    const git = getGitState();

    for (const view of ["table", "grid"] as const) {
      for (const speed of ["brisk", "fast", "turbo"] as SmoothScrollSpeed[]) {
        const { pxPerFrame } = SMOOTH_SCROLL_SPEEDS[speed];
        const durationMs = 15000;

        console.log(`\n  ── E6: Smooth Autoscroll (${view}, ${speed}, ${pxPerFrame}px/frame, ${durationMs}ms) ──`);

        const result = await scenarioSmoothScroll(kupua, kupua.page, view, speed, durationMs);
        const store = await kupua.getStoreState();
        const es = await getEsInfo(kupua);
        const runId = generateRunId();

        const approxVelocity = Math.round(result.actualPxPerFrame * 60); // ~60fps
        const scenarioName = `${view}-smooth-${speed}-${durationMs}ms`;

        console.log(`  Commit: ${git.commitHash} ${git.dirty ? "(dirty)" : ""}`);
        console.log(`  ES: ${es.source} (${es.total.toLocaleString()} docs)`);
        console.log(`  Corpus pinned: until=${STABLE_UNTIL}`);
        console.log(`  Target: ${pxPerFrame}px/frame → Actual: ${result.actualPxPerFrame}px/frame`);
        console.log(`  Scrolled: ${result.scrolled}px in ${result.frames} frames (~${approxVelocity}px/s)`);
        console.log(`  Results:`);
        console.log(`    Severe jank:    ${result.snapshot.jank.severe} (${severePerKFrames(result.snapshot)}/1k frames)`);
        console.log(`    Max frame:      ${result.snapshot.jank.maxFrameMs.toFixed(0)}ms`);
        console.log(`    P95 frame:      ${result.snapshot.jank.p95FrameMs.toFixed(0)}ms`);
        console.log(`    DOM churn:      ${result.snapshot.dom.totalChurn}`);
        console.log(`    Blank flashes:  ${result.snapshot.flashes.count}`);
        console.log(`    ES requests:    ${result.snapshot.network.requestCount}`);
        console.log(`    Extends:        prepend=${store.prependGeneration} fwdEvict=${store.forwardEvictGeneration}`);

        // Probe self-test
        const diags = diagnoseProbes(result.snapshot, scenarioName);
        logProbeDiagnostics(diags, `E6-${view}-${speed}`);

        recordResult({
          runId, timestamp: new Date().toISOString(),
          commitHash: git.commitHash, commitMessage: git.commitMessage, dirty: git.dirty,
          esSource: es.source, esTotal: es.total,
          experiment: `E6-${view}-smooth-${speed}`,
          config: {
            stableUntil: STABLE_UNTIL,
            view,
            smoothSpeed: speed,
            targetPxPerFrame: pxPerFrame,
            durationMs,
          },
          scenario: scenarioName,
          snapshot: result.snapshot,
          storeState: {
            prependGeneration: store.prependGeneration,
            forwardEvictGeneration: store.forwardEvictGeneration,
            bufferOffset: store.bufferOffset,
            resultsLength: store.resultsLength,
            scrolled: result.scrolled,
            frames: result.frames,
            actualPxPerFrame: result.actualPxPerFrame,
            approxVelocityPxPerSec: approxVelocity,
          },
        });

        await kupua.page.waitForTimeout(500);
      }
    }
  });
});


