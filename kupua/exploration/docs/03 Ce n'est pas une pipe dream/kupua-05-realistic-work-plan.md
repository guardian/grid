# Kupua — Realistic Work Plan

**Author:** Human developer + AI agent (Copilot)
**Date:** 3 April 2026
**Status:** Executable — three self-contained sessions
**Audience:** The developer who'll hand these prompts to an AI agent

## Why This Document Exists

`04-kupua-structural-work-plan.md` is a thorough 5-phase rearchitecture plan written as
if a team of experienced engineers will execute it over 10–14 developer-days. That's not
what's happening. Kupua is built and maintained by one non-engineer working with AI agents.

This document extracts the **safest, highest-value subset** of that plan — three sessions
that move the codebase toward the target architecture without risking the working prototype.
Each session is designed to fit within a single agent context window and produce a commit
with all tests passing.

### What these sessions achieve

1. **Better test coverage** — new tests that catch regressions during *any* future change,
   not just the rearchitecture.
2. **Clean dependency arrows** — no more components importing imperative functions from
   other components. The dependency direction becomes strictly downward:
   `components → hooks → lib → dal`.
3. **Partial DAL boundary restoration** — ES-specific code (CQL translator, sort builders)
   moves into the ES adapter directory, making it visible what would change if kupua ever
   talks to Grid's media-api instead.

### What these sessions explicitly do NOT attempt

- **Store split.** The 1,793-line `search-store.ts` monolith stays untouched. Splitting it
  requires rewiring every consumer, re-establishing timing invariants across 7 stores +
  orchestration functions, and rewriting all 34 store unit tests. The risk of breaking the
  app's most complex behaviour (scroll compensation, seek cooldowns, sort-around-focus,
  density-focus bridges) is too high without a team that understands every module-level
  variable.
- **Service contracts.** The `ImageDataSource` → `EnhancedSearchEngine` → `ImageSearchService`
  layering has one implementation and one consumer today. Introducing three interfaces for
  code with one implementor is overhead with zero near-term payoff.
- **Extension surface.** Nobody is writing extensions.
- **Component splits.** `ImageTable.tsx` (1,260 lines) and `Scrubber.tsx` (1,010 lines) are
  large, but the developer and agent know them intimately. Splitting them across multiple
  files risks closure/scope bugs for a comprehension benefit that only matters when a second
  developer joins.

### Relationship to 04

These three sessions correspond to:

| Session | 04 equivalent | What's different |
|---|---|---|
| 1 — Test harness | Phase 0 (partial) | Permanent tests only, no `__harness__/` directories, no write-path stubs |
| 2 — Extract orchestration | Phase 1 | Identical scope, more precise instructions |
| 3 — DAL boundary | Phase 2 Step 2.4 + 2.5 (partial) | Tuning constants + file moves only, no store split, no contracts |

Phases 2B (store split), 3 (component splits), and 4 (feature homes) are deferred
indefinitely. They remain documented in 04 for the day a team picks up the work.

---

## Prerequisites (all sessions)

- Docker running (for local ES)
- `kupua/scripts/load-sample-data.sh` has been run at least once (sample data exists)
- No dev server running on port 3000 (agent sessions start their own)
- Node.js ≥20.19.0 or ≥22.12.0

## Governing Constraints (all sessions)

These apply to every session. Include them in every prompt.

1. **No logic changes.** These sessions move code between files and add tests. No function
   body is modified. No algorithm is changed. No timing is altered.
2. **No new render cycles.** No change may add a React re-render, a new `useEffect`, or a
   new store subscription.
3. **No new dependencies.** No `npm install`.
4. **Tests are the gatekeeper.** After every individual file move: `npm test` must pass.
   After completing the session: `npx playwright test` must pass (all ~71 E2E tests).
   `npm run build` must produce zero errors.
5. **The store is sacred.** `src/stores/search-store.ts` is not modified in Sessions 1 or 3.
   Session 2 modifies it only to remove code that moved elsewhere (imports of moved functions
   change, no logic changes).

---

## Session 1: Test Harness

**Goal:** Add permanent tests that protect kupua during any future change — these sessions
and beyond.

**Duration:** ~2–3 hours
**Risk:** None — zero changes to `src/`
**Depends on:** Nothing

### What the agent needs to know

The agent needs to understand:

- kupua has two test frameworks: **Vitest** (unit/integration, `npm test`, ~5 sec) and
  **Playwright** (E2E, `npx playwright test`, ~70 sec against local Docker ES)
- Existing unit tests: 164 tests in `*.test.ts` files alongside source
- Existing E2E tests: 71 tests in `e2e/scrubber.spec.ts` + `e2e/buffer-corruption.spec.ts`
- `KupuaHelpers` fixture class in `e2e/helpers.ts` provides shared test utilities
- `MockDataSource` in `src/dal/mock-data-source.ts` generates synthetic images for unit tests
- `playwright.config.ts` auto-starts Vite + uses local ES on port 9220

### Deliverables

#### 1.1 — DAL contract tests (Vitest, permanent)

**File:** `src/dal/dal-contract.test.ts`

Test the `ImageDataSource` interface methods against `MockDataSource`. These tests are
trivial but they **lock the interface shape** — if anyone changes the return type of
`search()` or `count()`, these tests break immediately.

| Test | Assertion |
|---|---|
| `search()` returns hits and total | `hits` is array, `total` is number ≥ 0 |
| `search()` respects offset/length | `hits.length` ≤ requested length |
| `search()` returns sortValues | parallel array same length as hits |
| `getById(known)` returns image | returned image has matching id |
| `getById(unknown)` returns undefined | returns `undefined`, doesn't throw |
| `count()` returns number | number ≥ 0 |
| `getAggregations()` returns structure | `fields` is object, doesn't throw |

~7 tests, ~50 lines. Fast (no ES, no browser). Run with `npm test`.

#### 1.2 — Sort-around-focus viewport visibility test (Playwright, permanent)

**Addition to:** `e2e/scrubber.spec.ts`

Existing tests verify that `focusedImageId` is preserved in the store after a sort change.
This new test verifies the focused image is **actually visible in the viewport** — not
just present in the store.

Steps:
1. Navigate to search, wait for results
2. Focus an image (click or arrow key)
3. Record the focused image's ID
4. Change sort (e.g. to Credit via the sort dropdown)
5. Wait for sort-around-focus to complete (store's `sortAroundFocusStatus` becomes null)
6. Assert: the focused image's DOM element is within the viewport bounds

Uses existing `KupuaHelpers.changeSort()`, `getStoreState()`, and `page.evaluate()`.
~15–20 lines.

#### 1.3 — Visual regression baselines (Playwright, permanent)

**File:** `e2e/visual-baseline.spec.ts`

Four screenshot tests at 0.1% pixel tolerance. These catch accidental layout breaks during
any future work (not just rearchitecting).

1. Grid view — `/search?nonFree=true` (default density)
2. Table view — toggle density, screenshot
3. Image detail — double-click first image, screenshot
4. Search with query — `/search?nonFree=true&query=test&orderBy=-taken`

Each test navigates, waits for results, takes a screenshot, and compares against a committed
baseline. First run creates the baselines (committed to git). Subsequent runs compare.

~40 lines. Uses `expect(page).toHaveScreenshot()` with `maxDiffPixelRatio: 0.001`.

**Note for the agent:** The first run will always "fail" because no baselines exist yet.
Run with `--update-snapshots` once to create them, then commit the snapshot files. After
that, the tests compare against the committed baselines.

#### 1.4 — Reset-to-home from deep position (Playwright, permanent)

**Addition to:** `e2e/buffer-corruption.spec.ts`

Verify that clicking the logo from a deep scroll position resets cleanly. This is a
regression test for the buffer corruption bug that was fixed on 31 March.

Steps:
1. Navigate to search, wait for results
2. Seek to a deep position via the scrubber (e.g. 80% down)
3. Wait for seek to complete
4. Click the Grid logo
5. Assert: `bufferOffset` is 0, first visible image is near position 0, no console errors

Uses existing `KupuaHelpers.seekScrubberTo()` and `getStoreState()`. ~15 lines.

### Session 1 validation

- `npm test` passes (all existing + new DAL contract tests)
- `npx playwright test` passes (all existing + new E2E tests)
- `npm run build` succeeds
- Visual baseline snapshots are committed
- Zero changes to any file in `src/`

---

### Session 1 — Agent Prompt

Copy everything below this line and paste it as the first message to a fresh agent session.
Use **Opus** for this session.

---

````
You are working on kupua, a React frontend for Grid (the Guardian's image management
system). kupua lives at `kupua/` inside the Grid monorepo.

Read `kupua/AGENTS.md` first — it has full project context, architecture, and conventions.
Then read this task description carefully.

## Your task: Add permanent tests (Session 1 of 3)

You are adding tests only. You will NOT modify any file in `src/`. All new files go in
`src/dal/` (unit test) and `e2e/` (Playwright tests).

### Constraints
- Do not modify any existing file in `src/` (you may add new `.test.ts` files next to
  source files, and new `.spec.ts` files in `e2e/`)
- Do not install any new packages
- Do not change any logic, algorithm, or component
- After each new test file: run `npm test` to verify unit tests pass
- After all tests are written: the user will stop any running dev server on port 3000,
  then you run `npx playwright test` to verify ALL E2E tests pass (existing + new)

### Deliverable 1: DAL contract tests

Create `src/dal/dal-contract.test.ts`.

Test the `ImageDataSource` interface methods using the existing `MockDataSource`
(in `src/dal/mock-data-source.ts`). Import `MockDataSource` and exercise:

1. `search()` — returns `{hits: Image[], total: number}`, hits is an array, total ≥ 0
2. `search({offset: 5, length: 3})` — `hits.length` ≤ 3
3. `search()` — `sortValues` array has same length as `hits`
4. `getById("img-42")` — returns an Image with `id === "img-42"`
5. `getById("nonexistent-id")` — returns `undefined`
6. `count()` — returns a number ≥ 0
7. `getAggregations()` — returns `{fields: {}}` (MockDataSource returns empty aggs),
   doesn't throw

These are trivial tests but they lock the interface shape. Use `describe`/`it`/`expect`
from vitest. Keep it under 60 lines.

Run `npm test` after creating this file.

### Deliverable 2: Sort-around-focus viewport visibility test

Add a test to `e2e/scrubber.spec.ts` (the existing file — append to the appropriate
test.describe block).

The test should:
1. Navigate to search, wait for results (use `kupua.goto()`)
2. Click a grid cell to focus an image (or use arrow keys)
3. Get the focused image ID from the store (`kupua.getStoreState()` → `focusedImageId`)
4. Change sort to Credit (`kupua.changeSort("credit")` — check if this helper exists,
   if not, use the sort dropdown manually)
5. Wait for sort-around-focus to complete: poll `getStoreState()` until
   `sortAroundFocusStatus === null` (with a reasonable timeout)
6. Assert: the focused image's DOM element (find by `data-image-id` or similar attribute)
   is within the viewport — check that its `getBoundingClientRect().top` is between 0 and
   `window.innerHeight`

Look at existing tests in the file for patterns. They already do similar store-state
assertions and scrubber interactions.

### Deliverable 3: Visual regression baselines

Create `e2e/visual-baseline.spec.ts`.

Import `{ test, expect }` from `./helpers` (to get the `kupua` fixture).

Four tests:
1. "grid view baseline" — `kupua.goto()`, `await expect(page).toHaveScreenshot('grid-view.png', { maxDiffPixelRatio: 0.001 })`
2. "table view baseline" — `kupua.goto()`, toggle to table density (use `kupua.toggleDensity()` or equivalent), screenshot `'table-view.png'`
3. "image detail baseline" — `kupua.goto()`, double-click first grid cell, wait for image detail to appear, screenshot `'image-detail.png'`
4. "search with query baseline" — `kupua.gotoWithParams('query=test&orderBy=-taken')`, screenshot `'search-query.png'`

Check existing helpers for the right method names. Look at how `kupua.goto()`,
`kupua.toggleDensity()`, etc. work in `e2e/helpers.ts`.

**Important:** The first run will fail because no baseline snapshots exist. Run:
```
npx playwright test e2e/visual-baseline.spec.ts --update-snapshots
```
This creates the baseline PNGs. Then run the full suite to verify everything passes:
```
npx playwright test
```

### Deliverable 4: Reset-to-home regression test

Add a test to `e2e/buffer-corruption.spec.ts` (append to existing describe block).

The test should:
1. `kupua.goto()` — navigate and wait for results
2. Seek to ~80% position via scrubber (use existing scrubber helpers — check
   `kupua.seekScrubberTo()` or similar)
3. Wait for seek to complete (bufferOffset > 0 in store state)
4. Click the Grid logo (the `<a>` or `<Link>` with the grid-logo.svg image)
5. Wait for results to reload
6. Assert: `bufferOffset === 0` in store state
7. Assert: no console errors during the sequence

Look at the existing buffer-corruption tests for the exact pattern — they already test
logo clicks.

### Final validation

After all four deliverables:

1. Ask the user to stop any dev server on port 3000 ("I need to run the test suite —
   please stop any running dev server on port 3000 first.")
2. `npm test` — all unit tests pass
3. `npx playwright test` — all E2E tests pass
4. `npm run build` — zero errors

### Stop conditions

Stop and tell the user if:
- Any existing test breaks after your changes (you should not be changing anything that
  could break existing tests — investigate)
- The MockDataSource doesn't implement a method you need (work with what exists)
- You can't find the right helper methods in `e2e/helpers.ts` (read the full file,
  don't guess)
- Visual baseline screenshots show unexpected content (means the app isn't loading
  correctly — check if ES is running)
````

---

## Session 2: Extract Orchestration

**Goal:** Move imperative functions out of UI components into a dedicated orchestration
module. Zero logic changes — code moves between files, imports get updated.

**Duration:** ~3–4 hours
**Risk:** Low — mechanical file moves, caught by type checker + 71 E2E tests
**Depends on:** Session 1 (for the expanded test coverage)

### What the agent needs to know

The agent needs to understand the specific coupling problem:

- `SearchBar.tsx` exports `cancelSearchDebounce()` and `getCqlInputGeneration()` — these
  are imperative functions, not React components. `ImageTable.tsx` and `ImageMetadata.tsx`
  import them.
- `useScrollEffects.ts` exports `resetScrollAndFocusSearch()` — an imperative function.
  `SearchBar.tsx` and `ImageDetail.tsx` import it.
- `useUrlSearchSync.ts` exports `resetSearchSync()` — an imperative function.
  `SearchBar.tsx` and `ImageDetail.tsx` import it.
- `scroll-container-ref.ts` exports `registerScrollContainer()` and `getScrollContainer()`
  — shared module-level refs. `useScrollEffects.ts` and `Scrubber.tsx` import them.

After this session, all these imperative functions live in `lib/orchestration/search.ts`
(a new file). Components import from `lib/`, not from each other or from hooks.

### What moves where

**From `SearchBar.tsx` → `lib/orchestration/search.ts`:**
- `_debounceTimerId` (module-level `let`)
- `_externalQuery` (module-level `let`)
- `_cqlInputGeneration` (module-level `let`)
- `cancelSearchDebounce()` (exported function)
- `getCqlInputGeneration()` (exported function)

**`SearchBar.tsx` keeps:** the `SearchBar` component, `handleQueryChange` callback (which
references `_debounceTimerId` — after the move, it imports from `lib/orchestration/search.ts`),
`handleClear`, and all JSX. The `useEffect` cleanup that clears `_debounceTimerId` also
needs to import the timer reference.

**Important subtlety:** `handleQueryChange` inside `SearchBar` directly reads and writes
`_debounceTimerId` and `_externalQuery`. `cancelSearchDebounce` also writes to both.
They share the same mutable module-level state. You cannot move the functions without
moving the variables they mutate.

**Prescribed approach:** Move all three `let` variables AND both functions to
`lib/orchestration/search.ts` as a unit. Export setter functions so `SearchBar.tsx` can
still write to the state from its `handleQueryChange` callback:

```typescript
// lib/orchestration/search.ts (new file)
export let _debounceTimerId: ReturnType<typeof setTimeout> | null = null;
export function setDebounceTimer(id: ReturnType<typeof setTimeout> | null) { _debounceTimerId = id; }
export let _externalQuery: string | null = null;
export function setExternalQuery(q: string | null) { _externalQuery = q; }
export function cancelSearchDebounce(newQuery?: string) { /* existing body, verbatim */ }
export function getCqlInputGeneration() { return _cqlInputGeneration; }
```

Then `handleQueryChange` in `SearchBar.tsx` uses `setDebounceTimer()` and reads
`_externalQuery` from the import. This is mechanical — no logic change, just different
module scoping.

**From `useScrollEffects.ts` → `lib/orchestration/search.ts`:**
- `resetScrollAndFocusSearch()` (exported function, ~35 lines)
- `_virtualizerReset` (module-level `let`, written by the hook, read by
  `resetScrollAndFocusSearch`)

**Problem:** `resetScrollAndFocusSearch` calls `getScrollContainer()` (from
`scroll-container-ref.ts`), `useSearchStore.getState().abortExtends()`, and
`resetVisibleRange()` (from `useDataWindow.ts`). It also reads `_virtualizerReset`
which is **written by the hook's useEffect** (`_virtualizerReset = () => virtualizer.scrollToOffset(0)`).

This means `_virtualizerReset` is a module-level variable written by React lifecycle
code. Moving it to the orchestration module requires the hook to import and write to
the orchestration module's state. This works (module-level `let` is shared), but it's
a cross-module mutable ref pattern.

**Simplest correct approach:** Move `resetScrollAndFocusSearch` to the orchestration
module. Keep `_virtualizerReset` as a module-level `let` in the orchestration module.
Export a `registerVirtualizerReset(fn)` function. The hook calls `registerVirtualizerReset`
on mount instead of writing directly to a local `let`. `resetScrollAndFocusSearch` reads
it from the same module.

**From `useUrlSearchSync.ts` → `lib/orchestration/search.ts`:**
- `resetSearchSync()` (exported function)
- `_prevParamsSerialized` (module-level `let`)
- `_prevSearchOnly` (module-level `let`)

**Problem:** `useUrlSearchSync` hook's `useEffect` writes to `_prevParamsSerialized` and
`_prevSearchOnly` on every sync cycle. `resetSearchSync` clears them. If the variables
move to the orchestration module, the hook needs to import and write to them.

Same pattern: export `_prevParamsSerialized` and `_prevSearchOnly` (or setter functions),
import them in the hook.

**`scroll-container-ref.ts` stays in `lib/`.** It's already clean (no component imports)
and is consumed by `Scrubber.tsx`, which shouldn't import from orchestration.

**Also create: `lib/reset-to-home.ts`**

Extract the duplicated reset sequence from `SearchBar.tsx` (line 128–138) and
`ImageDetail.tsx` (line 401–407):

```typescript
import { resetSearchSync } from "@/lib/orchestration/search";
import { resetScrollAndFocusSearch } from "@/lib/orchestration/search";
import { useSearchStore } from "@/stores/search-store";

export function resetToHome() {
  resetSearchSync();
  resetScrollAndFocusSearch();
  const store = useSearchStore.getState();
  store.setParams({ query: undefined, offset: 0 });
  store.search();
}
```

Both call sites replace their 5 lines with `resetToHome()`.

### Files modified (summary)

| File | Change |
|---|---|
| `src/lib/orchestration/search.ts` | **New** — receives moved functions + state |
| `src/lib/orchestration/README.md` | **New** — documents the pattern |
| `src/lib/reset-to-home.ts` | **New** — deduplicates reset sequence |
| `src/components/SearchBar.tsx` | Remove 3 `let` vars + 2 exported functions. Import from orchestration. Replace reset sequence with `resetToHome()`. |
| `src/components/ImageTable.tsx` | Change import: `cancelSearchDebounce` from `@/lib/orchestration/search` instead of `./SearchBar` |
| `src/components/ImageMetadata.tsx` | Same import change |
| `src/components/ImageDetail.tsx` | Change imports of `resetSearchSync` and `resetScrollAndFocusSearch`. Replace reset sequence with `resetToHome()`. |
| `src/hooks/useScrollEffects.ts` | Remove `resetScrollAndFocusSearch` + `_virtualizerReset`. Import `registerVirtualizerReset` from orchestration. |
| `src/hooks/useUrlSearchSync.ts` | Remove `resetSearchSync` + `_prevParamsSerialized` + `_prevSearchOnly`. Import from orchestration. |

### Session 2 validation

- `npm test` passes after each file modification
- `npx playwright test` passes (all ~71 E2E + Session 1's new tests)
- `npm run build` succeeds
- `grep -r "from.*SearchBar" src/components/ | grep -v SearchBar.tsx` shows zero results
  (no component imports `cancelSearchDebounce` from `SearchBar` anymore)
- `SearchBar.tsx` has zero export statements other than `export function SearchBar`

---

### Session 2 — Agent Prompt

Copy everything below this line and paste it as the first message to a fresh agent session.
Use **Opus** for this session.

---

````
You are working on kupua, a React frontend for Grid (the Guardian's image management
system). kupua lives at `kupua/` inside the Grid monorepo.

Read `kupua/AGENTS.md` first — it has full project context, architecture, and conventions.
Then read `kupua/exploration/docs/03 Ce n'est pas une pipe dream/kupua-05-realistic-work-plan.md` — Session 2 section
has the full rationale and file-level plan.

## Your task: Extract imperative orchestration (Session 2 of 3)

Move imperative functions out of UI components and hooks into a new orchestration module.
This is purely mechanical — code moves between files, imports get updated. **No function
body is modified. No algorithm changes. No timing changes.**

### Constraints
- No logic changes — function bodies are copied verbatim
- No new React hooks, effects, or store subscriptions
- After EACH individual file change (not just at the end): run `npm test`
- If `npm test` fails, fix the issue before moving to the next file
- Do not modify `src/stores/search-store.ts` (the store is sacred)
- Do not install any new packages

### Step-by-step plan

Read these files first to understand the current coupling:
- `src/components/SearchBar.tsx` — exports `cancelSearchDebounce`, `getCqlInputGeneration`
- `src/hooks/useScrollEffects.ts` — exports `resetScrollAndFocusSearch`
- `src/hooks/useUrlSearchSync.ts` — exports `resetSearchSync`
- `src/lib/scroll-container-ref.ts` — exports `registerScrollContainer`, `getScrollContainer`
- `src/components/ImageTable.tsx` — imports `cancelSearchDebounce` from `./SearchBar`
- `src/components/ImageMetadata.tsx` — imports `cancelSearchDebounce` from `@/components/SearchBar`
- `src/components/ImageDetail.tsx` — imports `resetSearchSync` from useUrlSearchSync,
  `resetScrollAndFocusSearch` from useScrollEffects

Then execute in this order:

#### Step 1: Create `src/lib/orchestration/search.ts`

This new module will hold all imperative orchestration functions that are currently
scattered across components and hooks. Build it incrementally — start with the debounce
coordination from SearchBar.

Move from `SearchBar.tsx`:
- The three module-level `let` variables: `_debounceTimerId`, `_externalQuery`,
  `_cqlInputGeneration`
- The two exported functions: `cancelSearchDebounce()`, `getCqlInputGeneration()`

Since `handleQueryChange` inside the SearchBar component writes to `_debounceTimerId`
and reads `_externalQuery`, you need to also export setter/getter access. The simplest
approach: export the mutable variables directly, or export small setter functions.
Choose whichever maintains zero logic change.

Then move from `useScrollEffects.ts`:
- The `resetScrollAndFocusSearch()` function (the entire exported function, ~35 lines)
- The `_virtualizerReset` module-level variable — provide a `registerVirtualizerReset(fn)`
  function so the hook can register its callback

Then move from `useUrlSearchSync.ts`:
- `resetSearchSync()` function
- `_prevParamsSerialized` and `_prevSearchOnly` module-level variables — export them
  (or provide setter functions) so the hook can still write to them during its sync cycle

**DO NOT move `scroll-container-ref.ts`** — it's already clean and correctly placed.
`resetScrollAndFocusSearch` should import from `@/lib/scroll-container-ref` just as
the hook did.

Run `npm test` after creating this file (tests should pass — nothing consumes it yet).

#### Step 2: Update SearchBar.tsx

Remove the three `let` variables and two exported functions. Import them from
`@/lib/orchestration/search`. Update `handleQueryChange` and the `useEffect` cleanup
to use the imported state.

`SearchBar.tsx` should now export ONLY the `SearchBar` component — no imperative functions.

Run `npm test`.

#### Step 3: Update ImageTable.tsx

Change import of `cancelSearchDebounce` from `"./SearchBar"` to
`"@/lib/orchestration/search"`.

Run `npm test`.

#### Step 4: Update ImageMetadata.tsx

Change import of `cancelSearchDebounce` from `"@/components/SearchBar"` to
`"@/lib/orchestration/search"`.

Run `npm test`.

#### Step 5: Update useScrollEffects.ts

Remove `resetScrollAndFocusSearch` function and `_virtualizerReset` variable.
Import `registerVirtualizerReset` from `@/lib/orchestration/search`.
Update the hook's useEffect that sets `_virtualizerReset` to call
`registerVirtualizerReset()` instead.

Run `npm test`.

#### Step 6: Update useUrlSearchSync.ts

Remove `resetSearchSync`, `_prevParamsSerialized`, `_prevSearchOnly`.
Import from `@/lib/orchestration/search`.
Update the hook's effect that writes to `_prevParamsSerialized`/`_prevSearchOnly` to
use the imported variables (or setter functions).

Run `npm test`.

#### Step 7: Update ImageDetail.tsx

Change imports of `resetSearchSync` and `resetScrollAndFocusSearch` to import from
`@/lib/orchestration/search`.

Run `npm test`.

#### Step 8: Create `src/lib/reset-to-home.ts`

Extract the duplicated reset-to-home sequence that appears in both `SearchBar.tsx`
(in the logo onClick handler, ~lines 128–138) and `ImageDetail.tsx` (similar logo
onClick handler). The sequence is:

```typescript
resetSearchSync();
resetScrollAndFocusSearch();
const store = useSearchStore.getState();
store.setParams({ query: undefined, offset: 0 });
store.search();
```

Create a `resetToHome()` function that does this. Replace both call sites with
`resetToHome()`.

Run `npm test`.

#### Step 9: Create `src/lib/orchestration/README.md`

Brief documentation (10–20 lines):
- What the orchestration directory is for
- The pattern: one file per workflow domain, holds imperative coordination functions
  that are called by multiple components
- Future files: `edit.ts`, `upload.ts`, `collection.ts`, `crop.ts` (listed but not created)
- Rule: components import from `lib/orchestration/`, never from other components for
  imperative functions

#### Step 10: Full validation

Ask the user to stop any dev server on port 3000, then run:
1. `npm test` — all unit tests pass
2. `npx playwright test` — all E2E tests pass (including Session 1's new tests)
3. `npm run build` — zero errors
4. Run: `grep -r "from.*SearchBar" src/components/ | grep -v SearchBar.tsx` — should
   return zero results (no cross-component imperative imports)
5. Verify SearchBar.tsx has no `export` keyword except on the component itself

### Stop conditions

Stop and tell the user if:
- Any existing test breaks — this means a function was moved incorrectly (wrong import
  path, missing export, changed signature). Investigate before continuing.
- You find that `handleQueryChange` or the `useEffect` cleanup in SearchBar can't
  work with the moved state — this means the move strategy needs adjustment. Explain
  the specific problem.
- `useScrollEffects.ts` has coupling to `_virtualizerReset` that you can't cleanly
  break — explain what you found.
- Any test that was added in Session 1 fails — the visual baselines should be
  identical since no rendering code changed.
````

---

## Session 3: DAL Boundary Cleanup

**Goal:** Move ES-specific code into the ES adapter directory. Extract tuning constants.
Make the boundary between "what's ES-specific" and "what's generic" visible in the
file system.

**Duration:** ~2–3 hours
**Risk:** Low — mechanical file moves + import updates
**Depends on:** Session 2 (clean import structure)

### What the agent needs to know

- `src/lib/cql.ts` (~451 lines) translates CQL query strings to Elasticsearch query DSL.
  This is ES-specific — a Grid API adapter wouldn't use it (the API accepts CQL strings
  directly). It should live in `dal/adapters/elasticsearch/`.
- `src/dal/es-adapter.ts` (~1,139 lines) contains `buildSortClause()`,
  `reverseSortClause()`, and `parseSortField()` — pure functions that build ES sort
  clauses. These should move to a dedicated `sort-builders.ts` alongside the adapter,
  separate from the HTTP/fetch code.
- `src/stores/search-store.ts` lines 45–115 contain 10 tuning constants
  (`BUFFER_CAPACITY`, `PAGE_SIZE`, etc.) that should live in `src/constants/tuning.ts`
  alongside the existing `src/constants/layout.ts`.

After this session, the `dal/adapters/elasticsearch/` directory exists and contains
the ES-specific code, making it visually obvious what would need replacing for Grid API
integration.

### What moves where

| From | What | To |
|---|---|---|
| `src/lib/cql.ts` | Entire file (CQL→ES query translator) | `src/dal/adapters/elasticsearch/cql.ts` |
| `src/lib/cql-query-edit.ts` | Entire file (CQL AST manipulation) | `src/dal/adapters/elasticsearch/cql-query-edit.ts` |
| `src/lib/cql-query-edit.test.ts` | Entire file | `src/dal/adapters/elasticsearch/cql-query-edit.test.ts` |
| `src/dal/es-adapter.ts` | `buildSortClause()`, `reverseSortClause()`, `parseSortField()` + sort aliases map | `src/dal/adapters/elasticsearch/sort-builders.ts` |
| `src/dal/es-adapter.test.ts` | Entire file (tests for sort builders) | `src/dal/adapters/elasticsearch/sort-builders.test.ts` |
| `src/stores/search-store.ts` lines 45–115 | 10 tuning constants | `src/constants/tuning.ts` |

### Files modified

| File | Change |
|---|---|
| `src/dal/adapters/elasticsearch/cql.ts` | **New** — moved from `lib/cql.ts` |
| `src/dal/adapters/elasticsearch/cql-query-edit.ts` | **New** — moved from `lib/` |
| `src/dal/adapters/elasticsearch/cql-query-edit.test.ts` | **New** — moved from `lib/` |
| `src/dal/adapters/elasticsearch/sort-builders.ts` | **New** — extracted from `es-adapter.ts` |
| `src/dal/adapters/elasticsearch/sort-builders.test.ts` | **New** — moved from `dal/` |
| `src/constants/tuning.ts` | **New** — tuning knobs with JSDoc |
| `src/dal/es-adapter.ts` | Remove sort builder functions. Import from `./adapters/elasticsearch/sort-builders` |
| `src/dal/index.ts` | Update barrel to re-export sort builders from new location |
| `src/stores/search-store.ts` | Replace inline constants with imports from `@/constants/tuning` |
| `src/lib/cql.ts` | **Deleted** (moved) |
| Various files importing cql.ts | Update import paths |

### Session 3 validation

- `npm test` passes
- `npx playwright test` passes
- `npm run build` succeeds
- `src/dal/adapters/elasticsearch/` directory exists with `cql.ts`, `sort-builders.ts`,
  and their test files
- `src/constants/tuning.ts` exists with all 10 constants
- `src/stores/search-store.ts` no longer contains any `const` declarations for buffer/
  aggregation tuning — they're all imported

---

### Session 3 — Agent Prompt

Copy everything below this line and paste it as the first message to a fresh agent session.
Use **Opus** for this session.

---

````
You are working on kupua, a React frontend for Grid (the Guardian's image management
system). kupua lives at `kupua/` inside the Grid monorepo.

Read `kupua/AGENTS.md` first — it has full project context, architecture, and conventions.
Then read `kupua/exploration/docs/03 Ce n'est pas une pipe dream/kupua-05-realistic-work-plan.md` — Session 3 section
has the full rationale and file-level plan.

## Your task: DAL boundary cleanup (Session 3 of 3)

Move ES-specific code into a dedicated ES adapter directory. Extract tuning constants.
**No function body is modified. No algorithm changes.**

### Constraints
- No logic changes — code moves between files verbatim
- After EACH individual move: run `npm test`
- Do not install any new packages
- Functions that move keep their exact signatures and bodies

### Read first

Before making any changes, read these files:
- `src/lib/cql.ts` — CQL→ES query translator (~451 lines)
- `src/lib/cql-query-edit.ts` — CQL AST manipulation helpers
- `src/lib/cql-query-edit.test.ts` — tests for the above
- `src/dal/es-adapter.ts` — look at `buildSortClause`, `reverseSortClause`,
  `parseSortField` (these are the functions that will move to sort-builders.ts)
- `src/dal/es-adapter.test.ts` — tests for sort builders
- `src/dal/index.ts` — barrel exports (needs updating after moves)
- `src/stores/search-store.ts` lines 1–120 — tuning constants
- `src/constants/layout.ts` — existing constants file (for pattern reference)

Also check all consumers by searching for imports:
- `grep -r "from.*cql" src/` — find all cql.ts consumers
- `grep -r "buildSortClause\|reverseSortClause\|parseSortField" src/` — find all
  sort-builder consumers

### Step-by-step plan

#### Step 1: Create `src/dal/adapters/elasticsearch/` directory

Create the directory. This will hold ES-specific code.

#### Step 2: Move CQL files

Move `src/lib/cql.ts` → `src/dal/adapters/elasticsearch/cql.ts`.
Move `src/lib/cql-query-edit.ts` → `src/dal/adapters/elasticsearch/cql-query-edit.ts`.
Move `src/lib/cql-query-edit.test.ts` → `src/dal/adapters/elasticsearch/cql-query-edit.test.ts`.

Update ALL import paths that reference the old locations. Check:
- `src/dal/es-adapter.ts` imports `parseCql` from `@/lib/cql`
- `src/components/CqlSearchInput.tsx` may import from `cql-query-edit`
- `src/lib/typeahead-fields.ts` may import from `cql`
- Any other file — search thoroughly

Run `npm test` after updating all imports.

#### Step 3: Extract sort builders

From `src/dal/es-adapter.ts`, extract these functions to a new file
`src/dal/adapters/elasticsearch/sort-builders.ts`:
- `buildSortClause()` (and the `aliases` map it uses)
- `reverseSortClause()`
- `parseSortField()`

Keep the functions' bodies identical. The new file imports what it needs (e.g.
`gridConfig` from `@/lib/grid-config`).

Update `src/dal/es-adapter.ts` to import these functions from the new location.
Update `src/dal/index.ts` barrel to re-export from the new location.

Move `src/dal/es-adapter.test.ts` → `src/dal/adapters/elasticsearch/sort-builders.test.ts`
and update its imports.

Run `npm test`.

#### Step 4: Extract tuning constants

Create `src/constants/tuning.ts`.

Move these constants from `src/stores/search-store.ts` (approximately lines 45–115):
- `BUFFER_CAPACITY`
- `PAGE_SIZE`
- `SCROLL_MODE_THRESHOLD`
- `MAX_RESULT_WINDOW`
- `DEEP_SEEK_THRESHOLD`
- `NEW_IMAGES_POLL_INTERVAL`
- `AGG_DEBOUNCE_MS`
- `AGG_CIRCUIT_BREAKER_MS`
- `AGG_DEFAULT_SIZE`
- `AGG_EXPANDED_SIZE`

Keep the `import.meta.env` reads for the env-configurable ones. Add JSDoc comments
explaining what each constant does (copy from the existing comments in search-store.ts).

Update `src/stores/search-store.ts` to import these constants instead of defining them
inline. This is the ONLY change to search-store.ts — import statements at the top,
remove the constant declarations. No other changes.

Also check if `AGG_FIELDS` (derived from `FIELD_REGISTRY` + `AGG_DEFAULT_SIZE`) should
move. If it's only used in search-store.ts, leave it there (it depends on both
`FIELD_REGISTRY` and `AGG_DEFAULT_SIZE` — moving it would create awkward cross-imports).

Run `npm test`.

#### Step 5: Full validation

Ask the user to stop any dev server on port 3000, then run:
1. `npm test` — all unit tests pass
2. `npx playwright test` — all E2E tests pass
3. `npm run build` — zero errors
4. Verify `src/dal/adapters/elasticsearch/` contains `cql.ts`, `cql-query-edit.ts`,
   `sort-builders.ts`, and their test files
5. Verify `src/constants/tuning.ts` exists
6. Verify `src/lib/cql.ts` no longer exists (moved)
7. Verify `src/stores/search-store.ts` has no `const BUFFER_CAPACITY`, `const PAGE_SIZE`
   etc. — they're imported

### Stop conditions

Stop and tell the user if:
- Moving `cql.ts` breaks circular imports (check if `es-adapter.ts` and `cql.ts` have
  mutual dependencies — if so, you need to resolve them)
- Sort builder extraction breaks because the functions depend on private state in
  `es-adapter.ts` (they shouldn't — they're pure functions — but verify)
- Tuning constant extraction causes search-store tests to fail (means the constants
  are used in test setup that needs updating)
- Any Session 1 visual baseline test fails (means rendering changed — investigate)
````

---

## What's Next — The Bridge to Grid

These three sessions clean up kupua's internal structure. They do not connect kupua to
Grid's media-api. That's a much larger project that requires:

### Questions that need answering first

1. **What can media-api already do?** Grid's `media-api` exposes a HATEOAS REST API. Some
   of kupua's ES queries map directly to existing endpoints (search, getById, aggregations).
   Others don't (`search_after`, `countBefore`, percentile estimation, composite aggregation
   for keyword distribution). Mapping this requires reading the media-api source code.

2. **What's the performance cost?** Kupua's direct ES access is fast (~20-70ms seeks,
   ~10ms searches). Media-api adds HTTP overhead, auth, and potentially different query
   patterns. Some features may degrade enough to need UI redesign (e.g., the scrubber's
   real-time tooltip during drag relies on zero-network binary search over a pre-fetched
   distribution).

3. **What new API endpoints would kupua need?** This is the "plea" — the list of features
   kupua demonstrates that media-api can't support today. Getting this list precise and
   costed is the most valuable output for the engineering team conversation.

4. **Can kupua run dual-path?** Keep ES for reads (fast, supports all current features),
   add media-api for writes (metadata editing, crops, leases). This is the architecture
   04 proposes. It's pragmatic but means kupua still needs an ES connection.

### How this helps the conversation with engineers

After these three sessions, you can show engineers:

- **A working prototype** — demo kupua against TEST with 9M images. Lead with the UX.
- **A clean separation** — "everything ES-specific is in `dal/adapters/elasticsearch/`.
  Here's what a `dal/adapters/grid-api/` adapter would need to implement."
- **A concrete ask** — "kupua uses these 15 `ImageDataSource` methods. 4 of them map
  to existing media-api endpoints. The other 11 are ES-specific. Here's what media-api
  would need to support for kupua to work through it."

That's a much more productive conversation than "here's a prototype, what do you think?"

---

## Habitual Testing — Directive Addition

After completing these sessions, add this to the agent directives
(`.github/copilot-instructions.md` and the human copy):

```
**Directive: Habitual testing.** After any code change to `src/`:
- Run `npm test` (unit + integration, ~5 seconds). This is non-negotiable.
- After changing component structure, hooks, store subscriptions, or anything
  that affects rendering: run `npx playwright test` (E2E, ~70 seconds). Ask
  the user to stop any running dev server on port 3000 first.
- Never run perf tests (`run-audit.mjs`) or smoke tests (`run-smoke.mjs`)
  habitually — those are manual, purpose-driven.
```

---

## Appendix: Test Types Explained

For reference — the three kinds of tests in kupua and when to use each.

### Unit tests (Vitest, `npm test`)

**Speed:** ~5 seconds for all ~164 tests.
**What they test:** Pure functions in isolation. "Does `buildSortClause('-credit')`
produce the right ES sort clause?" No browser, no network, no DOM.
**When they break:** You changed a function's logic or its return type.
**When to run:** After every code change. Always. No exceptions.

### Integration tests (also Vitest, also `npm test`)

**Speed:** Included in the same ~5 seconds.
**What they test:** The store state machine with a mock data source. "Does seek →
extend → evict maintain imagePositions consistency?" Uses `MockDataSource` — no real
ES, no browser.
**When they break:** You changed how the store orchestrates async operations, how
cursors are managed, or how eviction works.
**When to run:** Same as unit tests — they're in the same test runner.

### E2E tests (Playwright, `npx playwright test`)

**Speed:** ~70 seconds. Starts a real browser (Chromium), a real Vite dev server,
and hits real local Elasticsearch with 10k sample documents.
**What they test:** Everything together. "Does the focused image actually stay visible
after a density switch?" "Does clicking the logo from a deep position reset cleanly?"
**When they break:** Layout changed, a component doesn't mount, an import is wrong,
scroll position isn't restored, the scrubber lands at the wrong place.
**When to run:** After any change that touches components, hooks, styles, or store
integration. Not needed after pure-function changes that unit tests already cover.

### Perf tests (`e2e-perf/run-audit.mjs`) — MANUAL ONLY

**Speed:** ~2-3 minutes.
**What they test:** Rendering performance — frame times, DOM churn, jank metrics.
**When to run:** Before and after changes expected to affect rendering performance.
Never habitually. The agent must never run these without the user asking.

### Smoke tests (`scripts/run-smoke.mjs`) — MANUAL ONLY

**Speed:** Varies.
**What they test:** Real-world behaviour against TEST cluster (~1.3M docs).
**When to run:** Only when the human developer decides to validate against real data.
The agent must NEVER run these directly.









