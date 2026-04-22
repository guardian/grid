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

/** True on touch devices — used to skip thumbnail prefetch on desktop. */
const isTouchDevice =
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;

/**
 * Set of image IDs whose full-res AVIF has been fully decoded (via
 * img.decode() in the prefetch pipeline, or onLoad from the center panel).
 * Used by side-panel URL selection: if an image's full-res is known-decoded,
 * the panel uses the full-res URL instead of thumbnail.
 *
 * Note: Chrome does NOT share decoded bitmaps between Image objects. This
 * Set only tracks "HTTP cache is warm + decode succeeded at least once"
 * — the DOM <img> element still needs its own decode. The data-thumb
 * fallback at COMMIT time handles the case where decode hasn't finished.
 *
 * Capped at MAX_DECODED_CACHE entries (FIFO via insertion order).
 * Module-level — survives component re-renders.
 */
const MAX_DECODED_CACHE = 30;
const _loadedFullRes = new Set<string>();

/** Evict oldest entries when the cache exceeds the cap. */
function _evictOldest(): void {
  const iter = _loadedFullRes.values();
  while (_loadedFullRes.size > MAX_DECODED_CACHE) {
    const first = iter.next().value;
    if (first !== undefined) _loadedFullRes.delete(first);
    else break;
  }
}

/** True if the full-res AVIF for this image has been decoded. */
export function isFullResLoaded(imageId: string): boolean {
  return _loadedFullRes.has(imageId);
}

/** Mark an image's full-res as decoded (called from center panel onLoad). */
export function markFullResLoaded(imageId: string): void {
  if (!_loadedFullRes.has(imageId)) {
    _loadedFullRes.add(imageId);
    _evictOldest();
  }
  _notifyListeners(imageId);
}

// ── Decode-completion subscription ──────────────────────────────
// Lets React components react when a specific image's full-res becomes
// available (e.g. side panel upgrades from thumbnail to full-res).
type DecodeListener = (imageId: string) => void;
const _listeners = new Set<DecodeListener>();

/** Subscribe to decode completions. Returns an unsubscribe function. */
export function onFullResDecoded(cb: DecodeListener): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

function _notifyListeners(imageId: string): void {
  for (const cb of _listeners) cb(imageId);
}

/** Resolve the prefetch URL for an image (screen-sized, with native cap). */
function prefetchUrl(image: Image): string | undefined {
  return getCarouselImageUrl(image) ?? getThumbnailUrl(image);
}

/**
 * Canonical URL for carousel images (side panels + prefetch). Uses
 * screen dimensions + native cap. Shared between prefetch and panel
 * useMemos so the HTTP-cache-warmed URL matches what the DOM receives.
 */
export function getCarouselImageUrl(image: Image): string | undefined {
  const opts: FullImageOptions = {
    ...screenOpts,
    nativeWidth: image.source?.dimensions?.width,
    nativeHeight: image.source?.dimensions?.height,
  };
  return getFullImageUrl(image, opts);
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
    // Full-res: screen-sized imgproxy AVIF — the main prefetch target.
    // On mobile: use img.decode() so we mark as available once the bitmap
    // is fully rasterized (drives side-panel full-res vs thumbnail choice).
    // On desktop: skip decode() — side panels aren't rendered, so the
    // decoded bitmap is wasted CPU. HTTP cache warming is all we need.
    const url = prefetchUrl(image);
    if (url && !_loadedFullRes.has(image.id)) {
      const img = new Image();
      const id = image.id;
      img.src = url;
      if (isTouchDevice) {
        img.decode().then(
          () => { _loadedFullRes.add(id); _evictOldest(); _notifyListeners(id); },
          () => { /* decode failed (404, broken image) — don't mark */ },
        );
      }
    }
    // Thumbnail: tiny JPEG fallback for swipe side panels. Only needed
    // for the immediate neighbours (i±1) — those are the panels visible
    // during the next swipe animation. Images further ahead are never
    // on a panel at COMMIT time. Mobile-only — desktop doesn't swipe.
    const distance = Math.abs(idx - currentIndex);
    if (isTouchDevice && distance <= 1) {
      const thumb = getThumbnailUrl(image);
      if (thumb) {
        const img = new Image();
        img.src = thumb;
      }
    }
  }
}


