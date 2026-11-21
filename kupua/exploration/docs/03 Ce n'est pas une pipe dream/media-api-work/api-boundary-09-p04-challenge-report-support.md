# P04: approved candidate-challenge report support

**Date:** 19 September 2026. **Execution class:** strong, coordinator-authored.
**Authority:** the operator explicitly approved the exact report-path exception after D005 was raised.
This is an implementation receipt for administrative tooling, not an independent review or product change.

## 1. Decision

Accept the bounded D005 repair. The exception requires the exact protocol-designated challenge
report, `role: "candidate-challenge"` and `executionClass: "strong-independent"` together.
No other 10/11/12-series packet reports are admitted. Existing 09-series behavior is unchanged.

## 2. Material Findings

The [packet guard](../../../experiments/api-boundary/api-boundary-review.mjs#L192) previously
rejected the designated final challenge report. The added condition is an exact-path exception,
not a widened series prefix. The [new tests](../../../experiments/api-boundary/api-boundary-review.test.mjs#L216)
exercise the permitted assignment, missing/wrong role, non-independent/mechanical class, another
12-series filename, and 10/11-series output. The valid assignment still cannot close while ready
or while its accepted report is absent. No coverage, evidence, dependency or acceptance gate changed.

## 3. Coverage Receipt

| Input | SHA-256 | Actual scope |
|---|---|---|
| [Validator](../../../experiments/api-boundary/api-boundary-review.mjs#L186) | `7c1d2247138c79a55ea7efd6b1dc1d31ef65ddc2647bf30a4e23c80f7d0d254d` | Lines 186-201: packet validation and completion guard. Remaining source was not newly audited in P04. |
| [Tests](../../../experiments/api-boundary/api-boundary-review.test.mjs#L216) | `81f47c81ba8d0fbf6bbabb63e42d2fcdf420eab0e8ab820bc3973583dd045263` | Lines 216-252: new cases authored/read; entire isolated 44-case suite executed. Other assertions were not newly semantically audited in P04. |

These excluded administrative inputs keep null hashes and no application receipts in the inventory.
P03's earlier fingerprints and test counts remain accurate for its earlier reviewed version.

## 4. Evidence Dispositions

No performance or application claim changes. E001-E008 retain their original sources and scope.
E008's transitional D005 wording can now state that the exception is separately approved and tested;
this does not make corpus coverage complete or authorize candidate drafting before its gates.

## 5. Integration

Coordinator records P04 accepted and D005 resolved, with P04 ownership. Update active protocol/prompt
instructions with the exact role key and path restriction; preserve earlier reports and existing plans.
D001-D003 remain open. No independent-verification credit or application file reading is added.

## 6. Checks and Limits

Executed twice from repository root with the prescribed foreground pipeline and native-worker
sandbox exception: `npm --prefix kupua run test:api-boundary` through `tee` with `pipefail`.
Before repair: 43 pass, one expected failure (`P01: report outside packet series`) in the positive
challenge test. After repair: 44 pass, zero failures/skips/cancellations. Scoped editor diagnostics
also reported no errors; they are not substitutes for the executed suite.

No app, browser, product suite, performance campaign, live system or Git mutation was used.
This focused test surface is not an exhaustive validator audit. Administrative closure is distinct
from the complete corpus review, deployment readiness and adoption of any candidate plan.