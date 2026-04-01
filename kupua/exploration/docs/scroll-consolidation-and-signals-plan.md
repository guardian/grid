# Kupua Scroll Architecture Consolidation + Signals Spike Plan

> **Date:** 31 March 2026
> **Status:** Part A complete. Part B (Signals spike) next.
> **Prerequisite:** Buffer corruption fix committed and validated (done)
> **Context:** `fix-ui-docs-eval.md` Part 3.2.5 (Alternative C: Signals) and the
> scroll-state fragmentation diagnosed during the buffer corruption investigation.

---

## Problem Statement

Scroll position management is spread across 10+ files with 6+ independent
mechanisms. The buffer corruption bug required 5 defensive layers because
these mechanisms race against each other. Every bug fix adds code; no bug
fix removes the underlying fragmentation. The architecture needs
consolidation before any further features (filmstrip density, selection,
"Never Lost" adjacency algorithm) are built on top of it.

Separately, the eval doc identifies that React's batch-render model is the
structural cause of several coupling workarounds (`virtualizerRef`,
`loadMoreRef`, `useSyncExternalStore` for visible range, DOM-direct
Scrubber updates). A Preact Signals spike could eliminate these workarounds
at the architectural level — but only after consolidation makes the scope
manageable.

---

## "Never Lost" — Architecture Implications

The project's philosophy is: **keeping the user's position is the default
behaviour. We only lose it when we've decided that's better UX for that
specific scenario.**

Currently we preserve position across: sort changes (sort-around-focus),
density switches (density-focus ratio bridge), scrubber seeks, return from
image detail, Home/End keys. But we **don't** preserve it across:

- **Metadata click-to-search:** User is viewing image F, clicks a metadata
  value (e.g. byline). Results contain image F. Currently: scrolls to top.
  Should: show image F in the new results if it's present.
- **Filter constrain:** User has image S focused, adds a filter. Image S
  is still in the filtered results. Currently: scrolls to top. Should:
  keep image S in view.
- **Filter constrain (image excluded):** User has image J focused, adds a
  filter that excludes J. But J's neighbours are still in results.
  Currently: scrolls to top. Could: show the nearest surviving neighbour.
  (Whether this is good UX is debatable — but the coordinator should be
  *capable* of it; whether we *use* it is a separate decision.)

**Architecture requirement:** The scroll coordinator must support a
`restoreNearestMatch(imageId)` intent — "after the next search completes,
if this image is in the results, scroll to it; if not, optionally scroll
to the nearest surviving neighbour." This is the same mechanism as
sort-around-focus (`_findAndFocusImage`) generalised to any search
transition. The coordinator doesn't need to know *why* it should restore —
only *that* it should try, and *what* to fall back to if the image is gone.

This does NOT mean building these features now. It means the coordinator's
intent API should be expressive enough that adding them later is a
configuration change (call `coordinator.restoreNearestMatch(id)` instead of
`coordinator.resetToTop()`), not a plumbing change.

---

## Part A: Scroll Coordinator Consolidation

### Goal

Replace the current scatter of scroll-management code with a single
coordinated module. No feature changes. All 70 E2E tests must pass after
each step.

### Current state: where scroll logic lives

```
File                          Mechanism
─────────────────────────────────────────────────────────────────────
scroll-reset.ts               DOM scrollTop=0, synthetic scroll event,
                              abortExtends(), fireScrollReset()
scroll-reset-ref.ts           virtualizer.scrollToOffset(0) registration
scroll-container-ref.ts       Which DOM element to scroll
density-focus.ts              Save/restore viewport ratio on density switch
sort-focus.ts                 Save/restore viewport ratio on sort change
search-store.ts               abortExtends, _seekCooldownUntil,
                              _seekGeneration, _seekTargetLocalIndex,
                              _prependGeneration, _forwardEvictGeneration
ImageGrid.tsx                 3 useLayoutEffects: searchParams scroll reset,
                              bufferOffset→0 guard, column-change anchoring.
                              1 useEffect: sortAroundFocusGeneration scroll.
                              1 useEffect: scroll-reset-ref registration.
                              handleScroll → reportVisibleRange → extends.
ImageTable.tsx                Same 3 useLayoutEffects (duplicated).
                              Same 2 useEffects (duplicated).
                              Same handleScroll (duplicated).
useDataWindow.ts              reportVisibleRange → extend triggers
useReturnFromDetail.ts        Scroll restore after image detail overlay
```

### Target state

```
File                          Responsibility
─────────────────────────────────────────────────────────────────────
scroll-coordinator.ts (NEW)   Single owner of scroll intent + transitions.
                              Exposes: resetToTop(), seekTo(offset),
                              restoreAfterDensitySwitch(ratio),
                              restoreAfterSort(ratio),
                              restoreAfterDetail(imageId).
                              Internally manages: cooldowns, abort,
                              virtualizer registration, scroll container ref.
                              Consumes search-store for buffer state.

density-focus.ts              DELETED — absorbed into coordinator
sort-focus.ts                 DELETED — absorbed into coordinator
scroll-reset.ts               DELETED — absorbed into coordinator
scroll-reset-ref.ts           DELETED — absorbed into coordinator
scroll-container-ref.ts       DELETED — absorbed into coordinator

ImageGrid.tsx                 On mount: registers virtualizer + scroll
                              container with coordinator. On unmount:
                              deregisters. NO scroll-related useLayoutEffect.
                              handleScroll only calls reportVisibleRange.
ImageTable.tsx                Same as ImageGrid (zero duplication).

search-store.ts               search() calls coordinator.resetToTop()
                              instead of setting cooldowns directly.
                              seek() calls coordinator.seekTo().
                              abortExtends stays in store (buffer concern).
```

### Steps (each independently testable)

**Step 1: Extract shared scroll effects from ImageGrid + ImageTable**

Create `useScrollEffects(virtualizer, parentRef, geometry)` hook that
contains:
- searchParams scroll-reset useLayoutEffect
- bufferOffset→0 guard useLayoutEffect
- sortAroundFocusGeneration scroll useEffect
- scroll-container-ref registration useEffect
- scroll-reset-ref registration useEffect
- handleScroll definition + registration useEffect

Both components call the hook instead of inlining the logic.

**Test gate:** All 70 E2E tests pass. `git diff ImageGrid.tsx ImageTable.tsx`
shows only the hook call + geometry params, no inline scroll logic.

**Step 2: Absorb density-focus and sort-focus into the hook**

The hook captures viewport ratio on unmount (density switch) and before
sort changes. It restores on mount / after sortAroundFocusGeneration.
`density-focus.ts` and `sort-focus.ts` are deleted.

**Test gate:** All 70 E2E tests pass. Focus preservation on density switch
and sort change works (tests 26-28, 34-35, 60-62 specifically).

**Step 3: Absorb scroll-reset into the hook**

`resetScrollAndFocusSearch()` becomes a method on the coordinator (or a
call to `coordinator.resetToTop()`). The `abortExtends()` call, DOM
scrollTop reset, virtualizer scrollToOffset, and visible range reset all
happen in one place. `scroll-reset.ts`, `scroll-reset-ref.ts`, and
`scroll-container-ref.ts` are deleted.

**Test gate:** All 70 E2E tests pass. Buffer corruption tests (1-9)
specifically.

**Step 4: Clean up search-store**

Remove `_seekCooldownUntil` manipulation from `search()` — the coordinator
handles it. `abortExtends()` stays in the store (it's a buffer concern,
not a scroll concern). The store exposes `abortExtends()` for the
coordinator to call, not for `scroll-reset.ts` to call directly.

**Test gate:** All 70 E2E tests pass.

### Risk assessment

**Highest risk:** Step 3. Moving `abortExtends()` timing relative to the
synthetic scroll event is exactly the kind of change that caused the
original buffer corruption bug. The buffer corruption tests (all 9) are
the specific safety net for this step.

**Lowest risk:** Step 1. Pure extraction, no logic change. If the hook
contains exactly the same code that was inline, behavior is identical.

**Mitigation:** After each step, run the full E2E suite locally. After
Step 3 specifically, also run `playwright.run-manually-on-TEST.config.ts`
against real ES (human runs this manually).

---

## Part B: Preact Signals Spike

### Goal

Evaluate whether Preact Signals (`@preact/signals-react`) can eliminate
the `useCallback`/`useRef` workarounds on the scroll path, improving
frame-time performance measurably. This is an exploration, not a
commitment.

### Why signals might help (from eval doc §3.2.5)

The codebase already approximates signals manually in 4 places:

1. `useSyncExternalStore` for visible range (module-level `_visibleStart`,
   `_visibleEnd`) — avoids React re-render on scroll
2. Scrubber `thumbEl.style.top = ...` — DOM-direct, bypasses React
3. `virtualizerRef.current` — reads latest virtualizer without causing
   re-render
4. `configRef` in `useListNavigation` — reads config without hook
   re-registration

With signals, these become:
1. `const visibleStart = signal(0)` — subscribers update without re-render
2. `const thumbTop = signal(0)` — bound to DOM via `effect()`
3. Virtualizer range accessed via signal — no ref needed
4. Config is a signal — no ref wrapping needed

### What the spike would test

**One component only: ImageTable's handleScroll path.**

Replace:
```ts
const virtualizerRef = useRef(virtualizer);
virtualizerRef.current = virtualizer;
const loadMoreRef = useRef(loadMore);
loadMoreRef.current = loadMore;
const handleScroll = useCallback(() => {
  const range = virtualizerRef.current.range;
  // ...
}, [reportVisibleRange]);
```

With:
```ts
const virtualizer$ = useSignal(virtualizer);
const handleScroll = () => {
  const range = virtualizer$.value.range;
  // ...
};
// No useCallback, no useEffect for listener registration
// Signal effect handles it
```

**Measure:** P8 (table fast scroll) frame times, LoAF, DOM churn.
Compare with current baseline.

### What the spike would NOT do

- Not convert the entire app to signals
- Not touch the store (Zustand stays)
- Not touch the Scrubber (already signal-like via DOM-direct)
- Not touch ImageGrid (do one component first)

### Success criteria

- P8 p95 frame time drops measurably (currently 50ms — target <40ms)
- OR P8 DOM churn drops (currently ~57k — this would be surprising since
  it's a virtualizer issue, not a React issue)
- OR the code is demonstrably simpler (fewer refs, fewer useCallbacks,
  fewer useEffects) with no regression

If none of these are achieved, the spike is negative and we don't proceed.

### Dependencies

- Part A Step 1 should be done first (shared hook makes the signals
  conversion scope clearer)
- `@preact/signals-react` must be installed (`npm install @preact/signals-react`)
- No other code changes needed — signals are additive

---

## Part C: What NOT to do

These are things that seem tempting but aren't worth it:

1. **Don't rewrite ImageGrid/ImageTable from scratch.** Extract, don't
   rewrite. The rendering logic (JSX, column layout, cell rendering) is
   correct and well-tested. Only the scroll/lifecycle logic needs moving.

2. **Don't add features during consolidation.** No filmstrip, no
   selection, no adjacency algorithm. Pure refactor with test gates.

3. **Don't optimise P8 during this phase.** P8's ~57k DOM churn is a
   TanStack Virtual characteristic. It won't change from consolidation
   or signals. It needs a different approach (skeleton rows, or accepting
   the current 50ms p95 as good enough).

4. **Don't convert Zustand to signals.** The store is fine. Zustand's
   `getState()` for imperative access and `useStore()` for React
   subscription is the right model. Signals are for the render/scroll
   hot path, not for application state.

5. **Don't touch the DAL, CQL, routing, or panels.** They're solid.

---

## Execution order

```
Part A Step 1: Extract shared scroll hook        ~2h   (safe, mechanical)
Part A Step 2: Absorb density/sort focus          ~1.5h (moderate risk)
Part A Step 3: Absorb scroll-reset                ~2h   (highest risk — run smoke tests)
Part A Step 4: Clean up search-store              ~1h   (safe, removal only)
───────────────────────────────────────────────────────
Part B: Signals spike on ImageTable               ~4-6h (exploratory)
```

Part A is ~6.5h of work with test gates after each step.
Part B is a spike — timebox it. If it doesn't show results in 6h, stop.

---

## How to verify Part A doesn't break stuff

1. **E2E tests after every step** (70 tests, 2.8 min run)
2. **Buffer corruption tests specifically** (tests 1-9) — these are the
   canary for scroll/buffer race conditions
3. **Manual smoke on TEST after Step 3** — the highest-risk step needs
   real-data validation (human runs `playwright.run-manually-on-TEST.config.ts`)
4. **Each step is a separate commit** — if Step N breaks something,
   `git revert` that one commit, don't untangle a monolithic change
5. **No feature changes in any step** — if tests fail, the bug is in the
   extraction, not in new behavior

The answer to "how can we make sure Phase 1 won't break stuff without
tests" is: **you can't, and you already have the tests.** The 70 E2E tests
+ 9 buffer corruption tests are exactly the safety net. The trick is to
take small enough steps that when something breaks, you know which step
caused it.

---

## Manual Test Scenarios

After each Part A step, the user should test these scenarios manually in
the browser (in addition to the automated E2E suite). These exercise
timing-sensitive interactions that are hard to reproduce reliably in
headless Playwright.

### After every step

| #  | Scenario | Expected |
|----|----------|----------|
| M1 | Fresh load → seek to ~50% via scrubber → click Home logo | Grid shows position 1, scrollTop=0, no stale images visible |
| M2 | Same as M1, but in table view | Same expectations |
| M3 | Deep seek → double-click image → click logo in detail view | Returns to grid at position 1, detail closed |
| M4 | Deep seek → click logo → immediately scroll down rapidly | After ~2s, new content loads (extends work after cooldown) |
| M5 | Grid view → focus image → switch to table → switch back to grid | Same image visible at roughly the same viewport position |
| M6 | Focus image → change sort (e.g. Uploaded → Credit) | Same image visible at roughly the same viewport position |

### After Step 3 specifically (scroll-reset absorbed — highest risk)

| #  | Scenario | Expected |
|----|----------|----------|
| M7 | Deep seek → click logo 5 times rapidly | Always ends at position 1, no flash of old images |
| M8 | Deep seek → type a new query in CQL → press Enter | New results at position 1, no corruption |
| M9 | Deep seek → open image detail → click a metadata value | New search loads, detail closes, results at top |
| M10 | Seek to ~80% → press Home key | Returns to position 1 instantly |
| M11 | Seek to ~50% → scroll up slowly until backward extend fires → verify no reordering | Images don't shuffle or duplicate |

### Against real ES (TEST cluster) — after Step 3

These must be run against the TEST cluster (1M+ docs) because the race
windows are wider with real network latency.

| #  | Scenario | Expected |
|----|----------|----------|
| T1 | Seek to ~50% (~500k offset) → click Home logo | Position 1 in <2s, no stale 2022-era images |
| T2 | Seek to ~75% under Credit sort → click Home logo | Position 1, buffer has ≤200 items |
| T3 | T1 repeated 5 times in quick succession | Always clean |
| T4 | Deep seek → open image → click byline metadata | New search, detail closed, no corruption |

---

## Instructions for a Fresh Agent Session

This section is designed to be pasted as context for a new Copilot agent
session that continues this work. It tells the agent exactly what to read,
what to skip, and what protocols to follow.

### What to read (in this order)

1. **This document** — you're reading it. It's the plan.
2. **`kupua/AGENTS.md`** — current state of the project. Read the "What's
   Done" section for architecture overview. Skim "What's Next" for
   priorities. Don't read the full Performance paragraph in detail — it's
   historical.
3. **`kupua/exploration/docs/buffer-corruption-fix.md`** — the bug that
   motivated this consolidation. Read sections 1-3 (what, root cause, fix).
   Skim section 8 (broader implications). This is essential context for
   understanding *why* the scroll logic is fragmented and what the
   coordinator must protect against.
4. **`kupua/src/lib/scroll-reset.ts`** — 62 lines. The current choke
   point for scroll resets. Read the whole file.
5. **`kupua/src/lib/scroll-reset-ref.ts`** — 32 lines. Read it.
6. **`kupua/src/lib/scroll-container-ref.ts`** — 27 lines. Read it.
7. **`kupua/src/lib/density-focus.ts`** and **`kupua/src/lib/sort-focus.ts`**
   — ~30 lines each. The module-level bridges. Read both.

Then, only when starting work on a specific step, read the relevant
component code:
- Step 1-2: Read `ImageGrid.tsx` and `ImageTable.tsx` — but only the
  scroll/lifecycle hooks (search for `useLayoutEffect`, `useEffect`,
  `handleScroll`, `scrollToOffset`, `saveFocusRatio`, `saveSortFocusRatio`).
  Skip the JSX/rendering sections.
- Step 3: Read `search-store.ts` — but only `search()` (the
  `_rangeAbortController` + `_seekCooldownUntil` section, ~20 lines) and
  `abortExtends()` (~10 lines). Do NOT read the entire 1600-line store.
- Step 4: Same `search-store.ts` sections as Step 3.

### What NOT to read

- **`kupua/exploration/docs/changelog.md`** — 1000+ lines of historical
  blow-by-blow. Useful for archaeology, useless for this task. Skip.
- **`kupua/exploration/docs/DISASTAH-NOT-PERF.md`** — post-mortem of a
  failed session. Its analysis incorrectly attributed bugs to the wrong
  commits. The buffer-corruption-fix.md supersedes it. Skip.
- **`kupua/exploration/docs/post-perf-fixes.md`** — handoff doc from the
  session that produced the broken commits. Its fix recommendations were
  wrong. Skip.
- **`kupua/exploration/docs/focus-drift-and-scroll-handoff.md`** and
  **`focus-drift-and-scroll-handoff-v2.md`** — same: useful analysis,
  wrong fix recommendations. Skip.
- **`kupua/src/dal/`** — the data access layer is not touched by this
  work. Skip.
- **`kupua/src/components/Scrubber.tsx`** — 930 lines. Not touched by
  Part A. Only relevant for Part B (signals spike). Skip until then.
- **Any file outside `kupua/`** — this agent's scope is kupua only (see
  directives in `.github/copilot-instructions.md`).

### Protocols

**⚠️ Before running E2E tests:** Always warn the user: *"I'm about to
run E2E tests. Please close any running kupua dev server or browser
instance — Playwright needs port 3000 and will start its own Vite
server."* Wait for confirmation before running `./scripts/run-e2e.sh` or
`npx playwright test`.

**⚠️ Manual tests against TEST cluster:** The agent must NEVER run tests
against the TEST cluster directly. When a step requires TEST validation
(Step 3 and any step the agent judges as high-risk), tell the user:

> *"This step needs manual validation against real ES. Please:*
> 1. *Start the app with `./kupua/scripts/start.sh --use-TEST`*
> 2. *Run through scenarios T1–T4 from the manual test table in
>    `scroll-consolidation-and-signals-plan.md`*
> 3. *Optionally run `npx playwright test --config playwright.run-manually-on-TEST.config.ts`
>    from your own terminal*
> 4. *Report results back to me"*

**Commit discipline:** One commit per step. Never commit without asking
the user. Never push. See directives for commit message format (use
`git commit -F <file>`, not `-m`).

**If tests fail after a step:** Do NOT layer fixes on top. First, try to
understand the failure. If it's a timing issue (flaky), re-run once. If
it's a real regression, `git stash` the changes, verify the tests pass on
the clean state, then `git stash pop` and fix the extraction — not the
test.

**Performance:** If any change is likely to impact scroll-path performance
(e.g. adding a `useEffect` that fires on every scroll, or changing a
`useCallback` dependency array), warn the user before proceeding.

### Session kickoff template

When starting a new session on this work, say:

> *"I'm continuing the scroll architecture consolidation. I'll read the
> plan doc and the files it specifies. Which step should I work on?
> (If we left off mid-step, tell me which step and what's done so far.)"*

---

## Follow-up: Fix Bug #17 Tests (Density Switch at Deep Scroll)

> **Discovered:** 1 Apr 2026, during Part A Step 1.
> **Status:** Understood, not yet fixed.

The 2 skipped tests in `e2e/scrubber.spec.ts` (Bug #17 — "density switch
after deep scroll preserves focus visibility") were never actually
exercising the bug they were designed to catch. Two independent issues:

### Issue 1: `scrollDeep` helper doesn't trigger extends

The helper sets `el.scrollTop = el.scrollHeight` in a loop, expecting the
buffer to extend past eviction threshold (`bufferOffset ≥ 100`). But in
headless Chromium, **programmatic `scrollTop` assignment doesn't reliably
fire native scroll events**, so the scroll handler never runs,
`reportVisibleRange` never fires, and `extendForward` never triggers. The
buffer stays at 200 items with offset 0 → skip guard activates.

**Fix:** Add `el.dispatchEvent(new Event("scroll"))` after each
`scrollTop` assignment. Also change the fixed 8-iteration loop to an
early-exit loop that checks the threshold each iteration (grid rows at
303px need ~3× more iterations than table rows at 32px to cover the same
buffer distance).

### Issue 2: Density-focus at deep scroll doesn't preserve position

Once Issue 1 is fixed and the tests actually run, they expose a **real bug
in the density-focus save/restore logic at deep scroll positions**. The
focused image is in the buffer (`inBuffer: true`) but the viewport is NOT
scrolled to show it after the density switch (`scrolledToIt: false`). This
fails consistently on both pre-refactor and post-refactor code — it is not
a regression from the scroll consolidation.

The test's `focusNthItem(3)` also needs replacing: after deep scroll the
table rows shift during extends/evictions, making Playwright's click
target unstable (timeout or wrong row). Programmatic focus via
`store.getState().setFocusedImageId(id)` + scrolling the focused image
into view before the density switch is more reliable.

**Root cause hypothesis:** The density-focus unmount save computes the
ratio when the focused image is at buffer-local index ~500, but the grid's
`scrollHeight` after mount (with fewer rows due to multi-column layout) is
much smaller than the table's. The clamping in the mount restore may pin
`scrollTop` to `scrollHeight - clientHeight`, which is nowhere near the
focused row's pixel position. Needs investigation.

**When to fix:** During Part A Step 2 (absorb density-focus into the
hook) — the density-focus logic will be right in front of us, and the
fixed tests become the regression guard.

