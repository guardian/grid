import { afterEach, describe, expect, it, vi } from "vitest";
import { ElasticsearchDataSource } from "@/dal/es-adapter";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stage 04 map completeness characterization", () => {
  it.each([
    { label: "complete control", timedOut: false, failedShards: 0 },
    { label: "timed-out short page", timedOut: true, failedShards: 0 },
    { label: "failed-shard short page", timedOut: false, failedShards: 1 },
  ])("returns a non-null map for $label", async ({ timedOut, failedShards }) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: "synthetic-pit" }))
      .mockResolvedValueOnce(response({
        timed_out: timedOut,
        _shards: { total: 2, successful: 2 - failedShards, skipped: 0, failed: failedShards },
        hits: { hits: [{ _id: "synthetic-image", sort: [1000, "synthetic-image", 7] }] },
      }))
      .mockResolvedValueOnce(response({
        timed_out: false,
        _shards: { total: 2, successful: 2, skipped: 0, failed: 0 },
        hits: { hits: [] },
      }))
      .mockResolvedValueOnce(response({ succeeded: true }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("scheduler", undefined);

    const map = await new ElasticsearchDataSource().fetchPositionIndex(
      { orderBy: "-uploadTime", nonFree: "true" },
      new AbortController().signal,
    );

    expect(map).toEqual({
      length: 1,
      ids: ["synthetic-image"],
      sortValues: [[1000, "synthetic-image"]],
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe("DELETE");
  });
});