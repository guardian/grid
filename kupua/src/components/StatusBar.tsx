/**
 * Results bar — thin strip between the search toolbar and the table/grid.
 *
 * Shows:
 *   - Left-panel toggle button (left edge)
 *   - Total result count
 *   - New images ticker (polls ES every 10s; click to refresh)
 *   - Right-panel toggle button + Density toggle (right edge)
 *
 * Styled to match Grid's `results-toolbar`:
 *   - 28px height, dark background, border bottom
 *   - Ticker: accent-blue filled rectangle with white text
 */

import { useSearchStore } from "@/stores/search-store";
import { usePanelStore } from "@/stores/panel-store";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { shortcutTooltip } from "@/lib/keyboard-shortcuts";

export function StatusBar() {
  const total = useSearchStore((s) => s.total);
  const newCount = useSearchStore((s) => s.newCount);
  const newCountSince = useSearchStore((s) => s.newCountSince);
  const sortAroundFocusStatus = useSearchStore((s) => s.sortAroundFocusStatus);
  const reSearch = useSearchStore((s) => s.search);
  const searchParams = useSearch({ from: "/search" });
  const updateSearch = useUpdateSearchParams();
  const isGrid = searchParams.density !== "table";

  const leftVisible = usePanelStore((s) => s.config.left.visible);
  const rightVisible = usePanelStore((s) => s.config.right.visible);
  const togglePanel = usePanelStore((s) => s.togglePanel);
  const filtersExpanded = usePanelStore((s) => s.isSectionOpen("left-filters"));
  const fetchAggregations = useSearchStore((s) => s.fetchAggregations);

  const toggleDensity = useCallback(() => {
    updateSearch({ density: isGrid ? "table" : undefined });
  }, [isGrid, updateSearch]);

  // Prefetch aggregations on hover — intentionally invisible ("magic") UX.
  // Only fires if panel is closed AND the Filters section is expanded in
  // localStorage (i.e. user is a "Filters person" who will see facets
  // immediately on open). The cache check inside fetchAggregations()
  // prevents duplicate requests.
  // Documented: infra-safeguards.md §6, panels-plan.md Decision #9.
  const handleBrowseHover = useCallback(() => {
    if (!leftVisible && filtersExpanded) {
      fetchAggregations();
    }
  }, [leftVisible, filtersExpanded, fetchAggregations]);

  return (
    <div className="flex items-stretch gap-0 h-7 bg-grid-bg border-b border-grid-separator text-sm text-grid-text-muted shrink-0 select-none relative">
      {/* Left panel toggle — full-height strip; when active, extends below
          the border to visually merge with the panel beneath */}
      <button
        onClick={() => togglePanel("left")}
        onMouseEnter={handleBrowseHover}
        className={`flex items-center gap-1 px-2 transition-colors cursor-pointer ${
          leftVisible
            ? "text-grid-accent -mb-px bg-grid-bg z-10"
            : "text-grid-text-muted hover:bg-grid-hover"
        }`}
        title={`${leftVisible ? "Hide" : "Show"} Browse panel  ${shortcutTooltip("[")}`}
        aria-label={`${leftVisible ? "Hide" : "Show"} Browse panel`}
        aria-pressed={leftVisible}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 4a2 2 0 012-2h14a2 2 0 012 2v16a2 2 0 01-2 2H5a2 2 0 01-2-2V4zm2 0v16h4V4H5zm6 0v16h8V4h-8z" />
        </svg>
        <span className="text-sm">Browse</span>
      </button>

      <div className="w-px bg-grid-separator shrink-0" />

      {/* Result count */}
      <span role="status" aria-live="polite" aria-atomic="true" className="px-2 flex items-center">
        {total.toLocaleString()} matches
      </span>

      {/* Sort-around-focus indicator — brief, non-blocking */}
      {sortAroundFocusStatus && (
        <span className="flex items-center text-grid-accent text-xs animate-pulse">
          {sortAroundFocusStatus}
        </span>
      )}

      {/* New images ticker */}
      {newCount > 0 && (
        <button
          onClick={() => reSearch()}
          className="bg-grid-accent hover:bg-grid-accent-hover text-white px-1.5 rounded-sm cursor-pointer text-sm leading-tight flex items-center self-center"
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

      <div className="w-px bg-grid-separator shrink-0" />

      {/* Density toggle */}
      <button
        onClick={toggleDensity}
        className="flex items-center gap-1 px-2 hover:bg-grid-hover transition-colors cursor-pointer"
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

      <div className="w-px bg-grid-separator shrink-0" />

      {/* Right panel toggle — full-height strip; extends below when active */}
      <button
        onClick={() => togglePanel("right")}
        className={`flex items-center gap-1 px-2 transition-colors cursor-pointer ${
          rightVisible
            ? "text-grid-accent -mb-px bg-grid-bg z-10"
            : "text-grid-text-muted hover:bg-grid-hover"
        }`}
        title={`${rightVisible ? "Hide" : "Show"} Details panel  ${shortcutTooltip("]")}`}
        aria-label={`${rightVisible ? "Hide" : "Show"} Details panel`}
        aria-pressed={rightVisible}
      >
        <span className="text-sm">Details</span>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 4a2 2 0 00-2-2H5a2 2 0 00-2 2v16a2 2 0 002 2h14a2 2 0 002-2V4zm-2 0v16h-4V4h4zm-6 0v16H5V4h8z" />
        </svg>
      </button>
    </div>
  );
}


