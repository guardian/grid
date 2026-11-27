# Home Logo Flash — Handoff for Next Agent

## The Problem

Clicking the Home logo from a deep-seeked **table** view produces three visual
states instead of two:

1. **Table at deep position** (correct — source state)
2. **Grid showing wrong images from deep offset** (BUG — ~50-200ms flash)
3. **Grid at top with correct first-page data** (correct — destination state)

State 2 must be eliminated. The user must see only: source → destination.

This is the same class of problem that 16 prior agents solved for every other
transition (seek, Home key, sort, density switch). The Home logo is the last
remaining case.

## Why It Happens — Exact Timeline

The Home logo is a `<Link>` in `SearchBar.tsx` (line 86-96):

```tsx
<Link
  to="/search"
  search={{ nonFree: "true" }}
  onClick={() => { resetToHome(); }}
>
```

When clicked, two things happen in the same browser event:

### Step 1: `resetToHome()` runs synchronously (in onClick)

```
resetSearchSync()                    — clears URL sync dedup
setFocusedImageId(null)              — clears focus
clearDensityFocusRatio()             — clears density-focus save
resetScrollAndFocusSearch()          — aborts extends, does NOT reset scrollTop
                                       (bufferOffset > 0 → deferred to effect #8)
store.setParams({ query: undefined, offset: 0 })
store.search()                       — ASYNC: fires ES request, returns Promise
```

At this point the store still has the old deep-offset buffer (bufferOffset ~5000,
results = 200 items from deep in the dataset). The search is in-flight.

### Step 2: `<Link>` navigation fires (same event, after onClick)

URL changes from `/search?...&density=table&...` to `/search?nonFree=true`.

- `density` param disappears → `isGrid = density !== "table"` → `true`
- React re-renders: **table unmounts, grid mounts**
- Grid mounts with the stale deep-offset buffer
- Grid renders at `scrollTop=0` → shows `buffer[0]` = image at position ~5000
- **THIS IS THE FLASH** (state 2)

### Step 3: `search()` completes (~50-200ms later)

- New results arrive, store sets `bufferOffset: 0, results: [fresh page 1 data]`
- Effect #8 (BufferOffset→0 guard) fires: resets `scrollTop = 0`
- Grid now shows correct first-page content (state 3)

## The Constraint

**Exactly two visual states.** No loading screen, no empty state, no opacity-0
transition, no skeleton. The old content stays visible until the new content is
ready, then they swap atomically in one render frame. This is how every other
transition in kupua works (seek, Home key, sort-around-focus), and the Home logo
must work the same way.

## Why the Home Key Doesn't Have This Problem

The Home key handler in `useListNavigation.ts` (line 299-321) calls `seek(0)` when
`bufferOffset > 0`. It does NOT switch density. The table stays mounted, showing its
deep-offset content. When `seek(0)` returns, effect #8 atomically swaps the buffer
and resets scroll. Two states.

The Home logo is different because it navigates via `<Link>`, which changes the URL
(dropping `density=table`), which triggers a density switch, which unmounts the table
and mounts the grid — all synchronously, before the search data arrives.

## Files to Read

| File | Why |
|---|---|
| `src/lib/reset-to-home.ts` | The `resetToHome()` function — all imperative state clearing |
| `src/components/SearchBar.tsx:86-96` | The `<Link>` with `onClick` — where navigation + reset collide |
| `src/lib/orchestration/search.ts:139-175` | `resetScrollAndFocusSearch()` — the two-branch scroll reset |
| `src/hooks/useScrollEffects.ts:488-519` | Effect #8 — BufferOffset→0 guard (the atomic swap mechanism) |
| `src/hooks/useScrollEffects.ts:555-713` | Effect #10 — density-focus save/restore (the mechanism already neutralised by fix #2) |
| `src/hooks/useListNavigation.ts:299-321` | Home key handler — the correct two-state pattern to emulate |
| `src/routes/search.tsx:47-49,179` | `isGrid` derivation + conditional rendering of Grid vs Table |
| `src/stores/search-store.ts:1082-1195` | `search()` — the async data fetch |

## Approaches Considered

### A. Prevent `<Link>` navigation, do everything imperatively
`e.preventDefault()` in onClick. `resetToHome()` fires search, waits for
completion, then navigates programmatically. Table stays visible during fetch.

**Pro:** Clean two-state: table at deep → grid at top.
**Con:** ~50-200ms delay between click and any visible change. User might think
the button is broken. Also requires awaiting `search()` which currently returns
void (the store action is fire-and-forget).

### B. Navigate without changing density, change density after data arrives
The `<Link>` navigates to `/search?nonFree=true&density=table` (preserving current
density). `resetToHome()` fires search. When search completes (effect #8 fires or
a new mechanism), THEN programmatically update the URL to drop `density`. The table
shows old → table shows new at top → grid at top, but the last two happen in the
same frame if batched correctly.

**Pro:** No delay — the table immediately starts transitioning.
**Con:** Two URL updates. The density switch still happens after data arrives, so
the transition is: table-deep → table-top → grid-top. If the last two steps render
in the same frame, the user sees two states. If not, three.

### C. Synchronously swap buffer before navigation
In `resetToHome()`, synchronously set the store to `{ results: [], bufferOffset: 0,
total: 0 }` before the `<Link>` fires. Grid mounts with empty buffer = renders
zero rows = background colour only.

**Pro:** Simple code change.
**Con:** Third state (empty background) visible for 50-200ms. Rejected by user.

### D. Don't unmount table during the transition
Instead of conditionally rendering `{isGrid ? <ImageGrid /> : <ImageTable />}`,
always mount both but hide the inactive one (like ImageDetail uses `opacity-0`).
The table stays visible (even though it's "the grid view" by URL), effect #8 fires
on the table, then... the table is still showing. The density switch would need to
happen after the data arrives, bringing us back to approach B's timing problem.

**Pro:** The table literally never unmounts during go-home.
**Con:** Major architecture change (always-mounted views). Performance cost of
keeping both virtualizers alive. The density switch still needs careful timing.

### E. Make search() synchronous for the go-home path
If local ES is fast enough (~5ms), the search could complete within the same
microtask. Use `queueMicrotask` or `Promise.resolve()` to batch the search
completion with the Link navigation.

**Pro:** If it works, zero architectural change.
**Con:** ES fetches are inherently async (network). Even local ES takes ~5-50ms.
Doesn't work.

### F. Keep both views mounted but use CSS containment to prevent layout
Mount both Grid and Table always. Use `content-visibility: hidden` (not
`display: none` — that destroys scroll state) on the inactive one. Switch
visibility atomically with the data swap.

**Pro:** No unmount/mount cycle. The grid is already rendered (off-screen) with
its own scroll position.
**Con:** Double virtualizer cost. Complex state management (which view is
"active"?). Significant architecture change.

### G. (Unexplored) React `startTransition` or `useDeferredValue`
React 18/19 concurrent features can defer non-urgent updates. If the density
switch is wrapped in `startTransition`, React might keep the old UI (table)
visible until the new UI (grid with fresh data) is ready to commit.

**Pro:** This is literally what concurrent React was designed for.
**Con:** Needs investigation. May not work with TanStack Router's navigation
model. May require Suspense boundaries. The store update from `search()` would
need to be the "completing" signal.

### H. (Unexplored) Intercept at the route level
TanStack Router has `beforeLoad` / `loader` hooks that can delay navigation
until data is ready. If the search route's loader awaited the search result,
the old view would stay mounted until the new data is ready.

**Pro:** Works with the router's model, not against it.
**Con:** Needs investigation. May not apply to same-route navigation (the path
doesn't change, only search params). Would slow down ALL navigations to /search.

## Recommendation

Start with **G** (startTransition). It's the React-native solution to exactly
this problem: "keep the old UI visible until the new one is ready." If the density
switch in `search.tsx` (line 179: `{isGrid ? <ImageGrid /> : <ImageTable />}`)
is triggered by a state update wrapped in `startTransition`, React will continue
showing the table until the grid has committed with fresh data. The key question
is whether TanStack Router's URL-driven re-render can be deferred this way —
Router controls `searchParams`, which drives `isGrid`, which drives the
conditional render.

If G doesn't work, **A** is the brute-force fallback: prevent navigation, await
search, navigate programmatically. The delay is the search round-trip (50-200ms
local, possibly more on real ES), which may be acceptable since the user just
clicked a "reset everything" button.

**B** is worth exploring if A's delay feels too long — the table can start its
own transition immediately while the density switch waits for data.

## What's Already Fixed (Don't Break These)

1. **Fix #1:** Eager scroll reset when `bufferOffset===0` in
   `resetScrollAndFocusSearch()` — handles the shallow-scroll Home logo case.
2. **Fix #2:** `resetToHome()` clears `focusedImageId` and density-focus state
   before navigation — prevents effect #10 from restoring stale scroll position.
3. **Home key two-branch pattern:** `seek(0)` when deep, eager scroll when
   shallow. The gold standard for flash-free transitions.
4. **Effect #8:** BufferOffset→0 guard — the atomic data-swap + scroll-reset
   mechanism. This is the workhorse; any solution should use it, not bypass it.

## Test Coverage

- 203 unit tests, 90 E2E tests — all passing.
- Buffer corruption tests (1-12) cover Home logo from deep seek.
- BUT: no test currently catches the flash (state 2). The flash is ~50-200ms
  of wrong content between density switch and search completion. A test would
  need to: seek deep in table → click Home → capture what the grid renders on
  its first frame → assert it's correct first-page content (or assert the table
  stays visible until correct content is ready).
- The agent should write this test FIRST (red), then make it green.

