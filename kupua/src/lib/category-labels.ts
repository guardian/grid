/**
 * Human-friendly display names for usageRights.category values.
 *
 * Mirrored from the Scala model in common-lib UsageRights.scala.
 * Kahuna gets these from the media-api at runtime; kupua reads ES
 * directly so we maintain a static copy.
 */
const CATEGORY_LABELS: Record<string, string> = {
  "": "No Rights",
  "chargeable": "Chargeable supplied/on spec",
  "agency": "Agency – subscription",
  "commissioned-agency": "Agency – commissioned",
  "PR Image": "PR Image",
  "handout": "Handout",
  "screengrab": "Screengrab",
  "guardian-witness": "GuardianWitness",
  "original-source": "Original Source",
  "social-media": "Social Media",
  "Bylines": "Bylines",
  "obituary": "Obituary",
  "staff-photographer": "Photographer – staff",
  "contract-photographer": "Photographer – contract",
  "commissioned-photographer": "Photographer – commissioned",
  "pool": "Pool",
  "crown-copyright": "Crown copyright",
  "staff-illustrator": "Illustrator – staff",
  "contract-illustrator": "Illustrator – contract",
  "commissioned-illustrator": "Illustrator – commissioned",
  "creative-commons": "Creative Commons",
  "composite": "Composite",
  "public-domain": "Public Domain",
  "program-promotional": "Programme Promotional",
  "programmes-organisation-owned": "Programmes – Organisation Owned",
  "programmes-independents": "Programmes – Independents",
  "programmes-acquisitions": "Programmes – Acquisitions",
};

/** Returns the human-friendly label for a category key, or the raw key if unknown. */
export function categoryLabel(category: string | undefined | null): string {
  if (category == null) return "None";
  return CATEGORY_LABELS[category] ?? category;
}
