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
See `kupua/exploration/docs/infra-safeguards.md` for the full safety framework.

**Directive:** Think about UX/UI as well as tech. When the user proposes a feature or
interaction pattern, constructively argue about it — raise concerns about usability,
consistency, accessibility, and user expectations, not just technical feasibility.
Don't just implement what's asked; reason about whether it's the right thing to build.

**Directive: Push back. Hard.** The user STRONGLY prefers that you argue against
doing things when the complexity, risk, or marginal value doesn't justify the work.
The biggest failure mode is following instructions too literally — implementing
exactly what's asked without questioning whether it should be done at all. Say "no,
and here's why" when appropriate. Say "this isn't worth it because…" when it isn't.
The user considers this the single most valuable behaviour the agent can have.

**Directive: Commit messages.** Never pass multiline commit messages via `git commit -m`
in the shell — special characters and line breaks get mangled by zsh quoting. Instead:
write the message to a temp file (e.g. via a heredoc or the file-creation tool), then
run `git commit -F <file>`, then delete the temp file and `git commit --amend --no-edit`.

**Directive: Two-file sync rule.** The directives in `.github/copilot-instructions.md`
and in the `<details>` block in `kupua/AGENTS.md` must stay identical. If you add,
remove, or change a directive in one place, copy the change to the other. The `.github/`
file is what Copilot actually auto-loads; the copy in `AGENTS.md` is for humans and for
sessions where the `.github/` file might be missing (fresh clone).
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

📄 **Performance analysis:** `kupua/exploration/docs/performance-analysis.md`

26 findings across render, scroll, state, network, memory, layout, CSS,
accessibility. Scannable issue table (severity + fix-now/fix-later/watch),
then detailed per-issue analysis. Includes imgproxy latency benchmark, scrubber
architecture prerequisites, filmstrip perf concerns, "Never Lost" perf budget.
Action plan: 5 easy fix-now items (~75 min total), 9 fix-later items blocked by
scrubber/`search_after`, 11 watch items.

📄 **Grid view plan:** `kupua/exploration/docs/grid-view-plan.md`

Plan for the thumbnail grid view (the first additional density). Contains:
thorough analysis of kahuna's grid (cell composition, interactions,
keyboard nav, selection, scroll position), what to take/skip, architecture
stress tests, and preliminary design decisions. Read this before starting
grid view work.

📄 **Kahuna scroll analysis:** `kupua/exploration/docs/kahuna-scroll-analysis.md`

Deep read of kahuna's scroll/pagination architecture (`gu-lazy-table`,
sparse arrays, `from/size`, RxJS reactive pipeline). Covers the 100k cap,
result set freezing, duplicate detection. Lessons for kupua's `useDataWindow`.
Grid-view-specific analysis is in `grid-view-plan.md` instead.

📄 **Panels plan:** `kupua/exploration/docs/panels-plan.md`

Design and implementation plan for the side-panel system. Both panels (left:
filters + collections; right: metadata/info), resize handles, accordion sections,
keyboard shortcuts (`[`/`]`), grid view scroll anchoring on any width change.
Facet filter design (batched aggregations, which fields, interaction with toolbar
filters). Kahuna panel reference. Prior art (Lightroom, Bridge, Darktable/Ansel,
IDEs). Decided-against log (overlay mode, per-facet accordions, per-section shortcuts).
Aggregation performance & safeguards section: lazy fetching (only when Filters
section expanded), query-keyed cache, separate 500ms debounce, circuit breaker,
CloudWatch metrics to watch, honest load analysis for 50+ concurrent users on 9M docs.

📄 **Metadata display plan:** `kupua/exploration/docs/metadata-display-plan.md`

Design plan for the metadata panel (`ImageMetadata.tsx`). Thorough analysis of
kahuna's `gr-image-metadata` (~1066 lines template, ~665 lines JS). Covers:
display rules (the 4-way decision tree per field), field visibility (hide empty
fields for non-editors), click-to-search (Shift/Alt modifiers), hover-to-reveal
edit button (✎), multi-selection reconciliation (`rawMetadata`/`displayMetadata`
split, `getSetOfProperties()`), field types and edit UI (inline text, textarea,
select, datetime, typeahead, compound location), list fields (pill pattern with
partial indicators), field ordering. Phased build plan: Phase 1 (display
improvements — search links, visibility, ordering), Phase 3 (editing with
GridApiDataSource + auth), Phase 4 (multi-selection reconciliation).

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
- ✅ imgproxy for full-size images — `darthsim/imgproxy` Docker container (port 3002) with S3 access via host AWS credentials volume mount. Container runs as uid 999 (`imgproxy` user, not root), so credentials mount to `/home/imgproxy/.aws/`. Janus only writes `[media-service]` to `~/.aws/credentials` — the Go AWS SDK also needs a `[profile media-service]` entry in the config file, so `start.sh` generates a minimal config at `/tmp/kupua-aws-config` (no secrets — just profile name + region). Resizes originals on the fly to WebP (1200px fit, quality 80). Auto-started by `start.sh --use-TEST` via docker compose profile. URL builder in `src/lib/image-urls.ts` (`getFullImageUrl()`). `IMGPROXY_MAX_SRC_RESOLUTION: 510` (510MP — default 16.8MP rejects large press panoramas/scans; 510 covers the largest known test image). `IMGPROXY_DOWNLOAD_TIMEOUT: 10` (default 5s; the 510MP image takes ~5.1s). See `exploration/docs/imgproxy-research.md`.
- ✅ Migration plan: `exploration/docs/migration-plan.md`
- ✅ Mock Grid config: `exploration/mock/grid-config.conf` (sanitised PROD copy, parsed by `src/lib/grid-config.ts` for field aliases + categories)

**App scaffold (~8900 lines of source):**
- ✅ Vite 8 (Rolldown) + React 19 + TypeScript + Tailwind CSS 4, dev server on port 3000
- ✅ Vite proxy: `/es/*` → `localhost:9220` (no CORS needed)
- ✅ Path alias: `@/*` → `src/*` (in both `tsconfig.json` paths and Vite `resolve.alias`)
- ✅ Grid colour palette in `index.css` as Tailwind `@theme` tokens (e.g. `bg-grid-bg`, `text-grid-accent`)
- ✅ Open Sans self-hosted from `public/fonts/` (same woff2 files as kahuna, not CDN); `--font-sans` overridden in `@theme` so all elements inherit it automatically
- ✅ Shared CSS component classes (`popup-menu`, `popup-item`) in `index.css` `@layer components` for consistent dropdown/context menu styling
- ✅ Standardised font sizes: `text-sm` (14px, UI chrome — toolbar, filters, menus, labels, buttons), `text-xs` (13px, data — table body cells, grid descriptions, metadata panel labels and values), `text-2xs` (12px, dimmed secondary metadata — grid cell dates). 13px for CQL input Web Component. Arbitrary one-off sizes (`text-[10px]` etc.) should be avoided — prefer theme tokens when a new size is genuinely needed.
- ✅ TypeScript compiles clean (`tsc --noEmit` — zero errors)
- ✅ Error boundary (`ErrorBoundary.tsx`) — class component wrapping `<Outlet />` in `__root.tsx`. Catches render crashes, shows error message + stack + "Try again" / "Reset app" buttons. 2 tests.

**Data Access Layer (DAL):**
- ✅ `ImageDataSource` interface (`dal/types.ts`) — `search()`, `count()`, `getAggregation()`, `getAggregations()` (batched multi-field terms aggs in one ES request)
- ✅ `ElasticsearchDataSource` adapter (`dal/es-adapter.ts`) — queries ES via Vite proxy, handles sort aliases, CQL→ES translation. `count()` uses `_count` endpoint for lightweight polling (new images ticker). `getAggregations()` batches N terms aggs into a single `size:0` request using the same `buildQuery()` filters.
- ✅ Configurable ES connection (`dal/es-config.ts`) — env vars for URL (`KUPUA_ES_URL`), index (`VITE_ES_INDEX`), local flag (`VITE_ES_IS_LOCAL`). Defaults to local docker ES on port 9220.
- ✅ Phase 2 safeguards (see `exploration/docs/infra-safeguards.md`):
  1. `_source` excludes — strips heavy fields (EXIF, XMP, Getty, embeddings) from responses
  2. Request coalescing — AbortController cancels in-flight search when a new one starts
  3. Write protection — only `_search`/`_count`/`_cat/aliases` allowed on non-local ES; `load-sample-data.sh` refuses to run against non-9220 port
  4. S3 proxy — read-only `GetObject` only, localhost-bound, uses developer's existing AWS creds (never committed)
- ✅ Vite env types declared in `src/vite-env.d.ts`

**State management:**
- ✅ `search-store.ts` — Zustand store for search params, results, `loadMore()`, `loadRange()`, incremental `imagePositions` Map. `loadMore` uses a functional updater with offset guard to prevent duplicate rows on rapid scroll. `imagePositions` is maintained incrementally — O(page size) per load, not O(total loaded). New-images ticker respects user's date filter (uses whichever `since` is later). Tracks ES `took` time from primary search and rolling `scrollAvg` from loadRange calls.
- ✅ `column-store.ts` — Zustand + localStorage persist for column visibility, widths, and session-only pre-double-click widths
- ✅ URL is single source of truth — `useUrlSearchSync` hook syncs URL → Zustand → search; `useUpdateSearchParams` hook lets components update URL. Browser back/forward works. `resetSearchSync()` busts the dedup for logo clicks that need to force a fresh search even when params appear unchanged.
- ✅ Custom URL serialisation in `router.ts` — uses `URLSearchParams` directly (not TanStack Router's `parseSearchWith`/`qss`), keeping all values as plain strings. Colons kept human-readable. See deviations.md §1 for rationale.

**CQL search:**
- ✅ `@guardian/cql` parser + custom CQL→ES translator in `src/lib/cql.ts`. `MATCH_FIELDS` mirrors Grid's `MatchFields.scala` — includes `id` first so pasting an image ID into the search box finds it.
- ✅ `<cql-input>` Web Component for chip rendering, editing, keyboard nav, typeahead — wrapped by `CqlSearchInput.tsx`
- ✅ `LazyTypeahead` (`lazy-typeahead.ts`) — subclass of `@guardian/cql`'s `Typeahead` that decouples key suggestions from value resolution. Prevents the popover from stalling when a slow value resolver is in flight. See deviations.md §12.
- ✅ Typeahead fields built from DAL (`typeahead-fields.ts`) with resolvers using local ES aggregations (terms aggs on keyword fields). Fields without keyword mappings (byline, city, etc.) have no value suggestions — same as kahuna.
- ✅ CQL structural noise filtering — `SearchBar` ignores `queryStr` values that are pure CQL structure (e.g. bare `":"` from empty chips when pressing `+`), preventing spurious searches. Kahuna handles this via its structured query pipeline; kupua filters at the `handleQueryChange` level.
- ✅ Supports structured queries: `credit:"Getty" -by:"Foo" cats fileType:jpeg`
- ✅ `fileType:jpeg` → `source.mimeType` match with MIME conversion (matching Scala `FileTypeMatch`)
- ✅ `is:GNM-owned` — recognized but requires org config from Grid (mocked for now)

**Table view (`ImageTable.tsx`, ~1260 lines):**
- ✅ TanStack Table with virtualised rows (TanStack Virtual), column resizing
- ✅ Column definitions generated from field registry (`field-registry.ts`) — 21 hardcoded fields + config-driven alias columns. The registry is the single source of truth for field ID, label, accessor, CQL key, sort key, formatter, default width, and visibility. ImageTable, SearchFilters, and column-store all consume registry-derived maps.
- ✅ Dimensions column — single column showing oriented `w × h` (e.g. `5,997 × 4,000`), sortable by total pixel count via Painless script sort (orientation-agnostic since `w × h == h × w`). Replaces separate Width/Height columns. Script sort only evaluated when user sorts by this field. See deviations.md §10.
- ✅ Location is a composite column: subLocation, city, state, country (fine→coarse display). Click-to-search uses `in:` which searches all four sub-fields. Not sortable (text-analysed fields).
- ✅ Subjects and People are list columns: each item rendered individually with per-item click-to-search (`subject:value`, `person:value`). Not sortable (text-analysed fields).
- ✅ Config-driven alias columns — generated from `gridConfig.fieldAliases` where `displayInAdditionalMetadata === true`. Values resolved via `resolveEsPath()` (dot-path traversal into `image.fileMetadata`). All keyword type → sortable. Hidden by default. Click-to-search uses alias name as CQL key. CQL parser resolves alias → `elasticsearchPath` for search.
- ✅ Sort on any keyword/date/numeric column by clicking header. Text-only fields (Title, Description, etc.) not sortable (no `.keyword` sub-field). Single click is delayed 250ms to distinguish from double-click.
- ✅ Secondary sort via shift-click (encoded as comma-separated `orderBy` URL param)
- ✅ Sort alias system — `buildSortClause` expands aliases per-part (e.g. `taken` → `metadata.dateTaken,-uploadTime`) and supports `_script:` prefixed sort keys for Painless script sorts (used by Dimensions).
- ✅ Auto-reveal hidden columns when sorted — if the user sorts by a column that's currently hidden (e.g. Last modified), it's automatically shown and persisted to the store as if toggled manually. Generic — works for any sortable hidden column.
- ✅ Click-to-search — shift-click cell to append `key:value` to query; alt-click to exclude. If the same `key:value` already exists with opposite polarity, flips it in-place (no duplicate chips). AST-based matching via `cql-query-edit.ts` using `@guardian/cql`'s parser. CQL editor remount workaround for polarity-only changes — see deviations.md §13. Upstream fix: [guardian/cql#121](https://github.com/guardian/cql/pull/121); remove workaround after merge+release.
- ✅ Accessibility — ARIA roles on table (`role="grid"`, `role="row"`, `role="columnheader"` with `aria-sort`, `role="gridcell"`), context menu (`role="menu"`, `role="menuitemcheckbox"`), sort dropdown (`role="listbox"`, `role="option"`), resize handles (`role="separator"`), loading indicator (`aria-live`), result count (`role="status"`), toolbar (`role="toolbar"`), search landmark (`role="search"`). All zero-performance-cost — HTML attributes only.
- ✅ Cell tooltips via `title` attribute
- ✅ Column visibility — right-click header for context menu. Default hidden: Last modified, File type, Suppliers reference, Byline title, all config-driven alias columns. Persisted to localStorage.
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
- ✅ Row focus (not selection) — single-click sets a sticky highlight on a row (`ring-2 ring-inset ring-grid-accent` + `bg-grid-hover/40`). Focus persists when mouse moves away. Distinct from hover (`bg-grid-hover/15` — dimmer, no ring). Harmonised with grid view: both densities use the same background tint and accent ring for focus. Focus is stored in search store (`focusedImageId`), cleared on new search. Returning from image detail auto-focuses the last viewed image; if different from the one originally clicked, centers it in viewport.

**Grid view (`ImageGrid.tsx`, ~470 lines):**
- ✅ Thumbnail grid density — alternative rendering of the same result set. Consumes `useDataWindow()` for data, focus, and gap detection — zero data layer duplication. Grid is the default view (matching Kahuna); table opt-in via URL param `density=table`.
- ✅ Responsive columns via `ResizeObserver` — `columns = floor(containerWidth / 280)`. Row-based TanStack Virtual (each virtual row renders N cells). Equal-size cells (editorial neutrality — differently-sized images shouldn't influence picture editors). Cell width computed in the ResizeObserver callback (not inline during render) to avoid layout shift on first interaction.
- ✅ S3 thumbnails — uses `getThumbnailUrl()` from `image-urls.ts`. Local mode shows "No thumbnail" placeholder (acceptable). Unloaded grid cells and table rows use subtle static backgrounds (no `animate-pulse` — avoids visual noise during fast scroll).
- ✅ Cell layout matches Kahuna — 303px total height, 190px thumbnail area (block layout, top-aligned, horizontally centred via `margin: auto`), metadata below. `max-height: 186px` on image (= Kahuna's `max-height: 98%` of 190px).
- ✅ Rich tooltips — description tooltip (description + By + Credit with `[none]` fallbacks, colon-aligned) on both thumbnail and description text. Date tooltip (Uploaded + Taken + Modified, colon-aligned) extends Kahuna's two dates to three.
- ✅ Focus ring + keyboard navigation with grid geometry — ArrowLeft/Right = ±1, ArrowUp/Down = ±columns, Home/End. Enter opens focused image. Same `moveFocus` viewport-aware start as table (no focus → start from visible viewport). Focus/hover harmonised with table: focus = `ring-2 ring-grid-accent` + `bg-grid-hover/40` + `shadow-lg`, hover = `bg-grid-hover/15` (background only, no ring).
- ✅ Double-click cell opens image detail (same overlay architecture as table).
- ✅ Scroll reset on new search, return-from-detail scroll preservation (only scrolls if user navigated to different image via prev/next).
- ✅ Density switch preserves viewport position — `density-focus.ts` saves the focused item's viewport ratio (0=top, 1=bottom) on unmount, restores on mount via `useLayoutEffect` (before paint, no visible jump). Falls back to `align: "center"` on initial load. Module-level state — no React, no Zustand, 5 lines.
- ✅ Scroll anchoring on column count change — when container width changes (panel toggle/resize, browser window resize) and the column count changes, captures the focused/viewport-centre image's position before React re-renders and restores it in a `useLayoutEffect`. No visible jump. Generic `ResizeObserver` improvement, not panel-specific.

**Toolbar (`SearchBar.tsx`) + Status bar (`StatusBar.tsx`) + Filters (`SearchFilters.tsx`):**
- ✅ Search toolbar (44px / `h-11`): `[Logo] [Search] | [Free to use] [Dates] | [Sort ↓]`
- ✅ Status bar (28px, `bg-grid-panel`, `items-stretch`): `[Browse toggle] | [count matches] [N new] ... | [density toggle] | [Details toggle]`. Panel toggle buttons are full-height strips (not lozenges) with icon + label. When active, button extends 1px below the bar's `border-b` with `bg-grid-panel` to visually merge with the panel beneath (tab effect). Both states have identical geometry — only colour/background changes, so labels never shift on toggle. Dividers are full-height. Middle content items self-pad.

**Panels (`PanelLayout.tsx`, `panel-store.ts`):**
- ✅ Panel store — Zustand + localStorage persist for panel visibility, widths, section open/closed state. Two zones (left, right), two states each (visible/hidden). Default widths: left 280px, right 320px. Min 200px, max 50% viewport. Section defaults: Filters collapsed (Decision #13), Collections expanded, Metadata expanded.
- ✅ Panel layout — flex row of `[left-panel?] [resize-handle] [main-content] [resize-handle] [right-panel?]`. Resize handles: 4px visual / full-height hit target, CSS-only width update during drag (no React re-render per frame), commit to store on mouseup. Double-click resize handle to close panel. Main content fills remaining space via `flex-1 min-w-0`. Browser scroll anchoring disabled on panel scroll containers (`overflow-anchor: none`) — we handle scroll anchoring manually in FacetFilters.
- ✅ Keyboard shortcuts: `[` toggles left panel, `]` toggles right panel. `Alt+[`/`Alt+]` when focus is in an editable field (search box etc.). Centralised shortcut system in `lib/keyboard-shortcuts.ts` — single `document` capture-phase listener, `useKeyboardShortcut` hook for component registration, stack semantics for priority. All single-character shortcuts follow the same pattern: bare key when not editing, Alt+key when editing. Exported `ALT_SYMBOL` (⌥ on Mac, Alt+ on Windows), `ALT_CLICK`, and `shortcutTooltip()` for platform-aware UI text. See deviations.md §15.
- ✅ AccordionSection component — collapsible sections within panels. Header always visible with disclosure triangle, content collapses to zero height. Open/closed state persisted to panel store → localStorage. Bottom border only when collapsed — prevents flash on reload when section is expanded but content hasn't loaded yet.
- ✅ Aggregation batching (`search-store.ts` + `dal/es-adapter.ts`) — `fetchAggregations()` action: single ES `size:0` request with N named terms aggs (one per aggregatable field from field registry). Query-keyed cache (skips if params unchanged), 500ms debounce, circuit breaker at 2s (disables auto-fetch, shows manual refresh), abort controller for cancellation. Fetched lazily — only when Filters section is expanded (Decision #9, #13). Agg `took` time tracked in store.
- ✅ Facet filters (`FacetFilters.tsx`, ~275 lines) — left panel content inside AccordionSection. Renders all aggregatable fields with value lists and compact counts (1.8M, 421k format — Decision #14). Click adds CQL chip, Alt+click excludes, click again removes. Active filters highlighted in accent, excluded in red with strikethrough. Uses `findFieldTerm`/`upsertFieldTerm` from `cql-query-edit.ts`. "Show more" per field — fetches a separate single-field request at 100 buckets (not mixed into the recurring batch). Expanded state cleared on new search (not persisted). "Show fewer" scroll-anchors the field header to the top of the panel (prevents losing position after collapsing a long list). Platform-aware tooltips (⌥click on Mac, Alt+click on Windows) via `ALT_CLICK` from `keyboard-shortcuts.ts`.
- ✅ Shared metadata component (`ImageMetadata.tsx`, ~350 lines) — extracted from ImageDetail. **Layout replicates Kahuna's visual structure**: two display modes — `MetadataBlock` (stacked: label above value) for Title, Description, Special instructions, Keywords; `MetadataRow` (inline: label left 30%, value right 70%) for most other fields. Labels are bold (`font-weight: bold` matching Kahuna's `.metadata-line__key`). **Section dividers** replicate Kahuna's `image-info__group` exactly — solid `border-bottom: 1px solid #565656` with `padding: 10px` (Tailwind `py-2.5 border-grid-separator`). These dividers are orientation landmarks — they appear at consistent vertical positions, letting users know where they are in the panel without reading labels. Sections with no visible fields auto-hide. **Section order matches Kahuna**: Rights/Category → Title/Description → Special instructions → Core metadata (Taken on, By, Credit, Location, Copyright, Source, Uploaded, Uploader, Subjects, People) → Keywords → Technical → Image ID. **Persistent underlines** on clickable values replicate Kahuna's `.metadata-line__info a { border-bottom: 1px solid #999 }` — `decoration-[#999]` with `underline-offset-2`, not hover-dependent. Values are clickable search links: click replaces query with `field:"value"`, Shift+click appends (AND), Alt+click excludes (NOT) — same modifier pattern as table cells and facet filters. Uses `upsertFieldTerm` + `cancelSearchDebounce` for CQL integration. Location sub-parts (subLocation, city, state, country) rendered as individual search links with correct CQL keys. List fields (subjects, people, keywords) rendered as search pills (`SearchPill.tsx`) — pill-shaped buttons with click-to-search, shared between metadata panel and table view (`DataSearchPill`). Rendering is intentionally **not shared** between table and metadata panel — table needs compact inline cells with data-attribute delegation, CSS-variable widths, and virtualizer integration; metadata panel needs block-layout `<dl>`, wrapped text, and direct callbacks. Coupling them would add complexity for minimal code savings. Field visibility follows Kahuna's non-editor rules: empty fields hidden (no editors yet). No layout chrome — callers provide container styling. Used by ImageDetail sidebar and right side panel (`FocusedImageMetadata`). Platform-aware tooltips ("Shift+click to add, ⌥click to exclude").
- ✅ Column header row height matches search toolbar (44px / `h-11`)
- ✅ Result count always visible (never replaced by a loading indicator — prevents layout shift). Shows last known total, updates when new results arrive.
- ✅ New images ticker — polls ES `_count` every 10s for images uploaded since last search. Styled as filled accent-blue rectangle with white text (matching Grid's `.image-results-count__new`). Tooltip shows count + time since last search. Clicking re-runs the search. No media-api needed — uses DAL `count()` directly against ES.
- ✅ ES timing display — `took` ms from primary search + rolling `scrollAvg` ms from loadRange calls, shown in search toolbar (far right). `SearchResult.took` plumbed from ES response through DAL → search store → SearchBar.
- ✅ Logo click navigates to `/search?nonFree=true` (resets all state), resets scroll position (both table and grid scroll containers), focuses the search box, and forces a fresh search via `resetSearchSync()`. Works identically from both SearchBar and ImageDetail.
- ✅ Sort dropdown — custom button + popup menu (not native `<select>`) matching column context menu styling. SVG chevron flips when open. Current selection shown with ✓. Closes on outside click or Escape.
- ✅ Sort direction toggle (↑/↓ button) — adjacent to sort dropdown
- ✅ "Free to use only" checkbox (`nonFree` URL param)
- ✅ Date filter dropdown (`DateFilter.tsx`, ~486 lines) — radio type selection, quick-range presets, custom date pickers, blue dot indicator for active range, SVG chevron, open-state highlighting matching hover style. Maps to `since`/`until`/`takenSince`/`takenUntil`/`modifiedSince`/`modifiedUntil` URL params
- ✅ Consistent dropdown styling — all dropdowns (date picker, sort, column context menu) use shared `popup-menu`/`popup-item` CSS classes and matching `bg-grid-panel` background, `border-grid-border`, `rounded shadow-lg`. Buttons stay highlighted while open.
- ✅ Responsive breakpoints — progressive disclosure from mobile to desktop

**Routing (`TanStack Router`):**
- ✅ Zod-validated URL search params (`search-params-schema.ts`)
- ✅ Root route (`__root.tsx`) — minimal shell (bg + flex column)
- ✅ Search route (`search.tsx`) at `/search` — validates params + renders SearchBar + StatusBar + ImageGrid (default) or ImageTable (`density=table`). When `image` is in URL params, makes the search UI invisible (`opacity-0 pointer-events-none` — stays fully laid out in DOM to preserve scroll position) and renders `ImageDetail` overlay. No route transition, no unmount, scroll position preserved.
- ✅ Image detail as overlay (not a separate route) — `ImageDetail.tsx` renders within the search route when `image` URL param is present. Double-click row adds `image` (push). Prev/next replaces `image` (replace). Back button/browser back removes `image` → table reappears at exact scroll position. All search context preserved in URL. `image` is a display-only URL param (not synced to search store, doesn't trigger ES search). URL style: `?image=abc123&nonFree=true&query=...` (priority keys first via `URL_PARAM_PRIORITY`).
- ✅ Image detail standalone fetch — when the `image` URL param points to an ID not in the current search results (direct URL, bookmark, `/images/:id` redirect), fetches the image by ID from ES via `dataSource.getById()`. Shows loading state while fetching. Only shows "not found" if the image genuinely doesn't exist in the index. Prev/next navigation is unavailable in standalone mode (no search context).
- ✅ Image detail offset cache — when entering image detail (double-click or prev/next), the image's index in search results is stored in `sessionStorage` alongside a search-params fingerprint (`searchKey`). On page reload, if the image isn't in the first page of results, the cached offset is used to `loadRange()` around the expected position, restoring counter + prev/next navigation. The offset is only used when the current query/sort/filters match the stored fingerprint — prevents applying a stale offset from a different search. Per-tab, clears on tab close. Waits for `total > 0` before attempting restore (avoids race with initial search). See `image-offset-cache.ts`.
- ✅ Image detail shows `[x] of [total]` (total from ES, not loaded count). Auto-loads more results when within 5 images of the loaded edge — navigation never ends until the actual end of search results.
- ✅ Debounced cancellable prefetch — nearby images (2 prev + 3 next) prefetched via `fetch()` + `AbortController`, debounced by 400ms. During rapid flicking, zero prefetches fire (timer resets on each navigation). When the user settles, prefetch warms the browser HTTP cache. On navigation, in-flight prefetches are aborted — no more zombie requests clogging the connection pool.
- ✅ Image redirect route (`image.tsx`) at `/images/$imageId` — redirects to `/search?image=:imageId&nonFree=true` for backward compat with bookmarks/shared URLs
- ✅ Index route (`index.tsx`) — redirects `/` → `/search?nonFree=true` (matches kahuna URL schema, Decision 6)
- ✅ Fullscreen survives between images — the fullscreened container is a stable DOM element; React reconciles the same component when only `image` prop changes, so the `<div ref>` stays in the DOM and fullscreen persists

**Keyboard navigation (`useListNavigation.ts`, ~327 lines — shared hook):**
- ✅ Extracted from ImageTable and ImageGrid into a shared hook parameterised by geometry. Table passes `columnsPerRow: 1`, grid passes `columnsPerRow: N`. Same `moveFocus`/`pageFocus`/`home`/`end` logic, one implementation.
- ✅ App starts with caret in search box (`autofocus` on `<cql-input>`)
- ✅ Arrow Up/Down: move focus one row, viewport scrolls to keep focused row visible (works even when caret is in search box — keys propagate from CQL input). If no row is focused, first arrow press focuses the first (↓) or last (↑) row. Disabled when table is hidden (image detail overlay showing).
- ✅ PageUp/PageDown: scroll viewport by one page, then focus the edge row — PageDown focuses the last fully visible row, PageUp focuses the first (matches Finder/Explorer). Scroll is the primary action, focus follows.
- ✅ Home: scroll to top, reset horizontal scroll, focus first row (works even in search box — capture-phase listener intercepts before ProseMirror editor)
- ✅ End: scroll to bottom, focus last loaded row (works even in search box). Triggers loadMore when at the end.
- ✅ Enter: open focused row in image detail (same as double-click)
- ✅ Two-phase keyboard handling: arrows/page/enter use bubble phase (propagated from CQL input's `keysToPropagate`); Home/End use capture phase on `document` to intercept before the CQL editor's shadow DOM can consume them.
- ✅ `f` toggles fullscreen in image detail view (`Alt+f` when in editable field). Uses centralised shortcut system (`useKeyboardShortcut` hook). `Escape` only exits fullscreen (never navigates or closes image detail).
- ✅ Arrow Down at edge of loaded results triggers loadMore — seamless infinite navigation via keyboard.
- ✅ O(1) image lookup — `imagePositions: Map<imageId, index>` maintained incrementally in the search store. `search()` rebuilds from the first page; `loadMore()` and `loadRange()` extend the existing Map with only the new hits — O(page size) per update, not O(total loaded). Previously was a `useMemo` full-rebuild in `useDataWindow` that rescanned all loaded entries on every `results` change. At 50k loaded images, the old approach cost measurable ms per range load during scroll; the incremental approach is bounded to ~200 entries regardless of depth.
- ✅ Bounded placeholder skipping — `moveFocus()` skips at most 10 empty slots in the movement direction (was unbounded, scanning up to 100k holes). If no loaded row within 10, focuses the target index anyway — gap detection will load it. `End` key scan also capped to 50 indices from the end.
- ✅ Prefetch near edge — ImageDetail and ImageTable's `moveFocus` trigger loadMore when within 5 images of the loaded edge.
- ✅ Visible-window table data — TanStack Table only receives images in the current virtualizer window (~60 rows) instead of all loaded images. Virtualizer is created before the table; `getVirtualItems()` determines which images to feed. Fixes `getCoreRowModel` growing unboundedly as more ranges loaded.

**Performance analysis:**
- ✅ Thorough performance review — 26 findings across render, scroll, state, network, memory, layout, CSS, accessibility documented in `exploration/docs/performance-analysis.md`. Scannable issue table with severity/action classifications (fix-now 🔧, fix-later 📋, watch 🧊). Key fixes already applied: incremental `imagePositions` Map (#1), sort-while-scrolled pulsing loop (#2). Logo-from-image-detail bug found and fixed.
- ✅ Imgproxy latency benchmark (`exploration/bench-imgproxy.mjs`) — 70 real images, sequential + batch + 60fps simulation. Result: imgproxy is **the** bottleneck for traversal (~456ms median per image, 0/70 on-time at 60fps). Prefetching is the correct mitigation; throughput improvements need server-side caching or thumbnail-first progressive loading.
- 🔧 **5 easy fix-now items identified** (~75 min total): `visibleImages` useMemo stability (#6), `handleScroll` listener churn (#7), `goToPrev`/`goToNext` churn (#8), orphaned `loadRange` abort (#9), `computeFitWidth` scan cap (#10).
- ✅ **All 5 fix-now items implemented (2026-03-25):**
  - **#6** — `visibleImages` useMemo now compares resolved image IDs before/after; returns cached array when off-screen loads don't change visible rows. Prevents cascading `getCoreRowModel` → `TableBody` reconciliation.
  - **#7** — `handleScroll` in ImageTable + ImageGrid ref-stabilised: `results.length` and `total` read from refs, eliminating listener teardown/re-register on every data load.
  - **#8** — `goToPrev`/`goToNext` in ImageDetail ref-stabilised: `prevImage`/`nextImage` read from refs, making keyboard listener stable across off-screen loads.
  - **#9** — Generation-based abort for `loadRange`: module-level `_rangeAbortController` in search-store; `search()` aborts all in-flight ranges from the previous search. `searchRange` in DAL accepts optional `AbortSignal`. AbortError handled gracefully (not recorded as failure).
  - **#10** — `computeFitWidth` scans only the visible virtualizer window (~60 rows) instead of all loaded results. Better perf + better UX (fits to what you see).
- 📋 **9 fix-later items** blocked by scrubber/`search_after`: unbounded memory (#3), `from/size` 100k cap (#4), sort-around-focus (#5), array spreading (#11), density mount cost (#12), debounce vs seeks (#13), tiebreaker sort (#14), histogram agg (#15), image object compaction (#20).
- ⏪ **List scroll smoothness — tried and reverted (2025-03-25).** Goal: make table view feel as smooth as grid during moderate scroll (grid already feels like it never loads). Tried three changes together: (1) page size 50→100, (2) debounce→leading+trailing throttle for gap detection, (3) `LOAD_OVERSCAN` 50→100 rows. **Result: no perceptible improvement in table view.** Also introduced a regression — hover background colour "swimming above" rows during fast scroll (likely from throttle firing more frequently and causing intermediate renders). All three reverted. The bottleneck may be elsewhere (React reconciliation of TanStack Table row model, or the `!row` placeholder flash). Needs more investigation — possibly profiling the render pipeline rather than tuning fetch timing.

### What's Next (Phase 2 remaining)
- [x] **Panels + facet filters** — full plan in `exploration/docs/panels-plan.md`:
  1. ✅ Grid view scroll anchoring — anchor-image technique in ImageGrid's ResizeObserver. Captures focused/viewport-centre image + viewport ratio before column count changes, restores in useLayoutEffect after React re-renders. Covers panel toggle, panel resize, browser window resize.
  2. ✅ Panel store (`stores/panel-store.ts`) — Zustand + localStorage for visibility, width, section open/closed. Section defaults: Filters collapsed, Collections expanded, Metadata expanded.
  3. ✅ Panel layout (`components/PanelLayout.tsx`) — flex row wrapping main content with resizable left/right panels. Resize handles (CSS-only during drag, commit on mouseup, double-click to close). Keyboard shortcuts `[`/`]` (`Alt+[`/`Alt+]` in editable fields) via centralised `keyboard-shortcuts.ts`. Toggle buttons in StatusBar as full-height strips with icon + label ("Browse" / "Details"), tab-merge effect on active panel (extends below bar border). AccordionSection component for collapsible panel sections.
  4. ✅ Aggregation batching in DAL — `getAggregations()` method: single ES request with `size:0` and N named terms aggs. `fetchAggregations()` in search-store: query-keyed cache, 500ms debounce, circuit breaker at 2s, abort controller. Fetched only when Filters section is expanded.
  5. ✅ Facet filters component (`components/FacetFilters.tsx`) — left panel content. All aggregatable fields from field registry. Value lists with compact counts, click adds/removes CQL chips, active filters highlighted, Alt+click to exclude. "Show more" per field (separate single-field 100-bucket request, not mixed into batch). Expanded state cleared on new search.
  6. ✅ Right panel metadata — extracted `MetadataPanel` from ImageDetail into shared `ImageMetadata.tsx`. Both ImageDetail sidebar and right side panel render the same component. Right panel reads `focusedImageId` from search store, resolves to Image via `imagePositions` + `results`. Empty state when no image is focused. Wrapped in AccordionSection ("Details").
- [x] **Metadata display improvements (Phase 1)** — full plan in `exploration/docs/metadata-display-plan.md`. Phase 1 (read-only) DONE: layout replicates kahuna closely — stacked layout for Title/Description/Special instructions/Keywords, inline 30/70 for all others. Bold labels, persistent `#999` underlines on links, solid `#565656` section dividers as orientation landmarks, section order matching kahuna (Rights → Title/Desc → Special instructions → Core metadata → Keywords → Technical → ID). Labels standardised ("Taken on", "Special instructions"). Remaining phases deferred: Phase 3 (editing): hover-to-reveal ✎, inline editing, `userCanEdit` from Grid API. Phase 4 (multi-selection): `rawMetadata`/`displayMetadata` reconciliation, "Multiple [X]" italic, pill partial indicators.
- [ ] Column reordering via drag-and-drop (extend `column-store.ts` to persist order)
- [ ] Windowed scroll + `search_after` cursor-based pagination (for deep pagination of 9M docs) — depends on `useDataWindow` extraction above. **Also unblocks sort-around-focus** ("Never Lost" on sort): attempted via `_count` to find the focused image's new position, hit `max_result_window` wall (100k cap) and equal-value ambiguity. `search_after` removes the depth cap. See performance-analysis.md findings #4, #5.
- [ ] Custom scrubber (thumb = `windowStart / total`) — see migration-plan.md "Scrollbar & Infinite Scroll" notes

### Deferred to Later Phases
- [ ] **Quicklook** — hold Cmd/Ctrl to show a large imgproxy preview over the hovered image in grid/table. Moving mouse (still holding) swaps to the hovered image. Release dismisses. Purely transient — no navigation, no state change. ~100-150 lines. Main concern is imgproxy latency (~456ms median); progressive JPEG XL may help long-term. Independent of panels, navigation paradigm, or any other feature.
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

2. **Data Access Layer (DAL)** — TypeScript interface `ImageDataSource` with methods: `search()`, `count()`, `getById()`, `getAggregation()`. Currently implemented by `ElasticsearchDataSource` (direct ES access via ~1,760 lines across 5 files: `es-adapter.ts`, `cql.ts`, `field-registry.ts`, `types.ts`, `es-config.ts`). Phase 3+ architecture: **dual-path** — keep direct ES for reads (fast, supports script sorts and custom aggregations), add `GridApiDataSource` for writes (metadata editing, crops, leases via media-api). Full migration surface analysis in deviations.md §16.

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
   | `image` | string | `abc123` | Image detail overlay (display-only, not synced to search store) |
   | `density` | `table` | | View density — absent=grid (default), `table`=data table (display-only) |

   **Key mapping**: `nonFree=true` → API `free=undefined`; `hasCrops` → API `hasExports`

   Selections are NOT in URL (matching kahuna — only `ids=` from Share button).

7. **Column config in localStorage** (not URL) — visibility and widths are persisted per-client via `useColumnStore` with zustand/persist. Key: `kupua-column-config`. Column IDs use TanStack Table's format (dots→underscores). The store also holds session-only `preDoubleClickWidths` (excluded from localStorage persistence via `partialize`) for the double-click fit/restore toggle. Order and sorting will be added when needed.

8. **Scrollbar strategy** — Phase 1 uses simple infinite scroll (append pages) with the native scrollbar — sufficient for 10k docs. Phase 2 implements sparse scroll: virtualizer count = `min(total, 100k)`, TanStack Table only processes loaded rows in the visible window (~60 rows), placeholder skeletons for unloaded slots, gap detection + `loadRange` for on-demand fetching. Spike confirmed that feeding TanStack Table 100k placeholder rows was unacceptable (42ms `getCoreRowModel` rebuild + 85MB heap). The implemented approach uses a sparse `results` array with `for...in` iteration (skips holes), `imagePositions: Map<imageId, index>` maintained incrementally in the search store (O(page size) per load, not O(total loaded)), and result set freezing (`frozenUntil` timestamp) to stabilise offsets during scrolling. Beyond ~1M rows, custom scrubber + `search_after` with PIT will be needed. Kahuna analysis in `kahuna-scroll-analysis.md`. Full design notes in `kupua/exploration/docs/migration-plan.md` → "Scrollbar & Infinite Scroll — Design Notes".

9. **Local dev domain** — currently `localhost:3000`. Future: add `kupua.media.local.dev-gutools.co.uk` to `dev/nginx-mappings.yml` pointing to port 3000. Trivial change when needed.

10. **URL is single source of truth for search state** — user interactions update the URL via `useUpdateSearchParams`, which triggers `useUrlSearchSync` to push params to the Zustand store and fire a search. When clearing params (e.g. clearing the search box), all URL-managed keys are explicitly reset to `undefined` before applying URL values, so removed params don't survive in the store via spread. `resetSearchSync()` clears the dedup state so a "reset everything" action (logo click) always triggers a fresh search, even when the URL params haven't actually changed (e.g. logo clicked while already at `?nonFree=true`).

11. **Sort system** — `orderBy` URL param supports comma-separated values for multi-sort (e.g. `-uploadTime,-metadata.credit`). The ES adapter's `buildSortClause` expands aliases per-part (e.g. `taken` → `metadata.dateTaken,-uploadTime`). Column headers, sort dropdown, and URL all use the same sort keys. Secondary sort is managed via shift-click.

12. **TanStack Table column ID gotcha** — when using dot-path accessors (e.g. `"metadata.credit"`), TanStack Table auto-generates column IDs with dots replaced by underscores (`"metadata_credit"`). Any map keyed by column ID must use underscores. This bit us once already.

13. **Custom URL parse/stringify (not `parseSearchWith`)** — TanStack Router's built-in `parseSearchWith` delegates to `qss.decode` which calls `toValue()`, converting `"true"` → boolean `true` and `"123"` → number `123`. Our Zod schema expects all values as strings, so booleans/numbers silently fall through `.catch(undefined)` and are lost. We use fully custom `plainParseSearch`/`plainStringifySearch` based on `URLSearchParams` directly, keeping all values as plain strings. This also avoids `JSON.stringify` wrapping strings in quotes (`%22true%22`). Stale quoted values from old bookmarks are stripped.

14. **CQL chips via `@guardian/cql` Web Component** — The `<cql-input>` custom element (from `@guardian/cql`) handles all chip rendering, editing, keyboard navigation, and typeahead. It is registered once globally in `CqlSearchInput.tsx`. The typeahead fields are built from the DAL via `typeahead-fields.ts` with resolvers that query local ES aggregations on keyword fields. When the DAL switches to the Grid API, the resolvers will automatically use live API endpoints with no UI changes needed.

15. **Mock config for Phase 1** — `kupua/exploration/mock/grid-config.conf` is a sanitised copy of PROD Grid config. `src/lib/grid-config.ts` parses it for field aliases and category lists. This avoids hardcoding and will be replaced by live config fetching in Phase 3.

16. **Start script** — `kupua/scripts/start.sh` is the single entry point for local development. It orchestrates ES startup, data loading, npm install, and Vite dev server. Flags allow skipping steps for faster restarts. Validates prerequisites before starting: Node version (Vite 8 requires `^20.19.0 || >=22.12.0`), Docker running, port availability (3000 for Vite, 9220 for ES — uses `lsof -sTCP:LISTEN` to avoid false positives from client connections).

17. **`@/*` path alias** — `@/components/Foo` resolves to `src/components/Foo`. Configured in both `tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`). All imports use this alias.

18. **`App.tsx` deleted** — was dead code after layout moved to `routes/__root.tsx`. Removed during codebase audit.

19. **Font standardisation** — `--font-sans` is overridden in `@theme` to `'Open Sans', ui-sans-serif, system-ui, sans-serif`. This is the Tailwind 4 convention: all elements inherit from `--font-sans` via the base layer, so new elements get Open Sans automatically. Three-tier font scale: `text-sm` (14px, Tailwind default) for UI chrome, `text-xs` (13px via `--text-xs: 0.8125rem` override) for data content, `text-2xs` (12px via custom `--text-2xs: 0.75rem` token) for dimmed secondary text like grid cell dates. 13px for CQL input (Web Component theme). Prefer standardised sizes over arbitrary one-off values (`text-[11px]` etc.) — if a new size is genuinely needed, add a theme token rather than scattering magic numbers.

20. **Shared popup styling via CSS component classes** — `popup-menu` and `popup-item` are defined in `index.css` `@layer components`. All dropdowns and context menus use these classes for consistent appearance (`bg-grid-panel`, `border-grid-border`, `rounded shadow-lg`, hover highlight). New menus inherit the look automatically.

21. **Auto-reveal hidden columns on sort** — when the user sorts by a column that's currently hidden, the column is automatically shown via `toggleVisibility()` (same store action as the context menu), so it persists as a normal user choice. The user can hide it again anytime. Generic — works for any sortable column, not just specific ones.

22. **Fullscreen survives between images** — the Fullscreen API exits fullscreen when the fullscreened element is removed from the DOM. Image detail is rendered as an overlay within the search route (not a separate route), and React reconciles the same `ImageDetail` component when only the `image` prop changes, so the fullscreened `<div ref>` stays in the DOM and fullscreen persists. This is the architectural reason why image detail uses a prop — not a route param. `Escape` only exits fullscreen (never navigates or closes image detail).

23. **Image detail is an overlay, not a separate route** — the image detail view renders within the search route when `image` is present in URL search params (`?image=abc123&nonFree=true&query=...`). The search page stays mounted and fully laid out (`opacity-0 pointer-events-none`, NOT `display:none` — because `display:none` resets `scrollTop` to 0). Scroll position, virtualizer state, and search context are all preserved. Browser back removes `image` from params — the table reappears at the exact scroll position with no re-search. `image` is a display-only URL param: it's excluded from store sync and ES queries via `URL_DISPLAY_KEYS`. Prev/next replaces `image` (so back always returns to the table, not through every viewed image). If the user navigated to a different image via prev/next, the focused row is centered in the viewport on return. `/images/:imageId` redirects to `/search?image=...&nonFree=true` for backward compat. URL param ordering controlled by `URL_PARAM_PRIORITY` — `image` appears first, matching Grid URL style.

24. **"Never Lost" context preservation** — Focus, selection, edit state, and scroll position survive every density/view change (table → grid → single image and back). Views are density levels of the same list, not separate pages. When search context changes and the focused item leaves the result set, kupua snaps focus to the **most adjacent surviving item** from the previous result set (nearest neighbour scan, alternating forward/backward), rather than resetting to the top. Selections that survive the new results are kept; missing ones are silently dropped. Edit state on a displaced image is preserved with a subtle "not in current results" indicator. Full algorithm and rationale in `frontend-philosophy.md` → "Context is Sacred".

25. **Actions written once, context-adaptive** — Action buttons (Crop, Delete, Download, Archive, Share, Add to Collection, Set Rights, etc.) are each implemented as a single component that accepts an `images` array. An `ActionBar` component derives `targetImages` from current state (focused image, selection, or current detail image) and renders all actions. Labels, enabled state, and confirmation dialogs adapt to the image count — but core logic is identical regardless of which view density the user is in. Kahuna already uses `images` arrays for its action components; kupua formalises this into one `ActionBar` mounted in a stable toolbar position, never duplicated per view. See `frontend-philosophy.md` → "Actions are Written Once".

26. **Field Definition Registry** — `src/lib/field-registry.ts` is the single source of truth for every image field kupua can display, search, sort, or aggregate. Each `FieldDefinition` captures: identity (id, label, group), data access (accessor, rawValue), search (cqlKey, esSearchPath), sort (sortKey, descByDefault), display (defaultWidth, defaultHidden, formatter, cellRenderer), and type metadata (fieldType, isList, isComposite, editable, aggregatable). Config-driven alias fields from `grid-config.ts` are merged in automatically. Consumers (`ImageTable`, `SearchFilters.Sort`, `column-store`, future MetadataPanel/grid view) import derived maps (`COLUMN_CQL_KEYS`, `SORTABLE_FIELDS`, `DESC_BY_DEFAULT`, `DEFAULT_HIDDEN_COLUMNS`, `SORT_DROPDOWN_OPTIONS`) and helper functions (`getFieldRawValue`, `getFieldDisplayValue`) — they never hardcode field knowledge. ImageTable generates TanStack column defs from the registry via `fieldToColumnDef()`. **Coupling note:** `fieldType` and `aggregatable` restate the ES mapping — if the mapping changes (e.g. mapping-enhancements.md §2a), these must be updated. When facet filters are built, consider dynamic introspection via `_mapping` at startup instead.

27. **Panels — always-in-flow, no overlay mode** — Two panel zones (left, right) flanking the main content in a flex row. Panels are either visible (in the layout flow, pushing content) or hidden. No kahuna-style overlay/locked distinction, no auto-hide-on-scroll. Resizable via drag handles, width persisted to localStorage. Accordion sections within each panel. Left: Filters + Collections (Phase 4). Right: shared Metadata component (same as image detail). Keyboard: `[` left, `]` right. Panel state in localStorage (not URL — it's user preference, not search context). Facet aggregations are lazy: fetched only when the Filters section is expanded, debounced separately (500ms), cached per query, with a circuit breaker if response exceeds 2s. Section open/closed state persisted to localStorage — most users keep Filters collapsed (no ES agg load); power users who expand Filters self-select into the agg cost. Full plan: `panels-plan.md`. Deviation from kahuna: see `deviations.md` when implemented.

28. **Grid view scroll anchoring on width change** — When `ImageGrid.tsx`'s container width changes (from any cause: panel toggle, panel resize, browser window resize) and the column count changes, the focused (or viewport-centre) image's viewport ratio is captured before the change and restored in a `useLayoutEffect` after React re-renders. No visible jump. Table view doesn't need this — its vertical layout is width-independent. This is a generic `ResizeObserver` improvement, not panel-specific. Same algorithm concept as `density-focus.ts` (density switches) but within the same component lifecycle rather than across unmount→remount.

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
      grid-view-plan.md        # Grid view plan: kahuna analysis, architecture stress tests, design decisions
      kahuna-scroll-analysis.md # Deep read of kahuna's gu-lazy-table: sparse array, from/size, 100k cap. Lessons for kupua.
      deviations.md            # Intentional differences from Grid/kahuna + library convention bends
      performance-analysis.md  # Performance: 26 findings, action plan, imgproxy bench, scrubber prereqs
      infra-safeguards.md            # Elasticsearch + S3 safety documentation
      kupua-audit-assessment.md # Codebase audit: architecture grades, cleanup opportunities, documentation accuracy
      s3-proxy.md              # S3 thumbnail proxy documentation (temporary)
      imgproxy-research.md     # Research: how eelpie fork replaced nginx imgops with imgproxy
      mapping-enhancements.md  # Proposed ES mapping improvements
      panels-plan.md           # Panels design + implementation plan: layout, facet filters, scroll anchoring, kahuna reference
  scripts:
    start.sh                   # One-command startup (ES + data + deps + S3 proxy + imgproxy + dev server)
    load-sample-data.sh        # Index creation + bulk load
    s3-proxy.mjs               # Local S3 thumbnail proxy (uses dev AWS creds, temporary)
  src/                         # ~8550 lines total
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
      density-focus.ts         # Transient bridge for viewport-position preservation across density switches (5 lines)
      scroll-reset.ts          # Shared helper — resets scroll position on result containers + focuses CQL input. Used by SearchBar + ImageDetail logo clicks.
      keyboard-shortcuts.ts    # Centralised keyboard shortcut registry — single document listener, Alt+key in editable fields, stack semantics. shortcutTooltip helper.
      image-urls.ts            # Image URL builders — thumbnails via S3 proxy, full images via imgproxy
      image-offset-cache.ts    # sessionStorage cache for image offset in search results — survives page reload
      typeahead-fields.ts      # Builds typeahead field definitions for CQL input from DAL (251 lines)
    dal/
      types.ts                 # ImageDataSource interface + SearchParams + AggregationRequest/AggregationsResult types
      es-adapter.ts            # Elasticsearch implementation (~416 lines — sort aliases, CQL translation, free-to-use filter, batched aggregations)
      index.ts                 # Barrel export
    components/
      CqlSearchInput.tsx       # React wrapper around @guardian/cql <cql-input> Web Component (227 lines)
      DateFilter.tsx           # Date range filter dropdown (486 lines)
      ErrorBoundary.tsx        # React error boundary — catches render crashes, shows recovery UI
      ErrorBoundary.test.tsx   # 2 tests: renders children, catches errors
      ImageDetail.tsx          # Single-image view: overlay within search route, fullscreen (black, no UI), prev/next navigation. Uses shared ImageMetadata for sidebar.
      ImageMetadata.tsx        # Shared metadata display (~350 lines) — renders <dl> with section dividers (MetadataSection groups with border-bottom). Clickable values have persistent underlines. Sections: core, credits, location, dates, technical, tags, identity. Empty sections auto-hide. Not shared with table renderers (different layout/interaction models). Used by ImageDetail sidebar and right side panel.
      SearchPill.tsx           # Shared pill component for list field values. SearchPill (direct callback, metadata panel) + DataSearchPill (data-attr delegation, table cells). Click-to-search with Shift/Alt modifiers.
      StatusBar.tsx            # Status bar: count + new images ticker + response time + density toggle (table/grid)
      SearchBar.tsx            # Single-row toolbar: logo + CQL search input + clear button (123 lines)
      SearchFilters.tsx        # Compound component: FilterControls (free-to-use, dates) + SortControls (custom dropdown + direction toggle) (185 lines)
      ColumnContextMenu.tsx    # Column header context menu — visibility toggles, fit-to-data (178 lines). Imperative ref handle, self-contained positioning.
      FacetFilters.tsx          # Facet filter panel content (~275 lines) — aggregatable fields, value lists with compact counts, click adds/removes CQL chips, Alt+click excludes, "Show more" per field (separate single-field 100-bucket request), scroll-anchored "Show fewer"
      PanelLayout.tsx          # Panel system: flex row of [left?] [main] [right?], resize handles (double-click to close), keyboard shortcuts [`/`] (Alt+key in editable fields via keyboard-shortcuts.ts), AccordionSection component (~220 lines)
      ImageTable.tsx           # TanStack Table + Virtual, all table features (~1260 lines — column defs generated from field-registry.ts). Uses useDataWindow for data/pagination.
      ImageGrid.tsx            # Thumbnail grid density (~520 lines). Responsive columns via ResizeObserver, row-based TanStack Virtual, S3 thumbnails, rich tooltips, grid-geometry keyboard nav. Scroll anchoring on column count change. Same useDataWindow as table.
    stores/
      search-store.ts          # Zustand store (search params, results, loadMore, loadRange, frozenUntil, imagePositions, aggregations + fetchAggregations with cache/debounce/circuit-breaker, expandedAggs + fetchExpandedAgg for per-field "show more"). View components access data via useDataWindow hook, not directly. (~560 lines)
      column-store.ts          # Zustand store + localStorage persist (column visibility, widths, pre-double-click widths) (~109 lines)
      panel-store.ts           # Zustand store + localStorage persist (panel visibility, widths, section open/closed) (~140 lines)
    types/
      image.ts                 # Image document types from ES mapping
    hooks/
      useDataWindow.ts       # Data window hook — shared interface between search store and view components (table, grid, detail). Manages sparse scroll: debounced gap detection, visible range → loadRange, result set freezing, O(1) image position lookup (206 lines).
      useListNavigation.ts   # Shared keyboard navigation hook — moveFocus, pageFocus, home, end. Parameterised by geometry (columnsPerRow, flatIndexToRow). Used by ImageTable and ImageGrid (327 lines).
      useUrlSearchSync.ts      # URL↔store sync: useUrlSearchSync (URL→store→search) + useUpdateSearchParams (component→URL)
      useFullscreen.ts         # Fullscreen API wrapper — toggle/enter/exit fullscreen on a stable DOM element
      useKeyboardShortcut.ts   # React hook wrapping keyboard-shortcuts.ts — auto-register on mount, unregister on unmount, ref-stable action
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

