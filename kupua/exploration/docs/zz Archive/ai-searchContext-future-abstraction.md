# SearchContext — Future Abstraction (Blocking Ticket)

_Created 24 May 2026. This is a **forward-looking design document**, not a description of what exists today. It describes the architectural target that MUST be implemented before kupua adds a second alternative-ranking algorithm (image-to-image, collection-based, hybrid BM25+KNN, or anything else that returns a fixed result set rather than a re-runnable query)._

> **Status: backlog.** The decorator-helper solution in `ai-search-aggregation-problem.md` is the current tactical fix. This document is the trigger for promoting that fix to a proper abstraction when the second example arrives.

---

## Why this document exists

AI search introduced the first "alternative-ranking algorithm" in kupua: a path where the result set is a fixed ≤200 IDs rather than a re-runnable ES query. The tactical fix (`decorateParamsForAggregations` + `buildQuery` strip) handles this single case cleanly in ~50 lines.

But the workplan anticipates more such surfaces:

- **Phase 2** — Hybrid BM25+KNN blending. (Returns a re-runnable query; would NOT need this abstraction.)
- **Phase 3** — Image-to-image similarity ("More Like This"). Returns ≤200 IDs ranked by visual similarity to a source image. **Needs this abstraction.**
- **Phase 4** — Collection-based semantic search ("Find similar to selection"). Averages embeddings, KNN. Returns ≤200 IDs. **Needs this abstraction.**

Each new ID-set ranking algorithm added without this abstraction will:

1. Teach the decorator's regex a new chip name (`imageQuery:`, `collectionQuery:`, …)
2. Add a new branch in the AI-detection helper
3. Create a new place where store code must remember to call the decorator
4. Drift further from the "AI is not a mode" principle that motivates the original fix

By the time we have three such algorithms, the decorator pattern is technical debt. **Promoting it to SearchContext before adding the second one is the right time.** Doing it earlier (now, with one example) risks designing the abstraction from one data point, which is how wrong abstractions are built. Doing it later (with three) means migrating three call sites of legacy code instead of one.

---

## The abstraction

A `SearchContext` is an **opaque, branded type** returned by every search method and accepted by every aggregation/count method. It encapsulates "what set of documents does this question scope to" without exposing whether the answer is a query, an ID set, or something we invent later.

This mirrors Alex Sennikov's `Cursor` pattern (see `zz Archive/Alex Architecture Critique/Alexs_Arch_Suggestions.md`): the boundary type is opaque to consumers; only the DAL knows what's inside.

### Public surface (everything outside `dal/`)

```typescript
// dal/types.ts
declare const searchContextBrand: unique symbol;
export type SearchContext = { readonly [searchContextBrand]: never };

export interface SearchResult {
  hits: Image[];
  total: number;
  // ... existing fields
  context: SearchContext;  // NEW — returned by every search variant
}

// DAL methods take SearchContext, not SearchParams:
dataSource.getAggregations(context: SearchContext, fields, signal): Promise<...>
dataSource.getFilterAggregations(context: SearchContext, filters, signal): Promise<...>
dataSource.countWithTickers(context: SearchContext, signal): Promise<...>
```

### Private internals (only inside `dal/`)

```typescript
// dal/search-context.ts — NOT exported from dal/index.ts
type SearchContextInternal =
  | { kind: "query"; params: SearchParams }      // normal BM25, hybrid — re-runnable
  | { kind: "id-set"; ids: readonly string[] };  // AI, image-to-image, collection — fixed

// searchAfter returns { kind: "query", params }
// searchByAi returns { kind: "id-set", ids: hits.map(h => h.id) }
// Future image-to-image returns { kind: "id-set", ids: ... }   ← zero store changes
// Future collection-based returns { kind: "id-set", ids: ... } ← zero store changes
// Future hybrid returns { kind: "query", params }              ← zero store changes
```

### Store side

```typescript
interface SearchStoreState {
  _searchContext: SearchContext | null;  // NEW
  // ... existing state
}

// After ANY search variant:
const result = await dataSource.search(params); // or searchByAi, image-to-image, ...
set({ results: result.hits, total: result.total, _searchContext: result.context });

// fetchAggregations / fetchExpandedAgg:
const ctx = get()._searchContext;
if (!ctx) return;
const [aggs, filterAggs] = await Promise.all([
  dataSource.getAggregations(ctx, fields, signal),
  dataSource.getFilterAggregations(ctx, filters, signal),
]);
```

**The word `aiQuery` does not appear in `search-store.ts`.** AI-detection lives in exactly one place: inside the DAL, where `searchByAi` constructs an `{ kind: "id-set", ids }` context.

---

## Why this is better than the decorator

| | Decorator (current tactical fix) | SearchContext (this doc) |
|---|---|---|
| AI-awareness in store | Yes (`fetchAggregations` calls the decorator) | No (store passes opaque context) |
| Scales to phase 3, 4 | Add regex per algorithm, repeat for each callsite | Each algorithm returns its own context variant; zero store changes |
| Enforcement | Reviewer discipline ("don't forget the decorator") | TypeScript signature (can't call `getAggregations(params)` anymore) |
| Removable later | n/a — it's what we have | Survives the BFF move unchanged |
| Cost to implement now | ~50 lines | ~200-300 lines + test surface migration |
| Cost to implement later (after a second use case) | Same ~200-300 lines + migrating 2 algorithms instead of 1 | n/a — already done |

---

## Trigger conditions (when to do this)

Implement SearchContext when **any** of the following is true:

1. A Phase 3, 4, or other alternative-ranking algorithm is about to land
2. A second use case for "scope aggregations to a fixed ID set" appears outside AI search
3. The decorator file (`src/lib/ai-search-params.ts`) acquires a third entry / second consumer

If none of these apply, **do not implement this abstraction.** The current decorator is correct for one algorithm. Speculative architecture is what kupua's "push back hard" directive exists to prevent.

---

## Out-of-scope reminders for whoever implements this

- **Typeahead is NOT scoped by SearchContext.** Typeahead is "suggest from world, narrowed by other chips" regardless of ranking mode. Its DAL methods take `SearchParams`, not `SearchContext`. This asymmetry is correct and the type signature makes it visible.
- **The `buildQuery` strip (`extractAiQuery`) stays.** It serves the `{ kind: "query" }` variant when aggregations re-run the original query, and serves typeahead. Don't remove it as part of this work.
- **Test surface migration is non-trivial.** Any test that calls `dataSource.getAggregations(params)` directly needs a synthetic context. Provide a DAL test helper: `__testContextForQuery(params)` / `__testContextForIds(ids)`. Do not expose `SearchContextInternal` to test code beyond that helper.
- **Cache invalidation is automatic.** Cache keys derive from context identity. New search → new context → fresh fetch. Do not add bespoke invalidation logic.

---

## Implementation order (when the time comes)

Type-driven. The compiler tells you what to update next.

1. Define `SearchContext` (public, branded) in `dal/types.ts`. Define `SearchContextInternal` (private union) in `dal/search-context.ts`. Add `contextToQueryBody(ctx): ESQueryBody` helper. **No behaviour change yet.**
2. Add `context: SearchContext` field to `SearchResult`. Make `searchAfter` and `searchByAi` construct + return it. **Still no behaviour change.**
3. Change signatures of `getAggregations`, `getFilterAggregations`, `countWithTickers` from `SearchParams` to `SearchContext`. **Compiler errors will enumerate every callsite that needs updating.** Walk the list.
4. Store: add `_searchContext: SearchContext | null`. Update on every successful search. Migrate `fetchAggregations` / `fetchExpandedAgg` to read from it.
5. Delete `src/lib/ai-search-params.ts` (the decorator). Delete the AI-detection regex from `search-store.ts`. Remove the breadcrumb comment pointing here.
6. Update tests via the `__testContextForQuery` / `__testContextForIds` helpers.
7. Update AGENTS.md: remove this from backlog; add a Key Architecture Decision entry describing the SearchContext pattern. Archive this doc.
8. Re-run the blast-radius audit (same shape as the addendum in `ai-search-aggregation-problem.md`) to confirm coverage.

---

## What this is NOT

- Not a request to refactor now
- Not a critique of the decorator solution (which is correct for one algorithm)
- Not a complete implementation spec — the implementer will need to make detail decisions in light of the codebase at the time
- Not a commitment that Phase 3 or 4 will ever happen — if they don't, this doc stays in the backlog forever and that's fine
