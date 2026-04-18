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
import { URL_PARAM_KEYS, URL_DISPLAY_KEYS, type UrlSearchParams } from "@/lib/search-params-schema";
import {
  _prevParamsSerialized,
  setPrevParamsSerialized,
  _prevSearchOnly,
  setPrevSearchOnly,
} from "@/lib/orchestration/search";
import { DEFAULT_SEARCH } from "@/lib/home-defaults";

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
        navigate({
          to: "/search",
          search: cleanParams(DEFAULT_SEARCH as Record<string, string | undefined>),
          replace: true,
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
    if (serialized === _prevParamsSerialized) return;

    // Detect sort-only change: orderBy changed, nothing else did.
    // Used below to decide relaxation behaviour for phantom focus.
    const prev = _prevSearchOnly;
    const isSortOnly =
      _prevParamsSerialized !== "" && // not the first search
      searchOnly.orderBy !== prev.orderBy &&
      Object.keys({ ...prev, ...searchOnly }).every(
        (k) => k === "orderBy" || searchOnly[k] === prev[k]
      );

    // "Never Lost" — pass focusedImageId to search() so the store can find
    // the image in the new results and scroll to it. This applies to ALL
    // search context changes (query, filter, sort), not just sort changes.
    // The _findAndFocusImage machinery handles failure gracefully: if the
    // image isn't in the new results, focus is cleared and the view resets
    // to top. The cost of trying and failing is one extra ES lookup.
    //
    // isSortOnly is preserved for future use (Session 4: phantom focus
    // relaxation — skip viewport anchor for sort-only changes).
    const focusPreserveId =
      useSearchStore.getState().focusedImageId ?? null;

    setPrevParamsSerialized(serialized);
    setPrevSearchOnly({ ...searchOnly });

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
    setParams({ ...reset, ...searchOnly });
    search(focusPreserveId);
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
    (updates: Partial<UrlSearchParams>) => {
      const merged = { ...paramsRef.current, ...updates };
      navigate({
        to: "/search",
        search: cleanParams(merged as Record<string, string | undefined>),
        replace: true,
      });
    },
    [navigate]
  );
}


