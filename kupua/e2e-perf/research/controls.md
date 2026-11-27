# Experiment Control Recipes

[Laboratory procedure and execution](README.md) | [Findings and follow-up](experiments.md)

Choose a recipe for a specific question. This is a reference, not a task queue or
an instruction to run every historical comparison. Filters below use
`test:perf-research` unless another script is named. Shared detector checks remain
owned by [validation](../validation/README.md); product regressions belong in ordinary E2E.

| Question or method | Recipe |
| --- | --- |
| Temporary cells during forward eviction | [Justified selection](#justified-forward-eviction-selection) |
| Table reset bookkeeping | [Pagination reset](#table-pagination-reset-counterfactual) |
| Table synchronous layout attribution | [Scroll layout scope](#table-scroll-layout-attribution) |
| Already-repaired cell/render work | [Rendering reuse](#rendering-reuse) |
| Earlier backward metadata admission | [Backward acceptance](#backward-metadata-acceptance) |
| Omission, replacement and retained elements | [Publication identity](#current-publication-identity) |
| Whether retention helps actual local delivery | [HTTP retention value](#local-http-retention-value) |
| Detached pending Table images | [Request lifetime](#table-request-lifetime) |
| Return from detail to the list | [Return attribution](#p13b-return-attribution) |
| Clipped input, recovery, geometry and pixels | [Bounds and viewport controls](#buffer-bounds-and-final-viewport-controls) |
| Native phone traces and earlier delivery/tuning studies | [Other methods](#other-methods-and-historical-references) |

Historical labels in filters/evidence: **B2** means backward metadata prediction;
**F2** means image-request lifetime/delivery; **C** retains a cohort with unchanged
keys, **CK** also supplies stable fixture keys; **P13b** is return from detail.
An arm labelled `current` can mean the baseline at the time of that experiment,
not today's shipped policy. Read the recipe before interpreting a comparison.

## Fixture Boundaries

The isolated app runs on port 3041 with in-memory metadata and blocked services.
It writes no campaign history. Synthetic observer tests alone do not prove app setup.

The F2 request-lifetime controls additionally own disposable loopback HTTP servers on
OS-assigned ports through the [shared held-image fixture](../../e2e/shared/held-image-fixture.ts). They use synthetic
media/data only, not the shared app or TEST. Controls cover native cancellation, coalesced
consumers, completed cache, stale decisions, HTTP1 capacity, fetch/blob limitations and the
actual S3-proxy handler with a fake S3 client. No AWS credentials or SDK operations are used.

Functional lifecycle checks live in [ordinary E2E](../../e2e/local/thumbnail-lifecycle.spec.ts),
without performance probes or thresholds. Research comparison arms explicitly remove the cleanup
effect while retaining current rendering; they are a no-cleanup counterfactual, not a frozen
historical checkout. The separate two-order delayed-media comparison matches initial window/runway,
exact applied distance and the full final visible cohort; it is not a canonical campaign or proof
of live/hosted benefit. Native HTTP-cache reuse is tested separately without Playwright routing,
which disables that cache. Findings and limitations belong to the
[delivery decision](../../exploration/docs/scroll-horizons-thumbs-and-blocking.md#delivery-options-decision).
Use `--grep 'F2 '` with `test:perf-fixtures` or `test:perf-app` for that validation surface. The canonical
density manifest and operator campaign runtime are unchanged.

App fixtures default to DPR1; the normalized Justified forward seek case explicitly uses
DPR2 and validates the captured scale through the record schema. `devicePixelRatio` is a
positive finite display scale, not a normalized exposure fraction bounded by one.

Fixed-grid probes account for KUP-042's partial first rows: a seek window's row origin
is `floor(bufferOffset / columns)`, not `bufferOffset / columns`. P17 derives columns
from container width (a rendered row may be partial), positions setup outside the
backward threshold using the buffer phase, and excludes origin compensation from
logical direction. Focus-position diagnostics use the same global-row convention.
Offline serialized-callback regressions cover the captured 200-image prepend, every
row phase across narrow/wide grids, historical aligned prepends and genuine forward
movement. Local density fixtures require complete pages and exact buffer capacity;
maintenance positioning uses the published layout geometry. These repairs do not
relax direction assertions, change product behavior or rewrite benchmark history.

## Justified Forward Eviction Selection

Select `--grep 'Justified forward eviction: mapped-selection'` with
`test:perf-research`. This reuses the existing capacity/publication fixtures at
1200x999/DPR2, mock metadata and synthetic media. One controlled forward eviction
occurs during fixed-distance scrolling. Both arms intercept the supported
`rangeExtractor`; admission, keys, overscan and compensation remain unchanged.

The candidate maps the last committed rendered IDs into the new geometry until
the existing scroll compensation changes the physical offset, then releases to
ordinary selection. It replaces selection rather than adding a retained-row union.
Default/candidate/candidate/default uses fresh contexts and checks identical final
visible IDs/geometry, input distance, bounded count, focus, one eviction and release.
Mutation counters distinguish repeated identities and short-lived inserted cells.

These diagnostics include endpoint inspection and DEV behaviour, not
production-task or painted-frame attribution. Lower whole-controller TaskDuration
alone does not establish a useful gain. See the
[experiment disposition](experiments.md#justified-publication-hitches) before
reusing this rejected recipe. The previous key-only diagnostic was superseded,
not duplicated as another permanent case; both outcomes remain under
`scrollReconPortfolio20261117` in the
[existing evidence record](../../exploration/docs/scroll-horizons-thumb-lookahead-results.json).

## Table Pagination Reset Counterfactual

Select `--grep 'Table scrolling pagination reset'` with `test:perf-research`.
This standalone case intercepts only the isolated app's Table module, exposes its
existing instance to a pass-through counter and supplies either the library default
or `autoResetPageIndex: false`. No product source, live service or campaign history
is changed. It reuses the fixed 400-image metadata window, warmed synthetic media,
row counter and scrolling driver; the viewport is 1200x999 at DPR2.

The order is default, disabled, disabled, default. Each arm starts at the top and
travels 2560px at the reference 100-results/s calibration, without metadata
publication or physical clamping. Checks retain equal endpoint rows/text/styles,
focus, data identity and page index. The positive control must actually reset;
the disabled arm must make no reset or pagination update. No speed threshold is
asserted, and this is not a product regression suite.

The [experiment record](experiments.md#pagination-reset-no-demonstrated-benefit)
owns the observations and unselected outcome.

Render counts include development-mode behaviour. CDP duration deltas span the
whole controller window, including setup and endpoint inspection, not just motion;
they are diagnostics, not user-visible latency or a production speed comparison.
The fixture does not reproduce hosted photo delivery, exact deployed code or every
position-preservation path. Do not extrapolate these observations into a hosted
speedup, regression or acceptance threshold.

## Indexed Grid Backward Runway

The dated comparison and exclusions live at `localIndexedGridBackward20261122`
in the [research record](../../exploration/docs/scroll-horizons-thumb-lookahead-results.json).
Start on local indexed Search with more than 1,000 matches. Use stock Grid,
confirm the API datasource, and calibrate visible global indices from several
mounted row positions **and their actual resident IDs**. Seek away and back
between arms. Require the same initial 200 IDs, buffer offset, scroll position,
speed, travel and mounted endpoint identity; reject stale or unsettled captures.

Compare normal/early/early/normal at 100 results/s for 300 results. For the
counterfactual only, call the existing guarded backward read once per offset at
90 results of remaining runway during actual upward travel. Measure requested
and achieved distance, starts and publications, partial/fully outside logical
coverage, real-cell hit tests, frame gaps and image demand. Challenge with the
same start but stop after 30 results; keep this arm separate. Count extra pages
even if they finish after motion. Never use a changed buffer limit or an eager
image hint as a substitute. This tab-local experiment is not a permanent driver
or a recommendation to ship a fixed threshold of 90.

## Table Scroll Layout Attribution

Select `--grep 'Table scrolling layout scope'` with `test:perf-research`. One case
reuses the isolated 400-image window, warmed synthetic media and density driver at
1200x999/DPR2. It scrolls 2560px forward and then back to zero at the reference
100-results/s calibration. Both directions check exact achieved endpoints, no
clamping/publication, unchanged data/focus and foreground visibility.

User-timing marks bound each motion plus one settling animation frame; setup,
source lookup, endpoint inspection and trace processing lie outside those marks.
CDP `ReportEvents` batches retain only allowlisted events, capped at 50,000, and
reject reported trace loss. No screenshot category, raw recording or campaign
history is written. Exact signed endpoints must pass before interpreting reversal.

The narrowest enclosing traced `FunctionCall` locates the callback triggering Layout;
look up the exact Vite-served module rather than assuming trace line numbers match
TypeScript source. These are inclusive callback attributions, not sampled CPU stacks
or identification of the dirtying writer. Paint-related union includes PrePaint/layer
work, not just Paint events. Layout scope flags and dirty-object counts do not prove
that every object was recomputed or that retained rows repainted.

The [experiment record](experiments.md#layout-attribution-trigger-located-writer-unknown)
owns observations, exclusions and the remaining attribution question. Do not change
shared geometry reads merely because they force layout after virtualizer updates.

This is DEV/StrictMode, synthetic warm media and programmatic scrolling, not a
hosted production speed comparison or physical presentation measurement. Journey
and bounds observers remain enabled; callback attribution does not prove observer
neutrality. Directional totals with different mounted populations are not
equal-work optimisation arms. No speed threshold or
product policy is selected by this diagnostic.

## Rendering Reuse

The focused `--grep 'Table retained-row reference churn|Grid date work stays'`
controls reuse the shared journey/thumbnail probes, media readiness and driver
with mock data and synthetic media. Table guards entering-row-scaled rendering
and field access with ordinary memoization; its diagnostic semantic comparator
must offer no additional reference-churn reuse after the production repair.
Grid guards cell-local date work and its absence in image-only Justified cells.
The same control directly counts GridCell renders and retained-prop comparisons;
unchanged retained inputs must skip, with rendering scaled to entering images.
These are not live/hosted frame-speed claims. They own their browser/contexts;
the operator-shared app and server are not used or reconfigured. The
[completed repairs](../../exploration/docs/scroll-horizons-thumbs-and-blocking.md#completed-render-repairs-and-retained-evidence)
retain the results; do not assume their historical bottlenecks remain unfixed.

## Backward Metadata Acceptance

`--grep 'B2 acceptance '` selects Table short-stop, negative-control, pressure and
capacity/reversal comparisons in both orders, plus settled far-seek comparisons for
Grid, Justified and Table. These reuse the isolated app and existing journey/media
probes; no live services or canonical campaign histories are accessed.

It also selects `B2 acceptance product short-stop` for all three layouts. These
cases keep product admission unmodified, delay metadata through the stop, and check
bounded reads, logical-anchor placement through publication and eventual readiness.
They do not require element retention or completion by first decode. The comparison
adapters explicitly restore historical threshold 50 for their `current` arms and
retain the all-layout candidate separately; `current` in those historical controls
does not mean today's shipped Grid/Table policy. Publication identity/retention
controls likewise retain their original threshold-50 admission.

The stopped Table witness retains raw movement but separates animated CSS translate
from layout position, with an independent 8px displacement calibration and unchanged
1px layout limit. It preserves first-ready censor/pending metrics while checking
bounded stopped work, stable placement and no continuing idle chain. One extra page
need not finish by first decode. The existing
[evidence record](../../exploration/docs/scroll-horizons-thumb-lookahead-results.json)
under `b2QualificationClosure20261025` also retains separately authorised canonical
comparisons and the late-publication readiness witness; synthetic success is not a
canonical/paint certificate or selected product policy.

## Current Publication Identity

`--grep 'Publication identity current '` selects the held-backward-publication tests
for Table, fixed Grid and Justified. They use original admission, keys and scroll
writes, with isolated mock data and synthetic decoded media. Fixture-only render
tokens and a read-only witness in the existing compensation layout effect correlate
actual committed DOM with chosen virtual rows. Original image references and mutation
records distinguish absent photographs, element replacement and source changes.
After-measurement controls distinguish removal, same-node reinsertion and cloning.
These are not paint, latency or all-regime retention guarantees. Accepted observations
and proposed next questions are `publicationIdentityCurrent20261025` in the existing
[evidence record](../../exploration/docs/scroll-horizons-thumb-lookahead-results.json).

`--grep 'Publication retention Table C'` selects the fixture-only exact-cohort
`rangeExtractor` counterfactual, preserving product keys, compensation and admission.
It checks original-element survival through every captured commit, bounded extra
rows, latched release and subsequent scroll without stale retention or extra reads.
Separate post-measurement controls expose constant-count extractor memoization and
Table's sparse-window cache collision; they do not silently repair either boundary.
Results and limitations are `publicationRetentionTableC20261025` in the same record.
This is supporting B2 fast-scroll research, not a product fix or timing/paint claim.

`--grep 'Publication retention (grid|justified) C'` selects both C (unchanged keys)
and CK (stable fixture keys) for Grid and Justified. Mapped-row selection is isolated
from parent/cell identity, with original and first-publication-created image refs,
between-commit removal tracking, stable-parent/unique-key guards and latched release.
CK Grid preserves physical-column cells and keys global physical rows; CK Justified
uses unclamped packed-row-start ordinals and image-ID cells from setup onward.
Use `--grep 'Publication identity current |Publication retention '` for all eight
related cases. `publicationRetentionGridJustified20261025` owns results and limits.
These loaded-media mechanism controls do not measure native-readiness or fast-scroll
benefit, and one density's outcome does not decide another density's eligibility.

## Local HTTP Retention Value

`--grep 'Retention value '` selects the 16-case current/B2/CK value matrix, including
pressure-only CK-inner comparisons. Narrow to a named layout/workload/order when
answering one question. These are isolated research tests, not operator campaigns;
the final matrix took about seven minutes. All media comes from the existing
ephemeral loopback held-image server, with immediate setup and delayed new media.
Metadata, starting window/placement and both policy orders are explicit.

Observers continue beyond first-ready through late publication and keep loaded
pending separate from node-bound decode acknowledgement. Weak image/cell identity
witnesses avoid strong-reference resource retention; DOM-presence guards distinguish
collected references from actual surviving elements. Pressure cases first require
observed current-policy blocking and its B2 reduction. Capture validity and candidate
preservation failures are separate: failures remain reported, not silently fixed.
CK-inner checks only loss under unchanged cell/parent, not universal row preservation.

The existing evidence record's `retentionValueLocalHttp20261025` owns all 52 final
observations, prior exclusions/refutations, fixed observation windows, frame/request
contracts and per-layout interpretation. Earlier strong-reference development runs
are not pooled. Passing captures do not select retention for production or establish
canonical-photo, cache-neutral, population-tail or painted-frame benefit.

## Table Request Lifetime

The focused `--grep 'F2 Table'` controls qualify Table's detached-incomplete request
lifetime using production cleanup versus a fixture-only cleanup-disabled counterfactual.
They reuse the held-image, scroll/readiness and journey/thumbnail/request probes,
with bounded ephemeral ownership association. The first desired-release assertion
failed against production Table; retained baseline arms now assert that historical
behavior explicitly. Two-order forward pressure arms and one bounded short-reversal
pair retain readiness, repeated-request and cancellation costs. Results live under
`f2TableOwnership20261025` in the existing
[evidence record](../../exploration/docs/scroll-horizons-thumb-lookahead-results.json)
and [Table qualification](../../exploration/docs/scroll-horizons-thumbs-and-blocking.md#table-ownership-qualification-25-october-2026).
These synthetic controls do not certify live/canonical performance; the selected product
policy remains detached-incomplete release, not a new admission scheduler.

## P13b Return Attribution

`--grep 'P13b resident return attribution production-regression'` runs the focused
retained-cell/placement regression. The broader named cases retain probe on/off,
CPU and warmed-return diagnostics, four production remeasurements and a tracing-disabled
pair; choose the unanswered question rather than replaying the entire matrix.
Controls reuse the existing perf spec's function bodies through AST extraction, never
importing/executing its live tests. Mock resident data, decoded synthetic media and the
real Backspace/history/return path stay fixed; only sanitized trace/CPU aggregates leave
memory. Historical callback identity is a narrowly intercepted counterfactual, not an
old checkout. Exact focus/placement checks remain strict. Results and exclusions are
`p13bReturnAttribution20261025` in the existing research JSON and owning scroll guide.

## Buffer Bounds and Final-Viewport Controls

`scrollAtSpeed(page, density, speed, duration, { measureBounds: true })` optionally returns
`physicalClampMs`, `bufferEdgeBlockedMs` and `clampedDistancePx`. These account for the
portion of commanded constant-speed travel clipped by the physical scroll extent. The time
is clipped distance divided by commanded speed, not native wheel latency or frame-jank time.
`bufferEdgeBlockedMs` counts only seek-mode limits with more results beyond the relevant
buffer edge; true result ends and indexed physical limits are not temporary buffer walls.
Missing regime or required coverage evidence is rejected rather than reported as zero.
Per-frame rounding is distinct from boundary clipping. Raw scroll-origin compensation is
not counted as commanded movement. Use this only with a stable query/density/regime.

The default driver result is unchanged. Revision-3 D1/D2 and D9 enable bounds observation
and emit the aggregate fields into normal histories/dashboard series. The internal
`stoppedAtPerformanceMs` timestamp establishes the recovery clock and is not persisted.

`boundsCaptureRevision: 1` adds constant-space temporary-wall episode accounting:
`bufferEdgeEpisodeCount`, `bufferEdgeEpisodeMaxMs`, `bufferEdgeEpisodeCompletedCount`,
`bufferEdgeEpisodeCompletedMaxMs` and `bufferEdgeEpisodeCensoredCount`. Episode duration
uses the animation-frame clock, with first contact estimated from clipped travel; it is
distinct from summed clipped-input time. A wall still open at a stop, reversal or D10
phase boundary is censored. Its observed maximum is a lower bound; the completed maximum
is null when none completed. D9 combines directional counts/maxima without pretending a
reversal released the old wall; D10 retains phase-specific observations. Do not sum phase
counts as unique physical walls. True ends and indexed physical limits remain excluded.
The dashboard also exposes the existing `placeholderAreaRatioMean` separately from
thumbnail-only exposure, since indexed missing-data slots need not block movement.

Local distance-bound controls may pass `maxDistancePx` to `scrollAtSpeed`; it stops at the
driven-distance endpoint or the existing time deadline, whichever comes first. Check achieved
distance explicitly, since clipping can prevent reaching it. Optional `captureSteps` retains
at most2,048 timestamped cumulative applied-input samples, excluding external compensation;
overflow rejects the capture and default return fields remain unchanged. Recovery's local duration,
distance and post-stop observation options leave canonical D9 defaults unchanged. Temporary
B2 policy substitution exists only in intercepted fixture responses: both arms use current
policy through matched setup, then reset velocity before the measured candidate is activated.
Do not interpret setup refills or compare different initial buffers as workload effects.

The local `latency-*` comparisons have their own contract: 400ms versus1000ms lookahead,
not the original backward50 baseline. Ready-runway cases load one extra page in BOTH setups;
entry/short-stop cases do not. Do not treat setup runway as a free production policy or pool
the labels across workloads. To validate this research plus the non-comparison app surface
without replaying the original20 comparisons, use:

```sh
npm --prefix kupua run test:perf-research -- --grep-invert 'B2 local (grid|justified) (short-stop|sustained-fast-delivery|sustained|reversal|capacity-reversal) ' --max-failures=1
```

Use the prescribed foreground pipefail/tee wrapper. Unfiltered app runs include all comparisons.
The bounded retained-visible observer calibrates an8px displacement/resize before measurement,
restores CSS and clears calibration samples. It compares adjacent-frame identities, size,
horizontal position and non-common vertical displacement, and audits visible aspect ratios.
It cannot detect equal movement of the entire viewport or every compositor frame. New negative
controls may retain explicit censored endpoints with null readiness; that is an adverse result,
not a passing product outcome. Original comparison assertions remain strict. Observer revisions,
calibration intervention and timing/readiness results must remain separately identified.

Synthetic controls cover both directions, true edges, indexed limits, idle/free movement,
partial clipping and missing context. App-backed Grid/Justified controls hold a single
in-memory refill, measure blocked input, release it and verify resumed travel, one admitted
read and unchanged stopped-image placement. They are observer/ownership controls, not a
comparison of prefetch policies or real network timings.

Backward publication controls also follow a bounded already-visible cohort through node
replacement, loaded state and animation-adjusted position. The moving capacity case correlates
those samples with applied input, not raw scrollTop travel. SVG/JPEG and stopped/moving controls
use only local fixture media. CDP request counts cover the whole window; routing/cache conditions
are not production cache behavior. Separate JPEG pixel controls calibrate against a hidden image
and keep screenshots in memory. An overlap-censored capture cannot certify pixels during a
pending decode, and screenshot-intervened timings must not be pooled with ordinary controls.

Marked-thumbnail compositor controls start capture before publication, bounded to 128 PNG
frames/16 MiB. Complementary color patches and a position cross distinguish content changes
from displacement; synthetic and in-app positive controls must pass before interpreting results.
Exclude injected calibration intervals from normal cohort assertions and restore owned CSS
value/priority. A changed fixed screen point may belong to a moved/resized image: inspect the
identity/geometry witness before calling it a wrong-source flash. Sparse event-driven captures
do not certify every physical display frame. Repeat-image delay controls must report whether
the intended requests occurred; an unexercised hold is not successful delay-tolerance evidence.

The `true-ratio-boundary` control intercepts one layout module response to compose new true-ratio
rows around retained known rows in a single block. It checks both calibrated old-image pixels
and all loaded-box ratios. This is not the rejected square-slot freeze and implements no general
fragment lifecycle, release policy or production packing change. Keep the helper fixture-only;
incomplete rows, navigation, repeated arrivals and bounded ownership need separate proof.

`visibleMediaReadiness` also has local stopped-viewport controls: a held destination stays
censored, and releasing it permits decoded readiness without waiting for obsolete off-screen
media. Same-origin and separate-origin URLs are intercepted locally; this proves observer
compatibility, not HTTP scheduling, cancellation, bandwidth savings or CDN performance.
The media observer alone does not establish missing-result-data readiness or a pinned
destination. D9 separately establishes stable visible identities/data, rejects scope changes,
and censors recovery if the visible identity set changes during media observation.

## Other Methods and Historical References

### Physical Android Chrome Measurements

The [measurement kit](mobile-perf-measurement/README.md) provides an explicit native
recorder, offline cost/motion analyzer and a step-by-step usage guide. The
[Scrubber case study](mobile-perf-measurement/case-study.md) preserves the reasoning
and reviewed aggregates, not recordings or a future benchmark baseline.
These standalone commands are not selected by any campaign or `test:perf-research`.
No binary, captured data, device-specific driver or new dependency is bundled.

### Image Delivery Comparisons

The [canonical delivery/signing assessment](../../exploration/docs/01%20Research/imgproxy-research.md#24-october-2026-canonical-delivery-and-pr-5075)
retains bounded browser evidence, comparison limits and explicit recommendations
for imgproxy PR #5075, with the later bounded configured-delivery comparison.
The assessment also describes the 24 October fast/slow comparison of `imgops`,
`imgproxy-docker 3.31.1` and `imgproxy 4.0.19`: three fast repetitions and one
completion-paced pass each. HTTP-cache bypass, uncontrolled decoded/upstream
caches, different codecs/quality and per-image sample counts are explicit.
The per-run JSON dataset referenced by those older notes is not present in this
checkout. Use the retained assessment; do not assume the raw observations are available.

### Legacy Experiments

`npm --prefix kupua run test:experiment` retains the separately supervised tuning
spec. It can access real infrastructure: session-specific permission, explicit
bounds and operator coordination are required. Existing comments do not authorise
source changes, server restarts, campaigns, dry runs or live reads. The existing
[experiment results guide](../results/experiments/README.md) owns its older records.

Ignored embedded-browser runners under Kupua's `.vite` directory are temporary,
not supported campaign entry points. Keep identities, URLs and credentials out of
saved evidence; retain sanitised aggregates in the owning research record only.

The deployment [workplan](../../exploration/docs/zz%20Archive/deployment-probe-audit-workplan.md),
[audit matrix](../../exploration/docs/zz%20Archive/deployment-probe-audit-matrix.md) and
[measurement evidence](../../exploration/docs/zz%20Archive/deployment-probe-audit-workplan-evidence.md)
are archived historical references, not an active work queue.
