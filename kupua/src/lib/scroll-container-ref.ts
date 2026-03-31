/**
 * scroll-container-ref — shared ref for the active scroll container.
 *
 * The density components (ImageGrid, ImageTable) register their scroll
 * container element here on mount. The Scrubber reads it instead of
 * doing DOM archaeology (previousElementSibling + querySelector).
 *
 * Same pattern as density-focus.ts — module-level mutable ref, zero React,
 * zero prop-drilling across PanelLayout.
 *
 * Registration contract:
 *   - Call register(el) when the scroll container mounts (useEffect cleanup)
 *   - The last density component to mount wins (only one is ever mounted at a time)
 */

let _el: HTMLElement | null = null;

/** Register the active scroll container. Call with null on unmount. */
export function registerScrollContainer(el: HTMLElement | null): void {
  _el = el;
}

/** Get the currently registered scroll container, or null. */
export function getScrollContainer(): HTMLElement | null {
  return _el;
}

