# Habitual E2E Consolidation Audit

**Status:** Phase C completion record, updated 10 September 2026  
**Scope:** the 236-case pre-Phase-C baseline and its resolved elections  
**Goal:** retain stronger behavior evidence while keeping the habitual loop at roughly five minutes

## Headline

Four independent source passes accounted for all **236 concrete cases** in the
pre-Phase-C baseline:

| Family | Cases | Audit scope |
|---|---:|---|
| Scroll, buffer, focus, phantom | 105 | `scrubber` 76, `buffer-corruption` 12, `focus-preservation` 9, `phantom-focus` 8 |
| History, general UI, keyboard, visual | 80 | `browser-history` 39, `ui-features` 22, `keyboard-nav` 15, `visual-baseline` 4 |
| Selection, collections, toast, CQL | 51 | selections 30, mobile selection 7, collections 8, toast 5, quoting 1 |

Phase C applied the elections and repairs one owner at a time. Its final
habitual surface was **203/203 in 4.4 minutes**, with no failures or retries
([execution ledger](performance-harness-7-phase-c-ledger.md#progress)). Thirty-two
of the 33 audited deletions/merges landed during Phase C. D-Wheel subsequently
removed the weaker post-seek wheel case after its three retained owners passed.
Accepted D-Credit, D-Center and compact D-Tier owners bring the current habitual
surface to **206/206 with a 4.5-minute three-run median**.

The tables below preserve the pre-C rationale. Deleted-candidate links describe
that baseline and are not current routing links; the execution ledger records
what actually landed. Smoke ownership and the remaining wheel election are
re-elected in [the replacement Phase D plan](performance-harness-5-workplan.md#phase-d-elect-legacy-residue).

## Audit Method

Tests were compared by observable oracle, not by action name. Two tests that
click the same control remain distinct when they select different:

- result regime or algorithm;
- focus/phantom/selection policy;
- warm, reload, Back/Forward, or deep-link lifecycle;
- DOM geometry, transient frame, history, or store invariant;
- pointer, keyboard, or coarse-pointer event path;
- sparse/null/high-cardinality data condition.

The recent harness elections remain binding:

- Real intersecting DOM geometry outranks virtual-range guesses.
- Generation and final painted outcomes outrank fixed delays.
- Store bookkeeping is not a browser oracle.
- Stable final state does not prove absence of painted flash.
- Conditional skip or warning-only behavior is not a passing contract.

## Pre-Phase-C Remove Or Merge Candidates

### Scroll, Buffer, Focus, Phantom: 2

| Candidate | Why it is redundant | Elected owner |
|---|---|---|
| Deep table Grid-logo reset | Same table, 50% seek, Grid-logo command and clean-top assertions as the stronger transition recorder | Delete [candidate](../../../e2e/local/buffer-corruption.spec.ts#L125-L143); retain [deep-table stale-grid/clean-state case](../../../e2e/local/buffer-corruption.spec.ts#L653-L789) |
| Explicit-mode grid double-click in phantom file | Same fresh explicit/grid lifecycle, but weaker URL/UI assertion | Delete [candidate](../../../e2e/local/phantom-focus.spec.ts#L196-L209); retain [exact detail identity case](../../../e2e/local/ui-features.spec.ts#L27-L49) |

### Tier-Dependent Comparisons: Habitual Owners Retained

These habitual cases had historical indexed equivalents in the retired tier
matrix. Phase C correctly retained every habitual case; they remain the natural
buffer/indexed owners. D-Tier accepted one compact local seek journey, and
E-Tier deleted the three-project repetition
([current decision](performance-harness-5-workplan.md#d-tier-one-forced-seek-trial-then-a-binding-disposition)).

| Habitual candidate | Equal two-tier matrix owner |
|---|---|
| Midpoint seek | [tier middle seek](../../../e2e/local/tier-matrix.spec.ts#L151-L180) |
| Bottom seek | [tier bottom seek](../../../e2e/local/tier-matrix.spec.ts#L216-L238) |
| Consecutive seeks | [tier consecutive seeks](../../../e2e/local/tier-matrix.spec.ts#L240-L269) |
| Middle drag | [tier drag](../../../e2e/local/tier-matrix.spec.ts#L271-L292) |
| Rendered content after seek | [tier rendered-content case](../../../e2e/local/tier-matrix.spec.ts#L294-L315) |
| Three-ratio scroll-after-seek | [tier post-seek scroll](../../../e2e/local/tier-matrix.spec.ts#L317-L337) |
| Focused direction change | [tier focused direction case](../../../e2e/local/tier-matrix.spec.ts#L367-L395) |
| End then Home | [tier boundary round trip](../../../e2e/local/tier-matrix.spec.ts#L556-L594) |
| Table-grid-table 50% round trip | [tier density round trip](../../../e2e/local/tier-matrix.spec.ts#L679-L721) |

The inverse caution also applies: similarly named top-seek, six-toggle density,
field-change viewport, PgDown round trip, Credit End and special-sort cases have
stronger or distinct habitual oracles and must not be removed merely because a
tier case performs the same broad action.

### History, UI, Keyboard: 16

| Delta | Candidate election |
|---:|---|
| -1 | Merge Back-after-sort assertions into the Back/Forward round trip, which already performs the same predecessor restore ([candidate](../../../e2e/local/browser-history.spec.ts#L131-L152), [owner](../../../e2e/local/browser-history.spec.ts#L180-L194)). |
| -1 | Delete “focus is NOT carried” because it never asserts focus and conflicts with snapshot-restoration policy; retain focused query restore and no-snapshot fallback ([candidate](../../../e2e/local/browser-history.spec.ts#L196-L213), [owners](../../../e2e/local/browser-history.spec.ts#L1016-L1076)). |
| -1 | Delete shallow Grid-logo history case; the focused reset/Back journey proves the same URL/top behavior under stronger setup ([candidate](../../../e2e/local/browser-history.spec.ts#L675-L698), [owner](../../../e2e/local/browser-history.spec.ts#L1056-L1076)). |
| -1 | Delete mislabeled detail-logo/Back case, which never presses Back; clean deep detail reset is stronger ([candidate](../../../e2e/local/browser-history.spec.ts#L700-L734), [owner](../../../e2e/local/buffer-corruption.spec.ts#L175-L232)). |
| -1 | Merge the two metadata-history cases into one non-first-image journey retaining exact `history.length + 1`, URL and rendered-identity assertions ([cases](../../../e2e/local/browser-history.spec.ts#L736-L856)). |
| -2 | Delete standalone replace-only and push-only key checks; retain initial synthesis plus combined replace/Back key lifecycle ([candidates](../../../e2e/local/browser-history.spec.ts#L867-L908), [owner](../../../e2e/local/browser-history.spec.ts#L910-L935)). |
| -1 | Delete mislabeled “back after sort change”; it changes query and is weaker than filtered-to-filtered focused restore ([candidate](../../../e2e/local/browser-history.spec.ts#L995-L1014), [owner](../../../e2e/local/browser-history.spec.ts#L1016-L1032)). |
| -1 | Delete “reload restores deep position with query”; it sets no query and repeats a shallower version of pagehide-snapshot restoration ([candidate](../../../e2e/local/browser-history.spec.ts#L1281-L1311), [owner](../../../e2e/local/browser-history.spec.ts#L1225-L1279)). |
| -1 | Delete status-count update that performs a full navigation; URL-state E2E already proves query, exact count agreement, sort and errors ([candidate](../../../e2e/local/ui-features.spec.ts#L217-L245), [owner](../../../e2e/local/ui-features.spec.ts#L556-L581)). |
| -1 | Merge Browse and Details pointer toggles into one independent panel round trip; retain keyboard-panel coverage separately ([cases](../../../e2e/local/ui-features.spec.ts#L278-L318)). |
| -1 | Delete standalone FullscreenPreview ArrowRight case; ArrowLeft case already presses Right and proves exact identity return ([candidate](../../../e2e/local/ui-features.spec.ts#L640-L686), [owner](../../../e2e/local/ui-features.spec.ts#L587-L638)). |
| -1 | Merge two click-to-search editability cases; retain metadata replacement, table Shift-click `by:` and one subsequent real edit oracle ([cases](../../../e2e/local/ui-features.spec.ts#L856-L976)). |
| -1 | Delete CQL “ArrowUp/Down propagate” case: it presses only Down and duplicates the stronger autofocused no-focus one-row/null-focus test ([candidate](../../../e2e/local/keyboard-nav.spec.ts#L319-L333), [owner](../../../e2e/local/keyboard-nav.spec.ts#L34-L54)). |
| -1 | Delete CQL “Home/End propagate” case: it presses only Home and duplicates the stronger autofocused top/null-focus test ([candidate](../../../e2e/local/keyboard-nav.spec.ts#L335-L349), [owner](../../../e2e/local/keyboard-nav.spec.ts#L75-L88)). |
| -1 | Merge focused ArrowDown and ArrowUp into one exact identity round trip ([cases](../../../e2e/local/keyboard-nav.spec.ts#L130-L161)). |

### Selection, Collections, Toast: 14

| Candidate | Election |
|---|---|
| Basic one-image Clear | Strict subset of two-image Clear plus panel restoration ([candidate](../../../e2e/local/selections.spec.ts#L145-L166), [owner](../../../e2e/local/selections.spec.ts#L686-L720)) |
| Full-navigation “sort preserves selection” | Does not exercise SPA sort-only classification; move exact-ID assertion into the dedicated SPA sort/reload cases ([candidate](../../../e2e/local/selections.spec.ts#L168-L199), [owners](../../../e2e/local/selections.spec.ts#L854-L940)) |
| Reverse range | Weak `>=4`; direction normalization is exact in unit tests while forward E2E owns event wiring and exact IDs ([candidate](../../../e2e/local/selections.spec.ts#L394-L410), [unit](../../../src/hooks/useRangeSelection.test.ts#L38-L65), [E2E owner](../../../e2e/local/selections.spec.ts#L366-L392)) |
| No-anchor range | Final `>=1` is already true before the action; exact policy belongs to click-interpreter units ([candidate](../../../e2e/local/selections.spec.ts#L412-L440), [owner](../../../src/lib/interpretClick.test.ts#L147-L168)) |
| Second Shift-click | `>=5` cannot prove sticky-anchor policy; exact effect belongs to click-interpreter units ([candidate](../../../e2e/local/selections.spec.ts#L442-L466), [owner](../../../src/lib/interpretClick.test.ts#L110-L132)) |
| Direct reconciled-store view | Reads implementation state and accepts any valid kind; exact scheduling/reconciliation is unit-owned ([candidate](../../../e2e/local/selections.spec.ts#L580-L602), [owners](../../../src/stores/selection-store.test.ts#L427-L464), [reconcile units](../../../src/lib/reconcile.test.ts#L58-L120)) |
| Keywords reconciliation store check | Allows `all-empty` or `pending`; exact chip totals/partial counts are unit-owned ([candidate](../../../e2e/local/selections.spec.ts#L604-L633), [owner](../../../src/lib/reconcile.test.ts#L352-L407)) |
| Selection-count chip | Strict subset of second tickbox, which already asserts visible count `2` ([candidate](../../../e2e/local/selections.spec.ts#L722-L736), [owner](../../../e2e/local/selections.spec.ts#L125-L143)) |
| Coarse-pointer attribute | Implementation-marker subset of the StatusBar placement case ([candidate](../../../e2e/local/selections-mobile.spec.ts#L282-L295), [owner](../../../e2e/local/selections-mobile.spec.ts#L161-L186)) |
| Expand collection child | Collapse test first expands and proves the child visible, then adds collapse behavior ([candidate](../../../e2e/local/collections.spec.ts#L127-L137), [owner](../../../e2e/local/collections.spec.ts#L139-L152)) |
| Warning/error/success toast category cases | Dev-store injection only repeats component category wiring; use a component `it.each` matrix ([candidates](../../../e2e/local/toast.spec.ts#L58-L80), [component owner](../../../src/components/ToastContainer.test.tsx#L136-L141)) |
| Toast stacking | Multiple rendering and dismissal are component-owned; retain one root-mount/dismiss E2E ([candidate](../../../e2e/local/toast.spec.ts#L82-L96), [component owner](../../../src/components/ToastContainer.test.tsx#L143-L157), [retained root case](../../../e2e/local/toast.spec.ts#L45-L56)) |

## Completed Cleanup: Scrubber-Track Wheel Is Input Continuity

`Scrubber.tsx` installs wheel forwarding on the full track, but that track is
only 14px wide and transparent
([geometry](../../../src/components/Scrubber.tsx#L30-L40),
[listener](../../../src/components/Scrubber.tsx#L387-L429),
[render](../../../src/components/Scrubber.tsx#L1100-L1130)). The E2E precisely
places Playwright's pointer on that strip and sends synthetic wheel input
([tests](../../../e2e/local/scrubber.spec.ts#L1527-L1579)).

This is not a fourth scroll behavior. The listener writes `e.deltaY` to the
same active grid/table container's `scrollTop`; the normal scroll event,
virtualizer range reporting, extend/prepend logic and indexed scroll-seek then
run unchanged. Buffer, indexed and seek regimes differ downstream exactly as
they do when the wheel begins over content. The only distinct implementation
is the 14px sibling-strip forwarding adapter, needed so that strip is not a dead
wheel zone.

**Election completed in D-Wheel:** retain one small E2E proving wheel input over
the track changes the active content container. The weaker settled post-seek
track case was deleted after the retained track and grid/table content owners
passed before and after deletion. The grid/table content-wheel cases prove
normal post-seek scrolling
([content cases](../../../e2e/local/scrubber.spec.ts#L1581-L1625)).

The product interaction catalogue correctly omits wheel-over-track as a
semantic row. Keep it as one implementation-continuity regression only. The
remaining deletion belongs to Phase D-Wheel, with focused owner and full
habitual validation.

## Phase C Repairs: Complete

Every row below was repaired or deliberately resolved during Phase C. The
current contracts and focused validation are recorded in
[the Phase C ledger](performance-harness-7-phase-c-ledger.md#progress); this
section retains the defects that motivated them.

### Scroll And Focus

| Test/family | Problem | Stronger contract |
|---|---|---|
| “rapid concurrent seeks” | `clickScrubberAt()` waits 800ms/results after each click, so actions are not concurrent | Dispatch low-level clicks without per-click settle, then require latest generation/context only ([test](../../../e2e/local/scrubber.spec.ts#L1121-L1187), [helper](../../../e2e/shared/helpers.ts#L773-L783)) |
| Sort/filter position-map invalidation | Observes eventual map reload, not the invalidated state; filter can skip | Assert old map is invalidated for target generation before new map publication ([tests](../../../e2e/local/scrubber.spec.ts#L2491-L2609)) |
| Buffer transition recorder | Allows an invalid transient length under its own documented bound | Require the actual forbidden state shape or remove the recorder claim ([test](../../../e2e/local/buffer-corruption.spec.ts#L343-L419)) |
| Query-change reset race | Uses `page.goto`, replacing the SPA/store whose transition it claims to observe | Trigger through real CQL/router navigation ([test](../../../e2e/local/buffer-corruption.spec.ts#L425-L467)) |
| Neighbour fallback | Accepts null fallback, so only proves old identity cleared | Deterministic fixture; require elected neighbour identity and painted visibility ([test](../../../e2e/local/focus-preservation.spec.ts#L120-L191)) |
| Viewport preservation without ring | Asserts null focus/results only, not identity or geometry | Assert elected viewport anchor and usable-viewport geometry ([test](../../../e2e/local/focus-preservation.spec.ts#L336-L384)) |
| Phantom detail return | 800px tolerance can permit near-complete reset | Stable identity plus usable-viewport placement ([test](../../../e2e/local/phantom-focus.spec.ts#L125-L166)) |

### History, UI, Keyboard

| Test/family | Problem | Stronger contract |
|---|---|---|
| Phantom history setup | File-level explicit and nested phantom init scripts have undefined order | Install exactly one mode writer for each context ([tests](../../../e2e/local/browser-history.spec.ts#L1416-L1570), [helpers](../../../e2e/shared/helpers.ts#L919-L944)) |
| Metadata history | Conditionally skips when metadata control is absent | Deterministic fixture/control or hard precondition before measuring history |
| FullscreenPreview navigation | Fullscreen entry failure becomes skip | Distinguish environment unsupported from app regression; fail when the configured browser should support Fullscreen API ([tests](../../../e2e/local/ui-features.spec.ts#L610-L668)) |
| SPA detail-cycle bound | Allows three cycles to add three entries without proving per-cycle transitions | Assert each open/close length/state transition ([test](../../../e2e/local/browser-history.spec.ts#L413-L473)) |
| Phantom detail/seek restore | Accepts any anchor except one excluded image | Require elected anchor or deep offset plus painted visibility ([test](../../../e2e/local/browser-history.spec.ts#L1548-L1559)) |
| BFCache-named case | Playwright cannot reliably prove BFCache; test actually proves cross-origin storage plus restore/reload | Rename to its real lifecycle contract ([test](../../../e2e/local/browser-history.spec.ts#L1313-L1414)) |
| No-focus End | Only proves `scrollTop > 0` | Add end-of-buffer/result-position oracle while retaining null focus ([test](../../../e2e/local/keyboard-nav.spec.ts#L90-L106), [stronger End oracle](../../../e2e/local/scrubber.spec.ts#L1687-L1714)) |
| Keyboard row heights | Duplicated literals can drift | Import layout source of truth ([literals](../../../e2e/local/keyboard-nav.spec.ts#L25-L26), [owner](../../../src/constants/layout.ts#L12-L19)) |

### Selection And Optional UI

| Test/family | Problem | Stronger contract |
|---|---|---|
| Table field-cell routing | Can finish without finding a CQL cell | Require deterministic cell; exact query change and unchanged selected IDs ([test](../../../e2e/local/selections.spec.ts#L487-L551)) |
| Partial chip styling | Returns unless fixture happens to produce `chip-array` and partial value | Deterministic metadata; require `data-partial` ([test](../../../e2e/local/selections.spec.ts#L635-L684)) |
| Mobile StatusBar/FAB geometry | Nullable boxes skip placement assertion | Require non-null geometry; merge FAB presence/placement into retained clear journey ([tests](../../../e2e/local/selections-mobile.spec.ts#L161-L186), [237-L280](../../../e2e/local/selections-mobile.spec.ts#L237-L280)) |
| Leftmost selection column | Checks existence, not order | Assert first `columnheader` identity ([test](../../../e2e/local/selections.spec.ts#L297-L304)) |
| Multi-image metadata | Proves placeholder disappearance/count only | Assert one actual combined section/field ([test](../../../e2e/local/selections.spec.ts#L553-L578)) |
| Detail close selection | Reads immediately after async history close | Wait until `image` is absent, then compare exact IDs ([test](../../../e2e/local/selections.spec.ts#L881-L913)) |
| Reload/panel hydration | Accepts status bar as alternative to reconciled panel | Require exact IDs and a reconciled panel value ([test](../../../e2e/local/selections.spec.ts#L915-L940)) |
| Mobile long-press range | Adjacent target and `>=2` can pass as ordinary toggle | Target index 3+ and assert every intermediate identity ([test](../../../e2e/local/selections-mobile.spec.ts#L188-L212)) |
| Collections absent | Depends on ambient connection refusal | Explicitly fulfill collections endpoint with failure ([test](../../../e2e/local/collections.spec.ts#L226-L243)) |

## Similar Actions That Must Stay Distinct

- No-focus versus explicit-focus keyboard navigation enter different branches.
- Grid and table detail opening use different component event wiring.
- FullscreenPreview and ImageDetail fullscreen are separate state machines.
- Buffer, indexed-scroll, and seek interactions are not interchangeable merely
  because they end near the same ratio.
- Taken-on, Credit, Source, Width, sparse/null and ordinary date seeks choose
  different query algorithms.
- Grid-logo reset, keyboard Home, query clear, metadata search and browser Back
  all move position through different orchestration/history contracts.
- Selection sort-only, density-only, ticker, query, reload and Back paths encode
  intentionally different persistence/clear policy.
- Visual snapshots remain pixel/layout oracles and are not replaced by DOM
  assertions.
- CQL quoted-key reload remains because its historical regression crossed
  editor, router, URL, store and reload layers.

## Phase C Runtime Work: Complete

Phase C removed 8.3 seconds of fixed delay only where screenshot, generation,
reconciliation, URL, focus, scroll or DOM outcomes were equal or stronger. The
only deliberately deferred item is splitting density paint acknowledgment from
extension readiness across 47 habitual/tier call sites
([ledger](performance-harness-7-phase-c-ledger.md#deferred)). The bullets below
are the pre-C opportunity inventory, not pending instructions.

Static delay floors are not full runtime estimates, but they identify cheap
work after candidate deletion:

- The history/UI/keyboard/visual scope executes at least 29 worker-seconds of
  fixed delay. `toHaveScreenshot()` already waits for visual stability, so four
  visual sleeps (2.5s) are removable
  ([visual cases](../../../e2e/local/visual-baseline.spec.ts#L20-L53)).
- Typed-history includes 700ms beyond its now-generation-driven readiness
  ([test](../../../e2e/local/browser-history.spec.ts#L215-L253)).
- Keyboard tests contain synchronous sleeps where exact scroll/focus/generation
  outcomes are available.
- Seven scoped density switches pay the shared helper's 300ms plus 200ms extend
  readiness even when immediate extension is irrelevant
  ([helper](../../../e2e/shared/helpers.ts#L853-L901)). Split a painted-density
  acknowledgment from optional post-switch extension readiness rather than
  weakening all callers.
- Feature suites have a 9.35s fixed-delay floor, dominated by required 650ms
  long presses. Preserve gesture thresholds; remove redundant panel/sort waits
  only when observable outcomes replace them.
- Keep deliberate observation windows: reload-flood, deferred teleport, flash,
  and sort-paint windows are measuring time, not waiting blindly.

## Portfolio Budget

Current accepted baseline after evidence-preserving consolidation:

- **Habitual cases:** 206 after all accepted D elections.
- **Median wall time:** 4.5 minutes across the three D-Tier acceptance runs.
- **Guardrail:** no batch may add more than 10% median wall time without an
  explicit decision that its unique risk justifies the feedback cost.
- **New-test tax:** every addition must identify the current missing oracle and
  why unit/component coverage is insufficient. It need not delete one test
  mechanically, but additions should normally land with an offsetting election
  or measured budget.

Count remains secondary to wall time and failure quality. New Phase D owners
must justify their oracle and fit this measured baseline rather than target a
case-count range.

## Execution Status

1. **Strict elections:** complete; D-Wheel removed the final post-seek duplicate.
2. **Weak-oracle repairs:** complete.
3. **Conservative wait cleanup:** complete; density-helper split deferred.
4. **Smoke correctness election:** replaced by the narrower D-Credit,
  D-Direction and D-Center decisions in report 5.
5. **Forced-tier decision:** accepted one compact forced-seek owner after
  overlap removal and passing the report-5 reliability/runtime gates.
6. **Sunset:** pending those bounded decisions and zero-residue reference gates.

D-Zero subsequently removed three ownerless smoke diagnostics and the invalid
selection performance prototype. D-Wheel then removed the final strict
duplicate; 202/202 habitual cases passed in 4.4 minutes.

Report 5 now owns execution. A test failure must still be classified as wrong
implementation, wrong old test, or intentional contract change; never weaken
an assertion reflexively to recover green.

## Remaining Unknowns Requiring Runtime Evidence

- Whether one forced-seek case and second Vite server fit the 4m50s acceptance
  ceiling without flake or implementation-coupled geometry.
- D-Direction resolved the reverse/prepend question with a bounded rendered-
  cell global-rank observation across a confirmed prepend. It does not prove
  painted pixels.
- Whether exact missing-Credit End can be created with test-local data control,
  rather than new production fixture machinery.

Metadata, partial-chip, mobile geometry, fullscreen capability and weak history
contracts are no longer unknowns; Phase C made them deterministic. No deletion
waits for perfect knowledge. Each remaining unknown has an explicit
replacement-or-relinquishment branch in report 5.
