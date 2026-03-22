/**
 * Zod schema for URL search params.
 *
 * This is the single source of truth for which search params are synced to the URL.
 * Pagination params (offset, length, countAll) are deliberately excluded — they're
 * managed internally by the search store and not meaningful in a shared URL.
 */

import { z } from "zod";

export const searchParamsSchema = z.object({
  /** Free-text / CQL query */
  query: z.string().optional().catch(undefined),
  /** Comma-separated image IDs */
  ids: z.string().optional().catch(undefined),
  /** Upload time range — ISO date strings */
  since: z.string().optional().catch(undefined),
  until: z.string().optional().catch(undefined),
  /** When "true", include paid/non-free images. Absent = free only. */
  nonFree: z.string().optional().catch(undefined),
  /** Pay type filter */
  payType: z.string().optional().catch(undefined),
  /** Filter by uploader email */
  uploadedBy: z.string().optional().catch(undefined),
  /** Sort order */
  orderBy: z.string().optional().catch(undefined),
  /** Enable AI/semantic search */
  useAISearch: z.string().optional().catch(undefined),
  /** Which date field the date range applies to */
  dateField: z.string().optional().catch(undefined),
  /** Date taken range */
  takenSince: z.string().optional().catch(undefined),
  takenUntil: z.string().optional().catch(undefined),
  /** Last modified range */
  modifiedSince: z.string().optional().catch(undefined),
  modifiedUntil: z.string().optional().catch(undefined),
  /** Has acquired syndication rights */
  hasRightsAcquired: z.string().optional().catch(undefined),
  /** Has crops/exports */
  hasCrops: z.string().optional().catch(undefined),
  /** Syndication status filter */
  syndicationStatus: z.string().optional().catch(undefined),
  /** Is persisted */
  persisted: z.string().optional().catch(undefined),
});

export type UrlSearchParams = z.infer<typeof searchParamsSchema>;

/**
 * Keys that are synced to the URL.
 * Used to strip undefined values before navigating.
 */
export const URL_PARAM_KEYS = Object.keys(
  searchParamsSchema.shape
) as (keyof UrlSearchParams)[];

