/**
 * Search filters — toolbar controls alongside the search input.
 *
 * Split into two parts for layout:
 * - `SearchFilters` — "Free to use only" checkbox + date range (middle of toolbar)
 * - `SearchFilters.Sort` — sort field dropdown + direction toggle (right end of toolbar)
 *
 * Both are hidden on small screens (< md) to keep the toolbar usable on mobile,
 * where only the logo + search input are shown.  Sort via column header clicks
 * still works on any screen size.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useBrowsingSearch } from "@/lib/browsing-context";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { DateFilter } from "./DateFilter";
import { SORT_DROPDOWN_OPTIONS, DESC_BY_DEFAULT } from "@/lib/field-registry";
import { useSearchStore } from "@/stores/search-store";
import { beginTraceInteraction } from "@/lib/perceived-trace";

/** Sortable fields for the dropdown — derived from the field registry. */
const SORTABLE_FIELDS = SORT_DROPDOWN_OPTIONS;

export function isAiSortOptionEnabled(field: string): boolean {
  return field === "relevance" || field === "uploadTime";
}

/** Parse the primary sort field and direction from the orderBy param */
function parsePrimarySort(orderBy: string): { field: string; desc: boolean } {
  const primary = orderBy.split(",")[0].trim();
  const desc = primary.startsWith("-");
  const field = desc ? primary.slice(1) : primary;
  return { field, desc };
}

// ---------------------------------------------------------------------------
// Middle filters: free-to-use toggle + date range
// ---------------------------------------------------------------------------

function FilterControls({ inSheet = false }: { inSheet?: boolean }) {
  const params = useBrowsingSearch();
  const updateSearch = useUpdateSearchParams();

  const handleFreeOnlyToggle = useCallback(() => {
    beginTraceInteraction("filter-toggle", { filter: "nonFree", newValue: params.nonFree === "true" ? undefined : "true" });
    const newValue = params.nonFree === "true" ? undefined : "true";
    updateSearch({ nonFree: newValue });
  }, [params.nonFree, updateSearch]);

  return (
    <div className={inSheet ? "flex flex-col items-start gap-5" : "hidden wide:min-[760px]:flex items-center gap-3 shrink-0"}>
      {/* Free to use only toggle */}
      <label className={`flex items-center gap-1.5 text-grid-text-muted cursor-pointer select-none whitespace-nowrap ${inSheet ? "text-sm gap-3" : "text-sm"}`}>
        <input
          type="checkbox"
          checked={params.nonFree !== "true"}
          onChange={handleFreeOnlyToggle}
          className={`rounded border-grid-border bg-grid-bg text-grid-accent focus:ring-grid-accent focus:ring-offset-0 ${inSheet ? "w-5 h-5" : "w-3.5 h-3.5"}`}
        />
        <span className={inSheet ? "hidden" : "lg:hidden"}>Free only</span>
        <span className={inSheet ? "" : "hidden lg:inline"}>Free to use only</span>
      </label>

      {/* Date range filter (Refine sheet lays it out separately) */}
      {!inSheet && <DateFilter />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort controls (right end of toolbar)
// ---------------------------------------------------------------------------

function SortControls({ inSheet = false, alwaysVisible = false }: { inSheet?: boolean; alwaysVisible?: boolean }) {
  const params = useBrowsingSearch();
  const updateSearch = useUpdateSearchParams();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusedImageId = useSearchStore((s) => s.focusedImageId);

  const orderBy = params.orderBy ?? "-uploadTime";
  const { field: sortField, desc: sortDesc } = parsePrimarySort(orderBy);

  // When AI query is active, prepend a "Relevance" option and treat
  // -relevance as the default sort (so the indicator dot is suppressed).
  const hasAiChip = !!params.aiQuery;
  const effectiveSortableFields = hasAiChip
    ? [{ label: "Relevance", value: "relevance" }, ...SORTABLE_FIELDS]
    : SORTABLE_FIELDS;
  const defaultSort = hasAiChip ? "-relevance" : "-uploadTime";

  const currentLabel =
    effectiveSortableFields.find((f) => f.value === sortField)?.label ?? sortField;

  const isNonDefaultSort = orderBy !== defaultSort;

  const handleSelectField = useCallback(
    (value: string) => {
      if (hasAiChip && !isAiSortOptionEnabled(value)) return;
      const action = focusedImageId ? "sort-around-focus" : "sort-no-focus";
      beginTraceInteraction(action, { sort: value, focusedId: focusedImageId });
      if (value === sortField) {
        const newPrimary = sortDesc ? value : `-${value}`;
        updateSearch({ orderBy: newPrimary });
      } else {
        const prefix = DESC_BY_DEFAULT.has(value) ? "-" : "";
        updateSearch({ orderBy: `${prefix}${value}` });
      }
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    },
    [updateSearch, sortField, sortDesc, focusedImageId, hasAiChip]
  );

  const handleToggleDirection = useCallback(() => {
    const action = focusedImageId ? "sort-around-focus" : "sort-no-focus";
    beginTraceInteraction(action, { sort: sortField, dir: sortDesc ? "asc" : "desc", focusedId: focusedImageId });
    const newPrimary = sortDesc ? sortField : `-${sortField}`;
    updateSearch({ orderBy: newPrimary });
  }, [sortField, sortDesc, updateSearch, focusedImageId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const options = Array.from(dropdownRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? []);
    (options.find(option => option.getAttribute("aria-selected") === "true") ?? options[0])?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div ref={dropdownRef} className={`${inSheet || alwaysVisible ? "flex" : "hidden wide:min-[760px]:flex"} items-center gap-0.5 shrink-0 relative`}
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus({ preventScroll: true });
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        if (!open && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        event.stopPropagation();
        if (!open) { setOpen(true); return; }
        const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)'));
        if (!options.length) return;
        const index = options.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        options[next].focus({ preventScroll: true });
      }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}
    >
      {/* Sort field button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Sort by: ${currentLabel}`}
        className={`relative flex items-center gap-1 px-2 py-1 border border-grid-border rounded-l text-sm transition-colors cursor-pointer select-none whitespace-nowrap hover:text-grid-text-bright hover:border-grid-text-muted ${
          open
            ? "text-grid-text-bright border-grid-text-muted"
            : "text-grid-text-muted"
        }`}
      >
        {currentLabel}
        <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <path d={open ? "M3 8l3-3 3 3" : "M3 4l3 3 3-3"} stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {/* Non-default sort indicator — positioned as a badge to avoid layout shift */}
        {isNonDefaultSort && (
          <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-grid-accent" />
        )}
      </button>

      {/* Direction toggle — uses Material Icons arrow_downward / arrow_upward
           at w-4 h-4 (16px) to match the sort field button's text-sm line height,
           keeping both button borders aligned within ~1px. */}
      <button
        onClick={handleToggleDirection}
        aria-label={sortDesc ? "Sort descending, click to sort ascending" : "Sort ascending, click to sort descending"}
        className="px-1.5 py-1 border border-grid-border border-l-0 rounded-r text-sm text-grid-text-muted hover:text-grid-text-bright hover:border-grid-text-muted focus:text-grid-text-bright focus:border-grid-text-muted focus:outline-none transition-colors cursor-pointer select-none"
        title={sortDesc ? "Descending — click to sort ascending" : "Ascending — click to sort descending"}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {sortDesc
            ? <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
            : <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" />
          }
        </svg>
      </button>

      {/* Dropdown menu — uses shared popup-menu / popup-item classes. */}
      {open && (
        <div
          role="listbox"
          aria-label="Sort field"
          className="absolute top-full right-0 mt-1 popup-menu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {effectiveSortableFields.map((opt) => {
            const isPrimary = sortField === opt.value;
            const disabled = hasAiChip && !isAiSortOptionEnabled(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                tabIndex={isPrimary ? 0 : -1}
                disabled={disabled}
                aria-selected={isPrimary}
                aria-disabled={disabled}
                data-sort-key={opt.value}
                onClick={disabled ? undefined : () => handleSelectField(opt.value)}
                className={`popup-item text-left focus-visible:bg-grid-hover ${disabled ? "opacity-45 cursor-not-allowed" : ""}`}
              >
                <span className="w-4 flex items-center justify-center text-grid-accent shrink-0">
                  {isPrimary && (
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      {sortDesc
                        ? <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
                        : <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" />
                      }
                    </svg>
                  )}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export as compound component: SearchFilters + SearchFilters.Sort
// ---------------------------------------------------------------------------

export const SearchFilters = Object.assign(FilterControls, {
  Sort: SortControls,
});

