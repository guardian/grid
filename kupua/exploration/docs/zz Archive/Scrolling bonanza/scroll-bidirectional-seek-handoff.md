# Handoff: Bidirectional Seek (Idea B) — Eliminate Post-Seek Swimming

> **Status:** ✅ COMPLETE. Implemented by Agents 11-14, verified on TEST (1.3M docs).
> 186 unit, 86 E2E, 24 smoke tests pass. Zero swimming, position preserved.
> See `worklog-bidirectional-seek.md` for session history.
> See `changelog.md` entries for 5 April 2026.
>
> **Follow-up:** "Unify Bidirectional Fetch Helpers" (bottom of this doc) is
> deferred — low priority, mechanical refactor with no behavioural gain.

> **For:** A fresh agent session with no prior context.
> **Date:** 5 April 2026
> **Estimated scope:** One focused session (~2–4 hours).

---

## The Problem You're Solving

After `seek()` delivers data, there's a ~1% visible "swim" — approximately 3
images shift by one cell. It happens during the first `extendBackward` at
~800ms post-seek. It's cosmetic but noticeable. The current approach has been
accepted as "good enough" but we want to try the one promising fix.

### Root cause in one paragraph

`seek()` currently loads 200 items starting at (or near) the target position.
The user sees buffer[0..~15] — the **very top** of the buffer. At ~800ms
(after cooldowns expire), `extendBackward` fires, prepending 200 items
**directly above the visible content**. `useLayoutEffect` compensates
`scrollTop += prependedRows × rowHeight` — but there's a ~1-frame gap
between React's DOM mutation and the compensation. That gap is visible as a
3-image swim.

### Why Idea B should work

If `seek()` loaded ~100 items **before** and ~100 items **after** the target,
the user would see the buffer **middle**. Both `extendBackward` (prepend to
off-screen top) and `extendForward` (append to off-screen bottom) would
operate on content the user can't see. Swimming becomes invisible by
construction — you don't need perfect timing if the mutation zone is off-screen.

### The trade-off

Two ES round-trips instead of one: a forward `search_after` and a backward
`search_after`. Adds ~50–100ms to seek latency. On local ES this is ~10ms;
on real TEST/PROD over SSH tunnel, ~50–100ms. The user already waits 200–500ms
for seek; this makes it 250–600ms. Worth it if swimming disappears.

---

## What You Must Read

Read these files in full before writing any code:

| File | Why |
|---|---|
| `exploration/docs/scroll-architecture.md` | The architecture overview. §4 (swimming) and §5 (deep seek) are essential. |
| `src/constants/tuning.ts` | All timing constants. You'll need to understand the cooldown chain. |
| `src/stores/search-store.ts` lines 1359–2114 | The `seek()` method — the function you're modifying. |
| `src/stores/search-store.ts` lines 682–768 | `_loadBufferAroundImage()` — the **existing** bidirectional fetch helper used by sort-around-focus. This is the pattern you're replicating. |
| `src/hooks/useScrollEffects.ts` lines 304–400 | Effects #4 (prepend compensation) and #6 (seek scroll-to-target). You need to understand what happens *after* `set()` in seek. |
| `e2e/scrubber.spec.ts` lines 309–738 | All the seek-related tests: flash prevention golden table, prepend compensation, post-seek scroll-up, settle-window stability. |

### Don't bother reading

- The aggregation system (`src/dal/es-adapter.ts` agg methods, `src/lib/sort-context.ts`)
- The scrubber component (`src/components/Scrubber.tsx`) — it calls `seek()` but doesn't care how seek works internally
- The metadata/panels code
- Any exploration doc not listed above
- Smoke tests (`e2e/smoke-scroll-stability.spec.ts`) — these are for human-only manual runs against real data. You cannot run them. But yould definitely ask user to run them as they can
- both catch potential issues on real 1.3m docs cluster and as a verifying step.

---

## The Implementation Plan

### Step 1: Create a `_loadBufferAroundOffset()` helper

Model it on the existing `_loadBufferAroundImage()` (lines 682–768), but
instead of centering on a known image hit + sort values, center on a
**cursor discovered by the seek's estimation paths**.

The logic:
1. The seek estimation paths (percentile, keyword composite, null-zone) already
   produce a cursor and `actualOffset` — the exact position where we landed.
2. Currently, `seek()` uses that cursor as the buffer start (forward fetch only).
3. Instead: use the cursor as the **center point**. Do two `search_after` calls:
   - **Forward:** `search_after(cursor, length: PAGE_SIZE/2)` — items after the cursor.
   - **Backward:** `search_after(cursor, length: PAGE_SIZE/2, reverse: true)` — items before.
4. Combine: `[...backward_hits, ...forward_hits]`.
5. `actualOffset` = landed position − backward hits count.

**Key detail:** `_loadBufferAroundImage` takes a `targetHit` (the image itself)
and splices it into the middle. You don't have a target hit — you have a cursor
position. Your helper can skip the target-hit splice. The combined buffer is
just backward + forward.

### Step 2: Wire into `seek()`

The modification points in `seek()`:

**Shallow path (line ~1422–1431):** Already uses `from/size` with
`fetchStart = max(0, clampedOffset - halfBuffer)`. This path already
effectively centers the buffer. **No change needed** — `from/size` returns a
window starting at `fetchStart`, so the target is in the middle.

**Deep percentile path (line ~1712–1737):** After `search_after` returns
`result` and `countBefore` gives `actualOffset` — instead of using `result`
directly, use the landed cursor (`result.sortValues[0]`) to do the
bidirectional fetch. Replace the single forward fetch with two fetches
(forward + backward from the cursor).

**Deep keyword path (line ~1764–1899):** Same pattern — after convergence
(either via composite agg or binary search refinement), the final
`search_after` at the best cursor can be replaced with a bidirectional fetch.

**End-key fast path (line ~1407–1421):** No change needed. Reverse
`search_after(null)` already gets the last PAGE_SIZE items. The user wants to
be at the bottom — no swimming concern.

**Null-zone path (line ~1498–1683):** Same bidirectional pattern. After the
filtered `search_after` and `countBefore`, split into forward + backward.

### Step 3: Adjust `_seekTargetLocalIndex` (the reverse-compute)

Currently (lines 1987–2066), `seek()` reverse-computes a `scrollTargetIndex`
from the user's current `scrollTop`. This index is **buffer-local** — it tells
effect #6 where to position the virtualiser.

With bidirectional seek, the buffer no longer starts at `actualOffset` — it
starts at `actualOffset - backwardHits.length`. The reverse-compute is
relative to the buffer, so it still works: the user's `scrollTop` maps to a
local index in the buffer middle (where the target position is). No change
needed to the reverse-compute math itself — but verify that the buffer is
long enough that the reverse-compute index falls within bounds.

**Edge case — near the start:** If `clampedOffset < PAGE_SIZE/2`, the backward
fetch returns fewer items (or zero — we're near the start). `actualOffset`
adjustment must handle this: `bufferStart = max(0, actualOffset - backwardHits.length)`.

**Edge case — near the end:** The symmetric end-of-index case is already
handled: the End-key fast path (line ~1407) fires whenever
`clampedOffset + PAGE_SIZE >= total`, which covers any seek close enough to
the end that the forward half-fetch would be short. No additional end-edge
handling is needed in the bidirectional helper.

### Step 4: Do NOT reduce the timing chain

It's tempting to think: "if extends now operate off-screen, the cooldown
is unnecessary." **Wrong.** The 700ms cooldown serves a second purpose
beyond swim prevention: it blocks extends while the virtualizer settles
after seek. During the first ~300ms after `set()`, the virtualizer
re-renders, the spacer div's height changes, and the browser fires
transient scroll events. If `reportVisibleRange` runs during that window,
it computes inaccurate `startIndex`/`endIndex` → extends fire with wrong
parameters → buffer corruption. The deferred scroll at 800ms
(`SEEK_COOLDOWN_MS + 100ms`) ensures the first `reportVisibleRange` call
sees a stable layout.

**Do not change SEEK_COOLDOWN_MS or SEEK_DEFERRED_SCROLL_MS.** If a future
session wants to tune them down for snappier UX, that's a separate,
carefully measured experiment. Note that their temporal relationship
(`SEEK_DEFERRED_SCROLL_MS = SEEK_COOLDOWN_MS + 100`) is already enforced
in `tuning.ts`, so lowering one lowers both — but the risk is that the
virtualizer hasn't finished its layout pass within the shortened window.
Faster CPUs tolerate shorter cooldowns; slow CI machines may not. Any
tuning would need perf experiments across environments and should be done
after bidirectional seek is stable and committed.

### Step 5: Validate

Run `npm test` (unit+integration). Then ask the user to stop any dev server
on port 3000 and run `npx playwright test`.

---

## Test Adjustments

The existing E2E tests are thorough and will catch regressions. Here's what
each test group exercises and how bidirectional seek affects it:

### `scrubber.spec.ts` — Flash prevention golden table (line 338)

**What it tests:** After seek, `scrollTop` delta is exactly 0. Verifies the
reverse-compute algorithm.

**Expected impact:** Should still pass with zero delta. The reverse-compute
works on the buffer as-is — a larger buffer with the target in the middle
still produces the same `scrollTargetIndex` from `scrollTop`. **If this
breaks:** the buffer's local index math changed. Check that
`clampedOffset - actualOffset` still maps correctly when `actualOffset`
accounts for backward hits.

### `scrubber.spec.ts` — Prepend compensation (line 394)

**What it tests:** After seek + 1500ms settle, buffer has grown (extends
fired) and `scrollTop` increased (compensation ran).

**This test WILL FAIL. Here's why:**

With bidirectional seek at 50% of ~10k docs, the buffer has ~100 items
before and ~100 after the target. The viewport starts at local index ~100.
When the deferred scroll fires at 800ms, `reportVisibleRange` computes:
- `startIndex ≈ 100 > EXTEND_THRESHOLD (50)` → **no backward extend**
- `endIndex ≈ 115 < 200 - 50 = 150` → **no forward extend**

Neither extend fires within the 1500ms wait. The buffer stays at 200
items. The assertion `storeAfter.resultsLength > storeBefore.resultsLength`
**fails**.

**This is correct behaviour** — the whole point of bidirectional seek is
that extends don't fire immediately. The test's premise is obsolete.

**Fix:** Rewrite this test to verify what bidirectional seek actually
guarantees:
1. Buffer has content in both directions: `bufferOffset > 0` AND
   `bufferOffset + resultsLength < total`.
2. No swimming occurred during settle (the settle-window stability test
   already covers this, but a quick `firstVisibleGlobalPos` stability
   check here is fine).
3. Remove the `resultsLength grew` and `scrollTop increased` assertions.

The scroll-up tests (below) already verify that extends work when the user
scrolls. This test should verify the post-seek *resting state*, not extend
mechanics.

### `scrubber.spec.ts` — Post-seek scroll-up (line 446)

**What it tests:** After seek to 50%, user can scroll up. Proves
`extendBackward` isn't suppressed.

**This test's `bufferOffset` assertion WILL FAIL. Here's the math:**

With bidirectional seek, the buffer has ~100 items before the viewport.
The test does 5 wheel events × -200px = -1000px upward scroll. With
`GRID_ROW_HEIGHT = 303`, that's ~3.3 rows × ~5 cols ≈ 16 items. The
viewport starts at local index ~100. After scrolling up 16 items,
`startIndex ≈ 84`. This is still > `EXTEND_THRESHOLD` (50), so
`extendBackward` **does not fire**. The assertion
`storeAfterScroll.bufferOffset < storeAfterSeek.bufferOffset` fails.

**Fix (do both):**
1. Increase wheel events from 5 to ~20 (enough to scroll ~65+ items past
   the threshold: 20 × 200px = 4000px ÷ 303 × 5 cols ≈ 66 items). Add a
   comment explaining the headroom.
2. Keep the `bufferOffset` assertion — it tests something real (backward
   extend actually fires when the user scrolls far enough).
3. The `scrollAfter < scrollBefore` assertion is fine as-is — the user
   physically scrolls up regardless of whether `extendBackward` fires.

### `scrubber.spec.ts` — Table view scroll-up (line 498)

**Same headroom issue** but in table view. Table has 1 column and
`TABLE_ROW_HEIGHT = 32`, so 5 × -200px = -1000px ÷ 32 ≈ 31 items
scrolled up. Starting at local index ~100, that brings `startIndex` to
~69, still > `EXTEND_THRESHOLD` (50). Need ~16 wheel events
(16 × 200 ÷ 32 ≈ 100 items → `startIndex` ≈ 0). Same fix: increase wheel
events, keep both assertions.

### `scrubber.spec.ts` — Double-seek scroll-up (line 539)

**Same pattern.** The second seek at 70% produces a bidirectional buffer
with ~100 items of headroom. Same wheel-event increase needed. Note:
this test doesn't assert `bufferOffset` decreased (only `scrollAfter <
scrollBefore`), so it **might pass as-is** — verify.

### `scrubber.spec.ts` — Settle-window stability (line 642)

**What it tests:** Polls `firstVisibleGlobalPos` every 50ms for 1500ms after
seek. Max content shift must be ≤ `COLS + 1` items.

**Expected impact:** This is the test that most directly measures swimming.
With bidirectional seek, the first `extendBackward` prepends to off-screen
content. **Content shift should drop to 0.** You might be able to tighten
`MAX_SHIFT` from `COLS + 1` to 0 or 1. Don't tighten it in the first pass —
just verify the shift decreased.

### `buffer-corruption.spec.ts`

**What it tests:** Logo click after deep seek returns to clean state. Nine
scenarios: grid, table, detail, metadata click, text search, sort change,
rapid seeks, sort toggle.

**Expected impact:** None of these tests care about swimming — they test
that the buffer is in a valid state after transitions. Bidirectional seek
doesn't change the post-seek state shape (same `results`, `bufferOffset`,
cursors). **Should pass unchanged.**

---

## Traps and Pitfalls

### 1. Don't break the End-key fast path

The end-key path (line ~1407) does a **single reverse search_after** to get
the last PAGE_SIZE items. Don't wrap this in bidirectional logic — there's
nothing beyond the end to fetch forward from. The user wants to be at the
absolute bottom.

### 2. Null-zone cursor remapping

When the sort field has nulls (e.g. `dateTaken`), cursors go through
`detectNullZoneCursor` / `remapNullZoneSortValues`. The backward
`search_after` in your bidirectional helper **must use the same null-zone
logic** as the forward fetch. Look at how `_loadBufferAroundImage` handles
this (lines 692–735) — it does `nz.strippedCursor` and remaps both forward
and backward results.

### 3. `countBefore` must account for backward hits

Currently, `actualOffset` comes from `countBefore` (the position of the first
hit in the forward-only fetch). With bidirectional fetch, the buffer starts at
`actualOffset - backwardHits.length`. Make sure `bufferOffset` is set to
`max(0, actualOffset - backwardHits.length)`, not to `actualOffset`.

### 4. Cursors: start and end

`startCursor` must come from `backwardResult.sortValues[0]` (the earliest
item). `endCursor` from `forwardResult.sortValues[last]` (the latest). If
the backward fetch returns 0 items (we're at the very start), `startCursor`
comes from the forward result's first sort values instead.

### 5. The signal/abort pattern

Every async operation in `seek()` checks `signal.aborted` before proceeding.
Your backward `search_after` must also check `if (signal.aborted) return;`
between the forward and backward fetches. Copy the pattern from
`_loadBufferAroundImage` (lines 707, 721).

### 6. PIT generation check

The `effectivePitId` is computed once at the start of `seek()`. Use the same
one for both forward and backward fetches. Don't re-read `get()._pitGeneration`
between the two — a concurrent `search()` might have opened a new PIT.

### 7. Performance: parallelise the two fetches

The forward and backward `search_after` calls are independent. Fire them
with `Promise.all` for minimum latency:

```typescript
const [forwardResult, backwardResult] = await Promise.all([
  dataSource.searchAfter({ ...params, length: halfPage }, cursor, pitId, signal),
  dataSource.searchAfter({ ...params, length: halfPage }, cursor, pitId, signal, true /* reverse */),
]);
```

This keeps the latency overhead to ~0ms (parallel) instead of ~50–100ms
(sequential).

### 8. Null-zone seek path uses locally-constructed sort/filter

The null-zone path (line ~1498–1683) doesn't use `detectNullZoneCursor`
like `_loadBufferAroundImage` and the extend paths do. Instead, it builds
its own `nullZoneSort` and `nullZoneFilter` variables locally:

```typescript
const nullZoneSort = [{ uploadTime: nullZoneUploadDir }, { id: "asc" }];
const nullZoneFilter = { bool: { must_not: { exists: { field: primaryField! } } } };
```

The backward `searchAfter` in the bidirectional fetch for this path **must
use these same local variables** as `sortOverride` and `extraFilter`. If
you pass them through the shared helper (or inline the bidirectional
logic), make sure `nullZoneSort` and `nullZoneFilter` are threaded into
the backward call — not the default sort clause.

### 9. Consider keeping the existing forward fetch

The percentile and keyword paths already do a full forward `searchAfter`
(PAGE_SIZE = 200 items) to find where they landed. The handoff's Step 1
says to replace this with two half-page fetches (100 + 100). An
alternative: **keep the existing full forward fetch and add one backward
fetch**. This gives ~300 items (200 forward + 100 backward) — more
headroom in both directions, with only 1 extra ES call instead of
replacing 1 with 2.

**Pros:** More data in the buffer (300 vs 200) → user can scroll further
before any extend fires → even more headroom above the viewport. The
forward data is already being fetched — you're not throwing it away and
re-fetching half of it.

**Cons:** The buffer starts at 300 items instead of 200. This is well
within `BUFFER_CAPACITY` (1000) — no eviction triggered. The only
difference is slightly higher memory and a larger initial render
(TanStack Virtual handles this efficiently — it only renders visible rows
regardless of total count). No fundamental issues.

**Recommendation:** Try this approach first. If it works (and tests show
it does), you get better headroom for free. If it causes unexpected
issues, fall back to the 100+100 split.

---

## What Success Looks Like

1. All 9 buffer-corruption tests pass.
2. All flash-prevention golden table cases pass with 0px drift.
3. Settle-window stability shows max content shift of 0–1 items (down from
   COLS+1 currently).
4. Post-seek scroll-up tests pass (with any necessary assertion adjustments
   for the headroom change).
5. `npm test` passes.
6. Tell the user to run smoke tests S14 and S15 on TEST to confirm zero
   swimming on real data: `node scripts/run-smoke.mjs 14 15`.

---

## Files You'll Edit

| File | Change |
|---|---|
| `src/stores/search-store.ts` | Modify `seek()` to use bidirectional fetch for deep paths. Optionally extract a `_loadBufferAroundOffset()` helper. |
| `e2e/scrubber.spec.ts` | Adjust assertions in prepend-compensation and scroll-up tests to account for buffer headroom. |

You should **not** need to touch `useScrollEffects.ts`, `tuning.ts`,
`Scrubber.tsx`, `es-adapter.ts`, or any other file. The change is entirely
within the store's `seek()` method and the tests that verify its behaviour.

---

## Follow-up: Unify Bidirectional Fetch Helpers (Do NOT Do This Now)

After Idea B lands and all tests pass, there's a clean refactor opportunity.
**Do it in a separate session, not as part of this work.** Mixing structural
refactoring with behavioural change makes regressions harder to bisect.

### The duplication

`_loadBufferAroundImage()` (lines 682–768, used by sort-around-focus) and the
new bidirectional logic in `seek()` share ~70% of their code:

1. Detect null-zone cursor via `detectNullZoneCursor()`
2. Forward `searchAfter` with null-zone sort/filter overrides
3. Backward `searchAfter` (reversed) with same overrides
4. `remapNullZoneSortValues` on both results
5. Combine hits, compute `bufferStart`, assemble `startCursor`/`endCursor`

The only difference: `_loadBufferAroundImage` has a **target hit** (a specific
image) that it splices into the middle of the combined buffer (`[...backward,
targetHit, ...forward]`), because `search_after` is exclusive — the cursor
document isn't in either result set. The new seek helper has no target hit —
the cursor is a position estimate, not a specific document.

### The refactor

Extract a shared `_bidirectionalFetch()` helper with an optional `targetHit`
parameter:

```typescript
async function _bidirectionalFetch(
  cursor: SortValues,
  exactOffset: number,
  params: SearchParams,
  pitId: string | null,
  signal: AbortSignal,
  dataSource: SearchState["dataSource"],
  targetHit?: Image,          // only provided by sort-around-focus
  sortOverride?: Record<string, unknown>[],   // null-zone custom sort
  extraFilter?: Record<string, unknown>,      // null-zone "must_not exists" filter
): Promise<BidirectionalResult | null>
```

- When `targetHit` is provided: combined = `[...backward, targetHit, ...forward]`
- When omitted: combined = `[...backward, ...forward]`

Both `_loadBufferAroundImage` and the seek bidirectional path become thin
wrappers (or disappear entirely).

### Why not now

1. **Different risk profiles.** Idea B changes *what data* `seek()` loads.
   The refactor changes *how the code is structured*. Mixing them means a
   test failure could be either the new behaviour or the restructuring.

2. **`_loadBufferAroundImage` is stable.** It's used by sort-around-focus,
   which works perfectly. Refactoring it risks touching a proven path for
   zero behavioural gain.

3. **Trivially safe after Idea B.** Once bidirectional seek works, both call
   sites have identical fetch logic side by side. Extracting the common
   skeleton is mechanical — 20 minutes, zero behavioural change, easy to
   verify.

### Why not combine ES requests

ES's `search_after` API is one-directional per request — there's no
"give me N items in each direction" mode. To go both ways you need two
queries with reversed sort clauses. ES does offer `_msearch` (multi-search:
multiple query bodies in one HTTP request), but:

- `Promise.all` with two separate fetches already parallelises the HTTP
  round-trips. Wall-clock time = max(forward, backward). The savings from
  `_msearch` would be eliminating one TCP round-trip (~1–3ms local, ~10–20ms
  over SSH tunnel).
- `_msearch` doesn't exist in `es-adapter.ts` today. Adding it means new
  HTTP plumbing, new response parsing, new error handling for partial
  failures (one sub-query fails, other succeeds), and different PIT
  keep-alive semantics (two sub-responses may return different `pit_id`
  values).
- Abort semantics differ: `Promise.all` + `AbortSignal` cancels both
  in-flight `fetch()` calls independently; `_msearch` is a single request
  where abort loses both results.

**Verdict:** `Promise.all` with two `searchAfter` calls is the right
approach. The ~10ms theoretical saving from `_msearch` doesn't justify the
complexity.

---

## One More Thing

After completing, update `kupua/AGENTS.md` (What's Done / Key Architecture
Decisions) and append the implementation narrative to
`exploration/docs/changelog.md`. See the directive in
`.github/copilot-instructions.md`.

Also update `exploration/docs/scroll-architecture.md` §3 "Deep seek" step 4:
it currently says `search_after` fetches 200 items "starting there" (forward
only). After bidirectional seek lands, this should describe the
forward + backward pattern.


