/**
 * Collection store — manages the collection tree and per-node image counts.
 *
 * Loads the tree once at boot from the collections service (URL from
 * `VITE_COLLECTIONS_URL`, credentials included for panda auth): colours and
 * suggestions need it.
 *
 * Counts load lazily, only when the Collections section is shown (or
 * hover-prefetched), in the "Free to use only" checkbox's scope. Each scope is
 * fetched at most once per tab session: the whole-index aggregation is not
 * repeated per reload or toggle. Subtree counts sum own + all descendants.
 *
 * Graceful-absence: if the tree fetch fails, status = 'absent' and the
 * Collections panel section is hidden. A failed count fetch shows the tree
 * without counts and is retried on the next need.
 *
 * Persisted to sessionStorage (survives reload, not cross-tab).
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ImageDataSource } from "@/dal";
import { hostedServiceUri, isHostedBuild } from "@/lib/hosted-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A node in the collection tree as returned by the collections service.
 * `data.data` is OPTIONAL — some nodes (e.g. "Travel/Web") lack inner data.
 * Always null-check `node.data.data?.pathId` before using.
 */
export interface CollectionNode {
  uri: string;
  data: {
    basename: string;
    children: CollectionNode[];
    fullPath: string[];
    cssColour?: string;
    data?: {
      path: string[];
      pathId: string;
      description: string;
      actionData: { author: string; date: string };
    };
  };
  links: unknown[];
  actions: unknown[];
}

export type CollectionStatus = "idle" | "loading" | "ready" | "absent";

/** Count scope follows the "Free to use only" checkbox: `all` includes paid images. */
export type CollectionCountScope = "all" | "free";

export function collectionCountScope(params: { nonFree?: string }): CollectionCountScope {
  return params.nonFree === "true" ? "all" : "free";
}

interface CollectionStoreState {
  /** The root of the collection tree (or null if not loaded / absent). */
  tree: CollectionNode | null;
  /**
   * Per-scope, per-pathId SUBTREE image count (own + all descendants).
   * A missing scope means not fetched yet (or the last fetch failed).
   */
  countsByScope: Partial<Record<CollectionCountScope, Record<string, number>>>;
  status: CollectionStatus;

  /** Load the collection tree. Called once at app boot. */
  loadCollections: () => Promise<void>;
  /** Fetch one scope's counts unless already cached or in flight. */
  loadCounts: (dataSource: Pick<ImageDataSource, "getAggregations">, scope: CollectionCountScope) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

/**
 * Walk the tree and build a pathId → cssColour map.
 * Colour lives on the CollectionNode in the service, NOT on the image ES doc.
 */
export function buildColourMap(root: CollectionNode): Record<string, string> {
  const result: Record<string, string> = {};
  function walk(node: CollectionNode) {
    if (node.data.cssColour && node.data.data?.pathId) {
      result[node.data.data.pathId] = node.data.cssColour;
    }
    node.data.children.forEach(walk);
  }
  walk(root);
  return result;
}

/**
 * Compute subtree counts from per-pathId direct counts by splitting pathIds
 * into ancestor prefixes (mirrors ES's hierarchyAnalyzer tokenization).
 *
 * This doesn't depend on the collection service tree, so subcollections that
 * exist in ES but are missing from the tree are still counted in their
 * parent's total.
 *
 * Trade-off: a document belonging to two sibling subcollections is counted
 * twice in the parent (~4% overcount on TEST, negligible on PROD where
 * multi-collection membership is rare).
 */
export function buildSubtreeCounts(
  directCounts: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const [pathId, count] of directCounts) {
    if (!pathId) continue;
    const parts = pathId.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join("/");
      result.set(prefix, (result.get(prefix) ?? 0) + count);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const countsInFlight = new Map<CollectionCountScope, Promise<void>>();

export const useCollectionStore = create<CollectionStoreState>()(
  persist(
    (set, get) => ({
      tree: null,
      countsByScope: {},
      status: "idle" as CollectionStatus,

      loadCollections: async () => {
        // Don't reload if already loaded or loading
        const { status } = get();
        if (status === "loading" || status === "ready") return;

        set({ status: "loading" });
        const tree = await fetchCollectionTree();
        set(tree ? { tree, status: "ready" } : { tree: null, status: "absent" });
      },

      loadCounts: (dataSource, scope) => {
        if (get().countsByScope[scope]) return Promise.resolve();
        const pending = countsInFlight.get(scope);
        if (pending) return pending;
        const request = (async () => {
          try {
            const result = await dataSource.getAggregations(
              scope === "all" ? { nonFree: "true" } : {},
              [{ field: "collections.pathId", size: 6000 }],
            );
            const buckets = result.fields["collections.pathId"]?.buckets ?? [];
            const counts = Object.fromEntries(buildSubtreeCounts(new Map(buckets.map((b) => [b.key, b.count]))));
            set((state) => ({ countsByScope: { ...state.countsByScope, [scope]: counts } }));
          } catch {
            // Optional data: the tree stays usable without counts.
          } finally {
            countsInFlight.delete(scope);
          }
        })();
        countsInFlight.set(scope, request);
        return request;
      },
    }),
    {
      name: "kupua-collection-store",
      storage: createJSONStorage(() => sessionStorage),
      // The tree is refetched per load (status resets to 'idle'); counts are
      // kept for the tab session to avoid repeating the whole-index aggregation.
      partialize: (s) => ({ tree: s.tree, countsByScope: s.countsByScope }),
    },
  ),
);

// ---------------------------------------------------------------------------
// Collections service fetch
// ---------------------------------------------------------------------------

/** Shape of the collections service response. */
interface CollectionsApiResponse {
  data: CollectionNode;
  actions: unknown[];
}

/**
 * Fetch the collection tree from the collections service.
 * Returns null on any error (network, non-2xx, unexpected shape).
 */
async function fetchCollectionTree(): Promise<CollectionNode | null> {
  try {
    // Hosted builds use only Kahuna's injected address, never a laptop default.
    const configured = isHostedBuild()
      ? hostedServiceUri("collectionsUri")
      : import.meta.env.VITE_COLLECTIONS_URL ?? "http://localhost:9010";
    if (!configured) return null;
    const base = configured.replace(/\/$/, "");
    const res = await fetch(`${base}/collections`, { credentials: "include" });
    if (!res.ok) return null;
    const json: CollectionsApiResponse = await res.json();
    // The API returns { data: { basename: "root", children: [...CollectionNode] } }.
    // The root is NOT itself a CollectionNode (no uri/links/actions/data wrapper) —
    // it's a bare { basename, children } object. Synthesise a proper root so that
    // buildSubtreeCounts and CollectionTree can rely on the consistent node shape.
    const rootData = json?.data as unknown as { basename?: string; children?: CollectionNode[] };
    if (!rootData?.children) return null;
    return {
      uri: "",
      data: {
        basename: rootData.basename ?? "root",
        children: rootData.children,
        fullPath: [],
      },
      links: [],
      actions: [],
    };
  } catch {
    return null;
  }
}
