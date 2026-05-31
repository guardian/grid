# Phase 3 — B1 Refactor: Eliminate ES-Shape Leaks

## What this session does

Eliminate 7 ES-shape leaks from the `ImageDataSource` interface. These are
raw ES DSL objects that leaked into the public DAL boundary. Removing them:
- Closes the ES query injection surface (security win)
- Simplifies the DAL interface (fewer params, no ES knowledge needed)
- Makes future `GridApiDataSource` implementation smaller
- Has value TODAY for the current direct-to-ES client

**This is an implementation session — you will write code and run tests.**

## Source of truth

`kupua/exploration/docs/03 Ce n'est pas une pipe dream/phase-3-minimal-gap-derivation-findings.md`
Section 4a — the leak table. Each item there has full context.

## The 7 leaks, grouped by affected code

### Group A — `searchAfter` signature (items 1–4)

All touch the same method signature and the same 23 call sites in
`search-store.ts`.

| # | Leak | Current | After | Notes |
|---|------|---------|-------|-------|
| 1 | `sortOverride` | `Record<string, unknown>[]` | REMOVED | Always `buildSortClause(params.orderBy)`. ES adapter derives internally. |
| 2 | `extraFilter` | `Record<string, unknown>` | REMOVED | Always null-zone `must_not:exists`. ES adapter detects from null-prefixed cursor. |
| 3 | `noSource` | `boolean` | REMOVED | Only used internally by `getIdRange`. Never passed by external callers. |
| 4 | `missingFirst` | `boolean` | Rename to `seekToEnd` | Same behaviour, abstract name. |

**The key refactor for items 1+2:** Currently, ~7 call sites in
`search-store.ts` (Group B in findings-4) strip the null prefix from the
cursor `[null, uploadTime, id]` → `[uploadTime, id]` and pass explicit
`sortOverride` + `extraFilter`. After this refactor, those call sites send
the FULL null-prefixed cursor unchanged. The ES adapter's `searchAfter`
implementation detects `cursor[0] === null` (using the existing
`detectNullZoneCursor` function from `null-zone.ts`) and applies the
override internally.

**The E1 case** (`search-store.ts:2950`): Currently constructs a 2-element
cursor `[uploadTimeEstimate, ""]` without the null prefix. Change to
`[null, uploadTimeEstimate, ""]` so the adapter's null detection works.

### Group B — `countBefore` (item 5)

| # | Leak | Current | After | Notes |
|---|------|---------|-------|-------|
| 5 | `sortClause` | `Record<string, unknown>[]` | REMOVED | Always `buildSortClause(params.orderBy)`. ES adapter derives internally. |

8 call sites in `search-store.ts`. Every one passes
`buildSortClause(params.orderBy)` as the third argument. Remove the param;
update all 8 call sites to remove that argument.

### Group C — Aggregation / distribution (items 6–7)

| # | Leak | Current | After | Notes |
|---|------|---------|-------|-------|
| 6 | `FilterAggRequest.query` | `Record<string, unknown>` | Change to `isFilter: string` | Callers pass CQL name; adapter compiles internally. |
| 7 | `getDateDistribution extraFilter` | `Record<string, unknown>` | Change to `missingField?: string` | Adapter builds the `must_not:exists` filter from the field name. |

## Execution order

1. **Group A first** (highest risk, most call sites, most value)
2. **Group B second** (mechanical, 8 call sites)
3. **Group C third** (separate modules, low risk)
4. **Run tests after each group** — not just at the end

## Detailed implementation plan

### Group A — Step by step

**Step 1: Update `types.ts` — the `searchAfter` signature.**

Remove `sortOverride`, `extraFilter`, `noSource` parameters. Rename
`missingFirst` to `seekToEnd`. The new signature:

```typescript
searchAfter(
  params: SearchParams,
  searchAfterValues: SortValues | null,
  pitId?: string | null,
  signal?: AbortSignal,
  reverse?: boolean,
  seekToEnd?: boolean,
): Promise<SearchAfterResult>;
```

**Step 2: Update `es-adapter.ts` — the implementation.**

The implementation currently reads `sortOverride` and `extraFilter` from
params. Change to:
- If `searchAfterValues` is non-null and `searchAfterValues[0] === null`:
  call `detectNullZoneCursor(searchAfterValues, params.orderBy)` (this
  function already exists in `null-zone.ts` and returns `{ sortOverride,
  extraFilter }` — it's literally built for this purpose).
- Otherwise: derive sort from `buildSortClause(params.orderBy)` as before,
  no extra filter.
- `noSource` was only used internally by `getIdRange` — see Step 4.
- Rename internal uses of `missingFirst` to `seekToEnd`.

**Step 3: Update call sites in `search-store.ts`.**

Three categories of call site (use findings-4 Part 1 groups):

- **Group A calls (simple, no override):** Already pass no `sortOverride`
  or `extraFilter`. Just remove those positional args (they were
  `undefined`). ~4 sites.
- **Group B calls (null-zone with explicit override):** Currently strip
  null from cursor, pass `sortOverride` and `extraFilter` explicitly.
  Change to: pass the full cursor unchanged, remove override args. ~7 sites.
- **Group C calls (standard deep seek):** No overrides. Remove undefined
  positional args. ~7 sites.
- **Group D calls (reverse/missingFirst):** Change `missingFirst` arg
  position to the new `seekToEnd` position. ~4 sites.
- **E1 (ss:2950):** Change cursor from `[uploadTimeEstimate, ""]` to
  `[null, uploadTimeEstimate, ""]`.

**Step 4: Fix `getIdRange` internal call.**

`getIdRange` in `es-adapter.ts` internally calls `this.searchAfter(...
noSource: true)`. Since `noSource` is removed from the public interface,
create an internal-only method `_searchAfterInternal(... noSource: boolean)`
or simply inline the `_source: false` logic within `getIdRange`'s own ES
request construction (it already builds its own request body). The cleanest
approach: `getIdRange` should NOT call `this.searchAfter` at all — it should
call a private helper that builds the ES request directly with `_source:
false`. Check whether this is already the case (findings-4 notes
`getIdRange` at es-adapter.ts:2096 calls `this.searchAfter` — so this
needs refactoring).

**Step 5: Run tests.**

```bash
npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

If unit tests pass:
```bash
npm --prefix kupua run test:e2e 2>&1 | tee "$TMPDIR/kupua-e2e-output.txt"
```

⚠️ **E2E REQUIRES PORT 3000 FREE.** Stop any dev server on :3000 before
running. Warn the user and wait for confirmation.

### Group B — Step by step

**Step 1: Update `types.ts` — the `countBefore` signature.**

Remove `sortClause` parameter:

```typescript
countBefore(
  params: SearchParams,
  sortValues: SortValues,
  signal?: AbortSignal,
): Promise<number>;
```

**Step 2: Update `es-adapter.ts` — the implementation.**

Replace `sortClause` parameter usage with
`buildSortClause(params.orderBy)` computed internally.

**Step 3: Update 8 call sites in `search-store.ts`.**

Every call looks like:
```typescript
dataSource.countBefore(params, sortValues, buildSortClause(params.orderBy), signal)
```
Change to:
```typescript
dataSource.countBefore(params, sortValues, signal)
```

**Step 4: Run unit tests.**

```bash
npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

### Group C — Step by step

**Item 6: `FilterAggRequest.query` → `isFilter: string`**

Step 1: In `types.ts`, change `FilterAggRequest`:
```typescript
// Before
type FilterAggRequest = { name: string; query: Record<string, unknown> };
// After
type FilterAggRequest = { name: string; isFilter: string };
```

Step 2: Update callers (2 sites: `search-store.ts:3869`,
`typeahead-fields.ts:376`). They currently do:
```typescript
{ name: "deleted", query: parseCql("is:deleted").must[0] }
```
Change to:
```typescript
{ name: "deleted", isFilter: "deleted" }
```

Step 3: Update `es-adapter.ts` `getFilterAggregations` implementation.
Instead of using `req.query` directly as the ES filter, compile it:
```typescript
const filterQuery = parseCql(`is:${req.isFilter}`).must[0];
```

**Item 7: `getDateDistribution extraFilter` → `missingField?: string`**

Step 1: In `types.ts`, change `getDateDistribution?` signature:
```typescript
// Before
getDateDistribution?(params, field, direction, signal?, extraFilter?): ...
// After
getDateDistribution?(params, field, direction, signal?, missingField?: string): ...
```

Step 2: Update the 1 caller (`search-store.ts:4030`). Currently passes:
```typescript
{ bool: { must_not: { exists: { field: primaryField } } } }
```
Change to just passing the field name: `primaryField`.

Step 3: Update `es-adapter.ts` `getDateDistribution` implementation.
Build the filter internally:
```typescript
const extraFilter = missingField
  ? { bool: { must_not: { exists: { field: missingField } } } }
  : undefined;
```

**Run tests after Group C:**
```bash
npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

## Test strategy

| After | Run | Why |
|-------|-----|-----|
| Group A | Unit + **E2E** | Touches scroll behaviour (null-zone cursor changes) |
| Group B | Unit | countBefore changes are mechanical; no scroll/focus change |
| Group C | Unit | Aggregation shape changes; no scroll/focus change |

Per AGENTS test directive: E2E mandatory after component/hook/store/scroll
changes. Group A qualifies (changes search-store scroll paths). Groups B+C
do not (mechanical signature changes, no scroll semantics altered).

## What "done" looks like

- [ ] `searchAfter` signature has 6 params (not 9)
- [ ] `countBefore` signature has 3 params (not 4)
- [ ] `FilterAggRequest` has `isFilter: string` (not `query: Record<...>`)
- [ ] `getDateDistribution` has `missingField?: string` (not `extraFilter?`)
- [ ] No raw ES DSL (`Record<string, unknown>`) remains in `types.ts`
      method signatures (check with grep)
- [ ] `getIdRange` does not call the public `searchAfter` (or if it does,
      it doesn't pass `noSource`)
- [ ] All unit tests pass
- [ ] E2E tests pass (after Group A)
- [ ] No new test failures introduced

## Push-back rules

- If a Group B call site does something non-obvious with `sortClause`
  (not just passing `buildSortClause(params.orderBy)`), STOP and ask.
  All 8 should be mechanical. If any isn't, the findings are wrong.
- If `getIdRange`'s refactoring away from `this.searchAfter` becomes
  complex (>50 LOC), consider a simpler approach: keep an internal
  `_searchAfterRaw` with the `noSource` param, and have the public
  `searchAfter` delegate to it. Don't over-engineer.
- If E2E tests fail after Group A on a null-zone-related test, this is
  expected. Read the failure carefully — it may be testing the OLD
  behaviour (explicit override passing). The test may need updating to
  reflect the new cursor shape. Do NOT weaken assertions without
  understanding why they fail.

## Files you will touch

| File | Changes |
|------|---------|
| `kupua/src/dal/types.ts` | Signature changes (searchAfter, countBefore, FilterAggRequest, getDateDistribution) |
| `kupua/src/dal/es-adapter.ts` | Implementation changes (detect null-zone from cursor, remove params, compile isFilter, build missingField filter) |
| `kupua/src/stores/search-store.ts` | ~23 searchAfter call sites + 8 countBefore call sites + 1 getFilterAggregations call site |
| `kupua/src/lib/typeahead-fields.ts` | 1 getFilterAggregations call site |
| `kupua/src/dal/null-zone.ts` | Possibly — verify `detectNullZoneCursor` signature matches what the adapter needs |
| `kupua/src/hooks/useRangeSelection.ts` | 0 changes (getIdRange interface unchanged) |
| Test files | Update any tests that construct `FilterAggRequest` with `query` or call `searchAfter` with 9 params |

## Model recommendation

Sonnet High. This is mechanical but context-heavy (23 call sites require
reading + editing). High handles the "change 23 things consistently"
pattern better than Medium.
