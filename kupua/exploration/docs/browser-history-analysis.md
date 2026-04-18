# Browser Back/Forward — How History Works

This document describes the current history/navigation architecture in kupua.
For the future scroll-position restoration idea, see the "Future polish" section
at the end.

## Overview

URL is the single source of truth. `useUrlSearchSync` reacts to TanStack Router's
`searchParams` and syncs them into the Zustand store, then fires `search()`.
History entries are created selectively: committed discrete actions (filter toggle,
sort change, date range) push; incremental changes (debounced typing) replace.

## History entry rules

| Action | Push/Replace | Why |
|---|---|---|
| Filter toggle, sort change, date range | **Push** | Discrete committed action — user expects back to undo it |
| Debounced query keystrokes | **Replace** | Intermediate — "c", "ca", "cat" shouldn't each be a back target |
| Open image detail (double-click) | **Push** | Opens overlay — back should close it |
| Close image detail ("← Back" button) | **Replace** | Returns to list at same position |
| Prev/next image in detail (traversal) | **Replace** | Traversal is divorced from history — user doesn't want 50 back-presses |
| Logo → reset to home | **Push** | Intentional "start over" action |
| Default-injection redirect (`/` → `/search`) | **Replace** | Invisible URL normalisation |

The mechanism: `useUpdateSearchParams()` in `useUrlSearchSync.ts` accepts
`options?: { replace?: boolean }` defaulting to `false` (push). Only SearchBar's
debounced `handleQueryChange` passes `{ replace: true }`.

## Popstate detection — user-initiated flag

When browser back/forward fires, `useUrlSearchSync` needs to distinguish it from
user-initiated param changes (where focus preservation / "Never Lost" should apply).

**Mechanism:** A module-level flag in `orchestration/search.ts`:
- `markUserInitiatedNavigation()` — called synchronously in `useUpdateSearchParams()`
  immediately before `navigate()`.
- `consumeUserInitiatedFlag()` — read-and-clear, called in the `useUrlSearchSync`
  effect after the dedup guard passes.

If the flag is `true` → user-initiated → preserve focus (pass `focusedImageId` or
phantom anchor to `search()`).
If `false` (default) → popstate or programmatic → skip focus, set `offset: 0`,
call `search(null)` to reset to the top of the restored context.

**Why not mark popstate instead?** TanStack Router's `onPushPopEvent` handler is
async. A `window.popstate` listener sets the flag synchronously, but by the time
the React effect runs, intermediate no-op effect invocations (hitting the dedup
guard and bailing early) can consume the flag before the effect that actually
processes the param change. Marking user-initiated navigations is synchronous
and happens right before `navigate()`, guaranteeing the flag is present when the
effect runs.

## Case-specific popstate behaviour

**Case A — Back from image detail (same search context):**
User opens image A → traverses to Z → presses back. Only the `image` display-only
key was removed. The `URL_DISPLAY_KEYS` guard in `useUrlSearchSync` skips
re-search for display-only-key-only changes. Focus is preserved. Correct.

**Case B — Back to a different search context:**
User searches "cats", then "dogs", presses back. Search-affecting keys changed.
`consumeUserInitiatedFlag()` returns `false` → `search(null)`, reset to top.
No focus carried from "dogs" into "cats". Correct.

**Case C — Forward re-applies:**
Same mechanism as Case B in reverse. The forward navigation is also a popstate,
so focus is not carried — the new search starts from the top. Correct.

## E2E test coverage

`e2e/local/browser-history.spec.ts` (5 tests):
1. Back restores previous search after sort change
2. Back restores previous search after query change
3. Forward re-applies search after back
4. Focus is NOT carried into old search context on back
5. Back from image detail preserves focused image

All E2E `spaNavigate` helpers call `window.__kupua_markUserNav__` (exposed in
dev mode from `main.tsx`) before `router.navigate()`, so E2E-driven navigations
are treated as user-initiated — matching real user behaviour.

## Key files

- `src/hooks/useUrlSearchSync.ts` — the sync hook; `useUpdateSearchParams()`
  with push/replace option; user-initiated flag read
- `src/lib/orchestration/search.ts` — `markUserInitiatedNavigation()` /
  `consumeUserInitiatedFlag()` at the bottom
- `src/main.tsx` — exposes `__kupua_router__` and `__kupua_markUserNav__` in
  dev mode for E2E
- `src/components/SearchBar.tsx` — `handleQueryChange` passes `{ replace: true }`

---

## Future polish: scroll-position restoration on back/forward

Reset-to-top is the correct minimum for Case B (back to a different search
context). But kupua already has the machinery to do much better:

- `seek()` does random-access to any position in the result set
- `restoreAroundCursor()` reconstructs a buffer around a known sort cursor
  (already used for image detail reload survival)
- `storeImageOffset()` / `getImageOffset()` cache `{ globalOffset, sortCursor }`
  per image in sessionStorage
- `_findAndFocusImage()` locates an image in results and scrolls to it

**Approach:** On push, save `{ focusedImageId, bufferOffset, sortCursor }` into
`history.state` (the browser lets you attach arbitrary data per history entry,
and it survives back/forward). On popstate, read it back, `seek()` to that
position, restore focus.

**Concerns:**
1. **TanStack Router owns `history.state`** — need to verify it allows
   piggybacking custom data (or whether it overwrites). Fallback: a parallel
   `Map<historyEntryId, state>` in memory (loses data on hard reload, but
   hard reload is already a fresh start).
2. **Data staleness** — if images were uploaded between push and pop, the cursor
   position shifts. But sort-around-focus already handles this gracefully (lands
   close, not exact). Same tolerance applies.

Not needed for the initial fix — but a natural follow-up session that reuses
existing infrastructure.

---

## Appendix A: sessionStorage image offset cache — not the culprit

The "image from two days ago" symptom was suspected to involve the
sessionStorage cache (`image-offset-cache.ts`), which stores
`{ offset, cursor, searchKey }` per image ID to survive page reload.

**Verdict: not the cause.** The cache is keyed by `searchKey` (a fingerprint
of query/sort/filters). `getImageOffset()` returns `null` when the search
context doesn't match. The "two days ago" symptom is caused by Problem 2:
focus-preservation passing the current `focusedImageId` into a *different*
search context on popstate, where that image happens to exist deep in the
results at a position that corresponds to content from days ago.

---

## Appendix B: How kahuna handles browser history

Investigated for reference — not to emulate, but to ensure kupua is never worse.

**Routing:** AngularJS `ui-router` (v0.4.3) with `ui-router-extras` Deep State
Redirect. Image detail is a **separate top-level route** (`/images/:imageId`),
not an overlay.

**History entries — kahuna pushes everything:**
- Every filter change (`$state.go('search.results', {...})`) creates a new
  history entry — no `location: 'replace'` is used.
- Clicking an image pushes `/images/:imageId`.
- Result: Back undoes filter changes one by one (uncheck "Has Crops", then
  uncheck "My uploads", etc.). This is technically correct but noisy — many
  meaningless back-presses to undo a multi-filter exploration.

**Back from image to search:** Re-triggers the search API call. The search
controller is destroyed and re-instantiated. DSR (Deep State Redirect) restores
the URL params, so you get the same query/filters — but the DOM is torn down
and rebuilt, so scroll position is lost.

**What kupua does better:**
- Scroll position survives image detail (overlay architecture — search stays mounted)
- No DOM teardown on back
- History entries only for meaningful state changes, not every keystroke
- Position restoration on back (future polish session)

**Parity with kahuna:**
- Back from image detail works (Case A)
- Filter/query/sort changes are navigable via back/forward (Case B)
