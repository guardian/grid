/**
 * Perceived-Performance Smoke Tests — measures latency from user action to
 * first visible response and to fully settled state.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  MANUAL INVOCATION ONLY — DO NOT RUN IN CI, SCRIPTS, OR AGENTS.   ║
 * ║                                                                    ║
 * ║  Same rules as perf.spec.ts. Human-only. Real ES required.        ║
 * ║                                                                    ║
 * ║  How to run:                                                       ║
 * ║    Terminal 1: ./scripts/start.sh --use-TEST                       ║
 * ║    Terminal 2: node e2e-perf/run-audit.mjs --label "..." --perceived║
 * ║                                                                    ║
 * ║  Cluster gate enforced by run-audit.mjs (probes total ≥ 100k once     ║
 * ║  at startup and refuses to run otherwise). Direct `npx playwright   ║
 * ║  test` invocations bypass the gate — by design, for debugging.       ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * What this measures (different from perf.spec.ts):
 *   - dt_ack_ms:        time from user action (t_0) to first DOM-visible change
 *   - dt_status_ms:     time from t_0 to "Finding image…" / "Seeking…" / spinner
 *   - dt_first_pixel_ms: time from t_0 to first real (non-skeleton) content
 *   - dt_settled_ms:    time from t_0 to fully settled (all loading cleared)
 *   - status_total_ms:  total wall time spent showing status banners
 *
 * Instrumentation: src/lib/perceived-trace.ts (gated on kupua_perceived_perf
 * localStorage flag — harness sets it via addInitScript before navigation).
 *
 * See e2e-perf/README.md → "Perceived-Performance Suite" for full contract.
 * See exploration/docs/perceived-perf-audit.md for full mandate.
 */

import { appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../e2e/shared/helpers";
import type { TraceEntry } from "@/lib/perceived-trace";

const __dirname = dirname(fileURLToPath(import.meta.url));
const METRICS_FILE = resolve(__dirname, "results/.perceived-short-tmp.jsonl");

// ---------------------------------------------------------------------------
// Stable result set pinning (same as perf.spec.ts)
// ---------------------------------------------------------------------------

const STABLE_UNTIL = process.env["PERF_STABLE_UNTIL"] ?? "";

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
// Perceived metrics computation
// ---------------------------------------------------------------------------

interface PerceivedMetrics {
  /** ID of the test scenario (e.g. "PP1") */
  id: string;
  /** Human-readable description */
  label: string;
  /** Action name (from t_0 entry) */
  action: string;
  /** ms from t_0 to first t_ack (first visible store change) */
  dt_ack_ms: number | null;
  /** ms from t_0 to t_status_visible (status banner / spinner appeared) */
  dt_status_ms: number | null;
  /** ms from t_0 to t_first_useful_pixel (first real content in buffer) */
  dt_first_pixel_ms: number | null;
  /** ms from t_0 to t_settled (all loading cleared) */
  dt_settled_ms: number | null;
  /** total ms any status banner was visible (sum of t_seeking/t_status_visible to t_settled) */
  status_total_ms: number | null;
  /** raw trace entries for debugging */
  raw: TraceEntry[];
}

function computeMetrics(
  id: string,
  label: string,
  entries: TraceEntry[],
  expectedAction?: string,
): PerceivedMetrics {
  // If expectedAction is given, anchor on that action's t_0 (and ignore
  // earlier t_0 entries from unrelated traces — search/position-map etc.
  // that fired during the same window). This prevents action mis-attribution
  // when the user-initiated action triggers a downstream search whose t_0
  // appears first in document order due to React batching.
  const t0Entry = expectedAction
    ? entries.find((e) => e.phase === "t_0" && e.action === expectedAction)
    : entries.find((e) => e.phase === "t_0");
  if (!t0Entry) {
    return { id, label, action: expectedAction ?? "unknown", dt_ack_ms: null, dt_status_ms: null, dt_first_pixel_ms: null, dt_settled_ms: null, status_total_ms: null, raw: entries };
  }

  const t0 = t0Entry.t;
  const action = t0Entry.action;

  const find = (phase: string) => entries.find((e) => e.t >= t0 && e.phase === phase);
  const ackEntry = find("t_ack");
  const statusEntry = find("t_status_visible") ?? find("t_seeking");
  const firstPixelEntry = find("t_first_useful_pixel");
  // t_settled: take the LAST one (final settle after any re-triggers)
  const settledEntry = [...entries].reverse().find((e) => e.t >= t0 && e.phase === "t_settled");

  // Total status banner visible time: from first status_visible/seeking to t_settled
  let statusTotalMs: number | null = null;
  if (statusEntry && settledEntry) {
    statusTotalMs = Math.round(settledEntry.t - statusEntry.t);
  }

  return {
    id,
    label,
    action,
    dt_ack_ms: ackEntry ? Math.round(ackEntry.t - t0) : null,
    dt_status_ms: statusEntry ? Math.round(statusEntry.t - t0) : null,
    dt_first_pixel_ms: firstPixelEntry ? Math.round(firstPixelEntry.t - t0) : null,
    dt_settled_ms: settledEntry ? Math.round(settledEntry.t - t0) : null,
    status_total_ms: statusTotalMs,
    raw: entries,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Enable the perceived trace flag before navigation. Call in beforeEach. */
async function enablePerceivedTrace(kupua: any) {
  await kupua.page.addInitScript(() => {
    localStorage.setItem("kupua_perceived_perf", "1");
  });
}

/** Clear the in-page trace buffer right before triggering an action. */
async function clearTrace(kupua: any) {
  await kupua.page.evaluate(() => {
    if (typeof (window as any).__perceivedTraceClear__ === "function") {
      (window as any).__perceivedTraceClear__();
    }
  });
}

/** Read all trace entries from the in-page buffer. */
async function readTrace(kupua: any): Promise<TraceEntry[]> {
  return kupua.page.evaluate(() => {
    return (window as any).__perceivedTrace__ ?? [];
  });
}

/**
 * Wait until the store is fully settled:
 * - loading === false
 * - sortAroundFocusStatus === null
 *
 * Polls up to `maxWait` ms.
 */
async function waitForStoreSettled(kupua: any, maxWait = 12_000) {
  await kupua.page.waitForFunction(
    () => {
      const store = (window as any).__kupua_store__;
      if (!store) return false;
      const s = store.getState();
      return !s.loading && s.sortAroundFocusStatus === null && !s.aggLoading;
    },
    { timeout: maxWait },
  );
  // One rAF to ensure paint completed
  await kupua.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
}

/** Emit one metrics line to the perceived temp file. */
function emitMetrics(metrics: PerceivedMetrics) {
  // Omit raw from file output (can be huge); keep for debug if needed.
  const { raw: _raw, ...rest } = metrics;
  const line = JSON.stringify(rest) + "\n";
  try {
    appendFileSync(METRICS_FILE, line);
  } catch {
    // File not writable outside the harness — fine for direct Playwright runs.
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

// Enable explicit focus mode for all tests (same as perf.spec.ts).
test.beforeEach(async ({ kupua }) => {
  await kupua.ensureExplicitMode();
  await enablePerceivedTrace(kupua);
});

test.describe("Perceived Performance Suite", () => {
  test.describe.configure({ timeout: 60_000 });

  // ── PP1: Home logo click ─────────────────────────────────────────────────
  // Expected: <100 ms ack, <200 ms settle. Probably pure client work (no ES).
  test("PP1: home-logo — logo click resets to home", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = (await kupua.getStoreState()).total;
    void total;

    // Scroll down a bit so there's something to reset
    await kupua.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Image results grid"]') ??
                 document.querySelector('[aria-label="Image results table"]');
      if (el) el.scrollTop = 2000;
    });
    await kupua.page.waitForTimeout(300);

    await clearTrace(kupua);
    const logo = kupua.page.locator('a[title="Grid — clear all filters"]');
    await logo.click();
    await waitForStoreSettled(kupua, 8_000);

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP1", "home-logo click", entries, "home-logo");
    console.log(`PP1 home-logo: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_settled_ms}ms`);
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0")).toBe(true);
  });

  // ── PP2: Sort field change — no focused image ────────────────────────────
  // Expected: <100 ms ack, <1.5 s first pixel, <2 s settle.
  test("PP2: sort-no-focus — sort field change (uploadTime → fileSize)", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = (await kupua.getStoreState()).total;
    void total;

    // Ensure no focused image
    await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      store?.getState().setFocusedImageId?.(null);
    });

    await clearTrace(kupua);
    // Click "File size" in the sort dropdown
    await kupua.page.click('button[aria-label^="Sort by:"]');
    const fileSize = kupua.page.locator('role=option[name="File size"]');
    if (await fileSize.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await fileSize.click();
    } else {
      // Fallback: find any option that's not the current one
      await kupua.page.locator('[role="listbox"] [role="option"]').first().click();
    }
    await waitForStoreSettled(kupua, 10_000);

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP2", "sort-no-focus (uploadTime→fileSize)", entries, "sort-no-focus");
    console.log(`PP2 sort-no-focus: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_settled_ms}ms`);
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0")).toBe(true);
  });

  // ── PP3: Sort field change — with focused image (sort-around-focus) ───────
  // Expected: <100 ms ack, <2 s settle. Shows "Finding image…" → "Seeking…".
  // This is the suspected worst case after scripted-sort removal.
  test("PP3: sort-around-focus — sort change with focused image", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = (await kupua.getStoreState()).total;
    void total;

    // Focus the 5th item — likely not in first page of a different sort
    await kupua.focusNthItem(4);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    await clearTrace(kupua);
    // Switch to a different sort field (keyword — triggers composite-agg path)
    await kupua.page.click('button[aria-label^="Sort by:"]');
    // Look for "Keyword" option; fall back to any other option
    const keywordOpt = kupua.page.locator('[role="listbox"] [role="option"]').filter({ hasText: /keyword/i });
    if (await keywordOpt.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await keywordOpt.first().click();
    } else {
      await kupua.page.locator('[role="listbox"] [role="option"]').first().click();
    }
    await waitForStoreSettled(kupua, 15_000);

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP3", "sort-around-focus (keyword sort)", entries, "sort-around-focus");
    console.log(
      `PP3 sort-around-focus: ack=${metrics.dt_ack_ms}ms status=${metrics.dt_status_ms}ms ` +
      `settled=${metrics.dt_settled_ms}ms banner=${metrics.status_total_ms}ms`,
    );
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0")).toBe(true);
  });

  // ── PP4: Sort direction toggle — with focused image ───────────────────────
  // Expected: same as PP3 (same code path, different trigger).
  test("PP4: sort-direction-focused — direction toggle with focused image", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = (await kupua.getStoreState()).total;
    void total;

    // Focus an item
    await kupua.focusNthItem(4);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    await clearTrace(kupua);
    // Click the sort direction toggle button
    await kupua.page.click('button[aria-label*="click to sort"]');
    await waitForStoreSettled(kupua, 15_000);

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP4", "sort-direction-toggle (focused)", entries, "sort-around-focus");
    console.log(
      `PP4 sort-dir-focused: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_settled_ms}ms banner=${metrics.status_total_ms}ms`,
    );
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0")).toBe(true);
  });

  // ── PP5: Filter toggle (search submit via checkbox) ───────────────────────
  // Expected: <100 ms ack, <1.5 s first pixel.
  test("PP5: filter-toggle — 'Free to use only' checkbox toggle", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = (await kupua.getStoreState()).total;
    void total;

    await clearTrace(kupua);
    // Toggle the "Free to use only" checkbox
    await kupua.page.click('input[type="checkbox"]');
    await waitForStoreSettled(kupua, 10_000);

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP5", "filter-toggle (free-to-use checkbox)", entries, "filter-toggle");
    console.log(`PP5 filter-toggle: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_settled_ms}ms`);
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0")).toBe(true);
  });

  // ── PP6: Density swap ─────────────────────────────────────────────────────
  // Expected: <100 ms ack, <400 ms settle. Owner reports this feels fine.
  test("PP6: density-swap — grid ↔ table toggle", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = (await kupua.getStoreState()).total;
    void total;

    await clearTrace(kupua);
    // Click the density toggle button in the StatusBar
    await kupua.page.click('button[aria-label="Switch to table view"]');
    await waitForStoreSettled(kupua, 8_000);
    await kupua.waitForResults();

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP6", "density-swap (grid→table)", entries, "density-swap");
    console.log(`PP6 density-swap: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_settled_ms}ms`);
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0")).toBe(true);
  });

  // ── PP7: Scrubber seek (click on track) ───────────────────────────────────
  // Expected: <100 ms ack on click, <1 s first pixel.
  // Only fires the seek path when total > SCROLL_MODE_THRESHOLD (~65k).
  test("PP7: scrubber-seek — click track at ~50%", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = (await kupua.getStoreState()).total;

    // Skip if small result set — click would scroll not seek
    if (total < 200_000) {
      test.skip(true, `total=${total} — seek path only fires for large result sets`);
    }

    // Click the scrubber track at ~50% position
    const trackBox = await kupua.scrubber.boundingBox();
    if (!trackBox) {
      test.skip(true, "Scrubber track not visible");
    }

    await clearTrace(kupua);
    await kupua.page.mouse.click(
      trackBox!.x + trackBox!.width / 2,
      trackBox!.y + trackBox!.height * 0.5,
    );
    await waitForStoreSettled(kupua, 10_000);
    await kupua.waitForResults();

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP7", "scrubber-seek (click 50%)", entries, "scrubber-seek");
    console.log(`PP7 scrubber-seek: ack=${metrics.dt_ack_ms}ms first_pixel=${metrics.dt_first_pixel_ms}ms settled=${metrics.dt_settled_ms}ms`);
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0")).toBe(true);
  });

  // ── PP7b: Scrubber drag-release (seek mode) ───────────────────────────────
  // Same code path as PP7 but triggered by drag-release, not a point click.
  // trace("scrubber-seek", "t_0") fires on pointerup only when hasMoved=true
  // AND the result set is large enough to be in seek mode (>POSITION_MAP_THRESHOLD).
  // Expected: same as PP7.
  test("PP7b: scrubber-drag — drag-release in seek mode", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = (await kupua.getStoreState()).total;

    if (total < 200_000) {
      test.skip(true, `total=${total} — seek mode only fires for large result sets`);
    }

    const trackLocator = kupua.page.locator('[data-testid="scrubber-track"]');
    const thumbLocator = kupua.page.locator('[data-scrubber-thumb="true"]');
    const trackBox = await trackLocator.boundingBox();
    const thumbBox = await thumbLocator.boundingBox();
    if (!trackBox || !thumbBox) {
      test.skip(true, "Scrubber not visible");
    }

    // Grab the thumb centre and drag downward ~30% of the track height
    const startX = thumbBox!.x + thumbBox!.width / 2;
    const startY = thumbBox!.y + thumbBox!.height / 2;
    const endY = trackBox!.y + trackBox!.height * 0.7;

    await clearTrace(kupua);
    await kupua.page.mouse.move(startX, startY);
    await kupua.page.mouse.down();
    // Move in small steps to ensure hasMoved=true
    for (let y = startY; y < endY; y += 20) {
      await kupua.page.mouse.move(startX, y);
    }
    await kupua.page.mouse.move(startX, endY);
    await kupua.page.mouse.up();
    await waitForStoreSettled(kupua, 15_000);
    await kupua.waitForResults();

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP7b", "scrubber-drag (seek mode)", entries, "scrubber-seek");
    console.log(`PP7b scrubber-drag: ack=${metrics.dt_ack_ms}ms first_pixel=${metrics.dt_first_pixel_ms}ms settled=${metrics.dt_settled_ms}ms`);
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0" && e.action === "scrubber-seek")).toBe(true);
  });

  // ── PP7c: Scrubber click in buffer mode (small result set) ────────────────
  // When total ≤ SCROLL_MODE_THRESHOLD (~1000), the scrubber click scrolls the
  // DOM container directly — no ES round-trip. trace("scrubber-scroll", "t_0")
  // fires and t_settled fires in the next rAF (~1ms).
  // Expected: ack ~0ms, settled <10ms (pure DOM scroll, no network).
  test("PP7c: scrubber-buffer — click track with small result set", async ({ kupua }) => {
    // Use a CQL query known to return a small result set (buffer mode).
    // `by:"David Young"` ~538 matches — same query as perceived-long QUERY_SCROLL.
    const untilParam = STABLE_UNTIL ? `&until=${STABLE_UNTIL}` : "";
    await kupua.page.goto(
      `/search?nonFree=true&query=${encodeURIComponent('by:"David Young"')}${untilParam}`,
    );
    await kupua.waitForResults();

    const filteredTotal = (await kupua.getStoreState()).total;
    // Only meaningful in buffer mode (≤1000 results). Skip if query returns too many.
    if (filteredTotal > 5_000) {
      test.skip(true, `filteredTotal=${filteredTotal} — buffer mode needs a small result set`);
    }

    // Wait for the full buffer fetch — when total ≤ SCROLL_MODE_THRESHOLD the
    // store fetches ALL hits in a follow-up call. Until that completes,
    // results.length < total and Scrubber.scrubberMode falls back to "seek"
    // (the Scrubber's `bufferLength` prop is derived from `results.length`,
    // not stored), which would make handleTrackClick emit "scrubber-seek".
    await kupua.page.waitForFunction(
      () => {
        const s = (window as any).__kupua_store__?.getState();
        return s && s.results && s.results.length >= s.total;
      },
      { timeout: 10_000 },
    );

    const trackLocator = kupua.page.locator('[data-testid="scrubber-track"]');
    const trackBox = await trackLocator.boundingBox();
    if (!trackBox) {
      test.skip(true, "Scrubber not visible");
    }

    await clearTrace(kupua);
    await kupua.page.mouse.click(
      trackBox!.x + trackBox!.width / 2,
      trackBox!.y + trackBox!.height * 0.8,
    );
    // Buffer-mode scroll is synchronous DOM — short wait is enough
    await kupua.page.waitForTimeout(200);
    await kupua.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP7c", "scrubber-buffer (click, DOM scroll)", entries, "scrubber-scroll");
    console.log(`PP7c scrubber-buffer: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_settled_ms}ms`);
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0" && e.action === "scrubber-scroll")).toBe(true);
  });

  // ── PP8: Search submit (warm — new text query from running session) ────────
  // Measures the warm path: user is already on a results page, types a new
  // query in the existing CqlSearchInput. The CQL web component dispatches
  // a `queryChange` CustomEvent on debounce; SearchBar.handleQueryChange
  // catches it, fires trace("search", "t_0", { source: "debounced-input" }),
  // then calls updateSearch() → URL → store.search().
  //
  // We simulate the keystroke by dispatching the same `queryChange` event
  // the cql-input would emit. This is faithful to the warm path because:
  //   - the listener is the same (SearchBar's handleQueryChange wrapper)
  //   - the trace t_0 fires from the same call site
  //   - the navigate → useUrlSearchSync → store.search() chain runs identically
  // What it skips: ProseMirror keystroke handling and CQL's own debounce.
  // Those happen *before* our t_0, so omitting them doesn't bias the metric.
  // Expected: <100ms ack, <1.5s first pixel, <3s settle.
  test("PP8: search-submit — warm query (sport) from existing session", async ({ kupua }) => {
    await gotoPerfSearch(kupua);

    await clearTrace(kupua);
    await kupua.page.evaluate(() => {
      const cql = document.querySelector("cql-input");
      if (!cql) throw new Error("cql-input not found");
      cql.dispatchEvent(new CustomEvent("queryChange", { detail: { queryStr: "sport" } }));
    });
    // SearchBar debounces 300ms before firing trace + navigate. waitForStoreSettled
    // would return instantly here (store is still settled from the initial load),
    // so first wait for loading to flip on, *then* wait for it to settle again.
    await kupua.page.waitForFunction(
      () => (window as any).__kupua_store__?.getState().loading === true,
      { timeout: 5_000 },
    );
    await waitForStoreSettled(kupua, 15_000);

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP8", "search-submit warm (sport)", entries, "search");
    console.log(
      `PP8 search-submit: ack=${metrics.dt_ack_ms}ms first_pixel=${metrics.dt_first_pixel_ms}ms settled=${metrics.dt_settled_ms}ms`,
    );
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0" && e.action === "search")).toBe(true);
  });

  // ── PP9: CQL chip remove ───────────────────────────────────────────────────
  // Measures latency after the user removes a single CQL chip (e.g. clicks
  // the ✕ on a `credit:Reuters` chip). The cql web component re-emits
  // `queryChange` with the new (shorter) queryStr; SearchBar's handleQueryChange
  // fires trace("search", "t_0", { source: "debounced-input" }) and triggers
  // the standard URL → store.search() round-trip.
  //
  // We synthesise the chip-remove by landing on a page WITH a query, then
  // dispatching `queryChange` with an empty queryStr (equivalent to removing
  // the only chip). Same trace path as a real chip-remove; same store path
  // as the Clear button — but tagged honestly as a chip-remove scenario.
  // Expected: <100ms ack, <1.5s first pixel, <3s settle.
  test("PP9: cql-chip-remove — remove last chip from queried state", async ({ kupua }) => {
    const untilParam = STABLE_UNTIL ? `&until=${STABLE_UNTIL}` : "";
    await kupua.page.goto(`/search?nonFree=true&query=sport${untilParam}`);
    await kupua.waitForResults();

    await clearTrace(kupua);
    await kupua.page.evaluate(() => {
      const cql = document.querySelector("cql-input");
      if (!cql) throw new Error("cql-input not found");
      cql.dispatchEvent(new CustomEvent("queryChange", { detail: { queryStr: "" } }));
    });
    // Same timing concern as PP8 — wait for the search to actually start.
    await kupua.page.waitForFunction(
      () => (window as any).__kupua_store__?.getState().loading === true,
      { timeout: 5_000 },
    );
    await waitForStoreSettled(kupua, 12_000);

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP9", "cql-chip-remove (last chip)", entries, "search");
    console.log(
      `PP9 cql-chip-remove: ack=${metrics.dt_ack_ms}ms first_pixel=${metrics.dt_first_pixel_ms}ms settled=${metrics.dt_settled_ms}ms`,
    );
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0" && e.action === "search")).toBe(true);
  });

  // ── PP10: Position-map background fetch ────────────────────────────────────
  // Measures background fetch of the position index for medium result sets
  // (SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD, default ~1k–65k).
  // "avalonred" returns ~21k results — within that range. The position map
  // loads automatically after the initial search settles.
  // trace("position-map", "t_0") fires when the fetch starts;
  // trace("position-map", "t_settled") fires when positionMap is stored.
  // Expected: 1–5s settled (full background fetch of ~21k position entries).
  test("PP10: position-map — background fetch after medium-size search", async ({ kupua }) => {
    const untilParam = STABLE_UNTIL ? `&until=${STABLE_UNTIL}` : "";
    // `uploader:avalonred` returns ~21k results — same query as perceived-long QUERY_TWOTIER.
    // Free-text "avalonred" would fuzzy-match across all fields and return far fewer.
    await kupua.page.goto(
      `/search?nonFree=true&query=${encodeURIComponent("uploader:avalonred")}${untilParam}`,
    );
    await kupua.waitForResults();
    // Wait for initial search to settle
    await waitForStoreSettled(kupua, 15_000);
    // Then wait for the position map background fetch to complete
    await kupua.page.waitForFunction(
      () => {
        const s = (window as any).__kupua_store__?.getState();
        return s && !s.positionMapLoading && s.positionMap !== null;
      },
      { timeout: 30_000 },
    );
    await kupua.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP10", "position-map background fetch (~21k)", entries, "position-map");
    console.log(
      `PP10 position-map: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_settled_ms}ms`,
    );
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0" && e.action === "position-map")).toBe(true);
    expect(entries.some((e) => e.phase === "t_settled" && e.action === "position-map")).toBe(true);
  });

  // ── PP6b: Density swap — mid-buffer depth ────────────────────────────────
  // Same action as PP6 but the buffer is loaded and the viewport is scrolled
  // to the middle of the loaded results. Owner reports density swap "feels
  // fine" — this variant confirms that's also true mid-buffer.
  test("PP6b: density-swap-mid — grid ↔ table at mid-buffer scroll", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = (await kupua.getStoreState()).total;
    void total;

    // Scroll the grid to ~50% of the loaded buffer
    await kupua.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Image results grid"]') ??
                 document.querySelector('[aria-label="Image results table"]');
      if (el) el.scrollTop = el.scrollHeight * 0.5;
    });
    await kupua.page.waitForTimeout(300);

    await clearTrace(kupua);
    await kupua.page.click('button[aria-label="Switch to table view"]');
    await waitForStoreSettled(kupua, 8_000);
    await kupua.waitForResults();

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP6b", "density-swap-mid (grid→table, mid-buffer)", entries, "density-swap");
    console.log(`PP6b density-swap-mid: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_settled_ms}ms`);
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0")).toBe(true);
  });

  // ── PP6c: Density swap — deep-buffer depth ────────────────────────────────
  // Same as PP6b but scrolled to near the end of the loaded buffer.
  // The density change at deep scroll is the worst case for DOM churn and
  // any abortExtends cooldown that may be in progress.
  test("PP6c: density-swap-deep — grid ↔ table at deep-buffer scroll", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = (await kupua.getStoreState()).total;
    void total;

    // Scroll to near the end of the loaded buffer
    await kupua.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Image results grid"]') ??
                 document.querySelector('[aria-label="Image results table"]');
      if (el) el.scrollTop = el.scrollHeight * 0.9;
    });
    await kupua.page.waitForTimeout(500); // allow extend-forward to fire and settle

    // Wait for any buffer extension triggered by the scroll to settle
    await waitForStoreSettled(kupua, 10_000);

    await clearTrace(kupua);
    await kupua.page.click('button[aria-label="Switch to table view"]');
    await waitForStoreSettled(kupua, 8_000);
    await kupua.waitForResults();

    const entries = await readTrace(kupua);
    const metrics = computeMetrics("PP6c", "density-swap-deep (grid→table, deep-buffer)", entries, "density-swap");
    console.log(`PP6c density-swap-deep: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_settled_ms}ms`);
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0")).toBe(true);
  });
});
