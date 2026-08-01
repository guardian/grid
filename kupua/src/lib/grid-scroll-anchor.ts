/**
 * Pure scroll-anchor math for ImageGrid's column-count-change (panel
 * toggle / window resize) scroll preservation.
 *
 * ImageGrid captures an anchor image BEFORE a column-count change (via its
 * ResizeObserver) and restores its viewport-relative position AFTER (in a
 * `useLayoutEffect`), so panel toggles and window resizes don't visually
 * jump. The anchor MUST be a stable image identity resolved via
 * `imagePositions` — not a position recomputed from the current
 * `scrollTop`/row arithmetic every time. The latter (the original
 * implementation's phantom-focus fallback) invents a fresh "first image of
 * the centre row" flat index at every resize event instead of tracking one
 * real image; each capture/restore round trip is only an approximation, and
 * a full open+close panel cycle does not cancel out — it leaves a
 * consistent ~1-row drift that compounds with repeated toggles (confirmed
 * live on TEST two-tier: two full RHS/LHS toggle cycles measurably drifted
 * the viewport by 2 rows with zero user scrolling). See
 * `wandering-findings/W-2026-08-01-panel-toggle-progressive-shift.md`.
 *
 * Resolving from a real anchor image ID via `imagePositions` fixes this
 * EXACTLY whenever the same ID is resolved at both ends of a cycle — true
 * by construction for the focused image, since it doesn't change across a
 * resize. For the phantom (no-explicit-focus) case, `getViewportAnchorId()`
 * is itself re-derived from the visible range each time
 * (`useDataWindow.ts`'s `reportVisibleRange`, which is column-count-scaled),
 * so the resolved ID can differ between the two ends of a cycle — this is
 * NOT structurally guaranteed to be identity-stable. In practice (live TEST,
 * all 3 tiers, and the e2e regression test) it has not been observed to
 * compound across repeated cycles, unlike the old synthetic-index approach
 * — see the review at
 * `zz Archive/R-2026-08-01-panel-toggle-anchor-fix-review.md` (concern C1)
 * for the detailed reasoning and a caveat on this claim.
 */

export interface CapturedAnchor {
  /** Virtualizer index of the anchor image (buffer-local in normal mode, global in two-tier mode). */
  imageIndex: number;
  /** Fraction of `clientHeight` between `scrollTop` and the anchor row's top. */
  viewportRatio: number;
}

/**
 * Resolve an anchor image ID to its virtualizer index. Returns null if the
 * ID is null, or the image isn't in `imagePositions` (never rendered, or
 * fell out of the buffer/position map), or its resolved index is negative
 * (buffer-local index for an image that's currently before the buffer
 * start, in non-two-tier mode).
 *
 * No upper-bound check (unlike `useDataWindow.ts`'s `findImageIndex`) —
 * relies on `imagePositions` only ever containing buffer-resident hits
 * (`buildPositions` in search-store.ts), which makes an out-of-range result
 * impossible today.
 */
export function resolveAnchorVirtIndex(
  imageId: string | null,
  imagePositions: Map<string, number>,
  bufferOffset: number,
  isTwoTier: boolean,
): number | null {
  if (!imageId) return null;
  const globalIdx = imagePositions.get(imageId);
  if (globalIdx == null || globalIdx < 0) return null;
  const virtIdx = isTwoTier ? globalIdx : globalIdx - bufferOffset;
  return virtIdx >= 0 ? virtIdx : null;
}

/** Capture an anchor's row-relative viewport ratio, given its virtualizer index. */
export function captureAnchorAtIndex(
  virtIdx: number,
  cols: number,
  rowHeight: number,
  scrollTop: number,
  clientHeight: number,
): CapturedAnchor {
  const rowTop = Math.floor(virtIdx / cols) * rowHeight;
  // Guard against a momentarily zero-height container (e.g. mid panel-
  // transition) — division would otherwise produce a NaN/Infinity ratio
  // that later corrupts restoreAnchorScrollTop's result.
  const viewportRatio = clientHeight > 0 ? (rowTop - scrollTop) / clientHeight : 0;
  return { imageIndex: virtIdx, viewportRatio };
}

/**
 * Last-resort fallback anchor when no real image ID is known yet (e.g.
 * before the first `reportVisibleRange` call). Approximates via row
 * arithmetic — the first image of the row nearest viewport centre. This is
 * the same lossy approximation as before; only used when a real anchor
 * can't be resolved.
 */
export function computeFallbackAnchor(
  cols: number,
  rowHeight: number,
  scrollTop: number,
  clientHeight: number,
): CapturedAnchor {
  const centreScroll = scrollTop + clientHeight / 2;
  const centreRow = Math.floor(centreScroll / rowHeight);
  const viewportRatio = clientHeight > 0 ? (centreRow * rowHeight - scrollTop) / clientHeight : 0;
  return { imageIndex: centreRow * cols, viewportRatio };
}

/** Compute the scrollTop that restores a captured anchor after a column-count change. */
export function restoreAnchorScrollTop(
  anchor: CapturedAnchor,
  cols: number,
  rowHeight: number,
  clientHeight: number,
  scrollHeight: number,
): number {
  const newRowTop = Math.floor(anchor.imageIndex / cols) * rowHeight;
  const target = newRowTop - anchor.viewportRatio * clientHeight;
  return Math.max(0, Math.min(scrollHeight - clientHeight, target));
}
