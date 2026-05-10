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

Enrichment connection-starvation fix done. 751 vitest tests passing. Playwright e2e pending (user to run manually).

## Session Log

### What was built (all uncommitted)

**Phase A — Grid API adapter scaffolding** (7 May 2026, 670→687 tests)
- `dal/grid-api/` — HATEOAS service discovery, adapter (getImageDetail, searchByQuery), Argo unwrapping, error types, write-guard Vite plugin
- `lib/grid-api-instance.ts` — module singleton
- `routes/search.tsx` — mounts `useEnrichment()` + `initGridApi()` effect
- `dal/grid-api/grid-api-adapter.ts:searchByQuery` — mirror-search for enrichment
- nonFree filter bug fix in `es-adapter.ts` (missing free-supplier branch)

**Cluster 1 — Cost, validity, enrichment** (7 May 2026, 687→726 tests)
- `lib/cost/calculate-cost.ts` — pure `calculateCost(usageRights, config)`, Scala port
- `lib/cost/validity-map.ts` — `buildValidityMap(image)` + `deriveInvalidReasons()`
- `lib/cost/guardian-config.json` — vendored config snapshot
- `stores/enrichment-store.ts` — Zustand store for API overlay data
- `hooks/useEnrichment.ts` — per-buffer-fill mirror-search hook
- `components/CostBadge.tsx` — cost variant badges (sm/md/lg)
- `components/ImageGrid.tsx` — cost badge, graphic blur, staff-photographer border, usage icons
- `components/ImageMetadata.tsx` — Rights section (cost badge, validity disclosure, lease count)
- `components/MultiImageMetadata.tsx` — Cost summary section (bucket counts + leased-fraction gradient)
- `lib/field-registry.tsx` — cost field + cellRenderer (renamed from .ts for JSX)
- `index.css` — cost color tokens

**Enrichment architecture redesign** (8 May 2026, 726→744 tests)
- Replaced parallel side-channel pattern with derived-view layer
- `lib/derive-enriched-image.ts` — pure `deriveImage(image, overlay?) → EnrichedImage`
- `hooks/useEnrichedImage.ts` — `useEnrichedImage(id)` (later refactored, see perf fix below)
- `components/ImageTable.tsx` — `EnrichedTableRow` wrapper (fixes Hole 1: table cells)
- `components/MultiImageMetadata.tsx` — `CostSummarySection` uses `deriveImage` (fixes Hole 2)
- `hooks/useEnrichment.ts` — `bufferGeneration` in cache key (fixes Hole 3: ticker)
- Deleted `useEnrichmentForImage` (clean cut, all callers migrated)
- `cellRenderer` signature: `(image: Image) → (enriched: EnrichedImage)`

**Mirror-search pagination fix** (8 May 2026)
- Root cause: Grid API enforces `length ≤ 200` (ElasticSearchModel.maxSize). After buffer extends (scroll/PgDown/reload-with-position-restore), buffer grows to 397-600 items → 422 Unprocessable Entity → no enrichment.
- Fix: `useEnrichment` now paginates into parallel chunks of ≤200 via `Promise.all`. Partial failure tolerated (skip failed pages). Deep-scroll cap at `10_000 - bufferOffset` (Hole 4, unchanged).
- ~~Known perf note~~: FIXED — incremental enrichment now implemented (see below).

**Incremental enrichment + debounce** (8 May 2026)
- 300ms trailing debounce — fast scrolling fires zero requests; one request when you stop.
- Delta detection: tracks `prevRangeRef` (query, orderBy, offset, length, generation). On forward extend → fetches only new tail. On backward prepend → fetches only new head. On seek/query/sort/ticker (generation change) → full refetch.
- Merge logic: incremental deltas merge into existing overlay map; full refetches replace it.
- If new range fully covered by previous enrichment → 0 requests (no-op).
- 744 vitest tests passing.

**Visual polish: table + grid badges, image detail enhancements** (8 May 2026)
- Restrictions tooltip on grid cells: fixed `deriveImage()` to overlay `usageRights` (was missing → tooltip always showed generic text)
- `IMAGE_BORDERS` extracted to shared `src/lib/image-borders.ts` (staff/contract/commissioned photographer → `#005689`)
- Table rows: 7px left border in selection column for staff photographer categories
- Badges column: replaces single "cost" column in field-registry. Renders: print → digital → syndication → cost → persisted (matching grid cell order)
- Column toggle memo bug fix: `EnrichedTableRow` now accepts `visibleColumnCount` prop to bust `memo()` on column visibility changes
- Badges `defaultWidth: 66`, `fitWidth: 99` (computed from badge slot dimensions); new `FieldDefinition.fitWidth` for icon/component-only columns where `computeFitWidth.measureText` is meaningless
- **Image detail — restrictions banner** (Kahuna inventory #22): coloured banner at top of metadata panel showing `usageRights.restrictions` text when present
- **Image detail — usage rights row** (Kahuna inventory #25): shows rights category (human-readable, e.g. "staff photographer") before cost badge
- **Image detail — lease list** (Kahuna inventory #28): expandable from count summary to full list with access type, date range, notes, active/inactive border styling (green=active, dim=inactive)

**Inventory B produced** (9 May 2026)
- `kupua/exploration/docs/inventory-B-from-kahuna.md` — 62 new rows not in inventory A

**Inventory C produced** (9 May 2026)
- `kupua/exploration/docs/inventory-C-from-backend.md` — 54 new data rows from direct Scala source reading
- Sources read: media-api routes + all 5 controllers, ImageResponse.scala, ImageExtras.scala, UsageQuota/Store.scala, ImagePersistenceReasons.scala, ElasticSearch.scala (both media-api and thrall), SearchFilters.scala, IsQueryFilter.scala, QueryBuilder.scala, Mappings.scala, SoftDeletedMetadata model, all satellite service route files (leases/usage/cropper/metadata-editor/collections), FileMetadataReader.scala (image-loader), image-counter-lambda handler, image-embedder-lambda
- Key findings: payType IS implemented backend-side (not disabled); isPotentiallyGraphic is runtime script field, not stored (A was wrong on Lives-in); metadata-search/label-search are on media-api not satellite (A attribution wrong); embedding field exists in ES (cohereEmbedV4 256-dim + cohereEmbedEnglishV3 1024-dim); 12 persistence reasons confirmed (no S3 checks — A was wrong); tass_agency_image validity reason not in A/B; 10 new search params; many usage/collections/leases satellite routes not in A/B
- Key findings: 5 sort modes named, 8 search URL params identified (takenSince/Until, modifiedSince/Until, uploadedBy, archived, ids, since/until), keyboard shortcuts fully enumerated, AI search + more-like-this, download feature (ZIP, low-res, fullscreen), batch export original, my-uploads checkbox, new-image polling, seen-watermark semantics, graphic blur client-side keywords, feature switches (exactly 3: ExampleSwitch/UseCqlChips/EnableAISearch), full structured-query typeahead field list, permissions filter config, notification polling
- 10 extends/contradicts-A findings (see file)

**Two-tier enrichment (viewport-first)** (8 May 2026)
- Root cause of perceived slowness: Grid API mirror-search at deep offsets takes 4-9s (ES `from/size` pagination penalty). Visible cost badges waited on full-buffer enrichment.
- Fix: two-tier architecture in `useEnrichment.ts`:
  - **Tier 1** (`useViewportEnrichment`): per-ID `getImageDetail` for visible items + 6-item margin. Concurrency-limited to 4 (leaves headroom for ES/thumbnails). 300ms debounce. Badges appear in ~1s regardless of scroll depth.
  - **Tier 2** (existing `useEnrichment`): buffer-level mirror-search, 3s debounce. Background backfill for multi-select panel, pre-scroll, etc. Never competes with Tier 1.
- Key design choices: no reactive `results` subscription (avoids image flash on prepend); abort only inside debounced callback (not per-frame); imperative `getState()` reads.
- Without API: per-ID fetches get 502 → null in <10ms. Zero slowdown in standalone mode.

### Known issues (intentional)

**SOURCE_INCLUDES canary** — `es-config.ts` only whitelists `usageRights.category`, not `.supplier`/`.suppliersCollection`/`.restrictions`. This makes `calculateCost()` return wrong baseline for agency images (always "pay"). The resulting Pay→Free flash when enrichment arrives is an **intentional diagnostic canary** — it proves enrichment is working. Fix is trivial (3 lines) but deferred until enrichment is verified across all surfaces. See enrichment-strategy.md.

**Hole 4 (deep scroll >10k)** — mirror-search fails past ES `max_result_window`. Deferred, documented in deviations.md entry 23. Research session planned before Cluster 2.

**Kahuna-fidelity pass: image detail panel** (8 May 2026)
- Validity banner: 3-state coloured (red/amber/teal). Text matches Kahuna exactly: isOverridden → "This image can be used, but has warnings:" / else → "This image can't be used"
- Restrictions banner: orange, shows `restrictions` text. Both banners show simultaneously (removed earlier `!showValidityBanner` guard that suppressed restrictions when validity was showing — Kahuna shows both)
- Validity colours: `isStrongWarning` → red; `!isStrongWarning && hasActiveAllowLease` → teal; else → orange. `isOverridden = hasInvalidReasons && isValid`; `isStrongWarning = !isOverridden || cost === "pay"`
- Lease dates: changed from absolute ("Until: 11 May 2026") to relative format via `formatLeaseRelative()` — "Expires in 3 days", "Expired yesterday"
- Cost row removed from detail panel; `usageRights_category.detailHidden = true`
- Badge column sizing: `defaultWidth: 66`, `fitWidth: 99`; new `FieldDefinition.fitWidth` property with early-return in `computeFitWidth`
- Badge reorder in table: print → digital → syndication → cost → persisted (matches grid cell order)

**Enrichment wiring audit + fixes** (8 May 2026)
- Full audit of ALL `EnrichmentFields` consumers across every component/hook/store
- **Bug fix**: `MultiImageMetadata.tsx` `CostSummarySection` — was reading `img.leases?.leases?.some(...)` (raw ES, always undefined because leases not in SOURCE_INCLUDES) for hasActiveLease count. Fixed to `enriched.leasesSummary?.hasActiveAllowLease`
- **Bug fix**: `MultiImageMetadata.tsx` `RightsAndLeasesSection` — was reading `img.leases.leases` for aggregate lease counts (always zero). Fixed to `enriched.leasesSummary?.currentCount` / `inactiveCount`
- **Minor fix**: `ImageGrid.tsx` + `ImageTable.tsx` — border colour was reading `image.usageRights?.category` (raw). Changed to `enriched?.usageRights?.category` with raw fallback. Works today because category IS in SOURCE_INCLUDES, but now consistent with enrichment-first pattern
- **Dead code removed**: `useEnrichedSelectedImage` in `useEnrichedImage.ts` — defined but never imported. MultiImageMetadata calls `deriveImage()` directly. Cleaned up stale JSDoc + unused `useSelectionStore`/`useMemo` imports

**Perf audit + fix** (8 May 2026)
- Sonnet perf audit dispatched (handoff: `transient-perf-audit-handoff.md`, findings: `transient-perf-audit-findings.md`). Two findings.
- **Finding 1 (S1) — `useEnrichedImage` redundant search-store subscription.** `useEnrichedImage(id)` subscribed to search-store and ran `results.find()` per visible cell on every store mutation — O(cells × buffer) synchronous scan per write. All three callers (GridCell, EnrichedTableRow, ImageMetadata) already had the `Image` in hand from props. Measured regression: +15-20ms ack across all interactive actions (PP2 48→67ms), +176ms on scrubber seek (PP7, multiple rapid store writes). **Fix (clean cut):** changed signature from `useEnrichedImage(id: string)` to `useEnrichedImage(image: Image | undefined)`. Removed search-store import and subscription entirely. Hook now only subscribes to enrichment-store (per-id `Map.get`, O(1)). All three call sites updated.
- **Finding 2 (S2) — Tickbox memo-busting inline arrow.** Both GridCell and EnrichedTableRow passed `(e) => onTickClick(image.id, e)` to memo'd Tickbox, creating a new closure per parent render. Fixed with `useCallback` in both components. Minor impact (fires once per cell per enrichment arrival, not per frame) but free since we were already editing both files.
- 744 vitest tests passing after both fixes.

**Code review fixes** (9 May 2026)
- **Bug fix**: Tier 1 viewport enrichment (`useViewportEnrichment`) had no try/catch around `getImageDetail`. AuthError/SessionExpiredError from expired panda cookie → unhandled rejection → entire batch dropped. Violates graceful-API-absence directive. Fixed: wrapped inner `getImageDetail` call in try/catch returning null. ~4 lines.
- Playwright e2e: 227 passed, 4 visual baseline snapshots regenerated (expected — Cluster 1 UI changes). 231/231 green.

**Tier collapse: single-lane enrichment at 300ms** (9 May 2026, 748→751 tests)
- Deleted `useViewportEnrichment` + `VIEWPORT_ENRICHMENT_DEBOUNCE_MS` + `VIEWPORT_MARGIN` (old two-lane code).
- `useEnrichment` now fires at 300ms debounce (was 3000ms) and re-triggers on scroll (`visibleRange` dependency added).
- Visible-first ordering: IDs in viewport ±6 rows pushed to front of list before chunking. Under HTTP/1.1, chunk 0 returns first; badges appear at ~1.1s.
- Progressive merging: `onChunk` callback added to `enrichByIds` — each chunk merges into store as it resolves. Final `Promise.all` result does authoritative full replace (removes stale evicted IDs).
- Abort semantics: abort immediately on `cacheKey` change (stale buffer); on scroll-only changes, leave in-flight running (data still valid), abort only when debounce fires.
- `routes/search.tsx`: removed `useViewportEnrichment()` call.
- 3 new tests in `grid-api-adapter.test.ts` (onChunk success, onChunk not called on failure, abort).
- `useEnrichment.test.ts`: added mock for `useVisibleRange` + removed unused `beforeEach` import.
- Docs: deviations.md entry 21, Appendix A table in cluster1-ids-enrichment-research.md, changelog.md updated.
- HTTP/1.1 connection-budget concern evaluated and rejected; reasoning in `useEnrichment.ts` JSDoc header.
- ~~Playwright e2e pending.~~ See connection-starvation fix below.

**HTTP/1.1 connection starvation: diagnosis and fix** (9 May 2026, 751 tests)

Root cause investigation of seek becoming ~3–7× slower with enrichment enabled.

*Symptom:* With Cluster 1 code active, clicking the scrubber froze the grid for 3–7 seconds before thumbnails appeared. Without enrichment (stashed), seek took <1s. Additionally, pound-sign cost badges (the SOURCE_INCLUDES canary) flashed on OLD thumbnails during seek transitions, then disappeared.

*Scroll-block note:* The user also reported a "scroll-block" (can't scroll further, as if at end of results). A/B testing with stash proved this bug exists on baseline too — NOT caused by enrichment. It's less severe on baseline (triggers later, recovers faster). Pre-existing issue, separate from this investigation.

*Binary isolation:* Commenting out `useEnrichment()` in `search.tsx` → seek was fast again. This confirmed enrichment was the sole cause. Non-enrichment changes (ImageGrid.tsx +147 lines, ImageTable.tsx +228 lines, es-adapter.ts +89 lines) were NOT contributing.

*First hypothesis (WRONG): React re-render cascade from `onChunk`.* The progressive `onChunk` callback called `setEnrichment(new Map(existing))` per chunk (22 chunks for 1000 IDs ÷ 46). Each call replaced the Map reference, triggering Zustand subscriber evaluation for all ~100 mounted cells. Theory: 22 render waves blocked the main thread. Testing disproved this — the visible-only test (1 chunk, 1 store update) was fast, but single-update-all-IDs was slow (5–10s). The problem was not store updates.

*Second hypothesis (WRONG): Seek ES request blocked behind slow `Promise.all`.* With 22 chunks via `Promise.all`, all 6 HTTP/1.1 connections were occupied. Theory: seek's ES request queued behind enrichment. Testing showed abort fired immediately (Zustand subscribe listener worked) but seek still took 3+ seconds. Aborting a `fetch()` doesn't instantly free TCP connections — the browser keeps them briefly.

*Root cause (CONFIRMED): HTTP/1.1 connection starvation via the Vite dev proxy.* All kupua traffic — ES queries (`/es/...`), API enrichment (`/api/...`), and thumbnails (`/s3/...`) — flows through the Vite dev server on `localhost:3000`. Under HTTP/1.1, browsers limit 6 TCP connections per origin. When enrichment fired N parallel requests (via `Promise.all` or even sequential-but-fast), the connections occupied slots that seek's ES request needed. The deadlock:

*Important — this is a dev-only artifact.* In production, ES, thumbnails (S3/CloudFront), and `/api` are on different origins. Each origin gets its own 6-connection budget; enrichment on `/api` cannot starve seek on ES. The fix below is correct (kupua needs to work in dev) but the deadlock it prevents cannot occur in production. When HTTP/2 or max-uri-length lands, the dev-mode workarounds become unnecessary even in dev.

  - Abort needs → `cacheKey` change → seek response → free connection
  - Seek response needs → free connection
  - Free connection needs → abort
The React effect lifecycle couldn't break this cycle because `cacheKey` only changes AFTER the seek response arrives (via `_seekGeneration` increment inside the store `set()`). By the time the effect cleanup ran, the damage was done.

*Fix (three mechanisms):*

1. **Zustand subscribe listener** — A `useSearchStore.subscribe()` listener (plain subscribe, NOT `subscribeWithSelector` which search-store doesn't use) fires outside the React effect lifecycle. When `loading` flips to `true` (seek/search starting), it immediately aborts the enrichment AbortController and clears any pending debounce. This breaks the deadlock by cancelling enrichment synchronously when seek fires, before the React effect cycle.

2. **`setTimeout(0)` yield between phase 1 and phase 2** — After phase 1 (visible IDs, single request) completes, the code yields to the macrotask queue before starting phase 2. This creates a window where the subscribe listener's abort can prevent phase 2 from ever opening connections. Without this, phase 2's fetch calls go out as microtasks immediately after phase 1 resolves.

3. **Sequential single-request chunking in phase 2** — Instead of `Promise.all` (6 connections simultaneously), phase 2 fires one chunk at a time. At most 1 HTTP connection is used by enrichment → 5 always free for seek/ES/thumbnails. Abort stops the loop instantly (only 1 in-flight request to cancel, not 6+).

*Removed from previous architecture:*
- `onChunk` progressive callback in `enrichByIds` — no longer called. All phase 2 results accumulated in memory and merged in a single store update.
- `Promise.all` parallel chunking in `enrichByIds` — still exists in the adapter but `useEnrichment` now calls it with single-chunk-sized arrays (sequential loop).

*Performance results (seek durations, measured via `performance.now()`):*
| Scenario | Seek 1 | Seek 2 | Seek 3 | Seek 4 |
|---|---|---|---|---|
| Before fix (parallel `onChunk`) | 800ms | **3060ms** | — | — |
| After fix (sequential + yield + abort) | 810ms | 841ms | 1069ms | 895ms |

*Trade-off:* Phase 2 offscreen enrichment now takes ~6.6s (sequential) vs ~5s (parallel). Invisible to user — offscreen cells don't paint. This trade-off becomes moot when any of three server-side changes land:

*Future server-side improvements that would simplify this:*
- **Raising `pekko.http.server.parsing.max-uri-length` to 16384** (+ matching nginx `large_client_header_buffers`): allows ~300 IDs per request instead of 46. Buffer of 500 IDs = 2 requests instead of 11. Even parallel would be safe (2 connections, 4 free). This is the single highest-impact change.
- **HTTP/2**: multiplexes all requests over one TCP connection — no 6-connection limit. Parallel `Promise.all` becomes safe again. The yield and sequential chunking become unnecessary (but harmless).
- **POST endpoint for `?ids=` enrichment**: body has no URL length limit. One request for all IDs, zero chunking. Combined with HTTP/2, the entire `useEnrichment` hook simplifies to a single `fetch` + single store update.

*Pound-sign flash:* Still present (briefly, <200ms). Cause: React paints baseline cost badges (always "pay" due to SOURCE_INCLUDES canary) before browser finishes loading new thumbnail JPEGs after seek. This is a timing mismatch between DOM paint and image decode, not an enrichment bug. Three fix options discussed (onLoad tracking, hasEnrichment gate, accept it). User chose to defer.

*Test fix:* `useEnrichment.test.ts` mock updated — the new `useSearchStore.subscribe()` call required `getState()` and `subscribe()` methods on the mock (previously only the selector function was mocked). Used `vi.hoisted()` to work around Vitest's mock hoisting.

### What's next

1. ~~Console.log cleanup in useEnrichment.ts~~ DONE
2. ~~HTTP/1.1 connection starvation fix~~ DONE (751/751 tests passing)
3. Playwright e2e (user to run — stop :3000 first)
4. Fix SOURCE_INCLUDES canary (deferred to "very end" — enrichment now verified across all surfaces)
5. Commit with user approval (batch: Phase A + Cluster 1 + redesign + pagination fix + audit fixes + perf fix + code review fix + ids-enrichment swap + tier-restructure + connection-starvation fix)

---

**Tier 2 IDs-enrichment swap** (9 May 2026)
- Swapped `useEnrichment` (Tier 2) from offset-based mirror-search to `?ids=` lookup.
- Phase 1: `enrichByIds(ids, signal?)` added to `GridApiDataSource` in `grid-api-adapter.ts`.
  Chunks into parallel batches of ≤46 IDs (Pekko HTTP 2048-char URL limit). Single-shared-failure
  semantics: any chunk null → whole call null. `MAX_IDS_PER_REQUEST` constant with env var override.
- Phase 2: `useEnrichment` rewritten. Removed `prevRangeRef`, incremental fetch logic, 10k offset cap,
  `bufferOffset` and `bufferLength` store subscriptions. Cache key simplified to `query|orderBy|bufferGeneration`.
  IDs extracted from buffer imperatively at fire-time (skipping undefined placeholders). Full replace semantics
  (incremental logic was offset-specific; IDs always describe the exact current buffer).
- Phase 3: `useEnrichment.test.ts` mock renamed `searchByQuery` → `enrichByIds`. All 744 unit tests pass.
- Phase 4: `deviations.md` entry 21 replaced (removed "offset ≤ 10k" limitation; added new ids-enrichment entry).
  Comment block at top of `useEnrichment.ts` updated to reflect new strategy.
- Added `VITE_ENRICHMENT_MAX_IDS_PER_REQUEST` commented-out entry in `.env.development`.
- LOC delta: adapter +65, hook net −40, test 0, deviations +16, env +4. Total net ~+45 vs predicted +12.
  Overshoot in adapter because chunking logic (explicit loop, inner async map, parallel Promise.all, flat) is
  ~40 LOC vs the research's ~25 estimate. Still well under the 150-line push-back threshold.
- Playwright e2e: 145 passed, 0 failed.
- TS error fixed: `extractEnrichment` references `hit.actions`, but `SearchHitImageData` lacked that field and
  `unwrapSearchHits` was silently dropping it (the `actions` array lives on the `EmbeddedEntity` wrapper, not on the
  unwrapped `data`). Fixed in two places: (1) `types.ts` — added `actions?: Action[]` to `SearchHitImageData`;
  (2) `argo.ts:unwrapSearchHits` — now merges `entity.actions` onto each hit via spread. Means HATEOAS actions
  (e.g. `delete`) from search responses now actually reach `EnrichedImage.actions` as intended. 744 tests still pass.



## Reference: enrichment architecture (for agents working on enrichment)

```
ES adapter   → search-store.results: Image[]              (unchanged, pure ES)
API adapter  → enrichment-store.overlay: Map<id, Overlay>  (ephemeral)
                                ↓
                deriveImage(image, overlay?) → EnrichedImage
                                ↓
        useEnrichedImage(image) — ONE hook, ONE merge function
```

- `deriveImage` is the SINGLE merge point. Runs `calculateCost`/`buildValidityMap` for baseline, layers overlay field-by-field. API wins.
- `useEnrichedImage(image)` takes the `Image` from props (NOT an id lookup). Subscribes only to enrichment-store per-id. No search-store subscription — avoids O(cells × buffer) scan.
- `useEnrichment()` — fires mirror-search per buffer-fill, paginated into ≤200 chunks.
- Components read `EnrichedImage` directly. No `??` fallback patterns anywhere.
- `deriveImage(image, undefined)` returns full baseline — graceful degradation built in.

### EnrichmentFields shape
```ts
interface EnrichmentFields {
  cost?: Cost; valid?: boolean; invalidReasons?: Record<string, string>;
  persisted?: { value: boolean; reasons: string[] }; usageRights?: UsageRights;
  leasesSummary?: { currentCount: number; inactiveCount: number };
  actions?: Action[]; isPotentiallyGraphic?: boolean;
  syndicationStatus?: SyndicationStatus; usages?: Usage[];
}
```

### CostCalculator logic (Scala port)
Priority: restrictions → categoryCost → supplierCost → default (Pay).
`supplierCost` only for `category === "agency"`: check `freeSuppliers` list, exclude via `suppliersCollectionExcl`. Overquota is API-only (server computes from usage data).

---

**Tier 1 restructure + enrichByIds partial-failure fix + console.log cleanup** (9 May 2026)
- HTTP/2 pre-flight confirmed HTTP/1.1 on TEST. Collapse verdict overridden; proceeded with Restructure.
- Phase 0: `enrichByIds` failure semantics changed from single-shared-failure to per-chunk-tolerate-failure.
  `successful.filter(r !== null).flat()` — total failure still returns null. 4 new adapter tests added.
- Phase 0b: `searchByQuery` deleted from `grid-api-adapter.ts` (dead code since `?ids=` swap).
- Phase 1: `useViewportEnrichment` internals swapped from per-ID `getImageDetail` concurrency loop to single
  `enrichByIds` call. Deleted: `extractEnrichmentFromDetail`, `VIEWPORT_CONCURRENCY`. Two-debounce structure
  (300ms viewport, 3000ms buffer) retained — required under HTTP/1.1 to prevent connection starvation.
  Tier 1 now also delivers `actions` + `isPotentiallyGraphic` (previously missing from per-ID endpoint).
- Phase 2: 5 console.logs stripped from `useEnrichment` + `useViewportEnrichment`. Dead `const now` removed from `extractEnrichment`.
- Phase 3: `enrichByIds` adapter tests added (empty list, success, total failure, partial failure).
  `useEnrichment.test.ts` description updated (removed stale `searchByQuery` ref). 748 tests pass.
- Phase 4: deviations.md entry 21 updated to reflect single-mechanism-two-lane architecture.
  File-level JSDoc, `ENRICHMENT_DEBOUNCE_MS` comment, and `useViewportEnrichment` JSDoc updated.
- Follow-up: HTTP/2 on `/api` to be raised with engineering. When it lands, collapse is a ~130-line trivial commit.

