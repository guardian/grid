/**
 * Opt-in real-Elasticsearch oracle for special date sorts.
 *
 * Run after changing special sort clauses, reverse pagination, cursor
 * extraction, position maps, date distributions, countBefore, mappings, or the
 * Elasticsearch version:
 *
 *   KUPUA_LOCAL_ES_MUTATION_OK=1 npm --prefix kupua run test:special-sort-es
 *
 * This file is explicitly excluded from habitual unit and E2E suites.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildSortClause,
  reverseSortClause,
} from "@/dal/adapters/elasticsearch/sort-builders";
import { ElasticsearchDataSource } from "@/dal/es-adapter";
import { extractSortValues } from "@/lib/image-offset-cache";
import type { Image } from "@/types/image";

declare const scheduler: undefined;
(global as Record<string, unknown>).scheduler = undefined;

const ES_ORIGIN = new URL("http://127.0.0.1:9220");
const SAMPLE_INDEX = "images";
const PAGE_SIZE = 2;

interface EsHit {
  _id: string;
  _source: Image;
  sort: Array<string | number | null>;
}

interface SearchResponse {
  hits: {
    hits: EsHit[];
  };
}

const fixtureDocuments = [
  {
    id: "slice-f-a",
    uploadTime: "2024-05-01T00:00:00.000Z",
    usages: [
      { id: "usage-a-1", platform: "digital", status: "published", dateAdded: "2024-01-01T00:00:00.000Z" },
      { id: "usage-a-2", platform: "digital", status: "published", dateAdded: "2024-03-01T00:30:00+02:00" },
      { id: "usage-a-3", platform: "digital", status: "published", dateAdded: "2024-02-29T23:30:00Z" },
    ],
    collections: [
      { pathId: "collection-a-1", actionData: { author: "fixture", date: "2024-01-01T00:00:00.000Z" } },
      { pathId: "collection-a-2", actionData: { author: "fixture", date: "2024-03-01T00:30:00+02:00" } },
      { pathId: "collection-a-3", actionData: { author: "fixture", date: "2024-02-29T23:30:00Z" } },
    ],
  },
  {
    id: "slice-f-b",
    uploadTime: "2024-05-02T00:00:00.000Z",
    usages: [
      { id: "usage-b-1", platform: "digital", status: "published", dateAdded: "2024-02-01T00:00:00.000Z" },
    ],
    collections: [
      { pathId: "collection-b-1", actionData: { author: "fixture", date: "2024-02-01T00:00:00.000Z" } },
    ],
  },
  {
    id: "slice-f-c",
    uploadTime: "2024-05-03T00:00:00.000Z",
    usages: [
      { id: "usage-c-1", platform: "digital", status: "published", dateAdded: "2024-01-15T00:00:00.000Z" },
      { id: "usage-c-2", platform: "digital", status: "published", dateAdded: "2024-04-01T00:00:00.000Z" },
    ],
    collections: [
      { pathId: "collection-c-1", actionData: { author: "fixture", date: "2024-01-15T00:00:00.000Z" } },
      { pathId: "collection-c-2", actionData: { author: "fixture", date: "2024-04-01T00:00:00.000Z" } },
    ],
  },
  {
    id: "slice-f-d",
    uploadTime: "2024-05-04T00:00:00.000Z",
    usages: [
      { id: "usage-d-1", platform: "digital", status: "published" },
    ],
    collections: [
      { pathId: "collection-d-1", actionData: { author: "fixture" } },
    ],
  },
  {
    id: "slice-f-e",
    uploadTime: "2024-05-05T00:00:00.000Z",
  },
  {
    id: "slice-f-f",
    uploadTime: "2024-05-03T00:00:00.000Z",
    usages: [
      { id: "usage-f-1", platform: "digital", status: "published", dateAdded: "2024-04-01T00:00:00.000Z" },
    ],
    collections: [
      { pathId: "collection-f-1", actionData: { author: "fixture", date: "2024-04-01T00:00:00.000Z" } },
    ],
  },
  {
    id: "slice-f-g",
    uploadTime: "2024-05-02T00:00:00.000Z",
    usages: [
      { id: "usage-g-1", platform: "digital", status: "published", dateAdded: "2024-04-01T00:00:00.000Z" },
    ],
    collections: [
      { pathId: "collection-g-1", actionData: { author: "fixture", date: "2024-04-01T00:00:00.000Z" } },
    ],
  },
].map((document) => ({
  uploadedBy: "fixture",
  source: {
    mimeType: "image/jpeg",
    dimensions: { width: 1, height: 1 },
  },
  metadata: {},
  ...document,
})) as unknown as Image[];

const mapping = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
  mappings: {
    dynamic: "strict",
    properties: {
      id: { type: "keyword" },
      uploadTime: { type: "date" },
      uploadedBy: { type: "keyword" },
      source: {
        type: "object",
        dynamic: "strict",
        properties: {
          mimeType: { type: "keyword" },
          dimensions: {
            type: "object",
            dynamic: "strict",
            properties: {
              width: { type: "integer" },
              height: { type: "integer" },
            },
          },
        },
      },
      metadata: { type: "object", dynamic: "strict", properties: {} },
      usages: {
        type: "nested",
        dynamic: "strict",
        properties: {
          id: { type: "keyword" },
          platform: { type: "keyword" },
          status: { type: "keyword" },
          dateAdded: { type: "date" },
        },
      },
      collections: {
        type: "object",
        dynamic: "strict",
        properties: {
          pathId: { type: "keyword" },
          actionData: {
            type: "object",
            dynamic: "strict",
            properties: {
              author: { type: "keyword" },
              date: { type: "date" },
            },
          },
        },
      },
    },
  },
};

async function esRequest(
  path: string,
  init?: RequestInit,
  expectedStatuses: number[] = [200],
): Promise<Response> {
  const response = await fetch(new URL(path, ES_ORIGIN), init);
  expect(
    expectedStatuses,
    `${init?.method ?? "GET"} ${path} returned ${response.status}`,
  ).toContain(response.status);
  return response;
}

async function count(index: string): Promise<number> {
  const response = await esRequest(`/${index}/_count`);
  return ((await response.json()) as { count: number }).count;
}

async function distributionEvidence(index: string): Promise<{
  usageExact: number;
  usageEvidence: number;
  collectionExact: number;
  collectionEvidence: number;
}> {
  const response = await esRequest(`/${index}/_search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      size: 0,
      aggs: {
        usage_exact: {
          filter: {
            nested: {
              path: "usages",
              query: { exists: { field: "usages.dateAdded" } },
            },
          },
        },
        usage_dates: {
          nested: { path: "usages" },
          aggs: {
            timeline: {
              date_histogram: {
                field: "usages.dateAdded",
                calendar_interval: "day",
                min_doc_count: 1,
              },
              aggs: { parents: { reverse_nested: {} } },
            },
            evidence: {
              sum_bucket: { buckets_path: "timeline>parents._count" },
            },
          },
        },
        collection_exact: {
          filter: { exists: { field: "collections.actionData.date" } },
        },
        collection_dates: {
          date_histogram: {
            field: "collections.actionData.date",
            calendar_interval: "day",
            min_doc_count: 1,
          },
        },
        collection_evidence: {
          sum_bucket: { buckets_path: "collection_dates>_count" },
        },
      },
    }),
  });
  const aggregations = (await response.json()) as {
    aggregations: {
      usage_exact: { doc_count: number };
      usage_dates: { evidence: { value: number } };
      collection_exact: { doc_count: number };
      collection_evidence: { value: number };
    };
  };
  return {
    usageExact: aggregations.aggregations.usage_exact.doc_count,
    usageEvidence: aggregations.aggregations.usage_dates.evidence.value,
    collectionExact: aggregations.aggregations.collection_exact.doc_count,
    collectionEvidence: aggregations.aggregations.collection_evidence.value,
  };
}

async function search(
  index: string,
  sort: Record<string, unknown>[],
  query: Record<string, unknown>,
  size: number,
  searchAfter?: Array<string | number | null>,
): Promise<EsHit[]> {
  const response = await esRequest(`/${index}/_search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      size,
      query,
      sort,
      ...(searchAfter ? { search_after: searchAfter } : {}),
    }),
  });
  return ((await response.json()) as SearchResponse).hits.hits;
}

async function walk(
  index: string,
  sort: Record<string, unknown>[],
  query: Record<string, unknown>,
): Promise<EsHit[]> {
  const hits: EsHit[] = [];
  let cursor: Array<string | number | null> | undefined;
  do {
    const page = await search(index, sort, query, PAGE_SIZE, cursor);
    hits.push(...page);
    cursor = page.at(-1)?.sort;
    if (page.length < PAGE_SIZE) break;
  } while (cursor);
  return hits;
}

function populatedQuery(orderBy: string): Record<string, unknown> {
  if (orderBy.includes("usagesDateAdded")) {
    return {
      nested: {
        path: "usages",
        query: { exists: { field: "usages.dateAdded" } },
      },
    };
  }
  return { exists: { field: "collections.actionData.date" } };
}

async function withFixtureAdapter<T>(
  index: string,
  action: (adapter: ElasticsearchDataSource) => Promise<T>,
): Promise<T> {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const raw = typeof input === "string" ? input : input.toString();
    let url: URL;
    if (raw.startsWith("/es/images/_pit")) {
      url = new URL(`/${index}/_pit${raw.slice("/es/images/_pit".length)}`, ES_ORIGIN);
    } else if (raw.startsWith("/es/images/")) {
      url = new URL(`/${index}/${raw.slice("/es/images/".length)}`, ES_ORIGIN);
    } else if (raw.startsWith("/es/")) {
      url = new URL(raw.slice("/es".length), ES_ORIGIN);
    } else {
      url = new URL(raw);
    }
    return nativeFetch(url, init);
  };

  try {
    return await action(new ElasticsearchDataSource());
  } finally {
    globalThis.fetch = nativeFetch;
  }
}

async function walkWithAdapter(
  adapter: ElasticsearchDataSource,
  orderBy: string,
): Promise<{ ids: string[]; sortValues: Array<Array<string | number | null>> }> {
  let pitId = await adapter.openPit("1m");
  let cursor: Array<string | number | null> | null = null;
  const ids: string[] = [];
  const sortValues: Array<Array<string | number | null>> = [];
  try {
    while (true) {
      const page = await adapter.searchAfter(
        { orderBy, nonFree: "true", length: PAGE_SIZE },
        cursor,
        pitId,
      );
      if (page.pitId) pitId = page.pitId;
      ids.push(...page.hits.map((hit) => hit.id));
      sortValues.push(...page.sortValues);
      if (page.hits.length < PAGE_SIZE) break;
      cursor = page.sortValues.at(-1) ?? null;
    }
  } finally {
    await adapter.closePit(pitId);
  }
  return { ids, sortValues };
}

describe("special date sorts against local Elasticsearch", () => {
  it("selects max dates and preserves forward/reverse pagination", async () => {
    expect(process.env.KUPUA_LOCAL_ES_MUTATION_OK).toBe("1");
    expect(ES_ORIGIN).toMatchObject({
      protocol: "http:",
      hostname: "127.0.0.1",
      port: "9220",
      username: "",
      password: "",
    });

    const indexName = `kupua-special-sort-${process.pid}-${randomUUID()}`.toLowerCase();
    expect(indexName).toMatch(/^kupua-special-sort-[a-z0-9-]+$/);
    const sampleCountBefore = await count(SAMPLE_INDEX);

    try {
      await esRequest(`/${indexName}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mapping),
      });

      for (const document of fixtureDocuments) {
        await esRequest(`/${indexName}/_doc/${document.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(document),
        }, [200, 201]);
      }
      await esRequest(`/${indexName}/_refresh`, { method: "POST" });

      expect(await distributionEvidence(indexName)).toEqual({
        usageExact: 5,
        usageEvidence: 7,
        collectionExact: 5,
        collectionEvidence: 7,
      });

      for (const field of ["usagesDateAdded", "dateAddedToCollection"]) {
        for (const descending of [false, true]) {
          const orderBy = descending ? `-${field}` : field;
          const expectedPopulated = descending
            ? ["slice-f-c", "slice-f-f", "slice-f-g", "slice-f-a", "slice-f-b"]
            : ["slice-f-b", "slice-f-a", "slice-f-g", "slice-f-c", "slice-f-f"];
          const sort = buildSortClause(orderBy);
          const query = populatedQuery(orderBy);

          const forwardHits = await walk(indexName, sort, query);
          expect(forwardHits.map((hit) => hit._id)).toEqual(expectedPopulated);
          expect(new Set(forwardHits.map((hit) => hit._id)).size).toBe(5);
          for (const hit of forwardHits) {
            expect(extractSortValues(hit._source, orderBy)).toEqual(hit.sort);
          }

          const firstForwardPage = await search(
            indexName,
            sort,
            query,
            PAGE_SIZE,
          );
          const laterForwardPage = await search(
            indexName,
            sort,
            query,
            PAGE_SIZE,
            firstForwardPage.at(-1)?.sort,
          );
          expect(laterForwardPage).toHaveLength(2);
          const precedingRaw = await search(
            indexName,
            reverseSortClause(sort),
            query,
            PAGE_SIZE,
            laterForwardPage[0].sort,
          );
          expect(precedingRaw.map((hit) => hit._id).reverse()).toEqual(
            firstForwardPage.map((hit) => hit._id),
          );
          expect(new Set([
            ...firstForwardPage,
            ...laterForwardPage,
          ].map((hit) => hit._id)).size).toBe(4);

          // Raw ES represents missing date sorts with an internal numeric
          // sentinel that cannot be round-tripped through search_after.
          // Production sanitizes it and switches to the null-zone query;
          // H/J own that cross-boundary pagination parity. Slice F proves
          // terminal null placement in one page.
          const allHits = await search(indexName, sort, { match_all: {} }, 7);
          expect(allHits.map((hit) => hit._id)).toEqual(
            descending
              ? ["slice-f-c", "slice-f-f", "slice-f-g", "slice-f-a", "slice-f-b", "slice-f-e", "slice-f-d"]
              : ["slice-f-b", "slice-f-a", "slice-f-g", "slice-f-c", "slice-f-f", "slice-f-d", "slice-f-e"],
          );
          for (const hit of allHits.slice(5)) {
            expect(extractSortValues(hit._source, orderBy)).toEqual([
              null,
              Date.parse(hit._source.uploadTime),
              hit._source.id,
            ]);
          }

          const parity = await withFixtureAdapter(indexName, async (adapter) => {
            const ordinary = await walkWithAdapter(adapter, orderBy);
            return {
              ordinary,
              positionMap: await adapter.fetchPositionIndex(
                { orderBy, nonFree: "true" },
                new AbortController().signal,
              ),
              countBefore: await Promise.all(
                ordinary.sortValues.map((cursor) => adapter.countBefore(
                  { orderBy, nonFree: "true" },
                  cursor,
                )),
              ),
              populatedRange: await adapter.getIdRange(
                { orderBy, nonFree: "true" },
                ordinary.sortValues[0],
                ordinary.sortValues[3],
              ),
              crossBoundaryRange: await adapter.getIdRange(
                { orderBy, nonFree: "true" },
                ordinary.sortValues[2],
                ordinary.sortValues[6],
              ),
              endPage: await adapter.searchAfter(
                { orderBy, nonFree: "true", length: PAGE_SIZE },
                null,
                null,
                undefined,
                true,
                true,
              ),
            };
          });
          expect(parity.positionMap?.ids).toEqual(parity.ordinary.ids);
          expect(parity.positionMap?.sortValues).toEqual(parity.ordinary.sortValues);
          expect(parity.ordinary.ids).toEqual(allHits.map((hit) => hit._id));
          expect(parity.countBefore).toEqual([0, 1, 2, 3, 4, 5, 6]);
          expect(parity.populatedRange.ids).toEqual(parity.ordinary.ids.slice(1, 4));
          expect(parity.crossBoundaryRange.ids).toEqual(parity.ordinary.ids.slice(3, 7));
          expect(parity.endPage.hits.map((hit) => hit.id)).toEqual(parity.ordinary.ids.slice(-PAGE_SIZE));
          expect(parity.endPage.sortValues).toEqual(parity.ordinary.sortValues.slice(-PAGE_SIZE));
        }
      }
    } finally {
      try {
        await esRequest(`/${indexName}`, { method: "DELETE" }, [200, 404]);
        await esRequest(`/${indexName}`, undefined, [404]);
      } finally {
        expect(await count(SAMPLE_INDEX)).toBe(sampleCountBefore);
      }
    }
  });
});