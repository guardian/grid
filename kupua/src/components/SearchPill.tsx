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
 * - DataSearchPill: delegated click via data attrs.
 *
 * A "partial" chip means the value appears on some but not all images in the
 * selection. Rendered hollow (transparent bg, dim text) to distinguish from
 * full chips that are on every selected image.
 */

import { ALT_CLICK } from "@/lib/keyboard-shortcuts";
import type { ReactNode } from "react";

export const PILL_ACTION_ICONS = {
  close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  confirm: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  addBox: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z",
  applyAll: "M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z",
} as const;

export function containPillActivation(event: React.KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
}

export function PillActionButton({ action, label, title = label, attached = false, compact = false, disabled, onClick, ref }: {
  action: "add" | "remove" | "apply-all" | "confirm" | "cancel";
  label: string;
  title?: string;
  attached?: boolean;
  compact?: boolean;
  disabled?: boolean;
  onClick: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return <button ref={ref} type="button" aria-label={label} title={title} disabled={disabled} onClick={onClick} onKeyDown={containPillActivation}
    className={`inline-flex shrink-0 cursor-pointer items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-grid-accent ${attached
      ? "w-4.5 self-stretch pointer-coarse:w-11 first:rounded-l-sm last:rounded-r-sm"
      : action === "confirm" || action === "cancel"
        ? `h-6 w-6.5 pointer-coarse:size-11 text-white ${action === "confirm" ? "bg-grid-accent enabled:hover:bg-grid-accent-hover" : "bg-[#898989] enabled:hover:bg-grid-hover"}`
      : compact ? "size-4 self-start pointer-coarse:size-11 text-grid-text enabled:hover:text-white"
      : "size-8 pointer-coarse:size-11 rounded-sm bg-grid-cell-hover text-grid-text hover:bg-grid-accent/20 hover:text-grid-accent"}`}>
    <svg className={attached ? "size-3.5" : "size-4"} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={action === "confirm" ? PILL_ACTION_ICONS.confirm
        : action === "cancel" || action === "remove" ? PILL_ACTION_ICONS.close
        : action === "apply-all" ? PILL_ACTION_ICONS.applyAll
        : compact ? PILL_ACTION_ICONS.addBox : PILL_ACTION_ICONS.add} />
    </svg>
  </button>;
}

export function EditableSearchPill({ value, label, cqlKey, onSearch, accent, count, total, coverageKnown = true, disabled, onAdd, onRemove }: {
  value: string;
  label?: ReactNode;
  cqlKey: string;
  onSearch: SearchPillProps["onSearch"];
  accent?: boolean;
  count: number;
  total: number;
  coverageKnown?: boolean;
  disabled?: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const partial = !coverageKnown || count < total;
  const pillClass = partial
    ? `${PILL_BASE} bg-white ${accent ? "text-grid-accent" : "text-[#222]"}`
    : accent ? `${PILL_BASE} bg-grid-accent text-white` : PILL_DEFAULT;
  return <span data-editable-pill data-accent={accent || undefined} data-coverage={partial ? "partial" : "all"} className={`${pillClass} max-w-full p-0! items-stretch! pointer-coarse:min-h-[var(--mobile-edit-control-size)]`} onKeyDown={containPillActivation}>
    {partial && <PillActionButton action="apply-all" attached title={`Apply ${cqlKey} to all ${total} ${total === 1 ? "image" : "images"}`}
      label={`Apply ${value} to all selected images`} disabled={disabled} onClick={onAdd} />}
    <span className="min-w-0 flex [&>button]:rounded-none [&>button]:border-0 [&>button]:ring-0 [&>button]:bg-transparent [&>button]:text-inherit [&>button]:max-w-full [&>button]:text-left [&>button]:wrap-anywhere">
      {coverageKnown
        ? <MultiSearchPill value={value} label={label} cqlKey={cqlKey} count={count} total={total} partial={count < total} accent={accent} onSearch={onSearch} />
        : <SearchPill value={value} label={label} cqlKey={cqlKey} onSearch={onSearch} accent={accent} />}
    </span>
    <PillActionButton action="remove" attached title={`Remove ${cqlKey} from ${coverageKnown ? `${count > 1 ? "all " : ""}${count}` : "selected"} ${coverageKnown && count === 1 ? "image" : "images"}`}
      label={`Remove ${value}${total > 1 ? " from all selected images" : ""}`} disabled={disabled} onClick={onRemove} />
  </span>;
}

// ---------------------------------------------------------------------------
// Shared Tailwind class strings for pill variants
// ---------------------------------------------------------------------------

const PILL_BASE = "inline-flex items-center px-1.5 py-0 rounded-sm text-xs cursor-pointer transition-colors leading-snug";

const PILL_DEFAULT = `${PILL_BASE} bg-[#222] text-[#aaa]`;

const PILL_ACCENT = `${PILL_BASE} bg-grid-accent text-white hover:bg-grid-accent-light hover:text-white`;

/** Exported for direct use in grid cell label rendering. */
export { PILL_ACCENT, PILL_BASE };

const PILL_PARTIAL = `${PILL_BASE} ring-1 ring-inset ring-grid-cell-hover text-grid-text-dim bg-transparent hover:ring-grid-accent hover:text-grid-accent`;

// ---------------------------------------------------------------------------
// SearchPill -- for use in ImageMetadata (direct callback)
// ---------------------------------------------------------------------------

interface SearchPillProps {
  /** The text to display inside the pill. */
  value: string;
  /** CQL field key for search (e.g. "keyword", "person", "subject"). */
  cqlKey: string;
  /** Optional display label override. If set, shown instead of value. Value is still used for CQL search. */
  label?: ReactNode;
  /** Callback fired on click -- receives cqlKey, value, and the event. */
  onSearch: (cqlKey: string, value: string, e: React.MouseEvent) => void;
  /** Accent variant (Guardian blue bg) — used for labels. */
  accent?: boolean;
}

export function SearchPill({ value, cqlKey, label, onSearch, accent }: SearchPillProps) {
  return (
    <button
      type="button"
      data-search-pill data-accent={accent || undefined}
      className={accent
        ? PILL_ACCENT + " select-text"
        : PILL_DEFAULT + " select-text"
      }
      onClick={(e) => onSearch(cqlKey, value, e)}
      title={`${typeof label === "string" ? label : value}\nShift+click to add, ${ALT_CLICK} to exclude`}
    >
      {label ?? value}
    </button>
  );
}

// ---------------------------------------------------------------------------
// DataSearchPill -- for use in ImageTable (delegated click via data attrs)
// ---------------------------------------------------------------------------

interface DataSearchPillProps {
  value: string;
  cqlKey: string;
  /** Accent variant (Guardian blue bg) — used for labels. */
  accent?: boolean;
}

/**
 * A pill that carries data-cql-key and data-cql-value attributes for
 * delegated click handling in the table. The table's row click handler
 * reads these attributes to trigger search -- no callback prop needed.
 */
export function DataSearchPill({
  value,
  cqlKey,
  accent,
}: DataSearchPillProps) {
  return (
    <span
      data-cql-key={cqlKey}
      data-cql-value={value}
      data-search-pill data-accent={accent || undefined}
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
  label?: ReactNode;
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
  label,
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
      data-search-pill data-accent={accent || undefined}
      data-partial={partial ? "true" : undefined}
      className={cls + " select-text"}
      onClick={(e) => onSearch(cqlKey, value, e)}
      title={`${value} (${count.toLocaleString()}/${total.toLocaleString()})\nShift+click to add, ${ALT_CLICK} to exclude`}
    >
      {label ?? value}
    </button>
  );
}

