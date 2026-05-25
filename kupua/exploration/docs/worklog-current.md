<\!-- AGENT PROTOCOL
STOP\! If you do NOT see your own "🤖 Agent check-in" entry at the bottom of the
Session Log that YOU wrote in THIS conversation, you are a NEW agent.
Follow the Fresh Agent Protocol in copilot-instructions.md:
  1. Say "Hi, I'm a fresh agent."
  2. Read this file fully.
  3. State what context you have.
  4. Ask: "What should I read before starting?"
  5. Do NOT write or modify any code until the user confirms.
If you DO see your own check-in in your conversation history, carry on.
-->

# Current Task

Implementing AI search feature (Phase 1a–1c). Design in `zz Archive/ai-search-workplan.md`.
Phase 1 lands as one commit. Between sub-phases, agent writes handoff here.

## Session Log

### 2026-05-24 Phase 1a — Bedrock proxy + health check

**Findings:**
- `buildQuery()` at es-adapter.ts:450 produces `{ bool: { must, mustNot, filter } }` — correct shape for `knn.filter` ✓
- `ALLOWED_ES_PATHS` already includes `_search` — KNN queries pass proxy guard unchanged ✓
- `useAISearch` already in URL schema (search-params-schema.ts:28) but unused — irrelevant, using `aiQuery:"..."` CQL chip ✓
- `@aws-sdk/client-bedrock-runtime` NOT in package.json — added
- `bedrockAvailable` added as mutable `export let` in `grid-config.ts` (outside `as const` object)
- Bedrock proxy is Vite middleware in `scripts/bedrock-embed-proxy.mjs` (not a standalone server)

**Files changed in 1a:**
- `kupua/package.json` — added `@aws-sdk/client-bedrock-runtime` devDep
- `kupua/scripts/bedrock-embed-proxy.mjs` — new Vite plugin factory
- `kupua/vite.config.ts` — registered `bedrockEmbedProxy()` plugin
- `kupua/src/lib/grid-config.ts` — added `bedrockAvailable` + `setBedrockAvailable()`
- `kupua/src/lib/bedrock-proxy-client.ts` — new browser-side fetch client
- `kupua/src/main.tsx` — calls `checkBedrockHealth()` at startup

**Manual verification needed (ask user):**
- `curl http://localhost:3000/bedrock/health` in --use-TEST mode → `{"available":true}`
- `curl http://localhost:3000/bedrock/health` in local-docker mode → `{"available":false}` no crash
- `curl 'http://localhost:3000/bedrock/embed?q=test'` in --use-TEST mode → 256-float array
- Second identical curl shows `"cached":true` in proxy logs

### 2026-05-24 Phase 1b — DAL `searchByAi` + store branch

**Approach decided:**
- `aiQuery:"..."` chip extracted by module-level `extractAiQuery()` in `es-adapter.ts` — regex-based, strips chip, normalises whitespace in remainder
- KNN field name in `es-config.ts` as `KNN_FIELD` (overridable via `VITE_ES_KNN_FIELD`, default `"embedding.cohereEmbedV4.image"`)
- `searchByAi` added as public method on `ElasticsearchDataSource` (not private, declared as optional in `ImageDataSource` interface)
- AI branch in `search-store.ts` inserted BEFORE the main `try {}` block (after `closePit` call) — early-returns after setting state, skips PIT, poll, seeks
- `_seekCooldownUntil = Date.now() + SEARCH_FETCH_COOLDOWN_MS` set at end of AI branch (mirrors end of normal search path)
- `__aiScore?: number` added to `Image` interface (kupua-internal field, not from ES _source)

**Key decisions:**
- `track_total_hits: false` in KNN body — total computed from `hits.length` (the invariant)
- `sortValues` are synthetic: `[k - i, img.id]` descending — never used for pagination but stored for cursor API compatibility
- `pitId: null` explicit return — store sees this and does not try to close a PIT after AI search
- No new-images poll started after AI search (results are by relevance; new uploads don't change ranking)
- `dataSource.searchByAi` guarded: if `undefined`, sets error state and returns cleanly (covers non-ES data sources)

**Files changed in 1b:**
- `kupua/src/types/image.ts` — added `__aiScore?: number` to `Image` interface
- `kupua/src/dal/types.ts` — added `searchByAi?` optional method to `ImageDataSource` interface
- `kupua/src/dal/es-config.ts` — added `KNN_FIELD` export
- `kupua/src/dal/es-adapter.ts` — added `getEmbedding` import, `extractAiQuery()` export, `searchByAi()` method
- `kupua/src/stores/search-store.ts` — added AI branch (hasAiChip detection + early-return path)
- `kupua/src/dal/es-adapter.test.ts` — added 6 `extractAiQuery` tests + 6 `searchByAi` tests (867/867 pass)

**Known risk: KNN field name.** `embedding.cohereEmbedV4.image` is from the workplan §0.1. Must be verified against actual ES mapping when testing against TEST. If wrong, returns 0 results (graceful).

**FIXED (this session):**
- Root cause confirmed: AI branch did `focusedImageId: null` + bumped `_scrollReset` unconditionally,
  ignoring `sortAroundFocusId` entirely.
- Fix: compute `focusedInAiResults = sortAroundFocusId ? hits.some(h => h.id === sortAroundFocusId) : false`
  before `set()`, then mirror the `focusedInFirstPage` logic from the normal path:
  - If found: `focusedImageId = sortAroundFocusId`, bump `sortAroundFocusGeneration` (scroll to image),
    handle phantom mode
  - If not found: `focusedImageId = null`, bump `_scrollReset` (scroll to top)
- Added 6 new store tests in `search-store.test.ts` covering Back restore, phantom, not-found, invariants.
- 875/875 tests pass.
- **No ES round-trip needed** — AI has all results in memory; restore is pure in-memory lookup.

**Next: Phase 1c** — SparklesButton, chip styling, `-relevance` sort option, `resortAiBuffer` store action, Playwright tests

### 2026-05-24 PRE-1c BLOCKER — browser back-navigation breaks position in AI search

**Problem:** Browser Back after navigating away from an AI search result lands at the TOP
of the AI results, not with the previously focused image in view. Normal BM25 searches
work correctly (image A stays focused on Back). Phase 1c must not ship without fixing this.

**Root cause hypothesis (needs verification):**
Normal search uses `searchAfter` + PIT which stores `sortValues` as real ES cursors.
On Back, `sort-around-focus` uses the focused image's `sortValues` from `imagePositions`
to call `countBefore()` and reconstruct the buffer centered on the image.
AI search uses SYNTHETIC `sortValues` (`[200-i, img.id]`) — these are NOT valid ES cursors
and cannot be used for `countBefore()` / `searchAfter`. So the focus-restore path silently
fails and falls back to top.

**Key files to read:**
- `kupua/exploration/docs/00 Architecture and philosophy/04-browser-history-architecture.md`
- `search-store.ts`: `sortAroundFocus`, `_preSortBeforeAi` (not yet in 1c)
- `useUrlSearchSync.ts`: sort-only path, isSortOnly detection

**Likely fix options (to evaluate):**
A. Store `__aiRank` (0-based index) on each image. On AI-search restore, skip countBefore
   entirely — use `__aiRank` to scroll directly to the image by buffer index.
B. Store the full AI result set in a module-level ref (`_aiResultCache`) keyed by query.
   On Back, re-use the cache (no Bedrock re-fetch) and restore focus by index.
C. Teach the `sortAroundFocus` path to detect AI mode and short-circuit to
   `scrollToIndex(focusedImageId's rank in current results)`.

**See:** `04-browser-history-architecture.md` for full history/restore mechanism.
Agent must read that doc before implementing anything. DO NOT COMMIT phase 1c without
this fix.

### 2026-05-24 Phase 1b fix — AI search tickers & filters empty

**Problem:** Tickers show nothing, Filters panel completely empty in AI mode.
Root cause: `aiQuery:"..."` chip in `params.query` poisons `buildQuery()` → produces
`{ match_phrase: { aiQuery: "..." } }` → zero ES hits → all aggs/counts empty.

**Fix implemented (3 files, ~40 lines):**

1. **`buildQuery()` strip (es-adapter.ts):** Calls `extractAiQuery(params.query).remainder`
   at the top, uses remainder for `parseCql`. Makes poisoned-query structurally impossible
   for ALL callers. Load-bearing, not just defence-in-depth.

2. **`decorateParamsForAggregations` helper (new: `src/lib/ai-search-params.ts`):**
   Single AI-detection point. When AI chip present: strips it + sets `params.ids` to the
   ≤200 result IDs → ES aggregates over exactly the visible results. No-op when AI chip
   absent (normal search unchanged). All agg/count callers route through this.

3. **Store wiring (search-store.ts):**
   - AI branch: fires `countWithTickers(decoratedParams).tickerCounts` after results land (async, non-blocking)
   - `fetchAggregations`: decorates `callParams` before DAL call
   - `fetchExpandedAgg`: same decoration

**Bug caught during manual testing:** Initial `.then()` callback set the entire
`CountWithTickersResult` object (`{ count, tickerCounts }`) as `tickerCounts` in the
store instead of extracting `.tickerCounts` from it. Destructuring mismatch — fixed
same session.

**Design principle:** "AI is not a mode." No client-side aggregation reimplementation,
no `_isAiMode` flag, no bespoke TS predicates for tickers. Same ES agg infrastructure,
scoped to the result IDs via existing `params.ids` → `terms: { id: [...] }` mechanism.

**Design docs:** `exploration/docs/zz Archive/ai-search-aggregation-problem.md` (problem + solution),
`exploration/docs/zz Archive/ai-searchContext-future-abstraction.md` (backlog: SearchContext for
when a second alternative-ranking algorithm lands).

875/875 unit tests pass. Zero type errors.

### 2026-05-24 Phase 1c — UI: SparklesButton, chip styling, sort handling

**Implemented (6 new/modified files):**

1. **`src/lib/grid-config.ts`:** Added `subscribeBedrockAvailable()` subscriber pattern so
   React components re-render when `setBedrockAvailable(true)` resolves after app mount.
   (Module-level `let` is not reactive — subscription is necessary.)

2. **`src/components/SparklesButton.tsx`** (NEW): Toggle button with `auto_awesome` filled
   icon (yellow, `#facc15`). Gated by `bedrockAvailable` via subscriber. Module-level
   `_stashedAiQuery` preserves chip text on toggle-off. Detects native chip deletion (✕)
   via `hasChip` transition and clears stash automatically.

3. **`src/components/ai-chip-styling.ts`** (NEW): `installAiChipStyling(el)` injects a
   `CSSStyleSheet` into the `<cql-input>` shadow root and runs a `MutationObserver` to
   tag `<chip-wrapper data-ai-chip>`. CSS: `border: 2px solid #facc15; border-radius: 3px`.
   Returns a teardown fn. Fragile to `@guardian/cql` internal DOM structure — failure mode
   is visual degradation only, not breakage.

4. **`src/components/CqlSearchInput.tsx`:** Calls `installAiChipStyling(el)` after mount;
   teardown in the existing cleanup return.

5. **`src/components/SearchBar.tsx`:** Renders `<SparklesButton />` inside the search box
   border, after the clear ✕ button.

6. **`src/lib/field-registry.tsx`:** Added `"relevance"` to `DESC_BY_DEFAULT` (higher KNN
   score = better match, so descending is correct default). Test updated to allow AI-only
   sort keys via `AI_ONLY_SORT_KEYS` allowlist.

7. **`src/components/SearchFilters.tsx`:** `SortControls` now prepends `{ label: "Relevance",
   value: "relevance" }` to the dropdown when an AI chip is present. Default sort indicator
   dot suppressed when `orderBy === "-relevance"` in AI mode.

8. **`src/stores/search-store.ts`:** Added `resortAiBuffer(orderBy)` action — sorts
   in-memory results by `__aiScore` (relevance) or `uploadTime`; no-op for other fields.
   Added `addToast` import + 503-specific error toast in the AI catch block.

9. **`src/hooks/useUrlSearchSync.ts`:** Added `_preSortBeforeAi` + `AI_CHIP_PRESENT_RE` +
   `AI_SORT = "-relevance"`. Two additions:
   (a) In `useUpdateSearchParams`: AI chip appear/disappear triggers save/restore of sort
       (mirrors `_preSortBeforeCollection` pattern exactly).
   (b) In `useUrlSearchSync` hook: AI sort-only URL changes intercept before `search()` and
       call `resortAiBuffer()` instead — no ES round-trip.

**875/875 unit tests pass. Zero type errors.**

**Remaining for 1c: Playwright specs** (deferred until user confirms manual testing OK).

### 2026-05-24 Phase 1c pivot — Separate AiSearchInput widget (non-CQL)

**Decision: Abandoned CQL chip approach. Built a standalone React input instead.**

**Why the CQL chip approach failed:**
1. **Browser crash.** `ai-chip-styling.ts` ran a `MutationObserver` on the CQL shadow root
   (`childList + subtree + characterData`). This created a feedback loop with ProseMirror's
   own MutationObserver — both observing, both mutating, infinite loop → tab freeze.
2. **Cursor positioning impossible.** CQL chips are atomic ProseMirror nodes — the caret
   cannot be placed *inside* a committed chip. Users had no way to edit the AI text
   without deleting the chip and re-typing.
3. **Strip logic fragility.** `extractAiQuery()` needed to survive CQL's normalisation
   (quoting, whitespace), and CQL's `queryChange` event reports stripped values that
   destroyed `aiQuery:""` (empty-chip state) on every keystroke.
4. **No "composition mode" API.** CQL has no concept of a chip that's visually present
   but not yet committed to the query string. The chip either exists in ProseMirror
   state (and affects the URL) or doesn't.

**Architecture chosen (Option D from UX discussion):**
- `AiSearchInput.tsx`: Self-contained expandable widget living *inside* the search bar
  border, after CQL and before the main clear button.
- `SearchBar.tsx` orchestrates: splits URL `query=` param into CQL remainder + AI text
  via `extractAiQuery()`, passes each to its respective component, combines on change.
- Neither component knows about the other — SearchBar is the only coupling point.
- URL remains source of truth: `?query=credit:PA aiQuery:"tigers in snow"`

**What was built:**
- `AiSearchInput.tsx` — Expandable widget with: toggle (sparkles icon), local state
  decoupled from URL (prevents debounce clobbering keystrokes), stash/restore on
  toggle-off, content-based `ch` sizing, expand/collapse animation (transition-all
  duration-200), inner ✕ to clear text without collapsing, onMouseDown+preventDefault
  to prevent blur-before-click layout shift, Escape to collapse, auto-focus on expand.
- `SearchBar.tsx` — Split/combine logic with separate debounce timers (CQL 300ms,
  AI 600ms), `cqlPartRef`/`aiPartRef` for un-debounced latest values, `combineForUrl()`
  helper that quotes multi-word AI values. Clear button hidden when only AI active
  (AI widget has its own ✕).
- `useUrlSearchSync.ts` — Sort auto-switch RE uses `/aiQuery:"[^"]+"/` (non-empty only)
  so empty AI chip doesn't trigger relevance sort.
- `es-adapter.ts` — `extractAiQuery()` handles both quoted (`aiQuery:"multi word"`)
  and unquoted (`aiQuery:single`) forms; returns `aiText: ""` for `aiQuery:""`.

**Dead code removed:**
- Deleted `SparklesButton.tsx` (replaced by AiSearchInput)
- Deleted `ai-chip-styling.ts` (crash culprit, no longer needed)
- Removed commented-out import + no-op teardown from `CqlSearchInput.tsx`

875/875 unit tests pass. Zero type errors.

### 2026-05-25 Refactor: `aiQuery:"..."` chip → separate `?aiQuery=` URL param (+58 / -166)

**The problem (accumulated over Phase 1c):**

The original design embedded AI search text as a CQL-like chip inside the `query` param:
`?query=credit:PA aiQuery:"tigers in snow"`. This meant AI state was a structured concept
buried in a flat string — every consumer had to regex-parse it back out.

Accumulated regexes across the codebase:
- `AI_CHIP_RE` in `es-adapter.ts` (extractAiQuery — strip + return text)
- `AI_CHIP_PRESENT_RE` in `useUrlSearchSync.ts` (auto-sort detection)
- `hasAiChip` regex in `SearchFilters.tsx` (show relevance option)
- Detection in `search-store.ts` (AI branch routing)
- Split/combine logic in `SearchBar.tsx` (mux AI text into/out of CQL string)
- Detection in `ai-search-params.ts` (aggregation decoration)

Each new bug added another regex variant. CQL strips quotes from single-word values
(`aiQuery:"tigers"` → `aiQuery:tigers`), so every regex needed both quoted AND unquoted
forms. The `AI_CHIP_PRESENT_RE` in useUrlSearchSync only matched the quoted form —
single-word AI queries didn't auto-sort to Relevance. SearchFilters had a case mismatch.
Fixes kept piling on.

**Root cause:** Two concepts (CQL text + AI text) stuffed into one string. As long as
`aiQuery:` lives inside `?query=`, everything downstream must regex-parse it. This is
true regardless of CQL — even a perfect CQL chip API doesn't help when the fundamental
problem is "data model mismatch."

**The fix: separate URL parameter.**

`?query=credit:PA&aiQuery=tigers&nonFree=true`

- Detection everywhere: `!!params.aiQuery` — no regex, no parsing
- `query` is always pure CQL — nothing to extract, nothing to strip
- SearchBar reads two params, writes two params — no combine/split logic
- `extractAiQuery()` deleted entirely
- All 4+ regex patterns deleted
- TanStack Router gives us typed access (`params.aiQuery: string | undefined`)

**Trade-off:** URL is slightly less "truthful" — AI query isn't visible in the CQL input
(it lives in its own React widget anyway). Acceptable because the CQL input never showed
it as editable text — it was always a separate AiSearchInput component.

**Files changed:**
- `search-params-schema.ts` — added `aiQuery: z.string().optional()` to schema
- `SearchBar.tsx` — reads `searchParams.aiQuery` directly, writes via `updateSearch({ aiQuery })`; deleted `combineForUrl()`, `extractAiQuery` import, split logic
- `useUrlSearchSync.ts` — AI detection uses `!!params.aiQuery`; deleted `AI_CHIP_PRESENT_RE`
- `search-store.ts` — AI branch uses `!!params.aiQuery`; deleted regex
- `es-adapter.ts` — deleted `extractAiQuery()` + `AI_CHIP_RE`; `buildQuery()` uses `params.query` directly (no strip needed); `searchByAi()` reads `params.aiQuery`
- `ai-search-params.ts` — uses `params.aiQuery` directly; deleted regex import
- `SearchFilters.tsx` — `hasAiChip` → `!!searchParams.aiQuery`
- `es-adapter.test.ts` — deleted extractAiQuery tests (no longer exists); adapted remaining tests

**Net: +58 / -166 lines.** All regex deleted. 868/868 tests pass.

### 2026-05-25 Bug fix: Home → type does nothing (latent `_externalQuery` latch bug)

**Symptom:** After pressing Home and typing in CQL, nothing happens — debounce fires but
`updateSearch` is never called.

**Root cause:** `resetToHome()` called `cancelSearchDebounce("")` which set
`_externalQuery = ""`. The useUrlSearchSync effect deduplicates after Home (serialized
params match what resetToHome pre-set via `navigate()`), so the effect's final
`setExternalQuery(null)` line is never reached. The latch stays as `""`, and all subsequent
debounce callbacks fail the guard (`"typed text" !== "" → skip`).

**Why it surfaced now:** The AI refactor added `aiQuery` to the schema and added the
AiSearchInput component. This changed React render timing subtly — previously an
intermediate render during resetToHome's async gap let the effect fire and clear the latch.
After the refactor, React batches differently and the effect only fires once (post-navigate),
hitting the dedup.

**Fix:** `cancelSearchDebounce("")` → `cancelSearchDebounce()` (no arg → `_externalQuery = null`).
`clearTimeout` already kills the pending timer, and the generation bump remounts the CQL
component. Passing `""` served no purpose beyond creating a stale latch.

868/868 tests pass.
