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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useSearchStore } from "@/stores/search-store";
import { useDataWindow } from "@/hooks/useDataWindow";
import { useImageTraversal } from "@/hooks/useImageTraversal";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useCursorAutoHide } from "@/hooks/useCursorAutoHide";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { getFullImageUrl, getThumbnailUrl } from "@/lib/image-urls";
import { NavStrip } from "@/components/NavStrip";
import { resetToHome } from "@/lib/reset-to-home";
import { DEFAULT_SEARCH } from "@/lib/home-defaults";
import { storeImageOffset, getImageOffset, buildSearchKey, extractSortValues } from "@/lib/image-offset-cache";
import { ImageMetadata } from "@/components/ImageMetadata";
import type { Image } from "@/types/image";

interface ImageDetailProps {
  imageId: string;
}

export function ImageDetail({ imageId }: ImageDetailProps) {
  const { total, findImageIndex, getImage } = useDataWindow();
  const dataSource = useSearchStore((s) => s.dataSource);
  const restoreAroundCursor = useSearchStore((s) => s.restoreAroundCursor);
  const navigate = useNavigate();
  const searchParams = useSearch({ from: "/search" });
  const searchKey = useMemo(() => buildSearchKey(searchParams), [searchParams]);

  // The fullscreen container ref — must be stable across imageId changes
  const containerRef = useRef<HTMLDivElement>(null);
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
    <>
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

      {/* Main content area — flex row in normal mode (image + sidebar),
          single fullscreen container when fullscreened. */}
      <div className={`flex-1 flex min-h-0 ${isFullscreen ? "" : "flex-row"}`}>
        {/* Image container — this div is fullscreened */}
        <div
          ref={containerRef}
          className={`flex items-center justify-center relative ${
            isFullscreen
              ? `w-full h-full${cursorHidden ? " cursor-none" : ""}`
              : "bg-grid-bg flex-1 min-w-0"
          }`}
        >
          {/* The image — object-contain preserves aspect ratio.
              Normal: constrained to container.
              Fullscreen: fills the entire viewport. */}
          {imageUrl ? (
            <img
              src={imageUrl}
              fetchPriority="high"
              alt={displayImage.metadata?.title ?? displayImage.metadata?.description ?? ""}
              className={
                isFullscreen
                  ? "w-full h-full object-contain select-none"
                  : "max-w-full max-h-full object-contain select-none"
              }
              draggable={false}
              onDoubleClick={isFullscreen ? toggleFullscreen : closeDetail}
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

          {/* Prev/next navigation strips — hidden when cursor auto-hides in fullscreen */}
          {!(isFullscreen && cursorHidden) && prevImage && (
            <NavStrip direction="prev" onClick={goToPrev} onMouseEnter={navMouseEnter} onMouseLeave={navMouseLeave} />
          )}
          {!(isFullscreen && cursorHidden) && nextImage && (
            <NavStrip direction="next" onClick={goToNext} onMouseEnter={navMouseEnter} onMouseLeave={navMouseLeave} />
          )}
        </div>

        {/* Metadata sidebar — hidden in fullscreen */}
        {!isFullscreen && (
          <aside className="w-72 shrink-0 border-l border-grid-separator bg-grid-bg overflow-y-auto p-3">
            <ImageMetadata image={displayImage} />
          </aside>
        )}
      </div>
    </>
  );
}

