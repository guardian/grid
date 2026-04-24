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
import { useSearch } from "@tanstack/react-router";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { DateFilter } from "./DateFilter";
import { SORT_DROPDOWN_OPTIONS, DESC_BY_DEFAULT } from "@/lib/field-registry";
import { useSearchStore } from "@/stores/search-store";
import { trace } from "@/lib/perceived-trace";

/** Sortable fields for the dropdown — derived from the field registry. */
const SORTABLE_FIELDS = SORT_DROPDOWN_OPTIONS;

/** Parse the primary sort field and direction from the orderBy param */
function parsePrimarySort(orderBy: string): { field: string; desc: boolean } {
  const primary = orderBy.split(",")[0].trim();
  const desc = primary.startsWith("-");
  const field = desc ? primary.slice(1) : primary;
  return { field, desc };
}

/** Parse the secondary sort field and direction (if any) from the orderBy param */
function parseSecondarySort(orderBy: string): { field: string; desc: boolean } | null {
  const parts = orderBy.split(",");
  if (parts.length < 2) return null;
  const secondary = parts[1].trim();
  if (!secondary) return null;
  const desc = secondary.startsWith("-");
  const field = desc ? secondary.slice(1) : secondary;
  return { field, desc };
}

// ---------------------------------------------------------------------------
// Middle filters: free-to-use toggle + date range
// ---------------------------------------------------------------------------

function FilterControls() {
  const params = useSearch({ from: "/search" });
  const updateSearch = useUpdateSearchParams();

  const handleFreeOnlyToggle = useCallback(() => {
    trace("filter-toggle", "t_0", { filter: "nonFree", newValue: params.nonFree === "true" ? undefined : "true" });
    const newValue = params.nonFree === "true" ? undefined : "true";
    updateSearch({ nonFree: newValue });
  }, [params.nonFree, updateSearch]);

  return (
    <div className="hidden sm:flex items-center gap-3 shrink-0">
      {/* Free to use only toggle */}
      <label className="flex items-center gap-1.5 text-sm text-grid-text-muted cursor-pointer select-none whitespace-nowrap">
        <input
          type="checkbox"
          checked={params.nonFree !== "true"}
          onChange={handleFreeOnlyToggle}
          className="rounded border-grid-border bg-grid-bg text-grid-accent focus:ring-grid-accent focus:ring-offset-0 w-3.5 h-3.5"
        />
        <span className="lg:hidden">Free only</span>
        <span className="hidden lg:inline">Free to use only</span>
      </label>

      {/* Date range filter */}
      <DateFilter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort controls (right end of toolbar)
// ---------------------------------------------------------------------------

function SortControls() {
  const params = useSearch({ from: "/search" });
  const updateSearch = useUpdateSearchParams();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const focusedImageId = useSearchStore((s) => s.focusedImageId);

  const orderBy = params.orderBy ?? "-uploadTime";
  const { field: sortField, desc: sortDesc } = parsePrimarySort(orderBy);
  const secondary = parseSecondarySort(orderBy);
  const primaryToken = orderBy.split(",")[0].trim();

  const currentLabel =
    SORTABLE_FIELDS.find((f) => f.value === sortField)?.label ?? sortField;

  // Default sort is "Upload time, descending" — show an indicator dot when
  // the user has changed it, same as DateFilter does for non-default dates.
  const isNonDefaultSort = orderBy !== "-uploadTime";

  const handleSelectField = useCallback(
    (value: string, e: React.MouseEvent) => {
      const action = focusedImageId ? "sort-around-focus" : "sort-no-focus";
      trace(action, "t_0", { sort: value, focusedId: focusedImageId });
      if (e.shiftKey) {
        // Shift+click — manage secondary sort (same logic as table column headers)
        if (!secondary) {
          // No secondary yet — add with natural default direction
          if (value !== sortField) {
            const prefix = DESC_BY_DEFAULT.has(value) ? "-" : "";
            updateSearch({ orderBy: `${primaryToken},${prefix}${value}` });
          }
        } else if (secondary.field === value) {
          // Toggle secondary direction
          const newSecondary = secondary.desc ? value : `-${value}`;
          updateSearch({ orderBy: `${primaryToken},${newSecondary}` });
        } else if (value !== sortField) {
          // Move secondary to new field with natural default direction
          const prefix = DESC_BY_DEFAULT.has(value) ? "-" : "";
          updateSearch({ orderBy: `${primaryToken},${prefix}${value}` });
        }
      } else {
        // Normal click — set primary, clear secondary
        if (value === sortField) {
          // Toggle primary direction
          const newPrimary = sortDesc ? value : `-${value}`;
          updateSearch({ orderBy: newPrimary });
        } else {
          const prefix = DESC_BY_DEFAULT.has(value) ? "-" : "";
          updateSearch({ orderBy: `${prefix}${value}` });
        }
      }
      setOpen(false);
    },
    [updateSearch, sortField, sortDesc, primaryToken, secondary, focusedImageId]
  );

  const handleToggleDirection = useCallback(() => {
    const action = focusedImageId ? "sort-around-focus" : "sort-no-focus";
    trace(action, "t_0", { sort: sortField, dir: sortDesc ? "asc" : "desc", focusedId: focusedImageId });
    const secondaryPart = secondary
      ? `,${secondary.desc ? "-" : ""}${secondary.field}`
      : "";
    const newPrimary = sortDesc ? sortField : `-${sortField}`;
    updateSearch({ orderBy: `${newPrimary}${secondaryPart}` });
  }, [sortField, sortDesc, secondary, updateSearch, focusedImageId]);

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

  // Close dropdown on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div ref={dropdownRef} className="hidden sm:flex items-center gap-0.5 shrink-0 relative">
      {/* Sort field button */}
      <button
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

      {/* Dropdown menu — uses shared popup-menu / popup-item classes.
           Normal click: set primary sort, clear secondary.
           Shift+click: add/toggle secondary sort (same as table column headers). */}
      {open && (
        <div
          role="listbox"
          aria-label="Sort field"
          className="absolute top-full right-0 mt-1 popup-menu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {SORTABLE_FIELDS.map((opt) => {
            const isPrimary = sortField === opt.value;
            const isSecondary = secondary?.field === opt.value;
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isPrimary}
                onClick={(e) => handleSelectField(opt.value, e)}
                className="popup-item"
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
                  {isSecondary && (
                    <span className="inline-flex opacity-65">
                      <svg className="w-3 h-3 -mr-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        {secondary!.desc
                          ? <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
                          : <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" />
                        }
                      </svg>
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        {secondary!.desc
                          ? <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
                          : <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" />
                        }
                      </svg>
                    </span>
                  )}
                </span>
                {opt.label}
              </div>
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

