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
// Shared Tailwind class strings for pill variants
// ---------------------------------------------------------------------------

const PILL_BASE = "inline-flex items-center px-1.5 py-0 rounded-sm text-xs cursor-pointer transition-colors leading-snug";

const PILL_DEFAULT = `${PILL_BASE} bg-grid-cell-hover/60 text-grid-text hover:bg-grid-accent/20 hover:text-grid-accent`;

const PILL_ACCENT = `${PILL_BASE} bg-grid-accent text-white hover:bg-grid-accent-light hover:text-white`;

/** Exported for direct use in grid cell label rendering. */
export { PILL_ACCENT };

const PILL_PARTIAL = `${PILL_BASE} border border-grid-cell-hover text-grid-text-dim bg-transparent hover:border-grid-accent hover:text-grid-accent`;

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
  /** Accent variant (Guardian blue bg) — used for labels. */
  accent?: boolean;
}

export function SearchPill({ value, cqlKey, onSearch, accent }: SearchPillProps) {
  return (
    <button
      type="button"
      className={accent
        ? PILL_ACCENT
        : PILL_DEFAULT
      }
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
  /** Accent variant (Guardian blue bg) — used for labels. */
  accent?: boolean;
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
  accent,
}: DataSearchPillProps) {
  return (
    <span
      data-cql-key={cqlKey}
      data-cql-value={value}
      data-partial={partial ? "true" : undefined}
      className={accent
        ? PILL_ACCENT + " shrink-0"
        : PILL_DEFAULT + " shrink-0"
      }
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
  /** Accent variant (Guardian blue bg) — used for labels. */
  accent?: boolean;
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
  accent,
  onSearch,
}: MultiSearchPillProps) {
  const cls = partial
    ? PILL_PARTIAL  // partial is always grey/hollow regardless of accent
    : accent ? PILL_ACCENT : PILL_DEFAULT;
  return (
    <button
      type="button"
      data-partial={partial ? "true" : undefined}
      className={cls}
      onClick={(e) => onSearch(cqlKey, value, e)}
      title={`${value} (on ${count} of ${total})\nShift+click to add, ${ALT_CLICK} to exclude`}
    >
      {value}
    </button>
  );
}

