# Collections — Architecture

> Permanent reference for how the collections feature works in Kupua.
> Phase 2 work; collection write-path (add/remove images, create/rename/delete
> nodes) is Phase 3+. Implementation history lives in
> [`../changelog.md`](../changelog.md) (15 May 2026 entry).
>
> Companion: [`../01 Research/enrichment-strategy.md §D`](../01%20Research/enrichment-strategy.md)
> for the full ES data model and sort mechanics.

---

## 1. What it is

A collapsible tree panel showing all Grid collections with subtree image counts.
Sits in the left panel (Browse panel) ABOVE Filters. Clicking a node injects
`collection:sport/football` into the CQL query, triggering a filtered search and
auto-switching the sort to `-dateAddedToCollection`. Read-only in Phase 2.

---

## 2. Key architecture decisions

1. **CQL-first.** Collections piggybacks on the existing query string — no new
   search-store field, no new URL param. `collection:pathId` in `?query=` is the
   only state representation. URL round-trip is automatic; pasting
   `?query=collection:sport/football` into a fresh tab works.

2. **Tree source = collections service** (`VITE_COLLECTIONS_URL`). Returns a
   pre-nested tree; no client-side tree builder needed. Direct fetch with
   `credentials: "include"` (panda auth). No Vite proxy — CORS allowlisted
   server-side.

3. **Counts = unfiltered ES agg.** Terms agg on `collections.pathId` (size 6000,
   covers PROD's 5,350+ unique values). Run against empty `SearchParams` — counts
   represent "images in collection X" globally, not scoped to the current search.
   Fired once at boot alongside the tree fetch.

4. **Subtree counts via pathId-splitting** (not tree walk). Splits each pathId on
   `/` to generate ancestor prefixes — mirrors ES's `hierarchyAnalyzer`
   tokenization. Handles orphaned subcollections (present in ES but missing from
   the service tree). Trade-off: ~4% overcount when docs belong to multiple sibling
   subcollections (negligible on PROD).

5. **Auto-sort is atomic.** When a `collection:` chip appears/disappears, the sort
   change is merged into the same `navigate()` call (in `useUpdateSearchParams()`)
   → single URL update → single `search()` call. Eliminates the two-search race
   that the previous reactive-effect approach caused. Module-scope
   `_preSortBeforeCollection` remembers the pre-collection sort for revert.

6. **`dateAddedToCollection` sort works globally** — not restricted to collection
   context. Images without any collection membership have `missing: "_last"` and
   land in the null zone. The scrubber tooltip, ticks, and null-zone boundary all
   work via the standard distribution infrastructure.

7. **Graceful absence.** Tree fetch failure → `status: 'absent'` → Collections
   section hidden entirely. Not an error condition. Ensures kupua works without
   port 9010 tunneled or without network access to the collections service.

8. **Exclusive filtering.** Only one collection filter active at a time (Kahuna
   parity). Clicking a new node replaces any existing `collection:` term.
   Clicking the active node is a no-op.

---

## 3. Data flow

```
┌─────────────────────┐    ┌──────────────────────┐
│ Collections service │    │ Elasticsearch        │
│ GET /collections    │    │ terms agg on         │
│ (pre-nested tree)   │    │ collections.pathId   │
└────────┬────────────┘    └──────────┬───────────┘
         │                            │
         └──────────┐    ┌────────────┘
                    ▼    ▼
         ┌────────────────────────┐
         │ collection-store.ts    │
         │ (Zustand + persist)    │
         │ tree + counts + status │
         └───────────┬────────────┘
                     │
         ┌───────────┴───────────────────────┐
         ▼                                   ▼
┌──────────────────┐              ┌────────────────────┐
│ CollectionTree   │              │ ImageGrid          │
│ (left panel)     │              │ (badge colours via │
│ click → CQL edit │              │  buildColourMap)   │
└────────┬─────────┘              └────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│ useUpdateSearchParams()  (useUrlSearchSync.ts)       │
│ • Detects collection chip appearing/disappearing     │
│ • Atomically adjusts sort in same navigate() call    │
│ • Module-scope _preSortBeforeCollection for revert   │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ URL (?query=, ?orderBy=)   │
│ → search-store.search()    │
└────────────────────────────┘
```

---

## 4. Store shape (`collection-store.ts`)

```ts
interface CollectionStoreState {
  tree: CollectionNode | null;
  counts: Record<string, number>;  // pathId → subtree count
  status: "idle" | "loading" | "ready" | "absent";
  loadCollections(): Promise<void>;
}
```

Persisted to `sessionStorage` (survives reload, not cross-tab). Status resets to
`"idle"` on reload so `loadCollections()` fires again with fresh counts.

**Boot:** `useCollectionStore.getState().loadCollections()` in `main.tsx`
(fire-and-forget, same pattern as `fetchQuotas()`).

**Pure exports:**
- `buildColourMap(root)` — pathId → cssColour map for grid cell badge colours.
- `buildSubtreeCounts(directCounts)` — pathId-splitting subtree accumulator.

---

## 5. CollectionNode type

```ts
interface CollectionNode {
  uri: string;
  data: {
    basename: string;
    children: CollectionNode[];
    fullPath: string[];
    cssColour?: string;           // optional hex, e.g. "#e84c4c"
    data?: {                      // OPTIONAL — some nodes lack inner data
      path: string[];
      pathId: string;             // "sport/football" — canonical ES key
      description: string;
      actionData: { author: string; date: string };
    };
  };
  links: unknown[];
  actions: unknown[];
}
```

**Critical invariant:** Always null-check `node.data.data?.pathId`. Nodes without
inner `data` exist in both TEST and PROD (e.g. "Travel/Web"). These nodes are
non-clickable (no filter action) but visible in the tree.

**API response shape:** The collections service returns
`{ data: { basename: "root", children: [...] }, actions: [...] }` — the root is a
bare object, not a full CollectionNode. `fetchCollectionTree()` synthesises a proper
root wrapper so consumers see a uniform `CollectionNode` at every level.

---

## 6. CQL integration

**ES query path:** `collection:pathId` → `cql.ts` maps to
`term: { "collections.pathHierarchy": value.toLowerCase() }`. The
`hierarchyAnalyzer` on that field uses a `path_hierarchy` tokenizer + `lowercase`
filter at index time. `term` queries are not analysed, so the value must arrive
pre-lowercased. Tree-sourced pathIds are already lowercase; the `.toLowerCase()` is
defensive against hypothetical manual input.

**CQL shorthand:** `~` is registered as a shorthand for `collection:` in the parser
(same pattern as `#` → `label:`). Both forms are interchangeable. The canonical
representation in the query bar is `collection:pathId` (the `~` is expanded).

**Query string manipulation:** `cql-query-edit.ts` provides AST-based helpers:
- `findFieldTerm(query, key, value)` — structural match (no false positives from
  partial overlaps like `credit:Getty` inside `credit:GettyImages`).
- `upsertFieldTerm(query, key, value, negated)` — splice into query by AST position.
- `removeAllFieldTerms(query, key)` — strip all terms for a given field key.

---

## 7. Auto-sort mechanism

**Location:** `useUrlSearchSync.ts`, inside `useUpdateSearchParams()` callback.

**Logic:** Before `navigate()` fires, the callback inspects the previous and next
query strings for `collection:` presence (via `/(?:^|\s)collection:/` regex):

| Prev has `collection:` | Next has `collection:` | Action |
|---|---|---|
| No | Yes | Remember `orderBy` in `_preSortBeforeCollection`; set `orderBy = -dateAddedToCollection` |
| Yes | No | If `orderBy === -dateAddedToCollection`, revert to `_preSortBeforeCollection` |
| Yes | Yes | No action (chip replaced, sort stays) |
| No | No | No action |

**Guard:** If `orderBy` is already `-dateAddedToCollection` when the chip appears
(e.g. back-navigation to a URL with both), the current sort is NOT captured as the
revert target — that would lock in the collection sort as the fallback. Leaving
`_preSortBeforeCollection` as-is means revert falls back to default sort.

**User override respected:** If the user manually changes sort while viewing a
collection (sort ≠ `-dateAddedToCollection`), chip removal does not revert (the
`if (merged.orderBy === COLLECTION_SORT)` guard skips).

---

## 8. `dateAddedToCollection` sort — ES mechanics

**Sort clause** (`sort-builders.ts`):
```ts
[
  { "collections.actionData.date": { order: dir, missing: "_last" } },
  { uploadTime: dir },
  { id: "asc" },
]
```

- `missing: "_last"` — images with no collection membership sort at the end
  regardless of direction.
- `uploadTime` secondary — enables null-zone pagination (images without collection
  dates still have an uploadTime for deterministic `search_after` ordering).
- `id` tiebreaker — standard.

**Null zone:** Images without any `collections.actionData.date` form the null zone.
The existing null-zone infrastructure (`detectNullZoneCursor`, `remapNullZoneSortValues`,
`fetchNullZoneDistribution`) handles this generically — no collection-specific code
needed.

**Scrubber integration:**
- `DATE_SORT_ES_FIELDS["dateAddedToCollection"] = "collections.actionData.date"` →
  distribution fetch fires, ticks render, tooltip shows formatted dates.
- `NULL_ZONE_LABEL_OVERRIDES["dateAddedToCollection"] = "collection date"` → boundary
  mark reads "No collection date".
- `SORT_LABEL_MAP.dateAddedToCollection` accessor: reads max `actionData.date` across
  all collection memberships (matches ES sort behaviour for non-nested objects).

**`parseSortField` and `reverseSortClause`:** Both handle the object-form clause
`{ order, missing }` in addition to bare string values. Required because this is the
only sort field currently using explicit `missing`.

---

## 9. CollectionTree component

**Renders when** `status === 'ready'`. Returns `null` when `status === 'absent'`.
Shows "Loading collections…" during `'idle'` / `'loading'`.

**Visual spec (each node row):**

```
┌─┬────┬──────────────────────────────────┬──────┐
│▌│ ▼  │ Collection name                  │ 1.2k │
└─┴────┴──────────────────────────────────┴──────┘
  ▲  ▲                                      ▲
  │  │                                      └─ subtree count (formatCount)
  │  └─ chevron (parent) or spacer (leaf)
  └─ colour stripe (5px, cssColour or transparent)
```

- **Row height:** `h-8` (32px) — uniform, required for sticky offset maths.
- **Click target:** Entire row div (not just the text span). `cursor-pointer` when
  `pathId` is non-null.
- **Active row:** Opaque `color-mix(accent 20%, grid-bg)` background.
- **Node text:** `<span>` with `overflow-clip text-ellipsis whitespace-nowrap`
  (not `truncate` — `overflow: hidden` creates a scroll port that traps wheel events).
- **Expand state:** Local `useState<Set<string>>`, collapsed by default, not persisted.

**Sticky rows:** Depth-0 expanded nodes get `position: sticky; top: 0; z-index: 20`.
Background is opaque (prevents scrolled content showing through). Hover state uses
four-state className logic with `color-mix()` arbitrary values.

**Depth-0 only** for v1. Full-depth sticky stacking (depth × 32px offset) is
designed but not needed until users report orientation loss in deep trees.

---

## 10. Image display

**Grid cell badges** (`ImageGrid.tsx`):
- Collection leaf name (`path.at(-1)`) rendered as a coloured pill in the label strip.
- Colour: looked up from `buildColourMap(tree)` (computed once via `useMemo`).
  Fallback: `#555` (Kahuna's default for colourless collections).
- Tooltip: full breadcrumb path (`path.join(' ▸ ')`).
- Hover: `brightness-125` filter (works on any inline background colour).

**Detail panel** (`field-registry.tsx`):
- `detailGroup: "collections"` — own section with divider above labels.
- `detailListStyle: "links"` — renders as stacked clickable `ValueLink` items
  (full breadcrumb path, one per line), not pills. Click injects `collection:pathId`.
- `detailItemLabel` maps each pathId to a breadcrumb string for display.

**Multi-image reconciliation:**
- `multiSelectBehaviour: "chip-array"` — same reconciliation as labels.
- `pillVariant: "default"` (neutral grey, not accent-blue) — collections have their
  own colour identity from the tree.

**Cell date line** (`getCellDateLine` in `ImageGrid.tsx`):
- `dateAddedToCollection` sort: shows `Added: [date]` using max `actionData.date`
  across all memberships (matches ES sort order). No per-collection scoping — see
  §12 for rationale.

---

## 11. Typeahead / autocomplete

`typeahead-fields.ts` has a `collection` resolver that reads from
`useCollectionStore.getState()`. When the tree is ready, it flattens all pathIds via
`flattenCollectionPathIds()` and filters by typed value. No ES call needed.

---

## 12. Explicit non-goals and deferred work (Phase 2)

- **Write path** (add/remove from collection, create/rename/delete nodes) — Phase 3+.
- **Dual counts** (global + in-current-search, like `Getty (31/47)`) — worth
  user-testing demand first.
- **Per-collection date on cells** — only differs from max-date when image belongs to
  multiple collections AND the filtered one isn't the most recent. For parent-level
  filters (e.g. `~sport` matching images in `sport/football`), there's no direct
  `sport` entry in `image.collections` anyway. Not worth the complexity.
- **Cmd/Ctrl-A in collection** — same concerns as general select-all (scale).
- **Multiple simultaneous collection filters** — Kahuna doesn't support this; excluded.
- **Port 9010 SSH tunnel** — graceful-absence covers absence; add tunnel when needed.
- **Full-depth sticky stacking** — designed (depth × 32px, z-index 20 - depth),
  not implemented. Depth-0 only for now.

---

## 13. PROD scale context

- 5,341 nodes, 5,320 with pathId, max depth 7, median ~4.
- ~20,526 hierarchy tokens (from pathId splitting).
- 33 root sections.
- All design decisions made with this in mind, not the sparse TEST tree.

---

## 14. Files

| File | Role |
|------|------|
| `src/stores/collection-store.ts` | Zustand store: tree, counts, status, boot |
| `src/stores/collection-store.test.ts` | Unit tests (subtree counts, colour map) |
| `src/components/CollectionTree.tsx` | Tree UI, click handler, expand/collapse |
| `src/hooks/useUrlSearchSync.ts` | Auto-sort logic (module-scope state) |
| `src/dal/adapters/elasticsearch/cql.ts` | `collection:` → ES `term` query |
| `src/dal/adapters/elasticsearch/cql-query-edit.ts` | AST-based query manipulation |
| `src/dal/adapters/elasticsearch/sort-builders.ts` | `dateAddedToCollection` clause |
| `src/lib/sort-context.ts` | Scrubber distribution + null-zone label |
| `src/lib/field-registry.tsx` | `collections` field def + sort dropdown entry |
| `src/lib/typeahead-fields.ts` | Collection autocomplete resolver |
| `src/lib/format-count.ts` | Shared count formatter |
| `src/main.tsx` | Boot: `loadCollections()` call |
| `e2e/local/collections.spec.ts` | Playwright e2e tests (8 tests) |
