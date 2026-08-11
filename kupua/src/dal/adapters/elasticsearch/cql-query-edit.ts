/**
 * CQL query string manipulation helpers.
 *
 * Uses @guardian/cql's parser to walk the AST and find field terms by
 * key+value structurally, then splice the original query string by
 * token positions.  This avoids fragile string `.includes()` matching
 * that could false-positive on partial overlaps like
 * `credit:Getty` inside `credit:GettyImages`.
 */

import {
  createParser,
  type CqlBinary,
  type CqlExpr,
  type CqlField,
} from "@guardian/cql";
import { getFieldPath } from "./cql";

// Reuse the same parser settings as the main CQL module (operators/groups
// disabled, matching the widget in CqlSearchInput.tsx) — without this, this
// parser silently falls back to the library's defaults for those settings,
// which could parse a query differently than how the widget would have let
// the user compose it in the first place.
const parser = createParser({
  operators: false,
  groups: false,
  shortcuts: {
    "#": "label",
    "~": "collection",
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FoundTerm {
  /** Whether the term was negated (`-key:value`) */
  negated: boolean;
  /** Start offset in the original query string (inclusive) */
  start: number;
  /** End offset in the original query string (exclusive — suitable for `.slice()`) */
  end: number;
}

// ---------------------------------------------------------------------------
// AST walk — find a CqlField matching key + value
// ---------------------------------------------------------------------------

function findInBinary(
  binary: CqlBinary,
  key: string,
  value: string,
  query: string
): FoundTerm | undefined {
  const found = findInExpr(binary.left, key, value, query);
  if (found) return found;
  return binary.right
    ? findInBinary(binary.right.binary, key, value, query)
    : undefined;
}

function findInExpr(
  expr: CqlExpr,
  key: string,
  value: string,
  query: string
): FoundTerm | undefined {
  switch (expr.content.type) {
    case "CqlField":
      return matchField(expr, expr.content, key, value, query);
    case "CqlBinary":
      return findInBinary(expr.content, key, value, query);
    case "CqlGroup":
      return findInBinary(expr.content.content, key, value, query);
    default:
      return undefined;
  }
}

function matchField(
  expr: CqlExpr,
  field: CqlField,
  targetKey: string,
  targetValue: string,
  query: string
): FoundTerm | undefined {
  const fieldKey = field.key.literal ?? field.key.lexeme;
  // Same fallback collectByKey uses when deriving targetValue — without it,
  // a field with no value at all (field.value undefined) compares
  // `undefined !== ""` against itself and is wrongly reported as "no match".
  const fieldValue = field.value?.literal ?? field.value?.lexeme ?? "";

  if (
    fieldKey.toLowerCase() !== targetKey.toLowerCase() ||
    fieldValue?.toLowerCase() !== targetValue.toLowerCase()
  ) {
    return undefined;
  }

  const negated = expr.polarity === "NEGATIVE";

  // Token positions: `token.end` is inclusive (last char index).
  // For `-credit:Getty`: MINUS token is at key.start - 1.
  // For `+credit:Getty`: PLUS token is at key.start - 1.
  // For `credit:Getty`: key.start is the true start.
  //
  // Check the actual character before the key to detect a polarity prefix.
  const keyStart = field.key.start;
  const charBefore = keyStart > 0 ? query[keyStart - 1] : "";
  const hasPrefix = charBefore === "-" || charBefore === "+";
  const start = hasPrefix ? keyStart - 1 : keyStart;

  // value.end is inclusive, so +1 for a slice-friendly exclusive end
  const end = (field.value?.end ?? field.key.end) + 1;

  return { negated, start, end };
}

/**
 * Chars that force quoting in CQL — mirrors @guardian/cql's own reserved-char
 * set (see cql-effective-query.ts's shouldQuoteFieldValue/hasReservedChar
 * comment). Applies to both keys and values: a raw ES path used as a CQL key
 * (e.g. "fileMetadata.xmp.dc:creator") needs the same quoting a value would.
 */
function shouldQuote(s: string): boolean {
  return /[\s:()]/.test(s);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse `query` and find a field term matching `key` and `value`
 * (case-insensitive), regardless of polarity.
 */
export function findFieldTerm(
  query: string,
  key: string,
  value: string
): FoundTerm | undefined {
  if (!query.trim()) return undefined;

  const result = parser(query);
  if (!result.queryAst?.content) return undefined;

  return findInBinary(result.queryAst.content, key, value, query);
}

/**
 * Add, replace, or flip a `key:value` term in a CQL query string.
 *
 * - If the same key:value already exists with the **desired** polarity → no-op
 *   (returns the query unchanged).
 * - If it exists with the **opposite** polarity → replaces it in-place.
 * - If it doesn't exist → appends it.
 *
 * @param query     Current CQL query string
 * @param key       CQL field key (e.g. "credit", "by")
 * @param value     Raw value (unquoted — will be quoted if it contains spaces)
 * @param negated   `true` for exclusion (`-key:value`), `false` for inclusion
 * @returns         Updated query string
 */
export function upsertFieldTerm(
  query: string,
  key: string,
  value: string,
  negated: boolean
): string {
  const quotedKey = shouldQuote(key) ? `"${key}"` : key;
  const quotedValue = shouldQuote(value) ? `"${value}"` : value;
  const prefix = negated ? "-" : "";
  const desired = `${prefix}${quotedKey}:${quotedValue}`;

  const existing = findFieldTerm(query, key, value);

  if (existing) {
    if (existing.negated === negated) {
      // Already present with the same polarity — no-op
      return query;
    }
    // Opposite polarity — splice it out, put the new one in
    const newQuery =
      query.slice(0, existing.start) + desired + query.slice(existing.end);
    // Clean up any double-spaces left by the splice
    return newQuery.trim().replace(/\s{2,}/g, " ");
  }

  // Not present — append
  return query ? `${query} ${desired}` : desired;
}

/**
 * Remove ALL occurrences of a field key (any value, any polarity) from a CQL
 * query string. Useful for exclusive filters like collection, where selecting
 * a new value should clear all previous values for that key.
 *
 * Positions are spliced right-to-left so earlier offsets remain valid.
 */
export function removeAllFieldTerms(query: string, key: string): string {
  if (!query.trim()) return query;

  const result = parser(query);
  if (!result.queryAst?.content) return query;

  // Collect all matching term positions
  // queryAst.content is a CqlBinary (the parser always wraps at the top level),
  // so we call collectInBinary — not collectByKey, which expects a CqlExpr.
  const found: FoundTerm[] = [];
  collectInBinary(result.queryAst.content, key, query, found);

  if (found.length === 0) return query;

  // Sort descending by start so we splice from right to left
  found.sort((a, b) => b.start - a.start);

  let q = query;
  for (const term of found) {
    q = (q.slice(0, term.start) + q.slice(term.end)).replace(/\s{2,}/g, " ").trim();
  }
  return q;
}

function collectByKey(
  expr: CqlExpr,
  key: string,
  query: string,
  out: FoundTerm[]
): void {
  switch (expr.content.type) {
    case "CqlField": {
      const field = expr.content;
      const fieldKey = field.key.literal ?? field.key.lexeme;
      if (fieldKey.toLowerCase() === key.toLowerCase()) {
        const fieldValue = field.value?.literal ?? field.value?.lexeme ?? "";
        const term = matchField(expr, field, key, fieldValue, query);
        if (term) out.push(term);
      }
      break;
    }
    case "CqlBinary":
      collectInBinary(expr.content, key, query, out);
      break;
    case "CqlGroup":
      collectInBinary(expr.content.content, key, query, out);
      break;
  }
}

function collectInBinary(
  binary: CqlBinary,
  key: string,
  query: string,
  out: FoundTerm[]
): void {
  collectByKey(binary.left, key, query, out);
  if (binary.right) collectInBinary(binary.right.binary, key, query, out);
}

/**
 * Find all `has:"<field>"` clause targets in a query (deduped by resolved ES
 * path). Used to detect which fields a dynamic facet section should be
 * rendered for.
 *
 * Returns both the raw literal (what the user typed, e.g. a short alias
 * like "croppedBy" — needed for building click-to-filter CQL chip text,
 * which must round-trip through the same alias) and the resolved ES path
 * (e.g. "exports.author" — needed for the actual aggregation request,
 * since `has:` itself filters on `getFieldPath(value)`, not the raw
 * literal — review finding F3: without this resolution, an aliased has:
 * target's facet aggregated on the wrong, unmapped path and never
 * appeared).
 */
export function findHasFieldTargets(
  query: string,
): { raw: string; esPath: string }[] {
  if (!query.trim()) return [];

  const result = parser(query);
  if (!result.queryAst?.content) return [];

  // Keyed by esPath so has:croppedBy and has:"exports.author" (same
  // underlying field, different raw forms) dedupe to one facet.
  const out = new Map<string, string>();
  collectHasTargetsInBinary(result.queryAst.content, out);
  return Array.from(out, ([esPath, raw]) => ({ raw, esPath }));
}

function collectHasTargetsInBinary(binary: CqlBinary, out: Map<string, string>): void {
  collectHasTargetsInExpr(binary.left, out);
  if (binary.right) collectHasTargetsInBinary(binary.right.binary, out);
}

function collectHasTargetsInExpr(expr: CqlExpr, out: Map<string, string>): void {
  switch (expr.content.type) {
    case "CqlField": {
      const field = expr.content;
      const key = field.key.literal ?? field.key.lexeme;
      // A negated -has:X filters to docs that do NOT have field X — an
      // aggregation on X over that result set is guaranteed to return zero
      // buckets. Never a useful facet target, always a wasted request.
      if (key.toLowerCase() === "has" && expr.polarity !== "NEGATIVE") {
        const value = field.value?.literal ?? field.value?.lexeme;
        // Keep the first raw form seen for a given resolved path — stable
        // regardless of which alias/full-path spelling appears later.
        if (value && !out.has(getFieldPath(value))) out.set(getFieldPath(value), value);
      }
      break;
    }
    case "CqlBinary":
      collectHasTargetsInBinary(expr.content, out);
      break;
    case "CqlGroup":
      collectHasTargetsInBinary(expr.content.content, out);
      break;
  }
}

