# AI Search Workplan — Design & Implementation Plan

_Created 24 May 2026. Updated 24 May with design decisions from session; shadow DOM spike confirmed 24 May.
Companion to `ai-search-landscape.md`._

---

## 0. Constraints

1. **No secrets in code.** This is a public repo. No AWS account IDs, bucket names, model ARNs, hostnames, or credentials may be hardcoded. All infra details must be detected at runtime (e.g. sniffed from ES docs, environment variables, or config).
2. **Graceful absence.** Kupua MUST function without Bedrock, media-api, or TEST ES. The AI search feature is invisible/disabled when the Bedrock proxy is unavailable. No error toasts, no broken layouts.
3. **Read-only.** The Bedrock proxy only calls `InvokeModel` for text embedding. No writes to any datastore.
4. **Dev-only infrastructure.** The Bedrock proxy runs inside the Vite dev server (same as the S3 proxy). It is not part of a production deployment path. Production AI search will use a proper backend (media-api endpoint or equivalent) — that's a future concern.

---

## 0.1 Key Design Decisions (settled 24 May)

| Decision | Choice | Rationale |
|---|---|---|
| Pre-filter vs post-filter | **Pre-filter** | Post-filtering k=200 too lossy; k=2000+ too slow (~500ms+). Pre-filter failures self-correcting. Grid team converging on same (PR #4744). |
| vecWeight / hybrid blending | **Not in v1** | Pure KNN (vecWeight=1.0). Hybrid is Phase 2. UX for explaining a continuous blend is hard. |
| Debounce for AI queries | **Same as regular search** | Kupua's existing debounce rules apply. Kahuna also uses same 500ms debounce for AI and non-AI. In-memory cache prevents redundant Bedrock calls. |
| AI query representation | **CQL chip: `aiQuery:"..."`** | Embedded in the `query` CQL string, same as all other chips. URL: `?query=person:"Starmer" aiQuery:"in the snow" Liverpool`. Diverges from PR #4744 (which uses a separate `aiQuery` URL param) — see trade-off table below. |
| Store vs DAL orchestration | **New DAL intent method** (Option C) | Store branches once (`if aiQuery → dal.searchByAi()` else `dal.search()`). DAL handles Bedrock→KNN chain internally. Follows architecture principle: store expresses intent, DAL sequences work. |
| Filter reuse for knn.filter | **`buildQuery()` output used directly** | Existing `buildQuery(params)` returns `{ bool: { must, must_not, filter } }` — exactly the shape ES `knn.filter` accepts. No refactoring needed. |
| AWS profile | **`AWS_PROFILE ?? "media-service"`** | Same pattern as `s3-proxy.mjs`. Profile name already appears in start.sh, README, infra-safeguards.md. |
| Free-text + AI coexistence | **Free-text becomes `knn.filter` pre-constraint** | "Among images whose metadata matches 'Liverpool', find ones that look like 'city at dusk'." Biggest advantage over Kahuna (which forces either/or). |
| Sort in AI mode | **"Relevance" auto-selected + client-side re-sort** | All sort options remain available. Changing sort re-orders the ≤200 buffered results client-side (no re-query). Auto-switch pattern from collection sort (`_preSortBeforeAi`). |

### `aiQuery` as CQL chip vs separate URL param — trade-off record

We chose **CQL chip** (Option B). PR #4744 uses a **separate param** (Option A). Recording why:

| | CQL chip (`aiQuery:"in the snow"` inside `query=`) | Separate param (`&aiQuery=in the snow`) |
|---|---|---|
| URL truthfulness | ✅ URL reflects exactly what the search bar contains | ❌ Two params for one search bar — hidden second channel |
| Chip infrastructure reuse | ✅ Existing CQL parser/renderer handles it | ❌ Needs new plumbing for "thing in search bar that isn't in query string" |
| Shareability | ✅ One param holds full intent | ⚠️ Must remember to copy both params |
| Clearing the search bar | ✅ Clearing query= clears AI too | ❌ Could leave orphaned aiQuery param if only query= is cleared |
| CQL parser impact | ❌ Must extract `aiQuery:"..."` before/during parse (special case) | ✅ Parser unchanged |
| Semantic purity of CQL | ❌ Mixes "ES filter chips" with "trigger external service" | ✅ CQL = ES concerns only |
| Multiple AI chips? | ❌ Confusing — what does two `aiQuery:` chips mean? Must validate/reject | ✅ Naturally singular |
| Grid codebase convention | ❌ Diverges from PR #4744 and media-api's separate-param pattern | ✅ Matches existing Grid patterns |
| Jonathon's suggestion | ✅ He proposed `looks-like:"city at dusk"` chip on PR #4744 | — |

**Decision: CQL chip.** The "URL truthfully reflects the search bar" argument wins for Kupua's single-bar UX. The parsing cost is ~5 lines of preprocessing (extract `aiQuery:"..."` before passing to `parseCql`). If Grid standardises on a separate param later, the CQL→URL serialisation is the only thing that changes.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Browser (Kupua SPA)                                    │
│                                                         │
│  URL: ?query=person:"Starmer" aiQuery:"snow" Liverpool  │
│                                                         │
│  SearchStore: if query contains aiQuery:"..."           │
│    → dal.searchByAi(params)                             │
│    else → dal.searchAfter(params)                       │
│                                                         │
│  DAL.searchByAi:                                        │
│    extract "snow" from aiQuery chip                     │
│    fetch /bedrock/embed?q=snow → get vector             │
│    preFilter = buildQuery(remaining CQL + URL params)   │
│    POST /es/_search with { knn: { ..., filter } }       │
└────────────┬──────────────────────────┬─────────────────┘
             │                          │
     ┌───────▼───────┐         ┌───────▼───────┐
     │ Vite Middleware│         │ Vite Proxy /es│
     │ /bedrock/embed│         │ (existing)    │
     └───────┬───────┘         └───────────────┘
             │
     ┌───────▼───────┐
     │ AWS Bedrock   │
     │ eu-west-1     │
     │ InvokeModel   │
     └───────────────┘
```

**Three independent capabilities that compose:**
- **Bedrock proxy** (Vite middleware) — text → 256-float vector
- **DAL intent method** (`searchByAi`) — orchestrates Bedrock call + filter extraction + KNN query
- **UI gating** — sparkles icon/chip only visible when Bedrock proxy responds to health check

**Separation of concerns:**
- Store makes one decision: AI or not? Then calls the appropriate DAL method.
- DAL handles all orchestration (Bedrock → vector → filter → KNN → ES).
- Store never touches vectors, never knows about Bedrock.
- Follows the architecture principle from `response-to-alexs-arch-suggestions.md`: "store expresses intent, DAL sequences work."

---

## 2. Component: Bedrock Embed Proxy (Vite Middleware)

### 2.1 Design

A Vite plugin (like `esProxyGuard`) that exposes:

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /bedrock/embed?q=<text>` | GET | Returns 256-float embedding for query text |
| `GET /bedrock/health` | GET | Returns 200 if Bedrock is reachable (for UI gating) |

**Response format** (`/bedrock/embed`):
```json
{
  "embedding": [0.123, -0.456, ...],  // number[256]
  "dimension": 256,
  "cached": true
}
```

**Response format** (`/bedrock/health`):
```json
{ "available": true }
```

### 2.2 Behaviour

- Uses `@aws-sdk/client-bedrock-runtime` + `fromIni({ profile })`. Profile from `AWS_PROFILE` env var, falling back to `"media-service"` — same pattern as `s3-proxy.mjs` line 40: `const AWS_PROFILE = process.env.AWS_PROFILE ?? "media-service"`.
- Region from `AWS_REGION` env var (set by `start.sh`, falling back to `"eu-west-1"`).
- Model ID from env var `KUPUA_BEDROCK_MODEL_ID` (default: `global.cohere.embed-v4:0` — this is a public model identifier, not a secret).
- **In-memory LRU cache** (Map, max ~200 entries keyed by `query.trim().toLowerCase()`). Prevents redundant Bedrock calls during a dev session.
- **Graceful failure**: if credentials are missing/expired or Bedrock is unreachable, `/bedrock/health` returns `{ "available": false }` and `/bedrock/embed` returns 503. No crash, no error spam.
- **Request validation**: rejects empty queries, queries > 2048 chars. Returns 400.
- **No writes**: only `InvokeModel` is called. The proxy has no S3/ES/SQS access.

### 2.3 Safety

- Credentials stay server-side (Vite process). Never sent to browser.
- AI chip uses same debounce rules as regular Kupua search — no special submit gate. The in-memory cache prevents redundant Bedrock calls when debounce fires on the same (or similar) text.
- Rate limiting not needed for single-developer dev server.

### 2.4 Startup

- `start.sh --use-TEST` already validates AWS creds. The Bedrock proxy piggybacks on this.
- In local-docker mode (no `--use-TEST`): Bedrock proxy simply doesn't start (no creds available). `/bedrock/health` returns `{ "available": false }`.
- In `--use-TEST` mode: proxy starts if creds are valid. If Bedrock `InvokeModel` fails on first health probe, logs a warning and marks unavailable.

---

## 3. Component: ES KNN Query Builder

### 3.1 Design

A new `searchByAi` intent method in the DAL. The store calls it when the CQL string contains an `aiQuery:"..."` chip.

**CQL extraction step:**
```
URL: ?query=person:"Keir Starmer" aiQuery:"in the snow" Liverpool

Before parsing:
  1. Extract aiQuery:"in the snow" from the CQL string
  2. Pass remainder (person:"Keir Starmer" Liverpool) to parseCql()
  3. parseCql() sees only normal chips + free-text → produces must/mustNot as usual
```

This extraction is ~5 lines of preprocessing. The CQL parser itself is unchanged.

**DAL flow:**
```
searchByAi(params: SearchParams):
  1. Extract aiQuery text from params.query CQL string
  2. Call /bedrock/embed?q=<aiQuery text> → get embedding (number[256])
  3. Strip aiQuery chip from params.query, then:
     preFilter = buildQuery(paramsWithoutAiChip)  ← EXISTING function, unchanged
  4. Build KNN query body:
     {
       knn: {
         field: "embedding.cohereEmbedV4.image",
         query_vector: embedding,
         k: 200,
         num_candidates: 400,
         filter: preFilter            ← the whole bool clause
       },
       _source: { includes: SOURCE_INCLUDES, excludes: SOURCE_EXCLUDES }
     }
  5. POST to /es/{index}/_search → parse hits → return SearchResult
```

**Why `buildQuery` output works directly as `knn.filter`:**

`buildQuery(params)` returns `{ bool: { must: [...], must_not: [...], filter: [...] } }` — a standard ES query clause. ES's `knn.filter` accepts any query clause. So the entire output slots in unchanged:

- CQL free-text ("Liverpool") → `must: [multi_match]` → pre-filters KNN candidates by metadata match
- CQL chips (`person:"Biden"`) → `must: [match_phrase]` → pre-filters by structured field
- Negated chips (`-by:"Foo"`) → `must_not: [match_phrase]` → excludes from candidates
- Date ranges, uploadedBy, free-to-use → `filter: [range, term]` → pre-filters by structured params
- No other chips at all → `{ match_all: {} }` → unfiltered KNN (harmless, could be omitted)

No refactoring of `buildQuery` needed. It already produces the right shape.

**Store-side change** (minimal):
```typescript
// In search() action, approximately:
const hasAiChip = /aiQuery:"[^"]+"/.test(params.query ?? '');
if (hasAiChip) {
  result = await dataSource.searchByAi(params);
} else {
  result = await dataSource.searchAfter(params, null, ...);
}
```

### 3.2 Pre-filtering (v1 decision)

Kupua threads the active filter state INTO the KNN query as a **pre-filter**. The ES `knn.filter` clause means "find the k nearest vectors AMONG documents that match these filters."

**Why pre-filter, not post-filter:**
- Post-filtering k=200 results is too lossy — if 180 don't match your filters, you get 20 results that aren't even the best 20 (just whatever landed in the global top-200).
- Increasing k to make post-filtering viable (k=2000+) adds ~500ms+ latency for marginal benefit, and results beyond ~200 are semantically weak anyway.
- Pre-filter failures are obvious and self-correcting: "weird results" → user removes a filter → better results.
- Pure discovery (no filters, just vibes) still works: pre-filter with zero filters = unfiltered KNN.
- See discussion on PR #4744 — Grid team independently converging on same architecture.

**Trade-off acknowledged:** pre-filtering cannot surface images that lack metadata matching the filter chips. An image with no `person` tag won't appear in a `person:"Starmer"` + AI:"snow" query even if it visually shows Starmer in snow. This is acceptable for v1; the discovery use case (no filters) still covers it.

### 3.3 No vecWeight / hybrid blending in v1


Pure KNN only (effectively vecWeight=1.0). No probe query, no BM25+KNN fusion.

Hybrid blending (Phase 2) adds complexity and the UX for explaining a continuous blend between two scoring algorithms is genuinely hard. Start with what users already know from Kahuna's AI mode: semantic results, ranked by similarity.

### 3.4 Free-text BM25 coexists with AI

The AI chip is one chip among many. Other search input (free-text typed without a chip prefix) still fires normal BM25 queries against `englishAnalysedCatchAll` etc.

**How they compose in v1:**
- AI chip present, no other chips → pure KNN (unfiltered)
- AI chip + structured chips (date, person, supplier) → KNN pre-filtered by those chips
- AI chip + free-text → free-text becomes a `match` clause in `knn.filter` (pre-filter by BM25 match). This means: "among images whose metadata matches 'Liverpool', find the ones that look like 'city at dusk'."
- No AI chip → normal BM25 search (unchanged from today)

This matches the behaviour in PR #4744 ("filters on the lexical, then ranks by KNN") and is the single biggest advantage over Kahuna, which forces an either/or choice.

### 3.5 Focus, traversal, and table switching in AI mode (verified by research)

Research into Kupua's existing focus/traversal machinery (May 2026) confirmed that **all three potentially-risky flows work as-is** with the `total === hits.length`, no-PIT shape of AI mode:

| Flow | Status | Why it works |
|---|---|---|
| Focus survives AI chip add/remove | Works as-is | `useUrlSearchSync` computes `focusPreserveId` on every param change ([useUrlSearchSync.ts:225](kupua/src/hooks/useUrlSearchSync.ts#L225)); `_findAndFocusImage` ([search-store.ts:1022](kupua/src/stores/search-store.ts#L1022)) re-locates the image via `ids` lookup + `countBefore`/`positionMap`. Query-agnostic. Falls back to nearest neighbour ([search-store.ts:1100](kupua/src/stores/search-store.ts#L1100)) if the focused image isn't in the new top-200. |
| Keyboard traversal within AI results | Works as-is | `useListNavigation` ([useListNavigation.ts:108](kupua/src/hooks/useListNavigation.ts#L108)) operates on the in-memory buffer via `useDataWindow`. Doesn't depend on pagination. |
| Switch grid → table while AI active | Works as-is | Table view is a density level on the same virtualizer; `extendForward` cleanly no-ops when `bufferOffset + results.length >= total` ([useDataWindow.ts:424](kupua/src/hooks/useDataWindow.ts#L424)). With total=200, we're inside Scroll Tier — Kupua's simplest case. |

**One precondition to verify in 1b:** the `ids` lookup used by `_findAndFocusImage` must work against the standard ES index (not a filtered subset) so it can locate the focused image when the user removes the AI chip and we transition back to BM25 with a 1.3M-result corpus. Research suggests this is already the case (the `ids` lookup is index-wide, not query-scoped), but the agent in 1b should confirm.

---

## 4. Component: UI — AI Search Chip

### 4.1 Gating

On app startup (or when config changes), Kupua calls `GET /bedrock/health`:
- `{ "available": true }` → show sparkles icon in search bar
- `{ "available": false }` or network error → hide sparkles icon entirely. No trace of AI in the UI.

### 4.2 Interaction

**Sparkles button is a toggle with memory:**

| State | Click sparkles | Effect |
|---|---|---|
| No AI chip, no stashed query | Creates `aiQuery:""` chip, focuses it for typing |
| No AI chip, stashed query exists | Restores `aiQuery:"<stashed>"` chip (re-fires AI search) |
| AI chip active | Stashes the chip text, removes chip from CQL (reverts to BM25) |

Clicking X on the chip itself (standard CQL chip delete) **permanently deletes** AND clears the stash. The toggle only stashes — it doesn't destroy the query.

Module-level state: `let _stashedAiQuery: string | null = null;`

**Flow (first use):**
1. User clicks sparkles → `aiQuery:""` chip appears, cql input focuses the value field
2. User types "moody outdoor portraits" — standard CQL chip editing
3. Debounce fires → Kupua extracts AI text, calls `/bedrock/embed?q=...` → vector → KNN query → results

**Flow (toggle off):**
4. User focuses an image in AI results
5. User clicks sparkles → stashes "moody outdoor portraits", removes chip from CQL
6. Search reverts to BM25 → focused image is located in its natural position (~100ms ES round-trip)

**Flow (toggle on):**
7. User clicks sparkles → restores `aiQuery:"moody outdoor portraits"` from stash
8. Bedrock cache hit (same text) → 0ms. ES KNN query fires (~100ms). Focused image re-located in AI results.

**Performance note:** toggle-on is near-instant thanks to the Bedrock embedding cache (no model invocation). The ES query still fires (~100ms). If this proves too slow in practice, a client-side result cache can be added later (cache the 200 results keyed by `aiQueryText + filterHash`, restore without network on toggle-on). Not in v1 — measure first.

**The AI chip IS a real CQL chip** — it participates fully in undo/redo, keyboard navigation, paste/clear, and all the cql library's niceties. Its only difference is **visual**: a distinct background colour and animated gradient border applied via shadow-DOM CSS injection. See §9.5 for the styling mechanism.

### 4.3 Coexistence with regular search

- AI chip is ONE chip among potentially many. Other chips (date, uploader, label, free-text) become **pre-filters** on the KNN query.
- Free-text (non-chip) input becomes a BM25 `match` clause inside `knn.filter` — it constrains which documents are KNN candidates.
- If AI chip is removed → back to normal BM25 search (unchanged).
- If AI chip is present but no other chips → pure unfiltered KNN.
- Sort selector: when AI chip is active, default sort is "Relevance" (KNN score). User can still switch to date sort (stretch — requires function_score decay).

### 4.4 Empty/error states

- Bedrock returns 503 **after** the chip was successfully created (mid-session credential expiry, transient AWS error) → emit a red error toast via the existing toast store: `addToast({ kind: "error", message: "AI search unavailable (Bedrock returned an error)" })` (see [src/stores/toast-store.ts](kupua/src/stores/toast-store.ts) and usage precedent in [src/hooks/useRangeSelection.ts:175](kupua/src/hooks/useRangeSelection.ts#L175)). The chip remains in the search bar; the user can remove it manually or retry. Do NOT auto-remove the chip on error — that would lose their typed query and confuse the URL state.
- Query returns 0 results → normal empty state, same as any other search.
- Image has no embedding → it won't appear in KNN results (ES skips docs without the vector field). Not an error.

---

## 5. Phasing

Phase 1 is split into **three sub-phases (1a, 1b, 1c)** sized for one agent session each (context window, not commit boundaries). The whole of Phase 1 lands as **one commit** at the end. Between sub-phases, the agent writes a worklog handoff so the next session can pick up cleanly.

### Phase 1a — Bedrock proxy + health check (foundation only)

Deliverable: `curl http://localhost:3000/bedrock/health` returns `{"available":true}` in `--use-TEST` mode and `{"available":false}` in local-docker mode. `curl 'http://localhost:3000/bedrock/embed?q=test'` returns a 256-float array. No UI, no DAL changes, no store changes yet.

- [ ] Add `@aws-sdk/client-bedrock-runtime` to deps
- [ ] Implement Vite plugin `bedrockEmbedProxy()` (§9.1 has exact Bedrock payload)
- [ ] In-memory LRU cache (max ~200 entries)
- [ ] Wire `/bedrock/health` check into app startup → `bedrockAvailable` flag in `grid-config.ts` (flag is set but nothing reads it yet)
- [ ] Manual verification: agent asks user to test both modes; agent does NOT attempt to start the dev server itself

**Handoff to 1b:** worklog must record: whether real Bedrock returned a vector successfully, model ID used, any AWS profile / region quirks encountered, the cache hit-rate observed.

### Phase 1b — DAL `searchByAi` + store branching (no UI)

Deliverable: pasting `?query=aiQuery:"snow"` into the URL triggers a KNN query and renders results. No sparkles icon yet — the only way to invoke AI is hand-edited URL. Lets us validate the data path independently of UI complexity.

- [ ] Add `searchByAi(params)` to DAL (extract aiQuery chip, call Bedrock, `buildQuery(remainder)` for filter, KNN query) — see §9.4 for extraction regex
- [ ] Store: branch on `aiQuery:"..."` present in `params.query` → call `searchByAi` (§9.2 has return shape, including `total === hits.length` invariant)
- [ ] Store: suppress PIT open, new-images poll when in AI mode
- [ ] Extract `_score` from KNN hits, store as `__aiScore` on Image
- [ ] Unit tests: query builder against fixed-vector mock (no AWS calls)
- [ ] Manual verification: agent asks user to paste a URL and confirm results render

**Handoff to 1c:** worklog must record: actual KNN response timings observed, any quirks with `buildQuery` output shape vs `knn.filter` expectations, whether focus/traversal/table-switch all worked as the research predicted (they should — see §3.5).

### Phase 1c — UI: sparkles button + AI chip styling + sort handling + Playwright

Deliverable: clickable sparkles icon (gated by `bedrockAvailable`), AI chip rendered as a real CQL chip with distinct styling (background + animated gradient border) via shadow-DOM CSS injection, sort auto-switches to Relevance on AI activation and reverts on removal, client-side re-sort works when user picks a different sort while AI is active.

- [ ] **Research first (~15 min, before writing any code):** grep `kupua/e2e/` for specs touching the search bar, sort dropdown, and URL query state. Specifically look for assertions on:
  - Sort dropdown contents / option count (adding `-relevance` may change these)
  - Search bar child element count / layout (adding sparkles button changes this)
  - URL after typing in the search bar / chip add/remove
  - Any helper utilities that select chips by index or count
  
  Produce a list of specs likely to need updates. Per AGENTS.md "do NOT weaken assertions without thinking" — update them deliberately as part of this commit, do not just let them fail and react. If any spec asserts behaviour that is *intentionally* changing, document the change. If any spec asserts behaviour that should NOT change, that's a regression — fix the code, not the spec.
- [x] **Spike (done, 24 May):** inspected `<cql-input>` shadow DOM — confirmed `<chip-wrapper>` is a stable custom element, queryable via `chip-key` textContent. MutationObserver approach is viable. See §9.5 for confirmed selectors. Fallback B is not needed.
- [ ] `SparklesButton.tsx` (sibling React component): writes `aiQuery:""` into the CQL string and focuses the cql input
- [ ] `ai-chip-styling.ts`: shadow-root `adoptedStyleSheets` injection + `MutationObserver` to tag chips with `data-ai-chip` (§9.5)
- [ ] Wire installation into `CqlSearchInput.tsx` mount/unmount lifecycle
- [ ] Sort: add `"-relevance"` option (§9.3), auto-switch via the existing `_preSortBeforeCollection` pattern at [useUrlSearchSync.ts:388-417](kupua/src/hooks/useUrlSearchSync.ts#L388-L417)
- [ ] Client-side re-sort: hook into the existing `isSortOnly` branch at [useUrlSearchSync.ts:173](kupua/src/hooks/useUrlSearchSync.ts#L173) — see §9.3 for the dispatch logic
- [ ] Bedrock error toast: wire `addToast({ kind: "error", ... })` on `/bedrock/embed` 503 (§4.4)
- [ ] Playwright: sparkles button visible/hidden per health, click → chip appears with `data-ai-chip` attribute set, results render, re-sort works, chip removal returns to BM25

### Phase 2: Hybrid search (BM25 + KNN blending)

- [ ] Probe query for maxBm25Score
- [ ] Build `bool.should` hybrid query
- [ ] Expose vecWeight as an advanced control (or just hardcode 0.7 for now)

### Phase 3: Image-to-image similarity ("More Like This")

- [ ] Fetch source image's embedding from ES `_source`
- [ ] KNN query with that vector + filter support
- [ ] UI: button on image detail → populates AI chip with image reference

### Phase 4: Collection-based semantic search

- [ ] Fetch embeddings for N selected images
- [ ] Average vectors → KNN query
- [ ] UI: "Find similar to selection" action on multi-select

---

## 6. File Plan

| File | Purpose | Change size |
|---|---|---|
| `vite.config.ts` | Register `bedrockEmbedProxy()` plugin in plugins array | ~5 lines (import + array entry) |
| `scripts/bedrock-embed-proxy.mjs` | New file: Vite plugin factory. Handles `/bedrock/embed` and `/bedrock/health`. Uses `fromIni`, `BedrockRuntimeClient`, `InvokeModelCommand`. In-memory LRU cache. Pattern: `s3-proxy.mjs`. | ~120 lines |
| `src/lib/bedrock-proxy-client.ts` | New file: browser-side client. `getEmbedding(query): Promise<number[]>`, `checkBedrockHealth(): Promise<boolean>`. Plain `fetch()` to `/bedrock/*`. | ~40 lines |
| `src/dal/es-adapter.ts` | Add `searchByAi(params)` method to `ElasticsearchDataSource`. Extracts `aiQuery:"..."` from CQL string, calls Bedrock, builds KNN body with `buildQuery(remainingParams)` as filter. | ~60 lines |
| `src/dal/types.ts` | Add `searchByAi` to `ImageDataSource` interface. No new SearchParams field needed — `aiQuery` lives inside `query` string. | ~3 lines |
| `src/lib/search-params-schema.ts` | No change needed — `aiQuery` is part of the `query` string, not a separate param. Verified May 2026: `query` is an opaque pass-through ([search-params-schema.ts:12](kupua/src/lib/search-params-schema.ts#L12)) and there is no chip-name allow-list at this layer. | 0 lines |
| `src/stores/search-store.ts` | In `search()` action: one `if (params.aiQuery?.trim())` branch calling `dataSource.searchByAi(params)`. | ~10 lines |
| `src/lib/grid-config.ts` | Add `bedrockAvailable: boolean` (set from health check at startup). | ~5 lines |
| `src/components/SearchBar/SparklesButton.tsx` | New file: sparkles icon button. Writes `aiQuery:""` into CQL string on click. Gated by `gridConfig.bedrockAvailable`. | ~30 lines |
| `src/components/SearchBar/ai-chip-styling.ts` | New file: `installAiChipStyling(cqlInputElement)` — shadow-root `adoptedStyleSheets` injection + `MutationObserver` tagging chips with `data-ai-chip`. Returns a teardown function. | ~50 lines + small CSS string |
| `src/components/CqlSearchInput.tsx` | Call `installAiChipStyling` after mount, tear down on unmount. | ~5 lines |

**Not changed:** `buildQuery()` — used as-is for KNN filter clause. `s3-proxy.mjs` — reference only.

---

## 7. Testing Strategy

- **Unit tests**: KNN query builder — verify `searchByAi` produces correct ES body with various filter combinations. Test cases: no filters (match_all as knn.filter), with date range, with CQL chips, with free-text, with negations. Pure function, no AWS calls — mock `bedrockProxyClient.getEmbedding()` to return a fixed vector.
- **Playwright**: mock `/bedrock/embed` at the Vite proxy level (return a fixed 256-float vector). Scenarios:
  - Sparkles icon appears when health check returns available
  - Sparkles icon hidden when health check returns unavailable
  - Type AI query → results render (against local ES with sample data that has embeddings)
  - AI chip + structured chip → results are subset of unfiltered AI results
  - Remove AI chip → back to normal BM25 results
- **Manual with real Bedrock**: `--use-TEST` mode, type a query, verify results make semantic sense.
- **Graceful absence**: test in local-docker mode (no `--use-TEST`) — sparkles icon must NOT appear, no console errors.

**Per AGENTS.md test directive:** Unit tests (`npm --prefix kupua test`) mandatory after any `src/` change. Playwright e2e (`npm --prefix kupua run test:e2e`) mandatory after component/hook/store changes. Stop dev server on :3000 before running Playwright.

---

## 7a. What "done" looks like (falsifiable success criteria)

Before declaring Phase 1 complete, every item below must be verified. Items marked **(ask user)** require the agent to ask the human to perform the check — the agent does not start dev servers or hit real AWS itself.

**Phase 1a:**
- [ ] **(ask user)** `curl http://localhost:3000/bedrock/health` returns `{"available":true}` in `--use-TEST` mode
- [ ] **(ask user)** `curl http://localhost:3000/bedrock/health` returns `{"available":false}` in local-docker mode (no AWS creds), with NO crash and NO error spam in the Vite logs
- [ ] **(ask user)** `curl 'http://localhost:3000/bedrock/embed?q=test'` returns a 256-float array in `--use-TEST` mode
- [ ] Second identical curl is served from cache (proxy logs show `cached: true`)

**Phase 1b:**
- [ ] Unit tests pass (`npm --prefix kupua test`)
- [ ] **(ask user)** Pasting `?query=aiQuery:"snow"` returns results that render in the grid
- [ ] Network tab (user inspection): no PIT opened, no new-images poll firing
- [ ] **(ask user)** Removing the `aiQuery:` chip from the URL (keeping any other chips) returns normal BM25 results
- [ ] **(ask user)** Focus an image while AI chip is active, then remove it — focused image is re-located in the 1.3M-result set (or nearest neighbour if it's been re-indexed elsewhere)

**Phase 1c:**
- [ ] Playwright passes (`npm --prefix kupua run test:e2e`) — stop dev server on :3000 first
- [ ] **(ask user)** With Bedrock proxy health DOWN: zero sparkles icons visible, zero console warnings about AI
- [ ] **(ask user)** With Bedrock proxy health UP: sparkles icon visible, click → chip appears with distinct styling
- [ ] **(ask user)** Sort dropdown shows Relevance when chip active; changing sort re-orders the 200 results client-side with no network call

---

## 7b. Push-back clause (mandatory for the implementing agent)

If during implementation you discover an assumption in this plan is wrong — for example:
- `buildQuery` does not return the shape claimed in §3.1
- The store branching point doesn't exist where described in §9.2
- `_findAndFocusImage` doesn't work as described in §3.5
- The `isSortOnly` branch at [useUrlSearchSync.ts:173](kupua/src/hooks/useUrlSearchSync.ts#L173) doesn't fit the pattern in §9.3
- Cohere V4 returns embeddings in a different shape than §9.1 documents

**STOP and report.** Do not work around the discrepancy silently. Per AGENTS.md "Ask rather than spiral" directive: one clarifying question is cheaper than two wrong attempts. Write the discrepancy into the worklog and ask the user before proceeding.

This especially applies to the §3.5 "works as-is" research findings: if any of the three flows turns out NOT to work as predicted, that's a design-level surprise that warrants a pause, not a workaround.

---

## 8. Production Path (Future — Not In Scope Now)

When Kupua ships to real users, it won't have a Vite dev server. Options:
1. **media-api endpoint** (`GET /embeddings/query?q=...`) — ~15 lines of Scala, uses existing cache. Ask engineering team.
2. **Dedicated tiny Lambda** — stateless, just calls Bedrock, fronted by API Gateway.
3. **Edge function** (CloudFront Functions / Lambda@Edge) — lowest latency but complex auth.

Option 1 is simplest and most aligned with Grid's architecture. The dev-time Bedrock proxy validates the UX; the production backend is a separate decision.

---

## 9. Implementer Reference

### 9.1 Bedrock InvokeModel — exact request/response

**Request body** (JSON, sent via `InvokeModelCommand`):
```json
{
  "texts": ["moody outdoor portraits at sunset"],
  "input_type": "search_query",
  "embedding_types": ["float"],
  "output_dimension": 256
}
```

- `texts`: array with ONE string (the extracted AI query). Any Unicode text, max ~2048 tokens (~8000 chars English).
- `input_type`: must be `"search_query"` (not `"search_document"` — that's for images at ingest time).
- `embedding_types`: `["float"]` — we want float32, not int8.
- `output_dimension`: `256` — matches what's indexed in ES. Cohere V4 supports matryoshka truncation.

**Response body** (JSON):
```json
{
  "embeddings": {
    "float": [[0.123, -0.456, ...]]
  },
  "response_type": "embeddings_by_type"
}
```

Extract: `response.embeddings.float[0]` → `number[256]`.

**AWS SDK call pattern** (Node.js, in the Vite plugin):
```typescript
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-providers";

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? "eu-west-1",
  credentials: fromIni({ profile: process.env.AWS_PROFILE ?? "media-service" }),
});

const command = new InvokeModelCommand({
  modelId: process.env.KUPUA_BEDROCK_MODEL_ID ?? "global.cohere.embed-v4:0",
  contentType: "application/json",
  accept: "application/json",
  body: JSON.stringify({
    texts: [queryText],
    input_type: "search_query",
    embedding_types: ["float"],
    output_dimension: 256,
  }),
});

const response = await client.send(command);
const parsed = JSON.parse(new TextDecoder().decode(response.body));
const embedding: number[] = parsed.embeddings.float[0];
```

### 9.2 Store integration — PIT, pagination, and "no more pages"

AI search returns a flat ≤200 result set. No pagination. The store must not attempt to extend, open PITs, or seek.

**Critical property:** set `total === hits.length`. This triggers the existing "at end" guard in `extendForward` (`bufferOffset + results.length >= total`) and prevents scroll-mode fill and position-map fetch.

**Return shape from `searchByAi`** (must satisfy `SearchAfterResult`):
```typescript
{
  hits: aiResults,                              // Image[] (≤200)
  total: aiResults.length,                      // ← KEY: buffer == total → no pagination
  took: responseTimeMs,
  sortValues: aiResults.map((_, i) => [200 - i, aiResults[i].id]),  // synthetic, descending
  pitId: null,                                  // no PIT needed
}
```

**What the store does with this:**
- `bufferOffset = 0`, `results = aiResults`, `total = aiResults.length`
- `endCursor = sortValues[last]` — both `extendForward` and `extendBackward` blocked
- Scroll-mode fill → won't fire because `total === hits.length`
- Position map → won't fire because `total ≤ 200 < 1000`
- Scrubber → enters scroll-mode (direct scrolling), correct for ≤200 items

**Skip in AI mode:**
- `openPit` — don't call (no pagination)
- `countWithTickers` — still call (ticker counts are useful context)
- New-images poll — suppress (relevance-ranked results don't change with new uploads)

### 9.3 Sort handling — "Relevance" + client-side re-sort

**New sort option:** Add `"-relevance"` to `SORT_DROPDOWN_OPTIONS` (in `field-registry.tsx`). Available when AI chip is present.

**Auto-switch pattern** — mirror the existing `_preSortBeforeCollection` precedent at [useUrlSearchSync.ts:388-417](kupua/src/hooks/useUrlSearchSync.ts#L388-L417). Add a sibling module-level variable `let _preSortBeforeAi: string | undefined;` and reproduce the same save/restore logic in the same `useUpdateSearchParams` hook, keyed on AI-chip presence instead of collection-chip presence.

```
AI chip appears in query → save current orderBy to _preSortBeforeAi → set orderBy to "-relevance"
AI chip removed from query → if orderBy still "-relevance", revert to _preSortBeforeAi
```

**Client-side re-sort (all sorts remain available in AI mode):**

Since all ≤200 results are in the buffer, changing sort does NOT re-query ES or re-call Bedrock. Instead:

1. Detect "AI mode active + sort-only URL change" and re-sort the buffer in-place
2. Sort by `uploadTime`, `metadata.dateTaken`, `_score`, etc. — all in `_source`
3. No network call, no PIT, no Bedrock call

**Where this lives — decision: extend the existing `isSortOnly` branch.** [useUrlSearchSync.ts:173](kupua/src/hooks/useUrlSearchSync.ts#L173) already computes an `isSortOnly` flag and currently still triggers a full `search()` at [useUrlSearchSync.ts:341](kupua/src/hooks/useUrlSearchSync.ts#L341). Amend that branch:

```typescript
if (isSortOnly) {
  const aiActive = /aiQuery:"[^"]+"/.test(newParams.query ?? '');
  if (aiActive) {
    useSearchStore.getState().resortAiBuffer(newParams.orderBy);
    return;
  }
  // existing behaviour: full re-search with sortOnly hint
}
```

No new helper module needed. The store gains one new action: `resortAiBuffer(orderBy: string)` which mutates `results` in place (and bumps a version key so the virtualizer re-renders).

**Why this location:** keeps all URL→store decision-making in one file, matches the existing precedent (the collection-sort save/restore is also in `useUrlSearchSync`), and avoids introducing a new orchestration concept for what is fundamentally a sync-layer concern.

**`_score` extraction:** Add `_score?: number` to hit parsing in `es-adapter.ts`. For KNN, ES returns `(1 + cosine_similarity) / 2` normalized to [0, 1]. Store on each Image as `__aiScore?: number` (double-underscore = kupua-internal, not from ES _source). Used for "Relevance" sort.

### 9.4 CQL chip extraction

**Regex:**
```typescript
const AI_CHIP_RE = /aiQuery:"([^"]+)"/;

function extractAiQuery(cql: string): { aiText: string | null; remainder: string } {
  const match = cql.match(AI_CHIP_RE);
  if (!match) return { aiText: null, remainder: cql };
  return {
    aiText: match[1],
    remainder: cql.replace(AI_CHIP_RE, "").replace(/\s{2,}/g, " ").trim(),
  };
}
```

**Edge cases:**
- Escaped quotes: not supported (CQL parser doesn't support them for any chip). Users can't type `"` inside a chip value.
- Multiple `aiQuery:` chips: regex matches first only. Any others pass through to `parseCql` which won't know the field → treated as free-text search term (harmless noise).
- Empty value `aiQuery:""`: regex won't match (`[^"]+` requires 1+ chars). Falls through to normal BM25.
- UI prevents multiple chips: clicking sparkles when chip exists removes it. Only one possible via UI.

### 9.5 UI — AI chip is a real CQL chip with shadow-DOM styling

**Decision (May 2026):** the AI chip is a real `@guardian/cql` chip, not a separate React input. Visual differentiation is achieved by injecting CSS into the cql shadow root and tagging the AI chip's DOM element with a `MutationObserver`.

**Why a real CQL chip (not a separate React component):**
- Full undo/redo for free — Ctrl+Z restores a deleted AI chip via the cql component's internal ProseMirror history
- Full keyboard navigation — Tab between chips includes the AI chip naturally
- Full paste/clear behaviour — pasting a CQL string containing `aiQuery:"..."` Just Works
- No parallel-input sync bugs — the CQL string is the single source of truth
- The cql library author is a friend; if this pattern proves useful, theming may be added upstream

**Implementation — three pieces:**

1. **Sparkles button (sibling React component).** Visible only when `gridConfig.bedrockAvailable === true`. Acts as a **toggle with memory** (see §4.2). Module-level `_stashedAiQuery: string | null`. On click:\n   - If no `aiQuery:` chip in CQL AND no stash → append `aiQuery:\"\"`, focus cql input\n   - If no `aiQuery:` chip in CQL AND stash exists → restore `aiQuery:\"<stash>\"`\n   - If `aiQuery:` chip IS in CQL → stash its text, strip it from CQL string\n   - Clicking X on the chip itself (CQL's native chip delete) → clears stash too\n   \n   This button is a *writer* into the CQL string, not a parallel input. ~40 lines.

2. **Shadow-root stylesheet injection.** After the `<cql-input>` element mounts, attach a `CSSStyleSheet` to its `shadowRoot.adoptedStyleSheets` array targeting `[data-ai-chip]`. This is a supported web platform API, not a hack. The stylesheet defines the AI chip's distinct background colour and animated gradient border. ~10 lines.

3. **MutationObserver to tag the AI chip element.** After mount, run a `MutationObserver` over the cql shadow root. On every mutation: find chip DOM elements whose visible text begins with `aiQuery:` and set `data-ai-chip` on them. Disconnect on unmount. ~30 lines.

**Shadow DOM spike completed 24 May 2026 — confirmed findings:**

| Question | Answer |
|---|---|
| Shadow root accessible? | ✅ `open` — readable from outside |
| Chip wrapper element | ✅ `<chip-wrapper>` custom element — stable, survives typing |
| Chip key queryable? | ✅ `wrapper.querySelector('chip-key')?.textContent` returns `"fieldname:"` (field name + colon) |
| Stability during typing | ✅ `chip-wrapper` stays in DOM; only `<query-str>` text nodes change |
| Default data attributes on wrapper | ❌ None — we add `data-ai-chip` ourselves |

**Confirmed selector for the MutationObserver:**

The field name sits in an unclassed `<span>` inside `<chip-key>`, separate from the `<span class="Cql__ChipKeySeparator">` that holds the colon. This allows an exact match without colon noise:

```javascript
root.querySelectorAll('chip-wrapper').forEach(wrapper => {
  const keyName = wrapper.querySelector('chip-key span:not(.Cql__ChipKeySeparator)')?.textContent;
  if (keyName === 'aiQuery') {
    wrapper.setAttribute('data-ai-chip', 'true');
  } else {
    wrapper.removeAttribute('data-ai-chip');
  }
});
```

**CSS specificity:** The shadow `<style>` sets `chip-wrapper { background-color: #2a2a2a }` (tag selector, specificity 0,0,1). Our injected `adoptedStyleSheets` rule targeting `chip-wrapper[data-ai-chip]` (tag + attribute, specificity 0,1,1) wins without `!important`. No cascade fights.

**Fallback B is not needed.** The MutationObserver approach is confirmed viable. Skip directly to implementation.

**Component file layout:**
- `src/components/SearchBar/SparklesButton.tsx` — the writer button (~30 lines)
- `src/components/SearchBar/ai-chip-styling.ts` — shadow-root stylesheet injection + MutationObserver (~50 lines, plus a small CSS string)
- `src/components/CqlSearchInput.tsx` — call `installAiChipStyling(cqlInputElement)` once after mount; tear down on unmount

**Trade-off acknowledged:** brittle to `@guardian/cql` internal DOM changes. **Failure mode is visual degradation, not functional breakage** — the chip still works, it just stops looking special. Recoverable by updating the selector. Acceptable because (a) we know the cql author personally and will hear about changes, (b) failure is visual not functional, (c) the alternative (parallel React input) has worse and less-recoverable failure modes (sync bugs, lost undo/redo).

---

#### Fallback B — separate React component (spike ruled this out, 24 May 2026)

**Not needed.** Shadow DOM spike confirmed the MutationObserver approach works. Retained here for reference only, in case a future `@guardian/cql` upgrade breaks the `chip-wrapper` custom element structure.

Cost if this ever becomes necessary: loses undo/redo for the AI chip, loses Tab navigation continuity, introduces a parallel-input sync problem. Document in `deviations.md` if ever taken.

### 9.6 ES KNN response shape

```json
{
  "took": 45,
  "timed_out": false,
  "hits": {
    "total": { "value": 200, "relation": "eq" },
    "max_score": 0.892,
    "hits": [
      {
        "_index": "images",
        "_id": "abc123",
        "_score": 0.892,
        "_source": { /* full Image document */ }
      },
      {
        "_index": "images",
        "_id": "def456",
        "_score": 0.867,
        "_source": { /* ... */ }
      }
    ]
  }
}
```

**Key differences from normal search response:**
- No `sort` array on hits (KNN doesn't use sort clauses) — synthesize for store compatibility
- `_score` present and meaningful (cosine similarity, normalized [0, 1])
- `hits.total.value` = results returned (≤ k=200), not total corpus matches
- No PIT ID in response
