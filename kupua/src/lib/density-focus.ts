/**
 * Tiny bridge for preserving the focused item's viewport-relative position
 * across density switches (table ↔ grid).
 *
 * When a density component unmounts, it saves the ratio (0 = top, 1 = bottom)
 * of the focused row within the viewport, plus the buffer-local index of the
 * focused image. When the new density mounts, it consumes both and scrolls so
 * the focused item appears at the same relative position — not always dead
 * center.
 *
 * The local index is saved because imagePositions may evict the focused image
 * between the click and the density switch (async extendForward/Backward can
 * complete in between). Storing the index at unmount time avoids a stale
 * lookup at mount time.
 *
 * Module-level state (not React, not Zustand) because it's transient:
 * written by the unmounting component, read once by the mounting component,
 * then discarded. No persistence, no reactivity, no subscriptions.
 */

interface DensityFocusState {
  ratio: number;
  localIndex: number;
}

let saved: DensityFocusState | null = null;

/** Save the focused item's viewport ratio and buffer-local index before unmounting. */
export function saveFocusRatio(ratio: number, localIndex: number): void {
  saved = { ratio, localIndex };
}

/** Read and clear the saved state. Returns null if nothing was saved. */
export function consumeFocusRatio(): DensityFocusState | null {
  const s = saved;
  saved = null;
  return s;
}

