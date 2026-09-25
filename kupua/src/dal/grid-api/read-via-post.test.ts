import { describe, expect, it } from "vitest";
import { GRID_API_READ_VIA_POST, isGridApiReadViaPost } from "./read-via-post";

describe("Grid API read-via-POST allowlist", () => {
  it.each(GRID_API_READ_VIA_POST)("admits POST %s, with or without a query string", (path) => {
    expect(isGridApiReadViaPost("POST", path)).toBe(true);
    expect(isGridApiReadViaPost("POST", `${path}?include=usages`)).toBe(true);
  });

  it.each(GRID_API_READ_VIA_POST)("refuses a write route whose image id is %s", (path) => {
    expect(isGridApiReadViaPost("POST", `${path}/partner/true/syndicateImage`)).toBe(false);
    expect(isGridApiReadViaPost("POST", `${path}/`)).toBe(false);
    expect(isGridApiReadViaPost("POST", `${path}x`)).toBe(false);
  });

  it("refuses other methods and unlisted paths", () => {
    expect(isGridApiReadViaPost("PUT", "/images/count")).toBe(false);
    expect(isGridApiReadViaPost("DELETE", "/images/keys")).toBe(false);
    expect(isGridApiReadViaPost("POST", "/images/abc/usages")).toBe(false);
    expect(isGridApiReadViaPost("POST", undefined)).toBe(false);
    expect(isGridApiReadViaPost(undefined, "/images/count")).toBe(false);
  });
});
