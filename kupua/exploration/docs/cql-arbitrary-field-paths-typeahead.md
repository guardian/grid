# CQL Arbitrary Field-Path Typeahead — New API Endpoint Required

> Status: rough shape / design sketch only. No code written, no tests run.
> Scope: Kupua only. Companion to `zz Archive/cql-dynamic-field-aggregations-design.md`
> (value-aggregation for a *known* field, implemented — see changelog.md,
> 11 August 2026) — this doc covers the separate problem of discovering
> *what field names exist* in the first place.
>
> A related, separate finding from this same investigation — XMP struct/array
> values (e.g. `Iptc4xmpCore:CreatorContactInfo`) are serialized into
> unsearchable, single-quoted pseudo-JSON strings by `FileMetadataAggregator`
> — is **not** covered here. It doesn't affect field-name explosion (it's
> about one field's content shape, not field count) and is being looked into
> separately.

## Use case

A user typing a CQL search wants to reference a `fileMetadata.*` key they
don't remember the exact spelling of — e.g. `+fileMe…` or, after typing
`has:`, the field-path value itself. Today they must know the exact,
case-sensitive, dot-separated path (`fileMetadata.xmp.dc:creator`) from
memory or from an external reference. There is no in-product way to browse
or auto-complete "what fields are actually there."

## The problem — measured, not estimated

`fileMetadata.*` is dynamically mapped — every EXIF/IPTC/XMP tag ever seen
on any image mints a new real ES field the first time it appears, and ES
never drops a field mapping once created. Pulled real `_field_caps` dumps
from both clusters to check the actual scale:

| | Total mapped fields | `fileMetadata.*` | % fileMetadata |
|---|---|---|---|
| TEST | 2,567 | 2,565 | 99.9% |
| PROD | 11,446 | 11,444 | 99.98% |

`fileMetadata` **is** the jungle — everything else (`source.*`,
`originalMetadata.*`, etc.) is schema-defined by Grid's own code and stays
small and stable; it can't grow the way `fileMetadata` does. PROD has 4.46×
TEST's field count, consistent with years of accumulated one-off
camera/software tags that TEST (reset more often, less operational history)
hasn't built up.

**The jungle is heavily concentrated, not evenly distributed.** Breaking
PROD's `fileMetadata.*` fields down by top-level namespace:

```
11000 xmp                     143 exif        139 exifSub
   80 iptc                     62 icc          13 getty
    6 colourModelInformation    1 colourModel
```

Only **8 namespaces total**. One of them (`xmp`) is **96%** of the entire
jungle — because XMP is an open, vendor-extensible format (any software can
invent `xmp.anyVendorPrefix:anyTagName`), while EXIF/IPTC/ICC are
standardized formats with fixed, finite tag registries. The other 7
namespaces combined are only 444 fields — trivially small.

`xmp` itself doesn't collapse into one further concentration point — its
~11,000 fields spread across **713 distinct sub-namespaces** (`dc`, `crs`,
`exif`, `Canon`, `Bynder`, dozens of vendor-specific ones...), the top 20 of
which account for only ~33% of the total. Still a real, useful reduction
(15× smaller than the full leaf list), just not a single clean cut.

No existing kupua `ImageDataSource` method, and no endpoint in media-api's
current or planned surface, answers "what field paths exist" — every
existing/planned capability requires you to already **know** the field
name as input (see table below).

## Why none of the 9 already-planned D-items (or the C-items) cover this

Checked against `phase-3-minimal-gap-derivation-findings.md`'s full
inventory — Section 5 (Bucket-D, 9 items, D3 shipped) and Section 4c
(Bucket-C, 4 items):

| Item | What it actually does | Needs field name as input? |
|---|---|---|
| D1 `fetchPositionIndex?` | Paginated ID+cursor stream for position mapping | Yes (sort field) |
| D2 `getIdRange` | Cursor range walk with overshoot detection | Yes (sort field) |
| D3 `searchAfter` ✅ shipped | Cursor pagination with PIT binding | Yes (query/sort) |
| D4 `countBefore` | Position count via range-query | Yes (sort field) |
| D5 `findKeywordSortValue?` | Composite agg walk to estimate a sort cursor | Yes (sort field) |
| D6 `getKeywordDistribution?` | Full composite value distribution | Yes (a specific field) |
| D7 `countWithTickers` | Fixed, named ticker aggregations | Yes (hardcoded ticker set) |
| D8 PIT lifecycle | Snapshot consistency for pagination | N/A — unrelated to schema |
| D9 `getByIds`/mget | Multi-doc fetch by known ID | Yes (IDs) |
| C1 `POST /images/aggregations` | Terms agg on a field you name | Yes (field path) |
| C2 `isFilters` extension | Named semantic filter counts | Yes (fixed `is:` registry) |
| C3 date-distribution extension | Histogram for a field you name | Yes (field path) |
| C4 null-zone detection | Transparent sort-null handling | N/A — unrelated to schema |

**Every single one operates on a field, sort key, or ID the client already
knows.** None of them enumerate what fields exist. This is a genuinely new
capability, requiring a 10th D-item, in addition to the 9 already tracked
(of which only D3 is built).

## Why this can't be a live, per-request query — evidence, not caution

Elasticsearch's `_field_caps` is the right primitive for schema
introspection — it's metadata-only in principle (reads mapping info, no
document scanning) and there's no built-in "grouping" mode (no equivalent
of S3's `delimiter` parameter that would let you ask for just the next path
segment) — any tiered/grouped view has to be computed from the full flat
list, either client- or server-side.

**Checked what "metadata-only" actually costs on real data — it's not free
at this scale.** A `_field_caps` call against PROD via Cerebro took
**seconds**, not milliseconds — believable given 11,444 mapped fields and
however many shards/indices the query has to reconcile across, plus real
network latency. A multi-second pause on every keystroke of a typeahead box
is a non-starter, and re-running that query per user, per session, or even
per browsing step would mean everyone pays that cost repeatedly for data
that barely ever changes.

**The data itself is close to static.** Field *schema* is fundamentally
different from field *data*: `fileMetadata.xmp.crs:Sharpness` existing as a
mapped field never changes once created; the dynamic template only ever
*adds* new fields (when a genuinely novel tag appears on a newly-ingested
image), never removes or retypes them. This is exactly the shape of problem
that wants caching, not per-request queries.

## Proposed solution — broad strokes

**Tiered browsing**, matching the real structure of the data (no arbitrary
truncation needed at any tier, since each is either small enough to return
whole or narrowed by ES's own wildcard filter):

1. **Namespace list** — the 8 top-level namespaces. Tiny, effectively
   static.
2. **Non-xmp leaf fields** — all 444 fields across the other 7 namespaces,
   returned complete, no cap.
3. **`xmp` drill-down, two steps** — (a) the 713 sub-namespaces, grouped by
   the server (ES has no native way to do this grouping, so a thin server
   layer computes it from the flat list); (b) leaf fields for one chosen
   sub-namespace (typically dozens, safe to return whole).

**Served from a cache, refreshed rarely in the background — not queried
live.** There's already an established, in-production pattern for exactly
this shape of problem: `common-lib`'s `BaseStore` (used today by
`UsageStore` to track usage-quota data) runs a scheduled background refresh
and serves every request from an in-memory snapshot, never hitting the
slow data source on the user's request path. The new field-path data would
follow the same shape — a background job refreshes the tiered structure
above on a slow schedule (hourly/daily; this data rarely changes), and every
typeahead request just reads whatever was last cached. Not designing the
exact mechanism here — the point is this is a known, proven pattern in this
codebase already, not something new to invent.

**New DAL method needed:** something like
`ImageDataSource.getFieldPaths(prefix?: string): Promise<FieldPathInfo[]>`.
Unlike every row in the phase-3 doc's classification matrix — which maps an
*existing* kupua method to a gap — this method doesn't exist in
`ImageDataSource` today either. Both the client method and the server
endpoint are net-new; there's nothing to reclassify.

## Direct-ES parity note

kupua's own ES proxy (`vite.config.ts`'s `esProxyGuard`) also blocks
`_field_caps`/`_mapping` today via its path allowlist — enabling this for
direct-ES mode requires an explicit, approved safeguard-list change (per
the infra-safeguards directive), independent of the media-api work above.

## Explicitly out of scope here

- Value-aggregation for a field once its name is known — that's C1, already
  designed and implemented, covered in `zz Archive/cql-dynamic-field-aggregations-design.md`.
- Any presence/count-ranking mechanism for a batch of candidate names —
  discussed and dropped in this session's exploration; C1 alone (via
  `sum_other_doc_count`) already provides this if it's ever needed, no
  separate endpoint required.
- The XMP struct/array searchability issue (see banner at top) — separate
  investigation, not a field-count/typeahead concern.
