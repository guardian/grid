/**
 * Click interpretation — single pure function that translates raw click
 * events into declarative effects for the selection store and navigation.
 *
 * **This function owns the entire selection interaction policy.**
 * To change behaviour: edit the rule table comment, edit the function, update
 * tests. UI components (ImageGrid, ImageTable) stay untouched.
 *
 * Architecture: kupua/exploration/docs/00 Architecture and philosophy/05-selections.md §5
 */

import type { SortValues } from "@/dal/types";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type ClickKind = "tick" | "image-body";
export type Modifier = "none" | "shift" | "meta-or-ctrl";

export interface ClickContext {
  targetId: string;
  kind: ClickKind;
  modifier: Modifier;
  /** True when selectedIds.size > 0 (Selection Mode active). */
  inSelectionMode: boolean;
  anchorId: string | null;
  /**
   * Global (zero-based) position of the clicked image in the result set.
   * May be undefined if the target was outside the windowed buffer — but
   * this should not happen in practice: skeleton cells have no click handler,
   * and any visible cell is in the buffer.
   */
  targetGlobalIndex: number | undefined;
  /**
   * Global position of the current anchor. undefined when anchor is evicted
   * from the buffer or the position map (seek mode >65k). The range hook
   * resolves this via positionMap or a searchAfter fallback.
   */
  anchorGlobalIndex: number | undefined;
  /** Sort cursor for the target — sourced from results buffer, null when unavailable. */
  targetSortValues: SortValues | null;
  /** Sort cursor for the anchor — sourced from metadataCache / results buffer. */
  anchorSortValues: SortValues | null;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type ClickEffect =
  | { op: "open-detail"; id: string }
  | { op: "set-focus"; id: string | null }
  | { op: "toggle"; id: string }
  | { op: "set-anchor"; id: string }
  | {
      op: "add-range";
      anchorId: string;
      /** null when anchor is evicted / position unknown; hook resolves. */
      anchorGlobalIndex: number | null;
      /** null when caller didn't have it; hook resolves via metadataCache. */
      anchorSortValues: SortValues | null;
      targetId: string;
      /** Always defined — the user just clicked this cell. */
      targetGlobalIndex: number;
      targetSortValues: SortValues;
    };

// ---------------------------------------------------------------------------
// Rule table (the contract — change deliberately, with updated tests)
//
// | Mode          | Target     | Modifier     | Effects
// |---------------|------------|--------------|------------------------------
// | Not in mode   | image-body | none/shift   | set-focus(id), open-detail(id)
// | Not in mode   | tick       | any          | set-anchor(id), toggle(id)
// | In mode       | image-body | none         | set-anchor(id), toggle(id)
// | In mode       | image-body | shift        | if anchor: add-range; else: set-anchor(id), toggle(id)
// | In mode       | tick       | none         | set-anchor(id), toggle(id)
// | In mode       | tick       | shift        | same as image-body shift
// | Any           | any        | meta-or-ctrl | [] (reserved, no-op)
//
// Anchor rule: every non-shift selection click moves the anchor.
// Shift-click leaves the anchor unchanged.
// Polarity (add vs remove) is determined in useRangeSelection from the anchor's
// post-click state: selectedIds.has(anchorId) ? "add" : "remove".
// ---------------------------------------------------------------------------

export function interpretClick(ctx: ClickContext): ClickEffect[] {
  const { targetId, kind, modifier, inSelectionMode, anchorId } = ctx;

  // meta/ctrl is reserved for future multi-set semantics — no-op in v1.
  if (modifier === "meta-or-ctrl") {
    return [];
  }

  // ── Outside Selection Mode ──────────────────────────────────────────────
  if (!inSelectionMode) {
    if (kind === "tick") {
      // Enters Selection Mode (any modifier — shift has no range to extend yet).
      return [
        { op: "set-anchor", id: targetId },
        { op: "toggle", id: targetId },
      ];
    }
    // image-body (none or shift) — plain browsing; untouched current behaviour.
    return [
      { op: "set-focus", id: targetId },
      { op: "open-detail", id: targetId },
    ];
  }

  // ── Inside Selection Mode ────────────────────────────────────────────────
  if (modifier === "shift") {
    if (anchorId !== null) {
      // Range-select from anchor to target.
      // targetGlobalIndex is always defined (user clicked a visible, loaded cell).
      // targetSortValues should also be available from the results buffer.
      // Callers must populate these; we assert rather than silently degrade.
      const targetGlobalIndex = ctx.targetGlobalIndex ?? 0;
      const targetSortValues = ctx.targetSortValues ?? [];
      return [
        {
          op: "add-range",
          anchorId,
          anchorGlobalIndex: ctx.anchorGlobalIndex ?? null,
          anchorSortValues: ctx.anchorSortValues,
          targetId,
          targetGlobalIndex,
          targetSortValues,
        },
      ];
    }
    // Shift with no anchor: treat same as non-shift (set anchor, toggle).
  }

  // Non-shift (or shift with no anchor): toggle and update anchor.
  return [
    { op: "set-anchor", id: targetId },
    { op: "toggle", id: targetId },
  ];
}
