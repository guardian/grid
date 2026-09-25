import { createParser } from "@guardian/cql";
import { describe, it, expect, jest } from "@jest/globals";
import { cqlParserSettings, structureCqlQuery } from "./syntax";
import { renderQuery, structureQuery, StructuredQuery } from "../../search/structured-query/syntax";

jest.mock("angular", () => {
  const chainableModule = {
    factory: jest.fn().mockReturnThis(),
    filter: jest.fn().mockReturnThis()
  };
  return { __esModule: true, default: { module: () => chainableModule } };
});

const parser = createParser(cqlParserSettings);

function parseCqlQuery(input: string) {
  const queryAst = parser(input).queryAst;
  if (queryAst === undefined) {
    throw new Error(`Could not parse test query: ${input}`);
  }
  return queryAst;
}

const queries = [
  {
    name: "plain text",
    cql: "text",
    structuredQuery: [{ type: "text", value: "text", filterType: "inclusion" }]
  },
  {
    name: "excluded terms",
    cql: "-text",
    structuredQuery: [{ type: "text", value: "text", filterType: "exclusion" }]
  },
  {
    name: "consecutive excluded terms",
    cql: "-1 2 -3 -4 -5 6",
    structuredQuery: [
      { type: "text", value: "1", filterType: "exclusion" },
      { type: "text", value: "2", filterType: "inclusion" },
      { type: "text", value: "3", filterType: "exclusion" },
      { type: "text", value: "4", filterType: "exclusion" },
      { type: "text", value: "5", filterType: "exclusion" },
      { type: "text", value: "6", filterType: "inclusion" }
    ]
  },
  {
    name: "quoted text",
    cql: `"text"`,
    structuredQuery: [
      { type: "text", value: `"text"`, filterType: "inclusion" }
    ]
  },
  {
    name: "an empty chip",
    cql: "+:",
    structuredQuery: []
  },
  {
    name: "a single chip",
    cql: "has:chip",
    structuredQuery: [
      {
        filterType: "inclusion",
        key: "has",
        type: "filter",
        value: "chip"
      }
    ]
  },
  {
    name: "multiple chips",
    cql: "has:chip another:chip",
    structuredQuery: [
      {
        filterType: "inclusion",
        key: "has",
        type: "filter",
        value: "chip"
      },
      {
        filterType: "inclusion",
        key: "another",
        type: "filter",
        value: "chip"
      }
    ]
  },
  {
    name: "consecutive text",
    cql: "this should be a single text field",
    structuredQuery: [
      {
        type: "text",
        value: "this should be a single text field",
        filterType: "inclusion"
      }
    ]
  },
  {
    name: "chips and text in combination",
    cql: "text has:chip another:chip more text",
    structuredQuery: [
      { type: "text", value: "text", filterType: "inclusion" },
      {
        filterType: "inclusion",
        key: "has",
        type: "filter",
        value: "chip"
      },
      {
        filterType: "inclusion",
        key: "another",
        type: "filter",
        value: "chip"
      },
      { type: "text", value: "more text", filterType: "inclusion" }
    ]
  },
  {
    name: "chips with reserved chars in keys",
    cql: "text leases.leases.access:deny-use text usages@platform:print more text",
    structuredQuery: [
      { type: "text", value: "text", filterType: "inclusion" },
      {
        filterType: "inclusion",
        key: "leases.leases.access",
        type: "filter",
        value: "deny-use"
      },
      { type: "text", value: "text", filterType: "inclusion" },
      {
        filterType: "inclusion",
        key: "usages@platform",
        type: "filter",
        value: "print"
      },
      { type: "text", value: "more text", filterType: "inclusion" }
    ]
  },
  {
    name: "chips with quoted values",
    cql: `category:"PR Image"`,
    structuredQuery: [
      {
        filterType: "inclusion",
        key: "category",
        type: "filter",
        value: "PR Image"
      }
    ]
  },
  {
    name: "chips with quoted keys and whitespace",
    cql: `"fileMetadata.iptc.By-line Title":Photographer`,
    structuredQuery: [
      {
        filterType: "inclusion",
        key: "fileMetadata.iptc.By-line Title",
        type: "filter",
        value: "Photographer"
      }
    ]
  },
  {
    name: "chips with quoted keys and values",
    cql: `"fileMetadata.xmp.xmpMM:OriginalDocumentID":"urn:uuid:4d8c1ca2-245d-43d9-82e1-a6be6ec7e059"`,
    structuredQuery: [
      {
        filterType: "inclusion",
        key: "fileMetadata.xmp.xmpMM:OriginalDocumentID",
        type: "filter",
        value: "urn:uuid:4d8c1ca2-245d-43d9-82e1-a6be6ec7e059"
      }
    ]
  }
];

describe("cql -> structured-query translation", () => {
  describe("structureCqlQuery", () => {
    queries.forEach((query) => {
      it(`should parse a query of '${query.name}' into a Grid structured query`, () => {
        const cqlAst = parseCqlQuery(query.cql);

        const structuredQuery = structureCqlQuery(cqlAst);

        expect(structuredQuery).toEqual(query.structuredQuery);
      });
    });
  });
});

describe("usage filter serialization", () => {
  const usageQueries = [
    {
      input: "+has:crops -usages@platform:print",
      expected: "has:crops -usages@platform:print"
    },
    {
      input: "-usages@platform:print -usages@platform:digital",
      expected: "-usages@platform:print -usages@platform:digital"
    },
    {
      input: "usages@platform:print -usages@status:published -usages@status:replaced",
      expected: "usages@platform:print -usages@status:published -usages@status:replaced"
    },
    {
      input: 'usages@section:"Morning Section" usages@publication:PUB1',
      expected: 'usages@section:"Morning Section" usages@publication:PUB1'
    },
    {
      input: 'usages@status:"replaced"',
      expected: "usages@status:replaced"
    },
    {
      input: '-usages@reference:"https://example.test/usage/a"',
      expected: '-usages@reference:"https://example.test/usage/a"'
    }
  ];

  usageQueries.forEach(({ input, expected }) => {
    it(`preserves the canonical CQL query for ${input}`, () => {
      expect(renderQuery(structureCqlQuery(parseCqlQuery(input)))).toBe(expected);
    });

    it(`preserves the canonical legacy query for ${input}`, () => {
      expect(renderQuery(structureQuery(input) as StructuredQuery)).toBe(expected);
    });
  });
});
