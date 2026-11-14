/**
 * ServiceDiscovery — fetches the media-api HATEOAS root once at startup,
 * parses service links, and provides URL helpers for all Grid API calls.
 *
 * Architecture notes:
 * - Local media-api requests go through the Vite `/api` proxy. The explicit
 *   deployed TEST mode uses the allowlisted absolute media-api origin.
 * - The `/images/{id}` path follows the `image` link template from the
 *   HATEOAS root (`${rootUri}/images/{id}`).
 * - A local Grid API can advertise independently configured satellite origins.
 *   Validate and route each through proxy-target.ts; never infer them from the
 *   API origin. Hosted and deployed TEST services use admitted direct origins.
 * - Kupua's `--use-TEST` selects legacy direct ES, not this API transport.
 *
 * See grid-api-contract-audit-findings.md §2 for the root link table.
 * See infra-safeguards.md §8 for the write-guard that protects the /api prefix.
 */

import type { ClientConfig, Link, RootResponse } from "./types";
import { mediaApiUrl } from "./proxy-target";

/**
 * ServiceDiscovery provides URL construction and service link lookup for the
 * Grid API adapter. Initialised once at app startup via `init()`.
 *
 * Missing links remain unavailable after a failed root read. Required-data
 * callers report failure separately from successful empty data. imageUrl()
 * uses the explicit API-mode target and never selects direct Elasticsearch.
 */
export class ServiceDiscovery {
  private links = new Map<string, string>();
  private clientConfig: ClientConfig | undefined;
  private loading: Promise<boolean> | null = null;

  /**
   * Fetches the media-api HATEOAS root and populates service links.
   *
   * Every caller shares one read, started by the first call, and resolves once it settles:
   * `true` when the root loaded (a missing relation is then genuinely absent), `false` when it
  * failed. A failed read is not retried until reload.
   */
  init(signal?: AbortSignal): Promise<boolean> {
    this.loading ??= this.load(signal);
    return this.loading;
  }

  private async load(signal?: AbortSignal): Promise<boolean> {
    try {
      const resp = await fetch(mediaApiUrl(""), {
        credentials: "include",
        redirect: "error",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      });
      if (!resp.ok) return false;

      const root = (await resp.json()) as RootResponse;
      for (const link of root.links ?? []) {
        this.links.set(link.rel, link.href);
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * The ID is URI-encoded to handle edge cases (though Grid image IDs are SHA-1
   * hex strings and never require encoding in practice).
   */
  imageUrl(id: string): string {
    return mediaApiUrl(`/images/${encodeURIComponent(id)}`);
  }

  /**
   * Returns the absolute href for a named link from the HATEOAS root.
   *
   * Returns `undefined` when:
   *   - The link was absent from the root (permission-gated or user lacks access)
   *   - `init()` has not been called or failed
   *
  * Consumers validate exact service targets through proxy-target.ts before
  * dispatch; a discovered relation alone is not permission to write.
   */
  getLink(rel: string): string | undefined {
    return this.links.get(rel);
  }

  /**
   * Returns a shallow copy of the parsed clientConfig, or `undefined` when unavailable.
   *
  * This legacy projection is not populated by media-api. Runtime site settings
  * belong to site-settings.ts and hosted-config.ts, not the discovery response.
   */
  getClientConfig(): ClientConfig | undefined {
    return this.clientConfig ? { ...this.clientConfig } : undefined;
  }

  /**
   * Returns all links from the HATEOAS root as an array.
   * Used by tests and diagnostic tooling.
   */
  getLinks(): Link[] {
    return Array.from(this.links.entries()).map(([rel, href]) => ({ rel, href }));
  }
}
