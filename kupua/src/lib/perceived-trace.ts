/**
 * perceived-trace — lightweight action-boundary tracer for perceived-performance measurement.
 *
 * Gating:
 *   - Production builds: tree-shaken out entirely (import.meta.env.DEV guard).
 *     Zero bundle bytes, zero runtime cost.
 *   - Dev (`npm run dev`): off by default (keeps console clean).
 *     Enable: localStorage.setItem("kupua_perceived_perf", "1"), then refresh.
 *   - Playwright perf runs: always on (harness sets the localStorage flag before
 *     navigation).
 *
 * Usage:
 *   const interactionId = beginTraceInteraction("sort-around-focus", { sort, focusedId });
 *   traceInteraction("sort-around-focus", "t_store_ready", interactionId);
 *
 * Reading in Playwright:
 *   const entries = await page.evaluate(() => window.__perceivedTrace__);
 *
 * See e2e-perf/README.md → "Perceived-Performance Suite" for full contract.
 * See exploration/docs/perceived-perf-audit.md for the full mandate.
 *
 * Removal: delete this file and revert the ~10 call sites in stores/hooks/components.
 */

export interface TraceEntry {
  /** Action identifier, e.g. "sort-around-focus", "home-logo", "scrubber-seek" */
  action: string;
  /** Phase identifier, e.g. "t_0", "t_ack", "t_store_ready", "t_visual_settled" */
  phase: string;
  /** performance.now() at emission time */
  t: number;
  /** Correlates every phase emitted by one user interaction. */
  interactionId?: string;
  /** Optional per-action context (sort field, mode, etc.) */
  payload?: unknown;
}

const ENABLED: boolean =
  import.meta.env.DEV ||
  (typeof window !== "undefined" &&
    window.localStorage?.getItem("kupua_perceived_perf") === "1");

const MAX_ENTRIES = 500;
const buffer: TraceEntry[] = [];
const activeInteractions = new Map<string, string>();
let interactionSequence = 0;

function nextInteractionId(action: string): string {
  interactionSequence += 1;
  return `${action}:${Math.round(performance.now())}:${interactionSequence}`;
}

export function beginTraceInteraction(action: string, payload?: unknown): string {
  if (!ENABLED) return "";
  const interactionId = nextInteractionId(action);
  activeInteractions.set(action, interactionId);
  emitTrace(action, "t_0", payload, interactionId);
  return interactionId;
}

export function consumeTraceInteraction(action: string): string | undefined {
  const interactionId = activeInteractions.get(action);
  activeInteractions.delete(action);
  return interactionId;
}

export function claimTraceInteraction(
  actions: string[],
): { action: string; interactionId: string } | undefined {
  const claimedAction = actions.find((action) => activeInteractions.has(action));
  const interactionId = claimedAction ? activeInteractions.get(claimedAction) : undefined;
  for (const action of actions) activeInteractions.delete(action);
  return claimedAction && interactionId ? { action: claimedAction, interactionId } : undefined;
}

export function traceInteraction(
  action: string,
  phase: string,
  interactionId: string | undefined,
  payload?: unknown,
): void {
  if (!ENABLED || !interactionId) return;
  emitTrace(action, phase, payload, interactionId);
}

function emitTrace(
  action: string,
  phase: string,
  payload: unknown,
  interactionId?: string,
): void {
  const t = performance.now();
  try {
    performance.mark(`perceived:${action}:${phase}`, { detail: payload });
  } catch {
    // performance.mark() with detail is Chrome-only; swallow on other browsers.
  }
  buffer.push({ action, phase, t, payload, interactionId });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

/**
 * Emit a trace mark at the named phase for the named action.
 *
 * Also pushes a `performance.mark("perceived:<action>:<phase>")` so entries
 * are visible in the browser DevTools → Performance panel for free.
 *
 * The ENABLED gate means callers never need to guard this call.
 */
export function trace(action: string, phase: string, payload?: unknown): void {
  if (!ENABLED) return;
  const interactionId = activeInteractions.get(action);
  emitTrace(action, phase, payload, interactionId);
  if (phase === "t_store_ready") activeInteractions.delete(action);
}

// Expose buffer and clear helper on window when enabled so Playwright (and
// DevTools-debugging humans) can read and wipe the trace without importing.
if (ENABLED && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["__perceivedTrace__"] = buffer;
  (window as unknown as Record<string, unknown>)["__perceivedTraceClear__"] =
    () => {
      buffer.length = 0;
      activeInteractions.clear();
    };
}
