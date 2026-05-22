# Kupua Dead-Code & Over-Abstraction Audit — Findings

**Status:** Complete (supplemented with knip pass)
**Date:** 2026-05-22 (knip supplement: 2026-05-22)
**Auditor:** Copilot (Claude Sonnet 4.6)
**Handoff doc:** `kupua/exploration/docs/dead-code-and-over-abstraction-audit-handoff.md`
**Prior audit:** `kupua/exploration/docs/zz Archive/dead-code-audit-findings.md` (2026-04-29)

> **Reviewer filter applied 2026-05-22.** Removed 12 findings (#6, 7, 8, 9, 10, 12, 13, 14, 15, 23, 24, 25) that were "remove `export` keyword only" on a type still used inside its own file. Cost of removal: one keyword. Cost of next-time-someone-needs-it: re-add `export`. Net value too low to brief an implementer on. The pattern was inherited from the prior audit and should be dropped going forward. Original numbering preserved (gaps in the table reflect the removed rows) so external references stay valid. Items kept: anything with real LOC reclaim, or where removing the export reveals a fully-dead symbol (#22 unused singleton, #26 becomes fully dead once #20 lands).

---

## Section 1 — Methodology

**Tools run:**
- `node_modules/.bin/tsc --noEmit` from `kupua/` — 8 × TS6133 "declared but never read" errors, 6 in src files (2 in test files, out of scope). These are in the findings table.
- `knip` — installed into kupua devDependencies in a second pass after the manual grep sweep. Run as `node_modules/.bin/knip` from `kupua/`; exit 1 is normal (knip exits 1 whenever it finds issues). Findings cross-referenced against the 19 manual-grep findings; 8 new items added (#20–#27). Knip's unused-file detection caught `useToast.ts` (#20), which pure export-grep would miss.
- `grep -r` / `rg` — all D1 claims verified by searching `kupua/src/` for `import.*SymbolName`. Each Proof cell shows the command run. Unsandboxed `rg` was used for bulk sweeps; `grep -r --include='*.ts' --include='*.tsx'` was used for confirmation when sandbox-mode rg returned suspicious nulls (one false-negative caught and corrected for `isTwoTierFromTotal`).

**Files read end-to-end:** `src/lib/image-borders.ts`, `src/lib/typeahead-fields.ts`, `src/lib/graphic-image-blur.ts`, `src/lib/perceived-trace.ts`, `src/types/image.ts`, `src/lib/cost/validity-map.ts`, `src/lib/cost/types.ts`, `src/stores/column-store.ts`, `src/dal/grid-api/argo.ts`, `src/dal/grid-api/errors.ts`, `src/dal/index.ts`, `src/lib/history-snapshot.ts` (interface section).

**Files sampled** (grep-based export tracing): `src/lib/orchestration/search.ts`, `src/lib/image-prefetch.ts`, `src/lib/image-urls.ts`, `src/lib/keyboard-shortcuts.ts`, `src/dal/adapters/elasticsearch/cql.ts`, `src/stores/selection-store.ts`, `src/stores/enrichment-store.ts`, `src/stores/toast-store.ts`, `src/stores/collection-store.ts`, `src/stores/panel-store.ts`, `src/stores/ui-prefs-store.ts`, `src/hooks/useDataWindow.ts`, `src/lib/scroll-geometry-ref.ts`, `src/lib/image-offset-cache.ts`, `src/stores/search-store.ts` (exports only).

**Prior audit comparison:** Re-verified all 36 prior-audit findings. 26 were fixed between 2026-04-29 and today (see bottom of this section). 5 were not executed and carry over as findings #1–#5.

**False positives ruled out:**
- `isTwoTierFromTotal` (`two-tier.ts`) — first rg search returned nothing due to sandbox; grep -r confirmed 9 callers in `useScrollEffects.ts`, `useDataWindow.ts`, `build-history-snapshot.ts`. Not dead.
- `buildColourMap` (`collection-store.ts`) — used by `ImageGrid.tsx`.
- `buildSubtreeCounts` (`collection-store.ts`) — used by `collection-store.test.ts` (test-only, but kept as it is a pure function tested in isolation with no inline-able equivalent). Not reported.
- `argo.ts` functions used by `grid-api-adapter.ts` (`mergeReconciledFields`, `parseArgoErrorBody`, `unwrapResponse`, `unwrapSearchHits`) — production callers exist.
- `getOverQuotaSuppliers` (`quota-store.ts`) — used by `cql.ts:365`.
- A subset of grid-api `types.ts` types — `ImageData`, `SearchHitImageData`, `SearchResponseRaw`, `EntityResponse`, `EmbeddedEntity` — are consumed by `grid-api-adapter.ts`. The remaining 26 exported types are dead (confirmed by knip and manual grep) and are reported as finding #27.

**Prior audit items confirmed fixed (not re-reported):**
`prepend-transform.ts` deleted (#1), `resetSearchSync` deleted (#2), `prefetchLog` export removed (#8), `DEFAULT_SEARCH` re-export removed (#9), `lookupSortDistribution` export removed (#10), `computeTrackTicks` export removed (#11), `markDetailEnteredViaSpa` export removed (#14), `reverseSortClause` barrel entry removed (#15), `BufferEntry` removed (#16), `TypeaheadField`/`TextSuggestionOption` lazy-typeahead re-exports removed (#17), `primaryDir` unused local (#18) — could not re-verify (tsc no longer reports it), `priority` thumbnail-loop local (#19) — same, `CqlParseResult` export removed (#20), `SnapshotStore` interface export removed (#21), `ScrubberMode`/`ScrubberProps` exports removed (#22–23), `SparseFieldConfig` export removed (#24), `ComputeScrollTargetResult` export removed (#25), `DataWindow` export removed (#26), `PrefetchStats` TYPE export removed (#27), `CachedImagePosition` export removed (#28), `ScrollGeometrySnapshot` export removed (#29), `SearchResult`/`AggregationRequest`/`SortDistBucket` barrel entries removed (#30), `FieldType`/`FieldGroup` exports removed (#31), `FieldAlias` export removed (#32), 11 sub-type exports in `types/image.ts` removed (#33), tombstone comments removed (#34–36).

**Coverage gaps:** see Section 4.

---

## Section 2 — Deletion inventory

Sorted by Category → Confidence (High first) → Size desc.

| # | Title (≤8 words) | File:line(s) | Category | Size (LOC) | Confidence | Proof (grep or tsc output) | Risk if deleted | Verification step |
|---|---|---|---|---|---|---|---|---|
| 1 | `normalizeCql` — carry-over from prior audit | [src/dal/adapters/elasticsearch/cql.ts:506](../../src/dal/adapters/elasticsearch/cql.ts) | D1 | ~15 | **High** | `tsc --noEmit` TS6133 at line 506: "declared but never read." `grep -r 'normalizeCql' kupua/src` → definition only. | None. | `grep -r 'normalizeCql' kupua/src` (0 hits after deletion) + `npm --prefix kupua run typecheck`. |
| 2 | `getTunable` — carry-over from prior audit | [src/lib/image-prefetch.ts:144](../../src/lib/image-prefetch.ts) | D1 | ~10 | **High** | `tsc --noEmit` TS6133 at line 144. `grep -r 'getTunable' kupua/src` → definition only. | None. | Same pattern. |
| 3 | `unregisterShortcut` — carry-over | [src/lib/keyboard-shortcuts.ts:70](../../src/lib/keyboard-shortcuts.ts) | D1 | ~10 | **High** | `tsc --noEmit` TS6133 at line 70. `grep -r 'unregisterShortcut' kupua/src` → definition + one doc comment. No import statement. | None. | `grep -r 'import.*unregisterShortcut' kupua/src` + typecheck. |
| 4 | `getPrefetchLog` — carry-over | [src/lib/image-prefetch.ts:217](../../src/lib/image-prefetch.ts) | D1 | ~7 | **High** | `tsc --noEmit` TS6133 at line 217. `grep -r 'getPrefetchLog' kupua/src` → definition only. | None — `_prefetchLog` ring buffer remains (it's written to by live call sites; only the getter is dead). | `grep -r 'import.*getPrefetchLog' kupua/src` + typecheck. |
| 5 | `fullImagesEnabled` — carry-over | [src/lib/image-urls.ts:282](../../src/lib/image-urls.ts) | D1 | ~5 | **High** | `tsc --noEmit` TS6133 at line 282. `grep -r 'fullImagesEnabled' kupua/src` → definition only. | None. | Same pattern. |
| ~~6~~ | _removed by reviewer (export-keyword noise)_ | | | | | | | |
| ~~7~~ | _removed by reviewer (export-keyword noise)_ | | | | | | | |
| ~~8~~ | _removed by reviewer (export-keyword noise)_ | | | | | | | |
| ~~9~~ | _removed by reviewer (export-keyword noise)_ | | | | | | | |
| ~~10~~ | _removed by reviewer (export-keyword noise)_ | | | | | | | |
| 11 | `isOptions` unused local in `buildTypeaheadFields` | [src/lib/typeahead-fields.ts:207](../../src/lib/typeahead-fields.ts) | D2 | 1 (one statement) | **High** | `tsc --noEmit` TS6133 at line 207: "'isOptions' is declared but its value is never read." `const isOptions = buildIsOptions()` is computed inside `buildTypeaheadFields()` but the function proceeds to use the module-level `IS_OPTIONS` const (line 80, same value) in the resolver at line 382. The local `isOptions` is dead. | None. | Remove the statement; `tsc --noEmit` should lose the TS6133. |
| ~~12~~ | _removed by reviewer (export-keyword noise)_ | | | | | | | |
| ~~13~~ | _removed by reviewer (export-keyword noise)_ | | | | | | | |
| ~~14~~ | _removed by reviewer (export-keyword noise)_ | | | | | | | |
| ~~15~~ | _removed by reviewer (export-keyword noise)_ | | | | | | | |
| 16 | `isImagePotentiallyGraphic` — wired-in-tests-only | [src/lib/graphic-image-blur.ts:48](../../src/lib/graphic-image-blur.ts) | A1 | ~60 (whole file) | **Medium** | `grep -r 'isImagePotentiallyGraphic' kupua/src --include='*.ts' --include='*.tsx'` → definition (`graphic-image-blur.ts`) + test file only. No production component imports it. Comment in `es-config.ts:80` references the file but is documentation, not an import. The function was built as an infrastructure piece; the blurring UI never materialised. | Breaks `graphic-image-blur.test.ts`. Low behavioural risk (no UI currently uses it). | Before deleting: `grep -r 'graphic-image-blur\|isImagePotentiallyGraphic' kupua/src kupua/e2e` → confirm only test + es-config comment. Then typecheck. |
| 17 | `unwrapEntity` — test-only caller | [src/dal/grid-api/argo.ts:29](../../src/dal/grid-api/argo.ts) | A1 | ~10 | **Medium** | `grep -r 'unwrapEntity' kupua/src --include='*.ts' --include='*.tsx'` → `argo.test.ts` only. `grid-api-adapter.ts` imports `mergeReconciledFields`, `parseArgoErrorBody`, `unwrapResponse`, `unwrapSearchHits` — not `unwrapEntity`. | Breaks `argo.test.ts`. The test block `describe("unwrapEntity")` would need deletion. | `grep -r 'unwrapEntity' kupua/src` before + after. |
| 18 | `findLink` — test-only caller | [src/dal/grid-api/argo.ts:47](../../src/dal/grid-api/argo.ts) | A1 | ~10 | **Medium** | Same as above: `grep -r 'findLink' kupua/src --include='*.ts' --include='*.tsx'` → `argo.test.ts` only. Production adapter uses `findAction` (for constructing mutation URLs) but not yet `findLink`. | Breaks `argo.test.ts`. | Same grep pattern. |
| 19 | `findAction` — test-only caller | [src/dal/grid-api/argo.ts:57](../../src/dal/grid-api/argo.ts) | A1 | ~25 | **Medium** | `grep -r 'findAction' kupua/src --include='*.ts' --include='*.tsx'` → `argo.test.ts` only. `grid-api-adapter.ts` does not call `findAction`. | Breaks `argo.test.ts`. | Same grep pattern. |
| 20 | `useToast` hook — never adopted, whole file | [src/hooks/useToast.ts](../../src/hooks/useToast.ts) | A1+D1 | ~90 | **High** | Knip reports file as unused. `grep -r 'useToast\b' kupua/src/` → 0 results outside the file. File's own JSDoc says "For non-React callers, use `addToast` directly" — callsites followed that pattern exclusively. Hook was written proactively but never adopted. | None — `addToast` from `toast-store.ts` continues to work. | `grep -r 'useToast' kupua/src` (0 external hits) + typecheck. |
| 21 | `gridApi` singleton — no consumers; Phase 3 unwired | [src/lib/grid-api-instance.ts:20](../../src/lib/grid-api-instance.ts) | D1 | 1 (export line; implies Phase 3 decision) | **High** (export dead) | Knip reports unused export. `grep -r 'import.*gridApi\b' kupua/src` → 0. `grep -r 'gridApi\b' kupua/src \| grep -v grid-api-instance.ts` → 0. `enrichment-store.ts` does not import it. `initGridApi()` is called from `search.tsx` but `gridApi` is never passed to any store or hook — `GridApiDataSource` enrichment is silently unwired. | ⚠️ Symptom: Phase 3 enrichment has no consumer path. Removing the export doesn't worsen things but surfaces the disconnection. Consult Phase 3 roadmap before acting. | Confirm Phase 3 status; then `grep -r 'import.*gridApi\b' kupua/src` + typecheck. |
| 22 | `serviceDiscovery` module singleton — superseded | [src/dal/grid-api/service-discovery.ts:129](../../src/dal/grid-api/service-discovery.ts) | D1 | 1 (kept: unused const, not a type — singleton is constructed on module-load for no consumer; the whole `const` can be deleted, not just the export) | **High** | Knip reports unused export. `grep -r 'import.*serviceDiscovery\b' kupua/src \| grep -v service-discovery.ts` → 0. `grid-api-instance.ts` creates its own `new ServiceDiscovery()` rather than importing this singleton. | None. | Same grep + typecheck. |
| ~~23~~ | _removed by reviewer (export-keyword noise)_ | | | | | | | |
| ~~24~~ | _removed by reviewer (export-keyword noise)_ | | | | | | | |
| ~~25~~ | _removed by reviewer (export-keyword noise)_ | | | | | | | |
| 26 | `ToastLifespan` — sole consumer is dead hook (#20) | [src/stores/toast-store.ts:45](../../src/stores/toast-store.ts) | D1 | 1 (contingent on #20) | **High** | `grep -r 'import.*ToastLifespan' kupua/src` → `useToast.ts` only, which is finding #20. If #20 is executed first, this export loses its last consumer. | None (once #20 done). | Execute #20 first, then same grep returns 0 + typecheck. |
| 27 | 26 unused types in `grid-api/types.ts` — Phase 3 stubs | [src/dal/grid-api/types.ts (various lines)](../../src/dal/grid-api/types.ts) | A2+D1 | ~200 | **High** (knip) | Knip reports all 26 as unused exported types: `Dimensions`, `Asset`, `ImageMetadata`, `UsageRightsBase`, `EmptyUsageRights`, `Bounds`, `ExportType`, `CropSpec`, `Export`, `Crop`, `MediaLeaseType`, `MediaLease`, `LeasesByMedia`, `ActionData`, `CollectionResponse`, `UsageType`, `UsageStatus`, `UsageReference`, `Edits`, `EditsEntity`, `UploadInfo`, `SoftDeletedMetadata`, `SyndicationRights`, `CohereV3Embedding`, `CohereV4Embedding`, `Embedding`, `FileMetadata`, `ImageResponse`, `TickerCount`, `SearchResponseActions`. None imported by any file outside `types.ts` itself. | **Medium** — these types document the HATEOAS API contract for Phase 3 write operations. Deleting erases specification; restoring requires re-deriving from Grid API source. Consider de-exporting (remove `export` keyword) rather than deleting if Phase 3 is active. | Confirm Phase 3 status. If proceeding, de-export rather than delete; typecheck after. |

**Total: 15 findings after reviewer filter** (was 27; 12 export-keyword-noise rows removed — see top-of-doc note). Remaining mix: 5 carry-over functions (#1–5), 1 unused local (#11), 1 small file (#16, planned-keep per user), 3 argo helpers (#17–19, Phase 3 keep), 1 unused hook (#20, biggest win), 1 unused singleton const (#22), 1 contingent type (#26), and 2 Phase 3 stubs (#21, #27, planned-keep per user). Realistic LOC reclaim if all non-Phase-3 are actioned: ~150 LOC.

---

## Section 3 — Deletion clusters

| Cluster name | Finding #s | Why grouped | Suggested commit shape |
|---|---|---|---|
| Carry-over exports from prior audit Pass 1c | 1–5 | All are exported functions still flagged by `tsc --noEmit` TS6133; prior audit Pass 1c was partially executed. All in separate files; none depend on each other. | One commit per file is cleanest, or batch into `chore: remove remaining dead exports (audit #1-5)`. Run `npm --prefix kupua test` after. |
| argo.ts test-only helpers | 17, 18, 19 | `unwrapEntity`, `findLink`, `findAction` — three functions in one file, all test-only. Deleting them requires corresponding test cleanup. Non-trivial because argo.test.ts has substantial describe blocks for each. | `chore: delete argo.ts functions with no production callers + remove corresponding tests (audit #17-19)` — only if user decides the unimplemented grid-api UI path is not coming soon. **Per user: Phase 3 planned, keep.** |
| Toast cleanup | 20, 26 | Delete `useToast.ts` (#20) first; that makes `ToastLifespan` in `toast-store.ts` dead (#26). Two commits or one. | `chore: delete unused useToast hook and remove ToastLifespan export (audit #20,26)` |
| Phase 3 infrastructure decision | 21, 27 | `gridApi` singleton and 26 `grid-api/types.ts` types are dead but deliberate Phase 3 stubs. Action depends on Phase 3 timeline. | **Per user: gridApi (#21) stays; #27 also planned-keep.** Do not delete. |

---

## Section 4 — Areas not audited

| Area | Reason |
|---|---|
| `src/stores/search-store.ts` internals (~3,750 lines) | Only exports were checked. Internal private helpers not traced end-to-end; tsc TS6133 would surface any intra-function dead vars. No TS6133 reported from this file, so intra-function dead vars are assumed absent. |
| `src/dal/grid-api/types.ts` (~330 lines of type exports) | **Now surveyed via knip (finding #27).** 26 of ~50 exported types are dead (Phase 3 stubs not yet consumed). 5 types actively used by `grid-api-adapter.ts` are alive. |
| `e2e/` and `e2e-perf/` as dead-test candidates | Out of scope per handoff. Dead test code is a separate category. |
| `src/lib/orchestration/sort-only.ts` | File does not exist. `sort-only.test.ts` exists with an inlined helper (mirrors inline code in `useUrlSearchSync.ts`); not dead. |
| `_prefetchLog` ring buffer in `image-prefetch.ts` | `getPrefetchLog` (finding #4) is dead, but the ring buffer it accesses is still written to by live call sites. Whether the entire logging infrastructure (`_prefetchLog`, `PREFETCH_LOG_CAP`, `PrefetchLogEntry`) is worth deleting is a separate question noted in Appendix A. |
| `src/constants/` | Not surveyed. Knip found no dead exports from this directory, confirming low yield. |
| `src/routes/` | Not surveyed; entry-point files, low risk of dead exports. |

---

## Section 5 — Suggested deletion order (post-filter)

1. **Finding #20** (`useToast` hook, ~90 LOC) — biggest single win, clean delete, no Phase 3 ambiguity. Pair with #26 (`ToastLifespan` becomes fully dead once #20 lands).

2. **Findings #1–5** (carry-over TS6133 functions) — all confirmed by tsc, mechanical removal. No test updates needed. Batch or per-file, user's preference. #4 (`getPrefetchLog`) should be batched with a note about the orphaned ring buffer (see Appendix A item 1).

3. **Finding #11** (one unused local in `typeahead-fields.ts`) — trivial, one statement.

4. **Finding #22** (`serviceDiscovery` singleton) — delete the whole `const` (and the unused `export`), not just the export keyword. Eliminates a useless module-load instantiation.

5. **Phase 3 / planned-keep findings (#16, #17, #18, #19, #21, #27)** — user will flag these to the implementer to skip. No action.

---

## Appendix A — Out-of-scope observations

Cap: 30 items. One line each.

1. **`_prefetchLog` ring buffer** (`image-prefetch.ts`) — written to by live call sites but never read anywhere in production; the only reader was `getPrefetchLog` (finding #4). If finding #4 is deleted, the ring buffer, `PREFETCH_LOG_CAP`, and `PrefetchLogEntry` type become fully dead. Worth a follow-up deletion (adds ~20 LOC reclaim).
2. **`sort-only.test.ts` mirrors inline code** (`orchestration/sort-only.test.ts`) — the test file's `computeIsSortOnly` function explicitly mirrors lines 152–158 of `useUrlSearchSync.ts`. If that code changes, the test silently diverges. Fragile coupling worth noting.
3. **`isImagePotentiallyGraphic` has no runtime entry point** — the function is well-tested but no component calls it. If graphic blurring is planned, it needs to be wired into `ImageGrid.tsx` / `ImageTable.tsx` row renders. Otherwise it will accumulate staleness as the `Image` type evolves.
4. **`argo.ts` `findLink`/`findAction` are needed for Phase 3 writes** — grid-api write operations (set metadata, add lease, delete) are discovered via HATEOAS action links. Before deleting finding #18/#19, confirm Phase 3 write operations are not planned for the current sprint.
5. **`graphic-image-blur.ts` phrase list divergence risk** — comment says "Do not edit without cross-checking the kahuna source." There's no automated check for this. Phrases may have drifted.
6. **`es-config.ts` comment references `graphic-image-blur.ts`** — if finding #16 is deleted, update or remove the comment at `es-config.ts:80`.
7. **`image-borders.ts` `isAgencyPick` is private but complex** — 17-clause `bool.should` generated from config; not dead but no tests. Worth a unit test.
8. **`ColumnConfig` used-but-not-imported** (finding #15) — column-store consumers destructure `useColumnStore` state without naming the `ColumnConfig` type. If a consumer ever needs to annotate a variable as `ColumnConfig`, they'll need to import it. Low friction to restore the export if needed.
9. **`gridApi` enrichment pipeline is disconnected** (finding #21) — `initGridApi()` is called from `search.tsx` (initialises `ServiceDiscovery`), but the `gridApi` singleton is never imported by `enrichment-store.ts` or any hook/store. `GridApiDataSource.enrichByIds()` has no production call site. Either Phase 3 wiring was deferred or the integration step was missed. Worth an explicit decision before Phase 3 work begins.
10. **`REPORT_PATH` dead export in `e2e/smoke/smoke-report.ts:19`** — exported const with 0 consumers in the e2e suite. `grep -r 'REPORT_PATH' kupua/e2e` → definition only. Low priority; e2e infra not product code.
