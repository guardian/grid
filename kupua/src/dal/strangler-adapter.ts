/**
 * StranglerAdapter — wraps ElasticsearchDataSource and routes searchAfter
 * through the media-api server when VITE_USE_MEDIA_API=true.
 *
 * All other methods delegate unchanged to the ES adapter. This adapter is
 * the "strangler fig" boundary: as more endpoints move server-side, their
 * overrides land here.
 */

import type { ImageDataSource, SearchAfterResult, SearchParams, SortValues } from "./types";
import { ElasticsearchDataSource } from "./es-adapter";
import { apiSearchAfter } from "./grid-api-search-adapter";

export class StranglerAdapter implements ImageDataSource {
  private readonly es: ElasticsearchDataSource;

  constructor(es: ElasticsearchDataSource) {
    this.es = es;
    // Optional methods: bind only when the ES adapter implements them
    if (es.searchByAi) this.searchByAi = es.searchByAi.bind(es);
    if (es.findKeywordSortValue) this.findKeywordSortValue = es.findKeywordSortValue.bind(es);
    if (es.getKeywordDistribution) this.getKeywordDistribution = es.getKeywordDistribution.bind(es);
    if (es.getDateDistribution) this.getDateDistribution = es.getDateDistribution.bind(es);
    if (es.fetchPositionIndex) this.fetchPositionIndex = es.fetchPositionIndex.bind(es);
  }

  search(p: SearchParams) { return this.es.search(p); }
  searchRange(p: SearchParams, s?: AbortSignal) { return this.es.searchRange(p, s); }
  count(p: SearchParams) { return this.es.count(p); }
  countWithTickers(p: SearchParams) { return this.es.countWithTickers(p); }
  getById(id: string) { return this.es.getById(id); }
  getByIds(ids: string[], s?: AbortSignal) { return this.es.getByIds(ids, s); }
  getAggregation(...a: Parameters<ElasticsearchDataSource["getAggregation"]>) { return this.es.getAggregation(...a); }
  getAggregations(...a: Parameters<ElasticsearchDataSource["getAggregations"]>) { return this.es.getAggregations(...a); }
  openPit(k?: string) { return this.es.openPit(k); }
  closePit(id: string) { return this.es.closePit(id); }
  countBefore(...a: Parameters<ElasticsearchDataSource["countBefore"]>) { return this.es.countBefore(...a); }
  estimateSortValue(...a: Parameters<ElasticsearchDataSource["estimateSortValue"]>) { return this.es.estimateSortValue(...a); }
  getIdRange(...a: Parameters<ElasticsearchDataSource["getIdRange"]>) { return this.es.getIdRange(...a); }

  // Optional — assigned in constructor when the ES adapter has them
  searchByAi?: ImageDataSource["searchByAi"];
  findKeywordSortValue?: ImageDataSource["findKeywordSortValue"];
  getKeywordDistribution?: ImageDataSource["getKeywordDistribution"];
  getDateDistribution?: ImageDataSource["getDateDistribution"];
  fetchPositionIndex?: ImageDataSource["fetchPositionIndex"];

  async searchAfter(
    params: SearchParams,
    searchAfterValues: SortValues | null,
    pitId?: string | null,
    signal?: AbortSignal,
    reverse?: boolean,
    seekToEnd?: boolean,
  ): Promise<SearchAfterResult> {
    return apiSearchAfter(params, searchAfterValues, pitId, signal, reverse, seekToEnd);
  }
}
