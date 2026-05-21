/**
 * Image border colours — maps categories and agency-pick patterns to colours.
 *
 * Used by both ImageGrid (cell border) and ImageTable (row left accent).
 * Kahuna parity: staff/contract/commissioned photographers get #005689.
 *
 * All border logic lives here. Components call getImageBorderColour(image)
 * and never consult the underlying rules directly.
 */

import type { Image } from "@/types/image";
import { gridConfig } from "@/lib/grid-config";

// ---------------------------------------------------------------------------
// Category-based rules (usageRights.category → colour)
// ---------------------------------------------------------------------------

const CATEGORY_BORDERS: Record<string, string> = {
  "staff-photographer": "#005689",
  "contract-photographer": "#005689",
  "commissioned-photographer": "#005689",
};

// ---------------------------------------------------------------------------
// Agency-pick detection — client-side parity with maybeAgencyPickQuery in
// MediaApiConfig.scala. Checks metadata fields against agencyPicksIngredients.
//
// Field type handling:
//   metadata.description / metadata.title: string  → field.includes(keyword)
//   metadata.keywords:                     string[] → array.some(k.includes(keyword))
//
// This mirrors match_phrase semantics — phrase found anywhere in the string,
// or anywhere in any array element.
// ---------------------------------------------------------------------------

function isAgencyPick(image: Image): boolean {
  if (!gridConfig.hasAgencyPicks) return false;
  const meta = image.metadata;
  if (!meta) return false;

  for (const [field, keywords] of Object.entries(gridConfig.agencyPicksIngredients)) {
    // Resolve dot-path (all relevant fields are one level under metadata)
    const key = field.startsWith("metadata.") ? field.slice("metadata.".length) : field;
    const raw = (meta as Record<string, unknown>)[key];
    if (raw == null) continue;

    if (Array.isArray(raw)) {
      // string[] (e.g. metadata.keywords)
      // Case-insensitive: ES match_phrase lowercases via standard analyzer.
      if (keywords.some((kw) => (raw as string[]).some((v) => v.toLowerCase().includes(kw.toLowerCase())))) return true;
    } else if (typeof raw === "string") {
      // string (e.g. metadata.description, metadata.title)
      // Case-insensitive: ES match_phrase lowercases via standard analyzer.
      if (keywords.some((kw) => raw.toLowerCase().includes(kw.toLowerCase()))) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API — single function; components never touch the rules directly
// ---------------------------------------------------------------------------

/**
 * Return the border colour for an image, or undefined if no border applies.
 *
 * Priority: category-based rule (GNM-owned) > agency-pick keyword match.
 * In practice the two sets don't overlap (wire agency picks are not GNM-owned),
 * but explicit priority guards against future config edge-cases.
 */
export function getImageBorderColour(image: Image): string | undefined {
  const category =
    (image as { usageRights?: { category?: string } }).usageRights?.category ?? "";
  const categoryColour = CATEGORY_BORDERS[category];
  if (categoryColour) return categoryColour;

  if (isAgencyPick(image)) return gridConfig.agencyPicksColour;

  return undefined;
}

/**
 * @deprecated Use getImageBorderColour(image) instead.
 * Kept for any external callers; will be removed once all sites are migrated.
 */
export const IMAGE_BORDERS: Record<string, string> = CATEGORY_BORDERS;
