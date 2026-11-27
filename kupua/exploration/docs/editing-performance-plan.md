# Editing Performance: Evidence and Policy Plan

## Executive Summary (20 November)

**Metadata editing is implemented for the agreed scope.** Keep the current
local candidate; do not resume general tuning or change the backend. Read the
[headline evidence](editing-performance-evidence.md#executive-summary-20-november)
before the historical plan below.

- **What worked:** one fresh 100-file captioned upload finished in 28.048s
  versus Kahuna's 29.601s, with all captions preserved and 100 redundant reads
  removed. Kupua also won both acknowledgement comparisons on the same
  300-image settled batch. Neither result establishes general parity.
- **What did not:** faster transfer or polling alone did not improve full
  completion. During-upload edits acknowledged more slowly in Kupua; the
  measured Kahuna run lost five descriptions. Different targets and timing
  limit that comparison. Same-tab safeguards are not cross-user conflict control.
- **Before commit:** review and fix Upload messaging (Kahuna-style arrow
  placement, clear action progress distinct from upload counters). Full E2E
  is not clean: 596/598, both failures passed in isolation. Review evidence
  before selecting more tests or changes; no rollout or commit implied.

**Owner:** cross-workflow performance decisions for Upload, selections and editing.
**Established:** 19 November 2026. This is a research/execution plan, not permission
to reset data, activate an unimplemented operation, access shared infrastructure or
deploy experimental settings. The operator selects live work and destructive setup.

**Operator constraint, 19 November: NO backend changes at this stage.** Work with
existing contracts. Backend limitations and future improvement ideas may be documented,
including strong source-backed cases in the bug backlog; they are not implementation
permission or new prerequisites. The earlier strong-read backend recommendation was
declined. Frontend-only research and tests below supersede that routing.

Read this with the [evidence ledger](editing-performance-evidence.md) and the active
[worklog](worklog-current.md). The [editing capability plan](gradually-growing-teeth.kupua-edits-steps.md)
still owns feature scope and safety prerequisites; the
[Upload workplan](gradually-growing-teeth.upload-workplan.md) owns Upload behavior.
Do not create another competing plan or rely on session memory as the only evidence.

## Operator-Agreed Execution Priority (19 November 2026)

**Parity or better across connected workflows. Operator clarification, 19 November:**
where Kahuna is correct and can operate at the tested scale, Kupua must be the same
speed or faster, permitting only tiny differences. Earlier "provisional ballpark"
assessments do not accept material slowdowns. If Kupua can be faster while preserving
data integrity, it should be. Broad coverage remains the route to tuning, not a
substitute for meeting this finish line or a new research programme.

Slower operation is permitted only for the workload/scale where Kahuna demonstrably
loses data at that speed, or cannot operate at that scale. R014's concurrent data loss
does not waive parity for correct no-edit uploads or label edits. Report acknowledgement,
usable/confirmed state and correctness together; do not pick whichever timing hides a gap.

The operator reports Kahuna becoming unusable around a few hundred selected images
(roughly300, explicitly inexact), while Kupua can select5000. This is scale context,
not a measured crash threshold or proof of every5000-target editing workflow. Progressive
throttling at genuinely unsupported Kahuna scale is acceptable; it does not excuse
slowness at shared supported sizes or authorize changing existing action limits.

Tune the frontend, fix discovered bugs and make proportionate arrow/message UX repairs.
Record strong backend cases as GRID entries; do not modify backend code during tuning.
Aim for a coherent commit after parity-or-better criteria and validation are met;
confirm the acceptance/commit point with the operator, never push, and do not commit now.

- The near-term finish line is parity-or-better speed and correct final values across
  uploads without automatic edits, uploads with them, individual saves, batch arrows
  and selection edits. Use representative checks through the existing shared owners,
  not a campaign per field. Unimplemented rights, collection and lifecycle operations
  retain their own prerequisites but do not gate this performance work.
- Concurrent editing is the next gap, not a new perfection project. Reuse the prepared
  capture if still valid, then address material waits or correctness failures and
  check the other connected paths. Reuse adequate Kahuna and selection evidence.
- Choose one reasonable common candidate before exploring a settings matrix. Zero
  fixed write spacing has local support; finite polling and short typing debounce
  remain candidates, with explicit commits immediate and concurrency initially retained.
  Four zero timers are diagnostic settings, not an adopted policy.
- Timing and ownership are different: the measured baseline held the shared queue
  through readback; guarded metadata now has bounded earlier execution release.
  If unacceptable waiting persists, repair that specific ownership problem rather
  than repeatedly reducing timers. Preserve same-image ordering, fresh merges,
  truthful outcomes and no automatic replay; do not claim cross-client protection.
- Each additional experiment must change a concrete engineering decision. No repeated
  unchanged baselines, new planning document, generic scheduler or mandatory exact-file
  reset/profiling campaign. Use focused checks while experimenting, then required full
  regression and independent review gates on the coherent adoption candidate.
- Always report both speed and correctness against the relevant Kahuna evidence.
  Acknowledgement time is not successful completion when final values are wrong.
  After R012, the operator selected the missing100-image Kahuna concurrent comparison
  (R013) before further Kupua tuning; the earlier20-image witness is not its matched
  speed comparator. This does not reopen the adequate upload-only baseline.

Retain results in the existing ledger and current work in the worklog. A new agent
continues from the next unresolved behavioral gap; it does not restart policy design.

**Current checkpoint, 20 November:** R042 is the latest 100-file U0 result.
One run beat the existing valid Kahuna baseline; no further upload tuning is
selected. Keep first-slot behavior, messaging, and cross-user robustness as
separate questions. See the executive summary above for the pre-commit gates.

## 1. Objective and Current Decision

Kupua must match or beat correct Kahuna operation at shared supported scales, while
preserving metadata more reliably during overlapping work. Tiny differences are
permitted; material slowdowns remain open unless one of the scoped exceptions above
is established. Small file/network variation is not a blanket acceptance tolerance.
Correctness, responsive interaction and completion time matter together. A fast
counter or HTTP acknowledgement cannot substitute for correct final state.

- Uploads with automatic descriptions have sufficient local ballpark evidence for
  now: zero-delay Kupua 38.468s and current Kahuna 43.267s, both 100/100 correct.
  Do not repeat unchanged Kahuna upload-only baselines without a new question.
- Concurrent zero-delay editing now has R012's bounded correctness witness: all100
  final intended values passed, with three peers per arrow plus the source. Manual
  completion took2.92/3.56/5.31s and total completion82.13s (ingestion79.76s), so
  performance is not accepted. The811-910 capture is completed/stopped, not waiting.
- Kahuna's valid100-image concurrent comparator R014 is now available after R013's
  driver failure. Credit/Byline/individual acknowledgements took0.53/0.35/0.27s
  versus Kupua2.27/3.33/4.84s, but Kahuna lost five descriptions. Arrow targets differ
  (5/6 including source versus3peers). Kupua's pre-execution waits dominate its manual
  acknowledgement times: that is the next concrete target, not another unchanged
  baseline or an assumption that finite polling fixes it.
- The first acknowledgement-release candidate was rejected and removed after cold
  review: an owning metadata GET is eventually consistent, so a same-image successor
  can build a replacement from pre-write overrides. See the ledger's rejected probe.
  Subsequent research found the existing PUT response supplies actual stored overrides;
  the guarded frontend implementation now uses those as temporary comparison evidence
  with bounded owning reads, reservation lifetime and confirmation fallback. It has
  unit/build/review evidence and R015's preliminary two-image settled-save witness;
  see the ledger checkpoint and its non-clean full-E2E result. R015 acknowledgements
  took0.494/0.371s and final metadata passed, but its first segment was interrupted
  by driver readiness handling. It is not full rapid-chain, bulk or upload-overlap
  parity. R016-R019 provide subsequent selected-edit evidence below; do not repeat R015 merely for a fresh session.
  Do not reinstate unguarded release or assume GETs
  are fresh. The guard covers active/pending chains, not future independent saves.
- R021/R022 now cover uploads without automatic edits: both100captions correct,
  zero metadata mutations. Kupua all images available39.457s/follow-ups40.662s versus
  Kahuna32.804s; first-image times4.711/4.805s are comparable. The roughly20% full-batch
  availability deficit is an OPEN PARITY GAP, not an accepted result. Storage32.643s
  versus4.160s identifies transfer/preparation for tuning. Current-candidate upload overlap remains next;
  do not repeat successful settled/U0 baselines. R018/R019 settled100-Credit edits preserve metadata in both:
  Kupua ACK5.454s/observed6.541s; Kahuna3.277/12.841s after its arrow (101writes
  including sourceblur versus Kupua100). This is mixed: faster confirmation does not
  erase the slower acknowledgement boundary. Assess/close the relevant wait without
  blindly copying Kahuna's peak101outstanding writes. R017 character-by-character native browser input passed resumed
  typing across autosave:21characters retained,602msdebounce, final blur ACK131ms
  and observed1758ms, unrelated metadata preserved. Scripted cadence is not physical
  keyboard/IME coverage; no extra typing matrix is required before advancing.
  R016 selected-label add now passes100-target
  correctness at3.473s ACK/5.031s observed versus historical Kahuna2.15/2.70s:
  an OPEN PARITY GAP at a shared supported scale where Kahuna preserved all values.
  Finish the remaining overlap check, then tune these known gaps rather than accept them.
  Label removal was not rerun; reuse earlier selection evidence where applicable.
- P-ZERO is historical diagnostic evidence, not the current candidate. P-GUARDED
  keeps write spacing0/concurrency3, uses500ms readback and600ms typing debounce, and
  restores the established2000ms Upload retry interval. Its source reconciliation
  has3reads/100ms spacing/one15sdeadline. No overall shared-deployment policy or live
  parity claim is adopted; previous zero-delay timings do not validate this candidate.
- The local index is disposable: do not restore experimental values as housekeeping.
  Keep useful browser instrumentation/results, stopping active recording between runs.

## 2. Workloads, Not One Universal Benchmark

Start with the existing 100-image workload for comparable bulk work. A single target
is the low-cost latency/correctness control. Add another size only to answer an
observed scaling question; do not generate every combination of size and settings.

| Case | User workflow | Required result / important distinction | Readiness |
|---|---|---|---|
| U0 | Fresh uploads without automatic metadata writes | Ingestion/readability and first useful image; verify zero metadata writes | R021/R022 complete; both100correct/zero writes, Kupua full-batch availability about20% slower |
| U1 | Fresh uploads with automatic descriptions/presets | Ingestion plus correct intended metadata, separately timed | Description-only baseline available; presets are a separate addition if needed |
| U2 | Uploads plus rapid field arrows and an individual newer edit | Actual captured recipients, last intended source value, preserved descriptions/unrelated fields, queue and control-readiness waits | R012 correctness passed at bounded scope; material waits remain |
| M1 | Ordinary single-image typing and explicit saves | No dropped characters, preserved draft revisions, immediate explicit commit, no replay of uncertain writes | Test real typing, not only whole-value injected input |
| S0 | Select images and load/display their metadata | Immediate membership feedback, coherent panel data, no duplicate hydration or disruptive movement | Read-only selection path, not a mutation benchmark |
| S1 | Add/remove a label on a settled selection | Immutable target set, exact label result and preserved other labels; setup excluded from action timing | Existing 100-target evidence available |
| S2 | Edit ordinary fields on a settled selection; overlap with another save | Field preservation, offscreen targets, same-image ordering and unrelated-image waiting | Existing common metadata owner; timing still to establish |
| C1/C2 | Add/remove collection memberships | Correct canonical membership, permission handling and independent concurrent membership changes | Connected feature/contract selection required; removal has GRID-011 limits |
| C3 | Create/delete a collection-tree node | Tree, membership and counts are different outcomes; no invented cascade | Separate feature and populated-leaf decisions required |
| D1/D2 | Soft delete / restore | Authoritative lifecycle outcome, protected-target refusal, selection/focus behavior, no false success or automatic undo | Step 17 prerequisites and explicit destructive authorization required |

Hard deletion, crop/usage removal and partner publication are not ordinary performance
tests. Rights, leases, archive, crops and other multi-step families acquire their own
case only when selected; do not silently inherit an ordinary metadata policy.

For U0, use supported controls or an immutable fixture corpus with already-embedded
descriptions and no presets so both apps naturally perform no metadata writes.
Declare and verify the mechanism before timing. Do not fake successful writes, block
requests while claiming normal behavior, or call a duplicate reupload a fresh U0 test.
An existing-image reupload is a separately labelled workload if it becomes relevant.

For U2, trigger actions at a declared readiness/ingestion state, not by assuming that
the same elapsed second gives the same overlap in both apps. Record state at every
action. Kupua arrows exclude the source and save it separately; Kahuna includes it
and may include older current-upload jobs. Record actual IDs privately and counts
publicly. If membership differs, keep the correctness witness but qualify timing.
If overlap has ended, do not claim a concurrent test. Controlled held-response fixtures
can prove ordering; they cannot supply natural speed measurements.

## 3. Ordered Questions and Stop Conditions

| Question | Next smallest useful check | What the result decides |
|---|---|---|
| Q1: Does zero-delay overlapping Upload editing preserve values and remain usable? | R012 completed: values correct, no recorded displacement; individual save5.31s and overall82.13s | Bounded correctness established, speed not accepted; proceed to candidate policy, not another identical zero-baseline run |
| Q2: Which zero settings should survive? | Test ordinary typing; compare a finite read interval against zero using existing settled targets/shared observation, then the affected workflow | Keep immediate explicit actions; choose a bounded read budget and coalesced autosave without sacrificing useful speed |
| Q3: Is remaining Upload delay transfer or observation serialization? | Use the recorded waterfall; trial one bounded concurrency change only in the limiting stage | Whether to change transfer concurrency, observation concurrency or neither |
| Q4: Does the same write policy make selection edits fast? | Reuse S1 evidence and exercise S1/S2 with the candidate shared policy; distinguish selection hydration from command timing | Shared default versus an evidence-backed operation override |
| Q5: Does shared queue ownership create unacceptable contention? | Contrast a same-image successor with an unrelated save during bounded delayed readback | Whether a targeted ownership change is justified; queue release alone is not sufficient |
| Q6: Do other services require different policies? | For each newly connected family, establish its contract and request fan-out, then single-target and representative bulk behavior | A family/service profile only where measured cost or semantics justify it |

Use these questions as diagnostic routing under the execution priority above, not
six mandatory research phases. Record each result and move on once it is sufficient
for the engineering decision; pursue finer tuning after broad ballpark coverage.
R012's concurrent witness is complete. Any future prepared witness is not a mandatory
prerequisite to an operator-chosen reset: stop an unstarted recorder and record it as not run.
Do not silently lose or reset any in-flight mutation; record settled or unknown outcomes.

## 4. Exact-File Comparisons and Reset Epochs

Use a fixed corpus manifest per workload: version/name, ordered sample filenames,
file count, total bytes, size distribution, embedded-description expectation and an
aggregate content fingerprint. Compute identities privately for deduplication; do not
publish per-image Grid hashes or payloads. The original sample files stay unchanged.
**Operator-selected refinement, 19 November:** for future fresh-ingestion comparisons,
prefer paired copies of the same100 source images with distinct, equal-length metadata
markers. Keep image payload, dimensions and compression unchanged; verify actual
per-file sizes/byte totals, distinct content hashes and absence from the local catalogue
before each arm. Equal-length text alone is not proof of equal output size or freshness.
This reduces file-mix differences without resetting Grid; it does not equalize caches,
server load or prior processing history and is not an exact-byte/reset-controlled test.

Keep the marker neutral to the workload: U0 copies retain embedded descriptions in
both arms; automatic-filename-description tests must leave Description missing and
put the marker elsewhere. Freeze and record the prepared pair before timing, rather
than changing fixture policy between arms. Finish the already-prepared R021/R022 pair
first; do not repeat adequate baselines just to adopt this refinement. Original files
remain untouched and fixture generation stays within the approved Kupua directory.

Every destructive setup gets a reset-epoch ID. Exact-byte reuse is necessary but not
sufficient for equal starting state. Confirm, for the selected dedicated local stack:

1. Exact environment, compose project/working directory, endpoints and operator-approved
   scope. Distinguish Grid's ES from Kupua's isolated E2E ES. Preserve custom configuration.
2. Relevant image/search records, stored originals/derivatives, authoritative edits and
   upload statuses are in the declared starting state. For collection/delete cases also
   account for memberships, lifecycle state and other affected source stores.
3. Pending streams/queues/consumers cannot repopulate stale data after the reset. Record
   how quiescence and successful fresh setup were checked, without storing secrets.
4. Old app batches, drafts and cached results cannot be mistaken for the new epoch.
   Rebind live stores and verify runtime settings after reload; preserve authentication
   and reusable instrumentation where possible. Do not clear cookies indiscriminately.
5. Independently verify the starting state before timing. An empty search response alone
   is not proof that all authoritative state and storage were reset.

[Grid setup](../../../dev/script/setup.sh) currently implements `--clean` by deleting
local LocalStack data and calling `docker compose down -v`, followed by rebuilding and
setup. This is broader than an index deletion; compose scope depends on execution
context, and setup also regenerates configuration. Do not invoke it automatically or
assume this description proves every required baseline. The operator chooses/runs the
approved reset after its actual effects and configuration preservation are established.

For an exact-byte fresh-ingestion A/B comparison, reset/reseed the same declared state before EACH
arm. Do not compare the first fresh upload with a deduplicated second upload. Renaming
files, clearing descriptions, soft deleting, or deleting only ES is not equivalent.
The matched-source metadata-copy method above uses different content identities and
does not require a reset; do not describe it as an exact-byte comparison.
For settled edits, prepare the same logical before-state and target cohort for each arm;
setup is outside timing. Necessary preparation for the next named case is distinct from
gratuitous post-test value restoration. Never quietly reintroduce restoration as cleanup.

Default to an ordinary warm app with explicitly recorded backend/cache conditions.
Same files do not guarantee cold caches. Browser reload/cache bypass does not establish
cold decoded media, proxies or backend caches. A cold-start campaign needs its own question.

## 5. Experiments Without a Combinatorial Matrix

- Before a run, name the question, workload, control, changed setting, expected outcome
  and a result that would refute the hypothesis. Check the ledger for existing evidence.
- Change one control for causal diagnosis. A named bundle can be tested as an overall
  candidate policy, but do not attribute its result to one constituent change.
- Use a comparable pair, then reversed order/corroboration only when uncertainty affects
  the decision or before promoting an otherwise weak result. Reuse adequate independent
  evidence. Do not impose repeated Kahuna runs or a fixed campaign quota on every change.
- Record normal variation with per-run values/ranges. Do not compute a batch p95 from two
  runs or pool target latency across different workflows. Per-target p50/p95 is separate.
- Declare batch sizes, byte workload and partial failures. Do not divide a mixed workload
  by target count and pretend that makes it an upload-only comparison.
- If a candidate is wrong, record it and stop. Do not weaken assertions, hide an invalid
  capture, omit failed items, replay unknown writes or change the workload to make it win.
- Preserve failure witnesses. A genuine value-loss outcome is a valid failed result,
  not automatically an invalid performance capture. Instrumentation failure is different.

## 6. Keep a Small Set of Meaningful Controls

Do not remove every knob because one experiment set it to zero. Retain existing central
controls during research, distinguish their purposes, and add a new dimension only for
a demonstrated need. Do not build a configurable scheduling platform in advance.

| Control | Question / likely scope | Rule |
|---|---|---|
| Write concurrency | How much independent per-image work can the relevant services sustain? | Includes prerequisite reads and writes; same-image ordering remains mandatory |
| Fixed start spacing / admitted rate | Does capacity require a rate cap beyond concurrency? | Zero is a valid disabled setting; remove the fixed-spacing mechanism only if no supported profile needs it; preserve server backoff |
| Transfer/hash concurrency | How many file pipelines fit bandwidth, CPU and memory? | Separate from edit concurrency; bound whole-file hashing/memory, not just request count |
| Upload observation concurrency/interval | Is status/readability checking delaying availability or generating redundant work? | Distinct from transfers and metadata readback; no upload replay |
| Grouped edit readback interval/window | How quickly can we confirm visibility without excessive reads? | Query remaining targets, no overlapping reads in a group, stop promptly; keep acknowledgement distinct from visibility |
| Typing debounce | How do we coalesce a human's incomplete input? | Separate from backend throttling; explicit Save/blur/arrow actions should not wait for the typing timer |
| Target/cost bounds | What is a safe admitted action for this operation? | Not the selection-size or cache limit; do not raise it merely to improve throughput |

The current zero policy is diagnostic. A finite read interval around 500ms and the
existing 600ms typing debounce are reasonable NEXT CANDIDATES, not measured optima or
adopted defaults. No fixed write spacing is the leading local candidate; the recorded
selection timings already show its cost. Keep the current write concurrency while
testing spacing/readback before independently increasing pressure.

Profile dimensions are justified by evidence, not by the existence of an enum:

- **Operation:** record semantic conflicts, request fan-out, per-target cost and what
  counts as complete. Metadata replacement, collection removal and deletion are not
  interchangeable; fresh reads mitigate but do not prevent cross-client replacement races.
- **Backend/service:** competing operation families may share the same constrained store
  or stream. Do not give each its own full budget and call their sum safe. Local absence
  of 429s is not a production capacity certificate; GRID-019 remains a separate rollout
  constraint, not a reason to block authorized local experiments.
- **Batch size:** only add size-sensitive behavior after a reproducible change in cost,
  latency or responsiveness. First compare single-target and the representative bulk
  case; probe near an observed transition, not every possible size.
- **UI/context:** selection membership/hydration is not an editing queue. Preserve its
  immediate membership updates, coalesced reconciliation and stable publication. Upload
  and selection metadata/label edits already share the startup queue and operation owners.

No new policy may bypass capabilities, fresh owning data, immutable recipients,
same-image ordering, unknown-outcome fences, source/visibility distinctions or Stop.
Collections need their own membership/tree contracts (including GRID-011); soft delete
and restore need Step 17's lifecycle/acknowledgement decisions. A client-only timing
policy cannot repair a server lost-update or lifecycle-ordering race.

## 7. Required Measurements and Validity

Use the ledger's run record. Minimum useful measurements:

- Submission/action time, input/control readiness, queue wait, first dispatch, last
  acknowledgement, canonical confirmation and usable UI completion. Uploads also need
  first useful image, last storage acknowledgement and ingestion/readability completion.
- Per-service/route requests, outcomes, outstanding work and target/byte workload;
  separate command preparation, writes, observation, unrelated browsing and verification
  where reliably identifiable. Route alone does not identify a caller; otherwise say unknown.
- Independent final postconditions: exact intended fields/membership/lifecycle, preserved
  unrelated data, excluded targets and partial/unknown failures. Do not verify a receipt
  merely by reading back the receipt's own success flag.
- Source/build variant, actual runtime policy, data mode and local topology, corpus/epoch,
  app/viewport/foreground state and cache/seed conditions. HEAD alone is insufficient in
  this dirty worktree; retain a sanitized source fingerprint/patch reference where available.
- Capture limits, errors and cutoff. Report pending/aborted traffic and right-censored
  tails. Completion-window traffic and whole-capture traffic are different measures.

The template is not a demand to instrument every dimension on every run. Reuse the
existing bounded collectors; leave optional measurements explicitly unmeasured.
CPU/memory profiling, frame traces and backend metrics need a named unanswered question
and any applicable permission. Do not build a benchmark platform or delay an adequate
comparison merely to fill every field.

Align transport boundaries where possible: fetch headers and XHR loadend are not the
same timestamp. Do not interpret browser round trips as isolated server CPU time.
Use monotonic in-page clocks, actual action boundaries and observable readiness, not
controller round-trip time or arbitrary sleeps. Check live store identity and runtime
settings; the served source alone previously missed a stale 600ms autosave instance.

Keep instrumentation bounded and similar across arms; verify it before file selection.
Record foreground transitions. Position/paint probes can perturb layout; do not silently
add them to one arm and claim a precise performance comparison. Retain reusable installers
and private browser records, but stop owned listeners/timers/wrappers when a capture ends.

Persist only allowlisted aggregates, public synthetic filenames and sanitized evidence.
Never store cookies, credentials, signed URLs, real emails, raw live payloads, image IDs
or HARs in this public repository. Browser-private data is not a durable evidence record;
preserve the sufficient sanitized result before losing the session or resetting services.

## 8. How Evidence Becomes Policy

For each family, record one of: untested, contract-blocked, candidate, provisionally
supported locally, or adopted for a named deployment. There is no universal green flag.

1. Reject candidates that lose data, misreport success, drop input, replay uncertain writes
   or break browsing/selection. Preserve their failure record before repair.
2. Prefer the simplest candidate that gives acceptable useful-screen/save latency and
   total completion without unnecessary requests, memory growth or sustained overload.
3. Require parity or better against correct Kahuna operation at shared supported
  scales, allowing tiny differences only. Record evidence for any workload-specific
  data-loss or unsupported-scale exception; do not extend it to other workloads.
  Investigate material slowdowns without chasing noise or discarding adequate baselines.
4. Record the selected values, evidence IDs, limits, rejected alternative and unresolved
   capacity assumptions. Do not turn a local candidate into a shared default by implication.
5. Before adopting code, run the required coherent implementation/review/regression gates.
   Temporary knob experiments need appropriate focused checks/builds, not a new full E2E
   run every time. Do not claim earlier full gates validate later temporary settings.

## 9. Multi-Session Protocol

At session start, follow the fresh-agent rules and read the worklog's Current Task,
this plan's current decision, and the ledger's decision/question tables. Inspect the
actual browser for an already-armed/running capture and verify temporary source settings.
Choose the next unanswered question; do not rerun evidence merely because this agent
did not collect it. Missing live authority or feature support is a blocker, not permission.

After each experiment, append its result or explicit invalid/not-run outcome to the
ledger BEFORE treating the question as answered. Update the decision/question status
and worklog's current action. Keep IDs and old observations stable; correct errors with
an explicit superseding note rather than silently rewriting measurements. Record
temporary settings and unresolved work so a fresh agent cannot accidentally ship them.

Memory files are discovery aids, not the canonical run database. The worklog remains
populated throughout this investigation and is reset only before an approved commit,
after durable results/decisions have been retained here and in the ledger. No planning
or audit-only entry belongs in the implementation changelog.