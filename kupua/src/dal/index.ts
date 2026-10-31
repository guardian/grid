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
import { MockDataSource } from "./mock-data-source";
import { ResidentSampleDataSource } from "./resident-sample-data-source";
import { SYNTHETIC_PREVIEW_ENABLED, SAMPLED_PREVIEW_ENABLED, RESIDENT_PREVIEW_LIMIT, decoratePreviewImage } from "@/lib/resident-preview";

/**
 * Factory: an ApiDataSource (every read through media-api) when VITE_USE_MEDIA_API=true,
 * otherwise a plain ElasticsearchDataSource. API mode constructs no Elasticsearch data source.
 */
export function createDataSource() {
  if (SYNTHETIC_PREVIEW_ENABLED) return new MockDataSource(RESIDENT_PREVIEW_LIMIT, undefined, { transformImage: decoratePreviewImage });
  const source = import.meta.env.VITE_USE_MEDIA_API === "true"
    ? new ApiDataSource() : new ElasticsearchDataSource();
  return SAMPLED_PREVIEW_ENABLED ? new ResidentSampleDataSource(source) : source;
}

