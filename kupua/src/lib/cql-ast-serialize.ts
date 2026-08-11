/**
 * Workaround for a bug in @guardian/cql (present as of 1.8.6): its own
 * AST→string serialiser (`interpreter.ts`'s `cqlQueryStrFromQueryAst`, used
 * to compute `queryChange`'s `detail.queryStr`) only re-quotes a plain
 * phrase (`CqlStr`) when it contains whitespace — it never checks for `:`,
 * `(`, `)`, or `"`, unlike its own chip key/value serialiser, which
 * correctly checks all of those. So a phrase like `"hello:world"` loses its
 * quotes the moment the widget reports it, and gets mis-parsed as a
 * `key:value` chip the next time that text is read. Chip keys/values
 * (`credit:"Getty Images"`) are NOT affected — only bare quoted phrases.
 *
 * This file is a corrected, drop-in reimplementation of the same
 * AST→string logic, using the same public `@guardian/cql` AST types.
 * `CqlSearchInput.tsx` uses this instead of trusting `detail.queryStr`.
 *
 * Delete once @guardian/cql ships a fix and kupua upgrades past it — see
 * kupua/exploration/docs/deviations.md ("From library defaults /
 * conventions") for the upstream PR reference once filed.
 */
import type {
  CqlBinary,
  CqlExpr,
  CqlField,
  CqlGroup,
  CqlQuery,
  CqlStr,
} from "@guardian/cql";

// Mirrors @guardian/cql's `shouldQuoteFieldValue` (hasWhitespace ||
// hasReservedChar, reserved = `:()"`) — the predicate its chip key/value
// serialiser already uses correctly. The fix is applying this same
// predicate to plain phrases too, instead of a whitespace-only check.
const NEEDS_QUOTING = /[\s:()"]/;

export function queryStrFromAst(query: CqlQuery): string {
  if (!query.content) return "";
  return strFromBinary(query.content);
}

function strFromBinary(binary: CqlBinary): string {
  const left = strFromExpr(binary.left);
  const right = binary.right
    ? `${binary.right.operator === "AND" ? "AND" : ""} ${strFromBinary(binary.right.binary)}`
    : "";
  return (left ?? "") + (right ? ` ${right.trim()}` : "");
}

function strFromExpr(expr: CqlExpr): string | undefined {
  const { content, polarity } = expr;
  const polarityChar = polarity === "NEGATIVE" ? "-" : "";
  const rendered = (() => {
    switch (content.type) {
      case "CqlStr":
        return strFromStr(content);
      case "CqlGroup":
        return strFromGroup(content);
      case "CqlBinary":
        return strFromBinary(content);
      case "CqlField":
        return strFromField(content);
    }
  })();
  return `${polarityChar}${rendered}`;
}

function strFromStr(str: CqlStr): string {
  return NEEDS_QUOTING.test(str.searchExpr)
    ? `"${str.searchExpr}"`
    : str.searchExpr;
}

function strFromGroup(group: CqlGroup): string {
  return `(${strFromBinary(group.content).trim()})`;
}

function strFromField(field: CqlField): string {
  const keyLiteral = field.key.literal ?? "";
  const key = NEEDS_QUOTING.test(keyLiteral) ? `"${keyLiteral}"` : keyLiteral;
  const valueLiteral = field.value?.literal ?? "";
  const value = NEEDS_QUOTING.test(valueLiteral)
    ? `"${valueLiteral}"`
    : valueLiteral;
  return `${key ?? ""}:${value}`;
}
