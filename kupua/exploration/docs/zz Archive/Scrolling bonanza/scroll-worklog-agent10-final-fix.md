# Worklog: Agent Ten — Scroll-Up After Seek + Test Reliability

> Started: 5 April 2026
> Status: **FIX COMPLETE. 99% verified by user on real data. 1% cosmetic swim remains (see below).**

## TL;DR for Next Agent

**The scroll-up bug is FIXED.** Approach #4 works: removed `_postSeekBackwardSuppress`
flag, added 200ms post-extend cooldown after each `extendBackward` completion. All
automated tests pass (186 unit + 69 scrubber E2E + 10 buffer corruption E2E + 23 smoke
on 1.3M real data). User manually verified on TEST cluster — can scroll up after seek,
position preserved, no freezes.

**Remaining 1% — tiny swim on first `extendBackward` after seek:**
After seek lands and the deferred scroll fires at 800ms, `extendBackward` prepends 200
items + scroll compensation. The user sees ~3 images reposition (not a full-screen flash,
just a subtle shift). This is the prepend compensation being *almost* invisible but not
quite. Same tiny swim also visible during long scroll sessions when a new backward extend
fires. See "Analysis of the 1% Swim" section below for root cause and ideas.

**What changed (uncommitted from HEAD `0a39cd8da`):**
1. `tuning.ts`: `SEEK_COOLDOWN_MS` changed from 200 (committed) → 700 (working tree).
2. `useDataWindow.ts`: Commented out `_postSeekBackwardSuppress` flag and its export.
   Simplified `reportVisibleRange` to call `extendBackward` without flag check.
3. `search-store.ts`: Commented out `setPostSeekBackwardSuppress(true)` in `seek()`.
   Removed import. Added `_seekCooldownUntil = Date.now() + 200` after `extendBackward`
   completion to prevent cascading compensations.
4. `scrubber.spec.ts`: Agent 9's scroll-up tests kept. Rewrote settle-window test to
   check `firstVisibleGlobalPos` instead of `scrollTop` (correct swimming metric).
5. `smoke-scroll-stability.spec.ts`: S22 (scroll-up) + S23 (settle-window) tests —
   S23 rewrote to check `firstVisibleGlobalPos` same as local test.
6. `worklog-agent-ten.md`: This file.

## User Confirmation (answers to Agent Ten questions)

1. **Approach #4 approved.** User also noted: writing tests that detect the issues could help us fix them, so tests-first is an option.
2. **Manual test flow confirmed:** I make code change → user runs `node scripts/run-smoke.mjs <N>` → I read JSON → AND user tests manually in real app.
3. **Repro steps confirmed:** Fresh app → click scrubber at ~any position → immediately try mousewheel up → CANNOT scroll up. Second seek → same. Only scrolling down ENOUGH (~7 rows, i.e., past EXTEND_THRESHOLD) allows scrolling up.
4. **Scroll down unlocks scroll up — confirmed.** The flag auto-clears when `startIndex > EXTEND_THRESHOLD` which happens after enough downward scrolling (or after forward extend + prepend comp shifts scrollTop high enough).
5. **Dev server running.** I can stop it myself before running local e2es. User will handle smoke tests.
6. **Permission to run smoke tests on TEST: YES.** This dramatically accelerates iteration.

## Test Inventory (Agent 9's uncommitted additions)

### Local E2E (in `scrubber.spec.ts`):
| Test | What it checks | Current state |
|---|---|---|
| "can scroll up after seeking to 50%" (grid) | Seek → wait 1.5s → mouse.wheel up × 5 → scrollTop decreased? | Should FAIL with flag ON |
| "can scroll up after seeking to 50% (table view)" | Same in table density | Should FAIL with flag ON |
| "no scrollTop drift during settle window after seek" | Seek → poll scrollTop every 50ms × 20 → max drift < 303px? | Should PASS with flag ON (flag prevents swimming) |
| "prepend compensation works after seek settles" | Seek → wait 1.5s → buffer grew? scrollTop increased? | May PASS — depends on forward-extend growing buffer enough |

### Smoke (in `smoke-scroll-stability.spec.ts`):
| Test | What it checks |
|---|---|
| S22: scroll-up after seek | Seek → wait 1.5s → mouse.wheel up × 5 → scrollTop decreased? |
| S23: settle-window stability | Seek → poll scrollTop 50ms × 60 (3s) → max consecutive drift < 303px? |

**These tests have NEVER been run.** Agent 9 wrote them and died before execution. They are exactly what we need to verify approach #4.

## Strategy Decision

The tests Agent 9 wrote are EXACTLY what we need. They detect both bugs:
- Scroll-up tests (local + smoke) will FAIL with flag ON → proves bug exists
- Settle-window tests will catch swimming if flag OFF → validates approach #4

**My plan:**
1. First: run local e2e tests on CURRENT state (flag ON, cooldown 700) to establish baseline — expect scroll-up tests to FAIL, settle to PASS
2. Then: try approach #4 (remove flag, keep 700ms cooldown)
3. Run local e2e again — expect scroll-up tests to PASS; watch settle-window test
4. Ask user to run smoke S22,S23 on TEST to validate on real data
5. Ask user to manually verify in real app

## Key Files

| File | Role |
|---|---|
| `src/constants/tuning.ts` | `SEEK_COOLDOWN_MS=700` (uncommitted; committed=200), `SEEK_DEFERRED_SCROLL_MS=800` |
| `src/hooks/useScrollEffects.ts` | Effect #6 — deferred timer dispatches scroll at 800ms after seek |
| `src/hooks/useDataWindow.ts` | `_postSeekBackwardSuppress` flag + `reportVisibleRange` guard (line 209-213) |
| `src/stores/search-store.ts` | `seek()` sets flag=true (line 1977) + cooldown at data arrival (line 1969) |
| `e2e/scrubber.spec.ts` | Local E2E tests — Agent 9 added scroll-up + settle-window tests (uncommitted) |
| `e2e/smoke-scroll-stability.spec.ts` | Smoke tests S12-S23 — write JSON to `test-results/scroll-stability-report.json` |
| `e2e/helpers.ts` | `seekTo()` — clicks scrubber at ratio, waits for seek completion |

## Understanding: The Mechanism

1. User clicks scrubber → `seek(globalOffset)` in search-store
2. `seek()` sets `_seekCooldownUntil = Date.now() + SEEK_COOLDOWN_MS` (blocks ALL extends)
3. `seek()` sets `_postSeekBackwardSuppress = true` (blocks backward extend indefinitely)
4. ES returns data → `set()` with new buffer (200 items at target offset)
5. `_seekGeneration` increments → Effect #6 fires in `useScrollEffects`
6. Effect #6: reverse-compute means scrollTop ~= target pixel, so delta < rowHeight → no-op (zero flash!)
7. Effect #6: schedules deferred scroll at 800ms
8. At 800ms: synthetic scroll event → `handleScroll` → `reportVisibleRange`
9. `reportVisibleRange`: `startIndex ≤ EXTEND_THRESHOLD && offset > 0 && !_postSeekBackwardSuppress`
10. With flag: backward extend blocked → can't scroll up
11. Without flag: backward extend fires → prepend 200 items → compensation → POTENTIALLY visible swimming

## Session Log

- Orientation: read all docs, all source, all test results, Agent Nine chat
- Created worklog
- User answered all questions — full go-ahead, including permission to run smoke tests on TEST
- Decision: run Agent 9's tests first (baseline), then try approach #4

### Baseline (flag ON, cooldown 700ms) — local e2e
- scroll-up (grid): ❌ FAIL — scrollTop 0→0, can't scroll up
- scroll-up (table): ❌ FAIL — scrollTop 0→0, can't scroll up
- prepend-comp: ❌ FAIL — buffer stays at 200 (no extend fires)
- settle-window: ✅ PASS — scrollTop rock-solid at 150px, zero drift
- **Tests correctly detect the bug!**

### Approach #4 attempt 1: remove flag only — local e2e
- scroll-up (grid): ✅ PASS
- scroll-up (table): ✅ PASS
- prepend-comp: ✅ PASS
- settle-window: ❌ FAIL — 30,300px drift (two cascading prepends)
- **Fixes scroll-up but re-introduces swimming!**

### Approach #4 attempt 2: remove flag + post-extend 200ms cooldown — local e2e
Added `_seekCooldownUntil = Date.now() + 200` at the end of `extendBackward`.
This spaces out consecutive backward extends so the browser settles between compensations.
- scroll-up (grid): ✅ PASS
- scroll-up (table): ✅ PASS
- prepend-comp: ✅ PASS
- settle-window: ✅ PASS — visiblePos=5157 stable throughout (compensation is invisible!)
- **Full scrubber suite: 69/69 PASS**
- **Buffer corruption suite: 10/10 PASS**
- **Unit/integration: 186/186 PASS**

### Key insight: the settle-window test was wrong
The original test checked raw `scrollTop` drift. But scrollTop LEGITIMATELY changes during
prepend compensation — that's the whole mechanism. The correct metric is `firstVisibleGlobalPos`
(what the user actually sees). Rewrote the test to check visible content stability.

### What changed (3 files):
1. `useDataWindow.ts`: Commented out `_postSeekBackwardSuppress` flag and `setPostSeekBackwardSuppress` export. Simplified `reportVisibleRange` to call `extendBackward` without flag check.
2. `search-store.ts`: Commented out `setPostSeekBackwardSuppress(true)` in seek(). Removed import. Added 200ms cooldown after `extendBackward` completion to prevent cascading compensations.
3. `scrubber.spec.ts`: Rewrote settle-window test to check `firstVisibleGlobalPos` instead of `scrollTop`.

### Next: smoke test on TEST
Need to validate on real data (1.3M docs). Will run S22+S23 (new) plus S14 (existing swimming test).
The 200ms post-extend cooldown needs to work at network latency of real ES (50-500ms per extend).

### Smoke tests on TEST (1.3M docs) — ALL 23 PASS
- S14 (swimming): ✅ NO SWIMMING — 0 shifts down+up
- S15 (10s wait): ✅ STABLE after extended pause
- S18 (timeline): Single clean prepend at ~1.1s (200→400), offset 674243→674043, scrollTop 152→8939 — compensation invisible
- S21 (aggressive scroll): ✅ NO SWIMMING
- S22 (scroll-up): ✅ CAN SCROLL UP — scrollTop decreased 8787→7787 after mousewheel up
- S23 (settle-window): ✅ STABLE — visiblePos shifted by only 3 items (< 7 limit)
- All other S1-S13, S16-S20: ✅ PASS

### User Manual Testing on TEST — 99% PASS ✅

User tested these scenarios on the real app connected to TEST cluster (1.3M docs):

1. ✅ Fresh app → seek → **can scroll up** (MAIN BUG FIXED!)
2. ✅ Seek from half-a-row from top → position retained
3. ✅ Seek from half-a-row from bottom → position retained
4. ✅ Seek from absolute bottom (top row not aligned) → position retained
5. ✅ Fresh app → seek → scroll weeeeell looooong to trigger buffer extend → seek → position retained

**The 1% that remains:**
- Scenario 1: Immediately after landing the seek, there is a **tiny swim** — about 3
  images reposition. This is the `extendBackward` prepend compensation being visible.
  It's what "unlocks" scroll-up — the 200 prepended items create buffer space above.
- Scenario 5: Same tiny swim happens later during long scrolling (when a new backward
  extend fires mid-scroll).

User verdict: "99% there — genuinely amazing." Wants the 1% investigated and ideally
eliminated, or at minimum documented with ideas for future work.

---

## Analysis of the 1% Swim

### What the user sees

After seek lands, at ~800ms (deferred scroll time), there's a brief visual shift of ~3
image cells. Not a full-screen flash — more like a micro-adjustment. The same thing can
happen during long scroll sessions when `extendBackward` fires.

### Root cause

The sequence is:

1. **Seek completes** → buffer has 200 items at `bufferOffset = N` (e.g. 650,000)
2. **700ms cooldown** → all extends blocked
3. **800ms deferred scroll** → synthetic scroll event → `reportVisibleRange`
4. `startIndex ≤ EXTEND_THRESHOLD && offset > 0` → `extendBackward()` fires
5. ES returns 200 items → prepended to buffer → `bufferOffset -= 200`
6. `_prependGeneration` increments → **Effect #4** in `useScrollEffects` fires
7. **`useLayoutEffect`** sets `el.scrollTop += prependedRows * rowHeight` (e.g. +8787px)
8. But there's a **1-frame gap**: React re-renders with 400 items (virtualizer grows),
   browser paints the new layout, THEN `useLayoutEffect` adjusts scrollTop.
   In that single paint frame, the user briefly sees wrong content → the "3 image shift"

### Why it's almost invisible but not quite

`useLayoutEffect` runs **before** the browser paints (that's its contract). So
theoretically the scrollTop adjustment should be invisible. BUT:

- React batches state updates → re-render → `useLayoutEffect` runs → browser paints
- The virtualizer (TanStack Virtual) may need its own internal re-render after the
  buffer resize before the correct row count is established
- On fast GPUs with high refresh rates, the browser may composite an intermediate frame
  between React's DOM mutation and the `scrollTop` adjustment

This is a **fundamental tension** in prepend-then-compensate strategies for virtual
scrollers. Every virtual scroll library that supports prepending has this problem to
some degree.

### Ideas to eliminate or mitigate the 1%

**Idea A: Offscreen prepend (the user's philosophical idea)**
> "Can we not do it somewhere where users won't immediately see it?"

Instead of prepending when `startIndex ≤ EXTEND_THRESHOLD` (i.e. near the top of visible
content), only prepend when the user has scrolled DOWN enough that the prepend target is
well above the viewport. For example:
- After seek, DON'T immediately `extendBackward` at the deferred scroll time
- Wait until the user scrolls down far enough that we have room to prepend above without
  the compensation being visible
- e.g. user scrolls 300+ rows down → safe to prepend 200 items above (compensation
  adjusts scrollTop but the adjusted region is hundreds of rows above viewport)

**Trade-off:** User can't scroll up past the initial 200-item buffer until they've first
scrolled down enough. BUT: in practice the user just seeked — they're looking at the
target content, and if they scroll up it's usually after looking around first. This is
very close to the old suppress-flag behaviour but with a MUCH smaller threshold.

**Concrete implementation:** Change `EXTEND_THRESHOLD` logic for backward extend to check
not just "am I near the top of the buffer" but "am I near the top of the buffer AND is
the buffer-start far enough below viewport that compensation would be invisible."

**Idea B: Double-buffer / snapshot trick**
Before prepending, take a "snapshot" of the current viewport content (via CSS
`will-change: transform` or an offscreen canvas), apply the prepend + compensation in
one go, then remove the snapshot. The snapshot masks the 1-frame gap.

**Trade-off:** Complex, fragile, potentially worse on slow devices. Probably not worth it.

**Idea C: Increase deferred scroll delay**
Instead of 800ms, use 1200ms. More time for the virtualizer to fully settle. Might
eliminate the micro-shift by ensuring the layout is 100% stable before extends fire.

**Trade-off:** Slower time-to-scroll-up. User waits 1.2s before backward extend fires.
Probably not perceptible since user needs to orient themselves after seeking.

**Idea D: requestAnimationFrame wrapper around compensation**
Wrap the scrollTop compensation in `requestAnimationFrame` inside the `useLayoutEffect`,
so the DOM mutation (prepend) and scroll compensation happen in the same paint frame.

**Trade-off:** May not help — `useLayoutEffect` already runs before paint. The issue may
be that React's render + layout effect span multiple microtasks on some browsers.

**Idea E: Accept it**
3 images shifting by one cell is genuinely imperceptible to most users. The old behaviour
(can't scroll up AT ALL) was a real usability bug. This is cosmetic.

### My recommendation

**Idea A** is the most promising and aligns with the user's own intuition. It's also the
simplest to implement: modify the `reportVisibleRange` backward-extend condition to
require a minimum scroll depth before allowing the first backward extend after seek. NOT
a flag (we killed that) — just a smarter threshold check.

Something like:
```typescript
// Instead of:
if (startIndex <= EXTEND_THRESHOLD && offset > 0) {
  extendBackward();
}

// Try:
const viewportRows = Math.ceil(el.clientHeight / rowHeight);
const minSafeDepth = viewportRows * 2; // 2 viewports of scroll depth
if (startIndex <= EXTEND_THRESHOLD && offset > 0 && endIndex > minSafeDepth) {
  extendBackward();
}
```

This means after seek, the first backward extend only fires once the user has scrolled
down ~2 viewports worth. At that point, the prepend compensation adjusts scrollTop for
content that's ~2 viewports above — completely invisible. The user can still scroll up
(through the existing 200-item buffer), and once they've scrolled down and back up
enough, the buffer seamlessly extends backward.

**The trick:** `endIndex > minSafeDepth` naturally becomes true either when:
- The user scrolls down enough (natural exploration)
- `extendForward` has grown the buffer enough that the visible range shifts

In both cases, by the time backward extend fires, it's invisible.

**Risk:** If the user seeks to position 500 in 1.3M docs and immediately scrolls UP
without scrolling down first, they'd hit the 200-item buffer boundary. But this is
a very rare edge case and they'd just stop scrolling, scroll down a bit, and then be
fine. Much better than the old "can't scroll up at all" bug.

---

## Files Changed (for commit)

| File | Change |
|---|---|
| `src/constants/tuning.ts` | `SEEK_COOLDOWN_MS` 200→700, updated doc comment, added `POST_EXTEND_COOLDOWN_MS` |
| `src/hooks/useDataWindow.ts` | Disabled `_postSeekBackwardSuppress` flag |
| `src/stores/search-store.ts` | Removed flag activation in `seek()`, added post-extend cooldown using named constant |
| `e2e/scrubber.spec.ts` | Scroll-up tests (grid+table+double-seek+timing) with bufferOffset assertions, rewritten settle-window with dynamic COLS |
| `e2e/smoke-scroll-stability.spec.ts` | S22 (scroll-up) + S23 (settle-window) |
| `exploration/docs/scroll-work-worklog-agent10-final-fix.md` | This worklog |
| `exploration/docs/changelog.md` | Agent 10 entry added |
| `AGENTS.md` | Updated scroll effects, testing, what's next sections |

---

## Q&A: User's Four Questions (Pre-Commit Review)

### Q1: Is a fresh agent well-equipped to continue?

**YES.** The worklog contains:
- Full TL;DR of what was done and why
- The 1% swim analysis with 5 ranked ideas
- Complete session log of every test run and result
- Files-changed table for committing
- The mechanism explanation (steps 1-11)
- All failed approaches (agents 7-9) and why they failed

AGENTS.md and changelog.md are both updated. A fresh agent can read this worklog
and the top of AGENTS.md and know exactly where to pick up.

### Q2: Dead code to remove / dev gating

**Dead code to clean up:**
1. ✅ `_postSeekBackwardSuppress` in `useDataWindow.ts` — commented out, 10-line block.
   Can be deleted entirely (currently kept for history). The comments explaining the
   removal are sufficient.
2. ✅ `setPostSeekBackwardSuppress` import in `search-store.ts` — commented out (line 38).
   Can be deleted.
3. ✅ `setPostSeekBackwardSuppress(true)` call in `seek()` — commented out (line 1986).
   Can be deleted.

**Dev gating — ALL GOOD:** Every diagnostic `console.log` in `src/` uses `devLog()` from
`src/lib/dev-log.ts`, which is guarded by `import.meta.env.DEV`. Vite DCEs the entire
function body in production. Verified: zero bare `console.log` in `src/` except inside
`devLog` itself. The E2E test files use bare `console.log` which is fine — tests don't
ship.

**No other dead code** was found. The post-extend cooldown (line 1347) is active code.

### Q3: Test quality assessment

**What's strong:**
- Flash-prevention golden table (cases 1-4): 0px tolerance — catches ANY scroll drift
- Scroll-up tests (grid + table): directly test the bug we fixed
- Settle-window test: checks `firstVisibleGlobalPos` (correct metric, not scrollTop)
- Buffer corruption suite: 10 tests for extend/evict/seek edge cases
- Smoke S1-S23: real-data validation on 1.3M docs

**What could be tighter:**
- Settle-window tolerance is 7 items (1 row). We measured 3 on real data. Could tighten
  to 5 to catch regressions earlier while leaving room for column-count variance.
- The scroll-up tests wait 1.5s then assert. Could add a follow-up assertion: after
  scrolling up, the `bufferOffset` should have decreased (proving `extendBackward`
  actually fired, not just that scroll happened within existing buffer).
- No test for "scroll-up after double-seek" (seek → seek → scroll up). Worth adding
  since the cooldown resets on each seek.
- No test for "scroll-up speed" — how quickly after seek can the user scroll up? Could
  add a timing assertion (e.g. scroll-up works within 2s of seek landing).
- The `COLS = 7` constant in the settle-window test is hardcoded. Should be computed
  from the viewport width, or at minimum documented as dependent on test viewport size.

**Tests to cull:** None. Every test covers a distinct scenario. The full suite runs
in ~70s which is fast enough for habitual use.

### Q4: Timing optimisation (making it snappier)

**Current timing chain:**
```
seek() → SEEK_COOLDOWN_MS (700ms) → SEEK_DEFERRED_SCROLL_MS (800ms) → extends fire
                                                                        ↓
                                                              extendBackward completes
                                                                        ↓
                                                              post-extend cooldown (200ms)
                                                                        ↓
                                                              next extend can fire
```

**The "bottom freeze" the user describes:**
After seek, the buffer has only 200 items. The viewport may show the last 3-4 rows as
empty because `extendForward` is blocked by the 700ms cooldown. At 800ms, the deferred
scroll fires, `extendForward` runs, fetches 200 more items, and they appear. Total
visible freeze: ~800ms + network latency (50-500ms on real ES).

**What "7ms" means:** The browser needs only ~7ms to paint a frame (16ms at 60fps, less
on high-refresh). After seek data arrives and React renders, the DOM is stable in
~7-16ms. The 700ms cooldown is ~100x longer than needed for DOM stability.

**BUT 700ms is there for a reason:** It's not about DOM stability — it's about preventing
transient scroll events (from virtualizer reflow) from triggering premature extends. The
question is: how short can we make it while still blocking those transient events?

**Approach: empirical binary search with our test suite as the safety net:**
1. Try 400ms cooldown (deferred scroll at 500ms)
2. Run all 69 scrubber E2E + settle-window test
3. If pass → try 200ms (deferred scroll at 300ms)
4. If pass → ask user to run smoke S14+S22+S23 on TEST
5. If pass → try 100ms (deferred scroll at 200ms)
6. Find the minimum that passes ALL tests

**The post-extend cooldown (200ms) can also be tuned.** It only needs to survive one
paint frame (~16ms). But 200ms is safe margin. Could try 100ms or even 50ms.

**The deferred scroll delay (currently cooldown + 100ms) could also shrink.** The 100ms
margin just needs to be > 0 to ensure the deferred scroll fires after cooldown expires.
50ms should be fine.

**IMPORTANT:** The 200ms cooldown that failed in Agent 7's testing was BEFORE we removed
the flag. The flag was causing the swimming on its own — when it cleared, extendBackward
fired all at once. Now with the post-extend cooldown spacing things out, 200ms main
cooldown might actually work. Worth testing.

**My suggested experiment plan:**
1. 400ms main cooldown → run full E2E suite
2. 300ms → run full E2E suite
3. 200ms → run full E2E suite
4. Winner → smoke test on TEST
5. Also try reducing post-extend cooldown from 200ms → 100ms → 50ms

---

## Next: Test Tightening (Q3) — About to Implement

### What I'm about to do (5 changes):

1. **Tighten settle-window tolerance**: 7 items → 5 items. We measured 3 on real data.
   5 leaves margin for column-count variance (viewport width differences) while catching
   regressions that 7 would miss.

2. **Add `bufferOffset decreased` assertion to scroll-up tests**: Currently the tests
   only check `scrollAfter < scrollBefore` (scroll happened). But scroll could happen
   within the existing 200-item buffer without `extendBackward` ever firing. Adding
   `storeAfter.bufferOffset < storeBefore.bufferOffset` proves the backward extend
   actually ran and prepended items.

3. **Add "scroll-up after double-seek" test**: Seek → seek again → scroll up. This tests
   that the cooldown correctly resets between seeks and doesn't leave stale state that
   blocks the second seek's backward extend.

4. **Add timing assertion for scroll-up readiness**: After seek, how quickly can the user
   scroll up? Assert it works within 2 seconds. Currently we wait 1.5s — this just
   formalises the expectation.

5. **Compute COLS from viewport instead of hardcoding 7**: Use the same
   `Math.floor(clientWidth / 280)` formula as the grid component.

### What I'm NOT doing:
- Timing experiments (Q4) — documented for next session
- Idea A (offscreen prepend for 1% swim) — needs user decision after timing experiments
- Deleting dead flag code — will do at commit time

---

## Answers to User's Additional Questions

### Q-extra-1: Can the 200ms post-extend cooldown be a named constant in tuning.ts?

**YES, absolutely.** The 200ms post-extend cooldown is currently a magic number inline
in `search-store.ts` (line 1347: `_seekCooldownUntil = Date.now() + 200`). It should
be a named constant in `tuning.ts` with the relationship to other constants documented.

The relationships:
```
SEEK_COOLDOWN_MS (700ms)           — blocks ALL extends after seek data arrives
SEEK_DEFERRED_SCROLL_MS (800ms)    — = SEEK_COOLDOWN_MS + SEEK_DEFERRED_MARGIN_MS
SEEK_DEFERRED_MARGIN_MS (100ms)    — NEW: gap between cooldown expiry and deferred scroll
POST_EXTEND_COOLDOWN_MS (200ms)    — NEW: blocks next extend after each extendBackward
```

Constraint: `SEEK_DEFERRED_SCROLL_MS > SEEK_COOLDOWN_MS` (already derived).
Constraint: `POST_EXTEND_COOLDOWN_MS` should be ≥ 2 paint frames (~32ms) to ensure
the browser has painted the scroll compensation before the next extend triggers a
new prepend. 200ms is conservative. Could be tuned down in Q4.

I'll extract this as part of Q3 implementation.

### Q-extra-2: Staff Engineer architecture doc — is this a good idea?

**Absolutely yes.** This is one of the most valuable docs you could have. Here's why:

1. **The problem is genuinely hard** — windowed buffer over 1.3M (potentially 9M+, was
   57M!) docs with cursor-based pagination, no random access, prepend compensation,
   seek via percentile estimation... this is PhD-thesis-level scrolling infrastructure.
   Google Photos and Apple Photos hold the full ID list in memory and have O(1) random
   access to any position. We can't — at 9M docs × ~40 bytes per sort key = ~360MB
   just for the position map. At 57M it's 2.3GB. And ES's `from/size` is O(n) past
   10k. So we invented deep seek (percentile + search_after + countBefore).

2. **The doc would serve 3 audiences:**
   - Staff engineers reviewing the approach (is this sound? could it be simpler?)
   - Future agents (context that survives session boundaries)
   - You (forcing clear articulation often reveals simplification opportunities)

3. **Suggested structure:**
   - **§1 The Problem** — why infinite scroll over ES is hard (no random access, no
     position map, from/size is O(n), 57M docs)
   - **§2 How Google Photos / iCloud / immich do it** — full ID map in memory,
     client-side virtual scroll, O(1) position lookup. Why this doesn't scale for us.
   - **§3 Our approach** — windowed buffer (1000 items), cursor-based extend, seek
     via percentile estimation, reverse-compute for zero-flash
   - **§4 The swimming problem** — prepend-then-compensate, useLayoutEffect timing,
     why virtual scrollers all struggle with this
   - **§5 The timing chain** — cooldown → deferred scroll → post-extend cooldown,
     why each number exists, the constraints between them
   - **§6 Edge cases** — null-zone seek, keyword sort seek, End key, density-focus
     save/restore, sort-around-focus
   - **§7 What's left** — the 1% swim, potential mitigations, timing tuning

**This is a perfect fresh-agent task.** All the information already exists in the
codebase, worklogs, and AGENTS.md. The agent just needs to read and synthesise — no
code changes needed, so no risk of breaking anything.

**Suggested filename:** `exploration/docs/scroll-architecture.md`

---

## Test Tightening Results (Q3 Implementation)

### Changes made:

1. ✅ **Extracted `POST_EXTEND_COOLDOWN_MS = 200`** to `tuning.ts` with full doc comment
   explaining the timing chain and constraints. Replaced magic `200` in `search-store.ts`
   with the named constant.

2. ✅ **Tightened settle-window tolerance**: Was `COLS` (hardcoded 7). Now computed
   dynamically: `cols = Math.floor(clientWidth / 280)` (same as grid component), with
   `MAX_SHIFT = cols + 1`. At 1280px test viewport → 4 cols → 5-item tolerance.
   Measured: 0 shift on local (compensation is perfectly invisible on mock data).

3. ✅ **Added `bufferOffset decreased` assertion** to both scroll-up tests (grid + table).
   Proves `extendBackward` actually fired, not just that scroll happened within existing
   200-item buffer.

4. ✅ **Added "scroll-up after double-seek" test**: Seek 30% → seek 70% → scroll up.
   Tests that cooldown resets correctly between seeks.

5. ✅ **Added "scroll-up within 2s" timing test**: Formalises the timing expectation.
   After seek, scroll-up must work within 2 seconds. If the timing chain is made
   snappier (Q4), this deadline can be tightened.

### Test run results:
- **Scrubber E2E: 71/71 PASS** (was 69 — 2 new tests added)
- **Buffer corruption: 10/10 PASS**
- **Unit/integration: 186/186 PASS**

### Settle-window timeline (local, tightened):
```
t=58ms   visiblePos=5157  offset=5157  len=200  scrollTop=150.0
t=803ms  visiblePos=5157  offset=5157  len=200  scrollTop=150.0   (cooldown still active)
t=999ms  visiblePos=5157  offset=4957  len=400  scrollTop=15300.0 (extend fired, comp invisible!)
t=1871ms visiblePos=5157  offset=4957  len=400  scrollTop=15300.0 (stable)
```
maxContentShift = 0. Perfect compensation — zero visible shift on local data.

