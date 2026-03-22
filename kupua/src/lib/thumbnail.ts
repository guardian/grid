/**
 * Thumbnail URL builder.
 *
 * This module provides a function to build a URL that loads an image's
 * thumbnail via the local S3 proxy (temporary dev solution).
 *
 * HOW TO REPLACE THIS (Phase 3):
 *   When kupua connects to the Grid media-api, thumbnails will be served
 *   via signed URLs from the API response. Replace `getThumbnailUrl()`
 *   with a function that reads the signed URL from the API response
 *   (e.g. `image.data.thumbnail.secureUrl`). The S3 proxy and this
 *   module's proxy logic can then be deleted.
 *
 * The current implementation:
 *   - In TEST mode (S3 proxy running): returns `/s3/thumb/<imageId>`
 *     which Vite proxies to the local s3-proxy.mjs server
 *   - In local mode (no S3 proxy): returns undefined (no thumbnails
 *     available — sample data has S3 URLs that aren't accessible locally)
 */

import type { Image } from "@/types/image";

/**
 * Whether the S3 proxy is available.
 * Set via VITE_S3_PROXY_ENABLED env var (only in --use-TEST mode).
 */
const S3_PROXY_ENABLED =
  (import.meta.env.VITE_S3_PROXY_ENABLED ?? "false") === "true";

/**
 * Get the thumbnail URL for an image.
 *
 * Returns a proxied URL when the S3 proxy is running (TEST mode),
 * or undefined when thumbnails aren't available (local mode).
 */
export function getThumbnailUrl(image: Image): string | undefined {
  if (!S3_PROXY_ENABLED) return undefined;
  if (!image.id) return undefined;
  return `/s3/thumb/${image.id}`;
}

/**
 * Get the full-size image URL for an image.
 * Only available when the S3 proxy is running.
 */
export function getImageUrl(image: Image): string | undefined {
  if (!S3_PROXY_ENABLED) return undefined;
  if (!image.id) return undefined;
  return `/s3/image/${image.id}`;
}

/** Whether thumbnails are available in the current configuration. */
export const thumbnailsEnabled = S3_PROXY_ENABLED;


