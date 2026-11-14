# Review — scroll-mode buffer top-up fix (uncommitted)

Reviewer: fresh agent, read-only pass over the uncommitted diff plus the
surrounding code paths. Unit tests re-run during review:
`search-store.test.ts` **92/92 green**.

**Scope reviewed:** `src/stores/search-store.ts`, `src/stores/search-store.test.ts`,
`e2e/local/scrubber.spec.ts` (worklog read for intent, not reviewed).

**Verdict:** the core design decision is right and the diagnosis holds up.
But there is **one code-mangling defect that must be fixed before commit**, and
**one genuine latent race that reintroduces the original bug under slower
network conditions** — masked in tests by mock timing, not by correctness.
Three further robustness gaps are the same failure class that already bit you
in session 6 (silent budget exhaustion).

---

## Section 0 — where I disagree with the implementation's own premise

Session 1 of the worklog concluded, correctly, that a safe fix must run
**after** the buffer-placing async work settles, "not a concurrent
forward-only-from-0 fill — otherwise the two async buffer writers race and
corrupt state."

The implementation does not honour that conclusion at one of its five call
sites: [search-store.ts](kupua/src/stores/search-store.ts#L1652) fires the
top-up *concurrently* with the async `countBefore` offset correction that
follows it. It currently survives only because of an incidental 100 ms
cooldown head start. See M2.

---

## Must fix

### M1 — Pre-existing comment overwritten, leaving a dangling fragment (+ wrong indentation)

[search-store.ts](kupua/src/stores/search-store.ts#L1649-L1656)

The first two lines of the pre-existing "Async offset correction" comment were
replaced by the new comment. What remains above `if (offsetIsEstimate)` is a
sentence fragment starting mid-clause:

```ts
      // Scroll-mode top-up: this branch centres the buffer on the focused
      // image rather than filling it — for small result sets, top up the
      // rest so the scrubber can enter scroll mode (see function doc above).
        void _topUpScrollModeBuffer(get);
      // imagePositions when it resolves. Uses the same combinedSignal
      // so it's cancelled if a new search starts.
      if (offsetIsEstimate) {
```

Two defects in four lines:
1. The `offsetIsEstimate` block has lost its explanation ("Async offset
   correction: if we used an estimated offset, fire countBefore in the
   background and correct bufferOffset + …"). Restore it verbatim from `HEAD`.
2. `void _topUpScrollModeBuffer(get);` is indented 8 spaces; every sibling
   statement in that block is at 6.

The other four call sites (1326, 1413, 1565, 3727) are clean.

### M2 — Top-up silently cancels the async offset correction (real, environment-dependent)

**This one reintroduces the bug you just fixed, plus wrong global indices.**

For **every** small-total sort-around-focus, `offsetIsEstimate` is `true`. The
exact-`countBefore` branch is gated on `effectiveTotal > SCROLL_MODE_THRESHOLD`
([1479-1483](kupua/src/stores/search-store.ts#L1479-L1483)), and the position
map never exists below 1k (your own session-1 finding), so ≤1k always falls
through to [1503-1507](kupua/src/stores/search-store.ts#L1503-L1507):
`offset = effectiveHint ?? 0; offsetIsEstimate = true`.

The correction that repairs that estimate guards on **array reference
identity**: [`if (state.results !== buf.combinedHits) return;`](kupua/src/stores/search-store.ts#L1661).
`extendForward()` replaces `results` with a new array on its very first
successful call — so **the first top-up extend permanently disables the
correction.**

Why it appears to work today: the top-up's first iteration blocks on
`_seekCooldownUntil = Date.now() + SEEK_COOLDOWN_MS` (100 ms, set at
[1585](kupua/src/stores/search-store.ts#L1585)), so a fast `countBefore`
usually lands first. That is a timing accident, not a guarantee.

When `countBefore` exceeds ~100 ms (loaded cluster, SSH tunnel to TEST/CODE,
`--use-media-api` strangler path, cold caches), the failure is:

- `bufferOffset` keeps the estimate (usually 0) while the buffer actually holds
  items `[471, 671)` → every global index, the scrubber thumb and the "N of M"
  counter are wrong.
- The forward loop then fills against the wrong arithmetic: `0 + len < 958` stays
  true after the real end of results is reached, `extendForward` returns 0 hits
  each time, the step budget drains, loop exits — **buffer short, scrubber stuck
  exactly as before.**
- `assertPositionsConsistent` would still pass: the positions are internally
  consistent, just globally offset. Neither the unit nor the e2e suite can see it.

Why no test catches it: the mock `countBefore` resolves in a microtask, so the
100 ms race is won every single time in CI.

**Suggested fix (smallest, and matches session 1's own conclusion):** on the
`offsetIsEstimate` path, don't fire the top-up here — fire it from inside the
correction's `.then()` (and its `.catch()`), so it starts only after
`bufferOffset` is final. Call it directly only when `!offsetIsEstimate`.
Alternative, if you prefer to keep them concurrent: change the correction's
staleness guard from array identity to something that survives buffer growth
(e.g. the target image's presence in `imagePositions` plus a generation token)
and have it apply a *delta* rather than rebuild from `buf.bufferStart` — more
invasive, more ways to be wrong.

---

## Should fix

### M3 — Step budget is consumed by calls that made zero progress

[search-store.ts](kupua/src/stores/search-store.ts#L1007) —
`maxSteps = Math.ceil(target / PAGE_SIZE) + 2` (7 for a 958-item set needing
~5 real fetches). `steps++` happens before the call, but `extendForward()`
returns silently without fetching in three cases
([2286-2303](kupua/src/stores/search-store.ts#L2286-L2303)):

- `_extendForwardInFlight` — the virtualizer's `reportVisibleRange` racing us
  (the user scrolling during the top-up is the normal case, not the exotic one);
- `!endCursor`;
- `Date.now() < _seekCooldownUntil` — a TOCTOU with the loop's own check;
  `abortExtends()` arms a 2 s cooldown ([2404](kupua/src/stores/search-store.ts#L2404))
  and is driven by scroll handlers.

Three such no-ops out of seven and the loop exits short and silent. This is the
identical failure shape session 6 already found (cooldown waits burning budget)
— the fix there addressed the cooldown-wait case specifically rather than the
general "step spent, nothing achieved" case.

**Suggested:** only count a step when `bufferOffset + results.length` actually
changed; cap *consecutive* no-progress iterations (say 3) instead of total calls.

### M4 — `total` is not a sufficient staleness token

The loops bail when `get().total !== myTotal`, and the doc comment asserts
"a genuinely new search is the only thing that legitimately changes it"
([991-993](kupua/src/stores/search-store.ts#L991-L993)). A **sort-direction
change keeps `total` identical** — and that is trigger path #2 from your own
investigation. A stale top-up loop therefore keeps driving extends against a
buffer belonging to the *next* search.

**Suggested:** also capture `_pitGeneration`, which is bumped unconditionally
before any await at the top of every non-AI `search()`
([2034](kupua/src/stores/search-store.ts#L2034)), and bail when it moves.

### M5 — No re-entrancy guard

Five call sites, several reachable from one interaction (e.g. `search()` →
`_findAndFocusImage` fallback at 1413, plus `ImageDetail`'s mount effect →
`restoreAroundCursor` at 3727 — the exact pairing you caught live on TEST).
Two concurrent loops don't corrupt state, because `extendForward` serialises on
`_extendForwardInFlight` — but the loser burns its entire budget on BLOCKED
no-ops, compounding M3.

**Suggested:** a module-level `_topUpInFlight` flag, matching the existing
`_extendForwardInFlight` / `_extendBackwardInFlight` idiom in this file.

---

## Consider (low severity)

- **C1** — Doc says "fill the buffer to `[0, total)`" but the code targets
  `Math.min(total, BUFFER_CAPACITY)` ([1006](kupua/src/stores/search-store.ts#L1006)).
  Moot at defaults (both 1000), but `VITE_SCROLL_MODE_THRESHOLD` is
  env-configurable ([constants/tuning.ts](kupua/src/constants/tuning.ts#L84-L86));
  raise it above 1000 and the top-up can never satisfy the scroll-mode gate
  (`total <= results.length`) — it will just spin its budget every time. Either
  say so in the comment or early-return when `SCROLL_MODE_THRESHOLD > BUFFER_CAPACITY`.
- **C2** — The doc comment mentions the step cap but not the 15 s deadline, and
  the claim that the shared abort controller means a concurrent search "cleanly
  cancels our in-flight fetch" is only half true: `extendForward` swallows
  `AbortError` and returns normally, so the **loop keeps going** until a state
  guard trips. Reword to match actual behaviour.
- **C3** — Cooldown waiting polls every 20 ms bounded only by the 15 s deadline
  (~750 timer wakeups worst case). Cheap, but a single
  `setTimeout(_seekCooldownUntil - Date.now())` would be cheaper and clearer.
- **C4** — `restoreAroundCursor` sets `_seekGeneration` / `_seekTargetLocalIndex`
  ([3707-3712](kupua/src/stores/search-store.ts#L3707-L3712)) and, in scroll
  mode, the scroll effect uses the **buffer-local** index. The top-up's backward
  extends prepend items and shift that index. The 100 ms cooldown probably lets
  the scroll effect win, but the new e2e test never closes the detail view, so
  the return-to-grid centring is unverified. Worth one manual check:
  reload into deep detail → close detail → does it land on the right image?
- **C5** — The top-up now fires on every `seekToFocused()` in-buffer fast path
  ([1565](kupua/src/stores/search-store.ts#L1565)), i.e. an arrow-key path.
  It's a genuine no-op once the buffer is complete (both loop conditions false
  on first evaluation), so the cost is a couple of `get()` calls. Fine — noting
  it only because arrow-key latency is a perf-sensitive path in this app.

---

## What's right (don't change these)

- **Driving `extendForward`/`extendBackward` instead of a bespoke fetch loop** is
  the correct call. Prepend compensation, column alignment and eviction stay in
  one place; a hand-rolled loop would have been a live risk of reintroducing the
  "swimming" bug.
- **`void` without `.catch` is safe here** — both extends catch internally and
  never reject ([2388-2399](kupua/src/stores/search-store.ts#L2388-L2399)).
- **AI-search path is untouched by construction** — results ≤ 200 already equal
  `total`, so both loops no-op on first evaluation.
- **`restoreAroundCursor` uses an exact `countBefore` offset**
  ([3642](kupua/src/stores/search-store.ts#L3642)), so M2's estimate race does
  not apply at that site.
- **Test placement** — extending the existing `describe("scroll mode — buffer
  fill")` block and the matching e2e describe is the right home; the
  failing-first discipline in the worklog is exactly right.

---

## Test gaps (all currently uncovered)

1. **Slow `countBefore` vs top-up (M2).** Delay the mock's `countBefore` past
   `SEEK_COOLDOWN_MS` and assert both `results.length === total` *and* that
   `bufferOffset` ends at the corrected value — not just internal consistency.
   `assertPositionsConsistent` cannot detect a uniformly wrong offset.
2. **No-progress extends draining the budget (M3).** Hold
   `_extendForwardInFlight` true for a few iterations, or re-arm
   `_seekCooldownUntil` mid-loop, and assert the buffer still converges.
3. **Same-total supersession (M4).** Start a top-up, fire a sort-only change
   (identical `total`), assert the stale loop doesn't keep extending.
4. **Confirm the two new e2e tests actually ran.** They use
   `test.skip(total > 1000 …)` — consistent with the existing convention at
   [scrubber.spec.ts](kupua/e2e/local/scrubber.spec.ts#L2649), so not a defect,
   but "242/242 pass" is compatible with both new tests skipping. Check the
   report for skip status before treating them as coverage.

---

## Pre-commit checklist

- Fix M1 (mangled comment + indentation) — non-negotiable before commit.
- Decide on M2 (fix now, or record it explicitly as a known residual risk with
  a test — do **not** commit it silently as "done").
- Update `AGENTS.md` test counts (unit 940, e2e 242) per the living-snapshot
  directive.
- Append the narrative to `exploration/docs/changelog.md`, then reset
  `worklog-current.md`.
- The worklog's own test-count narrative is muddled ("3rd unit-level regression
  test … 6th total"); the diff actually adds **5 unit tests and 2 e2e tests**.
  State the real numbers in the changelog.
- Secrets check: the diff is clean. The worklog references the TEST query
  `credit:"Action Images/Reuters"` — a public credit string, not sensitive.
- No `deviations.md` entry needed — nothing here departs from library or
  Grid/kahuna convention.

---

## What "done" looks like

M1 fixed; M2 either fixed or consciously deferred in writing; M3–M5 fixed or
explicitly deferred with reasoning; `npm --prefix kupua test` green; e2e green
with the two new tests confirmed *run*, not skipped (port 3000 verified free
immediately beforehand); AGENTS.md and changelog updated.
