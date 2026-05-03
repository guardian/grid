/**
 * Unit tests for reconcile.ts — the pure reconciliation engine.
 *
 * Uses minimal Image stubs and FieldDefinition fixtures — no dependency on
 * the full field registry or ES adapter.
 */

import { describe, it, expect } from "vitest";
import {
  recomputeAll,
  reconcileAdd,
  reconcileRemove,
  hasDirtyFields,
} from "./reconcile";
import type { FieldDefinition } from "./field-registry";
import type { Image } from "@/types/image";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal Image stub. Only the fields accessed by `testFields` need values. */
function img(
  id: string,
  credit?: string,
  keywords?: string[],
): Image {
  return {
    id,
    uploadTime: "2024-01-01T00:00:00Z",
    uploadedBy: "user@example.com",
    source: {
      mimeType: "image/jpeg",
      dimensions: { width: 100, height: 100 },
    },
    metadata: {
      credit,
      keywords,
    },
  } as unknown as Image;
}

/**
 * Minimal field definitions for testing — avoid importing the full registry
 * so tests stay independent of registry changes.
 */
const CREDIT_FIELD: FieldDefinition = {
  id: "metadata_credit",
  label: "Credit",
  group: "core",
  accessor: (image: Image) => image.metadata?.credit,
  defaultWidth: 120,
  fieldType: "keyword",
} as unknown as FieldDefinition;

const KEYWORDS_FIELD: FieldDefinition = {
  id: "metadata_keywords",
  label: "Keywords",
  group: "core",
  accessor: (image: Image) => image.metadata?.keywords,
  isList: true,
  defaultWidth: 200,
  fieldType: "list",
} as unknown as FieldDefinition;

const TEST_FIELDS: FieldDefinition[] = [CREDIT_FIELD, KEYWORDS_FIELD];

// ---------------------------------------------------------------------------
// recomputeAll
// ---------------------------------------------------------------------------

describe("recomputeAll", () => {
  it("returns all-empty (count=0) for all fields when images array is empty", () => {
    const view = recomputeAll([], TEST_FIELDS);
    expect(view.get("metadata_credit")).toEqual({ kind: "all-empty", count: 0 });
    expect(view.get("metadata_keywords")).toEqual({ kind: "all-empty", count: 0 });
  });

  it("returns all-same when a single image has a value", () => {
    const view = recomputeAll([img("a", "Getty")], TEST_FIELDS);
    expect(view.get("metadata_credit")).toEqual({
      kind: "all-same",
      value: "Getty",
      count: 1,
    });
  });

  it("returns all-empty when a single image has no value", () => {
    const view = recomputeAll([img("a", undefined)], TEST_FIELDS);
    expect(view.get("metadata_credit")).toEqual({ kind: "all-empty", count: 1 });
  });

  it("returns all-same when two images share the same credit", () => {
    const view = recomputeAll([img("a", "Reuters"), img("b", "Reuters")], TEST_FIELDS);
    expect(view.get("metadata_credit")).toEqual({
      kind: "all-same",
      value: "Reuters",
      count: 2,
    });
  });

  it("returns mixed when two images have different credits", () => {
    const view = recomputeAll([img("a", "Reuters"), img("b", "AP")], TEST_FIELDS);
    const rec = view.get("metadata_credit");
    expect(rec?.kind).toBe("mixed");
    if (rec?.kind === "mixed") {
      expect(rec.valueCount).toBe(2);
      expect(rec.emptyCount).toBe(0);
      expect(rec.sampleValues).toContain("Reuters");
      expect(rec.sampleValues).toContain("AP");
    }
  });

  it("returns mixed when some images have a credit and some don't", () => {
    const view = recomputeAll(
      [img("a", "Getty"), img("b", undefined)],
      TEST_FIELDS,
    );
    const rec = view.get("metadata_credit");
    expect(rec?.kind).toBe("mixed");
    if (rec?.kind === "mixed") {
      expect(rec.valueCount).toBe(1);
      expect(rec.emptyCount).toBe(1);
    }
  });

  it("returns all-empty when all images lack the field", () => {
    const view = recomputeAll(
      [img("a", undefined), img("b", undefined)],
      TEST_FIELDS,
    );
    expect(view.get("metadata_credit")).toEqual({ kind: "all-empty", count: 2 });
  });

  it("caps sampleValues at 3 when there are many distinct values", () => {
    const images = ["Getty", "Reuters", "AP", "EPA", "PA"].map((c, i) =>
      img(`img-${i}`, c),
    );
    const view = recomputeAll(images, TEST_FIELDS);
    const rec = view.get("metadata_credit");
    expect(rec?.kind).toBe("mixed");
    if (rec?.kind === "mixed") {
      expect(rec.sampleValues.length).toBeLessThanOrEqual(3);
      expect(rec.valueCount).toBe(5);
    }
  });

  it("handles list (array) fields — two same keyword arrays → all-same", () => {
    const kw = ["cat", "dog"];
    const view = recomputeAll(
      [img("a", undefined, kw), img("b", undefined, kw)],
      TEST_FIELDS,
    );
    expect(view.get("metadata_keywords")).toEqual({
      kind: "all-same",
      value: kw,
      count: 2,
    });
  });

  it("handles list fields — different keyword arrays → mixed", () => {
    const view = recomputeAll(
      [img("a", undefined, ["cat"]), img("b", undefined, ["dog"])],
      TEST_FIELDS,
    );
    expect(view.get("metadata_keywords")?.kind).toBe("mixed");
  });
});

// ---------------------------------------------------------------------------
// reconcileAdd (incremental add)
// ---------------------------------------------------------------------------

describe("reconcileAdd", () => {
  it("all-empty (count 0) + image with value → all-same (count 1)", () => {
    const prevView = recomputeAll([], TEST_FIELDS);
    const next = reconcileAdd(img("a", "Getty"), prevView, TEST_FIELDS);
    expect(next.get("metadata_credit")).toEqual({
      kind: "all-same",
      value: "Getty",
      count: 1,
    });
  });

  it("all-empty (count N) + image with no value → all-empty (count N+1)", () => {
    const prevView = recomputeAll([img("a", undefined)], TEST_FIELDS);
    const next = reconcileAdd(img("b", undefined), prevView, TEST_FIELDS);
    expect(next.get("metadata_credit")).toEqual({ kind: "all-empty", count: 2 });
  });

  it("all-same + image with same value → all-same (count+1)", () => {
    const prevView = recomputeAll([img("a", "Reuters")], TEST_FIELDS);
    const next = reconcileAdd(img("b", "Reuters"), prevView, TEST_FIELDS);
    expect(next.get("metadata_credit")).toEqual({
      kind: "all-same",
      value: "Reuters",
      count: 2,
    });
  });

  it("all-same (count N) + image with different value → mixed (valueCount N+1)", () => {
    // Two images already reconciled to all-same Reuters (count=2).
    let view = recomputeAll([img("a", "Reuters"), img("b", "Reuters")], TEST_FIELDS);
    // Add a third with a different credit.
    view = reconcileAdd(img("c", "AP"), view, TEST_FIELDS);
    const rec = view.get("metadata_credit");
    expect(rec?.kind).toBe("mixed");
    if (rec?.kind === "mixed") {
      expect(rec.valueCount).toBe(3);
      expect(rec.emptyCount).toBe(0);
    }
  });

  it("all-same (count N) + image with no value → mixed (emptyCount=1, valueCount=N)", () => {
    const prevView = recomputeAll(
      [img("a", "Getty"), img("b", "Getty")],
      TEST_FIELDS,
    );
    const next = reconcileAdd(img("c", undefined), prevView, TEST_FIELDS);
    const rec = next.get("metadata_credit");
    expect(rec?.kind).toBe("mixed");
    if (rec?.kind === "mixed") {
      expect(rec.valueCount).toBe(2);
      expect(rec.emptyCount).toBe(1);
    }
  });

  it("mixed + image with value → mixed (valueCount++)", () => {
    const prevView = recomputeAll([img("a", "Getty"), img("b", "AP")], TEST_FIELDS);
    const next = reconcileAdd(img("c", "Reuters"), prevView, TEST_FIELDS);
    const rec = next.get("metadata_credit");
    expect(rec?.kind).toBe("mixed");
    if (rec?.kind === "mixed") {
      expect(rec.valueCount).toBe(3);
    }
  });

  it("mixed + image with no value → mixed (emptyCount++)", () => {
    const prevView = recomputeAll([img("a", "Getty"), img("b", "AP")], TEST_FIELDS);
    const next = reconcileAdd(img("c", undefined), prevView, TEST_FIELDS);
    const rec = next.get("metadata_credit");
    expect(rec?.kind).toBe("mixed");
    if (rec?.kind === "mixed") {
      expect(rec.emptyCount).toBe(1);
    }
  });

  it("pending field stays pending after reconcileAdd", () => {
    const prevView: import("./reconcile").ReconciledView = new Map([
      ["metadata_credit", { kind: "pending" } as const],
    ]);
    const next = reconcileAdd(img("a", "Getty"), prevView, [CREDIT_FIELD]);
    expect(next.get("metadata_credit")?.kind).toBe("pending");
  });

  it("dirty field stays dirty after reconcileAdd", () => {
    const prevView: import("./reconcile").ReconciledView = new Map([
      ["metadata_credit", { kind: "dirty" } as const],
    ]);
    const next = reconcileAdd(img("a", "Getty"), prevView, [CREDIT_FIELD]);
    expect(next.get("metadata_credit")?.kind).toBe("dirty");
  });

  it("does not mutate prevView", () => {
    const prevView = recomputeAll([img("a", "Getty")], TEST_FIELDS);
    const snapshot = new Map(prevView);
    reconcileAdd(img("b", "AP"), prevView, TEST_FIELDS);
    // prevView should be unchanged.
    expect(prevView.get("metadata_credit")).toEqual(snapshot.get("metadata_credit"));
  });
});

// ---------------------------------------------------------------------------
// reconcileRemove (incremental remove)
// ---------------------------------------------------------------------------

describe("reconcileRemove", () => {
  it("all-same (count 2) - image with same value → all-same (count 1)", () => {
    const prevView = recomputeAll(
      [img("a", "Getty"), img("b", "Getty")],
      TEST_FIELDS,
    );
    const next = reconcileRemove(img("b", "Getty"), prevView, TEST_FIELDS);
    expect(next.get("metadata_credit")).toEqual({
      kind: "all-same",
      value: "Getty",
      count: 1,
    });
  });

  it("all-same (count 1) - image → all-empty (count 0)", () => {
    const prevView = recomputeAll([img("a", "Reuters")], TEST_FIELDS);
    const next = reconcileRemove(img("a", "Reuters"), prevView, TEST_FIELDS);
    expect(next.get("metadata_credit")).toEqual({ kind: "all-empty", count: 0 });
  });

  it("all-empty (count 2) - image with no value → all-empty (count 1)", () => {
    const prevView = recomputeAll(
      [img("a", undefined), img("b", undefined)],
      TEST_FIELDS,
    );
    const next = reconcileRemove(img("a", undefined), prevView, TEST_FIELDS);
    expect(next.get("metadata_credit")).toEqual({ kind: "all-empty", count: 1 });
  });

  it("mixed - any image → dirty (requires full recompute)", () => {
    const prevView = recomputeAll([img("a", "Getty"), img("b", "AP")], TEST_FIELDS);
    const next = reconcileRemove(img("a", "Getty"), prevView, TEST_FIELDS);
    expect(next.get("metadata_credit")?.kind).toBe("dirty");
  });

  it("does not mutate prevView", () => {
    const prevView = recomputeAll(
      [img("a", "Getty"), img("b", "Getty")],
      TEST_FIELDS,
    );
    const snapshot = new Map(prevView);
    reconcileRemove(img("b", "Getty"), prevView, TEST_FIELDS);
    expect(prevView.get("metadata_credit")).toEqual(snapshot.get("metadata_credit"));
  });
});

// ---------------------------------------------------------------------------
// hasDirtyFields
// ---------------------------------------------------------------------------

describe("hasDirtyFields", () => {
  it("returns false for a clean view", () => {
    const view = recomputeAll([img("a", "Getty")], TEST_FIELDS);
    expect(hasDirtyFields(view)).toBe(false);
  });

  it("returns true when any field is dirty", () => {
    const prevView = recomputeAll([img("a", "Getty"), img("b", "AP")], TEST_FIELDS);
    const view = reconcileRemove(img("a", "Getty"), prevView, TEST_FIELDS);
    expect(hasDirtyFields(view)).toBe(true);
  });

  it("returns false for pending (pending != dirty)", () => {
    const view: import("./reconcile").ReconciledView = new Map([
      ["metadata_credit", { kind: "pending" } as const],
    ]);
    expect(hasDirtyFields(view)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// chip-array behaviour
// ---------------------------------------------------------------------------

const CHIP_FIELD: FieldDefinition = {
  id: "keywords",
  label: "Keywords",
  group: "core",
  accessor: (image: Image) => image.metadata?.keywords,
  cqlKey: "keyword",
  isList: true,
  defaultWidth: 200,
  fieldType: "list",
  multiSelectBehaviour: "chip-array",
} as unknown as FieldDefinition;

const CHIP_FIELDS: FieldDefinition[] = [CHIP_FIELD];

describe("chip-array: recomputeAll", () => {
  it("returns chip-array with empty chips for 0 images", () => {
    const view = recomputeAll([], CHIP_FIELDS);
    expect(view.get("keywords")).toEqual({ kind: "chip-array", chips: [], total: 0 });
  });

  it("returns all chips with count=total when all images share keywords", () => {
    const view = recomputeAll(
      [img("a", undefined, ["cat", "dog"]), img("b", undefined, ["cat", "dog"])],
      CHIP_FIELDS,
    );
    const rec = view.get("keywords");
    expect(rec?.kind).toBe("chip-array");
    if (rec?.kind !== "chip-array") return;
    expect(rec.total).toBe(2);
    const catChip = rec.chips.find((c) => c.value === "cat");
    const dogChip = rec.chips.find((c) => c.value === "dog");
    expect(catChip?.count).toBe(2);
    expect(dogChip?.count).toBe(2);
  });

  it("returns partial chips (count < total) for keywords on some images only", () => {
    const view = recomputeAll(
      [
        img("a", undefined, ["cat", "dog"]),
        img("b", undefined, ["cat"]),
        img("c", undefined, []),
      ],
      CHIP_FIELDS,
    );
    const rec = view.get("keywords");
    expect(rec?.kind).toBe("chip-array");
    if (rec?.kind !== "chip-array") return;
    expect(rec.total).toBe(3);
    const catChip = rec.chips.find((c) => c.value === "cat");
    const dogChip = rec.chips.find((c) => c.value === "dog");
    // cat appears on 2 out of 3 -- partial
    expect(catChip?.count).toBe(2);
    // dog appears on 1 out of 3 -- partial
    expect(dogChip?.count).toBe(1);
  });

  it("skips empty strings in array values", () => {
    const view = recomputeAll(
      [img("a", undefined, ["", "valid"])],
      CHIP_FIELDS,
    );
    const rec = view.get("keywords");
    expect(rec?.kind).toBe("chip-array");
    if (rec?.kind !== "chip-array") return;
    expect(rec.chips.every((c) => c.value !== "")).toBe(true);
    expect(rec.chips.find((c) => c.value === "valid")?.count).toBe(1);
  });
});

describe("chip-array: reconcileAdd (incremental)", () => {
  it("starts from empty and builds chip-array on first add", () => {
    const next = reconcileAdd(img("a", undefined, ["cat", "dog"]), null, CHIP_FIELDS);
    const rec = next.get("keywords");
    expect(rec?.kind).toBe("chip-array");
    if (rec?.kind !== "chip-array") return;
    expect(rec.total).toBe(1);
    expect(rec.chips.find((c) => c.value === "cat")?.count).toBe(1);
    expect(rec.chips.find((c) => c.value === "dog")?.count).toBe(1);
  });

  it("merges new chips into existing chip-array", () => {
    let view = reconcileAdd(img("a", undefined, ["cat"]), null, CHIP_FIELDS);
    view = reconcileAdd(img("b", undefined, ["cat", "dog"]), view, CHIP_FIELDS);
    const rec = view.get("keywords");
    expect(rec?.kind).toBe("chip-array");
    if (rec?.kind !== "chip-array") return;
    expect(rec.total).toBe(2);
    expect(rec.chips.find((c) => c.value === "cat")?.count).toBe(2);
    expect(rec.chips.find((c) => c.value === "dog")?.count).toBe(1);
  });

  it("adds image with no keywords: total increases but no new chips", () => {
    let view = reconcileAdd(img("a", undefined, ["cat"]), null, CHIP_FIELDS);
    view = reconcileAdd(img("b", undefined, []), view, CHIP_FIELDS);
    const rec = view.get("keywords");
    expect(rec?.kind).toBe("chip-array");
    if (rec?.kind !== "chip-array") return;
    expect(rec.total).toBe(2);
    expect(rec.chips.find((c) => c.value === "cat")?.count).toBe(1);
  });

  it("passes through pending state unchanged", () => {
    const viewWithPending: import("./reconcile").ReconciledView = new Map([
      ["keywords", { kind: "pending" } as const],
    ]);
    const next = reconcileAdd(img("a", undefined, ["cat"]), viewWithPending, CHIP_FIELDS);
    expect(next.get("keywords")?.kind).toBe("pending");
  });
});

describe("chip-array: reconcileRemove marks dirty", () => {
  it("any remove from chip-array marks the field dirty", () => {
    let view = reconcileAdd(img("a", undefined, ["cat"]), null, CHIP_FIELDS);
    view = reconcileAdd(img("b", undefined, ["cat", "dog"]), view, CHIP_FIELDS);
    const next = reconcileRemove(img("a", undefined, ["cat"]), view, CHIP_FIELDS);
    expect(next.get("keywords")?.kind).toBe("dirty");
  });

  it("hasDirtyFields is true after a chip-array remove", () => {
    let view = reconcileAdd(img("a", undefined, ["cat"]), null, CHIP_FIELDS);
    view = reconcileRemove(img("a", undefined, ["cat"]), view, CHIP_FIELDS);
    expect(hasDirtyFields(view)).toBe(true);
  });
});
