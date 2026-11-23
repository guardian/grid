/**
 * Leases on disposable image copies (see seed-image.ts), added and removed through the leases
 * service as Kahuna does. The service stores them and notifies thrall, which copies them into
 * the image's Elasticsearch document for media-api to serve, so each call waits for media-api.
 *
 * The leases service records the caller as `leasedBy`, so seeded leases are leased by the
 * API key's name, SEEDED_LEASED_BY.
 */
import { API_KEY, MEDIA_API_PORT, SERVICE_CONFIGS } from './constants.ts';

const LEASES_URL = `http://localhost:${SERVICE_CONFIGS.leases.port}`;
const MEDIA_API_URL = `http://localhost:${MEDIA_API_PORT}`;
const HEADERS = { 'X-Gu-Media-Key': API_KEY };
/** The name of the API key in the KeyBucket (see provision.ts). */
export const SEEDED_LEASED_BY = 'DEV Key';

export const LEASE_ACCESS = ['allow-use', 'deny-use', 'allow-syndication', 'deny-syndication'] as const;
export type LeaseAccess = (typeof LEASE_ACCESS)[number];

/** A lease to seed. Dates are ISO-8601 strings; omitted fields are stored as absent. */
export interface SeedLease {
  access: LeaseAccess;
  startDate?: string;
  endDate?: string;
  notes?: string;
  createdAt?: string;
}

/** A lease as media-api serves it. */
export interface MediaLease extends SeedLease {
  id: string;
  mediaId: string;
  leasedBy: string;
  createdAt: string;
  active: boolean;
}

export function isLeaseAccess(access: string): access is LeaseAccess {
  return (LEASE_ACCESS as readonly string[]).includes(access);
}

/** The leases media-api serves for `mediaId`. */
export async function imageLeases(mediaId: string): Promise<MediaLease[]> {
  const response = await fetch(`${MEDIA_API_URL}/images/${mediaId}`, { headers: HEADERS });
  if (!response.ok) {
    throw new Error(`Fetching image ${mediaId} failed: HTTP ${response.status} ${await response.text()}`);
  }
  const { data } = (await response.json()) as { data: { leases: { data: { leases: MediaLease[] } } } };
  return data.leases.data.leases;
}

/** Poll media-api until thrall has given `mediaId` `count` leases. */
async function waitForLeaseCount(mediaId: string, count: number): Promise<MediaLease[]> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const leases = await imageLeases(mediaId);
    if (leases.length === count) return leases;
    if (Date.now() > deadline) {
      throw new Error(`Image ${mediaId} has ${leases.length} leases after 10s, expected ${count}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function leasesRequest(method: 'POST' | 'DELETE', mediaId: string, body?: unknown): Promise<void> {
  const response = await fetch(`${LEASES_URL}/leases/media/${mediaId}`, {
    method,
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status !== 202) {
    throw new Error(`${method} leases for ${mediaId} failed: HTTP ${response.status} ${await response.text()}`);
  }
}

/**
 * Add `leases` to a fresh image copy `mediaId` (which starts with none), and return them as
 * media-api serves them, once it does.
 */
export async function seedLeases(mediaId: string, leases: SeedLease[]): Promise<MediaLease[]> {
  if (leases.length === 0) return [];
  // The service requires createdAt, as Kahuna always sends it.
  const createdAt = new Date().toISOString();
  await leasesRequest('POST', mediaId, leases.map((lease) => ({ createdAt, ...lease, mediaId })));
  return waitForLeaseCount(mediaId, leases.length);
}

/**
 * Remove every lease on `mediaId`, including any a scenario added, and wait for media-api to
 * show none: thrall warns if the removal reaches an image copy that has already been deleted.
 */
export async function removeLeases(mediaId: string): Promise<void> {
  const response = await fetch(`${LEASES_URL}/leases/media/${mediaId}`, { headers: HEADERS });
  if (!response.ok) {
    throw new Error(`Fetching leases for ${mediaId} failed: HTTP ${response.status} ${await response.text()}`);
  }
  const { data } = (await response.json()) as { data: { leases: unknown[] } };
  if (data.leases.length === 0) return;
  await leasesRequest('DELETE', mediaId);
  await waitForLeaseCount(mediaId, 0);
}
