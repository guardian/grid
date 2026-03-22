/**
 * Image URL builders for thumbnails and full-size images.
 *
 * Thumbnails: served directly from S3 via the local S3 proxy (s3-proxy.mjs).
 *   Already well-optimised in the thumb bucket — no transformation needed.
 *
 * Full-size images: served via imgproxy, which resizes and converts to WebP
 *   on the fly. This avoids sending 50MB originals to the browser.
 *   See kupua/exploration/docs/imgproxy-research.md for background.
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
 * Whether imgproxy is available for full-size images.
 * Set via VITE_IMGPROXY_ENABLED env var (only in --use-TEST mode).
 */
const IMGPROXY_ENABLED =
  (import.meta.env.VITE_IMGPROXY_ENABLED ?? "false") === "true";

/** S3 bucket name for full-size images (set by start.sh). */
const IMAGE_BUCKET = import.meta.env.VITE_IMAGE_BUCKET ?? "";

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

// ---------------------------------------------------------------------------
// Full-size images via imgproxy
// ---------------------------------------------------------------------------

/**
 * Convert a Grid image ID to its S3 key.
 * Grid stores images with the first 6 chars as individual directory segments:
 *   be0cbabc59a9... → b/e/0/c/b/a/be0cbabc59a9...
 */
function idToS3Key(imageId: string): string {
  const dirPrefix = imageId
    .slice(0, 6)
    .split("")
    .join("/");
  return `${dirPrefix}/${imageId}`;
}

/**
 * Derive the rotation correction from EXIF orientation.
 *
 * Grid stores `source.orientationMetadata.exifOrientation` in ES.
 * We disable imgproxy's auto_rotate and instead pass an explicit `rotate:N`.
 * This matches the eelpie fork's approach (commit dd9e7010d).
 *
 * EXIF orientation values:
 *   1 = normal (no rotation)
 *   3 = upside down (180°)
 *   6 = rotated 90° CW (needs 90° correction)
 *   8 = rotated 90° CCW (needs -90°, normalised to 270°)
 *
 * imgproxy does not accept negative rotations, so -90 becomes 270.
 */
function orientationToRotation(exifOrientation: number | undefined): number {
  switch (exifOrientation) {
    case 6:
      return 90;
    case 3:
      return 180;
    case 8:
      return 270; // -90 normalised (imgproxy doesn't accept negatives)
    default:
      return 0;
  }
}

/** Default imgproxy processing options, matching eelpie fork's approach. */
const IMGPROXY_DEFAULTS = {
  /** Max dimension — fits within this box, preserving aspect ratio */
  width: 1200,
  height: 1200,
  /** JPEG/WebP quality (1–100) */
  quality: 80,
  /** Output format — WebP for good compression + wide browser support */
  format: "webp",
} as const;

export interface FullImageOptions {
  /** Max width in pixels (default: 1200) */
  width?: number;
  /** Max height in pixels (default: 1200) */
  height?: number;
  /** Quality 1–100 (default: 80) */
  quality?: number;
  /** Output format (default: "webp") */
  format?: "webp" | "avif" | "jpg" | "png";
}

/**
 * Get a full-size image URL via imgproxy.
 *
 * Builds an imgproxy URL that resizes the original S3 image on the fly
 * and converts to WebP (or another format). Follows eelpie fork's approach:
 * auto_rotate:false, strip_metadata:true, strip_color_profile:true.
 *
 * Returns undefined when imgproxy isn't available (local mode).
 */
export function getFullImageUrl(
  image: Image,
  options?: FullImageOptions,
): string | undefined {
  if (!IMGPROXY_ENABLED || !IMAGE_BUCKET) return undefined;
  if (!image.id) return undefined;

  const w = options?.width ?? IMGPROXY_DEFAULTS.width;
  const h = options?.height ?? IMGPROXY_DEFAULTS.height;
  const q = options?.quality ?? IMGPROXY_DEFAULTS.quality;
  const ext = options?.format ?? IMGPROXY_DEFAULTS.format;

  const s3Key = idToS3Key(image.id);
  const s3Source = `s3://${IMAGE_BUCKET}/${s3Key}`;

  // Derive rotation from EXIF orientation stored in ES.
  // auto_rotate is disabled — we pass explicit rotation, matching the eelpie fork.
  const rotation = orientationToRotation(
    image.source?.orientationMetadata?.exifOrientation,
  );

  // Build imgproxy processing URL (path-segment style).
  // "insecure" = no HMAC signature (local dev only, matches eelpie fork's "no-signature").
  // "plain" source URL encoding — imgproxy also accepts base64 but plain is more readable.
  const segments = [
    "/imgproxy/insecure",
    "auto_rotate:false",
    "strip_metadata:true",
    "strip_color_profile:true",
    `resize:fit:${w}:${h}`,
    `quality:${q}`,
  ];

  if (rotation !== 0) {
    segments.push(`rotate:${rotation}`);
  }

  segments.push(`plain/${s3Source}@${ext}`);

  return segments.join("/");
}

/** Whether thumbnails are available in the current configuration. */
export const thumbnailsEnabled = S3_PROXY_ENABLED;

/** Whether full-size image viewing is available (imgproxy running). */
export const fullImagesEnabled = IMGPROXY_ENABLED && !!IMAGE_BUCKET;


