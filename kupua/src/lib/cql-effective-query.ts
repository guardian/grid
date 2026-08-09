/**
 * Derives the "effective" query string reported upstream (URL/search) from
 * a `@guardian/cql` `queryStr` — the CQL editor's serialized text.
 *
 * Two normalisations, matching kahuna's renderQuery behaviour:
 *  1. Strip incomplete chip expressions (`key:` with no value yet) that
 *     appear mid-composition (e.g. pressing `+`, selecting a field).
 *  2. Un-wrap quotes CQL added purely to protect a trailing space with no
 *     search meaning.
 */
export function deriveEffectiveQuery(queryStr: string): string {
  return queryStr
    // Strip incomplete chip expressions (key: with no value)
    // [\w#~@]* covers plain fields (credit), shortcuts (#label, ~collection),
    // and nested fields (usages@platform, usages@status, etc.)
    .replace(/[+\-]?[\w#~@]*:(?=\s|$)/g, "")
    // CQL wraps a key/value in quotes when it contains whitespace or one of
    // its reserved chars (`:`, `(`, `)` — see @guardian/cql's
    // shouldQuoteFieldValue/hasReservedChar). A trailing space alone (e.g.
    // user typed "climate ") triggers quoting that adds no search meaning —
    // strip that case. But a key like "fileMetadata.xmp.dc:creator" is
    // quoted because of the colon, not whitespace, and must stay quoted or
    // the field term breaks. (A literal `"` can't appear in `inner` — the
    // capture group stops at the next quote char.)
    .replace(/"([^"]*)"/g, (_match: string, inner: string) => {
      const trimmed = inner.trim();
      return /[\s:()]/.test(trimmed) ? `"${trimmed}"` : trimmed;
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}
