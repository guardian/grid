/**
 * Perceived-Performance Journey Tests — multi-step realistic user workflows.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  MANUAL INVOCATION ONLY — DO NOT RUN IN CI, SCRIPTS, OR AGENTS.   ║
 * ║                                                                    ║
 * ║  How to run:                                                       ║
 * ║    Terminal 1: ./scripts/start.sh --use-TEST                       ║
 * ║    Terminal 2: node e2e-perf/run-audit.mjs --long-perceived-only \ ║
 * ║                  --dry-run --label "Journey check"                 ║
 * ║                                                                    ║
 * ║  Cluster gate enforced by run-audit.mjs (probes total ≥ 100k once     ║
 * ║  at startup and refuses to run otherwise). Direct `npx playwright   ║
 * ║  test` invocations bypass the gate — by design, for debugging.       ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Two journeys, each emitting one PerceivedMetrics entry per step:
 *
 * Journey A — Scroll tier (David Young, ~538 results):
 *   JA1  search-submit        navigate to query → settled
 *   JA2  sort-reverse         toggle sort direction → sort-around-focus settled
 *   JA3  metadata-click       open prescribed image (David Young) → click
 *                             colourProfile:"Display P3" → new search settled
 *                             (~5636 results, replaces query)
 *
 * Journey B — Two-tier + filters (avalonred, ~21628 results):
 *   JB1  search-submit        navigate to query → settled
 *   JB2  facet-click          open filters, click subject:sport → search settled
 *   JB3  facet-exclude        alt+click -subject:news → search settled
 *   JB4  scrubber-seek        click scrubber track at ~50% → seek settled
 *   JB5  fullscreen-exit      focus image → F enter → traverse 20 images → F exit
 *                             → scroll/seek restoration settled
 *
 * Prescribed images (stable as of STABLE_UNTIL 2026-02-15T00:00:00.000Z):
 *   Scroll:    f117d4a309df02c0347a0ca1d7f0bdf5791aa034  (David Young)
 *   Two-tier:  1c3a9cefa450f27e5f37b7023e3e9f4db12d9135  (avalonred)
 *   Seek:      1cf4be2953ccedb6134ad1a452fadc4cc90082e4  (AAP — JourneyC future)
 *
 * These image IDs are prescribed to land on specific metadata values for
 * the metadata-click steps. Shift+click on a value appends it as AND-filter.
 */

import { appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../e2e/shared/helpers";
import type { TraceEntry } from "@/lib/perceived-trace";

const __dirname = dirname(fileURLToPath(import.meta.url));
const METRICS_FILE = resolve(__dirname, "results/.perceived-long-tmp.jsonl");

// ---------------------------------------------------------------------------
// Stable result set pinning
// ---------------------------------------------------------------------------

const STABLE_UNTIL = process.env["PERF_STABLE_UNTIL"] ?? "";

// Prescribed stable corpus for each tier
const QUERY_SCROLL = `by:"David Young"`;    // ~538  — pure scroll buffer
const QUERY_TWOTIER = `uploader:avalonred`; // ~21628 — two-tier virtualisation
// const QUERY_SEEK = `credit:AAP`;          // ~343688 — seek mode (JourneyC)

// Prescribed image IDs (see file header comment)
const IMG_SCROLL   = "f117d4a309df02c0347a0ca1d7f0bdf5791aa034";
const IMG_TWOTIER  = "1c3a9cefa450f27e5f37b7023e3e9f4db12d9135";

// ---------------------------------------------------------------------------
// Guard: per-test cluster checks live in the harness (run-audit.mjs probes
// once at startup and refuses to run if total < 100k or PERF_STABLE_UNTIL is
// missing). Tests assume real data and a pinned corpus. Direct invocations
// via `npx playwright test --config=…` bypass that probe — by design, for
// debugging — and produce meaningless metrics on local ES.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Metrics helpers (mirrors perceived-short.spec.ts)
// ---------------------------------------------------------------------------

interface PerceivedMetrics {
  id: string;
  label: string;
  action: string;
  dt_ack_ms: number | null;
  dt_status_ms: number | null;
  dt_first_pixel_ms: number | null;
  dt_settled_ms: number | null;
  status_total_ms: number | null;
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
    return {
      id, label, action: expectedAction ?? "unknown",
      dt_ack_ms: null, dt_status_ms: null,
      dt_first_pixel_ms: null, dt_settled_ms: null,
      status_total_ms: null, raw: entries,
    };
  }

  const t0 = t0Entry.t;
  const action = t0Entry.action;
  const find = (phase: string) => entries.find((e) => e.t >= t0 && e.phase === phase);
  const ackEntry = find("t_ack");
  const statusEntry = find("t_status_visible") ?? find("t_seeking");
  const firstPixelEntry = find("t_first_useful_pixel");
  const settledEntry = [...entries].reverse().find((e) => e.t >= t0 && e.phase === "t_settled");

  let statusTotalMs: number | null = null;
  if (statusEntry && settledEntry) {
    statusTotalMs = Math.round(settledEntry.t - statusEntry.t);
  }

  return {
    id, label, action,
    dt_ack_ms: ackEntry ? Math.round(ackEntry.t - t0) : null,
    dt_status_ms: statusEntry ? Math.round(statusEntry.t - t0) : null,
    dt_first_pixel_ms: firstPixelEntry ? Math.round(firstPixelEntry.t - t0) : null,
    dt_settled_ms: settledEntry ? Math.round(settledEntry.t - t0) : null,
    status_total_ms: statusTotalMs,
    raw: entries,
  };
}

function emitMetrics(metrics: PerceivedMetrics) {
  const { raw: _raw, ...rest } = metrics;
  const line = JSON.stringify(rest) + "\n";
  try { appendFileSync(METRICS_FILE, line); } catch { /* ok outside harness */ }
}

async function enablePerceivedTrace(kupua: any) {
  await kupua.page.addInitScript(() => {
    localStorage.setItem("kupua_perceived_perf", "1");
  });
}

async function clearTrace(kupua: any) {
  await kupua.page.evaluate(() => {
    if (typeof (window as any).__perceivedTraceClear__ === "function") {
      (window as any).__perceivedTraceClear__();
    }
  });
}

async function readTrace(kupua: any): Promise<TraceEntry[]> {
  // Same-route SPA navs (enterDetail, search via metadata click, fullscreen
  // exit + scroll restore) can race with this evaluate and destroy the JS
  // context. Retry up to 3x — by then the new context has stabilised.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await kupua.page.evaluate(() => (window as any).__perceivedTrace__ ?? []);
    } catch (err) {
      if (!String(err).includes("Execution context was destroyed") || attempt === 2) throw err;
      await kupua.page.waitForLoadState("load");
    }
  }
  return [];
}

/** Wait until the store has no in-flight loading or sort-around-focus.
 * The trailing rAF wait is wrapped in a retry: same-route SPA navigations
 * (e.g. enterDetail) destroy the JS execution context mid-evaluate, which
 * Playwright surfaces as "Execution context was destroyed". Retry up to 3x
 * — by then the new context has stabilised.
 */
async function waitForStoreSettled(kupua: any, maxWait = 15_000) {
  await kupua.page.waitForFunction(
    () => {
      const store = (window as any).__kupua_store__;
      if (!store) return false;
      const s = store.getState();
      return !s.loading && s.sortAroundFocusStatus === null && !s.aggLoading;
    },
    { timeout: maxWait },
  );
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await kupua.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
      return;
    } catch (err) {
      if (!String(err).includes("Execution context was destroyed")) throw err;
      // Re-wait for the store after the navigation that interrupted us.
      await kupua.page.waitForFunction(
        () => {
          const store = (window as any).__kupua_store__;
          if (!store) return false;
          const s = store.getState();
          return !s.loading && s.sortAroundFocusStatus === null && !s.aggLoading;
        },
        { timeout: maxWait },
      );
    }
  }
}

/** Wait for aggregations to finish loading (after opening filter panel). */
async function waitForAggsLoaded(kupua: any, maxWait = 20_000) {
  await kupua.page.waitForFunction(
    () => {
      const store = (window as any).__kupua_store__;
      if (!store) return false;
      const s = store.getState();
      return !s.aggLoading && s.aggregations !== null;
    },
    { timeout: maxWait },
  );
  await kupua.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
}

/** Navigate to a journey-specific search. */
async function gotoJourney(kupua: any, query: string, extraParams = "") {
  const untilParam = STABLE_UNTIL ? `&until=${STABLE_UNTIL}` : "";
  const extra = extraParams ? `&${extraParams}` : "";
  await kupua.page.goto(
    `/search?nonFree=true&query=${encodeURIComponent(query)}${untilParam}${extra}`,
  );
  await waitForStoreSettled(kupua, 20_000);
}

/** Navigate with a focused image — triggers sort-around-focus. Called only
 * at the start of a journey (fresh page, no in-flight router work) so a
 * plain goto is fine here.
 */
async function gotoJourneyWithImage(kupua: any, query: string, imageId: string) {
  const untilParam = STABLE_UNTIL ? `&until=${STABLE_UNTIL}` : "";
  await kupua.page.goto(
    `/search?nonFree=true&query=${encodeURIComponent(query)}&image=${imageId}${untilParam}`,
  );
  await waitForStoreSettled(kupua, 20_000);
}

/** Log a step result in a human-readable format. */
function logStep(id: string, m: PerceivedMetrics) {
  const ack = m.dt_ack_ms != null ? `ack=${m.dt_ack_ms}ms ` : "";
  const fp  = m.dt_first_pixel_ms != null ? `first_pixel=${m.dt_first_pixel_ms}ms ` : "";
  const set = m.dt_settled_ms != null ? `settled=${m.dt_settled_ms}ms` : "settled=?ms";
  console.log(`${id} ${m.action}: ${ack}${fp}${set}`);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.beforeEach(async ({ kupua }) => {
  await kupua.ensureExplicitMode();
  await enablePerceivedTrace(kupua);
});

test.describe("Journey Tests", () => {
  test.describe.configure({ timeout: 120_000 });

  // ─────────────────────────────────────────────────────────────────────────
  // Journey A — Scroll tier (David Young, ~538 results)
  //
  // Step sequence:
  //   JA1: navigate to the David Young query → search settled
  //   JA2: toggle sort direction → sort-around-focus settled
  //   JA1: navigate to David Young query → search settled (cold)
  //   JA2: click the prescribed image cell → detail overlay opens, settled
  //   JA3: click "Display P3" in metadata panel → new search settled (~5636)
  //
  // No sort step — sort-around-focus is exercised by perceived-short PP3
  // and jank P6 already; reverse-sort here re-orders the result list and
  // virtualises the prescribed image out of DOM, breaking JA3's lookup.
  // No `?image=` deep-linking — its router/overlay races don't reflect
  // real user flow. Real users always reach a focused image by clicking
  // a cell, so the test does the same.
  // ─────────────────────────────────────────────────────────────────────────
  test("JA: scroll tier — David Young search → image click → metadata click", async ({ kupua }) => {
    await clearTrace(kupua);        // discard home-nav trace before the journey
    await gotoJourney(kupua, QUERY_SCROLL);

    // ── JA1: search submit (cold) ─────────────────────────────────────────
    {
      const entries = await readTrace(kupua);
      const m = computeMetrics("JA1", "search David Young (~538)", entries, "search");
      logStep("JA1", m);
      emitMetrics(m);
      expect(entries.length).toBeGreaterThan(0);
    }

    // ── JA2: double-click prescribed image → detail overlay opens ─────────
    // Single click only focuses in explicit mode; double-click runs
    // enterDetail (matches Kahuna behaviour). enterDetail navigates with
    // ?image=…, so wait for that URL update before reading the store.
    await clearTrace(kupua);
    const imageCell = kupua.page.locator(`[data-image-id="${IMG_SCROLL}"]`).first();
    await imageCell.waitFor({ timeout: 10_000 });
    await imageCell.dblclick();
    await kupua.page.waitForURL(/[?&]image=/, { timeout: 10_000 });
    await waitForStoreSettled(kupua, 10_000);

    {
      const entries = await readTrace(kupua);
      const m = computeMetrics("JA2", "image-dblclick (open detail)", entries, "open-detail");
      logStep("JA2", m);
      emitMetrics(m);
    }

    // ── JA3: metadata click on detail panel ───────────────────────────────
    // The right (Details) panel must be visible for the metadata buttons to
    // be clickable.
    const showDetailsBtn = kupua.page.locator('[aria-label="Show Details panel"]');
    if (await showDetailsBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await showDetailsBtn.click({ force: true });
      // Panel-open animation may take a tick; wait for the content to settle
      // before locating the metadata buttons or the click can land off-target.
      await kupua.page.waitForTimeout(200);
    }

    // Locate the colourModel value button INSIDE the metadata panel
    // (which is a <dl>). colourModel:RGB exists on the vast majority of
    // images (most of the corpus is RGB), so this is the cheapest pin
    // that still produces a meaningful refinement search. Scoping to <dl>
    // prevents accidental matches against SearchPill chips elsewhere.
    const colourProfileBtn = kupua.page.locator('dl button[title^="RGB"]').first();
    await colourProfileBtn.waitFor({ state: "visible", timeout: 15_000 });
    // Scroll into view so the click hits the button reliably even if the
    // metadata panel has a long content list and the button is off-screen.
    await colourProfileBtn.scrollIntoViewIfNeeded();

    await clearTrace(kupua);
    // Use Playwright's standard click — it dispatches real mousedown/mouseup/
    // click events through the browser, so React's synthetic event delegation
    // sees them as user-initiated and the metadata-click trace fires inside
    // useMetadataSearch's callback. (Programmatic .click() via page.evaluate
    // does fire the search but, observed empirically, does NOT cause the
    // trace to land in the buffer — likely a React-event-system quirk.)
    await colourProfileBtn.click();
    await waitForStoreSettled(kupua, 20_000);

    {
      const entries = await readTrace(kupua);
      const m = computeMetrics("JA3", "metadata-click colourModel:\"RGB\"", entries, "metadata-click");
      logStep("JA3", m);
      emitMetrics(m);
      expect(entries.some((e) => e.phase === "t_0" && e.action === "metadata-click")).toBe(true);
      // Sanity: plain metadata click *replaces* the query (so result count
      // jumps from David Young's ~538 to colourModel:RGB's ~1.3M corpus
      // subset). Only assert we ended up somewhere with results — exact
      // bounds aren't useful here and false-fail on corpus drift.
      const finalTotal = await kupua.page.evaluate(
        () => (window as any).__kupua_store__.getState().total as number,
      );
      expect(finalTotal).toBeGreaterThan(100);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Journey B — Two-tier + filters (avalonred, ~21628 results)
  //
  // Step sequence:
  //   JB1: navigate to avalonred query → search settled
  //   JB2: open Filters panel → click subject:sport → search settled
  //   JB3: alt+click -subject:news → search settled (exclude)
  //   JB4: click scrubber track at ~50% → seek settled
  //   JB5: focus prescribed image → press F → traverse 20 → press F to exit
  //        → scroll/seek restoration settled
  // ─────────────────────────────────────────────────────────────────────────
  test("JB: two-tier — avalonred filters → seek → fullscreen", async ({ kupua }) => {
    await clearTrace(kupua);        // discard home-nav trace before the journey
    await gotoJourney(kupua, QUERY_TWOTIER);

    // ── JB1: search submit ────────────────────────────────────────────────
    {
      const entries = await readTrace(kupua);
      const m = computeMetrics("JB1", "search avalonred (~21628)", entries, "search");
      logStep("JB1", m);
      emitMetrics(m);
      expect(entries.length).toBeGreaterThan(0);
    }

    // ── JB2: open filters, click subject:sport ────────────────────────────
    {
      // 1. Open the Browse panel if not already open.
      const showBrowseBtn = kupua.page.locator('[aria-label="Show Browse panel"]');
      if (await showBrowseBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await showBrowseBtn.click();
      }

      // 2. Expand the Filters accordion section if it's collapsed (defaults closed).
      const filtersSectionBtn = kupua.page.locator('[aria-controls="section-left-filters"]');
      const filtersOpen = await filtersSectionBtn.getAttribute("aria-expanded").catch(() => "true");
      if (filtersOpen === "false") {
        await filtersSectionBtn.click();
      }

      // 3. Wait for the sport bucket to appear (aggs loaded + rendered).
      const sportBtn = kupua.page.locator('[data-facet-field="metadata.subjects"][data-facet-key="sport"]');
      await sportBtn.waitFor({ timeout: 30_000 });

      await clearTrace(kupua);
      await sportBtn.click();
      await waitForStoreSettled(kupua, 15_000);

      const entries = await readTrace(kupua);
      const m = computeMetrics("JB2", "facet-click subject:sport", entries, "facet-click");
      logStep("JB2", m);
      emitMetrics(m);
      expect(entries.some((e) => e.phase === "t_0" && e.action === "facet-click")).toBe(true);
    }

    // ── JB3: alt+click to exclude a subject (exclude filter) ────────────────
    // After JB2's facet click, Playwright may still be tracking the pushState
    // navigation. Drain it first, then re-open panel/section if needed.
    {
      // Drain any pending Playwright navigation from JB2's URL change.
      await kupua.page.waitForURL("**/search**", { timeout: 10_000 }).catch(() => {});

      const showBrowseBtn2 = kupua.page.locator('[aria-label="Show Browse panel"]');
      if (await showBrowseBtn2.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await showBrowseBtn2.click();
      }
      const filtersSectionBtn2 = kupua.page.locator('[aria-controls="section-left-filters"]');
      const filtersOpen2 = await filtersSectionBtn2.getAttribute("aria-expanded").catch(() => "true");
      if (filtersOpen2 === "false") {
        await filtersSectionBtn2.click();
      }

      await clearTrace(kupua);
      // Use any facet button from any field that isn’t already the applied sport filter.
      // After subject:sport, the subjects facet may only show sport; other fields
      // (keywords, mimeType, source…) are guaranteed to have buckets.
      const excludeBtn = kupua.page
        .locator('[data-facet-field]:not([data-facet-key="sport"])')
        .first();
      await excludeBtn.waitFor({ timeout: 30_000 });
      const excludeKey = await excludeBtn.getAttribute("data-facet-key");
      await excludeBtn.click({ modifiers: ["Alt"] });
      await waitForStoreSettled(kupua, 15_000);

      const entries = await readTrace(kupua);
      // No expectedAction pin: alt+click may emit facet-click then trigger a
      // downstream search; whichever t_0 fires first wins (commonly facet-click).
      const m = computeMetrics("JB3", `facet-exclude -subject:${excludeKey}`, entries);
      logStep("JB3", m);
      emitMetrics(m);
      // The trace may capture the resulting search action rather than facet-click
      // if timing races with a prior search; just require some t_0 entry.
      expect(entries.some((e) => e.phase === "t_0")).toBe(true);
    }

    // ── JB4: scrubber seek to ~50% ────────────────────────────────────────
    await clearTrace(kupua);
    const scrubberTrack = kupua.page.locator('[data-testid="scrubber-track"]').first();
    const trackBox = await scrubberTrack.boundingBox();
    if (!trackBox) throw new Error("Scrubber track not found");
    await kupua.page.mouse.click(
      trackBox.x + trackBox.width * 0.5,
      trackBox.y + trackBox.height * 0.5,
    );
    await waitForStoreSettled(kupua, 20_000);

    {
      const entries = await readTrace(kupua);
      // JB4 may be either scrubber-scroll (small bufferLength) or scrubber-seek;
      // don't pin expectedAction so whichever fired wins.
      const m = computeMetrics("JB4", "scrubber-seek ~50%", entries);
      logStep("JB4", m);
      emitMetrics(m);
    }

    // ── JB5: fullscreen — enter, traverse 20, exit ────────────────────────
    // Use whatever image is currently visible (after JB3 filter + JB4 seek).
    // Prescribed IMG_TWOTIER may not be in the filtered/seeked viewport.
    await clearTrace(kupua);

    // Find the first visible image cell in the grid.
    const imageCell = kupua.page.locator('[data-image-id]').first();
    await imageCell.waitFor({ timeout: 10_000 });
    await imageCell.click();
    await kupua.page.waitForTimeout(200);

    // Press Alt+F to enter fullscreen preview. Plain 'f' types into the
    // search input when the cursor is there (which it is by default after
    // navigation); Alt+f bypasses the text-field guard.
    await kupua.page.keyboard.press("Alt+f");
    // Wait briefly for fullscreen to activate
    await kupua.page.waitForTimeout(800);

    // Traverse 20 images: 5 slow (300ms each), 10 fast (80ms), 5 slow (300ms)
    for (let i = 0; i < 5; i++) {
      await kupua.page.keyboard.press("ArrowRight");
      await kupua.page.waitForTimeout(300);
    }
    for (let i = 0; i < 10; i++) {
      await kupua.page.keyboard.press("ArrowRight");
      await kupua.page.waitForTimeout(80);
    }
    for (let i = 0; i < 5; i++) {
      await kupua.page.keyboard.press("ArrowRight");
      await kupua.page.waitForTimeout(300);
    }

    // Press Alt+F to exit — trace("fullscreen-exit", "t_0") fires here.
    // Use Alt+f for the same reason as on entry (search input may regain focus).
    // exitPreview() scrolls the focused image into view; if it left the
    // buffer during traversal, a seek fires (sort-around-focus path).
    await clearTrace(kupua);
    await kupua.page.keyboard.press("Alt+f");
    await waitForStoreSettled(kupua, 20_000);

    {
      const entries = await readTrace(kupua);
      const m = computeMetrics("JB5", "fullscreen-exit (20 traversals)", entries, "fullscreen-exit");
      logStep("JB5", m);
      emitMetrics(m);
      expect(entries.some((e) => e.phase === "t_0" && e.action === "fullscreen-exit")).toBe(true);
    }
  });
});
