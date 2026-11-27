import type { EnrichedImage } from "@/lib/derive-enriched-image";
import type { Image } from "@/types/image";
import { editingAllowedAtStartup } from "@/lib/editing-preference";

export function cropEditingEnabled(api = import.meta.env.VITE_USE_MEDIA_API === "true"): boolean {
  return api && editingAllowedAtStartup;
}

export function imageHasFullFrame(image: Image): boolean {
  const dimensions = image.source?.orientedDimensions ?? image.source?.dimensions;
  return image.exports?.some(crop => {
    if ((crop.specification?.type ?? crop.type) === "full") return true;
    const bounds = crop.specification?.bounds as { x: number; y: number; width: number; height: number } | undefined;
    return Boolean(dimensions && bounds && bounds.x === 0 && bounds.y === 0
      && bounds.width === dimensions.width && bounds.height === dimensions.height);
  }) ?? false;
}

export function cropAccess(image: EnrichedImage | undefined, api: boolean, sessionInvalidated: boolean) {
  const canReadExports = Boolean(image && (!api || image.resource?.links.some(link => link.rel === "crops")));
  const creationReason = !image || image.__availability ? "Image information is not ready"
    : image.softDeletedMetadata ? "This image is deleted"
    : image.metadataStale ? "Image information is being updated"
    : api && sessionInvalidated ? "Reload after signing in again"
    : !canReadExports || !image.valid ? "Cannot crop this image" : undefined;
  return { canReadExports, creationReason };
}