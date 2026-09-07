import { describe, expect, it } from "vitest";
import { isAiSortOptionEnabled } from "./SearchFilters";

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