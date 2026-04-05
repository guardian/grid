# Worklog: Seek Timing & Backward-Extend Suppress

> Started: 5 April 2026, Agent #7.
> Continued: Agent #8 (brief — re-added flag clearing, didn't work, died before revert).
> Continued: Agent #9 (current).
> Status: **Code reverted to agent 6 baseline.** Two known bugs. Agent 9 working on fix + tests.

## TL;DR for Next Agent

**Current code state:** Identical to the committed agent 6 work ("Scroll
Stability 100%"). `SEEK_COOLDOWN_MS = 700`, `SEEK_DEFERRED_SCROLL_MS = 800`,
`_postSeekBackwardSuppress` flag active. The only uncommitted changes are in
`tuning.ts` (700 vs committed 200 — the committed 200 is wrong, see below),
`scrubber.spec.ts` (rewritten prepend-comp test), and this worklog.

**Two known bugs in the current state:**
1. **Can't scroll up after seek** — the suppress flag blocks extendBackward
   until `startIndex > EXTEND_THRESHOLD (50)`. User must scroll down ~7 rows
   first. Affects ALL sorts, not just keyword.
2. **Swimming on flag clear** — every attempt to clear the flag (timer-based,
   position-based, before/after dispatch) causes visible swimming because
   extendBackward → prepend compensation → flash.

**Agent 8 left the working tree in a broken state** (flag clearing after
dispatch in `useScrollEffects.ts` + 700ms cooldown). This caused swimming
on the first user scroll after seek. **Agent 9 reverted** the flag clearing
back to match the committed state. `useScrollEffects.ts` now has zero diff
from the commit.

**AGENTS.md line 72 says `SEEK_COOLDOWN_MS (200ms)` — this is stale.**
The committed value in `tuning.ts` is 200ms but the working tree has 700ms.
The 200ms value was proven to cause swimming on real data (TEST, 1.3M docs).
Agent 9 will fix AGENTS.md after the approach is settled.

## Agent 9 Plan

1. ✅ Revert broken flag clearing from agent 8's working tree
2. Write tests that detect BOTH bugs:
   - "scroll-up after seek" test (seeks, scrolls up, asserts scrollTop decreased)
   - "settle window stability" test (polls scrollTop during 0–1000ms after seek)
   - Both as local E2E + smoke variants
3. Run tests on current state (flag active) — expect scroll-up test to FAIL
4. Try approach #4: remove the flag, keep 700ms cooldown
5. Run tests again — expect scroll-up to PASS; watch for swimming
6. Validate on TEST via smoke tests (user runs, agent reads JSON)

## Context

Agent 6's commit ("Scroll Stability 100%") fixed all 6 scroll bugs with:
- `SEEK_COOLDOWN_MS = 700` (hardcoded, now named in `tuning.ts`)
- `SEEK_DEFERRED_SCROLL_MS = 800` (hardcoded, now derived: 700 + 100)
- `_postSeekBackwardSuppress` flag — blocks `extendBackward` after seek until
  `startIndex > EXTEND_THRESHOLD (50)` in `reportVisibleRange`

Agent 7 session attempted two changes (both reverted):
1. Reduce cooldown 700→200ms (deferred 800→300ms) for snappier post-seek UX
2. Clear suppress flag on deferred timer to fix "can't scroll up" bug which was assumed to affect only keyword-based sorts

## What Happened

### Change 1: Cooldown 700→200ms

- **Local E2E (10k docs):** All 80 tests pass, including 0px flash tolerance
- **Smoke S1–S21 (1.3M docs):** All pass including S14 (swimming), S20 (preservation)
- **Manual testing on TEST:** Swimming (3 flashes on seek), position not preserved

**Root cause:** Tests measure post-settle behaviour (after buffer has grown).
The swimming happens during the initial 200–700ms settle window. The 200ms
cooldown lets transient scroll events through that trigger extends → prepend
compensation → visible flash. The smoke tests wait for seek completion +
deliberate scroll steps, missing the initial settle flashes.

**Test gap:** No test measures what happens in the first 300–700ms after seek
data arrives. The golden table test measures scrollTop delta at seek completion
(effect #6). The prepend-comp test measures after 1500ms settle. S14 measures
manual scroll steps after full settle. None captures the initial flurry.

### Change 2: Suppress flag clearing at deferred timer

- **Problem it solves:** After seeking, user lands at `startIndex ≈ 0`. The
  flag blocks `extendBackward` until `startIndex > 50`. User must scroll down
  ~7 rows first. Without scrolling down, can't scroll up — no backward extend
  means no items above, stuck at buffer top.

- **Fix attempted:** Clear flag in effect #6 deferred timer.

- **Result — clearing BEFORE dispatch:** `reportVisibleRange` runs during
  the synchronous scroll handler with flag=false → immediate `extendBackward`
  → prepend + compensation → visible swim (3 flashes).

- **Result — clearing AFTER dispatch:** `reportVisibleRange` runs with
  flag=true (still set) → backward extend blocked. Flag clears after. Next
  user scroll should work BUT: the synthetic scroll from the deferred timer
  triggered `extendForward` which grew the buffer. The user CAN then scroll
  down, which clears the flag via position check. But immediate scroll-up
  after seek still doesn't work — same pre-existing behaviour.

- **Isolation test (200ms cooldown, flag clearing disabled):** No swimming.
  Confirms the flag clearing (not the cooldown) causes the swimming when
  clearing is enabled.

## What Was Reverted

- `SEEK_COOLDOWN_MS` → back to 700 (was briefly 200)
- Flag clearing line removed from effect #6
- `setPostSeekBackwardSuppress` import removed from `useScrollEffects.ts`

## What Stayed (agent 7 additions in the commit)

- Constants extracted to `tuning.ts` (`SEEK_COOLDOWN_MS`, `SEEK_DEFERRED_SCROLL_MS`,
  `SEARCH_FETCH_COOLDOWN_MS`)
- All 7 hardcoded `_seekCooldownUntil` sites use named constants
- 0px test tolerances + diagnostic comments in `scrubber.spec.ts`
- Prepend-comp test rewritten to check buffer growth + compensation ran
  (not raw scrollTop freeze — which was wrong after flag clearing)
- Changelog and AGENTS.md updates

## Key Files

| File | What |
|---|---|
| `src/constants/tuning.ts` | `SEEK_COOLDOWN_MS=700`, `SEEK_DEFERRED_SCROLL_MS=800`, `SEARCH_FETCH_COOLDOWN_MS=2000` |
| `src/hooks/useScrollEffects.ts` | Effect #6 — deferred timer dispatches scroll at 800ms |
| `src/hooks/useDataWindow.ts` | `_postSeekBackwardSuppress` flag + `reportVisibleRange` guard (line 209) |
| `src/stores/search-store.ts` | `seek()` sets flag=true + cooldown at data arrival (line ~1977) |

## Forward: Two Open Issues

### Issue A: Can the cooldown be shorter than 700ms?

The 200ms value passed all automated tests but failed manual testing on real
data. The gap: no test captures the initial 200–700ms settle window after seek.

**To make this safe:**
1. Add a "settle window" test — seek, then poll scrollTop every 50ms for
   1000ms, assert no drift > 1 row at any point. Run on both local and smoke.
2. Binary-search the minimum safe cooldown with the settle test.
3. The settle time likely depends on network latency + React render time.

### Issue B: Can't scroll up after seek (ALL sorts, not just keyword)

The suppress flag blocks `extendBackward` after every seek. User must scroll
down past `EXTEND_THRESHOLD=50` items (~7 rows in grid) before backward
extend unblocks. This is invisible when the user naturally scrolls around,
but very noticeable if they try to scroll up immediately after seeking.

**This bug exists in agent 6's original code.** It's the trade-off agent 6
made to prevent swimming. The flag prevents the catastrophic prepend
compensation flash during the settle window.

**The core tension:** extendBackward after seek causes swimming (prepend +
compensation = visible flash). The flag prevents it. But the flag also
prevents legitimate backward scrolling.

**Possible approaches (all untested, all have risks):**

1. **Very late flag clear (2000ms+)** — clear the flag on a separate timer
   well after the virtualizer has settled. The resulting extendBackward +
   compensation would happen in a fully settled state. Risk: the compensation
   is still ~8787px — even in steady state, if the browser paints between
   prepend and `useLayoutEffect` compensation, there's a flash. This is
   exactly what we tested and it caused swimming.

2. **Suppress compensation, not the extend** — let `extendBackward` prepend
   items but skip scroll compensation for the first post-seek prepend. Items
   appear above, scrollTop stays put, content shifts down visually. Risk: if
   user has scrolled down at all (scrollTop > 0), the shift IS visible.
   At scrollTop=0, the shift is invisible (nothing above to shift).

3. **Lower EXTEND_THRESHOLD** — reduce from 50 to e.g. 5. User only needs
   to scroll ~1 row to clear the flag. Less annoying. Risk: if threshold is
   too low, transient scroll events during reflow cross it → swimming returns.

4. **No flag, cooldown only** — remove the flag, rely on 700ms cooldown.
   After cooldown, extends are free. This is what existed before agent 6.
   Agent 6 added the flag because cooldown alone wasn't enough. But agent 6
   also added the reverse-compute (zero flash on seek) — maybe with
   reverse-compute, the cooldown alone IS now sufficient? Worth testing.

5. **Smart flag — clear when buffer has grown** — instead of position-based
   clearing, clear the flag when `resultsLength >= PAGE_SIZE * 2` (buffer
   has extended forward at least once). At that point the virtualizer has
   proven it's stable. Risk: if extendForward doesn't fire (user doesn't
   scroll down), flag never clears — same problem.

**Recommendation for next session:** Try approach #4 first (remove flag,
keep 700ms cooldown). It's the simplest and the reverse-compute may make
it safe. Test manually on TEST with default sort seek + immediate scroll up.

**After fixing inability to scroll up** after seek, the next priority is to
fix both local e2e and smoke tests (on real data). Because NONE of them caught:
inability to scroll after seek, swimming, wrong positioning after seek (effect #6?)
And that fixing tests is of highest priority just after ability to scroll
