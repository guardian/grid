# Kupua — Agent Context

> This file is read automatically by GitHub Copilot at the start of each session.
> It provides essential context about the kupua project so the agent can pick up where it left off.
> **Update this file whenever significant decisions are made.**

> **Directives** live in `.github/copilot-instructions.md` (auto-loaded by Copilot
> regardless of which file is open). They are duplicated here for humans, because
> `.github/copilot-instructions.md` is **never committed** (it lives outside `kupua/`).
>
> **Two-file sync rule:** The directives in `.github/copilot-instructions.md` and in
> the `<details>` block below must stay identical. If you add, remove, or change a
> directive in one place, copy the change to the other. The `.github/` file is what
> Copilot actually auto-loads; the copy here is for humans reading `AGENTS.md` and
> for sessions where the `.github/` file might be missing (fresh clone).

<details><summary>Copy of Directives</summary>
# Copilot Instructions — Kupua Directives

> These directives apply when working on the `kupua/` project within this repo.
> Full context lives in `kupua/AGENTS.md`; this file extracts the rules that
> Copilot must always follow so they are loaded automatically regardless of
> which file is open.

**Directive:** After completing any task that adds, removes, or changes features, architecture,
files, or key decisions, update the relevant sections of `kupua/AGENTS.md` (What's Done, What's Next,
Project Structure, Key Architecture Decisions) before finishing your turn. Keep it concise.

**Directive:** Performance is crucial. If any requested change is likely to seriously impact
performance, do not proceed without checking with the user first — explain the potential
impact, suggest mitigations, and consider alternative approaches.

**Directive:** When introducing code that intentionally departs from Grid/kahuna behaviour
or from library defaults/conventions, add an entry to `kupua/exploration/docs/deviations.md`
explaining what, why, and the trade-off.

**Directive:** Never write or modify any file outside the `kupua/` directory without
explicitly asking the user for permission first. This agent's scope is kupua only.
Exception: this file (`.github/copilot-instructions.md`) may be updated freely since
it mirrors directives from `kupua/AGENTS.md`.

**Directive:** Do not commit after every change. It's fine to modify many files over a long
session without committing. **Never commit without explicitly asking the user first.**
If you think a commit is warranted but the user hasn't asked, suggest it and wait for
confirmation. When the user approves, batch changes into sensible chunks grouped by the
problem they solve — not by individual file edits. Never push to remote.

**Directive: REAL SYSTEMS ARE DANGEROUS.** Kupua can be configured to connect to real
Elasticsearch clusters (TEST/CODE/PROD) via SSH tunnels. These clusters serve the entire
Guardian editorial team. **Never** write code that issues write operations (index, delete,
bulk, update, create) against a non-local ES. **Never** weaken or bypass the safeguards
in `es-config.ts` or `load-sample-data.sh` without explicit user approval. **Never**
hardcode real cluster URLs, index names, or credentials in source code. If a task
requires modifying safeguard configuration, stop and explain the risk before proceeding.
See `kupua/exploration/docs/safeguards.md` for the full safety framework.

**Directive:** Think about UX/UI as well as tech. When the user proposes a feature or
interaction pattern, constructively argue about it — raise concerns about usability,
consistency, accessibility, and user expectations, not just technical feasibility.
Don't just implement what's asked; reason about whether it's the right thing to build.
</details>

## What is Kupua?

Kupua is a **new React-based frontend** for [Grid](https://github.com/guardian/grid), the Guardian's image DAM (Digital Asset Management) system. It replaces the existing **kahuna** frontend (AngularJS 1.8).

Grid manages ~9 million images stored in S3, with metadata indexed in **Elasticsearch 8.x**. Kupua lives inside the Grid monorepo at `kupua/`.

## Running Kupua

Single entry point: `kupua/scripts/start.sh`. Two modes:

| Mode | Command | ES source | Needs AWS creds? | Needs sample data? |
|---|---|---|---|---|
| **Local** (default) | `./kupua/scripts/start.sh` | Docker ES on port 9220 | No | Yes — `exploration/mock/sample-data.ndjson` (115MB, not in git) |
| **TEST** | `./kupua/scripts/start.sh --use-TEST` | SSH tunnel to TEST ES on port 9200 | Yes (`media-service` profile) | No — index + S3 buckets discovered at runtime |

**Local mode** starts Docker ES, loads sample data via `scripts/load-sample-data.sh`,
and runs Vite. If `sample-data.ndjson` is missing, startup fails. To get the file you
need access to a Grid ES cluster (CODE/TEST) to extract it — so anyone running local
mode already has credentials and knows the project. There is no credential-free path
to meaningful local development (Grid image metadata is complex; synthetic data would
be misleading).

**`--use-TEST` mode** establishes an SSH tunnel, then auto-discovers the index alias
(via `_cat/aliases`), S3 bucket names (by fetching one document and parsing URLs),
and starts the S3 thumbnail proxy + imgproxy container. Nothing is hardcoded — all
infrastructure names are resolved at runtime.

**Relationship to Grid's scripts:** Grid has its own `dev/script/start.sh` which also
has a `--use-TEST` flag and SSH tunnel logic. Kupua's `start.sh` mirrors the same
patterns (credential check, tunnel establishment, kill-on-mode-switch) but is fully
independent — it manages kupua's own Docker containers (port 9220, imgproxy on 3002)
and never touches Grid's processes. The two scripts can coexist, but both compete for
port 9200 when tunnelling to TEST, so don't run both in `--use-TEST` mode simultaneously.

## Full Migration Plan

📄 **Read the full plan:** `kupua/exploration/docs/migration-plan.md`

It contains:
- Phased migration plan (Phase 1–6)
- Complete kahuna feature inventory with migration status
- Data model reference (ES mapping fields)
- Architecture diagram

📄 **Frontend Philosophy:** `kupua/exploration/docs/frontend-philosophy.md`

Frames the UX/UI thinking: density continuum, "Never Lost" context preservation
(focus/selection/edit state survive view and search changes), click-to-search vs
edit mode, selection vs focus, adjacency algorithm for displaced focus, metadata
panel design, discovery beyond search (faceted filters, histograms, visual
similarity), comparisons with Lightroom/Google Photos/Finder/Darktable/Ansel.
Includes analysis of kahuna's three failed filmstrip/traversal attempts (PRs #2949,
#4573, #4574) and architectural lessons learned. Living document — updated as we discuss.

📄 **Deviations log:** `kupua/exploration/docs/deviations.md`

Documents intentional differences from Grid/kahuna behaviour and places
where library conventions were bent.  Update it when a new deviation is
introduced.

## Current Phase: Phase 2 — Live Elasticsearch (Read-Only)

**Goal:** Connect kupua to real ES clusters (TEST/CODE) via SSH tunnel to validate against ~9M images. Still read-only, no auth, no Grid API. Phase 1 (local sample data) is complete.

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

**App scaffold (~7100 lines of source):**
- ✅ Vite 8 (Rolldown) + React 19 + TypeScript + Tailwind CSS 4, dev server on port 3000
- ✅ Vite proxy: `/es/*` → `localhost:9220` (no CORS needed)
- ✅ Path alias: `@/*` → `src/*` (in both `tsconfig.json` paths and Vite `resolve.alias`)
- ✅ Grid colour palette in `index.css` as Tailwind `@theme` tokens (e.g. `bg-grid-bg`, `text-grid-accent`)
- ✅ Open Sans self-hosted from `public/fonts/` (same woff2 files as kahuna, not CDN); `--font-sans` overridden in `@theme` so all elements inherit it automatically
- ✅ Shared CSS component classes (`popup-menu`, `popup-item`) in `index.css` `@layer components` for consistent dropdown/context menu styling
- ✅ Three standardised font sizes: `text-xs` (12px, all UI chrome), `text-sm` (14px, table body cells), 13px (CQL input Web Component)
- ✅ TypeScript compiles clean (`tsc --noEmit` — zero errors)
- ✅ Error boundary (`ErrorBoundary.tsx`) — class component wrapping `<Outlet />` in `__root.tsx`. Catches render crashes, shows error message + stack + "Try again" / "Reset app" buttons. 2 tests.

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
- ✅ `search-store.ts` — Zustand store for search params, results, `loadMore()`. `loadMore` uses a functional updater with offset guard to prevent duplicate rows on rapid scroll. New-images ticker respects user's date filter (uses whichever `since` is later).
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

**Table view (`ImageTable.tsx`, ~1350 lines):**
- ✅ TanStack Table with virtualised rows (TanStack Virtual), column resizing
- ✅ Column definitions generated from field registry (`field-registry.ts`) — 22 hardcoded fields + config-driven alias columns. The registry is the single source of truth for field ID, label, accessor, CQL key, sort key, formatter, default width, and visibility. ImageTable, SearchFilters, and column-store all consume registry-derived maps.
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
- ✅ Scroll reset on new search — both scrollTop and scrollLeft reset to 0 when URL search params change (new query, sort, filters, logo click). loadMore doesn't change URL params, so infinite scroll is unaffected. Display-only params (`image`) are excluded from scroll-reset comparison.
- ✅ Double-click row to open image — adds `image` to URL search params (push, not replace). The search page stays mounted and fully laid out (invisible via `opacity-0`), preserving scroll position, virtualizer state, and search context. Browser back removes `image` and the table reappears at the exact scroll position with the viewed image focused. Navigation in the image view follows the current search results in their current sort order (line-in-the-sand: navigation always within current search context and order).
- ✅ Row focus (not selection) — single-click sets a sticky highlight on a row (inset box-shadow accent border + brighter background). Focus persists when mouse moves away. Distinct from hover (subtle) and future selection (multi-select for batch ops). Focus is stored in search store (`focusedImageId`), cleared on new search. Returning from image detail auto-focuses the last viewed image; if different from the one originally clicked, centers it in viewport.

**Toolbar (`SearchBar.tsx`) + Status bar (`StatusBar.tsx`) + Filters (`SearchFilters.tsx`):**
- ✅ Search toolbar (44px / `h-11`): `[Logo] [Search] | [Free to use] [Dates] | [Sort ↓]`
- ✅ Status bar (28px, `bg-grid-panel`): `[count matches] [N new] ... [took ms]` — thin strip between search toolbar and table header. Will expand to hold more contextual info in future phases.
- ✅ Column header row height matches search toolbar (44px / `h-11`)
- ✅ Result count always visible (never replaced by a loading indicator — prevents layout shift). Shows last known total, updates when new results arrive.
- ✅ New images ticker — polls ES `_count` every 10s for images uploaded since last search. Styled as filled accent-blue rectangle with white text (matching Grid's `.image-results-count__new`). Tooltip shows count + time since last search. Clicking re-runs the search. No media-api needed — uses DAL `count()` directly against ES.
- ✅ Response time (`took` ms) — right-aligned in results bar
- ✅ Logo click navigates to `/search?nonFree=true` (resets all state), resets scroll position, and focuses the search box
- ✅ Sort dropdown — custom button + popup menu (not native `<select>`) matching column context menu styling. SVG chevron flips when open. Current selection shown with ✓. Closes on outside click or Escape.
- ✅ Sort direction toggle (↑/↓ button) — adjacent to sort dropdown
- ✅ "Free to use only" checkbox (`nonFree` URL param)
- ✅ Date filter dropdown (`DateFilter.tsx`, ~486 lines) — radio type selection, quick-range presets, custom date pickers, blue dot indicator for active range, SVG chevron, open-state highlighting matching hover style. Maps to `since`/`until`/`takenSince`/`takenUntil`/`modifiedSince`/`modifiedUntil` URL params
- ✅ Consistent dropdown styling — all dropdowns (date picker, sort, column context menu) use shared `popup-menu`/`popup-item` CSS classes and matching `bg-grid-panel` background, `border-grid-border`, `rounded shadow-lg`. Buttons stay highlighted while open.
- ✅ Responsive breakpoints — progressive disclosure from mobile to desktop

**Routing (`TanStack Router`):**
- ✅ Zod-validated URL search params (`search-params-schema.ts`)
- ✅ Root route (`__root.tsx`) — minimal shell (bg + flex column)
- ✅ Search route (`search.tsx`) at `/search` — validates params + renders SearchBar + StatusBar + ImageTable. When `image` is in URL params, makes the search UI invisible (`opacity-0 pointer-events-none` — stays fully laid out in DOM to preserve scroll position) and renders `ImageDetail` overlay. No route transition, no unmount, scroll position preserved.
- ✅ Image detail as overlay (not a separate route) — `ImageDetail.tsx` renders within the search route when `image` URL param is present. Double-click row adds `image` (push). Prev/next replaces `image` (replace). Back button/browser back removes `image` → table reappears at exact scroll position. All search context preserved in URL. `image` is a display-only URL param (not synced to search store, doesn't trigger ES search). URL style: `?image=abc123&nonFree=true&query=...` (priority keys first via `URL_PARAM_PRIORITY`).
- ✅ Image detail standalone fetch — when the `image` URL param points to an ID not in the current search results (direct URL, bookmark, `/images/:id` redirect), fetches the image by ID from ES via `dataSource.getById()`. Shows loading state while fetching. Only shows "not found" if the image genuinely doesn't exist in the index. Prev/next navigation is unavailable in standalone mode (no search context).
- ✅ Image detail shows `[x] of [total]` (total from ES, not loaded count). Auto-loads more results when within 5 images of the loaded edge — navigation never ends until the actual end of search results.
- ✅ Asymmetric image prefetch — when viewing image N, prefetches imgproxy URLs for N-2…N-1 (prev) and N+1…N+3 (next) via `new Image().src`. Browser caches them, so flicking to the next image is instant from cache. 2 backward + 3 forward (users flick forward more).
- ✅ Image redirect route (`image.tsx`) at `/images/$imageId` — redirects to `/search?image=:imageId&nonFree=true` for backward compat with bookmarks/shared URLs
- ✅ Index route (`index.tsx`) — redirects `/` → `/search?nonFree=true` (matches kahuna URL schema, Decision 6)
- ✅ Fullscreen survives between images — the fullscreened container is a stable DOM element; React reconciles the same component when only `image` prop changes, so the `<div ref>` stays in the DOM and fullscreen persists

**Keyboard navigation (focus-based):**
- ✅ App starts with caret in search box (`autofocus` on `<cql-input>`)
- ✅ Arrow Up/Down: move focus one row, viewport scrolls to keep focused row visible (works even when caret is in search box — keys propagate from CQL input). If no row is focused, first arrow press focuses the first (↓) or last (↑) row. Disabled when table is hidden (image detail overlay showing).
- ✅ PageUp/PageDown: scroll viewport by one page, then focus the edge row — PageDown focuses the last fully visible row, PageUp focuses the first (matches Finder/Explorer). Scroll is the primary action, focus follows.
- ✅ Home: scroll to top, reset horizontal scroll, focus first row (works even in search box — capture-phase listener intercepts before ProseMirror editor)
- ✅ End: scroll to bottom, focus last loaded row (works even in search box). Triggers loadMore when at the end.
- ✅ Enter: open focused row in image detail (same as double-click)
- ✅ Two-phase keyboard handling: arrows/page/enter use bubble phase (propagated from CQL input's `keysToPropagate`); Home/End use capture phase on `document` to intercept before the CQL editor's shadow DOM can consume them.
- ✅ `f` toggles fullscreen in image detail view (skipped when editable field is focused). `Escape` only exits fullscreen (never navigates or closes image detail).
- ✅ Arrow Down at edge of loaded results triggers loadMore — seamless infinite navigation via keyboard.

### What's Next (Phase 2 remaining)
- [ ] Column reordering via drag-and-drop (extend `column-store.ts` to persist order)
- [ ] Facet filters — dropdown/multi-select for `uploadedBy`, `usageRights.category`, `metadata.source` (use DAL `getAggregation()` for options)
- [ ] Windowed scroll + `search_after` cursor-based pagination (for deep pagination of 9M docs)
- [ ] Custom scrubber (thumb = `windowStart / total`) — see migration-plan.md "Scrollbar & Infinite Scroll" notes

### Deferred to Later Phases
- [ ] `is:GNM-owned` filter with real org config from Grid (currently recognized in CQL but not filtering)
- [ ] `GridApiDataSource` (Phase 3 — replaces ES adapter, adds auth, uses Grid media-api HATEOAS links)
- [ ] Row grouping (e.g. group by credit, source, date) — TanStack Table has built-in `getGroupedRowModel()` + `getExpandedRowModel()` with aggregation functions. Works client-side on loaded rows; for 9M-scale grouping would need server-side via ES composite/terms aggs with `manualGrouping: true`. Consider alongside facet filters.
- [ ] Discovery features beyond faceted filters — date histograms, geographic clustering, credit/source network visualisation, usage pattern analysis, visual similarity (knn on existing embedding vectors), trending/significant_terms. All read-only ES-native. Some depend on mapping enhancements (`mapping-enhancements.md`). See `frontend-philosophy.md` → "Discovery: Beyond Search".

## Tech Stack

| Concern | Choice |
|---|---|
| UI | React 19 with TypeScript |
| Table | TanStack Table v8 (headless, virtualised, column reorder/resize) |
| Virtual Scroll | TanStack Virtual |
| State | Zustand (lightweight, URL sync middleware) |
| Routing | TanStack Router (search params validated via Zod, pairs with TanStack ecosystem) |
| Styling | Tailwind CSS 4 (utility-first, no runtime overhead, dark mode, `@layer components` for shared classes) |
| Build | Vite 8 (Rolldown engine) |
| Data Layer | Abstracted `ImageDataSource` interface — currently `ElasticsearchDataSource` (local or remote via tunnel). `GridApiDataSource` deferred until auth/writes needed |
| Validation | Zod 4 |
| Testing | Vitest (co-located `*.test.ts` files next to source) |
| Dates | date-fns |

## Key Architecture Decisions

1. **Separate ES instance on port 9220** — kupua's `docker-compose.yml` is independent of Grid's. Container `kupua-elasticsearch`, cluster `kupua`, volume `kupua-es-data`. Grid's `dev/script/start.sh` won't affect it.

2. **Data Access Layer (DAL)** — TypeScript interface `ImageDataSource` with methods: `search()`, `count()`, `getById()`, `getAggregation()`. Currently implemented by `ElasticsearchDataSource` (direct ES access). `GridApiDataSource` deferred until auth/writes needed. UI code never knows the difference.

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

16. **Start script** — `kupua/scripts/start.sh` is the single entry point for local development. It orchestrates ES startup, data loading, npm install, and Vite dev server. Flags allow skipping steps for faster restarts. Validates prerequisites before starting: Node version (Vite 8 requires `^20.19.0 || >=22.12.0`), Docker running, port availability (3000 for Vite, 9220 for ES — uses `lsof -sTCP:LISTEN` to avoid false positives from client connections).

17. **`@/*` path alias** — `@/components/Foo` resolves to `src/components/Foo`. Configured in both `tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`). All imports use this alias.

18. **`App.tsx` deleted** — was dead code after layout moved to `routes/__root.tsx`. Removed during codebase audit.

19. **Font standardisation** — `--font-sans` is overridden in `@theme` to `'Open Sans', ui-sans-serif, system-ui, sans-serif`. This is the Tailwind 4 convention: all elements inherit from `--font-sans` via the base layer, so new elements get Open Sans automatically. Three font sizes: `text-xs` (12px) for UI chrome, `text-sm` (14px) for table cells, 13px for CQL input (Web Component theme). No arbitrary sizes.

20. **Shared popup styling via CSS component classes** — `popup-menu` and `popup-item` are defined in `index.css` `@layer components`. All dropdowns and context menus use these classes for consistent appearance (`bg-grid-panel`, `border-grid-border`, `rounded shadow-lg`, hover highlight). New menus inherit the look automatically.

21. **Auto-reveal hidden columns on sort** — when the user sorts by a column that's currently hidden, the column is automatically shown via `toggleVisibility()` (same store action as the context menu), so it persists as a normal user choice. The user can hide it again anytime. Generic — works for any sortable column, not just specific ones.

22. **Fullscreen survives between images** — the Fullscreen API exits fullscreen when the fullscreened element is removed from the DOM. Image detail is rendered as an overlay within the search route (not a separate route), and React reconciles the same `ImageDetail` component when only the `image` prop changes, so the fullscreened `<div ref>` stays in the DOM and fullscreen persists. This is the architectural reason why image detail uses a prop — not a route param. `Escape` only exits fullscreen (never navigates or closes image detail).

23. **Image detail is an overlay, not a separate route** — the image detail view renders within the search route when `image` is present in URL search params (`?image=abc123&nonFree=true&query=...`). The search page stays mounted and fully laid out (`opacity-0 pointer-events-none`, NOT `display:none` — because `display:none` resets `scrollTop` to 0). Scroll position, virtualizer state, and search context are all preserved. Browser back removes `image` from params — the table reappears at the exact scroll position with no re-search. `image` is a display-only URL param: it's excluded from store sync and ES queries via `URL_DISPLAY_KEYS`. Prev/next replaces `image` (so back always returns to the table, not through every viewed image). If the user navigated to a different image via prev/next, the focused row is centered in the viewport on return. `/images/:imageId` redirects to `/search?image=...&nonFree=true` for backward compat. URL param ordering controlled by `URL_PARAM_PRIORITY` — `image` appears first, matching Grid URL style.

24. **"Never Lost" context preservation** — Focus, selection, edit state, and scroll position survive every density/view change (table → grid → single image and back). Views are density levels of the same list, not separate pages. When search context changes and the focused item leaves the result set, kupua snaps focus to the **most adjacent surviving item** from the previous result set (nearest neighbour scan, alternating forward/backward), rather than resetting to the top. Selections that survive the new results are kept; missing ones are silently dropped. Edit state on a displaced image is preserved with a subtle "not in current results" indicator. Full algorithm and rationale in `frontend-philosophy.md` → "Context is Sacred".

25. **Actions written once, context-adaptive** — Action buttons (Crop, Delete, Download, Archive, Share, Add to Collection, Set Rights, etc.) are each implemented as a single component that accepts an `images` array. An `ActionBar` component derives `targetImages` from current state (focused image, selection, or current detail image) and renders all actions. Labels, enabled state, and confirmation dialogs adapt to the image count — but core logic is identical regardless of which view density the user is in. Kahuna already uses `images` arrays for its action components; kupua formalises this into one `ActionBar` mounted in a stable toolbar position, never duplicated per view. See `frontend-philosophy.md` → "Actions are Written Once".

26. **Field Definition Registry** — `src/lib/field-registry.ts` is the single source of truth for every image field kupua can display, search, sort, or aggregate. Each `FieldDefinition` captures: identity (id, label, group), data access (accessor, rawValue), search (cqlKey, esSearchPath), sort (sortKey, descByDefault), display (defaultWidth, defaultHidden, formatter, cellRenderer), and type metadata (fieldType, isList, isComposite, editable, aggregatable). Config-driven alias fields from `grid-config.ts` are merged in automatically. Consumers (`ImageTable`, `SearchFilters.Sort`, `column-store`, future MetadataPanel/grid view) import derived maps (`COLUMN_CQL_KEYS`, `SORTABLE_FIELDS`, `DESC_BY_DEFAULT`, `DEFAULT_HIDDEN_COLUMNS`, `SORT_DROPDOWN_OPTIONS`) and helper functions (`getFieldRawValue`, `getFieldDisplayValue`) — they never hardcode field knowledge. ImageTable generates TanStack column defs from the registry via `fieldToColumnDef()`. **Coupling note:** `fieldType` and `aggregatable` restate the ES mapping — if the mapping changes (e.g. mapping-enhancements.md §2a), these must be updated. When facet filters are built, consider dynamic introspection via `_mapping` at startup instead.

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
      frontend-philosophy.md   # UX/UI philosophy: density continuum, interaction patterns, comparisons
      deviations.md            # Intentional differences from Grid/kahuna + library convention bends
      safeguards.md            # Elasticsearch + S3 safety documentation
      s3-proxy.md              # S3 thumbnail proxy documentation (temporary)
      imgproxy-research.md     # Research: how eelpie fork replaced nginx imgops with imgproxy
      mapping-enhancements.md  # Proposed ES mapping improvements
  scripts:
    start.sh                   # One-command startup (ES + data + deps + S3 proxy + imgproxy + dev server)
    load-sample-data.sh        # Index creation + bulk load
    s3-proxy.mjs               # Local S3 thumbnail proxy (uses dev AWS creds, temporary)
  src/                         # ~6700 lines total
    main.tsx                   # React entry point — mounts RouterProvider
    router.ts                  # TanStack Router setup — custom plain-string URL serialisation
    index.css                  # Tailwind CSS import + Open Sans font + Grid colour theme + shared component classes (popup-menu, popup-item)
    routes/
      __root.tsx               # Root route — minimal shell (bg + flex column), no header
      index.tsx                # Index route — redirects `/` → `/search?nonFree=true`
      search.tsx               # Search route — validates URL search params via Zod, renders search page + ImageDetail overlay when image param present
      image.tsx                # Image redirect — `/images/$imageId` → `/search?image=...&nonFree=true`
    lib/
      cql.ts                   # CQL parser + CQL→ES query translator (451 lines)
      field-registry.ts        # Field Definition Registry — single source of truth for all image fields (615 lines)
      field-registry.test.ts   # Registry tests: derived maps match old hardcoded values, accessors, formatters (34 tests)
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
      ErrorBoundary.tsx        # React error boundary — catches render crashes, shows recovery UI
      ErrorBoundary.test.tsx   # 2 tests: renders children, catches errors
      ImageDetail.tsx          # Single-image view: overlay within search route, fullscreen (black, no UI), prev/next navigation
      StatusBar.tsx            # Status bar: count + new images ticker + response time
      SearchBar.tsx            # Single-row toolbar: logo + CQL search input + clear button (123 lines)
      SearchFilters.tsx        # Compound component: FilterControls (free-to-use, dates) + SortControls (custom dropdown + direction toggle) (185 lines)
      ImageTable.tsx           # TanStack Table + Virtual, all table features (~1350 lines — column defs generated from field-registry.ts)
    stores/
      search-store.ts          # Zustand store (search params, results, loadMore)
      column-store.ts          # Zustand store + localStorage persist (column visibility, widths, pre-double-click widths) (~109 lines)
    types/
      image.ts                 # Image document types from ES mapping
    hooks/
      useUrlSearchSync.ts      # URL↔store sync: useUrlSearchSync (URL→store→search) + useUpdateSearchParams (component→URL)
      useFullscreen.ts         # Fullscreen API wrapper — toggle/enter/exit fullscreen on a stable DOM element
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

