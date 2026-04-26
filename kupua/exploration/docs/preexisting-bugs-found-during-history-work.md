# Pre-existing bugs found during browser history future polish

Bugs discovered during Phases 1–3 of snapshot-based position restoration.
None caused by our work; all reproducible on commits before Phase 1.

---

## Bug 1: Null zone scrolling in positionMap mode doesn't extend

**Repro (simplest):**
1. Open kupua, search +city:Dublin (to be in <1k twotier positionMap mode)
2. Switch to Last modified sort (it has a massive nullzone without Last modified recorded items)
3. Scroll to 50%
4. Scroll up or down beyond [page size? buffer? I don't know I'm not an engineer]

**Actual:** after a while user scrolls into nothingness, results never fill in

## Bug 2: Flash of intermediate results (systemic — sort, popstate, any no-focus search)

**Repro (simplest):**
1. Open kupua, load results in grid (no image focused/clicked)
2. Scroll down several pages so you're deep in the buffer
3. Change sort order via the dropdown
4. Observe: brief flash of old-sort first-page images before new results arrive

Also visible on popstate without snapshot, query changes without focus, and any
search-triggering URL change where `focusPreserveId` is null.

**Actual:** 1+ frames of wrong content (old buffer at scrollTop=0) before new results.
**Expected:** Only pre-state and post-state should ever be visible; no intermediate render.

### Root cause: timing mismatch between Effect #7 and useUrlSearchSync

The React render cycle when URL params change (sort dropdown, popstate, anything):

1. URL changes → TanStack Router provides new `searchParams`
2. React re-renders
3. **`useLayoutEffect` (Effect #7 in useScrollEffects)** fires — **before paint**
   → resets `scrollTop = 0` (because no `preserveId`)
4. **Browser paints** — user sees old buffer at scrollTop=0 (FLASH)
5. **`useEffect` (useUrlSearchSync)** fires — **after paint** → calls `search()`
   → sets `loading: true` → eventually replaces buffer

The core issue: Effect #7 resets scroll eagerly (same frame as render), but
`search()` doesn't start until after paint. Between steps 3–5 the user sees
**old buffer data at scrollTop=0** — the flash.

### Timeline for sort-only, no-focus:

| Frame | scrollTop | Buffer | loading | User sees |
|-------|-----------|--------|---------|-----------|
| 0 | deep | old sort | false | Old sort at deep position |
| 1 | **0** | old sort | false | **Old sort first page** ← FLASH |
| 2 | 0 | old sort | true | Still old sort (search in flight) |
| N | 0 | **new sort** | false | New sort first page ✓ |

### Why sort-around-focus paths DON'T flash

When `preserveId` is non-null (explicit focus OR phantom viewport anchor):
- Effect #7 saves the viewport ratio and **returns without resetting scroll**
- `search(focusId)` keeps `loading: true` and old buffer visible
- `_findAndFocusImage` atomically swaps buffer + bumps `sortAroundFocusGeneration`
- Effect #9 positions scroll in the same `useLayoutEffect` frame as the render
- Zero intermediate frames — perfect handoff

### Why sort-only-no-focus is the gap

Effect #7's `preserveId` logic:
```ts
const preserveId = focusedImageId ?? (!sortOnly ? getViewportAnchorId() : null);
```
Sort-only relaxation: when `sortOnly=true` and no explicit focus, `preserveId=null`.
Effect #7 falls through to `scrollTop = 0` — the flash.

### Sub-issue: setParams/search atomicity

Even within useUrlSearchSync, there's a secondary gap:
- `setParams({ offset: 0 })` — Zustand set #1 (updates params, triggers subscribers)
- `search(null)` — Zustand set #2 (sets `loading: true`)
React may render between these two `set()` calls, briefly showing offset-0 params
with `loading: false` (though in practice Effect #7's scroll reset is more visible).

### Fix: Option B — deferred scroll reset via generation counter

**Approach:**
1. Add `_scrollResetGeneration` counter to the search store
2. Effect #7: instead of eagerly resetting scroll for no-focus changes, just return
   (leave the old scroll position — stale but harmless since new data is coming)
3. `search()` no-focus path (the `else` branch at ~L1830): when it atomically sets
   `loading: false` + new buffer + `bufferOffset: 0`, also bump `_scrollResetGeneration`
4. New `useLayoutEffect` watches `_scrollResetGeneration` and resets scroll in the
   same frame as the data swap → zero-flash transition

This preserves the "sort change = reset to top" UX while ensuring the scroll reset
only happens **atomically with the data swap**, never before it.

**Files to change:**
- `src/stores/search-store.ts` — add `_scrollResetGeneration`, bump in `search()` else branch
- `src/hooks/useScrollEffects.ts` — Effect #7: don't eagerly reset for search-triggering
  changes; new effect watches `_scrollResetGeneration`

**Rejected alternatives:**
- Option A (always use viewport anchor): forces "stay at anchor" UX for sort-without-focus,
  removing ability to control the UX independently of implementation
- Option C (show skeleton while loading): worse UX, complex implementation
