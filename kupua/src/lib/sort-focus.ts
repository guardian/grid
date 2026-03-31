/**
 * Tiny bridge for preserving the focused item's viewport-relative position
 * across sort changes (sort-around-focus).
 *
 * Same pattern as density-focus.ts: module-level state, written by the
 * scroll-reset effect (synchronous, before async search), consumed by the
 * sortAroundFocusGeneration effect (after search completes).
 *
 * Without this, sort-around-focus uses `scrollToIndex(idx, { align: "center" })`
 * which always places the focused item dead-centre — ignoring where it was
 * before the sort change. The "Never Lost" principle says items should stay
 * at the same viewport ratio.
 */

interface SortFocusState {
  ratio: number;
}

let _saved: SortFocusState | null = null;

/** Save the focused item's viewport ratio before a sort change. */
export function saveSortFocusRatio(ratio: number): void {
  _saved = { ratio };
}

/** Read and clear the saved sort-focus ratio. Returns null if nothing was saved. */
export function consumeSortFocusRatio(): SortFocusState | null {
  const s = _saved;
  _saved = null;
  return s;
}

