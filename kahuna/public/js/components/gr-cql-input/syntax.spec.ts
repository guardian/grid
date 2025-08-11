import { createParser } from "@guardian/cql";
import { describe, it, expect } from "@jest/globals";
import { cqlParserSettings, structureCqlQuery } from "./syntax";

const parser = createParser(cqlParserSettings);

const queries = [
  {
    name: "plain text",
    cql: "text",
    structuredQuery: [{ type: "text", value: "text" }]
  },
    {
    name: "quoted text",
    cql: `"text"`,
    structuredQuery: [{ type: "text", value: `"text"` }]
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
      { type: "text", value: "this should be a single text field" }
    ]
  },
  {
    name: "chips and text in combination",
    cql: "text has:chip another:chip more text",
    structuredQuery: [
      { type: "text", value: "text" },
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
      { type: "text", value: "more text" }
    ]
  },
  {
    name: "chips with reserved chars in keys",
    cql: "text leases.leases.access:deny-use text usages@platform:print more text",
    structuredQuery: [
      { type: "text", value: "text" },
      {
        filterType: "inclusion",
        key: "leases.leases.access",
        type: "filter",
        value: "deny-use"
      },
      { type: "text", value: "text" },
      {
        filterType: "inclusion",
        key: "usages@platform",
        type: "filter",
        value: "print"
      },
      { type: "text", value: "more text" }
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
    name: "chips with quoted keys",
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
];

describe("cql -> structured-query translation", () => {
  describe("structureCqlQuery", () => {
    queries.forEach((query) => {
      it(`should parse a query of '${query.name}' into a Grid structured query`, () => {
        const cqlAst = parser(query.cql).queryAst;

        const structuredQuery = structureCqlQuery(cqlAst);

        expect(structuredQuery).toEqual(query.structuredQuery);
      });
    });
  });
});
