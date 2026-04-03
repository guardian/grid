import { describe, it, expect } from "vitest";
import { findFieldTerm, upsertFieldTerm } from "./cql-query-edit";

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
});


