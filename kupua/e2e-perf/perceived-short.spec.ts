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
 *   - dt_first_visible_frame_ms: first browser frame with target content
 *   - dt_visual_settled_ms: target content stable over the scenario window
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
import { test, expect } from "./helpers";
import type { TraceEntry } from "@/lib/perceived-trace";
import { computeCorrelatedMetrics } from "./perceived-metrics.mjs";

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
  /** Time from the first correlated status phase to the honest terminal boundary. */
  status_total_ms: number | null;
  /** raw trace entries for debugging */
  raw: TraceEntry[];
  /** Store-reported ES timing — harvested after settle via page.evaluate(). */
  took?: number | null;
  fetchDuration?: number | null;
  seekTime?: number | null;
  aggTook?: number | null;
  aggFetchDuration?: number | null;
  /** seek:* performance.measure entries — only present for PP7/PP7b/PP7c. */
  seekMeasures?: Array<{ name: string; duration: number }>;
  interactionId?: string;
  scenarioRevision?: number;
  settledTotal?: number;
  resultRegime?: "buffer" | "indexed" | "seek";
  routes?: string[];
  dt_store_ready_ms?: number | null;
  dt_first_visible_frame_ms?: number | null;
  dt_visual_settled_ms?: number | null;
  requestedRatio?: number;
  achievedRatio?: number;
  setupGlobalPosition?: number;
  setupBufferOffset?: number;
  setupBufferLength?: number;
  setupVisibleRangeRatio?: number;
  setupExtended?: boolean;
  setupEvictGeneration?: number;
  setupEvictedCount?: number;
  anchorDriftPx?: number;
  anchorDriftRatio?: number;
  metricClass?: "user-action" | "background-diagnostic";
  mapEntryCount?: number;
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

async function appendFocusedSortVisualPhases(
  kupua: any,
  interactionId: string,
  scenarioId: "PP3" | "PP4",
) {
  return kupua.page.evaluate(async ({ targetInteractionId, targetScenarioId }) => {
    const store = (window as any).__kupua_store__;
    if (!store) throw new Error("Search store unavailable");

    const snapshot = () => {
      const state = store.getState();
      const id = state.focusedImageId;
      const cell = id ? document.querySelector(`[data-image-id="${CSS.escape(id)}"]`) : null;
      const container = document.querySelector('[aria-label="Image results grid"]')
        ?? document.querySelector('[aria-label="Image results table"]');
      if (!cell || !container) return null;
      const cellRect = cell.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      if (cellRect.bottom <= containerRect.top || cellRect.top >= containerRect.bottom) return null;
      return {
        top: cellRect.top - containerRect.top,
        left: cellRect.left - containerRect.left,
      };
    };

    let first = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const current = snapshot();
      if (!current) {
        first = null;
        continue;
      }
      if (!first) {
        first = { ...current, t: performance.now() };
        continue;
      }
      if (Math.abs(current.top - first.top) <= 1 && Math.abs(current.left - first.left) <= 1) {
        const entries = (window as any).__perceivedTrace__ as TraceEntry[];
        const now = performance.now();
        entries.push({
          action: "sort-around-focus",
          phase: "t_first_visible_frame",
          t: first.t,
          interactionId: targetInteractionId,
        });
        entries.push({
          action: "sort-around-focus",
          phase: "t_visual_settled",
          t: performance.now(),
          interactionId: targetInteractionId,
        });

        const total = stateTotal(store.getState());
        const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const routes = new Set<string>();
        for (const resource of resources) {
          const url = new URL(resource.name, location.origin);
          if (url.pathname.startsWith("/api/")) routes.add("media-api");
          if (url.pathname.startsWith("/es/")) routes.add("direct-es");
        }
        return {
          settledTotal: total,
          resultRegime: total <= 1_000 ? "buffer" : total <= 65_000 ? "indexed" : "seek",
          routes: routes.size > 0 ? [...routes].sort() : ["client-only"],
        };
      }
      first = current;
    }
    throw new Error(`${targetScenarioId} focused cell did not become visibly stable within 120 frames`);

    function stateTotal(state: any): number {
      if (!Number.isFinite(state.total)) throw new Error(`${targetScenarioId} settled total is unavailable`);
      return state.total;
    }
  }, { targetInteractionId: interactionId, targetScenarioId: scenarioId });
}

async function appendDensityVisualPhases(kupua: any, interactionId: string) {
  return kupua.page.evaluate(async (targetInteractionId: string) => {
    const readRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    };
    const close = (left: Record<string, number>, right: Record<string, number>) =>
      Object.keys(left).every((key) => Math.abs(left[key] - right[key]) <= 1);

    let first = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const table = document.querySelector('[aria-label="Image results table"]');
      const grid = document.querySelector('[aria-label="Image results grid"]');
      const row = table?.querySelector('[data-image-id]');
      if (!table || !row || grid) {
        first = null;
        continue;
      }
      const current = { table: readRect(table), row: readRect(row), t: performance.now() };
      if (!first) {
        first = current;
        continue;
      }
      if (close(first.table, current.table) && close(first.row, current.row)) {
        const entries = (window as any).__perceivedTrace__ as TraceEntry[];
        entries.push({
          action: "density-swap",
          phase: "t_first_visible_frame",
          t: first.t,
          interactionId: targetInteractionId,
        });
        entries.push({
          action: "density-swap",
          phase: "t_visual_settled",
          t: current.t,
          interactionId: targetInteractionId,
        });
        const state = (window as any).__kupua_store__?.getState();
        if (!state || !Number.isFinite(state.total)) throw new Error("PP6 settled total is unavailable");
        const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const networkRoutes = resources
          .map((resource) => new URL(resource.name, location.origin).pathname)
          .filter((path) => path.startsWith("/api/") || path.startsWith("/es/"));
        if (networkRoutes.length > 0) throw new Error("PP6 unexpectedly issued a data request");
        return {
          settledTotal: state.total,
          resultRegime: state.total <= 1_000 ? "buffer" : state.total <= 65_000 ? "indexed" : "seek",
          routes: ["client-only"],
        };
      }
      first = current;
    }
    throw new Error("PP6 table did not become visibly stable within 120 frames");
  }, interactionId);
}

async function settleMidBufferSetup(kupua: any) {
  return kupua.page.evaluate(async () => {
    const store = (window as any).__kupua_store__;
    const container = document.querySelector('[aria-label="Image results grid"]') as HTMLElement | null;
    const track = document.querySelector('[data-testid="scrubber-track"]');
    if (!store || !container || !track) throw new Error("PP6b setup controls unavailable");

    const before = store.getState();
    const beforeMutation = {
      evictGeneration: before._forwardEvictGeneration,
    };
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = maxScrollTop * 0.5;
    container.dispatchEvent(new Event("scroll"));
    let stablePosition = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const state = store.getState();
      const position = Number(track.getAttribute("aria-valuenow"));
      if (state.loading || state.error || state._extendForwardInFlight || !Number.isFinite(position)) {
        stablePosition = null;
        continue;
      }
      if (stablePosition === position) {
        const rangeRatio = container.scrollTop / Math.max(1, maxScrollTop);
        if (rangeRatio < 0.4 || rangeRatio > 0.6) {
          throw new Error(`PP6b achieved visible-range ratio ${rangeRatio}, expected 0.4-0.6`);
        }
        return {
          setupGlobalPosition: position,
          setupBufferOffset: state.bufferOffset,
          setupBufferLength: state.results.length,
          setupVisibleRangeRatio: rangeRatio,
          setupExtended: state.results.length !== before.results.length
            || state.bufferOffset !== before.bufferOffset
            || state._forwardEvictGeneration !== beforeMutation.evictGeneration,
        };
      }
      stablePosition = position;
    }
    throw new Error("PP6b mid-buffer position did not settle");
  });
}

async function settlePostEvictionSetup(kupua: any) {
  const before = await kupua.getStoreState();
  await kupua.page.evaluate(async (previousGeneration: number) => {
    const store = (window as any).__kupua_store__;
    if (!store) throw new Error("PP6c search store unavailable");

    for (let attempt = 0; attempt < 20; attempt++) {
      const beforeExtend = store.getState();
      await beforeExtend.extendForward();
      const afterExtend = store.getState();
      if (afterExtend._forwardEvictGeneration > previousGeneration) return;

      const changed = afterExtend.bufferOffset !== beforeExtend.bufferOffset
        || afterExtend.results.length !== beforeExtend.results.length;
      await new Promise((resolve) => setTimeout(resolve, changed ? 120 : 250));
    }
    throw new Error("PP6c could not produce a forward eviction after 20 sequential extensions");
  }, before.forwardEvictGeneration);

  await kupua.page.waitForFunction(
    (previousGeneration: number) => {
      const state = (window as any).__kupua_store__?.getState();
      return state
        && state._forwardEvictGeneration > previousGeneration
        && state.bufferOffset > 0
        && !state._extendForwardInFlight
        && !state.loading
        && !state.error;
    },
    before.forwardEvictGeneration,
    { timeout: 20_000 },
  );

  await kupua.page.evaluate(() => {
    const container = document.querySelector('[aria-label="Image results grid"]') as HTMLElement | null;
    if (!container) throw new Error("PP6c grid unavailable after eviction");
    container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight) * 0.5;
    container.dispatchEvent(new Event("scroll"));
  });
  await kupua.page.waitForFunction(
    () => {
      const state = (window as any).__kupua_store__?.getState();
      return state && !state._extendForwardInFlight && !state._extendBackwardInFlight && !state.loading && !state.error;
    },
    { timeout: 20_000 },
  );

  return kupua.page.evaluate(async () => {
    const store = (window as any).__kupua_store__;
    const track = document.querySelector('[data-testid="scrubber-track"]');
    let previousPosition = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const state = store?.getState();
      const position = Number(track?.getAttribute("aria-valuenow"));
      if (
        !state || state.loading || state.error
        || state._extendForwardInFlight || state._extendBackwardInFlight
        || !Number.isFinite(position)
      ) {
        previousPosition = null;
        continue;
      }
      if (previousPosition === position) {
        return {
          setupGlobalPosition: position,
          setupBufferOffset: state.bufferOffset,
          setupBufferLength: state.results.length,
          setupExtended: true,
          setupEvictGeneration: state._forwardEvictGeneration,
          setupEvictedCount: state._lastForwardEvictCount,
        };
      }
      previousPosition = position;
    }
    throw new Error("PP6c post-eviction position did not settle");
  });
}

async function appendNoFocusSortVisualPhases(kupua: any, interactionId: string) {
  return kupua.page.evaluate(async (targetInteractionId: string) => {
    const readRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    };
    const close = (left: Record<string, number>, right: Record<string, number>) =>
      Object.keys(left).every((key) => Math.abs(left[key] - right[key]) <= 1);

    let first = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const state = (window as any).__kupua_store__?.getState();
      const primarySort = state?.params?.orderBy?.split(",")[0]?.replace(/^-/, "");
      const container = document.querySelector('[aria-label="Image results grid"]')
        ?? document.querySelector('[aria-label="Image results table"]');
      const item = container?.querySelector('[data-image-id]');
      if (!state || state.loading || state.error || state.sortAroundFocusStatus || primarySort !== "width" || !container || !item) {
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
        entries.push({
          action: "sort-no-focus",
          phase: "t_first_visible_frame",
          t: first.t,
          interactionId: targetInteractionId,
        });
        entries.push({
          action: "sort-no-focus",
          phase: "t_visual_settled",
          t: current.t,
          interactionId: targetInteractionId,
        });
        const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const routes = new Set<string>();
        for (const resource of resources) {
          const path = new URL(resource.name, location.origin).pathname;
          if (path.startsWith("/api/")) routes.add("media-api");
          if (path.startsWith("/es/")) routes.add("direct-es");
        }
        if (!Number.isFinite(state.total)) throw new Error("PP2 settled total is unavailable");
        return {
          settledTotal: state.total,
          resultRegime: state.total <= 1_000 ? "buffer" : state.total <= 65_000 ? "indexed" : "seek",
          routes: routes.size > 0 ? [...routes].sort() : ["client-only"],
        };
      }
      first = current;
    }
    throw new Error("PP2 Width context did not become visibly stable within 120 frames");
  }, interactionId);
}

async function appendFilterVisualPhases(kupua: any, interactionId: string) {
  return kupua.page.evaluate(async (targetInteractionId: string) => {
    const readRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    };
    const close = (left: Record<string, number>, right: Record<string, number>) =>
      Object.keys(left).every((key) => Math.abs(left[key] - right[key]) <= 1);

    let first = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const state = (window as any).__kupua_store__?.getState();
      const checkbox = document.querySelector('label input[type="checkbox"]') as HTMLInputElement | null;
      const container = document.querySelector('[aria-label="Image results grid"]')
        ?? document.querySelector('[aria-label="Image results table"]');
      const item = container?.querySelector('[data-image-id]');
      if (!state || state.loading || state.error || state.sortAroundFocusStatus || state.params.nonFree != null || !checkbox?.checked || !container || !item) {
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
        entries.push({
          action: "filter-toggle",
          phase: "t_first_visible_frame",
          t: first.t,
          interactionId: targetInteractionId,
        });
        entries.push({
          action: "filter-toggle",
          phase: "t_visual_settled",
          t: current.t,
          interactionId: targetInteractionId,
        });
        const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const routes = new Set<string>();
        for (const resource of resources) {
          const path = new URL(resource.name, location.origin).pathname;
          if (path.startsWith("/api/")) routes.add("media-api");
          if (path.startsWith("/es/")) routes.add("direct-es");
        }
        if (!Number.isFinite(state.total)) throw new Error("PP5 settled total is unavailable");
        return {
          settledTotal: state.total,
          resultRegime: state.total <= 1_000 ? "buffer" : state.total <= 65_000 ? "indexed" : "seek",
          routes: routes.size > 0 ? [...routes].sort() : ["client-only"],
        };
      }
      first = current;
    }
    throw new Error("PP5 free-only context did not become visibly stable within 120 frames");
  }, interactionId);
}

async function appendQueryVisualPhases(kupua: any, interactionId: string) {
  return kupua.page.evaluate(async (targetInteractionId: string) => {
    const readRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    };
    const close = (left: Record<string, number>, right: Record<string, number>) =>
      Object.keys(left).every((key) => Math.abs(left[key] - right[key]) <= 1);

    let first = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const state = (window as any).__kupua_store__?.getState();
      const container = document.querySelector('[aria-label="Image results grid"]')
        ?? document.querySelector('[aria-label="Image results table"]');
      const item = container?.querySelector('[data-image-id]');
      if (!state || state.loading || state.error || state.sortAroundFocusStatus || state.params.query !== "sport" || !container || !item) {
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
        entries.push({ action: "search", phase: "t_first_visible_frame", t: first.t, interactionId: targetInteractionId });
        entries.push({ action: "search", phase: "t_visual_settled", t: current.t, interactionId: targetInteractionId });
        const routes = new Set<string>();
        const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        for (const resource of resources) {
          const path = new URL(resource.name, location.origin).pathname;
          if (path.startsWith("/api/")) routes.add("media-api");
          if (path.startsWith("/es/")) routes.add("direct-es");
        }
        if (!Number.isFinite(state.total)) throw new Error("PP8 settled total is unavailable");
        return {
          settledTotal: state.total,
          resultRegime: state.total <= 1_000 ? "buffer" : state.total <= 65_000 ? "indexed" : "seek",
          routes: routes.size > 0 ? [...routes].sort() : ["client-only"],
        };
      }
      first = current;
    }
    throw new Error("PP8 sport context did not become visibly stable within 120 frames");
  }, interactionId);
}

async function appendHomeVisualPhases(kupua: any, interactionId: string) {
  return kupua.page.evaluate(async (targetInteractionId: string) => {
    const readRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    };
    const close = (left: Record<string, number>, right: Record<string, number>) =>
      Object.keys(left).every((key) => Math.abs(left[key] - right[key]) <= 1);

    let first = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const state = (window as any).__kupua_store__?.getState();
      const url = new URL(location.href);
      const container = document.querySelector('[aria-label="Image results grid"]');
      const firstResultId = state?.results?.[0]?.id;
      const item = firstResultId
        ? container?.querySelector(`[data-image-id="${CSS.escape(firstResultId)}"]`)
        : null;
      const scrubber = document.querySelector('[role="slider"][data-scrubber-mode="seek"]');
      const scrubberPosition = Number(scrubber?.getAttribute("aria-valuenow"));
      const homeUrl = url.pathname === "/search"
        && url.searchParams.size === 1
        && url.searchParams.get("nonFree") === "true";
      const homeStore = state?.params?.nonFree === "true"
        && state.params.query == null
        && state.params.until == null;
      if (
        !state || state.loading || state.error || state.sortAroundFocusStatus
        || !homeUrl || !homeStore || state.bufferOffset !== 0
        || !container || container.scrollTop > 1 || !item
        || !scrubber || scrubberPosition !== 0
      ) {
        first = null;
        continue;
      }
      const containerRect = container.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      if (itemRect.bottom <= containerRect.top || itemRect.top >= containerRect.bottom) {
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
        entries.push({ action: "home-logo", phase: "t_first_visible_frame", t: first.t, interactionId: targetInteractionId });
        entries.push({ action: "home-logo", phase: "t_visual_settled", t: current.t, interactionId: targetInteractionId });
        if (!Number.isFinite(state.total) || state.total <= 65_000) {
          throw new Error(`PP1 unpinned home total ${state.total} is not in the seek regime`);
        }
        return { settledTotal: state.total, resultRegime: "seek" as const };
      }
      first = current;
    }
    throw new Error("PP1 unpinned home did not become visibly stable at absolute position zero within 120 frames");
  }, interactionId);
}

async function captureChipRemovalAnchor(kupua: any) {
  return kupua.page.evaluate(() => {
    const container = document.querySelector('[aria-label="Image results grid"]');
    if (!(container instanceof HTMLElement)) throw new Error("PP9 grid container unavailable");
    const containerRect = container.getBoundingClientRect();
    const getViewportAnchor = (window as any).__kupua_getViewportAnchorId__;
    const imageId = typeof getViewportAnchor === "function" ? getViewportAnchor() : null;
    const item = imageId
      ? container.querySelector(`[data-image-id="${CSS.escape(imageId)}"]`)
      : null;
    const itemRect = item?.getBoundingClientRect();
    if (!imageId || !itemRect || itemRect.bottom <= containerRect.top || itemRect.top >= containerRect.bottom) {
      throw new Error("PP9 app-owned viewport anchor is not visibly rendered before chip removal");
    }
    return {
      imageId,
      top: itemRect.top - containerRect.top,
      viewportHeight: containerRect.height,
    };
  });
}

async function appendChipRemovalVisualPhases(
  kupua: any,
  interactionId: string,
  anchor: { imageId: string; top: number; viewportHeight: number },
) {
  return kupua.page.evaluate(async ({ targetInteractionId, targetAnchor, stableUntil }) => {
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
      const url = new URL(location.href);
      const container = document.querySelector('[aria-label="Image results grid"]');
      const item = container?.querySelector(`[data-image-id="${CSS.escape(targetAnchor.imageId)}"]`);
      const deleteHandles = document.querySelector("cql-input")?.shadowRoot
        ?.querySelectorAll(".Cql__ChipWrapperDeleteHandle");
      if (
        !state || state.loading || state.error || state.sortAroundFocusStatus
        || state.params.query != null || state.params.until !== stableUntil
        || url.pathname !== "/search" || url.searchParams.has("query")
        || url.searchParams.get("nonFree") !== "true" || url.searchParams.get("until") !== stableUntil
        || !container || !item || deleteHandles?.length !== 0
      ) {
        first = null;
        continue;
      }
      const settledContainerRect = container.getBoundingClientRect();
      const settledItemRect = item.getBoundingClientRect();
      if (
        settledItemRect.bottom <= settledContainerRect.top || settledItemRect.top >= settledContainerRect.bottom
      ) {
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
        entries.push({ action: "chip-remove", phase: "t_first_visible_frame", t: first.t, interactionId: targetInteractionId });
        entries.push({ action: "chip-remove", phase: "t_visual_settled", t: current.t, interactionId: targetInteractionId });
        if (!Number.isFinite(state.total)) throw new Error("PP9 settled total is unavailable");
        const settledRelativeTop = settledItemRect.top - settledContainerRect.top;
        return {
          settledTotal: state.total,
          resultRegime: state.total <= 1_000 ? "buffer" : state.total <= 65_000 ? "indexed" : "seek",
          anchorDriftPx: Math.round(settledRelativeTop - targetAnchor.top),
          anchorDriftRatio: (settledRelativeTop - targetAnchor.top) / targetAnchor.viewportHeight,
        };
      }
      first = current;
    }
    throw new Error("PP9 removed-chip context did not keep the app-owned viewport anchor visibly stable within 180 frames");
  }, { targetInteractionId: interactionId, targetAnchor: anchor, stableUntil: STABLE_UNTIL });
}

async function appendSeekVisualPhases(kupua: any, interactionId: string, requestedPosition: number) {
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
      if (!state || state.loading || state.error || track?.getAttribute("data-scrubber-mode") !== "seek" || !container || visibleItems.length === 0) {
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
        entries.push({ action: "scrubber-seek", phase: "t_first_visible_frame", t: first.t, interactionId: targetInteractionId });
        entries.push({ action: "scrubber-seek", phase: "t_visual_settled", t: current.t, interactionId: targetInteractionId });
        const total = state.total;
        if (!Number.isFinite(total) || total <= 1) throw new Error("PP7 settled total is unavailable");
        const achievedPosition = state.bufferOffset;
        const requestedRatio = targetPosition / (total - 1);
        const achievedRatio = achievedPosition / (total - 1);
        if (Math.abs(achievedRatio - requestedRatio) > 0.15) {
          throw new Error(`PP7 achieved ratio ${achievedRatio} too far from requested ${requestedRatio}`);
        }
        return {
          settledTotal: total,
          resultRegime: "seek",
          requestedRatio,
          achievedRatio,
        };
      }
      first = current;
    }
    throw new Error("PP7 seek content did not become visibly stable within 180 frames");
  }, { targetInteractionId: interactionId, targetPosition: requestedPosition });
}

async function appendBufferScrollVisualPhases(kupua: any, interactionId: string, requestedPosition: number) {
  return kupua.page.evaluate(async ({ targetInteractionId, targetPosition }) => {
    const readRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    };
    const close = (left: Record<string, number>, right: Record<string, number>) =>
      Object.keys(left).every((key) => Math.abs(left[key] - right[key]) <= 1);

    let first = null;
    for (let attempt = 0; attempt < 120; attempt++) {
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
      if (!state || state.loading || state.error || track?.getAttribute("data-scrubber-mode") !== "buffer" || !container || visibleItems.length === 0) {
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
        entries.push({ action: "scrubber-scroll", phase: "t_first_visible_frame", t: first.t, interactionId: targetInteractionId });
        entries.push({ action: "scrubber-scroll", phase: "t_visual_settled", t: current.t, interactionId: targetInteractionId });
        const total = state.total;
        const achievedPosition = Number(track.getAttribute("aria-valuenow"));
        if (!Number.isFinite(total) || total <= 1 || !Number.isFinite(achievedPosition)) {
          throw new Error("PP7c position context is unavailable");
        }
        const requestedRatio = targetPosition / (total - 1);
        const achievedRatio = achievedPosition / (total - 1);
        if (Math.abs(achievedRatio - requestedRatio) > 0.05) {
          throw new Error(`PP7c achieved ratio ${achievedRatio} too far from requested ${requestedRatio}`);
        }
        return { settledTotal: total, resultRegime: "buffer", requestedRatio, achievedRatio };
      }
      first = current;
    }
    throw new Error("PP7c buffer-scroll content did not become visibly stable within 120 frames");
  }, { targetInteractionId: interactionId, targetPosition: requestedPosition });
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

/** Read seek:* performance.measure entries — only present after a seek. */
async function readSeekMeasures(kupua: any): Promise<Array<{ name: string; duration: number }>> {
  return kupua.page.evaluate(() =>
    performance.getEntriesByType("measure")
      .filter((m: PerformanceEntry) => m.name.startsWith("seek:"))
      .map((m: PerformanceEntry) => ({ name: m.name, duration: Math.round(m.duration) })),
  );
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
  test("PP1: home-logo — pinned indexed query to unpinned home top", async ({ kupua }) => {
    await gotoPerfSearch(kupua, "query=city%3ADublin");
    expect((await kupua.getStoreState()).total).toBeGreaterThan(1_000);
    expect((await kupua.getStoreState()).total).toBeLessThanOrEqual(65_000);

    const setupScrollTop = await kupua.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Image results grid"]') ??
                 document.querySelector('[aria-label="Image results table"]');
      if (!el) throw new Error("PP1 setup results container unavailable");
      el.scrollTop = 2000;
      return el.scrollTop;
    });
    expect(setupScrollTop).toBeGreaterThan(0);

    await clearTrace(kupua);
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    const logo = kupua.page.locator('a[title="Grid — clear all filters"]');
    await logo.click();

    const storeEntries = await readTrace(kupua);
    const starts = storeEntries.filter((entry) =>
      entry.action === "home-logo" && entry.phase === "t_0"
    );
    expect(starts).toHaveLength(1);
    expect(starts[0].interactionId).toBeTruthy();
    const context = await appendHomeVisualPhases(kupua, starts[0].interactionId!);
    const routes = finishRouteCapture();
    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP1",
      label: "home-logo (pinned indexed query→unpinned home top)",
      action: "home-logo",
      requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
      entries,
    });
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      ...context,
      routes,
    };
    console.log(`PP1 home-logo: store=${metrics.dt_store_ready_ms}ms visible=${metrics.dt_first_visible_frame_ms}ms settled=${metrics.dt_visual_settled_ms}ms`);
    const timing1 = await readStoreTiming(kupua);
    if (timing1) Object.assign(metrics, timing1);
    emitMetrics(metrics);
  });

  // ── PP2: Sort field change — no focused image ────────────────────────────
  // Expected: <100 ms ack, <1.5 s first pixel, <2 s settle.
  test("PP2: sort-no-focus — sort field change (Uploaded → Width)", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const total = (await kupua.getStoreState()).total;
    void total;

    // Ensure no focused image
    await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      store?.getState().setFocusedImageId?.(null);
    });

    await clearTrace(kupua);
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    await kupua.selectSort("Width");

    const storeEntries = await readTrace(kupua);
    const starts = storeEntries.filter((entry) =>
      entry.action === "sort-no-focus" && entry.phase === "t_0"
    );
    expect(starts).toHaveLength(1);
    expect(starts[0].interactionId).toBeTruthy();
    const context = await appendNoFocusSortVisualPhases(kupua, starts[0].interactionId!);
    context.routes = finishRouteCapture();
    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP2",
      label: "sort-no-focus (Uploaded→Width)",
      action: "sort-no-focus",
      requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
      entries,
    });
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      ...context,
    };
    console.log(`PP2 sort-no-focus Width: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_visual_settled_ms}ms`);
    const timing2 = await readStoreTiming(kupua);
    if (timing2) Object.assign(metrics, timing2);
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
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    await kupua.selectSort("Credit");

    const storeEntries = await readTrace(kupua);
    const starts = storeEntries.filter((entry) =>
      entry.action === "sort-around-focus" && entry.phase === "t_0"
    );
    expect(starts).toHaveLength(1);
    expect(starts[0].interactionId).toBeTruthy();
    const context = await appendFocusedSortVisualPhases(kupua, starts[0].interactionId!, "PP3");
    context.routes = finishRouteCapture();
    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP3",
      label: "sort-around-focus (Credit)",
      action: "sort-around-focus",
      requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
      entries,
    });
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      ...context,
    };
    console.log(
      `PP3 sort-around-focus: ack=${metrics.dt_ack_ms}ms status=${metrics.dt_status_ms}ms ` +
      `settled=${metrics.dt_visual_settled_ms}ms banner=${metrics.status_total_ms}ms`,
    );
    const timing3 = await readStoreTiming(kupua);
    if (timing3) Object.assign(metrics, timing3);
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
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    // Click the sort direction toggle button
    await kupua.page.click('button[aria-label*="click to sort"]');
    await waitForStoreSettled(kupua, 15_000);

    const storeEntries = await readTrace(kupua);
    const starts = storeEntries.filter((entry) =>
      entry.action === "sort-around-focus" && entry.phase === "t_0"
    );
    expect(starts).toHaveLength(1);
    expect(starts[0].interactionId).toBeTruthy();
    const context = await appendFocusedSortVisualPhases(kupua, starts[0].interactionId!, "PP4");
    context.routes = finishRouteCapture();
    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP4",
      label: "sort-direction-toggle (focused)",
      action: "sort-around-focus",
      requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
      entries,
    });
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      ...context,
    };
    console.log(
      `PP4 sort-dir-focused: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_visual_settled_ms}ms banner=${metrics.status_total_ms}ms`,
    );
    const timing4 = await readStoreTiming(kupua);
    if (timing4) Object.assign(metrics, timing4);
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
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    const freeOnly = kupua.page.getByRole("checkbox", { name: "Free to use only" });
    await expect(freeOnly).not.toBeChecked();
    await freeOnly.click();

    const storeEntries = await readTrace(kupua);
    const starts = storeEntries.filter((entry) =>
      entry.action === "filter-toggle" && entry.phase === "t_0"
    );
    expect(starts).toHaveLength(1);
    expect(starts[0].interactionId).toBeTruthy();
    const context = await appendFilterVisualPhases(kupua, starts[0].interactionId!);
    context.routes = finishRouteCapture();
    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP5",
      label: "filter-toggle (free-to-use checkbox)",
      action: "filter-toggle",
      requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
      entries,
    });
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      ...context,
    };
    console.log(`PP5 filter-toggle: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_visual_settled_ms}ms`);
    const timing5 = await readStoreTiming(kupua);
    if (timing5) Object.assign(metrics, timing5);
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
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    // Click the density toggle button in the StatusBar
    await kupua.page.click('button[aria-label="Switch to table view"]');
    const initialEntries = await readTrace(kupua);
    const starts = initialEntries.filter((entry) =>
      entry.action === "density-swap" && entry.phase === "t_0"
    );
    expect(starts).toHaveLength(1);
    expect(starts[0].interactionId).toBeTruthy();
    const context = await appendDensityVisualPhases(kupua, starts[0].interactionId!);
    context.routes = finishRouteCapture();
    if (context.routes.length !== 1 || context.routes[0] !== "client-only") {
      throw new Error(`PP6 unexpectedly used data routes: ${context.routes.join(", ")}`);
    }
    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP6",
      label: "density-swap (grid→table)",
      action: "density-swap",
      requiredPhases: ["t_first_visible_frame", "t_visual_settled"],
      entries,
    });
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      ...context,
    };
    console.log(`PP6 density-swap: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_visual_settled_ms}ms`);
    const timing6 = await readStoreTiming(kupua);
    if (timing6) Object.assign(metrics, timing6);
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0")).toBe(true);
  });

  // ── PP7: Scrubber seek (click on track) ───────────────────────────────────
  // Expected: <100 ms ack on click, <1 s first pixel.
  // Only fires the seek path when total > SCROLL_MODE_THRESHOLD (~65k).
  test("PP7: scrubber-seek — click track at ~50%", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    await expect(kupua.scrubber).toHaveAttribute("data-scrubber-mode", "seek");

    // Click the scrubber track at ~50% position
    const trackBox = await kupua.scrubber.boundingBox();
    if (!trackBox) {
      test.skip(true, "Scrubber track not visible");
    }

    await clearTrace(kupua);
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    await kupua.page.mouse.click(
      trackBox!.x + trackBox!.width / 2,
      trackBox!.y + trackBox!.height * 0.5,
    );
    const storeEntries = await readTrace(kupua);
    const starts = storeEntries.filter((entry) =>
      entry.action === "scrubber-seek" && entry.phase === "t_0" && entry.interactionId
    );
    expect(starts).toHaveLength(1);
    const requestedPosition = (starts[0].payload as { pos?: number } | undefined)?.pos;
    expect(requestedPosition).toEqual(expect.any(Number));
    const context = await appendSeekVisualPhases(kupua, starts[0].interactionId!, requestedPosition!);
    context.routes = finishRouteCapture();
    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP7",
      label: "scrubber-seek (click 50%)",
      action: "scrubber-seek",
      requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
      entries,
    });
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      ...context,
    };
    console.log(`PP7 scrubber-seek: ack=${metrics.dt_ack_ms}ms first_visible=${metrics.dt_first_visible_frame_ms}ms settled=${metrics.dt_visual_settled_ms}ms`);
    const timing7 = await readStoreTiming(kupua);
    if (timing7) Object.assign(metrics, timing7);
    const seekMeasures7 = await readSeekMeasures(kupua);
    if (seekMeasures7.length > 0) metrics.seekMeasures = seekMeasures7;
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
    await expect(kupua.scrubber).toHaveAttribute("data-scrubber-mode", "seek");

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
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    await kupua.page.mouse.move(startX, startY);
    await kupua.page.mouse.down();
    // Move in small steps to ensure hasMoved=true
    for (let y = startY; y < endY; y += 20) {
      await kupua.page.mouse.move(startX, y);
    }
    await kupua.page.mouse.move(startX, endY);
    await kupua.page.mouse.up();

    const storeEntries = await readTrace(kupua);
    const starts = storeEntries.filter((entry) =>
      entry.action === "scrubber-seek" && entry.phase === "t_0" && entry.interactionId
    );
    expect(starts).toHaveLength(1);
    const requestedPosition = (starts[0].payload as { pos?: number } | undefined)?.pos;
    expect(requestedPosition).toEqual(expect.any(Number));
    const context = await appendSeekVisualPhases(kupua, starts[0].interactionId!, requestedPosition!);
    context.routes = finishRouteCapture();
    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP7b",
      label: "scrubber-drag release (seek mode)",
      action: "scrubber-seek",
      requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
      entries,
    });
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      ...context,
    };
    console.log(`PP7b scrubber-drag: ack=${metrics.dt_ack_ms}ms first_visible=${metrics.dt_first_visible_frame_ms}ms settled=${metrics.dt_visual_settled_ms}ms`);
    const timing7b = await readStoreTiming(kupua);
    if (timing7b) Object.assign(metrics, timing7b);
    const seekMeasures7b = await readSeekMeasures(kupua);
    if (seekMeasures7b.length > 0) metrics.seekMeasures = seekMeasures7b;
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0" && e.action === "scrubber-seek")).toBe(true);
  });

  // ── PP7c: Scrubber click in buffer mode (small result set) ────────────────
  // When total ≤ SCROLL_MODE_THRESHOLD (~1000), the scrubber click scrolls the
  // DOM container directly — no ES round-trip. The browser oracle owns the
  // correlated first-visible and visual-settled phases.
  test("PP7c: scrubber-buffer — click track with small result set", async ({ kupua }) => {
    // Use a CQL query known to return a small result set (buffer mode).
    // `by:"David Young"` ~538 matches — same query as perceived-long QUERY_SCROLL.
    const untilParam = STABLE_UNTIL ? `&until=${STABLE_UNTIL}` : "";
    await kupua.page.goto(
      `/search?nonFree=true&query=${encodeURIComponent('by:"David Young"')}${untilParam}`,
    );
    await kupua.waitForResults();

    const filteredTotal = (await kupua.getStoreState()).total;
    expect(filteredTotal).toBeGreaterThan(1);

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
    await expect(kupua.scrubber).toHaveAttribute("data-scrubber-mode", "buffer");

    const trackLocator = kupua.page.locator('[data-testid="scrubber-track"]');
    const trackBox = await trackLocator.boundingBox();
    if (!trackBox) {
      test.skip(true, "Scrubber not visible");
    }

    // First scrubber interaction lazily fetches the sort distribution. Preload
    // that setup before the measured client-only click so its ES request is not
    // attributed to DOM scrolling.
    await kupua.scrubber.hover();
    await kupua.page.mouse.move(trackBox!.x + trackBox!.width / 2, trackBox!.y + 20);
    await kupua.page.waitForFunction(
      () => {
        const state = (window as any).__kupua_store__?.getState();
        return state?.sortDistribution !== null;
      },
      { timeout: 15_000 },
    );

    await clearTrace(kupua);
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    await kupua.page.mouse.click(
      trackBox!.x + trackBox!.width / 2,
      trackBox!.y + trackBox!.height * 0.8,
    );
    const initialEntries = await readTrace(kupua);
    const starts = initialEntries.filter((entry) =>
      entry.action === "scrubber-scroll" && entry.phase === "t_0" && entry.interactionId
    );
    expect(starts).toHaveLength(1);
    const requestedPosition = (starts[0].payload as { pos?: number } | undefined)?.pos;
    expect(requestedPosition).toEqual(expect.any(Number));
    const context = await appendBufferScrollVisualPhases(kupua, starts[0].interactionId!, requestedPosition!);
    context.routes = finishRouteCapture();
    if (context.routes.length !== 1 || context.routes[0] !== "client-only") {
      throw new Error(`PP7c unexpectedly used data routes: ${context.routes.join(", ")}`);
    }
    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP7c",
      label: "scrubber-buffer (click, DOM scroll)",
      action: "scrubber-scroll",
      requiredPhases: ["t_first_visible_frame", "t_visual_settled"],
      entries,
    });
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      ...context,
    };
    console.log(`PP7c scrubber-buffer: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_visual_settled_ms}ms`);
    const timing7c = await readStoreTiming(kupua);
    if (timing7c) Object.assign(metrics, timing7c);
    const seekMeasures7c = await readSeekMeasures(kupua);
    if (seekMeasures7c.length > 0) metrics.seekMeasures = seekMeasures7c;
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
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
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

    const storeEntries = await readTrace(kupua);
    const starts = storeEntries.filter((entry) =>
      entry.action === "search" && entry.phase === "t_0" && entry.interactionId
    );
    expect(starts).toHaveLength(1);
    expect(starts[0].interactionId).toBeTruthy();
    const context = await appendQueryVisualPhases(kupua, starts[0].interactionId!);
    context.routes = finishRouteCapture();
    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP8",
      label: "post-CQL warm search (sport)",
      action: "search",
      requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
      entries,
    });
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      ...context,
    };
    console.log(
      `PP8 search-submit: ack=${metrics.dt_ack_ms}ms first_visible=${metrics.dt_first_visible_frame_ms}ms settled=${metrics.dt_visual_settled_ms}ms`,
    );
    const timing8 = await readStoreTiming(kupua);
    if (timing8) Object.assign(metrics, timing8);
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0" && e.action === "search")).toBe(true);
  });

  // ── PP9: CQL chip remove ───────────────────────────────────────────────────
  test("PP9: cql-chip-remove — real last-chip delete preserves viewport anchor", async ({ kupua }) => {
    const untilParam = STABLE_UNTIL ? `&until=${STABLE_UNTIL}` : "";
    await kupua.page.goto(`/search?nonFree=true&query=${encodeURIComponent("subject:sport")}${untilParam}`);
    await kupua.waitForResults();

    const container = kupua.page.locator('[aria-label="Image results grid"]');
    await container.evaluate((element) => { element.scrollTop = 1200; });
    await kupua.page.waitForTimeout(800);
    const anchor = await captureChipRemovalAnchor(kupua);

    await clearTrace(kupua);
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    const deleteHandle = kupua.page.locator(".Cql__ChipWrapperDeleteHandle");
    await expect(deleteHandle).toHaveCount(1);
    await deleteHandle.click();

    const storeEntries = await readTrace(kupua);
    const starts = storeEntries.filter((entry) =>
      entry.action === "chip-remove" && entry.phase === "t_0"
    );
    expect(starts).toHaveLength(1);
    expect(starts[0].interactionId).toBeTruthy();
    const context = await appendChipRemovalVisualPhases(kupua, starts[0].interactionId!, anchor);
    const routes = finishRouteCapture();
    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP9",
      label: "cql-chip-remove (subject:sport→empty, anchor preserved)",
      action: "chip-remove",
      requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
      entries,
    });
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      ...context,
      routes,
    };
    console.log(
      `PP9 cql-chip-remove: ack=${metrics.dt_ack_ms}ms first_visible=${metrics.dt_first_visible_frame_ms}ms settled=${metrics.dt_visual_settled_ms}ms`,
    );
    const timing9 = await readStoreTiming(kupua);
    if (timing9) Object.assign(metrics, timing9);
    emitMetrics(metrics);
  });

  // ── PP10: Position-map background fetch ────────────────────────────────────
  test("PP10: position-map — background fetch after medium-size search", async ({ kupua }) => {
    const untilParam = STABLE_UNTIL ? `&until=${STABLE_UNTIL}` : "";
    await clearTrace(kupua);
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    await kupua.page.goto(
      `/search?nonFree=true&query=${encodeURIComponent("uploader:avalonred")}${untilParam}`,
    );
    await kupua.waitForResults();
    await kupua.page.waitForFunction(
      () => {
        const s = (window as any).__kupua_store__?.getState();
        return s && !s.positionMapLoading && s.positionMap !== null;
      },
      { timeout: 30_000 },
    );

    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP10",
      label: "position-map background publication (fixed indexed context)",
      action: "position-map",
      requiredPhases: ["t_store_ready"],
      entries,
    });
    const context = await kupua.page.evaluate((stableUntil: string) => {
      const state = (window as any).__kupua_store__?.getState();
      if (!state || state.loading || state.error || state.positionMapLoading || !state.positionMap) {
        throw new Error("PP10 position map is not published in settled store state");
      }
      if (state.params.query !== "uploader:avalonred" || state.params.until !== stableUntil) {
        throw new Error("PP10 position map belongs to the wrong search context");
      }
      if (state.total <= 1_000 || state.total > 65_000 || state.positionMap.length !== state.total) {
        throw new Error("PP10 position map does not exactly cover an indexed result context");
      }
      return {
        settledTotal: state.total,
        resultRegime: "indexed" as const,
        mapEntryCount: state.positionMap.length,
      };
    }, STABLE_UNTIL);
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      metricClass: "background-diagnostic",
      ...context,
      routes: finishRouteCapture(),
    };
    console.log(
      `PP10 position-map diagnostic: store_ready=${metrics.dt_store_ready_ms}ms entries=${metrics.mapEntryCount}`,
    );
    const timing10 = await readStoreTiming(kupua);
    if (timing10) Object.assign(metrics, timing10);
    emitMetrics(metrics);
  });

  // ── PP6b: Density swap — mid-buffer depth ────────────────────────────────
  // Same action as PP6 but the buffer is loaded and the viewport is scrolled
  // to the middle of the loaded results. Owner reports density swap "feels
  // fine" — this variant confirms that's also true mid-buffer.
  test("PP6b: density-swap-mid — grid ↔ table at mid-buffer scroll", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const setup = await settleMidBufferSetup(kupua);

    await clearTrace(kupua);
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    await kupua.page.click('button[aria-label="Switch to table view"]');
    const initialEntries = await readTrace(kupua);
    const starts = initialEntries.filter((entry) =>
      entry.action === "density-swap" && entry.phase === "t_0" && entry.interactionId
    );
    expect(starts).toHaveLength(1);
    const context = await appendDensityVisualPhases(kupua, starts[0].interactionId!);
    context.routes = finishRouteCapture();
    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP6b",
      label: "density-swap-mid (grid→table, mid-buffer)",
      action: "density-swap",
      requiredPhases: ["t_first_visible_frame", "t_visual_settled"],
      entries,
    });
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      ...setup,
      ...context,
    };
    console.log(`PP6b density-swap-mid: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_visual_settled_ms}ms`);
    const timing6b = await readStoreTiming(kupua);
    if (timing6b) Object.assign(metrics, timing6b);
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0")).toBe(true);
  });

  // ── PP6c: Density swap — deep-buffer depth ────────────────────────────────
  // Same as PP6b but scrolled to near the end of the loaded buffer.
  // The density change at deep scroll is the worst case for DOM churn and
  // any abortExtends cooldown that may be in progress.
  test("PP6c: density-swap-deep — grid ↔ table at deep-buffer scroll", async ({ kupua }) => {
    await gotoPerfSearch(kupua);
    const setup = await settlePostEvictionSetup(kupua);

    await clearTrace(kupua);
    await kupua.page.evaluate(() => performance.clearResourceTimings());
    const finishRouteCapture = captureSuccessfulDataRoutes(kupua);
    await kupua.page.click('button[aria-label="Switch to table view"]');
    const initialEntries = await readTrace(kupua);
    const starts = initialEntries.filter((entry) =>
      entry.action === "density-swap" && entry.phase === "t_0" && entry.interactionId
    );
    expect(starts).toHaveLength(1);
    const context = await appendDensityVisualPhases(kupua, starts[0].interactionId!);
    context.routes = finishRouteCapture();
    const entries = await readTrace(kupua);
    const correlated = computeCorrelatedMetrics({
      id: "PP6c",
      label: "density-swap-post-eviction (grid→table)",
      action: "density-swap",
      requiredPhases: ["t_first_visible_frame", "t_visual_settled"],
      entries,
    });
    const metrics: PerceivedMetrics = {
      ...correlated,
      scenarioRevision: 2,
      ...setup,
      ...context,
    };
    console.log(`PP6c density-swap-deep: ack=${metrics.dt_ack_ms}ms settled=${metrics.dt_visual_settled_ms}ms`);
    const timing6c = await readStoreTiming(kupua);
    if (timing6c) Object.assign(metrics, timing6c);
    emitMetrics(metrics);
    expect(entries.some((e) => e.phase === "t_0")).toBe(true);
  });
});
