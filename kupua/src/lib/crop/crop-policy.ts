import type { EnrichedImage } from "@/lib/derive-enriched-image";

export function cropAccess(image: EnrichedImage | undefined, api: boolean, sessionInvalidated: boolean) {
  const canReadExports = Boolean(image && (!api || image.resource?.links.some(link => link.rel === "crops")));
  const creationReason = !image || image.__availability ? "Image information is not ready"
    : image.softDeletedMetadata ? "This image is deleted"
    : image.metadataStale ? "Image information is being updated"
    : api && sessionInvalidated ? "Reload after signing in again"
    : !canReadExports || !image.valid ? "Cannot crop this image" : undefined;
  return { canReadExports, creationReason };
}