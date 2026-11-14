/**
 * Session-scoped Grid service discovery shared by search-route initialization
 * and API-mode AI capability detection. A failed root read leaves links unavailable
 * until reload; this module does not fetch image detail or runtime configuration.
 */

import { ServiceDiscovery } from "@/dal/grid-api/service-discovery";
import { z } from "zod";
import { gridServiceOrigin, gridServiceUrl } from "@/dal/grid-api/proxy-target";

const discovery = new ServiceDiscovery();
const sessionPermissionsSchema = z.object({
  showPaid: z.boolean().optional(),
  canUpload: z.boolean().optional(),
  canDelete: z.boolean().optional(),
});
const sessionSchema = z.object({ data: z.object({ user: z.object({ permissions: sessionPermissionsSchema }) }) });

export type GridSessionPermissions = z.infer<typeof sessionPermissionsSchema>;

let sessionPermissionsRead: Promise<GridSessionPermissions | null> | undefined;
let sessionInvalidated = false;
const sessionInvalidationListeners = new Set<() => void>();

export function invalidateGridSession(): void {
  if (sessionInvalidated) return;
  sessionInvalidated = true;
  sessionPermissionsRead = Promise.resolve(null);
  for (const listener of sessionInvalidationListeners) listener();
}

export function subscribeGridSessionInvalidation(listener: () => void): () => void {
  sessionInvalidationListeners.add(listener);
  return () => { sessionInvalidationListeners.delete(listener); };
}

export function isGridSessionInvalidated(): boolean {
  return sessionInvalidated;
}

/**
 * Initialise the Grid API service discovery.
 * Safe to call multiple times — every caller awaits the same root read.
 */
export async function initGridApi(signal?: AbortSignal): Promise<void> {
  await discovery.init(signal);
}

/**
 * Whether media-api advertises text AI search (the root `ai-search` relation). Waits for the
 * shared root read; a failed root reads as unavailable for the session.
 */
export async function apiAiSearchAvailable(): Promise<boolean> {
  return (await discovery.init()) && discovery.getLink("ai-search") !== undefined;
}

/** A media-api root relation's href, waiting for the shared root read; undefined when absent. */
export async function serviceLink(rel: string): Promise<string | undefined> {
  return (await discovery.init()) ? discovery.getLink(rel) : undefined;
}

export async function getGridServiceOrigin(service: "metadata" | "auth" | "loader"): Promise<string | undefined> {
  return gridServiceOrigin(await serviceLink(service === "metadata" ? "edits" : service === "loader" ? "loader" : "session"), service === "auth" ? "/session" : "/");
}

export function getGridSessionPermissions(): Promise<GridSessionPermissions | null> {
  if (import.meta.env.VITE_USE_MEDIA_API !== "true" || sessionInvalidated) return Promise.resolve(null);
  return sessionPermissionsRead ??= readSessionPermissions();
}

async function readSessionPermissions(): Promise<GridSessionPermissions | null> {
  try {
    const origin = await getGridServiceOrigin("auth");
    const href = await serviceLink("session");
    const url = gridServiceUrl("auth", href, "/session", origin);
    if (!url || sessionInvalidated) return null;
    const response = await fetch(url, { credentials: "include", redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (response.status === 401 || response.status === 419) invalidateGridSession();
    if (!response.ok) return null;
    const session = sessionSchema.safeParse(await response.json());
    return session.success && !sessionInvalidated ? session.data.data.user.permissions : null;
  } catch {
    return null;
  }
}
