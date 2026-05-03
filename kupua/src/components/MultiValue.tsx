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

interface MultiValueProps {
  field: FieldDefinition;
  /** Up to 3 sample values for the native browser tooltip. */
  sampleValues: unknown[];
}

/**
 * Renders "Multiple {noun}" (or "(Multiple {noun})" for location segments)
 * in dim text. A native `title` tooltip shows a sample of the differing values.
 */
export function MultiValue({ field, sampleValues }: MultiValueProps) {
  const noun = pluralNoun(field);
  const isLocationSegment = field.group === "location" && field.detailHidden;
  const label = isLocationSegment ? `(Multiple ${noun})` : `Multiple ${noun}`;

  const formatted = sampleValues
    .map((v) => {
      if (v === null || v === undefined) return "";
      if (field.formatter) return field.formatter(v);
      return String(v);
    })
    .filter(Boolean);

  const titleText =
    formatted.length > 0 ? formatted.join(", ") : undefined;

  return (
    <span
      className="text-grid-text-dim italic"
      title={titleText}
    >
      {label}
    </span>
  );
}
