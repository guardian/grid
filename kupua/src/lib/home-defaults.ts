/**
 * Default search params for the "home" state — what you see when you first
 * open kupua or click the logo.
 *
 * Extracted to its own zero-dependency module so it can be imported from
 * anywhere (routes, components, store, hooks) without circular imports.
 *
 * Hosted builds follow the user's `show_paid` permission injected by Kahuna:
 * false → free-only (no `nonFree`). Missing/invalid, and every laptop mode,
 * keep the prototype default of including paid images. This is a default only;
 * explicit URL `nonFree` values are always preserved.
 */

import type { UrlSearchParams } from "@/lib/search-params-schema";
import { hostedShowPaid } from "@/lib/hosted-config";

export const DEFAULT_SEARCH: Partial<UrlSearchParams> =
  hostedShowPaid() === false ? {} : { nonFree: "true" };

/** Plain href for Home links, so ordinary/new-tab navigation matches the JS click path. */
export const HOME_HREF: string = (() => {
  const query = new URLSearchParams(
    Object.entries(DEFAULT_SEARCH).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  ).toString();
  return query ? `/search?${query}` : "/search";
})();

