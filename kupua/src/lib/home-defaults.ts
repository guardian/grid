/**
 * Default search params for the "home" state — what you see when you first
 * open kupua or click the logo.
 *
 * Extracted to its own zero-dependency module so it can be imported from
 * anywhere (routes, components, store, hooks) without circular imports.
 *
 * In real Grid, `nonFree` is a per-user config. When Kupua reaches Phase 3
 * (Grid API integration, auth), this constant will become a function or
 * store selector. Having a single source of truth makes that a one-file change.
 */

import type { UrlSearchParams } from "@/lib/search-params-schema";

export const DEFAULT_SEARCH: Partial<UrlSearchParams> = { nonFree: "true" };

