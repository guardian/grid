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
import { acceptImageOverlay, acceptImageRead, copyImageRead, ensureImageRead, hasImageFences } from "@/lib/image-read-freshness";
import type { Image } from "@/types/image";
import type { Cost, Action, Link, SyndicationStatus, UsageRights, Usage } from "@/dal/grid-api/types";

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
  resource?: { uri?: string; links: Link[] };
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

  /** Replace the entire enrichment dataset (called after mirror-search completes). */
  setEnrichment: (entries: Map<string, EnrichmentFields>) => void;

  /**
   * Merge entries into the existing dataset (upsert by id). Used by the media-api
   * search-after path, which fills the buffer incrementally page-by-page (unlike the
   * old whole-window mirror-search that replaced everything at once). Entries from
   * earlier pages are preserved; same-id entries are overwritten.
   */
  upsertEnrichment: (entries: Map<string, EnrichmentFields>) => void;
}

export const useEnrichmentStore = create<EnrichmentState>()((set) => ({
  data: new Map(),

  setEnrichment: (entries) => set(state => ({ data: hasImageFences()
    ? new Map([...entries].map(([id, fields]) => [id, acceptImageOverlay(id, fields, state.data.get(id))])) : entries })),

  upsertEnrichment: (entries) =>
    set((state) => {
      if (entries.size === 0) return state;
      let merged: Map<string, EnrichmentFields> | undefined;
      for (const [id, fields] of entries) {
        const accepted = acceptImageOverlay(id, fields, state.data.get(id));
        if (accepted === state.data.get(id)) continue;
        merged ??= new Map(state.data);
        merged.set(id, accepted);
      }
      return merged ? { data: merged } : state;
    }),
}));

// Server enrichment that arrived with an image object outside search publication (selection's
// bulk reads). It lives exactly as long as that object, so it is as fresh as the image shown.
const attached = new WeakMap<object, EnrichmentFields>();

export function attachEnrichment(image: object, fields: EnrichmentFields): void {
  attached.set(image, fields);
}

export function attachedEnrichment(image: object): EnrichmentFields | undefined {
  return attached.get(image);
}

export function acceptEnrichedImage(image: Image, current?: Image, issued?: number): Image | undefined {
  if (issued !== undefined) ensureImageRead(image, issued);
  const accepted = acceptImageRead(image, current);
  const incoming = attachedEnrichment(image);
  if (!accepted) {
    if (incoming) {
      const store = useEnrichmentStore.getState();
      const overlay = acceptImageOverlay(image.id, incoming, store.data.get(image.id));
      if (store.data.has(image.id)) store.upsertEnrichment(new Map([[image.id, overlay]]));
    }
    return undefined;
  }
  if (!incoming) return accepted;
  const previous = attachedEnrichment(accepted);
  const overlay = acceptImageOverlay(image.id, incoming, previous);
  if (overlay === previous) return accepted;
  const body = accepted === current ? { ...accepted } : accepted;
  if (body !== accepted) copyImageRead(accepted, body);
  attachEnrichment(body, overlay);
  return body;
}
