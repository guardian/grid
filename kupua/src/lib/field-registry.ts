/**
 * Field Definition Registry — single source of truth for all image fields.
 *
 * Every field that kupua can display, search, sort, or aggregate is defined
 * here exactly once. Consumers (ImageTable, MetadataPanel, grid view, sort
 * dropdown, facet filters) read from this registry — they never hardcode
 * field knowledge themselves.
 *
 * The registry captures:
 *  - identity (id, label, group)
 *  - data access (accessor, rawValue)
 *  - search (cqlKey, cqlAliases, esSearchPath)
 *  - sort (sortKey, descByDefault)
 *  - display (defaultWidth, defaultHidden, formatter, cellRenderer)
 *  - type metadata (fieldType, isList, isComposite)
 *
 * Config-driven alias fields from grid-config.ts are merged in at the end.
 *
 * ⚠️ COUPLING: `fieldType` and `aggregatable` restate what the ES mapping
 * already knows. If the mapping changes (e.g. `byline` gains a `.keyword`
 * sub-field per mapping-enhancements.md §2a), these properties must be
 * updated to match. When facet filters are built, consider replacing these
 * with dynamic introspection via `GET /<index>/_mapping` at startup —
 * the mapping fetch can run in parallel with the first search and enrich
 * the registry after load, since aggregatable/fieldType are not needed
 * for first render.
 */

import type { Image } from "@/types/image";
import type { ReactNode } from "react";
import { format } from "date-fns";
import { gridConfig } from "./grid-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The kind of ES mapping for this field — drives what operations are possible. */
export type FieldType = "keyword" | "text" | "date" | "integer" | "composite" | "list";

/** Where in the UI this field appears by default. */
export type FieldGroup =
  | "core"           // always-relevant fields (credit, byline, description)
  | "dates"          // date/time fields
  | "technical"      // dimensions, file type, colour model
  | "rights"         // usage rights, category
  | "upload"         // uploader, filename
  | "location"       // subLocation, city, state, country
  | "alias";         // config-driven alias fields from grid-config

export interface FieldDefinition {
  /** Unique ID — used as column ID, localStorage key, etc. Must be stable. */
  id: string;

  /** Human-readable label for column headers, metadata panel, etc. */
  label: string;

  /** Grouping for UI organisation (metadata panel sections, filter panels). */
  group: FieldGroup;

  // -- Data access ----------------------------------------------------------

  /**
   * Extract the display value from an image document.
   * Returns a string for simple fields, string[] for list fields,
   * or undefined if the field is empty.
   */
  accessor: (image: Image) => string | string[] | undefined;

  /**
   * Extract the raw string value for tooltip/click-to-search.
   * Defaults to `accessor` if not provided.
   * For formatted fields (dates, dimensions), this returns the raw value
   * while `accessor` returns the formatted display value.
   */
  rawValue?: (image: Image) => string | undefined;

  // -- Search ---------------------------------------------------------------

  /**
   * CQL key used for click-to-search (e.g. "credit", "by", "source").
   * If undefined, the field doesn't support click-to-search.
   */
  cqlKey?: string;

  /**
   * Full ES path(s) that the CQL key resolves to.
   * Used by cql.ts for field resolution. Single string or array for
   * multi-field expansion (e.g. "in" → ["metadata.subLocation", ...]).
   */
  esSearchPath?: string | string[];

  // -- Sort -----------------------------------------------------------------

  /**
   * The orderBy key for this field (as used in URL ?orderBy= param).
   * If undefined, the field is not sortable.
   * May differ from esSearchPath (e.g. "taken" alias, dimension paths).
   */
  sortKey?: string;

  /** If true, the natural first-sort direction is descending. */
  descByDefault?: boolean;

  // -- Display --------------------------------------------------------------

  /** Default column width in pixels. */
  defaultWidth: number;

  /** If true, this column is hidden by default (user can show it). */
  defaultHidden?: boolean;

  /**
   * Custom cell renderer for the table view.
   * Receives the image and returns a ReactNode.
   * If not provided, the table renders `accessor(image) || "—"`.
   */
  cellRenderer?: (image: Image) => ReactNode;

  /**
   * Format the raw value for display (dates, dimensions, MIME types).
   * Used by both table cells and the metadata panel.
   * If not provided, the raw accessor value is shown as-is.
   */
  formatter?: (value: string) => string;

  // -- Type metadata --------------------------------------------------------

  /** ES mapping type — drives sort, aggregation, and search behaviour. */
  fieldType: FieldType;

  /**
   * For list fields (subjects, people, keywords): each item is
   * individually clickable for search. The CQL key applies per-item.
   */
  isList?: boolean;

  /**
   * For composite fields (location): composed of multiple sub-fields,
   * each with its own CQL key. Requires `subFields` to be defined.
   */
  isComposite?: boolean;

  /**
   * Sub-fields for composite fields. Each sub-field has its own CQL key
   * and accessor. Used by location (subLocation, city, state, country).
   */
  subFields?: Array<{
    cqlKey: string;
    accessor: (image: Image) => string | undefined;
  }>;

  // -- Capabilities ---------------------------------------------------------

  /**
   * Whether this field is editable in the metadata panel.
   * Drives the pencil icon and edit mode rendering.
   * Phase 2: all false. Phase 3+: true for editable fields.
   */
  editable?: boolean;

  /**
   * Whether this field supports aggregation (faceted filtering).
   * True for keyword fields, false for text-only fields.
   */
  aggregatable?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy HH:mm");
  } catch {
    return dateStr;
  }
}

/** Read width from orientedDimensions (post-EXIF rotation), falling back to dimensions. */
function getWidth(image: Image): number | undefined {
  return (image.source.orientedDimensions ?? image.source.dimensions)?.width;
}

/** Read height from orientedDimensions (post-EXIF rotation), falling back to dimensions. */
function getHeight(image: Image): number | undefined {
  return (image.source.orientedDimensions ?? image.source.dimensions)?.height;
}

// ---------------------------------------------------------------------------
// Field definitions — the single source of truth
// ---------------------------------------------------------------------------

const HARDCODED_FIELDS: FieldDefinition[] = [
  // -- Rights ---------------------------------------------------------------
  {
    id: "usageRights_category",
    label: "Category",
    group: "rights",
    accessor: (img) => img.usageRights?.category,
    cqlKey: "category",
    esSearchPath: "usageRights.category",
    sortKey: "usageRights.category",
    defaultWidth: 140,
    fieldType: "keyword",
    aggregatable: true,
  },

  // -- Core metadata --------------------------------------------------------
  {
    id: "metadata_imageType",
    label: "Image type",
    group: "core",
    accessor: (img) => img.metadata?.imageType,
    cqlKey: "imageType",
    esSearchPath: "metadata.imageType",
    sortKey: "metadata.imageType",
    defaultWidth: 100,
    fieldType: "keyword",
    aggregatable: true,
  },
  {
    id: "metadata_title",
    label: "Title",
    group: "core",
    accessor: (img) => img.metadata?.title,
    cqlKey: "title",
    esSearchPath: "metadata.title",
    // Not sortable — text field, no .keyword sub-field
    defaultWidth: 250,
    fieldType: "text",
  },
  {
    id: "metadata_description",
    label: "Description",
    group: "core",
    accessor: (img) => img.metadata?.description,
    cqlKey: "description",
    esSearchPath: "metadata.description",
    defaultWidth: 300,
    fieldType: "text",
  },
  {
    id: "metadata_specialInstructions",
    label: "Special instructions",
    group: "core",
    accessor: (img) => img.metadata?.specialInstructions,
    cqlKey: "specialInstructions",
    esSearchPath: "metadata.specialInstructions",
    defaultWidth: 200,
    fieldType: "text",
  },
  {
    id: "metadata_byline",
    label: "By",
    group: "core",
    accessor: (img) => img.metadata?.byline,
    cqlKey: "by",
    esSearchPath: "metadata.byline",
    // Not sortable — text field
    defaultWidth: 150,
    fieldType: "text",
  },
  {
    id: "metadata_credit",
    label: "Credit",
    group: "core",
    accessor: (img) => img.metadata?.credit,
    cqlKey: "credit",
    esSearchPath: "metadata.credit",
    sortKey: "metadata.credit",
    defaultWidth: 120,
    fieldType: "keyword",
    aggregatable: true,
  },
  {
    id: "metadata_copyright",
    label: "Copyright",
    group: "core",
    accessor: (img) => img.metadata?.copyright,
    cqlKey: "copyright",
    esSearchPath: "metadata.copyright",
    defaultWidth: 180,
    fieldType: "text",
  },
  {
    id: "metadata_source",
    label: "Source",
    group: "core",
    accessor: (img) => img.metadata?.source,
    cqlKey: "source",
    esSearchPath: "metadata.source",
    sortKey: "metadata.source",
    defaultWidth: 120,
    fieldType: "keyword",
    aggregatable: true,
  },

  // -- Location (composite) -------------------------------------------------
  {
    id: "location",
    label: "Location",
    group: "location",
    accessor: (img) => {
      const parts = [
        img.metadata?.subLocation,
        img.metadata?.city,
        img.metadata?.state,
        img.metadata?.country,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : undefined;
    },
    // Click-to-search uses per-sub-field keys, not a single key
    defaultWidth: 200,
    fieldType: "composite",
    isComposite: true,
    subFields: [
      { cqlKey: "location", accessor: (img) => img.metadata?.subLocation },
      { cqlKey: "city", accessor: (img) => img.metadata?.city },
      { cqlKey: "state", accessor: (img) => img.metadata?.state },
      { cqlKey: "country", accessor: (img) => img.metadata?.country },
    ],
  },

  // -- Dates ----------------------------------------------------------------
  {
    id: "metadata_dateTaken",
    label: "Taken on",
    group: "dates",
    accessor: (img) => img.metadata?.dateTaken,
    rawValue: (img) => img.metadata?.dateTaken,
    formatter: formatDate,
    sortKey: "taken",
    descByDefault: true,
    defaultWidth: 150,
    fieldType: "date",
  },
  {
    id: "uploadTime",
    label: "Uploaded",
    group: "dates",
    accessor: (img) => img.uploadTime,
    rawValue: (img) => img.uploadTime,
    formatter: formatDate,
    sortKey: "uploadTime",
    descByDefault: true,
    defaultWidth: 150,
    fieldType: "date",
  },
  {
    id: "lastModified",
    label: "Last modified",
    group: "dates",
    accessor: (img) => img.lastModified,
    rawValue: (img) => img.lastModified,
    formatter: formatDate,
    sortKey: "lastModified",
    descByDefault: true,
    defaultWidth: 150,
    defaultHidden: true,
    fieldType: "date",
  },

  // -- Upload info ----------------------------------------------------------
  {
    id: "uploadedBy",
    label: "Uploader",
    group: "upload",
    accessor: (img) => img.uploadedBy,
    cqlKey: "uploader",
    esSearchPath: "uploadedBy",
    sortKey: "uploadedBy",
    defaultWidth: 150,
    fieldType: "keyword",
    aggregatable: true,
  },
  {
    id: "uploadInfo_filename",
    label: "Filename",
    group: "upload",
    accessor: (img) => img.uploadInfo?.filename,
    cqlKey: "filename",
    esSearchPath: "uploadInfo.filename",
    sortKey: "uploadInfo.filename",
    defaultWidth: 180,
    fieldType: "keyword",
  },

  // -- Lists ----------------------------------------------------------------
  {
    id: "subjects",
    label: "Subjects",
    group: "core",
    accessor: (img) => img.metadata?.subjects,
    rawValue: (img) => img.metadata?.subjects?.join(", "),
    cqlKey: "subject",
    esSearchPath: "metadata.subjects",
    defaultWidth: 200,
    fieldType: "list",
    isList: true,
  },
  {
    id: "people",
    label: "People",
    group: "core",
    accessor: (img) => img.metadata?.peopleInImage,
    rawValue: (img) => img.metadata?.peopleInImage?.join(", "),
    cqlKey: "person",
    esSearchPath: "metadata.peopleInImage",
    defaultWidth: 200,
    fieldType: "list",
    isList: true,
  },

  // -- Technical ------------------------------------------------------------
  {
    id: "width",
    label: "Width",
    group: "technical",
    accessor: (img) => {
      const w = getWidth(img);
      return w !== undefined ? String(w) : undefined;
    },
    formatter: (v) => Number(v).toLocaleString(),
    sortKey: "source.dimensions.width",
    defaultWidth: 70,
    defaultHidden: true,
    fieldType: "integer",
  },
  {
    id: "height",
    label: "Height",
    group: "technical",
    accessor: (img) => {
      const h = getHeight(img);
      return h !== undefined ? String(h) : undefined;
    },
    formatter: (v) => Number(v).toLocaleString(),
    sortKey: "source.dimensions.height",
    defaultWidth: 70,
    defaultHidden: true,
    fieldType: "integer",
  },
  {
    id: "source_mimeType",
    label: "File type",
    group: "technical",
    accessor: (img) => img.source?.mimeType,
    rawValue: (img) => {
      const mime = img.source?.mimeType;
      return mime ? mime.replace("image/", "") : undefined;
    },
    cqlKey: "fileType",
    esSearchPath: "source.mimeType",
    sortKey: "source.mimeType",
    formatter: (v) => v.replace("image/", ""),
    defaultWidth: 90,
    defaultHidden: true,
    fieldType: "keyword",
    aggregatable: true,
  },
  {
    id: "metadata_suppliersReference",
    label: "Suppliers reference",
    group: "core",
    accessor: (img) => img.metadata?.suppliersReference,
    cqlKey: "suppliersReference",
    esSearchPath: "metadata.suppliersReference",
    defaultWidth: 150,
    defaultHidden: true,
    fieldType: "text",
  },
  {
    id: "metadata_bylineTitle",
    label: "Byline title",
    group: "core",
    accessor: (img) => img.metadata?.bylineTitle,
    cqlKey: "bylineTitle",
    esSearchPath: "metadata.bylineTitle",
    defaultWidth: 150,
    defaultHidden: true,
    fieldType: "text",
  },
];

// ---------------------------------------------------------------------------
// Config-driven alias fields — generated from grid-config.ts
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-separated ES path against an image document.
 * e.g. "fileMetadata.iptc.Edit Status" → image.fileMetadata?.iptc?.["Edit Status"]
 */
function resolveEsPath(image: Image, esPath: string): string | undefined {
  const parts = esPath.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = image;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current != null ? String(current) : undefined;
}

const ALIAS_FIELDS: FieldDefinition[] = gridConfig.fieldAliases
  .filter((a) => a.displayInAdditionalMetadata)
  .map((a) => ({
    id: `alias_${a.alias}`,
    label: a.label,
    group: "alias" as FieldGroup,
    accessor: (img: Image) => resolveEsPath(img, a.elasticsearchPath),
    cqlKey: a.alias,
    esSearchPath: a.elasticsearchPath,
    sortKey: a.elasticsearchPath, // alias fields are all keyword → sortable
    defaultWidth: 120,
    defaultHidden: true,
    fieldType: "keyword" as FieldType,
    aggregatable: true,
  }));

// ---------------------------------------------------------------------------
// The Registry — all fields, ordered
// ---------------------------------------------------------------------------

/** All field definitions, in display order. */
export const FIELD_REGISTRY: readonly FieldDefinition[] = [
  ...HARDCODED_FIELDS,
  ...ALIAS_FIELDS,
];

// ---------------------------------------------------------------------------
// Derived lookup maps — built once from the registry
// ---------------------------------------------------------------------------

/** Field by ID — O(1) lookup. */
export const FIELDS_BY_ID: ReadonlyMap<string, FieldDefinition> = new Map(
  FIELD_REGISTRY.map((f) => [f.id, f])
);

/** CQL key → field definition (for fields with click-to-search). */
export const FIELDS_BY_CQL_KEY: ReadonlyMap<string, FieldDefinition> = new Map(
  FIELD_REGISTRY
    .filter((f) => f.cqlKey != null)
    .map((f) => [f.cqlKey!, f])
);

/** Column ID → CQL key map (replaces COLUMN_CQL_KEYS in ImageTable). */
export const COLUMN_CQL_KEYS: Readonly<Record<string, string>> =
  Object.fromEntries(
    FIELD_REGISTRY
      .filter((f) => f.cqlKey != null)
      .map((f) => [f.id, f.cqlKey!])
  );

/** Column ID → orderBy key (replaces sortableFields in ImageTable). */
export const SORTABLE_FIELDS: Readonly<Record<string, string>> =
  Object.fromEntries(
    FIELD_REGISTRY
      .filter((f) => f.sortKey != null)
      .map((f) => [f.id, f.sortKey!])
  );

/** Set of orderBy keys that default to descending. */
export const DESC_BY_DEFAULT: ReadonlySet<string> = new Set(
  FIELD_REGISTRY
    .filter((f) => f.descByDefault)
    .map((f) => f.sortKey!)
);

/** Default hidden column IDs. */
export const DEFAULT_HIDDEN_COLUMNS: readonly string[] = FIELD_REGISTRY
  .filter((f) => f.defaultHidden)
  .map((f) => f.id);

/** Sortable fields for the dropdown (label + orderBy key). */
export const SORT_DROPDOWN_OPTIONS: readonly { label: string; value: string }[] =
  FIELD_REGISTRY
    .filter((f) => f.sortKey != null)
    // Only include fields useful in the sort dropdown (not every sortable column)
    .filter((f) => ["dates", "core", "upload", "rights", "technical"].includes(f.group))
    // Dates first, then alphabetical
    .sort((a, b) => {
      if (a.group === "dates" && b.group !== "dates") return -1;
      if (a.group !== "dates" && b.group === "dates") return 1;
      return a.label.localeCompare(b.label);
    })
    .map((f) => ({ label: f.label, value: f.sortKey! }));

/**
 * Get the raw string value from any field for a given image.
 * Replaces getRawCellValue() switch statement in ImageTable.
 */
export function getFieldRawValue(fieldId: string, image: Image): string | undefined {
  const field = FIELDS_BY_ID.get(fieldId);
  if (!field) return undefined;

  // Use rawValue if available (for formatted fields like dates)
  if (field.rawValue) return field.rawValue(image);

  // For list fields, join with ", "
  const value = field.accessor(image);
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

/**
 * Get the formatted display value for a field.
 * Applies formatter if defined, falls back to raw value.
 */
export function getFieldDisplayValue(fieldId: string, image: Image): string {
  const field = FIELDS_BY_ID.get(fieldId);
  if (!field) return "—";

  const raw = field.accessor(image);
  if (raw == null) return "—";

  if (Array.isArray(raw)) return raw.join(", ");

  if (field.formatter) return field.formatter(raw);
  return raw;
}

