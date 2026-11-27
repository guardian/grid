# Performance Harness 7: Phase C Habitual E2E Ledger

## Purpose

Consolidate and strengthen the habitual Playwright suite without reducing unique
behavioral evidence. This ledger is the current execution state; the underlying
audit remains the rationale and source inventory.

## Rules

- Verify the elected stronger owner before deleting or merging a case.
- Stop an election if lifecycle, input path, regime, or oracle is distinct.
- Apply small domain batches; run affected specs after each batch.
- Run the full habitual suite before each commit.
- Do not weaken assertions to make a consolidation pass.
- Do not delete tier-dependent cases until their forced-tier replacement runs.
- Production and shared-helper changes belong to repair rows, not strict deletion batches.

## Progress

Baseline before Phase C: 236 habitual tests, 2 workers, approximately 5 minutes.

| Batch | Scope | Election | Status | Validation |
|---|---|---|---|---|
| C1 | Scroll/focus | Delete weaker deep-table Grid-logo reset | Complete | Strong transient stale-grid owner retained; affected owners 6/6 passed |
| C1 | Scroll/focus | Delete weaker explicit-grid double-click from phantom suite | Complete | Exact URL/render identity owner retained; affected owners 6/6 passed |
| C2 | History | Merge Back-after-sort into Back/Forward lifecycle | Complete | Restored URL and clean nonempty top buffer retained; owner 1/1 passed |
| C2 | History | Delete mislabeled focus-not-carried case | Complete | Snapshot-present and no-snapshot policy owners 2/2 passed |
| C2 | History | Delete shallow search-logo and mislabeled detail-logo cases | Complete | Focused reset/Back, exact detail-open and deep detail-reset owners 3/3 passed |
| C2 | History | Merge conditional metadata-history pair | Complete | Deterministic Credit control; exact one-push and decoded Back identity; 1/1 passed |
| C2 | History | Delete standalone kupuaKey replace/push checks | Complete | Cold key shape plus combined push/replace/Back owner 2/2 passed |
| C2 | History | Delete mislabeled default-to-filtered snapshot case | Complete | Stronger filtered-to-filtered focused restore owner 1/1 passed |
| C2 | History | Delete mislabeled shallow reload case | Complete | Stronger deep pagehide restoration owner 1/1 passed |
| C2 | History | Consolidate unconditional history duplicates | Complete | Nine browser cases removed or merged; full checkpoint passed at 227 before final two removals |
| C3 | UI/keyboard | Delete weaker status-count navigation | Complete | Exact URL/query/sort/count/error owner 1/1 passed |
| C3 | UI/keyboard | Merge Browse/Details pointer toggles | Complete | Independent left/right round trip plus keyboard owner 2/2 passed |
| C3 | UI/keyboard | Delete standalone FullscreenPreview ArrowRight | Complete | Exact Left then Right identity round trip owner 1/1 passed |
| C3 | UI/keyboard | Merge metadata/table click-to-search editability | Complete | Both trigger semantics plus one final real editor update; 1/1 passed |
| C3 | UI/keyboard | Delete duplicate CQL key-propagation cases | Complete | Autofocused no-focus owners plus horizontal trapping 3/3 passed |
| C3 | UI/keyboard | Merge focused ArrowDown/ArrowUp | Complete | Exact Down/Up identity round trip owner passed |
| C3 | UI/keyboard | Consolidate unconditional UI and keyboard duplicates | Complete | Five cases removed or merged |
| C4 | Selection | Delete one-image Clear subset | Complete | Two-image selection plus Clear/panel restoration owners 2/2 passed |
| C4 | Selection | Delete full-navigation sort persistence | Complete | Exact IDs moved to SPA sort owner; SPA sort/reload owners 2/2 passed |
| C4 | Selection | Delete reverse/no-anchor/second-range policy E2Es | Complete | Exact browser range owner 1/1; range/interpreter units 28/28 passed |
| C4 | Selection | Delete direct reconciliation-store E2Es | Complete | Visible panel owners 2/2; scheduling/chip units 92/92 passed |
| C4 | Selection | Delete standalone selection-count chip | Complete | Second-tickbox visible count owner 1/1 passed |
| C4 | Selection | Delete coarse-pointer attribute subset | Complete | Coarse StatusBar state/placement owner 1/1 passed |
| C4 | Selection | Remove unit/stronger-E2E subsets | Complete | Nine browser cases removed; conditional contract repairs deferred to C6 |
| C5 | Collections/toast/mobile | Delete standalone collection expand | Complete | Expand-visible then collapse-hidden owner 1/1 passed |
| C5 | Collections/toast/mobile | Move toast categories/stacking to component tests | Complete | Component owners 19/19; retained root-mount/dismiss E2E 1/1 passed |
| C5 | Collections/toast/mobile | Consolidate unconditional optional-UI duplicates | Complete | Six browser cases removed across C4/C5 optional UI |
| C6 | Repairs | Import keyboard row heights from production source | Complete | Relevant keyboard E2Es 4/4 passed; editor clean |
| C6 | Repairs | Clear accumulated TypeScript build errors | Complete | Six stale errors plus one exposed call-site mismatch fixed; full build passed |
| C6 | Repairs | Make rapid concurrent seeks genuinely concurrent | Complete | Three raw clicks before debounce; exactly one final generation at 10%; 1/1 passed |
| C6 | Repairs | Observe position-map invalidation before replacement | Complete | Sort and real SPA date-filter transitions 2/2 passed; filter no longer skips |
| C6 | Repairs | Tighten buffer transition recorder | Complete | Rejects any post-Home buffer mutation at nonzero offset; 1/1 passed |
| C6 | Repairs | Exercise query-reset race through real CQL | Complete | Exact URL/store/top settlement; no reload or fixed tail; 1/1 passed |
| C6 | Repairs | Make neighbor fallback deterministic | Complete | Exact first surviving neighbor focused, buffered and visible; 1/1 passed |
| C6 | Repairs | Strengthen no-ring viewport preservation | Complete | App-elected anchor remains visible/stable with null explicit focus; 1/1 passed |
| C6 | Repairs | Clarify table field-cell policy in selection mode | Complete | Search suppressed; deterministic Credit Shift-click performs exact row range and preserves query |
| C6 | Repairs | Make partial-chip panel coverage deterministic | Complete | Controlled metadata uses real fetch/reconcile path; exact full/partial chip DOM; 1/1 passed |
| C6 | Repairs | Make mobile long-press range identity-exact | Complete | Touchable endpoints avoid virtual overscan; exact three-ID range passed live on TEST |
| C6 | Repairs | Make mobile StatusBar/FAB geometry fail closed | Complete | Exact top/bottom-right boxes passed live; FAB appearance merged into clear lifecycle |
| C6 | Repairs | Make detail-close selection preservation exact | Complete | One close transition; URL and overlay settle before exact-ID comparison; live TEST passed |
| C6 | Repairs | Prove reload hydration beyond restored count | Complete | Exact IDs, reconciled store and rendered multi-image panel passed live on TEST |
| C6 | Repairs | Rename BFCache-overclaiming history case | Complete | Title now states cross-origin snapshot survival and exact anchor restoration |
| C6 | Repairs | Strengthen no-focus End position oracle | Complete | Seek generation, absolute end coverage, positive scroll and null focus passed live on TEST |
| C6 | Repairs | Force Collections graceful-absence path | Complete | Explicit 503; Collections hidden while Filters and core results remain visible; live TEST matched |
| C6 | Repairs | Make SPA detail-cycle history transitions exact | Complete | Each open/close stayed baseline+1 with matching detail state; three live TEST cycles passed |
| C6 | Repairs | Make phantom history mode setup deterministic | Complete | Exactly one writer per context; phantom and explicit branches passed 3/3 |
| C6 | Repairs | Make phantom detail/seek restore identity-exact | Complete | Exact elected anchor restored and painted; focused E2E passed 1/1 |
| C6 | Repairs | Make FullscreenPreview entry fail closed | Complete | Chromium capability explicit; entry and exact navigation passed 1/1 without skip |
| C6 | Repairs | Make phantom detail return identity-exact | Complete | Exact opened image painted after close with no ring; focused E2E passed 1/1 |
| C6 | Repairs | Make leftmost selection column order exact | Complete | First table columnheader is Selection; focused E2E passed |
| C6 | Repairs | Require real combined metadata field | Complete | Reconciled panel renders File type; focused E2E passed |
| C6 | Repairs | Strengthen remaining misleading or conditional contracts | Complete | Every named repair row resolved with focused validation |
| C7 | Runtime | Replace fixed waits only with equal or stronger observable outcomes | In progress | Begin with waits already dominated by state/generation/DOM oracles |
| C7 | Runtime | Remove screenshot/focus waits with stronger owners | Complete | 2.7s fixed delay removed; visual and typed-history owners passed 5/5 |
| C7 | Runtime | Remove synchronous keyboard waits | Complete | 1.4s fixed delay removed; exact key and Home owners passed 7/7 |
| C7 | Runtime | Replace deep Home/End waits with settlement | Complete | 2.5s fixed delay removed; generation and exact endpoint owners passed 2/2 |
| C7 | Runtime | Remove panel/navigation waits with stronger owners | Complete | 1.7s fixed delay removed; reconciliation/URL/focus/scroll owners passed 6/6 |
| C7 | Runtime | Replace fixed waits only with equal or stronger observable outcomes | Complete | Conservative cleanup complete; broad density-helper split deferred |
| C8 | Final | Full habitual validation and portfolio accounting | Complete | Build passed; E2E 203/203 in 4.4m; last proven units 1,288/1,288 (current runner emitted no evidence) |

Final habitual count: 203 (from 236 before Phase C).

Post-Phase-C D-Wheel checkpoint: the final strict duplicate was removed after
its retained owners passed 3/3 before and after deletion. Full habitual
validation passed 202/202 in 4.4 minutes with no failures or retries.

D-Credit checkpoint: one deterministic missing-Credit End owner was accepted
after its local-data assertion failed first, its targeted fixture passed, and
86/86 named store tests passed. Full habitual validation passed 203/203 in 4.3
minutes with no failures or retries.

D-Direction checkpoint: the existing grid reverse owner gained a bounded
rendered-cell global-rank sampler with an observed prepend positive control.
Five no-retry focused runs and full habitual 203/203 passed; runtime remained
4.4 minutes with no failures or retries. The evidence is DOM correctness only.

D-Center checkpoint: a shared usable-viewport helper strengthened grid return
placement and two table cases filled the missing destinations. Four owners each
passed five no-retry repetitions; full habitual passed 205/205 in 4.6 minutes
with no failures or retries.

D-Tier checkpoint: overlap review reduced the forced trial to unique midpoint
and exact End/Home evidence and removed an impossible position-map wait. The
compact case passed 5/5 without retry; three full runs passed 206/206 in 4.4m,
4.6m and 4.5m. Median 4.5m accepts the habitual forced-seek owner.

Final retirement checkpoint: smoke and tier-matrix sources, runners and configs
are deleted. Post-deletion habitual validation passed 206/206 in 4.5 minutes
without retry; full units remain 1,288/1,288 and perf harness 35/35.

Full habitual checkpoint after C1 and the first C2 elections: 227/227 passed
in 4.7 minutes.

Full habitual checkpoint after C1-C5 unconditional consolidation: 204/204
passed in 4.5 minutes.

Full habitual checkpoint after the first C6 repair batch: 204/204 passed in
4.4 minutes. Full build and 1,288 units also pass.

Focused C6 selection/mobile/history/UI batch: combined edited specs passed
75/76, with one deterministic viewport precondition repaired immediately;
the repaired full mobile spec then passed 5/5 with no retries.

Full habitual checkpoint after the second C6 repair batch: 203/203 passed in
4.4 minutes with no failures or retries.

Final post-C7 habitual checkpoint: 203/203 passed in 4.4 minutes with no
failures or retries. Full build passed. Unit runner returned exit 0 three times
without executing/reporting evidence; last proven baseline remains 1,288/1,288,
and all subsequent changes are E2E/docs only.

## Deferred

- D-Zero is complete: three ownerless smoke diagnostics and the invalid
	selection performance prototype were deleted without changing habitual or
	maintained performance ownership.
- Nine tier-dependent elections remain blocked on a real forced-tier replacement cadence.
- Smoke and tier retirement require their own extraction gates.
- Density-switch paint/extension helper split spans 47 call sites and needs a dedicated migration.
- New performance coverage and P8 optimization are separate work after habitual consolidation.
