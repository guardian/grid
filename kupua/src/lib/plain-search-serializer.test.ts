import { describe, it, expect } from "vitest";
import { plainParseSearch } from "./plain-search-serializer";

describe("plainParseSearch", () => {
  it("parses a plain string value", () => {
    expect(plainParseSearch("?nonFree=true")).toEqual({ nonFree: "true" });
  });

  it("parses multiple params", () => {
    expect(plainParseSearch("?nonFree=true&orderBy=oldest")).toEqual({
      nonFree: "true",
      orderBy: "oldest",
    });
  });

  it("does not strip quotes that are part of a CQL query value", () => {
    // A CQL query can legitimately start and end with a `"` — e.g. a single
    // quoted field key:value pair where the key contains a reserved char
    // (fileMetadata.xmp.dc:creator, quoted because of the colon).
    const raw = '"fileMetadata.xmp.dc:creator":"Alicia Canter"';
    expect(plainParseSearch(`?query=${encodeURIComponent(raw)}`)).toEqual({
      query: raw,
    });
  });

  it("does not strip quotes around a bare quoted phrase query", () => {
    const raw = '"Alicia Canter"';
    expect(plainParseSearch(`?query=${encodeURIComponent(raw)}`)).toEqual({
      query: raw,
    });
  });
});
