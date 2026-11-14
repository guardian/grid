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
2. Integer boundary arithmetic in `sort-context.ts`. Wrong null-zone tick position or
   tooltip date is silent; E2E asserts visual rendering, not the arithmetic. Primary
   surface: `computeTrackTicksWithNullZone` — its `coveredCount` boundary and the
   offset applied to null-zone ticks also exercise the private binary search transitively.

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

**Isolation note:** all four functions under test touch ZERO external imports. The one
function that pulls in the full mock graph (`resetScrollAndFocusSearch`) is deliberately
excluded — its thumb-reset generation increment is a tautological assertion whose only
cost is the entire mock dependency tree (useSearchStore, getScrollContainer,
resetVisibleRange, isMobile).

**Tests (4, zero-mock):**
1. `markUserInitiatedNavigation()` then `consumeUserInitiatedFlag()` → `true`; second call
   without re-mark → `false`. (invariant, read-and-clear) — `search.ts:266,273`
2. Fresh module (no mark): two consecutive `consumeUserInitiatedFlag()` → both `false`. (adversarial)
3. Fake timers: `setDebounceTimer(setTimeout(…, 300))` then `cancelSearchDebounce("q")`;
   advance 500ms → callback never fires; `_externalQuery === "q"`, `_debounceTimerId === null`.
   Tests that the cancel actually stops the callback, not just a bookkeeping var. — `search.ts:46`
4. `getCqlInputGeneration()` === N; after `cancelSearchDebounce()` → N+1. — `search.ts:61`

**Property-based candidate?** No — stateful module; test order matters.

**Mutation targets:** `_isUserInitiatedNavigation = false` removed (test 1 second call
breaks); `_cqlInputGeneration++` removed (test 4 breaks).

---

### `src/lib/sort-context.ts`

**Contract source:** `scrubber-ticks-and-labels.md §Null Zone`, `§Coordinate System`

**Export surface (verified):** `computeTrackTicksWithNullZone`, `interpolateSortLabel`,
`interpolateNullZoneSortLabel`, `resolvePrimarySortKey`, `resolveDateSortInfo`,
`resolveKeywordSortInfo`, `getSortContextLabel`. `lookupSortDistribution` and
`computeTrackTicks` are **private** — cannot be imported or tested directly.

**Primary target: `computeTrackTicksWithNullZone`** (exported). Documented past
regression (null-zone boundary tick — changelog.md ~line 1998). Silent failure mode:
wrong tick position mislabels the scrubber track; E2E asserts rendering, not arithmetic.
Using keyword `orderBy` isolates this logic by making the covered-zone contribution `[]`
(`computeTrackTicks` returns `[]` for non-date sorts).

**Secondary target: `interpolateSortLabel`** — exercises `lookupSortDistribution`
transitively via the out-of-buffer distribution branch. A fast-check property here covers
the binary search at every bucket edge without needing access to the private function.

**Key invariants:**
- `computeTrackTicksWithNullZone`: `coveredCount >= total` → no null zone (returns covered
  ticks unchanged). `coveredCount === 0` → boundary tick at position 0 (top of track).
  Null-zone tick positions are offset by `coveredCount` into global space.
- `lookupSortDistribution` (tested via `interpolateSortLabel`): returns `null` for
  `position >= coveredCount`; at exact bucket boundary `position === buckets[k+1].startPosition`
  returns `buckets[k+1].key` not `buckets[k].key` (`<=` not `<`).
- `resolvePrimarySortKey` strips leading `-`, takes only the first field of comma-separated `orderBy`.

**Tests:**

*A — `computeTrackTicksWithNullZone` boundary cases (enumerated, no mocks, keyword orderBy):*
1. `coveredCount >= total` (C=10, T=10) → result is `[]`, no `boundary===true` tick.
2. `sortDist === null` → returns `[]` (keyword sort, no covered-zone ticks, no null zone).
3. `coveredCount = total - 1` (C=9, T=10), `nullZoneDist=null` → exactly one tick with
   `boundary===true` at `position === 9`. (Off-by-one surface: `coveredCount >= total`
   must exclude; `total − 1` must include.)
4. `coveredCount = 0`, `nullZoneDist=null` → boundary tick at `position === 0`.
5. Offset arithmetic: C=5, T=100, `nullZoneDist` with 2 monthly ISO-date buckets at
   `startPosition` 0 and 10 → a non-boundary tick exists at `position === 10 + 5 === 15`.

*B — fast-check property via `interpolateSortLabel` (exercises binary search):*
- Random bucket arrays (startPositions strictly increasing from 0, short string keys).
  `bufferOffset` very large → distribution branch always taken. `orderBy = "credit"`
  (keyword, no formatter, keys returned verbatim when ≤ 30 chars). For all positions in
  `[0, coveredCount + 5]`:
  - `position < coveredCount` → label equals key of last bucket where `startPosition ≤ position`.
  - `position >= coveredCount` → `null`.
  Kills `<=` → `<` and `>=` → `>` mutations in the binary search and null-zone gate.

*C — enumerated pure-function cases:*
C1. `resolvePrimarySortKey("-uploadTime,taken")` → `"uploadTime"`;
    `resolvePrimarySortKey(undefined)` → `"uploadTime"` (default).
C2. `interpolateSortLabel("-taken", 0, 100, 0, [imageWithNoDateTaken])` → `null`, no throw.
C3. `resolveDateSortInfo("unknownField")` → `null`;
    `resolveKeywordSortInfo("unknownField")` → `null`.
C4. `resolveDateSortInfo("-taken")` → `{ field: "metadata.dateTaken", direction: "desc" }`;
    `resolveKeywordSortInfo("credit")` → `{ field: "metadata.credit", direction: "asc" }`.

**Property-based candidate?** Yes — Part B (`interpolateSortLabel` / binary search).

**Mutation targets:** `>=` → `>` in `coveredCount >= total` guard (A1, A3 break);
`+ coveredCount` offset removed (A5 breaks); `<=` → `<` in binary search (B breaks);
`>= coveredCount` null-zone gate in `lookupSortDistribution` (B breaks).

---

### `src/lib/two-tier.ts` — NOT TESTED

A 14-line, 3-expression boolean function. TypeScript + one reader already provide the
confidence a property test would add. Not worth Vitest coverage or the `fast-check`
dependency on its own.

---

### `src/lib/dispatchClickEffects.ts` — DEFERRED

> Not actively pursued. The only real branch (phantom vs explicit) is already covered
> by `interpretClick.test.ts` + E2E click paths. Testing it requires a production
> refactor (inject `focusMode` as a parameter) for marginal incremental confidence.
> Analysis below kept for reference.

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

### `src/lib/reset-to-home.ts` — DEFERRED

> Not actively pursued. The only test with real teeth is #2 (graceful degradation —
> search throws but navigate still fires). Tests #1 and #3 are shallow wiring
> verification that E2E already covers. Heavy store mocking for marginal confidence.
> Analysis below kept for reference.

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

Not reached — two actively-targeted Tier 1 files (orchestration/search.ts and
sort-context.ts) provide 9 enumerated tests + 1 fast-check property. The remaining
three candidates were deferred or dropped (see Section 3). Tier 2 would exceed useful signal.

---

## Section 3: Recommendations

**Implementation order:**

| # | File | Effort | Status | Rationale |
|---|------|--------|--------|-----------|
| 1 | `orchestration/search.ts` | S | **Batch A** | Proven bug class; zero imports, zero mocks; 4 tests |
| 2 | `sort-context.ts` | M | **Batch B** | Primary: `computeTrackTicksWithNullZone` boundary cases + binary-search fast-check property via `interpolateSortLabel`; needs `fast-check` |
| 3 | `dispatchClickEffects.ts` | S | Deferred | Requires production refactor for logic already covered by `interpretClick.test.ts` + E2E |
| 4 | `reset-to-home.ts` | M | Deferred | Heavy store mocking; only the graceful-degradation test has real teeth |
| 5 | `two-tier.ts` | — | Dropped | 14-line boolean; TypeScript + one reader provide equivalent confidence |

**Batch grouping:**
- **Batch A (no refactor, no new deps, no mocks):** `orchestration/search.ts` — ships standalone.
- **Batch B (fast-check dependency):** `sort-context.ts` — install `fast-check`, write
  `computeTrackTicksWithNullZone` boundary tests (Part A), binary-search property via
  `interpolateSortLabel` (Part B), and enumerated pure-function cases (Part C).

**Where fast-check adds most value:**
- `interpolateSortLabel` (routing through the private binary search) — random distributions
  + all positions; covers the O(log n) search at every bucket edge simultaneously. Best
  single property test in the codebase.

**Where mutation testing validates test quality:**
- `computeTrackTicksWithNullZone` `coveredCount >= total` guard: `>=` → `>` mutation
  (A1 and A3 break).
- `lookupSortDistribution` (via B property): `<=` → `<` and `>=` → `>` mutations.
- `consumeUserInitiatedFlag` (~line 273): the `= false` clear — single-char, silent regression.

**Total:** 9 enumerated tests + 1 fast-check property. Zero production refactors. One new
dev dependency (`fast-check`, justified by the binary-search property alone).

---

## Appendix: Off-Topic Observations

1. `dispatchClickEffects.ts` injects `getEffectiveFocusMode()` via module import; injecting
   as a parameter would make it pure and remove the `vi.mock` requirement.
2. `reset-to-home.ts` reads `window.location.href` directly for density detection;
   a parameter would make that branch testable without jsdom.
3. `orchestration/search.ts` exports `_prevParamsSerialized` as a mutable module-level var;
   callers can corrupt dedup state without using the setter.
4. `registerVirtualizerReset(null)` on unmount untested — stale callback from
   re-registration would crash the next call silently.

---
---

## Appendix B: Execution Prompts

### Batch A — `orchestration/search.ts` (no deps, no mocks, no refactor)

```
TASK: Write unit tests for kupua/src/lib/orchestration/search.ts

OUTPUT: kupua/src/lib/orchestration/search.test.ts (new file, co-located)

CONVENTIONS (match existing codebase style):
- import { describe, it, expect, beforeEach, vi } from "vitest"
- describe/it nesting. it() blocks, not test().
- Assertions via expect(...).toBe() / .toEqual()
- Path alias: @/ → kupua/src/

KEY FACT — NO MOCKING NEEDED. The four functions under test touch ZERO external
imports. They only read/write module-level state and call clearTimeout. (The one
function that DOES pull in the mock graph — resetScrollAndFocusSearch — is
deliberately NOT tested here; see "Dropped" below.) Do not add any vi.mock calls.

ISOLATION — use vi.resetModules() + dynamic import. orchestration/search.ts has
module-level mutable state (_isUserInitiatedNavigation, _cqlInputGeneration,
_debounceTimerId, _externalQuery, ...) but NO top-level side effects, so re-importing
is cheap and gives a pristine module each test:

    let mod: typeof import("@/lib/orchestration/search");
    beforeEach(async () => {
      vi.resetModules();
      mod = await import("@/lib/orchestration/search");
    });

  Reference everything via `mod.` (mod.consumeUserInitiatedFlag(), mod._externalQuery,
  etc.). Static top-level imports would bind to a stale module instance after reset.

WHAT TO TEST (4 tests, all zero-mock):

1. User-initiated flag is read-and-clear (the real shipped-bug class).
   mod.markUserInitiatedNavigation();
   expect(mod.consumeUserInitiatedFlag()).toBe(true);
   expect(mod.consumeUserInitiatedFlag()).toBe(false);   // cleared on first read

2. Adversarial: with a fresh module (resetModules gives un-marked state), two
   consecutive consumes are both false.
   expect(mod.consumeUserInitiatedFlag()).toBe(false);
   expect(mod.consumeUserInitiatedFlag()).toBe(false);

3. cancelSearchDebounce actually cancels the timer (fake timers — assert the
   callback never fires, not just the bookkeeping var):
   vi.useFakeTimers();
   let fired = false;
   mod.setDebounceTimer(setTimeout(() => { fired = true; }, 300));
   mod.cancelSearchDebounce("q");
   vi.advanceTimersByTime(500);
   expect(fired).toBe(false);
   expect(mod._externalQuery).toBe("q");
   expect(mod._debounceTimerId).toBe(null);
   vi.useRealTimers();   // restore (or in afterEach)

4. cancelSearchDebounce bumps the CqlSearchInput generation (forces remount):
   const before = mod.getCqlInputGeneration();
   mod.cancelSearchDebounce();
   expect(mod.getCqlInputGeneration()).toBe(before + 1);

DROPPED (was test 5 in the 2026-05-30 draft): "getThumbResetGeneration() increments
after resetScrollAndFocusSearch()". Low value (asserts a counter increments) and it
was the sole reason to mock useSearchStore / getScrollContainer / resetVisibleRange /
isMobile. The thumb-reset behaviour it guards is already covered by E2E (scrubber.spec,
tier-matrix). Do not write it.

PROCEDURE:
1. Write the test file.
2. Run: npm --prefix kupua test -- src/lib/orchestration/search.test.ts
   Tee output to "$TMPDIR/kupua-test-output.txt"
3. All 4 tests must pass. If any fail, diagnose whether the test or your
   understanding of the module is wrong. Read the source to confirm. Fix the test.
4. Run full suite: npm --prefix kupua test
   Tee output to "$TMPDIR/kupua-test-output.txt"
   Confirm no regressions (existing suite still passes).
5. Done when: new file exists, 4 tests green, full suite green.

DO NOT: modify source code, add dependencies, add vi.mock, touch any file outside kupua/.
```

---

### Batch B — `sort-context.ts` (fast-check dependency; two-tier dropped)

```
TASK: Install fast-check and write property-based + enumerated tests for
      kupua/src/lib/sort-context.ts.

WHY THIS SHAPE (verified against source 2026-07-01 — read these facts, they change
the test design from the original draft):

  • lookupSortDistribution is PRIVATE (not exported). You CANNOT import it. The binary
    search is tested TRANSITIVELY through the exported interpolateSortLabel (see part B).

  • computeTrackTicks is also PRIVATE. It is tested transitively through the exported
    computeTrackTicksWithNullZone (see part A).

  • The highest-value target is computeTrackTicksWithNullZone (exported) — it has a
    documented past regression (null-zone boundary tick) and carries integer boundary
    math with a SILENT failure mode (a wrong tick position mislabels the scrubber; E2E
    asserts rendering, not the arithmetic). Make it the PRIMARY test.

  • two-tier.ts (isTwoTierFromTotal) is DROPPED. It is a 14-line, 3-expression boolean;
    TypeScript + one reader already provide that confidence, and it isn't worth a test
    or a fast-check property. Do NOT create two-tier.test.ts.

RELEVANT SIGNATURES / TYPES (confirm by reading the source before writing):
  interpolateSortLabel(orderBy?, globalPosition, total, bufferOffset, results,
                       sortDist?, visibleCount?): string | null
  computeTrackTicksWithNullZone(orderBy?, total, bufferOffset, results,
                                sortDist, nullZoneDist): TrackTick[]
  resolvePrimarySortKey(orderBy?): string | null
  resolveDateSortInfo(orderBy?) / resolveKeywordSortInfo(orderBy?):
                                { field: string; direction: "asc"|"desc" } | null
  // from @/dal/types:
  SortDistribution   = { buckets: SortDistBucket[]; coveredCount: number }
  SortDistBucket     = { key: string; count: number; startPosition: number }
  TrackTick          = { position: number; type: "minor"|"major"; label?; color?; boundary? }

NO MOCKING NEEDED — these are pure functions (deps are FIELD_REGISTRY and date-fns,
both real). Do not add vi.mock.

CONVENTIONS: describe/it/expect from vitest. import * as fc from "fast-check".
Path alias @/ → kupua/src/.

STEP 1 — Install fast-check:
  Run: npm --prefix kupua install -D fast-check
  Confirm it appears in kupua/package.json devDependencies.
  (Justified by the binary-search property in part B — the one property worth having.)

STEP 2 — Write kupua/src/lib/sort-context.test.ts (new file, co-located).

  ---- PART A (PRIMARY): computeTrackTicksWithNullZone boundary behaviour ----

  Use a KEYWORD orderBy (e.g. "credit") so the covered-zone contribution is [] —
  computeTrackTicks returns [] for non-date sorts — isolating the null-zone logic.
  Build sortDist = { buckets: [], coveredCount: C }  (buckets unused by this branch;
  only coveredCount matters). Pick total T. Assertions target the boundary tick,
  identified by `boundary === true`.

  A1. No null zone at the upper boundary: C === T (coveredCount >= total) →
      no boundary tick. e.g. C=10, T=10 → result has no tick with boundary===true
      (with keyword orderBy, result is []).
  A2. sortDist === null → returns covered ticks unchanged (no boundary tick). With
      keyword orderBy → [].
  A3. Null zone just inside the boundary: C = T-1 (0 <= C < T), nullZoneDist=null →
      exactly one boundary tick, at position === C, type "major", boundary===true.
      e.g. C=9, T=10 → the boundary tick sits at position 9. (This is the off-by-one
      surface: `coveredCount >= total` must exclude, `coveredCount === total-1` include.)
  A4. Entire set is null zone: C = 0 (0 is not < 0, and 0 < T) → boundary tick present
      at position === 0.
  A5. Offset arithmetic: C = 5, T = 100, nullZoneDist = a date distribution with >= 2
      ISO-date buckets, e.g.
        { buckets: [ {key:"2024-01-01T00:00:00.000Z", count:10, startPosition:0},
                     {key:"2024-02-01T00:00:00.000Z", count:10, startPosition:10} ],
          coveredCount: 20 }
      computeTrackTicksWithNullZone offsets null-zone ticks by coveredCount. Assert a
      non-boundary tick exists at position === 10 + 5 === 15 (second bucket start +
      coveredCount). Read computeTrackTicks (distribution/monthly branch) to confirm it
      emits a tick per bucket; assert the OFFSET (position shift by C), not exact labels.

  ---- PART B: binary-search property, via the exported interpolateSortLabel ----

  lookupSortDistribution is private, so drive it through interpolateSortLabel with a
  KEYWORD sort and an out-of-buffer position (forces the distribution branch, which
  calls lookupSortDistribution(sortDist, globalPosition)). Set bufferOffset huge so the
  local index is always negative → always out of buffer. results must be non-empty and
  total > 0 (guard), but the image is never read on the out-of-buffer path.
  "credit" has no value formatter, so formatKeywordLabel returns the key verbatim when
  it is <= 30 chars — KEEP KEYS SHORT (e.g. "k0".."k9") so label === key exactly.

    const img = { id: "x" } as unknown as import("@/types/image").Image;

    it("resolves the correct bucket key for every covered position (and null beyond)", () => {
      fc.assert(fc.property(
        // gaps between consecutive startPositions, 2..8 buckets, first start = 0
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 7 }),
        fc.integer({ min: 1, max: 50 }),   // tail beyond last bucket → null zone
        (gaps, tail) => {
          const starts = gaps.reduce<number[]>((acc, g) => {
            acc.push(acc[acc.length - 1] + g); return acc;
          }, [0]);
          const buckets = starts.map((startPosition, i) => ({
            key: `k${i}`,
            count: 1,
            startPosition,
          }));
          const coveredCount = starts[starts.length - 1] + tail;
          const dist = { buckets, coveredCount };
          const total = coveredCount + 10;
          for (let p = 0; p <= coveredCount + 5; p++) {
            // oracle: last bucket whose startPosition <= p, but null once p >= coveredCount
            const label = interpolateSortLabel("credit", p, total, 1_000_000, [img], dist);
            if (p >= coveredCount) {
              expect(label).toBe(null);
            } else {
              let idx = 0;
              for (let b = 0; b < buckets.length; b++) {
                if (buckets[b].startPosition <= p) idx = b; else break;
              }
              expect(label).toBe(`k${idx}`);
            }
          }
        },
      ));
    });

  This kills the binary-search mutations (<= → <, >= → >) at every bucket edge and the
  null-zone gate simultaneously. Keep 1-2 hand-written examples alongside it for
  readability (e.g. buckets at [0,5,10], coveredCount 15: position 5 → "k1", position
  14 → "k2", position 15 → null).

  ---- PART C: enumerated pure-function cases ----

  C1. resolvePrimarySortKey("-uploadTime,taken") === "uploadTime";
      resolvePrimarySortKey(undefined) === "uploadTime"  (default -uploadTime).
  C2. interpolateSortLabel("-taken", 0, 100, 0, [imageWithNoDateTaken]) === null, no throw
      (date sort, missing metadata.dateTaken, no distribution → null).
  C3. resolveDateSortInfo("unknownField") === null;
      resolveKeywordSortInfo("unknownField") === null.
  C4. Positive cases: resolveDateSortInfo("-taken") deep-equals
      { field: "metadata.dateTaken", direction: "desc" };
      resolveKeywordSortInfo("credit") deep-equals
      { field: "metadata.credit", direction: "asc" }.
      (Confirm the exact ES field paths by reading DATE_SORT_ES_FIELDS /
      KEYWORD_SORT_ES_FIELDS in the source; adjust if they differ.)

STEP 3 — Run tests:
  npm --prefix kupua test -- src/lib/sort-context.test.ts
  Tee to "$TMPDIR/kupua-test-output.txt"
  All tests must pass (property: default 100 samples is fine). If a test fails, decide
  whether the test or your reading of the source is wrong — read the source and fix the
  TEST; do not modify source.

STEP 4 — Full suite:
  npm --prefix kupua test
  Tee to "$TMPDIR/kupua-test-output.txt"
  Confirm no regressions.

STEP 5 — Done when: fast-check installed, 1 new test file (sort-context.test.ts),
  parts A/B/C green, full suite green. NO two-tier.test.ts.

DO NOT: modify source code (only package.json via npm install), add vi.mock, create
two-tier.test.ts, or touch files outside kupua/.
```

---

> **⚠ DEFERRED INDEFINITELY (2026-07-01).** Batches C and D below are the original
> 2026-05-30 drafts, kept for reference only. They were NOT rewritten in the
> verification pass and should not be executed as-is — see the revision note at the
> top of Appendix B.

### Batch C — `dispatchClickEffects.ts` (refactor + tests) — DEFERRED

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

### Batch D — `reset-to-home.ts` (store mocking) — DEFERRED

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
