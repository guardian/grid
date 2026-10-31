# Audit — Back/Forward/Back/Forward shows leaked focus instead of seeked position

**Date:** 29 April 2026
**Status:** Investigation complete; fix proposed.
**Regression introduced by:** commit `1462bfaec` ("Fix 4 deterministic e2e failures
(Strict Mode double-mount race)") — *exposed* a latent bug rather than caused it.
**Latent bug since:** phantom-mode `phantomOnly` restore was added (Phase 3 popstate
restore, late April 2026 — see changelog "Phase 3 — Popstate restore").

---

## Repro

Click-to-focus mode, fresh kupua:

1. Focus image **A**
2. Switch sort to Last Modified (A still focused via sort-around-focus)
3. Clear focus by clicking the gap between images
4. Seek deep via scrubber
5. Browser **back**
6. Browser **forward** → CORRECT: deep seeked position visible
7. Browser **back**
8. Browser **forward** → BUG: shows image A focused at top, not the deep seeked
   position from step 6

## History entry layout

Scrubber seek does **not** push history (`src/routes/search.tsx:159` calls
`store.seek()` directly; no URL change). So the user only ever has two entries:

- **E0** — pre-sort state (`uploadTime` order)
- **E1** — post-sort (`lastModified`), pushed at step 2 by `useUpdateSearchParams`

E1's snapshot stores `anchorOffset` + `viewportRatio`, which is what makes the
"forward → deep position" work in step 6 even though the URL has no `offset`
parameter.

## State trace through the repro (post-commit)

| Step | Action                  | `focusedImageId`              | `_viewportAnchorId` | E0 snapshot           | E1 snapshot                  |
|------|-------------------------|-------------------------------|---------------------|------------------------|------------------------------|
| 2    | sort push               | A                             | (irrelevant)        | A explicit             | —                            |
| 3    | clear focus             | null                          | A-area              | A explicit             | —                            |
| 4    | seek deep               | null                          | deep_image          | A explicit             | —                            |
| 5    | back                    | null → **A** (E0 restore)     | A-area              | A explicit             | **phantom-deep** ✓ captured  |
| 6    | forward (phantomOnly)   | **A persists (leak)**         | deep_neighbour      | A explicit             | phantom-deep                 |
| 7    | back                    | A → A (E0 restore)            | A-area              | A explicit             | **CORRUPTED to A-explicit** ❌|
| 8    | forward                 | A                             | A                   | A explicit             | A-explicit → renders A at top|

---

## Two combined defects

### Defect 1 (latent, pre-existing) — `focusedImageId` leaks across `phantomOnly` restore

When step 6 restores E1 with `phantomOnly: true`, none of the relevant store
write sites clear `focusedImageId`:

- `search-store.ts:1761` — initial reset at top of `search()` does **not**
  include `focusedImageId: null`.
- `search-store.ts:1444-1459` — in-buffer phantom branch in `_findAndFocusImage`
  sets `_phantomFocusImageId` but leaves `focusedImageId` untouched.
- `search-store.ts:1521-1531` — outside-buffer phantom branch likewise.

So after step 6, the page shows the deep buffer, A is invisible (out of buffer),
but `focusedImageId === "A"` is still set in the store. This violates the
documented phantom-mode invariant ("phantom mode never sets `focusedImageId`").

### Defect 2 (introduced by `1462bfaec`) — anchor-update guard removed

Pre-commit `useDataWindow.ts` updated `_viewportAnchorId` only when
`focusMode === "phantom" || !focusedImageIdRef.current`. With the leaked
`focusedImageId === "A"` in click-to-focus mode, the anchor stayed **stuck at
its previous value** (`deep_image` from before the popstate). That stickiness
incidentally hid Defect 1 — see below.

The commit replaced the guard with `if (results.length > 0)` and added a new
`useEffect([bufferOffset, results, twoTier])` that re-populates the anchor on
every buffer swap (`useDataWindow.ts:455-480, 515-531`). Now anchor faithfully
tracks the viewport regardless of `focusedImageId`. The Strict-Mode density
tests need this; the underlying production behaviour is also more correct.

### Why the combination breaks step 8

The popstate departure-capture guard at `useUrlSearchSync.ts:198-210`:

```ts
if (!existing || !existing.anchorIsPhantom) {
  // overwrite always
} else {
  // existing IS phantom — overwrite only if anchor image changed
  const currentAnchor = getViewportAnchorId();
  if (currentAnchor && currentAnchor !== existing.anchorImageId) overwrite;
}
```

At **step 7 popstate (E1 → E0)**, departure-capture fires for E1. `existing`
is the phantom-deep snap from step 5.

- **Pre-commit:** `currentAnchor === deep_image` (sticky because anchor update
  was guarded off by leaked `focusedImageId`). Equal to `existing.anchorImageId`
  → SKIP. E1 snapshot preserved. Step 8 forward correctly restores deep.
- **Post-commit:** `currentAnchor === deep_neighbour` (anchor was tracking the
  viewport during/after step 6). Different → OVERWRITE.

The overwrite calls `buildHistorySnapshot()`, which at
`build-history-snapshot.ts:46-58` prefers `focusedImageId` over the viewport
anchor in explicit mode:

```ts
if (focusMode === "explicit") {
  anchorImageId = focusedImageId;  // ← reads the leaked "A"
}
```

So E1's snapshot is clobbered with `{anchorImageId: A, anchorIsPhantom: false}`.
Step 8 forward then reads that snapshot, takes the explicit-restore path
(`focusPreserveId = A`, no `phantomOnly`), and centres on A.

### Why step 6 worked despite the leak

At step 5 → step 6, the analogous departure-capture for E0 takes the
always-overwrite branch (`existing.anchorIsPhantom === false` for the
A-explicit snap). Since `focusedImageId === A` and `buildHistorySnapshot`
writes `anchor=A`, the overwrite produces an identical snapshot. No visible
corruption.

---

## Proposed fix

**Option 1 (recommended): Fix Defect 1 directly.**

Clear `focusedImageId: null` (and `_focusedImageKnownOffset: null`) on the
`phantomOnly` code paths. The leak is the real bug; Defect 2's removal merely
exposed it. Other consumers reading `focusedImageId` after a phantom restore
(snapshot capture, useReturnFromDetail's guard, useScrollEffects Effect #10
fallback chain, position-preserve in user-initiated changes via
`useUrlSearchSync.ts` `explicitFocus`) are also at risk and benefit.

Three sites, all in `search-store.ts`:

1. **`search()` initial reset** (line ~1761): when called with `options.phantomOnly`,
   include `focusedImageId: null, _focusedImageKnownOffset: null` in the reset
   `set()`. This covers the case where the focused image is *not* in the new
   first page (control flow goes via `_findAndFocusImage`'s outside-buffer
   branch).
2. **`_findAndFocusImage` in-buffer phantom branch** (~line 1444): defensive
   `focusedImageId: null, _focusedImageKnownOffset: null`.
3. **`_findAndFocusImage` outside-buffer phantom branch** (~line 1521):
   defensive `focusedImageId: null, _focusedImageKnownOffset: null`.

(2) and (3) are belt-and-braces; (1) is the load-bearing one for this repro.

**Rejected alternatives:**

- *Option 2 — tighten the departure-capture guard* (also bail when new snap
  would have `anchorIsPhantom !== existing.anchorIsPhantom`). Treats symptoms,
  not cause. Snapshot system would still be capturing leaked state in other
  paths.
- *Option 3 — revert anchor-always-update.* Re-breaks the Strict-Mode tests
  the commit was trying to fix. The new behaviour is more correct.

## Tests to add

- **Unit test (`search-store.test.ts`):** call `search("A", { phantomOnly: true })`
  with a starting state where `focusedImageId === "A"`. Assert `focusedImageId`
  is null after the search settles, regardless of whether A lands in the first
  page or requires `_findAndFocusImage` outside-buffer load.
- **E2E test (`browser-history.spec.ts`):** the full repro above. Assert that
  step 8 lands on the deep position (scrollTop matches step 6's), not at top
  with focus ring on A.

---

## Files referenced

- `kupua/src/stores/search-store.ts` — `search()`, `_findAndFocusImage`
- `kupua/src/hooks/useDataWindow.ts` — anchor update + new useEffect
- `kupua/src/hooks/useUrlSearchSync.ts` — popstate departure-capture
- `kupua/src/lib/build-history-snapshot.ts` — anchor selection
- `kupua/src/routes/search.tsx:159` — scrubber wiring (no history push)
