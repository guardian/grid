# Kupua Capabilities Report

**Date:** 2 April 2026
**Scope:** Everything inside `/kupua/src/` — the current state of the Kupua application.
**Purpose:** Inform Kupua developers of exactly what has been implemented so far in the Kahuna → Kupua migration.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Routing & URL Schema](#3-routing--url-schema)
4. [Data Layer (DAL)](#4-data-layer-dal)
5. [State Management (Stores)](#5-state-management-stores)
6. [Search Capabilities](#6-search-capabilities)
7. [View Modes](#7-view-modes)
8. [Image Detail View](#8-image-detail-view)
9. [Metadata Display](#9-metadata-display)
10. [Panels (Left & Right)](#10-panels-left--right)
11. [Facet Filters](#11-facet-filters)
12. [Scrubber / Position Indicator](#12-scrubber--position-indicator)
13. [Keyboard Shortcuts & Navigation](#13-keyboard-shortcuts--navigation)
14. [Click-to-Search Interactions](#14-click-to-search-interactions)
15. [Date Filtering](#15-date-filtering)
16. [Sort System](#16-sort-system)
17. [Column Management (Table View)](#17-column-management-table-view)
18. [Image URL / Thumbnail System](#18-image-url--thumbnail-system)
19. [CQL Search Input](#19-cql-search-input)
20. [Typeahead / Auto-complete](#20-typeahead--auto-complete)
21. [Field Registry](#21-field-registry)
22. [Performance Optimisations](#22-performance-optimisations)
23. [Error Handling](#23-error-handling)
24. [Persistence (localStorage / sessionStorage)](#24-persistence-localstorage--sessionstorage)
25. [Accessibility (ARIA)](#25-accessibility-aria)
26. [Styling & Theming](#26-styling--theming)
27. [Testing Infrastructure](#27-testing-infrastructure)
28. [Exhaustive Interaction Inventory](#28-exhaustive-interaction-inventory)
29. [What Is NOT Implemented (Known Gaps)](#29-what-is-not-implemented-known-gaps)

---

## 1. Architecture Overview

Kupua is a **React 19 SPA** built with Vite, using TanStack Router for routing, Zustand for state, and direct Elasticsearch queries via a Vite dev-server proxy. It is a **read-only** image search and browsing frontend. There is **no authentication**, **no write operations**, and **no connection to the Grid media-api**.

**High-level component tree:**

```
main.tsx → RouterProvider
  └─ __root.tsx (ErrorBoundary + Outlet)
       └─ search.tsx (SearchPage)
            ├─ SearchBar (logo, CQL input, SearchFilters, Sort)
            ├─ StatusBar (result count, new-images ticker, density toggle, panel toggles)
            └─ PanelLayout
                 ├─ Left Panel (FacetFilters inside AccordionSection)
                 ├─ Main Content (ImageGrid OR ImageTable)
                 ├─ Scrubber (vertical position indicator)
                 └─ Right Panel (FocusedImageMetadata inside AccordionSection)
            └─ ImageDetail (overlay when ?image=xxx present)
```

---

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| UI Framework | React | 19.1 |
| Router | @tanstack/react-router | 1.168+ |
| Table | @tanstack/react-table | 8.21+ |
| Virtualisation | @tanstack/react-virtual | 3.13+ |
| State | Zustand | 5.0+ |
| Validation | Zod | 4.3+ |
| CQL Parsing | @guardian/cql | 1.8+ |
| Dates | date-fns | 4.1+ |
| Styling | Tailwind CSS 4 | 4.1+ |
| Build | Vite | 8.0+ |
| Testing (unit) | Vitest | 4.1+ |
| Testing (e2e) | Playwright | 1.58+ |
| Language | TypeScript | 5.8+ |

---

## 3. Routing & URL Schema

| Route | Purpose |
|---|---|
| `/` | Redirects to `/search?nonFree=true` |
| `/search?...` | Main search page (all interactions happen here) |
| `/images/:imageId` | Redirects to `/search?nonFree=true&image=:imageId` |

### URL Search Parameters (Zod-validated)

| Param | Type | Purpose |
|---|---|---|
| `query` | string? | CQL query text |
| `ids` | string? | Comma-separated image IDs |
| `since` / `until` | string? | Upload time date range (ISO) |
| `nonFree` | string? | "true" = include paid images |
| `payType` | string? | Pay type filter |
| `uploadedBy` | string? | Filter by uploader email |
| `orderBy` | string? | Sort order (e.g. `-uploadTime`, `credit,-uploadTime`) |
| `useAISearch` | string? | Enable semantic search |
| `dateField` | string? | Which date field for range ("taken", "modified") |
| `takenSince` / `takenUntil` | string? | Date taken range |
| `modifiedSince` / `modifiedUntil` | string? | Last modified range |
| `hasRightsAcquired` | string? | Syndication rights filter |
| `hasCrops` | string? | Has crops/exports filter |
| `syndicationStatus` | string? | Syndication status filter |
| `persisted` | string? | Is persisted filter |
| `image` | string? | **Display-only** — opens image detail overlay |
| `density` | "table"/"grid"? | **Display-only** — view mode (grid default) |

Custom URL serialisation: plain `key=value` style (not JSON-encoded), colons kept readable, `%20` for spaces.

---

## 4. Data Layer (DAL)

### Interface: `ImageDataSource`

The DAL is an abstract interface (`dal/types.ts`) with a single concrete implementation: `ElasticsearchDataSource` (`dal/es-adapter.ts`).

**Capabilities implemented:**

| Method | Description |
|---|---|
| `search(params)` | Full-text search with filters, pagination, sorting. Cancels in-flight requests. |
| `searchRange(params, signal?)` | Non-cancelling search (for parallel range loads). |
| `count(params)` | Lightweight count (no hits returned). |
| `getById(id)` | Fetch single image by ES document ID. |
| `getAggregation(field, query?, size?)` | Single-field terms aggregation. |
| `getAggregations(params, fields[], signal?)` | Batched multi-field aggregations in one ES request. |
| `openPit(keepAlive?)` | Open Point In Time for consistent pagination. |
| `closePit(pitId)` | Close a PIT. |
| `searchAfter(params, cursor, pitId?, signal?, reverse?, noSource?, missingFirst?)` | Cursor-based pagination via `search_after`. |
| `countBefore(params, sortValues, sortClause, signal?)` | Count docs before a sort position (for offset calculation). |
| `estimateSortValue(params, field, percentile, signal?)` | Percentile-based sort value estimation (for deep seek). |
| `findKeywordSortValue(params, field, targetPosition, direction, signal?)` | Composite-agg walk to find keyword at position (deep keyword seek). |
| `getKeywordDistribution(params, field, direction, signal?)` | Full keyword value distribution (scrubber labels). |
| `getDateDistribution(params, field, direction, signal?)` | Date histogram distribution (scrubber labels). |

### CQL → Elasticsearch Translation

`lib/cql.ts` fully implements CQL parsing and ES query building:
- Free-text queries → `multi_match` (cross_fields or phrase)
- Field queries (e.g. `credit:"Getty"`) → `match` / `match_phrase` / `term`
- Negation (`-credit:Getty`) → `must_not`
- Special fields: `has:`, `is:`, `collection:`, `fileType:`
- Field aliases: `by` → `metadata.byline`, `keyword` → `metadata.keywords`, `person` → `metadata.peopleInImage`, etc.
- CQL shortcuts: `#` → `label`, `~` → `collection`
- Config-driven aliases from `grid-config.ts` (editStatus, colourProfile, colourModel, cutout, etc.)
- `is:GNM-owned`, `is:GNM-owned-photo`, `is:GNM-owned-illustration`, `is:deleted`

### ES Connection

- Proxied through Vite dev server (`/es` → configurable target, default `localhost:9220`)
- S3 proxy for thumbnails (`/s3` → `localhost:3001`)
- imgproxy for full-size images (`/imgproxy` → `localhost:3002`)
- Write protection on non-local ES (allowed paths: `_search`, `_count`, `_cat/aliases`, `_pit`)
- Heavy `_source` fields excluded (EXIF, XMP, embeddings, Getty metadata)

---

## 5. State Management (Stores)

### Search Store (`stores/search-store.ts`) — Zustand

The central store managing the windowed buffer architecture:

| State | Description |
|---|---|
| `params` | Current search parameters |
| `results` | Windowed buffer of loaded images (max 1000) |
| `bufferOffset` | Global position of buffer[0] |
| `total` | Total matching images in ES |
| `loading` | Whether a search/seek is in flight |
| `error` | Last error message |
| `took` / `seekTime` | ES query timing |
| `focusedImageId` | Currently focused image (single) |
| `imagePositions` | Map: imageId → global index (O(1) lookup) |
| `newCount` / `newCountSince` | New images since last search (polled every 10s) |
| `aggregations` | Cached facet aggregation results |
| `expandedAggs` | Per-field expanded aggregation results (show more) |
| `sortDistribution` | Pre-fetched sort value distribution (scrubber labels) |
| `sortAroundFocusGeneration` | Generation counter for sort-around-focus |
| `sortAroundFocusStatus` | Brief status text for sort-around-focus |

**Key actions:**

| Action | Description |
|---|---|
| `search(sortAroundFocusId?)` | Execute search, reset buffer. Optional sort-around-focus. |
| `extendForward()` | Append PAGE_SIZE images via `search_after`. |
| `extendBackward()` | Prepend PAGE_SIZE images via reversed `search_after`. |
| `seek(globalOffset)` | Jump to arbitrary position (from/size ≤100k, deep seek >10k). |
| `loadMore()` | Alias for `extendForward`. |
| `setParams(partial)` | Update search params. |
| `setFocusedImageId(id)` | Set/clear focus. |
| `fetchAggregations(force?)` | Fetch facet aggregation data (with circuit breaker). |
| `fetchExpandedAgg(field)` | Fetch all values for one field (show more). |
| `collapseExpandedAgg(field)` | Revert to initial 10 buckets. |
| `fetchSortDistribution()` | Lazy-fetch keyword or date distribution for scrubber. |
| `restoreAroundCursor(imageId, cursor, offset)` | Restore search context from cached cursor (page reload). |
| `abortExtends()` | Cancel in-flight extends with 2s cooldown. |

**Buffer architecture:**
- Fixed capacity: 1000 images
- Page size: 200 images per extend
- Scroll mode: total ≤ 1000 → eagerly loads all results
- Seek mode: total > 1000 → windowed buffer with scrubber seeking
- Deep seek: offset > 10,000 → percentile estimation + search_after
- PIT (Point In Time) for consistent pagination on non-local ES
- New-images polling every 10 seconds

### Panel Store (`stores/panel-store.ts`) — Zustand + localStorage

| State | Description |
|---|---|
| `config.left.visible` / `config.left.width` | Left panel visibility and width |
| `config.right.visible` / `config.right.width` | Right panel visibility and width |
| `config.sections` | Per-section open/closed state |

- Defaults: both panels hidden, left=280px, right=320px
- Min width: 200px, max: 50% of viewport
- Accordion sections: "left-filters" (collapsed by default), "right-metadata" (expanded)

### Column Store (`stores/column-store.ts`) — Zustand + localStorage

| State | Description |
|---|---|
| `config.hidden` | Array of hidden column IDs |
| `config.widths` | Persisted column widths (ID → px) |
| `config.preDoubleClickWidths` | Session-only pre-auto-fit widths |

---

## 6. Search Capabilities

### What can be searched

| Capability | Implemented |
|---|---|
| Free-text search (all fields) | ✅ |
| CQL field queries (`credit:Getty`, `by:Smith`) | ✅ |
| Negation (`-credit:Getty`) | ✅ |
| Quoted phrase search (`"exact phrase"`) | ✅ |
| CQL shortcuts (`#labelName`, `~collectionName`) | ✅ |
| Multiple field terms (AND logic) | ✅ |
| `is:` queries (GNM-owned, deleted, etc.) | ✅ |
| `has:` queries (exists check) | ✅ |
| `fileType:` with MIME translation | ✅ |
| `in:` location multi-field search | ✅ |
| Config-driven alias fields | ✅ |
| Free-to-use only toggle | ✅ |
| Date range filtering (upload/taken/modified) | ✅ |
| Date presets (Today, Past 24h, Past week, 6 months, year) | ✅ |
| Custom date range (From/To date inputs) | ✅ |
| Sort by multiple fields (primary + secondary) | ✅ |
| New images ticker (10s polling, click to refresh) | ✅ |

### Debouncing

- CQL search input is debounced at 300ms
- External query updates (cell clicks) cancel pending debounce

---

## 7. View Modes

### Grid View (`ImageGrid.tsx`) — Default

| Feature | Description |
|---|---|
| Layout | Responsive grid of equal-size cells |
| Column count | Dynamic — `floor(containerWidth / 280px)` via ResizeObserver |
| Cell content | S3 thumbnail (190px) + description (1 line, truncated) + upload date |
| Virtualisation | Row-based (TanStack Virtual) — each virtual row = N cells |
| Focus | Click = focus (blue ring), Double-click = open image detail |
| Scroll anchoring | Column count changes re-anchor scroll to focused/centre image |
| Placeholders | Skeleton cells for unloaded items |

### Table View (`ImageTable.tsx`)

| Feature | Description |
|---|---|
| Layout | Data table with sticky header, column resize, virtualised rows |
| Columns | Dynamic from field registry + optional thumbnail column |
| Column resize | Drag handles with auto-scroll at edges, CSS-variable width injection |
| Column visibility | Right-click context menu with checkboxes per column |
| Auto-fit | Double-click header = fit to data; second double-click = restore |
| Resize all | "Resize all columns to fit data" from context menu |
| Sort indicators | Primary (↑/↓), secondary (↑↑/↓↓) in headers, accent-coloured |
| Horizontal scroll | Native horizontal scrollbar (proxy div), hidden vertical scrollbar |
| Cell content | Varies by field type — text, pills (keywords/subjects/people), composite (location), formatted dates/dimensions |
| Focus | Click = focus (ring highlight), Double-click = open image detail |
| Loading indicator | Sticky bottom bar: "Loading more…" |

### Density Toggle

- Button in StatusBar with grid/table icons
- Persists in URL (`?density=table`)
- Switching preserves: focused image, scroll position (viewport ratio), search state

---

## 8. Image Detail View

`ImageDetail.tsx` — rendered as an overlay within the search route.

| Feature | Description |
|---|---|
| Overlay model | Search page stays mounted (hidden via `opacity:0` + `pointer-events:none`) |
| Image display | Full-size via imgproxy (screen-sized, DPR-aware, capped at native resolution) → fallback to thumbnail → fallback to text |
| Image formats | AVIF output, EXIF rotation correction, WebP/JXL options |
| Prev/Next navigation | Arrow buttons (hover-reveal) + keyboard ←/→, `replace: true` history |
| Back to search | "← Back to search" button (strips `image` param, `replace: true`) |
| Position counter | "X of Y" in top bar |
| Fullscreen | `f` key toggles, survives between image navigations (stable DOM ref) |
| Metadata sidebar | 272px right sidebar with full `ImageMetadata` component |
| Standalone fetch | Direct ES `getById` when image not in search results |
| Cursor restore | On page reload, uses cached sort cursor for exact repositioning |
| Prefetch pipeline | Direction-aware: 4 ahead + 1 behind, throttled at 150ms |
| Image load failure | Graceful fallback: imgproxy → thumbnail → text message |
| Loading delay | 500ms delay before showing "Loading image…" spinner |
| Not found | "Image not found" message with back link |

### Navigation Keyboard Shortcuts (Image Detail)

| Key | Action |
|---|---|
| `←` / `→` | Previous / Next image |
| `Backspace` | Close detail (back to search) |
| `f` | Toggle fullscreen |
| `Escape` | Exit fullscreen (native browser) |

---

## 9. Metadata Display

`ImageMetadata.tsx` — shared between image detail sidebar and right panel.

**Driven entirely by the field registry (`DETAIL_PANEL_FIELDS`).** Fields are grouped into sections with dividers.

### Displayed Fields (in order)

| Section | Fields | Layout |
|---|---|---|
| Core | Description, Title, Special Instructions | Stacked (label above) |
| Core | By (byline), Credit, Source | Inline (30% / 70%) |
| Core | Keywords, Subjects, People | Pills (clickable) |
| Location | Location (composite: subLocation, city, state, country) | Inline, each part clickable |
| Dates | Uploaded, Taken, Last Modified | Inline |
| Technical | Dimensions, File Type, Filename | Inline |
| Rights | Usage Rights Category, Supplier, Suppliers Collection | Inline |
| Technical | Image ID | Inline, monospace, select-all |
| Alias fields | Edit Status, Colour Profile, Colour Model, Cutout, Bits Per Sample, Digital Source Type, Scene Code | Inline |

### Interactions on Metadata Values

| Interaction | Behaviour |
|---|---|
| Click | Replace query with `field:value`, navigate to search |
| Shift+click | Append `+field:value` to query (AND) |
| Alt/⌥+click | Append `-field:value` to query (exclude) |
| Click on list pills | Same modifier pattern |
| Click on location parts | Each sub-field (city, country, etc.) is individually clickable |
| Image ID | Select-all, monospace — no click-to-search |

---

## 10. Panels (Left & Right)

`PanelLayout.tsx` — flex row layout with resizable side panels.

| Feature | Description |
|---|---|
| Toggle buttons | In StatusBar — "Browse" (left), "Details" (right) |
| Resize handles | Drag divider between panel and content, CSS-only during drag |
| Double-click divider | Closes the panel |
| Keyboard shortcuts | `[` = toggle left, `]` = toggle right (Alt+[ / Alt+] in text fields) |
| Accordion sections | Collapsible within each panel (chevron toggle) |
| Width persistence | localStorage (survives reload) |
| Width constraints | Min 200px, max 50% viewport |
| Prefetch on hover | Hovering "Browse" button prefetches aggregations (if Filters section is expanded in localStorage) |

---

## 11. Facet Filters

`FacetFilters.tsx` — left panel content.

| Feature | Description |
|---|---|
| Source | Aggregatable fields from field registry |
| Display | Value + count pairs, stacked per field section |
| Count format | Compact (e.g. "12.3k", "1.2M") |
| Lazy loading | Only fetched when Filters section is expanded |
| Re-fetch | On search param changes (proxied by `total` / `currentQuery`) |
| Circuit breaker | Shows "Refresh (slow)" link if aggregation times out |
| Timing | Shows ms in section header |
| Show more | Fetches all values for a field (expanded aggregation) |
| Show fewer | Collapses back to 10 buckets, scroll-anchors to field header |
| Click | Toggle filter chip on/off (same polarity = remove) |
| Alt+click | Exclude (negative filter) |
| Active state | Blue highlight for included, red/strikethrough for excluded |
| Scroll anchoring | Preserves clicked button's viewport position across re-renders |

---

## 12. Scrubber / Position Indicator

`Scrubber.tsx` — vertical position control on the right edge.

| Feature | Description |
|---|---|
| Visual | Narrow pill thumb in a 14px-wide transparent track |
| Thumb sizing | Proportional to visible/total ratio (min 20px) |
| Colours | Idle: white/25%, Hover: white/45%, Active: white/60% |
| Scroll mode | total ≤ buffer capacity → drag directly scrolls content |
| Seek mode | total > buffer → click/drag sets position, single seek on pointer-up |
| Tooltip | Shows position "X of Y" + sort context label |
| Tooltip triggers | Hover-preview (follows cursor), drag, click (1.5s flash) |
| Sort context labels | Date sorts: formatted date from histogram. Keyword sorts: field value from distribution. |
| Track ticks | Horizontal lines at date boundaries (month/year), labels on hover |
| Tick hierarchy | Major (decade/year boundaries) + minor (month), isolation-based promotion |
| Wheel forwarding | Scroll events on scrubber forwarded to content container |
| ARIA | `role="slider"`, `aria-valuemin/max/now/text`, vertical orientation |

---

## 13. Keyboard Shortcuts & Navigation

### Global Shortcut System (`lib/keyboard-shortcuts.ts`)

- Single `keydown` listener on `document` (capture phase)
- Stack semantics: most recently registered handler wins
- Bare key when not in editable field; Alt+key when in editable field
- `Cmd/Ctrl` combos never intercepted (browser/OS shortcuts)
- Alt dead-character mapping (e.g. `code: BracketLeft` → `[`)

### Registered Shortcuts

| Key | Context | Action |
|---|---|---|
| `[` | Search page | Toggle left panel |
| `]` | Search page | Toggle right panel |
| `f` | Image detail | Toggle fullscreen |

### List Navigation (`useListNavigation` hook)

| Key | Action (Grid) | Action (Table) |
|---|---|---|
| `↑` / `↓` | Move focus by N columns (row) | Move focus by 1 row |
| `←` / `→` | Move focus by 1 cell | No effect |
| `PageUp` / `PageDown` | Scroll by page, focus edge row | Same |
| `Home` | Scroll to top, focus first image (seek to 0 if windowed) | Same + reset horizontal scroll |
| `End` | Scroll to bottom, focus last image (seek to end if windowed) | Same |
| `Enter` | Open focused image in detail view | Same |

### Image Detail Navigation

| Key | Action |
|---|---|
| `←` / `→` | Previous / Next image |
| `Backspace` | Close detail overlay |
| `f` / `Alt+f` | Toggle fullscreen |
| `Escape` | Exit fullscreen (browser-native) |

### CQL Input Behaviour

- `Escape` blurs the search box (unless typeahead popup is visible)
- Arrow keys propagate through to list navigation
- Other keyboard events stopped from propagating

---

## 14. Click-to-Search Interactions

### Table Cell Clicks

| Modifier | Behaviour |
|---|---|
| Shift+click | Add `+field:value` to CQL query (AND) |
| Alt/⌥+click | Add `-field:value` to CQL query (exclude) |
| Plain click | No search action (just focus the row) |

Supported on: all columns with CQL keys (credit, byline, source, etc.), list fields (keywords, subjects, people with per-pill clicking), composite fields (location with per-sub-field clicking).

CQL manipulation uses AST-based parsing (`cql-query-edit.ts`) — no string `.includes()` matching.

### Metadata Panel Clicks

| Modifier | Behaviour |
|---|---|
| Click | Replace entire query with `field:value` |
| Shift+click | Append `+field:value` |
| Alt/⌥+click | Append `-field:value` |

### Facet Filter Clicks

| Modifier | Behaviour |
|---|---|
| Click | Toggle chip (add if absent, remove if same polarity present) |
| Alt/⌥+click | Exclude (negative filter — add `-field:value`) |

---

## 15. Date Filtering

`DateFilter.tsx` — dropdown in the toolbar.

| Feature | Description |
|---|---|
| Field selector | Upload time (default), Date taken, Last modified |
| Presets | Anytime, Today, Past 24 hours, Past week, Past 6 months, Past year |
| Custom range | Two `<input type="date">` (From / To) with clear buttons |
| Apply model | Draft state — only committed on "Filter" click (or preset auto-applies) |
| Cancel | Reverts draft to URL state |
| Escape / outside click | Same as cancel |
| Active indicator | Blue dot on the collapsed button |
| Button label | "Anytime" or "Field: from DATE — to DATE" summary |

---

## 16. Sort System

### Sort Controls

| Location | Interaction |
|---|---|
| Toolbar dropdown | Select field, toggle direction ↑/↓ |
| Table header click | Primary sort (click), secondary sort (Shift+click) |
| Table header double-click | Auto-fit column (not sort) — sort delayed 250ms |
| Direction toggle | Click same field to flip asc/desc |

### Sortable Fields (from field registry)

| Label | Sort key | Default direction |
|---|---|---|
| Uploaded | `uploadTime` | Descending (newest first) |
| Taken | `taken` | Descending |
| Last Modified | `lastModified` | Descending |
| Credit | `credit` | Ascending (A→Z) |
| Byline | `byline` | Ascending |
| Source | `source` | Ascending |
| File Type | `mimeType` | Ascending |
| Title | `title` | Ascending |
| Width | `width` | Descending (largest first) |
| Height | `height` | Descending |
| File Size | `fileSize` | Descending |

### Secondary Sort

- `Shift+click` on a column header adds/toggles secondary sort
- URL format: `orderBy=credit,-uploadTime` (comma-separated)
- Visual indicator: `↑↑` / `↓↓` with 65% opacity accent colour

### Sort-Around-Focus ("Never Lost")

When only the sort order changes (no query/filter change):
1. Captures focused image's viewport ratio before sort
2. Fires search with `sortAroundFocusId` → ES countBefore determines new position
3. Restores focused image at same viewport position after sort completes
4. Brief status indicator in StatusBar ("Repositioning…")

### Auto-reveal

If sorting by a hidden column, that column is automatically made visible.

---

## 17. Column Management (Table View)

### Column Definitions

All columns are generated from the **field registry** (`FIELD_REGISTRY`). No hardcoded column definitions.

### Column Visibility

- Right-click any header → context menu with checkboxes
- Toggle columns on/off
- Persisted in localStorage (`kupua-column-config`)
- Default hidden: configurable per field (`defaultHidden: true` in registry)

### Column Resizing

| Feature | Description |
|---|---|
| Drag handle | 1px wide, right edge of each header cell |
| CSS-variable technique | One `<style>` tag sets `--col-<id>` for all columns — body never re-renders during drag |
| Auto-scroll | When dragging near edges of scroll container, auto-scrolls horizontally |
| Pointer capture | Keeps events flowing even outside the window |
| Persistence | Final widths saved to localStorage on drag end |

### Auto-fit

| Trigger | Behaviour |
|---|---|
| Double-click header | Fit column to visible data (or restore if already fitted) |
| Context menu → "Resize column to fit data" | Fit single column |
| Context menu → "Resize all columns to fit data" | Fit all visible columns |

Fit calculation: measures text width with Canvas API (header font + cell font), accounts for padding, pill layout.

---

## 18. Image URL / Thumbnail System

`lib/image-urls.ts`

| Feature | Status |
|---|---|
| Thumbnails via S3 proxy | ✅ (TEST mode only — `/s3/thumb/<imageId>`) |
| Full-size via imgproxy | ✅ (TEST mode only) |
| AVIF output format | ✅ (default) |
| WebP/JXL support | ✅ (configurable) |
| DPR detection | ✅ (2-tier: 1× or 1.5×) |
| EXIF rotation correction | ✅ (explicit `rotate:N` from orientation metadata) |
| Native resolution cap | ✅ (never upscales) |
| Screen-sized requests | ✅ (survives windowed ↔ fullscreen without re-request) |
| Fallback chain | imgproxy → thumbnail → text placeholder |
| No thumbnails (local mode) | Graceful — "No thumbnail" text |

---

## 19. CQL Search Input

`CqlSearchInput.tsx` — wraps `@guardian/cql`'s `<cql-input>` Web Component.

| Feature | Description |
|---|---|
| Chip rendering | Automatic from CQL library — field:value chips |
| Keyboard navigation | Within chips (CQL library) |
| Typeahead popover | Auto-complete for field keys and values |
| Dark theme | Custom theme matching Grid's palette |
| Parser settings | `operators: false`, `groups: false`, shortcuts: `#`→label, `~`→collection |
| Placeholder | "Search for images… (type + for advanced search)" |
| Clear button | ✕ appears when content is present |
| Autofocus | On mount |
| Escape handling | Blurs search box (unless typeahead popup is visible) |
| Key propagation | Arrow/Page keys propagate for list navigation; other keys stopped |
| Debounce | 300ms before URL update |
| External update | `cancelSearchDebounce()` + generation counter forces remount |

---

## 20. Typeahead / Auto-complete

`lib/typeahead-fields.ts` + `lib/lazy-typeahead.ts`

### Dynamic Resolvers (hit ES via `getAggregation`)

| Field | ES Path |
|---|---|
| `category` | `usageRights.category` |
| `credit` | `metadata.credit` |
| `label` | `userMetadata.labels` |
| `photoshoot` | `userMetadata.photoshoot.title` |
| `source` | `metadata.source` |
| `supplier` | `usageRights.supplier` |
| `uploader` | `uploadedBy` |
| `croppedBy` | `exports.author` |
| `keyword` | `metadata.keywords` |

### Static Resolvers

| Field | Values |
|---|---|
| `fileType` | jpeg, tiff, png |
| `is` | GNM-owned-photo, GNM-owned-illustration, GNM-owned, under-quota, deleted, agency-pick |
| `subject` | arts, crime, disaster, finance, education, … (19 values) |
| `usages@status` | published, pending, removed |
| `usages@platform` | print, digital, download |
| `cutout` (config alias) | false, true |

### Fields Without Value Suggestions (text-analysed)

`by`, `city`, `copyright`, `country`, `description`, `illustrator`, `location`, `person`, `specialInstructions`, `state`, `suppliersReference`, `title`, `date`, `dateTaken`, `has`, `in`, `filename`, `leasedBy`

### Lazy Evaluation

`LazyTypeahead` class decouples key suggestions (instant) from value resolution (async). Value resolvers only fire after the user types `:`.

---

## 21. Field Registry

`lib/field-registry.ts` — single source of truth for all image fields.

Each field definition includes:
- `id`, `label`, `group`
- `accessor` (extract display value from Image)
- `rawValue` (extract search-friendly value)
- `cqlKey` (for click-to-search)
- `esSearchPath` (for aggregations)
- `sortKey` + `descByDefault` (for sorting)
- `defaultWidth`, `defaultHidden` (for table columns)
- `formatter` (e.g. MIME → short name, ISO → formatted date)
- `fieldType` (keyword, text, date, integer, composite, list)
- `isList`, `isComposite` (for rendering)
- `aggregatable` (for facet filters)
- `detailLayout` (stacked vs inline for metadata panel)
- `detailGroup` (grouping override for metadata panel)
- `detailClickable` (whether values are click-to-search in panel)
- `cellRenderer` (custom React renderer for table cells)

Config-driven alias fields from `grid-config.ts` are merged into the registry.

**Derived exports:**
- `FIELD_REGISTRY` — full ordered list
- `FIELDS_BY_ID` — Map for O(1) lookup
- `COLUMN_CQL_KEYS` — column ID → CQL key mapping
- `SORTABLE_FIELDS` — column ID → sort key mapping
- `DESC_BY_DEFAULT` — Set of fields that sort descending by default
- `SORT_DROPDOWN_OPTIONS` — for toolbar dropdown
- `DEFAULT_HIDDEN_COLUMNS` — for column store initialisation
- `DETAIL_PANEL_FIELDS` — ordered list for metadata panel
- `getFieldRawValue(columnId, image)` — get tooltip/search value

---

## 22. Performance Optimisations

| Optimisation | Location | Description |
|---|---|---|
| Virtualisation | ImageGrid, ImageTable | TanStack Virtual — only DOM nodes for visible + overscan rows |
| Memoised table body | ImageTable | `React.memo` TableBody — zero re-renders during column resize drag |
| CSS-variable column widths | ImageTable | One `<style>` tag updates all widths — no React re-render per column |
| Visible-image windowing | ImageTable | Only visible images fed to TanStack Table (not all loaded) |
| O(1) visible-image sentinel | ImageTable | First/last/count comparison instead of `ids.join(",")` |
| Column index array memo | ImageGrid | Avoids 5,400 short-lived arrays/second from `Array.from` |
| Canvas text measurement cache | ImageTable | Reuses `CanvasRenderingContext2D`, caches font assignment |
| Contain: strict | CSS | On scroll containers — Firefox scroll performance |
| Scheduler.yield() | es-adapter | Yields after JSON.parse to break long animation frames |
| Prefetch pipeline | ImageDetail | Direction-aware, 4 ahead + 1 behind, 150ms throttle |
| Ref-stabilisation | Multiple hooks | Avoids tearing down/re-registering event listeners on every render |
| Stable visible-range store | useDataWindow | Module-level `useSyncExternalStore` — no React state for scroll position |
| ResizeObserver (not scroll) | useHeaderHeight, ImageGrid | Zero cost on scroll path |

---

## 23. Error Handling

| Feature | Location |
|---|---|
| React Error Boundary | `ErrorBoundary.tsx` — wraps `<Outlet />` in root route |
| Recovery UI | "Something went wrong" + "Try again" / "Reset app" buttons |
| Error details | Expandable stack trace |
| Image load fallback | imgproxy → thumbnail → text placeholder |
| Standalone fetch failure | "Image not found" message |
| ES error | Stored in `error` state, no dedicated UI (console) |
| Circuit breaker | Aggregation timing — shows "Refresh (slow)" if agg times out |

---

## 24. Persistence (localStorage / sessionStorage)

| Store | Key | Data |
|---|---|---|
| Panel config | `kupua-panel-config` | Panel visibility, widths, section open/closed |
| Column config | `kupua-column-config` | Hidden columns, column widths |
| Image offset cache | `kupua:imgOffset:<imageId>` (sessionStorage) | Last position + sort cursor per image (for page reload restore) |

---

## 25. Accessibility (ARIA)

| Element | ARIA |
|---|---|
| Search toolbar | `role="toolbar"`, `aria-label="Search and filter controls"` |
| Search input | `role="search"` wrapper |
| Results count | `role="status"`, `aria-live="polite"`, `aria-atomic="true"` |
| Table grid | `role="grid"`, `aria-label="Image search results"`, `aria-rowcount` |
| Table header | `role="row"` + `role="columnheader"` + `aria-sort` |
| Table rows | `role="row"`, `aria-rowindex`, `aria-selected` |
| Table cells | `role="gridcell"` |
| Grid view | `role="region"`, `aria-label="Image results grid"` |
| Scrubber | `role="slider"`, `aria-valuemin/max/now/text`, `aria-orientation="vertical"` |
| Panel toggles | `aria-pressed`, `aria-label` |
| Accordion sections | `aria-expanded`, `aria-controls` |
| Column menu | `role="menu"`, `role="menuitem"`, `role="menuitemcheckbox"`, `aria-checked` |
| Sort dropdown | `role="listbox"`, `role="option"`, `aria-selected`, `aria-haspopup` |
| Resize handles | `role="separator"`, `aria-orientation="vertical"`, `aria-label` |
| Image detail prev/next | `aria-label="Previous/Next image"` |

---

## 26. Styling & Theming

- **Tailwind CSS 4** with custom theme tokens from Kahuna's colour palette
- **Open Sans** font — self-hosted, all weights/styles from Kahuna
- Dark colour scheme (`color-scheme: dark`, dark scrollbars)
- Custom Tailwind `@theme` tokens: `grid-bg`, `grid-cell`, `grid-text`, `grid-accent`, `grid-error`, `grid-warning`, `grid-success`, etc.
- Shared CSS component classes: `.popup-menu`, `.popup-item`, `.hide-scrollbar`, `.hide-scrollbar-y`
- Custom font sizes: `text-xs` = 13px, `text-2xs` = 12px

---

## 27. Testing Infrastructure

### Unit Tests (Vitest)

| File | Tests |
|---|---|
| `ErrorBoundary.test.tsx` | Error boundary rendering |
| `cql-query-edit.test.ts` | CQL AST manipulation |
| `field-registry.test.ts` | Field registry consistency |
| `image-offset-cache.test.ts` | Session storage caching |
| `es-adapter.test.ts` | ES adapter |
| `search-store.test.ts` + `search-store-extended.test.ts` | Store logic |

### E2E Tests (Playwright)

| File | Tests |
|---|---|
| `buffer-corruption.spec.ts` | Buffer integrity during scroll |
| `scrubber.spec.ts` | Scrubber interactions |
| `manual-smoke-test.spec.ts` | Manual smoke test script |

---

## 28. Exhaustive Interaction Inventory

Every user interaction currently available in Kupua:

### Logo
1. **Click logo** → Reset all filters, clear query, scroll to top, focus search box, fresh search

### Search Box
2. **Type in CQL input** → Debounced (300ms) query update → new search
3. **Type `+` or `-`** → Opens CQL field key typeahead
4. **Type `field:`** → Opens CQL value typeahead (dynamic or static)
5. **Select typeahead suggestion** → Inserts chip
6. **Click ✕ button** → Clear query
7. **Press Escape** → Blur search box (if typeahead not visible)

### Free-to-Use Toggle
8. **Toggle "Free to use only" checkbox** → Updates `nonFree` URL param → new search

### Date Filter
9. **Click date button** → Opens dropdown
10. **Select field (Upload/Taken/Modified)** → Changes date field for range
11. **Click preset (Anytime/Today/Past 24h/etc.)** → Applies immediately, closes dropdown
12. **Set From date** → Updates draft
13. **Set To date** → Updates draft
14. **Clear From/To** → Clears draft date
15. **Click "Filter"** → Commits draft to URL
16. **Click "Cancel"** → Reverts draft, closes dropdown
17. **Click outside / Escape** → Same as cancel

### Sort Controls (Toolbar)
18. **Click sort field dropdown** → Opens sort field selector
19. **Select sort field** → Changes primary sort (natural default direction)
20. **Click direction toggle (↑/↓)** → Flips sort direction

### Sort Controls (Table Header)
21. **Click sortable header** → Set primary sort (or toggle direction)
22. **Shift+click sortable header** → Add/toggle secondary sort
23. **Double-click header** → Auto-fit column width (or restore)

### Table Column Management
24. **Drag column resize handle** → Resize column (CSS-only during drag)
25. **Right-click header** → Opens column context menu
26. **Toggle column checkbox (context menu)** → Show/hide column
27. **"Resize column to fit data" (context menu)** → Auto-fit single column
28. **"Resize all columns to fit data" (context menu)** → Auto-fit all columns

### Table Cell Interactions
29. **Click row** → Focus row (highlight)
30. **Double-click row** → Open image detail overlay
31. **Shift+click cell value** → Add `+field:value` to query
32. **Alt/⌥+click cell value** → Add `-field:value` to query
33. **Click pill (keywords/subjects/people)** → Same modifier pattern on individual pill

### Grid Cell Interactions
34. **Click cell** → Focus cell (highlight ring)
35. **Double-click cell** → Open image detail overlay

### Status Bar
36. **Click "X matches"** → (display only, no interaction)
37. **Click "N new" button** → Refresh search
38. **Click grid/table density toggle** → Switch view mode
39. **Click "Browse" button** → Toggle left panel
40. **Click "Details" button** → Toggle right panel
41. **Hover "Browse" button** → Prefetch aggregations (if Filters expanded)

### Left Panel (Facet Filters)
42. **Click Filters accordion header** → Expand/collapse section
43. **Click facet value** → Toggle filter chip (add/remove)
44. **Alt/⌥+click facet value** → Exclude (negative filter)
45. **Click "Show more…"** → Fetch expanded aggregation
46. **Click "Show fewer"** → Collapse to 10 buckets

### Right Panel (Metadata)
47. **Click Details accordion header** → Expand/collapse section
48. **Click metadata value** → Replace query, go to search results
49. **Shift+click metadata value** → Append AND filter
50. **Alt/⌥+click metadata value** → Append exclude filter
51. **Click search pill (keyword/subject/person)** → Same modifier pattern

### Panel Layout
52. **Drag panel resize handle** → Resize panel (CSS-only during drag, commit on release)
53. **Double-click panel resize handle** → Close panel

### Scrubber
54. **Click on track** → Instant seek to position
55. **Drag thumb** → Linear position mapping, seek on pointer-up
56. **Hover track** → Preview tooltip (position + sort label at cursor)
57. **Scroll wheel on scrubber** → Forwarded to content container

### Image Detail
58. **Click "← Back to search"** → Close overlay, return to list
59. **Click prev arrow (hover)** → Previous image
60. **Click next arrow (hover)** → Next image
61. **Double-click image (windowed)** → Close detail
62. **Double-click image (fullscreen)** → Exit fullscreen
63. **Click logo** → Reset everything, go to search
64. **Click metadata values in sidebar** → Same click-to-search as right panel

### Keyboard (Global)
65. **`[`** → Toggle left panel
66. **`]`** → Toggle right panel
67. **`Alt+[`** → Toggle left panel (in text fields)
68. **`Alt+]`** → Toggle right panel (in text fields)

### Keyboard (List Navigation)
69. **`↑` / `↓`** → Move focus up/down
70. **`←` / `→`** → Move focus left/right (grid only)
71. **`PageUp` / `PageDown`** → Page scroll + focus edge
72. **`Home`** → Top + focus first (seek if windowed)
73. **`End`** → Bottom + focus last (seek if windowed)
74. **`Enter`** → Open focused image

### Keyboard (Image Detail)
75. **`←` / `→`** → Prev/Next image
76. **`Backspace`** → Close detail
77. **`f` / `Alt+f`** → Toggle fullscreen

---

## 29. What Is NOT Implemented (Known Gaps)

Based on code comments, architecture notes, and comparison to typical Kahuna features:

| Feature | Status | Notes |
|---|---|---|
| **Authentication** | ❌ Not implemented | No auth layer — direct ES access via proxy |
| **Grid media-api integration** | ❌ Not implemented | DAL is direct ES, not via Grid API |
| **Image upload** | ❌ Not implemented | Read-only |
| **Image editing (metadata)** | ❌ Not implemented | Metadata display only, no editors |
| **Image cropping** | ❌ Not implemented | No crop UI |
| **Image deletion** | ❌ Not implemented | No delete capability |
| **Usage rights editing** | ❌ Not implemented | Display only |
| **Labels editing** | ❌ Not implemented | Display only (pills are read-only) |
| **Collections management** | ❌ Not implemented | No collections UI |
| **Leases management** | ❌ Not implemented | No lease UI |
| **Usage tracking** | ❌ Not implemented | Usages are in the type but not displayed |
| **Syndication** | ❌ Not implemented | URL params exist but no dedicated UI |
| **Image download** | ❌ Not implemented | No download button |
| **Drag and drop (to Composer)** | ❌ Not implemented | No drag integration |
| **Share / copy image link** | ❌ Not implemented | No share UI |
| **Batch operations** | ❌ Not implemented | Single-image focus only |
| **Pinboard integration** | ❌ Not implemented | Params in schema but unused |
| **Original vs edited metadata** | ❌ Not implemented | Shows merged metadata only |
| **File metadata (EXIF viewer)** | ❌ Not implemented | EXIF excluded from source |
| **Exports / crops viewer** | ❌ Not implemented | Export data in type but not displayed |
| **Similar images** | ❌ Not implemented | |
| **AI/semantic search UI** | ❌ Not implemented | `useAISearch` param exists but no UI |
| **Photoshoot grouping** | ❌ Not implemented | |
| **Image comparison (side-by-side)** | ❌ Not implemented | |
| **Error reporting (Sentry etc.)** | ❌ Not implemented | Console.error only |
| **Mobile responsive design** | Partial | Filters/sort hidden on small screens; core layout works |
| **User permissions / roles** | ❌ Not implemented | No auth = no roles |
| **Reaper / soft-delete management** | ❌ Not implemented | Config flag exists but no UI |

---

*End of report. This document covers every file in `kupua/src/` as of 2 April 2026.*

