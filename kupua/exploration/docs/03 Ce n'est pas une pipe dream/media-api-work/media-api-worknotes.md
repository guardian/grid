# Media-API Gap Closure — Work Notes

> **Perf note:** When writing the new grid-api adapter, replicate the `Date.now()` wrapping that `es-adapter.ts` does on its 4 public methods — the types (`fetchDuration?: number`), store, UI, and harness all consume it generically and will Just Work.

**Date:** 28–29 May 2026  
**Source:** Planning conversation (mk + Opus 4.6)  
**Companion doc:** `media-api-gap-closure-feasibility.md`

---

## Branch Strategy

All kupua code lives on `mk-next-next-next`. Media-api changes develop on the
same branch (because you need both to test end-to-end).

**Commit discipline:** Two commits per gap, split by folder:
- Commit A: media-api changes only (all files under `media-api/`)
- Commit B: Kupua changes only (all files under `kupua/`)

This enables clean extraction at PR time.

**PR extraction recipe:**
```bash
git fetch origin main
git checkout -b media-api/<gap-name> origin/main
git cherry-pick <commit-A-hash>
git diff origin/main --stat   # verify only media-api/ files
git push -u origin media-api/<gap-name>
```
Open PR from `media-api/<gap-name>` → `guardian/grid:main`.

After merge to main:
```bash
git checkout mk-next-next-next
git fetch origin main
git rebase origin/main   # commit A silently drops (already in main)
```

---

## Scope Confirmation

All media-api modifications are **strictly within `media-api/`** in the monorepo.
Files from `common-lib/` are referenced (helpers reused) but never modified.

---

## Argo Decision

**All new endpoints use Argo.** No exceptions, no mixed approach.

Cost varies by endpoint type:
- Scalar/aggregation responses (Gaps 3, 4, 5, 6, 7, 17, 18): trivial — `respond(data)`
- Infrastructure (Gap 2 PIT): trivial — `respond(Json.obj("pitId" -> id))`
- Image-returning (Gaps 1, 8, 12, 13): reuse existing `imageResponse.create()` / `hitToImageEntity`

---

## Enrichment Decision

**No `?enrich=false` parameter. All image-returning endpoints return fully
enriched images.**

Rationale: Kupua is read-only today but will need per-image `actions` arrays
to gate action UI (show/hide delete, edit, lease buttons) — same as Kahuna.
Designing for "skip enrichment" creates a prototype shortcut that would need
to be undone later.

Endpoints that don't return images (Gap 8 position map, Gap 13 ID range,
Gap 17 count) aren't "un-enriched images" — they're structurally different
responses that never contained images.

---

## Kupua-Side Migration Pattern: Strangler Fig

Kupua has a clean `ImageDataSource` interface. Migration uses an adapter that
delegates to direct ES for methods not yet backed by media-api. As PRs land,
methods flip one by one. No feature is gated on all gaps existing simultaneously.
The direct-ES adapter is deleted when all gaps are closed.

---

## Workplan Structure

One workplan doc per gap. No master plan. Don't write all upfront — write the
first, ship it, learn from the review cycle, then write the next batch.

**Per-gap doc contents (~50-100 lines):**
- One-line goal
- Endpoint contract (from feasibility doc)
- Files to touch (from feasibility doc)
- Kupua-side change (which `dal/` method flips)
- Test plan
- "Done when" checklist
- Out-of-scope / anti-goals

**Execution order:**
1. Gap 17 (`count`) — Trivial, validates the whole workflow
2. Gap 2 (PIT) + Gap 1 (`searchAfter`) — foundational
3. Gap 12 (`mget`), Gap 18 (`getAggregations`), Gap 11 (`includeFields`) — Easy, parallelisable
4. Gap 3, 4, 5, 6, 7, 9 — Moderate/Easy single-purpose endpoints
5. Gap 10 → Gap 8 → Gap 13 — null-zone family, Opus pre-research required
6. Gap 15 — only after human Kahuna audit

**Open question for Gap 17 specifically:** `GET /images?length=0` already returns
`total` — Kupua may not need a dedicated `/images/count` at all. Before writing
the Gap 17 plan, verify whether the existing workaround suffices. If so, use
Gap 2 or Gap 12 as the workflow-validation first PR instead.

---

## Gaps Requiring Opus Pre-Research

Gaps 8, 10, 13 (null-zone / streaming / position map). The feasibility doc flags
subtle correctness bugs that were fixed in `c1998394b`. Before Sonnet implements
these, Opus should read the kupua TS implementation in detail and write an
algorithm specification + edge case inventory.

---

## Model Assignment

- Gap workplan writing: Sonnet High
- Gap implementation (Scala): Sonnet High
- Null-zone pre-research (Gaps 8, 10, 13): Opus
- Kupua adapter wiring: Sonnet High

---

## Running Together

From Grid repo root (run these after every reboot):

```bash
dev/script/setup.sh             # provisions Docker, localstack, nginx, config
dev/script/start.sh --use-TEST  # starts auth + media-api with TEST domain config
```

`start.sh --use-TEST` overrides domain to `test.dev-gutools.co.uk` so your TEST panda
cookie covers local media-api — no separate local cookie needed. Visit
`https://media.test.dev-gutools.co.uk` once to get the cookie if you don't have it.

Start Kupua (from Grid repo root, separate terminal):
```bash
kupua/scripts/start.sh --use-TEST
```

**Check what's alive:**
```bash
ps aux | grep nginx | grep -v grep
curl -sk -o /dev/null -w "%{http_code}" https://api.media.local.dev-gutools.co.uk
curl -s  -o /dev/null -w "%{http_code}" http://localhost:9001
```
Both curl commands should return `401` (alive, needs auth). `000` means the service is down.

---

## Execution Order by Feature Availability

The abstract execution order (in the Workplan Structure section above) is by
difficulty. This section re-analyses by *user-visible capability*: which gaps must
close together before a Kupua feature actually works end-to-end?

### Test journey: 1.3M seek mode, default sort

> 1.3M results (seek scroll mode), default uploadTime sort.  
> Seek to middle → scroll up beyond buffer → seek to 75% → scroll down beyond buffer.

**Minimum gap set (6 gaps):**

| Gap | Role in the journey |
|---|---|
| 2 (PIT) | Consistent snapshot across the whole session — 1.3M results shift without it |
| 1 (searchAfter) | Every page load. ES caps offset pagination at 100,000; can't paginate without it |
| 9 (reverse sort) | "Scroll up beyond buffer" = backward searchAfter from buffer start |
| 4 (estimateSortValue) | "Seek to middle" / "seek to 75%" = find uploadTime at that percentile |
| 3 (countBefore) | After seeking, scrubber needs "where am I?" = count docs before position |
| 7 (getDateDistribution) | Scrubber tick marks — without this, seeking is blind (no visual landmarks) |

**Not needed for this journey:**

- Gap 10 (null-zone): uploadTime is never null. Only matters for dateTaken or keyword sorts.
- Gap 5, 6: keyword distribution — only for keyword-sorted scrubber.
- Gap 8: position map — two-tier mode (1k–65k), not seek mode.
- Gap 11, 12, 13, 15, 17, 18: unrelated to core scroll.

### Internal dependencies

```
Gap 2 (PIT)  ←  Gap 1 needs PIT for consistency
Gap 1 (searchAfter)  ←  Gap 9 is a param on Gap 1's endpoint
Gaps 3, 4, 7  ←  independent of each other; all need Gap 1's query/filter infrastructure
```

### Natural PR groupings (feature-driven)

| PR bundle | Gaps | What it unlocks |
|---|---|---|
| **Pagination infra** | 1 + 2 + 9 | Forward/backward scrolling in 1.3M results (no seeks yet) |
| **Seek support** | 3 + 4 + 7 | Scrubber seeking with tick marks and position display |

Neither bundle is useful alone — the 33% problem is real here. Scrolling without
seeking gives a broken scrubber. Seeking without scrolling gives positions you can
jump to but can't paginate from.

**Implication for the hybrid strategy:** if submitting early PRs to learn the review
cycle, either (a) pick unrelated easy gaps (Gap 17, 12, 18) as the learning PRs,
or (b) submit the pagination-infra bundle as one PR (larger, but feature-complete and
testable). Don't submit Gap 1 alone — it's not demonstrable without 2 + 9.

---

## API vs ES Performance Testing Strategy

**Date:** 31 May 2026

### Question

Can the 6 seek-mode gaps serve as a test bed for API-vs-ES performance comparison?

### Answer: Not directly via e2e-perf tests

Every perf test begins with initial load → `search()` + `getAggregations()` + `openPit()`.
The 6 gaps don't include `getAggregations` (Gap 18). With graceful absence, facets
still render via direct-to-ES — there's no "API-only" mode possible without Gap 18.

Even with Gap 18 added (7 gaps total), the keyword-sort tests (P3b, P9, PP3) and
position-map tests (PP10, JB4) remain blocked on Gaps 5/6/8.

### Dual-mode strangler fig adapter

Instead of running the full test suite in "API-only" mode, instrument the strangler
fig adapter with a **shadow traffic** comparison mode:

**Mode 1 — ES-primary, API-shadow:**
- ES result drives the UI (no behaviour change)
- API call fires in parallel, result discarded
- Logs per-call latency delta: `{ method, es: 34ms, api: 51ms, delta: +17ms }`
- Answers: "What's the raw per-call cost of the API hop?"

**Mode 2 — API-primary, ES-shadow:**
- API result drives the UI (real frame-budget pressure)
- ES fires in parallel for correctness diffing (shape mismatches caught early)
- Answers: "What does the app actually feel like under API latency?"
- This is the mode where P2/P8 jank metrics become meaningful

Both modes are the same adapter with a `mode: 'es-primary' | 'api-primary'` flag,
gated behind a dev env var (`VITE_SHADOW_API`). ~20 lines of wrapper per method.

### Why shadow > running tests twice

Timing depends on concurrent conditions (PIT refreshes, in-flight calls, main-thread
pressure). Shadow traffic captures both paths under identical concurrency. Running the
suite twice with different adapters gives two separate sessions with different timing
contexts — less apples-to-apples.

### Why `searchAfter` specifically (not any other gap)

Two requirements for the first gap: (a) best perf measurement signal, (b) app stays
usable even if the API hop is slow. `searchAfter` uniquely satisfies both.

**Best measurement signal:** Highest-frequency ES call — 10–50× per scroll session.
Statistical significance comes from volume. One-shot calls (PIT open, countBefore,
estimateSortValue) give a single data point; `searchAfter` gives a distribution.

**Most latency-tolerant:** The architecture was specifically designed to absorb
`searchAfter` variance:

- *Overscan* — buffer extends trigger before the user reaches the edge. Extra latency
  eats into the overscan budget but doesn't immediately cause visible harm.
- *Non-blocking* — UI keeps rendering the existing buffer. Worst case is blank cells
  at the edge, then fill-in. Already a measured/tolerated scenario (P2 tracks blank
  flashes explicitly).
- *No coordination dependency* — nothing waits for `searchAfter` to return before
  proceeding. Grid keeps scrolling, scrubber stays valid, focus stays put.

**Contrast with operations that WOULD break under added latency:**

| Operation | What blocks on it | +50ms effect |
|---|---|---|
| `search()` | Entire initial render | Longer white screen — very visible |
| `estimateSortValue` | Seek resolution | Scrubber thumb hangs mid-seek — feels broken |
| `countBefore` | Scrubber position label | "Item 650,000 of 1.3M" appears late — janky |
| **`searchAfter`** | Nothing currently visible | Overscan absorbs it; invisible unless very fast scroll |

**Edge case — sort-around-focus:** `search()` + `countBefore()` + `searchAfter(reverse)`
fire as a coordinated triple. The `searchAfter` is the last step, hidden behind the
sort transition animation (~300ms). Added latency is invisible up to that budget.

### Minimum useful signal: Gap 1 only

`searchAfter` is the hot path — called 10–50× per scroll session. If the API hop
adds 15ms per call, it shows immediately in P2/P8 frame jank. Everything else
(`countBefore`, `estimateSortValue`) is once-per-seek, latency hidden behind animation.

**Gap 2 (PIT) is not needed for the perf test.** A PIT ID is opaque cluster-side
state — ES doesn't track who opened it. Kupua opens PIT via direct-to-ES (existing
code), then passes that `pitId` to the media-api `searchAfter` endpoint. Same cluster,
same state. `openPit` is also called once per session (hidden behind initial load) so
even if it went through the API, the per-call latency is invisible to scroll metrics.

**Cheapest experiment:** Ship Gap 1 alone, add shadow instrumentation on `searchAfter`,
run P2/P8 against local media-api (backed by TEST ES). That answers the go/no-go
question before committing to any other gaps.

### Progression

1. Gap 1 → shadow mode on `searchAfter` → raw latency data → go/no-go
2. If viable → flip mode → real perf numbers under frame pressure
3. Remaining gaps ship with confidence that the API layer won't regress UX
