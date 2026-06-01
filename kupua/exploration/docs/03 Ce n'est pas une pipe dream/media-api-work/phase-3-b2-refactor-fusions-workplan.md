# Phase 3 — B2 Refactor: Execute Method Fusions ✅ DONE — 2026-06-01

## What this session does

Execute 4 confirmed method fusions from the b2-hunt audit. These collapse
8 DAL methods into 4 — shrinking the interface surface by 50% for the
affected methods. The most valuable fusion (F1) eliminates a parallel ES
round-trip on every facet panel load — an immediate performance win.

**This is an implementation session — you will write code and run tests.**

**Prerequisite:** Phase 3 B1 (leak elimination) should be complete first.
The B1 refactor simplifies `searchAfter`'s signature, which F3 depends on.
If B1 is not done, F3 still works but will reference the old 9-param
signature. Check `searchAfter`'s current param count before starting F3.

## Source of truth

`kupua/exploration/docs/03 Ce n'est pas une pipe dream/phase-3-minimal-gap-derivation-findings.md`
Section 4b — the fusion catalogue. Each entry has full context.

## The 4 fusions, ordered by implementation effort

| # | Fusion | Effort | Value | Risk |
|---|--------|--------|-------|------|
| F1 | `getAggregations` + `getFilterAggregations` → `getFacetData` | Medium | HIGH — perf win | Low |
| F4 | `getById` → thin wrapper on `getByIds` | Small | Medium — removes redundant path | None |
| F3 | `search` → wrapper on `searchAfter` | Small | Low — dead code cleanup | Low |
| F2 | `count` → wrapper on `countWithTickers` | Trivial | None — interface tidying | None |

**Execute in this order.** F1 first (highest value), then descending.

## Execution plan

### F1 — Facet panel one-shot (the real work)

**What changes:** Two separate methods (`getAggregations` and
`getFilterAggregations`) that fire parallel ES requests become one method
(`getFacetData`) issuing a single ES request with both `terms` aggs and
`filter` aggs in the same `aggs` key.

**Step 1: Define the new type in `types.ts`.**

```typescript
interface FacetDataRequest {
  fields: AggregationRequest[];  // terms aggs (existing type)
  isFilters: FilterAggRequest[]; // filter aggs (uses the B1-refactored FilterAggRequest with isFilter: string)
}

interface FacetDataResult {
  fields: Record<string, AggregationResult>;  // keyed by field path
  filters: Record<string, number>;            // keyed by IS-filter name
  took?: number;
  fetchDuration?: number;
}
```

**Step 2: Add `getFacetData` to `ImageDataSource` in `types.ts`.**

```typescript
getFacetData(
  params: SearchParams,
  request: FacetDataRequest,
  signal?: AbortSignal,
): Promise<FacetDataResult>;
```

**Step 3: Implement in `es-adapter.ts`.**

Combine the bodies of current `getAggregations` and `getFilterAggregations`
into one ES `_search` request:
- `size: 0`
- `query: buildQuery(params)`
- `aggs: { ...termsAggs, ...filterAggs }` where:
  - `termsAggs` = one `terms` agg per `request.fields` entry (keyed by field path)
  - `filterAggs` = one `filter` agg per `request.isFilters` entry (keyed by name,
    filter compiled from `parseCql("is:${req.isFilter}").must[0]`)
- Parse the response: split agg results into `fields` (terms buckets) and
  `filters` (filter doc_count) based on the original request keys.

**Key insight from b2-hunt:** Field path keys use dot-notation
(`metadata.credit`) while IS-filter name keys are plain strings (`deleted`).
No naming collision possible. Both coexist safely under one `aggs` map.

**Step 4: Update call sites.**

Two call sites that were adjacent and parallel become one:

`search-store.ts:3868–3869` (approximate — find the actual lines):
```typescript
// Before (two parallel calls):
const [aggsResult, filterResult] = await Promise.all([
  dataSource.getAggregations(params, fields, signal),
  dataSource.getFilterAggregations(params, filters, signal),
]);

// After (one call):
const facetResult = await dataSource.getFacetData(params, { fields, isFilters: filters }, signal);
// facetResult.fields replaces aggsResult.fields
// facetResult.filters replaces filterResult
```

Also update `typeahead-fields.ts` if it calls either method separately.

**Step 5: Deprecate or remove old methods.**

Option A (safe): Keep `getAggregations` and `getFilterAggregations` in
`types.ts` as optional methods (`?`) that delegate to `getFacetData`.
Remove their implementations from `es-adapter.ts` — they become thin
wrappers.

Option B (aggressive): Remove both from the interface entirely. Update
all callers to use `getFacetData`. Cleaner but more call-site changes.

**Recommendation:** Option B if callers are few (check with grep). The
whole point of B2 is surface reduction.

**Step 6: Run tests.**
```bash
npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

F1 changes the search-store facet loading path — if any E2E tests exercise
the facet panel:
```bash
npm --prefix kupua run test:e2e 2>&1 | tee "$TMPDIR/kupua-e2e-output.txt"
```

⚠️ **E2E REQUIRES PORT 3000 FREE.** Stop any dev server on :3000 before
running. Warn the user and wait for confirmation.

---

### F4 — Single-doc fetch simplification

**What changes:** `getById` stops using its own `_search` request and
becomes a thin wrapper on `getByIds`.

**Step 1: Update `es-adapter.ts`.**

Replace the `getById` implementation body:
```typescript
// Before: ~18 lines of _search with terms:{id:[id]}
// After:
async getById(id: string): Promise<Image | undefined> {
  const results = await this.getByIds([id]);
  return results[0];
}
```

**Step 2: Verify `getByIds` handles single-ID case efficiently.**

`getByIds` uses `_mget`. For a 1-element array, `_mget` with one doc ID
is a direct document fetch — more efficient than `_search` with terms
query (bypasses the query parser). No regression.

**Step 3: Check signal propagation.**

`getById` has no `signal` param. `getByIds` has `signal?: AbortSignal`.
The wrapper passes no signal — acceptable for single-doc fetch (non-
cancellable by design in current interface). No change needed.

**Step 4: Run unit tests.**
```bash
npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

No E2E needed — `getById` is called from `ImageDetail.tsx` (component
mount), not from scroll/focus paths.

---

### F3 — First-page unification

**What changes:** `search` becomes a thin wrapper on `searchAfter` with
null cursor. The `_doSearch` / `from`+`size` path for first-page is
eliminated.

**Step 1: Check B1 status.**

If B1 is complete, `searchAfter` has 6 params. If not, it has 9. Adjust
the wrapper accordingly.

**Step 2: Update `es-adapter.ts`.**

Replace the `search` implementation:
```typescript
async search(params: SearchParams): Promise<SearchResult> {
  const result = await this.searchAfter(params, null, null);
  return {
    ...result,
    tickerCounts: undefined,  // tickers are fetched separately via countWithTickers
  };
}
```

**Step 3: Verify return type compatibility.**

`SearchResult` may have fields `SearchAfterResult` doesn't (e.g.
`tickerCounts`). The wrapper adds `tickerCounts: undefined` explicitly.
If `SearchResult` is a strict superset of `SearchAfterResult`, this works.
If not, check the type definitions and adjust.

**Step 4: Consider removing `_doSearch` (if it exists).**

If `search` was the only caller of a private `_doSearch` method with
`from`+`size` logic, that method is now dead code. Remove it. But check:
does `searchRange` also use `_doSearch`? If yes, keep it for `searchRange`.

**Step 5: Run unit tests.**
```bash
npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

No E2E — `search` has 0 production call sites (only tests call it).

---

### F2 — Count supersession

**What changes:** `count` becomes a wrapper on `countWithTickers`.

**Step 1: Update `es-adapter.ts`.**

Replace the `count` implementation:
```typescript
async count(params: SearchParams): Promise<number> {
  const result = await this.countWithTickers(params);
  return result.count;
}
```

**Step 2: Remove the old `_count` endpoint call** (the body that was
there before). Dead code.

**Step 3: Run unit tests.**
```bash
npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

No E2E — `count` has 0 production call sites.

---

## Test strategy

| After | Run | Why |
|-------|-----|-----|
| F1 | Unit + **E2E** | Changes facet panel data loading path (search-store + possibly components) |
| F4 | Unit | getById used in component mount, not scroll/focus |
| F3 | Unit | 0 production callers; only test code exercises it |
| F2 | Unit | 0 production callers; interface tidying |

Per AGENTS test directive: E2E mandatory after component/hook/store changes.
F1 qualifies (changes `search-store.ts` facet loading). F4/F3/F2 do not.

## What "done" looks like

- [ ] `getFacetData` exists in `types.ts` and `es-adapter.ts`
- [ ] `getAggregations` and `getFilterAggregations` are either removed or
      delegating to `getFacetData`
- [ ] `getById` body is `getByIds([id]).then(r => r[0])` (or equivalent)
- [ ] `search` body delegates to `searchAfter(params, null, null)`
- [ ] `count` body delegates to `countWithTickers(params).then(r => r.count)`
- [ ] All unit tests pass
- [ ] E2E tests pass (after F1)
- [ ] Interface method count in `types.ts` reduced (from 20 to 16–17,
      depending on whether deprecated methods are kept as optional)
- [ ] No performance regression on facet panel load (F1 should improve it)

## Push-back rules

- If `getAggregations` is called from many more places than documented
  (findings say: collection-store:140, search-store:3868, search-store:3908,
  typeahead-fields:203), grep first and count. If >6 call sites, the
  rename-all-callers approach may be too disruptive — consider keeping
  `getAggregations` as a wrapper that delegates to `getFacetData` with
  an empty `isFilters` array.
- If `SearchResult` and `SearchAfterResult` have incompatible shapes that
  can't be bridged with a simple spread + override, DO NOT force the F3
  wrapper. Instead, have both call a shared private `_fetchPage` method.
  The goal is to eliminate the `_doSearch` from+size path, not to force a
  type-unsafe cast.
- If `search` turns out to have production callers that the research
  missed (unlikely but possible if new code was written since findings-4),
  grep `dataSource.search(` first. If non-zero production callers exist,
  STOP and ask the user — F3 may no longer be safe.
- If removing `getAggregations` from the interface breaks the DAL contract
  test suite in ways that are expensive to fix, keep it as an optional
  method (`getAggregations?`) that wraps `getFacetData({fields, isFilters: []})`.

## Files you will touch

| File | Changes |
|------|---------|
| `kupua/src/dal/types.ts` | Add `FacetDataRequest`, `FacetDataResult`, `getFacetData`. Remove or mark optional: `getAggregations`, `getFilterAggregations`. |
| `kupua/src/dal/es-adapter.ts` | Add `getFacetData` impl. Simplify `getById`, `search`, `count`. Remove dead private methods. |
| `kupua/src/stores/search-store.ts` | Update facet-loading call sites (ss:3868–3869 merged; ss:3908 updated). |
| `kupua/src/lib/typeahead-fields.ts` | Update aggregation calls if any. |
| `kupua/src/stores/collection-store.ts` | Update `getAggregations` call (line ~140) — either rename to `getFacetData` or keep wrapper. |
| Test files | Update any tests that mock/call the old method names. |

## Dependencies

- **B1 must be done first** for F1 to work cleanly. F1's `isFilters` field
  in `FacetDataRequest` uses the B1-refactored `FilterAggRequest` type
  (with `isFilter: string`, not `query: Record<...>`). If B1 is not done,
  F1 still works but you'd be building on the old `query` shape — then B1
  would need to change it again.
- **F3 benefits from B1** (simpler `searchAfter` signature to wrap). But
  F3 works regardless.
- **F2 and F4 have no dependencies** — they're standalone.

## Model recommendation

Sonnet High. F1 requires judgement about the facet-loading call sites and
type design. F2/F3/F4 are mechanical but benefit from the same session's
context window (shared understanding of `types.ts` and `es-adapter.ts`).
