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
import { attachedEnrichment, useEnrichmentStore, type EnrichmentFields } from "@/stores/enrichment-store";
import { deriveImage, type EnrichedImage } from "@/lib/derive-enriched-image";
import type { Image } from "@/types/image";
import { isImageMetadataCurrent, resolveImageOverlay } from "@/lib/image-read-freshness";

/**
 * Returns an `EnrichedImage` merging the raw ES `Image` with the API overlay.
 *
 * Pass the Image you already have from props. Returns `undefined` when
 * `image` is undefined (skeleton/placeholder cells). A supplied `ownOverlay`
 * (the caller's own singleton result) wins over the shared store.
 */
export function useEnrichedImage(image: Image | undefined, ownOverlay?: EnrichmentFields): EnrichedImage | undefined {
  const storedOverlay = useEnrichmentStore((s) => image ? s.data.get(image.id) : undefined);
  const overlay = image ? resolveImageOverlay(image, ownOverlay, storedOverlay, attachedEnrichment(image)) : undefined;
  const metadataStale = image ? !isImageMetadataCurrent(image, ownOverlay, storedOverlay, attachedEnrichment(image)) : false;

  // Memoise: only recompute when image or overlay reference changes.
  const prevRef = useRef<{ image: typeof image; overlay: typeof overlay; metadataStale: boolean; result: EnrichedImage | undefined }>({
    image: undefined,
    overlay: undefined,
    result: undefined,
    metadataStale: false,
  });

  if (image === prevRef.current.image && overlay === prevRef.current.overlay && metadataStale === prevRef.current.metadataStale) {
    return prevRef.current.result;
  }

  const result = image ? deriveImage(image, overlay) : undefined;
  if (result && metadataStale) result.metadataStale = true;
  prevRef.current = { image, overlay, metadataStale, result };
  return result;
}


export type { EnrichedImage } from "@/lib/derive-enriched-image";
