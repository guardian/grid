# Editing Performance: Evidence Ledger

## Local collection membership pressure, 24 November

**Subsequent UI verification:** a 504-image selection in local Vite added the same fixture membership through Details, then removed it. Grouped media-api reads verified all 504 transitions in each direction and the selection was unchanged. This confirms the multi-group UI path separately from the timed command trials below; it is not a rate measurement.

One authenticated HTTPS Vite tab, throwaway local Grid, distinct images, five concurrent per-image command executions, no intentional start delay. The browser invoked the real gated command executor, not selection UI or a simulated service. Each collection command read the full image and owning memberships, then followed its advertised action. Grouped media-api mget reads checked all target IDs after dispatch. A 200-ID browser workload is not an increase in the shared scheduler's per-group limits. No direct ES, TEST or external publication.

| Workload | Images | Command completion, add / remove or restore | All observed, add / remove or restore |
| --- | ---: | --- | --- |
| Metadata-editor label | 100 | 1.92 / 2.24 s | 3.09 / 3.70 s |
| Collection A | 100 | 2.68 / 3.09 s | 3.88 / 4.40 s |
| Sibling collection B | 100 | 2.69 / 3.05 s | 3.86 / 5.08 s |
| Metadata-editor label | 200 | 3.93 / 3.53 s | 5.43 / 6.40 s |
| Collection, completed pair | 200 | 5.43 / 5.87 s | 7.05 / 7.53 s |
| Ordinary scalar override | 200 | 4.67 / 4.57 s | 6.48 / 7.07 s |

The two-path order was add A, add B, remove A, remove B. All 100 images retained B after removing A. An identical one-image add returned unchanged. The first 200-image collection add **did not complete**: dispatch stopped at 144 acknowledged and one unknown. No automatic replay. Later owning and projected reads agreed on 144 memberships across all 200 images. Deliberate cleanup acknowledged 144 removals, skipped 56 absent memberships, and confirmed 200 clean. No causal HTTP status was recovered. During the later successful 200-image pair all 400 membership writes returned 200; expected first-record GET 404s were not mutation errors. Final checks verified all 200 complete scalar override objects against their originals, zero owning memberships, empty projected memberships and absence of the trial label. Two empty fixture paths remain for UI testing.

**Decision:** no collection-specific numeric limit on this evidence. Use ordinary shared pacing and do not retry uncertain appends. Collections were slower than labels, but only modestly slower than ordinary metadata on this cohort. This is a local functional pressure trial, not a measured AWS capacity, multi-user, large per-image list, sustained traffic, or end-to-end selection UI guarantee. GRID-011's concurrent list-replacement race remains separate. The final stricter tree/404 checks were verified with one fresh add/remove, not another timed campaign.

## Executive Summary (20 November)

| Question | Headline result | Limit |
|---|---|---|
| 100 captioned uploads, no presets | R042 Kupua **28.048s** all available vs R038 **35.077s** and Kahuna R031 **29.601s**. First ready lead **3.646s** vs R038 **4.417s**. All 100 captions verified; **100 owning-metadata reads removed**, no writes. | One local comparison. The full timing gain is not attributable to the removed reads alone. No top jump observed in R042; earlier runs did see one. |
| 300 captioned uploads | Kupua **142.609s** vs Kahuna **151.381s** to all jobs complete; both correct. | Kupua had a leading-row display defect in that run. Not a scale ceiling or a clean UI win. |
| Settled batch editing and labels | Same 300-image batch, Credit/Byline acknowledgement: Kupua **11.018/21.557s** vs Kahuna **19.864/30.539s**; both final states verified. At 100 selected Labels: Kupua **2.173s ACK / 2.863s observed** vs Kahuna **2.15s / 2.70s**. | Kupua excludes the source from arrow writes; visibility mechanisms and label cohorts differ. Label removal not measured. No cross-user guarantee. |
| Editing during upload | Kupua preserved all intended values; Kahuna acknowledged faster but lost five descriptions. | Different target membership and timings; not permission to excuse slower unrelated workflows. |
| Experiments not retained | Parallel transfers, queued-request overlap and two observers did not earn their complexity or read cost in full availability. | Storage acknowledgement and first-check latency are not usable completion. |
| Pre-commit checks | Build and **3,960 units with four workers** passed. Full E2E **596/598**; U5 passed, and both density failures passed unchanged in isolation. | Default-worker startup timeout recurred; causes unestablished. No clean full browser gate. Upload messaging and review remain open. |

Use the [plan](editing-performance-plan.md) for workload definitions, reset and
measurement rules. This is the cumulative sanitized record across sessions, not a
new runner or a promise that all operation families are implemented.

## Current Decisions and Open Questions

**24 November: manual Details Credit during a 300-image Search Title edit.** Local Vite, same ordered selection and three recipient positions before and after; one run per case and revision. Times in seconds, before/after. Manual times start at Commit, bulk times at bulk Commit. Visible means a matching image in the app's search readback, not paint.

| Recipient | Bulk ACKs at manual Commit | Bulk ACKs at manual PUT | Manual PUT / ACK / visible (before; after) | Last bulk ACK / all visible (before; after) | App bulk-read requests / IDs (before; after) |
| --- | --- | --- | --- | --- | --- |
| Outside | 11 / 10 | 300 / 100 | 8.655 / 8.681 / 9.216; 3.413 / 3.442 / 4.001 | 9.333 / 10.045; 10.616 / 12.178 | 17 / 733; 20 / 806 |
| First recipient | 100 / 100 | 300 / 100 | 5.785 / 5.810 / 7.355; 0.378 / 0.406 / 1.432 | 8.830 / 10.375; 11.383 / 12.525 | 19 / 767; 19 / 774 |
| Late recipient (281st) | 10 / 11 | 300 / 300 | 8.220 / 8.245 / 9.816; 8.896 / 8.920 / 10.507 | 8.854 / 9.526; 9.512 / 10.207 | 18 / 735; 19 / 767 |

All six runs sent 301 PUTs, peaked at five simultaneous PUTs and independently verified both intended fields across the same 301 images. No latency or fleet-capacity guarantee: eligible manual visibility improved by 5.2 and 5.9 seconds, while all-bulk visibility finished about 2.1 seconds later in both lending runs; the no-loan control was 0.68 seconds later too. Read counts exclude independent verification; overlapping IDs count again on each read. The candidate waits for the borrowed Details readback before resuming; existing Form release rules are unchanged.

**23 November: receipt history, settlement and Upload persistence (local checks).**

| Question | Result | Interpretation |
|---|---|---|
| Does prior history make new submissions costlier? | With dispatch held, 100 new-revision submissions to one image took 2.47 ms with no prior settled saves, 4.50 ms with 500, and 32.55 ms with 5,000. Each history grew by 100. | Single Node observations of the metadata store, not browser latency or heap measurements. Do not evict unresolved receipts on this evidence. |
| Did settlement copy millions of receipts? | At 10,000 targets the old append expression would copy 49,995,000 earlier item references. At 499 targets a counting iterator measured 124,251 earlier references copied before the fix and zero after, with the same output order. | **Fixed for the private settlement accumulator.** These were browser-memory copies, not Grid reads. Progress snapshots still copy prefixes; no end-to-end speedup was measured. |
| Does every follow-up update need a descriptor write? | The jobs test counted two writes when only progress wording changed, versus one after the fix. Going from pending to uncertain also retains the same recovery marker. | Presentation-only updates skip membership rebuilding and persistence if the last write succeeded. Changed recovery facts still persist, and a prior storage failure can retry on a changed report. No frame-time claim. |

**22 November: post-review verification.** The production and hosted builds,
E2E typecheck and all 4,010 unit/component tests passed. The full synthetic
E2E wrapper then passed all 599 tests in 10.6 minutes. These checks cover the
reviewed Rights, save-feedback and Upload Form changes; they do not replace
the pending operator retest of focus, card position and flicker during a fresh
500-file upload. The local performance trials below predate the final review fixes.

**22 November: bounded fairness candidate and matched local recipient trial.**
On the same settled 500-image cohort, second recipient visible before typing,
the previous pump took 11.897s from individual enqueue to PUT (13.091s in an
earlier run). With a borrowed turn at a settled group boundary, the individual
PUT started after 200 peer starts, 1.240s after enqueue. Last key to enqueue
601ms, PUT to HTTP 200 44ms, acknowledgement to observed receipt 1019ms.
13/13 keyboard inputs overlapped peer dispatch with no read-only keys, wrong
target, focus loss or sampled viewport/field displacement. All 499 distinct
peer PUTs acknowledged with at most five PUTs in flight; the application
reported 499 observed, and an independent recipient read confirmed both fields.
Last peer start 16.490s versus 17.406s before; final peer ACK 16.535s, finished
receipt verified by 17.197s. One local comparison, not a throughput guarantee.
One input-to-frame callback reached 230ms; this is not queue wait. A synthetic
browser-store scheduling probe timed out and is not evidence. The owning
deterministic test failed before the repair on command order. It covers early
and late peers, delayed single readback, an existing shared waiter and borrower
session rejection with explicit unsent remainder. No speed knobs changed.

**22 November: attribution of long frames.** In an idle six-card Vite dev Form,
two page-only reads of 200 images had 21/13ms maximum frame gaps. Passive search
with one results publication had 158/243ms. The marked replay trace showed a
383ms instrumented task with React development task/JSX and Form render stacks;
trace overhead and nested stacks preclude exclusive production cost claims.
With peer arrays allocated only on click, a clean native-debug-task replay
gave 174/177ms. Suppressing console.createTask before dev startup gave
112/115ms, and restoring it reproduced the larger delays. This was diagnostic
only. Shallow memoization of scalar metadata fields reduced a subsequent
native-hook replay to 135/139ms; 10/11ms for raw reads. These are short
comparisons, not isolated per-component CPU savings. A marked live trace caught
a 205ms ingestion gap, but aggregate extraction failed on trace size; the raw
file was removed and no CPU attribution from that trace is claimed.

Two fresh 500-file local ingestion runs used verified comment-only cohorts,
the same two typing bursts and default filename sort. With final code in Vite
dev: 43/43 inputs, exact canonical Description, two pending transitions, no
read-only keys or measured focus/style/position regression. During typing,
median/max input-to-frame callback 3/18ms and largest sampled rAF gap 349.4ms.
A longer capped 20,000-frame sample gave p99 113ms, max 403.3ms (included the
short trace window). With production React in an isolated same-origin frame,
the compiled laptop client used the real local API/loader/edits and canonical
media, the same app entry, site settings and Form styling. All 43 inputs and
both pending transitions were verified again; median/max input-to-frame 3/9ms,
largest gap during typing 31ms. Longer capped 20,000-frame sample: p99 16.8ms,
max 32.8ms, no interval above 50ms. Both batches completed and retained 500/500.
Separately, a production diagnostic passive replay on the settled cohort had
15/20ms publication gaps and 11/13ms page-only gaps. The diagnostic frame and
local API mode are not a hosted deployment or physical-paint measurement;
these runs distinguish renderer/build effects without proving a universal bound.

**22 November: settled recipient scroll control and visible-recipient repeat.**
With no batch operation, focus with preventScroll left the second Description
1488px below the region top at offset zero (919px viewport). One browser key
brought it to 892px, exactly 596px of container scroll, without detachment. The
test character was removed and the original Description independently verified.
This reproduces the prior scripted-focus displacement without any batch writes;
it does not explain earlier operator-reported jumps while editing visible cards.

In a second settled 499-peer Credit action the recipient was deliberately brought
into view (442px) before measuring. All 16 keyboard inputs overlapped dispatch;
the original field stayed focused with zero sampled field or scroll displacement,
no read-only keydowns, and exact final Description and Credit on fresh readback.
499 distinct peer writes acknowledged, not 499 independent readbacks. Median/max
input-to-frame callback 4.3/8.8ms. Seven long tasks were observed across the action,
maximum 250ms. The recipient's peer write acknowledged 570ms after click; its
Description enqueued at 5581ms and dispatched at 17478ms (11.897s queue-to-PUT),
72ms after the last peer dispatch. HTTP 200 followed in 30ms, observed receipt
1027ms later. The pump releases dispatch only in the final group or at completion;
this is not network latency, nor authorization for a new scheduling policy.

**22 November: post-CSS live visual acceptance.** Fresh tab/cohort, 491 active
when binding the first submitted filename. Two pending-grant transitions, 36
keyboard inputs, two writes and matching final readback with 415 still active.
No measured position, focus, rights-arrow, reason order, empty-Credit red border
or Taken background artwork/position change. This is a DOM/style observation,
not paint certification. Median/max input-to-frame callback 3/32.1ms; maximum
sampled frame gap 275.9ms. All 500 ultimately completed and were retained in the
tab's batch descriptor, with no pending follow-ups or persistence issue. Targeted
Chromium separately opened the native datetime picker by clicking the painted icon.

During a separate 77s instrumented ingestion window there were 95 combined
searchAfter completions and 2316 batch sessionStorage writes (1.062s total
inside native setItem, maximum 3ms; excludes validation and serialization).
The five longest retained script spans (178-189ms) had at most 1ms of storage
calls and about 1ms of forced layout each. Chromium identified a promise
continuation at readJson's res.json().catch(...) call, not exclusive JSON-parse
CPU time. A scoped first-iteration observer on ten search-after response arrays
of 200 images measured at most 1ms per decode walk. The iterator wrapper can
change callback attribution: these are bounded controls, not a full CPU profile
or a finding that all downstream work is cheap. No pacing/cache changes selected.

**22 November: agent-driven local MCP run after the typing repair.** A separate
tab with verified runtime fixes and empty batch history submitted 500 matched
JPEGs. The first filename was focused with 489 active. 57 MCP keydowns and two
separately timed insertText commands (450 and 448 active in the pending-grant
state) produced 59 inputs; a fresh read matched the entire expected Description.
No tracked scroll displacement, read-only keydown or focus loss. Median/max
input-to-frame callback 4/31.4ms, maximum sampled frame gap 191.5ms. On the
second filename after deliberate scrolling, 29 keys produced 29 inputs, no
blur or scroll change, and the exact value was confirmed with 317 still active.
These were driven browser interactions, not a human responsiveness rating.
The operator saw empty Credit lose its red border and Taken's calendar flicker;
the first observer measured neither the Credit border nor calendar pixels.
The existing U5 fixture reproduced the red-to-gray transition before the CSS
repair and checked consistent red and calendar artwork afterward.

After all 500 completed and follow-ups settled, one confirmed source Credit
was applied to 499 peers. All 23 recipient Description inputs overlapped peer
dispatch, with no read-only keys, wrong target or blur. All 499 distinct peer
PUTs got successful HTTP responses; only the recipient's final Credit and
Description were independently read back. Last input to enqueue 600ms;
enqueue to PUT 13.091s; PUT to HTTP 200 27ms; response to observed receipt
522ms. Median/max input-to-frame callback 3.8/318.1ms. Container offset changed
by up to 596px after scripted focus; sampled field position on resize changed
by up to 18px. Cause and visual impact of that movement were not established.

**22 November: verified resident-slot repair, human 500-file ingestion.** The
running Form store was checked after reload. No reported jump, sampled region
movement, or target detachment. The operator still reported flicker and typing
blocks. The recorder counted 209 keydowns, 101 trusted inputs, and 20 keydowns
while the original Description was read-only; these counts do not measure lost
characters. One retained interval began after HTTP 200 but before canonical
observation, with focus, body identity and raw edit link intact, while effective
and pending grants were both false. The recorder did not identify every internal
read sequence or measure changes to neighboring controls in this trial.

The mounted held-response fixture reproduced the read-only transition when a
membership response followed dispatch and a newer, not-yet-matching confirmation
read retained the same edit link without publishing a body. The repaired local
draft check recognizes the newer authority read; the fixture also covers disabled
dispatch, remount/resumption and an unpublished permission withdrawal. No matched
human retest of this latest typing repair. The concurrent history-saving warning
was separately verified as the tab's local batch descriptor budget, not evidence
of credential expiry.

The U5 synthetic Chromium save journey now holds the fixture PUT, delivers a
later matching permission read ahead of publication of an earlier body, and
requires the mounted Description to show pending grant with its arrow disabled.
Browser keystrokes sent to the focused field extended its draft; after release,
the fixture backend contained the complete value. This isolates keyboard and
save behavior, not live ingestion load or timing after HTTP acknowledgement.

**22 November: post-repair human ingestion failed.** The operator reported
flicker, a large visible jump and loss of focus. Binding began with 486 of 500
attempts active. All five recorded text inputs went to the original Description.
Two sampled intervals had raw grant present but editable and pending-grant both
false; the still-focused field was read-only. Later the field emitted focusout,
then the virtualizer requested offset zero at zero, then the original input was
sampled detached (53ms after focusout). The recorder stopped on detachment with
no observed change to that region's scrollTop. This does not exclude a visible
content replacement or later movement; cause and later input destination are
unknown. No reload took place during the upload. The settled resident position
of the image identified by the last tracked Description receipt was zero; its
position during detachment is unknown. A focused synthetic early-batch growth
control (two to 22 members) passed without a product change. Membership growth
alone in that fixture did not reproduce this failure.

**21 November: matched 500-file local Form retest after draft retention.** All
500 completed; at closeout there were no active attempts or pending follow-ups.
The operator typed slowly across autosaves and at normal pace, and reported no
large or small jump. From binding to freeze the one-field recorder saw 386
scroll requests, no change in the tracked region's scroll offset, no sampled
target loss and 355 trusted text inputs, all on the original field. Six keydowns
on that field occurred while read-only; key contents were not retained, so
lost characters cannot be inferred. At least 52 retained input samples overlapped
sampled active ingestion. The last 256 input-to-next-frame callback delays had
a median of 2ms; the whole capture maximum was 65ms, with a separate maximum
frame gap of 218ms. These are instrumented callback timings, not paint latency.
The prior 631px jump did not recur and remains unattributed.

There were 34 tracked image-metadata PUT starts and 34 HTTP responses. For the
last Description receipt, last input to enqueue was 602ms, enqueue to PUT 50ms,
PUT to HTTP 200 55ms, and response to observed receipt 545ms. Ingestion was
already settled for this example. This was not the 499-recipient arrow workload.

The operator repeatedly saw the missing-credit and no-rights reasons swap order
after typing paused; the Usage Rights arrow, date-picker icon and field borders
disappeared. Those controls and reason order were not instrumented. The rolling
event detail does not establish their timing relative to the six read-only
keydowns, or that focus was lost during those changes. The existing held-read
fixture has one reason and exercises the focused Description, not those sibling
controls. No write-authority change follows from this observation.

**Settled single-card control, same batch.** With 500 complete and no pending
follow-ups, a one-character Description append and its exact restoration each
reached an observed receipt. A targeted fresh read confirmed the original
Description afterward. A card-scoped DOM observer saw no change in the order
of the two reasons (credit then rights), rights-arrow presence, Description
focus/read-only state, date input read-only state, or either input's computed
border colour. This checks DOM/style state, not painted native calendar-icon
pixels. No batch arrow was used. Settled autosave alone did not reproduce the
reported ingestion flicker in these two saves.

**21 November: typing during local 500-file ingestion.** On a foreground MCP Chrome
Form, the operator began typing with 13 attempts complete and 35 active. A bounded
observer tracked the original Description, its image identity, focus, native input,
scroll offset, card position and field offset. About three seconds after focus,
the still-focused input became read-only, its border transparent and its arrow
disabled. While the input was attached, a 899px viewport shift was accounted for
by container scrolling, not movement of the card in the list or the field in the
card. Later a blur was followed by a sampled detached input. None of eight recorded
text-input events targeted another image. Capture stopped during ingestion; the
operator subsequently reported completion with two errors. No failure causes inferred.

In the existing Chromium arrival fixture, starting a membership refresh *before*
entering the Description reproduced a shift from 100px to 1,226px below the viewport
top without losing DOM identity. Sampling the active Form target and position before
publishing the first page preserved the 100px position, caret and composition. A held
autosave alone allowed continued typing and saved the final value. Neither fixture
establishes that every live focus loss is fixed or explains which freshness/authority
check withheld editing. No matched post-fix 500-file trial or latency claim.

**Subsequent 500-file local MCP trial, same evening.** With the first-page placement
repair loaded, the operator focused Description with 27 complete and 45 active.
All 500 later completed. For the focused ID, all 434 sampled data-source results
advertised edits (calls can be nested; this is not a network-request count).
At the first read-only transition the mounted body was current, both attached and
shared overlays granted edits, but the command fence selected the unavailable
authority sentinel. There were 15 read-only transitions, 11 keydowns while read-only,
32 trusted input events and none on a different image. Unlike the earlier capture,
there was no sampled detachment or blur. The largest sampled displacement was 631px
of scrolling with stable card and field offsets; the longest sampled frame gap was
220ms. These are instrumented observations, not attribution of every stall.

A mounted fixture reproduced read-only on a parent rerender before readback, even
when an old granted response alone did not reproduce it. Form now separates the
active local draft from dispatch during that interval, preserving server validity
wording. A fresh grant can resume an unsent revision after remount; a withdrawn
grant keeps the draft read-only. Notice order was not recorded live. This repair
has not yet had a matched live rerun and does not establish the source of the
remaining viewport movement. Fresh ExifTool-comment copies of three existing local
cohorts were prepared for retest; no new upload was submitted during preparation.

**Acceptance clarification, 19 November:** Kupua must match or beat correct Kahuna
operation at shared supported scales, allowing only tiny differences. Slower is
permitted only where Kahuna is proven to lose data at that speed or cannot operate
at that scale; neither exception transfers to other workloads. This supersedes earlier
"provisionally adequate/ballpark" verdicts, not their measurements. Recent U0 and S1
results are summarized above. The operator's roughly300-versus5000 selection-scale observation
is context, not a measured threshold or permission to lift existing action limits.

| Decision/question | Current status | Evidence / next discriminating check |
|---|---|---|
| U1 automatic-description upload speed | Local ballpark criterion met for now; stop repeating unchanged Kahuna baselines | R007/R008, with R002/R003 context; not production capacity proof |
| A final common policy | Not selected for rollout; local candidate retains guarded source evidence, eight connected Label commands and five for a captured bulk ordinary-metadata save | Latest 3,960 units/117 files with four workers and build pass; latest full browser 596/598 and both isolated passes are not a clean full gate. See summary above. |
| U2 concurrent editing during uploads | R023 preserved all values on the guarded candidate; slower manual acknowledgements than R014, which lost five descriptions | Workload-specific correctness evidence only. Target membership and workload conditions differ; no excuse for the 100-file U0 gap. |
| Natural-cadence typing (M1) | R017 passes bounded resumed-typing correctness and immediate blur submission |21native character insertions/21trusted input events, resume during autosave; debounce602ms, final blur ACK131ms/observed1758ms. Scripted cadence, not physical keyboard certification |
| No-auto uploads (U0) | R042 beats valid R031 at 100 in one local comparison; attribution and repeatability not established | R042 28.048s vs R038 35.077s and Kahuna R031 29.601s. R042 removed 100 owning-metadata GETs; all captions correct. R032/R035: 142.609s vs 151.381s at 300, both correct; R032 had a separate leading-row display defect. |
| Selected-label editing (S1) | R026 closes most of the measured 100-image add gap; retain eight as local candidate, not general parity | 2.173s ACK/2.863s observed versus Kahuna R011 2.15/2.70s; both correct. Single local result, different Kahuna cohort; removal not rerun |
| Ordinary selected metadata (S2) | R027 bulk Credit faster at both measured boundaries; paths differ | Kupua 2.986s ACK/4.053s observed; Kahuna R019 3.277s/12.841s after Upload arrow, 101 writes including source blur. Both correct; no blanket parity claim |
| Settled Upload arrows | R029 repeated identical click produced one receipt; R036 same-target 300-image Credit/Byline comparison favored Kupua | R036 ACK 11.018/21.557s vs R034 Kahuna 19.864/30.539s; both correct. Confirmation mechanisms differ; not ingestion overlap or general fairness proof. |
| Collections / lifecycle operations | Contract/feature-gated, not performance-tested | Separate C1/C2/C3 and D1/D2 after the owning capability decisions |
| Shared deployment | NOT established by local tests | Capacity/admission decisions and final implementation gates remain separate |

After R041, the next candidate removes redundant work rather than adding
parallel requests. An owning regression reproduces Credit A, B, A leaving
the overlapping peer at B; the fix preserves A while coalescing an adjacent
repeat. The persistence witness sent three follow-up reports with two status
transitions: the identical second report previously wrote the descriptor again;
the candidate writes only the two real transitions, synchronously. This is a
controlled test, not a live estimate of main-thread savings. The caption fast
path reuses validated positive evidence from the required exact visibility
read, retaining the guarded filename action for empty or inconclusive data.
Compare owning-metadata reads, follow-up settlement, and first/full image
availability separately (see R042 for the live result).
The amended U5 browser journey passed, including caption preservation, a preset
label and only that label's owning metadata read. Full E2E (retries off) was
596/598: two density cases timed out and passed unchanged in isolation. This is
not a clean full gate; the causes were not established.

## Variant Register

Never silently change the meaning of an existing variant ID. Record unknown legacy
fields as unknown; do not manufacture a historical source fingerprint from today's tree.

| ID | Known distinguishing policy |
|---|---|
| P-SERIAL | Upload filename saves each own the shared slot through observation; configured write ceiling3/start250ms; earlier bounded/stretched readback |
| P-GROUP | Already-waiting independent saves co-admit; write ceiling3/start250ms; connected readback three attempts, minimum1s with stretched final check |
| P-CADENCE | Grouping retained; write3/250ms; connected regular1s reads to existing deadline; upload retry interval2s; Form debounce600ms |
| P-ZERO | Temporary write3/0ms; connected read interval0; upload observation interval0; Form debounce0. Serial upload/observation ownership and shared edit ordering retained; deadlines/server backoff unchanged |
| P-GUARDED | Frontend-only acknowledgement-content guard and bounded earlier metadata execution release; write3/0ms; two retained slots/groups,200 observation-target entries; readback500ms; typing600ms; Uploadretry2000ms; source reconciliation3reads/100ms/one15sdeadline. Settled saves, labels, character input and bulk Credit evidence R015-R019 |
| P-GUARDED-AUTH | Same pacing/queue policy as P-GUARDED, with exact-accepted-read authority preserved when metadata has no edit timestamp. Repair after R022; no live timing yet.3953units/build/types pass; full E2E596/598 plus2isolated passes, NOT clean |
| L-250 / L-100 | Historical selected-label experiment: three image executions, respectively250/100ms start spacing, three grouped reads and stretched final check |
| K-NATIVE | Unchanged native Kahuna for each cited run; upload bulk prepare/concurrent starts; shared polling queue10, retry waits510ms upward; Form typing750ms/blur0. Label action concurrency differs from Upload arrows |

P-ZERO's connected reads are time-bounded, NOT capped at eleven attempts. Its build
passed; the earlier3,945-unit/cadence review and full E2E results do not validate these
later zero settings. Full E2E before zero was595/598, then the three unchanged cases
passed separately; do not turn that into a clean full run.

## Run Register

All timings are seconds from the stated submission/action. Legacy uploads used
different sample ranges, not a verified exact-byte/reset pair. "Confirmed" below is
the recorded app/observer boundary, independently checked afterward, not the time of
that separate verification request. Transport timestamps retain their historical
fetch/XHR boundary limitations. Missing cells mean not recorded/not applicable, NOT zero.

| ID | Case / app / variant | Samples; files; bytes | Last storage ack | Last metadata ack | Metadata confirmed | Correctness and limits |
|---|---|---|---:|---:|---:|---|
| R001 | U1 Kupua P-SERIAL,18Nov |31-130;100;27774867|26.805|238.450|239.702|100 descriptions verified;100 metadata PUTs;319 captured mgets |
| R002 | U1 Kupua P-GROUP,18Nov |131-230;100;30307254|27.245|49.344|54.702|100 descriptions verified;100 PUTs;19 mgets |
| R003 | U1 Kahuna K-NATIVE,18Nov |231-330;100;27345698|3.751|37.335|37.960|100 descriptions verified;100 PUTs; native uploaded35.471 |
| R004 | U2 Kupua P-GROUP,18Nov |371-390;20;4548554|3.815|32.586|37.808|All20 intended descriptions/Credit/Byline/unrelated metadata;34 PUTs; six peers per arrow; source separate |
| R005 | U2 Kahuna K-NATIVE,18Nov |391-410;20;5646481|1.540|7.919|-|VALID CORRECTNESS FAILURE:18/20 descriptions; two overwritten despite200 acknowledgements. Intended Credit/Byline correct; two recipients including source;27 PUTs |
| R006 | U2 Kupua P-CADENCE,19Nov |411-510;100;26994460|34.260|52.457|53.719|All100 intended fields/unrelated metadata verified;119 PUTs; NOT an upload-only comparison |
| R007 | U1 Kupua P-ZERO,19Nov |611-710;100;30314742|27.767|37.516|38.468|100 descriptions/unrelated metadata verified;100 PUTs; no manual actions |
| R008 | U1 Kahuna K-NATIVE,19Nov |711-810;100;30220686|4.573|42.201|43.267|100 descriptions/unrelated metadata verified;100 PUTs; no manual actions |
| R012 | U2 Kupua P-ZERO,19Nov |811-910;100;28249011|36.280|81.654|82.102|100 descriptions/Credit/Byline/unrelated effective metadata verified;108 PUTs; three peers per arrow plus source; overall parity NOT established |
| R013 | Intended U2 Kahuna K-NATIVE; INVALID overlap capture |911-1010;100;27223526|4.881|45.479|46.684|Driver selector failed; ZERO manual actions. Incidental U1 result:100 descriptions/unrelated effective metadata correct; not a concurrent comparator |
| R014 | U2 Kahuna K-NATIVE,19Nov |1011-1110;100;25405130|4.643|46.069|-|VALID CORRECTNESS FAILURE:95/100 descriptions, five overwritten; all Credit/Byline/unrelated metadata correct;114 PUTs all200; five/six arrow recipients including source |
| R015 | Settled explicit saves, Kupua P-GUARDED,19Nov |Existing811/812;2images;4saves in two segments|-|0.494/0.371 from each action in measured second segment|1.541/0.914 from each action|All final intended/unrelated metadata checks pass; first segment interrupted by driver readiness error, NOT a complete four-save timing or U2 comparison |
| R017 | M1 Kupua P-GUARDED,19Nov |Existing813;1image;21character insertions/two saves|-|1.106 after first burst /0.131 after final blur|2.132 after first burst /1.758 after final blur|21/21characters accepted; exact final Credit and unrelated metadata preserved; scripted native editing, not whole-value injection or physical keyboard |
| R018 | S2 Kupua P-GUARDED,19Nov |Existing811-910;100selected;Credit overwrite|-|5.454|6.541|100/100 intendedCredit and preserved descriptions/unrelatedeffective/rawmetadata/otheredits;100PUTs, max3submitted |
| R019 | Settled100-target Credit arrow, Kahuna K-NATIVE,19Nov |Existing1011-1110;100;source included|-|3.277 fromarrow;3.391 frominput|12.841 fromarrow;12.954 frominput|100/100 finalCredit and preservation;101PUTs include sourceblur;95existing descriptions remain95, no new loss |
| R020 | U0 Kupua P-GUARDED; INFRASTRUCTURE-BLOCKED |Captioned copies1111-1210;100;30082933|19.017|-|-|100storage200/local,0indexed/100uncertain at cutoff; SQS502/504 consumer failure. No metadata saves started; U0caption/correctness/performance not established |
| R021 | U0 Kahuna K-NATIVE,19Nov |Captioned copies1211-1310;100;26526163|4.160|-|32.804 embedded captions/readability|100/100captions/filenames/preserved effective metadata/raw overrides/labels; zero metadata mutations; native counter also32.804 |
| R022 | U0 Kupua P-GUARDED,19Nov |Captioned copies1311-1410;100;27742885|32.643|-|39.457 images available;40.662 follow-ups|100/100captions/filenames/preserved effective metadata/raw overrides/labels;100unchanged follow-ups, zero metadata mutations; Activity40.725 |

| ID | Selected-label workload,10Nov | Last acknowledgement, add/remove | All observed, add/remove | Correctness / interpretation |
|---|---|---|---|---|
| R009 | S1 Kupua L-250;100 targets each |24.98 /24.96|30.01 /30.01|All100 each;100 prerequisite GETs+100 writes+3mgets per action; same-cohort control |
| R010 | S1 Kupua L-100;100 targets each |10.13 /10.10|15.16 /15.15|All100 each; only spacing changed; not an adopted default or cloud-capacity calibration |
| R011 | S1 Kahuna K-NATIVE;100 targets each |2.15 /2.42|2.70 /2.94|All100 each; comparison with earlier250ms Kupua baseline, not the later100ms pair; up to30 client writes outstanding |
| R016 | S1 Kupua P-GUARDED,19Nov;100 existing targets, ADD ONLY |3.473 /not run|5.031 /not run|100 exact label sets and preserved effective/raw metadata/other edits; max3submitted; historical comparison, not matched rerun |

Historical sources: [Upload grouping/overlap report](gradually-growing-teeth.upload-workplan.md),
[selection addendum](gradually-growing-teeth.kupua-edits-steps.md#step-6-local-testing-addendum-10-november-2026).
R006-R008 were recorded in the live worklog and sanitized browser summaries, now retained
here so resetting the worklog cannot erase them. Exact legacy source/corpus fingerprints
were not recorded; their absence must remain explicit.

### Details That Affect Interpretation

- R004 queue waits were about8.4/15/23s. R005 native counter finished7.877s;
  only18 descriptions were visible by8.502s, and singleton reads continued through
  an approximately62s cutoff. That tail is right-censored, not a known finish time.
  Later repair of those two descriptions does not change the failed outcome.
- R006 Credit at8.882s targeted5peers; Byline at13.225s targeted12peers; individual
  Credit at13.884s. A3.684s readiness wait prevented the intended200ms action gap.
  Queue waits were about4.1/6.8/12.5s. First image6.929s, ingestion40.280s,
  Activity53.805s.30mgets/219singleton reads. Operator reported a page jump, but no
  position trace exists. Those19 fields were restored before the later no-restoration
  instruction; never repeat that housekeeping.
- R007 first image2.412s, ingestion36.282s, Activity38.485s.338mgets,
  201singleton requests,345status requests (245success+100known queued400),
  358other image reads (290success/68abort),1,643 captured requests. No recorder
  errors, overflow or unfinished requests at stop; all storage destinations local.
- R008 first image5.107s, uploaded/counter40.667s, last singleton43.879s.
  One prepare,963status requests (863success+100known queued400),550singleton,
  1,717 captured requests. No recorder errors, overflow or pending requests at stop.
- These request totals cover their capture windows, not a normalized equal-duration
  load interval. Mget counts include preparation/observation where route classification
  did not distinguish them; do not label all338 as pure confirmation retries.
- Earlier331-350/351-370 submissions were invalid OVERLAP witnesses because of stale
  store and read-only-input instrumentation failures. Their successful ingestion does
  not supply concurrent-editing evidence. The later single-image preflight is not a
  settled-batch arrow test. No need to repeat these failed measurement approaches.

### R012: Concurrent Upload and Metadata, 19 November

Operator selected the prepared811-910 cohort on the same local Kupua Vite/Grid
setup. Live editor and0ms autosave, served0ms start/read intervals and concurrency3
were checked before selection. Existing recorder/driver reused; no source change,
reset, new instrumentation or value restoration. Selection was exactly100 files,
28,249,011 bytes. All100 captured storage destinations were local.

| Action | Time from selection | Captured peers | Queue wait | Submission to finished |
|---|---:|---:|---:|---:|
| Credit arrow |12.128s|3|1.718s|2.920s|
| Byline arrow |12.427s|3|2.663s|3.563s|
| Newer individual source Credit |12.845s|Single source|4.212s|5.306s|

At both arrows four images were available, ingestion continued, and one automatic
follow-up remained pending. Source Byline saved separately (3.541s queue/4.513s
completion); the earlier unsent source Credit was superseded without a write.
Controls were ready within0.1ms of each driver readiness check. This is whole-value
browser input, not a natural-typing or settled100-target arrow witness.

First image available3.072s; ingestion complete79.757s; final metadata readback
82.102s; automatic follow-ups complete82.129s; Activity completed82.150s. All108
metadata PUTs returned200 and were observed. Independent post-run mget returned100
distinct targets and verified all100 descriptions, expected Credits/Bylines and
unrelated effective metadata. Four images were affected by manual actions; the
other96 kept baseline Credit/Byline. The latest individual source value survived.
An extra original-metadata equality check was invalid: full singleton baselines
contain three original fields while lean mget returns an empty object. Original
metadata was therefore NOT independently assessed; this is not a value-loss finding.

Traffic:100 prepares,100 storage PUTs,730 status requests (630success/100known
queued400),208 singletons,108 metadata-original reads,625mgets and395 other image
reads (320success/75without HTTP status),2,374 total. Mgets include preparation and
observation, not625 identified retries. No recorder errors, overflow, sampled
foreground loss or pending requests at stop. Recording stopped at358.549s after
selection, but the final captured request ended84.106s; do not call the idle tail
workflow latency. All cleanup checks passed; useful capture/helpers remain.
Seven recorded focus/scroll events had document/region offsets0; no displacement
was recorded, but this is not frame-by-frame geometry or responsiveness certification.

Compared with R007's retained capture, prepare median rose54->97ms and status
median41->62ms; metadata PUT median was126->122ms. This local run used different
files and eight additional writes, without controlled backend conditions: neither
a causal slowdown from manual edits nor polling overload is established. Manual
waits are shorter than earlier witnesses, but recipients differ. **Verdict: bounded
concurrent correctness passes; five-second individual saving and82-second total
are not accepted as the performance finish line.** Next candidate: finite polling
with immediate write dispatch and short typing debounce, then representative checks
across connected paths. No new policy value or queue redesign selected by this run.

### R013: Failed Concurrent Driver, 19 November

All100 files uploaded, but the driver timed out at its first readiness condition
without sending any manual edit. The agent used `.current-uploads` as an editor
container; it is only the heading. The capture is INVALID for U2, not a product
correctness failure or evidence that Kahuna has no overlap opportunity. The recorded
model reached four uploaded images at8.786s, with only three descriptions visible.

Recorder stopped/cleanup passed, with no pending requests or overflow. The selector
was corrected in the retained helper/sessionStorage to
`section[aria-label="Your current uploads"] ui-required-metadata-editor`.
Immediate read-only validation found exactly100 current-job IDs, all with baselines
and enabled Credit/Byline inputs/arrows, excluding50 recent-upload editors. No field
was changed by that validation. This checks the corrected selection, not successful
execution of the full concurrent driver; at that checkpoint no retry had run.
R014 below records the subsequent operator-approved retry.

Incidental upload-only result: first uploaded5.364s; storage4.881s; native uploaded/
counter43.655s; last metadata acknowledgement45.479s; all descriptions46.684s;
last singleton47.275s. Independent mget verified100 distinct images, all100 expected
descriptions and all unrelated effective metadata, including unchanged Credit/Byline.
Exactly100 metadata PUTs returned200. Traffic: one prepare,100storagePUTs,995status
requests (895success/100known queued400),550singletons,100metadataPUTs,one image-read
and three other reads; all100 prepared storage destinations local, no sampled
foreground loss. Capture stopped81.120s; idle tail is not workflow latency.

Do not compare46.684s to R012's82.129s as equivalent workloads: R012 includes manual
edits, R013 does not. Retain as another upload-only observation, not a reason to run
more upload-only baselines. Samples911-1010 are USED. The missing concurrent comparison
needs a fresh cohort and the corrected driver; no reset, restoration, product edit
or test suite followed. Report the agent's selector error explicitly, not as a
Kahuna timeout or a successful concurrent witness.

### R014: Kahuna Concurrent Retry and R012 Comparison, 19 November

Operator approved/submitted100 fresh files1011-1110,25,405,130bytes. Corpus hashing
found no duplicates; the pre-run915-image catalogue contained no candidate filenames.
Reload removed old current groups; presets0 and local services verified. Corrected
driver completed all three actions with no capture errors/overflow or sampled
foreground loss; all100 storage destinations were local.

| Action | Time from selection | Actual targets | Action to all relevant acknowledgements |
|---|---:|---:|---:|
| Credit arrow |7.608s|5 including source|0.528s|
| Byline arrow |8.039s|6 including source|0.346s|
| Newer individual source Credit |8.386s|1|0.275s|

At Credit, five images were uploaded, one description visible and three metadata
writes outstanding; at Byline, six uploaded/one described/four writes outstanding.
At individual entry six were uploaded/one described, with no metadata PUT currently
outstanding. Ingestion and automatic metadata genuinely overlapped the arrows.
Requested200ms gaps became431/347ms. Six images manually affected,94 excluded;
recipient growth/source inclusion differ from R012, so no exact throughput ratio.

First uploaded5.406s; storage4.643s; native uploaded/counter44.261s; last metadata
acknowledgement46.069s. Model reached95 descriptions at47.334s and never100 during
capture. Independent mget returned100 distinct images:95 descriptions correct,
all100 expected Credits/Bylines and unrelated effective metadata correct, including
the newer individual Credit. Five manually affected images had empty descriptions.
Each had an acknowledged filename-description PUT and a later-started acknowledged
editor replacement omitting description. This repeats R005's loss at100-file scope;
it is not an HTTP failure or permission to repair Kahuna. No values restored/repaired.

All114 metadata PUTs returned200. Traffic: one prepare,100storagePUTs,861status
requests (761success/100known queued400),1,518singletons,one other image read and
five other reads:2,600 total.819singletons began after the95-description boundary.
Last captured singleton ended109.274s; recording stopped109.294s with no request
then pending. Native scheduled polling may continue: the tail is right-censored,
not proof all application work ended. Fetch/XHR/listener/driver cleanup passed;
helpers/private capture retained. Three focus events had offsets0, not frame-level proof.

**Speed AND correctness comparison:**

| Measure | Kupua R012 | Kahuna R014 |
|---|---:|---:|
| Credit arrow: action to all acknowledgements |2.271s (3 peers)|0.528s (5 including source)|
| Byline arrow: action to all acknowledgements |3.333s (3 peers)|0.346s (6 including source)|
| Individual Credit: action to acknowledgement |4.838s|0.275s|
| Pre-execution queue wait: Credit/Byline/individual |1.719/2.663/4.197s|Not separately measured|
| Native ingestion/readability completion |79.757s, includes indexed visibility|44.261s, native uploaded|
| Overall intended metadata correctly completed |82.129s follow-ups; final values verified|Not achieved: five descriptions lost|
| Final Description / Credit / Byline / unrelated metadata |100/100 each|95/100 descriptions;100/100 other checks|

Kupua acknowledgement timestamps are receipt events after response; Kahuna uses XHR
loadend and first matching per-target payload after each action. Kupua's observed
values arrived2.876/3.523/5.247s after recorded actions; R012 terminal save times also
include publication/store settlement. Kahuna's acknowledgement is NOT canonical
confirmation; intermediate manual readback timing was not captured. Different files,
recipients, native ingestion contracts and uncontrolled backend conditions remain.

**Decision:** preserve correctness protections but reject long manual queue waits
as their price. Zero timers have not removed those waits. Investigate the smallest
shared execution/observation ownership change using this capture and existing
regression witnesses before another upload or unrelated tuning. Queue release alone
still conflicts with single-group freshness admission; no generic scheduler or
weakened same-image protection is selected. Finite polling/typing debounce remain
candidates, not a demonstrated queue-wait repair. No product change or tests here.
The concurrent comparator is now available; do not repeat it unchanged for a new agent.

### Rejected Acknowledgement-Release Probe, 19 November

Operator selected investigating/removing the measured queue wait. Two temporary
tests in the existing metadata suite held confirmation while submitting a same-image
or independent successor. Both failed on the current queue, then passed a candidate
that released execution after acknowledgement and bounded overlapping confirmation
to two groups/200 target entries (500ms read interval). This established the waiting
mechanism, NOT safety of the real source merge: the mock supplied current overrides.

Independent GPT-6.1 Sol review found a P1 same-image preservation risk. The existing
[override read](../../../metadata-editor/app/controllers/EditsController.scala#L73)
uses [DynamoDB get](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/DynamoDB.scala#L39)
without strong consistency. After description write A is acknowledged, successor B
can receive pre-A overrides and send a whole-object replacement that drops A. This
source-supported scenario was not reproduced live. Eventual consistency predates
the candidate; releasing while all visibility remains pre-write newly exposes it.
The current confirmation barrier mitigates this window, not cross-client races.

The candidate and inadequate temporary tests were removed; earlier dirty work and
all four diagnostic zero settings were restored. Two existing draft-coalescing/
uncertain-no-replay cases passed afterward (3.25s runner). Wider candidate tests
had15 failures across the two owning suites; timing-policy changes affect several
assertions, but no complete causal classification or full-gate pass is claimed.
No new live mutation, backend edit, dependency, E2E run or performance claim resulted.

The initial recommendation for a narrow strongly consistent pre-save endpoint read
was explicitly DECLINED: the operator prohibits backend changes at this stage.
Such a future change would cost twice the per-read Dynamo capacity and still leave
cross-client GET/PUT races; it is an improvement idea only, not a prerequisite or
pending permission request. The frontend-only research below supersedes that route.

### Frontend-Only Research and Stale-Read Probe, 19 November

At the operator's request, two read-only Explore delegates investigated existing
scheduling and source-response evidence independently. No backend/live changes.

- **Existing acknowledgement evidence:** the metadata PUT response contains the full
  stored override object, derived from DynamoDB ALL_NEW, after configured domain-field
  filtering. It does not contain the enclosing edit timestamp; owning GET timestamps
  are application wall-clock values, not conditional-write revisions. See the
  [setter](../../../metadata-editor/app/controllers/EditsController.scala#L155) and
  [Dynamo update](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/DynamoDB.scala#L195).
  Kupua currently discards that successful response body.
- **Preferred candidate:** retain validated acknowledgement content only as bounded
  comparison evidence for an active/pending same-image save chain. Require the next
  owning GET to match before constructing replacement from THAT GET, never from the
  witness. A read mismatch permits bounded read-only reconciliation, not mutation
  replay or blind merging. Missing/malformed evidence must retain acknowledgement but
  cannot authorize early release; preserve the existing confirmation path. Persistent
  mismatch/unknown writes remain unsent or uncertain, not success. Lifecycle, limits,
  receipt publication and queue integration still need implementation/review.
- **Independent smaller candidate:** broaden existing co-admission from disjoint
  singleton saves to disjoint multi-target actions, bounded by union<=100. Adjacent
  peer-arrow/source saves could share one observation round while same-image barriers
  remain. Source-supported only, not measured or implemented; cannot remove all waits.
- **Higher-cost option, deferred:** combine already-queued distinct-field writes into
  one per-image PUT. This requires multiple receipt/draft owners and field-level Stop
  handling; do not implement merely by concatenating payloads or cancelling whole images.

**Reversible real-executor probe:** added one case to the existing command suite.
Filename Description PUT returned the resulting full overrides, including Credit,
an explicit empty keyword list and nested domain data. The next Credit save received
pre-write overrides: a temporary optional required-metadata argument refused it
without a PUT. After the fixture supplied matching GET content (reversed object-key
order), a new explicit invocation wrote Credit and preserved all other fields.
No cached body was used as the replacement base and no mutation was replayed.

The test failed first because the executor discarded acknowledgement content, then
passed the temporary guard. All17 command tests passed with the probe (0.486s runner),
including existing empty-response acknowledgements and unknown-outcome checks.
Probe source and test were removed afterward; all16 original command tests passed
(0.558s). No product change remains and no live latency claim follows. The retired
probe used optional `metadataWitness` on acknowledged results, an optional comparison
argument to executeGridCommand, sorted-object-key JSON equality before metadataChange,
and validated successful response data; it did not modify the queue or persist evidence.

**Limits before adoption:** one fixture proves this stale-GET refusal/preservation
path, not complete normalization or conflict handling. Full comparison must distinguish
absent overrides from explicit empty text/list, account for unordered Keywords/People
versus ordered Subjects, and handle date/domain serialization conservatively. Ordinary
Dynamo GET converts null to empty string, whereas ALL_NEW does not: do not normalize
ambiguous differences into an unsafe match. Exact content equality protects the known
same-client base, not freshness against another user or conditional-write semantics.
An independent metadata change may legitimately mismatch; no automatic overwrite of
that disagreement. Bound read attempts AND time; current0ms polling is not that budget.
Keep witnesses in existing operation/freshness ownership, not a second display/data cache.

### Guarded Implementation Checkpoint, 19 November

P-GUARDED integrates the frontend comparison evidence with the shared queue. Earlier
execution release requires acknowledged/unchanged metadata with usable evidence;
confirmation remains separately owned. At most two slots/groups and200 observation
entries remain retained, with only one executing write group and three command
flights. Non-final chunks of larger actions still wait for confirmation. Details and
limits belong in the [command contract](../../src/dal/grid-api/README.md#u5-ordinary-metadata).

Evidence is captured before executor awaits, retained only with image reservations,
and omitted from receipt history. Missing successful response content preserves ACK
and withholds the fast path; accepted canonical raw overrides can supply missing
comparison evidence. Stale owning GETs are bounded read-only reconciliation, not
mutation retries. A newer canonical override object matching newer source evidence
can settle an obsolete same-field observation as superseded without stale publication.
This protects active/pending chains, NOT general later independent saves or other users.

Independent GPT-6.1 Sol review reproduced two gaps: disposal clearing evidence before
capture, and stale owning reads after missing-body fallback. Both received failing-first
real-executor regressions and repairs. A fresh accumulated review found no blocker
within the stated guarantee; its missing final-chunk/earlier-target coverage was added
to the existing101-target test. No new test suite or E2E journey. Old250ms-start tests
now hold real flights/unsent work under zero spacing, preserving Stop, throttle,
authentication, coalescing and unknown assertions. Seven unit cases added overall.

Validation on retained source: full units3952/117files passed with two workers
(136.92s); normal build and browser typecheck passed, existing WASM/chunk warnings
remain. Full retry-free E2E597/598 passed (12.3m), NOT clean: reloaded detail/table
cancel timed out waiting for a position-map entry at ui-features.spec.ts:2437.
Its preserved trace had zero metadata writes; cause unestablished. The unchanged
case passed separately with retries disabled (9.4s total,4.6s case). Artifacts:
`kupua/node_modules/.cache/guarded-editing-e2e/full-run/`. Do not combine these into
a598/598 full pass. The initial full-unit attempt stopped on the prior zero-delay
Upload experiment; restoring the existing2000ms retry interval made its unchanged
10-case suite pass before the successful full-unit run.

No backend change, real edit/upload, reset, deployment or performance campaign.
Kupua was stopped to free test ports; verify/restart the operator's normal configuration
before live comparison and rebind helpers after reload. Next use existing uploaded
images for a bounded speed-and-correctness check; retain R014 as comparator rather
than repeat unchanged Kahuna uploads. No measured speed improvement claimed yet.

### R015: Settled Saves, 19 November

Operator approved four explicit saves on existing image-811.jpg/image-812.jpg:
Credit, Byline and newer Credit on811; Credit on812. No uploads, arrows, reset or
restoration. Normal Kupua was reachable but its retained editor still used0ms
debounce. After checking the old recorder was stopped and all300 retained attempts
complete, reloaded and verified live600ms editor, exact loaded upload store against
the three-batch chooser, and local API/metadata/auth/loader destinations. Served
policy matched P-GUARDED. No product change or test-suite rerun.

The shortened driver submitted Credit then Byline270ms later, but stopped before
the third action because Credit was unavailable. Unlike the retained helper, it
omitted a bounded editable-control wait. This is incomplete timing evidence, not
a failed metadata save or a proven product defect; exact transient control state
was not retained. Both submitted receipts later acknowledged/observed, and independent
reads verified their values. Do not claim all four actions overlapped or reuse the
partial recorder as a complete latency result. No submitted mutation was replayed.

Only the two unsent Credit actions were then executed, with bounded readiness waits,
in a separate capture. Both controls were immediately ready. The812 action occurred
247ms after811 while811 was saving. Whole-value native input events plus blur were
used, NOT natural character-by-character typing. Timings are milliseconds from each
action; saving includes preparation, while command submission precedes prerequisite
singleton/owning reads and is not the PUT start.

| Target | Saving | Command submitted | Acknowledged | Canonically observed | Receipt finished |
|---|---:|---:|---:|---:|---:|
|811 newer Credit|14|344|494|1541|1589|
|812 Credit|248|275|371|914|1172|

Second segment:13 captured requests, all200: two metadata PUTs, four prerequisite
GETs and seven mgets (preparation plus observation, not seven identified retries).
PUT durations59/50ms. Both receipts finished within1.634s of segment start. No recorder
errors or pending captured requests; fetch/subscription cleanup passed. Foreground
at execution and final check, not continuous frame or responsiveness certification.

Independent full-singleton reads after both segments returned the two exact targets.
Both passed final expected Credit/Byline, description preservation, unrelated effective
metadata, original metadata, expected raw overrides, unrelated raw overrides and other
edit data. Only the expected edit lastModified changed. The initial extra raw-override
check used the wrong Argo projection; corrected checks unwrap both userMetadata and its
metadata resource, require concrete metadata fields, and compare captured full responses.
No raw identities, values or response bodies are retained here. Test values remain.

**Verdict:** preliminary settled-save speed and final correctness pass. Acknowledgements
0.494/0.371s are in the broad subsecond range of Kahuna R014's0.528/0.346/0.275s,
but R014 had upload overlap and differing recipients. This is NOT matched U2 parity,
a causal before/after benchmark, a completed rapid same-image-chain timing witness,
natural typing or bulk selection evidence. No material delay in the measured pair
justifies more tuning now; advance to existing-image selected-edit coverage, retaining
natural typing/no-auto/current-candidate upload overlap as separate gaps. Additional
mutation targets/actions still need operator approval. Browser retains stopped
__settledRun (partial), __settledCompletion (measured pair/final checks), and saved
upload helper source; no active recorder or pending save remains.

### R016: Selected-Label Add, 19 November

Operator approved adding one unique test label to existing images811-910 through
the selection editor, leaving it in place. Exact100 filenames/distinct IDs verified
against the retained completed batch. Selection setup used the existing DEV selection
store add method, not100 UI clicks, and was excluded from save timing. All100 metadata
bodies hydrated before action; Back to search retained the exact membership. The
rendered Details label editor was connected, ready and confirmed to own those100 IDs.
Fresh grouped baseline and final reads used matching projections. No upload, remove,
reset, product change, test-suite run or repeated Kahuna baseline.

The ordinary Add label control and Save button submitted one action. All100 commands
acknowledged at3.473s; all100 were canonically observed at5.031s. Last label response
arrived3.472s; first label request began0.145s. Maximum submitted commands3; no unknown,
rejected or blocked outcome. Capture ended5.103s after action.206 captured requests,
all200:100 prerequisite GETs,100 label POSTs,5mgets and1other POST. Label request median
56ms/max205ms; individual request duration is not whole-command or action latency.
No pending requests at stop; fetch/subscription cleanup passed; selection unchanged.

The initial per-image timing map mistakenly used item.id instead of item.imageId,
collapsing100 items into one entry. Its300ms all-ACK output is INVALID. Reported
3.473/5.031s derive from correctly captured aggregate receipt counts reaching100,
with ACK independently matching the last of100 target-associated label responses.
No repeated mutations were needed. Initial raw-label verification also required
unwrapping each Argo label resource, not just the list; corrected checks require
string values before comparing sets. These are recorder/verifier corrections, not
product failures or reasons to discard the valid request/progress capture.

Independent post-run mget returned exactly100 distinct approved IDs.100/100 each:
exact baseline label set plus the new label, new label present exactly once, unchanged
effective metadata, unchanged raw metadata and unchanged other edits except their
lastModified timestamp. This includes the earlier R015 values. Matching lean reads
do not independently prove full original metadata, which was not the label mutation
surface. Raw identities/responses stay in page memory; label remains on all100.

**Speed AND correctness verdict:** selected-label add passes bounded correctness
and is provisionally adequate to continue broad ballpark testing, not faster than
Kahuna or a final parity claim. R011 Kahuna add was2.15s ACK/2.70s observed; R016 is
about1.6x/1.9x those times, with different cohorts/local conditions. Historical Kupua
L-100/L-250 add was10.13/24.98s ACK and15.16/30.01s observed. Do not infer an isolated
causal effect from these cross-session variants. Retain current candidate and advance
to natural typing/other connected gaps before optimizing these few seconds. Label
removal and ordinary selected metadata (S2) were NOT exercised by R016. Stopped
__r016Run retains raw capture, corrected aggregate timing and independent checks.

### R017: Character Input Across Autosave, 19 November

Operator approved typing Credit on existing image-813.jpg, pausing for autosave,
then continuing and blurring. Fresh full-singleton baseline captured after R016;
its label and all unrelated edits were part of the preservation checks. Returned
to the retained Upload batch, bound the rendered connected editor and checked no
pending saves before input. No source change or test-suite rerun.

Used native browser insertText commands one character at a time, requested75ms
spacing, respecting focus/read-only state. This generated21trusted input events
for21characters, not whole-value replacement. Observed ordinary gaps78-97ms and
844ms between the first burst's final character and resumed input (requested700ms
pause followed the final character's75ms spacing). Resume occurred while first
autosave was saving, before its receipt finished. No insertion was refused; the
input contained the entire expected text before blur. This is scripted native
editing at a realistic cadence, not physical keyboard/IME/mobile coverage.

| Save / timing origin | Queued | Saving | Command submitted | Acknowledged | Observed | Receipt finished |
|---|---:|---:|---:|---:|---:|---:|
|First autosave / last character of first burst|602ms|605ms|850ms|1106ms|2132ms|2335ms|
|Final save / blur|1ms|2ms|34ms|131ms|1758ms|2008ms|

Final character preceded blur by78ms. Two receipts acknowledged and observed;
15captured requests all200:9mgets,4prerequisite GETs,2metadata PUTs. No pending
requests/capture errors at stop; fetch/subscription/input-listener cleanup passed.
Independent full-singleton read verified exact final effective/raw Credit, unchanged
unrelated effective metadata/raw overrides/originals and other edit data, including
the R016label. No values restored. Stopped __r017Run retains capture and checks.

**Speed AND correctness verdict:** representative resumed typing passes, with the
expected600ms autosave debounce and immediate blur submission. Final blur ACK0.131s
is within the existing subsecond manual-save evidence (Kahuna R014individual0.275s,
Kupua R0150.494/0.371s), not a matched typing comparison or causal speed claim.
First-burst elapsed time includes the intentional debounce; do not compare it
directly with Kahuna's explicit-save acknowledgement. Kahuna's known typing debounce
is750ms. Canonical visibility remains separate and slower than acknowledgement.
No material queue delay here justifies more tuning before ordinary selected metadata
and fresh no-auto coverage. Bulk metadata comparison requires its own approved
targets/actions; no broad policy or deployment claim follows.

### R018/R019: Settled 100-Image Credit Comparison, 19 November

Operator approved both actions together: overwrite Credit on Kupua selected811-910
and Kahuna settled current-upload1011-1110, with distinct test values left in place.
This fills the missing ordinary bulk-metadata comparison; R014's five/six recipients
during upload could not answer it. No fresh upload, removal/restoration or reset.

Kupua retained the exact100-image selection from R016. Fresh mget baseline captured
after R017, connected Details Credit editor checked against all100IDs, ordinary input
and Commit Credit used. Setup/selection hydration excluded. All100 acknowledged5.454s,
observed6.541s, receipt finished6.573s. Max3submitted; no rejected/unknown/blocked item.
306requests all200:200prerequisite GETs,100metadata PUTs,5mgets and1otherPOST. FirstPUT
began0.728s; lastresponse5.454s. PUTmedian55ms/max257ms. Cleanup passed/no pending.

Kahuna's retained current-upload editors were checked against exactly100 distinct
filenames1011-1110 and IDs;100enabled Credit inputs/arrows, allwithBatch, none saving.
API and all advertised metadata resources local. Fresh mget baseline captured before
input. Ordinary Credit input/blur committed the source, then its arrow fired113ms
later once the live controller held the value. All100 expected target acknowledgements
arrived3.277s afterarrow (3.391s afterinput). Native successful singleton responses
showed all100 expected Credits12.841s afterarrow (12.954s afterinput). These passive
read responses, not optimistic form values, define canonical observation.

Kahuna issued101metadata PUTs for100exact targets, all carrying expectedCredit:
source blur plus the100-target arrow.319requests all200:101PUTs,217image GETs,1otherGET.
Peak101active writes; PUTmedian1958ms/max3237ms. This describes in-browser outstanding
requests, not server execution parallelism. Fetch/XHR preflight and cleanup passed;
no request pending/capture error at stop. Canonical confirmation mechanisms differ:
Kupua grouped mget versus Kahuna's native singleton reads, so observation time includes
each client's scheduling, not a measurement of the instant Elasticsearch changed.

Independent matching-projection mgets returned100distinct approved targets per app.
Both100/100: expected effective/raw Credit, unchanged descriptions, unrelated effective
metadata/raw overrides and other edit data, including labels. Kahuna started with95
nonempty descriptions after R014's five losses and ended with95; no repair or new loss
is claimed. Kupua preserved the R016label and all then-current fields except the approved
Credit overwrite. Full original metadata was not independently assessed by lean mget.

**Speed AND correctness verdict:** retain P-GUARDED for broader testing. Both runs
preserved metadata; Kupua acknowledged later (5.454s versus3.277s) but all-target
canonical observation completed sooner (6.541s versus12.841s). Different cohorts,
sourceblur/arrow semantics,101versus100writes and uncontrolled local conditions prevent
a precise universal speed ratio. Do not copy Kahuna's101-outstanding-write behavior or
add a new scheduler merely to match ACKtime. These are sufficient bulk-metadata data
to move to no-auto uploads/current-candidate upload-overlap gaps, not another tuning
cycle. No product/backend changes, suite reruns or final deployment-policy decision.
Stopped __r018Run/__r019Run retain private capture, timings and independent checks.

### R020: Storage Complete, Ingestion Blocked by SQS, 19 November

Operator selected exactly100 approved captioned copies1111-1210,30,082,933bytes.
Prepared names/sizes guard passed; all100 actual upload status IDs match the private
prepared content hashes.100prepares and100local storage PUTs succeeded; last storage
acknowledgement19.017s. No manual edit driver or preset labels. All100 then remained
processing; read-only samples of first/middle/last loader status returned PREPARED.
No metadata follow-up/save started. Successful HTTPstatus reads are not ingestion.

Operator supplied Grid terminal traces of SQS receiveMessage failing after four SDK
attempts: initial504 then502, including ImageLoaderController's ingestion stream and
SqsViaSnsMessageConsumer. Read-only source inspection confirms the mechanism:
[ImageLoaderController](../../../image-loader/app/controllers/ImageLoaderController.scala#L112)
calls getNextMessage outside its per-message recover; the failed stream's completion
handler throws, with no restart in this path.
[SqsViaSnsMessageConsumer](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/SqsViaSnsMessageConsumer.scala#L26)
schedules once and lets a getNextMessage exception exit its loop. This explains why
HTTP endpoints remain responsive while ingestion stops. Underlying gateway/transport
failure cause is not established; no backend code was changed.

No browser401/419 observed. Local infrastructure containers remained up; bounded
image-loader/thrall log tails did not contain expired-token/access-denied/connection
errors (the operator's terminal trace supplied the missing consumer failure evidence).
LocalStack health subsequently reported sqs/sns/s3 running; that does not establish
the configured SDK/proxy route's health or restart a terminated consumer.

Recorder stopped at322.396s, after the application changed all100 attempts to uncertain.
Cleanup passed including fetch/listeners/subscriptions/prepared-file guard. Capture
has7049requests:100prepare200,100storage200,100queued-status400,6744status200,
4image-read200 and1other200; diagnostic status reads are included, so do not treat
the capture as an unperturbed load benchmark. No pending captured request at final
inspection, no capture error/overflow. Independent post-stop local mget returned0
of100 exact uploaded IDs. Stopping the recorder did not cancel or replay application
work; no metadata save or caption verification was possible.

**Decision/recovery:** R020 is infrastructure-blocked, not a frontend speed result
or deauthentication finding. Operator should restart Grid using the normal command,
without clean/reset, once queue connectivity is usable. Then inspect existing queued
uploads/statuses and use read-only recovery; do not upload the same files again or
silently label them fresh. Stored/queued content is now USED even though not indexed.
R021 remains unstarted and must wait for healthy ingestion. No service restart,
backend change, write replay, reset or restoration was performed by the agent.
Stopped page1 __uploadOverlap retains R020 and infrastructureBlock/finalCheck.

**Recovery:** after the operator's Grid restart, Activity Recheck recovered all100
without refreshing Kupua or resubmitting files. Independent read verified100exact
images/100captions; all follow-ups unchanged, no upload/metadata/label mutations.
Activity now reports100completed with no pending/attention. Bulk/automatic recovery
and unclear follow-up copy are deferred in the [Upload Followups](gradually-growing-teeth.upload-workplan.md#followups),
not selected for implementation. Do not treat interrupted time as performance or
expand the local failure investigation.

## Corpus and Epoch Register

### R042 Result: Preserve Existing Captions Without an Edit, 20 November

100 fresh same-source JPEGs (26,412,509 bytes), no presets, retained serial
filename-first transfer and one observer. First job complete at 2.458s,
first sampled ready lead at 3.646s, last storage acknowledgement at 22.657s,
all jobs complete and follow-ups settled at 28.048s to the recorder's precision.
Exact attempt hashes/filenames matched. Independent reads verified 100 captions,
preserved metadata and labels, and empty overrides. All 100 reported existing
description preserved; zero editor saves, owning-metadata GETs, and metadata
writes. No foreground loss or capture errors; recorder cleanup passed.

R038 first sampled ready lead/full/follow-ups were 4.417/35.077/35.405s with
100 owning-metadata GETs. R042 was 0.771s earlier at that lead witness and
7.029s earlier at full completion. Kahuna R031 first described image was
4.316s (a different UI witness), and full completion was 29.601s, 1.553s later
than R042. This is one local comparison: the work reduction is directly
verified, but do not attribute the full elapsed difference to it. Storage
finished 9.266s earlier than R038, and loader status GETs increased from 127
to 212 despite unchanged scheduling. No broad scale or deployment conclusion.

Operator saw no jump. The 80ms sampler saw older results before the new lead,
then no earlier batch row taking its place, no lead replacement, and zero
scroll. The real lead was present at rank zero at the end. This run did not
exercise overlapping preset follow-ups; it does not measure the effect of
deduplicated persistence on an active follow-up workload. No product edits or
new suite in this run.

### R041 Result: Two Due Upload Observers, 20 November

100 fresh same-source JPEGs (26,410,809 bytes). First job complete at 2.490s,
first sampled ready lead at 4.444s, last storage acknowledgement at 33.133s,
all jobs complete at 35.483s, follow-ups settled at 35.776s. Queued POSTs stayed
in filename order and storage PUTs were serial. Exact final hashes, captions,
metadata, labels and empty overrides verified on all 100; zero metadata writes,
no capture errors, no foreground loss, and cleanup passed.

Peak overlapping loader status GETs was two. Median and p90 queued response
to first status request fell from R040's 3.345s/3.651s to 0.043s/0.782s.
The trial made 178 loader status GETs versus 127 in R038; six status requests
for five distinct images remained after the last PUT, versus nine for nine
in R040. Time from last PUT to full completion was 2.350s, versus 2.331s in
R040 and 3.154s in R038. Full completion did not improve in this run. The last
PUT alone came 3.532s after Kahuna R031's full completion; tighter observation
cannot close that part of the measured gap. Do not infer causation for slow
storage or extrapolate from single runs. Withdraw the extra concurrency rather
than retain higher read pressure without an end-to-end gain.

Rank five appeared before rank one at zero scroll. After rank one reached
the top, it stayed there in the samples despite a brief readiness interruption.
Final lead published. The trial changed no layout. Its build and full units
(3,956/117) passed, and the 11 retained upload-store tests passed following
withdrawal. No new E2E; first-slot UX remains a separate decision.

### R040 Result: Serial Observer Readiness Witness, 20 November

100 fresh same-source JPEGs (26,410,409 bytes) on retained serial
filename-first code. First job complete at 2.459s, first sampled ready lead
at 4.615s, last storage acknowledgement at 31.802s, all jobs complete at
34.133s, follow-ups settled at 34.396s. Exact hashes matched and independent
reads verified all 100 captions, preserved metadata and labels, and empty
overrides. Zero metadata writes, no foreground loss, and cleanup passed.

Nine normal status checks remained after the last PUT. Median queued-response
to first normal status request was 3.345s (p90 3.651s). The one-second shadow
checks proved loader completion, exact singleton readability and scoped search
visibility for all three ranks: 90 at 29.303s, 95 at 31.036s, and 100 at 33.117s.
Normal status started 1.956s, 1.704s and 0.875s later, respectively. The last
file was proven usable 1.016s before the batch completed. Nine read-only probe
requests fired in total; the two-second repeats were skipped. This proves
client-side observation delay in the retained policy, not a 1.016s achievable
speedup or the cause of the entire 4.532s difference from R031. R040 is a
diagnostic run with additional traffic, not a substitute for the baseline.

Operator saw a top jump again. At zero scroll, rank seven was visible below the
batch header before rank one took the top slot at 4.615s; no later lead
replacement was sampled and the final lead was published. This supports a
separate first-slot reservation decision, not a scroll correction or hiding
ready later files. An observer trial could test at most two already-due checks
without shortening retries, changing writes, or relaxing visibility proof;
measure its effect on read pressure and leading-row behavior as well as time.
No code changed and no new suite ran.

### R039 Result: Bounded Notification Overlap, 20 November

100 fresh same-source JPEGs, 26,409,309 bytes. First job complete at 2.542s and
first ready lead frame at 4.458s. Last storage acknowledgement at 27.651s, all
jobs complete at 35.318s, follow-ups settled at 35.796s. Compared with R038 the
trial saved 4.272s at storage but did not improve full availability (0.241s
later, an immaterial difference in one paired observation). The gap versus
R031 remains. Exact attempt hashes matched and independent reads verified all
100 captions, preserved metadata and labels, and empty overrides. Zero metadata
writes; no foreground loss or recorder overflow, and cleanup passed.

Queued POSTs stayed in filename order (all 100 returned 400 as in R038); all
PUTs remained serial and waited for the preceding notification. Only 13
successor prepare requests overlapped a prior queued request, 0.228s summed
overlap. Faster storage is not evidence that this overlap caused all of the
storage difference. Withdraw the trial; keep R038's serial filename-first
behavior. Use a discriminating stage witness before another tuning change.

The operator saw one top position change. The row sampler saw filename rank
five above the batch area before rank one arrived; the intended lead never
changed position after it appeared in the 2,968-frame witness (scroll zero).
Its thumbnail was unready for 94ms at unchanged geometry. This confirms
out-of-order visibility before the lead, but does not establish a geometry
fault after it appears or explain R038's reported down-and-back jump.

Trial units: 30 focused tests passed; the first full run had five failures in
the startup file (3,953 passed), then that file passed all six tests alone.
After withdrawal, all 3,955 units across 117 files passed without retries.
The first failure's cause was not established. No new browser-suite run.

**Observer tail reconstruction:** joined the stopped capture by exact hash.
At the last PUT, 67 jobs were complete and 32 distinct images still had a
status GET ahead of them. Median wait from queued response to first status
request was 7.690s (p90 9.233s). Rank 100 waited 7.386s for its first status
GET; the batch completed 0.160s after that GET started. Each of ranks 91-100
had only one loader status GET. This demonstrates a serialized observer
backlog in the trial, not that the unchecked images were already ready or
that the retained serial policy exhibits the same backlog.

R040 is prepared on the retained serial policy. For ranks 90, 95 and 100,
check loader status about 1s and 2s after the queued response, skipping once
the normal observer starts or readiness is proven. Only a completed loader
status triggers exact singleton and scoped search count checks. Maximum 18
additional read-only requests total; no change to product state or cadence.
See R040 above for actual early-read evidence.

### R038 Result: Filename-First Upload, 20 November

100 fresh same-source JPEGs, 26,407,709 bytes. The first filename reached the
queued POST first (0.436s). First job complete at 2.641s, first sampled decoded
lead at 4.417s, last storage acknowledgement at 31.923s, all jobs complete at
35.077s and follow-ups settled at 35.405s. Kahuna R031 first described image at
4.316s (a different UI witness) and full completion at 29.601s. The full-batch
gap is still 5.476s. Exact attempt hashes matched; independent reads verified all
100 captions, preserved metadata and labels, and empty overrides. Zero metadata
writes, no foreground loss, and recorder cleanup passed.

No sampled top identity replacements after the real lead appeared; scroll and
the lead's offset from the visible region stayed at zero in those samples. The
operator saw the image briefly move down and return. At 25.728s the sampler saw
the same lead without a ready thumbnail, ready again 82ms later, with unchanged
sampled geometry. The 80ms sampler cannot rule out or explain a shorter movement.
No waiting strip was mounted. This is not evidence for reserving a blank row;
use a frame-level lead geometry and readiness witness on the next fresh run.

Serial submission window: 31.665s. Summed prepare, storage PUT and queued POST
request spans: 7.471s, 6.650s and 5.534s; gaps from one queued response to the
next prepare request summed to 6.761s (not attributable to hashing alone). All
100 queued POSTs returned 400 as in R031; preserve the status write and outcome
handling. Candidate experiment: overlap at most one queued notification with
the next distinct file's preparation, retaining serial PUTs and same-hash
ordering. Paired request durations expose about 4.2s of possible overlap under
unchanged durations, not a predicted speedup. No implementation or policy
selection yet.

### R037 Result: 100-File Lead and Transfer Order, 19 November

100 fresh same-source files (26,406,409 bytes; +16 comment bytes per file versus
R031). First complete 2.618s, last storage 32.054s, all complete 36.817s and
follow-ups settled 37.123s. All 100 captions, metadata, labels and empty overrides
verified; zero metadata writes. The 100 prepare/PUT/queued POST requests took
7.911s/5.802s/5.897s summed within each class; those totals are not a complete
wall-clock attribution. The R031 full-batch timing gap remains open.

The top row changed 32 times before the intended lead was first seen at 38.335s
and did not change afterward. Scroll stayed at zero. The lead was the last of
100 to reach the queued POST (32.071s): the attempt list sorted by filename, but
transfer order followed the picker. This was not a stuck final row. Follow-up
removed the separate waiting strip and sorted submissions before constructing
the attempts and queue. The regression failed first; 27 owning tests, full units
3,955/117 and production build passed. No post-change live upload or E2E. First
dispatch does not guarantee first ingestion; assess the remaining churn before
adding display-only blank row geometry.

20 November checkpoint: focused U4 mixed-upload browser case passed 1/1 in
11.3s, retries disabled, after strip removal and filename-first dispatch. No
post-change live upload yet. R038 is prepared and unstarted; see current worklog
for operator restart and exact picker handoff.

### R036 Result: Kupua 300-Image Arrow Contention, 19 November

Reopened R032 after a normal Vite stop/start and page reload. The retained tab
restored the 300-member batch and editable arrows without re-uploading. Exact
IDs match Kahuna R034. Saved and independently confirmed fresh source Credit
and Byline before timing; each Kupua arrow targeted 299 peers, while each
Kahuna arrow also included the source. Clicked Byline 403ms after Credit.
Five Credit commands were submitted at that point, still in their preparation
reads; Byline queued rather than launching competing replacements.

| From each arrow | Kupua Credit | Kupua Byline | Kahuna Credit | Kahuna Byline |
|---|---:|---:|---:|---:|
| All acknowledged | 11.018s | 21.557s | 19.864s | 30.539s |
| All observed by the app | 12.097s | 22.614s | 51.873s | 51.472s |

Byline left the queue 10.617s after its click, just after Credit's last
acknowledgement and before Credit confirmation completed. Peak five submitted,
598 peer PUTs, 1,822 local requests, no failed or pending requests, mismatched
targets, exclusions or foreground loss. Cleanup passed. Independent readback
verified both effective and override values, captions, labels and unrelated
metadata on all 300. Values retained. The same user actions overlapped, not the
wire schedules; Kupua grouped confirmation and Kahuna first-seen singleton
timing have different semantics. This is one same-target local comparison,
not an ingestion-overlap result or broad concurrency guarantee.

### R035 Result: Fresh 300-File Kahuna Uploads, 19 November

Exact guarded retry identities verified against disk: 300 fresh captioned files,
84,202,283 bytes, 22 comment bytes above R032 and otherwise matched on source
pixels and captions. Independent indexed reads verified all filenames, captions
and empty overrides, and confirmed none carried R034 test values. Zero metadata
writes. All 300 storage PUTs succeeded. 300 loader `QUEUED` POSTs returned 400;
no other HTTP or transport errors, foreground loss, or pending requests at stop.
Recorder and sampler cleaned up.

| Boundary from file selection | Kupua R032 | Kahuna R035 |
|---|---:|---:|
| First complete image | 2.621s | 4.291s |
| Last storage acknowledgement | 139.954s | 9.369s |
| All 300 upload jobs complete | 142.609s | 151.381s |

Kupua was 8.772s faster to batch completion despite slower storage completion.
Do not attribute that difference to a single cause: the runs were sequential,
local service load was uncontrolled, and Kupua had a leading-row display hole
after its jobs settled. No claim of all rows presented correctly at that boundary.
Kahuna recorded 656 active frame gaps over 100ms, maximum 3.662s; this shows
foreground stalls in this run, not measured input latency. R032's aggregate
includes an idle tail, so gap counts are not a matched comparison. Both apps
completed at 300; the 100-file gap remains open. No result at 500.

### R034 Result: Kahuna 300-Image Arrow Contention, 19 November

Used the settled R033 current-upload editors (exactly the 300 R032 image IDs).
Source Credit and Byline were saved and independently confirmed before timing.
Clicked the Credit arrow, then the Byline arrow 401ms later with all 300 Credit
writes still outstanding. Each arrow targeted all 300 distinct IDs, including
the source; peak 600 outstanding. All 600 PUTs returned 200. Last acknowledgement
was 19.864s from Credit and 30.539s from Byline. Every Byline payload also
carried the intended Credit; only the source's Credit payload carried Byline.

Native singleton reads had each shown Credit and Byline on all targets by
51.873s and 51.472s from their respective arrows; those are first-seen, not
stable-completion times. Independent matching-projection reads at 82.391s after
Byline verified all 300 effective and override values, captions, unrelated
metadata, overrides and labels. No observed loss in this workload. Local
transport, no foreground loss or recorder overflow, recorder deadline after
writes settled, cleanup passed. No restoration. This is not an ingestion-overlap
case or a matched Kupua two-arrow benchmark.

### R033 Result: Kahuna 300-File Re-upload, 19 November

300 jobs settled at 141.519s, first described image 3.434s, last storage
acknowledgement 8.083s. All captions, filenames and empty overrides independently
verified; zero metadata writes. Exact identity fingerprints match the already
indexed R032 Kupua files, not the reserved fresh Kahuna copies. Both folders had
identical names and sizes, so the picker guard could not distinguish them.
Keep this as a re-upload observation, not fresh-ingestion parity evidence. The
operator considers a one-second difference immaterial at this scale.

Kahuna's active sampler saw a maximum frame gap of 3.692s (604 gaps over 100ms);
this is a passive observation, not an input test or a matched responsiveness
comparison with the R032 aggregates. Recorder cleaned up. Retained 300 current
editors provide a separate opportunity to test arrow contention before reload.
Fresh retry folder prepared with a 22-byte comment-length guard on the first
file only; pixels, captions, dimensions and the other 299 files unchanged.

### R032 Result: 300-File Kupua Uploads and Stuck Lead, 19 November

300 files, 84,202,261 bytes, serial signed transfers. First complete 2.621s,
last storage acknowledgement 139.954s, all complete 142.609s, all follow-ups
settled 143.233s. 3,886 captured requests, no pending requests at stop and zero
metadata mutations. Independent reads verified all 300 captions, metadata and
labels, with empty overrides. Capture and passive samplers were stopped and
cleaned up. The matched Kahuna scale arm remains unstarted. Passive browser
timing aggregates include the idle tail after completion and are not a
workload-scoped responsiveness baseline.

Top-row sampling showed 132 identity/presence transitions at scroll zero,
including Other uploads before batch rows appeared. The sampler did not
capture the loading label itself. After completion, the operator saw
`Loading image-1511.jpg` and an empty lead slot. The lead was complete, first
in the 300-member filename scope and mapped to position zero, but the resident
position zero was `undefined`; the next rows were ranks 1–14. A fresh filename
page returned the lead first. The image had no edit timestamp, its unchanged
follow-up had confirmed, and its fresh page hit passed the existing fence.
Refreshing through the normal search path restored the lead and cleared the
placeholder, with scroll still zero and no buffer holes.

Source-supported hypothesis: a page issued before follow-up confirmation can
be rejected on publication, while the confirmation publisher only updates
resident image bodies, leaving neither body in that slot. The run did not
capture the original publication interleaving. Reproduce it in a focused test
before choosing a repair that recovers the body without bypassing freshness,
inserting fake results, or masking the placeholder. No product fix or new run.

Follow-up reproduced this interleaving deterministically: a filename page issued
before the no-op observation left the lead slot empty and its neighbor at rank
one. Search now performs one bounded by-ID read only when that page's known
leading hit is fenced out. The fresh body goes through normal admission; a
superseding search or seek cannot publish it to the old slot. Failing-first case,
existing stale-response regression, full units (3,955/117), and build passed.
No post-fix live upload or Playwright run; repeated top-row changes during
arrivals are a separate issue.

### R031 Result: Matched Kahuna No-Auto Uploads, 19 November

Kahuna signed mode, 100 files, 26,404,809 bytes, matched to R030 per file for
byte length, decoded pixels and embedded captions. Each arm used fresh content
identities; load, cache state and run order were not controlled. Kahuna reached
its first described image at 4.316s, last storage acknowledgement at 3.376s, and
all 100 described with its remaining counter at zero at 29.601s. Kupua R030 took
2.614s, 34.711s and 36.528s respectively by its corresponding boundaries.
Kupua was 1.702s faster to the first available image but 6.927s (23.4%) slower
to full availability. U0 parity remains open; neither exception applies.

Independent reads matched the exact 100 submitted hashes to the Kahuna job IDs
and verified all captions and filenames and empty overrides. Zero metadata
writes in either arm. Both returned 400 for 100 loader `QUEUED` POSTs but
completed through storage ingestion. Kahuna captured 1,204 local requests,
no transport errors, pending requests or foreground loss. Recorder cleanup passed.
Earlier singleton samples could include same-named files from R030; they were
not used to establish final membership or correctness.

### R030 Result: Immediate Upload Visibility Check, 19 November

100 fresh captioned copies, 26,404,809 bytes, serial transfers and observation.
First complete at 2.614s, last storage acknowledgement at 34.711s, all complete
at 36.528s and final follow-ups at 37.088s. All 100 captions, effective metadata,
empty overrides and labels independently verified; zero metadata mutations.
1,249 captured requests, no pending requests or non-abort transport errors,
no foreground loss, and recorder cleanup passed. Earlier R022 took 4.711s to
first complete and 39.457s to all complete, on different files. Historical
Kahuna R021 took 32.804s to all available. No causal or parity claim; the exact
size-matched Kahuna arm remains unused.

The operator again saw the top image change during upload. The recorder saw
no nonzero results scroll offset, but did not capture leading row identities.
The short leading-filename strip was verified previously with simulated state,
not with a fresh upload. It does not reserve a full image row or stabilize the
first ready image beneath it. Reopen leading-row UX verification separately
from scroll displacement; capture the pending filename, first visible batch and
other-upload row identities, and geometry before considering another fix.

### R029 Result: Repeated Upload Byline Arrow, 19 November

Settled local R024 batch, 100 images. Saved and independently confirmed a fresh
source Byline before timing. Clicked the same Upload arrow again 8ms after the
first click while the first save was active. The arrow remained enabled and the
UI showed the active batch save, but the identical pending intent reused its
receipt. One receipt, 99 distinct peer PUTs, no source PUT during the timed run,
peak five. All peers acknowledged at 3.141s and confirmed at 4.289s. All 302
captured requests were local; none failed or remained pending. Cleanup passed.

Independent readback verified all 100 effective and override Bylines and
preservation of descriptions, unrelated metadata, overrides and other edits.
This confirms the identical-repeat behavior and the common cap on a live Byline
arrow. It does not exercise a changed value, changed membership, or a repeat
after completion. No product change, upload, restoration, or Kahuna comparator.

### R028 Result: 200-Image Credit Commit, 19 November

One Search Details commit captured 200 distinct images: the 100 R027 targets
and 100 existing uploads from 611–710. All 200 were unmounted in the results pane
at submission. Peak five commands, zero exclusions, 200 PUTs and 612 local
requests with no failed or pending requests, foreground loss or capture mismatch.
Recorder cleanup passed. Timing from the commit:

| Chunk | First submitted | All acknowledged | All confirmed |
|---|---:|---:|---:|
| First 100 | 0.546s | 3.673s | 4.829s |
| Second 100 | 5.152s | 7.551s | 8.637s |

Receipt finished at 8.664s. Independent matching-projection read verified every
effective/override Credit, preserved descriptions, unrelated metadata and edits
including labels, and unchanged selection. This is a scale witness, not a matched
Kahuna comparison or proof of its reported large-selection limit. Values retained.

After R028, generalized the five-command cap by action shape, not field. Existing
101-target Byline fixture reproduced three starts before the change and passed
afterward, including chunking and a guarded distinct-field same-image successor.
Full units 3,954/117 and production build passed. No post-generalization live
mutation or Playwright run.

### R027 Result: Five Bulk Credit Commands, 19 November

Repeated R018's Search Details Credit commit on the exact same 100 Grid IDs,
using a fresh value. Selection hydration and baseline reads were outside timing.
Peak five submitted commands; all 100 acknowledged at 2.986s (matching the last
PUT), observed at 4.053s, and finished at 4.084s. 306 local requests, 100 metadata
PUTs, no failed or pending requests, target mismatch or foreground loss. Recorder
cleanup passed. Independent matching-projection read verified all 100 effective
and override Credits, preserved descriptions, unrelated effective and raw
metadata, and other edits including labels. Selection and test values retained.

Versus R018 at three commands, acknowledgement improved 2.468s and observation
2.488s. R019 Kahuna took 3.277s/12.841s after its Upload arrow; this is an
unmatched UI path and different cohort, not general metadata parity. Retain five
as the local bulk Credit candidate. Individual/co-admitted saves, other fields,
freshness, dispatch release and readback policy unchanged. The extended existing
101-target case failed first at three starts, then passed; full units 3,954/117
passed. No E2E for the candidate. A larger live selection is a separate witness.

### R026 Result: Eight Connected Label Commands, 19 November

Same 100 Grid IDs and Search Details label-add workflow as R016/R025, with a
fresh label and matching before/after canonical projections. Peak eight
commands; all acknowledged at 2.173s, all observed at 2.863s. 203 requests:
100 owning GETs, 100 label POSTs, three mgets. No HTTP or transport failures,
pending requests, target mismatches or foreground loss; recorder cleanup passed.
Every label set matched exactly, with the new label once per image and unrelated
metadata and edits unchanged. Selection unchanged; no restoration.

Versus R025, ACK improved 0.944s and observation 1.348s. Kahuna R011 remains
0.023s/0.163s faster respectively, with a different cohort and uncontrolled local
load. The first post-dispatch mget ran 2.175–2.591s and the last 2.676–2.861s.
Earlier next read could have saved at most about 85ms of scheduling wait in
this trace; no case here for additional routine polling. Median owning GET/POST
was 56/101ms versus 43/87ms in R025; do not extrapolate linear gains beyond eight.
Retain eight as the local candidate; no changes to readback, shared rollout,
metadata concurrency, or action limits. Full units 3,954/117 pass; no E2E for
this candidate.

### R025 Result: Five Connected Label Commands, 19 November

Repeated R016's 100-image Search Details label-add workflow on the exact same
Grid IDs, using a fresh label. Recovered the cohort by expected filenames and
the existing R016 label; selection hydration and the matching canonical baseline
were outside the timed action. Five commands were in flight at peak. All 100
acknowledged at 3.117s (matching the last POST); all were observed at 4.211s.
204 captured requests: 100 prerequisite GETs, 100 label POSTs and four mgets;
all local, no failed HTTP requests, no pending requests or foreground loss, and
recorder cleanup passed. Independent mget verified every exact label set, the
new label once per image, unchanged effective metadata and unchanged non-label
overrides/edits except the edit timestamp. Selection was unchanged.

R016 at three commands took 3.473s/5.031s; R025 was 0.356s/0.820s faster in
this single same-target repeat. Kahuna R011 took 2.15s/2.70s and remains faster.
Local load and elapsed session state were not controlled. The five-slot policy is
still a trial, not parity or a shared rollout decision. Do not remove owning GETs
or lower confirmation safeguards to close the remaining gap.

### R024 Result: Three Signed Submissions, 19 November

100 captioned copies, 26,404,809 bytes, with exactly size-matched Kahuna copies
reserved but not used. Three overlapping storage PUTs were observed. Last
storage acknowledgement was 10.926s, first image complete 8.685s, all complete
38.344s and final follow-ups 39.086s. Independent canonical reads verified all
100 captions, unrelated metadata and labels, with empty overrides and zero
metadata writes. No pending requests or collector errors at stop.

Against the earlier, different-cohort serial Kupua run R022, storage finished
21.717s sooner but full availability only 1.113s sooner, and first completion
3.974s later. These are observations, not a controlled causal comparison.
Full availability remains slower than historical Kahuna R021 (32.804s).
The operator saw repeated changes to the first filename-sorted image while the
pane stayed at the top. The store exposes only ready images, so an earlier
filename finishing later can replace the top row without scrolling. The
three-slot trial was withdrawn; the serial restoration is not a general
guarantee against out-of-order ingestion. Do not reintroduce parallel starts
without a way to keep the leading filename stable and retain early access to
other ready images.

### R023 Result: Guarded Concurrent Upload and Metadata, 19 November

Selected the exact 100 prepared copies (25,409,008 bytes). Credit and Byline
arrows ran at 6.770s and 7.240s with five peers each; the newer individual
Credit followed at 7.726s. Both arrows ran with transfers and automatic
description follow-ups still active. Action-to-acknowledgement was
2.066/2.985/4.407s and action-to-observation was 3.482/3.638/6.087s.
Last storage acknowledgement 46.257s, all uploads complete 55.036s, last
metadata acknowledgement 56.156s, final follow-ups 57.566s. Recorded 112
metadata PUTs, no pending requests at stop, no recorder errors or foreground loss.

Independent canonical read verified all 100 filename descriptions, intended
Credit and Byline (including the newer source Credit), and preservation of
unrelated effective metadata, unrelated overrides and labels. R014 acknowledged
the manual actions in 0.528/0.346/0.275s but lost five descriptions. R023 confirms
correctness under this overlap, not speed parity; actual arrow membership and
runtime conditions differ. R014's loss does not excuse the open U0 or S1 gaps.

The operator observed unrequested scrolling. The pane began at zero, first
moved after the scripted Credit arrow, and continued moving long after the
last scripted edit, ending at 72,273px. The hook regression reproduced a
zero-to-100px move on reflow without input. The fix preserves zero for Current
batch while retaining compensation off the top; focused and full unit checks
passed. No post-fix live upload or full E2E was run.

### R023 Preparation and Editability Repair, 19 November

Operator approved100fresh copies of R014's original1011-1110 sources, with automatic
filename descriptions, Credit/Byline arrows and a newer individual Credit. Existing
ExifTool added only a JPEG comment under ignored
`kupua/node_modules/.cache/overlap-r023/kupua-1011-1110/`.100files/25,409,008bytes versus
R01425,405,130bytes; all100decoded pixel signatures match, descriptions remain absent,
content hashes are distinct/new and originals unchanged. Browser lookup found0existing
prepared identities. Reuse R014 rather than repeat Kahuna's baseline.

Preflight caught R022 Form rows loaded but read-only. R022 completed normally, without
Recheck; this is not a Recheck-specific bug. Displayed enrichment had empty edit links,
while a fresh full response allowed editing. Reload restored all six mounted rows;
fresh full and mget responses both had edit links and no userMetadata.lastModified.
The client accepted timestamp-less canonical image data but then stripped authority
in acceptImageOverlay/resolveImageOverlay solely because its version was absent.

One regression in the existing useEnrichedImage suite reproduced the lost edit link
after an unchanged observation/publication, without Recheck. It failed first; the
two guards now retain authority from the exact accepted read, matching the existing
isLabelAuthorityCurrent rule. Existing permission-revocation coverage is unchanged.
Focused5cases pass; full3953units/117files pass132.42s; build/browser types pass with
existing warnings; source diagnostics clean. Full browser run with retries disabled
passed596/598 in11.5m, NOT clean. Crop dry-run reload readiness (ui-features.spec.ts:543)
and table explicit settled-traversed reload restoration (test declared:2259) timed out.
Both unchanged cases passed isolated with retries disabled (12.2s total). Preserved
artifacts: `kupua/node_modules/.cache/timestampless-authority-e2e/full-run/`. Their traces
contain530/538requests,0metadata writes each,4HTTP failures each and5/4no-status entries;
causes remain unestablished. Do not combine isolated passes into598/598 or label the
failures unrelated solely from zero mutation traffic. Normal Kupua was stopped for
this gate and has not been restarted; Grid was left running.
P-GUARDED-AUTH distinguishes this repair from earlier measurements.
No backend change or new pacing value. R023 has NOT started: stopped its empty recorder
before reload, no files selected/manual actions/mutations. Saved installers survive;
page1 raw captures were cleared by reload, their validated results remain here.
Rebind/revalidate and rearm only after the repair's adoption checks.

### R021/R022: No Automatic Metadata Writes, 19 November

R021 selected the exact100captioned copies1211-1310/26,526,163bytes, with no presets
or manual edits. First image uploaded4.805s, storage complete4.160s, all100uploaded/
described and native remaining counter zero32.804s.1414requests:100local storagePUT200,
1preparePOST200,100queued-statusPOST400,960statusGET200,250singletonGET200,
1image-readGET200 and2otherGET200; zero metadata/preset mutations. Last request43.026s,
recorder stopped89.224s; idle capture tail is not workflow latency. No pending request,
capture error/overflow or sampled foreground loss; all cleanup checks passed.

Independent mget verified100distinct exact images, expected embedded captions and
filenames, unchanged effective metadata/raw overrides/labels against captured initial
image baselines. Full originals were not compared across different projections.
R021 is valid U0 evidence, not yet a Kupua parity result;1211-1310 are now USED.
Stopped page2 __kahunaUploadTiming retains timingSummary/verificationSummary and
private independentVerification. Do not repeat this baseline for the new fixture idea.

R022 used fresh captioned Kupua1311-1410 copies from the ignored cache:100files/
27,742,885bytes, captions/dimensions/unique hashes verified, originals unchanged,
content absent before selection. Exact prepared names/sizes and all100 returned
content identities matched. No presets/manual edits. First image available4.711s,
storage complete32.643s, all100 images available39.457s, follow-ups complete40.662s,
Activity completed40.725s. All100 follow-up items were unchanged, not acknowledged
metadata writes. Independent mget verified100/100exact images, embedded captions,
filenames, preserved effective metadata/raw overrides/labels. No full-original
equality claim across different projections.

R022 captured1260requests:100preparePOST200,100local storagePUT200,
100queued-statusPOST400,130statusGET200,200singletonGET200,186mgetPOST200,
100owning-metadataGET200,278other image-readPOST200 and66aborted image reads.
Those aborts are not pending requests or HTTP failures. Mgets include preparation
and observation, not186identified confirmation retries. Zero metadata/preset
mutations, capture errors/overflow or sampled foreground loss. Last request40.509s;
recorder stopped108.740s with cleanup passed/no pending requests. Idle tail is not
workflow latency. Stopped page1 __uploadOverlap retains R022 timings/verification;
__r022Prepared private manifest and __r020Capture remain.1311-1410 is now USED.

**Speed AND correctness verdict:** both U0 runs pass bounded correctness with zero
metadata mutations. First-image times are comparable (4.711/4.805s); Kupua full-batch
availability39.457s is about20% slower than Kahuna32.804s, and its all-work40.662s
about24% slower. This is provisional ballpark evidence, NOT equal/faster or final
policy acceptance. Kupua storage completion32.643s versus Kahuna4.160s makes the
transfer/preparation path a concrete later tuning lead; the extra unchanged-follow-up
tail after all images are available is1.205s. These different-source, uncontrolled
local runs do not isolate a causal knob or prove reduced polling would close the gap.
Advance to current-candidate upload overlap before tuning one workflow repeatedly.
No product changes or suites. Future matched-source copies follow the approved plan;
do not repeat R021 merely to adopt that fixture refinement.

**Historical R021 preparation, completed:** operator selected resuming tests with
Kahuna1211-1310 first, then fresh Kupua1311-1410. Rechecked all100 prepared Kahuna
content IDs absent from local media-api. Reloaded Kahuna only, clearing the old
current-upload group; rebound its actual uploadManager, zero groups/presets and
enabled signed-upload picker. API root and loader/metadata/auth links verified local.
Saved recorder restored using a permitted inline script after CSP rejected eval;
no policy was changed and no capture/upload started in the rejected attempt.
Fetch and XHR root-read preflights passed, then records cleared. R021/U0 recorder
now waits for1211-1310 (100files/26,526,163bytes), manual driver disabled, armed=false,
zero events/requests/baselines/errors. Prepared-name/per-file-size guard accepts the
manifest and rejects a size mismatch before Upload receives a wrong selection.
Next operator action: native picker selects all100 copied files from
`kupua/node_modules/.cache/no-auto-20261119/kahuna-1211-1310/` with Kahuna foreground.
No file selected yet; do not reinstall the waiting recorder. Kupua's recovered
R020files must not be reused as a fresh-ingestion benchmark.

### Prepared U0 Cohorts, 19 November

**Preparation history below is superseded for R020 by the infrastructure-blocked
result above. Its files have been uploaded; do not select them again. R021 is not run.**

Operator approved preparing and uploading two100-image captioned copies to measure
fresh ingestion without automatic metadata mutations, a question existing-image edits
cannot answer. Neither original1111-1210 nor1211-1310 contained embedded descriptions.
Kahuna's existing upload-jobs path writes a filename when description is missing;
Kupua always submits an if-empty follow-up but returns unchanged without a PUT when
the effective description already exists. Preserve those normal paths, not fake success
or intercept writes. The existing Grid converter recognizes XMP dc:description.

Existing ExifTool created copies with one known XMP description under ignored cache:

| Reserved run | App | Copied range / directory below kupua/node_modules/.cache/no-auto-20261119/ | Files | Bytes |
|---|---|---|---:|---:|
| R020 | Kupua |1111-1210 / kupua-1111-1210/|100|30082933|
| R021 | Kahuna |1211-1310 / kahuna-1211-1310/|100|26526163|

All200 copies have the expected description and positive image dimensions; all content
hashes distinct. The200original source files' aggregate content fingerprint is unchanged.
No dependency installed, product/backend file changed or test suite run. Source corpus
remains untouched. Both generated content cohorts were hashed privately in page1 and
all200 were absent in one local media-api mget lookup before upload. Hashes/bodies stay
in page memory; generated fixtures are local ignored artifacts, not tracked evidence.

At preparation checkpoint, page1 is Kupua Upload with verified live stores/local
destinations and zero preset labels. Saved Upload installer reused for1111-1210;
manual driver disabled, R020/U0 identity/expected description/manifest attached.
Fetch preflight passed after briefly enabling recording (the installer intentionally
ignores pre-selection requests), then restored to armed=false/start=null/zero events,
requests, baselines, actions and errors. Native file input enabled. A capture-phase
selection guard checks all100 prepared names and sizes and blocks mismatches before
React's Upload handler; pure checks accept the manifest and reject a wrong size.
Ten-minute capture bound starts on native file selection. No new file selected yet.

Next: operator selects all100 files from kupua-1111-1210 via the native picker;
verify preparedSelectionMatches and normal capture progress, then zero metadata
mutations and100embedded descriptions independently. Separate ingestion/readability
from if-empty follow-up completion. Do not call unchanged-command checks writes or
silently compare a mistaken source-file selection as U0. Stop recording at settlement;
keep helpers/results. Only then prepare/validate Kahuna R021 with zero presets and
its copied cohort; its recorder is NOT armed. No resets or value restoration.

**Historical R013 preparation, superseded by its failed-driver result above:** operator selected R013 before changing
Kupua settings, so both speed and correctness have a relevant100-image concurrent
Kahuna comparator. Corpus911-1010 contains100 files/27,223,526bytes. Full sample-folder
hash comparison found one alias,944=1995; a bounded local catalogue read returned815
distinct images with none of911-1010 or1995 present. No reset performed.

Kahuna page2 was reloaded to remove old current-upload groups; preset count0,
signed upload and local API/loader/metadata/auth destinations checked. Existing
timing installer restored from sessionStorage; fetch/XHR root-read preflights passed
and their records were cleared before arming. The first preflight checked XHR before
the collector's loadend listener; both requests succeeded, cleanup passed, and the
corrected check waits for listener completion. No upload/edit was sent during setup.
The attached ordinary-control driver waits for at least four editable canonical
images while ingestion and automatic metadata remain active, then Credit arrow,
Byline arrow and newer individual source Credit, requesting200ms gaps. Readiness
is bounded to20s per step, whole capture10min from selection. Actual recipients may
grow between actions; Kahuna includes the source in each arrow. Retain these scope
differences rather than claiming exactly matched writes. No value restoration.
At preparation checkpoint armed=false/driver=waiting, zero actions/errors/requests.
Those checks missed the wrong heading-as-container selector; the corrected populated
membership/control preflight is recorded above. The completed recorder is now stopped.

Current source corpus: `/Volumes/Data/Downloads/Internet Downloads/sample-images-main/docs`,
2,000 JPEGs named `image-1.jpg` through `image-2000.jpg`. Before the latest runs, a
bounded catalogue scan found415 accessible images, including sample filenames1-410
plus1989/1990/1992. Content checks established518=1989,519=1990,591=1992;
filename absence is not proof of fresh bytes. Do not use511-610 as an all-fresh cohort.

411-510,611-710,711-810 and811-910 were checked against those413 present sample
contents and one another with no collisions. All four are now used;811-910 completed
in R012 after the planning checkpoint. No new reset epoch was executed
for this plan. Do not infer catalogue totals by summing submissions or overwrite this
inventory after reset without recording a new epoch.

For each future epoch append: ID/date, operator-authorized scope, reset/setup method,
verified starting-state checks, corpus version/fingerprint, app/backend build/config
identity, cache/seed assumptions and any residual uncertainty. No credentials or raw IDs.

## Per-Run Record Template

Append a record for each new experiment; use null for unmeasured values, never zero.
Small related add/remove actions can share a record only with separate action outcomes.
Use public synthetic cohort references; raw identities/values stay private.

```yaml
id: R023
question: Q2
case: S1
status: planned
app: kupua
variant: proposed-profile-id
authorization: {live_case_selected: false, reset_approved: false}
source: {commit: null, scoped_change_fingerprint: null, runtime_verified: false}
environment: {topology: local, build_flavour: null, backend_builds: null, reset_epoch: null, cache_state: null}
corpus: {version: null, aggregate_fingerprint: null, files: null, bytes: null, order_verified: null}
initial_state: null
comparison: {kind: null, control_run: null, arm_order: null, reset_between_arms: null}
changed_control: null
expected_result_and_falsifier: null
policy:
  write_concurrency: null
  start_spacing_ms: null
  target_limit: null
  queue_and_observation_group_limits: null
  request_and_dispatch_timeouts_ms: null
  read_interval_ms: null
  read_attempt_limit: null
  read_deadline_ms: null
  upload_concurrency: null
  upload_observation_concurrency: null
  upload_observation_interval_ms: null
  autosave_ms: null
  service_budgets_and_backoff: null
targets: {intended: null, actual: null, excluded: null, same_image_overlap: null}
clock: {start_event: null, transport_end_boundary: null}
action_sequence_and_per_action_results: null
timing_seconds: {first_usable: null, control_ready: null, queued: null, first_dispatch: null, last_storage_ack: null, last_write_ack: null, ingestion: null, canonical: null, usable_ui: null}
target_latency: {measure: null, p50_ms: null, p95_ms: null, sample_count: null}
traffic: {measurement_window: null, by_service_and_role: null, peak_in_flight: null, aborted: null, pending_at_cutoff: null}
outcomes: {acknowledged: null, rejected: null, unknown: null, canonically_correct: null, unrelated_preserved: null, input_preserved: null}
responsiveness: {input_or_navigation_blocking: null, position_changes: null, resource_measurements: null}
validity: {foreground: null, collector_errors: null, overflow: null, censored: null, limitations: null}
verification_method: null
verdict: null
next_decision: null
```

For an adopted policy, add a decision record: family/service scope, exact selected
values, supporting and contrary run IDs, correctness/response/resource reasoning,
deployment limits, required gates and rollback condition. Keep empirical values
separate from hypotheses. A blank future collection/delete row is an honest gap,
not evidence for copying today's metadata settings.