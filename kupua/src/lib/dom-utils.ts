/**
 * DOM utility helpers — shared across panel components.
 */

/**
 * Find the nearest scrollable ancestor of an element.
 * Used for scroll-anchor corrections (e.g. after collapsing a section).
 */
export function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "scroll" || overflowY === "auto") return node;
    node = node.parentElement;
  }
  return null;
}
