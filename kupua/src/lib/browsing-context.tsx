import { createContext, useContext, useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { create } from "zustand";
import type { SearchParams } from "@/dal";
import type { UrlSearchParams } from "@/lib/search-params-schema";

export type BrowsingPath = "/search" | "/upload";
export type ImageScope = NonNullable<SearchParams["imageScope"]>;
export type BrowsingParams = UrlSearchParams & { batch?: string; imageScope?: ImageScope };

export const UPLOAD_BROWSING_ENABLED = import.meta.env.VITE_USE_MEDIA_API === "true";

export const uploadBatchMembership = create<{
  batches: ReadonlyMap<string, ImageScope>;
  set: (batch: string, ids: readonly string[]) => void;
}>((set) => ({
  batches: new Map(),
  set: (batch, ids) => set(state => {
    const members = Object.freeze([...new Set(ids)]);
    const previous = state.batches.get(batch);
    if (previous && members.length === previous.ids.length && members.every((id, index) => id === previous.ids[index])) return state;
    const scope = Object.freeze({ key: `upload:${batch}`, revision: (previous?.revision ?? 0) + 1, ids: members });
    return { batches: new Map(state.batches).set(batch, scope) };
  }),
}));

export const BrowsingContext = createContext<{ path: BrowsingPath; imageScope?: ImageScope }>({ path: "/search" });
export const useBrowsingContext = () => useContext(BrowsingContext);

export function useBrowsingSearch(): BrowsingParams {
  const params = useSearch({ strict: false }) as BrowsingParams;
  const { imageScope } = useBrowsingContext();
  return useMemo(() => imageScope ? { ...params, imageScope } : params, [params, imageScope]);
}
