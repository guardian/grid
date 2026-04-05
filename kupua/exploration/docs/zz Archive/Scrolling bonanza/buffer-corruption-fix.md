# Buffer Corruption Fix — Complete Analysis

> **Date:** 2026-03-31
> **Bug introduced by:** commit `3fca3d676` ("Windowed scroll + Scrubber — Polish, not Russian")
> **Last correct commit:** `31512e9d8`
> **Status:** Fixed (defense in depth across 4 files, 5 layers)

---

## 1. What the bug was

After seeking to a deep position via the scrubber and then performing any
action that resets scroll to the top (logo click, metadata click-to-search),
the grid would land at ~index 170-190 instead of index 1. The buffer
contained 400 items (should be 200): the first 200 were stale images from
the deep-seek position (~2022), the second 200 were correct first-page
images (~2026).

**Symptoms:**
- Grid not scrolled to top after logo click
- Wrong images visible at top of grid
- `scrollTop = 6969` instead of `0` (prepend scroll compensation)
- 200 position-map collisions in `imagePositions`
- Cross-browser (Chrome and Firefox)

---

## 2. Root cause (the race)

The bug is a **synchronous→async race between scroll reset and buffer
extension**. Here's the exact causal chain:

```
User clicks logo (or metadata value, or any scroll-resetting action)
  │
  ├─ SYNCHRONOUS: resetScrollAndFocusSearch()
  │   ├─ el.scrollTop = 0
  │   └─ el.dispatchEvent(new Event("scroll"))     ← fires SYNCHRONOUSLY
  │       └─ handleScroll()
  │           └─ reportVisibleRange(0, ~50)
  │               └─ startIndex=0 ≤ EXTEND_THRESHOLD
  │                  bufferOffset = 576211 > 0      ← still at deep offset!
  │                  └─ extendBackward() FIRES       ← THE ROOT PROBLEM
  │                      └─ await searchAfter(PIT)   ← yields to microtask queue
  │
  ├─ SYNCHRONOUS: store.search()
  │   ├─ _rangeAbortController.abort()               ← too late for the PIT-404 retry
  │   ├─ closes old PIT
  │   └─ await searchAfter(first page)               ← yields
  │
  │  ~~~ microtask boundary ~~~
  │
  ├─ search() result arrives → buffer = 200 correct items at offset 0 ✅
  │
  │  ~~~ ~300ms later ~~~
  │
  └─ extendBackward() PIT-404 retry completes
      └─ PREPENDS 200 stale items to the fresh buffer 🐛
         └─ buffer = 400 items, scrollTop += 6969
```

**Why the PIT-404 retry escapes abort:**
When `search()` calls `_rangeAbortController.abort()`, `extendBackward`'s
`searchAfter` has already received a 404 response (PIT closed). The 404
resolves the fetch promise *before* the abort signal propagates. The catch
clause retries without PIT, creating a new `fetch()` that isn't covered by
the already-aborted signal. This retry succeeds and returns stale data.

**What changed in commit 3fca3d676:**
The commit removed `_seekCooldownUntil = Date.now() + 500` from the seek
data-arrival path. In the old code, the cooldown was refreshed when seek
results arrived, so it was always active when the user clicked the logo
(typically <500ms after results rendered). Without the refresh, the cooldown
(set at seek START) expired ~1-2 seconds before the logo click.

---

## 3. What the fix does

Five layers of defense, each independently sufficient for the primary bug:

### Layer 1 (Primary): `resetScrollAndFocusSearch()` calls `abortExtends()`

**File:** `src/lib/scroll-reset.ts`

```typescript
export function resetScrollAndFocusSearch() {
  // Abort in-flight extends and set cooldown BEFORE the synthetic scroll
  useSearchStore.getState().abortExtends();

  // ... then scrollTop = 0, synthetic scroll event, etc.
}
```

**What it does:** Sets a 2-second cooldown and aborts the range controller
*before* the synthetic scroll event fires. When `extendBackward` checks its
guard (`Date.now() < _seekCooldownUntil`), it returns immediately.

**Why this is the generic fix:** Every caller that resets scroll position
goes through `resetScrollAndFocusSearch()`. The fix is in one place, not
scattered across click handlers.

### Layer 2: `search()` sets the cooldown

**File:** `src/stores/search-store.ts` (inside `search()`)

```typescript
_rangeAbortController.abort();
_rangeAbortController = new AbortController();
_seekCooldownUntil = Date.now() + 2000;  // ← NEW
```

**What it does:** Any `search()` call (from logo click, metadata click, URL
sync, CQL input change) sets a 2-second cooldown. This catches the case
where `scrollTop = 0` is set by `useLayoutEffect` in ImageGrid/ImageTable
(triggered by URL param change), which does NOT go through
`resetScrollAndFocusSearch()`.

**Why this matters for metadata clicks:** When a user clicks a metadata
value from ImageDetail, the flow is:
1. URL changes → `searchParams` changes
2. `useLayoutEffect` fires → `el.scrollTop = 0` (no synthetic scroll)
3. `useEffect` fires → `search()` (which now sets cooldown)
4. Buffer changes → `handleScroll()` fires → `extendBackward` blocked

### Layer 3: Seek cooldown refreshed at data arrival

**File:** `src/stores/search-store.ts` (inside `seek()`, at data arrival)

```typescript
_seekCooldownUntil = Date.now() + 500;
```

**What it does:** Restores the line that was removed in commit 3fca3d676.
Gives the virtualizer 500ms to settle at the correct scroll position after
seek data arrives. Without this, extends fire immediately when the
virtualizer renders the new buffer.

### Layer 4: Abort check before PIT-404 retry

**File:** `src/dal/es-adapter.ts` (inside `searchAfter` catch clause)

```typescript
if (signal?.aborted) return { hits: [], total: 0, sortValues: [] };
```

**What it does:** If the caller already aborted (e.g. `search()` closed the
PIT and started a new search), don't retry the failed request. This catches
the microtask race in cases where abort propagates fast enough.

### Layer 5: `abortExtends()` exposed on the store

**File:** `src/stores/search-store.ts` (new action)

```typescript
abortExtends: () => {
  _rangeAbortController.abort();
  _rangeAbortController = new AbortController();
  _seekCooldownUntil = Date.now() + 2000;
  set({
    _extendForwardInFlight: false,
    _extendBackwardInFlight: false,
  });
},
```

**What it does:** Provides an imperative "kill all extends" action.
Currently called by `resetScrollAndFocusSearch()` (Layer 1). Available for
future callers that need to suppress extends before manipulating scroll.

---

## 4. Files changed (complete diff summary)

### `src/stores/search-store.ts`
| Change | Lines | Purpose |
|--------|-------|---------|
| `abortExtends` added to `SearchState` interface | ~255 | Type safety |
| `_seekCooldownUntil = Date.now() + 2000` in `search()` | ~753 | Layer 2 |
| `abortExtends` implementation | ~973-981 | Layer 5 |
| `_seekCooldownUntil = Date.now() + 500` in seek data arrival | ~1436 | Layer 3 |

### `src/lib/scroll-reset.ts`
| Change | Lines | Purpose |
|--------|-------|---------|
| Import `useSearchStore` | 25 | Needed for `abortExtends` |
| Call `abortExtends()` before scroll reset | 30 | Layer 1 (primary fix) |
| Updated JSDoc explaining why | 16-21 | Documentation |

### `src/dal/es-adapter.ts`
| Change | Lines | Purpose |
|--------|-------|---------|
| `if (signal?.aborted) return empty` before PIT retry | ~633 | Layer 4 |

### `src/components/SearchBar.tsx`
| Change | Lines | Purpose |
|--------|-------|---------|
| Added `const store = useSearchStore.getState()` | ~135 | Bug fix: `store` was undeclared |
| Removed explicit `abortExtends()` call | — | Now handled inside `resetScrollAndFocusSearch` |

### `src/components/ImageDetail.tsx`
| Change | Lines | Purpose |
|--------|-------|---------|
| Removed explicit `abortExtends()` call | ~379 | Now handled inside `resetScrollAndFocusSearch` |

---

## 5. Consequences and side effects

### What extends are blocked and when

The 2-second cooldown blocks **all** `extendForward` and `extendBackward`
calls for 2 seconds after:
- Any `search()` call (Layer 2)
- Any `resetScrollAndFocusSearch()` call (Layer 1)
- Any explicit `abortExtends()` call (Layer 5)

This is **intentional and safe** because:
- `search()` replaces the entire buffer. Any extend on the old buffer is
  stale. After `search()` completes, the new buffer is at offset 0 with
  the first page. Extending starts naturally when the user scrolls.
- The cooldown clears in-flight flags, so extends aren't permanently stuck.
- The 2-second window is generous. `search()` typically completes in
  <1 second. After that, buffer changes trigger `handleScroll()` which
  updates the visible range, and extends fire normally once the cooldown
  expires.

### What about scroll-mode fill?

`_fillBufferForScrollMode` (eager fetch of all results for small result
sets) runs inside `search()` and uses the same `_rangeAbortController`
signal. It checks `signal.aborted` between pages. The cooldown does NOT
affect scroll-mode fill because it uses `extendForward` in a tight loop
that doesn't go through the `extendForward` guard.

Wait — actually, `_fillBufferForScrollMode` calls the raw `searchAfter`
directly, not the store's `extendForward`. So the cooldown doesn't block
it. ✅

### What about sort-around-focus?

Sort-around-focus calls `_findAndFocusImage` which uses `searchAfter`
directly with the range abort controller signal. It does NOT go through
`extendForward`/`extendBackward`. The cooldown doesn't affect it. ✅

### Does the cooldown suppress legitimate extends?

Only in a narrow window: if the user scrolls to the edge of the buffer
within 2 seconds of a search completing. In practice, the first page of
results fills the viewport, and the user would need to scroll past ~200
items in <2 seconds to trigger an extend. Even if this happens, the extend
just fires 2 seconds later when `handleScroll` fires again on the next
scroll event. No data loss, just a brief delay in loading more results.

### `resetScrollAndFocusSearch()` now imports `search-store`

This creates a dependency from a utility module to the store. There is no
circular dependency:
- `scroll-reset.ts` → imports → `search-store.ts` ✅
- `search-store.ts` does NOT import `scroll-reset.ts` ✅

The `useSearchStore.getState()` call is safe outside React components
because it's a Zustand vanilla store access (no hooks involved).

---

## 6. The metadata-click bug (new, potentially related)

### Repro
1. Fresh app, deep seek
2. Double-click image to enter detail view
3. Click a metadata value (e.g. byline with thousands of results)
4. **Actual:** Search runs correctly, but grid is not scrolled to top
5. **Expected:** Grid scrolls to top

### Analysis

This is the **same class of bug** but through a different code path:

```
Metadata click → updateSearch({ query, image: undefined })
  → URL changes → React renders
  → useLayoutEffect (ImageGrid:439) → el.scrollTop = 0
     (grid was opacity-0 behind ImageDetail, now becoming visible)
  → useEffect (useUrlSearchSync) → search()
     → _rangeAbortController.abort() + cooldown (Layer 2)
     → fetches first page
  → buffer arrives → bufferOffset changes → handleScroll()
     → reportVisibleRange → extendBackward
     → BLOCKED by cooldown ✅
```

With the cooldown now set inside `search()` (Layer 2), the metadata-click
path should be protected. The key difference from the logo-click path:
- Logo click: synthetic scroll fires BEFORE `search()` → needs Layer 1
- Metadata click: `search()` fires from `useUrlSearchSync` effect → Layer 2

**If the metadata-click bug persists after this fix**, the cause is likely
different: the `el.scrollTop = 0` set during `useLayoutEffect` may not
"stick" because the grid container is transitioning from
`absolute inset-0 opacity-0` to `contents` (the CSS class change when
ImageDetail unmounts). This would be a CSS/layout timing issue, not a
buffer corruption issue.

---

## 7. Testing strategy

### Manual verification

1. **Logo click from grid:** Fresh app → deep seek → click logo → should
   land at index 1, scrollTop=0, buffer has 200 items at offset 0
2. **Logo click from ImageDetail:** Fresh app → deep seek → double-click
   image → click logo → same expectations
3. **Metadata click from ImageDetail:** Fresh app → deep seek → double-click
   image → click byline → should see new search results at top
4. **Rapid clicking:** Deep seek → click logo repeatedly → should always
   land at top
5. **Scroll after search:** Click logo → immediately scroll down → extends
   should fire after cooldown (2s), loading more results smoothly

### E2E test sketch

```typescript
test("logo click after deep seek returns to top", async ({ kupua }) => {
  await kupua.goto("/search?nonFree=true");
  await kupua.waitForResults();

  // Deep seek via scrubber
  await kupua.scrubber.seek(0.5); // 50% of total
  await kupua.waitForResults();

  // Verify we're deep
  const offsetBefore = await kupua.getBufferOffset();
  expect(offsetBefore).toBeGreaterThan(1000);

  // Click logo
  await kupua.logo.click();
  await kupua.waitForResults();

  // Verify top
  const offsetAfter = await kupua.getBufferOffset();
  expect(offsetAfter).toBe(0);
  const scrollTop = await kupua.getScrollTop();
  expect(scrollTop).toBe(0);
  const resultCount = await kupua.getResultCount();
  expect(resultCount).toBeLessThanOrEqual(200); // no stale prepend
});
```

---

## 8. Broader implications

### The "any scroll reset on a deep buffer" class of bugs

The root cause is architectural: **any action that sets `scrollTop = 0`
while the buffer is at a non-zero offset can trigger `extendBackward`**.
This includes:

| Trigger | Code path | Protected by |
|---------|-----------|-------------|
| Logo click (grid) | `resetScrollAndFocusSearch` | Layer 1 |
| Logo click (detail) | `resetScrollAndFocusSearch` | Layer 1 |
| Metadata click | `useLayoutEffect` + `search()` | Layer 2 |
| CQL query change | `useLayoutEffect` + `search()` | Layer 2 |
| Filter change | `useLayoutEffect` + `search()` | Layer 2 |
| Sort change | `useLayoutEffect` + `search()` | Layer 2 |
| Home key | `seek(0)` (sets own cooldown) | seek cooldown |

The fix covers all known paths. Future paths that reset scroll should
either:
1. Go through `resetScrollAndFocusSearch()` (preferred), or
2. Call `abortExtends()` explicitly, or
3. Call `search()` which sets the cooldown automatically

### Why not remove the synthetic scroll event?

The synthetic scroll event (`dispatchEvent(new Event("scroll"))`) exists
because programmatic `scrollTop = 0` on `opacity-0` containers may not fire
a native scroll event in all browsers. The virtualizer needs the scroll
event to update its internal state. Removing it would cause the virtualizer
to render stale rows until the next real scroll event.

Instead, the fix keeps the synthetic scroll but ensures `extendBackward` is
blocked when it fires.

