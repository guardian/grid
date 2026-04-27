# Position Preservation — Reference

> Distilled from the April 2026 rearchitecture audit. The rearchitecture
> proposal ("always set `focusedImageId`") was evaluated and **killed** —
> P1 (update every scroll frame) has prohibitive perf cost, P2 (update at
> decision moments) is structurally identical to the existing
> `_phantomFocusImageId` one-shot pattern. The full proposal lives in
> `zz Archive/position-preservation-rearchitecture-handoff.md`.
>
> This doc preserves the two outputs that are expensive to reproduce:
> the `focusedImageId` consumer survey and the flash-site inventory.

---

## `focusedImageId` consumer survey

84 read sites across `kupua/src/`. Categorised by what `focusedImageId !== null` means at each site:

- **A. Anchor-position** (24): "Where the user is in the list" — safe to always-set
- **B. User-intent** (16): "User explicitly chose this image" — HIGH risk if always-set
- **C. Visual** (3): Focus-ring rendering — already gated by `getEffectiveFocusMode()`
- **D. Mixed/ambiguous** (11): Both meanings entangled — HIGH risk

### Full table

| File:line | Read site (1-line excerpt) | Cat | If B/D: what changes if always-set? |
|---|---|---|---|
| search-store.ts:1642 | `const { focusedImageId, params } = get()` (seekToFocused) | A | — |
| search-store.ts:1643 | `if (!focusedImageId) { set({ _pendingFocusDelta: null }); return; }` | D | Phantom scroll would trigger seekToFocused for arrow snap-back |
| search-store.ts:1654 | `await _findAndFocusImage(focusedImageId, ...)` | A | — |
| search-store.ts:1513 | `const currentFocus = get().focusedImageId` (async offset correction) | A | — |
| search-store.ts:661 | `function _captureNeighbours(focusedImageId, ...)` | A | — |
| search-store.ts:667 | `const globalIdx = imagePositions.get(focusedImageId)` | A | — |
| useDataWindow.ts:316 | `useSearchStore((s) => s.focusedImageId)` | D | Zustand subscriber — re-renders on every change |
| **useDataWindow.ts:458** | **`!focusedImageIdRef.current` (viewport anchor guard)** | **A** | ~~MAJOR~~ → **Fixed 27 Apr 2026**: guard now checks `getEffectiveFocusMode()` — in phantom mode the anchor always updates, even when `focusedImageId` is set from return-from-detail. |
| useScrollEffects.ts:278 | `focusedImageId: fid` (scrollToFocused) | A | — |
| useScrollEffects.ts:511 | `setState({ focusedImageId: firstImg.id })` (Home key) | B | Write site |
| useScrollEffects.ts:587 | `preserveId = focusedImageId ?? ...` (Effect #7) | A | Sort-only always enters preserve path |
| useScrollEffects.ts:712 | `store.focusedImageId ?? phantomIdRef.current` (Effect #9) | A | Phantom fallback unused — fine |
| useScrollEffects.ts:736 | `state.focusedImageId` (snap-back) | A | Gated by `_pendingFocusDelta` |
| useScrollEffects.ts:805 | `focusedImageId ?? getViewportAnchorId()` (Effect #10 mount) | A | — |
| useScrollEffects.ts:974 | `focusedImageId: fid` (Effect #10 unmount) | A | — |
| **useUrlSearchSync.ts:247** | **`explicitFocus ? null : getViewportAnchorId()`** | **D** | ~~MAJOR~~ → **Fixed 27 Apr 2026**: sort-only path now checks `getEffectiveFocusMode()` — phantom mode ignores `focusedImageId` for sort, restoring the intended sort-only relaxation. |
| useListNavigation.ts:249 | `focusedImageId: currentId` (moveFocus) | B | — |
| useListNavigation.ts:312 | `focusedImageId: currentId` (pageFocus) | B | — |
| useListNavigation.ts:397 | `c.focusedImageId !== null && getEffectiveFocusMode() === "explicit"` | D | Safe — mode check protects |
| useListNavigation.ts:449 | `c.focusedImageId` (Enter key) | B | Gated by hasFocus |
| useListNavigation.ts:473 | `c.focusedImageId !== null && getEffectiveFocusMode()...` | D | Safe |
| **useReturnFromDetail.ts:63** | **`previousFocus === null` guard** | **B** | **Minor: logo-click-from-detail re-focuses old image** — Note: the unconditional `setFocusedImageId` in phantom mode is now harmless for sort (gated at useUrlSearchSync), but still sets `focusedImageId` for position preservation on filter/query changes (correct). |
| ImageGrid.tsx:274 | `focusedImageIdRef.current` (captureAnchor) | A | — |
| ImageGrid.tsx:439 | `focusedImageId` (prop to useReturnFromDetail) | B | — |
| ImageGrid.tsx:456 | `focusedImageId` (prop to useListNavigation) | D | — |
| ImageGrid.tsx:526 | `isFocused={... && getEffectiveFocusMode() === "explicit"}` | C | Safe |
| ImageTable.tsx:325 | `isFocused = ... && getEffectiveFocusMode() === "explicit"` | C | Safe |
| ImageTable.tsx:662 | `focusedImageId` (prop to useReturnFromDetail) | B | — |
| ImageTable.tsx:680 | `focusedImageId` (prop to useListNavigation) | D | — |
| ImageTable.tsx:1291 | `focusedImageId={focusedImageId}` (TableBody prop) | C | — |
| FullscreenPreview.tsx:52 | `const { focusedImageId } = useSearchStore.getState()` | B | Caller gated by mode |
| FullscreenPreview.tsx:89 | `useSearchStore((s) => s.focusedImageId)` | B | `isActive ? fid : null` |
| search.tsx:225 | `useSearchStore((s) => s.focusedImageId)` | B | Gated by phantom mode |
| SearchFilters.tsx:86 | `useSearchStore((s) => s.focusedImageId)` | A | Trace label — harmless |
| build-history-snapshot.ts:41 | `const { focusedImageId } = useSearchStore.getState()` | A | Gated by `focusMode` |

### Critical sites (bolded above)

If anyone ever revisits the rearch, these three sites MUST be addressed:
1. ~~**useDataWindow.ts:458**~~ — **Fixed 27 Apr 2026.** Anchor guard now allows updates in phantom mode (`getEffectiveFocusMode() === "phantom"`) even when `focusedImageId` is set. Fixes stale anchor breaking history snapshots, density-switch, and phantom sort-around-focus.
2. ~~**useUrlSearchSync.ts:247**~~ — **Fixed 27 Apr 2026.** `focusPreserveId` now returns `null` for sort-only changes in phantom mode, even when `focusedImageId` is set (e.g. after return-from-detail). The sort-only relaxation documented in §2.2 of the architecture doc is now correctly enforced.
3. ~~**useReturnFromDetail.ts:63**~~ — **No longer needed.** The fix at site #2 means `focusedImageId` set by return-from-detail no longer leaks into sort-around-focus in phantom mode. The write itself is still correct — it serves position preservation for non-sort scenarios (filter, query, reload).

4. ~~**useUrlSearchSync.ts:~191**~~ (departing snapshot guard) — **Fixed 27 Apr 2026.** The popstate departure path refused to overwrite phantom snapshots (`anchorIsPhantom: true`), meaning user scroll after return-from-detail was never captured. Back/forward restored stale position. Fix: overwrite phantom snapshot only when anchor *image* differs (same image → skip to prevent sub-pixel drift, different image → user scrolled → update).

### Perf deal-breaker

Updating `focusedImageId` every scroll frame re-renders every visible cell
(20–40 cells × 60fps = 1200–2400 component renders/sec). The grid/table
`isFocused` prop depends on it. Not viable without moving focus to a
non-reactive ref for visual consumers.

---

## Flash-site inventory (17 sites)

| # | Site | Repro? | Sev | Notes |
|---|---|---|---|---|
| 1 | Sort change (no focus) | ~~Yes~~ **No** | ~~3~~ 0 | ~~Effect #7 sets `scrollTop=0` before `search()`.~~ → **Fixed 27 Apr 2026**: `_scrollResetGeneration` defers scroll reset to the same frame as the data swap. Zero frames of stale data. |
| 2 | Sort change (with explicit focus) | No | 0 | ~~Was flashing~~ → **Fixed 26 Apr 2026** (two-tier `countBefore` + `hintOffset`). |
| 3 | Filter change (no focus) | Theoretical | 1 | Phantom anchor mostly works. Edge: anchor gone + deep buffer → fallback. |
| 4 | Query typing (debounced) | Theoretical | 1 | Same as #3. |
| 5 | Scrubber seek (first paint) | No | 1 | Reverse-compute prevents flash. |
| 6 | Scrubber rapid drag | No | 1 | Abort + cooldown handle concurrent seeks. |
| 7 | Logo click / Home key | No | 1 | Well-guarded (`await search`, `skipEagerScroll`, `suppressDensityFocusSave`). |
| 8 | Density toggle (deep scroll) | ~5px | 1 | 2-frame rAF delay still exists but measured at ~5px drift (26 Apr 2026), negligible. Root cause (Bug #17) fixed 1 Apr 2026 — `abortExtends()` + rAF chain prevents large jumps. Residual sub-row drift is cosmetic. |
| 9 | Popstate without snapshot | ~~Yes~~ **No** | ~~2~~ 0 | ~~Same as #1 via popstate.~~ → **Fixed 27 Apr 2026**: same `_scrollResetGeneration` fix as #1. |
| 10 | Popstate with snapshot | No | 1 | Snapshot hints enable fast restore. |
| 11 | Reload with snapshot | No | 1 | Via sessionStorage. |
| 12 | Detail open/close | No | 0 | List stays mounted (opacity:0). |
| 13 | Fullscreen enter/exit | No | 1 | Minor scroll jump after traversal. Not wrong content. |
| 14 | Two-tier buffer slide | No | 0 | Atomic set. Skeletons. |
| 15 | Buffer→two-tier switch | No | 1 | Atomic total+buffer swap. |
| 16 | Detail close + restoreAroundCursor | Theoretical | 1 | `_suppressRestore` guards race. |
| 17 | Ticker click → reload | Theoretical | 1 | Scrubber thumb jumps to 0 before data. |

**Reproducible:** ~~3 sites (#1 sev 3, #8 sev 2, #9 sev 2)~~ → **All 3 fixed as of 27 Apr 2026.** #1 and #9 via `_scrollResetGeneration` (deferred scroll reset); #8 via 2-frame rAF chain with `abortExtends()`. No reproducible flash sites remain.

**Measurement infrastructure:** `e2e/shared/drift-flash-probes.ts`, `e2e/smoke/cited-scenario.spec.ts`, `e2e/smoke/flash-measurement.spec.ts`. See `e2e/README.md` § Drift & Flash.
