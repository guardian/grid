/**
 * Display names for usageRights.category values. Server names from metadata-editor
 * (usage-rights-catalogue) win; otherwise a local fallback mirroring common-lib
 * UsageRights.scala (snapshot 30 October 2026), used by direct-ES and laptop modes.
 */

import { gridConfig } from "@/lib/grid-config";
import { useUsageRightsCatalogue, type UsageRightsCategory } from "@/lib/usage-rights-catalogue";

const org = gridConfig.staffPhotographerOrganisation;

const FALLBACK_LABELS: Record<string, string> = {
  "": "Unknown Rights",
  "chargeable": "Chargeable supplied/on spec",
  "pay-to-use": "Pay to use",
  "pr-and-third-party": "PR & Third Party",
  "publisher-photographer": `${org} Photographer`,
  "publisher-illustrator": `${org} Illustrator`,
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

let indexedFrom: UsageRightsCategory[] | null = null;
let byValue = new Map<string, UsageRightsCategory>();

function serverCategory(value: string): UsageRightsCategory | undefined {
  const categories = useUsageRightsCatalogue.getState().categories;
  if (categories !== indexedFrom) {
    indexedFrom = categories;
    byValue = new Map((categories ?? []).map((category) => [category.value, category]));
  }
  return byValue.get(value);
}

/** Returns the human-friendly label for a category key, or the raw key if unknown. */
export function categoryLabel(category: string | undefined | null): string {
  if (category == null) return "None";
  return serverCategory(category)?.name ?? FALLBACK_LABELS[category] ?? category;
}

/**
 * The `category:` value to search with: the server's org-specific alias when media-api
 * executes queries (it expands aliases); direct-ES only understands stored values.
 */
export function categorySearchValue(category: string): string {
  if (import.meta.env.VITE_USE_MEDIA_API !== "true") return category;
  return serverCategory(category)?.searchAlias ?? category;
}

/** Re-renders the caller when the server catalogue arrives. */
export function useCategoryLabel(): typeof categoryLabel {
  useUsageRightsCatalogue((state) => state.categories);
  return categoryLabel;
}
