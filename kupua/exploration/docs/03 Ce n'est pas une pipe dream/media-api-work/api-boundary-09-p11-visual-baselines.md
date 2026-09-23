# P11: whole-image baseline receipts

**Date:** 19 September 2026. **Execution class:** strong, coordinator-authored.
**Authority:** explicit operator approval of D022's narrow PNG visual-receipt extension.
This is administrative implementation evidence and offline visual inspection, not an independent
review, current UI test result, new performance measurement or candidate architecture.

## 1. Decision

Accept P11 and close D022. All four retained original PNGs were individually viewed in full with
the local image-viewing tool, at their unchanged fingerprints. Each file is 1280 x 720 pixels.
Their status can become `read` using `method: "visual"`, `extent: "whole-image"`; none is `verified`.
They remain required test-expectation data, not exclusions used to force closure.

## 2. Findings

| Capture | Whole-image observation | Limit |
|---|---|---|
| Grid | Search/filter/sort toolbar, result-summary strip, view controls and four-column tiles are visible. Tiles show missing-thumbnail placeholders, caption/date layout and warning badges. | Not evidence of delivered photographs or all off-viewport content. |
| Table | The shared toolbar sits above a dense metadata table, column headers, row text and warning badges. The viewport clips further horizontal/vertical content. | No row values, captions, contact or contributor details are transcribed; this is not a table-data correctness check. |
| Detail | Back-navigation/position header, a large unavailable-preview area and a right metadata/rights sidebar are visible. | The capture explicitly represents absent image preview, not successful image delivery; off-viewport metadata is uninspected. |
| Query | A populated query field and alternate date-sort state sit above a narrower result summary and the same tiled missing-thumbnail presentation. | Not evidence that today's query parser, results or sorting match this historical capture. |

These are recorded expected states, including fallback presentation. No current runtime failure is
inferred from their placeholders, and no current success is inferred from their existence. The
existing screenshot consumer was already read during P08/coordinator integration; it does not turn
this offline viewing into an executed pixel comparison. No command displayed inside a capture ran.

The [receipt guard](../../../experiments/api-boundary/api-boundary-review.mjs#L224) now requires an
explicit whole-image declaration and a strong reviewer for current binary PNG inputs. Hash-only,
structural, cropped, mechanical and fake binary full-text declarations cannot close this coverage.
[Full-reading calculation](../../../experiments/api-boundary/api-boundary-review.mjs#L122) uses
current fingerprints, while historical receipts remain retained. The existing
[independent-verification requirements](../../../experiments/api-boundary/api-boundary-review.mjs#L248)
still require the file-specific independent assignment, current receipt and completed report.
Validation checks declarations; it cannot prove a human actually inspected pixels or decode PNGs.

## 3. Coverage Receipt

All four original files were fingerprinted before viewing and checked again afterwards. Whole-image
means the complete captured viewport, not all scrollable application content, hidden metadata,
PNG internals or every historical/current UI state. The following receipts are exact integration data:

```json
[
  {"path":"kupua/e2e/local/visual-baseline.spec.ts-snapshots/grid-view-chromium-darwin.png","packetId":"P11","sha256":"c732759044ed03d1ca476445a6036dcfe3df8ddb4d0e200450bdb499f1bdcd48","method":"visual","extent":"whole-image","note":"Viewed the complete unchanged 1280 x 720 grid capture: toolbar, summary, tiled missing-thumbnail presentation, text layout and badges. No metadata values copied; no current app, image-delivery or pixel-comparison claim."},
  {"path":"kupua/e2e/local/visual-baseline.spec.ts-snapshots/image-detail-chromium-darwin.png","packetId":"P11","sha256":"40f19aaa65337a96ea8388a17605fd48b58c74d3e570a0f261dd545b63a40c0a","method":"visual","extent":"whole-image","note":"Viewed the complete unchanged 1280 x 720 detail capture: navigation header, unavailable-preview area and metadata/rights sidebar. Identifying content not transcribed; off-viewport content, delivery and current UI correctness unverified."},
  {"path":"kupua/e2e/local/visual-baseline.spec.ts-snapshots/search-query-chromium-darwin.png","packetId":"P11","sha256":"65fb1b5902b09166bdb45c63812130d8f8764b0a203424f20a98b7e9965122f7","method":"visual","extent":"whole-image","note":"Viewed the complete unchanged 1280 x 720 query capture: populated query/date-sort state, summary and tiled missing-thumbnail presentation. No result identities copied and no present-day query, sorting or screenshot-test claim."},
  {"path":"kupua/e2e/local/visual-baseline.spec.ts-snapshots/table-view-chromium-darwin.png","packetId":"P11","sha256":"abc25db859fb612839688214ff351cd519f6592d5f1248b8672b26b5131db080","method":"visual","extent":"whole-image","note":"Viewed the complete unchanged 1280 x 720 table capture: shared controls, dense headers/rows, badges and viewport clipping. No row/contact/identity values copied; not a current data, layout or performance test."}
]
```

Administrative implementation inputs, excluded from application coverage:

| Input | SHA-256 | Actual scope |
|---|---|---|
| [Validator](../../../experiments/api-boundary/api-boundary-review.mjs#L17) | `aa81da9f6476fd2b74bc67aea9f8fe4902717c9e0632be1d3920c0139352048c` | Receipt vocabulary, full-reading, receipt validation and independent-verification blocks authored/read; not a fresh whole-validator audit. Current file has 337 lines. |
| [Tests](../../../experiments/api-boundary/api-boundary-review.test.mjs#L53) | `2e82716455af7f1f51022cff974d1ea13385575ba3270712c7a54fe613318377` | New helper and nine visual-receipt cases authored/read; all 53 administrative cases executed. Other assertions were not newly semantically audited in P11. Current file has 483 lines. |

The six input hashes were rechecked after viewing. PNG signatures/dimensions were read as bounded
metadata; that did not supply visual credit. Actual viewing did. No image was copied, regenerated,
converted or compared against a running browser. The captures' editorial values are not reproduced.

## 4. Evidence Dispositions

Existing evidence records remain untouched. No new performance, query, capacity or current-rendering
claim is added. P08's earlier unread-pixel/closure limitation is a correct historical account, now
resolved by separately approved tooling and actual inspection. Earlier reports are not rewritten.
Static visual reading does not validate the current screenshot suite or complete D016 and related
workflow joins. No file receives independent-verification credit from this coordinator packet.

## 5. Integration

Coordinator records these four current visual receipts, P11 accepted and D022 resolved. Preserve
required disposition, original files, prior records and all other open dependencies. Do not clear
unrelated stale documents or treat the two legacy JPG provenance questions as answered here.
The user's evidence-register edits and changelog rollback are preserved; neither file is rewritten.

## 6. Checks and Limits

The prescribed foreground `npm --prefix kupua run test:api-boundary` pipeline, with `pipefail` and
the TMPDIR tee log, produced 45 pass / eight expected failures before implementation, then
53 pass / zero failures, skips or cancellations after implementation. Native workers used the
documented sandbox exception. Only synthetic fixtures were generated and cleaned by that suite.
Controls cover whole-image scope, reviewer class, text/non-PNG rejection, fake text/structural
coverage, current hashes, notes, retained history, completion and independent verification.

Four original PNGs were viewed offline, not through an app or browser. Pre/post hashes matched for
all six assigned inputs; the evidence register retained its intake hash. Scoped editor diagnostics
were clear, and the administrative register check had no errors, with pre-existing incomplete
coverage/staleness still visible. No product suite, visual test, performance campaign, live-system
operation or Git mutation ran. No implementation of the API migration or plan adoption follows.