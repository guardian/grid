# Performance Harness Improvement Workplan

**Status:** Phases A-E complete, 11 September 2026  
**Destination:** better habitual E2E and better `e2e-perf`  
**Method:** one evidence-preserving slice at a time; no permanent third browser suite

## Destination

This project has exactly two maintained browser-test outcomes:

| Destination | Job | Constraint |
|---|---|---|
| **Habitual local E2E** | Fast, deterministic correctness feedback developers actually run | Roughly five minutes; every case owns a distinct observable contract |
| **Purpose-driven `e2e-perf`** | Stable, comparable evidence for user-visible performance changes | Fixed scenarios, complete runs, honest visual boundaries and environment fingerprints |

Shared helpers are enabling infrastructure. Smoke and three-tier tests are
migration sources. Neither is a third destination. When their elected evidence
has moved or been explicitly relinquished, their specs, runners and configs go
away.

## Inputs

Read these in order:

1. [Interaction catalogue](performance-harness-1-interaction-catalogue.md) - what users can meaningfully do.
2. [Measurement validity audit](performance-harness-2-validity-audit.md) - what current perf rows actually prove.
3. [Coverage and retirement plan](performance-harness-3-coverage-and-retirement-plan.md) - what moves where and deletion gates.
4. [Habitual E2E audit](performance-harness-4-habitual-e2e-consolidation-audit.md) - all 236 cases, elections and repairs.
5. This workplan - how to execute repeatedly without reopening the whole audit.

The reports are evidence ledgers. Update an affected row when implementation
changes its status; do not rewrite the project history into this workplan.

## Fresh Agent Start Here

Planning and source audit are complete. Do not begin with another broad audit,
a bulk E2E deletion, or a new perf scenario.

Phases A-C are complete. Performance evidence now fails closed, the existing
portfolio has a fresh trustworthy baseline, and habitual E2E has been
consolidated and strengthened. The next phase is D; do not reopen completed
audit elections without new evidence.

### A1 Contract

Refactor only enough of `e2e-perf/run-audit.mjs` to make these decisions
unit-testable without launching Playwright:

1. A nonzero Playwright child exit rejects the run.
2. A malformed nonblank JSONL metric row rejects the run and names the source
    file/line; it is never silently dropped.
3. Rejection happens before JSON, JS or Markdown history is written.
4. Valid rows and exit code zero retain current aggregation/output behavior.
5. Apply the same contract to jank, short perceived and long perceived paths.

Implemented in `e2e-perf/harness-validation.mjs`, with focused pure Node tests
in `e2e-perf/harness-validation.test.mjs` and the `test:perf-harness` script.
`run-audit.mjs` uses the same successful-child/strict-JSONL operation for jank,
short perceived and long perceived repetitions before aggregation or history
writes. The failing-first run proved both missing exceptions; final focused
validation passed 5/5 without launching Playwright.

A1 deliberately does **not** solve expected-ID manifests, repetitions,
environment fingerprints or atomic multi-file writes. Those are subsequent
small slices:

- **A2 (complete):** exact expected IDs,
  duplicate/missing rows and repetition counts. Explicit manifests account for
   the original 32 jank, 14 short perceived and 8 long perceived IDs; the
   maintained jank manifest now has 30 after P10/P12 removal. Every repetition
  must contain each selected ID exactly once before aggregation; new summaries
   persist and display per-metric `sampleCount`. A direct-ES TEST dry run of P5
   over two repetitions captured exactly P5a/P5b/P5c each time, displayed
   `Samples = 2`, and changed no history file.
- **A3 (complete):** verified run-environment fingerprint: requested/observed
   adapter mode, app origin, browser/version, OS/architecture, viewport/screen,
   effective DPR, headed state, CPU throttle, cache class, workers, cutoff, git
   state and Kupua dirty-state hash. Repetitions must match exactly. Per-metric
   scenario revision, settled total/tier and actual operation routes remain
   explicitly owned by A5/G7 because one journey can cross regimes/routes.
- **A4 (complete):** malformed existing JSON fails closed. All selected
   JSON/JS/Markdown siblings are staged before replacement; runtime failure
   rolls every sibling back, including removal of newly created files. POSIX
   cannot atomically rename multiple independent filenames across a process
   crash, so this is an honest rollback-safe transaction, not an impossible
   single-syscall guarantee.
- **A5 (complete):** PP4 proved the
   protocol: one interaction ID, exact required phases, `t_store_ready`, first
   visible focused-cell frame, two-frame visual settlement, scenario revision,
   settled total/regime and sanitized route categories. All rows were resolved
   deliberately by observable contract; the completed portfolio is tracked in
   [the A5 migration ledger](performance-harness-6-a5-migration-ledger.md).
   Twenty-one user-action rows are complete; PP10 is retained as a separately
   displayed background diagnostic with no user-action target.
   Post-migration cleanup removed optimistic producer completion marks and both
   temporal-adjacency calculators. Correlated metrics remain the only live
   calculator. Revision-2 output now uses explicit boundary fields only;
   historical aliases remain separately labeled legacy dashboard evidence.

Phase A's pure harness validation remains the default check for runner/schema
changes. Do not launch Playwright merely to prove a pure validation function;
targeted dry runs remain user-controlled under the TEST/port protocol.

### Decisions Fresh Agents Must Not Guess

- Phase C completed at 203/203 in 4.4 minutes. After all accepted D elections,
   the maintained habitual portfolio is 206/206 with a 4.5-minute median.
- The current portfolio budget is the measured 203-case/4.4-minute baseline and
   a 10% median wall-time guardrail. Oracle ownership and wall time outrank
   count; the old 205-215 estimate is retired.
- A1-A5 are complete and a fresh baseline exists. Take another named baseline
   only when a concrete comparison requires it; historical rows remain
   characterization evidence under their original fingerprints.
- Historical comparability must not constrain measurement improvement. After
   A1-A5 and scenario stabilization, prefer a fresh baseline; archive or
   discard legacy logs. Dashboard-only legacy normalization is optional and
   must never block correcting DPR, headedness, scenarios or boundaries.
- Dashboard follow-up: jank control changes currently destroy and recreate all
   Chart.js cards and can take >10s with the full historical log. Optimize the
   chart update lifecycle during jank stabilization; dashboard correctness and
   phone-width layout are already repaired.
- Maintained jank, short perceived and long perceived suites use the same
   laptop-fitting `1720x960 @2` headed profile. The jank reset from legacy
   `1987x1110` is intentional; do not compare pre-reset jank rows to new runs.
- Do not run smoke or tier suites as routine validation. They are migration
   sources scheduled for retirement.
- Scrubber-track wheel is input continuity, not a distinct semantic scroll
   path. Retain one forwarding regression and elect the post-seek duplicate for
   deletion; all tier-specific behavior belongs to ordinary content scrolling.
- Do not collapse FullscreenPreview and ImageDetail fullscreen; they have
   different owners, entry routes and exit destinations.
- Do not revert unrelated dirty or untracked Kupua work. Inspect the current
   worktree before every slice and edit around user changes.

## Helper Strategy

The shared-helper goal is semantic precision, not a larger convenience API.
A helper should name the state it proves. Add it only when at least two elected
callers need the same contract, or one high-risk contract spans habitual and
perf surfaces.

### Reuse Now

| Helper | Safe contract | Use for |
|---|---|---|
| `waitForStableNthImageId()` + `focusNthItem()` | Stable virtualized identity, explicit-mode click, exact store focus | Replace direct ordinal focus/detail setup; preserve its virtualizer workaround ([helper](../../../e2e/shared/helpers.ts#L48-L79), [focus](../../../e2e/shared/helpers.ts#L948-L1015)) |
| `selectSort()` / `toggleSortDirection()` | Canonical sort changed and target store operation settled | Toolbar sort tests that currently sleep/poll results ([helpers](../../../e2e/shared/helpers.ts#L784-L845)) |
| `waitForBackwardPrepend()` | Prepend generation advanced, offset decreased, fetch ended | Backward-scroll tests whose promised event is prepend ([helper](../../../e2e/shared/helpers.ts#L1041-L1062)) |
| Detail helper family | Stable identity; URL and rendered detail agree; close removes route and overlay | Replace URL-only and `.nth()` detail journeys ([helpers](../../../e2e/shared/helpers.ts#L1192-L1312)) |
| `isFocusedCellVisible()` and focused top/left readers | Painted DOM intersection or relative geometry | Replace row-height estimates where visibility/placement is the oracle ([helpers](../../../e2e/shared/helpers.ts#L219-L274)) |
| Local `waitForSelectionPersisted()` | Exact selected ID set reached session storage | Promote only if a second persistence caller needs it; meanwhile keep selection-local ([selection helper](../../../e2e/local/selections.spec.ts#L41-L53)) |

Do not substitute these across contract boundaries. `waitForResults()` is only
visible-DOM readiness; `waitForSeekComplete()` can see old idle data;
`waitForSortAroundFocus()` has no start-generation or paint condition; waited
detail traversal must not replace rapid traversal; rAF sampling is an
observation window, not readiness.

### Fix Or Replace Before Broad Migration

| Current helper | Required direction |
|---|---|
| `goto*()` + `waitForResults()` | Separate structured navigation from `waitForVisibleResult`; stable navigation must require cutoff, lifecycle settlement, requested context, no error, then visible content when nonempty |
| `waitForSeekComplete()` / generation waits / `seekTo()` / `dragScrubberTo()` | Return a typed outcome `{ regime, didSeek, generation, achievedRatio }`; require no error; requested map/generation/visible-content conditions fail rather than being swallowed |
| `clickScrubberAt()` | Delete. Semantic tests use `seekTo`; the one rapid-supersession regression keeps raw no-wait coordinate clicks inline |
| `isScrollMode()` / `waitForScrollMode()` | Rename to full-buffer materialization; “scroll mode” also includes indexed scrolling |
| `isTwoTierMode()` and copied thresholds | Replace with one app-owned scrubber-regime signal so forced Vite thresholds cannot disagree with tests |
| `switchToGrid/Table()` + `waitForExtendReady()` | Replace with `setDensity(target)` that proves URL/container transition and two painted frames; extension readiness remains an explicit caller concern |
| `ensureExplicitMode()` / `ensurePhantomMode()` | Replace with one per-page pre-navigation mode setter; repeated same mode is idempotent, conflicting mode writers throw |
| `getFirstVisibleImageId()` | Rename to `getFirstBufferImageId()`; it returns buffer identity, not DOM visibility |
| Numeric/required readers | Throw when required UI/value is absent or malformed; do not manufacture zero/false/empty samples |
| `scrollBy()` / PageUp/Down / capacity drivers | Return actual before/after outcome and poll named progress; keep capacity loops local to their sole scenario |
| Perf `waitForStoreSettled()` copies | Replace with causal search/seek/fullscreen/trace contracts; global idle is not operation identity |
| Metric emitters and runner | Fail closed; require complete expected IDs/repetitions before writing any history |

### Add When First Needed

| Missing contract | Definition | First likely slice |
|---|---|---|
| `runAndWaitForSearch(action, expected)` | Capture lifecycle generation, trigger, require newer matching settled generation, no error and visible content when nonempty | Promote proven browser-history logic; migrate one search-changing family ([template](../../../e2e/local/browser-history.spec.ts#L61-L108)) |
| `getScrubberInteractionRegime()` | App-owned `buffer-scroll`, `indexed-scroll` or `seek`; independent of map readiness | Seek-helper repair and forced-tier replacement |
| `getUsableViewportSnapshot(target?)` | Active viewport below sticky header; intersecting centre election; target visibility and signed geometry | Focus repair, P4/P6, centering migration |
| `recordPerceivedAction(expectedAction, trigger)` | Clear trace, require exactly one correlated `t_0`, await correlated phases, return raw entries; missing/duplicate phases fail | Perf correlation foundation, then JB2/JB3 |
| `waitForFullscreenState(surface, state, expected?)` | Distinguish FullscreenPreview/list destination from ImageDetail fullscreen/detail destination | P15 and JB5 stabilization |
| `waitForDecodedImage(surface, expected)` | Identity-scoped visible image is complete, decoded and unchanged, then one rAF; explicitly not “painted” | P13/P15 setup and optional detail diagnostics |

### Keep Deliberately Local

Do not turn every low-level operation into a shared helper:

- rapid scrubber no-wait clicks;
- rAF scroll/flash/skeleton samplers;
- P14 traversal cadence and `t_stop` timing;
- synthetic rAF versus real-wheel drivers;
- 650ms long-press stimulus;
- fixed windows that intentionally collect late frames.

Their mechanism and duration define the scenario. Generalizing them would hide
the very variable the test is meant to measure.

## The Repeatable Slice Loop

Every implementation session uses the same nine steps. The reports decide what
slice to choose; this loop decides how to execute it.

1. **Choose one destination and one claim.** Example: “JB3 compares one fixed
   exclusion” or “these two E2Es prove the same oracle.” Do not combine perf
   stabilization, helper redesign and smoke deletion in one slice.
2. **Name the current owner and replacement.** Cite the exact old tests/metric
   IDs, observable oracle, result regime, modality and lifecycle. Identify
   existing tests that assert the old behavior before editing.
3. **Freeze the local baseline.** Record selected case count, known result,
   effective environment and current full habitual runtime when relevant.
   Historical perf rows are never silently reinterpreted.
4. **Elect the smallest helper contract.** Reuse a sound helper; repair one
   ambiguous helper only with all affected callers in view; add a helper only
   under the reuse rule above. Keep deliberate probes local.
5. **Write the discriminating check first.** A replacement test must fail or
   distinguish the missing/wrong contract before the old owner is removed. If
   closer reading shows the claimed gap/duplication is false, stop the slice.
6. **Make one reversible edit.** Migrate one caller family, stabilize one perf
   scenario, or perform one election. No opportunistic neighboring cleanup.
7. **Validate narrowly, then fully.** Run the affected test/file first. For
   habitual E2E changes, run the complete habitual surface before accepting the
   election. For perf changes, the user runs targeted dry-run characterization;
   no named baseline is written until reliability/stability gates pass.
8. **Compare evidence and budget.** Check behavior, case/metric completeness,
   runtime, flake shape, scenario fingerprint and route/tier identity. A failure
   is classified as implementation defect, wrong old test, or deliberate
   contract change; never weaken an assertion merely to recover green.
9. **Retire and record.** Delete the old owner only after replacement proof.
   Update the affected report rows, runtime/count ledger and references. Leave
   source suites in place when their elected replacement has not actually run.

## Validation By Destination

### Habitual E2E Slice

1. Focused changed spec(s).
2. Full habitual E2E with the same two-worker configuration.
3. Unit suite as required for any `src/` change.
4. Record concrete case count, pass count and wall time against the five-minute
   baseline.

Before any Playwright run, follow the repository rule: warn that port 3000 must
be free and wait for confirmation. Run through `npm --prefix kupua run ...` and
stream through bare `tee`; never run tier/smoke as incidental validation.

### `e2e-perf` Slice

The agent edits and prepares the exact command; the user runs purpose-driven
perf campaigns against TEST.

1. Static/unit validation for runner/aggregation code where possible.
2. One targeted dry run proving expected IDs, raw repetitions, boundaries and
   fingerprint. It writes no history.
3. Seven repetitions for median + MAD characterization after the scenario is
   stable.
4. At least 20 independent repetitions before publishing a p95 threshold.
5. Named baseline only when all repetitions are complete and fingerprints
   match exactly.

Direct ES and media-api are separate fingerprints. Never aggregate across
different routes, tiers, controls, cache classes or settlement definitions.

## Execution Order

### Phase A: Make Perf Evidence Fail Closed

1. **A1 (complete):** honor child exit codes and reject malformed metric rows before writes.
2. **A2 (complete):** reject missing/duplicate IDs and incomplete repetitions.
3. **A3 (complete):** verify and persist the stable run environment; A5/G7 owns per-metric route/tier identity.
4. **A4 (complete):** reject invalid existing logs and transactionally stage/rollback all selected history siblings.
5. **A5 (complete):** all 21 user-action rows use correlated store-ready,
   first-visible-frame and visual-settled/native boundaries as applicable;
   PP10 is retained as a separately displayed background diagnostic.

No new named baseline before Phase A completes.

### Phase B: Stabilize Existing Perf Portfolio

1. **JB3 complete.** Uses one exact authored facet and invalidates historical comparisons.
2. **JB2 complete.** Uses a fixed anchor and matched no-anchor control.
3. **P14 complete; P14d retained as core.** Cadences now use
   fresh contexts, strict in-memory sequence commits, landing from `t_stop`, and
   sanitized raw CLS attribution. Seven TEST repetitions showed distinct P14d
   intermediate-render, landing and CLS behavior relative to P14b.
4. **P12 removed.** Uploaded duplicated P2; an exact Credit-sort replacement
   moved content but failed to reach eviction on TEST, falsifying its distinct
   extension/eviction premise. The unmeasured density tail was also removed.
5. **P10 removed.** The persisted composite summed five unrelated windows with
   fabricated zero frame/p95 context. P1/P2/P3/P4/P6 remain stronger owners.
6. **Historical pruning and fresh baseline complete.** Retired and replaced
   metric IDs were removed transactionally, both dashboards were reopened, and
   a four-run direct-ES baseline was captured.
7. **P13 complete.** Entry ends at
   decoded stable detail identity; exit ends at a visible stable focused list
   destination with signed placement diagnostics.
8. **P15 complete.** ImageDetail
   fullscreen entry/traversal/exit use native state plus decoded stable identity
   boundaries and remain distinct from JB5 FullscreenPreview exit-to-list.
9. **P16 complete.** Missing controls
   fail closed; drag and auto-fit rows end at stable observed width changes and
   persist signed deltas.
10. **P5c complete.** Measures one
   left-panel close while right remains open; right close is unmeasured cleanup.
11. **P7 complete.** Jank window ends
   at final pointermove before release; PP7b owns release-to-settled latency.
12. **P1 complete.** A pre-navigation init script captures cold bootstrap through
   visible results plus two frames and retains navigation/paint milestones.
13. **Historical pruning and dashboard smoke complete.** A manifest-driven,
   rollback-capable transaction removed retired and pre-revision-2 replaced
   jank rows plus empty campaign shells; both dashboards load and render cleanly.
   Fresh four-run direct-ES baseline and substantive dashboard analysis are
   complete. P8 table scroll is the clear next optimization target; P11@60's
   isolated max-frame spike remains monitor-only evidence.

### Phase C: Consolidate Habitual E2E

1. **Unconditional elections complete.** Applied in small domain batches with
   stronger owners validated before each removal or merge.
2. **Conditional and misleading test repairs complete.** Browser contracts now
   fail closed around selection, history, fullscreen, keyboard, mobile geometry
   and graceful API absence.
3. **Search-changing caller repairs complete.** Real CQL/router transitions and
   generation-aware settlement replace reload-based or stale-idle assertions.
4. **Density, seek, mode, required-reader and geometry repairs complete.** The
   broad density-switch helper split is deliberately deferred: its extension
   cooldown contract spans 47 habitual/tier call sites and needs a dedicated
   migration.
5. **Conservative fixed-wait cleanup complete.** Equal or stronger screenshot,
   reconciliation, URL, focus, scroll and generation outcomes replaced 8.3
   seconds of blind delay; deliberate observation windows remain.

Phase C reduced habitual E2E from 236 to 203 cases. Final validation passed
203/203 in 4.4 minutes with no failures or retries, within the five-minute
budget. Full build passed; the last evidenced unit baseline is 1,288/1,288.

### Phase D: Elect Legacy Residue

This document change is planning only. It modifies no code, specs, configs,
worklog or changelog and runs no browser or TEST surface. The implementation
slices below name future file scopes and validation; those future sessions must
maintain the worklog and changelog under the repository directives.

#### D0: Research Gate And Premise Reset

**Section 0 conclusion: continue.** The two maintained browser outcomes remain
justified. Habitual E2E is a two-worker local correctness surface that excludes
the tier matrices; `e2e-perf` is a one-worker, headed, fail-closed measurement
surface with expected-ID and fingerprint contracts
([habitual config](../../../playwright.config.ts#L23-L46),
[perf config](../../../e2e-perf/playwright.perf.config.ts#L25-L54),
[harness validation](../../../e2e-perf/harness-validation.mjs#L1-L113)). Result
regime is a variation axis inside those jobs, not a third job. Smoke and tier
remain temporary source material only.

The post-Phase-C baseline is 203/203 habitual cases in 4.4 minutes with no
failure or retry ([Phase C ledger](performance-harness-7-phase-c-ledger.md#L83-L105)).
The legacy estate is larger and less coherent than the old summaries imply:

- the smoke config expands to 65 cases across nine specs, while the menu runner
  exposes only 29 cases from two specs
  ([smoke match](../../../playwright.smoke.config.ts#L17-L20),
  [menu sources](../../../scripts/run-smoke.mjs#L44-L69));
- the tier command selects 18 correctness and four drift/flash cases across
  three projects, or 66 project-cases
  ([tier selection](../../../playwright.tiers.config.ts#L31-L54));
- none of those cases is part of the habitual 203
  ([habitual exclusions](../../../playwright.config.ts#L23-L28)).

Old premises are classified as follows. **Confirmed** means a decision-relevant
gap remains, not that the old test deserves preservation. **Superseded** means
equal or stronger maintained evidence now owns the claim. **False** means the
old case did not assert the named behavior or the proposed destination would
not produce valid evidence.

| Old premise | Classification | Current decision |
|---|---|---|
| Every elected smoke row needs a replacement | **False.** Most cases are duplicates, warning-only diagnostics or combinations of independently owned behavior. | Delete by explicit no-value election; do not recreate the old estate. |
| S5 missing-Credit End needs a browser owner | **Confirmed and accepted.** Generic End remains exact; D-Credit now creates a deterministic missing-value tail only for the real reverse End response. | Retain the local keyboard owner plus exact sparse/null store tests; S5 is released. |
| S9 density after multiple evictions is unique | **False.** Its eviction precondition is warning-only; density and eviction are already owned separately ([legacy case](../../../e2e/smoke/manual-smoke-test.spec.ts#L319-L454), [density owner](../../../e2e/local/scrubber.spec.ts#L901-L927), [eviction owner](../../../e2e/local/scrubber.spec.ts#L1930-L1962)). | Relinquish the combinatorial permutation. |
| S11 sparse Last Modified requires browser extraction | **False as a browser requirement.** Its null-zone verdict is conditional; exact sparse/null cursor behavior is lower-layer owned ([legacy case](../../../e2e/smoke/manual-smoke-test.spec.ts#L628-L725), [store evidence](../../../src/stores/search-store-extended.test.ts#L819-L1078)). | Retain unit plus generic browser ownership; no new browser fixture. |
| S26 owns unique reverse/prepend behavior | **Confirmed, narrowed.** Habitual E2E owns prepend completion, but not a bounded wrong-direction DOM/geometry observation tied to that prepend ([legacy reverse](../../../e2e/smoke/smoke-scroll-stability.spec.ts#L1714-L1909), [habitual owner](../../../e2e/local/scrubber.spec.ts#L350-L397)). | Re-elect one local directional assertion only if it can distinguish real reversal from compensation; consider reverse jank separately. |
| S27 requires indexed skeleton metrics | **Superseded.** JB4 already measures time to real stable indexed content, while local T3 owns eventual non-placeholder correctness ([JB4](../../../e2e-perf/perceived-long.spec.ts#L300-L349), [local owner](../../../e2e/local/scrubber.spec.ts#L2593-L2615)). | Delete the sampler without replacement. |
| T1 and T7-T12 still need focus extraction | **Superseded or false after Phase C.** Exact no-ring anchoring, neighbour fallback and history owners now fail closed; the remaining combinations have conditional or weaker outcomes ([focus owners](../../../e2e/local/focus-preservation.spec.ts#L120-L196), [no-ring owner](../../../e2e/local/focus-preservation.spec.ts#L340-L407), [legacy T7-T12](../../../e2e/smoke/focus-preservation-smoke.spec.ts#L795-L1184)). | Delete without adding combinatorial E2E cases. |
| Three return-centering diagnostics own useful correctness | **Confirmed, narrowed.** Existing owners prove lifecycle/identity but not every list destination's signed usable-viewport placement ([legacy cases](../../../e2e/smoke/centering-diag.spec.ts#L80-L193), [current fullscreen owner](../../../e2e/local/ui-features.spec.ts#L543-L598)). | Strengthen current return journeys; add at most the missing table variants. |
| Four contracts must be repeated through all three forced projects | **False.** Natural buffer/indexed owners already run habitually; only the forced local seek implementation lacks cadence. The old matrix also infers tier from project name ([matrix inference](../../../e2e/local/tier-matrix.spec.ts#L27-L36)). | Trial one forced-seek journey against the app-owned regime signal. |
| E1-E5 are all mandatory extraction work | **False.** Only E1 has a near-term existing-scenario option; E2 is superseded, E3's DOM sampler is not a paint oracle, E4 lacks a valid user-level scenario, and E5 is a real but optional future gap. | Apply the D-Perf election below; no legacy technique blocks deletion merely because it is elaborate. |

The complete smoke claim disposition is deliberately finite:

| Smoke source claims | Classification and owner | Disposition |
|---|---|---|
| Manual S1-S4, S6-S8, S10 | **Superseded** by exact local seek, Home, direction and density owners; S3/S10's machine wall-clock gates are not correctness evidence ([manual cases](../../../e2e/smoke/manual-smoke-test.spec.ts#L102-L197), [remaining cases](../../../e2e/smoke/manual-smoke-test.spec.ts#L223-L317), [S10](../../../e2e/smoke/manual-smoke-test.spec.ts#L456-L626)). | Delete with no replacement. |
| Manual S5 | **Confirmed; accepted in D-Credit** with a targeted local missing-tail fixture. | Retain the local keyboard owner; S5 no longer blocks smoke deletion. |
| Manual S9/S11 | **False** as combined/browser extraction premises. | Relinquish; retain constituent local/unit owners. |
| Scroll S12/S13/S17/S22/S24/S25 | **Superseded** by exact seek, alignment, prepend and cold-seek owners ([source](../../../e2e/smoke/smoke-scroll-stability.spec.ts#L327-L464), [source](../../../e2e/smoke/smoke-scroll-stability.spec.ts#L619-L679), [source](../../../e2e/smoke/smoke-scroll-stability.spec.ts#L1099-L1206), [source](../../../e2e/smoke/smoke-scroll-stability.spec.ts#L1437-L1712)). | Delete; do not preserve ratio sweeps. |
| Scroll S14-S16, S18-S21, S23 | **False** as named oracles: their swimming, stability, accuracy or shift verdicts are report-only or warning-only ([source](../../../e2e/smoke/smoke-scroll-stability.spec.ts#L466-L617), [source](../../../e2e/smoke/smoke-scroll-stability.spec.ts#L681-L1097), [source](../../../e2e/smoke/smoke-scroll-stability.spec.ts#L1208-L1435)). | Delete with no replacement. |
| Scroll S26a/b | **Confirmed, narrowed** to one bounded local reverse/prepend correctness check and one optional reverse-P8 measurement decision. | D-Direction and D-Perf; either may explicitly relinquish its own evidence class. |
| Scroll S27a/b | **Superseded** for user latency and correctness; its soft internal counters are not standing metrics. | Delete after reference cleanup; no E2 extraction. |
| Focus T1-T5/T7 | **Superseded** by Phase C owners with exact identity, painted visibility or lifecycle assertions ([source](../../../e2e/smoke/focus-preservation-smoke.spec.ts#L180-L687), [T7](../../../e2e/smoke/focus-preservation-smoke.spec.ts#L795-L885)). | Delete with no replacement. |
| Focus T6/T9-T12 | **False** because the named result is unasserted, conditional or weaker than the constituent owners ([source](../../../e2e/smoke/focus-preservation-smoke.spec.ts#L689-L793), [source](../../../e2e/smoke/focus-preservation-smoke.spec.ts#L952-L1184)). | Delete and record no-value election. |
| Focus T8/T10 panel combinations | **Superseded** by separate exact panel and anchor owners; the combination adds no policy. | Delete; no Cartesian-product replacement. |
| Centering DIAG 1-3 | **Confirmed, narrowed** to exact identity plus signed placement after list return. | D-Center. |
| History, Home-logo and phantom-drift diagnostics | **Superseded or false** after Phase C; results were duplicated or informational. | Deleted in D-Zero; maintained history, reset and focus owners remain. |
| Cited scenarios, flash measurement and drift/flash matrix | **False** as persisted performance evidence: they sample DOM state rather than presented pixels and use unstable rank/region comparisons ([probe](../../../e2e/shared/drift-flash-probes.ts#L383-L508), [classification](../../../e2e/shared/drift-flash-probes.ts#L622-L690)). | Delete; retain issue-specific correctness guards, not the generic probe. |

#### D-Zero: Safe Zero-Residue Deletion

**Status: complete, 11 September 2026.** The three diagnostics and selection
prototype were deleted, perf discovery now selects only `perf.spec.ts`, and the
35-test pure harness check retained all 52 maintained metric IDs. Habitual
remains 203 cases; no browser campaign was required.

| Field | Contract |
|---|---|
| **Decision served** | Remove files that own no elected correctness or performance evidence before spending effort on genuine gaps. This slice changes no maintained browser owner. |
| **Exact files in scope** | Delete `e2e/smoke/history-diag.spec.ts`, `e2e/smoke/home-logo-diag.spec.ts`, `e2e/smoke/phantom-drift-diag.spec.ts` and `e2e-perf/selection-stress.spec.ts`; remove `selection-stress.spec.ts` from `e2e-perf/playwright.perf.config.ts`; update their direct live entries in `e2e/README.md`, `AGENTS.md`, `exploration/docs/performance-harness-2-validity-audit.md`, `exploration/docs/performance-harness-3-coverage-and-retirement-plan.md`, `exploration/docs/performance-harness-4-habitual-e2e-consolidation-audit.md`, `exploration/docs/performance-harness-5-workplan.md`, `exploration/docs/performance-harness-7-phase-c-ledger.md` and `exploration/docs/changelog.md`. |
| **Evidence currently owned** | Metadata/history is exact in the merged history journey; Home transient state is exact in buffer-corruption; phantom departure/return is exact in history/focus; selection behavior and reconciliation are local/unit owned ([history](../../../e2e/local/browser-history.spec.ts#L647-L697), [Home](../../../e2e/local/buffer-corruption.spec.ts#L324-L390), [phantom](../../../e2e/local/browser-history.spec.ts#L1160-L1448), [selection](../../../e2e/local/selections.spec.ts#L309-L770)). |
| **Missing oracle** | None. The deleted selection prototype directly mutated store state and contained a placeholder out-of-buffer case, so repairing it would have been new measurement design rather than preservation. |
| **Implementation shape** | Delete sources and only their direct operational references. Do not copy report writers, sleeps, console tables or probe helpers. Preserve historical changelog and `zz Archive` entries; append the current implementation entry required by repository policy. |
| **Deletion gate** | Zero live operational references to the four deleted files and diagnostic titles, excluding changelog/archive; maintained perf manifests remain unchanged. |
| **Focused validation** | Run `test:perf-harness`; inspect package/config match patterns and run zero-reference searches to prove the four files are no longer selected. |
| **Full validation** | Repeat the complete non-browser harness/config validation after documentation cleanup. No habitual, smoke, tier or perf browser run is required because no maintained browser owner changed. |
| **Stop/push-back** | Stop if any deleted diagnostic is found to contain a hard assertion not represented by the cited owner, or if `selection-stress` has entered a maintained manifest. Do not invent a replacement to keep deletion moving. |
| **Expected effect** | Habitual remains 203; maintained perf metric count and audit runtime remain unchanged; six non-reportable selection prototype cases and three direct-only diagnostics disappear from discovery. |

#### D-Wheel: Close The Remaining Phase C Election

**Status: complete, 11 September 2026.** The retained track-forwarding and
grid/table post-seek content owners passed 3/3 without retry both before and
after deletion. The full habitual suite passed 202/202 in 4.4 minutes with no
failures or retries.

| Field | Contract |
|---|---|
| **Decision served** | Remove one strict habitual duplicate while retaining the distinct scrubber-track input adapter and ordinary post-seek content scrolling. |
| **Exact files in scope** | Delete only `wheel scroll works after a scrubber seek` from `e2e/local/scrubber.spec.ts`; update its current-status entries in `exploration/docs/performance-harness-4-habitual-e2e-consolidation-audit.md`, `exploration/docs/performance-harness-5-workplan.md`, `exploration/docs/performance-harness-7-phase-c-ledger.md`, `exploration/docs/worklog-current.md` and `exploration/docs/changelog.md`. |
| **Evidence currently owned** | One track-wheel case proves the 14px forwarding adapter changes the active content container; separate grid/table content-wheel cases prove ordinary scrolling after seek ([track owner](../../../e2e/local/scrubber.spec.ts#L1546-L1566), [content owners](../../../e2e/local/scrubber.spec.ts#L1613-L1644)). |
| **Missing oracle** | None. The duplicate uses settled high-level `seekTo()` before wheeling and therefore does not observe a transient post-seek condition ([candidate](../../../e2e/local/scrubber.spec.ts#L1568-L1594)). |
| **Implementation shape** | Delete one test only. Do not merge its setup into the forwarding owner or broaden wheel-over-track into a semantic interaction family. |
| **Deletion gate** | Track-wheel and both content-wheel owners retain their current assertions and pass; no report continues to call the deleted case an owner. |
| **Focused validation** | Run the three retained wheel/content owners without retry. |
| **Full validation** | Full habitual E2E with the same two-worker configuration. |
| **Stop/push-back** | Stop if the candidate reaches a different lifecycle or downstream branch on current source, or if a retained owner fails before deletion. |
| **Expected effect** | Realized: habitual 203 -> 202 cases and remained at 4.4 minutes; all performance and dormant-source counts remain unchanged. |

#### D-Credit: Re-Elect Missing-Value End Correctness

**Status: accepted, 11 September 2026.** A failing-first local case proved the
sample tail was populated, then a test-local wrapper preserved real ES requests
and removed Credit only from the unique reverse seek-to-end response. The case
requires that branch, exact end coverage, missing Credit throughout the tail,
the final painted identity and null focus. Focused browser passed 1/1, named
store owners passed 86/86, and full habitual passed 203/203 in 4.3 minutes with
no failures or retries.

| Field | Contract |
|---|---|
| **Decision served** | Decide whether browser wiring for End on a missing-Credit tail is valuable enough to justify a deterministic local data condition. |
| **Exact files in scope** | `e2e/local/keyboard-nav.spec.ts`, `e2e/smoke/manual-smoke-test.spec.ts`, `src/stores/search-store-special-sort-seek.test.ts` and `src/stores/search-store-extended.test.ts`. No production DAL/store change is in scope. |
| **Evidence currently owned** | Habitual no-focus End proves generation, absolute result-set-end coverage and null focus; store tests own null/sparse cursor behavior ([browser owner](../../../e2e/local/keyboard-nav.spec.ts#L84-L99), [store owner](../../../src/stores/search-store-extended.test.ts#L819-L1078)). |
| **Missing oracle** | A deterministic browser result set with both populated and missing Credit values, followed by exact final identity/coverage rather than only `endOfBuffer`. |
| **Implementation shape** | First write one failing test using only existing test-local fixture/interception capabilities. Add at most one habitual case. If the condition cannot be created without production fixture plumbing or real TEST data, remove the trial and record that the browser data-condition oracle is relinquished. |
| **Deletion gate** | Either the failing-first local case passes with exact missing-tail evidence, or the plan records explicit reliance on generic browser End plus exact store tests. In both branches S5 no longer blocks `manual-smoke-test.spec.ts` deletion. |
| **Focused validation** | New/changed keyboard case plus the two named special-sort unit files. |
| **Full validation** | Full units if any unit/fixture code changes, then full habitual E2E. |
| **Stop/push-back** | Stop on production-source changes, TEST dependency, synthetic assertions against implementation-only bookkeeping, or fixture cost larger than one local case. |
| **Expected effect** | Realized: habitual 202 -> 203 cases while full runtime improved from 4.4 to 4.3 minutes in the acceptance run. |

#### D-Direction: Re-Elect Reverse DOM Integrity

**Status: accepted, 11 September 2026.** The existing grid reverse owner now
samples the first viewport-intersecting rendered cell at rAF cadence, resolves
its app-owned global rank and rejects movement opposite upward input. A
synthetic reversed pair proves the checker discriminates direction, and real
samples must cross a newer prepend generation. Five no-retry focused runs and
full habitual 203/203 passed; full runtime remained 4.4 minutes with no failure
or retry. This is DOM-state correctness, not painted-pixel or performance
evidence.

| Field | Contract |
|---|---|
| **Decision served** | Determine whether DOM order and scroll geometry ever reverse against real reverse-wheel input while crossing a prepend. This is browser correctness evidence, not proof that a state was presented as a painted pixel. |
| **Exact files in scope** | `e2e/local/scrubber.spec.ts` and `e2e/smoke/smoke-scroll-stability.spec.ts`; keep any rAF sampler local to the retained case. `e2e/shared/helpers.ts` is in scope only if a second elected caller needs the same exact contract. |
| **Evidence currently owned** | Current grid/table backward tests require scroll decrease and generation-observed prepend; S26's unique residue is its directional observation window ([habitual owner](../../../e2e/local/scrubber.spec.ts#L350-L397), [S26a](../../../e2e/smoke/smoke-scroll-stability.spec.ts#L1714-L1909)). |
| **Missing oracle** | A bounded rAF DOM/global-position sequence with an actual prepend positive control and zero movement opposite the input direction. |
| **Implementation shape** | Strengthen one existing reverse-scroll case; do not add a matrix or a new case. The discriminating check must fail when the sampled sequence is reversed and must exclude expected prepend compensation from violations. Forward S26b is retained only if it can share the same bounded assertion around an observed eviction at negligible cost. |
| **Deletion gate** | The strengthened owner passes around a real prepend, or the sampler is explicitly rejected as unstable/implementation-coupled while existing prepend correctness is retained. Either decision releases S26 correctness source code. |
| **Focused validation** | Five no-retry repetitions of the changed reverse owner; include forward only if elected. |
| **Full validation** | Full habitual E2E, recording case count and wall time. |
| **Stop/push-back** | Relinquish the DOM-sequence oracle if legitimate compensation cannot be separated from reversal, if one focused repetition flakes, or if observation materially perturbs scrolling. Do not relabel it as visual-flash evidence. |
| **Expected effect** | Realized: no case-count or full-runtime change; one existing grid case gained bounded DOM-state correctness evidence and no perf metric. |

#### D-Center: Extract Return Placement, Not Diagnostic Machinery

**Status: accepted, 11 September 2026.** One shared helper requires exact
identity, painted intersection and signed placement within 50px of the usable
viewport centre below any sticky table header. The existing grid detail owner
uses it; grid FullscreenPreview was strengthened after moving its setup deep
enough for centering to be physically possible, and table FullscreenPreview
plus table ImageDetail add the two missing cases. Identity-free TEST checks
confirmed exact deep centering across 3/4/6-column layouts. All four owners
passed five no-retry repetitions; full habitual passed 205/205 in 4.6 minutes
with no failures or retries.

| Field | Contract |
|---|---|
| **Decision served** | Prove that list-return paths put the exact last-viewed image in the usable viewport, including table geometry below the sticky header. |
| **Exact files in scope** | `e2e/local/ui-features.spec.ts`, `e2e/local/browser-history.spec.ts`, `e2e/shared/helpers.ts` only if one shared usable-viewport contract serves at least two retained callers, and `e2e/smoke/centering-diag.spec.ts`. |
| **Evidence currently owned** | FullscreenPreview lifecycle/navigation and detail history identity are exact; grid detail traversal/reload already owns one centered return path ([fullscreen owner](../../../e2e/local/ui-features.spec.ts#L543-L598), [detail/history owner](../../../e2e/local/browser-history.spec.ts#L928-L1000)). |
| **Missing oracle** | Signed geometry for grid FullscreenPreview return, table FullscreenPreview return and table ImageDetail return, measured against the usable results viewport rather than the browser midpoint. |
| **Implementation shape** | Strengthen the existing grid owner and add only missing table variants, at most two new cases. Elect the exact last-viewed identity before exit, require painted intersection, then require a small signed center tolerance that accounts for the sticky header. Do not port diagnostic logs or virtual-index estimates. |
| **Deletion gate** | Every retained destination/view named above has an exact identity plus usable-viewport assertion, or a named permutation is explicitly relinquished because it shares identical production wiring and adds no distinct geometry. |
| **Focused validation** | Five no-retry repetitions of the changed UI/history cases in each elected view. |
| **Full validation** | Full habitual E2E with count/runtime recorded. |
| **Stop/push-back** | Stop if the only stable assertion reconstructs production virtualizer math, if fullscreen capability cannot fail closed in configured Chromium, or if more than two new cases are required. |
| **Expected effect** | Realized: habitual 203 -> 205 cases and 4.4 -> 4.6 minutes in the acceptance run; `centering-diag.spec.ts` is released. |

#### D-Tier: One Forced-Seek Trial, Then A Binding Disposition

**Status: accepted, 11 September 2026.** Source overlap review removed sort
reversal and density round trip because stronger habitual owners already cover
them. It also identified an invalid ~30s wait for a position map intentionally
disabled by the forced server. The retained case uniquely proves app-reported
`seek`, causal midpoint dispatch into painted buffer-local identity, and exact
painted focused End/Home boundaries. Without the forced threshold it failed at
the intended `indexed` versus `seek` precondition. The compact case passed 5/5
without retry at 2.3-3.2s. Three full no-retry runs passed 206/206 in 4.4m,
4.6m and 4.5m; median 4.5m is within both runtime gates.

| Field | Contract |
|---|---|
| **Decision served** | Decide whether forced local seek correctness is worth habitual startup/runtime cost. Natural buffer and indexed behavior already have habitual owners; no decision requires three full projects. |
| **Exact files in scope** | Add `e2e/local/forced-seek.spec.ts`; add one forced-threshold Vite server and file-scoped base URL in `playwright.config.ts`; read but do not copy `e2e/local/tier-matrix.spec.ts`; use the app-owned `data-scrubber-mode` signal in `src/components/Scrubber.tsx`. If accepted or relinquished, deletion is completed by E-Tier. |
| **Evidence currently owned** | Natural buffer/indexed midpoint, direction, boundary and density behavior runs habitually; the matrix's remaining unique dimension is forcing the local 9,998-ish corpus through seek ([natural midpoint](../../../e2e/local/scrubber.spec.ts#L133-L161), [natural direction](../../../e2e/local/scrubber.spec.ts#L1019-L1047), [matrix families](../../../e2e/local/tier-matrix.spec.ts#L150-L180), [matrix boundaries](../../../e2e/local/tier-matrix.spec.ts#L457-L548), [matrix density](../../../e2e/local/tier-matrix.spec.ts#L679-L721)). |
| **Missing oracle** | One habitual run against actual settled `seek` mode, with causal generation and painted identity rather than project-name inference. |
| **Implementation shape** | One compact case with two unique-evidence steps: 50% track click and stable painted identity; focused End then Home reaching exact boundaries. Run a second Vite process on port 3030 with only `VITE_POSITION_MAP_THRESHOLD=0`; keep the normal project and two workers. Source review rejected duplicated sort/density permutations. |
| **Deletion gate** | **Accept branch:** all reliability/runtime gates pass, so retain the one case habitually. **Relinquish branch:** any gate fails, delete the trial and record loss of habitual forced-seek coverage while retaining natural buffer/indexed browser tests and threshold/store units. Both branches release the old tier matrix; “keep manual” is forbidden. |
| **Focused validation** | First prove removing the forced threshold fails the `seek` precondition. Then run five no-retry repetitions; every run must settle in app-reported `seek`, advance the causal generation, paint the exact identity and use no swallowed timeout/fixed settlement sleep. |
| **Full validation** | Three independent habitual runs. All must pass without retry; median wall time must be no more than 4m50s and no more than 26.4s above the 4.4-minute baseline. Warn and obtain confirmation that ports 3000 and 3030 are free before running. |
| **Stop/push-back** | Take the relinquish branch on one focused flake, fixture regime drift, inability to assert painted identity without internal coordinate reconstruction, or median cost above the 10% guardrail. Do not optimize the app or weaken the oracle to make the trial fit. |
| **Expected effect** | Realized: +1 habitual case; three-run median is 4.5m. E-Tier can remove 66 dormant project-cases and two unnecessary forced variants. |

#### D-Perf: Elect Technique Value Before Extraction

**Status: no extraction, 11 September 2026.** This session has no active P8
comparison decision requiring reverse/prepend performance evidence. E1 remains
unmeasured by explicit election; E2 is superseded, E3 invalid as a paint metric,
E4 deferred until large selection has user value, and E5 remains optional
future work. No metric, manifest, runner or history file changed.

The old E1-E5 labels describe source-technique proposals, not mandatory work:

| Technique | Classification | Decision |
|---|---|---|
| **E1 directional scroll integrity** | **Confirmed, narrowed** to reverse-prepend performance. P8 measures forward table jank; local E2E owns correctness but not reverse LoAF/frame cost ([P8](../../../e2e-perf/perf.spec.ts#L1476-L1514), [reverse source](../../../e2e/smoke/smoke-scroll-stability.spec.ts#L1714-L1909)). | Extract only as a reverse window in existing P8 when a concrete P8 optimization decision needs the comparison. Otherwise explicitly leave reverse performance unmeasured. |
| **E2 indexed skeleton/content stability** | **Superseded** by JB4 user-level first-real-content/stability and local placeholder correctness. | No metric or scenario. Delete S27. |
| **E3 transition flash** | **False** as a standing metric: the legacy rAF DOM sampler does not establish pixels presented to the user and its region/rank comparison changes coordinate systems. | Delete the generic probe and matrix; keep exact issue-specific sort/Home/history correctness guards. |
| **E4 selection at scale** | **Confirmed product gap; false prototype.** Current SS cases mutate stores directly, include a placeholder and do not produce maintained audit rows. | Delete the prototype now. Reconsider only after a real bulk action makes >1k selection operationally useful or a reproducible complaint supplies a decision. |
| **E5 history/reload** | **Confirmed unmeasured performance gap**, but no legacy diagnostic is a valid source oracle and no deletion depends on filling it. | Defer to E-Future. Add only for a restoration optimization/incident, and split Back/BFCache/reload fingerprints. |

| Field | D-Perf contract |
|---|---|
| **Decision served** | For E1 only: compare forward table-scroll cost with reverse/prepend cost while investigating the maintained P8 jank target. E2-E5 serve no current deletion decision. |
| **Exact files in scope** | If E1 is elected: `e2e-perf/perf.spec.ts`, `e2e-perf/harness-validation.mjs`, `e2e-perf/harness-validation.test.mjs`, `e2e-perf/run-audit.mjs`, `e2e-perf/results/audit-graphs.html`, and, only when an approved named campaign writes history, `e2e-perf/results/audit-log.json`, `e2e-perf/results/audit-log.js` and `e2e-perf/results/audit-log.md`. Source retirement later removes `e2e/smoke/smoke-scroll-stability.spec.ts`. |
| **Evidence currently owned** | P8 is the maintained forward table-scroll target; habitual reverse tests own correctness. No maintained row owns reverse/prepend performance. |
| **Missing oracle** | A reverse measurement window with an observed prepend positive control, ordinary frame/LoAF outputs and a diagnostic maximum signed reversal. |
| **Implementation shape** | Extend P8 rather than create a new scenario. Emit one new expected metric ID for the reverse window; keep image identities in memory; do not promote five inherited internal counters to headline metrics. Estimated added duration is 8-12s per repetition, based on the old 8s reverse driver ([driver](../../../e2e/smoke/smoke-scroll-stability.spec.ts#L1779-L1796)). |
| **Deletion gate** | Either a complete dry run observes at least one prepend and emits the expected reverse row, or the plan explicitly accepts that reverse performance remains unmeasured. Smoke deletion must not wait for an unwanted metric. |
| **Focused validation** | Failing-first expected-ID/schema tests, then `test:perf-harness`; user-run targeted dry run with no history write if elected. |
| **Full validation** | Seven-repetition characterization only after the dry run is stable; no named baseline or p95 claim below the standard repetition gates. |
| **Stop/push-back** | Do not implement E1 without an active P8 comparison decision, if it requires a standalone scenario, if prepend is not a reliable positive control, or if observer overhead materially changes P8. Do not implement E2-E5 in this slice. |
| **Expected effect** | E1: +1 maintained jank metric ID, +0 Playwright cases, roughly +8-12s per jank repetition. Relinquishment: no maintained runtime change. E2-E5: no current metric growth. |

### Phase E: Remove Dormant Infrastructure

#### E-Smoke: Delete Sources, Then The Smoke Shell

**Status: complete, 11 September 2026.** Deleted the remaining six specs,
reporter, runner, result reader, config and package script after D-Credit,
D-Direction and D-Center were accepted. The direct config had 57 cases and the
menu 29, correcting the older 65-case estimate. Tier-only drift/flash probes
remain until E-Tier removes their final caller. Full units passed 1,288/1,288;
habitual/perf validation and final zero-reference gates follow the coordinated
E-Tier/reference cleanup.

| Field | Contract |
|---|---|
| **Decision served** | Remove a third browser surface whose elected evidence has either moved or been explicitly relinquished. |
| **Exact files in scope** | Delete the remaining six smoke specs: `e2e/smoke/manual-smoke-test.spec.ts`, `e2e/smoke/smoke-scroll-stability.spec.ts`, `e2e/smoke/focus-preservation-smoke.spec.ts`, `e2e/smoke/centering-diag.spec.ts`, `e2e/smoke/cited-scenario.spec.ts`, `e2e/smoke/flash-measurement.spec.ts`; then delete `e2e/smoke/smoke-report.ts`, `scripts/run-smoke.mjs`, `scripts/read-results.py`, `playwright.smoke.config.ts` and the empty `e2e/smoke/` directory; remove `test:smoke` from `package.json`. Delete `e2e/shared/drift-flash-probes.ts` only after its matrix caller is also gone. |
| **Evidence currently owned** | The D0 ledger names the maintained owner or no-value election for every smoke claim. Historical changelog/archive references remain history, not incoming executable edges. |
| **Missing oracle** | None. D-Credit, D-Direction and D-Center are hard prerequisites: each must already have a passing replacement or an explicit relinquishment recorded before E-Smoke starts. No performance metric is implicitly required. |
| **Implementation shape** | In the same change, apply the smoke-bearing reference edits enumerated by E-References, delete source specs in dependency order, then reporter/reader/runner/config/script. Do not leave a gap where live guidance prescribes a deleted command. Preserve historical execution records and shared `e2e/shared/helpers.ts`, `e2e/global-setup.ts`, production layout/tuning constants, `PERF_STABLE_UNTIL`, `test-results/`, `playwright-report/` and all `e2e-perf` infrastructure. |
| **Deletion gate** | D-Credit, D-Direction and D-Center dispositions are closed; the coordinated E-References patch leaves zero live operational hits for `e2e/smoke`, `test:smoke`, `run-smoke.mjs`, `playwright.smoke.config.ts`, `smoke-report.json`, `scroll-stability-report.json`, `SMOKE_STABLE_UNTIL`, smoke case IDs/titles and deleted probe imports. Exclude `changelog.md`, `zz Archive/**` and ignored generated trees from the gate. |
| **Focused validation** | Static/list validation for habitual and perf configs; `test:perf-harness`; focused retained D-Credit/D-Direction/D-Center owners. Do not rerun smoke to prove deletion of warning-only tests. |
| **Full validation** | Full habitual E2E after the final local owner changes, full units for any `src/` change, and build/static reference checks. No named perf run unless D-Perf changed metrics. |
| **Stop/push-back** | Stop if a hard smoke assertion lacks a D0 disposition, if a shared helper still has a maintained caller, or if deletion would remove a production tuning/control path. |
| **Expected effect** | Realized: removed 57 direct-config smoke cases and the 29-case menu surface. Habitual/perf maintained counts and runtimes changed only through accepted D slices. |

#### E-Tier: Delete The Matrix In Either Trial Outcome

**Status: complete, 11 September 2026.** Deleted both matrix specs, the
three-project config, package script and the now-ownerless DOM/rank probe.
Removed ports 3010/3020 and all forced buffer/indexed variants. Retained the
accepted compact forced-seek case, its file-scoped project, port 3030 and only
`VITE_POSITION_MAP_THRESHOLD=0`. Static discovery remains 206 tests in 14 files.

| Field | Contract |
|---|---|
| **Decision served** | End the dormant 66-project-case surface after making the forced-seek value/cost decision binding. |
| **Exact files in scope** | Delete `e2e/local/tier-matrix.spec.ts`, `e2e/local/drift-flash-matrix.spec.ts` and `playwright.tiers.config.ts`; remove `test:e2e:tiers` from `package.json`; remove both matrix exclusions from `playwright.config.ts`; remove tier-only imports from `e2e/shared/drift-flash-probes.ts`, deleting that helper if E-Smoke left no caller. If D-Tier is relinquished, also remove `e2e/local/forced-seek.spec.ts` and its port-3030 `webServer`; if accepted, retain both in habitual config. |
| **Evidence currently owned** | Natural buffer/indexed browser owners remain. D-Tier either adds one habitual forced-seek owner or records the explicit reduction to natural-regime browser plus threshold/store unit evidence. Drift/flash performance is already rejected by D-Perf. |
| **Missing oracle** | None after the D-Tier disposition. The weak top/bottom, consecutive-seek, forced-drag, ratio-sweep, five-toggle density, PgDown and duplicate sort/boundary permutations are consciously dropped rather than rebuilt ([matrix cases](../../../e2e/local/tier-matrix.spec.ts#L184-L337), [remaining weak permutations](../../../e2e/local/tier-matrix.spec.ts#L397-L721)). |
| **Implementation shape** | Apply the accepted or relinquished branch and the tier-bearing E-References edits in the same change; do not retain a manual fallback or live guidance for one. Remove forced buffer/indexed servers on ports 3010/3020 in both branches. |
| **Deletion gate** | The coordinated E-References patch leaves zero live operational hits for `test:e2e:tiers`, `playwright.tiers.config.ts`, both matrix filenames, `tier-buffer`, `tier-two-tier`, `tier-seek`, ports 3010/3020, and tier-only forced-threshold assignments. Port 3030 and `VITE_POSITION_MAP_THRESHOLD=0` survive only with the accepted habitual forced-seek case. |
| **Focused validation** | Config/list validation must show each habitual case exactly once and, on the accept branch, only `forced-seek.spec.ts` using port 3030. Run the forced case only on the accept branch. |
| **Full validation** | One final full habitual run after config removal; it must satisfy the D-Tier branch's recorded count/runtime contract. |
| **Stop/push-back** | Stop if removing `testIgnore` causes either old matrix to enter habitual discovery, if any project multiplies the habitual suite, or if authoritative docs still prescribe the deleted command. |
| **Expected effect** | Realized: removed 66 dormant project-cases and ports 3010/3020; habitual remains 206 with one accepted forced-seek case on port 3030. |

#### E-References: Cross-Cutting Removal Gate

**Status: complete, 11 September 2026.** Live package/config/docs/comments have
no runnable smoke or tier-matrix residue; historical changelog/archive text was
preserved. The synchronized test directives now name habitual ports 3000/3030.
Final validation passed build, 1,288 units, 206/206 habitual in 4.5 minutes
without retry, 35 harness tests, exact 206-test discovery, diagnostics,
zero-reference search and `git diff --check`.

| Field | Contract |
|---|---|
| **Decision served** | Make the maintained test topology discoverable and prevent dead commands/configs from remaining operational guidance. This gate is applied atomically with E-Smoke and E-Tier, then swept once after both; it is not a later prerequisite that makes their deletion gates circular. |
| **Exact files in scope** | `AGENTS.md`, `e2e/README.md`, `package.json`, `playwright.config.ts`, `playwright.run-manually-on-TEST.config.ts` (incorrect live filename example only), `e2e/global-setup.ts`, `src/hooks/useDataWindow.ts`, `src/hooks/useScrollEffects.ts`, `e2e/local/scrubber.spec.ts`, `e2e-perf/perf.spec.ts`, `e2e-perf/playwright.perf.config.ts`, reports 1-5 and `exploration/docs/00 Architecture and philosophy/component-detail.md`. Also sweep current operational references in `position-preservation-reference.md`, `scroll-and-position-preservation-testing-3.1-tests-inventory.md`, `W-2026-07-30-seek-idempotence.md`, `W-2026-07-30-seek-idempotence.spec.ts`, `embedded-browser-playbook.md`, `convert-app-to-use-links-in-UI-workplan.md`, `00 Architecture and philosophy/00-kupua-extracted-principles.md`, `03 Ce n'est pas une pipe dream/kupua-05-realistic-work-plan.md`, `03 Ce n'est pas une pipe dream/kupua-00-capabilities-report.md`, `ai-search-catching-up-workplan.md` and `01 Research/image-optimisation-research.md`. The test directive in `.github/copilot-instructions.md` and its human copy require explicit permission to edit the root file and must be synchronized together. |
| **Evidence currently owned** | `package.json` and Playwright configs define executable truth; `AGENTS.md` and `e2e/README.md` are the live routing authorities. Current smoke/tier counts and runner semantics already disagree across those sources ([scripts](../../../package.json#L18-L24), [testing summary](../../../AGENTS.md#L84-L93), [README modes](../../../e2e/README.md#L9-L48)). |
| **Missing oracle** | None; this is reference integrity, not browser behavior. |
| **Implementation shape** | Before each removal, partition this exact inventory into smoke-bearing and tier-bearing edits and include that partition in the same patch as E-Smoke or E-Tier. Remove dead commands and rewrite present-tense comments to maintained owners. Preserve explicit historical statements in changelog and archive. Where a non-archive old workplan is retained, label the removed surface historical rather than deleting research context. Reconcile pre-A/B report-1 perf status debt (JB3, P7, P12 and P13) here; it was not Phase-C-caused and therefore is not changed by the present planning task. |
| **Deletion gate** | Repository-wide live-reference search has no actionable invocation/import/link to removed files or commands; all retained counts are derived from current config/manifests; directive copies are identical if changed. |
| **Focused validation** | Link/path search, package-script inspection, config test listing and directive-copy diff. |
| **Full validation** | `git diff --check`, editor diagnostics for changed code/config files, and the final habitual/static validations from E-Smoke/E-Tier. |
| **Stop/push-back** | Do not edit `.github/` without explicit permission, do not rewrite historical changelog/archive entries, and do not turn stale observed TEST corpus totals into guarantees. Append the current implementation changelog entry separately. |
| **Expected effect** | No runtime or case change; one accurate two-surface topology with no dead smoke/tier instructions. |

#### E-Future: Optional Measurement Expansion After Retirement

| Field | Contract |
|---|---|
| **Decision served** | Add a measurement only when a product/performance decision needs it, not to validate the historical importance of deleted probes. |
| **Exact files in scope** | No files are pre-authorized. A future approved design may extend `e2e-perf/perceived-long.spec.ts` for deep Back/reload, `e2e-perf/perf.spec.ts` for a concrete rendering investigation, or add a separately configured mobile perf project; manifest, harness tests and result/dashboard files then follow the normal A1-A5 contracts. |
| **Evidence currently owned** | Correctness remains in habitual history/mobile/selection tests. Existing JB4 owns indexed first-real-content latency; existing P8 owns forward table jank. |
| **Missing oracle** | E5: restoration timing split by Back/BFCache/reload. E4: real out-of-buffer range/persistence/reconciliation only after large selection has user value. Mobile: gesture animation only after a concrete regression or optimization target. |
| **Implementation shape** | Prefer adding isolated windows to an existing journey when lifecycle and fingerprint match. Start fresh from user actions; never resurrect direct store mutation, generic DOM-flash counters or a smoke scenario solely to preserve ancestry. |
| **Deletion gate** | None. All smoke/tier deletion must already be complete or independently releasable. |
| **Focused validation** | New expected-ID and boundary tests, then one no-history dry run under the normal TEST/port protocol. |
| **Full validation** | Seven repetitions for characterization; at least 20 before a p95 target; exact fingerprint matching and a named decision owner. |
| **Stop/push-back** | Stop when no optimization/incident/release decision consumes the result, when a stable fixture/control is absent, or when the proposed row only measures an already represented downstream path. |
| **Expected effect** | Zero current surface/runtime growth. Future growth is approved per decision and reported before implementation. |

## Slice Selection Rule

At the end of each slice, choose the next item by this order:

1. A validity defect that can corrupt evidence.
2. An unstable existing core metric.
3. A habitual test that is ineffective or nondeterministic.
4. A strict duplicate that costs feedback time.
5. A legacy oracle blocking smoke/tier deletion.
6. A high-value interaction gap with no current owner.

This keeps the project converging: make evidence trustworthy, strengthen what
already runs, remove waste, migrate stranded value, then broaden coverage.

## Long-Running Agent Strategy

One capable agent can execute D-Zero through E-References in a single long
session. Sol 5.6 Medium is suitable for the whole route: continuity across the
ownership ledger, deletion graph and accumulated validation is more valuable
than handing mechanical and judgment-heavy slices to different models.

The unit of discipline is the **slice transaction**, not the agent session.
Never combine two slices into one edit batch, one evidence decision or one
validation claim. Complete the current slice's local hypothesis, edit, focused
validation, full validation, disposition and documentation checkpoint before
reading the next slice's implementation surface. The same agent should then
continue unless a named stop condition requires the user.

| Slice kind | Main reasoning hazard |
|---|---|
| D-Zero, D-Wheel | Deleting before proving the retained owner or accidentally carrying a non-owner into a replacement |
| D-Credit | Building production fixture machinery to preserve one real-data condition already owned below the browser |
| D-Direction | Treating sampled DOM geometry as painted-pixel evidence or misclassifying legitimate prepend compensation |
| D-Center | Reconstructing virtualizer internals instead of asserting exact identity in the usable viewport |
| D-Tier | Rebuilding a matrix instead of deciding the value and cost of one forced local seek owner |
| D-Perf | Adding a metric without a current P8 decision, stable positive control or complete manifest contract |
| E-Smoke, E-Tier, E-References | Deleting shared infrastructure, leaving live operational references, or rewriting history that should remain historical |

Shared-helper work is part of the plan when a slice genuinely needs it. Reuse a
sound helper first. Amend or create a shared helper only when at least two
retained callers need the same exact contract, or when one high-risk contract
must be identical across habitual and perf surfaces. D-Center may introduce a
usable-viewport helper if multiple return journeys use it. D-Direction keeps
its sampler local unless a second elected caller appears. D-Tier should consume
the app-owned regime signal and must not smuggle in the deferred 47-call-site
density-helper migration. A helper change is part of its owning slice and must
pass that slice's focused and full validation before the session proceeds.

## Copy-Paste Initial Agent Prompt

```text
You are a fresh Sol 5.6 Medium agent executing the remaining Kupua
performance-harness retirement plan in one long-running session.

Mission
=======

Execute these workplan slices sequentially:

1. D-Zero
2. D-Wheel
3. D-Credit
4. D-Direction
5. D-Center
6. D-Tier
7. D-Perf decision gate
8. E-Smoke plus its smoke-bearing E-References changes
9. E-Tier plus its tier-bearing E-References changes
10. Final E-References sweep

Do not implement E-Future. D-Perf is not mandatory metric work: unless the
user confirms there is a current P8 comparison decision that needs reverse
performance evidence, take the documented no-extraction path and continue.

This is intentionally one agent session. Do not stop or hand off merely because
a slice ended. However, each slice is an independent transaction. Never combine
two slices into one edit batch, one replacement/relinquishment decision, one
test run, or one documentation checkpoint.

Scope And Safety
================

- Work only under kupua/. Do not modify files outside kupua/ without explicit
   user permission. Editing `.github/copilot-instructions.md` during final
   directive cleanup requires explicit permission and synchronized editing of
   its human copy.
- Do not commit or push. Preserve unrelated dirty and untracked work.
- The repository is public. Never write cookies, credentials, tokens, signed
   URL query strings, authorization headers, private keys, real user data,
   internal hostnames not already public, live image IDs/metadata or response
   bodies to disk. Redact uncertain values.
- Never write to a non-local Elasticsearch cluster. Do not connect to TEST or
   run purpose-driven perf campaigns without explicit user permission for that
   operation. The user runs named performance campaigns.
- Do not run smoke or tier-matrix as incidental validation. They are migration
   sources scheduled for deletion.
- Do not revert unrelated changes. Read the current diff before each slice and
   work with user changes in files you touch.

Fresh-Agent Orientation
=======================

Follow the repository Fresh Agent Protocol before any edit:

1. Say: "Hi, I'm a fresh agent."
2. Read fully:
    - kupua/AGENTS.md
    - kupua/exploration/docs/worklog-current.md
    - kupua/exploration/docs/performance-harness-5-workplan.md
3. Then read for orientation, not to reopen completed research:
    - performance-harness-3-coverage-and-retirement-plan.md
    - performance-harness-4-habitual-e2e-consolidation-audit.md
    - performance-harness-7-phase-c-ledger.md
    - kupua/e2e/README.md
    - kupua/package.json
    - the habitual, perf, smoke and tier Playwright configs
4. Inspect `git status` and the relevant diff. A-C are complete; do not reopen
    their elections without new contradictory source evidence.
5. State the context you have, your understanding of the route and the first
    D-Zero hypothesis. Ask: "What should I read before starting? Is there
    anything not in the docs I need to know?" Do not edit until the user
    confirms.

Current Baseline And Destination
================================

- Habitual local E2E owns deterministic correctness. Its accepted baseline is
   203/203 in 4.4 minutes with two workers and no failures or retries.
- Purpose-driven e2e-perf owns comparable performance evidence. It fails
   closed, checks expected IDs/repetitions, fingerprints environments and uses
   correlated user-visible boundaries.
- Smoke expands to 65 direct-config cases; its menu exposes 29. The tier command
   expands to 66 project-cases. Neither is a maintained destination.
- Most old smoke claims are superseded or false. Do not recreate a legacy test
   merely because it once existed.
- Natural buffer and indexed correctness already run habitually. D-Tier decides
   only whether one forced local seek journey earns habitual cost.
- Correctness evidence and performance evidence are different. Never use a jank
   metric to replace correctness, or store/DOM bookkeeping to claim painted
   visual evidence.
- Historical changelog and `zz Archive` references do not block deletion and
   must not be rewritten. Append new current changelog entries as required.

Slice Discipline
================

For exactly one current slice at a time:

1. Re-read only that slice's ten-field contract in report 5 and its cited source
    owners. Do not map later slices yet.
2. Update worklog-current.md with the current slice, baseline and intended
    discriminating check.
3. Name before editing:
    - the decision served;
    - one falsifiable local hypothesis;
    - current owner and proposed replacement or explicit relinquishment;
    - correctness versus performance evidence;
    - exact files in scope;
    - existing tests likely to assert the old behavior;
    - one cheap check that could falsify the hypothesis.
4. If closer source reading disproves the premise, stop that implementation.
    Record the confirmed/superseded/false classification and use the slice's
    relinquishment/no-value branch. Do not invent work to preserve momentum.
5. For a replacement, write the discriminating test first and confirm it fails
    for the intended reason. For a strict deletion, prove the stronger owner
    before removing the old source.
6. Make one reversible edit for this slice only. No neighboring cleanup, later
    infrastructure deletion or unrelated helper refactor.
7. Immediately run the slice's focused validation. If it fails, classify the
    failure before editing again. Never weaken an assertion merely to recover
    green.
8. Run the slice's specified full validation. A focused pass is not enough when
    the contract requires full habitual E2E or units.
9. Compare actual evidence, case/metric count, wall time, retries/flakes,
    regime/route and fingerprint with the frozen baseline.
10. Close the slice completely:
      - accept the replacement, or obtain user approval for explicit
         relinquishment where evidence is reduced;
      - update affected live reports, AGENTS.md, worklog and the current changelog
         entry;
      - preserve historical archive/changelog text;
      - run zero-reference and `git diff --check` gates;
      - tell the user the result and the next slice.
11. Only then begin reading and implementing the next slice. Continue
      automatically unless a pause condition below applies.

Shared Helpers
==============

- Reuse an exact existing helper first.
- Amend or create a shared helper only when at least two retained callers need
   the same contract, or one high-risk contract must be identical across
   habitual and perf surfaces.
- A helper change belongs wholly to the current slice. Identify all affected
   callers before editing and include them in focused/full validation.
- D-Center may add a shared usable-viewport helper if multiple elected return
   journeys use it.
- Keep D-Direction's rAF/DOM sampler local unless a second elected caller
   appears. It is DOM-state correctness, not painted-pixel evidence.
- D-Tier must use the app-owned scrubber regime signal. Do not infer tier from
   project name or copied thresholds.
- Do not absorb the deferred density paint/extension split across 47 callers
   into D-Tier or another slice.
- Keep low-level stimuli local when their mechanism defines the scenario.

Validation And Permission Protocol
==================================

- Run all commands from repo root as `npm --prefix kupua run <script>`.
- For long test commands use:
   `set -o pipefail; <command> 2>&1 | tee "$TMPDIR/kupua-test-output.txt"`
   The pipeline must end at bare `tee`; do not append `tail`, `head` or `grep`.
- Before every Playwright campaign, warn that port 3000 must be free, ask
   whether a dev server is running, and wait for confirmation. D-Tier also needs
   port 3030 free. Tier-matrix ports 3010/3020/3030 require the same warning if a
   deletion/config check could start them unexpectedly.
- Never run another terminal command while a long test is still active. If the
   terminal tool says it may still be running or returns an execution ID, use
   only the corresponding output-resume operation until completion.
- After any kupua/src change, run full units. After component, hook, store,
   scroll or focus behavior changes, run full habitual E2E after focused checks.
- D-Zero is non-browser validation. D-Wheel and accepted local correctness
   slices require their focused checks and full habitual E2E. D-Tier uses its
   five focused and three full-run acceptance campaign exactly as written.
- Do not run perf, smoke or tier campaigns as a convenient full check.
- For D-Perf, write failing harness/manifest tests first. Prepare the exact
   dry-run command, but the user controls TEST access and purpose-driven runs.

Continue Versus Pause
=====================

Continue into the next slice after a green, fully recorded checkpoint. Pause
and ask the user only when:

- the Fresh Agent Protocol requires initial confirmation;
- a Playwright/port warning or TEST/perf permission is required;
- a slice reaches an explicit evidence-relinquishment decision;
- `.github/` must be edited to synchronize the test directive;
- a first approach failed and the next attempt requires assumptions about user
   intent or materially different implementation cost;
- a requested change is likely to seriously affect runtime/performance;
- current user changes make the scoped edit unsafe or ambiguous;
- a test failure cannot be classified locally without changing scope.

Do not pause merely because a slice boundary was crossed, documentation needs
updating, the session is long, or the next slice has a different reasoning
shape. Use worklog-current.md and the completed checkpoints to preserve
continuity. If context quality degrades enough that you cannot restate the
current owner, hypothesis, gate and baseline, stop and write a precise handoff
rather than guessing.

Per-Slice Route
===============

- D-Zero: delete only the ownerless diagnostics and invalid selection prototype;
   no Playwright and no maintained metric/count change.
- D-Wheel: prove the retained track/content wheel owners, delete the one strict
   duplicate, then run full habitual E2E.
- D-Credit: attempt at most one test-local missing-Credit End owner. Do not add
   production fixture machinery or use TEST; ask before relinquishing it.
- D-Direction: strengthen one existing reverse owner only if a stable local
   DOM/global-position oracle distinguishes reversal from compensation. Keep
   correctness separate from optional reverse performance.
- D-Center: strengthen current return journeys, add at most two missing table
   cases, and share usable-viewport geometry only under the helper rule.
- D-Tier: accepted one compact forced-seek case with app-reported regime after
   removing overlapping sort/density steps. Never rebuild the three-project matrix.
- D-Perf: ask whether an active P8 comparison needs E1. If not, record no
   extraction and continue. E2 is superseded, E3 is invalid as a paint metric,
   E4 is deferred until large selection has user value, and E5 is optional
   future work; do not implement them.
- E-Smoke: start only after D-Credit, D-Direction and D-Center are closed.
   Delete smoke sources and shell in dependency order together with smoke-bearing
   live-reference updates. Do not rerun smoke to justify deletion.
- E-Tier: apply the accepted or relinquished D-Tier branch, delete both matrix
   specs/config/script, and make tier-bearing reference updates in the same
   change. "Keep manual" is not an outcome.
- E-References: perform the final live-reference sweep. Preserve shared habitual
   and perf infrastructure and historical records. Ask before touching
   `.github/`; synchronize the directive copy if approved.

Done
====

Do not declare the route complete until:

- every D slice has a recorded accepted or explicitly approved relinquished
   disposition and its required validation;
- smoke, tier-matrix and their runners/configs are deleted;
- habitual E2E remains within its accepted budget under the D-Tier branch;
- maintained perf manifests remain complete and no unwanted scenario was added;
- live package/config/docs/comments contain no operational smoke/tier residue;
- reports 1-5, AGENTS.md, worklog and current changelog entry describe current
   owners and counts;
- no historical archive/changelog entry was rewritten;
- final diagnostics, zero-reference searches and `git diff --check` pass;
- no commit or push was made.
```

## Done

The project is complete when:

- habitual E2E owns the elected correctness contracts, stays near five minutes,
  and contains no known strict duplicates or conditionally empty named tests;
- `e2e-perf` fails closed, fingerprints every run, uses fixed scenarios and
  honest visual boundaries, and retains complete raw repetitions;
- the core performance portfolio covers the expensive interaction classes
  elected in reports 1-3 without measuring every control permutation;
- smoke, tier-matrix and their runners/configs are deleted;
- shared helpers name exact contracts and deliberate low-level probes remain
  local;
- reports 1-5 and this workplan describe the current owners rather than a
  historical migration state.

## Post-Retirement Follow-Ups

These remain applicable but are not part of the completed retirement work:

1. Split density paint acknowledgement from extension readiness across the 47
   current callers in a dedicated migration with full habitual validation.
2. Optimize the jank dashboard's Chart.js update lifecycle before another
   dashboard-heavy campaign; controls currently rebuild every chart card.
3. Add a reverse/prepend P8 window only when a concrete comparison decision
   needs it. Correctness is maintained; reverse performance remains explicitly
   unmeasured.
4. Tighten shared test-helper contracts separately: retire `clickScrubberAt`,
   make threshold/regime detection configuration-aware, and stop swallowing
    required position-map or visible-content timeouts. In the same deliberate
    helper-maintenance project:
    - name store-settled and browser-settled contracts separately;
    - compare and, if justified, extract the clean-top invariant shared by
       buffer-corruption and reset tests;
    - split first-buffer identity from first DOM-visible identity instead of
       changing `getFirstVisibleImageId()` semantics in place;
    - rename or remove `waitForNotLoading()`, which observes a scrubber animation
       class rather than search lifecycle state;
    - review duplicated mode setup and keyboard geometry constants only after
       the higher-value readiness contracts are explicit.
