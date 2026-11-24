export function addressableLabel(label: string): boolean {
  return label.trim().length > 0 && label !== "." && label !== "..";
}

export function isLabelRemovalRequest(method: string | undefined, path: string | undefined): boolean {
  const match = /^\/metadata\/[a-zA-Z0-9_-]+\/labels\/([a-zA-Z0-9_*.+%-]+)$/.exec(path ?? "");
  if (method !== "DELETE" || !match) return false;
  try {
    const label = decodeURIComponent(match[1].replace(/\+/g, " "));
    return addressableLabel(label);
  } catch { return false; }
}

export function isLabelAddRequest(method: string | undefined, path: string | undefined): boolean {
  return method === "POST" && /^\/metadata\/[a-zA-Z0-9_-]+\/labels$/.test(path ?? "");
}

export function isMetadataUpdateRequest(method: string | undefined, path: string | undefined): boolean {
  return method === "PUT" && /^\/metadata\/[a-zA-Z0-9_-]+\/metadata$/.test(path ?? "");
}

export function isPhotoshootRequest(method: string | undefined, path: string | undefined): boolean {
  return (method === "PUT" || method === "DELETE") && /^\/metadata\/[a-zA-Z0-9_-]+\/photoshoot$/.test(path ?? "");
}

export function isUsageRightsRequest(method: string | undefined, path: string | undefined): boolean {
  return method === "PUT" && /^\/metadata\/[a-zA-Z0-9_-]+\/usage-rights$/.test(path ?? "")
    || method === "POST" && /^\/metadata\/[a-zA-Z0-9_-]+\/metadata\/set-from-usage-rights$/.test(path ?? "");
}

export function serviceOrigin(value: unknown, allowLocalHttp = false): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    const localHttp = allowLocalHttp && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.username || url.password
      || url.search || url.hash || url.pathname !== "/" || (value !== url.origin && value !== `${url.origin}/`)) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function isLoaderRequest(method: string | undefined, path: string | undefined): boolean {
  return method === "GET" ? path === "/" || /^\/uploadStatus\/[a-f0-9]{40}$/.test(path ?? "")
    : method === "POST" && (path === "/prepare" || /^\/images\?filename=[^&]+$/.test(path ?? "")
      || /^\/uploadStatus\/[a-f0-9]{40}$/.test(path ?? ""));
}

export function isLeaseRequest(method: string | undefined, path: string | undefined): boolean {
  if (path === "/") return method === "GET";
  if (path === "/leases") return method === "POST";
  if (/^\/leases\/media\/[a-zA-Z0-9_-]+$/.test(path ?? "")) return ["GET", "PUT", "DELETE"].includes(method ?? "");
  return method === "DELETE" && /^\/leases\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(path ?? "");
}

export function gridServiceProxyRoutes(configured: { metadata?: string; auth?: string; loader?: string; leases?: string } = {}) {
  const routes: { service: "metadata" | "auth" | "collections" | "loader" | "leases"; prefix: string; origin: string }[] = [];
  for (const environment of ["local", "test"]) {
    for (const service of ["metadata", "auth", "loader", "leases"] as const) {
      const hostname = service === "loader" ? "loader.media" : `media-${service}`;
      routes.push({ service, prefix: `/grid-${environment}-${service}`,
        origin: `https://${hostname}.${environment}.dev-gutools.co.uk` });
    }
  }
  routes.push({ service: "collections", prefix: "/grid-local-collections",
    origin: "https://media-collections.local.dev-gutools.co.uk" });
  for (const service of ["metadata", "auth", "loader", "leases"] as const) {
    const origin = serviceOrigin(configured[service], true);
    if (origin) routes.push({ service, prefix: `/grid-${service}`, origin });
  }
  return routes;
}