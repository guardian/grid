# Test Maintenance Assessment

Deferred test-maintenance candidates, not demonstrated product bugs or an approved
implementation queue. The [E2E README](../../e2e/README.md) owns current commands,
fixture contracts and test-writing guidance. Select a candidate explicitly before
implementation; do not treat this document as a reason to run a new test or perf campaign.

## Evidence Status

The helper assessment was made on 4 October 2026 against `ae08e779d` plus the
then-uncommitted L41 work. Moving it out of the README does not revalidate those
source findings against current code. File/owner references below are starting
points for a new bounded check, not certification that duplication still exists.
The [closed continuity campaign](zz%20Archive/not-yet-another-audit-ledger.md)
owns its implementation history and measurements. No helper extraction is claimed
to reduce wallclock time without an appropriate comparison.

## Candidate Improvements

| Candidate | Evidence and potential value | Boundary and disproof checks |
| --- | --- | --- |
| Browser queued-frame gates | [Density](../../e2e/local/scrubber.spec.ts), [preview exit and detail return](../../e2e/local/ui-features.spec.ts) repeat capture/release/cancellation/cleanup mechanics. The original assessment favoured this as a substantial maintenance pilot, not a measured speed improvement. | Start with density and detail only. Share the owned rAF resource, not callback-selection policy or native exit. Prove unrelated callbacks pass through, release runs once, nested callbacks stay deferred and failure restores only owned methods. Hostile replay must establish actual cancelled-callback delivery, not merely unchanged scroll. Reject extraction if those owners need different resource semantics. |
| Unit buffer-position invariant | [Main](../../src/stores/search-store.test.ts) and [extended store tests](../../src/stores/search-store-extended.test.ts) duplicate an independent assertion. Many callers amplify maintenance value but are not many duplicate implementations. | Accept a snapshot and label; check resident identities against buffer origin plus local index. Preserve holes and useful failures. No implicit singleton, production-derived oracle or map-size-equals-buffer assumption. Test nonzero origin, wrong/missing positions and legitimate extra indexed-map entries. Keep browser proof separate. |
| Unit animation-frame queue | [Scroll effects](../../src/hooks/useScrollEffects.test.ts), [detail return](../../src/hooks/useReturnFromDetail.test.ts), [fullscreen settlement](../../src/lib/fullscreen-exit.test.ts) and [composed detail](../../src/components/ImageDetail.test.tsx) contain deterministic request/cancel/flush queues. | Pilot two owners when they next need maintenance, independently of browser gates. Keep React act, timers, mounting, fullscreen and clock choice outside. One flush means one frame; nested work waits, cancelled work does not flush, reset isolates cases and deliberate obsolete delivery remains possible. Reject a generic scheduler framework. |
| Perf successful-route observation | [Short](../../e2e-perf/perceived-short.spec.ts) and [long](../../e2e-perf/perceived-long.spec.ts) collectors were identical; [jank](../../e2e-perf/perf.spec.ts) additionally used a predicate and idempotent finish. | Begin with short/long only. Preserve successful-response/data-route classification, client-only absence, caller epochs and cleanup. Test failed/non-data/late responses, both transports and repeated finish. Keep jank's selection-metadata predicate, timing projection and action cadence outside the initial extraction. Measurement trust outweighs deduplication alone. |

## Additional Candidates

The following candidates come from September/October work and were checked against
the named source sections on 16 October 2026. These are bounded source assessments,
not executed test failures, a whole-suite audit or approval to implement them.

| Candidate | Evidence and current qualification | Boundary and discriminator |
| --- | --- | --- |
| Separate density placement from extension readiness | The [Phase C deferred list](zz%20Archive/performance-harness-7-phase-c-ledger.md#deferred) proposed a density-helper split. Current [shared switches](../../e2e/shared/helpers.ts#L969) still await restoration, visible results and `waitForExtendReady`; the latter awaits loading and adds 200ms. The completed readiness-free selection guard does not split these contracts. | Inspect callers to find a family needing placement but not immediate extension, and measure its avoidable wait before claiming speed. Preserve the existing wrapper while piloting explicit placement versus extension readiness in a bounded set of callers. Retain active-selection no-op semantics, painted geometry, pending-density interventions and immediate-wheel extension controls; never just delete the cooldown margin or substitute `loading=false` for action completion. |
| Nullable mock corpus fidelity | [L44](zz%20Archive/not-yet-another-audit-ledger.md#optional-nullable-mock-coverage-l44) remains an unselected fixture capability proposal. In [MockDataSource](../../src/dal/mock-data-source.ts#L124), tuple extraction handles Credit but not Taken on; missing-field filtering handles Taken on but falls through to a top-level lookup for nested Credit. Full-corpus ordering remains opt-in through sparse/skewed inputs. | Select only for a real nullable-composition coverage need. First prove independent valued/null corpora, complete primary/suffix/ID ordering, missing-last in both directions, nested missing-field filtering and reverse-boundary pages. Then add composition coverage to existing owners. Do not revive invalid drafts, add a production workaround, change ES limits or turn this into a prerequisite for the already-covered table-tail repair. |
| Explicit initial-seek precondition in table-tail history | The [B19 cold-review disposition](zz%20Archive/not-yet-another-audit-ledger.md#b19) suggested optional hardening. Current [history cases](../../e2e/local/browser-history.spec.ts#L55) assert the coordinate regime and full final-row arrival, but do not assert a generation increase for the initial End. Resident End separately asserts no generation change. | Capture the initial generation and prove the departure does not already contain the real tail, then require a completed newer seek. This protects against future fixture changes weakening the seeking-End coverage; it is not a current product defect or a reason to add another browser journey. Keep the independent last-row and Back/reload DOM assertions. |
| RTT diagnostic validity and transport labelling | The September disposition of [metrics refresh](zz%20Archive/metrics-refresh.md) retained this narrow residual. Current [probeRtt](../../e2e-perf/run-audit.mjs#L352) records elapsed time after rejected fetches, does not inspect response status and has no explicit timeout. The runner invokes the same direct-ES probe in API modes; it does not measure the application's API route. | Bound the probe, distinguish successful observations from unavailable/failed ones and label the measured transport explicitly. Do not turn a fast failure into a latency baseline or claim the probe isolates pure network RTT. Start with synthetic success, non-2xx, rejection and timeout checks; do not invent another authenticated live probe or trigger a performance campaign. This concerns diagnostic metadata, not evidence that browser action-latency measurements are wrong. |

R1's near-end-request/not-actual-end controls are not candidates: the
[completed R1 record](justified-density-prototype-plan.md#3-verification-and-performance-coverage)
records their addition. Completed Phase C deletion/repair elections and the retired
smoke/tier suites are likewise not a new maintenance queue. Historical proposals
must be reconciled with their final dispositions before reuse.

R3's review also suggested missing-`aria-pressed` and absent density-generation
controls. The [selection guard](../../e2e/shared/density-selection.ts) and
[readiness helper](../../e2e/shared/helpers.ts#L950) retain explicit fallback branches;
these were non-blocking unchanged-branch suggestions. Consider them only while
editing those owners, not as another standalone project or a new rejection policy.

This pass grepped the documentation and recent review notes, then read the named
helper, mock, runner and history-test sections. Completed September consolidation
elections, superseded measurement wishlists and feature-specific migration tests
were not promoted into this queue. No tests or live/performance checks were run;
the four original helper candidates above were not comprehensively revalidated.

## Reuse From Retained Diagnostic Probes

The [ledger's reuse proposal](zz%20Archive/not-yet-another-audit-ledger.md#evidence-tooling-and-performance)
applies to the [Click-to-Open core](../experiments/not-yet-another-audit-click-open-probe.js)
and [Click-to-Focus mirror](../experiments/not-yet-another-audit-click-focus-probe.js).
The mirror already imports the core; these are not two independent harnesses to
consolidate. The [completed L41 pilot](zz%20Archive/not-yet-another-audit-ledger.md#test-refresh-pilot-l41)
delivered the shared hit-tested input observer, not a wholesale probe migration.

**Disposition:** keep a bounded reuse opportunity here, not an automatic porting
task. Consult relevant probe capabilities when a selected test needs them; prefer
existing maintained helpers, then extract only a demonstrated missing shared contract.

| Capability | Current reuse boundary / next decision |
| --- | --- |
| Result-cell input | [waitForHitTestedImagePoint](../../e2e/shared/helpers.ts#L331) already supplies observation-only hit-tested coordinates across grid/table/Justified. Reuse it; do not copy the probes' coordinate heuristics or merge mode-specific click behaviour into it. |
| Identity/geometry observation | The core's `capture`/`observe` track named identities, membership/focus/selection, clipping, absence and displacement over frames. Current helpers provide narrower placement/position observations. A multi-identity observer is worth extracting only if named maintained consumers need that same result; keep action/readiness/anchor policy outside, define usable bounds explicitly and retain assertion precision instead of inheriting the probe's rounding. |
| Completed-response holds | The core's `holdNext` records claim/readiness/release/abort state and restores method descriptors. [Pending browsing fixtures](../../e2e/shared/browse-density.ts#L63) already own holds, work draining and cleanup. Compare actual request-selection and lifetime contracts before sharing a small gate; retain local-system guards, unchanged responses/signals, cleanup on failure and observable delivery. A response gate is not the queued-rAF gate candidate above, and neither proves server cancellation. |
| Readiness, reload and environment checks | Existing helpers and the [browser playbook](embedded-browser-playbook.md) own these techniques. The probe's `mediaReady` flag is not equivalent to [decoded-detail readiness](../../e2e/shared/helpers.ts#L1358); generic list readiness must not hide early-close races. Keep query/history ownership, reload reinstallation and explicit backend/foreground checks with the caller. |

The inspected core still selects only grid/table containers, classifies tiers with
literal thresholds, reads fixed-row geometry and uses legacy density-button labels
and density URL setup. Those assumptions cannot be copied into current Justified
or configurable-threshold tests. Keep raw-source runner evaluation, private store/
snapshot mutation, natural live corpora, broad mode/tier matrices and synthetic
device state diagnostic unless a separately selected contract justifies replacement.

Before adopting anything, name the maintained consumers and duplication removed,
prove equivalence with independent geometry/identity and failure/cleanup controls,
and stop if the existing helper already meets the need. No new general harness,
new browser suite or full-probe rewrite is implied. Preserve the probes as comparison
evidence until a separately scoped retirement establishes what replaces them.

Reading here covered the core installer/capture/observer/readiness/gate/cleanup,
the mirror's shared installation and basic caller, plus nearby maintained helper
and browsing-fixture implementations. The other scenario runners were not fully
reviewed or executed; current end-to-end probe compatibility remains unverified.

## Selecting a Change

- Recheck the claimed duplication and its real consumers before estimating a fix.
- Choose one responsibility, initially no more than two helpers/two consumer families.
  Define removed duplication, preserved caller policy, failure controls and a stop condition.
- Preserve assertions, meaningful pending/settled timings and actual-input/paint proof.
  Similar names or bodies do not establish interchangeable contracts.
- Keep navigation snapshots/keys, caller clocks, mobile geometry and measurement epochs
  outside a shared resource helper unless the selected responsibility genuinely owns them.
- Preserve [timing/route attribution controls](../../e2e-perf/validation/harness-validation.test.mjs).
  The original timing-projection assessment noted a source scan using `slice(1)` to
  skip a local declaration; moving that declaration must not silently skip a real caller.
- Agree review and validation appropriate to the selected change. A maintained passing
  fixture is not a live/performance certificate; workload changes need a separate decision.
- For speed work, inspect existing timings first and compare the actual proposed change.
  Fewer lines/helpers do not establish a runtime benefit.

## Assessment Coverage and Limits

The original source scan covered 118 files, comparing exact function bodies and
repeated helper names. It was not an exhaustive semantic test audit:

| Surface at that checkpoint | Reading depth |
| --- | --- |
| Browser: 19 TypeScript files | All local specs, shared modules, setup and diagnostic spec syntax-scanned; selected resource/setup regions closely read; remaining features searched, not fully reviewed |
| Perf/harness: 16 TypeScript/MJS files | Scenario specs, environment/configs, runner/reporter and pure harnesses scanned; route/trace/traversal boundaries and applicable guards inspected |
| Unit: 83 test files | All syntax-scanned; four frame owners, both invariant owners, polling, traversal/anchor and enrichment contrasts inspected |
| Existing abstractions | Identity, hit-tested input, placement, decoded media, retained setup, position and frame-sampling boundaries checked |
| Excluded | Archived tests, integration mutation oracle, raw fixtures/media, stored campaigns, wider production algorithms and physical/live replay |

These limits and the original source revision travel with the assessment. No current
exhaustiveness, behaviour equivalence, timing forecast or implementation approval follows.

## Retained Coverage Rationale

The following mappings preserve the useful reasoning behind completed test reductions.
They are historical evidence for future maintenance decisions, not current case counts
or execution instructions. Recheck the named owners before retiring more coverage.

### Detail Restoration Proof

The completed detail reduction removed the combined settled phantom grid/table
original/traversed journeys, not their individual contracts:

| Removed combined journey / distinction | Retained proof |
| --- | --- |
| Settled phantom original return | Settled explicit browser cases retain genuine nonresident reload, entry identity, native signed placement, request reuse and position checks; early phantom cases retain actual single-click/no-ring wiring |
| Settled phantom traversed return | Settled explicit cases retain target lookup, centring, focus and ownership; early phantom cases retain pending-data close, released response and hidden-focus return |
| Mode versus timing | [Mounted detail](../../src/components/ImageDetail.test.tsx) and [store controls](../../src/stores/search-store.test.ts) cover both timings/placements/modes. Mode changes focus permission and pulse/ring policy, not the placement owner. This is not a claim of generic pairwise equivalence |
| Newer input and gestures | [UI features](../../e2e/local/ui-features.spec.ts) retain early keyboard/background-clear and reload A -> B -> reload B -> A cancelled/completed swipe journeys, real Backspace, traversal and session context |

Early-close tests must not await the held restoration. The former combined settled
phantom journeys remain deliberately absent; retained contracts are split across
layers. The [archived B9 record](zz%20Archive/not-yet-another-audit-ledger.md#b9)
owns the measured reduction and its limits.

### B17 Pending Browsing Proof

The completed browsing reduction removed no-focus phantom queued/wheel permutations,
not pending bookmark, discovery, transport, coordinate or geometry distinctions:

| Removed combination / retained distinction | Surviving proof |
| --- | --- |
| No-focus phantom queued/wheel combinations | Explicit counterparts keep synchronous pre-dispatch input/remount, accepted publication and current geometry; mounted scroll-effects tests retain mode policy |
| Bookmark and discovery modes | [Shared browsing scenarios](../../e2e/shared/browse-density.ts) retain real click/detail setup and initiating focus permission where those distinctions matter |
| Publication and arrival | Signal/generation ownership, consumed destination, independent map identity, offset, focus/busy/error settlement and position consistency remain asserted |
| Query discovery and finite AI | Browser and store controls retain narrowed/widened membership, same-query ordering and exclusion of inappropriate ordinary reads |
| Forced-seek departure | [Forced-seek scenarios](../../e2e/local/forced-seek.spec.ts) retain deep departure identity and thumb placement across painted pending frames, including no-density controls |

Synchronous synthetic queued input is not physical-device evidence, and a held
completed client response is not native server cancellation. The
[archived B17 record](zz%20Archive/not-yet-another-audit-ledger.md#b17) owns the
original acceptance and timing limits; these mappings do not select another reduction.