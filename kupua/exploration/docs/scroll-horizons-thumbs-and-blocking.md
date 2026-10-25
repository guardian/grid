# Scroll continuity: decisions and next work

Updated 23 October 2026. This guide owns the way forward for **B2: metadata supply
and buffer-edge blocking**, and remaining **F2: current-image delivery** work.
It retains findings that can change a decision, not the sequence of investigations.
Numeric records remain in the [research evidence](scroll-horizons-thumb-lookahead-results.json)
and [campaign history](../../e2e-perf/results/density-log.json). Earlier decision text
inside those records describes its historical checkpoint, not today's task list.

## Recommendation

**Resume B2 with the existing bounded 400ms backward-prediction candidate, on top
of committed thumbnail cleanup.** There is a leading candidate; there is not yet a
demonstrated all-layout, all-goal winner. Do not restart a broad candidate search,
ship a larger horizon by assumption, or wait for every remaining F2 question.

The next useful step is a focused qualification of that candidate with today's
product baseline. Earlier comparisons establish a blocking benefit and expose its
costs; they predate cleanup and the fixed-grid repair. Determine whether those
costs remain, decide separately for Grid and Justified, and implement only the
supported scope. Initial runway and late-arrival geometry are separate decisions.

Live evidence already shows metadata publication releasing walls while thumbnails
remain pending. F2 can reduce delivery contention; it cannot supply missing records
or by itself stabilize Justified packing. Its remaining questions do not erase B2.

The three goals remain independent:

- **Useful progress:** moving through results with ready current images, including after stopping.
- **Smoothness:** consistent frames, not smooth movement through blank slots or a stalled viewport.
- **Stability:** intended identity/position and correct ratios, without unsolicited movement or flashes.

No aggregate score or reduction in request counts can trade away one of these goals.

<a id="current-decision"></a>
## Current State

| Area | Retain | Still open |
| --- | --- | --- |
| B1 and velocity ownership | Stale viewport reports do not become backward demand; maintenance does not create predictive velocity. Legitimate programmatic demand remains valid. | Candidate-specific navigation/maintenance interaction, not a new wheel-only admission rule. |
| F1 and thumbnail admission | Thumbnail-only loading updates; visible rows plus two lower rows eager, upper/rest lazy, five-row overscan. | Sustained delivery and unseen backward entry; the lower band is not a complete priority policy. |
| B2 | Product backward threshold is still 50. Forward prediction uses a 400ms horizon, capped at one page. | The mirrored backward candidate is researched but not implemented. |
| Fixed Grid | KUP-042 preserves global row membership and net-origin compensation, with complete pages and exact-capacity eviction. | Media sizing/animation and frame cost are distinct from fixed-row correctness. |
| Table identity | Image-based row keys preserve retained elements while the visible slice moves. | Constrained delivery backlog and rendering cost remain. |
| F2 cleanup | Commit `2fb9bf3ee`: detached, incomplete Grid/Justified thumbnails release their native source. Connected/completed elements and other consumers remain protected. | Conditional benefit, not a finished visible-first policy or proof of backend savings. |
| Justified geometry | Truthful dimensions and anchor compensation remain authoritative. | Partially known boundary blocks can repack visible images; a stable centre anchor is insufficient. |

<a id="active-plan"></a>
<a id="potential-next-steps"></a>
<a id="next-discriminating-work"></a>
## B2: The Next Decision

### Leading candidate

Reuse `forwardExtendThreshold(-velocityEma)` for the existing **seek-mode backward
admission** decision: `min(200, 50 + max(0, -velocityEma) * 400ms)`. Velocity is in
results per millisecond. Preserve first-row viewport validity, velocity resets,
base demand, cooldowns, per-direction concurrency and compensation. Leave the
forward horizon, indexed path, page size and retention cap unchanged.

This is the concrete candidate in `b2LocalComparison20261020`, not the later
1,000ms experiment. It remains a recommendation to qualify, not authorization to
implement or an assertion that the JSON approved shipping it.

### What is already established

The corrected matched study contains ten pairs per layout, with both treatment
orders, exact starting windows/geometry, synthetic media and held metadata reads.

| Case | Result | Consequence |
| --- | --- | --- |
| Grid, 900ms reads, sustained/reversal/capacity cases | About 259–340ms blocking became zero; one extra page and greater travel. Some frame/exposure results worsened. | Strong support for the smaller predictor; fewer walls alone is not acceptance. |
| Justified, same slow-read cases | Blocking fell by 623–658ms but remained 337–381ms; one extra page and more travel. | A meaningful reduction, not uninterrupted browsing. |
| Fast 350ms delivery | Neither policy blocked in the matched cases. | Useful negative control; no benefit should be invented where supply already keeps up. |
| Exact 600px short stop | Zero versus one read, without a candidate post-stop refill chain. Justified candidate exposure was 46–49% versus zero; stopped readiness about 199–205ms versus 40–52ms. | One extra page is the accepted bounded speculation envelope, but the visible cost needs explanation or improvement. |
| Capacity/reversal | Retention stayed bounded; held-refill/current-policy anchor controls also exist. | Reuse this evidence, but do not claim it certifies every candidate navigation or all-visible-box transition. |

Grid and corrected Justified records use different setup revisions. The rejected
Justified setup allowed candidate prefetch during restoration, changing 201 records
to 401 before measurement. Accepted pairs keep baseline policy through matched
setup and activate the candidate afterward. Do not pool the rejected setup or
infer that legitimate programmatic demand should be prohibited.

### Focused qualification, not a new matrix

**Question:** with current cleanup and geometry fixes held constant, does the
400ms backward candidate retain its blocking benefit without unacceptable current
readiness, frame, placement or resource costs?

1. Reuse the [existing B2 comparisons](../../e2e-perf/research/density-app-research.spec.ts)
   for a short stop, slow sustained backward motion and capacity/reversal in Grid
   and Justified. Retain a fast-delivery negative control. Match initial runway,
   ordered content, visible geometry, input and media conditions; reverse order.
   Adapt obsolete pre-KUP-042 setup assumptions, never weaken geometry assertions.
2. Keep cleanup **on in both arms**. Compare current backward threshold 50 with the
   candidate. The unanswered question is B2's incremental value on the current app,
   not whether cleanup can ever help. Reuse prior F2-only evidence; a four-arm
   factorial is justified only if a specific interaction remains ambiguous.
3. Record achieved work and walls alongside moving readiness, stable stopped
   data/decode, retained boxes/sources, frames, accepted reads and pending work.
   Check short stops, reversal and valid non-wheel demand without resurrecting a
   maintenance-driven refill chain. Local synthetic delay is not a native-photo
   delivery model; qualify any delivery-dependent claim in a separately authorized,
   bounded representative-photo comparison before relying on it.
4. Make a **per-layout disposition**. A clear Grid result need not wait for a
   Justified packing redesign. If Justified still trades fewer walls for worse
   pictures/frames, retain that result and select its next narrow discriminator.
   Do not quietly accept the penalty or broaden the policy to make a metric pass.

Completion is a supported implement/retain/reject decision for the smaller
candidate, with remaining exceptions named. It is not a demand for universal
no-blocking guarantees under arbitrarily delayed delivery. Product changes then
need failing-first regressions, the full required unit/E2E gates, independent
review and an operator-run compatible campaign. This document performs none of them.

### Initial runway is a different problem

`b2UninterruptedResearch20261021` separates starting availability from steady lead
time. With a 201-image Justified window and 83-result runway, both 400ms and 1,000ms
horizons still blocked about 339–341ms under 900ms delivery. A larger horizon cannot
make the first response arrive before already-insufficient runway is consumed.

The ready-runway controls loaded an extra page **before timing in both arms**.
They do not establish a free startup prefetch or an acceptable navigation wait.
If first-entry blocking remains important after the smaller candidate, decide the
initial-page admission contract explicitly: when to request, how it coexists with
seek/history/restoration, whether it delays exposure, and the short-stop cost.
Do not wait for thumbnail completion to publish metadata or silently withhold ready results.

The 1,000ms result is a **conditional Justified alternative**, not the default next
patch. With ready runway it kept sampled non-rigid geometry below 0.016px where
400ms backward controls moved up to 1,466px and censored their endpoints. However,
backward frame-p95 worsened roughly 25.5–26.2 → 32.8–33.3ms and exposure increased.
Grid had zero walls under both horizons in those aligned controls, so there is no
demonstrated reason to widen it. Neither larger lead time nor a prepared page
guarantees stable geometry when real delivery arrives late.

## Research Questions and Fixes to Ponder

These are ranked by their relevance to the next decision, not blanket prerequisites
or approved implementations. Existing evidence should narrow each task before any
new experiment is commissioned.

| Question | Evidence and smallest useful next step | Candidate only if supported |
| --- | --- | --- |
| Why do constrained Grid/Justified landing cohorts change? | Revision 4 censors 3/4 Grid and 2/4 Justified landings despite later decoded media. Associate the existing stopped-cohort and retained-box evidence with publication, viewport position and edge membership; distinguish harmless boundary membership from actual position loss. | Repair the responsible publication/placement owner or measurement boundary. Do not simply relax the cohort check or call it a timeout. This can be investigated alongside B2, not before all B2 work. |
| What causes Justified's visible boundary repacking? | Calibrated current-policy controls show a block changing from 4 known dimensions to 48; a previously correct image moves/resizes while its source and centre anchor remain correct. Earlier metadata can move this work offscreen but cannot guarantee it. | Conditional true-ratio row composition if earlier delivery is insufficient. Preserve known boxes and pack new images at real ratios; see the lifecycle limits below. |
| Does current cleanup remove B2's earlier short-stop/readiness penalty? | The old 400ms study used synthetic media before cleanup. The bounded post-cleanup comparison above answers the missing interaction. | Keep the smaller predictor if all goals support it; otherwise isolate admission/publication/media work instead of widening horizons. |
| Why does Table fail constrained decode recovery? | Latest D8 keeps its cohort, reports 0/28 decoded at four seconds and about 153 requests still pending. Stable row keys fixed churn, not delivery. | Study Table's own request ownership and admission before proposing analogous unmount cleanup. Do not transplant GridThumbnail behavior without shared-consumer/re-admission evidence. |
| What dominates Grid/Table frame cost? | Both breach the frame reference even at gentle demand. Earlier profiling points to metadata/date-label work; predecoded-media controls separately implicated arrival/decode/first display. Neither certifies the cause of today's whole frame cost. | Narrow render/formatting or arrival-work correction after attribution; preserve F1's thumbnail-only update boundary. Do not bundle it into B2. |
| Would one eager row above help unseen backward entry? | The lower-band experiments never tested it. A cached reversal is not unseen backward browsing after eviction or a new seek. | Compare two-below against two-below/one-above at fixed metadata policy, including frame/refresh cost. Not a bigger-buffer or scheduler mandate. |
| Is mounted background demand still preventing useful image delivery? | Unmount cleanup removes abandoned consumers, but constrained moving readiness remains poor. Passed-by requests were mostly once-useful demand, not inherently waste. | Bounded visible-first native admission only after current-demand attribution; delaying src changes effective admission even if loading stays eager. |
| Does local proxy behavior need improvement? | Actual-handler controls show complete-body buffering, no client-close abort and no in-flight miss coalescing. Cancellation can free browser capacity while upstream work continues; immediate reacquisition can duplicate a miss. | Coalescing, streaming or abort propagation are separate trade-offs. Preserve intentional cache warming unless explicitly changed; measure progressive-paint or resource benefit rather than assuming it. |
| What changes on hosted media? | HTTP2/CDN delivery can change connection contention, but not eliminate bandwidth, render or ownership costs. | Recheck the remaining bottleneck under the deployment's actual path, not a copy of laptop HTTP1 limits. Keep signed-URL expiry and shared consumers explicit. |

### Justified geometry: retain the feasible alternative, not the rejected one

The true-ratio fragment control in `b2UninterruptedResearch20261021` preserved
previously known rows and independently packed incoming images at their actual
ratios. Four mixed-ratio unit cases and a stopped backward-publication compositor
control support feasibility: 32 retained targets stayed stable, the previously
moving point shifted about 0.37px vertically, and all 1,000 loaded boxes respected
their ratios. This is **not** a general fragment lifecycle or a blocking fix.

Before selecting it, resolve repeated/moving publications, both boundaries, partial
eviction, coalescing/release, true ends, bounded state, resize/density/seek/history,
and consistency of row lookup, keyboard neighbours, hit targets and scroll extent.
Incomplete rows can leave horizontal space and add height. The old DOM observer
missed common-mode movement; use the newer applied-input observer and calibrated
pixel controls where needed, without claiming every-frame paint coverage.

**Do not revive provisional square-slot retention.** It stabilizes old boxes by
giving new visible images unsuitable shapes. Original-cohort departure, timers,
idle or media-ready events do not make release safe: other images in the same
block may still be visible. The useful lifetime research establishes that
constraint; it is not an active implementation recipe.

<a id="revision-4-campaign-assessment"></a>
<a id="active-pressure-campaign"></a>
## Campaign Evidence That Changes the Plan

The current baseline is **scroll load and recovery v4**, timestamp
`2026-10-22T23:01:03.116Z`, HEAD `2fb9bf3ee` with a dirty tree. Four repetitions
completed: 36 workload executions, 84 records. Local media-api, seek mode,
Chromium 151, 1720x960/DPR2. Capture/coverage checks passed; paint is unmeasured.
Report-start to history was 13m06s, versus 14m18s for the preceding cleanup campaign,
excluding preflight/final serialization. Measurement improvements need not add minutes.

| Current observation | Meaning for next work |
| --- | --- |
| At 200 requested results/s, backward progress is 149/134/148 results/s and accumulated walls 699/915/715ms for Grid/Justified/Table. | B2 is still material after cleanup. These are phase medians, not one universal threshold or episode duration. |
| At constrained 100 results/s, median pending slots are 88/84/92%, with zero metadata wall in all repetitions. At 200, all reach 100% pending and walls appear. | Delivery and metadata continuity are separate. Earlier metadata cannot alone cure the first phase's unready pictures. |
| Ordinary forward decode medians are 365/810/341ms; Table's worst is 2.20s. D2 lands in 27/21/53ms after its short reversal. | Recent-content revisiting is not unseen-entry performance. Do not add data and media clocks, or ignore Table's adverse repetition. |
| Constrained stable decoded endpoints: Grid 1/4, Justified 2/4, Table 0/4. | Grid/Justified are cohort-change censoring, not four-second decode timeouts. Table keeps its cohort but does not decode within the cap. No survivor-only latency median. |
| Grid/Table breach the 33.4ms frame reference at every load step/repetition; Justified does not, but has adverse backward/reversal geometry. | No overall density winner. Smooth movement, image readiness and sampled stability must remain separate. |
| Ordinary Justified forward at 100 results/s has about 0.2% median pending slots but 64% in its worst repetition. | Medians and comfortable initial runway do not establish reliable sustained delivery. |

Initial buffers are 201 images, with roughly 83–92 results of runway. The gentle
step largely consumes that prepared window; it is not a sustained-supply guarantee.
Four-sample p95 is the worst repetition, not a population tail. Count-based pending
slots must not be confused with historical whole-viewport pending area, especially
for Table's narrow thumbnail column.

### Bounded Grid/Table Frame Attribution (25 October 2026)

Question: does the ordinary-rate frame gap require media arrival, metadata
publication or campaign observers? Earlier warm-media attribution covered
Justified only; historical campaign comparisons did not isolate these causes.
Hypothesis: costly Grid/Table frames persist with resident data and predecoded
media. Control: reuse `scrollAtSpeed` and journey calibration, dispose the journey
observer before motion, retain only rAF timing and a store publication counter.
Each forward pass was bounded to 800ms at calibrated 100 results/s; 12 passes
total (9.6s planned motion), including one excluded pass. No campaign was run.

Shared foreground-visible Vite DEV app, verified ApiDataSource / deployed TEST /
canonical media, seek tier, 1720x960/DPR2. Served raw sources for ImageGrid,
ImageTable, JustifiedGrid, useDataWindow and useScrollEffects matched disk SHA256.
One 200-image cohort was predecoded and retained outside motion: 200/200 succeeded
in 618ms under a 10s cap. Caches were uncontrolled. The window grew from 200 to
400 during the excluded pass; valid cross-density and formatter comparisons used
the same 400-result array. Workloads differ by density: Grid/Table/Justified
initial visible slots 18/27/39, runway 382/373/361 results and calibrated speed
5050/3200/2622.5px/s. This is not equal pixel or DOM work, or hosted-build evidence.

| Pass | rAF intervals | Frame-p95 ms | Progressed results | Qualification |
| --- | --- | --- | --- | --- |
| Grid ordinary, minimal | 34 | 58.4 | 84 | 200 resident; 6/24 endpoint images loaded |
| Grid warm, minimal 1 | 31 | 58.3 | 84 | 200 resident; 24/24 endpoint images loaded |
| Grid warm, minimal 2 | 24 | 58.4 | 78 | EXCLUDED: one publication, window grew to 400 |
| Table warm, minimal | 18 | 133.1 | 76 | 27/27 endpoint images loaded |
| Justified warm, minimal | 78 | 25.0 | 72 | 39/39 endpoint images loaded |
| Grid warm, minimal | 35 | 58.4 | 78 | 24/24 endpoint images loaded |
| Grid warm, CPU-profiled | 31 | 50.9 | 84 | Profile overhead; not a benchmark pair |
| Table warm, CPU-profiled | 16 | 141.7 | 77 | Profile overhead; not a benchmark pair |
| Grid native before | 41 | 50.0 | 84 | Formatter control, 799ms motion |
| Grid formatter reuse 1 | 84 | 16.7 | 84 | 794ms; 14,208 intercepted calls including setup |
| Grid formatter reuse 2 | 94 | 9.3 | 84 | 790ms; 14,736 intercepted calls including setup |
| Grid native after | 41 | 41.7 | 78 | 756ms; retain shorter achieved motion |

All valid passes stayed visible and had zero result publications/read starts during
motion. Script duration was 745ms Grid / 756ms Table in approximately 1s profiled
windows **including setup**, versus layout plus style 23/44ms. Grid self-samples
included 383ms in getCellDateLine and 56ms in buildDateTooltip; Table included 89ms
in a field accessor plus substantial React DEV work. No paint/raster attribution
or production-build extrapolation follows from these CPU samples.

For Grid only, a temporary exact-option Date locale-method wrapper reused two
Intl.DateTimeFormat instances. Forty output comparisons against native methods
matched. Native/reuse/reuse/native ordering retained identical initial geometry,
data and media, with about 101 results/s calibrated applied motion; restored native
frames worsened again. This supports **repeated Grid locale formatting as a causal
app CPU defect in this DEV reproduction**, not the entire historical frame gap.
Table uses a different date formatter: no shared-date-cause claim is retained.
Campaign observers and result-buffer publication are not necessary for the valid
warm reproductions. Prewarming did not remove the gap; residual decode/first-display,
enrichment publication, paint and additional live observer costs remain unquantified.

Smallest justified next step: separately approve a targeted Grid formatter-reuse
fix with output-equivalence tests and full required product gates. Do not redesign
the renderer or enlarge buffers. Table's rendering root cause and historical
stopped-media censoring remain independent unresolved questions. Short sparse
passes are not population tails; predecoded references/loaded DOM do not establish
every-frame painted output. All wrappers, retained images, observers and diagnostic
globals were released; the owned CDP profiler/session and viewport override were
removed. No raw profiles, identities, URLs, credentials or canonical histories saved.

### Grid Fix Remeasurement and Table Columns (25 October 2026)

The approved Grid change extracts `formatGridDate` and reuses two Intl formatters.
The regression first failed on 20 native locale-date calls, then passed with reuse;
output checks include missing, empty, invalid, offset and DST-boundary dates.
The implemented source, not a prototype wrapper, was reloaded and verified against
disk hashes alongside unchanged Table/field-registry sources. TEST/canonical DEV,
foreground, 1720x960/DPR2, uncontrolled caches and the same 800ms driver contract
were retained. One read-only forward extension prepared 400 resident results at
offset zero before timing; 200 retained thumbnails decoded in 101ms under a 10s cap.

Grid's two implemented-reuse passes recorded frame-p95 **16.8/9.4ms**, no intervals
over 33.4ms, 84 frontier results each, and approximately 100.2 calibrated applied
results/s. Both had 18 initial/24 final loaded slots, 382 results of initial runway,
1706x888 containers, unchanged data and no read starts/publications. These agree
with the earlier temporary reuse control; earlier native 50.0/41.7ms observations
are contextual evidence, not a newly randomized before/after campaign.

Table question: are enabled metadata cells necessary for the large ordinary-rate
frame cost, and are date/number formatters its sole explanation? Earlier profiles
could not separate enabled-column cost from row machinery. The falsifiable control
hid columns using the existing store, verified actual rendered header counts and
restored preferences in `finally`. Short passes ran in both treatment orders,
with original columns bracketing thumbnail-only, selection-only and dates-only;
a second reversed pair separated numeric-only from original-minus-numeric.
All Table passes used the same 400-result array, 1706x876 container, 27 initial
visible rows, 373-result runway, approximately 100 applied results/s and zero
result publications/read starts. Hiding media intentionally removes image work;
thumbnail-only retains it as the independent warm-media control.

| Table configuration | Columns including selection | Two frame-p95 observations (ms) |
| --- | --- | --- |
| Original saved configuration | 23 | 50.0, 58.3 |
| Thumbnail only | 2 | 16.7, 25.0 |
| Selection only | 1 | 16.7, 16.7 |
| Taken/uploaded dates only | 3 | 25.0, 25.0 |
| Dimensions/width/height only | 4 | 17.5, 25.0 |
| Original minus dimensions/width/height | 20 | 41.6, 66.7 |

Retain the original configuration's 117ms worst interval; do not average it away.
These results support enabled-cell work as the major differentiator in this warm
reproduction, not zero fixed row/virtualizer cost or a universal columns-only cause.
Neither dates nor numeric formatting alone explains the full enabled-column gap.

One additional instrumented original-column pass (frame-p95 50.1ms) wrapped registry
accessors, raw-value functions and renderers, plus native number formatting. Including
setup, it observed 9,944 locale-number calls / 80.6ms; dimensions accessor 3,531 calls /
62.1ms; width/height accessors 1,177 calls each / 7.2/9.6ms. The two date-fns formatters
each ran 2,354 times, totaling 12.2ms. Nested timings overlap and wrapper overhead
precludes adding these into a frame budget. Dimensions has no raw-value override;
tooltip extraction repeats its formatted accessor alongside display/core-row work.
All enabled columns render even outside the horizontal viewport, and changing
virtual windows replaces TanStack row objects, defeating otherwise stable row memo.

Potential Table improvements, not implemented: share a default-locale number
formatter with output-parity coverage; avoid repeated dimension/raw-display
derivation; characterize row/cell reuse before considering a wider rendering change.
Do not replace date-fns or remove useful columns merely because a date-only arm is
cheaper. Grid still computes date-line props across virtual rows; formatter reuse
addresses demonstrated setup cost without adding per-image caches or changing
renderer, buffer or media policy. Table recovery under constrained delivery, paint
and enrichment-publication costs remain unmeasured here.

Fifteen passes were bounded to 800ms each (12s planned motion), including the one
instrumented pass; no campaign or live writes. All native wrappers, field mutations,
retained images, globals, observers and the owned CDP viewport override/session were
removed. Original column configuration was verified restored. No Table product code,
raw profiles, identities, URLs or canonical histories were written.

### Isolated Retained-Row Control (25 October 2026)

The next question was whether new TanStack Row references, rather than changed
image data or geometry, defeat EnrichedTableRow memoization. Existing column-off
and formatting probes could not answer that. The bounded research control reuses
fixture routes, MockDataSource, visibleMediaReadiness, journey/thumbnail probes
and scrollAtSpeed; only the memo/reference counter is new. It runs in the separate
Playwright research browser on runner-owned port3041, with service access blocked.
The shared app/server is untouched. Two embedded interception setups failed before
motion; an outer-realm URL error was identified, but the subsequent fetch/response
failure remained unresolved. No performance conclusion uses those failed setups.

The first isolated setup also failed: its immediate extension remained at 200
results and four media slots were pending at stop. That observation is excluded
from the comparison. The repaired setup uses the existing maintenance cooldown
and predecodes/retains 200 synthetic thumbnails under a 10s cap.

The successful control used synthetic metadata/media, 400 resident results, seek
mode, 1720x960/DPR2, 1706x876 container, 27 initial visible rows and 373-result runway.
Native/semantic/semantic/native/native/semantic passes each applied exactly 2560px
(80 calibrated results) with a 1s cap. All stayed visible, retained the same data,
had zero result publications and zero endpoint pending slots, and matched endpoint
text, tooltips and declared row-placement styles. No pixel/paint witness was taken.

| Mode in execution order | Row-body render calls | Frame-p95 ms | Applied results/s |
| --- | --- | --- | --- |
| Native | 2,376 | 75.0 | 91.36 |
| Semantic | 156 | 17.5 | 99.07 |
| Semantic | 156 | 16.7 | 99.66 |
| Native | 2,840 | 34.3 | 97.13 |
| Native | 3,026 | 33.4 | 96.65 |
| Semantic | 158 | 16.7 | 100.57 |

Every counted changed prop was `row`; images and other row props were unchanged.
Native passes counted 1,111/1,341/1,434 retained-image/new-Row comparisons. Semantic
reuse ignored Row identity only when original image and every other prop matched
(virtual geometry was compared by value), reducing row-body calls by roughly 94%.
Both modes carried the same counters and probes. Thumbnail observer sample maxima
were 0.6-0.9ms, journey maxima 0.4-0.5ms; faster semantic arms actually accumulated
more thumbnail observer time (36-40ms versus 12-14ms). These are diagnostic costs,
not proof that observers have no asynchronous/layout effects.

This confirms an avoidable retained-row render mechanism in the synthetic control.
It is not a measured live improvement, production-build result or exact matched-rate
benchmark: fixed work matched, achieved rates did not, and the adverse 75ms native
observation remains. The next justified product change is a stable cell-content
boundary that avoids propagating unchanged model-object churn, while retaining
bounded virtual-window input. Do not ship the diagnostic comparator: reference
equality of image data alone does not cover column/model changes, enrichment,
selection/focus, sorting or metadata replacement outside this steady-window test.

Grid still computes date-line props in the parent virtual-row loop and repeats some
date work in tooltips. Those are remaining opportunities, not demonstrated post-fix
bottlenecks. Actual fixed Grid frame-p95 16.8/9.4ms versus earlier native 50.0/41.7ms
is descriptive context, not randomized paired observations or a throughput speedup.
The focused research test and perf TypeScript check passed; the owned browser/context
and its routes/counters were disposed. Full product E2E for the Grid fix is still
pending operator release of port 3000; this local control does not replace that gate.

### Implemented Render-Work Follow-Up (25 October 2026)

The operator approved the narrow Table repair and further Grid work after reviewing
the evidence/fix summary. No diagnostic comparator is shipped. TableRowCells now
receives stable image, columns, enrichment and click-handler inputs. Outer rows
also no longer receive native TanStack Row objects. Accessor output is shared by
display and tooltip; one default-locale Intl.NumberFormat serves dimensions/width/
height. Table's date-fns formatting, bounded model input, headers, placeholder paths,
placement, focus/selection, media delivery and native thumbnail lifetime are retained.

Grid computes date presentation inside the existing cell memo boundary. Caption and
tooltip share the three formatted date values; primary sort and collection/usage
maximum-date semantics are retained. Image-only Justified cells skip date work.
The two existing locale formatters remain; no per-image cache or buffer change.

Failing-first checks exposed 3,915 title reads for 122 row identities, then 6,172 cheap
outer-row renders after the first content extraction. The completed repair removes
both sources of churn. A separate Grid check counted 6,552 date calls in one roughly
800ms pass; the numeric regression detected 80 native locale calls over 20 repeated
three-field reads. Output equivalence was retained rather than weakening assertions.
The old diagnostic expectation that semantic memo must outperform native memo was
replaced deliberately: production now must have no Row-reference churn to ignore.

Final combined isolated run reused the same research browser, fixtures and probes:
400 resident results, retained/predecoded 200-image synthetic cohort, 1720x960/DPR2,
fixed 80-result calibrated work per pass, at most 1s each. Three Table native passes
recorded frame-p95 17.7/17.2/16.7ms, 160/160/158 row-body calls and matching title reads.
Native/semantic rows had no differing props or extra semantic-reuse opportunities;
all endpoint text/tooltips/declared placement witnesses matched. Semantic frame-p95
was 17.2/16.8/16.8ms. Retain the 25.1ms worst interval and 2.7ms thumbnail-observer maximum;
one journey-observer maximum was 1.7ms. These remain observer-present synthetic data.

Grid's two final passes made 504 date calls each, measured formatter work 1.2/0.8ms,
frame-p95 16.6/16.6ms, worst intervals 17.0/16.7ms. The corresponding pre-change work
check had 6,552 calls / 11.1ms but already 16.7ms frame-p95: this follow-up saves CPU,
not an established further frame-cadence improvement. Justified made zero date calls,
with 9.2/9.2ms frame-p95 and 17.5ms worst intervals. The last numeric-formatter change
has output/allocation coverage, not a separately isolated frame-speed attribution.

Every final pass completed its fixed distance with unchanged data, no publications
and zero pending endpoint media. Achieved rates were 98.1-100.3 results/s Table and
about 99.3 Grid; Justified 99.3-100.0. No population tails, live/hosted improvement,
paint proof or resolution of constrained Table recovery follows. All owned contexts,
routes and counters were disposed; canonical histories and shared server unchanged.

This exhausts the demonstrated retained-render/locale-setup/duplicate-derivation
opportunities selected here. Remaining Grid formatting is around 1ms over the motion
window; extra caches or a wider renderer refactor have no established payoff from
these controls. Further work needs a new measured bottleneck. Unit coverage includes
same-ID metadata replacement, same-count column swaps, enrichment, modifiers, dates,
list/composite rendering and numeric/missing/invalid output. Full units and perf
TypeScript passed; full product E2E remains pending operator release of port 3000.

### Direct Grid Memo and Live DEV Recheck (25 October 2026)

The direct GridCell counter reuses the isolated date-work control and native shallow
prop comparison. Fixed Grid rendered 168 times for 84 entering image identities in
each pass; 3,144/2,940 retained comparisons all skipped, with no changed retained
props. Justified rendered 150 times for 75 entering identities, skipping all
4,338/4,269 retained comparisons. Date calls remained 504 Grid / zero Justified.
Frame-p95 was 16.6/16.6ms Grid and 15.8/9.3ms Justified; retain the adverse first
Justified value. A numbered refresh-signature marker mismatch failed before motion
and was repaired; it is not app performance evidence. No callback/collection-colour
churn was observed in this synthetic steady-window control.

Before E2E, the actual shared app was reloaded because HMR was unavailable. Raw served
hashes for ImageGrid, ImageTable, TableRowCells, date formatting, field registry and
number formatting matched disk. Runtime ApiDataSource, configured deployed TEST /
canonical media, foreground visibility and 1720x960/DPR2 were verified. Retained
Resource Timing entries corroborated image-API traffic; an earlier legacy-/api
classifier was inapplicable and its zeros were discarded, not called zero requests.
No independent backend-binary or production-build identity claim follows.

One read-only extension prepared 400 resident results at offset zero. Every pass
applied about 80 calibrated results with a 1s cap; a separate decoded-media observer
had a 1s stop cap. Ordinary means before explicit prewarming, not cold caches. A
200-image prewarm completed in 75ms with no failures. Cache state and live enrichment
were not independently controlled; result-buffer publications were measured.

| Live DEV pass | Frame-p95 ms | Worst interval ms | Applied results/s |
| --- | --- | --- | --- |
| Grid ordinary | 24.9 | 25.1 | 99.16 |
| Table ordinary, 23 columns including selection | 17.6 | 25.3 | 99.10 |
| Justified ordinary | 9.4 | 16.8 | 100.19 |
| Grid explicitly prewarmed | 9.1 | 16.6 | 100.16 |
| Table explicitly prewarmed | 16.7 | 25.5 | 97.12 |
| Justified explicitly prewarmed | 9.2 | 16.7 | 99.13 |
| Table original columns, bracket start | 17.4 | 25.1 | 97.09 |
| Table thumbnail only, repetition 1 | 8.7 | 16.7 | 99.06 |
| Table thumbnail only, repetition 2 | 9.1 | 9.4 | 99.08 |
| Table original columns, bracket end | 16.8 | 25.0 | 99.11 |

The column intervention initially imported a disconnected bare-path store while the
live Table used a timestamp-qualified dependency. The rendered-header guard stopped
it and `finally` restored that instance; the completed bracket-start pass was retained.
Resolving the exact dependency from the served owner module made the remaining three
passes observable. Rendered header counts verified 23 versus 2; preferences were restored.
No completed pass was rerun and total motion stayed within ten 1s-capped passes.

All ten passes stayed visible, kept the same result array, completed fixed distance,
had zero read starts/result publications during motion and no intervals over 33.4ms.
All decoded endpoints completed within their separate cap. Grid/Justified usable
slot counts were 24/33 at stop. Table's slot witness counted 27 usable rows while
the shared media helper counted 29 intersecting images including the header band;
do not merge those populations or call either paint proof. No constrained delivery,
long churn, backward geometry or historical Table-recovery claim was remeasured.

The former large warm Grid/Table frame penalty was not reproduced in this bounded
live DEV check. Full Table retains a smaller metadata-cell cost versus thumbnail-only;
these data do not identify its exact browser subsystem or justify another renderer
change. Historical and current observations are not randomized paired speedup data.
All owned globals, listeners, observers, warm references and CDP overrides/session
were removed, with cleanup readback; shared server/configuration and canonical
histories were unchanged. Full E2E was still outstanding at this checkpoint;
the completed product gate is recorded below.

### Completed Product Validation (25 October 2026)

Full local-only E2E completed with 505/505 passing, retries disabled, covering
Chromium, forced-seek, Justified preview, indexed and seek projects. Full units
passed 3,256 tests across 92 files; perf TypeScript and the focused research controls
also passed. The first E2E attempt was agent-interrupted and does not count toward
this gate; only the completed rerun is used. No assertions were weakened or failures
retried away. The operator's shared app was stopped by the operator before testing;
runner-owned servers used explicit local ES settings, not TEST. This validates
workflows/regressions, not hosted performance or the unresolved media/paint questions.

Nine D1/D2/D8 records changed workload contracts in revision 4. D3–D7/D11 retain
twelve comparable records; even the new 100-results/s step is not the old continuous
journey. Do not compute a cumulative scroll speedup across that revision boundary.
The latest comparable seek medians improved 2082 → 1353ms Grid and 1994 → 1762ms
Justified, while maintenance frame medians worsened and paired refresh decode
penalties rose 7 → 73ms and 45 → 109ms. Both campaigns already had cleanup; these
changes are not another product intervention or a controlled causal comparison.

<a id="post-lookahead-campaign"></a>
<a id="post-cleanup-campaign"></a>
### What the Earlier Repairs Bought

| Repair | Retained evidence | Limit |
| --- | --- | --- |
| Maintenance-safe velocity and B1 validity | Spurious D9 forward starts fell 1 → 0; historical P17 backward reads/prepends fell two → one. | Removing false work did not remove Justified walls. |
| F1 visible admission/render isolation | Justified ordinary frame-p95 returned roughly 24–25 → 17ms after the preceding admission work. | Not delivery priority or a backward runway fix. |
| Two lower eager rows | Same historical D8 contract: pending area 13.66 → 0.14% Grid and 36.63 → 2.95% Justified, matched entry controls support the mechanism. | Late sustained Justified and reversal/frame/refresh trade-offs remained. No tested upper-row comparison. |
| KUP-042 | Correct fixed-row membership and compensation, protected by all-visible-box regressions. | Not Justified packing or a universal performance claim; the office-network campaign has intervening changes and transport confounds. |
| Table row identity | Revision-3 retained replacements fell 2624 → 22.5 forward and 2168 → 108 backward; late pending slots improved substantially. | Delivery backlog and frame cost remain. Latest replacement counts stay low under the changed workload. |
| Unmount cleanup | Active cancellation and reduced outstanding work; native-photo pressure comparison supports conditional landing/progress benefit. | Same-contract campaign changes were mixed, including worse Grid frames and adverse Justified geometry. No broad speedup or upstream-savings claim. |

Campaign labels may describe working-tree changes before their eventual commit.
Use contracts and recorded provenance, not commit order alone. Content, packing,
network conditions and decoded/proxy/CDN warmth were not frozen.

<a id="delivery-options-decision"></a>
## F2: Keep the Committed Fix, Bound Its Claims

Cleanup is now part of the product baseline, not an unfinished experiment. It removes
src only from a captured element that is detached and incomplete. Keep connected
Strict Mode replay, completed images, shared native consumers and re-admission intact.
The [ordinary lifecycle regressions](../../e2e/local/thumbnail-lifecycle.spec.ts) cover
production behavior; broader controls remain in research, not habitual E2E.

`f2NativeComparisonTimingV220261022` is the usable matched native-photo result.
In two treatment orders under 80ms/4Mibit delivery pressure, cleanup reduced stopped
readiness from about 5.0–5.6s to 2.2–2.4s and blocking from 2.5–3.0s to 1.1–1.3s.
Frame-p95 worsened roughly 67 → 75ms, moving pending slots remained above 90%, and
both policies retained adverse geometry. Warm unthrottled arms had no cancellations
and no established benefit; the first cold-proxy arm is confounded. These are
bounded Justified controls, not Grid, hosted-CDN, native-trackpad or long-churn proof.

That result is enough to retain the small lifetime fix, not to declare F2 solved.
Do not repeat warm arms looking for a win or expand cancellation without a named
remaining ownership problem. A passed-by image may be useful again; no strict
centre-out completion order or deliberate withholding of ready images is required.

### Approaches Not to Adopt by Default

- Dynamic in-flight `fetchPriority` demotion showed **0 demotions for 332 pending
  High requests**, while natural promotions verified the collector. Initial hints
  working does not establish mutation uptake. Revisit only for a changed runtime
  or a different, explicitly tested mechanism.
- A mounted-image src sweeper left the same node blank on reversal because unchanged
  React props did not restore src. Any admission policy needs declarative ownership
  and re-admission, not a DOM sweep.
- Fetch/blob brokers add full-body display latency, CORS, deduplication and object-URL
  lifetimes. Native cross-origin img can work where opaque fetch blobs cannot.
  A queue library or worker does not supply current-demand ownership automatically.
- A blanket 150-image backward floor previously produced three reads/600 hits after
  a short stop without avoiding a stall. Do not use it as a fallback.
- Larger buffers, global key rewrites, guessed visible ratios, async hints and
  universal horizon increases have no established general benefit. Changes to
  quality, format, thumbnail sizing or layout engines are separate decisions.

Proxy coalescing, streaming, abort propagation and HTTP2/separate origins remain
possible targeted improvements, not dependencies of B2 or retroactive proof of
backend savings. [KUP-041](bug-backlog.md#kup-041) separately owns API-to-ES read
cancellation; do not conflate it with browser image cleanup or transport failures.
The [TEST deployment plan](kupua-TEST-deployment-plan.md) owns canonical thumbnail
URLs and expiry compromises. The [imgproxy assessment](imgproxy-kupua-assessment.md)
concerns future preview/zoom delivery; it does not block today's thumbnail path.

## Evidence and Reuse Map

Use the existing [research JSON](scroll-horizons-thumb-lookahead-results.json) keys
below. Preserve numbers, exclusions and provenance; do not rewrite a historical
`nextDecision` into current authority. No new archive or duplicate results ledger
is needed to keep the useful evidence accessible.

| Evidence | Reuse for |
| --- | --- |
| `b2LocalComparison20261020`, including `justifiedAfterSetupRepair` | Original 400ms candidate, short-stop and slow/fast delivery costs, both orders, reversal and capacity. |
| `b2LiveBoundary20261021`, `b2TierReproduction20261021` | Walls release after metadata publication while thumbnails remain pending; indexed missing-data exposure with/without a map; resident true ends. Viewport-specific recipes, not universal speeds. |
| `b2Publication20261021`, `b2StabilityFilmstrip20261021` | Identity across DOM replacement, applied-input/anchor controls, calibrated edge/interior geometry and paint attribution. Original Grid realignment predates KUP-042. |
| `b2GeometryLifetime20261021` | Why original-cohort release is unsafe, truthful-dimension invalidation, and stable forward negative controls. The provisional-slot recommendation was withdrawn. |
| `b2UninterruptedResearch20261021` | Separate 400/1,000ms, first-entry/ready-runway comparisons; true-ratio fragment feasibility and unresolved lifecycle. |
| Initial lookahead rows, `frameAttribution`, `decodingHint`, `scrollLookaheadMatched`, `refreshLookaheadMatched` | Lower-band choice, arrival-related frame work, lack of demonstrated async-hint benefit, sustained/reversal and refresh costs. |
| `f2RequestOwnership20261022`, `f2PriorityUptake20261022` | Late once-useful demand, metadata-delivery association and failed dynamic-demotion mechanism. Not a pure queue-time or eager-band attribution. |
| `f2DeliveryOptions20261022` | Native ownership/re-admission, shared consumers, HTTP1 capacity, fetch/blob and actual-proxy boundary controls; matched synthetic delivery. |
| `f2CleanupCampaign20261022`, `f2NativeComparisonTimingV220261022` | Mixed canonical outcome and bounded native-photo benefit/trade-off. |
| [Density](../../e2e-perf/results/density-log.json), [rendering](../../e2e-perf/results/audit-log.json), [perceived](../../e2e-perf/results/perceived-log.json) histories | Existing live baselines and navigation/traversal guardrails. The latest density-only run did not remeasure the other suites. |

Important exclusions to retain: old embedded recovery clocks crossed controller
round trips and cannot establish speedups; early publication screenshots missed
the pending-decode interval; the repeated-image delay control did not exercise its
hold; the async-hint request collector lacked valid fresh-document lifetime
accounting. The six-second native baseline had real walls but did not reach its
endpoint, so it is not an on/off recovery comparison. Do not recover these claims
from a later successful test or pool them with corrected captures.

Research methods live in [local controls](../../e2e-perf/research/controls.md),
detector checks in [validation](../../e2e-perf/validation/README.md), and current
campaign/metric contracts in the [measurement reference](../../e2e-perf/measurement-reference.md).
Reuse those owners instead of copying test commands, run counts and setup transcripts here.

The earlier [pinned Immich study](https://github.com/immich-app/immich/commit/53618ff7496ee313d1cff7b3bcdf19c82b765cdf)
found a month-index/placeholder model and same-origin URL-keyed worker, not a
drop-in arbitrary-sort cursor-window or CDN scheduler. Reuse current-demand
protection, deduplication and late-write rejection principles, not that architecture.
The installed WASM package supplies geometry, not a delivery policy.

## Contracts and Validation

| Owner | Preserve |
| --- | --- |
| [Data window](../../src/hooks/useDataWindow.ts), [tuning](../../src/constants/tuning.ts) | Directional demand, first-row validity, maintenance-safe velocity and scope resets. The proposed backward mirror must not silently alter indexed or forward policy. |
| [Scroll effects](../../src/hooks/useScrollEffects.ts), [search store](../../src/stores/search-store.ts) | One placement owner, generation guards, legitimate programmatic demand, 200-image pages, 1,000-image retention and one extension per direction. Metadata publication does not wait for images. |
| [ImageGrid](../../src/components/ImageGrid.tsx), [Justified layout](../../src/lib/windowed-justified-layout.ts) | Existing eager/overscan policy, real image ratios, authoritative metadata/permissions, bounded geometry facts and consistent rendering/navigation coordinates. |
| [Image URLs](../../src/lib/image-urls.ts), [traversal](../../src/hooks/useImageTraversal.ts), [prefetch](../../src/lib/image-prefetch.ts) | Shared-current-consumer protection, current element/source validation and independent full-image traversal semantics. List-thumbnail evidence does not certify final-detail delivery. |

<a id="fixed-grid-continuity"></a>
KUP-042's [fixed-row policy](00%20Architecture%20and%20philosophy/03-scroll-architecture.md#fixed-row-window-policy)
remains the geometry contract; [its backlog entry](bug-backlog.md#kup-042) retains
the original reproduction. Raw image-box resizing/arrival animation is not proof of
a fixed-row regression. For Justified, truthful dimension snapshots are not a
presentation lifetime: width, visibility, navigation and fragment ownership need
their own contract if a geometry change is selected.

Any next investigation must state the unanswered question and why the existing
evidence cannot answer it. Match **achieved demand and runway**, not copied px/s;
viewport, packing, DPR and media conditions remain independent. Keep setup costs
outside timed motion explicit rather than free. Loaded, decoded and painted are
different boundaries; sources and a centre anchor alone do not certify all-visible
stability. Correct geometry for applied input and arrival animation, not by widening
tolerances. Same-element counters can miss wholesale node replacement.

Canonical revision-4 capture already supplies atomic stop clocks, request windows,
count-based exposure, wall episodes, retained geometry, censoring and costs. Use it
before adding probes. Browser before-send time is not pure queue time, maxima from
different requests are not additive, and cancellations/completed bytes are not
upstream savings. Perceived latest-store timings and older loaded-only endpoints
must not be silently treated as action-owned decode evidence. Raw per-run histories
are not universally retained; do not invent unavailable distributions.

Keep photo/cache/transport attribution separate from synthetic controls. Preserve
all-current-image success, short-stop bounds, reversal, capacity, resize/density,
seek/history and legitimate non-wheel demand in the selected implementation's
tests. Full required product gates apply to product changes; measurement validation
is not their substitute. Retain independent review and explicit disposition of
adverse results rather than retries, timeout inflation or weaker assertions.

Campaigns and dry runs remain operator-run; live investigations need fresh scoped
permission. Do not change shared servers, proxy behavior or non-local data. Persist
only sanitized evidence, never live identities, signed URLs or credentials. Keep
runtime practical and reuse existing controls; a new experiment must answer a new
decision, not prove again that the core browsing workflow exists.