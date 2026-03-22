/**
 * Results bar — thin strip between the search toolbar and the table.
 *
 * Shows:
 *   - Total result count
 *   - New images ticker (polls ES every 10s; click to refresh)
 *   - Response time (right-aligned)
 *
 * Styled to match Grid's `results-toolbar`:
 *   - 28px height, dark background, border bottom
 *   - Ticker: accent-blue filled rectangle with white text
 */

import { useSearchStore } from "@/stores/search-store";
import { formatDistanceToNow } from "date-fns";

export function StatusBar() {
  const { total, took, newCount, newCountSince, search: reSearch } =
    useSearchStore();

  return (
    <div className="flex items-center gap-2 px-3 h-7 bg-grid-panel border-b border-grid-separator text-xs text-grid-text-muted shrink-0 select-none">
      {/* Result count */}
      <span role="status" aria-live="polite" aria-atomic="true">
        {total.toLocaleString()} matches
      </span>

      {/* New images ticker */}
      {newCount > 0 && (
        <button
          onClick={() => reSearch()}
          className="bg-grid-accent hover:bg-grid-accent-hover text-white px-1.5 py-px rounded-sm cursor-pointer text-xs leading-tight"
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

      {/* Response time */}
      {took > 0 && (
        <span className="text-grid-text">{took}ms</span>
      )}
    </div>
  );
}


