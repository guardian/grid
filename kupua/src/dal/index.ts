/**
 * DAL barrel export.
 * UI code imports from here — never from the concrete adapter directly.
 */

export type {
  ImageDataSource,
  SearchParams,
  SearchResult,
  SearchAfterResult,
  SortValues,
  BufferEntry,
  AggregationResult,
  AggregationBucket,
  AggregationRequest,
  AggregationsResult,
  SortDistribution,
  SortDistBucket,
} from "./types";

export { ElasticsearchDataSource } from "./es-adapter";
export { buildSortClause, reverseSortClause, parseSortField } from "./adapters/elasticsearch/sort-builders";

