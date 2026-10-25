# Scroll continuity: decisions and next work

Updated 25 October 2026. This guide owns the next decisions for **B2: metadata
supply and buffer-edge blocking**, and remaining **F2: current-image delivery**
work. It retains current policy, useful evidence and limits, not session history.
Numeric records live in the [research evidence](scroll-horizons-thumb-lookahead-results.json)
and [campaign history](../../e2e-perf/results/density-log.json). Historical
recommendations inside those records are checkpoints, not current authority.

## Recommendation

**Qualify the existing bounded 400ms backward-prediction candidate against today's
product baseline.** Grid/Table render-work repairs and detached-thumbnail cleanup
are implemented. B2 remains open: the smaller predictor has a demonstrated
blocking benefit, but not an all-layout, all-goal acceptance result on that baseline.
Do not restart a broad candidate search, widen horizons by assumption or wait for
every remaining delivery question.

Live evidence shows metadata publication releasing walls while thumbnails remain
pending. Cleanup can reduce delivery contention; it cannot supply missing records
or guarantee stable Justified packing. Initial runway and late-arrival geometry
are separate decisions.

Keep three independent goals:

- **Useful progress:** ready current images while browsing and after stopping.
- **Smoothness:** consistent frames, not smooth blank slots or a stalled viewport.
- **Stability:** intended identity/position and correct ratios without unsolicited movement.

No aggregate score or request-count reduction can trade away one of these goals.

<a id="current-decision"></a>
## Current State

| Area | Implemented baseline | Remaining decision |
| --- | --- | --- |
| B1 and velocity ownership | Stale viewport reports do not become backward demand; maintenance does not create predictive velocity. Legitimate programmatic demand remains valid. | Candidate-specific navigation/maintenance interaction, not a wheel-only admission rule. |
| F1 thumbnail admission | Thumbnail-only loading updates; visible rows plus two lower rows eager, upper/rest lazy, five-row overscan. | Sustained delivery and unseen backward entry; the lower band is not a complete priority policy. |
| B2 | Backward threshold remains 50. Forward prediction uses a 400ms horizon capped at one page. | Qualify the researched backward mirror; it is not implemented. |
| Fixed Grid | KUP-042 preserves global row membership and net-origin compensation, with complete pages and exact-capacity eviction. | Media arrival/animation is distinct from fixed-row correctness. |
| Grid/Table rendering | Reused locale formatters, memoized date/cell content and stable image-based inputs avoid demonstrated repeated work. | New optimization needs a measured residual bottleneck; no broad renderer rewrite is justified. |
| Table identity and lifetime | Stable row keys retain elements; detached incomplete thumbnails release their native source. | Moving delivery remains constrained; reversal can require new transfers. |
| Grid/Justified lifetime | Detached incomplete thumbnails release their source; connected/completed/shared consumers remain protected. | Conditional benefit, not visible-first scheduling or proof of upstream savings. |
| Detail return | Grid handlers read current query params without depending on image-only route identity. | No clear warmed-return latency gain or wrapper/restoration redesign justified. |
| Justified geometry | Truthful dimensions and anchor compensation remain authoritative. | Partially known boundary blocks can repack visible images despite a stable centre anchor. |

<a id="active-plan"></a>
<a id="potential-next-steps"></a>
<a id="next-discriminating-work"></a>
## B2: The Next Decision

### Leading Candidate

Reuse `forwardExtendThreshold(-velocityEma)` for **seek-mode backward admission**:
`min(200, 50 + max(0, -velocityEma) * 400ms)`, with velocity in results/ms. Preserve
first-row validity, velocity resets, base demand, cooldowns, per-direction
concurrency and compensation. Leave forward policy, indexed mode, page size and
retention unchanged.

This is the candidate in `b2LocalComparison20261020`, not the later 1,000ms
experiment. It is a recommendation to qualify, not implementation approval.

### Established Evidence

The corrected matched study has ten pairs per layout, both treatment orders,
matched starting windows/geometry, synthetic media and held metadata reads.

| Case | Result | Decision value |
| --- | --- | --- |
| Grid, 900ms reads, sustained/reversal/capacity | About 259-340ms blocking became zero; one extra page and greater travel. Some frame/exposure results worsened. | Strong support for the smaller predictor; fewer walls alone is not acceptance. |
| Justified, same slow-read cases | Blocking fell by 623-658ms but remained 337-381ms; one extra page and more travel. | Meaningful reduction, not uninterrupted browsing. |
| Fast 350ms delivery | Neither policy blocked. | Retain as a negative control; do not invent benefit where supply keeps up. |
| Exact 600px short stop | Zero versus one read, without a candidate post-stop refill chain. Justified exposure was 46-49% versus zero; stopped readiness about 199-205ms versus 40-52ms. | One extra page is the accepted bounded speculation envelope, but visible cost still needs qualification. |
| Capacity/reversal | Retention stayed bounded; held-refill/current-policy anchor controls exist. | Reuse them without claiming coverage of every candidate navigation or all-visible-box transition. |

Grid and corrected Justified records use different setup revisions. The rejected
Justified setup allowed prefetch during restoration, changing 201 records to 401
before timing. Accepted pairs activate the candidate after matched setup. Do not
pool the rejected setup or prohibit legitimate programmatic demand to avoid it.

### Focused Qualification

**Question:** with current cleanup and geometry/render fixes held constant, does
the 400ms backward candidate retain its blocking benefit without unacceptable
readiness, frame, placement or resource costs?

1. Reuse the [existing comparisons](../../e2e-perf/research/density-app-research.spec.ts)
   for short stops, slow sustained backward motion and capacity/reversal in Grid
   and Justified, plus a fast-delivery negative control. Match runway, ordered
   content, geometry, input and media conditions; reverse treatment order. Adapt
   pre-KUP-042 setup assumptions without weakening geometry assertions.
2. Keep cleanup on in both arms. Compare backward threshold 50 with the candidate.
   Reuse F2-only evidence; a four-arm factorial needs a specific unresolved interaction.
3. Record achieved work/walls, moving readiness, stopped data/decode, retained
   boxes/sources, frames, accepted reads and pending work. Preserve short-stop
   bounds, reversal and non-wheel demand without maintenance-driven refill chains.
   Synthetic latency is not native-photo delivery; any delivery-dependent claim
   needs a separately authorized bounded representative-photo comparison.
4. Make a **per-layout disposition**. Grid need not wait for a Justified packing
   redesign. If Justified still trades fewer walls for worse pictures/frames,
   retain the adverse result and choose its next narrow discriminator.

Completion means a supported implement/retain/reject decision with named exceptions,
not universal no-blocking guarantees under arbitrary latency. A selected product
change still needs regressions, required full gates, independent review and an
operator-run compatible campaign.

### Initial Runway Is Separate

`b2UninterruptedResearch20261021` separates starting availability from steady lead
time. With 201 Justified images and 83 results of runway, both 400ms and 1,000ms
horizons blocked about 339-341ms under 900ms delivery. A larger horizon cannot make
the first response arrive before insufficient initial runway is consumed.

Ready-runway controls loaded an extra page **before timing in both arms**. They do
not establish free startup prefetch or an acceptable navigation wait. If first-entry
blocking remains important, explicitly decide admission timing, seek/history
coexistence, exposure delay and short-stop cost. Never delay metadata publication
for thumbnail completion or silently withhold ready results.

The 1,000ms result is a conditional Justified alternative, not the default patch.
With ready runway it kept sampled non-rigid geometry below 0.016px where 400ms
backward controls moved up to 1,466px and censored endpoints. However, backward
frame-p95 worsened about 25.5-26.2 to 32.8-33.3ms and exposure increased. Grid had
zero walls under both horizons, giving no demonstrated reason to widen it.

## Research Questions and Fixes to Ponder

**DONE means the named, demonstrated defect is repaired, not that its entire
performance domain is solved.** Open work is ranked for the next decision; it is
neither blanket implementation approval nor a new set of prerequisites for B2.

| Status | Question or fix | Current evidence and disposition |
| --- | --- | --- |
| OPEN | Why do constrained Grid/Justified landing cohorts change? | Revision 4 censors 3/4 Grid and 2/4 Justified landings despite later decoded media. Associate stopped cohorts/retained boxes with publication, viewport and edge membership. Distinguish harmless membership change from position loss; do not relax the cohort check or call it a timeout. Can proceed alongside B2. |
| OPEN | What causes Justified visible boundary repacking? | A block changing from 4 known dimensions to 48 moves/resizes a previously correct image while its source and centre anchor remain correct. Earlier metadata can move work offscreen, not guarantee stability. True-ratio fragments remain a feasibility result with unresolved lifecycle. |
| OPEN | Does current cleanup remove B2's short-stop/readiness penalty? | The old 400ms study predates cleanup and render repairs. Qualify its incremental value on the current baseline as specified above; do not widen horizons to hide costs. |
| **DONE** | Table detached-request ownership defect | Reproduced missing source release, qualified shared/completed/re-entry consumers and implemented URL-scoped passive cleanup. Production controls recover 29/29 images around 2.1s versus 0/29 at cap; reversal adds 39 repeated starts. **Remaining:** sustained moving delivery and canonical post-fix recovery, not another cleanup investigation. |
| **DONE** | Demonstrated Grid/Table render-work defects | Removed repeated locale setup, duplicate derivation and retained-row model-identity churn; moved Grid date work behind memoization. Bounded synthetic/live DEV rechecks support the repairs. **Remaining:** paint/arrival/enrichment and long/constrained workloads, not assumed further formatter or renderer work. |
| **DONE** | P13b retained Grid callback churn | Image-only route changes invalidated three handlers across 84 retained cells. Latest-param reads remove the renders while preserving strict placement. First-return DEV work improves; no clear warmed-return latency gain or canonical speedup established. |
| **DONE** | Dashboard provenance and evidence presentation | Member-consensus source metadata, actual baseline membership, adverse recovery flags/counts, frame populations and explicit delta/boundary labels are implemented. **Remaining:** unavailable request-to-current-image associations and joint censor reasons cannot be inferred from aggregates. |
| OPEN | Would one eager row above help unseen backward entry? | Lower-band studies did not test it. Cached reversal is not unseen entry after eviction/seek. Compare two-below against two-below/one-above at fixed metadata policy, including frame/refresh cost; not a buffer/scheduler mandate. |
| OPEN | Does mounted background demand still impede useful delivery? | Cleanup removes abandoned consumers, but moving readiness remains poor. Attribute current demand before selecting visible-first native admission. Delaying `src` changes admission even when `loading` remains eager. |
| DEFERRED | Does local proxy behavior need improvement? | Actual-handler controls show full-body buffering, no client-close abort and no in-flight miss coalescing. Operator excludes proxy redesign from this work. Any later coalescing/streaming/abort decision must preserve or explicitly change cache warming and measure benefit. |
| OPEN | What changes on hosted media? | HTTP2/CDN can alter contention, not remove bandwidth/render/ownership cost. Qualify the actual deployment path, signed-URL expiry and shared consumers rather than copying laptop HTTP1 limits. |

### Justified Geometry: Feasible Alternative and Limits

The true-ratio fragment control in `b2UninterruptedResearch20261021` preserved
known rows and independently packed incoming images at actual ratios. Four
mixed-ratio unit cases and a stopped backward-publication compositor control
support feasibility: 32 retained targets stayed stable, the previously moving
point shifted about 0.37px vertically, and all 1,000 loaded boxes respected ratios.
This is **not** a general fragment lifecycle or blocking fix.

Selection still requires repeated/moving publications, both boundaries, partial
eviction, release/coalescing, true ends, bounded state, resize/density/seek/history,
and consistent row lookup, keyboard neighbours, hit targets and extent. Incomplete
rows can leave horizontal space and add height. Use applied-input observers and
calibrated pixel controls: the old DOM observer missed common-mode movement, and
none of these controls establishes every-frame paint coverage.

**Do not revive provisional square-slot retention.** It preserves old boxes by
giving new visible images unsuitable shapes. Original-cohort departure, timers,
idle and media readiness do not make release safe when other block members remain
visible. Lifetime research establishes that constraint, not an implementation recipe.

<a id="revision-4-campaign-assessment"></a>
<a id="active-pressure-campaign"></a>
## Campaign Evidence That Changes the Plan

### Historical Revision-4 Diagnosis

**Scroll load and recovery v4**, timestamp `2026-10-22T23:01:03.116Z`, HEAD
`2fb9bf3ee` with dirty tree, is the pre-render-repair diagnostic baseline. Four
repetitions completed 36 workloads/84 records: local media-api, seek mode,
Chromium 151, 1720x960/DPR2. Capture/coverage passed; paint is unmeasured. These
observations are not current post-Table-cleanup measurements.

| Observation | Retained meaning |
| --- | --- |
| At requested 200 results/s, backward progress is 149/134/148 results/s and walls 699/915/715ms for Grid/Justified/Table. | B2 remains material after Grid/Justified cleanup. Phase medians are not universal thresholds or episode durations. |
| Constrained 100 results/s: median pending slots 88/84/92%, zero metadata walls in every repetition. At 200, all reach 100% pending and walls appear. | Delivery and metadata continuity are separate. Earlier metadata alone cannot cure unready pictures. |
| Ordinary forward decode medians 365/810/341ms; worst Table 2.20s. D2 short-reversal landings 27/21/53ms. | Revisiting recent content does not establish unseen-entry performance. Do not add data/media clocks or omit adverse repetitions. |
| Constrained stable decoded endpoints: Grid 1/4, Justified 2/4, Table 0/4. | Grid/Justified censor on cohort changes, not four-second decode timeouts. Table retains its cohort but misses the cap. No survivor-only latency median. |
| Grid/Table exceed 33.4ms at every load step/repetition; Justified has adverse backward/reversal geometry. | Historical motivation for attribution, not proof that repaired Grid/Table still have the same frame defect or an overall density winner. |
| Ordinary Justified forward at 100 results/s: about 0.2% median pending slots, 64% worst repetition. | Median readiness and comfortable initial runway do not establish reliable sustained supply. |

Initial windows contain 201 images and about 83-92 results of runway; gentle
motion largely consumes prepared content. Four-sample p95 is the worst repetition,
not a population tail. Table slot counts are not whole-viewport pending area.

### After-Rendering Canonical Comparison

The four 24 October entries and four 25 October entries in campaign
`ee34e38f-0d8a-48d1-b1b6-05b2dba776e1` (**after rendering fixes**) have matching
78 scenario IDs, contracts and four-observation populations: 34 rendering,
15 short, 8 long and 21 density scenarios. Topology, canonical media, browser,
viewport/DPR, cutoff and worker/CPU settings match; source, content and cache
warmth are not controlled. All 6,100 density field summaries have consistent
sample/unavailable totals; browser sidecars match canonical JSON.

- **Table delivery lead, since repaired locally:** D8 retained a median 28 images
  but decoded-count median/maximum zero. Global request carry-in rose 293.5 to
  314.5 and end-pending 164 to 172.5; data-ready was 16.75ms under a 4s recovery
  cap, with no recovery failures, HTTP errors or cohort changes. These counts
  motivated ownership qualification, not proof of which requests were obsolete.
  The subsequent Table cleanup is not measured by this campaign.
- **P13b lead, since attributed locally:** frame-p95/max improved 100 to 59ms and
  LoAF blocking 48 to 6ms over roughly six frames. This is not action latency.
  The later callback repair has local evidence below, not a new canonical result.
- **No established client defect from full-image waits:** JA2 loaded/stable
  settlement rose 6,474 to 11,762ms while store-ready fell 134 to 117ms; P13c
  decoded detail rose 1,374 to 1,884ms; P14c fast-backward landing 2,695 to
  3,560ms, with loaded-within-cadence 2/10 to 1/10. Proxy performance is a known,
  excluded limitation. Do not add clocks, equate loaded/decoded/painted, or infer
  backend costs from landing Resource Timing.
- **No p95-only regression verdict:** P15b is fullscreen traversal, not return.
  Its p95 rose 10 to 22ms, but max fell 50 to 34ms, blocking 15 to zero and
  frame count 157 to 57. Changed window composition matters.

Nine D1/D2/D8 records changed contracts in revision 4. D3-D7/D11 retain twelve
comparable records; the new 100-results/s step is not the old continuous journey.
Do not calculate a cumulative speedup across that boundary. Comparable seek
medians improved 2082 to 1353ms Grid and 1994 to 1762ms Justified while maintenance
frames and paired refresh decode penalties worsened (7 to 73ms and 45 to 109ms).
Both campaigns already had Grid/Justified cleanup; this is not another controlled
cleanup intervention. Campaign labels can precede eventual commits: use contracts
and provenance, not commit order alone.

## Completed Render Repairs and Retained Evidence

**DONE: the demonstrated repeated render/formatting work is removed.** Grid
shares two Intl date formatters and computes caption/tooltip dates inside its
cell memo boundary; image-only Justified cells skip dates. TableRowCells takes
stable image/column/enrichment/handler inputs, not volatile TanStack Row objects;
outer rows also avoid Row identity churn. Display/tooltips share accessor output,
and numeric fields reuse one default-locale number formatter. Table date-fns,
headers, bounded model input, focus/selection, enrichment and geometry stay intact.

### Why These Repairs Were Selected

| Control | Useful evidence | Limit |
| --- | --- | --- |
| Resident/predecoded Grid/Table with minimal observers | Warm Grid frame-p95 about 58ms and Table 133ms persisted without result publications/read starts. Profiles implicated Grid date work and Table enabled-cell/React work. | DEV, short passes; profile windows include setup. No paint/raster or production-build attribution. |
| Grid exact-option native/reuse/reuse/native formatting | Output parity held; native frame-p95 50.0/41.7ms versus reuse 16.7/9.3ms. Actual formatter fix recheck 16.8/9.4ms. | Demonstrates repeated locale setup in this reproduction, not the entire historical frame gap. Table uses different date formatting. |
| Table original/thumbnail/selection/date/numeric column controls | Original 23-column frame-p95 50.0/58.3ms; thumbnail 16.7/25.0ms; selection 16.7/16.7ms. Date/numeric-only arms did not explain the whole gap. Retain the original 117ms worst interval. | Enabled-cell work matters; not zero row/virtualizer cost or justification to remove useful columns. |
| Retained-row native/semantic reference control | Only `row` changed for retained images. Native 2,376-3,026 row-body calls versus semantic 156-158; semantic p95 16.7-17.5ms versus native 33.4-75.0ms. | Diagnostic comparator is not shipped: image identity alone cannot cover column/model, metadata, selection or enrichment changes. |

The retained-row control used local mock data, 400 residents, 200 predecoded
synthetic thumbnails, seek mode, 1720x960/DPR2, 27 initial Table rows and fixed
80-result work. Achieved rates differed (about 91-101 results/s), so it is not
an exact matched-rate benchmark. Declared geometry/text/tooltips matched; no
pixel/paint witness was taken. Observer-present diagnostics are not observer-free
browser attribution.

### Implemented Results

Final isolated controls retained the same 400-result array, predecoded media,
viewport and fixed 80-result work, with no publications or pending endpoint media.

- Table production row-body/title counts were 160/160/158, frame-p95
  17.7/17.2/16.7ms; the semantic comparator found no remaining Row churn to skip.
  Retain the 25.1ms worst interval and 2.7ms thumbnail-observer maximum.
- Grid date calls fell from 6,552 to 504 per pass; measured formatter work from
  11.1ms to 1.2/0.8ms. Both already had about 16.7ms frame-p95: this follow-up
  saves CPU, not an established further frame-cadence improvement. Justified
  performed zero date calls. Numeric reuse has parity/allocation coverage, not
  separately isolated frame-speed attribution.
- Direct memo counters found all 3,144/2,940 retained Grid comparisons and
  4,338/4,269 Justified comparisons skipped in steady-window motion. No handler
  churn was observed there; detail-return churn is a separate mechanism below.

A bounded foreground live DEV recheck verified served source hashes, ApiDataSource,
deployed TEST/canonical media and 1720x960/DPR2. Ten fixed-work passes used 400
residents and about 80 calibrated results each, with zero read starts/publications
and no intervals above 33.4ms. Caches/enrichment were not independently controlled.

| Live DEV condition | Frame-p95 ms | Worst interval ms |
| --- | --- | --- |
| Grid ordinary / explicitly prewarmed | 24.9 / 9.1 | 25.1 / 16.6 |
| Table ordinary / explicitly prewarmed | 17.6 / 16.7 | 25.3 / 25.5 |
| Justified ordinary / explicitly prewarmed | 9.4 / 9.2 | 16.8 / 16.7 |
| Table full columns, bracketing thumbnail-only | 17.4 / 16.8 | 25.1 / 25.0 |
| Table thumbnail-only, two observations | 8.7 / 9.1 | 16.7 / 9.4 |

The former large warm Grid/Table penalty was not reproduced. Full Table retains a
smaller metadata-cell cost; no exact browser-subsystem diagnosis or further rewrite
follows. Historical/current observations are not randomized paired speedups, hosted
or production-build results, population tails, constrained-delivery or paint proof.
Table's 27 usable rows and the media helper's 29 intersecting images are different
populations. Remaining approximately 1ms Grid formatting work does not justify extra
caches without a newly measured bottleneck.

### P13b Return Attribution and Callback Repair (25 October 2026)

**DONE: image-only route transitions no longer invalidate retained Grid handlers.**
`enterDetail` reads the existing latest-params ref at invocation. Cursor capture,
history, focus, wrapper visibility, return placement, density and interruption
owners are unchanged. The regression failed first on onCellClick,
onCellDoubleClick and onTickClick changing across 84 retained cells, causing 168
DEV render calls; after repair all 84 comparisons skip, with zero retained renders.

Local controls used mock data/400 residents, 84 decoded synthetic thumbnails and
decoded detail, 1720x960/DPR2, real Backspace/history return and the existing stable
focused-destination boundary. Focus, list URL, buffer, exact scrollTop and relative
placement within 1px were preserved. No live service or canonical campaign ran.
Actual canonical probe/boundary bodies were reused without executing the live spec.
The initial large cost was script, not the wrapper's layout/paint; a separate CPU
sample implicated DEV JSX/Strict Mode.

| Traced first-return aggregate, four observations per condition | Historical callback | Repaired callback |
| --- | --- | --- |
| Key-to-stable median | 85.6ms | 46.95ms |
| Median per-observation frame-p95/max | 62.25ms | 17.2ms |
| LoAF blocking median | 7.1ms | 0ms |
| Script excluding nested layout/paint range | 50.95-56.54ms | 13.06-15.85ms |
| Layout / paint ranges | 5.69-7.06 / 4.61-4.97ms | 6.03-7.70 / 4.22-4.86ms |

A tracing-disabled pair also improved (key-to-stable 91.5 to 38.8ms, frame-p95/max
57.8 to 16.7ms, LoAF 8.6 to zero). A warmed counter pair showed **no clear latency
gain**, about 36 versus 40ms, despite removing renders. First-use DEV amplification
must not become a universal warmed or production-build claim. Small frame samples
are not population tails. Do not chase ordinary remaining layout/paint or rewrite
restoration on these results. Raw traces/profiles were not persisted; accepted
observations and exclusions live under `p13bReturnAttribution20261025`.

### Product Validation

Current full gates passed: **3,260 units across 92 files at default parallelism**,
and **506/506 local E2E with three workers and retries disabled**. Performance
TypeScript and focused research controls passed. The media-fallback fixture now
publishes changed mock inputs explicitly; the Justified maintenance fixture waits
for extension readiness before manual filling. Behavioral assertions and timeouts
remain unchanged. These gates validate workflows, not hosted performance or the
remaining delivery/paint questions. Implementation history belongs in the
[changelog](changelog.md), not this guide.

<a id="post-lookahead-campaign"></a>
<a id="post-cleanup-campaign"></a>
## Earlier Repairs: Evidence Worth Reusing

| Repair | Evidence | Limit |
| --- | --- | --- |
| Maintenance-safe velocity / B1 validity | Spurious D9 forward starts fell 1 to zero; historical P17 backward reads/prepends two to one. | Removing false work did not remove Justified walls. |
| F1 admission/render isolation | Justified ordinary frame-p95 returned about 24-25 to 17ms. | Not delivery priority or backward runway. |
| Two lower eager rows | Same historical D8: pending area 13.66 to 0.14% Grid, 36.63 to 2.95% Justified; matched entry controls support the mechanism. | Sustained, reversal/frame/refresh costs remain; no upper-row comparison. |
| KUP-042 | Fixed-row membership/compensation protected by all-visible-box regressions. | Not Justified packing or universal speedup; intervening changes/transport confound the office-network campaign. |
| Table row identity | Revision-3 replacements fell 2624 to 22.5 forward and 2168 to 108 backward; late pending slots improved. | Stable elements did not resolve the later request-lifetime defect or all delivery/frame work. |
| Grid/Justified cleanup | Active cancellation and fewer outstanding requests; native-photo controls support conditional stopped readiness/progress benefit. | Same-contract campaigns were mixed, including worse Grid frames and adverse Justified geometry. No upstream-savings claim. |

<a id="delivery-options-decision"></a>
## F2: Implemented Cleanup and Remaining Delivery Work

Cleanup is product baseline in Grid, Justified and Table. Remove `src` only from
a captured detached, incomplete image; preserve connected Strict Mode replay,
completed images, shared native consumers and re-admission. Production behavior
is covered by [ordinary lifecycle tests](../../e2e/local/thumbnail-lifecycle.spec.ts);
pressure controls belong in research, not habitual E2E.

`f2NativeComparisonTimingV220261022` is the usable matched native-photo result.
In two treatment orders under 80ms/4Mibit pressure, Justified cleanup reduced
stopped readiness about 5.0-5.6s to 2.2-2.4s and blocking 2.5-3.0s to 1.1-1.3s.
Frame-p95 worsened about 67 to 75ms, moving pending slots stayed above 90% and
both policies retained adverse geometry. Warm unthrottled arms established no
benefit; the first cold-proxy arm is confounded. This is not Grid, hosted-CDN,
native-trackpad or long-churn proof.

Retain the small lifetime fix, not a claim that F2 is solved. Do not repeat warm
arms looking for a win or expand cancellation without a named ownership problem.
A passed-by image may be useful again; strict centre-out completion or deliberate
withholding of ready images is not required.

### Table Ownership Qualification (25 October 2026)

**DONE: the actual Table renderer had a missing request-release defect, now
repaired.** A held request remained unfinished/unaborted after its row detached;
source-release coverage failed first. Production TableThumbnail now uses passive
detached/incomplete cleanup, following URL changes because an initially absent
URL can mount the image later. Native lazy loading, overscan, dimensions, URL
selection and error behavior are unchanged. Controls protect connected rerenders,
Strict Mode, shared consumers, completed images and re-entry.

Production pressure controls compare cleanup with a narrow cleanup-disabled
counterfactual in both treatment orders. Local mock metadata, 400 residents,
373-result runway, 1720x960/DPR2, exactly 6400px at requested 100 results/s,
80ms/4Mibit pressure and 24,698-byte padded SVGs over loopback HTTP1 are held
constant. Setup is drained/unthrottled; stopped paths match and data stays unchanged.

| Forward outcome | No cleanup | Production cleanup |
| --- | --- | --- |
| Detached-only pending at stop | 120 / 120 | 0 / 0 |
| All pending at stop / after recovery | 163/79 and 163/80 | 44/0 and 43/0 |
| Decoded endpoint | 0/29 at four-second cap in both arms | 29/29 at 2099.4 / 2106.1ms |
| Frame-p95 / worst interval | 18.6/25.1 and 17.3/25.9ms | 17.2/25.2 and 17.5/25.6ms |

Every pending request was associated with an element/path at the stop sample.
All arms had 27 usable current pending slots and 16-17 mounted-offscreen requests;
the readiness observer counts 29 images including the sticky-header band. Neither
population is the canonical D8 28-image aggregate, and this is not an atomic
request-conservation timeline. Earlier equivalent fixture-only controls agree;
their adverse 91.4ms baseline interval remains in the evidence record.

A matched 6400px forward / 1600px backward pair quantifies a real reversal cost:

| Reversal outcome | No cleanup | Production cleanup |
| --- | --- | --- |
| Current decoded endpoint | 9/29 at cap | 29/29 at 1983.2ms |
| Request starts / repeated starts | 200 / 0 | 239 / 39 |
| Detached-only pending at stop | 94 | 0 |
| Pending after recovery | 69 | 2 |
| Cancellations through recovery | 0 | 185 |
| Frame-p95 / worst interval | 17.1 / 25.3ms | 17.1 / 25.0ms |

The 39 re-requests were not free, but did not erase this pair's current-image
benefit. Two pending requests after current decode are not failed current images.
Moving exposure stayed about 92%; sampled resize remained 28px, displacement/walls
zero. Candidate failures were cancellations, with no HTTP errors or failed visible
media. This does not establish universal reversal/frame non-regression, paint,
live/canonical recovery or upstream savings. Completed bytes use different recovery
end times and omit partial cancelled transfers; they are not matched-budget savings.

No independent lazy-admission defect was found. A scheduler, mounted-source sweep
or buffer change does not follow from this lifetime repair. Full gates and lifecycle
coverage passed; a representative post-fix delivery comparison is separate work.

### Approaches Not to Adopt by Default

- Dynamic in-flight `fetchPriority` demotion produced **0 demotions for 332 pending
  High requests** while natural promotions verified collection. Initial hints
  working does not establish mutation uptake; revisit only a changed mechanism/runtime.
- An imperative mounted-image `src` sweep left the same node blank on reversal:
  unchanged React props did not restore it. Admission needs declarative re-entry ownership.
- Fetch/blob brokers add full-body latency, CORS, deduplication and object-URL
  lifetimes. Native cross-origin images can work where opaque fetch blobs cannot.
  A queue library/worker does not supply current-demand ownership.
- A blanket 150-image backward floor produced three reads/600 hits after a short
  stop without avoiding a stall. Do not use it as fallback.
- Larger buffers, global key rewrites, guessed visible ratios, async hints and
  universal horizon increases have no established general benefit. Quality,
  format, sizing and layout-engine changes are separate decisions.

Actual proxy controls show whole-body buffering, no client-close abort and no
in-flight miss coalescing. Browser cancellation can free local capacity while the
proxy continues warming cache; immediate reacquisition can duplicate a miss.
Streaming/coalescing/abort propagation and HTTP2/separate origins remain separate,
operator-authorized trade-offs, not B2 dependencies or retroactive savings proof.
[KUP-041](bug-backlog.md#kup-041) owns API-to-ES read cancellation, not native-image
lifetime. The [TEST plan](kupua-TEST-deployment-plan.md) owns canonical URLs/expiry;
the [imgproxy assessment](01%20Research/imgproxy-research.md) concerns future preview/zoom
delivery and does not block today's thumbnails.

## Dashboard Evidence: Completed Corrections

**DONE:** checkpoint source metadata now requires complete member consensus,
baseline long-run coverage follows membership, and recovery shows adverse flags,
visible/decoded counts and global request carry-in/pending/completion/cancellation
evidence. Partial latencies remain withheld. Image summaries include frame counts,
p95, worst frame, LoAF and saved boundaries. Layout deltas subtract matched-layout
medians; D11 deltas are within-repetition pairs. New JA2 labels say loaded/stable;
historical labels remain intact. Offline/local-browser regressions cover these rules.

These repairs expose existing evidence without new campaigns. They do not associate
global requests with current images or recover unavailable joint censor reasons.
Do not subtract separate medians/aggregates into synthetic timelines. Campaign
**after rendering fixes** retains original metrics, provenance, IDs and membership;
its label is not evidence of a controlled causal experiment.

## Evidence and Reuse Map

Preserve observations, exclusions and provenance in the existing
[research JSON](scroll-horizons-thumb-lookahead-results.json). Do not rewrite old
`nextDecision` fields as current authority or create a duplicate results ledger.

| Evidence | Reuse for |
| --- | --- |
| `b2LocalComparison20261020`, including `justifiedAfterSetupRepair` | 400ms candidate, short-stop/slow/fast costs, both orders, reversal/capacity. |
| `b2LiveBoundary20261021`, `b2TierReproduction20261021` | Metadata releases walls before thumbnail readiness; indexed missing-data exposure with/without map; resident true ends. Recipes are viewport-specific. |
| `b2Publication20261021`, `b2StabilityFilmstrip20261021` | DOM replacement identity, applied-input/anchor controls, calibrated geometry and paint attribution. Original Grid realignment predates KUP-042. |
| `b2GeometryLifetime20261021` | Unsafe original-cohort release, dimension invalidation, forward negative controls; provisional slots withdrawn. |
| `b2UninterruptedResearch20261021` | 400/1,000ms and initial/ready-runway comparisons, true-ratio feasibility and unresolved lifecycle. |
| Initial lookahead rows, `frameAttribution`, `decodingHint`, `scrollLookaheadMatched`, `refreshLookaheadMatched` | Lower-band choice, arrival work, no demonstrated async-hint benefit, sustained/reversal/refresh costs. |
| `f2RequestOwnership20261022`, `f2PriorityUptake20261022` | Late once-useful demand, metadata association and failed dynamic demotion; not pure queue/eager-band attribution. |
| `f2DeliveryOptions20261022` | Native lifetime/re-entry/shared consumers, HTTP1 capacity, fetch/blob and actual proxy controls. |
| `f2CleanupCampaign20261022`, `f2NativeComparisonTimingV220261022` | Mixed canonical results and bounded native-photo cleanup benefit/cost. |
| `f2TableOwnership20261025`, especially `productionFollowUp` | Reproduced Table defect, production pressure counterfactual, reversal re-request cost and limits. Initial recommendation fields are historical. |
| `p13bReturnAttribution20261025` | Retained callback mechanism, first-use/warmed/probe/tracing distinctions, accepted measurements and exclusions. |
| [Existing research spec](../../e2e-perf/research/density-app-research.spec.ts) | Render/reference/date-work controls and their failure-first production regressions; reuse fixtures/probes rather than creating another harness. |
| [Density](../../e2e-perf/results/density-log.json), [rendering](../../e2e-perf/results/audit-log.json), [perceived](../../e2e-perf/results/perceived-log.json) histories | Recorded live baselines and navigation/traversal guardrails; check scenario contracts and campaign membership before comparing. |

Important exclusions: early embedded recovery clocks crossed controller round trips;
early publication screenshots missed pending decode; repeated-image delay did not
exercise its hold; the async-hint collector lacked fresh-document lifetime accounting.
The six-second native baseline had real walls but never reached its endpoint, so it
is not a matched recovery comparison. Initial P13b no-probe frame summaries omitted
the keydown-straddling interval; their marked trace clocks remain valid, but those
frame summaries are excluded. Failed/in-flight-changing setups supply no performance
result. Never pool them with corrected captures or rehabilitate them via later success.

Methods live in [local controls](../../e2e-perf/research/controls.md), detector checks
in [validation](../../e2e-perf/validation/README.md), and metric contracts in the
[measurement reference](../../e2e-perf/measurement-reference.md). Do not copy setup
transcripts, test-run chronology or commands here.

The [pinned Immich study](https://github.com/immich-app/immich/commit/53618ff7496ee313d1cff7b3bcdf19c82b765cdf)
found a month-index/placeholder model and same-origin URL-keyed worker, not a
drop-in arbitrary-sort cursor-window/CDN scheduler. Reuse current-demand protection,
deduplication and late-write rejection principles, not that architecture. The
installed WASM package provides geometry, not delivery policy.

## Contracts and Validation

| Owner | Preserve |
| --- | --- |
| [Data window](../../src/hooks/useDataWindow.ts), [tuning](../../src/constants/tuning.ts) | Directional demand, first-row validity, maintenance-safe velocity and scope resets; no silent indexed/forward change from a backward mirror. |
| [Scroll effects](../../src/hooks/useScrollEffects.ts), [search store](../../src/stores/search-store.ts) | One placement owner, generation guards, legitimate programmatic demand, 200-image pages, 1,000-image retention and one extension per direction. Metadata never waits for images. |
| [ImageGrid](../../src/components/ImageGrid.tsx), [Justified layout](../../src/lib/windowed-justified-layout.ts) | Eager/overscan policy, true ratios, authoritative metadata/permissions, bounded geometry and consistent render/navigation coordinates. |
| [Image URLs](../../src/lib/image-urls.ts), [traversal](../../src/hooks/useImageTraversal.ts), [prefetch](../../src/lib/image-prefetch.ts) | Shared-current-consumer protection, source validation and independent full-image traversal semantics; thumbnails do not certify detail delivery. |

<a id="fixed-grid-continuity"></a>
KUP-042's [fixed-row policy](00%20Architecture%20and%20philosophy/03-scroll-architecture.md#fixed-row-window-policy)
remains the contract; [its backlog entry](bug-backlog.md#kup-042) retains the original
reproduction. Image resizing/arrival animation alone is not a fixed-row regression.
Justified dimension snapshots do not define presentation lifetime: width,
visibility, navigation and fragment ownership need explicit contracts if selected.

Every next investigation must name the unanswered question and why existing
evidence cannot answer it. Match **achieved demand and runway**, not copied px/s;
viewport, packing, DPR and media remain independent. Keep setup cost explicit.
Loaded, decoded and painted are distinct. Sources/centre anchors and same-element
counters cannot certify all-visible stability or detect every wholesale replacement.
Account for applied input and arrival animation instead of widening tolerances.

Revision-4 capture already supplies atomic stop clocks, request windows, exposure,
wall episodes, geometry, censoring and costs. Use it before adding probes. Before-send
time is not pure queue time; unrelated maxima are not additive. Perceived store-ready
or older loaded-only endpoints are not action-owned decode. Raw per-run histories
are not universally available; do not invent distributions or joint censor reasons.

Separate photo/cache/transport attribution from synthetic controls. Selected changes
must preserve current-image success, short stops, reversal, capacity, resize/density,
seek/history and non-wheel demand. Required full product gates, independent review
and explicit adverse-result disposition cannot be replaced by measurement controls,
retries, timeout inflation or weakened assertions.

Campaigns/dry runs remain operator-run; live work needs fresh scoped permission.
Do not alter shared servers, proxy behavior or non-local data. Persist only sanitized
evidence, never identities, signed URLs or credentials. Reuse existing controls and
keep runtime practical; a new experiment must answer a new decision, not re-prove
that the core browsing workflow exists.
