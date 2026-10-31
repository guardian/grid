# Campaign Measurement Reference

[Operator entry point](README.md). Workload contracts, interpretation and maintenance; research recipes live separately.

## Detail Traversal Landing

P14 revision 3 observes the expected landing image for up to 15 seconds from the
final committed navigation. Completion retains its actual observed load time;
incomplete media is an adverse measurement, not a fatal campaign assertion.
Changed image ownership, missing commits and unexpected metadata lookups still
invalidate the measurement. This is load readiness, not a compositor-paint clock.

Raw incomplete samples retain `landingRendered=false` and a deadline marker in
`landingRenderMs`; that marker is not a measured load time. Aggregation excludes
incomplete samples from landing/network medians and reports `landingRenderedCount`
and `landingCensoredCount`. No completions means null latency. Read every
completed-only latency alongside those counts; it is not the median for all trials.
Revision 2's five-second contract remains separate, without rewriting history.

This change does not make every media-dependent setup nonfatal. P14 still requires
its starting image to load. P13c revision 3 measures returned media, with separate
singleton-response, metadata-ready and decoded/stable-image clocks. It records exact
warmed-URL reuse as evidence, not a prerequisite or proof of cache warmth. Changed
signatures can change the browser resource without changing rendition.

P13c observes image readiness for fifteen seconds; incomplete images retain null
latency. Completed-only image medians must be read with `detailImageReadyCount` and
`detailImageCensoredCount`. `detailImageFailedCount` records observed image errors
and is a subset of incomplete outcomes; a loaded thumbnail fallback cannot satisfy
full-media readiness. URL reuse, non-reuse and unavailable-evidence counts are
separate from HTTP/CDN cache hits. Nonresident ownership, successful singleton
response and metadata availability remain validity requirements. Older warm-only
P13c revisions are not comparable to this returned-media condition.

Delivery comparisons must separate browser DPR, effective request multiplier,
requested processing bounds, returned image dimensions and encoded bytes. The
desktop high-DPR multiplier is 1.5: a 1720x960 screen requests up to 2580x1440,
with native caps and aspect-fit output. Set campaign screen/viewport/DPR before
loading app modules; the prefetcher captures screen dimensions at module load.
Match ordered image identities, cadence, source state and cache conditions across
delivery arms; reused-context probes are diagnostics, not fresh-context baselines.

## Density comparisons and thumbnail exposure

The comparison suite covers scrolling with browser-cache bypass and repeat-path setup,
Table→image-layout switching, detail return, scrubber seek, width reflow and window eviction.
It retains one paired source identity and rotates density order between repetitions.
Revision-4 D1/D2 and D8 measure a fixed gentle/reference/stress load ladder in Grid,
Justified and Table, followed by atomic stopped-image recovery. D2 includes a brief
reverse leg. **Nine active workloads produce 21 records per repetition.** Standalone
D9 and D10 are retired from execution, not deleted from history. D3-D7 and D11 keep
their contracts. These run automatically with `--suite justified`, `--suite combined`
and `--full`; there is no new campaign flag or permanent cancellation-policy toggle.

Startup and source restoration are **unthrottled**. D8 constrains movement and recovery;
D11 constrains both priming movement and refresh arms. Both use 80ms latency, 4Mibit/s download
and 1Mibit/s upload, affecting data requests as well as images. Other observations are
unthrottled. There is no separate throttle flag.

D1/D2/D8 calibrate pixels from visible row starts and request fixed 30/100/200 results/s steps.
All use a time-based animation-frame loop and record achieved movement. This is not physical
wheel-device certification. The normal viewport is 1720×960,
DPR2; width-reflow cases temporarily narrow it. Eviction is an event-bound workload, not a
constant-speed comparison. Browser-cache bypass does not clear already-loaded images or reset
proxy/CDN/server caches. Repeat-path setup does not guarantee every resource is warm.

### Normalized Directional Journeys

D1 moves forward and D2 backward through three consecutive 3-second steps at 30, 100 and 200 results/s.
D2 then reverses for 1.5 seconds using the original 100 results/s calibration; it does not wait
for missing rows or recalibrate at a potentially sparse buffer edge. D8 uses the same
three demands for 2 seconds each under constrained delivery. Every density starts from a freshly
restored paired metadata window. Recorded initial
runway, results/pixel, container dimensions, DPR and achieved frontier progress expose matching
limits; Justified calibration is an estimate from the current visible packing, not a global
constant. No predictor, page size, eager band or retention policy is changed. Early/middle/late
fields retain the exposure, count-based pending-slot ratio, waits/censoring, severe frames,
wall episodes and request phases previously available in D10. Gaps of 250ms or more between
input phases invalidate capture. Phase boundaries censor unfinished episodes, not release them.

Healthy windowed validation fixtures prove repeated directional publications. A live
regression that prevents a second publication remains an adverse observation, not a
discarded run: `refillCoverageComplete=0` must be read with achieved demand and walls.
Zero walls is valid; zero supply coverage alone is not proof of good performance. Store admissions/publications,
eviction, pending refills and achieved result progress are separate from browser HTTP counts.
`freshVisibleImages` means distinct identities first observed **within this journey**, including
its starting viewport, not globally cold media. `priorJourneyVisibleRevisits` counts distinct
identities previously observed in another layout arm; the bounded identity sets never leave the
browser. Browser-cache bypass does not clear decoded images or upstream caches.

`journeyCaptureRevision: 1` and `stabilityCaptureRevision: 1` follow at most 256 mounted cells
per sample and 4096 distinct identities per journey (8192 across paired arms). Overflow/scope
changes invalidate capture. Retained cell **and image-element** rectangles are compared across
adjacent samples, adding back only the driver's actually applied input. This detects common-mode
motion; non-input scroll-origin movement is recorded separately, not subtracted to hide it.
Resize, source changes, node replacement, unready/hidden samples and departures are separate.
No retained comparisons means null geometry, not zero. Raw boxes include arrival animation and
image sizing: a displacement is not automatically a row-layout defect or wrong-image paint.

Canonical journeys do not capture pixels: `paintCaptureAvailable=0`, `paintMismatchCount=null`.
The existing bounded marked-image compositor controls calibrate wrong/blank/displaced paint in
isolated fixtures. Sampling gaps remain explicit; neither DOM/source/decode observations nor
sparse compositor controls certify every physical display frame. Sampling-cost totals measure
synchronous probe work, not asynchronous decode/event work; matched on/off controls cover wider
effects. All probe subscriptions, animation callbacks and paired-history state are disposed.

### Atomic Recovery and Load Bands

`timingCaptureRevision:2` runs all movement, observer stops and first recovery checks
inside one browser job. Observer/recovery-start lag above 25ms invalidates the capture;
controller-return delay is recorded separately and cannot inflate readiness. Transient
backgrounding invalidates frame evidence even when visibility returns before the next frame.

Current data and decoded-media clocks share the last motion stop, with a 4-second observation
cap. Unrelated background work need not drain. Missing data, failed media, timeout or
changed stopped identities retain explicit censoring and null latency. Post-ready identity
stability is checked separately; decode/DOM checks are not compositor-paint certification.
The first complete endpoint remains the latency boundary, not a later controller return.

`pressureCaptureRevision:1` records actual demand/achievement, pending slots, blocking,
frames and per-step progress/frame reference flags. Reference revision 1 uses delivered
demand >=80%, pending slots <=20%, blocked input <=5% and frame-p95 <=33.4ms. These are
transparent diagnostic bands, not calibrated satisfaction scores or acceptance gates.
Progress and frames stay separate. A breach at the gentlest step and no breach through
the strongest step are explicit outcomes; neither invents an exact capability threshold.
Steps are sequential, not independent steady-state experiments. No adaptive tuning changes
the workload after an improvement or regression. Raw values remain inspectable.

### Runtime Budget

| Replaced motion per repetition | Previous revision | Revision4 |
| --- | --- | --- |
| D1/D2 primary motion, three densities | 60s | 54s |
| D2 reverse legs | In standaloneD9 | 4.5s |
| D8, three densities | 12s | 18s |
| StandaloneD9 | 9s | Retired |
| Total motion | 81s | 76.5s |

Retiring D9 removes its workload setup and two outer layout restorations. D8 now
explicitly restores fresh windows, so it adds three cursor restorations while D9
removes two: net one additional cursor restoration. Recovery now has nine4s-capped
endpoints instead of two 10-second-capped D9 endpoints. Actual successful waits are retained,
not fixed sleeps; pathological censoring can therefore increase total duration.

The goal is roughly the existing campaign duration, not a seconds freeze. Recent
four-repetition density campaigns took approximately 14 minutes. Setup, module loading,
reads, recovery, instrumentation and teardown all count. The operator rerun, not local
fixture timings or the motion arithmetic, confirms the new end-to-end duration. Avoid
adding minutes unnecessarily; do not weaken measurements or reduce repetitions to meet it.

The first completed revision-4 operator campaign, `scroll load and recovery v4`
(22 October 2026), took786.415s from report start to history, versus857.629s for the
preceding cleanup campaign. This is13m06s versus14m18s, excluding compiler preflight
and final serialization, not a future-runtime guarantee. See the
[campaign assessment](../exploration/docs/scroll-horizons-thumbs-and-blocking.md#revision-4-campaign-assessment)
for observed workload validity, censoring and historical comparison limits.

### Historical D9 Burst, Reverse and Recover

Standalone D9 is no longer selected by campaigns; its contract/history remain readable.
Current D2 records its own reverse-leg metrics, and D1/D2/D8 record stopped recovery.
The historical D9 workload restores a fresh window around the paired source identity before each layout, waits for
setup and maintenance cooldowns, and clears focus without selecting another image. It drives
three seconds backward followed immediately by 1.5 seconds forward at a commanded 4,000px/s.
Browser-cache bypass applies during movement and recovery, not setup; network and CPU are
unthrottled. This is synthetic constant-speed scrolling, not trackpad certification.

The thumbnail exposure/frame observer ends with movement. Separate recovery clocks start at
the final applied scroll command, with a shared ten-second observation deadline:

- `bufferEdgeBlockedMs`: commanded time clipped by temporary seek-mode buffer bounds.
- `stopDataReadyMs`: stable visible identities, with no visible missing-data placeholders.
- `stopMediaReadyMs`: decoded media in that stopped viewport. It shares the stop clock with
  data readiness; do not add the two. A changed visible identity set censors recovery.
- `forwardReadStarts`, `backwardReadStarts`, `readStartsAfterStop`, `peakRefillsInFlight` and
  `refillsPendingAtEnd`: store-level refill admission during movement and recovery.

Unrelated speculative refills do not delay current-viewport readiness. They remain counted,
including pending work at observation end. These are not HTTP counts, transferred/wasted
bytes or proof that cancellation saves backend work. Missing/failed media and timeouts retain
explicit censor fields and null latency, not invented zero or deadline-valued success.
Setup reads are outside the measured window. The observer rejects scope changes and overflow
instead of silently truncating a sample. Physical clamping at a true result end is not a
temporary buffer stall; indexed modes may expose missing data without a physical wall.

The dashboard includes the new outcomes and cost fields in its ordinary metric selector,
with units and interpretation cautions. D9 uses a separate revision/profile; older campaigns
have no D9 points. Do not manufacture historical values or compare different workload clocks.

### Visible waits and request cohorts

The thumbnail observer adds `thumbnailWaitCaptureRevision: 1` without changing older exposure
fields. `thumbnailVisibleWaitMaxMs` is the longest observed continuous visible load/decode
wait; unfinished episodes are censored on departure, replacement, failure or observation end.
`thumbnailVisibleWaitCompletedMaxMs` is unavailable if no episode completed. Inspect
`thumbnailVisibleWaitCensoredCount` alongside it. These are frame-sampled episodes, not unique
images or exact painted latency; historical missing values remain unavailable.

D1/D2/D8 and D11 use `requestCaptureRevision: 1`, a bounded CDP collector; historical D9/D10
records also contain it. `media*` counts browser
HTTP Image requests, not every possible media-fetch mechanism; `data*` counts API/ES traffic.
Starts, completions, failures/cancellations, carry-in, pending/peak counts and completed-request
durations are separate. A phase retains earlier requests still in flight. Byte totals use CDP
encoded transfer evidence and remain unavailable for incomplete redirect/byte evidence; known
partial totals stay separately labelled. Pending/failed transfers are not completed bytes.
These are browser-boundary observations, not backend work, visibility-priority classifications
or proof that cancellation saves server work. Existing Resource Timing `networkBytes` semantics
are unchanged. No request URLs, identities, bodies or headers enter campaign records.

Revision4 adds `requestWindowCaptureRevision:1`: half-open epoch windows reconstruct
starts, carry-in, completion, cancellation, pending work and peaks after the browser job.
Missing clocks/overflow invalidate capture; a CDP barrier flushes delivery before slicing.
Controller processing time never decides the measurement phase. `reversal*` and
`recovery*` keep later costs distinct from the three primary load steps.

`mediaProxyCacheHits/Misses/Unknown` classify ended image requests using only an exact
HIT/MISS header from a configured `localProxyOrigins` origin and `/s3/` path on both
request and response, without redirects. Campaigns configure their app origin;
unconfigured collectors fail closed. Unknown includes other origins/paths, redirects,
missing headers and cancelled requests without that evidence; it is neither warm nor
cold. Earlier saved counts predate origin/path enforcement and are not retroactively
revalidated or rewritten. These counters are distinct
from completed browser-cache responses and decoded reuse. No arbitrary headers are retained,
CDN headers are not interpreted as local evidence, and cancellation/completed bytes do not
establish upstream savings. Read cache differences before attributing a timing change.

`requestTimingCaptureRevision: 1` adds completed **data-request** phases to that same
bounded collector. `dataBeforeSend{Mean,Max}Ms` spans the request-start event to CDP
send-start; `dataSendToHeaders{Mean,Max}Ms` spans send-start to first response headers;
`dataHeadersToComplete{Mean,Max}Ms` spans those headers to loading completion. These
are browser clocks, not server CPU, pure queue time, JSON parsing or store publication.
Redirected/cached responses and invalid or unavailable clocks are excluded explicitly:
`dataTimingCompletions` and `dataTimingUnavailableCompletions` account for completed
requests. No usable timing produces null, not zero. Maxima can belong to different
requests and must not be added. D1/D2 and historical D10 prefix phases with early/middle/late; D11 uses
quiet/busy. Requests may include overlapping API operations, not only result refills.
Historical records without this additive revision remain valid and unavailable for
the new fields; workload profiles and existing request metrics are unchanged.

### Historical D10 Sustained Scrolling

D10 is no longer executed by campaigns. Its records used three consecutive eight-second
segments at 1,200px/s, with no deliberate pause.
`early*`, `middle*` and `late*` fields expose blank area, visible waits, frames, achieved movement,
buffer blocking and request cohorts separately. `enduranceMaxGapMs` records dispatch gaps;
250ms or more invalidates the capture. Observer wait episodes are censored at segment
boundaries, while network requests carry across them. Compare pending work and actual movement,
not just average blank area: a growing queue or stalled viewport must not look like improvement.
Browser-cache bypass spans the observation; proxy/CDN caches remain uncontrolled.

### Search refresh under media load

D11 alternates drained/active arm order between repetitions. Both arms restore the same source,
load an extra page for runway and make the same 1,500ms priming scroll under constrained
transport. A refill/window change during priming invalidates setup. The drained arm waits for
observed traffic and visible media; the active arm dispatches immediately. The action reissues
the same query, not a typing or different-query cancellation workflow.

`quiet*`/`busy*` publication, placement and visible-decode times belong to that action and share
its start clock. CDP lifetimes establish pending media/data at dispatch. `refreshComparisonCensored`
is one when the intended drained/active conditions or usable data-request evidence are absent;
this is not evidence that contention is harmless. `refreshDataDeltaMs`, `refreshPlacementDeltaMs`
and `refreshMediaDeltaMs` are active-minus-drained differences **within each repetition**, not
differences of campaign medians. Unsupported pairs remain null; decoded endpoints can be
separately censored. Inspect censor p95 and sample counts, not just median timings. Valid overlap
does not prove that all of a timing difference came from images; backend/cache variation remains.

### Recorded measurement baseline

The local media-api instrumentation baseline is `thumbnail measurement baseline - current policy`
(18 October 2026); its historical "current" policy is visible-only eager loading. The completed
`2 eager thumbnail rows at bottom` full campaign (19 October) measures the implemented lower
band. Both have four repetitions; see the [assessment and remaining B2/F2 work](../exploration/docs/scroll-horizons-thumbs-and-blocking.md#post-lookahead-campaign).
Do not repeat the initial setup campaign merely because a new session starts.

For a separately selected comparison, keep contracts, backend mode, viewport and cache conditions
comparable and freeze files/configuration during runs. Shared-tab previews do not affect fresh
campaign browsers. Temporary policy variants require verified treatment provenance, not a
permanent eager-row matrix; preserve historical fingerprints and unavailable metrics.

### Reading the measurements

- `t_ack` — synchronous action acknowledgement by its current producer; not a DOM-visible boundary.
- `t_first_visible_frame` — the target context has real visible content in a browser frame;
  this is not necessarily decoded media or final settled geometry.
- **Placement and visible-media completion share a start clock.** Do not add them together.
  Stable geometry is not decoded media, and decode readiness is not exact compositor paint.
- **Positive lead distance:** ready before entering the viewport. **Negative:** already inside.
  Initially ready images do not invent readiness events; missing samples are not zero latency.
- Pending-thumbnail area is a **viewport-area estimate**, not a per-image speed ranking.
  Justified shows more imagery; Table has a narrow thumbnail column. Keep missing result data,
  failed media and still-pending thumbnails separate.
- Layout-shift sums/attributed source nodes are not automatically official CLS or proof of
  thumbnail causality. Repainting and virtualized element reuse are not logical reordering.
- Four repetitions give four samples per scenario, not four historical campaigns. Their p95
  is the slowest repetition, not a reliable population-tail estimate. One campaign is a baseline,
  not a trend; compare matched contracts within an environment before drawing wider conclusions.
- Resource Timing reports completed browser transfers, not pending requests or backend ES work.
  RTT is a separate probe to `KUPUA_ES_URL` (default localhost:9220), **not API latency**; verify
  its target/reachability before interpreting it. `KUPUA_PERF_BASE_URL` overrides the direct-mode
  browser origin; API flags select their authenticated origin. `CPU_THROTTLE` is an explicit
  diagnostic setting and must match for comparisons.

### Coverage limits

The recorded pre-seam direct-ES and media-api campaigns cover seek-regime outcomes, not
controlled transport overhead, near-threshold indexed construction, continuous resize,
the <600px target-height transition or aggregate heap. Dimension/cardinality bounds do not
certify frame time or total JS/typed-array/WASM retention; see the
[geometry cost model](../exploration/docs/00%20Architecture%20and%20philosophy/03-scroll-architecture.md#bounded-justified-geometry-costs).
Held maintenance and page-size checks do not establish natural-scroll request frequency.

When a comparison is warranted, a matched four-repetition density campaign is the smallest
useful comparison: hold corpus, backend, regime, width and cache/network profile comparable,
with Grid controls. Packing changes which images occur per pixel; media differences are not
packing-algorithm timings. A scalar seek-policy extraction does not itself justify a new
campaign or a performance claim. Campaigns and dry runs remain separately approved work.

## Dashboards and reports

The [graph-led saved-history dashboard](results/Performance%20dashboard.html) adds the
approved Overview -> Search & Navigation / Scrolling & Layout / Image Workflows -> exact-record slices; legacy dashboards below
remain available. Its [shared adapter](results/dashboard-data.js) names the four exact
24 October entry timestamps and expected scenario sets explicitly. Labels and independently
latest entries never establish cross-family checkpoint membership. Missing members remain
visible. No history/schema migration or additional baseline grouping is implied.

The adapter retains complete raw records and entry provenance. Charts use qualified
measurements separately from raw evidence: unsupported/invalid captures, incomplete
density field populations and changed capture gates cannot earn healthy assessments.
Healthy-only responsiveness `sampleCount` plus `degradedCount` gives the outcome total;
P13c/P14 completed-only fields and density metric counts retain their own populations.
Null, zero, absent, partial and unsupported are not interchangeable. p95 is called an
observed maximum only for a qualifying nearest-rank population where that is true.

Selected-pair eligibility uses the existing environment guard, then family/kind/scenario,
revision, routes and field/record contracts, including density contract keys and capture
gates. Raw field availability does not certify measurement validity or a numeric delta.
All workflows keep checkpoint/baseline and C−B direction fixed when `side=baseline`
selects the evidence owner; stable record/field URLs round-trip through reload and Back.
All three workflows have summaries. Search preserves action-phase/regime selection,
healthy-only PP3/PP4 timing with degradation counts, background-only PP10 and D11's
saved within-repetition signed deltas. Isolation/media censor gates and contributor
counts apply independently; no paired delta is reconstructed from arm medians. Status
correlation and diagnostic attribution remain unresolved. Count/acknowledgement fields
are not settlement grades. Scrolling local density,
direction, workload, phase and statistic choices survive exact-field inspection; absent
selected phases never fall back to a successful primary field. Existing density v1
indices use complete ordinary-journey inputs/gates, separately from the selected phase.
Provisional action grades are not accepted thresholds; P14 U1/U2, D7 foreground and
JA2 loaded-not-decoded limits remain. The only registered comparison is the confirmed
three-entry proxy assembly (70 records, long absent) against the four-entry canonical
checkpoint (78); no latest-family substitution or other grouping follows. Legacy history
stays accessible.

Open the dashboard links above directly from disk; no server is required. They load local JS
sidecars beside the HTML. Refresh after a campaign. All three provide Previous/Next controls,
arrow-key metric navigation and metric explanations; arrows stay native in editing controls.

The density dashboard opens on **three ordered north-star rankings** for ordinary
forward/backward browsing and recorded reversal. Limiting values lead; unchanged v1
indices remain secondary. Rank styling is neutral, not a pass mark. Constrained
landing outcomes appear separately near the top so ordinary ranks cannot conceal them.
Each score links to its exact limiting metric, workload, phase and density.

Compare with defaults to the preceding campaign. Historical index changes and prior
ranks require compatible journeys and environments. The outcome table checks each
record independently: unchanged contracts retain deltas while new/changed workloads
remain new baselines. It summarizes decoded endpoints, maintenance frames and paired
refresh decode penalties rather than every recorded field. Links open compatible
history with the selected baseline labelled; content/cache warmth remains uncontrolled.

Load and landing follows the comparisons: compact fixed-step readiness/frame/rate cells
open scoped evidence. Reference flags use worst repetitions, not fractional aggregate
first-step indices. Stable decoded counts distinguish changed cohorts, failures and
deadline censoring; partial endpoint latencies are not promoted to successful medians.
Request/cancellation/cache costs live in expandable evidence. Older histories do not
acquire invented pressure fields or cancellation observations.

The standalone page reuses Kupua's local Open Sans asset and mirrors the neutral grey,
text and cyan accent tokens in `src/index.css`; no app server or remote font is required.
Legacy/incomplete runs retain usable observations without invented rankings. The explorer
groups phases under one metric; metric and phase choices follow the current campaign,
environment and layout/workload filters. Never-measured probes are omitted even in
diagnostics. Censored endpoints and partial observations remain selectable as outcome
rows without empty axes; recorded zero values remain real data. Historical-only fields
remain accessible through their older campaigns or All campaigns. Raw histories retain
all fields: no sidecar/history data is rewritten by the dashboard.

**North-star indices v1** are operator-authorized presentation aids, not production acceptance
criteria. Each 0-100 index uses the weakest normalized component across both directions and
all load phases and the recorded reverse leg, from complete campaign medians:

- Progress: minimum of achieved/requested result rate, ready-slot fraction and unblocked-input
  fraction, each capped at 1. Missing/failed media evidence prevents a score; Table's narrow
  thumbnail-area fraction is never substituted for count-based readiness.
- Smoothness: minimum of 16.67ms / frame-p95 and fraction of intervals at most 50ms, capped at 1.
  The explicit reference is 60Hz, not a claim about the display's actual refresh rate or input latency.
- Sampled stability: minimum of retained-image ready fraction and 1 / (1 + geometry change beyond
  a 1px allowance). Geometry includes cell/image displacement and resize after applied-input
  accounting. Source changes, absent comparisons or sampling gaps over 250ms prevent ranking.
  Paint remains unmeasured; a high geometry score is not a universal no-flash guarantee.

Scores support the retained revision-3 contracts and verified revision4 D1/D2 captures,
kept separate by contract. Revision4 uses each phase's requested rate and includes reversal
frame/stability evidence. Censored stopped recovery prevents a progress ranking rather
than rewarding missing evidence. Scores require matching sample
counts. Validity gates inspect both median and p95, which is the maximum at the normal four
repetitions; unrecorded tails cannot be reconstructed. Ranks are descriptive only within
the same campaign and compatible direction/profile/cache/regime contracts; ties remain ties at
one decimal place. A sole comparable density is not crowned first. Each score exposes its formula
and components; there is no cross-north-star total. These reference choices are visible assumptions,
not empirically calibrated user-satisfaction percentages. Changing them requires a new score version.

Measurement History connects compatible samples only and distinguishes single points, gaps and
zeros. A single campaign uses a comparison plot labelled baseline-only, not a trend.
It is anchored to the selected campaign's environment/contracts and includes no later campaigns
unless All campaigns is selected explicitly. Campaign labels and the comparison baseline remain
visible. Hover/focus/tap provides values and sample counts; Escape dismisses. Scales
are shared within each workload, not across unrelated workloads. Other dashboards retain their
own comparable-history filters. Do not ignore unknown-field/schema warnings.

The runner prints a unique `$TMPDIR/kupua-perf-<timestamp>-<pid>.log` path and stores its location
in ignored `results/.latest-report-path`. Cleanup progress helps distinguish a running teardown
from a stalled test. Requested histories are committed **only after every selected repetition
and suite succeeds**; a [degraded PP3/PP4 sample](#degraded-focused-sort-samples) completes its
repetition. Failures retain diagnostics, not partial benchmark history or resumable
checkpoints. The density suite fails fast; do not fix failures by relaxing assertions/timeouts.

### Delivery comparisons

The runtime fingerprint includes `mediaDelivery: proxy|canonical` independently of
`dataMode` and `apiTopology`. All three dashboards label and separate those combinations.
Rendering/responsiveness now include topology in general history compatibility, not
only network metrics. Their Campaign / Compare with controls select exact entries;
History only restores their normal multi-series history.

An explicit baseline comparison may change API topology and/or delivery. All other
recorded environment dimensions must match, including browser version, origin, OS,
viewport/screen, DPR, throttling and cutoff; the individual workload/metric contracts
must also match. Missing environment evidence refuses cross-environment deltas.
Source differences or unverified source are disclosed, not mistaken for a controlled
intervention. Changing both topology and delivery does not isolate either one's cost.
Density retains separate history lines and exposes selected-pair metric deltas without
joining those lines. Its source-comparison rankings retain their measurement gates.

**Historical correction, operator-confirmed 23 October 2026:** all existing records
with a known data mode used proxy delivery. API records predating topology capture
used local media-api; direct-ES records have topology `none`. The one deployed campaign
on 28 September has one rendering and two responsiveness entries, all with proxy
delivery. These fields are annotated in canonical JSON and JS sidecars with
`operator-confirmed-2026-10-23` provenance; density keys/Markdown were regenerated.
No measurements, counts, timestamps, source revisions or workload contracts changed.
Records lacking a data-mode fingerprint remain unknown. This is a bounded correction,
not a default inferred for future missing fingerprints.

Revision-4 forward journeys cover nine seconds of increasing demand. They are not
the retired D10's longer steady-scroll observation. A hosted sustained-scroll symptom
needs separately scoped reproduction; this delivery comparison does not certify it.

## Maintaining measurements

<a id="measurement-discipline-for-later-work"></a>

Keep setup, measured action and cleanup separate. Require the correct identity/state and an
observable completion boundary; fixed sleeps are not proof. Missing phases/records or changed
conditions must not silently shrink a sample. Version changed workloads and preserve history.
Never persist credentials, raw live identities/URLs, request bodies or unredacted traces.
Do not import Vite-only modules into Node-executed specs; use browser-side access where needed.

Readiness waits use elapsed-time deadlines, never animation-frame counts: 120 frames allow
two seconds at 60 Hz but only half a second at 240 Hz. Frames establish consecutive visual
stability, not a network or rendering timeout. The remaining short/journey/setup and selection
panel waits use a 30-second budget, matching the Home and metadata-search policy; existing
seek deadlines remain unchanged. This is an observer safety bound, not a performance target
or a fixed delay: successful samples retain their actual timestamps and readiness predicates.
Timeout diagnostics expose readiness flags, not raw queries, identities, URLs or errors.
The local harness suite executes the actual observers at simulated 60/120/240 Hz, covers
delayed success and unsettled states, and guards against counted-frame loops inside browser
callbacks. Outer execution-context retries and bounded data-extension attempts are separate.

Idle state alone is not proof that an action completed: it may belong to the previous search.
Require a persistent action witness (changed destination, matching interaction completion or
operation generation) before accepting settlement. Do not require polling to catch a transient
`loading=true` pulse; fast operations may finish between polls. Keep raw actions where a test
intentionally observes or interrupts pending work rather than waiting for completion.

PP3, PP4 and PP8 use scenario revision 3 for repaired observation boundaries. PP4 uses the
shared action-aware direction helper. PP3/PP4 require their correlated `t_store_ready`, an idle
error-free store, the original focused image and stable visible geometry; geometry resampling
retains its timestamp. PP8 waits for its correlated debounced search completion and expected
query, not a loading pulse. These remain the same campaign scenarios and user actions, but
visual timings may shift. Preserve revision-2 histories; the dashboard's default comparable
filter separates revisions rather than treating a boundary correction as an app regression.
Offline harness regressions exercise delayed startup with old content, unrelated/missing
completion, fast completion and focus/geometry guards. They add no campaign samples or workloads.

<a id="degraded-focused-sort-samples"></a>
PP3/PP4 record the store's sort-around-focus fallback as a **degraded** sample instead of a
failed campaign. A correlated `t_store_ready` with an idle, error-free store and no focused image
is terminal: the original image cannot return, so the observer stops without waiting out its
deadline. Fallback is never accepted as preservation. A degraded sample adds no timings; medians use
healthy samples only, and history records `degradedCount`/`degradedReasons` beside the reduced
`sampleCount`. Focus moved to another image, pending sorts and store errors still fail; other
scenarios cannot record degraded samples. After the campaign, including a failed one, the runner
prints each degraded sample: store warning category (timeout, find error or none), phase reached,
UTC `t_0` and every media-api/direct-ES request's operation category, start, duration, outcome,
whether Chromium reported headers sent and when response headers arrived. A request waiting at
least one second without response headers is marked stalled. Diagnostic revision 2 retains
`focusedImageId: null` and only known structural path/operation names; identity-bearing and
unknown segments become placeholders. Queries, index names and hosts are omitted. Legacy
operation strings and failure text are re-sanitized when formatted, with malformed operations
reported as unparseable rather than breaking reporting. Redacted details reach the console and
run report; history keeps counts/reasons only. UTC, request ordering/lifetimes and stall evidence
support correlation, but ordinary artifacts cannot reproduce the exact focused image.

The operator-approved **PP3-only private exception** retains the focused media ID and UTC
action start through an external private handoff, never metrics JSONL or history. After the
short-suite child exits, the runner collects the handoff and removes its file/directory, even
on child failure. At campaign end, on success or failure, a separate `PP3 PRIVATE DEBUG`
section prints those IDs to the console and private temporary run report. PP4 has no exception.
No ID is collected for a failure before the existing degraded diagnostic is emitted; auth and
harness failures are not relabelled as degradation. Direct spec runs without a runner-created
handoff retain ordinary redaction. Temporary files are bounded and private (directory 0700,
file/report 0600) and rejected inside the repository. The terminal's `tee` output must also
remain private and outside the repository. Retain identity-bearing logs only until debugging
is complete, then delete them. Abrupt parent termination can leave a private handoff and can
prevent the final summary; cleanup is guaranteed for handled child completion/errors, not
force-kill. No historical artifacts are inspected or rewritten by this change;
it does not change workload revisions, timing clocks or PP3/PP4 degradation acceptance.

Density selection shares only the [exact-button/pressed-state guard](../e2e/README.md#density-selection-guard).
Keep its caller-owned clicks and waits inside their existing observation windows: the density
Table-transition epoch precedes selection, and P4 includes the ordinary helper's existing
restoration/results/cooldown waits. The extraction adds a Node Promise continuation but no
browser command or shifted boundary; unchanged operation order is not measured latency parity.
No workload revision or campaign follows from this extraction alone.

| Need | Owning reference |
| --- | --- |
| Current cases and readiness contracts | [Rendering](perf.spec.ts), [short responsiveness](perceived-short.spec.ts), [journeys](perceived-long.spec.ts), [density](density.spec.ts) |
| Metric/schema/aggregation rules | [Harness validation](harness-validation.mjs), [density reporting](density-reporting.mjs), [perceived metrics](perceived-metrics.mjs) |
| Trace producers and developer opt-in | [Perceived trace module](../src/lib/perceived-trace.ts) |
| Thumbnail observer definitions/limits | [Thumbnail probe](thumbnail-probe.mjs) |
| Functional proof discipline | [E2E guide](../e2e/README.md#continuity-slice-discipline) |
| Justified geometry and refactor decisions | [Justified plan](../exploration/docs/justified-density-prototype-plan.md) |
| Thumbnail arrival, buffer blocking and campaign evidence | [Scroll horizons plan and evidence ledger](../exploration/docs/scroll-horizons-thumbs-and-blocking.md) |
| Optional experimental probes | [Experiments spec](research/experiments.spec.ts), [experiment results guide](results/experiments/README.md) |

Experiments are separate, manually supervised diagnostics—not included in `--full`. Reuse their
methods selectively; do not turn experimental private hooks or weak readiness checks into
benchmark guarantees. Larger helper consolidation is a separate task.
