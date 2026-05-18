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
 * When entered FROM ImageDetail (in detail at P → `f`):
 *   Esc       → exits fullscreen, stays in ImageDetail at P
 *   Backspace → exits fullscreen AND closes ImageDetail via history.back().
 *              The detail at P remains forward-reachable (forward re-opens
 *              detail at P in non-fullscreen — fullscreen is a UI mode of
 *              detail, not a separate URL state).
 *   f         → exits fullscreen, stays in ImageDetail at P (toggle)
 *
 * This is deliberately separate from ImageDetail's fullscreen:
 *   - ImageDetail fullscreen: Esc exits fullscreen but stays in image detail.
 *     Backspace closes image detail (via history.back()).
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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchStore } from "@/stores/search-store";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import { useImageTraversal } from "@/hooks/useImageTraversal";
import { useCursorAutoHide } from "@/hooks/useCursorAutoHide";
import { usePinchZoom } from "@/hooks/usePinchZoom";
import { NavStrip } from "@/components/NavStrip";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { prefetchNearbyImages, getCarouselImageUrl } from "@/lib/image-prefetch";
import { getZoomImageUrl } from "@/lib/image-urls";
import { scrollFocusedIntoView, registerEnterPreview } from "@/lib/orchestration/search";
import { trace } from "@/lib/perceived-trace";
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

/** Resolve the display URL for a fullscreen image.
 *  Uses getCarouselImageUrl (shared with prefetch + ImageDetail side panels)
 *  so the HTTP-cache-warmed URL matches what the DOM receives. */
function getImageUrl(image: Image): string | undefined {
  return getCarouselImageUrl(image);
}

export function FullscreenPreview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const scaleRef = useRef(1);
  const [isActive, setIsActive] = useState(false);
  const [currentImage, setCurrentImage] = useState<Image | null>(null);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [isZoomed, setIsZoomed] = useState(false);

  // Track whether we initiated the fullscreen (vs. ImageDetail's fullscreen)
  const initiatedRef = useRef(false);

  // ── Bug-fix refs ───────────────────────────────────────────────
  // Bug #1: Track the focused image at entry time. On exit, only scroll
  // if the user traversed — otherwise the grid's scrollTop is already
  // correct (the grid stays in the DOM behind the fullscreen layer).
  const entryImageIdRef = useRef<string | null>(null);

  // Bug #2: Track whether we pushed a phantom history entry (the "back
  // absorber"). Checked in exitPreview, fullscreenchange, and the
  // popstate listener to prevent double-pops and coordinate cleanup.
  const phantomEntryRef = useRef(false);

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
    entryImageIdRef.current = image.id;

    // Push a phantom history entry so browser back closes the preview
    // instead of navigating the underlying page. Same URL — invisible
    // to TanStack Router (dedup guard catches same-URL popstate).
    history.pushState(
      { ...history.state, _kupuaFullscreenPreview: true },
      "",
    );
    phantomEntryRef.current = true;

    // Prefetch neighbours immediately on enter (no throttle).
    const { results } = useSearchStore.getState();
    const localIdx = resolveLocalIndex(image);
    if (localIdx >= 0) {
      prefetchNearbyImages(localIdx, results, "forward");
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
      // Roll back phantom entry on fullscreen failure.
      if (phantomEntryRef.current) {
        phantomEntryRef.current = false;
        history.back();
      }
    });
  }, [resolveLocalIndex]);

  // Register enterPreview for imperative access (middle-click from grid/table).
  useEffect(() => {
    registerEnterPreview(enterPreview);
    return () => registerEnterPreview(null);
  }, [enterPreview]);

  /** Common exit cleanup: phantom pulse + conditional scroll. */
  const cleanupAfterExit = useCallback(() => {
    const fid = useSearchStore.getState().focusedImageId;
    // Phantom pulse — in click-to-open mode, pulse the image so the user
    // knows which image they landed on (same animation as return-from-detail).
    if (fid && getEffectiveFocusMode() === "phantom") {
      useSearchStore.setState({ _phantomPulseImageId: fid });
      setTimeout(() => useSearchStore.setState({ _phantomPulseImageId: null }), 2500);
    }
    // Only scroll if the user traversed to a different image. When the
    // image hasn't changed, the grid's scrollTop is already correct
    // (the grid stays in the DOM behind the fullscreen layer).
    const traversed = fid !== entryImageIdRef.current;
    if (traversed) {
      const doScroll = () => {
        requestAnimationFrame(() => {
          scrollFocusedIntoView();
          trace("fullscreen-exit", "t_settled");
        });
      };

      // After fullscreenchange fires, the Fullscreen API considers the exit
      // complete, but on macOS Chrome the window animates back from
      // fullscreen — clientHeight transitions over ~300-500ms. Scrolling
      // with mid-animation dimensions produces wrong centering. Wait for
      // resize events to stop (layout settled) before scrolling.
      // Quick-path: if no resize within 50ms (e.g. Firefox, no animation),
      // scroll immediately. Safety cap at 1s prevents infinite waiting.
      const scrollAfterLayoutSettles = () => {
        let debounceTimer: ReturnType<typeof setTimeout>;
        const maxTimer = setTimeout(finalize, 1000);

        function finalize() {
          window.removeEventListener("resize", onResize);
          clearTimeout(debounceTimer);
          clearTimeout(maxTimer);
          doScroll();
        }

        function onResize() {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(finalize, 150);
        }

        debounceTimer = setTimeout(finalize, 50);
        window.addEventListener("resize", onResize);
      };

      if (document.fullscreenElement) {
        // User-initiated exit (Backspace/f): exitFullscreen() is async and
        // hasn't completed. Wait for fullscreenchange, then for layout.
        const onExit = () => {
          document.removeEventListener("fullscreenchange", onExit);
          scrollAfterLayoutSettles();
        };
        document.addEventListener("fullscreenchange", onExit);
      } else {
        // Browser-initiated exit (Esc): fullscreenchange already fired,
        // but macOS animation may still be in progress.
        scrollAfterLayoutSettles();
      }
    } else {
      trace("fullscreen-exit", "t_settled");
    }
  }, []);

  const exitPreview = useCallback(() => {
    trace("fullscreen-exit", "t_0");
    if (document.fullscreenElement && initiatedRef.current) {
      document.exitFullscreen().catch(() => {});
    }
    setIsActive(false);
    initiatedRef.current = false;
    cooldownRef.current = false;
    setNavReady(false);
    cleanupAfterExit();
    // Pop the phantom history entry. Clear the ref BEFORE history.back()
    // so the popstate listener (which fires synchronously) sees it as
    // already handled and doesn't double-process.
    if (phantomEntryRef.current) {
      phantomEntryRef.current = false;
      history.back();
    }
  }, [cleanupAfterExit]);

  // Zoom (touch pinch + desktop click/wheel/drag). Active when preview is open.
  usePinchZoom({
    containerRef,
    imageRef,
    enabled: isActive,
    scaleRef,
    onScaleChange: setIsZoomed,
    onDoubleClick: exitPreview,
  });

  // Reset zoom state when image changes during traversal
  useLayoutEffect(() => {
    scaleRef.current = 1;
    setIsZoomed(false);
    const img = imageRef.current;
    if (img) {
      img.style.transform = "";
      img.style.willChange = "";
      img.style.transition = "";
    }
  }, [currentImage?.id]);

  // ── Zoom-enhanced hi-res loading ───────────────────────────────
  // When the user zooms past 1×, load a higher-resolution image (2× the
  // standard DPR) so pinch/wheel zoom reveals extra detail. On zoom-out
  // or image change, cancel the in-flight fetch and revert to standard.
  // The old bitmap stays as the compositor texture while the new one
  // decodes — no flash, no layout disruption.
  useEffect(() => {
    if (!isZoomed || !currentImage) return;
    const zoomUrl = getZoomImageUrl(currentImage);
    if (!zoomUrl) return;
    // Don't reload if already showing this URL
    const img = imageRef.current;
    if (img && img.src === new URL(zoomUrl, window.location.href).href) return;

    let cancelled = false;
    const loader = new window.Image();
    loader.src = zoomUrl;
    loader.decode().then(() => {
      if (cancelled) return;
      const el = imageRef.current;
      if (el) el.src = zoomUrl;
    }).catch(() => { /* cancelled or decode error — ignore */ });

    return () => {
      cancelled = true;
      loader.src = ""; // abort in-flight fetch
    };
  }, [isZoomed, currentImage?.id]);

  // Middle-click exits fullscreen preview (matches ImageDetail's middle-click toggle).
  // Uses mouseup (not auxclick) for Firefox compatibility — see ImageDetail.tsx.
  useEffect(() => {
    if (!isActive) return;
    const el = containerRef.current;
    if (!el) return;
    const onMiddleUp = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      exitPreview();
    };
    const onMiddleDown = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    el.addEventListener("mouseup", onMiddleUp);
    el.addEventListener("mousedown", onMiddleDown);
    return () => {
      el.removeEventListener("mouseup", onMiddleUp);
      el.removeEventListener("mousedown", onMiddleDown);
    };
  }, [isActive, exitPreview]);

  // Listen for fullscreen exit (Esc is handled natively by the browser)
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && initiatedRef.current) {
        setIsActive(false);
        initiatedRef.current = false;
        cleanupAfterExit();
        // Pop phantom history entry (same as exitPreview).
        if (phantomEntryRef.current) {
          phantomEntryRef.current = false;
          history.back();
        }
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [cleanupAfterExit]);

  // Listen for popstate — handles browser back gesture closing the preview
  // and bounces dead phantom entries on forward navigation.
  useEffect(() => {
    const handlePopstate = () => {
      // Case 1: Preview is active and browser back popped our phantom entry.
      // The phantom is already gone from the history stack — just clean up.
      if (phantomEntryRef.current && initiatedRef.current) {
        phantomEntryRef.current = false;
        trace("fullscreen-exit", "t_0");
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        setIsActive(false);
        initiatedRef.current = false;
        cooldownRef.current = false;
        setNavReady(false);
        cleanupAfterExit();
        return;
      }
      // Case 2: Dead phantom entry — user pressed forward after closing
      // preview. The entry has _kupuaFullscreenPreview in state but the
      // preview isn't active. Bounce back so the entry is invisible.
      if (
        history.state?._kupuaFullscreenPreview &&
        !initiatedRef.current
      ) {
        history.back();
      }
    };
    window.addEventListener("popstate", handlePopstate);
    return () => window.removeEventListener("popstate", handlePopstate);
  }, [cleanupAfterExit]);

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
          if (scaleRef.current <= 1) goToPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (scaleRef.current <= 1) goToNext();
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
              ref={imageRef}
              src={imageUrl}
              alt=""
              className="w-full h-full object-contain select-none"
              draggable={false}
              fetchPriority="high"
              onLoad={(e) => { (e.target as HTMLImageElement).alt = alt; }}
            />
          ) : (
            <div className="text-white/60 text-sm">No preview available</div>
          )}

          {/* Navigation strips — hidden during animation and when cursor hidden */}
          {navReady && !cursorHidden && !isZoomed && prevImage && (
            <NavStrip direction="prev" onClick={goToPrev} onMouseEnter={navMouseEnter} onMouseLeave={navMouseLeave} />
          )}
          {navReady && !cursorHidden && !isZoomed && nextImage && (
            <NavStrip direction="next" onClick={goToNext} onMouseEnter={navMouseEnter} onMouseLeave={navMouseLeave} />
          )}
        </>
      )}
    </div>
  );
}
