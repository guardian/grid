/**
 * DOM utility helpers.
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

/**
 * Detect native form inputs (input, textarea, select) but NOT the CQL custom
 * element. The CQL search box deliberately lets navigation keys (arrows,
 * PageUp/Down) propagate so useListNavigation can handle them. Native inputs
 * (e.g. <input type="date">) need those keys for their own UI.
 *
 * Inputs marked with `data-grid-nav-input` opt in to grid navigation (like
 * the AI search input) — they are treated as non-native for this purpose.
 */
export function isNativeInputTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;

  if (target.hasAttribute("data-grid-nav-input")) return false;

  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
