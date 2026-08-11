import { describe, it, expect } from "vitest";
import { findFieldTerm, upsertFieldTerm, findHasFieldTargets, removeAllFieldTerms } from "./cql-query-edit";

// ---------------------------------------------------------------------------
// findFieldTerm
// ---------------------------------------------------------------------------
describe("findFieldTerm", () => {
  it("finds positive term", () => {
    expect(findFieldTerm("credit:Getty", "credit", "Getty")).toEqual({
      negated: false,
      start: 0,
      end: 12,
    });
  });

  it("finds negative term", () => {
    expect(findFieldTerm("-credit:Getty", "credit", "Getty")).toEqual({
      negated: true,
      start: 0,
      end: 13,
    });
  });

  it("finds term in longer query", () => {
    expect(findFieldTerm("cats credit:Getty dogs", "credit", "Getty")).toEqual({
      negated: false,
      start: 5,
      end: 17,
    });
  });

  it("finds negative term in longer query", () => {
    expect(
      findFieldTerm("cats -credit:Getty dogs", "credit", "Getty")
    ).toEqual({ negated: true, start: 5, end: 18 });
  });

  it("finds quoted value", () => {
    expect(
      findFieldTerm('credit:"Getty Images"', "credit", "Getty Images")
    ).toEqual({ negated: false, start: 0, end: 21 });
  });

  it("does not false-positive on partial match", () => {
    expect(
      findFieldTerm("credit:GettyImages", "credit", "Getty")
    ).toBeUndefined();
  });

  it("returns undefined for empty query", () => {
    expect(findFieldTerm("", "credit", "Getty")).toBeUndefined();
  });

  it("returns undefined when key doesn't match", () => {
    expect(findFieldTerm("source:Getty", "credit", "Getty")).toBeUndefined();
  });

  it("is case-insensitive on value", () => {
    expect(findFieldTerm("credit:getty", "credit", "Getty")).toEqual({
      negated: false,
      start: 0,
      end: 12,
    });
  });

  it("finds explicit + prefix term", () => {
    expect(findFieldTerm("+credit:Getty", "credit", "Getty")).toEqual({
      negated: false,
      start: 0,
      end: 13,
    });
  });

  it("finds explicit + prefix in context", () => {
    expect(
      findFieldTerm("cats +credit:Getty dogs", "credit", "Getty")
    ).toEqual({ negated: false, start: 5, end: 18 });
  });
});

// ---------------------------------------------------------------------------
// upsertFieldTerm
// ---------------------------------------------------------------------------
describe("upsertFieldTerm", () => {
  it("appends to empty query", () => {
    expect(upsertFieldTerm("", "credit", "Getty", false)).toBe("credit:Getty");
  });

  it("appends negative to empty query", () => {
    expect(upsertFieldTerm("", "credit", "Getty", true)).toBe("-credit:Getty");
  });

  it("appends to existing query", () => {
    expect(upsertFieldTerm("cats", "credit", "Getty", false)).toBe(
      "cats credit:Getty"
    );
  });

  it("no-op when same polarity already exists (positive)", () => {
    expect(upsertFieldTerm("credit:Getty", "credit", "Getty", false)).toBe(
      "credit:Getty"
    );
  });

  it("no-op when same polarity already exists (negative)", () => {
    expect(upsertFieldTerm("-credit:Getty", "credit", "Getty", true)).toBe(
      "-credit:Getty"
    );
  });

  it("flips positive to negative", () => {
    expect(upsertFieldTerm("credit:Getty", "credit", "Getty", true)).toBe(
      "-credit:Getty"
    );
  });

  it("flips negative to positive", () => {
    expect(upsertFieldTerm("-credit:Getty", "credit", "Getty", false)).toBe(
      "credit:Getty"
    );
  });

  it("flips in context — preserves surrounding terms", () => {
    expect(
      upsertFieldTerm("cats credit:Getty dogs", "credit", "Getty", true)
    ).toBe("cats -credit:Getty dogs");
  });

  it("flips negative in context", () => {
    expect(
      upsertFieldTerm("cats -credit:Getty dogs", "credit", "Getty", false)
    ).toBe("cats credit:Getty dogs");
  });

  it("quotes values with spaces", () => {
    expect(upsertFieldTerm("", "credit", "Getty Images", false)).toBe(
      'credit:"Getty Images"'
    );
  });

  it("flips quoted value in context", () => {
    expect(
      upsertFieldTerm(
        'cats credit:"Getty Images" dogs',
        "credit",
        "Getty Images",
        true
      )
    ).toBe('cats -credit:"Getty Images" dogs');
  });

  it("flips explicit + prefix to negative", () => {
    expect(upsertFieldTerm("+credit:Getty", "credit", "Getty", true)).toBe(
      "-credit:Getty"
    );
  });

  it("no-op on explicit + prefix when desired is positive", () => {
    expect(upsertFieldTerm("+credit:Getty", "credit", "Getty", false)).toBe(
      "+credit:Getty"
    );
  });

  it("flips explicit + prefix in context", () => {
    expect(
      upsertFieldTerm("cats +credit:Getty dogs", "credit", "Getty", true)
    ).toBe("cats -credit:Getty dogs");
  });

  it("quotes a key containing a colon (dynamic ES field path)", () => {
    expect(
      upsertFieldTerm("", "fileMetadata.xmp.dc:creator", "London", false)
    ).toBe('"fileMetadata.xmp.dc:creator":London');
  });

  it("quotes both key and value when both need it", () => {
    expect(
      upsertFieldTerm("", "fileMetadata.xmp.dc:creator", "New York", false)
    ).toBe('"fileMetadata.xmp.dc:creator":"New York"');
  });

  it("round-trips a quoted-key term — finds and flips it", () => {
    const query = upsertFieldTerm(
      "",
      "fileMetadata.xmp.dc:creator",
      "London",
      false
    );
    expect(
      findFieldTerm(query, "fileMetadata.xmp.dc:creator", "London")
    ).toEqual({ negated: false, start: 0, end: query.length });

    const flipped = upsertFieldTerm(
      query,
      "fileMetadata.xmp.dc:creator",
      "London",
      true
    );
    expect(flipped).toBe('-"fileMetadata.xmp.dc:creator":London');
  });

  it("no-op when quoted-key term already exists with same polarity", () => {
    const query = '"fileMetadata.xmp.dc:creator":London';
    expect(
      upsertFieldTerm(query, "fileMetadata.xmp.dc:creator", "London", false)
    ).toBe(query);
  });
});

// ---------------------------------------------------------------------------
// findHasFieldTargets
// ---------------------------------------------------------------------------
describe("findHasFieldTargets", () => {
  it("returns empty for empty query", () => {
    expect(findHasFieldTargets("")).toEqual([]);
  });

  it("returns empty when there's no has: clause", () => {
    expect(findHasFieldTargets("credit:Getty")).toEqual([]);
  });

  it("finds a single has: target (arbitrary ES path passes through unchanged)", () => {
    expect(findHasFieldTargets('has:"fileMetadata.xmp.dc:creator"')).toEqual([
      { raw: "fileMetadata.xmp.dc:creator", esPath: "fileMetadata.xmp.dc:creator" },
    ]);
  });

  it("finds multiple has: targets", () => {
    expect(
      findHasFieldTargets(
        'cats has:"fileMetadata.xmp.dc:creator" dogs has:"metadata.credit"'
      )
    ).toEqual([
      { raw: "fileMetadata.xmp.dc:creator", esPath: "fileMetadata.xmp.dc:creator" },
      { raw: "metadata.credit", esPath: "metadata.credit" },
    ]);
  });

  it("dedupes repeated has: targets", () => {
    expect(
      findHasFieldTargets('has:"metadata.credit" has:"metadata.credit"')
    ).toEqual([{ raw: "metadata.credit", esPath: "metadata.credit" }]);
  });

  it("resolves a short field alias to its full ES path, keeping the raw form too (review finding F3)", () => {
    // has: itself filters on getFieldPath(value) — a facet built from the
    // unresolved raw alias would aggregate on the wrong, unmapped path and
    // never show any buckets.
    expect(findHasFieldTargets("has:croppedBy")).toEqual([
      { raw: "croppedBy", esPath: "exports.author" },
    ]);
  });

  it("dedupes two different raw forms that resolve to the same ES path", () => {
    expect(findHasFieldTargets('has:croppedBy has:"exports.author"')).toEqual([
      { raw: "croppedBy", esPath: "exports.author" },
    ]);
  });

  it("excludes a negated has: clause — it can never yield a non-empty facet (review finding F4)", () => {
    expect(findHasFieldTargets('-has:"metadata.credit"')).toEqual([]);
  });

  it("still finds a positive has: target alongside an excluded negated one", () => {
    expect(
      findHasFieldTargets('has:"metadata.credit" -has:"metadata.byline"')
    ).toEqual([{ raw: "metadata.credit", esPath: "metadata.credit" }]);
  });
});

// ---------------------------------------------------------------------------
// removeAllFieldTerms
// ---------------------------------------------------------------------------
describe("removeAllFieldTerms", () => {
  it("removes a field term that has a value", () => {
    expect(removeAllFieldTerms("credit:Getty", "credit")).toBe("");
  });

  it("removes a field term with NO value at all (bug repro)", () => {
    // A chip with an empty value (e.g. right after typing the colon, before
    // any value is typed) must still be matched and stripped — matchField's
    // own re-derivation of the field's value previously omitted the `?? ""`
    // fallback its caller (collectByKey) uses, so `undefined !== ""` made
    // this incorrectly report "no match" against itself.
    expect(removeAllFieldTerms("credit:", "credit")).toBe("");
  });

  it("removes a QUOTED field term with no value at all (the live repro)", () => {
    expect(
      removeAllFieldTerms('"fileMetadata.xmp.dc:subject":', "fileMetadata.xmp.dc:subject"),
    ).toBe("");
  });

  it("removes a no-value field term from a longer query, keeping the rest", () => {
    expect(removeAllFieldTerms("cats credit: dogs", "credit")).toBe("cats dogs");
  });

  it("removes multiple occurrences, mixing valued and valueless terms", () => {
    expect(removeAllFieldTerms("credit:Getty cats credit:", "credit")).toBe("cats");
  });

  it("leaves the query unchanged when the key doesn't match", () => {
    expect(removeAllFieldTerms("credit:", "city")).toBe("credit:");
  });
});


