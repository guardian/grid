# Position preservation: product contract and consolidation assessment

> **Status:** Reference document. Product decisions remain active; the proposed
> top-down consolidation was rejected at design time.
>
> Sections describing current implementation were audited before commits
> `5f62208f1`, `55492567e` and `90c375bf7`. They explain ownership and the design
> decision but are not current-code authority: sort publication is now atomic,
> the offset-correction protocol was deleted, and viewport anchors now use
> usable DOM geometry. Current work is governed by
> `scroll-and-position-preservation-testing-3-workplan.md`; completed findings
> are archived in
> `zz Archive/scroll-and-position-preservation-testing-4-findings.md`.

## Product model

Kupua has two interaction modes over the same ordered image results:

- **Click to Focus:** clicking an image deliberately gives it visible, explicit
  focus; entering detail requires a separate action.
- **Click to Open:** clicking an image enters detail, matching years of Kahuna
  user habit; there is no consciously chosen visible focus.

Selection is separate from focus in both modes.

Position preservation began around explicit focus. Click to Open introduced the
need for an invisible or **phantom anchor** so the same continuity could be
provided without a visible focus ring. Phantom preservation is not always
helpful: preserving an image the user did not consciously choose can be more
confusing than starting at the top. Therefore preservation is one mechanism
controlled by policy, not an unconditional promise that every transition uses
it.

## Governing rules

These are confirmed product rules unless marked otherwise:

1. **Preserve by default.** When a meaningful anchor exists, preserve it unless
   a named relaxation has been chosen because preservation would increase user
   confusion.
2. **Relax explicitly.** A relaxed transition lands cleanly at the top. Absence
   of a working implementation is not a relaxation.
3. **One policy, multiple anchor sources.** Explicit focus, a phantom viewport
   anchor, a recently interacted-with image, and a selection anchor can all
   supply the position-preservation mechanism. They do not imply the same UI.
4. **Deliberate interaction beats passive observation.** A previously focused
   or recently interacted-with image wins over a newly inferred viewport anchor
   when it remains the meaningful point of continuity.
5. **No-focus Click to Focus behaves like Click to Open for position.** Without
   current explicit focus, use phantom-anchor policy.
6. **Query and filter changes preserve.** Without explicit focus, preserve the
   viewport-derived anchor.
7. **Missing-anchor fallback preserves the neighbourhood.** If the chosen image
   disappears from new results, try previously visible neighbours in nearest
   order; reset to top only when no meaningful neighbour survives.
8. **Sort in Click to Open is currently relaxed.** It resets to top. This is a
   product choice and may be revisited, not an implementation limitation.
9. **Detail return always preserves.** Closing detail must show the image the
   user just left, in either interaction mode.
10. **Layout changes always preserve.** Panel changes and browser resize use the
    explicit image when meaningful; otherwise they use an image from the middle
    of the viewport.
11. **Selection supplies its own anchor.** While selection is active, the last
    meaningfully interacted-with selected image is the position anchor. This
    includes an image entered and exited through detail while selection remains
    active.
12. **Transitions should expose only clean endpoints.** The target is no
    transition-induced skeleton flash, stale content flash, or visible movement
    while preservation completes. Indexed scrolling may need its own explicit
    rule for user-driven movement through unloaded positions; do not silently
    treat that as permission for transition flashes.

## Placement ladder

When policy says to preserve, the same image should remain visible as close as
possible to where the user was looking. Rank outcomes in this order:

1. same exact visible position;
2. same row, closest possible horizontal/within-row position;
3. somewhere else in the same row;
4. an adjacent row;
5. elsewhere in the same viewport;
6. **contract breach:** just outside the viewport;
7. **worse breach:** multiple rows or screens away.

The intended contract is **never off-screen and never deliberately half-visible**:
the preserved image should be fully visible whenever the result geometry permits
it. The last two levels rank failures for diagnosis; they are not accepted
outcomes.

At result-set edges, honest geometry may make exact restoration impossible. The
open question is whether Kupua should clamp visibly to the closest honest
position or introduce synthetic scroll-space continuity whose discontinuity is
only revealed if the user later reaches the real edge. See decision D07.

## Anchor vocabulary

These names are provisional Phase 1 vocabulary and deliberately avoid current
store fields:

| Term | Meaning |
|---|---|
| **Explicit focus** | An image the user consciously focused in Click to Focus mode; visible unless selection UI suppresses it. |
| **Position anchor** | The image identity a transition attempts to keep visible. It does not by itself imply a focus ring or keyboard focus. |
| **Viewport anchor** | A passively inferred position anchor chosen from the middle of the visible content. |
| **Interaction anchor** | The most recently meaningful image interaction, such as the image just left in detail. May be invisible. |
| **Selection anchor** | The most recently meaningful selected-image interaction while selection is active. |
| **Placement** | The anchor's visible row/pixel relationship to the usable viewport. |
| **Relaxation** | An explicit product decision not to preserve for a named transition; the result starts at the top. |
| **Synthetic continuity** | Deliberately shifting the scroll coordinate/available space to preserve placement when honest list edges would clamp it. Product permission is undecided. |
| **Transition complete** | The final content and anchor placement are visible, with no pending correction that can move them later. |

Do not use **phantom focus** to mean all of these at once. In product discussion,
prefer **phantom anchor** for an invisible position anchor and reserve **focus**
for conscious user focus. Current code may use different names; Phase 2 will map
them.

## Decision record

Status values:

- **Confirmed:** the user has decided it.
- **Provisional:** current preference, deliberately open to user research.
- **Open:** Phase 1 needs a decision.
- **Observe:** first drive one targeted current-app scenario, then decide.

### Policy decisions

| ID | Situation | Current product decision | Status | Remaining question |
|---|---|---|---|---|
| D01 | Global default | Preserve when a meaningful anchor exists. Every relaxation must be named and justified. | Confirmed | None. |
| D02 | No explicit focus in Click to Focus | Use the same phantom-anchor policy as Click to Open. | Confirmed | Exact precedence is covered by D05. |
| D03 | Query/filter change without explicit focus | Preserve the viewport anchor. | Confirmed | None. |
| D04 | Chosen anchor absent from new results | Try previously visible neighbours, nearest first; top only if none survive. | Provisional | Revisit only if users find this confusing. |
| D05 | Multiple possible anchors | Deliberate/recent interaction wins over passive viewport inference; active selection uses its last interacted image. | Confirmed in principle | Confirm the complete precedence order in the scenario table. |
| D06 | Sort change in Click to Open/phantom policy | Reset to top. | Provisional | Revisit only through an explicit product decision or user evidence. |
| D07 | Honest edge clamp versus synthetic continuity | Deferred. Exact placement may be faked by synthetic scroll space when real top/bottom geometry cannot support it. | Deferred | Reopen with a concrete example; current hypothesis is that synthetic continuity may make sense only when the anchor is very far from either edge. |
| D08 | Intermediate visual states during preservation | No transition-induced stale content, skeleton flash, or visible correction movement. | Confirmed target | Decide whether any technically unavoidable exception is acceptable only after it is demonstrated. |
| D09 | Leave AI ranking for ordinary search without explicit focus | Preserve the usable-centre viewport anchor like any other query-context change. | Confirmed | Current reset-to-top behaviour is not an intended relaxation. |
| D10 | Historical anchor genuinely no longer exists | Reset that history entry to top. | Confirmed | History normally restores its old result set. Deletion or later mutation can still remove the anchor; adding neighbour state or lookup work is not justified for this exceptional case. |

### Transition interview

The interviewing agent should walk this table with the user. Ask only rows whose
status is **Open**, **Observe**, or whose remaining question the user chooses to
revisit. Record concise answers in the final column; do not rewrite answers into
implementation terminology.

| ID | Transition and state | Proposed anchor/policy | Proposed placement/fallback | Status | Decision / notes |
|---|---|---|---|---|---|
| T01 | Sort; Click to Focus; explicit focus visible | Preserve explicit focus. | Placement ladder; neighbour fallback should be unnecessary because sorting keeps membership. | Confirmed | |
| T02 | Sort; Click to Focus; no explicit focus | Apply phantom policy, currently the sort relaxation. | Top. | Confirmed by D02+D06 | |
| T03 | Sort; Click to Open | Relax. | Top. | Provisional | Revisit only with user evidence. |
| T04 | Sort while selection active | Preserve last interacted selection image, even if an older explicit focus exists but is visually suppressed. | Placement ladder. | Confirmed | Selection anchor must outrank older explicit focus during sort. Current code does the reverse. |
| T05 | Query/filter change; explicit focus survives | Preserve explicit focus. | Placement ladder. | Confirmed | |
| T06 | Query/filter change; no explicit focus | Preserve middle-of-viewport anchor. | Placement ladder. | Confirmed | |
| T07 | Query/filter change; primary anchor disappears | Preserve a nearby surviving image from the previous neighbourhood. Do not promise strict prior DOM visibility. | Keep the survivor at the removed image's placement target; top if no meaningful neighbour survives. | Confirmed | Retains current behavior and avoids new DOM-visibility capture for this edge case. |
| T08 | Detail close; no traversal | Preserve the image just left. | Restore its exact pre-detail placement. | Confirmed | |
| T09 | Detail close after traversal | Preserve the last-viewed image. | Centre it vertically. In a grid, retain the column imposed by the ordered list's natural geometry; do not synthesise horizontal continuity. | Confirmed | The last-viewed image is the continuity point. Current centring is presumed correct unless targeted observation reveals a bug. |
| T10 | Fullscreen/preview exit; no traversal | Preserve the viewed image. | Keep existing list placement; do not recenter a list that never moved. | Confirmed in philosophy; verify | Current code/history may distinguish detail and preview. |
| T11 | Fullscreen/preview exit after traversal | Preserve last-viewed image. | Use the same vertical-centring and natural grid-column rule as detail traversal. | Confirmed | Detail and preview traversal should share the same user-visible return rule. |
| T12 | Panel open/close/resize; explicit focus meaningful | Preserve explicit image. | Placement ladder, normally exact. | Confirmed | |
| T13 | Panel or browser resize; no meaningful explicit focus | Preserve middle-of-viewport anchor. | Placement ladder. | Confirmed | Define usable viewport consistently; see M01. |
| T14 | Density change; explicit focus meaningful | Preserve explicit image. | Placement ladder across changed row geometry. | Confirmed | |
| T15 | Density change; no meaningful explicit focus | Preserve middle-of-viewport anchor. | Placement ladder across changed row geometry. | Confirmed | |
| T16 | Browser back/forward to a prior search state | Preserve that history entry's own position anchor, not the state being left. | Restore captured placement. If that historical anchor genuinely no longer exists, reset to top. | Confirmed | History restores the old result set, so disappearance is exceptional; do not add neighbour persistence or lookup work for it. |
| T17 | Reload on list/search view | Preserve current search entry and position. | Restore captured placement. | Confirmed in architecture; verify | |
| T18 | Reload while detail is open, then close | Preserve the image just left and the underlying entry's context. | T08/T09 rule depending on traversal. | Confirmed in principle | Complete the combined lifecycle trace and observe it if ownership or current behaviour remains unclear in Phase 2.5. |
| T19 | Deliberate scrubber seek; explicit focus exists | Viewport moves to requested location; explicit focus remains a bookmark but is not forced back on-screen. | Requested seek position. | Confirmed in architecture; verify | Clarify whether the bookmark may influence later non-seek transitions. |
| T20 | Deliberate scrubber seek; no explicit focus | Replace phantom/viewport anchor with the new location. | Requested seek position. | Confirmed in architecture; verify | |
| T21 | Home/End keyboard action | Treat as deliberate navigation to an extremum, not preservation. | Exact top/bottom. | Confirmed in architecture; verify | In explicit mode, confirm whether focus moves to first/last image. |
| T22 | Logo/reset-to-home | Explicit reset; clear preservation intent that would fight the reset. | Exact top, clean endpoint. | Confirmed | |
| T23 | Forward/backward buffer extension and eviction | Preserve what the user is currently looking at; this is continuity, not semantic re-anchoring. | Exact stationary visible content. | Confirmed target | Tier-specific mechanics remain distinct. |
| T24 | Transition target near real top/bottom | Preserve via placement ladder until honest geometry clamps; synthetic continuity remains deferred with D07. | Defer the final edge-placement rule pending a concrete visual example. | Deferred | Current hypothesis is that synthetic continuity may make sense only when the anchor is very far from either edge. |
| T25 | Selection anchor disappears because selection/results change | Selection does not survive filter or search changes, so do not retain a selection anchor for those transitions. Use the nearest visible viewport anchor that survives. | Preserve the closest visible surviving image; neighbour fallback is limited to previously visible images. Scroll to top only when no previously visible image survives. | Confirmed | Sorting preserves selections, but filtering/searching clears them. Position preservation should follow the visible neighbourhood, not an image that is no longer selected. |
| T26 | Selection cleared while an older explicit focus exists | Restore the explicit focus that selection temporarily suppressed. | Keep the current viewport stationary merely because selection UI was cleared; the focus ring and focused metadata may reappear. | Confirmed | Selection is orthogonal to focus. Later transitions may use the restored explicit focus normally. |

### Measurement decisions

These are product-observation questions, not implementation design.

| ID | Question | Why it matters | Status | Decision / notes |
|---|---|---|---|---|
| M01 | What is the "middle" used for a viewport anchor: geometric container centre, usable content centre excluding sticky headers/panels, or the image the user is most likely attending to? | Agents/probes and the user's visual judgement currently disagree slightly. | Confirmed | Use the image whose centre is nearest the centre of the usable list area after excluding headers/panels and accounting for browser size, zoom and current/future density geometry. A targeted table observation showed current midpoint-index selection one row farther from this centre. |
| M02 | Is placement measured from image top, image centre, row top, or nearest visible edge? | Different choices can all report "same position" while looking different. | Confirmed | Preserve the image centre, subject to keeping the entire image visible; never intentionally leave the anchor partly outside the viewport. |
| M03 | Does "same exact position" include horizontal column within a grid row? | Sort can preserve vertical row while moving the image across columns. | Confirmed | Same row is sufficient for exact placement in ordinary geometry. Revisit only if synthetic continuity is later accepted. |
| M04 | Is a transient skeleton acceptable during user-driven indexed scrolling but forbidden during semantic transitions? | Avoid making an impossible blanket rule while still forbidding restoration flashes. | Confirmed | No intermediary scrolling position may ever be shown. Only the pre-transition and final positions are user-visible; unloaded thumbnails may appear as correctly placed content placeholders. |

## Synthetic continuity decision exercise

Do not solve D07 from code. Present one concrete example in the running app or a
small diagram:

- The user sees about 150 images over several screens.
- Image 50 is anchored at a specific viewport position.
- Reversing sort places it near a real result-set edge where the same viewport
  position has insufficient honest content above or below.

Ask the user to compare:

- **Honest clamp:** keep the image visible at the closest physically possible
  position; the movement is immediate and truthful.
- **Synthetic continuity:** preserve the exact viewport position by introducing
  virtual leading/trailing space or an equivalent coordinate discontinuity;
  ordinary nearby browsing looks continuous, but reaching the real edge later
  reveals the adjustment.
- **Hybrid policy:** use exact synthetic continuity only for large result sets
  or only beyond a displacement threshold; otherwise clamp honestly.

If synthetic continuity is permitted, Phase 1 must also decide:

1. which transitions may use it;
2. whether result count, ordering, scrubber position and Home/End must remain
   globally truthful;
3. where and when the discontinuity is resolved;
4. whether it may survive further transitions/history; and
5. what scale threshold makes the trade-off worthwhile.

No implementation proposal belongs in Phase 1 beyond naming these observable
consequences.

## Phase 1 completion checklist

- [x] All Open/Observe rows have answers or are explicitly deferred.
- [x] Anchor precedence is coherent in normal, detail and selection states.
- [x] Every relaxation is named; all unlisted transitions preserve by default.
- [x] The placement ladder and definition of usable viewport are agreed.
- [x] Detail and preview traversal placement is decided.
- [x] Synthetic continuity is explicitly deferred in D07; no implementation assumption is made.
- [x] Intermediate visual-state policy is realistic and explicit.
- [x] The user has reviewed this as product intent, not current-code behaviour.

Only then may Phase 2 map these rules to current code.

## Phase 2: current-protocol audit and brittleness ledger

### 1. Scope and evidence boundary

This is a current-code audit completed 2026-09-05. It records observed producer-to-DOM protocols, not a product decision, implementation proposal, test run, or fuzzer result. Product policy remains the Phase 1 contract above. Architecture documents and the independently reproduced findings are cited only as bounded supporting evidence; current source is the behaviour authority. No production or test code was changed and no tests were run.

### 2. Current protocol map

#### Buffer movement

`reportVisibleRange()` receives virtualizer indices from the scroll listener and triggers extends; normal mode uses buffer-local indices, while indexed/two-tier mode receives global indices and debounces a seek when the viewport is outside the buffer ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L330-L369), [useDataWindow.ts](../../src/hooks/useDataWindow.ts#L322-L408)). `extendBackward()` atomically prepends hits, rewrites `bufferOffset`/positions, and bumps `_prependGeneration`; Effect 4 consumes that generation in a layout effect and adds a row-derived pixel delta. `extendForward()` similarly atomically evicts from the start and bumps `_forwardEvictGeneration`, consumed by Effect 5 ([search-store.ts](../../src/stores/search-store.ts#L2600-L2750), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L404-L476)). Two-tier deliberately consumes neither compensation: its fixed global virtual slots replace content rather than insert/remove it ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L414-L418), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L453-L458)). Completion is only the store commit plus the subsequent layout effect; there is no acknowledgement or paint wait. Backward extension also adds elapsed-time cooldown coordination after its commit ([search-store.ts](../../src/stores/search-store.ts#L2732-L2741)).

#### Random access

Scrubber/user scroll calls `seek(globalOffset)` directly or through the two-tier 200 ms debounce ([useDataWindow.ts](../../src/hooks/useDataWindow.ts#L353-L402)). The store aborts its range work, clamps the requested global offset, chooses shallow, position-map, or estimated deep lookup, then commits the new buffer/positions and `_seekGeneration` with local/global target indices and sub-row offset ([search-store.ts](../../src/stores/search-store.ts#L2755-L2787), [search-store.ts](../../src/stores/search-store.ts#L3581-L3659)). Effect 6 consumes the generation in a layout effect, derives pixel position in global coordinates only for two-tier, and conditionally writes `scrollTop`; it dispatches a delayed scroll event afterwards ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L482-L576)). The store marks trace settlement before this consumer and later paint; its two-rAF performance mark is observational only ([search-store.ts](../../src/stores/search-store.ts#L3637-L3661), [search-store.ts](../../src/stores/search-store.ts#L3681-L3701)). Home/End shares the seek consumer through `_pendingFocusAfterSeek`; explicit focus is changed after data arrival, phantom mode leaves it unset ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L529-L558)).

#### Search context

`useUpdateSearchParams()` snapshots the predecessor then sets a module-level user-navigation flag before router navigation; `useUrlSearchSync()` classifies the resulting URL effect as user initiated or history navigation ([useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L386-L459), [useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L141-L177)). For a user change, explicit focus wins; otherwise non-sort transitions choose the module-level viewport anchor. Phantom sort is deliberately relaxed, except active selection supplies `selection-store.anchorId` when no explicit focus exists ([useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L288-L324)). Effect 7 separately captures a ratio before the URL-driven search using `focusedImageId`, selection anchor, or viewport anchor in that precedence order ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L583-L641)).

`search()` captures ordered neighbours before replacing state, aborts old work, and either commits the first page with `_scrollReset` or holds the old buffer while `_findAndFocusImage()` resolves the anchor ([search-store.ts](../../src/stores/search-store.ts#L2011-L2080), [search-store.ts](../../src/stores/search-store.ts#L2220-L2415)). The resolver finds an ID and obtains exact coordinates from the position map or `countBefore`; without a position map it runs `countBefore` concurrently with the cursor-buffer fetch, aligns before publication, then atomically commits focus or `_phantomFocusImageId`, final results/positions and `sortAroundFocusGeneration`. For an absent anchor it batch-checks neighbours, otherwise commits first page and `_scrollReset` ([search-store.ts](../../src/stores/search-store.ts#L1358-L1530), [search-store.ts](../../src/stores/search-store.ts#L1640-L1800)). Effect 9 consumes each generation once, clamps to keep the full row visible, and calls `virtualizer.scrollToOffset()` in the same pre-paint layout phase ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L730-L825)).

#### Layout and density

Grid column changes are captured by `ResizeObserver` before `setColumns()`. The anchor is explicit focus if resolvable, otherwise the viewport anchor, otherwise row arithmetic; it contains virtualizer index and row-top ratio. A grid layout effect restores the pixel offset after columns change ([ImageGrid.tsx](../../src/components/ImageGrid.tsx#L466-L535), [ImageGrid.tsx](../../src/components/ImageGrid.tsx#L593-L610), [grid-scroll-anchor.ts](../../src/lib/grid-scroll-anchor.ts#L54-L113)). The helper chooses global indices in two-tier and buffer-local indices otherwise ([grid-scroll-anchor.ts](../../src/lib/grid-scroll-anchor.ts#L54-L65)).

Density component unmount records a separate module-level payload: global index, ratio, source `scrollTop`, and max scroll. The next density mount aborts extends, waits two animation frames for measured geometry, handles source-edge snaps, applies header-aware placement/clamping, and clears the mailbox only after its direct DOM write ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L1014-L1111), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L874-L1012)). This path has no explicit completion acknowledgement and relies on a 2-second cooldown plus rAF timing, not data state.

#### Detail and preview

Closing detail is an `image` URL-param transition. `useReturnFromDetail()` uses the closing image parameter as last-viewed identity, writes it to `focusedImageId` even in phantom mode, optionally pulses it, and only after traversal requests rAF centring ([useReturnFromDetail.ts](../../src/hooks/useReturnFromDetail.ts#L81-L157)). Thus current `focusedImageId` is a hidden bookmark after phantom detail return, despite ordinary phantom search clearing it. Existing no-traversal placement is native because the underlying list remains laid out; traversal is an explicit centring relaxation, not the Phase 1 natural-list-geometry rule ([useReturnFromDetail.ts](../../src/hooks/useReturnFromDetail.ts#L2-L17), [useReturnFromDetail.ts](../../src/hooks/useReturnFromDetail.ts#L138-L155)). Fullscreen traversal calls a module-level registered callback; it waits for fullscreen resize debounce (50/150 ms, capped at 1 s), then centres the focused image ([orchestration/search.ts](../../src/lib/orchestration/search.ts#L105-L134), [FullscreenPreview.tsx](../../src/components/FullscreenPreview.tsx#L200-L254)).

On reload/deep detail, `ImageDetail` reads a cached cursor/offset and calls `restoreAroundCursor()`. The store obtains exact count and target in parallel, loads a centred buffer, then publishes `_seekGeneration` target payload; Effect 6 applies the viewport move ([ImageDetail.tsx](../../src/components/ImageDetail.tsx#L180-L218), [search-store.ts](../../src/stores/search-store.ts#L3750-L3879), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L482-L576)). Cursor absence and restore failure fall back to approximate `seek`; missing target stops at standalone detail without list reposition ([search-store.ts](../../src/stores/search-store.ts#L3764-L3770), [search-store.ts](../../src/stores/search-store.ts#L3796-L3805), [search-store.ts](../../src/stores/search-store.ts#L3873-L3888)).

#### Browser history and reload

Before push navigation, `buildHistorySnapshot()` selects explicit focus only in explicit mode; otherwise it selects the viewport anchor, then captures its global offset/cursor and an Effect-9-compatible row-top ratio ([useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L386-L396), [build-history-snapshot.ts](../../src/lib/build-history-snapshot.ts#L37-L107)). Snapshots are keyed by history entry and persisted in session storage with an LRU cap; unavailable/corrupt storage degrades to absence ([history-snapshot.ts](../../src/lib/history-snapshot.ts#L47-L193)). On popstate, URL sync snapshots the departing entry, strict-matches the destination snapshot search key, injects its ratio into the sort mailbox, and passes identity/cursor/offset to `search()` ([useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L179-L286)). Completion again means resolver/store completion, not Effect 9 or paint. A history entry without a matching snapshot takes the regular no-anchor reset path.

#### Reset and selection interactions

`resetToHome()` is the named reset initiator. It suppresses pending detail and density restoration, clears explicit focus, selection, viewport anchor, and density mailbox, calls reset orchestration, awaits fresh first-page data, then navigates ([reset-to-home.ts](../../src/lib/reset-to-home.ts#L46-L106), [reset-to-home.ts](../../src/lib/reset-to-home.ts#L116-L184)). The orchestration immediately aborts extends, resets visible-range and scrubber DOM state, and only eagerly resets the live scroll container when it already has `bufferOffset === 0`; otherwise Effect 8 resets after the data swap ([orchestration/search.ts](../../src/lib/orchestration/search.ts#L151-L218), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L677-L750)). The suppression cleanup is an elapsed 2-second timer ([reset-to-home.ts](../../src/lib/reset-to-home.ts#L170-L176)).

Selection has its own mutable `anchorId`: toggle itself does not set it, while callers use `setAnchor`; deselecting/removing the anchor elects a fallback and `clear()` nulls it ([selection-store.ts](../../src/stores/selection-store.ts#L448-L511), [selection-store.ts](../../src/stores/selection-store.ts#L566-L616)). URL sync clears selections before every non-sort search, so the search-context producer cannot use a stale selection anchor; it only reads the selection anchor on sort-only change ([useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L168-L177), [useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L310-L324)). Clearing selection itself has no scroll producer, so older explicit or interaction state remains available to later transitions.

### 3. Brittleness ledger

| Contract/transition | Initiator | Anchor policy | Placement capture | Data commit | Handoff | DOM consumer | Completion | Failure | Tier differences | Existing evidence | Brittleness score |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T01/T04 sort with explicit or selection anchor | URL sort effect | explicit focus, else active selection anchor; phantom ordinary sort relaxes ([useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L288-L324)) | row-top/client-height ratio; no header offset ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L623-L641)) | resolver swaps centred buffer and bumps focus generation ([search-store.ts](../../src/stores/search-store.ts#L1717-L1763)) | module ratio plus store generation/phantom field | Effect 9 layout scroll and clamp ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L760-L875)) | store-ready only; no apply acknowledgement | abort, 8 s fallback, absent anchor; correction can arrive later ([search-store.ts](../../src/stores/search-store.ts#L1398-L1437), [search-store.ts](../../src/stores/search-store.ts#L1775-L1850)) | two-tier uses global virtual index; buffer/deep may estimate then correct | unit store focus/neighbour tests and local focus e2e; neither proves final DOM placement ([test inventory](zz%20Archive/scroll-and-position-preservation-testing-3.1-tests-inventory.md#L54-L58)) | High: module mailbox, generation, refs, and async correction must order correctly |
| T02/T03 phantom sort relaxation | URL sort effect | no viewport anchor in phantom sort, unless selection anchor ([useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L303-L324)) | none | first page plus `_scrollReset` ([search-store.ts](../../src/stores/search-store.ts#L2329-L2415)) | `_scrollReset.gen/sortOnly` | Effect 7b layout reset ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L650-L675)) | layout effect unacknowledged | unavailable container skips reset; stale store path is avoided by atomic set | same reset effect, two-tier coordinate remains global | store sort-reset tests; browser-history tests assert offset, not paint ([test inventory](zz%20Archive/scroll-and-position-preservation-testing-3.1-tests-inventory.md#L54-L66)) | Medium: one generation path but no consumer completion |
| T05-T07/T25 query or filter | URL effect | explicit, otherwise viewport; visible neighbours passed only for phantom; selection is cleared first ([useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L168-L177), [useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L288-L358)) | same sort ratio; viewport identity comes from virtual indices, not usable pixel centre ([useDataWindow.ts](../../src/hooks/useDataWindow.ts#L410-L426)) | initial page withheld while resolver works; fallback commits first page/reset ([search-store.ts](../../src/stores/search-store.ts#L2220-L2265), [search-store.ts](../../src/stores/search-store.ts#L1481-L1530)) | neighbour list parameter, module ratio, focus/phantom generation | Effect 9 or reset Effect 7b | resolver says settled before DOM | ES/abort/timeout/missing all reset; visible-neighbour scope applies only phantom | map exact in two-tier; estimate correction in buffer/seek | local focus/neighbour tests cover identity/store, not visible-neighbour geometry ([focus-preservation.spec.ts](../../e2e/local/focus-preservation.spec.ts#L45-L185)) | Critical: product fallback depends on several pre-transition globals and async phases |
| T12-T15 panel/resize/density | ResizeObserver or density unmount/mount | focus then viewport, then synthetic row fallback ([ImageGrid.tsx](../../src/components/ImageGrid.tsx#L522-L543)) | grid helper: row ratio; density mailbox: global index, ratio, header, extrema ([grid-scroll-anchor.ts](../../src/lib/grid-scroll-anchor.ts#L68-L113), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L1047-L1102)) | layout state only; no data commit | ref for grid; module density mailbox | grid layout effect; density double-rAF direct `scrollTop` ([ImageGrid.tsx](../../src/components/ImageGrid.tsx#L593-L610), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L920-L1012)) | mailbox cleared after write, not paint | unresolved anchor, zero height, unmount cancellation, clamp/extremum snap | two-tier global conversion; table header only density path | pure grid-anchor tests prove math; e2e inventory says geometry needs browser proof ([test inventory](zz%20Archive/scroll-and-position-preservation-testing-3.1-tests-inventory.md#L54-L58)) | High: two independent formulas and timing models |
| T08-T11 detail/fullscreen | image URL close/fullscreen exit | last viewed image written into `focusedImageId`, including phantom ([useReturnFromDetail.ts](../../src/hooks/useReturnFromDetail.ts#L112-L137)) | native unchanged placement; traversed image uses centre alignment | no search unless reload restore | React effect/rAF; fullscreen module callback and resize timers | `scrollToIndex(center)` | rAF or timeout completion only | suppression flag, unresolved index, fullscreen resize cap | shared global/local index conversion belongs to view | hook tests prove phantom writes focus and traversal centre, not full DOM/history ([useReturnFromDetail.test.ts](../../src/hooks/useReturnFromDetail.test.ts#L105-L215)) | High: visible-focus field doubles as phantom bookmark and timers coordinate layout |
| T16-T18 history/reload | popstate or detail mount | snapshot explicit/viewport anchor; strict search-key match ([build-history-snapshot.ts](../../src/lib/build-history-snapshot.ts#L37-L107), [useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L250-L286)) | cursor/global offset/row ratio; no table header in snapshot formula | `search()`/`restoreAroundCursor()` commits buffer and generation | session-storage snapshot, module ratio, seek or sort generation | Effect 6 or 9 | storage/data settled only | absent/corrupt/evicted snapshot, cursor missing, target absent, abort | exact global target only two-tier; other tiers use local/estimate | snapshot and restore unit suites; history e2e is mostly URL/store evidence ([test inventory](zz%20Archive/scroll-and-position-preservation-testing-3.1-tests-inventory.md#L54-L66)) | Critical: history crosses persistent storage, URL effect, mailboxes, and two consumer types |
| T19-T21 seek/Home/End | scrubber, scroll debounce, keyboard | seek deliberately replaces viewport anchor; explicit focus remains durable except Home/End post-intent ([useDataWindow.ts](../../src/hooks/useDataWindow.ts#L353-L402), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L529-L558)) | requested global offset; reverse-computed local row/sub-row for inexact deep seek ([search-store.ts](../../src/stores/search-store.ts#L3470-L3580)) | buffer/offset/targets/generation atomically set ([search-store.ts](../../src/stores/search-store.ts#L3637-L3659)) | generation plus target payload | Effect 6 | delayed scroll event, optional two-rAF metric; no acknowledgement | clamp, abort, missing results, headroom compensation, cooldown | shallow/map exact; deep estimate; two-tier global target | seek and generation unit/e2e coverage, but inventory limits store readiness vs painted DOM ([test inventory](zz%20Archive/scroll-and-position-preservation-testing-3.1-tests-inventory.md#L54-L58)) | High: target coordinate semantics vary by tier and precision branch |
| T22 reset/home | logo/Home/reset | clears focus, selection, viewport and density intent ([reset-to-home.ts](../../src/lib/reset-to-home.ts#L70-L106)) | none | awaited page-one search then router navigation ([reset-to-home.ts](../../src/lib/reset-to-home.ts#L116-L168)) | suppress flags, direct DOM thumb reset, buffer-offset guard | eager reset or Effect 8 ([orchestration/search.ts](../../src/lib/orchestration/search.ts#L151-L218), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L677-L750)) | data awaited; DOM unacknowledged | search failure still navigates; 2 s suppress cleanup | Effect 8 intentionally applies to two-tier too | buffer-corruption e2e exercises deep reset; not browser-paint proof ([test inventory](zz%20Archive/scroll-and-position-preservation-testing-3.1-tests-inventory.md#L64-L66)) | High: relies on several one-shot suppressions and whether component survives navigation |
| T23 extension/eviction | range report | current visible content, not explicit identity | first visible row and geometry only ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L427-L444), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L465-L474)) | extend commit atomically publishes count/generation ([search-store.ts](../../src/stores/search-store.ts#L2530-L2575), [search-store.ts](../../src/stores/search-store.ts#L2700-L2730)) | generation/count | Effects 4/5 direct `scrollTop` | layout effect unacknowledged | abort, cursor absence, cooldown, clamp | no compensation in two-tier is intentional | store extend/eviction tests plus scrubber diagnostics; no final-paint assertion ([test inventory](zz%20Archive/scroll-and-position-preservation-testing-3.1-tests-inventory.md#L54-L66)) | Medium: physically distinct path is already centrally coordinated |
| T24 real-edge continuity | any restore near edge | current code clamps or snaps extrema | clamped scroll ranges; no extra virtual padding ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L841-L851), [grid-scroll-anchor.ts](../../src/lib/grid-scroll-anchor.ts#L103-L112)) | none | none | virtualizer/direct scroll bounded by DOM scroll height | immediate write only | honest clamp | same, except two-tier has naturally global scroll space | math tests cover clamping, not the deferred policy ([grid-scroll-anchor.test.ts](../../src/lib/grid-scroll-anchor.test.ts#L42-L123)) | Medium: code attempts no synthetic continuity; only clamping/extremum snapping is observed |
| T26 clearing selection | selection clear or non-sort URL transition | selection anchor cleared; no replacement position anchor ([selection-store.ts](../../src/stores/selection-store.ts#L594-L607)) | none | selection state only | no viewport signal | none | immediate store clear | prior `focusedImageId` remains and may guide later search | no tier distinction | selection architecture describes sort-only anchor; direct current test evidence of no jump not located ([05-selections.md](00%20Architecture%20and%20philosophy/05-selections.md#L122-L159)) | Medium: absence of a scroll action is clear, but stale focus can remain semantically active |

### 4. Cross-cutting findings

- **Duplicated formulas:** grid resize uses `captureAnchorAtIndex()`/`restoreAnchorScrollTop()` ([grid-scroll-anchor.ts](../../src/lib/grid-scroll-anchor.ts#L68-L113)); history duplicates the same row-top ratio without header offset ([build-history-snapshot.ts](../../src/lib/build-history-snapshot.ts#L80-L103)); sort restoration uses row-top plus full-row clamping ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L836-L851)); density uses header-aware ratio, edge clamp and extrema snaps ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L954-L1012)). The header distinction is intentional for density/table geometry; whether the remaining formula duplication is accidental is Unknown from current code.
- **Overloaded semantic state:** `focusedImageId` is explicit visual focus in normal search, is forcibly cleared by phantom search ([search-store.ts](../../src/stores/search-store.ts#L2049-L2060)), but `useReturnFromDetail()` writes it after a phantom detail close ([useReturnFromDetail.ts](../../src/hooks/useReturnFromDetail.ts#L112-L137)). `_phantomFocusImageId` is instead a one-shot producer-to-Effect-9 positioning field cleared by its consumer ([search-store.ts](../../src/stores/search-store.ts#L1745-L1759), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L808-L824)). Viewport anchor is a module global inferred from virtual range midpoint, and selection anchor is separately elected/cleared in its own Zustand store ([useDataWindow.ts](../../src/hooks/useDataWindow.ts#L138-L180), [selection-store.ts](../../src/stores/selection-store.ts#L566-L616)).
- **Implicit producer-to-DOM handoffs:** `_seekGeneration` plus three target fields, `_scrollReset`, `sortAroundFocusGeneration` plus `_phantomFocusImageId`, density/sort module mailboxes, module callbacks, refs, and timers all transfer intent without a single applied acknowledgement ([search-store.ts](../../src/stores/search-store.ts#L308-L348), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L65-L128), [orchestration/search.ts](../../src/lib/orchestration/search.ts#L84-L134)).
- **Premature readiness signals:** search and focus resolver trace `t_settled` alongside store commits before Effect 6/9 is eligible to run ([search-store.ts](../../src/stores/search-store.ts#L2329-L2415), [search-store.ts](../../src/stores/search-store.ts#L1717-L1763)). Seek's two-rAF paint mark does not feed an application completion state ([search-store.ts](../../src/stores/search-store.ts#L3681-L3701)). Existing helper inventory likewise distinguishes store-settled from browser-settled waits ([test inventory](zz%20Archive/scroll-and-position-preservation-testing-3.1-tests-inventory.md#L155-L190)).
- **Timer/cooldown coordination:** two-tier scroll seek debounce is 200 ms ([useDataWindow.ts](../../src/hooks/useDataWindow.ts#L118-L127)); reset, seek, extension, density and fullscreen rely on cooldowns or timeout/rAF chains ([search-store.ts](../../src/stores/search-store.ts#L2732-L2741), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L902-L920), [FullscreenPreview.tsx](../../src/components/FullscreenPreview.tsx#L216-L254)). These are elapsed-time guards; generation comparisons and abort signals are the state-based guards.
- **Tier-specific behaviour that must remain distinct:** normal/seek virtualizer indices are buffer-local while two-tier indices are global and can display skeleton slots ([useDataWindow.ts](../../src/hooks/useDataWindow.ts#L29-L37), [useDataWindow.ts](../../src/hooks/useDataWindow.ts#L438-L457)). Two-tier excludes prepend/eviction compensation, while seek has exact versus estimated placement and headroom/sub-row treatment ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L414-L418), [search-store.ts](../../src/stores/search-store.ts#L3470-L3659)).
- **Existing mechanisms that should not be disturbed:** shared Effects 4/5 centralise ordinary buffer compensation; fixed two-tier coordinates prevent coordinate-space flips; Effect 9 intentionally consumes offset-correction generation rather than a second seek trigger; density’s saved global index avoids a new mount overwriting its anchor ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L404-L476), [useDataWindow.ts](../../src/hooks/useDataWindow.ts#L296-L321), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L760-L875), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L874-L1012)).
- **Current synthetic-continuity behaviour:** no current path adds virtual leading/trailing padding or alters result-space coordinates to retain placement at an honest edge. Grid/sort/density restoration clamps to DOM bounds; density additionally snaps source extrema ([grid-scroll-anchor.ts](../../src/lib/grid-scroll-anchor.ts#L103-L112), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L841-L851), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L938-L1012)). This is an observation, not a recommendation on deferred D07.

### 5. Contract coverage and gaps

| Worksheet transitions | Coverage | Current-code boundary |
|---|---|---|
| T01-T04 sort, including selection | traced end to end | Selection fallback is sort-only; current explicit focus takes precedence over selection. |
| T05-T07 and T25 search/filter plus absent anchor | traced end to end | Phantom sends visible neighbours; explicit uses buffer-neighbour capture, so the product's previously-visible restriction is only partially represented. |
| T08 detail close, T09 traversal | traced end to end | Traversal centres vertically, matching the clarified Phase 1 decision; grid column remains determined by ordered-list geometry. |
| T10-T11 preview/fullscreen exit | traced end to end | Traversal updates `focusedImageId`; no-traversal exit leaves the mounted list untouched; traversed exit waits for fullscreen/resize settlement and then vertically centres through the active density callback. Completion is emitted immediately after requesting the scroll, not after stable geometry. |
| T12-T15 panel/resize/density | traced end to end | Grid column resize is traced; table/panel-specific width source is represented through shared geometry rather than separately audited. |
| T16-T17 history/reload list | traced end to end | History snapshot restore takes the sort pipeline; completion remains an evidence gap after DOM consumer. |
| T18 reload while detail then close | traced end to end and observed | History synthesis, snapshot restore, image-offset cursor restore, Effect 6 and detail close are traced. An identity-stable no-traversal grid observation preserved the same fully visible image at exactly -140 px signed centre offset before and after reload-close, matching T08. |
| T19-T20 scrubber seek | traced end to end | User-controlled indexed skeleton traversal is represented, but final browser paint is not signalled. |
| T21 Home/End | traced end to end | Focus mutation after seek is traced; exact UI keyboard initiator was not separately followed. |
| T22 logo/reset home | traced end to end | Search failure intentionally still navigates. |
| T23 extension and eviction | traced end to end | Normal compensation and intentional two-tier exclusion are traced. |
| T24 edge placement | traced end to end | Current clamping only; synthetic continuity is not represented. |
| T26 clear selection | traced end to end and observed | Direct clear has no scroll producer, retains explicit focus and restores its normal precedence. A targeted run confirmed focus survives selection and clear. This matches the clarified product decision. |

### 6. Phase 2 conclusion

The audit found enough real coordination pressure to justify a target-protocol design, but Phase 2 has not yet passed its own completeness gate. Fullscreen/preview exit, reload-while-detail, and selection-clear ownership are only partially traced above. Phase 2.5 must close those traces and reconcile every observed difference between current behaviour and the product contract before Phase 3 begins.

Current app behaviour is the presumed-correct baseline, modulo demonstrated bugs. A discrepancy is not permission to redesign it: record it, establish whether it is a tracing error, bug, or genuine product choice, and ask the user to decide before placing it in a migration. Targeted app observation may clarify current behaviour, reveal bugs, and expose performance opportunities, but it must not become another broad characterization campaign.

The smallest clearly evidenced coordination problems remain: store-level settled signals precede viewport application; ratio and anchor payloads cross module-level mailboxes and independent generation fields; `focusedImageId` has both explicit-focus and phantom-detail-bookmark meanings; and restore math is repeated across grid, sort, density, and history paths with deliberately different header/edge treatment. Phase 3 should preserve the already-centralised compensation effects and global two-tier coordinate contract while addressing only these coordination problems.

## Phase 2.5: baseline reconciliation and readiness closure

### 1. Completed ownership traces

#### Fullscreen/preview exit (T10-T11)

List preview stores its entry image, writes each traversed image to
`focusedImageId`, and compares the final identity with the entry on exit
([FullscreenPreview.tsx](../../src/components/FullscreenPreview.tsx#L105-L164),
[useImageTraversal.ts](../../src/hooks/useImageTraversal.ts#L174-L263)). No
traversal leaves the still-mounted list untouched. Traversal waits for native
fullscreen exit and resize quiescence (50 ms quick path, 150 ms debounce, 1 s
cap), then calls the density callback on the next animation frame
([FullscreenPreview.tsx](../../src/components/FullscreenPreview.tsx#L200-L254)).
The callback converts global to tier-appropriate virtual indices and vertically
centres the natural row; table supplies header-aware centring
([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L281-L301),
[ImageTable.tsx](../../src/components/ImageTable.tsx#L752-L789)).
`t_settled` follows the scroll request immediately, so it is not stable-geometry
acknowledgement. Failed or rejected fullscreen transitions and stale pending
edge traversal remain separate suspected lifecycle bugs, not assumptions in the
target design.

#### Reload while detail is open, then close (T18)

Detail entry/traversal saves image offset and cursor; pagehide saves the keyed
history snapshot. Reload either reuses the SPA entry or synthesises a bare-list
predecessor for a cold deep link ([ImageDetail.tsx](../../src/components/ImageDetail.tsx#L119-L159),
[main.tsx](../../src/main.tsx#L36-L55)). URL sync reconstructs the entry around
its snapshot anchor; if the displayed image is absent, `restoreAroundCursor()`
loads around its cached cursor and publishes `_seekGeneration` for Effect 6
([useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L235-L286),
[ImageDetail.tsx](../../src/components/ImageDetail.tsx#L180-L218),
[search-store.ts](../../src/stores/search-store.ts#L3750-L3889)). Close goes
back through the display-only URL transition and `useReturnFromDetail()` writes
the last-viewed identity, centring when it differs from current focus
([ImageDetail.tsx](../../src/components/ImageDetail.tsx#L299-L315),
[useReturnFromDetail.ts](../../src/hooks/useReturnFromDetail.ts#L112-L155)).
Store/detail settlement can precede Effect 6 and stable underlying geometry.

#### Selection clear (T26)

Desktop/mobile Clear call `selection.clear()`; non-sort URL changes also clear
selection before choosing a search anchor ([StatusBar.tsx](../../src/components/StatusBar.tsx#L247-L265),
[SelectionFab.tsx](../../src/components/SelectionFab.tsx#L22-L40),
[useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L163-L190)). `clear()`
removes selection state and anchor but does not mutate focus or scroll
([selection-store.ts](../../src/stores/selection-store.ts#L594-L610)). Selection
temporarily suppresses the focus presentation; after clear, retained explicit
focus again participates normally in metadata, keyboard, search, sort and
layout policies. There is no viewport operation to acknowledge for clear itself.

### 2. Discrepancy register

| Transition | Current behaviour | Contract decision | Classification | Migration treatment |
|---|---|---|---|---|
| T04 selection-active sort | `focusedImageId` precedes `selection.anchorId`; detail/fullscreen traversal does not update selection anchor ([useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L310-L324), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L623-L641)). The selections architecture explicitly documents that precedence ([05-selections.md](00%20Architecture%20and%20philosophy/05-selections.md#L122-L139)). | Active selection anchor outranks older explicit focus during sort. | Confirmed product/design bug: current code matches the earlier design, but restoring an older suppressed focus instead of the active selection context is user-surprising and should be fixed even without consolidation. | Approve the minimum precedence fix independently. Defer new persisted "last meaningful selected interaction" semantics. |
| T06/T13/T15 viewport anchor | Current anchor is rounded virtual-range midpoint, not nearest image centre in the usable viewport ([useDataWindow.ts](../../src/hooks/useDataWindow.ts#L410-L426)). In a targeted table observation it was 42 px from usable centre while the adjacent row was 10 px away. Pre-existing architecture already calls the phantom anchor the image nearest viewport centre ([02-focus-and-position-preservation.md](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md#L44-L52)). | Use nearest image centre after excluding non-list UI and using actual density/browser geometry. | Found bug against pre-existing intent; exact usable-geometry wording is a contract clarification. | Separate behavior fix or prerequisite, with signed-geometry coverage. |
| T07 missing primary anchor | Phantom fallback candidates come from virtual range, then inherit the missing image's saved ratio; explicit fallback may include off-screen buffer neighbours ([useDataWindow.ts](../../src/hooks/useDataWindow.ts#L151-L174), [search-store.ts](../../src/stores/search-store.ts#L1459-L1509), [useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L783-L851)). | Preserve the current nearby-survivor policy and inherited placement; do not add a strict visible-only or forced-centring promise. | Parity constraint accepted after cost review. | Preserve. Revisit only with evidence that current replacement choice or placement confuses users. |
| T18 reload detail, no traversal | Identity-stable observation preserved the same fully visible image at exactly -140 px signed centre offset before and after reload-close. | Restore exact pre-detail placement. | Current behavior confirmed to match. An earlier ordinal-cell probe that reported centring was refuted because virtualization changed which identity the ordinal named. | Preserve; use stable image identity in future tests. |
| Leave AI search without explicit focus | Current URL policy suppresses phantom preservation and resets to top ([useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L299-L306)). | Preserve usable-centre viewport anchor like other query changes. | Lower-priority consistency discrepancy, not a regression against located prior intent. | Defer the implementation decision until Phase 3A costs survival likelihood and any extra anchor-resolution work. |
| T16 historical anchor deleted/mutated away | Snapshot stores one anchor/cursor/offset/ratio and otherwise falls through to reset ([build-history-snapshot.ts](../../src/lib/build-history-snapshot.ts#L37-L107), [useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L250-L286)). | Reset to top; do not add neighbour persistence or lookup work. | Current behavior accepted as exceptional fallback. | Preserve. |
| T26 clear selection | Focus remains stored and becomes active again; clear itself does not scroll. | Restore explicit focus without moving solely because of clear. | Earlier contract was wrong; current behaviour accepted. | Preserve and add a focused-selection-clear characterization before adjacent work. |
| T09/T11 traversed detail/fullscreen exit | Vertically centre the final row; grid column follows ordered geometry. | Same. | No placement discrepancy. Endpoint cleanliness remains unproved. | Preserve placement; add stable-geometry observation before migration. |
| T24 real edges | Honest DOM clamping; no synthetic continuity. | Synthetic continuity remains deferred. | Explicitly unresolved product policy. | Exclude from initial migrations. |

No other T01-T26 product/current-behaviour discrepancy was found in the bounded
audit. This means none was evidenced, not that future bug discovery is closed.

### 3. Suspected bugs and performance opportunities outside parity migration

- Fullscreen exit emits inconsistent trace phases across exit paths and can
   wait indefinitely if a rejected native exit never produces
   `fullscreenchange` ([FullscreenPreview.tsx](../../src/components/FullscreenPreview.tsx#L238-L270)).
- Pending edge traversal and `hasNavigatedRef` survive preview sessions; failed
   extension may leak intent into a later session
   ([useImageTraversal.ts](../../src/hooks/useImageTraversal.ts#L117-L203)).
- T18 after distant traversal may restore focus to the current image before
   close, causing the close hook to skip its required centring. This remains a
   targeted reproduction candidate, not a confirmed bug.
- Current perceived `t_settled` events measure store or scroll-request
   completion, not consistently stable viewport geometry. This can hide latency
   regressions even when existing perceived-performance graphs remain green.

### 4. Provisional viewport-stability oracle

The first migration pilot must capture a pre-action baseline and a final sample
for one stable, anonymised image identity. The focused check records:

1. **Identity:** expected anchor ID equals the rendered anchor ID. IDs stay in
    memory/test output and are never copied into docs.
2. **Signed placement:** anchor centre minus usable-viewport centre in pixels,
    where usable geometry excludes sticky headers and panels through actual DOM
    rectangles rather than hard-coded offsets.
3. **Visibility:** the complete anchor rectangle lies within usable bounds when
    honest list geometry permits it.
4. **Endpoint cleanliness:** animation-frame samples from action start through
    stability contain only the pre-transition endpoint and final endpoint;
    correctly placed thumbnail placeholders are allowed, stale identities and
    intermediary scroll positions are not.
5. **Stability:** after the viewport write, identity and signed placement remain
    within the scenario's explicit tolerance for two consecutive animation
    frames and through any required ResizeObserver/offset-correction cycle.

Lifecycle terms:

- **Data ready:** required result identity/position data is committed.
- **Viewport written:** the owning density has issued its DOM/virtualizer write.
- **Viewport stable:** post-layout geometry satisfies identity, placement and
   visibility and no pending correction can move it.

This does not claim knowledge of browser paint. The test observes rendered DOM
geometry at animation-frame boundaries. Each scenario declares tier, density,
focus mode, usable bounds, intended placement and whether edge clamping applies.

### 5. Phase 2.5 gate result

Phase 2.5 is complete. Every transition has an end-to-end ownership trace or an
explicitly accepted/deferred boundary; known product/current discrepancies have
user decisions; and the initial viewport-stable oracle is specified. Phase 3
may design the target protocol, but must keep the confirmed behavior fixes above
outside parity-only migration slices and must not absorb deferred synthetic
continuity.

## Phase 3A: contract delta and cost ledger

Before designing a target protocol, classify every product/current delta using
one of these terms:

- **Found bug:** demonstrated current behaviour violates product intent that
   predates this exercise. Record the prior source and direct evidence.
- **Suspected bug:** a plausible failure mechanism exists, but current
   user-visible failure has not been demonstrated.
- **Contract change:** this exercise chose behaviour different from the accepted
   current design. It is product scope, not bug repair.
- **Contract clarification:** wording became more precise without intentionally
   changing observable behaviour.
- **Parity constraint:** current behaviour is accepted and must survive.
- **Rejected/deferred scope:** value does not currently justify implementation
   or evidence cost.

For each contract change and each target-protocol requirement, record:

| Cost dimension | Required answer |
|---|---|
| New durable state | Does it add store fields, history/session payload, caches or persistence? |
| New transient coordination | Does it add operations, acknowledgements, refs, timers, effects or cancellation paths? |
| Network/data work | Does it add requests, larger payloads, wider neighbour capture or expensive lookup? |
| DOM/layout work | Does it add geometry reads, observers, animation-frame sampling or forced layout risk? |
| Tier/density multiplication | Which physical tiers and current/future densities require distinct handling? |
| Test/performance burden | Which new deterministic scenarios and baselines become permanently required? |
| Existing machinery deleted | What complexity is removed in the same slice? |
| Net judgement | Free/small, bounded, substantial, or unjustified; proceed, simplify, defer or reject. |

The ledger must call out attractive but unjustified promises. A contract row is
not automatically worth implementing because it is coherent. Prefer an
accepted simple fallback over new persistent state, network work or lifecycle
machinery for an unlikely edge case.

### Phase 3A cost ledger and decisions

| Item | State / coordination | Network / layout | Tier, density and tests | Machinery deleted | Net judgement |
|---|---|---|---|---|---|
| T04 minimum selection precedence | No new state. Reverse two existing producer precedence chains while retaining `phantomOnly`, so old explicit focus is not overwritten. | No new request or DOM work; existing resolver and Effect 9 apply the selected anchor. | Existing tier/density path. Add one signed-geometry selection-sort scenario and preserve ordinary explicit-sort tests. | None; this is a standalone bug fix. | **Small; approve independent fix.** |
| T04 full last-interacted selected image | Requires a separate persisted interaction anchor; current `anchorId` is also the Shift-range pivot and cannot safely carry both meanings. Multiple detail/fullscreen/select/deselect producers need wiring. | No required network/layout increase if implemented separately from metadata anchor updates. | Medium cross-feature test burden: persistence, range selection, detail, fullscreen and removal fallback. | None. | **Substantial relative to current need; defer.** |
| T06/T13/T15 usable-centre election | No durable state. Lazily elect from the active density's rendered DOM only when a semantic transition requests an anchor; never on every scroll frame. | One bounded rectangle scan per semantic capture; no network. Actual DOM geometry handles headers, panels, zoom, browser size and future fixed-row densities. | Tier-neutral identity election with table and grid geometry tests plus representative browser transitions. Replace midpoint-specific tests. | Delete duplicate midpoint-election blocks and midpoint assumptions. | **Small implementation, moderate verification; approve independent fix.** |
| T07 strict visible-only survivor + forced centre | Would add an ephemeral DOM-visible candidate snapshot and replacement-placement intent. | Existing batched membership lookup need not increase, but exact visibility adds geometry capture and forced centring adds browser assertions. | Grid/table capture and representative tier restoration tests. Could delete arbitrary explicit ±20 neighbour capture only after both modes migrate. | Partial, but resolver/generation/correction remain. | **Not justified now; retain current fallback and placement.** |
| AI-exit viewport preservation | No durable state; mechanically removes the current exception and invokes the existing resolver. | Can add ID lookup, position resolution, buffer-around-image loads and asynchronous correction when the AI image is deep in ordinary ordering. | Source AI buffer plus every destination tier; difficult deterministic fixtures and perceived-latency baseline. | Only one policy exception. | **Behaviorally expensive for little simplification; defer pending measured value/latency.** |
| Historical anchor genuinely removed | No additions. | Current top fallback avoids neighbour state, lookup and payload growth. | Existing history fallback coverage. | None needed. | **Keep accepted simple fallback.** |
| Typed viewport operation | One family-local pending operation with immutable ID and existing search generation; no universal coordinator. | No per-frame writes. Imperative acknowledgement only for migrated semantic operations. | Design reset and explicit-sort variants only. | Must delete each migrated family's mailbox/generation/effect in the same slice. | **Bounded pilots only.** |
| Data-ready / viewport-written / viewport-stable | Data-ready uses existing atomic commit. Written is active-consumer acknowledgement. Stable is operation-only geometry observation after final correction. | At most two stable rAF samples; never subscribed Zustand writes per sample. | Permanent signed-geometry/perf oracle only for semantic operations. | Replace misleading operation-level `t_settled` and arbitrary waits where migrated. | **Required for pilots, narrowly exposed.** |
| Dataset identity and cancellation | Reuse existing search generation and data abort controllers; latest viewport operation ID wins at consumer. | No new request. | Family-local stale/unmount tests. | May delete handled-generation refs only inside migrated family. | **Reuse existing authorities; reject new epoch/AbortController hierarchy.** |
| Density-remount ownership | Would need consumer claim/release, Strict Mode survival and outgoing-consumer protection. | High timing/render risk. | Grid/table remount matrix. | Could eventually replace density mailbox, but not in either pilot. | **Exclude from Phase 3B pilots.** |
| Seek/compensation unification | Requires tier-discriminated coordinates and retains physically distinct algorithms. | High correctness/performance risk. | Broad three-tier gates. | Existing compensation effects are already centralised; little likely deletion. | **Do not migrate now.** |

### Phase 3A gate result

Phase 3A is complete. The independently worthwhile bugs are T04's minimum
selection-precedence correction and geometric usable-centre election. They do
not depend on a rewrite and should receive separate failing-first fixes later.
T07 refinements and full selected-interaction semantics are rejected/deferred;
AI-exit preservation is deferred pending value and latency evidence. No history
payload, extra neighbour persistence or universal coordinator is approved.

Phase 3B may design only:

1. a family-local reset operation that deletes `_scrollReset` and its consumer;
2. an explicit-focus sort operation that deletes its ratio/generation/correction
   handoffs and proves stable completion; and
3. shared vocabulary required by those two variants, without migrating seek,
   history, query/filter fallback, density remount, detail/fullscreen or buffer
   compensation.

The explicit-sort pilot is the real go/no-go test. If it cannot delete the old
handoffs without broad subscribed state, extra requests or performance loss,
stop the consolidation project even if the reset pilot succeeds.

## Phase 3B: target-protocol design result

### Decision

Do **not** implement either proposed consolidation pilot. The design exercise
rejected them before production work because neither currently satisfies the
project's deletion gate.

This is not a conclusion that the code is simple or that its completion
semantics are adequate. It is a narrower conclusion: the proposed operation
protocol would add a second signalling system without deleting enough of the
first one inside a bounded migration.

### Reset pilot: reject as a rename-plus-acknowledgement

Current reset signalling is already family-local and typed in substance:
`_scrollReset` contains a monotonic generation plus the only variant payload,
`sortOnly`; it is published atomically with fresh results and consumed by one
pre-paint layout effect ([search-store.ts](../../src/stores/search-store.ts#L324-L330),
[search-store.ts](../../src/stores/search-store.ts#L2329-L2415),
[useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L650-L675)). Replacing
it with `{ id, kind: "reset", preserveHorizontal }` would mostly change names.

It would not replace reset-to-home's independent responsibilities: aborting
extends, detail/density suppression, CQL remount, visible-range/scrubber reset,
focus/selection clearing and router sequencing
([reset-to-home.ts](../../src/lib/reset-to-home.ts#L46-L184),
[orchestration/search.ts](../../src/lib/orchestration/search.ts#L151-L218)). It
also cannot simply delete the `bufferOffset > 0 -> 0` guard because that guard
distinguishes semantic reset from natural buffer movement and scroll-mode
self-correction ([useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L677-L750)).

Adding acknowledgement would improve observability, but observability alone is
not architectural consolidation. Instrument the existing command if needed;
do not replace it with an equivalent envelope.

### Explicit-sort pilot: reject because the old protocol is not slice-local

The proposed explicit-sort operation cannot delete its old signalling fields
or consumer. The same machinery also serves phantom query/filter restoration,
history snapshot restoration, AI-result restoration, neighbour fallback,
arrow-key snap-back and asynchronous offset correction.

`sortAroundFocusGeneration` has producers throughout `_findAndFocusImage()` and
normal/AI search commits; `_sortFocusRatio` is also written by history restore;
Effect 9 consumes explicit focus, phantom identity, pending keyboard delta and
offset-correction generations in one path
([search-store.ts](../../src/stores/search-store.ts#L1640-L1882),
[search-store.ts](../../src/stores/search-store.ts#L2149-L2167),
[search-store.ts](../../src/stores/search-store.ts#L2364-L2395),
[useUrlSearchSync.ts](../../src/hooks/useUrlSearchSync.ts#L250-L286),
[useScrollEffects.ts](../../src/hooks/useScrollEffects.ts#L760-L875)).

An explicit-sort-only operation would therefore coexist with the ratio mailbox,
generation counters, refs and Effect 9. Migrating all their owners together
would instead be the highest-risk semantic rewrite the workplan explicitly
forbids. The bounded pilot fails the halt condition before implementation.

### Target shape retained for a future reopening

If later fixes naturally separate one complete family from Effect 9, the
smallest acceptable protocol is a family-local pending operation, not a
universal coordinator:

```ts
type PendingViewportOperation =
   | {
         id: number;
         searchGeneration: number;
         kind: "reset";
         preserveHorizontal: boolean;
      }
   | {
         id: number;
         searchGeneration: number;
         kind: "restore-anchor";
         anchorId: string;
         placement: ViewportPlacement;
         revision: "initial" | "corrected";
         final: boolean;
      };
```

Required properties remain:

- reuse existing search generation and data abort controllers;
- latest operation ID wins at the active DOM consumer;
- `useLayoutEffect` retains before-paint writes;
- correction is a revision of the same operation, not a second command;
- acknowledgement identifies operation and consumer;
- stable geometry is observed imperatively, without per-frame Zustand writes;
- local/global/identity targets are discriminated rather than simultaneously
   optional; and
- each migrated family deletes its old mailbox/counters/consumer before merge.

Do not design density-remount claim/release, seek, history, detail/fullscreen or
buffer-compensation variants speculatively.

### What should proceed instead

1. Fix T04 minimum selection precedence independently.
2. Fix geometric usable-centre anchor election independently.
3. Add honest viewport-written/stable trace points to existing operations only
    where a test or performance decision needs them; do not call this a rewrite.
4. Reassess Effect 9 after those fixes and ordinary maintenance. Reopen
    consolidation only if one complete semantic family can then migrate while
    deleting its old producers, fields, refs and consumer in one reversible
    slice.

### Phase 3B gate result

The consolidation proposal is rejected at design time. This is a successful
project outcome under the workplan: current brittleness is real, but the tested
target would add indirection rather than remove mechanisms. No production
prototype or performance campaign is justified. The independent bugs and
observability gaps remain actionable.
