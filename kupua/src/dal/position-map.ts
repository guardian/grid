/**
 * Position Map — lightweight index mapping global position → sort values.
 *
 * Used by the scrubber to enable scroll-like behaviour for result sets up to
 * 65,000 images without loading all `_source` data into memory. Only `_id` and
 * `sort` values are fetched (~200 bytes/doc wire, ~288 bytes/doc V8 heap).
 *
 * Layout: struct-of-arrays — two parallel arrays instead of 65k individual
 * objects. Fewer GC roots, better cache locality, less per-element overhead.
 *
 * Phase 0 measurements (TEST, 65k docs):
 *   Wire: ~12MB total, V8 heap: ~18MB, fetch time: ~5.3s (10k chunks).
 */

import type { SortValues } from "./types";

// ---------------------------------------------------------------------------
// Position Map data structure
// ---------------------------------------------------------------------------

/**
 * A lightweight index of all results in sort order.
 *
 * `ids[i]` and `sortValues[i]` describe the document at global position `i`.
 * Sort values are trimmed to match the sort clause length (PIT's `_shard_doc`
 * tiebreaker is stripped during construction).
 */
export interface PositionMap {
  /** Number of entries in the map. */
  length: number;
  /** Image IDs, indexed by global position. */
  ids: string[];
  /** Sort values per image, indexed by global position. Parallel to `ids`. */
  sortValues: SortValues[];
}

// ---------------------------------------------------------------------------
// Chunk size constant for the fetch loop
// ---------------------------------------------------------------------------

/**
 * Number of documents per chunk when fetching the position map.
 * Tuned in Phase 0: 10k balances round-trip overhead vs GC pressure.
 */
export const POSITION_MAP_CHUNK_SIZE = 10_000;

// ---------------------------------------------------------------------------
// cursorForPosition — the core helper consumed by Phase 3 seek
// ---------------------------------------------------------------------------

/**
 * Look up the `search_after` cursor for seeking to a given global position.
 *
 * Encapsulates the `search_after` off-by-one: ES returns documents
 * **strictly after** the cursor, so seeking to position N requires the sort
 * values of the document at position N−1.
 *
 * Edge cases:
 * - **Position 0**: no predecessor — return `null` (no cursor → fetch from start).
 * - **Position ≥ map.length**: clamped to last valid position.
 * - **Tied sort values**: safe — the id tiebreaker makes each sort tuple unique.
 *
 * @param map — the position map (must be non-empty for positions > 0).
 * @param targetPosition — 0-based global position to seek to.
 * @returns Sort values to pass as `search_after`, or `null` for position 0.
 */
export function cursorForPosition(
  map: PositionMap,
  targetPosition: number,
): SortValues | null {
  if (targetPosition <= 0) return null;

  // Clamp to valid range — position N uses sortValues[N-1]
  const cursorIndex = Math.min(targetPosition, map.length) - 1;
  return map.sortValues[cursorIndex] ?? null;
}

