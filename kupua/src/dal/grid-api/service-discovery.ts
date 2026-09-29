/**
 * ServiceDiscovery — fetches the media-api HATEOAS root once at startup,
 * parses service links, and provides URL helpers for all Grid API calls.
 *
 * Architecture notes:
 * - Local media-api requests go through the Vite `/api` proxy. The explicit
 *   deployed TEST mode uses the allowlisted absolute media-api origin.
 * - The `/images/{id}` path follows the `image` link template from the
 *   HATEOAS root (`${rootUri}/images/{id}`).
 * - In `--use-TEST` mode the HATEOAS root returns mixed-origin URLs (media-api
 *   at *.local.dev-gutools.co.uk, satellites at *.test.dev-gutools.co.uk).
 *   For satellite services (Phase B+), each gets its own proxy prefix and
 *   a URL helper here. Never derive a single base URI from the root.
 * - Full rules: integration-workplan-bread-and-butter.md §"Architectural rule"
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
 * All methods degrade gracefully when `init()` has not been called or failed —
 * `imageUrl()` returns a hardcoded proxy path, `getLink()` returns undefined,
 * `getClientConfig()` returns undefined. No method throws.
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
   * failed. A failed read is not retried until reload (graceful API absence directive).
   */
  init(signal?: AbortSignal): Promise<boolean> {
    this.loading ??= this.load(signal);
    return this.loading;
  }

  private async load(signal?: AbortSignal): Promise<boolean> {
    try {
      const resp = await fetch(mediaApiUrl(""), {
        credentials: "include",
        signal,
      });
      if (!resp.ok) return false; // 401/403/5xx — leave links empty, graceful absence

      const root = (await resp.json()) as RootResponse;
      for (const link of root.links ?? []) {
        this.links.set(link.rel, link.href);
      }

      // clientConfig is not in the media-api root response — it is a kahuna concept
      // baked into the Play template. Phase A stubs this as undefined.
      // TODO (Cluster 1): determine the actual fetch source for clientConfig and
      // wire it up here. The PROD/TEST shapes are captured in types.ts.
      return true;
    } catch {
      // Network failure, unreadable body or AbortError — leave links empty, UI degrades gracefully.
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
   * Used by Phase B satellite adapters (leases, usages, crops, etc.).
   * Returns `undefined` when:
   *   - The link was absent from the root (permission-gated or user lacks access)
   *   - `init()` has not been called or failed
   *
   * Never construct satellite URLs from this href directly — always route through
   * the appropriate Vite proxy prefix (e.g. `/grid-leases`, `/grid-usage`).
   * See integration-workplan-bread-and-butter.md §"Architectural rule".
   */
  getLink(rel: string): string | undefined {
    return this.links.get(rel);
  }

  /**
   * Returns a shallow copy of the parsed clientConfig, or `undefined` when unavailable.
   *
   * Every consumer must treat each field as potentially `undefined` and degrade.
   * Per the "graceful API absence" directive: absence = "flag off" / "not configured".
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
