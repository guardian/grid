<!-- AGENT PROTOCOL
STOP! If you do NOT see your own "🤖 Agent check-in" entry at the bottom of the
Session Log that YOU wrote in THIS conversation, you are a NEW agent.
Follow the Fresh Agent Protocol in copilot-instructions.md:
  1. Say "Hi, I'm a fresh agent."
  2. Read this file fully.
  3. State what context you have.
  4. Ask: "What should I read before starting?"
  5. Do NOT write or modify any code until the user confirms.
If you DO see your own check-in in your conversation history, carry on.
-->

# Current Task

(No active task.)

## Session Log

(Session log moved to changelog.md.)

---

## New thread: seek-mode rapid-scroll bug (research only)

**Bug:** In seek mode (>65k), scrolling rapidly stops at page boundaries; resumes once items load. User wants: don't stop — scroll through skeletons / nothingness instead. System is fragile, must not introduce silent regressions.

**Plan:** Deep dive on scroll code (no edits). TEST server (1.3M, port 3000) authorised for throwaway probes. Will report understanding back before proposing any fix.

- Started reading scroll code…

### Findings (read-only, no code changes)

**Mechanical cause of the "stops at page boundaries" bug:**

In **seek mode** (`total > POSITION_MAP_THRESHOLD = 65k`), `useDataWindow` sets:

```ts
virtualizerCount = twoTier ? total : results.length;  // results.length ≤ 1000
```

The DOM scroll container's `scrollHeight` is therefore capped at **~1000 rows × rowHeight** (e.g. ~75 rows × 303px = ~22.7k px in grid). When the user wheel-scrolls rapidly past the EXTEND_THRESHOLD (50 items from edge), `extendForward` is fired and a `search_after` round-trip starts (~100–500ms on TEST). During that round-trip the user keeps wheeling but `scrollTop` is **clamped by the browser** at `scrollHeight - clientHeight` — they are literally pinned at the bottom of buffer. When the fetch returns: PAGE_SIZE=200 new items append, eviction trims 200 from the start, `bufferOffset` advances by 200, scrollTop is compensated down → the user has another ~5 screens of headroom and can keep wheeling. Repeat.

That's the "pause at every page boundary" rhythm. It's not a bug per se — it's the natural consequence of `virtualizerCount = results.length` + extends only being able to bridge one PAGE_SIZE at a time.

**Why two-tier (1k–65k) doesn't have this problem:**

In two-tier, `virtualizerCount = total`, so `scrollHeight = total × rowHeight` (full physical height). The user wheel-scrolls freely past the buffer — cells outside the buffer render as skeletons. `useDataWindow.reportVisibleRange` detects the viewport is "outside buffer" and fires a 200ms-debounced `seek(globalStart)` to reposition. Hence the user's observation: skeletons-while-scrolling exists in two-tier but not seek.

**Conceptual fix (NOT yet proposed for implementation):**

Extend two-tier-style virtualisation to seek mode: set `virtualizerCount = total` whenever `total > SCROLL_MODE_THRESHOLD` (drop the upper bound). The position map stays absent above 65k, so seeks use the existing deep paths (percentile / composite / countBefore) — slower than position-map but still correct. The scroll-triggered seek mechanism in `useDataWindow` already calls `seek(globalStart)` agnostically — no per-tier branching needed there.

**What this affects (audit surface — these are the fragility risks):**

1. **`useScrollEffects` prepend compensation** — currently gated by `twoTier`. Gating-off would extend to seek mode too. In principle correct (with global indices, items render at fixed global positions, eviction doesn't visually shift) but needs careful audit.
2. **Scrubber thumb math** — `Scrubber.tsx` already has an `isScrollMode` branch that includes `twoTier`. If seek mode becomes twoTier-style, the scrubber would lose its "release-to-seek" UX and become a real scrollbar that drags content + skeletons. **This is actually the user's desire** ("don't stop, scroll through skeletons") — but it changes the scrubber paradigm above 65k. May or may not be wanted.
3. **Sort-around-focus, density-focus, useImageTraversal** — all currently assume a particular index coordinate space depending on tier. Each consumer needs auditing.
4. **`scrubberMode` label** — currently `'seek'` for >65k without positionMap. Would still report `'seek'` (no positionMap → no `'indexed'`) but actually behave like a scrollbar. Naming inconsistency.

**Smaller-blast-radius alternative:** keep seek-mode coordinate space buffer-local but extend `virtualizerCount` to `bufferOffset + results.length + HEADROOM_ROWS` (e.g. +500 skeleton rows past buffer end, +500 before bufferOffset). This is a mixed coordinate model and would be more fragile than the full unification. Not recommended.

**Recommendation to discuss with user before any code change:** the conceptual fix (drop the 65k upper bound on `twoTier`) is the right shape, but the architecture doc explicitly leans on the 3-tier separation, and the "settle-window content shift = 0 items" guarantee was measured for seek mode under bidirectional-seek + prepend-compensation. Switching to twoTier-style above 65k removes prepend compensation entirely (gated off), so swimming is moot — but a regression in scroll-triggered seek behaviour at >65k scale is plausible. The 27 smoke tests on TEST cover seek mode; we'd need to confirm they still pass and that the scrubber UX change is acceptable. Did **not** run TEST probes — analysis from code reading is sufficient and concrete.
