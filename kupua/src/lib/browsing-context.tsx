import { createContext, useContext, useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { create } from "zustand";
import type { SearchParams } from "@/dal";
import type { UrlSearchParams } from "@/lib/search-params-schema";

export type BrowsingPath = "/search" | "/upload";
export type ImageScope = NonNullable<SearchParams["imageScope"]>;
export type RecentUploadScope = NonNullable<SearchParams["recentUploadScope"]>;
export type BrowsingParams = UrlSearchParams & { batch?: string; section?: "batch" | "other"; imageScope?: ImageScope; recentUploadScope?: RecentUploadScope };

export const UPLOAD_BROWSING_ENABLED = import.meta.env.VITE_USE_MEDIA_API === "true";

export const uploadBatchMembership = create<{
  batches: ReadonlyMap<string, ImageScope>;
  set: (batch: string, ids: readonly string[], revision?: number, submittedOrder?: boolean) => void;
}>((set) => ({
  batches: new Map(),
  set: (batch, ids, revision, submittedOrder = false) => set(state => {
    const members = Object.freeze([...new Set(ids)]);
    const previous = state.batches.get(batch);
    if (previous && !!previous.submittedOrder === submittedOrder && members.length === previous.ids.length && members.every((id, index) => id === previous.ids[index])) return state;
    const scope = Object.freeze({ key: `upload:${batch}`, revision: Math.max(revision ?? 0, (previous?.revision ?? 0) + 1), ids: members,
      ...(submittedOrder ? { submittedOrder: true } : {}),
    });
    return { batches: new Map(state.batches).set(batch, scope) };
  }),
}));

export const BrowsingContext = createContext<{
  path: BrowsingPath; imageScope?: ImageScope; recentUploadScope?: RecentUploadScope; recentStatus?: "loading" | "unavailable";
  uploadStatus?: "loading" | "denied" | "disabled" | "unavailable";
}>({ path: "/search" });
export const useBrowsingContext = () => useContext(BrowsingContext);

export function useBrowsingSearch(): BrowsingParams {
  const params = useSearch({ strict: false }) as BrowsingParams;
  const { imageScope, recentUploadScope } = useBrowsingContext();
  return useMemo(() => imageScope || recentUploadScope ? { ...params, imageScope, recentUploadScope } : params, [params, imageScope, recentUploadScope]);
}
