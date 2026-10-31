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
    // Strip incomplete chip expressions (key: with no value).
    // [\w#~@.]* covers plain fields (credit), shortcuts (#label,
    // ~collection), nested fields (usages@platform, usages@status, etc.),
    // and unquoted dotted ES paths (fileMetadata.iptc.Category) — without
    // the dot, only the last dot-segment before the colon matched here
    // (e.g. just "Category:"), leaving the rest of the path
    // ("fileMetadata.iptc.") behind as a mangled, orphaned fragment instead
    // of stripping the whole incomplete chip. The "([^"]*)" alternative
    // covers a QUOTED key (e.g. a raw ES path like
    // fileMetadata.xmp.dc:subject, quoted because it contains a colon) —
    // without it, only the bare trailing colon matched here, leaving the
    // quoted key behind as an orphaned free-text phrase instead of being
    // stripped like the unquoted case. The leading `(?<=^|\s)` lookbehind
    // anchors the match to a token boundary — without it, the pattern can
    // match "word:" starting mid-quote (e.g. "note:" inside the phrase
    // `"note: hello"`, since the lookahead only checks for a trailing
    // space/end, which an ordinary phrase containing "word: " also
    // satisfies) — silently turning a phrase search into free text.
    .replace(/(?<=^|\s)[+\-]?(?:"[^"]*"|[\w#~@.]*):(?=\s|$)/g, "")
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
