import { describe, it, expect } from "vitest";
import { deriveEffectiveQuery } from "./cql-effective-query";

describe("deriveEffectiveQuery", () => {
  it("strips an incomplete chip expression (key: with no value)", () => {
    expect(deriveEffectiveQuery("credit:")).toBe("");
  });

  it("strips an incomplete chip mid-query", () => {
    expect(deriveEffectiveQuery("cats credit: dogs")).toBe("cats dogs");
  });

  it("does NOT strip a colon+space that appears INSIDE a quoted phrase (review finding F2)", () => {
    // Bug: the incomplete-chip regex isn't anchored to a token boundary, so
    // it can match "note:" starting mid-quote (offset 1) in `"note: hello"`
    // — the lookahead only checks for trailing whitespace/end, which a
    // colon-then-space inside an ordinary phrase also satisfies. This
    // silently turns a phrase search into free text, dropping "note:"
    // entirely.
    expect(deriveEffectiveQuery('"note: hello"')).toBe('"note: hello"');
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

  it("strips an incomplete chip expression with a quoted key (no value yet)", () => {
    // Bug repro: a quoted key like "fileMetadata.xmp.dc:subject" followed by
    // a bare trailing colon (chip created, no value typed yet) must be
    // stripped entirely — same as the unquoted "credit:" case — not left
    // behind as an orphaned quoted free-text phrase.
    expect(deriveEffectiveQuery('"fileMetadata.xmp.dc:subject":')).toBe("");
  });

  it("strips an incomplete quoted-key chip mid-query", () => {
    expect(deriveEffectiveQuery('cats "fileMetadata.xmp.dc:subject": dogs')).toBe(
      "cats dogs"
    );
  });

  it("strips an incomplete negated quoted-key chip", () => {
    expect(deriveEffectiveQuery('-"fileMetadata.xmp.dc:subject":')).toBe("");
  });

  it("strips an incomplete chip expression with an unquoted dotted key (no value yet)", () => {
    // Bug repro: an unquoted dotted ES path like fileMetadata.iptc.Category
    // followed by a bare trailing colon must be stripped entirely — not
    // left behind as a mangled fragment missing everything after the last
    // dot (e.g. leaving "fileMetadata.iptc." from "fileMetadata.iptc.Category:").
    expect(deriveEffectiveQuery("+fileMetadata.iptc.Category:")).toBe("");
  });

  it("strips an incomplete unquoted dotted-key chip mid-query", () => {
    expect(
      deriveEffectiveQuery("cats fileMetadata.iptc.Category: dogs"),
    ).toBe("cats dogs");
  });

  it("strips an incomplete negated unquoted dotted-key chip", () => {
    expect(deriveEffectiveQuery("-fileMetadata.iptc.Category:")).toBe("");
  });
});
