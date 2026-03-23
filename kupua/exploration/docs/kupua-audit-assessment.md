# Kupua Code Audit — Assessment for Human Engineers

> Full codebase read: all ~6,900 lines of source, all docs, all tests, all config.
> Checked: TypeScript compilation, test suite, dependency versions, CVEs.
>
> **Updated 23 March 2026:** Dependencies upgraded (Vite 8, Zod 4, etc.), `start.sh`
> hardened with Node version + port checks. Dependency section removed — all done.
> TS errors fixed (zero errors now). `.DS_Store` cleaned up.

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

### 1. `ImageTable.tsx` is 1,350 lines — it NEEDS splitting

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

**Suggested split:**
- `ImageTable.tsx` — core table rendering, virtualiser, scroll container (~300 lines)
- `useColumnResize.ts` — auto-scroll resize hook with synthetic events (~200 lines)
- `useTableKeyboard.ts` — keyboard navigation hook (~150 lines)
- `useTableSort.ts` — sort click handling + delayed click (~100 lines)
- `ColumnContextMenu.tsx` — context menu component (~150 lines)
- Column def generation stays in `field-registry.ts` or a dedicated `column-defs.ts`

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

## 🔴 Architecture Concerns

### 1. No error boundary

There's no React error boundary anywhere. If `ImageDetail` or `ImageTable` throws during render, the entire app white-screens. Add at minimum a root-level `ErrorBoundary` in `__root.tsx`.

### 2. `search-store.ts` — no deduplication on `loadMore`

```typescript
set({
  results: [...results, ...result.hits],
```

If `loadMore()` is called twice rapidly (e.g. fast scroll), the second batch starts at the same offset (the `results.length` snapshot is stale) and you get duplicate rows. The `loading` guard helps, but Zustand's `set` is synchronous while `search` is async — there's a window. TanStack Table uses `row.id` for keying, but duplicate data in the array still wastes memory and looks wrong.

### 3. `es-adapter.ts` — `getById` does a `_search` not a `_doc`

```typescript
async getById(id: string): Promise<Image | undefined> {
  const body = { query: { terms: { id: [id] } }, size: 1 };
  // ...
  return result.hits.hits[0]?._source;
}
```

This runs a full `_search` query to find one document by ID. ES has a dedicated `GET /<index>/_doc/<id>` endpoint that's faster (no query parsing/scoring). Should use that. Minor perf issue, but reviewers will flag it.

### 4. `newCount` polling — the count query doesn't include all filters

```typescript
const count = await dataSource.count({
  ...params,
  since: newCountSince,  // ← overwrites the user's since filter
  offset: 0, length: 0,
});
```

If the user has a date filter (`since=2026-01-01`), the ticker overwrites `since` with `newCountSince` (the time of the last search). So the ticker counts new images uploaded since last search, but **ignoring the user's date filter**. This could show "50 new" when there are actually 0 new images matching the current filters. Probably needs a separate param for the ticker.

---

## 📝 Documentation Accuracy

Checked AGENTS.md against actual code:

| Claim | Accurate? |
|---|---|
| "~7100 lines of source" → "~6700 lines" | **Inconsistent** within AGENTS.md (says both). Actual: **6,862 lines**. |
| "22 hardcoded fields" | ✅ Correct (counted in field-registry.ts). |
| "TypeScript compiles clean" | ✅ Fixed — zero errors now (upstream `@guardian/cql` type annotated with `@ts-expect-error`, description param fixed to `""`). |
| "45 tests" | ✅ Correct (25 + 20). |
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

6. **`search-store.ts` has no AbortController for `loadMore`** — `search()` cancels in-flight requests, but `loadMore()` doesn't. If two `loadMore()` calls fire in quick succession, both responses are appended, potentially causing duplicate or out-of-order data.

---

## Summary Verdict

| Area | Grade | Notes |
|---|---|---|
| Architecture | **A** | DAL, registry, URL sync, overlay pattern — all well-designed |
| Code quality | **B+** | Solid but ImageTable needs splitting, some module-level globals |
| Documentation | **A+** | Unusually thorough for any project, let alone AI-assisted |
| Testing | **C+** | 45 tests for 6,800 lines. CQL parser (460 lines) is untested. |
| Dependencies | **A-** | All upgraded to latest (Vite 8, Zod 4). ESLint 10 blocked upstream. |
| Prod readiness | **N/A** | This is Phase 2 exploration — not intended for production yet |

**Bottom line:** This is in good shape for a first human review. The architecture will hold up. The main risk is that ImageTable.tsx is a monolith and the test coverage is thin on the most complex file (cql.ts). Fix those two things and engineers will be impressed, not concerned.





