/**
 * Tests for parseCql — specifically the is: path via buildIsQuery.
 *
 * parseCql is pure (no network, no React) so no mocking needed.
 * gridConfig is imported as a static object; its values are the ones
 * in grid-config.ts (staffPhotographerOrganisation: "GNM", hasAgencyPicks: true).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseCql, parseCqlWithDefaults } from "./cql";
import { gridConfig } from "@/lib/grid-config";

describe("configured has-field aliases", () => {
  const originalAliases = [...gridConfig.fieldAliases];
  const aliases = [
    { alias: "colourProfile", elasticsearchPath: "fileMetadata.icc.Synthetic Profile" },
    { alias: "credit", elasticsearchPath: "fileMetadata.synthetic.credit" },
    { alias: "syntheticNested", elasticsearchPath: "usages.platform" },
    { alias: "syntheticFlag", elasticsearchPath: "fileMetadata.synthetic.flag" },
  ];

  beforeEach(() => {
    gridConfig.fieldAliases.splice(0, gridConfig.fieldAliases.length, ...aliases.map((alias) => ({
      ...alias, label: alias.alias, displaySearchHint: false, displayInAdditionalMetadata: false,
    })));
  });
  afterEach(() => { gridConfig.fieldAliases.splice(0, gridConfig.fieldAliases.length, ...originalAliases); });

  it.each(aliases.flatMap((alias) => ["+", "-"].map((sign) => ({ ...alias, sign }))))(
    "$sign has:$alias resolves exactly like its quoted raw leaf",
    ({ alias, elasticsearchPath, sign }) => {
      const expected = { exists: { field: elasticsearchPath } };
      const result = parseCql(`${sign}has:${alias}`);
      expect(result).toEqual(parseCql(`${sign}has:${JSON.stringify(elasticsearchPath)}`));
      expect(result).toEqual({ must: sign === "+" ? [expected] : [], mustNot: sign === "-" ? [expected] : [] });
    },
  );

  it.each([
    ["crops", "exports"], ["city", "metadata.city"],
    ["photographer", "usageRights.photographer"], ["in", "in"],
    ["unknownSyntheticName", "unknownSyntheticName"],
    ["fileMetadata.xmp.synthetic:deep/leaf[1]", "fileMetadata.xmp.synthetic:deep/leaf[1]"],
  ])("preserves existing has:%s resolution", (name, path) => {
    expect(parseCql(`has:${JSON.stringify(name)}`)).toEqual({
      must: [{ exists: { field: path } }], mustNot: [],
    });
  });

  it("does not change scalar, multi-field or nested named-field translation", () => {
    const before = ["in:London", "photographer:Synthetic", "usages@platform:print"].map(parseCql);
    gridConfig.fieldAliases.splice(0);
    expect(["in:London", "photographer:Synthetic", "usages@platform:print"].map(parseCql)).toEqual(before);
  });
});

describe("parseCql — is: queries", () => {
  it("is:deleted → exists on softDeletedMetadata", () => {
    const { must } = parseCql("is:deleted");
    expect(must[0]).toEqual({ exists: { field: "softDeletedMetadata" } });
  });

  it("is:gnm-owned → terms on WHOLLY_OWNED_CATEGORIES", () => {
    const { must } = parseCql("is:gnm-owned");
    const q = must[0] as { terms: { "usageRights.category": string[] } };
    expect(q.terms["usageRights.category"]).toHaveLength(8); // 4 photo + 4 illustration, as Grid's UsageRights.whollyOwned
  });

  it("is:gnm-owned-photo → terms with photographer categories only", () => {
    const { must } = parseCql("is:gnm-owned-photo");
    const q = must[0] as { terms: { "usageRights.category": string[] } };
    expect(q.terms["usageRights.category"]).toEqual([
      "staff-photographer",
      "contract-photographer",
      "commissioned-photographer",
      "publisher-photographer",
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

// ---------------------------------------------------------------------------
// usages@ nested queries
// ---------------------------------------------------------------------------

describe("parseCql — usages@ nested queries", () => {
  it("usages@platform:print → nested term on usages.platform in must", () => {
    const { must, mustNot } = parseCql("usages@platform:print");
    expect(mustNot).toHaveLength(0);
    expect(must).toHaveLength(1);
    expect(must[0]).toEqual({
      nested: { path: "usages", query: { term: { "usages.platform": "print" } } },
    });
  });

  it("usages@status:published → nested term on usages.status in must", () => {
    const { must } = parseCql("usages@status:published");
    expect(must[0]).toEqual({
      nested: { path: "usages", query: { term: { "usages.status": "published" } } },
    });
  });

  it("-usages@platform:digital → nested term in mustNot", () => {
    const { must, mustNot } = parseCql("-usages@platform:digital");
    expect(must).toHaveLength(0);
    expect(mustNot).toHaveLength(1);
    expect(mustNot[0]).toEqual({
      nested: { path: "usages", query: { term: { "usages.platform": "digital" } } },
    });
  });

  it("usages@reference:... → nested multi_match on references.uri and references.name", () => {
    const { must } = parseCql("usages@reference:guardian.com");
    expect(must[0]).toEqual({
      nested: {
        path: "usages",
        query: {
          multi_match: {
            query: "guardian.com",
            fields: ["usages.references.uri", "usages.references.name"],
            type: "best_fields",
            operator: "and",
          },
        },
      },
    });
  });

  it("usages@<added:2022-01-01 → nested range lte on usages.dateAdded", () => {
    const { must } = parseCql("usages@<added:2022-01-01");
    expect(must[0]).toEqual({
      nested: { path: "usages", query: { range: { "usages.dateAdded": { lte: "2022-01-01" } } } },
    });
  });

  it("usages@>added:2022-01-01 → nested range gte on usages.dateAdded", () => {
    const { must } = parseCql("usages@>added:2022-01-01");
    expect(must[0]).toEqual({
      nested: { path: "usages", query: { range: { "usages.dateAdded": { gte: "2022-01-01" } } } },
    });
  });

  it("multiple usages@ chips combined into single nested query (same-record AND)", () => {
    const { must } = parseCql("usages@platform:print usages@status:published");
    // Must produce exactly ONE nested query (not two separate ones)
    expect(must).toHaveLength(1);
    expect(must[0]).toEqual({
      nested: {
        path: "usages",
        query: {
          bool: {
            must: [
              { term: { "usages.platform": "print" } },
              { term: { "usages.status": "published" } },
            ],
          },
        },
      },
    });
  });

  it("retains replaced intent through positive grouping and independent negatives", () => {
    const result = parseCqlWithDefaults('usages@platform:print usages@status:"replaced" -usages@platform:digital -usages@status:removed');
    expect(result.must).toEqual([{
      nested: { path: "usages", query: { bool: { must: [
        { term: { "usages.platform": "print" } }, { term: { "usages.status": "replaced" } },
      ] } } },
    }]);
    expect(result.mustNot).toEqual([
      { nested: { path: "usages", query: { term: { "usages.platform": "digital" } } } },
      { nested: { path: "usages", query: { term: { "usages.status": "removed" } } } },
      { exists: { field: "softDeletedMetadata" } },
    ]);
    expect(parseCql('usages@status:"replaced"').mustNot).toEqual([]);
  });

  it("multiple negative usages@ chips independently exclude any matching usage", () => {
    const { must, mustNot } = parseCql("-usages@platform:print -usages@status:removed");
    expect(must).toHaveLength(0);
    expect(mustNot).toEqual([
      { nested: { path: "usages", query: { term: { "usages.platform": "print" } } } },
      { nested: { path: "usages", query: { term: { "usages.status": "removed" } } } },
    ]);
  });

  it.each([
    ["section", ["usages.printUsageMetadata.sectionCode", "usages.printUsageMetadata.sectionName"]],
    ["publication", ["usages.printUsageMetadata.publicationName", "usages.printUsageMetadata.publicationCode"]],
  ] as const)("resolves usages@%s through the accepted code/name leaves", (field, fields) => {
    for (const sign of ["", "-"]) {
      const parsed = parseCql(`${sign}usages@${field}:"Morning Edition"`);
      expect(sign ? parsed.mustNot : parsed.must).toEqual([{
        nested: { path: "usages", query: { multi_match: {
          query: "Morning Edition", fields: [...fields], type: "best_fields", operator: "and",
        } } },
      }]);
    }
  });

  it("usages@unknown:value → nested match_none (safe fallback)", () => {
    const { must } = parseCql("usages@unknown:value");
    expect(must[0]).toEqual({
      nested: { path: "usages", query: { match_none: {} } },
    });
  });
});

describe("nested orderedBy alias preservation", () => {
  const originalAliases = [...gridConfig.fieldAliases];
  afterEach(() => { gridConfig.fieldAliases.splice(0, gridConfig.fieldAliases.length, ...originalAliases); });

  it.each([
    [undefined, "usages.printUsageMetadata.orderedBy"],
    ["usages.printUsageMetadata.orderedBy", "usages.printUsageMetadata.orderedBy"],
    ["usages.printUsageMetadata.sectionId", "usages.printUsageMetadata.sectionId"],
    ["metadata.byline", "usages.printUsageMetadata.orderedBy"],
  ])("uses alias %j only when it stays inside usages", (aliasPath, expectedPath) => {
    gridConfig.fieldAliases.splice(0, gridConfig.fieldAliases.length, ...(aliasPath ? [{
      alias: "orderedBy", elasticsearchPath: aliasPath, label: "Ordered by",
      displaySearchHint: false, displayInAdditionalMetadata: false,
    }] : []));
    for (const sign of ["", "-"]) {
      const parsed = parseCql(`${sign}usages@orderedBy:DESK1`);
      expect(sign ? parsed.mustNot : parsed.must).toEqual([{
        nested: { path: "usages", query: { match: { [expectedPath!]: { query: "DESK1", operator: "and" } } } },
      }]);
    }
    if (aliasPath) expect(parseCql("orderedBy:DESK1").must).toEqual([
      { match: { [aliasPath]: { query: "DESK1", operator: "and" } } },
    ]);
  });
});
