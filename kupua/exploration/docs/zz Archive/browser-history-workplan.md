# Browser History — Workplan

Workplan for the browser history feature. For the architectural description
of how the system works, see `browser-history-architecture.md`.

---

## Baseline tightening ✅

All six items implemented, plus three bug fixes (gate removal, SPA-entry flag,
debounced typing history). See [changelog.md](./changelog.md) for narrative.

### 1. ✅ Close-button forward asymmetry → `closeDetail` uses `history.back()`

`closeDetail` calls `history.back()` instead of `navigate({ replace: true })`.
All four close affordances (← Back button, double-click, Backspace, swipe-to-dismiss)
share this callback. Forward re-opens detail in both close-button and browser-back paths.

Sub-requirements implemented:
- `markUserInitiatedNavigation()` before `history.back()` (prevents popstate reset).
- Deep-link synthesis on cold-load mount (SPA-entry flag guard, no `history.length` gate).

### 2. ✅ Funnel raw `navigate()` push sites through helpers

`pushNavigate()` and `pushNavigateAsPopstate()` in `lib/orchestration/search.ts`.
All raw push sites switched. Replace-only sites stay raw with comments.

### 3. ✅ Logo-reset → `pushNavigateAsPopstate()`

Both logo-reset sites (SearchBar, ImageDetail) use `pushNavigateAsPopstate()`.
Explicit opt-out from marking user-initiated.

### 4. ✅ Density toggle — locked with e2e + comment

No behavioural change. Comment at `StatusBar.tsx` density-toggle. E2E test #12.

### 5. ✅ `metadata-click-to-search` — locked with e2e

No code change. Single-push design preserved. E2E test #15.

### 6. ✅ FullscreenPreview Backspace — doc comment updated

Inherits `closeDetail`'s `history.back()` semantics. Doc comment updated.

---

## Position preservation (snapshot system) ✅

### kupuaKey identity ✅

Per-entry UUID in `history.state`. Minted on push, carried on replace.
`getCurrentKupuaKey()` reads `window.history.state` (canonical).
`synthesiseKupuaKeyIfAbsent()` on cold load. 15 unit + 4 e2e tests.

### Snapshot capture ✅

`HistorySnapshot` type with searchKey, anchor, cursor, offset, scrollTop,
viewportRatio. `MapSnapshotStore` + `SessionStorageSnapshotStore` behind
`SnapshotStore` interface. `buildHistorySnapshot()` reads store + DOM.
`markPushSnapshot()` wired into `pushNavigate` and `useUpdateSearchParams`.
Popstate departure capture via `_lastKupuaKey`. 18 unit + 2 e2e tests.

### Popstate restore ✅

Snapshot lookup by kupuaKey → strict searchKey match → pass anchor as
`sortAroundFocusId` with hints. Reuses sort-around-focus render gate.
Phantom anchor guard (`anchorIsPhantom` → `phantomOnly: true`).
scrollTop-only fallback. Deep-link re-synthesis guard (`_bareListSynthesized`).
6 e2e tests.

### Reload survival ✅

`pagehide` handler captures snapshot for current entry. Mount-time restore
with strict-only searchKey matching. `buildSearchKey` fixed to exclude
`offset`/`length`/`countAll`. 4 e2e tests.

### Viewport ratio preservation ✅

`viewportRatio` field in snapshot. `saveSortFocusRatio()` on restore so
Effect #9 positions at same viewport fraction. Exported from `useScrollEffects`.

### Column alignment ✅

`_loadBufferAroundImage` trims backward results so `bufferStart % columns === 0`.

### Scroll teleport fix ✅

`scrollAppliedResultsRef` in Effect #9 distinguishes offset-correction re-fires
(same results ref → allow) from extend re-fires (different ref → block).
Regression test: "no scroll teleport after reload restore".

### Experimental flag retirement ✅

- `EXPERIMENTAL_FOCUS_AS_ANCHOR_IN_CLICK_TO_FOCUS` → promoted (always on), removed.
- `EXPERIMENTAL_LENIENT_SEARCHKEY_MATCH` → deleted (dead code — keys structurally identical).

---

## Open items

### Phantom anchor drift on back/forward

Position preservation without explicit focus drifts on repeated back/forward cycles.
See `phantom-drift-investigation.md` for root cause analysis and proposed investigation.

### Hypothetical extension: bookmarking the traversal entry point

Traversal inside detail uses `replace`, leaving no trail. One piece of information
worth preserving: the image the user opened to start the wander.

**Proposed behaviour (A = entry image, P = exit image, A ≠ P):**

| Step | URL | Renders |
|---|---|---|
| 1. On list, focused on A | `?q=…` | list, focus A |
| 2. Click A | `?q=…&image=A` | detail A |
| 3. Traverse to P (replace) | `?q=…&image=P` | detail P |
| 4. Close detail OR browser back | `?q=…` | list, focus P |
| 5. **Browser back** | `?q=…` | list, focus A |
| 6. Browser back again | `[prev search context]` | as today |

If A = P at close time, behaviour collapses to today's (no extra entry).

**Recommended approach: Option α** — at first traversal away from A, rewrite
the current entry then push the new detail entry in the same tick. Chromium
and Firefox coalesce same-tick mutations (no flicker).

**Hard constraint:** closing or browser-back from detail must always land on
the current detail image P (non-negotiable). Option α satisfies this because
the bookmark is inserted during the session, not at close time.

**Residual cost:** one stale bookmark per wander-and-return (A→P→A then close).
The browser exposes no API to remove non-active entries.

Requires the snapshot infrastructure (already built). Does not make sense as
a standalone change.

---

## Audit table — every history-touching call site

| Site | File | Push/Replace | Marks user-initiated? | Behaviour | E2E? |
|---|---|---|---|---|---|
| `index-redirect` | `routes/index.tsx` | replace (TSR redirect) | n/a | Invisible; `/` never in stack | — |
| `image-redirect` | `routes/image.tsx` | replace (TSR redirect) | n/a | Old kahuna URL replaced | — |
| `default-injection` | `useUrlSearchSync.ts` | replace | no | Paramless URL → `?nonFree=true` | — |
| `enterDetail-grid` | `ImageGrid.tsx` | push | yes (`pushNavigate`) | Back removes `?image=`, forward re-adds | ✅ |
| `enterDetail-table` | `ImageTable.tsx` | push | yes (`pushNavigate`) | Same as grid | ✅ |
| `closeDetail` | `ImageDetail.tsx` | `history.back()` | yes (inline) | Pops detail; forward re-opens. Deep-link synthesis on cold load. | ✅ |
| `traversal-onNavigate` | `ImageDetail.tsx` | replace | no | `?image=X` → `?image=Y`; back goes to list | — |
| `logo-reset-searchbar` | `SearchBar.tsx` | push | no (`pushNavigateAsPopstate`) | Push home; back restores previous context | ✅ |
| `logo-reset-detail` | `ImageDetail.tsx` | push | no (`pushNavigateAsPopstate`) | Same; also strips `?image=` | ✅ |
| `metadata-click-to-search` | `ImageMetadata.tsx` | push | yes (`useUpdateSearchParams`) | Push query + strip image in one navigate | ✅ |
| `cqlSearch-debounced` | `SearchBar.tsx` | push (1st) + replace (rest) | yes | First keystroke pushes pre-edit URL | ✅ |
| `cqlSearch-clear` | `SearchBar.tsx` | push | yes | Discrete commit | — |
| `density-toggle` | `StatusBar.tsx` | push | yes | Dedup bails (no re-search) | ✅ |
| `filter-toggle` | `SearchFilters.tsx` | push | yes | Discrete commit | — |
| `sort-change` | `SearchFilters.tsx`, `ImageTable.tsx` | push | yes | Discrete commit | ✅ |
| `date-filter` | `DateFilter.tsx` | push | yes | Discrete commit | — |
| `facet-click` | `FacetFilters.tsx` | push | yes | Discrete commit | — |
| `table-cell-click` | `ImageTable.tsx` | push | yes | Discrete commit | — |
| `error-hard-reload` | `ErrorBoundary.tsx` | full page load | n/a | Tears down SPA | — |

If you discover a history-touching site not in this table, stop and ask before
changing anything.

### Cross-cutting notes

- `useUpdateSearchParams` is the golden path (10+ sites). `markUserInitiatedNavigation()`
  + `markPushSnapshot()` fire synchronously before `navigate()`.
- `URL_DISPLAY_KEYS` is belt-and-braces protection for display-only sites.
- `metadata-click-to-search` is the only site combining query change + `image` stripping
  in one navigation. Deliberately a single push.
