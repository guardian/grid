/**
 * Runtime configuration Kahuna injects as `window.__KUPUA_CONFIG__` when it serves
 * Kupua's page. Only hosted builds (VITE_HOSTED=true) read it; local modes never do.
 * See exploration/docs/kupua-TEST-deployment-plan.md.
 */

export interface HostedConfig {
  mediaApiUri?: string;
  collectionsUri?: string;
}

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
export function hostedServiceUri(key: keyof HostedConfig): string | undefined {
  if (!isHostedBuild() || typeof window === "undefined") return undefined;
  const value = window.__KUPUA_CONFIG__?.[key];
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.search || url.hash) return undefined;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}
