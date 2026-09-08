# Scroll and position preservation: findings archive

> **Status:** Archived 8 September 2026. Product fixes are committed; the
> remaining test observations were dispositioned without adding harness
> machinery. O9 remains a known backend-dependent discrepancy and is recorded
> in `AGENTS.md` and
> `../materialized-scalars-for-lastUsed-lastAddedToCollection.md`.
>
> This is project history, not a live work queue. Detailed product decisions
> and protocol maps live in
> `../scroll-and-position-preservation-consolidation-spec.md`.

## What this project delivered

| Commit | Result | Kind |
|---|---|---|
| `41a86227b6970943f18d3f85701ac1c3d8f95039` | Made virtual table `aria-rowindex` global rather than buffer-local. | Accessibility bug fix |
| `2fe1b8b3b76e98dc0ac33ddb5b77142879722319` | Made `focusNthItem` resolve a stable image identity before clicking. | Harness correctness |
| `624c62f2263521a969b21c0f61e6f24de5f89ec1` | Fixed two-tier seek readiness, shared scrubber settlement and Playwright's virtualizer click loop. | Harness correctness and speed |
| `316f45fa660913fbcdad34af172ab0601dc9efd0` | Made the hidden search background inert so Backspace/arrow shortcuts reach detail after history navigation. | Product bug fix |
| `2c05f45554c61fa96b3ebf9c3a121b014c05e53e` | Replaced dead keyword ID bisection with a bounded cached-distribution path; reduced observed seek from 9-15s to 0.89-1.62s on the measured TEST corpus. | Product bug and performance fix |
| `5f62208f1ff1fc2b0855c4617fa2f2e61dcafbd2` | Made active selection control sort preservation, retained suppressed explicit focus, and atomically published final sort coordinates. | Product bug fix |
| `55492567ef7a419abb168c4d9afb2566ab300b01` | Deleted the now-producerless offset-correction signal, effect refs, scrubber guard and dead helpers/tests. | Bug-enabled simplification |
| `90c375bf76b2242e3c7cc205dcbc3b34a16fd0f1` | Elects passive anchors lazily from real usable viewport geometry instead of virtual-range midpoint. | Product bug fix |
| `3a7310e1a` | Separated exact valued-document coverage from represented keyword buckets so truncated distributions cannot imply the null zone. | Product bug fix |

The useful pattern was targeted behavior investigation -> failing proof -> fix
-> delete newly obsolete machinery. Top-down protocol replacement was rejected
because it would initially duplicate shared signalling.

## Remaining product issue at archive time

### O9 - Width and Height sort by values different from those displayed

**Confidence:** Confirmed by code and aggregate corpus measurement. Not fixed.

Kupua displays Width and Height from `source.orientedDimensions` when present,
falling back to `source.dimensions` ([field-registry.tsx](../../../src/lib/field-registry.tsx#L298-L304)).
The corresponding sort aliases and scrubber context always use raw
`source.dimensions.width/height`
([sort-builders.ts](../../../src/dal/adapters/elasticsearch/sort-builders.ts#L122-L129),
[sort-context.ts](../../../src/lib/sort-context.ts#L303-L314)). For an image rotated
90 degrees, displayed Width and Height are swapped relative to the values that
determine its position. A Width- or Height-sorted table can therefore visibly
appear out of order.

Read-only aggregate counts on the active redacted search index found oriented
dimensions on 399 of 1,330,788 documents; all 399 also had raw dimensions. The
mechanism is real but affects a small measured subset. Keep this independent of
secondary-sort/null-zone work.

**Current-schema check:** a runtime `long` field that emitted oriented width with
raw-width fallback was effectively tied with native sorting on the local 10k
fixture, but that fixture had only four oriented images. On TEST, three bounded
200-hit repetitions took 82/103/115ms for native raw width and 225/253/231ms for
runtime effective width: about 2.2 times slower at the median. Warm percentile
aggregation remained single-digit milliseconds. All requests were sequential,
read-only and returned only timing/timeout/shard metadata.

**Disposition:** backend-dependent; see
`../materialized-scalars-for-lastUsed-lastAddedToCollection.md` §5. Do not add a
frontend runtime script: it would have to be reproduced across direct search,
media-api search-after, distributions, position maps, range and exact-rank
queries. Prefer canonical stored effective dimensions, or guarantee and backfill
`source.orientedDimensions` for every image. Relabel raw sorting only after a
product decision about the misleading behavior.

## Final test and observability dispositions

### T1 - Habitual and tier viewports differ

`playwright.config.ts` requests 1400x900 before spreading Desktop Chrome
settings, which supplies 1280x720. The manual tier configuration uses 1400x900.

**Disposition:** accepted. Habitual 1280x720 coverage is authoritative for its
own suite; manual tier and performance measurements retain their existing
viewports and baselines. Aligning them would create churn without proving a
missing product contract.

### T2 - Diagnostic settlement is store-based, not viewport-based

Shared diagnostic `waitForSettle()` checks store readiness and then sleeps two
seconds. It does not prove viewport-written or viewport-stable state.

**Disposition:** closed without code. The helper has no habitual-suite callers:
its local caller is the explicitly excluded drift/flash matrix, and its other
callers are manual smoke or diagnostic files. Those diagnostics use transition
sampling and post-state probes for their geometry evidence. Preserve the durable
rule that store settlement is not painted-DOM settlement; add an
operation-specific geometry oracle only when a habitual position-sensitive test
demonstrably needs one. Do not create a universal viewport acknowledgement
mechanism or add per-frame production store writes.

### T3 - Keyword seek smoke can log a serious miss and remain green

The TEST smoke scenario logs a greater-than-10% landing miss without failing.

**Disposition:** closed. The manual smoke suite is not habitual coverage and its
corpus-dependent tolerance is not a suitable correctness gate. O1 now has
deterministic unit coverage for truncated keyword distributions, while existing
habitual Playwright coverage exercises Credit and Source seek behavior. Do not
retain or promote the warning as a substitute for those proofs.

## Historical execution rule

For each open item, the project required one user-visible failure and one
falsifiable mechanism, a failing proof before a fix, focused and full relevant
validation, and deletion only with direct evidence. Performance checks remained
manual. This rule is retained here as project-method evidence, not as an active
work queue.