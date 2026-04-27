/**
 * useReturnFromDetail — restore focus and scroll position when closing
 * the image detail overlay.
 *
 * Extracted from ImageTable and ImageGrid where the logic was duplicated.
 *
 * When the `image` URL param transitions from present → absent (user pressed
 * Back or closed the overlay), this hook:
 *   1. Sets focus to the last viewed image
 *   2. If the user navigated to a different image via prev/next in the
 *      detail view, scrolls that image to the center of the viewport
 *
 * Scroll position is preserved natively for the *original* image (the
 * container stays fully laid out while hidden via opacity:0, not display:none),
 * so scrolling only happens when the focused image changed during detail view.
 */

import { useEffect, useRef } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useSearchStore } from "@/stores/search-store";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";

interface ReturnFromDetailConfig {
  /** Current `image` URL search param (undefined when detail is closed). */
  imageParam: string | undefined;

  /** Current focused image ID. */
  focusedImageId: string | null;

  /** Set the focused image ID. */
  setFocusedImageId: (id: string | null) => void;

  /** Find the flat index of an image by ID, or -1. */
  findImageIndex: (imageId: string) => number;

  /** The virtualizer instance. */
  virtualizer: Virtualizer<HTMLDivElement, Element>;

  /** Convert a flat image index to the virtualizer row index for scrolling. */
  flatIndexToRow: (flatIndex: number) => number;
}

export function useReturnFromDetail({
  imageParam,
  focusedImageId,
  setFocusedImageId,
  findImageIndex,
  virtualizer,
  flatIndexToRow,
}: ReturnFromDetailConfig): void {
  // Track previous image param to detect the closing transition.
  const prevImageParam = useRef(imageParam);

  // Track focusedImageId via ref to avoid re-running the effect when focus
  // changes (we only want to fire on imageParam transitions).
  const focusedImageIdRef = useRef(focusedImageId);
  focusedImageIdRef.current = focusedImageId;

  useEffect(() => {
    const wasViewing = prevImageParam.current;
    prevImageParam.current = imageParam;

    // Only act on the transition: image param was set → now gone
    if (!wasViewing || imageParam) return;

    // If focusedImageId was cleared before the image param disappeared,
    // something intentionally reset focus (e.g. resetToHome). Don't undo
    // that by re-setting focus to the old image — it causes flashes when
    // the Home logo navigates away from a deep detail view.
    const previousFocus = focusedImageIdRef.current;
    if (previousFocus === null) return;

    setFocusedImageId(wasViewing);

    // In phantom mode the focus ring is invisible — pulse the image so
    // the user understands why they're looking at this scroll position.
    if (getEffectiveFocusMode() === "phantom") {
      useSearchStore.setState({ _phantomPulseImageId: wasViewing });
      setTimeout(() => useSearchStore.setState({ _phantomPulseImageId: null }), 2500);
    }

    // If the user navigated to a different image (prev/next in detail),
    // the focused row changed — center it in the viewport. "center" not
    // "auto" because the user has never seen this row's position in the
    // list, so placing it in the middle gives equal context above and below.
    if (wasViewing !== previousFocus) {
      const idx = findImageIndex(wasViewing);
      if (idx >= 0) {
        const rowIdx = flatIndexToRow(idx);
        requestAnimationFrame(() => {
          virtualizer.scrollToIndex(rowIdx, { align: "center" });
        });
      }
    }
  }, [imageParam, findImageIndex, virtualizer, flatIndexToRow, setFocusedImageId]);
}

