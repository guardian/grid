# Kupua Dead-Code Audit — Findings

**Status:** Complete  
**Date:** 2026-04-29  
**Auditor:** Copilot (Claude Sonnet 4.6)  
**Handoff doc:** `kupua/exploration/docs/dead-code-audit-handoff.md`

---

## Section 1 — Methodology

**Tools run:**
- `tsc --noEmit` (via `kupua/node_modules/.bin/tsc`): 66 lines of output. 2 × TS6133 "declared but never read" errors relevant to this audit (the rest are TS18047 null-safety in DOM event handlers, not dead code).
- `knip` (installed locally, `node_modules/.bin/knip --reporter json`): 1 JSON object. Found ~25 unused exports/types across 15 src files, plus 10 flagged standalone files (playwright configs, scripts — false positives, they are entry points).

**Files read end-to-end:** `search-store.ts`, `useScrollEffects.ts`, `es-adapter.ts` (key sections), `orchestration/search.ts`, `prepend-transform.ts`, `image-prefetch.ts`, `sort-context.ts` (signatures + call sites), `cql.ts`, `keyboard-shortcuts.ts`, `lazy-typeahead.ts`, `image-urls.ts`, `useUrlSearchSync.ts`, `dal/index.ts`, `dal/types.ts`, `types/image.ts`, `useDataWindow.ts` (exports section), `image-offset-cache.ts`, `scroll-geometry-ref.ts`, `history-snapshot.ts`, `Scrubber.tsx` (exports), `mock-data-source.ts`.

**Files scanned** (grep-based symbol tracing): all `src/` files for import chains.

**Heuristic for "is dead":** exported symbol with zero importers in `kupua/src/` (confirmed with `grep -r`); or local variable declared but never referenced within its scope (tsc TS6133). Low-confidence items dropped.

**Cross-reference:** `exploration/docs/scroll-audit.md` §Q4 already identified `prepend-transform.ts` as dead (HIGH confidence, 2026-04-27). That finding is included here as #1 with credit.

**Excluded:** e2e/, e2e-perf/, scripts/, exploration/. Playwright config files flagged by knip as "unlisted files" are false positives (standalone entry points). `@aws-sdk` devDependencies flagged by knip are used by `scripts/s3-proxy.mjs`.

---

## Section 2 — Dead-code inventory

Sorted by Category → Confidence (High first within each category).

| # | Title | File:line(s) | Category | Confidence | Why dead (1-line proof) | Risk if deleted | Verification step |
|---|---|---|---|---|---|---|---|
| 1 | Entire `prepend-transform.ts` (~140 lines) | [src/lib/prepend-transform.ts:1–140](../../src/lib/prepend-transform.ts) | D1 | **High** | `startPrependTransformSubscriber` and `clearPreCompensationTransform` both exported — `grep -r 'prepend-transform' kupua/src` returns 0 import sites; `grep -r 'startPrependTransform\|clearPreCompensation' kupua/src` returns only the definitions. Created for the "A+T (CSS transform)" experiment (changelog 8 Apr 2026), reverted, never deleted. | None — not imported anywhere; scroll-audit.md Q4#1 confirmed independently. | `grep -r 'prepend-transform\|clearPreCompensationTransform\|startPrependTransformSubscriber' kupua/src` — expect zero matches after deletion. `npx tsc --noEmit` after deletion. |
| 2 | `resetSearchSync` export | [src/lib/orchestration/search.ts:220](../../src/lib/orchestration/search.ts) | D1 | **High** | `grep -r 'resetSearchSync' kupua/src` returns 4 hits: definition (line 220–222), a comment in `reset-to-home.ts:49` (not an import), and two more inside the same file. Zero import statements. | None — purely internal. | `grep -r "import.*resetSearchSync" kupua/src` — expect 0 results. |
| 3 | `normalizeCql` export | [src/dal/adapters/elasticsearch/cql.ts:473](../../src/dal/adapters/elasticsearch/cql.ts) | D1 | **High** | `grep -r 'normalizeCql' kupua/src` returns 1 hit: definition only. Never called or imported. | None. | `grep -r 'normalizeCql' kupua/src` — 0 after deletion. |
| 4 | `fullImagesEnabled` export | [src/lib/image-urls.ts:262](../../src/lib/image-urls.ts) | D1 | **High** | `grep -r 'fullImagesEnabled' kupua/src` returns 1 hit: definition only. | None. | Same grep, expect 0. |
| 5 | `unregisterShortcut` export | [src/lib/keyboard-shortcuts.ts:70](../../src/lib/keyboard-shortcuts.ts) | D1 | **High** | `grep -r 'import.*unregisterShortcut' kupua/src` returns 0 hits. `useKeyboardShortcut.ts` uses `registerShortcut`'s return value for cleanup, not this function. Mentioned only in a doc comment ("or `unregisterShortcut()`"). | None. | `grep -r 'unregisterShortcut' kupua/src` — only definition remains after deletion. |
| 6 | `getTunable` export | [src/lib/image-prefetch.ts:144](../../src/lib/image-prefetch.ts) | D1 | **High** | `grep -r 'getTunable' kupua/src` returns 1 hit: definition only. Not called internally either. | None. | Same grep, 0 after deletion. |
| 7 | `getPrefetchLog` export | [src/lib/image-prefetch.ts:217](../../src/lib/image-prefetch.ts) | D1 | **High** | `grep -r 'getPrefetchLog' kupua/src` returns 2 hits: definition + the function returning `_prefetchLog`. Not imported anywhere. (`getPrefetchStats` IS used in tests; `getPrefetchLog` is not.) | None. | Same grep, 0 after deletion. |
| 8 | `prefetchLog` export | [src/lib/image-prefetch.ts:206](../../src/lib/image-prefetch.ts) | D1 | **High** | `grep -r 'import.*prefetchLog' kupua/src` returns 0 hits. Used internally only (lines 305, 312, 417, 496, 521). Export keyword is unnecessary. | None — function is live internally; only the `export` is dead. | Remove `export` keyword; tsc should pass. |
| 9 | `DEFAULT_SEARCH` re-export | [src/hooks/useUrlSearchSync.ts:46](../../src/hooks/useUrlSearchSync.ts) | D1 | **High** | Line 46: `export { DEFAULT_SEARCH };` — all 7 consumers import from `@/lib/home-defaults` directly. `grep -r 'from.*useUrlSearchSync.*DEFAULT_SEARCH\|useUrlSearchSync.*import.*DEFAULT' kupua/src` returns 0. | None. | Remove line 46; check all `DEFAULT_SEARCH` imports still resolve to `home-defaults.ts`. |
| 10 | `lookupSortDistribution` export | [src/lib/sort-context.ts:335](../../src/lib/sort-context.ts) | D1 | **High** | `grep -r 'import.*lookupSortDistribution' kupua/src` returns 0. Used internally at lines 427, 441, 507, 508, 953. Export is unnecessary. | None — function is live internally. | Remove `export`; tsc should pass. |
| 11 | `computeTrackTicks` export | [src/lib/sort-context.ts:643](../../src/lib/sort-context.ts) | D1 | **High** | `grep -r 'import.*computeTrackTicks' kupua/src` returns 0 (callers import `computeTrackTicksWithNullZone` instead). Used internally by that wrapper at lines 990 and 1017. | None — function is live internally. | Remove `export`; tsc should pass. |
| 12 | `isEditableTarget` export | [src/lib/keyboard-shortcuts.ts:82](../../src/lib/keyboard-shortcuts.ts) | D1 | **High** | `grep -r 'import.*isEditableTarget' kupua/src` returns 0. Used internally at line 119. | None. | Remove `export`; tsc should pass. |
| 13 | `ALT_SYMBOL` export | [src/lib/keyboard-shortcuts.ts:173](../../src/lib/keyboard-shortcuts.ts) | D1 | **High** | `grep -r 'import.*ALT_SYMBOL' kupua/src` returns 0. Used internally to compute `ALT_CLICK` (which IS exported and imported externally). | None. | Remove `export`; tsc should pass. |
| 14 | `markDetailEnteredViaSpa` export | [src/lib/orchestration/search.ts:311](../../src/lib/orchestration/search.ts) | D1 | **High** | `grep -r 'import.*markDetailEnteredViaSpa' kupua/src` returns 0. Called internally at line 347 inside `pushNavigate()`. Function is live; export is unnecessary. | None. | Remove `export`; tsc should pass. |
| 15 | `reverseSortClause` re-export in barrel | [src/dal/index.ts:22](../../src/dal/index.ts) | D1 | **High** | All importers use direct path `@/dal/adapters/elasticsearch/sort-builders` or `./adapters/elasticsearch/sort-builders`. `grep -r "from \"@/dal\"" kupua/src` shows zero imports of `reverseSortClause` via barrel. | None. | Remove `reverseSortClause` from `dal/index.ts:22`; run tsc. |
| 16 | `BufferEntry` type (definition + re-export) | [src/dal/types.ts:31](../../src/dal/types.ts), [src/dal/index.ts:12](../../src/dal/index.ts) | D1 | **High** | `grep -r 'BufferEntry' kupua/src` returns exactly 2 hits: definition and barrel re-export. Never imported or used anywhere. | None. | Remove from both files; run tsc. |
| 17 | `TypeaheadField`, `TextSuggestionOption` re-exports | [src/lib/lazy-typeahead.ts:35](../../src/lib/lazy-typeahead.ts) | D1 | **High** | `grep -r "from \"@/lib/lazy-typeahead\"" kupua/src` returns 1 hit: `import { LazyTypeahead }` only. `CqlSearchInput.tsx` imports `TypeaheadField` from `@guardian/cql` directly, not from this module. | None. | Remove line 35 re-exports; run tsc. |
| 18 | `primaryDir` local variable | [src/dal/es-adapter.ts:1227](../../src/dal/es-adapter.ts) | D2 | **High** | `tsc --noEmit` TS6133: "declared but never read." `const { field: primaryField, direction: primaryDir } = parseSortField(...)` — `primaryField` is used throughout; `primaryDir` is never referenced. | None. | Change to `const { field: primaryField } = parseSortField(...)`; tsc should lose the TS6133. |
| 19 | `priority` in thumbnail prefetch loop | [src/lib/image-prefetch.ts:~430](../../src/lib/image-prefetch.ts) | D2 | **High** | `tsc --noEmit` TS6133 at line 442:26. Thumbnail loop `for (const [, { idx, priority }] of entries)` — `priority` is destructured but the loop uses an inline expression `Math.abs(idx - currentIndex) <= 1 ? "high" : "low"` instead. The second (full-res) loop at line 454+ correctly uses `priority`. | None. | Change to `for (const [, { idx }] of entries)` in the thumbnail loop; tsc TS6133 should clear. |
| 20 | `CqlParseResult` export | [src/dal/adapters/elasticsearch/cql.ts:428](../../src/dal/adapters/elasticsearch/cql.ts) | D1 | **Medium** | `grep -r 'CqlParseResult' kupua/src` returns 2 hits: definition and as return type annotation for `parseCql`. No external code `import type { CqlParseResult }`. | None — removing `export` keeps the type usable within the file for `parseCql`'s return annotation. | Remove `export`; run tsc. |
| 21 | `SnapshotStore` export | [src/lib/history-snapshot.ts:68](../../src/lib/history-snapshot.ts) | D1 | **Medium** | `grep -r 'import.*SnapshotStore' kupua/src` returns 0. Used within the file for `MapSnapshotStore implements SnapshotStore` and `snapshotStore: SnapshotStore`. | None — internal use remains. | Remove `export`; run tsc. |
| 22 | `ScrubberMode` export | [src/components/Scrubber.tsx:153](../../src/components/Scrubber.tsx) | D1 | **Medium** | `grep -r 'import.*ScrubberMode' kupua/src` returns 0. Used within the file only. | None. | Remove `export`; run tsc. |
| 23 | `ScrubberProps` export | [src/components/Scrubber.tsx:155](../../src/components/Scrubber.tsx) | D1 | **Medium** | `grep -r 'import.*ScrubberProps' kupua/src` returns 0. Used within the file only as component parameter type. | None. | Remove `export`; run tsc. |
| 24 | `SparseFieldConfig` export | [src/dal/mock-data-source.ts:48](../../src/dal/mock-data-source.ts) | D1 | **Medium** | `grep -r 'import.*SparseFieldConfig' kupua/src` returns 0. Used within `mock-data-source.ts` only for the constructor signature. | None. | Remove `export`; run tsc. |
| 25 | `ComputeScrollTargetResult` export | [src/stores/search-store.ts:100](../../src/stores/search-store.ts) | D1 | **Medium** | `grep -r 'ComputeScrollTargetResult' kupua/src` returns 3 hits: definition, return type annotation, 1 usage in tests via inference (not explicit import). No `import type { ComputeScrollTargetResult }` anywhere. | None — the type is still usable as inferred return type of `computeScrollTarget`. | Remove `export`; check `reverse-compute.test.ts` still compiles. |
| 26 | `DataWindow` export | [src/hooks/useDataWindow.ts:241](../../src/hooks/useDataWindow.ts) | D1 | **Medium** | `grep -r 'import.*DataWindow' kupua/src` returns 0. Only used as return type of `useDataWindow()` within the file. | None. | Remove `export`; run tsc. |
| 27 | `PrefetchStats` export | [src/lib/image-prefetch.ts:223](../../src/lib/image-prefetch.ts) | D1 | **Medium** | `grep -r 'import.*PrefetchStats' kupua/src` returns 0. Tests call `getPrefetchStats()` but destructure properties inline without naming the type. | None — tests still work via structural typing. | Remove `export`; run tsc + unit tests. |
| 28 | `CachedImagePosition` export | [src/lib/image-offset-cache.ts:105](../../src/lib/image-offset-cache.ts) | D1 | **Medium** | `grep -r 'CachedImagePosition' kupua/src` returns 2 hits: definition and return type annotation for `getImageOffset`. No external importer. | None. | Remove `export`; run tsc. |
| 29 | `ScrollGeometrySnapshot` export | [src/lib/scroll-geometry-ref.ts:15](../../src/lib/scroll-geometry-ref.ts) | D1 | **Medium** | `grep -r 'import.*ScrollGeometrySnapshot' kupua/src` returns 0. Used within the file for module-level variable and function signatures. | None. | Remove `export`; run tsc. |
| 30 | `SearchResult`, `AggregationRequest`, `SortDistBucket` re-exports in barrel | [src/dal/index.ts:9,15,18](../../src/dal/index.ts) | D1 | **Medium** | `grep -r "from \"@/dal\"" kupua/src` shows importers use `AggregationResult`, `SortDistribution`, `SearchAfterResult` etc., but NOT these three. Internal consumers (`es-adapter.ts`, `mock-data-source.ts`) import directly from `./types`. | Low — these types are live within `dal/`; only the barrel re-export is unused. If an external consumer ever wanted them, they'd need to import from `@/dal/types` instead. | Remove from `dal/index.ts` type-export block; run tsc across all files. |
| 31 | `FieldType`, `FieldGroup` exports | [src/lib/field-registry.ts:39,42](../../src/lib/field-registry.ts) | D1 | **Medium** | `grep -r 'import.*FieldType\|import.*FieldGroup' kupua/src` returns 0. Used only within `field-registry.ts` for field definition objects. | None. | Remove `export`; run tsc. |
| 32 | `FieldAlias` export | [src/lib/grid-config.ts:9](../../src/lib/grid-config.ts) | D1 | **Medium** | `grep -r 'import.*FieldAlias' kupua/src` returns 0. Used only within `grid-config.ts` to annotate the `fieldAliases` array. | None. | Remove `export`; run tsc. |
| 33 | Sub-type exports in `types/image.ts` (11 types) | [src/types/image.ts:6,11,24,46,59,71,81,87,114,124,128](../../src/types/image.ts) — `ImageDimensions`, `ImageAsset`, `ImageMetadata`, `UsageRights`, `Lease`, `Collection`, `UsageReference`, `Usage`, `Export`, `UploadInfo`, `SoftDeletedMetadata` | D1 | **Medium** | `grep -r 'import.*ImageDimensions\|import.*ImageAsset\|import.*UsageRights\|import.*Lease[^s]\|import.*Collection\|import.*UsageReference\|import.*Usage[^R]\|import.*Export\|import.*UploadInfo\|import.*SoftDeleted' kupua/src` returns 0. All consumers import only `Image` from this file. These types are used within the file to compose `Image`'s field types. | None internally. If a future consumer needs (say) `UsageRights` standalone, they'd import from the source file — no behavioural change. | Remove 11 `export` keywords; run tsc. |
| 34 | 7-line tombstone comment block (Agent 10 removal) | [src/hooks/useDataWindow.ts:130–136](../../src/hooks/useDataWindow.ts) | D10 | **High** | Header "Post-seek backward extend suppression — REMOVED (Agent 10)" followed by 5 lines explaining what the removed flag did. The feature is gone; the removal is in changelog. Negative information (documenting the absence of a thing). | None. | Delete lines 130–136. |
| 35 | 8-line tombstone comment block (Agent 10 approach) | [src/hooks/useDataWindow.ts:440–448](../../src/hooks/useDataWindow.ts) | D10 | **High** | "APPROACH #4 (Agent 10): Removed `_postSeekBackwardSuppress` flag." 7-line historical narrative about how the flag was replaced. The live code immediately following already documents the current behaviour with its existing comments. | None. | Delete lines 440–448. |
| 36 | 2-line tombstone note (Agent 10 removal) | [src/stores/search-store.ts:3258–3259](../../src/stores/search-store.ts) | D10 | **High** | "NOTE: `_postSeekBackwardSuppress` flag was removed (Agent 10). Swimming prevention now handled by SEEK_COOLDOWN_MS + POST_EXTEND_COOLDOWN_MS." The tuning constants are mentioned and visible in context; the "was removed" note adds no value. | None. | Delete lines 3258–3259. |

**Total: 36 findings.** All D1 (unused exports), D2 (unused private symbols), and D10 (stale tombstone comments). No D3–D8 findings survived the confidence threshold.

---

## Section 3 — Live-but-suspicious

Code that looked dead but is actually alive. Included to prove real checking happened.

| # | Symbol | File:line | Why it looked dead | Why it's actually alive | Notes |
|---|---|---|---|---|---|
| 1 | `getPrefetchStats` | [src/lib/image-prefetch.ts:232](../../src/lib/image-prefetch.ts) | knip flags it; `PrefetchStats` type is never explicitly imported | 21 usages in `image-prefetch.test.ts` — extensively used for test assertions | Tests don't import the *type*; they destructure results inline. Type stays live as return annotation. |
| 2 | `computeScrollTarget` | [src/stores/search-store.ts:107](../../src/stores/search-store.ts) | `ComputeScrollTargetResult` return type is never externally imported | Called at line 3319 within the store; tested in `reverse-compute.test.ts` | Both the function and its input type `ComputeScrollTargetInput` are used in tests. |
| 3 | `resetSearchSync` mention in comment | [src/lib/reset-to-home.ts:49](../../src/lib/reset-to-home.ts) | Comment names `resetSearchSync()` — looks like a call site | It IS just a comment: "is: `resetSearchSync()` clears dedup → React re-renders → useUrlSearchSync". The actual import uses `setPrevParamsSerialized`. | `resetSearchSync` is still dead export (#2 above); this comment refers to the function by name for explanation. |
| 4 | `suppressNextRestore` + `clearSuppressRestore` | [src/stores/search-store.ts:510,513](../../src/stores/search-store.ts) | Not in knip output; no obvious callers | Imported and called in `reset-to-home.ts:68,158`. `grep -r 'suppressNextRestore\|clearSuppressRestore' kupua/src` confirms. | Previously confirmed in scroll-audit.md §"Other items examined and found NOT dead." |
| 5 | `@aws-sdk/client-s3`, `@aws-sdk/credential-providers` | [package.json:40–41](../../package.json) | knip flags as unused devDependencies | Used by `scripts/s3-proxy.mjs` (imported at lines 35–36). knip flags the script itself as a standalone file it doesn't trace. | Not dead; knip limitation with standalone `.mjs` entry points. |
| 6 | `markDetailEnteredViaSpa` (function body) | [src/lib/orchestration/search.ts:311](../../src/lib/orchestration/search.ts) | knip flags the export | Function IS called at line 347 inside `pushNavigate()`. Only the `export` keyword is dead, not the function. | Listed as #14 in Section 2 as a D1 (unnecessary export); function itself is live. |
| 7 | `lookupSortDistribution` (function body) | [src/lib/sort-context.ts:335](../../src/lib/sort-context.ts) | knip flags the export | Used at 5 internal call sites (lines 427, 441, 507, 508, 953). | Same pattern — export dead, function live. |
| 8 | `computeTrackTicks` (function body) | [src/lib/sort-context.ts:643](../../src/lib/sort-context.ts) | knip flags the export | Used internally by `computeTrackTicksWithNullZone` (lines 990, 1017). | Same pattern. |
| 9 | PIT 404/410 fallback path | [src/dal/es-adapter.ts:602–649](../../src/dal/es-adapter.ts) | Error path that might never fire | PIT expiry is a real operational event (1-minute keepalive). The fallback correctly retries without PIT. Confirmed live path per changelog. | The regex `/40[04]\|410/` also catches 404 — matches real HTTP error codes. |
| 10 | POST_EXTEND_COOLDOWN_MS guard | [src/stores/search-store.ts:2332–2342](../../src/stores/search-store.ts) | "APPROACH #4" comment suggests historical; scroll-audit Q4#5 rated LOW confidence of deadness | Fires after every `extendBackward`; prevents cascading prepend compensations on rapid backward scroll. scroll-audit §Q4#5 explicitly concluded "probably not dead." | The tombstone comment about this (D10 #35) is about explaining Agent 10's removal of _postSeekBackwardSuppress; the actual `_seekCooldownUntil` assignment on the same lines is very much alive. |
| 11 | `prependTransform` mentions in AGENTS.md component summary | [kupua/AGENTS.md](../../AGENTS.md) | References `prepend-transform.ts` as a live component | AGENTS.md entry for "Prepend Transform" describes the file accurately; entry should be removed when file is deleted | Document update needed alongside code deletion for finding #1. |

---

## Section 4 — Areas not audited

| Area | File(s) | Reason |
|---|---|---|
| E2E test code | `e2e/` (all) | Explicitly out of scope per handoff. Dead tests = separate category. Several types in `e2e/shared/drift-flash-probes.ts` flagged by knip but intentionally excluded. |
| Perf test code | `e2e-perf/` | Same reason. |
| Scripts | `scripts/` | Standalone entry points; knip rightly flags them as "no importers" but they are CLI tools, not dead code. |
| D9 (CSS / assets) | `src/index.css`, `public/` | Would require matching CSS rules to DOM, outside static analysis scope. |
| Runtime dynamic dispatch | Any `window.__kupua_*` patterns | Three symbols are exposed on `window` in main.tsx for E2E access. Any code reachable only via those paths would appear dead to static analysis. |
| Feature-flag-gated code | If any flags exist | No runtime feature flags found in `src/` — not applicable to this codebase. |

---

## Section 5 — Tool-output reconciliation

**knip raw findings (src/ only, excluding test/config/script files):**
- Unused exports (functions/consts): 10 (all confirmed in Section 2)
- Unused type exports: 18 (all confirmed or graduated to Medium-confidence findings)
- Files with zero importers: 1 (`src/lib/prepend-transform.ts` — finding #1)
- False positives filtered out: ~10 standalone scripts/playwright configs (they are entry points, not dead files)

**tsc --noEmit raw findings relevant to dead code:**
- 2 × TS6133 "declared but never read" → findings #18 (`primaryDir`) and #19 (`priority` in thumbnail loop)
- 54 × TS18047 "possibly null" → NOT dead code; type-safety gaps in DOM ref code. Not in scope.
- 1 × TS2322 type mismatch in test file → not dead code, out of scope.
- 2 × TS6133 in test files (`afterEach` in `build-history-snapshot.test.ts`, `waitFor` in `search-store-pit.test.ts`) → out of scope.

**knip vs this audit:**
- knip confirmed: 28/36 findings (all D1 items came from or were confirmed against knip's output)
- knip missed: findings #18, #19 (D2 private variables — tools can't do intra-function analysis), and #34–#36 (D10 tombstone comments)
- knip false-positives refuted: `getPrefetchStats` (live in tests), `@aws-sdk` deps (live in scripts), re-export `computeTrackTicks` / `lookupSortDistribution` (live internally), all `useDataWindow` test-accessible exports

**Bottom line:** For D1 (unused exports), running knip alone would capture ~80% of the value. Its gap is D2–D10 reasoning (which tools can't do), and it does emit noise for test-accessible exports and standalone entry-point files that need filtering.

---

## Section 6 — Suggested deletion order

Restructured into 6 passes, each = 1 commit. Mark commit boundaries with `--- COMMIT BOUNDARY ---`. Each pass has an executor prompt at the bottom (drop into a fresh agent session).

### Pass 1a — Delete `prepend-transform.ts` (1 commit) ✅ DONE

Single real deletion, has documentation impact and needs verification that no dynamic imports reference it.

1. **Finding #1** — Delete `src/lib/prepend-transform.ts` entirely (~140 lines).
2. Update `kupua/AGENTS.md`: remove the "Prepend Transform" row from the Component Summary table.
3. Verify no `window.__kupua_*` patterns or dynamic imports reference the symbols (`startPrependTransformSubscriber`, `clearPreCompensationTransform`).

**Tests required:** unit (`npm --prefix kupua test`) AND e2e (`npm --prefix kupua run test:e2e`). The file was once part of the scroll experiment — e2e is needed to confirm no behavioural regression.

```text
Read kupua/exploration/docs/dead-code-audit-findings.md, focus on Section 6 Pass 1a only.

Goal: delete src/lib/prepend-transform.ts (~140 lines). The audit confirmed zero importers via grep; corroborated by scroll-audit.md Q4#1.

Before deleting, verify nothing reaches it via dynamic patterns:
1. grep -r "prepend-transform\|PrependTransform\|startPrependTransform\|clearPreCompensationTransform" kupua/src kupua/e2e kupua/scripts
2. grep -r "window\.__kupua" kupua/src — confirm none expose these symbols.
3. grep "Prepend Transform" kupua/AGENTS.md — find the component-summary row to delete.

If anything unexpected appears in steps 1–3, STOP and report. Do not proceed.

If clean:
1. Delete src/lib/prepend-transform.ts.
2. Edit kupua/AGENTS.md: remove the "Prepend Transform" row (and any cross-reference if present).
3. Run `npx tsc --noEmit` from kupua/. Must pass.
4. Run `npm --prefix kupua test`. Must pass.
5. Run `npm --prefix kupua run test:e2e` (warn user about :3000 first per AGENTS directive). Must pass.
6. One commit. Suggested message: "chore: delete unused prepend-transform.ts (audit dead-code #1)"

Do NOT bundle any other audit finding into this commit. Push back if any test fails — investigate before deleting more.

Follow AGENTS.md directives throughout (especially: never commit without asking; warn before any Playwright run).
```

--- COMMIT BOUNDARY ---

### Pass 1b — Delete tombstone comments (1 commit) ✅ DONE

Three tiny comment-only edits. Zero behaviour change.

1. **Finding #34** — Delete `useDataWindow.ts:130–136` (7-line "REMOVED (Agent 10)" block).
2. **Finding #35** — Delete `useDataWindow.ts:440–448` (8-line "APPROACH #4 (Agent 10)" block).
3. **Finding #36** — Delete `search-store.ts:3258–3259` (2-line tombstone note).

**Tests required:** unit + tsc. No e2e (comment-only).

```text
Read kupua/exploration/docs/dead-code-audit-findings.md, focus on Section 6 Pass 1b only.

Goal: delete 3 tombstone comment blocks (findings #34, #35, #36). All document the absence of features — pure noise. Zero code change.

For each, verify the lines match the audit's description before deleting (line numbers may have drifted slightly):
- src/hooks/useDataWindow.ts ~lines 130–136: header "Post-seek backward extend suppression — REMOVED (Agent 10)"
- src/hooks/useDataWindow.ts ~lines 440–448: "APPROACH #4 (Agent 10): Removed `_postSeekBackwardSuppress` flag."
- src/stores/search-store.ts ~lines 3258–3259: "NOTE: `_postSeekBackwardSuppress` flag was removed (Agent 10)."

If any block doesn't match, STOP and report — do not guess.

After deletion:
1. Run `npx tsc --noEmit`. Must pass.
2. Run `npm --prefix kupua test`. Must pass.
3. One commit. Suggested message: "chore: remove Agent-10 tombstone comments (audit dead-code #34-36)"

No e2e needed — this is comment-only.

Follow AGENTS.md directives.
```

--- COMMIT BOUNDARY ---

### Pass 1c — Remove unnecessary `export` keywords on functions (1 commit) ✅ DONE

Ten mechanical edits. Function bodies stay; only the `export` keyword goes. Zero behaviour change.

**Subgroup A — exports with no callers anywhere (function unused but kept for now):**
1. **Finding #3** — `normalizeCql` in `cql.ts:473`
2. **Finding #4** — `fullImagesEnabled` in `image-urls.ts:262`
3. **Finding #6** — `getTunable` in `image-prefetch.ts:144`

**Subgroup B — exports of internally-used functions (function live, just not externally consumed):**
4. **Finding #7** — `getPrefetchLog` in `image-prefetch.ts:217`
5. **Finding #8** — `prefetchLog` in `image-prefetch.ts:206`
6. **Finding #10** — `lookupSortDistribution` in `sort-context.ts:335`
7. **Finding #11** — `computeTrackTicks` in `sort-context.ts:643`
8. **Finding #12** — `isEditableTarget` in `keyboard-shortcuts.ts:82`
9. **Finding #13** — `ALT_SYMBOL` in `keyboard-shortcuts.ts:173`
10. **Finding #14** — `markDetailEnteredViaSpa` in `orchestration/search.ts:311`

**Note (deferred decision):** Appendix A #3 flags that `_prefetchLog` ring buffer is write-only — populated but never read. If `getPrefetchLog` is removed, the entire logging infrastructure (`_prefetchLog`, `PREFETCH_LOG_CAP`, `PrefetchLogEntry`) becomes deletable. **Do NOT delete it in this pass** — flag for the user as a follow-up. Removing one `export` keyword is reversible; deleting infrastructure is not.

**Tests required:** unit + tsc. No e2e (no behaviour change).

```text
Read kupua/exploration/docs/dead-code-audit-findings.md, focus on Section 6 Pass 1c only.

Goal: remove the `export` keyword from 10 function/const declarations. Function bodies stay. Zero behaviour change. Findings: #3, #4, #6, #7, #8, #10, #11, #12, #13, #14.

For each, verify before editing:
1. Grep confirms no external importers (the audit cites the grep result; re-run to be sure).
2. The keyword "export" precedes the declaration in the cited file:line.

If any export turns out to have an importer the audit missed, STOP and report.

After editing:
1. Run `npx tsc --noEmit`. Must pass — if it fails, an internal usage broke; investigate before continuing.
2. Run `npm --prefix kupua test`. Must pass.
3. One commit. Suggested message: "chore: remove unnecessary exports on internal helpers (audit dead-code #3,4,6-8,10-14)"

No e2e needed — pure refactor.

DO NOT also delete the prefetch-log infrastructure (Appendix A #3). That's a separate decision the user wants to make. Just remove the `export` from getPrefetchLog and prefetchLog; leave the function bodies and ring buffer untouched. Mention in your final summary that Appendix A #3 remains open.

Follow AGENTS.md directives.
```

--- COMMIT BOUNDARY ---

### Pass 2 — Unused destructured locals (1 commit) ✅ DONE

Two intra-function dead variables caught by `tsc --noEmit`.

1. **Finding #18** — `es-adapter.ts:1227` change `const { field: primaryField, direction: primaryDir } = parseSortField(...)` to `const { field: primaryField } = parseSortField(...)`.
2. **Finding #19** — `image-prefetch.ts:~430` thumbnail loop: change `for (const [, { idx, priority }] of entries)` to `for (const [, { idx }] of entries)`.

**Tests required:** unit + tsc. No e2e.

```text
Read kupua/exploration/docs/dead-code-audit-findings.md, focus on Section 6 Pass 2 only.

Goal: remove two unused destructured locals (findings #18 and #19). Caught by `tsc --noEmit` TS6133.

Edits:
1. src/dal/es-adapter.ts:~1227 — change the destructure to drop `direction: primaryDir`. The variable is never referenced; `primaryField` IS used.
2. src/lib/image-prefetch.ts:~430 — in the thumbnail loop, drop `priority` from destructure. The loop uses an inline `Math.abs(idx - currentIndex) <= 1 ? "high" : "low"` expression instead. The full-res loop at ~454 still uses `priority` correctly — DO NOT touch that one.

After editing:
1. Run `npx tsc --noEmit`. Should now have 2 fewer TS6133 errors (verify by counting before/after).
2. Run `npm --prefix kupua test`. Must pass.
3. One commit. Suggested message: "chore: remove unused destructured locals (audit dead-code #18,19)"

Follow AGENTS.md directives.
```

--- COMMIT BOUNDARY ---

### Pass 3 — Barrel/re-export cleanup + delete `resetSearchSync` (1 commit) ✅ DONE

Mix of barrel removals and one full function deletion (corrected from audit's original).

1. **Finding #9** — Remove `export { DEFAULT_SEARCH }` from `useUrlSearchSync.ts:46`.
2. **Finding #15** — Remove `reverseSortClause` from `dal/index.ts:22` re-exports.
3. **Finding #16** — Remove `BufferEntry` from both `dal/index.ts:12` re-export and `dal/types.ts:31` definition.
4. **Finding #17** — Remove `TypeaheadField`/`TextSuggestionOption` re-exports from `lazy-typeahead.ts:35`.
5. **Finding #30** — Remove `SearchResult`, `AggregationRequest`, `SortDistBucket` from `dal/index.ts:9,15,18` type-export block.
6. **Finding #5** — Remove `export` from `unregisterShortcut` in `keyboard-shortcuts.ts:70`.
7. **Finding #2 (corrected per Appendix A #2):** **DELETE the entire `resetSearchSync` function** in `orchestration/search.ts:220`, not just the export. Audit's own Appendix A confirms it has zero internal callers either. Verify with grep before deleting.

**Tests required:** unit + tsc. No e2e (no runtime path touched).

```text
Read kupua/exploration/docs/dead-code-audit-findings.md, focus on Section 6 Pass 3 only.

Goal: clean up dead barrel re-exports and delete one fully-dead function.

Edits:
1. src/hooks/useUrlSearchSync.ts:46 — remove `export { DEFAULT_SEARCH };` line.
2. src/dal/index.ts — remove these from the re-export block: `reverseSortClause` (line 22), `BufferEntry` (line 12), `SearchResult` (line 9), `AggregationRequest` (line 15), `SortDistBucket` (line 18).
3. src/dal/types.ts:31 — remove the `BufferEntry` interface/type definition entirely.
4. src/lib/lazy-typeahead.ts:35 — remove the `TypeaheadField`/`TextSuggestionOption` re-export line.
5. src/lib/keyboard-shortcuts.ts:70 — remove `export` keyword from `unregisterShortcut`.
6. src/lib/orchestration/search.ts:220 — DELETE the entire `resetSearchSync` function. The audit's Appendix A #2 confirms it has zero internal callers either, not just dead export. Before deleting, run: `grep -r "resetSearchSync" kupua/src kupua/e2e` — should show only the definition + a comment in `reset-to-home.ts:49` (which references it by name in prose, not a call site). If a real call site appears, STOP and report.

After all edits:
1. Run `npx tsc --noEmit`. Must pass — barrel removals can break consumers if the audit missed any.
2. Run `npm --prefix kupua test`. Must pass.
3. One commit. Suggested message: "chore: remove dead barrel exports + resetSearchSync function (audit dead-code #2,5,9,15-17,30)"

No e2e needed — pure refactor.

Follow AGENTS.md directives.
```

--- COMMIT BOUNDARY ---

### Pass 4 — Type-only export cleanup (1 commit) ✅ DONE

13 cosmetic Medium-confidence type/interface export removals across ~6 files. Single commit per user preference.

1. **Findings #20–#29** — Remove `export` from `CqlParseResult`, `SnapshotStore`, `ScrubberMode`, `ScrubberProps`, `SparseFieldConfig`, `ComputeScrollTargetResult`, `DataWindow`, `PrefetchStats`, `CachedImagePosition`, `ScrollGeometrySnapshot`.
2. **Findings #31, #32** — Remove `export` from `FieldType`, `FieldGroup` (`field-registry.ts:39,42`), `FieldAlias` (`grid-config.ts:9`).
3. **Finding #33** — Remove `export` from 11 sub-type declarations in `types/image.ts:6,11,24,46,59,71,81,87,114,124,128` (`ImageDimensions`, `ImageAsset`, `ImageMetadata`, `UsageRights`, `Lease`, `Collection`, `UsageReference`, `Usage`, `Export`, `UploadInfo`, `SoftDeletedMetadata`).

**Tests required:** unit + tsc.

```text
Read kupua/exploration/docs/dead-code-audit-findings.md, focus on Section 6 Pass 4 only.

Goal: remove the `export` keyword from 24 type/interface declarations across ~6 files. All cosmetic — types are still used internally as field types or return-type annotations. Zero behaviour change.

Findings: #20, #21, #22, #23, #24, #25, #26, #27, #28, #29, #31, #32, #33 (13 audit findings, ~24 individual edits because #33 alone covers 11 types).

For each, the audit lists file:line. Workflow per type:
1. Re-grep `import.*<TypeName>` to confirm no external importer (audit ran this; re-verify in case of drift).
2. Remove the `export` keyword. Do NOT change the type body.
3. The type must still be reachable internally (as field type, parameter type, return type, etc.) — tsc will catch any breakage.

After all edits:
1. Run `npx tsc --noEmit`. Must pass. If it fails, an internal site needs fixing OR an importer was missed; investigate per failure.
2. Run `npm --prefix kupua test`. Must pass.
3. One commit. Suggested message: "chore: remove unused type exports (audit dead-code #20-33)"

No e2e needed — type-only changes, no runtime path.

If the diff balloons unexpectedly (e.g. tsc forces you to update many call sites), STOP — that means a type WAS being imported externally and the audit missed it. Do not paper over by re-adding `export`; report instead.

Follow AGENTS.md directives.
```

--- COMMIT BOUNDARY ---

### Open follow-ups (NOT in any pass)

These came up in the audit but were left out of the passes because they need user decision first:

- **Appendix A #3 — Prefetch log infrastructure.** `_prefetchLog`, `PREFETCH_LOG_CAP`, `PrefetchLogEntry` are write-only at runtime (only consumer `getPrefetchLog` is itself dead, removed in Pass 1c). Decide: delete the whole logging infrastructure, or keep for future use. If deleted, ~30 lines disappear and the runtime cost of populating the ring buffer goes too.
- **Appendix A #9 — Doc comment in `keyboard-shortcuts.ts:17`** mentions `unregisterShortcut()` — should be updated after Pass 3 removes the export. Trivial; bundle into next unrelated PR.
- **Appendix A #1 — TS18047 null-safety errors** in swipe/pinch hooks. Not dead code; latent crash risk. Needs its own bug-hunt or refactor pass.

---

## Appendix A — Out-of-scope observations

Capped at 30, one line each. Bugs/refactors/opinions, not dead code.

1. `tsc --noEmit` reports 54 × TS18047 ("possibly null") in `useSwipeDismiss.ts`, `useSwipeCarousel.ts`, `usePinchZoom.ts` — ref guards missing after DOM queries. Not dead code but a latent crash risk on unmount timing.
2. `src/lib/orchestration/search.ts:220` — `resetSearchSync` has NO internal callers either (the `_prevParamsSerialized = ""` logic is accessed via `setPrevParamsSerialized` which is the setter). This makes `resetSearchSync` dead function body, not just dead export. Deletion candidate (stronger than D1).
3. `src/lib/image-prefetch.ts` — `_prefetchLog` ring buffer is populated but `getPrefetchLog` is never called. The log is write-only at runtime. The log + its associated `PREFETCH_LOG_CAP` constant + `PrefetchLogEntry` interface could all be removed if `getPrefetchLog` is removed.
4. `src/lib/orchestration/search.ts` — `_isUserInitiatedNavigation` flag has careful comments about why it works; those comments are correct and worth keeping.
5. AGENTS.md component table has a "Prepend Transform" row — needs removal when file #1 is deleted.
6. `src/dal/types.ts` — `BufferEntry` (finding #16) was likely left when the search store internalized its own buffer representation. The name collides conceptually with the store's `results` array entries but is a different shape (has `sort` field). No confusion risk after deletion since it's unreferenced.
7. `sort-context.ts` — `lookupSortDistribution` and `computeTrackTicks` are only "exported" because `computeTrackTicksWithNullZone` (the public API) wraps them. This is a common pattern; the exports are unnecessary but the layering is clean.
8. `es-adapter.ts` has `MAX_BISECT = 50` hardcoded at line 807 — not a tuning knob in `tuning.ts`, undocumented in tuning-knobs.md. Scroll-audit §Q5 row for `MAX_BISECT` already notes this.
9. `src/lib/keyboard-shortcuts.ts:17` — doc comment says "or `unregisterShortcut()` more commonly via the `useKeyboardShortcut` hook" — after deleting `unregisterShortcut`, this comment line should be updated.
10. `src/hooks/useDataWindow.ts` exports `_updateForwardVelocity`, `_resetForwardVelocity` with underscore-prefixed names (convention = internal) but marked `export` for test access. Convention-inconsistency, not a bug.
