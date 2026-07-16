# Search Syntax Enhancement — Exploratory Findings

> **Status:** Research only. No code written, no tests run, no files modified except this one.
> Prompted by: "Kupua, like Kahuna, can't do OR searches" — investigated whether OR (and
> related syntax: parentheses, wildcards, date shorthand, etc.) is blocked by anything in the
> Phase 3 media-api gap-closing plan, then widened into a general survey of what's missing,
> what's already there, and what's worth adding.
>
> An older, informal musings doc on search UX exists in the author's notes (chip-free syntax,
> speedkey suggestions, weighting, etc.) — treated as a prompt list, not a source of fact. Its
> UX/widget ideas (keyboard navigation, suggestion ranking) are **out of scope** for this doc,
> which is about query **grammar**, not the input **widget**. Where it overlaps with mapping
> work or is already solved, that's called out inline.

---

## 0. The headline finding

**None of this requires touching the Phase 3 media-api gap-closing plan.** See
[phase-3-minimal-gap-derivation-findings.md](03%20Ce%20n%27est%20pas%20une%20pipe%20dream/media-api-work/phase-3-minimal-gap-derivation-findings.md)
for the full DAL-method migration (D1–D9, C1–C3, etc.) — every one of those endpoints treats
the search query as an **opaque `q: String`**, parsed server-side by `Parser.run(q)` after
receipt. Confirmed at the two live call sites: `SearchParamsBody.fromJson` (used by the
already-shipped `POST /images/search-after`, D3) and `AggregateSearchParams.apply` both do
`query.map(Parser.run)` — the endpoint contract never encodes AND/OR/grouping structure itself.
Query-language work (this doc) and DAL-endpoint work (phase-3 doc) are **two independent
tracks** that happen to share one library call (`Parser.run`) deep inside the server. Nothing
proposed here changes any endpoint's request/response shape, size estimate, or build order.

This means: **the syntax enhancements in this doc can be designed, discussed, and even
partially built without waiting for D1–D9, and without those endpoints needing rework once
grammar work lands** (new endpoints keep accepting `q: String`; only what happens *inside*
`Parser.run` changes).

---

## 1. Current state of CQL syntax — what already works, what's silently broken, what's absent

| Feature | Kahuna / media-api | Kupua (direct-ES) | Kupua (media-api mode) |
|---|---|---|---|
| Free text, `field:value`, quoted phrases | ✅ works | ✅ works | ✅ works (server parses `q`) |
| Negation (`-field:value`, `-word`) | ✅ works | ✅ works | ✅ works |
| `has:field` existence check | ✅ works | ✅ works | ✅ works |
| `is:` named filters (`is:deleted`, etc.) | ✅ works | ✅ works | ✅ works |
| Date shorthand (`uploaded:yesterday`, `@2024`, month/year ranges) | ✅ works | ❌ absent (see §4) | ❌ absent |
| Global fuzzy text matching | ✅ works (config-gated, not per-term syntax) | n/a (ES adapter doesn't apply it) | inherits server config |
| **Boolean OR** (`credit:Reuters OR credit:Getty`) | ❌ **parses but has no effect** — silently becomes AND | ❌ same | ❌ same |
| **Parentheses / grouping** | ❌ **parses but has no effect** — silently flattened | ❌ same | ❌ same |
| Wildcards (`by:Rob*`) | ❌ not implemented | ❌ not implemented | ❌ not implemented |

The OR/parens row is the interesting one: it's not that typing `OR` or `(...)` throws an
error — it's accepted by the grammar and silently discarded, which is worse for a user than a
rejection, because there's no feedback that the query didn't do what it looked like it should.

---

## 2. Why OR and parentheses don't work today — root cause, not symptom

Three independent layers all currently discard boolean structure. All three need fixing for
OR to actually work end-to-end; fixing only one produces a UI/DAL mismatch.

### 2a. The shared parser package (`@guardian/cql`, both Kupua and Kahuna depend on `1.8.6`)

The grammar **does** have OR/AND/grouping tokens (`TokenType.OR`, `TokenType.AND`,
`LEFT_BRACKET`/`RIGHT_BRACKET`) and AST nodes (`CqlBinary`, `CqlGroup`) — see
`node_modules/@guardian/cql/src/lang/{ast,token,parser}.ts`. But two problems live here:

1. **`binary()` builds a flat, right-associative chain, not a precedence tree.** There is no
   representation of "OR binds looser than AND" or any grouping-by-precedence — every
   `CqlBinary` node is just `{left, right?: {operator, binary: <rest of chain>}}`, a linked
   list. Parentheses (`CqlGroup`) wrap a sub-chain, but nothing above the parser folds nested
   groups into the right boolean shape automatically — that's left entirely to the consumer.
2. **Implicit juxtaposition (no keyword) is tagged identically to explicit `OR`.** In
   `parser.ts`'s `binary()`, the `default` branch (reached when two expressions are typed
   next to each other with no `AND`/`OR` keyword — i.e. today's implicit-AND, e.g. `"cats
   dogs"`) sets `operator: TokenType.OR` — the exact same tag a real `OR` keyword produces.
   So `"cats dogs"` and `"cats OR dogs"` currently produce **structurally identical ASTs**.
   This is why `interpreter.ts`'s `cqlQueryStrFromQueryAst` (used to serialize the AST back to
   a string) renders nothing for `operator === "OR"` — that's actually *correct* for the
   implicit-AND case, but means **a real, explicitly-typed `OR` silently vanishes** when the
   query round-trips through the AST. This is a genuine upstream bug in the shared npm
   package, not a kupua- or kahuna-specific bug — it needs a fix (or vendored patch) at the
   `@guardian/cql` level, and since Kahuna imports the identical version, any fix should be
   verified against Kahuna's `gr-cql-input` component too (feature-switch-gated at the time of
   writing, so blast radius may currently be small — worth confirming before assuming "any
   fix is automatically safe").

### 2b. Kupua's own ES query builder (`src/dal/adapters/elasticsearch/cql.ts`)

`binaryToClauses` / `exprToClauses` discard the operator entirely regardless of value:

```ts
function binaryToClauses(binary: CqlBinary): QueryClause[] {
  const left = exprToClauses(binary.left);
  const right = binary.right ? binaryToClauses(binary.right.binary) : [];
  return [...left, ...right];              // AND/OR both flattened into one list
}
```

`CqlGroup` (parens) is unwrapped the same way — `exprToClauses` for a `"CqlGroup"` node just
calls `binaryToClauses(expr.content.content)` and flattens it into the same list. Every clause
ends up in a single flat `must`/`mustNot` array (`parseCql`'s return shape), which is
inherently AND-only. This is the direct-ES-mode translator; it needs a genuine rewrite to
build real nested `bool` queries (`should` + `minimum_should_match`) once (2a) is fixed
upstream — there's no point fixing this before the AST can actually distinguish AND from OR.

### 2c. Media-api's Scala grammar (`lib.querysyntax`)

Confirmed independently and more fundamentally broken than the TS side — there is **no OR/
grouping grammar at all**, not even a discard-the-structure version:

```scala
// Parser.scala
def Expression = rule { zeroOrMore(Term) separatedBy Whitespace }
```

`Condition` (`model.scala`) is a flat, closed sealed trait with no disjunction/group variant,
and `structuredQuery: List[Condition]` is the type used everywhere downstream (`SearchParams`,
`AggregateSearchParams`, ticker-agg compilation, `QueryBuilder.makeQuery`). Typing `OR` today
is either a parse error or gets silently treated as a literal search word (untested which,
low priority to find out). Adding support means: new PEG rules for `OR`/`AND`/parens in
`QuerySyntax.scala`, extending `Condition` (full tree, or the less invasive option — a new
`Disjunction(List[Condition])` variant nested inside the existing flat top-level list), and a
case in `QueryBuilder.makeQuery`/`makeQueryBit` to emit `boolQuery().should(...)
.minimumShouldMatch(1)`. Every exhaustive Scala match on `Condition` needs a new case.

### 2d. Do we need parentheses?

**Yes — not just for user comprehension, for structural soundness.** Even after fixing 2a–2c,
the grammar still produces a flat chain, not a tree — so a folding convention is required.
The standard one (Lucene, most query languages, and what searchers already expect from
Google/GitHub) is **AND binds tighter than OR**: `a OR b AND c` ≡ `a OR (b AND c)`. Recommend
adopting this as the default *and* keeping parentheses for explicit override — anything mixing
AND and OR across 3+ terms is genuinely ambiguous to read without either a memorized
precedence rule or explicit grouping, and shipping OR without a way to disambiguate compound
queries would just move the "silent wrong behaviour" problem from "OR does nothing" to
"OR does something, but not what you meant."

**Lower-risk complementary option, not a replacement:** most real OR demand is "this field is
one of a few known values" (`credit:Reuters OR credit:Getty`), not general boolean
composition. A scoped multi-value shorthand — `credit:(Reuters,Getty)` or
`credit:Reuters|Getty` — could satisfy the majority of cases without touching general boolean
grouping/precedence at all. Worth prototyping as a smaller, faster win alongside (not instead
of) full OR.

---

## 3. Kahuna isolation — does fixing this have to touch production Kahuna?

Confirmed Kahuna is not a bystander here — it shares more of this stack than assumed:

- Kahuna's search bar (`kahuna/public/js/services/api/media-api.js`) calls
  `root.follow('search', {q, ...})` → `GET /images` → `MediaApi.imageSearch()` — the exact
  same `Parser.run` pipeline.
- Kahuna's metadata typeahead (`gr-image-metadata.js`, `gr-photoshoot.js`) calls
  `GET /images/metadata/:field?q=...`, also parsed via `Parser.run`.
- Kahuna already depends on the identical `@guardian/cql@1.8.6` and has its own
  (feature-switch-gated) `gr-cql-input` component.

Two viable ways to scope grammar changes to kupua only, both compatible with the phase-3
doc's endpoint boundaries (§0):

- **Fork the grammar** — new `QuerySyntaxV2`/`ConditionV2`, used only by kupua-facing routes
  (search-after, and any future D-item/C1 endpoint). Zero lines of Kahuna-serving code
  touched. Cost: two grammars to keep in sync for unrelated future changes (new field
  aliases, new `is:` filters).
- **Extend the shared grammar, gate behind an explicit opt-in param** (e.g.
  `queryLanguageVersion=2` on new POST bodies only). One source of truth; `GET /images` never
  sends the flag, so Kahuna's behaviour is provably byte-identical. Lower drift risk than
  forking, at the cost of a slightly more complex single grammar.

No verdict reached — flagged as a decision for whenever grammar work actually starts, not
blocking this doc.

---

## 4. Date shorthand — a real, separate Kahuna-parity gap

Kahuna/media-api's date grammar (`QuerySyntax.scala`, `DateRangeParser.scala`) supports:

- Field prefixes: `date:` / `uploaded:` (→ `uploadTime`), `taken:` (→ `dateTaken`), `added:`
  (→ `dateAdded`).
- A bare `@` shorthand applying the same range grammar to `uploadTime` with no prefix
  (`@yesterday` ≡ `uploaded:yesterday`).
- Relative aliases: **only `today` and `yesterday`** exist (`DateAliasParser`, computed off
  `DateTime.now` at parse time) — there is no `last-week`, `this-month`, etc. in the grammar,
  contrary to what one might assume from Kahuna's UI language.
- Absolute formats: human (`12 January 2024`), `d/M/YYYY`, `dd/MM/YYYY`, ISO `YYYY-MM-dd`.
- Granular formats that expand to a whole range: `January 2024` → the whole month; `2024` →
  the whole year.
- Explicit `>`/`<` comparison composing with any of the above (`taken:>2020-01-01`).

**Kupua's CQL parser (`cql.ts`) has none of this** — no `date:`/`uploaded:`/`taken:`/`added:`
resolution, no `today`/`yesterday`, no `@` shorthand, no month/year expansion. Kupua's date
filtering today is a **separate, non-CQL UI widget** (`DateFilter.tsx`): a dropdown with a
field selector (Upload time / Date taken / Last modified) and preset buttons (Anytime, Today,
Past 24 hours, Past week, Past 6 months, Past year), writing directly to
`since`/`until`/`takenSince`/`takenUntil`/`modifiedSince`/`modifiedUntil` URL params — it
never goes through the CQL parser at all.

**Open question, not a foregone conclusion:** is typed date shorthand in the search box
actually worth adding, given the preset widget already covers the common cases with a
friendlier UI (no syntax to remember, no typos)? The strongest case for porting it anyway is
power-user muscle memory from Kahuna, and the ability to combine a date shorthand with other
CQL terms in one query (`uploaded:yesterday credit:Reuters` as a single typed query, vs.
widget + separate typed field). Not an obvious "must-have" — a good candidate for explicit
discussion rather than default inclusion.

---

## 5. Other candidate syntax enhancements — tiered

**Tier 0 — already works, just needs documenting (no build needed):**
- Negation (`-`), `has:field`, `is:` filters, date range comparisons on absolute dates
  (Kahuna/media-api only — see §4 for the kupua gap), global fuzzy text matching
  (`config.fuzzySearchEnabled` in `QueryBuilder.scala` — a config toggle, not per-term syntax).

**Tier 1 — natural next steps, meaningful value:**
- **Wildcards** (`by:Rob*`) — directly dependent on
  [mapping-enhancements.md](mapping-enhancements.md) §2a (`.keyword` sub-fields); wildcards
  only work on keyword-mapped fields, and most name/place fields are currently `text`-only.
  Trailing wildcards (`Rob*`) map cheaply to a `prefix` query; leading wildcards (`*son`) are
  expensive and probably out of scope without a reversed-ngram index.
- **Field-scoped multi-value shorthand** (`credit:(Reuters,Getty)`) — see §2d, a smaller/
  faster win that covers most real OR demand.

**Tier 2 — useful, more niche:**
- Per-term fuzzy (`Rob~1`), distinct from the existing global config toggle.
- Numeric/dimension range queries (`width:>3000`) — not verified whether this already exists
  for non-date fields; worth a quick check before scoping.
- Phrase proximity (`"cats dogs"~5`).

**Tier 3 — explicitly not recommended (anti-goals):**
- Relevance boosting (`^2`) — high complexity, low value for an internal DAM search tool.
- Regex search — same reasoning.

**Cross-cutting concern:** once `*`, `~`, `|`, `(`, `)` are all live syntax characters, there
needs to be one coherent escaping/quoting story for metadata that genuinely contains those
characters (captions with literal asterisks, parenthetical titles, etc.) — currently only
quoted-phrase escaping exists. Should be designed once, not per-feature.

**Preserve this invariant:** reserved keywords (`AND`/`OR`) are matched case-sensitively today
(confirmed in `@guardian/cql`'s scanner — a plain uppercase-only object-key lookup), so
lowercase "or"/"and" in real captions are safe. Any new keyword added must keep this property.

---

## 6. What this doc deliberately does not cover

- Input-widget UX (keyboard navigation, suggestion ranking/truncation, speedkey selection) —
  belongs in a UI/interaction doc, not a query-grammar doc.
- Canonical decomposition / asciifolding / stemming — covered by
  [mapping-enhancements.md](mapping-enhancements.md); referenced, not duplicated.
- Endpoint design for any phase-3 DAL method — out of scope per §0.

---

## 7. Open questions for a future workplan session

1. Fork-the-grammar vs. flag-gate-the-shared-grammar for Kahuna isolation (§3) — no verdict
   reached here.
2. Is date shorthand in the CQL box worth building given `DateFilter.tsx` already covers the
   common presets (§4)?
3. Full boolean OR+parens vs. field-scoped multi-value shorthand as a faster/lower-risk first
   step (§2d) — could ship independently and OR/parens later, or skip full OR if the
   shorthand covers observed demand.
4. Does `@guardian/cql`'s AST ambiguity (§2a) need an upstream PR, or a vendored patch? Given
   the maintainer relationship already established (prior successful contribution), an
   upstream PR is plausible and would benefit Kahuna's `gr-cql-input` too.
5. Precedence convention to adopt once OR is real (§2d) — recommend AND-binds-tighter-than-OR
   as the default, confirm no objection before building.
