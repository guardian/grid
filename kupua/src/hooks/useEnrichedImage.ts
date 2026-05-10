/**
 * useEnrichedImage — the single hook for consuming enriched image data.
 *
 * Takes an `Image` (already in scope from props/store) and merges it with
 * the API overlay from enrichment-store via `deriveImage`. Per-id Zustand
 * selector on enrichment-store ensures only the row whose overlay changed
 * re-renders.
 *
 * Does NOT subscribe to search-store — callers already have the Image.
 * This avoids O(cells × buffer) scans on every search-store mutation.
 *
 * See worklog-current.md "Architectural review + revised plan (8 May 2026)".
 */

import { useRef } from "react";
import { useEnrichmentStore } from "@/stores/enrichment-store";
import { deriveImage, type EnrichedImage } from "@/lib/derive-enriched-image";
import type { Image } from "@/types/image";

/**
 * Returns an `EnrichedImage` merging the raw ES `Image` with the API overlay.
 *
 * Pass the Image you already have from props. Returns `undefined` when
 * `image` is undefined (skeleton/placeholder cells).
 */
export function useEnrichedImage(image: Image | undefined): EnrichedImage | undefined {
  const overlay = useEnrichmentStore((s) => image ? s.data.get(image.id) : undefined);

  // Memoise: only recompute when image or overlay reference changes.
  const prevRef = useRef<{ image: typeof image; overlay: typeof overlay; result: EnrichedImage | undefined }>({
    image: undefined,
    overlay: undefined,
    result: undefined,
  });

  if (image === prevRef.current.image && overlay === prevRef.current.overlay) {
    return prevRef.current.result;
  }

  const result = image ? deriveImage(image, overlay) : undefined;
  prevRef.current = { image, overlay, result };
  return result;
}


export type { EnrichedImage } from "@/lib/derive-enriched-image";
