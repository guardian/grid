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

// Reuse the same parser settings as the main CQL module
const parser = createParser({
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
  const fieldValue = field.value?.literal ?? field.value?.lexeme;

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
  const quotedValue = value.includes(" ") ? `"${value}"` : value;
  const prefix = negated ? "-" : "";
  const desired = `${prefix}${key}:${quotedValue}`;

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




