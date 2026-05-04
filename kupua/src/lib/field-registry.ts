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
type FieldType = "keyword" | "text" | "date" | "integer" | "composite" | "list";

/** Where in the UI this field appears by default. */
type FieldGroup =
  | "core"           // always-relevant fields (credit, byline, description)
  | "dates"          // date/time fields
  | "editorial"      // user-supplied metadata (labels, photoshoot)
  | "technical"      // dimensions, file type, colour model, filename
  | "rights"         // usage rights, category
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

  // -- Detail panel ---------------------------------------------------------

  /**
   * Layout hint for the metadata/details panel.
   * "stacked" = label above value (for long text: title, description, etc.)
   * "inline"  = label left 30%, value right 70% (default for most fields)
   */
  detailLayout?: "stacked" | "inline";

  /**
   * If true, this field is excluded from the details/metadata panel.
   * Used for fields that are redundant there (e.g. Width/Height when
   * Dimensions is shown, or fields only meaningful as table columns).
   */
  detailHidden?: boolean;

  /**
   * Override `group` for detail panel section breaks only.
   * When set, the detail panel uses this value instead of `group` to
   * decide where to insert section dividers. The main `group` still
   * controls sort-dropdown inclusion and other non-detail concerns.
   */
  detailGroup?: string;

  /**
   * When explicitly false, the detail panel renders this field as plain
   * text even if it has a cqlKey. Useful for long-text fields where
   * click-to-search doesn't make sense (Description, Special instructions).
   * Defaults to true when cqlKey is present.
   */
  detailClickable?: boolean;

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

  /**
   * Visual variant for pill rendering. "accent" uses bg-grid-accent
   * (Guardian blue) instead of the default grey. Used for labels.
   */
  pillVariant?: "default" | "accent";

  // -- Multi-select (S4) ----------------------------------------------------

  /**
   * How this field behaves in the multi-image selection panel (count >= 2).
   *
   * - "reconcile"       scalar: show value if all-same, "Multiple Xs" if mixed.
   * - "chip-array"      list: show union of chips; full = on all images, partial = on some.
   * - "always-suppress" never shown in multi-select (IDs, filenames, dates, dimensions).
   * - "show-if-all-same" only shown when all selected images share the same value.
   * - "summary-only"    shows a computed summary line; no per-image value display.
   *
   * Undefined means the field is not yet classified (not shown in multi-select panel).
   * Fields absent from RECONCILE_FIELDS are skipped by the reconciliation engine.
   */
  multiSelectBehaviour?: "reconcile" | "chip-array" | "always-suppress" | "show-if-all-same" | "summary-only";

  /**
   * Whether to show the row in the multi-select panel when the field value
   * is empty across all selected images. Only meaningful for "reconcile" fields.
   * true = always show (important-empty signal); false = hide when empty.
   */
  showWhenEmpty?: boolean;

  /**
   * Predicate controlling whether this field renders in the multi-select panel.
   * Used for config-gated fields (e.g. metadata_imageType only renders when
   * gridConfig.imageTypes is non-empty).
   */
  visibleWhen?: () => boolean;

  /**
   * For "summary-only" fields: computes the display line from all selected images.
   * Called after metadata is hydrated for the full selection.
   * (No production caller in S4; leases will use this in the field-parity session.)
   */
  summariser?: (images: Image[]) => string;
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

function formatFileSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    sortKey: "category",
    defaultWidth: 140,
    fieldType: "keyword",
    aggregatable: true,
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: false,
  },

  // -- Core metadata --------------------------------------------------------
  {
    id: "metadata_imageType",
    label: "Image type",
    group: "core",
    accessor: (img) => img.metadata?.imageType,
    cqlKey: "imageType",
    esSearchPath: "metadata.imageType",
    sortKey: "imageType",
    detailGroup: "imageType", // Own section in detail panel
    defaultWidth: 100,
    fieldType: "keyword",
    aggregatable: true,
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: false,
    // S4: only render when gridConfig.imageTypes is configured (Kahuna parity -- decided 2026-05-02)
    visibleWhen: () => (gridConfig.imageTypes?.length ?? 0) > 0,
  },
  {
    id: "metadata_title",
    label: "Title",
    group: "core",
    accessor: (img) => img.metadata?.title,
    cqlKey: "title",
    esSearchPath: "metadata.title",
    detailLayout: "stacked",
    // Not sortable -- text field, no .keyword sub-field
    defaultWidth: 250,
    fieldType: "text",
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: true,
  },
  {
    id: "metadata_description",
    label: "Description",
    group: "core",
    accessor: (img) => img.metadata?.description,
    cqlKey: "description",
    esSearchPath: "metadata.description",
    detailLayout: "stacked",
    detailClickable: false,
    defaultWidth: 300,
    fieldType: "text",
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: true,
  },
  {
    id: "metadata_specialInstructions",
    label: "Special instructions",
    group: "core",
    accessor: (img) => img.metadata?.specialInstructions,
    cqlKey: "specialInstructions",
    esSearchPath: "metadata.specialInstructions",
    detailLayout: "stacked",
    detailClickable: false,
    detailGroup: "specialInstructions",
    defaultWidth: 200,
    fieldType: "text",
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: true,
  },
  {
    id: "metadata_byline",
    label: "By",
    group: "core",
    accessor: (img) => img.metadata?.byline,
    cqlKey: "by",
    esSearchPath: "metadata.byline",
    // Not sortable -- text field
    defaultWidth: 150,
    fieldType: "text",
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: true,
  },
  {
    id: "metadata_credit",
    label: "Credit",
    group: "core",
    accessor: (img) => img.metadata?.credit,
    cqlKey: "credit",
    esSearchPath: "metadata.credit",
    sortKey: "credit",
    defaultWidth: 120,
    fieldType: "keyword",
    aggregatable: true,
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: true,
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
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: false,
  },
  {
    id: "metadata_source",
    label: "Source",
    group: "core",
    accessor: (img) => img.metadata?.source,
    cqlKey: "source",
    esSearchPath: "metadata.source",
    sortKey: "source",
    defaultWidth: 120,
    fieldType: "keyword",
    aggregatable: true,
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: false,
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
    detailGroup: "core", // No section break -- continues from Source
    defaultWidth: 200,
    fieldType: "composite",
    isComposite: true,
    subFields: [
      { cqlKey: "location", accessor: (img) => img.metadata?.subLocation },
      { cqlKey: "city", accessor: (img) => img.metadata?.city },
      { cqlKey: "state", accessor: (img) => img.metadata?.state },
      { cqlKey: "country", accessor: (img) => img.metadata?.country },
    ],
    // Multi-select: suppressed -- the 4 location_* sub-field entries below
    // handle per-segment reconciliation independently.
    multiSelectBehaviour: "always-suppress",
  },

  // -- Location sub-fields (multi-select reconciliation only) ---------------
  // These are NOT shown in the single-image detail panel (detailHidden: true).
  // In multi-select, each segment is reconciled independently and grouped
  // under a "Location" section. Kahuna shows "(Multiple cities)" for mixed.
  {
    id: "location_subLocation",
    label: "Sublocation",
    group: "location",
    detailGroup: "core",
    accessor: (img) => img.metadata?.subLocation,
    cqlKey: "location",
    esSearchPath: "metadata.subLocation",
    defaultWidth: 150,
    defaultHidden: true,
    detailHidden: true,
    fieldType: "keyword",
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: false,
  },
  {
    id: "location_city",
    label: "City",
    group: "location",
    detailGroup: "core",
    accessor: (img) => img.metadata?.city,
    cqlKey: "city",
    esSearchPath: "metadata.city",
    defaultWidth: 150,
    defaultHidden: true,
    detailHidden: true,
    fieldType: "keyword",
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: false,
  },
  {
    id: "location_state",
    label: "State",
    group: "location",
    detailGroup: "core",
    accessor: (img) => img.metadata?.state,
    cqlKey: "state",
    esSearchPath: "metadata.state",
    defaultWidth: 150,
    defaultHidden: true,
    detailHidden: true,
    fieldType: "keyword",
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: false,
  },
  {
    id: "location_country",
    label: "Country",
    group: "location",
    detailGroup: "core",
    accessor: (img) => img.metadata?.country,
    cqlKey: "country",
    esSearchPath: "metadata.country",
    defaultWidth: 150,
    defaultHidden: true,
    detailHidden: true,
    fieldType: "keyword",
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: false,
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
    detailGroup: "core", // No section break -- continues from Location
    descByDefault: true,
    defaultWidth: 150,
    fieldType: "date",
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: true,
  },
  {
    id: "uploadTime",
    label: "Uploaded",
    group: "dates",
    accessor: (img) => img.uploadTime,
    rawValue: (img) => img.uploadTime,
    formatter: formatDate,
    sortKey: "uploadTime",
    detailGroup: "core", // No section break -- continues from Taken on
    descByDefault: true,
    defaultWidth: 150,
    fieldType: "date",
    multiSelectBehaviour: "always-suppress",
  },
  {
    id: "lastModified",
    label: "Last modified",
    group: "dates",
    accessor: (img) => img.lastModified,
    rawValue: (img) => img.lastModified,
    formatter: formatDate,
    sortKey: "lastModified",
    detailGroup: "core", // No section break -- continues from Uploaded
    descByDefault: true,
    defaultWidth: 150,
    defaultHidden: true,
    fieldType: "date",
    multiSelectBehaviour: "always-suppress",
  },

  {
    id: "uploadedBy",
    label: "Uploader",
    group: "core",
    accessor: (img) => img.uploadedBy,
    cqlKey: "uploader",
    esSearchPath: "uploadedBy",
    sortKey: "uploadedBy",
    detailGroup: "core", // Same section as dates above
    defaultWidth: 150,
    fieldType: "keyword",
    aggregatable: true,
    multiSelectBehaviour: "show-if-all-same",
    showWhenEmpty: false,
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
    aggregatable: true,
    multiSelectBehaviour: "chip-array",
    showWhenEmpty: false,
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
    multiSelectBehaviour: "chip-array",
    showWhenEmpty: false,
  },
  {
    id: "metadata_suppliersReference",
    label: "Suppliers reference",
    group: "core",
    accessor: (img) => img.metadata?.suppliersReference,
    cqlKey: "suppliersReference",
    esSearchPath: "metadata.suppliersReference",
    detailGroup: "extended", // Section break after People
    defaultWidth: 150,
    defaultHidden: true,
    fieldType: "text",
    // always-suppress in multi-select: supplier reference is an ID;
    // coincidental matches across a selection are supplier error, not signal.
    // (decided 2026-05-02 -- see deviations.md §29)
    multiSelectBehaviour: "always-suppress",
  },
  {
    id: "metadata_bylineTitle",
    label: "Byline title",
    group: "core",
    accessor: (img) => img.metadata?.bylineTitle,
    cqlKey: "bylineTitle",
    esSearchPath: "metadata.bylineTitle",
    detailGroup: "extended",
    defaultWidth: 150,
    defaultHidden: true,
    fieldType: "text",
    multiSelectBehaviour: "reconcile",
    showWhenEmpty: false,
  },

  // -- Editorial (user-supplied) --------------------------------------------
  {
    id: "labels",
    label: "Labels",
    group: "editorial",
    accessor: (img) => img.userMetadata?.labels,
    rawValue: (img) => img.userMetadata?.labels?.join(", "),
    cqlKey: "label",
    esSearchPath: "userMetadata.labels",
    detailLayout: "stacked",
    detailGroup: "editorial", // Own section before keywords
    defaultWidth: 200,
    fieldType: "list",
    isList: true,
    aggregatable: true,
    multiSelectBehaviour: "chip-array",
    showWhenEmpty: false,
    pillVariant: "accent",
  },

  // -- Keywords -------------------------------------------------------------
  {
    id: "keywords",
    label: "Keywords",
    group: "core",
    accessor: (img) => img.metadata?.keywords,
    rawValue: (img) => img.metadata?.keywords?.join(", "),
    cqlKey: "keyword",
    esSearchPath: "metadata.keywords",
    detailLayout: "stacked",
    detailGroup: "keywords", // Own section in detail panel
    defaultWidth: 250,
    defaultHidden: true,
    fieldType: "list",
    isList: true,
    aggregatable: true,
    multiSelectBehaviour: "chip-array",
    showWhenEmpty: false,
  },

  // -- Technical ------------------------------------------------------------
  {
    id: "dimensions",
    label: "Dimensions",
    group: "technical",
    accessor: (img) => {
      const w = getWidth(img);
      const h = getHeight(img);
      if (w === undefined || h === undefined) return undefined;
      return `${w.toLocaleString()} × ${h.toLocaleString()}`;
    },
    // Display-only -- not sortable. Use Width / Height columns instead.
    defaultWidth: 120,
    fieldType: "integer",
    // always-suppress: W x H composite is not useful across a selection.
    multiSelectBehaviour: "always-suppress",
  },
  {
    id: "source_width",
    label: "Width",
    group: "technical",
    accessor: (img) => {
      const w = getWidth(img);
      return w != null ? w.toLocaleString() : undefined;
    },
    rawValue: (img) => {
      const w = getWidth(img);
      return w != null ? String(w) : undefined;
    },
    sortKey: "width",
    descByDefault: true,
    defaultWidth: 80,
    detailHidden: true, // Redundant -- Dimensions shown instead
    fieldType: "integer",
    multiSelectBehaviour: "always-suppress",
  },
  {
    id: "source_height",
    label: "Height",
    group: "technical",
    accessor: (img) => {
      const h = getHeight(img);
      return h != null ? h.toLocaleString() : undefined;
    },
    rawValue: (img) => {
      const h = getHeight(img);
      return h != null ? String(h) : undefined;
    },
    sortKey: "height",
    descByDefault: true,
    defaultWidth: 80,
    detailHidden: true, // Redundant -- Dimensions shown instead
    fieldType: "integer",
    multiSelectBehaviour: "always-suppress",
  },
  {
    id: "source_size",
    label: "File size",
    group: "technical",
    accessor: (img) => {
      const size = img.source?.size;
      return size != null ? formatFileSize(size) : undefined;
    },
    rawValue: (img) => {
      const size = img.source?.size;
      return size != null ? String(size) : undefined;
    },
    defaultWidth: 90,
    defaultHidden: true, // Only shown in details panel
    detailHidden: false,
    fieldType: "integer",
    multiSelectBehaviour: "always-suppress",
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
    sortKey: "mimeType",
    formatter: (v) => v.replace("image/", ""),
    defaultWidth: 90,
    defaultHidden: true,
    fieldType: "keyword",
    aggregatable: true,
    multiSelectBehaviour: "show-if-all-same",
    showWhenEmpty: false,
  },
  {
    id: "uploadInfo_filename",
    label: "Filename",
    group: "technical",
    accessor: (img) => img.uploadInfo?.filename,
    cqlKey: "filename",
    esSearchPath: "uploadInfo.filename",
    detailClickable: false,
    defaultWidth: 180,
    fieldType: "keyword",
    // always-suppress: filenames are de-facto unique per image; coincidental
    // matches across a selection are not useful signal. (decided 2026-05-02)
    multiSelectBehaviour: "always-suppress",
  },
  {
    id: "imageId",
    label: "Image ID",
    group: "technical",
    accessor: (img) => img.id,
    defaultWidth: 280,
    defaultHidden: true, // Only shown in details panel
    detailHidden: false,
    fieldType: "keyword",
    multiSelectBehaviour: "always-suppress",
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
    sortKey: a.alias, // alias fields are all keyword -- sortable; URL uses short alias
    detailGroup: "extended", // Merge with Byline title's section in detail panel
    defaultWidth: 120,
    defaultHidden: true,
    fieldType: "keyword" as FieldType,
    aggregatable: true,
    // Alias fields: uniformly reconcile in multi-select (deviation from Kahuna which
    // suppresses alias fields in multi-select entirely). See deviations.md §28.
    multiSelectBehaviour: "reconcile" as const,
    showWhenEmpty: false,
  }));

// ---------------------------------------------------------------------------
// The Registry — all fields, ordered
// ---------------------------------------------------------------------------

/** All field definitions, in display order.
 *  Alias fields are spliced in after Byline title so they appear in the
 *  correct position in the detail panel (same section as core metadata). */
export const FIELD_REGISTRY: readonly FieldDefinition[] = (() => {
  const spliceIdx = HARDCODED_FIELDS.findIndex((f) => f.id === "metadata_bylineTitle");
  if (spliceIdx === -1) return [...HARDCODED_FIELDS, ...ALIAS_FIELDS];
  return [
    ...HARDCODED_FIELDS.slice(0, spliceIdx + 1),
    ...ALIAS_FIELDS,
    ...HARDCODED_FIELDS.slice(spliceIdx + 1),
  ];
})();

// ---------------------------------------------------------------------------
// Derived lookup maps -- built once from the registry
// ---------------------------------------------------------------------------

/** Field by ID -- O(1) lookup. */
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

/** Sortable fields for the dropdown (label + orderBy key), in registry order.
 *  Dates are promoted to the top in a fixed order: Uploaded → Taken → Modified. */
export const SORT_DROPDOWN_OPTIONS: readonly { label: string; value: string }[] = (() => {
  const sortable = FIELD_REGISTRY
    .filter((f) => f.sortKey != null)
    .filter((f) => ["dates", "core", "rights", "technical"].includes(f.group));
  const dates = sortable.filter((f) => f.group === "dates");
  const rest = sortable.filter((f) => f.group !== "dates");
  // Dates in explicit order: Uploaded, Taken on, Last modified
  const DATE_ORDER = ["uploadTime", "taken", "lastModified"];
  dates.sort((a, b) => DATE_ORDER.indexOf(a.sortKey!) - DATE_ORDER.indexOf(b.sortKey!));
  return [...dates, ...rest].map((f) => ({ label: f.label, value: f.sortKey! }));
})();

/** Fields shown in the details/metadata panel, in display order.
 *  Excludes fields with detailHidden: true. Includes alias fields. */
export const DETAIL_PANEL_FIELDS: readonly FieldDefinition[] = FIELD_REGISTRY
  .filter((f) => !f.detailHidden);

/**
 * Fields that participate in multi-image reconciliation.
 * Excludes:
 *   - Fields with multiSelectBehaviour "always-suppress" (IDs, filenames,
 *     dimensions, upload dates -- not meaningful across a selection).
 *   - Fields without multiSelectBehaviour (not yet classified).
 * Used by selection-store.ts (reconciliation engine) and MultiImageMetadata
 * (renderer). Both must use the same field list for consistency.
 */
export const RECONCILE_FIELDS: readonly FieldDefinition[] = FIELD_REGISTRY.filter(
  (f) => f.multiSelectBehaviour !== undefined && f.multiSelectBehaviour !== "always-suppress",
);

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

