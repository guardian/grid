# Boundary-tightening inventory — May 2025

Research only. No code changes. All claims cite file:line.

---

## Section 0 — Refuted claims

**Claim to check (Item 1):** "`extractSortValues` is only called from `ImageTable.tsx`."

**Refuted.** There are 8+ call sites across 7 files (see Item 1 detail). This claim was
false, which means the scope estimate for that item was significantly underspecified.

---

## 1. `SortValues` opacity

### Call sites importing `SortValues` outside `dal/`

| File | Line | How imported |
|------|------|--------------|
| `src/lib/image-offset-cache.ts` | 21 | `import type { SortValues } from "@/dal"` (via barrel) |
| `src/lib/interpretClick.ts` | 12 | `import type { SortValues } from "@/dal/types"` (direct) |
| `src/lib/history-snapshot.ts` | 14 | `import type { SortValues } from "@/dal"` (via barrel) |
| `src/hooks/useRangeSelection.ts` | 34 | `import type { SortValues } from "@/dal/types"` (direct) |
| `src/stores/search-store.ts` | 393 | inline `import("@/dal").SortValues` in param type |
| `src/stores/search-store.ts` | 1758 | same inline form |
| `src/hooks/useUrlSearchSync.ts` | 209 | same inline form |

Two of these import from `@/dal/types` directly rather than via the barrel. The rest
use `@/dal`. The inline forms in search-store are in function parameter type positions
and are not runtime dependencies.

### Array indexing of `SortValues` outside `dal/`

None. Every actual index (`[i]`, `.length`, `.slice`, `.map`) on a `SortValues` array
appears inside `src/dal/` — in `es-adapter.ts`, `null-zone.ts`, `mock-data-source.ts`,
and `position-map.ts`. Outside `dal/`, callers treat `SortValues` as an opaque handle.

### `extractSortValues` call sites — confirmed 7 production files

**Refutes the premise that it is only called from `ImageTable.tsx`.**

| File | Lines |
|------|-------|
| `src/components/ImageTable.tsx` | 569, 607, 619, 665, 677 (5 calls) |
| `src/components/ImageDetail.tsx` | 270 (1 call) |
| `src/components/ImageGrid.tsx` | 676, 708, 719 (3 calls) |
| `src/stores/search-store.ts` | 2188, 2354 (2 calls) |
| `src/hooks/useRangeSelection.ts` | 208 area (1 call, via anchorSV resolution) |
| `src/lib/handleLongPressStart.ts` | imports at line 21, calls internally |
| `src/lib/build-history-snapshot.ts` | imports at line 17, calls internally |

`extractSortValues` itself lives in `src/lib/image-offset-cache.ts` and builds a
`SortValues` array from image fields using `buildSortClause` + `parseSortField` from
`@/dal`. It is the one place outside `dal/` that constructs a sort-values array
(rather than just passing one through).

### Constructing sort-values literals

Only `image-offset-cache.ts:extractSortValues` and `dal/mock-data-source.ts` construct
`SortValues` arrays. All component/store sites merely call `extractSortValues` and
pass the result straight back to the store.

### Tests guarding this concept

- `src/stores/search-store-eviction-cursor.test.ts` — mocks `extractSortValues` and
  tests null-return handling (lines 3–180).

### Risk note

Any change to `extractSortValues`'s output format (field order, null handling) would
break the cursor passed to `searchAfter` in the store, causing incorrect pagination.
Affected tiers: all. The cursor is used in forward/backward extend, seek, and
range-selection server walks. Regression would manifest as wrong page returned after
scroll or seek.

### Effort: M

10 call sites in production code; the mock in the test file needs updating if the
signature changes; all three views (ImageGrid, ImageTable, ImageDetail) are touched.

### Verdict: DEFER-TO-BFF

The opacity is preserved at the boundary that matters (indexing stays inside `dal/`).
The type imports outside `dal/` are all `import type` — zero runtime coupling. The
only concrete issue is the `@/dal/types` direct imports in two files rather than using
the barrel, which is a 2-line mechanical fix. Not worth a dedicated PR.

---

## 2. `orderBy` string parsing

### Sites that split on `,` or strip `-`

| File | Lines | Description |
|------|-------|-------------|
| `src/dal/adapters/elasticsearch/sort-builders.ts` | 56, 83 | Main builder — splits on `,`, strips `-` |
| `src/lib/sort-context.ts` | ~706, ~728, ~743, ~756 | Four exported/private fns: `resolvePrimarySortKey`, `resolveSortMapping`, `resolveKeywordSortInfo`, `resolveDateSortInfo` — all do `split(",")[0].trim()` + `startsWith("-")` |
| `src/components/SearchFilters.tsx` | 25–36 | `parsePrimarySort` (local fn), `parseSecondarySort` (local fn) |
| `src/components/ImageTable.tsx` | 1117, 1191 | `handleSort` reads `parts = orderBy.split(",")` inline |

**Distinct parser implementations: 3 modules** (sort-builders, sort-context, SearchFilters/ImageTable). `sort-context.ts`'s four functions are variations on a single pattern but live in one file. `SearchFilters.tsx` and `ImageTable.tsx` each have their own local implementations.

### Default to `-uploadTime`

| File | Line | Form |
|------|------|------|
| `src/dal/adapters/elasticsearch/sort-builders.ts` | 48 | `if (!orderBy) return [{ uploadTime: "desc" }, ...]` |
| `src/lib/sort-context.ts` | ~680 | `const DEFAULT_ORDER_BY = "-uploadTime"` |
| `src/stores/search-store.ts` | 1654 | initial state `orderBy: "-uploadTime"` |
| `src/components/SearchFilters.tsx` | 88 | `orderBy ?? "-uploadTime"` |

The default is consistent but duplicated in four places.

### `parsePrimarySort` named function

Lives only in `src/components/SearchFilters.tsx:25` (local, unexported). The sort-
context functions serve the same role but are named differently.

### URL boundary

`src/lib/search-params-schema.ts` uses `z.string().optional()` for `orderBy` — opaque
pass-through, no validation of the string's content. `useUrlSearchSync.ts` passes it
unchanged to the store. There is no canonical normalisation at the URL boundary; a URL
with `orderBy=-uploadTime` and one with `orderBy=uploadTime` (no leading minus) parse
correctly but a value like `orderBy=,-taken` would pass Zod and reach all four parsers
with different results (sort-builders handles it via `flatMap`; sort-context reads
`[0]` which would be the empty string).

### Tests guarding this concept

- `src/dal/adapters/elasticsearch/sort-builders.test.ts` — exercises `buildSortClause`
  and `reverseSortClause`.
- `src/stores/search-store-extended.test.ts` — exercises sort-related store behaviour
  with concrete `orderBy` values.

### Risk note

Replacing the ad-hoc parsers with a single `parseOrderBy` helper is a pure refactor.
The real risk is the URL boundary: Zod does not validate the `orderBy` format, so any
canonical `parseOrderBy` function would need to be called before the value reaches the
store, which is a different touch-point than consolidating existing call sites. Tiers
affected: scroll/two-tier/seek — all paths that call `buildSortClause`. Regression
would manifest as wrong ES sort clause or wrong scrubber label.

### Effort: M

4 modules, 2 are components that also test visual sort state. Need to verify
`sort-context.ts` is already the single source for scrubber label logic.

### Verdict: WORTH

Three independent implementations of the same 2-line pattern is a real maintenance
hazard. The mechanical part (extract one `parseOrderBy` into a shared util, update the
three non-DAL callers) is an hour. The URL validation gate is optional and can be
deferred. Good candidate for bundling with Item 3 (same files won't overlap).

---

## 3. Store importing DAL internals

### Imports in `src/stores/search-store.ts` that bypass the barrel

| Line | Import |
|------|--------|
| 34 | `import type { PositionMap } from "@/dal/position-map"` |
| 35 | `import { cursorForPosition } from "@/dal/position-map"` |
| 37 | `import { detectNullZoneCursor, remapNullZoneSortValues } from "@/dal/null-zone"` |
| 39 | `import { parseCql } from "@/dal/adapters/elasticsearch/cql"` |

None of these are exported from `src/dal/index.ts` (the barrel only re-exports from
`types`, `es-adapter`, and `sort-builders`).

### In test files

| File | Line | Import |
|------|------|--------|
| `src/stores/search-store-extended.test.ts` | 19 | `import { buildSortClause, reverseSortClause } from "@/dal/adapters/elasticsearch/sort-builders"` |

`buildSortClause` is in the barrel; `reverseSortClause` is not.

### Hooks with no direct DAL-internal imports found

No files under `src/hooks/` import from `dal/adapters/`, `dal/null-zone`, or
`dal/position-map` directly.

### Note on `parseCql`

`search-store.ts` imports `parseCql` from the ES adapter's CQL module. This is the
most architecturally uncomfortable of the four: the store is directly using a module
that is ES-specific and adapter-specific. When a BFF adapter replaces the ES adapter,
the store would need to be updated. Adding `parseCql` to the barrel would make the
coupling explicit without removing it.

### Tests guarding this concept

No tests specifically assert the import boundary. The existing store tests
(search-store.test.ts, search-store-extended.test.ts, etc.) exercise the behaviour
that depends on these imports; they don't care which module the symbol came from.

### Risk note

Fixing this is barrel-only: add `cursorForPosition`, `PositionMap`, `detectNullZoneCursor`,
`remapNullZoneSortValues`, `parseCql` to `dal/index.ts`, then update the four import
lines in search-store.ts. Zero behaviour change. Risk is near-zero; only TypeScript
re-export paths change. All tiers unaffected.

### Effort: S

4 lines in search-store.ts, 5 lines added to dal/index.ts. No test updates needed.

### Verdict: WORTH

Mechanical, safe, low-noise. Good candidate to bundle in the same PR as Item 2.

---

## 4. `took` field leakage

### Reads outside `dal/`

| File | Line | Nature |
|------|------|--------|
| `src/stores/search-store.ts` | 1926, 1990 | `took: result.took ?? null` — stored as `state.took` |
| `src/stores/search-store.ts` | 3731 | `aggTook: result.took ?? null` — stored as `state.aggTook` |
| `src/components/SearchBar.tsx` | 27, 207 | reads `s.took`, renders `{took}ms` in the toolbar |
| `src/components/SearchBar.tsx` | 29, 217 | reads `s.aggTook`, renders `{aggTook}ms` |

### User-visible?

Yes. `SearchBar.tsx:203–219` renders `{took}ms` / `{aggTook}ms` directly in the
search toolbar, gated on `took != null` and visible on `lg:` screens (hidden on mobile
via `hidden lg:block`). The surrounding comment reads "ES timing — far right." It is
intentionally user-visible as a dev-oriented timing indicator.

### Does it affect anything beyond devLog?

Confirmed yes — it drives a live DOM render. It does not affect any search behaviour,
scroll, or pagination. Removing it would require deleting the timing display from
SearchBar and removing `took`/`aggTook` from the store interface. No logic depends on
the value; it is display-only.

### Tests

`src/dal/selections-dal.test.ts:53` uses `took: params?.took ?? 1` in a test helper —
this is a type fixture, not a behaviour assertion.

### Risk note

Removing `took` from store state is entirely safe for search/scroll/seek behaviour.
The timing display itself would disappear. No tier regression. The only risk is that a
developer loses a quick perf indicator. This is a pure UX trade-off, not a code
correctness issue.

### Effort: S

Removing the store fields and the SearchBar rendering is ~10 lines. Keeping them but
clearly marking them as dev tooling (they already are) requires zero changes.

### Verdict: SKIP

The leak is intentional — `took` is surfaced as a dev timing indicator. The type
comment in `dal/types.ts` already says "ES query time in milliseconds (from the `took`
field in ES response)." There is no confusion about what it is. If the future BFF
adapter returns a timing field, the store slot can be reused with a rename. Not worth a
dedicated change.

---

## 5. `nullZoneDistribution` / `coveredCount` in route state

### Components/routes reading these from the store

| File | Line | What |
|------|------|------|
| `src/routes/search.tsx` | 119 | `nullZoneDistribution = useSearchStore(s => s.nullZoneDistribution)` |
| `src/routes/search.tsx` | 130 | `store.nullZoneDistribution` in useCallback |
| `src/routes/search.tsx` | 141 | `fetchNullZoneDistribution = useSearchStore(...)` |
| `src/routes/search.tsx` | 152 | `sortDistribution.coveredCount < total` — reads coveredCount from store |
| `src/stores/search-store.ts` | 2742 | `get().nullZoneDistribution` — read inside seek logic |

Only `routes/search.tsx` reads `nullZoneDistribution` as a React subscriber; the store
reads it imperatively in one seek path.

### `computeTrackTicksWithNullZone` call sites

| File | Line |
|------|------|
| `src/routes/search.tsx` | 173 | only production call site |
| `src/stores/search-store-extended.test.ts` | 1034, 1065, 1088 | vitest test cases |

Signature: `computeTrackTicksWithNullZone(orderBy, total, bufferOffset, results, sortDist, nullZoneDist) → TrackTick[]`

All six arguments are store state. The function is a pure computation: no side
effects, no I/O, no Zustand calls.

### Can tick computation move entirely into the store without changing the scrubber's input shape?

**Yes, in principle.** All six inputs to `computeTrackTicksWithNullZone` live in the
store (`params.orderBy`, `total`, `bufferOffset`, `results`, `sortDistribution`,
`nullZoneDistribution`). Moving the call into the store as a derived/computed field
would mean the route component reads a pre-computed `trackTicks: TrackTick[]` array
from the store instead of computing it in a `useRef` cache.

**Why not trivially:** The route currently implements its own memoization
(`ticksCacheRef`) keyed by a computed string. Moving this into a Zustand store would
require either: (a) a Zustand selector that derives the array (re-runs on every
relevant state change, possibly redundantly), or (b) explicit invalidation on the same
cache-key change. Neither is hard, but Zustand doesn't have native memoized selectors
— it would require adding `zustand/middleware` shallow equality work or a custom
equality fn. The current manual ref cache in the route is arguably cleaner.

**Concrete blocker:** The `results` store field is an `(Image | undefined)[]` and
changes identity on every extend. A naive store subscription to `results` for tick
recomputation would recompute on every buffer fill, most of which don't change the
tick layout. The existing route-level cache already handles this (key is based on
`orderBy`, `total`, `sortDistribution.buckets.length`, `nzDistBucketCount`).

**Verdict on moving:** Not necessary. The current split (store holds distributions,
route derives ticks from distributions) is correct separation. The ticks are a display
artifact derived from store state; computing them in the route and caching manually is
fine and cheaper than a reactive store derivation.

### Test surface for scrubber ticks

**Vitest:** `src/stores/search-store-extended.test.ts:1014–1088`
- 3 describe blocks for `computeTrackTicksWithNullZone`: all-null-zone case, normal
  distribution case, mixed null zone.

**Playwright:** No tick-specific e2e tests found. `buffer-corruption.spec.ts` checks
scrubber thumb position (`getScrubberThumbTop`) but not tick rendering.

### Risk note

Any change that moves or reshapes the trigger for `fetchNullZoneDistribution` (currently
in the `useEffect` at search.tsx:151–155) risks the null zone being unfetched after
seeking. The effect's dependency array includes `[sortDistribution, total, fetchNullZoneDistribution]`.
If moved into the store's search callback, the timing relative to the initial search
result must be preserved. All tiers affected (null zone only matters in seek mode for
large result sets, but the effect fires in scroll mode too when coveredCount < total).

### Effort: L

Moving `fetchNullZoneDistribution` trigger into the store requires careful sequencing
analysis (it must fire after `sortDistribution` lands). Leaving it in the route is
correct. A smaller version of this task — just verifying the auto-trigger logic is
correct — is S.

### Verdict: SKIP

The current architecture is correct: store owns the data, route owns the triggering
condition and the derived display artifact (ticks). Moving either into the store is
more complex with no user-visible benefit. The real issue (if any) would be making
`fetchNullZoneDistribution` self-triggering within the store's `fetchSortDistribution`
callback, which is a different and more targeted change.

---

## 6. Aggregation bucket key typing

### Sites reading `bucket.key` and what they assume

| File | Line | Assumption |
|------|------|------------|
| `src/dal/es-adapter.ts` | 433 | none — passes key as-is to string-keyed map |
| `src/dal/es-adapter.ts` | 1354, 1363 | `bucket.key._sort_field` — composite agg key, different structure |
| `src/lib/sort-context.ts` | 380 | none — stores in debug object, no type assumption |
| `src/lib/sort-context.ts` | 702 | **date** — `new Date(bucket.key)` (inside date histogram code path) |
| `src/stores/search-store.ts` | 2762, 2765 | **date** — `new Date(bucket.key).getTime()` (null zone distribution) |
| `src/components/FacetFilters.tsx` | 288, 289, 296, 298, 306 | **keyword** — renders as string, passes to CQL builder |

### Where the date/keyword distinction is encoded

**By context, not by type.** `AggregationBucket.key: string` is typed as a plain
string (see `src/dal/types.ts:194`, which documents: "keyword value (e.g. 'Getty') or
ISO date string (e.g. '2024-03-01T00:00:00.000Z')"). The ambiguity is explicit in the
comment but not encoded in TypeScript.

The callers know which kind they have because:
- `sort-context.ts` date path is only reached from functions gated on `mapping.type === "date"` (SORT_LABEL_MAP lookup).
- `search-store.ts` null-zone code is only reached via `fetchNullZoneDistribution`,
  which fetches an uploadTime date histogram.
- `FacetFilters.tsx` only receives buckets from keyword facet aggregations
  (`getAggregations` on terms fields).

**No discriminant field exists on `AggregationBucket`.** The correct kind is inferred
from the call site's context.

### Distinct call sites where the distinction matters

3 date-assuming sites (`sort-context.ts:702`, `search-store.ts:2762, 2765`), 1 keyword
context (`FacetFilters.tsx`). The composite-agg bucket at es-adapter.ts:1354–1363 uses
a completely different structure (`bucket.key._sort_field`) and is not covered by
`AggregationBucket` — it is an inline type cast.

### Risk note

Adding a discriminant (`kind: "date" | "keyword"`) to `AggregationBucket` would require
updating every producer (es-adapter's `getAggregations`, `getSortDistribution`,
`fetchNullZoneDistribution`) and every consumer. The current approach works because
callers never receive the wrong kind — the aggregation type is known at the call site.
The real hazard would be a future caller that receives a `SortDistribution` and doesn't
know whether it contains date or keyword buckets. That doesn't currently exist.

### Effort: S (type annotation only) / M (add discriminant)

Adding a `kind` discriminant to `AggregationBucket` plus updating all producers and
consumers: ~15 touch-points, all mechanical. No behaviour change.

### Verdict: DEFER-TO-BFF

The current implicit convention works and is documented. A discriminant would be most
valuable if buckets from different aggregations are ever mixed in the same consumer,
which doesn't happen today. Worth adding when the BFF response shape is designed —
that's the right moment to formalise the type.

---

## Recommended bundle

### PR A — Mechanical, zero-risk, no test updates needed

**Items 3** (barrel discipline) and **Item 2 partial** (extract `parseOrderBy` util,
update `sort-context.ts` / `SearchFilters.tsx` / `ImageTable.tsx` to use it).

File overlap: `dal/index.ts`, `search-store.ts`, `sort-context.ts`, `SearchFilters.tsx`,
`ImageTable.tsx`. None of these overlap with Items 4–6. Test surface: `sort-builders.test.ts`
should still pass unchanged; run unit + e2e after.

Estimated session: 1 day (Item 3 is an hour; Item 2 requires careful extraction to
ensure the four parsers are genuinely equivalent before collapsing them).

### PR B — Only if explicitly requested

**Item 1 partial**: redirect the two direct `@/dal/types` imports to go through `@/dal`
instead. 2-line change. Not worth its own PR; fold into PR A if convenient.

### Do not bundle

- **Items 4, 5, 6** — Item 4 is a deliberate feature (skip); Item 5 needs design
  judgement about store vs route ownership; Item 6 is defer-to-BFF. None share files
  with PR A's scope.

---

## Appendix — Out-of-scope observations (≤ 10)

1. `src/lib/image-offset-cache.ts` imports `parseSortField` and `DATE_SORT_FIELDS`
   from `@/dal` (barrel, fine) but `buildSortClause` too — that's an ES-specific
   function constructing ES syntax, leaked into a lib helper.
2. `reverseSortClause` in `sort-builders.ts` is used in `search-store-extended.test.ts`
   but is not exported from the barrel. If the test needs it, it should be exported.
3. `src/dal/types.ts:194` comment documents the date/keyword duality explicitly —
   a good candidate to become a union type discriminant.
4. `useUrlSearchSync.ts` collection auto-sort logic (`COLLECTION_CHIP_RE`,
   `COLLECTION_SORT`) is module-level state in a hook file — sits oddly outside
   the store.
5. `src/stores/search-store-extended.test.ts:19` imports from
   `@/dal/adapters/elasticsearch/sort-builders` directly (bypasses barrel), which
   makes the test adapter-coupled.
