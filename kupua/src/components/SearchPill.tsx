/**
 * SearchPill -- a compact pill-shaped button for clickable metadata values.
 *
 * Used for list fields (keywords, subjects, people) in both the metadata
 * panel and the table view. Each pill represents a single value; clicking
 * it triggers a search (same modifier pattern as all other click-to-search
 * in kupua: click = replace, Shift = AND, Alt = exclude).
 *
 * Multi-select variants:
 * - MultiSearchPill: direct callback, full (all images) or partial (some images).
 * - DataSearchPill: delegated click via data attrs, also supports partial styling.
 *
 * A "partial" chip means the value appears on some but not all images in the
 * selection. Rendered hollow (transparent bg, dim text) to distinguish from
 * full chips that are on every selected image.
 */

import { ALT_CLICK } from "@/lib/keyboard-shortcuts";

// ---------------------------------------------------------------------------
// SearchPill -- for use in ImageMetadata (direct callback)
// ---------------------------------------------------------------------------

interface SearchPillProps {
  /** The text to display inside the pill. */
  value: string;
  /** CQL field key for search (e.g. "keyword", "person", "subject"). */
  cqlKey: string;
  /** Callback fired on click -- receives cqlKey, value, and the event. */
  onSearch: (cqlKey: string, value: string, e: React.MouseEvent) => void;
}

export function SearchPill({ value, cqlKey, onSearch }: SearchPillProps) {
  return (
    <button
      type="button"
      className="inline-flex items-center px-1.5 py-0 rounded-sm text-xs
                 bg-grid-cell-hover/60 text-grid-text
                 hover:bg-grid-accent/20 hover:text-grid-accent
                 cursor-pointer transition-colors leading-snug"
      onClick={(e) => onSearch(cqlKey, value, e)}
      title={`${value}\nShift+click to add, ${ALT_CLICK} to exclude`}
    >
      {value}
    </button>
  );
}

// ---------------------------------------------------------------------------
// DataSearchPill -- for use in ImageTable (delegated click via data attrs)
// ---------------------------------------------------------------------------

interface DataSearchPillProps {
  value: string;
  cqlKey: string;
  /** Optional: marks chip as partial (on some but not all images). */
  partial?: boolean;
}

/**
 * A pill that carries data-cql-key and data-cql-value attributes for
 * delegated click handling in the table. The table's row click handler
 * reads these attributes to trigger search -- no callback prop needed.
 *
 * `partial` adds a data-partial attribute for CSS hollow-chip styling.
 */
export function DataSearchPill({
  value,
  cqlKey,
  partial,
}: DataSearchPillProps) {
  return (
    <span
      data-cql-key={cqlKey}
      data-cql-value={value}
      data-partial={partial ? "true" : undefined}
      className="inline-flex items-center shrink-0 px-1.5 py-0 rounded-sm text-xs
                 bg-grid-cell-hover/60 text-grid-text
                 hover:bg-grid-accent/20 hover:text-grid-accent
                 cursor-pointer transition-colors leading-snug"
    >
      {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// MultiSearchPill -- for multi-select panel (direct callback + partial state)
// ---------------------------------------------------------------------------

interface MultiSearchPillProps {
  value: string;
  cqlKey: string;
  /** Number of selected images that carry this chip value. */
  count: number;
  /** Total number of selected images (= selectedIds.size). */
  total: number;
  /** True when value appears on some but not all selected images. */
  partial: boolean;
  onSearch: (cqlKey: string, value: string, e: React.MouseEvent) => void;
}

/**
 * Pill for the multi-select metadata panel. Full chips (partial=false) look
 * identical to regular SearchPills. Partial chips are rendered hollow to
 * indicate the value is only present on some images in the selection.
 */
export function MultiSearchPill({
  value,
  cqlKey,
  count,
  total,
  partial,
  onSearch,
}: MultiSearchPillProps) {
  return (
    <button
      type="button"
      data-partial={partial ? "true" : undefined}
      className={
        partial
          ? "inline-flex items-center px-1.5 py-0 rounded-sm text-xs border border-grid-cell-hover text-grid-text-dim bg-transparent cursor-pointer transition-colors leading-snug hover:border-grid-accent hover:text-grid-accent"
          : "inline-flex items-center px-1.5 py-0 rounded-sm text-xs bg-grid-cell-hover/60 text-grid-text hover:bg-grid-accent/20 hover:text-grid-accent cursor-pointer transition-colors leading-snug"
      }
      onClick={(e) => onSearch(cqlKey, value, e)}
      title={`${value} (on ${count} of ${total})\nShift+click to add, ${ALT_CLICK} to exclude`}
    >
      {value}
    </button>
  );
}

