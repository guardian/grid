# P02: independent bootstrap and evidence-pilot check

**Date:** 19 September 2026. **Execution class:** strong-independent.
**Reviewed baseline:** local HEAD and inventory baseline both
`0e79a4dec637e3eaf05bb252c2ec7f95e8e68c8d`, with the existing dirty worktree preserved.
All 13 assigned input fingerprints were computed at intake and again before drafting; none changed.
This report is a review result and integration proposal, not a register update.

## 1. Decision

**Accept with named corrections.** P01 is an honest, bounded recovery of existing evidence, and
the inventory is a usable starting point for further inspection. Its decisive values and
qualifications survive independent checks against the assigned originals. No new browser or
performance campaign is needed to establish that these recorded comparisons exist.

Three administrative validator defects need a bounded repair: **F1, unsupported-only evidence can
pass the synthesis gate; F2, retained historical receipts cannot close after revalidation; F3,
independent verification is not tied to an actual review of the file.** These are not false states
found in the current seed registers. Correct them before relying on final-closure or verification
flags, and address F2 before integrating changed-file rechecks. Allocation and bounded reading may
continue; no architecture, deployment, feature reduction or stronger consistency guarantee is approved.

## 2. Material Findings

### F1. Synthesis readiness accepts a corpus with no supported evidence

**Claim and evidence.** The validator checks that claim statuses belong to the vocabulary at
[api-boundary-review.mjs](../../../experiments/api-boundary/api-boundary-review.mjs#L246), but its
[readiness expression](../../../experiments/api-boundary/api-boundary-review.mjs#L271) requires only
`evidence.claims.length > 0`. An in-memory, otherwise complete control returned
`errors=[]`, `warnings=[]`, `readyForSynthesis=true`. Changing its sole claim from `supported` to
each of `unverified`, `disputed` and `refuted` still returned that result.

**Consequence.** A future coordinator can receive a positive closure signal without a single
supported claim. This is a bookkeeping defect, not an allegation that any of E001-E008 is currently
unsupported. The real registers correctly remain incomplete.

**Smallest correction.** Require at least one `supported` claim for readiness. Keep refuted and
superseded history; do not delete it to satisfy the gate. Decisive unresolved claims still require
an open dependency and human disposition: this minimal guard does not turn the validator into a
semantic judge. Add negative tests for unsupported-only evidence and a positive mixed
supported/historical case. The existing [closure test](../../../experiments/api-boundary/api-boundary-review.test.mjs#L227)
tests supported evidence and an empty list, not these status changes.

### F2. Preserving historical receipts prevents completed revalidation

**Claim and evidence.** [Inventory refresh](../../../experiments/api-boundary/api-boundary-review.mjs#L80)
preserves receipts, and [full-reading calculation](../../../experiments/api-boundary/api-boundary-review.mjs#L122)
correctly selects the current fingerprint. However, the
[receipt loop](../../../experiments/api-boundary/api-boundary-review.mjs#L219) warns for every old
fingerprint and validates old ranges against the current line count. Any warning blocks readiness.

The synthetic current/read/accepted control already had a current full-text receipt and
`stale=false`. Retaining an older full-text receipt produced `receipt needs revalidation` and
readiness became false. Retaining an older line-range receipt for a longer previous version also
produced `invalid read range`. No actual file was changed for either probe.

**Consequence.** A scoped re-read cannot close the record while preserving its historical receipt.
The coordinator would have to remove or misdescribe earlier evidence, contrary to protocol 05's
progress-preservation rule. This is distinct from correctly blocking a genuinely stale file.

**Smallest correction.** Distinguish historical receipts from outstanding revalidation using the
current fingerprint, current receipt coverage and explicit stale state. Resolve selectors against
disk only for the matching fingerprint; retain structural validation of historical selectors.
An old receipt must not remain closure-blocking after the current scope has been rechecked and
staleness resolved. Test refresh, shrink, retained history and completed revalidation together.
The existing [refresh test](../../../experiments/api-boundary/api-boundary-review.test.mjs#L102)
stops after preservation/staleness assertions; it does not attempt closure after a new receipt.

### F3. A ready, unrelated independent packet can satisfy `verified`

**Claim and evidence.** The [verification check](../../../experiments/api-boundary/api-boundary-review.mjs#L234)
looks only at the referenced packet's `executionClass`. In memory, a fully read file owned by
P01 was marked `verified` with `verificationPacketId: "P02"`; synthetic P02 was `ready`, assigned
only to a different file, and had no receipt or report. Validation returned no errors or warnings.
This probe did **not** make synthesis ready, because the unrelated packet/file remained unfinished.

**Consequence.** A file-level verification claim can pass without an independent check of that
file. There are no `verified` files in the current registers, so this has not inflated P01's receipt.

**Smallest correction.** Require reciprocal assignment to the verifier, a current-fingerprint
independent reading account, and a completed review/report before admitting `verified`. The
independent scope may be the recorded decisive claims; do not invent a requirement to re-audit all
behavior. Add tests for an unrelated owner, missing receipt, merely ready verifier and a valid
completed independent review. The existing [verification test](../../../experiments/api-boundary/api-boundary-review.test.mjs#L134)
only tests the absence of an independent packet reference.

### What Is Sound, and What Is Simply Unfinished

- [Path policy and snapshotting](../../../experiments/api-boundary/api-boundary-review.mjs#L33)
  retain unfamiliar Grid material as `scope-pending`, keep Kupua/media-api material required,
  and exclude named runtime, credential and administrative classes without reading their payloads.
  Synthetic unfamiliar source, asset and lockfile examples were not silently excluded. The tests
  also exercise missing files, symlinks, ancestor escapes and reciprocal assignments.
- The fresh enumerated check reports 1,790 entries: 619 `review-required`, 1,160 `scope-pending`
  and 11 `excluded`. Reading is 1,785 `inventoried`, four `partial`, one `read`; no `verified`,
  stale or missing entries. P01 is `reviewed`, P02 `ready`, neither accepted. There are 613
  unassigned required files and three open dependencies. These are visible unfinished work,
  not omissions to erase. P01's 1,787 figure is explicitly an earlier inventory count.
- All 11 excluded entries were checked at the metadata level: three potential credential files
  and eight administrative files. Their null hashes are intentional. No excluded credential
  payload was read. Generated evidence views such as coverage entries `/files/903`, `/files/907`
  and `/files/909` remain required/inventoried, not credited as independent observations or reading.
- D001-D003 have deciding questions, intended owner roles and next actions. They are adequate
  coordinator handoffs at this stage, not already allocated execution packets. Their ownership
  must be turned into bounded assignments before execution; none is resolved by P02.

## 3. Coverage Receipt

Paths below are repository-relative. Hashing and parsing do not count as semantic reading.
Administrative hashes stay here, not in metadata-only application inventory entries.

| Assigned Path | SHA-256 | Actual Inspection and Unread Content |
|---|---|---|
| [kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-05-review-protocol.md](api-boundary-05-review-protocol.md#L1) | `b09caf4f5c1c775bb4245fffab53b6c0044b5906c032fee0e40a4593c8a7f6ed` | Full text, lines 1-221. Authority, scope, receipts, gates and permissions. None unread. |
| [kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-08-review-prompt.md](api-boundary-08-review-prompt.md#L1) | `64c568d71594ae7a8c66dd8c85cef0f71d1079be7542915f0a1bb3706f251033` | Full text, lines 1-133, also supplied as an attachment. None unread. |
| [kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-06-coverage.json](api-boundary-06-coverage.json#L1) | `a6acc32d85cc5179c00e28e24d7973d09030766e2b6c2fd5c41b240363ad9f25` | Structural parse of the 30,574-line register plus bounded metadata inspection described below. Not a full semantic read of all entries or their files. |
| [kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-07-evidence.json](api-boundary-07-evidence.json#L1) | `2ef9443793a0b1645f99f8b0a4f252aa18ee36babc9133af0d0fb6a5f7a3a3e6` | Full text, lines 1-100; all fields of `/claims/0` through `/claims/7`. File references checked against current hashes/selectors; original content read at the scopes below. None of the register unread. |
| [kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p01-existing-performance.md](api-boundary-09-p01-existing-performance.md#L1) | `b5fc71d06d633c2ede5864c01c7fa4d7a24870b2e65826980d5d87ef6571aeba` | Full text, lines 1-133, including claims, receipts, follow-ups and limits. None unread. |
| [kupua/exploration/experiments/api-boundary/api-boundary-review.mjs](../../../experiments/api-boundary/api-boundary-review.mjs#L1) | `8ff24b9478878fa40ea6f3c2bcb13501f0e32c4380776d162534d3112c2a51a2` | Full text, lines 1-317. Inventory, preservation, validation and CLI paths inspected; F1-F3 exercised in memory. None unread. |
| [kupua/exploration/experiments/api-boundary/api-boundary-review.test.mjs](../../../experiments/api-boundary/api-boundary-review.test.mjs#L1) | `0161dcf1905a42848cbcecf2d477938ddb97795bc6ef18fce7060ff09799fbc3` | Full text, lines 1-237; all 23 tests executed. Assertions read are not evidence of untested guards. None unread. |
| [kupua/package.json](../../../../package.json#L1) | `2655730382c3aeada49d2fcf10008016c40283e303c59145996d99a8e801f9f9` | Partial text, lines 1-42, plus the entire file's Git diff, which adds only the two administrative aliases. Lines 43-72 unread; no dependency audit. |
| [kupua/e2e-perf/README.md](../../../../e2e-perf/README.md#L1) | `431d4623d2b3b502507a31a3a04bf71f5b092fc9ce226b8f7db79aa5019fa203` | Partial text, lines 1-215. Measurement definitions, campaign handling and topology. Lines 216-648 unread. |
| [kupua/e2e-perf/run-audit.mjs](../../../../e2e-perf/run-audit.mjs#L96) | `19fdd5bee5471888b76355295a277abe7c3cfad72e4f5d388311aecd3bda8d6c` | Partial text, lines 96-118, 592-658, 1228-1253. Current writer provenance only. Lines 1-95, 119-591, 659-1227, 1254-1303 unread. |
| [kupua/e2e-perf/results/perceived-log.json](../../../../e2e-perf/results/perceived-log.json#L1) | `6e05f5bfcf3721dd1e330fe4714a9ad288c87d01fcb125a1dfc611ea34b8b517` | Structural count/date scan of all 64 entries; semantic reading of the eight complete metric objects and metadata pointers in section 5. All other metric content, unselected environment values and historical interpretations unread. |
| [kupua/e2e-perf/results/audit-log.json](../../../../e2e-perf/results/audit-log.json#L1) | `418ce79282cb4aa3f1fe9b5e56a342c44704e1cc144c0f5c587cb7d32de18325` | Structural count/date scan of all 48 entries; semantic reading of eight complete metric objects and metadata pointers in section 5. All other metric content, unselected environment values and historical interpretations unread. |
| [kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md](d3-search-after-04-performance.md#L1) | `ac51c521c307c9fb8b5b7d2583b193b431e27ee2b80ca5f43038ada7e32b5394` | Full text, lines 1-439, including annotations, projections and appendix. None unread in this document. Linked archived instrumentation, current Scala and deployment configuration not independently inspected; appendix commands not run. |

**Coverage-register selectors and limits.** Inspected `/baseline`, `/enumeration`, the packet
identity/question/class/status/acceptance/assignment fields under `/packets/0` and `/packets/1`,
P02's `/packets/1/report`, and all of `/dependencies/0`, `/dependencies/1`, `/dependencies/2`.
The packet view supplied the full P01 receipt arrays at `/files/885/receipts`,
`/files/902/receipts`, `/files/908/receipts`, `/files/910/receipts`, `/files/998/receipts`.
Ownership/status/hash metadata was checked for those files and `/files/1211`.

The `/files` array was mechanically counted and checked for stale/missing/status/receipt anomalies.
Selected policy fields (`path`, `disposition`, `reason`, `classifiedBy`, `kind`, `status`,
`packetIds`, `receipts`) were examined at `/files/11`, `/files/13`, `/files/35`, `/files/62`,
`/files/305`, `/files/547`, `/files/903`, `/files/907`, `/files/909`, and all excluded entries:
`/files/292`, `/files/878`, `/files/879`, `/files/989`, `/files/990`, `/files/991`, `/files/992`,
`/files/993`, `/files/1022`, `/files/1205`, `/files/1206`. For the excluded entries, `sha256`,
`lines`, `present`, and `enumerated` were also checked. Additional path/disposition/status examples
were `/files/29`, `/files/527`, `/files/1459`, `/files/1712`. Other entry metadata was not
individually interpreted. No reading credit is claimed for the application files these examples name.

**Explicit future reading.** D002 retains perceived entries 0-53 and 58-63, jank entries 0-42 and
45-47, unselected fields/scenarios of the six selected campaigns, and the unread handbook/runner
ranges above. Structural timestamp scans of those entries do not reduce that semantic backlog.
D003 retains the linked instrumentation, current code and decision reconciliation. AGENTS (all
225 lines), the initial empty worklog and supplied directives were context, not extra application
coverage receipts. The operator confirmed P02 with no additional context required.

## 4. Evidence Dispositions

All eight records retain the existing schema status `supported`; the dispositions below describe
what was independently checked, not a new evidence-status vocabulary. No new E record is needed.

| ID | Disposition Against Originals |
|---|---|
| E001 | **Verify, bounded source fact.** The inspected [perceived writer](../../../../e2e-perf/run-audit.mjs#L619) and [jank writer](../../../../e2e-perf/run-audit.mjs#L1235) push the same new entry into canonical JSON and construct companion JS/Markdown outputs. Perceived Markdown starts from existing Markdown; this is not proof of historical byte-equivalence or independent corroboration. |
| E002 | **Verify, historical records.** Perceived `/entries/54`-`/entries/57` and jank `/entries/43`-`/entries/44` have the named September 12 timestamps, kinds where applicable and four runs. Direct records identify `595abcbc4`, clean; API records `b40755a3f`, dirty. The common cutoff is `2026-02-15T00:00:00.000Z`, viewport 1720 by 960 and cache class `uncontrolled-browser-cache`. Metadata/source identities do not certify identical application trees. |
| E003 | **Verify; retain revision qualification.** The full PP3/PP6/PP7 objects in perceived entries 54/56 match all cited settlement values: respectively 868/1247ms, 265/264ms, 933/1284ms. All are `scenarioRevision: 2`, `sampleCount: 4`, regime `seek`, with totals 1,229,255/1,229,160. PP7 is the recorded mid-list seek, not proof of every arbitrary position or an exact identical target across modes. |
| E004 | **Verify as documented topology and recorded routing.** [Handbook lines 167-204](../../../../e2e-perf/README.md#L167) explicitly identify local media-api over the TEST tunnel and differing HTTP/HTTPS browser origins. API PP7 `/entries/56/perceived/PP7/routes` is `["direct-es", "media-api"]`; both PP6 route arrays are `["client-only"]`. This is hybrid local-path evidence, not API-only or a deployed D3 campaign. No live topology observation was made. |
| E005 | **Verify the historical account, not current causation.** The [shipping annotation](d3-search-after-04-performance.md#L8), [wire/transport explanation](d3-search-after-04-performance.md#L47), [envelope/signing account and reverted writer](d3-search-after-04-performance.md#L222), and [June follow-up](d3-search-after-04-performance.md#L370) support P01's account. The [production estimates](d3-search-after-04-performance.md#L309) are projections. The [completed script-field recommendation](d3-search-after-04-performance.md#L331) qualifies older body prose. The handbook distinguishes the deployed shared-client gzip test on GET `/images` from D3 journeys; neither this packet nor P01 remeasured the approximate 137ms/29ms breakdown or inspected current Scala. |
| E006 | **Verify, selected historical aggregates.** All eight selected P2/P3/P4a/P8 objects were read. P2 p95 is 34/34ms; P8 p95 59/60ms, maximum 180/243ms and LoAF blocking 1769/2053ms. The selected jank objects have no `scenarioRevision` field; do not infer methodology equivalence with current scenarios from the metric IDs. [Measurement definitions](../../../../e2e-perf/README.md#L6) distinguish jank from perceived settlement. No blanket no-regression conclusion follows. |
| E007 | **Verify; retain revision and action scope.** `/entries/55/perceived/JB5` and `/entries/57/perceived/JB5` say `fullscreen-exit`, label exit after 20 traversals, revision 2, client-only, indexed total 2928 and settlement 136/149ms. They do not time the 20 traversals or establish million-result traversal performance. Scenario-source methodology beyond these records remains D002. |
| E008 | **Verify the limited inference.** The records above refute absence of broad baseline comparisons. They neither close the corpus review nor select candidate B. The current [operator mandate](api-boundary-05-review-protocol.md#L15) also requires evidence-first work; the earlier conversation reference was not independently retrieved as a transcript. Future measurement still needs a distinct unanswered question. |

Counts/date bounds also match: perceived 64 entries, 24 April-18 September 2026; jank 48 entries,
30 March-18 September 2026. These are structural observations, not endorsement of every run.
No decisive P01 claim was refuted. No original record was replaced by a generated dashboard view.

## 5. Integration Requests

**Coordinator only; not applied.** Recheck fingerprints and merge by existing path/ID. Append the
listed receipts and D004; do not replace entire arrays or discard P01's receipts. The following
fragment uses existing coverage-register fields. Packet acceptance means accepting the completed
review with named corrections, not certifying the uncorrected tooling. Record D004 at the same
time; it remains open until authorized repairs and focused regression checks are complete.

```json
{
  "packets": [
    {
      "id": "P01",
      "status": "accepted",
      "acceptance": "P02 independently checked the bounded original evidence and receipts; accepted with retained scope, topology and revision qualifications. No comprehensive coverage or architecture approval."
    },
    {
      "id": "P02",
      "status": "accepted",
      "acceptance": "Independent pilot review accepted with validator corrections F1-F3 tracked by open D004; this is not acceptance of uncorrected final-closure behavior."
    }
  ],
  "dependencies": [
    {
      "id": "D004",
      "fromPacket": "P02",
      "status": "open",
      "question": "Can the validator reject unsupported-only synthesis evidence, close scoped revalidation while retaining historical receipts, and require file-specific completed independent verification?",
      "intendedOwner": "Coordinator; proposed P03 strong administrative-tooling repair packet, only after explicit operator approval.",
      "nextAction": "Request permission for the bounded F1-F3 repairs in api-boundary-review.mjs and its existing test file. Add the reproduced negative cases and valid closure controls, preserve receipt history, run the isolated tooling suite and fresh enumerated register check. Do not start an application review or live experiment."
    }
  ],
  "files": [
    {
      "path": "kupua/e2e-perf/README.md",
      "status": "partial",
      "receipts": [
        { "packetId": "P02", "sha256": "431d4623d2b3b502507a31a3a04bf71f5b092fc9ce226b8f7db79aa5019fa203", "method": "line-ranges", "ranges": [[1, 215]], "note": "Independently read measurement definitions, campaign handling and topology qualifications. Lines 216-648 remain unread." }
      ]
    },
    {
      "path": "kupua/e2e-perf/run-audit.mjs",
      "status": "partial",
      "receipts": [
        { "packetId": "P02", "sha256": "19fdd5bee5471888b76355295a277abe7c3cfad72e4f5d388311aecd3bda8d6c", "method": "line-ranges", "ranges": [[96, 118], [592, 658], [1228, 1253]], "note": "Independently checked the common-entry JSON/JS/Markdown writer relationship only. Lines 1-95, 119-591, 659-1227 and 1254-1303 remain unread." }
      ]
    },
    {
      "path": "kupua/e2e-perf/results/perceived-log.json",
      "status": "partial",
      "receipts": [
        { "packetId": "P02", "sha256": "6e05f5bfcf3721dd1e330fe4714a9ad288c87d01fcb125a1dfc611ea34b8b517", "method": "structural", "note": "Parsed all 64 entries for count/date bounds and inspected selected entry/environment key sets. This is not semantic reading of unselected history." },
        {
          "packetId": "P02",
          "sha256": "6e05f5bfcf3721dd1e330fe4714a9ad288c87d01fcb125a1dfc611ea34b8b517",
          "method": "json-pointers",
          "pointers": [
            "/entries/54/perceived/PP3", "/entries/54/perceived/PP6", "/entries/54/perceived/PP7",
            "/entries/55/perceived/JB5",
            "/entries/56/perceived/PP3", "/entries/56/perceived/PP6", "/entries/56/perceived/PP7",
            "/entries/57/perceived/JB5",
            "/entries/54/label", "/entries/54/kind", "/entries/54/timestamp", "/entries/54/runs", "/entries/54/gitSha", "/entries/54/gitDirty", "/entries/54/stableUntil",
            "/entries/55/label", "/entries/55/kind", "/entries/55/timestamp", "/entries/55/runs", "/entries/55/gitSha", "/entries/55/gitDirty", "/entries/55/stableUntil",
            "/entries/56/label", "/entries/56/kind", "/entries/56/timestamp", "/entries/56/runs", "/entries/56/gitSha", "/entries/56/gitDirty", "/entries/56/stableUntil",
            "/entries/57/label", "/entries/57/kind", "/entries/57/timestamp", "/entries/57/runs", "/entries/57/gitSha", "/entries/57/gitDirty", "/entries/57/stableUntil",
            "/entries/54/environment/dataMode", "/entries/54/environment/appBaseUrl", "/entries/54/environment/cacheClass", "/entries/54/environment/viewport",
            "/entries/55/environment/dataMode", "/entries/55/environment/appBaseUrl", "/entries/55/environment/cacheClass", "/entries/55/environment/viewport",
            "/entries/56/environment/dataMode", "/entries/56/environment/appBaseUrl", "/entries/56/environment/cacheClass", "/entries/56/environment/viewport",
            "/entries/57/environment/dataMode", "/entries/57/environment/appBaseUrl", "/entries/57/environment/cacheClass", "/entries/57/environment/viewport"
          ],
          "note": "Independently read all eight selected metric objects, including revisions, routes, regimes and seek measures, plus these metadata fields. Other metric content and environment values remain unread; no scenario-source or aggregation-method audit is claimed."
        }
      ]
    },
    {
      "path": "kupua/e2e-perf/results/audit-log.json",
      "status": "partial",
      "receipts": [
        { "packetId": "P02", "sha256": "418ce79282cb4aa3f1fe9b5e56a342c44704e1cc144c0f5c587cb7d32de18325", "method": "structural", "note": "Parsed all 48 entries for count/date bounds and inspected selected entry/environment key sets. This is not semantic reading of unselected history." },
        {
          "packetId": "P02",
          "sha256": "418ce79282cb4aa3f1fe9b5e56a342c44704e1cc144c0f5c587cb7d32de18325",
          "method": "json-pointers",
          "pointers": [
            "/entries/43/metrics/P2", "/entries/43/metrics/P3", "/entries/43/metrics/P4a", "/entries/43/metrics/P8",
            "/entries/44/metrics/P2", "/entries/44/metrics/P3", "/entries/44/metrics/P4a", "/entries/44/metrics/P8",
            "/entries/43/label", "/entries/43/timestamp", "/entries/43/runs", "/entries/43/gitSha", "/entries/43/gitDirty", "/entries/43/stableUntil",
            "/entries/44/label", "/entries/44/timestamp", "/entries/44/runs", "/entries/44/gitSha", "/entries/44/gitDirty", "/entries/44/stableUntil",
            "/entries/43/environment/dataMode", "/entries/43/environment/appBaseUrl", "/entries/43/environment/cacheClass", "/entries/43/environment/viewport",
            "/entries/44/environment/dataMode", "/entries/44/environment/appBaseUrl", "/entries/44/environment/cacheClass", "/entries/44/environment/viewport"
          ],
          "note": "Independently read the complete selected P2/P3/P4a/P8 aggregates and these metadata fields. Selected metric objects lack scenarioRevision. Remaining metrics/history and scenario-source methodology are not reviewed."
        }
      ]
    },
    {
      "path": "kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md",
      "status": "read",
      "receipts": [
        { "packetId": "P02", "sha256": "ac51c521c307c9fb8b5b7d2583b193b431e27ee2b80ca5f43038ada7e32b5394", "method": "full-text", "note": "Read all 439 lines and independently checked P01's account of historical measurements, shipped/reverted/completed work and projections. Linked raw instrumentation, current Scala and deployment state are not independently verified. No appendix command executed." }
      ]
    },
    {
      "path": "kupua/package.json",
      "status": "partial",
      "receipts": [
        { "packetId": "P02", "sha256": "2655730382c3aeada49d2fcf10008016c40283e303c59145996d99a8e801f9f9", "method": "line-ranges", "ranges": [[1, 42]], "note": "Read through the scripts block and inspected the full Git diff, which adds only review:api-boundary and test:api-boundary. Lines 43-72 remain unread; no dependency audit." }
      ]
    }
  ]
}
```

**Evidence-register requests.** Retain all existing sources and statuses. Append to E003 and E007's
`limits`: `The selected perceived metric objects record scenarioRevision 2; this does not verify
the uninspected historical scenario or aggregation implementation.` Append to E006's `limits`:
`The selected P2/P3/P4a/P8 objects do not carry scenarioRevision; comparison with other scenario
revisions requires D002's source-methodology review.` Replace E008's third, now-completed
P02-prerequisite limit with: `P02 independently checked the cited originals; corpus review and the
validator corrections recorded in D004 remain incomplete.` Do not rewrite the earlier P01 report.

Keep administrative inventory entries excluded/inventoried with null hashes and no application
receipts. Re-enumeration may add this report as administration. Do not promote any whole file to
`verified` on the strength of this bounded evidence check. D001-D003 stay open with their existing
owners/questions; D002's exact remaining sections are listed in section 3. Proposed P03 is not
created or executed here. Approval for the tooling repair must be obtained separately.

## 6. Checks and Limits

Executed from repository root:

```sh
node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs packet P02
node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs check
git ls-files --cached --others --exclude-standard -z -- | node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs check --enumerated
set -o pipefail; npm --prefix kupua run test:api-boundary 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

- Intake confirmed P02 `ready`, its execution class and exact report path; no prior P02 report
  existed. Both plain and fresh-enumeration checks returned no errors/warnings and synthesis false.
- The existing isolated suite produced actual TAP: **23 passed, zero failed, skipped or cancelled**.
  It ran unsandboxed in the foreground because of the documented native-worker limitation; no
  app, browser or cluster was involved. No new test file was written.
- Read-only `git status --short`, `git rev-parse --verify HEAD` and `git diff -- kupua/package.json`
  checked the worktree, baseline and alias changes. No Git mutation occurred.
- Bounded `node --input-type=module` extractions read only selected register metadata and canonical
  aggregate objects, computed fingerprints twice, and asserted P01's selected counts, dates,
  values, revisions, regimes, route qualifications and cited jank numbers. All assertions passed.
  One metadata extraction initially failed because the shell escaped JavaScript `!`; it was
  rerun with positive predicates. The failed invocation is not counted as a check.
- Post-write validation checked all 13 receipt fingerprints, 34 local line links and eight proposed
  receipts. An in-memory merge of the coverage proposal passed the existing validator with no
  errors/warnings, synthesis still false and four open dependencies including D004. No registers
  were written. The tooling test directory contained no remaining synthetic fixture directories.

**Synthetic probe account (Node v22.12.0).** A cloned in-memory register used the existing package
file and P01 report solely as regular-file/report-existence fixtures. The control had one current
full-text receipt, one accepted P01, one supported claim with a valid source line, no dependencies
and an explicit enumerated path list. These were synthetic declarations, not coverage credits.
Each case cloned that control; nothing was persisted:

| Change from Control | Actual Result |
|---|---|
| None | No errors/warnings; synthesis true. |
| Sole claim status set to `unverified`, `disputed`, or `refuted` | Each: no errors/warnings; synthesis true. F1. |
| Prepend old-fingerprint full-text receipt; retain current receipt and `stale=false` | Revalidation warning; synthesis false. F2. |
| Prepend old-fingerprint range ending at current line count + 1 | Invalid-range error plus revalidation warning; synthesis false. F2. |
| Mark control file verified by ready P02, whose sole assignment is a different inventoried file and which has no receipt/report | No errors/warnings. Synthesis remains false for the deliberately unfinished extra file/packet. F3. |

No historic failed-first execution from P01 was independently reconstructed; the current suite
and the probes above are this session's executed evidence. Passing administrative checks does
not certify application correctness, full harness methodology, production capacity or an API design.
The selected originals support their recorded observations and documented interpretations, not a
fresh runtime diagnosis. The full corpus and the linked historical instrumentation remain explicitly
unfinished where assigned to D001-D003.

Writes are limited to this report and the session worklog. Central registers, P01, earlier plans,
application/test/configuration/tooling files and existing unrelated worktree changes are untouched.
No services were started/stopped, no ES/AWS requests or performance campaigns run, and no live
identities, bodies, signed URLs or credentials retained. The authorized test tee log is in TMPDIR;
the worklog's session notes were reset to its scaffold at task completion. No AGENTS/changelog
change is requested for this report-only packet.

**Handoff:** return this report to the coordinating session for fingerprint-checked integration.
P02 stops here; neither the proposed repair packet nor another review packet has been started.