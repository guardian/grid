# Kupua — Grid Frontend Migration Plan

> **Created:** 2026-03-21
> **Status:** Draft
> **Goal:** Replace kahuna (AngularJS) with a modern, extremely fast React-based frontend for Grid's ~9M image DAM.

---

## Table of Contents

1. [Vision](#vision)
2. [Tech Stack](#tech-stack)
3. [Architecture Overview](#architecture-overview)
4. [Phase 1 — Read-Only with Sample Data](#phase-1--read-only-with-sample-data)
5. [Phase 2 — Connect to Live Elasticsearch](#phase-2--connect-to-live-elasticsearch)
6. [Phase 3 — Connect to Grid API (media-api)](#phase-3--connect-to-grid-api-media-api)
7. [Phase 4 — Write Operations & Editing](#phase-4--write-operations--editing)
8. [Phase 5 — Feature Parity with Kahuna](#phase-5--feature-parity-with-kahuna)
9. [Phase 6 — Beyond Kahuna](#phase-6--beyond-kahuna)
10. [Kahuna Feature Inventory](#kahuna-feature-inventory)
11. [Data Model Reference](#data-model-reference)

---

## Vision

A single-page application where all views are **different presentations of the same ordered list** of images:

| Density Level | Description |
|---|---|
| **Table** | Spreadsheet — rows of metadata, configurable/reorderable columns |
| **Thumbnails** | Grid of image thumbnails (like current kahuna) |
| **Side-by-side** | Two images compared |
| **Single image** | Full detail view of one image (replaces kahuna's `/images/:id` route) |

All views:
- Stay **in sync** — changing selection in one view is reflected in all others
- Are on a **single page** — no route navigation between views, only density slider
- Have **URL reflecting full state** — query, sort, view mode, scroll position, selected image
- Support **browser back/forward** — users never get lost
- Enable **fullscreen** and **image zoom** — traversal in fullscreen = moving between rows

### Performance Targets
- **60fps scrolling** through virtualised lists of 9M images
- **< 100ms** perceived latency for search/filter changes
- **Instant** density transitions (no re-fetch, no layout thrash)
- **Google Photos-style scrollbar** — a vertical track representing the full sorted range, with a thumb position = `currentIndex / totalCount` and overlaid date/time labels calculated from scroll position

---

## Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| **UI Framework** | React 18+ with TypeScript | Modern, massive ecosystem, concurrent features for smooth UI |
| **Table / Grid** | TanStack Table v8 | Headless, virtualised, column reordering/resizing/pinning, extremely performant |
| **Virtual Scroll** | TanStack Virtual | Powers both table and thumbnail grid views; gives `scrollOffset` + `totalSize` for scrollbar arithmetic |
| **State Management** | Zustand | Lightweight, no boilerplate, middleware for URL sync and persistence |
| **Routing** | TanStack Router | Modern, built-in search params validation via Zod, pairs with TanStack ecosystem, URL = `?q=london&sort=-uploadTime&view=table&index=4231` |
| **Styling** | Tailwind CSS | Utility-first for rapid density tweaks (padding, font-size, gap) via CSS vars; no CSS-in-JS runtime overhead at 60fps; easy dark mode for image viewing |
| **Build** | Vite | Fast dev server with HMR, fast production builds |
| **Data Layer** | Abstracted ES client → Grid API adapter | Phase 1 talks to local ES directly; later swap to Grid API without touching UI code |
| **Schema Validation** | Zod | Validate ES responses, route params, form inputs |
| **Date Handling** | date-fns or dayjs | Lightweight replacement for moment.js |

### Custom Scrollbar (Google Photos-style)
- ~100-line component, no library needed
- Vertical track representing the full sorted range
- Thumb position = `currentIndex / totalCount`
- Overlaid labels (date, upload time, etc.) calculated from the scroll position
- TanStack Virtual provides `scrollOffset` and `totalSize` for the mapping

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Kupua (React SPA)                │
│                                                     │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │ Zustand  │  │ TanStack │  │    View Layer      │ │
│  │  Store   │◄─┤  Router  │  │ (Table/Grid/Detail)│ │
│  │          │  │  (URL)   │  │                    │ │
│  └────┬─────┘  └──────────┘  └────────┬───────────┘ │
│       │                               │             │
│  ┌────▼───────────────────────────────▼───────────┐ │
│  │           Data Access Layer (DAL)              │ │
│  │  ┌─────────────────┐  ┌──────────────────────┐│ │
│  │  │  ES Adapter      │  │  Grid API Adapter    ││ │
│  │  │  (Phase 1-2)     │  │  (Phase 3+)          ││ │
│  │  └────────┬─────────┘  └──────────┬───────────┘│ │
│  └───────────┼───────────────────────┼────────────┘ │
└──────────────┼───────────────────────┼──────────────┘
               │                       │
       ┌───────▼────────┐    ┌─────────▼──────────┐
       │ Local ES        │    │ Grid media-api     │
       │ (docker-compose)│    │ (Play/Scala)       │
       │ + sample data   │    │                    │
       └────────────────┘    └────────────────────┘
```

The **Data Access Layer (DAL)** is a TypeScript interface:

```typescript
interface ImageDataSource {
  search(params: SearchParams): Promise<SearchResult>;
  getImage(id: string): Promise<Image>;
  getAggregation(field: string, query?: string): Promise<AggResult>;
  getSuggestions(field: string, prefix: string): Promise<string[]>;
}
```

Phase 1-2 implements `ElasticsearchDataSource`.
Phase 3+ implements `GridApiDataSource`.
The UI never knows which one is active.

---

## Phase 1 — Read-Only with Sample Data

> **Goal:** Prove the tech stack works. Load real data into local ES, display it in a fast table view with search and filtering. No writes, no auth, no production systems.

### 1.1 — Local Elasticsearch Setup

Kupua has its **own** `docker-compose.yml` with ES on **port 9220** (not 9200) to avoid
clashing with the main Grid ES. Both can run simultaneously. The container is named
`kupua-elasticsearch` (vs Grid's `grid-elasticsearch-1`) and uses a separate named volume
(`kupua-es-data`) so data is fully isolated.

- [x] `kupua/docker-compose.yml` — standalone ES on port 9220, cluster name `kupua`
- [x] `kupua/scripts/load-sample-data.sh` — creates index with mapping + bulk loads sample data
- [x] Verify with `curl localhost:9220/_cat/indices` and a test query
- [x] Document the setup steps in `kupua/README.md`

**Usage:**
```bash
# Start kupua ES (won't affect Grid's ES on port 9200)
cd kupua && docker compose up -d

# Load sample data
./kupua/scripts/load-sample-data.sh

# Verify
curl -s 'http://localhost:9220/images/_count?pretty'
curl -s 'http://localhost:9220/images/_search?size=1&pretty' | head -30
```

**Files:**
- `kupua/docker-compose.yml` — ✅ created
- `kupua/scripts/load-sample-data.sh` — ✅ created
- `kupua/exploration/mapping.json` — already exists
- `kupua/exploration/sample-data.ndjson` — already exists (115MB, from CODE)

### 1.2 — Project Scaffold

- [x] Initialised kupua as standalone Vite + React 19 + TypeScript app
- [x] Installed dependencies: TanStack Table v8 / Virtual / Router, Zustand, Zod, Tailwind CSS 4, date-fns
- [x] Configured Vite with proxy to local ES (`/es/*` → `localhost:9220`)
- [x] Added `kupua/.gitignore` (sample-data.ndjson, node_modules, dist)
- [x] Dev server runs on port 3000
  ```
  kupua/
    exploration/          # already exists
      mapping.json
      sample-data.ndjson
      docs/
        migration-plan.md  # this file
    scripts/
      load-sample-data.sh
    src/
      main.tsx
      App.tsx
      routes/
      components/
      dal/                 # Data Access Layer
      stores/
      types/
      hooks/
    public/
    index.html
    package.json
    tsconfig.json
    vite.config.ts
    tailwind.config.ts
    .gitignore
    README.md
  ```
- [x] Install dependencies:
  - `react`, `react-dom`
  - `@tanstack/react-table`, `@tanstack/react-virtual`, `@tanstack/react-router`
  - `zustand`
  - `zod`
  - `tailwindcss`, `@tailwindcss/vite`
  - `date-fns`
  - `@guardian/cql`
- [x] Configure Vite with proxy to local ES (`/es/*` → `localhost:9220`)
- [x] Add to `.gitignore`: `node_modules`, `dist`, ignore `sample-data.ndjson` (too large for git — it stays local or in S3)

### 1.3 — Data Access Layer (ES Adapter)

- [x] Defined TypeScript types from the ES mapping (`kupua/src/types/image.ts`)
- [x] Defined abstract `ImageDataSource` interface (`kupua/src/dal/types.ts`)
- [x] Implemented `ElasticsearchDataSource` (`kupua/src/dal/es-adapter.ts`):
  - `search(params)` → ES `_search` with query DSL (multi_match, filters, sort, pagination)
  - `getImage(id)` → ES `_doc` get
  - `getAggregation(field, query)` → ES terms aggregation
  - `getSuggestions(field, prefix)` → ES completion suggester
- [x] Proxy ES requests through Vite dev server (no CORS issues)
- [x] Sort conventions match Grid's (`-uploadTime`, `taken`, etc.)

### 1.4 — Core Table View

- [x] **Search bar** — debounced text input, updates URL (planned), shows result count + timing
- [x] **Results table** using TanStack Table:
  - Default columns: ID, title, description, byline, credit, source, dateTaken, uploadTime, uploadedBy, dimensions, mimeType, usageRights.category
  - Column resizing via drag handles
- [x] **Virtual scrolling** via TanStack Virtual:
  - Renders only visible rows + 20-row overscan buffer
  - Infinite scroll: fetches next page when approaching bottom
- [x] **Sort control** — click column header to toggle asc/desc, reflected visually (↑/↓ arrow)
- [x] **Total count** display with query timing
- [x] **Loading states** — "Loading more…" indicator at bottom during pagination

### 1.5 — Search & Filtering

- [x] **Free-text search** — debounced CQL input → ES query via `cql.ts` translator
- [x] **CQL chips** — `@guardian/cql` `<cql-input>` Web Component with typeahead, field suggestions, chip editing
- [x] **Date range filters** — upload date, date taken, last modified (DateFilter component with radio type, presets, custom range pickers)
- [ ] **Facet filters** (from ES aggregations):
  - `uploadedBy` — dropdown/autocomplete
  - `usageRights.category` — multi-select
  - `metadata.source` — multi-select
  - `metadata.credit` — autocomplete
- [x] **Click-to-search** — shift-click cell to filter, alt-click to exclude
- [x] **Free-to-use filter** — checkbox toggling `nonFree` URL param
- [x] All filters reflected in URL search params

### 1.6 — URL State & Navigation

- [x] TanStack Router setup with validated search params (Zod schema in `search-params-schema.ts`)
- [x] Custom plain-string URL serialisation (no qss/JSON.stringify artefacts)
- [x] Browser back/forward correctly restores search + scroll position
- [x] Zustand store synced with URL via `useUrlSearchSync` hook
- [x] URL params match Grid/kahuna conventions: `query`, `orderBy`, `nonFree`, `since`/`until`, `takenSince`/`takenUntil`, `modifiedSince`/`modifiedUntil`

### 1.7 — Custom Scrollbar (Stretch Goal for Phase 1)

- [ ] Vertical track component overlaid on scroll container
- [ ] Thumb position calculated from `scrollOffset / totalSize`
- [ ] Date/time labels sampled from the data at intervals along the track
- [ ] Click-to-jump: click a position → scroll to that offset
- [ ] Drag thumb to scrub through results

### Phase 1 Definition of Done

- [x] `docker compose up` + `./kupua/scripts/load-sample-data.sh` gives you a working local ES with real data
- [x] `cd kupua && npm run dev` opens a fast table of images from local ES
- [x] Can search, filter, sort, scroll through all sample data smoothly
- [x] URL reflects all state; back/forward works
- [ ] Column config is reorderable and persisted (visibility done, drag reorder remaining)
- [x] No calls to any production or CODE system

---

## Phase 2 — Connect to Live Elasticsearch

> **Goal:** Point kupua at a real (CODE) Elasticsearch cluster to test against the full ~9M image dataset. Still read-only, no auth.

- [ ] Make ES endpoint configurable via environment variable (`KUPUA_ES_URL`)
- [ ] Test against CODE ES (requires VPN/tunnel)
- [ ] Performance tuning:
  - Pagination strategy: keyed search_after vs offset (for deep pagination of 9M docs)
  - ES query optimisation (filter context vs query context)
  - Consider `_source` filtering — only fetch fields needed for current columns
- [ ] Implement `search_after` cursor-based pagination for scroll-through of full dataset
- [ ] Stress-test: scroll to image #5,000,000 — does the scrollbar work? Does perf hold?

---

## Phase 3 — Connect to Grid API (media-api)

> **Goal:** Switch from direct ES access to the Grid media-api. Add authentication. This makes kupua deployable alongside the existing Grid stack.

- [ ] Implement `GridApiDataSource` (`kupua/src/dal/grid-api-adapter.ts`):
  - Uses the existing HATEOAS API (follow links from root)
  - Maps search params to Grid API query params
  - Handles pagination via Grid's offset/length model
- [ ] Add authentication:
  - Integrate with Grid's auth service (OIDC / pan-domain auth)
  - Session management (cookie-based, same as kahuna)
- [ ] DAL config: switch between `es` and `grid-api` via env var or feature flag
- [ ] Deploy kupua as a new Play route or standalone service alongside kahuna
- [ ] Read-only at this stage — no edits, no uploads

---

## Phase 4 — Write Operations & Editing

> **Goal:** Add mutation capabilities. Users can edit metadata, manage rights, archive/delete.

### 4.1 — Single Image Editing
- [ ] Metadata editing (byline, description, credit, keywords, labels, title, special instructions)
- [ ] Usage rights category selection and property editing
- [ ] Photoshoot assignment
- [ ] Archive / un-archive
- [ ] Soft-delete / un-delete

### 4.2 — Batch Operations
- [ ] Multi-select (checkbox column + shift-click range select + cmd/ctrl-click)
- [ ] Batch metadata editing with diff tracking (as kahuna's `metadataDiff.js`)
- [ ] Batch archiving
- [ ] Batch deletion
- [ ] **Deferred mass-edits with concurrency braces:**
  - Queue edits as jobs
  - Display ongoing jobs panel (job ID, progress, status)
  - Handle conflicts (optimistic concurrency via ES version or Grid API ETags)

### 4.3 — Leases
- [ ] View leases on images
- [ ] Add/remove access leases (allow/deny) with date ranges
- [ ] Auto-leases from usage rights categories

### 4.4 — Collections
- [ ] View collections tree
- [ ] Add/remove images from collections
- [ ] Create/delete collections
- [ ] Drag-and-drop into collections

---

## Phase 5 — Feature Parity with Kahuna

> **Goal:** Every feature kahuna has, kupua has too (but better). This is the prerequisite for decommissioning kahuna.

### 5.1 — Crops
- [ ] View existing crops on images
- [ ] Create new crops (aspect ratio presets, freeform, circular mask)
- [ ] Delete crops
- [ ] Crop selection events for embedding (postMessage to parent iframe)

### 5.2 — Upload
- [ ] Drag-and-drop upload
- [ ] File picker upload
- [ ] Upload job tracking with progress
- [ ] Duplicate detection
- [ ] Pre-upload metadata/rights assignment

### 5.3 — Usages
- [ ] View digital, print, front, syndication, download usages
- [ ] Usage status indicators (published, pending, removed, replaced)

### 5.4 — Syndication
- [ ] Syndication status filtering
- [ ] Syndication rights display
- [ ] Syndicate image action

### 5.5 — Embedding / Integration
- [ ] iframe embed mode (for Composer and other tools)
- [ ] `postMessage` events: crop-selected, crop-created, crops-created
- [ ] Drag data: grid image data, crop data, asset handles with MIME types
- [ ] `application/vnd.mediaservice.*` MIME type support

### 5.6 — Miscellaneous
- [ ] Permissions-based UI (canUpload, canArchive, canDelete, showPaid)
- [ ] Notifications / announcements banner
- [ ] Sentry error tracking
- [ ] Telemetry
- [ ] Keyboard shortcuts (customisable)
- [ ] CQL structured query input (from `@guardian/cql` package)

---

## Phase 6 — Beyond Kahuna

> **Goal:** Features that kahuna never had. The reason for building kupua.

- [ ] **Adjustable density slider** — seamless transition between table/grid/detail views
- [ ] **Google Photos scrollbar** — full position-aware scrubber with date labels
- [ ] **AI/semantic search** — leverage existing `embedding.cohereEmbedEnglishV3` vectors for similarity search
- [ ] **Saved searches / filters** — persist named filter combinations
- [ ] **Comparison mode** — side-by-side image comparison with metadata diff
- [ ] **Dark mode** — essential for image viewing/editing
- [ ] **Offline / PWA capabilities** — cache recently viewed images
- [ ] **Real-time updates** — WebSocket/SSE for live index changes
- [ ] **Advanced analytics** — usage patterns, most-used images, upload trends
- [ ] **Custom metadata schemas** — dynamic domain metadata without code changes

---

## Scrollbar & Infinite Scroll — Design Notes

> Learnings captured from studying the Google Photos scrollbar design
> (Antin Harasymiv, 2019) and applying them to kupua's context.
> This section is reference material — not a spec. Record insights here;
> don't delete them even once the scrollbar is built.

### The problem with native scrollbars at scale

A native browser scrollbar represents the *rendered* pixel height of the
content.  With virtualised rendering (TanStack Virtual), the browser only
knows about the items currently in the DOM + estimated total height.  For
a dataset of 9M images:

- The scrollbar thumb becomes sub-pixel (invisible / ungrabbable).
- Small thumb movements jump thousands of items — no fine control.
- `scrollTop` is a pixel offset, not a meaningful position in the dataset.
- Infinite scroll compounds this: the total height grows as pages load,
  causing the thumb to jump around as new pages append.

### Google Photos' approach (key ideas)

1. **Semantic position, not pixel offset.**  The thumb position represents
   `currentIndex / totalCount`, not `scrollTop / scrollHeight`.  Dragging
   the thumb to 50% means "show me the middle of my library", regardless
   of how many pixels that is.

2. **The scrubber is a separate control.**  It overlays the content area
   but is not the browser's native scrollbar.  Content still scrolls
   natively (for momentum, touch inertia, etc.) — the scrubber just
   reflects and controls the *logical* position.

3. **Date labels on the track.**  While dragging, a floating label shows
   the date at the thumb's position (e.g. "March 2024").  This gives the
   user spatial orientation in a collection that's too large to browse
   linearly.

4. **Two scrolling modes.**
   - **Nearby scrolling:** normal virtual scroll — render visible items,
     prefetch a few pages ahead/behind.  The scrubber thumb moves smoothly
     in sync.
   - **Seeking (scrubber drag / big jump):** the user moves the thumb to
     a distant position.  The app fetches the items *at that position*
     directly (random access), replacing the visible window entirely.
     This is fundamentally different from sequential pagination.

5. **Stable anchors.**  Positions are anchored to *dates*, not offsets.
   If 100 new images are uploaded between two sessions, the absolute
   offset of "March 2024" changes, but the date anchor stays stable.

### Challenges specific to kupua / Grid

#### 1. Deep pagination in Elasticsearch

ES has two pagination mechanisms:

| Method | Pros | Cons |
|---|---|---|
| `from / size` | Random access (jump to any offset) | Capped at 10,000 by default (`index.max_result_window`). Performance degrades linearly with depth — at offset 5M, ES must score and skip 5M docs. |
| `search_after` + PIT | Efficient at any depth, consistent view via point-in-time snapshot | **Sequential only** — you must have the sort values of the previous page to fetch the next. No random jumps. |

Neither alone solves the scrubber problem.  A hybrid approach:

- **Sequential browsing (scroll up/down):** use `search_after` with a PIT
  for efficient deep pagination.
- **Seeking (scrubber drag):** use a *sort-value-based lookup* instead of
  offset.  If sorted by `uploadTime DESC`, seeking to 50% means "find the
  image whose uploadTime is at the 50th percentile".  This can be
  approximated with an ES percentile aggregation or a pre-computed
  date→offset index.

#### 2. Sort-dependent labels

Date labels work beautifully when sorted by `uploadTime` or `dateTaken`.
But kupua supports sorting by credit, source, category, etc.  What label
to show depends on the active sort:

The label strategy depends on the **field type**, not the specific field:

| Field type | Sort fields | Scrubber label | Example |
|---|---|---|---|
| Date | `uploadTime`, `dateTaken` | Human-readable date | "14 Mar 2024" |
| Keyword (text-like) | `credit`, `source`, `category`, `uploader`, `imageType`, `fileType`, `filename` | First letter | "G", "R", "P" |
| Numeric | `source.dimensions.width`, `source.dimensions.height` | The number itself | "4032", "1920" |
| Multi-sort | any | Primary sort value only | Ignore secondary |

For keyword sorts, first-letter markers on the track (like a phone
contacts sidebar: A B C D…) give spatial orientation.  The floating
label while dragging shows the full value at the thumb position.

#### 3. Total count requirement

The scrubber needs `totalCount` to compute thumb position.  We already
set `track_total_hits: true` on every search (accurate totals).  For 9M
docs this adds minor latency.  Options to mitigate:

- Cache the total after the first search; only refresh on filter change.
- Use an approximate total for thumb sizing (ES default 10,000 lower bound)
  and refine once the exact count arrives.

#### 4. Virtual scroll + scrubber interaction

TanStack Virtual manages a scroll container with height
`estimateSize × count`.  The scrubber needs to either:

- **Control TanStack Virtual's scroll position** — map thumb position to
  a `scrollToIndex` call.  This works for the loaded window but can't
  seek beyond loaded data.
- **Replace the data window** — on a big seek, fetch new results starting
  at the target offset, replace the store's `results` array, and reset
  TanStack Virtual.  The scroll position resets to top of the new window.
- **Both** — smooth scroll within loaded data, hard seek + replace for
  distant jumps.

The transition between smooth scroll and hard seek must be seamless.
There will be a loading state during seeks (skeleton rows or a spinner).

#### 5. Mobile

The Google Photos scrubber on mobile is a touch target on the right edge.
Considerations:

- Touch target must be large enough (44px minimum per Apple HIG).
- Drag up/down to seek — conflicts with normal scroll gesture.  Google
  Photos solves this by requiring a deliberate horizontal-then-vertical
  gesture on the scrubber area.
- The date label appears on drag and disappears on release.
- On very small screens, the scrubber may not be worth showing — the
  primary navigation is search + filters, not browsing.

#### 6. Infinite scroll vs windowed scroll

Current kupua uses infinite scroll (load page 1, then 2, 3… as the user
scrolls down).  This has problems at scale:

- Memory grows unboundedly (all loaded pages stay in the `results` array).
- The further you scroll, the more stale the early pages become.
- You can never reach position 5M by scrolling — it would take hours.

A **windowed** approach is better for the scrubber:

- Keep a fixed-size window of results (e.g. 200–500 items).
- The window slides as the user scrolls or seeks.
- Pages behind the window are evicted from memory.
- The scrubber position reflects `windowStart / totalCount`, not
  `scrollTop / totalHeight`.

This is a significant architectural change from the current infinite
scroll.  It should be planned for Phase 2 (when connected to live ES
with 9M docs) — for Phase 1 with 10k docs, infinite scroll is fine.

#### 7. Bookmark / share deep positions

If a user scrubs to position 60% and copies the URL, what's in the URL?
Options:

- `offset=5400000` — fragile (changes as new images are added).
- `after=2024-03-14T12:00:00Z` — stable anchor (only works for date sorts).
- Nothing — the URL captures query + sort + filters, but not scroll
  position.  This matches kahuna's behaviour and is simplest.

For Phase 1, scroll position is NOT in the URL (matching kahuna).

### Summary: what to build and when

| Phase | Scroll behaviour | Scrubber |
|---|---|---|
| **Phase 1** (10k docs) | Infinite scroll (append pages). Native scrollbar. | None — not needed for 10k. |
| **Phase 2** (9M docs, ES direct) | Switch to windowed scroll + `search_after`. Evict distant pages. | Basic scrubber: thumb = `windowStart / total`. No labels yet. Test seeking with `from/size` for big jumps. |
| **Phase 6** (polish) | Refined windowed scroll with prefetch. | Full scrubber: sort-aware labels, smooth drag, mobile touch, letter markers for keyword sorts. |

---

## Kahuna Feature Inventory

Complete list of kahuna functionality that needs to be migrated (or consciously dropped):

### Views & Navigation
| Feature | kahuna Implementation | Kupua Status |
|---|---|---|
| Search results grid | `gu-lazy-table` (virtual grid of thumbnails) | ✅ Phase 1 (table view) |
| Image detail page | `/images/:imageId` route | Phase 1 (inline detail) |
| Crop page | `/images/:imageId` → crop state | Phase 5 |
| Upload page | `/upload` route | Phase 5 |
| Deep state redirect | `ui-router-extras` DSR | Phase 1 (TanStack Router) |

### Search & Discovery
| Feature | kahuna Implementation | Kupua Status |
|---|---|---|
| Free text search | CQL query input | ✅ Phase 1 |
| Structured query (CQL) | `@guardian/cql` | ✅ Phase 1 (chips + typeahead via `<cql-input>`) |
| Date range filters | `gu-date-range` component | ✅ Phase 1 |
| Sort by upload/taken/collection date | `gr-sort-control` + `gr-extended-sort-control` | ✅ Phase 1 |
| "With/without taken date" tab | Tab swap with query modification | Phase 1 |
| Cost filter (free/paid) | `gr-permissions-filter` | ✅ Phase 1 |
| "My uploads" filter | `gr-my-uploads` | Phase 1 |
| Metadata suggestions/autocomplete | `suggest/metadata/{field}` API | Phase 1 |
| Label suggestions | `suggested-labels` API | Phase 3 |
| Collection filter | `~"path"` query syntax | Phase 4 |

### Image Operations
| Feature | kahuna Implementation | Kupua Status |
|---|---|---|
| View image metadata | `gr-image-metadata` | ✅ Phase 1 (columns) |
| Edit metadata (single) | `image-editor.js` + `edits-api` | Phase 4 |
| Edit metadata (batch) | `list-editor.js` + `metadataDiff.js` | Phase 4 |
| Add/remove keywords | `gr-add-keyword` | Phase 4 |
| Add/remove labels | `gr-add-label` | Phase 4 |
| Photoshoot management | `gr-photoshoot` | Phase 4 |
| Archive / un-archive | `gr-archiver` | Phase 4 |
| Delete / un-delete | `gr-delete-image` / `gr-undelete-image` | Phase 4 |
| Download image | `gr-downloader` | Phase 3 |
| Export original | `gr-export-original-image` / `gr-batch-export-original-images` | Phase 5 |
| Share image (clipboard URL) | `ctrl.shareImage()` | Phase 3 |

### Crops
| Feature | kahuna Implementation | Kupua Status |
|---|---|---|
| Create crop | CropperJS + `media-cropper` API | Phase 5 |
| Display crops | `gr-display-crops` | Phase 5 |
| Delete crops | `gr-delete-crops` | Phase 5 |
| Crop presets (portrait, landscape, video, square, freeform) | `cropOptions.js` | Phase 5 |
| Circular mask | `shouldUseCircularMask` | Phase 5 |

### Usage Rights & Leases
| Feature | kahuna Implementation | Kupua Status |
|---|---|---|
| Usage rights editor | `usage-rights-editor.js` | Phase 4 |
| Usage rights categories | `edits-api.getUsageRightsCategories()` | Phase 4 |
| Leases editor | `leases.js` | Phase 4 |
| Cost / validity indicators | `image-logic.js`, `gr-image-cost-message` | Phase 3 |
| Metadata validity | `gr-metadata-validity` | Phase 4 |

### Collections
| Feature | kahuna Implementation | Kupua Status |
|---|---|---|
| Collections tree panel | `gr-collections-panel` | Phase 4 |
| Add/remove from collection | `collections-api.js` | Phase 4 |
| Drag-drop to collection | `addToCollectionUsingImageResources` | Phase 4 |
| Collection path hierarchy | hierarchyAnalyzer in ES | Phase 4 |

### Upload
| Feature | kahuna Implementation | Kupua Status |
|---|---|---|
| Drag-and-drop upload | `dnd-uploader.js` | Phase 5 |
| File picker upload | `file-uploader.js` | Phase 5 |
| Upload job manager | `manager.js` | Phase 5 |
| Upload progress tracking | job status polling | Phase 5 |
| Recent uploads | `recent-uploads.js` | Phase 5 |

### Usages & Syndication
| Feature | kahuna Implementation | Kupua Status |
|---|---|---|
| View usages (digital/print/front/syndication) | `gr-image-usage` | Phase 5 |
| Usage counts per image | `imageUsagesService` | Phase 3 |
| Syndication rights | `gr-syndication-rights` | Phase 5 |
| Syndication icon | `gr-syndication-icon` | Phase 5 |
| Syndicate image | `mediaApi.syndicateImage()` | Phase 5 |

### Embedding & Integration
| Feature | kahuna Implementation | Kupua Status |
|---|---|---|
| iframe embed mode | postMessage crop events | Phase 5 |
| Drag data (grid image, crop, asset handle) | `asImageDragData` / `asCropDragData` filters | Phase 5 |
| VND MIME types | `vndMimeTypes` map | Phase 5 |

### Infrastructure
| Feature | kahuna Implementation | Kupua Status |
|---|---|---|
| Authentication (OIDC / pan-domain) | pandular + auth service | Phase 3 |
| 401 intercept + re-auth | `httpErrorInterceptor` | Phase 3 |
| Sentry error tracking | `@sentry/browser` | Phase 3 |
| Telemetry | `@guardian/user-telemetry-client` | Phase 5 |
| Keyboard shortcuts | `gr-keyboard-shortcut` | ✅ Phase 1 (basic: arrows, pgUp/Down, Home/End), Phase 5 (full) |
| Announcements / notifications | `gr-notifications-banner` | Phase 5 |
| Feature switches | `gr-feature-switch-panel` | Phase 5 |

---

## Data Model Reference

Key fields from the ES mapping (see `kupua/exploration/mapping.json` for full schema):

### Top-Level Image Document
| Field | Type | Description |
|---|---|---|
| `id` | keyword | Unique image identifier |
| `uploadTime` | date | When image was uploaded to Grid |
| `uploadedBy` | keyword | Email of uploader |
| `lastModified` | date | Last modification timestamp |
| `source` | object | Original image asset (file URL, dimensions, mimeType, orientation) |
| `thumbnail` | object | Thumbnail asset |
| `optimisedPng` | object | Optimised PNG asset |
| `metadata` | object | Core metadata (see below) |
| `originalMetadata` | object | Metadata as originally ingested |
| `userMetadata` | object | User-edited metadata, labels, photoshoot, archived state |
| `usageRights` | object | Current usage rights (category, photographer, supplier, etc.) |
| `originalUsageRights` | object | Usage rights as originally ingested |
| `fileMetadata` | dynamic | Raw file metadata (EXIF, IPTC, XMP, ICC, Getty, etc.) |
| `exports` | object | Crops (master + assets with dimensions) |
| `usages` | nested | Usage records (digital, print, front, syndication, download) |
| `leases` | object | Access leases (allow/deny with dates) |
| `collections` | object | Collection memberships (path, pathHierarchy) |
| `identifiers` | dynamic | External identifiers (picdarurn, original-media-id, etc.) |
| `syndicationRights` | object | Syndication rights and supplier info |
| `embedding` | object | ML embeddings (Cohere English v3, 1024-dim cosine vectors) |
| `uploadInfo` | object | Original filename |
| `suggestMetadataCredit` | completion | Autocomplete suggester for credit field |

### Metadata Object
| Field | Type | Analyzer | Description |
|---|---|---|---|
| `title` | text | english_s_stemmer | Image title |
| `description` | text | english_s_stemmer | Image description/caption |
| `byline` | text | standard | Photographer / creator name |
| `credit` | keyword | — | Credit line |
| `source` | keyword | — | Image source/agency |
| `copyright` | text | standard | Copyright notice |
| `keywords` | keyword | — | Array of keywords |
| `dateTaken` | date | — | When the photo was taken |
| `city`, `state`, `country`, `subLocation` | text | standard | Location fields |
| `peopleInImage` | text | standard | People identified in the image |
| `specialInstructions` | text | standard | Usage instructions |
| `subjects` | keyword | — | Subject codes |
| `suppliersReference` | text | standard | Supplier's reference number |
| `imageType` | keyword | — | Photo / Illustration |
| `englishAnalysedCatchAll` | text | english_s_stemmer | Copy-to catch-all field for broad search |
| `domainMetadata` | dynamic | — | Custom domain-specific metadata |

### Usage Rights Object
| Field | Type | Description |
|---|---|---|
| `category` | keyword | Rights category (staff-photographer, agency, etc.) |
| `photographer` | text | Photographer name |
| `supplier` | keyword | Supplier code |
| `suppliersCollection` | keyword | Supplier's collection name |
| `publication` | keyword | Publication name |
| `restrictions` | text | Usage restrictions text |

---

## Notes

- **Sample data location:** `kupua/exploration/sample-data.ndjson` (115MB, from CODE ES). Also backed up to `s3://<sample-data-backup-bucket>/sample-data.ndjson`.
- **Mapping location:** `kupua/exploration/mapping.json` (from CODE ES index `<es-index-name>`).
- **The `.ndjson` file should NOT be committed to git** — it's too large. Add to `.gitignore` and keep it local or in S3.
- **ES version:** Grid uses Elasticsearch 8.18.3 (docker-compose) — kupua should target the same.
- **kahuna source:** `/kahuna/public/js/` — AngularJS 1.8, RxJS 2, Immutable.js, webpack. Key files: `main.js`, `search/results.js`, `search/index.js`, `image/controller.js`, `services/api/media-api.js`.

