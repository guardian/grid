/**
 * DAL barrel export.
 * UI code imports from here — never from the concrete adapter directly.
 */

export type {
  ImageDataSource,
  SearchParams,
  SearchAfterResult,
  AiSearchResult,
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
 * Factory: an ApiDataSource (every read through media-api) when VITE_USE_MEDIA_API=true,
 * otherwise a plain ElasticsearchDataSource. API mode constructs no Elasticsearch data source.
 */
export function createDataSource() {
  if (import.meta.env.VITE_USE_MEDIA_API === "true") {
    return new ApiDataSource();
  }
  return new ElasticsearchDataSource();
}

