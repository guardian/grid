/**
 * Main application store.
 *
 * Manages search params, results, loading state, and the data source.
 * URL sync is handled by the useUrlSearchSync hook (URL → store → search).
 */

import { create } from "zustand";
import type { Image } from "@/types/image";
import type { ImageDataSource, SearchParams } from "@/dal";
import { ElasticsearchDataSource } from "@/dal";

interface SearchState {
  // Data source (swappable between ES and Grid API)
  dataSource: ImageDataSource;

  // Search state
  params: SearchParams;
  results: Image[];
  total: number;
  took: number;
  loading: boolean;
  error: string | null;

  // Actions
  setParams: (params: Partial<SearchParams>) => void;
  search: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  dataSource: new ElasticsearchDataSource(),

  params: {
    query: undefined,
    offset: 0,
    length: 50,
    orderBy: "-uploadTime",
    nonFree: "true",
  },
  results: [],
  total: 0,
  took: 0,
  loading: false,
  error: null,

  setParams: (newParams) => {
    set((state) => ({
      params: { ...state.params, ...newParams, offset: 0 },
    }));
  },

  search: async () => {
    const { dataSource, params } = get();
    set({ loading: true, error: null });

    try {
      const result = await dataSource.search({ ...params, offset: 0 });
      set({
        results: result.hits,
        total: result.total,
        took: result.took,
        loading: false,
        params: { ...params, offset: 0 },
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Search failed",
        loading: false,
      });
    }
  },

  loadMore: async () => {
    const { dataSource, params, results, total, loading } = get();
    if (loading || results.length >= total) return;

    const nextOffset = results.length;
    set({ loading: true });

    try {
      const result = await dataSource.search({
        ...params,
        offset: nextOffset,
      });
      set({
        results: [...results, ...result.hits],
        total: result.total,
        took: result.took,
        loading: false,
        params: { ...params, offset: nextOffset },
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Load more failed",
        loading: false,
      });
    }
  },
}));

