/**
 * TS port of kahuna/public/js/services/graphic-image-blur.js
 *
 * Determines whether an image should be treated as potentially graphic content
 * and blurred by default.
 *
 * Two inputs (OR'd together):
 * 1. Keyword scan on text metadata fields (description, title,
 *    specialInstructions, keywords) — mirrors kahuna's phrase list exactly.
 * 2. XMP `pur:adultContentWarning` flag from fileMetadata.
 *
 * NOTE: Kahuna also checks `image.data.isPotentiallyGraphic` (a server-side
 * Painless script field injected on search hits). That field is absent from
 * single-image GET responses and from kupua's ES `_source` fields. Kupua
 * relies on this TS heuristic instead. Absence of the server flag is treated
 * as "unknown", not "false" — so this function runs unconditionally.
 *
 * The `defaultShouldBlurGraphicImages` flag is hardcoded to `true` per the
 * Cluster 1 "hardcode-defaults rule". A future user preference (cookie toggle)
 * can be passed in as the `shouldBlur` parameter.
 */

import type { Image } from "@/types/image";

/**
 * Phrase list ported verbatim from kahuna's graphic-image-blur.js.
 * Do not edit without cross-checking the kahuna source.
 */
const GRAPHIC_PHRASES: readonly string[] = [
  "graphic content",
  "depicts death",
  "dead child",
  "child casualty",
  "sensitive material",
  "dead body",
  "dead bodies",
  "body of",
  "bodies of",
];

const defaultShouldBlurGraphicImages = true;

/**
 * Returns true if the image should be considered potentially graphic and
 * blurred. Pass `shouldBlur = false` to short-circuit (e.g. user preference
 * cookie has explicitly opted out).
 */
export function isImagePotentiallyGraphic(
  image: Image,
  shouldBlur: boolean = defaultShouldBlurGraphicImages,
): boolean {
  if (!shouldBlur) return false;

  // XMP adult-content warning flag
  const xmp = image.fileMetadata?.xmp as Record<string, unknown> | undefined;
  if (xmp?.["pur:adultContentWarning"] != null) return true;

  const desc = image.metadata?.description?.toLowerCase() ?? "";
  const title = image.metadata?.title?.toLowerCase() ?? "";
  const special = image.metadata?.specialInstructions ?? "";
  const specialLower = special.toLowerCase();
  const keywords: readonly string[] = image.metadata?.keywords ?? [];

  // SMOUT = "sensitive material out" — exact case-sensitive match in
  // specialInstructions or as an uppercase keyword (kahuna behaviour)
  if (special.includes("SMOUT")) return true;
  if (keywords.some((kw) => kw?.toUpperCase() === "SMOUT")) return true;

  // Phrase scan (case-insensitive)
  return GRAPHIC_PHRASES.some(
    (phrase) =>
      desc.includes(phrase) ||
      title.includes(phrase) ||
      specialLower.includes(phrase) ||
      keywords.some((kw) => kw?.toLowerCase().includes(phrase)),
  );
}
