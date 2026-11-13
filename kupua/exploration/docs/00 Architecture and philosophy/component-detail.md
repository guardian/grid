# Kupua — Component Detail Reference

> Implementation map for humans and agents, read by subsystem rather than at every session start.
> [AGENTS.md](../../../AGENTS.md) provides orientation; this reference describes runtime owners,
> their contracts and important limits. Supporting utilities are grouped with their consumers,
> not catalogued function by function.
>
> Implementation and current tests are authoritative when descriptions disagree.
> The [API build plan](../03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md)
> owns migration sequencing and acceptance; this document is not an implementation workplan.

## Find the Owner

Unless qualified otherwise, component/module paths below are relative to `kupua/src/`.
Start with the implementation; use the linked guide for intent and broader contracts.

| Area | Implementation entry points | Companion guide |
|---|---|---|
| App and routes | [main.tsx](../../../src/main.tsx), [search route](../../../src/routes/search.tsx) | [Frontend philosophy](01-frontend-philosophy.md) |
| Data access | [DAL contract](../../../src/dal/types.ts), [API datasource](../../../src/dal/api-data-source.ts), [ES datasource](../../../src/dal/es-adapter.ts) | [Hosted configuration and data sources](09-deployed-via-Kahuna.md) |
| Search and scrolling | [Search store](../../../src/stores/search-store.ts), [data window](../../../src/hooks/useDataWindow.ts), [scroll effects](../../../src/hooks/useScrollEffects.ts) | [Scroll architecture](03-scroll-architecture.md) |
| Focus and history | [Search continuity](../../../src/lib/search-continuity.ts), [URL sync](../../../src/hooks/useUrlSearchSync.ts), [detail return](../../../src/hooks/useReturnFromDetail.ts) | [Focus/position](02-focus-and-position-preservation.md), [history](04-browser-history-architecture.md) |
| Selection | [Selection store](../../../src/stores/selection-store.ts), [range selection](../../../src/hooks/useRangeSelection.ts) | [Selections](05-selections.md) |
| Fields and CQL | [Field registry](../../../src/lib/field-registry.tsx), [CQL input](../../../src/components/CqlSearchInput.tsx), [typeahead](../../../src/lib/typeahead-fields.ts) | [Field catalogue](field-catalogue.md) |
| Shared presentation | [Column menu](../../../src/components/ColumnContextMenu.tsx), [field disclosure](../../../src/components/FieldDisclosure.tsx), [metadata primitives](../../../src/components/metadata-primitives.tsx) | [Selections](05-selections.md) |
| Media and traversal | [Detail](../../../src/components/ImageDetail.tsx), [preview](../../../src/components/FullscreenPreview.tsx), [image URLs](../../../src/lib/image-urls.ts), [prefetch](../../../src/lib/image-prefetch.ts) | [Keyboard navigation](keyboard-navigation.md) |
| Collections | [Collection store](../../../src/stores/collection-store.ts), [tree](../../../src/components/CollectionTree.tsx) | [Collections](06-collections.md) |
| Shell and results zoom | [Shell](../../../src/hooks/useShell.ts), [panels](../../../src/components/PanelLayout.tsx), [zoom ladders](../../../src/lib/results-zoom.ts), [zoom store](../../../src/stores/zoom-store.ts) | [Compact shell design (archived)](../zz%20Archive/compact-shell-design.md) |
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

`ui-prefs-store` initializes the available density from sessionStorage before views mount. Every
choice persists immediately and advances a density-intent counter, including same-value choices.
Focus mode and graphic-image blur are localStorage preferences; the compact phone model forces
effective phantom mode without overwriting the saved desktop choice. Desktop touch keeps that
choice. Callers use the effective-mode helpers.
Column and panel stores separately persist table layout and panel settings in localStorage.
Density is neither a URL search parameter nor a history-snapshot field.

`defaultDensity()` is Justified in the compact model and Grid otherwise, unless the user has locked
a Home view. `lib/home-view.ts` persists that lock (density plus Justified/Grid zoom offsets) in
localStorage; fresh tabs and Home apply it, while per-tab sessionStorage choices still win
within a tab. `stores/zoom-store.ts` owns per-tab results-zoom offsets (see Results Zoom).

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

Shell variants: `compact:` and `wide:` key off `html[data-shell]`, which `hooks/useShell.ts`
maintains. Width-only concerns (filters collapsing below 760px, status-bar compaction, zoom
ladders) use width breakpoints instead, because a narrow desktop window keeps the desktop shell.

# Data Layer

## DAL (`dal/`)

`ImageDataSource` (`dal/types.ts`) is selected by `createDataSource()` (`dal/index.ts`):
`ApiDataSource` when `VITE_USE_MEDIA_API=true`, otherwise `ElasticsearchDataSource`.

**Mode invariant:** hosted builds must always select media-api. API mode must never
construct/invoke the direct-ES datasource or issue direct ES requests, including
after API failure, empty results or invalid hosted configuration. Direct-ES remains
temporary, explicitly selected laptop support intended for separately authorized
removal. Keep mode enforcement at selection/transport boundaries, not in each view.

**API mode:** pages use `search-after`/`window`; ranks use `rank`; scalar/date/keyword profiles
use `sort-profile`; maps and range walks use `keys`. Walk loops and caps stay client-side.
Counts/tickers use `count`; facets, typeahead and collection counts use `aggregations`;
standalone detail uses `GET /images/:id`; selection hydration uses `mget` (200 IDs per request,
at most four in flight). `getById(id, signal?)` returns `{image, enrichment?} | undefined`;
`getByIds` returns `Image[]`; each image carries its mget enrichment as an attachment (see Enrichment System). `openPit` resolves `null`;
`offsetReadLimit` is 10,000, so an estimate-less deep seek lands at 9,800 with its actual position.
AI search uses `GET /images` with `useAISearch=true` and a separate `aiQuery`. There is
no ES fallback, and the factory constructs no ES datasource in API mode.
The shared URL resolver uses Kahuna's validated media-api address in hosted mode;
local API mode defaults to `/api`, while `--use-deployed-media-api` selects the
allowlisted absolute TEST base and credentialed cross-origin reads. That temporary
measurement mode bypasses Vite's Grid API write guard and is not the permanent ingress design.

**Direct/local mode:** `ElasticsearchDataSource` retains cursor paging/PIT recovery, aggregations,
rank/profiles, `getByIds` (1,000-ID parallel chunks), and `getIdRange` (cursor walk, cap 5,000).
Non-local ES writes are blocked. `MockDataSource` supports sparse-field/null-zone
tests; `PositionMap` (`position-map.ts`) is the lightweight cursor index for indexed seeking.

ES-specific code in `dal/adapters/elasticsearch/`: CQL→ES translator, sort clause builders (universal `uploadTime` fallback). Null-zone helpers in `dal/null-zone.ts` (`detectNullZoneCursor`, `remapNullZoneSortValues`) — shared across seek, extend, fill, and getIdRange paths.

**Gotchas:**
- **`DATE_SORT_FIELDS`** (exported set) — ES sort values are epoch ms; `_source` values are ISO strings. Callers must convert ISO→epoch before comparing.
- **`ALLOWED_ES_PATHS`** lives in **both** `es-config.ts` and `vite.config.ts` (separate hardcoded arrays that must be kept manually in sync).

## Grid API Adapter (`dal/grid-api/`, `dal/grid-api-search-adapter.ts`)

**Failure policy:** the migration-era blanket graceful-absence rule is retired.
Required-data failures must remain distinguishable from successful empty results,
with the owning caller keeping the shell usable; genuinely optional enrichment may
be omitted. Do not introduce alternate sources, parallel caches or retry layers to
conceal failure. The contracts below describe current behavior, not a request to
rewrite every reader. Mutation outcomes have their own explicit contract under the
standing directive; the default-off command boundary is separate from this read DAL.

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
search-after/window with 503; individual decode omission
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
Discovery does not load runtime client configuration. Shared Argo helpers,
API types and the distinct auth/session/server/write-guard vocabulary remain explicitly reserved
(see the [DAL README](../../../src/dal/grid-api/README.md)).
Signed-rendition renewal, downloads and editing remain separate authorized work.

**User-session permissions:** `getGridSessionPermissions()` in
[grid-api-instance.ts](../../../src/lib/grid-api-instance.ts) follows the discovered auth `session`
link on demand in API mode. It retains only optional boolean `showPaid`, `canUpload` and
`canDelete` facts, not identity data. Concurrent and later calls share one page-lifetime result,
including quiet `null` after failure, invalid data or a non-user principal. Missing flags stay
unknown. Direct-ES mode issues no request; no current UI/startup consumer is connected.
This snapshot is separate from per-image capabilities: it neither grants edit access nor removes
an uploader's advertised edit access. It is not fresh authorization for a save. Its discovered
session URI must match the configured auth origin and exact path; local requests use the auth
proxy. `invalidateGridSession()` clears and latches the snapshot until full reload, including
pending responses. Expiry/reauthentication and account changes require reload, with no automatic
replay or cross-tab identity detection.

**Command boundary:** `lib/grid-commands.ts` admits only configured `add-labels`, using the
image's edits relation and the owning resource's concrete labels URI. It validates origin and
resource identity, uses fixed POST, and returns explicit outcomes without retries or UI callers.
Vite's local `/api` keeps the eight exact read-POST exceptions; `/grid-metadata` admits only
the selected label POST plus metadata reads, and `/grid-auth` only session GET. Hosted calls
bypass Vite and use the same frontend command gate with Kahuna-injected rollout and origins.
Both global and per-operation enablement are required; an in-page stop or observed expiry blocks
new submissions until reload. Server authorization remains separate and mandatory. See the
[API contract](../../../src/dal/grid-api/README.md#step-2-command-boundary) for outcomes and limits.

## Enrichment System (`lib/cost/`, `stores/enrichment-store.ts`, `lib/derive-enriched-image.ts`)

Three-layer merge model:

1. **ES baseline inputs** — `SOURCE_INCLUDES` in `es-config.ts` requests rights/leases/usages/labels/syndicationRights/XMP fields. Individual records may omit fields; no Grid service call is needed for these direct-mode inputs.
2. **TS cost+validity calculation** — `calculateCost` (port of Scala `CostCalculator`), `buildValidityMap` + `deriveValid` (mirrors Scala's two-pass override model), `isImagePotentiallyGraphic`, quota-store (`fetchQuotas()` at startup, optional quota absence). `guardian-config.json` is a vendored config snapshot.
3. **API overlay** — `enrichment-store` (Zustand, no persistence) receives committed ordinary and AI search enrichment. `deriveImage(image, overlay?)` merges server fields over the baseline; direct ES supplies no overlay. Ordinary pages, AI results and standalone detail map baseline images and enrichment from their response entities. Selection bulk lookup (`POST /images/mget`) attaches each entity's enrichment to the returned image object (`attachEnrichment`, a WeakMap), so it lives with that object in selection's metadata cache. Ordinary lookup does not populate the shared map; touched-ID acceptance can update already-retained authority without inserting arbitrary offscreen entries.

**Consuming enriched data:** `useEnrichedImage(image, ownOverlay?)` subscribes per-ID to the
enrichment store (O(1) `Map.get`). Untouched images prefer an owned standalone overlay,
then shared data, then attached enrichment. For touched IDs, `resolveImageOverlay` qualifies
those candidates by read ownership and metadata floor; old positive grants cannot outrank
current denial. The hook marks stale metadata explicitly. Non-React consumers, including
the selection Cost Summary, resolve the owned overlay before calling `deriveImage`.
ImageDetail supplies its own overlay only for its current standalone image.
`deriveImage` uses field-wise lazy fallback: supplied cost/status skip local calculation;
validity is built only when `valid` or `invalidReasons` is missing. Nullish fallback preserves
meaningful `false`, empty-object and empty-array overlay values. Local fallback remains necessary
for direct mode and partial overlays; it is not a background enrichment read.
These calculations use already-returned data; they do not construct or query an ES
datasource in API mode and do not establish a second source for missing API data.

**Image capabilities:** `extractEnrichment` retains `resource: { uri?, links }` alongside
existing `actions`; `deriveImage` exposes it without calculating permissions locally. The
descriptor holds only the optional image URI and `edits`/`crops` links. An API entity without
those links supplies an empty list; no API enrichment means no descriptor. Same-image
replacement removes old capabilities instead of combining old and new lists. Search, owned
standalone detail and attached selection use the ownership rules above, without extra reads.
Touched resource descriptors retain issuance evidence, checked again by label admission
at prepare/confirm. Neither a missed rerender nor a newer explicit editing context permits
editing stale displayed metadata. Current negative authority remains meaningful when the
metadata body is below its floor or has no retained replacement.
Media links keep their separate delivery path. Nested metadata controls remain deferred until
a write consumer needs them; the `crops` link identifies the crop list, not a creation endpoint.

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

Extension acceptance excludes resident and within-response duplicate IDs, keeping
each accepted body paired with its tuple and enrichment. Raw cursor progress is
separate from displayed additions; duplicate-only progress can notify current
viewport/traversal demand without republishing the buffer or compacting survivors.

Restore uses the selected full cursor tuple for rank and neighbours, conditionally reranking if
the refreshed tuple changed, while preserving the session total. The store also owns new-image
polling, aggregation caching/circuit breaking and ordinary/null-zone sort distributions. Their
UI consumers must not create competing fetch or publication lifetimes.

## Image Publication (`lib/image-publication.ts`)

`publishImages(entries)` publishes one accepted group with at most one same-slot resident
buffer copy, one grouped enrichment update and one selected-metadata action.
`publishImage(image, overlay)` delegates to it. Unrelated references, coordinates,
cursors, placement signals and list-owned AI relevance are preserved. Empty resource
links replace older grants; offscreen targets do not create arbitrary shared entries.
Freshness is staged before sequential store notifications; stale presentation cannot
admit editing while the applicable body/authority owners catch up.

Equal effective aspect ratios retain a weak, body-free result-geometry identity.
Justified packing and velocity continuity use that identity independently of content
references. Changed ratios and ordinary result replacements invalidate it. There is
no per-cell body cache, extra render subscription or page-scanning subscriber.
Injected single-label simulation uses this path; ordinary editor gestures remain
disconnected. [Touched-ID facts](../../../src/lib/image-read-freshness.ts) add read-issuance
fences and document-lifetime metadata floors to existing response owners, without storing
bodies. Search acceptance and hydration preserve newer selected metadata and protect
omission side effects; duplicate-only extensions can accept current touched authority
without republishing resident bodies. Untouched reads retain their existing behavior.

Standalone detail registers its current requested-ID effect. Matching lean observation
can perform one bounded full follow-up, and only that effect receives standalone delivery.
Departure does not block surviving owners; re-entry uses its own guarded full read.
Equal metadata can upgrade lean to full projection without defaulting original/file fields.
Below-floor data with no usable body remains unavailable, not a confirmed deletion.
The observer's bounds and independent command/read lifetimes are described in
[state management](state-management.md). Server ordering and coordinate reacquisition
are not repaired by metadata publication.

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
issue scoped `getAggregations` calls through the mounted owner's datasource. Equivalent pending
reads share consumer-owned work; each builder retains at most 32 successful scope/request
results, excluding failures and aborts. Prefix filtering preserves counts without another read.
Keys include the own-chip-excluded parameters and requested fields/sizes/filter requests;
suggestion buckets do not replace expanded facets. Arbitrary dotted fields
use isolated reads so one uncountable field cannot fail the static batch. API usage counts use
root rollups (`usagesPlatform`, `usagesStatus`): counts represent images, not usage records.

Suggestion scope comes from the live AST, not the lagging committed query. AST source-span
removal excludes only the requested field, preserving quoted literals and unrelated incomplete
input without rewriting the editor. `getHasFieldPath` resolves configured aliases before static
shorthands and raw paths; `has:` means indexed-leaf existence, not boolean truthiness.

Direct ES translates CQL locally; API mode lets Grid interpret it. `cql-ast-serialize.ts`
preserves quoting that the library serializer can lose; check the installed version and
[deviations](../deviations.md) before retiring the workaround. The custom element stays registered
once but forwards to the mounted typeahead owner. Retired owners and intermediate programmatic
value replacements cannot admit suggestions; cancelling a pass aborts only reads with no remaining
consumers. This does not introduce a user-facing runtime datasource-switching workflow.

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

`grid-config.ts` supplies local defaults for image types, aliases and query/display settings.
Hosted builds use Kahuna's allowlisted runtime settings, injected before application modules
run and validated by `hosted-config.ts`. Local modes retain their defaults; missing or invalid
hosted display settings fall back locally. Usage Rights category names and search aliases come
from the separately loaded metadata-editor catalogue when available. Root service discovery
does not supply runtime client configuration.

There are distinct configuration layers: compiled UI/CQL vocabulary in `grid-config.ts`, cost
rules in `lib/cost/guardian-config.json`, Vite/start-script mode and proxy settings, and server
configuration outside the client. `quota-store.ts` holds a one-time optional startup snapshot,
not a subscribed or periodically refreshed store. Missing quotas leave local exceeded-supplier
checks empty; they do not prove that quota is available. API-derived fields win where supplied.
See [Deployed via Kahuna](09-deployed-via-Kahuna.md) for current configuration ownership,
server data sources and the differences between hosted and laptop modes.

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

Forward-extend headroom grows with signed EMA-smoothed scroll velocity over a 400ms
horizon, from a 50-image base to a one-page cap of 200. Fixed Grid and Table explicitly
select the same predictor with negated velocity for buffer-local backward admission;
Justified, unspecified callers and indexed backward admission retain threshold 50.
The stable reporting callback reads current layout policy, and policy changes break
velocity continuity. Explicit unchanged-ratio metadata publication preserves the
result-geometry identity; ordinary result replacement resets continuity. Reporting
owner, search generation, offset, extent, layout and viewport height must also match.
Buffer-local admission rejects an explicitly stale trailing range for
forward demand and an explicitly stale first row for backward demand; each edge is independent
of navigation intent and of full-range velocity validity. Callers without that evidence retain
base admission; indexed views use global-range admission. View-owned indexed maintenance refills debounce for 200ms. User browse
destinations are store-owned so disposing a density view does not lose the pending destination.
`getViewportAnchorId()` elects the image nearest the usable viewport centre from rendered DOM
geometry only when needed for a transition, accounting for table headers. Ordinary scrolling
does not perform those anchor layout reads. `useVisibleRange` exposes the reported range.

## Scroll Effects (`hooks/useScrollEffects.ts`)

Owns DOM placement for reset, seek, sort/history continuity and density transitions, parameterized
by `ScrollGeometry`. Fixed-row prepend/eviction shares a net row-origin delta applied to the
pre-publication scroll position, including coalesced publications and shrinking extents.
Indexed fixed rows replace entries at global positions and need no such compensation;
Justified retains its separate geometry/identity compensation. Seek placement preserves
sub-row position where applicable and accounts for buffer shrinkage and viewport clamping.

Cooldowns, deferred scroll notification and generation guards prevent transient layout events
from triggering stale or cascading extends. Density handoff distinguishes settled placement from
a pending browse departure and checks target identity, search/publication generations and focus
intent. New user input retires obsolete placement; destination placement waits for density readiness.
Implicit viewport reports wait for mount placement, then resume from that placement. Indexed
outside-buffer maintenance also requires viewport-matching range edges, preventing a transient
origin or stale virtualizer range from becoming a refill destination. Genuine browsing input
remains immediate. Cancelling old-view maintenance must not cancel the store-owned browse destination.

`layout-anchor-policy.ts` exposes only `chooseDensityAnchor` (valid retained target,
then pending-browse viewport or eligible focus/viewport) and `chooseReflowAnchor`
(selection, eligible focus, viewport). Viewport election is lazy. Callers keep candidate
validation, source geometry, retained ratio/edge state and placement/cancellation ownership;
the module does not read stores or DOM, subscribe, or unify search/history policies.

Shared geometry primitives live in `grid-scroll-anchor.ts`, `viewport-anchor-geometry.ts`
and the scroll-container/geometry refs. `isFocusEligibleForLayoutAnchor` is shared by
fresh density capture and Grid/Justified resize, panel and thumbnail-zoom capture:
hidden focus must at least partially intersect the usable source viewport; explicit
focus and selection precedence are unchanged. It reads transition-time geometry,
not per-scroll DOM visibility, and does not clear the remembered identity. `scroll-geometry-ref.ts` supplies origin-aware fixed
row bounds, count and item/column mapping. Data-window buffering is independent of column count.
Timing knobs belong in
`constants/tuning.ts`; transition policy belongs in the focus/position guide.

## List Navigation (`hooks/useListNavigation.ts`)

Owns row/page/edge keyboard navigation using the current view's row mapping and header geometry.
Fixed-row paging includes partial leading and trailing rows rather than assuming local index zero
starts a complete row. Justified continues to provide its spatial-navigation implementation.
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

Duplicate-only cursor progress can resume pending traversal through the existing
maintenance cooldown. Repeated input for the same origin and direction retains
that owner; a changed target/direction or departure retires its subscription and wait.

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
overwrite them. Preference persistence itself belongs to `ui-prefs-store`. The reset target is
`defaultDensity()` and the zoom store's `resetToHome()`, so a locked Home view is honoured.

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

- **`hooks/useSwipeCarousel.ts`** owns finger traversal animation and velocity-aware commit in both UI models. `commitStripReset` coordinates the media-node handoff with detail rendering. Committed and snap-back animations share cancellation ownership; unsuccessful pending traversal releases the waiting strip without changing the displayed image.
- **`hooks/useSwipeDismiss.ts`** owns phone-only pull-down dismissal when unzoomed and the detail drawer is collapsed, sharing the detail-return target policy. Both swipe hooks invalidate the whole contact sequence on multitouch; lifting one finger cannot resume a cancelled swipe.
- **`hooks/useLongPress.ts`** detects touch holds and suppresses context menus/synthetic clicks, including committed Android cancellation. It listens on the touch target itself (virtualization may detach it) and attaches its non-passive move listener only after the hold commits; multi-touch cancels. `handleLongPressStart.ts` translates the gesture into selection/range intent; tickboxes remain immediate.
- **Drag-select** (`createDragSelect` in `handleLongPressStart.ts`, wired by `hooks/useTouchSelection.ts` for Grid, Justified and Table): after a long-press, dragging selects the range origin→finger, Google Photos style; dragging back un-selects what this drag added. Starting on a selected image erases instead. Edges auto-scroll. Touched images are tracked by global position so buffer eviction mid-drag is harmless; on release, any never-loaded part of the range is completed by the shared range walk (add or remove, by anchor polarity).
- **`hooks/usePullToRefresh.ts`** refreshes results (`lib/refresh-results.ts`) when pulled down at the top; disabled while a selection exists. Native browser pull-to-refresh is suppressed by `overscroll-behavior-y: none`.
- **`hooks/useContentPullToDrag.ts`** lets a sheet's scrollable content hand a downward pull at its top over to the sheet drag, freezing content scroll during the drag.
- **`hooks/usePinchZoom.ts`** owns compact-detail and fullscreen touch/mouse/keyboard zoom and pan. The displayed image key owns private scale, pan and momentum state; terminal media failure and cropping disable detail zoom. Movement and cancellation invalidate double-tap recognition, and a cancelled near-fit pinch returns to fit without momentum. Control touches and keyboard activation stay with their controls. Space toggles zoom and `+`/`=`/`-`/`0` step it (1.5x), anchored at the mouse pointer when it is over the image, else the centre. Detailed gesture bindings belong in the keyboard guide and hook.

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
lookup and attaches each image's server enrichment to that image object. `electFallbackAnchor` uses the last remaining Set entry.
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
every selected image has loaded. Expanding all values mounts the complete chip set;
its rendering cost grows with distinct values even when the collapsed view is bounded.

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
- **`components/SelectionFab.tsx`** — compact-shell disclosure for shared image actions and a Details/Close details toggle, not an ARIA menu. Its single-column translucent blue expansion joins the count strip; the centred collapsed separator and fixed Deselect hit area preserve tap targets. `PanelLayout` and image detail supply it through the card's floating slot. Viewport-aware placement and chevrons follow the card. Outside taps pass through, and Tab may leave: neither floaty nor selection card makes the page modal. Desktop retains inline selection controls.

---

# UI Components — Search & Toolbar

## SearchBar (`components/SearchBar.tsx`)

Top-level header: logo (click → `resetToHome()`), `CqlSearchInput` with 300ms debounce,
`AiSearchInput` (gated by the selected mode's AI capability), Clear, split `SearchFilters` and
`SettingsMenu`. Manages CQL input generation for stale-debounce detection. AI text changes
propagate to the URL via `updateSearch({ aiQuery })` with 600ms debounce. Pending debounce is
cancelled on unmount. Clear and Home remain separate operations; Home resets the whole context.

In the compact shell the CQL editor shows only the free-text part of the query
(`splitFieldTerms` in `cql-query-edit.ts`); field terms live as chips in the Refine sheet and are
merged back without duplicates. Clear keeps those chips. Compact always keeps the Refine button,
including landscape; desktop replaces its inline free-to-use, date and sort controls with a
filters dropdown below 760px. The badge shows the compact chip count, otherwise a dot for
non-default filters. Phone Reset clears field chips and filter defaults in one discrete search
commit while retaining free text and cancelling pending typing.
Home, Refine and Settings share immediate local pointer-pressed feedback, cleared on
release, cancellation, leaving the control or blur; it does not depend on delayed touch hover.

## AI Search Input (`components/AiSearchInput.tsx`)

Owns the expandable semantic-query editor, gated by the startup AI-capability result.
Local text is separate from the debounced URL value so typing is not clobbered by publication;
external navigation can still replace it. Collapse/Escape stashes text and removes `aiQuery`,
reopening restores it, and the inner Clear leaves the editor open. Empty blur collapses it.
`data-grid-nav-input` lets vertical/page/edge keys reach list navigation while Left/Right remain
text-editing keys. Search execution and result contracts belong to the AI search section.

## Settings Menu (`components/SettingsMenu.tsx`)

Three-dot menu in SearchBar. The top row holds results zoom (− / level / +; the level resets),
hidden in Table, and a full-screen toggle whose tooltip names the browser's own shortcut
(⌃⌘F / F11). Below it, "Lock this view" saves the current density and zoom as the Home view.
Then explicit/phantom focus and graphic-image blur (default on).
The compact model disables explicit mode; desktop touch retains the saved desktop preference.
Only user preferences, not input capability, are persisted. Outside click or Escape closes the menu.

## Search Filters (`components/SearchFilters.tsx`)

Publishes free-only, date and primary-sort choices through URL search navigation. Sort choices
come from the registry and obey the active AI context; table headers select the same single
primary field, without a separate Shift multi-sort mode. Desktop uses inline controls from
760px; compact uses `inSheet` controls inside Refine. Sort options support keyboard focus,
arrow/Home/End navigation, native activation and Escape with trigger-focus return. It does not
own query execution.

## Date Filter (`components/DateFilter.tsx`)

Owns presets and custom ranges for upload time, date taken and last modified, publishing the
corresponding URL fields through search navigation. Picker dates are local time; URL bounds are
UTC. Preserve local conversion in `toDateInputValue`: slicing an ISO string selects the UTC
date instead and can shift the displayed day. Relative preset recognition tolerates time drift.
The `inline` variant (inside `FiltersSheet`) applies changes immediately and has no footer.

## Status Bar (`components/StatusBar.tsx`)

Displays search/count state and provides panel, density, selection-clear and new-arrival actions.
Panel hover can prefetch aggregations when Filters is expanded. Accepting new arrivals clears
selection before `reSearch`; density changes go to the preference store, not the URL. Compact
uses SelectionFab; desktop keeps inline selection controls even with touch input.

The bar is 36px tall, retaining 38px on coarse pointers. Below 500px, a single density
button cycles Justified → Grid → Table. The right-panel toggle is hidden in the compact
shell, where the right panel appears only as the selection card.

`useStatusBarFit` owns one local space budget for desktop and compact search. It shortens
action/control labels before badge names and result wording; numbers and essential controls
remain, with summary scrolling only when the smallest mode cannot fit. One ResizeObserver
tracks the bar, summary and label sizes, coalescing changes into a one-shot frame. Hidden
existing labels stay measurable off-flow rather than using display:none; no duplicate controls,
polling or React render loop is introduced. Expansion reserves extra room to avoid oscillation.
The observer/frame is released on unmount, and zero-width hidden bars skip measurement.
Detail keeps its separate named-container rules. This presentation budget never changes
target ownership, authority, command preparation or drafts.

`ImageActions` shares Share URL, Full frame, Download, Delete and Library controls with
image detail and the floaty. `image-actions.ts` evaluates operation-specific readiness
and captures immutable Not sent previews; `image-action-store.ts` owns only their
dismissible latest-20 ledger, not execution. `ImageActivityFrame` preserves stable activity
DOM/disclosures and shares panel chrome
with existing Label receipts. Pending actions remain blocked while retaining only settled
visual opacity. Full-frame skip counts, Library state and unavailable Crop entry are
described in the [editing checkpoint](../gradually-growing-teeth.kupua-edits-steps.md#action-hookup-boundary).

When adding an action, first decide whether it follows selection or owns explicit targets.
`SelectionImageActions` observes membership, metadata readiness, resident results and enrichment,
and resolves current selection again on activation. `ImageActions` requires an explicit
`ImageActionContext`; detail supplies only its current image. It does not subscribe to
selection/results/enrichment itself, but still observes session and crop-setting changes.
Its optional `resolveContext` is an activation-time refresh supplied by the selection connector,
not an alternate permission policy. Explicit menus follow their supplied target IDs.
The compact equivalents are selection-connected `SelectionFab` and context-required
`ImageActionFab`; their private presentation is shared. Selection menus close on membership
changes even when counts match. New editors should preserve their own captured draft targets,
not automatically follow selection or adopt these action controls' permission rules.

AI results display the loaded count with a separate pool total when available; pool metadata is
not paired with the pre-settlement cached count. Ticker badges use `gridConfig.tickerDefinitions`,
including local colours and search clauses. They hide zero counts and counts equal to
`aiPoolTotal ?? total`. Clicking appends the clause. `buildTickerTooltip()` includes freshness and
agency sub-counts. These pool counts must not be confused with loaded-AI-set facet counts.

## CQL Search Input (`components/CqlSearchInput.tsx`)

Wraps the `<cql-input>` Web Component from `@guardian/cql`. `LazyTypeahead` supplies non-blocking
suggestions. `cql-effective-query.ts` strips unfinished chip expressions from the query reported
to SearchBar without erasing the richer editor state or field-like text inside quoted content.
AST serialization preserves quoting;
self-caused updates do not echo a stripped value back into the editor. External query revisions
allow Clear/Home/history to replace it deliberately. `cql-chip-delete.ts` distinguishes chip
deletion events. Autofocus is skipped in the compact model and an already-open detail overlay.
The host's compact attribute selects phone suggestion placement below the measured input;
the toolbar ResizeObserver also accounts for installed-app chrome and disconnects on teardown.
Registration forwards to the current mounted owner; teardown disables its suggestion passes
before destroying the editor. External value sync suppresses intermediate resolver admission,
while self-caused edits retain the live AST and latest-prefix counts.

Blur selection belongs to @guardian/cql (1.8.7+); there is no local dispatch wrapper,
selection snapshot or window/visibility restoration. Window focus cannot reclaim the
editor from another control. The mobile chip-deletion keyboard-refocus guard remains
separate. Registration uses the upstream constructor type, and descriptions may be
omitted; neither change removes the remaining quoting or typeahead integration.

---

# UI Components — Views

## Table View (`components/ImageTable.tsx`)

TanStack Table + Virtual. Column defs come from static/configured registry fields.
`EnrichedTableRow` uses `useEnrichedImage`; badges and photographer styling share enriched data.
`TableRowCells` consumes stable image, column definitions, enrichment and interaction inputs;
native TanStack Row identities are not passed to memoized rows or content. Column arrays
invalidate content even for same-count visibility swaps; new image/overlay references retain
metadata freshness. Shared registry rendering evaluates each accessor once for display/tooltips,
and dimensions/width/height reuse a default-locale number formatter. The bounded TanStack model,
placeholder/pending-row paths and native header behavior remain in ImageTable.
`TableThumbnail` retains native lazy loading and source/error behavior. A passive effect
captures the element for detached-incomplete source release, leaving connected or completed
images alone. The effect follows the URL because the image may mount after an initially
absent URL; connected source updates do not trigger cancellation.
Resize uses CSS variables, with auto-fit and a visibility menu outside the contained scroll area.
`useHeaderHeight` measures the actual sticky header through ResizeObserver for virtualizer
padding and placement; the layout constant is a first-render fallback, not a permanent measurement.
Header clicks select one semantic primary sort; Shift does not add a secondary sort. Field cells
marked `data-cql-cell` keep modifier-aware click-to-search; image cells/row whitespace dispatch
selection. Double-click opens detail; middle-click opens fullscreen preview. ARIA grid roles,
the proxy horizontal scrollbar and selection-mode Left/Right scrolling remain.

## Grid View (`components/ImageGrid.tsx`)

Owns the virtualized thumbnail layout and responsive column geometry from `constants/layout.ts`.
A ResizeObserver captures/restores the anchor when column count changes. Fixed Grid captures
against its last committed geometry, then resolves the identity in the destination window;
combined resize/publication has one resize placement rather than a second maintenance shift.
Buffer access and scroll placement remain in the shared hooks. Cells use `useEnrichedImage` for cost/usage/status display,
`image-borders.ts` for provenance styling and `graphic-image-blur.ts` for the user-controlled blur.
Graphic thumbnails retain mouse-hover reveal and offer a dedicated hold-to-reveal eye control.
Reveal is thumbnail-local; release, cancellation, scroll or blur conceals it. The eye owns its
gesture without selecting or opening the image. Desktop touch keeps visible tickboxes as well
as long-press selection; compact selection controls remain governed by the phone model.
Warning and hold instructions are size-gated; tiny tiles keep only the eye. Native hold
suppression is scoped to that control, but suppression of OS haptics is not guaranteed.
Date labels follow the primary sort. Metadata pills stop propagation so searching a value does
not also select/open its image. Browsing, selection and middle-click preview use the shared owners.
Detail entry reads query/sort params from the existing latest-params ref at invocation;
image-only URL transitions do not replace its callback or the dependent click/tick handlers.
Cursor capture, focus and history push still run through their existing owners.
Date presentation is computed inside the memoized cell, not the parent's virtual-row loop.
Caption and tooltip share formatted upload/taken/modified values and two Intl formatters;
image-only Justified cells perform no date presentation work. No per-image date cache is retained.

Fixed row membership follows global result positions, with a bounded vertical origin in local
windows. A partial first row uses leading layout space, not fake records or selectable cells.
Full fetched pages and exact-capacity eviction therefore do not regroup retained images.
Rendering and navigation use the same row/column helpers. Within each retained virtual row,
fixed Grid keys cells by their actual column, including partial leading rows, not buffer-local
index. Reused thumbnails therefore cannot move sideways merely because a seek changes the
buffer-offset remainder; native pending replacement pixels stay in the original slots.
Justified keeps its existing cell keys. Successful thumbnail loads remove only the inline
hiding left by a prior error, allowing same-node source replacement to recover.
The [fixed-row policy](03-scroll-architecture.md#fixed-row-window-policy) owns the all-visible
maintenance contract, physical limits and accepted trade-off. It does not change Justified packing.

Thumbnail admission follows the virtualizer's current visible row range, read after obtaining
virtual items. A row-local React context carries eager loading for visible rows, including
partial rows, plus the next two available mounted rows below in both Grid and Justified.
Rows above the range and remaining overscan stay lazy, as does the no-range fallback. This
lower spatial band does not change with scroll direction and mounts no additional rows at
the result end. Only the small thumbnail component consumes the context;
the memoized metadata cell does not rerender for loading-only transitions. Ordinary image,
enrichment and animation updates still reach the cell. Provider keys retain virtual-row identity
without adding DOM wrappers. Loading hints require no observer, scroll state, queue or geometry scan.
URL, quality and dimension selection have separate owners; overscan is five rows. Native lazy loading may still prefetch;
changing the attribute does not cancel already-admitted work or discard completed media.
The [admission policy and trade-offs](../scroll-horizons-thumbs-and-blocking.md#current-decision)
remain separate from data-window refill prediction and Justified packing.

## Justified Density (`components/JustifiedGrid.tsx`, `lib/windowed-justified-layout.ts`)

Justified supplies ordered, uncropped geometry to ImageGrid's shared cells and interaction
owners, not a second gallery or scrolling lifecycle. Image-only cells omit informational
metadata/badges, not selection or safety indicators. Mounted geometry belongs to ImageGrid;
pending thumbnail fallback text is transparent while the alt description remains accessible.
JustifiedGrid keeps bounded ID/ratio snapshots only after commit, so abandoned renders cannot
replace committed context. Query/no-overlap replacement invalidates that context. No image
records, visited-history cache or catalogue-wide layout are retained by the snapshot.

Packing uses oriented dimensions with square fallback, 48-image technical blocks, 4px spacing
and target row height 190px at widths >=600px or 130px below that boundary, with 0.5 tolerance.
Blocks are not dates, network pages or semantic groups. Unknown full, non-final indexed blocks
share a square estimate created on first use per construction, never cached across geometry
changes or widths. Explicit same-slot metadata publication with an unchanged effective ratio
reuses the layout without packing or measuring; width, row scale, offset, extent and search
identity retain their own invalidations. Known and true-final blocks retain independent packing. Indexed boundaries are exact;
seek ordinals come from overlapping identities,
not estimated ranks. Temporary buffer edges do not authorise true-end truncation or imply
globally exact pixels at arbitrary entry points.

Non-final endings balance at most three trailing rows, preferring the widest feasible suffix
and trying shorter suffixes when necessary. Earlier rows and natural true-final endings stay
unchanged; infeasible suffixes retain engine output. The objective and trade-off belong in
[deviations](../deviations.md#balanced-technical-justified-block-endings-15-october-2026).
Small interior engine-cap underfills are separate from technical seams or missing thumbnails;
rounding tolerance never permits changed aspect ratios. Narrow portrait selection-target
usability needs separate proof. Cross-block dependencies require a concrete failing case,
not a speculative improvement to these technical boundaries.

Fixed Grid columns and Justified target row height are distinct sizing parameters. They share
capture/reflow ownership, not column arithmetic; results zoom (below) steps each independently. See
[position contracts](02-focus-and-position-preservation.md#4-transitions-and-relaxations),
[seek policy and costs](03-scroll-architecture.md#destination-seek-preparation), and
[Justified feature comparison](00-kupua-vs-kahuna-feature-inventory.md#42-whole-image-justified-rows).

## Measured Density Prototype (`components/MeasuredGrid.tsx`)

The dev switch substitutes a natural-height stand-in for the Justified slot without
adding a route or persisted density. ImageGrid retains its interaction and browsing
lifecycle; `useMeasuredLayout` owns mounted-cell observation and loaded-window-only
measurements. Sparse fake drafts live outside rows. `windowed-measured-layout` uses
individual loaded rows and estimated head/tail spans, with logical item coordinates
for navigation and visible reporting. The existing scroll-effect owner compensates
old/new identity geometry, including internal-field points and input captures.

Measurement callbacks are published after commit. Layout effects handle initial
measurement; observer corrections flush synchronously before paint. Observation,
not correction, is reattached next frame after observer delivery. Image anchor height
is distinct from full natural height, and density handoffs can retain an interior
form position. The [U2-proto decision](../gradually-growing-teeth.upload-workplan.md#prototype-decision-record-13-november-2026)
owns proof limits, dev controls and the operator-only performance comparison.

## Results Zoom (`lib/results-zoom.ts`, `stores/zoom-store.ts`)

Zoom is an integer offset from each density's default level; offset 0 is always the classic
geometry, so tests and performance runs at default zoom see unchanged layouts. Table has no zoom.
Ladders are width-aware and have six levels:

- **Justified** scales the target row height: phone ladder `[2.6, 1.8, 1.35, 1, 1/1.5, 1/2.2]`
  below 600px, desktop ladder `[1.8, 1.35, 1, 1/1.5, 1/2.2, 1/3.2]` otherwise.
- **Grid** uses the classic 280×190 cell with metadata at offset 0. Where fewer than three classic
  columns fit, levels are 72/90/120/180/230px square cells (230 shows a date line only) plus
  classic. Otherwise each step adds or removes one column (+3…−2); metadata shows only when cells
  are at least 200px wide. Thumbnails take an explicit width from the image ratio so they scale
  with the cell, keeping the margin to the cell edge constant.

`zoom-store` holds the offsets (sessionStorage per tab, falling back to the locked Home view),
the valid range registered by the mounted view for its current width (re-clamping on change),
and `step`/`reset`/`resetToHome`. ImageGrid subscribes to offset changes and captures the scroll
anchor before re-laying out, using the same anchor path as resize. `pinchStep` commits at most
one neighbouring level per touch-contact sequence. Fixed Grid uses a passive, thresholded
scale preview and release-time relayout.

In the compact phone shell, a native pinch captures the visible image nearest its initial
midpoint and the fractional vertical point within its thumbnail block. That temporary anchor
overrides selection/focus for this gesture only, through preview, commit or cancellation.
Placement clamps only to physical scroll bounds; column repacking may change horizontal position.
No focus or selection is changed. The capture scans rendered cells once, not on each move.
Desktop trackpad, menu and keyboard zoom retain normal reflow anchoring. If no image can
be captured, pinch retains that existing fallback too. Fixed Grid clears previews on cancellation,
blur and visibility changes without committing a cancelled step.

Justified uses decorative DOM tiles to animate row/slot movement, crop changes and per-photo
fades (`justified-zoom-transition.ts`, `justified-zoom-morph.ts`, `justified-zoom-morph-renderer.ts`).
The phone pinch image alone uses an identity-preserving track across row breaks; other images
retain slot correspondence, within the same track budget.
Pinch progress is independent of layout density; one frame writer bounds catch-up, and reversal
passes through the original pose. Native contacts must originate in results and retain their
identifiers and original targets through repacking. Single-finger scrolling stays native;
multitouch stops selection auto-scroll.

A static source cover holds the initial pose while the neighbouring layout and existing
thumbnails become ready. Native destination readiness uses image events, without extra requests
or per-move layout reads. Release cancels pending preparation and commits immediately, followed
by a 160ms cosmetic settle when needed. Covers wait for matching endpoint placement or an 800ms abort.
A fresh pinch can interrupt settling immediately.

Unavailable thumbnails entirely outside the viewport are omitted from the capture
margin instead of vetoing the animation. Loaded margin tiles still participate;
unavailable visible thumbnails retain the ordinary anchored-step fallback.

Work is bounded to 320 tiles per capture, 320 tracks and an 18MP viewport allowance. Existing
thumbnail URLs work without CORS or delivery changes. Protected media, reduced motion, budget
limits or unavailable preparation use an ordinary anchored step. Focus and position remain
owned by the shared layout/anchor path; the decorative animation never changes result ordering.

## Image Detail (`components/ImageDetail.tsx`)

Owns the route-driven overlay while the list stays mounted. It composes metadata/usages,
`NavStrip`, traversal, prefetch, swipe/dismiss and zoom in compact detail or desktop fullscreen.
Stable containers preserve fullscreen across traversal; return placement belongs to
`useReturnFromDetail`, not this renderer.
Desktop detail uses the theme surround; compact detail and image fullscreen remain black.

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

`NavStrip.tsx` supplies prev/next strips and `FullscreenCornerButton`, a top-right enter/exit
toggle inside the image area. Mouse hover reveals them after a short delay. On desktop touch,
the first image/hidden-control tap reveals controls without activating an invisible button;
a subsequent visible-control tap acts normally, with idle hiding through `useCursorAutoHide`.
Compatibility mouse events from touch do not immediately undo that reveal. The next strip
starts below the corner button. Adjacent swipe panels follow touch capability, independently
of the UI model; pure-mouse machines avoid those extra panels. Prefetch policy is unchanged.
In the compact shell, metadata moves into a non-modal `BottomSheet` card (no scrim). Expanding
the card shrinks the image into the top quarter; tapping or swiping down on the image collapses
the card before a subsequent downward swipe dismisses detail. Portrait and landscape use the
same image-first view; tapping toggles controls and zoom hides them. Browser detail requests
native fullscreen when possible, while installed apps use their existing window presentation.

## Crop Editor (`components/crop/`)

`CropEditor` is lazy-loaded inside detail when `cropping=true`. Crop shows and logs the
Kahuna-shaped request, never posts it. Detail supplies its accepted enriched image;
`cropAccess` shares existing creation checks across normal entry and editor preparation.
The editor consumes canonical source, cost/restrictions, freshness and session state without
another image/permission fetch. Withheld preparation preserves the frame; accepted updates
and session invalidation are observed, never polled. Pay/Restricted use/Overquota notices
remain outside the fullscreen-hidden toolbar. Backend writes are not implemented.
`CropCanvas` owns one Cropper.js v2 instance per source/alt lifetime, tracks loading/absence,
cancels callbacks/frames on teardown and preserves natural-pixel selection geometry on resize.
Native image gestures are disabled; desktop fullscreen supplies controlled pan/zoom without
changing crop coordinates. Alt temporarily inverts the selected Hand/frame mode in either
direction; the Hand highlight reflects that effective mode and restores on release or blur.
The persistent mode is unchanged, and grip/resize handles retain their crop-editing actions.
Rotation remains unavailable. Rendition coordinates map to
oriented-original pixels; mock submission requires a current, finite, positive, in-bounds selection. Image/source, ratio and
legacy-settings changes invalidate prior selection/output until the canvas reports readiness.

Crop entry uses a fresh history key, retaining both its detail return marker and the detail's
list origin. Cancel/Back/Forward/reload use those markers; a cold crop link replaces its URL on
Cancel because it has no separate detail predecessor. Matching crop/detail history transitions
leave the mounted search buffer untouched. Normal and history-driven entry exit image fullscreen.
Editor mode admits neither hidden detail media nor crop-list preparation.
The editor focuses/traps its own controls, restricts letter shortcuts to current ratio options,
leaves native Enter on controls alone and makes background detail controls inert. Native Cropper
keyboard handling is enabled after connection and disabled at cleanup; cleared selection disables Crop.

Root `beforeLoad` applies `cropType`, `customRatio=label,width,height` and `defaultCropType` on
cold and SPA entries before redirects. These are display-only URL keys, persisted in per-tab
`kupua.crop.*` session storage. Settings changes update an already-open editor. Fixed presets,
the small-width warning and GNM square circle mask/guide follow Kahuna; malformed custom ratios
are rejected and explicitly requested hidden presets remain selectable. Saved-crop `?crop=id`
selection replaces the existing history entry, survives legacy redirects and is excluded from
search/position fingerprints; traversal clears it. The same mandatory ratio constrains saved
selection and creation, with exact ratio-string matching, including a freeform lock. Default
ratios do not restrict selection. Original stays inspectable; API saved lists require the
advertised crops relation even on deep links. Selection failures never substitute Original.
The deferred, memoized crop rail is image-owned; mobile list work waits for the expanded
card and first section visibility, while offscreen neighbours/fullscreen omit it. Prepared
mobile content retains its measured space on collapse. No global export cache is introduced.
5:3 warning gutters are not implemented. Numeric inputs edit bounded original-pixel
coordinates; ratio labels collapse at 1294px and below. The small-crop warning is persistent and
local to the editor, including fullscreen, rather than part of the global toast queue.

Alt+f toggles desktop crop fullscreen; ordinary dragging pans, Alt-drag/grip moves the crop,
and edges/corners resize it. A sharper rendition loads on first zoom; Escape exits fullscreen
without discarding the selection. A single validated session-storage draft restores ratio and
frame (including cleared state) after reload. Resolved in-app departure discards it, so Forward
starts fresh; full-document away/Back can retain it. Camera/fullscreen state is not persisted.

## Fullscreen Preview (`components/FullscreenPreview.tsx`)

Fullscreen peek opened with `f` or middle-click, without a detail route or metadata. The component
owns native Fullscreen API entry/exit directly; `useFullscreen` is the detail overlay's wrapper.
Arrow traversal uses `useImageTraversal` and updates focus. A same-URL history entry absorbs browser
Back. `fullscreen-exit.ts` prevents a rejected or still-active native exit from prematurely
finalizing the preview. Entry failure rolls back the extra history entry.

Exit preserves list placement when still on the entry image. After traversal, it waits for
fullscreen/layout settlement before centring the current focus, guarded against a newer preview.
Phantom mode adds a pulse. Prefetch, zoom and cursor hiding are shared with detail.

Image detail and preview share a top-right corner control aligned with the Next navigation
icon. Results zoom and Lock View appear only in the results page's Settings menu, not in detail
or crop. The existing image-level zoom/history gesture handling is unchanged.

The Vite entry links `public/manifest.webmanifest`: fullscreen installed-window presentation,
`/search` launch, same-origin `/` scope, existing Grid SVG/name and matching dark launch colours.
No service worker, offline cache, sharing handler or explicit app ID is supplied. This installed
window presentation is separate from image fullscreen through the Fullscreen API.

## Image Metadata (`components/ImageMetadata.tsx`)

Renders one image in detail or the right panel using registry ordering, visibility and empty-field
rules. `useEnrichedImage` accepts the detail owner's standalone overlay or the shared per-ID overlay.
Rights presentation includes cost, validity, leases and restrictions. `SearchPill` and shared
metadata search helpers turn values into queries, retaining Shift/Alt modifiers. Image resolution
and selection precedence belong to the calling detail/panel owner, not this renderer.

Registry order follows Kahuna's detail priorities: Special instructions, Taken on, By,
Credit, Location and Copyright precede the remaining core rows. Modified replaces Last
modified, and Filename follows Uploader. Shared table ordering follows the same registry;
that trade-off is intentional. Image type and Photoshoot stack, and Labels has its own
section. Source, supplier references and configured aliases live in collapsible Additional
metadata. Dimensions/file size belong to Original in the crop rail; File type and Image ID
remain table fields rather than metadata-panel rows.

Known-empty important fields use Unknown with actionable add/edit guidance where editable;
mixed fields keep field-specific disagreement wording and edit-all controls. Viewers omit
optional empty By, Copyright, Location, People and Keywords, while important descriptive
fields and configured Image type remain visible. Upstream usage instructions stay read-only
and do not gain a redundant empty extra-instructions row. Pending/retained rendering is not
reclassified as a fresh known-empty value. Empty rights labels also use Unknown without
changing server cost, validity or authorization.

In API mode, the label row uses `LabelEditor` with the same owned enrichment. Shared
`EditableSearchPill`/`PillActionButton` controls separate value search from addition,
removal and apply-to-all. Ordinary scalar, Location, People, Keywords, Photoshoot
and collection-membership editors prepare explicit Not sent intents only; they do
not invoke the Labels executor or infer permission from a registered field. The search panel supplies
current selected IDs and capabilities separately from its retained completed display,
rechecking that ownership at the action boundary. Pending metadata blocks editing.
Detail disables outgoing-image controls and supplies its requested-ID-owned overlay.
Ordinary API editors use each image's edits capability and stay mounted when that capability
is withheld: closed fields present read-only values, while open target-bound drafts survive
with preparation disabled. Multi-image preparation additionally requires complete captured
targets and known reconciliation. Mixed Location value-search controls are siblings of the
edit-all control rather than nested buttons. Labels keeps its separate command/receipt owner.
Eligibility counts and target IDs remain internal to admission and receipts; the
label row does not show a diagnostic summary or Target images disclosure.

Editable pills retain the shared compact construction, with joined close and
stacked-plus controls rather than separate button blocks. Icons use shared inline
SVG paths in `SearchPill`, not an icon-library dependency. Editing colours follow
Kahuna: full labels are blue/white and partial labels white/blue. Only the hovered
enabled segment changes: full labels invert to white/dark blue and partial labels
to dark blue/white; neutral pills hover white with grey text/icons, preserving label accents.
This deliberately strengthens Kahuna's subtle hover feedback. Enabled action buttons
use the hand cursor; disabled actions retain the unavailable cursor and do not highlight.
Read-only neutral metadata pills share that styling; partial outlines are inset so full and
partial pills share the same height rather than adding a border to partial values.
Action tooltips name the
field, with remove-from-all based on known occurrences rather than selection size.
Desktop pills retain their compact height; coarse-pointer metadata actions and
scalar controls use the shared 36px token. Scalar reading labels/values stay side by
side on phones, with aligned editable/read-only value columns; multiline and pill
fields stack. Table/thumbnail geometry is unchanged. Search modifier tooltips remain.

Label entry is hidden behind Add in the field heading: a boxed plus on desktop and
a dashed circle on touch, with pills below. The Plus stays mounted and invisible in
its fixed slot during entry. The full-width input is 24px tall on desktop and uses
36px touch sizing, with grey Close and blue checkmark actions below. Opening entry
focuses its input at the end. Escape and Close
discard unsent input and close entry; Enter prepares deduplicated, trimmed comma-separated
additions and closes on success. Focus returns to Plus. This is draft cancellation,
not cancellation of recorded or in-flight operations.

The entry combobox and CQL search share `createLabelSuggestionProvider` in
`typeahead-fields.ts`, backed by the existing DAL aggregation read. Prefix matching
is case-insensitive and preserves backend popularity order within the 50-value
shortlist; missing less-popular matches is accepted for this version. The editor
passes only `nonFree: "true"`, with no query, selection IDs, browsing filters or
search-store facet cache, so suggestions cover the accessible library rather than
the selected images. Scope remains explicit in provider parameters and the accessible
listbox name; the dropdown shows values/counts without a visible scope heading.
Query suggestions retain their existing current-search scope and own-field exclusion.
`SuggestionDropdown` portals the list inside its owning sheet/dialog focus scope,
tracks field width and visual-viewport bounds, and excludes the complete metadata
field above its heading or below its actions. Resize/scroll update placement without
adding document-flow height. Refine remains input-anchored. If no option fits,
callers suppress expanded/active keyboard behavior as well as the list.

Entry reads are debounced and cancelled on ownership changes, blur or close;
obsolete responses cannot publish. Selection replaces the active comma token,
preserving other tokens and surrounding whitespace, and restores the caret without
committing. Arrow keys highlight choices; Enter accepts a highlighted choice or
otherwise prepares the draft as before. Pending, unavailable and empty results stay
distinct internally without extra visible status copy; none prevents free entry.
Input validation uses the field's native/ARIA state rather than a separate message.
No backend, mapping, paging
or catalogue change is part of this implementation.

`label-editor-store` keeps target-set-bound input and immutable operation receipts in
memory, independently of selection clearing or route unmounts. Root-mounted
`LabelOperationReceipts` shows bounded, newest-first receipt previews and retains
the complete target set internally. Expanded compact selection sheets host the same
receipt state inside their focus scope; the root display serves other states.
Native pill/disclosure activation keys do not bubble into grid navigation. Pending
cohorts retain searchable values without stale coverage fractions. Repeated gestures
reopen their existing receipt and complete input preparation without resubmission.
Unfinished input and in-flight/uncertain outcomes install a document-exit warning,
not reload recovery. Labels connects to the existing bounded executor only with the
startup-captured editing preference and authoritative admission; otherwise it prepares
disconnected intent. Connected submissions accept one label, not comma-separated
execution. Transport outcomes and observation remain separate; closing an observer
does not cancel or replay a command. There is no extra confirmation or undo, and
pending/unknown gestures remain protected from replay. The
[command contract](../../../src/dal/grid-api/README.md#step-6-bounded-label-execution)
owns scheduling, outcomes and readback rather than these presentation components.

### Preparation-Only Field Owners

| Owner | Responsibility |
| --- | --- |
| [MetadataTextEditor](../../../src/components/MetadataTextEditor.tsx) | Captures baseline/mixed state, keeps independent Description mode drafts, validates no-op/clear preparation and owns local-to-UTC/repeated-hour conversion. Pending data disables preparation without discarding target-keyed drafts. |
| [MetadataDateInput](../../../src/components/MetadataDateInput.tsx) | Numeric groups, selection/navigation, fraction retention/reset and whole-second native picker. Multiple dates activates the groups or clears directly; incomplete input is invalid, not a clear. It does not own targets or persistence. |
| [MetadataLocationEditor](../../../src/components/MetadataLocationEditor.tsx) | Four stacked components and sparse changed/explicit-clear values; untouched mixed components survive. Enter prepares from inputs without stealing native button activation. |
| [MetadataPillEditor](../../../src/components/MetadataPillEditor.tsx) | People/Keywords/Collections add/remove/apply-to-all preparation, complete-target availability and duplicate guards; collection display labels stay distinct from canonical path identity. |
| [MetadataSuggestionInput](../../../src/components/MetadataSuggestionInput.tsx) | Existing provider selection, caret/focus/dismissal, IME-aware keyboard behavior and fill-without-submit semantics. |
| [useTypeaheadSuggestions](../../../src/hooks/useTypeaheadSuggestions.ts) | Metadata/Refine debounce, fixed-array matching, bounded dynamic results and abort/stale suppression. Provider matching/order is retained; CQL and Labels keep their separate lifetime owners over shared providers. |

Shared field layout and Add/pill actions remain presentation helpers, not authorization
or a generic command framework. [The roadmap's UI register](../gradually-growing-teeth.kupua-edits-steps.md#ordinary-metadata-ui-coverage)
owns field coverage and remaining schema/save work; [UI decisions](../gradually-growing-teeth.editing-ui-decisions.md)
owns selected interactions and deferred badge proposals. Source, Subjects, configured
aliases without schema and system fields do not become writable by inference.

## Multi-Image Metadata (`components/MultiImageMetadata.tsx`)

Renders the supplied reconciled view according to registry `multiSelectBehaviour`, with cost
summaries from the supplied cached images and selected membership as the count denominator.
`metadata-primitives.tsx` shares field layout/search helpers with single-image metadata;
`MultiValue` summarizes disagreement and `MultiSearchPill` represents partial/full membership.

The same scalar, composite and pill editors serve single and multi-image panels.
Preparation requires the complete captured selection to be available, not merely the
retained display subset; draft keys change with target identity. New preparation
callbacks neither grant command authority nor optimistically publish canonical data.

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

## Compact Shell (`hooks/useShell.ts`, `components/BottomSheet.tsx`, `components/FiltersSheet.tsx`)

The compact (phone) model applies when the primary pointer is coarse and either viewport width
or height is at most 639px; the height branch keeps landscape phones compact. `useIsCompact()`
and `html[data-shell]` expose the choice. A narrow mouse desktop keeps the desktop model.
`useTouchCapable()` separately admits shared finger gestures; it does not choose chrome, click
mode, default density or feature availability. Installed/PWA presentation is not a third model.
The engine (buffer, scroll, focus, selection) is shared. Design rationale is archived in the
[compact shell design](../zz%20Archive/compact-shell-design.md).

- **Panels.** `PanelLayout` renders the left panel as a `SideSheet` (scrim, swipe toward its edge
  to dismiss) and the right panel as a `BottomSheet` card shown only while a selection exists; it
  closes when the selection empties. A placeholder keeps the results at the same child index so
  crossing the breakpoint never remounts the list. Panel configuration is not rewritten.
- **`BottomSheet`** is a peek (64px) / expanded (75vh) card with drag, optional scrim and
  `useContentPullToDrag`. A visible expanded scrim-backed sheet exposes `dialog`/`aria-modal`,
  temporarily inerts background branches and restores prior inert state on collapse/unmount.
  `useFocusTrap` keeps Tab inside, restoring focus on close (never to a text field).
  Current selection and image-detail cards are scrim-free nonmodal regions. Visual-viewport height/bottom
  adjustment and focused-form scrolling keep editors reachable above the keyboard;
  the optional floating slot moves with the actual card transform.
  Collapsed content is inert, while the peek toggle stays usable; collapse returns content focus
  to that toggle. A second contact cancels handle dragging rather than collapsing or toggling.
- **`FiltersSheet`** is the Refine surface. In the compact shell it is a bottom sheet with
  `RefineChips` (tap key to negate, tap value to edit, × to remove, "+ Add filter"), free-to-use,
  sort and inline dates, with Reset and "Show N results". On narrow desktop it is a dropdown
  under the search bar with the same filters, no chips (the editor shows the full query) and
  live application. Both trap focus and close on Escape.
- **Chip model.** `cql-query-edit.ts` provides `splitFieldTerms`/`joinFieldTerms` and
  `parseFieldChips`/`serializeFieldChips`; chip edits round-trip through the URL query.

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
Equivalent non-forced callers share an already-dispatched base facet batch, so Browse activation
keeps useful hover work. Undispatched calls retain trailing-edge debounce (activation skips it);
force refresh or a different effective scope still supersedes pending work. Completed base and
expanded caches retain their existing reuse rules.

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
leaves the tree visible without counts. Counts can overcount ancestor/sibling scopes.

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

Action-boundary tracer, enabled automatically in DEV regardless of the localStorage flag.
In non-DEV browser builds it is enabled only when `localStorage.getItem("kupua_perceived_perf")`
is `"1"` at module initialization; refresh after changing the flag. This runtime gate does
not guarantee production bundle elimination or zero runtime cost. The Playwright performance
harness sets the flag before navigation. Trace opt-in alone does not provide the dev-only
controls required by the current harness or establish hosted-build measurement parity.

Production call sites use `beginTraceInteraction` and `traceInteraction` to correlate the start
and owned phases. Current boundaries include `t_store_ready`, `t_first_visible_frame` and
`t_visual_settled`; stored `t_settled` metrics have a different definition and are not interchangeable with them. Read
`window.__perceivedTrace__` in the browser. The perf handbook owns phase meanings and measurement
rules: `t_ack` is synchronous producer acknowledgement, while first-visible and settled are the
browser-observed boundaries.

**Logging:** use `devLog()` from `src/lib/dev-log.ts` (DCE'd in prod, readable in E2E via `KupuaHelpers.getConsoleLogs()`). Reserve bare `console.warn` for genuine error paths only.

