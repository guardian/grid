import { hostedServiceUri, isHostedBuild } from "../../lib/hosted-config.ts";
import { gridServiceProxyRoutes, serviceOrigin } from "../../lib/grid-mutation-policy.ts";

export const LOCAL_MEDIA_API_BASE_URL = "/api";
export const DEPLOYED_TEST_MEDIA_API_BASE_URL = "https://api.media.test.dev-gutools.co.uk";

export function resolveMediaApiBaseUrl(configuredBaseUrl: string | undefined): string {
  const selectedBaseUrl = configuredBaseUrl ?? LOCAL_MEDIA_API_BASE_URL;
  if (selectedBaseUrl === LOCAL_MEDIA_API_BASE_URL) return LOCAL_MEDIA_API_BASE_URL;
  if (selectedBaseUrl === DEPLOYED_TEST_MEDIA_API_BASE_URL) return DEPLOYED_TEST_MEDIA_API_BASE_URL;
  throw new Error(`Unsupported media-api base URL: ${selectedBaseUrl}`);
}

export function mediaApiUrl(path: string, configuredBaseUrl: string | undefined = import.meta.env.VITE_MEDIA_API_BASE_URL): string {
  if (path !== "" && !path.startsWith("/")) throw new Error(`Invalid media-api path: ${path}`);
  if (isHostedBuild()) {
    const hostedBase = hostedServiceUri("mediaApiUri");
    if (!hostedBase) throw new Error("Hosted Kupua has no media-api address from Kahuna");
    return `${hostedBase}${path}`;
  }
  return `${resolveMediaApiBaseUrl(configuredBaseUrl)}${path}`;
}

export function shouldEnableDirectBedrockProxy(useMediaApi: string | undefined, isVitest = false): boolean {
  return useMediaApi !== "true" && !isVitest;
}

export function gridServiceOrigin(href: unknown, expectedPath = "/"): string | undefined {
  if (expectedPath === "/") return serviceOrigin(href, !isHostedBuild());
  if (typeof href !== "string") return undefined;
  try {
    const url = new URL(href);
    return href === `${url.origin}${expectedPath}` ? serviceOrigin(url.origin, !isHostedBuild()) : undefined;
  } catch { return undefined; }
}

export function gridServiceUrl(service: "metadata" | "auth" | "collections" | "loader", href: unknown, expectedPath: string, origin: string | undefined): string | undefined {
  if (!origin || href !== `${origin}${expectedPath}`) return undefined;
  if (isHostedBuild()) return href as string;
  const route = gridServiceProxyRoutes({ metadata: import.meta.env.VITE_GRID_METADATA_ORIGIN,
    auth: import.meta.env.VITE_GRID_AUTH_ORIGIN, loader: import.meta.env.VITE_GRID_LOADER_ORIGIN }).find(route => route.service === service && route.origin === origin);
  if (route?.prefix === `/grid-test-${service}`) return href as string;
  return route ? `${route.prefix}${expectedPath}` : undefined;
}