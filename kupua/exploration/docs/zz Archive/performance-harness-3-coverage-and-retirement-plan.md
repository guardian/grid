# Performance Harness Coverage And Retirement Plan

**Status:** post-Phase-C decision ledger, updated 10 September 2026  
**Scope:** performance coverage gaps; extraction from manual tier/smoke surfaces; eventual retirement  
**Constraint:** every removed claim has either a passing current owner, a passing
elected replacement, or an explicit no-value/relinquishment decision; legacy
existence alone is not a replacement requirement

## Target End State

Kupua should have two maintained browser evidence surfaces:

1. **Habitual local E2E:** fast correctness feedback, kept at roughly five
  minutes and audited by observable oracle.
2. **Purpose-driven `e2e-perf`:** stable, complete, fingerprinted measurements
  for expensive user-visible transitions.

Smoke and three-tier infrastructure should go away after elected material moves
to one of those owners. A suite that is never run is not retained evidence.

The complete habitual-suite election is in
[report 4](performance-harness-4-habitual-e2e-consolidation-audit.md).

## Decision

Proceed with consolidation. Trial one forced-seek habitual owner, then delete
the tier matrix whether the trial is accepted or its evidence is explicitly
relinquished. Do not preserve it indefinitely as a manual suite.

- Most smoke and diagnostic files are stale, duplicative or report-only. Phase
  C superseded more of their proposed residue than this report originally
  assumed; only missing-Credit End, bounded reverse-direction integrity and
  return placement merit local replacement trials
  ([current election](performance-harness-5-workplan.md#d0-research-gate-and-premise-reset)).
- Natural buffer and indexed behavior already run habitually. The tier matrix's
  only plausible cadence gap is forced local seek, which must be tried as one
  case rather than repeated through three projects
  ([forced-seek decision](performance-harness-5-workplan.md#d-tier-one-forced-seek-trial-then-a-binding-disposition)).
- Reliability gates G1-G4 and the broader Phase A validity work are complete;
  new scenarios still require a concrete decision rather than following
  automatically from an old gap label
  ([completed Phase A](performance-harness-5-workplan.md#phase-a-make-perf-evidence-fail-closed)).
- Never rerun the whole stale smoke/tier estate merely to decide whether to
  delete it. The 30 August excavation already produced enough evidence
  ([inventory results](scroll-and-position-preservation-testing-3.1-tests-inventory.md#execution-results)).

## Recent Harness Work And Baseline

The specified commit range is four commits, not one broad rewrite:

| Commit | Election | Lasting effect |
|---|---|---|
| `90c375bf7` | Elect rendered image nearest usable viewport centre | Browser anchor oracle now uses intersecting DOM geometry, not virtual-range midpoint ([focus E2E](../../../e2e/local/focus-preservation.spec.ts#L285-L333)) |
| `31c347389` | Prune ineffective scrubber assertions; exclude both matrices from habitual runs; use two workers and parallel scrubber cases | Main wall-time reduction: dominant scrubber file can occupy both workers ([habitual config](../../../playwright.config.ts#L21-L43), [scrubber config](../../../e2e/local/scrubber.spec.ts#L86-L91)) |
| `8e53bf506` | Replace guessed waits with action-specific observable outcomes | Smaller second reduction and fewer timing lies; sort, focus, selection persistence, backward prepend, detail, and panel waits now observe their actual contract ([helpers](../../../e2e/shared/helpers.ts#L784-L1061)) |
| `da2a5fbba` | Make browser-history readiness generation-driven | Back/Forward/reload tests wait for the new search context rather than an already-idle predecessor ([history helpers](../../../e2e/local/browser-history.spec.ts#L49-L120), [lifecycle signal](../../../src/stores/search-store.ts#L4157-L4182)) |

Recorded progression: 248 habitual cases in 10.3 minutes; pruning plus two
workers reached roughly 4.9-5.0 minutes; observable waits reached 4.6-4.7
minutes. Phase C then reduced the 236-case baseline to **203/203 in 4.4
minutes**, with no failures or retries
([Phase C ledger](performance-harness-7-phase-c-ledger.md#progress)). The
speedup came primarily from scheduling, evidence-preserving elections and
observable settlement, not from weakening unique behavior contracts.

Do not reverse these elections when extracting old diagnostic code:

- Store bookkeeping is not browser performance evidence.
- `bufferOffset` is not viewport position.
- A stable final state does not prove there was no painted flash.
- An emitted warning or console verdict is not an assertion.
- Fixed sleeps are not completion contracts unless timing itself is under test.

## Portfolio Gap Re-Election

Only add a standing perf scenario when a named optimization, incident or release
decision consumes it. Distinct implementation is necessary but no longer
sufficient; an old diagnostic does not create an obligation to measure.

| Old priority | Classification after A-C | Current destination |
|---|---|---|
| A1 reverse scroll/prepend | **Confirmed, narrowed:** correctness is habitual; reverse/prepend jank remains unmeasured ([habitual owner](../../../e2e/local/scrubber.spec.ts#L350-L397), [P8](../../../e2e-perf/perf.spec.ts#L1476-L1514)). | Optional reverse window inside P8 only when a P8 optimization needs comparison; otherwise relinquish performance coverage. |
| A2 indexed skeleton replacement | **Superseded:** JB4 measures first real indexed content and visual stability; local T3 owns eventual non-placeholder correctness ([JB4](../../../e2e-perf/perceived-long.spec.ts#L300-L349), [T3](../../../e2e/local/scrubber.spec.ts#L2593-L2615)). | No E2 metric or new scenario. |
| A3 history/reload restoration | **Confirmed but optional:** correctness owners are exact; performance remains unmeasured ([history owners](../../../e2e/local/browser-history.spec.ts#L878-L1157)). | Future deep Back/reload windows only for a concrete restoration decision. |
| A4 large selection | **Confirmed latent gap; false prototype:** D-Zero deleted the direct-store prototype and its placeholder out-of-buffer case. | Reconsider after >1k selection has user value or a reproducible complaint. |
| A5 mobile gestures/zoom | **Confirmed distinct path, no current decision.** | Optional future mobile project; it does not gate smoke/tier deletion. |
| B1-B4 and C1 | **Deferred hypotheses.** None is legacy residue that must move before retirement. | Reassess individually under the value trigger above; do not create a scenario from this table alone. |

Do not add dedicated perf rows for every date preset, metadata field, sort
affordance, accordion, toast, tooltip, collection node, focus setting, or
equivalent close shortcut. Their correctness belongs in habitual E2E; their
downstream expensive path is already represented elsewhere.

## Bounded Browser Spot Checks

These single-session observations validate that A1/A2 are distinct, reachable
measurement gaps. They are not baselines and do not justify thresholds.

| Probe | Identity-free observation | Decision consequence |
|---|---|---|
| Indexed jump | The pinned Dublin query returned 13,278 results with a ready position map. A scrollbar-style jump to 55% produced 53 consecutive skeleton-only frames; the first real cell appeared after 448ms and `_seekGeneration` advanced once. | Historical characterization only. JB4 now owns first-real-content/stability; skeleton-frame counts need no separate metric. |
| Reverse wheel/prepend | Fifty real upward wheel events crossed two `_prependGeneration` transitions. The 4.5s sample observed three skeleton frames and zero downward scroll/global-position reversals. | Confirms a usable prepend positive control for the optional P8 reverse window and bounded local-direction trial; it is not a target. |
| Real CQL/typeahead attempt | Delayed typing of `+keyword:foot` issued twelve direct-ES searches and committed the query, but a post-typing observer saw no surviving suggestion list. | Confirms hidden pre-search request fan-out, but does not measure suggestion latency. B1 needs instrumentation armed before the first key; browser wandering is not evidence that suggestions were absent or slow. |

All values are one read-only TEST observation from 8 September 2026. No image
identity, metadata, response body, or direct DAL call was returned. Repeat only
inside a purpose-built dry-run scenario; do not promote these values to targets.

## Tier Matrix Disposition

The retired manual configuration selected 18 tier cases plus four drift/flash
cases across three projects, for 66 project-cases. E-Tier deleted that matrix;
the accepted compact forced-seek owner now supplies the only unique forced
regime evidence habitually.

### What Remains Unique

The individual matrix actions overlap habitual tests. Natural local data already
exercises buffer and indexed modes habitually; only forcing the ordinary local
corpus through **seek** lacks a maintained cadence. The old project-name tier
inference is superseded by the app-owned `data-scrubber-mode` signal
([matrix inference](../../../e2e/local/tier-matrix.spec.ts#L27-L36),
[app signal](../../../src/components/Scrubber.tsx#L1108-L1120)).

The old buffer setup once generated false failures by labeling 9,998 results as
buffer tier. Corrected execution later passed 63 cases plus three isolated
seek-budget cases. Preserve both facts; do not treat the invalid run as product
evidence or erase it from history
([tier excavation](scroll-and-position-preservation-testing-3.1-tests-inventory.md#tier-matrix)).

### Trial Required Before Deletion

Build one `forced-seek.spec.ts` case around the unique forced-regime evidence:
midpoint dispatch/paint and exact focused End/Home. The initial sort/density
steps were removed after source review found stronger habitual owners, and the
helper's impossible wait for a disabled position map was bypassed. Use one
additional Vite server with `VITE_POSITION_MAP_THRESHOLD=0`; do not force or
repeat natural buffer/indexed modes
([trial contract](performance-harness-5-workplan.md#d-tier-one-forced-seek-trial-then-a-binding-disposition)).

Acceptance for retiring `tier-matrix.spec.ts` and
`playwright.tiers.config.ts` has two binding outcomes:

1. **Accepted:** the compact case proved actual app-reported seek mode, exact
  painted identities and causal settlement across five focused and three full
  no-retry runs. Full times were 4.4m, 4.6m and 4.5m; retain it habitually.
2. Any reliability, oracle or runtime gate fails; delete the trial and record
  the explicit loss of forced local seek coverage while retaining natural
  buffer/indexed browser and threshold/store unit evidence.

“Keep it manual” is not a valid final outcome because its observed cadence is
effectively never.

## Smoke And Diagnostic Re-Election Ledger

The row-by-row source classification lives in report 5 D0. This report retains
the deletion-level ownership summary:

| Source | Post-Phase-C classification | Binding gate |
|---|---|---|
| Retired manual smoke source | S1-S4/S6-S8/S10 **superseded**; S9/S11 browser-extraction premises **false**; S5 missing-Credit End **accepted in D-Credit**. | Deleted in E-Smoke; deterministic local keyboard owner plus exact sparse/null store tests retain S5 evidence. |
| Retired scroll-stability smoke source | S12-S25 **superseded or false**; S26 correctness **accepted in D-Direction**; S27 **superseded** by JB4 plus local placeholder correctness. | Deleted in E-Smoke; optional reverse performance remains explicitly unmeasured. |
| Retired focus-preservation smoke source | T1-T5/T7 **superseded after Phase C**; T6/T9-T12 **false**; T8/T10 were unneeded combinations. | Deleted in E-Smoke with maintained exact focus/history owners retained. |
| Retired centering diagnostic | **Accepted in D-Center:** exact return identity and signed usable-viewport placement cover grid/table FullscreenPreview and grid/table ImageDetail destinations. | Deleted in E-Smoke; shared local helper and maintained journeys retain evidence. |
| Ownerless history, Home-logo and phantom-drift diagnostics | **Superseded or false** after Phase C. | Deleted in D-Zero with no replacement; maintained history, reset and focus owners remain. |
| Retired smoke drift/flash sources; pending tier matrix | Generic DOM/rank flash premise **false** as persisted paint evidence. | Smoke sources deleted in E-Smoke; tier probe survives only until E-Tier removes its final caller. |

## Performance Technique Decisions

| Technique | Classification | Current decision |
|---|---|---|
| E1 directional integrity | **Confirmed, narrowed** to reverse/prepend performance; D-Direction now owns DOM-rank correctness. | Add one reverse window to existing P8 only for an active P8 comparison; otherwise relinquish. Do not persist the old five-counter envelope. |
| E2 indexed skeleton stability | **Superseded** by JB4 and local T3. | No extraction. |
| E3 transition flash | **False** as a standing persisted metric because DOM-rAF state is not proof of presented pixels and the old region/rank coordinate changes during replacement ([probe](../../../e2e/shared/drift-flash-probes.ts#L383-L508)). | Delete generic probes; retain exact issue-specific correctness tests. |
| E4 selection at scale | **Confirmed future question; false current prototype.** | Delete prototype. Design a user-level journey only after a bulk action or reproducible complaint creates value. |
| E5 history/reload | **Confirmed optional gap.** | Add isolated deep Back/reload windows only for a concrete restoration decision; no smoke deletion depends on them. |

Detailed implementation, validation, stop and runtime contracts are in
[D-Perf](performance-harness-5-workplan.md#d-perf-elect-technique-value-before-extraction)
and [E-Future](performance-harness-5-workplan.md#e-future-optional-measurement-expansion-after-retirement).

## Deletion Sequence

1. **D-Zero (complete):** deleted the three ownerless diagnostics and invalid
  selection prototype; maintained manifests and browser owners were unchanged.
2. **D-Wheel:** close the one missed Phase C habitual election with focused and
  full habitual validation.
3. **D-Credit (accepted), D-Direction, D-Center:** the deterministic local
  missing-Credit owner releases S5; run one bounded local trial for each
  remaining correctness question.
4. **D-Tier (accepted):** retain one compact forced-seek case after overlap
  removal and passing reliability/runtime gates.
5. **E-Smoke + smoke-bearing E-References (complete):** deleted all remaining
  smoke sources, reporter, reader, runner, config and package script together
  with live guidance.
6. **E-Tier + tier-bearing E-References (complete):** deleted both matrix specs,
  three-project config, package script and final shared probe; retained only the
  accepted forced-seek project on port 3030.
7. **Final E-References sweep:** prove zero operational residue while retaining
  changelog/archive history.

E1 reverse performance is optional and does not serialize this sequence. E2-E5
are not smoke/tier deletion gates. Exact files and zero-residue searches are in
[Phase E](performance-harness-5-workplan.md#phase-e-remove-dormant-infrastructure).

## Session Boundaries

Phases A-C and the first six old boundaries are complete. Remaining sessions
stay small enough to falsify one claim:

1. D-Zero ownerless diagnostic/prototype deletion. **Complete.**
2. D-Wheel remaining habitual election.
3. D-Credit replacement-or-relinquishment.
4. D-Direction rendered-rank oracle. **Accepted.**
5. D-Center exact placement election.
6. D-Tier compact forced-seek owner. **Accepted.**
7. Optional E1 reverse-P8 window only when an active comparison requests it.
8. E-Smoke source/shell deletion and live-reference cleanup.
9. E-Tier matrix/config deletion and final topology validation.

For every implementation session: identify existing tests that assert the old
behavior, add the discriminating test first, run focused validation, then run
the full relevant surface. Never weaken an assertion merely to preserve a
green run.

## Final Deletion Gate

Before deleting any source suite, the deletion PR/session must show:

- A row-by-row map from every removed test family to replacement or explicit
  no-value decision.
- Passing focused replacement tests and full habitual local E2E when local
  correctness changed.
- A valid, complete perf dry-run when metric code changed.
- No remaining imports, scripts, docs, or config references.
- No loss of a real-data-only oracle without an equivalent synthetic fixture or
  an explicit accepted decision to stop testing it.
- `AGENTS.md`, component routing, and changelog updated only when the actual
  implementation/deletion occurs, not for this report-only plan.
