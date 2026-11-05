# P03: independent validator repair and P02 integration check

**Date:** 19 September 2026. **Role:** strong-independent, fresh context.
**Authority:** explicit operator-authorized P03 assignment under current protocol 05 and prompt 08.
This is a bounded administrative review, not application coverage or architecture approval.

## 1. Decision

**Accept.** The current F1-F3 implementation addresses P02's reproduced defects without requiring
deletion of historical receipts or a whole-file independent behavioral re-audit. P02's eight
proposed application receipts were integrated exactly by path, alongside seven retained P01
receipts. The requested evidence qualifications are present, and coverage has not been inflated.

**D004 can close and P03 can be accepted after coordinator integration.** No additional material
defect was found within the assigned repairs. D005 remains a separate OPEN operator-scope decision,
not a regression or prerequisite to accepting F1-F3. D001-D003 and the four stale required documents
remain unfinished. Nothing in this decision permits synthesis, implementation or a new experiment.

## 2. Material Findings

### F1: repaired, with the intended minimum guarantee

The [readiness expression](kupua/exploration/experiments/api-boundary/api-boundary-review.mjs#L283)
requires at least one `supported` claim, while retaining the error, warning, completeness,
dependency, packet-acceptance and fresh-enumeration gates. It does not delete unsupported history.
The [four status cases](kupua/exploration/experiments/api-boundary/api-boundary-review.test.mjs#L245)
assert that unsupported-only evidence cannot close, then add a supported claim and assert closure.
This directly discriminates P02's defect, including `superseded` as well as its three reproduced
statuses. My eight corresponding in-memory probes passed. This is not a semantic guarantee that
every decisive claim is supported; human disposition and dependencies still control that question.

### F2: repaired without erasing historical receipts

[Inventory refresh](kupua/exploration/experiments/api-boundary/api-boundary-review.mjs#L91) retains
receipts. The [receipt loop](kupua/exploration/experiments/api-boundary/api-boundary-review.mjs#L214)
warns when no current receipt exists, not merely because history exists. Historical ranges retain
integer/order/lower-bound validation without a current-version upper bound. Historical JSON
pointers retain syntax validation; pointer lookup requires both the inventory fingerprint and
the actual disk fingerprint to match the receipt. A changed disk file still produces the
[inventory warning](kupua/exploration/experiments/api-boundary/api-boundary-review.mjs#L248).

The [full-read calculation](kupua/exploration/experiments/api-boundary/api-boundary-review.mjs#L123)
uses current receipts only. A token current partial/structural receipt cannot promote retained old
full reading to a current full read; stale or partial records remain synthesis-blocking through
the [completeness gate](kupua/exploration/experiments/api-boundary/api-boundary-review.mjs#L281).
The [shrink/revalidation test](kupua/exploration/experiments/api-boundary/api-boundary-review.test.mjs#L257)
checks retained receipt equality, failed closure before a current read, clean closure afterwards,
and rejection of malformed historical ranges. The [JSON-history test](kupua/exploration/experiments/api-boundary/api-boundary-review.test.mjs#L278)
checks a removed historical selector, malformed history, and an unresolved current selector.
These are meaningful behavioral assertions, not only updated expected messages.

My eleven F2 probes confirmed retained full/range/pointer history, structural validation, current
selector resolution, and blocking of historical-only, explicit stale, incomplete current,
structural-only current, and disk-mismatched records. The suite's actual on-disk refresh/shrink
execution remains coordinator-reported; I read its assertions rather than running it.

### F3: repaired, without demanding redundant whole-file review

The [verification guard](kupua/exploration/experiments/api-boundary/api-boundary-review.mjs#L240)
requires a strong-independent packet, reciprocal assignment, a current receipt using a semantic
reading method, and `reviewed`/`accepted` status with an existing report. Receipt selectors are
validated by the preceding loop. Existing full-file reading and independently checked decisive
claims are separate requirements: the independent receipt need not duplicate every behavior.

The [positive control](kupua/exploration/experiments/api-boundary/api-boundary-review.test.mjs#L315)
accepts independent reading of just the decisive first line. The [unrelated-assignment case](kupua/exploration/experiments/api-boundary/api-boundary-review.test.mjs#L320)
and [five missing-condition cases](kupua/exploration/experiments/api-boundary/api-boundary-review.test.mjs#L333)
exercise each new guard. My eight probes confirmed those conditions, including a valid `reviewed`
verifier that passes file validation but cannot make synthesis ready until packet acceptance.
Neither the code nor this report claims that a report's existence mechanically proves its quality.

### P02 integration: faithful and bounded

I parsed the JSON proposal in [P02 section 5](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p02-pilot-check.md#L173),
looked up actual entries by path, and asserted exact equality of all eight P02 receipt objects,
including hashes, selectors and notes. All six on-disk fingerprints match. P02 receipts follow,
rather than replace, P01 receipts. The seven retained P01 receipts have the same fingerprints,
methods and selectors as the corresponding P02 scopes, with their original P01 reading accounts
still present; those scopes agree with [P01's original receipt section](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p01-existing-performance.md#L82).

| Application path | Current register entry | Retained P01 / appended P02 receipts | Status |
|---|---|---|---|
| [kupua/e2e-perf/README.md](kupua/e2e-perf/README.md) | `/files/885`, [entry](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-06-coverage.json#L15063) | 1 / 1; lines 1-215 | `partial` |
| [kupua/e2e-perf/run-audit.mjs](kupua/e2e-perf/run-audit.mjs) | `/files/910`, [entry](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-06-coverage.json#L15740) | 1 / 1; lines 96-118, 592-658, 1228-1253 | `partial` |
| [kupua/e2e-perf/results/perceived-log.json](kupua/e2e-perf/results/perceived-log.json) | `/files/908`, [entry](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-06-coverage.json#L15570) | 2 / 2; structural plus exact selected pointers | `partial` |
| [kupua/e2e-perf/results/audit-log.json](kupua/e2e-perf/results/audit-log.json) | `/files/902`, [entry](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-06-coverage.json#L15380) | 2 / 2; structural plus exact selected pointers | `partial` |
| [kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/d3-search-after-04-performance.md) | `/files/999`, [entry](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-06-coverage.json#L17311) | 1 / 1; full-text accounts, 439 lines | `read`, not `verified` |
| [kupua/package.json](kupua/package.json) | `/files/1212`, [entry](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-06-coverage.json#L20954) | 0 / 1; lines 1-42 | `partial` |

Current indices differ from some historical P02 indices because enumeration added an administrative
report. Path-based comparison avoids confusing that shift with a different file. The [P01 acceptance](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-06-coverage.json#L30852)
and [P02 acceptance](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-06-coverage.json#L30915)
retain their scope qualifications and acknowledge the authorized administrative changes. P02's old
administrative hashes and source-line citations remain historical receipts, not current-version
claims requiring that report to be rewritten. No file is marked `verified`.

### Known limits, not new repair findings

[D005](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-06-coverage.json#L30971)
correctly identifies the existing [09-only report guard](kupua/exploration/experiments/api-boundary/api-boundary-review.mjs#L192)
versus the independent 12-series challenge permitted by [protocol 05](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-05-review-protocol.md#L142)
and [prompt 08](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-08-review-prompt.md#L7).
It is outside F1-F3 and requires the separate operator decision already recorded. Do not broaden
the path guard as part of D004 closure.

The actual enumerated check returns zero errors, four stale-document warnings, 1,791 entries,
619 required, 1,160 scope-pending, 12 excluded, 613 unassigned required, five unresolved dependencies,
and `readyForSynthesis: false`. Reading counts are 1,785 inventoried, five partial, one read, zero
verified. The stale entries are the [directive](.github/copilot-instructions.md), its [human copy](kupua/exploration/docs/00%20Architecture%20and%20philosophy/copilot-instructions-copy-for-humans.md),
[AGENTS](kupua/AGENTS.md), and [changelog](kupua/exploration/docs/changelog.md). These are honest
unfinished coverage; neither this review nor its mechanical checks recredits them.

## 3. Coverage Receipt

All seven assigned inputs are accounted for below. Hashes identify the exact bytes examined;
hashing, line counting and parsing do not imply semantic reading. Administrative receipts stay
in this report, as required by [prompt 08](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-08-review-prompt.md#L78).

| Assigned path | SHA-256 | Actual coverage and unread material |
|---|---|---|
| [kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-05-review-protocol.md](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-05-review-protocol.md) | `4dc5dcb8e3b293040d412f9d921791c000f349248124d5143939b9c8d5a0cad1` | Full text, lines 1-245. Authority, unchanged gates, safety, and report ownership; none unread. |
| [kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-08-review-prompt.md](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-08-review-prompt.md) | `d0c9a4bd82177eec04d87de6079b4fdd34cc8ce821f7320885b4a40694c791e3` | Full text, lines 1-149. Assignment, receipt, permission and stop rules; none unread. |
| [kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p02-pilot-check.md](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p02-pilot-check.md) | `c77040e4ecb5be88537e4f5436ae6405cc5052e18cf0a1038d4b9846d69fb3fe` | Full text, lines 1-357, including the JSON proposal and execution limits; none unread. |
| [kupua/exploration/experiments/api-boundary/api-boundary-review.mjs](kupua/exploration/experiments/api-boundary/api-boundary-review.mjs) | `369a4dde279247e04ffce279782bcf731ecd9edfe472e2bb2e08e624c3426129` | Full text, lines 1-329. Inventory, receipt, evidence, verification, closure and CLI paths; none unread. |
| [kupua/exploration/experiments/api-boundary/api-boundary-review.test.mjs](kupua/exploration/experiments/api-boundary/api-boundary-review.test.mjs) | `f01a3674e7498cd20beedacdbad1962a47d48f5f4ff89c923ab290534ce748df` | Full text, lines 1-345, including helpers and all 36 generated test cases. Source/assertions read, not suite execution; none unread. |
| [kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-06-coverage.json](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-06-coverage.json) | `3299f02206c56d005d29afd6ee65782f25154661246f3e4e48fbe79f20863337` | Structural parse of 30,979 lines plus targeted semantic inspection at the pointers below. Not a full register/corpus read. |
| [kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-07-evidence.json](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-07-evidence.json) | `c852ce7cb01759328af828db62ca3a3ee811fb8321dba6b28002e1738dc056b5` | Full text, lines 1-100, all fields of `/claims/0` through `/claims/7`. Integration/qualification review, not renewed interpretation of every referenced measurement; none of the register unread. |

**Exact coverage-register scope:** `/schemaVersion`, `/baseline`, `/enumeration`; all fields under
`/packets/0`, `/packets/1`, `/packets/2` and `/dependencies/0` through `/dependencies/4`; all fields
and receipt arrays of the six `/files` entries in section 2. Administrative path/disposition/status/
hash/receipt metadata was checked at `/files/989`, `/files/990`, `/files/991`, `/files/992`,
`/files/994`, `/files/1206`, `/files/1207`. Whole-array counts and validation were mechanical.
Other file metadata and the underlying application corpus were not individually interpreted.

**Supplemental partial original:** [P01 report](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p01-existing-performance.md#L82),
SHA-256 `b5fc71d06d633c2ede5864c01c7fa4d7a24870b2e65826980d5d87ef6571aeba`, lines 82-112,
to compare retained receipt scopes and D001-D003 with the original account. Lines 1-81 and
113-133 were not read as review inputs; incidental search matches confer no additional coverage.
This is not a new P01 metric audit or application reading receipt.

AGENTS, the shared worklog and supplied directives were intake context only. The six application
files were fingerprinted and their registered selectors mechanically checked, not semantically
reread. In particular, canonical metric values, historical scenario implementations, current Scala,
deployment state, and the rest of the 1,791-file corpus remain outside P03. No excluded credential
or runtime payload was inspected. The current retained P01 records were checked against its original
account; no separate pre-integration register snapshot was available to establish byte-for-byte
identity of its old receipt-note strings.

## 4. Evidence Dispositions

Retain E001-E008 as `supported`, with P01 ownership, original-source references and existing limits.
This is verification of faithful integration, not a fresh independent certification of all recorded
performance values. The full current register continues to cite canonical histories, the runner,
handbook and D3 investigation, not generated dashboards as independent observations.

The [P02 evidence requests](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p02-pilot-check.md#L286)
were checked as exact strings: E003 and E007 append the scenarioRevision-2/source-methodology limit
at `/claims/2/limits/3` and `/claims/6/limits/3`; E006 appends the missing-scenarioRevision/D002
qualification at `/claims/5/limits/3`; E008 replaces its completed prerequisite at
`/claims/7/limits/2`. See the actual [E003](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-07-evidence.json#L33),
[E006](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-07-evidence.json#L71),
[E007](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-07-evidence.json#L82),
and [E008](kupua/exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-07-evidence.json#L92)
limit lines. E001, E002, E004 and E005 require no new disposition. No new E record is necessary.
After D004 closure, update only E008's now-transitional D004 wording as specified below.

## 5. Coordinator-Only Integration Requests

1. Recheck these fingerprints, then set P03 `status` to `accepted`. Suggested `acceptance`:
   `P03 independently checked current F1-F3 source and all test assertions, 28 bounded in-memory probes, and exact P02 integration. Accepted for administrative repair closure only; D005, stale documentation and corpus coverage remain unresolved. Suite execution is coordinator-reported, not performed by P03.`
2. Set D004 `status` to `resolved`, retaining `fromPacket: "P02"`, `ownerPacket: "P03"` and its
   deciding question. Suggested `nextAction`:
   `Closed by accepted P03 after original-source review, bounded probes and faithful P02 integration checks, together with the coordinator-reported failing-first and passing 36-test runs. No further F1-F3 repair requested; D005 remains a separate operator-scope decision.`
3. At the same integration, replace only E008 `/claims/7/limits/2` with:
   `P02 independently checked the cited originals; P03 independently checked the bounded F1-F3 repairs and their integration, closing D004. Corpus review and the separate D005 operator-scope decision remain incomplete.`
   Retain its other limits, sources, kind, status and owner; do not rewrite P01 or P02.
4. Keep D001-D003 OPEN with their existing questions/owners/actions, and D005 OPEN for the
   coordinator's operator decision. Do not add a duplicate dependency or treat D005 as F1-F3 work.
5. On ordinary coordinator re-enumeration, inventory this report as excluded review administration,
   `inventoried`, null hash, no application receipts. Keep the seven administrative inputs in the
   same excluded/inventoried state; their hashes and reading accounts belong here. Preserve all
   existing P01/P02 application receipts/statuses and the four stale required-document entries.

The proposed acceptance/D004 closure was checked in memory only: zero errors, the same four
warnings, four unresolved dependencies, synthesis still false. Adding this report during later
enumeration changes an administrative inventory count, not application coverage. No central
register, routing document, worklog or earlier report was edited by P03.

## 6. Checks and Limits

**Executed by P03 from repository root:**

```sh
node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs packet P03
git ls-files --cached --others --exclude-standard -z -- | node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs check --enumerated
```

- Read-only Node extractions computed all seven assigned hashes and the supplemental P01 hash;
  compared all six current application hashes, eight P02 receipt objects, seven retained P01
  selector accounts, packet statuses and the four exact evidence-limit edits; checked excluded
  administrative entries and absence of any `verified` file. All assertions passed.
- On Node v22.12.0, 28 bounded in-memory validator probes passed: one complete control, eight F1,
  eleven F2, eight F3. Existing package/report files served only as read-only regular-file and
  report-existence fixtures. Synthetic declarations stayed in memory and confer no coverage credit.
  No test module was imported, no suite was run, and no synthetic fixture was persisted.
- Post-write checks verified report links and source-line bounds, all eight reported receipt
  fingerprints, exact six-section structure, and the coordinator-only integration proposal using
  the existing validator. The fresh enumerated check remained zero errors/four expected warnings,
  with five unresolved dependencies and synthesis false in the unchanged actual register.
- One post-write validation attempt stopped when the sandbox rejected Node's Git child process
   with `EPERM`; that invocation is not counted as a completed check. The same validation passed
   using the protocol's Git-to-Node stdin pipeline, without extra permissions or persisted files.

**Coordinator-reported, not executed or reconstructed by P03:** the prescribed foreground,
unsandboxed isolated `npm --prefix kupua run test:api-boundary` run had 24 pass/12 expected failures
before repair (all 23 original tests passing), then 36 pass after repair. Reading the current
assertions supports their relevance; it does not turn that run history into my execution evidence.

No general validator redesign, exhaustive hostile-input audit, application correctness claim,
historical performance remeasurement or production-capacity conclusion follows. No services,
browser, network, ES/AWS, product tests, performance suites, Git mutations or subdelegation were
used. The only intentional workspace write is this assigned report; no session worklog or fixture
was created, and no earlier plan/report was changed. Return this report to the coordinator and stop.