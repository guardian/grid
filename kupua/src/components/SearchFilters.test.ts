import { describe, expect, it } from "vitest";
import { isAiSortOptionEnabled, isBatchSortOptionEnabled } from "./SearchFilters";

describe("isBatchSortOptionEnabled", () => {
  it("omits only the three irrelevant batch fields", () => {
    expect(["uploadTime", "credit", "usagesDateAdded", "dateAddedToCollection", "uploadedBy"]
      .filter(isBatchSortOptionEnabled)).toEqual(["uploadTime", "credit"]);
  });
});

describe("isAiSortOptionEnabled", () => {
  it.each(["relevance", "uploadTime"])("enables %s", (field) => {
    expect(isAiSortOptionEnabled(field)).toBe(true);
  });

  it.each(["credit", "width", "usagesDateAdded", "dateAddedToCollection"])(
    "disables %s",
    (field) => {
      expect(isAiSortOptionEnabled(field)).toBe(false);
    },
  );
});