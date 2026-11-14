import { describe, expect, it } from "vitest";
import { displayTickers } from "./ticker-display";

const configured = [
  { name: "ACME-owned", searchClause: "is:ACME-owned", backgroundColour: "#111111" },
  { name: "agency picks", searchClause: "is:agency-pick", backgroundColour: "#222222", subAggField: "usageRights.supplier" },
];

describe("displayTickers", () => {
  it("keeps configured order whatever the response order, using returned metadata", () => {
    const shown = displayTickers({
      "agency picks": { value: 3, searchClause: "is:agency-pick", backgroundColour: "#abcdef", subCounts: { X: 3 } },
      "ACME-owned": { value: 7, searchClause: "is:ACME-owned", backgroundColour: "#123456" },
    }, configured);
    expect(shown).toEqual([
      { name: "ACME-owned", value: 7, searchClause: "is:ACME-owned", backgroundColour: "#123456", isValue: "ACME-owned" },
      { name: "agency picks", value: 3, searchClause: "is:agency-pick", backgroundColour: "#abcdef", isValue: "agency-pick", subCounts: { X: 3 } },
    ]);
  });

  it("falls back to configured metadata for counts without it", () => {
    expect(displayTickers({ "ACME-owned": { value: 7 } }, configured)).toEqual([
      { name: "ACME-owned", value: 7, searchClause: "is:ACME-owned", backgroundColour: "#111111", isValue: "ACME-owned" },
    ]);
  });

  it("appends complete server-only tickers in response order and skips incomplete or non-is: ones", () => {
    const shown = displayTickers({
      "zeta": { value: 1, searchClause: "is:zeta", backgroundColour: "#000001" },
      "no colour": { value: 1, searchClause: "is:x" },
      "free text": { value: 1, searchClause: "credit:Reuters", backgroundColour: "#000002" },
      "ACME-owned": { value: 7 },
      "alpha": { value: 2, searchClause: "is:alpha", backgroundColour: "#000003" },
    }, configured);
    expect(shown.map((ticker) => ticker.name)).toEqual(["ACME-owned", "zeta", "alpha"]);
  });

  it("skips a configured ticker the server did not return", () => {
    expect(displayTickers({}, configured)).toEqual([]);
    expect(displayTickers(null, configured)).toEqual([]);
  });
});
