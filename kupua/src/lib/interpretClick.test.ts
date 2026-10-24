/**
 * Unit tests for interpretClick.ts — the pure click-interpretation function.
 *
 * Tests cover every row of the rule table in the architecture doc §5.
 * The rule table is the CONTRACT — if a test breaks, change the rule table
 * comment and the test together, never just one of them.
 */

import { describe, it, expect } from "vitest";
import { interpretClick } from "./interpretClick";
import type { ClickContext } from "./interpretClick";

// ---------------------------------------------------------------------------
// Shared context builders
// ---------------------------------------------------------------------------

function ctx(overrides: Partial<ClickContext> = {}): ClickContext {
  return {
    targetId: "img-1",
    kind: "image-body",
    modifier: "none",
    inSelectionMode: false,
    anchorId: null,
    targetGlobalIndex: 5,
    anchorGlobalIndex: 2,
    targetSortValues: ["2024-01-01T00:00:00Z", "img-1"],
    anchorSortValues: ["2023-06-01T00:00:00Z", "img-anchor"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Rule table: NOT in Selection Mode
// ---------------------------------------------------------------------------

describe("Not in Selection Mode", () => {
  it("image-body + none → set-focus + open-detail", () => {
    const effects = interpretClick(ctx({ kind: "image-body", modifier: "none" }));
    expect(effects).toEqual([
      { op: "set-focus", id: "img-1" },
      { op: "open-detail", id: "img-1" },
    ]);
  });

  it("image-body + shift → set-focus + open-detail (shift ignored outside Selection Mode)", () => {
    const effects = interpretClick(ctx({ kind: "image-body", modifier: "shift" }));
    expect(effects).toEqual([
      { op: "set-focus", id: "img-1" },
      { op: "open-detail", id: "img-1" },
    ]);
  });

  it("tick + none → set-anchor + toggle (enters Selection Mode)", () => {
    const effects = interpretClick(ctx({ kind: "tick", modifier: "none" }));
    expect(effects).toEqual([
      { op: "set-anchor", id: "img-1" },
      { op: "toggle", id: "img-1" },
    ]);
  });

  it("tick + shift → set-anchor + toggle (enters Selection Mode even with shift — no prior anchor)", () => {
    const effects = interpretClick(ctx({ kind: "tick", modifier: "shift" }));
    expect(effects).toEqual([
      { op: "set-anchor", id: "img-1" },
      { op: "toggle", id: "img-1" },
    ]);
  });

  it("image-body + meta-or-ctrl → no-op (reserved)", () => {
    const effects = interpretClick(ctx({ kind: "image-body", modifier: "meta-or-ctrl" }));
    expect(effects).toEqual([]);
  });

  it("tick + meta-or-ctrl → no-op (reserved)", () => {
    const effects = interpretClick(ctx({ kind: "tick", modifier: "meta-or-ctrl" }));
    expect(effects).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule table: IN Selection Mode — non-shift clicks
// ---------------------------------------------------------------------------

describe("In Selection Mode, non-shift", () => {
  it("image-body + none → set-anchor + toggle", () => {
    const effects = interpretClick(
      ctx({ inSelectionMode: true, anchorId: "img-anchor" }),
    );
    expect(effects).toEqual([
      { op: "set-anchor", id: "img-1" },
      { op: "toggle", id: "img-1" },
    ]);
  });

  it("tick + none → set-anchor + toggle", () => {
    const effects = interpretClick(
      ctx({ kind: "tick", inSelectionMode: true, anchorId: "img-anchor" }),
    );
    expect(effects).toEqual([
      { op: "set-anchor", id: "img-1" },
      { op: "toggle", id: "img-1" },
    ]);
  });

  it("image-body + meta-or-ctrl → no-op while in Selection Mode", () => {
    const effects = interpretClick(
      ctx({ inSelectionMode: true, modifier: "meta-or-ctrl" }),
    );
    expect(effects).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule table: IN Selection Mode — shift-click with anchor
// ---------------------------------------------------------------------------

describe("In Selection Mode, shift + anchor present", () => {
  const withAnchor = ctx({
    inSelectionMode: true,
    anchorId: "img-anchor",
    modifier: "shift",
    anchorGlobalIndex: 2,
    anchorSortValues: ["2023-06-01T00:00:00Z", "img-anchor"],
  });

  it("image-body + shift → add-range effect", () => {
    const effects = interpretClick(withAnchor);
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      op: "add-range",
      anchorId: "img-anchor",
      anchorGlobalIndex: 2,
      anchorSortValues: ["2023-06-01T00:00:00Z", "img-anchor"],
      targetId: "img-1",
      targetGlobalIndex: 5,
      targetSortValues: ["2024-01-01T00:00:00Z", "img-1"],
    });
  });

  it("tick + shift → add-range (same as image-body shift)", () => {
    const effects = interpretClick({ ...withAnchor, kind: "tick" });
    expect(effects[0]).toMatchObject({ op: "add-range" });
  });

  it("add-range carries null anchorGlobalIndex when anchor is evicted", () => {
    const effects = interpretClick({
      ...withAnchor,
      anchorGlobalIndex: undefined,
    });
    expect(effects[0]).toMatchObject({
      op: "add-range",
      anchorGlobalIndex: null,
    });
  });

  it("add-range carries null anchorSortValues when caller had none", () => {
    const effects = interpretClick({
      ...withAnchor,
      anchorSortValues: null,
    });
    expect(effects[0]).toMatchObject({
      op: "add-range",
      anchorSortValues: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Rule table: IN Selection Mode — shift-click WITHOUT anchor
// ---------------------------------------------------------------------------

describe("In Selection Mode, shift + no anchor", () => {
  it("image-body + shift with no anchor → set-anchor + toggle (anchor rule)", () => {
    const effects = interpretClick(
      ctx({
        inSelectionMode: true,
        anchorId: null,
        modifier: "shift",
      }),
    );
    expect(effects).toEqual([
      { op: "set-anchor", id: "img-1" },
      { op: "toggle", id: "img-1" },
    ]);
  });

  it("tick + shift with no anchor → set-anchor + toggle", () => {
    const effects = interpretClick(
      ctx({
        kind: "tick",
        inSelectionMode: true,
        anchorId: null,
        modifier: "shift",
      }),
    );
    expect(effects).toEqual([
      { op: "set-anchor", id: "img-1" },
      { op: "toggle", id: "img-1" },
    ]);
  });
});
