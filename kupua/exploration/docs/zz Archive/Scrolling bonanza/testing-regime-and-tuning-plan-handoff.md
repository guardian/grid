# Scroll Test & Tune — Multi-Phase Plan

> **Date:** 6 April 2026
> **Status:** Phases 1–3 complete. Phase 4 ready to execute.
> **Goal:** Build a test regime reliable enough to safely tune timing
> constants for performance — then tune them.
>
> **Usage:** This document drives multiple agent sessions. Each session
> should pick up where the previous left off. Agents: keep a detailed
> worklog in `exploration/docs/worklog-testing-regime.md` for context
> preservation across sessions.

---

## Context

### What was built

Kupua uses a windowed buffer (~1000 items) over a potentially 1.3M–9M
document dataset backed by Elasticsearch. The scrubber enables random-
access seeking to any position. Deep seeks use percentile estimation +
`search_after` + `countBefore` — there's no position map in memory.

### The swimming saga (Agents 5–13)

"Swimming" — visible content displacement during buffer prepend operations
after seek — was the central scroll engineering problem. It took 13 agent
sessions to eliminate:

- **Agents 5–9:** Timing hacks (cooldowns, suppress flags, deferred
  timers) that papered over the symptom. Agent 6's suppress flag blocked
  scrolling up entirely. Agent 7's cooldown reduction regressed swimming
  on real data.
- **Agent 10:** Removed the suppress flag, added post-extend cooldown.
  Fixed scroll-up. 1% cosmetic swim remained.
- **Agents 11–13:** Bidirectional seek — after a deep seek fetches 200
  items forward, add a backward fetch of 100 items. User lands in the
  buffer middle with headroom above. Both `extendBackward` and
  `extendForward` operate on off-screen content → zero swimming.

The remaining visible behaviour is buffer filling with correct data after
seek (3-4 empty cells at buffer bottom fill in when `extendForward` fires).
This is intentional — hiding it would add latency.

### Why the tests didn't catch it

Swimming was **never caught by automated tests**. Every detection was
manual: a human watching the app on real data. Four structural reasons:

1. **Polling granularity too coarse.** The settle-window test polls
   `firstVisibleGlobalPos` every 50ms. Swimming is a 1–2 frame event
   (~16–32ms). A 50ms poll has ~50% chance of missing it.

2. **Metric is row-granular, not pixel-granular.** `firstVisibleGlobalPos`
   uses `Math.floor(scrollTop / ROW_HEIGHT) * cols + bufferOffset`. A
   sub-row shift (150px in a 303px row) rounds to the same row → zero
   detected shift. But 150px is absolutely visible.

3. **Local data too small.** With 10k docs and `BUFFER_CAPACITY=1000`,
   the buffer holds >10% of the result set. The geometry that produces
   visible swimming (200-item prepend into a 300-item buffer at the
   buffer's top edge) only manifests when the buffer is a tiny fraction
   of total — which requires 100k+ docs.

4. **Tests pre-scroll.** The settle-window test scrolls to `scrollTop=150`
   before seeking, masking the headroom-zone problem that only triggers
   when the user is at `scrollTop ≈ 0`.

**CLS doesn't catch it either.** Swimming is a `scrollTop` change, not a
CSS layout shift. The browser sees a programmatic scroll, not elements
moving. `PerformanceObserver` for `layout-shift` is structurally blind.

### The timing chain

The current system relies on five sequential timing dependencies:

```
seek data arrives
  → SEEK_COOLDOWN_MS (700ms) blocks ALL extends
    → SEEK_DEFERRED_SCROLL_MS (800ms) fires synthetic scroll
      → first extend fires
        → POST_EXTEND_COOLDOWN_MS (200ms) blocks next extend
          → repeat
```

These were set conservatively to prevent regressions, not optimised for
performance. Bidirectional seek means extends now operate off-screen —
the cooldowns likely have significant room to shrink, but tuning requires
tests that can reliably detect regressions.

### The complexity

- `seek()` is ~500 lines with 5 seek paths, binary search over SHA-1
  hex space, bidirectional backward fetch, reverse-compute with headroom
  offset, and null-zone cursor handling
- `useScrollEffects.ts` has 10 numbered effects with nuanced interactions
- The reverse-compute reads DOM state from inside the Zustand store
  (`aria-label` inspection, `clientWidth`) — deliberate coupling
- `_seekSubRowOffset` is a one-shot communication channel between an
  async store action and a synchronous React layout effect

### What this plan does

**Builds the test regime first, then uses it to tune.** The swimming bugs
are fixed. The goal is now: (a) ensure they can't come back, and (b)
reduce the conservative timing values for better performance.

---

## Test Execution Modes

Three modes, each with different data, latency, and trust characteristics:

| Mode | Data | Latency | Who runs | When |
|---|---|---|---|---|
| **Local E2E** | Docker ES, 10k synthetic docs | <5ms | Agent, automatic | After every `src/` change |
| **Smoke on TEST** | Real ES, 1.3M docs via SSH | 50–200ms | User runs, agent reads JSON | After behavioural changes |
| **Agent on TEST** | Real ES, 1.3M docs via SSH | 50–200ms | Agent runs directly | Per-session with explicit user consent |

### Agent-on-TEST protocol

Per the smoke test directive, the agent may run tests against TEST after
**explicit user consent once per session**. The workflow:

1. User starts `./scripts/start.sh --use-TEST` and confirms TEST is up
2. Agent asks: *"May I run smoke/experiment tests against TEST this session?"*
3. User confirms → agent may run `node scripts/run-smoke.mjs`,
   `npx playwright test --config playwright.smoke.config.ts`, or
   `npx playwright test --config playwright.experiments.config.ts`
4. All tests are **read-only** — write protection is in the DAL
5. Agent reads JSON results directly (no user copy-paste)
6. Agent may use `--debug` or `page.pause()` for interactive diagnosis

This mode is **essential for tuning work** (Phases 4+). Without it, every
timing change requires a user round-trip to validate on realistic data.

### What each mode catches

| Bug class | Local E2E | Smoke on TEST | Agent on TEST |
|---|---|---|---|
| Structural (wrong reverse-compute, wrong headroom offset) | ✅ | ✅ | ✅ |
| Timing (races during settle window) | ❌ too fast | ✅ | ✅ |
| Scale-dependent (buffer geometry at 0.02% of corpus) | ❌ wrong ratio | ✅ | ✅ |
| Performance regression (jank, frame drops) | Partial | — | ✅ (experiments) |

---

## Phase 1: Measurement Primitives — ✅ COMPLETE

**Goal:** Build the reusable probes and local regression gate. After this
phase, any structural scroll regression is caught automatically in ~70s.

**Constraint:** Zero changes to `src/`. Tests only.

### 1a. `sampleScrollTopAtFrameRate()` helper

Add to `e2e/helpers.ts`. A reusable function that runs a rAF loop inside
`page.evaluate` for N milliseconds and returns `number[]` — one scrollTop
sample per animation frame (~60fps).

```typescript
async sampleScrollTopAtFrameRate(durationMs: number): Promise<number[]>
```

Used by both local E2E and smoke tests. This is the foundational
measurement primitive for all swimming detection.

### 1b. scrollTop=0 seek test (local E2E)

Add to `scrubber.spec.ts`. Seeks from scrollTop=0 (no pre-scroll) — the
exact scenario masked by the existing test's `scrollTop=150` pre-scroll.

Asserts:
- `firstVisibleGlobalPos` stable over 1.5s (zero shift)
- `scrollTop` moved to headroom position (not stayed at 0)
- Buffer has backward items (`bufferOffset > 0`)

This catches headroom-zone regressions (the Agent 11–13 bug class).

### 1c. Tighten settle-window tolerance

Change existing settle-window test `MAX_SHIFT` from `cols + 1` to `0`.
Bidirectional seek produces zero content shift — anything > 0 is a
regression. One-line change.

### 1d. rAF scrollTop monotonicity test (local E2E)

Add to `scrubber.spec.ts`. Uses `sampleScrollTopAtFrameRate(1500)` after
a seek. Asserts scrollTop is monotonically non-decreasing during the settle
window. A non-monotonic change = swimming (viewport jumped backward).

On local data this won't catch timing-dependent swimming (ES is too fast),
but it catches any structural bug that causes scrollTop to go backwards.

### Validation

- `npm test` — unit tests still pass
- `npx playwright test` — all local E2E pass (ask user to stop port 3000)

### Files changed

| File | Change |
|---|---|
| `e2e/helpers.ts` | Add `sampleScrollTopAtFrameRate()` to `KupuaHelpers` |
| `e2e/scrubber.spec.ts` | Add scrollTop=0 seek test, rAF monotonicity test, tighten tolerance |

---

## Phase 2: Smoke Test Hardening — ✅ COMPLETE

**Goal:** Upgrade smoke tests to frame-accurate swimming detection on real
data. After this phase, timing-dependent regressions are caught on TEST.

**Requires:** Agent-on-TEST consent for this session.

### 2a. rAF-enhanced settle-window (S23 upgrade)

Replace 50ms `setTimeout` polling in S23 with `sampleScrollTopAtFrameRate`.
Returns full scrollTop trace (~120 samples). Assert monotonicity. Write
trace to smoke report JSON.

### 2b. Fresh-app seek smoke test (new S25)

Navigate → wait for results → immediately seek to 50% without scrolling.
Tests the cold-start headroom-zone path on real data. The existing smoke
tests all pre-scroll or test scroll-up — none test the most common user
scenario (just arrived, clicks scrubber).

### 2c. CLS capture on seek smoke test (S23 enhancement)

Add `PerformanceObserver` for `layout-shift` entries to S23. CLS doesn't
catch scrollTop-based swimming (see Context above), but it catches layout
shifts from virtualizer height changes during buffer replacement. Makes
the smoke suite strictly more capable at zero cost.

### Validation

- Run full smoke suite on TEST: `node scripts/run-smoke.mjs`
- All S1–S25 pass
- S23 trace shows monotonic scrollTop on real data
- S25 shows zero content shift on cold-start seek

### Files changed

| File | Change |
|---|---|
| `e2e/smoke-scroll-stability.spec.ts` | Upgrade S23, add S25, add CLS to S23 |

---

## Phase 3: Unit-Testable Reverse-Compute — ✅ COMPLETE

**Goal:** Make the most brittle code path independently testable. After
this phase, the headroom offset / sub-row preservation logic can't regress
without a unit test failure in ~5s.

**This phase touches `src/` — small, surgical extraction.**

### 3a. Extract `computeScrollTarget()` pure function

Extract the reverse-compute logic (currently inline in `seek()`,
~L2100–L2213 of `search-store.ts`) into a standalone pure function:

```typescript
export function computeScrollTarget(input: {
  currentScrollTop: number;
  isTable: boolean;
  clientWidth: number;
  backwardItemCount: number;
  bufferLength: number;
  total: number;
  actualOffset: number;
  clampedOffset: number;
}): { scrollTargetIndex: number; seekSubRowOffset: number }
```

`seek()` calls this function instead of doing the math inline. Zero
behavioural change — the function returns the same values, it's just
not buried inside 500 lines of async orchestration.

### 3b. Unit tests for reverse-compute

Add to `search-store.test.ts` (or a new `reverse-compute.test.ts`).
Test cases — the exact edge cases from the Agent 11–13 saga:

| scrollTop | backwardItemCount | Expected scrollTargetIndex | Expected seekSubRowOffset |
|---|---|---|---|
| 0 | 100 | 100 | 0 |
| 150 (half-row) | 100 | 100 | 150 |
| 3030 (10 rows deep) | 100 | 140 | 0 |
| 0 | 0 (shallow seek) | reverse of scrollTop | 0 |
| maxScroll | any (End key) | bufferLength - 1 | 0 |
| boundary (row 16.5, 6 cols) | 100 | 102 | sub-row preserved |

### Validation

- `npm test` — all unit tests pass including new ones
- `npx playwright test` — all local E2E still pass (no behaviour change)

### Files changed

| File | Change |
|---|---|
| `src/stores/search-store.ts` | Extract `computeScrollTarget()`, call it from `seek()` |
| `src/stores/search-store.test.ts` | Add reverse-compute unit tests |

---

## Phase 4: Test Suite Rationalisation (~1 session)

**Goal:** Make the test suite navigable and agent-proof. After this phase,
a fresh agent can run the right tests with zero confusion about which
command, which mode, or where to find results.

**This is a reorganisation and documentation task, not a feature task.**

### Scope

**In scope:**
- Audit every spec file — what it tests, which mode it belongs to, whether
  it duplicates another
- Cull dead/stale tests (e.g. `scrubber-debug.spec.ts` if unused, stale
  visual baselines)
- Deduplicate probe-collection code shared between `perf.spec.ts` and
  `experiments.spec.ts`
- Add clear `npm run` scripts for each test mode with guard-rail error
  messages
- Create `e2e/README.md` — the agent-facing guide to the test suite
- Review and update copilot directives related to testing

**Out of scope:**
- New tests or new probes (Phases 1–3 covered that)
- Changing test logic or assertions
- Changing Playwright configs beyond path updates (if files move)
- Large file/folder restructures (see below)

### 4a. Audit and cull

Read every file in `e2e/` and `e2e-perf/`. For each, answer:
- What does it test?
- Which execution mode does it belong to?
- Does it duplicate another file's coverage?
- Is it actively maintained or stale?

Produce a table in the worklog. Delete or archive anything dead. Document
anything that looks redundant but has a reason to exist.

### 4b. npm run scripts

Add or verify these scripts in `package.json`:

```json
{
  "test": "vitest run",
  "test:e2e": "npx playwright test",
  "test:e2e:full": "./scripts/run-e2e.sh",
  "test:smoke": "node scripts/run-smoke.mjs",
  "test:perf": "node e2e-perf/run-audit.mjs",
  "test:experiment": "npx playwright test --config playwright.experiments.config.ts"
}
```

The names should make the mode obvious. `test:e2e` should refuse if TEST
is connected (global-setup already does this — verify). `test:smoke`
should refuse if local ES is connected (the spec guard already does
this — verify).

### 4c. `e2e/README.md`

Create a concise README that a fresh agent reads before touching any test.
Must cover:

1. **Test modes** — table of the three modes with commands, data sources,
   when to use each
2. **"Which command do I run?"** — decision tree:
   - Changed `src/`? → `npm test` then `npm run test:e2e`
   - Need to validate on real data? → ask user for TEST consent →
     `npm run test:smoke`
   - Running a tuning experiment? → ask user for TEST consent →
     `npm run test:experiment`
3. **Common mistakes** — port 3000 conflict, running E2E when TEST is
   open, running smoke when local ES is connected
4. **Where results live** — smoke JSON, experiment JSON, perf reports,
   Playwright HTML report
5. **File map** — which spec file does what, grouped by mode

Keep it under 100 lines. This is a quick-reference, not documentation.

### 4d. Copilot directive review

Review the testing-related directives in `.github/copilot-instructions.md`.
Propose updates (for user approval) that:

- Reinforce the "stop port 3000" check before E2E
- Make the three test modes explicit (currently directives mention
  `npm test` and `npx playwright test` but don't distinguish smoke/
  experiment modes clearly)
- Reference `e2e/README.md` as the canonical test guide
- Clarify that agents should read smoke JSON results after running
  smoke tests, not parse console output

**Do not modify directives without user approval.** Propose changes,
explain rationale, wait for confirmation.

### 4e. Shared probe extraction (if warranted)

If the audit (4a) reveals significant code duplication between
`perf.spec.ts` and `experiments.spec.ts` (probe setup, snapshot
collection, result writing), extract shared code into a module
(e.g. `e2e-perf/shared-probes.ts`). Only if the duplication is >50
lines and clearly the same logic. Don't force it.

### What to avoid

- **Do not restructure folders.** Moving `e2e/` to `tests/local/` etc.
  would touch every import, every config, every script. The payoff is
  a nicer directory listing; the cost is a massive diff that makes git
  blame useless and risks breaking CI. Not worth it. The README (4c)
  gives agents the mental model without renaming files.
- **Do not change test assertions or logic.** If you find a test that
  looks wrong, note it in the worklog. Don't fix it in this phase.
- **Do not add new tests.** Phase 1–3 already did that.

### Validation

- All existing tests still pass: `npm test` + `npm run test:e2e`
- `e2e/README.md` exists and is accurate
- npm scripts work correctly (test each one)
- Directive changes proposed (not applied without user approval)
- Worklog has the full audit table

### Files changed (expected)

| File | Change |
|---|---|
| `e2e/README.md` | Created — agent-facing test suite guide |
| `package.json` | npm run scripts verified/added |
| `e2e/scrubber-debug.spec.ts` | Deleted or documented (if stale) |
| `e2e-perf/shared-probes.ts` | Created (if warranted by 4e) |
| `.github/copilot-instructions.md` | Proposed changes (user-approved) |
| Directive human copy | Same changes as above |

---

## Phase 5: Test File Reorganisation (~1 session)

**Goal:** Make the file system match the mental model established by
Phase 4's README. After this phase, the directory structure tells you
which mode a test belongs to without reading the file.

**Prerequisite:** Phase 4 complete (audit table, README, npm scripts).

### Target structure

```
e2e/
  local/                          ← npx playwright test (habitual)
    scrubber.spec.ts
    buffer-corruption.spec.ts
    visual-baseline.spec.ts
    visual-baseline.spec.ts-snapshots/
  smoke/                          ← node scripts/run-smoke.mjs (TEST)
    manual-smoke-test.spec.ts
    smoke-scroll-stability.spec.ts
    smoke-report.ts
  shared/                         ← imported by both local and smoke
    helpers.ts
    tsconfig.json
  global-setup.ts                 ← stays at e2e/ root (config references it)
  README.md                       ← from Phase 4

e2e-perf/                         ← unchanged (already separate)
  perf.spec.ts
  experiments.spec.ts
  shared-probes.ts                ← from Phase 4e (if created)
  ...
```

### What moves

| File | From | To | Why |
|---|---|---|---|
| `scrubber.spec.ts` | `e2e/` | `e2e/local/` | Local-only E2E |
| `buffer-corruption.spec.ts` | `e2e/` | `e2e/local/` | Local-only E2E |
| `visual-baseline.spec.ts` | `e2e/` | `e2e/local/` | Local-only E2E |
| `manual-smoke-test.spec.ts` | `e2e/` | `e2e/smoke/` | Smoke-only |
| `smoke-scroll-stability.spec.ts` | `e2e/` | `e2e/smoke/` | Smoke-only |
| `smoke-report.ts` | `e2e/` | `e2e/smoke/` | Smoke helper |
| `helpers.ts` | `e2e/` | `e2e/shared/` | Used by both |
| `scrubber-debug.spec.ts` | `e2e/` | deleted | Dead (if Phase 4 confirmed) |

### What changes per move

For each moved file:
1. Update its internal imports (relative paths change)
2. Update all files that import it (relative paths change)
3. Update Playwright config `testDir` / `testMatch` / `testIgnore`
4. Update `global-setup.ts` path reference in config
5. Run `npm test` + `npx playwright test` after each batch

### Config changes

```typescript
// playwright.config.ts — local E2E
testDir: "./e2e/local",
testMatch: "**/*.spec.ts",
testIgnore: [],  // no need to exclude smoke — they're not in this dir
globalSetup: "./e2e/global-setup.ts",

// playwright.smoke.config.ts — smoke on TEST
testDir: "./e2e/smoke",
testMatch: "**/*.spec.ts",
```

### What to avoid

- **Do not move `e2e-perf/`.** It's already separate and has its own
  configs, README, and result directories. Moving it gains nothing.
- **Do not rename files.** `scrubber.spec.ts` stays `scrubber.spec.ts`.
  The folder provides the context that the filename doesn't.
- **Do not change test logic.** This is purely mechanical — move files,
  fix imports, update configs, verify green.
- **Do batch moves, not one-at-a-time.** Move all local specs together,
  fix all their imports, test. Then move all smoke specs together, fix,
  test. Two batches, not seven individual moves.

### Validation

- `npm test` — unit tests pass (no `src/` changes)
- `npx playwright test` — all local E2E pass from new paths
- `node scripts/run-smoke.mjs` — smoke tests find their files (may need
  TEST consent to actually run; at minimum verify the runner doesn't error)
- `e2e/README.md` updated to reflect new paths
- git blame preserved (use `git mv` for moves)

### Files changed

| File | Change |
|---|---|
| `e2e/local/*.spec.ts` | Moved from `e2e/` |
| `e2e/smoke/*.spec.ts` | Moved from `e2e/` |
| `e2e/shared/helpers.ts` | Moved from `e2e/` |
| `playwright.config.ts` | Updated `testDir`, removed `testIgnore` for smoke files |
| `playwright.smoke.config.ts` | Updated `testDir` |
| `e2e/README.md` | Updated file paths |
| `scripts/run-smoke.mjs` | Updated paths if it references spec files directly |
| Various spec files | Updated relative import paths |

---

## Phase 6: Timing Tuning Experiments (~2–3 sessions)

**Goal:** Systematically reduce wasted latency in the timing chain.
Each experiment: modify constant → local E2E (regression gate) →
agent-on-TEST (timing validation) → experiment spec (perf measurement).

**Requires:** Agent-on-TEST consent. All three test modes operational.

> **Essential context:** Read `exploration/docs/00 Architecture and
> philosophy/scroll-architecture.md` before starting this phase —
> specifically §4 (Swimming, Timing, and Limits). It explains the timing
> chain, what each constant guards against, and why bidirectional seek
> changed the constraints. Without that context you will not understand
> why these values are safe to reduce.

### The tuning targets

There are two groups. **Group A** (timing constants) are coupled — tune
them in the order listed. **Group B** (overscan) is independent.

**Group A — timing chain (tune in order):**

| Constant | Current | Why it's conservative | Safe floor (hypothesis) |
|---|---|---|---|
| `SEEK_COOLDOWN_MS` | 700ms | Set when bidirectional seek didn't exist | ~200ms (rAF guard might replace entirely) |
| `SEEK_DEFERRED_SCROLL_MS` | 800ms | **Coupled:** must be > cooldown. Tune *after* cooldown settles. | final cooldown + 50ms |
| `POST_EXTEND_COOLDOWN_MS` | 200ms | Needs 2+ paint frames. **Latency-dependent** — see note below. | ~50ms (local), may be higher on TEST |

**Coupling rule:** `SEEK_DEFERRED_SCROLL_MS` must be > `SEEK_COOLDOWN_MS`.
After finding the cooldown floor, set deferred = floor + δ and tune δ
(the gap). Do not tune deferred independently — you'll either leave dead
time or create a race where the deferred scroll fires inside the cooldown.

**Latency caveat on `POST_EXTEND_COOLDOWN_MS`:** The floor hypothesis
("~50ms, just needs 2–3 paint frames") assumes the cooldown only gates
paint. In practice it also gates the *next extend request* from firing
before the current one's DOM update has landed. On local ES (<5ms
round-trip), 50ms may be fine. On TEST (50–200ms round-trip), the actual
floor may be higher because the extend's data arrival + React render +
`scrollTop` compensation takes longer. **The local E2E gate is
insufficient for this constant** — TEST validation is the real signal.

**Group B — overscan (independent, test separately):**

| Constant | Current | Why it's conservative | Test method |
|---|---|---|---|
| `overscan` (table) | 5 | Experiment D showed 5 optimal for grid | Test 3, 5, 8, 10 directly — don't halve. Pick the winner from E1 metrics. |

Overscan is a small discrete integer. Binary search over {3, 5, 8, 10}
is silly — just test the candidate values and compare.

### Method per timing constant

1. **Halve the value** (e.g. 700→350)
2. Run `npx playwright test` — local E2E regression gate (~70s)
3. If pass: run smoke S14, S22, S23, S25 on TEST (headed) — timing validation
4. If pass: run experiment E1/E2 — measure perf (headed) (jank, flashes, LoAF)
5. Record results in `e2e-perf/results/experiments/`
6. **Halve again** (350→175) and repeat
7. When a test fails or perf regresses: **bisect the gap** between the
   last pass and the first fail (e.g. 350 pass, 175 fail → try 262).
   One extra round per constant gives significantly better precision
   than stopping at "the halve before the failure".
8. **Revert source to the floor value or original** — commit only winners.

### Warm vs cold seeks

Run each timing configuration in **both** states:

- **Cold seek:** fresh page load → immediately seek to 50% (S25 tests
  this path). The virtualiser has no prior state.
- **Warm seek:** scroll around, then seek. The virtualiser is populated,
  React has mounted, buffer has history.

The settle time can differ significantly. A value that works warm may
race on cold start (no prior rAF cycle, no cached measurements). S25
is the cold-start gate; S14/S22/S23 are warm-state gates.

### Experiment workflow (concrete)

```bash
# Agent modifies tuning.ts: SEEK_COOLDOWN_MS = 350
# Vite HMR reloads

# Step 1: local regression gate
npx playwright test

# Step 2: timing validation on TEST (agent-on-TEST consent required)
node scripts/run-smoke.mjs 14 22 23 25

# Step 3: perf measurement
npx playwright test --config playwright.experiments.config.ts -g "E1"

# Agent reads JSON results, records in experiments-log.md
# Agent reverts or keeps the change based on results
```

### Expected outcomes

- **SEEK_COOLDOWN_MS:** likely reducible to 200–400ms. Bidirectional seek
  means extends operate off-screen — the cooldown only needs to survive
  the virtualiser's initial reflow, not prevent visible swimming.
- **SEEK_DEFERRED_SCROLL_MS:** likely reducible to cooldown + 50–100ms.
  The current 100ms gap is already conservative. May be reducible to
  cooldown + 30ms, but the absolute savings are small — don't spend
  more than one round on this.
- **POST_EXTEND_COOLDOWN_MS:** likely 50–100ms on local, possibly
  100–150ms on TEST. The local/TEST floor difference is the interesting
  finding here.
- **Table overscan 5→8:** likely a net win (160px→256px headroom, modest
  DOM cost). Needs E1 experiment to confirm.

### Rollback and durability

Experiment JSON results in `e2e-perf/results/experiments/` are
**permanent artefacts** — do not delete them after tuning. If any future
regression is reported, the first diagnostic step is: revert to pre-tune
values, re-run the experiment suite, compare against the stored baselines.
The JSON history *is* the evidence that the tuned values were validated.

### Validation

- All local E2E pass at final tuned values
- All smoke tests pass on TEST at final tuned values (both warm and cold)
- Experiment metrics show no regression (or improvement) vs baseline
- User manually verifies on TEST (visual sanity check)

### Files changed

| File | Change |
|---|---|
| `src/constants/tuning.ts` | Adjusted timing values |
| `src/components/ImageTable.tsx` | overscan change (if experiment confirms) |
| `e2e-perf/results/experiments/` | Experiment result JSONs (permanent) |
| `e2e-perf/results/experiments/experiments-log.md` | Comparison tables |

---

## ~~Phase 7: seek() Decomposition (optional, future)~~

**Goal:** Structural refactor to make the timing chain replaceable. Only
worth doing if Phase 6 reveals that time-based guards can't be reduced
further without state-based guards.

**Abandoned as the predicate not met:** Time-based guards reduced dramatically
(7x / 5.3x / 4x) with zero stability regressions. The floor we hit at `SEEK_COOLDOWN_MS`=65-80ms
isn't a timing-chain problem — it's a legitimate DOM settling constraint (the browser
physically needs ~2-4 paint frames to finish repositioning after a seek).

**Not planned in detail** — this is a placeholder. The shape:

1. Extract strategy selection (which seek path) as pure function
2. Extract ES orchestration (the fetches) as async function, no Zustand
3. Extract buffer assembly (combine forward + backward) as pure function
4. `seek()` becomes a thin orchestrator: select → fetch → assemble →
   compute scroll target (Phase 3) → `set()`
5. Replace time-based cooldowns with rAF-based state guards

**Prerequisite:** Phases 1–3 complete (test regime in place). Phase 4
complete (we know which timing values are load-bearing and which are
waste).

**Risk:** Medium. Touching the seek function's internals. The test regime
from Phases 1–3 is the safety net.

---

## Phase Dependency Map

```
Phase 1 (local probes) ✅
    │
    ├── Phase 2 (smoke hardening) ✅ ← requires TEST
    │
    └── Phase 3 (reverse-compute extraction) ✅

Phase 4 (test suite rationalisation) ← audit, README, scripts, directives
    │
    └── Phase 5 (file reorganisation) ← mechanical moves, requires Phase 4
            │
            └── Phase 6 (tuning) ← requires Phases 1–3, benefits from 4–5
                    │
                    └── Phase 7 (decomposition) ← only if needed
```

Phases 4 and 5 are not hard prerequisites for Phase 6, but doing them
first means the tuning agent wastes zero time on navigation or confusion.
