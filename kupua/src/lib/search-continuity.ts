import { getSearchGeneration, useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import { getViewportAnchorId, getVisibleImageIds } from "@/hooks/useDataWindow";
import { buildSearchKey } from "@/lib/image-offset-cache";
import { getScrollContainer } from "@/lib/scroll-container-ref";
import { getScrollGeometry } from "@/lib/scroll-geometry-ref";
import { resolveAnchorVirtIndex } from "@/lib/grid-scroll-anchor";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import type { UrlSearchParams } from "@/lib/search-params-schema";

export type SearchPlacement = { kind: "ratio"; ratio: number } | { kind: "start" } | { kind: "centre" };

export interface SearchContinuity {
  targetId: string | null;
  placement: SearchPlacement;
  focus: "target" | "none" | "retain";
  neighbours?: string[];
}

export interface OwnedSearchContinuity extends SearchContinuity {
  owner: AbortSignal;
  searchGeneration: number;
  phase: "pending" | "ready" | "placed" | "retired";
}

let captured: { key: string; generation: number; sortOnly: boolean; continuity: SearchContinuity } | null = null;

export function captureSearchContinuity(
  sortOnly: boolean,
  container = getScrollContainer(),
  geometry = getScrollGeometry(),
): SearchContinuity {
  const state = useSearchStore.getState();
  const selection = useSelectionStore.getState();
  const selectedAnchor = sortOnly && selection.selectedIds.size > 0 ? selection.anchorId : null;
  const focusTarget = sortOnly && getEffectiveFocusMode() !== "explicit" ? null : state.focusedImageId;
  const targetId = selectedAnchor ?? focusTarget ?? (sortOnly ? null : getViewportAnchorId());
  const focus = selectedAnchor ? "retain" : focusTarget ? "target" : sortOnly && state.params.aiQuery ? "retain" : "none";
  const index = resolveAnchorVirtIndex(targetId, state.imagePositions, state.bufferOffset, isTwoTierFromTotal(state.total));
  const placement: SearchPlacement = index !== null && container && container.clientHeight > 0
    ? { kind: "ratio", ratio: (Math.floor(index / geometry.columns) * geometry.rowHeight - container.scrollTop) / container.clientHeight }
    : { kind: "start" };
  return { targetId, placement, focus,
    ...(targetId && focus !== "target" ? { neighbours: getVisibleImageIds() } : {}) };
}

export function saveSearchContinuity(params: UrlSearchParams, sortOnly: boolean, continuity: SearchContinuity): void {
  captured = { key: buildSearchKey(params), generation: getSearchGeneration(), sortOnly, continuity };
}

export function takeSearchContinuity(params: UrlSearchParams, sortOnly: boolean): SearchContinuity {
  const previous = captured;
  captured = null;
  return previous?.key === buildSearchKey(params) && previous.generation === getSearchGeneration() && previous.sortOnly === sortOnly
    ? previous.continuity
    : captureSearchContinuity(sortOnly);
}