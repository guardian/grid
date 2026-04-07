# Kupua — Frontend Philosophy

> **Created:** 2026-03-23
> **Status:** Living document — updated as we discuss and decide.
> **Purpose:** Frame the fundamental UX/UI thinking that guides kupua's design, separate from technical architecture. Not a spec — a philosophy.

---

## The Core Idea: One Ordered List, Many Densities

Kupua presents a single ordered list of images. Every view — table, thumbnail grid, single-image — is a **different density** of the same list. There is no "search page" and "image page" — there is one page with a density knob.

The density spectrum, from most-metadata to most-image:

| Density | What you see | What it's for |
|---|---|---|
| **Table (compact)** | Small rows, truncated fields, maximum rows on screen | Scanning metadata quickly, triage |
| **Table (comfortable)** | Taller rows, full Description visible, more breathing room | Reading metadata, quality checking descriptions |
| **Thumbnail grid (N per row)** | Image thumbnails in a grid, N across | Visual scanning, "I know it when I see it" |
| **Thumbnail grid (fewer per row)** | Larger thumbnails, 3→2 per row | Closer inspection, comparing a few candidates |
| **Side-by-side (2 per row)** | Two large images with metadata below | Direct visual comparison |
| **Single image (with panel)** | One image fills the main area, metadata panel beside it | Detailed review, editing metadata |
| **Single image (clean)** | Just the image, no chrome | Presentation, visual inspection |
| **Zoomed image** | Pan/zoom within one image | Checking sharpness, reading text in image |

The transition between any two adjacent levels should feel like a smooth zoom, not a page navigation. The user's position in the list is preserved — if you're looking at image #47 in the table, switching to grid view should show image #47 in roughly the same viewport position. At no point should user be looking at the data in flight when navigating, only cleanly at the start and end state (no flashes of intermediate internal app states).

### Context is Sacred — The "Never Lost" Principle

Because views are a continuum (not separate pages), **all user context must survive every density change.** This is an architectural line in the sand:

- **Focus** survives density changes. If image #47 is focused in the table, it stays focused in the grid, and vice versa.
- **Selection** survives density changes. If 5 images are selected in the table, switching to grid shows 5 selected images.
- **Edit state** survives density changes. If the metadata panel is open and the user is mid-edit on a description field, switching from table to grid should not discard the unsaved edit. The panel stays open, the field stays dirty, the cursor stays where it was. (This has implications for component lifecycle — the metadata panel must be mounted independently of the view component.)
- **Scroll position / "place in the list"** survives density changes. The focused or centred image should remain near the centre of the viewport after the transition.
- **Search context** is always visible. The user should always be able to see (or trivially reveal) what query, filters, and sort produced the current result set.

The user should **never** feel lost. Every transition should feel like zooming in or out on the same material, not like navigating to a different place.

#### What happens when the focused item leaves the result set?

This is the hard case: the user has image X focused (or selected, or under edit), and the search context changes such that image X is no longer in the new results. This happens when:
- The user (or a chip click) changes the query and re-searches
- A filter narrows the results and excludes the focused image
- New images push old ones past the loaded window (less likely with append-based loading)

The naïve approach is to **reset focus to the first result**. Most tools do this (Finder, Gmail search, kahuna). It's safe but disorienting — the user was looking at something specific, and now they're at the top of an unfamiliar list.

**We should do better.** The principle: **snap to the most adjacent surviving item from the previous result set.**

Algorithm sketch:
1. Before applying new results, remember the focused image's **position** (index) in the old result list, plus the IDs of its neighbours (e.g. ±5 items).
2. After new results arrive, check whether the focused image survived. If yes → keep focus, scroll to it. Done.
3. If the focused image is gone, scan its old neighbours (nearest first, alternating forward/backward) and find the first one that exists in the new result set. Focus that image and scroll to its new position.
4. If no neighbours survived either (completely disjoint result sets — e.g. the user typed an entirely different query), fall back to focusing the first result. This is fine — the context change was so large that adjacency is meaningless, and the user expects a fresh start.

**Why this matters:** Imagine a user is triaging images. They're focused on image #47, a photo credited to "Reuters". They shift-click the credit cell to narrow results to `credit:"Reuters"`. Image #47 happens to be credited to "AFP" (they clicked the wrong cell, or the column was showing a different field). The new results don't contain #47. Instead of dumping them at the top, kupua finds that #46 (which was also visible) is in the new results and focuses it. The user barely notices the context change — they're still "in the neighbourhood."

**For selection**, the same principle applies but differently: selected images that survive the new results stay selected. Selected images that don't survive are **silently dropped** from the selection (not flagged as errors — the user narrowed the results, those images are just out of scope now). If _all_ selected images are dropped, the selection is cleared. The metadata panel should reflect the updated selection immediately. No toast, no modal, no "3 images were removed from your selection" — that's noise. The count in the panel is sufficient signal.

**For edit state**, if the user is mid-edit on an image that leaves the result set, this is genuinely tricky. Options:
- **Discard silently**: loses work. Bad.
- **Warn and let them save or discard**: modal interruption. Tolerable but annoying during fast triage.
- **Keep the edit panel pinned to the image even though it's not in results**: the image is still in ES, still editable — it's just not matched by the current query. The panel could show a subtle indicator ("this image is not in current results") and let the user finish editing, then dismiss. This is the least disruptive option and worth exploring.

This is a hard UX problem with no perfect answer. The guiding principle is: **the user should always know what they're looking at, and context changes should feel like refinements, not resets.**

### Density is not View Mode

Traditional DAMs treat "list view" and "grid view" as discrete modes with a toggle button. We reject this. The progression from table → grid → single image is a **continuum**, and the control should reflect that — a slider or progressive keyboard shortcut, not a binary switch.

That said, the first implementation will likely have discrete stops (table, grid, image). The slider is aspirational. The architecture should not prevent it.

---

## Interaction Principles

### 1. Click means Search, Edit is a Deliberate Mode

A metadata value in kupua is, by default, a **search link**. Click the credit "Getty Images" and you get `credit:"Getty Images"` added to your search. This is already how kahuna works for most fields in the Info panel — values are `<a>` tags that launch searches.

**This applies to the table too.** Clicking a cell value in a table row should add that value as a search chip. Shift-click appends, Alt-click excludes. This is already implemented.

But we also need editing. These two interactions conflict — you can't click-to-search and click-to-edit the same element.

**Resolution: Edit mode is separate and explicit.**

Options we've considered:

| Pattern | Pros | Cons |
|---|---|---|
| **Kahuna's hover-pencil** — a small ✏️ icon appears on hover next to editable values. Click the pencil to enter edit mode for that field. | Known to users, minimal UI footprint, doesn't interfere with click-to-search. | Discoverable only by accident. Hover doesn't exist on touch devices. The pencil target is small. |
| **Double-click to edit** — like a spreadsheet. | Familiar from Excel/Sheets. Large target. | Conflicts with double-click-to-open-image in the table. Could work in the metadata panel. |
| **Explicit Edit button** — a toolbar button that toggles the whole panel into edit mode. | Clear separation of intent. All fields become editable at once. | Extra click. Doesn't support quick one-field edits. |
| **Inline edit on focus** — tab into a field or click an "edit" icon next to it, and it becomes an input. | Accessible. Clear intent. | Requires visible affordance for each editable field. |

**Current leaning:** Kahuna's hover-pencil pattern for single-image metadata panel, because it's known to users and doesn't block click-to-search. For the table, editing is deferred — table cells remain read-only search links for now. If we find something better than hover-pencil, we'll switch. We cannot have less functionality than kahuna.

### 2. Click-to-Search is Rich

Clicking a metadata value to search for it is the primary interaction pattern. It must be powerful:

- **Click** a value: launches a fresh search for `key:value` (replaces current query — same as kahuna's info-panel links).
- **Shift-click** a value: appends `+key:value` to the current query (AND — narrows results). Already implemented for table cells.
- **Alt-click** a value: appends `-key:value` to the current query (NOT — excludes). Already implemented for table cells.
- **Click an already-active chip** with opposite polarity: flips it in-place (e.g. `+credit:"Getty"` → `-credit:"Getty"`). Already implemented.

The plain-click-to-fresh-search variant exists in kahuna's Info panel but not in kupua yet. We need it — it's the most natural "I want images like this one" gesture.

### 3. Selection is Not Focus

Kupua has two distinct concepts for "which image am I looking at":

- **Focus** (single, ephemeral): Which image has the highlight? One image at a time. Set by single-click in table, arrow keys, returning from image detail. Used for keyboard navigation and visual tracking. Already implemented.

- **Selection** (multi, persistent): Which images are checked for batch operations? Zero or more images. Set by checkbox-click, shift-click-range, Cmd/Ctrl-click-toggle. Used for batch metadata editing, batch download, batch add-to-collection, batch rights changes.

Kahuna supports selection — the Info panel shows common metadata across selected images, with "Multiple descriptions (click ✎ to edit all)" when values differ. We need this too.

**Selection must be orthogonal to focus.** Selecting 5 images and then pressing ↓ to move focus shouldn't clear the selection. Selecting images in the table and switching to grid view should preserve the selection. This is a specific instance of the **"Never Lost" principle** (see above) — focus, selection, edit state, and scroll position all survive density/view changes. When search context changes, selected images that leave the result set are silently dropped from the selection (see "Never Lost" for the full algorithm).

**Selection is not in the URL** (matching kahuna — only `ids=` from the Share button represents a selection-like concept in the URL, and that's a different thing).

### 4. The Metadata Panel is Shared

Kahuna has a metadata panel that appears both on the search page (the Info panel on the right side, for selected images) and on the image view page. The panel is similar but not identical in both contexts.

Kupua should have **one metadata panel component** that adapts to context:

- **On the search/grid page:** Shows common metadata for selected images. When one image is focused (but not selected), shows that image's metadata. Editing affects all selected images.
- **On the single-image view:** Shows that image's metadata. Editing affects that one image.
- **When multiple images are selected:** Shows shared values, flags differences ("Multiple values"), offers batch-edit via pencil icon.

The panel is always available — it doesn't require a separate page or route change. It slides in from the side or is always visible depending on screen width.

### 5. The Table is a Power Tool, Not the Default

Most users will want the thumbnail grid — it's more natural for a visual medium. The table is for power users who need to scan, sort, and filter metadata at speed.

The default view for new users should probably be the thumbnail grid. But kupua currently only has the table. This is fine for now — the table is the harder view to build, and it exercises all the metadata/sort/filter machinery. The grid view is simpler to add later.

When the grid view exists, the default density should be configurable (localStorage) and the last-used density should be remembered.

### 6. Actions are Written Once

Grid has action buttons — Crop, Download, Archive, Delete, Share, Add to Collection, Set Rights, etc. In kahuna, the components already accept an `images` array (e.g. `<gr-delete-image images="[ctrl.image]">` for single, `images="ctrl.selectedImages"` for multi). But they're still **instantiated separately** in the image view toolbar, the search results toolbar, the upload page, and the metadata panel — each with slightly different wiring, visibility conditions, and styling.

Kupua should write each action **once** as a context-adaptive component:

```
<ActionBar images={targetImages} context={context} />
```

Where `targetImages` is derived from the current state:
- **Single image focused, nothing selected** → `[focusedImage]`
- **Single image selected** → `[selectedImage]`
- **Multiple images selected** → `selectedImages[]`
- **In single-image detail view** → `[currentImage]`

The `ActionBar` renders the appropriate buttons based on the images and context. Each action button receives the same `images` array. The button's label adapts ("Delete" vs "Delete 5 images"), its enabled state adapts (can't crop multiple images), and its confirmation dialog adapts — but the core logic is identical.

**This follows directly from the density continuum.** If every view is a different density of the same list, actions on that list must not depend on which density the user is in. The user should not have to remember "I can delete from here but not from there." The action bar is another element (like focus, selection, and the metadata panel) that is **orthogonal to view density** and mounted independently.

Kahuna's pattern of `images` as an array input is the right abstraction — kupua should formalise it. The action bar should be a single component rendered in a stable position (e.g. the toolbar area that persists across density changes), not duplicated per view.

---

## Comparison to Existing Tools

### Adobe Lightroom (Classic & CC)

- **Library module** — toggles between grid, loupe (single image), compare (2 images), survey (N images). The filmstrip (horizontal scrolling row of thumbnails) is always visible at the bottom.
- **Grid** — thumbnails with configurable cell size (slider). Metadata overlay per cell (badge icons for ratings, labels, flags).
- **Loupe** — single image with metadata panel. Zoom on scroll/click.
- **Compare** — two images side by side, synchronised zoom.
- **Survey** — N selected images visible simultaneously.
- **Metadata panel** — always on the right. Shows fields for the selected image(s). Multi-select shows shared values with "< mixed >" indicator and batch-edit.
- **Filtering** — library filter bar (text, attribute flags, metadata columns, presets). Not chip-based.
- **Editing:** click a field value in metadata panel to edit it. Not a separate mode.

**Takeaway:** Lightroom's filmstrip is a great "persistent context" element — you never lose your place. The grid slider is the gold standard for density control. Compare and Survey are powerful for editorial decision-making.

### Google Photos

- **Grid** — variable-row-height thumbnail grid grouped by date. Scroll is mapped to a timeline scrubber on the right edge.
- **Single image** — swipe/arrow between images. Metadata in an expandable info panel.
- **Selection** — long-press or click circle overlay on thumbnail. Shift-click for range. Blue checkmarks.
- **Search** — text search + suggested chips (people, places, things). Not structured/CQL.

**Takeaway:** The timeline scrubber is brilliant. The variable-row-height grid (justified layout) is beautiful but complex. Selection via overlay checkboxes (not altering the click behaviour of the image) is clean — click still opens the image, checkbox selects.

### Darktable / Ansel

- **Lighttable** — pure thumbnail grid with a filmstrip. Extensive keyboard shortcuts. Rating/colour labels.
- **Darkroom** — single image editing.
- **Culling** — compare N images.
- **Ansel** ([ansel.photos](https://ansel.photos/en/)) — a fork by darktable's former lead dev. Reworked the lighttable to fix a UX problem directly relevant to us: darktable's "zoomable" lighttable changed grid density *and* metadata overlays simultaneously in non-obvious ways. Ansel made the density→information mapping more predictable and linear. Also aggressively pruned redundant modules — a reminder that carrying forward every legacy feature without curation makes software worse.

**Takeaway:** Keyboard-first design is powerful for professionals. Rating workflows (flag/reject/star) during triage are fast and addictive. Ansel validates our density continuum concept but warns that the mapping between zoom level and what information is shown must be predictable and learnable — no surprise mode changes as you zoom.

### macOS Finder / Windows Explorer

- **List view** — sortable columns, resizable. Click header to sort. Shift-click for secondary sort.
- **Column view** (Finder) — hierarchical drill-down. Not relevant to us.
- **Gallery/Icon view** — thumbnails with size slider.
- **Quick Look** — press Space to preview without opening. Close with Space or Escape.

**Takeaway:** Quick Look is an interesting idea — a lightweight preview without committing to the full image view. In kupua, the image detail overlay already partially serves this purpose (it's not a full page navigation). But a true Quick Look (press Space on focused row to see a large preview, press again to dismiss) could be very fast for triage.

### Notion / Airtable

- **Table view** — cells are directly editable (click to type). Expand row for full record view.
- **Gallery view** — cards with cover image + summary fields.
- **Views are saved** — each view has its own sort, filter, visible columns. You can have multiple views of the same data.

**Takeaway:** Saved views are powerful for team workflows. "My triage view" with specific columns/sort vs. "Rights review view" with different columns. Could be a later feature.

---

## Answered Questions

1. **~~Should the grid view use a justified layout or a fixed-cell grid?~~** **Answered — undecided, leaning fixed grid.** Kahuna's fixed grid is more familiar to professional users; Google Photos' justified layout is more consumer/amateur-friendly. Not ruling anything out — keeping the architecture flexible for either. Justified is harder to build and virtualise; fixed gives predictable cell positions for keyboard navigation.

2. **~~Should we have a filmstrip?~~** **Answered — yes, and it's a density peek.** The filmstrip fits naturally into the continuum model: it's a narrow viewport into the grid density, rendered within the single-image density. Lightroom's filmstrip is the gold standard for "you never lose your place." Kahuna tried this three times and never merged it — see "Kahuna Filmstrip / Image Traversal History" below for the full analysis. Kupua's architecture (overlay, shared store, URL param replacement) already solves the problems that blocked kahuna.

3. **~~What's the right density control?~~** **Answered — both slider and keyboard shortcuts.** Keyboard shortcuts (`-`/`+` or similar) are essential for power users. The slider needs careful design — learn from Lightroom's success and Ansel's lighttable rework (where density + metadata overlay changed in non-obvious ways). Saveable/named views (Notion/Airtable style) are an interesting distant-future idea.

4. **~~Quick Look (Space bar preview)?~~** **Answered — yes, with caveats.** Space conflicts with browser's native space-to-scroll. Options: (a) sacrifice browser scroll (we have PgUp/PgDown), (b) use a modifier key (e.g. Shift+Space), (c) only intercept Space when a row is focused (not when the search box has focus). The interaction is very fast for triage — worth exploring. Has been thought about before in the kahuna context.

5. **~~How do selections interact with density changes?~~** **Answered.** Yes, they survive — selection, focus, edit state, and scroll position all persist across density/view changes. This is the "Never Lost" principle. When the search context changes, surviving selections are kept and missing ones are silently dropped. See the "Context is Sacred" section above.

---

## Kahuna Filmstrip / Image Traversal History

Kahuna attempted filmstrip-style image traversal (prev/next through search results from within the single-image view) at least three times. None merged. The history is instructive for kupua.

### Attempt 1: `gu-lazy-preview` (eelpie fork)

Branch: `eelpie/restore-preview-fix-blocking` · PR: [#4574](https://github.com/guardian/grid/pull/4574)

Bolted a `gu-lazy-preview` component onto the search results page — a full-viewport overlay with prev/next buttons, rendered *inside* the search route. Used RxJS observables to track `currentIndex$` against the lazy-loaded `imagesAll` array, with range-loading triggered when the user navigated past the loaded window.

**Why it failed:** The preview was a separate component layered on top of `gu-lazy-table`, not integrated with it. Selecting images from preview mode required duplicating selection logic. The `imagesAll` sparse array (used by the infinite scroll grid) was shared by reference, but the preview's index tracking and the grid's scroll position were independent — navigating in the preview didn't update where you'd land when closing it. The feature was eventually removed from mainline because it caused blocking bugs and couldn't be fixed without deeper architectural changes.

### Attempt 2: `sc-next-next-next` (main filmstrip attempt)

Branch: `sc-next-next-next` · PR: [#2949](https://github.com/guardian/grid/pull/2949)

Extracted search logic from `results.js` into a shared `imagesService` (Angular factory) so both the search results controller and the image controller could access the same result set. Added `getImageOffset(id, offset)` to navigate relative to the current image. The image controller gained prev/next via left/right arrow keys and `$state.go('image', {imageId: adjacentImage.data.id})`.

**Key insight:** This was architecturally the right idea — shared state between search and image view. But AngularJS's `ui-router` destroyed and recreated controllers on state transitions. Every `$state.go('image', ...)` re-resolved the image from the API, re-instantiated the controller, re-rendered the template. The filmstrip was an `ng-repeat` over the shared `images` array, re-rendered on every image change. No scroll position preservation, no transition animation, just a full teardown/rebuild.

### Attempt 3: `rm/revive-prev-next-image` (filmstrip + shared service)

Branch: `rm/revive-prev-next-image` · PR: [#4573](https://github.com/guardian/grid/pull/4573)

Built on top of attempt 2's `imagesService`. Added a proper filmstrip UI: a horizontal scrolling `<ul>` of thumbnail `<li>` elements at the bottom of the image view, with the current image highlighted (`data-filmstrip-selected`), auto-scrolled into view via `scrollIntoView({inline: 'center'})`. Added show/hide toggle and prev/next buttons flanking the filmstrip. Restructured `view.html` from float-based layout to flexbox (`image-view` → `image-main` + `image-filmstrip__container`).

**Why it didn't merge:** The `$state.go` problem from attempt 2 remained — every prev/next was a full route transition. The filmstrip re-rendered all thumbnails on each navigation (no virtualisation). The `imagesService` held the result array in a module-level closure, creating subtle lifecycle bugs when navigating between different searches. The CSS restructuring (float → flexbox) touched 2400+ lines of `main.css` making review difficult. The branch diverged too far from main to be mergeable.

### Lessons for Kupua

1. **Shared state is essential but must be a proper store, not a closure.** Kahuna's `imagesService` was the right idea (shared result set between views) but implemented as an Angular factory with module-level `let` variables. Kupua already has this right — Zustand store with `results[]` accessible from any component.

2. **View transitions must not destroy state.** All three attempts suffered from `ui-router` destroying the previous view's controller. Kupua already solves this — image detail is an overlay within the search route (`opacity-0`, not unmount), and React reconciles the same component when only the `image` prop changes.

3. **The filmstrip is a density peek.** In our continuum model, the filmstrip is a narrow viewport into the grid density, rendered within the single-image density. It doesn't need its own data source or index tracking — it reads from the same `results[]` array and scrolls to keep the current image centred. Virtualised (only render visible thumbnails ± buffer) to avoid the `ng-repeat` performance cliff.

4. **Navigation must be state replacement, not route transition.** Kupua already does this — prev/next replaces the `image` URL param (no push), so the search page stays mounted and back always returns to the table.

---

## Non-Negotiables

These are features kupua must have at parity, regardless of how they're implemented:

- **Multi-select with batch metadata editing** — the core editorial workflow.
- **Click-to-search from metadata values** — the core discovery workflow.
- **Edit mode for metadata** — at least as capable as kahuna's hover-pencil pattern.
- **Collections** — browse, add to, remove from. Tree structure.
- **Usage rights management** — categorise, set rights, set leases.
- **Crops** — view existing crops, create new crops, download.
- **Keyboard navigation** — arrow keys, enter, escape, home/end, page up/down.
- **URL reflects state** — every search, filter, sort, viewed image is bookmarkable and shareable.
- **Fullscreen** — for presentation and detailed inspection.

---

## The Table Question

You've raised an interesting question: should the table ever support editing directly in cells (like a spreadsheet)?

Arguments for:
- It's the fastest workflow for power users — see a wrong credit, fix it in place.
- Spreadsheet UX is universally understood.
- Batch editing across visible rows is natural (select range, type, apply to all).

Arguments against:
- Click-to-search conflicts with click-to-edit (the dominant interaction pattern is search).
- Cell editing in a virtualised table is complex (the cell might be unmounted when you scroll away mid-edit).
- Metadata validation (required fields, rights categories, date formats) needs form UI that doesn't fit in a narrow table cell.
- Kahuna doesn't do this — it's not a parity concern, it's a new feature.

**Current position:** Table cells are read-only search links. Editing happens in the metadata panel (for focused or selected images). This matches kahuna's separation of concerns and avoids the click-to-search vs click-to-edit conflict. If users demand inline editing, we can revisit — the architecture doesn't prevent it, but the interaction design needs careful thought.

---

## Discovery: Beyond Search

### The scale problem

Grid's production index holds ~9M images (peaked at 55M before retention policies). It ingests up to ~60k images per day. Some users still expect to see "all images from today" — a firehose that search alone cannot tame. Kahuna offers powerful structured search (CQL, filters, sort) but is poor at **discovery** — helping users understand what's in the collection, spot patterns, find things they didn't know to search for.

Search answers "show me X." Discovery answers "what's here?" and "what's interesting?" They are complementary; kupua needs both.

### Phase 1: Faceted filters (aggregation panels)

The most immediate win is **faceted filtering** — a panel (collapsible sidebar or dropdown) that lists the values of key fields ranked by document count within the current search context. This is standard in Lightroom (Library Filter → Metadata columns), Adobe Bridge (Filter panel), and every e-commerce site.

Example: the user searches `cats`. The Filters panel shows:

| Field | Top values (count) |
|---|---|
| **Credit** | Getty Images (342) · Reuters (218) · PA (87) · AFP (65) · … |
| **Source** | Rex Features (401) · AP (189) · Shutterstock (98) · … |
| **Uploaded by** | jane.doe (55) · john.smith (42) · … |
| **Rights category** | Staff Photographer (128) · Agency (512) · Handout (33) · … |
| **File type** | JPEG (680) · PNG (12) · TIFF (3) · … |

Clicking a value narrows the search (appends a CQL chip). The counts update live. This is powered by ES `terms` aggregations — the DAL already has `getAggregation()` and the typeahead system already uses terms aggs on keyword fields.

**Dependency on mapping enhancements:** Today, fields like `byline`, `city`, and `country` are mapped as `text` only — no `.keyword` sub-field. Terms aggregations require `keyword` type. The mapping enhancements documented in `mapping-enhancements.md` (§2a: add `.keyword` sub-fields to name/place fields) would unlock aggregation on these fields. This is a Grid-wide change (modifying `Mappings.scala` + re-index), not kupua-only — needs team buy-in and careful rollout on the production cluster.

For fields that already have `keyword` mappings (credit, source, uploadedBy, usageRights.category, source.mimeType), faceted filters can ship with no backend changes.

### Future: richer discovery

Aggregations are the foundation, but there's much more:

- **Date histograms** — visualise the distribution of images over time (upload date, date taken). A sparkline or bar chart above the results showing density by week/month. Click a bar to filter to that period. ES `date_histogram` aggregation makes this trivial.
- **Geographic clustering** — images with GPS coordinates (subLocation, city, country) plotted on a map. Cluster markers sized by count. Click to filter. Requires a map component but no backend changes (geo fields already exist).
- **Credit/source network** — which sources contribute to which topics? A treemap or bubble chart of credit × subject cross-tabulation. ES `multi_terms` or `composite` aggregations.
- **Usage patterns** — which images are most used, most cropped, most shared? Requires usage data (already in the index as `usages`).
- **Visual similarity** — "more like this image" using the existing `embedding.cohereEmbedEnglishV3.image` 1024-dim dense vector field. ES `knn` search. Already in the mapping, just not surfaced in the UI.
- **Trending** — what subjects/credits/sources are unusually frequent today vs. the 30-day baseline? Requires a `significant_terms` aggregation or a simple comparison of today's aggs vs. a cached historical baseline.

These are all read-only, ES-native features. They don't require Grid API changes — only kupua frontend work and (for some) the mapping enhancements. The production system changes needed for mapping enhancements are documented in `mapping-enhancements.md` and will require careful coordination.

### Relationship to search

Discovery and search are not separate modes — they're different entry points into the same result set. Clicking a facet value adds a search chip. Hovering over a histogram bar previews the narrowed count. The Filters panel reflects the current search context — it shows what's *in* the current results, not what's in the entire index (unless the search is empty).

This means the Filters panel must re-aggregate on every search change. For 9M docs, terms aggregations on keyword fields are fast (~10-50ms). For text fields that need `.keyword` sub-fields, this depends on the mapping enhancements.

---

## Summary

Kupua is not "kahuna but in React." It's a rethinking of how a photo editor interacts with a 9-million-image library, informed by the best ideas from Lightroom, Google Photos, Finder, and spreadsheets — but constrained by the specific needs of The Guardian's editorial workflow. The density continuum is the organising principle. Click-to-search is the primary interaction. Selection and editing are deliberate, explicit, and powerful.













