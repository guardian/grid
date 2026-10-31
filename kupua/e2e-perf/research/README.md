# Performance Research

Exploratory controls, counterfactual policies and diagnostics, separate from habitual
campaigns and maintained [measurement validation](../validation/README.md).
Research is not selected by `test:perf`, `--full`, `test:perf-app` or ordinary E2E.

The deployment [workplan](../../exploration/docs/zz%20Archive/deployment-probe-audit-workplan.md),
[audit matrix](../../exploration/docs/zz%20Archive/deployment-probe-audit-matrix.md) and
[measurement evidence](../../exploration/docs/zz%20Archive/deployment-probe-audit-workplan-evidence.md) are archived
historical references, not an active work queue. Use the [operator guide](../README.md)
and [measurement contracts](../measurement-reference.md) for current operation.

The [canonical delivery/signing assessment](../../exploration/docs/01%20Research/imgproxy-research.md#24-october-2026-canonical-delivery-and-pr-5075)
retains bounded browser evidence, comparison limits and explicit recommendations
for imgproxy PR #5075, with the later bounded configured-delivery comparison.
The [24 October fast/slow data](traversal-delivery-2026-10-24.json) contains the
completed `imgops`, `imgproxy-docker 3.31.1` and appended `imgproxy 4.0.19` arms:
three fast repetitions and one completion-paced pass each. The original two arms
are unchanged; `threeArmComparison` holds the expanded summary. HTTP-cache bypass, uncontrolled decoded/
upstream caches, different codecs/quality and per-image sample counts are explicit.

## Local Comparisons

`npm --prefix kupua run test:perf-research` runs the app-backed research controls
with mock metadata and synthetic/local media. It owns port3041, blocks services,
and writes no canonical campaign history. Select a question and focused test filter;
do not run the entire historical comparison matrix merely for orientation.

The spec retains B2 predictor/runway comparisons, boundary/compositor experiments,
native delayed-media cleanup comparisons and held-publication investigations.
These are evidence and reusable techniques, not selected production policies.
Detailed retained methods live in the [local control reference](controls.md).

The focused `--grep 'Table retained-row reference churn|Grid date work stays'`
controls reuse the shared journey/thumbnail probes, media readiness and driver
with mock data and synthetic media. Table guards entering-row-scaled rendering
and field access with ordinary memoization; its diagnostic semantic comparator
must offer no additional reference-churn reuse after the production repair.
Grid guards cell-local date work and its absence in image-only Justified cells.
The same control directly counts GridCell renders and retained-prop comparisons;
unchanged retained inputs must skip, with rendering scaled to entering images.
These are not live/hosted frame-speed claims. They own their browser/contexts;
the operator-shared app and server are not used or reconfigured.

### Backward Metadata Acceptance

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

### Current Publication Identity

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

### Local HTTP Retention Value

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

### Table Request Lifetime

The focused `--grep 'F2 Table'` controls qualify Table's detached-incomplete request
lifetime using production cleanup versus a fixture-only cleanup-disabled counterfactual.
They reuse the held-image,
scroll/readiness and journey/thumbnail/request probes, with bounded ephemeral ownership
association. The first desired-release assertion failed against production Table;
retained baseline arms now assert that historical behavior explicitly. Two-order forward
pressure arms and one bounded short-reversal pair retain readiness, repeated-request and
cancellation costs. Results live under `f2TableOwnership20261025` in the existing
[evidence record](../../exploration/docs/scroll-horizons-thumb-lookahead-results.json)
and [Table qualification](../../exploration/docs/scroll-horizons-thumbs-and-blocking.md#table-ownership-qualification-25-october-2026).
These synthetic controls do not certify live/canonical performance; the selected product
policy remains detached-incomplete release, not a new admission scheduler.

### P13b Return Attribution

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

## Legacy Experiments

`npm --prefix kupua run test:experiment` retains the separately supervised tuning
spec. It can access real infrastructure: session-specific permission, explicit
bounds and operator coordination are required. Existing comments do not authorize
source changes, server restarts, campaigns, dry runs or live reads. The existing
[experiment results guide](../results/experiments/README.md) owns its older records.

Ignored embedded-browser runners under Kupua's `.vite` directory are temporary,
not supported campaign entry points. Keep identities, URLs and credentials out of
saved evidence; retain sanitized aggregates in the owning research record only.

## Graduation Rule

Each useful investigation ends with an explicit destination: a maintained campaign
signal, a deterministic detector/control in validation, or a documented one-off.
Important scrolling questions must not remain answerable only by forgotten probes.
Habitual campaigns use shared drivers/probes in the parent directory and must never
import research. A finished research control can remain dormant without pretending
it is an everyday supported workload. Do not delete historical evidence or silently
mix measurement revisions, transport profiles or cache conditions.