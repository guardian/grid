/**
 * DAL barrel export.
 * UI code imports from here — never from the concrete adapter directly.
 */

export type {
  ImageDataSource,
  SearchParams,
  SearchAfterResult,
  SortValues,
  AggregationResult,
  AggregationBucket,
  AggregationsResult,
  FilterAggRequest,
  UsageFilterAggRequest,
  SortDistribution,
  TickerCountResult,
  CountWithTickersResult,
} from "./types";

export { ElasticsearchDataSource } from "./es-adapter";
export { StranglerAdapter } from "./strangler-adapter";
export { buildSortClause, parseSortField, DATE_SORT_FIELDS, NESTED_SORT_FIELDS, SORT_FIELD_EXTRACTORS } from "./adapters/elasticsearch/sort-builders";

import { ElasticsearchDataSource } from "./es-adapter";
import { StranglerAdapter } from "./strangler-adapter";

/**
 * Factory: returns a StranglerAdapter (routes searchAfter to media-api) when
 * VITE_USE_MEDIA_API=true, otherwise a plain ElasticsearchDataSource.
 */
export function createDataSource() {
  const es = new ElasticsearchDataSource();
  if (import.meta.env.VITE_USE_MEDIA_API === "true") {
    return new StranglerAdapter(es);
  }
  return es;
}

