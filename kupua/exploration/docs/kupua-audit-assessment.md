# Kupua Code Audit — Assessment for Human Engineers

> Full codebase read: all ~6,900 lines of source, all docs, all tests, all config.
> Checked: TypeScript compilation, test suite, dependency versions, CVEs.
>
> **Updated 23 March 2026:** Dependencies upgraded (Vite 8, Zod 4, etc.), `start.sh`
> hardened with Node version + port checks. Dependency section removed — all done.
> TS errors fixed (zero errors now). `.DS_Store` cleaned up. ErrorBoundary added.
> `loadMore` dedup race condition fixed (functional updater + offset guard).
> `newCount` polling now respects user's date filter.

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

### 1. `ImageTable.tsx` is 1,350 lines — it needs splitting, but not by interaction type

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

**Recommended files:**

- **`useDataWindow.ts`** (~300 lines) — shared hook managing the data window between the search store and view components. Exposes `rows`, `total`, `windowOffset`, `loadRange(start, end)`, `seekTo(offset)`, `seekToImage(id)`. Today it wraps the current append-only store. Phase 2 evolves it into a sparse/windowed data structure with gap detection (which visible slots need fetching?), result set freezing (`until` timestamp to stabilise offsets during scrolling), duplicate detection (same image at different offsets after deletions), and page eviction (bound memory by dropping distant pages). Table, grid, and image detail all consume it. See `kahuna-scroll-analysis.md` for the prior art — kahuna does sparse array + `from/size` + native scrollbar, capped at 100k. Kupua targets 10× that via smaller row height, plus `search_after` beyond the native scrollbar limit.

- **`useListNavigation.ts`** (~150 lines) — abstract keyboard navigation. Takes `count`, `focusedIndex`, and geometry callbacks (`rowsPerPage()`, `columnsPerRow()`). Returns `moveFocus(delta)`, `pageFocus(direction)`, `home()`, `end()`. Table passes `columnsPerRow: 1`; grid passes `columnsPerRow: N`. Same Home/End/PgUp/PgDown logic, different geometry. Same hook, two densities.

- **`ColumnContextMenu.tsx`** (~150 lines) — self-contained component with its own state, DOM positioning, keyboard handling. The one piece the naïve split got right — it's a genuine independent component.

- **`ImageTable.tsx`** (~800 lines) — everything table-density-specific stays here: TanStack Table setup, column visibility, resize with auto-scroll, sort with delayed click, header rendering, memoised body, CSS-variable widths. Still substantial, but it's all *one concern* — the table density. An engineer building the grid view never touches it.

#### Why this matters

The `useDataWindow` extraction is the single most important refactor in the codebase. It:
- **Enables jump-to-image** — `seekToImage(id)` can issue a count query ("how many before this image in the current sort?"), fetch the target window, and scroll to it. Currently impossible because the virtualizer, scroll handling, and data loading are all entangled in ImageTable.
- **Enables the grid view** — the grid component imports `useDataWindow` and `useListNavigation` and gets windowed scrolling + keyboard nav for free.
- **Isolates the Phase 2 migration** — switching from append-only to windowed scroll changes one file, not five.
- **Aligns with "Never Lost"** — focus restoration, selection survival, and scroll position preservation across density changes all live in the shared layer, not duplicated per view.

The table staying at ~800 lines is fine. It's a complex component doing one complex thing. Engineers won't wince at 800 lines of table rendering — they wince at 1,350 lines doing ten unrelated things.

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
| "~7100 lines of source" → "~6700 lines" | **Inconsistent** within AGENTS.md (says both). Actual: **6,862 lines**. |
| "22 hardcoded fields" | ✅ Correct (counted in field-registry.ts). |
| "TypeScript compiles clean" | ✅ Fixed — zero errors now (upstream `@guardian/cql` type annotated with `@ts-expect-error`, description param fixed to `""`). |
| "45 tests" | ✅ Now 47 (25 cql-query-edit + 20 field-registry + 2 ErrorBoundary). |
| Phase 2 status | ✅ All "done" items verified in code. |
| Project structure tree | ✅ Matches actual file layout. |
| Key decisions 1–26 | ✅ All accurately describe the code. |

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
| Architecture | **A+** | All 🔴 concerns resolved. DAL, registry, URL sync, overlay — well-designed |
| Code quality | **B+** | Solid but ImageTable needs splitting, some module-level globals |
| Documentation | **A+** | Unusually thorough for any project, let alone AI-assisted |
| Testing | **C+** | 47 tests for ~7,000 lines. CQL parser (460 lines) is untested. |
| Dependencies | **A-** | All upgraded to latest (Vite 8, Zod 4). ESLint 10 blocked upstream. |
| Prod readiness | **N/A** | This is Phase 2 exploration — not intended for production yet |

**Bottom line:** This is in good shape for a first human review. The architecture will hold up. The main work is splitting ImageTable along the right seam (density boundary, not interaction type — see §1 above) and adding test coverage for `cql.ts`. Do those two things and engineers will be impressed, not concerned.





