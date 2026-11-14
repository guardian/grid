import { describe, expect, it, vi } from "vitest";
import type { Image } from "@/types/image";
import type { ImageDataSource, SearchAfterResult } from "./types";
import { ResidentSampleDataSource } from "./resident-sample-data-source";

function image(id: string, day: number): Image {
  return { id, uploadTime: `2026-01-${String(day).padStart(2, "0")}T00:00:00Z`,
    source: { dimensions: { width: 600, height: 400 } }, metadata: { credit: id } } as Image;
}

function fixture(images = [image("sample-b", 2), image("sample-a", 1), image("sample-c", 3)]) {
  const searchAfter = vi.fn<ImageDataSource["searchAfter"]>().mockResolvedValue({
    hits: images, total: 1_000_000, sortValues: [],
  });
  return { source: { searchAfter }, sample: new ResidentSampleDataSource({ searchAfter }) };
}

describe("resident real-photo sample", () => {
  it("coalesces concurrent startup reads into one bounded read without an exact total", async () => {
    let resolve!: (result: SearchAfterResult) => void;
    const searchAfter = vi.fn<ImageDataSource["searchAfter"]>().mockReturnValue(new Promise(r => { resolve = r; }));
    const sample = new ResidentSampleDataSource({ searchAfter });
    expect(searchAfter).not.toHaveBeenCalled();
    const reads = Promise.all([sample.count({}), sample.searchRange({}), sample.getById("sample-a")]);
    expect(searchAfter).toHaveBeenCalledTimes(1);
    expect(searchAfter).toHaveBeenCalledWith({
      nonFree: "true", orderBy: "-uploadTime", length: 96, trackTotalHits: false,
    }, null, null, expect.any(AbortSignal));
    resolve({ hits: [image("sample-a", 1)], total: 1_000_000, sortValues: [] });
    const [count, range, detail] = await reads;
    expect(count).toBe(1);
    expect(range.total).toBe(1);
    expect(detail?.image.id).toBe("sample-a");
    expect(searchAfter).toHaveBeenCalledTimes(1);
  });

  it("keeps arbitrary identities, dimensions, sorting and traversal within the sample", async () => {
    const { sample, source } = fixture();
    const first = await sample.searchAfter({ orderBy: "-uploadTime", length: 2 }, null);
    expect(first.hits.map(i => i.id)).toEqual(["sample-c", "sample-b"]);
    expect(first.total).toBe(3);
    const next = await sample.searchAfter({ orderBy: "-uploadTime", length: 2 }, first.sortValues[1]);
    expect(next.hits.map(i => i.id)).toEqual(["sample-a"]);
    const reverse = await sample.searchAfter({ orderBy: "-uploadTime", length: 2 }, next.sortValues[0], null, undefined, true);
    expect(reverse.hits.map(i => i.id)).toEqual(["sample-c", "sample-b"]);
    const ascending = await sample.searchRange({ orderBy: "uploadTime" });
    expect(ascending.hits.map(i => i.id)).toEqual(["sample-a", "sample-b", "sample-c"]);
    expect(await sample.countBefore({ orderBy: "-uploadTime" }, first.sortValues[1])).toBe(1);
    expect((await sample.getById("sample-b"))?.image.source.dimensions).toEqual({ width: 600, height: 400 });
    expect(await sample.getById("outside-sample")).toBeUndefined();
    expect(await sample.getById("img-0")).toBeUndefined();
    expect((await sample.getByIds(["sample-a", "outside-sample", "sample-c"])).map(i => i.id))
      .toEqual(["sample-a", "sample-c"]);
    expect(await sample.getIdRange({ orderBy: "uploadTime" }, ascending.sortValues![0], ascending.sortValues![2]))
      .toMatchObject({ ids: ["sample-b", "sample-c"], truncated: false });
    expect(source.searchAfter).toHaveBeenCalledTimes(1);
  });

  it("does not forward user searches, IDs, counts, aggregations or PIT operations remotely", async () => {
    const { sample, source } = fixture();
    await sample.searchRange({ query: "unrelated query", length: 10_000 });
    await sample.count({ query: "another query" });
    await sample.countWithTickers({});
    await sample.getAggregations({}, []);
    expect((await sample.searchAfter({ ids: "outside-sample" }, null)).hits).toEqual([]);
    expect(await sample.openPit()).toBeNull();
    await sample.closePit("unused");
    expect(await sample.estimateSortValue({}, "uploadTime", 50)).toBeNull();
    expect(source.searchAfter).toHaveBeenCalledTimes(1);
    expect(source.searchAfter.mock.calls[0][0]).not.toHaveProperty("query");
    expect(source.searchAfter.mock.calls[0][0]).not.toHaveProperty("ids");
  });

  it("caps unexpected oversized responses and removes duplicate identities", async () => {
    const { sample } = fixture(Array.from({ length: 200 }, (_, i) => image(`sample-${i}`, 1)));
    expect(await sample.count({})).toBe(96);
    expect((await sample.searchRange({ length: 10_000 })).hits).toHaveLength(96);
    const duplicate = fixture([image("sample-a", 1), image("sample-a", 1)]);
    expect(await duplicate.sample.count({})).toBe(1);
  });

  it("treats failure as an empty sample without retries or live fallback", async () => {
    const searchAfter = vi.fn<ImageDataSource["searchAfter"]>().mockRejectedValue(new Error("Unavailable"));
    const sample = new ResidentSampleDataSource({ searchAfter });
    expect(await sample.count({})).toBe(0);
    expect((await sample.searchRange({})).hits).toEqual([]);
    expect(await sample.getById("outside-sample")).toBeUndefined();
    expect(searchAfter).toHaveBeenCalledTimes(1);
  });

  it("retains an empty response instead of issuing more sample requests", async () => {
    const { sample, source } = fixture([]);
    expect(await sample.count({})).toBe(0);
    expect((await sample.searchAfter({}, null)).hits).toEqual([]);
    expect(source.searchAfter).toHaveBeenCalledTimes(1);
  });
});
