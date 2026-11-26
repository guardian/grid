export function addressableLabel(label: string): boolean {
  return label.trim().length > 0 && label !== "." && label !== "..";
}

function* labelTokens(input: string) {
  let start = 0;
  for (let index = 0; index <= input.length; index++) {
    if (input[index] === "\\" && (input[index + 1] === "," || input[index + 1] === "\\")) { index++; continue; }
    if (index === input.length || input[index] === ",") { yield { start, end: index }; start = index + 1; }
  }
}
const decodeLabel = (text: string) => text.replace(/\\([,\\])/g, "$1");
export function parseLabelEntry(input: string): string[] {
  return [...new Set(Array.from(labelTokens(input), ({ start, end }) => decodeLabel(input.slice(start, end)).trim()).filter(Boolean))];
}
export function labelEntryToken(input: string, caret: number) {
  for (const token of labelTokens(input)) if (caret <= token.end) return { ...token, prefix: decodeLabel(input.slice(token.start, caret)).trimStart() };
  return { start: input.length, end: input.length, prefix: "" };
}
export function replaceLabelToken(input: string, { start, end }: { start: number; end: number }, literal: string) {
  const token = input.slice(start, end);
  const replacement = (token.match(/^\s*/)?.[0] ?? "") + literal.replace(/[,\\]/g, "\\$&");
  return { value: input.slice(0, start) + replacement + (token.trim() ? token.match(/\s*$/)?.[0] ?? "" : "") + input.slice(end), caret: start + replacement.length };
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

export function isArchiveRequest(method: string | undefined, path: string | undefined): boolean {
  return method === "PUT" && /^\/metadata\/[a-zA-Z0-9_-]+\/archived$/.test(path ?? "");
}

export function isPhotoshootRequest(method: string | undefined, path: string | undefined): boolean {
  return (method === "PUT" || method === "DELETE") && /^\/metadata\/[a-zA-Z0-9_-]+\/photoshoot$/.test(path ?? "");
}

export function isCollectionMembershipRequest(method: string | undefined, path: string | undefined): boolean {
  if (method === "GET" || method === "POST") return /^\/images\/[a-zA-Z0-9_-]+$/.test(path ?? "");
  const match = /^\/images\/[a-zA-Z0-9_-]+\/([a-zA-Z0-9_.*%/-]+)$/.exec(path ?? "");
  if (method !== "DELETE" || !match) return false;
  try {
    return match[1].split("/").every(bit => {
      const decoded = decodeURIComponent(bit);
      return !!decoded && decoded !== "." && decoded !== ".." && !/[\/\\"\u0000-\u001f]/.test(decoded);
    });
  } catch { return false; }
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
  const routes: { service: "metadata" | "auth" | "collections" | "loader" | "leases" | "cropper"; prefix: string; origin: string }[] = [];
  for (const environment of ["local", "test"]) {
    for (const service of ["metadata", "auth", "loader", "leases"] as const) {
      const hostname = service === "loader" ? "loader.media" : `media-${service}`;
      routes.push({ service, prefix: `/grid-${environment}-${service}`,
        origin: `https://${hostname}.${environment}.dev-gutools.co.uk` });
    }
  }
  routes.push({ service: "collections", prefix: "/grid-local-collections",
    origin: "https://media-collections.local.dev-gutools.co.uk" });
  routes.push({ service: "cropper", prefix: "/grid-local-cropper",
    origin: "https://cropper.media.local.dev-gutools.co.uk" });
  for (const service of ["metadata", "auth", "loader", "leases"] as const) {
    const origin = serviceOrigin(configured[service], true);
    if (origin) routes.push({ service, prefix: `/grid-${service}`, origin });
  }
  return routes;
}