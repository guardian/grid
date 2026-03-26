/**
 * DAL barrel export.
 * UI code imports from here — never from the concrete adapter directly.
 */

export type {
  ImageDataSource,
  SearchParams,
  SearchResult,
  AggregationResult,
  AggregationBucket,
  AggregationRequest,
  AggregationsResult,
} from "./types";

export { ElasticsearchDataSource } from "./es-adapter";

