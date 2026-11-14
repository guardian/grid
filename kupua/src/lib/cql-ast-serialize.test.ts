import { createParser } from "@guardian/cql";
import { describe, expect, it } from "vitest";
import { queryStrFromAst } from "./cql-ast-serialize";

const parser = createParser({ shortcuts: { "#": "label", "~": "collection" } });

function roundTrip(query: string): string {
  const { queryAst, error } = parser(query);
  if (error || !queryAst) {
    throw new Error(`Failed to parse "${query}": ${error?.message}`);
  }
  return queryStrFromAst(queryAst);
}

describe("queryStrFromAst", () => {
  it("preserves quotes on a plain phrase containing a colon (the upstream bug)", () => {
    expect(roundTrip('"hello:world"')).toBe('"hello:world"');
  });

  it("preserves quotes on a plain phrase containing parens", () => {
    expect(roundTrip('"(parenthetical)"')).toBe('"(parenthetical)"');
  });

  it("preserves quotes on a raw ES field path used as a quoted phrase", () => {
    expect(roundTrip('"fileMetadata.xmp.dc:subject"')).toBe(
      '"fileMetadata.xmp.dc:subject"',
    );
  });

  it("drops quotes from a plain phrase with no reserved chars", () => {
    expect(roundTrip('"climate"')).toBe("climate");
  });

  it("preserves quotes on a phrase with only whitespace (unaffected by the fix)", () => {
    expect(roundTrip('"climate change"')).toBe('"climate change"');
  });

  it("still quotes chip keys/values with reserved chars (already correct upstream)", () => {
    expect(roundTrip('"fileMetadata.xmp.dc:creator":"Alicia Canter"')).toBe(
      '"fileMetadata.xmp.dc:creator":"Alicia Canter"',
    );
  });

  it("drops quotes from chip values with no reserved chars", () => {
    expect(roundTrip("credit:Reuters")).toBe("credit:Reuters");
  });

  it("preserves negation on a quoted phrase with a colon", () => {
    expect(roundTrip('-"hello:world"')).toBe('-"hello:world"');
  });

  it("joins multiple terms with AND", () => {
    expect(roundTrip('"hello:world" credit:Reuters')).toBe(
      '"hello:world" credit:Reuters',
    );
  });

  it("returns an empty string for an empty query", () => {
    expect(roundTrip("")).toBe("");
  });
});
