/**
 * resetToHome — single entry point for "reset everything and go home".
 *
 * Called by logo onClick handlers in both SearchBar and ImageDetail.
 * Deduplicates the identical sequence that was in both places.
 *
 * **Async by design.** The caller must `await` this function and only
 * navigate (change the URL) AFTER it resolves. This prevents the
 * "flash of wrong content" when the density switches from table→grid:
 * if the URL changed synchronously (dropping `density=table`), the grid
 * would mount with stale deep-offset data for ~100ms before search()
 * completed. By awaiting search() first, the buffer already contains
 * fresh page-1 data when the density switch happens.
 *
 * The caller passes a `navigate` callback (from `useNavigate()`) that
 * fires AFTER the data is ready. The `<Link>` was replaced with an
 * `<a>` + `e.preventDefault()` so the browser doesn't navigate eagerly.
 */

import { resetSearchSync, resetScrollAndFocusSearch } from "@/lib/orchestration/search";
import { useSearchStore } from "@/stores/search-store";
import { clearDensityFocusRatio } from "@/hooks/useScrollEffects";
import { resetViewportAnchor } from "@/hooks/useDataWindow";

/**
 * Reset all search/scroll/sync state, await fresh first-page data,
 * then navigate to home.
 *
 * Steps:
 * 1. URL sync dedup is cleared (so the next render triggers a search)
 * 2. Focus is cleared (no density-focus save/restore during density switch)
 * 3. Scroll position resets to top + CQL input is focused
 * 4. Search params reset to defaults (no query, offset 0)
 * 5. `search()` is awaited — buffer gets fresh page-1 data
 * 6. Caller navigates to /search?nonFree=true (density switch now safe)
 *
 * @param navigate — callback that performs the URL navigation. Called
 *   AFTER search() resolves so the density switch (table→grid) sees
 *   correct data. If search() throws, navigation still fires (graceful
 *   degradation — the user gets to the home state, possibly with an error).
 */
export async function resetToHome(navigate: () => void) {
  // Force useUrlSearchSync to re-search even if params haven't
  // changed (e.g. already at ?nonFree=true). Without this, clicking
  // the logo when already at the default state would be a no-op.
  resetSearchSync();

  // Clear focus BEFORE the density switch — the table unmount saves the
  // focused image's viewport ratio, and the grid mount restores it —
  // scrolling the grid to the old focused position instead of the top.
  // Clearing focusedImageId makes the unmount save a no-op (no focused
  // image → nothing to save), and clearing the density-focus state
  // prevents stale restores from any prior save. Also clear the viewport
  // anchor so the unmount doesn't fall back to a stale anchor.
  useSearchStore.getState().setFocusedImageId(null);
  clearDensityFocusRatio();
  resetViewportAnchor();

  // resetScrollAndFocusSearch calls abortExtends() internally to
  // prevent rogue extendBackward from corrupting the buffer.
  //
  // skipEagerScroll: when a density switch is about to happen (table→grid),
  // the current scroll container will be unmounted by navigate(). Resetting
  // its scrollTop eagerly creates a visible flash (table jumps to top for
  // ~100ms before the grid replaces it). The grid mounts at scrollTop=0
  // naturally, so no eager reset is needed.
  //
  // When already in grid view (no density switch), the scroll container
  // SURVIVES the navigation — the eager reset IS needed to scroll to top.
  const willSwitchDensity = new URL(window.location.href).searchParams.get("density") === "table";
  resetScrollAndFocusSearch({ skipEagerScroll: willSwitchDensity });

  // Set params and fire the search. We AWAIT completion so the buffer
  // has fresh page-1 data (bufferOffset=0) before the caller navigates.
  // This is the key to eliminating the table→grid flash: the grid mounts
  // with correct data instead of stale deep-offset content.
  const store = useSearchStore.getState();
  store.setParams({ query: undefined, offset: 0 });
  try {
    await store.search();
  } catch {
    // If search fails, navigate anyway — graceful degradation.
    // The error state will be displayed on the home page.
  }

  // Navigate AFTER data is ready. The density switch (table→grid) now
  // sees bufferOffset=0 and fresh results — no flash.
  navigate();
}

