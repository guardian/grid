# Measurement Validation

Deterministic checks for maintained performance measurements. These do not record
live campaign history or measure the operator's infrastructure. Product correctness
regressions belong in [ordinary E2E](../../e2e/README.md).

Run from the repository root with the standing foreground pipefail/tee wrapper:

| Command | Coverage |
| --- | --- |
| `npm --prefix kupua run typecheck:perf` | Strict performance TypeScript surface |
| `npm --prefix kupua run test:perf-harness` | Offline contracts, calculations, history and observers |
| `npm --prefix kupua run test:perf-fixtures` | Synthetic browser observers and dashboards |
| `npm --prefix kupua run test:perf-app` | Actual renderers with mock metadata and local media |

The app checks own port3041 and block live/service traffic. Coordinate the port;
never stop a shared app implicitly. Browser checks run unsandboxed. Tests have no
retries; failing detectors or changed semantics must not be repaired by weakening
assertions. Calibration must detect deliberately better and worse conditions.

The current controls include fixed load-band extremes, browser/controller clock
separation, timestamp-cut network accounting, remembered foreground interruption,
native ready/held/released images, actual constrained delivery and representative
Grid/Justified/Table directions/regimes. None is an operator campaign or a claim
about real-photos/CDN/native-trackpad performance. Research comparisons are separate.

Exploratory comparisons now live in [research](../research/README.md), not this
validation command. The [main README](../README.md) owns habitual campaign operation.