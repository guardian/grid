import type { ImageDataSource } from "./types";
import { MockDataSource } from "./mock-data-source";
import { RESIDENT_PREVIEW_LIMIT } from "@/lib/resident-preview";

/** One bounded read per instance; every subsequent operation stays in memory. */
export class ResidentSampleDataSource implements ImageDataSource {
  private ready?: Promise<ImageDataSource>;

  constructor(private readonly source: Pick<ImageDataSource, "searchAfter">) {}

  private sample(): Promise<ImageDataSource> {
    return this.ready ??= this.load();
  }

  private async load(): Promise<ImageDataSource> {
    try {
      const result = await this.source.searchAfter({
        nonFree: "true", orderBy: "-uploadTime", length: RESIDENT_PREVIEW_LIMIT,
        trackTotalHits: false,
      }, null, null, AbortSignal.timeout(15_000));
      const images = [...new Map(result.hits.slice(0, RESIDENT_PREVIEW_LIMIT)
        .map(image => [image.id, image])).values()];
      return new MockDataSource(images.length, undefined, { images });
    } catch {
      // No retries or fallback to unrestricted browsing. Reload explicitly resamples.
      return new MockDataSource(0);
    }
  }

  searchRange: ImageDataSource["searchRange"] = async (...args) => (await this.sample()).searchRange(...args);
  count: ImageDataSource["count"] = async (...args) => (await this.sample()).count(...args);
  countWithTickers: ImageDataSource["countWithTickers"] = async (...args) => (await this.sample()).countWithTickers(...args);
  getById: ImageDataSource["getById"] = async (...args) => (await this.sample()).getById(...args);
  getAggregations: ImageDataSource["getAggregations"] = async (...args) => (await this.sample()).getAggregations(...args);
  searchAfter: ImageDataSource["searchAfter"] = async (...args) => (await this.sample()).searchAfter(...args);
  countBefore: ImageDataSource["countBefore"] = async (...args) => (await this.sample()).countBefore(...args);
  getByIds: ImageDataSource["getByIds"] = async (...args) => (await this.sample()).getByIds(...args);
  getIdRange: ImageDataSource["getIdRange"] = async (...args) => (await this.sample()).getIdRange(...args);
  openPit: ImageDataSource["openPit"] = async () => null;
  closePit: ImageDataSource["closePit"] = async () => {};
  estimateSortValue: ImageDataSource["estimateSortValue"] = async () => null;
}
