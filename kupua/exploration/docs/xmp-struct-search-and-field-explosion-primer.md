# XMP Metadata: Field-Count Explosion + Broken Struct Search — A Primer

> Status: **primer / research writeup, not a design doc.** No code changes
> proposed or made. Written to explain a problem area and the real options
> for fixing it, for readers who don't already know Elasticsearch or XMP
> internals. Companion to
> [cql-arbitrary-field-paths-typeahead.md](cql-arbitrary-field-paths-typeahead.md),
> which covers the separate (but related) problem of *discovering* what
> field names exist. This doc is about what happens once you already know
> the field name and try to search inside it.
>
> Scope note: the actual code involved (`image-loader`, `common-lib`) lives
> outside `kupua/`. This doc is Grid-wide research; only the doc itself is
> being added, under `kupua/exploration/docs/`, and no source files were
> touched.

## The underlying tension, in one sentence

Elasticsearch gives you rich, first-class search (filter, sort, facet, typeahead)
**per named field**, but every named field costs you a permanent mapping slot —
and XMP lets any camera or software vendor invent an unlimited number of new
field names. You can have generic search *or* a bounded, safe schema for
truly open-ended data, but naively getting both at once — full native search
*and* unlimited vendor-invented names — isn't possible with a single mapped
field per name. The rest of this doc is about where exactly that trade-off
bites, and the handful of ways to manage it.

## 1. A five-minute XMP primer

XMP metadata is a set of **properties**, each with a namespace-prefixed name
like `dc:title` or `Iptc4xmpCore:CreatorContactInfo`. A property's value can
take one of a few shapes:

1. **Plain value** — a single string/number. `dc:format` = `"image/jpeg"`.
2. **Array** — an ordered/unordered list of plain values. `dc:subject` =
   `["SPORT", "FOOTBALL"]`.
3. **Struct** — a single record with its own named sub-fields. `Iptc4xmpCore:CreatorContactInfo`
   has sub-fields like `CiAdrCity`, `CiTelWork`, `CiUrlWork`.
4. **Array of structs** — multiple instances of the same struct, e.g.
   `xmpMM:History`, which has one struct entry per edit event (who edited
   it, when, with what software, what action).
5. **Lang-alt** — a special one-value-plus-language-tag array, used for
   translatable text like `dc:title`/`dc:description`. Looks like an array
   of 2 but isn't really a list of alternatives you'd ever want more than
   one of at a time — it's "the value" plus "which language this is."

Only (3) and (4) are genuinely broken for search today. (1) and (2) already
work fine. (5) looks like it might be broken the same way as (4) but isn't —
more on that below.

## 2. The pipeline today, traced end to end

Raw image bytes → `com.drew.imaging.ImageMetadataReader.readMetadata()`
(`metadata-extractor:2.19.0`, see [build.sbt](../../../build.sbt#L150)) →
per-format readers populate a shared `Metadata` object with `Directory`
instances. For XMP, `XmpReader` parses the embedded XMP packet using Adobe's
bundled XMPCore library (`com.adobe.internal.xmp.XMPMetaFactory`) and stores
the result as an `XMPMeta` object inside an `XmpDirectory`.

`XmpDirectory.getXmpProperties()` — metadata-extractor's own code — then
calls `_xmpMeta.iterator(new IteratorOptions().setJustLeafnodes(true))`. This
is **Adobe's own leaf-node iterator** — the path-like keys (`/` for struct
fields, `[N]` for array items) aren't a hack invented by metadata-extractor
or Grid; they're xmpcore's native path representation, just flattened down
to leaves. `getXmpProperties()` returns a flat `Map[String, String]` of
`path -> value`.

Grid's [FileMetadataReader.scala](../../../image-loader/app/lib/imaging/FileMetadataReader.scala)
takes it from there:
- `exportRawXmpProperties` (line ~142) merges all `XmpDirectory` instances
  into one flat map (first value wins per key across directories), applies
  date cleanup (`ImageMetadataConverter.cleanDate`), and redacts values over
  5000 characters.
- `exportXmpPropertiesInTransformedSchema` (line ~150) hands that flat map to
  `FileMetadataAggregator.aggregateMetadataMap` in
  [FileMetadataAggregator.scala](../../../common-lib/src/main/scala/com/gu/mediaservice/model/FileMetadataAggregator.scala),
  which **recursively collapses** the `/`- and `[N]`-suffixed keys bottom-up
  until only top-level property names remain, each holding either a plain
  string or a `JsArray`.
- That output map's keys are what actually get indexed. `FileMetadata.xmp`
  is `Map[String, JsValue]` ([FileMetadata.scala](../../../common-lib/src/main/scala/com/gu/mediaservice/model/FileMetadata.scala#L15)),
  serialized straight into the `fileMetadata.xmp` JSON object stored in ES.

On the ES side, [Mappings.scala](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala)
maps `fileMetadata` as a `dynamic: true` object (line ~62) with two dynamic
templates path-scoped to `fileMetadata.*`:
- Plain string values → `keyword` field (indexed, stored, `ignore_above` ~29KB
  to avoid Lucene's keyword size limit) — line ~14.
- Everything else (arrays, objects) → a generic `DynamicField` fallback,
  letting ES pick a type — line ~35.

**One ES field gets minted, forever, the first time any image uses a given
top-level property name.** ES never drops a field mapping once created. This
is the entire mechanism behind the field-count numbers below.

## 3. The scale of it — real numbers, pulled via `_field_caps`

| | Total mapped ES fields | Under `fileMetadata.*` | % |
|---|---|---|---|
| TEST | 2,567 | 2,565 | 99.9% |
| PROD | 11,446 | 11,444 | 99.98% |

Breaking PROD's `fileMetadata.*` down by top-level namespace:

```
11000 xmp                     143 exif        139 exifSub
   80 iptc                     62 icc          13 getty
    6 colourModelInformation    1 colourModel
```

`xmp` alone is **96%** of the entire field count — because XMP is an open,
vendor-extensible format (anyone can invent `xmp.anyVendorPrefix:anyTag`),
while EXIF/IPTC/ICC are standardized, finite tag registries. `xmp` itself
spreads across **713 distinct sub-namespaces** (`dc`, `crs`, `exif`, `Canon`,
dozens of vendor-specific ones), long-tail distributed — the top 20 account
for only ~33% of the total.

## 4. What already works fine — plain values and plain arrays

Elasticsearch's own dynamic-mapping rule for JSON arrays: the mapped type
"depends on the first non-null value in the array" (from
[Elastic's dynamic field mapping docs](https://www.elastic.co/docs/manage-data/data-store/mapping/dynamic-field-mapping)).
Combined with Grid's `keyword`-on-string template, that means **any array of
plain scalar values — even a genuinely 2D array — already gets a real,
searchable `keyword` field today.** Examples already working, no changes
needed, no allowlist, no ES version requirement:

- `dc:creator: ["tmp"]`
- `photoshop:DocumentAncestors: ["a", "b", "c"]`
- Even a real 2D array of plain strings, `2darr:test: [["a","b"],["c"]]`
  (from `FileMetadataAggregatorTest`'s own test fixture) — still just
  strings at every leaf, still maps as `keyword`.

**The only thing that breaks this is when a leaf value is itself a
stringified object** — a `JsString` containing `"{'key':'value'}"` text —
not the fact of being inside an array.

## 5. What's broken — structs, with a real example

Real data (`Iptc4xmpCore:CreatorContactInfo`, from a local TEST-sourced
sample; phone number redacted):

**What's actually stored in ES today:**
```json
"fileMetadata": { "xmp": {
  "Iptc4xmpCore:CreatorContactInfo": [
    "{'Iptc4xmpCore:CiUrlWork':'pinpep.com'}",
    "{'Iptc4xmpCore:CiEmailWork':'info@pinpep.com'}",
    "{'Iptc4xmpCore:CiAdrCity':'London'}",
    "{'Iptc4xmpCore:CiTelWork':'+44 0000 000000'}"
  ]
}}
```
Each array element is a plain string that *happens to contain* quasi-JSON
text. ES doesn't know `CiAdrCity` exists — it just sees four opaque strings
in a `keyword` array. **A search like "find images whose photographer's
contact city is London" has no field to target.** The best you could do is
an exact-substring match on the literal fragment `CiAdrCity':'London`, which
isn't a real filter and breaks on any formatting difference.

This is `FileMetadataAggregator.toCustomObjectKeyAndValue` doing exactly
what it's documented to do: collapse a `/`-suffixed path into its parent
key, stringifying the child as `Json.stringify(...).replace("\"", "'")`.
Confirmed intentional via a code comment and via
`FileMetadataAggregatorTest`'s fixtures, which assert exactly this shape —
including for very common fields like `dc:title`/`dc:description` (see
lang-alt note below), not just rare structs.

### The lang-alt shape looks similar but isn't the same problem

`dc:title`/`dc:description`/`dc:rights` come out as `[value, [qualifier]]`,
e.g. `["the xmp title", ["{'xml:lang':'x-default'}"]]`. This is XMP's
lang-alt pattern (one value + a language tag), not multiple struct
instances — there's nothing to search *inside*, since the qualifier is
metadata about the one value, not separate data. It's visually similar to
the broken struct case but conceptually different, and (per §9) doesn't
need a nested-vs-flatten decision at all.

### Arrays of *multiple* struct instances add a second problem: correlation

`xmpMM:History` (edit history, one struct per edit event) — real PROD-style
data, 6 entries from local sample data:

```json
[
  [{"stEvt:action":"derived"}, {"stEvt:parameters":"converted from image/x-nikon-nef to image/tiff"}],
  [{"stEvt:action":"saved"}, {"stEvt:softwareAgent":"Adobe Photoshop Camera Raw 18.1.1 (Macintosh)"}, {"stEvt:when":"2026-03-20T16:41:32Z"}],
  [{"stEvt:action":"saved"}, {"stEvt:softwareAgent":"Adobe Photoshop 26.2 (Macintosh)"}, {"stEvt:when":"2026-03-20T16:45:05Z"}],
  [{"stEvt:action":"converted"}, {"stEvt:parameters":"from image/tiff to image/jpeg"}],
  [{"stEvt:action":"saved"}, {"stEvt:softwareAgent":"Adobe Photoshop 26.2 (Macintosh)"}, {"stEvt:when":"2026-03-20T16:45:05Z"}],
  [{"stEvt:action":"saved"}, {"stEvt:softwareAgent":"Adobe Photoshop 26.2 (Macintosh)"}, {"stEvt:when":"2026-03-20T16:51:35Z"}]
]
```
The `"derived"` entry has **no** `softwareAgent` — it's a raw conversion
step, not a Photoshop save. A query for "`derived` AND software = Photoshop
26.2, on the same entry" should find **nothing** in this document. If this
field were made searchable via the simplest fix (ES's `flattened` type,
§7), that query would **wrongly match** — `flattened` merges every entry's
key/value pairs into one shared bag per document, with no memory of which
entry a value came from. Fixing that specific correlation problem needs a
different, heavier tool (`nested`, §7) — not something the cheap fix buys
you for free.

## 6. Malformed / non-conformant XMP — traced, not assumed

- **Whole-segment parse failure:** `XmpReader.extract()` catches `XMPException`
  and calls `directory.addError(...)`. `Directory.isEmpty()` = `_errorList.isEmpty()
  && _definedTagList.isEmpty()` (verified from metadata-extractor source) —
  so an error-only directory is *not* empty and *is* attached to `Metadata`.
  But `getXmpProperties()` returns `{}` when the underlying `XMPMeta` is null
  (parse failed before it was set), and **Grid never calls
  `directory.getErrors()`/`hasErrors()` anywhere** (confirmed: zero matches
  in `FileMetadataReader.scala`). Net effect: the library captures a real
  error message; Grid silently discards it. No log line, no metric. The
  image ingests fine with zero XMP for that segment.
- **Mid-iteration partial failure:** `getXmpProperties()` wraps its entire
  iteration loop in `catch (XMPException ignored) {}` — worse than the case
  above, since even the library itself doesn't record this as a directory
  error. Partial results are silently returned.
- **Known pathological-input guard, already in the library:** xmpcore's
  parse options cap `photoshop:DocumentAncestors` at 1000 items, because
  some malformed files carry 100k+-item arrays that would parse extremely
  slowly.
- **Dates get the best treatment:** `ImageMetadataConverter.cleanDate` logs
  at `info` level and falls back to the raw dirty string when a date can't
  be parsed — not dropped, not silent.
- **Whole file unreadable:** `readMetadata()` has no try/catch; failure
  there fails the entire upload (crash-not-silent, but only at the
  "can't-even-open-the-file" tier).

## 7. Library capabilities Grid isn't using

`XmpDirectory`'s own doc comment: *"XMP data is extracted and exposed via
`XmpDirectory#getXMPMeta()` which returns an instance of Adobe's `XMPMeta`
which exposes the full XMP data set."* Grid only ever calls the flattened
`getXmpProperties()` — never `getXMPMeta()`.

Checked against Adobe's real, public
[XMP-Toolkit-SDK](https://github.com/adobe/XMP-Toolkit-SDK) (the C++ SDK
that the bundled Java port mirrors) — `TXMPMeta` has a fully structured API:

- `GetStructField(schemaNS, structName, fieldNS, fieldName, ...)` — direct
  access to one named struct field, no path-splitting needed.
- `GetArrayItem(...)` + `CountArrayItems(...)` — indexed array access with a
  real count.
- `GetLocalizedText(...)` — purpose-built for lang-alt properties: does the
  full RFC 3066 language-fallback matching (exact → generic → `x-default` →
  first item) and x-default normalization in one call. This is exactly the
  job Grid's current code does badly by treating `xml:lang` as just another
  struct field to stringify.
- `DoesPropertyExist`/`DoesArrayItemExist`/`DoesStructFieldExist` — existence
  checks without a value round-trip.
- `SetDefaultErrorCallback`/`SetErrorCallback` (documented under "Error
  notifications", v5.5+) — a real-time error-notification hook, a second,
  independent, unused mechanism for surfacing parse errors (beyond just
  reading `Directory.getErrors()` after the fact, per §6).

None of the current path-string-splitting logic in `FileMetadataAggregator`
was strictly necessary — it's rebuilding, by hand, exactly the structure
xmpcore already knows and can hand over directly.

## 8. Is struct-search brokenness the *same* problem as field-count explosion?

**Mostly no, with one real nuance worth knowing.**

The explosion (713 sub-namespaces, thousands of tags) is driven by the
diversity of **top-level property names** — this is untouched by whether
any given tag happens to be a struct. `FileMetadataAggregator` never merges
two *different* top-level names together; it only collapses child paths
into their own parent.

But it's not simply irrelevant either: the collapsing step is exactly what
stops struct/array leaf paths (`xmpMM:History[2]/stEvt:changed`, etc.) from
*each* minting their own top-level ES field. Without it, every leaf path
would become its own field, and the explosion would be measurably worse.
So today's stringifying behaviour is bad for searchability but is *also*
part of why struct fields don't compound the field-count problem further —
worth knowing before fixing search, since giving structs real nested
mappings (option (b) below) grows the mapped-field count for those specific
fields, as a trade-off for restored searchability.

**Measured, not estimated, against the local sample:** across all 39
struct-shaped fields found (single-structs + struct-arrays), the sum of
distinct real sub-field names, if each got its own mapping, is 231 — a net
**+192 fields** if every one were fully expanded. Most are small and bounded
(2–8 sub-fields each: `Iptc4xmpCore:CreatorContactInfo`=8, `xmpMM:DerivedFrom`=5,
`xmpMM:History`=6), consistent with them being tied to fixed, standardized
schemas. But a real outlier cluster exists — Adobe Camera Raw's local-adjustment
structs (`crs:MaskGroupBasedCorrections`=32, `crs:RetouchAreas`=30,
`crs:PaintBasedCorrections`=27, `crs:CircularGradientBasedCorrections`=24) —
where expansion is 24–32x for that one field, not "slight" by any reading.
Lang-alt fields are the true free case: `GetLocalizedText` (§7) handles them
without any per-key expansion at all.

So the honest framing is scope-dependent: **+192 fields total is still small
relative to the 2,565–11,444-field baseline (~1.7–7.5% growth)** if you're
weighing "does this reopen the explosion problem" — it doesn't. But it is
**not uniformly slight per field** — some individual structs would multiply
24–32x on their own. Whether that's acceptable depends entirely on which of
the ~39 actually get allowlisted under option (b), which is exactly why §10
scopes it narrowly (contact info, derived-from, lang-alt) rather than
proposing it for all struct-shaped fields found.

## 9. The four shapes, and which ones ingestion can tell apart automatically

The XMP standard already labels every property with its shape — this isn't
something Grid has to guess. `TXMPMeta`'s structured accessors return option
flags (`kXMP_PropValueIsStruct`, `kXMP_PropValueIsArray`, etc.) alongside
every value. So the four cases from §1 are mechanically distinguishable at
parse time, for free:

- **Plain value / array of plain values** — already fine, no change needed.
- **Single struct** — safe to fix (e.g. via `flattened`, §10) with no
  correlation risk, mechanically, no per-tag judgement needed.
- **Array of struct instances** — this is the one case with a genuine
  choice to make (§10's `flattened` vs `nested`), because it's a *product*
  question (does anyone need "these values happened together" queries for
  this specific tag?), not something the parser can answer.

So: auto-route the first three shapes; keep a short, explicit, human-curated
list for the fourth.

**A practical nuance on where the signal actually comes from:** distinguishing
a single struct from an array of struct instances doesn't strictly need a
*new* capability from xmpcore — Grid already reads the relevant signal today.
`getXmpProperties()`'s raw leaf paths carry a `[N]` array-index marker
wherever a property is schema-defined as an array, **even when there's only
one instance right now** (`xmpMM:History[1]/stEvt:action`, not
`xmpMM:History/stEvt:action`). The ambiguity only appears if shape is
inferred from Grid's *already-aggregated* output instead — a genuine
one-instance array and a real single struct collapse to the identical flat
shape after aggregation, with the distinguishing marker discarded along the
way. So the minimal fix is reading that already-available signal earlier
and preserving it, not necessarily switching to a different xmpcore API.
Using the real structured type flags via `GetProperty`/`GetStructField`
(§7) instead of parsing the leaf-iterator's path-string convention would be
a more robust version of the same fix — less string-parsing-dependent —
but isn't strictly required for a working one.

## 10. ES modeling options for structs

- **(a) Current state (stringified opaque strings).** Gives nothing useful
  — not part of any solution, listed for contrast.
- **(b) Allowlist + real nested/object mapping** for known-standardized
  structs (IPTC contact fields, `xmpMM:DerivedFrom`, lang-alt title/
  description via `GetLocalizedText`). Best possible ergonomics — native
  per-field typing, sorting, faceting — for a bounded, hand-picked set.
  Requires per-struct engineering and mapping maintenance.
- **(c) Elasticsearch's `flattened` field type.** Maps an entire struct
  object as **one physical field**, regardless of how many/unknown its
  keys are — literally Elastic's stated use case ("indexing objects with a
  large or unknown number of unique keys... can help prevent a mappings
  explosion"). Query syntax stays as familiar dot-notation:
  `{"term": {"fileMetadata.xmp.Iptc4xmpCore:CreatorContactInfo.CiAdrCity": "London"}}` —
  no allowlist of sub-keys needed at all. Real, permanent limits: every
  value is a plain keyword string forever (no numeric/date range queries,
  alphabetical-not-numeric sort), no highlighting, and you can't wildcard
  the key name itself (must know the exact key to query it, just not in
  advance at mapping time). Stable since ES 7.3 — no version blocker for
  Grid's current 8.x.
- **(c+) `flattened` with "promotion".** A newer `flattened` sub-feature
  (`properties` parameter) lets you additionally promote a handful of
  specific known keys to real typed sub-fields (numeric, date, etc.) while
  everything else in the same struct stays generically flattened — the
  best-of-both option, functionally similar to (b) but layered inside one
  bounded field. **Requires Elastic Stack 9.4+ — Grid is currently on 8.x,
  so this specific refinement needs a real ES version upgrade first,** a
  separate project with its own risk, before it's available at all.
  One further wrinkle: "promotion" pins a **key name**, not an array
  instance. For a single-instance struct (`CreatorContactInfo`) that's
  exactly what you'd want. For a multi-instance struct array
  (`xmpMM:History`), promoting a key still merges that key's values across
  every entry — the correlation problem from §5 persists regardless of
  promotion.
- **(d) `nested` type**, for the subset of struct-array fields where
  "these values belonged together" genuinely matters (edit-history/
  derivation-chain tags being the obvious candidates). Heavier — different
  query syntax, real per-nested-object storage cost — but the only option
  that preserves entry-level correlation.

**A natural staging, discussed but not committed to here:** flatten both
single-structs and struct-arrays uniformly first — `flattened` doesn't care
about that distinction for basic key/value search, so there's no need to
resolve the harder single-vs-array question before shipping a baseline fix.
Defer `nested` (option (d)) to a narrower, later, evidence-driven decision —
only for whichever specific struct-array fields turn out to need cross-key
correlation in practice, once there's a real query to point at.

**Interaction with dynamic aggregations/facets** (relevant to a separate,
now-implemented design, `zz Archive/cql-dynamic-field-aggregations-design.md`,
not edited here): today,
aggregating on a whole struct field (e.g.
`fileMetadata.xmp.Iptc4xmpCore:CreatorContactInfo`) doesn't fail — it's
already `keyword`-mapped — it returns real buckets full of the opaque
stringified blobs, which is a worse outcome than a clean "not aggregatable"
absence would be. Under `flattened` (option (c)), meaningful per-sub-key
aggregation (facet by `CiAdrCity`, say) becomes available using the same
dot-notation addressing as term queries — and, per Elastic's own
documentation, this doesn't require promotion (option (c+)) at all;
promotion only adds numeric-aware bucketing and sorting on top of that,
not basic aggregatability.

One ES mapping mechanic worth knowing in general terms (not a migration
plan): Elasticsearch commits to a field's type the first time it sees that
field and won't change it later. So the mapping-template fix and a reindex
have to move together — a live index can't have old documents under the
current opaque-string shape and new documents under a real-object shape
coexisting under the same mapped field name. The reassuring part: since
today's stringified blobs already contain every key/value pair (just oddly
encoded), transforming already-indexed documents during a reindex likely
doesn't require re-reading original images from S3 — it's un-stringifying
already-stored JSON, not re-deriving it from scratch.

None of these are being recommended here — they're the real menu, with real
trade-offs.

## 11. How many fields actually need the hard (nested-vs-flatten) decision?

Checked directly against real data, not guessed. Method: the current
aggregation already leaves a detectable fingerprint — a genuine array of
multiple struct instances comes out as a nested array-of-arrays; a single
struct comes out as one flat array; the lang-alt pattern is `[value,
[qualifier]]`. This is checkable from stored `fileMetadata.xmp` content
alone, no live ES query needed for the first pass.

| Sample | Docs | Distinct `xmp.*` keys | True array-of-struct-instances (needs the hard decision) | Lang-alt (no decision needed) | Single-struct (safe to fix outright) |
|---|---|---|---|---|---|
| Local TEST-sourced sample | 10,000 | 717 | **29** | 13 | 10 |
| Live PROD sample (`_search`, sorted by recent upload, `_source` limited to `fileMetadata.xmp` only — read-only, bounded, no write risk) | 500 | 217 | **10** | 4 | 2 |

Every one of the 10 found in the smaller PROD sample is a subset of the 29
found on TEST — nothing new appeared. This matches the theory in §8: which
tags are struct-arrays is a *schema* property (Adobe's `xmpMM` history
model, IPTC's `Iptc4xmpExt` location/registry model, PLUS licensing
fields), not something that grows with corpus size the way plain-tag-name
diversity does between TEST (2,565 fields) and PROD (11,444 fields).

**~10–30 fields, drawn from a handful of well-known standard schemas, is
solidly allowlist-sized** — nowhere near the 713-sub-namespace jungle
driving the field-count explosion.

## 12. What "done" would need to answer (not attempted here)

- Which of (b)/(c)/(c+)/(d) — or which combination — for which fields?
  (Likely different answers for single-structs vs struct-arrays, per §10.)
- Is the ES 9.4 upgrade (for promotion) worth pursuing on its own timeline,
  independent of this problem?
- Which specific struct-array tags (of the ~10–29) actually need
  `nested`-level correlation, versus being fine with plain `flattened`?
  This is a product question about what searches people actually want, not
  something derivable from the data alone.
- A migration/reindex plan — any mapping change here is Grid-wide (not
  kupua-only) and requires a reindex of the whole corpus.

This document doesn't answer any of the above — it's the background needed
to have that conversation.
