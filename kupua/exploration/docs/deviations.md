# Deviations

> This file documents intentional differences between kupua and Grid/kahuna,
> and places where the code departs from library conventions or idiomatic
> patterns.  Its purpose is to stop future maintainers (human or agent)
> from "fixing" things that are intentional, and to make the trade-offs
> visible for review.
>
> **Update this file when a new deviation is introduced.**

Last updated: 2026-05-22

---

## From Grid / Kahuna

### 1. `nonFree` default is "show all" (unchecked)

In production kahuna, the `nonFree` default depends on the user's
`showPaid` permission (fetched from `mediaApi.getSession()`).  Most users
default to free-only; users with the `showPaid` permission see everything.

Kupua has no auth, so there is no session to query.  The default is
`nonFree=true` (show all images, checkbox unchecked).  When the user
checks "Free to use only", `nonFree` is removed from the URL and the
free-to-use category filter is applied.

When auth is added, this should be revisited to respect the user's
`showPaid` permission, matching kahuna's behaviour.

### 2. ~~Route path is `/` not `/search`~~ — RESOLVED

Kupua now serves the search page at `/search`, matching kahuna's URL schema.
The image detail view is an overlay within the search route (at
`/search?image=:imageId`), not a separate route.  `/images/:imageId`
redirects to `/search?image=:imageId&nonFree=true` for backward compat.
The root path `/` redirects to `/search?nonFree=true`.

### 3. Free-to-use filter is client-side category list

Kahuna delegates the free-to-use filter to the Grid media-api, which
evaluates it server-side using `SearchFilters.scala`.  Kupua talks
directly to Elasticsearch, so the filter is a hard-coded `terms` query on
`usageRights.category` in `es-adapter.ts`.  The category list was copied
from `SearchFilters.scala`'s `freeToUseCategories`.

If the canonical list changes in Grid, kupua's copy will drift.  This
would go away if kupua switches to the Grid API data source, but direct ES
access is an intentional architectural choice for read-only work.

### 4. Sort aliases live in the ES adapter, not in a shared config

Kahuna's sort aliases (e.g. `taken` → `metadata.dateTaken`) are defined in
the Scala API.  Kupua duplicates them in `buildSortClause` inside
`es-adapter.ts`.  Same drift risk as §3; same mitigation — keep the alias
map small and review if discrepancies appear.

### 5. `track_total_hits: true` on every search

Kahuna / the Grid API does not always request exact totals from ES (the
default ES 8.x cap is 10,000).  Kupua sets `track_total_hits: true` on
every search so the result count in the UI is always accurate.  This has a
minor performance cost on very large result sets.  No issues observed so
far against real ES clusters (~9M docs), but should be revisited if
query latency becomes a problem on expensive queries.

### 6. No `logoClick` custom event

Kahuna dispatches a `window.CustomEvent("logoClick")` when the logo is
clicked.  Several components (`gr-permissions-filter`, `gr-sort-control`,
`gr-my-uploads`) listen for this to reset their own state.  Kupua doesn't
need this — the logo is a `<Link>` that navigates to `/search?nonFree=true`,
and the URL-sync cycle resets all state automatically.

### 7. Fonts are self-hosted copies, not fetched at runtime

Kahuna serves Open Sans from its own Play Framework asset pipeline
(`/assets/stylesheets/fonts/…`).  Kupua copies the same woff2 files into
`public/fonts/` and references them with absolute-path `@font-face` `src`
URLs.  The font files are byte-identical to kahuna's — they are the same
modified builds, not vanilla Google Fonts downloads.

### 8. CQL typeahead uses ES aggregations instead of Grid API endpoints

Kahuna's CQL typeahead resolvers call the Grid media-api's
`/suggest/metadata/{field}` and `/edits/labels` endpoints.  Kupua has no
Grid API connection.  Instead, `typeahead-fields.ts` builds resolvers that
query ES directly via terms aggregations on keyword fields (e.g.
`metadata.credit`, `metadata.keywords`, `exports.author`).

The `buildTypeaheadFields` function takes the `ImageDataSource` as input.
When/if the DAL switches to `GridApiDataSource`, the resolvers will
automatically use live API suggestions with no CQL component changes.

### 9. Date filter UI improvements over kahuna

Kupua's date filter adds several improvements over kahuna's `gu-date-range`:
- Quick-range presets (Today, Yesterday, Last 7/30 days, Past year)
- Blue dot indicator when a non-default range is active
- Combined button label showing the active range and date type
- ESC to close dropdown

These are intentional enhancements, not parity deviations.

### 10. ~~Single "Dimensions" column replaces separate Width/Height~~ — REVERSED

Kupua initially merged Width and Height into a single "Dimensions" column
sorted by a Painless script (`w × h`). This was reversed because the
script sort was unusably slow for deep seeks — Strategy B (iterative
`search_after` with 10k chunks) took ~60s through SSH tunnels to reach
positions beyond 100k. The script sort prevented use of percentile
estimation (which only works on plain field values).

Kupua now has three columns: **Dimensions** (display-only, shows oriented
`w × h`), **Width** (sortable, `source.dimensions.width`), and **Height**
(sortable, `source.dimensions.height`). Both Width and Height are plain
integer fields that use the fast percentile estimation path (~200ms for any
depth). Users can sort by Width alone, Height alone, or both via
shift-click secondary sort — strictly more powerful than pixel count.

The entire script sort infrastructure was removed: `scriptSorts` map,
`isScript` flag in `parseSortField`, Strategy B iterative skip loop in
seek, script handling in `reverseSortClause`, `countBefore`, and
`searchAfter`. ~120 lines deleted.

**Migration impact:** No longer a concern — Width/Height are plain field
sorts that work with `fieldSort()` in media-api's `sorts.scala`.

### 11. CQL free-text search uses simpler `cross_fields` strategy

Kahuna's Scala `QueryBuilder` constructs free-text queries with
field-specific boosting, `minimum_should_match`, and other tuning.
Kupua's `parseCql()` uses a straightforward `multi_match` with
`type: "cross_fields"` and `operator: "and"` across the same field set.

Search results may rank differently for the same query.  This is
acceptable for read-only work and can be revisited if ranking parity
with kahuna becomes a priority.

### 12. End key scrolls to bottom of loaded results (not last item in index)

Kahuna's `scrollEnd` computes `rows - currentRowTop` to jump to the last
loaded row.  Kupua does the same — End scrolls to the bottom of
the scroll container, which also triggers `loadMore()` via the infinite
scroll handler.

When windowed scroll + `search_after` pagination is implemented, End will
need to issue a direct ES query for the **last page** of results — a seek
rather than a scroll.  The data window will be replaced with the last N
items, and the scrubber thumb will jump to 100%.  This is analogous to
Google Photos' "seeking" mode and is tracked in the scrollbar design notes
in `migration-plan.md`.

### 13. Typeahead value suggestions via terms aggregation for keyword fields

Kahuna's CQL typeahead has resolvers for some keyword fields (`credit`,
`source`, `supplier`, `category`, `label`, `uploader`) via the Grid API's
`/suggest/metadata/…` endpoints, plus completion suggesters for `credit`
and `photoshoot`.

Kupua replaces all of these with **terms aggregations** on the
corresponding keyword fields in ES.  This is simpler (one strategy instead
of two) and shows all values ranked by popularity immediately when the user
types `:` — completion suggesters require at least one character.

Additional keyword fields that kahuna left without resolvers (`croppedBy`,
`keyword`) now also have terms-aggregation resolvers.  `filename` is
registered as a field but has no resolver (filenames are nearly always
unique, so aggregation is pointless).

Text-analysed fields (`by`, `city`, `copyright`, `country`, `description`,
`illustrator`, `location`, `person`, `specialInstructions`, `state`,
`suppliersReference`, `title`) have no value suggestions — same as kahuna.
A better approach (e.g. keyword sub-fields or completion suggesters added
to the ES mapping) will be explored later.

### 14. Sort scrolls to top (violates "Never Lost" principle)

Sorting resets scroll position to the top of the table, matching every
major data table (Gmail, Sheets, Finder, Explorer) but deviating from
kupua's own "Never Lost" principle (`frontend-philosophy.md`).

Horizontal scroll (`scrollLeft`) is preserved on sort-only changes —
the user may have scrolled right to reach the column header they clicked.

**Why:** `search()` returns only the first page (~50 rows at offset 0).
Preserving scroll position at row N while only rows 0–49 have data causes
an infinite gap-detection → loadRange → placeholder pulsing loop
(performance-analysis.md finding #2).

**Sort-around-focus: attempted and reverted.** We built ~340 lines across
6 files to find the focused image's new position via ES `_count` and scroll
there. Hit three walls: (1) `max_result_window` caps `from/size` at 100k —
most unfiltered sorts land well beyond; (2) equal sort values — `_count`
returns position of the *value* not the *image*; (3) growing complexity for
diminishing returns. See performance-analysis.md findings #2, #4, #5 for full analysis.

**Real fix:** `search_after` + windowed scroll (scrubber). With cursor-based
pagination there's no depth cap. Until then, scroll-to-top is correct.

### 15. Alt+key modifier for keyboard shortcuts in editable fields

Kahuna's panel shortcuts (`L`, `M`) only work when focus is NOT in the
search box. This makes them unreliable — users think shortcuts are broken
half the time.

Kupua uses a universal pattern: bare key when focus is not in an editable
field, `Alt+key` when it is. Both combos work when not editing. This
means `[`/`]` (panels) always have a way to fire regardless of focus state.
`f` (fullscreen) uses the same system and is registered in both contexts:
in image detail view it toggles the detail container's fullscreen (via
`useFullscreen`), and in grid/table view it activates `FullscreenPreview`
— a lightweight true-fullscreen peek via the Fullscreen API. The shortcut
stack ensures only one handler is active: when ImageDetail mounts, its `f`
registration pushes on top and FullscreenPreview's becomes dormant. When
no image is focused in grid/table, `f` is a no-op (no ambiguity).

`Alt` was chosen over `Cmd`/`Ctrl` because:
- `Cmd+F` is browser Find — sacred, never intercept
- `Cmd+[`/`Cmd+]` are browser Back/Forward
- `Alt+letter` on macOS types dead characters (`ƒ`, `"`, `'`) — irrelevant
  in a CQL search field for an image DAM
- `Alt` has no browser or OS conflicts on any platform

**Trade-off:** macOS users can't type `"` (curly quote via Option+[) or `ƒ`
(Option+f) while the search box is focused. Zero practical impact — CQL
uses straight quotes and nobody searches for typographic symbols.

Centralised in `lib/keyboard-shortcuts.ts` with a single `document`
capture-phase listener. Components register via `useKeyboardShortcut` hook.

### 16. Direct ES access bypasses media-api — migration surface

Kupua talks to Elasticsearch directly for all read operations, bypassing
Grid's `media-api` entirely. Kahuna never touches ES — it calls
`media-api` (Scala/Play), which handles CQL parsing (`querysyntax/`),
query building (`QueryBuilder.scala`), filter construction
(`SearchFilters.scala`), sort aliases (`sorts.scala`), and response
shaping (`ImageResponse.scala`) — ~2,200 lines of Scala.

Kupua replicates this logic in ~1,760 lines of TypeScript across 5 files:

| Kupua file | Grid equivalent |
|---|---|
| `es-adapter.ts` (1020 lines) | `ElasticSearch.scala` + `sorts.scala` + `SearchFilters.scala` |
| `cql.ts` (477 lines) | `querysyntax/` + `QueryBuilder.scala` + `MatchFields.scala` |
| `field-registry.ts` (644 lines) | `ImageResponse.scala` (field extraction) + `sorts.scala` (sort keys) |
| `types.ts` (321 lines) | `ElasticSearchModel.scala` (param types) |
| `es-config.ts` (91 lines) | Config / safeguards (no Grid equivalent) |

**When kupua connects to media-api (Phase 3+, required for writes):**

The likely architecture is **dual-path** — direct ES for reads (fast,
flexible, supports custom aggregations), media-api for
writes (metadata editing, crops, leases, collections). This means the
ES read path stays as-is and writes go through a new
`GridApiDataSource` adapter.

If a single-path architecture is chosen instead (all traffic via
media-api), the following kupua-specific features need migration:

1. ~~**`_script:dimensions` sort**~~ — **Resolved.** Dimensions script sort
   removed; Width and Height are plain integer field sorts that work
   natively with media-api's `fieldSort()`. See §10.
2. **Typeahead via terms aggregations** — kupua runs terms aggs directly
   on ES for CQL value suggestions. media-api has
   `/suggest/metadata/{field}` but only for a subset of fields. See §13.
3. **CQL parsing** — kupua uses `@guardian/cql` (TypeScript); media-api
   uses its own Scala `querysyntax/Parser`. In the API path, the CQL
   string passes through verbatim to media-api which parses it
   server-side, so `cql.ts` is unused. But any kupua-specific CQL
   extensions (if added) would need to be upstreamed.
4. **Custom filters** — `es-adapter.ts` builds filter clauses
   (free-to-use, date ranges, hasCrops, etc.) that mirror media-api's
   `SearchFilters.scala`. In the API path these map to HTTP query params
   (`free`, `since`, `until`, `hasExports`, etc.) — straightforward
   1:1 mapping, ~100 lines.
5. **Response shape** — direct ES returns raw `_source` documents
   (kupua's `Image` type). media-api wraps them in HATEOAS JSON with
   links, actions, cost calculation, signed URLs. A `GridApiDataSource`
   would need to unwrap this or kupua's components would need to
   consume the richer shape.

**Recommendation:** Dual-path (ES for reads, API for writes) avoids all
of the above. The only new code is the write adapter. This is already
the plan in `migration-plan.md` Phase 3.

### 17. Agency-pick image border colour

Kahuna image borders are driven by `usageRights.category` CSS classes only.
There is no separate border colour for agency-pick images — those are
distinguished by the ticker badge in the StatusBar, not by a cell border.

Kupua adds an agency-pick border colour (`gridConfig.agencyPicksColour`,
currently `#7d006880`) rendered by `getImageBorderColour()` in
`lib/image-borders.ts`.  The function checks the category-based rule first
(GNM-owned takes priority — the two sets don't overlap in practice), then
falls through to `isAgencyPick()` which scans `metadata.description`,
`metadata.keywords`, and `metadata.title` for any value in
`gridConfig.agencyPicksIngredients`.

Note: `isAgencyPick()` compares case-insensitively because the ES standard
analyser lowercases all text at index time, so stored keyword values may
differ in case from the config values.

**Trade-off:** scanning up to three string fields on every image in the
visible buffer on every render.  Fields are short (~100 chars), config is
small (17 values), and JS string operations are fast — no measured impact.
If the grid grows to display many hundreds of images simultaneously, profile
before changing the approach.

### 18. `Is` section in Filters panel and `is:` typeahead document counts

Kahuna: the left Filters panel has no `Is` section.  The `is:` typeahead
shows a static list of values with no document counts.

Kupua: FacetFilters has a dedicated `Is` section that lists all valid
`is:` values (from `buildIsOptions()`, config-gated) with document counts
and active/excluded state.  Entries backed by a ticker show the ticker
count.  `gnm-owned-photo`/`gnm-owned-illustration` are summed from the
category terms agg.  `deleted`/`under-quota` come from a dedicated
`getFilterAggregations` request batched with the main agg fetch.
Zero-count entries are hidden unless active or excluded.

The `is:` typeahead resolver follows the same logic: ticker counts from
store, photo/illustration from category buckets, deleted/under-quota from
the panel cache or a direct `getFilterAggregations` call when cold.

These are intentional enhancements — do not remove the `Is` section to
achieve parity with Kahuna.

### 19. Prefetch pipeline — fire-and-forget replaces debounced abort

**What:** Kupua's `ImageDetail.tsx` (Era 3, commit `85673c0d4`) used
`fetch()` + `AbortController` with a 400ms debounce for prefetching
nearby images. Kupua now uses fire-and-forget `new Image().src` (Era 2
approach), direction-aware (4 ahead + 1 behind, PhotoSwipe model),
`fetchPriority="high"` on the main `<img>`, and a T=150ms throttle gate
that suppresses prefetch batches during held-key rapid traversal.

**Why:** The 400ms debounce killed the rolling pipeline at any browsing
speed faster than ~500ms/image. At 200ms/step (fast flick), prefetches
never fired — landing image was 500ms cold imgproxy latency. Experiment
data confirmed: landing dropped from 400-540ms to 0ms across 7/8 speed
tiers after the fix. The throttle gate (T=150ms) reduces imgproxy
contention at held-arrow-key speeds (<150ms/step) without ever firing at
normal browsing speeds (≥200ms/step).

**Trade-off:** Abandoned requests are never cancelled (unlike Era 3).
In-flight prefetches for images the user has already passed consume
imgproxy processing time and browser connections. At normal speeds this
is negligible (browser deduplicates same-URL requests). At extreme rapid
speeds the throttle gate halves the request volume. The net effect is
dramatically better: 0ms landing at moderate/fast speeds vs 400-540ms.

Full experiment data: `exploration/docs/zz Archive/traversal-perf-investigation.md`.

### 20. Mobile autofocus suppression for the search input

**What:** On touch-primary devices (`(pointer: coarse)`), kupua does not
autofocus the CQL search input. Three sites are gated:

- `CqlSearchInput.tsx`: skips the `autofocus` attribute when mounting the
  custom element on mobile.
- `lib/orchestration/search.ts`: `resetScrollAndFocusSearch` skips the
  post-navigate `cqlInput.focus()` call on mobile.
- `lib/reset-to-home.ts`: same skip after the home reset.

**Why:** Autofocus on mobile pops the on-screen keyboard, which obscures
roughly half the viewport. Users navigating image results don't want the
keyboard up by default — they tap the search bar explicitly when they
want to type. Kahuna doesn't have this issue because it isn't designed
for mobile use.

### 21. Collections — chip format uses `collection:pathId` not `~pathId`

**What:** When a collection chip is clicked in the detail panel (or via
`useMetadataSearch()`), it emits `collection:pathId` into the CQL query
(e.g. `collection:sport/football`). The design spec originally proposed
`~pathId` (using the `~` CQL shorthand). The tree click handler in
`CollectionTree.tsx` also emits `collection:pathId`.

**Why:** Consistency. The `~` shorthand in the CQL parser is a syntactic
alias for `collection:`. Both forms are equivalent to the ES adapter.
Using `collection:` everywhere means tree clicks and chip clicks produce
identical query strings — easier to reason about and simpler to test.

**Trade-off:** Users who type `~` manually in the search box will still
see it transformed to `collection:` (the CQL chip editor renders the
canonical form). This is intentional and matches how `#` becomes `label:`.

### 20. Collections auto-sort is atomic and bidirectional (Kahuna departure)

**What:** When a `collection:` chip appears anywhere in the CQL query,
kupua auto-switches the sort to `-dateAddedToCollection` and remembers the
previous sort. When the chip disappears (clear query, click a metadata
value that replaces it, etc.), it reverts to the previous sort — unless
the user manually changed the sort while viewing a collection, in which
case the manual choice is respected.

**Implementation:** Inside `useUpdateSearchParams()` in `useUrlSearchSync.ts`.
Before `navigate()` fires, the callback inspects prev/next query strings for
`collection:` presence via `/(?:^|\s)collection:/` regex. Sort change is merged
into the same `navigate()` call as the query change → single URL update →
single `search()` call. Module-scope `_preSortBeforeCollection` holds the
pre-collection sort for revert.

**Kahuna difference:** Kahuna auto-sorts only on tree clicks and only when
the current sort is the default (`-uploadTime`). It does not auto-revert
when the collection filter is removed. Kupua's approach is strictly more
useful: it fires regardless of how the chip arrives (tree, pill, typing),
and the auto-revert prevents users from being stranded on a sort order
that only makes sense in collection context.

**Back-navigation guard:** If `orderBy` is already `-dateAddedToCollection`
when the chip appears (e.g. navigating back to a URL that has both), the
current sort is NOT captured as the revert target. Leaving
`_preSortBeforeCollection` as-is means revert falls back to default sort.

**Why atomic (not reactive):** The previous approach used a `useEffect` in
`search.tsx` that fired after the URL change. This caused two sequential
`search()` calls (one with the old sort, one with the new), creating a race
condition with phantom focus. The atomic approach eliminates the race by
construction — zero throwaway ES queries.

### 19. Caret position preserved across tab/window switch

**What:** When the user moves focus away from the kupua tab/window
(Cmd+Tab, browser tab switch, etc.) and returns, the caret in the CQL
search input is restored to its pre-blur position. Implementation in
[CqlSearchInput.tsx](../../src/components/CqlSearchInput.tsx) wraps
`view.dispatch` to continuously cache the latest selection, snapshots
it in a capture-phase `blur` listener (which runs **before** CQL's own
plugin blur handler — see "Why" below), then restores via
`view.dispatch(setSelection(...))` in both a microtask and a rAF on
return.

**Why:** Default behaviour reset the caret to position 0 on return.
Two compounding causes:
1. Browsers clear the DOM selection when the tab hides; on return,
   `focusin` fires, ProseMirror's `selectionFromDOM` reads position 0
   from the cleared DOM, and writes it to PM state.
2. `@guardian/cql`'s own plugin dispatches `setSelection(near(0))` in
   its `handleDOMEvents.blur` ([cql.ts L382](../../node_modules/@guardian/cql/src/cqlInput/editor/plugins/cql.ts#L382)).
   This means by the time `window.blur` fires, PM's cached selection has
   already been reset by the plugin — so the obvious "save on
   visibilitychange:hidden" approach captures position 0.

The fix uses **capture-phase** DOM blur to snapshot before the plugin
reset transaction lands, plus continuous `lastKnownSelection` caching
via a `view.dispatch` wrapper so we always have an authoritative
position even if the plugin reset has already fired.

**Trade-off:** Adds a small wrapper around every PM transaction (one
object allocation per transaction — negligible). Reaches into CQL
internals via the public `editorView` field on the custom element —
brittle if CQL changes its API, but `editorView` is part of the public
surface. See "Should this be upstreamed?" discussion in the
23 April 2026 changelog entry.

### 20. Two-phase position map fetch to avoid ES sort sentinels

**What:** `fetchPositionIndex` in `es-adapter.ts` fetches the position map
in two phases — docs WITH the primary sort field, then docs WITHOUT it —
instead of one contiguous `search_after` walk. Null-zone docs get synthetic
`[null, uploadTime, id]` sort values injected at storage time.

**Why:** ES uses `Long.MAX_VALUE` / `Long.MIN_VALUE` internally for missing
sort fields. These sentinels cannot survive a round-trip through `search_after`:
float64 rounding makes MAX exceed Long range (400), MIN triggers a sign-strip
overflow (400), and `null` causes an NPE (500). This is an unpatched ES/OpenSearch
bug — see [#17120](https://github.com/opensearch-project/OpenSearch/issues/17120).
Splitting into two phases means each phase only sees clean sort values with no
sentinels, and the injected `null` lets `detectNullZoneCursor` handle seeks correctly.

Additionally, `sanitizeSortValues()` converts sentinel-magnitude values to `null`
on ALL search return paths (`_doSearch`, `searchAfter`, PIT fallback), not just the
position map. This ensures `endCursor`/`startCursor` in the store never contain
sentinels, so extends and seeks through the null zone work correctly.

**Trade-off:** Two queries instead of one for position map fetch. The second query
(null-zone docs) is typically fast — most images have the primary field populated.
Total fetch time increases by one round-trip (~200ms) but the fetch is already
background and non-blocking.

### 21. ~~Single-lane enrichment via `?ids=` at 300ms debounce~~ — REMOVED (10 May 2026)

`useEnrichment` was deleted on 10 May 2026 after the inventory audit (A/B/C)
showed the background loop was doing almost no useful work once SOURCE_INCLUDES
is widened. The three genuinely API-only deltas — `cost: "overquota"`,
`isPotentiallyGraphic`, download URLs — are now TS-replicated or fired on user
intent. See §24 and §25. The 200 lines of connection-starvation gymnastics
(single-lane sequential chunking, Zustand subscribe abort, setTimeout yield)
are gone. See changelog entry "Session A: Drop background enrichment" for full rationale.

The adapter scaffolding (`enrichByIds`, `getImageDetail`, `enrichment-store.ts`,
service-discovery, write-guard, Argo helpers) is KEPT for intent-driven single-image
and selection-action paths.

### 22. ~~ES-baseline validity map omits `over_quota`~~ — RESOLVED (10 May 2026)

`over_quota` is now included in `buildValidityMap()` via `quota-store.ts`.
See §24. The API enrichment dependency is no longer needed for overquota detection.

### 23. `field-registry.ts` renamed to `field-registry.tsx`

**What:** `src/lib/field-registry.ts` was renamed to `.tsx` in Cluster 1.

**Why:** The `cost` field definition includes a `cellRenderer` that returns JSX
(`<CostBadgeFromCost ... />`). Oxc (the Vite transformer) rejects JSX in `.ts` files.

**Trade-off:** Minor — the file now requires React imports and the bundler treats it
as a React module. All 14 importers use the `@/lib/field-registry` path alias, which
resolves the extension transparently.

### 24. TS overquota via `quota-store.ts` — departs from "let API overwrite" rule

**What:** `over_quota` cost and validity checks are computed client-side at startup
via `quota-store.ts`, which fetches `/api/usage/quotas` once on mount and provides
a synchronous `isSupplierOverQuota(supplier)` read. This is wired into both
`calculate-cost.ts` (cost = `"overquota"` for exceeded suppliers) and
`buildValidityMap()` (adds `over_quota` check). There is no background refresh.

**Why:** Background enrichment (`useEnrichment`) was deleted on 10 May 2026 (§21).
The quota data is refreshed server-side every 10 minutes by media-api's
`BaseStore.scheduleUpdates`; one boot-time client fetch captures a recent enough
snapshot for a session. A one-hour `setInterval` refresh (deferred) would handle
long-lived sessions.

**Departures from prior design:**
- `inventory-A-from-docs.md` classified "Cost: overquota badge" as
  `Impossible-without-server` (quota lives in S3, refreshed server-side). That
  classification assumed the only path was live API enrichment per image.
  The `GET /api/usage/quotas` endpoint (Argo EntityResponse wrapping
  `StoreAccess`) provides the entire quota state in a single call, making
  a boot-time fetch practical.
- Quota state is session-static (no reactive update if a quota exceeds mid-session).
  This is intentional: media-api itself refreshes every 10 minutes from S3, and
  a mid-session quota flip would only affect newly loaded images anyway.

**Trade-off:** In standalone/Playwright mode (no `/api` proxy), the quota fetch
returns null and all suppliers are treated as under-quota. Cost badges show
"free" or "pay" instead of "overquota". This is the correct graceful-absence
behaviour per the directive. In TEST/CODE/PROD the endpoint is available and
the quota map is populated within milliseconds of app startup.

### 25. `isImagePotentiallyGraphic` is a TS heuristic, not the server field

**What:** `src/lib/graphic-image-blur.ts` computes potentially-graphic status from:
1. Phrase scan on `metadata.description/title/specialInstructions/keywords` (9 phrases).
2. SMOUT substring in `specialInstructions` (case-sensitive); `SMOUT` keyword
   (case-insensitive via `toUpperCase()`).
3. XMP `pur:adultContentWarning` flag from `fileMetadata.xmp`.

**Why:** Grid's `isPotentiallyGraphic` is a Painless script field injected at
query time on search hits — it is NOT stored in `_source` and is absent from
single-image GET responses. `SOURCE_INCLUDES` whitelisting cannot bring it in.
Kupua's TS heuristic mirrors kahuna's phrase list and detection logic exactly,
providing equivalent coverage via the data that IS available in `_source`.

**Departures from kahuna:**
- Kahuna also checks `image.data.isPotentiallyGraphic` (the server Painless
  field). Kupua skips this and relies solely on the TS heuristic.
- Kahuna's `shouldBlurGraphicImages` is a cookie-derived user preference.
  Kupua hardcodes `defaultShouldBlurGraphicImages = true` per the Cluster 1
  "hardcode-defaults rule". The `shouldBlur` parameter exists for future
  toggle support without logic changes.
- Render wiring (blur overlay on grid cells) is not yet implemented. Function
  is ready for Cluster 1 row 5 wiring.

**Trade-off:** The TS heuristic may false-positive (metadata containing a phrase
without the image being graphic) or false-negative (graphic image without matching
metadata/XMP). Kahuna has the same false-negative risk — the server field relies
on the same keyword scan. The XMP flag path reduces false-negatives for images
with the proper metadata flag set at ingest time.

### 26. `is:deleted` search bypasses per-user deletion permission restriction

**What:** When a user searches `is:deleted` in Kupua, all soft-deleted images are
returned regardless of who deleted them or whether the user has `DeleteImagePermission`.

**Kahuna/media-api behaviour:** `MediaApi.scala` applies a `canViewDeletedImages`
restriction: users without `DeleteImagePermission` have `uploadedBy` forced to their
own identity, so they only see images they personally deleted. Users with
`DeleteImagePermission` see all deleted images.

**Kupua:** Queries ES directly. The `buildQuery()` function has no concept of the
current user's identity or roles. The `is:deleted` CQL clause translates correctly to
`{ exists: { field: "softDeletedMetadata" } }` (verified in `cql.test.ts`) and
returns all deleted images from all uploaders.

**Why acceptable for now:** Kupua is not yet user-facing. All dev and test access is
unrestricted by design.

**Migration path:** When Kupua serves real users, the `/api` proxy (media-api) can
enforce the same `uploadedBy` gate server-side before queries reach ES. No code
change to `buildQuery()` needed — the restriction is purely an API-layer concern.

### 27. `auth.async(parse.json)` body-parser combinator in `MediaApi.scala`

**What:** The `POST /images/search-after` endpoint uses `auth.async(parse.json)` to
parse the request body as JSON. All other read actions in `MediaApi.scala` use
`auth.async` (no body parser) and access the body manually via
`request.body.asJson`.

**Why:** `POST /images/search-after` is the first read endpoint in media-api to
accept a request body. The standard Play body-parser combinator is cleaner here
than the manual `asJson` pattern: it returns a `400 Bad Request` automatically if
the `Content-Type` is not `application/json`, rather than silently returning `None`.

**Trade-off:** Establishes a new convention in a file that didn't have one before.
Future body-carrying read endpoints should use the same `auth.async(parse.json)`
pattern for consistency. `media-api-conventions.md` should be updated if more
body-carrying endpoints are added.

### 28. Vite proxy spoofs `Origin` header to `media.local.dev-gutools.co.uk`

**What:** `vite.config.ts` overrides the `Origin` header to
`media.local.dev-gutools.co.uk` for all requests proxied to local media-api (port
9001). Kupua's own local origin (`kupua.media.local.dev-gutools.co.uk`) is not in
media-api's default `corsAllowedDomains` list, so requests from kupua were rejected
with CORS 403s.

**Why:** Adding kupua's origin to `corsAllowedDomains` requires a config change
that would need to be replicated across dev/TEST/CODE/PROD. Spoofing the Origin in
the Vite proxy (which is dev-only by construction) is simpler and doesn't touch
media-api config.

**Scope:** Dev only — `vite.config.ts` is never shipped. The Origin spoof only
applies to the Vite proxy (`/api` target), not to production requests. In
TEST/CODE/PROD, kupua runs behind the standard nginx reverse proxy setup which
handles CORS at the CDN/load-balancer layer.

**Trade-off:** Could mask CORS configuration issues in dev if media-api's allowed
domains list changes. If kupua gains its own nginx config, the Origin spoof should
be removed and kupua's domain added to `corsAllowedDomains` properly.

---

### Permission assumptions — consolidated reference

Kupua has no auth context (direct-to-ES, no current-user identity). All permission
gates are hardcoded to assume the most permissive state matching the real-world
audience (authenticated Guardian editorial staff). The table below documents each
assumption for when permissions are wired up.

| Location | Permission / check | Assumed | Kahuna reality | Migration note |
|---|---|---|---|---|
| `es-adapter.ts` `buildQuery()` | `canViewDeletedImages` (`is:deleted` results) | **ON** — all users see all deleted images | OFF unless `DeleteImagePermission` or `uploadedBy == self` | Add `uploadedBy` filter from current-user identity, or delegate to `/api` proxy |
| `validity-map.ts` `hasWritePermission` | `has_write_permission` (overrides paid_image, no_rights, over_quota, current_deny_lease, conditional_paid) | **ON** — all checks show as warnings not blockers | ON only for `EditMetadata` users | Replace `const hasWritePermission = true` with `currentUser.hasPermission("EditMetadata")` — full `shouldOverride` logic is already in place |
| `validity-map.ts` `tass_agency_image` | N/A — always `shouldOverride: true` in Scala too | Matches Scala — not a Kupua deviation | Same | No change needed |
| `validity-map.ts` `paid_image` | Whether pay-image warning is shown | **ON** — wired to `calculateCost() === "pay"` | Same in Kahuna | No change needed once write-perm is wired (warning not blocker) |
| `grid-config.ts` `showDenySyndicationWarning` | Whether deny-syndication banner shows | **ON** | Operator config flag | Read from runtime config endpoint |
| `grid-config.ts` `syndicationStartDate` | Syndication review queue cutoff | **null** (TEST/CODE behaviour) | PROD has a date cutoff | Read from runtime config endpoint |

---

## From library defaults / conventions

> **Browser & CSS workarounds index** — fights with browsers, the web
> platform, and CSS that required overrides, hacks, or non-obvious
> patterns.  Each item lives in context with the feature it supports;
> this index exists for discoverability.
>
> | Workaround | Where | Why |
> |---|---|---|
> | `contain: strict` on scroll containers | `index.css` `.hide-scrollbar` / `.hide-scrollbar-y` | Firefox recalculates layout for the entire page on every virtualizer repositioning without it |
> | `scrollbar-width: none` + `::-webkit-scrollbar { display: none }` | `index.css` | No CSS way to hide only the vertical scrollbar cross-browser; hide both, add a proxy `<div>` for horizontal — see §19 (Grid/Kahuna), §9 below |
> | Horizontal scrollbar proxy `<div>` with bidirectional `scrollLeft` sync | `ImageTable.tsx` | The only cross-browser way to show h-scroll while hiding v-scroll (Chrome 121+ `scrollbar-width` kills the `::-webkit-scrollbar` pseudo-element axis model) |
> | `opacity-0 + pointer-events-none` instead of `display: none` for hidden search UI | `search.tsx` | `display: none` resets `scrollTop` to 0; opacity keeps scroll position intact |
> | Synthetic `scroll` event after programmatic `scrollTop = 0` | `scroll-reset.ts`, `ImageTable.tsx` | Programmatic `scrollTop` changes on hidden (`opacity-0`) containers don't always fire native scroll events; virtualizer needs the event |
> | Synthetic `mousemove` / `mouseup` with scroll-adjusted `clientX` during column resize drag | `ImageTable.tsx` resize handle | TanStack Table's `getResizeHandler()` has no scroll awareness; cursor stays still in viewport space while container scrolls — see §8 below |
> | Capture-phase `mouseup` blocker after resize drag with scroll | `ImageTable.tsx` resize handle | Real browser `mouseup` carries unadjusted `clientX`; must be blocked so only the synthetic (adjusted) event reaches TanStack — see §8 below |
> | `inline-block` / `inline-flex` layout instead of JS-computed widths | `ImageTable.tsx` table root + header | Browser rounds each cell's pixel width independently at non-100% zoom; JS sum diverges from rendered total — see §9 below |
> | CSS custom properties (`--col-<id>`) via `dangerouslySetInnerHTML` `<style>` tag | `ImageTable.tsx` | Avoids 300+ `getSize()` calls per render; browser applies widths via CSS — see §10 below |
> | Single-value CSS padding in CQL theme (not shorthand) | `CqlSearchInput.tsx` | Multi-value shorthand (e.g. `"2px 6px"`) breaks `calc()` inside the `@guardian/cql` shadow DOM |
> | Capture-phase `document` listener for Home/End keys | `keyboard-shortcuts.ts`, `ImageTable.tsx` | ProseMirror inside the CQL web component's shadow DOM swallows Home/End before bubble-phase handlers fire — see §7 below |
> | `customElements.define()` one-shot guard with module-level flag | `CqlSearchInput.tsx` | Browser API is one-shot — cannot re-register an element name — see §6 below |
> | `requestAnimationFrame` for post-seek focus | `ImageTable.tsx` scroll-reset | Ensures the CQL input focus happens after the browser has flushed layout from the `scrollTop` change |
> | `useLayoutEffect` for backward/forward extend scroll compensation | `ImageTable.tsx` | Must adjust `scrollTop` before paint to prevent one-frame content shift; `useEffect` would flicker — see §23 (Grid/Kahuna) |
> | `setPointerCapture` on resize handles and Scrubber thumb | `ImageTable.tsx`, `Scrubber.tsx` | Without capture, pointer events stop when cursor leaves the element during drag (especially fast drags that exit the window) |

### 1. Custom `parseSearch` / `stringifySearch` bypassing TanStack Router's built-in helpers

**What:** `router.ts` defines `plainParseSearch` and `plainStringifySearch`
using `URLSearchParams` directly, instead of using TanStack Router's
`parseSearchWith` / `stringifySearchWith` helpers.

**Why:** Two interacting problems in the built-in pipeline:

1. `parseSearchWith` delegates to `qss.decode`, whose `toValue` function
   converts `"true"` → `boolean true` and `"123"` → `number 123`.  Our
   Zod schema declares every param as `z.string().optional()`, so
   non-string values silently hit `.catch(undefined)` and are lost.  This
   made the `nonFree` checkbox permanently stuck.

2. The default `stringifySearchWith` uses `JSON.stringify`, wrapping string
   values in quotes: `"true"` → `'"true"'` → URL-encoded as
   `%22true%22`.  Grid URLs use bare `key=value` pairs.

**Trade-off:** We lose automatic type coercion (numbers, booleans, nested
objects in search params).  This is fine because all our search params are
plain strings per the Zod schema.  If a future param needs a non-string
type, the custom serialiser will need updating.

### 2. One-time default injection in `useUrlSearchSync`

**What:** The sync hook checks on first mount whether the URL has zero
search params.  If so, it navigates to `/search?nonFree=true` (a `replace`
navigation) before proceeding with the normal sync cycle.

**Why:** The user wanted the default landing URL to explicitly show
`nonFree=true`, but TanStack Router's Zod validation can't add defaults
to the *URL bar* (only to the parsed object).  Using `z.default("true")`
would make it impossible to represent the "free only" state (absent
`nonFree`) because Zod would always fill it back in.

**Trade-off:** A `useRef` flag (`hasAppliedDefaults`) prevents re-injection
after user interaction, but it means the default-injection logic is a
special case in the sync hook rather than declarative config.  The
`DEFAULT_SEARCH` constant is the single place to change if defaults evolve.

### 3. ~~`useSearch({ from: "/" })` hard-coded route path~~ — RESOLVED

All `useSearch` calls now use `from: "/search"` and `Link` components use
`to: "/search"`, matching the search route introduced in Grid/Kahuna §2.
The mechanical find-and-replace predicted by this deviation has been done.

### 4. All search params are `z.string().optional().catch(undefined)`

**What:** The Zod schema types every URL param as `string | undefined`,
even params like `nonFree` that are logically boolean.

**Why:** URL search params are inherently strings.  Using `z.boolean()`
or `z.coerce.boolean()` would fight with our custom plain-string parser
(which deliberately keeps everything as strings — see §1 above).  Keeping
them as strings avoids a second layer of coercion and makes the
parse→validate→use pipeline trivial.

**Trade-off:** Comparisons in business logic use string equality
(`params.nonFree === "true"`) rather than truthiness checks.  This is
slightly less ergonomic but completely explicit.

### 5. Store default `nonFree: "true"` is only cosmetic

**What:** The Zustand store's initial `params` includes
`nonFree: "true"`, but this value is immediately overwritten by the
URL-sync hook on mount.

**Why:** It exists so that if the store is ever read before the first sync
cycle completes (e.g. during SSR or a race), the default matches the
intended "show all" behaviour.  In practice it is always overwritten.

**Trade-off:** The store default and the `DEFAULT_SEARCH` constant in the
sync hook must stay in agreement.  There is no single source of truth for
"what is the default state" — it's split between the store initialiser and
the hook.

### 6. `<cql-input>` Web Component registered once with baked-in typeahead

**What:** `CqlSearchInput.tsx` calls `createCqlInput(typeahead, …)` and
`customElements.define("cql-input", …)` once, guarded by a module-level
`let registered` flag.  The `useEffect` that creates the DOM element has
`[]` deps, so it runs only on mount.

**Why:** `customElements.define()` is a one-shot browser API — you cannot
re-register an element name.  The `@guardian/cql` library bakes the
typeahead configuration into the class at creation time.

**Trade-off:** If the `dataSource` changes (e.g. a future DAL swap from
ES adapter to Grid API), the typeahead resolvers that were captured at
registration time become stale.  A page reload is required to pick up a
new DAL.  The `useMemo` in the component recalculates the `typeahead`
object when `dataSource` changes, but the registered custom element class
doesn't see it.

Possible fix: instead of re-registering the element, create a new
element instance with a different tag name, or use Shadow DOM scoping.
This can be addressed if/when the DAL actually swaps.

### 7. Two-phase keyboard handling for Home/End vs arrows

**What:** `ImageTable.tsx` registers two `document` keydown listeners:
a **bubble-phase** handler for arrows and PageUp/PageDown, and a
**capture-phase** handler for Home/End.

**Why:** The CQL search input uses `@guardian/cql`'s `<cql-input>` Web
Component, which contains a ProseMirror editor inside shadow DOM.
Arrow and Page keys are listed in `keysToPropagate` inside
`CqlSearchInput.tsx`, so they bubble out of the custom element
normally and reach the bubble-phase handler.  Home/End are NOT in
`keysToPropagate` — the CQL input's `stopUnhandled` listener would
swallow them.  But even if we propagated them, ProseMirror would have
already moved the cursor before our bubble-phase handler fires.

Using capture phase on `document` lets us intercept Home/End *before*
the event reaches the shadow DOM.  `preventDefault()` then stops
ProseMirror from also handling the key.

This matches kahuna's behaviour, where angular-hotkeys fires at the
`document` level before the `gr-chips` contenteditable processes the
event.  In kahuna, Home/End do NOT have `allowIn: ['INPUT']`, but
`gr-chips` isn't a native `<input>`, so angular-hotkeys doesn't
suppress them.

**Trade-off:** Home/End *never* move the cursor inside the search box.
Users must use mouse clicks or arrow keys to navigate within their
query text.  This is the same trade-off kahuna makes.

### 8. Column resize with auto-scroll via synthetic mouse events

**What:** When dragging a column resize handle to the edge of the scroll
container, the table auto-scrolls and the column keeps resizing.  This is
implemented by dispatching synthetic `mousemove` events on `document`
with a scroll-adjusted `clientX`.  On release, a synthetic `mouseup` with
the adjusted position is dispatched first, and the real browser `mouseup`
(with unadjusted `clientX`) is blocked via a capture-phase listener.

**Why:** TanStack Table's `getResizeHandler()` listens for `mousemove`
and `mouseup` on `document` and computes the column width delta from
`clientX - startOffset`.  It has no concept of scroll.  When the
container scrolls during a drag, `clientX` stays constant (the cursor
hasn't moved in viewport space), so TanStack stops resizing.  Synthesizing
events with `clientX + scrollDelta` makes TanStack see the cursor
"moving" by the scroll amount.

**Trade-off:** We're reaching around TanStack Table's public API by
dispatching synthetic DOM events.  This is fragile — if TanStack changes
its internal event handling (e.g. switches from `mousemove` to
`pointermove`), the synthetic events would stop working.  An alternative
would be to bypass `getResizeHandler()` entirely and call
`table.setColumnSizing()` directly, but that would duplicate the resize
delta math.

### 9. Horizontal scroll uses inline-block/inline-flex, not JS-computed widths

**What:** The table's scroll layout uses `inline-block` (wrapper) and
`inline-flex` (header) so the browser determines the scrollable width
from the rendered content.  No JS-computed width (e.g. `getTotalSize()`)
is used.

**Why:** At non-100% browser zoom, the browser rounds each cell's pixel
width independently.  A JS-computed sum (e.g. `getTotalSize()`) can
differ from the actual rendered total by several pixels, causing the last
column to be clipped.  By letting the browser determine the width from
the actual rendered cells, the scroll range is always correct at any zoom.

A 32px trailing spacer after the last header cell ensures the last
column's resize handle is accessible and content isn't flush against the
table edge.

**Trade-off:** The wrapper's width depends on in-flow content only (the
header).  Absolutely positioned rows don't contribute to it — they use
`left: 0; right: 0` to stretch to the wrapper width.  If a row somehow
had wider content than the header (shouldn't happen since they share
column definitions), it would be clipped.

### 10. CSS-variable column widths instead of per-cell `getSize()` calls

**What:** Column widths are set via CSS custom properties (`--col-<id>`)
injected in a `<style>` tag on `[data-table-root]`, instead of calling
`header.getSize()` / `cell.column.getSize()` inline on each cell.

**Why:** With 16 visible columns and ~30 visible rows (plus overscan),
the per-cell approach calls `getSize()` 300+ times per render.  Each call
walks TanStack Table's state tree.  The CSS-variable approach calls
`buildColumnSizeVars()` once per render to build a CSS string, and the
browser applies the variable values to all cells via CSS — no JS per cell.
This is the pattern used in TanStack's official "performant
column-resizing" example.

**Trade-off:** Column widths are no longer directly readable from the
DOM's `style.width` (they show `var(--col-…)` instead of a pixel value).
DevTools' Computed panel still shows the resolved pixel value.  The
`<style>` tag uses `dangerouslySetInnerHTML` — safe here because the
content is fully controlled (column IDs + pixel numbers, no user input).

### 11. Memoised table body freezes during resize drag

**What:** The virtualised body is extracted into a `React.memo` component
(`TableBody`).  During a column resize drag (while
`columnSizingInfo.isResizingColumn` is truthy), the `rows` and
`virtualItems` arrays are cached in refs and not updated, keeping the
memo's props reference-stable and preventing body re-renders.

**Why:** TanStack Table updates `columnSizingInfo` on every `mousemove`
during a resize drag, which re-renders the parent component.  Without
memoisation, every frame would re-render hundreds of row/cell elements.
Since column widths are driven by CSS variables (§10 above), the body
cells pick up new widths from CSS without React touching them.  This
matches the pattern in TanStack's official performant example but avoids
the bug in that example (#6121) where the memo comparison function
incorrectly referenced stale state.

**Trade-off:** If new data arrives (e.g. `loadMore()`) during a resize
drag, the body won't show the new rows until the drag ends and
`isResizingColumn` becomes falsy.  In practice, users don't scroll to
the bottom while dragging a column resize handle, so this is invisible.

### 12. `LazyTypeahead` — decoupled key/value resolution in CQL typeahead

**What:** `lazy-typeahead.ts` defines `LazyTypeahead`, a subclass of
`@guardian/cql`'s `Typeahead` that overrides `getSuggestions()` to
decouple key suggestions from value resolution.  Used in
`CqlSearchInput.tsx` as a drop-in replacement.

**Why:** CQL's built-in `Typeahead.suggestCqlField()` fires key
suggestions and value resolvers in parallel via `Promise.all`.  This
means typing `+by` (no colon yet) immediately fires the `by` field's
value resolver — an ES aggregation query — even though the user is still
choosing a field name.  If the resolver is slow, fails, or hits an
unaggregatable field, the *entire* popover stalls in a "pending" state
(animated gradient) because `Promise.all` blocks on the slowest promise.
Key suggestions (instant, synchronous field-name matching) are ready
immediately but can't render until the value promise resolves.

`LazyTypeahead.suggestField()` separates key and value resolution:
- Key suggestions are always returned immediately (synchronous filter).
- Value resolvers are only fired when the parser has produced a
  `CqlField` node (i.e. the user has typed `:` or started a chip).
  When `CqlField.value` is undefined (colon typed, nothing after it),
  the resolver fires with `""` — matching the original Typeahead's
  behaviour of showing all values on `:`.

This matches Grid/kahuna's sequential UX: pick a field, *then* see value
suggestions — without the popover stalling.

**Trade-off:** We duplicate ~80 lines of suggestion-assembly logic that
already exists in the parent class's private methods (`suggestCqlField`,
`suggestFieldKey`, `suggestFieldValue`), plus inline a small AST-walking
utility (`getCqlFieldsFromBinary`) and infer the `TypeaheadSuggestion`
type from the parent's return type — both because `@guardian/cql` doesn't
expose them via its package entry point.  We also stash a second copy of
the fields array (`_fields`, `_fieldOptions`) because the parent's are
private.  If `@guardian/cql` changes its AST shape or suggestion types,
our override may break.

**Upstream fix:** The eager evaluation is a library design issue.  The
fix belongs in `Typeahead.suggestCqlField()` in `@guardian/cql` — don't
fire value resolvers via `Promise.all` with key suggestions; return key
suggestions immediately and resolve values independently.  An issue / PR
should be opened on `@guardian/cql` with this fix.  Once merged,
`LazyTypeahead` can be deleted and replaced with the stock `Typeahead`.

### 13. Click-to-search flips polarity instead of adding duplicates

**What:** When the user shift-clicks a table cell to add `+key:value` and
then alt-clicks the same value, kupua flips the existing chip's polarity
to `-key:value` instead of appending a second chip.  Conversely, alt-click
then shift-click on the same value flips it back.  If the chip already has
the desired polarity, the click is a no-op.

Kahuna's click-to-search (in its AngularJS `gr-chips` directive) simply
appends a new chip each time, which can produce nonsensical queries like
`+credit:Getty -credit:Getty`.

**How:** `src/lib/cql-query-edit.ts` exports `findFieldTerm()` and
`upsertFieldTerm()`.  `findFieldTerm` uses `@guardian/cql`'s parser to
walk the CQL AST and structurally match a field term by key + value
(case-insensitive), returning token positions (`start`/`end`) and polarity.
`upsertFieldTerm` uses this to either append (not present), no-op (same
polarity), or splice-replace (opposite polarity) — using exact character
offsets from the AST tokens, not string `.includes()`.

**~~CQL editor remount workaround~~ — RESOLVED (@guardian/cql 1.8.6):**
Previously, when `handleCellClick` updated the query externally (bypassing
the CQL editor), the `<cql-input>` web component's `attributeChangedCallback`
didn't reliably re-render chips when only polarity changed — its vendored
ProseMirror diff (`findDiffStartForContent` / `findDiffEndForContent`)
compared child nodes by content only, ignoring the `POLARITY` node
attribute.  The workaround forced a full remount of `<CqlSearchInput>` via
a generation-counter `key` bump inside `cancelSearchDebounce()`.

[PR #121](https://github.com/guardian/cql/pull/121) fixed this upstream by
introducing `sameContentMarkup`, a targeted comparison that restores
sensitivity to semantic attribute changes (`POLARITY`) while still skipping
transient ones (`IS_SELECTED`, `IS_READ_ONLY` — the #52 fix). Released in
1.8.6. Kupua bumped `@guardian/cql` to `^1.8.6` and removed the
generation-bump from `cancelSearchDebounce()` — cell/metadata clicks now
rely on plain `setAttribute("value", ...)`, no remount.

The generation-counter mechanism itself (`_cqlInputGeneration`,
`getCqlInputGeneration()`) is **not** deleted — it's kept for a separate,
unrelated need and renamed-in-spirit to `resetCqlInputComponents()`: Home
logo / Clear-button resets still force a remount to wipe partial/ghost
chip state that lives only in ProseMirror's internal document (e.g. an
in-progress `colourModel:` chip with no value typed yet) and isn't cleared
by `setAttribute("value", "")` alone. That is a different bug, not
addressed by PR #121, so the remount stays for those two call sites only.

`cancelSearchDebounce()` still clears any pending debounce timer from the
CQL editor's `queryChange` → `handleQueryChange` flow, and records the
externally-set query in `_externalQuery`.  The debounce callback checks
this at fire time and skips if its captured `queryStr` differs from
`_externalQuery` — a belt-and-suspenders guard against stale timers
reverting the URL.  This part is unrelated to the remount and still applies
to every external-update caller.


### 14. Typeahead resolver strips own field from query via regex (workaround for missing CQL context)

**What:** When the user edits a chip value (e.g. clears `credit:John Smith`
to re-pick a different credit), the typeahead resolver needs aggregations
that exclude the chip's own filter — otherwise the results are
self-referential (only "John Smith" is returned). CQL's resolver API is
`(value: string) => Suggestion[]` — it provides no context about which
chip is being edited or what the query looks like without it.

**Workaround:** `stripFieldFromQuery()` and `queryContainsField()` in
`typeahead-fields.ts` use regex to detect and remove chip expressions
(e.g. `credit:"John Smith"`) from the serialised query string before
passing it to ES for aggregations. This is fragile string manipulation
of a structured language.

**Why it's a hack:** CQL already has the ProseMirror document state and
knows exactly which chip the user is editing. It could trivially serialize
"everything except the chip at cursor" and pass it to the resolver. Regex
parsing duplicates (badly) what CQL's own parser already does.

**Upstream fix:** Extend the resolver callback signature:
```typescript
// Current:  resolver(value: string) => Suggestion[]
// Proposed: resolver(value: string, context: ResolverContext) => Suggestion[]
// where ResolverContext = { fieldName: string; queryWithoutCurrentChip: string }
```
Backward-compatible — existing resolvers that don't use the second arg
are unaffected. Once available, `stripFieldFromQuery` and
`queryContainsField` can be deleted and `scopedAgg` can use
`context.queryWithoutCurrentChip` directly.

**Broader pattern — CQL treats consumers as text-in/text-out:**

| Problem | Kupua workaround | Upstream fix | Status |
|---|---|---|---|
| Polarity change not re-rendering | ~~Remount component (§13)~~ | Fix internal diff (`sameContentMarkup`) | **Fixed in 1.8.6** ([#121](https://github.com/guardian/cql/pull/121)) |
| Resolver gets self-referential aggs | Regex-strip field from query (this §) | Resolver receives `ResolverContext` | Not filed |
| `+`/`-` not triggering on mobile | — | Add `handleTextInput` fallback | PR #125 open |
| Popover dead space below suggestions | — | `pointer-events: none` on container | PR #126 open |
| Blur resets caret to position 0 | Capture-phase blur + microtask restore (§19 lib) | `preserveCaretOnBlur` option | Not filed |
| Eager `Promise.all` stalls popover | `LazyTypeahead` override (§12 lib) | Decouple key/value resolution in `suggestCqlField` | Not filed |
| Mobile keyboard dismiss on chip delete | `focusout` + `recentKeyAction` refocus | Shift focus to stable node before chip removal | Not filed |
| `setAttribute` clobbers in-progress chip | `selfCausedChangeRef` guard | Smarter internal reconciliation (ignore attr if matches effective state) | Not filed |
| No `::part` / theme key for internal elements | Style injection into `shadowRoot` | Expose CSS parts or extend theme schema | Not filed |
| Home/End swallowed by shadow DOM | Capture-phase `document` listener (§7 lib) | Propagate nav keys from `stopUnhandled` | Architectural |
| Multi-value padding breaks `calc()` in shadow DOM | Single-value padding only | Use `padding-*` longhand internally | Not filed |
| Stale debounce after remount | `setExternalQuery` latch | — (was a consequence of §13's remount) | Still needed for the Home/Clear remount case (§13); the polarity-flip remount it originally guarded is gone |
| No API to extract a chip's value or reconstruct the query without a specific chip | Regex on raw query string (typeahead `stripFieldFromQuery`) | Expose `getChipValue(field)` + `queryWithoutChip(field)` on `<cql-input>` element | Not filed |

Three consumers exist (kahuna, kupua, CQL demo page). Exposing minimal
structured context is not speculative API surface.

**Concrete consequence — DateFilter cannot support "Last used" via chips:**
The DateFilter panel reflects its three active date fields via dedicated URL params
(`since`/`until`, `takenSince`/`takenUntil`, `modifiedSince`/`modifiedUntil`),
which round-trip cleanly. Adding "Last used" as a fourth option could write
`usages@>added:...` / `usages@<added:...` chips into `params.query` — but
DateFilter would then need to read those chips back to show active state.
Without `getChipValue` / `queryWithoutChip`, the only option is regex on the raw
string, which creates a two-class system and is fragile. Decision (2026-06-08):
use dedicated params (`usagesAddedSince`/`usagesAddedUntil`) if/when this is built;
for now the `usages@>added` / `usages@<added` CQL chips already work and cover
the need without DateFilter integration.

### 17. No migration-aware dual-index search

During a Grid index migration (`ThrallMigrationClient`), the `media-api`
queries both the current index AND the migration index simultaneously,
with a filter excluding already-migrated docs from the current index.
This ensures users see each image exactly once — either from the old
index (not yet migrated) or the new index (already migrated).

Kupua queries ES directly via the `images` alias (which resolves to the
current index only). During migration, kupua does NOT query the migration
index. This means:

- Images already migrated to the new index may show slightly stale data
  (the current index copy hasn't been updated — the migration writes to
  the new index, not updates the current one).
- After migration completion (alias swap), kupua's PIT still references
  the old physical index until the next PIT refresh (≤10 minutes) or
  re-search.

**Why this is acceptable:** Migrations are rare (~a few times per year),
take hours, and the data difference between old and new index for any
given image is minimal (migration re-indexes the same data with a new
mapping, not new content). After the alias swap, the PIT refresh timer
handles the transition within 10 minutes. This is no worse than kahuna
for users who were mid-scroll during migration.

**When this goes away:** Phase 3 (`GridApiDataSource`) would inherit
media-api's migration-aware dual-index search automatically.

See `search-after-plan.md` → "PIT and Grid's index migration" for the
full analysis.

### 18. Tiebreaker sort uses `id` field, not `_id` meta field

The Elasticsearch documentation recommends `_id` as the tiebreaker for
`search_after` pagination. However, ES 8.x disables fielddata on `_id`
by default (`indices.id_field_data.enabled = false`). Sorting by `_id`
fails with "Fielddata access on the _id field is disallowed."

Grid's mapping includes a top-level `id` field (type `keyword`) that
contains the same value as `_id`. We use `{ id: "asc" }` as the
tiebreaker instead. This is functionally identical — `id` is unique per
document and keyword-typed (efficient for sorting) — but departs from
the standard ES `search_after` examples.

**Why not enable fielddata?** It's a cluster-level setting that affects
all indices. Changing it on shared clusters (TEST/PROD) is unnecessary
risk for zero benefit, since the `id` keyword field works perfectly.

**Trade-off:** None meaningful. The `id` field is always present in Grid
documents and always equals `_id`.

### 19. Native scrollbar hidden — Scrubber is the sole scroll control

The search-after-plan.md (line ~990-999) explicitly says to keep the
native scrollbar visible alongside the custom Scrubber in Phase 2, with
hiding deferred to Phase 6. We departed from this during implementation.

**Why:** The dual-scrollbar UX was actively confusing:
- After a deep seek, the native scrollbar sits at the top of a 200-item
  buffer. Users can't scroll "up" because the buffer starts there. The
  two scrollbars represent different ranges (200 items vs 1.3M) with no
  visual distinction.
- When the Scrubber hid for small result sets (total ≤ 0), the
  content area shifted horizontally by 12px (the Scrubber's width).
- After seeking to position 0, the native scrollbar might not be at top,
  requiring the user to manually scroll a second control.

**What we did:** Applied `.hide-scrollbar` (CSS `scrollbar-width: none` +
`::-webkit-scrollbar { display: none }`) to the table/grid scroll
containers. The Scrubber is always rendered — when total ≤ 0, it shows a
disabled empty track (opacity 0.15) to prevent layout shifts. When
total > 0, it operates in two modes:
- **Scroll mode** (total ≤ buffer): directly scrolls the content
  container via `scrollTop` manipulation. No seek.
- **Seek mode** (total > buffer): triggers `seek()` to reposition the
  windowed buffer.

Wheel/trackpad scrolling still works normally (the container is
`overflow: auto` — only the visual scrollbar is hidden). The virtualizer
functions as before.

**Trade-off:** We lose the native scrollbar's momentum/inertia physics
on the Scrubber itself. But wheel/trackpad scrolling retains native
physics (the browser handles it). Only click-to-position and drag are
custom — and those don't need momentum.

### 20. Scrubber drag is purely linear seeking, not fine-grained browsing

`scrubber-nonlinear-research.md` analysed two approaches for making drag
handle both fine browsing and fast seeking:

- **Approach A (position mapping, k=2 power curve):** Thumb stays under
  cursor. Dealbreaker: thumb snaps back on release because non-linear Y ≠
  linear(position/total).
- **Approach B (velocity-based delta accumulation):** No snap-back, but
  position races ahead of visual scroll (in-buffer browsing fails) OR
  can't reach distant positions (low gain).

After implementing and testing both, **we reverted to simple linear drag
with deferred seek.** The scrubber is a seeking tool: drag = teleport to
any position (thumb follows cursor linearly, one seek on pointer up).
Fine-grained browsing uses wheel/trackpad (native scroll physics, always
worked). This matches every real-world scrubber — Google Photos, Lightroom,
YouTube, Spotify — all use linear drag for seeking.

**Key improvement over the original linear drag:** No seeks fire during
drag. Only the thumb and tooltip move. One single seek on pointer up.
This eliminates the cascading seeks that caused "forever flashing."

**Trade-off:** 1px of drag ≈ 1,600 items on TEST, ≈ 11,000 on PROD.
You can't fine-browse via drag. But wheel/trackpad covers that.

### 21. Backward extend uses reverse `search_after`, not `from/size`

Kahuna's `gu-lazy-table` loads backward pages via `from/size` with a
computed offset. Kupua originally did the same, but `from/size` is
capped at `max_result_window` (101k on PROD, 10k local). After a deep
seek (e.g. scrubber drag to position 500k), backward scrolling silently
failed.

Kupua now uses **reverse `search_after`**: flip every sort field's
direction (asc↔desc), use `startCursor` as the `search_after` anchor,
fetch the page, then reverse the returned hits. This has no depth limit.

`reverseSortClause()` is exported from `es-adapter.ts`. The `searchAfter()`
DAL method accepts a `reverse: boolean` parameter. The reversal happens
inside the adapter — callers see hits in the correct (forward) order.

**Trade-off:** Reverse `search_after` requires `startCursor` to be valid.
After eviction (forward extend evicts from start, invalidating
`startCursor`), backward extend is blocked until the next seek or search
provides a fresh cursor. This is the same behaviour as forward extend
when `endCursor` is invalidated — consistent.

### 22. Sort-around-focus uses direct searchAfter, not generic seek

Kahuna doesn't have sort-around-focus — re-sorting always resets to the
top. Kupua implements the "Never Lost" pattern: on sort-only changes,
the initial search shows results immediately at position 0, then an
async background process finds the focused image's new position and
navigates to it.

The async flow is: fetch image by ID → get sort values via
`searchAfter({ids: imageId})` → `countBefore()` → if in buffer, focus;
if outside, **directly populate the buffer** using the image's exact sort
values as `searchAfter` cursors (forward + backward pages centered on the
image). This guarantees the image is in the resulting buffer.

The previous approach used generic `seek(offset)`, which for deep positions
(>10k) employed percentile estimation + `search_after`. Percentile
estimation is imprecise — the image could land outside the resulting
buffer. The new approach bypasses estimation entirely by using the
image's own sort values as cursors.

Status indicator ("Finding image…" / "Seeking…") appears in the
StatusBar. If anything fails (image not in results, network error,
abort), gracefully degrades to staying at the top.

**Trade-off:** There's a brief moment where the user sees results at
position 0 before the view jumps to the focused image's new position.
This is by design — showing stale data while computing is better than
blocking. Google Photos does the same (shows results, then animates to
the anchor). The alternative (blocking until position is found) would
freeze the UI for 100-300ms.

### 23. Backward extend scroll compensation via useLayoutEffect

When `extendBackward` prepends items to the buffer, the virtualizer count
grows but `scrollTop` doesn't change. The visible content shifts down —
the user suddenly sees different images. Without compensation, this
triggers another `extendBackward` (the shifted viewport still shows
near-start indices), creating a cascade of backward extends that causes
"flashing random pages."

Kupua tracks `_lastPrependCount` and `_prependGeneration` in the store.
Both ImageTable and ImageGrid watch these via `useLayoutEffect` and adjust
`scrollTop` by `prependCount * ROW_HEIGHT` (table) or
`ceil(prependCount / columns) * ROW_HEIGHT` (grid) before paint.

Kahuna's `gu-lazy-table` doesn't have this problem because it uses
`from/size` pagination where the virtualizer row count is always
`total` (not buffer length) — prepending data doesn't change the count.

**Trade-off:** `useLayoutEffect` blocks paint, adding a tiny synchronous
delay. In practice this is <1ms (a single scrollTop write). The
alternative (`useEffect`, after paint) would show one frame of content
shift — a visible flicker.

### 24. Scrubber sort label interpolates dates for out-of-buffer positions

During a scrubber drag, the thumb position maps to a global position that
may be far outside the loaded buffer. Kupua's `interpolateSortLabel()`
linearly extrapolates date values from the first and last buffer entries:

```
msPerPosition = (lastDate - firstDate) / (bufferLength - 1)
estimatedDate = firstDate + msPerPosition * (globalPosition - bufferOffset)
```

For keyword sorts, the nearest buffer edge value is shown (no
interpolation possible for text).

This differs from both kahuna (which doesn't have a scrubber) and from
the original kupua implementation (which clamped to buffer bounds,
showing a static date).

**Trade-off:** The extrapolated date is approximate — it assumes uniform
distribution of the sort field across the result set. In practice, upload
dates cluster around business hours and events, so the estimate may be
off by hours or days at the extremes. This is acceptable for scrubber
orientation (the user needs "am I in 2024 or 2020?", not "which hour?").
The position counter ("650,000 of 1,300,000") remains exact.



### 25. PIT fallback: retry without PIT on 404/410

When `searchAfter()` is called with a PIT ID and ES returns 404 or 410
(PIT expired or closed), kupua retries the same request without a PIT —
querying the index directly instead.

This is needed because `seek()` can read a stale PIT from the store
that was already closed by a concurrent `search()` (e.g. when a sort
change triggers both a new search and a scrubber seek in quick
succession). The old PIT is closed before the new one is stored.

Elasticsearch's PIT documentation says results should always use the
same PIT for consistency. Kupua intentionally breaks this — the retry
uses a non-PIT search, which means the results reflect the current
index state rather than a frozen snapshot.

**Trade-off:** A concurrent index update between the PIT-based search
and the fallback retry could cause a minor position inconsistency (a
document appearing or disappearing). In practice this is invisible:
(1) kupua is read-only — it never mutates the index; (2) the retry
only fires during seek(), which replaces the entire buffer anyway;
(3) the alternative (failing the seek entirely, leaving the user
staring at stale data) is worse. The fallback is logged as a console
warning for diagnostics.

### 26. Sort-around-focus uses ratio preservation, not centre alignment

When the user changes sort order with a focused image, kupua's
sort-around-focus finds the image at its new position and scrolls to it.
TanStack Virtual's `scrollToIndex(idx, { align: "center" })` would be
the obvious choice — but it always places the item dead-centre,
regardless of where it was before the sort.

Kupua instead captures the focused item's **viewport ratio** (0 = top,
1 = bottom) before the sort change, and restores it after the image is
found at its new position. This is the same "Never Lost" ratio
preservation used for density switches.

**Implementation:** `sort-focus.ts` (same module-level bridge pattern as
`density-focus.ts`). The scroll-reset `useLayoutEffect` captures the
ratio at the sort-only skip point; the `sortAroundFocusGeneration`
effect consumes it. Falls back to `align: "start"` if no ratio was saved.

**Trade-off:** Centre alignment is predictable; ratio preservation can
place the item near the edge of the viewport if it was near the edge
before the sort. Edge clamping ensures the item is always visible.

### 27. Explicit focus mode — click-to-select with double-click-to-open

Kahuna uses single-click to open image detail (what kupua calls "phantom"
mode). There is no concept of a focused image in the grid — clicking
always navigates to detail.

Kupua adds a second interaction model: **explicit focus mode**. In this mode, single-click sets a visible focus ring on an image
without navigating. Double-click opens detail. Arrow keys move focus between
images. `Enter` and `f` operate on the focused image (open detail / fullscreen
preview). This enables keyboard-driven browsing and gives the position engine
an anchor for sort-around-focus, density-switch preservation, and
return-from-detail scroll restoration.

A `focusMode` preference (`"explicit"` or `"phantom"`) is stored in
`ui-prefs-store.ts` and exposed via a three-dot settings menu in the search
bar. On `pointer: coarse` devices (touch screens, iPads), the effective mode
is always phantom regardless of the stored preference — the settings menu
disables the explicit option with a "(touch device)" label. This matches
kahuna's behaviour on mobile, where double-tap to open would be friction.

**Trade-off:** Explicit mode changes the meaning of click for desktop users
who are used to kahuna's click-to-open. The three-dot menu lets them switch
back to phantom (kahuna-like) behaviour. The default was chosen as explicit
because the focus infrastructure (ring, keyboard nav, sort-around-focus)
provides significant value on desktop that kahuna lacks.

### 28. Alias and Additional-Metadata fields promoted to main panel; reconciled in multi-select

**What:** Kahuna shows config-driven alias fields (e.g. `alias_colourModel`,
`alias_digitalSourceType`) and a handful of "Additional Metadata" fields
(`metadata_source`, `metadata_suppliersReference`, `metadata_bylineTitle`)
only inside a collapsible Additional Metadata section, single-image-only.
Kupua promotes all of these to first-class rows in the main panel, and in
multi-select reconciles them uniformly (`multiSelectBehaviour: "reconcile"`,
`showWhenEmpty: false`). See `field-catalogue.md` Appendix B and the per-row
notes for the full list.

**Why:** Reconciling alias values is low-cost and informationally useful —
"all 12 selected images are CMYK" is a real signal worth surfacing. The
Kahuna behaviour (suppress in multi-select, hide behind a collapsible)
is conservative defaulting from the AngularJS template architecture, not
a deliberate UX call. Promotion is uniform for simplicity; per-alias
config (via `FieldAlias`) deferred until a concrete need arises.

**Trade-off:** Slightly more visual density in the main panel. Mitigated
by `showWhenEmpty: false` on alias fields — they only render when at
least one selected image has a value.

### 29. Selection multi-select diverges from Kahuna for `uploadInfo_filename` and `metadata_suppliersReference`

**What:** Kahuna shows `uploadInfo_filename` in multi-select when all
selected images share the same filename (`show-if-all-same` semantics).
Kupua suppresses both `uploadInfo_filename` and `metadata_suppliersReference`
unconditionally in multi-select (`multiSelectBehaviour: "always-suppress"`).

**Why:** Both are de-facto unique identifiers per image. Coincidental
matches across a selection are supplier error or noise, not editorially
useful signal. Showing them invites the user to read meaning into
matches that aren't meaningful.

**Trade-off:** A power user who deliberately curates a selection of
identically-named images won't see the filename in the panel. Acceptable
edge case; reversible if dogfooding asks for it.

---

### DPR-aware image sizing uses a two-tier step function, not raw `devicePixelRatio`

**What:** `detectDpr()` in `image-urls.ts` returns 1 for DPR ≤1.3 and 1.5 for
DPR >1.3. This multiplier is applied to the CSS pixel dimensions when requesting
images from imgproxy. Kahuna uses `screen.width × screen.height` directly (but
only in Firefox — Chrome/Safari/Edge get no DPR scaling at all).

**Why:** Full 2× DPR means 4× pixel count → ~2× file size → ~2× imgproxy
processing time. This would push the prefetch contention cliff from the rapid
tier (80ms/step) into moderate (500ms/step), undoing the prefetch pipeline's work.
1.5× is visually indistinguishable from 2× for photographic content. Kupua's
approach is actually more DPR-aware than kahuna for most browsers (where kahuna
sends no DPR scaling at all).

**Trade-off:** Images on 2× Retina are 0.75× physical pixels (1800/2400) instead
of 1:1. For a DAM management tool this is acceptable — text overlaid on images
would look soft, but kupua doesn't overlay text on images.

---

### Single output format for all source types (no JPEG fallback)

**What:** Kupua serves all images in AVIF (imgproxy default q63, speed 8)
regardless of the source format. PNGs and TIFFs with transparency are handled
by AVIF's native alpha channel support — no special-casing.

Kahuna detects the source format and serves PNG for transparent images and JPEG
for everything else (via the eelpie imgops fork / nginx).

**Why:** AVIF (and WebP, JXL) supports alpha channels natively. JPEG doesn't.
Kahuna's format-switching logic exists because it uses JPEG as the primary format,
which can't represent transparency. AVIF was chosen over WebP (9-15% smaller at
DPR 1.5×, embeds sRGB ICC profile for correct colour on all monitors/browsers)
and JXL (Chrome's JXL decoder is immature — 2-4× worse jank, client-side decode
too slow for rapid image traversal; revisit when jxl-rs lands in stable Chrome).
See `image-optimisation-research.md` for full format comparison data.

**Trade-off:** None meaningful. The only downside is if we ever needed JPEG output
for compatibility (e.g. downloading images for external use) — but that's a
different feature (export/download) not a display concern.

### Mobile DPR cap 2× (vs 1.5× desktop)

**What:** `detectDpr()` in `image-urls.ts` now uses a 3-tier step function:
standard displays → 1×, desktop HiDPI → 1.5×, mobile HiDPI → 2×. Mobile
detection uses `pointer: coarse` (same heuristic as `ui-prefs-store.ts`).

Kahuna uses full `screen.width × screen.height` (but only for Firefox).

**Why:** Phones support pinch-zoom up to 5× via `usePinchZoom`. At 1.5× DPR cap,
zooming past ~1.5× shows visible blur. 2× gives ~1.3× zoom headroom before
hitting native resolution. File size impact is moderate because phone screens
are small (e.g. iPhone 15: 393×852 CSS → ~786×1704 px, ~400KB AVIF vs ~226KB
at 1.5×).

**Trade-off:** ~1.8× larger files per image on mobile. Mitigated by prefetch
pipeline (next 4 images preloaded). On slow connections (3G), initial load
is noticeably slower; on 4G+, the difference is ~200ms per image.

---

## Selections (Phase S1)

### `all-same` / `all-empty` FieldReconciliation carry a `count` field

**What:** The architecture doc §3 typedef for `FieldReconciliation` does not
include a `count` field on `all-same` or `all-empty`. The implementation in
`src/lib/reconcile.ts` adds `count: number` to both variants.

**Why:** Incremental `reconcileAdd` needs to know how many images are in the
`all-same` bucket to compute the correct `valueCount` when a new distinct
value transitions the field to `mixed`. Without `count`, the resulting
`valueCount` would be wrong (off by however many images had the agreed value).
Removing it would require `mixed` to store a full histogram instead of just
top-3 samples, which costs more memory and defeats the purpose of incremental
reconciliation.

**Trade-off:** Marginally larger reconciliation state (~4 bytes per field per
view). No user-visible impact.



---

## Selections (Phase S5) -- Touch gestures

### Paint-drag (Google Photos style) cut from S5

**What:** The original S5 plan specced a long-press-then-drag gesture that
paint-toggles every cell the finger enters, mirroring Google Photos. The
`usePointerDrag` hook was built and wired but deleted before shipping. Mobile
selection now relies on long-press + tickbox tap + second-long-press range only.

**Why:** The browser reads `touch-action` at `pointerdown` (~0ms). Our long-press
commits at 500ms. Setting `touch-action: none` at commit time is too late --
the browser has already decided the gesture may scroll, and any subsequent
`pointermove` fires `pointercancel`. The only fix would be setting
`touch-action: none` permanently on the grid container while in selection mode,
which disables vertical scrolling entirely while items are selected
(unacceptable UX -- users would be unable to scroll to find more items to add).
Google Photos solves this in a native app with OS-level gesture disambiguation.
Kupua is a web app.

**Trade-off:** Mobile range selection requires two distinct long-press gestures
(anchor + target) instead of one continuous drag. Slightly slower for adjacent
ranges; comparable for distant ranges (the long-press range path uses the same
buffer/server walk as desktop shift-click).

---

## Selections (Phase S6) -- Persistence policy

### Selections clear on most navigation, gated by a flag (default off)

**What:** The original architecture (§1 of `05-selections.md`) framed selection
as "persists across sort, search, and reload" -- shopping-cart semantics. S6
flipped the default: selections now clear on any new search (query, filter,
saved-search, URL paste, ticker click, browser back/forward) and on the Home
logo. They survive sort, reload, image detail open/close, density toggle, and
tier-mode change. The full survival matrix is in §4 of the architecture doc.

The behaviour is gated by `SELECTIONS_PERSIST_ACROSS_NAVIGATION` in
`constants/tuning.ts` (default `false`). Flipping to `true` restores the
original "survives everything" behaviour as a one-line escape hatch.

**Why:** Dogfooding through S4/S5 with the original "survives everything"
behaviour clarified two things: (1) the shopping-cart mental model is the
right fit for a future **Clipboard** component (a durable cart in My Places,
separate from the active selection), not for the selection set itself; (2)
the drift UI required to communicate cross-search persistence (`12 selected
· 8 in view`) is non-trivial UX work that pays off only under the cart model.
Until Clipboard ships and genuinely needs durable persistence, defaulting to
clear-on-navigation matches user expectations from every other DAM tool and
leaves selection ephemeral.

The drift counter, `inViewCount` selector, and "Show only selected" filter
(§9 of the architecture doc) are deferred until either the flag is flipped
or Clipboard arrives. The architecture doc retains the design so the
implementation is straightforward when needed.

**Trade-off:** Users who want long-running selections across multiple searches
lose that workflow in v1. Mitigation: the flag flip is one line in
`tuning.ts`; the underlying machinery (persist middleware, hydrate, metadata
cache, reconciliation across out-of-view items) all still works. When
Clipboard ships the flag becomes obsolete and is removed.

**What:** Grid cells have `draggable="true"` on fine-pointer (desktop) devices only.
The `IS_COARSE_POINTER` constant (computed once at module load from
`window.matchMedia("(pointer: coarse)").matches`) gates the attribute.
On coarse-pointer (touch) devices the attribute is absent.

**Why:** On Android Chrome, `draggable="true"` causes the browser to intercept a
long-press as an HTML5 drag gesture, firing `pointercancel` on our `useLongPress`
hook and killing the selection-mode entry gesture. There is no API to have both
`draggable` and long-press on the same element on mobile without a native app's
gesture disambiguation layer. Google Photos solves this in a native app. Kupua
is a web app.

**Trade-off:** Users on touch devices cannot drag individual cells to collection
panels (there are no collection drop targets in Kupua's mobile layout yet anyway).
Desktop drag-to-collection works as expected.

---

### `draggable` is desktop-only (fine pointer); suppressed on coarse pointer

**What:** Grid cells have `draggable="true"` on fine-pointer (desktop) devices only.
The `IS_COARSE_POINTER` constant (computed once at module load from
`window.matchMedia("(pointer: coarse)").matches`) gates the attribute.
On coarse-pointer (touch) devices the attribute is absent.

**Why:** On Android Chrome, `draggable="true"` causes the browser to intercept a
long-press as an HTML5 drag gesture, firing `pointercancel` on our `useLongPress`
hook and killing the selection-mode entry gesture. There is no API to have both
`draggable` and long-press on the same element on mobile without a native app's
gesture disambiguation layer. Google Photos solves this in a native app. Kupua
is a web app.

**Trade-off:** Users on touch devices cannot drag individual cells to collection
panels (there are no collection drop targets in Kupua's mobile layout yet anyway).
Desktop drag-to-collection works as expected.

---

### Two parallel data adapters (ElasticsearchDataSource + GridApiDataSource)

**What:** Kupua has two coexisting data adapters:
- `dal/es-adapter.ts` — all search-shape flows (scroll, `search_after`, PIT, aggregations, position maps, scrubber, range selection)
- `dal/grid-api/grid-api-adapter.ts` — media-api HATEOAS surface (image detail, Phase B+ satellite reads, Phase C+ writes)

**Why:** media-api has 9 hard capability gaps against kupua's pagination architecture (`search_after`, PIT, composite aggs, percentile aggs, `_source` shaping, `countBefore`, `getIdRange`, reverse sort, two-phase null-zone seek). Migrating search to media-api would require Scala changes equivalent to reimplementing kupua's entire scroll system — months of work with no user benefit. The hybrid is permanent, not a transitional scaffold.

**Merge direction (permanent rule):** ES baseline → API overwrite. ES-sourced fields are the standalone-mode floor (kupua works without Grid). API enrichment overwrites server-computed fields (`cost`, `valid`, `persisted`, `actions`, etc.) when reachable. Never the inverse.

**Trade-off:** Two adapters to maintain. The decision matrix is documented in `dal/grid-api/README.md` and `integration-workplan-bread-and-butter.md §"Architectural rule"`.

Reference: `integration-workplan-bread-and-butter.md`, `enrichment-strategy.md`.

---

### syndicationStatus display matches Kahuna's `Image.scala`, not `SyndicationFilter.scala`

**What:** Kupua computes `syndicationStatus` client-side for display (badges, info panel) using
the simpler `Image.scala#syndicationStatus` logic — existence-based allow-syndication lease
check, no `syndicationRights.published <= now` gate, no `syndicatableCategory` (photographer
category) gate. The ES search filter (`?syndicationStatus=review`) DOES apply those gates,
mirroring `SyndicationFilter.scala`.

**Why this is a "deviation worth recording" even though we match Kahuna:** Kahuna has the same
display/filter mismatch and it is arguably a bug — an image can show a "queued" or "review"
badge during normal browsing but be absent from the equivalent filter results. We considered
"fixing" this in kupua by applying the stricter filter logic to display too. We chose not to:

- An aggregation against PROD (9.8M docs, 16 May 2026) found **2 docs** with
  `syndicationRights.published > now`. The "fix" would cost a per-render date compare on every
  image in the grid hot path to handle a case that essentially does not occur.
- The `syndicatableCategory` gate would suppress "review" badges on non-photographer images
  with rights data. Same near-zero benefit, same render cost, plus surprising UX (badge
  disappears for images that clearly have syndication rights).
- Matching Kahuna means editors retrained on kupua see identical badge behaviour. Zero
  retraining surface; any divergence here would be confusing without being useful.

A future agent looking at the display code may notice it doesn't match the filter and try to
"correct" it. Don't. The asymmetry is intentional and matches Kahuna.

**The one place we DO depart from Kahuna's display:** date-based `isLeaseActive()` (see
07-syndication-and-leases.md §4.1). That fixes a genuine staleness bug — expired
deny-syndication leases remain in the ES array and Kahuna shows them as "blocked" forever.
We compute active from `startDate`/`endDate` instead. Negligible perf cost (sub-ms per page),
real correctness win.

Reference: `00 Architecture and philosophy/07-syndication-and-leases.md` §3.2.1, §4.1, §6.

---

### `syndicationStatus=review` filter uses date-range (not Painless) for expired deny-syndication

**What:** The "review" search filter (`?syndicationStatus=review`) must exclude images that
have an *active* deny-syndication lease. In `SyndicationFilter.scala`, when
`useRuntimeFieldsToFixSyndicationReviewQueueQuery` is enabled, an additional Painless runtime
field (`hasActiveDenySyndicationLease`) is computed at query time to walk the lease array and
check `endDate > now` on each entry — correctly handling de-correlated lease data in the
non-nested `leases.leases` array.

Kupua uses a date-range filter on `leases.leases.endDate` instead: the `must_not` clause is
`hasDenyLease AND (endDate absent OR endDate >= now)`.

**Why:** Painless scripts require server-side configuration and cannot be deployed from a
pure frontend. The date-range approach has a theoretical de-correlation flaw for images with
multiple leases of different types: ES flattens non-nested arrays so `access` and `endDate`
values from different leases are indexed separately, meaning the query can check the wrong
lease's dates. In practice this is not a problem: `MediaLeaseController.scala:57-67` enforces
at most one `deny-syndication` lease per image (new leases replace existing ones). The
de-correlation scenario requires two simultaneous deny-syndication leases, which cannot occur.

Reference: `SyndicationFilter.scala`, `07-syndication-and-leases.md` §4.2, §5.

---

### `syndicationStartDate` is null (no PROD cutoff) in the current config

**What:** The "review" filter in media-api also gates by `uploadTime >= syndicationStartDate`
when running in PROD (via `MediaApiConfig.syndication.start`). Kupua exposes this as
`gridConfig.syndicationStartDate` in `src/lib/grid-config.ts`, currently set to `null` (no
cutoff). `buildSyndicationStatusFilter("review")` accepts the start date as a parameter,
defaulting to `gridConfig.syndicationStartDate`, so the PROD behaviour can be restored by
setting the property.

**Why null now:** The `syndication.start` config value is a runtime secret stored in AWS SSM
— it is not in the public repo. Setting it to `null` means the filter returns the same result
as the Scala code's `case _ => rightsAcquiredNoLeaseFilter` (non-PROD path). For TEST
verification this is correct: TEST is not PROD, so no date gate is expected.

**To enable for PROD:** Set `syndicationStartDate` in `grid-config.ts` to the ISO date string
from the `syndication.start` SSM parameter. Do NOT commit the actual value to the public repo.
When runtime config is added to kupua (future phase), this should move there.

Reference: `MediaApiConfig.scala`, `SyndicationFilter.scala`, `07-syndication-and-leases.md` §4.2.

---

### Lease panel display — sorting, pending state, and multi-image summary

**What (single image):** Kupua sorts leases in a deliberate order instead of showing them in
raw ES insertion order. Sort priority: use before syndication → deny before allow → active
then pending then expired → creation date within each sub-group. Pending leases (start date
in the future) are shown at full opacity with "(pending)" appended to the label and "Starts
in X" displayed. Expired leases are dimmed. Kahuna shows all leases in insertion order with
no sorting, no pending/expired distinction beyond a binary "active" flag, and groups them
only as "active" (full opacity) or "inactive" (dimmed).

**What (single image — date precision):** Kupua uses sub-day precision for relative dates:
"Starts in 3 hours", "Expires in 45 minutes", matching `moment.fromNow()` granularity.
Kahuna uses `moment.fromNow()` directly; kupua reimplements without moment.js dependency.

**What (single image — tooltips):** Kupua tooltips include the relevant temporal event as
an absolute date ("expires at: 18 May 2026, 18:12") in addition to Kahuna's "leased by" /
"leased at" lines. This gives users the exact timestamp behind the relative wording.

**What (single image — start date suppression):** For active leases, the past start date is
not shown (noise — the user only cares about expiry). Kahuna shows "Started X ago" for all
leases with a start date regardless of state.

**What (multi image):** Kupua shows per-type active and pending counts with ALL/SOME
indicators (●/◐), coloured left borders matching single-image cards, and "All images" (bold)
vs "N of M" display. Order mirrors single-image sort. Expired leases collapse to a single
footnote ("X images with expired leases"). Kahuna shows only "{n} current leases + {m}
inactive leases" for multi-image — no per-type breakdown, no pending distinction, no ALL/SOME
signal. This is functionally useless for editors deciding whether to bulk-add leases.

**What (multi image — twitch prevention):** Total for ALL/SOME comparison is derived from
images actually in the metadata cache (not `selectedIds.size`), so adding a new image to the
selection doesn't briefly flash "49 of 50" before the new image's metadata loads.

**Why:** Leases are action-critical information — editors need to know at a glance what
restrictions exist before adding/removing them. Insertion order provides no useful signal.
The pending/active/expired trichotomy reflects genuine user-facing difference: "affects me
now" vs "coming soon, don't duplicate" vs "historical record". Kahuna's flat "inactive"
conflates pending (actionable) with expired (ignorable).

**Trade-off:** Sort is computed on every render (`[...leases].sort(...)`) — negligible for
typical lease counts (1–5 per image). Multi-image iterates the full metadata cache on each
render — acceptable for up to 5k images (Set iteration + date comparisons, no allocations
beyond the counter objects).

Reference: `ImageMetadata.tsx` (single), `MultiImageMetadata.tsx` (multi),
`kahuna/public/js/leases/leases.{html,js}`.

---

### Leases panel — date-based active detection, not ES snapshot (SY-5)

**What:** Kupua determines whether a lease is currently active from `startDate` and `endDate`
via `isLeaseActive()` rather than trusting the `active` field stored in the ES document.
This applies to: the active/pending/expired three-state sort in the panel, the active-count
fallback (`leasesSummary` absent), the validity banner `shouldOverride` signal in
`validity-map.ts`, and the deny-syndication warning in `ImageMetadata.tsx`.

**Why:** The `active` field is set by thrall at index time and can become stale. An expired
`allow-use` lease still shows `active: "true"` until the image is re-indexed. Trusting it
means the validity banner stays teal ("leased override") and the cost `shouldOverride` flag
stays true long after the lease has actually expired — editors see an incorrect "this image
is leased" state with no way to detect the discrepancy. Date-based computation costs one
integer comparison per lease (negligible) and is always correct regardless of thrall lag.

This is the same fix applied to `calculateSyndicationStatus` in SY-2 (deny-syndication
banner) and to the validity map in the SY-5 follow-up review. All three call sites now use
`isLeaseActive()`. See `07-syndication-and-leases.md` §3.2.1 for the staleness mechanics.

**Trade-off:** Sub-ms per render; no meaningful cost. The `active` field is still carried
through the ES `Lease` type and still appears on the wire — we just don't act on it.
A future agent may notice the field and try to "simplify" back to `active === "true"` checks.
Don't — the date-based path is both cheaper and more correct.

Reference: `calculate-syndication-status.ts` (`isLeaseActive`), `validity-map.ts`,
`ImageMetadata.tsx`, `07-syndication-and-leases.md` §3.2.1, §4.1.

### Custom horizontal swipe gesture in fullscreen (Chrome workaround)

**What:** `usePinchZoom` implements custom two-finger horizontal swipe detection
that calls `history.back()` / `history.forward()` when in fullscreen and not
zoomed in. This replaces the browser's native swipe-to-navigate gesture, which
Chrome disables when the Fullscreen API is active.

**Why:** Chrome completely blocks its native swipe-to-navigate gesture when a
page uses `document.documentElement.requestFullscreen()`. The wheel events ARE
delivered to the page — Chrome just refuses to interpret them as navigation.
Diagnostic testing confirmed this: disabling ALL wheel handlers still didn't
restore the gesture. Firefox is unaffected because it uses OS-level gesture
detection that operates regardless of Fullscreen API state. There is no CSS or
JS workaround to re-enable Chrome's native gesture in fullscreen mode.

**Implementation:** Accumulates `deltaX` over a 300ms sliding window. Fires
navigation when `|cumX| > 200px` and horizontal-dominant (`|cumX| > |cumY| × 2`).
Swipe state resets on zoom transition (so swiping works immediately after
pinch-to-unzoom) and ignores pure-vertical inertia events (`deltaX !== 0` guard).

**Trade-off:** On Firefox, both the custom gesture AND the native OS gesture
fire — this produces a harmless double `history.back()` that's absorbed because
there's only one history entry to go back to (navigating back twice from the
same page is a no-op). The custom gesture fires even if the user has disabled
OS/browser swipe navigation in system preferences — this is arguably a feature
(consistent behaviour regardless of OS settings) but may surprise users who
deliberately disabled swipe navigation.

Reference: `usePinchZoom.ts` (`onWheel` handler, swipe state variables).

### Chrome scroll-latch on grid — no deviation, options rejected

**Context:** Chromium has a long-standing cross-axis scroll-latch bug
([upstream issue 40717572](https://issues.chromium.org/issues/40717572),
open P2, no proposal in flight). A horizontal-leaning wheel gesture over our
image grid escapes the grid and latches the viewport; subsequent vertical
delta in the same gesture is delivered to the viewport (which has nothing to
scroll) and the grid appears frozen until the user starts a new gesture. Full
mechanism with Chromium source citations is in
`exploration/docs/zz Archive/chromium-scroll-latch-issue/`.

**Current state:** the grid scroll container uses the conventional
`overflow-y: auto; overflow-x: hidden; overscroll-y-contain` — no deviation
from library defaults. The latch bug is unfixed; we accept it.

**Options considered and rejected (so this isn't re-tried blindly):**

1. **`overscroll-behavior: contain`** on the container — tried in
   `a4fa028e6`, reverted. Did kill the latch but also disables horizontal
   swipe history navigation (documented MDN behaviour). Net regression.
2. **`overflow-x: clip`** instead of `hidden` — tried in `8d021c4d2`,
   reverted. No effect on the latch: `SingleAxisScrollContainers` is a Blink
   runtime feature that is off by default in shipping Chromium, so
   mixed-axis `overflow-x: clip` is rewritten to `hidden` before populating
   cc scroll-node flags (see `style_resolver_test.cc:727`). Even with the
   feature on, zero horizontal scroll range still kills `CanConsumeDelta`
   for the x axis, so the chain walk escapes either way. The earlier
   ImageDetail success (`6ab3d72f2`) that motivated this swap remains
   unexplained by current evidence.
3. **1px horizontal scroll range hack** — would force the grid to win
   `CanConsumeDelta`. Visibly twitches by 1px on every horizontal-leaning
   gesture (i.e. on every gesture that currently triggers the bug). Ugly.
   Didn't pursue.
4. **`overscroll-behavior-x: contain` only** — tested empirically
   28 May 2026 on a throwaway branch. Fixes the latch but breaks horizontal
   swipe history navigation over the grid (history nav still works over
   app chrome, just not when the cursor is over the grid). Same trade-off
   as full `contain`, just narrower in scope. Rejected.
5. **JS wheel interception** — the VS Code-style fix
   ([`scrollableElement.ts` `scrollPredominantAxis`](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/scrollbar/scrollableElement.ts),
   [PR #70047](https://github.com/microsoft/vscode/pull/70047), shipped
   Feb 2020, default on). Non-passive `wheel` listener zeroes the
   smaller-magnitude axis and `preventDefault`s, so cc never runs
   `FindNodeToLatch`. Six years in production in VS Code. Trade-off:
   moves grid scroll from compositor thread to main thread (jank risk
   if main thread is busy). Only known viable fix; not yet prototyped
   in kupua.

Reference: `ImageGrid.tsx` (scroll container className), commit
`a4fa028e6`-amends lineage.

### 31. `usages@status:replaced` hidden by default — mirrors Kahuna `Parser.scala`

Kahuna's `Parser.scala` appends `-usages@status:replaced` to every search
query in `thingsToHideByDefault`, hiding images whose usage status is
`"replaced"` (they were superseded by a newer version).  Kupua replicates
this in `buildQuery` (`es-adapter.ts`) by unconditionally pushing a
`mustNot` nested clause unless the query already contains
`usages@status:replaced` explicitly.

The opt-in check uses a substring match on the raw query string, identical
to how Kahuna's `-is:deleted` suppression works and how kupua implements
the deleted-image suppression.

**Trade-off:** every search carries one extra nested `must_not` clause.
The cost is negligible (a fast keyword term query on a small nested array);
no performance regression has been observed.  If the Guardian's data model
for "replaced" images changes, this default should be revisited.

### 32. `searchAfter` strips dropped fields before `Image` validation (media-api)

**What:** The kupua-facing `searchAfter` endpoint in `ElasticSearch.scala` omits the
heavy `fileMetadata` / `embedding` / `originalMetadata` fields from the `_source`
projection (`searchAfterDropFields`) but adds back the specific alias leaf paths from
`config.fieldAliasConfigs` (e.g. `fileMetadata.icc.Profile Description`). The returned
source therefore contains a *partial* `fileMetadata` object, which `Image`'s reader
cannot parse — its `iptc`/`exif`/`exifSub`/`xmp` sub-maps are required, not nullable, so
`readNullable[FileMetadata]` fails on a present-but-incomplete object and every hit
returns `JsError` (empty grid). A search-after-only resolver, `resolveSearchAfterHit`,
strips every dropped top-level field from a copy of the source before `validate[Image]`
(absent → `FileMetadata()` default, which the reader tolerates), while keeping the FULL
source in the `SourceWrapper` so `ImageResponse.extractAliasFieldValues` can still read
the alias leaves from the raw JSON.

**Why:** It decouples the two concerns the partial object conflates — what `Image` needs
to parse (no partial `fileMetadata`) vs. what alias extraction needs (the raw leaves).
The alternative (reinstating the whole `fileMetadata` blob whenever an alias touches it)
more than doubled per-scroll latency by pulling the full EXIF/XMP/ICC/IPTC payload on
every page.

**Scope / production safety:** Confined to `searchAfter`. The shared `resolveHit` /
`mapImageFrom` used by production `imageSearch` and the other search paths are
deliberately left untouched — `resolveSearchAfterHit` is a separate method so the strip
cannot leak into production. No `common-lib` change. The same payload-slimming pattern
*could* be applied to the production search path (it still fetches the full `_source`)
but is intentionally not attempted: that path has many more consumers (kahuna, public
API, `?include=fileMetadata` callers) and the risk/benefit doesn't justify it.

**Trade-off:** `instance.fileMetadata` is the empty default for search-after results.
The only reachable reader of the parsed field is `fileMetadataEntity`, gated on
`?include=fileMetadata`, which kupua never sends on this endpoint. A tiny per-hit JSON
transform replaces carrying the full `fileMetadata` blob on every scroll page.

Reference: `media-api/app/lib/elasticsearch/ElasticSearch.scala` (`resolveSearchAfterHit`,
`searchAfter` projection), `phase-3-d3-searchafter-fileMetadata-aliases-companion-workplan.md`.

### 33. `seekToEnd` and null-zone stripping run in opposite order in media-api vs kupua TS (benign)

**What:** Both `searchAfter` implementations apply two transforms to the head of the sort
clause — `seekToEnd` (sets `missing: "_first"` on the primary sort field) and null-zone
handling (strips the primary field when the cursor's leading value is null). They apply
them in opposite order:
- **kupua TS** (`es-adapter.ts` `_searchAfterImpl`): strips the primary field first
  (null-zone), then applies `missing: "_first"` to the new clause head (`uploadTime`).
- **media-api Scala** (`ElasticSearch.searchAfter`): applies `missing: "_first"` to the
  primary field first, then strips the primary field.

**Why it doesn't matter (today):** `missing: "_first"` only affects a field that can
actually be absent. In the null zone the only absent field is the primary (stripped in
both), and the surviving tiebreakers (`uploadTime`, `id`) are never null. So the modifier
lands on something it cannot affect in both implementations — identical query, identical
results. The divergence is in *how* they reach a no-op, not in observable behaviour.

**Not a deliberate design choice** — it's an artefact of where each codebase runs null-zone
detection (TS detects at the top of the method; Scala strips after the `seekToEnd` step).
Neither order is "more correct" given the no-op.

**Why not fixed:** the `seekToEnd` + null-zone code is the most intricate logic in the
method; reordering it to align would touch high-risk code for zero current benefit. It only
stops being a no-op if a future sort uses a *secondary* field that can be null AND
`seekToEnd` AND a null-zone cursor co-occur — a three-way combination that does not exist
and is not planned. If kupua's direct-ES path is ever retired, the divergence disappears
entirely (only the Scala remains). Guarded by the `seekToEnd + null-zone` integration test
in `ElasticSearchTest.scala`.

Reference: `media-api/app/lib/elasticsearch/ElasticSearch.scala` (`searchAfter`),
`kupua/src/dal/es-adapter.ts` (`_searchAfterImpl`).

