# Scroll Stability Assessment — Kupua Infinite Scroll

## Executive Summary

Over the last four commits (`0a39cd8da` → `3b910f8e2`), spanning agents 5–13, the codebase underwent a prolonged, iterative effort to eliminate "swimming" — visible content displacement after deep seeks in an infinite-scroll image browser backed by Elasticsearch. The result is **5,549 lines added across 35 files**, yielding a functionally correct scroll system with zero swimming confirmed on both local (10k docs) and real (1.3M docs) data. However, the path taken reveals systemic issues worth an honest appraisal.

---

## What Was Built (The Good)

### 1. The Core Architecture Is Sound
The windowed-buffer + cursor-pagination + custom-scrubber design is genuinely novel for this problem space. The `scroll-architecture.md` doc accurately notes this is harder than Google Photos (which holds a full position map) or immich (which fits in RAM). The architecture handles:
- 1.3M–9M documents with ~1,000-item memory budget
- Seven sort fields (date, keyword, mixed), including null-zone handling
- Cursor-based pagination at any depth (no `from/size` limit)
- Sub-row pixel preservation across seeks

### 2. Bidirectional Seek Solved The Root Problem
The final fix (Agent 11–13) is elegant: after a deep seek fetches 200 items forward, add a backward fetch of 100 items. User lands in the buffer middle with headroom above. Both `extendBackward` and `extendForward` then operate on off-screen content → zero swimming. This is the right structural fix.

### 3. Exhaustive Test Coverage
- **72 E2E scrubber tests** (2,595 lines) — seek accuracy, scroll compensation, density switch, sort preservation
- **13 smoke tests** on real 1.3M data — scroll-up, settle-window, headroom boundary
- **10 buffer corruption tests** — regression suite for the async race condition
- **186 unit/integration tests** across the full store

### 4. Excellent Documentation
The `scroll-architecture.md` (630 lines) is a genuine staff-engineer-level document. The changelog entries are forensically detailed. The archive of worklogs (`Scrolling bonanza/`) preserves every dead end and root-cause analysis. Future developers will understand *why* every decision was made.

---

## What Went Wrong (The Honest Part)

### 1. Fifteen Agents to Fix One Problem Class

The changelog tells a story of serial misdiagnosis and approach churn:

| Agent | Approach | Outcome |
|-------|----------|---------|
| 3–4 | Initial swimming observation | Diagnosed, not fixed |
| 5 | End key `soughtNearEnd` flag | Partial — fixed one path |
| 6 | `_postSeekBackwardSuppress` flag | **Blocked scrolling up entirely** |
| 7 | Reduced cooldown 700→200ms | **Regressed swimming on real data** |
| 8 | (implied) | Undone Agent 7's change |
| 9 | Wrote tests for Agent 10 | **Died before running them** |
| 10 | Removed suppress flag, added post-extend cooldown | ✅ Fixed scroll-up. 1% swim remained |
| 11 | Bidirectional seek (Idea B) | **Made swimming WORSE** — missed headroom offset |
| 12 | Test fixes | Adjusted tests for new buffer shape |
| 13 | Headroom offset + sub-row preservation | ✅ Fixed. Zero swimming |

That's **8 dead-end or regression-producing iterations** before the final fix. Agent 6's suppress flag — which solved swimming by making the app unusable in a different way — survived as committed code for at least 3 agent sessions.

**Root cause of the churn:** Each agent treated the symptom (visible shift) rather than the structural cause (user positioned at buffer edge after seek). Only Agent 10's handoff document correctly identified "Idea B: bidirectional seek" as the real fix. Agents 5–9 added timing hacks (`_seekCooldownUntil`, `_postSeekBackwardSuppress`, deferred scroll timers) that papered over the issue without addressing it.

### 2. The Timing Chain Is Fragile

The current system relies on a carefully orchestrated timing chain:

```
seek data arrives
  → SEEK_COOLDOWN_MS (700ms) blocks ALL extends
    → SEEK_DEFERRED_SCROLL_MS (800ms) fires synthetic scroll event
      → first extendBackward fires
        → POST_EXTEND_COOLDOWN_MS (200ms) blocks next extend
          → next extendBackward fires
            → repeat
```

This is **five sequential timing dependencies**, all hardcoded in milliseconds. The comments say things like:
- *"If you see buffer corruption or swimming after seek, increase this"*
- *"200ms is conservative — may be tunable down to 50-100ms"*
- *"MUST be > SEEK_COOLDOWN_MS — if it fires during cooldown, the scroll event is swallowed and extendForward never runs → freeze at buffer bottom"*

These are textbook signs of a system held together by empirically-tuned magic numbers. The bidirectional seek eliminated the *worst* symptom, but the timing chain is still load-bearing for edge cases. On a slower machine or under CPU pressure, the 700ms might not be enough; on a faster one, 700ms is wasted latency.

**What would be better:** Replace time-based guards with state-based guards. Instead of "block extends for 700ms", use "block extends until the first paint after seek data arrives" (a `requestAnimationFrame` guard). This is what the `useLayoutEffect` compensation already partially does — but the cooldown mechanism is a parallel, redundant, time-based version of the same concept.

### 3. Complexity Metrics

| File | Lines | Scroll-Specific LOC (est.) | Concern |
|------|-------|---------------------------|---------|
| `search-store.ts` | 2,613 | ~900 (seek: 500, extend: 200, reverse-compute: 200) | God object — store, DAL orchestration, scroll math, cursor management all interleaved |
| `useScrollEffects.ts` | 717 | 717 | 10 numbered effects, each with nuanced interaction. Comments reference each other by number |
| `useDataWindow.ts` | 247 | 60 | Thin — but module-level mutable state (`_visibleStart/End`) is a smell |
| `tuning.ts` | 159 | 80 | 6 timing constants with prose explaining their interdependencies |

The `seek()` function alone is **~500 lines** (L1368–L2276). It contains:
- 5 seek paths (End key, shallow from/size, percentile, null-zone, keyword)
- Binary search refinement over SHA-1 hex space
- Bidirectional backward fetch
- Reverse-compute with headroom offset and sub-row preservation
- Null-zone cursor detection and remapping

This is too much for one function. The `seek()` function is doing algorithm selection, ES query orchestration, scroll position calculation, and Zustand state management in a single 500-line async function with 6 `if (signal.aborted) return` bail-out points.

### 4. The Reverse-Compute Is Clever But Brittle

The flash-prevention mechanism (L2100–L2213) reverse-computes a buffer-local index from the user's current `scrollTop`:

```typescript
const isTable = scrollEl.getAttribute("aria-label")?.includes("table");
const rowH = isTable ? TABLE_ROW_HEIGHT : GRID_ROW_HEIGHT;
const cols = isTable ? 1 : Math.max(1, Math.floor(scrollEl.clientWidth / GRID_MIN_CELL_WIDTH));
```

This reads DOM attributes from inside the Zustand store action. The store is supposed to be view-agnostic; here it's inspecting `aria-label` strings and `clientWidth` to detect the current density mode. The architecture document notes this as a deliberate trade-off, but it creates a coupling between the store (which should know about data) and the DOM (which should be the view's concern).

The headroom offset fix (L2150–L2161) adds another layer:

```typescript
if (backwardItemCount > 0 && reverseIndex < backwardItemCount) {
  _seekSubRowOffset = subRowOffset;
  reverseIndex += backwardItemCount;
}
```

This deferred pixel offset gets stored in Zustand state (`_seekSubRowOffset`) and consumed once by effect #6 in `useScrollEffects.ts`. It's a one-shot communication channel between an async store action and a synchronous React layout effect, implemented as mutable shared state. It works, but it's the kind of thing that breaks silently when someone refactors one side without knowing the other exists.

### 5. Test Coverage Is Wide But Not Deep Enough In The Right Places

The 72 E2E scrubber tests are impressive in breadth. But the key failure mode — swimming visible to the human eye — was repeatedly missed by automated tests and only caught by manual smoke testing on real data. The changelog explicitly notes:
- *"These tests have NEVER been run. Agent 9 wrote them and died before execution."*
- *"Manual testing reveals: 5 images disappear from top row in intermediate state. Was 3 before. WORSE."*
- *"E2E test pre-scrolled to scrollTop=150 before seeking, which masked this issue."*

The smoke tests (`smoke-scroll-stability.spec.ts`, 1,441 lines) were added as a reaction to this gap. They're a good safety net, but they run against a live TEST cluster — they can't be part of CI. The local E2E tests still can't reproduce the ~1% swim that was the original complaint, because it requires a buffer size and scroll geometry that doesn't manifest with 10k docs.

---

## Assessment: Is It Over-Engineered?

**No, but it's under-structured.** The problem genuinely requires this level of complexity. Browsing millions of sorted documents with position preservation across density switches, sort changes, and random-access seeks is not a solved problem in the frontend ecosystem. The approach is inventive and the final result works.

What's over-engineered is the *defensive timing layer* — the cooldowns, generation counters, deferred scroll events, and abort controllers that exist because the core state transitions weren't clean enough to avoid races. The bidirectional seek was the right structural fix; the 5 timing constants are the residue of 12 agents' worth of patch-on-patch.

**The single most valuable refactor** would be to extract `seek()` into a standalone module with:
1. Strategy selection (which seek path to use) — pure function
2. ES orchestration (the actual fetches) — async function, no Zustand
3. Buffer assembly (combining forward + backward, cursor management) — pure function
4. Scroll position computation (reverse-compute, headroom offset) — pure function reading geometry as a parameter, not DOM
5. State commit — single `set()` call with the assembled result

This would make each piece independently testable (unit tests, not E2E) and make the interactions between them explicit rather than implicit through shared mutable state.

---

## Final Verdict

**The scroll system works.** It handles an exceptionally hard problem correctly. The documentation is exemplary. The test coverage, while it has gaps in the most critical failure mode, is strong.

**The cost was high.** Fifteen agent sessions, ~5,500 lines, and a fragile timing chain that exists because earlier agents added palliative fixes instead of solving the structural problem. The bidirectional seek should have been implemented by Agent 6, not Agent 11. The suppress flag should never have been committed.

**The technical debt is manageable but real.** The 500-line `seek()` function, the DOM inspection from inside the store, the one-shot `_seekSubRowOffset` communication channel, and the 5-constant timing chain are all maintenance hazards. They're well-documented hazards — which is the next best thing to not having them.

**Recommendation:** Don't touch it unless you have to. If you do have to, the first move is extracting `seek()` into composable pieces that can be unit-tested. The second move is replacing the time-based cooldowns with frame-based guards. Both would reduce the coupling that made this a 15-agent odyssey instead of a 3-agent fix.

