# P01: existing performance evidence pilot

**Date:** 19 September 2026.
**Execution class:** strong; mechanical extraction was checked against original records.
**Status:** Reviewed by the coordinator; awaiting independent acceptance in P02.
**Source baseline:** `0e79a4dec637e3eaf05bb252c2ec7f95e8e68c8d`, with research/tooling and previously
reported working-tree changes. The source fingerprints in the coverage register identify the
actual inputs, including dirty files; this is not a claim that every input equals HEAD.

## 1. Decision

**The project already contains substantial direct-ES/media-api performance evidence for the core
experience. Do not commission another broad comparison merely because a recent agent did not
inspect that evidence.** The initial register and this packet recover a bounded portion of it,
not the whole performance history or a migration architecture verdict.

The pilot succeeds at its narrow question: original records exist, can be referenced precisely,
and have interpretation limits that must travel with their values. Proceed to P02's independent
check of this process and these claims before scaling the inspection. Do not implement the keys
experiment, reopen D3 readiness, or replace the existing plan on this packet's authority.

## 2. Findings and evidence records

The E IDs below identify the initial records in `api-boundary-07-evidence.json`. Sources are
original JSON records, the generator's relevant code, and the dated explanatory document, not
the preliminary agents' summaries.

| ID | What the evidence establishes | What it does not establish |
|---|---|---|
| E001 | The current runner stages JSON and companion JS/Markdown views from the same new campaign entries. Those views are not independent observations. | That every historical rendered view is byte-for-byte equivalent, or that the whole harness has been audited. |
| E002 | Six September 12 records cover direct-ES and media-api modes: perceived short/long and jank, four runs each. | A fresh run, a perfectly isolated transport experiment or production capacity. |
| E003 | The recorded perceived pair contains deep seek, density and focus-preserving sort values on approximately 1.23 million results. | That one aggregate proves every interaction is smooth or that a proposed future API preserves it. |
| E004 | The API arm is local-media-api/hybrid, with explicit topology and origin qualifications. Its PP7 record lists both direct-ES and media-api routes. | API-only operation, a deployed D3 campaign, or attribution of the whole seek gap to SSH. |
| E005 | The historical investigation separates the former uncompressed transport penalty from response-building/signing costs, and records compression as shipped. | Current deployed CPU cost, a new optimization mandate, or proof that every old recommendation remains applicable. |
| E006 | Paired jank records exist, including non-zero frame/long-task costs. These are different measurements from perceived action latency. | A blanket no-regression verdict or equivalence between browser frames and server response time. |
| E007 | JB5 records fullscreen-exit settlement after a traversal scenario, in the indexed regime. | The duration of all twenty traversals or a million-result traversal measurement from that particular row. |
| E008 | The recovered evidence defeats the premise that broad baseline comparisons are absent. Further experiments need a distinct unanswered question. | Completion of comprehensive inspection, adoption of candidate B, or permission to reduce capabilities. |

### Exact records inspected

The [perceived history](../../../../e2e-perf/results/perceived-log.json) has 64 entries, dated
24 April through 18 September 2026. The [jank history](../../../../e2e-perf/results/audit-log.json)
has 48 entries, dated 30 March through 18 September. These are structural inventory observations;
only the named selections below were interpreted in this packet.

| Source pointer | Campaign | Relevant recorded values |
|---|---|---|
| Perceived `/entries/54` | Direct-ES, short, `595abcbc4`, 12 September | PP6 visual settlement 265ms; PP7 933ms; PP3 868ms; seek-regime total 1,229,255. |
| Perceived `/entries/56` | Media-api, short, `b40755a3f` dirty, 12 September | PP6 264ms; PP7 1,284ms; PP3 1,247ms; seek-regime total 1,229,160. |
| Perceived `/entries/55/perceived/JB5` | Direct-ES, long | Fullscreen-exit visual settlement 136ms; indexed-regime total 2,928. |
| Perceived `/entries/57/perceived/JB5` | Media-api, long | Fullscreen-exit visual settlement 149ms; indexed-regime total 2,928. |
| Jank `/entries/43` | Direct-ES | P2 p95 frame 34ms; P8 p95 frame 59ms, maximum 180ms, LoAF blocking 1,769ms. |
| Jank `/entries/44` | Media-api | P2 p95 frame 34ms; P8 p95 frame 60ms, maximum 243ms, LoAF blocking 2,053ms. |

All six records state four runs and the same upload-time cutoff and viewport. Both modes record
uncontrolled browser cache. Origins and recorded source/dirty identities differ. The
[handbook's topology section](../../../../e2e-perf/README.md#L167) says this pair characterizes the
local paths, not only the endpoint implementation. The upload cutoff does not make the corpus
immutable; even the recorded large-result totals differ. None of this makes the measurements
absent or useless. It constrains which causal and deployment claims they can support.

The short API PP7 row explicitly records both ES and media-api routes. PP6 is client-only in
both arms. The long JB5 number is exit settlement after twenty traversals, not elapsed time for
the entire scenario. Keeping these qualifications avoids turning a useful result into a stronger
claim than the data supports.

### Historical explanation, not new measurements

The [D3 investigation](d3-search-after-04-performance.md) records the former missing ES-client
compression, wire-size differences, local before/after timing, response/enrichment construction
and signing costs, plus a separate prod-like TEST comparison of gzip on the existing GET route.
Its shipping update says compression is no longer an unbuilt optimization. Its one-pass writer
was prototyped and reverted. Some old script-field advice is marked completed while older body
text remains. Those status qualifications matter as much as the historical numeric results.

Its approximate 137ms per 200-image envelope figure, including about 29ms signing, is historical
instrumentation evidence. Production projections in the document are not newly measured production
latencies. This packet did not inspect current Scala execution or effective deployed configuration;
it therefore records what the investigation establishes within its stated scope, not a fresh
causal decomposition of today's seek delay.

## 3. Coverage receipt

The coverage register contains the exact SHA-256 and selectors. Administrative inputs are
separate from application coverage. This packet's five review inputs are:

| Path | Actually inspected | Status |
|---|---|---|
| `kupua/e2e-perf/README.md` | Lines 1-215: measurement systems, campaign handling and local/deployed topology. Lines 216-648 are outside this packet. | Partial |
| `kupua/e2e-perf/run-audit.mjs` | Lines 96-118, 592-658 and 1228-1253: output locations, entry construction and staged sibling writes. Rest of the runner is not reviewed here. | Partial |
| `kupua/e2e-perf/results/perceived-log.json` | Entire structure parsed for entry count/date bounds and matching record metadata. Selected PP3/PP6/PP7 objects in entries 54/56 and JB5 in 55/57, plus the specified metadata fields, were interpreted. Other records/metrics are not semantically reviewed. | Partial |
| `kupua/e2e-perf/results/audit-log.json` | Entire structure parsed for count/date bounds and selected metadata. P2/P3/P4a/P8 in entries 43/44 were inspected. Remaining records/metrics are not semantically reviewed. | Partial |
| `media-api-work/d3-search-after-04-performance.md` in this folder | Full 439-line document, including shipping corrections, historical/projection qualifications and the reproduction appendix. Commands in the appendix were not executed. | Read, not independently verified |

The register does not convert structural parsing into a full read. Generated Markdown/JS files
remain inventoried: this pilot establishes the current writer relationship but does not mark all
derived files reviewed or automatically exclude their logic. Other code/docs previously encountered
in this conversation are not silently credited as comprehensive review receipts.

## 4. Remaining work and integration requests

- **D001, coordinator after P02:** classify scope-pending Grid material and allocate the remaining
  included corpus. The initial universe contains 1,787 files; the later addition of register/report
  control files changes administrative counts, not the amount of application coverage completed.
- **D002, strong evidence/harness reviewer to be assigned by the coordinator:** catalogue remaining
  historical runs, scenario/schema revisions and their source methodology. P01 cannot establish
  every historical comparison's validity from selected values and three runner excerpts.
- **D003, strong code/decision reviewer to be assigned by the coordinator:** reconcile historical
  optimization/status prose with current implementation and accepted decisions before using it
  to commission changes. No new benchmark is justified merely by that prose being old.

P02 should independently check the receipts, exact values, qualifiers, scope rules and validator
behavior. It may reject a specific claim or request a correction without rerunning the application.
Central updates should retain P01 as reviewed but unaccepted until that check is integrated.

## 5. Checks and limits

Executed: deterministic inventory generation, register validation against a fresh Git listing,
bounded parsing of original evidence, link checks, and 23 focused Node tests for the review
tooling. Three validator guards were confirmed failing before repair, then the full tooling suite
passed. These are administrative checks, not product verification or performance measurements.

The sandboxed npm wrapper emitted no child-script results for two invocations; those were not
counted as successful runs. Direct Node produced the inventory/check output; the native Node test
suite produced actual TAP when run unsandboxed. Fixtures stayed under Kupua and were cleaned up.

No browser, service, ES/AWS call, product suite or performance campaign was run for this pilot.
No old plan/report, application implementation or Scala behavior was changed. Research tooling,
npm aliases, registers and routing are the bootstrap's changes. No live bodies, credentials,
image identities or signed media artifacts were retained.

**Handoff:** use prompt 08 with **P02** in a fresh strong-reasoning session. Return its assigned
09 report to the coordinator. Do not begin full architecture synthesis from this pilot.