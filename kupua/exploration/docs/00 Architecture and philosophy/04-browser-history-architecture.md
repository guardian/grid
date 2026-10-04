# Browser Back/Forward — Architecture

This document describes the history/navigation architecture in kupua:
how entries are created, how popstate is detected, how per-entry position
snapshots capture and restore scroll position, and how per-entry identity
(`kupuaKey`) ties it all together.

## Overview

URL is the source of truth for URL-managed search/detail state. `useUrlSearchSync` reacts to TanStack Router's
`searchParams` and syncs them into the Zustand store, then fires `search()`.
History entries are created selectively: committed discrete actions (filter toggle,
sort change, date range) push; incremental changes (debounced typing) replace.

On popstate (browser back/forward), the system looks up a per-entry snapshot keyed
by `kupuaKey` and restores the user's scroll position and focused image via the
existing sort-around-focus infrastructure. On reload, a `pagehide` handler persists
the snapshot to `sessionStorage` so the same restore path fires on mount.

### Independent Density

Density is absent from the URL and history state. The current tab's choice
survives navigation/Back/Forward and reload, independently
of entry snapshots, using session storage initialized before the view mounts.
Fresh independent tabs default to grid; no legacy link support or cross-tab sync.
Density toggles leave history length, entry identity and Forward availability intact.
Home resets grid with existing fresh-data timing; later density input wins without
cancelling the search reset, and abandoned Home work cannot overwrite the preference.
Back after Home does not restore an old density.
`ui-prefs-store` reads `kupua-density` synchronously and writes each choice promptly.
Missing/invalid/unavailable storage defaults quietly to grid; runtime choices stay
usable. Local preference hydration cannot overwrite this session-owned state.

## Guiding philosophy

**History should let the user traverse all *useful* views.** A useful view is
one the user could conceivably want to return to — a search context or an
opened image. Density is a viewing preference, not a history
destination. App-chrome state (left/right panel
visibility, hover states, in-progress text input) is not a useful view
and is deliberately divorced from history.

Concretely, this gives:

- **Push** when the action commits a new useful view: filter toggle, sort
  change, date range, opening an image, completed query.
- **Replace** when the action is intermediate or undoes itself naturally:
  debounced typing, image traversal, default-injection redirect.
- **Outside history entirely** for density and app chrome: panel toggles, hover,
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

Current implementation:

| Action | Push/Replace | Marks user-initiated? | Goes through `useUpdateSearchParams`? | Why |
|---|---|---|---|---|
| Filter toggle, sort change, date range | **Push** | Yes | Yes | Discrete committed action — back undoes it |
| Debounced CQL/AI edits | **Push** (session start) then **Replace** (settlement) | Yes | Settled edits use `{ replace: true }` | `pushTypingSearchEntry` captures the predecessor and pushes its URL with a fresh key. Overlapping CQL/AI edits share that entry; settled values replace it. |
| Density toggle (grid ↔ table) | **Neither** | No navigation | No | `setDensity` changes/persists per-tab UI state. Entry key, Forward branch, typing and query generation stay intact. |
| Open image detail (click / double-click) | **Push** | Yes (via `pushNavigate`) | No — `pushNavigate()` from `ImageGrid` / `ImageTable` | Display-only `image` key; marked origin/detail pair preserves the laid-out list without a search. |
| Close image detail (all affordances) | **history.back()** | Yes (inline `markUserInitiatedNavigation`) | No — `history.back()` in `ImageDetail.closeDetail` | Pops the detail entry; forward re-opens detail. On cold loads (paste/bookmark/reload), deep-link synthesis on mount inserts a bare-list entry so `history.back()` stays inside kupua. Skipped for SPA-entered detail (flag guard). |
| Prev/next image in detail (traversal) | **Replace** | **No** | No — raw `navigate()` from `useImageTraversal.onNavigate` | Traversal is divorced from history — user doesn't want 50 back-presses. |
| Logo → reset to home | **Push** | **No** (via `pushNavigateAsPopstate`) | No — `pushNavigateAsPopstate()` after `resetToHome()` | Explicit opt-out from marking. Popstate semantics reset to top with no focus carry — desired "start over" behaviour. |
| Default-injection redirect (`/` → `/search`) | **Replace** | No (one-off mount) | No — direct `navigate()` in `useUrlSearchSync` | Invisible URL normalisation. |

The mechanism: `useUpdateSearchParams()` in `useUrlSearchSync.ts` accepts
`options?: { replace?: boolean }` defaulting to `false` (push). Only SearchBar's
debounced CQL/AI handlers pass `{ replace: true }`.

### Debounced query — history session grouping

SearchBar shares pending CQL/AI edits only while their entry and input-reset lifetime
remain current. `pushTypingSearchEntry` captures the predecessor snapshot, mints the
new entry's key and returns that key to the producer; capturing the predecessor key
would incorrectly cancel the typing session's own completion.
The CQL (300ms) and AI (600ms) delays debounce their updates, which replace
the shared entry and retain its key; a later edit after both timers clear starts
a new entry. There is no independent history timer or generic history state machine.

Departure cancels pending input even if Back/Forward later returns to the same entry.
Mounted editors synchronize to the destination through a local external-update revision,
without remounting the results view. Each callback checks its own timer identity before
clearing state. The header's 250ms single-click sort has a separate timer with entry/reset
ownership; double-click cancels it and retains the existing fit/restore interaction.

### Home completion ownership

Both logos call [resetToHome](../../../src/lib/reset-to-home.ts), which clears
focus/selection and awaits the default search before navigating or switching to
grid. A current search failure still permits navigation. History departure, a
newer search, another Home, or replacement/abort of its captured discovery retires
the continuation without necessarily cancelling useful data work.

Home owns a temporary top thumb/tooltip hold and token-scoped restore, return and
density suppressions. Completion or cancellation releases only its own tokens.
Scrubber resynchronizes when the hold releases even if numeric props are unchanged;
near-top geometry is not completion authority. Ordinary rendering is not navigation.

Home resets density to grid only if its captured `_densityIntent` remains current.
Same-value and away/back choices advance intent too. A newer density choice wins
without cancelling the query reset; retired Home work cannot overwrite it.

### Push-navigate helpers

All push-navigate sites explicitly declare their intent:

- `pushNavigate()` — the default. Calls `markUserInitiatedNavigation()` +
  `markPushSnapshot()` then `navigate()`. Used by: enterDetail (grid + table).
- `pushTypingSearchEntry()` wraps that same push boundary for the pre-edit search
  URL; SearchBar owns the shared CQL/AI pending-session check.
- `pushNavigateAsPopstate()` — the exception. Calls `navigate()` without marking
  or capturing. Used only by: logo-reset (SearchBar + ImageDetail).
- `closeDetail` — uses inline `markUserInitiatedNavigation()` + `history.back()`.
- Replace-only sites (`traversal-onNavigate`, `default-injection`) stay raw.
- `useUpdateSearchParams()` — the golden path. Marks + captures internally.

## Native History And User Navigation

When browser back/forward fires, `useUrlSearchSync` needs to distinguish it from
user-initiated param changes (where focus preservation / "Never Lost" should apply).

User search changes use a module-level flag in `orchestration/search.ts`:
- `markUserInitiatedNavigation()` — called synchronously in `useUpdateSearchParams()`
  immediately before `navigate()`.
- `consumeUserInitiatedFlag()` — read-and-clear, called in the `useUrlSearchSync`
  effect when it consumes a coherent transition, including a dedup return.

If true, consume the pre-passive user continuity capture; otherwise derive a
handoff only from the destination snapshot, or use top/no focus.

Query dedup alone is insufficient: distinct native entries may have identical
params but different represented positions/focus. `useUrlSearchSync` subscribes to
the existing `router.history` owner. BACK/FORWARD/GO marks the destination key
before publishing its observed entry identity; PUSH/REPLACE does not. The effect
waits for raw location and validated route params to agree before consuming that
notification. There is no competing native `window.popstate` listener.

Same-query native destinations restore unless they are the marked origin/detail
pair. Every consumed transition, including dedup, updates source entry/image/origin
bookkeeping. Unmarked pre-existing detail entries retain ordinary-close compatibility.

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

Detail entries also carry `_detailEntryImageId` and `_detailOriginKupuaKey` as
navigation metadata, not snapshot fields. `pushNavigate` stamps the originating
list key from the caller's immutable entry-image marker; cold synthesis stamps its
new bare-list key. Traversal retains them. A coherent marked present-to-present
entry change adopts the destination entry-image identity; same-entry traversal
does not rebase it. Ordinary close to the marked origin retains native placement
or centres the last-viewed image after traversal. Multi-entry GO elsewhere and
unrelated native detail re-entry use destination restoration instead.

`lib/detail-return.ts` is the shared session-entry authority for the list return
hook and detail swipe preparation. Reload captures historical entry identity,
not the image at component mount; same-key cold synthesis can finalize the
origin without changing that entry image. Fresh list-to-detail opening, including
Forward re-entry, preserves the established new-session boundary at the reopened
image. These markers do not add independent focus/viewport snapshot fields.

## Snapshot system — position preservation across history

### Snapshot shape

```ts
interface HistorySnapshot {
  searchKey: string;                    // buildSearchKey fingerprint at capture time
  anchorImageId: string | null;         // per anchor-priority rule
  anchorIsPhantom: boolean;             // true if anchor is viewport-centre, not explicit focus
  anchorOffset: number;                 // global offset at capture time
  viewportRatio: number | null;         // (rowTop - scrollTop) / clientHeight
  newCountSince: string | null;         // absorbed-new-images freeze boundary
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

Snapshots are captured at three points:

1. **On push** — `markPushSnapshot()` fires inside `useUpdateSearchParams` and
   `pushNavigate`, immediately before `navigate()`. The store still shows pre-edit
   state at this point — load-bearing for debounced typing (the first-keystroke push
   captures the predecessor, not the keystroke just typed).

2. **On popstate departure** — at the start of the `useUrlSearchSync` popstate
   branch, a snapshot is captured for the entry being LEFT (`_lastKupuaKey`) before
   restoring the destination. This enables forward-after-back to find a snapshot.
   **Phantom guard:** if a phantom snapshot already exists, it is only overwritten
   when the current viewport-centre anchor is a *different image* from the stored
   one. Same-image sub-pixel drift (< 1 row height) is harmless and must not
   update the snapshot — that would cause `viewportRatio` to walk on repeated
   back/forward cycles. A different anchor means the user scrolled significantly
   and the new position must be captured.

3. **On pagehide** — a `pagehide` event handler in `main.tsx` captures a snapshot
   for the current entry's `kupuaKey`. This is the reload-survival mechanism: the
   current entry has no push-captured snapshot (only predecessors do), so without
   pagehide the snapshot would be absent on mount after reload.

`pushNavigateAsPopstate` (logo-reset) deliberately skips capture — its whole point
is to land fresh at offset 0.

Every consumed URL-sync transition refreshes `_lastKupuaKey`, including the dedupe
return for display-only changes and Home's preloaded search state. Dedupe suppresses
the search, not entry bookkeeping: later Back must capture Home under Home's key,
without overwriting an existing predecessor snapshot. Home still awaits its direct
search before navigation, preserving the density-switch ordering.

### Restore

In `useUrlSearchSync`, when `consumeUserInitiatedFlag()` returns `false`:

1. Look up the snapshot for the current `kupuaKey`.
2. Require `snapshot.searchKey === buildSearchKey(currentParams)`.
3. `historySearchContinuity(snapshot, params)` produces destination target,
  ratio-or-start placement, represented target-focus or NONE, top fallback and
  offset hint. It does not call the live user anchor chooser or capture departing
  neighbours. Missing/mismatched/null-anchor snapshot means start/no focus.
4. Pass that handoff to `search`, or `resortAiBuffer` for resident AI sort/entry-only
  history. Existing generation/focus ownership carries resolution and coherent
  publication; effect 9 places once using the CURRENT grid/table geometry.
  Phantom snapshots do not restore a hidden bookmark independently of the anchor.
5. Genuine missing target means destination top/no focus, not a departing neighbour
  fallback. Ordinary user-neighbour and adapter error/absence contracts remain.
6. Restore `newCountSince` only on a matching anchor snapshot, using the later
  saved/current boundary. This monotonic ratchet is not immutable membership.

Resident AI restoration applies explicit NONE as well as focus, without requests.
Pending history waits for owned finite publication, adopting latest
same-query order/continuity; newer work cannot revive obsolete placement. Input
retirement does not cancel useful query discovery. Cursor restoration and pending-arrow
placement retain separate consumers. Snapshots represent one anchor, not independent
focus and viewport identities.

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

`findImageIndex` (`useDataWindow.ts`) reads `imagePositions` imperatively via
`getState()` and keeps a stable callback across ordinary buffer extends. Effect 9
checks the current owner/phase and density readiness; it marks handoff placement
consumed. Ordinary rerenders or a later density mount cannot replay a placed or
retired owner. Small-result fill retries retain the existing geometry/input guards.

No-position-map sort landings run the cursor-buffer fetch and `countBefore`
concurrently, align before publication, and bump `sortAroundFocusGeneration`
in the same atomic store commit as final results and coordinates. Effect #9
applies the resolved handoff once. Legacy cursor/arrow work keeps its generation
guard; neither path treats ordinary buffer growth as new placement authority.

## Case-specific popstate behaviour

**Case A — Back from image detail (same search context):**
When returning to that marked detail entry's origin, skip re-search/restore and
preserve the laid-out list. `useReturnFromDetail` sets last-viewed focus and centres
only after traversal. An early close keeps its target through existing pending
list restoration; publication schedules a placement frame when loading has
settled and the target is available. It re-reads the current index and geometry,
does no extra data lookup, and never scrolls an original-image return.
Search generation, origin/history key, `_focusIntent`, reopening and cleanup
reject obsolete callbacks.
Passive focus publication does not count as user input. Cursor restoration exposes
its pending signal for detail remount reuse, and guards focus/placement independently
of useful data publication. Destination-history publication uses the current
adopted owner's focus-intent capture, also for finite AI. GO to another entry
instead restores that destination's snapshot.

**Case B — Back to a different search context:**
Search-affecting keys changed. Snapshot looked up → anchor restored at saved
position. If no snapshot, falls back to reset-to-top.

**Case C — Forward re-applies:**
Same as Case B in reverse. The forward navigation is also a popstate; the
snapshot captured on departure enables position restoration.

**Case D — Distinct same-query native destination:**
Entry identity bypasses query dedup for list/list or unrelated marked detail
destinations. Ordinary search restores once; resident AI uses its request-free
ordering path. The origin/detail exception is not a blanket display-only bailout.

**Density toggle:** there is no Back step. Back/Forward keeps current density.

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
`URL_DISPLAY_KEYS = { "image" }`. Ordinary detail-origin transitions do not fire
a search. Density is absent from schema, producers/consumers and snapshots.
Query dedup is not permission to skip a distinct native destination's restoration.

## Key files

| File | Role |
|---|---|
| `src/hooks/useUrlSearchSync.ts` | URL↔store sync, popstate detection, snapshot restore, `useUpdateSearchParams()` |
| `src/lib/orchestration/search.ts` | `markUserInitiatedNavigation`, `markPushSnapshot`, `pushNavigate`, `pushNavigateAsPopstate` |
| `src/lib/orchestration/history-key.ts` | `mintKupuaKey`, `getCurrentKupuaKey`, `withCurrentKupuaKey`, `withFreshKupuaKey`, `synthesiseKupuaKeyIfAbsent` |
| `src/lib/history-snapshot.ts` | `HistorySnapshot` type, `SnapshotStore` interface + impls, `PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD` |
| `src/lib/build-history-snapshot.ts` | `buildHistorySnapshot()` — reads store + DOM to build snapshot |
| `src/lib/search-continuity.ts` | Strict destination snapshot handoff; separate pre-passive user continuity capture |
| `src/hooks/useScrollEffects.ts` | Effect #9 owned one-shot placement, current geometry/readiness and limited legacy cursor/arrow consumers |
| `src/stores/search-store.ts` | `_loadBufferAroundImage` (column alignment), `_findAndFocusImage`, sort-around-focus |
| `src/lib/search-params-schema.ts` | `URL_PARAM_KEYS`, `URL_DISPLAY_KEYS` |
| `src/lib/reset-to-home.ts` | `resetToHome()`, `suppressNextRestore` |
| `src/lib/image-offset-cache.ts` | `buildSearchKey`, `extractSortValues`, per-image offset cache |
| `src/main.tsx` | `pagehide` handler, `scrollRestoration = 'manual'`, `synthesiseKupuaKeyIfAbsent`, dev globals |
| `src/components/ImageDetail.tsx` | `closeDetail` (`history.back()`), deep-link synthesis, `_bareListSynthesized` guard |
| `src/stores/ui-prefs-store.ts` | Synchronous per-tab density initialization, prompt persistence and intent ownership |
| `src/routes/search.tsx` | Reads preference density to swap grid/table; URL image controls detail |

---

## Appendix: How kahuna handles browser history

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
