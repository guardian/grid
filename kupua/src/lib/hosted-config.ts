/**
 * Runtime configuration Kahuna injects as `window.__KUPUA_CONFIG__` when it serves
 * Kupua's page. Service addresses and permissions are hosted-only; site settings
 * use the source-independent site-settings.ts boundary.
 */

export interface HostedConfig {
  mediaApiUri?: string;
  collectionsUri?: string;
  /** The user's `show_paid` permission; drives initial/Home defaults only. */
  showPaid?: unknown;
  gridConfig?: unknown;
}

type ServiceUriKey = "mediaApiUri" | "collectionsUri";

import { validateSiteSettings, type SiteSettings } from "./site-settings.ts";
export type { SiteFieldAlias as HostedFieldAlias, SiteTickerDefinition as HostedTickerDefinition, SiteSettings as HostedGridConfig } from "./site-settings.ts";

declare global {
  interface Window {
    __KUPUA_CONFIG__?: HostedConfig;
  }
}

/** Kahuna route that clears the opt-in cookie and returns to Kahuna. */
export const KAHUNA_RETURN_PATH = "/kupua/off";

export function isHostedBuild(): boolean {
  return import.meta.env.VITE_HOSTED === "true";
}

/**
 * A service address from the injected config, as an https origin plus path with no
 * trailing slash. Undefined outside hosted builds or when absent/invalid.
 */
export function hostedServiceUri(key: ServiceUriKey): string | undefined {
  if (!isHostedBuild() || typeof window === "undefined") return undefined;
  const value = window.__KUPUA_CONFIG__?.[key];
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return undefined;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function injected(): HostedConfig | undefined {
  if (!isHostedBuild() || typeof window === "undefined") return undefined;
  return window.__KUPUA_CONFIG__;
}

/** Undefined when absent or invalid: callers keep their compatibility default. */
export function hostedShowPaid(): boolean | undefined {
  const value = injected()?.showPaid;
  return typeof value === "boolean" ? value : undefined;
}

/** Supplied lists/maps replace local ones whole; any invalid entry rejects that whole setting. */
export function hostedGridConfig(): SiteSettings {
  return validateSiteSettings(injected()?.gridConfig);
}
