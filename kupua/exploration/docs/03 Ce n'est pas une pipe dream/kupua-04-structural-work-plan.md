# Kupua — Structural Work Plan

**Authors:** Staff Engineering Manager + Staff Engineers
**Date:** 2 April 2026
**Status:** Partially executed — see Execution Status below
**Audience:** Development team (execute), engineering leadership (review), product (observe)
**Supersedes:** Plan sections in `02-kupua-structural-audit.md` (Part C) and `03-kupua-structural-rearchitecture.md` (Part E). Those sections should no longer be used for planning — this document is the single source of truth for execution.

---

## Execution Status (updated 3 April 2026)

`05-kupua-realistic-work-plan.md` extracted the safest, highest-value subset of this
plan and executed it on 3 April 2026 in three sessions (~2 hours total). The table below
shows current status. **Phases marked ✓ or ◐ should not be re-executed.** Phases marked
✗ remain valid designs for when a team picks up the work.

| Phase / Step | Status | Notes |
|---|---|---|
| **Phase 0: Testing Harness** | **◐ Partial** | DAL contract tests, visual baselines, sort-around-focus test, reset-from-deep test: all created and committed. Write-path stub tests NOT created (no `ImageWriteService` interface exists yet). Perf baseline NOT recorded (deferred until store split is attempted). |
| **Phase 1: Extract Imperative Services** | **✓ Done** | `lib/orchestration/search.ts` created, `lib/reset-to-home.ts` created, all imports updated, scroll-container-ref moved. Zero cross-component imperative imports confirmed. |
| **Phase 2 Step 2.4: Tuning Constants** | **✓ Done** | `constants/tuning.ts` created with all 10 constants + JSDoc coupling docs. |
| **Phase 2 Step 2.5: Sort-context split + cql.ts move** | **✓ Done** | Sort builders → `dal/adapters/elasticsearch/sort-builders.ts`. `cql.ts` → `dal/adapters/elasticsearch/cql.ts`. `sort-context.ts` now Layer 2 only. |
| Phase 2 Step 2.1: Service Contracts | ✗ Not started | Deferred — one implementor, one consumer. See 05 §"What these sessions do NOT attempt". |
| Phase 2 Step 2.2: Enhanced Engine | ✗ Not started | Deferred — depends on contracts. |
| Phase 2 Step 2.3: Store Split | ✗ Not started | Deferred — highest risk item. See 05 rationale. |
| Phase 2 Steps 2.6–2.9 | ✗ Not started | Depend on store split. |
| **Phase 3: Split Components** | ✗ Not started | Deferred — comprehension benefit only matters when second developer joins. |
| **Phase 4: Feature Homes + Extensions** | ✗ Not started | Deferred — no extension consumers exist. |


**Cross-references:**

| Document | What it provides | Read it for… |
|---|---|---|
| `01-kupua-refactoring-assessment.md` | Assessment of 02's plan against future features | Feature stress-test (Part 2), gap analysis, extension surface rationale (Part 3) |
| `02-kupua-structural-audit.md` | Structural findings, existing test inventory | Findings 1–15 (Part B), existing test infrastructure detail (Part C Phase 0) |
| `03-kupua-structural-rearchitecture.md` | Governing principles, service contract catalogue, AppImage design, extension surface types | Principles (Part A), full contract type definitions (Part B), AppImage deferred design (Part C), extension types (Part D) |

---

## Executive Summary

This document is the single execution plan for kupua's 5-phase structural rearchitecture. It combines the phased plans from the structural audit (02) and rearchitecture proposal (03) into one authoritative sequence, incorporating all amendments from the refactoring assessment (01).

The rearchitecture takes a fast, well-engineered read-only image browser and gives it the structural foundations to become a full editorial tool — without degrading its performance or breaking its existing behaviour.

**Total estimated effort: ~10–14 developer-days.** Each phase is independently shippable. The app continues working after each phase. Phases can be executed by different developers.

**The single most important outcome:** After Phase 2, kupua has typed service contracts (`ImageSearchService`, `ImageWriteService`), 7 independent store slices, and a clean DAL boundary. This unblocks parallel feature work, makes Grid API integration a bounded task, and makes the backend enhancement backlog visible to product.

### What This Plan Does NOT Cover

These are explicitly out of scope — they are real concerns but belong in separate documents:

1. **Line-by-line code changes.** Each phase section below will later be expanded into its own detailed implementation document.
2. **Grid API adapter implementation.** The rearchitecture *prepares* for it by defining contracts.
3. **Degraded UX under the Grid API.** Product decisions, negotiated per-method against the contract catalogue in 03 Part B.
4. **Timeline/sprint allocation.** This plan estimates developer-days per phase. Scheduling is a team decision.
5. **The actual write features** (metadata editing UI, crop editor, collection tree, upload page). This plan gives them a clean home.

---

## Phase Overview

| Phase | Name | Days | Risk | Key Deliverable | Depends On |
|---|---|---|---|---|---|
| **0** | Testing Harness | 0.5–1 | Low | DAL contract tests + write-path stubs + perf baseline | — |
| **1** | Extract Imperative Services | 2–3 | Low | Zero cross-component imperative imports; `lib/orchestration/` directory | Phase 0 |
| **2** | Service Contracts + Store Split + DAL | 3–5 | Medium | 2 service contracts in code, 7 store slices, enhanced engine behind contract, extension public hooks. Three internal checkpoints (A/B/C) — see Phase 2. | Phase 1 |
| **3** | Split Components + Hooks | 2–3 | Low | All files ≤600 lines; 4 scroll hooks; 8 component extractions | Phase 2 |
| **4** | Feature Homes + Extension Surface | 1–1.5 | None | Directory structure; extension registration (panel/action types + registry); field registration API | Phase 3 |

---

## Governing Decisions

These decisions are **settled**. They are not re-debated during execution. Each is documented with rationale in the referenced section.

### Principles

Five governing principles apply to every phase. When principles conflict, numbering is the tiebreaker. → Full rationale: 03 Part A.

| # | Principle | One-line summary |
|---|---|---|
| 1 | Three-Layer Separation | View components (Layer 1) → application logic (Layer 2) → data access (Layer 3). Each layer replaceable independently. |
| 2 | Performance Protection | No new render cycles, no new network round-trips, no new allocations on scroll hot path. Measurable baseline re-checked each phase. |
| 3 | Separation of Concerns | Each concern has exactly one home. Decision rule: "which layer?" — if ambiguous, the code does too much. |
| 4 | Extension Surface | Stable, documented APIs for third-party panels, actions, and fields — without forking. |
| 5 | Service Contracts As-If | Typed interfaces shaped as if every backend endpoint already existed. `[EXISTS]` = integration spec. `[TBD]` = backend backlog. |

### Key Design Decisions

| # | Decision | Rationale | Reference |
|---|---|---|---|
| 1 | **Composition, not inheritance.** `ImageDataSource` (4 methods, what Grid API implements) is the constructor input to `EnhancedSearchEngine`, which produces `ImageSearchService` (9 methods, what stores consume). Two distinct interfaces. | Keeps "what Grid API must implement" visually distinct from "what kupua uses." | 03 §B.1 |
| 2 | **AppImage deferred.** Phase 2 code uses the current `Image` type throughout. `AppImage` is documented design-only (03 Part C), introduced when Grid API integration starts. | Mechanical rename later (1–2 hrs) costs less than carrying an exercised-by-nothing wrapper through 50 files for months. | 03 Part C |
| 3 | **`WriteResult` has no `optimistic` field.** Optimistic local display is handled by `buffer-store.patchLocalImage()` in the orchestration function, not by the service contract. | The API doesn't return an optimistic value — kupua constructs it locally from the patch. Keeping this in orchestration keeps the write service a clean API wrapper. | 03 §B.2 |
| 4 | **`extensions/hooks.ts` created in Phase 2** alongside the store split — not deferred to Phase 4. Phase 4 adds registration machinery only. | Store interfaces should be designed with the public API in mind from the start. | 03 §E Step 2.3-ext |
| 5 | **No `buffer-store.injectExternalUpdate()`.** WebSocket/SSE support is months away. Adding the method when needed is a 10-minute task. | Speculative abstraction with zero current consumers. | Decided during conflict resolution (this document) |
| 6 | **Contract interfaces in `dal/contracts/`.** Adapters in `dal/adapters/`. Workflow orchestration in `lib/orchestration/`. Shared write infrastructure in `services/`.** | Clear separation of *what* (contracts) from *how* (adapters) from *when/sequence* (orchestration). | 03 §B.2 "Where things live" |
| 7 | **Tier 1 contracts (search + writes) enter code in Phase 2. Tier 2 contracts (collections, crops, leases, uploads, auth, batch) remain in 03 Part B as documentation until a developer starts building that feature.** | Speculative `.ts` interfaces create maintenance burden with zero return until the feature is built. | 03 Part A §5, 03 Part B |
| 8 | **Directory tree is cumulative end-state with `[P0]`–`[P4]`/`[existing]` annotations.** Each phase creates only its annotated items. | Developers see the full picture; phase annotations tell them what's theirs. | 03 §E Phase 4 |

---

## End-State Directory Tree

This shows the state of `src/` after all five phases. Annotations indicate which phase creates or modifies each item. Items marked `[existing]` are not touched. Items marked `[future]` are not created during the rearchitecture — they are documented homes for upcoming feature work.

```
src/
  components/
    search/           ← [P4] SearchBar, CqlSearchInput, SearchFilters, SearchPill, DateFilter, StatusBar
    results/          ← [P3] ImageGrid, ImageTable, ColumnContextMenu, HorizontalScrollProxy
    detail/           ← [P4] ImageDetail
    metadata/         ← [P4] ImageMetadata
    scrubber/         ← [P3] Scrubber, ScrubberTooltip, TrackTicks
    layout/           ← [P4] PanelLayout, ErrorBoundary, ActionBar
    facets/           ← [P4] FacetFilters
    icons/            ← [P4] SearchIcon, ChevronIcon, PanelIcon, SortArrow
    [future: edits/, collections/, crops/, uploads/, leases/]
  dal/
    contracts/            ← [P2] ImageDataSource (4 methods), ImageSearchService (9), ImageWriteService
                          ← Tier 2 enters here when features are built
    adapters/
      elasticsearch/      ← [P2] ES adapter + enhanced engine + sort builders + cql.ts
      stubs/              ← [P2] StubImageWriteService (throws "not implemented")
      [future: grid-api/] ← Grid API adapters (one per service)
    es-config.ts          ← [existing]
    types.ts              ← [P2] Cursor, BufferPage, WriteResult, shared DAL types
  stores/
    search-store.ts           ← [P2] Query params only
    buffer-store.ts           ← [P2] Windowed buffer (with patchLocalImage, refreshImage)
    aggregation-store.ts      ← [P2]
    focus-store.ts            ← [P2]
    selection-store.ts        ← [P2] SelectionSet interface
    ticker-store.ts           ← [P2]
    sort-distribution-store.ts ← [P2]
    column-store.ts           ← [existing, unchanged]
    panel-store.ts            ← [existing, unchanged]
    [future: collection-store.ts, upload-store.ts]
  extensions/
    hooks.ts              ← [P2] Stable public selectors (useFocusedImage, useSelectedImages, etc.)
    types.ts              ← [P4] PanelRegistration, ActionRegistration, ExtensionPanelProps
    registry.ts           ← [P4] registerPanel(), registerAction(), getRegistered*()
    README.md             ← [P4] Extension API documentation
  lib/
    orchestration/
      search.ts           ← [P1] Search, seek, sort-around-focus coordination
      README.md           ← [P1] Pattern documentation
      [future: edit.ts, upload.ts, collection.ts, crop.ts]
    reset-to-home.ts      ← [P1]
    field-registry.ts     ← [existing, registerField() added P4]
    sort-context.ts       ← [existing] Already Layer 2 only (sort display/label logic, tick generation)
    table-columns.ts      ← [P3]
    measure-text.ts       ← [P3]
    cql.ts                ← [P2] moved to dal/adapters/elasticsearch/ (ES-specific)
    ...existing lib files...
  hooks/
    useScrollReset.ts         ← [P3]
    useScrollCompensation.ts  ← [P3]
    useDensityTransition.ts   ← [P3]
    useEdgeDetection.ts       ← [P3]
    useSortInteraction.ts     ← [P3]
    useCellClickSearch.ts     ← [P3]
    useScrubberInteraction.ts ← [P3]
    useScrubberData.ts        ← [P3]
    useDataWindow.ts          ← [existing]
    useUrlSearchSync.ts       ← [existing, trimmed P1]
    ...existing hooks...
  services/
    README.md             ← [P4] Documents the write-coordinator pattern
    [future: write-coordinator.ts — shared poll-until-confirmed logic]
  types/
    image.ts              ← [existing] Image type (AppImage deferred — see 03 Part C)
    scroll.ts             ← [P3]
    ...existing...
  constants/
    tuning.ts             ← [P2]
```

---

## Cross-Phase Validation Protocol

This protocol applies after every phase. It is not repeated in individual phase sections — each phase lists only phase-specific validation criteria in addition to this protocol.

1. **Unit tests pass.** `npm test` — all ~164 existing unit tests + any new tests from Phase 0.
2. **E2E tests pass.** `npx playwright test` — all ~71 existing E2E tests.
3. **Visual regression.** Phase 0 baseline screenshots match (0.1% pixel tolerance).
4. **Performance baseline.** Re-measure via `run-audit.mjs` after each phase. Compare against Phase 0 baseline. **If any metric degrades by >10%, investigate before proceeding to the next phase.** Three metrics: (a) time-to-first-result (cold search), (b) extend-forward latency (p95 over 20 extends), (c) deep-seek latency (seek to position 50,000).
5. **Build succeeds.** `npm run build` — zero errors, zero type errors.

→ Existing test infrastructure details: 02 Part C Phase 0 ("Existing Test Infrastructure — What We Already Have").

---

## Phase 0: Testing Harness

**Goal:** Build the safety net that protects every subsequent phase.

**Duration:** 0.5–1 day · **Risk:** Low · **Depends on:** Nothing

### Scope

Phase 0 creates *contract-level* test coverage for the internal interfaces being created in later phases. It does **not** duplicate existing behavioural tests — those already exist (164 unit tests, 71 E2E tests, 19 perf tests). The gap is contract protection: ensuring the interfaces created in Phase 2 are tested as interfaces, not just as implementations.

### Deliverables

#### 0.1 — DAL Contract Tests

**File:** `src/dal/__harness__/dal-contract.test.ts`

A reusable contract test suite (`dal-contract-suite.ts`) that accepts any `ImageDataSource` implementation and verifies the 4-method core interface:

| Test | Assertion |
|------|-----------|
| `search({query: "london"})` | Returns `{hits: Image[], total: number}` |
| `search({nonFree: "true"})` | `total` ≥ search without `nonFree` |
| `search({orderBy: "-uploadTime"})` | First hit is newest |
| `getById(knownId)` | Returns `Image` with matching id |
| `getById(unknownId)` | Returns `undefined` |
| `count({})` | Returns `number ≥ 0` |
| `getAggregations(params, fields)` | Returns `{fields: {[path]: {buckets, total}}}` |

Run against both `MockDataSource` (fast, in CI) and optionally local Docker ES (slower, opt-in via env flag).

**Why throwaway:** Once the Grid API adapter exists, these tests run against all three implementations with realistic fixtures. They graduate from `__harness__/` to the main test suite.

→ Detail on `MockDataSource` pattern: 02 Part C Phase 0.

#### 0.2 — Write-Path Contract Stubs

**File:** `src/dal/__harness__/write-contract.test.ts`

Every `ImageWriteService` method is called and asserts `throws "not implemented"`. This confirms the stub exists and the interface is importable. Makes the Grid API write surface visible from day one.

→ Full `ImageWriteService` type definition: 03 §B.2.

#### 0.3 — Visual Regression Baseline

**File:** `e2e/__harness__/visual-baseline.spec.ts`

Four Playwright screenshots at 0.1% pixel tolerance:

1. `/search?nonFree=true` — grid view with results (default density)
2. Table view (after density toggle)
3. Image detail (after double-click)
4. `/search?query=test&orderBy=-taken` — search with query

**Why throwaway:** Long-term visual tests should be component-level (Storybook or similar). These full-page screenshots catch layout regressions during the rearchitecture and are deleted after Phase 4.

#### 0.4 — Sort-Around-Focus Position Test

**Addition to:** `e2e/scrubber.spec.ts` (existing file)

One test (~5 lines): focus an image, change sort field, assert the focused image's DOM element is within the viewport — not just that `focusedImageId` is preserved in the store, but that the image is *visible*.

→ Uses the `getStoreState()` + `page.evaluate()` pattern from existing `KupuaHelpers`.

#### 0.5 — Performance Baseline Recording

Run `run-audit.mjs` (existing infrastructure). Record the three baseline metrics. This is the "before" measurement that all subsequent phases are compared against.

→ Existing perf infrastructure: 02 Part C Phase 0 ("Performance testing").

### Phase-Specific Validation

- All new `__harness__/` tests pass.
- Visual baseline screenshots are committed.
- Perf baseline JSON is committed with git hash.
- Existing 164 unit + 71 E2E tests still pass (no regressions from adding harness files).

### Harness Lifecycle

| When | Action |
|------|--------|
| Before Phase 1 | Commit harness files as `__harness__/` directories. |
| During Phases 1–4 | Run after every structural change. |
| After Phase 4 | Promote DAL contract tests to main suite. Delete visual baselines and `__harness__/` directories. |

---

## Phase 1: Extract Imperative Services

**Goal:** Fix circular dependencies. Establish Layer 2 as distinct from Layer 1. Create the orchestration directory pattern.

**Duration:** 2–3 days · **Risk:** Low · **Depends on:** Phase 0

### Problem Being Solved

Components import from other components for imperative functions — not for rendering. `SearchBar.tsx` exports `cancelSearchDebounce()`, which `ImageTable.tsx`, `ImageMetadata.tsx`, and `FacetFilters` import. `SearchBar` is simultaneously a UI component and a service module. 16 module-level `let` variables across 6 files act as hidden global state.

→ Full details: 02 Findings 2, 3, 4.

### Deliverables

#### 1.1 — Create `lib/orchestration/search.ts`

Move imperative orchestration out of components and hooks into a dedicated Layer 2 module.

| From | What moves | To |
|---|---|---|
| `SearchBar.tsx` | `cancelSearchDebounce()`, `getCqlInputGeneration()`, `_debounceTimerId`, `_externalQuery`, `_cqlInputGeneration` | `lib/orchestration/search.ts` |
| `useUrlSearchSync.ts` | `resetSearchSync()`, `_prevParamsSerialized`, `_prevSearchOnly` | `lib/orchestration/search.ts` |
| `useScrollEffects.ts` | `resetScrollAndFocusSearch()`, `_virtualizerReset`, `_densityFocusSaved`, `_sortFocusRatio` | `lib/orchestration/search.ts` |
| `scroll-container-ref.ts` | `registerScrollContainer()`, `getScrollContainer()`, `_el` | `lib/orchestration/search.ts` |

Create `lib/orchestration/README.md` documenting the pattern: one file per workflow domain. Future orchestration files are listed but not created:

- `edit.ts` — edit metadata → poll → refresh buffer
- `upload.ts` — upload → track → poll → refresh search
- `collection.ts` — add/remove images ↔ collections
- `crop.ts` — create crop → poll → refresh

#### 1.2 — Create `lib/reset-to-home.ts`

Extract the duplicated 5-line reset sequence from `SearchBar.tsx` and `ImageDetail.tsx` into a single `resetToHome()` function.

**Currently duplicated:**
```typescript
resetSearchSync();
resetScrollAndFocusSearch();
const store = useSearchStore.getState();
store.setParams({ query: undefined, offset: 0 });
store.search();
```

→ Full details: 02 Finding 4.

#### 1.3 — Update all imports

Components now import from `lib/`, not from each other. The dependency arrow is strictly downward: `components → hooks → lib → dal`.

### Phase-Specific Validation

- `grep -r "from.*components/" src/components/` shows **zero cross-component imperative imports** (rendering imports like shared UI primitives are fine; imperative function imports are not).
- `SearchBar.tsx` exports only React component(s) — no imperative functions.
- Module-level `let` variables that moved out of `SearchBar.tsx`, `useUrlSearchSync.ts`, `useScrollEffects.ts`, and `scroll-container-ref.ts` are no longer in those files.
- Cross-phase validation protocol passes (all tests, perf baseline unchanged).

---

## Phase 2: Service Contracts + Store Split + DAL

**Goal:** Define the two most important service contracts in code. Split the monolithic store into 7 slices. Rehabilitate the DAL boundary. Create extension public hooks. This is the heaviest phase — and the one that pays for everything after.

**Duration:** 3–5 days · **Risk:** Medium · **Depends on:** Phase 1

### Problem Being Solved

The monolithic `search-store.ts` (~1,800 lines) contains query params, buffer management, deep-seek logic, PIT lifecycle, aggregations, focus tracking, new-image polling, and scrubber distribution fetching. It imports ES sort-clause builders directly — the DAL boundary has collapsed. The `ImageDataSource` interface has grown to 15+ ES-specific methods. A Grid API adapter cannot be written against it.

→ Full details: 02 Finding 1.

### Intermediate Checkpoints

Phase 2 has 9 steps and is estimated at 3–5 days. That is realistic for a senior developer familiar with the codebase, but risky for anyone else — a half-finished store split with orchestration wired to some stores but not others is the worst possible state to debug.

Phase 2 is therefore structured as **three checkpoints**. Each checkpoint is independently shippable: all tests pass, the app works, and work can pause or transfer to another developer. Steps within a checkpoint may have intermediate commits, but the checkpoint is the "safe to stop" boundary.

| Checkpoint | Steps | What's true after | Est. days |
|---|---|---|---|
| **A — Contracts + Engine** | 2.1, 2.2 | New files exist (`dal/contracts/`, enhanced engine, stub write service). Old monolith store is untouched. All tests pass — nothing changed. | 1–1.5 |
| **B — Store Split** | 2.3, 2.4, 2.5, 2.6, 2.7 | Monolith replaced by 7 stores. Tuning constants consolidated. Sort-context split. Module-level state moved. Orchestration wired. All existing tests pass against new structure. | 1.5–2.5 |
| **C — Extension + Selection** | 2.8, 2.9 | Selection interface defined. Extension public hooks exist. All tests pass. | 0.5 |

**Checkpoint A is pure addition** — new files, zero changes to existing code. A developer can ship this and walk away. It's also a natural handoff point if someone else picks up the store split.

**Checkpoint B is the hard part.** The store split, tuning consolidation, sort-context split, module-state migration, and orchestration wiring are interdependent — you can't ship a half-split store where orchestration calls stores that don't exist yet. But within Checkpoint B, the recommended extraction order (see Step 2.3) is designed so that each individual store extraction is a separate commit with all tests passing. If a developer extracts `ticker-store` and `sort-distribution-store` and then hits problems, those two extractions are independently useful — the monolith is smaller and the extracted stores are clean.

**Checkpoint C is pure addition** again — new files layered on top of the split stores.

### Step 2.1 — Define Tier 1 Service Contracts

Create `dal/contracts/` with three files:

| File | Interface | Methods | Role |
|---|---|---|---|
| `data-source.ts` | `ImageDataSource` | 4 | What the Grid API adapter must implement |
| `search-service.ts` | `ImageSearchService` | 9 | What stores consume (superset of `ImageDataSource`) |
| `write-service.ts` | `ImageWriteService` | 10 | What write orchestration consumes |

**`ImageDataSource` — the Grid API contract (4 methods):**

```typescript
interface ImageDataSource {
  search(params: SearchParams, signal?: AbortSignal): Promise<SearchResult>;
  getById(id: string, signal?: AbortSignal): Promise<Image | undefined>;
  count(params: SearchParams, signal?: AbortSignal): Promise<number>;
  getAggregations(params: SearchParams, fields: AggregationField[], signal?: AbortSignal): Promise<AggregationsResult>;
}
```

Each maps to an existing Grid API endpoint. This is the answer to "what does the Grid API adapter need to implement?"

**`ImageSearchService` — what stores consume (9 methods):**

The 4 `ImageDataSource` methods plus 5 enhanced methods: `seekToPosition`, `extendForward`, `extendBackward`, `countBefore`, `getSortDistribution`. Each enhanced method is tagged `[TBD]` — it has no Grid API endpoint today but has a documented candidate shape.

**Composition:** `ImageDataSource` is the constructor input to `EnhancedSearchEngine`. The engine wraps the core 4 methods and adds the 5 enhanced methods using ES primitives. The result conforms to `ImageSearchService`. Stores import `ImageSearchService` — they never see `ImageDataSource` or the enhanced engine.

```
ImageDataSource (4)  →  EnhancedSearchEngine(core)  →  ImageSearchService (9)
```

**`ImageWriteService` — what write orchestration consumes (10 methods):**

`updateMetadata`, `setUsageRights`, `addLabels`, `removeLabel`, `setPhotoshoot`, `setArchived`, `deleteImage`, `undeleteImage`, `getUsageRightsCategories`. All tagged `[EXISTS]`. Plus the `WriteResult` type (`confirmed: Promise<Image>`, `abort: () => void`).

Create `dal/adapters/stubs/stub-write-service.ts` — every method throws `"not implemented"`. Physical barrier against direct-ES writes.

→ Full method signatures, JSDoc, `[EXISTS]`/`[TBD]` tags, and Grid API endpoint mapping: 03 §B.1 and §B.2.

### Step 2.2 — Create the Enhanced Engine

`dal/adapters/elasticsearch/enhanced-es-engine.ts` — the implementation behind `ImageSearchService`.

- Wraps `es-adapter.ts` (raw ES HTTP calls).
- Implements `[TBD]` methods using ES primitives: PIT + percentile estimation (`seekToPosition`), `search_after` with PIT (`extendForward`, `extendBackward`), range query (`countBefore`), date histogram / composite aggregation (`getSortDistribution`).
- PIT lifecycle encapsulated as an opaque session. `buffer-store` never sees a PIT ID. A future Grid API adapter's "session" might be a no-op or a server-side cursor token.
- Each method documents: what it does today (ES), what the future API call could look like, and how to degrade gracefully if the API endpoint doesn't exist.

→ Full enhanced engine interface with degradation paths: 02 Part C Step 2.2.

#### Diagnostic observability requirement

The enhanced engine encapsulates kupua's most complex algorithms — percentile estimation, PIT lifecycle, composite aggregation walking, binary search on tiebreaker fields — behind a clean `seekToPosition(params, offset)` interface. This is architecturally correct, but it adds call-stack depth: `orchestration → buffer-store → ImageSearchService → EnhancedSearchEngine → es-adapter → ES` is 5 hops instead of the current 2 (store → es-adapter). When these algorithms fail (and they will — these are the most failure-prone code paths in kupua), raw ES errors bubbling up are useless. A developer needs to know *which* algorithm failed, *what the intermediate state was*, and *what was tried*.

This is not an argument against the abstraction — it is a requirement *on* the abstraction. The enhanced engine must surface **structured diagnostic information**, not just results:

1. **Structured errors with operational context.** Each engine method catches failures and wraps them with context before rethrowing. The goal: a developer reading the error message can diagnose the failure without adding `console.log` statements and reproducing.

   | Method | Error context must include |
   |---|---|
   | `seekToPosition` | Target offset, percentile estimate tried, `countBefore` validation result, delta between estimate and actual, whether fallback was triggered |
   | `extendForward` / `extendBackward` | Cursor used, PIT state (open/closed/expired), `search_after` sort values, result count vs. expected |
   | `countBefore` | Sort anchor, range query bounds, total returned |
   | `getSortDistribution` | Field, aggregation type used (date_histogram vs. composite), bucket count, whether capped |

   Example error: `"seekToPosition failed at target offset 45,000: percentile estimate landed at 47,200 (delta 2,200 exceeds threshold 500). Binary search fallback attempted, exhausted 8 iterations. Last countBefore returned 44,800."` — not `"search_phase_execution_exception"`.

2. **Operation metadata on results.** The existing `took` and `seekTime` tracking in the current store must survive the refactor — it moves into the engine and becomes enrichable. Each engine method returns (or attaches to its result) timing and step-count metadata: how many ES round-trips were needed, which estimation strategy was used (percentile vs. binary search vs. offset-fallback), whether a PIT was re-opened. This feeds the perf baseline measurements (Phase 0) and future developer tooling.

3. **Structured warnings for non-fatal degradation.** When the engine silently falls back to a slower path — percentile estimate is imprecise but within tolerance, PIT expired and was re-opened, composite aggregation was capped — it logs a structured warning rather than silently succeeding. A developer looking at the console during development can see that the engine took an unexpected path without having to reproduce the failure.

These are **not aspirational goals** — they are validation criteria for Step 2.2. The detailed implementation plan for this step must specify the error shapes and metadata fields.

**✓ Checkpoint A complete.** After Steps 2.1 and 2.2: contracts, engine, and stub are new files. Old monolith store is untouched. All tests pass. Safe to ship, pause, or hand off.

### Step 2.3 — Split the Monolithic Store

Split `search-store.ts` into 7 stores. Existing `column-store.ts` and `panel-store.ts` are untouched — they already validate the multi-store pattern.

| New store | Responsibility | Est. lines |
|---|---|---|
| `search-store.ts` | Query params, `setParams()`, URL sync coordination | ~200 |
| `buffer-store.ts` | Windowed buffer, extend, seek, cursors. Consumes `ImageSearchService`. Exposes `patchLocalImage()` and `refreshImage()` for future write support. | ~400 |
| `aggregation-store.ts` | Facet aggregations, circuit breaker, expanded aggs | ~150 |
| `focus-store.ts` | `focusedImageId`, sort-around-focus generation/status | ~100 |
| `selection-store.ts` | `SelectionSet` (see Step 2.8 below) | ~50 (interface) |
| `ticker-store.ts` | New-images polling | ~50 |
| `sort-distribution-store.ts` | Scrubber tooltip distribution, cache | ~80 |

**Recommended extraction order** (simplest-and-most-isolated first, most-coupled last):

1. **`ticker-store`** — ~50 lines, no cross-store dependencies, isolated timer. Extract, update imports, run tests.
2. **`sort-distribution-store`** — ~80 lines, reads params but doesn't write to other stores. Extract, update imports, run tests.
3. **`aggregation-store`** — ~150 lines, reads params, has its own circuit breaker and debounce timer. Extract, update imports, run tests.
4. **`focus-store`** — ~100 lines, reads buffer for sort-around-focus. Extract, update imports, run tests.
5. **`search-store`** (params only) — ~200 lines, the residual query-params-and-URL-sync slice. What remains in the monolith after this point is the buffer logic.
6. **`buffer-store`** — ~400 lines, the largest slice, depends on `ImageSearchService` (from Checkpoint A) and interacts with `focus-store` via orchestration. Extract last because everything else must be in place.

**Each extraction should be a separate commit with all tests passing.** If work stalls after extracting 3 of 7 stores, those extractions are independently useful — the monolith is smaller, the extracted stores are clean, and the test suite confirms nothing broke. This is the escape hatch within Checkpoint B: partial progress is real progress.

**Performance note:** Each component currently using `useSearchStore(selector)` must be rewired to the appropriate slice store (`useBufferStore(selector)`, `useFocusStore(selector)`, etc.), subscribing only to what it needs. This *reduces* unnecessary re-renders — a component consuming `focusedImageId` no longer re-renders when `bufferOffset` changes.

### Step 2.4 — Tuning Constants Consolidation

Create `constants/tuning.ts`. All tuning knobs currently in `search-store.ts` (lines 45–115) move here: `BUFFER_CAPACITY`, `PAGE_SIZE`, `SCROLL_MODE_THRESHOLD`, `DEEP_SEEK_THRESHOLD`, `MAX_RESULT_WINDOW`, `AGG_DEBOUNCE_MS`, `AGG_CIRCUIT_BREAKER_MS`, `AGG_DEFAULT_SIZE`, `AGG_EXPANDED_SIZE`, `NEW_IMAGES_POLL_INTERVAL`.

Coupling relationships documented as JSDoc comments. Individual stores import from this file.

→ Tuning knob coupling map: `tuning-knobs.md`.

### Step 2.5 — Extract sort builders from `es-adapter.ts` + Move `cql.ts`

The ES sort clause builder functions currently live in `dal/es-adapter.ts` (~1,139 lines) alongside the HTTP/fetch code. They are pure functions and should be separated into their own file within the ES adapter directory. `sort-context.ts` (795 lines) is purely Layer 2 code (sort display/label logic, sort-around-focus coordination) and stays where it is.

| What | From | To | Layer |
|---|---|---|---|
| ES sort clause builders (`buildSortClause`, `parseSortField`, `reverseSortClause`) + sort aliases map | `dal/es-adapter.ts` | `dal/adapters/elasticsearch/sort-builders.ts` | 3 |

`sort-context.ts` remains in `lib/` (Layer 2) — it contains only sort display/label logic, adaptive date granularity, keyword distribution binary search, and track tick generation. No ES-specific code.

→ Full details: 02 Finding 14.

**Also move `cql.ts` to `dal/adapters/elasticsearch/`.** `cql.ts` translates CQL query strings into ES query DSL (`must`/`mustNot` clauses). This is ES-specific — the Grid API accepts CQL as a string parameter and does its own query building server-side. When the Grid API adapter arrives, it doesn't need `cql.ts` at all — it passes the CQL string through. Currently in `lib/` (Layer 2), it belongs in `dal/adapters/elasticsearch/` (Layer 3) alongside `sort-builders.ts`. Small move, but placing it correctly now avoids a "why is this here?" moment during Grid API integration.

### Step 2.6 — Store-to-Store Coordination

Multi-store sequences are coordinated via named orchestration functions in `lib/orchestration/search.ts` (created in Phase 1, gaining store-coordination role in Phase 2):

```typescript
async function executeSearch(params: SearchParams) {
  searchStore.setParams(params);
  const results = await bufferStore.fetchInitialPage(params);
  focusStore.resolveAfterSearch(results);
  selectionStore.reconcileWithResults(new Set(results.hits.map(h => h.id)));
  aggregationStore.triggerAggregations(params);
  tickerStore.resetPoll(params);
}
```

This is **explicit imperative coordination** — not pub/sub. The orchestration function is the one place that knows the sequence. Individual stores do not subscribe to each other's state changes. This is the mandatory pattern for all future multi-store workflows.

### Step 2.7 — Move Module-Level State

Each store's abort controllers, timers, and cooldowns move into the same file as their store, with a `_resetForTesting()` export. No more hidden module-level singletons in component files or hook files.

→ Full details: 02 Finding 2.

**✓ Checkpoint B complete.** After Steps 2.3–2.7: monolith replaced by 7 stores, tuning constants consolidated, sort-context split, module-level state relocated, orchestration wired. All existing tests pass against the new structure. The app works identically. Safe to ship, pause, or hand off.

### Step 2.8 — SelectionStore Interface

Selection is the foundation of batch operations — the "core editorial workflow." Define the interface now, even if the body is minimal:

```typescript
interface SelectionStore {
  selectedIds: Set<string>;
  toggle(id: string): void;
  rangeSelect(fromId: string, toId: string, orderedIds: string[]): void;
  selectAll(visibleIds: string[]): void;
  clear(): void;
  reconcileWithResults(survivingIds: Set<string>): void;
  getSelectedImages(): Image[];
}
```

**Why the interface must exist now:** Selection interacts with every other store. `buffer-store` eviction must consider selected images. `focus-store` must keep focus orthogonal to selection. `search-store` changes trigger selection reconciliation. The `ActionBar` derives `targetImages` from selection/focus state. If the store split doesn't account for selection, adding it later means re-splitting.

→ Full interaction analysis: 01 Gap 2.

### Step 2.9 — Extension Public Hooks

Create `extensions/hooks.ts` — 6 one-liner functions wrapping internal store selectors:

```typescript
export const useFocusedImage = () => useFocusStore(s => s.focusedImage);
export const useSelectedImages = () => useSelectionStore(s => s.getSelectedImages());
export const useSearchContext = () => useSearchStore(s => ({ query: s.params.query, total: s.total, params: s.params }));
export const useSearchResults = () => useBufferStore(s => s.results);
export const useDensity = () => useSearchStore(s => s.params.density ?? 'grid');
export const useIsImageDetailOpen = () => useSearchStore(s => !!s.params.image);
```

These are the stability contract for extensions. Internal store shapes can change freely; these hooks must not break. Created now — during the store split — so the store interfaces are designed with the public API in mind.

Phase 4 adds the registration machinery (panel/action types, registry, README). This step provides only the data access layer for extensions.

→ Full extension type definitions: 03 Part D.

**✓ Checkpoint C complete.** After Steps 2.8–2.9: selection interface defined, extension hooks exist, all tests pass. Phase 2 is done.

### Phase-Specific Validation

- DAL contract tests (Phase 0) pass against the trimmed `ImageDataSource` interface.
- Write-path contract stubs (Phase 0) still throw `"not implemented"` — confirming the stub exists and is wired.
- `search-store.ts` no longer exists as a monolith — replaced by 7 store files.
- No store file imports from `es-adapter.ts` or any `dal/adapters/` file directly. Stores import only from `dal/contracts/`.
- Enhanced engine methods produce structured errors with operational context (not raw ES errors) — verified by at least one test per `[TBD]` method that asserts error shape on a forced failure.
- Enhanced engine methods return operation metadata (`took`, round-trip count, strategy used) — verified by inspecting return values in existing seek/extend tests.
- `extensions/hooks.ts` exists and each hook resolves against its store.
- State transition snapshots from existing store tests match (behaviour preserved despite split).
- Cross-phase validation protocol passes. Perf baseline unchanged or improved (finer subscriptions → fewer re-renders).

---

## Phase 3: Split Components + Hooks

**Goal:** Make files individually comprehensible. Enforce the Layer 1 / Layer 2 boundary within view code. No functional changes — pure extractions.

**Duration:** 2–3 days · **Risk:** Low · **Depends on:** Phase 2

### Problem Being Solved

Three files dominate the component layer: `useScrollEffects.ts` (691 lines, 12 `useEffect` blocks), `ImageTable.tsx` (1,301 lines), and `Scrubber.tsx` (948 lines). A fourth concern — scrubber data computation — lives in `routes/search.tsx` (a route acting as a business-logic host). New developers cannot orient.

→ Full details: 02 Findings 5, 6.

### 3.1 — Split `useScrollEffects.ts` (691 lines → 4 hooks)

| New hook | Concern | Est. lines |
|----------|---------|-----------|
| `hooks/useScrollReset.ts` | Scroll-to-top on search/seek/sort | ~120 |
| `hooks/useScrollCompensation.ts` | Prepend/evict scroll offset adjustment | ~150 |
| `hooks/useDensityTransition.ts` | Save/restore focus ratio across grid↔table | ~120 |
| `hooks/useEdgeDetection.ts` | `reportVisibleRange` + extend triggering | ~80 |

Shared `ScrollGeometry` type moves to `types/scroll.ts`.

**Critical constraint:** These are cut-and-paste extractions at the module boundary, not redesigns. No new closures or objects on the scroll hot path. The existing `useEffect`/`useLayoutEffect` blocks move wholesale.

### 3.2 — Split `ImageTable.tsx` (1,301 lines → core ~600 lines + 5 extractions)

| Extraction | Approx. source lines | Destination |
|---|---|---|
| Column def generation from field registry | 50–170 | `lib/table-columns.ts` |
| Canvas text measurement + font caching | 695–740 | `lib/measure-text.ts` |
| Sort click / double-click with delay timer | 800–870 | `hooks/useSortInteraction.ts` |
| Horizontal scroll proxy (sync + ResizeObserver) | 1000–1060 | `components/results/HorizontalScrollProxy.tsx` |
| Cell click-to-search (shift/alt, CQL upsert) | 920–970 | `hooks/useCellClickSearch.ts` |

After extraction, `ImageTable.tsx` contains: table setup, virtualiser, render loop, ARIA. ~600 lines — still large but each concern is identifiable.

**Note from 01:** `useCellClickSearch.ts` should be designed so custom panels can reuse click-to-search behaviour without importing table-specific code.

### 3.3 — Split `Scrubber.tsx` (948 lines → core ~400 lines + 3 extractions)

| Extraction | Destination |
|---|---|
| Tooltip rendering + adaptive date formatting | `components/scrubber/ScrubberTooltip.tsx` |
| Track tick marks + label decimation + hover animation | `components/scrubber/TrackTicks.tsx` |
| Drag/seek interaction state machine | `hooks/useScrubberInteraction.ts` |

### 3.4 — Move Scrubber Data Computation Out of Route

Create `hooks/useScrubberData.ts` — encapsulates the 6 store subscriptions, `getSortLabel` callback, tick cache, and lazy-fetch trigger that currently live in `routes/search.tsx`. The route becomes ~50 lines.

→ Full details: 02 Finding 5.

### Phase-Specific Validation

- Visual regression screenshots match Phase 0 baseline (pure code movement — layout must not change).
- No file in `components/` exceeds ~600 lines.
- `useScrollEffects.ts` no longer exists — replaced by 4 hooks.
- Scroll-position smoke test passes (sort-around-focus, density toggle).
- Cross-phase validation protocol passes. Perf baseline unchanged (no new allocations or render cycles).

---

## Phase 4: Feature Homes + Extension Surface

**Goal:** Create directory structure for upcoming features. Build the extension registration skeleton. Extract duplicated SVG icons. No functional changes.

**Duration:** 1–1.5 days · **Risk:** None · **Depends on:** Phase 3

### 4.1 — Component Directory Reorganisation

Move components from the flat `components/` directory into feature-grouped subdirectories:

| Subdirectory | Components moved |
|---|---|
| `components/search/` | SearchBar, CqlSearchInput, SearchFilters, SearchPill, DateFilter, StatusBar |
| `components/detail/` | ImageDetail |
| `components/metadata/` | ImageMetadata |
| `components/layout/` | PanelLayout, ErrorBoundary, ActionBar |
| `components/facets/` | FacetFilters |

`components/results/` and `components/scrubber/` already exist from Phase 3 extractions.

Document `[future]` directories (not created): `edits/`, `collections/`, `crops/`, `uploads/`, `leases/`.

### 4.2 — Icon Extraction

Create `components/icons/` with named icon components: `SearchIcon`, `ChevronIcon`, `PanelIcon`, `SortArrow` (extracted from inline SVGs duplicated across 5+ components).

→ Full details: 02 Finding 10.

### 4.3 — Extension Registration Skeleton

**`extensions/types.ts`** — Panel and action registration interfaces:

```typescript
interface PanelRegistration {
  id: string;
  label: string;
  position: 'left' | 'right';
  component: React.ComponentType<ExtensionPanelProps>;
  when?: (ctx: ExtensionContext) => boolean;
}

interface ActionRegistration {
  id: string;
  label: string | ((images: Image[]) => string);
  icon?: React.ComponentType;
  target: 'focused' | 'selected' | 'both';
  enabled?: (images: Image[]) => boolean;
  execute: (images: Image[]) => Promise<void>;
}
```

**`extensions/registry.ts`** — Registration functions: `registerPanel()`, `registerAction()`, `getRegisteredPanels()`, `getRegisteredActions()`.

**`extensions/README.md`** — Extension API documentation for third-party integrators: import from `extensions/hooks.ts` for data, `extensions/registry.ts` for registration. Never import from internal stores or `dal/adapters/`.

→ Full extension type definitions including `ExtensionPanelProps`, `ExtensionContext`: 03 Part D.

### 4.4 — Field Registration API

Add `registerField()` and `registerFields()` to `lib/field-registry.ts`. Organisations register custom fields in their deployment entry point. Fields appear in the table, metadata panel, and facet filters automatically.

→ Full details: 03 §D.4.

### 4.5 — Services Directory

Create `services/README.md` documenting the pattern for future write-coordination code: shared poll-until-confirmed logic, auth session management, etc. The directory is a documented home — no implementation files yet.

### Phase-Specific Validation

- `npm run build` succeeds.
- All tests pass.
- No component imports from the old flat `components/` paths (all updated).
- `extensions/hooks.ts` (from Phase 2) + `extensions/types.ts` + `extensions/registry.ts` are all importable with no type errors.
- Cross-phase validation protocol passes. Perf baseline unchanged.

---

## Harness Lifecycle

| When | Action |
|------|--------|
| Phase 0 complete | Harness files committed as `__harness__/` directories. Visual baselines committed. Perf baseline recorded. |
| During Phases 1–4 | Run `npm test` + `npx playwright test` + visual baseline check after every structural change. Re-measure perf via `run-audit.mjs` after each phase. |
| After Phase 4 | Review harness tests. **Promote** DAL contract tests into the main test suite (they're useful permanently). **Delete** visual baseline screenshots and `__harness__/` directories. |

---

## Risk Register

| Risk | Without rearchitecture | With rearchitecture | Mitigated by |
|---|---|---|---|
| **"What backend endpoints do we need?"** — product asks, nobody knows | High — knowledge trapped in 1,800-line store + tribal memory | **Low — read the contract catalogue.** 41 methods, 33 exist, 7 TBD. | Phase 2 contracts + 03 Part B |
| **Grid API integration stalls** — DAL boundary defeated | High — must rewrite store, seek, sort, CQL | Low — implement `ImageDataSource` (4 methods). Enhanced engine wraps the rest. | Phase 2 DAL rehabilitation |
| **New service needed** (e.g. batch-edits) | High — no spec for what frontend needs | Low — `BatchOperationService` interface already defines input/output | 03 §B.8 |
| **Third-party org needs custom panel** | Impossible — no extension surface | Feasible — register panel, consume public hooks | Phase 2 hooks + Phase 4 registry |
| **Performance degrades during rearchitecture** | Medium — no baseline, no tests | Low — perf baseline measured each phase, >10% threshold | Phase 0 baseline + cross-phase protocol |
| **Parallel feature work blocked** | High — serialised on one mega-store | Low — 7 independent store slices + contract interfaces | Phase 2 store split |
| **New developer onboarding** | 2–4 weeks (1,800-line store, 1,301-line component) | ~1 week (each file ≤400 lines, clear contracts) | Phases 2 + 3 |
| **Library swap needed** (TanStack → AG Grid, Zustand → Signals) | High — logic entangled with library calls across all files | Medium — contained to Layer 1 or Layer 2 | Three-layer separation (all phases) |
| **Edit feature introduces data corruption** — no write coordination | Medium — metadata edits overwritten on next ES reindex | Low — stub write service is physical barrier; future writes go through Grid APIs | Phase 2 `StubImageWriteService` |
| **Phase 2 store split stalls mid-way** — developer gets halfway, hits out-of-order orchestration bugs, debugging across 7 files | Medium — no sub-phase safe states defined | Low — 3 checkpoints (A/B/C), each independently shippable. Within Checkpoint B, recommended extraction order from simplest to most coupled, each extraction a separate passing commit. | Phase 2 checkpoints + extraction order |
| **Enhanced engine failures are opaque** — 5-hop call stack, raw ES errors surface with no context | Medium — complex algorithms hidden behind clean interface | Low — structured errors with operational context, operation metadata, warnings for non-fatal degradation paths. Validated by error-shape tests. | Phase 2 Step 2.2 diagnostic observability requirement |

---

## Appendix A: Cross-Reference Guide

| If you need… | Read… |
|---|---|
| Full `ImageSearchService` type definition with JSDoc | 03 §B.1 |
| Full `ImageWriteService` type definition with JSDoc | 03 §B.2 |
| `ImageDataSource` → `EnhancedSearchEngine` → `ImageSearchService` composition diagram | 03 §B.1 |
| `WriteResult` design rationale (no optimistic field) | 03 §B.2 (note after `WriteResult`) |
| Tier 2 service contracts (collections, crops, leases, uploads, auth, batch) | 03 §B.3–B.8 |
| Backend backlog summary (41 methods, 33 exist, 7 TBD) | 03 Part B "Summary: The Backend Backlog" |
| `AppImage` deferred design (for when Grid API integration starts) | 03 Part C |
| Extension surface type definitions (`PanelRegistration`, `ActionRegistration`, `ExtensionPanelProps`) | 03 Part D |
| Structural audit findings (1–15) | 02 Part B |
| Existing test infrastructure inventory | 02 Part C Phase 0 |
| Enhanced engine interface with graceful degradation paths | 02 Part C Step 2.2 |
| Feature-by-feature stress test (22 features assessed) | 01 Part 2 |
| Extension surface rationale and gaps | 01 Part 3 |
| Write-coordination pattern (optimistic → poll → confirm) | 01 Gap 1 + 03 §B.2 orchestration example |
| SelectionStore interaction analysis (which stores it touches) | 01 Gap 2 |
| Governing principles with full rationale | 03 Part A |
| Tuning knob coupling map | `tuning-knobs.md` |

## Appendix B: Glossary

| Term | Definition |
|---|---|
| **DAL** | Data Access Layer — Layer 3. Service contracts + adapters. |
| **Enhanced engine** | `EnhancedSearchEngine` — wraps `ImageDataSource` (4 methods) and adds 5 ES-specific methods to produce `ImageSearchService` (9 methods). Lives in `dal/adapters/elasticsearch/`. |
| **PIT** | Point In Time — an Elasticsearch primitive that creates a consistent snapshot for cursor-based pagination. Encapsulated as an opaque session inside the enhanced engine. |
| **`[EXISTS]`** | Tag on a service contract method indicating a working Grid API endpoint exists today. |
| **`[TBD]`** | Tag on a service contract method indicating no Grid API endpoint exists. Backend must build it or kupua degrades gracefully. |
| **Tier 1 contract** | `ImageSearchService` + `ImageWriteService` — enters code during Phase 2. |
| **Tier 2 contract** | Collections, crops, leases, uploads, auth, batch — documented in 03 Part B, enters code when the feature is built. |
| **Orchestration function** | A named function in `lib/orchestration/` that coordinates multi-store sequences. The mandatory pattern for all cross-store workflows. Not pub/sub. |
| **Extension hook** | A function in `extensions/hooks.ts` that wraps an internal store selector. The stability contract for third-party code. |
| **`AppImage`** | A future wrapper type around `Image` that adds HATEOAS capabilities. Deferred — not used in this rearchitecture. Design documented in 03 Part C. |
| **Contract catalogue** | The complete set of 8 service contracts (41 methods) in 03 Part B. Two in code (Tier 1), six in documentation (Tier 2). |
| **Checkpoint** | A sub-phase boundary within Phase 2 where all tests pass, the app works, and work can safely pause or transfer. Three checkpoints: A (contracts + engine), B (store split), C (extension + selection). |

