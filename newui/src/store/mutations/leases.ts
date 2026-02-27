/**
 * Register lease mutations with the mutation registry.
 *
 * This module is imported by the store setup so that registrations happen
 * before any component can dispatch a batch update.
 *
 * Lease operations:
 *   - `lease.delete` — value is `{ leaseId: string }`
 *   - `lease.create` — value is the lease creation params (Omit<Lease, 'id' | …>),
 *     returns `{ leaseId: string }` from the API so the pollFn checks for
 *     its presence.
 */

import { registerMutation } from '../mutationRegistry';
import type { ImageData, Lease } from '@/types/api';
import { fetchImageById } from '@/api/images';
import { createLease, deleteLease } from '@/api/leases';

// ---- Delete lease -------------------------------------------------------

const deleteLeaseState = {
  lastFetchedData: undefined as ImageData | undefined,
};

registerMutation('lease.delete', {
  mutateFn: async (_imageId: string, value: unknown) => {
    const { leaseId } = value as { leaseId: string };
    await deleteLease(leaseId);
  },

  pollFn: async (imageId: string, value: unknown) => {
    const { leaseId } = value as { leaseId: string };
    const response = await fetchImageById(imageId);
    deleteLeaseState.lastFetchedData = response.data;
    return !response.data.leases.data.leases.some((l) => l.id === leaseId);
  },

  getLastFetchedData: () => deleteLeaseState.lastFetchedData,

  pollingConfig: {
    strategy: 'exponential',
    initialIntervalMs: 500,
    maxAttempts: 12,
    backoffMultiplier: 1.5,
    maxIntervalMs: 8_000,
  },

  cascades: [],
});

// ---- Create lease -------------------------------------------------------

const createLeaseState = {
  lastFetchedData: undefined as ImageData | undefined,
  /** Stash the leaseId returned by the API so we can poll for it */
  createdLeaseId: undefined as string | undefined,
};

registerMutation('lease.create', {
  mutateFn: async (_imageId: string, value: unknown) => {
    const params = value as Omit<Lease, 'id' | 'createdAt' | 'leasedBy'>;
    const { leaseId } = await createLease(params);
    // Stash the ID so the pollFn can look for it
    createLeaseState.createdLeaseId = leaseId;
  },

  pollFn: async (imageId: string) => {
    const leaseId = createLeaseState.createdLeaseId;
    if (!leaseId) return false;
    const response = await fetchImageById(imageId);
    createLeaseState.lastFetchedData = response.data;
    return response.data.leases.data.leases.some((l) => l.id === leaseId);
  },

  getLastFetchedData: () => createLeaseState.lastFetchedData,

  pollingConfig: {
    strategy: 'exponential',
    initialIntervalMs: 500,
    maxAttempts: 12,
    backoffMultiplier: 1.5,
    maxIntervalMs: 8_000,
  },

  cascades: [],
});
