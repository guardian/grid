/**
 * Image detail view — single-image page at `/images/:imageId`.
 *
 * Design:
 * - **Normal view:** Full image centred on empty page with `bg-grid-bg`
 *   background. Minimal header (logo/back + position counter + fullscreen
 *   button). No metadata sidebar — just the image, big.
 * - **Fullscreen:** Black background, NO UI at all. The image fills the
 *   screen. Navigation via keyboard (←/→) and hover-revealed nav buttons.
 *
 * Key architectural property:
 * - **Fullscreen survives between images.** The fullscreened container is a
 *   stable DOM element. When the imageId param changes (prev/next), TanStack
 *   Router reconciles the same component — the DOM node persists, so the
 *   Fullscreen API does not exit.
 * - Keyboard shortcuts: `f` toggle fullscreen, `←/→` prev/next image,
 *   `Escape` exit fullscreen or go back to search.
 * - Prev/next navigates through the search results stored in the Zustand
 *   search store. The search results persist because the store is global —
 *   navigating to an image detail page doesn't clear them.
 *   Navigation always happens within the current search context and in its
 *   order — this is a line-in-the-sand architectural principle.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useSearchStore } from "@/stores/search-store";
import { useFullscreen } from "@/hooks/useFullscreen";
import { getFullImageUrl, getThumbnailUrl } from "@/lib/image-urls";

export function ImageDetail() {
  const { imageId } = useParams({ strict: false }) as { imageId: string };
  const { results } = useSearchStore();
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

  // Navigate to prev/next image
  const goToPrev = useCallback(() => {
    if (prevImage) {
      navigate({
        to: "/images/$imageId",
        params: { imageId: prevImage.id },
      });
    }
  }, [prevImage, navigate]);

  const goToNext = useCallback(() => {
    if (nextImage) {
      navigate({
        to: "/images/$imageId",
        params: { imageId: nextImage.id },
      });
    }
  }, [nextImage, navigate]);

  const goToSearch = useCallback(() => {
    navigate({ to: "/search" });
  }, [navigate]);

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
        case "Escape":
          e.preventDefault();
          if (!isFullscreen) {
            goToSearch();
          }
          // Fullscreen exit is handled natively by the browser on Escape
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleFullscreen, goToPrev, goToNext, goToSearch, isFullscreen]);

  // Image URL — prefer full-size via imgproxy, fall back to thumbnail
  const imageUrl = image
    ? getFullImageUrl(image) ?? getThumbnailUrl(image)
    : undefined;

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
          <Link
            to="/search"
            className="text-grid-accent hover:underline text-xs"
          >
            ← Back to search
          </Link>
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
          <Link
            to="/search"
            className="shrink-0 w-7 h-7 hover:bg-grid-hover rounded transition-colors flex items-center justify-center"
            title="Back to search"
          >
            <img
              src="/images/grid-logo.svg"
              alt="Grid"
              className="w-7 h-7"
            />
          </Link>

          <Link
            to="/search"
            className="text-xs text-grid-text-muted hover:text-grid-text transition-colors"
          >
            ← Back
          </Link>

          <span className="flex-1" />

          {/* Image position in results */}
          {currentIndex >= 0 && (
            <span className="text-xs text-grid-text-muted">
              {currentIndex + 1} of {results.length}
            </span>
          )}

          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="text-xs text-grid-text-muted hover:text-grid-text px-2 py-1 rounded hover:bg-grid-hover transition-colors cursor-pointer"
            title="Toggle fullscreen (F)"
          >
            Fullscreen
          </button>
        </header>
      )}

      {/* Main content — this div is fullscreened.
          Normal: bg-grid-bg (matches app background).
          Fullscreen: black, no UI. */}
      <div
        ref={containerRef}
        className={`flex-1 flex items-center justify-center relative min-h-0 ${
          isFullscreen ? "bg-black" : "bg-grid-bg"
        }`}
      >
        {/* The image — fills available space */}
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={image.metadata?.title ?? image.metadata?.description ?? ""}
            className="max-w-full max-h-full object-contain"
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

        {/* Fullscreen hint — bottom of screen, subtle */}
        {isFullscreen && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-xs pointer-events-none select-none">
            F to exit · ← → to navigate · Esc to exit fullscreen
          </div>
        )}
      </div>
    </>
  );
}
