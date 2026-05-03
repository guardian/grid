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
import { useSelectionStore } from "@/stores/selection-store";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { shortcutTooltip } from "@/lib/keyboard-shortcuts";
import { resetScrollAndFocusSearch } from "@/lib/orchestration/search";
import { trace } from "@/lib/perceived-trace";
import { SELECTIONS_PERSIST_ACROSS_NAVIGATION } from "@/constants/tuning";

const SB_TOTAL_KEY = "kupua-sb-total";
const SB_NEW_KEY = "kupua-sb-new";

export function StatusBar() {
  const total = useSearchStore((s) => s.total);
  const newCount = useSearchStore((s) => s.newCount);
  const selectedCount = useSelectionStore((s) => s.selectedIds.size);
  const clearSelection = useSelectionStore((s) => s.clear);
  const isCoarsePointer = useUiPrefsStore((s) => s._pointerCoarse);

  // _isInitialLoad is true from store init until the first search completes.
  // It's the correct "has a search ever settled?" signal — unlike `total > 0`,
  // it distinguishes "app just loaded, no results yet" from "search returned 0".
  const isInitialLoad = useSearchStore((s) => s._isInitialLoad);

  // Seed display from sessionStorage so counters survive a tab reload.
  // Once the first search completes (!isInitialLoad), store values are
  // authoritative and the cache is just kept in sync for next reload.
  const [cached] = useState(() => ({
    total: parseInt(sessionStorage.getItem(SB_TOTAL_KEY) ?? "0", 10) || 0,
    newCount: parseInt(sessionStorage.getItem(SB_NEW_KEY) ?? "0", 10) || 0,
  }));
  useEffect(() => { if (total > 0) sessionStorage.setItem(SB_TOTAL_KEY, String(total)); }, [total]);
  // Gate ticker write on !isInitialLoad — on mount newCount=0 in the fresh
  // store; writing it unconditionally would wipe the cached value before the
  // poll has a chance to restore it.
  useEffect(() => { if (!isInitialLoad) sessionStorage.setItem(SB_NEW_KEY, String(newCount)); }, [newCount, isInitialLoad]);

  // storeReady = first search has completed. Use cached sessionStorage values
  // only during the brief loading window before the first response arrives.
  const storeReady = !isInitialLoad;
  const displayTotal = storeReady ? total : cached.total;
  const displayNewCount = storeReady ? newCount : cached.newCount;
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
    trace("density-swap", "t_0", { from: isGrid ? "grid" : "table" });
    // Deliberate push (not replace). Density is a useful view per the
    // guiding philosophy: back after a density toggle re-toggles density
    // without re-search (display-only-key dedup guard bails).
    updateSearch({ density: isGrid ? "table" : undefined });
    // t_settled = browser is idle after the density change.
    //
    // The previous rAF approach fired ~16ms after the click — well before
    // the URL→router→store→ImageGrid/Table swap → virtualizer rebuild
    // had finished, so dt_settled_ms was uninformatively constant.
    //
    // requestIdleCallback fires when the main thread has no pending work,
    // which is the closest thing to "user perceives the swap as done"
    // that this component can observe without coordination from the
    // newly-mounted ImageGrid/ImageTable. Chrome-only — fall back to a
    // longer setTimeout (200ms ≈ typical density-swap budget) elsewhere.
    const emitSettled = () => trace("density-swap", "t_settled");
    if (typeof (window as any).requestIdleCallback === "function") {
      (window as any).requestIdleCallback(emitSettled, { timeout: 1500 });
    } else {
      setTimeout(emitSettled, 200);
    }
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
    <div
      className="@container flex items-stretch gap-0 h-7 bg-grid-bg border-b border-grid-separator text-sm text-grid-text-muted shrink-0 select-none relative"
      data-coarse-pointer={isCoarsePointer ? "true" : undefined}
      data-selection-mode={selectedCount > 0 ? "true" : undefined}
    >
      {/* Left panel toggle — full-height strip; when active, extends below
          the border to visually merge with the panel beneath */}
      <button
        onClick={() => togglePanel("left")}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={handleBrowseHover}
        className={`shrink-0 flex items-center gap-1 px-2 transition-colors cursor-pointer whitespace-nowrap relative ${
          leftVisible
            ? "text-grid-accent bg-grid-bg z-10 after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-[-1px] after:h-px after:bg-grid-bg"
            : "text-grid-text-muted hover:bg-grid-hover"
        }`}
        title={`${leftVisible ? "Hide" : "Show"} Browse panel  ${shortcutTooltip("[")}`}
        aria-label={`${leftVisible ? "Hide" : "Show"} Browse panel`}
        aria-pressed={leftVisible}
      >
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 4a2 2 0 012-2h14a2 2 0 012 2v16a2 2 0 01-2 2H5a2 2 0 01-2-2V4zm2 0v16h4V4H5zm6 0v16h8V4h-8z" />
        </svg>
        <span className="text-sm hidden @[600px]:inline">Browse</span>
      </button>

      <div className="w-px bg-grid-separator shrink-0" />

      {/* Result count — seeded from sessionStorage across reload.
           Show when settled (storeReady) even if 0; show cached during loading
           only if > 0 (avoids blank-then-number flash on first load). */}
      {(storeReady || displayTotal > 0) && (
        <span role="status" aria-live="polite" aria-atomic="true" className="px-2 flex items-center whitespace-nowrap select-text">
          {displayTotal.toLocaleString()}<span className="hidden @[500px]:inline">&nbsp;matches</span>
        </span>
      )}

      {/* New images ticker — seeded from sessionStorage across reload */}
      {displayNewCount > 0 && (
        <button
          onClick={() => {
            resetScrollAndFocusSearch();
            // S6: clear selection before reSearch so the multi-panel doesn't
            // briefly flash old reconciled state against the new results.
            if (!SELECTIONS_PERSIST_ACROSS_NAVIGATION) {
              clearSelection();
            }
            reSearch();
          }}
          className="bg-grid-accent hover:bg-grid-accent-hover text-white px-1.5 rounded-sm cursor-pointer text-sm leading-tight flex items-center self-center shrink-0 whitespace-nowrap"
          title={`${displayNewCount.toLocaleString()} new images since ${
            newCountSince
              ? formatDistanceToNow(new Date(newCountSince), {
                  addSuffix: true,
                })
              : "last search"
          }`}
        >
          {displayNewCount.toLocaleString()} new
        </button>
      )}

      {/* Sort-around-focus indicator — brief, non-blocking */}
      {sortAroundFocusStatus && (
        <span className="flex items-center text-grid-accent text-xs animate-pulse ml-1">
          {sortAroundFocusStatus}
        </span>
      )}

      {/* Spacer */}
      <span className="flex-1" />

      {/* Selection count + clear -- desktop (fine pointer) only.
           On coarse pointer (mobile) the SelectionFab handles this. */}
      {selectedCount > 0 && !isCoarsePointer && (
        <>
          <div className="w-px bg-grid-separator shrink-0" />
          <span role="status" aria-live="polite" aria-atomic="true" className="flex items-center px-2 text-grid-accent text-sm whitespace-nowrap shrink-0">
            {selectedCount.toLocaleString()} selected
          </span>
          <div className="w-px bg-grid-separator shrink-0" />
          <button
            type="button"
            className="flex items-center gap-1 px-2 h-full hover:bg-grid-hover transition-colors cursor-pointer text-grid-text-muted hover:text-grid-text shrink-0 text-sm"
            onClick={clearSelection}
            title="Clear selection"
            aria-label="Clear selection"
          >
            {/* Material Icons "clear" */}
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
            <span>Clear selection</span>
          </button>
        </>
      )}

      <div className="w-px bg-grid-separator shrink-0" />

      {/* Density toggle */}
      <button
        onClick={toggleDensity}
        className="shrink-0 flex items-center gap-1 px-2 hover:bg-grid-hover transition-colors cursor-pointer"
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
        onMouseDown={(e) => e.preventDefault()}
        className={`shrink-0 flex items-center gap-1 px-2 transition-colors cursor-pointer whitespace-nowrap relative ${
          rightVisible
            ? "text-grid-accent bg-grid-bg z-10 after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-[-1px] after:h-px after:bg-grid-bg"
            : "text-grid-text-muted hover:bg-grid-hover"
        }`}
        title={`${rightVisible ? "Hide" : "Show"} Details panel  ${shortcutTooltip("]")}`}
        aria-label={`${rightVisible ? "Hide" : "Show"} Details panel`}
        aria-pressed={rightVisible}
      >
        <span className="text-sm hidden @[600px]:inline">Details</span>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 4a2 2 0 00-2-2H5a2 2 0 00-2 2v16a2 2 0 002 2h14a2 2 0 002-2V4zm-2 0v16h-4V4h4zm-6 0v16H5V4h8z" />
        </svg>
      </button>
    </div>
  );
}


