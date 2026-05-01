<!-- AGENT PROTOCOL
STOP! If you do NOT see your own "🤖 Agent check-in" entry at the bottom of the
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

**Phase S1 complete.** Ready for Phase S2 (desktop tickbox UI + SelectionStatusBar).

## Session Log

- **Phase S0 started 1 May 2026.**
- Added `"_mget"` to `ALLOWED_ES_PATHS` in `es-config.ts`. Updated `infra-safeguards.md` §3 to reflect the addition.
- Added `IdRangeResult` type and `getByIds` / `getIdRange` interface methods to `dal/types.ts`.
- Added `RANGE_HARD_CAP` (5000), `RANGE_SOFT_CAP` (2000), `RANGE_CHUNK_SIZE` (1000) to `constants/tuning.ts`.
- Implemented `getByIds` in `ElasticsearchDataSource`: 1000-ID chunks via `_mget`, run in `Promise.all` parallel. Hard cap read dynamically via `import.meta.env` (same pattern as `BUCKET_SIZE` in `findKeywordSortValue`) so `vi.stubEnv()` works in tests.
- Implemented `getIdRange` in `ElasticsearchDataSource`: `search_after` walk with `_source: false`, stops when a hit sorts past `toCursor`, respects hard cap (also read dynamically).
- Added `_sortValuesStrictlyAfter` private static helper on the class (null-safe comparison).
- Implemented `getByIds` and `getIdRange` in `MockDataSource`.
- Created `src/dal/selections-dal.test.ts`: 22 tests, all passing. Covers: empty input, single-batch fetch, missing-ID filtering, 1000-ID batching, abort, ES errors, truncation semantics (truncated=true when cap+1, false when exactly at cap), stop-at-toCursor, and interface contract shape.
- **All 452 tests pass (25 test files).**
- **Decision:** `RANGE_HARD_CAP` is read dynamically inside `getIdRange` / `getByIds` rather than as a module-level import, matching the existing `findKeywordSortValue` pattern and making `vi.stubEnv()` work without module re-import.
- **Phase S0.5 started 1 May 2026.**
- Created `e2e-perf/selection-stress.spec.ts`: 6 tests (SS0–SS4, SS2a+SS2b). SS0 (sessionStorage write baseline) runs now. SS1–SS4 skip gracefully until `window.__kupua_selection_store__` is exposed (S1/S2). All 5 measurement helper functions defined with correct signatures — S1+ only fills in TODOs.
- Updated `playwright.perf.config.ts` testMatch to include `selection-stress.spec.ts`.
- **Store accessor convention locked:** `window.__kupua_selection_store__` — S1 must expose this.
- **Phase S0.5 complete.**
- **Phase S1 started 1 May 2026.**
- Created `src/lib/interpretClick.ts`: pure `interpretClick(ctx) → ClickEffect[]` function, rule table from architecture §5. 16 tests in `interpretClick.test.ts`, all green.
- Created `src/lib/reconcile.ts`: `recomputeAll`, `reconcileAdd`, `reconcileRemove`, `hasDirtyFields`. Incremental O(F) add/remove; dirty-field marker on remove from mixed. 25 tests in `reconcile.test.ts`, all green. **Deviation:** `all-same`/`all-empty` carry a `count` field (not in architecture typedef) — required for correct `valueCount` when transitioning to `mixed`. Logged in deviations.md needed.
- Created `src/stores/selection-store.ts`: Zustand store with sessionStorage persist (debounced 250ms), LRU metadata cache (cap 5k), idle-frame reconciliation scheduler. Cohesion rules enforced: `toggle`/`setAnchor` both call `ensureMetadata`. `window.__kupua_selection_store__` exposed for Playwright perf tests.
- Added `SELECTION_PERSIST_DEBOUNCE_MS` (250), `SELECTION_METADATA_LRU_CAP` (5000), `SELECTION_RECONCILE_CHUNK_SIZE` (500) to `constants/tuning.ts`.
- Added `_resetMetadataCache()`, `_resetDebounceState()`, `_resetReconcileQueue()` test helpers — needed because LruMap state persists across tests.
- 38 tests in `selection-store.test.ts`. Fixed test assertion: `ensureMetadata` calls `getByIds(ids)` with no signal arg; `expect.anything()` fails on `undefined`. Corrected to `toHaveBeenCalledWith([id])`.
- **All 529 tests pass (28 test files).**
- **Phase S1 complete.**
- **Sense-check after S1 (1 May 2026):** three real null-zone bugs in `getIdRange` discovered — cursor pass-back not sanitised, `_sortValuesStrictlyAfter` asc-biased, no two-phase walk. Plus two minor (`add()` over-marks pending; dead `RANGE_HARD_CAP` import). All hoisted into `selections-workplan.md` Phase S3a as "MUST address before S3a is done." S1 is complete; S2 (no `getIdRange` calls) can proceed without these fixes.
