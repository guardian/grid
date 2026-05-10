/**
 * Single-lane enrichment via `enrichByIds` (`?ids=` requests).
 *
 * Two-phase, visible-first, connection-safe architecture:
 *
 * Phase 1 — visible viewport IDs (±6 rows margin) in a single request.
 *   Returns in ~400-700ms → one store update → cost badges appear on screen.
 *
 * Phase 2 — offscreen buffer IDs, fired sequentially one chunk at a time.
 *   Uses at most 1 HTTP connection so seek/search always has 5 free (HTTP/1.1
 *   allows 6 per origin). Abortable between chunks. Results accumulated in
 *   memory and merged into the store in a single update when all chunks finish.
 *
 * Connection starvation prevention:
 *   In dev, ALL kupua traffic (ES, API, thumbnails) flows through localhost:3000
 *   (Vite dev proxy) — one origin, one 6-connection budget under HTTP/1.1. In
 *   production, ES, thumbnails (S3/CloudFront), and `/api` are on different
 *   origins, so each gets its own 6-connection budget and the deadlock below
 *   cannot occur. The mechanisms here are primarily a dev-mode concern; once
 *   HTTP/2 lands or `max-uri-length` is raised, they become unnecessary even
 *   in dev. If enrichment fires N parallel requests in dev, seek's ES request
 *   gets queued behind them — the user sees a frozen grid for seconds. Three
 *   mechanisms prevent this:
 *     1. Sequential phase 2 — at most 1 enrichment connection open at a time.
 *     2. Yield (setTimeout(0)) between phase 1 and phase 2 — creates a macrotask
 *        boundary where seek can fire abort before phase 2 opens any connections.
 *     3. Zustand subscribe listener — aborts enrichment immediately when the
 *        search store's `loading` flips to true (seek/search starting), outside
 *        the React effect lifecycle.
 *
 * When HTTP/2 lands or `max-uri-length` is raised (allowing ~300 IDs per request),
 * phase 2 can safely switch to parallel chunking — see worklog-current.md.
 *
 * Mount once at the search route level (routes/search.tsx).
 */

import { useEffect, useRef } from "react";
import { useSearchStore } from "@/stores/search-store";
import { useEnrichmentStore } from "@/stores/enrichment-store";
import { gridApi } from "@/lib/grid-api-instance";
import { useVisibleRange } from "@/hooks/useDataWindow";
import type { EnrichmentFields } from "@/stores/enrichment-store";
import type { SearchHitImageData } from "@/dal/grid-api/types";


/**
 * Debounce delay before firing enrichment. 300ms ensures enrichment only fires
 * after scroll truly settles, avoiding wasted requests during inertial scroll.
 * Total perceived latency: 300ms debounce + ~0.8s `?ids=` fetch = ~1.1s for badges.
 */
const ENRICHMENT_DEBOUNCE_MS = 300;

/** Items within this many rows of the visible edges are treated as "visible" for ordering. */
const VIEWPORT_MARGIN = 6;

/**
 * Maps SearchHitImageData → EnrichmentFields (the subset we surface to UI).
 */
function extractEnrichment(hit: SearchHitImageData): EnrichmentFields {
  const leases = hit.leases.data?.leases ?? [];

  function isActive(l: { active: boolean; startDate?: string; endDate?: string }): boolean {
    return l.active;
  }

  const currentCount = leases.filter(
    (l) => (l.access === "allow-use" || l.access === "deny-use") && isActive(l),
  ).length;
  const inactiveCount = leases.filter(
    (l) => !isActive(l),
  ).length;
  const hasActiveAllowLease = leases.some(
    (l) => l.active && l.access === "allow-use",
  );

  const usages = hit.usages.data?.flatMap((u) => u.data ? [u.data] : []) ?? [];

  return {
    cost: hit.cost,
    valid: hit.valid,
    invalidReasons: hit.invalidReasons,
    persisted: hit.persisted,
    usageRights: hit.usageRights as EnrichmentFields["usageRights"],
    leasesSummary: { currentCount, inactiveCount, hasActiveAllowLease },
    actions: hit.actions as EnrichmentFields["actions"],
    isPotentiallyGraphic: hit.isPotentiallyGraphic,
    syndicationStatus: hit.syndicationStatus,
    usages: usages as EnrichmentFields["usages"],
  };
}

export function useEnrichment(): void {
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCacheKeyRef = useRef<string>("");

  // CRITICAL: abort enrichment the instant a seek/search starts.
  // This breaks the HTTP/1.1 connection starvation deadlock:
  //   abort needs → cacheKey change → seek response → free connection → abort
  // By listening for loading=true OUTSIDE the React effect lifecycle, we
  // cancel enrichment fetches immediately, freeing connections for the seek.
  useEffect(() => {
    let prevLoading = useSearchStore.getState().loading;
    const unsub = useSearchStore.subscribe((state) => {
      const nowLoading = state.loading;
      if (nowLoading && !prevLoading && abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
      }
      prevLoading = nowLoading;
    });
    return unsub;
  }, []);

  // Subscribe to the fields we need for the enrichment request.
  const query = useSearchStore((s) => s.params.query ?? "");
  const orderBy = useSearchStore((s) => s.params.orderBy ?? "-uploadTime");
  const bufferLength = useSearchStore((s) => s.results.length);

  // Composite buffer generation: sum of all buffer-mutation generation counters.
  // This changes on every seek, backward extend, forward-extend-with-eviction,
  // and ticker-triggered re-search — fixing Hole 3 (cache key collision when
  // the ticker replaces the buffer with same query/sort/length).
  const bufferGeneration = useSearchStore(
    (s) => s._seekGeneration + s._prependGeneration + s._forwardEvictGeneration,
  );

  // Build a stable cache key — re-run enrichment when any of these change.
  // bufferOffset and bufferLength dropped: IDs are the complete spec for
  // enrichment; generation already captures all buffer mutation transitions.
  const cacheKey = `${query}|${orderBy}|${bufferGeneration}`;

  // Visible range drives visible-first ID ordering and re-debounces on scroll.
  // Does NOT subscribe to results (avoids re-render on every buffer mutation).
  const visibleRange = useVisibleRange();

  useEffect(() => {
    const cacheKeyChanged = prevCacheKeyRef.current !== cacheKey;
    prevCacheKeyRef.current = cacheKey;

    // Always clear pending debounce — a newer trigger (scroll or buffer) supersedes.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Abort in-flight immediately on buffer/search change (stale buffer IDs).
    // On scroll-only changes, leave any in-flight batch running — its data is
    // still valid for the current buffer; aborting would waste a live request.
    if (cacheKeyChanged) {
      abortRef.current?.abort();
      abortRef.current = null;
    }

    if (bufferLength === 0) {
      useEnrichmentStore.getState().setEnrichment(new Map());
      return;
    }

    // Debounce: enrichment is enhancement data, not needed for first render.
    // During fast scrolling the visible range changes rapidly; without debounce,
    // every scroll frame would fire requests that get immediately aborted.
    debounceRef.current = setTimeout(() => {
      // Scroll has settled — abort any stale in-flight batch and start fresh.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Extract IDs at fire-time; skip undefined/placeholder entries.
      const results = (useSearchStore.getState().results as Array<{ id: string } | undefined>);
      if (results.length === 0) {
        useEnrichmentStore.getState().setLoading(false);
        return;
      }

      // Visible-first ordering: put viewport IDs at the front so the first
      // chunk covers what the user can see. Under HTTP/1.1, chunk 0 returns
      // first (~0.8s) while chunks 1..N trail behind.
      const visStart = Math.max(0, visibleRange.start - VIEWPORT_MARGIN);
      const visEnd = Math.min(results.length - 1, visibleRange.end + VIEWPORT_MARGIN);
      const visibleIds: string[] = [];
      const offscreenIds: string[] = [];
      for (let i = 0; i < results.length; i++) {
        const img = results[i];
        if (!img) continue;
        if (i >= visStart && i <= visEnd) {
          visibleIds.push(img.id);
        } else {
          offscreenIds.push(img.id);
        }
      }
      if (visibleIds.length === 0 && offscreenIds.length === 0) {
        useEnrichmentStore.getState().setLoading(false);
        return;
      }

      useEnrichmentStore.getState().setLoading(true);

      void (async () => {
        // Phase 1: visible IDs only — one request, one store update.
        if (visibleIds.length > 0) {
          const visHits = await gridApi.enrichByIds(visibleIds, controller.signal);
          if (controller.signal.aborted) return;

          if (visHits) {
            const entries = new Map<string, EnrichmentFields>();
            for (const hit of visHits) {
              entries.set(hit.id, extractEnrichment(hit));
            }
            useEnrichmentStore.getState().setEnrichment(entries);
          }
        }

        // Yield to the event loop before phase 2. This creates a window for
        // seek/search to fire abort BEFORE we open any HTTP connections.
        // Without this, phase 2's fetch calls go out immediately (microtask)
        // and occupy all 6 HTTP/1.1 connections before abort can prevent them.
        await new Promise((r) => setTimeout(r, 0));
        if (controller.signal.aborted) return;

        // Phase 2: offscreen IDs — sequential single-request chunking.
        // Fires ONE request at a time so at most 1 HTTP connection is used
        // by enrichment. Seek always has 5 free connections. Abort stops the
        // loop instantly (only 1 in-flight request to cancel).
        if (offscreenIds.length > 0) {
          const MAX_CHUNK = 46;
          const allHits: Array<{ id: string; fields: EnrichmentFields }> = [];

          for (let i = 0; i < offscreenIds.length; i += MAX_CHUNK) {
            if (controller.signal.aborted) break;
            const chunk = offscreenIds.slice(i, i + MAX_CHUNK);
            const chunkHits = await gridApi.enrichByIds(chunk, controller.signal);
            if (controller.signal.aborted) break;
            if (chunkHits) {
              for (const hit of chunkHits) {
                allHits.push({ id: hit.id, fields: extractEnrichment(hit) });
              }
            }
          }

          if (!controller.signal.aborted && allHits.length > 0) {
            const existing = useEnrichmentStore.getState().data;
            const merged = new Map(existing);
            for (const { id, fields } of allHits) {
              merged.set(id, fields);
            }
            useEnrichmentStore.getState().setEnrichment(merged);
          }
        }

        useEnrichmentStore.getState().setLoading(false);
      })();
    }, ENRICHMENT_DEBOUNCE_MS);

    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, visibleRange.start, visibleRange.end]);
}
