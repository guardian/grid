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
  SortDistribution,
  TickerCountResult,
  CountWithTickersResult,
} from "./types";

export { ElasticsearchDataSource } from "./es-adapter";
export { buildSortClause, parseSortField, DATE_SORT_FIELDS } from "./adapters/elasticsearch/sort-builders";

