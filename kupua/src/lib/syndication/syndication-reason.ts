/**
 * syndicationReason — human-readable tooltip strings for syndicationStatus values.
 *
 * Mirrors Kahuna's gr-syndication-icon tooltip text. Used by the grid thumbnail
 * badge (SY-4) and any other surface that needs a user-facing description.
 */

import type { SyndicationStatus } from "@/dal/grid-api/types";

const SYNDICATION_REASONS: Record<SyndicationStatus, string> = {
  sent: "Image has been sent for syndication",
  queued: "Image will soon be sent for syndication",
  blocked: "Image will not be sent for syndication",
  review: "Image is awaiting editorial review",
  unsuitable: "Image is not suitable for syndication",
};

/**
 * Return the human-readable reason string for a syndication status.
 * Used as tooltip text on the syndication badge.
 */
export function syndicationReason(status: SyndicationStatus): string {
  return SYNDICATION_REASONS[status];
}
