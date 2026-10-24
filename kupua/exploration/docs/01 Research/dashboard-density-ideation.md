# Dashboard Density — Ideation & Research

> **Created:** 2026-04-09
> **Status:** Exploratory — no implementation decisions made yet.
> **Purpose:** Research and ideation for a "dashboard" discovery density in kupua.
> **Prototype:** `exploration/mock/dashboard-prototype.html` (open in browser)

---

## The Idea

A new density level: **dashboard**. Instead of showing images (table/grid/detail),
it shows **interactive visualisations of the result set's statistical shape**.
Histograms, bar charts, donut charts, metrics. Every widget is:

1. **Affected by the current search context** — if you've searched for "cats",
   the dashboard shows the distribution of *cat images*, not all 9M.
2. **Clickable to refine the search** — click a bar in the credit chart →
   adds `+credit:"Reuters"` to the CQL query. Click a time range in the
   histogram → sets `since`/`until`. The interaction is identical to clicking
   a facet value or a table cell.

This is "Discovery: Beyond Search" (§ in 01-frontend-philosophy.md) made
concrete. Search answers "show me X." The dashboard answers "what's here?"

---

## Is it a density?

### The philosophical question

The density continuum (table → grid → detail → fullscreen) represents
"different views of the same ordered list." The dashboard doesn't show the
list — it shows the list's *statistics*. This is the one exception to the
"all densities show the same ordered list" rule.

### Options

| Approach | Pros | Cons |
|---|---|---|
| **A. Full-page density** — replaces main content area, like Kibana's Dashboard vs. Discover toggle | Maximum screen real estate for charts. Rich, immersive. Natural "I'm exploring" mode. | Breaks "ordered list" philosophy. User can't see images and dashboard simultaneously. |
| **B. Panel section** — expands within the left panel, below facet filters | Stays within established architecture. Image list always visible. | Limited width (~280-400px). Charts would be tiny. Not enough room for 6+ widgets. |
| **C. Split view** — dashboard on top, image list below (or side by side) | Best of both: see distribution AND images. Can scroll through images that match a highlighted chart segment. | Complex layout. Competes for vertical space with toolbar + status bar. |
| **D. Overlay/modal** — triggered by a button, floats over the image list | Non-destructive. Can dismiss instantly. | Modal fatigue. Doesn't feel like a "place." |

**Leaning: A (full-page density)** with easy toggle back to table/grid. The
dashboard is a different *kind* of view, not just a different zoom level. It
deserves full screen. The density switcher would have: table | grid | dashboard.
When you click something in the dashboard, it applies the filter AND switches
to grid/table density — you land in the results immediately.

---

## Prior Art

### DAM Systems

**Adobe Bridge Filter Panel** — text-based faceted counts. Kupua already has
this (FacetFilters.tsx). The dashboard is the *visual* evolution: bars instead
of numbers, timelines instead of date pickers.

**Adobe Lightroom Library Filter (Metadata columns)** — stackable facet
columns with cross-filtering. Each column narrows the next. This is the
interaction model we want: click widget A → widget B updates.

**Getty Images internal tools** — Kibana dashboards over their ES indices.
Upload volume histograms, geographic heatmaps, trending topics. Analyst-facing,
not in the primary search UI. Making it *part of* the search flow is what
would differentiate kupua.

**Google Photos Explore** — ML-generated categories (People, Places, Things).
Discovery surface, but no aggregation analytics. The Places map is directly
applicable as a future widget.

### Analytics Dashboards

**Kibana** — The most relevant: same ES backend. Key patterns:
- **Click-to-filter**: click a bar → adds filter to global bar affecting all panels
- **Brush selection**: drag over time range → creates time filter
- **Cross-filtering**: all panels share the same filter context
- Kibana batches all panel aggs into parallel ES requests

**Grafana** — Template variables (≈ kupua's URL search params). Time range
selector as first-class control (kupua has since/until). Panel linking.

**Splunk** — Time-series first: every dashboard has a primary timeline.
Drilldown to events: click chart → see raw data. This "click to see the data"
is exactly what kupua needs.

**Bloomberg Terminal** — Information density for professionals. 6-8 tightly
packed panels per screen. The dashboard should be dense, not pretty.

### Academic Foundations

**Shneiderman (1996):** "Overview first, zoom and filter, then details-on-demand."
The dashboard IS the missing "overview" step.

**Hearst (2006):** Faceted navigation with counts reduces dead-end queries.
The dashboard extends this from text counts to visual distributions.

**Pirolli & Card (1999):** Information scent theory. A histogram showing
Reuters' upload pattern over 15 years has stronger scent than "Reuters (421)".

**Roberts (2007):** Coordinated Multiple Views. Cross-filtering works best
with 3-7 views; more than 7 creates cognitive overload. → **4-6 widgets max.**

---

## Widget Catalogue

### Tier 1 — High value, low risk, ES-native

| Widget | ES agg | Interaction | Cost |
|---|---|---|---|
| **Upload timeline** | `date_histogram` on `uploadTime` | Brush-select → sets `since`/`until` | 15-80ms |
| **Credit bar chart** | `terms` on `metadata.credit` | Click bar → CQL chip | 20-80ms |
| **Rights donut** | `terms` on `usageRights.category` | Click segment → filter | <20ms |
| **File type chips** | `terms` on `source.mimeType` | Click → filter | <10ms |
| **Boolean metrics** | `filters` agg (has crops, usages, rights) | Click metric → toggle | <20ms |
| **Headline stats** | `cardinality` + `stats` | Display only | <10ms |

### Tier 2 — Medium value, moderate complexity

| Widget | ES agg | Interaction |
|---|---|---|
| **Keyword cloud** | `terms` on `metadata.keywords`, size 50 | Click word → CQL |
| **Date-taken vs upload gap** | Two `date_histogram` overlaid | Brush on either |
| **Dimension buckets** | `range` on width/height (< 1MP, 1-5MP, etc.) | Click bucket → filter |
| **Uploader leaderboard** | `terms` on `uploadedBy`, size 20 | Click → filter |
| **Trending keywords** | `significant_terms` | Click → filter |

### Tier 3 — Defer

| Widget | Why defer |
|---|---|
| Geographic map | Needs geo_point mapping or map component |
| Credit × time heatmap | Expensive nested agg |
| Usage heatmap | Nested aggregation on usages array |
| Visual similarity clusters | knn search, not aggregation |

---

## ES Load Budget

The facet filter system (panels-plan.md §Aggregation Performance) established:
- 14 terms aggs batched = 50-300ms
- Lazy trigger (only when Filters section expanded)
- Query-keyed cache, 500ms debounce, circuit breaker at 2000ms

The dashboard would be heavier: terms + date_histogram + filters + cardinality
+ stats in one `size:0` request ≈ **100-500ms**. Same safeguards apply:
- **Lazy**: only when dashboard density is active
- **Cached**: by search params hash (same as facets)
- **Batched**: single ES request with all agg types (ES handles mixed aggs fine)
- **Circuit breaker**: same 2000ms threshold

**Should dashboard and facet filters share agg requests?** The `terms` aggs
overlap. When the user is in dashboard density with the left panel open showing
facet filters, there'd be redundant requests. Options:
1. Dashboard density hides the facet panel (forces it closed) — simplest
2. Dashboard agg response includes facet-compatible data, facets read from it
3. Accept the redundancy (it's one extra request, ES caches global ordinals)

Leaning toward #1: when in dashboard density, the left panel shows dashboard
controls (widget picker? time granularity?), not facets.

---

## Charting Library

| Library | Pros | Cons | Recommendation |
|---|---|---|---|
| **visx** (@airbnb) | Low-level D3+React. Maximum control. Small bundle. | More code per chart. | ✅ If we value control + bundle size |
| **Nivo** | Beautiful defaults. All chart types. React-native. | Heavier bundle. Less customisable. | ✅ If we value speed-to-pretty |
| **Recharts** | Simple API. Good for bar/line/pie. | Weak treemap/cloud/heatmap. | ❌ Too limited |
| **ECharts** | Extremely full-featured. Canvas. | Heavy. Imperative API. | ❌ Overkill |
| **Observable Plot** | Elegant. Grammar of graphics. | Imperative, poor React integration. | ❌ Wrong paradigm |

Whatever we pick: **lazy-load** (code-split the dashboard density). Most
sessions won't use it. Don't add charting weight to the main bundle.

---

## Interaction Model

### The feedback loop

```
Dashboard density (overview)
  ↓ click bar / brush timeline / click metric
  ↓ adds filter to CQL / sets date range
  ↓ ALL dashboard widgets update (cross-filtering)
  ↓ user sees refined distribution
  ↓ clicks "Show images" or switches to grid/table density
  ↓ sees the filtered images
  ↓ clicks Back or switches to dashboard density
  ↓ same filters still applied, dashboard shows same state
```

### URL integration

The dashboard density would use `density=dashboard` in the URL. All filters
are the same URL params as table/grid — `query`, `since`, `until`, `nonFree`,
etc. Switching from dashboard to grid preserves all filters. This is the
"Never Lost" principle applied to the dashboard.

### Cross-filtering detail

When the user clicks a credit bar, the dashboard doesn't just update that
one widget — *all* widgets re-aggregate with the new filter. This is how
Kibana works. It's the natural consequence of "the CQL query bar is the
global filter context."

Implementation: each click calls `updateSearch()` (same as table cell click
or facet filter click), which updates the URL, which triggers a new search
in the search store, which triggers dashboard agg re-fetch.

---

## Open Questions

1. **Should the dashboard be the default for empty search?** When a user
   opens kupua with no query, show the dashboard instead of an empty
   grid? This would make "what's in the library?" the default experience.
   Counter-argument: picture editors usually want "latest images" first.

2. **Should widgets be configurable?** Let users pick which 4-6 widgets
   they see? Or is a fixed set better (less decision fatigue, simpler
   implementation)?

3. **Should the dashboard respond to the scrubber?** If the user drags the
   scrubber to a position, should the dashboard update to show the
   distribution of images *near that position*? Probably not — the dashboard
   shows the *entire* filtered result set, not a window of it.

4. **How does brush-select on the timeline work with existing date filters?**
   If the user has `since=2024-01-01` and brushes a range in the histogram,
   does the brush replace the existing date filter or intersect with it?
   Probably replace — the brush is a more precise version of the same filter.

5. **Persistent layout across sessions?** Store which density was last used
   in localStorage (already done for table/grid).

---

## Prototype

See `exploration/mock/dashboard-prototype.html` — a static HTML file with
mock data that shows the proposed layout and widget types. Open it in a
browser to get a visual sense of what this density could look like.

The prototype uses:
- Inline SVG for charts (no library dependency)
- Mock aggregation data derived from the sample dataset's field distribution
- Kupua's colour theme (`--grid-*` CSS variables)
- The same dark background as the app
- Responsive layout that would fit within kupua's main content area

