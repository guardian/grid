/**
 * Image URL builders for thumbnails and full-size images.
 *
 * Thumbnails: served directly from S3 via the local S3 proxy (s3-proxy.mjs).
 *   Already well-optimised in the thumb bucket — no transformation needed.
 *
 * Full-size images: served via imgproxy, which resizes and converts to WebP
 *   on the fly. This avoids sending 50MB originals to the browser.
 *   See kupua/exploration/docs/01 Research/imgproxy-research.md for background.
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

/**
 * Detect the effective DPR multiplier for image requests.
 *
 * Three-tier step function:
 *   DPR ≤ 1.3            →  1    (request CSS pixels — don't over-serve 1× displays)
 *   DPR > 1.3 + desktop  →  1.5  (sharper on Retina, but not full 2× which would be
 *                                  4× pixel count and ~2× file size / imgproxy time)
 *   DPR > 1.3 + mobile   →  2    (higher res for pinch-zoom headroom; phones have
 *                                  smaller screens so absolute pixel count stays modest)
 *
 * Why 1.3 as the threshold: it's above 1× (so slight sub-pixel scaling
 * doesn't trigger the bump) and below common HiDPI ratios (1.5, 2, 3).
 * Some Windows laptops report 1.25 — those are closer to 1× perceptually,
 * so they stay in the 1× tier.
 *
 * Why 1.5 desktop: for photographic content, 1.5× is visually
 * indistinguishable from 2× for most viewers. 1.5× is 56% more pixels
 * than 1× (vs 300% more for 2×).
 *
 * Why 2 mobile: phones support pinch-zoom up to 5× — at 1.5 DPR cap,
 * zooming past ~1.5× shows visible blur. 2× gives ~1.3× zoom headroom
 * before hitting native resolution. File size impact is moderate because
 * phone screens are small (e.g. iPhone 15: 393×852 CSS → 786×1704 px,
 * ~400KB AVIF vs ~226KB at 1.5).
 *
 * Mobile detection uses `pointer: coarse` (touch-primary device), matching
 * the same heuristic used elsewhere in kupua (ui-prefs-store.ts).
 *
 * This is a deviation from kahuna, which uses full screen.width × screen.height
 * (but only for Firefox — see kahuna/public/js/imgops/service.js lines 14-20).
 */
function detectDpr(): number {
  if (typeof window === "undefined") return 1;
  if (window.devicePixelRatio <= 1.3) return 1;
  const isMobile = window.matchMedia("(pointer: coarse)").matches;
  return isMobile ? 2 : 1.5;
}

/** Default imgproxy processing options, matching eelpie fork's approach. */
const IMGPROXY_DEFAULTS = {
  /**
   * Max dimension — fits within this box, preserving aspect ratio.
   * Callers should pass screen.width/height instead of relying on this
   * fallback. 1200 is a safe default for SSR or missing dimensions.
   */
  width: 1200,
  height: 1200,
  /**
   * JPEG/WebP/AVIF quality (1–100).
   * Omitted by default — imgproxy uses its own per-format default
   * (WebP 79, AVIF 63, JXL 77). Pass explicitly to override.
   */
  quality: undefined as number | undefined,
  /** Output format — AVIF for compression + correct colour (embedded ICC) */
  format: "avif",
  /**
   * Device pixel ratio multiplier — detected at module load time.
   * See {@link detectDpr} for the two-tier logic and rationale.
   */
  dpr: detectDpr(),
} as const;

export interface FullImageOptions {
  /** Max width in CSS pixels (default: 1200) */
  width?: number;
  /** Max height in CSS pixels (default: 1200) */
  height?: number;
  /** Quality 1–100 (default: 80) */
  quality?: number;
  /**
   * Output format (default: "webp"). JPEG is excluded because it doesn't
   * support alpha channels — Grid stores PNGs/TIFFs with transparency.
   * WebP, AVIF, and JXL all handle alpha natively.
   */
  format?: "webp" | "avif" | "jxl";
  /**
   * Device pixel ratio multiplier. The requested pixel dimensions are
   * `width × dpr` and `height × dpr`, capped at the image's native resolution.
   * Default: auto-detected via {@link detectDpr} — 1 on standard displays,
   * 1.5 on HiDPI (devicePixelRatio > 1.3). Pass 1 to disable DPR scaling.
   */
  dpr?: number;
  /**
   * Native image dimensions — used to cap the request so we never upscale.
   * When provided, the requested size is `min(width × dpr, nativeWidth)`.
   * If omitted, no cap is applied (imgproxy handles upscale prevention internally).
   */
  nativeWidth?: number;
  nativeHeight?: number;
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

  const cssW = options?.width ?? IMGPROXY_DEFAULTS.width;
  const cssH = options?.height ?? IMGPROXY_DEFAULTS.height;
  const dpr = options?.dpr ?? IMGPROXY_DEFAULTS.dpr;
  const q = options?.quality ?? IMGPROXY_DEFAULTS.quality;
  const ext = options?.format ?? IMGPROXY_DEFAULTS.format;

  // Apply DPR multiplier, then cap at native resolution to avoid upscaling.
  // imgproxy itself won't upscale, but requesting smaller saves bandwidth.
  const rawW = Math.round(cssW * dpr);
  const rawH = Math.round(cssH * dpr);
  const nativeW = options?.nativeWidth;
  const nativeH = options?.nativeHeight;
  const w = nativeW ? Math.min(rawW, nativeW) : rawW;
  const h = nativeH ? Math.min(rawH, nativeH) : rawH;

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
  ];

  // Only pass quality if explicitly set — otherwise imgproxy uses its
  // per-format default (WebP 79, AVIF 63, JXL 77).
  if (q != null) {
    segments.push(`quality:${q}`);
  }

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


