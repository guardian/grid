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
  AggregationRequest,
  AggregationsResult,
  FilterAggRequest,
  UsageFilterAggRequest,
  SortDistribution,
  SortDistBucket,
  TickerCountResult,
  CountWithTickersResult,
} from "./types";

export { ElasticsearchDataSource } from "./es-adapter";
export { ApiDataSource } from "./api-data-source";
export { buildSortClause, parseSortField, DATE_SORT_FIELDS, NESTED_SORT_FIELDS, SORT_FIELD_EXTRACTORS } from "./adapters/elasticsearch/sort-builders";

import { ElasticsearchDataSource } from "./es-adapter";
import { ApiDataSource } from "./api-data-source";

/**
 * Factory: returns an ApiDataSource (ordered reads through media-api, the rest through the
 * development fallback) when VITE_USE_MEDIA_API=true, otherwise a plain ElasticsearchDataSource.
 */
export function createDataSource() {
  const es = new ElasticsearchDataSource();
  if (import.meta.env.VITE_USE_MEDIA_API === "true") {
    return new ApiDataSource(es);
  }
  return es;
}

