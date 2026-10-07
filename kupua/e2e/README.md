# Kupua Test Suite — Quick Reference

> Agent: read this before touching any test file.

## Continuity Slice Discipline

Follow the ledger's [test-impact and maintenance rules](../exploration/docs/not-yet-another-audit-ledger.md#test-impact-and-maintenance)
and [inline cold-review gate](../exploration/docs/not-yet-another-audit-ledger.md#cold-review-gate).
Each slice names existing tests to strengthen, helper/probe reuse, genuinely new
coverage and setup cost. Map removed assertions to retained proof; preserve early
versus settled readiness and actual-input/paint checks. L41 is a bounded tests-only
pilot, not a suite rewrite or prerequisite for L42. Review plan adherence and coverage
as well as correctness; test duration is not application-performance evidence.

## Continuity Input Pilot

L41's bounded contract is a hit-tested result-cell point observation, not a click,
detail/media readiness, data publication, placement or stable-frame guarantee.
The browsing family and reload-detail family keep their own action and readiness
semantics. Completed in the working tree against baseline `ae08e779d`; no product
assertions or cases are removed.

`waitForHitTestedImagePoint({ view?, imageId?, topInset?, timeout? })` polls
synchronously in DOM order for a nonempty identity with a hit-tested point inside
the requested/active results container, below its table header. It preserves the
48px horizontal and 80px grid / 16px row offsets; explicit `view` selects the
vertical offset, otherwise row role does. Default inset is zero; detail passes
20px. It returns one identity/coordinate snapshot without scrolling, clicking,
waiting for images or promising stability until a later action. Exact-ID filtering
is optional. Timeout/rejection propagates; serialization always disposes its handle.

| Contract class | Dimensions / timing | Independent oracle / current proof | Retained destination / gap |
|---|---|---|---|
| Actual input | Grid/table; explicit/phantom browsing | B17/B18 bookmark point is hit-tested, then real mouse single-click | Shared point observer; caller keeps single-click and phantom close |
| Actual input | Grid/table; detail entry | B9/B12 `openVisibleDetail` uses real one/two-click and exact detail identity | Same observer with 20px top inset; caller keeps click count and identity assertion |
| Rendered geometry | Header exclusion, horizontal bounds, overscan | Both point loops require point inside usable container and hit belonging to cell | Shared synchronous predicate; negative controls reject hidden, covered and header-clipped cells |
| Identity / readiness | Wrong/missing identity, delayed availability | Existing loops observe rendered cells, not list settlement or decoded media | Observer exact-ID option and bounded polling controls; no settlement wait |
| Ownership / publication | Indexed pending/queued/wheel; both adapter fixtures | B17 seek owner, un-aborted signals, generation and publication checks | All existing assertions and client-read hold stay in `pendingBrowseAcrossDensity` |
| Pending rendered frames | Forced seek, deep departure, density/no-density | B18 12-frame departure identity and thumb rollback samples | Existing samples/tolerance unchanged; no shared stable-frame wait |
| Chosen placement policy | Original/traversed; early/settled grid/table | B9 native signed distance versus centred target, <1px tolerance | Existing placement helper and assertions unchanged |
| Ownership / interruption | Early keyboard/clear, one held target lookup | B9 focus/queued delta, ring, lookup budget and late-publication checks | Existing variant composition and lookup gates unchanged |
| Session identity / actual gesture | A -> B -> reload B -> A; cancel/complete/Backspace/traversed | B12 entry metadata, touch listeners, native scroll or centred placement | Existing journeys, session density and phantom rings unchanged |
| Resource lifetime | Success, rejected observation, timeout | Point handle is disposed after serialization; no routes/storage/jobs owned | Focused helper controls exercise disposal and propagate failures |

Reuse rationale: existing stable-nth identity, usable-placement and decoded-detail
helpers intentionally answer different questions. The retained click-open probe's
usable geometry and separate identity/list readiness inform this boundary; its
anchor/neighbor selection, read gate and private mutation are not extracted.
Click-focus's position-sorted, fully-visible selection is a distinct policy and
is not substituted for DOM-order hit testing. HTTP response holds remain distinct
from completed-client-read publication holds. Probe cleanup stays diagnostic.

Cost: shared observation replaces two loops without adding app bootstrap, controlled
delay, fixture jobs or consumer settlement waits. Existing local results retain no
usable per-phase duration report; runtime impact is unmeasured. Focused before/after
journeys establish equivalence, not a wallclock percentage. Perf consumers of the
shared module keep their existing helpers and measurement boundaries; none calls
the selected browsing/detail point loops.

Verification: two fresh inline cold reviews of the actual baseline diff accept
plan/structure and correctness/proof without actionable findings. All 61 retained
focused consumer cases and 12 helper controls pass retry-free. Final separate gates:
`npm --prefix kupua test` (2,836 tests), `npm --prefix kupua run build`,
`npm --prefix kupua run test:perf-harness` (104 checks), and
`npm --prefix kupua run test:e2e -- --retries=0` (435 cases, all 11 forced-seek).
Affected-source compiler checks match all eight inherited diagnostic identities
across the three changed files, with no additions; the wider E2E config is not clean
and app build does not cover it. Existing bundle/E2E warnings remain. No live/perf
campaign ran, and performance equivalence is not certified.

Historical B9/B12 IDs now route to the descriptively named `Detail close during list
restoration` and `Reloaded detail gesture return` suites. L42's independent
provenance separation is complete within local limits; the point observer is reusable
only where this input contract fits, not a prerequisite or reason to migrate more families.
The L42 final gate retains all 435 retry-free browser cases, including 11 forced-seek,
and passes 2,850 source unit tests plus TypeScript/Vite. No browser/perf helper or
scenario source changed; excluded-config diagnostics and performance limits remain.

## B17 Pending Browsing Proof

B17 executes 32 cases: 16 indexed browsing, eight discovery and eight forced-seek.
Only no-focus queued/wheel cases run in one focus mode. Their helper explicitly
clears focus before input; indexed density capture yields to the browse owner before
focus policy. Pending bookmark and discovery cases retain both modes: real
click/detail setup and End focus permission are distinct behaviours.

| Contract / discarded work | Surviving proof |
|---|---|
| Four phantom indexed queued cases: both transports and grid/table | Four matching explicit queued cases keep synchronous pre-dispatch click/remount, mapped identity, current geometry and completed-client-read hold; mounted B17 no-focus/mode matrix retains both modes |
| Four phantom indexed wheel cases: both transports and grid/table | Four matching explicit wheel cases retain Scrubber wheel wiring and the queued phase before immediate remount; mounted list/Scrubber debounce controls retain request timing |
| Every removed arrival assertion | Matching explicit case retains un-aborted signals, seek generation, consumed browse owner, independent map identity in viewport, destination offset, null bookmark, busy/error/status cleanup, position consistency and effective view |
| Removed phantom setup's actual click/detail/Backspace | All eight indexed and eight forced-seek pending-bookmark cases retain both modes, transports and density directions with actual hit-tested input |
| Discovery / temporal protection | All eight ordinary/AI cases remain: owned membership publication and finite AI exclude ordinary reads through the unchanged 250ms window; store/navigation suites retain stale-work rejection and dispatch timing matrices |
| Forced-seek departure / geometry | All eight cases and B18 no-density controls remain; deep departure identity/thumb sampling still requires 12 frames, with original tolerances |

No assertion, negative observation window, corpus, worker limit or shared helper
changed. The dropped phantom detail/clear/pre-dispatch combination is no longer
one browser journey; its responsibilities are covered at the layers above.
Queued/wheel interventions use synchronous DOM events to reach the pre-dispatch
window, not physical-device input. API completed-client-read holds do not certify
native server cancellation. Local timing and negative-control evidence is in the
[ignored review packet](../.vite/b17-20261007-6f4000dc6d/review-02/README.md),
not an application-performance or comparable full-suite speed certificate.

## Reset Presentation Proof

L43 is complete within recorded limits: 38 source controls, bounded live API checks
and eighteen new local browser cases in existing owners. Final separate gates pass:
2,888 unit tests/83 files, TypeScript/Vite and 453 retry-free E2E, including 15 forced
seek. Two fresh final full-diff repair reviews approve source and new tests.

| Contract | Maintained unit proof | Executed browser boundary |
|---|---|---|
| Prepend versus reset | Production low seek, forward eviction and held positive/final prepends; independent order/positions/all tuples and bookmark | Four [forced-seek B10](local/forced-seek.spec.ts) cases: actual wheel, measured three-column grid/table, every held page through zero, no-read-at-zero and real Home; bounded live API counterpart |
| Revocable Home feedback | Real Home lifetime, unchanged numeric props, failure/successor/hostile outcome matrices | Two [native B11](local/browser-history.spec.ts) cases: exact A logical/painted thumb/tooltip before and after deliberate obsolete success; wrong-deep DOM paint is rejected; Home and Back discovery budgets separate |
| Destination restoration | URL-sync destination publication and placement before hostile Home success/error/abort | Native local/live Back with interior anchor geometry; existing clipping policy retained, no stronger true-tail guarantee |
| Refresh publication | Actual badge, first/deep success/failure, query/freeze/history/density/focus/selection | Eight [B16 success cases](local/buffer-corruption.spec.ts), two supplied-503 refusals, backing-error rejection and pending-frame cleanup interruption; bounded live API populated-selection/supersession proof |
| Preserved composition | Existing Home/navigation, density, history, detail, continuity, fallback and small-set suites retained | All 453 habitual normal/forced-seek cases pass without retries, including Q2/L42/detail and fixture-lifetime controls |

Intervention: local completed-client-read holds keep successful data unchanged;
API fixtures execute real client JSON/Response encoding/decoding with faithful Argo
fields backed by local ES. They replace `window.fetch`, not a native local media-api
server, and do not certify network/server cancellation. Live API success uses real
HTTP reads. Exact source and browser oracles plus deliberate fixture negatives
distinguish publication, paint, read budgets, refusal classification and cleanup.
B10 adds fifteen independent corpus pages plus one explicit zero-hit fixture read
per case; those are test costs, not additional application requests.

The bounded 7 October B10 simplification attempt was not retained: nearer seek,
production forward extensions and shorter wheel travel failed to reliably preserve
an observed positive-offset prepend before zero. All four original cases remain.
Browser input and pending/published frame geometry cannot be replaced by eventual
settlement; the mounted four-way B10 tests independently cover production eviction,
held publication, membership/order, tuples, coordinates and focus/selection.
Failed candidate timings establish no savings. No product fault was established.

The E2E/perf compiler configs match all 86/34 inherited diagnostic identities with
zero additions, not clean-config status. No shared helper/perf/config source changed;
no new `test:perf-harness` gate or performance campaign follows. B19's table true-tail
36px placement and C31's later-density non-top limit remain parked/qualified. Eight
unsupported new nullable mock drafts were deleted, not skipped or hidden in the
opt-in ES oracle; [optional L44](../exploration/docs/not-yet-another-audit-ledger.md#optional-nullable-mock-coverage-l44)
is unselected, and their local composition coverage is not claimed. Existing
nullable adapter tests and bounded live Credit/Taken on evidence remain distinct.
Port/execution coordination is still required for future runs.

## Further Helper Reuse Assessment

Report-only assessment, 4 October 2026: `ae08e779d` plus the completed, uncommitted
L41 source changes. Nothing below is implemented or adds approval to L41/L42.
L42 is now complete within its recorded local limits. The operator may select one
candidate as a separate test-only unit; no candidate is selected by this checkpoint.
This is an optional maintenance queue, not a prerequisite or automatic follow-on.
Do not batch every candidate into one refresh.

Use the [one-candidate execution prompt](../exploration/docs/continuity-test-refresh-prompt.md)
only with an operator-named selection. It replaces the completed L41 prompt;
it does not reopen L41 or authorize the whole shortlist.

A strong candidate has the same explicit contract in at least two real consumers,
meaningful shared proof/resource mechanics rather than merely similar titles,
caller-owned policy/timing, and concrete failure controls. Each implementation
pilot keeps L41's limit of two helpers/two consumer families, baseline equivalence,
unchanged assertions and actual-input/pending-frame proof, owned cleanup, cold
reviews and final local gates. These are source findings, not a runtime forecast.

### Strong Candidates

| Candidate / assessment | Evidence / payoff | Narrow boundary and required discriminators |
|---|---|---|
| Browser queued-frame gates: strongest next substantial test-only pilot | [Density](local/scrubber.spec.ts#L1072), [preview exit](local/ui-features.spec.ts#L1286) and [detail return](local/ui-features.spec.ts#L1746) repeat important capture/release/cancellation/cleanup mechanics. Meaningful maintenance payoff, but a faulty helper could hide the race under test. | Pilot density plus detail only; preview is a later consumer. Share the owned rAF resource, not callback-selection policy or native exit. Prove unrelated callbacks pass through, release runs once, nested callbacks stay deferred and failure restores only owned methods. Hostile replay must prove the cancelled callback actually executed before asserting that production rejected its effect; unchanged scroll alone is insufficient. |
| Unit buffer-position invariant: best low-risk extraction | [Main](../src/stores/search-store.test.ts#L93) and [extended](../src/stores/search-store-extended.test.ts#L48) duplicate one independent assertion. Their 39 and 22 call sites show importance, not 61 duplicated implementations. Worth a small separately selected maintenance change. | Accept a snapshot and label; check resident identity positions against buffer origin plus local index. Preserve hole handling, useful failure messages and all assertion sites. No implicit singleton, production-derived oracle or map-size-equals-buffer rule: indexed maps may include nonresident entries. Controls: nonzero origin, wrong/missing position and legitimate extra map entries. Leave browser proof separate. |
| Unit animation-frame queue: useful when these owners next need attention | [Scroll effects](../src/hooks/useScrollEffects.test.ts#L74), [detail return](../src/hooks/useReturnFromDetail.test.ts#L436), [fullscreen settlement](../src/lib/fullscreen-exit.test.ts#L113) and [composed detail](../src/components/ImageDetail.test.tsx#L387) repeat deterministic request/cancel and snapshot-flush queues. Do not turn this into a scheduler framework. | Pilot two files only, separate from the browser gate. Keep React `act`, fake timers, mounting, fullscreen and clock choice outside: scroll effects uses `performance.now()`, others zero. One flush means one frame; nested callbacks wait, cancelled callbacks do not flush, reset isolates cases, and deliberate obsolete delivery remains possible. Preserve [hostile replay](../src/components/ImageDetail.test.tsx#L509). |
| Perf successful-route observation: valid, lower scheduling priority | [Short](../e2e-perf/perceived-short.spec.ts#L238) and [long](../e2e-perf/perceived-long.spec.ts#L109) have identical collectors; [jank](../e2e-perf/perf.spec.ts#L83) adds a predicate and idempotent finish. Suitable when perf-harness maintenance is selected, but measurement trust makes this more consequential than ordinary deduplication. | Start with short/long collection only; jank adoption and timing projection stay outside that first extraction. Preserve successful-response/data-route classification, client-only absence and caller start/stop epochs. Test failed/non-data/late responses, both transports, repeat finish and failure cleanup. No added setup/actions/waits or unified settlement observer; retain jank's selection-metadata predicate if later adopted. |

These candidates address maintainability, not demonstrated wallclock bottlenecks.
L41 added 12 helper controls (423 -> 435 browser cases) with runtime impact unmeasured.
That is legitimate proof cost, not evidence of faster tests. Use timing evidence
before commissioning speed work; neither fewer helper bodies nor fewer lines is a
runtime result. Every selected extraction still needs its own brief and cold review.

Existing pure harness checks guard [route-qualified store timings](../e2e-perf/harness-validation.test.mjs#L249)
and [selection-only route attribution](../e2e-perf/harness-validation.test.mjs#L1056).
Moving a helper must preserve these checks rather than removing source assertions;
if timing projection is later extracted, its current call scan skips a local
declaration with `slice(1)` and must be adapted without losing its first caller.
No perf campaign is recommended by this audit. A future workload change needs a
separate scope/revision decision; local/harness success cannot certify latency parity.

Guardrail: similar names/bodies do not establish identical contracts. Keep HTTP
response holds distinct from completed-client-read holds; preserve navigation
snapshot/key semantics, caller clocks/readiness, perf action cadence and mobile
geometry. Do not expand a selected helper into a generic fixture or settlement API.

### Coverage And Limits

| Surface | Scan and inspection coverage |
|---|---|
| Browser: 19 TS files | All 15 local specs, both shared modules, global setup and the diagnostic spec were syntax-scanned. Resource/helper regions were inspected in history, buffer, focus, scrubber, selection/mobile and detail; browsing/forced-seek wiring was already inspected during L41. Remaining feature specs received helper/setup searches, not complete assertion review. |
| Perf/harness: 16 TS/MJS files | All four scenario specs, shared environment fixture, configs, runner, reporter and pure harness/metric modules were syntax-scanned. Route/trace/traversal boundaries in all four specs, the environment fixture and applicable static harness assertions were inspected; remaining tooling was scan-only. |
| Unit: 83 test files | All were syntax-scanned. Targeted inspection covered the four frame owners, both store invariant owners, API-mode polling, traversal/anchor builders and enrichment-builder contrast. Remaining unit cases/mocks were scan-only; not a full semantic review of 2,836 assertions. |
| Existing abstractions / references | Checked shared identity, hit-tested point, placement, decoded-media, retained-setup, position and frame-sampling boundaries; perf environment/route helpers and harness guards. Retained click-open/focus probe capabilities were read during L41; no wider probe/framework promotion. |
| Excluded | Archived/retired tests, integration mutation oracle, raw fixtures/images, stored campaigns/dashboards, wider production algorithms and physical/live replay. No code changes, test execution, perf run, dependency change or Git mutation occurred for this assessment. |

The syntax scan covered 118 files and compared exact function bodies plus repeated
helper names; candidate inspection also followed differing wrappers and consumers.
It does not establish exhaustive semantic duplication coverage, behavior equivalence
or the absence of every other strong candidate. No test-speed percentage follows.
Candidate implementation still needs its own bounded brief, failure controls,
baseline equivalence, inline cold reviews and relevant final gates.

## Session-Aware Density Setup

Density is per-tab UI state, not a URL parameter. Use
`kupua.startSearch(extraParams, "grid" | "table")` for an independent case (grid
default); it initializes density, delegates to the corpus-pinned navigation helper
and asserts the rendered view. `initializeDensity` writes through production
preference handling on an existing document without a throwaway mount/toggle/read.
For a blank document it owns one removable CDP seed, consumed once per origin;
the next initialization retires the prior registration. This is Chromium setup,
not a cross-browser storage guarantee. No global session-storage clear is used.

`goto`, `gotoWithParams`, `gotoPerfStable`, SPA navigation and reload retain the
case's choice. Do not reinitialize within persistence/history controls. An obsolete
`density=table` URL does not select table, and URL absence does not prove grid:
use `assertDensity` or layout-specific `waitForResults` readiness. Maintained
local, forced-seek and diagnostic setups follow this distinction.

Density-history controls prove no entry/key/query-generation change or Forward
loss, immediate reload/first-mounted view, fresh/reused initialization and current
layout destination restoration. Both-logo Home races and held-data frame controls
retain pending-content, focus, geometry and request assertions. KUP-018 proves
queued return cancellation and rejects a deliberately delivered obsolete callback.
The history/density checkpoint passed 423 retry-free habitual cases, including 11
forced-seek cases; the current gate is recorded under the continuity input pilot.
Local fixtures do not authorize or certify live/perf execution.

## Async Fixture Setup

Controlled Home-density, selection-panel and L39 AI setup returns a job object
from a synchronous `page.evaluateHandle` callback, not an async evaluation promise.
The handle retains the job and its pending promise while imports/setup run. The
job exposes `complete` and nullable `error`; success sets completion and rejection
stores the error. `waitForFixtureSetup(page, handle)` polls these fields with a
synchronous predicate, throws setup failures and disposes the handle in `finally`.
The runner's wait timeout bounds unfinished setup; it never retries the setup or
relaxes workflow assertions. Do not use an async `waitForFunction` predicate.

Two selection-spec controls hold a module response while forcing browser GC and
check rejection plus handle disposal. They establish this retained-job contract,
not the original intermittent GC trigger or every async evaluation in the suite.
Home intent reads reuse the imported preference store rather than repeating imports.
The four touched E2E files have no added TypeScript diagnostics against HEAD;
their 16 inherited diagnostics remain. The app build does not cover E2E/perf.

## Detail Return Coverage

B9 controls close as soon as detail identity is ready while existing list
restoration is held, rather than replacing early close with a readiness wait.
Early/settled original return preserves native geometry; genuine traversal centres
the returned image with the correct focus/ring or phantom policy. Grid/table
keyboard and background-clear controls defeat obsolete return presentation while
retaining restoration request budgets and session-persisted density/selection.
B12 drives the actual touch listeners after A -> B -> reload B -> A: cancelled
and completed dismiss leave original placement alone, matching Backspace;
traversed return still centres. Existing KUP-018 queued-frame controls remain.
The composed unit surface covers all three coordinate regimes, late restoration
outcomes, history/AI owner adoption and policy substitution. Browser/API response
fixtures are local evidence, not live-service or physical-device certification.

## Directory Structure

```
e2e/
  local/                          ← npx playwright test (habitual)
    scrubber.spec.ts
    keyboard-nav.spec.ts
    buffer-corruption.spec.ts
    ui-features.spec.ts
    forced-seek.spec.ts           ← habitual, isolated port-3030 project
    visual-baseline.spec.ts
    visual-baseline.spec.ts-snapshots/
  shared/                         ← imported by local, tier, perf, and diag
    helpers.ts
  scrubber-debug.spec.ts          ← diagnostic (own config)
  global-setup.ts                 ← local E2E infra (Docker ES health check)
  tsconfig.json                   ← covers all subdirectories
  README.md

e2e-perf/                         ← separate (own configs, own results)
  perf.spec.ts
  experiments.spec.ts
```

## Test Modes

| Mode | Command | Data | When to use |
|------|---------|------|-------------|
| **Unit/Integration** | `npm test` | In-memory mock | After any `src/` change. ~5s. Non-negotiable. |
| **Local E2E** | `npm run test:e2e` | Docker ES, 10k docs | After changing components, hooks, store, scroll effects. ~5min. |
| **Local E2E (full)** | `npm run test:e2e:full` | Docker ES, 10k docs | Same as above but orchestrates Docker + data loading first. |
| **Perf** | `npm run test:perf` | Real ES, 1.3M docs | Manual, purpose-driven. Never habitual. |
| **Experiment** | `npm run test:experiment` | Local or real ES | Agent-driven A/B tuning. Requires user consent for TEST. |
| **Diagnostic** | `npm run test:diag` | Local or real ES | Scrubber coordinate-space investigation. Headed only. |

## Environment Variables

All env vars are optional. Pass them as prefixes to any command, e.g.
`CPU_THROTTLE=4 npm run test:e2e`.

### Test runner env vars (affect Playwright test execution)

| Variable | Type | Default | Used by | Purpose |
|----------|------|---------|---------|---------|
| `CPU_THROTTLE` | number | 0 (off) | All modes via shared fixture | CDP `Emulation.setCPUThrottlingRate`. Rate=4 simulates 4× slower CPU. Used for slow-hardware experiments. |
| `PERF_STABLE_UNTIL` | ISO date string | — | Perf, experiments | Pins the result corpus at a fixed date (`&until=` URL param) to prevent metric drift from new images. Auto-set by `run-audit.mjs`. |
| `EXP_OVERSCAN_TABLE` | number or `"current"` | `"current"` | Experiments (E1) | Override TanStack Virtual overscan for table scroll experiments. |
| `EXP_OVERSCAN_GRID` | number or `"current"` | `"current"` | Experiments (E2) | Override TanStack Virtual overscan for grid scroll experiments. |

### App-level env vars (affect kupua's runtime behaviour via Vite)

These are set in `.env` / `.env.development` for local mode, and overridden
by `start.sh --use-TEST` for real clusters. They're **not** test runner flags,
but they determine how the app behaves during tests.

| Variable | Default | Local dev | `--use-TEST` | Purpose |
|----------|---------|-----------|--------------|---------|
| `VITE_MAX_RESULT_WINDOW` | 100,000 | 500 | 100,000 | Must match ES index `max_result_window` |
| `VITE_DEEP_SEEK_THRESHOLD` | 10,000 | 200 | 10,000 | Offset above which seek uses the deep path |
| `VITE_SCROLL_MODE_THRESHOLD` | 1,000 | 1,000 | 1,000 | Max total for scroll mode (vs seek mode) |
| `VITE_ES_BASE` | `/es` | — | — | ES proxy base URL |
| `VITE_ES_INDEX` | `images` | — | Auto-discovered | ES index name |
| `VITE_ES_IS_LOCAL` | `true` | `true` | `false` | Write-protection flag |
| `VITE_S3_PROXY_ENABLED` | `false` | — | `true` | Enable S3 thumbnail proxy |
| `VITE_IMGPROXY_ENABLED` | `false` | — | `true` | Enable imgproxy for full images |
| `VITE_IMAGE_BUCKET` | — | — | Auto-discovered | S3 bucket for full images |
| `VITE_KEYWORD_SEEK_BUCKET_SIZE` | 10,000 | — | — | Composite agg page size for keyword seek |

### Perf audit CLI flags (`run-audit.mjs`)

| Flag | Example | Purpose |
|------|---------|---------|
| `--label "..."` | `--label "Phase 1: baseline"` | Human-readable label for the audit log entry |
| `--runs N` | `--runs 3` | Repeat the test suite N times; metrics are median-aggregated |
| Positional | `P8`, `PP1`, `JB3`, or comma-separated IDs | Run only matching jank or perceived metric IDs; completeness is checked against the selected subset |

Perceived filters match complete metric IDs, so `PP1` selects PP1 without also
selecting PP10. The runner translates IDs to Playwright title prefixes; callers
do not need to construct title regexes. Examples from the repository root:

```bash
node kupua/e2e-perf/run-audit.mjs --short-perceived-only --dry-run PP1
node kupua/e2e-perf/run-audit.mjs --long-perceived-only --dry-run --runs 2 JB3,JB4
```

PP10 is a background position-map diagnostic, not a user-action latency row.
It runs through the same short-perceived command and history, but CLI/Markdown
report it separately and the dashboard hides it by default with no target:

```bash
node kupua/e2e-perf/run-audit.mjs --short-perceived-only --dry-run PP10
```

### Playwright built-in flags (useful combinations)

| Flag | Example | Purpose |
|------|---------|---------|
| `--headed` | `npm run test:e2e:headed` | Visible browser |
| `--debug` | `npm run test:e2e:debug` | Step-through debugger |
| `--ui` | `npm run test:e2e:ui` | Playwright UI mode |
| `--grep "pattern"` | `npm --prefix kupua run test:e2e -- --grep "scroll up"` | Run habitual tests matching a Playwright title regex |
| `--update-snapshots` | `npx playwright test --update-snapshots` | Update visual baselines |

## Which Command Do I Run?

Not every suite needs to run every time. The suites are designed at different
cadences — running the wrong one wastes minutes (or requires a live cluster).

| Changed… | Run | Why | Skip |
|----------|-----|-----|------|
| Anything in `src/` | `npm test` (~36s) | Unit/integration. **Always.** Non-negotiable. | Never skip. |
| Components, hooks, store, scroll effects | + `npm run test:e2e` (~5min) | Tests real browser behaviour: scroll races, focus drift, buffer corruption. | Skip for doc-only, pure-util, or test-only changes. |
| Scroll thresholds, seek logic, Home/End handlers, scrubber | + `npm run test:e2e` | Natural buffer/indexed owners plus the isolated forced-seek case run habitually. | — |
| Tuning overscan, buffer capacity, etc. | `npm run test:perf` or `test:experiment` | Measures actual metrics. Never habitual — purpose-driven only. | Don't run "just in case". |
| Scrubber coordinate-space investigation | `npm run test:diag` | Headed diagnostic scan. Not pass/fail. | Only when debugging scrubber mapping. |

**Rule of thumb:** `npm test` is always the first thing you run. `npx playwright test`
is the second (for rendering-related changes). Everything else is purpose-driven —
you should have a specific reason to run it.

P14 traversal rows are isolated jank scenarios rather than one shared journey.
Each fresh context validates an exact in-memory sequence from a fixed pinned
rank, measures landing from final identity commit, and emits only sanitized CLS
roles/geometry. Run one cadence with a positional metric ID such as `P14b`;
image identities must never be written to reports or artifacts.

## Common Mistakes

- **Port 3000 conflict:** Local E2E starts its own Vite. Stop any running `npm run dev` or `start.sh` first.
- **Running E2E when TEST is connected:** The safety gate (global-setup + per-test check) will refuse. Stop `--use-TEST` first.
- **Piping test output through tail/head:** Don't. The list reporter streams results live.
- **Confusing runner filters:** `run-audit.mjs` positional values are metric IDs;
  habitual E2E uses Playwright's title-based `--grep` after the npm `--` separator.

## Asynchronous Observability

Tests should wait for the state an operation promises, not an estimated elapsed
time. Capture the relevant value before the action, then wait for a changed
generation, expected store/URL value, cleared in-flight status, or rendered DOM
identity. Completion and rendering are separate when layout matters.

Fixed-duration waits are reserved for behavior where elapsed time is itself the
oracle: settle-window sampling, delayed-runaway detection, debounce boundaries,
CSS transitions, and long-press thresholds. Required readiness timeouts must not
be swallowed. Prefer existing state before adding observability; when no reliable
signal exists, add a narrow development-only started/completed generation rather
than a production event bus.

## Where Results Live

| Artefact | Location |
|----------|----------|
| Experiment results | `e2e-perf/results/experiments/` |
| Perf audit results | `e2e-perf/results/` |
| Playwright HTML report | `playwright-report/` |
| Visual baseline snapshots | `e2e/local/visual-baseline.spec.ts-snapshots/` |
| Scrubber diagnostic JSON | `test-results/scrubber-diag-all.json` |

## File Map

### Local E2E (`npm run test:e2e` — `playwright.config.ts` → `e2e/local/`)

| File | Tests | What it covers |
|------|-------|----------------|
| `local/scrubber.spec.ts` | 89 | Seek accuracy, scroll preservation, settle-window stability, density switch, sort change, buffer extension, scroll-up after seek, scroll mode, two-tier, and retained bug regressions |
| `local/keyboard-nav.spec.ts` | 15 | Two-mode keyboard nav (no-focus scroll vs focused movement), Home/End, search box key trapping, row-aligned snapping |
| `local/browser-history.spec.ts` | 110 | Entry/query identity, destination focus/NONE and geometry, marked detail native transitions, session density/reload/Forward and Home/input ownership; exact native B11 destination paint before stale delivery |
| `local/buffer-corruption.spec.ts` | 35 | Logo / metadata / query changes after deep seek, pending sort/density ownership, held-data Home layout frames and twelve B16 badge/refusal/fixture-lifetime cases |
| `local/browse-density.spec.ts` | 24 | Pending/pre-debounce indexed browsing and Scrubber wheel across density in direct/API-adapter fixtures; narrowing-query and finite-AI ownership in local memory fixtures; both modes for bookmarks/discovery, one mode for no-focus queued/wheel, both views |
| `local/ui-features.spec.ts` | 86 | Detail/list restoration, reload gesture return, 12 hit-tested input controls, queued return/traversal and preview ownership, media fallback, panel/selection geometry, sort, cursor and URL controls |
| `local/visual-baseline.spec.ts` | 4 | Screenshot comparison: grid, table, detail, search-with-query |
| `local/forced-seek.spec.ts` | 16 | B7 temporary-tail geometry, four B10 actual-wheel/every-prepend/tuple/geometry cases, core midpoint/End/Home journey, eight pending-browse density cases and two no-density controls; runs habitually against port 3030 |
| `local/focus-preservation.spec.ts` | 13 | Focus/viewport continuity, neighbour fallback, snap-back and four adapter-backed L39 AI-exit cases |
| `local/selections.spec.ts` | 30 | Selection membership/ranges/persistence, panel coherence and two retained async-fixture GC/rejection/disposal controls |

### Shared (`e2e/shared/` — imported by maintained test modes)

| File | What it provides |
|------|------------------|
| `shared/helpers.ts` | `KupuaHelpers` fixture class with `waitForHitTestedImagePoint()` (observation only), `sampleScrollTopAtFrameRate()`, `waitForFixtureSetup()` (synchronous readiness/error check and handle disposal) |
| `shared/browse-density.ts` | Real-control pending destination/density checks, including wheel before dispatch; local-ES safety gate, pass-through response hold and API response-shape fixture. Seek-tier cases start deep and sample pending departure identity and thumb position across rendered frames. Clicks result cells, including No thumbnail placeholders. |

### Infrastructure (`e2e/` root)

| File | What it does |
|------|--------------|
| `global-setup.ts` | Docker ES auto-start + safety gate (used by `playwright.config.ts` only) |
| `scrubber-debug.spec.ts` | NOT pass/fail. Diagnostic scan of scrubber coordinate spaces. Own config (`playwright.debug.config.ts`). |

### Perf / Experiments (separate `e2e-perf/` directory)

| File | Config | What it covers |
|------|--------|----------------|
| `e2e-perf/perf.spec.ts` | `e2e-perf/playwright.perf.config.ts` | 16 perf scenarios (P1–P16): CLS, jank, DOM churn, LoAF |
| `e2e-perf/experiments.spec.ts` | `playwright.experiments.config.ts` | A/B tuning experiments (E1–E6): overscan, buffer capacity, etc. |

## Position Diagnostics

Habitual position, focus and transition coverage lives in `e2e/local/`, with
the compact forced-seek owner isolated on port 3030 by `playwright.config.ts`.
Use `e2e/scrubber-debug.spec.ts` only for headed coordinate-space diagnosis and
the `e2e-perf/` suites only for a named performance question.

When selecting a rendered image, remember that virtualizer overscan cells have
valid `data-image-id` attributes but may be outside the viewport. Check the cell
and scroll-container rectangles before interacting, or use the shared helper
that owns the intended operation. Tests should wait on store/DOM completion
signals described above rather than fixed delays.

The development-only `window.__kupua_store__` remains available for focused
diagnostics and assertions. Keep any new browser coverage on maintained local,
diagnostic or perf roots; do not recreate the retired smoke, tier-matrix or
drift/flash-probe harnesses.

