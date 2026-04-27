/**
 * Hook that bidirectionally syncs URL search params ↔ Zustand search store.
 *
 * URL is the source of truth:
 * - On mount / URL change → store is updated from URL, search is fired
 * - On user interaction → URL is updated, which triggers the above cycle
 *
 * Components call `navigate` (returned by this hook) instead of directly
 * calling `setParams` + `search`.
 */

import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useSearchStore } from "@/stores/search-store";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import { getViewportAnchorId, getVisibleImageIds } from "@/hooks/useDataWindow";
import { URL_PARAM_KEYS, URL_DISPLAY_KEYS, type UrlSearchParams } from "@/lib/search-params-schema";
import {
  _prevParamsSerialized,
  setPrevParamsSerialized,
  _prevSearchOnly,
  setPrevSearchOnly,
  consumeUserInitiatedFlag,
  markUserInitiatedNavigation,
  markPushSnapshot,
  setExternalQuery,
} from "@/lib/orchestration/search";
import { withFreshKupuaKey, withCurrentKupuaKey } from "@/lib/orchestration/history-key";
import { getCurrentKupuaKey } from "@/lib/orchestration/history-key";
import { snapshotStore } from "@/lib/history-snapshot";
import { buildHistorySnapshot } from "@/lib/build-history-snapshot";
import { buildSearchKey } from "@/lib/image-offset-cache";
import { saveSortFocusRatio } from "@/hooks/useScrollEffects";
import { DEFAULT_SEARCH } from "@/lib/home-defaults";

// Track the kupuaKey of the entry we're currently "on". Updated at the
// end of every effect run. On popstate, history.state already reflects
// the DESTINATION — _lastKupuaKey still holds the SOURCE (the entry
// we're leaving) so we can capture a snapshot for it.
// Starts undefined — intentional: on the first effect run there is no
// predecessor to capture a departure snapshot for.
let _lastKupuaKey: string | undefined;

// Re-export so existing consumers don't need to change their imports yet.
// New code should import directly from "@/lib/home-defaults".
export { DEFAULT_SEARCH };

/**
 * Strips undefined values from search params so they don't appear in the URL
 * as `?query=&since=` etc.
 */
function cleanParams(
  params: Record<string, string | undefined>
): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Syncs URL search params → Zustand store and triggers search.
 *
 * Place this hook once, in the component that contains the search page
 * (e.g. in SearchBar or at the route component level).
 */


export function useUrlSearchSync() {
  const searchParams = useSearch({ from: "/search" });
  const { setParams, search } = useSearchStore();
  const navigate = useNavigate();
  const hasAppliedDefaults = useRef(false);
  const unmountedRef = useRef(false);

  // Guard: mark as unmounted so the effect body (which React may still call
  // during the commit phase of a route transition) doesn't trigger navigations
  // or searches after the search page has been left.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // When URL search params change → push to store and search
  useEffect(() => {
    if (unmountedRef.current) return;

    // On first mount, if the URL has no search params at all, apply defaults
    // (e.g. nonFree=true).  This is a one-time redirect — once any interaction
    // has happened, we never re-inject defaults.
    if (!hasAppliedDefaults.current) {
      hasAppliedDefaults.current = true;
      const hasAnyParam = Object.values(searchParams).some(
        (v) => v !== undefined && v !== ""
      );
      if (!hasAnyParam) {
        // Raw navigate — not pushNavigate(). Default-injection uses
        // replace: true (invisible URL normalisation, not a push), so the
        // user-initiated flag is moot. If this ever becomes a push, it
        // must switch to pushNavigate().
        navigate({
          to: "/search",
          search: cleanParams(DEFAULT_SEARCH as Record<string, string | undefined>),
          replace: true,
          state: withCurrentKupuaKey(),
        });
        return; // navigate will re-trigger this effect with the new URL
      }
    }

    // Serialize to compare — avoids infinite loops from object identity changes.
    // Strip display-only keys (e.g. image) — they live in the URL but don't
    // affect ES queries. Changing only a display key should NOT trigger a search.
    const searchOnly = Object.fromEntries(
      Object.entries(searchParams).filter(
        ([k]) => !URL_DISPLAY_KEYS.has(k as keyof UrlSearchParams)
      )
    );
    const serialized = JSON.stringify(searchOnly);
    if (serialized === _prevParamsSerialized) {
      // Consume the user-initiated flag even on dedup bail to prevent it
      // leaking into a future effect run. Display-only navigations (image
      // detail open/close, density toggle) trigger pushNavigate → markUser
      // InitiatedNavigation, but the effect deduplicates them. Without
      // this, the stale flag is consumed by the NEXT real param change
      // (e.g. browser Back), making it look user-initiated when it's not.
      consumeUserInitiatedFlag();
      return;
    }

    // Read and clear the user-initiated flag. True means this param change
    // was caused by user interaction (via useUpdateSearchParams → navigate()),
    // false means it came from somewhere else — most likely browser back/forward.
    //
    // Why mark user-initiated instead of popstate? TanStack Router's popstate
    // handler is async, so a popstate flag can be consumed by an intermediate
    // no-op effect run (the dedup guard bails early but the flag is already
    // cleared). The user-initiated flag is set synchronously right before
    // navigate(), so it's guaranteed to be present when the effect processes
    // the resulting param change.
    const isUserInitiated = consumeUserInitiatedFlag();
    const isPopstate = !isUserInitiated;

    // Detect sort-only change: orderBy changed, nothing else did.
    // Used below to decide relaxation behaviour for phantom focus.
    const prev = _prevSearchOnly;
    const isSortOnly =
      _prevParamsSerialized !== "" && // not the first search
      searchOnly.orderBy !== prev.orderBy &&
      Object.keys({ ...prev, ...searchOnly }).every(
        (k) => k === "orderBy" || searchOnly[k] === prev[k]
      );

    // Focus-preservation strategy:
    //
    // Browser back/forward (isPopstate=true): DON'T carry focus into the
    // restored search context. The user is returning to a previous search
    // and expects to see it from the top. Passing focusedImageId from the
    // CURRENT context into OLD results would place them at a random-seeming
    // position (or trigger an unnecessary ES lookup for an image that may
    // not exist in the old results).
    //
    // UNLESS we have a snapshot for this history entry — in that case,
    // pass the snapshot's anchor as sortAroundFocusId to restore near
    // where the user left this search context.
    //
    // User-initiated changes (isPopstate=false): "Never Lost" — pass
    // focusedImageId to search() so the store can find the image in the
    // new results and scroll to it.
    //
    // Phantom focus promotion: when there's no explicit focus, fall back
    // to the viewport anchor — the image nearest the viewport centre.
    // Sort-only relaxation: skip viewport anchor when only orderBy changed.
    let focusPreserveId: string | null = null;
    let phantomAnchor: string | null = null;
    let snapshotHints: { anchorCursor: import("@/dal").SortValues | null; anchorOffset: number } | undefined;
    let frozenUntil: string | undefined;

    if (isPopstate) {
      // Capture a snapshot for the entry we're LEAVING before restoring
      // the destination. The store still has the old state (setParams/
      // search haven't fired yet). This enables forward navigation to
      // restore the entry we just backed away from.
      //
      // Guard: in phantom mode, only overwrite the departing snapshot
      // when the user has scrolled to a genuinely different anchor image.
      // Same-image sub-pixel drift (restore lands 1–2px off → viewport
      // centre resolves to the same image at a slightly different ratio)
      // is harmless and must NOT update the snapshot — that would cause
      // viewportRatio to drift on every back/forward cycle. A different
      // anchor image means the user scrolled significantly; that's a
      // legitimate position change and must be captured.
      if (_lastKupuaKey) {
        const existing = snapshotStore.get(_lastKupuaKey);
        if (!existing || !existing.anchorIsPhantom) {
          const departingSnap = buildHistorySnapshot();
          snapshotStore.set(_lastKupuaKey, departingSnap);
        } else {
          // Phantom snapshot exists — update only if anchor image changed.
          const currentAnchor = getViewportAnchorId();
          if (currentAnchor && currentAnchor !== existing.anchorImageId) {
            const departingSnap = buildHistorySnapshot();
            snapshotStore.set(_lastKupuaKey, departingSnap);
          }
        }
      }

      // Snapshot-based restore on browser back/forward.
      // Look up the snapshot for the current history entry's kupuaKey.
      // suppressNextRestore is NOT checked here — it guards
      // restoreAroundCursor (the ImageDetail race), not the URL sync
      // popstate path. Logo-reset entries have no snapshot by construction
      // (freshly minted kupuaKey), so they fall through to reset-to-top.
      const kupuaKey = getCurrentKupuaKey();
      const snapshot = kupuaKey ? snapshotStore.get(kupuaKey) : undefined;
      if (snapshot && snapshot.anchorImageId) {
        const currentSearchKey = buildSearchKey(
          searchOnly as Record<string, string | undefined>,
        );
        const isStrictMatch = snapshot.searchKey === currentSearchKey;

        if (isStrictMatch) {
          if (snapshot.anchorIsPhantom) {
            // Viewport anchor — restore position without promoting to
            // explicit focus. Pass as phantom so search() positions the
            // buffer but doesn't set focusedImageId.
            phantomAnchor = snapshot.anchorImageId;
          }
          focusPreserveId = snapshot.anchorImageId;
          snapshotHints = {
            anchorCursor: snapshot.anchorCursor,
            anchorOffset: snapshot.anchorOffset,
          };
          // Inject the viewport ratio so Effect #9 restores the image
          // at the same row position, not always at the top of the viewport.
          if (snapshot.viewportRatio != null) {
            saveSortFocusRatio(snapshot.viewportRatio);
          }
          // Restore the freeze boundary so new images don't silently
          // leak into back/forward results. Use the LATER of the
          // snapshot's and the store's current newCountSince — this is
          // a monotonic ratchet: history never advances the boundary to
          // `now` (no surprise images), but also never rolls it backward
          // (if the user absorbed new images via ticker on ANY entry,
          // going back to an older entry still includes those images).
          {
            const snapshotSince = snapshot.newCountSince;
            const storeSince = useSearchStore.getState().newCountSince;
            const effective = snapshotSince && storeSince
              ? (snapshotSince > storeSince ? snapshotSince : storeSince)
              : snapshotSince ?? storeSince;
            if (effective) {
              frozenUntil = effective;
            }
          }
        }
      }
    } else {
      const explicitFocus = useSearchStore.getState().focusedImageId;
      // Sort-only relaxation: in phantom mode, sort changes reset to top
      // even if focusedImageId is set (e.g. after return-from-detail).
      // In explicit mode, focusedImageId always takes priority.
      const isExplicitMode = getEffectiveFocusMode() === "explicit";
      phantomAnchor = explicitFocus ? null : (isSortOnly ? null : getViewportAnchorId());
      focusPreserveId = (isSortOnly && !isExplicitMode) ? null : (explicitFocus ?? phantomAnchor);
    }

    setPrevParamsSerialized(serialized);
    setPrevSearchOnly({ ...searchOnly });
    _lastKupuaKey = getCurrentKupuaKey();

    // Build a full replacement for URL-managed keys: start with all undefined,
    // then overlay what's actually in the URL. This ensures that params removed
    // from the URL (e.g. clearing the query) are also cleared in the store,
    // rather than surviving via the spread in setParams.
    // Exclude display-only keys — they are not part of the search store.
    const searchKeys = URL_PARAM_KEYS.filter(
      (k) => !URL_DISPLAY_KEYS.has(k)
    );
    const reset = Object.fromEntries(
      searchKeys.map((k) => [k, undefined])
    );
    setParams({ ...reset, ...searchOnly, ...(isPopstate ? { offset: 0 } : {}) });
    const searchOptions = phantomAnchor && snapshotHints
      ? { phantomOnly: true, visibleNeighbours: getVisibleImageIds(), snapshotHints, frozenUntil, sortOnly: isSortOnly || undefined } as const
      : phantomAnchor
        ? { phantomOnly: true, visibleNeighbours: getVisibleImageIds(), frozenUntil, sortOnly: isSortOnly || undefined } as const
        : snapshotHints
          ? { snapshotHints, frozenUntil, sortOnly: isSortOnly || undefined } as const
          : frozenUntil || isSortOnly
            ? { frozenUntil, sortOnly: isSortOnly || undefined } as const
            : undefined;
    search(focusPreserveId, searchOptions);

    // Clear the external-query latch. cancelSearchDebounce(newQuery) sets
    // _externalQuery so the debounce callback can detect stale updates from
    // the CQL editor. Once the URL has changed and search() has fired, that
    // guard has served its purpose. Without this clear, _externalQuery stays
    // set permanently (the CqlSearchInput remount from the generation bump
    // means no matching debounce ever fires to clear it), and every future
    // debounced query from the CQL editor is silently dropped.
    setExternalQuery(null);
  }, [searchParams, setParams, search, navigate]);
}

/**
 * Returns a helper to update URL search params.
 *
 * Usage:
 *   const updateSearch = useUpdateSearchParams();
 *   updateSearch({ query: "cats", orderBy: "-uploadTime" });
 *
 * This replaces direct calls to `setParams` + `search` in components.
 */
export function useUpdateSearchParams() {
  const navigate = useNavigate();
  const currentParams = useSearch({ from: "/search" });
  const paramsRef = useRef(currentParams);
  paramsRef.current = currentParams;

  return useCallback(
    (updates: Partial<UrlSearchParams>, options?: { replace?: boolean }) => {
      const isReplace = options?.replace ?? false;
      // Capture snapshot for the predecessor entry BEFORE navigate fires.
      // Only on push — replaces don't create a new history entry, so the
      // predecessor's snapshot (captured on the original push) stays valid.
      if (!isReplace) {
        markPushSnapshot();
      }
      markUserInitiatedNavigation();
      const merged = { ...paramsRef.current, ...updates };
      // kupuaKey: mint a fresh one on push (new history entry), re-pass
      // the current one on replace (same entry, key must survive).
      const state = isReplace ? withCurrentKupuaKey() : withFreshKupuaKey();
      navigate({
        to: "/search",
        search: cleanParams(merged as Record<string, string | undefined>),
        replace: isReplace,
        state,
      });
    },
    [navigate]
  );
}


