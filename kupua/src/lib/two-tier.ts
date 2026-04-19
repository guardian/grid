import { SCROLL_MODE_THRESHOLD, POSITION_MAP_THRESHOLD } from "@/constants/tuning";

/**
 * Check whether two-tier virtualisation is active for a given total.
 *
 * Two-tier mode activates when the result set is large enough to need seek-mode
 * scrubber behaviour but small enough for a full position map. The virtualizer
 * spans all `total` items (global indices) instead of just the buffer.
 */
export function isTwoTierFromTotal(total: number): boolean {
  return POSITION_MAP_THRESHOLD > 0 &&
    total > SCROLL_MODE_THRESHOLD &&
    total <= POSITION_MAP_THRESHOLD;
}
