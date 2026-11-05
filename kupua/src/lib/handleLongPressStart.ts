/**
 * handleLongPressStart -- shared logic for the useLongPress `onLongPressStart`
 * callback used by both ImageGrid and ImageTable.
 *
 * Three-branch rule (mirrors the desktop click rule table for consistency):
 *
 *   No anchor / mode entry:    toggle(cellId) + setAnchor(cellId)
 *   Different anchor:           dispatch old-anchor range with endpoint chaining
 *   Already-selected anchor:   retire pending range + re-anchor -- do NOT toggle off.
 *                                Touch divergence from desktop click: long-press
 *                                should not be a destructive deselect. Use the
 *                                tickbox to deselect a single cell.
 *
 * Architecture: kupua/exploration/docs/selections-workplan.md SS5
 */

import type { Image } from "@/types/image";
import { useSelectionStore } from "@/stores/selection-store";
import { useSearchStore } from "@/stores/search-store";
import { buildSearchKey, extractSortValues, getRetainedSortValues } from "@/lib/image-offset-cache";
import type { AddRangeEffect } from "@/lib/dispatchClickEffects";

export interface LongPressStartContext {
  cellId: string;
  handleRange?: (effect: AddRangeEffect) => void;
  findImageIndex: (id: string) => number;
  getImage: (idx: number) => Image | undefined;
  /** Snapshot of current orderBy at call time (from searchParamsRef.current.orderBy). */
  orderBy: string | undefined;
}

export interface DragSelectSession {
  /** Record, before the long-press commits, whether the origin was already selected. */
  prime(originId: string, wasSelected: boolean): void;
  enter(originId: string, cellId: string): void;
  end(): void;
}

/**
 * Google Photos-style drag-select: the selection is always (pre-drag selection) ∪
 * (range origin→finger), so dragging back deselects what this drag added.
 * Live feedback covers loaded images (by global position, so it survives the origin
 * leaving the buffer); on release, any unloaded gap is filled by the range walk.
 */
export function createDragSelect(
  getContext: () => { handleRange?: (effect: AddRangeEffect) => void; orderBy: string | undefined },
): DragSelectSession {
  let before: Set<string> | null = null;
  let added = new Map<string, number>();
  let origin: { id: string; global: number; sortValues: unknown[] | null } | null = null;
  let last: { id: string; global: number } | null = null;
  // Starting on an already-selected image paints deselection instead.
  let primed: { id: string; erase: boolean } | null = null;
  let erase = false;

  return {
    prime(originId, wasSelected) {
      primed = { id: originId, erase: wasSelected };
    },
    enter(originId, cellId) {
      const sel = useSelectionStore.getState();
      const search = useSearchStore.getState();
      if (!origin) {
        const global = search.imagePositions.get(originId);
        if (global === undefined) return;
        const searchKey = buildSearchKey({ ...search.params, orderBy: getContext().orderBy });
        const img = search.results.find((image) => image?.id === originId);
        origin = { id: originId, global, sortValues:
          getRetainedSortValues(originId, searchKey) ?? (img ? extractSortValues(img, getContext().orderBy, searchKey) : null) };
        before = new Set(sel.selectedIds);
        erase = primed?.id === originId && primed.erase;
      }
      const target = search.imagePositions.get(cellId);
      if (target === undefined || !before) return;
      last = { id: cellId, global: target };
      const lo = Math.min(origin.global, target);
      const hi = Math.max(origin.global, target);
      // Leaving = touched ids now outside the range (by remembered position, so ids
      // evicted from the buffer mid-drag aren't mistaken for leaving).
      const leaving: string[] = [];
      for (const [id, pos] of added) if (pos < lo || pos > hi) { leaving.push(id); added.delete(id); }
      const entering: string[] = [];
      for (const image of search.results) {
        if (!image || added.has(image.id) || before.has(image.id) !== erase) continue;
        const pos = search.imagePositions.get(image.id);
        if (pos !== undefined && pos >= lo && pos <= hi) { entering.push(image.id); added.set(image.id, pos); }
      }
      if (erase) {
        if (entering.length) sel.remove(entering);
        if (leaving.length) sel.add(leaving);
      } else {
        if (leaving.length) sel.remove(leaving);
        if (entering.length) sel.add(entering);
      }
      sel.setAnchor(cellId);
    },
    end() {
      const { handleRange, orderBy } = getContext();
      // The range walk removes when the anchor (origin) is no longer selected, so erase fills too.
      if (origin && last && handleRange) {
        const search = useSearchStore.getState();
        const loaded = search.results.filter((image) => {
          const pos = image && search.imagePositions.get(image.id);
          return pos !== undefined && pos !== null &&
            pos >= Math.min(origin!.global, last!.global) && pos <= Math.max(origin!.global, last!.global);
        }).length;
        // Part of the range was never loaded: let the range walk fetch the gap.
        if (loaded < Math.abs(last.global - origin.global) + 1) {
          const searchKey = buildSearchKey({ ...search.params, orderBy });
          const img = search.results.find((image) => image?.id === last!.id);
          handleRange({
            op: "add-range",
            anchorId: origin.id,
            anchorGlobalIndex: origin.global,
            anchorSortValues: origin.sortValues as AddRangeEffect["anchorSortValues"],
            targetId: last.id,
            targetGlobalIndex: last.global,
            targetSortValues: (img ? extractSortValues(img, orderBy, searchKey) : null) ?? [],
            reanchorToTarget: true,
          });
        }
      }
      before = null;
      added = new Map();
      origin = null;
      last = null;
      primed = null;
      erase = false;
    },
  };
}

export function handleLongPressStart(ctx: LongPressStartContext): void {
  if (!ctx.cellId) return;

  const selState = useSelectionStore.getState();
  const { anchorId } = selState;

  if (anchorId && ctx.handleRange &&
      (anchorId !== ctx.cellId || selState.selectedIds.has(ctx.cellId))) {
    // Second long-press in selection mode: range from existing anchor to this cell.
    // Builds the same AddRangeEffect a shift-click produces and dispatches it through
    // useRangeSelection (buffer fast path or server walk).
    const searchState = useSearchStore.getState();
    const searchKey = buildSearchKey({ ...searchState.params, orderBy: ctx.orderBy });
    const idx = ctx.findImageIndex(ctx.cellId);
    const image = idx >= 0 ? ctx.getImage(idx) : undefined;
    const anchorImg = selState.metadataCache.get(anchorId);
    const effect: AddRangeEffect = {
      op: "add-range",
      anchorId,
      anchorGlobalIndex: searchState.imagePositions.get(anchorId) ?? null,
      anchorSortValues: getRetainedSortValues(anchorId, searchKey) ?? (anchorImg
        ? extractSortValues(anchorImg, ctx.orderBy)
        : null),
      targetId: ctx.cellId,
      targetGlobalIndex: searchState.imagePositions.get(ctx.cellId) ?? 0,
      targetSortValues: (image ? extractSortValues(image, ctx.orderBy, searchKey) : null) ?? [],
      reanchorToTarget: true,
    };
    ctx.handleRange(effect);
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
