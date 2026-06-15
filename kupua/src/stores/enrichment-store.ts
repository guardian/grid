/**
 * Enrichment store — holds API-sourced enrichment data for visible images.
 *
 * This is the thin data layer between the Grid API adapter (which fetches)
 * and the derive layer (`deriveImage`) which merges ES baseline with API overlay.
 * No persistence — enrichment is ephemeral session data that re-fetches when
 * the buffer changes.
 *
 * Merge direction: ES baseline → API overwrite, never the inverse.
 * Consumers use `useEnrichedImage(id)` which reads from this store's overlay
 * and merges via `deriveImage`.
 *
 * See integration-workplan-bread-and-butter.md §"Architectural rule".
 */

import { create } from "zustand";
import type { Cost, Action, SyndicationStatus, UsageRights, Usage } from "@/dal/grid-api/types";

/**
 * API-sourced enrichment fields for a single image.
 *
 * All fields are optional — they are populated only when the mirror-search
 * returns a hit for this image ID. UI components fall back to ES-baseline
 * values for absent fields.
 */
export interface EnrichmentFields {
  /** Server-authoritative cost (may be "overquota" — not computable from ES). */
  cost?: Cost;
  /** Server-authoritative validity. */
  valid?: boolean;
  /** Server-authoritative invalid reasons (keys → descriptions). */
  invalidReasons?: Record<string, string>;
  /** Persisted state from the server (archive status). */
  persisted?: { value: boolean; reasons: string[] };
  /** Server-merged usageRights (original + user edits applied). */
  usageRights?: UsageRights;
  /** Lease summary for the detail panel display. */
  leasesSummary?: { currentCount: number; inactiveCount: number; hasActiveAllowLease: boolean };
  /** HATEOAS action descriptors (what this user can do with the image). */
  actions?: Action[];
  /** Syndication status. */
  syndicationStatus?: SyndicationStatus;
  /** Usage list (for print/digital icon derivation on grid cells). */
  usages?: Usage[];
}

interface EnrichmentState {
  /**
   * enrichment data keyed by image ID.
   * Only contains IDs that appeared in the last mirror-search response.
   * IDs from previous buffer windows are replaced on each mirror-search.
   */
  data: Map<string, EnrichmentFields>;

  /** True while a mirror-search is in flight. */
  loading: boolean;

  /** Replace the entire enrichment dataset (called after mirror-search completes). */
  setEnrichment: (entries: Map<string, EnrichmentFields>) => void;

  /**
   * Merge entries into the existing dataset (upsert by id). Used by the media-api
   * search-after path, which fills the buffer incrementally page-by-page (unlike the
   * old whole-window mirror-search that replaced everything at once). Entries from
   * earlier pages are preserved; same-id entries are overwritten.
   */
  upsertEnrichment: (entries: Map<string, EnrichmentFields>) => void;

  /** Mark loading state. */
  setLoading: (loading: boolean) => void;

  /** Get enrichment for a single image, or undefined if not available. */
  getForImage: (id: string) => EnrichmentFields | undefined;
}

export const useEnrichmentStore = create<EnrichmentState>()((set, get) => ({
  data: new Map(),
  loading: false,

  setEnrichment: (entries) => set({ data: entries, loading: false }),

  upsertEnrichment: (entries) =>
    set((state) => {
      if (entries.size === 0) return state;
      const merged = new Map(state.data);
      for (const [id, fields] of entries) merged.set(id, fields);
      return { data: merged };
    }),

  setLoading: (loading) => set({ loading }),

  getForImage: (id) => get().data.get(id),
}));
