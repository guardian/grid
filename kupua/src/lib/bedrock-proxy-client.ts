/**
 * Browser-side client for the Bedrock embedding proxy.
 *
 * Thin fetch wrappers — all AWS logic lives server-side in the Vite
 * middleware (scripts/bedrock-embed-proxy.mjs). This module only talks
 * to the local /bedrock/* endpoints.
 *
 * Both functions are graceful-absent: any network error or non-2xx
 * response is treated as "Bedrock unavailable" rather than an application
 * error. See zz Archive/ai-search-workplan.md §2.2.
 */

/**
 * Returns the 256-float embedding for `query`.
 * Throws if the proxy returns a non-2xx status (caller handles with toast).
 * Accepts an optional AbortSignal to cancel the fetch mid-flight.
 */
export async function getEmbedding(query: string, signal?: AbortSignal): Promise<number[]> {
  const resp = await fetch(`/bedrock/embed?q=${encodeURIComponent(query)}`, { signal });
  if (!resp.ok) {
    throw new Error(`Bedrock proxy returned ${resp.status}`);
  }
  const data = (await resp.json()) as { embedding: number[] };
  return data.embedding;
}

/**
 * Returns true if the Bedrock proxy reports itself as available.
 * Never throws — network errors and non-2xx responses return false.
 */
export async function checkBedrockHealth(): Promise<boolean> {
  try {
    const resp = await fetch("/bedrock/health");
    if (!resp.ok) return false;
    const data = (await resp.json()) as { available: boolean };
    return data.available === true;
  } catch {
    return false;
  }
}
