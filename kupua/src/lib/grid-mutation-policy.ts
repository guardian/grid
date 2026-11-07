export interface MutationRollout {
  enabled: boolean;
  operations: ("add-labels" | "remove-label")[];
}

export function parseMutationRollout(value: unknown): MutationRollout | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.enabled !== "boolean" || !Array.isArray(raw.operations)
    || !raw.operations.every((operation) => operation === "add-labels" || operation === "remove-label")) return undefined;
  return { enabled: raw.enabled, operations: raw.operations as MutationRollout["operations"] };
}

export function mutationRolloutFromEnv(env: Record<string, string | undefined>): MutationRollout | undefined {
  if (env.VITE_GRID_API_WRITES_ENABLED !== "true" && env.VITE_GRID_API_WRITES_ENABLED !== "false") return undefined;
  return parseMutationRollout({
    enabled: env.VITE_GRID_API_WRITES_ENABLED === "true",
    operations: env.VITE_GRID_API_OPERATIONS?.split(","),
  });
}

export function admitsLabelAdd(rollout: MutationRollout | undefined): boolean {
  return rollout?.enabled === true && rollout.operations.includes("add-labels");
}

export function admitsLabelRemoval(rollout: MutationRollout | undefined): boolean {
  return rollout?.enabled === true && rollout.operations.includes("remove-label");
}

export function isLabelRemovalRequest(method: string | undefined, path: string | undefined): boolean {
  const match = /^\/metadata\/[a-zA-Z0-9_-]+\/labels\/([a-zA-Z0-9_*.+%-]+)$/.exec(path ?? "");
  if (method !== "DELETE" || !match) return false;
  try {
    const label = decodeURIComponent(match[1].replace(/\+/g, " "));
    return label.trim().length > 0 && label !== "." && label !== "..";
  } catch { return false; }
}

export function isLabelAddRequest(method: string | undefined, path: string | undefined): boolean {
  return method === "POST" && /^\/metadata\/[a-zA-Z0-9_-]+\/labels$/.test(path ?? "");
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