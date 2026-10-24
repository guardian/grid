# Performance Research

Exploratory controls, counterfactual policies and diagnostics, separate from habitual
campaigns and maintained [measurement validation](../validation/README.md).
Research is not selected by `test:perf`, `--full`, `test:perf-app` or ordinary E2E.

## Local Comparisons

`npm --prefix kupua run test:perf-research` runs the app-backed research controls
with mock metadata and synthetic/local media. It owns port3041, blocks services,
and writes no canonical campaign history. Select a question and focused test filter;
do not run the entire historical comparison matrix merely for orientation.

The spec retains B2 predictor/runway comparisons, boundary/compositor experiments,
native delayed-media cleanup comparisons and held-publication investigations.
These are evidence and reusable techniques, not selected production policies.
Detailed retained methods live in the [local control reference](controls.md).

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