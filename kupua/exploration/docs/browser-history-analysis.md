# Browser Back/Forward — How History Works

This document describes the current history/navigation architecture in kupua.
For the future scroll-position restoration idea, see the "Future polish" section
at the end.

## Overview

URL is the single source of truth. `useUrlSearchSync` reacts to TanStack Router's
`searchParams` and syncs them into the Zustand store, then fires `search()`.
History entries are created selectively: committed discrete actions (filter toggle,
sort change, date range) push; incremental changes (debounced typing) replace.

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

**Continuous content-state — scroll, focus movement, traversal — is also
outside history step-by-step**, but its endpoints (where the user *was*
when they made the next committed move) are useful and snapshot-worthy.
We don't push an entry per scroll-tick or focus-arrow-key, but the
position/focus at the moment of the next push is exactly what
position-preservation captures and restores. Same shape applies to all
three: ignore the journey, remember the start and finish.

When in doubt, the test is: *would a user pressing back here be surprised
to land on this state, or relieved to find it preserved?* Surprised → not
useful, don't push. Relieved → useful, push.

## Current history entry rules

*(Updated 25 April 2026 after baseline tightening — reflects post-implementation state.)*

| Action | Push/Replace | Marks user-initiated? | Goes through `useUpdateSearchParams`? | Why |
|---|---|---|---|---|
| Filter toggle, sort change, date range | **Push** | Yes | Yes | Discrete committed action — back undoes it |
| Debounced query keystrokes | **Push** (first keystroke) then **Replace** (subsequent) | Yes | Yes (`{ replace: true }`) | First keystroke of a new typing session pushes the pre-edit URL via `history.pushState`, committing the previous context as a back target. Subsequent keystrokes within the debounce window replace. Intermediate — "c", "ca", "cat" shouldn't each be a back target, but "cats" → "dogs" should be two history entries. |
| Density toggle (grid ↔ table) | **Push** | Yes | Yes | Display-only key; URL_DISPLAY_KEYS skips re-search but history still grows. Deliberate — density is a useful view. |
| Open image detail (click / double-click) | **Push** | Yes (via `pushNavigate`) | No — `pushNavigate()` from `ImageGrid` / `ImageTable` | Display-only `image` key; effect bails on dedup, but marking is belt-and-braces. |
| Close image detail (all affordances) | **history.back()** | Yes (inline `markUserInitiatedNavigation`) | No — `history.back()` in `ImageDetail.closeDetail` | Pops the detail entry; forward re-opens detail. On cold loads (paste/bookmark/reload), deep-link synthesis on mount inserts a bare-list entry so `history.back()` stays inside kupua. Skipped for SPA-entered detail (flag guard). |
| Prev/next image in detail (traversal) | **Replace** | **No** | No — raw `navigate()` from `useImageTraversal.onNavigate` | Traversal is divorced from history — user doesn't want 50 back-presses. Comment documents why helper isn't needed (replace-only). |
| Logo → reset to home | **Push** | **No** (via `pushNavigateAsPopstate`) | No — `pushNavigateAsPopstate()` after `resetToHome()` | Explicit opt-out from marking. Popstate semantics reset to top with no focus carry — desired "start over" behaviour. |
| Default-injection redirect (`/` → `/search`) | **Replace** | No (one-off mount) | No — direct `navigate()` in `useUrlSearchSync` | Invisible URL normalisation. Comment documents why helper isn't needed (replace-only). |

The mechanism: `useUpdateSearchParams()` in `useUrlSearchSync.ts` accepts
`options?: { replace?: boolean }` defaulting to `false` (push). Only SearchBar's
debounced `handleQueryChange` passes `{ replace: true }`.

### Debounced query — history session grouping

The "push on first keystroke" logic uses the search debounce timer
(`_debounceTimerId`) as the typing-session boundary: when the timer is null
(i.e. the previous 300ms debounce has elapsed or this is the first keystroke),
we treat it as the start of a new typing session and push the pre-edit URL.

This means the **history session timer and the search debounce timer are the
same 300ms value**. We considered separating them (e.g. 300ms search debounce +
1500ms history session), following VS Code's pattern of independent undo-stop
timers. The trade-offs:

| Approach | Pro | Con |
|---|---|---|
| **Single timer (current, 300ms)** | Simple; every pushed entry corresponds to a query that actually fired and produced results | Slow typers (>300ms between keystrokes) get extra entries — each is a valid settled query, just more granular than ideal |
| **Two timers (300ms search / 1500ms history)** | Slow typers grouped better | Mid-word pushes possible (pause 1500ms mid-thought → history captures partial query); more state to manage |
| **Whitespace / select-all signals** | High confidence "new intent" | Misses incremental edits like appending ` AND tag:news`; space is common inside single queries |

**Decision: single timer.** Rationale:

1. **Kahuna precedent.** Kahuna uses 500ms Rx debounce + always pushState (never
   replaceState). Every settled query becomes a history entry — the same model
   we have now. Kahuna's back button is actually *broken* (the `$scope.$watch` →
   `$state.go()` cycle creates duplicate entries on popstate, with a FIXME
   acknowledging it), but the "push every settled query" granularity has never
   been a user complaint. Our 300ms threshold is more aggressive than kahuna's
   500ms, meaning slightly more entries for slow typers, but the same class of
   behaviour.
2. **Worst case is "too many valid entries", not wrong entries.** Each pushed
   entry is a query that fired and produced results. Users can hold the back
   button to skip through them.
3. **Complexity cost of two timers is real.** A second timer adds state,
   edge cases (timer cleanup on unmount, interaction with clear-button push),
   and a new failure mode (mid-word captures) to solve a problem that hasn't
   surfaced in years of kahuna usage.

If slow-typer granularity becomes a real complaint, the two-timer approach is
a clean upgrade path — add a `_historySessionTimerId` that fires at ~1500ms
and gate the push on that instead of `_debounceTimerId`.

**Note on the user-initiated flag.** After baseline tightening, all push-navigate
sites explicitly declare their intent:

- `pushNavigate()` — the default. Calls `markUserInitiatedNavigation()` then
  `navigate()`. Used by: enterDetail (grid + table).
- `pushNavigateAsPopstate()` — the exception. Calls `navigate()` without marking.
  Used only by: logo-reset (SearchBar + ImageDetail).
- `closeDetail` — uses inline `markUserInitiatedNavigation()` + `history.back()`
  (not a `navigate()` call, so the helpers don't apply).
- Replace-only sites (`traversal-onNavigate`, `default-injection`) stay raw with
  comments explaining why the helpers don't apply.
- `useUpdateSearchParams()` — the golden path. Marks user-initiated internally.

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
`consumeUserInitiatedFlag()` returns `false` → `setParams({..., offset: 0})` and
`search(null)` — reset to top. No focus carried from "dogs" into "cats". Correct.

**Case C — Forward re-applies:**
Same mechanism as Case B in reverse. The forward navigation is also a popstate,
so focus is not carried — the new search starts from the top. Correct.

**Case D — Back across a density toggle (same search context):**
Search "cats" → toggle to table → back. Only the `density` display-only key
changed; the dedup guard bails. The route component (`routes/search.tsx`) reads
`density` straight from `useSearch` and swaps `<ImageGrid>` ↔ `<ImageTable>`.
No re-search; focus is preserved. Correct.

## E2E test coverage

`e2e/local/browser-history.spec.ts` (15 tests after baseline tightening + debounce fix):
1. Back restores previous search after sort change
2. Back restores previous search after query change
3. Forward re-applies search after back
4. Focus is NOT carried into old search context on back
5. Back navigates between settled debounced queries (typed via UI) *(new — debounce fix)*
6. Back from image detail preserves focused image
7. Forward after close-button re-opens image detail *(new — item 1)*
8. Backspace close then forward re-opens detail *(new — item 1)*
9. SPA open-close cycle does not accumulate phantom history entries *(new — SPA-entry flag guard)*
10. Cold load ?image=X with fresh tab → close → lands on bare list *(new — item 1, deep-link synthesis)*
11. Paste ?image=X into tab with prior history → close → lands on bare list *(new — unconditional synthesis fix)*
12. Back across density toggle re-toggles density *(new — item 4)*
13. Logo reset from search bar → back restores previous context (popstate) *(new — item 3)*
14. Logo reset from image detail → back restores previous context *(new — item 3)*
15. Metadata click pushes exactly one entry; back returns to detail *(new — item 5)*

All E2E `spaNavigate` helpers call `window.__kupua_markUserNav__` (exposed in
dev mode from `main.tsx`) before `router.navigate()`, so E2E-driven navigations
are treated as user-initiated — matching real user behaviour.

## Other custom behaviours worth knowing

### `suppressNextRestore` (search-store)
`resetToHome()` sets `suppressNextRestore=true` on the store before navigating.
If an unmounting `ImageDetail` (or any other consumer) tries to call
`restoreAroundCursor()` during the transition, the store one-shot consumes the
flag and skips the restore — preventing a stale deep-offset buffer from
overwriting the fresh "home" page-1 results. Not a history mechanism per se,
but it is what makes the logo-reset path safe.

### sessionStorage image-offset cache
`src/lib/image-offset-cache.ts` writes `kupua:imgOffset:<imageId>` →
`{ offset, cursor, searchKey }` whenever an image is opened or traversed. It is
keyed by a `searchKey` fingerprint that strips display-only keys (`image`,
`density`) so the cache is reused across density toggles but invalidated when
filter/query/sort changes. It currently only powers reload-survival of the
open-image overlay; it is **not** consulted on browser back/forward today.

### Dev-only globals
`src/main.tsx` exposes `window.__kupua_router__` and
`window.__kupua_markUserNav__` only when `import.meta.env.DEV` is true.
E2E `spaNavigate` helpers call `__kupua_markUserNav__` immediately before
`router.navigate()` so test-driven navigations are treated as user-initiated.
Production builds do not ship these.

### URL display-only keys
Defined in `src/lib/search-params-schema.ts` as
`URL_DISPLAY_KEYS = { "image", "density" }`. The `useUrlSearchSync` effect
strips these before serialising for the dedup guard, so changes that only touch
display keys never re-fire a search.

## Key files

- `src/hooks/useUrlSearchSync.ts` — the sync hook; `useUpdateSearchParams()`
  with push/replace option; user-initiated flag read; default-injection
  redirect; popstate-vs-user branching
- `src/lib/orchestration/search.ts` — `markUserInitiatedNavigation()` /
  `consumeUserInitiatedFlag()` at the bottom
- `src/lib/search-params-schema.ts` — `URL_PARAM_KEYS`, `URL_DISPLAY_KEYS`
- `src/lib/reset-to-home.ts` — orchestrates logo-reset (sets
  `suppressNextRestore`, aborts in-flight searches, then runs the navigate
  callback)
- `src/lib/image-offset-cache.ts` — `storeImageOffset` / `getImageOffset`
  (sessionStorage) + `buildSearchKey` fingerprinting
- `src/main.tsx` — exposes `__kupua_router__` and `__kupua_markUserNav__` in
  dev mode for E2E
- `src/components/SearchBar.tsx` — `handleQueryChange` pushes the pre-edit URL
  on first keystroke (when debounce timer is null) then passes `{ replace: true }`
  for subsequent keystrokes; logo `onClick` calls `resetToHome` then
  `pushNavigateAsPopstate(navigate, { search: DEFAULT_SEARCH })`
- `src/components/ImageGrid.tsx` / `ImageTable.tsx` — `enterDetail` writes the
  offset cache and pushes `?image=<id>` via `pushNavigate()`
- `src/components/ImageDetail.tsx` — `onNavigate` (traversal) uses raw
  `navigate({ replace: true })`; `closeDetail` uses
  `markUserInitiatedNavigation(); history.back()`; deep-link synthesis
  on mount (conditional on SPA-entry flag)
- `src/routes/search.tsx` — reads `density` straight from `useSearch` to swap
  grid/table without going through the store

---

## Baseline tightening — prerequisites for any position-preservation work

**Status (25 April 2026): ✅ COMPLETE.** All six baseline items implemented,
plus three bug fixes (gate removal, SPA-entry flag, debounced typing history).
165 e2e tests pass (0 regressions), 357 unit tests pass.
See [changelog.md](./changelog.md) for the detailed narrative.

The implementation below is preserved for reference — future readers benefit
from seeing what was done and why.

Before adding snapshot-based position/focus restoration, the simple history
model needed a few small fixes. They are independently shippable and
independently valuable, but they also remove asymmetries that would otherwise
leak into the snapshot path and turn into hard-to-diagnose bugs.

### 1. Close-button forward asymmetry → `closeDetail` uses `history.back()`

**Today:** browser-back-from-detail leaves the detail entry available as a
forward target (lossless). The four explicit close affordances (← Back
button, double-click on the detail surface, `Backspace` key, swipe-to-dismiss)
all funnel through `ImageDetail.closeDetail`, which calls
`navigate({ replace: true })` — replacing the detail entry with the list
(lossy; forward is dead). Two paths that should be equivalent have different
forward semantics.

**Change:** make `closeDetail` call `history.back()` instead of
`navigate({ replace: true })`. One call-site change covers all four
affordances. Both the close paths and browser-back then produce identical
stacks; forward re-opens the detail in either case.

**Sub-requirements:**

- **`markUserInitiatedNavigation()` immediately before `history.back()`.**
  `history.back()` is async and re-enters `useUrlSearchSync` via popstate.
  Without marking, the effect would consume `userInitiatedFlag = false`,
  treat close as a popstate, and reset offset to 0. Closing should preserve
  scroll.
- **Deep-link synthesis on first mount — conditional on cold load (SPA-entry flag guard).**
  On mount, if the detail was NOT entered via SPA navigation (`pushNavigate`),
  synthesise a bare-list entry below the detail entry:

  1. `history.replaceState` the current entry to the bare-list URL (strip
     `image`, keep everything else — `query`, filters, sort, `density`).
  2. `pushState` (via TSR navigate) back to the detail URL.

  Both happen in the same tick; Chrome and Firefox coalesce, so no rendered
  or URL-bar flicker. Resulting stack `[...prior] [bare-list] [detail@A]`.
  `closeDetail`'s `history.back()` then pops to the bare-list entry. If
  `image` was the only param, the bare-list entry is empty `?` and the
  default-injection redirect rewrites it to home.

  **Why no `history.length` gate.** The original design gated synthesis on
  `history.length <= 2` ("fresh tab"), reasoning that when the user
  navigated from another site, `history.back()` should return to that
  site. This was wrong: `history.length` is unreliable (browsers count
  differently, and a tab with 20 guardian.com entries reports a high
  length even for a pasted URL). The gate caused the in-app "Back to
  search" button to exit kupua entirely when the user pasted a detail
  link into a tab with prior browsing history. Additionally, if kupua
  ever runs in an iframe, `history.length` is scoped to the iframe —
  another reason the gate was meaningless.

  **Why a SPA-entry flag instead.** Unconditional synthesis (the second
  iteration) fixed the paste-into-busy-tab bug but introduced phantom
  entries: every SPA-navigated detail open inserted a bare-list entry
  even though the list entry already existed in history. This doubled
  the back-presses needed. The fix: `pushNavigate()` sets a module-level
  `_detailEnteredViaSpa` flag; the synthesis `useLayoutEffect` consumes
  it and skips synthesis when set. Cold loads (paste, bookmark, reload)
  never call `pushNavigate()`, so the flag stays false → synthesis runs.

  The trade-off for cold loads: one extra browser-back to leave kupua
  when the user arrived from another site. This is acceptable — the
  in-app close button must always work.

  *Out of scope:* on the pasted-URL close path, finding image A inside the
  resulting list and focusing it via the offset cache + `restoreAroundCursor`.
  Belongs with snapshot work.

**E2E to add:**

- Forward-after-close re-opens detail (today: dead-end).
- Cold-load `?image=X` with fresh tab → close → lands on bare list.
- Paste `?image=X` into tab with prior history → close → lands on bare
  list (not the referring site).

### 2. Funnel raw `navigate()` push sites through `pushNavigate()` / `pushNavigateAsPopstate()`

**Today:** the user-initiated flag is set inside `useUpdateSearchParams()`.
Six sites bypass that hook and call `navigate()` directly:
`ImageGrid.enterDetail`, `ImageTable.enterDetail`, `ImageDetail.closeDetail`,
`ImageDetail` traversal `onNavigate`, both logo `onClick` sites
(`SearchBar`, `ImageDetail`), and `useUrlSearchSync`'s default-injection
redirect.

All are correct today: the ones that touch only display-only keys
(`image`, `density`) hit the dedup guard and bail before reading the flag;
logo-reset *relies* on the flag being absent for its reset-to-top
semantics. But each is a footgun — any future change that makes one of
these touch a search-affecting key would silently trigger popstate
semantics.

**Change:** introduce two helpers in `lib/orchestration/search.ts` (or a
new sibling file — your call, but keep them next to
`markUserInitiatedNavigation`):

- `pushNavigate(args)` → `markUserInitiatedNavigation(); navigate(args);`.
  Default. All raw push sites switch to this.
- `pushNavigateAsPopstate(args)` → `navigate(args)` *without* marking.
  The deliberate exception, used only by logo-reset (item 3).

Replace every raw push `navigate()` call with one of the two. No
behavioural change today — the value is making intent explicit and
removing the footgun.

`closeDetail` (item 1) uses neither helper because it calls
`history.back()`, not `navigate()`; its `markUserInitiatedNavigation()`
call is inline.

**Replace-only sites stay raw.** `traversal-onNavigate` and
`default-injection` use `navigate({ replace: true })`, which doesn't fire
popstate, so the user-initiated flag is moot. Add a comment at each
explaining why they don't need the helper. (If a future change converts
either to a push, the contributor will have to think about marking — which
is the prompt we want.)

### 3. Logo-reset switches to `pushNavigateAsPopstate()`

**Today:** `resetToHome()` followed by raw `navigate()` works because the
raw `navigate()` does not call `markUserInitiatedNavigation()` — so the
resulting effect consumes `false`, giving the reset-to-top semantics the
logo wants. Correct, but fragile: correctness depends on a missing call
rather than a present one. After item 2, the default helper marks
user-initiated, so logo-reset must opt out explicitly.

**Change:** update both logo-reset call sites
([SearchBar.tsx:103](kupua/src/components/SearchBar.tsx#L103) and
[ImageDetail.tsx:548](kupua/src/components/ImageDetail.tsx#L548)) to use
`pushNavigateAsPopstate()`. Add a comment at each explaining why this is
the exception. Worth extracting to a shared `resetToHomeAndNavigate()`
helper while you're there — both sites currently duplicate
`resetToHome(() => navigate({ to: "/search", search: DEFAULT_SEARCH }))`.

The `suppressNextRestore` flag set inside `resetToHome()` stays as is —
it's the safety valve preventing stale buffer contamination during the
transition, separate from the user-initiated mechanism.

### 4. Density toggle stays a push — lock with an e2e and a comment

**Today:** toggling grid ↔ table calls `useUpdateSearchParams({ density })`
without `replace: true`, so it pushes. Combined with the display-only-key
dedup, `back` after a density toggle changes the view but leaves URL
params and store state untouched. Correct per the philosophy (density is a
useful content-related view) but not explicit anywhere as a deliberate
choice.

**Change:** no behavioural code change. Add a comment at the density-toggle
call site ([StatusBar.tsx:42](kupua/src/components/StatusBar.tsx#L42))
explaining the push choice. Add an e2e (back-across-density preserves
scroll position and re-toggles density) to lock it in.

### 5. `metadata-click-to-search` stays a single push — lock with an e2e

**Today:** clicking a metadata value link in the detail sidebar calls
`useUpdateSearchParams` with the new query *and* `image: undefined`,
combining two semantic actions (new query + close detail) into one push.
Splitting them would insert a redundant `[list@<previous query>]` entry
the user never asked to visit — a surprise, not a useful view. The list
of the previous query is reachable one further back from the detail entry
anyway.

**Change:** no code change. Add an e2e (metadata-click pushes exactly one
entry; back returns to detail with the old query) to lock the behaviour
in.

### 6. FullscreenPreview Backspace inherits item 1; doc comment updated

`FullscreenPreview` is divorced from history (browser Fullscreen API only,
no `navigate()`). Two scenarios:

- **From list/grid** (`f` from focus A → arrow-traverse to P → Esc /
  Backspace / `f`): exits to grid/table with focus on P. **Correct as-is,
  no change.** Fullscreen preview is a transient peek; focus on P is
  preserved via store state.
- **From ImageDetail** (in detail at P → `f` → Backspace): today closes
  the detail and lands on grid/table at P, skipping any forward re-entry
  into detail. After item 1, ImageDetail's Backspace handler — which
  already calls `closeDetail()` — automatically becomes history-aware:
  detail at P remains forward-reachable. Esc and double-click stay
  divorced (they exit fullscreen mode only and remain in detail at P).
  After Backspace + forward, re-open detail at P **non-fullscreen**;
  fullscreen is a UI mode of detail, not a separate URL state.

**Change:**

- Update the doc comment at the top of
  [FullscreenPreview.tsx](kupua/src/components/FullscreenPreview.tsx) to
  reflect the new history-aware Backspace semantics.
- Add an e2e: enter detail → `f` → Backspace → forward → re-opens detail
  at P in non-fullscreen.

### Audit table — every history-touching call site (your checklist)

One row per site. The "Implementation action" column tells you exactly
what to do; cross-reference the item number above for full rationale.
The "Existing E2E?" column flags where production behaviour today has
zero test defence — those rows need new tests *before* the code change,
to lock in current behaviour as a baseline regression check, then
updated after the change to assert the new behaviour.
**Update the "Today's behaviour" column post-change** so this table
reflects the new reality by the end of the session.

| Site | File:line | Push or replace | Marks user-initiated? | Today's back/forward behaviour | Existing E2E? | Implementation action |
|---|---|---|---|---|---|---|
| `index-redirect` | [routes/index.tsx:17](kupua/src/routes/index.tsx#L17) | replace (TSR redirect) | n/a | Invisible; `/` never in stack. | none | No change. |
| `image-redirect` | [routes/image.tsx:17](kupua/src/routes/image.tsx#L17) | replace (TSR redirect) | n/a | Old kahuna URL replaced with `/search?image=:id`. | none | No change. |
| `default-injection` | [hooks/useUrlSearchSync.ts:86](kupua/src/hooks/useUrlSearchSync.ts#L86) | replace | no | Paramless URL replaced with `?nonFree=true`; user never sees it. | none | ✅ Done (item 2): stays raw. Comment added noting helpers are push-only. |
| `enterDetail-grid` | [components/ImageGrid.tsx:387](kupua/src/components/ImageGrid.tsx#L387) | push | **yes** (via `pushNavigate`) | Back removes `?image=` (display-only dedup, no re-search). Forward re-adds. | yes (tests #6, #7, #8) | ✅ Done (item 2): switched to `pushNavigate()`. |
| `enterDetail-table` | [components/ImageTable.tsx:440](kupua/src/components/ImageTable.tsx#L440) | push | **yes** (via `pushNavigate`) | Same as `enterDetail-grid`. | yes (tests #6, #7, #8) | ✅ Done (item 2): switched to `pushNavigate()`. |
| `closeDetail` | [components/ImageDetail.tsx:240](kupua/src/components/ImageDetail.tsx#L240) | **history.back()** | **yes** (inline `markUserInitiatedNavigation`) | Pops detail entry; forward re-opens detail. Deep-link synthesis on cold loads (paste/bookmark/reload) ensures `history.back()` stays inside kupua. Skipped for SPA-entered detail (list entry already in history). | yes (tests #6, #7, #8, #9, #10, #11) | ✅ Done (item 1): `markUserInitiatedNavigation(); history.back();` + conditional synthesis (SPA-entry flag guard, no `history.length` gate). |
| `traversal-onNavigate` | [components/ImageDetail.tsx:210](kupua/src/components/ImageDetail.tsx#L210) | replace | no | Overwrites `?image=X` → `?image=Y`; back goes to list. | none | ✅ Done (item 2): stays raw. Comment added noting helpers are push-only. |
| `logo-reset-searchbar` | [components/SearchBar.tsx:103](kupua/src/components/SearchBar.tsx#L103) | push | **no** (via `pushNavigateAsPopstate`) | Push home; back returns to previous search context, popstate semantics reset to top. | **yes** (test #13) | ✅ Done (item 3): switched to `pushNavigateAsPopstate()`. Comment added. |
| `logo-reset-detail` | [components/ImageDetail.tsx:555](kupua/src/components/ImageDetail.tsx#L555) | push | **no** (via `pushNavigateAsPopstate`) | Same as above; also strips `?image=`. | **yes** (test #14) | ✅ Done (item 3): switched to `pushNavigateAsPopstate()`. Comment added. |
| `metadata-click-to-search` | [components/ImageMetadata.tsx:80](kupua/src/components/ImageMetadata.tsx#L80) | push | yes (via `useUpdateSearchParams`) | Push new query + strip `image=` in one navigate; back reopens detail with old query. | **yes** (test #15) | ✅ Done (item 5): no code change; e2e + comment added. |
| `cqlSearch-debounced` | [components/SearchBar.tsx:65](kupua/src/components/SearchBar.tsx#L65) | push (1st keystroke) + replace (rest) | yes | First keystroke of a new typing session pushes the pre-edit URL via `history.pushState` so the previous context is reachable via back. Subsequent keystrokes replace (intermediate "c", "ca", "cat" don't pollute history). | yes (tests #2, #5) | **Changed.** Added `history.pushState` on first keystroke (when debounce timer is null). |
| `cqlSearch-clear` | [components/SearchBar.tsx:72](kupua/src/components/SearchBar.tsx#L72) | push | yes | Discrete commit; back restores previous query. | none | No change. |
| `density-toggle` | [components/StatusBar.tsx:42](kupua/src/components/StatusBar.tsx#L42) | push | yes | Back toggles density back; dedup bails (no re-search). | **yes** (test #12) | ✅ Done (item 4): no behavioural change; comment + e2e added. |
| `filter-toggle` | [components/SearchFilters.tsx:49+](kupua/src/components/SearchFilters.tsx) | push | yes | Discrete commit; back fires new search, resets offset. | none (sort covers same mechanism) | No change. |
| `sort-change` | [components/SearchFilters.tsx:83+](kupua/src/components/SearchFilters.tsx), [components/ImageTable.tsx:859+](kupua/src/components/ImageTable.tsx) | push | yes | Discrete commit. | yes (tests #1, #4) | No change. |
| `date-filter` | [components/DateFilter.tsx:195+](kupua/src/components/DateFilter.tsx) | push | yes | Discrete commit. | none | No change. |
| `facet-click` | [components/FacetFilters.tsx:170](kupua/src/components/FacetFilters.tsx#L170) | push | yes | Discrete commit. | none | No change. |
| `table-cell-click` | [components/ImageTable.tsx:985+](kupua/src/components/ImageTable.tsx) | push | yes | Discrete commit. | none | No change. |
| `error-hard-reload` | [components/ErrorBoundary.tsx:42](kupua/src/components/ErrorBoundary.tsx#L42) | full page load | n/a | Tears down SPA; recovery escape hatch. | none | No change. |

Test numbers refer to `e2e/local/browser-history.spec.ts` (15 tests total after baseline tightening + debounce fix).

If you discover a history-touching site **not** in this table, stop and ask
before changing anything (per the handoff).

**Where today's coverage gap matters most:**

*(All gaps below have been filled during baseline tightening — preserved for
historical reference.)*

- ~~**Both logo-reset sites are completely untested.**~~ ✅ Tests #13 + #14.
- ~~**`closeDetail` button path is only indirectly tested.**~~ ✅ Tests #7, #8
  exercise close-button and Backspace affordances; test #9 covers SPA
  open-close cycles.
- ~~**`metadata-click-to-search`, `density-toggle`** have no current
  coverage.~~ ✅ Tests #15, #12.


### Cross-cutting insights worth knowing

- **`useUpdateSearchParams` is the golden path.** 10 of the 19 sites above
  go through it; they call `markUserInitiatedNavigation()` synchronously
  before `navigate()` and are safe by construction. Items 2 + 3 bring the
  raw push sites up to the same level of explicitness.
- **`URL_DISPLAY_KEYS` is today's safety net for raw sites.** Sites
  touching only `image`/`density` are protected by the dedup guard. After
  item 2, this protection becomes belt-and-braces — still correct, but no
  longer load-bearing.
- **`metadata-click-to-search` is the only site combining query change +
  `image` stripping in one navigation.** Decided as a single push (item 5);
  call this out in code comments so future readers don't "tidy" it apart.

### Why this matters before snapshot work

The snapshot scheme adds a per-entry payload that is read on popstate and
written on push. If the push/replace decisions or the popstate-vs-user
distinctions are inconsistent across call sites, the snapshot payloads
will be inconsistent too — and snapshot bugs are far harder to diagnose
than today's "back goes to offset 0" simplicity. Tighten the substrate
first.

---

## Future polish: scroll-position restoration on back/forward

Reset-to-top (Case B / C) is *correct* but coarse. Kupua already owns the
machinery to land back/forward closer to where the user left each search:

| Capability | Where | What it does |
|---|---|---|
| `seek(globalOffset)` | `src/stores/search-store.ts` | Random-access jump; clamps to `total`; rebuilds buffer at any depth |
| `restoreAroundCursor(imageId, cursor, offset)` | `src/stores/search-store.ts` | Rebuilds buffer around an exact ES sort cursor — robust to insertions |
| `storeImageOffset` / `getImageOffset` | `src/lib/image-offset-cache.ts` | sessionStorage-backed `{ offset, cursor, searchKey }` per image ID |
| `extractSortValues(image, orderBy)` | `src/lib/image-offset-cache.ts` | Pure in-memory cursor extraction — no ES round-trip needed |
| `getViewportAnchorId()` | `src/hooks/useDataWindow.ts` | The image at viewport centre — natural "phantom" anchor when nothing is focused |
| `buildSearchKey(params)` | `src/lib/image-offset-cache.ts` | Fingerprint of query/sort/filters; lets us reject stale snapshots |
| `suppressNextRestore` | `src/stores/search-store.ts` | One-shot abort flag; the safety valve that already protects logo-reset |

### What "in practice" looks like

The per-history-entry snapshot we'd capture before each push:

```ts
type HistorySnapshot = {
  searchKey: string;          // buildSearchKey of the params being LEFT
  anchorImageId: string | null; // explicit focus, else viewport anchor
  anchorCursor: SortValues | null; // extractSortValues of the anchor image
  anchorOffset: number;       // global offset of the anchor at time of push
  scrollTop: number;          // raw px fallback for the no-anchor case
};
```

Written **before** `navigate()` in `useUpdateSearchParams` (and at the raw
`navigate()` sites: enterDetail, logo, default redirect — all of those would
gain a `markPushSnapshot()` helper alongside `markUserInitiatedNavigation()`).
Read by `useUrlSearchSync` when `consumeUserInitiatedFlag()` returns `false`.

### Scenario tables — current vs projected

#### Series 1 — filters then back

| Step | URL | Today: history | Today: on back, lands… | Projected: on back, lands… |
|---|---|---|---|---|
| 1. Land on home | `?nonFree=true` | entry A | — | — |
| 2. Type "cats" (debounced) | `?query=cats&…` | A replaced in place | — | — |
| 3. Toggle "hasCrops=true" | `?query=cats&hasCrops=true&…` | push → entry B | — | — |
| 4. Scroll to result #800, focus it | (no URL change) | still B | — | — |
| 5. Press **Back** | `?query=cats&…` | A active | offset 0 of "cats" search, no focus | offset ≈ 800 of "cats" via `restoreAroundCursor(focusedAtPushTime)` |
| 6. Press **Forward** | `?query=cats&hasCrops=true&…` | B active | offset 0 of cats+crops, no focus | offset ≈ 800 of cats+crops via stored snapshot |

#### Series 2 — sort change

| Step | URL | Today: history | Today: on back, lands… | Projected: on back, lands… |
|---|---|---|---|---|
| 1. Search "dogs", scroll to #500 | `?query=dogs&…` | entry A | — | — |
| 2. Change sort to oldest-first | `?query=dogs&orderBy=uploadTime&…` | push → B; "Never Lost" finds the same image at its new offset | — | — |
| 3. Press **Back** | `?query=dogs&…` | A active | offset 0 of "dogs" newest-first | offset ≈ 500 of "dogs" newest-first (anchor cursor still resolves) |

#### Series 3 — open detail, back to list

| Step | URL | Today: history | Today/Projected behaviour |
|---|---|---|---|
| 1. Search "cats", scroll to #800, focus image X | `?query=cats&…` | entry A | — |
| 2. Click X | `?query=cats&…&image=X` | push → B (raw navigate, display-only) | overlay opens |
| 3. Press **Back** | `?query=cats&…` | A active | **Already works today** — display-only dedup, position preserved (Case A) |

No change needed; included to make explicit that this case does **not** route
through the new snapshot path.

#### Series 4 — multiple deep dives

| Step | URL | Today: history | Today: on first back | Projected: on first back |
|---|---|---|---|---|
| 1. Search "cats", scroll to #2000 | `?query=cats` | A | — | — |
| 2. Switch to "dogs", scroll to #4000 | `?query=dogs` | push B | — | — |
| 3. Switch to "birds", scroll to #100 | `?query=birds` | push C | — | — |
| 4. **Back** | `?query=dogs` | B active | offset 0 of "dogs" | offset ≈ 4000 of "dogs" |
| 5. **Back** | `?query=cats` | A active | offset 0 of "cats" | offset ≈ 2000 of "cats" |
| 6. **Forward** | `?query=dogs` | B active | offset 0 of "dogs" | offset ≈ 4000 of "dogs" |

#### Series 5 — back across logo reset

| Step | URL | Today: history | Projected: on back |
|---|---|---|---|
| 1. Search "cats", scroll to #800 | `?query=cats` | entry A | — |
| 2. Click logo | `?nonFree=true` | push B; `suppressNextRestore` set | — |
| 3. **Back** | `?query=cats` | A active | offset ≈ 800 of "cats" — same mechanism as Series 1 |

### Implementation sketch

1. **Storage choice.** TanStack Router (1.168) writes its own keyed object into
   `history.state` and replaces it on every navigation, so piggybacking is
   fragile. Recommended: a parallel `Map<historyKey, HistorySnapshot>` in
   memory, keyed by the router's per-entry `state.key` (which TSR mints and
   exposes on `router.history.location.state.key`). Hard reload drops the map,
   which is acceptable — hard reload is already a fresh start.
2. **Capture point.** Add `markPushSnapshot(snapshot)` next to
   `markUserInitiatedNavigation()` in `lib/orchestration/search.ts`. Call it
   from every push site (`useUpdateSearchParams`, `enterDetail`, logo reset,
   any future raw push). Replace-only navigations skip it (the existing entry's
   snapshot stays valid).
3. **Restore point.** In `useUrlSearchSync` when `isPopstate=true`:
   - Look up the snapshot for the current `state.key`.
   - If `snapshot.searchKey === buildSearchKey(searchParams)` → restore.
     Otherwise discard (URL was edited by hand; reset to top).
   - Prefer `restoreAroundCursor(anchorImageId, anchorCursor, anchorOffset)`
     when an anchor exists. Fall back to `seek(snapshot.anchorOffset)` when
     only the offset is known. Fall back to today's `offset: 0` when nothing
     is captured.
4. **Display-only changes still skip restore.** The dedup guard fires before
   any of this; back-from-image-detail keeps using the cheaper path.

### Risks & open questions

| Risk | Mitigation |
|---|---|
| TSR overwriting the snapshot in `history.state` | Use a parallel in-memory `Map`, key by `state.key` |
| Snapshot Map grows unbounded | Cap at N entries (LRU); on overflow, popstate falls back to offset-0 |
| Anchor image deleted between push and pop | `restoreAroundCursor` already tolerates this via cursor-based `search_after` |
| Stale `total` clamp on first popstate frame | Either await the count refresh before seeking, or seek optimistically and clamp on settle |
| Race with `suppressNextRestore` during logo reset | Series 5 shows it composes naturally — back from a reset just restores into the previous entry, which is what the user expects |
| Bfcache / page restore | Map is in memory of the same JS context, so bfcache restore preserves it; hard navigation loses it (acceptable) |

### Effort sizing

- **Small additive change.** No new ES capabilities, no store refactor.
- Three files do most of the work: `lib/orchestration/search.ts` (add
  `markPushSnapshot` + map), `hooks/useUrlSearchSync.ts` (call it before
  `navigate()`, consume on popstate), and a thin helper to compute the
  snapshot from store state.
- E2E coverage: extend `e2e/local/browser-history.spec.ts` with two new tests
  matching Series 1 and Series 4.

### Hypothetical extension: surviving page reload

The sketch above keeps snapshots in module-scope memory, which dies with the
JS context on Cmd+R or Shift+Cmd+R. (Both reload variants tear down the JS
context; they differ only in whether the HTTP cache is bypassed. `sessionStorage`
and `history.state` survive both; an in-memory `Map` does not.) If we wanted
list-position survival to match the symmetry users already get on the image
detail (offset cache restores the counter on reload), we *could* swap the
storage tier without changing the rest of the design.

**Sketch (not decided):**

- Persist the snapshot under `kupua:histSnap:<state.key>` in `sessionStorage`,
  reusing the same tier the image-offset cache uses.
- TSR's `state.key` is itself stored in `history.state`, which the browser
  persists per entry across reload — so the lookup key is stable.
- On *mount* (not just on popstate), look up the current entry's `state.key`
  and, if `snapshot.searchKey === buildSearchKey(searchParams)`, restore.
  Mismatched fingerprints are discarded the same way the image-offset cache
  rejects stale entries.
- Cap at ~50 entries with LRU eviction; sessionStorage has a few-MB budget,
  but unbounded growth over a long session is still wasteful.

**Non-tech considerations:**

- **Composes with the image-offset cache.** Today, reloading on `?image=X`
  restores the overlay at the right counter position; reloading on the list
  restores nothing. Persisting snapshots would make the two paths symmetric.
- **User mental model.** People reload for two reasons: "something looks
  broken, give me a clean slate" and "refresh the data, keep my place".
  Surviving reload serves the second well; the first still has escape hatches
  (logo click, new tab).
- **Per-tab is the right scope.** `sessionStorage` is per-tab, matching the
  expectation that opening the same URL in a new tab should not inherit
  position from another tab. `localStorage` would over-share.
- **Wider staleness window.** In-memory snapshots are at most session-length
  old; persisted ones can be hours old after a coffee break. Cursor-based
  `restoreAroundCursor` lands on the right *content* even when the offset
  has shifted, so the failure mode is just a counter that jumps slightly
  after restore.
- **Test surface.** Each new back/forward e2e would gain a sibling
  `.reload()` variant — cheap to add.

If we go ahead with the future-polish work at all, starting with sessionStorage
storage from day one (rather than in-memory then migrating) costs nothing extra
and gives reload survival for free.

### Hypothetical extension: bookmarking the traversal entry point

Today, traversal inside the detail view uses `replace`, so a deep wander
through a result set leaves no trail in history. That is correct and should
stay — by the same logic that scrolling leaves no trail. But there is one
piece of information worth preserving that the current scheme discards: **the
image the user opened to start the wander**.

**Proposed behaviour (A = entry image, P = exit image, A ≠ P):**

| Step | URL | Renders |
|---|---|---|
| 1. On list, focused on A | `?q=…` | list, focus A |
| 2. Click A | `?q=…&image=A` | detail A |
| 3. Traverse to P (replace) | `?q=…&image=P` | detail P |
| 4. Close detail OR browser back | `?q=…` | list, focus P |
| 5. **Browser back** | `?q=…` | list, focus A |
| 6. Browser back again | `[prev search context]` | as today |

If the user came back to A before closing (A = P at close time), behaviour
collapses to today's: close uses `replace`, no extra entry, one back goes to
the previous search context.

**The mechanism — and the constraint that complicates it:**

The pre-open list entry is **already in history**. It already has (or under
the scroll-restoration scheme, will have) a snapshot anchored at A. The
intent is for the close-button path and the browser-back-from-detail path
to converge on list@P, with one further back reaching list@A.

The close-button path is straightforward: on close, push a bare-list entry
(URL `?q=…`, snapshot=P) instead of today's replace. The post-close back
stack ends `[list@A]  [list, snap=P]` and one back lands on list@A.

The browser-back-from-detail path is the difficulty. For that path to also
land on list@P, an entry whose URL is bare-list (no `image=`) and whose
snapshot=P must already sit between `[list@A]` and the active detail entry
*before* the back press. The browser's history API exposes only one
rewrite primitive — `history.replaceState(state, "", url)` rewrites the
**currently active** entry in place, silently. Non-active entries are
unreachable without navigating to them first.

Two viable insertion points exist, both with cost:

- **Option α — at first traversal away from A, rewrite the current entry,
  then push the new detail entry, in the same tick.** Concretely:
  `replaceState` the current `[detail@A]` entry to URL `?q=…` (bare list,
  snap=B), then `pushState` (via TSR navigate) to `?q=…&image=B`. The
  current entry becomes the bare-list bookmark; the new entry is the
  active detail. In Chromium and Firefox, same-tick history mutations are
  coalesced — only the final URL is painted to the address bar, and React
  commits once at the end of the tick. No rendered flicker, no URL-bar
  flicker. (Other engines not evaluated; out of scope for kupua.)

- **Option β — leave both entries with detail URLs, and on the popstate
  that lands on the would-be list@P entry, immediately replace the URL to
  bare-list.** This guarantees a rendered detail→list transition on that
  back press: visible flicker. Disqualified by the no-flicker rule.

A third option exists in principle but is out of scope: **decouple the
list-vs-detail render decision from the URL** so that two entries with the
same URL `?q=…&image=X` can render differently based on per-entry snapshot.
This breaks the URL-as-source-of-truth invariant that the dedup guard,
deep-linking, copy-paste, and `routes/search.tsx` all rely on. Not a small
change.

The user-facing behaviour described in the table is coherent and desirable,
the per-entry snapshot framework supports it conceptually (two entries can
share a URL and render differently — the existing list@P after close already
does this), and Option α produces the second snapshotted bare-list entry
without observable side effects on the target browsers. Recommended path:
implement Option α with a one-off browser check during the prototype to
confirm the coalescing assumption holds in current Chrome and Firefox
versions.

**Hard constraint: closing or browser-back from detail must always land on
the current detail image P.** This is non-negotiable and rules out any
variant that defers the bookmark-entry push to close time. A close-only
variant would make browser-back-from-detail pop directly to `list@A`,
skipping P — which violates the invariant. Option α satisfies the
constraint because the bookmark is inserted *during* the detail session,
so the active detail entry's pop target is the bookmark (which renders
as `list@P`), not `list@A`.

**Residual cost of Option α: one stale bookmark per wander-and-return.**
If the user traverses A→P→A and then closes, the stack is
`[prev]  [list@A]  [bare-list snap=P]  [list@A snap=A]`. The middle entry
is a stale bookmark for a position the user no longer cares about; it
adds one extra back-press between the post-close list and the previous
search context. The browser exposes no API to remove or rewrite a
non-active history entry, so the bookmark cannot be retracted once
pushed. Acceptable trade-off given the rarity of wander-and-return and
the importance of the hard constraint above.

**Composes with the rest of Future polish.**

- Requires the snapshot infrastructure from the main proposal — doesn't make
  sense as a standalone change.
- Inherits reload survival automatically if the sessionStorage variant is
  chosen.
- Display-only-key dedup in `useUrlSearchSync` is unaffected; this is a push
  decision in `closeDetail`, not a sync-effect change.

**Risks:**

| Risk | Mitigation |
|---|---|
| Extra back-press to escape search after every detail wander | Only when A≠P; A=P collapses to today's behaviour. Not "every detail session" — only the meaningful ones. |
| User confusion about what "back" does | The semantic is consistent: back undoes the last *push*. We're just making one more action push-worthy. |
| Inconsistency with close-button vs browser-back | Both paths converge — close lands on list@P, browser-back-from-detail also lands on list@P (the new pushed entry), then back from there → list@A in both cases. |
| Double-counting in history depth metrics | n/a — kupua doesn't track depth. |

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
