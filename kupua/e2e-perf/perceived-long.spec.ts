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
import { test, expect } from "./helpers";
import type { TraceEntry } from "@/lib/perceived-trace";
import { computeCorrelatedMetrics } from "./perceived-metrics.mjs";

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
  status_total_ms: number | null;
  raw: TraceEntry[];
  /** Store-reported ES timing — harvested after settle via page.evaluate(). */
  took?: number | null;
  fetchDuration?: number | null;
  seekTime?: number | null;
  aggTook?: number | null;
  aggFetchDuration?: number | null;
  interactionId?: string;
  scenarioRevision?: number;
  settledTotal?: number;
  resultRegime?: "buffer" | "indexed" | "seek";
  routes?: string[];
  dt_native_exit_ms?: number | null;
  dt_store_ready_ms?: number | null;
  dt_first_visible_frame_ms?: number | null;
  dt_visual_settled_ms?: number | null;
  matched_control_first_visible_ms?: number | null;
  matched_control_settled_ms?: number | null;
  matchedControlRoutes?: string[];
  matchedControlDesign?: "alternating-ab-ba";
}

function captureSuccessfulDataRoutes(kupua: any) {
  const routes = new Set<string>();
  const onResponse = (response: any) => {
    if (!response.ok()) return;
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/api/")) routes.add("media-api");
    if (path.startsWith("/es/")) routes.add("direct-es");
  };
  kupua.page.on("response", onResponse);
  return () => {
    kupua.page.off("response", onResponse);
    return routes.size > 0 ? [...routes].sort() : ["client-only"];
  };
}

async function navigateAndMeasure(
  kupua: any,
  query: string,
  expectedRegime: "buffer" | "indexed",
  id: "JA1" | "JB1",
) {
  const interactionId = `${id.toLowerCase()}-navigation`;
  const startEpochMs = Date.now();
  const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
  const untilParam = STABLE_UNTIL ? `&until=${STABLE_UNTIL}` : "";
  await kupua.page.goto(
    `/search?nonFree=true&query=${encodeURIComponent(query)}${untilParam}`,
  );

  const observed = await kupua.page.evaluate(async ({ targetQuery, targetRegime, targetId, start, correlationId }) => {
    const store = (window as any).__kupua_store__;
    const lifecycle = (window as any).__kupua_getSearchLifecycle__;
    if (!store || !lifecycle) throw new Error(`${targetId} lifecycle signal unavailable`);
    const toEpoch = (t: number) => performance.timeOrigin + t;
    const readRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    };
    const close = (left: Record<string, number>, right: Record<string, number>) =>
      Object.keys(left).every((key) => Math.abs(left[key] - right[key]) <= 1);

    let storeReadyEpochMs = null;
    let first = null;
    for (let attempt = 0; attempt < 300; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame((t) => {
        const state = store.getState();
        const life = lifecycle();
        const settled = life.started > 0 && life.settled === life.started
          && life.query === targetQuery && !state.loading && !state.error;
        if (settled && storeReadyEpochMs == null) storeReadyEpochMs = toEpoch(t);
        resolve();
      }));
      const state = store.getState();
      const regime = state.total <= 1_000 ? "buffer" : state.total <= 65_000 ? "indexed" : "seek";
      const container = document.querySelector('[aria-label="Image results grid"]')
        ?? document.querySelector('[aria-label="Image results table"]');
      const item = container?.querySelector('[data-image-id]');
      if (storeReadyEpochMs == null || regime !== targetRegime || !container || !item) {
        first = null;
        continue;
      }
      const current = {
        container: readRect(container),
        item: readRect(item),
        epochMs: Date.now(),
      };
      if (!first) {
        first = current;
        continue;
      }
      if (close(first.container, current.container) && close(first.item, current.item)) {
        return {
          entries: [
            { action: "navigation-search", phase: "t_0", epochMs: start, interactionId: correlationId },
            { action: "navigation-search", phase: "t_store_ready", epochMs: storeReadyEpochMs, interactionId: correlationId },
            { action: "navigation-search", phase: "t_first_visible_frame", epochMs: first.epochMs, interactionId: correlationId },
            { action: "navigation-search", phase: "t_visual_settled", epochMs: current.epochMs, interactionId: correlationId },
          ],
          settledTotal: state.total,
          resultRegime: regime,
        };
      }
      first = current;
    }
    throw new Error(`${targetId} ${targetRegime} navigation did not visibly settle`);
  }, {
    targetQuery: query,
    targetRegime: expectedRegime,
    targetId: id,
    start: startEpochMs,
    correlationId: interactionId,
  });
  return { ...observed, routes: finishRouteCapture() };
}

async function appendDetailVisualPhases(kupua: any, interactionId: string) {
  return kupua.page.evaluate(async (targetInteractionId: string) => {
    const readRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    };
    const close = (left: Record<string, number>, right: Record<string, number>) =>
      Object.keys(left).every((key) => Math.abs(left[key] - right[key]) <= 1);

    let first = null;
    for (let attempt = 0; attempt < 300; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const detail = document.querySelector('[data-detail-image-id]');
      const image = detail?.querySelector('img[fetchpriority="high"]') as HTMLImageElement | null;
      if (!image || !detail || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        first = null;
        continue;
      }
      const routeImageId = new URL(location.href).searchParams.get("image");
      if (!routeImageId || detail.getAttribute("data-detail-image-id") !== routeImageId) {
        throw new Error("JA2 detail route and rendered identity disagree");
      }
      const current = { image: readRect(image), detail: readRect(detail), t: performance.now() };
      if (!first) {
        first = current;
        continue;
      }
      if (close(first.image, current.image) && close(first.detail, current.detail)) {
        const entries = (window as any).__perceivedTrace__ as TraceEntry[];
        const state = (window as any).__kupua_store__.getState();
        const resultRegime = state.total <= 1_000 ? "buffer" : state.total <= 65_000 ? "indexed" : "seek";
        entries.push({ action: "open-detail", phase: "t_first_visible_frame", t: first.t, interactionId: targetInteractionId });
        entries.push({ action: "open-detail", phase: "t_visual_settled", t: current.t, interactionId: targetInteractionId });
        return { routes: [] as string[], settledTotal: state.total, resultRegime };
      }
      first = current;
    }
    throw new Error("JA2 decoded detail image did not visibly settle");
  }, interactionId);
}

async function appendMetadataSearchVisualPhases(
  kupua: any,
  interactionId: string,
  targetQuery: string,
  action: "metadata-click" | "facet-click" | "search",
) {
  return kupua.page.evaluate(async ({ targetInteractionId, expectedQuery, targetAction }) => {
    const store = (window as any).__kupua_store__;
    const lifecycle = (window as any).__kupua_getSearchLifecycle__;
    if (!store || !lifecycle) throw new Error("JA3 search lifecycle signal unavailable");
    const readRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    };
    const close = (left: Record<string, number>, right: Record<string, number>) =>
      Object.keys(left).every((key) => Math.abs(left[key] - right[key]) <= 1);

    let first = null;
    for (let attempt = 0; attempt < 300; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const state = store.getState();
      const life = lifecycle();
      const params = new URL(location.href).searchParams;
      const container = document.querySelector('[aria-label="Image results grid"]')
        ?? document.querySelector('[aria-label="Image results table"]');
      const item = container?.querySelector('[data-image-id]');
      const targetReady = params.get("query") === expectedQuery
        && !params.has("image")
        && life.query === expectedQuery
        && life.started > 0
        && life.settled === life.started
        && !state.loading
        && !state.error
        && !document.querySelector('[data-detail-image-id]');
      if (!targetReady || !container || !item) {
        first = null;
        continue;
      }
      const current = { container: readRect(container), item: readRect(item), t: performance.now() };
      if (!first) {
        first = current;
        continue;
      }
      if (close(first.container, current.container) && close(first.item, current.item)) {
        const entries = (window as any).__perceivedTrace__ as TraceEntry[];
        const resultRegime = state.total <= 1_000 ? "buffer" : state.total <= 65_000 ? "indexed" : "seek";
        entries.push({ action: targetAction, phase: "t_first_visible_frame", t: first.t, interactionId: targetInteractionId });
        entries.push({ action: targetAction, phase: "t_visual_settled", t: current.t, interactionId: targetInteractionId });
        return { routes: [] as string[], settledTotal: state.total, resultRegime };
      }
      first = current;
    }
    throw new Error("JA3 exact metadata search did not visibly settle");
  }, { targetInteractionId: interactionId, expectedQuery: targetQuery, targetAction: action });
}

async function appendIndexedScrollVisualPhases(kupua: any, interactionId: string, requestedPosition: number) {
  return kupua.page.evaluate(async ({ targetInteractionId, targetPosition }) => {
    const readRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    };
    const close = (left: Record<string, number>, right: Record<string, number>) =>
      Object.keys(left).every((key) => Math.abs(left[key] - right[key]) <= 1);

    let first = null;
    for (let attempt = 0; attempt < 180; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const state = (window as any).__kupua_store__?.getState();
      const track = document.querySelector('[data-testid="scrubber-track"]');
      const container = document.querySelector('[aria-label="Image results grid"]')
        ?? document.querySelector('[aria-label="Image results table"]');
      const visibleItems = container
        ? [...container.querySelectorAll('[data-image-id]')].filter((item) => {
            const itemRect = item.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            return itemRect.bottom > containerRect.top && itemRect.top < containerRect.bottom;
          })
        : [];
      if (!state || state.loading || state.error || track?.getAttribute("data-scrubber-mode") !== "indexed" || !container || visibleItems.length === 0) {
        first = null;
        continue;
      }
      const item = visibleItems[0];
      const current = { container: readRect(container), item: readRect(item), t: performance.now() };
      if (!first) {
        first = current;
        continue;
      }
      if (close(first.container, current.container) && close(first.item, current.item)) {
        const entries = (window as any).__perceivedTrace__ as TraceEntry[];
        const achievedPosition = Number(track.getAttribute("aria-valuenow"));
        const requestedRatio = targetPosition / Math.max(1, state.total - 1);
        const achievedRatio = achievedPosition / Math.max(1, state.total - 1);
        if (!Number.isFinite(achievedRatio) || Math.abs(achievedRatio - requestedRatio) > 0.05) {
          throw new Error(`JB4 achieved ratio ${achievedRatio} too far from requested ${requestedRatio}`);
        }
        entries.push({ action: "scrubber-scroll", phase: "t_first_visible_frame", t: first.t, interactionId: targetInteractionId });
        entries.push({ action: "scrubber-scroll", phase: "t_visual_settled", t: current.t, interactionId: targetInteractionId });
        return { settledTotal: state.total, resultRegime: "indexed" as const, requestedRatio, achievedRatio };
      }
      first = current;
    }
    throw new Error("JB4 indexed scrubber content did not become visibly stable");
  }, { targetInteractionId: interactionId, targetPosition: requestedPosition });
}

async function appendFullscreenExitVisualPhases(kupua: any, interactionId: string) {
  return kupua.page.evaluate(async (targetInteractionId: string) => {
    const readRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    };
    const close = (left: Record<string, number>, right: Record<string, number>) =>
      Object.keys(left).every((key) => Math.abs(left[key] - right[key]) <= 1);

    let first = null;
    for (let attempt = 0; attempt < 180; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const state = (window as any).__kupua_store__?.getState();
      const preview = document.querySelector('[data-fullscreen-preview]');
      const container = document.querySelector('[aria-label="Image results grid"]')
        ?? document.querySelector('[aria-label="Image results table"]');
      const focusedId = state?.focusedImageId;
      const focused = focusedId && container
        ? [...container.querySelectorAll('[data-image-id]')].find((item) => item.getAttribute("data-image-id") === focusedId)
        : null;
      if (!state || state.loading || state.error || document.fullscreenElement || preview?.getAttribute("data-fullscreen-preview") !== "inactive" || !container || !focused) {
        first = null;
        continue;
      }
      const containerRect = container.getBoundingClientRect();
      const focusedRect = focused.getBoundingClientRect();
      if (focusedRect.bottom <= containerRect.top || focusedRect.top >= containerRect.bottom) {
        first = null;
        continue;
      }
      const current = { container: readRect(container), focused: readRect(focused), t: performance.now() };
      if (!first) {
        first = current;
        continue;
      }
      if (close(first.container, current.container) && close(first.focused, current.focused)) {
        const entries = (window as any).__perceivedTrace__ as TraceEntry[];
        const resultRegime = state.total <= 1_000 ? "buffer" : state.total <= 65_000 ? "indexed" : "seek";
        entries.push({ action: "fullscreen-exit", phase: "t_first_visible_frame", t: first.t, interactionId: targetInteractionId });
        entries.push({ action: "fullscreen-exit", phase: "t_visual_settled", t: current.t, interactionId: targetInteractionId });
        return { settledTotal: state.total, resultRegime };
      }
      first = current;
    }
    throw new Error("JB5 fullscreen exit did not restore a stable focused list destination");
  }, interactionId);
}

function emitMetrics(metrics: PerceivedMetrics) {
  const { raw: _raw, ...rest } = metrics;
  const line = JSON.stringify(rest) + "\n";
  try { appendFileSync(METRICS_FILE, line); } catch { /* ok outside harness */ }
}

/** Read timing fields from the search store for diagnostic enrichment. */
async function readStoreTiming(kupua: any) {
  return kupua.page.evaluate(() => {
    const s = (window as any).__kupua_store__?.getState?.();
    if (!s) return null;
    return {
      took: s.took ?? null,
      fetchDuration: s.fetchDuration ?? null,
      seekTime: s.seekTime ?? null,
      aggTook: s.aggTook ?? null,
      aggFetchDuration: s.aggFetchDuration ?? null,
    };
  });
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
  const fp  = m.dt_first_visible_frame_ms != null ? `first_visible=${m.dt_first_visible_frame_ms}ms ` : "";
  const set = m.dt_visual_settled_ms != null ? `settled=${m.dt_visual_settled_ms}ms` : "settled=?ms";
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
    const navigation = await navigateAndMeasure(kupua, QUERY_SCROLL, "buffer", "JA1");

    // ── JA1: search submit (cold) ─────────────────────────────────────────
    {
      const correlated = computeCorrelatedMetrics({
        id: "JA1",
        label: "cold buffer navigation",
        action: "navigation-search",
        requiredPhases: ["t_store_ready", "t_first_visible_frame", "t_visual_settled"],
        entries: navigation.entries,
        timeField: "epochMs",
      });
      const m: PerceivedMetrics = {
        ...correlated,
        raw: [],
        dt_status_ms: null,
        status_total_ms: null,
        scenarioRevision: 2,
        settledTotal: navigation.settledTotal,
        resultRegime: navigation.resultRegime,
        routes: navigation.routes,
      };
      logStep("JA1", m);
      const timingJA1 = await readStoreTiming(kupua);
      if (timingJA1) Object.assign(m, timingJA1);
      emitMetrics(m);
      expect(navigation.entries).toHaveLength(4);
    }

    // ── JA2: double-click prescribed image → detail overlay opens ─────────
    // Single click only focuses in explicit mode; double-click runs
    // enterDetail (matches Kahuna behaviour). enterDetail navigates with
    // ?image=…, so wait for that URL update before reading the store.
    await clearTrace(kupua);
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    const imageCell = kupua.page.locator(`[data-image-id="${IMG_SCROLL}"]`).first();
    await imageCell.waitFor({ timeout: 10_000 });
    await imageCell.dblclick();
    await kupua.page.waitForURL(/[?&]image=/, { timeout: 10_000 });
    await waitForStoreSettled(kupua, 10_000);

    {
      const storeEntries = await readTrace(kupua);
      const starts = storeEntries.filter((entry) =>
        entry.action === "open-detail" && entry.phase === "t_0" && entry.interactionId
      );
      expect(starts).toHaveLength(1);
      const context = await appendDetailVisualPhases(kupua, starts[0].interactionId!);
      context.routes = finishRouteCapture();
      const entries = await readTrace(kupua);
      const correlated = computeCorrelatedMetrics({
        id: "JA2",
        label: "image-dblclick decoded detail",
        action: "open-detail",
        requiredPhases: ["t_store_ready", "t_first_visible_frame", "t_visual_settled"],
        entries,
      });
      const m: PerceivedMetrics = {
        id: "JA2",
        label: "image-dblclick decoded detail",
        action: "open-detail",
        dt_ack_ms: null,
        dt_status_ms: null,
        status_total_ms: null,
        raw: correlated.raw,
        interactionId: correlated.interactionId,
        dt_store_ready_ms: correlated.dt_store_ready_ms,
        dt_first_visible_frame_ms: correlated.dt_first_visible_frame_ms,
        dt_visual_settled_ms: correlated.dt_visual_settled_ms,
        scenarioRevision: 2,
        ...context,
      };
      logStep("JA2", m);
      const timingJA2 = await readStoreTiming(kupua);
      if (timingJA2) Object.assign(m, timingJA2);
      emitMetrics(m);
    }

    // ── JA3: metadata click on detail panel ───────────────────────────────
    // The "Details" accordion in the image detail overlay may be collapsed if
    // kupua-panel-config in localStorage was saved with detail-metadata:false
    // (e.g. from a prior dev session). Expand it before looking for buttons.
    // aria-controls is set by AccordionSection and uniquely identifies the
    // section regardless of other "Details"-labelled elements on the page.
    const detailMetadataBtn = kupua.page.locator(
      'button[aria-controls="section-detail-metadata"][aria-expanded="false"]'
    );
    if (await detailMetadataBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await detailMetadataBtn.click();
      await kupua.page.waitForTimeout(200);
    }

    const targetQuery = "colourModel:RGB";
    const colourModelButton = kupua.page.locator(
      'dl button[data-cql-key="colourModel"][data-cql-value="RGB"]',
    );
    await expect(colourModelButton).toHaveCount(1);
    await colourModelButton.waitFor({ state: "visible", timeout: 15_000 });
    // Scroll into view so the click hits the button reliably even if the
    // metadata panel has a long content list and the button is off-screen.
    await colourModelButton.scrollIntoViewIfNeeded();

    await clearTrace(kupua);
    const finishMetadataRouteCapture = captureSuccessfulDataRoutes(kupua);
    // Use Playwright's standard click — it dispatches real mousedown/mouseup/
    // click events through the browser, so React's synthetic event delegation
    // sees them as user-initiated and the metadata-click trace fires inside
    // useMetadataSearch's callback. (Programmatic .click() via page.evaluate
    // does fire the search but, observed empirically, does NOT cause the
    // trace to land in the buffer — likely a React-event-system quirk.)
    await colourModelButton.click();

    {
      await kupua.page.waitForURL((url: URL) =>
        url.searchParams.get("query") === targetQuery && !url.searchParams.has("image"),
      );
      const storeEntries = await readTrace(kupua);
      const starts = storeEntries.filter((entry) =>
        entry.action === "metadata-click" && entry.phase === "t_0" && entry.interactionId
      );
      expect(starts).toHaveLength(1);
      const context = await appendMetadataSearchVisualPhases(kupua, starts[0].interactionId!, targetQuery, "metadata-click");
      context.routes = finishMetadataRouteCapture();
      const entries = await readTrace(kupua);
      const correlated = computeCorrelatedMetrics({
        id: "JA3",
        label: "metadata-click colourModel:RGB",
        action: "metadata-click",
        requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
        entries,
      });
      const m: PerceivedMetrics = {
        id: "JA3",
        label: "metadata-click colourModel:RGB",
        action: "metadata-click",
        dt_ack_ms: correlated.dt_ack_ms,
        dt_status_ms: null,
        status_total_ms: null,
        raw: correlated.raw,
        interactionId: correlated.interactionId,
        dt_store_ready_ms: correlated.dt_store_ready_ms,
        dt_first_visible_frame_ms: correlated.dt_first_visible_frame_ms,
        dt_visual_settled_ms: correlated.dt_visual_settled_ms,
        scenarioRevision: 2,
        ...context,
      };
      logStep("JA3", m);
      const timingJA3 = await readStoreTiming(kupua);
      if (timingJA3) Object.assign(m, timingJA3);
      emitMetrics(m);
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
    const navigation = await navigateAndMeasure(kupua, QUERY_TWOTIER, "indexed", "JB1");

    // ── JB1: search submit ────────────────────────────────────────────────
    {
      const correlated = computeCorrelatedMetrics({
        id: "JB1",
        label: "cold indexed navigation",
        action: "navigation-search",
        requiredPhases: ["t_store_ready", "t_first_visible_frame", "t_visual_settled"],
        entries: navigation.entries,
        timeField: "epochMs",
      });
      const m: PerceivedMetrics = {
        ...correlated,
        raw: [],
        dt_status_ms: null,
        status_total_ms: null,
        scenarioRevision: 2,
        settledTotal: navigation.settledTotal,
        resultRegime: navigation.resultRegime,
        routes: navigation.routes,
      };
      logStep("JB1", m);
      const timingJB1 = await readStoreTiming(kupua);
      if (timingJB1) Object.assign(m, timingJB1);
      emitMetrics(m);
      expect(navigation.entries).toHaveLength(4);
    }

    // ── JB2: open filters, click subject:sport ────────────────────────────
    {
      const baseQuery = QUERY_TWOTIER;
      const targetQuery = `${QUERY_TWOTIER} subject:sport`;
      const controlFirst = Number(process.env.KUPUA_PERF_RUN_INDEX ?? "1") % 2 === 1;

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

      const resetToBase = async () => {
        await kupua.page.evaluate((query: string) => {
          const cql = document.querySelector("cql-input");
          if (!cql) throw new Error("JB2 reset cql-input not found");
          cql.dispatchEvent(new CustomEvent("queryChange", { detail: { queryStr: query } }));
        }, baseQuery);
        await kupua.page.waitForURL((url: URL) => url.searchParams.get("query") === baseQuery);
        await kupua.page.waitForFunction(
          (query: string) => {
            const lifecycle = (window as any).__kupua_getSearchLifecycle__?.();
            const state = (window as any).__kupua_store__?.getState?.();
            return lifecycle?.query === query && lifecycle.started > 0
              && lifecycle.settled === lifecycle.started && state && !state.loading;
          },
          baseQuery,
        );
        await sportBtn.waitFor({ timeout: 30_000 });
      };

      const measureControl = async () => {
        await clearTrace(kupua);
        const finishRoutes = captureSuccessfulDataRoutes(kupua);
        await kupua.page.evaluate((query: string) => {
          const cql = document.querySelector("cql-input");
          if (!cql) throw new Error("JB2 control cql-input not found");
          cql.dispatchEvent(new CustomEvent("queryChange", { detail: { queryStr: query } }));
        }, targetQuery);
        await kupua.page.waitForURL((url: URL) => url.searchParams.get("query") === targetQuery);
        const storeEntries = await readTrace(kupua);
        const starts = storeEntries.filter((entry) =>
          entry.action === "search" && entry.phase === "t_0" && entry.interactionId
        );
        expect(starts).toHaveLength(1);
        const context = await appendMetadataSearchVisualPhases(kupua, starts[0].interactionId!, targetQuery, "search");
        context.routes = finishRoutes();
        return {
          correlated: computeCorrelatedMetrics({
            id: "JB2-control",
            label: "matched no-anchor subject:sport",
            action: "search",
            requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
            entries: await readTrace(kupua),
          }),
          context,
        };
      };

      const measureFacet = async () => {
        await clearTrace(kupua);
        const finishRoutes = captureSuccessfulDataRoutes(kupua);
        await sportBtn.click();
        await kupua.page.waitForURL((url: URL) => url.searchParams.get("query") === targetQuery);
        const storeEntries = await readTrace(kupua);
        const starts = storeEntries.filter((entry) =>
          entry.action === "facet-click" && entry.phase === "t_0" && entry.interactionId
        );
        expect(starts).toHaveLength(1);
        const context = await appendMetadataSearchVisualPhases(kupua, starts[0].interactionId!, targetQuery, "facet-click");
        context.routes = finishRoutes();
        return {
          correlated: computeCorrelatedMetrics({
            id: "JB2",
            label: "facet-click subject:sport",
            action: "facet-click",
            requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
            entries: await readTrace(kupua),
          }),
          context,
        };
      };

      let control;
      let facet;
      if (controlFirst) {
        control = await measureControl();
        await resetToBase();
        facet = await measureFacet();
      } else {
        facet = await measureFacet();
        await resetToBase();
        control = await measureControl();
      }

      const { correlated, context } = facet;
      const controlCorrelated = control.correlated;
      const controlContext = control.context;
      const m: PerceivedMetrics = {
        id: "JB2",
        label: "facet-click subject:sport",
        action: "facet-click",
        dt_ack_ms: correlated.dt_ack_ms,
        dt_status_ms: null,
        status_total_ms: null,
        raw: correlated.raw,
        interactionId: correlated.interactionId,
        dt_store_ready_ms: correlated.dt_store_ready_ms,
        dt_first_visible_frame_ms: correlated.dt_first_visible_frame_ms,
        dt_visual_settled_ms: correlated.dt_visual_settled_ms,
        scenarioRevision: 2,
        ...context,
        matched_control_first_visible_ms: controlCorrelated.dt_first_visible_frame_ms,
        matched_control_settled_ms: controlCorrelated.dt_visual_settled_ms,
        matchedControlRoutes: controlContext.routes,
        matchedControlDesign: "alternating-ab-ba",
      };
      logStep("JB2", m);
      const timingJB2 = await readStoreTiming(kupua);
      if (timingJB2) Object.assign(m, timingJB2);
      emitMetrics(m);
    }

    // ── JB3: alt+click to exclude a subject (exclude filter) ────────────────
    // After JB2's facet click, Playwright may still be tracking the pushState
    // navigation. Drain it first, then re-open panel/section if needed.
    {
      const targetQuery = `${QUERY_TWOTIER} subject:sport -colourProfile:"sRGB IEC61966-2.1"`;

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

      const excludeBtn = kupua.page
        .locator('[data-facet-field="fileMetadata.icc.Profile Description"][data-facet-key="sRGB IEC61966-2.1"]');
      await expect(excludeBtn).toHaveCount(1);
      await excludeBtn.waitFor({ timeout: 30_000 });

      await clearTrace(kupua);
      const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
      await excludeBtn.click({ modifiers: ["Alt"] });
      await kupua.page.waitForURL((url: URL) => url.searchParams.get("query") === targetQuery);
      const storeEntries = await readTrace(kupua);
      const starts = storeEntries.filter((entry) =>
        entry.action === "facet-click" && entry.phase === "t_0" && entry.interactionId
      );
      expect(starts).toHaveLength(1);
      const context = await appendMetadataSearchVisualPhases(
        kupua,
        starts[0].interactionId!,
        targetQuery,
        "facet-click",
      );
      context.routes = finishRouteCapture();
      expect(context.resultRegime).toBe("indexed");
      const entries = await readTrace(kupua);
      const correlated = computeCorrelatedMetrics({
        id: "JB3",
        label: "facet-exclude -colourProfile:sRGB",
        action: "facet-click",
        requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
        entries,
      });
      const m: PerceivedMetrics = {
        id: "JB3",
        label: "facet-exclude -colourProfile:sRGB",
        action: "facet-click",
        dt_ack_ms: correlated.dt_ack_ms,
        dt_status_ms: null,
        status_total_ms: null,
        raw: correlated.raw,
        interactionId: correlated.interactionId,
        dt_store_ready_ms: correlated.dt_store_ready_ms,
        dt_first_visible_frame_ms: correlated.dt_first_visible_frame_ms,
        dt_visual_settled_ms: correlated.dt_visual_settled_ms,
        scenarioRevision: 2,
        ...context,
      };
      logStep("JB3", m);
      const timingJB3 = await readStoreTiming(kupua);
      if (timingJB3) Object.assign(m, timingJB3);
      emitMetrics(m);
    }

    // ── JB4: scrubber seek to ~50% ────────────────────────────────────────
    await expect(kupua.scrubber).toHaveAttribute("data-scrubber-mode", "indexed");
    await clearTrace(kupua);
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    const scrubberTrack = kupua.page.locator('[data-testid="scrubber-track"]').first();
    const trackBox = await scrubberTrack.boundingBox();
    if (!trackBox) throw new Error("Scrubber track not found");
    const totalBeforeScroll = await kupua.page.evaluate(
      () => (window as any).__kupua_store__.getState().total as number,
    );
    const requestedPosition = Math.round((totalBeforeScroll - 1) * 0.5);
    await kupua.page.mouse.click(
      trackBox.x + trackBox.width * 0.5,
      trackBox.y + trackBox.height * 0.5,
    );

    {
      const startEntries = await readTrace(kupua);
      const starts = startEntries.filter((entry) =>
        entry.action === "scrubber-scroll" && entry.phase === "t_0" && entry.interactionId
      );
      expect(starts).toHaveLength(1);
      const context = await appendIndexedScrollVisualPhases(kupua, starts[0].interactionId!, requestedPosition);
      const routes = finishRouteCapture();
      const entries = await readTrace(kupua);
      const correlated = computeCorrelatedMetrics({
        id: "JB4",
        label: "scrubber-indexed-scroll ~50%",
        action: "scrubber-scroll",
        requiredPhases: ["t_first_visible_frame", "t_visual_settled"],
        entries,
      });
      const m: PerceivedMetrics = {
        id: "JB4",
        label: "scrubber-indexed-scroll ~50%",
        action: "scrubber-scroll",
        dt_ack_ms: null,
        dt_status_ms: null,
        status_total_ms: null,
        raw: correlated.raw,
        interactionId: correlated.interactionId,
        dt_first_visible_frame_ms: correlated.dt_first_visible_frame_ms,
        dt_visual_settled_ms: correlated.dt_visual_settled_ms,
        scenarioRevision: 2,
        routes,
        ...context,
      };
      logStep("JB4", m);
      const timingJB4 = await readStoreTiming(kupua);
      if (timingJB4) Object.assign(m, timingJB4);
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
    const finishExitRouteCapture = captureSuccessfulDataRoutes(kupua);
    await kupua.page.keyboard.press("Alt+f");

    {
      const startEntries = await readTrace(kupua);
      const starts = startEntries.filter((entry) =>
        entry.action === "fullscreen-exit" && entry.phase === "t_0" && entry.interactionId
      );
      expect(starts).toHaveLength(1);
      const context = await appendFullscreenExitVisualPhases(kupua, starts[0].interactionId!);
      const routes = finishExitRouteCapture();
      const entries = await readTrace(kupua);
      const correlated = computeCorrelatedMetrics({
        id: "JB5",
        label: "fullscreen-preview exit after 20 traversals",
        action: "fullscreen-exit",
        requiredPhases: ["t_native_exit", "t_first_visible_frame", "t_visual_settled"],
        entries,
      });
      const m: PerceivedMetrics = {
        id: "JB5",
        label: "fullscreen-preview exit after 20 traversals",
        action: "fullscreen-exit",
        dt_ack_ms: null,
        dt_status_ms: null,
        status_total_ms: null,
        raw: correlated.raw,
        interactionId: correlated.interactionId,
        dt_native_exit_ms: correlated.dt_native_exit_ms,
        dt_first_visible_frame_ms: correlated.dt_first_visible_frame_ms,
        dt_visual_settled_ms: correlated.dt_visual_settled_ms,
        scenarioRevision: 2,
        routes,
        ...context,
      };
      logStep("JB5", m);
      const timingJB5 = await readStoreTiming(kupua);
      if (timingJB5) Object.assign(m, timingJB5);
      emitMetrics(m);
    }
  });
});
