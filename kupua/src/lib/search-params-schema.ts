/**
 * Zod schema for URL search params.
 *
 * This is the single source of truth for which search params are synced to the URL.
 * Pagination params (offset, length, countAll) are deliberately excluded — they're
 * managed internally by the search store and not meaningful in a shared URL.
 */

import { z } from "zod";
import { SORTABLE_FIELDS } from "./field-registry";

const COLLECTION_CHIP_RE = /(?:^|\s)(?:\+?collection:|~)\S+/;
const COLLECTION_SORT = "-dateAddedToCollection";
const ORDINARY_SORT = "-uploadTime";
const AI_SORT = "-relevance";
const ORDINARY_SORT_TOKENS = new Set([
  ...Object.values(SORTABLE_FIELDS),
  "dateAddedToCollection",
]);

export const searchParamsSchema = z.object({
  /** Free-text / CQL query */
  query: z.string().optional().catch(undefined),
  /** AI / semantic search query (separate from CQL) */
  aiQuery: z.string().optional().catch(undefined),
  /** Comma-separated image IDs */
  ids: z.string().optional().catch(undefined),
  /** Upload time range — ISO date strings */
  since: z.string().optional().catch(undefined),
  until: z.string().optional().catch(undefined),
  /** When "true", include paid/non-free images. Absent = free only. */
  nonFree: z.string().optional().catch(undefined),
  /** Pay type filter */
  payType: z.string().optional().catch(undefined),
  /** Filter by uploader email */
  uploadedBy: z.string().optional().catch(undefined),
  /** Sort order */
  orderBy: z.string().optional().catch(undefined),
  /** Enable AI/semantic search */
  useAISearch: z.string().optional().catch(undefined),
  /** Hybrid search blend weight: 0.0 = pure BM25, 1.0 = pure KNN (default) */
  vecWeight: z.string().optional().catch(undefined),
  /** Which date field the date range applies to */
  dateField: z.string().optional().catch(undefined),
  /** Date taken range */
  takenSince: z.string().optional().catch(undefined),
  takenUntil: z.string().optional().catch(undefined),
  /** Last modified range */
  modifiedSince: z.string().optional().catch(undefined),
  modifiedUntil: z.string().optional().catch(undefined),
  /** Has acquired syndication rights */
  hasRightsAcquired: z.string().optional().catch(undefined),
  /** Has crops/exports */
  hasCrops: z.string().optional().catch(undefined),
  /** Syndication status filter */
  syndicationStatus: z.string().optional().catch(undefined),
  /** Is persisted */
  persisted: z.string().optional().catch(undefined),
  /** Currently viewed image ID — when present, image detail overlay is shown.
   *  Named `image` (not `imageId`) to match Grid URL style: `?image=abc123`. */
  image: z.string().optional().catch(undefined),
  /** View density — "grid" (default) or "table" (data table). */
  density: z.enum(["table", "grid"]).optional().catch(undefined),
});

export type UrlSearchParams = z.infer<typeof searchParamsSchema>;

export interface SearchContextMemory {
  preCollectionSort?: string;
  preAiSort?: string;
}

export function hasCollectionFilter(query: string | undefined): boolean {
  return COLLECTION_CHIP_RE.test(query ?? "");
}

export function applySearchContextTransitions(
  current: UrlSearchParams,
  updates: Partial<UrlSearchParams>,
  memory: SearchContextMemory,
): { params: UrlSearchParams; memory: SearchContextMemory } {
  const params = { ...current, ...updates };
  const nextMemory = { ...memory };
  const hadCollection = hasCollectionFilter(current.query);
  const hasCollection = hasCollectionFilter(params.query);

  if (!hadCollection && hasCollection) {
    nextMemory.preCollectionSort = current.aiQuery
      ? nextMemory.preAiSort
      : params.orderBy === COLLECTION_SORT
        ? undefined
        : params.orderBy;
    params.aiQuery = undefined;
    params.orderBy = COLLECTION_SORT;
    nextMemory.preAiSort = undefined;
    return { params, memory: nextMemory };
  }

  if (hadCollection && !hasCollection) {
    if (params.orderBy === COLLECTION_SORT) {
      params.orderBy = nextMemory.preCollectionSort;
    }
    nextMemory.preCollectionSort = undefined;
  } else if (hasCollection) {
    params.aiQuery = undefined;
    return { params, memory: nextMemory };
  }

  const hadAi = !!current.aiQuery;
  const hasAi = !!params.aiQuery;
  if (!hadAi && hasAi) {
    if (params.orderBy !== AI_SORT) {
      nextMemory.preAiSort = params.orderBy;
      params.orderBy = AI_SORT;
    }
  } else if (hadAi && !hasAi) {
    if (params.orderBy === AI_SORT) {
      params.orderBy = nextMemory.preAiSort;
    }
    nextMemory.preAiSort = undefined;
  }

  return { params, memory: nextMemory };
}

function firstSortToken(value: string | undefined): string | undefined {
  const token = value?.split(",", 1)[0]?.trim();
  return token || undefined;
}

function isAllowedSort(token: string, allowed: ReadonlySet<string>): boolean {
  const field = token.startsWith("-") ? token.slice(1) : token;
  return allowed.has(field);
}

export function canonicalizeSearchParams(
  params: UrlSearchParams,
): UrlSearchParams {
  const canonical = { ...params };
  const hasCollection = hasCollectionFilter(canonical.query);

  if (hasCollection && canonical.aiQuery) {
    canonical.aiQuery = undefined;
  }

  const token = firstSortToken(canonical.orderBy);
  if (canonical.aiQuery) {
    const aiTokens = new Set(["relevance", "uploadTime"]);
    canonical.orderBy = token && isAllowedSort(token, aiTokens) ? token : AI_SORT;
  } else if (token && isAllowedSort(token, ORDINARY_SORT_TOKENS)) {
    canonical.orderBy = token;
  } else if (canonical.orderBy === undefined && !hasCollection) {
    canonical.orderBy = undefined;
  } else {
    canonical.orderBy = hasCollection ? COLLECTION_SORT : ORDINARY_SORT;
  }

  return canonical;
}

/**
 * Keys that are synced to the URL.
 * Used to strip undefined values before navigating.
 */
export const URL_PARAM_KEYS = Object.keys(
  searchParamsSchema.shape
) as (keyof UrlSearchParams)[];

/**
 * Display-only URL params — present in the URL but NOT synced to the search
 * store and NOT triggering a new ES search. Changing only these keys should
 * be treated as a no-op by useUrlSearchSync.
 */
export const URL_DISPLAY_KEYS: ReadonlySet<keyof UrlSearchParams> = new Set([
  "image",
  "density",
]);

/**
 * URL params that should appear first in the query string, in this order.
 * Grid convention: `?image=xxx&query=...&nonFree=true`
 */
export const URL_PARAM_PRIORITY: readonly string[] = ["image"];

