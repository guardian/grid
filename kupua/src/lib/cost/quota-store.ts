/**
 * quota-store — module-level singleton for supplier quota state.
 *
 * Populated once at app startup via fetchQuotas(). All subsequent reads are
 * synchronous — no React state, no re-renders, no performance cost per cell.
 *
 * Quota is a negative signal: only images already computed as "free" can be
 * upgraded to "overquota". If the fetch fails (network error, dev without API,
 * 401 etc.), the map stays empty and no images are marked overquota.
 *
 * Response shape from GET /api/usage/quotas (Argo EntityResponse wrapping StoreAccess):
 *   { data: { store: Record<supplier, { exceeded: boolean, ... }>, lastUpdated: string } }
 *
 * Source: media-api/app/lib/UsageStore.scala (StoreAccess, UsageStatus)
 *         media-api/app/controllers/UsageController.scala (quotas action)
 */

/** Map of supplier name → exceeded. Empty = quota data unavailable (graceful absence). */
let quotaMap: Map<string, boolean> = new Map();

/**
 * Returns true if the supplier has exceeded their quota.
 * Returns false when quota data is unavailable — callers stay at "free".
 */
export function isSupplierOverQuota(supplier: string): boolean {
  return quotaMap.get(supplier) === true;
}

type QuotasResponse = {
  data?: {
    store?: Record<string, { exceeded?: boolean }>;
  };
};

/**
 * Fire-and-forget: populate quotaMap from /api/usage/quotas.
 * Call once at app startup. Safe to call in tests — no side effects when
 * the module is fresh (map starts empty).
 */
export function fetchQuotas(): void {
  void (async () => {
    try {
      const response = await fetch("/api/usage/quotas", { credentials: "include" });
      if (!response.ok) return;
      const json = (await response.json()) as QuotasResponse;
      const store = json?.data?.store;
      if (!store || typeof store !== "object") return;
      const next = new Map<string, boolean>();
      for (const [supplier, status] of Object.entries(store)) {
        if (status?.exceeded === true) {
          next.set(supplier, true);
        }
      }
      quotaMap = next;
    } catch {
      // Network failure, parse error, AbortError — leave map empty.
    }
  })();
}

/**
 * Returns the list of suppliers currently marked as over quota.
 * Empty array when no quota data is available.
 */
export function getOverQuotaSuppliers(): string[] {
  const result: string[] = [];
  for (const [supplier, exceeded] of quotaMap) {
    if (exceeded) result.push(supplier);
  }
  return result;
}

/** For tests only: replace the quota map with a known state. */
export function _setQuotaMapForTest(map: Map<string, boolean>): void {
  quotaMap = map;
}
