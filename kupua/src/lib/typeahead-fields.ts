/**
 * Typeahead field resolvers for the CQL chip input.
 *
 * Dynamic resolvers use `ImageDataSource.getAggregation()` — a terms
 * aggregation on the keyword field, ranked by prevalence.  Results appear
 * immediately when the user types `:` and filter as they type further.
 *
 * Static resolvers (is, fileType, subject) use hardcoded lists — same as kahuna.
 *
 * Text-analysed fields (byline, city, description, etc.) currently have no
 * value suggestions — same as kahuna.  A better approach (e.g. keyword
 * sub-fields or completion suggesters) will be added later.
 */

import type {
  ImageDataSource,
  AggregationBucket,
  AggregationResult,
  AggregationsResult,
  SearchParams,
} from "@/dal/types";
import { gridConfig } from "./grid-config";
import { FIELDS_BY_CQL_KEY } from "./field-registry";

// ---------------------------------------------------------------------------
// Types matching @guardian/cql's TypeaheadField expectations
// ---------------------------------------------------------------------------

export interface TypeaheadSuggestion {
  value: string;
  count?: number;
}

export interface TypeaheadFieldDef {
  fieldName: string;
  resolver?: ((value: string) => Promise<TypeaheadSuggestion[]>) | string[];
  /** If false, the field won't appear in key suggestions but its value
   *  resolver still fires when the user types the key manually.
   *  Defaults to true when omitted. */
  showInKeySuggestions?: boolean;
}

// ---------------------------------------------------------------------------
// Static data — same lists kahuna uses
// ---------------------------------------------------------------------------

const SUBJECTS = [
  "arts", "crime", "disaster", "finance", "education", "environment",
  "health", "human", "labour", "lifestyle", "nature", "news", "politics",
  "religion", "science", "social", "sport", "war", "weather",
];

const FILE_TYPES = ["jpeg", "tiff", "png"];

const USAGE_PLATFORMS = ["print", "digital", "download"];

function buildIsOptions(): string[] {
  const org = gridConfig.staffPhotographerOrganisation;
  const options = [
    `${org}-owned-photo`,
    `${org}-owned-illustration`,
    `${org}-owned`,
    "under-quota",
    "deleted",
  ];
  if (gridConfig.useReaper) options.push("reapable");
  if (gridConfig.hasAgencyPicks) options.push("agency-pick");
  return options;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prefixFilter(prefix: string, values: string[]): string[] {
  const lower = prefix.toLowerCase();
  return values.filter((v) => v.toLowerCase().startsWith(lower));
}

/** Filter ES aggregation buckets by prefix, preserving counts. */
function bucketFilter(
  prefix: string,
  buckets: AggregationBucket[],
): TypeaheadSuggestion[] {
  const lower = prefix.toLowerCase();
  return buckets
    .filter((b) => b.key !== "" && b.key.toLowerCase().startsWith(lower))
    .map((b) => ({ value: b.key, count: b.count }));
}

/** Merge a static value list with optional store-cached agg counts.
 *  `mapBucketKey` transforms the ES bucket key to match the static value
 *  (e.g. strip "image/" prefix from MIME types). */
function mergeWithCounts(
  prefix: string,
  values: string[],
  buckets?: AggregationBucket[],
  mapBucketKey?: (key: string) => string,
): TypeaheadSuggestion[] {
  const countMap = buckets
    ? new Map(buckets.map((b) => [mapBucketKey ? mapBucketKey(b.key) : b.key, b.count]))
    : undefined;
  const suggestions = prefixFilter(prefix, values).map((v) => ({
    value: v,
    count: countMap?.get(v),
  }));
  // Sort by volume (descending) when counts are available, matching
  // the order ES returns for dynamic aggregation fields.
  // Items without counts sink to the bottom in alphabetical order.
  if (countMap) {
    suggestions.sort((a, b) =>
      a.count != null && b.count != null ? b.count - a.count
      : a.count != null ? -1
      : b.count != null ? 1
      : a.value.localeCompare(b.value)
    );
  }
  return suggestions;
}

/**
 * Look up pre-cached agg buckets from the search store by CQL field name.
 * Returns undefined when the store has no data for this field (e.g. Filters
 * panel hasn't been opened, or the field isn't in the store's agg set).
 */
function storeBuckets(
  cqlKey: string,
  getAggregations?: () => AggregationsResult | null,
): AggregationBucket[] | undefined {
  if (!getAggregations) return undefined;
  const fd = FIELDS_BY_CQL_KEY.get(cqlKey);
  const esPath = fd?.esSearchPath;
  if (!esPath || typeof esPath !== "string") return undefined;
  return getAggregations()?.fields[esPath]?.buckets;
}

// ---------------------------------------------------------------------------
// Build the typeahead field list
//
// This mirrors kahuna's query-suggestions.ts but uses the DAL interface
// so it works against any ES — mock or real.
// ---------------------------------------------------------------------------

export function buildTypeaheadFields(
  dataSource: ImageDataSource,
  getAggregations?: () => AggregationsResult | null,
  getParams?: () => SearchParams,
): TypeaheadFieldDef[] {
  /** Fetch a single field's agg scoped to the current query.
   *  Uses getAggregations (batched endpoint with buildQuery) so the
   *  buckets reflect the user's current search — not the whole index. */
  async function scopedAgg(field: string, size: number = 50): Promise<AggregationResult> {
    const params = getParams?.();
    if (params) {
      const result = await dataSource.getAggregations(params, [{ field, size }]);
      return result.fields[field] ?? { buckets: [], total: 0 };
    }
    // No params callback — fall back to unscoped (match_all)
    return dataSource.getAggregation(field, undefined, size);
  }

  const isOptions = buildIsOptions();

  // Field aliases from config that have search hints.
  // displaySearchHint controls whether the key appears in key suggestions;
  // value suggestions are always available when the user types the key.
  // Counts come from the store's agg cache first; falls back to a direct
  // ES agg on fa.elasticsearchPath. Because both paths come from config,
  // switching from mocked to real config requires zero code changes.
  const aliasFields: TypeaheadFieldDef[] = gridConfig.fieldAliases
    .filter((fa) => fa.searchHintOptions?.length)
    .map((fa) => ({
      fieldName: fa.alias,
      resolver: async (value: string) => {
        const cached = storeBuckets(fa.alias, getAggregations);
        if (cached) {
          return mergeWithCounts(value, fa.searchHintOptions!, cached);
        }
        const { buckets } = await scopedAgg(fa.elasticsearchPath);
        return mergeWithCounts(value, fa.searchHintOptions!, buckets);
      },
      showInKeySuggestions: fa.displaySearchHint,
    }));

  const fields: TypeaheadFieldDef[] = [
    // --- Dynamic resolvers ---
    // Each checks the search store's aggregation cache first (query-scoped,
    // shared with the Filters panel, no extra ES call). Falls back to an
    // independent ES call when the store has no data for this field.
    {
      fieldName: "category",
      resolver: async (value: string) => {
        const cached = storeBuckets("category", getAggregations);
        if (cached) return bucketFilter(value, cached);
        const { buckets } = await scopedAgg("usageRights.category");
        return bucketFilter(value, buckets);
      },
    },
    {
      fieldName: "credit",
      resolver: async (value: string) => {
        const cached = storeBuckets("credit", getAggregations);
        if (cached) return bucketFilter(value, cached);
        const { buckets } = await scopedAgg("metadata.credit");
        return bucketFilter(value, buckets);
      },
    },
    {
      fieldName: "label",
      resolver: async (value: string) => {
        const cached = storeBuckets("label", getAggregations);
        if (cached) return bucketFilter(value, cached);
        const { buckets } = await scopedAgg("userMetadata.labels");
        return bucketFilter(value, buckets);
      },
    },
    {
      fieldName: "photoshoot",
      resolver: async (value: string) => {
        const cached = storeBuckets("photoshoot", getAggregations);
        if (cached) return bucketFilter(value, cached);
        const { buckets } = await scopedAgg("userMetadata.photoshoot.title");
        return bucketFilter(value, buckets);
      },
    },
    {
      fieldName: "source",
      resolver: async (value: string) => {
        const cached = storeBuckets("source", getAggregations);
        if (cached) return bucketFilter(value, cached);
        const { buckets } = await scopedAgg("metadata.source");
        return bucketFilter(value, buckets);
      },
    },
    {
      fieldName: "supplier",
      resolver: async (value: string) => {
        const cached = storeBuckets("supplier", getAggregations);
        if (cached) return bucketFilter(value, cached);
        const { buckets } = await scopedAgg("usageRights.supplier");
        return bucketFilter(value, buckets);
      },
    },

    // --- Static resolvers ---
    // Canonical value list, enriched with query-scoped counts from the
    // store cache first, falling back to a direct ES agg.
    {
      fieldName: "fileType",
      resolver: async (value: string) => {
        const cached = storeBuckets("fileType", getAggregations);
        if (cached) {
          return mergeWithCounts(value, FILE_TYPES, cached, (k) => k.replace("image/", ""));
        }
        const { buckets } = await scopedAgg("source.mimeType");
        return mergeWithCounts(value, FILE_TYPES, buckets, (k) => k.replace("image/", ""));
      },
    },
    {
      fieldName: "is",
      resolver: isOptions,  // synthetic field — no counts possible
    },
    {
      fieldName: "subject",
      resolver: async (value: string) => {
        const cached = storeBuckets("subject", getAggregations);
        if (cached) return mergeWithCounts(value, SUBJECTS, cached);
        const { buckets } = await scopedAgg("metadata.subjects");
        return mergeWithCounts(value, SUBJECTS, buckets);
      },
    },
    {
      fieldName: "usages@status",
      resolver: ["published", "pending", "removed"],
    },
    {
      fieldName: "usages@platform",
      resolver: USAGE_PLATFORMS,
    },

    {
      fieldName: "uploader",
      resolver: async (value: string) => {
        const cached = storeBuckets("uploader", getAggregations);
        if (cached) return bucketFilter(value, cached);
        const { buckets } = await scopedAgg("uploadedBy");
        return bucketFilter(value, buckets);
      },
    },

    // --- Keyword-field resolvers (terms aggregation) ---
    {
      fieldName: "croppedBy",
      resolver: async (value: string) => {
        const cached = storeBuckets("croppedBy", getAggregations);
        if (cached) return bucketFilter(value, cached);
        const { buckets } = await scopedAgg("exports.author");
        return bucketFilter(value, buckets);
      },
    },
    {
      fieldName: "filename",
      // No resolver — filenames are nearly always unique so aggregation is pointless
    },
    {
      fieldName: "keyword",
      resolver: async (value: string) => {
        const cached = storeBuckets("keyword", getAggregations);
        if (cached) return bucketFilter(value, cached);
        const { buckets } = await scopedAgg("metadata.keywords");
        return bucketFilter(value, buckets);
      },
    },
    {
      fieldName: "leasedBy",
      // No resolver for now — leasedBy is inside a nested object and the
      // field is a keyword, so a standard top-level terms agg won't work.
    },

    // --- Text-analysed fields (no value suggestions) ---
    // These are standardAnalysed or sStemmerAnalysed in the ES mapping.
    // No resolver for now — same as kahuna.  A better approach will be
    // added later.
    { fieldName: "by" },
    { fieldName: "city" },
    { fieldName: "copyright" },
    { fieldName: "country" },
    { fieldName: "description" },
    { fieldName: "illustrator" },
    { fieldName: "location" },
    { fieldName: "person" },
    { fieldName: "specialInstructions" },
    { fieldName: "state" },
    { fieldName: "suppliersReference" },
    { fieldName: "title" },

    // --- Fields without resolvers ---
    // Date fields and structural filters — no value suggestions needed.
    { fieldName: "date" },
    { fieldName: "dateTaken" },
    { fieldName: "has" },
    { fieldName: "in" },
    { fieldName: "usages@<added" },
    { fieldName: "usages@>added" },
    { fieldName: "usages@reference" },

    // --- Config-driven field aliases with search hints ---
    ...aliasFields,
  ];

  // Sort alphabetically, same as kahuna
  return fields.sort((a, b) => a.fieldName.localeCompare(b.fieldName));
}

