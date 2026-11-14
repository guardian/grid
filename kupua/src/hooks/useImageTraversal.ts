/**
 * useImageTraversal — shared prev/next navigation for ImageDetail and
 * FullscreenPreview.
 *
 * Handles all three scroll modes (buffer, two-tier, seek) uniformly:
 *
 * 1. If the adjacent image is in the buffer → navigate immediately.
 * 2. If the current image is near a buffer edge → trigger extend, store
 *    a pending navigation, and resolve it when the buffer grows.
 * 3. If the current image is at the absolute first/last of all results
 *    → no navigation (boundary).
 *
 * The hook exposes `prevImage`, `nextImage`, `goToPrev`, `goToNext`, and
 * `direction`. Both consumers (ImageDetail, FullscreenPreview) delegate
 * all traversal logic here.
 *
 * ## Coordinate space
 *
 * All internal logic works in **global** indices (0..total-1).
 * - In normal mode, `imagePositions.get(id)` gives the global index;
 *   buffer-local = global - bufferOffset.
 * - In two-tier mode, same map, same math.
 * The consumer never needs to think about coordinate spaces.
 *
 * ## Prefetch
 *
 * The hook fires `prefetchNearbyImages` on every successful navigation
 * (direction-aware, throttled). Callers don't need to manage prefetch.
 *
 * ## Extend vs seek
 *
 * The hook triggers `extendForward`/`extendBackward` when the user is
 * within EXTEND_AHEAD items of the buffer edge. This is proactive — it
 * fires BEFORE the user hits the wall, so in normal traversal speed the
 * buffer slides ahead and the user never sees a loading state.
 *
 * When an extend/seek is in flight and the adjacent image isn't available
 * yet, the hook stores a `_pendingDirection` and watches `results` for
 * changes. When the buffer updates and the target image appears, navigation
 * completes automatically.
 */

import { useCallback, useEffect, useRef } from "react";
import { canExtendForward, getDisplayEnd, getSearchGeneration, getTerminalDirection, getWindowMaintenanceDelay, useSearchStore } from "@/stores/search-store";
import { prefetchNearbyImages } from "@/lib/image-prefetch";
import { buildSearchKey } from "@/lib/image-offset-cache";
import type { Image } from "@/types/image";
import type { RouterHistory } from "@tanstack/react-router";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * How many images ahead of the current position to trigger a proactive
 * extend. At normal arrow-key speed (~200ms/step), a 200-item extend
 * takes ~200-400ms — so 20 items ≈ 4-8s of headroom.
 */
const EXTEND_AHEAD = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageTraversalResult {
  /** The image before the current one, or null if at boundary / not loaded yet. */
  prevImage: Image | null;
  /** The image after the current one, or null if at boundary / not loaded yet. */
  nextImage: Image | null;
  canGoNext: boolean;
  /** Navigate to the previous image. No-op if at boundary. */
  goToPrev: () => void;
  /** Navigate to the next image. No-op if at boundary. */
  goToNext: () => void;
  /** The global index of the current image, or -1 if not found. */
  currentGlobalIndex: number;
}

// ---------------------------------------------------------------------------
// Helpers — work with store state directly (no hooks, no re-renders)
// ---------------------------------------------------------------------------

/** Resolve a global index to an Image from the buffer, or null. */
function getImageAtGlobal(globalIdx: number): Image | null {
  const { bufferOffset, results } = useSearchStore.getState();
  const localIdx = globalIdx - bufferOffset;
  if (localIdx < 0 || localIdx >= results.length) return null;
  return results[localIdx] ?? null;
}

/** Get the global index of an image by ID, or -1. */
function globalIndexOf(imageId: string): number {
  const { imagePositions } = useSearchStore.getState();
  return imagePositions.get(imageId) ?? -1;
}

function adjacentAvailableIndex(index: number, step: number): number {
  let target = index + step;
  while (getImageAtGlobal(target)?.__availability) target += step;
  return target;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param currentImageId — the ID of the currently displayed image
 * @param onNavigate — called when navigation succeeds, with the new Image.
 *   ImageDetail uses this to update the URL. FullscreenPreview uses it to
 *   update local state.
 */
export function useImageTraversal(
  currentImageId: string | null,
  onNavigate: (image: Image, globalIndex: number) => void,
  history?: RouterHistory,
  onCancelled?: () => void,
): ImageTraversalResult {
  const onCancelledRef = useRef(onCancelled);
  onCancelledRef.current = onCancelled;
  const historyRef = useRef(history);
  historyRef.current = history;
  const pendingRef = useRef<{
    imageId: string;
    direction: "forward" | "backward";
    isCurrent: () => boolean;
    cancel: (navigated?: boolean) => void;
  } | null>(null);
  // Track whether the user has navigated at least once. Proactive extend
  // only fires after a navigation — not on mount, which would cause infinite
  // loops when ImageDetail opens deep in the result set and restoreAroundCursor
  // is also running.
  const hasNavigatedRef = useRef(false);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const currentImageIdRef = useRef(currentImageId);
  currentImageIdRef.current = currentImageId;
  useEffect(() => () => { pendingRef.current?.cancel(); }, []);

  // FullscreenPreview keeps this hook mounted while inactive and passes null
  // between sessions. Pending navigation and proactive-extension eligibility
  // belong to one active session, so discard them at that boundary. Any shared
  // store request may still complete, but cannot navigate or extend a later
  // preview session.
  useEffect(() => {
    if (pendingRef.current && pendingRef.current.imageId !== currentImageId) {
      pendingRef.current.cancel();
      hasNavigatedRef.current = false;
    }
    if (currentImageId !== null) return;
    pendingRef.current?.cancel();
    hasNavigatedRef.current = false;
  }, [currentImageId]);

  // Subscribe to the minimal store slices we need for re-render.
  // results + bufferOffset change when extends/seeks complete — this is
  // exactly when we need to check for pending navigations.
  const results = useSearchStore((s) => s.results);
  const bufferOffset = useSearchStore((s) => s.bufferOffset);
  const total = useSearchStore(getDisplayEnd);

  // Resolve current position
  const currentGlobalIndex = currentImageId ? globalIndexOf(currentImageId) : -1;

  // Compute prev/next images (may be null if outside buffer)
  const prevGlobalIdx = currentGlobalIndex > 0 ? adjacentAvailableIndex(currentGlobalIndex, -1) : -1;
  const nextGlobalIdx = currentGlobalIndex >= 0 && currentGlobalIndex < total - 1
    ? adjacentAvailableIndex(currentGlobalIndex, 1)
    : -1;

  const prevImage = prevGlobalIdx >= 0 ? getImageAtGlobal(prevGlobalIdx) : null;
  const nextImage = nextGlobalIdx >= 0 ? getImageAtGlobal(nextGlobalIdx) : null;

  // ── Proactive extend ────────────────────────────────────────────
  // When the current image is near a buffer edge, trigger an extend
  // preemptively so the buffer slides ahead of the user.
  // Only fires after the user has navigated — not on initial mount,
  // which would fight with restoreAroundCursor during reload.
  useEffect(() => {
    if (!hasNavigatedRef.current) return;
    if (currentGlobalIndex < 0) return;
    const { extendForward, extendBackward, bufferOffset: bo, results: res } = useSearchStore.getState();
    const bufferEnd = bo + res.length;

    // Near forward edge → extend forward
    if (currentGlobalIndex >= bufferEnd - EXTEND_AHEAD && canExtendForward() && !getTerminalDirection(bufferEnd)) {
      extendForward();
    }
    // Near backward edge → extend backward
    if (currentGlobalIndex <= bo + EXTEND_AHEAD && bo > 0 && !getTerminalDirection(bo - 1)) {
      extendBackward();
    }
  }, [currentGlobalIndex, results, bufferOffset]);

  // ── Initial prefetch on mount ──────────────────────────────────
  // When the detail view first opens, prefetch images around the current
  // position so decoded bitmaps are ready by the time the user swipes.
  // Only fires once (empty deps + guard on hasNavigatedRef).
  useEffect(() => {
    if (hasNavigatedRef.current) return; // already navigating, prefetch handled there
    if (currentGlobalIndex < 0) return;
    const { results: res, bufferOffset: bo } = useSearchStore.getState();
    const localIdx = currentGlobalIndex - bo;
    if (localIdx >= 0 && localIdx < res.length) {
      prefetchNearbyImages(localIdx, res, "forward");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once when position is known
  }, [currentGlobalIndex]);

  // ── Pending navigation resolution ──────────────────────────────
  // When a navigation was requested but the target wasn't in the buffer,
  // watch for buffer changes (results/bufferOffset) and complete the
  // navigation when the target appears.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (!pending.isCurrent()) { pending.cancel(); hasNavigatedRef.current = false; return; }
    const dir = pending.direction;

    const imgId = pending.imageId;

    const gIdx = globalIndexOf(imgId);
    if (gIdx < 0) { pending.cancel(); return; }

    const targetGlobalIdx = adjacentAvailableIndex(gIdx, dir === "forward" ? 1 : -1);
    if (targetGlobalIdx < 0 || (targetGlobalIdx >= getDisplayEnd() && !canExtendForward())) { pending.cancel(); return; }
    const targetImage = getImageAtGlobal(targetGlobalIdx);

    if (targetImage) {
      // Target is now in the buffer — complete the navigation.
      pending.cancel(true);
      onNavigateRef.current(targetImage, targetGlobalIdx);

      // Prefetch around the new position
      const { results: res, bufferOffset: bo } = useSearchStore.getState();
      const localIdx = targetGlobalIdx - bo;
      if (localIdx >= 0 && localIdx < res.length) {
        prefetchNearbyImages(localIdx, res, dir);
      }
    }
  }, [results, bufferOffset]);

  // ── Navigate ───────────────────────────────────────────────────
  const navigate = useCallback((direction: "forward" | "backward") => {
    const imgId = currentImageIdRef.current;
    if (!imgId) { onCancelledRef.current?.(); return; }

    hasNavigatedRef.current = true;

    const gIdx = globalIndexOf(imgId);
    if (gIdx < 0) { onCancelledRef.current?.(); return; }

    const state = useSearchStore.getState();
    const targetGlobalIdx = adjacentAvailableIndex(gIdx, direction === "forward" ? 1 : -1);

    // Boundary check
    if (targetGlobalIdx < 0 || (targetGlobalIdx >= getDisplayEnd(state) && !canExtendForward(state))) {
      onCancelledRef.current?.();
      return;
    }

    const targetImage = getImageAtGlobal(targetGlobalIdx);

    if (targetImage) {
      // Immediate navigation — target is in the buffer.
      pendingRef.current?.cancel();
      onNavigateRef.current(targetImage, targetGlobalIdx);

      // Prefetch around the new position
      const { results: res, bufferOffset: bo } = useSearchStore.getState();
      const localIdx = targetGlobalIdx - bo;
      if (localIdx >= 0 && localIdx < res.length) {
        prefetchNearbyImages(localIdx, res, direction);
      }
    } else {
      // Target is outside the buffer — request a buffer slide and pend.
      const existing = pendingRef.current;
      if (!existing || existing.imageId !== imgId || existing.direction !== direction || !existing.isCurrent()) {
        existing?.cancel();
        const generation = getSearchGeneration();
        let params = useSearchStore.getState().params;
        const scope = buildSearchKey(params);
        let currentScope = scope;
        let unsubscribe = () => {};
        let unsubscribeHistory = () => {};
        let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
        const pending = {
          imageId: imgId,
          direction,
          isCurrent: () => {
            if (currentImageIdRef.current !== imgId || generation !== getSearchGeneration()) return false;
            const currentParams = useSearchStore.getState().params;
            if (params !== currentParams) {
              params = currentParams;
              currentScope = buildSearchKey(params);
            }
            return currentScope === scope;
          },
          cancel: (navigated = false) => {
            clearTimeout(recoveryTimer);
            unsubscribe();
            unsubscribeHistory();
            if (pendingRef.current === pending) {
              pendingRef.current = null;
              if (!navigated) onCancelledRef.current?.();
            }
          },
        };
        pendingRef.current = pending;
        unsubscribe = useSearchStore.subscribe((state, previous) => {
          if (!pending.isCurrent()) { pending.cancel(); hasNavigatedRef.current = false; return; }
          const position = state.imagePositions.get(imgId);
          const completed = direction === "forward" ? state._terminalEnd !== previous._terminalEnd : state._terminalStart !== previous._terminalStart;
          if (completed && position !== undefined && getTerminalDirection(adjacentAvailableIndex(position, direction === "forward" ? 1 : -1))) {
            pending.cancel();
            return;
          }
          const recovery = state._windowRecovery;
          if (!recovery || recovery === previous._windowRecovery || recovery.signal.aborted ||
              recovery.searchGeneration !== generation || state.results !== previous.results) return;
          if (direction === "forward"
            ? !state.endCursor || state.endCursor === previous.endCursor
            : !state.startCursor || state.startCursor === previous.startCursor) return;
          const resume = () => {
            clearTimeout(recoveryTimer);
            if (pendingRef.current !== pending || !pending.isCurrent() || recovery.signal.aborted) return;
            const delay = getWindowMaintenanceDelay();
            if (delay > 0) { recoveryTimer = setTimeout(resume, delay); return; }
            const current = useSearchStore.getState();
            if (direction === "forward") current.extendForward();
            else current.extendBackward();
          };
          resume();
        });
        unsubscribeHistory = historyRef.current?.subscribe(() => {
          pending.cancel();
          hasNavigatedRef.current = false;
        }) ?? (() => {});
      }

      const { extendForward, extendBackward, seek, bufferOffset: bo, results: res } = useSearchStore.getState();
      const bufferEnd = bo + res.length;

      // Decide: extend or seek?
      // If the target is adjacent to the buffer (within one extend), extend.
      // Otherwise (shouldn't happen in normal traversal, but safety net), seek.
      if (direction === "forward" && targetGlobalIdx < bufferEnd + 200) {
        extendForward();
      } else if (direction === "backward" && targetGlobalIdx >= bo - 200) {
        extendBackward();
      } else {
        // Far from buffer — seek to center the target in the buffer
        seek(targetGlobalIdx);
      }
    }
  }, []);

  const goToPrev = useCallback(() => navigate("backward"), [navigate]);
  const goToNext = useCallback(() => navigate("forward"), [navigate]);

  return {
    prevImage,
    nextImage,
    canGoNext: nextImage !== null || (currentGlobalIndex >= 0 && canExtendForward()),
    goToPrev,
    goToNext,
    currentGlobalIndex,
  };
}


