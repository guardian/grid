/**
 * scroll-reset-ref — virtualizer-level scroll reset callback.
 *
 * The density components (ImageGrid, ImageTable) register a callback that
 * calls `virtualizer.scrollToOffset(0)`. Imperative callers (SearchBar logo,
 * ImageDetail logo) fire it via `fireScrollReset()` to ensure BOTH the DOM
 * `scrollTop` AND the virtualizer's internal `scrollOffset` are zeroed.
 *
 * Same module-level pattern as density-focus.ts and scroll-container-ref.ts.
 *
 * Why this exists: setting `scrollContainer.scrollTop = 0` + dispatching a
 * synthetic scroll event is not sufficient — TanStack Virtual maintains its
 * own internal `scrollOffset` state that syncs asynchronously via scroll
 * events. During rapid state transitions (seek → Home click), the virtualizer
 * can lag behind the DOM, causing it to render at the wrong offset.
 * `virtualizer.scrollToOffset(0)` directly sets the internal state.
 */

let _onReset: (() => void) | null = null;

/** Register a scroll-reset callback (call with null on unmount). */
export function registerScrollReset(cb: (() => void) | null): void {
  _onReset = cb;
}

/** Fire the registered scroll-reset callback (virtualizer.scrollToOffset(0)). */
export function fireScrollReset(): void {
  _onReset?.();
}



