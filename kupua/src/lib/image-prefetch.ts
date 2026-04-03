/**
 * Direction-aware image prefetch pipeline.
 *
 * Shared between ImageDetail (traversal in detail view) and FullscreenPreview
 * (traversal in fullscreen peek). Both use the same screen-sized imgproxy URL
 * and the same 4-ahead + 1-behind strategy.
 *
 * Uses `new Image().src` — the browser fetches and caches the response.
 * Completed prefetches are never cancelled — they warm the HTTP cache.
 *
 * Throttle gate (T=150ms): at held-arrow-key speeds (<150ms/step), skip
 * prefetch batches to reduce imgproxy contention. The main <img> request
 * still fires every step (browser-managed). At ≥200ms/step, 200 > 150 →
 * throttle never triggers → pipeline runs at full capacity.
 *
 * Direction-aware allocation (PhotoSwipe model):
 *   Forward  → [i+1, i+2, i+3, i+4, i-1]
 *   Backward → [i-1, i-2, i-3, i-4, i+1]
 * Fired in distance order so the nearest image wins any connection
 * scheduling tie.
 */

import { getFullImageUrl, getThumbnailUrl, type FullImageOptions } from "@/lib/image-urls";
import type { Image } from "@/types/image";

/** Screen-sized imgproxy options — stable across window resize / fullscreen. */
const screenOpts: FullImageOptions = {
  width: typeof window !== "undefined" ? window.screen.width : 1200,
  height: typeof window !== "undefined" ? window.screen.height : 1200,
};

/** Resolve the prefetch URL for an image (screen-sized, with native cap). */
function prefetchUrl(image: Image): string | undefined {
  const opts: FullImageOptions = {
    ...screenOpts,
    nativeWidth: image.source?.dimensions?.width,
    nativeHeight: image.source?.dimensions?.height,
  };
  return getFullImageUrl(image, opts) ?? getThumbnailUrl(image);
}

/**
 * Prefetch nearby images in the buffer around `currentIndex`.
 *
 * @param currentIndex  — local index in `results` of the currently displayed image
 * @param results       — the buffer array from the search store
 * @param direction     — movement direction ("forward" or "backward")
 * @param lastPrefetchTime — ref holding the timestamp of the last prefetch call
 *                           (mutated in place). Pass `{ current: 0 }` for the first call.
 *                           When null, throttle is bypassed (use on initial enter).
 */
export function prefetchNearbyImages(
  currentIndex: number,
  results: readonly (Image | undefined)[],
  direction: "forward" | "backward",
  lastPrefetchTime: { current: number } | null,
): void {
  if (currentIndex < 0 || currentIndex >= results.length) return;

  // Throttle gate — skip if called faster than 150ms (held-arrow-key speed).
  // Bypassed when lastPrefetchTime is null (initial enter, no throttle needed).
  if (lastPrefetchTime) {
    const now = performance.now();
    if (now - lastPrefetchTime.current < 150) return;
    lastPrefetchTime.current = now;
  }

  const ahead = direction === "forward" ? 1 : -1;
  const indices: number[] = [];

  // 4 in movement direction (nearest first)
  for (let i = 1; i <= 4; i++) {
    const idx = currentIndex + ahead * i;
    if (idx >= 0 && idx < results.length) indices.push(idx);
  }
  // 1 behind
  const behindIdx = currentIndex - ahead;
  if (behindIdx >= 0 && behindIdx < results.length) indices.push(behindIdx);

  for (const idx of indices) {
    const image = results[idx];
    if (!image) continue;
    const url = prefetchUrl(image);
    if (url) {
      const img = new Image();
      img.src = url;
    }
  }
}


