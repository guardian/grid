/**
 * SearchPill — a compact pill-shaped button for clickable metadata values.
 *
 * Used for list fields (keywords, subjects, people) in both the metadata
 * panel and the table view. Each pill represents a single value; clicking
 * it triggers a search (same modifier pattern as all other click-to-search
 * in kupua: click = replace, Shift = AND, Alt = exclude).
 *
 * Read-only for now. When editing arrives (Phase 3+), pills gain a ×
 * button and "partial" styling for multi-selection.
 *
 * Deliberately minimal — a styled <button> with a data attribute for
 * delegated click handling (table) or a direct callback (metadata panel).
 */

import { ALT_CLICK } from "@/lib/keyboard-shortcuts";

// ---------------------------------------------------------------------------
// SearchPill — for use in ImageMetadata (direct callback)
// ---------------------------------------------------------------------------

interface SearchPillProps {
  /** The text to display inside the pill. */
  value: string;
  /** CQL field key for search (e.g. "keyword", "person", "subject"). */
  cqlKey: string;
  /** Callback fired on click — receives cqlKey, value, and the event. */
  onSearch: (cqlKey: string, value: string, e: React.MouseEvent) => void;
}

export function SearchPill({ value, cqlKey, onSearch }: SearchPillProps) {
  return (
    <button
      type="button"
      className="inline-flex items-center px-1.5 py-0 rounded-sm text-xs
                 bg-grid-panel-hover/60 text-grid-text
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
// DataSearchPill — for use in ImageTable (delegated click via data attrs)
// ---------------------------------------------------------------------------

interface DataSearchPillProps {
  value: string;
  cqlKey: string;
}

/**
 * A pill that carries data-cql-key and data-cql-value attributes for
 * delegated click handling in the table. The table's row click handler
 * reads these attributes to trigger search — no callback prop needed.
 */
export function DataSearchPill({ value, cqlKey }: DataSearchPillProps) {
  return (
    <span
      data-cql-key={cqlKey}
      data-cql-value={value}
      className="inline-flex items-center shrink-0 px-1.5 py-0 rounded-sm text-xs
                 bg-grid-panel-hover/60 text-grid-text
                 hover:bg-grid-accent/20 hover:text-grid-accent
                 cursor-pointer transition-colors leading-snug"
    >
      {value}
    </span>
  );
}

