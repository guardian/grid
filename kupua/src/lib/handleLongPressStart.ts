/**
 * handleLongPressStart -- shared logic for the useLongPress `onLongPressStart`
 * callback used by both ImageGrid and ImageTable.
 *
 * Three-branch rule (mirrors the desktop click rule table for consistency):
 *
 *   No anchor / mode entry:    toggle(cellId) + setAnchor(cellId)
 *   Different anchor:           dispatch add-range effect (same path as shift-click),
 *                                then setAnchor(cellId) for chaining
 *   Already-selected anchor:   setAnchor(cellId) only -- do NOT toggle off.
 *                                Touch divergence from desktop click: long-press
 *                                should not be a destructive deselect. Use the
 *                                tickbox to deselect a single cell.
 *
 * Architecture: kupua/exploration/docs/selections-workplan.md SS5
 */

import type { Image } from "@/types/image";
import { useSelectionStore } from "@/stores/selection-store";
import { useSearchStore } from "@/stores/search-store";
import { extractSortValues } from "@/lib/image-offset-cache";
import type { AddRangeEffect } from "@/lib/dispatchClickEffects";

export interface LongPressStartContext {
  cellId: string;
  handleRange?: (effect: AddRangeEffect) => void;
  findImageIndex: (id: string) => number;
  getImage: (idx: number) => Image | undefined;
  /** Snapshot of current orderBy at call time (from searchParamsRef.current.orderBy). */
  orderBy: string | undefined;
}

export function handleLongPressStart(ctx: LongPressStartContext): void {
  if (!ctx.cellId) return;

  const selState = useSelectionStore.getState();
  const { anchorId } = selState;

  if (anchorId && anchorId !== ctx.cellId && ctx.handleRange) {
    // Second long-press in selection mode: range from existing anchor to this cell.
    // Builds the same AddRangeEffect a shift-click produces and dispatches it through
    // useRangeSelection (buffer fast path or server walk).
    const searchState = useSearchStore.getState();
    const idx = ctx.findImageIndex(ctx.cellId);
    const image = idx >= 0 ? ctx.getImage(idx) : undefined;
    const anchorImg = selState.metadataCache.get(anchorId);
    ctx.handleRange({
      op: "add-range",
      anchorId,
      anchorGlobalIndex: searchState.imagePositions.get(anchorId) ?? null,
      anchorSortValues: anchorImg
        ? extractSortValues(anchorImg, ctx.orderBy)
        : null,
      targetId: ctx.cellId,
      targetGlobalIndex: searchState.imagePositions.get(ctx.cellId),
      targetSortValues: image
        ? extractSortValues(image, ctx.orderBy)
        : null,
    });
    selState.setAnchor(ctx.cellId);
  } else if (!selState.selectedIds.has(ctx.cellId)) {
    // Mode entry (no prior anchor) or long-press on an unselected cell:
    // toggle + anchor.
    selState.toggle(ctx.cellId);
    selState.setAnchor(ctx.cellId);
  } else {
    // Long-press on the already-selected anchor cell re-anchors but does NOT
    // deselect -- touch divergence from desktop click. Use the tickbox to
    // deselect a single cell.
    selState.setAnchor(ctx.cellId);
  }
}
