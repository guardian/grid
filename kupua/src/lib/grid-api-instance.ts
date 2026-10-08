/**
 * Session-scoped Grid service discovery shared by search-route initialization
 * and API-mode AI capability detection. A failed root read leaves links unavailable
 * until reload; this module does not fetch image detail or runtime configuration.
 */

import { ServiceDiscovery } from "@/dal/grid-api/service-discovery";

const discovery = new ServiceDiscovery();

/**
 * Initialise the Grid API service discovery.
 * Safe to call multiple times — every caller awaits the same root read.
 */
export async function initGridApi(signal?: AbortSignal): Promise<void> {
  await discovery.init(signal);
}

/**
 * Whether media-api advertises text AI search (the root `ai-search` relation). Waits for the
 * shared root read; a failed root reads as unavailable for the session.
 */
export async function apiAiSearchAvailable(): Promise<boolean> {
  return (await discovery.init()) && discovery.getLink("ai-search") !== undefined;
}
