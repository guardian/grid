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
  FilterAggRequest,
  SearchParams,
} from "@/dal/types";
import { gridConfig } from "./grid-config";
import { FIELDS_BY_CQL_KEY } from "./field-registry";
import { useCollectionStore, type CollectionNode } from "@/stores/collection-store";
import {
  PHOTOGRAPHER_CATEGORIES,
  ILLUSTRATOR_CATEGORIES,
  parseCql,
} from "@/dal/adapters/elasticsearch/cql";
import type { TickerCountResult } from "@/dal";

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

export function buildIsOptions(): string[] {
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

// Hoisted: gridConfig is a static object; result never changes at runtime.
const IS_OPTIONS = buildIsOptions();

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

/**
 * Strip all chip expressions for a given CQL key from a query string.
 * E.g. stripFieldFromQuery("credit", 'cats credit:"John Smith" dogs')
 *   → "cats dogs"
 */
function stripFieldFromQuery(cqlKey: string, query: string): string {
  // Matches: optional +/- prefix, the field key, colon, then either a
  // quoted value or a non-whitespace run.
  const pattern = new RegExp(
    `[+\\-]?${cqlKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:(?:"[^"]*"|\\S+)`,
    "gi",
  );
  return query.replace(pattern, "").replace(/\s{2,}/g, " ").trim();
}

/** Returns true if the query string contains a filter for the given CQL key. */
function queryContainsField(cqlKey: string, query: string | undefined): boolean {
  if (!query) return false;
  const pattern = new RegExp(
    `(?:^|\\s)[+\\-]?${cqlKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`,
    "i",
  );
  return pattern.test(query);
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
  getTickerCounts?: () => Record<string, TickerCountResult> | null,
  getIsFilterCounts?: () => Record<string, number> | null,
): TypeaheadFieldDef[] {
  /** Fetch a single field's agg scoped to the current query, excluding the
   *  field's own filter to avoid self-referential results. When `cqlKey` is
   *  provided and the query contains that field, the field's chip expression
   *  is stripped before querying — so editing `credit:X` shows ALL credits
   *  (still scoped by other filters) rather than only X. */
  async function scopedAgg(field: string, size: number = 50, cqlKey?: string): Promise<AggregationResult> {
    const params = getParams?.();
    if (params) {
      let adjustedParams = params;
      if (cqlKey && params.query && queryContainsField(cqlKey, params.query)) {
        const stripped = stripFieldFromQuery(cqlKey, params.query);
        adjustedParams = { ...params, query: stripped || undefined };
      }
      const result = await dataSource.getAggregations(adjustedParams, [{ field, size }]);
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
        const query = getParams?.()?.query;
        if (!queryContainsField(fa.alias, query)) {
          const cached = storeBuckets(fa.alias, getAggregations);
          if (cached) {
            return mergeWithCounts(value, fa.searchHintOptions!, cached);
          }
        }
        const { buckets } = await scopedAgg(fa.elasticsearchPath, 50, fa.alias);
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
        const query = getParams?.()?.query;
        if (!queryContainsField("category", query)) {
          const cached = storeBuckets("category", getAggregations);
          if (cached) return bucketFilter(value, cached);
        }
        const { buckets } = await scopedAgg("usageRights.category", 50, "category");
        return bucketFilter(value, buckets);
      },
    },
    {
      fieldName: "credit",
      resolver: async (value: string) => {
        const query = getParams?.()?.query;
        if (!queryContainsField("credit", query)) {
          const cached = storeBuckets("credit", getAggregations);
          if (cached) return bucketFilter(value, cached);
        }
        const { buckets } = await scopedAgg("metadata.credit", 50, "credit");
        return bucketFilter(value, buckets);
      },
    },
    {
      fieldName: "label",
      resolver: async (value: string) => {
        const query = getParams?.()?.query;
        if (!queryContainsField("label", query)) {
          const cached = storeBuckets("label", getAggregations);
          if (cached) return bucketFilter(value, cached);
        }
        const { buckets } = await scopedAgg("userMetadata.labels", 50, "label");
        return bucketFilter(value, buckets);
      },
    },
    {
      fieldName: "photoshoot",
      resolver: async (value: string) => {
        const query = getParams?.()?.query;
        if (!queryContainsField("photoshoot", query)) {
          const cached = storeBuckets("photoshoot", getAggregations);
          if (cached) return bucketFilter(value, cached);
        }
        const { buckets } = await scopedAgg("userMetadata.photoshoot.title", 50, "photoshoot");
        return bucketFilter(value, buckets);
      },
    },
    {
      fieldName: "source",
      resolver: async (value: string) => {
        const query = getParams?.()?.query;
        if (!queryContainsField("source", query)) {
          const cached = storeBuckets("source", getAggregations);
          if (cached) return bucketFilter(value, cached);
        }
        const { buckets } = await scopedAgg("metadata.source", 50, "source");
        return bucketFilter(value, buckets);
      },
    },
    {
      fieldName: "supplier",
      resolver: async (value: string) => {
        const query = getParams?.()?.query;
        if (!queryContainsField("supplier", query)) {
          const cached = storeBuckets("supplier", getAggregations);
          if (cached) return bucketFilter(value, cached);
        }
        const { buckets } = await scopedAgg("usageRights.supplier", 50, "supplier");
        return bucketFilter(value, buckets);
      },
    },

    // --- Static resolvers ---
    // Canonical value list, enriched with query-scoped counts from the
    // store cache first, falling back to a direct ES agg.
    {
      fieldName: "fileType",
      resolver: async (value: string) => {
        const query = getParams?.()?.query;
        if (!queryContainsField("fileType", query)) {
          const cached = storeBuckets("fileType", getAggregations);
          if (cached) {
            return mergeWithCounts(value, FILE_TYPES, cached, (k) => k.replace("image/", ""));
          }
        }
        const { buckets } = await scopedAgg("source.mimeType", 50, "fileType");
        return mergeWithCounts(value, FILE_TYPES, buckets, (k) => k.replace("image/", ""));
      },
    },
    {
      fieldName: "is",
      resolver: async (prefix: string) => {
        const org = gridConfig.staffPhotographerOrganisation;
        const countMap = new Map<string, number | undefined>();

        // GNM-owned, agency-pick — already in tickerCounts (no extra request).
        // tickerCounts is cleared on new search start, so always safe to read.
        const tickers = getTickerCounts?.();
        for (const def of gridConfig.tickerDefinitions) {
          if (def.searchClause.startsWith("is:")) {
            const isVal = def.searchClause.slice(3);
            const count = tickers?.[def.name]?.value;
            if (count != null) countMap.set(isVal, count);
          }
        }

        // GNM-owned-photo, GNM-owned-illustration — sum category buckets (free).
        const categoryBuckets = storeBuckets("category", getAggregations);
        if (categoryBuckets) {
          const bm = new Map(categoryBuckets.map((b) => [b.key, b.count]));
          countMap.set(
            `${org}-owned-photo`,
            PHOTOGRAPHER_CATEGORIES.reduce((s, c) => s + (bm.get(c) ?? 0), 0),
          );
          countMap.set(
            `${org}-owned-illustration`,
            ILLUSTRATOR_CATEGORIES.reduce((s, c) => s + (bm.get(c) ?? 0), 0),
          );
        }

        // deleted, under-quota — from panel cache if warm; otherwise direct call.
        // photo/illustration also in the cold fallback (review #6).
        const cached = getIsFilterCounts?.();
        if (cached) {
          if ("deleted" in cached) countMap.set("deleted", cached["deleted"]);
          if ("under-quota" in cached) countMap.set("under-quota", cached["under-quota"]);
        } else {
          try {
            const params = getParams?.();
            if (params) {
              const filterRequests: FilterAggRequest[] = [
                { name: "deleted", query: parseCql("is:deleted").must[0] },
                { name: "under-quota", query: parseCql("is:under-quota").must[0] },
                { name: `${org}-owned-photo`, query: parseCql(`is:${org}-owned-photo`).must[0] },
                { name: `${org}-owned-illustration`, query: parseCql(`is:${org}-owned-illustration`).must[0] },
              ];
              const counts = await dataSource.getFilterAggregations(params, filterRequests);
              for (const [k, v] of Object.entries(counts)) countMap.set(k, v);
            }
          } catch { /* non-critical — counts just absent */ }
        }

        // Build suggestions sorted by count desc, then alpha
        const filtered = prefixFilter(prefix, IS_OPTIONS).map((v) => ({
          value: v,
          count: countMap.get(v),
        }));
        filtered.sort((a, b) =>
          a.count != null && b.count != null ? b.count - a.count
          : a.count != null ? -1
          : b.count != null ? 1
          : a.value.localeCompare(b.value),
        );
        return filtered;
      },
    },
    {
      fieldName: "subject",
      resolver: async (value: string) => {
        const query = getParams?.()?.query;
        if (!queryContainsField("subject", query)) {
          const cached = storeBuckets("subject", getAggregations);
          if (cached) return mergeWithCounts(value, SUBJECTS, cached);
        }
        const { buckets } = await scopedAgg("metadata.subjects", 50, "subject");
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
        const query = getParams?.()?.query;
        if (!queryContainsField("uploader", query)) {
          const cached = storeBuckets("uploader", getAggregations);
          if (cached) return bucketFilter(value, cached);
        }
        const { buckets } = await scopedAgg("uploadedBy", 50, "uploader");
        return bucketFilter(value, buckets);
      },
    },

    // --- Keyword-field resolvers (terms aggregation) ---
    {
      fieldName: "croppedBy",
      resolver: async (value: string) => {
        const query = getParams?.()?.query;
        if (!queryContainsField("croppedBy", query)) {
          const cached = storeBuckets("croppedBy", getAggregations);
          if (cached) return bucketFilter(value, cached);
        }
        const { buckets } = await scopedAgg("exports.author", 50, "croppedBy");
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
        const query = getParams?.()?.query;
        if (!queryContainsField("keyword", query)) {
          const cached = storeBuckets("keyword", getAggregations);
          if (cached) return bucketFilter(value, cached);
        }
        const { buckets } = await scopedAgg("metadata.keywords", 50, "keyword");
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

    // --- Collections (from collection-store tree) ---
    {
      fieldName: "collection",
      resolver: async (value: string) => {
        const { tree, status } = useCollectionStore.getState();
        if (!tree || status !== "ready") return [];
        const pathIds = flattenCollectionPathIds(tree);
        const lower = value.toLowerCase();
        return pathIds
          .filter((id) => id.includes(lower))
          .sort()
          .map((id) => ({ value: id }));
      },
    },
  ];

  // Sort alphabetically, same as kahuna
  return fields.sort((a, b) => a.fieldName.localeCompare(b.fieldName));
}

// ---------------------------------------------------------------------------
// Collection tree helpers
// ---------------------------------------------------------------------------

/**
 * Flatten a CollectionNode tree into a list of all pathIds (depth-first).
 * Nodes without inner data (no pathId) are skipped.
 */
function flattenCollectionPathIds(root: CollectionNode): string[] {
  const ids: string[] = [];
  function walk(node: CollectionNode) {
    if (node.data.data?.pathId) ids.push(node.data.data.pathId);
    for (const child of node.data.children) walk(child);
  }
  walk(root);
  return ids;
}
