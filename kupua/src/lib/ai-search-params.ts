// Tactical solution for AI search (one alternative-ranking algorithm).
// Replace with SearchContext abstraction when a second one lands.
// See: exploration/docs/zz Archive/ai-searchContext-future-abstraction.md

import type { SearchParams } from "@/dal";

/**
 * If the `aiQuery` param is present, scope the aggregation/count query to
 * the given result IDs. When no AI query is active, returns params unchanged
 * (no-op in normal search).
 *
 * Every store action that calls a `dataSource.*` aggregation or count
 * method MUST pass params through this first. See:
 * exploration/docs/zz Archive/ai-search-aggregation-problem.md
 */
export function decorateParamsForAggregations(
  params: SearchParams,
  resultIds: readonly string[],
): SearchParams {
  if (!params.aiQuery) return params;
  return {
    ...params,
    ids: resultIds.join(","),
  };
}
