import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElasticsearchDataSource } from "./es-adapter";
import { apiSearchAfter, SearchAfterApiError } from "./grid-api-search-adapter";
import { StranglerAdapter } from "./strangler-adapter";

vi.mock("./grid-api-search-adapter", async (importOriginal) => ({
  ...await importOriginal<typeof import("./grid-api-search-adapter")>(),
  apiSearchAfter: vi.fn(),
}));

describe("StranglerAdapter.searchAfter", () => {
  let elasticsearch: ElasticsearchDataSource;
  let adapter: StranglerAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiSearchAfter).mockReset();
    elasticsearch = new ElasticsearchDataSource();
    adapter = new StranglerAdapter(elasticsearch);
  });

  describe("bounded recovery", () => {
    const params = { orderBy: "-uploadTime", nonFree: "true", length: 200 };
    const cursor = [1_700_000_000_000, "image-id"];
    const page = { hits: [], total: 0, sortValues: [] };

    it("uses direct ES once for API availability failure with the same cursor and direction", async () => {
      vi.mocked(apiSearchAfter).mockRejectedValue(new SearchAfterApiError("unavailable", 502));
      const fallback = vi.spyOn(elasticsearch, "searchAfter").mockResolvedValue(page);
      const signal = new AbortController().signal;

      await expect(adapter.searchAfter(params, cursor, "pit-id", signal, true, true)).resolves.toBe(page);
      expect(apiSearchAfter).toHaveBeenCalledTimes(1);
      expect(fallback).toHaveBeenCalledTimes(1);
      expect(fallback).toHaveBeenCalledWith(params, cursor, "pit-id", signal, true, true);
    });

    it("retries explicit expiry once through media-api without a PIT and clears its returned ID", async () => {
      vi.mocked(apiSearchAfter)
        .mockRejectedValueOnce(new SearchAfterApiError("pit-expired", 410))
        .mockResolvedValueOnce(page);
      const fallback = vi.spyOn(elasticsearch, "searchAfter");
      const signal = new AbortController().signal;

      await expect(adapter.searchAfter(params, cursor, "expired-pit", signal, true)).resolves.toEqual({ ...page, pitId: null });
      expect(apiSearchAfter).toHaveBeenCalledTimes(2);
      expect(apiSearchAfter).toHaveBeenLastCalledWith(params, cursor, null, signal, true, undefined);
      expect(fallback).not.toHaveBeenCalled();
    });

    it.each(["expiry", "availability", "refusal"] as const)("stops when the live expiry retry fails with %s", async (failure) => {
      const retryError = new SearchAfterApiError(failure === "expiry" ? "pit-expired" : failure === "availability" ? "unavailable" : "refused");
      vi.mocked(apiSearchAfter)
        .mockRejectedValueOnce(new SearchAfterApiError("pit-expired", 410))
        .mockRejectedValueOnce(retryError);
      const fallback = vi.spyOn(elasticsearch, "searchAfter");

      await expect(adapter.searchAfter(params, cursor, "expired-pit")).rejects.toBe(retryError);
      expect(apiSearchAfter).toHaveBeenCalledTimes(2);
      expect(fallback).not.toHaveBeenCalled();
    });

    it("does not retry an expiry response when no PIT was sent", async () => {
      const error = new SearchAfterApiError("pit-expired", 410);
      vi.mocked(apiSearchAfter).mockRejectedValue(error);
      const fallback = vi.spyOn(elasticsearch, "searchAfter");

      await expect(adapter.searchAfter(params, cursor, null)).rejects.toBe(error);
      expect(apiSearchAfter).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();
    });

    it.each([
      new SearchAfterApiError("refused", 401), new SearchAfterApiError("refused", 403),
      new SearchAfterApiError("refused", 422), new SearchAfterApiError("refused", 429),
      new SearchAfterApiError("refused", 503), new Error("unexpected failure"),
      new DOMException("cancelled", "AbortError"),
    ])("does not bypass a refusal or unexpected failure: %s", async (error) => {
      vi.mocked(apiSearchAfter).mockRejectedValue(error);
      const fallback = vi.spyOn(elasticsearch, "searchAfter");

      await expect(adapter.searchAfter(params, cursor, "pit-id")).rejects.toBe(error);
      expect(apiSearchAfter).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();
    });

    it("does not recover after cancellation", async () => {
      const controller = new AbortController();
      vi.mocked(apiSearchAfter).mockImplementationOnce(async () => {
        controller.abort();
        throw new SearchAfterApiError("unavailable");
      });
      const fallback = vi.spyOn(elasticsearch, "searchAfter");

      await expect(adapter.searchAfter(params, cursor, "pit-id", controller.signal)).rejects.toBe(controller.signal.reason);
      expect(fallback).not.toHaveBeenCalled();
    });

    it("does not return a fallback page after cancellation", async () => {
      const controller = new AbortController();
      vi.mocked(apiSearchAfter).mockRejectedValue(new SearchAfterApiError("unavailable"));
      vi.spyOn(elasticsearch, "searchAfter").mockImplementation(async () => {
        controller.abort();
        return page;
      });

      await expect(adapter.searchAfter(params, cursor, "pit-id", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    });

    it("propagates a direct fallback failure without retrying again", async () => {
      vi.mocked(apiSearchAfter).mockRejectedValue(new SearchAfterApiError("unavailable"));
      const error = new Error("ES unavailable");
      const fallback = vi.spyOn(elasticsearch, "searchAfter").mockRejectedValue(error);

      await expect(adapter.searchAfter(params, cursor, "pit-id")).rejects.toBe(error);
      expect(fallback).toHaveBeenCalledTimes(1);
      expect(apiSearchAfter).toHaveBeenCalledTimes(1);
    });
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