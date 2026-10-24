/**
 * scroll-container-ref — shared ref for the active scroll container.
 *
 * The density components (ImageGrid, ImageTable) register their scroll
 * container element here on mount. The Scrubber reads it instead of
 * doing DOM archaeology (previousElementSibling + querySelector).
 *
 * Module-level mutable ref with change notification via useSyncExternalStore.
 * Imperative reads (`getScrollContainer()`) are always fresh. React components
 * that need to *react* to container changes (e.g. re-attach scroll listeners)
 * subscribe via `useScrollContainerGeneration()`.
 *
 * Registration contract:
 *   - Call register(el) when the scroll container mounts (useEffect cleanup)
 *   - The last density component to mount wins (only one is ever mounted at a time)
 */

import { useSyncExternalStore } from "react";

let _el: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Change notification — generation counter + subscriber set
// ---------------------------------------------------------------------------

let _generation = 0;
const _listeners = new Set<() => void>();

function _notify() {
  for (const fn of _listeners) fn();
}

/** Register the active scroll container. Call with null on unmount. */
export function registerScrollContainer(el: HTMLElement | null): void {
  if (_el === el) return; // no-op if same element (avoids spurious bumps)
  _el = el;
  _generation++;
  _notify();
}

/** Get the currently registered scroll container, or null. */
export function getScrollContainer(): HTMLElement | null {
  return _el;
}

// ---------------------------------------------------------------------------
// React hook — subscribe to container changes
// ---------------------------------------------------------------------------

function _subscribe(listener: () => void) {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

function _getSnapshot(): number {
  return _generation;
}

/**
 * React hook that returns a generation counter incremented whenever the
 * scroll container changes. Use as an effect dependency to re-run when
 * the density component remounts with a new scroll container element.
 *
 * NOT the element itself — call `getScrollContainer()` inside the effect
 * body to get the current element. The generation is just a trigger.
 */
export function useScrollContainerGeneration(): number {
  return useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);
}

