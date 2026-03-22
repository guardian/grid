# Kupua — Agent Context

> This file is read automatically by GitHub Copilot at the start of each session.
> It provides essential context about the kupua project so the agent can pick up where it left off.
> **Update this file whenever significant decisions are made.**

> **Directive:** After completing any task that adds, removes, or changes features, architecture,
> files, or key decisions, update the relevant sections of this file (What's Done, What's Next,
> Project Structure, Key Architecture Decisions) before finishing your turn. Keep it concise.

> **Directive:** Performance is crucial. If any requested change is likely to seriously impact
> performance, do not proceed without checking with the user first — explain the potential
> impact, suggest mitigations, and consider alternative approaches.

> **Directive:** When introducing code that intentionally departs from Grid/kahuna behaviour
> or from library defaults/conventions, add an entry to `kupua/exploration/docs/deviations.md`
> explaining what, why, and the trade-off.

> **Directive:** Never write or modify any file outside the `kupua/` directory without
> explicitly asking the user for permission first. This agent's scope is kupua only.
> Exception: `.github/copilot-instructions.md` may be updated freely since it mirrors
> directives from this file.

> **Directive:** Do not commit after every change. It's fine to modify many files over a long
> session without committing. **Never commit without explicitly asking the user first.**
> If you think a commit is warranted but the user hasn't asked, suggest it and wait for
> confirmation. When the user approves, batch changes into sensible chunks grouped by the
> problem they solve — not by individual file edits. Never push to remote.

> **Directive: REAL SYSTEMS ARE DANGEROUS.** Kupua can be configured to connect to real
> Elasticsearch clusters (TEST/CODE/PROD) via SSH tunnels. These clusters serve the entire
> Guardian editorial team. **Never** write code that issues write operations (index, delete,
> bulk, update, create) against a non-local ES. **Never** weaken or bypass the safeguards
> in `es-config.ts` or `load-sample-data.sh` without explicit user approval. **Never**
> hardcode real cluster URLs, index names, or credentials in source code. If a task
> requires modifying safeguard configuration, stop and explain the risk before proceeding.
> See `kupua/exploration/docs/safeguards.md` for the full safety framework.

## What is Kupua?

Kupua is a **new React-based frontend** for [Grid](https://github.com/guardian/grid), the Guardian's image DAM (Digital Asset Management) system. It replaces the existing **kahuna** frontend (AngularJS 1.8).

Grid manages ~9 million images stored in S3, with metadata indexed in **Elasticsearch 8.x**. Kupua lives inside the Grid monorepo at `kupua/`.

## Full Migration Plan

📄 **Read the full plan:** `kupua/exploration/docs/migration-plan.md`

It contains:
- Phased migration plan (Phase 1–6)
- Complete kahuna feature inventory with migration status
- Data model reference (ES mapping fields)
- Architecture diagram

📄 **Deviations log:** `kupua/exploration/docs/deviations.md`

Documents intentional differences from Grid/kahuna behaviour and places
where library conventions were bent.  Update it when a new deviation is
introduced.

## Current Phase: Phase 1 — Read-Only with Sample Data

**Goal:** Prove the tech stack works. Load real data into local ES, display it in a fast table view with search and filtering. No writes, no auth, no production systems.

### What's Done

**Infrastructure & data:**
- ✅ Sample data (10k docs, 115MB) from CODE ES in `exploration/mock/sample-data.ndjson` (NOT in git — also in `s3://<sample-data-backup-bucket>/`)
- ✅ ES mapping from CODE in `exploration/mock/mapping.json`
- ✅ Standalone ES 8.18.3 via `docker-compose.yml` on **port 9220** (isolated from Grid's ES on 9200)
- ✅ `scripts/load-sample-data.sh` — index creation + bulk load
- ✅ `scripts/start.sh` — one-command startup. Default: local mode (ES + data + deps + Vite). `--use-TEST`: establishes SSH tunnel to TEST ES, auto-discovers index alias, discovers S3 bucket names, starts S3 thumbnail proxy, sets env vars, enables write protection. Flags: `--skip-es`, `--skip-data`, `--skip-install`
- ✅ S3 thumbnail proxy (`scripts/s3-proxy.mjs`) — local-only Node.js server that proxies S3 thumbnail requests using the developer's AWS credentials. Read-only, localhost-bound, nothing committed. Auto-started by `start.sh --use-TEST`. See `exploration/docs/s3-proxy.md`. Temporary — will be replaced by Grid API signed URLs in Phase 3.
- ✅ imgproxy for full-size images — `darthsim/imgproxy` Docker container (port 3002) with S3 access via host AWS credentials volume mount. Container runs as uid 999 (`imgproxy` user, not root), so credentials mount to `/home/imgproxy/.aws/`. Janus only writes `[media-service]` to `~/.aws/credentials` — the Go AWS SDK also needs a `[profile media-service]` entry in the config file, so `start.sh` generates a minimal config at `/tmp/kupua-aws-config` (no secrets — just profile name + region). Resizes originals on the fly to WebP (1200px fit, quality 80). Auto-started by `start.sh --use-TEST` via docker compose profile. URL builder in `src/lib/image-urls.ts` (`getFullImageUrl()`). See `exploration/docs/imgproxy-research.md`.
- ✅ Migration plan: `exploration/docs/migration-plan.md`
- ✅ Mock Grid config: `exploration/mock/grid-config.conf` (sanitised PROD copy, parsed by `src/lib/grid-config.ts` for field aliases + categories)

**App scaffold (~4700 lines of source):**
- ✅ Vite + React 19 + TypeScript + Tailwind CSS 4, dev server on port 3000
- ✅ Vite proxy: `/es/*` → `localhost:9220` (no CORS needed)
- ✅ Path alias: `@/*` → `src/*` (in both `tsconfig.json` paths and Vite `resolve.alias`)
- ✅ Grid colour palette in `index.css` as Tailwind `@theme` tokens (e.g. `bg-grid-bg`, `text-grid-accent`)
- ✅ Open Sans self-hosted from `public/fonts/` (same woff2 files as kahuna, not CDN); `--font-sans` overridden in `@theme` so all elements inherit it automatically
- ✅ Shared CSS component classes (`popup-menu`, `popup-item`) in `index.css` `@layer components` for consistent dropdown/context menu styling
- ✅ Three standardised font sizes: `text-xs` (12px, all UI chrome), `text-sm` (14px, table body cells), 13px (CQL input Web Component)
- ✅ TypeScript compiles clean (one pre-existing `@guardian/cql` type issue in `customElements.define` — upstream bug)

**Data Access Layer (DAL):**
- ✅ `ImageDataSource` interface (`dal/types.ts`) — `search()`, `count()`, `getAggregation()`
- ✅ `ElasticsearchDataSource` adapter (`dal/es-adapter.ts`) — queries ES via Vite proxy, handles sort aliases, CQL→ES translation. `count()` uses `_count` endpoint for lightweight polling (new images ticker).
- ✅ Configurable ES connection (`dal/es-config.ts`) — env vars for URL (`KUPUA_ES_URL`), index (`VITE_ES_INDEX`), local flag (`VITE_ES_IS_LOCAL`). Defaults to local docker ES on port 9220.
- ✅ Phase 2 safeguards (see `exploration/docs/safeguards.md`):
  1. `_source` excludes — strips heavy fields (EXIF, XMP, Getty, embeddings) from responses
  2. Request coalescing — AbortController cancels in-flight search when a new one starts
  3. Write protection — only `_search`/`_count`/`_cat/aliases` allowed on non-local ES; `load-sample-data.sh` refuses to run against non-9220 port
  4. S3 proxy — read-only `GetObject` only, localhost-bound, uses developer's existing AWS creds (never committed)
- ✅ Vite env types declared in `src/vite-env.d.ts`

**State management:**
- ✅ `search-store.ts` — Zustand store for search params, results, `loadMore()`
- ✅ `column-store.ts` — Zustand + localStorage persist for column visibility, widths, and session-only pre-double-click widths
- ✅ URL is single source of truth — `useUrlSearchSync` hook syncs URL → Zustand → search; `useUpdateSearchParams` hook lets components update URL. Browser back/forward works.
- ✅ Custom URL serialisation in `router.ts` — uses `URLSearchParams` directly (not TanStack Router's `parseSearchWith`/`qss`), keeping all values as plain strings. Colons kept human-readable. See deviations.md §1 for rationale.

**CQL search:**
- ✅ `@guardian/cql` parser + custom CQL→ES translator in `src/lib/cql.ts`
- ✅ `<cql-input>` Web Component for chip rendering, editing, keyboard nav, typeahead — wrapped by `CqlSearchInput.tsx`
- ✅ `LazyTypeahead` (`lazy-typeahead.ts`) — subclass of `@guardian/cql`'s `Typeahead` that decouples key suggestions from value resolution. Prevents the popover from stalling when a slow value resolver is in flight. See deviations.md §12.
- ✅ Typeahead fields built from DAL (`typeahead-fields.ts`) with resolvers using local ES aggregations (terms aggs on keyword fields). Fields without keyword mappings (byline, city, etc.) have no value suggestions — same as kahuna.
- ✅ CQL structural noise filtering — `SearchBar` ignores `queryStr` values that are pure CQL structure (e.g. bare `":"` from empty chips when pressing `+`), preventing spurious searches. Kahuna handles this via its structured query pipeline; kupua filters at the `handleQueryChange` level.
- ✅ Supports structured queries: `credit:"Getty" -by:"Foo" cats fileType:jpeg`
- ✅ `fileType:jpeg` → `source.mimeType` match with MIME conversion (matching Scala `FileTypeMatch`)
- ✅ `is:GNM-owned` — recognized but requires org config from Grid (mocked for now)

**Table view (`ImageTable.tsx`, ~1190 lines):**
- ✅ TanStack Table with virtualised rows (TanStack Virtual), column resizing
- ✅ 22 hardcoded columns + config-driven alias columns from `gridConfig.fieldAliases` (currently 7: Edit Status, Colour Profile, Colour Model, Cutout, Bits Per Sample, Digital Source Type, Scene Code). Hardcoded: Category, Image type, Title, Description, Special instructions, By, Credit, Location, Copyright, Source, Taken on, Uploaded, Last modified, Uploader, Filename, Subjects, People, Width, Height, File type, Suppliers reference, Byline title. Plus a Thumbnail column (first position, 48px, non-resizable) shown only in `--use-TEST` mode when S3 proxy is active.
- ✅ Location is a composite column: subLocation, city, state, country (fine→coarse display). Click-to-search uses `in:` which searches all four sub-fields. Not sortable (text-analysed fields).
- ✅ Subjects and People are list columns: each item rendered individually with per-item click-to-search (`subject:value`, `person:value`). Not sortable (text-analysed fields).
- ✅ Config-driven alias columns — generated from `gridConfig.fieldAliases` where `displayInAdditionalMetadata === true`. Values resolved via `resolveEsPath()` (dot-path traversal into `image.fileMetadata`). All keyword type → sortable. Hidden by default. Click-to-search uses alias name as CQL key. CQL parser resolves alias → `elasticsearchPath` for search.
- ✅ Sort on any keyword/date/numeric column by clicking header. Text-only fields (Title, Description, etc.) not sortable (no `.keyword` sub-field). Single click is delayed 250ms to distinguish from double-click.
- ✅ Secondary sort via shift-click (encoded as comma-separated `orderBy` URL param)
- ✅ Sort alias system — `buildSortClause` expands aliases per-part (e.g. `taken` → `metadata.dateTaken,-uploadTime`)
- ✅ Auto-reveal hidden columns when sorted — if the user sorts by a column that's currently hidden (e.g. Last modified, Width), it's automatically shown and persisted to the store as if toggled manually. Generic — works for any sortable hidden column.
- ✅ Click-to-search — shift-click cell to append `key:value` to query; alt-click to exclude. If the same `key:value` already exists with opposite polarity, flips it in-place (no duplicate chips). AST-based matching via `cql-query-edit.ts` using `@guardian/cql`'s parser. CQL editor remount workaround for polarity-only changes — see deviations.md §13.
- ✅ Accessibility — ARIA roles on table (`role="grid"`, `role="row"`, `role="columnheader"` with `aria-sort`, `role="gridcell"`), context menu (`role="menu"`, `role="menuitemcheckbox"`), sort dropdown (`role="listbox"`, `role="option"`), resize handles (`role="separator"`), loading indicator (`aria-live`), result count (`role="status"`), toolbar (`role="toolbar"`), search landmark (`role="search"`). All zero-performance-cost — HTML attributes only.
- ✅ Cell tooltips via `title` attribute
- ✅ Column visibility — right-click header for context menu. Default hidden: Last modified, Width, Height, File type, Suppliers reference, Byline title, all config-driven alias columns. Persisted to localStorage.
- ✅ Column widths persisted to localStorage via `column-store.ts` — manual drag resizes and auto-fit widths both persist. Restored on reload.
- ✅ Double-click header to auto-fit — first double-click measures the widest cell value and fits the column. Second double-click restores the previous width. Pre-fit widths are stored in the column store (session-only, not persisted to localStorage). Manual drag-resize clears the saved pre-fit width.
- ✅ Column context menu — right-click any header cell: "Resize column to fit data", "Resize all columns to fit data", separator, then column visibility toggles. Menu uses shared `popup-menu`/`popup-item` classes. Auto-clamps to viewport bounds (never renders off-screen). Right-clicking a specific column shows the single-column resize option; right-clicking the trailing spacer shows only "Resize all" + visibility.
- ✅ Auto-resize to fit — measures the widest cell value across all loaded results using an off-screen `<canvas>` for text measurement (`measureText`), accounts for header label width, padding (16px sides), and sort arrow space.
- ✅ CSS-variable column widths — instead of per-cell `getSize()` calls (~300+/render), a single `<style>` tag injects `--col-<id>` CSS custom properties on `[data-table-root]`. Header and body cells use `width: var(--col-<id>)`. Width changes during resize only touch the style string — no per-cell JS.
- ✅ Memoised table body during resize — `TableBody` is a `React.memo` component. During column resize drags, rows and virtualItems are cached in refs (frozen while `columnSizingInfo.isResizingColumn` is truthy) so the memo's props stay stable and the body skips re-rendering entirely. Column widths update via CSS variables without React involvement. Avoids the bug in TanStack's official performant example (#6121).
- ✅ Column resize with auto-scroll — dragging a resize handle near/past the scroll container edges auto-scrolls the table horizontally (speed proportional to distance past edge, up to 20px/frame). Synthetic `mousemove` events with scroll-adjusted `clientX` keep TanStack Table resizing the column as the container scrolls. On release, a synthetic `mouseup` with the adjusted position finalises the width correctly (the real `mouseup` with unadjusted `clientX` is blocked via capture-phase listener).
- ✅ Horizontal scroll — inner wrapper is `inline-block min-w-full`, header is `inline-flex` with `shrink-0` cells (the browser determines the scrollable width from rendered content — no JS-computed width, correct at any browser zoom level). A 32px trailing spacer after the last header cell ensures the last column's resize handle is always accessible. Root layout uses `w-screen overflow-hidden` to prevent the page from expanding beyond the viewport.
- ✅ Scroll reset on new search — both scrollTop and scrollLeft reset to 0 when URL search params change (new query, sort, filters, logo click). loadMore doesn't change URL params, so infinite scroll is unaffected.

**Toolbar (`SearchBar.tsx`) + Status bar (`StatusBar.tsx`) + Filters (`SearchFilters.tsx`):**
- ✅ Search toolbar (44px / `h-11`): `[Logo] [Search] | [Free to use] [Dates] | [Sort ↓]`
- ✅ Status bar (28px, `bg-grid-panel`): `[count matches] [N new] ... [took ms]` — thin strip between search toolbar and table header. Will expand to hold more contextual info in future phases.
- ✅ Column header row height matches search toolbar (44px / `h-11`)
- ✅ Result count always visible (never replaced by a loading indicator — prevents layout shift). Shows last known total, updates when new results arrive.
- ✅ New images ticker — polls ES `_count` every 10s for images uploaded since last search. Styled as filled accent-blue rectangle with white text (matching Grid's `.image-results-count__new`). Tooltip shows count + time since last search. Clicking re-runs the search. No media-api needed — uses DAL `count()` directly against ES.
- ✅ Response time (`took` ms) — right-aligned in results bar
- ✅ Logo click navigates to `/?nonFree=true` (resets all state), resets scroll position, and focuses the search box
- ✅ Sort dropdown — custom button + popup menu (not native `<select>`) matching column context menu styling. SVG chevron flips when open. Current selection shown with ✓. Closes on outside click or Escape.
- ✅ Sort direction toggle (↑/↓ button) — adjacent to sort dropdown
- ✅ "Free to use only" checkbox (`nonFree` URL param)
- ✅ Date filter dropdown (`DateFilter.tsx`, ~486 lines) — radio type selection, quick-range presets, custom date pickers, blue dot indicator for active range, SVG chevron, open-state highlighting matching hover style. Maps to `since`/`until`/`takenSince`/`takenUntil`/`modifiedSince`/`modifiedUntil` URL params
- ✅ Consistent dropdown styling — all dropdowns (date picker, sort, column context menu) use shared `popup-menu`/`popup-item` CSS classes and matching `bg-grid-panel` background, `border-grid-border`, `rounded shadow-lg`. Buttons stay highlighted while open.
- ✅ Responsive breakpoints — progressive disclosure from mobile to desktop

**Routing (`TanStack Router`):**
- ✅ Zod-validated URL search params (`search-params-schema.ts`)
- ✅ Root route (`__root.tsx`) — minimal shell (bg + flex column)
- ✅ Index route (`index.tsx`) — validates params + renders SearchBar + ImageTable
- ✅ Currently at `/` not `/search` — will move when image detail route is added (see deviations.md §2)

**Keyboard navigation (matches kahuna `gu-lazy-table-shortcuts`):**
- ✅ App starts with caret in search box (`autofocus` on `<cql-input>`)
- ✅ Arrow Up/Down: scroll one row (works even when caret is in search box — keys propagate from CQL input)
- ✅ PageUp/PageDown: scroll one viewport-full of rows (dynamic — based on how many rows are currently visible, accounting for sticky header height). Partially visible rows always become fully visible on either press.
- ✅ Home: jump to top of results (works even in search box — capture-phase listener intercepts before ProseMirror editor)
- ✅ End: jump to bottom of loaded results (works even in search box). In Phase 1 (10k docs, infinite scroll) this scrolls to the bottom and triggers loadMore. In Phase 2+ (9M docs, windowed scroll) End will issue a direct ES query for the last page (`search_after` reversed or `from: total - pageSize`), replacing the data window — a seek, not a scroll.
- ✅ Two-phase keyboard handling: arrows/page keys use bubble phase (propagated from CQL input's `keysToPropagate`); Home/End use capture phase on `document` to intercept before the CQL editor's shadow DOM can consume them.

### What's Next (Phase 1 remaining)
- [ ] Column reordering via drag-and-drop (extend `column-store.ts` to persist order)
- [ ] Image detail panel / single-image view — when added, move search route from `/` to `/search` and add `/images/:imageId` route (see deviations.md §2, AGENTS.md Decision 6)
- [ ] Facet filters — dropdown/multi-select for `uploadedBy`, `usageRights.category`, `metadata.source` (use DAL `getAggregation()` for options)

### Deferred to Later Phases
- [ ] `is:GNM-owned` filter with real org config from Grid (currently recognized in CQL but not filtering)
- [ ] Windowed scroll + custom scrubber (Phase 2 — see migration-plan.md "Scrollbar & Infinite Scroll" notes)
- [ ] `GridApiDataSource` (Phase 3 — replaces ES adapter, adds auth)
- [ ] Row grouping (e.g. group by credit, source, date) — TanStack Table has built-in `getGroupedRowModel()` + `getExpandedRowModel()` with aggregation functions. Works client-side on loaded rows; for 9M-scale grouping would need server-side via ES composite/terms aggs with `manualGrouping: true`. Consider alongside facet filters.

## Tech Stack

| Concern | Choice |
|---|---|
| UI | React 19 with TypeScript |
| Table | TanStack Table v8 (headless, virtualised, column reorder/resize) |
| Virtual Scroll | TanStack Virtual |
| State | Zustand (lightweight, URL sync middleware) |
| Routing | TanStack Router (search params validated via Zod, pairs with TanStack ecosystem) |
| Styling | Tailwind CSS 4 (utility-first, no runtime overhead, dark mode, `@layer components` for shared classes) |
| Build | Vite |
| Data Layer | Abstracted `ImageDataSource` interface — Phase 1 uses `ElasticsearchDataSource`, Phase 3+ swaps to `GridApiDataSource` |
| Validation | Zod |
| Testing | Vitest (co-located `*.test.ts` files next to source) |
| Dates | date-fns |

## Key Architecture Decisions

1. **Separate ES instance on port 9220** — kupua's `docker-compose.yml` is independent of Grid's. Container `kupua-elasticsearch`, cluster `kupua`, volume `kupua-es-data`. Grid's `dev/script/start.sh` won't affect it.

2. **Data Access Layer (DAL)** — TypeScript interface `ImageDataSource` with methods: `search()`, `getAggregation()`. Phase 1 implements against ES directly; Phase 3 swaps to Grid API. UI code never knows the difference.

3. **Scripts in `kupua/scripts/`** (not `kupua/dev/scripts/`) — kupua is a self-contained app; no need for Grid's layered `dev/` hierarchy.

4. **sample-data.ndjson must NOT be committed to git** — too large (115MB). Kept locally or in S3.

5. **All views are one page** — table, grid, side-by-side, detail are density levels of the same ordered list. URL reflects full state. Browser back/forward restores position.

6. **Routes match kahuna exactly** — so existing bookmarks and shared URLs work when kupua replaces kahuna:
   - `/search?query=...` — main search route with all filter params
   - `/images/:imageId?crop=...&cropType=...`
   - `/images/:imageId/crop?cropType=...`
   - `/upload`
   - `/` → redirects to `/search`

   **Complete `/search` URL params** (all optional):
   | Param | Type | Example | Notes |
   |---|---|---|---|
   | `query` | string | `credit:"Getty" -by:"Foo"` | Free-text / CQL query |
   | `ids` | string | `abc123,def456` | Comma-separated image IDs (from Share button) |
   | `since` | ISO date | `2026-03-19T10:54:29.221Z` | Upload time lower bound |
   | `until` | ISO date | | Upload time upper bound |
   | `nonFree` | `true` | `true` | Show paid images (omit = free only) |
   | `payType` | string | `free\|maybe-free\|pay\|all` | Pay type filter |
   | `uploadedBy` | string | `john.doe@guardian.co.uk` | Filter by uploader |
   | `orderBy` | string | `-taken`, `-uploadTime`, `oldest` | Sort order |
   | `useAISearch` | `true` | | Enable semantic/AI search |
   | `dateField` | string | | Which date field for range |
   | `takenSince` | ISO date | | Date taken lower bound |
   | `takenUntil` | ISO date | | Date taken upper bound |
   | `modifiedSince` | ISO date | | Last modified lower bound |
   | `modifiedUntil` | ISO date | | Last modified upper bound |
   | `hasRightsAcquired` | `true\|false` | | Syndication rights filter |
   | `hasCrops` | `true\|false` | | Has exports/crops |
   | `syndicationStatus` | string | | Syndication status filter |
   | `persisted` | `true\|false` | | Is archived or has usages |
   | `expandPinboard` | string | | Pinboard integration (passthrough) |
   | `pinboardId` | string | | Pinboard integration (passthrough) |
   | `pinboardItemId` | string | | Pinboard integration (passthrough) |

   **Key mapping**: `nonFree=true` → API `free=undefined`; `hasCrops` → API `hasExports`

   Selections are NOT in URL (matching kahuna — only `ids=` from Share button).

7. **Column config in localStorage** (not URL) — visibility and widths are persisted per-client via `useColumnStore` with zustand/persist. Key: `kupua-column-config`. Column IDs use TanStack Table's format (dots→underscores). The store also holds session-only `preDoubleClickWidths` (excluded from localStorage persistence via `partialize`) for the double-click fit/restore toggle. Order and sorting will be added when needed.

8. **Scrollbar strategy** — Phase 1 uses simple infinite scroll (append pages) with the native scrollbar — sufficient for 10k docs. Phase 2 (9M docs) will switch to windowed scroll + `search_after` pagination with a custom scrubber (thumb = `windowStart / total`). Phase 6 adds sort-aware date/letter labels, smooth drag, and mobile touch. Full design notes in `kupua/exploration/docs/migration-plan.md` → "Scrollbar & Infinite Scroll — Design Notes".

9. **Local dev domain** — currently `localhost:3000`. Future: add `kupua.media.local.dev-gutools.co.uk` to `dev/nginx-mappings.yml` pointing to port 3000. Trivial change when needed.

10. **URL is single source of truth for search state** — user interactions update the URL via `useUpdateSearchParams`, which triggers `useUrlSearchSync` to push params to the Zustand store and fire a search. When clearing params (e.g. clearing the search box), all URL-managed keys are explicitly reset to `undefined` before applying URL values, so removed params don't survive in the store via spread.

11. **Sort system** — `orderBy` URL param supports comma-separated values for multi-sort (e.g. `-uploadTime,-metadata.credit`). The ES adapter's `buildSortClause` expands aliases per-part (e.g. `taken` → `metadata.dateTaken,-uploadTime`). Column headers, sort dropdown, and URL all use the same sort keys. Secondary sort is managed via shift-click.

12. **TanStack Table column ID gotcha** — when using dot-path accessors (e.g. `"metadata.credit"`), TanStack Table auto-generates column IDs with dots replaced by underscores (`"metadata_credit"`). Any map keyed by column ID must use underscores. This bit us once already.

13. **Custom URL parse/stringify (not `parseSearchWith`)** — TanStack Router's built-in `parseSearchWith` delegates to `qss.decode` which calls `toValue()`, converting `"true"` → boolean `true` and `"123"` → number `123`. Our Zod schema expects all values as strings, so booleans/numbers silently fall through `.catch(undefined)` and are lost. We use fully custom `plainParseSearch`/`plainStringifySearch` based on `URLSearchParams` directly, keeping all values as plain strings. This also avoids `JSON.stringify` wrapping strings in quotes (`%22true%22`). Stale quoted values from old bookmarks are stripped.

14. **CQL chips via `@guardian/cql` Web Component** — The `<cql-input>` custom element (from `@guardian/cql`) handles all chip rendering, editing, keyboard navigation, and typeahead. It is registered once globally in `CqlSearchInput.tsx`. The typeahead fields are built from the DAL via `typeahead-fields.ts` with resolvers that query local ES aggregations on keyword fields. When the DAL switches to the Grid API, the resolvers will automatically use live API endpoints with no UI changes needed.

15. **Mock config for Phase 1** — `kupua/exploration/mock/grid-config.conf` is a sanitised copy of PROD Grid config. `src/lib/grid-config.ts` parses it for field aliases and category lists. This avoids hardcoding and will be replaced by live config fetching in Phase 3.

16. **Start script** — `kupua/scripts/start.sh` is the single entry point for local development. It orchestrates ES startup, data loading, npm install, and Vite dev server. Flags allow skipping steps for faster restarts.

17. **`@/*` path alias** — `@/components/Foo` resolves to `src/components/Foo`. Configured in both `tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`). All imports use this alias.

18. **`App.tsx` deleted** — was dead code after layout moved to `routes/__root.tsx`. Removed during codebase audit.

19. **Font standardisation** — `--font-sans` is overridden in `@theme` to `'Open Sans', ui-sans-serif, system-ui, sans-serif`. This is the Tailwind 4 convention: all elements inherit from `--font-sans` via the base layer, so new elements get Open Sans automatically. Three font sizes: `text-xs` (12px) for UI chrome, `text-sm` (14px) for table cells, 13px for CQL input (Web Component theme). No arbitrary sizes.

20. **Shared popup styling via CSS component classes** — `popup-menu` and `popup-item` are defined in `index.css` `@layer components`. All dropdowns and context menus use these classes for consistent appearance (`bg-grid-panel`, `border-grid-border`, `rounded shadow-lg`, hover highlight). New menus inherit the look automatically.

21. **Auto-reveal hidden columns on sort** — when the user sorts by a column that's currently hidden, the column is automatically shown via `toggleVisibility()` (same store action as the context menu), so it persists as a normal user choice. The user can hide it again anytime. Generic — works for any sortable column, not just specific ones.

## Project Structure

```
kupua/
  docker-compose.yml          # Standalone ES on port 9220
  index.html                   # SPA entry HTML
  package.json                 # Dependencies and scripts
  vite.config.ts               # Vite config with /es proxy to ES:9220, @ alias
  tsconfig.json                # TypeScript config, @ path alias
  .gitignore                   # Ignores sample-data.ndjson, node_modules, dist
  AGENTS.md                    # This file — agent context
  README.md                    # Setup instructions, project structure
  public/
    fonts/                     # Open Sans woff2 files (copied from kahuna) + OFL license
    images/
      grid-logo.svg            # Grid 3×3 logo
      grid-favicon.svg         # Grid favicon
  exploration/
    mock/
      mapping.json             # ES mapping from CODE
      sample-data.ndjson       # 10k docs sample data (NOT in git)
      grid-config.conf         # Sanitised copy of PROD Grid config (aliases, categories)
    docs/
      migration-plan.md        # Full phased migration plan
      deviations.md            # Intentional differences from Grid/kahuna + library convention bends
      safeguards.md            # Elasticsearch + S3 safety documentation
      s3-proxy.md              # S3 thumbnail proxy documentation (temporary)
      imgproxy-research.md     # Research: how eelpie fork replaced nginx imgops with imgproxy
  scripts:
    start.sh                   # One-command startup (ES + data + deps + S3 proxy + imgproxy + dev server)
    load-sample-data.sh        # Index creation + bulk load
    s3-proxy.mjs               # Local S3 thumbnail proxy (uses dev AWS creds, temporary)
  src/                         # ~4700 lines total
    main.tsx                   # React entry point — mounts RouterProvider
    router.ts                  # TanStack Router setup — custom plain-string URL serialisation
    index.css                  # Tailwind CSS import + Open Sans font + Grid colour theme + shared component classes (popup-menu, popup-item)
    routes/
      __root.tsx               # Root route — minimal shell (bg + flex column), no header
      index.tsx                # Index route — validates URL search params via Zod, renders search page
    lib/
      cql.ts                   # CQL parser + CQL→ES query translator (451 lines)
      grid-config.ts           # Mock Grid config parser (field aliases, org-owned categories)
      lazy-typeahead.ts        # LazyTypeahead — deferred value resolution for CQL typeahead (212 lines)
      search-params-schema.ts  # Zod schema for URL search params — single source of truth
      image-urls.ts            # Image URL builders — thumbnails via S3 proxy, full images via imgproxy
      typeahead-fields.ts      # Builds typeahead field definitions for CQL input from DAL (251 lines)
    dal/
      types.ts                 # ImageDataSource interface + SearchParams type
      es-adapter.ts            # Elasticsearch implementation (~273 lines — sort aliases, CQL translation, free-to-use filter)
      index.ts                 # Barrel export
    components/
      CqlSearchInput.tsx       # React wrapper around @guardian/cql <cql-input> Web Component (227 lines)
      DateFilter.tsx           # Date range filter dropdown (486 lines)
      StatusBar.tsx            # Status bar: count + new images ticker + response time
      SearchBar.tsx            # Single-row toolbar: logo + CQL search input + clear button (123 lines)
      SearchFilters.tsx        # Compound component: FilterControls (free-to-use, dates) + SortControls (custom dropdown + direction toggle) (185 lines)
      ImageTable.tsx           # TanStack Table + Virtual, all table features (~1190 lines — largest component)
    stores/
      search-store.ts          # Zustand store (search params, results, loadMore)
      column-store.ts          # Zustand store + localStorage persist (column visibility, widths, pre-double-click widths) (~109 lines)
    types/
      image.ts                 # Image document types from ES mapping
    hooks/
      useUrlSearchSync.ts      # URL↔store sync: useUrlSearchSync (URL→store→search) + useUpdateSearchParams (component→URL)
```

## Kahuna Reference

The existing frontend lives at `kahuna/`. Key files to understand:
- `kahuna/public/js/main.js` — AngularJS app bootstrap, routing, config
- `kahuna/public/js/search/results.js` — search results controller (875 lines)
- `kahuna/public/js/search/index.js` — routing config for search states
- `kahuna/public/js/image/controller.js` — single image view (338 lines)
- `kahuna/public/js/services/api/media-api.js` — API client (search, find, session, etc.)
- `kahuna/public/js/services/image-accessor.js` — helpers to read image resource data
- `kahuna/public/js/components/gu-lazy-table/` — virtual scroll grid component
- `kahuna/public/js/edits/service.js` — metadata editing service
- `kahuna/public/js/services/api/collections-api.js` — collections CRUD

## ES Index Details

- **Index name:** `images` (locally); CODE source was `<es-index-name>`
- **Key searchable fields:** `metadata.englishAnalysedCatchAll` (catch-all text), `metadata.credit` (keyword), `metadata.source` (keyword), `metadata.keywords` (keyword array), `uploadedBy` (keyword)
- **Sort fields:** `uploadTime` (date), `lastModified` (date), `metadata.dateTaken` (date), `metadata.credit` (keyword), `metadata.source` (keyword), `uploadedBy` (keyword), `source.dimensions.width` (integer), `source.dimensions.height` (integer), `source.mimeType` (keyword), `usageRights.category` (keyword), `collections.actionData.date` (date). Text fields (`metadata.title`, `metadata.description`, `metadata.byline`) are NOT sortable (no `.keyword` sub-field).
- **Custom analyzers:** `english_s_stemmer` (minimal English stemmer), `hierarchyAnalyzer` (path_hierarchy tokenizer for collection paths)
- **Embeddings:** `embedding.cohereEmbedEnglishV3.image` — 1024-dim dense vector, cosine similarity, int8_hnsw index

