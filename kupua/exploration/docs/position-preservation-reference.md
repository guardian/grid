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
| **useDataWindow.ts:458** | **`!focusedImageIdRef.current` (viewport anchor guard)** | **A** | **MAJOR: anchor NEVER updates → breaks phantom sort-around-focus, snapshots, density-switch** |
| useScrollEffects.ts:278 | `focusedImageId: fid` (scrollToFocused) | A | — |
| useScrollEffects.ts:511 | `setState({ focusedImageId: firstImg.id })` (Home key) | B | Write site |
| useScrollEffects.ts:587 | `preserveId = focusedImageId ?? ...` (Effect #7) | A | Sort-only always enters preserve path |
| useScrollEffects.ts:712 | `store.focusedImageId ?? phantomIdRef.current` (Effect #9) | A | Phantom fallback unused — fine |
| useScrollEffects.ts:736 | `state.focusedImageId` (snap-back) | A | Gated by `_pendingFocusDelta` |
| useScrollEffects.ts:805 | `focusedImageId ?? getViewportAnchorId()` (Effect #10 mount) | A | — |
| useScrollEffects.ts:974 | `focusedImageId: fid` (Effect #10 unmount) | A | — |
| **useUrlSearchSync.ts:247** | **`explicitFocus ? null : getViewportAnchorId()`** | **D** | **MAJOR: phantom promotion NEVER fires → "Never Lost" dead in phantom mode** |
| useListNavigation.ts:249 | `focusedImageId: currentId` (moveFocus) | B | — |
| useListNavigation.ts:312 | `focusedImageId: currentId` (pageFocus) | B | — |
| useListNavigation.ts:397 | `c.focusedImageId !== null && getEffectiveFocusMode() === "explicit"` | D | Safe — mode check protects |
| useListNavigation.ts:449 | `c.focusedImageId` (Enter key) | B | Gated by hasFocus |
| useListNavigation.ts:473 | `c.focusedImageId !== null && getEffectiveFocusMode()...` | D | Safe |
| **useReturnFromDetail.ts:63** | **`previousFocus === null` guard** | **B** | **Minor: logo-click-from-detail re-focuses old image** |
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
1. **useDataWindow.ts:458** — viewport anchor guard must check `getEffectiveFocusMode()`
2. **useUrlSearchSync.ts:247** — phantom promotion must check mode, not `focusedImageId` truthiness
3. **useReturnFromDetail.ts:63** — needs explicit mode check

### Perf deal-breaker

Updating `focusedImageId` every scroll frame re-renders every visible cell
(20–40 cells × 60fps = 1200–2400 component renders/sec). The grid/table
`isFocused` prop depends on it. Not viable without moving focus to a
non-reactive ref for visual consumers.

---

## Flash-site inventory (17 sites)

| # | Site | Repro? | Sev | Notes |
|---|---|---|---|---|
| 1 | Sort change (no focus) | **Yes** | **3** | Effect #7 sets `scrollTop=0` before `search()`. Old buffer at top ~100-500ms. |
| 2 | Sort change (with explicit focus) | No | 0 | ~~Was flashing~~ → **Fixed 26 Apr 2026** (two-tier `countBefore` + `hintOffset`). |
| 3 | Filter change (no focus) | Theoretical | 1 | Phantom anchor mostly works. Edge: anchor gone + deep buffer → fallback. |
| 4 | Query typing (debounced) | Theoretical | 1 | Same as #3. |
| 5 | Scrubber seek (first paint) | No | 1 | Reverse-compute prevents flash. |
| 6 | Scrubber rapid drag | No | 1 | Abort + cooldown handle concurrent seeks. |
| 7 | Logo click / Home key | No | 1 | Well-guarded (`await search`, `skipEagerScroll`, `suppressDensityFocusSave`). |
| 8 | Density toggle (deep scroll) | **Yes** | **2** | 2 frames wrong scroll during rAF chain. Imperceptible at shallow scroll. |
| 9 | Popstate without snapshot | **Yes** | **2** | Same as #1 via popstate (logo-reset history entry). |
| 10 | Popstate with snapshot | No | 1 | Snapshot hints enable fast restore. |
| 11 | Reload with snapshot | No | 1 | Via sessionStorage. |
| 12 | Detail open/close | No | 0 | List stays mounted (opacity:0). |
| 13 | Fullscreen enter/exit | No | 1 | Minor scroll jump after traversal. Not wrong content. |
| 14 | Two-tier buffer slide | No | 0 | Atomic set. Skeletons. |
| 15 | Buffer→two-tier switch | No | 1 | Atomic total+buffer swap. |
| 16 | Detail close + restoreAroundCursor | Theoretical | 1 | `_suppressRestore` guards race. |
| 17 | Ticker click → reload | Theoretical | 1 | Scrubber thumb jumps to 0 before data. |

**Reproducible:** 3 sites (#1 sev 3, #8 sev 2, #9 sev 2). Sites #1 and #9 share the same root cause (eager `scrollTop=0` in the no-anchor path). Site #8 is independent (density rAF chain).

**Measurement infrastructure:** `e2e/shared/drift-flash-probes.ts`, `e2e/smoke/cited-scenario.spec.ts`, `e2e/smoke/flash-measurement.spec.ts`. See `e2e/README.md` § Drift & Flash.
