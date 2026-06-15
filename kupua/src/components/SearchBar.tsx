import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useUrlSearchSync, useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { useSearch } from "@tanstack/react-router";
import { useSearchStore } from "@/stores/search-store";
import { SearchFilters } from "./SearchFilters";
import { CqlSearchInput } from "./CqlSearchInput";
import { AiSearchInput } from "./AiSearchInput";
import {
  _debounceTimerId,
  setDebounceTimer,
  _externalQuery,
  setExternalQuery,
  cancelSearchDebounce,
  getCqlInputGeneration,
  pushNavigateAsPopstate,
} from "@/lib/orchestration/search";
import { resetToHome } from "@/lib/reset-to-home";
import { DEFAULT_SEARCH } from "@/lib/home-defaults";
import { SettingsMenu } from "./SettingsMenu";
import { useSelectionStore } from "@/stores/selection-store";
import { trace } from "@/lib/perceived-trace";

export function SearchBar() {
  const searchParams = useSearch({ from: "/search" });
  const updateSearch = useUpdateSearchParams();
  const navigate = useNavigate();
  const took = useSearchStore((s) => s.took);
  const fetchDuration = useSearchStore((s) => s.fetchDuration);
  const seekTime = useSearchStore((s) => s.seekTime);
  const aggTook = useSearchStore((s) => s.aggTook);
  const aggLoading = useSearchStore((s) => s.aggLoading);
  const loading = useSearchStore((s) => s.loading);
  const isReconciling = useSelectionStore((s) => s.isReconciling);
  const isRangeWalking = useSelectionStore((s) => s.isRangeWalking);
  const rangeWalkTime = useSelectionStore((s) => s.rangeWalkTime);
  const busy = loading || aggLoading || isReconciling || isRangeWalking;

  // Delay-before-show: dot only appears if busy persists for 150ms+.
  // Prevents imperceptible flashes for fast operations.
  const [showDot, setShowDot] = useState(false);
  const busyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (busy) {
      busyTimerRef.current = setTimeout(() => setShowDot(true), 150);
    } else {
      if (busyTimerRef.current) clearTimeout(busyTimerRef.current);
      busyTimerRef.current = null;
      setShowDot(false);
    }
    return () => { if (busyTimerRef.current) clearTimeout(busyTimerRef.current); };
  }, [busy]);

  // Track whether the CQL editor has content (for showing the clear button)
  const [hasEditorContent, setHasEditorContent] = useState(
    !!(searchParams.query)
  );

  // Sync URL → store → search (single place for the whole app)
  useUrlSearchSync();

  // Cancel any pending debounce timer when SearchBar unmounts.
  // Without this, navigating away (e.g. double-click → image detail) leaves
  // a pending setTimeout that calls updateSearch() → navigate({ to: "/search" }),
  // bouncing the user back to the search page.
  useEffect(() => {
    return () => {
      if (_debounceTimerId) {
        clearTimeout(_debounceTimerId);
        setDebounceTimer(null);
      }
    };
  }, []);

  // --- AI query lives in its own URL param (searchParams.aiQuery) ---
  const urlAiText = searchParams.aiQuery ?? null;
  const urlQuery = searchParams.query ?? "";

  const handleQueryChange = useCallback(
    (queryStr: string) => {
      // First keystroke of a new typing session: commit the current URL
      // as a history entry so the pre-edit context is reachable via back.
      if (!_debounceTimerId) {
        history.pushState(history.state, "", window.location.href);
      }

      if (_debounceTimerId) clearTimeout(_debounceTimerId);
      setDebounceTimer(setTimeout(() => {
        setDebounceTimer(null);

        // If an external update (e.g. cell click) set a different query
        // after this timer was scheduled, this debounce is stale — skip.
        if (_externalQuery !== null && queryStr !== _externalQuery) {
          return;
        }
        setExternalQuery(null);

        // Only update the URL when there's real query content.
        const meaningful = queryStr.replace(/[+\-:\s]+/g, "");
        const cqlPart = meaningful ? queryStr : "";
        updateSearch({ query: cqlPart || undefined }, { replace: true });
      }, 300));
    },
    [updateSearch]
  );

  // AI text change handler — debounced like CQL changes.
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleAiTextChange = useCallback(
    (text: string | null) => {
      // Push history entry on first edit of a session (same as CQL).
      if (!aiDebounceRef.current && !_debounceTimerId) {
        history.pushState(history.state, "", window.location.href);
      }

      if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
      aiDebounceRef.current = setTimeout(() => {
        aiDebounceRef.current = null;
        updateSearch({ aiQuery: text || undefined }, { replace: true });
      }, 600);
    },
    [updateSearch],
  );

  const handleClear = useCallback(() => {
    cancelSearchDebounce();
    if (aiDebounceRef.current) { clearTimeout(aiDebounceRef.current); aiDebounceRef.current = null; }
    setHasEditorContent(false);
    updateSearch({ query: undefined, aiQuery: undefined });
  }, [updateSearch]);

  // Show clear button only when there's CQL content (not just AI).
  // When only AI is active, the AI widget has its own ✕.
  const hasCqlContent = hasEditorContent || !!urlQuery;
  const showClear = hasCqlContent;

  return (
    <header
      role="toolbar"
      aria-label="Search and filter controls"
      className="flex items-center gap-1.5 px-3 py-1.5 bg-grid-bg border-b border-grid-separator h-11"
    >
      {/* Logo — always visible, resets state and focuses search box.
           Hit area is a square matching the full bar height (h-11 = 44px).
           -ml-3 eats the bar's px-3 so the click target sits flush left.
           Uses <a> (not <Link>) with e.preventDefault() so we can await
           search() before navigating. This prevents the table→grid flash:
           the density switch only happens after fresh page-1 data is ready. */}
      {/* href must match DEFAULT_SEARCH in src/lib/home-defaults.ts
           (static string for right-click "open in new tab") */}
      <a
        href="/search?nonFree=true"
        title="Grid — clear all filters"
        className="shrink-0 -ml-3 w-11 h-11 flex items-center justify-center hover:bg-grid-hover transition-colors"
        onClick={(e) => {
          e.preventDefault();
          trace("home-logo", "t_0");
          // pushNavigateAsPopstate — deliberately skips markUserInitiatedNavigation().
          // Logo-reset should behave like a popstate: reset to offset 0, no focus
          // carry. The flag-defaults-to-false rule gives these semantics for free.
          resetToHome(() =>
            pushNavigateAsPopstate(navigate, { to: "/search", search: DEFAULT_SEARCH }),
          );
        }}
      >
        <img src="/images/grid-logo.svg" alt="Grid" className="w-8 h-8" />
      </a>

      {/* CQL search input with chips — grows to fill available space.
           Layout mirrors kahuna: [magnifier] [query (flex-1 overflow-hidden)] [clear ✕].
           The CQL Web Component has built-in overflow-x:auto with hidden scrollbars,
           so the query area scrolls horizontally when content overflows.
           The clear button is a normal flex child (not an absolute overlay),
           so it never covers text/chips. */}
      <div role="search" className="relative flex items-center flex-1 min-w-0 max-w-2xl border border-grid-border rounded focus-within:border-grid-accent focus-within:ring-1 focus-within:ring-grid-accent bg-grid-bg">
        {/* Search icon — non-selectable, matches Grid's magnifier */}
        <svg
          className="shrink-0 w-4 h-4 ml-2 text-grid-text-muted pointer-events-none select-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <div className="flex-1 min-w-0 overflow-hidden">
          <CqlSearchInput
            key={getCqlInputGeneration()}
            value={urlQuery}
            onChange={handleQueryChange}
            onHasContentChange={setHasEditorContent}
          />
        </div>
        <AiSearchInput key={getCqlInputGeneration()} aiText={urlAiText} onAiTextChange={handleAiTextChange} />
        <button
          onClick={handleClear}
          aria-label="Clear search"
          className={`shrink-0 text-grid-text-muted hover:text-grid-text text-sm px-1.5 py-0.5 rounded hover:bg-grid-hover transition-colors ${showClear ? "" : "invisible"}`}
          title="Clear search"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>


      {/* Separator */}
      <div className="hidden sm:block w-px h-5 bg-grid-separator shrink-0" />

      {/* Filters (free-to-use, dates) — hidden on phones, visible from sm */}
      <SearchFilters />

      {/* Separator */}
      <div className="hidden sm:block w-px h-5 bg-grid-separator shrink-0" />

      {/* Sort controls — right-aligned, rendered by SearchFilters.SortControls */}
      <SearchFilters.Sort />

      {/* ES timing — far right. Hidden below lg. Always rendered to avoid layout shift. */}
      <span className="hidden lg:block text-sm text-grid-text-dim shrink-0 ml-auto tabular-nums min-w-[7ch] text-right">
        {(took != null || fetchDuration != null) && (
          <span title={
            took != null && fetchDuration != null && fetchDuration - took > 20
              ? "ES query time / total fetch duration (includes network + proxy)"
              : took != null
                ? "Elasticsearch query time (last search)"
                : "Total fetch duration (includes network, proxy + server processing)"
          }>
            {took != null
              ? `${took}ms${fetchDuration != null && fetchDuration - took > 20 ? ` / ${fetchDuration}ms` : ""}`
              : `~${fetchDuration}ms`}
          </span>
        )}
        {seekTime != null && (
          <span title="Wall-clock time of last scrubber seek (includes all ES round-trips)">
            {" / "}{seekTime < 1000 ? `${seekTime}ms` : `${(seekTime / 1000).toFixed(1)}s`}
          </span>
        )}
        {aggTook != null && (
          <span title="Elasticsearch query time (filter aggregations)">
            {" / "}{aggTook}ms
          </span>
        )}
        {rangeWalkTime != null && (
          <span title="Wall-clock time of last range-selection server walk">
            {" / "}{rangeWalkTime < 1000 ? `${rangeWalkTime}ms` : `${(rangeWalkTime / 1000).toFixed(1)}s`}
          </span>
        )}
      </span>

      {/* Busy dot — pulsates when app is working (search, seek, reconciliation).
          Always in DOM; visibility-toggled to avoid layout shift.
          150ms delay-before-show prevents flashes for fast operations. */}
      <span
        className="hidden lg:block text-grid-accent animate-pulse shrink-0 text-sm"
        style={{ visibility: showDot ? "visible" : "hidden" }}
        aria-hidden="true"
      >●</span>

      {/* Settings menu — three-dot, far right */}
      <SettingsMenu />
    </header>
  );
}

