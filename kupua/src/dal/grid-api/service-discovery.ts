/**
 * ServiceDiscovery — fetches the media-api HATEOAS root once at startup,
 * parses service links, and provides URL helpers for all Grid API calls.
 *
 * Architecture notes:
 * - All requests go through the Vite proxy (`/api` → media-api). Never
 *   construct absolute media-api URLs — use the proxy-relative helpers here.
 * - `imageUrl(id)` returns `/api/images/{id}`. The `/api` proxy prefix maps
 *   to the media-api rootUri. The `/images/{id}` path follows the `image`
 *   link template from the HATEOAS root (`${rootUri}/images/{id}`).
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

/** Vite proxy prefix for media-api. Matches the `/api` rule in vite.config.ts. */
const ROOT_PROXY_PATH = "/api";

/** Proxy-relative path prefix for single-image requests. */
const IMAGE_PATH_PREFIX = "/api/images/";

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
  private initialised = false;

  /**
   * Fetches the media-api HATEOAS root and populates service links.
   *
   * Safe to call multiple times — only fetches on the first call.
   * On failure: silently swallows the error (graceful API absence directive).
   * All URL helpers degrade to their default values.
   */
  async init(signal?: AbortSignal): Promise<void> {
    if (this.initialised) return;
    this.initialised = true;

    try {
      const resp = await fetch(ROOT_PROXY_PATH, {
        credentials: "include",
        signal,
      });
      if (!resp.ok) return; // 401/403/5xx — leave links empty, graceful absence

      const root = (await resp.json()) as RootResponse;
      for (const link of root.links ?? []) {
        this.links.set(link.rel, link.href);
      }

      // clientConfig is not in the media-api root response — it is a kahuna concept
      // baked into the Play template. Phase A stubs this as undefined.
      // TODO (Cluster 1): determine the actual fetch source for clientConfig and
      // wire it up here. The PROD/TEST shapes are captured in types.ts.
    } catch {
      // Network failure or AbortError — leave links empty, UI degrades gracefully.
    }
  }

  /**
   * Returns the proxy-relative URL for a single image detail request.
   *
   * Path structure: `/api/images/{id}` where:
   *   `/api` = Vite proxy prefix (maps to media-api rootUri)
   *   `/images/{id}` = path from the `image` link template in the HATEOAS root
   *
   * The ID is URI-encoded to handle edge cases (though Grid image IDs are SHA-1
   * hex strings and never require encoding in practice).
   */
  imageUrl(id: string): string {
    return `${IMAGE_PATH_PREFIX}${encodeURIComponent(id)}`;
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

/**
 * Singleton ServiceDiscovery instance — shared across the app.
 *
 * Call `serviceDiscovery.init()` once at app startup (before any Grid API calls).
 * Tests create their own ServiceDiscovery instances for isolation.
 */
export const serviceDiscovery = new ServiceDiscovery();
