import { afterEach, describe, expect, it, vi } from "vitest";
import { MockDataSource } from "@/dal/mock-data-source";
import type { ImageDataSource, SortDistribution, SortValues } from "@/dal";
import { buildSortClause, parseSortField } from "@/dal";
import type { Image } from "@/types/image";
import { useSearchStore } from "./search-store";

const TOTAL = 120_000;
const COVERED_COUNT = 80_000;
const TARGET = 20_000;
const FETCH_START = TARGET - 100;
const ESTIMATE = 1_700_000_000_000;

const sortDistribution: SortDistribution = {
  buckets: [],
  coveredCount: COVERED_COUNT,
};

const hit: Image = {
  id: "special-sort-hit",
  uploadTime: "2023-11-14T22:13:20.000Z",
  uploadedBy: "fixture",
  source: {
    mimeType: "image/jpeg",
    dimensions: { width: 100, height: 100 },
  },
  metadata: {},
};

function resetStore(dataSource: ImageDataSource, orderBy: string) {
  useSearchStore.setState({
    dataSource,
    params: {
      orderBy,
      offset: 0,
      length: 200,
      nonFree: "true",
    },
    results: [],
    bufferOffset: 0,
    total: TOTAL,
    loading: false,
    error: null,
    imagePositions: new Map(),
    startCursor: null,
    endCursor: null,
    pitId: null,
    positionMap: null,
    sortDistribution,
    nullZoneDistribution: null,
    focusedImageId: null,
    sortAroundFocusStatus: null,
    _extendForwardInFlight: false,
    _extendBackwardInFlight: false,
    _seekGeneration: 0,
    _seekTargetLocalIndex: -1,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("special-date populated-zone deep seek", () => {
  it.each([
    {
      orderBy: "-usagesDateAdded",
      field: "usages.dateAdded",
      direction: "desc",
      percentile: (1 - TARGET / COVERED_COUNT) * 100,
      uploadAnchor: Number.MAX_SAFE_INTEGER,
    },
    {
      orderBy: "usagesDateAdded",
      field: "usages.dateAdded",
      direction: "asc",
      percentile: (TARGET / COVERED_COUNT) * 100,
      uploadAnchor: 0,
    },
    {
      orderBy: "-dateAddedToCollection",
      field: "collections.actionData.date",
      direction: "desc",
      percentile: (1 - TARGET / COVERED_COUNT) * 100,
      uploadAnchor: Number.MAX_SAFE_INTEGER,
    },
    {
      orderBy: "dateAddedToCollection",
      field: "collections.actionData.date",
      direction: "asc",
      percentile: (TARGET / COVERED_COUNT) * 100,
      uploadAnchor: 0,
    },
  ])(
    "$orderBy uses the $direction percentile and matching cursor shape",
    async ({ orderBy, field, direction, percentile, uploadAnchor }) => {
      const dataSource = new MockDataSource(TOTAL);
      const estimateSpy = vi
        .spyOn(dataSource, "estimateSortValue")
        .mockResolvedValue(ESTIMATE);
      vi.spyOn(dataSource, "countBefore").mockResolvedValue(FETCH_START);
      const searchAfterSpy = vi
        .spyOn(dataSource, "searchAfter")
        .mockResolvedValue({
          hits: [hit],
          total: TOTAL,
          sortValues: [[ESTIMATE, Date.parse(hit.uploadTime), hit.id]],
        });

      resetStore(dataSource, orderBy);
      await useSearchStore.getState().seek(TARGET);

      expect(estimateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy }),
        field,
        percentile,
        expect.any(AbortSignal),
      );

      const sortClause = buildSortClause(orderBy);
      expect(parseSortField(sortClause[0])).toEqual({ field, direction });

      const forwardCursor = searchAfterSpy.mock.calls.find(
        ([, cursor, , , reverse]) => reverse !== true && cursor?.[2] === "",
      )?.[1] as SortValues | undefined;
      expect(forwardCursor).toEqual([ESTIMATE, uploadAnchor, ""]);
      expect(forwardCursor).toHaveLength(sortClause.length);
      expect(forwardCursor?.map((value) => typeof value)).toEqual([
        "number",
        "number",
        "string",
      ]);
    },
  );
});