# Core Logic Cleanup Ledger

Working deliverable for characterising Kupua's position behaviour, recording
operator decisions and actionable bugs, and tracking later cleanup. The original
[characterisation prompt](not-yet-another-audit-prompt.md) owns that investigation,
not the execution sequence for approved slices; use the current unit below. The
[focus and position architecture guide](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md)
is a contract source, not a destination for this investigation's tables or bugs.

Maintain current state, not an execution diary. Amend owning entries in place;
record outcome, structural change, final validation and material limits. Do not
append review-request chronology, patch attempts, service-recovery stories or
successive test totals. Code-change history belongs in the [changelog](changelog.md).
Delete resolved/refuted Open Item tasks, but retain their case IDs and concise
evidence. New tasks need a status, claim, disproof check and kind. A policy decision
is not a code fix; an old observation is not proof it still reproduces at HEAD.

## Current Status

**Checkpoint: 4 October 2026, `4c2a14f8e`.** Ordinary/AI continuity, destination
history, independent session density, detail return and L41-L43 are complete within
their recorded limits. Their [short completion records](#owned-reset-presentation-l43)
name the structural result; the C/B records retain witnesses and disproof boundaries.

**Latest recorded gates:** 2,888 unit tests/83 files, TypeScript/Vite and 453
retry-free E2E, including 15 forced-seek; two final L43 repair reviews accepted.
The 104 pure harness checks retain their L41 result, not a new L43 run. Excluded
E2E/perf configs retain 86/34 inherited diagnostic identities with zero additions;
they are not clean. Build/E2E warnings remain. These are implementing-session
results, not coordinator reruns, native server-cancellation proof or current
direct/API performance equivalence. Live evidence keeps its original scope/revision.

**Next recommendation:** [L45 density-restoration replacement](#density-restoration-replacement-l45),
starting with a bounded design/deletion decision, not immediate product edits.
Operator approval of that design precedes implementation. Optional helper/L44 work
is not selected. Read the [coordinator brief](#coordinator-brief) before choosing work.

| ID | Status | Issue / responsibility | Remaining task |
|---|---|---|---|
| [B1](#b1) | **Superseded** | Destination focus lost across density history | L20 closed by producer removal; supported search-entry focus/none controls remain |
| [B2](#b2) | Recheck | Late snap-back failure clearing newer focus was observed before later ownership repairs | L21; do not presume current reproduction or closure |
| [B3](#b3) | Open | Asynchronous long-press range cancels itself | L22 |
| [B4](#b4) | Open | Density restore can overwrite newer focus; no-saved fallback is latent | L23 |
| [B5](#b5) | Accepted policy for query/filter and AI exit | Remembered detail identity may anchor off-screen; not a repair | Layout preference remains Q1/L15 |
| [B6](#b6) | **Done** | Ordinary selected-sort equality no longer clears retained focus | L24 closed; L8 structural unit complete |
| [B7](#b7) | Open | Temporary buffer bottom treated as true result bottom | L25 |
| [B8](#b8) | **Done** | Search survives density; obsolete initial placement cannot replace newer keyboard-edge intent | L26/L37 closed; current discovery ownership is also covered by B17 |
| [B9](#b9) | **Done** | Early close retains owned focus/centring until list readiness | L27 closed within local limits |
| [B10](#b10) | **Done** | Ordinary prepend compensates without offset reset inference | L28 closed; actual wheel/every held prepend/client DTO and true-top controls retained |
| [B11](#b11) | **Done** | Home thumb hold retires under its operation owner | L13 closed; native Back/exact destination paint/stale-delivery controls retained |
| [B12](#b12) | **Done** | Swipe preparation and close share session-entry identity after reload | L11 closed within local limits |
| [B13](#b13) | **Done** | Missing history anchor no longer adopts departing-context neighbours | L32 closed; ordinary user-neighbour fallback retained |
| [B14](#b14) | **Done** | AI history restores represented destination focus/none | L33 closed; finite resident ordering stays request-free |
| [B15](#b15) | Open | Immediate reload loses selection before persistence debounce | L34 |
| [B16](#b16) | **Done** | Refresh defers movement until accepted fresh publication | L35 closed; first/deep badge frames, classified refusal and fixture lifetime controls retained |
| [B17](#b17) | **Done** | Pending browsing survives density; discovery, AI membership and completion retain ownership | L38 closed |
| [B18](#b18) | **Done** | Pending seek/density retains departure content and destination thumb | L40 closed |
| [B19](#b19) | Open, parked | Native Back from a true Credit-null table tail restores the correct target 36px below departure | Separate geometry discriminator; no L43 repair or additional gate |
| [B20](#b20) | User-reported, uninvestigated | New-images badge disappears on browser reload until data returns later | Recorded only; separate approval before investigation, no L43 cause attribution |
| L39 / [C10](#c10) | **Done** | AI exit without remembered detail identity preserves browsed centre without creating focus | Local verification limits below; retain as a control for the next unit |

**Read by purpose:** [operator choices](#operator-questions), [policy rules](#decisions),
[next-unit scope](#proposed-sequence), [open work](#open-items),
[session skeleton](#session-prompt-skeleton), [review gate](#cold-review-gate),
[behaviour cases](#l7-characterisation-observable-behaviour),
[bug evidence](#bugs-and-qualified-suspicions), [coverage](#coverage-and-checks).
Open means recorded unresolved work, not a new reproduction on every later revision.

## Coordinator Brief

**Purpose:** turn a successful, userless product prototype into a smaller system
that engineers can understand and the operator can keep changing. Preserve smooth
arbitrary-position browsing among millions, position continuity and traversal across
densities. More architecture, less competing logic, fewer bugs and locally revisable
UX are the goal; a closed ledger or a new universal engine is not.

**Finish criteria:** an engineer can explain the ownership model; a representative
new density supplies rendering/geometry and explicit policy without duplicating
search/history/cancellation protocols; chosen UX rules can change without rewriting
publication invariants; adopted production and test machinery is materially smaller.
A new density is a design test, not an approved feature. Performance must be preserved
and improvements measured; source size is not a performance oracle.

**Subtraction:** each structural unit names the obsolete decisions, paths and state
it will remove. A wrapper with all old authorities intact is not completion. Preserve
necessary data/presentation lifetimes, atomic publication, cursor/alignment and
coordinate mechanics. Do not reduce complexity by hiding it in helpers or deleting
comments alone. Temporary growth needs a bounded removal point; arbitrary line quotas
and speculative generalisation are not substitutes for a smaller design.

**Bugs remain first-class.** Keep the C/B evidence and explicit status. A repair can
be independently worthwhile without being architectural progress. Select it because
of demonstrated harm, a blocker or justified cost, not because every open row must
be cleared. New discoveries do not silently expand the active slice. Recheck old
witnesses before repairing or closing them; operator reports are not agent verification.

**Tests are a maintained portfolio.** Stronger replacement proof may retire older
cases and implementation-specific scaffolding. Preserve each meaningful contract
and timing distinction at an adequate layer, not every historical test body. Every
replacement maps retained proof and actual deletions; new combinations need distinct
value. Helper extraction alone proves neither faster tests nor a simpler application.
The original `1e81eb500` checkpoint documented 299 E2Es/~5min/three workers; the saved
4 October report has 453 passing cases in 464.9s. The former is an estimate, the latter
one run without revision metadata, not a paired regression percentage. Agree a runtime
budget before selecting speed work; do not run a campaign just to populate this brief.

**Restart protocol:** this ledger owns current goals, decisions, scope and next action;
guides own current architecture, changelog owns implementation history, and worklog
owns temporary session progress. Memory is a routing aid, not another status
register. Re-read current status/selected unit and check HEAD/worktree on
resume. Update this brief when decisions change, not after every tool call. A checkpoint
can age; explicit revision and verification limits make that visible rather than
promising an automatically fresh narrative. Read-only orientation is not certification.

**Knowledge boundary:** earlier coordinator reading covered the full source/test diff
through `ae08e779d`; later L41/L42 inspection was selective. The 4 October orientation
read the full ledger, L43 production delta and 38 mounted controls plus current core
ownership paths, not every browser test body or store branch. No tests/live checks
were rerun. Wider API migration remains owned by the
[API build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md).

## L7 Characterisation: Observable Behaviour

**1-2 October 2026.** Core-source characterisation was followed by authorised
read-only TEST comparisons across all three natural tiers, direct ES/media-api and
both effective desktop focus modes. Click-to-Open P1-P9 and Click-to-Focus F1-F8
are complete within their recorded limits; explicit F9 is inapplicable because a
coarse pointer forces phantom mode. Media-api explicit fullscreen Escape remains
unexercised because VS Code's embedded browser hijacks the key; the operator
confirmed the same app exits correctly in normal Chrome.
Runtime verification is bounded, not a certification of every timing, device or
datasource combination. The characterisation itself approved no product repair
or consolidation. Separately authorized B8/L37, B17 and B18 repairs are recorded below
with their checkpoint limits. The 3 October operator decisions and first search/sort
unit below supersede the original blanket D2 policy. Ordinary search/sort continuity
and B6 are delivered with independent review repairs and final local acceptance gates.
No wider repair follows automatically. Both diagnostic probes remain retained.

Focus means the single-image bookmark, not tickbox selection. A bookmark may be
off-screen or visually hidden by selection. "Observed" below names a controlled
check; all other current-behaviour claims are explicitly code inferences.
Query/filter changes normally clear selection; sort, density, detail and ordinary
scrolling retain it. Focus and viewport movement are stated separately.

### Search And Ordering

| Case / situation | What happens now | Confidence | Choice if needed | Operator decision |
|---|---|---|---|---|
| [C01](#c01) Change query/filter with focus on A | If A survives, focus stays A and the view returns to its neighbourhood, keeping placement where space permits. An off-screen A can be brought back. The change is remembered by Back. | Source-established; observed across all tier/view cells and both transports in explicit mode | No decision needed: preserve surviving focus and context. | Established |
| [C02](#c02) Scroll without focus, then change query/filter | The image nearest the visible usable centre supplies continuity without acquiring a focus ring. Selection clears. | Inferred from code; existing assertions | No decision needed: preserve visible neighbourhood. | Established |
| [C03](#c03) Click-to-open: close detail/preview, scroll elsewhere, then filter or sort | The last-viewed image remains hidden focus. A later filter can return to it; density/resize can also use it while loaded. Ordinary sort without selection instead resets to top and clears it. There is no expiry on ordinary scroll. | Source-established; filter/density/panel reach observed across tiers/transports | Return-to-detail-image precedence for query/filter is accepted, including off-screen. Layout remains Q1; ordinary sort keeps its existing exception. | Revised D2/Q3; original B5 classification superseded for the accepted paths |
| [C04](#c04) Tick images while older focus is hidden, then change query/filter | Selection clears first. Older focus, when present, supplies continuity instead of the place just browsed; without older focus, the visible centre wins. | Inferred from code; operator reports testing and accepting automatic Clear | Follow retained focus if it survives, as with explicit Clear before the transition. Clear alone remains stationary. | Q4 accepted |
| [C05](#c05) The preserved image disappears, or its lookup fails | Ordinary search tries nearby survivors; a survivor inherits the old placement and may become focus. No survivor gives first page/no focus. An initial request failure can instead leave old content with an error; these are different failures. | Source-established; existing neighbour assertions; one-shot first-page failure observed in both views/modes/transports | Nearby fallback is established; conflicting descriptions of strictly visible neighbours need reconciliation, not a stronger guarantee by default. | No new requirement proposed |
| [C06](#c06) Sort with explicit focus A | A remains focus; the view follows it in the new order. Horizontal table position is normally retained, subject to reset/edge paths. | Source-established; observed across all tier/view cells and both transports | No decision needed for focus continuity. | Established |
| [C07](#c07) Sort without visible focus or selection | No-focus sorting resets to top. Click-to-open ordinary sorting also ignores a hidden last-viewed bookmark. No new selection or visible focus is created. | Source-established; observed across all tier/view cells and both transports | Keep the existing named sort relaxation; no fresh approval needed. | Established current relaxation |
| [C08](#c08) Sort while images are ticked, with or without older focus | The selection anchor supplies placement while older focus is retained, including when both identify the same image. Membership remains selected; Clear does not scroll. | Failing-first composed and actual-control equal/distinct checks; independent review repairs and final local gates pass | No decision needed: selection must not destroy retained focus. | B6 resolved; implementation and review evidence below |
| [C09](#c09) Enter AI search or change its query | A surviving target in the returned images is positioned; an absent target resets to top without the ordinary neighbour search. Selection clears. Results arrive as one finite list. | Source-established; observed from all tier/view source cells in both modes/transports | No new choice about internal fetching; the missing-neighbour difference is retained for assessment. | Evidence/contract qualification |
| [C10](#c10) Re-sort AI results, then leave AI | Re-sort remains immediate and preserves eligible focus/selection placement. No-target re-sort resets to top but retains hidden focus. Exit follows remembered focus, otherwise browsed centre without creating focus, using ordinary missing-target fallback. | Independent review, adapter-backed mounted controls and full local gates pass; no new live certification | Remembered detail image wins, even off-screen; L39 adopts centre continuity when absent. | Q3 implemented; L39 resolved |

### Browsing And Layout

| Case / situation | What happens now | Confidence | Choice if needed | Operator decision |
|---|---|---|---|---|
| [C11](#c11) Seek or scroll away from focused A | Focus remains A even after its image leaves the loaded content. Selection remains. Some drags scroll immediately; large-result seeking moves content on release and may land approximately. No Back step is added. | Source-established; observed through paired seek/lifetime matrices | No decision needed: seeking must not silently replace focus. | Established |
| [C12](#c12) Press arrows/Page keys after seeking away, then choose newer focus | Visible-focus mode returns to the bookmark and applies the key movement. Selection/click-to-open uses scrolling instead. The original late-clear failure needs revalidation after subsequent ownership repairs. | Original controlled store witness; not replayed here after B17 | No decision needed: obsolete work must not clear a newer choice. | B2: Recheck |
| [C13](#c13) Home/End, including a later opposite-edge action | The view goes to the real result edge. Only active explicit focus moves to first/last; hidden focus and selection stay unchanged. A later owned edge action supersedes the old one. | Source-established; observed in every tier/view, mode policy and transport | No decision needed; do not confuse Home with logo reset. | Established |
| [C14](#c14) Browse across a loaded-content boundary | The buffer moves while compensation attempts to keep current content stationary. Unloaded positions can show skeleton slots; failed extension can leave a temporary boundary. Focus/selection are not re-elected. | Source-established; paired lifetime matrices observed delayed edges, eviction and prepend | Different fetch/coordinate machinery is not itself a policy choice. | No decision needed |
| [C15](#c15) Switch grid/table with a visible focused image | Focus stays the same; its row placement is carried across and nudged fully into view at edges. Image centres are not preserved exactly across different row heights. | Source-established; repeated paired density matrices observed current geometry | Preserve focused image placement or visible centre when they differ? | Q1 open |
| [C16](#c16) Focus A, scroll away, switch grid/table | If A is still loaded, the switch pulls A into view. If A is no longer loaded, the visible centre is used while focus remains A. Matched loaded conditions agree across tiers; eviction changes the choice within a tier too. | Observed across paired modes/transports: loaded in all tiers, evicted in both windowed tiers | Should an off-screen bookmark pull the view back? Decide separately from retaining A as focus. No tier-specific policy is permitted. | Q1 open |
| [C17](#c17) Tick images, seek away, repeatedly switch density | With older loaded focus hidden by selection, density follows that focus, not the ticked anchor. Once both leave the loaded data, the viewed neighbourhood wins. Selection and the intended focus state survived the repeated switches; one original centre image became partly clipped after a round-trip. | Observed across paired repeated-density/lifetime matrices; limits below | Same layout choice as C15/C16; no need to answer it twice. | Q1 open |
| [C18](#c18) Repeatedly switch density; approach a loaded-data boundary | Centre images can change between switches. A temporary loaded-data bottom is also treated as an end: indexed follows loaded focus while seek snaps to its local buffer bottom despite being far from actual result end. | Observed in TEST plus equal-size/map-absent mounted control; repeated-switch limits below | Exact centre placement remains a policy question. Different tier outcomes for the same preservation situation are not an operator choice. | Q1 placement details; B7 tier violation |
| [C36](#c36) Forward-evict near the top, then prepend until the buffer reaches global zero | Ordinary backward browsing preserves the hidden bookmark but the final prepend to offset zero resets scroll to top and loses the actual viewport anchor. | Observed identically in direct and API seek grid/table with every prepend gated | No decision needed: ordinary prepend compensation must not masquerade as Home/search reset. | B10 |
| [C19](#c19) Open/resize a panel or change browser width in grid | When columns change, loaded selection wins, then loaded focus, then visible centre. In all three tested tiers, opening Details kept an off-screen selected image stationary but moved the previously viewed image off-screen. Closing Details restored the view. Density instead followed older hidden focus. | Observed across all tiers, modes and transports for fresh/focus/selection setups | Which image should stay put for layout changes, including off-screen cases? | Q1 open; D5/older selection contract conflict |
| [C20](#c20) Resize height only, or resize a table/panel without grid column change | No semantic centre-preservation write runs; scrollTop stays fixed. Shrinking shifts rows down relative to centre and can clip/loss lower focused or selected items; growing shifts them up. Focus/selection do not protect visibility. | Source-established; observed in 24 grid/table × position × anchor-policy cells | Should height-only keep native top, visible centre, or at least a meaningful focus/selection in view? This is separate from column reflow. | Q1 open |
| [C21](#c21) Change density, then scroll/focus before placement finishes | Saved restoration respects newer wheel/touch/navigation-key input but places the old image after a newer focus choice. The no-saved fallback can overwrite newer wheel scroll in a mounted fixture, but has no current anchor-bearing production caller. | Saved newer-focus overwrite observed in browser; no-saved overwrite mounted-only and call-path audited | No new requirement for the saved-wheel path. Newer focus must own placement; latent fallback need not survive a rewrite. | B4 |
| [C34](#c34) Change sort, then switch density while the search is loading | Repaired client ownership: density still cancels buffer movement, but the current search publishes its requested membership/order and settles. Historical direct 13,210 -> 0 and API five-second loading witnesses remain below. | Maintained adapter/local checks and bounded live density checks pass; L37 follow-up has full local gates, not a new live/production/performance certification | No new anchor policy: view changes must not manufacture empty results or strand the current search. | B8 and bounded L37 follow-up resolved; other scopes remain |
| [C37](#c37) Seek far away, then change density before arrival | Repaired: queued/in-flight navigation reaches its destination in the new view and loading settles. Historical departure-buffer and stuck-indicator failures remain below. Settled density anchor policy is unchanged. | Maintained TDD/full local gates and bounded direct/media-api live checks in both click modes/directions; indexed pre-request and deep/map paths covered | A view change carries the pending destination, not departure. No new Q1 choice or stronger seek-accuracy requirement. | B17 / L38 resolved; wider policy and performance remain separate |
| [C38](#c38) Seek from halfway to another position, then change density while loading | The thumb follows the pending destination. The new seek-tier view keeps the departure anchor visible until the destination arrives, without changing focus or selection. | Maintained mounted and browser controls, full local gates and bounded media-api seek-tier frame checks pass in both directions; live repeat/no-density/natural controls pass | Existing start/end contract; no new settled-density anchor policy | B18 / L40 resolved; verification limits below |

### Detail, Selection And History

| Case / situation | What happens now | Confidence | Choice if needed | Operator decision |
|---|---|---|---|---|
| [C22](#c22) Open detail and close without traversal | The list remains laid out behind detail and normally keeps native placement. Close stores the viewed image as focus, hides/pulses it in click-to-open, and retains selection. Back closes; Forward reopens. | Source-established; observed across both modes/transports/tier views, including reload controls | No decision needed for original-image placement. Hidden-focus lifetime is C03. | Established, with qualified reload boundary |
| [C23](#c23) Traverse detail, then close | Last-viewed image is centred vertically at its natural list column. A queued return is cancelled by newer entry/search/focus or unmount. At an unloaded neighbour, traversal waits for data; failed reads need separate treatment from real result edges. | Source-established; settled return observed across both modes/transports/tier views; pending ownership partly bounded | No decision needed for the settled traversal return target. | Established |
| [C24](#c24) Enter fullscreen preview, traverse or do not traverse, exit | No traversal normally keeps list placement. Traversal updates focus and centres after window layout settles. Selection remains. Back is absorbed by preview; Forward does not reopen a dead preview entry. Failed native entry rolls that extra entry back. | Source-established; phantom both transports and direct explicit native controls observed; media explicit Escape is VS Code-limited and works in normal Chrome | Same-exit latest-focus centring is already accepted; do not turn it into a new bug. | Established; platform/timing limits retained |
| [C25](#c25) Reload while detail is open, traverse, then swipe-dismiss or close | Swipe preparation and final return now share history-backed session identity. Returning to original A after reload on B adds no displacement; genuine traversal still centres. Missing cache can leave standalone detail without traversal. | Composed and actual touch-listener controls; historical failure and physical-device limits below | Original/last-viewed rules are preserved, not replaced by unconditional centring. | B12/L11 done |
| [C35](#c35) Traverse in detail, reload, then close quickly | Close remains immediate; an owned return waits for the pending list/target before applying current-geometry centring and focus. Original return remains native. Newer intent retires presentation, not useful restoration. | Early/settled composed and rendered local controls; no new live timing certificate | Early close must remain distinct from the settled control; never hide the race with an unconditional readiness wait. | B9/L27 done |
| [C26](#c26) Tick images, clear selection, then act again | Clear alone does not scroll or create focus. Older focus can reappear and again influence later arrows, sort or layout. Removing the current selection anchor elects a remaining selected image. | Source-established; stationary Clear/focus eligibility observed across paired matrices | No decision needed: reveal retained focus without moving solely because of Clear. | Established |
| [C27](#c27) Back/Forward between searches or distinct same-query entries with focus, or none | A matching destination snapshot supplies target, placement and represented focus/none in the current layout, including resident AI. It does not separately save bookmark and viewport; phantom same-anchor focus is omitted. | Mounted and repeated real-router local controls; cold review and final gates pass; separate live true-tail table displacement recorded as B19 | Off-screen bookmark versus viewport remains Q1. No departing focus may replace represented destination state. | B14 resolved; B19 geometry follow-up parked; Q1 remains open |
| [C28](#c28) Toggle density, change focus, then Back | Toggle creates no history entry or key change. Back reaches the previous supported entry and retains current density; Forward survives toggling. | Actual controls assert entry, query generation, Forward and rendered view | B1's density-only reproduction is removed, not migrated. Surviving destination focus/none is covered separately. | Q2 delivered; L20 closed; B1 superseded |
| [C29](#c29) Reload the list or share its URL | Reload uses per-tab snapshot, selected IDs and synchronously initialized density. Fresh independent tab defaults grid; shared URL carries no density/viewport/focus/selection. Selection's pre-debounce loss is unchanged. | Immediate table/grid reload and first-mounted-view controls; storage failure controls; older selection evidence retained | No cross-tab sync, legacy density-link migration or B15 repair follows. | Q2 delivered; B15 remains open |
| [C30](#c30) Back/reload without a usable snapshot, or after its image disappears | Missing/mismatched/null-anchor snapshot or genuinely absent destination target falls back to top/no focus without departing candidates. Ordinary user transitions still try neighbours. | Failing-first B13 discriminator and surviving/invalid snapshot/user-neighbour controls | Read failure is not redefined as genuine absence; existing adapter contracts remain. | B13 resolved |
| [C31](#c31) Click logo deep in grid/table/detail; interrupt or fail its search | Focus and selection clear immediately. Fresh data normally precedes navigation to default grid. Newer history/search cancels the continuation; current failure still navigates. A cancelled deep reset can leave the position indicator waiting for top. | Source-established; deep Home held-response/Back browser sequence reproduced the stranded thumb | Reset behaviour is established. Indicator cancellation is a bug, not a new policy question. | B11/L13 |
| [C32](#c32) Click the new-images refresh badge | Current search refreshes from top, clears selection, and clears focus on fresh publication. No new Back entry is added. With a first-page buffer it eagerly reveals old top content while the response is pending; deep buffers retain their neighbourhood until fresh publication. | Source-established; held real-response first/deep controls observed | No decision needed for top/reset. Showing old top content before fresh data is a presentation bug. | B16 |
| [C33](#c33) Long-press a second image to select a range | If the whole range is loaded, it selects the range and moves the selection anchor. If the starting image is no longer loaded, the same gesture cancels its own fetch: selection stays unchanged while the anchor moves to the endpoint. Focus does not change. | Observed in paired controlled mounted tests | No decision needed: loading must not make the same range gesture silently fail. | B3 |

### Operator Questions

**Current operator decisions, 3 October 2026.** These supersede conflicting earlier
policy descriptions below, not the recorded observations or their limits. Accepted
policy remains revisable; it is not a usability certification. No new browser checks
were performed to record these answers.

1. **Q1: Allowed layout anchors settled; per-transition preference remains open.**
  Preserve meaningful focus/selection or the currently browsed centre, never an
  accidental third target. Legitimate handling of the true result bottom remains
  permitted; a temporary buffer bottom is not that boundary. Retain focus separately.
  Density, column reflow, height-only resize and history can choose differently.
  Stop and ask if a selected unit needs another exception or an undecided preference;
  do not demand all these answers before ordinary search/sort restructuring.
2. **Q2: Independent density delivered.** Remove density from the
  URL and history entirely. Search/filter/sort, AI, detail and Back/Forward retain
  the current density; toggling density adds no entry and preserves the Forward
  branch. Reload retains the choice through per-tab `sessionStorage`, initialized
  before the view mounts to avoid a grid flash. A fresh independent tab defaults
  to grid; duplicated-tab inheritance needs no special handling. No localStorage
  density preference, cross-tab synchronization or legacy density-link support.
  Home resets to grid with existing fresh-data-before-layout timing, but a newer
  density choice wins without cancelling Home's search reset. Abandoned Home work
  cannot later change or persist density. Back after Home retains the current
  density, not the historical view. Storage absence degrades quietly to runtime
  state. Preserve focus/selection/position semantics in the current geometry;
  this does not settle Q1 layout preferences or Q7 horizontal restoration.
3. **Q3: Remembered detail image accepted; no-bookmark AI exit improvement delivered.**
  In Click-to-Open, the last image returned from detail takes precedence over the
  browsed centre for ordinary query/filter changes and AI exit, even after scrolling
  it off-screen, if it survives. Example: open A, close detail, scroll to B, change a
  filter that retains A -> follow A. With no remembered detail image, the desired
  AI-exit target is the current browsed centre; L39 implements this in the completed
  AI adoption unit. Ordinary no-selection phantom-sort
  clear-and-top behaviour is unchanged. The earlier "only when visible" qualification
  is withdrawn. Density, resize and destination-history policy are not settled by
  this answer. Revisit precedence when UX feedback or an explicit operator decision
  favours the browsed centre; changing it must not require rewriting ownership.
4. **Q4: Current explicit and automatic Clear behaviour accepted.** Clearing
  selection reveals retained focus without scrolling solely because of Clear. A
  subsequent query/filter follows that focus if it survives. The same applies when
  the query/filter itself clears selection: focus A, select images, browse elsewhere,
  change filter retaining A -> follow A. The operator tested and accepted the latter;
  this is not a new agent runtime check. Existing missing-target fallback is unchanged.
5. **Q5: Current command eligibility accepted.** Selection hides the ring and
  suppresses Enter/focused keyboard movement, while F can preview retained focus.
  Preserve that split; it is not a prerequisite for the first refactor. Revisit only
  with a separately chosen keyboard/selection behaviour change.
6. **Q6: Coarse-pointer override accepted.** A coarse pointer forces effective
  Click-to-Open even with a stored Click-to-Focus preference. Treat this as the working
  rule, not an unresolved refactor gate or an immutable promise for future UX.
7. **Q7: Horizontal density restoration deferred.** Preserving the table's previous
  horizontal position is the operator's likely preference, but the current reset
  remains until a named density unit decides it. Preserve existing sort/filter/panel
  horizontal behaviour; this question does not block ordinary search/sort work.

## L7 Engineering Evidence

### Baseline And Interpretation

Original L7 application/test baseline: `1e81eb50027f9a129da9bca1990b5b8bb7550a53`,
1-2 October. Characterisation used source, temporary local probes and separately
authorized TEST read-only comparisons; probes were removed without product changes.
Later repairs have their own records. See [Current Status](#current-status) for
delivered work; original observations do not automatically describe current code.

The current prompt limits archived authority. In particular D6's earlier
table-driven preference is not approval for a mechanism, and D5/D8 cannot be
silently flattened into a universal layout anchor rule. The archive is not an
active migration plan. Code establishes current behaviour, not desired policy.

### Roles And Completion

| State / owner | Actual role and lifetime |
|---|---|
| `focusedImageId` / search store | Explicit bookmark, but also last-viewed identity written by detail/preview. Scroll/seek/eviction retain it. Mode/selection gates ring and keyboard use separately. `setFocusedImageId` stores a rank hint; it does not position the view. |
| `selection-store.anchorId` | Range pivot and sort/grid-reflow target while membership exists. Tick dispatch changes it; remove can elect another selected ID. Detail/preview traversal does not update it. It is not a universal last-interaction bookmark. |
| `getViewportAnchorId()` | Fresh DOM election among intersecting identified cells, nearest usable centre; table excludes sticky header and ignores horizontal distance. No durable viewport identity is maintained during ordinary scroll. |
| `_phantomFocusImageId` | One-operation placement identity; Effect 9 consumes it after resolving a loaded index. `_phantomPulseImageId` is separate presentation with a timeout, not focus or completion. |
| `_searchContinuity` | User capture or strict destination-history handoff binds target, placement, focus treatment and fallback to the existing owner. AI retains pending handoff/latest same-query order; coherent publication supplies resolved identity. Placement is consumed or retired without cancelling useful discovery. Adopted numeric ratio compatibility is removed. |
| `_browseNavigation` | Search-scoped queued/loading/ready destination survives density. Maintenance has a separate owner. The scrubber follows this destination; B18 carries owned departure geometry until arrival. |
| `_focusIntent` / detail return | User focus/clear, including same-ID input, advances intent. Passive return writes do not. A detail-return subscription checks intent, search and entry ownership before fresh-geometry placement. |
| `_cursorRestore` | Image/generation/signal descriptor for joining existing cursor, cursorless or fallback work across remount. It is not a new cancellation owner or a reason to restart discovery. |
| Density / layout captures | Density stores global index, row-top ratio and source DOM extrema across unmount. Grid reflow stores virtualizer index and ratio. History derives represented ratio with its destination target/owner, not an identity-free numeric bridge. Payloads remain transition-specific. |
| History / cursor cache | History stores one anchor plus `anchorIsPhantom`, offset, ratio and freeze boundary under an entry key. The image cache stores per-image cursor/offset under a search key. Neither is a complete independent focus-and-viewport snapshot. |

Sources: [focus setter and snap-back](../../src/stores/search-store.ts#L2056),
[selection mutations](../../src/stores/selection-store.ts#L355),
[DOM election](../../src/hooks/useDataWindow.ts#L144),
[geometry election](../../src/lib/viewport-anchor-geometry.ts#L18),
[placement consumer](../../src/hooks/useScrollEffects.ts#L746),
[snapshot producer](../../src/lib/build-history-snapshot.ts#L35),
[image cache](../../src/lib/image-offset-cache.ts#L191).

Data publication is not final geometry. Effects 4/5 compensate buffer movement;
6 consumes seek targets; 7b resets with fresh publication; 9 applies search/history
placement and can retain a small-result fill retry. L43 removed Effect 8's offset
inference; ordinary prepend-to-zero is compensation, not a semantic reset.
Density's two frames mean measured geometry is available, not that every later
action has been invalidated. Native preview exit also waits on resize quiescence.
These are distinct lifetimes with useful responsibilities, not proof that a new
coordinator would remove them. See [shared effects](../../src/hooks/useScrollEffects.ts#L398).

### Case Traces

These retain causal evidence from L7, with adopted changes noted explicitly.
Original source line references may have moved; use the named implementation.
Unresolved observations are not a fresh whole-app certification at each revision.

<a id="c01"></a>
**C01: Query with focus.** Current ordinary paths use one pre-passive
[continuity capture](../../src/lib/search-continuity.ts), consumed by
[URL sync](../../src/hooks/useUrlSearchSync.ts). [Search](../../src/stores/search-store.ts)
keeps old data while resolving an out-of-page target, then publishes the resolved
identity with the coherent window and existing owner. Effect 9 consumes placement
with full-row/DOM clamping; first-page success avoids lookup. Newer post-publication
input can retire pending placement without cancelling discovery. The
[ordinary unit](#ordinary-searchsort-current-state) owns current proof;
the original focus-preservation assertion alone did not certify every frame.

<a id="c02"></a>
**C02: Query without focus.** Same owned ordinary pipeline with a fresh
[viewport election](../../src/hooks/useDataWindow.ts#L144) and no-focus treatment.
It positions the inferred image without creating explicit focus and may pulse. [Existing assertion](../../e2e/local/focus-preservation.spec.ts#L357)
checks no focus, visible target and one-frame positional stability; that cannot
exclude all later work. Grid/table election uses actual usable DOM bounds rather
than virtual-range midpoint; [table election test](../../e2e/local/focus-preservation.spec.ts#L307)
checks the selected identity. Both modes without stored focus take this path.

<a id="c03"></a>
**C03: Hidden interaction bookmark (former L6).** [Grid entry](../../src/components/ImageGrid.tsx#L677),
[table entry](../../src/components/ImageTable.tsx#L583),
[detail close](../../src/hooks/useReturnFromDetail.ts#L147) and
[preview traversal](../../src/components/FullscreenPreview.tsx#L117) write focus.
The ring and keyboard suppress it in phantom mode; query, density and grid
capture do not consistently apply that gate. Ordinary phantom sort deliberately
drops the target in [URL sync](../../src/hooks/useUrlSearchSync.ts#L337).
Therefore the old broad claim that every later transition follows hidden focus
is false. Its lifetime ends through explicit clearing, a clearing search/failure,
or replacement, not through scrolling or timeout. The original D2/02 prohibition
is superseded for ordinary query/filter and AI-exit continuity by the 3 October
operator answer: remembered detail identity may remain the anchor off-screen.
Layout preference is still Q1; no product change is made by that policy correction.

<a id="c04"></a>
**C04: Selection then query.** Ordinary pre-passive capture chooses retained focus,
not the selection anchor, for a query/filter change. [Selection clear](../../src/stores/selection-store.ts)
does not clear that focus. Q4 accepts following it for both explicit Clear and
query-triggered automatic Clear; this resolves the earlier conflicting archive
description. A pending range cancels on query change.

<a id="c05"></a>
**C05: Missing target and failure.** [Neighbour capture](../../src/stores/search-store.ts#L934)
alternates forward/backward up to 20 positions each side for explicit targets;
[visible candidates](../../src/hooks/useDataWindow.ts#L172) use reported range and
distance from its index midpoint for phantom targets, not a fresh rectangle test
per neighbour. [Resolver](../../src/stores/search-store.ts#L1583) batch-checks membership,
recurses once for the nearest survivor and reuses the original ratio. Missing all,
timeout (8 seconds), or resolution failure publishes first page/no focus; initial
search failure has a separate old-buffer/error branch. [Neighbour E2E](../../e2e/local/focus-preservation.spec.ts#L131)
asserts exact survivor and intersection with viewport, not full visibility.
Archive governing rule 7 versus T07/Phase 3A disagree about strict visible-only
fallback; the later cost decision explicitly retained nearby-buffer behaviour.

<a id="c06"></a>
**C06: Explicit sort.** Same producer/capture/resolver chain as C01. Header sort
is [entry-owned and delayed](../../src/components/ImageTable.tsx#L1126); another
history entry or input reset cancels it. Table preserves `scrollLeft` only in the
relevant reset branch; Effect 8 or fallback reset can still clear it. Natural
grid column follows ordering/alignment, not a saved horizontal column.
Current search withholds the first page while resolving an out-of-page target;
guide 03 was reconciled by the ordinary continuity unit.

<a id="c07"></a>
**C07: Sort relaxation.** [URL sync](../../src/hooks/useUrlSearchSync.ts#L337)
omits viewport inference on sort-only change and mode-gates stored focus.
No-target ordinary search publishes first page and `_scrollReset`, clearing focus.
[Existing assertion](../../e2e/local/focus-preservation.spec.ts#L411) checks new order,
offset zero and null focus. It does not assert every screen frame. Archive D02/D06
and current guide 02 section 4 agree on the current no-focus sort relaxation.

<a id="c08"></a>
**C08: Selection sort. B6 is done.** [Continuity capture](../../src/lib/search-continuity.ts)
chooses selection for placement and explicitly retains older focus, including
equal identity. The old producer's inequality condition cleared equal focus before
arrival; it is removed from adopted ordinary paths. Selection remains selected and
Clear does not scroll. Failure and AI re-sort retain their existing separate policies.

<a id="c09"></a>
**C09: AI entry.** [Context transition](../../src/lib/search-params-schema.ts#L77)
sets relevance and remembers prior sort; collection entry removes AI. [AI publication](../../src/stores/search-store.ts#L2206)
checks target membership only in returned hits: preserve found target, else reset;
no neighbour lookup. API AI refusal becomes empty absence; direct AI rejection
has a separate error branch. In-flight completion adopts the latest same-query
sort. The finite AI hit list is not the full filtered pool. No live AI experiment
had previously run. The paired Click-to-Open matrices entered real finite AI
result sets from all six ordinary tier/view source cells. In every case the old ordinary
hidden bookmark was absent from AI and cleared; AI landed at top with 200 results
and no ring. This checks client transition/placement only; no backend-ranking
correctness claim follows.

<a id="c10"></a>
**C10: AI re-sort/exit.** User-initiated transitions now consume the shared
pre-passive continuity capture. `resortAiBuffer` replaces the existing focus owner
without a new search generation or request; pending AI completion adopts its latest
handoff and supported sort. No-target AI re-sort retains focus. Exit carries image
identity into ordinary lookup and discards the AI offset hint; without remembered
focus it follows the browsed centre, without creating focus (L39 repaired locally).
History now derives destination continuity; B14 restores represented focus/NONE
and placement through that same owner without resident AI requests.

**Original L7 observation:** AI exit suppressed viewport inference but tested stored
focus, not conscious-mode provenance. The original guide
02 called top-on-exit a relaxation; archive D09 demanded preservation and its later
Phase 3A deferred the change for cost. Q3 now accepts remembered-detail precedence
and approved no-bookmark centre preservation, now implemented locally. A sort-only history
move within AI also uses this fast path, so ordinary-history null-focus assertions
cannot certify it. In all paired Click-to-Open source cells, opening/closing one AI result created a
hidden bookmark; relevance re-sort retained it loaded but offscreen while the list
stayed at top. Disabling AI then carried that bookmark into the ordinary query.
Grid placed it visibly at +255.5 px in every tier; table placed it at +403 px,
outside the usable viewport, in every tier. The old ordinary bookmark remained
cleared. This historical runtime result does not certify the later policy decision
or implement its no-bookmark improvement.

<a id="c11"></a>
**C11: Seek.** [Scrubber](../../src/components/Scrubber.tsx) uses native scroll for
fully resident/indexed data; otherwise it seeks on click/release. Indexed user
input now queues a store-owned destination before debounce; only layout refill is
view-owned. Explicit browsing supersedes obsolete focus resolution and maintenance,
while density preserves browsing ownership (B17/B18). Shallow/map/end reads target
exact rank; estimated seeks report the landed rank and use bounded headroom.
`countBefore` corrects knowledge of the landing, not estimation into exact target
selection. Map readiness never changes the coordinate predicate. Seek leaves
focus/selection intact and adds no URL step. Empty result leaves old buffer;
failure/abort differs by caller/signal and must not be called successful arrival.

<a id="c12"></a>
**C12: Keyboard and stale snap-back.** [List navigation](../../src/hooks/useListNavigation.ts#L249)
uses loaded focus plus delta, skips up to ten placeholders, or queues a delta and
calls `seekToFocused`. Selection/phantom mode uses scroll-only commands; table
left/right is horizontal. [Existing E2E](../../e2e/local/focus-preservation.spec.ts#L215)
checks bookmark retained across distant seek then changed by snap-back. B2's
original controlled late-empty response exposed generation-only cleanup clearing
newer focus. Later B17 work added cancellation/identity guards; L21 must replay the
original discriminator before claiming either continued failure or verified closure.
Successful old lookup is a separate continuation, not the original reproduced defect.

<a id="c13"></a>
**C13: Home/End.** [Capture-phase producer](../../src/hooks/useListNavigation.ts#L459)
records edge plus initiating focus permission; [Effect 6](../../src/hooks/useScrollEffects.ts#L545)
rechecks current focus/mode/selection. Seek binds intent to its signal; resident
End aborts older Home, and resident Home can reuse data. [Prior repair evidence](bug-reproduction-evidence.md#kup-013-reverse-edge-follow-up-repair)
records 33 mounted producer/store/consumer cases and the earlier native-browser
witness, including selection/phantom/no-focus controls. Do not reopen KUP-013
based on its pre-repair description.

<a id="c14"></a>
**C14: Extension.** [Forward/backward publication](../../src/stores/search-store.ts#L2574)
keeps a 1,000-image buffer, retains response tuples and aligns eviction/prepend
to columns. [Effects 4/5](../../src/hooks/useScrollEffects.ts#L404) compensate in
buffer-local coordinates and intentionally do nothing in global coordinates.
The small-result fill/top-up has separate ownership and `_bufferSelfCorrecting`.
Current timings are 100 ms seek cooldown, 150 ms deferred report, 50 ms backward
cooldown, 2 s search/density suppression. No performance equivalence is inferred
from those values or from functional success. Browser clamping at temporary
buffer limits is not a real result edge.

<a id="c15"></a>
**C15: Visible-focus density.** [Unmount capture](../../src/hooks/useScrollEffects.ts#L1091)
stores global index and `(rowTop + headerOffset - scrollTop) / clientHeight`;
[mount restore](../../src/hooks/useScrollEffects.ts#L890) waits two frames and
uses current columns/header/origin. It preserves row top, not image centre or
fraction of usable height. Grid rows are 303 px, table rows 32 px, measured header
defaults to 36 px. [Unit assertions](../../src/hooks/useScrollEffects.test.ts#L121)
expect 6136/14853 px in their fixture, certifying the current formula rather than
archive M02's image-centre rule. L18's prior bounded drift report is retained but
its claimed convergence was not re-measured here.

A direct paired table-horizontal follow-up set `scrollLeft=640` independently for
each transition. Sort with/without focus, focused filter, and panel open/drag/close
all retained 640 in explicit and phantom modes. Table -> grid -> table density
returned at 0 while retaining focus. Q7 owns that horizontal density policy; it is
not evidence that sort/filter/panel horizontal continuity is broken.

<a id="c16"></a>
**C16: Off-screen focus.** Density resolves stored focus from resident
`imagePositions` without visibility or mode checks; otherwise it uses viewport
identity. Restore clamps the chosen row visible, unless extremum rules take
precedence. The [unloaded-focus controls](../../src/hooks/useScrollEffects.test.ts#L259)
cover seek and indexed coordinates with map absent. Loaded off-screen focus
instead wins by source proof. This is residency-dependent policy, not merely
different index arithmetic; D8 leaves its desired placement unsettled.

<a id="c17"></a>
**C17: Selection, seek, density sequence.** Selection does not enter density's
chooser at all. Tick-only/no-focus therefore uses a fresh visible anchor every
switch; older loaded focus wins if present. Seeking it out of the buffer changes
the winner without clearing either focus or selection. Repeated switches re-elect
viewport identity only when no stored focus resolves. Pending switches use the
saved record rather than a newly elected identity. C16/C18/C21 separate these
causes. Same-condition three-tier matrices now exist in both modes/transports for
loaded focus/selection; eviction still changes the winner by residency.

<a id="c18"></a>
**C18: Repeated density and extrema.** [Restore](../../src/hooks/useScrollEffects.ts#L963)
snaps source `scrollTop === 0`, source within 303 px of DOM bottom, and destination
within one destination row of an edge. Source DOM bottom is not checked against
global result end. [Existing round-trip tests](../../e2e/local/scrubber.spec.ts#L2215)
allow up to two grid rows and fewer than ten positions on the sampled round-trip;
their centre helper uses row arithmetic, not production DOM election. Thus green
tests do not establish identity-stable centre placement. B7 records the observed
temporary-edge disagreement plus its equal-window/map-absent control. No
claim of infinite drift or guaranteed convergence is made.

<a id="c19"></a>
**C19: Grid width/reflow.** [Panel drag](../../src/components/PanelLayout.tsx#L124)
writes width during drag and persists on release. [Grid observer/capture](../../src/components/ImageGrid.tsx#L472)
runs only when column count changes after initial measurement. Selection, focus,
viewport are resolved in that order, then arithmetic fallback. [Math](../../src/lib/grid-scroll-anchor.ts#L68)
retains an off-screen ratio rather than visibility-clamping the image. [Existing
resize E2E](../../e2e/local/ui-features.spec.ts#L471) asserts selected anchor top
within 1 px and fully visible, with no focus or older focus; its setup uses a
visible selected anchor. It neither proves off-screen policy nor D5's visible-centre
rule. These assertions must be considered before any future change.

<a id="c20"></a>
**C20: Height/table resize.** Grid has no corresponding height-only anchor
capture. Table uses fixed rows, measured header and native container position;
[table centre callback](../../src/components/ImageTable.tsx#L759) applies only
when explicitly invoked. Panel visibility/width is [local preference](../../src/stores/panel-store.ts#L79),
not history. A changing usable centre with unchanged top is source-established;
whether that violates intended resize policy remains Q1, not a speculative repair.
A 24-cell media-api explicit matrix used grid/table, upper/centre/lower visible rows,
and none/focus/selection/distinct focus+selection policies. Height 886 -> 650 kept
scrollTop fixed and shifted every tracked row +118 px: upper/centre candidates stayed
full, lower grid candidates became partial, and lower table candidates left the
viewport, identically for focus/selection. Height 886 -> 1050 shifted -82 px; all
tracked candidates stayed full. Restoring 886 restored exact centres. Ring/focus/
selection state survived according to mode, but no semantic anchor changed geometry.

<a id="c21"></a>
**C21: Density interruptions.** Saved branch checks saved-record identity,
search generation and selected input events before its second frame; cleanup
cancels frames/listeners but leaves the record for Strict Mode/replacement mount.
It does not watch raw scroll events or focus changes. [No-saved branch](../../src/hooks/useScrollEffects.ts#L1047)
has only unmount cancellation and re-reads buffer origin, not search/input ownership.
The two mounted probes observed 320 -> 6136 px, with newer focus retained in the
saved case. [KUP-017 record](bug-reproduction-evidence.md#bounded-focus-repairs-kup-013017018027)
explicitly excludes no-saved restoration. Ordinary saved-wheel tests remain green;
newer-focus browser reach is B4 evidence; the no-saved mounted branch has no
current anchor-bearing production caller.

<a id="c22"></a>
**C22: Detail original return.** [Route](../../src/routes/search.tsx#L238)
keeps list mounted, laid out, invisible/inert. Entry writes focus before push
snapshot; close does `history.back()`. [Return hook](../../src/hooks/useReturnFromDetail.ts)
uses shared session identity, checks the originating list, suppresses Home and
records closing focus passively. It no longer infers intentional reset from null
focus. Original return preserves native placement while useful data settles;
newer focus intent retires it. Native placement means no scroll write, not proof the underlying list never
moved while hidden. Prior [bounded observation](bug-reproduction-evidence.md#restarted-app-browser-follow-up)
measured original close at 0 px drift; it is not exhaustive reload evidence.

<a id="c23"></a>
**C23: Detail traversal/return.** [Traversal](../../src/hooks/useImageTraversal.ts#L235)
uses global indices; adjacent loaded target navigates immediately, otherwise
owned pending navigation waits on buffer change. Context/history/current-image
change cancels pending navigation, not necessarily the shared read. [Detail
callback](../../src/components/ImageDetail.tsx#L296) caches target cursor and replaces
URL without updating focus on every step; return writes the last viewed identity.
The return owner checks search, entry and focus intent, retains pending target
readiness and resolves index/table-header geometry when placement runs. Failed extension can leave no usable neighbour;
no new bounded retry policy was invented. Gesture completion/media decode is
not equivalent to store loading=false.

<a id="c24"></a>
**C24: Preview/fullscreen.** [Preview](../../src/components/FullscreenPreview.tsx#L142)
uses a same-URL back-absorber entry and per-preview owner. Traversal changes store
focus; close centres only after traversal, with 50 ms quick path, 150 ms resize
quiet period and 1 s cap. [Exit helper](../../src/lib/fullscreen-exit.ts#L8)
distinguishes rejection from native success. Same-exit latest-focus centring is
accepted in [KUP-027 evidence](bug-reproduction-evidence.md#bounded-focus-repairs-kup-013017018027);
cross-preview obsolete centring is guarded. Detail fullscreen instead keeps the
same detail DOM/URL and [native hook](../../src/hooks/useFullscreen.ts#L17).
Physical Esc, macOS animation and pre-native-entry races retain prior limits.

<a id="c25"></a>
**C25: Detail reload and gesture identity (L11).** Pagehide saves the list-derived
snapshot; detail [joins pending restoration or restores once per image](../../src/components/ImageDetail.tsx#L219).
[Cursor restore](../../src/stores/search-store.ts) checks
current target tuple/rank, publishes retained-total coordinates, and falls back
to approximate seek when cursor/read fails. Missing target becomes standalone.
The baseline persistent `_detailEntryImageId` and mount-only detail ref were
different authorities; current [shared session policy](../../src/lib/detail-return.ts)
governs both gesture preparation and final close. Original A stays native even
after reload on B; genuine traversal centres. [B12](#b12) is closed within the
[completed unit's local limits](#detail-return-unit).
Recorded pre-repair phantom probes entered off-centre A, traversed
B, reloaded on B, returned to A, then began/cancelled swipe-dismiss. [Pre-scroll](../../src/components/ImageDetail.tsx#L381)
compared A with mount B and moved the hidden list -168.5 px in grid or -353 px in
table. Completing dismiss preserved that displacement; matched reload/traverse-back
Backspace controls remained 0 px. [Dismiss](../../src/hooks/useSwipeDismiss.ts#L134)
pre-scrolls at gesture start, including a later-cancelled gesture. Coarse pointer
forces phantom, so no explicit touch variant applies. This is B12; physical
device animation remains outside the claim.

<a id="c26"></a>
**C26: Selection and clear.** [Tickboxes](../../src/components/Tickbox.tsx#L48)
stop bubbling; [interpreter](../../src/lib/interpretClick.ts#L100) and
[dispatcher](../../src/lib/dispatchClickEffects.ts#L37) change selection/anchor,
not focus. `clear()` clears selection and reconciliation only. Ring, keys and
metadata regain older focus when appropriate. Removing the anchor elects the
last remaining Set member, which can differ from the last clicked deselected
image; range-polarity prose should not be mistaken for proof that a removed pivot
stays pinned. Hydration changes membership only while it owns the captured
selection/anchor; late metadata can remain useful without resurrecting selection.

<a id="c27"></a>
**C27: Search-history ownership.** [Snapshot](../../src/lib/build-history-snapshot.ts#L35)
uses explicit focus in explicit mode even when off-buffer; unresolved rank becomes
0 and ratio null. Otherwise it captures viewport identity as phantom. [Restore](../../src/hooks/useUrlSearchSync.ts)
strict-matches destination search key, derives target/placement/focus/top-fallback
through `historySearchContinuity` and ratchets
freeze boundary to the later saved/current boundary. This is not immutable historical
membership. Phantom departure capture skips replacement while viewport identity is
unchanged, even if focus changed. [Repeated-history test](../../e2e/local/browser-history.spec.ts#L1987)
retains no-focus history coverage. Repeated real-router ordinary/AI entry-only
focused/NONE cycles now assert keys, stored focus, rendered ring/outline and geometry,
including detail GO/marked re-entry. Snapshot remains one represented anchor;
changing hidden focus while the phantom centre stays identical is not independently
represented or a new snapshot requirement.

<a id="c28"></a>
**C28: Density outside history (L20/B1 superseded).** The current
[toggle](../../src/components/StatusBar.tsx) changes only the per-tab preference.
The old producer pushed and captured a predecessor snapshot, while display-only
dedup skipped restore and density save read departing focus. The historical two
local browser probes used actual focus clicks,
waited for destination grid and changed density-restore generation, and failed
the original-focus equality check both for A and null destinations. Existing
[density-history control](../../e2e/local/browser-history.spec.ts) was insufficient
because it asserted view type only. Its supported replacement proves no entry/key
or query-generation change, preserved Forward and current-layout history restore.
Represented focus/none remains covered on actual search and entry-only history.

<a id="c29"></a>
**C29: Reload/storage.** [Startup/pagehide](../../src/main.tsx#L36) sets manual
browser restoration, synthesizes the entry key and captures current snapshot.
[Storage](../../src/lib/history-snapshot.ts#L118) is per-tab, 50-entry capped,
quiet on unavailable storage/invalid JSON; JSON shape is not validated. Density
is absent from the schema/fingerprint/history payload; `kupua-density` is read
synchronously from session storage and written on each choice. Local preference
hydration owns only focus/blur fields and cannot overwrite density. Selection persists
IDs/anchor with a 250 ms debounce and no pagehide flush in its store; B15's
immediate/delayed controls establish that pre-debounce reload loses the tick.
No cross-tab or stronger persistence protocol is proposed.

<a id="c30"></a>
**C30: History fallback (B13 repaired).** Destination-derived continuity sets
`fallback: "top"`; missing/mismatched/null-anchor snapshots and genuine missing
targets cannot elect departing neighbours. Archive D10/T16's top/no-focus contract
is retained without changing read-failure semantics or ordinary user fallbacks.
The historical matching phantom snapshot passed departing `getVisibleImageIds()`;
that source/contract conflict remains the pre-repair witness, not current behavior.

<a id="c31"></a>
**C31: Logo (historical witness).** [Reset](../../src/lib/reset-to-home.ts#L46) clears focus/selection,
cancels typing, preloads defaults and owns post-await navigation via search/history
guards and symbol-owned suppression releases. It deliberately does not capture
a predecessor snapshot in the logo push helper. [Thumb reset](../../src/lib/orchestration/search.ts#L177)
writes top immediately; [seek-mode sync](../../src/components/Scrubber.tsx#L448)
consumes that generation only when thumbTop < 10, without a cancellation path.
Paired browser probes deep-seeked entry A, pushed/deep-seeked B, held
Home's successful first page before store publication, then used Back to restore A.
Logical slider position and buffer returned deep (~431k), while Home's direct DOM
write left thumb `style.top`/rendered top at 0 before and after stale response
release. The stale Home did not replace A. This reproduces L13's mechanism as B11;
focus mode is not implicated because Home clears focus/selection before the race.
Current L43 source adds an operation-owned hold and captured discovery takeover
check; unit composition proves retirement before obsolete delivery. Live API native
Back now passes in grid/table and in a genuine Taken on null-region grid departure:
destination data/tuples/geometry and rendered thumb/tooltip precede deliberate
obsolete delivery. Durable local native Back/paint and direct/API client fixtures,
final retry-free E2E and independent repair reviews pass; B11/L13 are closed.

**Later-density placement limit (4 October):** repeated real logo Home with unchanged
first-page responses held before publication preserves the successor's busy/top
hold after obsolete delivery. A newer real grid -> table choice survives, current
default data publishes with one current navigation, and Home's search is not
cancelled. That control ends at scrollTop 1017.6px versus departure 985.6px rather
than top. Existing [Q2 browser assertions](../../e2e/local/browser-history.spec.ts#L107)
and [unit assertions](../../src/lib/reset-to-home.test.ts#L167) certify preference
and default-query ownership, not that branch's final viewport. Ordinary Home
without later density input reaches exact content/rendered top. Retain the
newer-layout geometry as a qualified separate limit: cause/desired placement are
not established here, no new repair or stronger Q2 guarantee is approved, and it
is not an added L43 gate. This does not weaken ordinary Home or refresh placement.

<a id="c32"></a>
**C32: New-image refresh (historical witness).** [Badge handler](../../src/components/StatusBar.tsx#L177)
calls reset orchestration, selection clear and unanchored search, with no push.
Polling only updates counts and does not reorder the visible buffer. Refresh
advances the freeze boundary; Back uses its monotonic ratchet, not an immutable
old upload set. At offset zero reset orchestration eagerly scrolls old content;
deep data waits for atomic zero-offset publication. B16 establishes the stale
first-page intermediate presentation, not permission to redesign final top/reset.
Current L43 source defers both paths to accepted publication with pending/failure
unit controls. Actual first/deep grid/table badge frames and classified refusal
controls pass locally, with bounded live API success/supersession proof. Final
gates/reviews pass; B16/L35 are closed and final policy stays.

<a id="c33"></a>
**C33: Long-press composition.** [Detection](../../src/hooks/useLongPress.ts#L103)
commits touch after 500 ms, cancelling for movement/scroll before threshold.
[Dispatcher](../../src/lib/handleLongPressStart.ts#L39) starts the real range hook
then calls `setAnchor(target)`. [Range ownership](../../src/hooks/useRangeSelection.ts#L219)
cancels on that synchronous anchor mutation. Its resident fast path already
committed before returning; its async path has not. Paired diagnostics confirmed
3 selected versus 1 with the same endpoints and successful range response.
This is a residency-dependent outcome inside a tier, not proof that every indexed
or seek range fails. Desktop Shift does not perform this immediate re-anchor.

<a id="c34"></a>
**C34: Density during active search, pre-repair trace.** The saved-density mount called
[`abortExtends()`](../../src/hooks/useScrollEffects.ts#L938), which cancels the
then-shared range controller used by the initial search without incrementing
search generation. Direct [page cancellation](../../src/dal/es-adapter.ts#L1025)
resolved an empty page; initial search's generation-only post-await publication
guard let same-generation cancelled work publish zero.
API [cancellation propagation](../../src/dal/api-data-source.ts#L164) instead threw;
the store's AbortError early return assumed a newer owner. Thus the shared client
ownership problem crosses the adapter cancellation contract. Direct empty results
and API loading-without-settlement were observed for the same real controls.
The historical live API abort event was not instrumented; its cause was source-supported.
The [bounded repair](#b8) separates search/range cancellation; adapter contracts,
endpoint schemas and two-frame geometry remain unchanged.

<a id="c35"></a>
**C35: Early versus settled detail reload/close.** Current close retains an owned
last-viewed target through existing pending restoration; original placement is
native and traversal centres when loading/target residency permits. Newer
input/history/search/reopen retires presentation without restarting discovery.
[B9](#b9) is closed within [local limits](#detail-return-unit).
The recorded pre-repair focus-mode matrices
exercised early and settled variants in both transports through actual detail/close
controls. Settled controls waited for the parent list to finish, contain the current
detail ID and consume placement before closing; all tier/view cells retained
original placement or centred the traversed image at 0 px. Early close ran once
detail identity was ready without waiting for the parent list. Traversed grid
return ended at +79.5 px (buffer), -115.5 px (indexed), +47.5 px (seek); table
ended at +32/+34/+17 px respectively, identically by mode and transport. Every
image remained visible. Phantom runs had no ring and did not retain last-viewed
focus; explicit runs left the returned image unfocused while one ring remained
elsewhere. All table runs and indexed/seek grid runs captured parent loading and
target absence at readiness; the original buffered-grid phantom run preceded that
extra capture, while later paired controls confirmed the same gap. Detail identity
readiness is not a claim that the bitmap was decoded at the early-close instant.

<a id="c36"></a>
**C36: Ordinary prepend reaches offset zero (historical witness).** The paired probes used production
`seek(600)` only to establish a low seek window, then real wheel motion for all
browsing in both modes/transports. Table sought offset 500, forward-evicted to 900 and gated
backward prepends 900 -> 500 -> 100 -> 0. Grid sought 501, evicted to 900 and
gated 900 -> 702 -> 504 -> 306 -> 108 -> 0. The final held viewport anchor was
stable for 600 ms in both views. Publishing the zero-offset prepend then made that
anchor non-visible, with +15 px signed-centre change in table and -47.5 px in grid;
the hidden bookmark remained and no ring appeared. Earlier ordinary held prepends
preserved their boundary anchors at 0 px delta, isolating the zero transition.

[Effect 8](../../src/hooks/useScrollEffects.ts#L693) treats every positive-to-zero
buffer transition outside `_bufferSelfCorrecting` as Home/search replacement and
writes `scrollTop = 0`. Its comment names natural indexed top and fresh page-one
replacement, but this observed third path is ordinary seek-tier prepend after
forward eviction. That guard is therefore over-broad for this sequence. No product
repair or stronger persistence guarantee follows from the characterisation alone.
Current L43 source removes that inference, with production seek/evict/prepend
unit controls and independent order/tuple proof. Four durable actual-wheel/every-
prepend frame cases and bounded live API counterparts pass with independent data
and client DTO checks. Final gates/reviews pass; B10/L28 are closed.

### Bugs And Qualified Suspicions

Status is explicit in every record and summarized in [Current Status](#current-status).
Open records retain the last established reproduction and its limits; Done records
lead with the repaired contract. Only unresolved work belongs in Open Items.

<a id="b1"></a>
**B1 / C28 / L20: SUPERSEDED by producer removal.** Historical destination-focus
violation (D8; guide 02 section 2). Expected A or none from the destination; actual
later B. Reproduce grid A/none -> toggle table -> focus B -> Back. Two local Chromium
checks failed after density completion, with ElasticsearchDataSource and 10,000
fixture results (indexed). Cause demonstrated: display-only dedup skips snapshot
restore. Existing density control checks only density. Missing assertions: destination
focus including null, Forward after departure changes, then reload, across equivalent
buffer/seek setups. Confidence high for observed scope, not all sequences.

**Disposition:** `StatusBar` uses `setDensity`, not navigation; density is absent
from route schema, display keys and history snapshots. Real controls prove toggle
does not change history length/key, query generation or Forward availability. Thus
the supported grid -> table density Back step in this witness no longer exists.
Repeated ordinary/AI, focused/NONE and same-query entry history controls retain
the surviving contract. No claim of repairing or migrating obsolete density entries.

<a id="b2"></a>
**B2 / C12: RECHECK. Old snap-back failure cleared newer focus.** Original focus
ownership violation. Reproduce with real store/MockDataSource(10,000): focus fixture rank 50,
seek 5,000, defer snap-back ID lookup, focus a currently loaded image, resolve old
lookup empty. Expected newer focus retained; original actual result was null.
That cleanup formerly checked only `sortAroundFocusGeneration`. B17 subsequently
added cancellation/identity guards, so the old source explanation is not current
proof of failure. Revalidate this exact sequence alongside the original-deletion
control in [snap-back tests](../../src/stores/search-store.test.ts) before closing
L21 or proposing another repair. Trusted-key/click and late-success variants remain
outside the original controlled witness; no new test was run during ledger cleanup.

<a id="b3"></a>
**B3 / C33: OPEN. Long-press range cancels itself when a read is needed.** Established
selection contract violation (guide 05 sections 6/14; no loading-dependent policy).
Paired real-dispatcher/mounted-hook test: selected first image, target third,
all metadata available, successful two-ID walk response. Resident expected/actual
3; missing resident anchor expected 3, actual 1, anchor nevertheless became target.
Cause demonstrated: immediate `setAnchor` invalidates owned walk. Existing
[range tests](../../src/hooks/useRangeSelection.test.ts#L172) correctly assert external
anchor changes cancel; [long-press tests](../../src/lib/handleLongPressStart.test.ts)
isolate dispatch. Missing assertion is their production composition. No server
or mobile browser needed for this bounded proof; physical gesture remains untested.

<a id="b4"></a>
**B4 / C21: OPEN. Density restore can overwrite newer intent.** Two bounded defects share
the same two-frame ownership gap. First, the no-saved fallback has no input/search
guards: mounted real hook, 70,000-result fixture, buffer offset 200, focused global
index 400, table geometry; wheel/set scrollTop 320 between frames, then frame 2
wrote 6136. Ordinary density unmount always produced a saved record in the browser
attempt. Production call-path audit found no anchor-bearing ordinary route: normal
density unmount saves an anchor; the only suppression caller is table->grid Home,
which clears focus, selection, density state and viewport anchor first; initial
mount has no data/anchor. Treat this as latent removable/guardable code, not a
current user reproduction.
Second, the saved branch watches wheel/touch/navigation keys but not focus changes.
A gated direct explicit density switch clicked newer focus B between frames; B
remained focused/ringed, but old A's frame-2 placement moved B from +17 to -604 px
and offscreen. Density generation acknowledged completion. This is browser-confirmed
focus ownership failure, not a regression of the saved-wheel repair. No repair.

<a id="b5"></a>
**B5 / C03 / former L6: ACCEPTED POLICY for query/filter and AI exit.** Historical
classification under the former D2 rule. Enter/close detail in phantom mode, scroll elsewhere, then filter:
hidden stored identity is passed to preservation; resident density/reflow also
prefers it. Ordinary sort is an explicit counterexample and must not be included
in the bug. Existing return behaviour tests intentionally assert writing last-viewed
focus, so future fixes must distinguish immediate return/pulse from later anchor
lifetime rather than merely weaken those assertions. P1/P2/P4 now reproduce the
later filter/density/panel reach and substantial displacement across tiers and
transports. No universal "phantom field must always be null" fix follows.

**Current disposition:** the operator accepts off-screen return-to-detail-image
precedence for ordinary query/filter and AI exit. Those observations no longer
establish a bug under revised D2. Density/reflow choices remain in Q1/L15 rather
than preserving L6's blanket prohibition. Keep the evidence, remove the superseded
repair task, and do not silently clear this remembered identity during restructuring.

<a id="b6"></a>
**B6 / C08: DONE. Ordinary selected sorting retains equal focus.** Focus A -> tick
A -> sort -> Clear now retains focus A, while selected membership/anchor remain
unchanged during sorting and Clear remains stationary. The pre-repair producer
used an inequality condition that cleared focus when it equalled the selection
anchor. The owned ordinary capture now expresses focus retention directly.
Failing-first composed and actual-control equal/distinct checks passed in both
click modes; independent review and local acceptance are complete. Failure and AI
policies are unchanged. L24 is closed; see [the structural outcome](#ordinary-searchsort-current-state).

<a id="b7"></a>
**B7 / C18: OPEN. Temporary buffer-bottom snapping changes policy by tier.**
Established D7 violation in the controlled natural-tier browser comparison.
Both sources were 150 px before their loaded-window bottom, far from real result
end, with a still-loaded off-screen focus and visible anchor at +98.5 px from
usable centre. Indexed source had 199 loaded images ending at rank 6,868 of
13,210; seek source had 300 ending at rank 629,091 of 1,221,837. The indexed switch
brought focus fully visible at -367 px. Seek switched to its DOM maximum (8,834 px)
and left that loaded focus off-screen. Both retained focus and had no selection.
Cause: density's [source-bottom test](../../src/hooks/useScrollEffects.ts#L978)
uses DOM extrema without distinguishing temporary buffer end from true result end.
The policy difference is proved independently of map readiness/window size: a
temporary mounted control used identical 300-image windows at offset 6000, the same
loaded offscreen focus/source ratio and `positionMap=null`. Indexed total 12,000
restored focus at scrollTop 193,600 (global coordinates); seek total 70,000 snapped
to local max 9,036. The focused test passed 19/19 and was removed afterward. Live
setup used production `abortExtends()` without response/threshold changes. All sorts
and timing interleavings remain outside the claim.

<a id="b8"></a>
**B8 / C34: DONE. Search survives density; L37 keyboard-edge supersession is also done.**

**Current contract:** density cancels obsolete window maintenance without cancelling
the current search. Newer explicit navigation may retire initial placement; late
first-page completion must not replace a newer End landing. Home must not reuse a
resident page from the old order, while valid resident Home remains fetch-free.
Current query-discovery handoff is described under [B17](#b17), not the original
initial-read-abort mechanism.

**Structural result:** initial search and range maintenance have separate owners;
captured signals and search generation guard publication. Fill captures its range
signal at launch, so density before initial arrival does not poison fill and density
during fill still prevents obsolete append. No adapter normalization, restarted
search, disabled control, timer workaround or unconditional loading reset is needed.

**Regression evidence:** sort, observe pending search, then change density. Before
repair, direct ES published 13,210 -> 0 without error; API retained its old buffer
and remained loading through a five-second watch. Density-origin cancellation was
instrumented on direct ES; the historical API abort cause was source-supported,
not instrumented. The L37 discriminator holds an initial sort read, completes End,
then releases the old read: the old API client replaced its 13,008-offset tail with
page one. These are pre-repair observations, not current failures or infinite-wait
claims. Loading-derived lifecycle counters alone do not prove request completion.

**Maintained checks:** [mounted density](../../src/hooks/useScrollEffects.test.ts),
[keyboard producers/adapters](../../src/hooks/useListNavigation.test.ts),
[AI/store](../../src/stores/search-store.test.ts),
[API mode](../../src/stores/search-store-api-mode.test.ts) and
[actual-control browser cases](../../e2e/local/buffer-corruption.spec.ts).
They cover both density directions/click modes, no-density controls, Strict Mode,
late success/abort/rejection, fill cancellation, automatic-refill non-supersession
and current-order Home. Local unit/build/full E2E acceptance passed; latest totals
are in [Current Status](#current-status). L26 and L37 are closed.

**Live boundary:** the B8 client checkpoint passed, per transport, eight gated
density cases plus a no-density control, four unwrapped natural-timing cases and
Home supersession. Pinned total was 13,205; exact membership/cursors and completion
were checked, including deep focused windows through bounded target/cursor reads.
These checks predate L37 and later B17 discovery changes, which have local coverage
rather than a new live certificate. Holds delayed unchanged completed reads before
client publication, not server work. Physical devices, production races and
performance equivalence remain unverified. L36's render warning is separate work.

<a id="b9"></a>
**B9 / C35 / L27: DONE. Early close retains the owned last-viewed return.**
Close is immediate even while detail is ready and list restoration is pending.
Publication-driven placement waits for loading to settle and the target to be
available, then resolves current index/geometry and centres genuine traversal.
Original-image placement remains scroll-free. Focus/clear intent, search/history,
reopen and unmount retire obsolete work; existing restoration is reused, not
restarted. Composed and rendered controls cover early/settled focus and placement,
original/traversed targets and pending-data interleavings. The KUP-018 controls
remain distinct and intact. See [Detail Return Unit](#detail-return-unit).

Recorded pre-repair evidence: expected last-viewed image at the established traversed-return centre;
actual paired grid outcomes were +79.5/-115.5/+47.5 px and table outcomes were
+32/+34/+17 px across buffer/indexed/seek.
Minimal sequence: enter A, traverse to adjacent B, reload, close once detail
identity is ready but before the underlying list is ready. Keep the settled-list
variant as a control, not a substitute. Six settled tier/view controls centred
correctly; all six early variants did not. Original-image/no-traversal reload
kept its placement in both variants. A changed stored hidden ID is recorded
separately from the visible placement failure; this is not approval to make hidden
focus a durable product bookmark. Confidence: observed with identical geometry
in direct and API. Current composed tests cover handler-time availability and
late-publication ownership; this does not broaden the earlier KUP-018 certificate
or certify all live timing combinations.

The paired Click-to-Focus passes reproduced the same six offsets in both transports.
They also showed that every early traversed return left the returned image unfocused while
one focus ring remained elsewhere; settled controls focused/ringed the returned
image correctly. This is part of the same availability-dependent return failure,
not a separate placement policy or a new durable-focus requirement.

<a id="b10"></a>
**B10 / C36: DONE. Ordinary prepend-to-zero preserves the viewport anchor.**
Recorded pre-repair witness: ordinary prepend was reset as Home and lost the viewport
anchor. Expected compensated backward browsing to keep the elected visible image
in view when its final page reaches global offset zero. Actual paired seek outcomes
made the stable held anchor non-visible in both table (+15 px signed-centre change)
and grid (-47.5 px), while hidden focus remained. Minimal sequence: seek near global
600, browse forward until one real eviction, then browse backward through gated
prepends until the final positive offset publishes zero. Earlier prepends in the
same runs are controls. Confidence: observed identically in both views and
transports with production store/scroll code and real wheel motion. Source owner:
Effect 8's unconditional non-self-correcting positive-to-zero reset (pre-L43 witness).
**Local source repair:** that guard is removed; compensation remains intact and
explicit search/browse publication retains true top paths. Failing-first and
production buffer/tuple unit proof pass. Four durable forced-seek cases cover real
forward eviction and every held prepend through zero in table/three-column grid,
direct ES and faithful API DTO/client fixtures. Independent corpus membership/all
tuples/positions and 12 pending/post frames retain geometry and bookmark/selection.
No-read-at-zero, actual Home and deliberately unnecessary zero-hit fixture-read
rejection controls remain. Bounded live API table/grid witnesses match. L28 closes
with final gates and independent reviews; this is not server/performance certification.

<a id="b11"></a>
**B11 / C31 / L13: DONE. Cancelled Home releases thumb/tooltip presentation.**
Recorded pre-repair witness: cancelled deep Home stranded the scrubber thumb at top.
Expected Back's restored deep entry to show a deep logical and rendered thumb.
Paired browser sequences restored deep logical positions (about 431k direct / 429k
API), but thumb CSS/rendered top remained 0 before and after the
held stale Home response was released. Minimal sequence: deep A, push/deep B, hold
Home's successful first-page response, Back to A, release stale Home. Search/history
ownership correctly preserved A; only the thumb-reset generation remained waiting
for a near-zero position that will never arrive. Confidence high for seek table in
both transports; focus mode is irrelevant because Home clears it (pre-L43 witness).
**Local source repair:** Home owns a symbol hold and observes existing discovery
replacement/abort, with revocable pre-paint Scrubber synchronization. Unchanged
numeric props, current completion/failure, successor cleanup and actual URL-sync
destination publication before hostile delivery pass at unit layer. Native deep
A -> B -> held Home -> Back passes in local grid/table and bounded live API cells:
A's data and exact logical/painted thumb/tooltip own presentation before deliberately
delivered obsolete success, with no reclaim afterward. A real-DOM wrong-deep thumb
negative rejects B paint at A's logical position; Home and Back first-page discovery
are separately bounded. Fully visible interior anchors retain established clipping
policy, not a stronger true-edge guarantee. L13 closes with final gates/reviews;
[B19](#b19) and C31's later-density placement limit remain separate.

<a id="b12"></a>
**B12 / C25 / L11: DONE. Swipe preparation and final return share session identity.**
Historical entry A remains original after A -> B -> reload B -> A. Preparation
and cancelled/completed dismiss on A add no displacement; ordinary Backspace
matches. Genuine traversal still centres. Fresh opening/Forward re-entry retains
the established new-session boundary, not an immutable identity across sessions.
Grid/table touch-listener controls and composed policy-substitution tests cover
this boundary. Gesture physics and fullscreen lifecycle are unchanged; physical
Safari animation remains unverified. See [Detail Return Unit](#detail-return-unit).

Recorded pre-repair evidence: expected a canceled dismiss to leave the hidden list where
it was, and returning to historical entry A to match ordinary Backspace. Actual
paired phantom sequences A -> B -> reload B -> A -> cancel dismiss moved background
-168.5 px grid / -353 px table; completed dismiss retained the displacement.
Matched ordinary Backspace controls were 0 px and visible. Cause: gesture start
compares A with mount-time B, while final return compares A with historical A.
Confidence high for synthetic Chromium grid/table in both transports; coarse mode is necessarily
phantom, and physical Safari animation is not claimed.

<a id="b13"></a>
**B13 / C30 / L32: DONE. Missing destination target falls back to top/no focus.**
`historySearchContinuity` derives only from the matching destination snapshot and
binds top fallback to the existing owner. Store resolution excludes departing
candidate capture/adoption for that handoff; ordinary user-neighbour fallback remains.
Mounted controls reproduced the old neighbour adoption before repair and cover
surviving target, null/invalid snapshot and ordinary fallback in both transports.
Read failure/absence contracts and approximate seek remain unchanged.

**Historical witness:**
Expected archived history fallback: top/no focus when destination anchor genuinely
disappears. A controlled matching-key snapshot used a missing phantom ID while
departing sort B exposed same-membership visible neighbours. Back to default sort A
restored no focus but adopted B's tracked neighbour, visible near A's opposite end
(`bufferOffset` about 1,221,456; non-top). This proves the source/contract conflict;
the snapshot fixture changed only browser-memory storage. Reproduced equivalently
in both transports. This is pre-repair evidence.

<a id="b14"></a>
**B14 / C27 / L33: DONE. Resident AI history restores represented focus/none.**
The in-memory re-sort consumes the same destination handoff instead of retaining
departing focus or choosing it independently. Repeated A-none/B-focus and focused
destination controls assert stored focus, grid ring/table outline and geometry.
Same-query native entries restore too, without AI requests; pending completion
retains latest ordering/owner and cannot revive input-retired placement.

**Historical witness:**
AI entry A and re-sort entry B both began unfocused. After adding focus only in B,
Back to A retained that same focus in explicit and phantom modes; explicit A showed
no ring despite stored focus, while Forward to B showed the ring. Phantom retained
the hidden focus both ways. Expected A's entry-specific none state. Reproduced in
both modes and transports. Cause scope is
the AI in-memory sort/history fast path, distinct from density-history B1.

<a id="b15"></a>
**B15 / C29: OPEN. Immediate reload loses a just-ticked selection before persistence
debounce.** Synchronous tick produced store membership while sessionStorage still
lacked the ID; immediate reload restored zero selections. A matched control waited
for the debounced storage write and restored one selected ID. Expected per-tab reload
survival once the user action commits; pagehide currently does not flush the pending
selection write. Client-only, transport-independent evidence. No repair.

<a id="b16"></a>
**B16 / C32: DONE. Refresh retains old geometry until fresh publication.**
Recorded pre-repair witness: first-page refresh exposed stale top content before fresh
publication. A real refresh badge click from `bufferOffset=0`, `scrollTop=2000`
immediately set scrollTop 0 while a successful first-page response was held. For
the full 600 ms watch, the previously viewed image moved offscreen and the old
buffer's first image was visible with `loading=true`; release then published fresh
top data. A deep seek control held its exact viewed identity/geometry until release,
then moved to fresh top. Expected the first-page path to defer visible movement like
the deep atomic path, avoiding stale old-top presentation. The badge count was a
client-only fixture; search/control/response were real and read-only. Reproduced
pixel-identically in direct and media-api (pre-L43 witness).
**Local source repair:** badge preparation skips eager movement/range/thumb writes;
one existing unanchored search publishes the final reset with fresh data. First/deep
grid/table pending and failure controls retain identity/geometry and existing
focus/selection/query/density/history policy. Eight durable actual-badge success
cases cover first/deep grid/table through direct ES and faithful API client fixtures:
12 pending frames retain the old anchor, then accepted publication owns painted
top/left with one refresh page. Two supplied-503 controls require the real adapter's
refused/status503 classification; a backing-error negative cannot substitute for it.
Interrupted cleanup owns listeners, blocks late registration and drains observations.
Bounded live API success, populated selection and newer-query supersession remain
complementary evidence. L35 closes with final gates/reviews; no native local server
failure/cancellation or performance certificate is inferred.

<a id="c37"></a>
<a id="b17"></a>
**B17 / C37: DONE. Pending browsing survives density; L38 is closed.**

**Current contract:** the latest browsing destination survives a view change,
including the indexed pre-request debounce window. Arrival uses current geometry;
newer search/navigation can supersede it. Focus/selection remain separate. Absence,
failure and cancellation finish only the appropriate busy owner. Pending departure
presentation is covered separately by [B18](#b18).

**Structural result:** [search-store](../../src/stores/search-store.ts) owns a
search-scoped `_browseNavigation` through queued/loading/ready phases, independently
of maintenance and keyboard focus permission. [Scrubber](../../src/components/Scrubber.tsx)
records indexed intent before native scroll, including its sibling wheel bridge;
[useDataWindow](../../src/hooks/useDataWindow.ts) keeps only layout-refill timers
view-owned. [Scroll effects](../../src/hooks/useScrollEffects.ts) consume ready
placement once after current-view measurement, including unmounted arrival and
Strict Mode, without replaying obsolete departure restoration.

The current ownership contract also requires:
- Ordinary navigation retires initial placement, not membership discovery. It reuses
  the existing count or counted page and publishes the current total/window together.
  End/clamping cannot use predecessor-query totals.
- Cursor/focus replacements inherit unfinished discovery. Retired initial placement
  cannot revive after a successor. Missing targets or cancelled/failed replacements
  may finish the existing first page only without a newer owner; successful fallback
  clears replacement error. Both discovery reads failing settle with the existing
  error policy, not fabricated empty membership. Freeze/map/poll work is not duplicated.
- AI excludes ordinary queued/direct seeks, refill, extensions, cursor restore and
  snap-back while it owns the query, regardless of old indexed/seek totals.
- Refill cannot settle a pending search. Cursor/snap-back supersede obsolete browsing;
  cancelled or identity-superseded snap-back cannot clear newer focus. Original
  cooldowns, valid resident Home shortcuts, cursor/alignment and compensation remain.

**Pre-repair evidence:** seek, then switch density before arrival. A natural API
seek-tier grid/table overlap retained the departure buffer and loading through four
seconds; passive tracing observed density aborting the estimate signal. A matched
no-density seek completed. In indexed data, a real track click followed immediately
by density lost the destination before dispatch: no seek committed in 3.5 seconds,
while a no-density control completed. This defect existed before B8/L37; no old-binary
replay or claim of infinite loading was made. Waiting for seek settlement before
toggling density cannot test either interruption.

**Maintained checks:** the [mounted density suite](../../src/hooks/useScrollEffects.test.ts)
and [browser composition](../../e2e/shared/browse-density.ts) cover both adapters,
indexed/seek coordinates, density directions/click modes, bookmark/none/selection,
queued intent, repeated mounts and arrival before/between/after frames. Deep
estimation, ready-map and fetch-free resident controls are retained. The
[navigation suite](../../src/hooks/useListNavigation.test.ts) and store suites cover
newer navigation, current-query discovery (zero, narrowed and widened membership),
cursor/focus replacement, failure and finite AI. Local gates passed; latest totals
are in [Current Status](#current-status). API fixtures exercise the real parser over
local response shapes, not a live Scala service.

**Live boundary:** an earlier B17 checkpoint passed 12 controlled overlaps and four
natural-timing cases per transport. Coverage included deep estimated and map-ready
indexed navigation in both click modes/directions, plus indexed pre-dispatch without
a bookmark; mapped targets exceeded 10,000. Pinned totals were about 1.22 million
and 13,205. Nonempty selection/resident coverage is local, not a live matrix. The
later discovery/AI/wheel composition repairs have full local gates but no new live
replay; those earlier 32 checks do not certify them. Source hashes/datasource and
foreground were checked. Held reads were unchanged completed responses, not server
cancellation evidence. No production/device/performance equivalence is claimed.

<a id="c38"></a>
<a id="b18"></a>
**B18 / C38: DONE. Pending seek/density presentation.**

**Current contract:** the pending thumb stays at the destination, while content
preserves the departure neighbourhood until arrival. Final arrival alone is not
sufficient. Focus and selection remain independent. Settled density, history and
seek-accuracy policy are unchanged.

**Implementation:** the [route](../../src/routes/search.tsx) passes the existing
`_browseNavigation.targetOffset` to [Scrubber](../../src/components/Scrubber.tsx).
Its thumb and tooltip follow that owner through queued/loading/ready placement;
only pointer dragging has separate local presentation state. Viewport reports,
total changes and `loading=false` do not independently declare arrival.
[Scroll effects](../../src/hooks/useScrollEffects.ts) capture the visible departure
anchor during a pending seek-tier density unmount, not the focus or selection anchor.
The existing density bridge carries that geometry with the navigation signal.
Pre-paint positioning uses current columns/header and viewport bounds, then checks
ownership again during mount readiness. Ready arrival, cancellation or a successor
cannot replay the old departure placement. Indexed skeleton positioning, final seek
placement, two-frame readiness, request/cursor logic and cooldowns remain intact.

This removes independent arrival inference without a new coordinator, request,
restart, timer workaround or disabled control.

**Verification (3 October 2026):** TDD and inline cold review complete. The maintained
[mounted suite](../../src/hooks/useScrollEffects.test.ts) covers both adapters,
coordinate regimes, density directions, focus modes, bookmark/none/selection states,
repeat switches and arrival before/between/after mount frames. Pending departure
visibility is asserted independently of final data, cursors, focus and loading.
[Scrubber controls](../../src/components/Scrubber.test.tsx) cover viewport reports,
ready-before-placement, successor targets and cancellation. Failed seek and newer
Home controls retain the departure or place the successor without stale restoration.
The [browser composition](../../e2e/shared/browse-density.ts) starts deep and samples
pending rendered frames; both modes/adapters/directions plus no-density controls pass.

Full local gates are recorded in [Current Status](#current-status); the focused
browser slice passed 10/10 with retries disabled. The shared API browser passed
both held directions, repeated switches, no-density and natural-timing controls.

**Live limits:** served source hashes matched the checkout; all counted samples were
foreground. Held checks delayed unchanged completed API reads before publication,
not server work. Each held seek published once; destination visibility, positions,
total and loading were checked separately. Natural overlaps also retained departure
visibility and destination thumb position. This live pass used the natural seek tier
without focus/selection; other modes/tiers and direct ES have maintained local coverage,
not a new live certificate. No identities or payloads were retained. Physical
devices, production-build races and performance equivalence
remain unverified; L36 and other ledger items are unchanged. L40 is closed.

**Operator-only performance follow-up:** existing 2 October post-B8 local-media-api
jank/perceived records cover normal density and seeking, not this repair's pre-paint
placement cost. Compare P6 and PP6/PP7 families under matching scenario revision,
topology and cache conditions. Those runs cannot themselves certify held-request
composition; no new campaign or speed claim accompanies this repair.

### Remaining Limits

C38/B18 is resolved within the verification boundary above. Physical Safari/touch behavior, unbounded timing
interleavings, production-build incidence and performance/jank remain separate
certification surfaces. VS Code's native Escape key hijack is an environment
limitation; the operator confirmed normal Chrome works. These limits do not
authorize repairs or imply comprehensive runtime/performance certification.

<a id="b19"></a>
**B19 / C27: OPEN, PARKED. Table native Back from a true Credit-null tail restores
the correct anchor one header-height below its departure.**

**Observed contract/result:** destination identity, rank, membership and tuples
restore correctly, but the represented viewport does not return to its departure
geometry. In the repeated witness the anchor moves **+36px** and scrollTop changes
**-36px**, equal to the measured sticky-header height. Cause and the precise
interaction with legitimate true-edge clamping remain unconfirmed; this is not
proof that missing values themselves cause the displacement.

**Reproduction (4 October 2026):** visible shared Chromium, non-local
`ApiDataSource`, indexed table, `city:Dublin`, `nonFree=true`, until
`2026-03-05T00:00:00Z`, descending Credit. The complete independent position map
contains 13,205 results and 44 null-primary tuples beginning at rank 13,161.
With no focus/selection, use actual End to reach the true tail in entry A, choose
Uploaded through the sort menu to create entry B, then use native browser Back.
The represented anchor remains at rank 13,195. Departure scrollTop
421971.1875 becomes 421935.1875; the same anchor's viewport Y increases by 36px.
Twelve subsequent visible frames have 0px further movement. The restored
44-image buffer starts at 13,161 and matches independent-map membership and
all authoritative tuples; loading is false and no error is present.

**Controls/attribution:** the plain A -> B -> Back witness uses no Home action
and no response hold. A deep-B variant with Home's unchanged completed first page
held before Back produces the same displacement, while the logical/rendered
thumb and tooltip correctly represent the null destination before stale delivery;
obsolete Home delivery cannot reclaim data/history/density/geometry. Thus this
is distinct from [B11](#b11), missing-target fallback [B13](#b13), density at a
temporary buffer end [B7](#b7), and the data-prefix defects
[KUP-033/034](bug-backlog.md#kup-033). No source repair or clean-baseline browser
comparison was performed.

**Owning surfaces / next discriminator:** inspect the
[snapshot ratio](../../src/lib/build-history-snapshot.ts#L87),
[table virtualizer/header geometry](../../src/components/ImageTable.tsx#L747)
and [history ratio placement/clamp](../../src/hooks/useScrollEffects.ts#L791).
These formulas are unchanged by L43; that fact is not an executed baseline test.
A bounded local plain-Back fixture should compare true-tail and away-from-tail
departures, with valued and null anchors, recording the saved ratio, measured
header, actual scroll writes/clamp and exact DOM departure/restoration geometry.
Correct geometry in that matched case would disconfirm generalization; differing
header/coordinate calculations would discriminate the cause. Direct ES, grid,
Taken on, reload and broader incidence remain unverified. Confidence is high for
the repeated live displacement, not its root cause or null-specificity.

**Kind/disposition:** separate observed geometry bug with qualified cause; parked,
unselected and not an additional L43 acceptance gate. Operator instruction is to
record it, not repair it here. Preserve exact geometry tolerances; no product,
backend, snapshot-policy or performance change is authorized. Identities, raw
tuples and live payloads were kept in browser memory; owned probes were removed.

<a id="b20"></a>
**B20: USER-REPORTED, UNINVESTIGATED. New-images badge after reload.**
On 4 October the operator reported that the badge disappears after browser reload
until data comes back later, and explicitly asked not to investigate at that point.
The later prioritisation discussion makes it an alternative task, not a confirmed
cause or an approved repair. No agent reproduction, source diagnosis, regression
attribution or desired count-persistence contract is established. If separately
selected, first compare the reported normal-reload sequence with the intended
badge lifecycle; a correct result would disconfirm the proposed defect. Do not
bundle it into L45, silently reopen B16, or infer a need for new storage.

### TEST Browser Follow-Up: 1 October

**Original pre-repair evidence:** authorized read-only TEST, explicit mode, visible
1130x886 viewport, independently checked direct datasource and served source hashes.
Runtime thresholds stayed 1,000/65,000. Natural date-capped corpora yielded about
820 / 13,210 / 1,221,840 matches; the cap does not freeze membership. Indexed maps
were ready; buffer data was complete; other tiers retained normal windows.

Signed centre uses actual DOM rectangles and usable viewport excluding the table
header; positive is below centre. Watches lasted 2.5 seconds after density restore
acknowledgement, not every intermediate paint. Seek reflow-close sampled two changes
during extension before restored final geometry. Identities stayed in browser memory.

| Witness | Observed result | Interpretation |
|---|---|---|
| W1: loaded off-screen focus, grid -> table, all three tiers | Source focus -1734.5 px/off-screen; viewed anchor +83.5 px. Every destination: focus -367 px/fully visible; previous viewed image +209 px. Focus retained. | Matched loaded conditions agree exactly. Earlier wording implying that residency dependence alone proves different tier algorithms was too broad. |
| W2: same focus after real scrubber eviction, indexed and seek | Focus remained stored but unloaded/off-screen. Tracked viewed image remained fully visible: indexed +40.5 -> -111.5 px; seek +84 -> -68.5 px. | Eviction changes which image supplies continuity, within a tier too. This is a residency-dependent choice, not an intentional tier policy. |
| W3: loaded off-screen selection plus older hidden focus, all three tiers | Details opening held selected image at -1431.5 px; focus moved -1734.5 -> -2037.5; previously viewed image +83.5 -> +689.5 and off-screen. Closing restored final geometry. Density then put focus -367 px, selection -239 px, prior viewed image +209 px. | Reflow and density use different anchors, but each observed transition agreed across tiers. Preserving an off-screen selection ratio can displace visible content substantially; it is not evidence of preserving visible centre. |
| W4: loaded focus near temporary window bottom, indexed versus seek | Indexed followed focus; seek snapped to window bottom and left focus off-screen, despite both being far from true result end. | Genuine tier-dependent outcome: B7. |
| W5: evicted selection, two grid/table round-trips, with older absent focus and then no focus | Membership/focus state retained. Indexed original anchor -52.5 -> -203 table -> -463.5 grid (partly clipped), then repeated. No-focus run re-elected a different initial anchor at +142.5 and round-tripped there. Seek began at temporary DOM bottom and alternated -51.5 grid/+239 table in both focus setups. | Finite displacement and repeatability in these samples only. Starting anchors/boundaries differ, so neither clearing focus as a cure nor a matched cross-tier drift difference is established. |
| W6: current search plus density | Direct: density-origin abort traced; ordinary sort-then-density UI reproduced 13,210 -> 0, no error. API: same real controls retained 13,210/200 loaded and remained loading/unsettled through the five-second watch. | Original B8 transport-dependent symptoms; B8 is now Done. Cancellation handling differed, not intended preservation policy. |

**Validity limits:** query setup used the navigation helper and some source scroll
positions were set deliberately for matched geometry. Focus/tickboxes/panel/density/
sort/scrubber actions used real controls; invalid starting geometry was excluded.
The direct cancellation trace passed original arguments/results through; actual UI
reproductions used no wrapper. API W6 independently checked datasource, foreground,
source hashes and a new loading state before density, with no substituted response.
Only the direct abort event was instrumented. Shared client anchor policy does not
imply identical transport cancellation. The paired matrices below expand coverage;
neither they nor this baseline constitute current-code or performance certification.

### Coverage And Checks

**Original L7 coverage manifest, at the baseline above.** File/line counts and
partial-read limits describe that source pass, not current file sizes or a new
complete audit of subsequent repairs. Later unit acceptance is recorded separately.

**Lead full reads: all 22 required files, 14,193 lines.**

| Surface | Full reads |
|---|---|
| Store | [search-store](../../src/stores/search-store.ts) |
| Hooks | [data window](../../src/hooks/useDataWindow.ts), [scroll effects](../../src/hooks/useScrollEffects.ts), [URL sync](../../src/hooks/useUrlSearchSync.ts), [detail return](../../src/hooks/useReturnFromDetail.ts), [list navigation](../../src/hooks/useListNavigation.ts), [traversal](../../src/hooks/useImageTraversal.ts) |
| History/geometry | [snapshot builder](../../src/lib/build-history-snapshot.ts), [snapshot storage](../../src/lib/history-snapshot.ts), [image cursor cache](../../src/lib/image-offset-cache.ts), [grid anchor](../../src/lib/grid-scroll-anchor.ts), [viewport geometry](../../src/lib/viewport-anchor-geometry.ts), [tier predicate](../../src/lib/two-tier.ts) |
| Coordination | [reset](../../src/lib/reset-to-home.ts), [fullscreen exit](../../src/lib/fullscreen-exit.ts), [orchestration](../../src/lib/orchestration/search.ts), [history key](../../src/lib/orchestration/history-key.ts) |
| Five views | [grid](../../src/components/ImageGrid.tsx), [table](../../src/components/ImageTable.tsx), [detail](../../src/components/ImageDetail.tsx), [preview](../../src/components/FullscreenPreview.tsx), [scrubber](../../src/components/Scrubber.tsx) |

Additional full reads: [search route](../../src/routes/search.tsx),
[startup](../../src/main.tsx), [router](../../src/router.ts),
[schema/context transitions](../../src/lib/search-params-schema.ts),
[UI preferences](../../src/stores/ui-prefs-store.ts),
[selection store](../../src/stores/selection-store.ts),
[panel store](../../src/stores/panel-store.ts),
[click interpreter](../../src/lib/interpretClick.ts),
[click dispatch](../../src/lib/dispatchClickEffects.ts),
[tickboxes](../../src/components/Tickbox.tsx),
[range hook](../../src/hooks/useRangeSelection.ts),
[long-press dispatcher](../../src/lib/handleLongPressStart.ts),
[long-press detection](../../src/hooks/useLongPress.ts),
[swipe carousel](../../src/hooks/useSwipeCarousel.ts),
[swipe dismiss](../../src/hooks/useSwipeDismiss.ts),
[native fullscreen](../../src/hooks/useFullscreen.ts),
[search bar](../../src/components/SearchBar.tsx),
[tuning](../../src/constants/tuning.ts), [layout](../../src/constants/layout.ts),
[DAL contract](../../src/dal/types.ts), [position map](../../src/dal/position-map.ts),
[column alignment](../../src/lib/buffer-column-align.ts).

Partial reads with complete relevant functions: StatusBar 1-240 (density/refresh),
PanelLayout 118-end (resize/render), metadata-primitives 1-160 (metadata navigation),
ApiDataSource 1-190 (pages/rank), ES adapter 889-1095 and 1240-1428 (pages/rank),
Grid API adapter 170-329 (ID/page reads and failure propagation). Direct pages return
empty on AbortError; API pages propagate abort; both caller signal guards matter.
API has a 10,000 offset-read limit and no PIT; direct configuration differs.
Rank and cursor identity contracts were inspected, not backend query implementation
audited. Map collection internals, sort-builder internals, query parser, image-media
pipeline, zoom internals and TanStack source were not fully read; no claim about
their undiscovered defects or performance is made. Remaining render/gesture timing
claims are explicitly limited to callers and the evidence above.

Contract reads: full current guides 02/03/04/05 and the archived consolidation
specification, treated as potentially conflicting. Prior experiments consulted:
archive's bounded reload/clear observations and [KUP-013/017/018/027 evidence](bug-reproduction-evidence.md#bounded-focus-repairs-kup-013017018027),
including 22 September live controls and 27 September reverse-edge follow-up.
No paired performance campaign was rerun or reinterpreted.

Original assertion reads: full mounted density tests and snapshot-builder tests;
store setup/snap-back slice; range setup/ownership slice; focus-preservation 1-470;
scrubber no-focus density 2201-2420; UI resize 455-570; history setup/density control
and 1980-2135 repeated phantom restore. Shared helper startup, density and focus
functions, local runner config/setup and test guide were read. A full passing unit
run does not mean every test file was read.

| Check | Result and boundary |
|---|---|
| Three temporary store/mounted density probes | 3 expected assertion failures: obsolete missing-target clear; no-saved wheel overwrite; saved old-target write after newer focus. Real implementation, controlled data/geometry/scheduler. Removed, not permanent tests. |
| Temporary paired long-press composition | Resident control passed; asynchronous range failed (1 selected instead of 3). Same endpoints and successful response; real dispatcher/hook. Removed. |
| Temporary density-history browser cases plus existing control | 2 expected focus failures, 1 existing density control pass; local Chromium, ElasticsearchDataSource, 10,000 docs/indexed, explicit mode, no retries. Not TEST/API or other tiers. |
| Temporary equal-window/map-absent density control | Focused file passed 19/19 including the new discriminator: indexed restored at 193,600; seek snapped to local max 9,036. Temporary assertion removed. |
| Existing density-history control after probe removal | 1 passed, 4.7 s. |
| Full unit baseline after all probe removal | 2,198 passed / 82 files, 53.99 s. Earlier clean baseline also passed. |
| Product build / full E2E / performance | Not run: no retained product/test/config changes. Full E2E is not claimed; targeted browser checks are above. No speed-up or equivalence inference. |

Automated probes used runner-owned local infrastructure, not a real cluster.
Read-only TEST evidence is separately bounded above. No runtime identity, email,
credential or signed URL is retained in this ledger.

### Click-to-Open Paired Matrix

The operator requested a more thorough mode-specific pass: TEST media-api first,
then an operator-controlled switch to direct ES. The matrix is complete within the
explicitly recorded browser/device gaps. Earlier explicit-mode witnesses did not
substitute for these cells. No product changes are authorised.

| Coverage group | Media-api | Direct ES |
|---|---|---|
| P1: fresh keys; single-click/original return; next/previous/traversal return; hidden-focus keys and density | Complete for buffer/indexed/seek x grid/table (6 cells) | Complete for all 6; exact geometry matched API |
| P2: selection/body/range/clear; selected and unselected sort; query/filter and empty results | Complete for all 6 tier/view cells; buffered fill explicitly awaited | Complete for all 6; same outcomes, elected filter-anchor pixels differed |
| P3: history Back/Forward; list reload; detail reload and return | Settled and early-close variants complete in all 6 tier/view cells; early close differs, below | Complete for all 6 settled + early; exact geometry matched API |
| P4: fresh/hidden/selected layout; panel and browser resize; repeated density and evicted anchors | Layout matrix complete in all 6 tier/view cells; evicted lifetime covered in P5 | Complete for all 6; exact geometry matched API |
| P5: Home/End, seek, extension and real/temporary boundaries | Complete for defined API paths, including delayed edges, eviction/prepend and gated prepend-to-zero; B10 below | Complete for the same paths; exact steps/geometry matched API |
| P6: detail fullscreen and middle-click preview, with/without traversal | Complete for all 6 tier/view cells on the embedded desktop browser | Complete for all 6; exact outcomes matched API |
| P7: AI entry/re-sort/exit | Complete from all 6 ordinary tier/view source cells; AI destination is one finite buffer | Complete from all 6; client geometry matched, ranks/membership transport-specific |
| P8: delayed/failed reads, superseding navigation and search/density interruption | Representative ownership/failure compositions complete; B8 reproduced in Click-to-Open | Complete for representative controls, including corrected pending traversal in both views/modes |
| P9: synthetic long-press/swipe/dismiss composition; physical-device limitations separate | Complete for resident long-press control and seek grid/table swipe/dismiss under synthetic Chromium coarse state | Complete for the same synthetic grid/table scope; exact outcomes matched API |

**Evidence boundary:** original 1-2 October characterization, before the repairs
marked Done. Visible fine-pointer Chromium at 1130x886; independently checked
datasources and real controls. Natural corpora were about 820 / 13,207 / 1,221,812
matches, not immutable fixtures. Return/layout watches lasted 2.6 seconds after
readiness; fullscreen entry watches were bounded to 800 ms. Detail readiness used
identity and decode where stated; early-close B9 deliberately did not await the
underlying list. These samples do not establish all intermediate paints or later
timing behaviour.

| Group | Retained outcome / discriminator |
|---|---|
| P1 | Arrow/Page scroll without focus/ring; Enter/F inert. Single-click detail identifies the correct image. Original return: 0 px change; traversal return: 0 px centre. Loaded remembered identity influences later density (C03/C16). |
| P2 | Three-image selection/range does not create focus/detail/ring. Clear is stationary. Distinct older focus survives selected sort; ordinary phantom sort clears/top-resets. Filter follows remembered detail identity. Buffered controls remain stable through full fill. Empty query recovers through Clear. |
| P3 | Settled search history/list reload preserves identity at 0 px change and persisted selection. Original-detail reload keeps placement; settled traversed return centres. All early variants differ: C35/B9 retains the paired offsets and focus consequences. |
| P4 | Panel/reflow, height and repeated-density outcomes are bounded below and in C15-C20; selection survives but does not outrank older focus for settled density. |
| P5 | Home/End reaches true edges without creating phantom focus; hidden focus/selection survive. Resident data has no temporary edge. Indexed wheel browsing grows its global window. Held seek-edge reads preserve boundary anchor at 0 px on release; forward eviction is 99 grid/100 table. Final prepend-to-zero breaks continuity: C36/B10. |
| P6 | Detail fullscreen exit retains detail; original preview return has 0 px change, traversed detail/preview return centres at 0 px. Native Escape/macOS and physical touch are not certified. |
| P7 | Finite 200-hit AI entry clears absent source bookmark. Re-sort retains a newly remembered bookmark off-screen; exit follows it. Grid +255.5 px is visible, table +403 px is outside usable viewport. Q3 now accepts target precedence; no-bookmark exit remains L39. Ranking parity is not claimed. |
| P8 | Held initial sort cannot replace a completed Home; one-shot core-list 500 retains old data with error and recovers. Closing pending edge traversal prevents stale navigation/reopening while released data still progresses. Original sort/density failure is the now-repaired B8. |
| P9 | Synthetic Chromium coarse events: resident long-press selects the exact range; swipe traversal/dismiss centres, original dismiss is stationary. This does not refute asynchronous B3 or certify physical devices. |

**Layout measurements retained for Q1/L18:** with a 320 px panel, an off-screen
grid bookmark stayed at -1847 px while the viewed image moved -29 -> +880 px;
selected-anchor setup held selection at -1544 px and moved the viewed image to
+577 px. Dragging wider removed the viewed image; closing restored -29 px. Table
held +8.5 px through panel open/drag/close. Height reduction shifted signed geometry
+118 px. Four unanchored density changes moved grid -29 -> -180 -> -440.5 -> -382.5
-> -1057 px (outside), and table +8.5 -> +162 -> -162 -> -454.5 -> -364.5 px
(transiently clipped, finally visible). Do not infer guaranteed convergence or
unbounded drift. Loaded-bookmark density repeatedly follows that bookmark instead.

**Transport comparison:** P1/P3/P4/P5/P6/P9 matched in the recorded paired geometry,
including B9 and B10. P2 matched behaviour but elected different filter anchors;
it is not a same-identity pixel comparison. P7 matched client exit geometry with
transport-specific membership/ranks. P8 differs for the historical B8 cancellation
symptom, not policy. Pending-traversal controls held a real successful cursor read
at an established deep edge before closing; invalid/inactive gates are excluded.

### Click-to-Focus Paired Matrix

The explicit mirror uses the same shared natural-tier setup, capture geometry,
readiness, request gates and transport fixtures as Click-to-Open. Its own runners
change only mode-specific interactions and assertions: single click/ring, focused
arrows, Enter detail, F preview, explicit sort/query ownership and focus eligibility
during selection. The shared installer rejects a mismatched effective mode.

| Coverage group | Direct ES | Media-api |
|---|---|---|
| F1: no-focus keys; click/ring; focused arrows; Enter/F; traversal; snap-back; density | Complete for all 6 tier/view cells | All non-preview checks complete in 6 cells; preview entered, Escape is VS Code-limited and works in Chrome |
| F2: selection/range/clear; selected and ordinary sort; filter; empty/recovery | Complete for all 6 | Complete for all 6; same outcomes, one seek-grid elected row differed |
| F3: history Back/Forward; list reload; settled and early detail reload/return | Complete for all 6 settled + early cells | Complete for all 6 settled + early; exact outcomes matched direct |
| F4: fresh/focus/selection layout; panel/viewport resize; repeated density; shortcut eligibility | Complete for all 6 | Complete for all 6; preview action omitted only for the confirmed VS Code Escape limitation; geometry matched direct |
| F5: Home/End policies; global paging; delayed seek edges; eviction/prepend; prepend-to-zero | Complete for all shared applicable paths | Complete for all shared paths; exact outcomes matched direct |
| F6: detail fullscreen and preview with/without traversal | Complete for all 6 desktop cells | Environment-limited: native preview entered; VS Code hijacks Escape, while operator confirmed normal Chrome exits correctly |
| F7: AI entry/re-sort/exit | Complete from all 6 source cells | Complete from all 6; client geometry matched direct, ranks transport-specific |
| F8: supersession, sort/density, failed reads, pending traversal | Complete for representative controls including corrected pending traversal in both views/modes | Complete for representative controls including pending traversal in both views |
| F9: synthetic coarse long-press/swipe/dismiss | Not applicable: coarse pointer forces effective phantom mode | Same product rule; no explicit-mode touch cell |

**Mode-specific outcomes:** no-focus keys scroll and Enter/F are inert; a click
creates a ring, focused arrows move/snap back, and Enter/F open the chosen image.
Original return is stationary and settled traversal return centres with the correct
focus. Selection hides the ring and suppresses Enter/focused movement but permits F;
Clear restores focus eligibility without movement (accepted Q5). Selected-sort
distinct-identity controls passed; the former equality defect is now repaired B6.
Home/End moves only eligible explicit focus, retaining it while selection is active.
F3 reproduces B9's early-return offsets plus wrong focus; F5 reproduces B10.

F4 matches phantom layout geometry; focus/selection eligibility differs, not tier
policy. F7 follows the new explicit AI focus during re-sort and exits at +47.5 px
grid / +51 px table, versus phantom +255.5/+403. Transport-specific ranks and an
adjacent elected row in F2 prevent universal same-identity pixel claims. F8 retains
the same supersession, core-list failure and pending-traversal controls as P8;
historical B8 transport symptoms are not current failures.

**Coverage gaps and exclusions:** API explicit preview entry succeeded, but native
exit/Escape remains an embedded-browser tool limitation; the operator confirmed
normal Chrome works. Direct explicit and API phantom passes do not fill that cell.
F9 is inapplicable because coarse pointer forces phantom (accepted Q6). All physical
touch/Safari, unbounded timing and performance claims remain excluded. Hidden-tab,
service-outage, wrong-fingerprint, inactive-gate and driver-serialization samples
were excluded; only corrected valid controls contribute to the matrices.

<a id="retained-tooling-and-resume-boundary"></a>
### Diagnostic Tooling

**Current executable compatibility: unverified at `4c2a14f8e`.** The two probes
and their P/F results remain useful historical evidence, not a current smoke suite.
Some setup was migrated during the density work, but that is not a fresh execution
certificate for every runner. Do not claim the probes are broken or working without
checking the selected capability. Before reuse, inspect its current imports, params,
selectors, ownership/readiness assumptions and safety guard, then run only the
separately authorised bounded check. A harness failure is not a product regression.
Do not port the whole probe or repeat the browser wandering as a prerequisite to
L45. Keep original results/revisions even if a runner later needs replacement.

The operator explicitly allowed retaining the shared
[Click-to-Open helper](../experiments/not-yet-another-audit-click-open-probe.js)
and its [Click-to-Focus mirror](../experiments/not-yet-another-audit-click-focus-probe.js).
They are diagnostic tooling, not application changes or an installed regression
suite. The mirror installs the same harness with `expectedMode: explicit`, owns
only mode-specific runners, and reuses shared engine/transport runners. A mismatched
effective mode aborts setup. `completed: true` means the workflow reached its end,
not that every observed behaviour meets the contract. Inspect returned booleans,
identity matches, geometry and readiness conditions.

Implemented/executed: `runBasic`, `runTransitions`, `runHistory`, `runEdges`,
`runBufferLifetime`, `runLowOffsetReset`, `runAiTransitions`, `runInterruptions`,
`runLayout`, `runFullscreen`, `runTouchComposition`.
The explicit mirror implements its own `runBasic`, `runTransitions`, `runHistory`,
`runLayout`, `runDensitySupersession` and `runVerticalResizeMatrix`; shared P5-P8
runners branch only for real focus/detail entry.
Layout uses matched 320 px panel setup, real panel dragging, width/height viewport
changes and repeated density. Fullscreen distinguishes detail and middle-click
preview. Coarse-pointer touch is intentionally phantom-only.
`holdNext` has exercised successful first-page supersession, delayed seek edges and
pending traversal, plus every prepend in the low-offset-to-zero discriminator.

Run named drivers from **raw source**, not Vite-transformed `.toString()`:

```js
const raw = await page.evaluate(async () => {
  const helper = '/exploration/experiments/not-yet-another-audit-click-open-probe.js?handoff=20261002';
  await (await import(helper)).install();
  const source = '/exploration/experiments/not-yet-another-audit-click-open-probe.js?raw&handoff=20261002';
  return (await import(source)).default;
});
const start = raw.indexOf('export async function runLayout(');
if (start < 0) throw new Error('Driver absent');
const next = raw.indexOf('\nexport async function ', start + 7);
const run = eval('(' + raw.slice(start + 7, next < 0 ? raw.length : next) + ')');
return await run(page, { transport: 'api', tier: 'buffer', view: 'grid' });
```

Use a fresh query marker after helper edits; HMR is unreliable in this embedded
setup. For history, pass `settledReload: true` for controls and `false` for the
early-close sequence. Verify actual datasource separately: the `transport` option
is a label, not an assertion or switch. On reload the installer must belong to
the new document; the helper waits for changed `performance.timeOrigin` and app
store initialization before restoring private IDs in memory.

Both transport matrices are complete within the limits recorded above. Retain the
helpers as reproducible evidence, not proof beyond their bounded watches. The
remaining environment limitation is media-api explicit native Escape in VS Code;
normal Chrome works and the app teardown paths are otherwise covered. No product fixes, Git
mutations, server writes or performance campaign are authorised.

### Engineering Assessment (Source Pass)

Necessary distinctions remain: global versus buffer-local coordinates; cursor
identity versus estimated rank; buffer compensation versus semantic re-anchoring;
native list retention versus traversal centring; request cancellation versus
whether a later callback still owns focus; and storage snapshots versus live
selection. Removing their names would not remove those responsibilities.

**Post-slice source/test assessment at `ae08e779d`:** ordinary/AI/history handoffs
bind target, placement and focus treatment; detail shares entry identity and retains
pending return. These are real improvements, not merely bug closures. Necessary
ownership distinctions are more explicit, but whole-flow reasoning remains spread
across records, signals, generations and status fields.

The inspected baseline coupled `fallback === "top"` in search/AI reorder to
history focus-intent protection and pending-history handling. L42 now separates
those responsibilities with explicit provenance, without changing live policy.
The current ratio/centre substitution proof is useful but does not prove independence
of all policy dimensions. `hasPendingSearch` also uses status-shaped state; inspect
its authority before replacing it, rather than inventing a universal pending owner.

L41 addresses demonstrated test-fixture duplication and proof clarity, not blanket
test deletion. Green counts, shorter files or added helpers alone prove neither
simplification nor speed. Existing performance records retain their revision limits;
this assessment is not a runtime or performance re-certification.

## Decisions

- **D1 Preserve strictly, relax deliberately.** Every transition keeps the anchor
  image at the same viewport position; relaxations are explicit, per transition,
  with a named target (top, visible centre image, specific image). See 02 §1, §4.
- **D2 Click-to-Open distinguishes remembered detail identity from browsed centre.**
  For ordinary query/filter changes and AI exit, the last image returned from detail
  takes precedence over the current browsed centre, even off-screen, if it survives.
  This replaces the earlier blanket ban on hidden focus as an anchor. With no such
  remembered image, AI exit now preserves browsed centre without creating focus;
  L39 is repaired, reviewed and locally verified. Keep the existing
  no-selection ordinary-sort clear-and-top exception and missing-target fallbacks.
  Selection clear follows Q4; broader layout/history placement remains Q1, while
  density lifetime follows the delivered Q2 policy.
  This precedence is revisable policy, not a rule to embed in request ownership.
- **D3 Behaviour is fixed during consolidation.** Refactor items change no
  observable behaviour; any behaviour change is its own decided item.
- **D4 No speed-up claims without measurement.** The goal for this core is no
  regression, checked with the perceived-performance suite.
- **D5 Historical layout rule, under Q1 review.** The earlier rule says browser
  resize, panel toggle and density keep the visible centre in both modes, and an
  off-screen selection never pulls it back. Current column change instead preserves
  an off-screen selection ratio and substantially displaces visible content. Q1
  permits meaningful focus/selection or browsed centre, with legitimate true-bottom
  handling; each transition's preference remains revisable. An accidental third
  target is not accepted. Ask before introducing any additional exception.
- **D6 Explicit policy, not a prescribed universal engine.** Adopted search/history
  and detail paths use small typed choices. Their differing lifetimes remain useful.
  L42 separated policy from provenance/ownership; L9 does not authorize one
  universal chooser, coordinator, cancellation epoch or capture format.
- **D7 Tiers are invisible.** Buffer, two-tier and seek tiers are implementation
  detail. Every preservation behaviour must be identical across tiers; a
  tier-dependent outcome is a bug. Characterisation (L7) covers every tier.
- **D8 Destination ownership; broader placement remains open.** No blanket anchor policy
  for layout changes or history is approved by this entry. A history entry's
  own focus (including no focus) and its viewport position are separate concerns:
  restoring position must not discard that focus or substitute another entry's.
  Preserve the existing snapshot's representable contract; independently storing
  both bookmark and viewport remains outside this slice. Q2 delivers
  density outside URL/history, persisted per tab across refresh, with Home and
  latest-action ownership. Density does not create a historical destination.

<a id="preliminary-what-next"></a>
## Structural Work

Ordinary search/sort, B6 and AI adoption/L39 are delivered within their recorded
verification boundaries. Destination history and independent density are delivered
within local limits, including B13/B14 and producer-removal supersession of B1.
Detail return closes B9/B12. L41 is included in HEAD; L42 is completed within
its recorded local limits. Subsequent scope requires operator selection;
other expansion remains proposed, not authorized. The goal is a clearer, less brittle
continuity system whose behaviour can evolve, not a completed bug list or a
predetermined rewrite. Each delivered unit must remain useful if wider replacement
is delayed, abandoned or rolled back.

### Direction And Evidence

The code supports structural work, but does not yet establish the scope of a
replacement **Navigation and Viewport Continuity Engine**. Four problems justify
intervention:

- **Mixed meanings:** focus also carries last-viewed identity; history cannot
  independently represent the bookmark and the place being browsed (C03/C27).
- **Policy/ownership coupling:** ordinary/AI/history now share owned handoffs,
  but at the inspected baseline fallback also selected history lifecycle authority.
  L42 removes that coupling with explicit provenance, not identity-free ratio capture.
- **Inferred intent:** L43 removed buffer-zero-as-reset (B10); loaded DOM bottom
  still supplies result-edge policy in settled density (B7).
- **Mismatched ownership:** long-press can cancel its own range operation (B3).
  B8/B17 separate discovery, browsing and maintenance; B18 uses that browsing owner
  for presentation. These repairs do not settle every continuity boundary.

Grid and table already share substantial scroll, data-window, traversal and return
machinery. Another shared module is progress only if it removes competing
decisions or ambiguous state. A pure anchor chooser alone cannot fix publication
and cancellation lifetimes. Do not introduce one universal cancellation epoch:
obsolete placement and still-useful data loading may have different lifetimes.

Prefer explicit state, captured transition inputs and owned effects. Keep policy
independent of datasource and rendering details where the real paths permit it;
"thin adapters" is a hypothesis to prove, not a cost estimate. Seek currently uses
viewport geometry when preparing its buffer and placement together. Separating
those responsibilities must retain atomic publication, column alignment, browser
clamping protection and the legitimate global/local coordinate distinction.

### Policy Must Remain Revisable

**Policy should be easy to revise later, not require a comprehensive product freeze
before structural work starts.** The operator reports that this prototype has not
yet been evaluated by users or UX practitioners. Current UX choices are therefore
not evidence of validated usability, even when their implementation is well tested.

Distinguish enduring guarantees (authorization, coherent results, valid ownership,
tier/transport-independent policy) from chosen UX rules, known defects and accepted
approximations. Preserve smooth arbitrary-position browsing, position continuity
and traversal; do not silently strengthen exactness at additional runtime cost.

Resolve only the unanswered choices needed by the next unit. Record an operator-
approved provisional answer against its existing Q/case, its acceptance examples
and what would prompt reconsideration. Q1's density, reflow, height and history
choices need not be settled together; they did not block the bounded B8 repair. Established
behaviour remains the baseline until explicitly revised. "Provisional" is not
permission for engineers to invent policy or silently change existing assertions.

Keep policy expectations distinct from invariant tests so later UX feedback can
change a rule without reopening request ownership or rewriting every view. A small
typed policy function may help; neither a universal table nor user-facing policy
switches are required. Test adjustability by substituting a policy in a fixture,
not by changing live user preferences or adding a configuration framework.

**Policy changes should be able to alter expected placement without weakening
ownership or coherent-publication assertions.** Retain this proof as adoption expands:
for the same target, substitute centre placement for captured-ratio placement in a
fixture while retaining stale-work, publication and completion assertions. A later
policy that chooses a different target may legitimately require different reads;
independence does not promise identical request counts for every policy.

### Proposed Sequence

1. L41-L43 are complete; do not reopen their execution prompts.
2. The coordinator recommends **L45 Stage A**, a bounded density-restoration
   replacement/deletion design. Confirm this choice with the operator before starting.
3. Stage B implements only the approved design. No next slice follows automatically.

Keep one active unit, including across sessions. Resume the same brief/worklog;
do not create another plan or widen scope because a session ended. The
[helper shortlist](../../e2e/README.md#strong-candidates) and
[one-candidate prompt](continuity-test-refresh-prompt.md) remain optional alternatives,
not the recommended next step or evidence of a runtime bottleneck. A separately
selected bug repair may interrupt the programme without being called consolidation.

### Density Restoration Replacement (L45)

**Proposed next slice; design not yet executed, product implementation not approved.**
One responsibility: capture a density transition's placement intent and consume it
under the right lifetime in the new geometry. B4/L23 and B7/L25 belong here; this is
not a batch of unrelated bugs or a general continuity-engine rewrite.

**Why this slice:** settled density still mixes target choice, source-edge inference,
two-frame readiness and competing saved/no-saved restoration paths in
[useScrollEffects](../../src/hooks/useScrollEffects.ts). The existing geometry
descriptor already shares grid/table mechanics. A new wrapper alone would add no value.

**Stage A, one bounded design session:** read the complete density producer/consumer,
Home suppression caller and existing density/browse tests. Recheck the current B4/B7
code hypotheses without live work or product edits. Amend this brief with a compact
design (aim at 40 lines, not a new report): current authority; proposed ownership and
policy/geometry boundary; exact obsolete branches/state to remove; preserved callers;
test replacement/deletion map; risks, gates and stop condition. Explain what another
density must supply and where an approved anchor-policy change would become local.
No new density implementation, framework or exhaustive audit is needed to answer that.

**Replacement hypothesis, not a mandated API:** one owned density-restoration path
can retain a captured target/placement while separating current input permission from
geometry readiness. Reuse existing focus intent and browsing ownership rather than
inventing another global epoch. Delete the no-saved anchor fallback only if its
current caller audit confirms it is unnecessary; otherwise account for its real
contract in the replacement. Source DOM bottom is not a logical result end (B7).
If the proposal only moves code/adds guards or cannot identify meaningful removals,
stop and recommend against implementation; do not substitute another slice silently.

**Stage B, only after design approval:** replace and remove the agreed machinery;
prove B4's newer-focus interruption and B7's temporary-versus-true-end discriminator
failing-first if still present. Preserve pending B17/B18 destination/departure frames,
Strict Mode, current header/column geometry, saved-wheel controls, Home/latest-density
ownership and existing focus/selection policy. Reuse or strengthen owning tests;
retire superseded proof with an explicit contract map. Net production/test cost and
actual decisions removed are acceptance evidence, not just a green suite.

**Non-goals:** deciding Q1 anchor preferences or Q7 horizontal restoration; grid-width
reflow, height-only resize, history snapshot/schema, detail return, buffer/seek algorithms,
transport contracts, B19 or the reported badge issue. Preserve current settled target
precedence and legitimate true-edge clamping. Any necessary new UX choice goes back
to the operator. Do not bundle L12 suppressions or L44 mock expansion.

**Gates/bounds:** Stage A is source/design work, not a new runtime certificate.
Stage B needs focused proof, full unit/build/retry-free normal and forced-seek E2E,
plus the standing two inline cold reviews and repair re-review. Inspect existing
performance evidence before proposing a specific operator-run density check; no
live/perf authority transfers from old results or the shared tab. Apply the session
prompt skeleton below with the stage named explicitly.

### Owned Reset Presentation (L43)

**Done, `4c2a14f8e` from `244a32633`.** Removes Effect 8's offset-zero reset,
the thumb-generation/near-zero completion proxy and unowned thumb DOM writes.
Existing publication/navigation now authorizes placement; Home owns a revocable
feedback token and refresh defers movement to fresh data. No new request owner.
[B10](#b10), [B11](#b11) and [B16](#b16) retain witnesses, controls and closure limits;
[test guide](../../e2e/README.md#reset-presentation-proof) owns the 38-unit/18-browser
proof map. Final gates/reviews are in Current Status. B19, later-density geometry
and L44 remain separate. Client DTO proof is not native server cancellation or
live direct/API performance parity. Retired execution instructions are not new scope.

### Optional Nullable Mock Coverage (L44)

**Optional, unselected test-infrastructure follow-up; not an L43 gate or an
application bug.** Eight new L43 draft composed Credit/Taken on null-boundary
cases were deleted, not skipped or moved into an opt-in suite. Their unused
fixture extension was removed too. The full owning scroll-effects unit file
passes all 511 retained tests; no established coverage was removed. Exact local
composed coverage from those drafts is not claimed.

The [mock tuple extractor](../../src/dal/mock-data-source.ts#L128) handles Credit
and lastModified but not metadata.dateTaken. Its [missing-field filter](../../src/dal/mock-data-source.ts#L233)
does not handle nested metadata.credit, and [full-corpus ordering](../../src/dal/mock-data-source.ts#L284)
is opt-in through sparse/skewed source configuration. Those limitations invalidated
the drafts' valued/null preconditions; they are not evidence of a product defect.

We MAY return to expanding those mock capabilities in a separately selected unit.
First require independent ordered corpora, missing-last in both directions,
primary/suffix/ID tuples, nested missing-field filtering and reverse-boundary page
controls; keep fixture failures separate from application red-to-green proof.
Retain existing sparse-date adapter tests and the recorded live Credit/Taken on
evidence without treating them as the deleted composition tests.

The [special-sort ES oracle](../../integration/special-sort-es.test.ts) is a
separate real-local-ES mutation oracle, not a home for unsupported mock tests.
Its [dedicated config](../../vitest.special-sort-es.config.ts) remains opt-in;
habitual [Vitest](../../vite.config.ts#L139) and [Playwright](../../playwright.config.ts#L23)
do not run it. It was neither modified nor executed for this disposition.

### Test Refresh Pilot (L41)

**Done, `85dae28b3` from `ae08e779d`.** One observation-only hit-tested point
helper replaces browsing/detail duplication; callers retain action/readiness policy.
No product assertions were removed; twelve negative/lifetime controls were added.
The [test guide](../../e2e/README.md#continuity-input-pilot) owns the proof/reuse map
and historical gates. Two cold reviews and full local/harness gates passed; no
live/perf run or runtime improvement was established. This extraction is not
permission to migrate more callers or preserve every old test in future replacements.

### Ownership Consolidation (L42)

**Done, `244a32633` from `85dae28b3`.** Explicit user/history provenance replaces
three lifecycle decisions previously inferred from fallback. Fallback still controls
neighbour policy. Fixture substitutions prove those choices can vary independently;
production policy and requests stay unchanged. Two cold reviews and unit/build/
retry-free E2E gates passed; no browser/perf code or live work changed.
The [ownership guide](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md#34-ownership-and-cancellation)
owns the current model. Resolver status remains necessary: a live signal cannot
distinguish idle/completed work, and legacy snap-back has no continuity record.
Completion intent guards do not certify post-publication click/clear while awaiting
density readiness. No universal owner or global compatibility removal is claimed.

### Detail Return Unit

**Done, `ae08e779d`.** One history-backed entry identity/return policy replaces
gesture-versus-close disagreement (B12). Publication-driven placement retains an
early close through existing restoration (B9), without polling or a duplicate read.
Focus intent separates input from passive restoration; the cursor descriptor lets
remounts join useful work. Original return remains native, traversal centres and
Home suppression remains. [B9](#b9)/[B12](#b12) and the
[test guide](../../e2e/README.md#detail-return-coverage) own evidence and maintained
early/settled, stale-callback, reload/gesture and request-budget controls.
Two cold reviews and full unit/build/E2E/harness gates passed. Three retained-job
setup repairs prove bounded lifetime/GC controls, not every async evaluation.
No new live/perf, physical-device, snapshot-schema or stronger seek certificate.

### History And Density Unit

**Done, `7b82b13f8`.** Destination-derived continuity removes adopted snapshot-hint,
AI identity-argument and numeric-ratio decisions (B13/B14). Removing density from
URL/history supersedes B1's producer; Q2 owns session persistence and latest-density
Home policy. Marked detail origin/entry identity distinguishes native close from an
unrelated history destination. Snapshot still represents one anchor, not independent
bookmark plus viewport; unmarked-detail and cursor/arrow/layout compatibility remains.
[B1](#b1), [B13](#b13), [B14](#b14) and
[session-aware setup](../../e2e/README.md#session-aware-density-setup) own the proof.
Cold reviews/re-reviews and full local/harness gates passed. Perf setup was migrated
without workload/measurement changes; no live campaign or performance equivalence
was certified. No Q1/Q7, storage redesign or wider bug closure follows.

### AI Continuity Unit

**Done, `08e9c5fb0`; C10/L39.** Shared pre-passive continuity replaces the separate
AI target chooser and numeric capture. Remembered identity wins; otherwise exit
preserves centre without focus. Re-sort replaces presentation, not discovery; retired
placement and aborted history owners cannot revive on completion (AI-R1/R2).
Later history adoption supersedes this milestone's remaining numeric bridge.
Forty-six mounted and four browser controls used real client AI mapping with synthetic
responses/ordinary mock reads, including ratio/centre substitution and stale delivery.
Cold review/re-review and full local gates passed, not live ranking/perf equivalence.
Direct score/count/error and API ordinal/absence/enrichment contracts remain distinct.
Exit discards AI rank hints: first-page targets add no lookup; the out-of-page fixture
budget is one initial page, one target lookup, two centred reads and one rank read.
Settled re-sort is request-free; pending sorts retain one AI request. Direct's pool
count can outlive cancellation; browser abort is not server-work cancellation proof.

<a id="first-searchsort-unit"></a>
### Ordinary Search/Sort Current State

**Done, `d9b70c013`; L8/B6/L24.** One
[capture](../../src/lib/search-continuity.ts) binds target, placement, focus and
neighbours before passive URL dispatch. Existing owners publish resolved identity
with coherent data and consume/retire placement; small-result retry remains bounded.
Equal selected/focused identity now retains focus (B6). Missing-target and ordinary
phantom-sort policy stays. Composed equal/distinct, ratio/centre, adapter/map and
density-interruption controls passed with cold review and full local gates.
Later AI/history adoption removed their numeric bridge; layout/cursor consumers remain.
No new live/perf certificate; some fallback/Strict Mode combinations were source-only.
Relevant future performance comparisons are P4a/P4b/P6/P9 and PP3/PP4/PP5/PP8 against
matching 2 October post-B8 records, not a newly authorized campaign.

### Preventing A Bug-Fix Detour

Maintain a structural milestone and a bounded repair lane, with one active
implementation unit. Completed continuity units remain regression controls;
L41/L42/L43 are complete; L45 is the proposed next design, pending operator selection.
A repair may interrupt an active milestone for
observed breakage, a blocker to its proof, or a separately justified cheap benefit;
make the displacement and return point explicit to the operator.

Before selecting a repair, give it one disposition in the existing Open Item:
**repair now**, **absorb into a named slice**, or **defer with a revisit trigger**.
Consider demonstrated harm, observed exposure, estimated repair/validation cost,
regression risk and overlap. Do not invent user-frequency rankings for a prototype
without users. "After the rewrite" alone is not a valid trigger: if the named slice
is postponed or rejected, reconsider the bug as an independent repair.

Repairs need not pretend to be architectural progress. B15, for example, can be
worth fixing for reload reliability without helping the continuity boundary. Do
not burden such a repair with speculative future-engine abstractions. Conversely,
closing several bugs is not proof that the structural milestone advanced.

Stop when a repair requires another ownership boundary, an unresolved UX decision
or materially larger scope than agreed. Report the dependency and ask whether to
expand, defer or fold it into the structural slice. Newly noticed non-blocking
bugs go into the ledger under its normal claim/disproof rules, not into the active
patch. Do not batch unrelated fixes merely because they touch the same file.

At each unit's end, assess two results separately: **behaviour repaired** and
**structure simplified**. Name actual decisions unified, ambiguous roles separated
or obsolete paths removed. Then explicitly resume the named milestone or seek a
new priority decision. If repeated repairs consume the work, pause and reconsider
the programme rather than describing maintenance as a rewrite in progress.

### Work Units And Exit Gates

Use short unit briefs attached to the existing ledger items, not another planning
register. Before implementation, agree:

| Field | Required content |
|---|---|
| Outcome | One observable repair or structural responsibility to improve; linked C/B/L IDs |
| Contract | Invariants, chosen/provisional policy and any unanswered decision that blocks this unit |
| Boundary | Owners and paths involved, exclusions, and the replaced machinery a structural slice intends to remove |
| Proof | Failing-first bug assertion, existing assertions affected, composed interruption controls and applicable unit/build/E2E gates |
| Test impact | Existing tests to strengthen, reused/inspected helper and probe capabilities, new cases justified by distinct contracts, fixture/runtime cost and any old-to-new coverage mapping |
| Structural acceptance | Competing decisions or inferred authority removed, necessary distinctions retained, compatibility boundaries left, and the concrete future change made more local |
| Budget and stop | Investigation/scope limit, escalation condition, rollback and next milestone |

For a structural slice, contract checks must pass against the retained baseline
except for separately approved bug fixes or policy changes. Do not combine a
behaviour change with consolidation invisibly. A unit is complete with its bounded
change, maintained tests, required verification and owning documentation updated;
it does not wait for the hypothetical full engine. Remove replaced code only when
its responsibility is covered and the slice is adopted. Retain useful contracts
and repairs if the broader approach is rejected.

### Test Impact And Maintenance

Every slice records four answers before implementation: which existing assertions
change; which helper/probe capability is reused or deliberately not extracted;
which distinct contract/interaction justifies new cases; and which setup/runtime
cost or fixture machinery is added. Keep this in the unit/worklog, not a new audit
register. Small local improvements belong in the slice; cross-suite changes require
a named pitstop such as L41. Test refresh is not permission to fix application bugs.

**Replacement is allowed and expected where justified.** Do not interpret preserving
behaviour as preserving every historical test. Name old cases, duplicated fixtures
and implementation-specific assertions that the stronger contract proof replaces;
delete them in the same adopted slice. Keep the independent oracle, meaningful timing
and browser-only proof, not obsolete implementation shape. Explain a deliberate
net addition; do not automatically add all permutations or move complexity into a
generic test framework. Judge maintainability, coverage and wallclock separately.

Separate policy examples, ownership/publication invariants, rendered geometry and
actual-input journeys. Put a matrix at the cheapest layer that really proves it,
but retain browser-only wiring/paint proof and known multi-axis races. Fewer cases,
pairwise selection or parameterization alone do not establish equivalent coverage.
Every removed/merged check must map its meaningful assertions and timing conditions
to retained tests. Keep independent oracles; do not copy production decisions into
helper expectations and then call agreement proof.

Reuse observations and resource handling, not hidden policy. Distinguish detail
readiness, list/target availability, committed publication, placement and stable
frames. A universal settlement wait must not erase early-close or pending-frame
tests. Gates must identify intervention points, propagate rejection, release/drain
held work and restore only owned resources. Keep storage/context isolation and
effective-view assertions; never retry bad setup into a false green.

Use existing test-duration reports before selecting runtime work. Distinguish
fixture/bootstrap cost, deliberate controlled delay and tested execution; declare
missing or incomparable timings. Do not require a new full baseline run solely to
populate a table. Parameterization may shorten code without reducing execution.
Application jank/perceived performance and test wallclock are different questions.
No speed-up claim without comparable measurements; no weaker assertions, inflated
timeouts, global state reuse or smaller corpus that removes the tested regime.

### Cold Review Gate

For an approved slice, the implementing coordinator must invoke fresh read-only
subagents inline after implementation and focused checks. Do not stop at "ready
for review" or ask the operator to supply reviewers. Two independent reviewers see
the full changed slice and necessary boundary context, with complementary briefs:

1. **Plan and structure:** judge adherence to the approved outcome, anti-goals,
  operator policy, actual decisions removed and justified remaining boundaries.
2. **Correctness and proof:** judge lifecycle/data/geometry risks, old-to-new test
  coverage, negative controls, helper/oracle independence and fixture/metric integrity.

Supply the approved plan, actual baseline/diff, affected consumers and tests, not
only a success narrative. Require file/line evidence, concrete failure/disproof
checks, scope deviations and unread/uncertified boundaries. Both reviewers may
raise cross-boundary findings; split briefs must not create an unreviewed gap.
Reviewers do not mutate shared docs/code, run tests/live checks or own the worklog.
Their questions return to the coordinator. Read applicable instructions and supply
context through the assignment; routine review needs no new operator permission.

Fix in-scope findings with focused proof and invoke cold re-review of repairs and
affected integration. Escalate genuinely new scope/policy/safety requirements;
do not silently implement every suggestion. Passing tests is not plan adherence,
and self-review is not independent review. Unavailable delegation is a disclosed
blocked gate, not permission to claim acceptance. Required startup confirmation,
test-port coordination and live/perf permissions remain separate.

### Validation And Completion

For an approved implementation stage, run focused checks during meaningful edits, then full unit,
TypeScript/Vite build and retry-free normal plus forced-seek local E2E after the
last meaningful repair. Shared E2E/perf helper or harness changes also require
`test:perf-harness` and applicable local fixture checks. Use repository scripts
from root (`npm --prefix kupua ...`), foreground `set -o pipefail` and a bare
`tee "$TMPDIR/kupua-test-output.txt"`; never hide live output or poll an active run.
Coordinate ports 3000/3030 before unsandboxed Playwright; use runner-owned setup.
No live systems, perf campaigns, dry runs, backend writes or Git mutations follow
from these gates. Read the authoritative test instructions before execution.

Application build excludes some test/perf TypeScript surfaces. Run applicable
checks and compare inherited diagnostics by identity, not merely total count;
zero new diagnostics is not a clean-config claim. Report unavailable checks.
Bug/policy/protection changes need an intended failing-first discriminator; a
helper extraction needs baseline-to-after equivalence and adversarial controls,
not a manufactured application bug or a compiler error labelled behavioural red.

Close with separate results for behaviour, actual production/test removals,
remaining compatibility, review and verification. Use a short completion record
(normally at most ten lines) with outcome, revision, proof location and material
limits, not the execution brief copied into past tense. Preserve C/B evidence;
do not close untested residuals or weaken the core performance requirement.

**Documentation is part of the subtraction review.** Architecture guides describe
the current system, not the agent's session. Amend or replace the owning paragraph;
do not append a slice-named success section, test totals, review rounds or debugging
story. A bounded repair normally needs a few sentences, not half a guide. Keep only
the changed contract/ownership and essential rationale; justify genuinely larger
design documentation by the architecture it explains, not effort spent. Remove
superseded prose. Test guides likewise own stable helper contracts, not every gate
run. The changelog records concise code-change rationale, not planning-only work.
The temporary worklog carries resumable details and is reset at completion. Do not
copy it into permanent docs. Never commit without approval.

### Session Prompt Skeleton

Use this with a specific authorized unit; the template alone grants no new scope.
The L7 coverage manifest is historical evidence, not a demand to reread every file
or rerun every experiment at session start.

```text
Execute <approved unit ID, stage and ledger anchor>, and no other unit.
Read AGENTS, worklog, ledger Coordinator Brief/Current Status, the selected unit,
needed Q/C/B records and standing execution rules. Perform fresh-agent confirmation;
verify HEAD/worktree and current owners. Do not inherit live/Git/test-port authority.
State outcome, exclusions, hypothesis and cheapest discriminator. For a structural
replacement, name obsolete decisions/branches/state and test scaffolding to DELETE,
the smaller replacement and a concrete future UX/density change made more local.
If that case fails, stop; do not settle for wrapper extraction or extra guards.
For design-only stages, return the bounded decision in the existing brief and stop.
Do not modify product/tests, run a campaign or imply implementation approval.
For approved implementation, make small edits with immediate focused validation.
Prove real bugs failing-first; do not manufacture reds from stale evidence. Keep
policy revisable and useful data independent of retired presentation. Preserve
atomic publication, coordinates, cursor/alignment and performance safeguards.
Map contracts/timing to retained proof. Strengthen/rewrite existing tests and REMOVE
superseded cases/fixtures where coverage survives. Justify additions and actual cost;
no assertion weakening, hidden waits/retries or combinatorial expansion by default.
Invoke two fresh read-only reviewers INLINE for plan/structure and correctness/proof.
They must assess actual removals, retained bug protection, doc proportionality and
unread limits. Fix in-scope findings and invoke repair re-review yourself.
Run full required local gates with normal port/safety/streaming rules; qualify
inherited diagnostics and missing evidence. No automatic live/perf run or Git mutation.
If another session is needed, keep the same unit/stage and note current revision,
files, completed/pending checks, blocker and next action in the temporary worklog.
Do not create another plan or treat compaction as permission to widen the task.
At completion, update existing architecture prose in place: current contracts only,
no slice diary, test counts, review chronology or victory narrative. Delete obsolete
prose. Keep the ledger completion short and evidence linked; code changelog only
for implementation. Report behaviour, removals/cost, limits and final gates separately.
Reset your own worklog and STOP. No next slice or commit without approval.
```

### Evidence, Tooling And Performance

The 38 cases and paired matrices are sufficient to begin this work without another
broad characterisation campaign. They are not a complete implementation design or
a repair-size estimate. Resolve a specific causal or integration gap when the
selected unit needs it; do not repeat the whole investigation.

The test-impact check for each slice includes relevant retained probe capabilities:
preflight, identity/geometry capture, readiness, reload and request gates. There is
no standing full-probe inventory or automatic general cleanup; L41 is a specifically
bounded pilot. Extract only demonstrated shared needs. Do not promote probes wholesale:
private mutations, raw-source evaluation, broad TEST matrices and synthetic device
state remain diagnostics unless a named contract justifies a stable smaller
interface. Keep the probes as comparison evidence through any migration; later
consolidation/deletion needs its own scope and surviving-test assessment.

Read canonical jank and perceived-performance results before proposing budgets or
new measurements. Functional success is not performance equivalence. Suggest a
new campaign only for a precise regression question existing evidence cannot
answer; execution still requires the normal operator authorization. Physical
Safari/touch, unbounded timing, production-build incidence and performance remain
separate limits, becoming gates only where the selected change requires them.

Preserve case IDs, evidence and limits when recording answers. The operator answers
and bounded unit scopes above do not authorize wider product changes, live-system
work or a new campaign. Update timeless guides with adopted decisions, not planning
history. The Leave Alone safeguards below continue to apply unless the approved
unit explicitly justifies a bounded change to a protected mechanism.

## Leave Alone

Preserve generation counters, owned suppression releases, prepend/evict
compensation, column alignment, the tier decision from `total`, seek estimation,
kupuaKey and the two-frame density restore unless a named bug requires a bounded
change. Completed ownership repairs grant no wider ownership rewrite.
B2 requires revalidation before any new repair scope;
B10 targets Effect 8's reset classification, not prepend compensation.

## Open Items

Kinds: **Delete**, **Comment**, **Bug**, **Decision**, **Characterise**,
**Consolidate**, **Refactor**, **Move**, **Doc**.

Only unresolved tasks appear here. Rows do not grant implementation permission.
Completed bugs/units remain in Current Status and
their evidence records, not in this backlog.

| # | Kind | Claim | Disproof check | Depends |
|---|---|---|---|---|
| L9 | Refactor | Remaining layout anchor decisions may share policy after the relevant Q1 choices; adopted search/history/detail decisions are already consolidated within their boundaries | Identify an actual remaining duplicated decision and prove policy/invariant independence; retain off-screen selection, true-edge and geometry contracts unless explicitly revised | L15; L42 checkpoint |
| L10 | Refactor | Layout captures may reuse placement values where that removes real duplication; one universal capture type/pair is not a predetermined outcome | Preserve header, global/local coordinates, capture timing and semantic versus compensating scroll in composed density/reflow/history controls | L9; explicit scoped proposal |
| L12 | Delete | After L8-L11, some reset-to-home suppressions (`suppressNextRestore`, `suppressReturnFromDetail`, `suppressDensityFocusSave`, dedup preset) may no longer be needed | Disable each alone in a throwaway change; run reset-to-home unit and e2e from grid, table and detail | L8, L11 |
| L14 | Move | `search-store.ts` mixes position logic with aggregations, sort distributions and the new-images poll; moving those out lets a session read the position core alone | Pure move; all tests unchanged | |
| L15 | Decision | C15-C21 expose loaded/off-screen/selection layout differences; desired placement awaits Q1, not a blanket D8 rule | Record operator answers for density, column reflow and height-only resize separately from focus retention; retain B4/B7 evidence limits | Q1 |
| L16 | Doc | Remaining L7 documentation conflicts include history selection survival and layout anchor rules; L8 reconciled ordinary first-page publication in guide 03 | After operator decisions, reconcile the remaining claims against L7 source/test evidence in a separately scoped timeless-guide update | Q1-Q7 |
| L18 | Bug | C15/C18: recorded row-top density preservation displaces image centres when row height changes. The correction depends on Q1; finite drift is not proof of guaranteed convergence or unbounded drift. Row-centre preservation is a proposal, not an approved correction | Decide the placement policy, then reuse density controls for repeated switches and usable-viewport geometry; explicitly account for affected focused-image expectations | L15 |
| L19 | Decision | Why the buffer tier (total up to `SCROLL_MODE_THRESHOLD`) exists separately from two-tier; it adds the background fill and top-up machinery | Separate audit; check what would break if two-tier covered small results | |
| L21 | Characterise | B2's original late-clear witness predates subsequent cancellation/identity guards; current reproduction or verified closure is not established | Replay the exact deferred missing-target sequence with newer focus, retaining the original deletion-clear control. Close if the defect is covered/resolved; do not invent another repair from stale prose | C12/B2; B17 ownership changes |
| L22 | Bug | B3: long-press range self-cancels only when it needs asynchronous data | Repeat paired resident/out-of-buffer production dispatcher and hook checks; both must select the same range while retaining deliberate external cancellation | C33/B3 |
| L23 | Bug | B4: saved density restore applies old placement after a newer focus click; no-saved fallback is latent and lacks all input ownership | Preserve saved-wheel controls; add newer-focus assertion; remove the unreachable fallback or give it equivalent ownership if a caller is introduced | C21/B4 |
| L25 | Bug | B7: density treats seek's temporary local buffer bottom as a real end, changing preservation outcome by coordinate regime | Preserve natural TEST and equal-size/map-absent controls; distinguish source snap from legitimate true-result destination clamp | C18/B7 |
| L31 | Decision | Q7: table horizontal scroll is preserved by sort/filter/panel changes but reset by density round-trip. Disposition: defer until a density-continuity unit; likely preference is preservation, not yet a shipped rule | Decide restore prior column versus deliberate reset for that unit; assert table -> grid -> table in both focus policies without changing existing sort/filter/panel behaviour | Q7; paired horizontal probe |
| L34 | Bug | B15: immediate reload before selection debounce loses committed tick | Flush pending persistence on pagehide or make write ownership synchronous enough; preserve delayed control and no cross-tab promise | C29/B15 |
| L36 | Characterise | B8 full local E2E logged a React ImageTable render-time update warning; 307 tests passed. Its origin, baseline incidence and behavioural consequence are unknown; no B8 regression is claimed | Capture the React stack in a bounded local reproduction and compare baseline incidence before proposing a fix; drop if expected/library-induced or no relevant defect is established | B8 completion evidence; separate operator scope |
| L44 | Characterise | Optional expansion of MockDataSource nullable-field capabilities; eight unsupported new composed drafts deleted rather than left failing or quarantined | Independently verify dateTaken tuple extraction, nested Credit missing-field filtering, full sort order and reverse pages before adding composition coverage; no product defect is established | [Optional nullable mock coverage](#optional-nullable-mock-coverage-l44); unselected, not an L43 gate |
| L45 | Refactor | Proposed density-restoration replacement, including B4/B7, should reduce competing paths and localise policy/geometry | Stage A must identify actual removable machinery and retained proof; reject a wrapper-only design. Stage B requires approval | [Two-stage brief](#density-restoration-replacement-l45); proposed, not executing |
| B20 | Characterise | Operator reports disappearing new-images badge after reload; no cause or agent reproduction established | Only if selected: compare normal reload with the intended badge lifecycle before defining a repair | [User report](#b20); uninvestigated, separate from L45 |
