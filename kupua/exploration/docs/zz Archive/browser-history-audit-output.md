# Prior Art — Snapshot-Based Position Restoration

Research output for the implementing agent. Mined from kupua git history
and current source. Read alongside the handoff doc and the "Future polish"
section of `browser-history-analysis.md`.

---

## Reusable tech

### 1. `restoreAroundCursor(imageId, cursor, cachedOffset)` — [search-store.ts:L3286](../../src/stores/search-store.ts#L3286)

Cursor-based buffer rebuild around a target image. Parallel
`countBefore(cursor)` + `searchAfter(ids: imageId)`, then
`_loadBufferAroundImage` for bidirectional fill. Falls back to
`seek(cachedOffset)` when cursor is null; falls back to `seek` on error.

**Phases that use it:** Phase 3 (primary restore primitive on popstate),
Phase 4 (mount-time restore on reload — already wired in ImageDetail
for the offset-cache path).

**Does NOT implement "render nothing until buffer ready".** Sets
`loading: true` on entry; old buffer stays visible during the async
work (no explicit gate). The buffer is replaced atomically via one
`set()` call, so there's no partial-render frame. But `loading: true` IS
exposed to the view — any consumer checking `loading` will see it.

**Suppress guard:** Reads `_suppressRestore` on entry (L3292); if set,
consumes the flag and returns. Prevents the logo-reset race
(see Cautionary tale #1).

### 2. `_findAndFocusImage` + sort-around-focus "render gate" — [search-store.ts:L1148](../../src/stores/search-store.ts#L1148), [L1749-1770](../../src/stores/search-store.ts#L1749)

**This is the closest existing "render nothing until buffer ready"
mechanism.** When `search()` receives a `sortAroundFocusId` that isn't
in the first page:
1. Keeps `loading: true`.
2. Does NOT set `total`, `results`, or `bufferOffset` — old buffer
   stays visible (or empty on cold load).
3. Fires `_findAndFocusImage` async, which loads the target image's
   neighbourhood and commits buffer + total + loading atomically.

**Phase 3 render gate:** The snapshot restore can reuse this exact
pattern. Instead of inventing a `_pendingSnapshotRestore` flag, pass
the snapshot's `anchorImageId` as `sortAroundFocusId` into `search()`.
The existing code path already holds the render, defers `total`, and
commits once. The only delta: the snapshot provides the cursor and
offset hint (today's sort-around-focus does a full `countBefore` to
find them). Wire `anchorCursor` and `anchorOffset` into
`_findAndFocusImage`'s `hintOffset` parameter.

**Caveat:** The sort-around-focus gate only engages when the image
is NOT in the first page. If it IS in the first page, `search()` sets
`loading: false` immediately. For snapshot restore this is fine — the
first page IS the correct content if the anchor was near the top.

### 3. `seek(globalOffset)` — [search-store.ts:L2173](../../src/stores/search-store.ts#L2173)

Random-access jump. Five strategies (end-key, shallow from/size,
position-map, deep percentile, keyword composite-agg). Old buffer stays
visible during seek; new buffer committed atomically. Bumps
`_seekGeneration` so views know to reposition.

**Phase 3 fallback:** When snapshot has `anchorOffset` but no
`anchorCursor` (rare — `extractSortValues` failed at capture time), use
`seek(anchorOffset)`. Also used as the cursor-null fallback inside
`restoreAroundCursor` itself.

### 4. `buildSearchKey(params)` — [image-offset-cache.ts:L31](../../src/lib/image-offset-cache.ts#L31)

Stable fingerprint of query/sort/filters. Strips `image` + `density`,
sorts keys alphabetically, JSON-stringifies. Use directly for
`HistorySnapshot.searchKey`.

### 5. `extractSortValues(image, orderBy)` — [image-offset-cache.ts:L71](../../src/lib/image-offset-cache.ts#L71)

Builds ES sort cursor from in-memory image fields — pure, zero network.
Use for `HistorySnapshot.anchorCursor` at capture time.

### 6. `getViewportAnchorId()` — [useDataWindow.ts:L153](../../src/hooks/useDataWindow.ts#L153)

Returns the image nearest viewport centre. Module-level variable,
updated on every `reportVisibleRange`. Consumed imperatively.

**Phase 2:** Called by `buildHistorySnapshot()` for the anchor in
click-to-open mode (phantom focus path).

### 7. `getVisibleImageIds()` — [useDataWindow.ts:L172](../../src/hooks/useDataWindow.ts#L172)

Returns visible images ordered by distance from viewport centre. Used
by phantom focus promotion to restrict neighbour fallback to visible
images.

### 8. `suppressNextRestore()` / `clearSuppressRestore()` — [search-store.ts:L490](../../src/stores/search-store.ts#L490)

One-shot gate. Already protects `restoreAroundCursor` from the
logo-reset race. Phase 3's popstate restore path should honour the
same guard — read `_suppressRestore` before attempting restore.

### 9. `pushNavigate` / `pushNavigateAsPopstate` — [orchestration/search.ts:L315](../../src/lib/orchestration/search.ts#L315)

Push helpers with user-initiated flag management. Phase 1 adds
`kupuaKey` minting here. Phase 2 adds `markPushSnapshot()` call.

### 10. `_captureNeighbours(±20)` — [search-store.ts](../../src/stores/search-store.ts) (in `5cb8d75e7`)

Captures ±20 image IDs from the buffer around a focus point before
a destructive operation. Not directly needed by snapshot restore, but
the pattern (snapshot-before-transition) is the same one
`buildHistorySnapshot()` uses.

---

## Conceptual guidance

### G1. "Old buffer stays visible, new buffer committed atomically"

Every async buffer transition in the store (seek, restoreAroundCursor,
sort-around-focus, extend) follows the same contract: don't clear the
buffer on entry, replace it in one `set()` call on completion. This
eliminates intermediate empty/partial frames at the Zustand level.

**For snapshot restore:** The render gate in Phase 3 should follow this
pattern — never call `set({ results: [], bufferOffset: 0 })` as a
transition step. The popstate effect triggers `search()` which already
holds the old buffer. Just ensure the snapshot path's final `set()`
replaces everything atomically.

*Commits: throughout, but especially `46336967b` (reload restore), `53ebef3fd` (arrow snap-back).*

### G2. "Total deferral prevents virtualizer flash"

Setting `total` before the buffer is ready causes TanStack Virtual to
resize → scroll-clamp → scroll-seek → flash of wrong content. The
sort-around-focus path (L1756) explicitly defers `total` until
`_findAndFocusImage` completes. If you set `total` and `results` in
separate `set()` calls, you'll hit this.

*Commit: `4baad73eb` — phantom focus promotion changelog entry details
the "flash of unwanted content" bug caused by premature total set.*

### G3. Separate abort controllers for independent concerns

`_findFocusAbortController` (focus-finding) is isolated from
`_rangeAbortController` (seeks/extends). Without this, a user scrolling
during a pending sort-around-focus would abort the focus-find mid-flight.

**For snapshot restore:** If the render gate uses the sort-around-focus
path (recommendation above), the abort isolation is inherited. If you
invent a new path, create a dedicated controller.

*Commit: `872734dd8` — Focus survives search context change.*

### G4. Refs survive React effect re-fires

`sortFocusRatioRef`, `phantomIdRef` in `useScrollEffects.ts` use React
refs (not state) to persist values that must survive effect re-fires
triggered by dependency changes during async operations.

**For snapshot restore:** If the render gate involves effects that
re-fire during the hold, use refs for the snapshot data.

*Commit: `4baad73eb` — Phantom focus promotion.*

### G5. Module-level flags for cross-component coordination

`_isUserInitiatedNavigation`, `_detailEnteredViaSpa`,
`_suppressRestore`, `_prevParamsSerialized` — all module-level
variables consumed by effects in other components. The pattern: set
synchronously before navigate, consume in the receiving effect.

**For snapshot restore:** `markPushSnapshot()` follows this same shape.
The snapshot is captured synchronously before `navigate()`, consumed by
the `useUrlSearchSync` effect on the receiving end.

*Commits: `ca0b79bfc` (Make history great. Again), `74c126839` (Home bug).*

### G6. The image-offset-cache reload ordering

`storeImageOffset` is called synchronously during image open/traverse
(before `navigate()`). On reload, `search()` fires from URL params,
`total > 0` gates the restore, then `restoreAroundCursor` rebuilds the
buffer around the cached position. The "no intermediate render" is
achieved by: (a) the first `search()` loads the first page (visible
briefly — acceptable on reload), then (b) `restoreAroundCursor`
replaces it atomically.

**For snapshot restore (Phase 4 — mount-time reload):** Same ordering
works. The only difference: the snapshot lookup key comes from
`history.state.kupuaKey` (browser-persisted) rather than `imageId`.

*Commit: `46336967b` — Position in list survives reload (even at depth).*

---

## Cautionary tales

### C1. Logo-reset → `restoreAroundCursor` race

**What happened:** `resetToHome()` calls `search()` to get fresh
first-page data, but ImageDetail is still mounted. ImageDetail sees its
deep image vanish from the buffer → fires `restoreAroundCursor` →
overwrites the fresh home-page buffer with deep-offset data. Result:
user clicks Home, briefly sees home, then snaps to deep position.

**Fix:** `suppressNextRestore()` flag — set before `search()`, consumed
by `restoreAroundCursor` on entry.

**Snapshot restore risk:** Phase 3's popstate restore path MUST check
`_suppressRestore` before attempting restore. If the popstate is a
logo-reset-initiated push (via `pushNavigateAsPopstate`), the flag
should be set by `resetToHome` and will suppress the restore.

*Commit: `74c126839` — Yet another Home bug fixed.*

### C2. `restoreAroundCursor` infinite loop in two-tier mode

**What happened:** Two bugs compounded:
- Bug A: `restoreAroundCursor` hardcoded `_seekTargetGlobalIndex: -1`.
  Two-tier mode's Effect #6 needs the correct global index → wrong
  scrollTop → scroll-seek fires → buffer relocated → restore retriggers.
- Bug B: `offsetRestoreAttempted` flag in ImageDetail was reset whenever
  `currentIndex >= 0`. After restore briefly placed image in buffer
  (flag reset), Bug A pushed buffer away (flag retriggers).
  ~20 ES round-trips in first 3 seconds.

**Fix:** Compute correct `_seekTargetGlobalIndex` in two-tier;
`restoreAttemptedForRef` keyed by imageId prevents re-triggers.

**Snapshot restore risk:** If Phase 3's restore sets
`_seekTargetGlobalIndex` incorrectly for the current scroll mode
(buffer vs two-tier), same infinite loop. Ensure the restore path
computes the correct global index.

*Commit: `6d7669142` — Fix restoreAroundCursor infinite loop.*

### C3. Premature `total` set → virtualizer flash

**What happened:** Setting `total` before buffer data is ready causes
TanStack Virtual to resize, which triggers scroll-clamp, which triggers
scroll-seek, which loads wrong content. 1–2 frame flash of position-0
results.

**Fix:** Defer `total` to the same `set()` call that provides the
final buffer data.

**Snapshot restore risk:** If the render gate sets `total` from the
search response before `restoreAroundCursor` completes, same flash.
Follow the sort-around-focus pattern: hold total until the final commit.

*Changelog entry for `4baad73eb`.*

### C4. Six failed FOCC (Flash Of Correct Content) approaches

**What was tried:** flushSync wrapping, CSS translateY, aggressive
extend thresholds, directional headroom bias, synthetic seek (buffer
atomic replace). All failed for different reasons:
- `flushSync`: browser compositor paints between DOM mutation and scrollTop.
- CSS transform: TanStack Virtual recalculates, compounds the flash.
- Thresholds: flash happens earlier, not gone.
- Synthetic seek: perpetual scrollTop→0 cascade on backward extends at
  scale (1.3M docs on TEST).

**Snapshot restore risk:** If Phase 3 needs sub-frame timing for the
render gate (holding until buffer ready), don't attempt `flushSync` or
CSS tricks. The existing Zustand atomic-set approach is the only one
that works.

*Changelog ~8 Apr; deviations §14.*

### C5. Parallel phantom-seek infrastructure — removed

**What happened:** Initial phantom focus promotion used a dedicated
parallel seek path (`_seekGeneration` + `_phantomSeekRatio` via
Effect #6) instead of reusing Effect #9. Caused 4 bugs: flash-of-top,
off-screen neighbours, ~100-position offset, details panel
incompatibility. ~50 lines removed.

**Snapshot restore risk:** Don't create a parallel restore path with
its own scroll-effect wiring. Reuse the existing `restoreAroundCursor`
→ `_seekGeneration` → Effect #9 path. It handles scroll modes, two-tier,
density focus, and scrubber positioning correctly.

*Changelog ~18 Apr; commit `4baad73eb`.*

---

## Specific questions answered

### Q1. Does `seek()` or `restoreAroundCursor()` already implement "render nothing until buffer ready"?

**Neither implements an explicit render gate.** Both set `loading: true`
on entry and leave the old buffer visible until the new one arrives.
The view can technically react to `loading: true`.

**However,** the **sort-around-focus path in `search()`** (L1749-1770)
DOES implement a render gate: it keeps `loading: true`, does NOT set
`total/results/bufferOffset`, and lets `_findAndFocusImage` do the
atomic commit. **This is the mechanism to reuse for Phase 3.** Wire the
snapshot's anchor into `sortAroundFocusId` and pass `anchorCursor` +
`anchorOffset` as hints. The existing gate engages automatically.

### Q2. Is there an existing "pending restore" / "transition lock" / "abort in-flight" pattern beyond `suppressNextRestore`?

**Yes — several:**
- `_seekCooldownUntil` — timestamp-based cooldown that makes extends
  bail if `Date.now() < cooldown`. Set synchronously by seek and
  restoreAroundCursor.
- `_findFocusAbortController` — isolated abort for focus-finding,
  survives seek aborts.
- `_extendForwardInFlight` / `_extendBackwardInFlight` — boolean
  guards preventing concurrent extends.
- `_seekGeneration` — bumped on every seek/restore; consumers check
  their captured generation against current to detect staleness.

**For Phase 3:** No new `_pendingSnapshotRestore` flag needed if you
route through the sort-around-focus gate (recommendation). The existing
`_seekCooldownUntil` + `_findFocusAbortController` + `_seekGeneration`
handle concurrency. Add `suppressNextRestore` to the guard chain if
it's not already there.

### Q3. How does the image-offset cache achieve "no intermediate render" on reload?

**It doesn't fully prevent it.** On reload:
1. URL sync fires `search()` → first page loads → `loading: false`.
2. ImageDetail's restore effect waits for `total > 0` → calls
   `restoreAroundCursor(imageId, cursor, offset)`.
3. `restoreAroundCursor` sets `loading: true`, loads the neighbourhood,
   commits atomically.

Between steps 1 and 3, the first page IS briefly visible (a few frames).
This is acceptable for reload (the user expects a load) but NOT for
popstate (the user expects snap-to-position).

**For Phase 3:** Don't use the ImageDetail restore-effect ordering.
Instead, inject the snapshot into `search()` via `sortAroundFocusId`
so the render gate engages BEFORE the first page is exposed to the
view. The sort-around-focus path holds everything until the anchor's
neighbourhood is loaded.

### Q4. Phantom focus + viewport anchor + restoration — any precedent for "anchor by viewport image when no focus exists"?

**Yes — `4baad73eb` (Phantom focus promotion).** `useUrlSearchSync`
already falls back to `getViewportAnchorId()` when `focusedImageId` is
null (L148-154). It passes this as `sortAroundFocusId` to `search()`
with `{ phantomOnly: true, visibleNeighbours: getVisibleImageIds() }`.
The neighbour fallback (`_captureNeighbours`) uses `visibleNeighbours`
to restrict candidates.

**For Phase 2 anchor selection:** `getViewportAnchorId()` is exactly
the right API for click-to-open mode. The flag
`EXPERIMENTAL_FOCUS_AS_ANCHOR_IN_CLICK_TO_FOCUS` gates whether
click-to-focus mode uses `focusedImageId` (flag ON) or also falls back
to viewport anchor (flag OFF).

### Q5. Has the team ever implemented and reverted a similar restoration scheme?

**No exact match.** No prior snapshot-based history restoration has been
attempted or reverted. The closest:

- **Sort-around-focus** (deviations §14): ~340 lines attempted and
  reverted because `max_result_window` capped it. The constraint no
  longer applies — kupua uses `search_after` for all deep access now.
- **Synthetic seek** (Approach C, 8 Apr): atomic buffer replacement
  tried and failed at scale due to `currentScrollTop` misalignment after
  backward prepend. Not relevant to snapshot restore (different problem —
  extend-time compensation, not seek-time placement).
- **Image-offset cache reload restore** (`46336967b`): Successfully
  shipped and still in use. This IS the closest prior art — same
  mechanism, just keyed by `imageId` instead of `kupuaKey`, and
  triggered on mount instead of popstate.

No evidence in `changelog.md` or `deviations.md` of a reverted
history-restoration scheme that would warn against the current design.
