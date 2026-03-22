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
 * - Keyboard shortcuts: `f` toggle fullscreen, `←/→` prev/next image,
 *   `Escape` exit fullscreen only (never navigates — close via back
 *   button or browser back).
 * - Prev/next navigates through the search results stored in the Zustand
 *   search store, replacing `imageId` in the URL with `replace: true`
 *   (so back always returns to the table, not through every viewed image).
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSearchStore } from "@/stores/search-store";
import { useFullscreen } from "@/hooks/useFullscreen";
import { getFullImageUrl, getThumbnailUrl } from "@/lib/image-urls";
import { format } from "date-fns";

interface ImageDetailProps {
  imageId: string;
}

export function ImageDetail({ imageId }: ImageDetailProps) {
  const { results, total, loading, loadMore } = useSearchStore();
  const navigate = useNavigate();

  // The fullscreen container ref — must be stable across imageId changes
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);

  // Find the current image in search results
  const currentIndex = useMemo(
    () => results.findIndex((img) => img.id === imageId),
    [results, imageId],
  );
  const image = currentIndex >= 0 ? results[currentIndex] : undefined;

  const prevImage = currentIndex > 0 ? results[currentIndex - 1] : undefined;
  const nextImage =
    currentIndex >= 0 && currentIndex < results.length - 1
      ? results[currentIndex + 1]
      : undefined;

  // Load more results when approaching the end of loaded data.
  // Triggers when within 5 images of the edge — same principle as the
  // table's infinite scroll (500px threshold ≈ ~15 rows), but adapted
  // for single-image flicking.
  useEffect(() => {
    if (currentIndex >= 0 && results.length - currentIndex <= 5 && results.length < total && !loading) {
      loadMore();
    }
  }, [currentIndex, results.length, total, loading, loadMore]);

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

  const goToPrev = useCallback(() => {
    if (prevImage) goToImage(prevImage.id);
  }, [prevImage, goToImage]);

  const goToNext = useCallback(() => {
    if (nextImage) goToImage(nextImage.id);
  }, [nextImage, goToImage]);

  // Close image detail — go back in history (removes imageId from URL,
  // restoring the exact search page state including scroll position).
  const closeDetail = useCallback(() => {
    window.history.back();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;

      switch (e.key) {
        case "f":
          e.preventDefault();
          toggleFullscreen();
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
        // via the back button or browser back.
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleFullscreen, goToPrev, goToNext]);

  // Image URL — prefer full-size via imgproxy, fall back to thumbnail.
  // Request viewport-sized image so it looks sharp at the current screen
  // resolution (CSS pixels — DPR scaling deferred to later).
  const imgproxyOpts = useMemo(
    () => ({ width: window.innerWidth, height: window.innerHeight }),
    [],
  );
  const imageUrl = image
    ? getFullImageUrl(image, imgproxyOpts) ?? getThumbnailUrl(image)
    : undefined;

  // Prefetch nearby images — 2 prev, 3 next (asymmetric: users flick
  // forward more than backward). Uses `new Image().src` which triggers
  // a browser fetch + cache. When the user flicks, the next image loads
  // instantly from the browser's memory/disk cache.
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
      const url =
        getFullImageUrl(results[idx], imgproxyOpts) ??
        getThumbnailUrl(results[idx]);
      if (url) {
        const img = new Image();
        img.src = url;
      }
    }
  }, [currentIndex, results, imgproxyOpts]);

  // Not found state
  if (!image) {
    return (
      <div className="flex-1 flex items-center justify-center text-grid-text-muted">
        <div className="text-center">
          <p className="text-lg mb-2">Image not found</p>
          <p className="text-xs mb-4">
            {currentIndex < 0 && results.length > 0
              ? "This image is not in the current search results."
              : "No search results loaded."}
          </p>
          <button
            onClick={closeDetail}
            className="text-grid-accent hover:underline text-xs cursor-pointer"
          >
            ← Back to search
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Top bar — hidden in fullscreen */}
      {!isFullscreen && (
        <header className="flex items-center gap-3 px-3 py-1.5 bg-grid-panel border-b border-grid-separator h-11 shrink-0">
          {/* Logo / Back to search */}
          <button
            onClick={closeDetail}
            className="shrink-0 w-7 h-7 hover:bg-grid-hover rounded transition-colors flex items-center justify-center cursor-pointer"
            title="Back to search"
          >
            <img
              src="/images/grid-logo.svg"
              alt="Grid"
              className="w-7 h-7"
            />
          </button>

          <button
            onClick={closeDetail}
            className="text-xs text-grid-text-muted hover:text-grid-text transition-colors cursor-pointer"
          >
            ← Back
          </button>

          <span className="flex-1" />

          {/* Image position in results */}
          {currentIndex >= 0 && (
            <span className="text-xs text-grid-text-muted">
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
              alt={image.metadata?.title ?? image.metadata?.description ?? ""}
              className={
                isFullscreen
                  ? "w-full h-full object-contain"
                  : "max-w-full max-h-full object-contain"
              }
              draggable={false}
            />
          ) : (
            <div className="text-grid-text-muted text-xs text-center p-4">
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
        {!isFullscreen && <MetadataPanel image={image} />}
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
      <dt className="text-[11px] text-grid-text-dim mb-0.5">
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

