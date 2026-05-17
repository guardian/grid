import { describe, it, expect } from "vitest";
import {
  calculateSyndicationStatus,
  isLeaseActive,
} from "./calculate-syndication-status";
import type { Image } from "@/types/image";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const NOW = 1_747_584_000_000; // 2026-05-18T16:00:00.000Z — stable epoch for tests

function makeImage(
  overrides: Partial<Pick<Image, "syndicationRights" | "leases" | "usages">>,
): Pick<Image, "syndicationRights" | "leases" | "usages"> {
  return {
    syndicationRights: undefined,
    leases: undefined,
    usages: undefined,
    ...overrides,
  };
}

const RIGHTS_ACQUIRED = { rights: [{ acquired: true }] };
const RIGHTS_NOT_ACQUIRED = { rights: [{ acquired: false }] };

function allowSyndicationLease(overrides?: Partial<Image["leases"]>["leases"] extends (infer L)[] | undefined ? Partial<L> : never) {
  return {
    id: "l1",
    access: "allow-syndication" as const,
    ...overrides,
  };
}

function denySyndicationLease(overrides?: Partial<Image["leases"]>["leases"] extends (infer L)[] | undefined ? Partial<L> : never) {
  return {
    id: "l2",
    access: "deny-syndication" as const,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isLeaseActive
// ---------------------------------------------------------------------------

describe("isLeaseActive", () => {
  it("returns true when no startDate and no endDate", () => {
    expect(isLeaseActive({ id: "l", access: "allow-syndication" }, NOW)).toBe(true);
  });

  it("returns true when startDate is in the past", () => {
    const past = new Date(NOW - 1000).toISOString();
    expect(isLeaseActive({ id: "l", access: "allow-syndication", startDate: past }, NOW)).toBe(true);
  });

  it("returns false when startDate is in the future", () => {
    const future = new Date(NOW + 1000).toISOString();
    expect(isLeaseActive({ id: "l", access: "allow-syndication", startDate: future }, NOW)).toBe(false);
  });

  it("returns true when endDate is in the future", () => {
    const future = new Date(NOW + 1000).toISOString();
    expect(isLeaseActive({ id: "l", access: "deny-syndication", endDate: future }, NOW)).toBe(true);
  });

  it("returns false when endDate is in the past (EXPIRED — the correctness win over Kahuna)", () => {
    const past = new Date(NOW - 1000).toISOString();
    expect(isLeaseActive({ id: "l", access: "deny-syndication", endDate: past }, NOW)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// calculateSyndicationStatus — 8 required fixtures from 07-syndication-and-leases.md §4.1
// ---------------------------------------------------------------------------

describe("calculateSyndicationStatus", () => {
  // Fixture 1
  it("returns unsuitable when syndicationRights is undefined", () => {
    const image = makeImage({ syndicationRights: undefined });
    expect(calculateSyndicationStatus(image, NOW)).toBe("unsuitable");
  });

  // Fixture 2
  it("returns unsuitable when rights array is empty", () => {
    const image = makeImage({ syndicationRights: { rights: [] } });
    expect(calculateSyndicationStatus(image, NOW)).toBe("unsuitable");
  });

  // Fixture 3
  it("returns unsuitable when no right has acquired === true", () => {
    const image = makeImage({ syndicationRights: RIGHTS_NOT_ACQUIRED });
    expect(calculateSyndicationStatus(image, NOW)).toBe("unsuitable");
  });

  // Fixture 4
  it("returns review when rights acquired + no leases + no syndication usage", () => {
    const image = makeImage({ syndicationRights: RIGHTS_ACQUIRED });
    expect(calculateSyndicationStatus(image, NOW)).toBe("review");
  });

  // Fixture 5
  it("returns queued when rights acquired + active allow-syndication lease", () => {
    const image = makeImage({
      syndicationRights: RIGHTS_ACQUIRED,
      leases: { leases: [allowSyndicationLease()] },
    });
    expect(calculateSyndicationStatus(image, NOW)).toBe("queued");
  });

  // Fixture 6
  it("returns blocked when rights acquired + active deny-syndication lease", () => {
    const image = makeImage({
      syndicationRights: RIGHTS_ACQUIRED,
      leases: { leases: [denySyndicationLease()] },
    });
    expect(calculateSyndicationStatus(image, NOW)).toBe("blocked");
  });

  // Fixture 7 — the §4.4 correctness win over Kahuna/media-api display
  it("returns review when rights acquired + EXPIRED deny-syndication lease (not blocked)", () => {
    const expiredEnd = new Date(NOW - 60_000).toISOString(); // expired 1 min ago
    const image = makeImage({
      syndicationRights: RIGHTS_ACQUIRED,
      leases: { leases: [denySyndicationLease({ endDate: expiredEnd })] },
    });
    // Kahuna would show "blocked" (trusts stale active snapshot).
    // Kupua correctly computes "review" because the lease is expired.
    expect(calculateSyndicationStatus(image, NOW)).toBe("review");
  });

  // Fixture 8
  it("returns sent when rights acquired + syndication usage on usages[].platform", () => {
    const image = makeImage({
      syndicationRights: RIGHTS_ACQUIRED,
      usages: [{ id: "u1", platform: "syndication", status: "published" }],
    });
    expect(calculateSyndicationStatus(image, NOW)).toBe("sent");
  });

  // Additional edge-case: sent takes priority over leases
  it("returns sent even when there is also an active allow-syndication lease", () => {
    const image = makeImage({
      syndicationRights: RIGHTS_ACQUIRED,
      leases: { leases: [allowSyndicationLease()] },
      usages: [{ id: "u1", platform: "syndication", status: "published" }],
    });
    expect(calculateSyndicationStatus(image, NOW)).toBe("sent");
  });

  // blocked wins over allow-syndication when both exist
  it("returns blocked when active deny-syndication coexists with active allow-syndication", () => {
    const image = makeImage({
      syndicationRights: RIGHTS_ACQUIRED,
      leases: {
        leases: [allowSyndicationLease(), denySyndicationLease()],
      },
    });
    expect(calculateSyndicationStatus(image, NOW)).toBe("blocked");
  });
});
