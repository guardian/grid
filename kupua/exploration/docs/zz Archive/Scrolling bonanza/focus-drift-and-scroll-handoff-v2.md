# Focus Drift & P8 Table Scroll — Agent Handoff (v2)

> **Created:** 2026-03-31
> **Revised:** 2026-03-31 (v2 — rewritten after critical evaluation of v1)
> **Status:** Ready for execution.
> **Prerequisite reading:** `AGENTS.md`, `perf-measurement-report.md` (full data).

---

## Context: Where We Are

The coupling-fix programme (Phases 0–C) is complete. The perf harness now persists
`focusDriftPx`, `focusDriftRatio`, and `focusVisible` correctly. The final Phase C
re-run produced three actionable findings:

| Issue | Data | Priority |
|---|---|---|
| P6: sort-around-focus places focused item ~41% viewport below expected | focusDriftPx=428, ratio=0.412 | **High — visually jarring** |
| P4b: table→grid switch places focused item 160px above expected | focusDriftPx=−160, ratio=−0.156 | **Medium — noticeable** |
| P8: table fast scroll p95=50ms, domChurn=~57k — unchanged by all coupling fixes | Consistent across all phases | **Medium — likely structural, investigation only** |

P4a (grid→table) is **perfect** — 0px drift. This asymmetry is a key diagnostic clue
for P4b.

---

## How the Perf Testing Loop Works

**The agent NEVER runs perf tests (`run-audit.mjs`) directly.** The human runs them.

### Commands Reference

| What | Command | Who runs it |
|------|---------|-------------|
| Unit tests | `npx vitest run` | **Agent** |
| Functional E2E | `npx playwright test` (foreground, no pipe/tail) | **Agent** |
| Perf audit (all) | `node e2e-perf/run-audit.mjs --label "..."` | **Human only** |
| Perf audit (subset) | `node e2e-perf/run-audit.mjs P4a,P4b,P6 --label "..."` | **Human only** |

### Template for every perf request

> Ready for perf measurement. Please:
>
> 1. Make sure the real-data app is running:
>    `./scripts/start.sh --use-TEST`
> 2. Run: `node e2e-perf/run-audit.mjs P4a,P4b,P6 --label "Focus drift: initial baseline" --runs 1`
> 3. When it finishes, let me know and I'll read the results from `e2e-perf/results/audit-log.json`.

**Always give exact copy-pasteable commands. Always specify `--runs 1` or `--runs 3`.
Always say whether `--use-TEST` needs to be started or is already running.**

**After reading results:** (1) present a plain-English summary, (2) flag regressions
(>10% worse), (3) flag expected improvements that didn't materialise, (4) update docs.

---

## Work Item 1: Focus Drift Elimination

### The Goal

Get `focusDriftPx` as close to 0 as practical on all three paths:
- P4a (grid→table): already 0px — **must stay 0** after any changes
- P4b (table→grid): −160px → near 0
- P6 (sort change): 428px → near 0

### Step 0: Write a local E2E test FIRST

**Before touching any production code**, add a functional E2E test in
`e2e/scrubber.spec.ts` that measures viewport drift after sort-around-focus.

The existing test `"focused image survives sort direction change"` (line ~513) only
asserts the image **ID** is preserved and that it's in the buffer. It does NOT assert
viewport position. Add a new test (or strengthen the existing one) that:

1. Focuses item N (e.g. item 5)
2. Reads the focused item's `viewportY` (pixel offset from scroll container top)
3. Toggles sort direction
4. Waits for sort-around-focus to complete
5. Reads `viewportY` again
6. Asserts `|drift| < threshold` (start with 100px — will tighten after fix)

Use the same `getFocusedViewportPos` technique from `e2e-perf/perf.spec.ts` (lines
91–145) but adapted for the local mock data. This test will **fail** with the current
code (428px drift), confirming the bug locally. After the fix, it will pass.

Similarly, add a drift assertion to the density-switch tests for P4b.

This satisfies the "smoke → local feedback loop" directive: every perf finding should
produce at least one local test improvement.

### P6: Sort-Around-Focus Position — Design Decision Required

**Before implementing, discuss this design question with the user:**

The current `sortAroundFocusGeneration` effect calls `scrollToIndex(idx, { align: "center" })`.
The 428px drift is not a math bug — it's `align: "center"` working as designed.
The question is: **what should happen to the focused item's viewport position after a
sort change?**

**Option A — Preserve exact pre-sort Y offset:**
Capture the focused item's `viewportRatio` before the sort fires, store it, restore it
after the seek completes. The item appears at the exact same Y pixel as before.

*Pro:* Maximum "Never Lost" fidelity — nothing moves.
*Con:* The surrounding context is completely different after a sort change. Same Y pixel
with entirely different neighbours may feel *more* disorienting than a deliberate
re-positioning. Also requires a ratio-capture mechanism that is architecturally complex
(see below).

**Option B — Place focused item at a predictable, comfortable position (RECOMMENDED):**
After the sort, scroll so the focused item appears at ~15-20% from the top of the
viewport. This is the "golden ratio" for content discovery: the item is clearly visible,
with its new sort-order neighbours visible below.

*Pro:* Simple (change one line — `align: "center"` → computed offset). No state capture
needed. Intentional, predictable, works in both densities with no special-casing.
The user *just changed the sort* — they want to see the focused item in its new context,
not pinned to an arbitrary pre-sort Y.
*Con:* The viewport position changes (by less than "center", but still changes). Not
literally "nothing moved."

**Option C — Centred (current intent, just with correct offset):**
Keep `align: "center"` but ensure the focus ring is actually visible (currently drifts
428px because the test's starting position is near the top, making "center" feel like
a large downward jump).

*Con:* "Center" is still a re-positioning — the drift just happens to be smaller when
the item starts near the middle. Starting from position ~5, moving to center will always
be a large visual jump.

**Recommendation: Option B.** The drift with "center" is proportional to how far the
item is from the viewport centre — it's not a constant error, it's an architectural
choice that disagrees with "Never Lost." Option B eliminates the drift by design:
the item always lands at a known, comfortable position.

### P6 Implementation (assuming Option B is chosen)

The fix is entirely within the `sortAroundFocusGeneration` effect in both density
components. No store changes needed. No pre-sort ratio capture needed.

**In `ImageTable.tsx` (current code around line 822):**
```ts
// BEFORE:
virtualizer.scrollToIndex(idx, { align: "center" });

// AFTER:
const el = parentRef.current;
if (el) {
  const rowTop = idx * ROW_HEIGHT;
  // Place the focused item at ~20% from the viewport top
  const targetScroll = rowTop - el.clientHeight * 0.2;
  const clamped = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, targetScroll));
  virtualizer.scrollToOffset(clamped);
} else {
  virtualizer.scrollToIndex(idx, { align: "start" });
}
```

**In `ImageGrid.tsx` (current code around line 519):**
```ts
// BEFORE:
const rowIdx = Math.floor(idx / columns);
virtualizer.scrollToIndex(rowIdx, { align: "center" });

// AFTER:
const el = parentRef.current;
if (el) {
  const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
  const rowTop = Math.floor(idx / cols) * ROW_HEIGHT;
  const targetScroll = rowTop - el.clientHeight * 0.2;
  const clamped = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, targetScroll));
  virtualizer.scrollToOffset(clamped);
} else {
  const rowIdx = Math.floor(idx / columns);
  virtualizer.scrollToIndex(rowIdx, { align: "start" });
}
```

The `0.2` factor is the "20% from top" target. Adjust after visual testing. Extract
as a constant if used in more than two places.

**If Option A is chosen instead** (preserve exact pre-sort Y):
This is harder. The ratio must be captured before the sort triggers. `useUrlSearchSync.ts`
has **no DOM access** — it can't read scroll positions. The capture must happen in the
density component itself. The simplest approach:
1. Add `sortAroundFocusRatio: number | null` to the search store (or a module-level
   variable like `density-focus.ts`).
2. In `useUrlSearchSync.ts`, before calling `search(sortAroundFocusId)`, call a new
   store action `captureSortFocusRatio()` that signals the density component to save
   its current ratio (via a generation counter or a store field the component watches).
3. The density component's effect reads the scroll position and writes the ratio to
   the store.
4. After the seek completes and `sortAroundFocusGeneration` increments, the
   `sortAroundFocusGeneration` effect reads the saved ratio and restores it.

This is 3–4× more complex than Option B. Only do it if the user explicitly wants
"nothing moves" semantics.

### P4b: Table → Grid Density Switch (−160px drift)

**Diagnostic approach: logging first, then fix.**

The −160px is suspiciously close to `5 × TABLE_ROW_HEIGHT = 5 × 32 = 160`. The test
focuses item 5. The bug is in the table→grid direction only (grid→table is 0px).

The save path (ImageTable unmount, line ~881):
```ts
saveFocusRatio((localIdx * ROW_HEIGHT - el.scrollTop) / el.clientHeight, localIdx);
```
Here `ROW_HEIGHT` = `TABLE_ROW_HEIGHT` = 32.

The restore path (ImageGrid mount, line ~545):
```ts
const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
const rowTop = Math.floor(idx / cols) * ROW_HEIGHT;   // ROW_HEIGHT = GRID_ROW_HEIGHT = 303
const targetScroll = rowTop - saved.ratio * el.clientHeight;
const clamped = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, targetScroll));
virtualizer.scrollToOffset(clamped);
```

**Key investigation: add temporary `console.log` to both paths.** In the table unmount:
```ts
console.log("[density-focus] TABLE SAVE:", {
  localIdx, rowTop: localIdx * ROW_HEIGHT, scrollTop: el.scrollTop,
  clientHeight: el.clientHeight, ratio: (localIdx * ROW_HEIGHT - el.scrollTop) / el.clientHeight
});
```

In the grid mount:
```ts
console.log("[density-focus] GRID RESTORE:", {
  idx, cols, rowTop, savedRatio: saved.ratio, clientHeight: el.clientHeight,
  targetScroll, clamped, scrollHeight: el.scrollHeight
});
```

Run the P4b functional test locally (`npx playwright test e2e/scrubber.spec.ts -g "density"`
or the specific test) and read the console output. The numbers will tell you exactly
which part of the formula is off.

**Most likely causes (in order of probability):**
1. **`el.scrollHeight` at grid mount time doesn't reflect the full virtualizer size.**
   TanStack Virtual sets the inner div height; on mount, this may not be painted yet,
   so `el.scrollHeight` is smaller than expected, causing `clamped` to be too small.
2. **`el.clientHeight` differs between table and grid** — the table has an internal
   sticky header (45px) visible in its scroll container; the grid has no internal header.
   If the grid's scroll container is 45px taller, the ratio restoration math is off by
   `ratio * 45px`.
3. **Column count at mount differs from steady state** — `el.clientWidth` at mount
   might be wrong if the grid hasn't laid out yet, giving wrong `cols` and therefore
   wrong `rowTop`.

**Do NOT run the perf test first for P4b.** Use the functional E2E tests + console
logging. Only request perf measurement after you have a fix candidate.

### P17: Density Switch from Deep Position (row 500+)

After fixing P4b (and ideally P6), add a new perf test. P4a/P4b currently test from
item ~5 (near the top). Real-world "Never Lost" failures happen when the user is deep
in the list.

```ts
test("P17: density switch from deep position — Never Lost at row 500+", async ({ kupua }) => {
  await gotoPerfSearch(kupua);
  await requireRealData(kupua);

  // Start in grid view (default)
  // Seek to ~50% to get deep into the list
  await kupua.seekTo(0.5);
  await kupua.page.waitForTimeout(3000);

  // Focus an image at the current position
  await kupua.focusNthItem(3);
  const focusedId = await kupua.getFocusedImageId();
  const posBefore = await getFocusedViewportPos(kupua);
  console.log(`  [P17] Focused: ${focusedId}, before: vY=${posBefore?.viewportY}px ratio=${posBefore?.viewportRatio}`);

  await injectPerfProbes(kupua);
  await kupua.page.waitForTimeout(500);
  await resetPerfProbes(kupua);

  // Switch grid → table
  console.log(`  [P17] Switching grid → table from deep position...`);
  await kupua.switchToTable();
  await kupua.page.waitForTimeout(2000);

  const snap = await collectPerfSnapshot(kupua, "P17: Deep density switch");
  const posAfter = await getFocusedViewportPos(kupua);
  const drift = posBefore && posAfter ? posAfter.viewportY - posBefore.viewportY : null;
  const ratioDrift = posBefore && posAfter
    ? Math.round((posAfter.viewportRatio - posBefore.viewportRatio) * 1000) / 1000 : null;
  console.log(`  [P17] After: vY=${posAfter?.viewportY}px ratio=${posAfter?.viewportRatio}, drift=${drift}px`);

  logPerfReport("P17: Deep Density Switch (grid→table)", snap);
  emitMetric("P17", snap, {
    focusDriftPx: drift,
    focusDriftRatio: ratioDrift,
    focusVisible: posAfter?.visible ?? false,
  });

  expect(await kupua.getFocusedImageId()).toBe(focusedId);
});
```

Consider adding P17b (table→grid from deep position) as a separate test.

### Validation Sequence for Focus Drift Work

1. `npx vitest run` — must pass
2. `npx playwright test` — all functional tests must pass (including new drift tests)
3. Ask human: `node e2e-perf/run-audit.mjs P4a,P4b,P6 --label "Focus drift fix: [description]" --runs 1`
4. Read drift values. Target: |focusDriftPx| ≤ 50px on all three paths
5. If P17 is added: `node e2e-perf/run-audit.mjs P4a,P4b,P6,P17 --label "..."`
6. **Confirm P4a stays at 0px throughout** — any regression here means the fix broke
   the good direction

---

## Work Item 2: P8 Table Fast Scroll — Scoped Investigation (30 min max)

### The Goal

**This is an investigation, not a fix.** The goal is to determine whether any quick
wins exist and report findings to the user. Budget: 30 minutes.

### What We Already Know

~57k DOM mutations over a ~5s scroll session. `TABLE_ROW_HEIGHT = 32px`. At `wheel(0, 1500)`,
each event advances ~47 rows (1500/32). The visible window is ~32 rows (1024/32).
**Each wheel event replaces more than the entire visible window.** This is TanStack
Virtual working exactly as designed. Overscan is already at 5 (reduced from 20 in
earlier work — that reduction gave −61% severe jank).

### Investigation Steps (in order, stop when confident)

**Step 1: Check `React.memo` on row components (~5 min)**
```
grep -n "memo\|React.memo\|TableRow\|TableBody" kupua/src/components/ImageTable.tsx | head -30
```
If `TableRow` / `TableBody` are not wrapped in `React.memo`, wrap them. If they are,
check whether any prop creates a new reference every render (new object, new function,
new array). **Note:** during fast scroll, `React.memo` has limited value because rows
are being *replaced* (unmount old, mount new), not re-rendered. Memo only helps for
the ~5 overscan rows that survive between frames.

**Step 2: Check referential stability of image objects (~5 min)**
In `search-store.ts`, check whether `extendForward`/`extendBackward` spreads the
results array and whether existing image objects maintain referential identity:
```
grep -n "results.*\[...\|\.map\|\.filter" kupua/src/stores/search-store.ts | head -20
```
Also check `useDataWindow` (if it exists) for any transformation that creates new
object references. If found, fix. If not, this is fine.

**Step 3: Report findings to user**

Write a 5-sentence summary of what you found. The likely conclusion:

> P8's ~57k DOM churn is structural to TanStack Virtual during fast scroll: each
> wheel(0, 1500) event advances ~47 rows past a ~32-row visible window, replacing
> the entire rendered set every frame. Overscan is already at 5 (minimum reasonable).
> [Memo/stability finding]. The only approaches that would meaningfully reduce churn
> are: (a) `scrollingDelay` / skeleton rows during scroll (UX trade-off — content
> replaced by placeholders during fast scroll), or (b) reducing overscan below 5
> (causes blank flash). Recommendation: accept the current 50ms p95 as the
> cost of real content during fast scroll on a 32px-row table.

**Do NOT spend more than 30 minutes on P8.** If there's an easy win (broken memo,
unnecessary re-render), fix it. If not, write the report and move on.

### Validation (only if a code change is made)

1. `npx vitest run` + `npx playwright test`
2. Ask human: `node e2e-perf/run-audit.mjs P8 --label "P8 investigation: [what changed]" --runs 1`

---

## Minimal Perf Test to Request First

Before making any code changes, ask the human to run a clean baseline:

> **First thing:** please run a quick baseline so we know we're starting from a
> clean state:
>
> ```
> node e2e-perf/run-audit.mjs P4a,P4b,P6,P8 --label "Pre-fix baseline" --runs 1
> ```
>
> This will take about 3–4 minutes. Once done, I'll read the results and then
> start on the focus drift fixes.

---

## Source File Map

| File | What to look at |
|------|-----------------|
| `src/stores/search-store.ts` | `_findAndFocusImage()` function (~line 516), `search()` method and `sortAroundFocusGeneration` bump |
| `src/components/ImageTable.tsx` | `sortAroundFocusGeneration` effect (search for `sortAroundFocusGeneration`), density-switch mount/unmount effects (search for `consumeFocusRatio` and `saveFocusRatio`) |
| `src/components/ImageGrid.tsx` | Same two effects as ImageTable (search for same function names) |
| `src/lib/density-focus.ts` | Module-level bridge — entire file (~40 lines) |
| `src/constants/layout.ts` | `TABLE_ROW_HEIGHT=32`, `GRID_ROW_HEIGHT=303`, `TABLE_HEADER_HEIGHT=45` |
| `src/hooks/useUrlSearchSync.ts` | Where `search(sortAroundFocusId)` is called — understand the flow but **do not try to capture DOM state here** (no DOM access) |
| `e2e-perf/perf.spec.ts` | `getFocusedViewportPos()` helper, P4a/P4b/P6/P8 tests — use as reference for measurement |
| `e2e/scrubber.spec.ts` | Existing sort-around-focus and density-switch tests — add drift assertions here |

---

## Key Constraints — Do Not Change Without Discussion

1. **`density-focus.ts` module-level variable** — works correctly for serial
   unmount/mount. Do not migrate to `useRef` in this session. The concurrent-mode
   risk is theoretical — React unmounts are synchronous in current React 19, and
   `startTransition` on density switches was tried and reverted.

2. **Do not replace TanStack Virtual** or switch to a canvas renderer for P8.
   The eval doc (Part 3.3) already covers why those alternatives were rejected.

3. **Overscan is at 5** — this was reduced from 20 in earlier work (−61% severe jank).
   Do not reduce further without visual testing (causes blank flash during scroll).

4. **The P6 fix is a deliberate departure from "always centre after sort"** if Option B
   is chosen. Add an entry to `exploration/docs/deviations.md` explaining the change.

---

## Docs to Update After This Work

1. **`AGENTS.md`** — What's Done section (current state, not history)
2. **`exploration/docs/changelog.md`** — append under current phase heading (full detail)
3. **`exploration/docs/perf-measurement-report.md`** — add §7 with before/after drift
   values and P8 findings
4. **`exploration/docs/deviations.md`** — add entry for P6 position fix if behaviour
   changes from "center" to "predictable position"
5. **This file** — mark items complete as they are done

