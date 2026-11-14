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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useBrowsingContext, useBrowsingSearch } from "@/lib/browsing-context";
import { qualifyBrowsingSnapshot, restoreBrowsingDensity } from "@/lib/browsing-navigation";
import { useSearchStore } from "@/stores/search-store";
import type { SearchParams } from "@/dal";
import { getViewportAnchorId } from "@/hooks/useDataWindow";
import {
  applySearchContextTransitions,
  canonicalizeSearchParams,
  searchParamsSchema,
  URL_PARAM_KEYS,
  URL_DISPLAY_KEYS,
  type UrlSearchParams,
} from "@/lib/search-params-schema";
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
import { getCurrentKupuaKey, getDetailOriginKupuaKey } from "@/lib/orchestration/history-key";
import { restoreArrivalState, snapshotStore } from "@/lib/history-snapshot";
import { buildHistorySnapshot } from "@/lib/build-history-snapshot";
import { buildSearchKey } from "@/lib/image-offset-cache";
import { captureSearchContinuity, historySearchContinuity, takeSearchContinuity, type SearchContinuity } from "@/lib/search-continuity";
import { DEFAULT_SEARCH } from "@/lib/home-defaults";
import { SELECTIONS_PERSIST_ACROSS_NAVIGATION } from "@/constants/tuning";
import { useSelectionStore } from "@/stores/selection-store";
import { claimTraceInteraction, consumeTraceInteraction } from "@/lib/perceived-trace";
import { traceActionsForNavigation } from "@/lib/orchestration/perceived-navigation";

// Track the kupuaKey of the entry we're currently "on". Updated at the
// end of every effect run. On popstate, history.state already reflects
// the DESTINATION — _lastKupuaKey still holds the SOURCE (the entry
// we're leaving) so we can capture a snapshot for it.
// Starts undefined — intentional: on the first effect run there is no
// predecessor to capture a departure snapshot for.
let _lastKupuaKey: string | undefined;
let _lastImage: string | undefined;
let _lastDetailOriginKey: string | undefined;
let _lastCropOriginKey: string | undefined;

// ---------------------------------------------------------------------------
// Collection auto-sort — atomically adjust sort when a `collection:` chip
// appears or disappears from the query. Handled inside useUpdateSearchParams
// so the sort change is part of the same navigate() call as the query change,
// producing a single URL update → single search() call. See deviations.md §20.
// ---------------------------------------------------------------------------
let _searchContextMemory: import("@/lib/search-params-schema").SearchContextMemory = {};

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
 * Mount once in the active route's first child, before list/detail effects.
 */


export function useUrlSearchSync() {
  const routeSearch = useBrowsingSearch();
  const { path, imageScope } = useBrowsingContext();
  // Router matches retain extra keys. Preserve known-key order for existing navigation dedup.
  const searchParams = useMemo(() => Object.fromEntries(
    Object.entries(routeSearch).filter(([key]) => Object.hasOwn(searchParamsSchema.shape, key))
  ) as UrlSearchParams, [routeSearch]);
  const location = useRouterState({ select: (state) => state.location });
  const router = useRouter();
  const { setParams, search } = useSearchStore();
  const navigate = useNavigate();
  const defaultsResolution = useRef<"unresolved" | "pending" | "resolved">("unresolved");
  const unmountedRef = useRef(false);
  const pendingPopKey = useRef<string | undefined>(undefined);
  const [observedEntryKey, setObservedEntryKey] = useState<string | undefined>(undefined);

  // Guard: mark as unmounted so the effect body (which React may still call
  // during the commit phase of a route transition) doesn't trigger navigations
  // or searches after the search page has been left.
  useEffect(() => {
    unmountedRef.current = false;
    const unsubscribe = router.history.subscribe(({ location, action }) => {
      const key = (location.state as { kupuaKey?: string }).kupuaKey;
      pendingPopKey.current = action.type === "BACK" || action.type === "FORWARD" || action.type === "GO" ? key : undefined;
      setObservedEntryKey(key);
    });
    return () => {
      unmountedRef.current = true;
      unsubscribe();
    };
  }, [router]);

  // When URL search params change → push to store and search
  useEffect(() => {
    if (unmountedRef.current) return;
    const observedParams = searchParamsSchema.parse(location.search);
    if (buildSearchKey(observedParams) !== buildSearchKey(searchParams) || observedParams.image !== searchParams.image) return;

    // On first mount, if the URL has no search params at all, apply defaults
    // (e.g. nonFree=true).  This is a one-time redirect — once any interaction
    // has happened, we never re-inject defaults.
    if (path === "/search" && defaultsResolution.current !== "resolved") {
      const hasAnyParam = Object.values(searchParams).some(
        (v) => v !== undefined && v !== ""
      );
      if (!hasAnyParam && defaultsResolution.current === "pending") return;
      const defaults = cleanParams(canonicalizeSearchParams(DEFAULT_SEARCH));
      if (!hasAnyParam && Object.keys(defaults).length > 0) {
        defaultsResolution.current = "pending";
        // Raw navigate — not pushNavigate(). Default-injection uses
        // replace: true (invisible URL normalisation, not a push), so the
        // user-initiated flag is moot. If this ever becomes a push, it
        // must switch to pushNavigate().
        navigate({
          to: path,
          search: defaults,
          replace: true,
          state: withCurrentKupuaKey(),
        });
        return; // navigate will re-trigger this effect with the new URL
      }
      defaultsResolution.current = "resolved";
    }

    const canonicalParams = canonicalizeSearchParams(searchParams);
    const needsCanonicalReplace = URL_PARAM_KEYS.some(
      (key) => canonicalParams[key] !== searchParams[key],
    );
    if (needsCanonicalReplace) {
      navigate({
        to: path,
        search: { ...cleanParams(canonicalParams), ...(path === "/upload" ? { batch: routeSearch.batch } : {}) },
        replace: true,
        state: withCurrentKupuaKey(),
      });
      return;
    }

    // Serialize to compare — avoids infinite loops from object identity changes.
    // Strip display-only keys (e.g. image) — they live in the URL but don't
    // affect ES queries. Changing only a display key should NOT trigger a search.
    const searchOnly: Record<string, unknown> & SearchParams = { ...Object.fromEntries(
      Object.entries(searchParams).filter(
        ([k]) => !URL_DISPLAY_KEYS.has(k as keyof UrlSearchParams)
      )
    ), ...(imageScope ? { nonFree: "true", imageScope } : {}) };
    const previousScope = useSearchStore.getState().params.imageScope;
    const contextChanged = previousScope?.key !== imageScope?.key;
    const membershipChanged = !contextChanged && previousScope?.revision !== imageScope?.revision;
    if (contextChanged) restoreBrowsingDensity(path);
    const serialized = JSON.stringify(searchOnly);
    const sameQuery = serialized === _prevParamsSerialized;
    const currentKey = getCurrentKupuaKey();
    // Origin/detail transitions keep the native list. Other history entries
    // own their represented restoration, even with identical query params.
    const detailOriginKey = searchParams.image ? getDetailOriginKupuaKey() : _lastDetailOriginKey;
    const cropOriginKey = history.state?._cropOriginKupuaKey as string | undefined;
    const nativeCropTransition = !!searchParams.image && searchParams.image === _lastImage
      && ((!!cropOriginKey && cropOriginKey === _lastKupuaKey)
        || (!!_lastCropOriginKey && _lastCropOriginKey === currentKey));
    const nativeDetailTransition = nativeCropTransition || (searchParams.image
      ? !detailOriginKey || detailOriginKey === _lastKupuaKey
      : !!_lastImage && (!detailOriginKey || detailOriginKey === currentKey));
    const sameQueryHistoryDestination = sameQuery && currentKey !== _lastKupuaKey
      && currentKey !== undefined && pendingPopKey.current === currentKey
      && !nativeDetailTransition;
    pendingPopKey.current = undefined;
    if (sameQuery && !sameQueryHistoryDestination) {
      // Consume the user-initiated flag even on dedup bail to prevent it
      // leaking into a future effect run. Display-only navigations (image
      // detail open/close) trigger pushNavigate → markUser
      // InitiatedNavigation, but the effect deduplicates them. Without
      // this, the stale flag is consumed by the NEXT real param change
      // (e.g. browser Back), making it look user-initiated when it's not.
      consumeUserInitiatedFlag();
      _lastKupuaKey = currentKey;
      _lastImage = searchParams.image;
      _lastDetailOriginKey = searchParams.image ? getDetailOriginKupuaKey() : undefined;
      _lastCropOriginKey = cropOriginKey;
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
    const isPopstate = contextChanged || !isUserInitiated;

    // Detect sort-only change: orderBy changed, nothing else did.
    // Used below to decide relaxation behaviour for phantom focus.
    const prev = _prevSearchOnly;
    const isSortOnly =
      _prevParamsSerialized !== "" && // not the first search
      searchOnly.orderBy !== prev.orderBy &&
      Object.keys({ ...prev, ...searchOnly }).every(
        (k) => k === "orderBy" || searchOnly[k] === prev[k]
      );
    const changedSearchKeys = Object.keys({ ...prev, ...searchOnly }).filter(
      (key) => searchOnly[key] !== prev[key],
    );
    const traceActions = traceActionsForNavigation(
      isUserInitiated,
      isSortOnly,
      changedSearchKeys,
    );
    const traceClaim = traceActions.length > 0
      ? claimTraceInteraction(traceActions)
      : undefined;
    const traceAction = traceClaim?.action ?? (
      isUserInitiated && changedSearchKeys.length === 1 && changedSearchKeys[0] === "nonFree"
        ? "filter-toggle"
        : undefined
    );
    const traceInteractionId = traceClaim?.interactionId
      ?? (traceAction ? consumeTraceInteraction(traceAction) : undefined);

    // S6 — Clear selection on navigation (unless the user has opted into
    // persistent selections via SELECTIONS_PERSIST_ACROSS_NAVIGATION).
    // isUrlNavigation = true when this is NOT the first search AND NOT
    // a sort-only change.  Both user-initiated and popstate (back/forward)
    // navigate through this code path, so a single check covers both.
    // User sort-only and native detail-origin changes are excluded;
    // density never changes the URL. Other history destinations restore.
    if (!SELECTIONS_PERSIST_ACROSS_NAVIGATION && !contextChanged && !imageScope) {
      const isUrlNavigation = _prevParamsSerialized !== "" && !isSortOnly;
      if (isUrlNavigation) {
        useSelectionStore.getState().clear();
      }
    }

    // User changes consume pre-passive view capture. History derives its
    // target, placement, focus and fallback only from the destination.
    let arrivalState: ReturnType<typeof restoreArrivalState> = {};
    let continuity: SearchContinuity;

    if (membershipChanged) {
      continuity = captureSearchContinuity(false);
    } else if (isPopstate) {
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
      if (_lastKupuaKey && !contextChanged) {
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
      const snapshot = qualifyBrowsingSnapshot(kupuaKey ? snapshotStore.get(kupuaKey) : undefined, searchOnly);
      continuity = historySearchContinuity(snapshot, searchOnly);
      if (!searchOnly.aiQuery && !imageScope) {
        const current = useSearchStore.getState();
        arrivalState = restoreArrivalState(snapshot, buildSearchKey(searchOnly), {
          searchKey: buildSearchKey(current.params),
          newCountSince: current.newCountSince,
          newCount: current.newCount,
        });
      }
    } else {
      continuity = takeSearchContinuity(searchParams, isSortOnly);
    }

    setPrevParamsSerialized(serialized);
    setPrevSearchOnly({ ...searchOnly });
    _lastKupuaKey = getCurrentKupuaKey();
    _lastImage = searchParams.image;
    _lastDetailOriginKey = searchParams.image ? getDetailOriginKupuaKey() : undefined;
    _lastCropOriginKey = cropOriginKey;

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
    setParams({ ...reset, imageScope, ...searchOnly, ...(isPopstate ? { offset: 0 } : {}) });
    if (contextChanged) useSearchStore.setState({ results: [], total: 0, bufferOffset: 0,
      imagePositions: new Map(), focusedImageId: null, _focusedImageKnownOffset: null, startCursor: null, endCursor: null });

    // AI mode sort-only: re-sort the in-memory buffer client-side.
    // No ES round-trip or Bedrock call needed — all ≤200 results are already in memory.
    if ((isSortOnly || sameQueryHistoryDestination) && !!searchOnly.aiQuery) {
      useSearchStore.getState().resortAiBuffer(
        searchParams.orderBy ?? "-relevance",
        continuity,
      );
      setExternalQuery(null);
      return;
    }

    search(null, { continuity, ...arrivalState, discardOffsetHint: !!prev.aiQuery && !searchOnly.aiQuery,
      sortOnly: isSortOnly || undefined, traceAction, traceInteractionId });

    // Clear the external-query latch. cancelSearchDebounce(newQuery) sets
    // _externalQuery so the debounce callback can detect stale updates from
    // the CQL editor. Once the URL has changed and search() has fired, that
    // guard has served its purpose. Without this clear, _externalQuery stays
    // set permanently (the CqlSearchInput remount from the generation bump
    // means no matching debounce ever fires to clear it), and every future
    // debounced query from the CQL editor is silently dropped.
    setExternalQuery(null);
  }, [searchParams, routeSearch.batch, path, imageScope, location, observedEntryKey, setParams, search, navigate]);
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
  const currentParams = useBrowsingSearch();
  const { path } = useBrowsingContext();
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
      const destination = path === "/upload" && Object.hasOwn(updates, "query") ? "/search" : path;
      const transition = applySearchContextTransitions(
        destination === "/search" && path === "/upload" ? {} : paramsRef.current,
        updates,
        _searchContextMemory,
      );
      const merged = transition.params;
      _searchContextMemory = transition.memory;

      // kupuaKey: mint a fresh one on push (new history entry), re-pass
      // the current one on replace (same entry, key must survive).
      const state = isReplace ? withCurrentKupuaKey() : withFreshKupuaKey();
      navigate({
        to: destination,
        search: { ...cleanParams(searchParamsSchema.parse(merged) as Record<string, string | undefined>),
          ...(destination === "/upload" ? { batch: paramsRef.current.batch } : {}) },
        replace: isReplace,
        state,
      });
    },
    [navigate, path]
  );
}


