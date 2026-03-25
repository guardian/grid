/**
 * Tiny bridge for preserving the focused item's viewport-relative position
 * across density switches (table ↔ grid).
 *
 * When a density component unmounts, it saves the ratio (0 = top, 1 = bottom)
 * of the focused row within the viewport. When the new density mounts, it
 * consumes the ratio and scrolls so the focused item appears at the same
 * relative position — not always dead center.
 *
 * Module-level state (not React, not Zustand) because it's transient:
 * written by the unmounting component, read once by the mounting component,
 * then discarded. No persistence, no reactivity, no subscriptions.
 */

let ratio: number | null = null;

/** Save the focused item's viewport ratio before unmounting. */
export function saveFocusRatio(r: number): void {
  ratio = r;
}

/** Read and clear the saved ratio. Returns null if nothing was saved. */
export function consumeFocusRatio(): number | null {
  const r = ratio;
  ratio = null;
  return r;
}

