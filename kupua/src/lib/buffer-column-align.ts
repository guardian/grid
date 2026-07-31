/**
 * Column-alignment for buffer/two-tier grid virtualisation.
 *
 * The grid virtualizer (non-table density) renders items by LOCAL index
 * (`globalIndex - bufferOffset`), so an item's rendered column is
 * `localIndex % columns`. Any operation that changes `bufferOffset` by an
 * amount that isn't a multiple of `columns` shifts EVERY already-buffered
 * item's column, not just the new ones — a visible sideways reflow.
 *
 * `alignBufferStart` computes how many leading items to trim from a
 * freshly-fetched/landed buffer segment so the resulting start offset is a
 * multiple of `columns` — landing every item at its natural column
 * (`globalIndex % columns`). Used by every site that establishes a fresh,
 * non-zero buffer start: `_loadBufferAroundImage` (sort-around-focus /
 * restoreAroundCursor landing), `seek()`, and the async offset correction
 * in `_findAndFocusImage`. A single shared implementation means a future
 * fourth call site can't independently forget this — the earlier bug (see
 * changelog "buffer-tier grid-density column shift") was exactly that: one
 * of these three sites had its own un-aligned inline copy.
 */

export interface AlignedBufferStart {
  /** Column-aligned start offset (>= rawOffset). */
  alignedOffset: number;
  /** How many leading items to drop to reach `alignedOffset`. */
  trimCount: number;
}

/**
 * @param rawOffset The unaligned start offset (global index of the first
 *   item before any trimming).
 * @param availableCount How many leading items are actually available to
 *   trim (e.g. the length of the backward-fetched page, or the current
 *   buffer's length). Caps `trimCount` — trimming can never remove more
 *   items than exist.
 * @param columns Current column count. `columns <= 1` (table density, or
 *   not yet registered) is a no-op — every offset is trivially "aligned".
 * @param protectUpTo Optional exclusive upper bound on how much can be
 *   trimmed (e.g. the anchor/target item's own local index) — trimming
 *   must never discard the very item the caller is centring on. Note this
 *   means the result is NOT guaranteed aligned when `protectUpTo` is small
 *   — callers relying on this cap being "safe" (i.e. rare enough in
 *   practice to not reintroduce misalignment) must justify why at the call
 *   site (e.g. `_findAndFocusImage`'s async correction: `protectUpTo` only
 *   binds when the anchor's own local index is smaller than `columns`,
 *   which means the backward page ran out near the absolute start of the
 *   result set — `rawOffset` is then already at or near 0, so already
 *   aligned in practice). Defaults to `availableCount` (no additional
 *   protection).
 */
export function alignBufferStart(
  rawOffset: number,
  availableCount: number,
  columns: number,
  protectUpTo: number = availableCount,
): AlignedBufferStart {
  if (columns <= 1) return { alignedOffset: rawOffset, trimCount: 0 };
  const idealTrim = (columns - (rawOffset % columns)) % columns;
  const trimCount = Math.min(idealTrim, availableCount, protectUpTo);
  return { alignedOffset: rawOffset + trimCount, trimCount };
}
