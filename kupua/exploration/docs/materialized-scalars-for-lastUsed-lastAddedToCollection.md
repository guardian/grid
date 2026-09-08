# Materialized scalars for Last used and Added to collection

> **Purpose:** Preserve the evidence that current mappings force Kupua to choose
> between an inaccurate scrubber and a slow, coarse query workaround, making a
> strong case for root latest-date fields in the backend.
> **Status:** Backend enhancement case; not authorized for implementation.
> **Current-schema conclusion:** Reject Option 1 as a production solution.
> Option 2 (exact null boundary with explicitly approximate populated-zone
> scrubber behavior) is the selected and implemented interim contract.
> **Related records:** Obscure sorting decision, Obscure sorting implementation
> workplan, ES Mapping Enhancements.

## Executive case

The application sorts each image by its latest usage or collection date, but the
current mapping exposes only arrays of dates. Elasticsearch can sort those arrays
by their maximum, yet ordinary histograms and percentiles still see every date.
Kupua therefore cannot cheaply ask the central product question: "how many
images have their latest date in this time range?"

The user-visible consequence is substantial. In PROD, the Last used scrubber
models 5,034,659 dated positions for only 4,142,917 dated images: **891,742 false
positions, or 21.5% inflation**. The exact current-schema workaround took
**2,993ms for only 24 half-year buckets**. Finer month/day precision would need
many more repeated nested filters, and separate users or filter contexts can
issue that work concurrently.

Root `latestUsageDate` and `latestCollectionActionDate` fields would make the
correct query the conventional fast one: one scalar value per image, one
histogram contribution per image, and one shared source of truth for sorting,
scrubber ticks, seeking, null boundaries, cursors, position maps, and rank.

## 1. User problem

Last used and Added to collection sort each image by one value: the maximum
relevant date across its usages or collection memberships. Elasticsearch now
uses `mode:"max"` for both special sorts, so the result list contains each image
once at the correct latest-date position.

The scrubber distribution does not use that value. Its date histogram sees
every child/object date. An image used in several months contributes to several
buckets even though it occupies one list position. Summing those buckets
inflates the populated zone, shifts the "No usage date" / "No collection date"
boundary, and labels child-date frequencies as image ranks. Deep seek also
estimates from all child dates rather than parent maxima; `countBefore` then
tries to recover a global rank with boolean queries over those child values.

This is a coordinate-model defect, not direct list duplication. Sequential
search results still contain each image once. Forward/reverse and null-zone
pagination have separate parity tests in the obscure-sorting workplan.

## 2. Measured scale

All infrastructure measurements were read-only `size:0` aggregations with no
documents, identities, `_source`, scripts, runtime fields, writes, or concurrent
load. PROD requests used `timeout:"10s"`, narrow `filter_path`, and required
`timed_out:false` plus zero failed shards.

### TEST

The unfiltered direct-ES TEST corpus had 1,324,410 visible images.

| Sort | Exact dated parents | Current histogram parent sum | Inflation |
|---|---:|---:|---:|
| Last used | 3,304 | 3,931 | 19.0% |
| Added to collection | 446 | 454 | 1.8% |

A 12-bucket exact max-date filter bank returned the exact parent sums. Three
sequential repetitions at each size produced:

| Exact buckets | Last used median / max ES `took` | Collection median / max ES `took` |
|---:|---:|---:|
| 12 | 14 / 37ms | 16 / 17ms |
| 24 | 14 / 38ms | 26 / 53ms |
| 50 | 67 / 69ms | 18 / 36ms |
| 100 | 140 / 173ms | 34 / 64ms |

No request timed out or failed a shard. TEST validates query shape and rules out
catastrophic fixed overhead, but its 3,304 dated-usage parents are not a PROD
performance proxy.

### PROD

On 7 September 2026:

| Measure | Value |
|---|---:|
| Visible images reported by Kahuna | 9,930,864 |
| Exact parents with at least one dated usage | 4,142,915–4,142,917 |
| Dated usage records | 6,078,799–6,078,801 |
| Monthly histogram parent sum | 5,034,659 |
| False extra histogram positions | 891,742–891,744 |
| Monthly parent-rank inflation | 21.5% |
| Average dated usages per used image | 1.47 |

The two-run count differences are 0.00005% and reflect a live index. The
monthly histogram query plus exact count took 1,270ms. A 12-bucket exact filter
bank took 1,829ms, returned all 4,142,917 parents exactly once, timed out on no
shards, and had zero shard failures. That is 559ms / 44% more ES time than the
measured current request.

A final 24-bucket half-year filter bank took **2,993ms**, returned all 4,142,917
parents exactly once, did not time out, and had zero failed shards. It therefore
reached the pre-agreed rejection threshold while providing only coarse half-year
precision. Compared with the measured current request, it added 1,723ms and was
2.36 times as expensive in ES `took`.

The 12 buckets were coarse years: before 2016, 2016–2025, and 2026+. The
pre-2016 bucket alone held 1,062,724 images, so that configuration is too coarse
for a useful time scrubber. Source outliers span year 0000 to 4019; adaptive
equal-width boundaries based directly on min/max are therefore invalid without
underflow/overflow handling.

## 3. Current-schema choices

### Option 1 — exact max-date filter bank

For predetermined boundaries $b_i$, an image belongs to bucket
$[b_i,b_{i+1})$ when:

$$
(\exists d \ge b_i) \land \neg(\exists d \ge b_{i+1})
$$

For Last used, each predicate is a nested query. For Added to collection, it is
a root range query. A `filters` aggregation makes the buckets mutually exclusive,
so every populated parent contributes exactly once.

**Improves over current behavior:** exact populated/null boundary; exact parent-
rank bucket positions; one bucket per image; click-to-time and tick coordinates
share the latest-date model used by sorting.

**Costs/limits:** query cost scales with filter count; repeated nested joins are
the concern; coarse banks lose time precision; adaptive boundaries require a
prior stats request because aggregations cannot construct sibling filters from
another aggregation's output. H/I still own position-map and exact global-rank
behavior inside/between buckets.

The query runs when a user loads or changes a search/sort context, not on each
scrubber click. Results are cached only in that browser context. Concurrent
users or distinct filters can therefore multiply cold aggregation work; do not
concurrency-test PROD. Controlled concurrency belongs on TEST after single-
request PROD viability is known.

**Provisional rejection thresholds:** one request only; stop on timeout or shard
failure; above 3 seconds reject larger banks; above 5 seconds reject Option 1;
never approach the 10-second safety timeout as a product target.

### Option 2 — exact boundary, approximate populated scrubber

Add one exact root-parent `exists` filter to obtain `coveredCount`. Use a nested
exists query for usages and a root exists query for collection dates. Keep the
existing child-date histogram/percentile only as explicitly approximate data.

**Improves over current behavior:** correct populated/null boundary; correct
null-zone size and coordinate offset; no missing-date image is treated as dated;
approximate data can be prevented from entering APIs that require exact ranks.

**Still approximate:** populated ticks are child-date frequencies rather than
latest-date parent ranks; click-to-time can land at a different time/rank;
`countBefore` may miscorrect max-of-many values. Correcting one denominator can
remove accidental cancellation between today's two wrong models, so individual
landings need measured tolerances rather than an assumption that they improve.

### Option 3 — disable populated-zone special seek/ticks

This is the safest current-schema behavior, but it conflicts with the product
priority that a working scrubber matters more than precision. It is retained as
the fallback if Option 2 cannot be made deterministic enough, not the current
preference.

## 4. Materialized scalar design

The conventional long-term representation is one root scalar per image, for
example `latestUsageDate` and `latestCollectionActionDate`. Sorting, `exists`,
percentiles, histograms, scrubber ticks, null boundaries, cursors, position maps,
and global rank counting would all operate on the same value. Each image would
contribute once, and ordinary Elasticsearch date aggregations would retain fine
precision without a filter bank.

Implementation requires a separate backend proposal and team decision covering:

1. Mapping names, date formats, null/absence semantics, and read compatibility.
2. Producer ownership when usages or memberships are added, changed, or removed.
3. Correct recomputation when the current maximum is deleted or corrected.
4. Write ordering, retries, idempotency, and consistency between source arrays
   and scalars.
5. Historical backfill of roughly ten million images and index migration.
6. Dual-read/dual-write rollout, observability, rollback, and completion proof.
7. Reindex and storage costs, plus behavior for malformed historical dates.

This may never be implemented. The purpose of this document is to preserve why
it would unlock a fully exact, performant experience and prevent future agents
from rediscovering the same mapping constraint.

## 5. Final current-schema benchmark

The final 24-filter, half-year PROD benchmark used underflow before 2015, two
buckets per year from 2015 through 2025, and overflow from 2026 onward. It was
read-only, sequential, `size:0`, response-filtered, and capped at 10 seconds.

The result was `took:2993ms`, `timed_out:false`, zero failed shards, and an exact
bucket sum of 4,142,917. This reaches the agreed 3-second rejection threshold
before month/day-level precision or concurrent users are considered. No larger
or concurrent PROD benchmark should be run. Option 1 is rejected as the shipped
solution; Option 2 is the implemented interim contract, while materialized
scalars are the backend route to both correctness and useful precision.

The exact 24-bucket request below was validated against TEST before PROD use. It
returned 24 buckets whose sum equalled all 3,304 dated parents, with `took:43ms`,
`timed_out:false`, and zero failed shards.

Endpoint: `GET /<INDEX>/_search?filter_path=took,timed_out,_shards.failed,aggregations.exact_parent_count.doc_count,aggregations.max_buckets.buckets.*.doc_count`

```json
{
   "size": 0,
   "track_total_hits": false,
   "timeout": "10s",
   "query": { "bool": { "must_not": [{ "exists": { "field": "softDeletedMetadata" } }] } },
   "aggs": {
      "exact_parent_count": { "filter": { "nested": { "path": "usages", "query": { "exists": { "field": "usages.dateAdded" } } } } },
      "max_buckets": {
         "filters": {
            "filters": {
               "before_2015": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "exists": { "field": "usages.dateAdded" } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2015-01-01T00:00:00Z" } } } } }] } },
               "2015_h1": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2015-01-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2015-07-01T00:00:00Z" } } } } }] } },
               "2015_h2": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2015-07-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2016-01-01T00:00:00Z" } } } } }] } },
               "2016_h1": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2016-01-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2016-07-01T00:00:00Z" } } } } }] } },
               "2016_h2": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2016-07-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2017-01-01T00:00:00Z" } } } } }] } },
               "2017_h1": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2017-01-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2017-07-01T00:00:00Z" } } } } }] } },
               "2017_h2": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2017-07-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2018-01-01T00:00:00Z" } } } } }] } },
               "2018_h1": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2018-01-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2018-07-01T00:00:00Z" } } } } }] } },
               "2018_h2": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2018-07-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2019-01-01T00:00:00Z" } } } } }] } },
               "2019_h1": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2019-01-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2019-07-01T00:00:00Z" } } } } }] } },
               "2019_h2": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2019-07-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2020-01-01T00:00:00Z" } } } } }] } },
               "2020_h1": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2020-01-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2020-07-01T00:00:00Z" } } } } }] } },
               "2020_h2": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2020-07-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2021-01-01T00:00:00Z" } } } } }] } },
               "2021_h1": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2021-01-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2021-07-01T00:00:00Z" } } } } }] } },
               "2021_h2": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2021-07-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2022-01-01T00:00:00Z" } } } } }] } },
               "2022_h1": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2022-01-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2022-07-01T00:00:00Z" } } } } }] } },
               "2022_h2": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2022-07-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2023-01-01T00:00:00Z" } } } } }] } },
               "2023_h1": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2023-01-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2023-07-01T00:00:00Z" } } } } }] } },
               "2023_h2": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2023-07-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2024-01-01T00:00:00Z" } } } } }] } },
               "2024_h1": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2024-01-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2024-07-01T00:00:00Z" } } } } }] } },
               "2024_h2": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2024-07-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2025-01-01T00:00:00Z" } } } } }] } },
               "2025_h1": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2025-01-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2025-07-01T00:00:00Z" } } } } }] } },
               "2025_h2": { "bool": { "must": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2025-07-01T00:00:00Z" } } } } }], "must_not": [{ "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2026-01-01T00:00:00Z" } } } } }] } },
               "2026_or_later": { "nested": { "path": "usages", "query": { "range": { "usages.dateAdded": { "gte": "2026-01-01T00:00:00Z" } } } }
            }
         }
      }
   }
}
}
```