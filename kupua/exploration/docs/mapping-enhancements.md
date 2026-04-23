# ES Mapping Enhancements — Analysis & Plan

> Working document. Captures findings from code archaeology, data analysis,
> and the running mapping at `exploration/mock/mapping.json`.
>
> ⚠️ These changes require modifying `Mappings.scala` in Grid's common-lib —
> a Grid-wide change, not kupua-only. Needs team buy-in and a re-index.
>
> **Kupua coupling:** `src/lib/field-registry.ts` statically declares `fieldType` and
> `aggregatable` per field based on the current mapping. When these enhancements ship,
> the registry must be updated to match (or replaced with dynamic `_mapping` introspection).

---

## 0. The Problem — Features Blocked or Degraded by Current Mappings

Nine name/place fields in Grid's ES index are mapped as `text` (analysed)
without a `keyword` sub-field. This means they support free-text search but
**cannot** support aggregations, sorting, exact match, or wildcards. These
are: `byline`, `city`, `country`, `state`, `subLocation`, `copyright`,
`peopleInImage`, `suppliersReference`, and `usageRights.photographer`.

Two stemmed fields (`description`, `title`) lack an unstemmed sub-field,
so phrase-exact search is impossible without stemming distortion.

Ten of the twelve `standardAnalysed` fields lack ASCII folding, creating a
silent accent gap: `by:Jose` can't find `José Oliva`, even though free-text
`Jose` finds it via the catch-all (which does fold). See §5 for evidence.

These gaps block or degrade the following Kupua features:

### Already built — waiting on mapping changes

| Feature | What works today | What's blocked |
|---|---|---|
| **Filters panel** | Facets with counts for all keyword fields (credit, source, category, uploader, subjects, keywords, file type, all `fileMetadata.*` aliases) | No facets for byline, city, country, state, copyright, peopleInImage — the most useful editorial facets ("who shot this?", "where?"). These fields are `text`, which can't produce terms aggregations. |
| **CQL typeahead suggestions with counts** | Value suggestions with query-scoped counts for every keyword and alias field. Infrastructure in place: resolvers check the store's aggregation cache, fall back to independent ES calls, and thread `count` through to CQL's `TextSuggestionOption` (which renders counts flush-right in the popover). | No suggestions at all for `by:`, `city:`, `country:`, `person:`, `state:`, `copyright:`, `illustrator:`, `location:`, `suppliersReference:`. These are listed in `typeahead-fields.ts` as resolver-less entries because there's no keyword field to aggregate on. Adding `.keyword` sub-fields would close this gap with one-line changes per field in the field registry — the typeahead infrastructure already handles it. |
| **Column sorting in image table** | Sort by credit, source, upload date, file type, all alias fields | Can't sort by byline, city, country, copyright — fields users would naturally want to sort by. Text fields don't support doc-value sorting. |

### Future features — enabled by mapping changes

| Feature | What it enables | Mapping dependency |
|---|---|---|
| **Wildcard search** | `by:Rob*` finds all photographers starting with "Rob". `suppliersReference:REX-2024*` finds all Rex references from 2024. | Wildcards only work on `keyword` fields. Currently impossible on text-analysed fields. `.keyword` sub-fields enable it. |
| **Accent-insensitive field search** | `by:Jose` finds `José Oliva`. `city:Munster` finds `Münster`. `credit:Jurgen` finds `Jürgen Schwarz`. | Requires the proposed `standard_folding` analyser (§2c) on text fields, and `lowercase_asciifolding` normalizer on keyword fields. Currently, 10 of 12 text fields lack folding. |
| **Exact phrase search (no stemming)** | `description:"running man"` finds exactly that phrase, not documents about "a man who runs". | Requires `.exact` sub-field on `description` and `title` (§2b). Currently, stemmed fields can only do stemmed search. |
| **Grouping / deduplication** | Group results by photographer, by location, by copyright holder — useful for editorial workflows ("show me one image per photographer from this event"). | Needs keyword sub-fields for `terms` aggregation with `top_hits`. |

---

## 1. The Current Situation

Every string field in Grid's ES mapping uses one of four strategies:

| Mapping type | What it does | Supports | Can't do |
|---|---|---|---|
| **`keyword`** | Stores exact string, no analysis | Terms aggs ✅, exact match ✅, sorting ✅, wildcards ✅ | Fuzzy/partial text search ❌, case-insensitive match ❌ |
| **`text` (standard)** | Tokenises on whitespace/punctuation, lowercases | Full-text search ✅, case-insensitive ✅ | Aggs ❌, sorting ❌, exact match ❌ |
| **`text` (english_s_stemmer)** | Standard + ASCII folding + possessive stripping + stopwords + light English stemming | Broad full-text search ✅ | Everything standard can't do ❌, plus stems distort original words |
| **`completion`** | FST-based prefix suggester | Sub-ms autocomplete ✅ | Everything else ❌ |

**The problem:** text fields and keyword fields are mutually exclusive in
capability. `standardAnalysed("byline")` can find "Robbie Stephenson" when
you search "robbie", but can't tell you the top 50 bylines, can't sort by
byline, and can't do `byline:Robbie*`.

### The `englishAnalysedCatchAll` field and `copy_to`

Grid has a hidden fifth strategy: a **catch-all text field** called
`metadata.englishAnalysedCatchAll`, typed as `sStemmerAnalysed` (i.e. uses
the `english_s_stemmer` custom analyser — lowercase + **asciifolding** +
possessive stemmer + stopwords + minimal English stemmer).

Many fields `copy_to` this catch-all at index time:

| Copies to catch-all? | Fields |
|---|---|
| ✅ Yes | byline, credit, source, keywords, suppliersReference, specialInstructions, subLocation, city, state, country, peopleInImage, labels |
| ❌ No | description, title (already `sStemmerAnalysed` themselves), copyright, bylineTitle, subjects, imageType |

Free-text search (typing words without a `field:` prefix) hits **both** the
individual fields **and** the catch-all via `multi_match` across `matchFields`
(see `MatchFields.scala`). This creates a subtle inconsistency:

| Search type | Query path | Analyser | Has asciifolding? | `Benoit` finds `Benoît`? |
|---|---|---|---|---|
| Free text: `Benoit` | `metadata.englishAnalysedCatchAll` | `english_s_stemmer` | ✅ Yes | ✅ **Yes** |
| Free text: `Benoit` | `metadata.byline` (also in multi_match) | `standard` | ❌ No | ❌ No |
| Field chip: `by:Benoit` | `metadata.byline` only | `standard` | ❌ No | ❌ **No** |

So **free-text search accidentally works** for accented names (because the
catch-all re-analyses the copied value with asciifolding), but
**field-specific search breaks**. A user who refines their search from
`Benoit` to `by:Benoit` gets *fewer* results — the opposite of what you'd
expect when narrowing to the right field.

There's also a **relevance scoring** impact. Free-text queries use
`multi_match` across all `matchFields` (see `MatchFields.scala`), which
includes both `metadata.byline` and `metadata.englishAnalysedCatchAll`.
When searching `Benoit`, the catch-all matches (via asciifolding) but the
individual `byline` field doesn't. The missing match on the more specific
field means a weaker relevance signal — ES scores documents higher when
multiple fields agree. With `standard_folding` on byline, both paths would
match, producing a stronger and more accurate relevance score.

**Note on `copyright`:** This field has a **double disadvantage**. It is
`standardAnalysed` (no folding), AND it does not `copy_to` the catch-all.
So searching `© Münchner` as free text won't even benefit from the
catch-all's folding — the accent gap is absolute, not just for field chips.

The proposed `standard_folding` custom analyser (§2c) fixes this by giving
the individual text fields the same folding that the catch-all already has.

---

## 2. Three Proposed Enhancements

### 2a. Add `.keyword` sub-fields to name/place fields

ES multi-fields let a single source field be indexed multiple ways:

```json
"byline": {
  "type": "text",
  "analyzer": "standard",
  "fields": {
    "keyword": { "type": "keyword", "ignore_above": 256 }
  }
}
```

- `metadata.byline` → text search ("robbie" finds "Robbie Stephenson")
- `metadata.byline.keyword` → exact match, aggs, sort, wildcards

No data duplication — both paths point to the same `_source` value.

### 2b. Add `.exact` sub-fields to stemmed fields

The `english_s_stemmer` analyser stems words: `description:"running man"`
matches "a man who runs". Sometimes you want the exact words:

```json
"description": {
  "type": "text",
  "analyzer": "english_s_stemmer",
  "fields": {
    "exact": { "type": "text", "analyzer": "standard_folding" }
  }
}
```

- `metadata.description` → stemmed (broad search), with asciifolding
- `metadata.description.exact` → unstemmed but still lowercased and
  ASCII-folded (phrase-exact search — `"running man"` won't match "runs"
  but `"chateau"` will still match `"Château"`)

The CQL parser can route quoted field values to `.exact` automatically.

### 2c. Add ASCII folding and Unicode normalisation

**The problem today.** The `standard` analyser (used by byline, city, country,
etc.) does **not** include `asciifolding`. So searching `by:Benoit` will
**not** find `"Benoît Doppagne"`, and `city:Munster` won't find `"Münster"`.

The `english_s_stemmer` analyser **does** include `asciifolding` (see
`IndexSettings.scala` line 37). So `description:chateau` matches `"Château"`.
This means the `standard`-analysed fields have **worse** accent handling than
the stemmed fields — an inconsistency.

Concrete examples from the 10k sample data:

| Field | Stored value | Searching for... | Finds it today? |
|---|---|---|---|
| byline | Benoît Doppagne | `by:Benoit` | ❌ No — standard doesn't fold |
| byline | José Oliva | `by:Jose` | ❌ No |
| byline | Étienne Laurent | `by:Etienne` | ❌ No |
| city | México City | `city:Mexico` | ❌ No |
| city | Münster | `city:Munster` | ❌ No |
| city | São Paulo | `city:Sao` | ❌ No |
| state | Baden-Württemberg | `state:Wurttemberg` | ❌ No |
| credit | Jürgen Schwarz | `credit:Jurgen` | ❌ No (keyword, case-sensitive) |
| description | Château de... | `description:chateau` | ✅ Yes — s_stemmer folds |

**Unicode normalisation.** The same visual character can be encoded two ways:
`é` as a single codepoint (U+00E9, NFC) or a base letter + combining mark
(U+0065 + U+0301, NFD). The `asciifolding` filter handles both — it
decomposes then strips diacritics. For non-folded matching across NFC/NFD
variants, ES also offers `icu_normalizer`, but `asciifolding` is sufficient
for the folding use case.

#### What to change

**New custom analyser: `standard_folding`**

The root cause of the folding gap is that `standardAnalysed` fields use
ES's built-in `standard` analyser, which only does tokenisation +
lowercase — no folding. The `english_s_stemmer` custom analyser does
fold, but also stems (which is wrong for names/places).

The fix is a **third custom analyser** that sits between the two:
tokenise + lowercase + asciifold, but **no stemming**:

```json
{
  "analysis": {
    "analyzer": {
      "standard_folding": {
        "type": "custom",
        "tokenizer": "standard",
        "filter": ["lowercase", "asciifolding"]
      }
    }
  }
}
```

This goes in `IndexSettings.scala` alongside the existing
`english_s_stemmer` and `hierarchyAnalyzer` definitions.

**Switch all `standardAnalysed` fields** to use `standard_folding`:
for byline, city, country, state, subLocation, copyright, peopleInImage,
suppliersReference, bylineTitle, specialInstructions, and the new `.exact`
sub-fields on description/title.

**For existing `keyword` fields (credit, source) — add a normalizer:**

Keywords don't use analysers, but ES supports **normalizers** — a limited
analysis chain applied to keyword fields at both index and query time:

```json
{
  "analysis": {
    "normalizer": {
      "lowercase_asciifolding": {
        "type": "custom",
        "filter": ["lowercase", "asciifolding"]
      }
    }
  }
}
```

```json
"credit": {
  "type": "keyword",
  "normalizer": "lowercase_asciifolding"
}
```

This means `credit:jurgen` matches `"Jürgen Schwarz/Avalon"` — both
case-insensitive and accent-insensitive. The original value is preserved in
`_source`; only the indexed/queried form is normalised.

**⚠️ Trade-off for keyword normalizers:** Aggregations return the
**normalised** (lowercased, folded) form, not the original. So a terms agg
on credit would return `"afp/getty images"` instead of `"AFP/Getty Images"`.
If display-quality agg results matter, there are two options:

1. Use `_source` values for display (look up from the top agg bucket keys)
2. Add a second un-normalised keyword sub-field for display-quality aggs

Option 1 is simpler and usually sufficient.

**For new `.keyword` sub-fields on text parents:**

Use the `lowercase_asciifolding` normalizer so that agg buckets merge
accented and unaccented variants. `"José Oliva"` and `"Jose Oliva"`
collapse into one bucket instead of appearing twice:

```json
"byline": {
  "type": "text",
  "analyzer": "standard_folding",
  "fields": {
    "keyword": {
      "type": "keyword",
      "normalizer": "lowercase_asciifolding",
      "ignore_above": 256
    }
  }
}
```

Same trade-off: agg results are normalised. Use `_source` for display.

---

## 3. Which Fields Need What

### Fields that should get a `.keyword` sub-field + standard_folding analyser

| Field | Current mapping | Why |
|---|---|---|
| **`metadata.byline`** | `standardAnalysed` | "Top photographers" agg. Sorting. Typeahead. **Highest value.** |
| **`metadata.city`** | `standardAnalysed` | Location aggs, filtering, sorting. Finite vocabulary (730 unique in 10k). |
| **`metadata.country`** | `standardAnalysed` | Same. Probably the most useful location agg (1,143 unique). |
| **`metadata.state`** | `standardAnalysed` | Same (260 unique). |
| **`metadata.subLocation`** | `standardAnalysed` | Same (540 unique). Lower priority. |
| **`metadata.copyright`** | `standardAnalysed` | Rights management agg. Finite vocabulary in practice. Also has a **double disadvantage**: no folding AND no `copy_to` catch-all, so accented copyright holders are invisible to both free-text and field search. |
| **`metadata.peopleInImage`** | `standardAnalysed` | "Who appears most?" is a real editorial question. |
| **`metadata.suppliersReference`** | `standardAnalysed` | Exact match on reference IDs. Wildcards (`REX-2024*`). |
| **`usageRights.photographer`** | `standardAnalysed` | Same argument as byline. |

### Fields that should get an `.exact` sub-field

| Field | Current mapping | Why |
|---|---|---|
| **`metadata.description`** | `sStemmerAnalysed` | Exact phrase search without stemming distortion. `.exact` uses `standard_folding` (no stemming, yes folding). |
| **`metadata.title`** | `sStemmerAnalysed` | Same. |

### Fields that should NOT get sub-fields

| Field | Current mapping | Why not |
|---|---|---|
| `metadata.specialInstructions` | `standardAnalysed` | Free-form text, high cardinality. Borderline. |
| `metadata.bylineTitle` | `standardAnalysed` | Rarely used, messy data (324 unique — event names, agency slugs). |
| `usageRights.restrictions` | `standardAnalysed` | Free-form text. |
| `metadata.description` | `sStemmerAnalysed` | No `.keyword` — aggs on prose are meaningless. |
| `metadata.title` | `sStemmerAnalysed` | Same. |
| `uploadInfo.filename` | `keyword` | ~100% unique values. Useless for aggs. |

### Existing keyword fields — consider adding normalizer

| Field | Current | Observation |
|---|---|---|
| **`metadata.credit`** | `keyword` | Correct type. But case-sensitive and no folding. `credit:Jurgen` doesn't find `"Jürgen Schwarz"`. Normalizer would fix. |
| **`metadata.source`** | `keyword` | Same. |

### Precedent: the `usages` rollup pattern

Grid has already applied a version of this idea for nested usage fields.
`usages.status` and `usages.platform` are keyword fields inside a `nested`
object — terms aggregations would require an expensive nested aggregation
wrapper. To avoid this, each field has `copy_to` to a top-level keyword
rollup field (`usagesStatus`, `usagesPlatform`). This is conceptually the
same pattern as `.keyword` sub-fields: index the same data in a second form
that supports aggregation. The mapping proposal just applies this principle
systematically to the text-analysed fields that need it.

---

## 4. Why Byline Was Almost Certainly Mis-mapped — Git Archaeology

The full git history tells a story of fields oscillating between analysed
and keyword, with byline left behind in the shuffle.

### Timeline

1. **`0513f6129`** — Earliest mapping. Fields stored as simple JSON
   objects. `description` as `"stemmed"` (snowball), everything else
   non-analysed strings.

2. **`12a789692`** — *"Index byline, title, credit, copyright, source,
   city & country"*. Batch change: introduced `standardAnalysedString`
   and `snowballAnalysedString`. Changed **everything** from
   `nonAnalyzedString` to `standardAnalysedString` in one commit —
   byline, credit, copyright, source, city, country all became text
   fields together. Also created the multi-field `matchFields` list for
   free-text search across all these fields.

3. **`3b04ac78b`** — *"don't analyse credit"*. Credit pulled back to
   `nonAnalyzedString` (keyword). **One-line change, no explanation in
   the commit message.** Likely motivated by aggregation/suggestion needs
   (the credit suggester was added around the same time).

4. **`10fce6d37`** — *"don't analyse the source"*. Source pulled back to
   keyword. Same pattern — one-line, no explanation.

   → **At this point, credit and source are keyword. Byline, city,
   country, copyright, etc. remain `standardAnalysed`. No commit
   explains why byline was kept as text when credit was changed.**

5. **`72e63814c`** — *"catchall mappings changes"*. Introduced
   `metadata.englishAnalysedCatchAll` as `sStemmerAnalysedString` and
   added `copy_to` on byline, credit, source, keywords,
   suppliersReference, subLocation, city, state, country, labels.
   **This is when free-text search gained asciifolding** (via the
   `english_s_stemmer` analyser on the catch-all) — but only for the
   catch-all copy, not the individual fields.

6. **`b0b8f8917`** — *"Mapping change from mk-more-search"*. Changed
   `specialInstructions` from `keyword` to `standardAnalysed` and added
   it to the catch-all `copy_to`. So specialInstructions went the
   **opposite** direction from credit/source — keyword → text.

7. **`c7620ca7b`** — *"exclude original metadata from free text search"*.
   Created separate `originalMetadataMapping` without `copy_to` — so
   original (pre-edit) metadata doesn't pollute free-text search.
   Confirmed the deliberate intent behind the catch-all architecture.

8. **`deed8ca70`** — *"IMAGEDAM-1096: update people field mapping to be
   case insensitive"*. Changed `peopleInImage` from `keyword` →
   `standardAnalysed`. **The right intent** (case-insensitive search)
   **but lost aggregation capability.** A multi-field would have given
   both. This commit proves the team has historically wanted both
   capabilities from the same field.

9. **Present day.** Byline has been `standardAnalysed` since step 2
   (2014-era) and was **never revisited**. Same data shape as credit
   (short proper names, finite vocabulary), but simply left behind.

### The pattern

The history shows a recurring tension: fields oscillate between keyword
(for aggs/exact match) and text (for case-insensitive search). Each change
solves one problem but creates another. Multi-fields — a single field
indexed both ways — would have resolved this tension at every step.

Real data confirms byline is not prose: 1,350 unique values in 10k docs,
all photographer names: "Tom Jenkins", "Elliott Franks", "SWNS",
"@ashketchup87", "Benoît Doppagne".

---

## 5. ASCII Folding Gap — Evidence from Data

### The three-way inconsistency

| Analyser | Used by | Has asciifolding? |
|---|---|---|
| `english_s_stemmer` (custom) | description, title, `englishAnalysedCatchAll` | ✅ Yes |
| `standard` (built-in) | byline, city, country, state, subLocation, copyright, peopleInImage, suppliersReference, bylineTitle, specialInstructions | ❌ **No** |
| (none — keyword) | credit, source | ❌ **No** |

This means:
- **Free-text search** for `Benoit` **works** (hits catch-all, which folds)
- **`by:Benoit`** field search **fails** (hits `metadata.byline`, which doesn't fold)
- **`description:chateau`** field search **works** (s_stemmer folds)
- **`city:Munster`** field search **fails** (standard doesn't fold)

### Evidence from 10k sample

**Byline** — 30+ values with diacritics:
- `Benoît Doppagne`, `José Oliva`, `José Luis Magaña`, `Étienne Laurent`,
  `Søren Stache`, `Jesús Vargas`, `Swen Pförtner`, `Daniel Löb`
- Also: right-curly-quotes in `Lisa O'Connor`, `Jason O'Brien`

**City** — 30+ values:
- `Münster`, `México City`, `São Paulo`, `Böblingen`, `Fürth`, `Görème`,
  `Schönefeld`, `Pömmelte`

**Country/State** — `Baden-Württemberg` (very common), `Curaçao`,
`Alcalá de Henares`

**Credit** — 10 values: `Jürgen Schwarz`, `César Muñoz`, `Andy Bünning`,
`Jürgen Ritter`, `Martin Agüera`

---

## 6. Performance Implications

### Index size increase

| Component | Estimate |
|---|---|
| `.keyword` sub-fields (9 fields × 9M docs × ~30 bytes) | ~2.4 GB |
| Inverted index for `.keyword` | ~1-3 GB |
| `.exact` sub-fields (2 fields) | ~0.5-1 GB |
| Custom analyser overhead | Negligible |
| **Total index growth** | **~4-7 GB** (~10-20% of current) |

### Query performance

- Aggs on `.keyword`: fast (10-100ms at 9M docs)
- Sorting on `.keyword`: fast (doc values)
- ASCII folding: negligible overhead (filter applied at both index and query time)
- **Existing queries: unaffected** — parent field behaviour unchanged

### Indexing speed

~5-15% slower due to additional sub-fields. Affects re-index (one-time)
and individual document updates (ongoing, minor).

### Memory

Keyword sub-fields use memory-mapped doc values. ~4-7 GB additional data
needs sufficient filesystem cache headroom on ES nodes.

---

## 7. The Re-index Question

Adding sub-fields to an existing mapping is allowed via `PUT _mapping`, but
**existing documents won't have the new sub-fields populated**. A full
re-index is required.

Grid already does periodic re-indexes (index names include timestamps:
`<es-index-name>`). The process:

1. Update `Mappings.scala` + `IndexSettings.scala` (add custom analysers,
   normalizers, sub-fields)
2. Deploy
3. Trigger re-index (~30-120 min for 9M docs)
4. Swap alias → **zero downtime**

---

## 8. Summary: Complete Change List

### Analyser landscape (before → after)

```
BEFORE (2 custom analysers):
  english_s_stemmer:  standard tok → lowercase → asciifolding → possessive → stopwords → s_stemmer
  hierarchyAnalyzer:  path_hierarchy tok → lowercase

AFTER (3 custom analysers + 1 normalizer):
  english_s_stemmer:       (unchanged)
  standard_folding:        standard tok → lowercase → asciifolding       ← NEW
  hierarchyAnalyzer:       (unchanged)
  lowercase_asciifolding:  normalizer: lowercase → asciifolding           ← NEW
```

`standard_folding` is the key addition — it replaces the built-in `standard`
analyser for all name/place fields, giving them the same accent-folding that
the catch-all already has via `english_s_stemmer`, but without stemming.

### Fields to change

```
NEW INDEX-LEVEL DEFINITIONS (IndexSettings.scala):
  analyser "standard_folding":           tokenizer=standard, filters=[lowercase, asciifolding]
  normalizer "lowercase_asciifolding":   filters=[lowercase, asciifolding]

TEXT FIELDS — switch to standard_folding + add .keyword sub-field:
  metadata.byline              🔴 high
  metadata.city                🟠 medium
  metadata.country             🟠 medium
  metadata.state               🟡 low
  metadata.subLocation         🟡 low
  metadata.copyright           🟡 low
  metadata.peopleInImage       🟡 low
  metadata.suppliersReference  🟡 low
  usageRights.photographer     🟡 low

STEMMED FIELDS — add .exact sub-field (standard_folding analyser, no stemming):
  metadata.description         🟠 medium
  metadata.title               🟠 medium

EXISTING KEYWORD FIELDS — add lowercase_asciifolding normalizer:
  metadata.credit              🟡 low
  metadata.source              🟡 low
```

### What this unlocks

| Capability | Before | After |
|---|---|---|
| **Typeahead suggestions** for byline, city, country… | ❌ Text fields can't agg | ✅ Terms agg on `.keyword` |
| **Sorting** by byline, city, country, copyright | ❌ | ✅ Sort on `.keyword` |
| **Wildcard search** `byline:Rob*` | ❌ | ✅ On `.keyword` |
| **Exact phrase search** without stemming | ❌ `"running man"` matches "runs" | ✅ `match_phrase` on `.exact` |
| **Accent-insensitive search** `by:Jose` → José | ❌ standard doesn't fold | ✅ standard_folding does |
| **Unicode normalisation** NFC/NFD matching | ❌ | ✅ asciifolding handles both |
| **Case-insensitive keyword match** `credit:afp` | ❌ keyword is case-sensitive | ✅ With normalizer |

### What NOT to do

- ❌ Don't add `.keyword` to description/title — aggs on prose are meaningless
- ❌ Don't add completion suggesters everywhere — heap cost, rarely justified
- ❌ Don't add `wildcard` field type — the `.keyword` sub-fields already support trailing wildcards (`Rob*`); the dedicated `wildcard` type only helps with leading wildcards (`*enson`), which are rare and not worth the much heavier index
- ❌ Don't add `.keyword` to filename — 100% unique, useless for aggs

---

## 9. ES Version Compatibility & Deprecation Risks

Grid's codebase targets **ES 8.18.3** (docker-compose, elastic4s 8.18.2),
though config keys still reference `es6.url` and code comments mention
"Elastic 6". If production is on an older version or an upgrade to ES 9+
is being considered, here's how each proposal fares.

### Everything we propose is safe and stable

| Feature | Introduced | Deprecated? | Status in ES 9 |
|---|---|---|---|
| **Multi-fields** (`.keyword`, `.exact` sub-fields) | ES 1.x | ❌ Never | ✅ Unchanged. Core mapping feature. |
| **Custom analysers** (`standard_folding`) | ES 1.x | ❌ Never | ✅ Unchanged. |
| **`asciifolding` token filter** | ES 1.x | ❌ Never | ✅ Unchanged. Built-in filter. |
| **Keyword normalizers** | ES 5.2 GA | ❌ Never | ✅ Unchanged. |
| **`copy_to`** | ES 1.x | ❌ Never | ✅ Unchanged. |
| **`ignore_above` on keyword** | ES 5.x | ❌ Never | ✅ Unchanged. |
| **Completion suggesters** | ES 5.x | ❌ Never | ✅ Unchanged (not proposed here anyway). |

Nothing we propose uses deprecated or experimental APIs. These are all
bread-and-butter mapping features that have been stable for a decade.

### Newer alternatives worth knowing about (but not using yet)

| Feature | Available since | What it does | Why we're not using it |
|---|---|---|---|
| **`wildcard` field type** | ES 7.9 | Optimised for leading wildcards (`*enson`). Uses n-gram index internally. | Much heavier index. Trailing wildcards already work fine on keyword fields. Only consider if leading wildcard search becomes a real need. |
| **Runtime fields** | ES 7.11 | Fields computed at query time from `_source` — no re-index needed. Can do `emit(doc['byline'].value.toLowerCase())`. | Slow for aggs/sorting (computed per-doc per-query). Good for prototyping or rare ad-hoc queries, wrong for production-hot paths. The `.keyword` sub-field approach is strictly better for our use case. |
| **`search_as_you_type` field type** | ES 7.2 | Purpose-built for typeahead with edge n-grams and shingles. | Heavier than a completion suggester. Our terms-agg-on-keyword approach is simpler and sufficient for the finite-vocabulary fields (byline, city, etc.). Worth revisiting if prefix-anywhere matching is needed. |
| **`icu_normalizer` / `icu_folding` token filter** | Plugin (any ES version) | More thorough Unicode normalisation than `asciifolding`. Handles CJK, Thai, etc. | Requires installing the `analysis-icu` plugin. `asciifolding` covers Latin diacritics which is what our data needs. If Grid ever handles non-Latin metadata (Arabic, CJK bylines), revisit. |
| **Semantic / vector search (`dense_vector`, HNSW)** | ES 8.0+ (native kNN) | Meaning-based search, not token-based. | Already explored separately for image embeddings. Not relevant to metadata mapping. |

### If upgrading to ES 9

ES 9 (currently in development) brings:

- **No mapping-level breaking changes** for the features we use. Multi-fields,
  analysers, normalizers, and sub-fields are unchanged.
- **Removal of `_type`**: Already completed in ES 8. Grid already doesn't
  use mapping types. (The `protected val imageType = "image"` constant in
  `ElasticSearchClient.scala` is the old ES `_type` value — unrelated to
  `metadata.imageType` which stores Photograph/Illustration/Composite and
  is actively used. The constant appears unused.)
- **TSDB and Logsdb index modes**: Not relevant to Grid's use case.
- **Serverless Elasticsearch**: Elastic's managed offering removes some
  low-level settings (shard count, etc.) but keeps all mapping and
  analyser features.

**Bottom line:** Nothing in our proposal will need changing for ES 9. Do
it now on ES 8 without concern.

### Legacy debt to consider during a version upgrade

If Grid does a major ES upgrade, consider also cleaning up:

- **`es6.url` config key** — rename to `es.url` (trivial, but confusing)
- **Code comments referencing "Elastic 6"** — `ElasticSearchClient.scala`
  still says "Elastic 6 limits" and "Elastic 6 pagination limit"
- **`imageType = "image"` constant in `ElasticSearchClient.scala`** —
  leftover from ES 6 `_type` era, unused since ES 7. Not to be confused
  with `metadata.imageType` (Photograph/Illustration/Composite), which
  is a live keyword field used by search and the Filters panel.
- **`max_result_window = 101000` override** — consider whether
  `search_after` (stable since ES 5) or point-in-time API (ES 7.10+)
  would be better for deep pagination than inflating `max_result_window`

---

## 10. Where This Fits in the Migration Plan

This is a **Grid platform change** — benefits kahuna and any future consumer.

- **Phase 2** (connect to live ES): Add mapping changes to `Mappings.scala` +
  `IndexSettings.scala`. Test with a CODE re-index.
- **Phase 3** (Grid API): API endpoints automatically benefit. No API changes.
- **Kupua**: Typeahead resolvers become simple terms aggs on `.keyword`
  fields. CQL parser routes quoted values to `.exact`. The infrastructure
  is already built: `FIELDS_BY_CQL_KEY` maps CQL keys → ES paths,
  `storeBuckets()` resolves counts from the store's aggregation cache,
  and `buildTypeaheadFields()` wires resolvers to the CQL popover.
  When a text field gains a `.keyword` sub-field, updating `esSearchPath`
  (or adding an `esAggPath`) in the field registry lights up both the
  Filters panel and CQL typeahead automatically — one-line change per field.

