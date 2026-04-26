/**
 * Build a HistorySnapshot from current app state.
 *
 * Called synchronously by markPushSnapshot() BEFORE navigate(). The
 * store is still showing pre-edit state at this point — this is
 * load-bearing for debounced typing: the first-keystroke push captures
 * the predecessor (pre-edit state), not the keystroke just typed.
 * DO NOT reorder this read to after navigate().
 *
 * Phase 2: capture only — no consumer yet.
 */

import type { HistorySnapshot } from "@/lib/history-snapshot";
import { useSearchStore } from "@/stores/search-store";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import { getViewportAnchorId } from "@/hooks/useDataWindow";
import { buildSearchKey, extractSortValues } from "@/lib/image-offset-cache";
import { getScrollContainer } from "@/lib/scroll-container-ref";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import {
  GRID_ROW_HEIGHT,
  GRID_MIN_CELL_WIDTH,
  TABLE_ROW_HEIGHT,
} from "@/constants/layout";

/**
 * Build a snapshot of the current scroll/focus position.
 *
 * Anchor selection:
 * | Mode            | Anchor                                    |
 * |-----------------|-------------------------------------------|
 * | Click-to-focus  | Focused image (falls back to viewport)    |
 * | Click-to-open   | Viewport-centre image (phantom anchor)    |
 *
 * In click-to-focus mode, the explicitly focused image is the best anchor
 * because it represents what the user was working with. If the user hasn't
 * focused anything (e.g. just scrolled), we fall back to viewport-centre
 * same as click-to-open mode.
 */
export function buildHistorySnapshot(): HistorySnapshot {
  const { params, focusedImageId, imagePositions, bufferOffset, results, newCountSince } =
    useSearchStore.getState();

  // --- searchKey ---
  const searchKey = buildSearchKey({ ...params });

  // --- anchor selection ---
  let anchorImageId: string | null = null;
  let anchorIsPhantom = false;

  const focusMode = getEffectiveFocusMode();
  if (focusMode === "explicit") {
    // Click-to-focus mode: use the explicitly focused image.
    anchorImageId = focusedImageId;
  }

  // Fallback to viewport-centre image (phantom anchor) when:
  // - click-to-open mode (always)
  // - click-to-focus mode with no focused image
  if (!anchorImageId) {
    anchorImageId = getViewportAnchorId();
    anchorIsPhantom = !!anchorImageId;
  }

  // --- anchor cursor + offset ---
  let anchorCursor: (string | number | null)[] | null = null;
  let anchorOffset = 0;

  if (anchorImageId) {
    const globalIdx = imagePositions.get(anchorImageId);
    if (globalIdx !== undefined) {
      anchorOffset = globalIdx;
      // Extract sort cursor from the in-memory image.
      const localIdx = globalIdx - bufferOffset;
      const image = localIdx >= 0 && localIdx < results.length ? results[localIdx] : undefined;
      if (image) {
        anchorCursor = extractSortValues(image, params.orderBy) ?? null;
      }
    }
  }

  // --- viewportRatio: where the anchor sits within the visible viewport ---
  // Must use the same coordinate system as useScrollEffects Effect #9 (the
  // consumer): geometry-based pixel positions from localIndexToPixelTop.
  // Earlier this used DOM getBoundingClientRect which includes container
  // padding (e.g. pt-1 = 4px), causing a 4px/cycle drift when the ratio
  // round-tripped through saveSortFocusRatio → Effect #9.
  let viewportRatio: number | null = null;
  const scrollContainer = getScrollContainer();
  if (anchorImageId && scrollContainer && imagePositions.has(anchorImageId)) {
    const { total } = useSearchStore.getState();
    const isTwoTier = isTwoTierFromTotal(total);
    const virtualizerIdx = isTwoTier ? anchorOffset : anchorOffset - bufferOffset;

    // Derive geometry from the scroll container — same logic as the
    // ImageGrid/ImageTable mount that feeds geometryRef.
    const isTable = scrollContainer
      .getAttribute("aria-label")
      ?.includes("table") ?? false;
    const rowHeight = isTable ? TABLE_ROW_HEIGHT : GRID_ROW_HEIGHT;
    const columns = isTable
      ? 1
      : Math.max(1, Math.floor(scrollContainer.clientWidth / GRID_MIN_CELL_WIDTH));

    const rowTop = Math.floor(virtualizerIdx / columns) * rowHeight;
    viewportRatio =
      scrollContainer.clientHeight > 0
        ? (rowTop - scrollContainer.scrollTop) / scrollContainer.clientHeight
        : null;
  }

  return {
    searchKey,
    anchorImageId,
    anchorIsPhantom,
    anchorCursor,
    anchorOffset,
    viewportRatio,
    newCountSince,
  };
}
