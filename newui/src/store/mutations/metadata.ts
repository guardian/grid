/**
 * Register metadata-field mutations with the mutation registry.
 *
 * This module is imported by the store setup so that registrations happen
 * before any component can dispatch a batch update.
 */

import { registerMutation } from '../mutationRegistry';
import type { ImageData, ImageMetadata } from '@/types/api';
import { fetchImageById, putMetadataField } from '@/api/images';

// ---- Helpers ------------------------------------------------------------

/**
 * Creates a paired mutateFn / pollFn / getLastFetchedData for a simple
 * string metadata field (e.g. title, description, credit …).
 *
 * The pollFn stashes the latest fetched ImageData so the listener can
 * update the store without an extra fetch.
 */
function createMetadataFieldMutation(field: keyof ImageMetadata) {
  let lastFetchedData: ImageData | undefined;

  return {
    mutateFn: async (imageId: string, value: unknown) => {
      await putMetadataField(imageId, field, value as string);
    },

    pollFn: async (imageId: string, value: unknown) => {
      const response = await fetchImageById(imageId);
      lastFetchedData = response.data;
      const current = response.data.metadata[field];
      return current === (value as string);
    },

    getLastFetchedData: () => lastFetchedData,
  };
}

// ---- Registrations ------------------------------------------------------

const editableMetadataFields: Array<keyof ImageMetadata> = [
  'title',
  'description',
  'credit',
  'byline',
  'copyright',
  'specialInstructions',
];

for (const field of editableMetadataFields) {
  const { mutateFn, pollFn, getLastFetchedData } =
    createMetadataFieldMutation(field);

  registerMutation(`metadata.${field}`, {
    mutateFn,
    pollFn,
    getLastFetchedData,
    pollingConfig: {
      strategy: 'exponential',
      initialIntervalMs: 500,
      maxAttempts: 12,
      backoffMultiplier: 1.5,
      maxIntervalMs: 8_000,
    },
    cascades: [],
  });
}
