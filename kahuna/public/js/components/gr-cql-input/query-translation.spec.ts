import { describe, expect, it } from "@jest/globals";
import { cqlQueryToGridQuery, gridQueryToCqlQuery } from "./query-translation";
import { createParser } from "@guardian/cql";

describe("query-translation", () => {
  const queryPairs = [
    ["a:b", "+a:b"],
    ['a:"b c"', '+a:"b c"'],
    ["a:b c d:e", "+a:b c +d:e"],
    [":b", "+:b"],
    ["-a:b c -d:e f:g", "-a:b c -d:e +f:g"]
  ];
  const cqlParser = createParser({ operators: false, groups: false });

  describe("gridQueryToCqlQuery", () => {
    it("returns `undefined` if the query does not produce a valid AST", () => {
      const cqlQuery = gridQueryToCqlQuery("f:");

      expect(cqlQuery).toBe("+f:");

      const ast = cqlParser(cqlQuery).queryAst;

      const gridQuery = cqlQueryToGridQuery(ast);
      expect(gridQuery).toBe(undefined);
    });
  });

  describe("Round tripping queries", () => {
    queryPairs.forEach(([originalGridQuery, expectedCqlQuery]) => {
      it(`parses the Grid query \`${originalGridQuery}\` into the CQL query \`${expectedCqlQuery}\`, and back again`, () => {
        const cqlQuery = gridQueryToCqlQuery(originalGridQuery);
        expect(cqlQuery).toBe(expectedCqlQuery);

        const ast = cqlParser(cqlQuery).queryAst;
        if (!ast) {
          throw new Error(`Query ${cqlQuery} generated an invalid AST`);
        }

        const gridQuery = cqlQueryToGridQuery(ast);
        expect(gridQuery).toBe(originalGridQuery);
      });
    });
  });
});
