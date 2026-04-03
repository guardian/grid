/**
 * FullscreenPreview — lightweight fullscreen image peek from grid/table views.
 *
 * Activated by pressing `f` when an image is focused in the grid or table.
 * No route change, no metadata loading, no ImageDetail mount — just the image
 * at full size on a black background via the browser's Fullscreen API.
 *
 * Exit behaviour:
 *   Esc       → exits fullscreen, returns to grid/table (browser-native)
 *   Backspace → exits fullscreen, returns to grid/table
 *   f         → exits fullscreen, returns to grid/table (toggle)
 *
 * This is deliberately separate from ImageDetail's fullscreen:
 *   - ImageDetail fullscreen: Esc exits fullscreen but stays in image detail.
 *     Backspace closes image detail.
 *   - FullscreenPreview: Esc/Backspace/f all return to grid/table. No
 *     intermediate image detail view.
 *
 * Arrow keys navigate between images while in fullscreen preview, matching
 * ImageDetail's arrow key behaviour. The focused image in the grid/table
 * updates accordingly, so exiting fullscreen lands on the last-viewed image.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchStore } from "@/stores/search-store";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { getFullImageUrl, getThumbnailUrl } from "@/lib/image-urls";
import { prefetchNearbyImages } from "@/lib/image-prefetch";
import { scrollFocusedIntoView } from "@/lib/orchestration/search";
import type { Image } from "@/types/image";

/**
 * Resolve focusedImageId to an Image from the store's buffer.
 */
function resolveFocusedImage(): Image | null {
  const { focusedImageId, imagePositions, bufferOffset, results } =
    useSearchStore.getState();
  if (!focusedImageId) return null;
  const globalIdx = imagePositions.get(focusedImageId);
  if (globalIdx == null) return null;
  const localIdx = globalIdx - bufferOffset;
  if (localIdx < 0 || localIdx >= results.length) return null;
  return results[localIdx] ?? null;
}

/**
 * Navigate to the previous or next image in the buffer.
 * Updates focusedImageId in the store. Returns the new image, or null if
 * at the boundary.
 */
function navigateImage(direction: "prev" | "next"): Image | null {
  const { focusedImageId, imagePositions, bufferOffset, results, setFocusedImageId } =
    useSearchStore.getState();
  if (!focusedImageId) return null;
  const globalIdx = imagePositions.get(focusedImageId);
  if (globalIdx == null) return null;
  const localIdx = globalIdx - bufferOffset;

  const newLocalIdx = direction === "prev" ? localIdx - 1 : localIdx + 1;
  if (newLocalIdx < 0 || newLocalIdx >= results.length) return null;

  const newImage = results[newLocalIdx];
  if (!newImage) return null;

  setFocusedImageId(newImage.id);
  return newImage;
}

function getImageUrl(image: Image): string | undefined {
  const fullUrl = getFullImageUrl(image, {
    width: window.screen.width,
    height: window.screen.height,
    nativeWidth: image.source?.dimensions?.width,
    nativeHeight: image.source?.dimensions?.height,
  });
  return fullUrl ?? getThumbnailUrl(image);
}

export function FullscreenPreview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [currentImage, setCurrentImage] = useState<Image | null>(null);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

  // Track whether we initiated the fullscreen (vs. ImageDetail's fullscreen)
  const initiatedRef = useRef(false);

  // Direction-aware prefetch — same pipeline as ImageDetail.
  // Throttle ref for arrow-key navigation; null on initial enter (no throttle).
  const directionRef = useRef<"forward" | "backward">("forward");
  const lastPrefetchRef = useRef(0);

  /** Resolve the local index of an image in the buffer. */
  const resolveLocalIndex = useCallback((image: Image): number => {
    const { imagePositions, bufferOffset } = useSearchStore.getState();
    const globalIdx = imagePositions.get(image.id);
    if (globalIdx == null) return -1;
    return globalIdx - bufferOffset;
  }, []);

  const enterPreview = useCallback(() => {
    const image = resolveFocusedImage();
    if (!image) return;
    const el = containerRef.current;
    if (!el) return;

    setCurrentImage(image);
    setImageUrl(getImageUrl(image));
    setIsActive(true);
    initiatedRef.current = true;

    // Prefetch neighbours immediately on enter (no throttle).
    const { results } = useSearchStore.getState();
    const localIdx = resolveLocalIndex(image);
    if (localIdx >= 0) {
      prefetchNearbyImages(localIdx, results, "forward", null);
    }

    // Enter fullscreen — the div is always in the DOM (hidden via CSS when
    // not active). requestFullscreen() makes it visible and fullscreen in
    // one step.
    el.requestFullscreen().catch(() => {
      setIsActive(false);
      initiatedRef.current = false;
    });
  }, [resolveLocalIndex]);

  const exitPreview = useCallback(() => {
    if (document.fullscreenElement && initiatedRef.current) {
      document.exitFullscreen().catch(() => {});
    }
    setIsActive(false);
    initiatedRef.current = false;

    // After exiting fullscreen, the focused image may have moved off-screen
    // during arrow-key traversal. Scroll it into view (align: "auto" — only
    // scrolls if needed, places at nearest edge).
    requestAnimationFrame(() => {
      scrollFocusedIntoView();
    });
  }, []);

  // Listen for fullscreen exit (Esc is handled natively by the browser)
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && initiatedRef.current) {
        setIsActive(false);
        initiatedRef.current = false;
        // Scroll focused image into view — same as exitPreview().
        requestAnimationFrame(() => {
          scrollFocusedIntoView();
        });
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Register `f` shortcut — when no image detail is mounted, this is the
  // active handler. When ImageDetail mounts, its `f` registration pushes
  // on top (stack semantics) and this one becomes dormant.
  useKeyboardShortcut("f", isActive ? exitPreview : enterPreview);

  // Keyboard navigation while in fullscreen preview
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Backspace":
          e.preventDefault();
          exitPreview();
          break;
        case "ArrowLeft": {
          e.preventDefault();
          directionRef.current = "backward";
          const prev = navigateImage("prev");
          if (prev) {
            setCurrentImage(prev);
            setImageUrl(getImageUrl(prev));
            const { results } = useSearchStore.getState();
            const localIdx = resolveLocalIndex(prev);
            if (localIdx >= 0) {
              prefetchNearbyImages(localIdx, results, "backward", lastPrefetchRef);
            }
          }
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          directionRef.current = "forward";
          const next = navigateImage("next");
          if (next) {
            setCurrentImage(next);
            setImageUrl(getImageUrl(next));
            const { results } = useSearchStore.getState();
            const localIdx = resolveLocalIndex(next);
            if (localIdx >= 0) {
              prefetchNearbyImages(localIdx, results, "forward", lastPrefetchRef);
            }
          }
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isActive, exitPreview, resolveLocalIndex]);

  const alt =
    currentImage?.metadata?.title ??
    currentImage?.metadata?.description ??
    "";

  // The container div is always in the DOM but invisible when not active.
  // When active, the Fullscreen API makes it fill the screen — no CSS
  // transition needed, the browser handles the fullscreen presentation.
  return (
    <div
      ref={containerRef}
      className={`${
        isActive
          ? "bg-black flex items-center justify-center"
          : "hidden"
      }`}
    >
      {isActive && (
        imageUrl ? (
          <img
            src={imageUrl}
            alt={alt}
            className="w-full h-full object-contain select-none"
            draggable={false}
          />
        ) : (
          <div className="text-white/60 text-sm">No preview available</div>
        )
      )}
    </div>
  );
}








