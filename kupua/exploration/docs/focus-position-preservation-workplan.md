# Focus & Position Preservation — Multi-Session Workplan

> **Created:** 2026-04-17
> **Status:** Session 5 complete.
> **Architecture doc:** `00 Architecture and philosophy/02-focus-and-position-preservation.md`
> **Goal:** Implement the full position-preservation engine described in the
> architecture doc — focus survives search context, focus survives seek (with
> snap-back), phantom focus promotion, and the phantom focus UI mode.

---

## What Exists Today

| Capability | Status | Where |
|------------|--------|-------|
| `focusedImageId` state | ✅ Working | `search-store.ts` |
| `viewportAnchorId` (phantom) | ✅ Working | `useDataWindow.ts` (module-level) |
| Sort-around-focus (sort change + focused image → find in new order) | ✅ Working | `search-store.ts` `_findAndFocusImage`, `useUrlSearchSync.ts` |
| Density-change position restoration (focus + phantom fallback) | ✅ Working | `useScrollEffects.ts` `DensityFocusState` |
| Focus survives seek (durable `focusedImageId` not cleared) | ✅ Working | `search-store.ts` `seek()` |
| Focus survives search context change | ✅ Session 1 | `useUrlSearchSync.ts` passes `focusedImageId` on all search changes |
| Neighbour fallback (focused image gone → find nearest survivor) | ✅ Session 2 | `search-store.ts` `_captureNeighbours`, `_findAndFocusImage` fallback |
| Arrow snap-back to focused image after distant seek | ✅ Session 3 | `seekToFocused()`, `_pendingFocusDelta`, effect #9 |
| Phantom focus promotion (viewport anchor → search-context survival) | ✅ Session 4 | `useUrlSearchSync.ts`, `search-store.ts` (phantomOnly flag) |
| Phantom focus mode (hidden focus, click-to-detail) | ❌ Not implemented | — |
| `focusMode` preference | ❌ Not implemented | — |

## What Must Not Break

Sort-around-focus, density-change restoration, scrubber, two-tier
virtualisation, keyboard navigation, detail/fullscreen transitions, URL
sync. All existing E2E and unit tests must pass after each session.

---

## Session 1 — Focus Survives Search Context Change (Primary Path) ✅

**Status:** Complete. 295 unit tests, 134 E2E tests pass.
filters, the focused image is found in the new results and scrolled to. If
not found, focus is cleared and view resets to top (existing behaviour).

**Pre-condition:** All existing tests pass.
**Post-condition:** New unit tests + E2E test verify the primary path.

### The Wiring Gap

In `useUrlSearchSync.ts` (lines 102–114), `sortAroundFocusId` is only set
when the change is sort-only:

```ts
const sortAroundFocusId =
  isSortOnly
    ? useSearchStore.getState().focusedImageId
    : null;
```

For a query/filter change with a focused image, we need to also pass
`focusedImageId` — reusing the same `_findAndFocusImage` machinery that
sort-around-focus already uses.

### Steps

**S1.1 — Wire `focusedImageId` into non-sort search calls** (~30 min)

In `useUrlSearchSync.ts`, change the `sortAroundFocusId` computation:

```ts
const sortAroundFocusId =
  useSearchStore.getState().focusedImageId ?? null;
```

This passes the focused image ID on ALL search context changes (sort, query,
filter). The existing `_findAndFocusImage` machinery handles the rest — it
already checks the first page, then seeks if needed, and clears focus on
failure.

**Consideration:** Should we ALWAYS try to preserve focus? Or only when the
change is "refinement-like" (adding a filter, narrowing a query) vs
"replacement-like" (typing a completely different query)?

Decision: **always try.** The `_findAndFocusImage` fallback (image not found
→ clear focus, reset to top) is already correct for the "completely different
query" case. The cost of trying and failing is one wasted ES lookup
(`countBefore` / sort-value fetch for an image that doesn't exist in the new
results). This is negligible. The benefit of succeeding is the core "Never
Lost" guarantee.

Exception: `resetToHome()` already clears focus before searching — that path
is unaffected.

**S1.2 — Handle `_findAndFocusImage` failure gracefully** (~30 min)

Verify the current failure path in `_findAndFocusImage`:
- When the focused image's sort values can't be fetched (image not in
  index) → should clear focus and let the search display results from the
  top. Check that `sortAroundFocusStatus` is cleared and `loading` is
  unset.
- When `countBefore` fails → same.

If any failure path leaves the store in a bad state (status stuck, loading
stuck), fix it.

**S1.3 — Unit tests** (~1 hour)

In `search-store.test.ts` (or a new focused file), add:

1. **"focus preserved across query change when image exists in new results"**
   — Set up buffer with image A focused. Mock the data source so a search
   for a different query returns results containing image A. Call
   `search("A")`. Assert `focusedImageId` is still "A" and
   `sortAroundFocusGeneration` incremented.

2. **"focus cleared when image not in new results"** — Same setup, but mock
   returns results NOT containing image A. Call `search("A")`. Assert
   `focusedImageId` is null, view is at top.

3. **"focus not passed when focusedImageId is null"** — Verify that
   `search(null)` doesn't trigger `_findAndFocusImage` (baseline).

**S1.4 — E2E test** (~1 hour)

In `e2e/local/`, add a spec (or extend an existing one):

1. Load sample data. Focus an image (click). Note its ID.
2. Change the query to something that still includes the focused image
   (e.g., search by a field value from that image).
3. Assert: focused image ID unchanged, image visible in viewport.
4. Change the query to something that excludes the focused image.
5. Assert: focus cleared, viewport at top.

**S1.5 — Verify no regressions** (~15 min)

Run `npm test` and `npx playwright test`. All green.

---

## Session 2 — Neighbour Fallback (Cherry on the Cake)

**Delivers:** When the focused image doesn't survive a search context change,
the engine scans its old neighbours and focuses the nearest survivor.

**Pre-condition:** Session 1 complete, tests pass.
**Post-condition:** New unit tests verify the fallback path.

### Steps

**S2.1 — Cache neighbour IDs before search** (~30 min)

Before `search()` replaces the buffer, snapshot the focused image's
neighbours. In `search-store.ts`, at the start of the `search()` method:

```ts
const prevNeighbours = focusedImageId
  ? _captureNeighbours(focusedImageId, results, bufferOffset, imagePositions)
  : null;
```

`_captureNeighbours` returns an ordered array of IDs: the focused image
first, then alternating forward/backward (±1, ±2, … ±N). N = 20 is
probably enough. These are cheap — just indexing into the existing buffer.

**S2.2 — Scan new results for surviving neighbours** (~1 hour)

After the first page of new results arrives and `_findAndFocusImage` fails
(image not found), before clearing focus:

1. Iterate through `prevNeighbours` (nearest first).
2. For each ID, check if it exists in the new first page of results
   (`results.find(r => r.id === id)`).
3. First hit → set as `focusedImageId`, let sort-around-focus machinery
   scroll to it.
4. No hits in first page → optionally do a targeted ES check (`mget` or
   `ids` query) for the neighbour batch. This is a single ES round-trip.
5. Still no hits → clear focus, reset to top. Graceful failure.

**Decision point:** Is the targeted ES check (step 4) worth the complexity?
Start without it — first-page scan only. If users report "I narrowed my
search and lost my place" in practice, add the ES check later.

**S2.3 — Unit tests** (~45 min)

1. **"neighbour focused when focused image leaves results"** — Image A
   focused, A's neighbour B exists in new results, A doesn't. Assert B
   is focused after search.

2. **"nearest neighbour preferred"** — Neighbours B (distance 1) and C
   (distance 3) both survive. Assert B is focused, not C.

3. **"no neighbours survive → focus cleared"** — Neither A nor any
   neighbours in new results. Assert focus null, top of results.

**S2.4 — E2E test** (~45 min)

Similar to S1.4 but specifically set up data where the focused image leaves
results but adjacent images don't.

### Implementation note (from Session 1 agent)

The failure path in `_findAndFocusImage` now shows `fallbackFirstPage` results
(with correct `total`) instead of leaving a stale buffer. The neighbour scan
should happen inside this `fallbackFirstPage` branch — before the `set()` that
clears focus and resets to first-page results. The plan above says "before
clearing focus" which is correct, but the specific insertion point is the
`if (fallbackFirstPage)` block inside the "image not found" path (~line 1130)
and the catch/timeout paths that also use `fallbackFirstPage`.

---

## Session 3 — Arrow Snap-Back After Seek

**Delivers:** When focus is set but the focused image is far from the
viewport (because the user seeked away), pressing an arrow key snaps back
to the focused image's position first, then moves from there.

**Pre-condition:** Sessions 1–2 complete.
**Post-condition:** New unit + E2E tests verify snap-back.

### Implementation notes (from Session 2 agent)

**`fallbackFirstPage` semantics have shifted.** Since the Session 2 stale-buffer
fix, `fallbackFirstPage` doubles as a "buffer is stale" signal — it gates the
`isInBuffer` shortcut in `_findAndFocusImage`. Snap-back should call
`_findAndFocusImage` with `fallbackFirstPage: null` (or use a lighter code
path) — the buffer IS current (same query/sort), so `isInBuffer` should
correctly fire when the image is already loaded. Do NOT pass a fallback
"just in case" or the shortcut will be bypassed, forcing a redundant seek.

**`_findAndFocusImage` signature:** The optional `prevNeighbours` parameter
is only meaningful when called from `search()`. Snap-back callers should
omit it (or pass `null`). Same applies to Session 4's phantom promotion.

### Steps

**S3.1 — Detect "focus distant from viewport"** (~30 min)

In `useListNavigation.ts`, when an arrow key is pressed in "has focus"
mode, check whether `focusedImageId` is in the current buffer AND visible
(within the virtualizer's visible range).

`imagePositions.has(focusedImageId)` is O(1) — use it for the "in buffer?"
check. For "visible?", compare against the virtualizer's visible range.

- If the focused image is in view → normal behaviour (move focus by delta).
- If the focused image is in the buffer but off-screen → scroll to it
  (existing `scrollToIndex`), then move focus by delta.
- If the focused image is NOT in the buffer (seeked away) → trigger a seek
  back to the focused image's position. After seek completes, move focus.

**S3.2 — Seek-to-focus action** (~1 hour)

Add a store action or orchestration function: `seekToFocused()`. This:

1. Reads `focusedImageId`.
2. Uses `_findAndFocusImage` machinery (or a lighter variant — we already
   know the image exists because focus is set) to find its current position
   and seek the buffer there.
3. After seek, the focused image is back in the buffer and visible.

**Design choice — keydown handlers are synchronous.** Two options:

- **(a) Snap-back only on first press:** Arrow press triggers seek back to
  focused image (no delta). User presses again to move. Simplest — zero new
  state, no async coordination. Recommended.
- **(b) Queue the delta in a promise chain:** First press seeks, then applies
  the delta when seek completes. More complex, potentially janky if seek
  takes 200ms+. Classic over-engineering for a keystroke that takes <100ms
  to repeat.

Recommend option (a) unless user explicitly wants (b).

**S3.3 — Handle edge case: focused image no longer in index** (~30 min)

If the user focused image A, seeked away, and A was deleted/expired in the
meantime, `seekToFocused` will fail. Clear focus and fall back to normal
unfocused arrow behaviour (scroll by row).

**S3.4 — Unit tests** (~45 min)

1. **"arrow key snaps back to focused image after seek"** — Focus image A at
   position 100. Seek to position 50,000. Press ↓. Assert buffer is now
   around position 100 and focus moved to position 101.

2. **"arrow key works normally when focus is in view"** — Focus image A.
   Press ↓. Assert focus moved to next image (no seek).

3. **"snap-back clears stale focus"** — Focus image A, seek away, A is
   deleted. Press ↓. Assert focus cleared, viewport scrolls by one row.

**S3.5 — E2E test** (~30 min)

Focus an image, scrubber-seek to a distant position, press arrow key,
verify you're back at the focused image.

---

## Session 4 — Phantom Focus Promotion ✅

**Status:** Complete. 315 unit tests, 140 E2E tests pass.

**Delivers:** The viewport anchor (`_viewportAnchorId`) gets the same
search-context-change guarantee as explicit focus. When phantom focus is all
we have (no explicit focus), changing query/filters still tries to keep the
anchor image in view. The `phantomOnly` flag ensures the focus ring never
appears — promoted phantom focus uses the seek scroll mechanism instead of
`sortAroundFocusGeneration`.

**Pre-condition:** Sessions 1–2 complete. (No dependency on Session 3 —
snap-back and phantom promotion are independent. Sessions 3 and 4 can be
done in either order or in parallel.)
**Post-condition:** Phantom focus preserves position across query changes.

### Steps

**S4.1 — Promote `viewportAnchorId` to store or first-class getter** (~30 min)

Currently a module-level `let` in `useDataWindow.ts`. For the
search-context-change path to use it as a fallback (when `focusedImageId`
is null), it needs to be accessible from `useUrlSearchSync`. Options:

- Move to Zustand store (simplest access, but updated every scroll frame
  → perf concern with Zustand subscribers).
- Keep module-level but export a getter (already done: `getViewportAnchorId()`).
  Use this from `useUrlSearchSync`.

Decision: use the existing getter. No store move needed.

**S4.2 — Fall back to viewport anchor in `useUrlSearchSync`** (~30 min)

```ts
const sortAroundFocusId =
  useSearchStore.getState().focusedImageId
  ?? getViewportAnchorId();
```

Now non-sort search changes also attempt to preserve position around the
viewport anchor when there's no explicit focus.

**Implementation note (from Session 3 agent):** `_findAndFocusImage` now
has a 7th parameter `hintOffset?: number | null`. Phantom promotion callers
should pass `null` (or omit it) — the viewport anchor's global offset isn't
tracked like `_focusedImageKnownOffset`. Only `seekToFocused` uses hintOffset.

**S4.3 — Relaxation: skip phantom anchor for sort changes** (~15 min)

When `isSortOnly && !focusedImageId`, do NOT pass the viewport anchor.
Sort-only changes without explicit focus should reset to top (this is
the relaxation documented in the architecture doc §4).

```ts
const sortAroundFocusId =
  useSearchStore.getState().focusedImageId
  ?? (isSortOnly ? null : getViewportAnchorId());
```

**Implementation note (from Session 1 agent):** `isSortOnly` is already
computed in `useUrlSearchSync.ts` but deliberately unused — preserved
specifically for this session's relaxation logic. No new computation needed.

**S4.4 — Tests** (~1 hour)

1. **"phantom focus preserved across query change"** — No explicit focus.
   Scroll to middle of results. Change query. Assert viewport is near the
   same images.

2. **"phantom focus NOT preserved across sort-only change"** — No explicit
   focus. Scroll to middle. Change sort order. Assert viewport resets to
   top.

---

## Session 5 — Smoke Polish on Real TEST Cluster

**Status:** Complete.

**Delivered:** 6 smoke tests validated against real TEST cluster (~1.3M images).
All pass. Scrubber thumb flash-to-top bug found and fixed.

**Pre-condition:** Sessions 1–4 complete. `start.sh --use-TEST` running on port 3000.
Explicit user permission for smoke tests against real ES (read-only).
**Post-condition:** `e2e/smoke/focus-preservation-smoke.spec.ts` with 6 headed test
scenarios (T1–T6). 315/315 unit tests pass. 140/140 local E2E pass. 6/6 smoke pass.

### Test scenarios

| ID | Scenario | What it checks | Result |
|----|----------|---------------|--------|
| T1 | Phantom promotion — clear filter | Target visible, same position (±1 row), no focus ring, scrubber stable, no column shift | PASS |
| T2 | Explicit focus — clear filter | Focus ring preserved, same viewport position, scrubber stable | PASS |
| T3 | Explicit focus — sort change | Focus ring preserved, viewport position restored via ratio | PASS |
| T4 | Neighbour fallback | Focus moves to surviving neighbour, near original position | PASS |
| T5 | Arrow snap-back | Image re-fetched from deep position, focus on adjacent image | PASS |
| T6 | Scrubber thumb stability | Thumb does not flash to top during phantom promotion | PASS |

### Fixed issues

- **Scrubber thumb flash-to-top:** In deep-seek mode (>65k results), `_findAndFocusImage`
  uses `offset=0` as placeholder before async `countBefore` corrects. This caused the
  scrubber thumb to briefly jump to position 0. Fix: DOM-level flash guard in
  `Scrubber.tsx` — if `prevThumbTop > 50px && newThumbTop < 10px`, skip the DOM write.
  The correction arrives ~100ms later and writes the correct position.

### Not-an-issue (from Session 4 concerns)

- **Row shift:** Not reproducible in smoke tests. Column count stable across transitions.
- **Scrubber thumb jump (store-level):** `bufferOffset` still goes `327k → 0 → 785k`
  internally. This is expected — the store sets the placeholder offset atomically with
  `loading: false`. The DOM guard prevents the visual artefact.

---

## Session 6a — Phantom Focus Mode: Click & Keyboard Behaviour

**Delivers:** A `focusMode: "explicit" | "phantom"` preference. When
`"phantom"`: single-click enters detail, arrows scroll rows, no focus ring,
`Enter`/`f` disabled. On `pointer: coarse`, always phantom regardless of
preference.

**Pre-condition:** Sessions 1–4 complete.
**Post-condition:** Both modes work for click and keyboard. E2E tests.

### Implementation notes (from Session 3 agent)

**Separate UI preferences store.** `focusMode` is a UI concern, not search
state. Putting it in `search-store` couples it to search subscriptions and
makes the store harder to reason about. Consider a lightweight
`useUiPrefsStore` (Zustand, localStorage-persisted). The search store already
has ~50 fields — don't add more unless they affect search behaviour.

**`matchMedia` listener, not one-time check.** `pointer: coarse` detection
must use `matchMedia("(pointer: coarse)").addEventListener("change", ...)`
to react to runtime changes (iPad detaching keyboard, Chrome DevTools
toggling device emulation). A one-time check at startup will be wrong when
the device class changes mid-session.

### Steps

**S6a.1 — `focusMode` store + preference** (~30 min)

Add a `useUiPrefsStore` (or add to an existing non-search store):
- `focusMode: "explicit" | "phantom"` — persisted in localStorage.
- `effectiveFocusMode` — derived: if `pointer: coarse` → `"phantom"`,
  else → stored preference.

Use `matchMedia("(pointer: coarse)")` with a change event listener.

**S6a.2 — Click behaviour** (~45 min)

In `ImageGrid.tsx` and `ImageTable.tsx`:
- `effectiveFocusMode === "explicit"`: single-click → `setFocusedImageId`.
  Double-click → enter detail. (Today's behaviour.)
- `effectiveFocusMode === "phantom"`: single-click → enter detail directly
  (set phantom focus as side-effect). No double-click handler needed.

**Complexity warning:** This changes the fundamental meaning of click across
grid cells, table rows, AND potentially the metadata panel. Test every
combination: grid click, table click, grid double-click (should still work
in explicit), table double-click. Also consider: what happens if the user
switches mode while an image is focused? Clear focus? Keep it?

**S6a.3 — Keyboard behaviour** (~30 min)

In `useListNavigation.ts`:
- `effectiveFocusMode === "phantom"`: arrow keys → `scrollByRows` (existing
  no-focus path). `Enter` → no-op. `f` → no-op. `Home`/`End` → scroll only.
  No focus is ever set via keyboard.
- `effectiveFocusMode === "explicit"`: today's behaviour unchanged.

**S6a.4 — Focus ring visibility** (~15 min)

In the grid cell / table row components, gate the focus ring CSS on
`effectiveFocusMode === "explicit"`.

**S6a.5 — E2E tests** (~1 hour)

1. **Phantom mode: tap-to-enter works.** Click image → detail opens.
2. **Phantom mode: arrows scroll, no focus ring.** Press ↓ → viewport
   scrolls, no ring appears.
3. **Explicit mode: existing behaviour unchanged.** (Run existing E2E suite.)
4. **`pointer: coarse` override.** (May need Playwright device emulation.)

---

## Session 6b — Phantom Focus Mode: Return-from-Detail & Density Interactions

**Delivers:** Return-from-detail in phantom mode preserves position.
Density switches in phantom mode preserve position via viewport anchor.

**Pre-condition:** Session 6a complete.
**Post-condition:** Full round-trip works in phantom mode.

### Steps

**S6b.1 — Return-from-detail in phantom mode** (~45 min)

When user presses Backspace from detail in phantom mode:
- Set `_viewportAnchorId` to the image that was open (so the engine knows
  where to scroll the list).
- Navigate back to list view.
- Position restoration already works via `DensityFocusState` — verify it
  picks up the viewport anchor.

This is more complex than it sounds — the return path touches router
navigation, density-focus save/restore, and the mount effect in
`useScrollEffects`. Test the full round-trip: click → detail → Backspace →
list → verify position → density switch → verify position again.

**S6b.2 — Density switch in phantom mode** (~30 min)

Verify that density switches (grid↔table) preserve position when only
the viewport anchor is set (no explicit focus). The existing
`DensityFocusState` uses `focusedImageId ?? getViewportAnchorId()` — this
should work, but needs E2E verification.

**S6b.3 — E2E tests** (~1 hour)

1. **Phantom mode: return from detail preserves position.** Enter detail,
   Backspace, assert same image neighbourhood visible.
2. **Phantom mode: density switch after return from detail.** Enter detail,
   Backspace, switch grid↔table, verify position preserved.
3. **Phantom mode: return + continued scroll.** Enter detail, Backspace,
   scroll down — verify no glitches.

---

## Session 7 — Selection Foundation (Separate Workstream, Sketched Only)

> This session is intentionally vague. Selection is a separate feature that
> will be designed in detail when we begin. Included here to show where it
> fits in the dependency chain.

**Pre-condition:** Session 6b complete (both focus modes fully working).

**Key decisions needed before implementation:**
- Selection gesture in explicit mode: checkbox? Ctrl/Cmd-click? Both?
- Selection gesture in phantom mode: checkbox? Long-press (mobile)? Both?
- Selection-mode stickiness (Kahuna-style "once selected, clicks also select")
  vs always-orthogonal?
- Metadata panel: selection takes priority over focus — implementation of
  "target images" concept.

---

## Test Strategy

| Layer | What | When |
|-------|------|------|
| Unit (`npm test`) | Store logic: focus preservation, neighbour scan, snap-back | After every `src/` change |
| E2E (`npx playwright test`) | Full interaction: click → search → assert focus, density switch, seek + arrow | After each session |
| Manual on TEST | Verify against ~9M real images (sort-around-focus timing, image-exists check perf) | After Sessions 1 and 4 |

Existing E2E helpers (`focusNthItem`, `getFocusedImageId`, `waitForSortAroundFocus`)
cover the infrastructure. New specs extend the same helpers.

---

## Performance Note (Session 1)

`_findAndFocusImage` Step 2 (`countBefore`) was the bottleneck on >65k datasets
(2-5s on 1.3M results). Now skipped in deep-seek mode — buffer loads immediately
via sort-value cursors, `bufferOffset` corrected asynchronously. Focus-preserve
drops from 3-6s to ~200-300ms. This is already implemented and shipped; no future
session needs to address it.
