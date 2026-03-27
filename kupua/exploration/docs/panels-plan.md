# Kupua — Panels Plan

> **Created:** 2026-03-25
> **Status:** Complete — all six implementation steps done.
> **Purpose:** Design and implementation plan for the side-panel system. Covers both
> panels (left: filters + collections; right: metadata/info), the scroll-anchor
> technique that preserves the user's position during any width change, and the
> facet-filter feature that is the immediate reason for building panels.

---

## Table of Contents

1. [Decisions](#decisions)
2. [Kahuna Panel System — Reference](#kahuna-panel-system--reference)
3. [Prior Art — Professional Panel Systems](#prior-art--professional-panel-systems)
4. [Kupua Panel Design](#kupua-panel-design)
5. [Grid View Scroll Anchoring](#grid-view-scroll-anchoring)
6. [Facet Filters](#facet-filters)
7. [Aggregation Performance & Safeguards](#aggregation-performance--safeguards)
8. [Implementation Plan](#implementation-plan)
9. [Decided Against](#decided-against)
10. [Open Questions for Later](#open-questions-for-later)

---

## Decisions

These are resolved. Change this section if a decision is revisited.

| # | Decision | Rationale |
|---|---|---|
| 1 | **Build both panels (left + right) together.** | They share all infrastructure (store, layout, resize handles, keyboard shortcuts). Building one and retrofitting the other wastes effort. The right panel is immediately useful in grid view — it can show metadata for the focused image using the same component that image-detail already uses. |
| 2 | **No overlay mode. No lock/unlock.** Panels are in the layout flow when visible, hidden when not. Two states only: visible or hidden. | Kahuna's three-state system (hidden / overlay / locked) is confusing. The auto-hide-on-scroll behaviour in overlay mode is hostile UX. Every professional app (Lightroom, IDEs, Figma) uses always-in-flow panels. Simpler state, simpler CSS, simpler UX. See [Decided Against §1](#1-overlay--auto-hide-on-scroll-mode). |
| 3 | **Panels are resizable** (drag handle, width persisted to localStorage). Min 200px, max 50% viewport. | Kahuna's fixed 250/290px panels are a notable gap vs. every modern professional tool. |
| 4 | **Accordion sections within each panel.** Left panel: Filters section (immediate), Collections section (Phase 4). Right panel: single metadata section (adapts to focused/selected images). | Sections are the unit of content organisation. Accordion headers are always visible; content collapses. Section open/closed state persisted to localStorage. |
| 5 | **Facets are NOT individual accordion sections.** The "Filters" section contains all facets in one scrollable area, each with a small field-name header. | Per-facet accordions → Darktable's module-sprawl problem. One scrollable section with inline expand ("Show all N values…") is simpler and doesn't require the user to manage N collapsible sections. |
| 6 | **No keyboard shortcuts for individual sections.** One shortcut per panel side. | Users won't memorize N section-specific shortcuts. Lightroom doesn't do it. Standard keyboard focus management (Tab/Enter/Space) within the panel is sufficient for accessibility. |
| 7 | **Keyboard shortcuts: `[` for left panel, `]` for right panel. `Alt+[` / `Alt+]` when focus is in an editable field.** | Single-character, adjacent on the keyboard, don't conflict with existing navigation keys (arrows, Home/End, PgUp/PgDn, `f` for fullscreen). Kahuna uses `L` and `M` — we avoid these because `M` would conflict with a future "mark" or "metadata edit" shortcut, and single-letter shortcuts that mean words are harder to extend. `[`/`]` are positional (left bracket = left panel). The Alt modifier allows shortcuts to work even when focus is in the search box — bare keys type normally, Alt+key fires the shortcut. See `lib/keyboard-shortcuts.ts` for the centralised system and `deviations.md` §15 for rationale. |
| 8 | **Grid view scroll anchoring on any width change** (panel toggle, panel resize, browser window resize). Table view needs no anchoring — its vertical layout is width-independent. | The anchor technique captures the focused (or viewport-centre) image's viewport ratio before columns change, then restores it in a `useLayoutEffect` after React re-renders. This is a generic ResizeObserver improvement to `ImageGrid.tsx`, not a panel-specific feature. It also fixes scroll-jump on browser window resize, which is a pre-existing gap. |
| 9 | **Facet aggregations are lazy, cached, and throttled.** Fetched only when the Filters section is expanded, on primary `search()` only (not `loadRange`/`loadMore`), debounced separately (500ms), cached per query. Circuit breaker if response exceeds 2s. **Hover prefetch (magic):** hovering over the Browse toggle prefetches aggs, but only if the panel is closed AND the Filters section is expanded in localStorage — so only "Filters people" benefit. Invisible optimisation; documented in `infra-safeguards.md` §6. | Always-fetching would double ES load for all 50+ users on every keystroke, even when panels are hidden. Most users will have Collections expanded, not Filters — forcing the cluster to run 14 terms aggs for every search on behalf of users who never look at them is unjustifiable. 50-200ms latency on Filters section open/expand is perfectly acceptable UX. See [Aggregation Performance & Safeguards](#aggregation-performance--safeguards) for the full analysis. |
| 10 | **Existing toolbar filters (date, free-to-use, sort) stay in the toolbar.** Facet filters live in the left panel. Both are available simultaneously. | Toolbar filters are compact, frequently used, and don't benefit from a sidebar's vertical space. Facets (with value lists and counts) need room. The two UIs complement each other — toolbar for quick toggles, panel for exploration. |
| 11 | **Right panel shows the same metadata component as image detail view.** | This is how Kahuna works (and it's correct). One shared metadata component adapts to context: single focused image, multiple selected images, or image-detail view. Enables selection display + batch editing via the same UI in grid/table views. |
| 12 | **Panel state (`visible`, `width`, section open/closed) in localStorage, not URL.** | Panel state is user preference, not search context. Putting it in the URL would bloat every shared link. Matches kahuna's approach. |
| 13 | **Filters section open/closed state persisted to localStorage.** Most users will keep Collections expanded (familiar from kahuna) and Filters collapsed. Power users who keep Filters expanded get aggs on every search automatically — their preference is remembered. | This makes the performance trade-off self-selecting: only users who actively want facet data pay the ES cost. New users default to Filters collapsed (no agg load). |
| 14 | **Facet counts are human-formatted.** Values ≥10k display as "1.8M", "421k", etc. Values <10k show exact numbers. | Exact counts like "1,766,849" are noise in a filter context — the user cares about relative magnitude, not precision. Compact numbers scan faster and reduce visual clutter. This is display-only formatting; ES returns exact `doc_count` regardless. |

---

## Kahuna Panel System — Reference

> Summary of kahuna's implementation for context. Full source in
> `kahuna/public/js/services/panel.js`, `components/gr-panels/`,
> `components/gr-panel-button/`, `search/view.html`, `search/results.html`.

### Architecture

Two panels on the search page:
- **Left:** Collections (`collectionsPanel`) — shortcut `L`
- **Right:** Info/metadata (`metadataPanel`) — shortcut `M`

Each panel is a `panelService.createPanel(hidden=true)` — an RxJS state machine
with two booleans `{hidden, locked}`. Mutual exclusion: `hidden && locked` is
impossible (locking forces visible, hiding forces unlocked).

### Three states per panel

| State | `hidden` | `locked` | CSS | Behaviour |
|---|---|---|---|---|
| **Hidden** | `true` | `false` | `width: 0; overflow: hidden` | Not visible. |
| **Overlay (unlocked)** | `false` | `false` | `position: fixed; width: 290/250px; rgba(68,68,68,0.9)` | Floats over content. **Auto-hides on window scroll** (debounced 100ms). |
| **Locked** | `false` | `true` | `position: relative; width: 290/250px; rgba(68,68,68,1)` | In flexbox flow. Pushes content. Stays on scroll. |

### CSS layout

```
gr-panels (flex)
├── gr-panel [left]       — position: fixed (overlay) or relative (locked)
├── gr-panel-content      — flex-grow: 1 (main results)
└── gr-panel [right]      — position: fixed (overlay) or relative (locked)
```

- `transition: width 0.2s` for slide animation
- Height hardcoded: `top: 86/136px; bottom: 0`
- **No resize.** Widths are fixed CSS values.
- **No accordion sections.** Each panel is one content area.
- **No scroll preservation** when locking — grid reflows, position lost.

### Panel buttons

Results toolbar has `<gr-panel-button-small>` (left, icon+label) and
`<gr-panel-button>` (right, icon+text). Each shows: Show/Hide toggle +
Lock/Unlock button (only when visible).

### Persistence

`{hidden, locked}` saved to `localStorage` per panel via
`panelService.setAndSaveState()`. Restored on reload.

### Auto-hide on scroll

```javascript
// gr-panels.js — overlay panels auto-hide when the user scrolls
const scrollWhileVisAndUnlocked$ = winScroll$.
    debounce(100).windowWithCount(2).
    withLatestFrom(panel.state$, (ev, state) => !(state.locked || state.hidden))
    .filter(shouldHide => shouldHide);
subscribe$(scope, scrollWhileVisAndUnlocked$, () => panel.setHidden(true));
```

**We are dropping this.** See [Decided Against §1](#1-overlay--auto-hide-on-scroll-mode).

---

## Prior Art — Professional Panel Systems

### Adobe Lightroom Classic

- Left panel: Folders, Collections, Publish Services — **accordion sections** with
  disclosure triangles. Right panel: Histogram, Quick Develop, Keywording, etc.
- Both panels **resizable** via drag. Panel + section state persisted.
- **Solo mode:** Alt-click a section header → only that section opens. Power-user
  density control.
- **Keyboard:** `Tab` hides both panels. `Shift+Tab` hides toolbar + panels. `F7`
  left, `F8` right. No per-section shortcuts.
- Panels always in layout flow (no overlay mode). Central content reflows.
- Lightroom does NOT preserve scroll position on panel toggle — grid re-tiles.
  Acceptable there because cell sizes are large and the visual shift is small.

### Adobe Bridge

- **Workspace-based:** Saved panel layouts (Essentials, Film Strip, Metadata, etc.).
  Panels can be docked, tabbed, or floating.
- **Filter panel (left):** Faceted filters with collapsible sections — Keywords,
  Date Created, Orientation, Rating, Label. Values + counts. Click to filter.
  **This is exactly what kupua's facet filters will be.**
- All panel zones resizable via drag dividers.

### Darktable / Ansel

- Accordion modules in left/right panels. Keyboard: arrows hide panels.
- **Ansel's key lesson:** Darktable had too many modules. Ansel's fork pruned
  aggressively and made the panel system predictable. **Fewer essential sections
  is better than many optional ones.**

### VS Code / JetBrains IDEs

- Activity bar (icon rail) selects which panel fills the sidebar.
  Primary sidebar resizable. One content at a time per sidebar.
- **Different model from Lightroom:** icon rail switches content, not stacked
  accordions. Not directly applicable to our use case (we need multiple
  sections visible simultaneously).

### Key takeaways for Kupua

1. **Resizable is table stakes.** Every professional tool has it.
2. **Always-in-flow** (Lightroom, IDEs) is simpler and less confusing than
   overlay + lock (kahuna).
3. **Fewer accordion sections** (Ansel's lesson) — don't repeat Darktable's
   module sprawl.
4. **Filter panel with counts** (Bridge) is the gold standard for faceted
   exploration in a DAM context.
5. **No app does per-section keyboard shortcuts** — not worth building.

---

## Kupua Panel Design

### Layout

```
RootLayout (h-screen, w-screen, overflow-hidden, flex col)
└── SearchPage
    ├── SearchBar        (h-11, shrink-0)       — full width
    ├── StatusBar        (h-7, shrink-0)        — full width
    └── PanelLayout      (flex-1, overflow-hidden, flex row)
        ├── LeftPanel?   (shrink-0, overflow-y-auto)
        │   ├── [Filters section]      — accordion, scrollable facets
        │   └── [Collections section]  — accordion (Phase 4)
        ├── MainContent  (flex-1, min-w-0, overflow-auto)
        │   └── ImageGrid or ImageTable
        └── RightPanel?  (shrink-0, overflow-y-auto)
            └── [Metadata section]     — shared metadata component
```

`PanelLayout.tsx` is a new wrapper component that manages the horizontal
flex row of `[left-panel?] [main-content] [right-panel?]`. It reads panel
visibility and width from the panel store and renders resize handles between
zones.

### Panel state

**Two states only: visible or hidden.** No overlay, no lock.

```typescript
// panel-store.ts — Zustand + localStorage persist
interface PanelState {
  left:  { visible: boolean; width: number };
  right: { visible: boolean; width: number };
  // Per-section open/closed state (keyed by section ID)
  sections: Record<string, boolean>;
}
```

Default widths: left 280px, right 320px. Constraints: min 200px, max 50%
of viewport.

### Resize handles

A thin (`4px` visual, `12px` hit target) draggable divider between panel
and main content. Cursor: `col-resize`.

**During drag:** update width via CSS custom property on the panel container
(no React re-render per frame). The grid's `ResizeObserver` fires on the
main content container (which is flexing to fill remaining space) and
recalculates columns. Scroll anchoring runs in `useLayoutEffect` after
the column change.

**On drag end:** commit final width to the Zustand store → localStorage.

This mirrors the column-resize approach already in `ImageTable.tsx` — CSS-only
during drag, React state on commit.

### Keyboard shortcuts

| Key | Alt+Key (in editable fields) | Action |
|---|---|---|
| `[` | `Alt+[` | Toggle left panel visibility |
| `]` | `Alt+]` | Toggle right panel visibility |

All single-character shortcuts follow a universal pattern managed by
`lib/keyboard-shortcuts.ts`:
- **Not in an editable field:** bare key fires the shortcut
- **In an editable field (search box, etc.):** `Alt+key` fires the shortcut
- Both combos always work when not editing

Components register shortcuts via the `useKeyboardShortcut` hook. Stack
semantics: if two mounted components register the same key, the most
recently mounted one wins (unmounting restores the previous handler).
`f` for fullscreen is only registered in ImageDetail — not app-wide
(see deviations.md §15 for rationale).

Registered on `document` (capture phase, same as Home/End). The
centralised handler detects editable fields (input, textarea,
contentEditable, CQL input shadow DOM) and only requires Alt in those
contexts.

Within a panel: Tab / Shift+Tab between accordion headers. Enter / Space
to toggle section open/closed. Standard ARIA accordion pattern.

### Accordion sections

Each section has:
- **Header:** always visible. Section title + disclosure triangle (▸/▾).
  Click or Enter/Space to toggle.
- **Content:** collapsible. When closed, takes zero height.
- **Section open/closed persisted** to `panel-store.ts` → localStorage.

Left panel sections:
1. **Filters** — facet aggregations (immediate)
2. **Collections** — tree browser (Phase 4, placeholder/hidden until then)

Right panel sections:
1. **Metadata** — shared `ImageMetadata` component showing metadata for
   the focused image, selected images, or (in image detail) the current
   image. This is the same component that will be used in `ImageDetail.tsx`.

### Panel toggle animation

`transition: width 150ms ease-out` on the panel container. The panel
slides in/out. Main content resizes smoothly. The grid's `ResizeObserver`
fires on each animation frame, but scroll anchoring only triggers when
`columns` actually changes (which happens at most once during the
animation, at the threshold width).

### Panel toggle buttons

In the **StatusBar** (the thin strip between toolbar and results):
- Left edge: left-panel toggle button (filter icon + "Filters" label).
  Accent highlight when panel is visible.
- Right edge (existing density toggle stays; panel toggle added next to it):
  right-panel toggle button (info icon). Accent highlight when visible.

The toolbar (`SearchBar`) is already full — filters, sort, date, free-to-use.
StatusBar has room and is the natural place for layout controls (density
toggle is already there).

---

## Grid View Scroll Anchoring

### The problem

Grid view lays out images in `columns = floor(containerWidth / 280)` columns.
When the container width changes (panel open/close, panel resize, browser
window resize), `columns` may change. A column-count change reflows every
image: image #N moves from row `N/oldCols` to row `N/newCols`.

Example: viewing image #8760 with 5 columns → row 1752. Panel opens,
width shrinks, 4 columns → row 2190. At 303px/row, that's a 133k pixel
jump. **The user is completely lost.**

### The fix

An anchor-image technique in `ImageGrid.tsx`'s `ResizeObserver`:

1. **Before column change:** capture the anchor image ID (focused image,
   or the image nearest the viewport centre) and its **viewport ratio**
   (0 = top edge, 1 = bottom edge).
2. **After React re-renders with new column count:** in a `useLayoutEffect`
   (before paint), calculate the anchor image's new row position and
   scroll so it appears at the saved viewport ratio. No visible jump.

### When it fires

The `ResizeObserver` callback checks whether `columns` actually changed.
Sub-column-width tweaks (e.g. going from 1200px to 1180px, still 4
columns) don't trigger anchoring — only threshold crossings that change
the column count.

### What it covers

| Cause of width change | Anchoring needed? |
|---|---|
| Panel opens/closes | ✅ (columns may change) |
| Panel resize drag | ✅ (columns may change) |
| Browser window resize | ✅ (columns may change) |
| Future density slider | ✅ (cell size change → columns change) |

### Table view

**No anchoring needed.** Table rows have fixed height independent of container
width. `scrollTop` stays valid across width changes. The table may gain/lose
horizontal scroll, but the user's vertical position is preserved automatically.

### Relationship to existing `density-focus.ts`

`density-focus.ts` solves the same conceptual problem (preserve viewport
position across layout change) but for density switches (table↔grid),
which involve component unmount→remount. The panel/resize anchoring
stays within the same component — it bridges a re-render, not a remount.
Same concept, different lifecycle moment. They don't share code but share
the algorithm.

---

## Facet Filters

### What they are

Faceted filtering — a panel section showing values of key fields ranked by
document count within the current search context. Standard in Lightroom
(Library Filter → Metadata columns), Adobe Bridge (Filter panel), and
every e-commerce site.

Example: the user searches `cats`. The Filters section shows:

```
Credit         Getty Images (342) · Reuters (218) · PA (87) · AFP (65) · ▸ 12 more
Source         Rex Features (401) · AP (189) · Shutterstock (98) · ▸ 8 more
Uploaded by    jane.doe (55) · john.smith (42) · ▸ 15 more
Rights         Staff Photographer (128) · Agency (512) · Handout (33)
File type      JPEG (680) · PNG (12) · TIFF (3)
```

Clicking a value adds a CQL chip (e.g. `+credit:"Getty Images"`).
Shift-click appends (AND). Alt-click excludes (NOT). Counts update live
after every search.

### Which fields get facets

**All fields in the field registry with `aggregatable: true`.** Currently
these are the fields with `keyword` type in the ES mapping:

- `metadata.credit`
- `metadata.source`
- `metadata.keywords`
- `metadata.subjects`
- `metadata.imageType`
- `uploadedBy`
- `usageRights.category`
- `source.mimeType`
- Config-driven alias fields (from `grid-config.ts`, all keyword type)

Fields that are `text`-only (`byline`, `city`, `country`, `description`,
`title`, etc.) cannot be aggregated until the mapping enhancements in
`mapping-enhancements.md` §2a add `.keyword` sub-fields. This is a
Grid-wide change, not kupua-only. The field registry's `aggregatable`
flag is the single source of truth — when the mapping changes and
`.keyword` sub-fields are added, flip the flag and the facet appears
automatically.

### Data flow

```
User expands Filters section (or it was already expanded from localStorage)
  → search-store checks: is agg cache stale for current query?
     ├── YES → fire batched aggregation request (debounced 500ms from search)
     │         → ES _search with size:0, N named terms aggs
     │         → store agg results + cache key (query hash)
     │         → FacetFilters component re-renders with fresh counts
     └── NO  → FacetFilters reads cached results immediately (instant)
```

**Trigger:** Aggregations are fetched when the **Filters accordion section
is expanded** AND a primary `search()` has completed (or on section expand
if the cache is stale). They are NOT fetched on `loadRange`, `loadMore`,
or the new-images poll. They are NOT fetched when the Filters section is
collapsed, even if the panel is visible.

**Cache:** Keyed by the query string (or a hash of the `SearchParams` that
affect results — query, filters, date ranges, etc.). If the user collapses
Filters, changes the search, and re-expands Filters, the stale cache is
detected and a fresh fetch fires. If the query hasn't changed, cached
results are used immediately.

**Debounce:** Aggregation fetches are debounced separately from the main
search, at **500ms** (vs. ~300ms for search). During rapid typing, the
search results update first; facet counts follow ~200ms later. This is
the Adobe Bridge pattern — counts lag slightly behind results during
rapid refinement, which is imperceptible in practice.

**Circuit breaker:** If an aggregation response takes longer than **2000ms**,
the store records a warning and skips automatic refetch on the next search.
A "Refresh" button appears in the Filters section header, allowing the
user to manually re-trigger. The breaker resets after a successful fast
response. This prevents a slow or stressed cluster from being hammered
by persistent agg requests.

### Aggregation batching (performance)

Rather than N separate `getAggregation()` calls (one per faceted field),
batch all faceted fields into a **single ES request** using the `aggs`
parameter with multiple named aggregation clauses. One round trip instead
of N. This needs a new DAL method:

```typescript
// Addition to ImageDataSource interface
getAggregations(fields: AggregationRequest[]): Promise<Record<string, AggregationResult>>;
```

The ES adapter constructs one `_search` request with `size: 0` (no hits)
and N named `terms` aggregations. This is how Bridge and Lightroom work
under the hood — all filter counts in one query.

### FacetFilters component

Lives inside the left panel's "Filters" accordion section. Structure:

```
Filters (accordion section, scrollable)
├── Credit        — header + value list (top 5 + "Show all N…")
├── Source         — header + value list
├── Uploaded by    — header + value list
├── Rights         — header + value list
├── File type      — header + value list
├── Keywords       — header + value list
├── Image type     — header + value list
└── [alias fields] — header + value list (from grid-config)
```

Each facet is a simple stacked block (field name header in `text-xs
text-grid-text-dim`, value list below). NOT an accordion — just a
vertical stack within the scrollable section.

**Count formatting:** Values are human-formatted for scannability.
≥1M → "1.8M", ≥10k → "421k", <10k → exact with comma separator ("8,760").
This is purely a display concern — ES returns exact `doc_count` values
regardless and there is zero performance difference. The formatting
function is trivial (~10 lines). Example from real PROD data:

```
Credit    The Guardian (1.8M) · Getty Images (1M) · AFP/Getty (505k)
          Reuters (421k) · AP (385k) · ▸ 12 more
```

**Active filter highlight:** when a facet value is already in the current
query (as a CQL chip), it's highlighted with accent colour and a ✓ or
similar indicator. Clicking it again removes the chip (toggle behaviour).

**"Show all N values…" link:** each facet initially shows the top 5 values
(by doc count). A "Show all 47…" link expands inline to show all returned
values. The expanded state is session-only (not persisted). The initial
fetch requests `size: 10` per field (headroom for the "a couple more"
expand without a new request). The "Show all" expand fetches `size: 100`
lazily for **that one field only** — a single targeted request, not a
full batch refetch.

**Search within facet:** for facets with many values (e.g. Credit with
hundreds), a small filter input at the top of the expanded list. Client-side
filtering of the already-fetched aggregation results — no extra ES query.

### Interaction with existing toolbar filters

The toolbar keeps: CQL search input, date filters, free-to-use checkbox,
sort controls. These are the "quick access" filters.

The panel's facet filters are the "exploration" filters. They complement
each other:
- Toolbar: fast, always visible, for the most common refinements.
- Panel: persistent, scrollable, for browsing what's in the current
  result set and discovering values you didn't know to search for.

Both update the same URL search params via the same `updateSearch()` /
`upsertFieldTerm()` path. A CQL chip added from a facet click is identical
to one added from a table cell click — the search pipeline doesn't know
the difference.

---

## Aggregation Performance & Safeguards

> This section exists because kupua is one of very few clients hitting the
> production ES cluster, and we must not degrade it. Kahuna currently runs
> almost no aggregations. Introducing faceted filters means a new category
> of ES query that didn't exist before. We need to be honest about the
> cost and build appropriate protections.

### The load calculation

**Current state (no facet aggregations):**
- ~50 concurrent users × N searches per active session = N `_search`
  requests (returning hits, with sort and pagination).
- Typeahead fires single-field aggregations on-demand only (user types
  `credit:` → one `terms` agg on `metadata.credit`). Rare.
- New-images poll: `_count` every 10s per user ≈ 300 req/min from all
  users. Lightweight (no hits, no aggs).

**Proposed state (with facet aggregations):**
- Each primary search that fires while Filters is expanded also fires a
  `size:0` request with ~14 named `terms` aggregations (7 hardcoded
  aggregatable fields + 7 config alias fields).
- **Not all users will have Filters expanded.** Default: collapsed.
  Persisted to localStorage (Decision #13). Only users who explicitly
  expand Filters pay the agg cost. Estimated: 5-15 of 50 users at any
  given time during initial rollout (power users).

### How expensive are batched terms aggs on 9M documents?

**Low-cardinality keyword fields** (`usageRights.category` ~25 values,
`source.mimeType` ~3 values, `metadata.imageType` ~5 values): **very
cheap**, typically 5-20ms. ES uses doc_values (columnar storage), global
ordinals for low-cardinality fields are tiny and cached.

**Medium-cardinality keyword fields** (`metadata.credit` ~1000s of unique
values, `metadata.source` ~hundreds): **moderate**, typically 20-80ms.
Global ordinals need to be built (or cached) for each segment. The
priority queue for top-N runs across all shards.

**High-cardinality keyword fields** (`uploadedBy` ~thousands,
`metadata.keywords` ~tens of thousands if aggregatable): **this is where
it gets expensive.** 50-200ms+. Global ordinals for high-cardinality
fields are the biggest cost — they consume heap and take time to build
on the first query after a segment merge.

**Combined:** 14 terms aggs in one request doesn't run them truly in
parallel — within each shard, ES processes all aggs in a single doc-scan
pass, but the coordinator merges N agg results from each shard. Realistic
estimate: **50-300ms** per batched request depending on query selectivity.
A narrow query (`credit:"Getty" cats`) scans fewer docs and is faster. A
`match_all`-equivalent (empty search box, no filters) is worst case.

**Real PROD data point** (from `credit` terms agg, `match_all`, `size:10`):
top bucket is "The Guardian" at 1,766,849 docs. This confirms the index
is large and non-trivial to aggregate.

### Why "always fetch" was rejected

If all 50 users fired agg requests on every search:

1. **Keystroke multiplier** — user types "london", debounced to ~300ms.
   Types "london cats", fires again. Each search now costs 2× in ES load
   (hits + aggs). During rapid refinement: 5-10 extra agg requests per
   user per minute.
2. **Concurrent storm** — during a news event, 30+ editors search
   simultaneously. 30 users × 5 searches/min × 1 extra agg request =
   150 extra requests/min, each taking 50-300ms of cluster time.
3. **Wasted work** — most of those 50 users never open the Filters
   section. They use the search bar and maybe date filters. Running 14
   terms aggs for them is pure waste.

### What we build instead

| Protection | How it works |
|---|---|
| **Lazy trigger** | Aggs fetched only when the Filters accordion section is **expanded** (not just when the panel is visible). The section open/closed state is persisted to localStorage (Decision #13), so the preference sticks across sessions. Default: collapsed. |
| **Query-keyed cache** | Agg results cached by a hash of the `SearchParams` that affect the result set (query, filters, date ranges). Collapse Filters, change search, re-expand → stale cache detected → fresh fetch. Same search → instant from cache. |
| **Separate debounce** | Agg fetches debounced at **500ms** (vs. ~300ms for search). During rapid typing, search results update first; facet counts follow ~200ms later. Prevents agg storms during keystroke sequences. |
| **Primary search only** | Aggs NOT fetched on `loadRange`, `loadMore`, or the new-images poll. Only on `search()` (new query/filter). Counts don't change meaningfully from pagination — the aggregation runs against the full result set. |
| **Modest initial `size`** | Initial batch requests `size: 10` per field (not 50). "Show all" expand fetches `size: 100` lazily for **one field only**. 10 × 14 fields is meaningfully less work than 50 × 14 in terms of the per-shard priority queue. |
| **Circuit breaker** | If the agg response takes >**2000ms**, the store logs a warning, shows a "Refresh" button in the Filters header, and skips automatic refetch on subsequent searches. Resets after a successful fast response (<2000ms). Prevents a stressed cluster from getting hammered. |
| **`took` display** | Agg response `took` time shown in StatusBar next to existing search timing. Essential for monitoring — both for dev during rollout and for identifying slow fields. |

### What to monitor in CloudWatch (ES cluster metrics)

When facet aggregations ship, watch these metrics for the Grid ES cluster:

| Metric | What to watch for | Concern threshold |
|---|---|---|
| `SearchRate` (req/s) | Step increase when users adopt Filters | >2× baseline means more users than expected have Filters expanded |
| `SearchLatency` p50, p99 | Agg queries showing up as a new latency band | p99 >500ms sustained |
| `JVMMemoryPressure` | Global ordinals for 14 keyword fields cached in heap | >80% sustained (ES starts GC pressure) |
| `ThreadpoolSearchQueue` | Search thread pool queue depth increasing | Any sustained queue depth (means queries are waiting) |
| `ThreadpoolSearchRejected` | Queries being rejected due to full pool | Any rejections = immediate problem |
| `CPUUtilization` | Terms aggs are CPU-bound (sorting, merging per shard) | >70% sustained on data nodes |

**If we see problems:** The first lever is reducing which fields are
aggregated (remove high-cardinality fields like `keywords` from the batch).
The second is increasing the debounce. The third is disabling automatic
refetch entirely and making Filters a manual "click to load" experience.
None of these require architectural changes — they're config/constant tweaks.

### Rounding display numbers does NOT help ES performance

A note because this question came up: formatting counts as "1.8M" vs.
"1,766,849" is **purely a UI formatting decision**. ES computes and
returns the exact `doc_count` regardless of how the frontend displays it.
The `terms` aggregation's cost is in scanning documents and maintaining
a priority queue per shard — the numeric value of each bucket's count is
irrelevant to that cost. Rounding is good UX (Decision #14) but has zero
backend impact.

### Comparison: what does Kahuna do today?

Kahuna runs almost **zero** aggregations. The only agg-like queries are:
- Typeahead value suggestions (one field at a time, on demand, when the
  user types `field:` in the search box).
- The collections tree (which is a different kind of query — not a terms
  agg on the main index).

So kupua's faceted filters represent a **genuinely new load category** on
the ES cluster. This isn't "slightly more of what already exists" — it's
a new thing. That's why the safeguards above aren't paranoia; they're
proportionate caution for a shared production system.

---

## Implementation Plan

### Step 1 — Grid view scroll anchoring ✅

**Files:** `ImageGrid.tsx` (modify ResizeObserver + add `useLayoutEffect`)

The anchor technique described in [Grid View Scroll Anchoring](#grid-view-scroll-anchoring).
~40 lines of code, no new files, no new dependencies. Self-contained and
independently testable (resize the browser window while scrolled deep in
grid view — position should be preserved).

**Do this first** because it's a standalone improvement with immediate value
(fixes browser-resize scroll jump), and it's a prerequisite for panels
not degrading grid view UX.

### Step 2 — Panel store ✅

**Files:** `stores/panel-store.ts` (new)

Zustand store with localStorage persist for panel visibility, widths, and
section open/closed states. Actions: `togglePanel(side)`,
`setWidth(side, width)`, `toggleSection(sectionId)`.

### Step 3 — Panel layout ✅

**Files:** `components/PanelLayout.tsx` (new), `components/StatusBar.tsx` (modify), `routes/search.tsx` (modify)

The `PanelLayout` wrapper component: flex row of
`[left-panel?] [main-content] [right-panel?]` with resize handles.
Keyboard shortcuts (`[`/`]`). Panel toggle buttons in StatusBar.
Slot-based composition — the search route passes panel content via
children/props, PanelLayout handles the chrome.

Update `search.tsx` to wrap the grid/table in `PanelLayout` and pass
panel content components.

**Toggle button design (implemented):** StatusBar uses `items-stretch` so
all children are full-height strips (not floating lozenges). Both panel
toggles show icon + label ("Browse" / "Details"). Active state: button
extends 1px below the bar's `border-b` via `-mb-px` and paints
`bg-grid-panel` over it (tab-merge effect). Both states have identical
geometry — only colour/background changes, so labels never shift on
toggle. Full-height dividers between all toolbar zones.

### Step 4 — Aggregation batching in DAL ✅

**Files:** `dal/types.ts` (extend interface), `dal/es-adapter.ts` (implement),
`stores/search-store.ts` (add agg state + cache + circuit breaker)

Add `getAggregations()` method that batches multiple terms aggregations
into a single `_search` request with `size: 0`. Initial fetch size: 10
values per field. Aggregation state in search-store: results cache (keyed
by query hash), loading flag, circuit breaker state. Fetched only when the
Filters section is expanded (reads section state from panel-store).
Debounced separately at 500ms. Circuit breaker disables auto-fetch if
response exceeds 2000ms. "Show all" for a single field uses the existing
`getAggregation()` (singular) method with `size: 100`.

Add agg response `took` time to StatusBar display (next to existing search
timing) — essential for monitoring during rollout.

### Step 5 — Facet filters component ✅

**Files:** `components/FacetFilters.tsx` (new)

The facet filter panel content. Reads aggregation results from the search
store. Renders faceted value lists with counts. Click adds/removes CQL
chips via `updateSearch()`. Active filters highlighted. Alt+click to
exclude (platform-aware tooltip: ⌥click on Mac, Alt+click on Windows,
via `ALT_CLICK` from `keyboard-shortcuts.ts`).

"Show more" per field fetches a separate single-field request at 100
buckets (not mixed into the recurring batch). Expanded state is
component-level — cleared on new search, not persisted. "Show fewer"
collapses back to the batch size and scroll-anchors the field header to
the top of the panel (`findScrollParent` + `requestAnimationFrame` +
`scrollTop` adjustment). Browser scroll anchoring disabled on panel
containers (`overflow-anchor: none`) to prevent conflicts.

### Step 6 — Right panel metadata ✅

**Files:** `components/ImageMetadata.tsx` (new — extracted from `ImageDetail.tsx`),
`ImageDetail.tsx` (modified to use shared component), `routes/search.tsx` (modified)

Extracted `MetadataPanel`, `MetadataField`, and formatters from `ImageDetail.tsx`
into a standalone `ImageMetadata.tsx` (~120 lines). The component takes an `Image`
prop and renders a `<dl>` of all metadata fields. No layout chrome (no `<aside>`,
no width, no border) — callers handle container styling.

**ImageDetail** wraps it in `<aside className="w-72 ...">` (same as before).

**Right side panel** uses a `FocusedImageMetadata` wrapper in `search.tsx` that
reads `focusedImageId` from the search store, resolves it to an Image via
`imagePositions` + `results`, and renders `ImageMetadata` with `p-3` padding.
Empty state: "Focus an image to see its metadata." Wrapped in
`AccordionSection sectionId="right-metadata" title="Details"`.

### Dependencies

```
Step 1 (scroll anchor)  ✅ done
Step 2 (panel store)    ✅ done
Step 3 (panel layout)   ✅ done (depends on Step 2)
Step 4 (aggregations)   ✅ done
Step 5 (facet filters)  ✅ done (depends on Steps 3 + 4)
Step 6 (right panel)    ✅ done (depends on Step 3)
```

All six steps complete. The panel system is fully functional.

---

## Decided Against

Documenting what we chose not to build and why, in case we revisit later.

### 1. Overlay / auto-hide-on-scroll mode

Kahuna has an "unlocked" panel mode: `position: fixed`, semi-transparent,
auto-hides when the user scrolls the window.

**Why we dropped it:**
- The auto-hide is hostile UX — the software closes something the user
  explicitly opened. It's a pattern from ~2015 mobile-web drawer menus
  that never translated well to desktop.
- The two-button (show/hide + lock/unlock) UI is confusing. Most users
  don't understand the distinction.
- It doubles the state space (two booleans instead of one), doubles the
  CSS modes (fixed vs. relative positioning), and complicates keyboard
  shortcut behaviour (does the shortcut toggle visibility or lock?).
- Every professional reference app (Lightroom, Bridge, IDEs) uses
  always-in-flow panels. No overlay mode.

**Risk of dropping it:** Some kahuna users may be accustomed to peeking
at a panel without it pushing content. If this becomes a real user
complaint after launch, we could add a "peek" mode (panel overlays on
hover/shortcut, closes on click-outside) — but it should be a popover,
not a persistent overlay.

### 2. Per-facet accordion sections

Each facet (Credit, Source, etc.) as its own collapsible accordion section
within the panel.

**Why we dropped it:**
- With 8+ facets, the user spends more time managing which sections are
  open/closed than actually filtering. This is the Darktable module-sprawl
  problem that Ansel's fork fixed by pruning.
- Scrolling a single list of stacked facets is faster than toggling N
  accordions open.
- Per-facet persistence adds N booleans to localStorage and N decisions
  to restore on load.

**What we do instead:** One "Filters" section (scrollable) containing
all facets stacked vertically. Each facet has a small header but no
collapse toggle. "Show all N…" link for facets with many values.

### 3. Per-section keyboard shortcuts

Dedicated key combos to open/close individual accordion sections.

**Why we dropped it:**
- Nobody memorises N section-specific shortcuts. Lightroom doesn't have
  them. No IDE has per-panel-section shortcuts.
- Shortcuts would conflict with existing navigation keys.
- Discoverability is zero.

**What we do instead:** One shortcut per panel side (`[`/`]`). Standard
Tab/Enter/Space focus management within the panel for accessibility.

### 4. Non-linear / nested accordions

Accordions within accordions (e.g. Filters section containing collapsible
facet sub-sections).

**Why we dropped it:** Nesting adds cognitive load and interaction depth
without proportional value. A flat stack of facets within a single
scrollable section is simpler and faster to scan.

### 5. Bottom panel

A third panel zone below the main content.

**Why we dropped it:** No use case right now. Batch operation status,
console output, etc. are all future features. The panel infrastructure
is generic enough that a bottom panel could be added later if needed.

---

## Open Questions for Later

These are not blockers for the current implementation. Record here so they
don't get lost.

1. **Lightroom-style Solo mode** — Alt-click a section header to close all
   other sections. Elegant power-user feature. Trivial to add once
   accordion sections exist. Worth considering when Collections arrives
   in Phase 4 and the panel has 2+ sections.

2. **Saved panel layouts / workspaces** — Bridge has named workspaces
   (Essentials, Film Strip, Metadata). Could be useful for kupua:
   "Triage" layout (filters panel + grid), "Metadata review" layout
   (table + metadata panel), "Exploration" layout (both panels + grid).
   Deferred — needs the full panel system to be stable first.

3. **Panel in image detail view** — when viewing a single image, should
   the left panel (filters) still be available? Probably not — filters
   don't make sense in single-image context. The right panel (metadata)
   is already integral to image detail. Decision deferred until the panel
   system is built and we can test the interaction.

4. **Touch / mobile** — panels on small screens. Probably: panels are
   hidden by default, toggle opens as a full-width overlay (not side-by-side).
   Deferred — kupua is desktop-first for now.

5. **~~Aggregation performance at scale~~** — **Resolved.** Addressed
   comprehensively in [Aggregation Performance & Safeguards](#aggregation-performance--safeguards).
   Lazy fetching (Decision #9), circuit breaker, query-keyed cache,
   separate debounce, and explicit CloudWatch metrics to monitor. No
   longer an open question.

6. **Dynamic facet field discovery** — currently, which fields are
   aggregatable is hardcoded in the field registry (`aggregatable: true`).
   When mapping enhancements add `.keyword` sub-fields to text fields,
   the registry must be updated manually. A future improvement: query
    `_mapping` at startup and auto-detect keyword fields. Noted in
   field-registry decision #26 in AGENTS.md.








