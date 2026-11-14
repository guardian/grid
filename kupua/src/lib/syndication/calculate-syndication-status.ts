/**
 * calculateSyndicationStatus — TypeScript port of media-api's Image.scala#syndicationStatus.
 *
 * Display logic only. Mirrors Image.scala's `syndicationStatus` priority order
 * (unsuitable → sent → queued → blocked → review) but deliberately departs in two ways:
 * (a) Lease-active checks are date-based via `isLeaseActive` rather than trusting the stale
 *     ES `active` snapshot (see §4.4 and deviations.md). (b) Gates that only apply to the
 *     ES search filter path — `syndicationRights.published <= now` and `syndicatableCategory`
 *     — are NOT applied here. See deviations.md §"syndicationStatus display matches Kahuna's
 *     `Image.scala`" for rationale.
 *
 * The one place we deliberately depart from Kahuna's display: date-based
 * isLeaseActive() rather than trusting the `active` snapshot stored in ES.
 * ES's `active` field is set at index time and can become stale (a deny-syndication
 * lease with an expired endDate still shows as "blocked" forever if nobody touches
 * the image's leases again). See deviations.md §4.4 and 07-syndication-and-leases.md §4.1.
 *
 * Performance: hoist `Date.now()` per derivation batch — NOT per lease. The caller
 * (deriveImage) passes `nowMs` so a page of 200 images shares one Date.now() call.
 * Each lease check is integer arithmetic only (no new Date inside the loop).
 */

import type { SyndicationStatus } from "@/dal/grid-api/types";
import type { Image } from "@/types/image";

// ---------------------------------------------------------------------------
// Lease-active helper
// ---------------------------------------------------------------------------

type Lease = NonNullable<NonNullable<Image["leases"]>["leases"]>[number];

/**
 * Determine whether a lease is currently active based on startDate/endDate.
 *
 * Does NOT trust the `active` snapshot stored in ES — it can be stale.
 * Deviates from Kahuna/media-api's Image.scala existence-only check.
 * See 07-syndication-and-leases.md §3.2.1 and deviations.md.
 *
 * @param lease  The lease to evaluate.
 * @param nowMs  Current epoch ms — caller should hoist Date.now() per batch.
 */
export function isLeaseActive(lease: Lease, nowMs: number): boolean {
  const started = !lease.startDate || new Date(lease.startDate).getTime() <= nowMs;
  const notExpired = !lease.endDate || new Date(lease.endDate).getTime() >= nowMs;
  return started && notExpired;
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

/**
 * Compute the syndicationStatus for display purposes.
 *
 * Logic mirrors Image.scala#syndicationStatus (lines 44–67):
 *
 *   1. No syndicationRights OR no rights[].acquired → unsuitable
 *   2. Has a syndication usage (platform === "syndication") → sent
 *   3. Has active allow-syndication AND no active deny-syndication → queued
 *   4. Has active deny-syndication → blocked
 *   5. Otherwise → review
 *
 * @param image  The raw ES Image document.
 * @param nowMs  Current epoch ms (hoist Date.now() per derivation batch).
 */
export function calculateSyndicationStatus(
  image: Pick<Image, "syndicationRights" | "leases" | "usages">,
  nowMs: number,
): SyndicationStatus {
  // 1. No rights or no acquired rights → unsuitable
  const rights = image.syndicationRights?.rights;
  if (!rights || !rights.some((r) => r.acquired === true)) {
    return "unsuitable";
  }

  // 2. Has a syndication usage → sent
  const usages = image.usages ?? [];
  if (usages.some((u) => u.platform === "syndication")) {
    return "sent";
  }

  const leases = image.leases?.leases ?? [];
  const hasActiveAllowSyndication = leases.some(
    (l) => l.access === "allow-syndication" && isLeaseActive(l, nowMs),
  );
  const hasActiveDenySyndication = leases.some(
    (l) => l.access === "deny-syndication" && isLeaseActive(l, nowMs),
  );

  // 3. Active allow-syndication, no active deny-syndication → queued
  if (hasActiveAllowSyndication && !hasActiveDenySyndication) {
    return "queued";
  }

  // 4. Active deny-syndication → blocked
  if (hasActiveDenySyndication) {
    return "blocked";
  }

  // 5. Rights acquired, no blocking/queuing lease, no syndication usage → review
  return "review";
}
