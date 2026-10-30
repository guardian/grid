/**
 * Results bar — thin strip between the search toolbar and the table/grid.
 *
 * Shows:
 *   - Left-panel toggle button (left edge)
 *   - Total result count
 *   - New images ticker (polls ES every 10s; click to refresh)
 *   - Right-panel toggle button + independent density controls (right edge)
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
import { beginTraceInteraction } from "@/lib/perceived-trace";
import { SELECTIONS_PERSIST_ACROSS_NAVIGATION } from "@/constants/tuning";
import { displayTickers } from "@/lib/ticker-display";
import { upsertFieldTerm, findFieldTerm } from "@/dal/adapters/elasticsearch/cql-query-edit";
import type { TickerCountResult } from "@/dal";
import { restoreArrivalState, snapshotStore } from "@/lib/history-snapshot";
import { getCurrentKupuaKey } from "@/lib/orchestration/history-key";
import { buildSearchKey } from "@/lib/image-offset-cache";

/**
 * Builds the native title tooltip for a ticker badge.
 * Mirrors Kahuna's gr-tooltip-html content:
 *   "last updated X ago" + blank line + count  SupplierName rows.
 */
function buildTickerTooltip(
  ticker: TickerCountResult,
  lastUpdated: string | null,
): string {
  const lines: string[] = [];
  if (lastUpdated) {
    lines.push(`last updated ${formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}`);
  }
  if (ticker.subCounts) {
    const entries = Object.entries(ticker.subCounts)
      .filter(([, c]) => c > 0)
      .sort(([, a], [, b]) => b - a);
    if (entries.length > 0) {
      lines.push("");
      for (const [name, count] of entries) {
        lines.push(`${count.toLocaleString()}  ${name}`);
      }
    }
  }
  return lines.join("\n");
}

const SB_TOTAL_KEY = "kupua-sb-total";

export function StatusBar() {
  const total = useSearchStore((s) => s.total);
  const aiPoolTotal = useSearchStore((s) => s.aiPoolTotal);
  const newCount = useSearchStore((s) => s.newCount);
  const tickerCounts = useSearchStore((s) => s.tickerCounts);
  const tickersLastUpdated = useSearchStore((s) => s.tickersLastUpdated);
  const selectedCount = useSelectionStore((s) => s.selectedIds.size);
  const clearSelection = useSelectionStore((s) => s.clear);
  const isCoarsePointer = useUiPrefsStore((s) => s._pointerCoarse);

  // _isInitialLoad is true from store init until the first search completes.
  // It's the correct "has a search ever settled?" signal — unlike `total > 0`,
  // it distinguishes "app just loaded, no results yet" from "search returned 0".
  const isInitialLoad = useSearchStore((s) => s._isInitialLoad);
  const searchParams = useSearch({ from: "/search" });
  const storeSince = useSearchStore((s) => s.newCountSince);

  const [cached] = useState(() => {
    const key = getCurrentKupuaKey();
    return {
      total: parseInt(sessionStorage.getItem(SB_TOTAL_KEY) ?? "0", 10) || 0,
      searchKey: buildSearchKey(searchParams),
      ...(!searchParams.aiQuery && key
        ? restoreArrivalState(snapshotStore.get(key), buildSearchKey(searchParams)) : {}),
    };
  });
  useEffect(() => { if (total > 0) sessionStorage.setItem(SB_TOTAL_KEY, String(total)); }, [total]);

  // storeReady = first search has completed. Use cached sessionStorage values
  // only during the brief loading window before the first response arrives.
  const storeReady = !isInitialLoad;
  const displayTotal = storeReady ? total : cached.total;
  const useSavedArrivals = isInitialLoad && !storeSince && cached.searchKey === buildSearchKey(searchParams);
  const displayNewCount = useSavedArrivals ? cached.frozenNewCount ?? newCount : newCount;
  // AI results show the pool they were ranked from; never paired with a cached total.
  const displayPool = storeReady && total > 0 ? aiPoolTotal : null;
  const newCountSince = storeSince ?? (useSavedArrivals ? cached.frozenUntil : null);
  const reSearch = useSearchStore((s) => s.search);
  const updateSearch = useUpdateSearchParams();
  const density = useUiPrefsStore((state) => state.density);
  const setDensity = useUiPrefsStore((state) => state.setDensity);
  const currentQuery = searchParams.query ?? "";

  const leftVisible = usePanelStore((s) => s.config.left.visible);
  const rightVisible = usePanelStore((s) => s.config.right.visible);
  const togglePanel = usePanelStore((s) => s.togglePanel);
  const filtersExpanded = usePanelStore((s) => s.isSectionOpen("left-filters"));
  const fetchAggregations = useSearchStore((s) => s.fetchAggregations);

  const selectDensity = (choice: "grid" | "table" | "justified") => {
    const next = choice === density ? "grid" : choice;
    if (next === density) return;
    beginTraceInteraction("density-swap", { from: density });
    setDensity(next);
  };

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

      {/* Only the summary scrolls horizontally; layout/panel controls stay reachable. */}
      <div className="min-w-0 flex-1 flex items-center overflow-x-auto hide-scrollbar" data-testid="result-summary">
      {/* Result count — seeded from sessionStorage across reload.
           Show when settled (storeReady) even if 0; show cached during loading
           only if > 0 (avoids blank-then-number flash on first load). */}
      {(storeReady || displayTotal > 0) && (
        <span role="status" aria-live="polite" aria-atomic="true" className="px-2 flex items-center whitespace-nowrap select-text shrink-0">
          {displayPool !== null && "Best "}
          {displayTotal.toLocaleString()}
          {displayPool !== null && ` of ${displayPool.toLocaleString()}`}
          <span className="hidden @[500px]:inline">&nbsp;matches</span>
        </span>
      )}

      {/* Ticker group — all tickers in one flex row so gap-[5px] spaces them
          uniformly and mr-[5px] adds trailing space before the spacer.
          empty:hidden collapses the wrapper entirely when no tickers render,
          so no phantom margin appears when the count is zero. */}
      <div className="flex items-center gap-[5px] mr-[5px] shrink-0 empty:hidden">

        {/* New images ticker — seeded from sessionStorage across reload */}
        {displayNewCount > 0 && (
          <button
            onClick={() => {
              resetScrollAndFocusSearch({ skipEagerScroll: true });
              // S6: clear selection before reSearch so the multi-panel doesn't
              // briefly flash old reconciled state against the new results.
              if (!SELECTIONS_PERSIST_ACROSS_NAVIGATION) {
                clearSelection();
              }
              reSearch();
            }}
            className="bg-grid-accent hover:bg-grid-accent-hover text-white px-1.5 rounded-sm cursor-pointer text-sm leading-tight flex items-center shrink-0 whitespace-nowrap"
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

        {/* Category ticker badges — non-zero, non-total counts in displayTickers order.
            Click applies the corresponding is: filter.
            Mirrors Kahuna's ng-repeat tickerCounts badges in results.html. */}
        {displayTickers(tickerCounts).map((ticker) => {
          if (ticker.value === 0 || ticker.value === (aiPoolTotal ?? total)) return null;
          const isValue = ticker.isValue;
          const isActive = !!findFieldTerm(currentQuery, "is", isValue);

          return (
            <button
              key={ticker.name}
              onClick={() => {
                const newQuery = upsertFieldTerm(currentQuery, "is", isValue, false);
                updateSearch({ query: newQuery || undefined });
              }}
              className={`px-1.5 rounded-sm cursor-pointer text-sm leading-tight flex items-center shrink-0 whitespace-nowrap transition-opacity ${isActive ? "opacity-60" : "hover:opacity-90"}`}
              style={{ backgroundColor: ticker.backgroundColour, color: "white" }}
              title={buildTickerTooltip(ticker, tickersLastUpdated)}
              aria-pressed={isActive}
            >
              {ticker.value.toLocaleString()} {ticker.name}
            </button>
          );
        })}

      </div>

      </div>

      {/* Selection count + clear -- desktop (fine pointer) only.
           On coarse pointer (mobile) the SelectionFab handles this. */}
      {selectedCount > 0 && !isCoarsePointer && (
        <>
          <div className="w-px bg-grid-separator shrink-0" />
          <span role="status" aria-label={`${selectedCount.toLocaleString()} selected`} aria-live="polite" aria-atomic="true" className="flex items-center px-2 text-grid-accent text-sm whitespace-nowrap shrink-0">
            {selectedCount.toLocaleString()}<span className="hidden @[600px]:inline">&nbsp;selected</span>
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
            <span className="hidden @[600px]:inline">Clear selection</span>
          </button>
        </>
      )}

      <div className="w-px bg-grid-separator shrink-0" />

      <div role="group" aria-label="Image layout" className="flex shrink-0">
        {(["table", "grid", "justified"] as const).map((mode) => {
          const label = `${mode[0].toUpperCase()}${mode.slice(1)} view`;
          return <button
            key={mode}
            type="button"
            onClick={() => selectDensity(mode)}
            className={`w-8 shrink-0 flex items-center justify-center hover:bg-grid-hover transition-colors cursor-pointer ${density === mode ? "text-grid-accent" : "text-grid-text-muted"}`}
            title={density === mode && mode !== "grid" ? `${label} — click again for grid` : label}
            aria-label={label}
            aria-pressed={density === mode}
          >
            {/* Match the 14px painted bounds; Material's viewBox includes more padding. */}
            <svg className={mode === "justified" ? "w-[18.6667px] h-[18.6667px]" : "w-4 h-4"} viewBox={mode === "justified" ? "0 -960 960 960" : "0 0 16 16"} fill="currentColor" aria-hidden="true">
              {mode === "table" ? <>
                <rect x="1" y="1" width="14" height="3" rx="0.5" />
                <rect x="1" y="6.5" width="14" height="3" rx="0.5" />
                <rect x="1" y="12" width="14" height="3" rx="0.5" />
              </> : mode === "grid" ? <>
                <rect x="1" y="1" width="6" height="6" rx="0.5" />
                <rect x="9" y="1" width="6" height="6" rx="0.5" />
                <rect x="1" y="9" width="6" height="6" rx="0.5" />
                <rect x="9" y="9" width="6" height="6" rx="0.5" />
              </> : <path d="M520-600v-240h320v240H520ZM120-440v-400h320v400H120Zm400 320v-400h320v400H520Zm-400 0v-240h320v240H120Z" />}
            </svg>
          </button>;
        })}
      </div>

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


