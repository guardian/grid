# Kupua performance opportunities — evidence-led workplan

> **Date:** 13 September 2026
> **Status: Complete.** This programme is done and retained as an evidence and decision record;
> it authorizes no further runtime change. Orientation, live attribution, measurement owners and
> the latest four-run direct-ES and local-media-api campaigns are complete. Each campaign recorded 32 jank metrics, 15 short
> perceived scenarios and 8 long-journey steps
> ([direct jank](../../../e2e-perf/results/audit-log.md#added-new-scenarios-04c3fcadc-dirty-2026-09-13),
> [media jank](../../../e2e-perf/results/audit-log.md#new-scenarios-04c3fcadc-dirty-2026-09-13),
> [direct perceived](../../../e2e-perf/results/perceived-log.md#short-added-new-scenarios-04c3fcadc-dirty-2026-09-13),
> [media perceived](../../../e2e-perf/results/perceived-log.md#short-new-scenarios-04c3fcadc-dirty-2026-09-13),
> [harness inventory](../../../e2e-perf/README.md#two-measurement-systems)). P14d's visible-image
> prefetch cancellation defect is fixed and validated.
> **Scope:** `kupua/` frontend and its measurement infrastructure. Backend, media-api,
> Elasticsearch mappings, image infrastructure, and production changes are record-only.
> **Migration constraint:** Direct-ES remains a supported mode while the media-api strangler
> migration is in progress. Neither mode may be treated as disposable.

## 0. Decision

### P17 cascade-attribution verdict — closed 13 September 2026

No safe worthwhile client change is justified. The exact revision-4 action in the running
development app reproduced two accepted 198-image prepends, `bufferOffset -396`, real thumbnails,
and zero suppressed requests. Each accepted publication began a concentrated long animation
frame: 128ms/76ms blocking and 113ms/62ms blocking, with corresponding 117ms and 100ms frame gaps.
The frames were script-owned rather than layout-owned: React scheduler work took 60ms/51ms and
the grid scroll listeners took 63ms/58ms in aggregate, while forced style/layout was 5ms or less
and the LoAF style/layout phases began only after that script work. The reverse requests themselves
took about 174ms and 179ms; their waits occurred before the severe frames.

The smallest controlling operation is the buffer-change `handleScroll()` re-fire in
`useScrollEffects`, using the virtualizer range during accepted prepend reconciliation. In the
development trace it admitted the second `extendBackward` 49ms after generation 1 published and
before generation 1's compensated scroll event was delivered. The synchronous layout effect then
moved `scrollTop` by 19,998px for each generation. This is not evidence that the compensation
assignment or browser layout is intrinsically expensive; it is evidence that development React's
publication/reconciliation ordering exposes the existing two-request cascade.

The same unchanged source in a production React build, with the private TEST index/bucket settings,
real decoded thumbnails and all requests forwarded through the guarded app on `:3000`, did not
reproduce material client cost. Its accepted prepend produced two DOM commit bursts, a 30,300px
compensation, no LoAF or frame over 50ms, and a 25ms maximum frame. It also did not naturally admit
a second prepend after compensation. Therefore the maintained P17 severity is a development-runtime
signal, not evidence that users pay for a severe two-prepend production cascade.

Do not tune cooldowns, coalesce pages, change keys/page size/overscan/thresholds, defer the anchor
handoff, or suppress the second request from this evidence. Coalescing two reverse pages is the
narrowest conceivable implementation candidate, but it would add first-page latency, cancellation
and exact-anchor risk to remove a cascade that production ordering already avoids. Stage B is not
earned. Retain P17 as a dev/harness regression signal and reopen only if a production trace or user
report demonstrates two accepted prepend generations with a frame over 50ms.

### P18 production-attribution verdict — closed 13 September 2026

The P18 implementation premise is false: the exact 1 → 100 contiguous in-buffer Shift-click with
Details already open did not reproduce a material render tail in a React production runtime. Two
independent cold-except-anchor runs completed with maximum frames of 25ms and 24ms, p95 frames of
9ms in both, and no long task or frame over 50ms. Visual settle was 249ms and 328ms; the owned
direct-ES `_mget` accounted for 147ms and 232ms and completed at 184ms and 271ms respectively.
The first run recorded 0.0157 layout shift while building the 8,905px panel, but no corresponding
long task; paint timing exposed no post-action paint entry.

This disconfirms the development-build 81–127ms post-reconcile tail as a worthwhile production
problem. No concentrated React owner was available to attribute, so the allowed diagnostic
variation was not used. Do not implement selected-set summary derivation, subscription changes,
memoization, deferred rendering, or a selection-store rewrite from P18 evidence. P18 remains useful
as a development/harness regression signal, but Stage B is not earned. Proceed to the separately
bounded P17 investigation when prioritization resumes.

Do **not** begin with a repository-wide optimization pass.

Kupua already has enough performance material to distinguish one demonstrated frontend
problem from a long list of plausible but unmeasured costs:

1. **P8 table fast-scroll attribution is complete, but implementation is deferred.** Horizontal
  column virtualization is strongly supported technically; table view's low usage makes the
  regression-sensitive work poor value today.
2. **Detail-image arrival is indefinitely deferred by product decision.** It remains measured and
  documented, but do not schedule progressive thumbnail→full-image work unless that decision is
  explicitly revisited.
3. **P17 and P18 are closed by production disconfirmation.** P17's exact development cascade is
  publication/reconciliation script work, but production React completed one real prepend in 25ms
  and did not admit the second generation. P18 likewise did not reproduce above 25ms. PP11 is
  measured but its likely gain does not yet justify restoration-state-machine risk.
4. **Explicit Filters expansion now bypasses only the aggregation debounce.** Cache, cancellation,
  batching and circuit-breaker safeguards remain; query changes and hover prefetch stay debounced.
  C6's bounded registered-typeahead fix now propagates the existing cancellation signal; no
  debounce or coalescer was added.
5. **Home/reset, position-map construction, cold grid thumbnails and ordinary grid scrolling are
  closed with no change.** Live attribution found no worthwhile client lever.
6. **Treat the latest direct-ES/media-api deltas as directional, not causal.** The recorded runs
  have different dirty-state hashes and browser origins; route ownership must also be checked per
  scenario. A causal comparison requires a controlled same-fingerprint, same-origin pair.
7. **Admit all other candidates only when a measurement, profile, or reproducible user problem
   gives them a decision to serve.** Static suspicion alone does not authorize implementation.
8. **Record backend opportunities, but do not implement them in this programme.** Several of
   the strongest opportunities require canonical index fields or media-api work and already
   have better evidence than a frontend workaround.

This is intentionally a sequence of small investigations, not a mega-audit. A broad audit would
mix browser rendering, perceived latency, network behavior, memory, and backend query cost, then
produce a catalogue without telling us which change is worth making.

---

## 1. Non-negotiable scope and safety

### In scope

- Main-thread work, React commits, rendering, layout, paint, DOM churn, and client memory.
- Browser-visible latency from a real user action to useful stable output.
- Kupua request orchestration and response publication where both modes can be preserved.
- Measurement gaps only when closing one is required to decide on a named optimization.
- Read-only characterization of calls to TEST through the existing app and harnesses.

### Out of scope for implementation

- Any media-api, Scala, Elasticsearch mapping, index, ingest, imgproxy, CDN, or infrastructure
  change.
- Any write against TEST, CODE, PROD, or another non-local system.
- Broad refactors justified by cleanliness, coupling, render folklore, or bundle aesthetics.
- Replacing the DAL strangler architecture while Phase 3 is in progress.
- Adding permanent metrics before a concrete decision needs them.
- Optimizing every unmeasured interaction merely because the harness does not cover it.

### Evidence labels used below

| Label | Meaning | May authorize a fix? |
|---|---|---:|
| **D — demonstrated** | Repeated checked-in measurement identifies a slow user surface. | Only after profiling identifies a controllable cause. |
| **I — instrumented** | Timing or diagnostics exist, but user harm or causality is not established. | No. First establish interference or user cost. |
| **H — hypothesis** | Source reading suggests work that could scale or repeat. | No. First build the cheapest discriminating measurement. |
| **R — rejected/retired** | Prior evidence disproved it, or the trade-off was explicitly declined. | No, unless new evidence invalidates the old decision. |

Every future optimization must name, before editing:

1. the user-visible hypothesis;
2. the metric expected to improve;
3. a correctness or performance metric expected not to regress;
4. the cheapest check that could disprove the hypothesis;
5. which data-source modes the change can affect.

The maintained measurement discipline is authoritative: one row owns one action, async phases
must be causally correlated, changed scenarios are not comparable, and incomplete evidence fails
closed ([perf reference](../../../e2e-perf/README.md#measurement-discipline-for-later-work)).

---

## 2. Current architecture relevant to performance

The primary path is:

```text
user action
  → URL / search orchestration
  → useUrlSearchSync
  → search-store action
  → ImageDataSource
  → accepted store commit
  → useDataWindow
  → table/grid virtualizer
  → useScrollEffects / browser render
```

The high-risk surfaces are not independent:

- The store owns a bounded buffer of at most 1,000 images, cursor extension, eviction, seeks,
  PIT lifecycle, position maps, distributions, and sort-around-focus.
- `useDataWindow` translates buffer-local and global coordinates, publishes visible ranges, and
  starts extend or seek work near/outside buffer boundaries
  ([source](../../../src/hooks/useDataWindow.ts#L245-L457)).
- `ImageTable` virtualizes rows but still renders every visible column for every virtual row. It
  feeds only the virtual window to TanStack Table, uses table overscan 15, and derives enrichment
  once per rendered row ([source](../../../src/components/ImageTable.tsx#L260-L469),
  [virtualizer](../../../src/components/ImageTable.tsx#L724-L842)).
- `SearchPage` subscribes to visible-range and buffer state for scrubber presentation, while
  focused metadata/usages subscribe to result and position maps
  ([source](../../../src/routes/search.tsx#L80-L221)). These are profile candidates, not established
  defects.
- Detail/fullscreen reuse the same ordered result buffer. Image traversal and prefetch therefore
  interact with extension, cancellation, decode, and return-position guarantees.

The three result-size tiers must remain distinct:

| Tier | Result count | Performance mechanism |
|---|---:|---|
| Scroll | `≤1,000` | Entire result set can fit in the bounded buffer. |
| Indexed scroll | `1,001–65,000` | Global virtual space, sliding buffer, placeholders, background position map. |
| Seek | `>65,000` | Bounded buffer plus scrubber teleport using maps/distributions/estimation. |

An optimization validated in one tier is not automatically valid in the other two.

---

## 3. Direct-ES and media-api topology

Phase 3 is a **method-level strangler**, not two complete interchangeable backends.

| Operation | Direct-ES mode | `VITE_USE_MEDIA_API=true` today |
|---|---|---|
| Initial and cursor/reverse `searchAfter` | Elasticsearch | `POST /api/images/search-after` |
| Cursorless non-zero offset search with no PIT/reverse/end flag | Elasticsearch | Elasticsearch escape hatch |
| Count/tickers, aggregations, filters | Elasticsearch | Elasticsearch |
| PIT, distributions, rank/count-before, position map, ID range | Elasticsearch | Elasticsearch |
| Detail `getById` | Elasticsearch | Elasticsearch |
| AI branch | Bedrock proxy + Elasticsearch | Same |
| Search-hit enrichment overlay | Absent | Populated from media-api entities |

The dispatch is explicit in
[`StranglerAdapter`](../../../src/dal/strangler-adapter.ts#L17-L67). D7 count/tickers and D8 PIT are
planned next; D9 multi-get requires a focused review before implementation
([D7–D9 workplan](../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/phase-3-d7-d8-d9-workplan.md#L1-L38)).

### Migration guardrails for any frontend optimization

- Preserve deleted/replaced exclusions, all filter mappings, complete sort clauses, unique-ID
  tiebreakers, opaque cursors, reverse pagination, and null-zone behavior.
- Preserve the initial exact total and the stored total on later pages.
- Keep fetches side-effect free. Publish results and enrichment only after abort, generation,
  freshness, and accepted-buffer checks.
- Preserve merge direction: ES baseline plus optional server-authoritative overlay.
- Preserve the cursorless non-zero-offset ES escape hatch until its API contract changes.
- Do not prune or relocate enrichment merely to reduce memory. Future detail and selection flows
  need an explicit ownership decision first.
- Do not optimize a direct-ES implementation as though its current route were permanent when D7,
  D8, or D9 is scheduled to move it.
- The escape hatch applies only when there is no cursor, PIT, reverse flag, or seek-to-end flag and
  `offset > 0`. Cursorless PIT/reverse/end calls still use media-api. Capture the observed route
  before classifying a scenario as an escape-hatch comparison.
- Do not describe media-api failure behavior as a performance issue. There is a current correctness
  gap: `apiSearchAfter` throws on non-2xx and the store publishes a search error, despite the
  development-phase graceful-absence directive. Resolve that contract separately. A perf campaign
  must fail closed on any API failure; never record an error or fallback run as latency evidence.

The current migration constraints and special-date caveats are summarized in the
[Phase 3 findings](../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/phase-3-minimal-gap-derivation-findings.md#L14-L109).

---

## 4. What Kupua can already measure

Kupua has two maintained performance systems under one manual runner:

| System | Question | Current use |
|---|---|---|
| Jank P1–P18 | Is the browser drawing smoothly during an action? | Frame deltas, severe frames, CLS, DOM churn, LoAF, focus placement, traversal landing, reverse/prepend and selection-panel rendering. |
| Perceived PP/JA/JB | How long from the user's action to useful, stable output? | Correlated acknowledgment, store-ready, first-visible-frame, and visually-settled phases. |

Habitual Playwright owns correctness; it is not a performance benchmark. The experiment suite is
for a named hypothesis, not routine evidence. Pure harness tests validate evidence handling rather
than app speed. See the [authoritative harness reference](../../../e2e-perf/README.md).

### Important blind spots

- No durable metric isolates React commit owners or component render counts.
- Heap lifetime, retained images, and enrichment-overlay growth are not maintained metrics.
- Typeahead latency begins before PP8's measurement window.
- Initial facet/panel aggregation loading begins before JB2's measured click.
- P17 owns a bounded reverse/prepend cascade, P18 owns 100-image in-buffer selection with Details
  open, and PP11 owns exact deep browser Back restoration. Out-of-buffer selection, reload
  latency, broader responsive/device behavior and gestures remain without maintained owners.
- The maintained profile is one Chromium/macOS viewport with no CPU throttling and uncontrolled
  browser cache.
- Four repetitions are useful characterization, not a publishable tail distribution.

These are not automatically a backlog. A blind spot becomes work only when it blocks a decision.

---

## 5. Current evidence baseline

The latest recorded campaigns are four direct-ES runs labelled **`Added new scenarios`** and four
local-media-api runs labelled **`New scenarios`**, both on 13 September 2026. Each contains 32
jank metrics, 15 short perceived scenarios and 8 long-journey steps. Both report source SHA
`04c3fcadc`, but their dirty-state hashes differ (`2cb6baf756af9d44` direct,
`edba9d074dbcbfc2` media) and their browser origins differ
([direct jank](../../../e2e-perf/results/audit-log.md#added-new-scenarios-04c3fcadc-dirty-2026-09-13),
[media jank](../../../e2e-perf/results/audit-log.md#new-scenarios-04c3fcadc-dirty-2026-09-13),
[direct perceived](../../../e2e-perf/results/perceived-log.md#short-added-new-scenarios-04c3fcadc-dirty-2026-09-13),
[media perceived](../../../e2e-perf/results/perceived-log.md#short-new-scenarios-04c3fcadc-dirty-2026-09-13)).
They are the current evidence, but not a controlled causal A/B pair.

The latest clean comparison anchor remains the four-run 12 September 2026 direct-ES campaign,
Chromium at 1720×960 and DPR 2, headed, one worker, no CPU throttle, uncontrolled browser cache,
and the harness's fixed `until=2026-02-15T00:00:00.000Z` corpus
([jank record](../../../e2e-perf/results/audit-log.md#after-dead-code-removal-595abcbc4-2026-09-12),
[perceived record](../../../e2e-perf/results/perceived-log.md#short-after-dead-code-removal-595abcbc4-2026-09-12)).

The general stable tier corpora documented elsewhere use `until=2026-03-04`; they are correctness
and exploratory corpora, not substitutes for the perf harness cutoff. Never mix them in a baseline
comparison.

### Selected browser-rendering results

| Surface | Current median summary | Reading |
|---|---|---|
| **P8 table fast-scroll** | Direct: 179ms max, 59ms p95, 91.6 severe frames/1k, 121,616 mutations, 1,860ms LoAF. Media: 209ms, 62ms, 99.2/1k, 121,880, 2,136ms. | Demonstrated sustained problem; implementation remains deferred. |
| **P17 reverse/prepend** | Direct: 193ms max, 34ms p95, 14.4 severe frames/1k, 1,876 mutations, 267ms LoAF. Media: 201ms, 34ms, 15.4/1k, 1,859, 298ms. | Closed: exact dev attribution found publication/reconciliation script cost; production completed one real prepend in 25ms with no severe frame and no second generation. No change. |
| **P18 selection Details** | Direct: 84ms max, 25ms p95, 31.2 severe frames/1k, 183 mutations, 38ms LoAF. Media: 99ms, 84ms, 70.7/1k, 198, 47ms. | Closed: two production runs had 24–25ms maxima and no >50ms frame; no change. |
| P14d rapid traversal | Direct: zero CLS, 59ms max, 9ms p95, 75ms LoAF. Media: 0.0558 CLS, 59ms max, 10ms p95, 87ms LoAF; 449ms landing, 434ms network. | Cancellation is fixed. Dedicated audit classifies the CLS as valid but acceptable image-only shift, not a confirmed product-layout regression ([raw landing diagnostics](../../../e2e-perf/results/audit-log.json#L10810)). |
| P16 column resize/fit | Direct: 13/17ms max. | Existing CSS-variable/memo path is effective. |

All values in this table come from the latest canonical
[direct](../../../e2e-perf/results/audit-log.md#added-new-scenarios-04c3fcadc-dirty-2026-09-13)
and [media-api](../../../e2e-perf/results/audit-log.md#new-scenarios-04c3fcadc-dirty-2026-09-13)
jank records. Cross-mode differences are directional because the fingerprints differ.

Do not optimize against P8 `maxFrame` alone: one worst frame is volatile. P95 frame time, severe
rate, LoAF blocking, and mutation shape together are the useful signal.

P14's frame summary does not close traversal performance. Its maintained owners also include
landing, network, cancellation, and render-count metrics. A campaign failure exposed
`_cancelLeftRadius` cancelling the newly visible image's prefetch while the centre image requested
the same URL. The fix protects the visible request while still cancelling stale neighbours; it
passed 21/21 focused tests, 1,230/1,230 units, the production build, four cold-cache browser bursts
and four formal repetitions with 262/306/316/225ms landings
([validation record](../changelog.md#13-september-2026--preserve-the-visible-traversal-image-request)).
P8 remains deferred because product value, not evidence quality, blocks its implementation.

### Selected perceived results

| Surface | Store ready | First visible | Settled | Reading |
|---|---:|---:|---:|---|
| **PP11 deep Back** | 720ms | 884ms | 905ms | Exact restoration owner; measured but not scheduled because the likely gain does not justify state-machine risk. |
| **JA2 detail open** | 100ms | 788ms | 797ms | Delivery-dominated; progressive detail remains indefinitely deferred. |
| **JA3 metadata search** | 873ms | 988ms | 1,011ms | Direct current result; media-labelled result is 1,177/1,290/1,313ms. |
| PP10 position map | 2,567ms for 21,627 entries | n/a | n/a | Background diagnostic, not a user-action ranking. |

The table uses the latest direct
[short](../../../e2e-perf/results/perceived-log.md#short-added-new-scenarios-04c3fcadc-dirty-2026-09-13)
and [long](../../../e2e-perf/results/perceived-log.md#long-added-new-scenarios-04c3fcadc-dirty-2026-09-13)
records; the JA3 media values use the latest
[media long record](../../../e2e-perf/results/perceived-log.md#long-new-scenarios-04c3fcadc-dirty-2026-09-13).

### What cannot currently be claimed

The historical 12 September 2026 campaign was the first post-harness-revision, post-compression
media-api baseline. Its topology was Playwright → authenticated HTTPS Kupua origin → local Vite → local
media-api → SSH tunnel → TEST Elasticsearch. The direct-ES campaign used the same application code
but `http://localhost:3000`, so the pair characterizes the local paths broadly; it does not isolate
only D3 or predict a deployed media-api.

No checked-in evidence was found of a full Kupua perf campaign against a deployed TEST media-api
containing D3. The D3 TS/Scala commits are not ancestors of `origin/main`. A June 2026 Riff-Raff
deployment experiment did exercise deployed TEST media-api, but measured the shared ES-client gzip
change through the existing `/images` route, not Kupua's `/images/search-after` journey. Do not
merge those evidence classes.

The prior local-media-api deep dive found client JSON parsing and mapping negligible, while server
envelope construction was material
([review](media-api-work/phase-3-d3-searchafter-perf-review.md#L19-L110)).

### Latest local media-api characterization — 13 September 2026

Four jank, short-perceived, and long-perceived repetitions completed under the media label
**`New scenarios`**. The corresponding direct label is **`Added new scenarios`**, not the same
label. Each recorded 32 jank metrics, 15 short scenarios and 8 long-journey steps. Read media-api
here as **local media-api backed by TEST ES**
([jank records](../../../e2e-perf/results/audit-log.md#new-scenarios-04c3fcadc-dirty-2026-09-13),
[perceived records](../../../e2e-perf/results/perceived-log.md#short-new-scenarios-04c3fcadc-dirty-2026-09-13)).

| Signal | Direct ES | Local media-api | Interpretation |
|---|---:|---:|---|
| P8 p95 / severe rate / LoAF | 59ms / 91.6 per 1k / 1,860ms | 62ms / 99.2 per 1k / 2,136ms | Directionally higher in the media-labelled run; not causal evidence. |
| P17 max / p95 / LoAF | 193ms / 34ms / 267ms | 201ms / 34ms / 298ms | Similar directional shape; P17 owns media-api reverse pages in media mode. |
| P18 max / p95 / LoAF | 84ms / 25ms / 38ms | 99ms / 84ms / 47ms | Directionally worse tail, but P18 owns direct-ES `_mget` in both modes. |
| PP11 store / visible / settled | 720 / 884 / 905ms | 1,070 / 1,238 / 1,254ms | Directional local-path difference; PP11 observes both route classes. |
| JA2 store / visible / settled | 100 / 788 / 797ms | 145 / 1,257 / 1,266ms | Directional delivery/landing difference; media JA2 owns a media-api route. |
| JA3 store / visible / settled | 873 / 988 / 1,011ms | 1,177 / 1,290 / 1,313ms | Directional local-path difference; JA3 observes both route classes. |

Jank values are canonical
[direct](../../../e2e-perf/results/audit-log.md#added-new-scenarios-04c3fcadc-dirty-2026-09-13)
and [media-api](../../../e2e-perf/results/audit-log.md#new-scenarios-04c3fcadc-dirty-2026-09-13)
aggregates. Perceived values are canonical direct
[short](../../../e2e-perf/results/perceived-log.md#short-added-new-scenarios-04c3fcadc-dirty-2026-09-13),
[long](../../../e2e-perf/results/perceived-log.md#long-added-new-scenarios-04c3fcadc-dirty-2026-09-13),
and media [short](../../../e2e-perf/results/perceived-log.md#short-new-scenarios-04c3fcadc-dirty-2026-09-13),
[long](../../../e2e-perf/results/perceived-log.md#long-new-scenarios-04c3fcadc-dirty-2026-09-13)
aggregates.

**Observation:** several media-labelled perceived medians are directionally higher, while P17's
sustained frame shape is similar and P18's tail is higher. **Inference boundary:** local proxy,
JVM, tunnel, browser origin, route ownership and differing dirty hashes all confound broad deltas.
**Decision:** do not attribute those deltas to media-api or declare regressions; use them only to
choose a controlled follow-up if a ranked candidate needs mode causality.

The campaign also exposed a prerequisite with product significance: Kupua hardcodes alias fields,
while D3 re-includes and resolves them from media-api's independent runtime `field.aliases`. With
local media-api configured as `field.aliases=[]`, zero search hits carried aliases and alias CQL
resolved incorrectly. The perf run must fail preflight in that state; the architectural follow-up
is one server-authoritative config path or an explicit drift check, not restoring bulk
`fileMetadata` by default.

---

## 6. Live TEST reconnaissance on 12 September 2026

This was qualitative browser orientation, not a benchmark. No identity, source document, request
body, credential, signed URL, or other sensitive value was recorded.

- The running app identified its data source as `ElasticsearchDataSource`: **direct-ES mode**.
- The default search returned about 1.33 million results, placing it in the seek tier, with a
  200-image initial buffer.
- At the observed viewport, grid view rendered 24 image cells.
- Table view rendered 42 rows / 943 grid cells at the top. One bounded fast move extended the
  buffer from 200 to 400 and briefly exposed 57 rows / 1,288 grid cells.
- The app was returned to grid view at the top after reconnaissance.

This supports the known shape of P8 — a table scroll can reconcile a large number of individual
cells — but does **not** identify the expensive component or replace the checked-in P8 evidence.
The live app cannot provide media-api comparison evidence because it is not running that mode.

---

## 7. Opportunity ledger

### 7.1 Ranked frontend investigations

| Rank | Candidate | Evidence | Modes | Decision |
|---:|---|---|---|---|
| 1 | Deep Back restoration request chain | **D** | Mixed client/data path in both | PP11 owns exact restoration, but request overlap is unscheduled unless likely gain justifies state-machine risk. |
| 2 | Responsive column-threshold recomposition | **D** | Client path in both | Low frequency and exact placement; production-confirm only if active UX value appears. |
| 3 | Media-api enrichment Map growth/copying | **H** | API only | Characterize only when D9 ownership is clearer or memory evidence appears; no speculative pruning. |
| 4 | High-cardinality keyword fallback tail | **D/H** | ES helper path in both modes today | Profile only a corpus that actually crosses the 50k cached prefix. TEST Credit does not. |
| 5 | Collection-count freshness reuse | **H** | ES in both today | Measure startup request cost and define acceptable staleness first. 6,000 buckets is not inherently excessive for 5,350+ paths. |

**Deferred/implemented:** progressive detail image arrival is indefinitely deferred by product
decision; P8 horizontal column virtualization is explicitly deferred because table use is low;
C4 explicit Filters activation is implemented and retains debounce for query changes and hover.

### 7.1a Closed by live attribution

| Candidate | Evidence | Decision |
|---|---|---|
| Home/reset coordination | Two PP1 traces | First-page response and parse own the critical path; PIT/tickers already finish earlier in parallel. No change. |
| Position-map foreground interference | Matched panel action during/after 21,627-entry build | 68ms vs 48ms settle, zero severe frames/LoAF. Keep PP10 diagnostic only. |
| Cold-grid `loading="lazy"` | Cache-cleared navigation | All 19 rendered/overscan thumbnail requests began together; no lazy-load starvation. No change. |
| Ordinary grid scrolling | Exact P2 action | 18ms p95, 27ms max, zero severe/LoAF despite 177 thumbnail requests. No change. |
| Reverse/prepend cascade | Exact P17 action in dev plus production React control | Dev's two accepted publications owned 117ms/100ms frames; production's real prepend peaked at 25ms and did not admit generation 2. Development-only signal; no change. |
| Multi-image Details render | Two cold production P18 repetitions | 24–25ms max, 9ms p95, zero >50ms frames/long tasks. Development tail is not a worthwhile production problem. No change. |

### 7.1b Candidate completeness ledger

This ledger is the compact performance-opportunity view of the full
[interaction catalogue](performance-harness-1-interaction-catalogue.md). It does not
promise a benchmark for every control. It ensures every plausible slow/scaling workflow is either
active, measured healthy, deferred for low value, or assigned the setup that could test it.

| Workflow class | Why it may be slow | Current evidence | Embedded-browser disposition |
|---|---|---|---|
| Initial detail display | Cold screen-sized imgproxy generation/AVIF decode | **Measured slow:** ~1.37s stable; cached thumb ~12ms | Indefinitely deferred by product decision. |
| FullscreenPreview entry | Native fullscreen + first preview image + duplicate initial prefetch suspicion | Exit measured; entry not directly measured | Profile desktop entry; touch/native-device variant separate. |
| Detail/preview traversal across buffer edge | Image delivery plus conditional extend/seek | Warm traversal measured; boundary journey unmeasured | Profile one real first-offset-change traversal, not arbitrary key count. |
| Detail close after traversal | Conditional list recenter/seek and return paint | P13b covers ordinary close; boundary close unmeasured | Compare unchanged-image and crossed-buffer close. |
| Deep Back/Forward restore | Search/seek plus snapshot anchor restoration | **PP11 recorded:** direct 720/884/905ms store/visible/settled; media 1,070/1,238/1,254ms; zero aggregate ratio drift | Keep measured but unscheduled; design request overlap only if likely gain justifies risk ([canonical perceived logs](../../../e2e-perf/results/perceived-log.md#short-added-new-scenarios-04c3fcadc-dirty-2026-09-13)). |
| Deep list/detail reload restore | Full navigation, snapshot/session storage, search and cursor restore | Correctness strong; P1 is not restore | Profile with init script; retain stable identity only in browser memory. |
| Reverse scroll/prepend | Reverse page, buffer prepend and synchronous scroll compensation | **P17 recorded:** direct 193ms max/34ms p95/267ms LoAF; media 201/34/298ms; zero CLS | Profile two-request cascade; do not hide it with test-only suppression ([canonical jank logs](../../../e2e-perf/results/audit-log.md#added-new-scenarios-04c3fcadc-dirty-2026-09-13)). |
| Indexed skeleton replacement | Out-of-buffer scroll → debounced seek → real-cell replacement | JB4 perceived proxy; no direct jank | Profile skeleton interval, publication frame and direction stability. |
| Deep keyboard Home/End/Page | Conditional seek plus focus-placement bookkeeping | Correctness only; scrubber seek is proxy | Compare against equivalent scrubber seek; stop if identical. |
| Continuous responsive/panel resize | ResizeObserver, column-count changes, anchor restoration | **Measured:** exact anchor; one 54–79ms threshold long task | Low-frequency candidate; production-confirm only if resize UX matters. |
| Large in-buffer selection | Set cloning, metadata hydration, reconciliation and panels | **P18 recorded:** direct 84ms max/25ms p95/38ms LoAF; media 99/84/47ms; production 24–25ms max with no >50ms frame | Closed with no change; production React disconfirmed the development render tail ([canonical jank logs](../../../e2e-perf/results/audit-log.md#added-new-scenarios-04c3fcadc-dirty-2026-09-13)). |
| Out-of-buffer range selection | `getIdRange`, up to 5k IDs, hydration/reconciliation | Correctness and explicit cap; perf absent | High potential but product-value gated; requires real user-level range. |
| Selection persistence/reload | Repeated Set→array JSON, session storage, mget and reconcile | Static scaling suspicion | Measure aggregate stringify/idle-callback durations; never return IDs. |
| Selection drag payload | Two synchronous payloads for up to 5k IDs | Static $O(N)$ suspicion | Product-value gated; aggregate bytes/time only. |
| Explicit Filters expansion | Generic 500ms debounce before a user-requested agg | **Implemented:** explicit activation skips only debounce | Cache, breaker and batching retained; query/hover calls remain debounced. |
| Expanded 100-bucket facet | Network plus up to 100 buttons | Unmeasured, likely bounded | Profile once if Filters usage justifies it; stop if render <50ms. |
| Static-field value typeahead | One aggregation per suggestion pass; dropped abort signal | **Measured:** six requests, zero aborts, ~434ms actionable | Candidate: propagate cancellation or coalesce. |
| Plain CQL typing/clear | ProseMirror + fixed search debounce + history push | Downstream PP8/PP9 only | Profile pre-ack overhead; likely close if only fixed debounce. |
| Rapid search/seek supersession | Abort/generation races and possible wasted parse | Correctness proxies, no causal perf metric | Needs controllable latency for proof; live browser can characterize only. |
| AI submit/clear | Bedrock embedding + KNN + bounded publication | No perf owner; optional health gate | Profile only when feature is available and valued; remote phases separate. |
| Collection select/clear | Optional API + automatic sort + search | Correctness only | Profile if collection service/feature is in active use. |
| Collection tree startup/expansion | Persisted tree/count parse, recursive render, no virtualization | Static/data-dependent suspicion | Measure stored bytes and broad-branch expansion when a large node exists. |
| New-image refresh | Poll then ordinary first-page search; selection clear | No dedicated metric | Wait for a natural badge; never mutate TEST to manufacture it. |
| Table wide-scroll rendering | Every chosen column rendered for every virtual row | **Measured severe; owner proven** | Candidate retained but deferred: table use is low. |
| Table resize-all/show-hide | Text measurement and broad cell rebuild | P16 covers one-column operations only | Low-value with table; defer alongside horizontal virtualization. |
| Grid cold thumbnails | Proxy/S3 response and decode | **Measured:** all requests parallel; 1.13s all visible | No lazy/eager fix; optional visible-row priority experiment only. |
| Grid ordinary scroll | Cell reconciliation, image requests, page commit | **Measured healthy:** 18ms p95, no severe/LoAF | Closed. |
| Home/reset | Fresh page-one response before safe navigation | **Measured:** network/parse critical path | Closed; do not reintroduce stale-content flash. |
| Position-map build | Up to 65k ID/sort tuples in chunked background walk | **Measured:** 2.36s wall, no foreground harm | Closed as diagnostic only. |
| Media-api enrichment lifetime | Full retained overlay Map copied/upserted beyond 1k image buffer | Static API-only hypothesis | Measure in authenticated media-api mode after D9 ownership review. |
| Deployed D3 latency | Real service/VPC/CloudFront/JVM topology | No full Kupua deployed-D3 campaign found | Requires explicit TEST deployment and separate fingerprint. |
| Production React magnitude | Dev runtime amplifies reconciliation/effect behavior | P8 and Filters show dev-specific confounds | Confirm implementation wins in a production bundle. |
| Touch gestures and long-press selection | Different coarse-pointer/touch state machines, DPR/GPU/fullscreen | Desktop browser invalid for device perf | Emulate for logic; real iOS/Android hardware for credible performance. |
| Backend/index/imgproxy opportunities | Canonical fields, envelope construction, presigning, result cache | Recorded server evidence | Document only here; require server/JFR/APM/index evidence elsewhere. |

**Catalogue rule:** absence of a persisted metric is not itself an opportunity. Promote a row only
when source scaling, live timing, user workflow value, or an imminent migration creates a decision.

### 7.1c Evidence boundaries and alternate setups

The ordinary embedded desktop browser cannot answer every catalogue row credibly. The table below
is the explicit routing boundary; these are classified, not forgotten.

| Setup required | Questions it can answer | Admission / safety rule |
|---|---|---|
| Production React bundle | Absolute P8, multi-image Details and resize commit magnitude without Strict Mode/dev reconciliation | Run only after a candidate survives dev attribution; same corpus/action and paired fingerprint. |
| Authenticated local media-api | Enrichment publication, overlay growth/copying and route-specific cancellation | Use external auth state, record aggregate route classes only, and compare only with a same-origin direct-ES control when causality matters. |
| Explicit deployed TEST D3 | JVM/VPC/CloudFront/service latency and real D3 response construction | Separate campaign and decision; read-only permission per session, never infer from local topology. |
| Controllable delayed mock | Supersession, abort, stale-publication and timeout races | Prefer focused Vitest/Playwright fixtures; live TEST timing cannot prove a race absent or force it safely. |
| Desktop native fullscreen | Fullscreen entry/exit and first preview decode | Use real fullscreen API in a foreground page; keep touch/device conclusions separate. |
| Mobile emulation | Responsive logic, coarse-pointer branches and gesture correctness | Logic evidence only; do not report device/GPU/frame performance from desktop emulation. |
| Real iOS/Android hardware | Touch, long-press, pinch/swipe, orientation and decode/GPU performance | Device-specific campaign only when mobile use is a product priority. |
| Natural live event | New-image ticker refresh and rare corpus-dependent broad collection expansion | Wait for the event; never write to TEST or manufacture editorial data. |
| Purpose-built local corpus | >50k keyword fallback, broad collection branches and controlled null/sort distributions | Local-only fixture with an explicit question; do not mutate non-local ES. |
| Backend/JFR/APM/index tooling | Mapping fields, envelope/presigning cost, caches, JVM allocation and ES query plans | Record in §10; implementation remains outside this frontend programme. |

**No-result rule:** if the required setup is unavailable, retain the row and its owner/setup. Do not
replace missing evidence with source-only magnitude claims or broaden an unrelated live campaign.

### 7.2 P8 hypotheses to discriminate, not assume

| ID | Hypothesis | Cheapest useful discriminator |
|---|---|---|
| P8-H1 | Mount/unmount and layout of hundreds of visible table cells dominate severe frames. | Browser trace + React profile over the exact P8 action; attribute commit/self time and mutation subtree. |
| P8-H2 | Route/table-parent commits amplify row work when an extend publishes a new results array. | Correlate React commits and severe frames with result-length/resource/extend timestamps. |
| P8-H3 | Per-row enrichment and expensive field renderers dominate cell cost. | Profile component/self time; diagnostic column groups only after a dominant renderer appears. |
| P8-H4 | Network response publication, not continuous scrolling, owns most P8 jank. | Repeat the action with a prefilled/warm buffer diagnostic and correlate frames with request completion. |
| P8-H5 | Overscan 15 is the primary cause. | **Do not edit first.** Profile row counts and blank-headroom trade-off; current value was restored to avoid fast-scroll blanking/rubberbanding. |

The outcome may be “no safe local fix.” That is a valid result if cost is diffuse or every useful
reduction violates blank-row, identity, or position guarantees.

### 7.3 Source-grounded hypotheses held behind evidence gates

- `useUrlSearchSync` currently subscribes without a selector, which can create broad render
  opportunities ([source](../../../src/hooks/useUrlSearchSync.ts#L83-L94)). It is not established as
  a measurable cost.
- Search result publication creates new arrays and updates position state during extension. P8 is
  mixed client/network work, so a profile must separate scroll commits from response commits.
- Media-api page publication upserts enrichment while the visible image buffer evicts. Overlay
  lifetime can therefore exceed buffer lifetime. This is a memory/copy hypothesis, not a known
  leak, and future detail/selection migration may need those entries.
- Typeahead can issue aggregation-backed requests while the user types; PP8 starts too late to
  measure that experience. A dedicated trigger-to-suggestion metric is justified only after a
  reproducible complaint or a planned typeahead change.
- Selection reconciliation and metadata derivation scale with selection size, but the old
  store-direct stress scenario was invalid and retired. Do not resurrect a synthetic test that
  bypasses user behavior.

---

## 8. Work programme

### Phase A — P8 attribution audit (completed; implementation deferred)

**Decision served:** Is there one bounded Kupua frontend change likely to materially improve table
fast-scroll without weakening Never Lost, buffer, selection, or blank-row behavior?

**Mindset:** Performance attribution only. Report-first. No production edit during the audit.

**Entry gate:** Agents never launch Kupua's perf harness. The user must explicitly choose to run
the read-only TEST campaign and must coordinate the app occupying port 3000 in the intended mode.
Use the checked-in current baseline when the runtime has not changed; otherwise the user runs the
smallest P8 confirmation first. Profiling is either a manual DevTools capture or explicitly
reviewed temporary profiler instrumentation. Any temporary source/runner change must be completely
reverted before findings are written. Persist redacted aggregate findings only.

**Read first:**

- `e2e-perf/README.md` and the latest P8 campaign;
- `e2e-perf/perf.spec.ts` P8 action and metric boundaries;
- `src/components/ImageTable.tsx`;
- `src/hooks/useDataWindow.ts` and `src/hooks/useScrollEffects.ts`;
- store extend/evict commit paths;
- the retained overscan rationale and the failed broad optimization post-mortem
  ([rendering history](rendering-perf-plan.md#L430-L550),
  [failure record](DISASTAH-NOT-PERF.md#L85-L159)).

**Audit steps:**

1. Reconfirm that P8 still reproduces under the current fingerprint before profiling. If it does
   not, stop and explain why the premise changed.
2. Capture at most one exact-action browser trace and one React profile. Record aggregate component names,
   commit durations, scripting/layout/paint split, request overlap, virtual-row counts, and
   mutation categories. Do not persist image IDs, URLs, bodies, or headers.
3. Separate continuous-scroll frames from extend-response publication frames.
4. Identify the smallest owner that explains a material share of repeated cost. A broad parent
   component is not enough; step to the calculation, subscription, renderer, or key behavior that
   controls it.
5. Test at most one reversible diagnostic variation in this audit. It may disable a column family
  or isolate a warm buffer, but it is not a candidate production change.
6. End with exactly one of:
   - one implementation candidate with expected metric movement and named regression sentinels;
   - a narrower follow-up measurement needed to distinguish two surviving causes;
   - “no worthwhile safe change found.”

**Anti-goals:**

- no generic memoization pass;
- no key-strategy change without identity/click/seek proof;
- no page-size change;
- no blind overscan reduction;
- no scroll/focus architecture rewrite;
- no permanent instrumentation during attribution;
- no frontend/backend comparison disguised as a P8 rendering result.

**Audit deliverable:** Append a concise findings section to this workplan or create one linked
findings document. Every causal claim must cite source and profile evidence. Refuted hypotheses
must be removed from the candidate list, not left beside their correction.

#### Phase A findings — completed 12 September 2026

**Verdict:** P8 has one bounded implementation candidate: horizontally virtualize off-screen table
columns while preserving the user's complete chosen column set and full horizontal scroll geometry.
Do not begin with store, fetch, page-size, key, overscan, or field-renderer micro-optimizations.

**Environment and boundary.** One live direct-ES TEST session reproduced P8's exact maintained
action on the pinned `until=2026-02-15T00:00:00.000Z` corpus: table view, 80 vertical wheel events
of 400px at nominal 50ms intervals, then a three-second settle. Instrumentation lived only in the
browser and returned aggregate frame, LoAF, mutation, request and store-generation data. No raw
trace, response, URL body or image identity was written to disk.

The live numbers below are attribution evidence, not replacements for the maintained four-run P8
baseline. Browser-control and diagnostic overhead change absolute values. The useful comparison is
the matched lightweight 22-column versus 4-column pair, which used the same page state, action,
probe and data flow.

| Signal | 22 chosen data columns | 4 data columns | Change |
|---|---:|---:|---:|
| Initial rendered gridcells | 943 | 205 | −78% |
| Final rendered gridcells | 1,288 | 280 | −78% |
| Severe frames (`>50ms`) during scroll | 76 | 0 | eliminated in this diagnostic |
| Within-action p95 frame | 92ms | 34ms | −63% |
| Max frame | 159ms | 50ms | −69% |
| LoAF blocking | 1,432ms | 0ms | eliminated in this diagnostic |
| Attribute mutations | 97,546 | 36,461 | −63% |
| Character-data mutations | 66,265 | 17,911 | −73% |
| Page commits | 6 | 6 | unchanged |
| Final buffer / offset / evictions | 1,000 / 400 / 2 | 1,000 / 400 / 2 | unchanged |

The 22-column action took about 8.0 seconds to dispatch a nominal four-second wheel sequence because
the main thread could not keep pace. The 4-column action took about 4.8 seconds. Neither run had a
severe frame during the three-second settle.

**Attribution.** In the wide-table run, only 9 of 76 severe frames occurred within 100ms of one of
the six page commits. An earlier profiled repetition found 11 of 82 in that window. The worst LoAFs
were repeated scroll events: roughly 116–125ms attributed to the TanStack virtualizer's scroll
callback, enclosing the React update, plus roughly 17–21ms in Kupua's `useScrollEffects` listener,
including about 11ms forced style/layout. This falsifies P8-H4: request completion and buffer
publication are not the dominant sustained cause.

The CPU sample showed React reconciliation plus repeated field access/element construction rather
than one pathological field renderer. It also contained substantial React development-runtime
work (`jsxDEV`, validation and development reconciliation), because the maintained TEST app is a
Vite development build. That amplifies the absolute cost. A candidate must therefore win first on
the maintained dev-mode P8 comparison and then survive a production-build confirmation before any
claim about user impact.

**Why columns are the right boundary.** At the measured viewport, the user's 22 selected data
columns plus Selection occupied 3,448px while the table viewport was 1,102px. Only Selection plus
about seven data headers intersected the viewport; roughly two-thirds of the horizontal table was
off-screen but still rendered for every virtual row. `EnrichedTableRow` currently maps every
`row.getVisibleCells()` result ([source](../../../src/components/ImageTable.tsx#L310-L350)). Row
virtualization limits vertical breadth but does not limit horizontal breadth.

**Candidate design.** Add a horizontal `useVirtualizer` beside the existing row virtualizer, using
the same table scroll element, current visible leaf columns, persisted/default column widths and a
small column overscan. Render only its column indexes in both header and body, with left/right
spacer cells preserving the complete table width. This is the established TanStack column-
virtualization strategy; it retains user-selected columns instead of changing product defaults.

Do not implement a naïve `scrollLeft` filter that removes cells without spacers: it would collapse
width, move column coordinates and break the proxy scrollbar. Do not hide additional columns by
default as a technical fix; that is a separate product/UX decision.

**Implementation risks that must be designed before editing:**

- Selection-column position and width in both header and every row.
- Existing CSS-variable sizing, drag resize, double-click auto-fit and context-menu resize for an
  off-screen column.
- Header/body alignment while horizontally scrolling and after visibility/width changes.
- The proxy scrollbar's full `scrollWidth` and bidirectional `scrollLeft` synchronization.
- Sort clicks, click-to-search, row identity and tickbox behavior after columns enter/leave DOM.
- Table Left/Right keyboard scrolling, sort-time horizontal preservation, density switches,
  detail return and fullscreen return.
- Firefox containment and existing hidden-scrollbar behavior.
- Accessibility: selected columns absent from the horizontal viewport may be absent from the
  accessibility tree until scrolled into view; confirm this matches ordinary virtualization
  expectations and does not break required grid semantics.

**Acceptance evidence:**

1. A failing-first focused component/geometry test proves only viewport columns plus overscan render
  while left/right spacers sum to the omitted width.
2. Existing table horizontal-overflow behavior remains green; add alignment and off-screen resize/
  visibility tests where no owner exists.
3. Full unit and habitual E2E surfaces pass, including scroll/focus tests required for a component
  and scroll-path change.
4. The user runs P8 on the same maintained fingerprint. Require improvement in sustained metrics:
  p95 frame, severe-frame rate and LoAF blocking. Max frame and DOM churn are explanatory only.
5. P16 resize/fit, P4 density focus, P6 sort focus and P13b return placement do not regress.
6. Repeat the focused P8 check in media-api mode only after the shared client implementation is
  sound; mode-specific page publication is not the primary cause found here.
7. Confirm the result in a production build or equivalent React production runtime before claiming
  the measured dev-mode reduction represents end-user magnitude.

**Stopping rule:** If horizontal virtualization cannot preserve full-width geometry, header/body
alignment and off-screen column operations without opening a table rewrite, stop. The evidence also
supports a lower-cost product alternative (fewer default visible columns), but that requires an
explicit UX decision and should not be smuggled in as a performance patch.

**Product-priority decision — 12 September 2026:** Defer Phase B for P8. Table view is not used
enough to justify a regression-sensitive change across horizontal geometry, resizing, keyboard
behavior and accessibility. Retain the evidence and candidate for a future table-investment phase;
do not let the compelling benchmark override actual workflow value.

### Phase B — One P8 implementation experiment (only if Phase A earns it)

Before editing, record:

- user hypothesis;
- exact code owner;
- expected improvement in P8 p95/severe/LoAF;
- expected non-regression in blank rows, focused image, image identity, seek landing, density
  switching, and reverse/prepend behavior;
- why the change is valid in both direct-ES and media-api publication paths.

Implement one change only. A result counts as promising when repeated same-environment evidence
beats the expected ±15% mixed-test noise on more than one sustained metric, rather than merely
moving one volatile max frame. DOM churn is explanatory, not the sole success criterion.

Correctness validation for a table/scroll/component change must include unit tests and the full
habitual E2E surface under the repository test directives. P8 is then a suggested manual perf run,
coordinated with the user; it never replaces correctness tests. If a test asserting old behavior
breaks, classify whether the implementation, test, or intended behavior is wrong before editing
the assertion.

### Phase C — Measured follow-ups, one question per session

#### C1. Home/reset latency

**Question:** Of PP1's 570ms settled time, how much is request time, accepted-store publication,
and first render, and is the controllable part different by mode?

- Run matched direct-ES and media-api campaigns on the same runtime revision, dirty-state hash,
  browser fingerprint, and corpus.
- Use route capture, wall-clock fetch duration, store-ready, and first-visible boundaries. Direct
  ES exposes `took`; the media-api result currently does not, so server-versus-ES attribution is
  unavailable there unless a separate, reviewed diagnostic supplies it.
- Preserve parallel PIT/first-page startup and exact initial totals.
- Stop if the gap is network/server dominated; record it under backend opportunities instead of
  manufacturing client work.
- Treat the pair as local TEST-topology characterization, not production parity. Exact production
  media-api transport and server timing remain unmeasured.

##### C1 findings — completed 12 September 2026

**Verdict:** No worthwhile direct-ES frontend change found. Home is first-page-response-bound, and
its search dependencies already run in parallel. Preserve the current correctness-first ordering;
do not navigate before fresh page-one data or split ticker completion merely for speed.

Two live direct-ES TEST traces reproduced PP1's real transition: pinned indexed `city:Dublin`,
scrolled away from top, then logo reset to the unpinned seek-tier Home at absolute position zero.
An in-memory wrapper recorded request class and timing only, never URL, body, response or image
identity. It was restored immediately after each action.

| Phase | Trace A | Trace B |
|---|---:|---:|
| Acknowledgment/loading | 24ms | 25ms |
| PIT open complete | 319ms | 148ms |
| Ticker count complete | 506ms | 226ms |
| First-page headers | 554ms | 355ms |
| First-page JSON complete | 605ms | 385ms |
| Accepted store publication | 606ms | 386ms |
| Home URL commit | 608ms | 386ms |

PIT open, first-page search and ticker aggregation all began together at about 25ms. In both
traces, PIT and tickers completed before the first page. Store publication and URL commit followed
first-page JSON parsing within 1–3ms. One trace recorded a 103ms LoAF at publication, with 96ms
attributed to the post-parse `Scheduler.yield.then` continuation; the other varied mainly in network
time. The existing four-run PP1 baseline's 418ms store-ready / 570ms settled values sit within this
same noisy TEST-tunnel shape.

**Rejected hypotheses:**

- Ticker aggregation does not gate these Home transitions, despite sharing the `Promise.all`.
  Decoupling it would not move the critical path observed here.
- PIT opening does not gate these transitions either; it completed earlier than the first page.
- URL navigation, scroll reset and accepted-store publication add only a few milliseconds after
  first-page parsing in the measured path.
- Navigating immediately and letting data arrive later is not an optimization candidate. The
  current `resetToHome` deliberately awaits fresh page-one data so table→grid and deep→top resets
  never expose stale deep-offset images ([source](../../../src/lib/reset-to-home.ts#L1-L18)). Reopening
  that visible-flash bug to shave perceived latency would be a bad trade.

**Remaining cost:** The first-page fetch dominates, followed by one post-parse/render task. The
direct ES request already uses the lean `_source` projection, parallel PIT/tickers, exact-total
product requirement and post-parse yield. Backend/network tuning is outside this programme. The
local-media-api baseline is slower for Home, but that topology adds local media-api/JVM/proxy/tunnel
work and must not drive a direct-ES orchestration rewrite.

**Disposition:** Close C1 with no code change. Reopen only if a production-topology measurement
shows a materially different phase owner, or if product accepts stale-content/skeleton behavior in
exchange for earlier navigation. Neither premise holds today.

#### C2. Detail image arrival

**Question answered:** Why did the initiating 12 September JA2 baseline reach store-ready at
138ms but first visible at 822ms
([historical record](../../../e2e-perf/results/perceived-log.md#long-after-dead-code-removal-595abcbc4-2026-09-12))?

**Current decision:** Progressive detail loading is indefinitely deferred by product decision.
The attribution below remains useful evidence, not scheduled implementation work.

- Attribute resource queueing, imgproxy response, decode, React commit, and paint.
- Carry P14c/P14d's network-shaped landing evidence into the attribution; do not begin with another
  prefetch-radius experiment.
- Verify a production build before changing eager/lazy/fetch priority.
- Keep detail/fullscreen traversal, prefetch cancellation, and stable-image behavior intact.
- Stop if image transformation/delivery dominates and record an infrastructure opportunity.

##### C2 findings — completed 12 September 2026

**Verdict:** The cold detail gap is dominated by imgproxy/origin time to first byte. The bounded
Kupua opportunity is progressive display: show the already-cached grid thumbnail immediately,
then replace it with the full image only after that image has decoded. This improves perceived
arrival without pretending to make imgproxy faster.

**Boundary and method.** A live direct-ES TEST trace used the same pinned David Young corpus and
prescribed image as JA2. Browser cache was cleared immediately before the real double-click. The
probe observed route change, detail mount, high-priority image insertion, matching imgproxy resource
timing, `load`, explicit `decode()`, stable geometry, frames and LoAFs. It returned aggregate timing
only and did not persist the image identity or URL.

| Phase after double-click | Cold timing |
|---|---:|
| Detail route committed | 27ms |
| Detail overlay mounted | 27ms |
| High-priority `<img>` inserted | 27ms |
| Full-image request began | 107ms |
| Full-image response first byte | ~1,286ms |
| Full-image response complete / `load` | ~1,290ms |
| Full AVIF decoded | ~1,358ms |
| Image/detail geometry stable | ~1,368ms |

The matching resource was HTTP 200, about 197KB encoded, 2,631×1,754 pixels. It spent roughly
1,179ms before first byte and about 3ms transferring; decode added roughly 68ms. Route/mount work
produced one initial 92ms frame, then the browser mostly waited. This falsifies “slow detail React
rendering” and “large browser transfer” as the primary cold cause.

The thumbnail URL for the same already-visible grid image decoded into a new `Image` object in
about **12ms** and had matching resource-timing entries, confirming that the grid browse flow had
already warmed useful real content. Current `ImageDetail` nevertheless gives `StableImg` the full
imgproxy URL immediately ([source](../../../src/components/ImageDetail.tsx#L566-L631)); thumbnail is
only an error fallback. Desktop's initial `useImageTraversal` prefetch warms neighbours after detail
mount, not the current image before entry ([source](../../../src/hooks/useImageTraversal.ts#L151-L169)).

**Candidate behavior:**

1. On initial detail entry, render the selected image's thumbnail synchronously when available.
2. Start the existing screen-sized full-image request immediately with high priority.
3. Decode it off-element or behind the thumbnail.
4. Swap the current `StableImg` to the full URL only after decode succeeds, preserving dimensions,
  transforms and the thumbnail compositor texture throughout the upgrade.
5. If full-image loading fails, retain the thumbnail; show the existing text fallback only when
  neither source works.
6. Do not apply this blindly to traversal. Traversal already has cadence-aware prefetch, thumbnail
  fallback and `StableImg` commit semantics; initial entry and traversal need separate tests.

This is intentionally a real-image progressive reveal, not a spinner, blur block or skeleton. The
first useful content can move from infrastructure-bound (~1.3s in this cold trace) toward the cached
thumbnail's ~12ms decode while full-quality completion remains unchanged.

**Implementation hazards:**

- `onLoad` currently calls `markFullResLoaded(imageId)`; it must not mark a thumbnail load as a
  decoded full-resolution success.
- A stale full-image decode must never replace the thumbnail after traversal changes `imageId`.
- Avoid duplicate full-image requests from a preloader plus the DOM image. The request/decode owner
  and `StableImg` handoff must be explicit.
- Preserve `data-committed` carousel behavior, zoom URL upgrades, error fallback, graphic-image
  treatment, fullscreen entry and native-dimension capping.
- JA2's current first-visible boundary requires a decoded high-priority full image. Keep that
  full-quality metric, and add a separate thumbnail-first useful-content phase rather than silently
  redefining historical JA2.

**Failing-first evidence for a future implementation session:**

1. Component test: with thumbnail available and full decode pending, detail renders the thumbnail
  immediately and does not mark full-res loaded.
2. Completion test: resolving the current image's full decode swaps exactly once to the full URL.
3. Cancellation test: resolving an old image's decode after traversal cannot replace the new image.
4. Failure test: rejected full load retains thumbnail; rejected thumbnail plus full load reaches
  the existing text fallback.
5. Existing `StableImg`, traversal, detail, fullscreen and return-position tests remain strong; do
  not weaken assertions to accommodate the transition.
6. Add one perceived metric for click-to-first-decoded-thumbnail while retaining JA2's existing
  click-to-full-decoded/stable metric. Validate in direct ES and local media-api because the image
  URL path is shared, then confirm production-build behavior before claiming end-user magnitude.

**Backend record:** imgproxy/origin cold first-byte latency is the underlying ~1.18s wait in this
TEST trace. Backend/infrastructure improvement is out of implementation scope here. Progressive
display is useful even if that latency later improves, but it is mitigation rather than root-cause
removal.

##### C2 follow-up -- P14d landing CLS closed 13 September 2026

**Observation:** A failed campaign first exposed visible-image prefetch cancellation; the repair
passed four formal repetitions with 262/306/316/225ms landing times
([validation record](../changelog.md#13-september-2026--preserve-the-visible-traversal-image-request)).
The subsequent media campaign recorded P14d CLS 0.0558, from two durable events attributed only to
the detail image changing from a landscape rectangle to the same portrait rectangle
([canonical jank record](../../../e2e-perf/results/audit-log.md#new-scenarios-04c3fcadc-dirty-2026-09-13)).
The fixed detail container and surrounding chrome were not named as shift sources. Three exact
browser-local repetitions of 20 forward commits at 80ms produced zero unexpected CLS; in the one
uncached landing, the full image loaded 350ms after final commit with surrounding geometry
unchanged ([audit record](../worklog-current.md#session-log)).

**Inference:** The shift is real image replacement inside the fixed detail surface, not evidence
of surrounding product-layout movement.

**Decision:** Valid but acceptable image-only shift; not a confirmed product-layout regression.

This closes the P14d landing-CLS question with no code or metric change. Retain P14d as a traversal,
landing, cancellation and diagnostic CLS owner, but treat non-zero image-only CLS as evidence to
inspect rather than an automatic regression. Do not suppress the image source, change CLS filtering,
or lengthen the observation window. The separately deferred progressive-detail proposal above is
unchanged. The dedicated audit's completed verdict is preserved in the worklog; no separate audit
file is currently present.

#### C3. Position-map foreground interference

**Question:** Does the 2.6s background map build delay input, scrolling, or a foreground fetch?

- Measure one foreground action while map construction is active and a matched action after it
  completes.
- If there is no meaningful interaction degradation, retain PP10 as a diagnostic and close the
  candidate. Do not optimize a background duration merely because the number is large.

##### C3 findings — completed 12 September 2026

**Verdict:** Close with no code change. The 21,627-entry position map took 2,359ms wall-clock but
did not materially interfere with a foreground client-only panel action.

The live direct-ES TEST probe reloaded the pinned `uploader:avalonred` indexed context and observed
four dedicated position-map requests while the DAL walked the full result set in chunks. It opened
the right Details panel immediately after the first 10k-entry chunk finished, while
`positionMapLoading=true`, then repeated the identical action after final map publication. The
original hidden-panel preference was restored.

| Signal | During map construction | After map publication |
|---|---:|---:|
| Key dispatch returned | 12ms | 5ms |
| First geometry frame | 19ms | 9ms |
| Stable panel/results geometry | 68ms | 48ms |
| Width change | −324px | −324px |
| Severe frames | 0 | 0 |
| Max frame | 10ms | 10ms |
| LoAF blocking | 0ms | 0ms |

Across the complete 2.36-second map window there were two isolated frames above 50ms, max 68ms,
10ms p95, and no Long Animation Frame blocking. The DAL already yields between chunks
([source](../../../src/dal/es-adapter.ts#L2115-L2168)); network wait occupies most wall-clock time,
and final all-or-nothing publication did not disturb the matched foreground action.

This does not prove zero interference on every device, but it falsifies the premise needed for a
Kupua optimization today. PP10 remains useful as a background duration/coverage diagnostic. Reopen
only after a reproducible foreground slowdown correlated with map parsing/publication, or after the
threshold/chunk size materially increases.

#### C4. First usable Filters content

**Question:** How long after explicitly opening Filters can the user act on an aggregation-backed
facet, and is that wait debounce, Elasticsearch, or rendering?

##### C4 findings — implemented 13 September 2026

**Verdict:** Implemented without UI changes. Explicit hidden/collapsed→visible/expanded activation
bypasses only the generic 500ms aggregation debounce. Invisible hover prefetch, initial persisted-
open mount and query changes while Filters remains active retain trailing-edge debounce protection.

The maintained JB2 scenario starts only after facets are already available, so it cannot measure
first-use latency. Live direct-ES TEST probes measured Browse opening, Filters expansion, the batched
aggregation request and first rendered `metadata.subjects` facet on pinned indexed/search contexts.

| Path | Request start | ES/fetch | First usable facet |
|---|---:|---:|---:|
| Pointer Browse open + Filters expansion in Vite dev | 27ms | 208ms | 240ms |
| Keyboard Browse open + Filters expansion in Vite dev | 36ms | 242ms | 282ms |
| Isolated single `fetchAggregations()` call | 502ms | 175ms | 681ms completion |

The apparently fast pre-fix UI paths concealed a development-mode effect. The old `FacetFilters`
mount effect called `fetchAggregations()` twice under React Strict Mode, and the second call released
the first debounce early. A production-shaped single invocation waited 502ms before request start.

Mouse hover can deliberately prefetch before click when Filters was previously expanded, but touch,
keyboard and first-time collapsed-section paths cannot rely on that affordance. The Filters panel
also renders no aggregation loading state: users see ticker-backed `Is` controls while the ordinary
facet sections are simply absent.

**Implemented behavior:** `fetchAggregations` now has `debounced`, `immediate`, and `force` intents.
`immediate` skips only the timer and still honors the query-keyed cache and circuit breaker; `force`
remains reserved for the manual “Refresh (slow)” override. The always-mounted search route detects
the real Filters active-state transition, covering pointer, keyboard and touch without coupling the
request to mount behavior. Superseded ordinary calls now cancel cleanly instead of running early.

**Validation:**

1. Failing-first store tests prove immediate mode skips the timer while cache and breaker still win,
  and ordinary repeated calls remain trailing-edge debounced.
2. A real Playwright interaction proves opening Browse then Filters selects immediate intent.
3. Final validation passed 1,229 unit tests, 207 habitual Playwright tests and the production build.
4. No loading state, skeleton, permanent metric or other UI was added.

**Live TEST verification:** on a cache-cold direct-ES page, explicit Filters expansion set
`aggLoading` at 22ms and started the aggregation request at 23ms, removing the prior ~502ms timer.
The first usable facets arrived at 826ms; the remaining wait was TEST request/processing time. With
Filters left open, a real query change waited for search settlement and then retained the debounce.
With Browse closed and Filters persisted expanded, hover prefetch started at 517ms and the panel
remained closed. These probes returned timings and route classes only.

#### C5. Cold grid imagery

**Question:** Does `loading="lazy"` delay useful above-fold thumbnails after a cold navigation?

##### C5 findings — completed 12 September 2026

**Verdict:** No current fix. Above-fold thumbnails were not starved or serialized by lazy loading;
all rendered/overscan requests began together. Retain thumbnail priority as a low-value experiment
only if cold image arrival becomes a product complaint.

P1 currently stops when result DOM exists plus two frames, not when visible thumbnails decode. A
fresh direct-ES TEST tab installed probes before navigation, cleared browser cache, and loaded the
pinned Home corpus. It returned aggregate timing only.

| Cold navigation phase | Timing |
|---|---:|
| Navigation response end | 14ms |
| DOM content loaded | 341ms |
| Search fetch duration | 339ms (`took`: 85ms) |
| First grid cell / thumbnail element | 750ms |
| First thumbnail request | 824ms |
| First visible thumbnail load | 1,050ms |
| First visible thumbnail decode | 1,058ms |
| Half of visible thumbnails decoded | 1,066ms |
| All nine visible thumbnails decoded | 1,134ms |

Nineteen thumbnail requests (visible rows plus virtualizer overscan) all started within roughly 1ms.
Their median duration was 306ms, max 416ms, for 271KB encoded total. Thus the browser's lazy-load
distance threshold treated the complete rendered window as eligible; changing every thumbnail to
`loading="eager"` would not remove the dominant wait. The current grid marks each image lazy
([source](../../../src/components/ImageGrid.tsx#L283-L299)) and row-virtualizes with overscan 5
([source](../../../src/components/ImageGrid.tsx#L557-L565)).

There is a possible narrower experiment: give only the truly visible first row(s) high fetch
priority so they win connection slots over overscan thumbnails. The observed request-start gap from
cell insertion was about 74ms, so the upside is bounded unless proxy/S3 contention also falls. Do
not implement without a matched cold-cache image-decode metric; P1's current completion boundary
cannot prove a win. Thumbnail-proxy/S3 duration is infrastructure and remains out of fix scope.

#### C6. CQL value typeahead

**Question:** How long from a committed field prefix to actionable suggestions, and do superseded
keystrokes cancel obsolete aggregation work?

##### C6 findings — measured 12 September, fixed 13 September 2026

**Verdict:** Bounded request-waste fix complete. Registered resolvers now propagate the existing
cancellation signal. No debounce or coalescer was added, and no user-latency win is claimed.

PP8 begins after CQL processing and the search debounce, so it cannot measure suggestion behavior.
A live direct-ES TEST interaction typed the real short prefix `+keyword:foot` into the CQL editor.
The final clean pass measured from the colon through all single-field aggregation responses and the
first actionable shadow-DOM option, recording counts/timing only.

| Signal | Result |
|---|---:|
| Colon to first aggregation response | 380ms |
| Colon to all responses | 430ms |
| Final key to all responses | 249ms |
| Colon to actionable options | 434ms |
| Aggregation requests | 6 |
| Requests aborted | 0 |
| Individual request durations | 291–427ms |

All six requests overlapped and completed in a narrow window. Each suggestion pass aborted
`LazyTypeahead`'s own controller, but the network work continued. The pre-fix source showed why:
the registered resolver wrapper accepted only one argument, and `scopedAgg` called
`getAggregations()` without a signal
([LazyTypeahead](../../../src/lib/lazy-typeahead.ts#L151-L207),
[typeahead fields](../../../src/lib/typeahead-fields.ts#L197-L218),
[CQL wrapper](../../../src/components/CqlSearchInput.tsx#L183-L207)). Dynamic dotted-field fallback
already threaded cancellation correctly.

**Implemented behavior:** preserve key suggestions as immediate local work, but pass the current
`AbortSignal` from `TypeaheadField.resolveSuggestions` through the CQL resolver wrapper,
`TypeaheadFieldDef` resolver, `scopedAgg`, and `ImageDataSource.getAggregations`. A newer suggestion
pass aborts the preceding registered-field request. The third-party callback already carried the
signal cleanly, so no alternate abstraction was needed.

**Failing-first evidence:**

1. Rapid registered-field prefix changes start multiple logical suggestion passes but leave at most
  one network request active; superseded signals are observed aborted by the fake DAL.
2. An aborted old response cannot replace the newest option set or surface an error.
3. Dynamic dotted-field fallback retains its current cancellation behavior.
4. Static/cached suggestion lists and key suggestions remain immediate and issue no request.
5. Real TEST check compares request count and colon/final-key-to-actionable-option timing. Success is
  primarily request reduction; latency must not worsen.

Failing-first Vitest proved the controlled DAL received no signal before the fix. After the fix,
superseding `keyword:f` with `keyword:fo` aborts the first DAL signal, rejects its stale result,
retains the immediate `keyword` key option and publishes only the current `football` value option.
Focused typeahead tests passed 12/12, full units 1,231/1,231 and habitual Playwright 207/207.

A clean live TEST `+keyword:foot` repeat isolated six typeahead requests: five failed with
`net::ERR_ABORTED`, one completed, and the popup remained open with `football`, `FOOTY` and
`FOOTBALL`. The final request completed 399ms after the colon and options became actionable at
571ms. That unmatched sample is slower than the earlier 434ms sample, so it establishes neither a
latency gain nor a regression; request cancellation and latest-prefix correctness are the elected
evidence. Suggestions remain popular prefix completions while result search retains its exact
typed-keyword semantics; that pre-existing UX distinction is outside this fix.

**Priority:** Closed. The client fix benefits direct ES today and remains relevant when aggregation
routing migrates to media-api.

#### C7. Core grid scrolling

**Question:** Does ordinary grid browsing have sustained rendering, thumbnail-decode or page-
publication jank worth optimizing?

##### C7 findings — completed 12 September 2026

**Verdict:** Healthy; close with no code change. The core grid path does not share table P8's
reconciliation problem at the maintained P2 speed.

A live direct-ES TEST probe reproduced P2's exact action on the pinned Home corpus: rAF-driven
vertical movement of 50px/frame for four seconds, nominally ~3,000px/s, followed by settlement.
It recorded aggregate frames, LoAFs, DOM mutations, thumbnail requests and page commits.

| Signal | Result |
|---|---:|
| Distance / driving frames | 17,800px / 356 |
| Frame p95 / max | 18ms / 27ms |
| Frames over 33ms / 50ms | 0 / 0 |
| Long Animation Frames / blocking | 0 / 0ms |
| DOM additions / removals / attributes | 59 / 53 / 178 |
| Thumbnail requests started | 177 |
| Thumbnail median / max duration | 94ms / 319ms |
| Page commits | 1 |
| Final buffer | 400 items, offset 0, no error |

Neither thumbnail starts nor the page publication coincided with a severe frame because there were
no severe frames. The current row virtualizer, memoized cells and positional keys are doing their
job. Do not transfer P8's table solution into the grid, reduce grid overscan, or tune thumbnail
loading for scroll smoothness without new evidence. Cold first-image arrival remains the distinct
C5 question; traversal/fullscreen remains covered by P14.

#### C8. Deep Back restoration

**Question:** Is snapshot-based deep Back restoration slow because of client snapshot/placement
work or because of the search-and-anchor request chain?

##### C8 findings — completed 12 September 2026

**Verdict:** Measured slow path, but not scheduled. The recorded direct campaign reports 46ms
acknowledgement, 720ms store-ready, 884ms exact-anchor paint and 905ms settled; the media-labelled
campaign reports 47/1,070/1,238/1,254ms. Both retain zero aggregate ratio drift
([direct](../../../e2e-perf/results/perceived-log.md#short-added-new-scenarios-04c3fcadc-dirty-2026-09-13),
[media](../../../e2e-perf/results/perceived-log.md#short-new-scenarios-04c3fcadc-dirty-2026-09-13)).
The current path restores perfectly but serializes anchor discovery after the first page. Do not
schedule request overlap unless its bounded gain justifies Never Lost state-machine risk.

A live direct-ES TEST profile reused the habitual history scenario: seek to ~800, explicitly focus
a real deep anchor, push a query context that excludes it, then browser Back. The anchor identity
remained in browser memory only. The output retained request classes, phases and aggregate geometry.

| Phase from Back | Timing |
|---|---:|
| Loading acknowledged | 6ms |
| First-page search complete | 635ms |
| Anchor-by-ID/sort lookup complete | 761ms |
| Exact `countBefore` complete | 882ms |
| Backward buffer page complete | 1,042ms |
| Forward buffer page complete | 1,179ms |
| Accepted deep buffer / anchor visible | 1,181ms |
| Stable restored geometry | 1,297ms |

PIT open and ticker work completed before the first page. After the first page, the anchor probe ran
serially; `countBefore` and the two bidirectional pages then overlapped. The action had two frames
over 50ms, max 117ms, and one 129ms LoAF with 71ms blocking at final publication. Correctness was
excellent: restored buffer offset ~699, exact focused identity, visible anchor and zero measured
viewport-ratio drift.

The snapshot already stores the anchor ID and offset, but `_findAndFocusImage` still fetches the
target image/sort cursor and treats a no-position-map offset hint as an estimate requiring
`countBefore` ([source](../../../src/stores/search-store.ts#L1381-L1805)). Older design work considered
persisting an anchor cursor, but a cursor alone does not supply the target `Image` that
`_loadBufferAroundImage` inserts between exclusive forward/backward pages; stale offsets also need
care under edits and frozen history boundaries.

**Candidate sequence:** first, measure a maintained history scenario. Then investigate launching
the anchor-by-ID/sort probe alongside PIT/first-page/ticker bootstrap instead of only after first-
page completion. A more ambitious restore-specific pipeline could start count/bidirectional pages
as soon as PIT + anchor cursor are ready, but that needs a design proving exact totals, stale cursor
fallback, media-api parity, cancellation and snapshot compatibility. Do not simply trust
`anchorOffset` or skip `countBefore` without that proof.

**Evidence owner:** PP11 measures one perceived deep browser Back action on the pinned corpus.
It persists only store-ready, exact-anchor first-visible/stable phases, request route categories,
buffer regime and ratio drift; identity remains browser-local. The habitual browser-history E2E
remains the correctness owner. PP11 now has recorded four-run direct and media-api history.

**Stopping rule:** If concurrent anchor discovery saves only its ~126ms round trip or materially
complicates the already-correct restoration state machine, defer it. The larger theoretical gain
requires overlapping the post-anchor buffer build with first-page bootstrap and therefore merits a
separate architecture session.

#### C9. In-buffer selection and multi-image Details

**Question:** At a credible buffered selection size, is latency dominated by Set cloning,
persistence, metadata hydration, reconciliation, or rendering the open multi-image Details panel?

##### C9 findings — completed 12 September 2026

**Verdict:** Closed with no production change. Selection publication, JSON persistence and
reconciliation computation are healthy at 100–200 selected images. The development runtime's
post-reconcile Details render produced a scaling long task and the panel-closed control removed it,
but the exact action did not reproduce a severe frame in production React.

The live direct-ES TEST profile used the real L02 in-buffer gesture: select result 0, scroll before
timing so result 99 is already rendered, then Shift-click it. Details was open and settled before
the action. A second run extended the same contiguous selection from 100 to all 200 items in the
initial Home buffer. No server range walk was involved.

| Measurement | 1 → 100 selected | 100 → 200 selected |
|---|---:|---:|
| Atomic selection publication | 20.1ms | 19.5ms |
| Metadata request settled | 182.4ms | 173.7ms |
| Idle reconciliation callback | 1.8ms | 2.2ms |
| Reconciliation settled | 191.3ms | 179.3ms |
| Persisted JSON size | 4.3KB | 8.7KB |
| Debounced `sessionStorage` write | <0.1ms | 0.2ms |
| Long task after reconciliation | 81ms | 127ms |
| Maximum frame gap | 91.6ms | 140ms |

The corresponding fresh-tab, cold-cache 1 → 100 control kept Details closed. It issued the same
99-image metadata request (165ms), ran reconciliation in a 1.3ms idle callback, and settled with no
long task, no frame over 32ms and a 10.3ms maximum frame. This rules out metadata fetch,
reconciliation and grid selection-mode repaint as the source of the severe frame in this setup.

The owning panel subscribes to the whole selected `Set` in several child sections and repeatedly
walks it to derive cost, rights/leases and usage aggregates
([source](../../../src/components/MultiImageMetadata.tsx#L306-L525)). That remains a plausible
development-build render-fanout mechanism, but production confirmation did not earn component or
store changes.

Two independent cold production-runtime repetitions used the same pinned corpus and real UI path:
select the first image, pre-scroll result 99 into view, then Shift-click it with Details already
open. Both reached exactly 100 selected images, complete metadata, completed reconciliation and two
stable panel frames. Results were 25ms/9ms and 24ms/9ms maximum/p95 frame, with zero long tasks and
zero frames over 50ms. Visual settle was 249ms and 328ms. The direct-ES `_mget` began at 37–39ms,
took 147ms and 232ms, and dominated the elapsed difference. The first valid run also observed
0.0157 layout shift while producing an 8,905px scrollable panel, without severe frame or long-task
cost. A third attempted repetition was invalidated before probe arming by inherited search-input
state and is excluded. No temporary instrumentation remained after either valid run.

**Evidence owner:** P18 measures a 100-item in-buffer range with Details already open, recording
only aggregate count, cache regime, idle callback time, phase timing and normal frame/LoAF metrics.
The recorded direct campaign reports 84ms maximum frame, 25ms p95 and 38ms LoAF blocking; the
media-labelled campaign reports 99/84/47ms. P18's owned metadata request is direct ES in both modes
([canonical jank logs](../../../e2e-perf/results/audit-log.md#added-new-scenarios-04c3fcadc-dirty-2026-09-13)).
Production React did not confirm the scaling tail, so do not profile or change the panel's
render/commit tree from this evidence. Stage B is not earned.

Do not build a 2k–5k synthetic selection benchmark yet. That exercises the documented hard cap but
not a demonstrated workflow, and would mix server range walking, large response transfer and panel
rendering. Admit L03/L08 at that scale only when product usage or an incident establishes value.

#### C10. Continuous responsive and panel resize

**Question:** Does continuous width change become expensive only when the grid crosses a column
threshold, and does anchor restoration preserve the user's place through that recomposition?

##### C10 findings — completed 12 September 2026

**Verdict:** Correct and bounded, with one threshold-crossing long task. Keep as a low-frequency
candidate; do not optimize unless production-build confirmation or real resize usage makes a
single ~85–113ms threshold frame important.

The live direct-ES TEST profile used a stable focused image around the middle of a deep viewport.
Each action used 20 real pointer/viewport steps at ~16ms cadence. A right-panel drag that kept the
grid inside its two-column band was the matched control; a second drag crossed exactly one 2→3
threshold. A browser-width narrowing pass independently crossed 3→2.

| Action | Columns | p95 / max frame | Long task | LoAF / blocking | Anchor ratio drift | CLS |
|---|---|---:|---:|---:|---:|---:|
| Right panel +80px | 2 throughout | 25 / 58ms | none | 68 / 2ms | 0 | 0 |
| Right panel -160px | 2→3 at 842px | 18 / 75ms | 54ms | 85 / 35ms | 0 | 0 |
| Viewport -160px | 3→2 at 826px | 42 / 109ms | 79ms | 113 / 62ms | 0 | 0 |

This matches the owning code. Panel drag writes width directly to the DOM and commits persisted
width only on mouseup ([source](../../../src/components/PanelLayout.tsx#L124-L176)), while every
`ResizeObserver` notification still updates `cellWidth`; a changed column count additionally
captures and restores one real image anchor in a layout effect
([source](../../../src/components/ImageGrid.tsx#L453-L608)). The threshold adds one expensive
recomposition, not progressive drift or sustained jank.

The same-column control's two >50ms frame gaps carried almost no LoAF blocking and no long task,
so they may include embedded-browser/input-driver scheduling. The threshold result is stronger:
both independent actions placed a long task and blocking LoAF at the column transition. This is a
development React build, so absolute magnitude is not a production claim.

**Candidate sequence:** no new habitual metric now. P5 already owns discrete panel layout and the
anchor math has focused unit/E2E regression coverage. If continuous resize becomes an active UX
priority, add a standalone diagnostic that records transition count and exact-anchor drift, then
profile the one transition commit in a production bundle. Stop if the production transition is
below 50ms or if reducing it requires weakening synchronous anchor restoration.

### Phase D — Migration-specific characterization

Do this when media-api mode is available on the same revision, and repeat after a migration step
only when that step moves a measured method. This is a **scenario menu, not a minimum matrix**:
select only the row whose route or publication behavior the current migration decision can change.
One session serves one decision.

| Scenario menu | Why both modes may matter |
|---|---|
| Initial search/Home | `searchAfter` and enrichment differ; PIT/count are still ES today. |
| Forward and reverse extend/evict | Repeated cursor pages, prepend alignment, overlay commits. |
| P8 table fast-scroll | Client work plus potentially overlapping page publication. |
| Shallow cursorless seek | The ES escape hatch exists only when there is no cursor/PIT/reverse/end flag; route capture is mandatory. |
| Deep/date/keyword seek | API visible pages mix with ES rank/distribution helpers. |
| Indexed scrolling | API page data mixes with an ES-built position map. |
| Sort-around-focus/history restore | Probe isolation and accepted-buffer atomicity matter. |
| Rapid cancellation | A slower response must never publish stale results or overlay data. |

Stop the package when the expected route is not observed, the action did not cross the changed
method, or no maintained metric owns the decision. Define a new metric only when the decision is
important enough to justify it; do not run the remaining menu as compensatory coverage.

#### Current local-media-api baseline — complete

The latest recorded evidence is the 13 September four-run direct campaign labelled `Added new
scenarios` and four-run media campaign labelled `New scenarios`: 32 jank metrics, 15 short
scenarios and 8 long-journey steps in each. Their source SHA is the same, but their dirty-state
hashes differ, as do browser origins. They therefore characterize broad paths directionally and
must not be treated as a causal pair
([jank](../../../e2e-perf/results/audit-log.md#added-new-scenarios-04c3fcadc-dirty-2026-09-13),
[perceived](../../../e2e-perf/results/perceived-log.md#short-added-new-scenarios-04c3fcadc-dirty-2026-09-13)).
If a decision needs cleaner attribution, run a direct-ES control through the same HTTPS origin on
the same fingerprint before changing code.

A deployed-TEST D3 campaign is separate future work, not a rerun of this baseline. It needs an
explicitly deployed D3 media-api build, a route change from local `/api` proxying to that deployed
endpoint, read-only authorization, its own environment fingerprint, and a decision about whether
the comparison is local-vs-deployed topology or D3 implementation parity. Do not point the current
harness at production-like infrastructure casually.

Each campaign must retain mode, revision, dirty state, browser/OS/viewport/DPR, corpus cutoff,
cache class, sample count, and routes actually observed. Never compare entries when those gates
differ.

#### API enrichment lifetime diagnostic

After several extend/evict cycles, record only aggregate values:

- live image-buffer length;
- enrichment-map entry count;
- time to publish one additional page;
- heap/retained-object trend if browser tooling can obtain it safely;
- whether entries are needed by visible detail or selected-image flows.

If growth is demonstrated, D9's ownership/chunking review is a prerequisite to any pruning design.
Do not fix this inside the adapter or by clearing overlays on every eviction.

### Phase E — Conditional investigations

Unmeasured variants such as expanded facets, collection counts, out-of-buffer selection, reload,
polling and mobile gestures enter the programme only when at least one admission gate is met:

1. a reproducible user-visible complaint;
2. a maintained target miss whose measurement owns the real trigger;
3. a profile from an active higher-priority investigation shows material cost there;
4. an imminent product/migration change will materially increase that path's frequency or scale.

Each gets its own question and stopping rule. None should be bundled with P8.

---

## 9. Prior experiments not to repeat blindly

| Idea | Standing evidence |
|---|---|
| Feed all buffered rows to TanStack Table | Caused multi-second stalls and eventual OOM; current visible-window feed is intentional. |
| Table overscan 20 | Historically increased P8 severe jank and DOM churn. |
| Table overscan 5 as an automatic answer | It improved an older P8 profile but was later raised to 15 to avoid rubberbanding/blank-row behavior. Re-profile the current trade-off; do not copy the old conclusion. |
| `content-visibility:auto` on virtual rows | No effect because TanStack already virtualizes the DOM. |
| `contain:strict` on cells | Broke sizing/click targets; `contain:layout` is the retained safe form. |
| Page size 200→100 | More frequent extends made jank worse. |
| Generic key change | Content and positional key experiments caused reordering or wrong-image behavior. |
| `startTransition` around density changes | Broke the synchronous focus-preservation handoff and produced one-row drift; it does not reduce total mount work. |
| “Optimize Zustand” for seek | Profiling found compute/store publication around 0.39ms; network and render dominated. |
| Client media-api parse/map optimization | Measured at roughly 12ms parse and ~0ms map for 200 hits; not a useful target. |
| Request-time effective dimension runtime fields | About 2.2× slower on bounded TEST and required duplication across positional paths. |
| Broad scroll/coupling cleanup | A prior pass regressed Home, density focus, ordering, and image identity. Small measured changes only. |

The historical rendering experiments are in the
[rendering plan](rendering-perf-plan.md#L430-L550); the broad regression is preserved
in [DISASTAH-NOT-PERF](DISASTAH-NOT-PERF.md#L85-L159).

---

## 10. Backend and server opportunity register — record only

These may be higher-value than frontend work, but they are not authorized for implementation here.

| Opportunity | Evidence | Standing action |
|---|---|---|
| Materialize `latestUsageDate` and `latestCollectionActionDate` | Current Last-used histogram inflates 4.14m images to 5.03m positions; exact 24-bucket workaround took 2,993ms. | Preserve the backend case; no frontend exact-filter-bank workaround. |
| Materialize `effectiveWidth` / `effectiveHeight` | Runtime coalescing was about 2.2× slower on TEST and does not compose cleanly across cursor/rank paths. | Preserve known UI/sort discrepancy until canonical fields exist. |
| Shared single-pass media-api envelope construction | A duplicated `createForBrowse` prototype reduced 200-hit envelope work from ~129ms to 68–81ms, then was reverted. Later analysis separated the reusable transform-chain cost from endpoint policy. | Do not recreate `createForBrowse`. If reconsidered, optimize shared `ImageResponse.create()` with response-equivalence tests and production transport evidence. |
| Omit browse-only links / S3 presigning | Kupua discards signed URLs and editorial links; signing/links measured around 29–30ms/page, while Kahuna consumes them. | Separate endpoint option defaulting to current behavior; media-api contract/design question, not a client parsing task. |
| Keyword doc-value fields and normalizers | High-cardinality `.exact` paths make aggregations/seek expensive and leave some fields without suggestions. | Mapping proposal; retain measured field/storage trade-offs. |
| Exact collection hierarchy field | Current hierarchy/count semantics can require fielddata or client reconciliation. | Mapping/index design; measure heap/storage before proposal. |
| Imgproxy output/result cache | Detail first-visible latency may expose repeat transformation cost; OSS deployment has no result cache. | Only promote after JA2 attribution and hit-rate/cost evidence. |

The canonical scalar-field evidence is
[Materialized scalars for semantic sort values](../materialized-scalars-for-lastUsed-lastAddedToCollection.md).
The media-api envelope evidence is in the
[D3 deep dive](../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/phase-3-d3-searchafter-perf-deep-dive.md).

One additional item to preserve for later review: the current API request derives exact counting
for cursorless calls, not solely the ordinary first page. Before changing it, enumerate every
cursorless probe/reverse path and prove which callers need a fresh total. This is a server-contract
optimization candidate, not a safe boolean tweak.

---

## 11. Documentation and decision hygiene

- Keep this file as the live index. Do not create one document per speculative idea.
- An active investigation may create at most one findings document, linked from its phase here.
- Findings must separate measured observation, causal inference, and static suspicion.
- Every performance claim needs a source/metric/profile reference and its environment.
- If later evidence refutes a candidate, remove or reclassify it; do not leave a false finding in
  the ledger with a correction elsewhere.
- Keep raw traces, profiles, TEST logs, URLs, and identities out of the repository. Persist only
  redacted aggregates needed for the decision.
- Runtime changes still require the normal `AGENTS.md`, worklog, changelog, tests, and deviation
  discipline. The completed programme includes the C4 runtime scheduling change and P14d visible-
  image cancellation repair; their validation is recorded in the changelog.

## 12. Definition of success for this programme

This work is successful if it produces fewer, stronger decisions, not more optimization commits.

- P8 has a reproducible current baseline and a profile-attributed owner; implementation remains
  explicitly deferred.
- Progressive detail loading remains explicitly deferred unless the product decision changes.
- Direct-ES remains correct and supported.
- Media-api performance claims use route-attributed current campaigns; causal comparisons require
  matching dirty-state fingerprints and browser origins.
- Migration work is not blocked or made harder by premature caching, pruning, or adapter side
  effects.
- Background and hypothetical costs are closed when they do not affect users.
- Backend opportunities remain documented without frontend workarounds that duplicate or weaken
  the future contract.

**Disposition:** Complete. This report authorizes no immediate follow-up task. P17 and P18 are
closed by production disconfirmation, and C6 cancellation is implemented. PP11 request overlap is
measured but unscheduled. Do not start progressive detail loading, table virtualization,
responsive reflow work, 2k–5k selection stress, enrichment pruning, or backend/index changes from
this report.