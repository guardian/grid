# AI Search — Aggregation/Ticker/Filter Problem

_Created 24 May 2026. Revised 24 May with the "AI is not a mode" principle as
the overriding constraint. Documents the root cause of empty tickers and
filters in AI mode, and the design decided to fix it._

---

## Problem Statement

When AI search is active (`aiQuery:"..."` chip in the CQL string), three UI features break:

1. **Tickers** (GNM-owned, Agency Picks) — show nothing
2. **Filters panel** — completely empty (all facet buckets are zero)
3. **Is-section filter counts** — zero for all entries

GNM-owned **borders** still work correctly (they're computed client-side per-image
from `usageRights.category` via `getImageBorderColour()` in `lib/image-borders.ts`).

---

## Root Cause (confirmed by code trace)

### The poisoned query

The `aiQuery:"..."` chip lives inside `params.query` (the CQL string). Only
`searchByAi()` in the DAL knows to strip it before calling `buildQuery()`.

**Every other code path** that calls `buildQuery(params)` passes the AI chip
through to `parseCql()`, which:

1. Parses `aiQuery` as a CQL field name
2. `resolveNamedField("aiQuery")` → no alias match → falls through
3. `getFieldPath("aiQuery")` → not in any field set → returns `"aiQuery"` verbatim
4. Generates `{ match_phrase: { "aiQuery": "snowy peaks" } }`
5. ES field `"aiQuery"` does not exist → **zero documents match** the overall bool query

### Affected paths (provisional — full blast radius confirmed in Step 4)

| Consumer | Where called | Effect |
|---|---|---|
| `countWithTickers(params)` | AI branch in `search()` currently **skips this call** | `tickerCounts` left null → empty UI |
| `getAggregations(params, fields, signal)` | `fetchAggregations` store action | Zero results → all buckets empty |
| `getFilterAggregations(params, filters, signal)` | Same store action, parallel call | Zero results → Is-section counts all zero |
| Typeahead resolvers (scoped aggs) | `typeahead-fields.ts` via `scopedAgg()` | Empty suggestions if user types a chip value while AI chip is active |

**This table is provisional.** A full `grep -rn 'buildQuery(' kupua/src/` must
be run before implementation declares completion. See Step 4.

### Compounding factor

The AI branch in `search()` also **explicitly** sets `tickerCounts: null` and
skips calling `countWithTickers`. The workplan §9.2 said "still call (ticker
counts are useful context)" but this wasn't implemented. The fix below
restores it via the same code path normal search uses.

---

## Why the naive fix (`buildQuery` strips the AI chip) is INSUFFICIENT

Stripping `aiQuery:"..."` inside `buildQuery` before parsing is necessary —
without it, every callsite produces a zero-match query. But it isn't enough on
its own. If `buildQuery` ONLY strips, then:

- `getAggregations(params)` produces aggregations scoped to **all images
  matching the remaining filters** (potentially 9M+ docs)
- `countWithTickers(params)` counts tickers across the **entire index**

The user is looking at **200 KNN-ranked results**. The aggregations should
reflect THOSE 200 images, not the entire index. Showing "4,200 GNM-owned"
when you're viewing 200 AI results is misleading and breaks the principle
that the filter panel scopes to what's actually on screen.

For typeahead specifically the opposite is true — typeahead is "suggest values
from the world, narrowed by other active chips" rather than "suggest from
the 200 current results." So typeahead is the ONE path where the strip alone
is the correct fix; aggregations need strip + ID-scoping.

---

## Design Principle: AI is not a mode

The overriding constraint for this fix: the app must behave in AI search as
close as possible to non-AI search. AI is a different ranking algorithm, not
a different mode of the UI. Every existing feature (tickers, filters,
is-counts, typeahead, future agg types) must work without bespoke AI-aware
code paths.

This rules out approaches like "compute tickers client-side from
`store.results[]` because it's fast." Even though that would work, it creates
a second code path for ticker semantics (TS predicates duplicating the ES agg
definitions) that can drift, must be maintained twice, and is a place future
contributors need to remember AI is special. The whole point is to eliminate
that kind of bifurcation.

---

## Solution: ES filter-by-IDs, with a single AI-detection point

After the AI KNN search lands ≤200 results, store their IDs. Every subsequent
aggregation/count query is constructed with `params.ids = [...those IDs]`
AND the AI chip stripped from `params.query`. The existing `buildQuery` code
already handles `params.ids` by emitting a `terms: { id: [...] }` filter
clause. The resulting ES query is "aggregate over exactly these N documents"
— correct semantics, zero new aggregation code.

### Why this shape

1. Reuses ALL existing aggregation infrastructure unchanged
2. Handles every field type, every agg type, every nested path
3. Handles future agg features (composite, histogram, etc.) for free
4. Performance cost (~50ms extra ES query) is indistinguishable from instant
5. Works identically for tickers AND facets AND Is-filters
6. Zero new aggregation logic in TS — no source-of-truth duplication

### Single AI-detection point (load-bearing for the "not a mode" principle)

The AI-detection regex (`/aiQuery:(?:"[^"]+"|[^"\s]+)/`) must live in **one
helper**, used by every store action that fetches aggregations or counts.
Scattering it across `fetchAggregations`, the AI branch in `search()`, and
future callsites is exactly the mode-ness the principle forbids.

```typescript
// in src/lib/ai-search-params.ts (or similar)
export function decorateParamsForAggregations(
  params: SearchParams,
  resultIds: readonly string[],
): SearchParams {
  const { aiText, remainder } = extractAiQuery(params.query ?? "");
  if (!aiText) return params;
  return {
    ...params,
    query: remainder,
    ids: resultIds.join(","),
  };
}
```

Every store action that calls `dataSource.getAggregations`,
`dataSource.getFilterAggregations`, or `dataSource.countWithTickers` passes
`params` through `decorateParamsForAggregations(params, state.results.map(r => r.id))`
first. No exceptions.

Reviewers' rule: any new code that calls a `dataSource.*` aggregation/count
method without going through `decorateParamsForAggregations` is a bug.

---

## Implementation Plan

### Step 1: `buildQuery` strips the AI chip (load-bearing, not "defence")

This is the central fix, not a safety net. Without it, even calls that pass
`params.ids = [...]` still produce a zero-match query, because the poisoned
`{ match_phrase: { aiQuery: "..." } }` ends up in `bool.must` alongside the
ID filter.

2-line change at the top of `buildQuery`:

```typescript
const { remainder } = extractAiQuery(params.query ?? "");
// use `remainder` instead of params.query when calling parseCql
```

`searchByAi` already strips before calling `buildQuery(remainderParams)`, so
the strip-in-`buildQuery` is a no-op there. For every other caller, it makes
the poisoned-query class of bugs structurally impossible.

### Step 2: `decorateParamsForAggregations` helper + AI branch wires it up

Create the helper (above). At the top of the new file, add this comment so the next person to touch it has the breadcrumb to the architectural target:

```typescript
// Tactical solution for AI search (one alternative-ranking algorithm).
// Replace with SearchContext abstraction when a second one lands.
// See: exploration/docs/ai-searchContext-future-abstraction.md
```

In the AI branch of `search()`, after `set({...})`
with the new results, call `countWithTickers` with decorated params so
tickers reflect the AI results:

```typescript
// In AI branch of search(), after results are set:
const decorated = decorateParamsForAggregations(
  params,
  aiResult.hits.map(h => h.id),
);
const tickerCounts = await dataSource.countWithTickers(decorated, signal);
set({ tickerCounts, tickersLastUpdated: new Date().toISOString() });
```

No client-side ticker computation. Same code path as normal search.

### Step 3: `fetchAggregations` calls the helper

```typescript
const resultIds = get().results.map(img => img.id);
const decorated = decorateParamsForAggregations(params, resultIds);
const [aggs, filterAggs] = await Promise.all([
  dataSource.getAggregations(decorated, fields, signal),
  dataSource.getFilterAggregations(decorated, filters, signal),
]);
```

The decoration is a no-op when AI mode is not active. No branching at the
call site beyond this line.

### Step 4: Confirm blast radius before declaring done

Run `grep -rn 'buildQuery(' kupua/src/` and
`grep -rn 'dataSource\.\(get.*Agg\|countWith\)' kupua/src/`.

Confirm every result is either:
- Inside `searchByAi` (already strips), or
- Going through `decorateParamsForAggregations` per Steps 2-3

Any caller not in one of those buckets is a latent bug. Fix it as part of
this commit. The provisional 4-caller table above is the starting point, not
the finishing point.

### Step 5: Typeahead semantics in AI mode

Typeahead's `scopedAgg()` calls `buildQuery(params)`. The strip from Step 1
makes it work correctly: typeahead suggestions come from the full index
narrowed by other active chips, ignoring the AI chip. This matches the
intuition that typeahead is "suggest values from the world" not "suggest
from the 200 current results." No further change needed.

---

## Resolved decisions

1. **Typeahead semantics in AI mode:** No special casing. Strip alone (Step 1)
   is sufficient. Same broad-index-scoped behaviour as normal mode.

2. **New images poll:** Suppressed entirely in AI mode (no change from current
   1b behaviour). Re-checking would require re-running the Bedrock embedding
   + KNN query.

3. **Cache invalidation for AI aggs:** Cache keys include `params.ids`, so new
   AI search → new IDs → fresh agg fetch. No special cache logic.

4. **Tickers via ES, not client-side:** Even though TS predicates exist
   (`isAgencyPick`, `WHOLLY_OWNED_CATEGORIES`), use the ES path. One source
   of truth for ticker semantics. The ~50ms cost is invisible.

5. **Filter panel statistical meaningfulness on ≤200 results:** Acknowledged.
   "Top suppliers" over 200 KNN hits may show flat distributions. This is
   correct — it's an honest reflection of what the user is looking at. Ship
   as-is; observe; iterate only if users complain.

---

## Files involved

| File | Role in the fix |
|---|---|
| `src/lib/ai-search-params.ts` (new) | `decorateParamsForAggregations(params, ids)` helper |
| `src/dal/es-adapter.ts` → `buildQuery()` | Strip AI chip (Step 1, load-bearing) |
| `src/dal/es-adapter.ts` → `extractAiQuery()` | Already exists, exported |
| `src/stores/search-store.ts` → AI branch in `search()` | Call `countWithTickers` with decorated params |
| `src/stores/search-store.ts` → `fetchAggregations` | Decorate params before DAL call |
| (any other caller surfaced by Step 4 grep) | Route through decorator |

---

## What this fix does NOT include

- Client-side aggregation computation (rejected: violates "not a mode" principle)
- AI-aware ticker definitions (rejected: same)
- A `_isAiMode` flag on the store (rejected: AI presence is derivable from
  `params.query` via `extractAiQuery`; a flag would be a second source of truth)
- Any change to typeahead semantics (Step 1 strip is sufficient)
- Any change to GNM-owned border rendering (already works; per-image client-side)

---

## Existing code reused by the fix

- `extractAiQuery(query: string)` — already exists in `es-adapter.ts`, exported
- `params.ids` → `{ terms: { id: idList } }` in `buildQuery` — already exists
- All ES aggregation, ticker, and is-filter machinery — unchanged

---

## Addendum: Callsite audit for `buildQuery` / aggregation AI-chip fix

### How to read

| Column | Meaning |
|---|---|
| **file:line** | grep hit location |
| **function** | enclosing function / method |
| **raw params?** | does it pass `params.query` un-stripped? |
| **bucket** | (A) already strips · (B) strip-in-buildQuery enough · (C) needs decorateParamsForAggregations · (D) unclear |

---

### Part 1 — `buildQuery()` internal callsites (`es-adapter.ts`)

These are the implementation sites. Fix (a) — stripping the chip inside
`buildQuery` itself — covers all of them at once. Column "raw params?" 
refers to whether the caller passes params with a potential AI chip.

| file:line | function | raw params? | bucket | notes |
|---|---|---|---|---|
| `es-adapter.ts:725` | `_doSearch` (called by `search()`, `searchRange()`) | yes | **(B)** | Store's `search()` short-circuits to `searchByAi` before reaching `_doSearch`; `searchRange()` is not called in AI mode |
| `es-adapter.ts:782` | `count()` | yes | **(B)** | Not called by store (no `dataSource.count(` hits in grep); world count semantics correct after strip |
| `es-adapter.ts:795` | `countWithTickers()` | yes | **(B)** | Called by store only in non-AI paths (poll blocked, normal `search()` path skipped when chip present) |
| `es-adapter.ts:883` | `getAggregations()` | yes | **(C)** | `fetchAggregations` and `fetchExpandedAgg` call this while AI mode is live; sidebar facets must scope to AI IDs |
| `es-adapter.ts:920` | `getFilterAggregations()` | yes | **(C)** | Same — `fetchAggregations` calls it concurrently with `getAggregations` |
| `es-adapter.ts:982` | `searchAfter()` | yes | **(B)** | Extends / seek never fire in AI mode (`total === hits.length ≤ 200`); strip alone is sufficient |
| `es-adapter.ts:1159` | `searchByAi()` | **no** — uses `remainderParams` (chip stripped by `extractAiQuery`) | **(A)** | Already correct; no change needed |
| `es-adapter.ts:1239` | `countBefore()` | yes | **(B)** | Only called from seek / `restoreAroundCursor`; not triggered in AI mode |
| `es-adapter.ts:1349` | `estimateSortValue()` | yes | **(B)** | Only in seek; ≤200 total never reaches deep-seek threshold |
| `es-adapter.ts:1439` | `findKeywordSortValue()` | yes | **(B)** | Same |
| `es-adapter.ts:1552` | `getKeywordDistribution()` | yes | **(B)** | Same |
| `es-adapter.ts:1624` | `getDateDistribution()` | yes | **(B)** | Same |
| `es-adapter.ts:1763` | `fetchPositionIndex()` | yes | **(B)** | Position map only built when `total > POSITION_MAP_THRESHOLD`; AI results (≤200) never qualify |

---

### Part 2 — Store / library callers of `dataSource.*` (`search-store.ts`)

> **Note on the high `searchAfter` count:** grep returns 24 `dataSource.searchAfter` 
> hits in search-store.ts — 15 of them are inside the single `seek()` function
> (various sub-paths: End-key, shallow, position-map, keyword, date). All are
> Bucket (B) for the same reason: `seek()` is never triggered when `total ≤ 200`,
> which is the AI-mode invariant. They are grouped below.

| file:line | function | adapter method | raw params? | bucket | notes |
|---|---|---|---|---|---|
| `search-store.ts:602` | new-images poll `tick()` | `countWithTickers` | yes (spread of `params`) | **(B)** | AI path in `search()` never calls `startNewImagesPoll()`; poll cannot be running during AI mode |
| `search-store.ts:898` | `_fillBufferForScrollMode` | `searchAfter` | yes (spread `frozenP`) | **(B)** | Scroll fill only activates when `total > SCROLL_MODE_THRESHOLD`; AI ≤200 never qualifies |
| `search-store.ts:1075` | `_buildBufferAroundImage` (fwd half) | `searchAfter` | yes | **(B)** | Only reached from `_loadBufferAroundImage`, which is only called from seek / restore paths; not used in AI mode |
| `search-store.ts:1086` | `_buildBufferAroundImage` (bwd half) | `searchAfter` | yes | **(B)** | Same |
| `search-store.ts:1272` | `_findAndFocusImage` (locate image) | `searchAfter` | yes | **(B)** | Sort-around-focus in AI mode is handled by `sortAroundFocusGeneration` increment, not this function |
| `search-store.ts:1291` | `_findAndFocusImage` (neighbour batch) | `searchAfter` | yes | **(B)** | Same |
| `search-store.ts:1865` | `search()` — AI branch | `searchByAi` | yes (raw) | **(A)** | `searchByAi` calls `extractAiQuery` internally; already correct |
| `search-store.ts:1956` | `search()` — normal branch | `searchAfter` | yes | **(B)** | Only reached when `hasAiChip` is false |
| `search-store.ts:1966` | `search()` — normal branch | `countWithTickers` | yes | **(B)** | Same guard |
| `search-store.ts:2217` | `extendForward` | `searchAfter` | yes | **(B)** | Not triggered in AI mode |
| `search-store.ts:2364` | `extendBackward` | `searchAfter` | yes | **(B)** | Not triggered in AI mode |
| `search-store.ts:2564,2584,2614,`<br>`2639,2663,2680,2917,3015,3070,`<br>`3175,3215,3234,3245,3293` | `seek()` — multiple sub-paths (End-key, shallow, position-map, keyword, date, bidirectional backward) | `searchAfter` | yes | **(B)** | `seek()` deep threshold never reached with total ≤ 200; 15 distinct call sites, all same reason |
| `search-store.ts:3669` | `restoreAroundCursor` | `searchAfter` | yes | **(B)** | Back-nav cursor restore; in AI mode back-nav re-triggers `search()` which re-runs `searchByAi` |
| **`search-store.ts:3808`** | **`fetchAggregations`** | **`getAggregations`** | yes (`callParams = frozenParams(params)`) | **(C)** | **Called while AI mode is live.** Sidebar facets must be scoped to the 200 AI result IDs |
| **`search-store.ts:3809`** | **`fetchAggregations`** | **`getFilterAggregations`** | yes (`callParams`) | **(C)** | **Same** — deleted / under-quota filter counts must reflect AI result set |
| **`search-store.ts:3847`** | **`fetchExpandedAgg`** | **`getAggregations`** | yes (`frozenParams(params)`) | **(C)** | **Called while AI mode is live.** Expanded facet bucket counts must scope to AI IDs |

---

### Part 3 — Other `dataSource.*` callers outside search-store.ts

| file:line | function | adapter method | raw params? | bucket | notes |
|---|---|---|---|---|---|
| `collection-store.ts:140` | collection init | `getAggregations` | `{}` (empty object) | **(B)** | No query field; AI chip structurally impossible here |
| `typeahead-fields.ts:203` | typeahead field suggestions | `getAggregations` | yes (`adjustedParams` — field stripped from query) | **(B)** | Resolved: typeahead is world-scoped (strip alone sufficient). No ID-scoping. |
| `typeahead-fields.ts:376` | typeahead filter counts | `getFilterAggregations` | yes (`params`) | **(B)** | Same — world-scoped; strip alone sufficient |

---

### Summary counts

| Bucket | Count | Description |
|---|---|---|
| (A) Already correct | 2 | `searchByAi` in es-adapter + store |
| (B) buildQuery strip alone | 28 | All search / scroll / seek paths + typeahead; none reachable in AI mode OR correctly world-scoped |
| (C) Needs decorator | 5 | `getAggregations`×2 + `getFilterAggregations`×2 in es-adapter impl + `getAggregations`×1 in fetchExpandedAgg (store) |

> The 15 `seek()` hits are included in the 26 (B) count and grouped as one row
> for readability; they represent a single conceptual callsite.