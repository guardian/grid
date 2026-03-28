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

**Directive: Run tests in the foreground.** When running `npx playwright test`,
`./scripts/run-e2e.sh`, or any test command, run it in the **foreground** (blocking
call, not background). Do NOT pipe through `tail`/`head`. Do NOT use `sleep` to poll.
The list reporter streams each result live (~70s total run). The user wants to watch
results accumulate in real time.

**Directive: Smoke tests against real ES.** `e2e/manual-smoke-test.spec.ts` runs against a
live Elasticsearch cluster (TEST) via `./scripts/start.sh --use-TEST`. The agent must
**NEVER** run these tests directly — only the human developer may invoke them, manually,
from their own IDE terminal. When a fix needs validation against real data, tell the
user what command to run (e.g. `node scripts/run-smoke.mjs 2`). The user runs it, you
see the output, and iterate. The tests auto-skip when connected to local ES
(`total < 100k`), so accidental local runs are harmless.

**Directive: Smoke → local feedback loop.** The primary purpose of manual smoke tests is
NOT just to validate fixes on real data — it is to **improve local test coverage** so
the same class of bug is caught without manual testing in the future. After every smoke
test session, the agent must try hard to backport learnings into the local test suite.
Concretely: (1) **Amend existing local tests** — add stronger assertions, capture
telemetry (console logs, timing, page counts), tighten tolerances, assert on code paths
taken (not just outcomes). (2) **Improve helpers and env config** — add new helper
methods to `KupuaHelpers`, adjust env variables (`.env`, `.env.development`), tune
Docker ES settings (`load-sample-data.sh`), or add synthetic edge-case data (e.g. docs
with missing fields) so local ES better approximates real-world data shapes.
(3) **Add new local tests** if the existing ones can't be modified to cover the gap.
The goal: every smoke test failure should produce at least one local test improvement
that would have caught (or would in the future catch) the same bug class locally. If a
particular failure truly cannot be reproduced locally (e.g. requires 1M+ docs), document
why in the test comments and ensure the smoke test itself covers it permanently.
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

📄 **`search_after` + Windowed Scroll plan:** `kupua/exploration/docs/search-after-plan.md`

Comprehensive analysis and implementation plan for replacing `from/size`
pagination with `search_after` + PIT windowed scroll. Covers: philosophy,
current state assessment, ES deep dive (`search_after`, PIT, tiebreaker
sort, hybrid pagination), PIT staleness analysis (kahuna refresh cadence
comparison, 40-editor production scenario, freshness strategy: PIT for
pagination / live fetch for display / 10-min background refresh), browser
& W3C technologies survey (`content-visibility`, `requestIdleCallback`,
Scroll Timeline API, View Transitions API, CSS anchor positioning,
`scheduler.postTask`), windowed buffer architecture (fixed-capacity buffer
replacing unbounded sparse array), custom scrubber UI, sort-around-focus
("Never Lost" — independent, doesn't block scrubber), safeguards, prior
art survey (Google Photos, iOS Photos, Slack, AG Grid, react-virtuoso,
TanStack Virtual). 13-step phased implementation plan (~25–35 hours).
4 explicit test checkpoints (A–D) with instructions. 5-commit strategy.
Unblocks 6 blocked items from performance analysis (#3, #4, #5, #11,
#13, #14).

📄 **Scrubber non-linear drag research:** `kupua/exploration/docs/scrubber-nonlinear-research.md`

Research and design for non-linear drag mapping. Prior art survey (Google
Photos, iOS Photos, YouTube/Spotify fine-scrub pattern, AG Grid, maps),
curve analysis (power, sinh, Bezier, exponential), gotchas (thumb↔position
round-trip, edge grabs, allDataInBuffer mode), recommendation (normalised
power curve k=2), testing checklist.

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

**App scaffold (~11,200 lines of source):**
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
- ✅ `ImageDataSource` interface (`dal/types.ts`) — `search()`, `count()`, `getAggregation()`, `getAggregations()` (batched multi-field terms aggs in one ES request), `searchAfter()` (cursor-based pagination with optional PIT — now the primary pagination method used by all store operations), `openPit()`/`closePit()` (PIT lifecycle), `countBefore()` (position counting for sort-around-focus). Types: `SortValues`, `BufferEntry`, `SearchAfterResult`.
- ✅ `MockDataSource` (`dal/mock-data-source.ts`) — deterministic mock implementing `ImageDataSource` for testing. Generates synthetic images (`img-{index}`) with linearly spaced dates and cycling credits. Supports `search`, `searchAfter` (with cursor), `countBefore`, `getById`, `estimateSortValue`. Tracks `requestCount` for load assertions. Used by store integration tests.
- ✅ `ElasticsearchDataSource` adapter (`dal/es-adapter.ts`) — queries ES via Vite proxy, handles sort aliases, CQL→ES translation. `count()` uses `_count` endpoint for lightweight polling (new images ticker). `getAggregations()` batches N terms aggs into a single `size:0` request using the same `buildQuery()` filters. `searchAfter()` is now the primary pagination method — supports cursor-based pagination with optional PIT (requests go to `/_search` without index prefix when PIT is active), and falls back to `from/size` when no cursor is provided (initial search, backward extend, seek). `openPit()`/`closePit()` manage PIT lifecycle. `countBefore()` builds a range query counting documents before a sort position (for sort-around-focus). `buildSortClause()` always appends `{ id: "asc" }` tiebreaker (uses `id` keyword field, not `_id` — see deviations.md §18). `esRequestRaw()` for index-prefix-free requests.
- ✅ Configurable ES connection (`dal/es-config.ts`) — env vars for URL (`KUPUA_ES_URL`), index (`VITE_ES_INDEX`), local flag (`VITE_ES_IS_LOCAL`). Defaults to local docker ES on port 9220.
- ✅ Phase 2 safeguards (see `exploration/docs/infra-safeguards.md`):
  1. `_source` excludes — strips heavy fields (EXIF, XMP, Getty, embeddings) from responses
  2. Request coalescing — AbortController cancels in-flight search when a new one starts
  3. Write protection — only `_search`/`_count`/`_cat/aliases`/`_pit` allowed on non-local ES; `load-sample-data.sh` refuses to run against non-9220 port
  4. S3 proxy — read-only `GetObject` only, localhost-bound, uses developer's existing AWS creds (never committed)
- ✅ Vite env types declared in `src/vite-env.d.ts`

**State management:**
- ✅ `search-store.ts` — Zustand store for search params, windowed buffer, loading state, and data source. **Windowed buffer architecture:** fixed-capacity buffer (`results`, max 1000 entries) with `bufferOffset` mapping `buffer[0]` to a global position. `search()` opens a PIT (on non-local ES), fetches first page via `searchAfter`; accepts optional `sortAroundFocusId` for sort-around-focus. `extendForward` uses `search_after` with `endCursor`; `extendBackward` uses **reverse `search_after`** (`reverseSortClause` + `startCursor`, works at any depth — no `from/size` offset cap). Page eviction keeps memory bounded. `seek()` repositions buffer at arbitrary offset for scrubber/sort-around-focus; bumps `_seekGeneration` + stores `_seekTargetLocalIndex` so views can scroll to the right position after buffer replacement. **Sort-around-focus:** async `_findAndFocusImage()` finds focused image's position via `searchAfter({ids})` + `countBefore` → seek → focus; 8s timeout prevents "Seeking..." forever; `sortAroundFocusGeneration` counter triggers view scroll. `imagePositions: Map<imageId, globalIndex>` maintained incrementally — O(page size) per extend, evicted entries cleaned up. **Important:** consumers must subtract `bufferOffset` to get buffer-local indices. PIT lifecycle managed: opened on search, closed on new search, skipped on local ES. New-images ticker respects user's date filter. Tracks ES `took` time and rolling `scrollAvg` from extend calls.
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
- ✅ Sort alias system — `buildSortClause` expands short URL aliases to full ES paths per-part (e.g. `taken` → `metadata.dateTaken,-uploadTime`, `credit` → `metadata.credit`, `category` → `usageRights.category`, `filename` → `uploadInfo.filename`, `mimeType` → `source.mimeType`, plus config-driven alias fields). URLs never contain dotted ES paths — only clean short keys (e.g. `?orderBy=-credit`, not `?orderBy=-metadata.credit`). Supports `_script:` prefixed sort keys for Painless script sorts (used by Dimensions).
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
- ✅ Logo click navigates to `/search?nonFree=true` (resets all state), resets scroll position (both table and grid scroll containers), resets scrubber thumb DOM position, focuses the search box, and forces a fresh search via `resetSearchSync()` + explicit `store.search()` (the URL sync effect alone won't re-run if params are already at default state). Works identically from both SearchBar and ImageDetail.
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
- ✅ Visible-window table data — TanStack Table receives the windowed buffer (max 1000 entries) rather than all loaded images. Virtualizer count equals the buffer length. Buffer slides as the user scrolls — `reportVisibleRange()` in `useDataWindow` triggers `extendForward`/`extendBackward` when the viewport approaches buffer edges.

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
- 📋 **9 fix-later items** — several now addressed by windowed buffer: unbounded memory (#3 ✅ — buffer capped at 1000), `from/size` 100k cap (#4 ✅ — `search_after` + PIT), sort-around-focus (#5 — `countBefore` + `seek` wired, step 11 pending), array spreading (#11 ✅ — extend/evict replaces append), tiebreaker sort (#14 ✅ — `id` appended to all sorts). Still pending: density mount cost (#12), debounce vs seeks (#13), histogram agg (#15), image object compaction (#20).
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
- [x] **`search_after` + windowed scroll + scrubber** — full plan in `exploration/docs/search-after-plan.md`. Replaces `from/size` pagination, unblocks deep pagination (9M), memory-bounded scrolling, sort-around-focus. All steps implemented, all test checkpoints (A–D) passed. **Known bugs remain** — to be found by testing against real ES (TEST cluster with ~1.3M docs), then reproduced and fixed with E2E tests. Non-linear drag research preserved in `scrubber-nonlinear-research.md` and deviations.md §20 for future revisit once scrubber is bug-free.
  - **Commit 1: DAL — search_after + PIT + tiebreaker** (steps 1–3)
    - [x] Step 1: Tiebreaker sort — append `{ "id": "asc" }` to all sort clauses in `buildSortClause()`. Uses `id` (keyword field) not `_id` (requires fielddata in ES 8.x). See deviations.md §18.
    - [x] Step 2: Store sort values — preserve `sort` array from ES hits alongside `_source` in `SearchResult.sortValues[]`. New `SortValues` and `BufferEntry` types in `types.ts`.
    - [x] Step 3: `search_after` + PIT in ES adapter — `searchAfter()`, `openPit()`, `closePit()`, `countBefore()` methods. `esRequestRaw()` for index-prefix-free requests (PIT-based search). Add `_pit` to `ALLOWED_ES_PATHS`. `buildSortClause()` exported for store use. 10 unit tests for tiebreaker sort.
    - [x] 🧪 Checkpoint A: local ES — tiebreaker verified in network tab, sort behaviour unchanged ✅
  - **Commit 2: Windowed buffer + view adaptation** (steps 4–9, merges originally planned commits 2+3)
    - [x] Step 4: Replace `results: Image[]` with fixed-capacity windowed buffer (`results: (Image | undefined)[]`, max 1000) + `bufferOffset` + cursor state (`startCursor`, `endCursor`, `pitId`)
    - [x] Step 5: Buffer extend forward (`search_after` + `endCursor`, evict from start) and backward (`from/size` fallback, evict from end). In-flight tracking prevents duplicate extends.
    - [x] Step 6: Seek — clear buffer, refetch at position (`from/size` ≤100k, capped fallback >100k). Histogram-based estimation deferred.
    - [x] Step 7: Page eviction — enforce `BUFFER_CAPACITY`, `evictPositions()` cleans `imagePositions` Map, cursors invalidated on eviction boundary.
    - [x] Step 8: `useDataWindow` adaptation — buffer-local indexing, `bufferOffset` exposed, `reportVisibleRange()` triggers `extendForward`/`extendBackward` at `EXTEND_THRESHOLD` (50 rows), `findImageIndex()` translates global→local via `imagePositions`.
    - [x] Step 9: View changes — ImageGrid, ImageTable, ImageDetail updated to pass `total` from store and use absolute indexing via `bufferOffset`. `loadMore` kept as deprecated alias for `extendForward`.
    - [x] 🧪 Checkpoint B: local ES — scroll, backward extend, eviction, memory bounded ✅
    - [x] 🧪 Checkpoint C: TEST ES — verified at 9M scale, scroll, sort, density switch ✅
  - **Commit 3: Scrubber UI** (step 10)
    - [x] Step 10: `Scrubber.tsx` (~460 lines) — vertical track, proportional thumb, click-to-seek, drag-to-seek (debounced). Hidden when total ≤ 0. Native scrollbar hidden (sole scroll control). Deep seek via percentile estimation + search_after + countBefore (~20-70ms at any depth). Position tracking via `useVisibleRange()` (useSyncExternalStore on module-level visible range). Keyboard accessible (arrows). Wheel events forwarded to content scroll container. Position tooltip on click/drag/keyboard with 1.5s linger.
    - [x] Scrubber thumb sync fixes — thumb and tooltip now stay in sync after Home/End keys, logo click, seek completion, and scrubber drag. Root causes fixed across three rounds: (1) `reportVisibleRange` only fired on scroll events — added `resetVisibleRange()` and synthetic scroll dispatch; (2) `seekTarget` React state was a fragile state machine — replaced with `pendingSeekPosRef` (a plain ref), no re-render cost, cleared on position change / loading finish / total change; (3) aborted seeks set `loading: false` causing false "seek completed" signals — aborted seeks now return silently; (4) `countBefore` had no abort signal — added `signal` param and pre-call `signal.aborted` guard; (5) logo click didn't reset buffer when URL params unchanged — logo click handler now explicitly calls `store.search()`; (6) `trackHeight` was always 0 — ResizeObserver was set up in `useEffect([], [])` which ran on mount when `total: 0` (component returned null, no DOM element) — replaced with callback ref pattern that fires when the DOM element is actually created; (7) wheel event listener had same mount-time bug — moved into callback ref. Track div uses `h-full` for explicit height. Thumb DOM position set directly via ref during click/drag/keyboard for 60fps feedback; React sync effect runs only when no seek is pending.
    - [x] Scrubber interaction fixes (round 2): (1) **Tooltip text now updates live during drag** — `applyThumbPosition()` directly writes to the tooltip's text node via DOM, so the "X of Y" label tracks the pointer in real-time (previously only the position updated, not the text). (2) **Thumb no longer jumps when grabbed by its bottom** — captures `pointerOffsetInThumb` on pointerdown and adjusts all drag Y calculations by that offset, so the thumb stays under the cursor regardless of grab point. Uses a local `positionFromDragY()` that maps adjusted thumb-top position through `maxTop` range. (3) **Home key no longer highlights track blue** — Scrubber's `onKeyDown` now handles Home/End/PageUp/PageDown with `e.preventDefault()` to suppress browser default focus-ring/selection behaviour on the `tabIndex={0}` track element; added `outline-none` class. (4) **PgUp focus scan** — `pageFocus("up")` now scans forward up to 10 indices to find a loaded image (mirrors PgDown's robustness), preventing focus from silently failing when the target index is a placeholder.
    - [x] Scrubber interaction fix (round 3): **Thumb click-without-drag no longer moves position** — clicking the thumb without dragging used to trigger a seek (pointerUp called `onSeek(latestPosition)`). Now tracks `hasMoved` flag; pointerUp without movement clears `pendingSeekPosRef` and flashes tooltip at current position instead. Also sets `pendingSeekPosRef = currentPosition` on pointerDown to prevent React re-render snap during the `isDragging` state change.
    - [x] 🧪 Checkpoint D: **TEST ES** — verified at ~1.3M: seek accuracy, drag, click, logo reset, Home/End, sort change, thumb stability ✅
  - **Commit 4: Sort-around-focus + scrubber polish** (steps 11–12 partial)
    - [x] Step 11: **Sort-around-focus ("Never Lost")** — on sort change, `search()` accepts `sortAroundFocusId`. URL sync hook detects sort-only changes and passes `focusedImageId`. After initial results show at top, async `_findAndFocusImage()`: fetches image by ID → gets sort values → `countBefore` → exact global offset → **direct `searchAfter` with image's sort values** (forward + backward pages centered on image, guaranteed to contain it) → focus + scroll. "Finding image…" / "Seeking…" indicator in StatusBar. `sortAroundFocusGeneration` counter triggers scroll-to-focused in ImageTable/ImageGrid. Graceful degradation: image not in results (filtered out) → stay at top; `countBefore` fails → stay at top; no focused image → standard search. Previous approach used generic `seek()` with percentile estimation which could miss the image at deep positions; new approach uses the image's exact sort values as cursor.
    - [x] **`extendBackward` via reverse `search_after`** (limitation #1 resolved) — previously used `from/size` which silently failed beyond 100k offset. Now uses `reverseSortClause()` to flip the sort clause, `startCursor` as the cursor, fetches in reverse order, and the DAL reverses hits before returning. Works at any depth after deep seek. `MAX_RESULT_WINDOW` guard removed from `extendBackward`.
    - [x] **Backward extend scroll compensation** — `extendBackward` now tracks `_lastPrependCount` and `_prependGeneration` in the store. ImageTable and ImageGrid watch these via `useLayoutEffect` and adjust `scrollTop` by `prependCount * ROW_HEIGHT` (table) or `ceil(prependCount / columns) * ROW_HEIGHT` (grid) before paint. This prevents the "flashing random pages" cascade where prepended items shift content down → viewport shows near-start indices → another backward extend fires.
    - [x] **Sort-aware scrubber tooltip** (step 12 partial) — tooltip now shows contextual sort value as the **primary** display (prominent, above the count), with "X of Y" position counter as secondary. For date sorts (`uploadTime`, `dateTaken`, `lastModified`): formatted date ("14 Mar 2024"). For keyword sorts (`credit`, `source`, `uploadedBy`, `category`, `mimeType`, `imageType`): the field value (truncated at 30 chars). `interpolateSortLabel` in `sort-context.ts` extrapolates dates for scrubber positions outside the buffer (linear interpolation from buffer anchor points); for keyword sorts shows nearest edge value. Updated live during drag via DOM writes (`data-sort-label` span). **Bug fix:** `resolveSortMapping` now treats `undefined` orderBy as `"-uploadTime"` (the default sort), matching `buildSortClause`'s fallback. Previously, `undefined` orderBy returned `null` → no date label in the tooltip. The URL sync sets `params.orderBy = undefined` when the URL has no `orderBy` param, even though ES uses `-uploadTime` as the default.
    - [x] **Scrubber Shift+Arrow** — Shift+ArrowUp/Down steps by 500 (vs normal 50). Constant `ARROW_STEP_LARGE`.
    - [x] **Scrubber never fully disappears** — when total ≤ 0 (no results), shows a disabled empty track (opacity 0.15) instead of returning null. Prevents layout shifts when results go from 0 → N.
    - [x] **Deep seek for keyword sorts** — `seek()` now handles keyword sorts beyond `MAX_RESULT_WINDOW` via composite aggregation: `findKeywordSortValue()` walks unique keyword values accumulating doc_counts to find the value at the target position (O(unique_values/1000) ES requests, typically 2-10), then `search_after` from that value + `countBefore` for exact offset. Script sorts (dimensions) fall back to iterative `search_after` with 10k chunks. Previously used iterative skip with `size=MAX_RESULT_WINDOW` (101k) per hop — transferred ~7MB per iteration through SSH tunnels, causing 30s+ timeouts on real clusters.
    - [x] **Bug fix: global→local index in 4 places** — `FocusedImageMetadata` (right panel), ImageTable/ImageGrid density-switch unmount (save focus ratio), ImageGrid `captureAnchor` (scroll anchoring) all used `imagePositions.get()` (global index) directly as a buffer-local index. After scrolling far from position 0 (`bufferOffset > 0`), this caused: metadata panel blank, density switches teleporting to wrong scroll position, scroll anchoring computing wrong viewport ratios. Fix: subtract `bufferOffset` in all 4 call sites.
    - [x] **Bug fix: scroll-after-seek** — after scrubber seek, the scroll container retained its old `scrollTop`, leaving the user at a random position in the new buffer (often near the end, with missing cells and no ability to scroll). Added `_seekGeneration` + `_seekTargetLocalIndex` to the store (bumped in `seek()` and `_findAndFocusImage`). ImageTable/ImageGrid watch `_seekGeneration` via `useLayoutEffect` and scroll the virtualizer to the target buffer-local index.
    - [x] **Bug fix: sort-around-focus improvements** — removed redundant `getById` call (saves 1 ES request per sort change with focused image). Added 8s timeout so "Seeking..." status never hangs forever. `finally` block ensures timeout is cleared.
  - **Post-TEST fixes (2026-03-28)** — Bugs found by manual testing against TEST ES (~1.3M docs):
    - [x] **Bug #12 — Wheel scroll after scrubber seek:** After seeking to ~50%, last cells visible but mousewheel doesn't scroll the content area. Root cause: seek cooldown was refreshed at data arrival (500ms extension), blocking `extendForward` while the viewport was near the buffer edge. Fix: removed second cooldown refresh at data arrival in `seek()`; added deferred scroll event dispatch (600ms after seek lands) in ImageGrid/ImageTable `seekGeneration` `useLayoutEffect` to trigger extend checks after cooldown expires.
    - [x] **Bug #13 — Keyword sort scrubber seek has no effect on large datasets:** Under Credit/Source sort, clicking scrubber at ~50% doesn't reposition results on TEST (1.3M docs). Root cause: `findKeywordSortValue()` composite aggregation used `BUCKET_SIZE=1000` — fine for local (few unique credits, 1-2 pages) but on TEST (tens of thousands of unique credit values × SSH tunnel latency) it took 50-100+ pages and timed out. Fix: increased `BUCKET_SIZE` to 10000 (configurable via `VITE_KEYWORD_SEEK_BUCKET_SIZE`), added 8s time cap that returns the best-known approximate value (instead of null), added structured telemetry logging (`[ES] findKeywordSortValue: found "..." at page N`). The iterative `search_after` skip path (Strategy B, for script sorts) also improved: `noSource: true` + `MAX_RESULT_WINDOW` chunks + 50-iteration cap. **Local test robustness:** Bug #13 tests now capture browser console telemetry and assert `findKeywordSortValue` used ≤5 composite pages — catches algorithmic regressions that would only manifest as slowness on TEST. Added timing test (seek must complete within 5s locally). New helper: `KupuaHelpers.startConsoleCapture()` + `getConsoleLogs(pattern)`.
    - [x] **Bug #14 — End key doesn't scroll to end under non-date sort:** End key under Credit sort landed at offset ~99k instead of ~1.3M. Additional sub-bug beyond Bug #13: composite aggregation skips documents with null/missing keyword values, so cumulative count maxes out below `total`. When the composite exhausted without reaching `targetPosition`, it returned null → fallback to capped `from/size`. Fix: when composite exhausts, return `lastKeywordValue` (the last real keyword) instead of null — `search_after` from there lands at the valued→null boundary, and `countBefore` determines exact offset. Locally undetectable because sample data has no missing credit values.
  - [x] **Scrubber drag refinement** (limitation #8) — after extensive experimentation with non-linear position mapping (Approach A — snap-back on release) and velocity-based delta accumulation (Approach B — couldn't reach distant positions / position raced ahead of visual), reverted to **simple linear drag with deferred seek**: thumb follows cursor linearly (like any scrollbar), no seeks during drag (just thumb + tooltip move), one seek on pointer up. Fine-grained browsing of adjacent items is done via wheel/trackpad (native scroll physics). This matches Google Photos, Lightroom, etc. — the scrubber is a seeking tool, not a browsing tool. **Seek cooldown** (500ms in search-store) suppresses post-seek extend cascades. Track `z-20` for tooltip above sticky header. See deviations.md §20.
  - [x] **Playwright E2E tests** — 54 tests (all active, none skipped). Full orchestration + browser tests.
    - **Test infrastructure:** `scripts/run-e2e.sh` orchestrates the full lifecycle (Docker ES health, sample data, stale-process cleanup, Playwright). `e2e/global-setup.ts` auto-starts Docker ES if not running (common after `--use-TEST` → stop → local tests), waits for health check + index load with retry loops, then verifies data exists. Fails fast with clear instructions only if Docker itself isn't running or data was never loaded. `playwright.config.ts` has `globalTimeout: 5min`, `actionTimeout: 10s`, `navigationTimeout: 15s` to prevent any single hang from blocking forever.
    - **Running tests (IMPORTANT — always foreground, never background):**
      - **Default:** `cd kupua && npx playwright test --reporter=list` (ES must already be running — it usually is)
      - Cold start (ES not running): `cd kupua && ./scripts/run-e2e.sh` — starts Docker ES, checks data, then runs tests. Only needed once per session; after that, use `npx playwright test` directly.
      - Interactive: `npx playwright test --headed` / `--debug` / `--ui`
      - `global-setup.ts` fails fast with clear instructions if ES isn't up, so you'll know immediately.
      - **Agent rule:** Run test commands in the **foreground** (not background/`isBackground:true`). Do NOT pipe through `tail`/`head`. Do NOT use `sleep` to wait. The list reporter streams results live — each test prints ✓ or ✗ as it completes (~70s total). The user wants to see results accumulate in real time.
    - **Smoke tests against real ES** (`e2e/manual-smoke-test.spec.ts`): 7 tests that validate scale-dependent behaviour (keyword sort deep seek, wheel scroll after seek, End key, sort-around-focus) against the TEST cluster (~1.3M docs). **S1–S5 all pass as of 2026-03-28.** Excluded from the default `npx playwright test` run via `testIgnore` in `playwright.config.ts`. Separate `playwright.smoke.config.ts` (headed, no globalSetup, longer timeouts). Interactive runner: `node scripts/run-smoke.mjs` lists tests, prompts for selection, runs headed with diagnostics. Auto-skip when `total < 100k` (local ES). **The agent must NEVER run these** — only the human developer, manually, from an IDE terminal. The agent tells the user what to run (e.g. `node scripts/run-smoke.mjs 2`), the user runs it, the agent sees output and iterates.
    - **Philosophy:** "didn't crash" is not a passing test — every seek must land where asked, every `imagePositions` entry must be consistent, every error field must be null. `assertPositionsConsistent()` walks the entire buffer verifying `imagePositions[id] === bufferOffset + localIndex`.
    - **Coverage:** ARIA semantics, seek accuracy (50%/top/bottom, consecutive seeks), drag seek, scroll position after seek, buffer extension (forward + backward), density switch (focus ID + global position preserved, rapid toggling), sort change (resets offset, reverses data), sort tooltip (date format validation), sort-around-focus ("Never Lost"), keyboard (PageDown, Home, Shift+ArrowDown), scroll stability (rapid concurrent seeks), metadata panel (not blank after deep seek), 3 full user-journey workflows, bug regression tests (#1 Home-after-End race, #3 wheel scroll, #7 keyword sort seek, #9 table scrollbar, #11 dateTaken sort seek, #12 wheel scroll after seek, #13 keyword sort scrubber seek with telemetry + timing assertions, #14 End key under non-date sort).
    - **Fixture class:** `KupuaHelpers` in `e2e/helpers.ts` — `seekTo()`, `dragScrubberTo()`, `assertPositionsConsistent()`, `getStoreState()`, `waitForSeekComplete()`, `startConsoleCapture()`, `getConsoleLogs(pattern)`, etc. Reads Zustand state via `window.__kupua_store__` (exposed in dev mode by `search-store.ts`). Console capture enables telemetry assertions (e.g. asserting `findKeywordSortValue` used ≤N composite pages).
    - **All 54 tests pass.** No skipped, no fixme.

### Deferred to Later Phases
- [ ] **Non-linear scrubber drag** — explored and rejected for now (deviations.md §20, `scrubber-nonlinear-research.md`). Two approaches tried: (A) power-curve position mapping — thumb snaps back on release; (B) velocity-based delta accumulation — position races ahead of visual. Both failed. Current linear drag is correct for seeking; wheel/trackpad handles fine browsing. **Revisit when:** scrubber is fully bug-free AND E2E test coverage is comprehensive enough to catch any regression. The research doc (`scrubber-nonlinear-research.md`) contains full prior art survey, curve analysis, and implementation notes — don't re-derive from scratch.
- [ ] **Distribution-aware scrubber mapping** — different from pure-math nonlinear. Uses ES histogram bucket counts to warp the track so dense date regions get more pixels. Requires histogram aggregation data. Phase 6 work, independent of nonlinear drag.
- [ ] **Quicklook** — hold Cmd/Ctrl to show a large imgproxy preview over the hovered image in grid/table. Moving mouse (still holding) swaps to the hovered image. Release dismisses. Purely transient — no navigation, no state change. ~100-150 lines. Main concern is imgproxy latency (~456ms median); progressive JPEG XL may help long-term. Independent of panels, navigation paradigm, or any other feature.
- [ ] `is:GNM-owned` filter with real org config from Grid (currently recognized in CQL but not filtering)
- [ ] `GridApiDataSource` (Phase 3 — replaces ES adapter, adds auth, uses Grid media-api HATEOAS links)
- [ ] Row grouping (e.g. group by credit, source, date) — TanStack Table has built-in `getGroupedRowModel()` + `getExpandedRowModel()` with aggregation functions. Works client-side on loaded rows; for 9M-scale grouping would need server-side via ES composite/terms aggs with `manualGrouping: true`. Consider alongside facet filters.
- [ ] Discovery features beyond faceted filters — date histograms, geographic clustering, credit/source network visualisation, usage pattern analysis, visual similarity (knn on existing embedding vectors), trending/significant_terms. All read-only ES-native. Some depend on mapping enhancements (`mapping-enhancements.md`). See `frontend-philosophy.md` → "Discovery: Beyond Search".

### Immediate Next Steps (as of 2026-03-28)

**Goal:** Scrubber must be rock-solid before any new feature work.

**Workflow:**
1. ✅ **Commit structure decided** — squash 4 local checkpoint commits into one Scrubber commit, then a separate "Playwright testing" commit for all test infrastructure.
2. ✅ **Test against real ES** — ran `./scripts/start.sh --use-TEST` and manually exercised scrubber at 1.3M scale. 3 bugs found.
3. ✅ **Write regression tests** — 8 new Playwright E2E tests (Bug #12: 2, Bug #13: 4 incl. telemetry + timing assertions, Bug #14: 2). All pass on local ES. Bug #13 tests now capture `findKeywordSortValue` console telemetry to catch algorithmic regressions (page count, timing) that would only manifest as slowness on real clusters.
4. ✅ **Fix bugs** — all 3 bugs fixed, all 54 tests pass:
   - **Bug #12 — Wheel scroll after scrubber seek:** After seeking to ~50%, last cells visible but mousewheel doesn't scroll. Root cause: seek cooldown was refreshed at data arrival (500ms extension), blocking `extendForward` from firing after the buffer landed near its edge. Fix: removed second cooldown refresh at data arrival; added deferred scroll event (600ms) in ImageGrid/ImageTable seekGeneration `useLayoutEffect` to trigger extend checks after cooldown expires. Files: `search-store.ts`, `ImageGrid.tsx`, `ImageTable.tsx`.
   - **Bug #13 — Keyword sort scrubber seek has no effect:** Under Credit/Source sort, clicking scrubber at ~50% doesn't move results on TEST (1.3M docs). Root cause: `findKeywordSortValue()` composite aggregation used `BUCKET_SIZE=1000` — fine locally but too slow at scale (50-100+ pages through SSH tunnel). Fix: increased `BUCKET_SIZE` to 10000 (configurable via `VITE_KEYWORD_SEEK_BUCKET_SIZE`), added 8s time cap returning approximate value, added structured telemetry logging. Also improved iterative skip path (Strategy B for script sorts): `noSource: true` + `MAX_RESULT_WINDOW` chunks + 50-iteration cap. Files: `es-adapter.ts`, `types.ts`, `mock-data-source.ts`, `search-store.ts`, `vite-env.d.ts`.
   - **Bug #14 — End key doesn't scroll to end under non-date sort:** End key under Credit sort on TEST landed ~15k short of end. Three sub-bugs discovered via iterative smoke testing (S5): (1) Composite agg returned null when exhausted by null-credit docs — fixed: return `lastKeywordValue`. (2) ES `missing: "_last"` default applies to BOTH asc and desc, so naive reverse search still puts nulls last — fixed: added `missingFirst` parameter to `searchAfter` DAL interface, sets `missing: "_first"` on the primary sort field so nulls come first in reversed order (= last in original). (3) `countBefore` can't build range queries for null sort values — fixed: skip `countBefore` for the reverse fallback, compute `actualOffset = total - hits.length` directly. **Locally undetectable** — sample data has no missing credits. Smoke test S5 is the authoritative guard. Files: `es-adapter.ts`, `types.ts`, `mock-data-source.ts`, `search-store.ts`.
5. ✅ **Re-enable skipped tests** — Bug #7 keyword sort seek tests were already active (not skipped). They now run faster (~1.7s vs ~2.3s) thanks to `noSource` optimisation.
6. ⬜ **Only then:** proceed with new features (column reorder, quicklook, etc.)

**Non-linear drag:** explicitly parked. Research preserved in `scrubber-nonlinear-research.md`. Revisit only after scrubber is bug-free with comprehensive test coverage.

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
| Testing | Vitest (co-located `*.test.ts` unit/integration tests) + Playwright (E2E in `e2e/`, `run-e2e.sh` orchestrates Docker ES + data + cleanup) |
| Dates | date-fns |

## Key Architecture Decisions

1. **Separate ES instance on port 9220** — kupua's `docker-compose.yml` is independent of Grid's. Container `kupua-elasticsearch`, cluster `kupua`, volume `kupua-es-data`. Grid's `dev/script/start.sh` won't affect it.

2. **Data Access Layer (DAL)** — TypeScript interface `ImageDataSource` with methods: `search()`, `count()`, `getById()`, `getAggregation()`, `searchAfter()`, `openPit()`, `closePit()`, `countBefore()`, `estimateSortValue()`, `findKeywordSortValue()`. Currently implemented by `ElasticsearchDataSource` (direct ES access via ~2,180 lines across 5 files: `es-adapter.ts`, `cql.ts`, `field-registry.ts`, `types.ts`, `es-config.ts`). `searchAfter()` is now the primary pagination method — used by `search()`, `extendForward`/`extendBackward`, and `seek()` in the store. Supports `reverse`, `noSource`, and `missingFirst` flags. `missingFirst` overrides `missing: "_first"` on the primary sort field — needed for reverse-seek-to-end on keyword fields where null-value docs sort last in both asc and desc (ES default). Deep seek uses two strategies: (A) for numeric/date fields, `estimateSortValue()` uses ES percentiles aggregation to estimate the sort value at position N; (B) for keyword fields (credit, source, etc.), `findKeywordSortValue()` uses composite aggregation with `BUCKET_SIZE=10000` (configurable via `VITE_KEYWORD_SEEK_BUCKET_SIZE`) to walk unique values accumulating doc_counts until the target position is reached. When composite exhausts (null/missing-value tail), returns `lastKeywordValue` instead of null. Has an 8s time cap. Structured telemetry logging enables E2E tests to assert algorithmic efficiency. When keyword seek lands far from target near the end, a reverse `search_after` with `missingFirst: true` fetches the true last page; `actualOffset = total - hits.length` (skipping `countBefore` which can't handle null sort values). Script sorts (dimensions) fall back to iterative `search_after` with `noSource: true` and reduced chunk sizes. Phase 3+ architecture: **dual-path** — keep direct ES for reads (fast, supports script sorts and custom aggregations), add `GridApiDataSource` for writes (metadata editing, crops, leases via media-api). Full migration surface analysis in deviations.md §16.

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

8. **Scrollbar strategy** — Now uses a **windowed buffer architecture**: fixed-capacity buffer (max 1000 entries) with `bufferOffset` mapping buffer[0] to a global position. `search_after` with PIT provides cursor-based pagination. `extendForward`/`extendBackward` append/prepend pages as the viewport approaches buffer edges; eviction keeps memory bounded. `seek()` repositions the buffer anywhere in the result set: shallow offsets (<10k) use `from/size`, deep offsets (≥10k) use **percentile estimation** on the primary sort field + `search_after` + `countBefore` for exact offset — no depth limit, ~20-70ms regardless of position (vs 500-2500ms for `from/size` at 50-100k). The `estimateSortValue()` DAL method runs a single ES percentiles aggregation. **Native scrollbar hidden** (`hide-scrollbar` CSS class) — the custom **Scrubber** (`Scrubber.tsx`) is the sole visible scrollbar. Always rendered (even for small result sets). Two modes: **scroll mode** (total ≤ buffer, all data loaded — scrubber scrolls the content container directly) and **seek mode** (total > buffer — scrubber triggers seek to reposition the buffer). Vertical track on the right edge, proportional thumb, click-to-seek/scroll, drag-to-seek/scroll with 200ms debounce in seek mode, keyboard accessible, position tooltip on active interaction. Thumb position uses direct DOM manipulation via ref for 60fps tracking during drag. `pendingSeekPosRef` (a plain ref, not state) holds the user's intended position during async seek — blocks the DOM sync effect from snapping the thumb back until the seek completes; cleared when `currentPosition` changes, `loading` transitions true→false, or `total` changes. Track height measured via **callback ref** + ResizeObserver (not `useEffect([], [])`) because the component returns null when `total ≤ 0` — a mount-time effect would miss the DOM element. Seek abort: aborted seeks do NOT set `loading: false` (the newer seek/search owns loading state); `countBefore` accepts an abort signal; `signal.aborted` guard before `countBefore` call. Seek cooldown (500ms, set synchronously at seek start, NOT refreshed at data arrival) suppresses extend cascades during the fetch. Views dispatch a deferred scroll event 600ms after seek lands to trigger extends once cooldown expires. Logo click explicitly calls `store.search()` to reset the buffer even when URL params haven't changed. `imagePositions: Map<imageId, globalIndex>` maintained incrementally, cleaned on eviction. PIT opened on non-local ES for consistent pagination; local ES skips PIT (stable 10k dataset). Old `loadMore`/`loadRange` kept as deprecated aliases during migration. Previous approach (sparse array + `from/size` + `frozenUntil`) replaced. Kahuna analysis in `kahuna-scroll-analysis.md`. Full design in `search-after-plan.md`.

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

29. **CSS containment on scroll containers** — `hide-scrollbar` class includes `contain: strict` (= size + layout + paint + style). Critical for Firefox scroll performance: without it, Gecko recalculates full-page layout whenever virtualizer items reposition during scroll. The element's size comes from the flex parent (not content), so `contain: size` is safe. Learned from Immich (`#asset-grid { contain: strict; scrollbar-width: none; }`). Google Photos uses the same pattern. Both only show a virtual scrubber — no native scrollbar — matching kupua's approach.

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
      search-after-plan.md     # search_after + windowed scroll: analysis, architecture, 13-step implementation plan (~25-35h)
      scrubber-nonlinear-research.md # Non-linear drag mapping: prior art, curve analysis, gotchas, recommendation (power curve k=2)
  scripts:
    start.sh                   # One-command startup (ES + data + deps + S3 proxy + imgproxy + dev server)
    run-e2e.sh                 # E2E test orchestration (Docker ES + data check + stale-process cleanup + Playwright)
    run-smoke.mjs              # Interactive runner for manual smoke tests. Lists tests, prompts for selection, runs headed. MANUAL ONLY.
    load-sample-data.sh        # Index creation + bulk load
    s3-proxy.mjs               # Local S3 thumbnail proxy (uses dev AWS creds, temporary)
  src/                         # ~11,180 lines total
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
      sort-context.ts          # Sort-context label utility — maps orderBy + Image → display label (date/keyword) for scrubber tooltip
      image-urls.ts            # Image URL builders — thumbnails via S3 proxy, full images via imgproxy
      image-offset-cache.ts    # sessionStorage cache for image offset in search results — survives page reload
      typeahead-fields.ts      # Builds typeahead field definitions for CQL input from DAL (251 lines)
    dal/
      types.ts                 # ImageDataSource interface + SearchParams + SortValues + BufferEntry + SearchAfterResult + AggregationRequest/AggregationsResult + estimateSortValue types (~245 lines)
      es-adapter.ts            # Elasticsearch implementation (~760 lines — sort aliases, CQL translation, free-to-use filter, batched aggregations, search_after, PIT lifecycle, countBefore, estimateSortValue, tiebreaker sort)
      es-adapter.test.ts       # Unit tests for buildSortClause tiebreaker behaviour (10 tests)
      mock-data-source.ts      # MockDataSource — deterministic mock for testing, generates img-{index} with linear dates (~210 lines)
      es-config.ts             # ES connection config — URL, index, source excludes, allowed paths (_search, _count, _cat/aliases, _pit), local flag
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
      Scrubber.tsx             # Global position scrubber — vertical track on right edge of content area. Proportional thumb, click-to-seek, drag-to-seek (deferred to pointer up), keyboard accessible (arrows + Shift+arrows for large step). Sort-aware tooltip with date/keyword context. Auto-hide after 2s inactivity, fade in on scroll/hover. Hidden when total ≤ 0. Callback ref for ResizeObserver + wheel event. pendingSeekPosRef for async seek position hold. (~560 lines)
    stores/
      search-store.ts          # Zustand store — windowed buffer (search, extendForward/Backward via reverse search_after, seek, eviction, PIT lifecycle), search params, imagePositions, sort-around-focus (async find-and-seek after sort change), aggregations + fetchAggregations with cache/debounce/circuit-breaker, expandedAggs + fetchExpandedAgg for per-field "show more". View components access data via useDataWindow hook, not directly. (~1020 lines)
      search-store.test.ts     # Integration tests with MockDataSource (34 tests): search, seek, extend, eviction, imagePositions consistency, sort-around-focus lifecycle, density-switch ratio, sort-context label interpolation
      column-store.ts          # Zustand store + localStorage persist (column visibility, widths, pre-double-click widths) (~109 lines)
      panel-store.ts           # Zustand store + localStorage persist (panel visibility, widths, section open/closed) (~140 lines)
    types/
      image.ts                 # Image document types from ES mapping
  e2e/
    global-setup.ts            # Playwright global setup — verifies ES health + sample data before tests run (fail-fast)
    helpers.ts                 # Playwright test fixtures + KupuaHelpers class (scrubber interaction, store state access, sort/density helpers)
    scrubber.spec.ts           # E2E tests: scrubber seek/drag, scroll position after seek, density switch preservation, sort change, sort-around-focus, keyboard nav, full workflows
    manual-smoke-test.spec.ts  # Smoke tests against real ES (TEST cluster). MANUAL ONLY — agent must never run. Auto-skips on local ES (total < 100k). Run via: node scripts/run-smoke.mjs
    tsconfig.json              # TypeScript config for e2e directory (ES2022, bundler resolution)
    hooks/
      useDataWindow.ts       # Data window hook — shared interface between search store and view components (table, grid, detail). Buffer-aware: exposes bufferOffset, reportVisibleRange (triggers extend at edges), seek, getImage (buffer-local), findImageIndex (global→local translation). Exports useVisibleRange() via useSyncExternalStore for Scrubber position tracking. Virtualizer count = buffer length. (~215 lines).
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

