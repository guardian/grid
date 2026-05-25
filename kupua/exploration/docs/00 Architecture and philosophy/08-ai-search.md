# AI Search — Semantic Image Retrieval Without a Mode

> **Audience:** Staff Engineers reviewing the approach, future agents, and
> anyone inheriting this codebase.
>
> **§0–§2** are accessible to anyone familiar with web UIs.
> **§3–§6** require understanding of Elasticsearch, the kupua DAL, and the
> search store's buffer architecture.
> **§7** is honest about the parts that aren't as clean as they should be.

---

## §0 Why This Architecture Exists

Kupua supports semantic image search backed by an image-embedding model
(Cohere Embed V4, 256 dimensions, stored at `embedding.cohereEmbedV4.image`
on every indexed image). The user types a natural-language description —
"tigers in snow", "moody outdoor portraits at sunset" — and gets back the
~200 visually closest images ranked by cosine similarity.

The same capability exists in kahuna. The difference is in shape:

| | kahuna | kupua |
|---|---|---|
| AI is | a **mode** the user toggles into | a **chip** added to the search |
| Filter chips when AI is on | disabled, UI removed | composed as KNN pre-filters |
| Sort options when AI is on | locked to relevance | all sorts available (client-side) |
| Tickers, "is:" filters, counts | not shown | shown, scoped to the AI result set |
| Free-text BM25 when AI is on | mutually exclusive | becomes a pre-filter inside the KNN query |

This is the central design principle: **AI is not a mode.** A user typing
"tigers in snow" while a `credit:PA` chip is active expects to get
PA-credited tigers in snow, not to lose their filters. A user changing
sort from Relevance to "newest first" expects the same 200 results
re-ordered, not a new search.

The cost of this principle is most of the complexity in this document.
A separate AI mode is structurally simpler — different UI, different code
path, no integration. Composing AI search with every other feature means
every other feature has to keep working when the result set is a
fixed ≤200 IDs ranked by something other than a re-runnable query.

---

## §1 The Pipeline

```
 User types in the AI box        ┌─────────────────────────┐
   │                              │  Browser (Kupua SPA)    │
   │  URL: ?query=credit:PA       │                         │
   │       &aiQuery=tigers in snow│                         │
   ▼                              │                         │
 ┌────────────────────────┐       │  Store sees aiQuery     │
 │ Vite dev middleware    │       │  → DAL.searchByAi()     │
 │ /bedrock/embed         │◄──────┤                         │
 │                        │       │  1. text → embedding    │
 │ → AWS Bedrock          │       │  2. KNN + pre-filter    │
 │   Cohere Embed V4      │       │  3. ≤200 hits           │
 │   256-dim float vector │       │                         │
 └──────────┬─────────────┘       │                         │
            │  vector             │                         │
            ▼                     │                         │
 ┌────────────────────────┐       │                         │
 │ Vite proxy /es         │◄──────┤  Decorate aggregation   │
 │                        │       │  params with result IDs │
 │ → Elasticsearch        │       │  → tickers/filters scope│
 │   knn query with       │       │    to those 200 hits    │
 │   knn.filter = the     │       │                         │
 │   rest of the search   │       │                         │
 └────────────────────────┘       └─────────────────────────┘
```

Three independent components:

1. **Embedding service** — converts query text to a 256-dim float vector.
   Runs as Vite dev middleware in `scripts/bedrock-embed-proxy.mjs`. Talks
   to AWS Bedrock with the `media-service` profile. Graceful-absent: when
   credentials are missing the proxy reports `{available: false}` and the
   entire AI feature disappears from the UI.

2. **Vector search** — `searchByAi` on the DAL builds a single ES `_search`
   request. The shape depends on the `vecWeight` URL param (§3.1): pure
   KNN (default), pure BM25, or a hybrid blend of both. In all modes, the
   rest of the search (CQL chips, date range, free-text, syndication
   state) is composed as a pre-filter.

3. **In-memory result set** — the store treats the ≤200 returned hits as
   the entire result set. No PIT, no pagination, no polling. Every
   downstream feature (sort, tickers, filters, focus restoration) operates
   on this in-memory buffer.

---

## §2 URL Shape: `aiQuery` Is Its Own Param

```
?query=credit:PA &aiQuery=tigers in snow &nonFree=true &orderBy=-relevance
```

An optional `vecWeight` parameter controls hybrid blending (§3.1):

```
?aiQuery=tigers in snow &vecWeight=0.4
```

The AI query is a top-level URL parameter alongside `query`, `nonFree`,
`orderBy`, and the rest. It is not a chip inside the CQL `query=` string.

This is enforced everywhere: detection is `!!params.aiQuery`. There are no
regular expressions parsing AI text out of other strings. The CQL parser
never sees `aiQuery:`. The store branches on a single boolean. The DAL
reads one field.

The earlier instinct — encoding `aiQuery` as a CQL-style chip inside
`query=` for URL-truthfulness — failed in practice. Two structured
concepts in one flat string forced every consumer to regex-parse them
back out: the CQL string had to be stripped before parsing, present-checks
needed to handle both quoted and unquoted forms (CQL normalises single-word
values), and each bug added another regex variant in a different file.
Promoting it to its own param deleted ~170 lines of parsing logic across
five files. The URL is still readable; the AI input is in a separate
React widget anyway (§5), so the loss of "everything-in-one-string" was
imaginary.

**Consequence for routing:** [`search-params-schema.ts`](../../src/lib/search-params-schema.ts)
declares `aiQuery: z.string().optional()` and
`vecWeight: z.string().optional()`. TanStack Router provides typed
access throughout. The router and URL synchronisation layer
([`useUrlSearchSync.ts`](../../src/hooks/useUrlSearchSync.ts)) treat
`aiQuery` and `vecWeight` exactly like any other filter param.

---

## §3 The Result-Set Shape

### 3.1 vecWeight — Hybrid Blending

`searchByAi` supports three ranking modes controlled by the `vecWeight`
URL parameter (a float in [0, 1], default 1.0 when absent). This mirrors
Kahuna/media-api's hybrid search (PR #4738, merged 22 May 2026):

| `vecWeight` | Mode | ES query shape |
|---|---|---|
| 1.0 (default / absent) | Pure KNN | `knn` clause with `knn.filter` |
| 0.0 | Pure BM25 | `multi_match` on AI text, pre-filter in `bool.filter` |
| 0 < w < 1 | Hybrid | Probe query for `max_score`, then `bool.should[multi_match(boost), knn]` |

**Hybrid path detail:**

1. **Probe:** A `size:0` BM25 `multi_match` query fires against the AI
   text to discover the maximum BM25 score for this query. One extra ES
   round-trip (~30-50ms). Not cached — `max_score` depends on index state.
2. **Normalisation:** KNN scores are cosine similarity in [0, 1]. BM25
   scores are unbounded. The probe's `max_score` is used as a scaling
   factor: `scalingFactor = 1 / maxScore`.
3. **Boost math:** `multiMatchBoost = ((1 - vecWeight) / vecWeight) * scalingFactor`.
   This brings BM25 into roughly [0, 1] so the `vecWeight` ratio
   genuinely controls the blend.
4. **Main query:** `bool { should: [multi_match(boost: multiMatchBoost), knn], filter: [preFilter] }`.

The pre-filter (CQL chips, dates, etc.) applies in all three modes.
The Bedrock embedding call is skipped entirely when `vecWeight=0`
(pure BM25 — no vector needed).

`vecWeight` is URL-only with no UI control. Users manually type
`&vecWeight=0.4` to experiment. The default (1.0) preserves the
pre-existing pure-KNN behaviour — identical to before this feature
was added.

### 3.2 Result shape

ES returns a ranked list of at most `k=200` hits, scored by cosine
similarity (pure KNN), BM25 (pure lexical), or a blend of both
(hybrid). The DAL's
[`searchByAi`](../../src/dal/es-adapter.ts) maps this into a
`SearchAfterResult` with three load-bearing properties:

```typescript
{
  hits,                          // Image[] (≤200), with __aiScore attached
  total: hits.length,            // KEY INVARIANT — equals buffer size
  sortValues: synthetic,         // [k - i, img.id] — never used for ES pagination
  pitId: null,                   // no PIT to manage
}
```

The store treats this exactly like the first page of a normal search:
results are placed at `bufferOffset: 0`, `imagePositions` is rebuilt,
cursors are recorded. The branch is not a parallel code path — it is
the normal store path with three things suppressed:

| Normal search does | AI branch suppresses by |
|---|---|
| Open a PIT for cursor stability | Returns `pitId: null`; store sees null and never calls `openPit` |
| Trigger extend/seek when the user scrolls past edges | `bufferOffset + results.length >= total` already short-circuits; with `total === hits.length` this is true from the start |
| Fetch a position map for >1k results | The position-map fetch is gated on total > 1000 |
| Start a new-images poll for "n new images since you searched" | Skipped in the AI branch — relevance ranking doesn't change as new images upload |
| Use `sortValues` from the last hit as a `search_after` cursor | Synthetic `[k - i, img.id]` values would produce zero hits if fed back to ES; protected only by the `total === hits.length` invariant making the call impossible |

The synthetic sort values are the architectural weak point. They exist so
the store's cursor-shaped API doesn't have to special-case AI results;
they survive the round-trip into `imagePositions` and out the other side
into Back-navigation restoration without anyone noticing. They are safe
only as long as the `total === hits.length` invariant holds. If a future
feature changes the buffer architecture to mix "re-runnable query" results
with "fixed ID set" results, the synthetic cursors leak into real ES calls
and silently return zero hits. §7 records this as the trigger condition
for the SearchContext refactor.

**The `__aiScore` field.** Each hit carries a kupua-internal `__aiScore`
field (cosine similarity in `[0, 1]`, double-underscore = not from ES
`_source`). The store does not use it for routing; it is consumed only
by `resortAiBuffer` (§4) when the user picks Relevance.

---

## §4 Sort Handling — Auto-Switch and In-Memory Re-Sort

When AI is active, sort options compose naturally:

- A virtual **Relevance** option is prepended to the sort dropdown
  ([`SearchFilters.tsx`](../../src/components/SearchFilters.tsx),
  `SortControls`). It maps to the URL value `-relevance`.
- All other sort options remain available — uploadTime, dateTaken, etc.
- The default-sort indicator dot tracks `-relevance` as the default when
  AI is active, `-uploadTime` otherwise.

Two coordinated mechanisms make this work:

### 4.1 Auto-switch with revert

[`useUrlSearchSync.ts`](../../src/hooks/useUrlSearchSync.ts) maintains a
module-level `_preSortBeforeAi` mirroring the existing
`_preSortBeforeCollection` pattern. When `aiQuery` appears in a navigation:

1. If the user's current sort isn't already `-relevance`, save it and
   force the sort to `-relevance`.
2. When `aiQuery` later disappears, if the sort is still `-relevance`,
   revert to whatever was saved.

The user never has to remember to set or unset Relevance. Sorts they
chose manually while AI is active are preserved across the AI removal.

### 4.2 Client-side re-sort, no ES round-trip

Switching sort while AI is active is a *sort-only URL change* in the
existing taxonomy. [`useUrlSearchSync.ts`](../../src/hooks/useUrlSearchSync.ts)
short-circuits this case:

```typescript
if (isSortOnly && !!searchOnly.aiQuery) {
  useSearchStore.getState().resortAiBuffer(searchOnly.orderBy ?? "-relevance");
  return; // skip the normal search() call
}
```

[`resortAiBuffer`](../../src/stores/search-store.ts) sorts the in-memory
`results` array by `__aiScore` (Relevance) or by a `_source` field
(uploadTime, dateTaken). No Bedrock call, no ES call. The virtualizer
re-renders from the same 200 images in a new order. Sorts on fields
that don't exist in `_source` are silently no-op (the dropdown only
exposes sortable fields, so this case isn't surfaced to the user).

---

## §5 UI Surface — A Separate Widget, Not a CQL Chip

[`AiSearchInput.tsx`](../../src/components/AiSearchInput.tsx) is an
expandable input that lives inside the search-bar border, between CQL
and the global clear button. It is a normal React component with normal
React state, not a CQL chip.

Key behaviours:

- **Gating.** The widget renders `null` when
  [`bedrockAvailable`](../../src/lib/grid-config.ts) is false. The
  `subscribeBedrockAvailable` mini-store lets the widget re-render once
  the startup health probe resolves.
- **Collapsed → expanded.** Sparkles toggle expands the input with
  content-aware width (auto-sized to typed text length, capped). Clicking
  sparkles while expanded stashes the text in module-level state and
  collapses. Clicking sparkles again restores the stashed text and
  expands. Inner ✕ clears the text without collapsing.
- **Local state decoupled from URL.** The input's own state is the source
  of truth for what the user sees while typing; debounced writes to the
  URL flow through `updateSearch({ aiQuery })`. A `selfCausedRef` flag
  prevents the URL-sync effect from clobbering keystrokes mid-typing.
- **Auto-collapse-when-empty.** Blurring an empty widget collapses it,
  so accidental clicks don't leave a permanent sparkles input in the bar.
- **Escape collapses and stashes.** Same as toggle-off.

### Why not a real CQL chip

A CQL chip approach was explored and abandoned for three independent
reasons, any one of which is fatal:

1. **Cursor placement is impossible.** CQL chips are atomic ProseMirror
   nodes — the caret cannot be placed inside a committed chip. Editing
   means deleting the chip and re-typing.
2. **Shadow-root styling fights the editor.** Tagging the AI chip with
   `data-ai-chip` via a `MutationObserver` on the CQL shadow root
   produced an observer-feedback loop with the editor's own
   `MutationObserver` (both observing, both mutating) and crashed the
   browser tab.
3. **No "composition mode" API.** CQL has no concept of a chip that's
   visually present but not yet committed. The chip either exists in
   editor state and affects the URL, or it doesn't — leaving no clean
   way to model "I'm typing my AI query."

A standalone widget loses CQL niceties (undo/redo continuity, Tab
navigation through chips) but gains the ability to actually be edited.
[`SearchBar.tsx`](../../src/components/SearchBar.tsx) is the only place
that knows about both the CQL editor and the AI widget; the two don't
talk to each other.

---

## §6 Aggregations, Tickers, Filters — Scoping to the Result Set

Tickers (GNM-owned, agency picks), the Filters panel (credit, supplier,
keywords aggregations), and "is:" filter counts (deleted, under-quota)
all run the same ES aggregation infrastructure as in normal search. When
AI is active they need to aggregate over **the 200 hits** rather than
over the full 9M-document corpus, otherwise the numbers reflect nothing
the user can see.

### 6.1 Mechanism: the decorator

[`src/lib/ai-search-params.ts`](../../src/lib/ai-search-params.ts)
exports a single helper:

```typescript
export function decorateParamsForAggregations(
  params: SearchParams,
  resultIds: readonly string[],
): SearchParams {
  if (!params.aiQuery) return params;
  return { ...params, ids: resultIds.join(",") };
}
```

The decorator is a no-op when `aiQuery` isn't set. When it is, it sets
`params.ids`, which `buildQuery` already translates into a
`{ terms: { id: [...] } }` clause — a mechanism that existed for
collection-scoped searches and other "give me exactly these IDs" cases.
ES then aggregates over exactly those documents.

### 6.2 Where it is wired

Three callsites in the store
([`search-store.ts`](../../src/stores/search-store.ts)) decorate before
calling the DAL:

- The AI branch fires `countWithTickers(decorated)` after results land,
  asynchronously, so tickers refresh once.
- `fetchAggregations` decorates its `callParams` before
  `getAggregations` + `getFilterAggregations`.
- `fetchExpandedAgg` decorates before fetching the larger top-N for an
  individual aggregation.

Every other caller of an aggregation method on the DAL is either
already-correct for AI (e.g. typeahead, which is intentionally
world-scoped) or unreachable in AI mode (extend/seek/poll, blocked by
the `total === hits.length` invariant). The audit lives in
`exploration/docs/zz Archive/ai-search-aggregation-problem.md`.

### 6.3 Why this is the wrong shape, and why it ships anyway

The decorator violates the "AI is not a mode" principle at the level of
discipline: every new aggregation call site must remember to call it.
The store still knows, at three places, that AI exists. The proper shape
is an opaque `SearchContext` returned by every search variant and
accepted by every aggregation method, with `searchByAi` returning a
`{ kind: "id-set", ids }` context and normal search returning a
`{ kind: "query", params }` context — so the type system prevents the
mistake instead of code review catching it. That design is documented
in `exploration/docs/zz Archive/ai-searchContext-future-abstraction.md` and the
AGENTS.md backlog blocks any second alternative-ranking algorithm on
implementing it.

For one algorithm, the decorator is the right size (~25 lines, three
call sites, one breadcrumb comment). For two, it would not be.

---

## §7 Focus, Back-Navigation, and Density Switching

The "Never Lost" principle (`02-focus-and-position-preservation.md`) is
upheld for AI search through one targeted addition: the AI branch
mirrors the `focusedInFirstPage` logic from the normal path under the
name `focusedInAiResults`. Because all results live in memory, the check
is a single `Array.some` over the 200 hits — no ES round-trip is needed.

| Scenario | Behaviour |
|---|---|
| AI search → click image → image detail → Back | If the focused image is in the 200 hits, focus is restored and the scroller jumps to it. If it isn't (rare — possible if the result set re-ranked between searches), the nearest-neighbour fallback handles it. |
| AI search → switch grid to table | Works as-is. Table is a density level on the same virtualizer; with `total === hits.length` we are inside Scroll Tier — kupua's simplest case. |
| Keyboard traversal within AI results | Works as-is. `useListNavigation` operates on the in-memory buffer via `useDataWindow`, which is pagination-agnostic. |
| AI chip removed while a result is focused | The standard `_findAndFocusImage` path re-locates the image in the full BM25 result set via the index-wide `ids` lookup. |

The implementation is in the AI branch of `search()`: it computes
`focusedInAiResults` before calling `set()`, then either bumps
`sortAroundFocusGeneration` (scroll-to-image) or `_scrollReset`
(scroll-to-top), matching exactly what the normal first-page path does.

---

## §8 Graceful Absence

Kupua is required to function with no AI capability at all — local Docker
setups have no AWS access, Playwright runs have no Bedrock, fresh clones
have no credentials. AI search must disappear cleanly in all of these.

| Layer | Behaviour when Bedrock is unavailable |
|---|---|
| `scripts/bedrock-embed-proxy.mjs` | `/bedrock/health` returns `{available: false}` after one info log. `/bedrock/embed` returns 503 with no error spam. No crash. |
| [`bedrock-proxy-client.ts`](../../src/lib/bedrock-proxy-client.ts) | `checkBedrockHealth()` never throws; any failure resolves to `false`. |
| `bedrockAvailable` global | Stays `false` (its initial value). `subscribeBedrockAvailable` listeners receive `false` once the probe resolves. |
| `AiSearchInput` | Renders `null` — no widget appears in the search bar. |
| If a 503 happens mid-session (creds expired during typing) | The AI branch's catch block surfaces a red toast: "AI search unavailable — Bedrock proxy returned an error. Remove the aiQuery chip or try again." The chip stays in the URL so the user can retry; it is not auto-removed. |

The startup probe is fire-and-forget in
[`main.tsx`](../../src/main.tsx) — kupua boots whether Bedrock answers
or not.

---

## §9 What Is Imperfect

Recorded here, not hidden:

1. **The decorator is a discipline-enforced abstraction.** Three places
   in the store know about AI aggregations. The principled fix is
   `SearchContext` (see `zz Archive/ai-searchContext-future-abstraction.md`); it is
   gated in AGENTS.md behind the arrival of a second alternative-ranking
   algorithm (image-to-image similarity, collection-based search). Until
   then the decorator stays.

2. **Synthetic `sortValues` are protected only by an invariant.**
   `[k - i, img.id]` is not a real ES cursor. It works because
   `total === hits.length` blocks every code path that would feed it
   back to ES. The same SearchContext refactor that retires the
   decorator also retires the synthetic cursors: an `{ kind: "id-set" }`
   context is type-incompatible with `search_after`, so the leak becomes
   a compile error.

3. **`__aiScore` is an optional field on the `Image` interface.** This
   muddies the type — `Image` is now "ES data, plus maybe a kupua hint".
   The pragmatic alternative (a `Map<imageId, number>` in the store) was
   rejected to avoid an indirection on every render of relevance-sorted
   results. SearchContext is the right time to extract a proper
   `RankingMetadata` field.

4. **The embed call is not cancellable mid-flight.** The `signal` passed
   into `searchByAi` is forwarded to the ES `_search` call but not to
   `getEmbedding`. A user typing fast can fire several `/bedrock/embed`
   requests; old ones complete and are discarded. Cost is wasted Bedrock
   tokens, not correctness. Threading `signal` through is ~5 lines when
   the cost matters.

5. **Production has no embedding service.** The Bedrock proxy is Vite
   dev middleware — it does not exist when kupua is built for
   deployment. A production AI search needs either a media-api
   `/embeddings/query` endpoint, a dedicated Lambda, or an edge
   function. None of those are built; the dev-time proxy validates the
   UX and the data path.

These are documented gaps, not unknowns. Each one has a known trigger
condition for being addressed.

---

## §10 File Map

| File | Role |
|---|---|
| [`scripts/bedrock-embed-proxy.mjs`](../../scripts/bedrock-embed-proxy.mjs) | Vite middleware: `/bedrock/health`, `/bedrock/embed`. AWS SDK + LRU cache. |
| [`src/lib/bedrock-proxy-client.ts`](../../src/lib/bedrock-proxy-client.ts) | Browser-side fetch wrappers, graceful-absent. |
| [`src/lib/grid-config.ts`](../../src/lib/grid-config.ts) | `bedrockAvailable` flag + subscriber. |
| [`src/components/AiSearchInput.tsx`](../../src/components/AiSearchInput.tsx) | The widget. |
| [`src/components/SearchBar.tsx`](../../src/components/SearchBar.tsx) | Reads/writes `aiQuery`, hosts the AI widget alongside CQL. |
| [`src/components/SearchFilters.tsx`](../../src/components/SearchFilters.tsx) | `SortControls` — prepends Relevance when AI is active. |
| [`src/lib/search-params-schema.ts`](../../src/lib/search-params-schema.ts) | `aiQuery: z.string().optional()`, `vecWeight: z.string().optional()`. |
| [`src/hooks/useUrlSearchSync.ts`](../../src/hooks/useUrlSearchSync.ts) | Auto-switch to/from Relevance; client-side re-sort short-circuit. |
| [`src/dal/types.ts`](../../src/dal/types.ts) | `searchByAi?` optional on `ImageDataSource`; `aiQuery?` on `SearchParams`. |
| [`src/dal/es-config.ts`](../../src/dal/es-config.ts) | `KNN_FIELD` (overridable via `VITE_ES_KNN_FIELD`). |
| [`src/dal/es-adapter.ts`](../../src/dal/es-adapter.ts) | `searchByAi`: text → embedding → KNN/hybrid/BM25 depending on `vecWeight` (§3.1). |
| [`src/lib/ai-search-params.ts`](../../src/lib/ai-search-params.ts) | The decorator. Single AI-detection point on the aggregation side. |
| [`src/stores/search-store.ts`](../../src/stores/search-store.ts) | AI branch in `search()`; `resortAiBuffer`; decorator calls in `fetchAggregations` / `fetchExpandedAgg`. |
| [`src/types/image.ts`](../../src/types/image.ts) | `__aiScore?: number` on `Image`. |
