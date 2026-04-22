/**
 * Image detail view — overlay within the search route.
 *
 * This is NOT a separate page. It renders on top of the search results when
 * `image` is present in the URL search params. The search page stays
 * mounted underneath (hidden via CSS), so:
 * - Scroll position is preserved exactly
 * - Search context (query, filters, sort) is preserved in the URL
 * - Browser back removes `image` from params → table reappears at the
 *   exact scroll position
 * - No re-search is triggered (image is a display-only URL param)
 *
 * Architecture (Decision 5): "all views are one page — table, grid,
 * side-by-side, detail are density levels of the same ordered list."
 *
 * Key architectural property:
 * - **Fullscreen survives between images.** The fullscreened container is a
 *   stable DOM element. When the imageId prop changes (prev/next), React
 *   reconciles the same component — the DOM node persists, so the Fullscreen
 *   API does not exit.
 * - Keyboard shortcuts: `f` toggle fullscreen (`Alt+f` in text fields),
 *   `←/→` prev/next image,
 *   `Escape` exit fullscreen only (never navigates — close via the
 *   "← Back" button in the UI).
 * - "← Back" button navigates to the search list (strips `image` from
 *   URL params, replace: true). This is NOT history.back() — it always
 *   goes to the list regardless of history depth. Browser back is a
 *   separate operation (undoes the last navigation — may go to a
 *   previous image if the user manually edited the URL).
 * - Prev/next navigates through the search results stored in the Zustand
 *   search store, replacing `imageId` in the URL with `replace: true`
 *   (so back always returns to the table, not through every viewed image).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useSearchStore } from "@/stores/search-store";
import { useDataWindow } from "@/hooks/useDataWindow";
import { useImageTraversal } from "@/hooks/useImageTraversal";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useCursorAutoHide } from "@/hooks/useCursorAutoHide";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { useSwipeCarousel } from "@/hooks/useSwipeCarousel";
import { useSwipeDismiss } from "@/hooks/useSwipeDismiss";
import { usePinchZoom } from "@/hooks/usePinchZoom";
import { getFullImageUrl, getThumbnailUrl } from "@/lib/image-urls";
import { isFullResLoaded, markFullResLoaded, onFullResDecoded, getCarouselImageUrl } from "@/lib/image-prefetch";
import { NavStrip } from "@/components/NavStrip";
import { StableImg } from "@/components/StableImg";
import { resetToHome } from "@/lib/reset-to-home";
import { scrollFocusedIntoView } from "@/lib/orchestration/search";
import { DEFAULT_SEARCH } from "@/lib/home-defaults";
import { storeImageOffset, getImageOffset, buildSearchKey, extractSortValues } from "@/lib/image-offset-cache";
import { ImageMetadata } from "@/components/ImageMetadata";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";
import type { Image } from "@/types/image";

/** Delay before acting on single-tap in fullscreen — allows double-tap-to-zoom. */
const DOUBLE_TAP_MS = 300;

interface ImageDetailProps {
  imageId: string;
  /** Ref to the grid/list container behind the detail — animated during dismiss. */
  gridContainerRef?: React.RefObject<HTMLElement | null>;
}

export function ImageDetail({ imageId, gridContainerRef }: ImageDetailProps) {
  const { total, findImageIndex, getImage } = useDataWindow();
  const dataSource = useSearchStore((s) => s.dataSource);
  const restoreAroundCursor = useSearchStore((s) => s.restoreAroundCursor);
  const navigate = useNavigate();
  const searchParams = useSearch({ from: "/search" });
  const searchKey = useMemo(() => buildSearchKey(searchParams), [searchParams]);

  // Mount timestamp — used to suppress stray dblclick events that leak
  // from the grid/table in phantom focus mode. In phantom mode, single-click
  // opens detail; if the user double-clicks, React re-renders fast enough
  // that the second click lands on ImageDetail's <img>, and the browser
  // synthesises a dblclick → closeDetail. Suppressing dblclick for 500ms
  // after mount blocks this without affecting legitimate double-click-to-close.
  const mountTimeRef = useRef(Date.now());

  // The fullscreen container ref — must be stable across imageId changes
  const containerRef = useRef<HTMLDivElement>(null);
  // The imageId the user entered detail with — used to detect traversal.
  // Only set once (on mount). If the user navigates prev/next, imageId changes
  // but entryImageIdRef stays the same.
  const entryImageIdRef = useRef(imageId);
  // Wrapper around the entire detail view — animated during swipe-to-dismiss.
  const detailWrapperRef = useRef<HTMLDivElement>(null);
  // Carousel strip — the inner element translated by swipe gestures.
  const stripRef = useRef<HTMLDivElement>(null);
  // Center panel's <img> — transform target for pinch-zoom.
  const imageRef = useRef<HTMLImageElement>(null);
  // Mobile scroll container — the outer flex-col div that scrolls on narrow screens.
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);
  const { cursorHidden, navMouseEnter, navMouseLeave } = useCursorAutoHide(isFullscreen);

  // Find the current image in search results (handles sparse array)
  const currentIndex = useMemo(
    () => findImageIndex(imageId),
    [findImageIndex, imageId],
  );
  const imageFromResults = currentIndex >= 0 ? getImage(currentIndex) : undefined;

  // ── Restore search context from cached cursor ──────────────────────
  //
  // On page reload, the image may not be in the first page of results.
  // If we have a cached cursor (stored when entering image detail or
  // navigating prev/next), use search_after to load a page centered on
  // the image. With a cursor this is exact at any depth. Without one
  // (old cache format) falls back to approximate seek.
  const offsetRestoreAttempted = useRef(false);
  // Track which imageId the restore was attempted for — only reset the
  // flag when navigating to a DIFFERENT image. Without this, the flag
  // resets when the image briefly appears in the buffer (currentIndex >= 0)
  // and a subsequent buffer change (e.g. wrong scrollTop in two-tier mode
  // triggering a scroll-seek) pushes it back out — causing an infinite
  // restoreAroundCursor loop.
  const restoreAttemptedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentIndex >= 0) {
      // Image is already in results — no restore needed.
      // Only reset the flag if this is a different image from the one
      // we already restored — allows re-restore after user navigates
      // to a new image, but prevents re-triggering for the same image
      // when the buffer briefly contains it then loses it.
      if (restoreAttemptedForRef.current !== imageId) {
        offsetRestoreAttempted.current = false;
      }
      return;
    }
    // Don't attempt restore until the initial search has returned —
    // restoreAroundCursor needs total > 0 for countBefore to clamp correctly.
    if (total === 0) return;
    if (offsetRestoreAttempted.current) return; // already tried
    const cached = getImageOffset(imageId, searchKey);
    if (cached == null) return; // no cached position — standalone mode
    offsetRestoreAttempted.current = true;
    restoreAttemptedForRef.current = imageId;
    restoreAroundCursor(imageId, cached.cursor, cached.offset);
  }, [imageId, currentIndex, restoreAroundCursor, searchKey, total]);

  // Standalone fetch — when the imageId isn't in the search results
  // (e.g. direct URL navigation, bookmark, /images/:id redirect),
  // fetch it by ID from ES directly.  This eliminates the "Image not
  // found" dead end — if the image exists in the index, we show it.
  const [standaloneImage, setStandaloneImage] = useState<Image | null>(null);
  const [standaloneFetchFailed, setStandaloneFetchFailed] = useState(false);

  useEffect(() => {
    // If the image is already in search results, no need to fetch
    if (imageFromResults) {
      setStandaloneImage(null);
      setStandaloneFetchFailed(false);
      return;
    }
    // Fetch by ID
    let cancelled = false;
    setStandaloneFetchFailed(false);
    dataSource.getById(imageId).then(
      (img) => {
        if (cancelled) return;
        if (img) {
          setStandaloneImage(img);
        } else {
          setStandaloneFetchFailed(true);
        }
      },
      () => {
        if (!cancelled) setStandaloneFetchFailed(true);
      },
    );
    return () => { cancelled = true; };
  }, [imageId, imageFromResults, dataSource]);

  // Use the image from results if available (preserves prev/next nav),
  // otherwise fall back to the standalone fetch
  const image = imageFromResults ?? standaloneImage;

  // ── Traversal via shared hook ──────────────────────────────────
  // The hook manages prev/next availability, buffer extension, seek,
  // and prefetch. It works identically in all three scroll modes.
  const searchParamsOrderBy = searchParams.orderBy;
  const onNavigate = useCallback(
    (img: Image, globalIndex: number, _direction: "forward" | "backward") => {
      // Store the target image's offset + sort cursor in sessionStorage so
      // the counter and prev/next survive page reload.
      const cursor = extractSortValues(img, searchParamsOrderBy);
      storeImageOffset(img.id, globalIndex, searchKey, cursor);

      navigate({
        to: "/search",
        search: (prev: Record<string, unknown>) => ({ ...prev, image: img.id }),
        replace: true,
      });
    },
    [navigate, searchKey, searchParamsOrderBy],
  );

  const {
    prevImage, nextImage, goToPrev, goToNext, currentGlobalIndex,
  } = useImageTraversal(imageId, onNavigate);

  // Close image detail — navigate to the search list by stripping the
  // `image` param from the URL.  This is NOT history.back() — it's a
  // deliberate "go to search view" action.  Browser back remains a
  // separate operation (undoes the last navigation, which might be
  // another image if the user manually edited the URL).
  //
  // Uses replace: true so the current image entry is replaced with the
  // list — pressing browser back from the list won't bounce back to the
  // image the user just closed.
  const closeDetail = useCallback(() => {
    navigate({
      to: "/search",
      search: (prev: Record<string, unknown>) => {
        const { image: _, ...rest } = prev;
        return rest;
      },
      replace: true,
    });
  }, [navigate]);

  // Keyboard shortcut: f = toggle fullscreen (via centralised shortcut system)
  // Alt+f works when focus is in an editable field.
  useKeyboardShortcut("f", toggleFullscreen);

  // Shared scaleRef — written by usePinchZoom, read by useSwipeCarousel
  // to suppress swipe when zoomed in. Created here to break the circular
  // dependency (swipe needs scaleRef, zoom needs lastSwipeTimeRef from swipe).
  const scaleRef = useRef(1);

  // Swipe carousel: horizontal swipe with visual slide-in animation.
  // Listens on the image container so swipe works in both normal and fullscreen.
  // `enabled` toggles when the image loads — forces the effect to re-run after
  // the container DOM element exists (on reload, the loading spinner renders first).
  const { swipedRef, lastSwipeTimeRef } = useSwipeCarousel({
    containerRef,
    stripRef,
    onSwipeLeft: nextImage ? goToNext : undefined,
    onSwipeRight: prevImage ? goToPrev : undefined,
    enabled: !!image,
    scaleRef,
  });

  // Pinch-to-zoom: two-finger pinch on the image. Fullscreen-only.
  // Exposes scaleRef so carousel and dismiss can skip when zoomed.
  // lastSwipeTimeRef: suppress zoom during post-swipe cooldown.
  usePinchZoom({
    containerRef,
    imageRef,
    enabled: !!image && isFullscreen,
    lastSwipeTimeRef,
    scaleRef,
  });

  // Swipe-to-dismiss: pull down on the image to close detail view.
  // Only on mobile, only outside fullscreen (tap exits fullscreen instead).
  const _pointerCoarse = useUiPrefsStore((s) => s._pointerCoarse);
  useSwipeDismiss({
    containerRef,
    wrapperRef: detailWrapperRef,
    backdropRef: gridContainerRef,
    onDismiss: closeDetail,
    onDragStart: () => {
      // Pre-scroll the hidden grid to the current image so it's in the
      // right place as it fades in during the dismiss gesture.
      // BUT: only if the user traversed to a different image. If they're
      // still on the entry image, the grid's scroll position is already
      // perfect (preserved via opacity:0). Scrolling would re-center the
      // image when it was originally at a viewport edge.
      if (imageId !== entryImageIdRef.current) {
        useSearchStore.getState().setFocusedImageId(imageId);
        scrollFocusedIntoView();
      }
    },
    enabled: !!image && _pointerCoarse && !isFullscreen,
    scaleRef,
    imageId,
  });

  // Swipe-to-dismiss in fullscreen: pull down to exit fullscreen.
  // Same gesture, different target: animates the fullscreen container itself
  // (the wrapper is outside the fullscreen viewport). No hero animation,
  // no backdrop — just slide-down + exit. Disabled when zoomed (scaleRef > 1).
  // dragTargetRef = imageRef: the image moves visually while the container bg
  // goes transparent (without this, movement is invisible — black on black).
  useSwipeDismiss({
    containerRef,
    wrapperRef: containerRef, // fullscreen container IS the animated element
    onDismiss: toggleFullscreen,
    enabled: !!image && _pointerCoarse && isFullscreen,
    scaleRef,
    dragTargetRef: imageRef,
  });

  // Tap-to-fullscreen handler for touch devices.
  // On desktop: double-click toggles fullscreen (or closes detail).
  // On mobile (non-fullscreen): single tap enters fullscreen instantly.
  // In fullscreen: single tap exits after 300ms delay (to distinguish from
  // double-tap-to-zoom). The delay on EXIT is acceptable — retreating feels
  // natural with a slight pause. ENTERING fullscreen stays instant.
  const fullscreenTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleImageClick = useCallback(() => {
    if (swipedRef.current) return; // was a swipe, not a tap
    // Post-swipe cooldown — suppress accidental taps shortly after swiping (250ms)
    if (lastSwipeTimeRef.current && Date.now() - lastSwipeTimeRef.current < 250) return;
    if (!useUiPrefsStore.getState()._pointerCoarse) return; // desktop: ignore click, use dblclick
    if (isFullscreen) {
      // In fullscreen: delay exit to allow double-tap-to-zoom.
      // If double-tap fires (zooms in), scaleRef.current > 1 when the
      // timer executes, so the exit is suppressed — no coupling needed.
      if (fullscreenTapTimer.current) {
        // Second tap arrived while waiting — cancel the exit timer.
        // Double-tap-to-zoom is handled by usePinchZoom via touch events.
        clearTimeout(fullscreenTapTimer.current);
        fullscreenTapTimer.current = null;
        return;
      }
      fullscreenTapTimer.current = setTimeout(() => {
        fullscreenTapTimer.current = null;
        // Guard: if a double-tap zoom happened between scheduling and firing,
        // don't exit fullscreen — the user zoomed in, not tapped to exit.
        if (scaleRef.current > 1) return;
        toggleFullscreen();
      }, DOUBLE_TAP_MS);
    } else {
      toggleFullscreen(); // enter fullscreen instantly
    }
  }, [swipedRef, lastSwipeTimeRef, toggleFullscreen, isFullscreen, scaleRef]);

  // Reset carousel strip and zoom when imageId changes. The carousel's
  // commitStripReset handles the visual transition imperatively (no flash),
  // but React re-renders with new panel content — this ensures the strip is
  // cleanly at translateX(0) for the new image. Also cancels any pending
  // fullscreen-exit tap timer from the previous image.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (strip) {
      strip.style.transition = "none";
      strip.style.transform = "";
    }
    // Cancel pending fullscreen tap timer from previous image
    if (fullscreenTapTimer.current) {
      clearTimeout(fullscreenTapTimer.current);
      fullscreenTapTimer.current = null;
    }
    // Reset pinch-zoom state — new image starts at 1x
    scaleRef.current = 1;
    const img = imageRef.current;
    if (img) {
      img.style.transform = "";
      img.style.willChange = "";
      img.style.transition = "";
    }
  }, [imageId, scaleRef]);

  // Navigation keyboard shortcuts (arrows, backspace) — these are NOT
  // single-character shortcuts, so they don't go through the shortcut
  // registry. They only work when not typing in an input.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;

      switch (e.key) {
        case "Backspace":
          e.preventDefault();
          closeDetail();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goToPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goToNext();
          break;
        // Escape exits fullscreen — handled natively by the browser.
        // When not in fullscreen, Escape does nothing. Close image detail
        // via Backspace, the back button, or browser back.
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeDetail, goToPrev, goToNext]);

  // Image URL — prefer full-size via imgproxy, fall back to thumbnail.
  // Request screen-sized image (not window-sized) so a single request covers
  // both windowed and fullscreen display. Uses detectDpr() — 1× on standard
  // displays, 1.5× on HiDPI (DPR > 1.3). See image-urls.ts for rationale.
  // Capped at native resolution to avoid upscaling.
  // screen.width/height are CSS pixels of the monitor — stable regardless of
  // window size or fullscreen state. No re-request on resize/fullscreen toggle.
  const imgproxyOpts = useMemo(
    () => ({
      width: window.screen.width,
      height: window.screen.height,
      // Native dimensions cap — prevents requesting larger than the original
      nativeWidth: image?.source?.dimensions?.width,
      nativeHeight: image?.source?.dimensions?.height,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable per image
    [image?.id],
  );
  const fullUrl = image ? getFullImageUrl(image, imgproxyOpts) : undefined;
  const thumbUrl = image ? getThumbnailUrl(image) : undefined;

  // Prev/next image URLs for the swipe carousel.
  // Use full-res AVIF when the prefetch pipeline has fully decoded it
  // (img.decode() resolved → bitmap in Chrome's decoded-image cache).
  // A new DOM <img> with the same URL finds the cached bitmap and
  // paints immediately — no ⏳ window, no stale-compositor-texture
  // duplication. When NOT decoded yet (rapid swipes outpace prefetch),
  // fall back to thumbnail (~5KB JPEG, decodes in <10ms).
  //
  // prefetchGen triggers re-computation when a decode completes for one
  // of the current side-panel images (upgrades THUMB → FULL-RES without
  // waiting for a navigation-driven re-render).
  const [prefetchGen, setPrefetchGen] = useState(0);
  useEffect(() => {
    return onFullResDecoded((id) => {
      if (id === prevImage?.id || id === nextImage?.id) {
        setPrefetchGen((g) => g + 1);
      }
    });
  }, [prevImage?.id, nextImage?.id]);

  const prevImageUrl = useMemo(() => {
    if (!prevImage) return undefined;
    if (isFullResLoaded(prevImage.id)) {
      const fullRes = getCarouselImageUrl(prevImage);
      if (fullRes) return fullRes;
    }
    return getThumbnailUrl(prevImage);
  }, [prevImage?.id, prefetchGen]);

  const nextImageUrl = useMemo(() => {
    if (!nextImage) return undefined;
    if (isFullResLoaded(nextImage.id)) {
      const fullRes = getCarouselImageUrl(nextImage);
      if (fullRes) return fullRes;
    }
    return getThumbnailUrl(nextImage);
  }, [nextImage?.id, prefetchGen]);

  // Track whether the image failed to load (imgproxy down, S3 404, etc.)
  // so we can show a graceful fallback instead of browser's broken-image
  // alt text. Reset when imageId changes.
  const [imgLoadFailed, setImgLoadFailed] = useState(false);
  useEffect(() => setImgLoadFailed(false), [imageId]);

  const imageUrl = imgLoadFailed ? undefined : (fullUrl ?? thumbUrl);


  // Delay showing the loading indicator so it doesn't flash on fast loads
  // (tab reload, cached ES responses).  Only appears after 500ms of waiting.
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    if (image) { setShowLoading(false); return; }
    const timer = setTimeout(() => setShowLoading(true), 500);
    return () => clearTimeout(timer);
  }, [image]);

  // Loading / not-found states.
  // When image is null: either still fetching (standalone) or truly absent.
  if (!image) {
    // Standalone fetch in progress — show loading after a delay, or
    // nothing at all if ES responds quickly (avoids flash).
    if (!imageFromResults && !standaloneFetchFailed) {
      if (!showLoading) return <div className="flex-1" />;
      return (
        <div className="flex-1 flex items-center justify-center text-grid-text-muted">
          <p className="text-sm animate-pulse">Loading image…</p>
        </div>
      );
    }
    // Standalone fetch failed — image doesn't exist in the index
    if (standaloneFetchFailed) {
      return (
        <div className="flex-1 flex items-center justify-center text-grid-text-muted">
          <div className="text-center">
            <p className="text-lg mb-2">Image not found</p>
            <p className="text-sm mb-4">
              This image does not exist in the index.
            </p>
            <button
              onClick={closeDetail}
              className="text-grid-accent hover:underline text-sm cursor-pointer"
            >
              ← Back to search
            </button>
          </div>
        </div>
      );
    }
  }

  // At this point `image` is guaranteed non-null (either from results
  // or standalone fetch).  The `!` assertions below are safe.
  const displayImage = image!;

  return (
    <div ref={detailWrapperRef} className="flex flex-col flex-1 min-h-0 bg-grid-bg">
      {/* Top bar — hidden in fullscreen */}
      {!isFullscreen && (
        <header className="flex items-center px-3 py-1.5 bg-grid-bg border-b border-grid-separator h-11 shrink-0">
          {/* Logo + separator + back button — flush together, no gaps */}
          <div className="flex items-center shrink-0 -ml-3">
            {/* Logo — resets everything (query, filters, sort, scroll), same as SearchBar.
                 Hit area is a square matching the full bar height (h-11 = 44px).
                 Uses <a> (not <Link>) with e.preventDefault() so we can await
                 search() before navigating — prevents table→grid flash. */}
            {/* href must match DEFAULT_SEARCH in src/lib/home-defaults.ts
                 (static string for right-click "open in new tab") */}
            <a
              href="/search?nonFree=true"
              title="Grid — clear all filters"
              className="shrink-0 w-11 h-11 flex items-center justify-center hover:bg-grid-hover transition-colors"
              onClick={(e) => {
                e.preventDefault();
                resetToHome(() =>
                  navigate({ to: "/search", search: DEFAULT_SEARCH }),
                );
              }}
            >
              <img
                src="/images/grid-logo.svg"
                alt="Grid"
                className="w-8 h-8"
              />
            </a>

            <div className="w-px h-5 bg-grid-separator shrink-0" />

            <button
              onClick={closeDetail}
              className="shrink-0 h-11 flex items-center gap-1.5 px-3 text-sm text-grid-text-muted hover:bg-grid-hover hover:text-grid-text transition-colors cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Back to search
            </button>
          </div>

          <span className="flex-1" />

          {/* Image position in results */}
          {currentGlobalIndex >= 0 && (
            <span className="text-sm text-grid-text-muted">
              {currentGlobalIndex + 1} of {total.toLocaleString()}
            </span>
          )}
        </header>
      )}

      {/* Main content area.
          Desktop: flex-row (image fills left, metadata sidebar right). No scroll on outer.
          Mobile: single scrollable column (image top, metadata below).
          Fullscreen: image fills viewport, no sidebar. */}
      <div
        ref={mobileScrollRef}
        className={
          isFullscreen
            ? "flex-1 flex min-h-0"
            : "flex-1 flex min-h-0 overflow-y-auto sm:overflow-hidden overscroll-y-contain overscroll-x-none flex-col sm:flex-row touch-pan-y sm:touch-auto"
        }
      >
        {/* Image container — this div is fullscreened. overflow-hidden clips
            the carousel's off-screen prev/next panels.
            touch-action: none — we handle all gestures ourselves (swipe carousel).
            h-[55svh] — svh (small viewport height) is stable when address bar
            shows/hides, avoiding the twitch on fullscreen exit. */}
        <div
          ref={containerRef}
          className={`relative overflow-hidden ${
            isFullscreen
              ? `w-full h-full touch-none${cursorHidden ? " cursor-none" : ""}`
              : "bg-grid-bg shrink-0 sm:flex-1 min-w-0 h-[55svh] sm:h-full touch-none sm:touch-auto"
          }`}
        >
          {/* Carousel strip — three panels (prev | current | next).
              Translated by useSwipeCarousel during horizontal swipe.
              Prev/next are offset ±100% so only the current panel is visible at rest. */}
          <div ref={stripRef} className={`absolute inset-0${_pointerCoarse ? " will-change-transform" : ""}`}>
            {/* Previous image (off-screen left) — used by swipe animation on mobile.
                Gated on _pointerCoarse: desktop never swipes, so rendering off-screen
                panels wastes 2 AVIF fetches + decodes per navigation. */}
            {_pointerCoarse && prevImageUrl && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ transform: "translateX(-100%)" }}>
                <StableImg
                  src={prevImageUrl}
                  data-thumb={prevImage ? getThumbnailUrl(prevImage) : undefined}
                  alt=""
                  className={
                    isFullscreen
                      ? "w-full h-full object-contain select-none"
                      : "max-w-full max-h-full object-contain select-none"
                  }
                  draggable={false}
                />
              </div>
            )}

            {/* Current image — full-res via imageUrl */}
            <div className="absolute inset-0 flex items-center justify-center">
              {imageUrl ? (
                <StableImg
                  imgRef={imageRef}
                  src={imageUrl}
                  fetchPriority="high"
                  alt={displayImage.metadata?.title ?? displayImage.metadata?.description ?? ""}
                  className={
                    isFullscreen
                      ? "w-full h-full object-contain select-none"
                      : "max-w-full max-h-full object-contain select-none"
                  }
                  draggable={false}
                  onClick={handleImageClick}
                  onLoad={() => {
                    // Mark this image as loaded so side-panel probes can use
                    // full-res instead of thumbnail on future swipes.
                    if (imageId) markFullResLoaded(imageId);
                  }}
                  onDoubleClick={
                    // Desktop: double-click toggles fullscreen / closes detail.
                    // Mobile (coarse pointer): suppressed in fullscreen — double-tap
                    // is handled by usePinchZoom for zoom, not fullscreen toggle.
                    // Mount guard: suppress stray dblclick from phantom-mode grid/table
                    // click leaking through (see mountTimeRef).
                    _pointerCoarse && isFullscreen ? undefined
                      : () => {
                          if (Date.now() - mountTimeRef.current < 500) return;
                          if (isFullscreen) toggleFullscreen();
                          else closeDetail();
                        }
                  }
                  onError={(e) => {
                    // imgproxy failed — try thumbnail as fallback
                    const target = e.target as HTMLImageElement;
                    if (thumbUrl && target.src !== thumbUrl) {
                      target.src = thumbUrl;
                    } else {
                      // Both imgproxy and thumbnail failed — show text fallback
                      setImgLoadFailed(true);
                    }
                  }}
                />
              ) : (
                <div className="text-grid-text-muted text-sm text-center p-4">
                  <p>Image preview not available</p>
                  <p className="mt-1 text-grid-text-dim">
                    Run with <code>--use-TEST</code> to enable image viewing
                  </p>
                </div>
              )}
            </div>

            {/* Next image (off-screen right) — used by swipe animation on mobile. */}
            {_pointerCoarse && nextImageUrl && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ transform: "translateX(100%)" }}>
                <StableImg
                  src={nextImageUrl}
                  data-thumb={nextImage ? getThumbnailUrl(nextImage) : undefined}
                  alt=""
                  className={
                    isFullscreen
                      ? "w-full h-full object-contain select-none"
                      : "max-w-full max-h-full object-contain select-none"
                  }
                  draggable={false}
                />
              </div>
            )}
          </div>

          {/* Prev/next navigation strips — desktop only (mobile uses swipe).
              Positioned on top of the carousel strip. */}
          {!(isFullscreen && cursorHidden) && prevImage && (
            <NavStrip direction="prev" onClick={goToPrev} onMouseEnter={navMouseEnter} onMouseLeave={navMouseLeave} className="hidden sm:flex" />
          )}
          {!(isFullscreen && cursorHidden) && nextImage && (
            <NavStrip direction="next" onClick={goToNext} onMouseEnter={navMouseEnter} onMouseLeave={navMouseLeave} className="hidden sm:flex" />
          )}
        </div>

        {/* Metadata — hidden in fullscreen.
            Desktop: fixed-width right column, scrolls independently.
            Mobile: flows below the image in the single scroll container. */}
        {!isFullscreen && (
          <aside className="w-full sm:w-72 shrink-0 sm:border-l border-t sm:border-t-0 border-grid-separator bg-grid-bg sm:overflow-y-auto p-3">
            <ImageMetadata image={displayImage} />
          </aside>
        )}
      </div>
    </div>
  );
}

