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