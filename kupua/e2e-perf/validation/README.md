# Measurement Validation

Deterministic checks for maintained performance measurements. These do not record
live campaign history or measure the operator's infrastructure. Product correctness
regressions belong in [ordinary E2E](../../e2e/README.md).

Run from the repository root with the standing foreground pipefail/tee wrapper:

| Command | Coverage |
| --- | --- |
| `npm --prefix kupua run typecheck:perf` | Strict performance TypeScript surface |
| `npm --prefix kupua run test:perf-harness` | Full offline gate: contracts, calculations, history, observers **and dashboard-data tests** |
| `npm --prefix kupua run test:perf-dashboard` | Focused dashboard-data alternative, not an additional full gate |
| `npm --prefix kupua run test:perf-fixtures` | Synthetic browser observers and dashboards |
| `npm --prefix kupua run test:perf-app` | Actual renderers with mock metadata and local media |

For an immediate touched slice, pass native Node options **before** explicit file paths
(relative to Kupua) through `test:perf-harness:focus`. The full gate discovers only
`validation/*.test.mjs`; do not append another dashboard run to it. For example:

```bash
set -o pipefail; npm --prefix kupua run test:perf-harness:focus -- --test-name-pattern='PP3 private|P14 aggregation' e2e-perf/validation/harness-validation.test.mjs 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua run test:perf-fixtures -- dashboard-navigation.spec.ts --grep 'traversal' 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

Keep local-dashboard validation proportionate: use a focused model/browser regression
for changed behavior and a visual review for presentation. Do not expand coverage or
run full harness/fixture suites by default for dashboard labels, layout or summaries.
Reserve full gates for changes to measurement contracts, observers, aggregation or
history publication machinery, or an explicitly requested sweep. Existing app unit/E2E
requirements are unchanged. Run `test:perf-app` only when actual-renderer validation or
its helpers change, not for offline/dashboard-only edits. No campaign or perf run is
part of this validation. Retained controls and the latest bounded reduction evidence
are in the [evidence document](../../exploration/docs/zz%20Archive/deployment-probe-audit-workplan-evidence.md#perf-validation-simplification).

The app checks own port3041 and block live/service traffic. Coordinate the port;
never stop a shared app implicitly. Browser checks run unsandboxed. Tests have no
retries; failing detectors or changed semantics must not be repaired by weakening
assertions. Calibration must detect deliberately better and worse conditions.

Agent compiler validation must use an unsandboxed `typecheck:perf` run and confirm
the pipeline exit status. A silent sandboxed invocation previously missed a real
TS5097 preflight failure; npm banners without diagnostics are not sufficient proof
that compilation passed. This remains a local compiler check, not campaign authority.

The current controls include fixed load-band extremes, browser/controller clock
separation, timestamp-cut network accounting, remembered foreground interruption,
native ready/held/released images, actual constrained delivery and representative
Grid/Justified/Table directions/regimes. None is an operator campaign or a claim
about real-photos/CDN/native-trackpad performance. Research comparisons are separate.

Exploratory comparisons now live in [research](../research/README.md), not this
validation command. The [main README](../README.md) owns habitual campaign operation.