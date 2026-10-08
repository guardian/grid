# Kupua — Component Detail Reference

> Implementation map for humans and agents, read by subsystem rather than at every session start.
> [AGENTS.md](../../../AGENTS.md) provides orientation; this reference describes runtime owners,
> their contracts and important limits. Supporting utilities are grouped with their consumers,
> not catalogued function by function.
>
> **Last source review: 8 October 2026.** Refreshed against the source inventory, implementation
> paths and relevant existing test assertions. Code takes precedence over comments and design
> documents. This was a documentation review, not a new test run or live-system verification.
> The [API build plan](../03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md)
> owns migration sequencing and acceptance; this document is not an implementation workplan.

## Find the Owner

Unless qualified otherwise, component/module paths below are relative to `kupua/src/`.
Start with the implementation; use the linked guide for intent and broader contracts.

| Area | Implementation entry points | Companion guide |
|---|---|---|
| App and routes | [main.tsx](../../../src/main.tsx), [search route](../../../src/routes/search.tsx) | [Frontend philosophy](01-frontend-philosophy.md) |
| Data access | [DAL contract](../../../src/dal/types.ts), [API datasource](../../../src/dal/api-data-source.ts), [ES datasource](../../../src/dal/es-adapter.ts) | [Runtime configuration](../runtime-configuration-and-data-sources.md) |
| Search and scrolling | [Search store](../../../src/stores/search-store.ts), [data window](../../../src/hooks/useDataWindow.ts), [scroll effects](../../../src/hooks/useScrollEffects.ts) | [Scroll architecture](03-scroll-architecture.md) |
| Focus and history | [Search continuity](../../../src/lib/search-continuity.ts), [URL sync](../../../src/hooks/useUrlSearchSync.ts), [detail return](../../../src/hooks/useReturnFromDetail.ts) | [Focus/position](02-focus-and-position-preservation.md), [history](04-browser-history-architecture.md) |
| Selection | [Selection store](../../../src/stores/selection-store.ts), [range selection](../../../src/hooks/useRangeSelection.ts) | [Selections](05-selections.md) |
| Fields and CQL | [Field registry](../../../src/lib/field-registry.tsx), [CQL input](../../../src/components/CqlSearchInput.tsx), [typeahead](../../../src/lib/typeahead-fields.ts) | [Field catalogue](field-catalogue.md) |
| Shared presentation | [Column menu](../../../src/components/ColumnContextMenu.tsx), [field disclosure](../../../src/components/FieldDisclosure.tsx), [metadata primitives](../../../src/components/metadata-primitives.tsx) | [Selections](05-selections.md) |
| Media and traversal | [Detail](../../../src/components/ImageDetail.tsx), [preview](../../../src/components/FullscreenPreview.tsx), [image URLs](../../../src/lib/image-urls.ts), [prefetch](../../../src/lib/image-prefetch.ts) | [Keyboard navigation](keyboard-navigation.md) |
| Collections | [Collection store](../../../src/stores/collection-store.ts), [tree](../../../src/components/CollectionTree.tsx) | [Collections](06-collections.md) |
| Runtime boundaries | [Vite configuration](../../../vite.config.ts), [startup script](../../../scripts/start.sh) | [Infrastructure safeguards](../infra-safeguards.md) |

---

# Application Entry & Ownership

## Startup and Routes (`main.tsx`, `router.ts`, `routes/`)

`main.tsx` starts optional quota loading and collection tree/count loading, and probes AI
availability once: media-api capability in API mode, Bedrock health otherwise. It disables native
scroll restoration, ensures the current history entry has a Kupua key, and captures its snapshot
on `pagehide` when reload persistence is enabled. React mounts under StrictMode.

`router.ts` assembles the routes and uses `plain-search-serializer.ts` to preserve plain string
query values. `/` redirects to search; `/images/:imageId` redirects to the search detail overlay
for bookmark compatibility. `routes/search.tsx` composes the toolbar, panels, list, scrubber and
detail overlay, mounts URL synchronization and one shared range-selection handler, initializes
the legacy Grid API singleton and hydrates selection metadata. Panel-local consumers resolve
focused/selected images without making the whole route subscribe to selection metadata changes.

The root wraps the route outlet in `ErrorBoundary` and mounts one `ToastContainer` outside it.
`ErrorBoundary` handles render failures with retry or a Home reload; it is not network recovery.

## Preferences and Layout State (`stores/ui-prefs-store.ts`, `column-store.ts`, `panel-store.ts`)

`ui-prefs-store` initializes grid/table density from sessionStorage before views mount. Every
choice persists immediately and advances a density-intent counter, including same-value choices.
Focus mode and graphic-image blur are localStorage preferences; coarse pointers force effective
phantom mode without overwriting the saved choice. Callers use the effective-mode helpers.
Column and panel stores separately persist table layout and panel settings in localStorage.
Density is neither a URL search parameter nor a history-snapshot field.

`column-store` persists hidden columns and widths using TanStack column IDs, not raw dotted
field paths. Its pre-auto-fit widths are runtime-only so a repeated double-click can restore a
previous size. `ColumnContextMenu` delegates visibility/fit actions to ImageTable; it owns only
menu placement and dismissal. Field definitions and defaults still come from the registry.

## Shared Styles and Geometry (`index.css`, `constants/layout.ts`)

`index.css` owns Tailwind theme tokens, fonts, shared popup styling, focus/selection feedback and
rendering containment rules. CSS-driven selection state avoids propagating mode props to every
cell. Containment is functional, not decoration: changes can affect painting and popup clipping.
`constants/layout.ts` supplies shared row/header/cell geometry; views measure responsive dimensions
and pass current geometry to navigation rather than duplicating independent estimates.

# Data Layer

## DAL (`dal/`)

`ImageDataSource` (`dal/types.ts`) is selected by `createDataSource()` (`dal/index.ts`):
`ApiDataSource` when `VITE_USE_MEDIA_API=true`, otherwise `ElasticsearchDataSource`.

**API mode:** pages use `search-after`/`window`; ranks use `rank`; scalar/date/keyword profiles
use `sort-profile`; maps and range walks use `keys`. Walk loops and caps stay client-side.
Counts/tickers use `count`; facets, typeahead and collection counts use `aggregations`;
standalone detail uses `GET /images/:id`; selection hydration uses `mget` (200 IDs per request,
at most four in flight). `getById(id, signal?)` returns `{image, enrichment?} | undefined`;
`getByIds` deliberately returns `Image[]` without enrichment. `openPit` resolves `null`;
`offsetReadLimit` is 10,000, so an estimate-less deep seek lands at 9,800 with its actual position.
AI search uses `GET /images` with `useAISearch=true` and a separate `aiQuery`. There is
no ES fallback, and the factory constructs no ES datasource in API mode.
The shared URL resolver defaults every mode to local `/api`; only `--use-deployed-media-api`
selects the allowlisted absolute TEST base and credentialed cross-origin reads. That temporary
measurement mode bypasses Vite's Grid API write guard and is not the permanent ingress design.

**Direct/local mode:** `ElasticsearchDataSource` retains cursor paging/PIT recovery, aggregations,
rank/profiles, `getByIds` (1,000-ID parallel chunks), and `getIdRange` (cursor walk, cap 5,000).
Write protection on non-local ES is unchanged. `MockDataSource` supports sparse-field/null-zone
tests; `PositionMap` (`position-map.ts`) is the lightweight cursor index for indexed seeking.

ES-specific code in `dal/adapters/elasticsearch/`: CQL→ES translator, sort clause builders (universal `uploadTime` fallback). Null-zone helpers in `dal/null-zone.ts` (`detectNullZoneCursor`, `remapNullZoneSortValues`) — shared across seek, extend, fill, and getIdRange paths.

**Gotchas:**
- **`DATE_SORT_FIELDS`** (exported set) — ES sort values are epoch ms; `_source` values are ISO strings. Callers must convert ISO→epoch before comparing.
- **`ALLOWED_ES_PATHS`** lives in **both** `es-config.ts` and `vite.config.ts` (separate hardcoded arrays that must be kept manually in sync).

## Grid API Adapter (`dal/grid-api/`, `dal/grid-api-search-adapter.ts`)

**Search path (both media-api modes):** `grid-api-search-adapter.ts` builds the shared request body
(`buildReadBody`), posts reads (`postImageRead`) and maps Argo-wrapped pages (`apiSearchAfter`,
`apiImageWindow`) to `SearchAfterResult`, including per-hit enrichment (`extractEnrichment`).
`ApiDataSource` returns that data; the store publishes enrichment only at commit-to-view points,
not during probes. `countAll` reflects whether the caller requested `trackTotalHits`.

**Failure handling:** `SearchAfterApiError` distinguishes explicit HTTP 410 with
`search-after-pit-expired` from transport absence and refusals. A supplied PIT that expires is
retried once without it (not reachable while `openPit` returns `null`). No migrated read falls back
to ES: page, rank and range failures throw into the store's error paths; optional profiles and
maps return `null` without warning on media-api refusal, incompleteness or unreachability.
Cancellation is preserved. Counts/aggregations reject failures for their callers to handle as
absent or unchanged data. Bulk lookup rejects the whole logical read if any chunk fails, aborting
the rest, so a partial response cannot authorize removal of selected IDs. Explicit execution
incompleteness is rejected by rank, keys, profiles, count, aggregations, mget and
search-after/window with 503 ([KUP-036](../bug-backlog.md#kup-036)); individual decode omission
remains possible. Composed store tests cover recovery staying on API reads even when a follow-up
read fails; this does not introduce another runtime routing mechanism.

**Standalone detail:** `ImageDetail → ApiDataSource.getById → apiGetImage` uses the shared image
normalizer and extracts envelope actions/enrichment once. Missing/hidden (404) or wrong-ID entities
resolve `undefined`; other request failures reject. ImageDetail handles these quietly as unavailable,
owns cancellation and keeps standalone enrichment/actions in its requested-ID-bound state, not the
shared enrichment store. Resident traversal makes no singleton request; no `include=fileMetadata`.
Current normalization flattens nested metadata resources, dropping their resource links/actions.
Future editing must deliberately preserve the required nested capabilities and use that same
standalone owner. Server/permission-aware action absence is not authorization to construct writes.

**Discovery and reserved infrastructure:** `grid-api-instance.ts` retains private session-scoped
`ServiceDiscovery`, `initGridApi()` on search-route mount and `apiAiSearchAvailable()` for API-mode
startup. Both await the same in-flight root read; failure leaves links unavailable without retries.
Discovery does not load runtime client configuration. The unused `gridApi` allocation, legacy detail
reader/suite and identity merge helper were retired; no live path was rerouted. Shared Argo helpers,
API types and the distinct auth/session/server/write-guard vocabulary remain explicitly reserved
(see the [DAL README](../../../src/dal/grid-api/README.md)); old throw/toast comments are not policy.
Canonical delivery, signed-rendition renewal, downloads and editing remain separate authorized work.

**Write guard:** `gridApiWriteGuard()` blocks non-GET requests unless explicitly enabled, except
the eight read-only POST routes listed in `grid-api/read-via-post.ts`. Admission matches the exact
path (query string allowed), never an image-ID prefix; this prevents admitting nested write routes.

## Enrichment System (`lib/cost/`, `stores/enrichment-store.ts`, `lib/derive-enriched-image.ts`)

Three-layer merge model:

1. **ES baseline inputs** — `SOURCE_INCLUDES` in `es-config.ts` requests rights/leases/usages/labels/syndicationRights/XMP fields. Individual records may omit fields; no Grid service call is needed for these direct-mode inputs.
2. **TS cost+validity calculation** — `calculateCost` (port of Scala `CostCalculator`), `buildValidityMap` + `deriveValid` (mirrors Scala's two-pass override model), `isImagePotentiallyGraphic` (TS port, replaces Painless script field not in `_source`), quota-store (`fetchQuotas()` at startup, graceful absence). `guardian-config.json` is a vendored config snapshot.
3. **API overlay** — `enrichment-store` (Zustand, no persistence) receives committed ordinary and AI search enrichment. `deriveImage(image, overlay?)` merges server fields over the baseline; direct ES supplies no overlay. Ordinary pages, AI results and standalone detail map baseline images and enrichment from their response entities. Selection bulk lookup returns baseline images without publishing enrichment.

**Consuming enriched data:** `useEnrichedImage(image, ownOverlay?)` subscribes per-ID to the
enrichment store (O(1) `Map.get`); an owned standalone overlay takes precedence. Non-React
callers use `deriveImage` directly. ImageDetail passes its owned overlay to ImageMetadata only
while displaying that standalone image. Selection bulk lookup does not add server enrichment.
`deriveImage` uses field-wise lazy fallback: supplied cost/status skip local calculation;
validity is built only when `valid` or `invalidReasons` is missing. Nullish fallback preserves
meaningful `false`, empty-object and empty-array overlay values. Local fallback remains necessary
for direct mode, partial overlays and selection summaries; it is not a background enrichment read.

Fresh API pages and committed first-page fallbacks replace the overlay map. Fill, extensions,
focus/restore buffers and seeks merge their contributing overlays. An inserted target contributes
only its selected probe entry; both backward seek paths include backward-page overlays. Discarded
probes and cancelled pages do not publish, and direct-ES responses do not invent API enrichment.
Every owned AI completion replaces the map with its current enrichment, or an empty map when
none is supplied. Empty/unavailable AI results therefore cannot retain an earlier ordinary
overlay. Cancelled and superseded completions cannot publish. The ordinary-to-AI-to-ordinary
contract is covered in `stores/search-store-api-mode.test.ts`; selection hydration is separate.

## Search State (`stores/search-store.ts`)

Owns the shared result buffer, query, cursor paging, seek, sort-around-focus and restoration work.
It publishes data and placement intent; it does not scroll the DOM. `imagePositions` maps IDs to
global offsets. Page size is 200 and buffer capacity 1,000; tier thresholds in `constants/tuning.ts`
are configurable. Small searches fill the buffer, intermediate searches build a `PositionMap`,
and large searches use windowed seeking. `lib/two-tier.ts` centralizes indexed-tier eligibility.

Abort ownership and generations prevent obsolete reads from publishing or leaving busy flags
behind. Pending browse navigation survives view changes independently of window maintenance.
`createExpiryAwareSearchAfter` records PIT invalidation before later awaits can fail and prevents
final commits from resurrecting a cleared PIT. Direct mode opens PIT/page one in parallel; API
mode opens no PIT, so its position maps are live, not a stronger snapshot guarantee.

Restore uses the selected full cursor tuple for rank and neighbours, conditionally reranking if
the refreshed tuple changed, while preserving the session total. The store also owns new-image
polling, aggregation caching/circuit breaking and ordinary/null-zone sort distributions. Their
UI consumers must not create competing fetch or publication lifetimes.

## Position and Cursor Caches (`dal/position-map.ts`, `lib/image-offset-cache.ts`)

`PositionMap` indexes global positions to IDs and sort tuples for intermediate-size searches.
It is built in the background through the selected datasource; indexed coordinates do not depend
on the map already being ready.

`image-offset-cache.ts` serves two different lifetimes: sessionStorage offsets/cursors for detail
reload, and an in-memory recent response-tuple cache for navigation/ranges. The latter retains
at most `2 * BUFFER_CAPACITY` entries plus an independently retained selection-anchor tuple.
Lookups check image ID and search fingerprint; tuples are copied. Prefer returned tuples over
raw-field reconstruction so API-only aliases survive. Fresh searches replace recent tuples;
selection owns its extra anchor through re-election, clear and hydration.

## Counts and Aggregations (`stores/search-store.ts`)

New-image polling reads through `countWithTickers`, changes cadence with tab visibility and
rejects obsolete/out-of-order completions. It combines the fixed browse baseline with the latest
cumulative arrival counts, not successive deltas. `frozenParams` caps subsequent page reads at
the browse boundary without widening an earlier user `until` filter. AI does not start this poll.

`fetchAggregations` owns debounce, query-key caching, cancellation and the slow-request circuit
breaker. Forced refresh bypasses the cache/breaker; failures leave existing data rather than
publishing invented emptiness. Dynamic fields use `safe-aggregation.ts` to isolate failures from
the static batch. Expanded fields have a separate request owner, cancelled on replacement or
collapse. Sort distributions have their own sort-sensitive keys. Facets and typeahead consume
these contracts; loaded-AI-set scoping is defined in the AI search section.

## Field Registry (`lib/field-registry.tsx`)

Defines static fields and configured aliases for table columns, sorting, facets and metadata.
Definitions own accessors, search/sort paths, visibility/empty-state rules, detail grouping and
multi-selection behaviour. `RECONCILE_FIELDS` excludes suppressed fields; `SORT_DROPDOWN_OPTIONS`
and `DESC_BY_DEFAULT` drive sort controls. Add cross-view field behaviour here rather than in
individual renderers; use the field catalogue for the available definitions.

## URL Sync

`search-params-schema.ts` validates URL fields and canonicalizes one primary sort. Collection
context suppresses AI and defaults to date-added ordering; entering/leaving AI or collection
context restores remembered sorts where applicable. AI admits relevance and upload-time sorts.
`useUpdateSearchParams()` applies these transitions before navigation. Only `image` is a
display-only URL field; pagination is store-owned. `home-defaults.ts` owns the Home search
default (`nonFree: "true"`), distinct from datasource requests where absence means free-only.
On an initially empty search URL, `useUrlSearchSync` waits for the defaults replacement before
admitting any search, including StrictMode effect replay. Defaults are not reinjected after later
user edits. Canonical URL replacements likewise precede store publication and search admission.

URL owns search/detail params; density is independent UI state. `useUrlSearchSync`
consumes pre-passive user continuity or builds a strict destination-snapshot handoff.
Existing store ownership carries target, placement and focus through publication.
Router history notifications mark native entry identity before query dedup, with
raw/validated route coherence; distinct same-query destinations restore too.
Marked origin/detail transitions retain the laid-out list. Selection clearing keeps
its existing search/sort/detail boundaries. `resetSearchSync` forces search sync;
`useDocumentTitle` sets query/title and the new-images prefix.

## CQL

`@guardian/cql` supplies the editor; `LazyTypeahead` and `typeahead-fields.ts` supply non-blocking
suggestions. Resolvers read current aggregation/ticker/filter caches through live getters, then
issue scoped `getAggregations` calls through the captured datasource. Arbitrary dotted fields
use isolated reads so one uncountable field cannot fail the static batch. API usage counts use
root rollups (`usagesPlatform`, `usagesStatus`): counts represent images, not usage records.

Suggestion scope comes from the live AST, not the lagging committed query. AST source-span
removal excludes only the requested field, preserving quoted literals and unrelated incomplete
input without rewriting the editor. `getHasFieldPath` resolves configured aliases before static
shorthands and raw paths; `has:` means indexed-leaf existence, not boolean truthiness.

Direct ES translates CQL locally; API mode lets Grid interpret it. `cql-ast-serialize.ts`
preserves quoting that the library serializer can lose; check the installed version and
[deviations](../deviations.md) before retiring the workaround. Custom-element registration retains
its initial typeahead/datasource: live cache getters do not imply runtime datasource rebinding.

## Image URLs (`lib/image-urls.ts`)

URL builders for thumbnails and full-size images. Thumbnails use the local S3 proxy
(`/s3/thumb/<id>`). Full-size images use imgproxy, defaulting to AVIF. DPR is 1 at device
DPR ≤1.3, otherwise 1.5 for fine pointers and 2 for coarse pointers. EXIF orientation maps
to explicit rotation with auto-rotation disabled; supplied native dimensions cap the request.
`getFullImageUrl()` and `getThumbnailUrl()` return `undefined` when their respective proxy is
disabled (full-size also requires a bucket). `getZoomImageUrl()` requests 2.5 times the detected
DPR, capped at native dimensions. These are configured URL builders, not service-health checks.

API mode still uses these local proxies; canonical entity-link delivery and expired-URL renewal
are not implemented by metadata migration. Consumers own media load/failure state; these helpers
only select URLs. The API build plan owns the replacement delivery work.

## Grid Config (`lib/grid-config.ts`)

Vendored Grid configuration (image types, usage rights categories, aliases and CQL field lists),
derived from `exploration/mock/grid-config.conf`. CQL and sort builders depend on it. Runtime
server-authoritative configuration is not yet wired: local media-api aliases must match the client
configuration, checked by the documented API preflights. Root discovery is not a runtime
configuration endpoint.

There are distinct configuration layers: compiled UI/CQL vocabulary in `grid-config.ts`, cost
rules in `lib/cost/guardian-config.json`, Vite/start-script mode and proxy settings, and server
configuration outside the client. `quota-store.ts` holds a one-time optional startup snapshot,
not a subscribed or periodically refreshed store. Missing quotas leave local exceeded-supplier
checks empty; they do not prove that quota is available. API-derived fields win where supplied.
See the [runtime configuration guide](../runtime-configuration-and-data-sources.md) for ownership
and limitations; do not read proposed work in that guide as implemented behaviour.

## Development Services (`scripts/`, `vite.config.ts`, `docker-compose.yml`)

These paths are relative to `kupua/`. `scripts/start.sh` owns startup/configuration; Vite routes
local `/api` and `/es` reads, `/s3` to `scripts/s3-proxy.mjs`, and `/imgproxy` to the media container.
The S3 proxy performs credentialed reads server-side; credentials do not belong in browser code.
`scripts/bedrock-embed-proxy.mjs` supplies direct-mode embedding middleware and is not enabled
in API mode. The deployed-API base selection in `dal/grid-api/proxy-target.ts` bypasses the local
API proxy, not the media delivery chain.

`dal/es-config.ts` and Vite enforce non-local ES request restrictions; Vite separately guards
Grid API writes. Startup and `scripts/load-sample-data.sh` have infrastructure safeguards, not
permission to mutate a real cluster. Use the linked setup/safety guides and runner-owned test
infrastructure rather than treating these helpers as production ingress.

---

# Hooks & Coordination

## Data Window (`hooks/useDataWindow.ts`)

Bridge between the search store and views. `getImage(index)` and `reportVisibleRange` use
buffer-local indices in normal mode and global indices in two-tier mode. Normal mode covers
the small full-buffer and large seek tiers; two-tier mode virtualizes the total with skeletons
outside the loaded window. Eligibility depends on configured thresholds, not map readiness.

Forward-extend headroom grows with EMA-smoothed scroll velocity, capped at one page; backward
headroom stays fixed. View-owned indexed maintenance refills debounce for 200ms. User browse
destinations are store-owned so disposing a density view does not lose the pending destination.
`getViewportAnchorId()` elects the image nearest the usable viewport centre from rendered DOM
geometry only when needed for a transition, accounting for table headers. Ordinary scrolling
does not perform those anchor layout reads. `useVisibleRange` exposes the reported range.

## Scroll Effects (`hooks/useScrollEffects.ts`)

Owns DOM placement for reset, seek, sort/history continuity and density transitions, parameterized
by `ScrollGeometry`. It compensates prepend/eviction in buffer-local views; indexed views replace
entries at fixed global positions and need no such compensation. Seek placement preserves
sub-row position where applicable and accounts for buffer shrinkage and viewport clamping.

Cooldowns, deferred scroll notification and generation guards prevent transient layout events
from triggering stale or cascading extends. Density handoff distinguishes settled placement from
a pending browse departure and checks target identity, search/publication generations and focus
intent. New user input retires obsolete placement; destination placement waits for density readiness.
Cancelling old-view maintenance must not cancel the store-owned browse destination.

Shared geometry primitives live in `grid-scroll-anchor.ts`, `viewport-anchor-geometry.ts`,
`buffer-column-align.ts` and the scroll-container/geometry refs. Timing knobs belong in
`constants/tuning.ts`; transition policy belongs in the focus/position guide.

## List Navigation (`hooks/useListNavigation.ts`)

Owns row/page/edge keyboard navigation using the current view's column count and header geometry.
Without focus, keys scroll without inventing focus; with focus, they move the target and Enter
opens it. Selection mode keeps arrows scroll-only; table Left/Right scroll horizontally.
Native text/date inputs are excluded, while opted-in search inputs forward list-navigation keys.
Alt+arrows remain browser navigation.

Home/End can request non-resident edges through the store. A later resident opposite edge retires
obsolete edge work even without a successor request; edge ownership is separate from permission
to set focus. End placement uses the virtualizer, not raw scroll height, to account for headers.

## Image Traversal (`hooks/useImageTraversal.ts`)

Owns shared prev/next navigation for detail and preview in global coordinates. Resident neighbours
navigate immediately; buffer-edge traversal retains a pending target while requesting extension;
absolute boundaries are no-ops. Successful navigation feeds direction-aware prefetch. Consumers
gate traversal while zoomed so navigation does not compete with panning.

## Return from Detail (`hooks/useReturnFromDetail.ts`)

Owns list placement when detail closes. `detail-return.ts` supplies the session entry-image and
origin-list identity, retained through traversal/reload and shared with swipe preparation.
Closing on the entry image preserves native placement; closing after traversal centres the
last-viewed image using current geometry. Unrelated history destinations restore their own
snapshot instead. A fresh opening/Forward re-entry starts a new detail session.

Close records focus immediately, then waits for suitable store publication to place the target;
it does not poll or repeatedly fetch. Origin/generation checks, newer focus intent, reopening and
unmount retire obsolete work. Internal focus publication must not masquerade as newer user intent.
Home owns a separate suppression so a reset cannot be undone by detail return.

## Prefetch Pipeline (`lib/image-prefetch.ts`)

Owns a shared traversal session for detail, preview and carousel media prefetch. Smoothed cadence
narrows the requested radius during fast navigation and fills around the resting position after
a burst. It prioritizes likely-next images, requests thumbnails first on mobile and cancels work
outside the desired radius while preserving a request coalesced with the newly visible image.
Thresholds are tunable through `kupua.prefetch.*` localStorage keys.

Each full-image loader captures its issuing in-flight map. Load/error/decode completion removes
tracking only when that map still holds the same loader for the ID, including cancellation/reissue
within a session. Late successful decode can still warm the bounded cache; cache usefulness does
not grant ownership of a newer loader's tracking.

## Orchestration (`lib/orchestration/search.ts`)

Provides imperative bridges for debounce cancellation, CQL editor generations, Home preparation,
URL-sync reset, scrolling to focus and fullscreen-preview entry. Components register view-owned
operations here instead of importing one another. The bridges coordinate work; they do not own
the result buffer or replace the store's cancellation rules.

`lib/search-continuity.ts` captures user target, placement and focus before navigation, or builds
strict destination-history continuity. `OwnedSearchContinuity` carries the abort owner, search
generation and pending/ready/placed/retired phase through the store to scroll effects. User
continuity may retain visible neighbours as fallback; history fallback is top, never departing
neighbours. This module bridges live store/view state and is not a pure DAL utility.

## Reset-to-Home (`lib/reset-to-home.ts`)

Owns the full reset sequence shared by SearchBar and detail logo actions. It cancels debounced
editing, clears focus/selection/density placement, resets URL-managed search fields to Home
defaults, and waits for owned data settlement before navigation. Owned suppressions prevent
cursor restore, detail return and density cleanup from restoring the departing position.

Grid density resets only if its captured density intent remains current. Later choices, including
same-value or away/back choices, win without cancelling the query reset; abandoned Home cannot
overwrite them. Preference persistence itself belongs to `ui-prefs-store`.

## Keyboard Shortcuts (`lib/keyboard-shortcuts.ts`)

Owns a shared capture-phase shortcut registry, registered directly or through `useKeyboardShortcut`.
Single-character shortcuts use bare keys outside editable fields and Alt combinations inside them;
`shortcutTooltip` supplies matching hints. `isNativeInputTarget` protects native editing, with
`data-grid-nav-input` as the explicit opt-in for search inputs that forward list-navigation keys.
The keyboard guide owns the full binding catalogue.

## Bedrock Proxy Client (`lib/bedrock-proxy-client.ts`)

Direct-mode client for Vite's embedding and health middleware. `searchByAi` uses `getEmbedding`;
startup uses `checkBedrockHealth` to gate the editor. Health failure resolves false; embedding
failure rejects into the store's search handling. API-mode AI uses neither path.

## AI Search (`dal/`, `stores/search-store.ts`, `lib/ai-search-params.ts`)

The store calls the selected datasource's `searchByAi()`: media-api `GET /images` in API mode,
Bedrock embedding plus ES KNN in direct mode. CQL/filters constrain the pool; `aiQuery` supplies
ranking text. The API mapper admits a finite `vecWeight` in [0,1] and preserves server ordering
as `__aiScore` ordinals. Direct mode retains scores.

Both modes publish at most 200 images, with browse `total` equal to the loaded set and a separate
`aiPoolTotal` and pool tickers. AI uses no PIT, pagination, position map or new-images poll.
Unavailable API AI commits an empty result without direct-mode fallback. `resortAiBuffer()`
reorders locally, including restoring relevance order; pending completion honours the latest
same-query sort. Enrichment follows the publication rules in the enrichment section.

`decorateParamsForAggregations` scopes facets/counts to the loaded IDs, not the larger pool.
Known-empty membership returns `null`, requiring local empty publication without a request.
Exploratory typeahead retains its separately owned scope. URL context and continuity use the
same navigation owners as ordinary search.

## Browser History (`lib/orchestration/history-key.ts`, `lib/history-snapshot.ts`, `lib/build-history-snapshot.ts`)

`kupuaKey` is minted on push and retained on replace. Session snapshots store one
represented anchor, offset, ratio, freeze boundary and pending-arrival count, not independent
bookmark and viewport or density. The snapshot store keeps at most 50 entries and currently
uses sessionStorage for reload continuity. `restoreArrivalState` validates the freeze boundary
and count against search identity; ordinary history restoration carries them back into the store.
`buildHistorySnapshot` captures current state; strict destination
continuity restores through existing search resolution or request-free resident AI
ordering. Missing history targets use top/no focus, never departing neighbours.
Phantom capture cannot independently restore a hidden bookmark. See the
[history guide](04-browser-history-architecture.md) for entry and restoration policy.

## Touch Gesture Hooks

- **`hooks/useSwipeCarousel.ts`** owns touch traversal animation and velocity-aware commit. `commitStripReset` coordinates the media-node handoff with detail rendering.
- **`hooks/useSwipeDismiss.ts`** owns pull-down dismissal outside fullscreen, sharing the detail-return target policy.
- **`hooks/useLongPress.ts`** detects touch holds and suppresses context menus/synthetic clicks, including committed Android cancellation. `handleLongPressStart.ts` translates the gesture into selection/range intent; tickboxes remain immediate.
- **`hooks/usePinchZoom.ts`** owns fullscreen touch/mouse/keyboard zoom and pan. Scale gates traversal/swiping, resets on image change, and touch-to-mouse guards prevent duplicate actions. Detailed gesture bindings belong in the keyboard guide and hook.

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

Pure function `interpretClick(ctx) → ClickEffect[]`. Outside selection mode, an image-body
click emits `set-focus` and `open-detail`; a tick emits `set-anchor` and `toggle`. Inside selection
mode, ordinary image/tick clicks anchor and toggle; Shift with an anchor emits `add-range`.
Without an anchor, Shift anchors and toggles. The interpreter reserves Meta/Ctrl as a no-op,
not a selection toggle. Range polarity comes from `selectedIds.has(anchorId)` in the range hook.

`dispatchClickEffects.ts` executes mutations and opens detail only in phantom mode; explicit
mode leaves opening to double-click. View handlers also own browsing gestures: grid ignores
Alt and Shift outside selection, table uses Shift/Alt for supported metadata searches, and
clicking an already-focused image can clear explicit focus. The pure rule table is not the
entire grid/table event-handling contract.

## Reconciliation (`lib/reconcile.ts`)

`recomputeAll(images, fields)` computes the full view over cached selected images; incremental
add/remove paths update already-loaded membership. Chip arrays use frequency-based accounting;
mixed fields retain value counts for `MultiValue` tooltips. `requestFullReconcile` coalesces work
into one `requestIdleCallback` (2 s scheduling timeout, `setTimeout` fallback). It does **not**
chunk the full scan. Default-collapsed chip rendering is bounded by `MultiImageMetadata`, not by
changing reconciliation; intentional large expansion and full recomputation can still be costly.
Cached metadata may represent only part of the selection; a reconciled view does not imply that
every selected image has loaded. See [KUP-035](../bug-backlog.md#kup-035) for the rendering fix
and remaining performance qualifications.

## Range Selection (`hooks/useRangeSelection.ts`)

Orchestrates shift-click and touch ranges. In-buffer selection uses `imagePositions`; otherwise
`getIdRange` walks source-free API keys or direct-ES cursors, preserving `(from,to]` and the 5,000
cap with lookahead. Unknown endpoint order permits one swapped attempt after an empty walk,
including overshoot. Request ownership covers membership/anchor intent, query/order, supersession
and unmount; obsolete success, rejection and finalization cannot affect a newer range.
Metadata-only updates and same-search display changes do not cancel legitimate selection work.

Touch effects set `reanchorToTarget`: polarity and range are based on the previous anchor, while
the endpoint becomes the next anchor under the range hook's ownership. Desktop Shift-click
keeps its anchor. An anchor-only touch gesture can retire pending work without toggling selection.

Retained response tuples take precedence over reconstruction. `extractSortValues` converts dates
and falls back to configured string/number alias values when raw paths are absent; boolean
alias cursors remain a parked limitation. The active anchor tuple survives recent-cache eviction.
Existing truncation/soft-cap feedback stays; the route owns the hook and passes it to both views.

## Selection UI

- **`components/Tickbox.tsx`** — absolute-positioned overlay (grid) and inline variant in the table's 32px selection column. `hooks/useIsSelected.ts` subscribes per ID. CSS controls tickbox visibility through `[data-selection-mode="true"]` and selected-cell overlays through `:has(.tickbox[aria-checked="true"])`; this avoids per-cell mode props, not all React work on selection changes. Focus rings are suppressed in selection mode.
- **`components/SelectionFab.tsx`** — coarse-pointer only. Count + X button. StatusBar count/clear hidden on coarse pointer.

---

# UI Components — Search & Toolbar

## SearchBar (`components/SearchBar.tsx`)

Top-level header: logo (click → `resetToHome()`), `CqlSearchInput` with 300ms debounce,
`AiSearchInput` (gated by the selected mode's AI capability), Clear, split `SearchFilters` and
`SettingsMenu`. Manages CQL input generation for stale-debounce detection. AI text changes
propagate to the URL via `updateSearch({ aiQuery })` with 600ms debounce. Pending debounce is
cancelled on unmount. Clear and Home remain separate operations; Home resets the whole context.

## AI Search Input (`components/AiSearchInput.tsx`)

Owns the expandable semantic-query editor, gated by the startup AI-capability result.
Local text is separate from the debounced URL value so typing is not clobbered by publication;
external navigation can still replace it. Collapse/Escape stashes text and removes `aiQuery`,
reopening restores it, and the inner Clear leaves the editor open. Empty blur collapses it.
`data-grid-nav-input` lets vertical/page/edge keys reach list navigation while Left/Right remain
text-editing keys. Search execution and result contracts belong to the AI search section.

## Settings Menu (`components/SettingsMenu.tsx`)

Three-dot menu in SearchBar. Controls explicit/phantom focus and graphic-image blur (default on).
Coarse-pointer detection disables explicit mode; only user preferences, not pointer detection,
are persisted. Outside click or Escape closes the menu.

## Search Filters (`components/SearchFilters.tsx`)

Publishes free-only, date and primary-sort choices through URL search navigation. Sort choices
come from the registry and obey the active AI context; table headers select the same single
primary field, without a separate Shift multi-sort mode. The toolbar hides these controls on
small screens; it does not own query execution.

## Date Filter (`components/DateFilter.tsx`)

Owns presets and custom ranges for upload time, date taken and last modified, publishing the
corresponding URL fields through search navigation. Picker dates are local time; URL bounds are
UTC. Preserve local conversion in `toDateInputValue`: slicing an ISO string selects the UTC
date instead and can shift the displayed day. Relative preset recognition tolerates time drift.

## Status Bar (`components/StatusBar.tsx`)

Displays search/count state and provides panel, density, selection-clear and new-arrival actions.
Panel hover can prefetch aggregations when Filters is expanded. Accepting new arrivals clears
selection before `reSearch`; density changes go to the preference store, not the URL. Coarse
pointers use SelectionFab instead of the inline selection controls.

AI results display the loaded count with a separate pool total when available; pool metadata is
not paired with the pre-settlement cached count. Ticker badges use `gridConfig.tickerDefinitions`,
including local colours and search clauses. They hide zero counts and counts equal to
`aiPoolTotal ?? total`. Clicking appends the clause. `buildTickerTooltip()` includes freshness and
agency sub-counts. These pool counts must not be confused with loaded-AI-set facet counts.

## CQL Search Input (`components/CqlSearchInput.tsx`)

Wraps the `<cql-input>` Web Component from `@guardian/cql`. `LazyTypeahead` supplies non-blocking
suggestions. `cql-effective-query.ts` strips unfinished chip expressions from the query reported
to SearchBar without erasing the richer editor state. AST serialization preserves quoting;
self-caused updates do not echo a stripped value back into the editor. External query revisions
allow Clear/Home/history to replace it deliberately. `cql-chip-delete.ts` distinguishes chip
deletion events. Autofocus is skipped for touch devices and an already-open detail overlay.

---

# UI Components — Views

## Table View (`components/ImageTable.tsx`)

TanStack Table + Virtual. Column defs come from static/configured registry fields.
`EnrichedTableRow` uses `useEnrichedImage`; badges and photographer styling share enriched data.
Resize uses CSS variables, with auto-fit and a visibility menu outside the contained scroll area.
`useHeaderHeight` measures the actual sticky header through ResizeObserver for virtualizer
padding and placement; the layout constant is a first-render fallback, not a permanent measurement.
Header clicks select one semantic primary sort; Shift does not add a secondary sort. Field cells
marked `data-cql-cell` keep modifier-aware click-to-search; image cells/row whitespace dispatch
selection. Double-click opens detail; middle-click opens fullscreen preview. ARIA grid roles,
the proxy horizontal scrollbar and selection-mode Left/Right scrolling remain.

## Grid View (`components/ImageGrid.tsx`)

Owns the virtualized thumbnail layout and responsive column geometry from `constants/layout.ts`.
A ResizeObserver captures/restores the anchor when column count changes; buffer access and scroll
placement remain in the shared hooks. Cells use `useEnrichedImage` for cost/usage/status display,
`image-borders.ts` for provenance styling and `graphic-image-blur.ts` for the user-controlled blur.
Date labels follow the primary sort. Metadata pills stop propagation so searching a value does
not also select/open its image. Browsing, selection and middle-click preview use the shared owners.

## Image Detail (`components/ImageDetail.tsx`)

Owns the route-driven overlay while the list stays mounted. It composes metadata/usages,
`NavStrip`, traversal, prefetch, swipe/dismiss and fullscreen-only zoom. Stable containers preserve
fullscreen across traversal; return placement belongs to `useReturnFromDetail`, not this renderer.

Resident images win. A non-resident ID uses `getById(id, signal)` with image, overlay and failure
owned by that ID; identity change or becoming resident aborts the read. Standalone enrichment
goes only to owned metadata, never the shared map. Cached cursor restoration joins existing
store-owned work on remount and avoids repeatedly restoring the same handled image. Data completion
and permission to restore focus are separate: newer focus intent must win.

`StableImg.tsx` compares resolved URLs before assigning `src`, preserving loaded nodes across
swipe commits while allowing thumbnail upgrades. Media callbacks belong to the current image
and DOM element; one distinct thumbnail fallback is allowed. Terminal media failure leaves
metadata and navigation available. Zoom loads a higher-resolution rendition; `useCursorAutoHide`
coordinates fullscreen controls. None of this implements expired-URL renewal.

## Fullscreen Preview (`components/FullscreenPreview.tsx`)

Fullscreen peek opened with `f` or middle-click, without a detail route or metadata. The component
owns native Fullscreen API entry/exit directly; `useFullscreen` is the detail overlay's wrapper.
Arrow traversal uses `useImageTraversal` and updates focus. A same-URL history entry absorbs browser
Back. `fullscreen-exit.ts` prevents a rejected or still-active native exit from prematurely
finalizing the preview. Entry failure rolls back the extra history entry.

Exit preserves list placement when still on the entry image. After traversal, it waits for
fullscreen/layout settlement before centring the current focus, guarded against a newer preview.
Phantom mode adds a pulse. Prefetch, zoom and cursor hiding are shared with detail.

## Image Metadata (`components/ImageMetadata.tsx`)

Renders one image in detail or the right panel using registry ordering, visibility and empty-field
rules. `useEnrichedImage` accepts the detail owner's standalone overlay or the shared per-ID overlay.
Rights presentation includes cost, validity, leases and restrictions. `SearchPill` and shared
metadata search helpers turn values into queries, retaining Shift/Alt modifiers. Image resolution
and selection precedence belong to the calling detail/panel owner, not this renderer.

## Multi-Image Metadata (`components/MultiImageMetadata.tsx`)

Renders the supplied reconciled view according to registry `multiSelectBehaviour`, with cost
summaries from the supplied cached images and selected membership as the count denominator.
`metadata-primitives.tsx` shares field layout/search helpers with single-image metadata;
`MultiValue` summarizes disagreement and `MultiSearchPill` represents partial/full membership.

Chip fields create only the first 20 frequency-ordered pills until expanded through
`FieldDisclosure`. Expansion is local and retained for the component lifetime; it neither
fetches data nor changes reconciliation. Deliberately expanding a large field remains unbounded
and can stall. This rendering bound does not apply to single-image metadata.

## Field Disclosure (`components/FieldDisclosure.tsx`)

Shared reveal/collapse control for facets and multi-image metadata. Callers own the expanded
state, data and limits; the control owns accessible region linkage, loading focus recovery and
scroll/focus anchoring after collapse. `dom-utils.ts` locates the relevant scroll parent.
Recovery must not steal newer focus. Facets may fetch on expansion; metadata expands local data,
so this shared control must not acquire either caller's fetch or reconciliation responsibilities.

## Cost Badge (`components/CostBadge.tsx`)

Shared presentation of cost/no-rights states using the cost tokens in `index.css`. It consumes
the caller's derived state; cost and validity calculation remain in the enrichment layer.

## Toast System (`stores/toast-store.ts`, `components/ToastContainer.tsx`)

Owns transient notification queuing and display. Non-React callers use `addToast`, including
selection hydration and range-cap feedback; the root mounts one container. This is not the
default response to optional Grid-data absence, which should remain quiet.

## Panels (`components/PanelLayout.tsx`)

Left collections/filters and right metadata/usages are assembled by `routes/search.tsx`.
`PanelLayout` owns layout, resize handles and `[`/`]` shortcuts; `AccordionSection` uses persisted
open state. Resize updates DOM width during drag and commits the final width to `panel-store`.

The route's panel-local resolver gives one selected image precedence over explicit focus, using
the buffer then metadata cache. With no selection, explicit mode uses focus; phantom mode has no
implicit focused metadata. Multiple selection uses cached images for metadata and buffer-first
images for usage summaries. While current selection metadata is pending, the last completed
presentation remains visible with `aria-busy`; this is not a guarantee of complete cache coverage.

## Usages (`components/UsagesSection.tsx`)

`UsagesSection` groups supplied usages by status, orders each group newest first, and renders
platform icons, relative dates and supported reference links. Derivative/replaced platforms are
excluded by the same rule used by `countDisplayUsages`. `MultiUsagesSummary` aggregates the images
provided by the panel resolver. Detail and panels use data already loaded with images; this
component performs no independent usage-service fetch.

## Syndication (`lib/syndication/`, `components/SyndicationBadge.tsx`)

`deriveImage` prefers server syndication status; `calculateSyndicationStatus` supplies the local
display fallback: unsuitable, sent, queued, blocked or review. Local lease activity is evaluated
from start/end dates rather than the indexed `active` flag. Display classification is distinct
from search-filter eligibility. `syndication-reason.ts` provides tooltip reasons and
`SyndicationBadge` renders the shared status presentation. Intentional differences from Grid
belong in [deviations](../deviations.md), not in an implied claim of exact server parity.

## Facet Filters (`components/FacetFilters.tsx`)

Renders store-owned buckets and turns choices into CQL clauses, with Alt exclusion. Ordinary
fields, usage facets and configured `is:` values draw from their corresponding aggregation/ticker
state. Active/excluded values remain visible even with zero counts. Dynamic `has:` sections use
`findHasFieldTargets`, resolve aliases and deduplicate by indexed path before isolated reads.

Initial fields show 10 rows; expansion requests at most 100 buckets through the store and renders
the returned set. `FieldDisclosure` owns reveal/collapse presentation, not fetching or cancellation.
This differs from metadata's request-free expansion. Aggregation timing and circuit-breaker
controls expose the store's existing state rather than creating a separate fetch lifecycle.

## Collection Tree (`components/CollectionTree.tsx`)

Renders the collection hierarchy and subtree counts from `collection-store`. Selecting a node
replaces the existing collection clause; selecting the active node does nothing. Expansion is
component-local, not persisted. Search-context sorting is applied atomically by
`useUpdateSearchParams`, not the tree. See the collections guide for path and count semantics.

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

Owns the vertical navigation control, drag feedback and tick rendering. It scrolls the list in
scroll tiers or requests store-owned seeks in the large-result tier. Default tier boundaries:

| Mode | Total (default thresholds) | Behaviour |
|---|---|---|
| **Scroll** | ≤1k | Real scrollbar — thumb tracks container scroll directly. All data in buffer. |
| **Indexed scroll** | 1k–65k | Real scrollbar — position map enables instant cursor lookup. Buffer slides via extends + scroll-triggered seeks. Skeleton cells fill outside the buffer. |
| **Seek** | >65k | Seek control — dragging shows tooltip, releasing triggers `seek()`. Deep seek via percentile estimation (date/numeric) or composite aggregation (keyword). |

The store owns cursor estimation, rank refinement and reverse reads near the end; dragging does
not perform those reads. Tick positions represent document counts, not elapsed time. Preserve
that density representation rather than linearizing dates. Null-zone feedback identifies the
missing-field boundary and uses upload-time labels, including an all-null boundary at the top.

## Sort Context (`lib/sort-context.ts`)

Maps sort keys to accessors and formats date/keyword/numeric distributions for scrubber labels.
It owns adaptive date granularity, tick decimation and null-zone upload-time labels. Distribution
lookup is local, using binary search rather than network reads during drag. Rendering and edge
clamping belong to Scrubber; fetching distributions belongs to the store.

---

# Sparse Sorts and Paging Boundaries

`dal/null-zone.ts` shares cursor detection/remapping across seek, extension, fill and range paths.
Missing-primary-field documents use upload-time fallback ordering, filtered cursor reads and
null-aware rank calculation. Their upload-time distribution supplies an estimated seek anchor,
not a fixed accuracy guarantee. A filtered null-zone total is not the whole search total: store
publication must preserve the browse total. An all-null distribution has zero covered values;
it is distinct from unavailable distribution data.

`extendBackward` caps its request at the current buffer offset. When a
null cursor produces fewer predecessors than requested, it fetches the remainder from the end
of the valued zone and combines both pages and overlays before publication. A failed second
read does not publish a partial prepend. `_loadBufferAroundImage` caps predecessors at the known
exact rank and skips the reverse request at rank zero; estimated offsets retain the half-page
request. These shared-store guards apply to both datasources and have composed API-mode tests.

---

# Testing & Instrumentation

Test setup, commands and proof contracts live in the [E2E guide](../../../e2e/README.md)
and [package scripts](../../../package.json); performance methodology lives in the
[performance handbook](../../../e2e-perf/README.md). Test totals are not maintained here.

Use current package scripts and repository runner rules. Habitual E2E is direct-ES, not API-mode proof.
API contract/composed-store tests and Scala replay of actual mapper bodies complement operator
API browsing/preflights.
Use committed performance histories with their revision/topology qualifications; this reference
does not certify current timings or replace the execution rules.

Useful behavioural entry points (existing tests, not executions performed by this refresh):

| Contract | Tests to start with |
|---|---|
| API routing, AI overlays and paging | [Composed store](../../../src/stores/search-store-api-mode.test.ts), [adapter](../../../src/dal/grid-api-search-adapter.test.ts) |
| Derivation and owned overlays | [Derivation](../../../src/lib/derive-enriched-image.test.ts), [enrichment hook](../../../src/hooks/useEnrichedImage.test.ts) |
| Density, focus and history | [Scroll effects](../../../src/hooks/useScrollEffects.test.ts), [browse density](../../../e2e/local/browse-density.spec.ts), [browser history](../../../e2e/local/browser-history.spec.ts) |
| Home and startup | [Home](../../../src/lib/reset-to-home.test.ts), [startup](../../../src/main.test.tsx), [UI flows](../../../e2e/local/ui-features.spec.ts) |
| Selection and disclosure | [Range selection](../../../src/hooks/useRangeSelection.test.ts), [multi-image metadata](../../../src/components/MultiImageMetadata.test.tsx), [touch selection](../../../e2e/local/selections-mobile.spec.ts) |
| Media lifetime and traversal | [Detail](../../../src/components/ImageDetail.test.tsx), [prefetch](../../../src/lib/image-prefetch.test.ts), [traversal](../../../src/hooks/useImageTraversal.test.ts) |
| CQL and facets | [Typeahead](../../../src/lib/typeahead-fields.test.ts), [facets](../../../src/components/FacetFilters.test.tsx), [quoting](../../../e2e/local/cql-search-quoting.spec.ts) |

## Perceived-Performance Instrumentation (`lib/perceived-trace.ts`)

Action-boundary tracer, guarded by `import.meta.env.DEV` so production builds can eliminate
instrumentation. Off by default in dev; enabled via `localStorage.setItem("kupua_perceived_perf", "1")`.
The Playwright performance harness sets the flag before navigation.

Production call sites use `beginTraceInteraction` and `traceInteraction` to correlate the start
and owned phases. Current boundaries include `t_store_ready`, `t_first_visible_frame` and
`t_visual_settled`; historical `t_settled` metrics are not interchangeable with them. Read
`window.__perceivedTrace__` in the browser. The perf handbook owns phase meanings and measurement
rules: `t_ack` is synchronous producer acknowledgement, while first-visible and settled are the
browser-observed boundaries.

**Logging:** use `devLog()` from `src/lib/dev-log.ts` (DCE'd in prod, readable in E2E via `KupuaHelpers.getConsoleLogs()`). Reserve bare `console.warn` for genuine error paths only.

