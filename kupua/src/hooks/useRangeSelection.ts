/**
 * useRangeSelection -- handles shift-click range selection for S3a.
 *
 * Orchestrates the in-buffer fast path and the server-walk path for
 * `add-range` effects produced by `interpretClick`.
 *
 * Architecture: kupua/exploration/docs/00 Architecture and philosophy/05-selections.md s5
 *
 * How it works:
 * 1. Mount once in `src/routes/search.tsx` -- returns `handleRangeEffect`.
 * 2. Pass `handleRangeEffect` to `ImageGrid` and `ImageTable` as a prop.
 * 3. Components pass it to `dispatchClickEffects` via `EffectDispatchContext`.
 *
 * In-buffer path:
 * Both anchor and target have known global indices, all items between them
 * are loaded in the buffer (no skeleton cells). Uses `resolveInBufferRange`
 * (exported as a pure function for unit testing).
 *
 * Server-walk path:
 * Any endpoint outside the buffer, or any skeleton cell between them ->
 * fall through to `dataSource.getIdRange`. The sort-earlier item is the
 * exclusive `fromCursor`; the sort-later item is the inclusive `toCursor`.
 * `targetId` is always added explicitly (it may be the sort-earlier item,
 * excluded by the exclusive lower-bound contract).
 *
 * Cancellation:
 * A pending walk owns its selection membership/anchor, query/order and busy
 * state. New intent or unmount aborts it; metadata/display changes do not.
 */

import { useCallback, useEffect, useRef } from "react";
import type { Image } from "@/types/image";
import type { SortValues } from "@/dal/types";
import { useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { buildSearchKey, extractSortValues, getRetainedSortValues } from "@/lib/image-offset-cache";
import { addToast } from "@/stores/toast-store";
import { RANGE_HARD_CAP, RANGE_SOFT_CAP } from "@/constants/tuning";
import type { AddRangeEffect } from "@/lib/dispatchClickEffects";
import { getImageAvailability, getOrderingRevision, hasOrderingUncertainty } from "@/lib/image-read-freshness";

// ---------------------------------------------------------------------------
// Pure helper -- exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Attempt to resolve a range selection entirely from the in-memory buffer.
 *
 * Returns `null` if the server walk is needed:
 * - Either endpoint is outside `[bufferOffset, bufferOffset + results.length)`.
 * - Any item between anchor and target is a skeleton cell (undefined).
 *
 * Returns the ordered array of image IDs (anchor to target, inclusive of both
 * endpoints) when the range is fully covered by loaded buffer entries.
 */
export function resolveInBufferRange(
  anchorGlobalIndex: number,
  targetGlobalIndex: number,
  bufferOffset: number,
  results: (Image | undefined)[],
): string[] | null {
  const bufferLen = results.length;
  const fromGlobal = Math.min(anchorGlobalIndex, targetGlobalIndex);
  const toGlobal = Math.max(anchorGlobalIndex, targetGlobalIndex);

  // Both endpoints must be within the loaded buffer.
  if (fromGlobal < bufferOffset || toGlobal >= bufferOffset + bufferLen) {
    return null;
  }

  const ids: string[] = [];
  for (let i = fromGlobal; i <= toGlobal; i++) {
    const img = results[i - bufferOffset];
    // Skeleton cell -- fall through to server walk so we don't silently drop items.
    if (!img?.id) return null;
    ids.push(img.id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRangeSelection() {
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelRef.current?.(), []);

  const handleRangeEffect = useCallback(
    async (effect: AddRangeEffect): Promise<void> => {
      // Cancel any previous in-flight server walk.
      cancelRef.current?.();

      // Read stores imperatively -- values may have advanced since click ctx.
      const searchState = useSearchStore.getState();
      const selStore = useSelectionStore.getState();

      const {
        anchorId,
        anchorGlobalIndex: anchorIdxFromEffect,
        anchorSortValues: anchorSVFromEffect,
        targetId,
        targetGlobalIndex,
        targetSortValues,
      } = effect;

      // Polarity: anchor-intent based.
      // After a non-shift click, toggle() has already run on the anchor.
      // If the anchor is now IN selectedIds → the click added it → user is in
      // an "adding" gesture → add range.
      // If the anchor is NOT in selectedIds → the click removed it → remove range.
      const polarity = selStore.selectedIds.has(anchorId) ? "add" : "remove";
      const unavailableIds = new Set(searchState.results.filter(image => image?.__availability).map(image => image!.id));
      const unavailable = (id: string) => getImageAvailability(id) || unavailableIds.has(id);
      if (unavailable(anchorId) || unavailable(targetId)) {
        addToast({ category: "warning", message: "A range endpoint is unavailable. Selection unchanged." });
        return;
      }
      if (effect.reanchorToTarget) {
        selStore.setAnchor(targetId);
        if (anchorId === targetId) return;
      }
      const commitRange = (ids: string[]) => {
        if (unavailable(anchorId) || unavailable(targetId)) {
          addToast({ category: "warning", message: "A range endpoint is unavailable. Selection unchanged." });
          return;
        }
        const eligible = ids.filter(id => !unavailable(id));
        const unavailableCount = new Set(ids.filter(id => unavailable(id))).size;
        if (unavailableCount) addToast({ category: "information", message: `${unavailableCount} unavailable ${unavailableCount === 1 ? "image" : "images"} skipped. Existing selection retained for those images.` });
        if (polarity === "remove") selStore.remove(eligible);
        else selStore.add(eligible);
        if (effect.reanchorToTarget) selStore.setAnchor(targetId);
      };

      // ------------------------------------------------------------------
      // 1. Resolve anchor global index.
      //
      // Priority: (1) from effect (already tried imagePositions),
      //           (2) positionMap.ids.indexOf -- two-tier mode fallback.
      // ------------------------------------------------------------------
      let resolvedAnchorIdx: number | undefined =
        searchState.imagePositions.get(anchorId) ?? anchorIdxFromEffect ?? undefined;
      const resolvedTargetIdx = searchState.imagePositions.get(targetId) ?? targetGlobalIndex;

      if (resolvedAnchorIdx === undefined) {
        const pm = searchState.positionMap;
        if (pm) {
          const idx = pm.ids.indexOf(anchorId);
          if (idx >= 0) resolvedAnchorIdx = idx;
        }
      }

      // ------------------------------------------------------------------
      // 2. Try in-buffer fast path.
      // ------------------------------------------------------------------
      const hasResidentEndpoints = resolvedAnchorIdx !== undefined
        && searchState.results[resolvedAnchorIdx - searchState.bufferOffset]?.id === anchorId
        && searchState.results[resolvedTargetIdx - searchState.bufferOffset]?.id === targetId;
      const conflictsWithResident = (index: number | undefined, id: string) => index !== undefined
        && index >= searchState.bufferOffset && index < searchState.bufferOffset + searchState.results.length
        && searchState.results[index - searchState.bufferOffset]?.id !== id;
      const requiresCurrentEndpoints = hasOrderingUncertainty()
        || conflictsWithResident(resolvedAnchorIdx, anchorId) || conflictsWithResident(resolvedTargetIdx, targetId);
      if (hasResidentEndpoints && resolvedAnchorIdx !== undefined) {
        const ids = resolveInBufferRange(
          resolvedAnchorIdx,
          resolvedTargetIdx,
          searchState.bufferOffset,
          searchState.results,
        );
        if (ids !== null) {
          commitRange(ids);
          return;
        }
      }

      // ------------------------------------------------------------------
      // 3. Resolve anchor sort values for server walk.
      //
      // Priority: (1) from effect,
      //           (2) retained response tuple, (3) metadataCache + extractSortValues.
      //
      // Skip searchAfter fallback -- if setAnchor() correctly called
      // ensureMetadata([anchorId]) (S1 cohesion rule), the cache should
      // always have the anchor's metadata by the time a shift-click fires.
      // ------------------------------------------------------------------
      let anchorSV: SortValues | null = anchorSVFromEffect
        ?? getRetainedSortValues(anchorId, buildSearchKey({ ...searchState.params }));
      if (!anchorSV) {
        const anchorImg = selStore.metadataCache.get(anchorId);
        if (anchorImg) {
          anchorSV = extractSortValues(anchorImg, searchState.params.orderBy);
        }
      }

      if (!anchorSV && !requiresCurrentEndpoints) {
        // All fallbacks exhausted -- anchor metadata unavailable.
        addToast({
          category: "warning",
          message:
            "The selection anchor is no longer available. Click an image to set a new anchor.",
        });
        return;
      }

      // ------------------------------------------------------------------
      // 4. Determine fromCursor / toCursor.
      //
      // getIdRange contract: fromCursor is exclusive lower bound (sort earlier),
      // toCursor is inclusive upper bound (sort later).
      //
      // We always also add targetId explicitly after the walk because when
      // target sorts earlier than anchor, it's excluded by the exclusive lower
      // bound.
      // ------------------------------------------------------------------
      let fromCursor: SortValues;
      let toCursor: SortValues;
      let directionKnown = false;

      if (
        resolvedAnchorIdx !== undefined &&
        resolvedAnchorIdx !== targetGlobalIndex
      ) {
        directionKnown = true;
        if (resolvedAnchorIdx < targetGlobalIndex) {
          // Anchor sorts earlier in the result set.
          fromCursor = anchorSV ?? [];
          toCursor = targetSortValues;
        } else {
          // Target sorts earlier.
          fromCursor = targetSortValues;
          toCursor = anchorSV ?? [];
        }
      } else {
        // Unknown order (anchor index unavailable) -- guess anchor -> target.
        // Swap-and-retry logic in step 6 handles the wrong-direction case.
        fromCursor = anchorSV ?? [];
        toCursor = targetSortValues;
      }

      // ------------------------------------------------------------------
      // 5. Execute getIdRange.
      // ------------------------------------------------------------------
      const controller = new AbortController();
      const searchKey = buildSearchKey(searchState.params);
      const boundary = searchState.newCountSince;
      const rangeParams = boundary && (!searchState.params.until || boundary < searchState.params.until)
        ? { ...searchState.params, until: boundary } : searchState.params;
      const finish = (rangeWalkTime: number | null) => {
        if (cancelRef.current !== cancel) return;
        cancelRef.current = null;
        unsubscribeSelection();
        unsubscribeSearch();
        useSelectionStore.setState({ isRangeWalking: false, rangeWalkTime });
      };
      const cancel = () => {
        controller.abort();
        finish(null);
      };
      const unsubscribeSelection = useSelectionStore.subscribe((state, previous) => {
        if (state.selectedIds !== previous.selectedIds || state.anchorId !== previous.anchorId) cancel();
      });
      const unsubscribeSearch = useSearchStore.subscribe((state, previous) => {
        if (state.params !== previous.params && buildSearchKey(state.params) !== searchKey) cancel();
      });
      cancelRef.current = cancel;
      const rangeWalkStart = Date.now();
      useSelectionStore.setState({ isRangeWalking: true, rangeWalkTime: null });
      let result;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const revision = getOrderingRevision();
          if (requiresCurrentEndpoints || attempt > 0) {
            const scopedIds = searchState.params.ids?.split(",");
            if (scopedIds && (!scopedIds.includes(anchorId) || !scopedIds.includes(targetId))) {
              throw new Error("A range endpoint no longer matches the query");
            }
            const endpoints = await searchState.dataSource.searchAfter(
              { ...rangeParams, ids: [anchorId, targetId].join(","), length: 2 }, null, null, controller.signal,
            );
            if (cancelRef.current !== cancel) return;
            if (revision !== getOrderingRevision()) continue;
            const anchorIndex = endpoints.hits.findIndex(image => image.id === anchorId);
            const targetIndex = endpoints.hits.findIndex(image => image.id === targetId);
            if (anchorIndex < 0 || targetIndex < 0 || !endpoints.sortValues[anchorIndex] || !endpoints.sortValues[targetIndex]) {
              throw new Error("A range endpoint no longer matches the query");
            }
            fromCursor = endpoints.sortValues[Math.min(anchorIndex, targetIndex)];
            toCursor = endpoints.sortValues[Math.max(anchorIndex, targetIndex)];
            directionKnown = true;
          }
          result = await selStore.dataSource.getIdRange(rangeParams, fromCursor, toCursor, controller.signal);
          if (cancelRef.current !== cancel) return;
          if (!directionKnown && result.ids.length === 0 && revision === getOrderingRevision()) {
            result = await selStore.dataSource.getIdRange(rangeParams, toCursor, fromCursor, controller.signal);
            if (cancelRef.current !== cancel) return;
          }
          if (revision === getOrderingRevision()) break;
          result = undefined;
        }
        if (!result) throw new Error("Ordering changed during range selection");
      } catch (e) {
        if (cancelRef.current !== cancel) return;
        finish(null);
        if (e instanceof Error && e.name === "AbortError") return;
        addToast({
          category: "error",
          message: "Range selection failed. Please try again.",
        });
        return;
      }

      if (cancelRef.current !== cancel) return;

      finish(Date.now() - rangeWalkStart);

      // ------------------------------------------------------------------
      // 7. Commit.
      //
      // Always include targetId explicitly -- it may be the sort-earlier item
      // excluded by the exclusive fromCursor. add()/remove() deduplicate, so
      // safe to include even when targetId is already in result.ids.
      // ------------------------------------------------------------------
      const idsToCommit = [targetId, ...result.ids];
      commitRange(idsToCommit);

      // ------------------------------------------------------------------
      // 8. Toast feedback.
      // ------------------------------------------------------------------
      if (result.truncated) {
        addToast({
          category: "warning",
          message: `${polarity === "remove" ? "Deselection" : "Selection"} was limited to ${RANGE_HARD_CAP.toLocaleString()} images.`,
        });
      } else if (idsToCommit.length > RANGE_SOFT_CAP) {
        addToast({
          category: "information",
          message: `${polarity === "remove" ? "Removed" : "Added"} ${idsToCommit.length.toLocaleString()} images ${polarity === "remove" ? "from" : "to"} your selection.`,
        });
      }
    },
    [],
  );

  return handleRangeEffect;
}
