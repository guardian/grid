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
import { useSearchStore } from "@/stores/search-store";
import { prefetchNearbyImages } from "@/lib/image-prefetch";
import type { Image } from "@/types/image";

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
  /** Navigate to the previous image. No-op if at boundary. */
  goToPrev: () => void;
  /** Navigate to the next image. No-op if at boundary. */
  goToNext: () => void;
  /** Current movement direction (for prefetch and UI hints). */
  direction: "forward" | "backward";
  /** True if a pending navigation is waiting for a buffer extend/seek. */
  pending: boolean;
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
  onNavigate: (image: Image, globalIndex: number, direction: "forward" | "backward") => void,
): ImageTraversalResult {
  const directionRef = useRef<"forward" | "backward">("forward");
  const pendingRef = useRef<"forward" | "backward" | null>(null);
  // Track whether the user has navigated at least once. Proactive extend
  // only fires after a navigation — not on mount, which would cause infinite
  // loops when ImageDetail opens deep in the result set and restoreAroundCursor
  // is also running.
  const hasNavigatedRef = useRef(false);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const currentImageIdRef = useRef(currentImageId);
  currentImageIdRef.current = currentImageId;

  // Subscribe to the minimal store slices we need for re-render.
  // results + bufferOffset change when extends/seeks complete — this is
  // exactly when we need to check for pending navigations.
  const results = useSearchStore((s) => s.results);
  const bufferOffset = useSearchStore((s) => s.bufferOffset);
  const total = useSearchStore((s) => s.total);

  // Resolve current position
  const currentGlobalIndex = currentImageId ? globalIndexOf(currentImageId) : -1;

  // Compute prev/next images (may be null if outside buffer)
  const prevGlobalIdx = currentGlobalIndex > 0 ? currentGlobalIndex - 1 : -1;
  const nextGlobalIdx = currentGlobalIndex >= 0 && currentGlobalIndex < total - 1
    ? currentGlobalIndex + 1
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
    const { extendForward, extendBackward, bufferOffset: bo, results: res, total: t } = useSearchStore.getState();
    const bufferEnd = bo + res.length;

    // Near forward edge → extend forward
    if (currentGlobalIndex >= bufferEnd - EXTEND_AHEAD && bufferEnd < t) {
      extendForward();
    }
    // Near backward edge → extend backward
    if (currentGlobalIndex <= bo + EXTEND_AHEAD && bo > 0) {
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
    const dir = pendingRef.current;
    if (!dir) return;

    const imgId = currentImageIdRef.current;
    if (!imgId) { pendingRef.current = null; return; }

    const gIdx = globalIndexOf(imgId);
    if (gIdx < 0) { pendingRef.current = null; return; }

    const targetGlobalIdx = dir === "forward" ? gIdx + 1 : gIdx - 1;
    const targetImage = getImageAtGlobal(targetGlobalIdx);

    if (targetImage) {
      // Target is now in the buffer — complete the navigation.
      pendingRef.current = null;
      directionRef.current = dir;
      onNavigateRef.current(targetImage, targetGlobalIdx, dir);

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
    if (!imgId) return;

    hasNavigatedRef.current = true;

    const gIdx = globalIndexOf(imgId);
    if (gIdx < 0) return;

    const { total: t } = useSearchStore.getState();
    const targetGlobalIdx = direction === "forward" ? gIdx + 1 : gIdx - 1;

    // Boundary check
    if (targetGlobalIdx < 0 || targetGlobalIdx >= t) return;

    const targetImage = getImageAtGlobal(targetGlobalIdx);

    if (targetImage) {
      // Immediate navigation — target is in the buffer.
      pendingRef.current = null;
      directionRef.current = direction;
      onNavigateRef.current(targetImage, targetGlobalIdx, direction);

      // Prefetch around the new position
      const { results: res, bufferOffset: bo } = useSearchStore.getState();
      const localIdx = targetGlobalIdx - bo;
      if (localIdx >= 0 && localIdx < res.length) {
        prefetchNearbyImages(localIdx, res, direction);
      }
    } else {
      // Target is outside the buffer — request a buffer slide and pend.
      pendingRef.current = direction;
      directionRef.current = direction;

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
    goToPrev,
    goToNext,
    direction: directionRef.current,
    pending: pendingRef.current !== null,
    currentGlobalIndex,
  };
}


