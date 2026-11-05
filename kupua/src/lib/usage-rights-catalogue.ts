/**
 * Usage Rights category catalogue from metadata-editor, followed the way Kahuna does:
 * media-api root `edits` link → metadata-editor root → `usage-rights-list`.
 * It reflects Grid's configured categories (names, search aliases), so category
 * changes need no Kupua release. Optional: absent → local fallbacks in category-labels.
 */

import { create } from "zustand";
import { serviceLink } from "@/lib/grid-api-instance";

export interface UsageRightsCategory {
  value: string;
  name: string;
  searchAlias?: string;
  /** Stored values this category also matches in search; absent from older servers. */
  legacyCategories?: string[];
}

export const useUsageRightsCatalogue = create<{ categories: UsageRightsCategory[] | null }>(() => ({
  categories: null,
}));

type ArgoBody = { data?: unknown; links?: Array<{ rel?: unknown; href?: unknown }> };

async function getArgo(url: string): Promise<ArgoBody | null> {
  const response = await fetch(url, { credentials: "include" });
  return response.ok ? ((await response.json()) as ArgoBody) : null;
}

/** The whole list, or null if any entry is malformed (no partial catalogue). */
function decodeCategories(raw: unknown): UsageRightsCategory[] | null {
  if (!Array.isArray(raw)) return null;
  const result: UsageRightsCategory[] = [];
  for (const entry of raw as Array<Record<string, unknown>>) {
    if (typeof entry?.value !== "string" || typeof entry.name !== "string" || !entry.name) return null;
    const alias = entry.searchAlias;
    if (alias !== undefined && alias !== null && (typeof alias !== "string" || !alias)) return null;
    const legacy = entry.legacyCategories;
    if (legacy !== undefined && !(Array.isArray(legacy) && legacy.every((v) => typeof v === "string"))) return null;
    result.push({
      value: entry.value, name: entry.name,
      ...(typeof alias === "string" ? { searchAlias: alias } : {}),
      ...(Array.isArray(legacy) ? { legacyCategories: legacy as string[] } : {}),
    });
  }
  return result;
}

let loading: Promise<void> | null = null;

/**
 * Filters-panel category rows: each category absorbs the stored values it replaces, keyed by
 * its search value (Kahuna's chip); unclaimed values stay. Unchanged unless counts are exact:
 * every category lists replaced values and the aggregation wasn't truncated at `requested`.
 */
export function groupCategoryBuckets<B extends { key: string; count: number }>(
  buckets: B[], catalogue: UsageRightsCategory[] | null, requested: number,
): Array<{ key: string; count: number }> {
  if (!catalogue?.every((c) => c.legacyCategories) || buckets.length >= requested) return buckets;
  const owner = new Map<string, string>();
  for (const c of catalogue) {
    if (c.value === "") continue;
    for (const v of [c.value, ...c.legacyCategories!]) owner.set(v, c.searchAlias ?? c.value);
  }
  const counts = new Map<string, number>();
  for (const b of buckets) {
    const key = owner.get(b.key) ?? b.key;
    counts.set(key, (counts.get(key) ?? 0) + b.count);
  }
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

/** Fire-and-forget at startup; one attempt per page load. */
export function loadUsageRightsCatalogue(): Promise<void> {
  if (useUsageRightsCatalogue.getState().categories) return Promise.resolve();
  loading ??= (async () => {
    try {
      const edits = await serviceLink("edits");
      if (!edits) return;
      const root = await getArgo(edits);
      const href = root?.links?.find((link) => link.rel === "usage-rights-list")?.href;
      if (typeof href !== "string") return;
      const categories = decodeCategories((await getArgo(href))?.data);
      if (categories) useUsageRightsCatalogue.setState({ categories });
    } catch {
      // Optional data: labels fall back to the local table.
    } finally {
      loading = null;
    }
  })();
  return loading;
}
