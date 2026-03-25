/**
 * Results bar — thin strip between the search toolbar and the table/grid.
 *
 * Shows:
 *   - Total result count
 *   - New images ticker (polls ES every 10s; click to refresh)
 *   - Density toggle (table / grid) — right-aligned
 *
 * Styled to match Grid's `results-toolbar`:
 *   - 28px height, dark background, border bottom
 *   - Ticker: accent-blue filled rectangle with white text
 */

import { useSearchStore } from "@/stores/search-store";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { formatDistanceToNow } from "date-fns";

export function StatusBar() {
  const { total, newCount, newCountSince, search: reSearch } =
    useSearchStore();
  const searchParams = useSearch({ from: "/search" });
  const updateSearch = useUpdateSearchParams();
  const isGrid = searchParams.density !== "table";

  const toggleDensity = useCallback(() => {
    updateSearch({ density: isGrid ? "table" : undefined });
  }, [isGrid, updateSearch]);

  return (
    <div className="flex items-center gap-2 px-3 h-7 bg-grid-panel border-b border-grid-separator text-sm text-grid-text-muted shrink-0 select-none">
      {/* Result count */}
      <span role="status" aria-live="polite" aria-atomic="true">
        {total.toLocaleString()} matches
      </span>

      {/* New images ticker */}
      {newCount > 0 && (
        <button
          onClick={() => reSearch()}
          className="bg-grid-accent hover:bg-grid-accent-hover text-white px-1.5 py-px rounded-sm cursor-pointer text-sm leading-tight"
          title={`${newCount.toLocaleString()} new images since ${
            newCountSince
              ? formatDistanceToNow(new Date(newCountSince), {
                  addSuffix: true,
                })
              : "last search"
          }`}
        >
          {newCount.toLocaleString()} new
        </button>
      )}

      {/* Spacer */}
      <span className="flex-1" />

      {/* Density toggle */}
      <button
        onClick={toggleDensity}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-grid-hover transition-colors cursor-pointer"
        title={isGrid ? "Switch to table view" : "Switch to grid view"}
        aria-label={isGrid ? "Switch to table view" : "Switch to grid view"}
      >
        {/* Table icon */}
        <svg
          className={`w-3.5 h-3.5 ${!isGrid ? "text-grid-accent" : "text-grid-text-muted"}`}
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="1" y="1" width="14" height="3" rx="0.5" />
          <rect x="1" y="6" width="14" height="3" rx="0.5" />
          <rect x="1" y="11" width="14" height="3" rx="0.5" />
        </svg>
        {/* Grid icon */}
        <svg
          className={`w-3.5 h-3.5 ${isGrid ? "text-grid-accent" : "text-grid-text-muted"}`}
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="1" y="1" width="6" height="6" rx="0.5" />
          <rect x="9" y="1" width="6" height="6" rx="0.5" />
          <rect x="1" y="9" width="6" height="6" rx="0.5" />
          <rect x="9" y="9" width="6" height="6" rx="0.5" />
        </svg>
      </button>
    </div>
  );
}


