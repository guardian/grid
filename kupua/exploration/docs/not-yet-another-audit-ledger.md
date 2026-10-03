# Core Logic Cleanup Ledger

Working deliverable for characterising Kupua's position behaviour, recording
operator decisions and actionable bugs, and tracking later cleanup. Follow the
[session prompt](not-yet-another-audit-prompt.md). The
[focus and position architecture guide](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md)
is a contract source, not a destination for this investigation's tables or bugs.

Open Items rules: delete resolved or refuted task rows (code-change history belongs
in the changelog). New tasks need a claim, a check that could disprove it, and a
kind. Claims remain hypotheses until checked. These rules do not cap the
characterisation cases or require deleting their evidence and operator decisions
when a task closes.

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
| [C10](#c10) Re-sort AI results, then leave AI | Re-sort is immediate and can preserve focus/selection position. Without a target it goes to top but can retain hidden stored focus, unlike ordinary sorting. Leaving AI with no stored focus resets to top; a hidden last-viewed focus can still influence exit. | Source-established; re-sort/exit observed from all tier/view source cells in both modes/transports | Remembered detail image wins, even off-screen. With no remembered image, desired AI exit preserves browsed centre; that improvement is deferred. | Q3 answered; no-bookmark improvement L39 |

### Browsing And Layout

| Case / situation | What happens now | Confidence | Choice if needed | Operator decision |
|---|---|---|---|---|
| [C11](#c11) Seek or scroll away from focused A | Focus remains A even after its image leaves the loaded content. Selection remains. Some drags scroll immediately; large-result seeking moves content on release and may land approximately. No Back step is added. | Source-established; observed through paired seek/lifetime matrices | No decision needed: seeking must not silently replace focus. | Established |
| [C12](#c12) Press arrows/Page keys after seeking away, then choose newer focus | Visible-focus mode returns to the bookmark and applies the key movement. Selection/click-to-open uses scrolling instead. A delayed failed snap-back can clear newer focus chosen while it waited. | Observed in controlled store test for late clear; other paths inferred | No decision needed: obsolete work must not clear a newer choice. | B2 |
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
| [C25](#c25) Reload while detail is open, traverse, then swipe-dismiss or close | Cached image position can rebuild surrounding results. Swipe background preparation and final close compare against different entry identities after reload; returning to the original image can cause unnecessary pre-centring. Missing cache can leave standalone detail without traversal. | Source-established; canceled/completed synthetic dismiss reproduced displacement in grid/table with ordinary Backspace controls | Original/last-viewed return requirements are settled. Competing entry identities are a bug, not a new design choice. | B12/L11 |
| [C35](#c35) Traverse in detail, reload, then close quickly | In every paired tier/view sample, closing before the underlying list was ready left the last image visible but not centred. In explicit mode it also left the ring/focus on another image. Waiting for that list restored the expected centre and identity. Original-image return without traversal kept its prior placement. | Observed identically by transport in both focus modes: early and settled grid/table cases in all three tiers | No new choice needed for the established traversed-return target. Do not replace the early-close case with a wait and claim the problem is solved. | B9 |
| [C26](#c26) Tick images, clear selection, then act again | Clear alone does not scroll or create focus. Older focus can reappear and again influence later arrows, sort or layout. Removing the current selection anchor elects a remaining selected image. | Source-established; stationary Clear/focus eligibility observed across paired matrices | No decision needed: reveal retained focus without moving solely because of Clear. | Established |
| [C27](#c27) Back/Forward between different searches with distinct focus, or none | A matching destination snapshot normally restores its anchor and whether it was focus or inferred position. It does not separately save both focus and viewport. Phantom same-anchor focus is intentionally omitted; AI sort history instead leaks newer focus into an originally unfocused entry. | Source-established; same-anchor mode controls and AI sort-history none/focus controls observed | Which viewport to restore when an entry's focus was off-screen? The entry's own explicit focus/none must survive either answer. Revised D2 does not authorize carrying departing focus into history. | Q1 history placement open; B14 |
| [C28](#c28) Toggle density, change focus, then Back | Back changes density but carries the later focus into the destination, including a destination that originally had none. Forward changes density again, not an independent focus restore. | Observed locally for focused and unfocused destinations | Three separate choices: does toggling add a Back step; does Back restore density; should current density persist? Losing destination focus is not one of those choices. | Q2 open; B1 is a bug |
| [C29](#c29) Reload the list or share its URL | Reload uses this tab's current-entry snapshot and selected IDs when storage is available. Density is in the URL. A shared/new-session URL does not carry viewport, focus or selection. A reload before the 250 ms selection persistence write loses a just-ticked selection. | Source-established; selected reload and immediate/delayed persistence controls observed; shared/new-session limit inferred | URL density and Back-step policy are separate. No universal cross-tab position promise exists. | Q2 URL dimension; B15 |
| [C30](#c30) Back/reload without a usable snapshot, or after its image disappears | Missing snapshot normally gives first page/no focus. A missing saved phantom image currently adopts a visible neighbour from the departing context, even when that lands near the opposite result end. | Observed with controlled matching-key snapshot and same-membership sort entries | Do not silently substitute departing context. Historical missing-target fallback is top/no focus. | B13 |
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
2. **Q2: Density history deferred.** Density currently adds history entries. The
  operator probably prefers otherwise, but retains current behaviour until a named
  density/history unit decides and implements the change. Push, destination density,
  persistence and URL reload/share semantics remain distinct, revisable choices.
3. **Q3: Remembered detail image accepted; no-bookmark AI exit has a desired improvement.**
  In Click-to-Open, the last image returned from detail takes precedence over the
  browsed centre for ordinary query/filter changes and AI exit, even after scrolling
  it off-screen, if it survives. Example: open A, close detail, scroll to B, change a
  filter that retains A -> follow A. With no remembered detail image, the desired
  AI-exit target is the current browsed centre; today's top reset is a follow-up,
  not a prerequisite or bundled repair. Existing ordinary no-selection phantom-sort
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

Application/test baseline: `1e81eb50027f9a129da9bca1990b5b8bb7550a53`.
Startup had unstaged edits to this ledger, its prompt, AGENTS and guide 02, plus
an unrelated nginx template. Those were preserved; application source was clean.
Temporary tests were removed and `git diff --numstat -- kupua/src kupua/e2e`
was empty afterward. The initial pass used no live systems. The separately
authorised browser follow-up below used TEST read-only. No product/configuration/
dependency change, Git mutation or performance campaign was performed.

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
| Density / sort captures | Density stores global index, row-top ratio and source DOM extrema across unmount; sort stores a ratio independently of identity. Grid capture stores virtualizer index and ratio. These payloads are not interchangeable. |
| History / cursor cache | History stores one anchor plus `anchorIsPhantom`, offset, ratio and freeze boundary under an entry key. The image cache stores per-image cursor/offset under a search key. Neither is a complete independent focus-and-viewport snapshot. |

Sources: [focus setter and snap-back](../../src/stores/search-store.ts#L2056),
[selection mutations](../../src/stores/selection-store.ts#L355),
[DOM election](../../src/hooks/useDataWindow.ts#L144),
[geometry election](../../src/lib/viewport-anchor-geometry.ts#L18),
[placement consumer](../../src/hooks/useScrollEffects.ts#L746),
[snapshot producer](../../src/lib/build-history-snapshot.ts#L35),
[image cache](../../src/lib/image-offset-cache.ts#L191).

Data publication is not final geometry. Effects 4/5 compensate buffer movement;
6 consumes seek targets; 7b resets with fresh publication; 8 handles deep-to-zero;
9 applies search/history placement and can retain a small-result fill retry.
Density's two frames mean measured geometry is available, not that every later
action has been invalidated. Native preview exit also waits on resize quiescence.
These are distinct lifetimes with useful responsibilities, not proof that a new
coordinator would remove them. See [shared effects](../../src/hooks/useScrollEffects.ts#L398).

### Case Traces

<a id="c01"></a>
**C01: Query with focus.** [URL producer](../../src/hooks/useUrlSearchSync.ts#L327)
chooses stored focus for non-sort user navigation; [Effect 7](../../src/hooks/useScrollEffects.ts#L589)
captures its row-top ratio. [Search](../../src/stores/search-store.ts#L2084)
captures neighbours and keeps old data while [resolution](../../src/stores/search-store.ts#L1476)
locates an out-of-page target; final publication uses Effect 9, with full-row and
DOM-range clamping. First-page success avoids lookup. New search aborts old lookup;
ordinary focus/scroll is not a universal lookup cancellation. [Existing test](../../e2e/local/focus-preservation.spec.ts#L55)
asserts retained ID and buffer membership, not signed placement or every intermediate frame.

<a id="c02"></a>
**C02: Query without focus.** Same pipeline with `phantomOnly` and a fresh
[viewport election](../../src/hooks/useDataWindow.ts#L144). It clears stored focus,
positions through the one-shot ID and may pulse. [Existing assertion](../../e2e/local/focus-preservation.spec.ts#L357)
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
**C04: Selection then query.** [Selection clear](../../src/hooks/useUrlSearchSync.ts#L216)
runs before producer choice; non-sort capture likewise ignores selection.
Older focus is consequently reused. [Selection Clear](../../src/stores/selection-store.ts#L509)
does not clear it. Guide 02 section 6 says later transitions regain ordinary focus
semantics, whereas archive T25 prescribes surviving visible neighbourhood for the
combined query action. The 3 October operator answer accepts following retained
focus for both explicit Clear and the combined query/filter action. A pending
range cancels on query change.

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
Guide 03 section 3's first-page-then-target flash is stale: current search withholds
the first page while resolving an out-of-page target.

<a id="c07"></a>
**C07: Sort relaxation.** [URL sync](../../src/hooks/useUrlSearchSync.ts#L337)
omits viewport inference on sort-only change and mode-gates stored focus.
No-target ordinary search publishes first page and `_scrollReset`, clearing focus.
[Existing assertion](../../e2e/local/focus-preservation.spec.ts#L411) checks new order,
offset zero and null focus. It does not assert every screen frame. Archive D02/D06
and current guide 02 section 4 agree on the current no-focus sort relaxation.

<a id="c08"></a>
**C08: Selection sort (pre-repair trace).** [Producer](../../src/hooks/useUrlSearchSync.ts#L329)
and [ratio capture](../../src/hooks/useScrollEffects.ts#L632) both choose active
selection first. Ordinary successful publication preserves a *different* older
focus through `retainExplicitFocus`. The [options branch](../../src/hooks/useUrlSearchSync.ts#L390)
sets that flag only when target differs from stored focus; equality yields
`phantomOnly: true` without retention, and [search start](../../src/stores/search-store.ts#L2135)
clears it. This is source proof of a guide 05 section 4 violation, not a new
selection policy. Failure paths can also clear older focus; they need distinct
failed-read assertions. AI in-memory sort uses a different publication branch.

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
**C10: AI re-sort/exit.** [URL fast path](../../src/hooks/useUrlSearchSync.ts#L375)
calls [resortAiBuffer](../../src/stores/search-store.ts#L4044), not `search()`.
It does not clear focus on its no-target reset. AI exit suppresses viewport
inference but tests stored focus, not conscious-mode provenance. The original guide
02 called top-on-exit a relaxation; archive D09 demanded preservation and its later
Phase 3A deferred the change for cost. Q3 now accepts remembered-detail precedence
and records no-bookmark centre preservation as an undelivered follow-up. A sort-only history
move within AI also uses this fast path, so ordinary-history null-focus assertions
cannot certify it. In all paired Click-to-Open source cells, opening/closing one AI result created a
hidden bookmark; relevance re-sort retained it loaded but offscreen while the list
stayed at top. Disabling AI then carried that bookmark into the ordinary query.
Grid placed it visibly at +255.5 px in every tier; table placed it at +403 px,
outside the usable viewport, in every tier. The old ordinary bookmark remained
cleared. This historical runtime result does not certify the later policy decision
or implement its no-bookmark improvement.

<a id="c11"></a>
**C11: Seek.** [Scrubber](../../src/components/Scrubber.tsx#L225) uses native
scroll for fully resident or indexed data; otherwise it seeks on click/release.
[Data-window](../../src/hooks/useDataWindow.ts#L366) debounces distant indexed
scroll for 200 ms with hook/search ownership. [Store seek](../../src/stores/search-store.ts#L2886)
aborts prior range work but not find-focus work. Shallow/map/end reads target
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
controlled late-empty response proves the post-await generation-only cleanup can
erase a newer focus. Search ownership is not focus ownership. Successful old
lookup after a newer focus is a related unprobed continuation, not separately reproduced.

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
snapshot; close does `history.back()`. [Return hook](../../src/hooks/useReturnFromDetail.ts#L83)
records entry identity, suppresses Home return, writes closing identity and centres
only if different from entry. In explicit mode intentional null focus suppresses
return. Native placement means no write, not proof the underlying list never
moved while hidden. Prior [bounded observation](bug-reproduction-evidence.md#restarted-app-browser-follow-up)
measured original close at 0 px drift; it is not exhaustive reload evidence.

<a id="c23"></a>
**C23: Detail traversal/return.** [Traversal](../../src/hooks/useImageTraversal.ts#L235)
uses global indices; adjacent loaded target navigates immediately, otherwise
owned pending navigation waits on buffer change. Context/history/current-image
change cancels pending navigation, not necessarily the shared read. [Detail
callback](../../src/components/ImageDetail.tsx#L296) caches target cursor and replaces
URL without updating focus on every step; return writes the last viewed identity.
The return frame checks search, entry and focus, re-resolves current index and
uses current table/header geometry. Failed extension can leave no usable neighbour;
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
snapshot; detail separately [restores cached cursor](../../src/components/ImageDetail.tsx#L219)
once per image. [Cursor restore](../../src/stores/search-store.ts#L3920) checks
current target tuple/rank, publishes retained-total coordinates, and falls back
to approximate seek when cursor/read fails. Missing target becomes standalone.
The persistent `_detailEntryImageId` and [mount-only detail ref](../../src/components/ImageDetail.tsx#L102)
are different authorities. Paired phantom probes entered off-centre A, traversed
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
0 and ratio null. Otherwise it captures viewport identity as phantom. [Restore](../../src/hooks/useUrlSearchSync.ts#L255)
strict-matches destination search key, restores anchor through search and ratchets
freeze boundary to the later saved/current boundary. This is not immutable historical
membership. Phantom departure capture skips replacement while viewport identity is
unchanged, even if focus changed. [Repeated-history test](../../e2e/local/browser-history.spec.ts#L1987)
proves a no-focus destination stays unfocused through two cycles in its setup;
it does not cover changing focus while keeping the same centre identity, or AI
sort-only restore. Paired same-anchor and AI-sort controls now delimit B14; they do
not imply that all ordinary history fails.

<a id="c28"></a>
**C28: Display-only history (L20/B1).** [Density toggle](../../src/components/StatusBar.tsx#L109)
pushes and captures a predecessor snapshot. [URL dedup](../../src/hooks/useUrlSearchSync.ts#L153)
consumes the flag and refreshes entry identity, then returns before snapshot
restore. Density save therefore reads departing current focus and feeds it to
the destination view. The two local browser probes used actual focus clicks,
waited for destination grid and changed density-restore generation, and failed
the original-focus equality check both for A and null destinations. Existing
[density-history control](../../e2e/local/browser-history.spec.ts#L1101) passed
because it asserts view type only. D8's independent per-entry focus requirement
is explicit; no density-history product choice excuses this mismatch.

<a id="c29"></a>
**C29: Reload/storage.** [Startup/pagehide](../../src/main.tsx#L36) sets manual
browser restoration, synthesizes the entry key and captures current snapshot.
[Storage](../../src/lib/history-snapshot.ts#L118) is per-tab, 50-entry capped,
quiet on unavailable storage/invalid JSON; JSON shape is not validated. Density
is excluded from the search fingerprint but remains URL state. Selection persists
IDs/anchor with a 250 ms debounce and no pagehide flush in its store; B15's
immediate/delayed controls establish that pre-debounce reload loses the tick.
No cross-tab or stronger persistence protocol is proposed.

<a id="c30"></a>
**C30: History failure.** Missing/mismatched/null-anchor snapshot calls normal
no-target search. A phantom matching snapshot instead passes current
`getVisibleImageIds()` from the departing view; a missing target can therefore
select a departing-context survivor through ordinary resolver fallback. Archive
D10/T16 specifies top when the historical anchor genuinely disappears. This is a
code/contract conflict proved by B13, not evidence that destination focus
is always replaced or that new neighbour persistence is needed.

<a id="c31"></a>
**C31: Logo.** [Reset](../../src/lib/reset-to-home.ts#L46) clears focus/selection,
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

<a id="c32"></a>
**C32: New-image refresh.** [Badge handler](../../src/components/StatusBar.tsx#L177)
calls reset orchestration, selection clear and unanchored search, with no push.
Polling only updates counts and does not reorder the visible buffer. Refresh
advances the freeze boundary; Back uses its monotonic ratchet, not an immutable
old upload set. At offset zero reset orchestration eagerly scrolls old content;
deep data waits for atomic zero-offset publication. B16 establishes the stale
first-page intermediate presentation, not permission to redesign final top/reset.

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
**C35: Early versus settled detail reload/close.** Both focus-mode matrices
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
**C36: Ordinary prepend reaches offset zero.** The paired probes used production
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
repair or stronger persistence guarantee follows from the characterisation.

Source explanation to verify at the actual close boundary: [return handling](../../src/hooks/useReturnFromDetail.ts#L161)
does not queue centring when the target index is absent; a pending phantom
[search publication](../../src/stores/search-store.ts#L1907) can clear the stored
last-viewed ID and apply its earlier snapshot placement. [Display-only URL dedup](../../src/hooks/useUrlSearchSync.ts#L153)
does not start a new search generation on close. The observed availability
dependence is retained; no new request/placement coordinator is proposed.

### Bugs And Qualified Suspicions

These records are linked to cases, not a second backlog. No repairs were made.

<a id="b1"></a>
**B1 / C28 / L20: Destination focus lost across density history.** Established-contract
violation (D8; guide 02 section 2). Expected A or none from the destination; actual
later B. Reproduce grid A/none -> toggle table -> focus B -> Back. Two local Chromium
checks failed after density completion, with ElasticsearchDataSource and 10,000
fixture results (indexed). Cause demonstrated: display-only dedup skips snapshot
restore. Existing density control checks only density. Missing assertions: destination
focus including null, Forward after departure changes, then reload, across equivalent
buffer/seek setups. Confidence high for observed scope, not all sequences.

<a id="b2"></a>
**B2 / C12: Old snap-back failure clears newer focus.** Current focus ownership
violation. Reproduce with real store/MockDataSource(10,000): focus fixture rank 50,
seek 5,000, defer snap-back ID lookup, focus a currently loaded image, resolve old
lookup empty. Expected newer focus retained; actual null. The missing-target
cleanup checks only unchanged `sortAroundFocusGeneration`, not current identity
or request ownership. Existing [snap-back tests](../../src/stores/search-store.test.ts#L2465)
assert deletion clears the original focus, not that it preserves a successor.
Confidence high in controlled store execution; trusted-key/click browser sequence
and late-success variant are not newly certified.

<a id="b3"></a>
**B3 / C33: Long-press range cancels itself when a read is needed.** Established
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
**B4 / C21: Density restore can overwrite newer intent.** Two bounded defects share
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
**B5 / C03 / former L6: Hidden last-viewed focus becomes a later anchor.** Historical
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
**B6 / C08: Sorting a selection whose anchor equals old focus clears focus.**
Pre-repair source-established breach of guide 05's "focusedImageId is unchanged" rule.
Focus A -> tick A -> ordinary sort produces `phantomOnly` with retention false;
search clears focus before results arrive. Distinct focus/anchor is the useful
control. Cause is the producer's inequality condition, not the geometry consumer.
No fresh runtime reproduction was performed. A composed URL-producer test should
assert focus A before/after sort and Clear, while selection/anchor stay unchanged;
ordinary success, failure and AI re-sort must not be assumed equivalent.

The ordinary-path repair is implemented locally with failing-first composed proof;
see the implementation and final acceptance records below. Failure and AI policies
are unchanged. L24 is closed after independent review repairs and final local gates.

<a id="b7"></a>
**B7 / C18: Temporary buffer-bottom snapping changes policy by tier.**
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
**B8 / C34: Density cancels a current search; adapters produce different failure
symptoms.** First seen during combined query/density navigation; one stable-view
refresh returned the missing 13,210 results. A pass-through datasource trace then
recorded a non-aborted initial request receiving a density-origin abort and resolving
zero hits, followed by total zero/no error. Original method/own-property shape and
listeners were restored. A separate uninstrumented actual-UI witness started at
13,210: click sort direction, confirm loading/new search started, click density;
the table settled at zero/no error. Expected same non-empty membership under the
new order/view, not fabricated absence. After the operator switched to TEST
media-api, source hashes still matched and ApiDataSource was verified. The same
actual sort-then-density sequence began from 13,210 results/no focus/no selection.
Throughout a five-second watch it retained total 13,210/200 loaded, `loading=true`,
no error, and started generation 3 versus settled 2. It remained in that state
before cleanup; Home recovered normally. The watch does not prove infinite loading.
Both focus-mode interruption passes reproduced the same API symptom from a stored
bookmark: after five visible seconds total/loaded data and that bookmark remained,
the destination was table, and lifecycle stayed started 32/settled 31 with
`loading=true`; Home again recovered. Phantom had no ring; explicit retained one.
This confirms focus mode does not avoid B8; the API abort event itself was still not directly instrumented.
Current Vite/development Strict Mode client; production-build incidence remains
unverified. This required client ownership/adapter-contract investigation, not a
new anchor decision or backend-specific preservation behaviour. No fix was made
during the characterisation.

**2 October 2026: Bounded B8 repair delivered.** Actual HEAD matched the recorded
baseline; prior documentation edits and both retained probes were preserved.
The maintained composed regression first failed in all eight density cases
(direct empty publication, API stale buffer), while all eight equally delayed
no-density controls and 18 original geometry/input tests passed. Saved state was
produced by real unmount and consumed through Strict Mode remount: an
`abortExtends()` spy and the queued two-frame chain proved the saved branch ran.

[`search()`](../../src/stores/search-store.ts#L2087) now captures a dedicated
`_searchAbortController` for initial ordinary/AI reads. A newer search
aborts it, while also cancelling prior ranges and focus resolution. The L37
follow-up below also allows fresh keyboard-edge intent to supersede an ordinary
initial read, without giving density or viewport refill that permission. The initial
success/error guards retain generation checks and also check that captured signal.
`abortExtends()` still aborts/replaces the range controller, clears range flags
and applies the existing cooldown. Fill captures the current range signal when
it starts, not the first-page signal: density before first-page arrival cannot
poison fill, and density during fill still prevents late append/publication.
An extension-specific cancellation path was rejected because density also protects
seek/restore buffer movement; it would require rerouting those consumers rather
than separating the initial search's actual lifetime. No adapter normalization,
search restart, delay, disabled control, extra fetch or forced loading settlement
was introduced.

| Operation | Signal owner / legitimate superseder | Publication guard / busy-state owner |
|---|---|---|
| Initial ordinary / AI read | Search controller / newer `search()`; fresh keyboard edge can supersede an ordinary initial read | Captured signal + generation / accepted search completion or superseding edge; focused ordinary resolution retains its separate path |
| Extend / fill / small-result top-up | Range controller / density, seek, restore or search | Captured range signal (top-up also total/PIT generation) / existing extend flags |
| Seek / cursor restore | Range controller / newer range operation or search | Captured signal; restore also checks search generation / existing seek/restore loading semantics |
| Focus lookup and centred load | Existing find-focus controller plus timeout / newer search or timeout | Combined signal / focused publication or first-page fallback |

Retained proof: [mounted density and transport controls](../../src/hooks/useScrollEffects.test.ts#L270),
[AI range/supersession controls](../../src/stores/search-store.test.ts#L3864),
[API-mode controls](../../src/stores/search-store-api-mode.test.ts#L1152), and
[actual sort/density browser controls](../../e2e/local/buffer-corruption.spec.ts#L42).
Both density directions and focused/viewport saved setups are covered in the
mounted suite. Real direct/API adapters over mocked fetch cover zero success,
HTTP refusal, network failure and late predecessor success/empty cancellation/
rejection against pending or settled successors, without overwriting data, focus,
error or loading. Existing extend/prepend, fill/top-up, find-focus, PIT, restore,
AI, Strict Mode, two-frame geometry and newer-input controls remain required.
The former AI test that treated `abortExtends()` as search cancellation was
explicitly revised to require owned completion; genuine newer-query cancellation
still asserts an aborted signal and unchanged successor publication. Optional AI
absence/enrichment handling was not redesigned.

**Verification and limits:** unsandboxed Node 22.12.0 on macOS: focused 470/470;
full unit 2235/2235 across 82 files; TypeScript/Vite build passed (bundle-size
advisory); full local Chromium E2E 307/307 including forced-seek. Eight B8 browser
cases use actual controls, request-start/hold/release gates, exact IDs/order,
cursors, total/buffer, no empty publication and owned lifecycle settlement, in
both desktop focus modes and density directions. Their no-focus starting corpus
is natural local indexed data; API cases inject the real `ApiDataSource` and map
local ES reads through a stand-in transport. This is not live media-api/Scala
certification or zero-ES-construction proof. Mounted tests also cover old seek
geometry and new small-result publication; the full gates retain other tiers.
At local closure, no live check, production-bundle race check, physical-device
check or performance campaign had run; the direct continuation below extends only
the named live client paths. Historical five-second/API-abort qualifications stand;
browser cancellation never proves server work stopped. L26 is removed because
its client scope and required gates are resolved. Q1-Q7 and other bugs remain open.

**2 October 2026: Operator-authorized live direct continuation.** The shared
fine-pointer desktop tab reported `ElasticsearchDataSource`, non-local ES and a
visible document. Served raw hashes for search-store, useScrollEffects and the ES
adapter matched the workspace; the running search action also contained the
dedicated controller. This verifies the client, not the proxy's backend stage or
server binary. The pinned Dublin corpus had 13,205 matches during this pass; the
original 13,210 witnesses above remain historical, not immutable count assertions.

Eight gated cases used the actual sort/density buttons: grid/table in both
directions, explicit/phantom mode, and no focus versus a real clicked bookmark
(phantom bookmark established by opening and closing detail). A ninth equally
gated no-density control passed. The pass-through datasource gate held an
unchanged successful response before store publication, not a replacement page
or proof that server work remained pending. Every density case executed the saved
branch (`abortExtends()` twice under development Strict Mode), while the captured
search signal remained non-aborted with no abort event. Release published the
requested query/order, coherent total/buffer, exact membership/cursors and owned
lifecycle completion, without empty publication. Explicit bookmarks survived and
were loaded in the final centred window; ordinary phantom sort retained its
existing clear-and-top relaxation. First-page membership was compared with the
held real response; out-of-first-page focused landings used bounded target/cursor
reads to verify the actual ordered suffix and authoritative cursors. No image IDs,
tuples, response bodies, credentials or signed URLs were written to project files.

Four further unwrapped natural-timing cases passed (both directions/modes,
no-focus): loading/new generation was observed between the actual button clicks,
then the settled buffer matched a fresh bounded read in the requested order.
One real Home supersession control also passed: Home aborted the predecessor
signal, settled before old release, and late successful completion changed none
of its membership, params, total, focus, error or loading. These are bounded
correctness checks, not a timing campaign or a whole-tier/device certification.

An initial table bookmark setup timed out because its full row centre was outside
the viewport; that driver sample is not counted. Visible thumbnail hit-testing
fixed setup without a product change, and the complete nine-case gated rerun
passed. All sampled experiment outcomes were visible. Cleanup removed wrappers,
listeners, held work and page-only identity/aggregate probes, and left Home/default
grid with no loading/error/focus/selection. The page subsequently became hidden;
`bringToFront()` did not itself restore visibility, so foreground must be checked
again before the next pass. At the end of this direct pass, the operator's live
media-api switch/check was still pending; the continuation below is separate.
No production-bundle, physical-device or performance evidence follows.

**2 October 2026: Operator-authorized live media-api continuation.** After the
operator-controlled switch, the same shared tab independently reported visible
fine-pointer `ApiDataSource`, no residual probe and the current running search
action. Served raw hashes for search-store, useScrollEffects, ApiDataSource and
the API request adapter exactly matched the workspace. No fixture datasource,
response substitution, server lifecycle/configuration change or test runner was
used in this pass; requests went through the app's real API datasource. These
checks do not identify the backend stage/binary or certify infrastructure ingress.

The same nine gated cases passed: eight grid/table density cases across both
directions, both desktop focus modes and clicked-bookmark/no-focus setups, plus
the no-density control. Each saved-density path cancelled ranges twice while
the current search signal remained non-aborted with zero abort events. After
release, exact membership, authoritative cursors, requested query/order,
total/buffer/positions, expected focus state and owned lifecycle settlement all
passed with no empty publication. The pinned corpus again had 13,205 matches;
explicit focused windows landed at offset 13,103/13,104 with 102/101 hits, matching
the bounded direct observations. Identity/cursor checks stayed in page memory;
focused API windows were checked by bounded target/cursor reads, not invalid
deep offset reads. This is independent per-transport consistency, not an immutable
cross-mode snapshot or exact pixel-placement comparison.

Four unwrapped natural-timing cases also passed, observing loading/new generation
between the real sort and density clicks and validating the final ordered buffer.
The real Home supersession control aborted the old signal, settled its successor
before old release, and late success changed no successor membership, params,
total, focus, error or loading. All sampled outcomes were visible. Cleanup restored
prototype/own-property shape and range actions, removed listeners and held work,
deleted identity/aggregate probes, and verified settled default grid with no
error/focus/selection, leaving the app in the operator-selected media-api mode.

This extends B8's live client evidence to both transports without changing the
repair or its local gate results. The response gate still holds completed real
read results before client publication; it is not proof of server cancellation
or a network-in-flight guarantee. Production-bundle incidence, unbounded timing,
other live tiers/devices and performance equivalence remain unverified. Q1-Q7,
other ledger cases and the proposed search/sort milestone are not resolved or
authorized by these passes.

**Cold review, before L37 follow-up.** The operator-requested
independent read-only reviewer found one medium-severity ownership issue; the
coordinator then confirmed it in a bounded live API control. The
[End producer](../../src/hooks/useListNavigation.ts) was reachable while
loading and started a seek without advancing search generation. Seek then replaced
the range controller, not the initial search signal. The initial publication guard
therefore accepted late first-page data after the newer End seek, replaced the tail
with page one and emitted a top reset.

Controlled sequence: no-focus ordinary sort with its counted first adapter read
paused before executing, real End key, complete the independent End seek, then
release the unchanged original adapter read. On live ApiDataSource, End reached
offset 13,008 with 197 hits through the true 13,205-result tail; late initial
completion replaced it with offset 0 / 200 hits and scrollTop 0. Search generation
stayed 32 and the initial signal remained non-aborted. The DEV lifecycle counter
had already reported settled while the initial read was still held: its
[loading-derived subscriber](../../src/stores/search-store.ts#L4354) is not an
independent proof that this initial work completed. All sampled states were
visible. This is a controlled client-delay reproduction, not a network timing
measurement or a claim about server cancellation. Probe cleanup and Home/default
grid were verified afterward; no product fix or new test was applied during review.

Read-only HEAD comparison confirmed that the old initial request captured the
range signal, which End's seek aborted; API cancellation propagated rather than
publishing the first page. The split newly permits this API overlap. Direct had a
different pre-existing empty-on-abort publication defect, so the whole transport-
independent problem is not described as new. Baseline attribution is source-backed,
not a replay of the old live client. The tests at review time covered true newer-
search generation supersession but not a newer same-generation End producer;
their green results and passing density witnesses did not disprove L37.

The reviewer supported the bounded repair/revisable-policy direction, but the
related range/search overlap held acceptance until the operator approved a bounded
follow-up. That approval did not authorize a universal epoch, disabled controls,
server changes, a Q1-Q7 freeze or the structural slice.

**L37 follow-up resolved (2 October 2026).** The existing captured keyboard-edge
record now identifies explicit navigation before its seek has a signal. Only that
fresh edge can abort an obsolete ordinary initial read; density-only cancellation,
automatic viewport refill and finite AI ownership do not acquire that permission.
The captured-signal guard rejects late success, empty cancellation or rejection
without changing the newer End tail, placement, focus, error or loading. Search
generation, seek geometry/alignment, focus policy and the public seek API stay intact.

An identity-owned pending initial signal records whether the edge invalidated the
resident page. That fact travels with the pending edge, so Home after unfinished
End fetches the current-order first page instead of presenting the previous order
as successful completion. Valid resident Home shortcuts retain their original
no-fetch path. There is no restarted search, timer delay, extra fetch on ordinary
valid shortcuts or general navigation coordinator.

Maintained proof: [real mounted producers and adapters](../../src/hooks/useListNavigation.test.ts#L217)
and [actual sort/End browser controls](../../e2e/local/buffer-corruption.spec.ts#L189).
Six direct/API late-read cases failed first while all 33 original navigation
controls passed, then went green. A real automatic-refill control rejected an
overbroad generic-seek abort, and two opposite-edge controls rejected stale
resident reuse using genuinely different credit orders. The final 42-test mounted
suite preserves every old assertion. The bounded implementation, not either
discarded approach, passed affected controls 562/562, full unit 2244/2244 across
82 files, TypeScript/Vite build and full local Chromium E2E 311/311 including
forced-seek. Focused browser B8+L37 was 12/12; four new local cases cover grid/table
and both desktop focus modes, retaining exact tail/cursors/positions and scroll
after late unchanged first-page success. All held work is released and wrappers
removed in cleanup.

L37 is removed from Open Items after these gates. The earlier live API reproduction
remains historical evidence: no new live API pass was run after this follow-up,
and no production-bundle, physical-device or performance claim follows. The live
app was stopped by the operator for local E2E; the agent did not change its lifecycle.
This closes the named initial-read/keyboard-edge overlap, not every possible
same-generation range or late focus-resolution composition. Q1-Q7 and other ledger
items remain open; search/sort continuity still requires its own operator scope.

**Separate outcomes:** behaviour repaired: density cannot cancel the current
search in these verified paths, and the L37 newer-End tail survives obsolete
initial completion. Structure simplified: search/range lifetimes are separated,
with explicit captured keyboard-edge permission and valid resident-page reuse.
Initial search and range
movement no longer share a cancellation owner; existing focus, range and geometry
machinery stays intact. Search/sort continuity is ready for the next operator
scope/policy decision, not started or authorized here.

Canonical 12 September paired jank/perceived records and the 29 September
local-api matched-home control already measure normal sort/density and broad
browsing. Suggested operator-only checks are P4a/P4b/P6 for frame timing and
PP2-PP4/PP6 for ordinary sort/density latency against comparable records. They
cannot certify this held-request composition or performance equivalence; a
composition timing check needs its own owned boundary and approval, not another
full core campaign. The full E2E run also emitted an un-attributed ImageTable
render-time update warning; L36 records a bounded characterization, not a B8 gate.

<a id="b9"></a>
**B9 / C35: Closing reloaded traversed detail before list readiness misses
centring.** Expected last-viewed image at the established traversed-return centre;
actual paired grid outcomes were +79.5/-115.5/+47.5 px and table outcomes were
+32/+34/+17 px across buffer/indexed/seek.
Minimal sequence: enter A, traverse to adjacent B, reload, close once detail
identity is ready but before the underlying list is ready. Keep the settled-list
variant as a control, not a substitute. Six settled tier/view controls centred
correctly; all six early variants did not. Original-image/no-traversal reload
kept its placement in both variants. A changed stored hidden ID is recorded
separately from the visible placement failure; this is not approval to make hidden
focus a durable product bookmark. Confidence: observed with identical geometry
in direct and API;
exact handler-time availability and late-publication causality need a composed
trace. Existing KUP-018
certification explicitly excludes broader data-availability composition. No repair.

The paired Click-to-Focus passes reproduced the same six offsets in both transports.
They also showed that every early traversed return left the returned image unfocused while
one focus ring remained elsewhere; settled controls focused/ringed the returned
image correctly. This is part of the same availability-dependent return failure,
not a separate placement policy or a new durable-focus requirement.

<a id="b10"></a>
**B10 / C36: Ordinary prepend-to-zero is reset as Home and loses the viewport
anchor.** Expected compensated backward browsing to keep the elected visible image
in view when its final page reaches global offset zero. Actual paired seek outcomes
made the stable held anchor non-visible in both table (+15 px signed-centre change)
and grid (-47.5 px), while hidden focus remained. Minimal sequence: seek near global
600, browse forward until one real eviction, then browse backward through gated
prepends until the final positive offset publishes zero. Earlier prepends in the
same runs are controls. Confidence: observed identically in both views and
transports with production store/scroll code and real wheel motion. Source owner:
Effect 8's unconditional non-self-correcting positive-to-zero reset. No repair.

<a id="b11"></a>
**B11 / C31 / L13: Cancelled deep Home strands the scrubber thumb at top.**
Expected Back's restored deep entry to show a deep logical and rendered thumb.
Paired browser sequences restored deep logical positions (about 431k direct / 429k
API), but thumb CSS/rendered top remained 0 before and after the
held stale Home response was released. Minimal sequence: deep A, push/deep B, hold
Home's successful first-page response, Back to A, release stale Home. Search/history
ownership correctly preserved A; only the thumb-reset generation remained waiting
for a near-zero position that will never arrive. Confidence high for seek table in
both transports; focus mode is irrelevant because Home clears it. No repair.

<a id="b12"></a>
**B12 / C25 / L11: Reloaded swipe pre-scroll uses remount identity and survives
cancel/final return.** Expected a canceled dismiss to leave the hidden list where
it was, and returning to historical entry A to match ordinary Backspace. Actual
paired phantom sequences A -> B -> reload B -> A -> cancel dismiss moved background
-168.5 px grid / -353 px table; completed dismiss retained the displacement.
Matched ordinary Backspace controls were 0 px and visible. Cause: gesture start
compares A with mount-time B, while final return compares A with historical A.
Confidence high for synthetic Chromium grid/table in both transports; coarse mode is necessarily
phantom, and physical Safari animation is not claimed. No repair.

<a id="b13"></a>
**B13 / C30: Missing phantom history target adopts a departing-context neighbour.**
Expected archived history fallback: top/no focus when destination anchor genuinely
disappears. A controlled matching-key snapshot used a missing phantom ID while
departing sort B exposed same-membership visible neighbours. Back to default sort A
restored no focus but adopted B's tracked neighbour, visible near A's opposite end
(`bufferOffset` about 1,221,456; non-top). This proves the source/contract conflict;
the snapshot fixture changed only browser-memory storage. Reproduced equivalently
in both transports. No repair.

<a id="b14"></a>
**B14 / C27: AI sort history leaks newer focus into an originally unfocused entry.**
AI entry A and re-sort entry B both began unfocused. After adding focus only in B,
Back to A retained that same focus in explicit and phantom modes; explicit A showed
no ring despite stored focus, while Forward to B showed the ring. Phantom retained
the hidden focus both ways. Expected A's entry-specific none state. Reproduced in
both modes and transports. Cause scope is
the AI in-memory sort/history fast path, distinct from density-history B1. No repair.

<a id="b15"></a>
**B15 / C29: Immediate reload loses a just-ticked selection before persistence
debounce.** Synchronous tick produced store membership while sessionStorage still
lacked the ID; immediate reload restored zero selections. A matched control waited
for the debounced storage write and restored one selected ID. Expected per-tab reload
survival once the user action commits; pagehide currently does not flush the pending
selection write. Client-only, transport-independent evidence. No repair.

<a id="b16"></a>
**B16 / C32: First-page new-images refresh exposes stale top content before fresh
publication.** A real refresh badge click from `bufferOffset=0`, `scrollTop=2000`
immediately set scrollTop 0 while a successful first-page response was held. For
the full 600 ms watch, the previously viewed image moved offscreen and the old
buffer's first image was visible with `loading=true`; release then published fresh
top data. A deep seek control held its exact viewed identity/geometry until release,
then moved to fresh top. Expected the first-page path to defer visible movement like
the deep atomic path, avoiding stale old-top presentation. The badge count was a
client-only fixture; search/control/response were real and read-only. Reproduced
pixel-identically in direct and media-api. No repair.

<a id="c37"></a>
<a id="b17"></a>
**B17 / C37 / L38: Density abandons pending browsing intent and can strand loading.**

**3 October 2026, before/after attribution.** Inspected HEAD `30b5acaeb` and parent
`1e81eb500`. HEAD protects initial ordinary/AI search from density's range abort;
its L37 follow-up permits fresh keyboard edges to supersede an ordinary initial
read and prevents stale resident Home reuse. Neither changes density capture,
`abortExtends()`, seek's aborted completion, or indexed view-owned debounce. Those
paths already exist in the parent. This is a surviving defect, not evidence that
HEAD newly introduced this particular seek/density failure. The old binary was
not replayed. B8/L37's verified repairs remain useful but do not prove this composition.

**Cause, source-established:**

- [Scrubber seek](../../src/components/Scrubber.tsx#L582) supplies a destination;
  [seek](../../src/stores/search-store.ts#L2896) retains it in its async invocation,
  sets shared `loading=true`, and uses the same range controller as maintenance.
  The scrubber's separate pending position protects its thumb, not navigation ownership.
- [Density unmount](../../src/hooks/useScrollEffects.ts#L1096) captures resident
  focus or a rendered viewport image, still from departure while a distant seek
  waits. [Mount](../../src/hooks/useScrollEffects.ts#L939) calls `abortExtends()`
  and restores that capture. [abortExtends](../../src/stores/search-store.ts#L2706)
  also cancels seeks/restores but only clears extension flags, not `loading`.
- [Seek publication](../../src/stores/search-store.ts#L3639) rejects aborted work;
  its [catch/finally](../../src/stores/search-store.ts#L3900) assumes a successor
  seek/search owns loading. Density supplies no such successor. The
  [table indicator](../../src/components/ImageTable.tsx#L1555) directly reflects
  the stranded flag; it is not an independently stuck toast timer.
- Indexed scrubber input [changes scrollTop](../../src/components/Scrubber.tsx#L590)
  instead of directly seeking. [useDataWindow](../../src/hooks/useDataWindow.ts#L402)
  schedules a 200 ms refill owned by the reporting view; [unmount](../../src/hooks/useDataWindow.ts#L308)
  cancels it. With skeletons and no focus, DOM anchor election supplies no image to
  preserve. Protecting already-started direct seeks alone cannot repair this path.
- Merely sparing the request also leaves competing positioning: the
  [density callback](../../src/hooks/useScrollEffects.ts#L953) checks search
  generation/input/saved-record identity, not navigation ownership, while
  [seek placement](../../src/hooks/useScrollEffects.ts#L495) is separately
  generation-driven. Their publication/remount/frame ordering needs composed proof.

**Observed, bounded live checks:** the operator authorized read-only operation of
the shared HTTPS media-api tab. Preflight found visible fine-pointer explicit mode,
no focus/selection, `ApiDataSource`, and the running dedicated search controller.
Served raw SHA-256 matched local search-store, scroll effects, data-window and
Scrubber sources. Backend stage/binary was not independently verified.

| Case | Observation |
|---|---|
| Large-result grid -> table, natural timing | Of 1,329,454 matches, click track around two-thirds then switch while `loading=true`. Across a four-second watch, the exact departure array remained at offset 0 / 200 hits, seek generation stayed 0, density completed, and Loading more remained visible with no error. No response gate or wrapper. |
| Large-result table seek, no density | A different track position completed at offset 545,651 / 300 hits, seek generation 1, `loading=false`, no indicator/error. A successful successor recovers the stranded state. |
| Large-result table -> grid, passive tracing | From that deep buffer, seek around four-fifths and switch while loading. The estimate request's initially live signal received a density-origin abort; the original method resolved and seek exited. Across four seconds the exact departure array/offset remained, seek generation stayed 1, and loading stayed true. Original methods/data were passed through unchanged. |
| Indexed grid -> table before dispatch | In the pinned Dublin corpus (13,205 matches), a real track click moved grid scrollTop to 716,440 with no rendered anchor and loading still false. Immediate density change returned table to top; no seek committed in 3.5 seconds. This is pre-request destination loss, not an observed in-flight abort. |
| Indexed table seek, no density | Another track click completed at offset 5,295 / 200 hits with seek generation 2 and loading false. |

One attempted no-density control clicked the thumb still parked at the abandoned
destination and initiated no new seek; its timeout is excluded. No credentials,
image IDs, cursors, payloads or signed URLs were retained. Passive wrappers and
listeners were removed, prototype method shape restored, and the page-only probe
deleted after real Home returned to settled default grid/no focus/selection/error.
These samples do not prove infinite duration, exact seek accuracy, all focus or
selection modes, live direct-ES parity, production timing or performance equivalence.

**Why existing tests missed it.** [B8's mounted composition](../../src/hooks/useScrollEffects.test.ts#L414)
holds `search()`, not a destination seek. [L37](../../src/hooks/useListNavigation.test.ts#L254)
holds the initial read across End, not density across End. Its
[abort control](../../src/hooks/useListNavigation.test.ts#L448) checks focus and
pending-intent cleanup but omits loading settlement. The
[rapid-density E2E](../../e2e/local/scrubber.spec.ts#L1024) seeks before toggling;
the [helper](../../e2e/shared/helpers.ts#L534) attempts seek settlement first.
No maintained composed assertion inspected here owns destination, publication,
placement and busy state across this pending-seek/density sequence. Existing
tests were read, not rerun; no product/test changes or new automated tests were made.

**Approved unit: pending browse destination across density. Delivered within the scope below.**

| Brief | Proposed boundary |
|---|---|
| Disposition | Operator-approved bounded navigation-continuity unit delivered for directly observed core browsing breakage. Return to the proposed search/sort milestone for its next scope decision, not the next bug in the list. |
| Contract | Latest destination survives density, including the indexed pre-request window; arrival uses the current density. Newer navigation/search may supersede it. Preserve focus/selection semantics separately. No demand for more exact percentile seeks, Q1 anchor-policy decision or new density/history policy. |
| Mechanism | Retain a search-scoped pending browsing destination outside view/request lifetime, with operation identity, destination, phase and separately captured focus permission. Record explicit scrubber/indexed browsing intent before debounce; do not infer it from loading, trace labels or keyboard-focus payload. Keep necessary search/focus-resolution lifetimes distinct. |
| Cancellation | Separate obsolete layout-maintenance work from navigation. Density cancels/suppresses old-view extends/fill/refill without abandoning a current destination. New navigation/search invalidates old destination/publication/placement. A timer may be replaced without losing its semantic target. Do not make all generic seek calls uncancellable. |
| Publication and placement | Retain existing cursor/estimation/column-alignment and atomic-buffer behavior. A pending destination takes precedence over departure density capture; accepted placement survives remount and consumes current geometry once. Check completion before, between and after density frames, including completion before the new view subscribes. Prevent late departure restoration, not just request cancellation. |
| Busy state | Start, success, absence/failure and cancellation in this slice must have explicit completion ownership. A canceled operation with no replacement settles its own busy state; stale cleanup cannot settle a newer operation. Do not unconditionally clear loading on density or in finally. |
| Structural result | Replace broad density-triggered range cancellation and destination ownership inferred from keyboard-focus payload/view-local timer. Focus permission remains payload, not navigation authority. Adopted consumers must use the new owner, not leave two competing navigation/placement paths beneath a wrapper. |
| Preserved controls | B8 search/AI publication, L37 newer End/current-order Home, no-fetch valid resident shortcuts, automatic-refill non-supersession, newer seek/search/Back/Home ownership, selected/phantom focus policy, cursor restore/detail traversal, Strict Mode, cooldowns and prepend/evict geometry. Reuse existing suites and do not weaken their assertions. |
| Proof | Failing-first delayed destination tests plus pre-debounce indexed tests; both density directions, repeat toggles, both coordinate regimes/map states and adapters, focus/selection controls, late success/abort/failure and superseding navigation. Assert destination identity where exact, accepted region where estimated, placement/thumbnail and scrubber consistency, positions/cursors, and loading settlement independently. No-density controls and request counts must rule out restart/extra-fetch repairs. |
| Gates and stop | After approval: focused regressions, full unit, build and full local E2E with normal port coordination; bounded shared-tab replay. No performance claim from these checks. Stop for approval if this needs a new anchor/history/detail policy, larger ownership redesign or added backend work. No universal epoch, persistence, server changes, new exact-rank requirement, blanket density disabling or timeout workaround. |

Coverage here is a targeted follow-up, not a repeat of the original full L7 read:
complete seek and density/seek-placement paths, complete data-window owner,
scrubber producers, URL dedup/search dispatch, reset/keyboard/traversal consumers,
relevant tests, parent diff and the recorded B8/L37 evidence. The independent
read-only coverage challenge agreed on the missing composition and warned against
treating every indexed refill as either user navigation or disposable maintenance.
Other original audit cases and performance results remain prior evidence, not
newly certified by this investigation.

**3 October 2026: Initial bounded repair checkpoint.** The cold-review follow-up below
supersedes this checkpoint's discovery/AI claims and validation counts. The operator approved the unit after
the investigation, requiring TDD, tier/transport/click-mode coverage and coordination
before E2E/live mode switches. No commit, branch, server-code or configuration change
was made. The implementation remains uncommitted on baseline `30b5acaeb`.

[`search-store`](../../src/stores/search-store.ts) now separates browsing from range
maintenance. `_browseNavigation` owns a search-scoped destination through queued,
loading and ready phases. Indexed [`Scrubber`](../../src/components/Scrubber.tsx)
records intent before native scrolling; input-derived distant ranges use the same
store queue through [`useDataWindow`](../../src/hooks/useDataWindow.ts). Layout-only
refills retain their view-owned timer and cannot supersede a user destination or
initial search. Density cancels maintenance, not the destination. Initial-search
supersession belongs to navigation rather than the keyboard focus-permission payload;
valid resident Home reuse and finite AI ownership remain distinct.

[`useScrollEffects`](../../src/hooks/useScrollEffects.ts) defers owned ready placement
until the current view is measured, including completion while unmounted, between
frames and across repeated switches. It cannot restore departure over pending
navigation. Invalid saved anchors do not permanently close readiness; Strict Mode
cannot prematurely consume that state. Deferred viewport notification is independent
of ready-state consumption. Cancellation and completion settle only the relevant busy
owner; a refill cannot clear a pending search's loading. Newer cursor restore/snap-back
cancel obsolete browsing, and cancelled/identity-superseded snap-back cannot clear focus.
Snap-back retains its prior cooldown behavior rather than acquiring density's cooldown.

**Maintained red-to-green proof:** all 16 initial real-adapter density cases failed
on cancellation before implementation. Subsequent discriminators failed for queued
wheel loss, late initial publication after scrubber navigation, and refill busy-state
ownership. Independent review produced seven reproduced failures covering cursor/focus
supersession, cancelled focus clearing, invalid-anchor readiness and deferred notification;
all were repaired with their assertions retained. The first full unit pass found two
accidental cooldown regressions and a PIT test conflating maintenance with explicit
navigation. The cooldown was restored; the PIT assertion is retained under explicit
refill purpose, with a separate newer-navigation control. No production policy was
changed to accommodate a test.

The mounted adapter matrix now includes 192 combinations of direct/API, indexed/seek
coordinates, both density directions/click modes, bookmark/none/selection and four
arrival orderings. Sixteen further cases use deep estimation or a ready position map;
resident controls retain exact row-clamped geometry without fetching. The shared
[browser regression](../../e2e/shared/browse-density.ts) covers 24 actual-UI cases across
normal indexed and forced-seek projects, including the pre-debounce window. The local
API fixture uses the real ApiDataSource parser over local ES-backed response shapes,
not a live Scala service or proof of zero ES construction. Its initial img-only setup
failed on No thumbnail fixtures and was corrected to click visible cells; those setup
failures are not product evidence. The operator interrupted that run, then approved rerun.

| Completed gate | Result / boundary |
|---|---|
| Full unit | 2,477/2,477 across 82 files; final rerun also green |
| TypeScript/Vite | Passed; existing bundle-size advisory. Final comment-only source updates produced the same production JS bundle hash |
| Focused browser | B17/B8/L37: 36/36, retries disabled |
| Full local E2E | 335/335 in 4.6 min, retries disabled, including nine forced-seek cases. Existing router/aborted-map and ImageTable render-time warnings remain qualified; L36 is not closed |
| Live media-api | 12 controlled overlaps plus four unwrapped natural-timing cases passed |
| Live direct ES | Same 12 controlled overlaps plus four unwrapped natural-timing cases passed after operator-controlled TEST switch |

**Live boundaries:** both passes used the shared visible fine-pointer desktop tab,
independently verified datasource and matching served raw hashes for store, scroll
effects, data window and Scrubber. Each controlled set covered deep estimated and
map-ready indexed navigation in both click modes/directions, then indexed pre-dispatch
without a bookmark. Indexed targets were beyond 10,000 and the exact map identity was
visible. Real clicks established explicit or last-viewed bookmarks; those survived.
Signal, buffer positions, destination visibility and settled loading/indicator were
checked independently. The four unwrapped cases per transport observed loading before
density and completed near the requested region with no focus or stuck notice.

Pinned totals were about 1.22 million and 13,205; default-search natural checks used
about 1.329 million. Counts/ranks differed slightly by time/transport, not immutable
snapshot or exact cross-transport pixel evidence. Controlled holds delayed unchanged
completed responses before client publication; they do not prove server cancellation.
Nonempty-selection and resident-tier coverage is maintained/local, not a new live matrix.
All wrappers/held work/probes were removed, with real Home cleanup; the shared app was
left in direct ES, explicit mode, default grid, no focus/selection/loading/error. Only
comments and documentation changed after those functional gates.

**Separate outcomes:** behavior repaired: pending destination and busy completion
survive density. Structure clarified: browsing, view maintenance, search and focus
resolution have explicit distinct owners; focus permission no longer grants navigation
authority, and view disposal no longer discards queued user intent. Existing buffer
estimation, column alignment, compensation, cooldowns and two-frame geometry remain.
L38 is removed from Open Items. Other audit cases were not generally reassessed; Q1-Q7
and the separately scoped search/sort milestone are not resolved by this delivery.

**Performance follow-up, not an executed gate:** the recorded 2 October B8 jank and
short/long perceived runs already supply a media-api baseline (with revision/cache
comparability qualifications). They cannot measure B17's new queue/placement ownership.
Recommend the prescribed jank/perceived reruns to check density/seek visual settlement,
indexed-scroll frame cost and request counts against comparable existing records. No
new campaign ran, and no speed-up, production-build race, physical-device or unbounded
timing certification is inferred from functional passes.

**3 October 2026: Cold-review follow-up delivered, uncommitted.** The operator approved
all three findings, including the pre-existing wheel producer gap. All belong to this
navigation ownership boundary; none was deferred into a different cleanup project.

- **Membership discovery:** the previous takeover aborted the ordinary initial read
  while reusing its predecessor's total. Twelve failing adapter cases narrowed to zero
  or 100 results or widened to 25,000. Navigation now retires only initial placement
  and reuses the already-requested count, falling back to the counted page when needed.
  It resolves End/clamping against current membership and publishes total/window together.
- **Finite AI:** queued browsing could publish ordinary results after AI completed.
  Guards now cover queued/direct seeks, refill, extensions, cursor restore and focus
  snap-back while AI owns the query. Twenty-eight controls cover prior indexed/seek
  totals and both completion orders without an ordinary page request.
- **Wheel producer:** the Scrubber is a sibling of the list, so forwarding scroll did
  not reach the list's input listener. The bridge now records indexed intent first,
  using current total/regime props; non-indexed and zoom classification remain unchanged.

Further independent challenges and failing-first controls exposed retired initial
placement reviving after a successor, old totals/missing-target buffers in cursor/focus
replacements, a generic deep-to-zero reset overriding End, cancelled pre-dispatch work
stranding discovery, and cursor takeover retaining obsolete focus busy status. These
were repaired within the same handoff. The query-scoped discovery records retirement
and its current replacement; cancellation/failure can finish the existing first page
only without a newer owner. Successful fallback clears the failed replacement's error.
Both discovery requests failing retain the existing error behavior and settle loading,
not fabricated empty membership. Accepted freeze/map/poll work is not duplicated.

Current evidence: **2,557/2,557 unit tests across 82 files**, TypeScript/Vite build passed,
and **351/351 full local E2E in 4.8 min with retries disabled**, including nine forced-seek
cases. The navigation slice has 99 controls. Sixteen added browser cases cover actual
wheel/density wiring in direct/API-adapter fixtures and rendered narrowing/AI membership
in local memory fixtures, across both click modes/views. The AI fixture initially lacked
required relevance scores; fixing that contract did not change production assertions.
Existing router, aborted-read and ImageTable render-time warnings remain; L36 is not closed.

No new live-service replay or performance campaign accompanied this follow-up. The
32 earlier direct/media-api live checks above remain evidence for their earlier code
checkpoint, not proof of these new overlap paths. Local adapter tests are not a live
Scala certificate. Broader search/sort continuity, Q1-Q7 and other ledger bugs stay outside
this repair; no general coordinator, backend work or stronger seek exactness was added.

<a id="c38"></a>
<a id="b18"></a>
**B18 / C38: Pending seek/density presentation. Resolved.**

**Current contract:** the pending thumb stays at the destination, while content
preserves the departure neighbourhood until arrival. Final arrival alone is not
sufficient. Focus and selection remain independent. Settled density, history and
seek-accuracy policy are unchanged; no next implementation unit is selected.

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

**Separate outcomes:** behaviour repaired is stable pending thumb/content across
density. Structure simplified is removal of Scrubber's independent arrival inference
from position/total/loading changes; its existing browse owner now controls pending
presentation too. The density bridge is reused with explicit ownership. There is no
new coordinator, request, restart, timer workaround or disabled control.

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

| Gate | Current result |
|---|---|
| Full unit | 2,586/2,586 across 82 files |
| TypeScript/Vite build | Passed; existing bundle-size advisory |
| Focused browser | 10/10, retries disabled |
| Full local E2E | 354/354, retries disabled, including 11 forced-seek cases |
| Shared media-api browser | Both held density directions, repeated switches, no-density control and both unwrapped natural-timing directions passed |

**Live limits:** served source hashes matched the checkout; all counted samples were
foreground. Held checks delayed unchanged completed API reads before publication,
not server work. Each held seek published once; destination visibility, positions,
total and loading were checked separately. Natural overlaps also retained departure
visibility and destination thumb position. This live pass used the natural seek tier
without focus/selection; other modes/tiers and direct ES have maintained local coverage,
not a new live certificate. Wrappers, listeners and probes were removed and settled
Home verified before the operator stopped the app for E2E. No identities or payloads
were retained. Physical devices, production-build races and performance equivalence
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

### TEST Browser Follow-Up: 1 October

The operator explicitly authorised TEST read-only and identified `--use-TEST`
direct mode. Browser preflight independently found `ElasticsearchDataSource`,
`IS_LOCAL_ES=false`, visible page, explicit mode, no selection/detail, and runtime
thresholds 1,000/65,000. Served raw-source SHA-256 matched workspace for
useScrollEffects, ImageGrid and useDataWindow. Viewport was 1130x886; panels began
closed. The agent made no server, source, response or threshold changes; the
operator later switched transport for the separately recorded API comparison.

Natural corpora, all with nonFree and an upload-time cap of 4 March 2026: the
existing keyword corpus returned 820, Dublin 13,210, and the broad corpus
1,221,842 then 1,221,837. A date cap does not freeze later metadata/deletions;
counts are observations, not permanent fixtures. Indexed checks had the map ready.
Small-result data was fully loaded; the other tiers retained normal windows.

Tracked identities stayed only in browser memory. Measurements used actual DOM
rectangles and usable centre (excluding table header), not nth rendered cells.
Positive signed centre is below the usable centre. Density writes were awaited
through the existing restore generation, then observed for 2.5 seconds per step.
These are bounded post-acknowledgement watches, not proof of no intermediate paint
or no future movement. Most watches had no sampled change; the seek reflow-close
watch had two raw state changes during extension, with restored final relative
geometry. No full per-frame trace was retained for that exception.

| Witness | Observed result | Interpretation |
|---|---|---|
| W1: loaded off-screen focus, grid -> table, all three tiers | Source focus -1734.5 px/off-screen; viewed anchor +83.5 px. Every destination: focus -367 px/fully visible; previous viewed image +209 px. Focus retained. | Matched loaded conditions agree exactly. Earlier wording implying that residency dependence alone proves different tier algorithms was too broad. |
| W2: same focus after real scrubber eviction, indexed and seek | Focus remained stored but unloaded/off-screen. Tracked viewed image remained fully visible: indexed +40.5 -> -111.5 px; seek +84 -> -68.5 px. | Eviction changes which image supplies continuity, within a tier too. This is a residency-dependent choice, not an intentional tier policy. |
| W3: loaded off-screen selection plus older hidden focus, all three tiers | Details opening held selected image at -1431.5 px; focus moved -1734.5 -> -2037.5; previously viewed image +83.5 -> +689.5 and off-screen. Closing restored final geometry. Density then put focus -367 px, selection -239 px, prior viewed image +209 px. | Reflow and density use different anchors, but each observed transition agreed across tiers. Preserving an off-screen selection ratio can displace visible content substantially; it is not evidence of preserving visible centre. |
| W4: loaded focus near temporary window bottom, indexed versus seek | Indexed followed focus; seek snapped to window bottom and left focus off-screen, despite both being far from true result end. | Genuine tier-dependent outcome: B7. |
| W5: evicted selection, two grid/table round-trips, with older absent focus and then no focus | Membership/focus state retained. Indexed original anchor -52.5 -> -203 table -> -463.5 grid (partly clipped), then repeated. No-focus run re-elected a different initial anchor at +142.5 and round-tripped there. Seek began at temporary DOM bottom and alternated -51.5 grid/+239 table in both focus setups. | Finite displacement and repeatability in these samples only. Starting anchors/boundaries differ, so neither clearing focus as a cure nor a matched cross-tier drift difference is established. |
| W6: current search plus density | Direct: density-origin abort traced; ordinary sort-then-density UI reproduced 13,210 -> 0, no error. API: same real controls retained 13,210/200 loaded and remained loading/unsettled through the five-second watch. | B8 has observed transport-dependent symptoms. The shared client/adapters disagree on cancellation handling, not intended preservation policy. |

Query setup used the existing navigation helper without combining density changes,
after the initial combined-navigation anomaly. Some source scroll positions were
set deliberately to 2000/3600 px for matched geometry; focus, tickboxes, Details,
density, sort direction and distant scrubber actions used actual controls. An
indexed selection setup that unexpectedly returned to scroll zero was excluded;
the corrected setup asserted actual scroll position before electing images.
This is not a claim that every setup step was a trusted user gesture.

The cancelled-read trace temporarily wrapped the real datasource method without
changing arguments/results; it recorded only flags/counts and restored original
own-property shape/listeners in `finally`. The later UI cancellation witness had
no wrapper. Cleanup returned Home/default grid, cleared focus/selection, verified
no loading or own DOM markers, and deleted the page-only probe. Forty-seven
aggregate records were collected; no image IDs, raw responses or signed media
URLs were written to project files.

**Matched media-api continuation:** the operator switched services and explicitly
confirmed readiness; the agent did not change server lifecycle/configuration.
Reload verified ApiDataSource, non-local flag, explicit mode, visible page and
the same three source hashes. Query setup stayed in grid. Actual sort click was
followed by an observed loading/new-search state before the density click. No
wrapper, response substitution or tier override was used in this API check.
Only state changes were sampled over five seconds, not performance. Cleanup used
Home and verified default grid, no loading/focus/selection/probe/markers. The app
was left in the operator-selected API mode.

**Transport conclusion at this stage:** the anchor/geometry choosers studied are shared client
code, not direct/API policy branches. Nevertheless B8 has different observed
symptoms: cancelled work becomes empty results in direct mode, while API mode
retains the list and does not settle loading during the bounded watch. Source
tracing identifies the shared cancellation owner and different adapter abort
contracts; only the direct abort event was instrumented. This is a client
ownership/contract defect, not permission for transport-specific preservation
rules. The three-tier geometry comparisons had not yet been rerun in API mode at
this stage. The later paired matrices below supersede that coverage limit and
establish broad parity; VS Code Escape hijacking is environmental. No repair is authorised
by these findings.

### Coverage And Checks

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

Current assertion reads: full mounted density tests and snapshot-builder tests;
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

The initial automated tests ran through prescribed root-level npm scripts,
foreground `pipefail` and `tee`, unsandboxed as required; no active test was polled
or interrupted. The operator confirmed ports 3000/3030 free; runner-owned setup
started local Docker ES. Those suites did not target a real cluster. The later
authorised read-only TEST browser work is recorded separately above. No runtime
identity, email, credential or signed URL is retained in this ledger.

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

**P1 API witness:** effective phantom mode was selected through Settings, with
ApiDataSource/non-local flag and visible 1130x886 fine-pointer browser confirmed.
The natural corpora returned 820 / 13,207 / 1,221,812. Each of the six tier/view
cells used real keys/clicks, tracked identities in memory, waited for matching
detail identity/media decode and used 2.6-second post-return/layout watches.
Arrow/Page keys scrolled without creating focus; Enter/F did not open detail or
preview. Single-click opened the correct decoded image. Original Backspace return
had 0 px signed-centre change and unchanged scroll. Two next/one previous followed
by the Back button centred the last image at 0 px, fully visible. No ring appeared;
stored last-viewed focus did remain. Return watches had no sampled changes.

After real scrolling away, ArrowDown still scrolled without changing that hidden
focus, and Enter/F remained inactive. Density then brought the loaded hidden image
back in all six cells: grid->table at -367 px, table->grid at -255.5 px. The image
being browsed moved from +47.5 to +273 px in grid->table; in table->grid it left the
rendered viewport. These are mode-specific browser witnesses for C03/C16/B5,
not evidence that the later query/filter path or the remaining matrix is complete.

**P2 API witness:** all six cells used real tick/body/Shift-range clicks, Clear,
sort controls, the Anytime preset, and native CQL typing/Clear. Three-image ranges
did not create focus, open detail or show a ring; Clear was stationary. With a
different hidden bookmark, selected sort kept the selected target visible and
retained that bookmark. Clear followed by ordinary sort reset to top and cleared
hidden focus. Broadening the date filter after detail return and scroll-away
instead brought hidden focus back: the viewed image moved +80.5 -> +1562.5 px in
grid and -15 -> +529 px in table, across all three source tiers. Empty-query input
produced empty results/no focus/no selection/no error; Clear recovered the list.
Both buffered cells were repeated with full fill completion awaited: target centre
stayed constant (-134.5 px grid; +33 px table) through first watch and completed fill.
One seek setup was discarded because the diagnostic initially compared only query
text, not the complete search scope; its corrected production-fingerprint rerun passed.

**P3 settled API witness:** all six tier/view cells completed non-top search
Back/Forward, selected-list reload, original-detail reload/close and traversed-detail
reload/close. Source ranks were approximately 379/378 in buffer, 6088/6086 indexed,
and 565450/565500 seek (grid/table). Back/Forward and list reload restored tracked
identity at 0 px difference with no focus/ring; the persisted selected ID survived.
With the list settled before closing detail, original placement was exact and the
traversed image centred at 0 px, visible, with stored last-viewed ID and no ring.
In every sampled settled cell, detail first became ready while its parent list
was loading and did not yet contain that target. The paired early outcomes in all
six tier/view cells are C35/B9 above.

**P5 API edge witness:** each of six tier/view cells exercised End then Home in
three states: no stored focus, hidden focus after detail return, and selection
hiding that focus. The true last and first images became fully visible. Fresh
state did not gain focus; existing hidden focus and selected membership survived;
no ring appeared. A seek-grid selected-state watch was discarded when the tab
became hidden; that exact pair was repeated visibly and completed. These checks
were later complemented by ordinary forward eviction/backward prepend and
temporary-edge tests below.

The ordinary lifetime follow-up covered both views in every natural tier. Buffer
held the complete result set at offset zero, so it had no temporary data edge.
Indexed mode used its global scroll range: real out-and-back wheel motion grew the
loaded window without a forward-eviction generation, while the hidden bookmark,
selection and zero-ring state survived. Seek mode held one successful real cursor
response at each buffer-local edge. Both held windows stayed unchanged for 600 ms
and were not true result edges. Releasing forward preserved the boundary anchor at
0 px, made data progress and eventually produced a real forward eviction (99 grid,
100 table). Releasing backward produced a real prepend, preserved its boundary
anchor at 0 px, and retained the hidden bookmark, selection and zero rings. These
are delayed client-read characterisations, not server latency or performance
measurements. The low-offset forward-evict then prepend-to-zero follow-up is C36/B10.

**P4 API layout witness:** all six natural tier/view cells completed fresh,
hidden-bookmark and selection-over-hidden-bookmark states. ArrowUp scrolled while
horizontal arrows only moved the table's horizontal scroll (0 -> 150 -> 0), and
Enter/F caused no search, detail or preview in any cell. Width restoration and
Clear were stationary; height reduction changed signed vertical geometry by 118 px
without losing the viewed item. Outcomes were identical across buffer, indexed
and seek tiers but differed by view. In grid, opening the 320 px panel while an
offscreen hidden bookmark existed kept that bookmark at -1847 px and displaced
the viewed image from -29 to +880 px; dragging wider made the viewed image absent.
With selection over that bookmark, the offscreen selection stayed at -1544 px and
the viewed image moved to +577 px, then became absent. Closing restored -29 px.
The table held its viewed row at +8.5 px through panel open, drag and close in all
three states. Browser width changes also held those starting positions.

Four fresh density changes accumulated displacement in every tier: the grid
tracked image moved -29 -> -180 -> -440.5 -> -382.5 -> -1057 px and ended outside;
the table moved +8.5 -> +162 -> -162 -> -454.5 -> -364.5 px, transiently clipped
but finally fully visible. With a hidden bookmark, each density transition instead
returned that bookmark to the same view-specific positions already seen in P1
(-367/-219 px in grid destinations, -255.5/-367/-219 px across table/grid rounds),
while the previously viewed image repeatedly left the viewport. Selection remained
selected but did not outrank the older hidden bookmark during density. These are
bounded client-layout outcomes, not performance claims; paired resident
eviction/extension variants are recorded in P5.

**P6 API fullscreen/preview witness:** native fullscreen was available and all six
natural tier/view cells completed the same three desktop fine-pointer sequences.
Opening detail, pressing F, traversing right, pressing F again and using Back to
search kept detail open across fullscreen exit, used decoded media and returned the
traversed image fully visible at 0 px centre with the stored last-viewed identity and
no ring. Middle-click preview entered native fullscreen without a detail route;
pressing F returned the original image with 0 px centre delta. A second preview,
right traversal and Backspace returned the traversed image at 0 px centre, stored as
last viewed, with no detail route or ring. This does not certify physical touch,
Esc-specific macOS animation, browsers without native fullscreen, or indefinitely
late media readiness; entry watches were bounded to 800 ms after their readiness
conditions and return watches to 2.6 seconds.

**P7 API AI witness:** all six ordinary source tier/view cells used the real AI
toggle, query input, relevance direction control, detail close and disable control.
Entry produced one settled 200-result in-memory list at top, cleared the prior
ordinary hidden bookmark because it was absent, and showed no ring. Opening and
closing an AI result created a new hidden bookmark; relevance re-sort retained it
loaded but offscreen while scroll stayed at zero. Disabling AI carried that AI
bookmark into the restored ordinary query. It landed at +255.5 px and visible in
grid, but +403 px and outside the usable table viewport, identically across buffer,
indexed and seek source tiers. No request error occurred. The fixed query and live
TEST result membership make this a client-lifetime/geometry characterisation, not
ranking quality or corpus stability evidence; Q3 remains open/deferred.

**P8 API interruption witness:** four ownership/failure compositions used real app
controls and production datasource methods. First, a held successful first-page
sort was superseded by Home; Home's broad seek destination settled before release,
the old signal was aborted, and late release left tier/total/intent unchanged with
the old bookmark cleared, no error and no ring. Second, sort then density with a
hidden Click-to-Open bookmark reproduced B8 as qualified above. Third, one actual
`/api/images/search-after` response was intercepted with HTTP 500 in each view.
Both retained old indexed data and hidden bookmark, published `error=true`, showed
no ring, and recovered to no focus after interception was removed and Home used.
This is core-list failure characterisation, not an assertion about optional Grid
enrichment absence or every HTTP/network timing. Fourth, grid and table opened the
last loaded image while a real seek-edge extension response was held, pressed
ArrowRight, closed detail before release, then released. Both stayed on the origin
while pending, did not reopen or navigate stale after release, made data progress,
stored the closed origin as hidden focus and showed no ring. Existing unit ownership
coverage remains broader than these composed browser representatives.

**P9 API synthetic-touch witness:** the runner temporarily set the client coarse
capability, dispatched touch `PointerEvent`s for long-press and hook-bound
`TouchEvent`s for carousel/dismiss, then restored fine-pointer and empty selection
state. In the fully resident buffer grid, first long-press selected one image and a
second endpoint long-press selected the exact three-image resident range; neither
created focus/detail/ring, and the endpoint became selection anchor. This resident
control does not refute B3's separately reproduced asynchronous metadata/range-walk
self-cancellation. In seek grid and table, a horizontal swipe changed detail
identity; a subsequent downward dismiss returned the traversed image visible and
centred at 0 px with stored last-viewed identity/no ring. A separate original-image
downward dismiss preserved exact placement (0 px delta) in both views. These are
synthetic Chromium event/hook checks only: no physical device, iOS/Safari pointer
capture, browser chrome, orientation change, pinch conflict or real finger velocity
is certified.

**Direct paired witness:** after operator switch and reload, the page independently
reported `ElasticsearchDataSource`, phantom mode, fine pointer, 1130x886, settled
seek data and no residual detail/fullscreen/selection/focus/error. P1, P3, P4, P5,
P6 and P9 then matched API outcomes exactly across their stated cells, including
B9's six early-close offsets and B10's complete prepend steps/final anchor loss.
P2 matched every behavioral outcome; the live filter sequence elected a different
starting neighbour, so direct grid moved -62 -> +1259.5 px versus API +80.5 ->
+1562.5, and direct table +5.5 -> +497 versus API -15 -> +529. This is not a
same-identity pixel comparison; both transports pulled hidden focus back and moved
the browsed image away. P7 also matched client state and exit geometry exactly
(grid +255.5 visible, table +403 outside); ordinary scroll ranks differed because
direct Bedrock/ES and API ranking/membership are transport-specific inputs.

P8 supersession and one-shot first-page failure matched API in both views. Phantom
sort+density reproduced B8's direct symptom: after the matched action it settled at
total/loaded zero, no error, no bookmark and lifecycle 36/36, while API retained
data/bookmark and remained loading. Home recovered both. Initial direct pending-
traversal attempts from the top buffer were invalid: wheel events did not arm the
gate, one fallback awaited its own held promise, and cleanup publication invalidated
later targets. The corrected probe deep-seeked first, exposed request-called and
response-ready separately, held a real successful cursor response, and opened the
actual loaded tail before pending one more Right. Grid opened the tail directly;
table opened the last visible row and traversed one loaded successor because sticky-
header compensation left the true tail 4 px below the viewport. In both views and
focus modes, close-before-release canceled pending navigation, release progressed
data, and detail did not reopen; explicit retained one ring, phantom none. No
physical touch claim or performance equivalence follows from the paired matrix.

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

**Direct explicit witness:** F1 was tier-invariant. With no focus, arrows/Page keys
scrolled and Enter/F were inert. A single click created one ring; ArrowDown moved
focus visibly, Enter opened/returned at 0 px, F preview returned at 0 px after its
500 ms cooldown, traversal returned focused at centre, and offscreen ArrowDown
snapped back/moved focus. Density pulled loaded offscreen focus to -367 px in grid
destinations or -255.5 px in table destinations, with one ring.

F2 selection-only behavior matched phantom until sort ownership mattered. A
different explicit focus and selection both survived selected sort; selection mode
hid the ring. After Clear, ordinary sort retained/followed explicit focus with one
ring instead of phantom's clear-and-top relaxation. Broadening the date filter
followed explicit focus in every tier; an empty query cleared focus and recovery
retained explicit mode. F3 settled history/list behavior matched phantom no-focus
controls, while settled detail close focused/ringed the correct original or
traversed image at exact placement. Every early traversed cell reproduced B9's
mode-independent offsets and additionally left the returned image unfocused with a
ring elsewhere.

F4 geometry was exactly tier-invariant and matched Click-to-Open's client layout:
grid panel changes preserved offscreen focus/selection and displaced the browsed
image; table held the row; fresh density drifted; focus density pulled back. Mode
changed eligibility only: focus showed a ring and Enter/F worked; selection hid the
ring and suppressed Enter but not F; Clear restored the ring. F5 Home/End moved an
eligible explicit focus to the real first/last image, but selection suppressed that
movement and preserved the bookmark. Shared paging/edge compensation matched;
B10's prepend steps and final anchor loss were pixel-identical in both views.

F6 matched position/media outcomes with one ring. F7 exposed the clearest intended
mode contrast: AI entry cleared absent source focus, then AI re-sort followed the
new explicit focus visibly/ringed instead of leaving a hidden bookmark at top.
Exit landed that focus at +47.5 px in grid or +51 px in table in every source tier,
versus phantom +255.5/+403. F8 valid controls matched Click-to-Open, including B8's
direct empty/no-error symptom. The corrected direct pending-edge traversal completed
in grid/table for both modes with focus/ring differences only. For F9, source plus a live store check
confirmed `_pointerCoarse=true` makes effective mode `phantom`; synthetic touch
therefore belongs only to the Click-to-Open evidence and cannot be mirrored as an
explicit-mode interaction.

**Media-api explicit witness:** F1's non-preview checks matched direct exactly in
all six cells. F preview entry itself reached active native fullscreen with the
correct focused identity, but F, Backspace and programmatic native exit could not
complete while the integrated browser's deferred Playwright call owned the page;
two invalid cells required reload. The rerun explicitly skipped preview action and
completed click/ring, no-focus keys, focused arrows, Enter detail, traversal,
snap-back and density. F4 likewise skipped preview action but completed Enter
eligibility plus all panel/viewport/density geometry, matching direct exactly.
Direct explicit F1/F6 and API phantom P6 retain the valid fullscreen controls; they
are not a substitute for the missing API explicit exit cell, so F6 remains a tool
gap rather than a pass or app defect. Later separate calls sent Escape twice through
both browser and Playwright channels; document fullscreen remained active. The
operator confirmed Escape works in normal Chrome, so this is a VS Code embedded-
browser limitation rather than missing product behavior.

F2 matched direct behavior. One API seek-grid ordinary-sort/filter run elected the
adjacent grid row (-134.5 and +1562.5 px) where direct elected +168.5 and +1259.5;
no stable identity was paired, and every semantic focus/ring outcome agreed. F3
settled and early outcomes were pixel-identical across transports, including B9's
unfocused returned image/ring-elsewhere symptom. F5 edge policies, lifetime gates,
eviction/prepend and B10 steps were identical. F7 preserved the explicit mode
contrast and exact +47.5 grid/+51 table exit geometry; ordinary ranks differed with
transport-specific AI membership.

F8 supersession/failure matched direct. Explicit API sort+density reproduced B8's
stranded-loading symptom with the bookmark and one ring retained. API and corrected
direct pending traversal completed in grid/table: close-before-release
did not reopen/navigate stale, data progressed, and the origin remained focused with
one ring. The first failed-search attempt used the `api-explicit` label against an
exact `api` route check and intercepted nothing; transport classification was fixed
and both views were rerun with real one-shot 500 interception. F9 remains
inapplicable by product rule, not missing execution.

**Invalid samples and recovery:** the first seek transition setup compared only
query/AI fields, not the date/order fingerprint; it was corrected using production
canonicalization/search-key helpers and rerun. Initial reload-driver failures came
from Vite-generated `__vite__injectQuery` references lost during function serialization,
not from app reload. Raw-source execution resolved that tooling problem. A later
media-api outage returned 500 for search-after/count/mget/aggregations while the
root stayed 200; no-data/error setups were excluded. The operator recovered the
service, and fresh search/count 200 plus fully loaded data were verified before
resuming. A later lifetime validation was likewise discarded when the TEST session
broke its pipe and API reads returned 500; after operator restart, the exact indexed
scope was reloaded and verified clean before all six lifetime cells ran. None of
these invalid samples is counted as an app regression or a pass.

### Retained Tooling And Resume Boundary

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

The traces support examining duplicated *decisions*: six anchor choosers, separate
identity/ratio capture, entry identity used differently by swipe and final return,
and focus simultaneously representing bookmark and last-viewed interaction.
They do not establish that one table, one coordinator or a rewrite is best. The
new composed-range failure also warns that individually correct cancellation can
conflict with its own producer. Later proposals must account for both sides and
the assertions above. No deletion percentage, speed-up or universal exactness is
promised. Settle the relevant unresolved policy before changing anchors; Q3's
existing deferral must not become a new gate on unrelated work. Tier/transport
independence is already required. Bug fixes require their own scope.

## Decisions

- **D1 Preserve strictly, relax deliberately.** Every transition keeps the anchor
  image at the same viewport position; relaxations are explicit, per transition,
  with a named target (top, visible centre image, specific image). See 02 §1, §4.
- **D2 Click-to-Open distinguishes remembered detail identity from browsed centre.**
  For ordinary query/filter changes and AI exit, the last image returned from detail
  takes precedence over the current browsed centre, even off-screen, if it survives.
  This replaces the earlier blanket ban on hidden focus as an anchor. With no such
  remembered image, centre preservation is the desired AI-exit improvement, not yet
  delivered or bundled with the first ordinary search/sort unit. Keep the existing
  no-selection ordinary-sort clear-and-top exception and missing-target fallbacks.
  Selection clear follows Q4; layout and destination-history choices remain Q1/Q2.
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
- **D6 Policy-data hypothesis, not mechanism approval.** Answers depend on
  transition, mode, anchor type and visibility. A table-driven chooser may make
  those decisions easier to change locally (L9), but this characterisation does
  not establish that one table/coordinator is the correct implementation.
- **D7 Tiers are invisible.** Buffer, two-tier and seek tiers are implementation
  detail. Every preservation behaviour must be identical across tiers; a
  tier-dependent outcome is a bug. Characterisation (L7) covers every tier.
- **D8 Under reconsideration: position and focus.** No blanket anchor policy
  for layout changes or history is approved by this entry. A history entry's
  own focus (including no focus) and its viewport position are separate concerns:
  restoring position must not discard that focus or substitute another entry's.
  L7 must expose the cases before the operator settles their scrolling policy.
  Whether density changes should create history entries is also undecided;
  keeping density in the URL does not require pushing a new entry.

## Preliminary What Next

The delivered first-unit boundary and B6 approval are recorded below; later
expansion remains proposed, not authorized. The goal is a clearer, less brittle
continuity system whose behaviour can evolve, not a completed bug list or a
predetermined rewrite. Each delivered unit must remain useful if wider replacement
is delayed, abandoned or rolled back.

### Direction And Evidence

The code supports structural work, but does not yet establish the scope of a
replacement **Navigation and Viewport Continuity Engine**. Four problems justify
intervention:

- **Mixed meanings:** focus also carries last-viewed identity; history cannot
  independently represent the bookmark and the place being browsed (C03/C27).
- **Split decisions:** search target and placement ratio are chosen separately,
  with no identity or operation attached to the shared ratio (C01/C08).
- **Inferred intent:** a buffer reaching zero is treated as a reset, and a loaded
  DOM bottom as a result boundary (B10/B7).
- **Mismatched ownership:** long-press can cancel its own range operation (B3).
  B8's initial-search/range cancellation ownership is now separated; this bounded
  repair does not settle the remaining continuity boundaries.

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
ownership or coherent-publication assertions.** Demonstrate this in the first unit:
for the same target, substitute centre placement for captured-ratio placement in a
fixture while retaining stale-work, publication and completion assertions. A later
policy that chooses a different target may legitimately require different reads;
independence does not promise identical request counts for every policy.

### Proposed Sequence

Steps 1-4 are delivered within the first unit below. Step 5 requires a new operator
scope decision; completion does not select another bug or structural unit.

1. **Start from the current B8/L37/B17 implementation.** The B17 cold-review
  follow-up retains ordinary query discovery while retiring placement, preserves
  finite AI membership and records Scrubber-wheel intent. Keep its existing owners
  and maintained controls; do not design against the earlier shared-controller
  architecture. Local gates and earlier live-checkpoint limits remain separate.
2. **Prepare ordinary user-initiated search/filter and sort continuity, with B6.**
  Tie target identity, captured placement, focus treatment and operation ownership
  together rather than choosing identity and ratio independently. Q3/Q4 supply
  revisable policy for the adopted paths. B6 is the named approved repair; accepted
  remembered-detail precedence is not another bug to fix. AI/history paths remain
  compatibility boundaries, not additional policy redesigns. The engineer chooses
  producers, consumers and internal APIs and names the competing decisions removed.
3. **Prove integration and policy adjustability together.** Exercise capture,
  resolution, publication and placement through the existing store/hooks. Preserve
  pre-transition capture timing; merely moving Effect 7 into a passive callback
  is insufficient. Prove B6 failing-first with equal/distinct selection and focus.
  Retain missing-target, search/density, superseding navigation, discovery and AI
  controls. Substitute a same-target placement policy in a fixture without weakening
  ownership/publication assertions. Pure chooser tests cannot replace composed proof.
4. **Judge whether the adopted unit actually simplifies responsibilities.** Require
  preserved or explicitly changed contracts, fewer independent decisions, clear
  publication/placement owners and removal of replaced paths. Distinguish accepted
  policy, known defects and invariants in the tests. Performance evidence remains
  proportional to the actual change and subject to operator execution rules.
  Reject a wrapper that leaves competing decisions underneath.
5. **Choose the next responsibility from that result.** Density/reflow and history/
  return are candidates, not a fixed migration order. Cross-family compositions are
  regression controls where touched, not automatic demands to repair B1/B9 or settle
  all Q1 choices. No-bookmark AI exit (L39), density history (Q2) and horizontal
  restoration (Q7) retain their separate follow-up scopes. An engine may emerge;
  it is not a prerequisite for useful simplification.

### First Search/Sort Unit

This is the delivered boundary discussed with the operator, including the explicitly
approved B6 repair. The current state below records outcomes and limits, not wider rewrite
authorization.

| Field | Boundary |
|---|---|
| Outcome | L8 search/sort target-and-placement handoff, with B6/L24 focus retention repaired. Internal boundaries are engineering decisions, not questions for the operator. |
| Policy | Query/filter follows retained explicit or remembered detail focus if present; automatic selection Clear behaves like explicit Clear first (Q4). Without focus, ordinary query/filter uses browsed centre. Selected sort follows selection while retaining older focus, including equality. Keep ordinary no-selection phantom-sort top/reset and existing missing-target fallback. |
| Replaced responsibility | Independent target election and identity-free ratio handoff in adopted ordinary paths. Preserve capture timing and integrate with existing discovery/browse/focus owners, rather than adding a parallel coordinator. |
| Exclusions | No new density, resize, history, preview, keyboard or coarse-pointer policy; no AI-exit centre improvement in this unit; no general ownership rewrite, backend work or stronger seek exactness. Existing shared callers remain compatibility obligations. |
| Proof | B6 failing-first, focused and full applicable local gates, composed interruptions and same-target policy substitution. Existing test expectations change only for the named repair; functional success is not performance equivalence. |
| Stop | Ask if the unit needs another repair, an unresolved user-visible choice, a third preservation target beyond Q1's accepted true-edge handling, materially greater cost or a wider ownership boundary. Revisit scope rather than growing the patch silently. |

### Ordinary Search/Sort Current State

**L8 and B6/L24 are complete.** Selected sorting retains older focus even when it
equals the selection anchor. Clear remains stationary; automatic query/filter Clear
follows retained focus. Missing-target fallback and phantom no-selection sort reset
are unchanged. No next repair or structural unit is selected.

[search-continuity.ts](../../src/lib/search-continuity.ts) owns one pre-passive capture
of target, placement, focus treatment and neighbours. URL sync consumes that record;
resolution publishes its resolved identity with the coherent window and existing owner.
Placement is consumed once or retired by newer post-publication input during mount-frame
waits. Retirement does not cancel discovery, mutate focus/selection or settle another
owner's busy state. Small-result retries remain owner-checked. AI/history retain their
numeric-ratio compatibility path; direct reset, density policy, coordinates and cursors
are unchanged.

**Verification:** independent review complete; **2580/2580 unit tests across 82 files**,
**TypeScript/Vite build passed**, and **352/352 full local E2E cases with retries disabled**,
including all nine forced-seek cases. Coverage includes equal/distinct anchors in both
click modes, same-target ratio/centre substitution, missing targets, both adapters and
map states, superseding search/navigation and input across density readiness. Net test
addition: 23 unit cases and one browser case; existing assertions are retained.

**Limits:** no live-service, production-race, physical-device or performance certification.
Some invalid-index/fallback, successor and Strict Mode combinations are source-reviewed
rather than separately exercised. The bundle-size advisory and existing E2E warnings
remain; L36 is open. L39 and Q1/Q2/Q7 remain outside this unit.

**Operator-only performance follow-up:** compare P4a/P4b/P6/P9 frame cost/placement and
PP3/PP4/PP5/PP8 visual settlement against the existing 2 October post-B8 records, matching
scenario revision, cache state and topology. Use the prescribed jank/perceived runners;
this is not a further functional gate or a claim of performance equivalence.

### Preventing A Bug-Fix Detour

Maintain a structural milestone and a bounded repair lane, with one active
implementation unit. B8/L37 and B17 including its cold-review follow-up are delivered.
The ordinary search/sort milestone above, including B6, is delivered. The next unit
requires its own scope decision, not "fix the next easiest bug". A repair may interrupt an active milestone for
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
| Budget and stop | Investigation/scope limit, escalation condition, rollback and next milestone |

For a structural slice, contract checks must pass against the retained baseline
except for separately approved bug fixes or policy changes. Do not combine a
behaviour change with consolidation invisibly. A unit is complete with its bounded
change, maintained tests, required verification and owning documentation updated;
it does not wait for the hypothetical full engine. Remove replaced code only when
its responsibility is covered and the slice is adopted. Retain useful contracts
and repairs if the broader approach is rejected.

### Evidence, Tooling And Performance

The 36 cases and paired matrices are sufficient to begin this work without another
broad characterisation campaign. They are not a complete implementation design or
a repair-size estimate. Resolve a specific causal or integration gap when the
selected unit needs it; do not repeat the whole investigation.

Inspect relevant retained probe capabilities while preparing the first contract
that needs them: preflight, identity/geometry capture, readiness, reload and request
gates. There is no separate mandatory inventory or general helper-cleanup phase.
Extract only demonstrated shared needs. Do not promote the probes wholesale:
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
and bounded B6 approval above do not authorize wider product changes, live-system
work or a new campaign. Update timeless guides with adopted decisions, not planning
history. The Leave Alone safeguards below continue to apply unless the approved
unit explicitly justifies a bounded change to a protected mechanism.

## Leave Alone

Preserve generation counters, owned suppression releases, prepend/evict
compensation, column alignment, the tier decision from `total`, seek estimation,
kupuaKey and the two-frame density restore unless a named bug requires a bounded
change. B8's authorized search/range controller separation is complete and grants
no wider ownership rewrite. B2 still requires its own bounded repair scope;
B10 targets Effect 8's reset classification, not prepend compensation.

## Open Items

Kinds: **Delete**, **Comment**, **Bug**, **Decision**, **Characterise**,
**Consolidate**, **Refactor**, **Move**, **Doc**.

| # | Kind | Claim | Disproof check | Depends |
|---|---|---|---|---|
| L9 | Refactor | A shared anchor decision may replace duplicated policy while retaining necessary per-transition differences | Compare the L7 matrix before/after; reconcile `ui-features` "keeps the selected anchor through panel and window resizing" with Q1 before changing assertions; revised D2 is not a blanket visible-centre rule | L7, L8, L15 |
| L10 | Refactor | The four placement captures (search ratio, density, column change, history snapshot) become one type and one capture/restore pair, with table header offset handled once | Density, sort, history e2e; perceived-perf suggestion | L9 |
| L11 | Bug | B12: after reload on B then traversal back to historical A, swipe pre-scroll compares mount B while final return compares A, so canceled/completed dismiss displaces the list unlike ordinary Back | Preserve canceled-gesture no-move and ordinary Back controls; unify or explicitly sequence the entry authority without weakening traversal return | C25/B12 |
| L12 | Delete | After L8-L11, some reset-to-home suppressions (`suppressNextRestore`, `suppressReturnFromDetail`, `suppressDensityFocusSave`, dedup preset) may no longer be needed | Disable each alone in a throwaway change; run reset-to-home unit and e2e from grid, table and detail | L8, L11 |
| L13 | Bug | B11: cancelled deep reset-to-home leaves scrubber thumb DOM at top while Back restores a deep logical position | Preserve successful Home's instant top feedback; add Back/newer-navigation cancellation controls that resynchronize to the actual deep position | C31/B11 |
| L14 | Move | `search-store.ts` (~4.4k lines) mixes position logic with aggregations, sort distributions and the new-images poll; moving those out lets a session read the position core alone | Pure move; all tests unchanged | |
| L15 | Decision | C15-C21 expose loaded/off-screen/selection layout differences; desired placement awaits Q1, not a blanket D8 rule | Record operator answers for density, column reflow and height-only resize separately from focus retention; retain B4/B7 evidence limits | Q1 |
| L16 | Doc | Remaining L7 documentation conflicts include history selection survival and layout anchor rules; L8 reconciled ordinary first-page publication in guide 03 | After operator decisions, reconcile the remaining claims against L7 source/test evidence in a separately scoped timeless-guide update | Q1-Q7 |
| L18 | Bug | Violates D5, bounded: a density switch places the anchor's row *top* at the saved ratio, so between 303px grid rows and 32px table rows the visible centre shifts by up to about two grid rows (observed 0-10 items), converging after 1-3 switches. Placing the anchor's row centre at the same fraction of the usable viewport (below the table header) should hold it. Changes placement for focused images too, so the KUP-017 unit expectations in `useScrollEffects.test.ts` will change | Browser: cycle density without focus at several window sizes; record the viewport anchor's global index each switch | L15 |
| L19 | Decision | Why the buffer tier (total up to `SCROLL_MODE_THRESHOLD`) exists separately from two-tier; it adds the background fill and top-up machinery | Separate audit; check what would break if two-tier covered small results | |
| L20 | Decision | C27-C30 separate history placement choices from destination-focus defect B1; density push/restore/persist remain independent decisions | Answer Q2 and history placement in Q1 without accepting lost focus; any B1 repair needs separate scope and destination-none coverage | Q1, Q2 |
| L21 | Bug | B2: a late failed snap-back clears newer focus | Reproduce the recorded deferred missing-target sequence with a successor focus; preserve original deletion-clear control | C12/B2 |
| L22 | Bug | B3: long-press range self-cancels only when it needs asynchronous data | Repeat paired resident/out-of-buffer production dispatcher and hook checks; both must select the same range while retaining deliberate external cancellation | C33/B3 |
| L23 | Bug | B4: saved density restore applies old placement after a newer focus click; no-saved fallback is latent and lacks all input ownership | Preserve saved-wheel controls; add newer-focus assertion; remove the unreachable fallback or give it equivalent ownership if a caller is introduced | C21/B4 |
| L25 | Bug | B7: density treats seek's temporary local buffer bottom as a real end, changing preservation outcome by coordinate regime | Preserve natural TEST and equal-size/map-absent controls; distinguish source snap from legitimate true-result destination clamp | C18/B7 |
| L27 | Bug | B9: early close of reloaded traversed detail misses centring while settled controls work | Compare early/settled variants with target availability at the close event; preserve original-image placement and newer-intent cancellation controls | C35/B9 |
| L28 | Bug | B10: Effect 8 treats ordinary positive-to-zero prepend as Home/search and loses the current viewport anchor | Reproduce gated final prepend in grid/table and both transports; ordinary browsing must retain the held anchor, while true Home/search controls must still reset to top | C36/B10 |
| L31 | Decision | Q7: table horizontal scroll is preserved by sort/filter/panel changes but reset by density round-trip. Disposition: defer until a density-continuity unit; likely preference is preservation, not yet a shipped rule | Decide restore prior column versus deliberate reset for that unit; assert table -> grid -> table in both focus policies without changing existing sort/filter/panel behaviour | Q7; paired horizontal probe |
| L32 | Bug | B13: missing phantom history target adopts departing-context neighbour instead of destination top fallback | Preserve ordinary query-neighbour behavior; add history-specific missing-target control that cannot consume departing candidates | C30/B13 |
| L33 | Bug | B14: AI sort Back leaks B focus into originally unfocused A; explicit ring and stored focus also disagree | Add A-none/B-focus Back/Forward contracts in both focus modes without changing ordinary AI re-sort placement | C27/B14 |
| L34 | Bug | B15: immediate reload before selection debounce loses committed tick | Flush pending persistence on pagehide or make write ownership synchronous enough; preserve delayed control and no cross-tab promise | C29/B15 |
| L35 | Bug | B16: first-page new-images refresh scrolls stale buffer to old top before fresh publication, unlike deep atomic refresh | Hold real first-page response and assert viewed identity remains until publication; preserve final top/reset and deep control | C32/B16 |
| L36 | Characterise | B8 full local E2E logged a React ImageTable render-time update warning; 307 tests passed. Its origin, baseline incidence and behavioural consequence are unknown; no B8 regression is claimed | Capture the React stack in a bounded local reproduction and compare baseline incidence before proposing a fix; drop if expected/library-induced or no relevant defect is established | B8 completion evidence; separate operator scope |
| L39 | Bug | C10/Q3: without a remembered detail image, AI exit resets to top rather than the operator's desired browsed-centre continuity. Disposition: defer to a named AI-exit unit, not a first ordinary search/sort gate | Start AI without opening detail, browse away from top, exit with a centre image that survives; assert its neighbourhood is preserved without creating explicit focus. Keep remembered-detail precedence and bound any extra lookup cost | Q3; separate implementation scope |
