import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElasticsearchDataSource } from "./es-adapter";
import { apiSearchAfter } from "./grid-api-search-adapter";
import { StranglerAdapter } from "./strangler-adapter";

vi.mock("./grid-api-search-adapter", () => ({
  apiSearchAfter: vi.fn(),
}));

describe("StranglerAdapter.searchAfter", () => {
  let elasticsearch: ElasticsearchDataSource;
  let adapter: StranglerAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    elasticsearch = new ElasticsearchDataSource();
    adapter = new StranglerAdapter(elasticsearch);
  });

  it("keeps cursorless non-zero offset paging on direct Elasticsearch", async () => {
    const expected = { hits: [], total: 0, sortValues: [] };
    const esSearchAfter = vi
      .spyOn(elasticsearch, "searchAfter")
      .mockResolvedValue(expected);

    await expect(adapter.searchAfter(
      { orderBy: "-usagesDateAdded", nonFree: "true", offset: 100, length: 200 },
      null,
      null,
    )).resolves.toBe(expected);

    expect(esSearchAfter).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 100 }),
      null,
      null,
      undefined,
      undefined,
      undefined,
    );
    expect(apiSearchAfter).not.toHaveBeenCalled();
  });

  it("continues to route genuine cursor pagination through media-api", async () => {
    const expected = { hits: [], total: 0, sortValues: [] };
    vi.mocked(apiSearchAfter).mockResolvedValue(expected);
    const cursor = [1_700_000_000_000, 1_600_000_000_000, "image-id"];

    await expect(adapter.searchAfter(
      { orderBy: "-usagesDateAdded", nonFree: "true", offset: 100, length: 200 },
      cursor,
      "pit-id",
    )).resolves.toBe(expected);

    expect(apiSearchAfter).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 100 }),
      cursor,
      "pit-id",
      undefined,
      undefined,
      undefined,
    );
  });

  it.each([
    { name: "PIT", pitId: "pit-id", reverse: undefined, seekToEnd: undefined },
    { name: "reverse", pitId: null, reverse: true, seekToEnd: undefined },
    { name: "End", pitId: null, reverse: true, seekToEnd: true },
  ])("keeps cursorless $name calls with stale offsets on media-api", async ({
    pitId,
    reverse,
    seekToEnd,
  }) => {
    const expected = { hits: [], total: 0, sortValues: [] };
    vi.mocked(apiSearchAfter).mockResolvedValue(expected);
    const esSearchAfter = vi.spyOn(elasticsearch, "searchAfter");

    await expect(adapter.searchAfter(
      { orderBy: "-usagesDateAdded", nonFree: "true", offset: 100, length: 200 },
      null,
      pitId,
      undefined,
      reverse,
      seekToEnd,
    )).resolves.toBe(expected);

    expect(apiSearchAfter).toHaveBeenCalled();
    expect(esSearchAfter).not.toHaveBeenCalled();
  });
});