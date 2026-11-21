# Combined Deep Review — 5 Core Files (19 Apr 2026)

> Fresh-agent review of `search-store.ts` (3,558 lines), `useScrollEffects.ts`
> (993 lines), `useDataWindow.ts` (475 lines), `useListNavigation.ts` (556 lines),
> `Scrubber.tsx` (1,189 lines).
> Cross-references the two April 2025 agent reviews attached to the session.

## Overall assessment

This core is in excellent health. ~6,770 lines of the hardest custom logic
in the app — windowed buffer management, scroll orchestration, seek
estimation, null-zone handling, focus preservation across sort/density/seek
transitions — and the architecture is right.

A single Zustand store owns buffer, cursors, and PIT lifecycle. One shared
scroll-effects hook eliminates the duplication that plagues dual-view apps.
The generation-counter pattern for effect triggering is bulletproof — every
counter was traced, zero missed bumps found. The two-tier virtualisation
coordinate-space decision (derive from total, not from position map loading)
is the kind of insight that comes from hitting a real bug and understanding
the root cause. The two-controller abort design isolating focus-finding from
seek interference is correct and well-documented. The Scrubber's three-mode
interaction model (buffer/indexed/seek), pendingSeekPosRef anti-snap-back,
and flash guard for placeholder offsets are all correct.

**What wasn't found is more telling than what was.** No race conditions in
buffer management. No stale-closure bugs in scroll effects. No off-by-one
errors in coordinate transforms between buffer-local and global indices. No
memory leaks in the extend/evict cycle. The null-zone handling — genuinely
hard (ES rejects null in search_after, requiring sort/filter rewrites) — is
correct across seek, extend, and buffer-around-image, with proper sort-value
remapping on the way back.

The real bugs found are minor: a zombie promise leak in aggregation debounce,
a raf2 handle writing to a detached DOM element, a missing `.catch()` on a
fire-and-forget with robust internal error handling. None affect users today.

The two `Promise.all` opportunities (A1, A2) are the most impactful changes:
~150 ms combined savings on sort-around-focus and image-detail reload,
directly user-visible on real ES. Five minutes of work each.

The biggest ongoing risk isn't bugs — it's coupling surface.
`search-store.ts` at 3,558 lines is a single namespace where seek, extend,
search, aggregations, sort distribution, position map, and new-images polling
share module-level abort controllers and cooldown timestamps. It works
because the invariants are maintained, but a careless edit to one path could
break another. The "Maint" items below are about reducing the cost of the
next edit, not fixing today's behaviour.

---

## Part A — Actionable bugs and performance wins

### A1. `_loadBufferAroundImage` — sequential fetches → parallel ★

**File:** `search-store.ts` ~L1023–1049  
**Status:** Unchanged since April 2025 review (store #1).

Forward and backward `searchAfter` calls await sequentially. They are
independent ES requests against the same cursor/PIT. `Promise.all` would
save one full ES round-trip (~10–50 ms on real clusters).

**Impact:** Every sort-around-focus operation and every `restoreAroundCursor`.
The most user-visible latency win available.

**Fix:** `const [fwdResult, bwdResult] = await Promise.all([fwd, bwd]);`

---

### A2. `restoreAroundCursor` — sequential steps 1 + 2 → parallel ★

**File:** `search-store.ts` ~L3233–3257  
**Status:** Unchanged since April 2025 review (store #2).

`countBefore` (Step 1) and `searchAfter({ ids: imageId })` (Step 2) are
independent. Step 3 (`_loadBufferAroundImage`) depends on Step 2's output
but not Step 1's return value directly.

**Fix:** `const [exactOffset, targetResult] = await Promise.all([...]);`  
**Saving:** ~100–150 ms per image-detail reload.

---

### A3. `fetchAggregations` debounce — zombie promise leak

**File:** `search-store.ts` ~L3348–3353  
**Status:** Unchanged since April 2025 review (store #3).

When a second call arrives during the debounce window, `clearTimeout` kills
the timer but the first caller's `resolve` (captured inside the
`setTimeout`) never fires. The first `async` frame hangs forever — one
dangling promise + closure per rapid call (e.g. fast typing in the search
box).

Not a crash, but a memory/GC leak that accumulates over a long session.

**Fix options:**
1. Replace with a single module-level `_aggDebouncedResolve` that the new
   call `resolve()`s (with a "cancelled" sentinel) before installing its own.
2. Use a proper debounce wrapper that replaces the pending call rather than
   stacking.

---

### A4. `search()` fire-and-forget `_findAndFocusImage` — missing `.catch()`

**File:** `search-store.ts` ~L1713  
**Status:** Unchanged since April 2025 review (store #7).

The function has robust internal try/catch + 8 s timeout, but an unexpected
non-abort error escaping the internal catch becomes an unhandled promise
rejection.

**Fix:** Append `.catch(console.error)`. Zero-risk, 1-line change.

---

### A5. Leaked `raf2` handle in effect #10 (density-focus mount restore)

**File:** `useScrollEffects.ts` ~L834–906 (saved branch), ~L920–947 (else branch)  
**Status:** Unchanged since April 2025 review (scroll #1).

Both branches nest `requestAnimationFrame` and attempt cleanup via
`return () => cancelAnimationFrame(raf2)` **inside the rAF callback**. That
return value is discarded by `requestAnimationFrame`. If the component
unmounts between raf1 and raf2, raf2 fires against a detached DOM element.

Practically harmless (sets `scrollTop` on a dead element), but a
correctness bug. Fix: hoist `raf2` to outer scope, cancel both in cleanup.

---

### A6. `virtualizer` in effect #6 dependency array — unnecessary re-fires

**File:** `useScrollEffects.ts` ~L584  
**Status:** Unchanged since April 2025 review (scroll #2).

The dep array includes `virtualizer`, but the effect body never references
it — it sets `el.scrollTop` directly. Since `useVirtualizer` returns a new
object every render, this causes the effect to re-fire on every render.
The generation guard makes them no-ops, but it's wasted work on a
scroll-sensitive path.

**Fix:** Remove `virtualizer` from the dependency array.

---

## Part B — Fragile / defensive patterns worth hardening

### B1. `isTwoTierFromTotal` duplicated

**Files:** `useScrollEffects.ts` L44, `useDataWindow.ts` L279–282  
**Status:** Unchanged since April 2025 review (scroll #3).

Logic is identical (same three conditions, same constants) but lives in
two files with no shared reference. The comment in `useScrollEffects.ts`
acknowledges this: *"Mirrors the reactive derivation in useDataWindow —
must stay in sync."*

**Recommendation:** Extract to a shared utility:
```ts
// lib/two-tier.ts
export function isTwoTierFromTotal(total: number): boolean { ... }
```
Both files import it. Single source of truth.

---

### B2. Hardcoded `303` in bottom-extremum snap

**File:** `useScrollEffects.ts` ~L887  
**Status:** Unchanged since April 2025 review (scroll #4).

```ts
if (saved.sourceMaxScroll - saved.sourceScrollTop < 303) {
```

This is `GRID_ROW_HEIGHT` from `constants/layout.ts`. Should reference the
named constant. If the grid row height ever changes, this value won't.

---

### B3. `computeScrollTarget` uses `Math.round` for `currentRow`

**File:** `search-store.ts` L108  
**Status:** Unchanged since April 2025 review (store #6).

`Math.round(currentScrollTop / rowH)` snaps to the next row at exactly 50%
scroll. `Math.floor` would be more conventional (you're "on" a row until
you've fully scrolled past it). Could cause a 1-row jump at the 50%
boundary during scrubber seeks. Worth a unit test at the boundary.

---

### B4. `_pendingFocusDelta` orphan risk if `_findAndFocusImage` fails

**File:** `search-store.ts` (store #5 from April 2025 review)  
**Status:** Practically impossible. `search()` clears `_pendingFocusDelta`
at the top, and `_findAndFocusImage` has try/catch + timeout. But the
`.catch(console.error)` fix from A4 should also clear `_pendingFocusDelta`
as belt-and-suspenders.

---

### B5. `fetchAggregations` cache key race

**File:** `search-store.ts` ~L3335–3384

`frozenParams(get().params, get)` is called 4 times across the async
function: before debounce, after debounce, at ES call time, and when
storing the cache key. If params change between calls, the stored cache
key can reflect the *new* params rather than what was actually sent to ES.

**Severity:** Low — self-correcting on next search.  
**Fix:** Snapshot `frozenParams` once at the top and reuse the snapshot.

---

### B6. `registerScrollGeometry` called on every render

**File:** `useScrollEffects.ts` L339

Creates a new `{ rowHeight, columns }` object every render. Harmless today
(plain module-level assignment in `scroll-geometry-ref.ts`), but
inconsistent with `registerScrollContainer` (which is in an effect). Would
break if `registerScrollGeometry` ever used change detection on object
identity.

**Fix:** Move into a `useEffect` with `[geometry.rowHeight, geometry.columns]`
deps, or add a shallow-equality guard inside `registerScrollGeometry`.

---

### B7. `seek()` deep path — `result` declared without type or initial value

**File:** `search-store.ts` L2155

`let result;` is assigned through various if/else branches across ~700
lines. All terminal branches assign it (verified), but a future edit that
introduces a new path without assignment gives a runtime crash at
`result.hits.length` with an unhelpful "Cannot read properties of
undefined".

**Recommendation:** `let result: SearchAfterResult | undefined;` with a
guard `if (!result) { set({ loading: false }); return; }` before first
use. Pure safety net.

---

## Part C — useDataWindow observations

### C1. Module-level mutable state for visible range

`_visibleStart`, `_visibleEnd`, `_viewportAnchorId` are module-level
mutable variables updated by `reportVisibleRange`. This works because
only one density component is mounted at a time. The pattern is clean
and intentional — `useSyncExternalStore` gives React subscribers
re-renders only when the range actually changes.

**No issues found.** Well-designed for the constraint.

---

### C2. `getVisibleImageIds` — off-by-one in two-tier conversion

**File:** `useDataWindow.ts` L112–128

```ts
let localIdx = i - bufferOffset;
if (localIdx < 0 || localIdx >= results.length) localIdx = i;
```

The fallback `localIdx = i` is a last resort when the global→local
conversion fails. In normal mode, `i` is already buffer-local so this
is fine. But in two-tier mode, if `i` is a large global index that
happens to fall outside the buffer, the fallback `localIdx = i` could
index into `results[12000]` — well past the array length, returning
`undefined`. The `if (img?.id)` guard prevents crashes, but the fallback
is conceptually wrong in two-tier mode.

**Impact:** Silent — skips images that are outside the buffer, which is
the correct behaviour anyway (skeleton cells have no IDs). But the
fallback obscures the intent.

**Recommendation:** Replace the fallback with `continue`:
```ts
if (localIdx < 0 || localIdx >= results.length) continue;
```

---

### C3. `reportVisibleRange` skips anchor update for skeletons (correct)

The `return` at L367 (inside the two-tier seek branch) correctly skips
the viewport anchor update when the viewport is entirely outside the
buffer — those cells are skeletons with no image IDs.

---

### C4. `_scrollSeekTimer` never cancelled on unmount

**File:** `useDataWindow.ts` L66

Module-level timer. If a component unmounts while a debounced seek is
pending, it fires against stale state. In practice the store's abort
controller handles this (the seek call will operate on the current store
state), but it's imprecise.

**Severity:** Very low. The seek fires against current store state, not
stale captures.

---

## Part D — useListNavigation observations

### D1. Clean separation of concerns

The focused/unfocused duality is well-handled:
- No focus: scroll-only (row snap, page snap, Home/End scroll).
- Has focus: focus-movement mode.

The `configRef` pattern (store config in ref, stable callbacks via
`useCallback`) avoids re-registering event listeners on every render.
Document-level listener with a single `useEffect` cleanup. No issues.

---

### D2. `moveFocus` — snap-back via `seekToFocused` has good UX

**File:** `useListNavigation.ts` L258–263

When the focused image is outside the buffer (user seeked away via
scrubber), the arrow key triggers a snap-back seek that loads the buffer
around the focused image. The pending delta is consumed by
`useScrollEffects` effect #9 after the seek completes. This chain works
correctly.

**Minor concern:** If `seekToFocused` fails (image deleted), the
`_pendingFocusDelta` is cleared by `seekToFocused` itself (L1581:
`set({ focusedImageId: null, _pendingFocusDelta: null })`). No orphan.

---

### D3. `pageFocus` — column position preserved across page jumps ✓

**File:** `useListNavigation.ts` L333–340

```ts
const colWithinRow = currentIdx - currentRow * cols;
const targetRow = ...;
let targetIdx = targetRow * cols + colWithinRow;
```

Column position within the row is preserved when paging up/down in the
grid. Correct and elegant.

---

### D4. Home/End — no scroll flash

**File:** `useListNavigation.ts` L470–485

Home key does NOT set `scrollTop = 0` eagerly when the buffer is windowed
— it calls `seek(0)` and lets effect #8 (BufferOffset→0 guard) reset
scrollTop in the same render frame after the new buffer arrives. This
matches the "zero flash" pattern established for deep-to-deep seeks.

---

### D5. `loadMore` calls in multiple places — not a problem, but notable

`loadMore()` is called in:
- `moveFocus` (L296): when focus approaches buffer end
- `pageFocus` (L370): when page-down approaches buffer end
- `scrollByPage` (L240): when page-down scroll approaches buffer end
- `handleCapture` End key (L538): when buffer doesn't cover the end

All calls are guarded by `bufferOffset + resultsLength < total`. The
`extendForward` guard in the store is the real dedup (returns immediately
if `_extendForwardInFlight`). These multiple call sites are correct.

---

### D6. `scrollByPage` — `pageScrollTarget` is well-designed

The `pageScrollTarget` function (L146–178) handles the edge-aligned and
non-edge-aligned cases with proper epsilon. The comments document the
round-trip guarantee (PgDown then PgUp returns to the same position).
Verified — logic is correct.

---

### D7. Bubble vs Capture phase split is correct

Home/End must be capture-phase to intercept before the CQL web component's
ProseMirror handlers. Arrow/Page/Enter are bubble-phase. Both exclude
native input targets (`isNativeInputTarget`) and fullscreen mode
(`document.fullscreenElement`). Clean.

---

## Part E — Scrubber.tsx observations

### E0. Overall impression

The Scrubber is remarkably well-built for a custom scrollbar replacement.
The three-mode derivation (buffer/indexed/seek), the `pendingSeekPosRef`
pattern to prevent thumb snap-back, the flash guard for sort-around-focus,
the scroll-mode continuous sync via scroll listener, the hover-preview
tooltip with direct DOM writes — all correct and performant. This is one
of the hardest components to get right and it's solid.

---

### E0a. Wheel event listener never cleaned up

**File:** `Scrubber.tsx` ~L414–429

The `trackCallbackRef` attaches a wheel event listener to the track
element with a comment: *"No explicit teardown — the element is removed
from the DOM when the component returns null."* This is correct for
garbage collection (the listener is GC'd with the element), but the
ResizeObserver in the same callback ref IS explicitly disconnected.
The inconsistency is cosmetic — both approaches work because the scrubber
track element's lifetime is tied to the component.

**No fix needed.** But if this ever becomes a persistent element (e.g.
stays in the DOM but hidden), the wheel listener would need cleanup.

---

### E0b. `handleTrackMouseMove` dep array includes `isHoveringTrack` and `isHovered`

**File:** `Scrubber.tsx` ~L780

```ts
[isDragging, isHoveringTrack, isHovered, currentPosition, total, thumbVisibleCount, positionFromY, notifyFirstInteraction]
```

`isHoveringTrack` and `isHovered` are state variables that change on
every mouse enter/leave. Including them in the `useCallback` dep array
means `handleTrackMouseMove` is re-created on every hover toggle. Since
this callback is passed as an `onMouseMove` prop, React detaches and
re-attaches the handler each time.

In practice this is invisible (the toggle happens once on enter, once on
leave — not per-frame), but the deps are there only to support the
early-return guard `if (!isHoveringTrack) setIsHoveringTrack(true)`.
A ref pattern would keep the callback stable:

```ts
const isHoveringTrackRef = useRef(false);
// in the callback: if (!isHoveringTrackRef.current) { ... }
```

**Severity:** Negligible. The re-creation cost is trivial.

---

### E0c. `dangerouslySetInnerHTML` in tooltip sort label

**File:** `Scrubber.tsx` ~L1154

```tsx
dangerouslySetInnerHTML={sortLabel ? { __html: sortLabel } : undefined}
```

The comment explains: *"Values are always generated internally
(formatSortDate or ES keyword values), never user input."* This is
correct — `sortLabel` comes from `sort-context.ts` which formats dates
via `date-fns` or reads keyword values from ES aggregation buckets. No
user-controlled HTML reaches this path.

However: ES keyword values come from image metadata (credit, source,
uploadedBy). If a malicious image were ingested with `<script>` in its
credit field, it would render as HTML here. The risk is low (metadata is
ingested by Grid's backend, not arbitrary user input), but the fix is
trivial: use `textContent` in the direct DOM write path (which already
happens in `applyTooltipContent` for the position text) and avoid
`dangerouslySetInnerHTML` for the React render.

The reason `innerHTML` is used is that date labels contain a `<span>`
for fixed-width month abbreviation (prevents tooltip width jitter).
Alternative: use a separate `<span>` element with a class instead of
inline HTML.

**Severity:** Low (defence-in-depth). Worth noting in the deviations log
if left as-is.

---

### E0d. `positionFromY` and `positionFromDragY` coordinate math is duplicated

**File:** `Scrubber.tsx` ~L558–574 (positionFromY) and ~L660–672 (positionFromDragY)

Both compute `position = ratio * maxPosition` from a clientY, but with
slightly different corrections:
- `positionFromY`: maps raw clientY → track-relative ratio using
  `maxTop` (the thumb-reachable range).
- `positionFromDragY`: adjusts for `pointerOffsetInThumb` (the grab
  offset within the thumb).

These are intentionally different — `positionFromY` is for click/hover
(where the click point IS the target), `positionFromDragY` is for drag
(where the grab offset must be subtracted). The duplication is justified.

---

### E0e. `stableVisibleCountRef` frozen logic runs in render body

**File:** `Scrubber.tsx` ~L292–301

```ts
if (!isScrollMode) {
  stableVisibleCountRef.current = visibleCount;
  ...
} else if (stableVisibleCountRef.current === 0 || total !== stableTotalRef.current) {
  stableVisibleCountRef.current = visibleCount;
  ...
}
```

Ref mutation during render is technically a React anti-pattern (render
should be pure). In practice this works because refs are not observed by
React's reconciler. But if this component were ever wrapped in
`React.memo` with custom comparison, the ref mutation would still fire
on the "skipped" render — confusing semantics.

**Severity:** Pedantic. The pattern is common in performance-sensitive
components and works fine with the current React 19 behaviour.

---

### E0f. Scroll-mode continuous sync captures `isDragging` via closure

**File:** `Scrubber.tsx` ~L500–550

The scroll listener inside the `useEffect` captures `isDragging` from
the closure. When `isDragging` changes, the effect re-runs (it's in the
dep array), detaches the old listener, and attaches a new one. This means
every drag start/end detaches and re-attaches the scroll listener.

Works correctly but is a micro-inefficiency during drag transitions.
A ref (`isDraggingRef`) would avoid the re-attachment. But since drag
start/end is a low-frequency event (once per user gesture), this is
not worth changing.

---

### E0g. `pendingSeekPosRef` clearing logic — well-designed

The three-way clearing logic (total change, position change, loading
finish) at L361–381 covers all cases:
- New search (total changes): unconditional clear.
- Seek landed (position changes while not dragging): clear.
- Operation finished (loading true→false while not dragging): clear.

This prevents the thumb from snapping back to the old position during
a seek. The flash guard (L462–470) additionally prevents the thumb from
flashing to position ~0 during sort-around-focus's placeholder offset.
Both patterns are correct.

---

## Part F — Cross-cutting observations

### F1. `loadMore` is not deprecated

The `@deprecated` JSDoc on `loadMore` in `search-store.ts` is misleading.
It's the canonical public API consumed by `useDataWindow`, `ImageGrid`,
`ImageTable`, and `useListNavigation`. Either remove the `@deprecated`
tag, or rename it to `extendForward` at all call sites.

---

### F2. Position map fetch duplicated in `search()`

**File:** `search-store.ts` ~L1726–1735 and ~L1762–1771

The same conditional (`POSITION_MAP_THRESHOLD > 0 && total > SCROLL_MODE_THRESHOLD && total <= POSITION_MAP_THRESHOLD`) + `_fetchPositionMap(...)` call
appears in both the sort-around-focus path and the normal path of
`search()`. Could extract to a shared block after the if/else.

---

### F3. Performance marks never cleaned up on abort

**File:** `search-store.ts` ~L2137–2146

`seek()` clears and sets performance marks at the start. If the seek is
aborted, early `return` skips the final `performance.measure()` calls.
Orphaned marks accumulate in the Performance API. Very minor — only
affects DevTools profiling.

---

### F4. `_findAndFocusImage` timeout + async offset correction race

**File:** `search-store.ts` ~L1170–1184, ~L1400

The 8 s timeout handler sets `focusedImageId: null`. But the async offset
correction `.then()` (L1400) could fire after the timeout and set
`_focusedImageKnownOffset` on a null focus. Harmless but wasteful —
the `.then()` should check `combinedSignal.aborted` (it does) AND
`get().focusedImageId != null`.

---

## Summary — Priority-ordered recommendations

> **Status key:** ✅ = done (committed or pending commit), ⏭️ = skipped with reason.
> Items without a marker are observations only (no action required).

| # | Item | Effort | Impact | Type | Status |
|---|------|--------|--------|------|--------|
| A1 | Parallelize `_loadBufferAroundImage` | 5 min | ~50 ms/op | Perf | ✅ Part A commit `ded2d5db5` |
| A2 | Parallelize `restoreAroundCursor` steps | 5 min | ~100 ms/op | Perf | ✅ Part A commit `ded2d5db5` |
| A3 | Fix agg debounce zombie promise | 15 min | Memory leak | Bug | ✅ Part A commit `ded2d5db5` |
| A4 | `.catch(console.error)` on fire-and-forget | 1 min | Unhandled rejection | Bug | ✅ Part A commit `ded2d5db5` |
| A5 | Fix raf2 leak in density-focus | 10 min | Detached DOM write | Bug | ✅ Part A commit `ded2d5db5` |
| A6 | Remove `virtualizer` from effect #6 deps | 1 min | Unnecessary re-fires | Perf | ✅ Part A commit `ded2d5db5` |
| B1 | Extract shared `isTwoTierFromTotal` | 5 min | Sync-drift risk | Maint | ✅ Pending commit |
| B2 | Use `GRID_ROW_HEIGHT` constant | 1 min | Hardcoded magic number | Maint | ✅ Pending commit |
| B3 | `Math.round` → `Math.floor` in `computeScrollTarget` | 1 min + test | Boundary behaviour | Investigate | ✅ Pending commit — confirmed real bug, added unit tests |
| B5 | Snapshot `frozenParams` in fetchAggregations | 5 min | Cache key correctness | Bug | ✅ Pending commit |
| B6 | Move `registerScrollGeometry` into effect | 2 min | Render consistency | Maint | ⏭️ Not worth it — plain module-level assignment, no change detection on identity |
| B7 | Type + guard `result` in `seek()` | 2 min | Future-proofing | Maint | ✅ Pending commit |
| C2 | Fix two-tier fallback in `getVisibleImageIds` | 1 min | Code clarity | Maint | ✅ Pending commit |
| E0c | Audit `dangerouslySetInnerHTML` in Scrubber tooltip | 10 min | XSS defence-in-depth | Security | ⏭️ User chose to leave — values are internal, risk is low |
| F1 | Remove misleading `@deprecated` on `loadMore` | 1 min | Documentation | Maint | ✅ Pending commit |
| F2 | Deduplicate position map fetch in `search()` | 2 min | Readability | Maint | ⏭️ Not worth it — 6 lines of duplication, control-flow reshuffling adds risk |
| F3 | Performance marks never cleaned up on abort | — | DevTools only | Minor | ⏭️ Very minor — only affects profiling, not user-facing |
| F4 | `_findAndFocusImage` timeout + offset correction race | — | Wasteful `.then()` | Minor | ⏭️ Harmless — offset set on null focus is a no-op |
| B4 | `_pendingFocusDelta` orphan risk | — | Belt-and-suspenders | Minor | ⏭️ Practically impossible — `search()` clears at top, internal try/catch covers |
