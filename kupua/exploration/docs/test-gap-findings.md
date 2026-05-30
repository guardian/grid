# Test Coverage Gap Findings

> Generated: 2026-05-30
> Scope: Tier 1 orchestration/hook files with no Vitest coverage

---

## Section 0: Premises

**Two-tier strategy (Vitest + Playwright) is sound.** Pure functions and module-level
state machines suit Vitest. React hooks with DOM/router dependencies do not — E2E
covers them. The gap is in the pure-logic layer *below* the hooks.

**E2E cannot catch two things well:**
1. Module-level flag lifecycle in `orchestration/search.ts`. E2E detects consequences
   but cannot isolate the flag as the cause. A real flag-consumption bug was already
   shipped (changelog.md ~line 3351).
2. Binary search off-by-one in `sort-context.ts`. Wrong tooltip date is silent; E2E
   asserts visual rendering, not integer math.

**Files excluded from unit-test proposals:**
- `useScrollEffects.ts` — React hook; 10 DOM-dependent effects. E2E (`scrubber.spec.ts`,
  tier-matrix) is the right surface. Exported pure helpers are too trivial.
- `useUrlSearchSync.ts` — TanStack Router hook. `isSortOnly` already covered by
  `src/lib/orchestration/sort-only.test.ts`. Focus-preservation branching requires full
  route/store context. E2E covers observable outcomes.

---

## Section 1: Tier 1 Analysis

### `src/lib/orchestration/search.ts`

**Contract source:** `04-browser-history-architecture.md §Popstate detection — user-initiated flag`

**Key invariants:**
- `consumeUserInitiatedFlag()` is read-and-clear. Second call without `mark` → `false`.
  Real bug: flag consumed by dedup-bail no-op effect before real consumer fires
  (changelog.md ~line 3351).
- `cancelSearchDebounce()` must clear timer AND bump `_cqlInputGeneration`. Bump forces
  CqlSearchInput remount — prevents stale ProseMirror ghost chips.
- `getThumbResetGeneration()` increments monotonically on every `resetScrollAndFocusSearch()`.

**Proposed tests:**
1. `markUserInitiatedNavigation()` then `consumeUserInitiatedFlag()` → `true`; second call
   without re-mark → `false`. (invariant, read-and-clear) — `04-browser-history.md §Popstate detection`, `search.ts:~260,~268`
2. Without any `mark`, two consecutive `consumeUserInitiatedFlag()` → both `false`. (adversarial) —
   `search.ts:~268`
3. `setDebounceTimer(id)` then `cancelSearchDebounce("q")` → `_debounceTimerId` is null,
   `_externalQuery === "q"`. (invariant) — `search.ts:~48`
4. `getCqlInputGeneration()` === N; after `cancelSearchDebounce()` → N+1. (invariant) —
   `search.ts:~60`
5. `getThumbResetGeneration()` === N; after `resetScrollAndFocusSearch()` (mock
   `getScrollContainer()` → null) → N+1. (invariant) — `04-browser-history.md §Scroll-reset`, `search.ts:~200`

**Property-based candidate?** No — stateful module; test order matters.

**Mutation targets:** `_isUserInitiatedNavigation = false` removed (test 1 second call
breaks); `_cqlInputGeneration++` removed (test 4 breaks).

---

### `src/lib/sort-context.ts`

**Contract source:** `scrubber-ticks-and-labels.md §Coordinate System`, `§Null Zone`

**Key invariants:**
- `lookupSortDistribution` returns `null` for `position >= coveredCount` (null-zone boundary,
  not the last covered bucket).
- At exact bucket boundary `position === buckets[k+1].startPosition`, returns
  `buckets[k+1].key` not `buckets[k].key`.
- `resolvePrimarySortKey` strips leading `-` and takes only the first field of a
  comma-separated `orderBy`.
- `interpolateSortLabel` returns `null` (no throw) for empty results or `total <= 0`.

**Proposed tests:**
1. Distribution `[{startPosition:0,key:"A"},{startPosition:5,key:"B"},{startPosition:10,key:"C"}]`,
   `coveredCount=15`. `lookupSortDistribution(dist, 5)` → `"B"` (exact boundary → new bucket).
   (boundary) — `scrubber-ticks-and-labels.md §Coordinate System`, `sort-context.ts:~365`
2. Same dist. `lookupSortDistribution(dist, 15)` → `null`; `(dist, 14)` → `"C"`.
   (boundary, null-zone) — `scrubber-ticks-and-labels.md §Null Zone`, `sort-context.ts:~367`
3. `resolvePrimarySortKey("-uploadTime,taken")` → `"uploadTime"`;
   `resolvePrimarySortKey(undefined)` → `"uploadTime"` (default). (invariant) —
   `scrubber-ticks-and-labels.md §Tooltip`, `sort-context.ts:~125`
4. Image with `metadata.dateTaken = undefined`,
   `interpolateSortLabel("-taken",0,100,0,[image])` → `null`, no throw. (adversarial) —
   `scrubber-ticks-and-labels.md §Sort label resolution`, `sort-context.ts:~430`
5. `resolveDateSortInfo("unknownField")` → `null`;
   `resolveKeywordSortInfo("unknownField")` → `null`. (adversarial) — `sort-context.ts:~310,~330`

**Property-based candidate?** Yes for `lookupSortDistribution`: random bucket arrays + all
valid positions. Verifies the `<=` boundary invariant at every bucket edge simultaneously.
The property subsumes tests 1–2 and all intermediate boundaries. Implement as the primary
test; keep tests 3–5 as enumerated cases (not covered by the property).

**Mutation targets:** `<=` → `<` in binary search midpoint check (property breaks); `>=` → `>`
in null-zone guard (property breaks — returns last bucket key instead of null at coveredCount).

---

### `src/lib/two-tier.ts`

**Contract source:** `03-scroll-architecture.md §The central invariant: twoTier`

**Key invariants:**
- Mode derived from `total`, NOT from `positionMap !== null`. Late coordinate-space flip
  deadlocks the viewport on skeletons.
- `POSITION_MAP_THRESHOLD === 0` disables two-tier entirely regardless of `total`.
- Exactly at `SCROLL_MODE_THRESHOLD` → scroll mode (false). Exactly at
  `POSITION_MAP_THRESHOLD` → two-tier (true).

**Proposed test:** One fast-check property that subsumes all boundary cases:

```
For all total ∈ [0, POSITION_MAP_THRESHOLD + 100]:
  isTwoTierFromTotal(total) === (POSITION_MAP_THRESHOLD > 0
    && total > SCROLL_MODE_THRESHOLD
    && total <= POSITION_MAP_THRESHOLD)
```

This single property catches `>` → `>=`, `<=` → `<`, and missing threshold-zero guard
simultaneously. No enumerated boundary tests needed — the property covers them all.

**Mutation targets:** Both comparison operators (~line 11); `POSITION_MAP_THRESHOLD > 0`
guard removal. Stryker completes in <1s on this file.

---

### `src/lib/dispatchClickEffects.ts`

**Contract source:** `05-selections.md §2 Selection Mode — modal but not load-bearing`

**Prerequisite refactor:** `getEffectiveFocusMode()` is currently imported as a module-level
dependency. Inject it as a parameter instead (2-line change: add param with default, callers
unchanged). This makes the function pure and eliminates the `vi.mock` requirement — tests
become trivial and refactor-proof.

**Key invariants (post-refactor):**
- In **phantom mode**, `open-detail` must call `enterDetail(id)`. In **explicit mode**,
  `open-detail` is a no-op. `interpretClick.test.ts` tests production of effects but
  does NOT test execution through this mode gate.
- `add-range` with absent `handleRange` must silently no-op.
- Effect dispatch order within a single call is preserved.

**Proposed tests:**
1. `focusMode = "phantom"`, dispatch `[{op:"open-detail",id:"x"}]` →
   `ctx.enterDetail("x")` called. (invariant) — `05-selections.md §2`, `dispatchClickEffects.ts:~54`
2. `focusMode = "explicit"`, same dispatch → `ctx.enterDetail` NOT called. (invariant) —
   `05-selections.md §2`, `dispatchClickEffects.ts:~54`
3. `ctx.handleRange` absent, dispatch `[{op:"add-range",...}]` → no throw. (adversarial) —
   `05-selections.md §3`, `dispatchClickEffects.ts:~59`
4. Dispatch `[{op:"set-anchor",id:"a"},{op:"toggle",id:"a"}]` → `setAnchor` spy called
   before `toggle` spy. (invariant) — `05-selections.md §3 Cohesion rules`, `dispatchClickEffects.ts:~42,~48`

**Mutation targets:** `=== "phantom"` → `=== "explicit"` (tests 1 and 2 both break);
`ctx.handleRange?.(effect)` → `ctx.handleRange(effect)` (test 3 breaks with TypeError).

---

### `src/lib/reset-to-home.ts`

**Contract source:** `04-browser-history-architecture.md §History entry rules (logo row)`,
`05-selections.md §4 Survival matrix`

**Key invariants:**
- `selection.clear()` must be called before `navigate()` (survival matrix: Home → NO).
- `setFocusedImageId(null)` + `clearDensityFocusRatio()` before `navigate()` — prevents
  table-unmount density-focus save redirecting grid mount to wrong scroll position.
- If `store.search()` throws, `navigate()` still fires (graceful degradation).

**Proposed tests:**
1. Active selection + `bufferOffset > 0`: after `resetToHome(navigate)`, `selection.clear()`
   was called and `focusedImageId === null`. (invariant) — `05-selections.md §4`,
   `reset-to-home.ts:~85,~90`
2. `store.search()` rejects → `navigate()` still called exactly once. (adversarial) —
   `reset-to-home.ts:~130`
3. URL `density=table` → `resetScrollAndFocusSearch({skipEagerScroll:true})`. URL without
   density param → `{skipEagerScroll:false}`. (boundary) —
   `04-browser-history.md §resetScrollAndFocusSearch`, `reset-to-home.ts:~116`

**Omitted:** Ordering assertion (`setPrevParamsSerialized` before `search()` resolves).
This tests implementation sequence rather than observable outcome. The bug it guards
(changelog.md ~line 1542) manifests as a visible stale-buffer flash, already caught by
E2E. Testing call ordering produces brittle mocks that resist correct refactoring.

**Property-based candidate?** No — sequential async side-effects.

**Mutation targets:** catch block re-throws (test 2 breaks); `selection.clear()` removed
(test 1 breaks).

---

## Section 2: Tier 2 Analysis

Not reached — five Tier 1 files provide 18 concrete test cases + 2 fast-check properties.
Tier 2 would exceed useful signal.

---

## Section 3: Recommendations

**Implementation order:**

| # | File | Effort | Rationale |
|---|------|--------|-----------|
| 1 | `orchestration/search.ts` | S | Proven bug class; zero DOM deps; 5 tests, 30 min |
| 2 | `sort-context.ts` | M | fast-check property for binary search + 3 enumerated; needs `fast-check` install |
| 3 | `two-tier.ts` | S | One fast-check property (~8 lines); subsumes all boundaries |
| 4 | `dispatchClickEffects.ts` | S | 2-line refactor (inject mode param) → 4 pure-function tests, no mocks |
| 5 | `reset-to-home.ts` | M | Store mocking needed; 3 outcome-based tests |

**Batch grouping:**
- **Batch A (no refactor, no new deps):** #1 (`orchestration/search.ts`) — can ship standalone.
- **Batch B (fast-check dependency):** #2 + #3 together — install `fast-check`, write both property tests + sort-context enumerated cases in one session.
- **Batch C (requires refactor):** #4 (`dispatchClickEffects`) — refactor first, then tests.
- **Batch D (store mocking):** #5 (`reset-to-home`) — heavier setup, lowest priority.

**Where fast-check adds most value:**
- `lookupSortDistribution` — random distributions + all positions; covers O(log n) binary
  search at every bucket edge simultaneously. Best single property test in the codebase.
- `isTwoTierFromTotal` — exhaustive boundary sweep in 8 lines; trivial but catches all
  comparison-operator mutations.

**Where mutation testing validates test quality:**
- `lookupSortDistribution` (~line 376): `<=`/`<` and `>`/`>=` mutations.
- `consumeUserInitiatedFlag` (~line 268): the `= false` clear — single-char, silent regression.
- `isTwoTierFromTotal` (~line 11): both comparison operators; Stryker completes in <1s.

**Total:** 18 tests + 2 property-based tests. One 2-line refactor. One new dev dependency
(`fast-check`).

---

## Appendix: Off-Topic Observations

1. `sort-context.ts` null-zone boundary tick was a past bug (changelog.md ~line 1998);
   `computeTrackTicksWithNullZone` boundary-tick presence and colour would prevent recurrence.
2. `dispatchClickEffects.ts` injects `getEffectiveFocusMode()` via module import; injecting
   as a parameter would make it pure and remove the `vi.mock` requirement. (Prerequisite
   for batch C — do this refactor first.)
3. `reset-to-home.ts` reads `window.location.href` directly for density detection;
   a parameter would make that branch testable without jsdom.
4. `orchestration/search.ts` exports `_prevParamsSerialized` as a mutable module-level var;
   callers can corrupt dedup state without using the setter.
5. `registerVirtualizerReset(null)` on unmount untested — stale callback from
   re-registration would crash the next call silently.

---
---

## Appendix B: Execution Prompts

### Batch A — `orchestration/search.ts` (no deps, no refactor)

```
TASK: Write unit tests for kupua/src/lib/orchestration/search.ts

OUTPUT: kupua/src/lib/orchestration/search.test.ts (new file, co-located)

CONVENTIONS (match existing codebase style):
- import { describe, it, expect, beforeEach } from "vitest"
- describe/it nesting. it() blocks, not test().
- Assertions via expect(...).toBe() / .toEqual()
- Path alias: @/ → kupua/src/

WHAT TO TEST (from test-gap-findings.md §1, orchestration/search.ts):

1. markUserInitiatedNavigation() then consumeUserInitiatedFlag() → true;
   second consumeUserInitiatedFlag() without re-mark → false.
2. Without any mark(), two consecutive consumeUserInitiatedFlag() → both false.
3. setDebounceTimer(id) then cancelSearchDebounce("q") → _debounceTimerId is null,
   _externalQuery === "q".
4. getCqlInputGeneration() === N; after cancelSearchDebounce() → N+1.
5. getThumbResetGeneration() === N; after resetScrollAndFocusSearch() → N+1.
   Mock getScrollContainer() → null (vi.mock("@/lib/scroll-container-ref")).

MODULE ISOLATION: orchestration/search.ts has module-level state (_isUserInitiatedNavigation,
_cqlInputGeneration, _thumbResetGeneration, _debounceTimerId, _externalQuery). Each describe
block must reset this state. The module uses:
- getScrollContainer() from @/lib/scroll-container-ref — mock to return null
- useSearchStore from @/stores/search-store — mock .getState().abortExtends as vi.fn()
- resetVisibleRange from @/hooks/useDataWindow — mock as vi.fn()
- document.querySelector — runs in jsdom (vitest default), returns null naturally
- isMobile() from @/lib/is-mobile — mock to return false
- window.location.href — jsdom provides this

For state reset between tests: re-import or use vitest's module reset. Simplest: call
consumeUserInitiatedFlag() in beforeEach to drain the flag, and read generation counters
to establish baseline (N = getCqlInputGeneration(), then assert N+1 after action).

PROCEDURE:
1. Write the test file.
2. Run: npm --prefix kupua test -- src/lib/orchestration/search.test.ts
   Tee output to "$TMPDIR/kupua-test-output.txt"
3. All 5 tests must pass. If any fail, diagnose whether the test or your
   understanding of the module is wrong. Read the source to confirm. Fix the test.
4. Run full suite: npm --prefix kupua test
   Tee output to "$TMPDIR/kupua-test-output.txt"
   Confirm no regressions (existing 871+ tests still pass).
5. Done when: new file exists, 5 tests green, full suite green.

DO NOT: modify source code, add dependencies, touch any file outside kupua/.
```

---

### Batch B — `sort-context.ts` + `two-tier.ts` (fast-check dependency)

```
TASK: Install fast-check and write property-based + enumerated tests for two files.

STEP 1 — Install fast-check:
  Run: npm --prefix kupua install -D fast-check
  Confirm it appears in kupua/package.json devDependencies.

STEP 2 — Write kupua/src/lib/two-tier.test.ts (new file, co-located):

  CONVENTIONS: same as Batch A (describe/it/expect from vitest).
  Additional import: import * as fc from "fast-check"

  ONE TEST ONLY — a fast-check property:

    import { SCROLL_MODE_THRESHOLD, POSITION_MAP_THRESHOLD } from "@/constants/tuning"
    import { isTwoTierFromTotal } from "./two-tier"

    describe("isTwoTierFromTotal", () => {
      it("satisfies the three-tier boundary contract for all totals", () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 0, max: POSITION_MAP_THRESHOLD + 100 }),
            (total) => {
              const expected =
                POSITION_MAP_THRESHOLD > 0 &&
                total > SCROLL_MODE_THRESHOLD &&
                total <= POSITION_MAP_THRESHOLD;
              expect(isTwoTierFromTotal(total)).toBe(expected);
            }
          )
        );
      });
    });

  This single property catches >/>=, <=/< operator mutations and threshold-zero bypass.

STEP 3 — Write kupua/src/lib/sort-context.test.ts (new file, co-located):

  Test the EXPORTED pure functions only. Read sort-context.ts to confirm exact export
  names and signatures before writing tests. The file is large (~500 lines); focus on:
  - lookupSortDistribution (binary search)
  - resolvePrimarySortKey
  - interpolateSortLabel (or whatever the null-safe label resolver is called)
  - resolveDateSortInfo / resolveKeywordSortInfo

  TESTS:
  A. fast-check property for lookupSortDistribution:
     Generate sorted bucket arrays (startPositions strictly ascending from 0, keys
     as string labels). For all positions in [0, coveredCount+5]:
       - position < coveredCount → result equals the bucket whose startPosition is
         the greatest <= position
       - position >= coveredCount → null

  B. Enumerated tests (3):
     3. resolvePrimarySortKey("-uploadTime,taken") → "uploadTime";
        resolvePrimarySortKey(undefined) → "uploadTime" (default fallback).
     4. interpolateSortLabel with missing date field → null, no throw.
     5. resolveDateSortInfo("unknownField") → null;
        resolveKeywordSortInfo("unknownField") → null.

  NOTE: Read the actual source to confirm function signatures. The findings doc uses
  approximate names. If a function doesn't exist or has a different name, find the
  equivalent and test that. State what you found.

STEP 4 — Run tests:
  npm --prefix kupua test -- src/lib/two-tier.test.ts src/lib/sort-context.test.ts
  Tee to "$TMPDIR/kupua-test-output.txt"
  All tests must pass (property tests: 100 samples default is fine).

STEP 5 — Full suite:
  npm --prefix kupua test
  Tee to "$TMPDIR/kupua-test-output.txt"
  Confirm no regressions.

STEP 6 — Done when: fast-check installed, 2 new test files, property tests + enumerated
  tests green, full suite green.

DO NOT: modify source code (only package.json via npm install), touch files outside kupua/.
```

---

### Batch C — `dispatchClickEffects.ts` (refactor + tests)

```
TASK: Make dispatchClickEffects pure-testable, then write tests.

STEP 1 — Refactor (2-line change in kupua/src/lib/dispatchClickEffects.ts):

  Current signature:
    export function dispatchClickEffects(
      effects: ClickEffect[],
      ctx: EffectDispatchContext,
    ): void {

  Change to:
    export function dispatchClickEffects(
      effects: ClickEffect[],
      ctx: EffectDispatchContext,
      focusMode: () => string = getEffectiveFocusMode,
    ): void {

  Inside the function body, replace:
    if (getEffectiveFocusMode() === "phantom") {
  With:
    if (focusMode() === "phantom") {

  This is the ENTIRE refactor. No callers change (default parameter). Verify:
  - grep for "dispatchClickEffects(" in kupua/src/ — all 4 call sites pass 2 args → default fires
  - TypeScript compiles: npm --prefix kupua run build (or just tsc -b in kupua/)

STEP 2 — Write kupua/src/lib/dispatchClickEffects.test.ts (new file, co-located):

  CONVENTIONS: same as Batch A.
  NO vi.mock needed for focus mode — inject focusMode as an arrow function.

  import { describe, it, expect, vi } from "vitest"
  import { dispatchClickEffects } from "./dispatchClickEffects"
  import type { EffectDispatchContext } from "./dispatchClickEffects"
  import type { ClickEffect } from "./interpretClick"

  function makeCtx(overrides?: Partial<EffectDispatchContext>): EffectDispatchContext {
    return {
      setFocusedImageId: vi.fn(),
      enterDetail: vi.fn(),
      handleRange: vi.fn(),
      ...overrides,
    };
  }

  TESTS:
  1. focusMode = () => "phantom", dispatch [{op:"open-detail",id:"x"}] →
     ctx.enterDetail called with "x".
  2. focusMode = () => "explicit", same dispatch → ctx.enterDetail NOT called.
  3. ctx without handleRange (pass undefined), dispatch [{op:"add-range",anchorId:"a",
     targetId:"b",anchorGlobalIndex:0,targetGlobalIndex:5,anchorSortValues:[],targetSortValues:[]}]
     → no throw.
  4. Dispatch [{op:"set-anchor",id:"a"},{op:"toggle",id:"a"}] → confirm ordering:
     read vi.fn() mock.calls to verify set-anchor's store call happened before toggle's.
     NOTE: "set-anchor" and "toggle" both call useSelectionStore.getState() — you'll need
     vi.mock("@/stores/selection-store") for these ops. Mock useSelectionStore.getState()
     to return { toggle: vi.fn(), setAnchor: vi.fn() }. Track call order via a shared array:
     setAnchor pushes "anchor", toggle pushes "toggle", assert order is ["anchor","toggle"].

STEP 3 — Run:
  npm --prefix kupua test -- src/lib/dispatchClickEffects.test.ts
  Tee to "$TMPDIR/kupua-test-output.txt"

STEP 4 — Run full suite (unit + ensures refactor didn't break anything):
  npm --prefix kupua test
  Tee to "$TMPDIR/kupua-test-output.txt"

STEP 5 — Done when: refactor applied, 4 tests green, full suite green.

IMPORTANT: The refactor MUST NOT change any observable behaviour. The default parameter
means all existing callers behave identically. If TypeScript or tests fail after the
refactor (before writing new tests), the refactor is wrong — stop and report.
```

---

### Batch D — `reset-to-home.ts` (store mocking)

```
TASK: Write unit tests for kupua/src/lib/reset-to-home.ts

OUTPUT: kupua/src/lib/reset-to-home.test.ts (new file, co-located)

PREREQUISITES: Read reset-to-home.ts fully first. It's an async function that
coordinates multiple stores. Identify:
- What it imports (search-store, selection-store, orchestration/search, etc.)
- What the function signature is (it takes a navigate callback)
- How it detects density (reads URL? reads store?)

MOCKING STRATEGY:
- vi.mock("@/stores/search-store") — mock useSearchStore.getState() to return
  { search: vi.fn().mockResolvedValue(undefined), abortExtends: vi.fn(),
    setFocusedImageId: vi.fn(), bufferOffset: 0, params: { nonFree: true } }
- vi.mock("@/stores/selection-store") — mock useSelectionStore.getState() to return
  { clear: vi.fn(), inSelectionMode: true, selected: new Set(["a"]) }
- vi.mock("@/lib/orchestration/search") — mock resetScrollAndFocusSearch, setPrevParamsSerialized
- Mock navigate as vi.fn()
- For density detection: if it reads window.location, set window.location.href
  in beforeEach. If it reads a store, mock that.

TESTS:
1. Active selection (selected.size > 0) + bufferOffset > 0: after await resetToHome(navigate),
   selection.clear() was called AND search-store's setFocusedImageId was called with null.
2. Mock search-store's search() to reject (mockRejectedValue(new Error("fail"))) →
   navigate() still called exactly once.
3. URL has density=table → resetScrollAndFocusSearch called with {skipEagerScroll:true}.
   URL without density → called with {skipEagerScroll:false} (or no opts).
   (Two sub-assertions in one test is fine; or split into 2 it() blocks.)

PROCEDURE:
1. Read reset-to-home.ts. Confirm function name, params, imports.
2. Write test file with mocks.
3. Run: npm --prefix kupua test -- src/lib/reset-to-home.test.ts
   Tee to "$TMPDIR/kupua-test-output.txt"
4. Fix failures — store mocking is fiddly; expect 1-2 iterations.
5. Full suite: npm --prefix kupua test
   Tee to "$TMPDIR/kupua-test-output.txt"
6. Done when: 3 tests green, full suite green.

DO NOT: modify reset-to-home.ts source code. These tests verify current behaviour.
If a test fails because your mock shape doesn't match reality, fix the mock — the
source is correct.
```
