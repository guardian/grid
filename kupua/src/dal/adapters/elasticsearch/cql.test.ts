/**
 * Tests for parseCql — specifically the is: path via buildIsQuery.
 *
 * parseCql is pure (no network, no React) so no mocking needed.
 * gridConfig is imported as a static object; its values are the ones
 * in grid-config.ts (staffPhotographerOrganisation: "GNM", hasAgencyPicks: true).
 */

import { describe, it, expect } from "vitest";
import { parseCql } from "./cql";
import { gridConfig } from "@/lib/grid-config";

describe("parseCql — is: queries", () => {
  it("is:deleted → exists on softDeletedMetadata", () => {
    const { must } = parseCql("is:deleted");
    expect(must[0]).toEqual({ exists: { field: "softDeletedMetadata" } });
  });

  it("is:gnm-owned → terms on WHOLLY_OWNED_CATEGORIES", () => {
    const { must } = parseCql("is:gnm-owned");
    const q = must[0] as { terms: { "usageRights.category": string[] } };
    expect(q.terms["usageRights.category"]).toHaveLength(6); // 3 photo + 3 illustration
  });

  it("is:gnm-owned-photo → terms with photographer categories only", () => {
    const { must } = parseCql("is:gnm-owned-photo");
    const q = must[0] as { terms: { "usageRights.category": string[] } };
    expect(q.terms["usageRights.category"]).toEqual([
      "staff-photographer",
      "contract-photographer",
      "commissioned-photographer",
    ]);
  });

  it("is:under-quota → match_all when no over-quota suppliers", () => {
    // quota-store returns [] in test environment (no cost data loaded)
    const { must } = parseCql("is:under-quota");
    expect(must[0]).toEqual({ match_all: {} });
  });

  it("is:nonsense → match_none", () => {
    const { must } = parseCql("is:nonsense");
    expect(must[0]).toEqual({ match_none: {} });
  });

  describe("is:agency-pick", () => {
    it("produces a bool.should query", () => {
      const { must } = parseCql("is:agency-pick");
      const q = must[0] as { bool: { should: unknown[]; minimum_should_match: number } };
      expect(q.bool).toBeDefined();
      expect(q.bool.minimum_should_match).toBe(1);
    });

    it("number of should clauses equals total values across all agencyPicksIngredients fields", () => {
      const expectedCount = Object.values(gridConfig.agencyPicksIngredients)
        .reduce((sum, vals) => sum + vals.length, 0);
      expect(expectedCount).toBe(17); // 7 description + 8 keywords + 2 title

      const { must } = parseCql("is:agency-pick");
      const q = must[0] as { bool: { should: unknown[] } };
      expect(q.bool.should).toHaveLength(17);
    });

    it("each should clause is { match_phrase: { [field]: value } }", () => {
      const { must } = parseCql("is:agency-pick");
      const q = must[0] as { bool: { should: Array<{ match_phrase: Record<string, string> }> } };
      for (const clause of q.bool.should) {
        expect(clause).toHaveProperty("match_phrase");
        const entries = Object.entries(clause.match_phrase);
        expect(entries).toHaveLength(1);
        const [field, value] = entries[0];
        expect(typeof field).toBe("string");
        expect(typeof value).toBe("string");
      }
    });

    it("should clauses cover all fields in agencyPicksIngredients", () => {
      const { must } = parseCql("is:agency-pick");
      const q = must[0] as { bool: { should: Array<{ match_phrase: Record<string, string> }> } };
      const fieldsSeen = new Set(q.bool.should.map((c) => Object.keys(c.match_phrase)[0]));
      expect(fieldsSeen).toEqual(new Set(Object.keys(gridConfig.agencyPicksIngredients)));
    });

    it("-is:agency-pick wraps the query in mustNot", () => {
      const { must, mustNot } = parseCql("-is:agency-pick");
      expect(must).toHaveLength(0);
      expect(mustNot).toHaveLength(1);
      const q = mustNot[0] as { bool: { should: unknown[] } };
      expect(q.bool.should).toHaveLength(17);
    });
  });
});
