/**
 * Field-value suggestion providers shared by CQL, Refine and metadata editors.
 *
 * Dynamic resolvers use `ImageDataSource.getAggregations()` — a terms
 * aggregation on the keyword field, scoped to the current search and ranked
 * by prevalence.  Results appear immediately when the user types `:` and
 * filter as they type further.
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
  AggregationRequest,
  FilterAggRequest,
  SearchParams,
} from "@/dal/types";
import { gridConfig } from "./grid-config";
import { CATEGORY_AGG_SIZE } from "@/constants/tuning";
import { displayTickers } from "./ticker-display";
import { FIELD_REGISTRY, FIELDS_BY_CQL_KEY } from "./field-registry";
import { isolateAggregationFailure } from "./safe-aggregation";
import { removeAllFieldTerms } from "@/dal/adapters/elasticsearch/cql-query-edit";
import { useCollectionStore, type CollectionNode } from "@/stores/collection-store";
import type { TickerCountResult } from "@/dal";
import { useUsageRightsCatalogue } from "./usage-rights-catalogue";

// ---------------------------------------------------------------------------
// Types matching @guardian/cql's TypeaheadField expectations
// ---------------------------------------------------------------------------

export interface TypeaheadSuggestion {
  value: string;
  /** Display label shown in the dropdown. When omitted, `value` is shown. */
  label?: string;
  count?: number;
}

/** Suggestion handed to @guardian/cql, whose TextSuggestionOption requires the key to exist. */
type LabelledSuggestion = Omit<TypeaheadSuggestion, "label"> & { label: string | undefined };

export type TypeaheadResolver = ((value: string, signal?: AbortSignal) => Promise<TypeaheadSuggestion[]>) | string[];

export interface TypeaheadFieldDef {
  fieldName: string;
  resolver?: TypeaheadResolver;
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

const CATEGORY_BUCKETS = CATEGORY_AGG_SIZE;

const USAGE_PLATFORMS = ["print", "digital", "syndication", ...(gridConfig["image.record.download"] ? ["download"] : [])];

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
export function stripFieldFromQuery(cqlKey: string, query: string): string {
  return removeAllFieldTerms(query, cqlKey);
}

/** Returns true if the query string contains a filter for the given CQL key. */
export function queryContainsField(cqlKey: string, query: string | undefined): boolean {
  return query ? removeAllFieldTerms(query, cqlKey) !== query : false;
}

function aggregationScope(params: SearchParams, cqlKey?: string): SearchParams {
  if (!cqlKey || !params.query) return params;
  const stripped = stripFieldFromQuery(cqlKey, params.query);
  return stripped !== params.query ? { ...params, query: stripped || undefined } : params;
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

function waitForTypingPause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function createOptionReader(dataSource: ImageDataSource, matchDelayMs = 0) {
  const completed = new Map<string, AggregationsResult>();
  const pending = new Map<string, {
    controller: AbortController;
    users: number;
    promise: Promise<AggregationsResult>;
  }>();

  return (params: SearchParams, fields: AggregationRequest[], signal?: AbortSignal, filters?: FilterAggRequest[]): Promise<AggregationsResult> => {
    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    const key = JSON.stringify([
      Object.entries(params).filter(([, value]) => value !== undefined).sort(([left], [right]) => left.localeCompare(right)),
      fields, filters,
    ]);
    const cached = completed.get(key);
    if (cached) return Promise.resolve(cached);
    let request = pending.get(key);
    if (!request) {
      const controller = new AbortController();
      const fetchBuckets = () => {
        controller.signal.throwIfAborted();
        return dataSource.getAggregations(params, fields, controller.signal, filters);
      };
      const resultPromise = matchDelayMs && fields.some(spec => spec.match)
        ? waitForTypingPause(matchDelayMs, controller.signal).then(fetchBuckets) : fetchBuckets();
      const owned = {
        controller, users: 0,
        promise: resultPromise.then((result) => {
          if (!controller.signal.aborted) {
            completed.set(key, result);
            if (completed.size > 32) completed.delete(completed.keys().next().value!);
          }
          return result;
        }).finally(() => {
          if (pending.get(key) === owned) pending.delete(key);
        }),
      };
      request = owned;
      pending.set(key, request);
    }
    const owned = request;
    owned.users++;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener("abort", abort);
        owned.users--;
        if (owned.users === 0 && pending.get(key) === owned) {
          pending.delete(key);
          owned.controller.abort();
        }
      };
      const abort = () => {
        finish();
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      owned.promise.then((result) => { finish(); resolve(result); }, (error) => { finish(); reject(error); });
    });
  };
}

function createBucketLookup(
  dataSource: ImageDataSource,
  getAggregations?: () => AggregationsResult | null,
  getParams?: () => SearchParams,
  matchDelayMs = 0,
) {
  const readOptions = createOptionReader(dataSource, matchDelayMs);
  return async (field: string, key: string, value: string, signal?: AbortSignal, textual = true): Promise<TypeaheadSuggestion[]> => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const params = getParams?.() ?? {};
    const match = textual && value && value.length <= 128 && dataSource.supportsBucketNameMatching
      ? { text: value, mode: "prefix" as const } : undefined;
    if (!match && !queryContainsField(key, params.query)) {
      const cached = storeBuckets(key, getAggregations);
      if (cached) return bucketFilter(value, cached);
    }
    const result = await readOptions(aggregationScope(params, key), [{ field, size: 50, ...(match && { match }) }], signal);
    return bucketFilter(match ? "" : value, result.fields[field]?.buckets ?? []);
  };
}

export function createLabelSuggestionProvider(dataSource: ImageDataSource, getAggregations?: () => AggregationsResult | null,
  getParams?: () => SearchParams) {
  const lookup = createBucketLookup(dataSource, getAggregations, getParams);
  return (value: string, signal?: AbortSignal) => lookup("userMetadata.labels", "label", value, signal);
}

export function buildTypeaheadFields(
  dataSource: ImageDataSource,
  getAggregations?: () => AggregationsResult | null,
  getParams?: () => SearchParams,
  getTickerCounts?: () => Record<string, TickerCountResult> | null,
  getIsFilterCounts?: () => Record<string, number> | null,
  matchDelayMs = 0,
): TypeaheadFieldDef[] {
  const readOptions = createOptionReader(dataSource);
  const lookup = createBucketLookup(dataSource, getAggregations, getParams, matchDelayMs);
  const bucketField = (fieldName: string, path: string): TypeaheadFieldDef => ({
    fieldName, resolver: (value, signal) => isolateAggregationFailure(() => lookup(path, fieldName, value, signal), []),
  });

  /** Fetch a single field's agg scoped to the current query, excluding the
   *  field's own filter to avoid self-referential results. When `cqlKey` is
   *  provided and the query contains that field, the field's chip expression
   *  is stripped before querying — so editing `credit:X` shows ALL credits
   *  (still scoped by other filters) rather than only X. */
  async function scopedAgg(
    field: string,
    size: number = 50,
    cqlKey?: string,
    signal?: AbortSignal,
  ): Promise<AggregationResult> {
    const params = getParams?.() ?? {};
    return isolateAggregationFailure(async () => {
      const result = await readOptions(aggregationScope(params, cqlKey), [{ field, size }], signal);
      return result.fields[field] ?? { buckets: [], total: 0 };
    }, { buckets: [], total: 0 });
  }

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
      resolver: async (value: string, signal?: AbortSignal) => {
        const query = getParams?.()?.query;
        if (!queryContainsField(fa.alias, query)) {
          const cached = storeBuckets(fa.alias, getAggregations);
          if (cached) {
            return mergeWithCounts(value, fa.searchHintOptions!, cached);
          }
        }
        const { buckets } = await scopedAgg(fa.elasticsearchPath, 50, fa.alias, signal);
        return mergeWithCounts(value, fa.searchHintOptions!, buckets);
      },
      showInKeySuggestions: fa.displaySearchHint,
    }));

  const fields: TypeaheadFieldDef[] = [
    // --- Dynamic resolvers ---
    {
      fieldName: "category",
      resolver: async (value: string, signal?: AbortSignal) => {
        const lower = value.toLowerCase();
        const catalogue = useUsageRightsCatalogue.getState().categories;
        // Kahuna parity (media-api only, which expands aliases and replaced values): Grid's list, kebab only.
        if (catalogue && import.meta.env.VITE_USE_MEDIA_API === "true") {
          const { buckets } = await scopedAgg("usageRights.category", CATEGORY_BUCKETS, "category", signal);
          const hits = new Map(buckets.map((b) => [b.key, b.count]));
          // media-api reports no truncation: a missing value is zero only when the page wasn't full.
          const complete = buckets.length < CATEGORY_BUCKETS;
          const counted = catalogue.every((c) => c.legacyCategories);
          return catalogue.filter((c) => c.value !== "").map((c) => {
            const values = [c.value, ...(c.legacyCategories ?? [])];
            const known = counted && (complete || values.every((v) => hits.has(v)));
            return {
              value: c.searchAlias ?? c.value,
              // Omit rather than undercount (older servers, or truncated buckets).
              ...(known ? { count: values.reduce((sum, v) => sum + (hits.get(v) ?? 0), 0) } : {}),
            };
          }).filter((s) => s.value.toLowerCase().startsWith(lower));
        }
        return isolateAggregationFailure(() => lookup("usageRights.category", "category", value, signal), []);
      },
    },
    bucketField("credit", "metadata.credit"),
    bucketField("label", "userMetadata.labels"),
    bucketField("photoshoot", "userMetadata.photoshoot.title"),
    bucketField("source", "metadata.source"),
    bucketField("supplier", "usageRights.supplier"),

    // --- Static resolvers ---
    // Canonical value list, enriched with query-scoped counts from the
    // store cache first, falling back to a direct ES agg.
    {
      fieldName: "fileType",
      resolver: async (value: string, signal?: AbortSignal) => {
        const query = getParams?.()?.query;
        if (!queryContainsField("fileType", query)) {
          const cached = storeBuckets("fileType", getAggregations);
          if (cached) {
            return mergeWithCounts(value, FILE_TYPES, cached, (k) => k.replace("image/", ""));
          }
        }
        const { buckets } = await scopedAgg("source.mimeType", 50, "fileType", signal);
        return mergeWithCounts(value, FILE_TYPES, buckets, (k) => k.replace("image/", ""));
      },
    },
    {
      fieldName: "is",
      resolver: async (prefix: string, signal?: AbortSignal) => {
        const org = gridConfig.staffPhotographerOrganisation;
        const countMap = new Map<string, number | undefined>();

        // GNM-owned, agency-pick — already in tickerCounts (no extra request).
        // tickerCounts is cleared on new search start, so always safe to read.
        const tickers = getTickerCounts?.() ?? null;
        for (const ticker of displayTickers(tickers)) countMap.set(ticker.isValue, ticker.value);

        // deleted, under-quota, owned photo/illustration — the server's is: counts,
        // from the panel cache if warm; otherwise a direct call.
        const isCounted = ["deleted", "under-quota", `${org}-owned-photo`, `${org}-owned-illustration`];
        const cached = getIsFilterCounts?.();
        if (cached) {
          for (const name of isCounted) if (name in cached) countMap.set(name, cached[name]);
        } else {
          try {
            const params = getParams?.();
            if (params) {
              const filterRequests: FilterAggRequest[] = isCounted.map((name) => ({ name, isFilter: name }));
              const aggResult = await readOptions(params, [], signal, filterRequests);
              for (const [k, v] of Object.entries(aggResult.filters ?? {})) countMap.set(k, v);
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
      resolver: async (value: string, signal?: AbortSignal) => {
        const query = getParams?.()?.query;
        if (!queryContainsField("subject", query)) {
          const cached = storeBuckets("subject", getAggregations);
          if (cached) return mergeWithCounts(value, SUBJECTS, cached);
        }
        const { buckets } = await scopedAgg("metadata.subjects", 50, "subject", signal);
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

    bucketField("uploader", "uploadedBy"),

    // --- Keyword-field resolvers (terms aggregation) ---
    bucketField("croppedBy", "exports.author"),
    {
      fieldName: "filename",
      // No resolver — filenames are nearly always unique so aggregation is pointless
    },
    bucketField("keyword", "metadata.keywords"),
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

// ---------------------------------------------------------------------------
// Dynamic field fallback — value suggestions for arbitrary, unregistered
// field paths (e.g. fileMetadata.xmp.dc:creator). Only invoked by
// LazyTypeahead when no static TypeaheadField matches the typed key — a
// field that's registered but resolver-less (city, country, etc.) is still
// found by that lookup and never reaches here, so it keeps showing no value
// suggestions with no wasted round-trip, same as today.
// ---------------------------------------------------------------------------

/**
 * Build the fallback resolver passed to `LazyTypeahead`. Attempts an
 * isolated single-field terms aggregation on the literal typed field path —
 * no upfront mapping-type check. Success (>=1 bucket) shows value
 * suggestions; failure (non-aggregatable field, bad path, ES error) or an
 * empty result shows none, identical to how already-excluded text fields
 * (byline, city, ...) behave.
 */
export function buildDynamicFieldFallback(
  dataSource: ImageDataSource,
  getParams?: () => SearchParams,
  matchDelayMs = 0,
): (fieldId: string, value: string, signal?: AbortSignal) => Promise<LabelledSuggestion[] | undefined> {
  const lookup = createBucketLookup(dataSource, undefined, getParams, matchDelayMs);
  const keywordPaths = new Set(FIELD_REGISTRY.filter(field => field.aggregatable && (field.fieldType === "keyword" || field.fieldType === "list"))
    .map(field => field.esSearchPath));
  return async (fieldId, value, signal) => {
    const params = getParams?.();
    if (!params) return undefined;
    // Strip the field's own chip(s) first — otherwise, once the user has
    // typed a value, the live-committed query already filters on this same
    // field, and the aggregation ends up self-referentially scoped to
    // whatever's currently typed instead of the field's full distribution
    // (confirmed live: typing "London" then editing it kept showing only
    // matches for the in-progress partial value). Uses the same parser-based
    // removal as registered fields, including quoted keys and empty values.
    const textual = fieldId.startsWith("fileMetadata.xmp.") || keywordPaths.has(fieldId);
    const suggestions = await isolateAggregationFailure(() => lookup(fieldId, fieldId, value, signal, textual), undefined);
    if (!suggestions?.length) return undefined;
    // cql's TextSuggestionOption declares `label` present-but-nullable, so the key must exist.
    return suggestions.map((s) => ({ ...s, label: s.label }));
  };
}

