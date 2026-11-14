# Scroll and position preservation: test inventory

> Decision-oriented inventory, updated 2026-08-30. This records what each test
> surface can prove and what is worth excavating. It is not a test plan, a spec,
> or permission to delete tests without a later review.

## Scope and headline

The project has four evidence surfaces:

- **Vitest:** fast, habitual bookkeeping and pure-logic evidence. It cannot
  observe browser layout or real scroll preservation.
- **Local e2e:** habitual Playwright against local Docker ES. The raw fixture has
  10,000 documents; the default app query returns 9,998.
- **TEST smoke/diagnostics:** manual Playwright against real, pinned TEST data.
  These are the only current large-corpus correctness observations.
- **e2e-perf/exploration:** occasional performance measurements and temporary
  characterization scaffolding. Neither is ordinary correctness coverage.

The useful outputs are: a smaller valid habitual suite, consistent helper
semantics, selected real-scale checks, and deletion/archive of dead diagnostic
material. The inventory must not grow into another historical dump.

## Runner and corpus map

| Surface | Selection | Corpus | Role | Status |
|---|---|---|---|---|
| Vitest | `npm --prefix kupua test` | mocks/in-memory | pure/store logic | habitual |
| Local e2e | `playwright.config.ts` → `e2e/local/` | local ES, 10k raw / 9,998 default | browser correctness | habitual |
| Retired tier matrix | Historical | local ES, forced tier variants | duplicated source evidence | removed in E-Tier |
| Retired smoke menu | Historical | TEST ES, real scale | source evidence migrated or explicitly dropped | removed in E-Smoke |
| Other smoke | direct config invocation | usually TEST ES | diagnostics/investigations | direct-only |
| Perf audit | `e2e-perf/run-audit.mjs` | TEST, pinned cutoff | jank/perceived performance | preserve baseline |
| Exploration | throwaway configs | controlled local/TEST | characterization data | temporary |

The habitual config selects `e2e/local` and excludes only
The old tier matrix and drift/flash matrix were removed in E-Tier after one
compact forced-seek owner entered the habitual config. References below describe
the historical excavation, not runnable surfaces.
The smoke runner exposes only `manual-smoke-test.spec.ts` and
`smoke-scroll-stability.spec.ts`, despite the smoke config matching all smoke
specs. This inventory predates E-Smoke retirement; its old runner/config counts
are historical rather than current operational guidance.

## Local corpus facts

The fixture has exactly 10,000 NDJSON lines and raw local ES has 10,000
 documents. The app's default query returns 9,998 because its current query
 builder excludes one document with `softDeletedMetadata` and a different
 document with nested `usages.status: replaced`; both exclusions are intentional
 unless the user opts in ([es-adapter.ts](../../../src/dal/es-adapter.ts#L461-L484)).

The existing valid small-corpus tests use
`since=2026-03-15&until=2026-03-20`; a read-only count returned **517** effective
results. This is suitable for a genuine buffer-tier run. The default 9,998-result
corpus is not: `BUFFER_CAPACITY` is 1,000
([tuning.ts](../../../src/constants/tuning.ts#L24-L35)).

## Vitest inventory

### Direct preservation/bookkeeping files

| Files | What they prove | Limits |
|---|---|---|
| `stores/search-store.test.ts`, `search-store-extended.test.ts` | buffer, seek, extend/evict, positions, sort-around-focus | no DOM truth |
| `stores/search-store-position-map.test.ts` | tier thresholds and map lifecycle | no browser scrolling |
| `stores/search-store-eviction-cursor.test.ts` | eviction cursor continuity | store-only |
| `stores/search-store-keyword-seek.test.ts` | keyword seek strategy | algorithm/data-source only |
| `stores/search-store-pit.test.ts` | PIT lifecycle | no layout |
| `hooks/useDataWindow.test.ts`, `useDataWindow-anchor.test.ts` | global/local mapping and viewport-anchor bookkeeping | virtualizer/geometry abstracted |
| `hooks/useReturnFromDetail.test.ts`, `useImageTraversal.test.ts` | detail return and traversal logic | not full browser history |
| `lib/grid-scroll-anchor.test.ts`, `buffer-column-align.test.ts` | pure anchor and density geometry | no actual DOM |
| `lib/build-history-snapshot.test.ts`, `history-snapshot.test.ts`, `orchestration/history-key.test.ts` | snapshot/key mechanics | not browser integration |
| `lib/orchestration/search.test.ts`, `sort-only.test.ts` | navigation classification and orchestration | implementation-level |
| `dal/position-map.test.ts`, `es-adapter.test.ts`, `sort-builders.test.ts` | map, ES, and cursor mechanics | no visual preservation |

Other `src/**/*.test.ts(x)` files are feature, selection, CQL, enrichment,
collection, or utility coverage. Inventory them at file level only; do not count
them as preservation evidence merely because they touch navigation or state.

The former `exploration/instrument/`, `exploration/fuzzer/`, and
`exploration/spikes/` trees were deleted on 2026-08-31. They found useful bugs
but did not produce a trustworthy characterization corpus; their aggregate
campaign results are not preservation evidence. Rebuild a focused probe only
for a specific migration hypothesis, not as another test surface.

## Habitual local e2e inventory

Current lexical declaration counts are orientation only; Playwright's observed
habitual run is the authoritative executed count.

| File | Declared tests | Relevance | Election note |
|---|---:|---|---|
| `local/scrubber.spec.ts` | 76 | direct, dominant | first assertion-level cleanup complete; structural split remains |
| `local/browser-history.spec.ts` | 38 | direct, dominant | compare repeated detail/reload/back paths |
| `local/focus-preservation.spec.ts` | 8 | direct | strong candidate source |
| `local/keyboard-nav.spec.ts` | 15 | direct/adjacent | retain distinct no-focus vs focus contracts |
| `local/phantom-focus.spec.ts` | 8 | direct | useful, but phantom contract remains distinct |
| `local/buffer-corruption.spec.ts` | 12 | direct | compare against scrubber reset tests |
| `local/ui-features.spec.ts` | 22 | mixed | extract detail/boundary cases only |
| `local/selections.spec.ts`, `selections-mobile.spec.ts` | 29, 7 | adjacent | selection persistence is not position preservation |
| `local/drift-flash-matrix.spec.ts` | 4 | diagnostic | old oracle; not habitual despite location |
| `local/tier-matrix.spec.ts` | 18 | direct tier evidence | manual; corrected run recorded |
| `local/collections.spec.ts` | 8 | unrelated | exclude from this project |
| `local/cql-search-quoting.spec.ts` | 1 | unrelated | exclude |
| `local/toast.spec.ts` | 5 | unrelated | exclude |
| `local/visual-baseline.spec.ts` | 4 | adjacent | visual state, not preservation oracle |

Main redundancy clusters to compare at assertion level:

- seek landing and post-seek scrolling across `scrubber`, tier matrix, smoke,
  and perf journeys;
- sort with focus across `scrubber`, focus, tier, smoke, and perf;
- density round trips across `scrubber`, tier, UI, and perf;
- detail close/restoration across `browser-history`, `ui-features`, phantom,
  and smoke;
- Home/End/reset across keyboard, scrubber, tier, and buffer-corruption;
- “focus by nth item, then assert in buffer” across several files.

Tests are not redundant merely because their actions match: retain distinct
Type A properties, tiers, modes, or corpus regimes. Remove duplicate
implementation-shaped assertions, warning-only checks, and historical cases
that no longer exercise a unique contract.

## Tier matrix and smoke excavation

### Tier matrix

The tier matrix has 18 tests and is valuable raw material for tier dimensions:
seek top/middle/bottom, drag, scroll after seek, density, focused sort, Home/End,
and table/grid transitions. Its original buffer project is invalid: it labels
9,998 results as buffer tier even though the application capacity is 1,000.
The old matrix produced **47 passed, 9 failed, 1 interrupted, 9 not run** after
its 30-minute timeout. The three buffer drift failures reproduced independently,
but were caused by this invalid simulation; the six seek failures were page-close
teardown fallout.

Do not replace that history with a green result. Corrected setup uses:
use the 517-result query for buffer-specific cases, while treating two-tier and
seek cases as 9,998-result local runs. Document that this is tier-specific
coverage, not a paired same-population comparison. The corrected run completed
with 63 passing cases plus 3/3 isolated seek cases after increasing only the
seek-tier test budgets. Decide whether any deserve promotion; do not modify
production code for this setup issue.

### Smoke files

| File | Value to excavate | Initial disposition |
|---|---|---|
| `manual-smoke-test.spec.ts` | real-scale seek, keyword sort, density, detail workflow | reviewed; retain unique source cases only |
| `smoke-scroll-stability.spec.ts` | real-scale seek, cold start, sustained scroll/eviction | reviewed; retain unique source cases only |
| `focus-preservation-smoke.spec.ts` | TEST-scale focus/search cases | retain selected real-scale cases; T6 diagnostic-only |
| `cited-scenario.spec.ts` | null-zone and two-tier drift/flash observations | diagnostic source; not correctness coverage |
| Retired phantom/history diagnostic | real-scale phantom/history observations | deleted in D-Zero after maintained owners were verified |
| `flash-measurement.spec.ts` | historical flash sites | reviewed; likely archive after reference check |
| Retired Home-logo diagnostic | historical reset cases | deleted in D-Zero; overlaps buffer-corruption |
| Retired history diagnostic | one history diagnostic | deleted in D-Zero after exact history owners were verified |
| `centering-diag.spec.ts` | fullscreen/detail centering | reviewed; retain only if requirement is unique |

The selected smoke and diagnostic files were run once with TEST mode active.
Keep real-scale cases only when local data cannot model their failure mode.
Delete or archive diagnostic leftovers after their useful scenario/assertion has
been extracted and references updated; do not start another broad TEST sweep.

## e2e-perf

Preserve `e2e-perf` scenarios and result baselines unchanged during this project.
They measure jank, CLS, DOM churn, frame timing, and perceived latency; some
journeys overlap with scroll/seek/density/detail, but that makes them performance
evidence, not correctness tests. Any perf-harness change requires a deliberate
before/after baseline campaign.

`experiments.spec.ts` is tuning infrastructure, not a correctness suite.
The retired selection-stress prototype was also Playwright code under `e2e-perf`, despite its
stress-test name; classify it separately from Vitest.

## Shared helpers and probes

`e2e/shared/helpers.ts` is used by local e2e, tier, smoke, perf, diagnostics,
and exploration. It is the highest-leverage consolidation target.

| Family | Methods | Audit question |
|---|---|---|
| Readiness | `waitForResults`, `waitForNotLoading`, `waitForSeekComplete`, `waitForPositionMap` | DOM present, store idle, map ready, or fully settled? |
| Seek | `seekTo`, `dragScrubberTo`, `clickScrubberAt` | identical map-wait and settle semantics? |
| Position | `getScrollTop`, `getFirstVisibleImageId`, `getFocusedCellTop`, `getStoreState` | DOM visibility versus buffer presence clearly named? |
| Focus | `focusNthItem`, `waitForStableNthImageId` | setup by ordinal versus assertion by stable ID? |
| Modes/views | `ensureExplicitMode`, `ensurePhantomMode`, `switchToGrid`, `switchToTable` | preconditions explicit and valid per mode? |
| Detail/history | `openDetailForNthItem`, close helpers | distinct close paths intentional? |
| Scroll simulation | `scrollBy`, `pageDown`, `pageUp`, `scrollDeep` | live-state and tier-aware? |

The first helper consolidation is complete: `focus-preservation-smoke.spec.ts`
and the retired phantom-drift diagnostic imported the shared `waitForSettle`; their
local copies had the same readiness predicate and 2-second post-settle delay.
The shared helper remains diagnostic-oriented and is not a replacement for
the weaker `waitForResults` or the store-only seek waits.

Remaining competing implementations:

- shared `drift-flash-probes.ts` has `captureProbe`, visible-cell capture,
  `waitForSettle`, drift, and flash analysis;
- the retired phantom-drift diagnostic duplicated probe and visible-cell logic;
- the exploration instrument has a stronger tuple-based sample and unified
  settle detector, but is intentionally temporary.

Two helper names need contract tightening before election:

- `getFirstVisibleImageId()` currently returns `results[0]`, the first buffer
  item, not the first image whose DOM rectangle intersects the viewport. It
  should be renamed or its implementation/oracle made explicit.
- `waitForNotLoading()` checks for the scrubber tooltip's pulse class, whereas
  `waitForSeekComplete()` checks store state. Callers must not treat the former
  as a search-settled signal.

Habitual-local usage adds two migration constraints:

- `seekTo()` is the high-value path: it waits for position-map readiness when
  relevant, then uses tier-aware seek-generation or store-settle logic. It is
  not interchangeable with `clickScrubberAt()`, which still uses an 800 ms
  delay plus the weak `waitForResults()` check.
- `focusNthItem()` has deliberate stable-ID lookup, forced click, and one
  deterministic viewport correction for virtualizer churn. It is high leverage
  but should not be simplified while migrating callers.
- Sort and density helpers still use fixed delays plus `waitForResults()` in
  places, while focus-preservation callers use `waitForSortAroundFocus()`.
  These are different readiness contracts, not harmless stylistic variants.

There is no isolated unit suite for `KupuaHelpers`; confidence comes from the
habitual local e2e run. Any future shared-helper change therefore needs the
affected callers migrated together and the full local e2e surface rerun.

Habitual assertion-level comparison found one likely naming/consolidation
cluster, but not a safe drop-in replacement:

- `browser-history.spec.ts` defines `waitForSearchSettled()` with the same
  store predicate as shared `waitForSettle()` but without the 2-second DOM
  settle delay. Its assertions are mostly URL/store-history assertions;
  focus-preservation uses `waitForSortAroundFocus()` instead. A future shared
  API should name these as separate store-settled and browser-settled contracts
  rather than silently standardising the wait duration.
- `scrubber.spec.ts` mixes high-level `seekTo()` with deliberate low-level
  clicks, direct `waitForSeekGenerationBump()`, and inline frame polling. Those
  are separate timing experiments, not helper redundancy by themselves.
- `browser-history.spec.ts` calls `getFirstVisibleImageId()` for assertions
  that are really about the first buffer item. Renaming that helper would
  require revisiting these callers, not just changing its implementation.
- `phantom-focus.spec.ts` duplicates localStorage mode setup and direct
  navigation instead of using `ensurePhantomMode()`/`goto()`. This is a mode
  setup pattern to compare, not evidence that the shared helper should absorb
  phantom-only assertions.
- `buffer-corruption.spec.ts` has a substantial local `assertCleanTopState()`
  contract combining buffer integrity, scroll-top, scrubber, positions, and
  errors. It is a candidate for a named invariant helper only after comparing
  it with the scrubber reset assertions.
- `keyboard-nav.spec.ts` hardcodes row heights for alignment checks, whereas
  the scrubber suite imports layout constants. This is assertion duplication
  with a potential drift risk, but changing it would affect keyboard-specific
  contracts rather than helper readiness semantics.

Consolidate only after comparing contracts. In particular, preserve explicit
opt-outs for measuring races, distinguish store state from DOM truth, and never
use ordinal selection or `aria-rowindex` as identity.

### Planning-grade helper migration brief

This is the recommended input to a later helper-consolidation session. It is
not authorization to change shared infrastructure.

#### Contract matrix

| Helper/surface | Current contract | Primary habitual callers | Risk/status |
|---|---|---|---|
| `goto()` / `gotoWithParams()` | Full navigation, then weak rendered-content readiness | all local suites | retain; changing readiness changes every test |
| `waitForResults()` | DOM has a result container with rendered children; does not prove store idle or settled geometry | buffer, phantom, UI, selection tests | retain as weak DOM-ready contract; do not strengthen silently |
| `waitForSeekComplete()` | Store `loading=false`, results nonempty; errors are left for callers to assert | scrubber, tier, smoke | store-settled only; not enough for two-tier stale-buffer detection |
| `waitForSeekGenerationBump()` | `_seekGeneration` advances, then store is not loading with results | scrubber, keyboard, tier | tier-aware transition contract; preserve predecessor generation input |
| `waitForSortAroundFocus()` | Sort-around-focus status null and store not loading | focus/local suites | final store coordinates are atomic; still does not prove painted DOM |
| shared `waitForSettle()` | Store idle, no sort-around-focus status, results present, then 2-second render delay | drift/flash and smoke diagnostics | safe shared diagnostic wait; separate from weaker waits |
| `clickScrubberAt()` | Low-level click, fixed 800 ms delay, then `waitForResults()` | scrubber experiments | legacy/timing probe; do not replace with `seekTo()` blindly |
| `seekTo()` | Position-map wait when applicable, tier-aware interaction, seek settle, render delay | dominant habitual local path | highest-value shared path; change only with full migration/run |
| `focusNthItem()` | Stable ordinal lookup to stable ID, forced click, one deterministic viewport correction | scrubber, focus, keyboard, history, tier | high leverage; preserve virtualizer workaround |
| `getFirstVisibleImageId()` | Returns `results[0]`, the first buffer item | browser-history | misleading name; rename only with caller-by-caller oracle review |
| `getFocusedCellTop/Left()` | DOM geometry for focused or phantom target, nullable if absent | focus/density/detail tests | useful DOM oracle; distinguish from store position |
| `getStoreState()` / `assertPositionsConsistent()` | Zustand bookkeeping and buffer map integrity | most preservation suites | store truth only; never substitutes for DOM visibility |

#### Redundancy and election map

- **Candidate for one named API:** store-settled versus browser-settled waits.
  `browser-history` has a local store wait without the shared 2-second delay;
  diagnostic probes need the delay. Preserve both contracts under explicit
  names rather than choosing one universal timeout.
- **Candidate invariant helper:** `buffer-corruption`'s `assertCleanTopState()`
  combines offset, buffer length, scroll-top, scrubber, position-map, and error
  checks. Compare it assertion-by-assertion with scrubber reset/Home tests before
  extracting it.
- **Candidate naming repair:** split “first buffer item” from “first DOM-visible
  image.” The current browser-history callers need the former; do not change
  semantics under the existing name.
- **Not redundancy:** scrubber's low-level clicks, generation waits, and inline
  frame polling. These deliberately measure races and settle windows.
- **Not redundancy:** grid/table geometry or explicit/phantom mode tests when
  the actions overlap. Their coordinate and focus contracts differ.
- **Candidate source only:** tier and smoke helpers/probes. They may supply
  real-scale assertions for future local tests, but are not migration targets.

#### Safe migration protocol

1. Freeze the current habitual baseline: full local Vitest and local e2e, with
   observed counts and runtime recorded.
2. Add tests for the new helper contract or invariant before migrating callers;
   include DOM, store, and browser-lifecycle distinctions where relevant.
3. Migrate one habitual caller family, starting with a low-risk readiness or
   invariant helper; keep diagnostic race probes unchanged.
4. Run the affected local file(s), then the full local e2e suite. Run Vitest if
   any source or shared test support under `src/` changes.
5. Compare failures, test counts, timing, and oracle meaning with the baseline;
   stop and investigate any changed failure shape before migrating another
   family.

#### Candidate order and explicit deferrals

Recommended order: named store/browser settle contracts; clean-top invariant;
first-buffer versus DOM-visible naming; then mode setup and geometry constants.
Defer probe unification, `focusNthItem()` simplification, strengthening
`waitForResults()`, replacing low-level scrubber interactions, and any attempt
to promote whole tier/smoke suites.

#### Negative knowledge to preserve

- `bufferOffset` is not viewport position.
- Scrubber-thumb movement during phantom promotion is not itself a failure;
  viewport anchor/content position is the relevant user-facing oracle.
- `waitForNotLoading()` observes a scrubber animation class, not search state.
- `waitForSortAroundFocus()` proves final store settlement, not painted-DOM stability; use frame sampling for the latter.
- Ordinal locators and `aria-rowindex` are unstable identity mechanisms under
  virtualization.
- A green diagnostic assertion does not prove pixel stability when its probe
  reports contradictory movement.

## Execution results

### 2026-08-30

- Habitual Vitest: **58 files, 1,154 tests passed**.
- Instrument calibration: **36 tests passed**.
- Fuzzer/round-trip calibration: **6 files, 37 tests passed**.
- Habitual local e2e: **248/248 passed in 10.3 minutes** against local Docker ES.
- Tier matrix with the original invalid buffer simulation: **47 passed, 9
  failed, 1 interrupted, 9 not run**, timeout at 30 minutes.
- Focused buffer diagnostic rerun: **3/3 failed reproducibly**; later probe
  showed the partial state was an invalid 9,998-result buffer-tier setup, not a
  production regression.
- Corrected tier matrix: **63 passed, 3 seek-tier cases timed out** under the
  old 60-second per-test budget; after a seek-only budget increase, those cases
  passed **3/3**, taking about 1.0, 1.0, and 1.6 minutes.
- Supported TEST smoke surface: **29/29 passed in 5.6 minutes** against pinned
  real data. The main corpus was 1,237,211 results; S8 exercised a 1,116-result
  sort case and S9 exercised deep scroll/eviction with a 1,000-item buffer.
  The smoke JSON was inspected, its useful metrics were extracted here, and the
  generated report was deleted.
- Direct TEST focus-preservation suite: the initial run was **10/12 passed in
  2.1 minutes**. T6 recorded a scrubber-thumb drop from about `415.6` to
  `0.1`; a focused rerun reproduced it with 56 samples (`415.1` to `0.1`) while
  the store offset moved `0` to `751,575`. This is intended phantom-position
  bookkeeping, not a product failure: the filtered viewport is being retained,
  and the focused trace showed `scrollTop` stayed at `5757px`. The test's
  thumb-stability assertion is therefore the wrong oracle and should not be
  promoted. T7 initially ended at
  `bufferOffset=0`, but a focused rerun passed: the viewport anchor survived at
  `bufferOffset=651,380`. Treat the original T7 result as transient or
  setup-race evidence, not a confirmed product failure.
- Direct TEST cited-scenario diagnostics: **4/4 passed in 55.7 seconds**. The
  focused null-zone cases recorded 3 distinct grid positions during each sort
  transition, and the Dublin two-tier case recorded 2; all reported zero old
  ratio drift and zero content/scroll flash. Retain this as diagnostic evidence,
  not as proof of a pixel-stable transition, until the probe is replaced or
  reconciled with the characterization instrument.
- Direct TEST phantom diagnostic: **3/3 passed in 1.3 minutes**. Four phantom
  back/forward cycles retained the viewport anchor and geometric ratio exactly;
  the explicit control did likewise. DOM geometry was consistently 4 px below
  the geometric estimate. Phantom centre-image identity changed across a
  cycle, so this supports anchor preservation only, not full visible-content
  identity preservation.
- Direct TEST flash diagnostics: **9/9 passed in 1.4 minutes**. The measurement
  still recorded 2-frame scroll flashes during density changes in buffer and
  seek modes, and a 256-frame buffer popstate flash; content flash was absent.
  These are diagnostic observations under the old probe, not failed correctness
  assertions, and should be compared with the local buffer-corruption coverage.
- Direct TEST home/logo diagnostic: **4/4 passed in 30.3 seconds**. Deep Home
  actions ended at `bufferOffset=0`, `scrollTop=0`, and scrubber thumb `0`.
  This substantially overlaps habitual `buffer-corruption` coverage and is
  currently better treated as historical source material than as a promotion
  candidate.
- Direct TEST history/centering diagnostics: **4/4 passed in 1.2 minutes**.
  Grid and table detail/fullscreen exits centred at zero offset from the usable
  viewport; the table's 18 px container-centre offset is its 36 px header.
  History length stayed constant across the back/forward trace while pushed
  entries had distinct `kupuaKey` values.

The local e2e run emitted two known-looking position-map fetch warnings during
navigation and an unrelated CQL warning; neither failed a test. The original
tier failure counts remain as historical evidence of the invalid setup;
disposable Playwright reports and traces were removed.

## Next actions

These are test-maintenance follow-ups, not the current position-preservation
architecture sequence. The current architecture task starts with the product
contract in `scroll-and-position-preservation-testing-3-workplan.md`.

1. Treat the planning-grade helper brief above as the handoff for a separate,
  deliberate helper-consolidation session.
2. Begin that session by freezing the recorded local baseline, adding helper or
  invariant tests, and migrating one habitual caller family at a time.
3. Resolve the remaining dispositions of diagnostic smoke files and the
  assertion-level scrubber/history and buffer-corruption overlaps before
  deleting or promoting anything.
4. Leave e2e-perf scenarios and baselines unchanged unless a concrete measurement
  defect is demonstrated.

The TEST smoke JSON and diagnostic failure traces were inspected. The JSON and
all generated TEST reports/traces were disposable after extracting the findings
above; they were removed. No production code or perf baselines changed.

The seek-tier duration is a local harness characteristic, not evidence of the
normal user path being this slow. Local `.env` deliberately sets
`VITE_MAX_RESULT_WINDOW=500` and `VITE_DEEP_SEEK_THRESHOLD=500` to force deep
seek against the 10k fixture; these settings create many small local ES pages.
The per-test timeout adjustment remains an uncommitted test-only change pending
the later decision whether this stale tier matrix is retained at all.

## Non-goals

- No broad production refactor during inventory/excavation.
- No new habitual test surface until its invariant and runtime are justified.
- No wholesale stale-suite run against TEST.
- No perf baseline changes by accident.
- No final product preservation contract here; that belongs to Phase 1 of the
  reset consolidation workplan.
