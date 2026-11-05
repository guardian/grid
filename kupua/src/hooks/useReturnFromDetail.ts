/**
 * useReturnFromDetail — restore focus and scroll position when closing
 * the image detail overlay.
 *
 * Extracted from ImageTable and ImageGrid where the logic was duplicated.
 *
 * When detail closes into its originating list entry, this hook:
 *   1. Sets focus to the last viewed image
 *   2. If the user navigated to a different image via prev/next in the
 *      detail view, scrolls that image to the center of the viewport
 *
 * Scroll position is preserved natively for the *original* image (the
 * container stays fully laid out while hidden via opacity:0, not display:none),
 * so scrolling only happens when the closing image differs from the immutable
 * detail-entry image recorded in history state.
 */

import { useEffect, useRef } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { getSearchGeneration, useSearchStore } from "@/stores/search-store";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import { getCurrentKupuaKey } from "@/lib/orchestration/history-key";
import { captureDetailEntry, startDetailSession, chooseDetailReturn, type DetailReturnTarget, type DetailEntry } from "@/lib/detail-return";

// ---------------------------------------------------------------------------
// One-shot suppress flag — set by resetToHome() so useReturnFromDetail
// skips scroll restoration even in phantom mode (where focusedImageId
// is always null and can't signal "intentional clear").
//
// Only meaningful when resetToHome() is called *while detail is open*
// (imageParam present) — it's consumed on that session's closing transition
// below. If Home is pressed from the grid (imageParam already absent), there
// is no closing transition to consume it here, so it would otherwise leak
// into a future, unrelated detail-close. The effect below clears it as soon
// as a fresh detail session opens, so a stale flag never survives to
// suppress the wrong close (see regression test "stale flag from Home-on-
// grid must not suppress a later, unrelated detail close").
// ---------------------------------------------------------------------------
let _suppressReturnFromDetail: symbol | null = null;

/** Suppress the next useReturnFromDetail scroll restoration. */
export function suppressReturnFromDetail(): () => void {
  const owner = Symbol();
  _suppressReturnFromDetail = owner;
  return () => { if (_suppressReturnFromDetail === owner) _suppressReturnFromDetail = null; };
}

interface ReturnFromDetailConfig {
  /** Current `image` URL search param (undefined when detail is closed). */
  imageParam: string | undefined;

  /** Set the focused image ID. */
  setFocusedImageId: (id: string | null, recordIntent?: boolean) => void;

  /** Find the flat index of an image by ID, or -1. */
  findImageIndex: (imageId: string) => number;

  /** The virtualizer instance. */
  virtualizer: Virtualizer<HTMLDivElement, Element>;

  /** Convert a flat image index to the virtualizer row index for scrolling. */
  flatIndexToRow: (flatIndex: number) => number;

  /**
   * Optional custom centering callback — used by ImageTable to bypass
   * TanStack's scrollToIndex({align:"center"}) which doesn't account
   * for the sticky header.  When absent, falls back to scrollToIndex.
   */
  scrollRowToCenter?: (rowIdx: number) => void;
  chooseReturn?: (entry: DetailEntry, imageId: string) => DetailReturnTarget;
}

export function useReturnFromDetail({
  imageParam,
  setFocusedImageId,
  findImageIndex,
  virtualizer,
  flatIndexToRow,
  scrollRowToCenter,
  chooseReturn = chooseDetailReturn,
}: ReturnFromDetailConfig): void {
  // Track previous image param to detect the closing transition.
  const prevImageParam = useRef(imageParam);
  const entryKey = getCurrentKupuaKey();
  const detailEntryRef = useRef(imageParam ? captureDetailEntry(imageParam) : null);
  const callbacksRef = useRef({ findImageIndex, virtualizer, flatIndexToRow, scrollRowToCenter, setFocusedImageId, chooseReturn });
  callbacksRef.current = { findImageIndex, virtualizer, flatIndexToRow, scrollRowToCenter, setFocusedImageId, chooseReturn };

  useEffect(() => {
    const wasViewing = prevImageParam.current;
    prevImageParam.current = imageParam;
    if (imageParam && new URL(window.location.href).searchParams.get("image") === imageParam) {
      const entry = captureDetailEntry(imageParam);
      if (entryKey !== detailEntryRef.current?.key || (!detailEntryRef.current?.originKey && entry.originKey)) {
        detailEntryRef.current = entry;
      }
    }

    // Opening transition: detail just opened fresh (was not viewing anything,
    // now viewing an image). resetToHome() sets _suppressReturnFromDetail
    // unconditionally, but the flag is only ever consumed on a *closing*
    // transition below. If Home was pressed while already on the grid (no
    // detail open), that closing transition never happens here, so the flag
    // is left dangling — silently suppressing focus restoration on some
    // unrelated, much-later detail close. Clear it here: a suppress flag set
    // before this fresh open can never legitimately apply to this session's
    // eventual close.
    if (!wasViewing && imageParam) {
      _suppressReturnFromDetail = null;
      detailEntryRef.current = startDetailSession(imageParam);
      return;
    }

    // Only act on the transition: image param was set → now gone
    if (!wasViewing || imageParam) return;

    // resetToHome sets this flag to prevent scroll restoration — the user
    // is going Home, not returning to the list at their old position.
    // Must be checked BEFORE the phantom-mode bypass below, because in
    // phantom mode focusedImageId is always null and can't signal an
    // intentional clear.
    if (_suppressReturnFromDetail) {
      _suppressReturnFromDetail = null;
      return;
    }
    const detailEntry = detailEntryRef.current;
    if (!detailEntry || (detailEntry.originKey && entryKey !== detailEntry.originKey)) return;
    const target = callbacksRef.current.chooseReturn(detailEntry, wasViewing);
    callbacksRef.current.setFocusedImageId(target.imageId, false);

    // In phantom mode the focus ring is invisible — pulse the image so
    // the user understands why they're looking at this scroll position.
    if (getEffectiveFocusMode() === "phantom") {
      useSearchStore.setState({ _phantomPulseImageId: target.imageId });
      setTimeout(() => {
        if (useSearchStore.getState()._phantomPulseImageId === target.imageId) {
          useSearchStore.setState({ _phantomPulseImageId: null });
        }
      }, 2500);
    }

    // If the user navigated to a different image (prev/next in detail),
    // the focused row changed — center it in the viewport. "center" not
    // "auto" because the user has never seen this row's position in the
    // list, so placing it in the middle gives equal context above and below.
    const generation = getSearchGeneration();
    const historyKey = entryKey;
    const state = useSearchStore.getState();
    const focusIntent = state._focusIntent;
    let retired = false;
    let frame: number | undefined;
    const ownsReturn = () => !retired && getSearchGeneration() === generation
      && getCurrentKupuaKey() === historyKey && useSearchStore.getState()._focusIntent === focusIntent;
    const retire = () => {
      retired = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      unsubscribe();
    };
    const schedule = () => {
      if (!ownsReturn()) { retire(); return; }
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        if (!ownsReturn()) { retire(); return; }
        const current = callbacksRef.current;
        if (useSearchStore.getState().loading) return;
        if (target.placement === "native") {
          if (useSearchStore.getState().focusedImageId !== target.imageId) current.setFocusedImageId(target.imageId, false);
          retire();
          return;
        }
        const currentIndex = current.findImageIndex(target.imageId);
        if (currentIndex < 0) return;
        if (useSearchStore.getState().focusedImageId !== target.imageId) current.setFocusedImageId(target.imageId, false);
        const rowIdx = current.flatIndexToRow(currentIndex);
        if (current.scrollRowToCenter) {
          current.scrollRowToCenter(rowIdx);
        } else {
          current.virtualizer.scrollToIndex(rowIdx, { align: "center" });
        }
        retire();
      });
    };
    const unsubscribe = useSearchStore.subscribe(schedule);
    schedule();
    return retire;
  }, [imageParam, entryKey]);
}

