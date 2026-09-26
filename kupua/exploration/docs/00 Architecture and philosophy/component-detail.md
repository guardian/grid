# Kupua — Component Detail Reference

> This file contains detailed descriptions of every major component/subsystem.
> It is NOT loaded at session start. Agents read it on demand when working on
> a specific area. For the bootstrap summary, see `kupua/AGENTS.md`.
>
> **Last refreshed: 26 September 2026.** API-build U6z non-AI routing/startup/recovery verified;
> tests-only changes passed operator-reported cold review. This is not whole-system verification. The
> [active build plan](../03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md)
> owns sequencing and acceptance. AI remains unchanged; U8 deployment and U7 delivery remain separate.

---

# Data Layer

## DAL (`src/dal/`)

`ImageDataSource` (`dal/types.ts`) is selected by `createDataSource()` (`dal/index.ts`):
`ApiDataSource` when `VITE_USE_MEDIA_API=true`, otherwise `ElasticsearchDataSource`.

**API mode:** pages use `search-after`/`window`; ranks use `rank`; scalar/date/keyword profiles
use `sort-profile`; maps and range walks use `keys`. Walk loops and caps stay client-side.
Counts/tickers use `count`; facets, typeahead and collection counts use `aggregations`;
standalone detail uses `GET /images/:id`; selection hydration uses `mget` (200 IDs per request,
at most four in flight). `getById(id, signal?)` returns `{image, enrichment?} | undefined`;
`getByIds` deliberately returns `Image[]` without enrichment. `openPit` resolves `null`;
`offsetReadLimit` is 10,000, so an estimate-less deep seek lands at 9,800 with its actual position.
`DEVELOPMENT_FALLBACK_METHODS` contains only `searchByAi`, deliberately retained through U6z.
The current factory still constructs ES for that delegation; no migrated read uses it as rescue.

**Direct/local mode:** `ElasticsearchDataSource` retains cursor paging/PIT recovery, aggregations,
rank/profiles, `getByIds` (1,000-ID parallel chunks), and `getIdRange` (cursor walk, cap 5,000).
Write protection on non-local ES is unchanged. `MockDataSource` supports sparse-field/null-zone
tests; `PositionMap` (`position-map.ts`) is the lightweight cursor index for indexed seeking.

ES-specific code in `dal/adapters/elasticsearch/`: CQL→ES translator, sort clause builders (universal `uploadTime` fallback). Null-zone helpers in `dal/null-zone.ts` (`detectNullZoneCursor`, `remapNullZoneSortValues`) — shared across seek, extend, fill, and getIdRange paths.

**Gotchas:**
- **`DATE_SORT_FIELDS`** (exported set) — ES sort values are epoch ms; `_source` values are ISO strings. Callers must convert ISO→epoch before comparing.
- **`ALLOWED_ES_PATHS`** lives in **both** `es-config.ts` and `vite.config.ts` (separate hardcoded arrays that must be kept manually in sync).

## Grid API Adapter (`src/dal/grid-api/`, `src/dal/grid-api-search-adapter.ts`)

**Search path (`--use-media-api` mode):** `grid-api-search-adapter.ts` builds the shared request body (`buildReadBody`), posts reads (`postImageRead`) and maps Argo-wrapped pages (`apiSearchAfter`, `apiImageWindow`) to `SearchAfterResult` including a per-hit enrichment map (`extractEnrichment`). Called by `ApiDataSource`; `search-store` writes the enrichment map to `enrichment-store` at commit-to-view points only (probe calls never write — F-1 guard). `countAll` is sent only when the caller sets `trackTotalHits`.

**Failure handling:** `SearchAfterApiError` distinguishes explicit HTTP 410 with
`search-after-pit-expired` from transport absence and refusals. A supplied PIT that expires is
retried once without it (not reachable while `openPit` returns `null`). No migrated read falls back
to ES: page, rank and range failures throw into the store's error paths; optional profiles and
maps return `null` without warning on media-api refusal, incompleteness or unreachability.
Cancellation is preserved. Counts/aggregations reject failures for their callers to handle as
absent or unchanged data. Bulk lookup rejects the whole logical read if any chunk fails, aborting
the rest, so a partial response cannot authorize removal of selected IDs. Explicit execution
incompleteness is rejected by rank, keys, profiles, count, aggregations and mget, and now by
search-after/window with 503 ([KUP-036](../bug-backlog.md#kup-036)); individual decode omission
remains unchanged. U6z verifies that current non-AI recovery stays on API reads, including when
the follow-up read fails; it adds tests, not another runtime routing mechanism.

**Standalone detail:** `apiGetImage` uses the S1 normalizer and extracts envelope actions and
enrichment once. Missing/hidden (404) or wrong-ID entities resolve `undefined`; other request
failures reject. ImageDetail handles these quietly as unavailable and owns request cancellation.

**Older HATEOAS adapter:** `GridApiDataSource.getImageDetail` remains unused by production callers;
it is not the standalone-detail path. It uses `service-discovery.ts`/`argo.ts`, returns `null`
for network/abort/404/permission-403, but throws auth/session/write-guard/other server errors.
Do not describe it as universally nullable. `initGridApi()` still initializes the module singleton
on search-route mount. Deletion/alignment of the unused method is parked in the build plan.

**Write guard:** `gridApiWriteGuard()` blocks non-GET requests unless explicitly enabled, except
the eight read-only POST routes listed in `grid-api/read-via-post.ts`. Admission matches the exact
path (query string allowed), never an image-ID prefix; this prevents admitting nested write routes.

## Enrichment System (`lib/cost/`, `stores/enrichment-store.ts`, `lib/derive-enriched-image.ts`)

Three-layer merge model:

1. **ES baseline inputs** — `SOURCE_INCLUDES` in `es-config.ts` fetches rights/leases/usages/labels/syndicationRights/XMP fields. Always available in direct-ES mode.
2. **TS cost+validity calculation** — `calculateCost` (port of Scala `CostCalculator`), `buildValidityMap` + `deriveValid` (mirrors Scala's two-pass override model), `isImagePotentiallyGraphic` (TS port, replaces Painless script field not in `_source`), quota-store (`fetchQuotas()` at startup, graceful absence). `guardian-config.json` is a vendored config snapshot.
3. **API overlay** — `enrichment-store` (Zustand, no persistence) receives committed search-after/window page enrichment. `deriveImage(image, overlay?)` merges server fields over the baseline; direct ES supplies no overlay. Standalone detail holds its own requested-ID-bound overlay rather than publishing into this store. AI and selection bulk lookup intentionally supply baseline images only; this is not universal effective-display/freshness parity (KUP-029/030 remain deferred).

**Consuming enriched data:** `useEnrichedImage(image, ownOverlay?)` subscribes per-ID to the
enrichment store (O(1) `Map.get`); an owned standalone overlay takes precedence. Non-React
callers use `deriveImage` directly. ImageDetail passes its owned overlay to ImageMetadata only
while displaying that standalone image. Selection bulk lookup does not add server enrichment.

Fresh API pages and committed first-page fallbacks replace the overlay map. Fill, extensions,
focus/restore buffers and seeks merge their contributing overlays. An inserted target contributes
only its selected probe entry; both backward seek paths include backward-page overlays. Discarded
probes and cancelled pages do not publish, and direct-ES responses do not invent API enrichment.
U6z's synthetic same-ID ordinary/AI/ordinary sequence confirms that an AI baseline can still use
the previous ordinary API overlay until a new API result replaces it (KUP-030). That residual is
separate from the removed ordinary unavailable-to-ES fallback; selection enrichment is unchanged.

## State (`src/stores/search-store.ts`)

Zustand. Windowed buffer (max 1000, cursor-based extend/evict/seek) — shared by all three scroll tiers (`03-scroll-architecture.md` §2). Scroll-mode fill (`_fillBufferForScrollMode`) loads all results when total ≤ SCROLL_MODE_THRESHOLD (1000). Background `positionMap` fetch (for SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD = 65k) enables indexed scroll tier. Above 65k, the scrubber falls back to seek-only. Bidirectional seek: deep paths add a backward `search_after` after the forward fetch, placing the user in the buffer middle. `imagePositions: Map` for O(1) lookup. Sort-around-focus ("Never Lost"). PIT lifecycle with generation counter (`_pitGeneration` — seek/extend skip stale PITs to avoid 404 round-trips, keepalive 1m). New-images ticker. Aggregation cache + circuit breaker (expanded agg requests have abort controllers). Sort distribution (`sortDistribution`) + null-zone uploadTime distribution (`nullZoneDistribution`) for scrubber labels/ticks. Separate `column-store` + `panel-store` (localStorage-persisted).

Committed response tuples are retained in `lib/image-offset-cache.ts`: at most `2 * BUFFER_CAPACITY`
recent entries plus one active selection-anchor tuple, all in memory. Lookups check the image ID
and search fingerprint; input/output arrays are copied. Fresh searches replace recent entries,
and focus trimming keeps tuples aligned with images. Desktop/touch ranges and detail history
prefer retained tuples over raw-field reconstruction, preserving API-only aliases. Selection
owns the extra anchor entry through set, re-election, clear and hydrate. Cancelled work cannot
publish stale extension/neighbour results, and replacing navigation clears cancelled busy flags.

`createExpiryAwareSearchAfter` records explicit PIT invalidation when a still-owned paging
response completes, including before a paired request fails. Following requests skip cleared
IDs, and final commits cannot resurrect an ID cleared during a later await. Scroll-mode fill
also stops reusing an expired ID. Direct ES retains parallel page-one/PIT opening; API-mode
`openPit` returns `null`, so maps are built live. This introduces no stronger snapshots, durable
sessions or migration support. Restore retains the session total and uses the selected full tuple
for both rank and neighbours, with one conditional extra rank when the refreshed tuple changed.
Polling retains the browse baseline plus the latest owned cumulative arrival contribution.

## Field Registry (`lib/field-registry.tsx`)

Single source of truth for static image fields and config-driven aliases. Fields carry `multiSelectBehaviour` (`"scalar" | "chip-array" | "summary" | "always-suppress"`), `showWhenEmpty` (renders `<Dash />` placeholder), `visibleWhen` (config gate, e.g. `imageTypes?.length`), `summariser`. `RECONCILE_FIELDS` exports non-`always-suppress` fields. The registry drives table columns, sort dropdown, facet filters and single/multi-image metadata. `detailLayout`/`detailGroup`/`detailClickable` control metadata display; `pillVariant` supports accent labels. `SORT_DROPDOWN_OPTIONS` and `DESC_BY_DEFAULT` supply sort controls.

## URL Sync

Single source of truth. `useUrlSearchSync` → store → search. Zod-validated params (`search-params-schema.ts`). `resetSearchSync()` for forced re-search. Custom `URLSearchParams`-based serialisation. Sort-only change detection triggers `sortAroundFocusId` when only `orderBy` changes while an image is focused. Sort-around-focus falls back to `anchorId` when `focusedImageId` is null and selection mode is active (so sort changes in selection mode preserve position). `useDocumentTitle` hook sets `document.title` to `{query} | the Grid`, with `(N new)` prefix from the new-images ticker. Selections clear-on-navigation hook wired here (gated on `SELECTIONS_PERSIST_ACROSS_NAVIGATION` in `tuning.ts`, skips sort-only and first-mount).

## CQL

`@guardian/cql` supplies the `<cql-input>` Web Component; `LazyTypeahead` provides non-blocking
suggestions. `typeahead-fields.ts` reads current aggregation/ticker/filter caches via live store
getters, then issues scoped `getAggregations` reads through the captured app datasource: media-api
in API mode, ES in direct mode. There is no separate `getAggregation` method after U6c.
Native `TextSuggestionOption.count` renders the counts. `is:` uses ticker/category caches and
named-filter aggregation reads when cold. API usage counts use Grid's root `usagesPlatform` and
`usagesStatus` rollups, counting images per value rather than usage records.

Arbitrary dotted fields use `buildDynamicFieldFallback` and isolated single-field reads;
`isolateAggregationFailure` prevents an uncountable field from breaking the static batch.
`liveQueryRef` carries the AST-serialized query before resolvers run, avoiding one-keystroke-old
scope. Direct ES translates CQL locally; API bodies let Grid interpret the query. The quoting
workaround in `lib/cql-ast-serialize.ts` is documented in deviations section 14a; check the installed
CQL version and upstream fix before retiring it, rather than assuming historical PR status.

The registered element retains its initial typeahead and datasource; cache callbacks read current
aggregation, ticker and filter state without wrapper-owned subscriptions. The live-AST query ref
is separate from those caches. Registration is not a runtime datasource-switching API.
U6z verifies cold API-mode initialization and first-resolver ownership through repeated remounts,
including fully mounted Clear/Home checks. KUP-026's fixed-mode integration scope is closed;
runtime rebinding is neither required nor certified.

Registered and arbitrary-path typeahead use the same AST source-span removal for self-exclusion.
Only matching field nodes are removed, including empty chips and quoted deep keys; quoted literal
contents and unrelated incomplete input remain untouched. Deletions run right-to-left and only
join whitespace at the removed boundaries. The visible editor is not rewritten to fetch suggestions.

Direct-client `has:` and dynamic facet targets share `getHasFieldPath`: configured aliases take
precedence, followed by static shorthand and raw-path passthrough. This is existence of the indexed
leaf, not boolean truthiness or named-field multi-field expansion.

## Image URLs (`lib/image-urls.ts`)

URL builders for thumbnails and full-size images. Thumbnails served from S3 via local proxy (`/s3/thumb/<id>`). Full-size images served via imgproxy: AVIF format by default, DPR-aware sizing (two-tier: 1× for standard displays, 1.5× for HiDPI > 1.3), EXIF orientation → explicit `rotate:N` (auto_rotate disabled), native-resolution cap to prevent upscale. `getFullImageUrl()` builds imgproxy processing URLs; `getThumbnailUrl()` returns proxied S3 paths. Both return `undefined` when the respective service is unavailable (local mode).

ImageDetail compares resolved absolute URLs before attempting its single thumbnail fallback.
Failure and load/error callbacks belong to the current image lifetime and current DOM element;
traversal starts with fresh media state while retaining the detail/fullscreen containers. Terminal
failure leaves metadata, Back and traversal available. This does not provide rendition URL renewal.
API mode still uses these local media proxies. Canonical entity-link delivery and bounded expired-URL
renewal are U7, not completed by the migration of metadata reads.

## Grid Config (`lib/grid-config.ts`)

Vendored Grid configuration (image types, usage rights categories, aliases and CQL field lists),
derived from `exploration/mock/grid-config.conf`. CQL and sort builders depend on it. Runtime
server-authoritative configuration is not yet wired: local media-api aliases must match the client
configuration, checked by the documented API preflights. A new config endpoint is not implicitly
required or implemented by U6z.

---

# Hooks & Coordination

## Data Window (`hooks/useDataWindow.ts`)

Bridge between the search store and view components (ImageTable, ImageGrid, ImageDetail). Provides buffer-aware data access (`getImage(index)`), edge detection + extend triggers (`reportVisibleRange`), and a density-independent API. Two hook modes: **normal** (buffer-local indices, virtualiserCount = results.length) and **two-tier** (global indices 0..total-1, skeleton cells outside buffer, scrubber drag directly scrolls). Normal mode serves both the scroll tier (≤1k, full buffer) and the seek tier (>65k, windowed buffer); two-tier mode serves the indexed scroll tier (1k–65k). Viewport anchor tracking (always the centre image) for density-focus and sort-around-focus fallback. Scroll-seek debounce (200ms) for two-tier mode.

## Scroll Effects (`hooks/useScrollEffects.ts`)

Shared hook for all scroll lifecycle — parameterised by `ScrollGeometry` descriptor. Handles: scroll reset orchestration, prepend/forward-evict compensation, seek scroll-to-target (reverse-compute + lastVisibleRow buffer-shrink preservation + headroom-zone sub-row pixel preservation), sort-around-focus scroll, density-focus save/restore (with edge clamping), bufferOffset→0 guard.

**Scope by tier:** Prepend compensation and eviction compensation apply only in the **scroll** (≤1k) and **seek** (>65k) tiers where the virtualizer count equals the buffer length and items are inserted/removed. In the **indexed scroll** tier (1k–65k), the virtualizer always spans `total` items — items are replaced at fixed global positions, not inserted or removed. Swimming does not exist in indexed scroll mode. The timing chain below still applies to seek cooldowns.

**Key invariants:**
- **Seek cooldowns** (constants in `tuning.ts`): post-arrival extend block, deferred scroll timer (fires synthetic scroll to trigger extends without causing swimming), search-fetch cooldown (blocks extends during in-flight search/abort).
- **Post-extend cooldown:** prevents cascading prepend compensations (swimming).
- **`seekGeneration` ref guard:** on seek, skips one stale `handleScroll` to prevent spurious `extendBackward`.
- **End-seek focus guard:** pending End work retains its initiating focus permission; a later focus change cannot grant it new permission. Reverse Home-then-resident-End remains KUP-013, not a completed symmetric repair.
- Module-level bridges for density-focus and sort-focus.

## List Navigation (`hooks/useListNavigation.ts`)

Shared keyboard navigation for all density views, parameterised by `ListNavigationConfig`. Two modes: **no focus** (Arrow Up/Down scroll one row, PageUp/Down scroll one page, Home/End go to absolute start/end — none set focus) and **has focus** (arrows move focus by ±columnsPerRow, PageUp/Down move focus by one page of rows, Home/End focus first/last image, Enter opens detail). Table passes `columnsPerRow: 1`, grid passes `columnsPerRow: N`. CQL input propagates ArrowUp/Down/PageUp/Down/Home/End; native inputs excluded via `isNativeInputTarget`. Home key: two-branch scroll-reset (eager `scrollTop=0` when `bufferOffset=0`, deferred otherwise). End key: uses `virtualizer.scrollToIndex` (not raw `scrollHeight` — that overshoots by sticky header height). In selection mode: arrow keys are scroll-only; table Left/Right scroll container horizontally. Alt+arrow combos fall through to browser defaults.

## Image Traversal (`hooks/useImageTraversal.ts`)

Shared prev/next navigation for ImageDetail and FullscreenPreview. Works uniformly across all three scroll modes (buffer, two-tier, seek). If the adjacent image is in the buffer → navigate immediately; if near buffer edge → trigger extend, store pending navigation, resolve when buffer grows; if at absolute boundary → no-op. All logic in global indices. Fires `prefetchNearbyImages` on every successful navigation (direction-aware). Traversal is disabled while `usePinchZoom` reports scale > 1×.

## Return from Detail (`hooks/useReturnFromDetail.ts`)

Handles detail close for ImageTable and ImageGrid. The immutable detail-entry image is retained
in history state across traversal/reload. Closing on that original image preserves native list
placement; closing after traversal centres the last-viewed image with current geometry and the
appropriate focus mode. Deferred work is guarded against newer navigation/search, and Home has
an owned suppression path. It does not unconditionally re-centre every close.

## Prefetch Pipeline (`lib/image-prefetch.ts`)

Cadence-aware prefetch shared by ImageDetail, FullscreenPreview, and the swipe carousel. Organised around a **TraversalSession** — a module-level singleton that tracks the user's navigation burst (held arrow key, chain-swipe). EMA-smoothed cadence determines prefetch radius: fast bursts → narrow (i±1 + far lookahead); stable cadence → full radius. Post-burst debounce fires a full-radius fill around the resting position. Stale in-flight requests are cancelled via `img.src = ""`, except the newly visible image whose prefetch may be coalesced with the centre `<img>` request. `fetchPriority` hints keep the most-likely-next image at the front of the browser's connection queue. On mobile, thumbnails are issued before full-res within each batch. All thresholds tunable at runtime via `localStorage` keys (`kupua.prefetch.<key>`) — no rebuild needed.

Each full-image loader captures its issuing in-flight map. Load/error/decode completion removes
tracking only when that map still holds the same loader for the ID, including cancellation/reissue
within a session. Late successful decode can still warm the bounded cache; cache usefulness does
not grant ownership of a newer loader's tracking.

## Orchestration (`lib/orchestration/search.ts`)

Imperative coordination functions extracted from UI components and hooks. Holds: debounce cancellation (`cancelSearchDebounce`, `getCqlInputGeneration`), go-home preparation (`resetScrollAndFocusSearch`), URL sync reset (`resetSearchSync`), fullscreen preview registration (`registerEnterPreview` / `enterFullscreenPreview` — used by middle-click handler in ImageGrid/ImageTable, same pattern as `scrollToFocused`). Called by SearchBar, ImageTable, ImageMetadata, ImageDetail, useScrollEffects, useUrlSearchSync. Dependency direction: components → hooks → lib → dal.

## Reset-to-Home (`lib/reset-to-home.ts`)

Single `resetToHome()` function deduplicating the reset sequence from SearchBar and ImageDetail logo click handlers. Clears `focusedImageId`, density-focus saved state, and selection (`selection.clear()`) **before** navigation — prevents the table unmount from saving a stale viewport ratio and the grid mount from restoring it (which would fight the go-home scroll-to-top intent).

## Keyboard Shortcuts (`lib/keyboard-shortcuts.ts`)

Centralised shortcut registry. Single-character shortcuts: bare key when not in an editable field, Alt+key when editing (Alt chosen to avoid Cmd/Ctrl browser conflicts). One `keydown` listener on `document` (capture phase). Components register via `registerShortcut()`/`unregisterShortcut()` or `useKeyboardShortcut` hook. `shortcutTooltip()` formats hints for button titles. `isNativeInputTarget()` guards against firing in date inputs and other native controls. Elements with `data-grid-nav-input` attribute are excluded from native-input detection (opt-in to grid navigation while remaining an `<input>`).

## Bedrock Proxy Client (`lib/bedrock-proxy-client.ts`)

`getEmbedding(query): Promise<number[]>` and `checkBedrockHealth(): Promise<boolean>`. Plain `fetch()` to Vite middleware endpoints (`/bedrock/embed?q=...`, `/bedrock/health`). Called by `es-adapter.ts:searchByAi()` and `main.tsx` (startup health check). Graceful: network error → returns `false` / throws (caught by store).

## AI Search Params (`lib/ai-search-params.ts`)

`decorateParamsForAggregations(params, resultIds)` scopes count/facet requests to the bounded
loaded AI set using sorted, comma-joined IDs. It returns `null` for known-empty AI membership:
callers publish empty counts/facets locally and invalidate obsolete work without a request.
Inactive AI leaves params unchanged. Reads use the selected datasource, including media-api
counts/aggregations while AI ranking itself still uses direct ES. Exploratory typeahead retains
its separately owned scope.

## Browser History (`lib/orchestration/history-key.ts`, `lib/history-snapshot.ts`, `lib/build-history-snapshot.ts`)

`kupuaKey` scheme attaches a per-entry UUID to every `pushState`/`replaceState`. `history-snapshot.ts` stores/retrieves `HistorySnapshot` (scroll position, buffer state, focus, etc.) in sessionStorage keyed by `kupuaKey`. `build-history-snapshot.ts` constructs the snapshot from current store state. `useUrlSearchSync.ts` popstate handler restores the snapshot (if present) rather than doing a fresh search. Full architecture: `exploration/docs/00 Architecture and philosophy/04-browser-history-architecture.md`.

## Touch Gesture Hooks

- **`hooks/useSwipeCarousel.ts`** — visual slide-in carousel for prev/next on mobile touch. Velocity-aware commit, `commitStripReset`. Used by ImageDetail.
- **`hooks/useSwipeDismiss.ts`** — pull-down-to-dismiss image detail. Spring-back, fade+scale. Mobile, non-fullscreen only.
- **`hooks/useLongPress.ts`** — 500ms threshold, movement cancel, contextmenu suppress, Android `pointercancel` fix via committed-state guard. First long-press enters selection mode; second long-press dispatches full `add-range` (same buffer/server path as desktop shift-click). `handleLongPressStart.ts` is the shared helper extracted from grid+table.
- **`hooks/usePinchZoom.ts`** — fullscreen-only. Touch: two-finger pinch 1×–5×, single-finger pan, double-tap 1×↔2×. Desktop: click-to-zoom 1×↔2×, wheel zoom 1×–4×, drag-to-pan with momentum (rAF decay, relaxed overflow clamp), keyboard zoom (Space toggle, arrows pan, Home/End snap to corners). Rapid second click exits fullscreen (double-click window). **Ghost-click guard:** `lastTouchTime` gate prevents mouse handlers firing after `touchend`. **`onScaleChange` callback** notifies traversal hook to disable nav while zoomed. Zoom resets on image change.

---

# Selection System

## Selection Store (`stores/selection-store.ts`)

Zustand persists selected IDs and anchor to sessionStorage with debouncing; metadata and the
reconciled view are runtime-only. The default datasource is the search store's, so hydration,
`ensureMetadata` and range walks use media-api in API mode. Metadata lives in a revision-tracked
mutable LRU (cap 5,000). Cached membership updates reconcile synchronously; arriving metadata
requests a coalesced full reconciliation when it overlaps the current selection.

`hydrate()` runs on search-route mount. A complete successful lookup can remove omitted IDs,
repair the anchor and issue one unavailable-items toast only while the captured selected Set
and anchor still own the request. Rejected reads retain membership; late successful metadata
can still warm the cache. API mget uses 200-ID chunks/four in flight, rejects any failed logical
lookup and supplies no enrichment. `electFallbackAnchor` uses the last remaining Set entry.
Clear-on-navigation remains controlled by `SELECTIONS_PERSIST_ACROSS_NAVIGATION`.

## Click Interpreter (`lib/interpretClick.ts`)

Pure function `interpretClick(ctx) → ClickEffect[]`. Six-row rule table is the contract: plain click = focus only; tickbox/cmd+click = toggle + set anchor; shift+click = `add-range` effect (polarity computed in `useRangeSelection` from `selectedIds.has(anchorId)` — not from `targetIsSelected`). `ClickEffect` union: `focus`, `toggle`, `set-anchor`, `add-range`. `dispatchClickEffects.ts` executes `ClickEffect[]` against store + navigation.

## Reconciliation (`lib/reconcile.ts`)

`recomputeAll(images, fields)` computes the full view over cached selected images; incremental
add/remove paths update already-loaded membership. Chip arrays use frequency-based accounting;
mixed fields retain value counts for `MultiValue` tooltips. `requestFullReconcile` coalesces work
into one `requestIdleCallback` (2 s scheduling timeout, `setTimeout` fallback). It does **not**
chunk the full scan: the measured large-selection stall is open [KUP-035](../bug-backlog.md#kup-035)
in both modes. Cached metadata may represent only part of the selection; do not promise that
every selected image has loaded merely because a view is available.

## Range Selection (`hooks/useRangeSelection.ts`)

Orchestrates shift-click and touch ranges. In-buffer selection uses `imagePositions`; otherwise
`getIdRange` walks source-free API keys or direct-ES cursors, preserving `(from,to]` and the 5,000
cap with lookahead. Unknown endpoint order permits one swapped attempt after an empty walk,
including overshoot. Request ownership covers membership/anchor intent, query/order, supersession
and unmount; obsolete success, rejection and finalization cannot affect a newer range.
Metadata-only updates and same-search display changes do not cancel legitimate selection work.

Retained response tuples take precedence over reconstruction. `extractSortValues` converts dates
and falls back to configured string/number alias values when raw paths are absent (U6d); boolean
alias cursors remain a parked limitation. The active anchor tuple survives recent-cache eviction.
Existing truncation/soft-cap feedback stays; the route owns the hook and passes it to both views.

## Selection UI

- **`components/Tickbox.tsx`** — absolute-positioned overlay (grid) + 32px leftmost column (table). `hooks/useIsSelected.ts` — per-id Zustand selector, prevents mass re-render on toggle. CSS-driven mode-flip via `[data-selection-mode="true"]` on container — zero React reconciliations on first tick. Blue cell overlay via CSS `:has(.tickbox[aria-checked="true"])`. Focus ring suppressed in selection mode.
- **`components/SelectionFab.tsx`** — coarse-pointer only. Count + X button. StatusBar count/clear hidden on coarse pointer.

---

# UI Components — Search & Toolbar

## SearchBar (`components/SearchBar.tsx`)

Top-level header: logo (click → `resetToHome()`), `CqlSearchInput` with 300ms debounce, `AiSearchInput` (gated by Bedrock availability), clear button, `SearchFilters` (middle + right), `SettingsMenu`. Manages CQL input generation for stale-debounce detection. Reads `searchParams.aiQuery` and passes to `AiSearchInput`; AI text changes propagate to URL via `updateSearch({ aiQuery })` with 600ms debounce. Cancels pending debounce on unmount to prevent navigation bouncing.

## AI Search Input (`components/AiSearchInput.tsx`)

Expandable semantic search widget inside the search bar border. Gated by `bedrockAvailable` (reactive subscription via `subscribeBedrockAvailable()`). Architecture:

- **Toggle:** Sparkles icon. Click collapsed → expand + autofocus. Click expanded → stash text to module-level `_stashedAiText`, collapse, clear `aiQuery` from URL. Click collapsed with stash → restore.
- **Local state decoupled from URL:** `localText` is not the URL param — prevents debounce from clobbering mid-keystroke. `selfCausedRef` guards against external changes overwriting local edits.
- **Content-based ch sizing:** Width computed from text length (focused: up to 28ch, blurred: up to 16ch, collapsed: max-width 0). CSS `transition-all duration-200`.
- **Auto-collapse on blur when empty:** If user opens widget but doesn't type, clicking away collapses it.
- **Grid navigation opt-in:** `data-grid-nav-input` attribute on the `<input>` makes `isNativeInputTarget()` return false → Up/Down/PgUp/PgDown/Home/End pass through to grid nav. Left/Right stopped via `stopPropagation` to keep text editing.
- **Escape:** Stashes text, collapses, clears AI from URL.
- **Inner ✕ button:** Clears text without collapsing (stays expanded + re-focused). Uses `onMouseDown + preventDefault` to prevent blur-triggered collapse.

URL param: `?aiQuery=<text>`. Store branch: `!!params.aiQuery` → `dal.searchByAi()` → Bedrock embed → KNN query → ≤200 results in-memory. No PIT, no pagination, no new-images poll. Sort auto-switches to `-relevance` on activation (mirrors collection auto-sort pattern). Client-side re-sort via `resortAiBuffer()` when user changes sort while AI active.

## Settings Menu (`components/SettingsMenu.tsx`)

Three-dot menu in SearchBar. Click mode toggle (explicit ⇔ phantom focus). Coarse pointer auto-detection (`stores/ui-prefs-store.ts` — `focusMode` + `pointer: coarse` detection, localStorage-persisted) disables explicit mode on touch devices.

## Search Filters (`components/SearchFilters.tsx`)

Split into two layout slots: **FilterControls** (middle — "Free to use only" toggle + `DateFilter`) and **SortControls** (right — one primary field from `SORT_DROPDOWN_OPTIONS` plus direction toggle). Hidden on small screens (`< sm`). Table header clicks select the same single primary; Shift+click has no distinct sort behavior.

## Date Filter (`components/DateFilter.tsx`)

Dropdown for date range filtering. Mirrors kahuna's `gu-date-range`. Field selector (Upload time / Date taken / Last modified), preset buttons (Anytime, Today, Past 24h, Past week, Past 6 months, Past year), two date inputs (From / To) for custom ranges. Preset matching uses 2-hour tolerance for relative presets (survives stale tabs). Collapsed state shows "Anytime" or a summary label with accent dot. Timezone: picker is always local time; URL is always UTC. `toDateInputValue` uses `format(parseISO(iso), "yyyy-MM-dd")` (date-fns, local-time) — not `iso.slice(0, 10)` (which returns UTC date, wrong for timezones ahead of UTC).

## Status Bar (`components/StatusBar.tsx`)

Thin strip between toolbar and views. Left-panel toggle (with hover-prefetch for aggregations when the Filters section is localStorage-expanded), result count, new-images ticker (click clears selection before `reSearch()` to prevent flicker of old reconciled state), sort-around-focus indicator, density toggle, right-panel toggle. Selection count + Clear button (fine-pointer only — coarse uses FAB). Container queries for responsive label display.

Ticker badges: one per `gridConfig.tickerDefinitions` entry. Hidden when count = 0 or count = total. Background colour from definition. Click appends the `searchClause` to the current query. Native `title=` tooltip shows "last updated X ago" (from `tickersLastUpdated` store state) plus a `count  SupplierName` table for agency-pick subCounts. `buildTickerTooltip()` constructs the tooltip string.

## CQL Search Input (`components/CqlSearchInput.tsx`)

Wraps the `<cql-input>` Web Component from `@guardian/cql`. Bridges React ↔ Web Component lifecycle. `LazyTypeahead` provides non-blocking suggestions.

---

# UI Components — Views

## Table View (`components/ImageTable.tsx`)

TanStack Table + Virtual. Column defs come from static/configured registry fields.
`EnrichedTableRow` uses `useEnrichedImage`; badges and photographer styling share enriched data.
Resize uses CSS variables, with auto-fit and a visibility menu outside the contained scroll area.
Header clicks select one semantic primary sort; Shift does not add a secondary sort. Field cells
marked `data-cql-cell` keep modifier-aware click-to-search; image cells/row whitespace dispatch
selection. Double-click opens detail; middle-click opens fullscreen preview. ARIA grid roles,
the proxy horizontal scrollbar and selection-mode Left/Right scrolling remain.

## Grid View (`components/ImageGrid.tsx`)

Responsive columns (`floor(width/280)`), 303px row height, S3 thumbnails, focus ring + keyboard nav. `ResizeObserver` with `captureAnchor` mechanism for scroll anchoring on column count change. Sort-aware date label (Uploaded/Taken/Modified adapts to primary sort field). Cluster 1 overlays: cost badge, graphic blur (`isImagePotentiallyGraphic`), image border (`lib/image-borders.ts` `getImageBorderColour()` — staff/contract/commissioned photographer: `#005689`; agency-pick: `#7d006880`), print/digital/syndication/persisted usage icons (via `useEnrichedImage`). Label pills rendered in a fixed-height (`h-6`) strip between thumbnail and description (`flex-nowrap overflow-hidden`, click-to-search with `stopPropagation`). Middle-click opens FullscreenPreview.

## Image Detail (`components/ImageDetail.tsx`)

Overlay within search route (search page stays mounted with `opacity-0 pointer-events-none`). Counter, prev/next (`NavStrip` + `useImageTraversal`), cadence-aware prefetch pipeline (shared `image-prefetch.ts` session model). Desktop zoom/pan via `usePinchZoom` (click/wheel/drag/keyboard). Touch swipe via `useSwipeCarousel` (velocity-aware prev/next) + `useSwipeDismiss` (pull-down dismiss). Fullscreen survives between images. Position cache in sessionStorage (`image-offset-cache.ts`: offset + sort cursor + search fingerprint) for reload restoration at any depth via `restoreAroundCursor`. Full-size images via imgproxy (AVIF, DPR-aware sizing). Stacked layout on mobile (flex-col, image top, metadata below). Middle-click exits fullscreen. Bug note: auxclick effect deps include `image` — prevents null-ref on reload when placeholder renders before `containerRef` div.

Restoration tracks the last handled image ID. Finding that image in the buffer or
attempting its cached-cursor restore suppresses repeat restoration when it later
leaves the buffer. A distinct missing cached image can still restore during the same
mounted overlay lifetime; the cached cursor and offset are passed through unchanged.

For a non-resident ID, ImageDetail calls the app's `getById(id, signal)` and stores image,
enrichment and failure together with that requested ID. Identity changes or becoming resident
abort the read. Resident images take precedence and traversal uses the existing buffer/page
extension, not per-image singleton hydration. Only standalone ImageMetadata receives the owned
overlay; it is not written into the shared enrichment map.

## Fullscreen Preview (`components/FullscreenPreview.tsx`)

Lightweight fullscreen peek — press `f` or middle-click to view focused image edge-to-edge via Fullscreen API (`useFullscreen` hook). No route change, no metadata. Arrow keys traverse images via `useImageTraversal`, updating `focusedImageId`; exit (Esc/Backspace/f/middle-click) scrolls list to centered focused image. Shares prefetch pipeline and `usePinchZoom` (desktop zoom) with ImageDetail. Phantom pulse animation fires on exit when in phantom focus mode. Another density of the same ordered list.

## Image Metadata (`components/ImageMetadata.tsx`)

Single-image metadata display — used in ImageDetail sidebar and right side panel. Registry-driven field order. `showWhenEmpty: true` fields render `<Dash />` placeholder; `visibleWhen` gate applied. Section breaks on group change. Fields with `detailLayout: "stacked"` render label above value; others render inline (key 30% / value 70%). Click-to-search on values (shift = AND, alt = exclude). Location sub-parts as individual search links. List fields (keywords, subjects, people, labels) as `SearchPill` components. Rights section: cost badge, validity disclosure (red/amber/teal states), lease list with relative dates, restrictions banner. Phantom mode: single-selected image falls back to `metadataCache.get(singleSelectedId)` when buffer lookup misses.

## Multi-Image Metadata (`components/MultiImageMetadata.tsx`)

Shown in right panel when 2+ images selected. Dispatches per `multiSelectBehaviour` from field-registry. `metadata-primitives.tsx` shares `MetadataSection`, `MetadataRow`, `FieldValue`, `groupFieldsIntoSections`, `useMetadataSearch`, `Dash` between single and multi panels. `MultiValue.tsx` renders "Multiple {noun}" with tooltip showing top 5 values + counts. `MultiSearchPill` (in `SearchPill.tsx`) — partial (hollow) vs full (solid) chip state. Location sub-fields collapsed into one composite "Location" row. Cost summary section at top (bucket counts + leased-fraction gradient pills). Denominator for counts is `selectedIds.size`.

## Cost Badge (`components/CostBadge.tsx`)

5 cost variants (free/pay/conditional/overquota/no-rights), 3 sizes (sm/md/lg). CSS custom property colours from `index.css` cost colour tokens.

## Toast System (`stores/toast-store.ts`, `hooks/useToast.ts`, `components/ToastContainer.tsx`)

Queue-backed toast notifications. BBC PR #4253 vocabulary (`ToastCategory`, `ToastLifespan`). `addToast()` imperative export for non-React callers (selection-store hydration drop, range-cap warnings). Single `<ToastContainer />` mounted in `routes/__root.tsx`. `toast-store.ts` has `typeof window !== "undefined"` guard at top level (Vitest compatibility).

## Panels (`components/PanelLayout.tsx`)

Left (facet filters) / right (metadata). Resize handles, `[`/`]` keyboard shortcuts, `AccordionSection` with persisted state (via `panel-store`). Right panel: "Combined metadata…" placeholder for count=0; single-image metadata for count=1; `MultiImageMetadata` for count≥2. Phantom mode: single-selection falls back to `metadataCache` (not `focusedImageId`).

## Facet Filters (`components/FacetFilters.tsx`)

Left panel content. Batched aggregation fetch via store. Click → set CQL chip, alt-click → exclude. "Show more" expands per-field agg counts. Agg timing display (`AggTiming` component). `Is` section: all valid `is:` values from `buildIsOptions()` (config-gated); counts from `tickerCounts` store (ticker-backed values), category agg buckets (photo/illustration), or `isFilterCounts` store (deleted/under-quota). Zero-count entries hidden unless active or excluded. Coloured dot right of label for ticker-backed values (matching badge colour). Dynamic facet sections: one per distinct `has:` target found in the current query (`findHasFieldTargets` in `cql-query-edit.ts`, resolved through field aliases to an ES path, deduped by that path), reusing the same `FacetSection` component/click/expand wiring as static facets; buckets come from `search-store.ts`'s `dynamicFacetBuckets` (isolated per-field fetch, parallel with the static batch).

## Collection Tree (`components/CollectionTree.tsx`)

Left panel, above Facet Filters. Reads tree + subtree counts from `collection-store`. Click a node → injects `collection:pathId` into CQL query (exclusive — replaces any existing collection filter). Active node click is a no-op. Depth-0 expanded nodes are `position: sticky`. Expand state is local `useState<Set>`, collapsed by default, not persisted. Row click target is the full-height div (not the text span). Colour stripe from `node.data.cssColour`. Auto-sort handled atomically by `useUpdateSearchParams()` (not by this component). See `06-collections.md` for full architecture.

## Collection Store (`stores/collection-store.ts`)

Zustand + sessionStorage persistence. `main.tsx` passes the search store's datasource to
`loadCollections(dataSource)`: the tree and a 6,000-bucket `collections.pathId` aggregation start
in parallel. Counts use media-api in API mode and retain the default free/deleted/replaced scope,
not the current search or an unfiltered whole-library count. `buildSubtreeCounts` uses path-ID
splitting; `buildColourMap` supplies badge colours. Tree absence hides the section; count failure
leaves the tree visible without counts. Accepted ancestor/sibling overcount is unchanged.

---

# UI Components — Scrubber & Sort

## Scrubber (`components/Scrubber.tsx`)

Vertical track, proportional thumb. Three modes, auto-selected by result count (see `03-scroll-architecture.md` §2):

| Mode | Total | Behaviour |
|---|---|---|
| **Scroll** | ≤1k | Real scrollbar — thumb tracks container scroll directly. All data in buffer. |
| **Indexed scroll** | 1k–65k | Real scrollbar — position map enables instant cursor lookup. Buffer slides via extends + scroll-triggered seeks. Skeleton cells fill outside the buffer. |
| **Seek** | >65k | Seek control — dragging shows tooltip, releasing triggers `seek()`. Deep seek via percentile estimation (date/numeric) or composite aggregation (keyword). |

Deep seek details: direction-aware `search_after` cursor anchors (`buildSeekCursorAnchors` in `search-store.ts` — desc fields get `MAX_SAFE_INTEGER`, asc get `0`, id gets `""`). Binary search refinement on the `id` tiebreaker when keyword bucket drift exceeds PAGE_SIZE. End key fast path: reverse `search_after` when target is within PAGE_SIZE of total, guaranteeing the buffer covers the last items. Null-zone seek uses the null-zone uploadTime distribution (fetched with `must_not:exists` filter for accuracy) for direct position→date mapping — no percentile needed, ~0.6% position accuracy. Sort-aware tooltip with adaptive date granularity. Keyword distribution binary search (O(log n), zero network during drag). Track tick marks with label decimation + hover animation; ticks are positioned by doc count (not time), so their spacing functions as a density map — dense clusters spread wide, sparse gaps compress. This is an explicit design choice: never linearise ticks by time. Null-zone UX: red boundary tick with vertical "No {field}" label (edge-clamped to track bounds), red-tinted uploadTime-based ticks in the null zone, italic "Uploaded: {date}" tooltip labels for null-zone positions. Seek cooldown (`SEEK_COOLDOWN_MS` at data arrival; deferred scroll timer `SEEK_DEFERRED_SCROLL_MS` fires after cooldown to trigger extends without causing swimming — see `tuning.ts`).

Scrubber also handles the all-null-zone edge case: `getDateDistribution` returns `{ buckets: [], coveredCount: 0 }` (not `null`) when `stats.count === 0`; `computeTrackTicksWithNullZone` emits boundary tick at `position: 0`; top-edge overflow clamp renders it correctly.

## Sort Context (`lib/sort-context.ts`)

Sort-aware label computation for the scrubber tooltip and track ticks. `SORT_LABEL_MAP` maps sort keys to image field accessors and display formatters (date, keyword, numeric). Adaptive date granularity: total span < 28 days → show time (d Mon H:mm); ≥ 28 days → d Mon yyyy; viewport > 28 days → Mon yyyy. Fixed-width `<span>` elements prevent tooltip jitter during drag. `interpolateNullZoneSortLabel` handles null-zone tooltip labels (italic "Uploaded: {date}"). `computeTrackTicksWithNullZone` builds tick arrays with null-zone boundary and red-tinted null ticks. O(log n) binary search on distributions — zero network during drag.

---

# Null-Zone System

## Null-Zone Seek for Sparse Sort Fields

When sorting by fields with many missing values (e.g. `lastModified`, `dateTaken`), scrubber seek correctly positions within the "null zone" (docs without the field). Uses filtered `search_after` (narrowed to missing-field docs, sorted by uploadTime fallback) + null-aware `countBefore`. Sort clause builder injects universal `uploadTime` fallback for meaningful null-zone ordering. Null-zone cursor detection is shared across seek, extendForward, extendBackward, scroll-mode fill, and buffer-around-image via `detectNullZoneCursor` + `remapNullZoneSortValues` helpers. **Critical invariant:** when a null-zone filter is active, `result.total` from ES is the filtered count (only null-zone docs), not the full corpus — all four write sites (`seek`, `extendForward`, `extendBackward`, `_fillBufferForScrollMode`) preserve `state.total` instead of overwriting with `result.total`.

## Null-Zone Scrubber UX

**Open paging limits:** [KUP-033](../bug-backlog.md#kup-033) prevents backward extension from
crossing out of the null tail in both modes; [KUP-034](../bug-backlog.md#kup-034) concerns an
uncapped near-top backward page in buffer-around-image. Null-zone seek support above does not
mean those boundary cases are fixed.

Visual feedback when the user enters the null zone: red boundary tick with vertical "No {field}" label (edge-clamped to track bounds), red-tinted uploadTime-based ticks, italic "Uploaded: {date}" tooltip. The boundary label uses a ref callback (`offsetHeight` measurement + pad) for overflow clamping. UX code split across `sort-context.ts` (`interpolateNullZoneSortLabel`, `computeTrackTicksWithNullZone`), `Scrubber.tsx` (rendering), `search.tsx` (wiring), `search-store.ts` (`fetchNullZoneDistribution`).

---

# Testing & Instrumentation

Test counts and surfaces: see `kupua/AGENTS.md` Testing Summary (single source of truth for numbers).

**Notable test strategies:** null-zone seek/extend with sparse `MockDataSource` (50k images, 20% coverage), reverse-compute edge cases (cold-start, sub-row, End key, buffer-shrink), selection reconciliation (chip-array, summary, mixed frequency, inflation bugs), cost/validity/graphic-blur. E2E: scrubber flash-prevention golden table with **0px scroll-drift tolerance**, **0 items CLS** settle-window, **rAF scrollTop monotonicity**, selections (desktop + mobile Pixel 5 emulation), browser history.

Full reference: `e2e/README.md` and `e2e-perf/README.md`; use the current package scripts and
repository runner rules. Habitual E2E is direct-ES, not API-mode proof. API contract/composed-store
tests and Scala replay of actual mapper bodies complement operator API browsing/preflights.
M1 is accepted; use current committed perf histories with revision/topology qualifications.

## Perceived-Performance Instrumentation (`lib/perceived-trace.ts`)

Lightweight action-boundary tracer. **Zero production cost** — tree-shaken via `import.meta.env.DEV` guard. Off by default in dev; enabled via `localStorage.setItem("kupua_perceived_perf", "1")`. Playwright harness sets the flag before navigation.

Production call sites use `beginTraceInteraction` and `traceInteraction` to correlate the start
and owned phases. Current boundaries include `t_store_ready`, `t_first_visible_frame` and
`t_visual_settled`; historical `t_settled` metrics are not interchangeable with them. Read
`window.__perceivedTrace__` in the browser. The perf handbook owns phase meanings and measurement
rules; synchronous acknowledgement is not proof of visible paint (KUP-031).

**Logging:** use `devLog()` from `src/lib/dev-log.ts` (DCE'd in prod, readable in E2E via `KupuaHelpers.getConsoleLogs()`). Reserve bare `console.warn` for genuine error paths only.

