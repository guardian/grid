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
  return `${resolveMediaApiBaseUrl(configuredBaseUrl)}${path}`;
}

export function shouldEnableDirectBedrockProxy(useMediaApi: string | undefined, isVitest = false): boolean {
  return useMediaApi !== "true" && !isVitest;
}