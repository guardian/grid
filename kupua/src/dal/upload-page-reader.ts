import type { ImageDataSource, SearchParams, SearchAfterResult, SortValues, UploadSections } from "./types";
import type { PositionMap } from "./position-map";
import { PAGE_SIZE } from "@/constants/tuning";

export class UploadPageReader {
  constructor(private source: ImageDataSource) {}

  parts(params: SearchParams): [SearchParams, SearchParams] {
    const scope = params.recentUploadScope!;
    const batch = scope.batch;
    return [
      { nonFree: "true", imageScope: batch ?? { key: `${scope.key}:empty`, revision: 0, ids: [] }, orderBy: params.orderBy, ids: params.ids },
      { nonFree: "true", orderBy: "-uploadTime", ids: params.ids,
        recentUploadScope: { key: `${scope.key}:other`, uploadedBy: scope.uploadedBy, excludedIds: batch?.ids ?? [] } },
    ];
  }

  async bounds(params: SearchParams, signal?: AbortSignal): Promise<UploadSections> {
    signal?.throwIfAborted();
    const [batch, other] = this.parts({ ...params, ids: undefined });
    const counts = await Promise.allSettled([
      batch.imageScope!.ids.length ? this.source.count(batch, signal) : Promise.resolve(0),
      other.recentUploadScope!.uploadedBy ? this.source.count(other, signal) : Promise.reject(new Error("Human identity unavailable")),
    ]);
    signal?.throwIfAborted();
    return {
      batch: counts[0].status === "fulfilled" ? counts[0].value : 0,
      other: counts[1].status === "fulfilled" ? counts[1].value : 0,
      ...(counts[0].status === "rejected" ? { batchError: "Batch images are unavailable." } : {}),
      ...(counts[1].status === "rejected" ? { otherError: "My other uploads are unavailable. Reload after signing in to a human account." } : {}),
    };
  }

  private decode(params: SearchParams, cursor: SortValues): { section: number; raw: SortValues } {
    if (cursor.length >= 3 && (cursor[0] === 0 || cursor[0] === 1)) return { section: cursor[0], raw: cursor.slice(1) };
    const id = String(cursor.at(-1)).replace(/\u0000$/, "");
    return { section: params.recentUploadScope?.batch?.ids.includes(id) ? 0 : 1, raw: cursor };
  }

  async page(params: SearchParams, cursor: SortValues | null, signal?: AbortSignal, reverse = false): Promise<SearchAfterResult> {
    const bounds = await this.bounds(params, signal);
    const parts = this.parts(params);
    const decoded = cursor ? this.decode(params, cursor) : null;
    const length = params.length ?? PAGE_SIZE;
    const pages: SearchAfterResult[] = [];
    let remaining = length;
    let uploadOffset: number | undefined;
    let offset = params.offset ?? 0;
    const start = decoded?.section ?? (reverse ? 1 : offset < bounds.batch ? 0 : 1);
    if (!decoded && !reverse && start === 1) offset -= bounds.batch;
    for (const section of reverse ? [1, 0] : [0, 1]) {
      if (reverse ? section > start : section < start) continue;
      const count = section === 0 ? bounds.batch : bounds.other;
      if (!remaining || !count) continue;
      try {
        const page = await this.source.searchAfter({ ...parts[section], length: remaining,
          ...(!decoded && !reverse && offset > 0 ? { offset } : {}) },
          decoded?.section === section ? decoded.raw : null, null, signal, reverse, reverse && !decoded);
        pages.push({ ...page, sortValues: page.sortValues.map(values => [section, ...values]) });
        remaining -= page.hits.length;
      } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        if (section === 0) {
          bounds.batchError = "Batch images are unavailable.";
          if (!reverse && !pages.length) { uploadOffset = bounds.batch; offset = 0; continue; }
        }
        else bounds.otherError = "My other uploads are unavailable. Try reloading.";
        break;
      }
      offset = 0;
    }
    if (reverse) pages.reverse();
    return { hits: pages.flatMap(page => page.hits), sortValues: pages.flatMap(page => page.sortValues),
      total: bounds.batch + bounds.other, uploadSections: bounds, ...(uploadOffset !== undefined ? { uploadOffset } : {}),
      enrichment: new Map(pages.flatMap(page => [...page.enrichment ?? []])) };
  }

  async rank(params: SearchParams, cursor: SortValues, signal?: AbortSignal): Promise<number> {
    const { section, raw } = this.decode(params, cursor);
    const parts = this.parts(params);
    return (section === 1 ? (await this.bounds(params, signal)).batch : 0)
      + await this.source.countBefore(parts[section], raw, signal);
  }

  async positions(params: SearchParams, signal: AbortSignal): Promise<PositionMap | null> {
    const parts = this.parts(params);
    const bounds = await this.bounds(params, signal);
    if (bounds.batchError || bounds.otherError) return null;
    const maps = await Promise.all(parts.map((part, section) => (section === 0 ? bounds.batch : bounds.other)
      ? this.source.fetchPositionIndex?.(part, signal) ?? Promise.resolve(null) : Promise.resolve({ ids: [], sortValues: [], length: 0 } as PositionMap)));
    if (!maps[0] || !maps[1]) return null;
    return { ids: maps.flatMap(map => map!.ids), sortValues: maps.flatMap((map, section) => map!.sortValues.map(values => [section, ...values])),
      length: maps[0].length + maps[1].length };
  }

  async seek(params: SearchParams, offset: number, signal: AbortSignal): Promise<{ page: SearchAfterResult; offset: number }> {
    const bounds = await this.bounds(params, signal);
    const local = offset - bounds.batch;
    if (local < 10_000) {
      const page = await this.page({ ...params, offset }, null, signal);
      return { page, offset: page.uploadOffset ?? offset };
    }
    const other = this.parts(params)[1];
    const estimate = await this.source.estimateSortValue(other, "uploadTime", 100 * (1 - local / Math.max(1, bounds.other)), signal);
    signal.throwIfAborted();
    if (estimate === null) throw new Error("Other-upload position is unavailable");
    const page = await this.page(params, [1, estimate, ""], signal);
    const actual = page.sortValues[0] ? await this.rank(params, page.sortValues[0], signal) : offset;
    return { page, offset: actual };
  }
}