import { describe, expect, it } from "vitest";
import { traceActionsForNavigation } from "./perceived-navigation";

describe("traceActionsForNavigation", () => {
  it("claims focused and unfocused sort interactions for sort-only navigation", () => {
    expect(traceActionsForNavigation(true, true, ["orderBy"])).toEqual([
      "sort-around-focus",
      "sort-no-focus",
    ]);
  });

  it("does not claim interactions for popstate navigation", () => {
    expect(traceActionsForNavigation(false, true, ["orderBy"])).toEqual([]);
  });

  it("preserves query-action precedence", () => {
    expect(traceActionsForNavigation(true, false, ["query"])).toEqual([
      "metadata-click",
      "facet-click",
      "chip-remove",
      "search",
    ]);
  });
});