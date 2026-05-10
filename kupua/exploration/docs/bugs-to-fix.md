# Bugs to Fix

## 1. Scrubber blank when entire result set is in the null zone

**Discovered:** 10 May 2026
**Status:** Unfixed — pre-existing design gap, not caused by uncommitted work

### Problem

Steps to reproduce:
1. Fresh app against TEST (1.3M docs)
2. `&orderBy=-taken&query=-has:dateTaken`
3. Hover over scrubber

**Actual:** No ticks, no labels, no null-zone red indicator. Scrubber track is
completely blank — just the thumb and position counter.

**Expected:** Everything should render based on the secondary uploadTime fallback
sort. The entire track should be red (all docs are in the null zone). Ticks and
labels should show uploadTime-based dates in italic "Uploaded: ..." style, same
as the null-zone section of a mixed result set.

### Investigation

The failure is a cascade through five components. Each depends on the previous
one doing the right thing, and the chain breaks at step 1.

#### Step 1 — `es-adapter.ts` `getDateDistribution` returns `null`

When sorted by `-taken` and every doc lacks `dateTaken`, the method runs a
`stats` aggregation on the `dateTaken` field. ES returns `count: 0` (no docs
have the field). The code treats this identically to a fetch failure:

```typescript
// es-adapter.ts ~line 1196
const stats = statsResult.aggregations?.range;
if (!stats || stats.count === 0) return null;  // ← null = "doesn't exist"
```

`null` conflates two distinct meanings:
- "The fetch failed" (network error, abort)
- "Zero documents have this field" (legitimate data — the field is universally absent)

The same pattern exists in `getKeywordDistribution` (~line 1135):

```typescript
if (buckets.length === 0) return null;
```

#### Step 2 — `search-store.ts` stores `sortDistribution: null`

`fetchSortDistribution` receives `null` and sets it in the store. Downstream
code cannot distinguish "never fetched" from "fetched, zero coverage".

#### Step 3 — Null-zone distribution fetch never fires

In `search.tsx` (~line 155):

```typescript
useEffect(() => {
  if (sortDistribution && sortDistribution.coveredCount < total) {
    fetchNullZoneDistribution();
  }
}, [sortDistribution, total, fetchNullZoneDistribution]);
```

`sortDistribution` is `null` → falsy → effect body never runs →
`fetchNullZoneDistribution` never fires → `nullZoneDistribution` stays `null`.

#### Step 4 — Tick cache key falls to empty string

In `search.tsx` (~line 167):

```typescript
const ticksCacheKey = allDataInBuffer
  ? `buffer:${orderBy ?? ""}:${total}`
  : sortDistribution
    ? `dist:${orderBy ?? ""}:${total}:...`
    : "";  // ← empty string = no ticks
```

Empty key → `ticksCacheRef.current = { key: "", ticks: [] }` → scrubber
receives an empty `trackTicks` array → no ticks rendered.

#### Step 5 — Tooltip label returns `null`

In `sort-context.ts` `interpolateNullZoneSortLabel` (~line 922):

```typescript
const coveredCount = sortDist?.coveredCount ?? total;
```

`sortDist` is `null` → `coveredCount` defaults to `total` → `inNullZone`
is `false` → falls through to `interpolateSortLabel` → tries to read
`dateTaken` from the image → field is absent → returns `null`.

### Proposed fix

Three code changes. All small. Two in `es-adapter.ts` (already dirty from
uncommitted enrichment work), one in `sort-context.ts` (currently clean).

No change needed in `search.tsx` — its effect and tick cache key logic
self-correct once `sortDistribution` becomes truthy with `coveredCount: 0`.

#### Fix A — `es-adapter.ts` `getDateDistribution` (~line 1196)

Return a zero-coverage distribution instead of `null` when the field exists
on zero documents:

```typescript
// BEFORE
if (!stats || stats.count === 0) return null;

// AFTER
if (!stats) return null;
if (stats.count === 0) return { buckets: [], coveredCount: 0 };
```

This means: "I successfully determined that zero documents have this field."
Downstream code sees a truthy `sortDistribution` with `coveredCount: 0`,
which correctly represents "everything is null zone."

#### Fix B — `es-adapter.ts` `getKeywordDistribution` (~line 1135)

Same semantic fix:

```typescript
// BEFORE
if (buckets.length === 0) return null;

// AFTER — return empty distribution, not null
// (This can only happen when every doc lacks the keyword field entirely,
// which is the keyword equivalent of the all-null-zone scenario.)
return { buckets, coveredCount: cumulative };
// (Just delete the early return — the existing return on line 1143 handles it.)
```

Alternatively, simply remove the `if (buckets.length === 0) return null;`
guard entirely — the existing `return { buckets, coveredCount: cumulative }`
at the end of the function already returns `{ buckets: [], coveredCount: 0 }`
when no buckets were found.

#### Fix C — `sort-context.ts` `computeTrackTicksWithNullZone` (~line 993)

The current guard rejects `coveredCount === 0`:

```typescript
// BEFORE
if (coveredCount == null || coveredCount <= 0 || coveredCount >= total) {
  return coveredTicks;
}

// AFTER — allow coveredCount === 0 (entire set is null zone)
if (coveredCount == null || coveredCount < 0 || coveredCount >= total) {
  return coveredTicks;
}
```

Wait — this isn't quite right either. When `coveredCount === 0`, we need to
skip the boundary tick (there's no boundary when everything is null zone)
and produce only the null-zone ticks. The function currently adds a boundary
tick unconditionally after the guard. Better approach:

```typescript
// AFTER
if (coveredCount == null || coveredCount < 0 || coveredCount >= total) {
  return coveredTicks;
}

// --- Boundary tick (only when there IS a covered zone) ---
const boundaryTicks: TrackTick[] = [];
if (coveredCount > 0) {
  const sortKey = resolvePrimarySortKey(orderBy);
  const fieldName = sortKey ? getSortFieldDisplayName(sortKey) : "value";
  boundaryTicks.push({
    position: coveredCount,
    type: "major",
    label: `No ${fieldName}`,
    color: "rgba(255, 140, 140, 0.9)",
    boundary: true,
  });
}
```

And the final return becomes:

```typescript
return [...coveredTicks, ...boundaryTicks, ...offsetTicks];
```

This handles three cases correctly:
- `coveredCount > 0 && < total` — mixed: covered ticks + boundary + null-zone ticks
- `coveredCount === 0` — all null zone: no covered ticks, no boundary, only null-zone ticks (all red)
- `coveredCount >= total` — no null zone: covered ticks only (existing early return)

### Downstream effects (self-correcting, no code changes needed)

Once Fix A lands:

- **`search.tsx` effect:** `sortDistribution` is truthy with `coveredCount: 0`
  → `0 < total` is true → `fetchNullZoneDistribution()` fires → uploadTime
  distribution loads.

- **`search.tsx` tick cache key:** `sortDistribution` is truthy → key is
  `"dist:..."` → ticks computed via `computeTrackTicksWithNullZone` → all
  ticks are red (null-zone ticks from uploadTime distribution).

- **`interpolateNullZoneSortLabel`:** `sortDist.coveredCount` is `0` →
  `coveredCount = 0` → `inNullZone = (globalPosition >= 0)` → always true
  → uses uploadTime distribution → returns italic "Uploaded: ..." label.

### Files touched

| File | Fix | Currently dirty? |
|---|---|---|
| `kupua/src/dal/es-adapter.ts` | A + B | Yes (enrichment work) |
| `kupua/src/lib/sort-context.ts` | C | No |

### Testing

- Unit tests: run `npm --prefix kupua test` — existing distribution tests
  should still pass. Add a test for `computeTrackTicksWithNullZone` with
  `coveredCount: 0` input.
- Manual: reproduce with `&orderBy=-taken&query=-has:dateTaken` on TEST.
  Scrubber should show all-red ticks with uploadTime labels.

---

## 2. Alt+Left/Right (word jump) broken in search box when table is active

**Discovered:** 10 May 2026
**Status:** Unfixed — regression from horizontal table scrolling feature

### Problem

Steps to reproduce:
1. Switch to table view
2. Click into the CQL search box, type some text
3. Press Alt+Left or Alt+Right (macOS word-jump)

**Actual:** The table scrolls horizontally. The cursor does not move by word.

**Expected:** The cursor should jump one word left/right within the search
text — standard text editing behaviour. This works correctly in grid view.

### Investigation

The event flows through three handlers:

#### Step 1 — CqlSearchInput `stopUnhandled` lets it through (correct)

In `CqlSearchInput.tsx` (~line 282):

```typescript
const stopUnhandled = (e: Event) => {
  const { shiftKey, altKey, metaKey, ctrlKey, key } = e as KeyboardEvent;
  const noModifier = !(shiftKey || altKey || metaKey || ctrlKey);
  if (e.defaultPrevented || (noModifier && !keysToPropagate.includes(key))) {
    e.stopImmediatePropagation();
  }
};
```

Alt+Left has `altKey=true` → `noModifier=false` → the condition is false →
event propagates. This is **by design** — the search box deliberately lets
modified keys bubble so that global keyboard shortcuts (registered in
`keyboard-shortcuts.ts` with Alt) still work.

#### Step 2 — `isNativeInputTarget` doesn't catch CQL (correct but relevant)

In `useListNavigation.ts` (~line 394):

```typescript
if (isNativeInputTarget(e)) return;
```

`isNativeInputTarget` checks for `<input>`, `<textarea>`, `<select>` tags.
The CQL search box is a `<cql-input>` custom element — **not** a native
input. So the guard doesn't fire. This is correct for most keys (the CQL
element deliberately propagates navigation keys). But it means the ArrowLeft
handler runs even when the CQL input has focus.

#### Step 3 — Table horizontal scroll doesn't check modifiers (BUG)

In `useListNavigation.ts` (~line 422):

```typescript
case "ArrowLeft":
  if (hasFocus && cols > 1) {
    e.preventDefault();
    moveFocus(-1);
  } else if (cols === 1) {    // ← table mode, no modifier check
    e.preventDefault();        // ← kills browser word-jump
    c.scrollRef.current?.scrollBy({ left: -150, behavior: "smooth" });
  }
  break;
case "ArrowRight":
  if (hasFocus && cols > 1) {
    e.preventDefault();
    moveFocus(1);
  } else if (cols === 1) {    // ← same bug
    e.preventDefault();
    c.scrollRef.current?.scrollBy({ left: 150, behavior: "smooth" });
  }
  break;
```

In table mode (`cols === 1`), bare ArrowLeft/Right correctly scroll the
table horizontally. But the condition doesn't check for modifier keys.
When Alt is held, `e.preventDefault()` kills the browser's native word-jump,
and the table scrolls instead.

In grid mode, the `cols > 1` branch requires `hasFocus` — which is false
when the search box has focus (no image is focused). So the handler falls
through without `preventDefault()`, and Alt+Left word-jump works.

### Why this is a regression

The table horizontal scrolling was added (or re-added) later. Before that,
ArrowLeft/Right in table mode had no handler → fell through → browser
default (word-jump) worked. The new handler added `cols === 1` branches
without a modifier guard.

### Proposed fix

One change in `useListNavigation.ts` (~line 427 and ~line 433):

Add a modifier check to the table horizontal scroll condition:

```typescript
// BEFORE
} else if (cols === 1) {

// AFTER — don't intercept modified arrows (Alt=word-jump, Shift=select, etc.)
} else if (cols === 1 && !e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
```

Apply to both `ArrowLeft` and `ArrowRight` branches.

This preserves bare ArrowLeft/Right for table scrolling while letting
modified variants through for their native text-editing roles (Alt=word,
Shift=select-word, Cmd=line-start/end).

### Files touched

| File | Fix | Currently dirty? |
|---|---|---|
| `kupua/src/hooks/useListNavigation.ts` | Modifier guard on table scroll | No |

### Testing

- Manual: table view, click into search box, type text, Alt+Left/Right
  should word-jump. Bare Left/Right in table (search box not focused)
  should still scroll horizontally.
- E2E: `keyboard-nav.spec.ts` covers arrow key navigation — verify no
  regressions.

---

## 3. Table horizontal scroll with arrow keys is pixel-by-pixel (should be fast)

**Discovered:** 10 May 2026
**Status:** Unfixed — regression from horizontal scroll feature

### Problem

Steps to reproduce:
1. Switch to table view
2. Click outside the search box (or blur it) so no editing field has focus
3. Press and hold ArrowLeft or ArrowRight

**Actual:** The table scrolls horizontally very slowly, a few pixels at a time.

**Expected:** The table should scroll in clear 150px jumps — fast enough to
navigate wide tables comfortably.

### Root cause

In `useListNavigation.ts` (~line 428):

```typescript
c.scrollRef.current?.scrollBy({ left: -150, behavior: "smooth" });
```

`behavior: "smooth"` creates an animated scroll that takes ~300-500ms to
complete. When the key repeats (~30 events/second), each new `scrollBy`
**cancels the previous in-progress smooth animation** and starts a fresh
one from the current position. The previous animation only completed a
few pixels of its 150px target before being cancelled.

Each key repeat cycle:
1. Previous smooth scroll cancelled (moved ~5px of the 150px target)
2. New smooth scroll starts from current position
3. Cancelled again ~33ms later by the next keydown event

Net effect: ~5px per key repeat interval = "pixel by pixel."

A single tap works fine (completes the full 150px animation), but holding
the key produces the stutter.

### Proposed fix

One change in `useListNavigation.ts`, two locations (~lines 428 and 437):

```typescript
// BEFORE
c.scrollRef.current?.scrollBy({ left: -150, behavior: "smooth" });
// and
c.scrollRef.current?.scrollBy({ left: 150, behavior: "smooth" });

// AFTER
c.scrollRef.current?.scrollBy({ left: -150 });
// and
c.scrollRef.current?.scrollBy({ left: 150 });
```

Dropping `behavior: "smooth"` defaults to `"auto"` which is instant.
Each key repeat jumps a full 150px immediately — no animation to cancel.
This matches how ArrowUp/Down vertical scrolling works (via `scrollByRows`
which uses `scrollBy` without smooth behavior).

### Files touched

| File | Fix | Currently dirty? |
|---|---|---|
| `kupua/src/hooks/useListNavigation.ts` | Remove `behavior: "smooth"` | No |

### Note

This fix and Bug #2 (Alt+arrow modifier guard) both touch the same two
lines. They can be combined into one edit:

```typescript
// Combined fix for bugs #2 and #3
case "ArrowLeft":
  if (hasFocus && cols > 1) {
    e.preventDefault();
    moveFocus(-1);
  } else if (cols === 1 && !e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    c.scrollRef.current?.scrollBy({ left: -150 });
  }
  break;
case "ArrowRight":
  if (hasFocus && cols > 1) {
    e.preventDefault();
    moveFocus(1);
  } else if (cols === 1 && !e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    c.scrollRef.current?.scrollBy({ left: 150 });
  }
  break;
```
