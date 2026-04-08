/**
 * prepend-transform — CSS transform pre-compensation for backward extends.
 *
 * When `extendBackward` prepends items to the buffer, the virtualiser's content
 * shifts down by `prependedRows × rowHeight` pixels. The existing `useLayoutEffect`
 * in `useScrollEffects` compensates by adjusting `scrollTop`, but there's a
 * potential intermediate frame between React's DOM mutation and the layout effect
 * where the user sees the un-compensated state — items "swimming."
 *
 * This module eliminates that intermediate frame by applying a CSS `translateY`
 * transform on the spacer div BEFORE React re-renders. The transform visually
 * shifts content up by exactly the compensation amount, so when React commits
 * the DOM mutation (adding rows above), the visual position stays stable.
 * The `useLayoutEffect` then removes the transform and sets `scrollTop` — both
 * happen before the browser paints.
 *
 * Mechanism:
 *   1. Zustand `subscribe` fires synchronously when `set()` is called in
 *      `extendBackward` — BEFORE React processes the state update.
 *   2. Subscriber detects `_prependGeneration` change, computes pixel delta,
 *      applies `transform: translateY(-delta)` to the spacer div.
 *   3. React re-renders (new rows appear above, content shifts down in DOM).
 *   4. `useLayoutEffect` in `useScrollEffects` removes the transform AND
 *      adjusts `scrollTop += delta`. Both happen before browser paint.
 *   5. User sees one consistent frame — no swimming.
 *
 * The same technique is applied for forward eviction (`_forwardEvictGeneration`),
 * which evicts items from the start and adjusts `scrollTop` downward.
 *
 * Performance: CSS transforms are GPU-composited, don't trigger layout/paint,
 * and are applied for <16ms (removed in the same frame by `useLayoutEffect`).
 * Zero ongoing overhead.
 */

import { useSearchStore } from "@/stores/search-store";
import { getScrollContainer } from "@/lib/scroll-container-ref";
import { getScrollGeometry } from "@/lib/scroll-geometry-ref";
import { devLog } from "@/lib/dev-log";

let _prevPrependGen = 0;
let _prevForwardEvictGen = 0;

/** The spacer div that currently has an active pre-compensation transform. */
let _activeTransformTarget: HTMLElement | null = null;

/**
 * Apply pre-compensation transform to the spacer div.
 * Returns the target element (for clearing) or null if not applied.
 */
function applyPreCompensation(
  deltaPixels: number,
  label: string,
): HTMLElement | null {
  const scrollEl = getScrollContainer();
  if (!scrollEl) return null;

  // The spacer div is the first child of the scroll container in both
  // ImageGrid and ImageTable. It has `position: relative` and
  // `height: virtualizer.getTotalSize()`.
  const spacer = scrollEl.firstElementChild as HTMLElement | null;
  if (!spacer) return null;

  // Apply the transform. This is GPU-composited and instantaneous.
  spacer.style.transform = `translateY(${deltaPixels}px)`;
  devLog(`[${label}] applied pre-comp transform: translateY(${deltaPixels}px)`);
  return spacer;
}

/**
 * Remove the pre-compensation transform. Called by `useLayoutEffect` in
 * `useScrollEffects` after adjusting `scrollTop`.
 */
export function clearPreCompensationTransform(): void {
  if (_activeTransformTarget) {
    _activeTransformTarget.style.transform = "";
    _activeTransformTarget = null;
  }
}

/**
 * Start the Zustand subscriber. Call once at app startup.
 * Returns an unsubscribe function.
 */
export function startPrependTransformSubscriber(): () => void {
  // Initialise from current store state so we don't trigger on the first
  // state read.
  const initial = useSearchStore.getState();
  _prevPrependGen = initial._prependGeneration;
  _prevForwardEvictGen = initial._forwardEvictGeneration;

  const unsub = useSearchStore.subscribe((state) => {
    // --- Backward prepend pre-compensation ---
    if (state._prependGeneration !== _prevPrependGen) {
      _prevPrependGen = state._prependGeneration;

      const prependCount = state._lastPrependCount;
      if (prependCount > 0) {
        const geo = getScrollGeometry();
        // Same row-delta math as useScrollEffects Effect #4:
        // actual row delta = ceil(newCount/cols) - ceil(oldCount/cols)
        const newCount = state.results.length;
        const oldCount = newCount - prependCount;
        const prependedRows = geo.columns > 1
          ? Math.ceil(newCount / geo.columns) - Math.ceil(oldCount / geo.columns)
          : prependCount;
        const deltaPixels = prependedRows * geo.rowHeight;

        // Shift content UP to counteract the downward shift from prepending
        _activeTransformTarget = applyPreCompensation(-deltaPixels, "prepend-pre-comp");
      }
    }

    // --- Forward eviction pre-compensation ---
    if (state._forwardEvictGeneration !== _prevForwardEvictGen) {
      _prevForwardEvictGen = state._forwardEvictGeneration;

      const evictCount = state._lastForwardEvictCount;
      if (evictCount > 0) {
        const geo = getScrollGeometry();
        // Same row-delta math as useScrollEffects Effect #5:
        const newCount = state.results.length;
        const oldCount = newCount + evictCount;
        const evictedRows = geo.columns > 1
          ? Math.ceil(oldCount / geo.columns) - Math.ceil(newCount / geo.columns)
          : evictCount;
        const deltaPixels = evictedRows * geo.rowHeight;

        // Shift content DOWN to counteract the upward shift from evicting
        _activeTransformTarget = applyPreCompensation(deltaPixels, "evict-pre-comp");
      }
    }
  });

  return unsub;
}

