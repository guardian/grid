/**
 * Grid API adapter singleton.
 *
 * Creates a single ServiceDiscovery + GridApiDataSource pair used across
 * the entire application. Mirrors the pattern used for ElasticsearchDataSource
 * (instantiated once, shared).
 *
 * Call `initGridApi()` once at app startup (e.g. in main.tsx or the search route
 * mount effect) before any enrichment hooks run. It's safe to call multiple times —
 * ServiceDiscovery.init() is idempotent (only fetches on first call).
 *
 * If the Grid API is unreachable (no auth, no proxy, standalone mode), init()
 * silently degrades and all adapter calls return null — ES baseline is used.
 */

import { ServiceDiscovery } from "@/dal/grid-api/service-discovery";
import { GridApiDataSource } from "@/dal/grid-api/grid-api-adapter";

const discovery = new ServiceDiscovery();
export const gridApi = new GridApiDataSource(discovery);

/**
 * Initialise the Grid API service discovery.
 * Safe to call multiple times — only fetches the root on the first call.
 * Should be called before the first enrichment hook runs.
 */
export async function initGridApi(signal?: AbortSignal): Promise<void> {
  await discovery.init(signal);
}
