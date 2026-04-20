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
 *
 * Traversal uses the shared `useImageTraversal` hook which handles all three
 * scroll modes (buffer, two-tier, seek) — triggering extends/seeks when
 * the adjacent image is outside the buffer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchStore } from "@/stores/search-store";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import { useImageTraversal } from "@/hooks/useImageTraversal";
import { useCursorAutoHide } from "@/hooks/useCursorAutoHide";
import { NavStrip } from "@/components/NavStrip";
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

  // Cooldown after entering fullscreen — Chrome shows a permission overlay
  // ("Press Esc to exit full screen") that swallows the first keypress.
  // Ignore all keyboard input during this window to prevent broken state.
  // Also suppresses nav button hover during macOS fullscreen animation.
  const cooldownRef = useRef(false);
  const [navReady, setNavReady] = useState(false);

  // ── Traversal via shared hook ──────────────────────────────────
  // The hook manages prev/next, buffer extension, seek, and prefetch.
  // We pass focusedImageId as the current image — the hook tracks
  // position in the global result set.
  const focusedImageId = useSearchStore((s) => s.focusedImageId);

  const onNavigate = useCallback(
    (image: Image, _globalIndex: number, _direction: "forward" | "backward") => {
      useSearchStore.getState().setFocusedImageId(image.id);
      setCurrentImage(image);
      setImageUrl(getImageUrl(image));
    },
    [],
  );

  const { prevImage, nextImage, goToPrev, goToNext } = useImageTraversal(
    isActive ? focusedImageId : null,
    onNavigate,
  );

  /** Resolve the local index of an image in the buffer (for initial prefetch). */
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
    // one step. Cooldown prevents double-fire of `f` during Chrome's
    // permission overlay.
    cooldownRef.current = true;
    setNavReady(false);
    el.requestFullscreen().then(() => {
      // Focus the container so keyboard events reach our listeners immediately.
      // Without this, some browsers hold focus on the permission overlay for
      // up to ~1s after the fullscreen transition completes.
      el.focus();
      setTimeout(() => {
        cooldownRef.current = false;
        setNavReady(true);
      }, 500);
    }).catch(() => {
      setIsActive(false);
      initiatedRef.current = false;
      cooldownRef.current = false;
    });
  }, [resolveLocalIndex]);

  const exitPreview = useCallback(() => {
    if (document.fullscreenElement && initiatedRef.current) {
      document.exitFullscreen().catch(() => {});
    }
    setIsActive(false);
    initiatedRef.current = false;
    cooldownRef.current = false;
    setNavReady(false);

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
  // Register `f` shortcut — gated by cooldown to prevent double-fire
  // during Chrome's fullscreen permission overlay.
  const handleF = useCallback(() => {
    if (cooldownRef.current) return;
    if (isActive) {
      exitPreview();
    } else {
      // In phantom mode, f-to-enter-preview is disabled from the list/grid.
      // (f still works from ImageDetail, which registers its own shortcut.)
      if (getEffectiveFocusMode() === "phantom") return;
      enterPreview();
    }
  }, [isActive, exitPreview, enterPreview]);
  useKeyboardShortcut("f", handleF);

  // Keyboard navigation while in fullscreen preview
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Backspace":
          e.preventDefault();
          exitPreview();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goToPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goToNext();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isActive, exitPreview, goToPrev, goToNext]);

  const alt =
    currentImage?.metadata?.title ??
    currentImage?.metadata?.description ??
    "";

  // ── Hide cursor after 2s of inactivity (YouTube-style) ─────────
  const { cursorHidden, navMouseEnter, navMouseLeave } = useCursorAutoHide(isActive);

  // The container div is always in the DOM but invisible when not active.
  // When active, the Fullscreen API makes it fill the screen — no CSS
  // transition needed, the browser handles the fullscreen presentation.
  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={`outline-none ${
        isActive
          ? `bg-black flex items-center justify-center${cursorHidden ? " cursor-none" : ""}`
          : "hidden"
      }`}
    >
      {isActive && (
        <>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-contain select-none"
              draggable={false}
              onLoad={(e) => { (e.target as HTMLImageElement).alt = alt; }}
            />
          ) : (
            <div className="text-white/60 text-sm">No preview available</div>
          )}

          {/* Navigation strips — hidden during animation and when cursor hidden */}
          {navReady && !cursorHidden && prevImage && (
            <NavStrip direction="prev" onClick={goToPrev} onMouseEnter={navMouseEnter} onMouseLeave={navMouseLeave} />
          )}
          {navReady && !cursorHidden && nextImage && (
            <NavStrip direction="next" onClick={goToNext} onMouseEnter={navMouseEnter} onMouseLeave={navMouseLeave} />
          )}
        </>
      )}
    </div>
  );
}
