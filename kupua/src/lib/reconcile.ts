/**
 * Reconciliation engine -- pure functions for computing the multi-image
 * metadata view in the selection-store.
 *
 * Architecture s7: lazy, incremental, bounded.
 *
 * Key properties:
 * - `recomputeAll` -- O(N x F) full recompute from scratch.
 * - `reconcileAdd` -- O(F) incremental add of one image.
 * - `reconcileRemove` -- O(F) incremental remove; marks `mixed` fields as
 *   `dirty` (full recompute required for those fields on next reconcile cycle).
 *
 * DEVIATION from architecture s3 type definition: `all-same` and `all-empty`
 * carry a `count` field (not in the architecture's typedef). This is required
 * for correct `valueCount` tracking when incrementally transitioning from
 * `all-same` to `mixed` -- without it, `valueCount` in the resulting `mixed`
 * state would be wrong (off by however many items were in `all-same` before
 * the transition). Logged in deviations.md.
 *
 * Callers (the selection-store) schedule `reconcileAdd` in idle chunks via
 * `scheduleChunkedReconcile`. That scheduler lives in selection-store.ts since
 * it needs direct store access.
 */

import type { Image } from "@/types/image";
import type { FieldDefinition } from "@/lib/field-registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The reconciled state of a single field across all selected images.
 *
 * `count` in `all-same` / `all-empty` tracks how many selected images are
 * in that state for this field -- needed for correct `valueCount` when a
 * subsequent add transitions the field to `mixed`.
 */
export type FieldReconciliation =
  /** All selected images have the same non-empty value for this field. */
  | { kind: "all-same"; value: unknown; count: number }
  /** All selected images have no value for this field. */
  | { kind: "all-empty"; count: number }
  /** Images disagree on the field value (different values or some empty). */
  | {
      kind: "mixed";
      /** Distinct sample values, capped at 3. Used for tooltip display. */
      sampleValues: unknown[];
      /** Number of selected images with a non-empty value. */
      valueCount: number;
      /** Number of selected images with an empty / missing value. */
      emptyCount: number;
    }
  /** Union of chips from all selected images with per-chip occurrence counts.
   * Used for chip-array fields (keywords, subjects, people).
   * Chip is "full" when count === total; "partial" when count < total. */
  | {
      kind: "chip-array";
      chips: Array<{ value: string; count: number }>;
      /** Number of selected images (= size of selectedIds at reconcile time). */
      total: number;
    }
  /** A computed summary line from a summariser function.
   * Used for summary-only fields (e.g. leases). No production caller in S4. */
  | { kind: "summary"; line: string }
  /** Value not yet computed -- metadata not yet cached or chunk not processed. */
  | { kind: "pending" }
  /**
   * Stale due to a remove from `mixed` state -- a full recompute of this
   * field is scheduled. Callers should treat as a placeholder until recomputed.
   */
  | { kind: "dirty" };

/**
 * The reconciled view of ALL tracked fields for the current selection.
 * Keyed by `FieldDefinition.id`.
 */
export type ReconciledView = Map<string, FieldReconciliation>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a field value from an image and normalise to null when empty.
 * Empty = undefined, empty string, or empty array.
 */
function extractValue(image: Image, field: FieldDefinition): unknown | null {
  const v = field.accessor(image);
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.length === 0 ? null : v;
  if (typeof v === "string") return v === "" ? null : v;
  return v;
}

/** Deep-equality for field values (string or string[]). */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/** Add a value to a sample array (capped at 3, deduped). */
function addSample(samples: unknown[], v: unknown): unknown[] {
  if (samples.length >= 3) return samples;
  if (samples.some((s) => valuesEqual(s, v))) return samples;
  return [...samples, v];
}

/**
 * Full chip-array recompute: collect all values from all images, count occurrences.
 * Chip order follows insertion order of first occurrence.
 */
function recomputeChipArray(
  images: Image[],
  field: FieldDefinition,
): FieldReconciliation {
  const chipMap = new Map<string, number>();
  for (const img of images) {
    const v = field.accessor(img);
    if (!Array.isArray(v)) continue;
    for (const item of v) {
      if (typeof item === "string" && item !== "") {
        chipMap.set(item, (chipMap.get(item) ?? 0) + 1);
      }
    }
  }
  return {
    kind: "chip-array",
    chips: Array.from(chipMap, ([value, count]) => ({ value, count })),
    total: images.length,
  };
}

/**
 * Summary recompute: call the field's summariser function.
 * Only reached for summary-only fields that have a summariser.
 */
function recomputeSummary(
  images: Image[],
  field: FieldDefinition,
): FieldReconciliation {
  const line = field.summariser ? field.summariser(images) : "";
  return { kind: "summary", line };
}

/**
 * Incremental chip-array add: merge a new image's chip values into existing counts.
 * `total` tracks the number of selected images, incremented by 1 per call.
 */
function applyChipArrayAdd(
  current: FieldReconciliation,
  values: string[],
): FieldReconciliation {
  // pending and dirty pass through -- caller should schedule full recompute instead.
  if (current.kind === "pending" || current.kind === "dirty") return current;

  // Treat any non-chip-array starting state as an empty chip-array.
  const baseChips: Array<{ value: string; count: number }> =
    current.kind === "chip-array" ? current.chips : [];
  const prevTotal = current.kind === "chip-array" ? current.total : 0;

  const chipMap = new Map<string, number>(
    baseChips.map((c) => [c.value, c.count]),
  );
  for (const v of values) {
    chipMap.set(v, (chipMap.get(v) ?? 0) + 1);
  }
  return {
    kind: "chip-array",
    chips: Array.from(chipMap, ([value, count]) => ({ value, count })),
    total: prevTotal + 1,
  };
}

// ---------------------------------------------------------------------------
// Core reconcile operations
// ---------------------------------------------------------------------------

/**
 * Apply a single-image ADD delta to the current reconciliation for one field.
 * Used by `reconcileAdd`.
 */
function applyAdd(
  current: FieldReconciliation,
  value: unknown | null,
): FieldReconciliation {
  // Pending and dirty pass through -- wait for the recompute cycle.
  if (current.kind === "pending" || current.kind === "dirty") return current;

  if (value === null) {
    // Image has no value for this field.
    switch (current.kind) {
      case "all-empty":
        return { kind: "all-empty", count: current.count + 1 };
      case "all-same":
        return {
          kind: "mixed",
          sampleValues: [current.value],
          valueCount: current.count,
          emptyCount: 1,
        };
      case "mixed":
        return { ...current, emptyCount: current.emptyCount + 1 };
    }
  }

  // Image has a non-empty value.
  switch (current.kind) {
    case "all-empty":
      return { kind: "all-same", value, count: 1 };
    case "all-same": {
      if (valuesEqual(current.value, value)) {
        return { kind: "all-same", value: current.value, count: current.count + 1 };
      }
      return {
        kind: "mixed",
        sampleValues: addSample([current.value], value),
        valueCount: current.count + 1,
        emptyCount: 0,
      };
    }
    case "mixed": {
      return {
        ...current,
        sampleValues: addSample(current.sampleValues, value),
        valueCount: current.valueCount + 1,
      };
    }
    // chip-array and summary are dispatched before applyAdd is called.
    case "chip-array":
    case "summary":
      return current;
  }
}

/**
 * Apply a single-image REMOVE delta to the current reconciliation for one field.
 * Used by `reconcileRemove`.
 *
 * Remove from `mixed` cannot be handled incrementally (we don't know if the
 * removed value was the only one of its kind) -- marks the field as `dirty`.
 * A subsequent `scheduleChunkedReconcile` will do a full recompute.
 */
function applyRemove(
  current: FieldReconciliation,
  value: unknown | null,
): FieldReconciliation {
  if (current.kind === "pending" || current.kind === "dirty") return current;

  switch (current.kind) {
    case "all-empty":
      return { kind: "all-empty", count: Math.max(0, current.count - 1) };
    case "all-same": {
      if (!valuesEqual(current.value, value)) {
        // Should not happen in a correctly maintained store, but guard anyway.
        return { kind: "dirty" };
      }
      if (current.count <= 1) return { kind: "all-empty", count: 0 };
      return { kind: "all-same", value: current.value, count: current.count - 1 };
    }
    case "mixed":
      // Can't cheaply determine the new state -- dirty.
      return { kind: "dirty" };
    // chip-array and summary are dispatched before applyRemove is called.
    case "chip-array":
    case "summary":
      return { kind: "dirty" };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full O(N x F) recompute from scratch.
 *
 * Called when:
 * - The initial selection is populated (e.g. range add after metadata fetch).
 * - A `dirty` field needs to be resolved.
 * - Test assertions need a known-good baseline.
 *
 * @param images  All currently selected images for which metadata is cached.
 * @param fields  The subset of fields to reconcile.
 */
export function recomputeAll(
  images: Image[],
  fields: FieldDefinition[],
): ReconciledView {
  const view: ReconciledView = new Map();

  for (const field of fields) {
    // Dispatch non-scalar behaviours first.
    if (field.multiSelectBehaviour === "chip-array") {
      view.set(field.id, recomputeChipArray(images, field));
      continue;
    }
    if (field.multiSelectBehaviour === "summary-only") {
      view.set(field.id, recomputeSummary(images, field));
      continue;
    }

    if (images.length === 0) {
      view.set(field.id, { kind: "all-empty", count: 0 });
      continue;
    }

    let valueCount = 0;
    let emptyCount = 0;
    let firstValue: unknown | null = null;
    let allSame = true;
    const samples: unknown[] = [];

    for (const img of images) {
      const v = extractValue(img, field);
      if (v === null) {
        emptyCount++;
      } else {
        valueCount++;
        if (firstValue === null) {
          firstValue = v;
          samples.push(v);
        } else if (allSame && !valuesEqual(firstValue, v)) {
          allSame = false;
          if (samples.length < 3) samples.push(v);
        } else if (!allSame && samples.length < 3 && !samples.some((s) => valuesEqual(s, v))) {
          samples.push(v);
        }
      }
    }

    if (valueCount === 0) {
      view.set(field.id, { kind: "all-empty", count: emptyCount });
    } else if (allSame && emptyCount === 0) {
      view.set(field.id, { kind: "all-same", value: firstValue, count: valueCount });
    } else {
      view.set(field.id, { kind: "mixed", sampleValues: samples, valueCount, emptyCount });
    }
  }

  return view;
}

/**
 * Incremental O(F) add of a single image to an existing reconciled view.
 *
 * Returns a **new** Map (does not mutate `prevView`). Callers can safely
 * memoize on object identity of the returned Map.
 *
 * @param image     The newly added image (must have been fetched from cache).
 * @param prevView  The current reconciled view (may be null -- treated as empty).
 * @param fields    The same field list used to build `prevView`.
 */
export function reconcileAdd(
  image: Image,
  prevView: ReconciledView | null,
  fields: FieldDefinition[],
): ReconciledView {
  const next: ReconciledView = new Map(prevView ?? undefined);

  for (const field of fields) {
    // Dispatch chip-array: incremental per-chip count update.
    if (field.multiSelectBehaviour === "chip-array") {
      const v = field.accessor(image);
      const values = Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string" && x !== "")
        : [];
      const prev: FieldReconciliation = prevView?.get(field.id) ?? {
        kind: "chip-array",
        chips: [],
        total: 0,
      };
      next.set(field.id, applyChipArrayAdd(prev, values));
      continue;
    }
    // Dispatch summary-only: can't update incrementally -- schedule full recompute.
    if (field.multiSelectBehaviour === "summary-only") {
      next.set(field.id, { kind: "dirty" });
      continue;
    }

    const prev: FieldReconciliation = prevView?.get(field.id) ?? {
      kind: "all-empty",
      count: 0,
    };
    next.set(field.id, applyAdd(prev, extractValue(image, field)));
  }

  return next;
}

/**
 * Incremental O(F) remove of a single image from an existing reconciled view.
 *
 * Returns a **new** Map. Fields that can be handled incrementally are updated;
 * `mixed` fields are marked `dirty` (requiring a future `recomputeAll`).
 *
 * @param image     The image being removed (must have been in `selectedIds`).
 * @param prevView  The current reconciled view.
 * @param fields    The same field list used to build `prevView`.
 */
export function reconcileRemove(
  image: Image,
  prevView: ReconciledView | null,
  fields: FieldDefinition[],
): ReconciledView {
  const next: ReconciledView = new Map(prevView ?? undefined);

  for (const field of fields) {
    // chip-array and summary-only can't be decremented incrementally -- mark dirty.
    if (
      field.multiSelectBehaviour === "chip-array" ||
      field.multiSelectBehaviour === "summary-only"
    ) {
      next.set(field.id, { kind: "dirty" });
      continue;
    }

    const prev: FieldReconciliation = prevView?.get(field.id) ?? {
      kind: "all-empty",
      count: 0,
    };
    next.set(field.id, applyRemove(prev, extractValue(image, field)));
  }

  return next;
}

/**
 * Returns true if any field in the view has `kind: "dirty"` -- indicating
 * that a `recomputeAll` is needed to resolve stale state after a remove.
 */
export function hasDirtyFields(view: ReconciledView): boolean {
  for (const rec of view.values()) {
    if (rec.kind === "dirty") return true;
  }
  return false;
}
