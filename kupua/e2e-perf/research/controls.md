# Local Control Reference

[Research entry point](README.md). Retained methods from earlier investigations, not habitual campaign workloads. The validation commands listed in the retained reference remain owned by [validation](../validation/README.md); exploratory comparisons use the research command.

## Local validation

These are safe local checks, not live campaigns:

```bash
npm --prefix kupua run typecheck:perf
npm --prefix kupua run test:perf-harness
npm --prefix kupua run test:perf-fixtures
npm --prefix kupua run test:perf-app
```

They cover pure parsing/reporting contracts, synthetic browser/dashboard behaviour, and the
actual app with in-memory data in indexed/seek modes. The app-backed check requires **port3041
free**, starts its own isolated frontend and blocks external/service HTTP. It uses no live API
or ES and writes no benchmark history. Synthetic observer tests alone do not prove app setup.

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
Use `--grep 'F2 '` with either local fixture command for that focused surface. The canonical
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

### Buffer Bounds and Final-Viewport Controls

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
