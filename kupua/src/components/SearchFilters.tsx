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

/** Fields that default to descending (newest first) on first sort. */
const DESC_BY_DEFAULT = new Set(["uploadTime", "taken", "lastModified"]);

/** Sortable fields: display label → orderBy key (as used in the URL / ES adapter) */
const SORTABLE_FIELDS = [
  { label: "Uploaded", value: "uploadTime" },
  { label: "Taken", value: "taken" },
  { label: "Modified", value: "lastModified" },
  { label: "Credit", value: "metadata.credit" },
  { label: "Source", value: "metadata.source" },
  { label: "Uploader", value: "uploadedBy" },
  { label: "File type", value: "source.mimeType" },
  { label: "Category", value: "usageRights.category" },
] as const;

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

function FilterControls() {
  const params = useSearch({ from: "/" });
  const updateSearch = useUpdateSearchParams();

  const handleFreeOnlyToggle = useCallback(() => {
    const newValue = params.nonFree === "true" ? undefined : "true";
    updateSearch({ nonFree: newValue });
  }, [params.nonFree, updateSearch]);

  return (
    <div className="hidden md:flex items-center gap-3 shrink-0">
      {/* Free to use only toggle */}
      <label className="flex items-center gap-1.5 text-xs text-grid-text-muted cursor-pointer select-none whitespace-nowrap">
        <input
          type="checkbox"
          checked={params.nonFree !== "true"}
          onChange={handleFreeOnlyToggle}
          className="rounded border-grid-border bg-grid-panel text-grid-accent focus:ring-grid-accent focus:ring-offset-0 w-3.5 h-3.5"
        />
        Free to use only
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
  const params = useSearch({ from: "/" });
  const updateSearch = useUpdateSearchParams();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const orderBy = params.orderBy ?? "-uploadTime";
  const { field: sortField, desc: sortDesc } = parsePrimarySort(orderBy);
  const secondaryPart = orderBy.includes(",")
    ? orderBy.slice(orderBy.indexOf(","))
    : "";

  const currentLabel =
    SORTABLE_FIELDS.find((f) => f.value === sortField)?.label ?? sortField;

  const handleSelectField = useCallback(
    (value: string) => {
      const prefix = DESC_BY_DEFAULT.has(value) ? "-" : "";
      updateSearch({ orderBy: `${prefix}${value}${secondaryPart}` });
      setOpen(false);
    },
    [updateSearch, secondaryPart]
  );

  const handleToggleDirection = useCallback(() => {
    const newPrimary = sortDesc ? sortField : `-${sortField}`;
    updateSearch({ orderBy: `${newPrimary}${secondaryPart}` });
  }, [sortField, sortDesc, secondaryPart, updateSearch]);

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
        className={`flex items-center gap-1 px-2 py-1 border border-grid-border rounded-l text-xs transition-colors cursor-pointer select-none whitespace-nowrap hover:text-grid-text-bright hover:border-grid-text-muted ${
          open
            ? "text-grid-text-bright border-grid-text-muted"
            : "text-grid-text-muted"
        }`}
      >
        {currentLabel}
        <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <path d={open ? "M3 8l3-3 3 3" : "M3 4l3 3 3-3"} stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Direction toggle */}
      <button
        onClick={handleToggleDirection}
        aria-label={sortDesc ? "Sort descending, click to sort ascending" : "Sort ascending, click to sort descending"}
        className="px-1.5 py-1 border border-grid-border border-l-0 rounded-r text-xs text-grid-text-muted hover:text-grid-text-bright hover:border-grid-text-muted focus:text-grid-text-bright focus:border-grid-text-muted focus:outline-none transition-colors cursor-pointer"
        title={sortDesc ? "Descending — click to sort ascending" : "Ascending — click to sort descending"}
      >
        <span aria-hidden="true">{sortDesc ? "↓" : "↑"}</span>
      </button>

      {/* Dropdown menu — uses shared popup-menu / popup-item classes */}
      {open && (
        <div
          role="listbox"
          aria-label="Sort field"
          className="absolute top-full right-0 mt-1 popup-menu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {SORTABLE_FIELDS.map((opt) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={sortField === opt.value}
              onClick={() => handleSelectField(opt.value)}
              className="popup-item"
            >
              <span className="w-3 text-center text-grid-accent">
                {sortField === opt.value ? "✓" : ""}
              </span>
              {opt.label}
            </div>
          ))}
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

