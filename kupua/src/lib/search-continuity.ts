import { getSearchGeneration, useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";
import { getViewportAnchorId, getVisibleImageIds } from "@/hooks/useDataWindow";
import { buildSearchKey } from "@/lib/image-offset-cache";
import { getScrollContainer } from "@/lib/scroll-container-ref";
import { getLayoutGeometry, getItemLayoutRow } from "@/lib/scroll-geometry-ref";
import { resolveAnchorVirtIndex } from "@/lib/grid-scroll-anchor";
import { isTwoTierFromTotal } from "@/lib/two-tier";
import type { UrlSearchParams } from "@/lib/search-params-schema";
import type { HistorySnapshot } from "@/lib/history-snapshot";
import { getUploadFormRevision, getUploadScrollRevision, useUploadLayoutStore } from "@/stores/upload-layout-store";

export type SearchPlacement = { kind: "ratio"; ratio: number; includesHeader?: boolean } | { kind: "start" } | { kind: "centre" };

export interface SearchContinuity {
  provenance: "user" | "history" | "maintenance";
  targetId: string | null;
  placement: SearchPlacement;
  focus: "target" | "none" | "retain";
  suppressPulse?: boolean;
  neighbours?: string[];
  fallback?: "top";
  anchorOffset?: number;
}

export interface OwnedSearchContinuity extends SearchContinuity {
  owner: AbortSignal;
  searchGeneration: number;
  historyFocusIntent?: number;
  phase: "pending" | "ready" | "placed" | "retired";
}

let captured: { key: string; generation: number; sortOnly: boolean; continuity: SearchContinuity } | null = null;

export function stopFollowingUploadBatch(): void {
  const layout = useUploadLayoutStore.getState();
  if (!layout.followingBatch) return;
  const state = useSearchStore.getState();
  if (state.params.recentUploadScope?.batch?.key === `upload:${layout.followingBatch}`) {
    state.setFocusedImageId(state.focusedImageId);
  }
  layout.stopFollowingBatch();
}

export function historySearchContinuity(snapshot: HistorySnapshot | undefined, params: UrlSearchParams): SearchContinuity {
  const matching = snapshot?.searchKey === buildSearchKey(params) ? snapshot : undefined;
  return {
    provenance: "history",
    targetId: matching?.anchorImageId ?? null,
    placement: matching?.viewportRatio != null
      ? { kind: "ratio", ratio: matching.viewportRatio + (matching.viewportHeaderRatio ?? 0),
        ...(matching.viewportHeaderRatio !== undefined && { includesHeader: true }) } : { kind: "start" },
    focus: matching?.anchorImageId && !matching.anchorIsPhantom ? "target" : "none",
    fallback: "top",
    ...(matching?.anchorImageId ? { anchorOffset: matching.anchorOffset } : {}),
  };
}

export function captureSearchContinuity(
  transition: boolean | "membership",
  container = getScrollContainer(),
  geometry = getLayoutGeometry(),
): SearchContinuity {
  const sortOnly = transition === true;
  const maintenance = transition === "membership";
  const state = useSearchStore.getState();
  const followingBatch = useUploadLayoutStore.getState().followingBatch;
  if (maintenance && followingBatch && state.params.recentUploadScope?.batch?.key === `upload:${followingBatch}`) {
    return { provenance: "maintenance", targetId: null, placement: { kind: "start" }, focus: "retain" };
  }
  const selection = useSelectionStore.getState();
  const selectedAnchor = sortOnly && !state.params.imageScope && !state.params.recentUploadScope && selection.selectedIds.size > 0 ? selection.anchorId : null;
  const focusTarget = sortOnly && getEffectiveFocusMode() !== "explicit" ? null : state.focusedImageId;
  const uploadMaintenance = maintenance && state.params.recentUploadScope?.combined && state.params.recentUploadScope.batch;
  const activeId = maintenance && typeof document !== "undefined" &&
    (!uploadMaintenance || getUploadFormRevision() > getUploadScrollRevision())
    ? document.activeElement?.closest<HTMLElement>("[data-measured-cell]")?.dataset.imageId : undefined;
  const targetId = uploadMaintenance ? activeId ?? getViewportAnchorId() ?? focusTarget
    : activeId ?? selectedAnchor ?? focusTarget ?? (sortOnly ? null : getViewportAnchorId());
  const focus = maintenance || selectedAnchor ? "retain" : focusTarget ? "target" : sortOnly && state.params.aiQuery ? "retain" : "none";
  const index = resolveAnchorVirtIndex(targetId, state.imagePositions, state.bufferOffset, isTwoTierFromTotal(state.total));
  const placement: SearchPlacement = index !== null && container && container.clientHeight > 0
    ? { kind: "ratio", ratio: (getItemLayoutRow(geometry, index).top - container.scrollTop) / container.clientHeight }
    : { kind: "start" };
  return { provenance: maintenance ? "maintenance" : "user", targetId, placement, focus,
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