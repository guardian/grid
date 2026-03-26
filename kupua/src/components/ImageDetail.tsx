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
import { Link, useNavigate } from "@tanstack/react-router";
import { useSearchStore } from "@/stores/search-store";
import { useDataWindow } from "@/hooks/useDataWindow";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { getFullImageUrl, getThumbnailUrl } from "@/lib/image-urls";
import { resetSearchSync } from "@/hooks/useUrlSearchSync";
import { format } from "date-fns";
import type { Image } from "@/types/image";

interface ImageDetailProps {
  imageId: string;
}

export function ImageDetail({ imageId }: ImageDetailProps) {
  const { results, total, loadMore, findImageIndex } = useDataWindow();
  const dataSource = useSearchStore((s) => s.dataSource);
  const navigate = useNavigate();

  // The fullscreen container ref — must be stable across imageId changes
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);

  // Find the current image in search results (handles sparse array)
  const currentIndex = useMemo(
    () => findImageIndex(imageId),
    [findImageIndex, imageId],
  );
  const imageFromResults = currentIndex >= 0 ? results[currentIndex] : undefined;

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

  const prevImage = currentIndex > 0 ? results[currentIndex - 1] ?? undefined : undefined;
  const nextImage =
    currentIndex >= 0 && currentIndex < results.length - 1
      ? results[currentIndex + 1] ?? undefined
      : undefined;

  // Load more results when approaching the end of loaded data.
  // Triggers when within 5 images of the edge.
  useEffect(() => {
    if (currentIndex >= 0 && results.length - currentIndex <= 5 && results.length < total) {
      loadMore();
    }
  }, [currentIndex, results.length, total, loadMore]);

  // Navigate to prev/next image — replaces current history entry so browser
  // back always returns to the table, not through every viewed image.
  const goToImage = useCallback(
    (id: string) => {
      navigate({
        to: "/search",
        search: (prev: Record<string, unknown>) => ({ ...prev, image: id }),
        replace: true,
      });
    },
    [navigate],
  );

  // Ref-stabilise prevImage/nextImage so goToPrev/goToNext don't churn on
  // every off-screen loadRange (which changes results reference → prevImage/
  // nextImage identity → callback → keyboard listener teardown/re-register).
  const prevImageRef = useRef(prevImage);
  prevImageRef.current = prevImage;
  const nextImageRef = useRef(nextImage);
  nextImageRef.current = nextImage;

  const goToPrev = useCallback(() => {
    if (prevImageRef.current) goToImage(prevImageRef.current.id);
  }, [goToImage]);

  const goToNext = useCallback(() => {
    if (nextImageRef.current) goToImage(nextImageRef.current.id);
  }, [goToImage]);

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
  // Request viewport-sized image so it looks sharp at the current screen
  // resolution (CSS pixels — DPR scaling deferred to later).
  const imgproxyOpts = useMemo(
    () => ({ width: window.innerWidth, height: window.innerHeight }),
    [],
  );
  const fullUrl = image ? getFullImageUrl(image, imgproxyOpts) : undefined;
  const thumbUrl = image ? getThumbnailUrl(image) : undefined;

  // Track whether the image failed to load (imgproxy down, S3 404, etc.)
  // so we can show a graceful fallback instead of browser's broken-image
  // alt text. Reset when imageId changes.
  const [imgLoadFailed, setImgLoadFailed] = useState(false);
  useEffect(() => setImgLoadFailed(false), [imageId]);

  const imageUrl = imgLoadFailed ? undefined : (fullUrl ?? thumbUrl);

  // Prefetch nearby images — 2 prev, 3 next (asymmetric: users flick
  // forward more than backward). Uses `new Image().src` which triggers
  // a browser fetch + cache. When the user flicks, the next image loads
  // instantly from the browser's memory/disk cache.
  //
  // These are fire-and-forget: orphaned prefetch Image objects for images
  // the user has already flicked past complete harmlessly in the background
  // and warm the browser cache (useful if the user flicks back). We
  // intentionally do NOT cancel them on cleanup — aborting a partially
  // downloaded image can leave the cache entry incomplete, causing the
  // main <img> to re-fetch from scratch when it arrives at that image.
  useEffect(() => {
    if (currentIndex < 0) return;
    const prefetchIndices: number[] = [];
    // 2 backward
    for (let i = 1; i <= 2; i++) {
      if (currentIndex - i >= 0) prefetchIndices.push(currentIndex - i);
    }
    // 3 forward
    for (let i = 1; i <= 3; i++) {
      if (currentIndex + i < results.length) prefetchIndices.push(currentIndex + i);
    }
    for (const idx of prefetchIndices) {
      const prefetchImage = results[idx];
      if (!prefetchImage) continue; // skip placeholder slots
      const url =
        getFullImageUrl(prefetchImage, imgproxyOpts) ??
        getThumbnailUrl(prefetchImage);
      if (url) {
        const img = new Image();
        img.src = url;
      }
    }
  }, [currentIndex, results, imgproxyOpts]);

  // Loading / not-found states.
  // When image is null: either still fetching (standalone) or truly absent.
  if (!image) {
    // Standalone fetch in progress — show loading, not an error
    if (!imageFromResults && !standaloneFetchFailed) {
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
        <header className="flex items-center px-3 py-1.5 bg-grid-panel border-b border-grid-separator h-11 shrink-0">
          {/* Logo + separator + back button — flush together, no gaps */}
          <div className="flex items-center shrink-0 -ml-3">
            {/* Logo — resets everything (query, filters, sort, scroll), same as SearchBar.
                 Hit area is a square matching the full bar height (h-11 = 44px). */}
            <Link
              to="/search"
              search={{ nonFree: "true" }}
              title="Grid — clear all filters"
              className="shrink-0 w-11 h-11 flex items-center justify-center hover:bg-grid-hover transition-colors"
              onClick={() => {
                // Force useUrlSearchSync to re-search even if params haven't
                // changed (e.g. was already at ?nonFree=true before opening image).
                resetSearchSync();

                // Reset scroll position on the table underneath and notify
                // the virtualizer. Programmatic scrollTop changes on hidden
                // (opacity-0) containers may not fire a scroll event in all
                // browsers, so we dispatch one explicitly.
                const scrollContainer = document.querySelector<HTMLElement>(
                  '[role="region"][aria-label="Image results table"]',
                );
                if (scrollContainer) {
                  scrollContainer.scrollTop = 0;
                  scrollContainer.scrollLeft = 0;
                  scrollContainer.dispatchEvent(new Event("scroll"));
                }

                // Focus the CQL search input after the navigation completes
                requestAnimationFrame(() => {
                  const cqlInput = document.querySelector("cql-input");
                  if (cqlInput instanceof HTMLElement) cqlInput.focus();
                });
              }}
            >
              <img
                src="/images/grid-logo.svg"
                alt="Grid"
                className="w-8 h-8"
              />
            </Link>

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
          {currentIndex >= 0 && (
            <span className="text-sm text-grid-text-muted">
              {currentIndex + 1} of {total.toLocaleString()}
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
              ? "w-full h-full"
              : "bg-grid-bg flex-1 min-w-0"
          }`}
        >
          {/* The image — object-contain preserves aspect ratio.
              Normal: constrained to container.
              Fullscreen: fills the entire viewport. */}
          {imageUrl ? (
            <img
              src={imageUrl}
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

          {/* Prev button — semi-transparent, appears on hover */}
          {prevImage && (
            <button
              onClick={goToPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-colors opacity-0 hover:opacity-100 focus:opacity-100 cursor-pointer"
              style={{ transition: "opacity 150ms, background-color 150ms, color 150ms" }}
              title="Previous image (←)"
              aria-label="Previous image"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          {/* Next button — semi-transparent, appears on hover */}
          {nextImage && (
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-colors opacity-0 hover:opacity-100 focus:opacity-100 cursor-pointer"
              style={{ transition: "opacity 150ms, background-color 150ms, color 150ms" }}
              title="Next image (→)"
              aria-label="Next image"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
          )}
        </div>

        {/* Metadata sidebar — hidden in fullscreen */}
        {!isFullscreen && <MetadataPanel image={displayImage} />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Metadata sidebar
// ---------------------------------------------------------------------------

function formatDetailDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    return format(new Date(dateStr), "dd MMM yyyy HH:mm");
  } catch {
    return dateStr;
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDimensions(image: import("@/types/image").Image): string {
  const dims = image.source.orientedDimensions ?? image.source.dimensions;
  if (!dims) return "";
  return `${dims.width} × ${dims.height}`;
}

function formatLocation(m: import("@/types/image").ImageMetadata): string {
  const parts = [m.subLocation, m.city, m.state, m.country].filter(Boolean);
  return parts.join(", ");
}

interface MetadataFieldProps {
  label: string;
  value?: string | null;
}

function MetadataField({ label, value }: MetadataFieldProps) {
  if (!value) return null;
  return (
    <div className="mb-2.5">
      <dt className="text-xs text-grid-text-dim mb-0.5">
        {label}
      </dt>
      <dd className="text-xs text-grid-text break-words">{value}</dd>
    </div>
  );
}

function MetadataPanel({ image }: { image: import("@/types/image").Image }) {
  const m = image.metadata;
  const dims = formatDimensions(image);
  const location = formatLocation(m);
  const fileSize = formatFileSize(image.source.size);

  return (
    <aside className="w-72 shrink-0 border-l border-grid-separator bg-grid-bg overflow-y-auto p-3">
      <dl>
        <MetadataField label="Title" value={m.title} />
        <MetadataField label="Description" value={m.description} />
        <MetadataField label="By" value={m.byline} />
        <MetadataField label="Credit" value={m.credit} />
        <MetadataField label="Source" value={m.source} />
        <MetadataField label="Copyright" value={m.copyright} />
        <MetadataField label="Category" value={image.usageRights?.category} />
        <MetadataField label="Special instructions" value={m.specialInstructions} />
        <MetadataField label="Suppliers reference" value={m.suppliersReference} />
        <MetadataField label="Location" value={location || undefined} />
        <MetadataField label="Taken on" value={formatDetailDate(m.dateTaken)} />
        <MetadataField label="Uploaded" value={formatDetailDate(image.uploadTime)} />
        <MetadataField label="Uploader" value={image.uploadedBy} />
        <MetadataField label="Dimensions" value={dims || undefined} />
        <MetadataField label="File size" value={fileSize || undefined} />
        <MetadataField
          label="File type"
          value={image.source.mimeType?.replace("image/", "") || undefined}
        />
        <MetadataField label="Image type" value={m.imageType} />
        {m.subjects && m.subjects.length > 0 && (
          <MetadataField label="Subjects" value={m.subjects.join(", ")} />
        )}
        {m.peopleInImage && m.peopleInImage.length > 0 && (
          <MetadataField label="People" value={m.peopleInImage.join(", ")} />
        )}
        {m.keywords && m.keywords.length > 0 && (
          <MetadataField label="Keywords" value={m.keywords.join(", ")} />
        )}
        <MetadataField label="Image ID" value={image.id} />
      </dl>
    </aside>
  );
}

