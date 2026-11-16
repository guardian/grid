import type { NavigateFn } from "@tanstack/react-router";
import type { SearchParams } from "@/dal";
import type { BrowsingPath } from "@/lib/browsing-context";
import { buildHistorySnapshot } from "@/lib/build-history-snapshot";
import { snapshotStore, type HistorySnapshot } from "@/lib/history-snapshot";
import { buildSearchKey } from "@/lib/image-offset-cache";
import { withFreshKupuaKey } from "@/lib/orchestration/history-key";
import { consumeUserInitiatedFlag, markPushSnapshot } from "@/lib/orchestration/search";
import { DEFAULT_SEARCH } from "@/lib/home-defaults";
import { useUiPrefsStore, type Density } from "@/stores/ui-prefs-store";
import { useSearchStore } from "@/stores/search-store";

const departures = new Map<BrowsingPath, { search: Record<string, unknown>; key?: string; density: Density }>();

export function qualifyBrowsingSnapshot(snapshot: HistorySnapshot | undefined, params: SearchParams): HistorySnapshot | undefined {
  if (snapshot && params.recentUploadScope?.combined && snapshot.searchKey !== buildSearchKey(params)) {
    try {
      const previous = Object.fromEntries(JSON.parse(snapshot.searchKey)) as SearchParams;
      const before = previous.recentUploadScope;
      const after = params.recentUploadScope;
      const anchor = snapshot.anchorImageId;
      if (before?.key !== after.key || !before.combined || (before.batch?.revision ?? 0) >= (after.batch?.revision ?? 0)
        || previous.orderBy !== params.orderBy
        || anchor && !!before.batch?.ids.includes(anchor) !== !!after.batch?.ids.includes(anchor)) return undefined;
      return { ...snapshot, searchKey: buildSearchKey(params), newCountSince: null, newCount: 0 };
    } catch { return undefined; }
  }
  if (!snapshot || !params.imageScope || snapshot.searchKey === buildSearchKey(params)) return snapshot;
  try {
    const previous = Object.fromEntries(JSON.parse(snapshot.searchKey)) as SearchParams;
    if (previous.imageScope?.key !== params.imageScope.key || previous.imageScope.revision >= params.imageScope.revision
      || buildSearchKey({ ...previous, imageScope: undefined }) !== buildSearchKey({ ...params, imageScope: undefined })
      || snapshot.anchorImageId && !params.imageScope.ids.includes(snapshot.anchorImageId)) return undefined;
    return { ...snapshot, searchKey: buildSearchKey(params), newCountSince: null, newCount: 0 };
  } catch {
    return undefined;
  }
}

export function captureBrowsingDeparture(location: {
  pathname: string; search: Record<string, unknown>; state: object;
}): void {
  if (location.pathname !== "/search" && location.pathname !== "/upload") return;
  if (useUiPrefsStore.getState().densityContext !== (location.pathname === "/upload" ? "upload" : "search")) return;
  const params = useSearchStore.getState().params;
  const scopeKey = location.pathname === "/upload" ? params.recentUploadScope?.combined
    ? `upload:page:${location.search.batch ?? "none"}` : location.search.batch ? `upload:${location.search.batch}` : params.recentUploadScope?.key ?? "upload:recent-unavailable" : undefined;
  if ((params.imageScope?.key ?? params.recentUploadScope?.key) !== scopeKey) return;
  const key = (location.state as { kupuaKey?: string }).kupuaKey;
  if (key) snapshotStore.set(key, buildHistorySnapshot());
  departures.set(location.pathname, { search: location.search, key, density: useUiPrefsStore.getState().density });
}

export function returnToBrowsing(navigate: NavigateFn, path: BrowsingPath): void {
  const destination = departures.get(path);
  markPushSnapshot();
  consumeUserInitiatedFlag();
  const state = withFreshKupuaKey();
  const snapshot = destination?.key ? snapshotStore.get(destination.key) : undefined;
  if (snapshot && typeof state.kupuaKey === "string") snapshotStore.set(state.kupuaKey, snapshot);
  void navigate({ to: path, search: destination?.search ?? (path === "/search" ? DEFAULT_SEARCH : {}), state });
}

export function restoreBrowsingDensity(path: BrowsingPath): void {
  const state = useUiPrefsStore.getState();
  if (path === "/upload" && state.densityContext === "upload") return;
  state.setDensityContext(path === "/upload" ? "upload" : "search", departures.get(path)?.density);
}

export function admitBrowsingDensityContext(path: BrowsingPath): void {
  const state = useUiPrefsStore.getState();
  const context = path === "/upload" ? "upload" : "search";
  if (state.densityContext !== context) state.setDensityContext(context, state.density);
}