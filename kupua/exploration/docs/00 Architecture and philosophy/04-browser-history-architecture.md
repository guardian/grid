# Browser Back/Forward — Architecture

This document describes the history/navigation architecture in kupua:
how entries are created, how popstate is detected, how per-entry position
snapshots capture and restore scroll position, and how per-entry identity
(`kupuaKey`) ties it all together.

## Overview

URL is the single source of truth. `useUrlSearchSync` reacts to TanStack Router's
`searchParams` and syncs them into the Zustand store, then fires `search()`.
History entries are created selectively: committed discrete actions (filter toggle,
sort change, date range) push; incremental changes (debounced typing) replace.

On popstate (browser back/forward), the system looks up a per-entry snapshot keyed
by `kupuaKey` and restores the user's scroll position and focused image via the
existing sort-around-focus infrastructure. On reload, a `pagehide` handler persists
the snapshot to `sessionStorage` so the same restore path fires on mount.

## Guiding philosophy

**History should let the user traverse all *useful* views.** A useful view is
one the user could conceivably want to return to — a search context, a
density choice, an opened image. App-chrome state (left/right panel
visibility, hover states, in-progress text input) is not a useful view
and is deliberately divorced from history.

Concretely, this gives:

- **Push** when the action commits a new useful view: filter toggle, sort
  change, date range, density toggle, opening an image, completed query.
- **Replace** when the action is intermediate or undoes itself naturally:
  debounced typing, image traversal, default-injection redirect.
- **Outside history entirely** for app chrome: panel toggles, hover,
  in-progress text input.

**Continuous content-state — scroll, focus movement, search query typing (debounce), traversal — is also
outside history step-by-step**, but its endpoints (where the user *was*
when they made the next committed move) are useful and snapshot-worthy.
We don't push an entry per letter, scroll-tick or focus-arrow-key, but the
position/focus at the moment of the next push is exactly what
position-preservation captures and restores. Same shape applies to all
three: ignore the journey, remember the start and finish.

**History adheres to Kupua’s Never Lost philosophy** offering position preservation between states.

When in doubt, the test is: *would a user pressing back here be surprised
to land on this state, or relieved to find it preserved?* Surprised → not
useful, don't push. Relieved → useful, push.

## History entry rules

| Action | Push/Replace | Marks user-initiated? | Goes through `useUpdateSearchParams`? | Why |
|---|---|---|---|---|
| Filter toggle, sort change, date range | **Push** | Yes | Yes | Discrete committed action — back undoes it |
| Debounced query keystrokes | **Push** (first keystroke) then **Replace** (subsequent) | Yes | Yes (`{ replace: true }`) | First keystroke of a new typing session pushes the pre-edit URL via `history.pushState`, committing the previous context as a back target. Subsequent keystrokes within the debounce window replace. |
| Density toggle (grid ↔ table) | **Push** | Yes | Yes | Display-only key; URL_DISPLAY_KEYS skips re-search but history still grows. Deliberate — density is a useful view. |
| Open image detail (click / double-click) | **Push** | Yes (via `pushNavigate`) | No — `pushNavigate()` from `ImageGrid` / `ImageTable` | Display-only `image` key; effect bails on dedup, but marking is belt-and-braces. |
| Close image detail (all affordances) | **history.back()** | Yes (inline `markUserInitiatedNavigation`) | No — `history.back()` in `ImageDetail.closeDetail` | Pops the detail entry; forward re-opens detail. On cold loads (paste/bookmark/reload), deep-link synthesis on mount inserts a bare-list entry so `history.back()` stays inside kupua. Skipped for SPA-entered detail (flag guard). |
| Prev/next image in detail (traversal) | **Replace** | **No** | No — raw `navigate()` from `useImageTraversal.onNavigate` | Traversal is divorced from history — user doesn't want 50 back-presses. |
| Logo → reset to home | **Push** | **No** (via `pushNavigateAsPopstate`) | No — `pushNavigateAsPopstate()` after `resetToHome()` | Explicit opt-out from marking. Popstate semantics reset to top with no focus carry — desired "start over" behaviour. |
| Default-injection redirect (`/` → `/search`) | **Replace** | No (one-off mount) | No — direct `navigate()` in `useUrlSearchSync` | Invisible URL normalisation. |

The mechanism: `useUpdateSearchParams()` in `useUrlSearchSync.ts` accepts
`options?: { replace?: boolean }` defaulting to `false` (push). Only SearchBar's
debounced `handleQueryChange` passes `{ replace: true }`.

### Debounced query — history session grouping

The "push on first keystroke" logic uses the search debounce timer
(`_debounceTimerId`) as the typing-session boundary: when the timer is null
(i.e. the previous 300ms debounce has elapsed or this is the first keystroke),
we treat it as the start of a new typing session and push the pre-edit URL.

The **history session timer and the search debounce timer are the same 300ms
value**. A two-timer approach (300ms search / ~1500ms history) was considered
and rejected: every pushed entry is a query that actually fired and produced
results; slow typers (>300ms between keystrokes) get extra entries, but each
is a valid settled query. Kahuna uses the same "push every settled query"
granularity at 500ms with no user complaints. If slow-typer granularity
becomes a real issue, a second `_historySessionTimerId` is a clean upgrade.

### Push-navigate helpers

All push-navigate sites explicitly declare their intent:

- `pushNavigate()` — the default. Calls `markUserInitiatedNavigation()` +
  `markPushSnapshot()` then `navigate()`. Used by: enterDetail (grid + table).
- `pushNavigateAsPopstate()` — the exception. Calls `navigate()` without marking
  or capturing. Used only by: logo-reset (SearchBar + ImageDetail).
- `closeDetail` — uses inline `markUserInitiatedNavigation()` + `history.back()`.
- Replace-only sites (`traversal-onNavigate`, `default-injection`) stay raw.
- `useUpdateSearchParams()` — the golden path. Marks + captures internally.

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
If `false` (default) → popstate or programmatic → look up snapshot and restore
position, or fall back to reset-to-top.

**Why not mark popstate instead?** TanStack Router's `onPushPopEvent` handler is
async. A `window.popstate` listener sets the flag synchronously, but by the time
the React effect runs, intermediate no-op effect invocations (hitting the dedup
guard and bailing early) can consume the flag before the effect that actually
processes the param change. Marking user-initiated navigations is synchronous
and happens right before `navigate()`, guaranteeing the flag is present when the
effect runs.

## Per-entry identity — kupuaKey

Each history entry carries a unique `kupuaKey` (UUID) in `history.state`.

**Why not TSR's `state.key`.** `@tanstack/history` mints a fresh `state.key`
on **every** navigation, including `replace`. Any replace-only navigation
(traversal, debounced-typing follow-up keystrokes, default-injection redirect)
would change the key, and the snapshot lookup on later popstate would miss.

**How kupuaKey works.** Minted on push, carried forward on replace:

- `pushNavigate` and the push branch of `useUpdateSearchParams` mint a fresh key.
- The replace branch reads `window.history.state.kupuaKey` and re-passes it.
- All replace sites (traversal, default-injection) re-pass via `withCurrentKupuaKey()`.
- `getCurrentKupuaKey()` reads `window.history.state` (not TSR's internal copy)
  because cold-load synthesis uses raw `replaceState` which TSR doesn't track.
- On cold load (no key yet), `synthesiseKupuaKeyIfAbsent()` mints one via
  `replaceState` on first mount.

Implementation: `src/lib/orchestration/history-key.ts`.

## Snapshot system — position preservation across history

### Snapshot shape

```ts
interface HistorySnapshot {
  searchKey: string;                    // buildSearchKey fingerprint at capture time
  anchorImageId: string | null;         // per anchor-priority rule
  anchorIsPhantom: boolean;             // true if anchor is viewport-centre, not explicit focus
  anchorCursor: SortValues | null;      // ES sort cursor of the anchor image
  anchorOffset: number;                 // global offset at capture time
  viewportRatio: number | null;         // (rowTop - scrollTop) / clientHeight
}
```

### Anchor selection

| Mode | Anchor |
|---|---|
| Click-to-focus | Focused image (falls back to viewport-centre if no focus) |
| Click-to-open | Viewport-centre image (phantom anchor — no focus ring) |

In click-to-focus mode, the explicitly focused image is the anchor because it
represents what the user was working with. `anchorIsPhantom` tracks whether the
anchor came from `getViewportAnchorId()` (viewport centre) rather than explicit
focus, so the restore path can avoid promoting it to a visible focus ring.

### Storage — `snapshotStore`

```ts
interface SnapshotStore {
  get(key: string): HistorySnapshot | undefined;
  set(key: string, snap: HistorySnapshot): void;
  delete(key: string): void;
}
```

Two implementations, selected by `PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD` (default ON):

- **`MapSnapshotStore`** — in-memory, LRU-capped. Survives bfcache. Dies on reload.
- **`SessionStorageSnapshotStore`** — keys under `kupua:histSnap:<kupuaKey>`.
  Survives reload. Per-tab scope. LRU-capped. `kupuaKey` lives in `history.state`
  which the browser persists per entry, so the lookup key is stable across reload.

Call sites are oblivious to which is in use.

### Capture

Snapshots are captured at two points:

1. **On push** — `markPushSnapshot()` fires inside `useUpdateSearchParams` and
   `pushNavigate`, immediately before `navigate()`. The store still shows pre-edit
   state at this point — load-bearing for debounced typing (the first-keystroke push
   captures the predecessor, not the keystroke just typed).

2. **On popstate departure** — at the start of the `useUrlSearchSync` popstate
   branch, a snapshot is captured for the entry being LEFT (`_lastKupuaKey`) before
   restoring the destination. This enables forward-after-back to find a snapshot.

3. **On pagehide** — a `pagehide` event handler in `main.tsx` captures a snapshot
   for the current entry's `kupuaKey`. This is the reload-survival mechanism: the
   current entry has no push-captured snapshot (only predecessors do), so without
   pagehide the snapshot would be absent on mount after reload.

`pushNavigateAsPopstate` (logo-reset) deliberately skips capture — its whole point
is to land fresh at offset 0.

### Restore

In `useUrlSearchSync`, when `consumeUserInitiatedFlag()` returns `false`:

1. Look up the snapshot for the current `kupuaKey`.
2. Match `snapshot.searchKey === buildSearchKey(currentParams)` (strict match only —
   lenient matching was considered but analysis showed the keys are structurally
   identical, making the lenient branch dead code).
3. If matched with an anchor: pass `anchorImageId` as `sortAroundFocusId` to
   `search()` with `snapshotHints: { anchorOffset }`. This engages the existing
   sort-around-focus render gate — no separate restore path. (`anchorOffset` is
   used as `hintOffset` in the deep-seek path for result sets >65k; for smaller
   sets the position map provides the offset directly.)
4. If the anchor is phantom (`anchorIsPhantom`), pass `phantomOnly: true` to
   `search()` so `_findAndFocusImage` sets `_phantomFocusImageId` instead of
   `focusedImageId` — no spurious focus ring.
5. If `viewportRatio` is present, call `saveSortFocusRatio(snapshot.viewportRatio)`
   before `search()` so Effect #9 in `useScrollEffects` positions the image at the
   same viewport fraction, not always at the top row.
6. Fall back to reset-to-top when the snapshot is absent or doesn't match.

**Mount-time restore (reload):** The same restore path fires on mount
(because `consumeUserInitiatedFlag()` returns `false` on a fresh load).
On reload, the URL IS the source of truth — stale snapshots from a
different search context must not restore.

### Column alignment

`_loadBufferAroundImage` in `search-store.ts` trims 0–(columns-1) items from
backward results so `bufferStart % columns === 0`. This preserves the anchor
image's natural column position. Without this, the column was determined by
`PAGE_SIZE/2 % columns` — an arbitrary position.

### Scroll teleport prevention

Buffer extends (from normal scrolling after restore) rebuild `imagePositions` →
new `findImageIndex` callback ref → Effect #9 re-fires. Without a guard, the
persisted `viewportRatio` would cause re-positioning back to the anchor.

Fix: `scrollAppliedResultsRef` in Effect #9 tracks the `results` array reference.
After the first successful scroll, it records `store.results`. On re-fire:
- Same reference → offset correction (allowed — needed for async countBefore).
- Different reference → buffer extend (blocked — prevents teleport).
- New generation → ref reset.

Key insight: async offset correction changes `bufferOffset` + `imagePositions`
but NOT the `results` array reference. Extends change `results` (new array).

## Case-specific popstate behaviour

**Case A — Back from image detail (same search context):**
Only the `image` display-only key was removed. `URL_DISPLAY_KEYS` guard skips
re-search. Focus is preserved. Snapshot path not invoked.

**Case B — Back to a different search context:**
Search-affecting keys changed. Snapshot looked up → anchor restored at saved
position. If no snapshot, falls back to reset-to-top.

**Case C — Forward re-applies:**
Same as Case B in reverse. The forward navigation is also a popstate; the
snapshot captured on departure enables position restoration.

**Case D — Back across a density toggle (same search context):**
Only the `density` display-only key changed; dedup guard bails. No re-search,
focus preserved. Snapshot path not invoked.

## E2E test coverage

`e2e/local/browser-history.spec.ts` — 32 tests across nine describe blocks:

**kupuaKey identity (6 tests):**
kupuaKey minted on push, carried on replace, stable across display-only changes,
synthesised on cold load.

**Basic history (15 tests):**
Back/forward across sort, query, detail, debounce, density, logo-reset, metadata
click. Deep-link synthesis. SPA-entry flag guard.

**Snapshot restore on popstate (6 tests):**
Back after sort change, back after query change, forward-after-back, logo-reset
back (no snapshot), back without snapshot falls through, deep position restore.

**Reload survival (5 tests):**
Reload restore via pagehide snapshot, reload-then-back, deep position reload,
bfcache sessionStorage survival, no scroll teleport after reload restore.

## Other behaviours worth knowing

### `suppressNextRestore` (search-store)
`resetToHome()` sets `suppressNextRestore=true` before navigating. Prevents stale
buffer from overwriting the fresh "home" page-1 results if `restoreAroundCursor()`
fires during the transition.

### sessionStorage image-offset cache
`src/lib/image-offset-cache.ts` stores `{ offset, cursor, searchKey }` per image ID.
Keyed by `searchKey` fingerprint. Powers reload-survival of the open-image overlay.
Not consulted on browser back/forward (the snapshot system handles that).

### Dev-only globals
`src/main.tsx` exposes `__kupua_router__`, `__kupua_markUserNav__`,
`__kupua_getKupuaKey__`, `__kupua_inspectSnapshot__`, and
`__kupua_markPushSnapshot__` when `import.meta.env.DEV` is true. E2E helpers use
these to mirror production navigation semantics.

### URL display-only keys
`URL_DISPLAY_KEYS = { "image", "density" }`. Changes to only these keys never
re-fire a search (dedup guard strips them before serialising).

## Key files

| File | Role |
|---|---|
| `src/hooks/useUrlSearchSync.ts` | URL↔store sync, popstate detection, snapshot restore, `useUpdateSearchParams()` |
| `src/lib/orchestration/search.ts` | `markUserInitiatedNavigation`, `markPushSnapshot`, `pushNavigate`, `pushNavigateAsPopstate` |
| `src/lib/orchestration/history-key.ts` | `mintKupuaKey`, `getCurrentKupuaKey`, `withCurrentKupuaKey`, `withFreshKupuaKey`, `synthesiseKupuaKeyIfAbsent` |
| `src/lib/history-snapshot.ts` | `HistorySnapshot` type, `SnapshotStore` interface + impls, `PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD` |
| `src/lib/build-history-snapshot.ts` | `buildHistorySnapshot()` — reads store + DOM to build snapshot |
| `src/hooks/useScrollEffects.ts` | Effect #9 (sort-around-focus scroll), `saveSortFocusRatio`, `scrollAppliedResultsRef` |
| `src/stores/search-store.ts` | `_loadBufferAroundImage` (column alignment), `_findAndFocusImage`, sort-around-focus |
| `src/lib/search-params-schema.ts` | `URL_PARAM_KEYS`, `URL_DISPLAY_KEYS` |
| `src/lib/reset-to-home.ts` | `resetToHome()`, `suppressNextRestore` |
| `src/lib/image-offset-cache.ts` | `buildSearchKey`, `extractSortValues`, per-image offset cache |
| `src/main.tsx` | `pagehide` handler, `scrollRestoration = 'manual'`, `synthesiseKupuaKeyIfAbsent`, dev globals |
| `src/components/ImageDetail.tsx` | `closeDetail` (`history.back()`), deep-link synthesis, `_bareListSynthesized` guard |
| `src/routes/search.tsx` | Reads `density` from `useSearch` to swap grid/table |

---

## Appendix: How kahuna handles browser history

Investigated for reference — not to emulate, but to ensure kupua is never worse.

**Routing:** AngularJS `ui-router` (v0.4.3) with `ui-router-extras` Deep State
Redirect. Image detail is a **separate top-level route** (`/images/:imageId`),
not an overlay.

**History entries — kahuna pushes everything:**
- Every filter change (`$state.go('search.results', {...})`) creates a new
  history entry — no `location: 'replace'` is used.
- Clicking an image pushes `/images/:imageId`.
- Result: Back undoes filter changes one by one. Technically correct but noisy.

**Back from image to search:** Re-triggers the search API call. The search
controller is destroyed and re-instantiated. DSR restores URL params, so query/filters
match — but the DOM is torn down and rebuilt, so scroll position is lost.

**What kupua does better:**
- Scroll position survives image detail (overlay architecture — search stays mounted)
- No DOM teardown on back
- History entries only for meaningful state changes, not every keystroke
- Position restoration on back/forward/reload via snapshot system
