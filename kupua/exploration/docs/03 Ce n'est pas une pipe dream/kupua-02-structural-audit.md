# Kupua — Structural Audit & Refactoring Plan

**Auditor:** Staff Engineer
**Requester:** Business Analyst
**Scope:** `kupua/src/` — structural soundness for long-term maintenance, team rotation, and feature delivery
**Date:** 2 April 2026
**Status:** Authoritative — supersedes all previous drafts

---

## Executive Summary

Kupua is a technically ambitious React/TypeScript rewrite of the Kahuna frontend. The engineering is not bad — the team made thoughtful technical decisions (URL as source of truth, windowed buffer, TanStack stack, Zustand). The code works. The problem is that **everything has been built into a handful of mega-files with deeply cross-cutting concerns**, and the project has reached the size (~51 production files, ~14,000 lines) where this approach is beginning to collapse under its own weight.

More critically, kupua bypasses Grid's microservice API layer entirely, querying Elasticsearch directly. This was a deliberate Phase 1–2 decision for read-only exploration — and it worked brilliantly. But it now structurally blocks every write feature (editing, uploads, crops, collections, leases) because those features **require** the Grid APIs.

Without intervention, the next major feature will be extremely painful to build, the Grid API integration ("Phase 3" of the migration plan) will become a rewrite rather than an adapter swap, and new developers will face a 2–4 week ramp-up.

This document describes the problems, then proposes a 5-phase refactoring plan (8.5–13 developer-days) that resolves them.

**Severity ratings:** 🔴 Critical (blocks scaling) · 🟠 Significant (causes bugs/confusion) · 🟡 Moderate (tech debt accruing)

---

## Guiding Principles

The refactoring is governed by three principles. Every phase and every extraction must satisfy all three.

### 1. Three-Layer Separation

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: VIEW COMPONENTS                           │
│  React components + CSS. Depend on Layer 2 hooks.   │
│  Library-specific: TanStack Table, TanStack Virtual, │
│  Tailwind. Swappable by replacing this layer only.  │
├─────────────────────────────────────────────────────┤
│  Layer 2: KUPUA APPLICATION LOGIC                   │
│  Hooks + stores + services. Pure TypeScript.        │
│  Kupua-specific: windowed buffer, scroll anchoring, │
│  density transitions, sort-around-focus, scrubber   │
│  seek/scroll modes. NOT tied to any view library    │
│  or data source.                                    │
├─────────────────────────────────────────────────────┤
│  Layer 3: DATA ACCESS                               │
│  DAL interface + adapters + enhanced engine.        │
│  Grid-specific: ES queries, Grid API calls, CQL    │
│  translation, PIT, auth. Swappable by writing a    │
│  new adapter.                                       │
└─────────────────────────────────────────────────────┘
```

Currently all three layers are entangled:
- The store (Layer 2) imports ES sort-clause builders (Layer 3).
- Components (Layer 1) import from other components for imperative state management (Layer 2 leak).
- The scroll hook (Layer 2) contains module-level singletons that serve both Layer 1 and Layer 2.
- The route (Layer 1) contains scrubber data computation (Layer 2).

After refactoring, each layer is replaceable independently:

| If you swap… | You touch… | You don't touch… |
|---|---|---|
| TanStack Table → AG Grid | Layer 1 (`ImageTable`, `ColumnContextMenu`) | Layer 2 (stores, hooks) or Layer 3 (DAL) |
| Zustand → Signals / Jotai | Layer 2 (stores, subscription hooks) | Layer 1 (components get data via hooks) or Layer 3 |
| Direct ES → Grid API | Layer 3 (new adapter) | Layer 2 (buffer logic works on any data) or Layer 1 |
| TanStack Virtual → custom | Layer 1 (virtualiser setup) + Layer 2 scroll hooks (narrow interface) | Layer 3 |

The virtualiser sits at the Layer 1/2 boundary — scroll hooks reference it, but through a narrow interface (`scrollToOffset`, `scrollToIndex`, `getVirtualItems`, `range`). Wrapping that interface explicitly makes even a virtualiser swap contained.

### 2. Performance Protection

Kupua's core value proposition is speed — virtualised scroll over large result sets with sub-frame buffer management. The refactoring must not degrade this. Concretely:

- **No new render cycles.** Splitting the store into slices must not cause components to re-render on state they don't consume. Each slice exposes fine-grained selectors; components subscribe only to what they display.
- **No new network round-trips.** The enhanced-ES-engine layer preserves every optimisation (PIT reuse, `search_after` cursors, batched aggregations, pre-fetched sort distributions). Moving code between files does not change the number or timing of ES requests.
- **No new allocations on the scroll hot path.** Extracted hooks (`useScrollCompensation`, `useEdgeDetection`) must not create closures or objects that weren't already being created. The extraction is a cut-and-paste at the module boundary, not a redesign.
- **Measurable baseline.** The throwaway testing harness (Phase 0) includes a scroll-position smoke test. In addition, before Phase 1 begins, record three numbers in a `PERF_BASELINE.md` file: (a) time-to-first-result for a cold search, (b) extend-forward latency (p95 over 20 extends), (c) deep-seek latency (seek to position 50,000). Re-measure after each phase. If any metric degrades by >10%, investigate before proceeding.
- **Future API-shaped calls must be designed for batch efficiency.** The `enhanced-es-engine.ts` methods that represent future API enhancements (Step 2.2) are shaped as batch-capable calls with `AbortSignal` support, not chatty per-item fetches. When the Grid API implements them, the call pattern should require ≤1 round-trip per user action.

### 3. Separation of Concerns (Grid Integration vs. Kupua Logic vs. View Libraries)

This is the three-layer model applied as a decision rule: when moving code, ask "which layer does this belong to?" If the answer is ambiguous, the code is doing too much and must be split. Examples:

- `buildSortClause(orderBy)` — Layer 3 (ES query construction). Must not be imported by stores.
- `seekToPosition(globalOffset)` — Layer 3 (ES-specific optimisation). Stores call it; they don't know it uses PIT + percentile estimation.
- `windowed buffer extend/evict` — Layer 2 (kupua application logic). Works identically regardless of data source.
- `TanStack Table column definitions` — Layer 1 (view library binding). Generated from a registry that is Layer 2.

---

## Part A — The Architectural Mismatch Problem

### How Grid Actually Works

Grid is a **microservices system**. Kahuna (the existing frontend) **never** talks to Elasticsearch or DynamoDB directly. It speaks exclusively to HTTP APIs:

| Service | Responsibility | Kahuna's access |
|---------|---------------|-----------------|
| **media-api** | Search, image retrieval, deletion, permissions | HATEOAS REST (follow links from root) |
| **metadata-editor** | Edit metadata, usage rights, labels, archive | REST → DynamoDB → SNS → Thrall reindexes ES |
| **collections** | Collection tree CRUD, image↔collection | REST → DynamoDB |
| **cropper** | Create/delete image crops | REST → S3 + SNS → Thrall |
| **leases** | Access-control leases (allow/deny, date ranges) | REST → DynamoDB + SNS |
| **usage** | Track where images are used | REST → DynamoDB + SNS |
| **image-loader** | Upload images | REST → S3 + SNS → Thrall |
| **auth** | OIDC / pan-domain authentication | Cookie-based sessions |

**The critical insight:** Kahuna follows HATEOAS links from the media-api root. It never builds ES queries, never knows ES field paths, never constructs sort clauses. The API layer handles permissions, query building, signed URLs, and write coordination.

### What Kupua Does Instead

Kupua bypasses all of this. It queries Elasticsearch directly via a Vite proxy, building raw ES query DSL in the browser (`es-adapter.ts`, 1,138 lines). This was an intentional Phase 1–2 decision for read-only exploration with local/TEST data, and it worked brilliantly.

**But the migration plan says Phase 3 is:** *"Implement `GridApiDataSource` — uses the existing HATEOAS API."* This has not happened. Every structural decision since — the CQL→ES translator, `buildSortClause`, PIT lifecycle, deep seek with percentile estimation + binary search — assumes direct ES access.

### Why This Matters

1. **Adding write features (editing, uploads, crops, collections, leases):** These **require** the Grid APIs. Metadata edits go through `metadata-editor` → DynamoDB → SNS → Thrall → ES. You cannot edit metadata by writing to ES directly — it would be overwritten on next reindex. **Every write feature in Phases 4–5 of the migration plan is structurally blocked.**

2. **Team rotation:** A new developer currently must understand raw ES query DSL, PIT semantics, `search_after` cursors, percentile estimation, and composite aggregation page-walking. A developer on Kahuna only needs to understand "follow links from the API root."

3. **Robustness:** Direct-ES works for read-only. Writes would require coordinating between ES reads and API writes — an eventual-consistency nightmare the API layer already solves.

4. **Performance under the Grid API:** Kupua's deep-seek and scrubber features rely on ES primitives (PIT, percentile aggregations, composite aggregations) that have no Grid API equivalent today. The `enhanced-es-engine.ts` module (Phase 2) isolates these, making graceful degradation explicit and the API enhancement backlog auditable.

---

## Part B — Findings

### Finding 1: DAL Boundary Collapse 🔴🔴 CRITICAL

The DAL interface (`ImageDataSource`) was designed to enable swapping ES for the Grid API. In practice, the boundary has collapsed:

- `search-store.ts` imports `buildSortClause` and `parseSortField` directly from `es-adapter.ts` — ES query construction details leaking into application logic.
- The store contains 400+ lines of deep-seek logic (percentile estimation, keyword composite aggregation walking, binary search on tiebreaker `id` field) — all ES-specific algorithms.
- The store manages PIT IDs, `search_after` cursors, and eviction — all ES pagination primitives.
- `cql.ts` translates CQL queries into ES query DSL (`must`/`mustNot` clauses) — the Grid API accepts CQL as a string parameter.
- The `ImageDataSource` interface has grown to **15+ methods**, most ES-specific: `openPit`, `closePit`, `searchAfter`, `countBefore`, `estimateSortValue`, `findKeywordSortValue`, `getKeywordDistribution`, `getDateDistribution`.

**Impact on feature delivery:** When the team starts Phase 3 (Grid API integration), they cannot just write a new adapter. They must rewrite the store, the seek logic, the sort logic, and the CQL translation — touching nearly every file.

**Recommendation:** Separate into two tiers (detailed in Phase 2):
1. **"API-shaped" core interface** — 4 methods the Grid API can serve today.
2. **"Enhanced engine" layer** — kupua-specific ES optimisations, invisible to stores, designed as future API call shapes (see Step 2.2).

### Finding 2: Module-Level Mutable Singletons 🔴 CRITICAL

16 module-level `let` variables across 6 files acting as hidden global state:

| File | Variables |
|------|-----------|
| `search-store.ts` | `_newImagesPollTimer`, `_rangeAbortController`, `_seekCooldownUntil`, `_aggDebounceTimer`, `_aggAbortController`, `_sortDistAbortController` |
| `SearchBar.tsx` | `_debounceTimerId`, `_externalQuery`, `_cqlInputGeneration` |
| `useUrlSearchSync.ts` | `_prevParamsSerialized`, `_prevSearchOnly` |
| `useDataWindow.ts` | `_visibleStart`, `_visibleEnd`, `_visibleSnapshot` |
| `useScrollEffects.ts` | `_densityFocusSaved`, `_sortFocusRatio`, `_virtualizerReset` |
| `scroll-container-ref.ts` | `_el` |

**Impact:**
- **Untestable:** Unit tests cannot reset this state between runs without importing and manually clearing each variable. No `reset()` functions exist for most of them.
- **Invisible coupling:** `SearchBar.tsx` exports `cancelSearchDebounce()` — a *component* acting as a service provider. `ImageTable.tsx`, `ImageMetadata.tsx`, and `FacetFilters` import it. This is a classic architectural smell.
- **HMR hazards:** Vite's hot module replacement doesn't reset `let` variables. After an HMR update, stale timers and abort controllers cause phantom behaviour.

**Recommendation:** Move imperative orchestration into `lib/search-orchestration.ts` (Phase 1). Each store's abort controllers and timers live in the same file as the store, with a `_resetForTesting()` export (Phase 2).

### Finding 3: Circular / Layering Violations 🔴 CRITICAL

The dependency graph has upward imports (lower layers importing from higher layers):

```
components/ImageMetadata.tsx  →  components/SearchBar.tsx   (cancelSearchDebounce)
components/ImageTable.tsx     →  components/SearchBar.tsx   (cancelSearchDebounce)
components/ImageDetail.tsx    →  hooks/useScrollEffects.ts  (resetScrollAndFocusSearch)
components/ImageDetail.tsx    →  hooks/useUrlSearchSync.ts  (resetSearchSync)
components/SearchBar.tsx      →  hooks/useScrollEffects.ts  (resetScrollAndFocusSearch)
```

A component (`ImageMetadata`) imports from a sibling component (`SearchBar`) — not for rendering, but for an imperative function. `SearchBar` is simultaneously a UI component and a service module.

**Impact:** Can't render `ImageMetadata` without pulling in `SearchBar`'s module-level timer state. Gets worse when edit features arrive — the metadata panel will need API write endpoints, optimistic updates, and search-store coordination.

**Recommendation:** Extract all imperative orchestration into `lib/` (Phase 1). The dependency arrow must always point downward: `components → hooks → lib → dal`.

### Finding 4: Duplicated Logo/Reset Sequences 🟠 SIGNIFICANT

Identical 5-line reset sequence in `SearchBar.tsx` and `ImageDetail.tsx`:

```ts
resetSearchSync();
resetScrollAndFocusSearch();
const store = useSearchStore.getState();
store.setParams({ query: undefined, offset: 0 });
store.search();
```

**Recommendation:** Extract a single `resetToHome()` function in `lib/reset-to-home.ts`.

### Finding 5: Route Component Doing Too Much 🟠 SIGNIFICANT

`routes/search.tsx` (204 lines) computes scrubber data (subscribing to 6 separate store selectors), builds `getSortLabel` callback, computes tick marks with a manual cache, and manages scrubber lazy-fetch interaction. This is business logic in a route definition.

**Recommendation:** Move to `hooks/useScrubberData.ts`. The route becomes ~50 lines.

### Finding 6: 691-Line Scroll Hook 🟠 SIGNIFICANT

`useScrollEffects.ts` contains **12 distinct `useEffect`/`useLayoutEffect` blocks**, 3 module-level state bridges, and an exported imperative function. The hook signature requires 11 config parameters. Each density component (grid, table) passes the same set.

**Recommendation:** Split into 4 focused hooks (Phase 3): `useScrollReset`, `useScrollCompensation`, `useDensityTransition`, `useEdgeDetection`.

### Finding 7: Test Coverage Gaps 🔴 CRITICAL (for refactoring)

7 test files out of 51 production files (14% file coverage):

| Tested | Untested (significant) |
|--------|----------------------|
| `search-store.ts` | `ImageTable.tsx` (1,301 lines) |
| `es-adapter.ts` | `ImageGrid.tsx` (475 lines) |
| `field-registry.ts` | `ImageDetail.tsx` (556 lines) |
| `cql-query-edit.ts` | `Scrubber.tsx` (948 lines) |
| `image-offset-cache.ts` | `useScrollEffects.ts` (691 lines) |
| `ErrorBoundary.tsx` | `sort-context.ts` (795 lines) |
| | `useDataWindow.ts` (228 lines) |
| | All other hooks |

The refactoring plan moves significant logic between files. Without tests, there is no safety net. Addressed by the throwaway testing harness (Phase 0).

### Finding 8: Flat Component Directory 🟡 MODERATE

16 components in a single `components/` directory. Manageable at 16 files, won't scale when editing, collections, crops, and uploads arrive.

**Recommendation:** Group by feature domain (Phase 4).

### Finding 9: (Subsumed into Finding 1 — DAL leaking upward)

### Finding 10: Inline SVG Duplication 🟡 MODERATE

SVG icons are inlined directly in JSX across 5+ components. The search magnifier is copy-pasted between `SearchBar` and `ImageDetail`.

**Recommendation:** Create `components/icons/` with named icon components, or adopt a tree-shakeable icon library (e.g. `lucide-react`).

### Finding 11: `getState()` Outside Store 🟡 MODERATE

12 call sites use `useSearchStore.getState()` outside the store — in components and hooks. Current usage reads multiple properties and performs complex logic (e.g., `useScrollEffects.ts` reads `imagePositions` and `bufferOffset` together), creating implicit subscriptions that bypass Zustand's selector system.

**Recommendation:** Centralise read logic as named store methods (e.g. `store.resolveImageGlobalIndex(imageId)`) rather than spreading it across components. Where possible, use `useRef`-based stable references.

### Finding 12: Missing Feature Layers 🟠 SIGNIFICANT

Kupua currently has no concept of:

- **Authentication** — needed for every Grid API call
- **Permissions** — Kahuna checks `canUpload`, `canArchive`, `canDelete`, `canEditMetadata` per user and per image
- **Write coordination** — Kahuna writes to metadata-editor, then polls media-api until ES reindexes (optimistic update with sync check)
- **Collections** — tree browsing, add/remove images, `dateAddedToCollection` sort
- **Crops** — viewing, creating, aspect ratio handling
- **Leases** — access control with date ranges, auto-leases from usage rights
- **Uploads** — drag-and-drop, file picker, job tracking, duplicate detection
- **Embedding** — iframe mode with `postMessage` for Composer integration

None of these can be built without the Grid API. The current architecture has no clean place to put them.

**Recommendation:** Plan the feature-directory structure now (Phase 4), even before the features are built, so the refactoring creates the right homes.

### Finding 13: Multi-Select Has No Architectural Home 🟠 SIGNIFICANT

`frontend-philosophy.md` §"Non-Negotiables" calls multi-select with batch metadata editing *"the core editorial workflow."* §"Selection is Not Focus" specifies: selection survives density changes, shift-click range, Cmd-click toggle, silent drop on search change. Selection is not in the URL — it's pure store state.

The structural audit mentions multi-select only once, in passing (Part D risk table). There is no `selection-store.ts` in the Phase 2 split, no `SelectionSet` type, no mention in the Phase 4 directory structure.

**Why this matters now, not later:** Multi-select cuts across *every* component and *every* store. `ImageTable` and `ImageGrid` need checkbox rendering. `ImageMetadata` needs multi-image diff display. `buffer-store` and `focus-store` need to keep selection orthogonal to focus. The `ActionBar` component (philosophy doc §"Actions are Written Once") derives `targetImages` from selection state. If the Phase 2 store split doesn't account for selection, adding it later means re-splitting stores.

**Recommendation:** Add `stores/selection-store.ts` to the Phase 2 store split (Step 2.3). Design the `SelectionSet` interface during Phase 2 — even if the store body is empty, its existence forces the other stores to respect the boundary.

### Finding 14: `sort-context.ts` (795 Lines) Contains Mixed Layers 🟡 MODERATE

`sort-context.ts` is larger than most components the audit targets for splitting. It contains both Layer 2 logic (sort display labels, sort-around-focus coordination, keyword distribution lookup) and Layer 3 logic (ES sort clause construction — `buildSortClause`, `parseSortField`, `buildReverseSortClause`).

Finding 1 already identifies `buildSortClause` and `parseSortField` as Layer 3 leaks. The Phase 2 DAL rehabilitation should naturally pull the ES-specific sort code into `dal/`. But the audit doesn't explicitly call out `sort-context.ts` as a file to split, and a developer following the plan might miss it.

**Recommendation:** Note in Phase 2 that `sort-context.ts` should be split: ES sort clause builders → `dal/` (Layer 3, ~400 lines), sort display/label logic → `lib/sort-context.ts` (Layer 2, ~400 lines).

### Finding 15: `image-offset-cache.ts` Ownership Unclear After Split 🟡 MODERATE

`image-offset-cache.ts` (has 15 unit tests) caches image-to-offset mappings and sort cursors in `sessionStorage` for cross-reload position restore. After the Phase 2 split, this responsibility straddles `buffer-store.ts` (which manages buffer positioning) and `enhanced-es-engine.ts` (which understands sort cursors).

**Recommendation:** Decide during Phase 2 whether this cache belongs in the buffer store (Layer 2 — it caches buffer-local offsets + UI position state) or the enhanced engine (Layer 3 — it caches ES sort cursors). The cache stores both `offset` and `cursor`, suggesting it should stay in `lib/` as a Layer 2 utility consumed by `buffer-store`, with `cursor` treated as an opaque blob.

---

## Part C — Phased Refactoring Plan

Each phase is **independently shippable** — the app continues working after each phase. Phases can be done by different people.

### Phase 0: Throwaway Testing Harness (0.5–1 day)

> Build this FIRST. It protects every subsequent phase.

#### Existing Test Infrastructure — What We Already Have

Kupua already has substantial test coverage that will serve as the primary safety net during refactoring. Understanding what exists avoids duplicating effort.

**Unit tests (Vitest) — ~164 test cases across 8 files:**

| File | Tests | Coverage |
|------|-------|----------|
| `search-store.test.ts` | ~42 | Core store: search, extend, seek, sort-around-focus, buffer management |
| `search-store-extended.test.ts` | ~44 | Extended store: PIT lifecycle, cooldowns, abort, edge cases |
| `es-adapter.test.ts` | — | ES adapter query building, sort clause construction |
| `field-registry.test.ts` | ~20 | Field definitions, accessor resolution, sort keys |
| `cql-query-edit.test.ts` | ~25 | CQL AST splice, polarity flip, field term matching |
| `image-offset-cache.test.ts` | ~15 | Search key building, sort value extraction, round-trip |
| `ErrorBoundary.test.tsx` | ~2 | Error boundary render + recovery |

The store tests use `MockDataSource` (deterministic, zero-network, tracks `requestCount`) — this is a working test-double pattern that the harness can reuse.

**E2E tests (Playwright) — 71 local + 10 manual smoke:**

| File | Tests | Coverage |
|------|-------|----------|
| `scrubber.spec.ts` | ~62 | Seek accuracy, drag, scroll, buffer extension, density switch, sort change, sort-around-focus, keyboard nav, metadata panel, 3 full workflows, bug regressions (#1–#18) |
| `buffer-corruption.spec.ts` | ~9 | Buffer integrity after reset-from-deep-seek (logo, metadata click, CQL change) |
| `manual-smoke-test.spec.ts` | ~10 | TEST-cluster-only: S1–S10 (keyword seek, deep scroll, scale validation) |

**E2E infrastructure already in place:**
- `global-setup.ts` — auto-starts Docker ES, verifies data, safety gate (refuses to run against real clusters)
- `helpers.ts` — `KupuaHelpers` fixture class with `seekTo()`, `dragScrubberTo()`, `assertPositionsConsistent()`, `getStoreState()`, `startConsoleCapture()`, density switching, focus management, image detail navigation
- `run-e2e.sh` — orchestrates Docker ES + data + Playwright

**Performance testing (Playwright, manual invocation only):**

| File | Tests | Coverage |
|------|-------|----------|
| `perf.spec.ts` | ~19 | P1–P16: load, scroll, seek, density switch, panel, sort, drag, traversal, fullscreen, column resize. Instruments CLS, LoAF, jank, DOM churn, focus drift. |
| `experiments.spec.ts` | ~6 | E1–E6: A/B testing for tuning knobs (overscan, page size, scroll speed tiers). Full probe suite with probe self-test diagnostics. |

- `run-audit.mjs` — automated harness: pins corpus via `PERF_STABLE_UNTIL`, runs multiple times, writes structured JSON results
- `PERF_BASELINE.md`-equivalent data already captured in `e2e-perf/results/` as structured JSON with git commit hashes

#### What's Missing — The Harness Gap

The existing tests are strong on *behaviour* but weak on *contracts*. The refactoring moves code between files without changing behaviour — the existing E2E tests catch regressions in user-visible outcomes. What's missing is contract-level protection for the internal interfaces being created:

**Component 1 — DAL Contract Tests** (new, ~3–4 hours)

**File:** `src/dal/__harness__/dal-contract.test.ts`

Tests the API-shaped subset of `ImageDataSource` (the 4-method interface defined in Step 2.1):

| Test | Assertion |
|------|-----------|
| `search({query: "london"})` | returns `{hits: Image[], total: number}` |
| `search({nonFree: "true"})` | total ≥ search without nonFree |
| `search({orderBy: "-uploadTime"})` | first hit is newest |
| `getById(knownId)` | returns an Image with matching id |
| `getById(unknownId)` | returns undefined |
| `count({})` | returns number ≥ 0 |
| `getAggregations(params, fields)` | returns `{fields: {[path]: {buckets, total}}}` |

**Implementation:** Create a `dal-contract-suite.ts` that accepts any `ImageDataSource` and runs the assertions. Run against both `MockDataSource` (fast) and optionally local Docker ES (slower, opt-in). This catches situations where the mock drifts from reality.

**Why throwaway:** Once the Grid API adapter exists, the contract tests should run against all three implementations with realistic fixtures.

**Component 2 — Visual Regression Screenshots** (new, ~2 hours)

**File:** `e2e/__harness__/visual-baseline.spec.ts`

Four Playwright screenshots with 0.1% tolerance:

1. `/search?nonFree=true` — grid view with results (default density)
2. Table view (after density toggle)
3. Image detail (after double-click)
4. `/search?query=test&orderBy=-taken` — search with query

**Why throwaway:** Long-term visual tests should be component-level (Storybook or similar), not full-page screenshots that become stale.

**Component 3 — Sort-Around-Focus Position Test** (addition to existing E2E, ~30 minutes)

The existing E2E suite tests `sortAroundFocusStatus` transitions and `focusedImageId` preservation. But it doesn't verify the *viewport position* — the image could be preserved in the store but rendered 5,000 rows away from where it was. Add one test to `scrubber.spec.ts`:

| Step | Assertion |
|------|-----------|
| Focus image, change sort field | Focused image's DOM element is within the viewport (not just `focusedImageId` unchanged in store) |

This is a 5-line addition to an existing test — uses the `getStoreState()` + `page.evaluate()` pattern already established in the helper.

#### What Already Covers the Harness Role

Several harness components from the original plan are **already covered** by existing tests and need not be built:

| Original harness component | Already covered by |
|---|---|
| Store state transition snapshots | `search-store.test.ts` + `search-store-extended.test.ts` (~86 tests): search, extend, seek, sort-around-focus, buffer management. Uses `MockDataSource` with Zustand `subscribe()`. |
| Scroll-position smoke test (return from detail) | `scrubber.spec.ts` tests 33–35 (density switch visibility), buffer-corruption tests (scroll position after reset), P12 (8 density switches with drift measurement) |
| Scroll-position smoke test (density toggle) | `scrubber.spec.ts`: multi-toggle drift test (5+ toggles at deep scroll, asserts visibility after each), density switch at deep seek |
| Performance baseline | `e2e-perf/results/` contains structured JSON baselines with git hashes. `run-audit.mjs` automates corpus-pinned multi-run measurement. |

#### Harness Lifecycle

| When | Action |
|------|--------|
| Before Phase 1 | Write DAL contract tests + visual baselines + sort-around-focus position test. Record perf baseline via `run-audit.mjs`. Commit harness files as `__harness__/` directories. |
| During Phases 1–4 | Run `npm test` (164 unit tests) + `npx playwright test` (71 E2E tests) + visual baseline check after every structural change. Re-measure perf via `run-audit.mjs` after each phase. |
| After Phase 4 | Review harness tests. Promote DAL contract tests into the main suite (they're useful permanently). Delete visual baselines. Remove `__harness__/` directories. |

#### Cost Estimate

| Component | Effort | Tests |
|-----------|--------|-------|
| DAL contract tests | 3–4 hours | ~10 tests |
| Visual regression screenshots | 2 hours | 4 screenshots |
| Sort-around-focus position | 30 minutes | 1 test |
| Perf baseline recording | 30 minutes | 3 metrics (automated) |
| **Total** | **~0.5–1 day** | **~15 new test cases + 3 perf metrics** |
| **Existing coverage leveraged** | — | **~235 tests (164 unit + 71 E2E)** |

---

### Phase 1: Extract Imperative Services from Components (2–3 days)

**Goal:** Fix circular dependencies. Establish Layer 2 as distinct from Layer 1.

**Step 1.1 — Create `lib/search-orchestration.ts`**

Move from `SearchBar.tsx`:
- `cancelSearchDebounce()`
- `getCqlInputGeneration()`
- `_debounceTimerId`, `_externalQuery`, `_cqlInputGeneration`

Move from `useUrlSearchSync.ts`:
- `resetSearchSync()`
- `_prevParamsSerialized`, `_prevSearchOnly`

Move from `useScrollEffects.ts`:
- `resetScrollAndFocusSearch()`
- `_virtualizerReset`, `_densityFocusSaved`, `_sortFocusRatio`
- `registerScrollContainer()` / `getScrollContainer()` (from `scroll-container-ref.ts`)

**Step 1.2 — Create `lib/reset-to-home.ts`**

Single `resetToHome()` function replacing the duplicated sequence in `SearchBar.tsx` and `ImageDetail.tsx`.

**Step 1.3 — Update all imports**

Components now import from `lib/`, not from each other. Import graph has no component→component edges for imperative functions.

**Validation:** Harness tests pass. `grep -r "from.*components/" src/components/` shows zero cross-component imperative imports. Perf baseline unchanged.

---

### Phase 2: Split the God Store and Rehabilitate the DAL (3–5 days)

**Goal:** Separate ES-specific logic from application state. Establish Layer 3 as distinct from Layer 2. Make Grid API integration a clear, bounded task. Preserve all performance characteristics.

This is the most important phase. It determines whether feature work (Phases 4–5 of the migration plan) can proceed efficiently.

**Step 2.1 — Define the "API-shaped" core interface**

Trim `ImageDataSource` to what the Grid API can serve today:

```typescript
interface ImageDataSource {
  search(params: SearchParams): Promise<SearchResult>;
  getById(id: string): Promise<Image | undefined>;
  count(params: SearchParams): Promise<number>;
  getAggregations(
    params: SearchParams,
    fields: AggregationRequest[],
    signal?: AbortSignal
  ): Promise<AggregationsResult>;
}
```

Each method maps to an existing Grid API endpoint:

| Method | Grid API endpoint | Notes |
|--------|------------------|-------|
| `search(params)` | `GET /images?q=…&offset=…&length=…` | media-api already supports all SearchParams |
| `getById(id)` | `GET /images/{id}` | media-api, returns HATEOAS entity |
| `count(params)` | `GET /images?countAll=true&length=0` | media-api, uses same search with zero hits |
| `getAggregations(params, fields)` | Requires new media-api endpoint, or client-side aggregation of existing search facets | See Step 2.2 backlog |

After this step, a developer can answer: *"What does the Grid API adapter need to implement?"* — these 4 methods.

**Step 2.2 — Create `dal/enhanced-es-engine.ts` — with future-API-shaped methods**

Move all ES-specific optimisations here. This module wraps the ES adapter but is **invisible to stores**.

The key design decision: each method in this module is shaped as if it were **already a Grid API call**. This means typed request/response contracts, `AbortSignal` support, and batch-capable signatures. If the Grid team later builds these into the API proper, kupua can swap the implementation from "local ES call" to "HTTP fetch" without changing any call site.

```typescript
// dal/enhanced-es-engine.ts — public interface

interface EnhancedSearchEngine {
  /**
   * Seek to a global offset, returning a page of results with cursors.
   *
   * Today: uses PIT + percentile estimation + search_after.
   * Future API shape: POST /images/seek { offset, length, sort, query }
   * Graceful degradation: offset pagination capped at 10k.
   */
  seekToPosition(
    params: SearchParams,
    globalOffset: number,
    signal?: AbortSignal,
  ): Promise<BufferPage>;

  /**
   * Extend the buffer forward from a cursor.
   *
   * Today: search_after with PIT.
   * Future API shape: GET /images?cursor=…&length=…
   * Graceful degradation: offset pagination (offset = bufferEnd).
   */
  extendForward(
    params: SearchParams,
    cursor: Cursor,
    signal?: AbortSignal,
  ): Promise<BufferPage>;

  /**
   * Extend the buffer backward from a cursor.
   *
   * Today: reverse search_after with PIT.
   * Future API shape: GET /images?cursorBefore=…&length=…
   * Graceful degradation: offset pagination (offset = max(0, bufferStart - length)).
   */
  extendBackward(
    params: SearchParams,
    cursor: Cursor,
    signal?: AbortSignal,
  ): Promise<BufferPage>;

  /**
   * Count documents before a sort position (for sort-around-focus).
   *
   * Today: range query counting docs with sort value < target.
   * Future API shape: GET /images/countBefore?sort=…&anchor=…&q=…
   * Graceful degradation: binary search over offset pagination, or
   *   accept ±page-size imprecision.
   */
  countBefore(
    params: SearchParams,
    sortPosition: SortAnchor,
    signal?: AbortSignal,
  ): Promise<number>;

  /**
   * Fetch the sort-field distribution for scrubber tooltip display.
   *
   * Today: date_histogram or composite aggregation over the sort field.
   * Future API shape: GET /images/sortDistribution?field=…&q=…
   * Graceful degradation: scrubber operates in seek-only mode (no tooltip).
   */
  fetchSortDistribution(
    params: SearchParams,
    field: string,
    direction: "asc" | "desc",
    signal?: AbortSignal,
  ): Promise<SortDistribution | null>;
}
```

Each method documents three things:
1. **What it does today** (ES implementation).
2. **What the future API call could look like** (request shape).
3. **How to degrade gracefully** if the API endpoint doesn't exist yet.

This creates an explicit **API enhancement backlog** — derived from code, not from memory:

| Enhanced method | Grid API status today | Future API shape | Graceful degradation |
|---|---|---|---|
| `seekToPosition` | Not in API | `POST /images/seek` | Offset pagination, capped at 10k |
| `extendForward` / `extendBackward` | Not in API (API uses offset/length) | `GET /images?cursor=…` | Offset pagination |
| `countBefore` | Not in API | `GET /images/countBefore` | Binary search over pages, or accept imprecision |
| `fetchSortDistribution` | Not in API | `GET /images/sortDistribution` | Scrubber enters seek-only mode |

When a product decision is made ("do we need deep seek via the API, or cap at 10k?"), the answer determines whether that method gets an API endpoint or uses the degradation path. The decision is bounded and auditable.

**Step 2.3 — Split the store**

**Existing stores to preserve:** `column-store.ts` (column visibility/widths, localStorage-persisted) and `panel-store.ts` (panel open/close, widths, section state) already exist as separate Zustand slices. These validate the multi-store pattern and should not be disturbed. The split below applies only to the monolithic `search-store.ts`.

| New file | Est. lines | Responsibility | Layer |
|----------|-----------|----------------|-------|
| `stores/search-store.ts` | ~200 | Query params, `setParams()`, URL sync coordination | 2 |
| `stores/buffer-store.ts` | ~400 | Windowed buffer, extend, seek, cursors. Consumes `EnhancedSearchEngine`. | 2 |
| `stores/aggregation-store.ts` | ~150 | Facet aggregations, circuit breaker, expanded aggs | 2 |
| `stores/focus-store.ts` | ~100 | `focusedImageId`, sort-around-focus generation/status | 2 |
| `stores/ticker-store.ts` | ~50 | New-images polling | 2 |
| `stores/sort-distribution-store.ts` | ~80 | Scrubber tooltip distribution, cache | 2 |
| `stores/selection-store.ts` | ~50 (interface only) | `SelectionSet`, shift-click range, Cmd-click toggle, silent drop on search change. Empty body initially — but the interface must exist so `focus-store` and `buffer-store` respect the boundary. See Finding 13. | 2 |
| `dal/enhanced-es-engine.ts` | ~500 | PIT, search_after, deep seek, distributions | 3 |

All stores are in Layer 2. They contain kupua-specific application logic. If Zustand were swapped for Signals or Jotai, the store *interfaces* remain identical — only the subscription mechanism changes.

**Step 2.3a — Consolidate tuning constants into `constants/tuning.ts`**

The tuning knobs documented in `tuning-knobs.md` are currently co-located in `search-store.ts` (lines 45–115): `BUFFER_CAPACITY`, `PAGE_SIZE`, `SCROLL_MODE_THRESHOLD`, `DEEP_SEEK_THRESHOLD`, `MAX_RESULT_WINDOW`, `AGG_DEBOUNCE_MS`, `AGG_CIRCUIT_BREAKER_MS`, `AGG_DEFAULT_SIZE`, `AGG_EXPANDED_SIZE`, `NEW_IMAGES_POLL_INTERVAL`. After the store split, these would scatter across 4+ files. The coupling map in `tuning-knobs.md` — which is the only document showing how these constants interact — would become stale.

**Action:** Create `constants/tuning.ts`. All tuning knobs live here with coupling relationships as JSDoc comments. Individual stores import from this file. The `tuning-knobs.md` file references this single source of truth. This is a 30-minute task that prevents hours of debugging.

**Step 2.3b — Establish explicit store-to-store coordination**

The current monolithic store has synchronous update sequences: `setParams` → `setLoading` → ES query → `setResults` → `setBufferOffset` → `setTotal` → `triggerAggregations` → `startNewImagesPoll`. In 6 stores communicating via `getState()`, this sequence must be explicitly orchestrated — not left for individual developers to solve ad hoc.

**Action:** Multi-store sequences are coordinated via named orchestration functions in `lib/search-orchestration.ts`. This file is also created in Phase 1 (Step 1.1) for imperative extraction from components. In Phase 2, it gains the store-coordination role:

```typescript
// lib/search-orchestration.ts — store coordination additions
async function executeSearch(params: SearchParams) {
  searchStore.getState().setParams(params);
  const results = await bufferStore.getState().fetchInitialPage(params);
  focusStore.getState().resolveAfterSearch(results);
  aggregationStore.getState().triggerAggregations(params);
  tickerStore.getState().resetPoll(params);
}
```

This is explicit imperative coordination, not pub/sub. The orchestration function is the one place that knows the sequence. Individual stores do not subscribe to each other's state changes.

**Step 2.3c — PIT lifecycle: session abstraction in `enhanced-es-engine.ts`**

Currently PIT lifecycle is managed in the monolithic store: open PIT on search, reuse across extends, close on new search. The audit moves PIT-related code to `enhanced-es-engine.ts` (Layer 3). But if `buffer-store` holds the PIT ID and passes it to engine methods, Layer 2 manages a Layer 3 concern.

**Action:** `enhanced-es-engine.ts` owns PIT open/close internally. It exposes an opaque `session` concept — `openSession()` returns a handle, `extendForward(session, ...)` uses it, `closeSession(session)` releases resources. `buffer-store` never sees a PIT ID. A future Grid API adapter's session might be a no-op or a server-side cursor token — the abstraction is the same.

**Step 2.3d — Split `sort-context.ts` (795 lines → ~400 + ~400)**

`sort-context.ts` contains both Layer 2 logic (sort display labels, sort-around-focus coordination, keyword distribution lookup) and Layer 3 logic (`buildSortClause`, `parseSortField`, `buildReverseSortClause`). Finding 1 identifies the Layer 3 leaks; this step makes the split explicit:

- ES sort clause builders → `dal/sort-builders.ts` (Layer 3, ~400 lines)
- Sort display/label logic → `lib/sort-context.ts` (Layer 2, ~400 lines)

Zustand slices communicate via `getState()` across stores — a documented Zustand pattern, supplemented by the explicit orchestration functions above.

**Performance note:** The store split must not introduce new subscriptions. Each component currently using `useSearchStore(selector)` must be rewired to `useBufferStore(selector)`, `useFocusStore(selector)`, etc., subscribing only to the slice it needs. This *reduces* unnecessary re-renders (a component consuming `focusedImageId` will no longer re-render when `bufferOffset` changes).

**Step 2.4 — Move module-level state into store-adjacent modules**

Each store's abort controllers, timers, and cooldowns live in the same file as the store, with a `_resetForTesting()` export.

**Validation:** DAL contract tests pass against the trimmed interface. State transition snapshots match. Perf baseline unchanged (or improved due to finer subscriptions).

---

### Phase 3: Split Mega-Components and the Scroll Hook (2–3 days)

**Goal:** Make files individually comprehensible. Enforce the Layer 1 / Layer 2 boundary within view code. No performance regressions — these are pure extractions.

**Step 3.1 — Split `useScrollEffects` (691 lines → 4 hooks)**

| New hook | Concern | Est. lines |
|----------|---------|-----------|
| `hooks/useScrollReset.ts` | Scroll-to-top on search/seek/sort | ~120 |
| `hooks/useScrollCompensation.ts` | Prepend/evict scroll offset adjustment | ~150 |
| `hooks/useDensityTransition.ts` | Save/restore focus ratio across grid↔table | ~120 |
| `hooks/useEdgeDetection.ts` | `reportVisibleRange` + extend triggering | ~80 |

Shared `ScrollGeometry` type moves to `types/scroll.ts`.

**Step 3.2 — Split `ImageTable.tsx` (1,301 lines → core ~600 lines + 5 extractions)**

| What | From (approx. lines) | To |
|------|------|---|
| Column def generation from field registry | 50–170 | `lib/table-columns.ts` |
| Canvas text measurement + font caching | 695–740 | `lib/measure-text.ts` |
| Sort click / double-click with delay timer | 800–870 | `hooks/useSortInteraction.ts` |
| Horizontal scroll proxy (sync + ResizeObserver) | 1000–1060 | `components/results/HorizontalScrollProxy.tsx` |
| Cell click-to-search (shift/alt, CQL upsert) | 920–970 | `hooks/useCellClickSearch.ts` |

After extraction, `ImageTable.tsx` contains: table setup, virtualiser, render loop, ARIA. ~600 lines — still large but each concern is identifiable.

**Step 3.3 — Split `Scrubber.tsx` (948 lines → core ~400 lines + 3 extractions)**

| What | To |
|------|---|
| Tooltip rendering + adaptive date formatting | `components/scrubber/ScrubberTooltip.tsx` |
| Track tick marks + label decimation + hover animation | `components/scrubber/TrackTicks.tsx` |
| Drag/seek interaction state machine | `hooks/useScrubberInteraction.ts` |

**Step 3.4 — Move scrubber data computation out of `routes/search.tsx`**

Create `hooks/useScrubberData.ts` — encapsulates the 6 store subscriptions, `getSortLabel` callback, tick cache, and lazy-fetch trigger. The route becomes ~50 lines.

**Validation:** Visual regression screenshots match baseline. Scroll-position smoke test passes. Perf baseline unchanged (pure code movement, no new allocations or render cycles).

---

### Phase 4: Prepare Feature Homes + Icon Extraction (1 day)

**Goal:** Create directory structure for upcoming features. Extract duplicated SVGs. No functional changes.

```
src/
  components/
    search/           ← SearchBar, CqlSearchInput, SearchFilters, SearchPill, DateFilter, StatusBar
    results/          ← ImageGrid, ImageTable, ColumnContextMenu, HorizontalScrollProxy
    detail/           ← ImageDetail
    metadata/         ← ImageMetadata
    scrubber/         ← Scrubber, ScrubberTooltip, TrackTicks
    layout/           ← PanelLayout, ErrorBoundary
    facets/           ← FacetFilters
    icons/            ← SearchIcon, ChevronIcon, PanelIcon, SortArrow (from inline SVGs)
    [future: edits/, collections/, crops/, uploads/, leases/]
  dal/
    types.ts              ← API-shaped core interface (4 methods)
    es-adapter.ts         ← Raw ES HTTP calls
    enhanced-es-engine.ts ← PIT, search_after, deep seek, distributions (future-API-shaped)
    sort-builders.ts      ← ES sort clause construction (from sort-context.ts Layer 3 split)
    es-config.ts
    mock-data-source.ts
    [future: grid-api-adapter.ts]
  stores/
    search-store.ts       ← Query params only
    buffer-store.ts       ← Windowed buffer
    aggregation-store.ts
    focus-store.ts
    ticker-store.ts
    sort-distribution-store.ts
    selection-store.ts    ← SelectionSet interface (empty body initially)
    column-store.ts       ← (existing — unchanged)
    panel-store.ts        ← (existing — unchanged)
    [future: edit-store.ts, collection-store.ts]
  services/
    [future: edit-service.ts — optimistic updates + API polling]
    [future: auth-service.ts]
    [future: upload-service.ts]
  lib/
    search-orchestration.ts
    reset-to-home.ts
    table-columns.ts
    measure-text.ts
    cql.ts
    field-registry.ts
    sort-context.ts
    search-params-schema.ts
    grid-config.ts
    ...existing...
  hooks/
    useScrollReset.ts
    useScrollCompensation.ts
    useDensityTransition.ts
    useEdgeDetection.ts
    useSortInteraction.ts
    useCellClickSearch.ts
    useScrubberInteraction.ts
    useScrubberData.ts
    useDataWindow.ts
    useUrlSearchSync.ts
    ...existing...
  types/
    image.ts
    scroll.ts
    ...existing...
```

**Validation:** `npm run build` succeeds. All tests pass. Perf baseline unchanged.

---

### Phase Summary

| Phase | Days | Risk | What breaks if skipped |
|-------|------|------|------------------------|
| **0: Testing Harness** | 0.5–1 | Low | No safety net; regressions (including perf) ship silently |
| **1: Extract Services** | 2–3 | Low | Circular deps block edit service; logo reset diverges |
| **2: Split Store + DAL** | 3–5 | Medium | Grid API adapter impossible; no parallel work on store; API enhancement backlog invisible; perf characteristics entangled with business logic |
| **3: Split Components** | 2–3 | Low | 1,300-line files block feature work; new devs can't orient |
| **4: Prepare Homes** | 1 | None | Entropy grows; new features land in flat directory |
| **Total** | **8.5–13 days** | | |

---

## Part D — Risk Assessment

| Risk | Without refactoring | With refactoring |
|------|---------------------|------------------|
| **Grid API integration stalls** — DAL boundary defeated; "Phase 3" becomes a rewrite | High — must rewrite store, seek, sort, CQL | Low — 4-method interface is a clear spec; enhanced engine has future-API shapes ready |
| **API enhancement backlog invisible** — wrong decisions made about what to build | High — knowledge trapped in 1,800-line store | Low — `enhanced-es-engine.ts` is the explicit catalogue with documented degradation paths |
| **Performance degrades during refactoring** — scroll, seek, or search slows down | Medium — no baseline, no tests | Low — perf baseline measured, re-checked each phase, harness catches scroll regressions |
| **Library swap needed** (TanStack → AG Grid, Zustand → Signals) | High — logic entangled with library calls across all files | Medium — contained to Layer 1 or Layer 2 |
| **New developer cannot onboard** | High — 2–4 week ramp-up (1,800-line store, 1,300-line component) | Low — each file ≤400 lines, clear layer boundaries |
| **Scroll regression during refactoring** | High — no tests on any scroll hook | Low — harness smoke test catches it |
| **Parallel feature work blocked** — two devs can't touch the store | High — serialised delivery | Low — 6 independent store slices |
| **Edit feature introduces data corruption** — no write coordination | Medium (future) — metadata edits overwritten on next ES reindex | Low — DAL rehabilitation + future `edit-service.ts` via Grid APIs |

---

## Recommendation

Spend **9–14 developer-days** now (including the harness). This investment pays for itself at the first of:

- Second developer joins the project,
- Phase 3 (Grid API integration) begins,
- Any library swap is evaluated, or
- A performance-sensitive feature (e.g. multi-select with bulk operations) is attempted.

Without it, Phase 3 alone will cost 3–5× more and carry substantially higher risk of both functional regression and performance degradation.

