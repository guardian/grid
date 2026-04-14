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

import { resetSearchSync, resetScrollAndFocusSearch, setPrevParamsSerialized, setPrevSearchOnly } from "@/lib/orchestration/search";
import { useSearchStore } from "@/stores/search-store";
import { clearDensityFocusRatio, suppressDensityFocusSave } from "@/hooks/useScrollEffects";
import { resetViewportAnchor } from "@/hooks/useDataWindow";
import { URL_PARAM_KEYS, URL_DISPLAY_KEYS } from "@/lib/search-params-schema";
import { DEFAULT_SEARCH } from "@/lib/home-defaults";

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
  //
  // Reset ALL URL-managed search params (not just query/offset). Without
  // this, params like orderBy survive Home — the density-switch fix below
  // restores _prevParamsSerialized to match the home URL ({nonFree:"true"}),
  // so useUrlSearchSync's dedup bails out and never clears them from the store.
  const searchKeys = URL_PARAM_KEYS.filter(
    (k) => !URL_DISPLAY_KEYS.has(k)
  );
  const fullReset = Object.fromEntries(
    searchKeys.map((k) => [k, undefined])
  );
  const store = useSearchStore.getState();
  // Apply the full reset, then overlay the home defaults (DEFAULT_SEARCH).
  // Single source of truth: if the home URL defaults change, this follows.
  store.setParams({ ...fullReset, ...DEFAULT_SEARCH, offset: 0 });
  try {
    await store.search();
  } catch {
    // If search fails, navigate anyway — graceful degradation.
    // The error state will be displayed on the home page.
  }

  // Restore the URL sync dedup state after the direct search() above.
  //
  // resetSearchSync() cleared _prevParamsSerialized to "" (step 1) so that
  // useUrlSearchSync would re-search on the next URL change. But when Home
  // is clicked from grid view, navigate() goes to ?nonFree=true — which is
  // already the current URL. The navigate is a no-op, useUrlSearchSync
  // never fires, and _prevParamsSerialized stays "". The next real URL
  // change (e.g. density switch adding ?density=table) finds a mismatch
  // and fires search(), resetting the buffer to offset 0 — destroying the
  // user's scroll position.
  //
  // Fix: after our direct search() completes, restore the dedup state to
  // match the home URL params. We use DEFAULT_SEARCH (same source of truth
  // as useUrlSearchSync), NOT store.params (which includes internal keys
  // like offset/length that never appear in the URL).
  const homeSearchOnly = Object.fromEntries(
    Object.entries(DEFAULT_SEARCH).filter(([, v]) => v !== undefined)
  ) as Record<string, string>;
  setPrevParamsSerialized(JSON.stringify(homeSearchOnly));
  setPrevSearchOnly({ ...homeSearchOnly });

  // Suppress density-focus saves during the navigate() commit phase —
  // BUT ONLY when a density switch is about to happen (Home from table).
  //
  // When search() completes, it sets bufferOffset=0 with 200 fresh results.
  // React may or may not commit this re-render before navigate() fires
  // (set() inside an async function — React may batch). If the re-render
  // DOES commit, the table renders 200 items but scrollTop is browser-clamped
  // to the shorter maxScroll (not reset to 0 — effect #8 may not have fired).
  // The table's unmount save then captures scrollTop=maxScroll, gap=0 →
  // "source was at bottom". The grid mount extremum-snaps to its own
  // maxScroll, landing the user at ~image 198 instead of the top.
  //
  // suppressDensityFocusSave() prevents the unmount save from writing.
  // The grid mount effect clears the suppress flag, restoring normal
  // density-switch behaviour for future interactions.
  //
  // When Home is clicked from GRID view (no density switch — grid stays
  // mounted), the suppress is unnecessary: there's no table unmount to
  // suppress. Worse, the grid never remounts so the flag stays permanently
  // true — breaking ALL subsequent density switches (the grid unmount save
  // is suppressed, so the table mount finds no saved state and falls back
  // to scrollToIndex which lands at the wrong position).
  if (willSwitchDensity) {
    suppressDensityFocusSave();
  }

  // Navigate AFTER data is ready. The density switch (table→grid) now
  // sees bufferOffset=0 and fresh results — no flash.
  navigate();

  // Focus the CQL search input AFTER navigation. resetScrollAndFocusSearch
  // already attempts focus, but skips it when the URL still has ?image=
  // (image detail view). By this point navigate() has removed the image
  // param, so the focus can proceed.
  requestAnimationFrame(() => {
    const cqlInput = document.querySelector("cql-input");
    if (cqlInput instanceof HTMLElement) cqlInput.focus();
  });
}

