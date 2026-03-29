/**
 * Tests for the ES adapter's sort clause builder and countBefore query builder.
 *
 * These tests validate the tiebreaker sort behaviour (Step 1 of search_after plan)
 * and the sort value handling without requiring a running ES instance.
 */

import { describe, it, expect } from "vitest";
import { buildSortClause } from "./es-adapter";

describe("buildSortClause", () => {
  it("returns default sort with tiebreaker when no orderBy", () => {
    const result = buildSortClause();
    expect(result).toEqual([{ uploadTime: "desc" }, { id: "asc" }]);
  });

  it("returns default sort with tiebreaker for undefined", () => {
    const result = buildSortClause(undefined);
    expect(result).toEqual([{ uploadTime: "desc" }, { id: "asc" }]);
  });

  it("appends tiebreaker to a simple desc sort", () => {
    const result = buildSortClause("-uploadTime");
    expect(result).toEqual([{ uploadTime: "desc" }, { id: "asc" }]);
  });

  it("appends tiebreaker to a simple asc sort", () => {
    const result = buildSortClause("uploadTime");
    expect(result).toEqual([{ uploadTime: "asc" }, { id: "asc" }]);
  });

  it("appends tiebreaker to a multi-field sort", () => {
    const result = buildSortClause("-uploadTime,-credit");
    expect(result).toEqual([
      { uploadTime: "desc" },
      { "metadata.credit": "desc" },
      { id: "asc" },
    ]);
  });

  it("expands the 'taken' alias and appends tiebreaker", () => {
    const result = buildSortClause("-taken");
    // "taken" → "metadata.dateTaken,-uploadTime"
    // With outer negation: dateTaken becomes asc (neg XOR neg), uploadTime becomes desc (neg XOR no-neg)
    // Actually: -taken → -(metadata.dateTaken,-uploadTime)
    //   metadata.dateTaken: outer neg=true, inner neg=false → final neg=true → desc
    //   -uploadTime: outer neg=true, inner neg=true → final neg=false → asc... wait
    // Let me trace through the code:
    // part = "-taken", neg=true, bare="taken"
    // aliases["taken"] = "metadata.dateTaken,-uploadTime"
    // sub "metadata.dateTaken": subNeg=false, subBare="metadata.dateTaken"
    //   finalNeg = true !== false = true → "-metadata.dateTaken"
    // sub "-uploadTime": subNeg=true, subBare="uploadTime"
    //   finalNeg = true !== true = false → "uploadTime"
    expect(result).toEqual([
      { "metadata.dateTaken": "desc" },
      { uploadTime: "asc" },
      { id: "asc" },
    ]);
  });

  it("expands the 'taken' alias (ascending) and appends tiebreaker", () => {
    const result = buildSortClause("taken");
    // taken → "metadata.dateTaken,-uploadTime"
    // No outer negation:
    //   metadata.dateTaken → asc
    //   -uploadTime → desc
    expect(result).toEqual([
      { "metadata.dateTaken": "asc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);
  });

  it("expands 'width' alias to source.dimensions.width with tiebreaker", () => {
    const result = buildSortClause("-width");
    expect(result).toEqual([
      { "source.dimensions.width": "desc" },
      { id: "asc" },
    ]);
  });

  it("expands 'height' alias to source.dimensions.height with tiebreaker", () => {
    const result = buildSortClause("height");
    expect(result).toEqual([
      { "source.dimensions.height": "asc" },
      { id: "asc" },
    ]);
  });

  it("does not duplicate tiebreaker if id is already the last field", () => {
    // Edge case: someone sorts by 'id' explicitly
    const result = buildSortClause("id");
    expect(result).toEqual([{ id: "asc" }]);
    // No duplicate { id: "asc" }
  });

  it("expands short alias 'credit' to metadata.credit", () => {
    const result = buildSortClause("-credit");
    expect(result).toEqual([{ "metadata.credit": "desc" }, { id: "asc" }]);
  });

  it("expands short alias 'source' to metadata.source", () => {
    const result = buildSortClause("source");
    expect(result).toEqual([{ "metadata.source": "asc" }, { id: "asc" }]);
  });

  it("expands short alias 'imageType' to metadata.imageType", () => {
    const result = buildSortClause("-imageType");
    expect(result).toEqual([{ "metadata.imageType": "desc" }, { id: "asc" }]);
  });

  it("expands short alias 'category' to usageRights.category", () => {
    const result = buildSortClause("category");
    expect(result).toEqual([{ "usageRights.category": "asc" }, { id: "asc" }]);
  });


  it("expands short alias 'mimeType' to source.mimeType", () => {
    const result = buildSortClause("-mimeType");
    expect(result).toEqual([{ "source.mimeType": "desc" }, { id: "asc" }]);
  });

  it("tiebreaker is always the last element", () => {
    const cases = [
      undefined,
      "-uploadTime",
      "uploadTime",
      "-taken",
      "taken",
      "-credit",
      "-width",
      "-height",
      "-uploadTime,-credit",
    ];

    for (const orderBy of cases) {
      const result = buildSortClause(orderBy);
      const last = result[result.length - 1];
      expect(last).toEqual({ id: "asc" });
    }
  });
});

