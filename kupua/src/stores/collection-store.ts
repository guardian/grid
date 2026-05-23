/**
 * Collection store — manages the collection tree and per-node image counts.
 *
 * Loads once at boot:
 * 1. Fetches the collection tree directly from the collections service
 *    (URL from `VITE_COLLECTIONS_URL`, credentials included for panda auth)
 * 2. Fetches unfiltered image counts via ES aggregation (not search-scoped)
 * 3. Computes subtree counts (parent = sum of own + all descendants)
 *
 * Graceful-absence: if the tree fetch fails, status = 'absent' and the
 * Collections panel section is hidden. If only the count fetch fails, the
 * tree is shown without counts.
 *
 * Persisted to sessionStorage (survives reload, not cross-tab).
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { ElasticsearchDataSource } from "@/dal";

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

interface CollectionStoreState {
  /** The root of the collection tree (or null if not loaded / absent). */
  tree: CollectionNode | null;
  /**
   * Per-pathId SUBTREE image count (own + all descendants).
   * Empty map when agg failed or not yet loaded.
   * Stored as a plain object for JSON serialisation; access via helpers.
   */
  counts: Record<string, number>;
  status: CollectionStatus;

  /** Load the collection tree and counts. Called once at app boot. */
  loadCollections: () => Promise<void>;
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

const dataSource = new ElasticsearchDataSource();

/** AbortController for the in-flight getAggregations call in loadCollections. */
let _collectionsAbortController: AbortController | null = null;

export const useCollectionStore = create<CollectionStoreState>()(
  persist(
    (set, get) => ({
      tree: null,
      counts: {},
      status: "idle" as CollectionStatus,

      loadCollections: async () => {
        // Don't reload if already loaded or loading
        const { status } = get();
        if (status === "loading" || status === "ready") return;

        set({ status: "loading" });

        // Fire both requests in parallel
        _collectionsAbortController?.abort();
        _collectionsAbortController = new AbortController();
        const [treeResult, aggResult] = await Promise.allSettled([
          fetchCollectionTree(),
          dataSource.getAggregations({}, [{ field: "collections.pathId", size: 6000 }], _collectionsAbortController.signal),
        ]);

        // Tree fetch failure → absent (Collections section hidden)
        if (treeResult.status === "rejected" || treeResult.value === null) {
          set({ status: "absent", tree: null, counts: {} });
          return;
        }

        const tree = treeResult.value;

        // Agg failure → show tree without counts (not absent)
        let counts: Record<string, number> = {};
        if (aggResult.status === "fulfilled") {
          const buckets = aggResult.value.fields["collections.pathId"]?.buckets ?? [];
          const directCounts = new Map(buckets.map((b) => [b.key, b.count]));
          const subtreeCounts = buildSubtreeCounts(directCounts);
          counts = Object.fromEntries(subtreeCounts);
        }

        set({ tree, counts, status: "ready" });
      },
    }),
    {
      name: "kupua-collection-store",
      storage: createJSONStorage(() => sessionStorage),
      // Only persist the stable parts; status resets to 'idle' on reload
      // so loadCollections() fires again and picks up fresh counts.
      partialize: (s) => ({ tree: s.tree, counts: s.counts }),
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
    const base = (import.meta.env.VITE_COLLECTIONS_URL ?? "http://localhost:9010").replace(/\/$/, "");
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
