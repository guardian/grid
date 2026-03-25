# Kupua Code Audit — Assessment for Human Engineers

> Full codebase read: all ~8,000 lines of source, all docs, all tests, all config.
> Checked: TypeScript compilation, test suite, dependency versions, CVEs.
>
> **Updated 23 March 2026:** Sparse scroll implemented — `useDataWindow.ts` extracted (216 lines),
> `ColumnContextMenu.tsx` extracted (178 lines), sparse array + `loadRange` + result set freezing,
> visible-window table data, placeholder skeletons, O(1) image position lookup, bounded placeholder
> skipping in keyboard nav. `sparse-scroll-plan.md` removed (fully completed). ImageTable: 1,489 → 1,403 lines.
> Total source: ~8,000 lines. Dependencies upgraded (Vite 8, Zod 4, etc.), `start.sh`
> hardened with Node version + port checks. TS errors fixed (zero errors now).
> `loadMore` dedup race condition fixed. `newCount` polling respects user's date filter.

---

## TL;DR

**The architecture is solid.** For a project built primarily through AI pairing, it's impressively well-structured — the DAL abstraction, field registry, URL-as-source-of-truth, and document-driven approach are genuinely good engineering. The docs are thorough and honest. There are no architectural landmines. But there are several **cleanup opportunities** and a couple of things that would raise eyebrows in review.

---

## 🟢 Things That Are Genuinely Good

1. **DAL abstraction** — Clean `ImageDataSource` interface, easy to swap ES→Grid API later. Smart separation.

2. **Field Registry** (`field-registry.ts`) — Single source of truth pattern done right. All consumers derive maps from it. Adding a field is one diff in one file.

3. **URL sync architecture** — URL → Zustand → ES search, with `URL_DISPLAY_KEYS` separating display-only params from search-triggering params. `image` as a display-only overlay param is clever.

4. **CSS-variable column widths + memoised body** — Genuine performance engineering, not premature optimisation. The `<style>` tag approach avoiding 300+ `getSize()` calls per render is the right call.

5. **LazyTypeahead** — Good workaround for a real upstream bug. Well-documented, with an explicit upstream fix path.

6. **CQL-query-edit** — AST-based splice vs string `.includes()` — correct approach. 25 tests covering edge cases.

7. **Documentation** — AGENTS.md, deviations.md, mapping-enhancements.md are all excellent. Honest about trade-offs. The git archaeology in mapping-enhancements is exactly the kind of analysis that helps teams make decisions.

8. **Safety model** — Write protection, allowed-path list, `IS_LOCAL_ES` flag, `load-sample-data.sh` port check — all reasonable safeguards for a tool that can touch real ES.

---

## 🟡 Things to Clean Up Before Others See It

### 1. `ImageTable.tsx` is ~~1,350~~ 1,403 lines — partially split, more to do

**Progress since audit:**
- ✅ `useDataWindow.ts` extracted (216 lines) — the most important refactor identified. Manages sparse scroll: gap detection, visible range → `loadRange`, result set freezing (`frozenUntil`), O(1) image position lookup via `imagePositions: Map<imageId, index>`. Table, grid, and image detail all consume it. The density boundary split is architecturally established.
- ✅ `ColumnContextMenu.tsx` extracted (178 lines) — self-contained component with imperative ref handle, own state, viewport clamping, dismiss behaviour.
- ✅ Sparse scroll implemented — virtualizer pre-sized to `min(total, 100k)`, TanStack Table only processes visible window (~60 rows), placeholder skeletons for unloaded slots. `loadRange` fetches on-demand as user scrolls.
- ✅ Visible-window table data — TanStack Table receives only images in the current virtualizer window instead of all loaded images. Fixes `getCoreRowModel` growing unboundedly.

**Net effect:** ImageTable was 1,489 lines before extraction work. Now 1,403 lines (−86 from ColumnContextMenu). More importantly, the *architectural seam* is in place: `useDataWindow` owns data, ImageTable owns table rendering.

**Remaining:** ~~extract `useListNavigation.ts`~~ **DONE** — 327 lines extracted. ImageTable is now ~1,260 lines — all one concern (table density rendering). Both recommended extractions (`useDataWindow` + `useListNavigation`) are complete.

The original audit text below remains accurate for context:

---

This is the file that will make engineers wince. It's doing too many things:
- Column definition generation from registry
- Column resize with auto-scroll + synthetic mouse events
- Click-to-search with CQL edit
- Keyboard navigation (focus-based)
- Sort management (delayed click, shift-click secondary)
- Context menu (visibility toggles, fit-to-data)
- Double-click fit/restore
- Virtual scroll + infinite loading
- Scroll reset logic
- Return-from-detail focus restoration

The naïve refactor is to split by behaviour type (`useColumnResize.ts`, `useTableKeyboard.ts`, `useTableSort.ts`, `ColumnContextMenu.tsx`). **Don't do this.** It makes the file smaller but doesn't align with the architecture kupua is heading towards — and will actively make that work harder.

#### Why interaction-type splitting is wrong here

Two major features are coming (both documented in `migration-plan.md` and `frontend-philosophy.md`):

1. **Windowed scroll** (Phase 2) — the current infinite-scroll model (append-only `results[]` array, `loadMore` going forward only) must become a sliding window over the full 9M-row dataset. This changes the virtualizer, scroll handling, loadMore, scroll reset, return-from-detail focus, AND keyboard navigation (Home/End must seek to first/last page, arrow-at-edge must trigger window sliding). Every one of the proposed "hooks" would need the same 8-10 refs (virtualizer, scroll container, window offset, rows, focusedId, total, etc.), creating an API surface more complex than the current monolith.

2. **Density continuum** (`frontend-philosophy.md` → "One Ordered List, Many Densities") — table, grid, and single-image are densities of the same list. Focus, selection, keyboard navigation, and the data window are **shared across all densities**. Columns, resize handles, sort indicators are **table-density-only**. A `useTableKeyboard.ts` hook bakes keyboard navigation into the table — but keyboard nav must also work in the grid view (same concept, different geometry: arrows move between grid cells instead of table rows).

#### The right split: density boundary, not interaction type

Split by **what's shared across densities vs. what's table-specific:**

| Shared (used by table, grid, future views) | Table-only |
|---|---|
| Data window (results, total, loadMore, seekTo) | Column definitions + column defs from registry |
| Focus / selection state | Column resize + auto-scroll + synthetic events |
| Abstract keyboard nav (move, page, home, end) | Column context menu |
| Scroll position / window seeking | Column header rendering (sort arrows, resize handles) |
| Click-to-search | CSS-variable column widths |
| Return-from-detail restoration | Memoised `TableBody` |

**Recommended files → status:**

- ✅ **`useDataWindow.ts`** (216 lines) — **DONE.** Shared hook managing sparse data window. Exposes `rows`, `total`, `loadMore`, `loadRange`, `findImageIndex`, `frozenUntil`. Handles gap detection (which visible slots need fetching?), result set freezing, O(1) image position lookup via `imagePositions` Map. Table and image detail both consume it.

- ✅ **`useListNavigation.ts`** (327 lines) — **DONE.** Abstract keyboard navigation. Takes geometry config (`columnsPerRow`, `flatIndexToRow`, `headerHeight`, `rowHeight`), data window props, and an `onEnter` callback. Returns nothing — registers its own keyboard listeners. Table passes `columnsPerRow: 1`; grid passes `columnsPerRow: N`. Handles ArrowUp/Down (±columnsPerRow), ArrowLeft/Right (grid only, ±1), PageUp/PageDown, Home/End, Enter. Same hook, two densities. Also added PageUp/PageDown to grid (previously table-only).

- ✅ **`ColumnContextMenu.tsx`** (178 lines) — **DONE.** Self-contained component with imperative ref handle, own state, viewport clamping, dismiss behaviour (outside click, scroll, Escape).

- **`ImageTable.tsx`** (~1,260 lines after `useListNavigation` extraction) — everything table-density-specific stays here: TanStack Table setup, column visibility, resize with auto-scroll, sort with delayed click, header rendering, memoised body, CSS-variable widths. Still substantial, but it's all *one concern* — the table density. An engineer building the grid view never touches it.

#### Why this matters (and what it unlocked)

The `useDataWindow` extraction was the single most important refactor in the codebase. Now that it's done:
- **Sparse scroll works** — user can drag the native scrollbar through up to 100k rows with on-demand loading. This was impossible when data loading was entangled in ImageTable.
- **Jump-to-image is unblocked** — `seekToImage(id)` can issue a count query and scroll to it via the hook's API.
- **Grid view is unblocked** — the grid component can import `useDataWindow` and (once extracted) `useListNavigation` and get windowed scrolling + keyboard nav for free.
- **Phase 2 migration is isolated** — switching from sparse array to `search_after` changes `useDataWindow` internals, not ImageTable.
- **Aligns with "Never Lost"** — focus restoration, selection survival, and scroll position preservation across density changes all live in the shared layer, not duplicated per view.

The table at ~1,250 lines (after `useListNavigation` extraction) is fine. It's a complex component doing one complex thing. Engineers won't wince at 1,250 lines of table rendering — they wince at 1,489 lines doing ten unrelated things.

### 2. `SearchBar.tsx` — module-level mutable state is a code smell

```typescript
let _debounceTimerId: ReturnType<typeof setTimeout> | null = null;
let _externalQuery: string | null = null;
let _cqlInputGeneration = 0;
```

Three module-level mutable variables with exported mutation functions (`cancelSearchDebounce`, `getCqlInputGeneration`). This works but is effectively global mutable state — anyone importing from `SearchBar.tsx` can mutate these. Should be a ref-based approach or a small context/store. Not a bug, but will make reviewers uncomfortable.

### 3. `cql-query-edit.ts` + `cql-query-edit.test.ts` — naming is fine but could colocate

The test file is well-structured with 25 tests. Good. But `cql.ts` (the main parser, 460 lines) has **zero tests**. That's the file with the most complex logic — `parseCql`, `fieldToClause`, `buildIsQuery`, `mergeClauses`. Engineers will notice.

### 4. `index.css` — 399 lines

Haven't fully read it but it's heavy for what should mostly be Tailwind utility classes. The `@theme` declarations are great, but check if there's dead CSS in there.

---


---

## 📝 Documentation Accuracy

Checked AGENTS.md against actual code:

| Claim | Accurate? |
|---|---|
| "~8000 lines of source" | ✅ Correct (8,034 lines counted). |
| "22 hardcoded fields" | ✅ Correct (counted in field-registry.ts). |
| "TypeScript compiles clean" | ✅ Fixed — zero errors now (upstream `@guardian/cql` type annotated with `@ts-expect-error`, description param fixed to `""`). |
| "45 tests" | ✅ Now 47 (25 cql-query-edit + 20 field-registry + 2 ErrorBoundary). |
| Phase 2 status | ✅ All "done" items verified in code. |
| Project structure tree | ✅ Matches actual file layout (sparse-scroll-plan.md removed, ColumnContextMenu.tsx added). |
| Key decisions 1–26 | ✅ All accurately describe the code. Decision 8 (scrollbar strategy) updated to reflect implemented sparse scroll. |

---

## 🤔 Things That Aren't Wrong But Are Worth Discussing

1. **No Grid API path yet** — The DAL interface is ready, but there's no `GridApiDataSource` stub or even a type skeleton. Engineers might want to see at least a stub to understand the planned shape.

2. **`grid-config.ts` is fully hardcoded** — The mock config is frozen. If PROD config changes (new field aliases, new categories), kupua won't pick it up. Fine for now, but the TODO should be visible.

3. **`free-to-use` category list** in `es-adapter.ts` is duplicated from Scala — if Grid adds a new free category, kupua won't know. This is documented in deviations.md §3 but worth flagging to the team.

4. **Image detail at 486 lines** — Not as bad as ImageTable, but it's doing a lot: standalone fetch, prefetch, prev/next nav, fullscreen, keyboard shortcuts, metadata display. Could split the metadata panel out.

5. **No linting errors?** — I didn't run `eslint` explicitly. The `eslint-disable` comments in the code suggest some rules are being silenced. Worth running `npm run lint` to see if anything surfaces.

6. **`search-store.ts` — `loadMore` has no AbortController** — `search()` cancels in-flight requests, but `loadMore()` doesn't. The deduplication race condition is fixed (functional updater + offset guard), but a very fast scroll could still fire a redundant network request that gets discarded. Minor — not worth the complexity of an abort controller for pagination.

---

## Summary Verdict

| Area | Grade | Notes |
|---|---|---|
| Architecture | **A+** | All 🔴 concerns resolved. DAL, registry, URL sync, overlay — well-designed. Density boundary split in progress (`useDataWindow` + `ColumnContextMenu` extracted). |
| Code quality | **B+** | Improved — density-boundary refactor underway. `useListNavigation` extraction is the remaining split. Module-level globals in SearchBar still present. |
| Documentation | **A+** | Unusually thorough for any project, let alone AI-assisted |
| Testing | **C+** | 47 tests for ~8,000 lines. CQL parser (460 lines) is untested. |
| Dependencies | **A-** | All upgraded to latest (Vite 8, Zod 4). ESLint 10 blocked upstream. |
| Prod readiness | **N/A** | This is Phase 2 exploration — not intended for production yet |

**Bottom line:** This is in good shape for a first human review. The architecture will hold up. The density-boundary split is underway — `useDataWindow` and `ColumnContextMenu` are extracted, `useListNavigation` remains. The main remaining work is that extraction and adding test coverage for `cql.ts`. Do those two things and engineers will be impressed, not concerned.





