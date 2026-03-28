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
} from "./types";

export { ElasticsearchDataSource, buildSortClause, reverseSortClause, parseSortField } from "./es-adapter";

