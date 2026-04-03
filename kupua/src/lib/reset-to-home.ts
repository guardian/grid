/**
 * resetToHome — single entry point for "reset everything and go home".
 *
 * Called by logo onClick handlers in both SearchBar and ImageDetail.
 * Deduplicates the identical 5-line sequence that was in both places.
 */

import { resetSearchSync, resetScrollAndFocusSearch } from "@/lib/orchestration/search";
import { useSearchStore } from "@/stores/search-store";

/**
 * Reset all search/scroll/sync state and fire a fresh default search.
 *
 * Use this when the user clicks the Grid logo — it ensures:
 * 1. URL sync dedup is cleared (so the next render triggers a search)
 * 2. Scroll position resets to top + CQL input is focused
 * 3. Search params reset to defaults (no query, offset 0)
 * 4. A fresh search is fired immediately
 */
export function resetToHome() {
  // Force useUrlSearchSync to re-search even if params haven't
  // changed (e.g. already at ?nonFree=true). Without this, clicking
  // the logo when already at the default state would be a no-op.
  resetSearchSync();
  // resetScrollAndFocusSearch calls abortExtends() internally to
  // prevent rogue extendBackward from corrupting the buffer.
  resetScrollAndFocusSearch();
  // Explicitly fire a fresh search — the URL sync effect won't re-run
  // if the URL params are already at the default state, but the buffer
  // may be at a deep offset from a previous seek.
  const store = useSearchStore.getState();
  store.setParams({ query: undefined, offset: 0 });
  store.search();
}

