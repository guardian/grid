import { describe, it, expect } from "vitest";
import { deriveEffectiveQuery } from "./cql-effective-query";

describe("deriveEffectiveQuery", () => {
  it("strips an incomplete chip expression (key: with no value)", () => {
    expect(deriveEffectiveQuery("credit:")).toBe("");
  });

  it("strips an incomplete chip mid-query", () => {
    expect(deriveEffectiveQuery("cats credit: dogs")).toBe("cats dogs");
  });

  it("unwraps quotes added only to protect a trailing space", () => {
    expect(deriveEffectiveQuery('"climate "')).toBe("climate");
  });

  it("unwraps quotes around a single reserved-char-free word", () => {
    expect(deriveEffectiveQuery('"climate"')).toBe("climate");
  });

  it("keeps quotes around a real multi-word phrase", () => {
    expect(deriveEffectiveQuery('"Alicia Canter"')).toBe('"Alicia Canter"');
  });

  it("keeps quotes around a field KEY containing a colon", () => {
    // A key like fileMetadata.xmp.dc:creator is quoted by @guardian/cql
    // because it contains a reserved char (`:`), not whitespace — stripping
    // the quotes here breaks the field term.
    expect(deriveEffectiveQuery('"fileMetadata.xmp.dc:creator":"Alicia Canter"')).toBe(
      '"fileMetadata.xmp.dc:creator":"Alicia Canter"'
    );
  });

  it("keeps quotes around a value containing parens", () => {
    expect(deriveEffectiveQuery('credit:"Getty (Contributor)"')).toBe(
      'credit:"Getty (Contributor)"'
    );
  });

  it("collapses double spaces left by stripping an incomplete chip", () => {
    expect(deriveEffectiveQuery("cats  dogs")).toBe("cats dogs");
  });
});
