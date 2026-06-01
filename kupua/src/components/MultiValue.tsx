/**
 * MultiValue -- renders a "Multiple X" placeholder for scalar fields that
 * disagree across a multi-image selection.
 *
 * Location sub-fields (detailHidden + group "location") use the parenthesised
 * Kahuna format: "(Multiple cities)" to indicate a sub-segment.
 */

import type { FieldDefinition } from "@/lib/field-registry";

// ---------------------------------------------------------------------------
// Plural lookup for fields where auto-pluralisation is wrong or unhelpful.
// Key = field id, value = the plural noun to use after "Multiple ".
// ---------------------------------------------------------------------------
const PLURAL_OVERRIDE: Record<string, string> = {
  metadata_byline: "bylines",
  metadata_bylineTitle: "byline titles",
  metadata_dateTaken: "dates taken",
  metadata_imageType: "image types",
  metadata_specialInstructions: "special instructions",
  metadata_suppliersReference: "supplier references",
  usageRights_category: "categories",
  location_subLocation: "sublocations",
  location_city: "cities",
  location_state: "states",
  location_country: "countries",
  alias_bitsPerSample: "bits per sample values",
  alias_colourModel: "colour models",
  alias_colourProfile: "colour profiles",
  alias_cutout: "cutout values",
  alias_digitalSourceType: "digital source types",
  alias_editStatus: "edit statuses",
  alias_sceneCode: "scene codes",
};

/** Simple pluralisation for field labels not in PLURAL_OVERRIDE. */
function autoPlural(label: string): string {
  if (label.endsWith("s")) return label;
  if (label.endsWith("y")) return label.slice(0, -1) + "ies";
  return label + "s";
}

function pluralNoun(field: FieldDefinition): string {
  return PLURAL_OVERRIDE[field.id] ?? autoPlural(field.label.toLowerCase());
}

/** Number of top values to show in the tooltip. */
const TOOLTIP_TOP_N = 5;

interface MultiValueProps {
  field: FieldDefinition;
  /** Top distinct values with frequency counts. */
  topValues: Array<{ value: unknown; count: number }>;
  /** Total number of selected images (for the denominator). */
  total: number;
}

/**
 * Renders "Multiple {noun}" (or "(Multiple {noun})" for location segments)
 * in dim text. A native `title` tooltip shows the top 5 values with counts.
 */
export function MultiValue({ field, topValues, total }: MultiValueProps) {
  const noun = pluralNoun(field);
  const isLocationSegment = field.group === "location" && field.detailHidden;
  const label = isLocationSegment ? `(Multiple ${noun})` : `Multiple ${noun}`;

  let titleText: string | undefined;
  if (topValues.length > 0) {
    const shown = topValues.slice(0, TOOLTIP_TOP_N);
    const lines = shown.map((entry) => {
      const display = entry.value === null || entry.value === undefined
        ? ""
        : field.formatter
          ? field.formatter(entry.value as string)
          : String(entry.value);
      return `${display} (${entry.count.toLocaleString()}/${total.toLocaleString()})`;
    }).filter(Boolean);
    const remaining = topValues.length - shown.length;
    if (remaining > 0) {
      lines.push(`(+${remaining} others)`);
    }
    titleText = lines.length > 0 ? lines.join("\n") : undefined;
  }

  return (
    <span
      className="text-grid-text-dim italic"
      title={titleText}
    >
      {label}
    </span>
  );
}
