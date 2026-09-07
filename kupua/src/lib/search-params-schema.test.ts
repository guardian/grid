import { describe, expect, it } from "vitest";
import {
  applySearchContextTransitions,
  canonicalizeSearchParams,
  hasCollectionFilter,
  type SearchContextMemory,
  type UrlSearchParams,
} from "./search-params-schema";

describe("hasCollectionFilter", () => {
  it.each([
    "collection:news/uk",
    "+collection:news/uk",
    "credit:PA +collection:news/uk",
    "~news/uk",
    "credit:PA ~news/uk",
  ])("recognizes %s", (query) => {
    expect(hasCollectionFilter(query)).toBe(true);
  });

  it.each([undefined, "", "credit:PA", "-collection:news/uk"])(
    "does not treat %j as an active collection filter",
    (query) => {
      expect(hasCollectionFilter(query)).toBe(false);
    },
  );
});

describe("applySearchContextTransitions", () => {
  it("restores the ordinary sort after AI enters and exits collection mode", () => {
    let memory: SearchContextMemory = {};
    let current: UrlSearchParams = { orderBy: "credit" };

    ({ params: current, memory } = applySearchContextTransitions(
      current,
      { aiQuery: "mountains" },
      memory,
    ));
    expect(current).toMatchObject({
      aiQuery: "mountains",
      orderBy: "-relevance",
    });

    ({ params: current, memory } = applySearchContextTransitions(
      current,
      { query: "collection:news/uk" },
      memory,
    ));
    expect(current).toMatchObject({
      aiQuery: undefined,
      query: "collection:news/uk",
      orderBy: "-dateAddedToCollection",
    });

    ({ params: current } = applySearchContextTransitions(
      current,
      { query: undefined },
      memory,
    ));
    expect(current).toMatchObject({
      aiQuery: undefined,
      query: undefined,
      orderBy: "credit",
    });
  });
});

describe("canonicalizeSearchParams", () => {
  it.each([
    [undefined, undefined],
    ["", "-uploadTime"],
    ["-lastModified,width", "-lastModified"],
    ["credit,source,uploadedBy", "credit"],
    ["credit,credit", "credit"],
    ["-usagesDateAdded,width", "-usagesDateAdded"],
    ["uploadTime,usagesDateAdded", "uploadTime"],
    ["bogus,width", "-uploadTime"],
    ["  -lastModified , width  ", "-lastModified"],
    ["-relevance", "-uploadTime"],
  ])("canonicalizes ordinary orderBy %j to %j", (orderBy, expected) => {
    expect(canonicalizeSearchParams({ orderBy }).orderBy).toBe(expected);
  });

  it.each([
    ["relevance", "relevance"],
    ["-relevance", "-relevance"],
    ["uploadTime", "uploadTime"],
    ["-uploadTime", "-uploadTime"],
    ["credit", "-relevance"],
    ["-usagesDateAdded", "-relevance"],
    ["bogus,uploadTime", "-relevance"],
  ])("canonicalizes AI orderBy %j to %j", (orderBy, expected) => {
    expect(
      canonicalizeSearchParams({ aiQuery: "mountains", orderBy }).orderBy,
    ).toBe(expected);
  });

  it("accepts sort aliases derived from the configured field registry", () => {
    expect(
      canonicalizeSearchParams({ orderBy: "editStatus" }).orderBy,
    ).toBe("editStatus");
  });

  it("drops AI atomically when a pasted URL contains a collection query", () => {
    expect(
      canonicalizeSearchParams({
        query: "collection:news/uk",
        aiQuery: "mountains",
        orderBy: "credit,width",
      }),
    ).toMatchObject({
      query: "collection:news/uk",
      aiQuery: undefined,
      orderBy: "credit",
    });
  });

  it.each(["+collection:news/uk", "~news/uk"])(
    "drops AI for collection form %s",
    (query) => {
      expect(
        canonicalizeSearchParams({
          query,
          aiQuery: "mountains",
          orderBy: "-relevance",
        }),
      ).toMatchObject({
        aiQuery: undefined,
        orderBy: "-dateAddedToCollection",
      });
    },
  );

  it("uses the collection default when a conflict has no ordinary sort", () => {
    expect(
      canonicalizeSearchParams({
        query: "collection:news/uk",
        aiQuery: "mountains",
        orderBy: "-relevance,width",
      }),
    ).toMatchObject({
      aiQuery: undefined,
      orderBy: "-dateAddedToCollection",
    });
  });

  it.each([undefined, "", "-relevance", "bogus,width"])(
    "uses the collection default for orderBy %j",
    (orderBy) => {
      expect(
        canonicalizeSearchParams({
          query: "collection:news/uk",
          orderBy,
        }).orderBy,
      ).toBe("-dateAddedToCollection");
    },
  );
});