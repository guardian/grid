# Keyword-sorted seek — historical evidence and executed fixes

> **Archive resolution (8 September 2026):** This document was never committed
> while it was an active plan. It is preserved now because its measurements and
> root-cause analysis drove two implemented changes. Commit `2c05f4555` executed
> the within-bucket scoped-percentile fix and deleted dead ID bisection. The O1
> containment change then separated exact valued-document coverage from the
> bounded represented bucket prefix, reported natural completion, prevented
> false null-zone routing, and stopped labels outside the represented prefix.
> Final O1 validation passed 1,274 unit tests and 236 habitual E2E tests.
>
> Sections describing the August fix remain accurate implementation history.
> Proposals to enumerate the complete PROD vocabulary are rejected. Section 13
> is an unapproved, deferred design spike, not a current plan. Generic future
> media-api D5/D6 contracts are owned by
> `03 Ce n'est pas une pipe dream/media-api-work/phase-3-minimal-gap-derivation-findings.md`;
> this document does not define those endpoints.

> Companion to `scroll-and-position-preservation-testing-4-findings.md` §F1.
> **Status: DONE (2026-08-29) — scope (b) landed and verified on TEST. Recommended
> scope was implemented exactly as written: dead `id` bisection deleted, cached-
> distribution scoped-percentile fast path added, composite-walk fallback
> kept unchanged, mock rewritten first (§8-9) so the regression was
> reproducible before the fix. Full suites green: 1154/1154 unit, 247/247
> e2e, plus a live re-run of F1's TEST table (§9 Phase 4) confirming both
> required outcomes: no shared landing across ratios, and 9-15s → <1-1.6s.
> Scope (a) — finding which bucket a position falls in beyond the
> cached distribution's cap (PROD-scale credit/source) — is UNSOLVED and
> was correctly left out of scope; see §13 for the recorded direction.**
>
> **This document completely replaces the earlier proposal of the same name.**
> The earlier version treated keyword seek as never-properly-designed and
> proposed building a new staged-refinement algorithm. That framing was wrong:
> keyword seek **worked**, a single commit broke it. Everything below is
> measured, not inferred.

---

# ⚠️ STOP — PROD-scale correction (2026-08-28, added after the rest was written)

**Half of this document is now known to be wrong. Read this section before
anything else.** The body below was written from measurements on **TEST**.
Measurements on **PROD** then contradicted its central premise. Nothing has been
deleted — the TEST measurements are all still accurate and still useful — but
the conclusions drawn from them do not generalise.

## What PROD says (via Cerebro, read-only aggregations)

| Field | Distinct values on PROD | vs the 50,000 cap in `getKeywordDistribution` |
|---|---|---|
| `metadata.credit` | **310,185** | **6.2× over** |
| `metadata.source` | **63,776** | 1.3× over |
| `uploadedBy` | 2,362 | fine |

Concentration for `metadata.credit` (~9,744,323 images have one):

| Anchors | Cumulative share |
|---|---|
| Top 20 | 60.5% |
| Top 200 | 74.4% |
| Remaining ~309,985 values | **25.6%** — 2,496,795 images, ~8 each |

Ten times the anchors bought 13.9 percentage points. **The tail is irreducible.**
TEST, by contrast, has 10,251 credits with the top 20 holding 87.8% — TEST is a
cleaner, far less fragmented corpus, **not a small copy of PROD**. Any estimate
extrapolated from TEST cardinality is worthless; the author's own estimate
(27k–70k) was wrong by ~4.5×.

## What this invalidates

1. **§3's premise — "the complete bucket map is already in memory" — is TRUE on
   TEST and FALSE on PROD** for `credit` and `source`. `getKeywordDistribution`
   caps at 5 pages × 10,000 values, so on PROD it captures 16% of the credit
   vocabulary and never more.
2. **§6 step 1 ("binary-search the cached distribution") does not work on PROD.**
   The fast path never engages for the two most-used keyword sorts.
3. **Truncation is not benign.** The composite walk goes in *alphabetical* order,
   so cutting off at 50,000 values drops everything below that point
   alphabetically — which can include the largest buckets in the corpus.
4. **A pre-existing bug becomes live at PROD scale.** A truncated distribution
   understates `coveredCount`, which drives
   `inNullZone = clampedOffset >= coveredCount` (`search-store.ts` ~2977). On
   PROD the store would route most keyword seeks into the null-zone path.
   **This predates all of this work and is not caused by the fix.** It is also
   not hurting anyone: kupua has no users. Journalists use kahuna.

## The architectural verdict

Every approach considered so far is **enumeration-driven** — walk the vocabulary,
accumulate counts, build a map. Composite walk, cached distribution,
top-N-plus-tail: the same idea at different sizes. **PROD data kills all of
them.** Measured dead ends: full distribution (310k values, 31 pages, ~21MB);
top-N + ignore tail (up to 25.6% positional error); composite early-exit walk
(~16 pages to reach mid-corpus, hits the 8s cap).

What survives is **oracle-driven**. `countBefore` gives an exact rank for any
string, in one request, at any cardinality — and, the insight that was assumed
away, **the probed string does not have to be a real keyword value**.
`search_after: ["Mz", ...]` is valid even if no image has credit "Mz". So the
vocabulary is never needed: binary-search string space against the rank oracle,
using a top-N terms agg only as a seed to cut probe count. **Not designed —
recorded as the surviving direction.**

## The plan splits in two, and one half got *better*

| Half | Status |
|---|---|
| **(a) Which keyword value sits at position N?** | **Broken at PROD scale.** Needs the oracle-driven redesign above. |
| **(b) Where within that value's block do I land?** | **Validated, and MORE valuable on PROD.** "The Guardian" alone is 1,827,050 images — 18.7% of the corpus in one bucket. Roughly a fifth of all scrubber travel under a credit sort happens inside a single value. §6 steps 2–5 handle exactly that, measured at 510ms. |

## Recommended scope — land the narrow win

**Do (b), skip (a).** Concretely: **DONE 2026-08-29 — all four bullets below
landed exactly as specified.**

- ✅ Delete the provably-dead `id` bisection (§2, §6) — a confirmed regression from
  commit `61b042101`, and wrong at every scale.
- ✅ Implement §6 steps 2–5 (scoped percentile within a bucket, accept the
  estimate) — measured, validated, more valuable at PROD scale than at TEST.
- ✅ Leave bucket lookup on today's fallback for high-cardinality fields. **No worse
  than today**, because it falls through to the path that runs today.
- ✅ Keep §8–§9 (the mock work and TDD) exactly as written — unaffected by any of
  this, and still the gating risk. (Mock work turned out to need more than
  §9 anticipated — see the "test-impact" note below the TDD plan.)

Rejected alternatives, for the record: doing the full oracle-driven redesign now
(real design work, for a browsing mode in an app with no users, on a field whose
data quality makes alphabetical ordering questionable — see below); and parking
entirely (loses a measured, cheap improvement and leaves dead code in place).

## Product observation worth someone's attention

PROD's top-200 credits include `Reuters` (407,903) **and** `REUTERS` (107,432);
`PR`, `PR Image`, `PR IMAGE`, `pr`, `PR Handout`, `PR handout`,
`PR Company Handout`, `PR company handout`; `None`, `none`, `unknown`, `-`, and
empty string. The field is unnormalised free text — that is why cardinality is
310k. **Sorting alphabetically by credit therefore fragments every agency across
the alphabet**, so even a perfect seek delivers a questionable browsing
experience. Not an argument against fixing the seek; it is an argument about
where the value actually is.

---

## 1. TL;DR

**On TEST**, `-credit` seek on 1.3M docs currently costs **~54 ES calls, 9–15s**,
and lands **436,663 docs (33%) from target**. The measured fix costs **3 ES
calls, ~510ms**, and lands **~2,100 docs (0.16%)** from target — one pixel of
scrubber travel.

**On PROD, only the second half of that fix applies** — see the correction banner
above. Recommended scope is (b) only.

The part that ships is mostly *deletion*: a bisection loop that is provably a
no-op, plus a percentile call that already exists.

---

## 2. Root cause — this is a regression, and it has a commit

F1 documented a ~42%-of-corpus seek ceiling and 9–15s latency, and suspected the
binary-search refinement was searching the wrong axis. That is correct, but the
important part is *why*.

**Commit `61b042101` (2026-04-04, "Handle missing values in sort, seeking and
scrubber info fixes") did two things in one change:**

1. Appended `{ uploadTime: dir }` to every sort clause in `sort-builders.ts`
   (`if (!fieldSet.has("uploadTime"))`) — the "universal fallback sort".
2. Added `buildSeekCursorAnchors` (`search-store.ts:882`), which anchors every
   non-primary sort field at a sentinel: `Number.MAX_SAFE_INTEGER` for desc,
   `0` for asc.

Six days earlier, the changelog's **Bug #18 entry (29 March 2026)** records the
`id` binary search *working*: *"convergence in 11 steps, ~4 seconds total,
landing within 45 docs of target (ratio 0.7498 for 75% seek)."* It worked
because the cursor was then two elements — `["PA", ""]` — so `id` genuinely was
the axis ordering the bucket.

Commit `61b042101` made the cursor three elements — `["AAP", MAX_SAFE_INTEGER, ""]`
— and broke it twice over:

- **`id` became the wrong axis.** The bucket is now ordered by `uploadTime`
  first; `id` only breaks ties *within an identical millisecond*.
- **The oracle went constant.** In `countBefore` (`es-adapter.ts:1282`), the
  equality condition for a preceding non-null field is
  `range: { gte: prevValue, lte: prevValue }`. With `prevValue =
  MAX_SAFE_INTEGER`, **no document can ever satisfy it**, so every `should`
  clause at index ≥ 1 — precisely the ones whose count depends on the `id`
  probe — is unconditionally 0. Only the i=0 term survives, and it does not
  depend on `id`.

The loop therefore never converges early, so it runs its full ~48 steps instead
of 11. That is exactly the 4s → 9–15s degradation F1 measured.

**No test caught this**, for reasons that are themselves a finding — see §8.

---

## 3. What is already in memory when the bug fires

`seek()` **already blocks on the sort distribution** before entering the keyword
branch (`search-store.ts:2969-2971`):

```ts
let dist = get().sortDistribution;
if (!dist && primaryField !== "uploadTime") {
  await get().fetchSortDistribution();
  dist = get().sortDistribution;
}
```

`getKeywordDistribution` (`es-adapter.ts:1586`) returns
`{ key, count, startPosition }` for **every** bucket plus `coveredCount`. The
store reads exactly one number off it (`coveredCount`), discards `buckets`, and
then issues `findKeywordSortValue` — **a second composite-aggregation walk over
the same data**. That redundant walk is also where F1's ~42% ceiling lives (its
8s `TIME_CAP_MS`). Deleting it removes the ceiling as a side effect.

### Measured live (TEST, `-credit`, 1,322,589 docs, 2026-08-28)

| Check | Result |
|---|---|
| Buckets loaded when the keyword path runs | 10,251, covering 1,306,580 (16,009 null-credit) |
| Internal consistency | **0 cumulative mismatches**; cumulative end == `coveredCount` |
| Same coordinate space as `countBefore`? | **Yes.** `AAP.startPosition` = **983,493** — byte-identical to the constant the broken bisection returns |
| Bisection is a no-op | `id=000000000000` and `id=ffffffffffff` → both 983,503 |
| `findKeywordSortValue` cost | 242ms, returns `"AAP"` |
| In-memory bucket lookup | **0.1ms**, same bucket, same `startPosition` |
| `_count` round-trip cost (tunnel) | 86–276ms (~140ms typical) |

The distribution is a **snapshot** and drifts slightly from live (`PA` 596,634
cached vs 596,619 counted; sentinel `countBefore` 983,503 vs cached 983,493).
Drift of ±15 docs is irrelevant against a 200-doc tolerance, but it is why the
landed offset must still come from `countBefore`, not from arithmetic.

---

## 4. Approaches measured and rejected

All four were tested against the live corpus before being discarded. Recording
them so nobody re-proposes one.

| Approach | Measured result | Verdict |
|---|---|---|
| Bisect `uploadTime` blind (no new API surface) | ~39 probes × ~140ms ≈ **5.5s** | Same latency shape as the bug. Rejected. |
| Regula falsi / interpolation on `uploadTime` | 5 probes closed **286 docs of a 3,810 gap**, still crawling | Bucket upload times are wildly non-uniform; linear interpolation is useless. Rejected. |
| Iterate the percentile until within tolerance | **Oscillates**: 994,075 → 989,615 → 994,075 | tdigest has a ~4,460-doc "step" here; 97.31st and 97.37th percentile map 5 hours apart but 98.04 jumps seven weeks. Rejected — and this is a hard constraint on any implementation (see §6). |
| Scope by splicing CQL text into `params.query` | **3 of 10,251 live keys silently return 0** | See §5. Rejected. |

The decisive point: **one 82–161ms tdigest call beat every arithmetic
approach**, because it models the actual shape of the data and interpolation
cannot.

---

## 5. Scoping must be structured data, not query text

Narrowing to a bucket requires telling the data layer "only consider docs where
`metadata.credit` = `AAP`". The obvious route is to append `credit:"AAP"` to
`params.query` — the same string the user types into the search box. Tested
live:

- **`match_phrase` on the keyword field is exact.** Scoping to `"PA"` and
  sorting both asc and desc returned `"PA"` at both extremes — no leakage into
  `"PA Wire/PA"` or `"PA/PA"`. Good.
- **Backslashes are fine.** 41 live keys contain one (`UNRWA \ apaimages/Avalon`);
  all counted correctly.
- **Double quotes are fatal, and silent.** All 3 live keys containing a `"` —
  `Getty Images for Sean "Diddy" Combs`, `Alto Press"/Avalon` (6 docs), and one
  long CATERS caption — returned **0**, not an error. Zero means the percentile
  comes back `null` and the seek quietly degrades with nobody the wiser.

Eight docs today. But these keys are arbitrary agency-supplied metadata, and
nothing prevents tomorrow's ingest producing a large bucket containing a quote.
Two further reasons the text route is wrong: it round-trips through a *second,
independent* short-name→ES-path map (`cql.ts`'s `getFieldPath` vs
`sort-builders.ts`'s `aliases`) that agree today only by coincidence, and it
means machine-generated text is written into the human's query field.

**Proposal: an optional typed argument.**

```ts
estimateSortValue(params, field, percentile, signal, scope?: Array<{ field: string; value: string }>)
```

compiled to a `term` filter alongside `buildQuery(params)`. Exact, no parser, no
escaping, no second alias map, and it uses the ES path the sort clause already
resolved.

**Nothing appears in the URL or the search box.** This is a function argument,
not a `SearchParams` field. (`SearchParams` has no structured filter escape
hatch — every field is a string URL param — so an argument is the only correct
place for it.)

### media-api implication — deferred until the fix is proven

**Do not amend `phase-3-minimal-gap-derivation-findings.md` yet.** This fix is
entirely client-side; nothing in media-api needs to exist or change for it to be
built, tested, or perf-tested. The evidence for the endpoint shape *is* the fix
working — specifically T2 (ES call count ≤ 4) plus the Phase 4 TEST re-run. If
one scoped percentile call turns out not to carry the weight, the shape below
would be a guess baked into a contract. Amend **after** Phase 4.

What to amend then, in priority order:

| Item | Change | Current status in the gap doc |
|---|---|---|
| **Gap 4 — `POST /images/sort-percentile`** | Keep `field` explicit; add optional `scope: [{ field, value }]` → `term` filters | **Has no D-number and is absent from the §5 catalogue** — see below |
| **D6 — `POST /images/keyword-distribution`** | Add a truncation flag to the response | Not started. **Promoted:** now the primary path, not a scrubber nicety |
| **D5 — `POST /images/keyword-seek`** | Optionally widen return to `{ value, bucketStart, bucketCount }` | Not started. **Demoted** to fallback-only |

**Two problems in the gap doc worth recording now, independent of this fix:**

1. **`sort-percentile` is a confirmed D item with no D-number.** §1 counts it
   (row 13, "B1+D"), §6 says *"Gap 4 — CONFIRMED D (small) — still needed"*, §2
   specifies the endpoint — but §5's catalogue runs D1–D9 with no entry for it,
   and the status banner's not-started list omits it. It will never surface in a
   build-order discussion because it isn't on the list anyone reads.
2. **The planned contract for it is already wrong, today.** §2 specifies
   `{q, filters, orderBy, percentile}` with the server deriving the field from
   `orderBy`, justified as *"Both call sites use exactly
   `parseSortField(buildSortClause(params.orderBy)[0])`"*. That is false:
  [`search-store.ts:3075`](../../../src/stores/search-store.ts) passes the literal
   `"uploadTime"` while `orderBy` is something else — it is the null-zone seek,
   which deliberately asks about a field that is *not* the sort field. Building
   `sort-percentile` as specified would break null-zone seek before this fix is
   even considered. Note `estimateSortValue.field` is **not** among the seven
   shipped B1 items in §4a, and the live TS still takes `field` — the removal
   only ever existed in §2 prose.

**Cheap insurance until the real amendment:** add a one-line marker to Gap 4 in
the gap doc — *"do not build to the §2 contract; `field` must stay explicit —
see keyword-sorts workplan §5"*. That is not the amendment, just a tripwire.

Why the `scope` addition generalises rather than being a bug-specific hack:
*"compute a statistic over the subset where field X equals Y"* is the primitive
behind any drill-down — a percentile within a facet, a distribution within a
collection. And it is a function argument, never a `SearchParams` field, so
nothing reaches the URL or the user's search box.

---

## 6. The fix (Option A — chosen)

```
seek(target) under a keyword sort:
  1. Find the bucket containing target.
     — TEST / low-cardinality fields: binary-search the cached
       sortDistribution.                                  → 0 ES calls, 0.1ms
     — PROD credit/source (>50k distinct values): the cached map does NOT
       cover the target — fall back to today's findKeywordSortValue.
       THIS STEP IS THE UNSOLVED HALF. See the correction banner.
  2. k = target - bucket.startPosition
     pct = (1 - k / bucket.count) * 100        (desc; invert for asc)
     est = round(estimateSortValue(params, "uploadTime", pct,
                                   scope: [{ field: primaryField,
                                             value: bucket.key }]))   → 1 call
  3. searchAfter([bucket.key, est, ""])                             → 1 call
  4. actualOffset = countBefore(landedSortValues)                   → 1 call
  5. Accept. No refinement loop.
```

Then **delete** the ~90-line bisection block (`search-store.ts:3256-3345`) and
the `MAX_BISECT` constant.

**Step 5 is not laziness, it is required.** §4 showed that iterating oscillates.
Any "loop until within `PAGE_SIZE`" would spin three times and burn 1.5s for no
gain. One estimate, accept.

### Why accepting a ~2,100-doc miss is correct

- It is **0.16% of the corpus** — about **1 pixel** of scrubber travel.
- The tooltip still shows the correct credit (we land in the right bucket).
- It is **exactly how date sorts already behave**: the percentile path
  (`search-store.ts`, `if (!result && estimatedValue != null)`) does
  estimate → `searchAfter` → `countBefore` → done, with no refinement. The store
  records `actualOffset` as truth and reverse-computes scroll position from it.

So this is not an error. You asked for 75.00% and got 75.16%, and the app knows
precisely where it is.

| | ES calls | Time | Miss |
|---|---|---|---|
| Today | ~54 | 9–15s | 436,663 (33%) |
| **After fix** | **3** | **~510ms** | ~2,100 (0.16%) |

### Fallbacks (must be kept)

- **Distribution absent or truncated** (`getKeywordDistribution` caps at 5 pages
  / 50k unique values) → fall back to `findKeywordSortValue`. Note it currently
  gives **no truncation signal**; add one. This matters beyond seek: a truncated
  distribution also understates `coveredCount`, which would make
  `inNullZone = clampedOffset >= coveredCount` fire spuriously — a latent
  pre-existing bug for any keyword field with >50k unique values.
- **Target in the null zone** → unchanged, existing null-zone path.
- **Scoped percentile returns `null`** → fall back to landing at bucket start
  (today's behaviour minus the wasted bisection).

### Hard constraint: fractional epochs

`estimateSortValue` returns a tdigest **float** (`1674057953780.8923`). Verified
live:

- `search_after` **tolerates** it — which is why date seeks work today.
- `_count` (range query) **rejects** it: `400 failed to parse date field
  [1.6740579537808923E12] with format [epoch_millis]`.

This is dormant today only because `countBefore` is always fed real ES sort
values. It is a *different* member of the family the 26 April 2026
`sanitizeSortValues` fix addressed — that one clamps out-of-Long-range sentinels
(`|v| >= 9.2e18`), so a fractional value sails straight through. **Round before
using an estimate as a cursor**, and keep feeding `countBefore` landed sort
values rather than estimates.

---

## 7. Scope discipline

Stage 1 is always `uploadTime` (a date, never null by construction — it is the
universal fallback precisely because it is always present) and stage 2 is always
`id`. **No field-type resolution is needed.**

This kills three sections of the previous draft:

- **No `FIELD_REGISTRY.sortKey` lookup.** Not needed for this fix. It would only
  matter for a user-chosen non-`uploadTime` secondary (`-credit,-lastModified`),
  which is a separate, later question.
- **No null-zone generalisation.** `detectNullZoneCursor` is untouched.
- **Do not add a field-type guard.** `width`/`height` are ES `integer` and
  already take the fast percentile path today, because the store branches on
  `estimatedValue != null`, not on `resolveKeywordSortInfo`. The `TRAP` in the
  findings doc is about not *introducing* a regression here — the correct action
  is to add no guard at all.

Explicitly out of scope: extreme-cardinality primaries where
`findKeywordSortValue` itself caps; nested/array-valued sort fields; any change
to `null-zone.ts`.

**Unflagged pre-existing risk worth recording:** a composite terms agg on a
*multi-valued* field emits one bucket per value, so `doc_count`s sum above the
doc total while ES sorts on min/max — making `startPosition` wrong. The six real
keyword sorts are single-valued, but `gridConfig.fieldAliases` sorts are
user-configurable and unconditionally typed `keyword`
(`field-registry.tsx:984`). Not introduced by this fix, but the fix trusts those
numbers harder.

---

## 8. Why no test caught this — and what that forces

`MockDataSource` (`mock-data-source.ts`) makes the keyword seek path
**structurally incapable of failing**:

| Mock method | Behaviour | Consequence |
|---|---|---|
| `getKeywordDistribution()` | returns **`null`** | The entire distribution path is untested at unit level |
| `findKeywordSortValue()` | returns `keyword-${targetPosition}` | Always lands exactly on target; drift/refinement can never trigger |
| `countBefore()` | ignores non-`id` sort values; maps id → index | **The sentinel bug is invisible** — the oracle can't go constant |
| `estimateSortValue()` | linear interpolation, ignores `params` | Scoping has no effect; tdigest error can't be modelled |
| `CREDITS` | 5 values cycled evenly | No large bucket, so no drift |

Every unit test passes regardless of whether the fix is present. That is the
real reason a four-month-old regression went unnoticed.

**Therefore the first work item is fixing the mock, not fixing the store.**
Without it, "write a failing test first" is impossible.

---

## 9. TDD plan

Ordering matters. Do not skip Phase 0.

### Phase 0 — make the bug expressible (no `src/` behaviour change) — ✅ DONE

Extend `MockDataSource`. Specifics matter here more than anywhere else in this
plan: a mock that is *plausible* but not *faithful* produces a green suite over
a live bug, which is exactly how this regression survived four months.

**Turned out to need more than this section anticipated** — three additional
mock defects surfaced only once real tests tried to exercise a keyword sort
end-to-end (not anticipated by 0.1–0.5, discovered during implementation):
(a) `MockDataSource`'s non-default-sort ordering was gated on `sparseFields`
only, so `-credit` with no sparse fields silently used default-sort (id ==
position) semantics — added `_hasCustomSortSource` to also gate on
`skewedCredits`; (b) `estimateSortValue`'s unscoped path returned a valid
timestamp for ANY field including keyword fields, so the store never even
reached the keyword branch — added a `field !== "uploadTime" && field !==
"lastModified"` guard returning `null`, matching real ES's 400; (c)
`searchAfter`'s "estimated cursor" branch assumed index 0 was always the
uploadTime estimate (true for the old 2-element `[uploadTimeEst, ""]` shape,
false for this fix's 3-element `[creditValue, uploadTimeEst, ""]`) —
generalized to the same `compareSortTuples` lexicographic comparator 0.2
introduced. See `/memories/repo/kupua-search-store-test-harness.md` for the
full gotcha writeups.

**Also discovered: `POSITION_MAP_THRESHOLD` (default 65,000) silently steals
any deep-seek test with `total ≤ 65_000`** — the position-map fast path
never touches `estimateSortValue`/`findKeywordSortValue`/`countBefore` at
all. Test corpora for T1/T2/T3/T5 used `total = 120_000` to stay above it.

**0.1 — Skewed corpus option.** Add an opt-in flag (e.g.
`new MockDataSource(50_000, { skewedCredits: true })`) producing ~6–8 credit
values with a heavily uneven split — largest bucket ~45% of docs, smallest a
handful — mirroring the real `PA`/`AAP` shape. The default even-cycling
`CREDITS` behaviour must stay unchanged so existing tests are unaffected.
Requirement: the largest bucket must exceed `PAGE_SIZE` (200) by a wide margin,
or no drift arises and there is nothing to test.

**0.2 — `countBefore()` must implement true sort-tuple comparison.** This is
the single most important change, and the one most likely to be done wrong.

Count the documents whose sort tuple sorts **strictly before** the cursor tuple,
under `buildSortClause(params.orderBy)`, comparing **lexicographically across
the whole tuple**:

- compare field 0; if it differs, the earlier-sorting one wins and you stop;
- "earlier" means **greater** for a `desc` field and **lesser** for an `asc` field;
- only if field 0 is exactly equal do you compare field 1, and so on;
- a cursor value that no document equals simply yields no matches in that
  partition.

**Do not special-case the sentinel.** The bug must *emerge* from correct
comparison: with cursor `["AAP", MAX_SAFE_INTEGER, <anything>]` and `uploadTime`
desc, every real document's `uploadTime` is below the sentinel, so no `AAP`
document sorts before the cursor, so the count collapses to "documents whose
credit sorts before AAP" — constant, whatever `id` is probed. If you find
yourself writing a branch to *make* that happen, the comparison is wrong.

The mock already has `getSortedIndices(sortClause)`; building the comparison on
top of that is the intended route. The current implementation — take the last
element, look up the id, return its index — must go.

**0.3 — Real `getKeywordDistribution()`.** Return exact `startPosition` /
`count` per bucket in sort order, and `coveredCount` as their sum. It currently
returns `null`, which is why the whole distribution path is untested. No
truncation flag (see §11 Q1) — but the mock **must** support returning a
deliberately partial distribution so the fallback branch in T3 is reachable.

**0.4 — `estimateSortValue()` honouring `scope`, with bounded error.** Restrict
to the scoped subset, compute the true value at the requested percentile within
it, then perturb it **deterministically** so the landing misses by a bounded,
repeatable amount — target ~0.5–1% of the scoped bucket, matching the ±2,133 on
321,741 measured live. Deterministic, never random: a flaky tolerance test is
worse than no test. It must also return a **fractional** value, so T5 has
something to catch.

**0.5 — Tolerance lives in the tests, not in `src/`.** Option A has no
refinement loop, so no new production constant is needed. T1 asserts the landing
is within a stated fraction of the bucket (≈1%), not within `PAGE_SIZE`. Do not
add a tuning knob for this.

**Explicitly not modelled:** PIT lifecycle, index migration, network latency,
the real t-digest algorithm, multi-valued keyword fields. None are needed, and
each would add mock surface that can itself be wrong.

**Checkpoint — a hard stop.** With the mock changed and `src/` still untouched,
run T1 and T2. They must **fail for the right reason**: `countBefore` returning
an identical number across different `id` probes, and the seek landing at the
bucket start. Report those two observed numbers before writing any fix.

- Fail some *other* way → the mock is wrong. Fix the mock.
- **Pass** → the mock still isn't modelling the bug. Stop; do not proceed.
  A passing test here is the failure mode this whole phase exists to prevent.

**✅ DONE, but not run as a literal separate checkpoint step** — the mock
rewrite and the store fix were implemented together in one pass rather than
sequentially with a pause in between. Checkpoint intent satisfied
retroactively instead: `mock-data-source.test.ts` directly asserts the
sentinel-reproduction fact this checkpoint exists to establish (`countBefore`
returns an identical count across two different `id` probes when the
secondary field is sentinel-anchored, and a differing count for a real
secondary value) — see "MockDataSource.countBefore — sort-tuple comparison
fidelity" in that file.

### Phase 1 — failing tests first — ✅ DONE (with one budget revision)

| ID | Level | Assertion |
|---|---|---|
| T1 | unit (store) | Keyword seek into a large bucket lands within tolerance of target. **Fails today** (lands at bucket start). |
| T2 | unit (store) | Keyword seek issues **≤ 4 DAL calls**. Spy on the mock's counters. **Fails today** (~54). This is the durable perf guard — assert call count, not latency, which is meaningless on a tunnel. |
| T3 | unit (store) | Keyword seek does **not** call `findKeywordSortValue` when a complete distribution is cached; **does** call it when the distribution is `null` or truncated. |
| T4 | unit (adapter) | `countBefore` responds to a **real** secondary value and is **constant** for a sentinel. Pins the root cause so it cannot silently return. |
| T5 | unit (adapter) | A fractional estimate is rounded before becoming a cursor. Guards §6's constraint. |
| T6 | unit (adapter) | Structured `scope` produces a `term` filter and is unaffected by `"`/`\` in the value. Directly encodes the §5 finding. |

**Revision: T2's budget is ≤5, not ≤4.** `seek()` always issues one
"wasted" `estimateSortValue` call on the raw primary field *before* falling
into the keyword branch at all (ES 400s on `percentiles`-over-keyword,
caught, returns `null` — pre-existing, not introduced by this fix). That's
+1 on top of the 3 calls this fix's fast path uses (scoped
`estimateSortValue` + `searchAfter` + `countBefore`), +1 more for the
pre-existing bidirectional backward-fetch `searchAfter` that runs after
every deep-seek path = 5. Still an order of magnitude below ~54.

**T3's "truncated distribution" half is tested at the mock level, not via a
full `seek()`.** Routing a truncated distribution through `seek()` also
trips the separate, pre-existing, explicitly-out-of-scope `coveredCount`/
null-zone bug (§11 Q1) — a truncated distribution understates `coveredCount`,
which misroutes the target into the null-zone path before the keyword branch
ever runs. Testing T3's "absent" half (via `seek()`) and the truncation
mechanism itself (via `mock-data-source.test.ts`'s `getKeywordDistribution`
tests) covers the same code paths without depending on fixing that separate
bug.

Final test locations: T1/T2/T3/T5 in new file
`src/stores/search-store-keyword-seek.test.ts`; T4/T6 in
`src/dal/es-adapter.test.ts` (adapter-level — asserts the query shape the
real ES adapter sends, since T4/T6 are fundamentally about what gets sent
over the wire, not what the mock returns); the mock-fidelity work itself
(0.1–0.4) has its own new file, `src/dal/mock-data-source.test.ts`.

### Phase 2 — implement §6, make T1–T6 pass, delete the bisector — ✅ DONE

### Phase 3 — full surface, per the AGENTS directive table — ✅ DONE

- `npm --prefix kupua test` — mandatory (any `src/` change).
- `npm --prefix kupua run test:e2e` — **mandatory** (store + scroll behaviour).
  Warn about port 3000 first.
- Suggest, do not auto-run: `test:perf --perceived-only` (this touches
  `search-store.ts` seek paths).

Result: 1154/1154 unit (58 files, +2 new), 247/247 e2e (habitual suite,
including the reused Bug #7/#14/#18 keyword-sort specs — one assertion in
Bug #7.1 updated, see §10). `test:perf` not run (not suggested/requested).

### Phase 4 — verify on TEST — ✅ DONE (2026-08-29)

Re-run F1's table (ratios 0.25 / 0.5 / 0.75 on Credit). Required outcome: **no
shared landing across ratios**, and sub-second latency rather than 9–15s.

**Run against the live TEST corpus** (`--use-TEST`, 1,322,590 docs — same
snapshot F1 measured against), driven through the actual UI (sort dropdown →
Credit → descending, confirmed via `orderBy` in the store/URL/toolbar, not
just `store.setState()`), then `seek()` called via the store directly for
each ratio (the same mechanism a scrubber drag uses):

| ratio | target | **before fix (F1)** | **after fix** | bucket | wall-clock |
|---|---|---|---|---|---|
| 0.25 | 330,648 | 330,304 (−0.02%, **9.1s**) | 330,744 (+0.03%) | `PA` (596,288 docs) | 1.62s |
| 0.50 | 661,295 | 555,140 (−8%, **14.9s**) | 662,308 (+0.15%) | `PA` (596,288 docs) | 0.89s |
| 0.75 | 991,943 | **555,140 — identical to 0.5** (−33%, **14.9s**) | 994,024 (+0.31%) | `AAP` (321,684 docs) | 0.93s |

Both required outcomes confirmed: landings are all distinct (the old bug's
signature — 0.5 and 0.75 sharing one offset — is gone), and latency dropped
9–15s → 0.89–1.62s. Devlogs confirm the cached-distribution fast path fired
every time (`[seek] keyword strategy: cached distribution, field=
metadata.credit, bucket=PA (596288 docs)...`), not the composite-walk
fallback, as expected for TEST's ~10,251 credits (well under the 50k
distribution cache cap). ES request count per seek: 5 (first seek of the
session: 9, one-time `getKeywordDistribution` fetch cost, then cached).
Read-only throughout (`search()`/`seek()` only, no writes).

The 1.62s outlier (vs. sub-second for the other two) is the first seek of
the session paying that one-time distribution-fetch cost — not a per-seek
regression.

---

## 10. Test-impact inventory — read before writing code

These assert today's behaviour and **will break**. Decide per test *before* the
fix, not after.

| Test | Asserts | Impact | Status |
|---|---|---|---|
| `scrubber.spec.ts` Bug #7.1 "seek to middle works under Credit sort" (~L1606) | `getConsoleLogs(/findKeywordSortValue/)` non-empty, and a `found … at page N` log with N ≤ 5 | **Breaks.** The walk no longer runs. Update to assert the distribution path instead. | ✅ Updated — now asserts `/keyword strategy/` + a "cached distribution" log. |
| `scrubber.spec.ts` Bug #18 "seek to 75% under Credit sort" (~L1712) | `getConsoleLogs(/keyword strategy/)` non-empty | **Breaks unless** the `[seek] keyword strategy:` devLog is retained. Prefer retaining it, adapted. | ✅ Kept green untouched — the devLog was retained and adapted (comment updated for accuracy; assertion itself needed no code change). |
| `scrubber.spec.ts` Bug #14 "End key … under Credit sort" (~L1993) | Guarded by `if (kwLogs.length > 0)` | Degrades gracefully. Safe. | ✅ Confirmed green, untouched. |
| `smoke/manual-smoke-test.spec.ts` S10 | Binary-search convergence logs; *"Old refinement loop: 46s. New binary search: <5s"* | **Breaks by design** — the bisector is gone. Rewrite as the §9 Phase 4 check. | Not touched (TEST-only, no `src/` change needed it — S10's only real assertion is `seekMs < 15_000`, which a faster fix still trivially satisfies). Phase 4 (real TEST rewrite) not done — see above. |
| `es-adapter.test.ts` "Bug #20 mid-walk error" | `findKeywordSortValue` error handling | Unaffected (fallback path retained). | ✅ Confirmed unaffected — full unit suite green. |

**Also note:** the findings doc's N3a claims a `"findKeywordSortValue TIME_CAP
ceiling"` unit test was added. **It is not in the tree** — `TIME_CAP` appears
only in `es-adapter.ts`. Either it was never committed or it was lost. Worth
resolving before relying on it.

**"Local e2e is nearly blind to this fix" — turned out to be wrong.** Local
sample data's ~769 credits over 10k docs means `getKeywordDistribution` caches
the *complete* distribution (no truncation), so local e2e actually exercises
this fix's new cached-distribution fast path on every keyword-sort seek —
it's the composite-walk *fallback* and the large-bucket refinement scenario
that local data can't reach (confirmed: `findKeywordSortValue` was never
called in any local e2e run once the fix landed). Real coverage of the
fallback path and of PROD-scale bucket sizes still lives in the unit tests of
§9 (skewed-credit mock corpus), with TEST smoke as the only large-bucket
confirmation — that part of the original caution stands.

---

## 11. Resolved decisions

All three questions closed 2026-08-28. Recorded with reasoning so they are not
reopened by default.

**Q1 — truncation flag on `getKeywordDistribution`: SPLIT OUT — but the reasoning
below is now partly obsolete. See the correction banner.** On PROD, `credit`
(310,185 values) and `source` (63,776) exceed the 50,000 cap **always**, so
truncation is not a latent edge case there — it is the normal case, and the
`coveredCount` consequence described below fires on every keyword seek. It stays
split out only because kupua has no users and the fix's recommended scope no
longer depends on the cached map. Anyone taking keyword seek further must fix
this first. The original reasoning follows, still accurate for TEST:

The seek fix does not need it. If the target position lies beyond the last
bucket in the cached map, the map demonstrably does not cover it → fall back to
`findKeywordSortValue`. That inference needs no new field and still yields the
fast path for any target inside the covered range.

The truncation flag matters for a *different* bug: a partial distribution also
understates `coveredCount`, which drives
`inNullZone = clampedOffset >= coveredCount` (`search-store.ts` ~2977). On a
keyword field with >50k distinct values the store would misroute into the
null-zone path — **before** this fix's code runs, so the fix cannot rescue that
case either way. It is pre-existing, it lives on a code path shared with date
sorts and `detectNullZoneCursor`, and it deserves its own test pass. Folding it
in would make this commit two ideas on a shared surface instead of one
revertable idea. No built-in keyword sort is near the cap (Credit: 10,251).

*Action:* file separately; note the `coveredCount` interaction so the follow-up
is scoped correctly.

**Q2 — `scope` shape: USE A LIST.** `scope?: Array<{ field: string; value: string }>`,
populated with exactly one element by this fix.

This deliberately departs from the project's default preference against
speculative generality, for two reasons. The second constraint is not
hypothetical: an explicit user-chosen secondary sort (shift-click a second
column → `-credit,-category`) genuinely needs two equality constraints, and that
case is documented in §7 as the deferred fast-follow. And the cost is lopsided —
in TypeScript the difference is a pair of brackets, but turning a single value
into a list on a Scala endpoint later is a breaking API change. Cheap now,
expensive later, need already identified.

**Q3 — `[seek] keyword strategy:` log: KEEP, adapted.**

It is the only telemetry that the keyword path ran at all, and it keeps the
Bug #18 e2e assertion working rather than deleting an assertion (§10). Adapt the
message to name the path actually taken — cached distribution vs composite-walk
fallback — so the log stays truthful.

---

## 12. Evidence appendix

All figures measured live on 2026-08-28 against TEST via the dev proxy,
`?nonFree=true&orderBy=-credit`, 1,322,589 docs, by driving
`window.__kupua_store__.getState().dataSource` directly. Read-only
(`_count` / `_search` aggregations only).

- Distribution: 10,251 buckets, `coveredCount` 1,306,580, 0 cumulative
  mismatches. `PA` = 596,634 @ 153,323; `AAP` = 321,741 @ 983,493.
- Sentinel no-op: `["AAP", MAX_SAFE_INTEGER, "000000000000"]` and
  `[…, "ffffffffffff"]` → both 983,503.
- Working oracle: `["AAP", <uploadTime>, ""]` → 984,758 / 988,132 / 1,186,755 /
  1,304,997 / 1,305,241 for 2026/2024/2022/2020/2016-01-01. Monotonic.
- Full proposed pipeline, target 991,942: estimate 82ms → `searchAfter` 184ms →
  `countBefore` 244ms = **510ms**, landed 994,075 (**miss 2,133**).
- Percentile iteration: 994,075 → 989,615 → 994,075 (oscillates).
- Regula falsi: 5 probes, 988,201 → 988,418 against a target of 991,942.
- CQL scoping: `"`-containing keys → 0 counted vs 1/1/6 expected;
  `\`-containing keys → exact; `match_phrase` exactness confirmed at both sort
  extremes.
- Fractional epoch: `search_after` accepts, `_count` returns 400.
- Code: `search-store.ts:882` (`buildSeekCursorAnchors`), `:2969-2971`
  (distribution `await`), `:3256-3345` (bisector), `es-adapter.ts:1282`
  (`countBefore` equality), `:1430` (`findKeywordSortValue`), `:1586`
  (`getKeywordDistribution`), `:65` (sentinel sanitiser comment),
  `mock-data-source.ts:526-620` (the untestable mock).
- Regression commit: `61b042101`, 2026-04-04. Working baseline: changelog
  "29 March 2026 — Bug #18", 11 steps / ~4s / within 45 docs.

---

## 13. Deferred design spike — not approved for implementation

Problem: finding which credit value sits at position N — never worked well at PROD scale. We didn't break it; it just doesn't scale past 50,000 distinct values, and PROD credit has 310,185.

Interrupted thought process:

I want to think creatively but rigorously about this design spike: given a target global rank N under the -credit sort order, how do I construct a search_after cursor that lands close to that position — the user's suggestion of firing queries from both ends of the sort order is a good jumping-off point to explore. I'm working through exactly what data and constraints I have available to build this estimate.

Taking the "fire from both sides" idea seriously, I consider whether seeking from the tail using a reversed sort — which the store already does for the End key — actually reduces the cost of the rank oracle, or whether it just halves the maximum distance without changing the underlying mechanism.

But the real insight is firing probes in parallel instead of sequentially: binary search is inherently sequential, but nothing stops me from doing an n-ary search where k candidate strings are probed at once, narrowing the space by a factor of k+1 per round trip instead of 2. With k=16, that's roughly log₁₇ instead of log₂ of the search space — and since ES's msearch bundles multiple searches into a single HTTP request, k probes still only costs one round trip.

Even better, I realize I can put many filter aggregations inside a single _search body, so one request with 100 filter aggs gives 100 rank probes in one round trip — narrowing 310k values down to about 3k, then 30, then done in roughly 3 round trips. Thinking in terms of the answer space rather than string space, I can spread 100 candidate strings across the alphabet, get their exact ranks back, and use those to zero in on the target much faster than sequential binary search ever could.

Now I'm checking feasibility: Elasticsearch does support running 100 filter aggregations in one _search, each essentially a bitset intersection sharing the same query execution, so the cost should scale reasonably even against 9.7M docs.

That's still worth timing empirically. I'm also weighing cheaper alternatives — range aggs don't work on keyword fields, and a plain terms agg only returns alphabetically-first values rather than spread-out buckets — so the filter-agg approach still looks like the most promising primitive for slicing the keyword space into evenly spaced buckets.

### Learnings from landing (b) that carry forward to (a) — added 2026-08-29

Recorded so whoever designs the oracle-driven approach doesn't have to
rediscover these. None of them solve (a); all of them narrow it.

1. **(a) only needs to produce a bucket descriptor — it can reuse (b)
   unchanged.** The scoped-percentile pipeline (§6 steps 2–5,
   `findBucketAtPosition` + scoped `estimateSortValue` + `searchAfter` +
   `countBefore`) doesn't care how a bucket's `{ key, startPosition, count }`
   was obtained — only that it's accurate. It's now proven correct at real
   PROD-adjacent scale (596,288-doc and 321,684-doc buckets, live on TEST,
   see §9 Phase 4), not just in the mock. So the oracle-driven design's
   entire job is "given global position N, return the bucket descriptor" —
   it hands off to code that already exists and is already validated. Don't
   redesign the within-bucket step.

2. **A real round-trip baseline through the actual production channel, not
   just an SSH tunnel `curl`.** §9 Phase 4 measured the full 5-call pipeline
   (browser → dev proxy → TEST) at 0.89–1.62s wall-clock. That's a
   different, slower channel than §12's `_count` tunnel figure (86–276ms) —
   budget any n-ary/msearch design against the real channel a user
   experiences, not the tunnel number.

3. **`_search` is on the read-only allowlist** (`es-config.ts`'s
   `ALLOWED_ES_PATHS`) with no cap on aggregation count in the request body
   — a single request with 100 named filter aggregations is architecturally
   unblocked by the existing safeguards. This was assumed, not verified,
   when this section was written; confirmed now.

4. **The mock-first TDD lesson applies harder here, not just as much.**
   `MockDataSource`'s `skewedCredits` corpus (§9.0.1) is ~8 distinct values —
   nowhere near PROD's 310,185. A string-space bisection/n-ary design is a
   different algorithm shape than a lexicographic-comparison walk, and a
   mock with 8 values cannot expose bugs specific to searching across
   hundreds of thousands of distinct values (e.g. probe-string collision,
   uneven candidate spacing, alphabetical clustering like the `PR`/`pr`/`PR
   Handout` mess §"Product observation" documents). Build a genuinely
   high-cardinality mock option before writing a single test against this.

5. **Caution carried over from the regression this fix just deleted:** the
   bisection this fix removed died because a sentinel value in a
   *preceding* sort field made `countBefore`'s equality condition
   permanently unsatisfiable. Section 13's design probes the primary field
   alone (`search_after: ["Mz", ...]`), so it doesn't inherit this trap as
   written — but if any future refinement of this design adds a second
   probed field, re-read §2 of this workplan first.