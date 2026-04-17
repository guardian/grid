# Kupua Grid View — Plan & Analysis

> **Created:** March 2026
> **Status:** Implemented — `ImageGrid.tsx` is live. This doc remains as reference
> for the kahuna analysis, design decisions, and architecture stress test results.
> **Purpose:** Everything a fresh agent needs to understand the grid (thumbnail) view.

---

## Why This Exists

Kupua currently has one density: the table. The grid view is the first
additional density and the real test of the "one ordered list, many
densities" architecture from `frontend-philosophy.md`.

The grid view must reuse the same data layer (`useDataWindow`), focus
system (`focusedImageId`), keyboard navigation concepts, and search
context as the table — just with different rendering geometry. If
building the grid requires duplicating significant logic from
`ImageTable.tsx`, the architecture has failed.

---

## What the Grid View IS

A responsive grid of image thumbnails. Each cell shows:
- **Thumbnail image** (S3 thumbnail, `object-fit: contain`)
- **Description** — single line, truncated, always visible. Rich tooltip
  on both thumbnail and description: description + "By:" + "Credit:"
  with `[none]` fallbacks, whitespace-aligned (matching kahuna).
- **Upload date** — "Uploaded: d MMM yyyy, HH:mm" (matches kahuna format).
  Tooltip shows all three dates: Uploaded, Taken, Modified.
  Visible text switches between Uploaded/Taken based on sort order.
- **Focus highlight** (matching table's focus concept)
- **Placeholder skeleton** for unloaded slots

**Fixed equal-size cells.** All cells are the same dimensions regardless of
image aspect ratio. This is a deliberate editorial decision: differently-sized
cells could unconsciously influence picture editors' choices. Images are
centred within the cell via `object-fit: contain` (letterboxed, no cropping).

It is NOT a separate page or mode — it's an alternative rendering of
the same result set the table shows. Switching between table and grid
preserves: focus, scroll position (approximate — the focused image
stays visible), search context, and all URL state.

### What's explicitly OUT of v1

These kahuna features are intentionally skipped for now:

- Collections panel / collection chips
- Graphic image blur
- GNM-owned / Agency Picks border styles
- Crop button on hover
- "Mark as seen" / seen state
- "Pop out in new window" button
- Selection mode / checkboxes / batch actions
- Archive status icon
- Syndication status icons
- Usage status icons (print/digital)
- Cost indicators (£/flag/warning)
- Labels / label editor
- Drag-and-drop

---

## Kahuna's Grid View — What It Does

Source files analysed:
- `kahuna/public/js/search/results.html` — grid template
- `kahuna/public/js/search/results.js` (875 lines) — results controller
- `kahuna/public/js/components/gu-lazy-table/gu-lazy-table.js` (358 lines) — layout engine
- `kahuna/public/js/components/gu-lazy-table/gu-lazy-table-cell.js` (41 lines) — cell positioning
- `kahuna/public/js/components/gu-lazy-table/gu-lazy-table-placeholder.js` (37 lines) — placeholder positioning
- `kahuna/public/js/components/gu-lazy-table-shortcuts/gu-lazy-table-shortcuts.js` (64 lines) — keyboard
- `kahuna/public/js/preview/image.js` (190 lines) + `image.html` (203 lines) — cell content
- `kahuna/public/stylesheets/main.css` — result/preview styles

### Layout

- **Fixed cell height: 303px.** Not proportional to image aspect ratio.
- **Responsive columns:** `columns = floor(containerWidth / cellMinWidth)`,
  where `cellMinWidth = 280px`. On a 1440px-wide viewport → 5 columns.
  Cell width = `floor(containerWidth / columns)` — equal-width cells.
- **Absolute positioning:** Each cell is `position: absolute` with computed
  `top`, `left`, `width`, `height` from the reactive RxJS pipeline.
  The container has `position: relative` and explicit `height` set to
  `rows × cellHeight`.
- **Visibility toggling, not virtualisation:** Cells outside a generous
  viewport band get `display: none` but their Angular scopes stay alive.
  Transcluded content is conditionally included via `ng-if="visible"`.
  This is the primary performance problem at scale.

### Cell Composition (per thumbnail)

Each cell (`<li>` in `results.html` → `<ui-preview-image>` → `image.html`) contains:

1. **Thumbnail image** — `<img ng-src="image.data.thumbnail | assetFile">`.
   Uses the pre-generated S3 thumbnail (typically 460px wide), not imgproxy.
   The thumbnail URL comes from the Grid API response — `image.data.thumbnail`
   contains `{ secureUrl, file }`.
   - CSS: `max-width: 100%; max-height: 98%; margin: 0 auto; display: block`
   - Centred horizontally, constrained to cell dimensions
   - Staff photographer images get a distinct border style
   - "Agency pick" images get a different style

2. **Graphic image blur** — potentially graphic images (determined by a
   service) are blurred with CSS `filter: blur(15px)` and a text overlay
   "POTENTIALLY GRAPHIC IMAGE (hover to reveal)". Hover removes the blur.

3. **Selection checkbox** — top-left corner, visible on hover. Two separate
   `<input type="checkbox">` elements (selected vs not-selected) to avoid
   adding properties to the image object. Uses `ng-if` to swap between them.

4. **Action icons** — visible on hover. "Pop out" (open in new tab),
   "Crop" (if image is valid). Rendered as a `<ul class="image-actions">`.

5. **Fade overlay** — `<div class="preview__fade">` shown on hover,
   provides a darkened backdrop for the action icons.

6. **Info panel** — bottom portion of cell, always visible (not on hover):
   - **Collections** — coloured chips, clickable to filter by collection
   - **Labels** — compact label editor
   - **Description** — single line, truncated. Tooltip shows full text +
     byline + credit.

7. **Bottom bar** — metadata strip at very bottom:
   - **Upload time** OR **Date taken** (switches based on sort order)
   - **Status icons** (right-aligned): crop indicator, print usage,
     digital usage, cost indicator (£/flag/warning), syndication icon,
     archive status

8. **Warning overlays** — conditional alert/warning/lease overlays that
   replace the normal view when rights flags are active.

9. **"Seen" state** — `opacity: 0.5` for images the user has marked as
   seen (via "Mark as seen" eye icon). Persisted to localStorage per query.

### Interactions

- **Click image** → navigate to image detail (`ui-sref="image({imageId})"`)
  — full route transition, not an overlay. Kahuna loses scroll position here
  (has workaround via `scrollPosition.save/resume`).
- **Click in selection mode** → toggle selection. Shift-click → range select.
  Selection mode activates when ≥1 image is selected (via checkbox).
- **Click collection chip** → search for that collection path.
- **Click label** → search for that label.
- **Drag image** → drag-and-drop (for embedding in Composer etc.)

### Keyboard Navigation

Kahuna's grid keyboard nav is **scroll-based, not focus-based:**
- Arrow Up/Down: scroll by one row height
- PageUp/PageDown: scroll by viewport height
- Home/End: scroll to start/end

There is NO focused cell concept — arrows don't move between specific
images. The keyboard just scrolls the viewport. This is notably inferior
to kupua's focus-based navigation in the table view.

### Selection

- **Toggle via checkbox** (top-left of cell, visible on hover)
- **Range select** via shift-click (selects all images between last
  selected and clicked image)
- **Selection mode** — when ≥1 image is selected, clicking an image
  toggles selection instead of navigating. The toolbar shows batch
  action buttons (Download, Delete, Archive, etc.)
- Selection is tracked by image URI in an RxJS `Set`-like structure
  (`selection.items$`)

### Scroll Position Preservation

- `scrollPosition.save()` called on scope destroy (leaving results page)
- `scrollPosition.resume()` called on `gu-lazy-table:height-changed` event
- Attempts resume twice (immediate + 30ms delay) to handle navigation timing
- State is per-`$stateParams` — different searches have different positions

---

## What Kupua's Grid Should Take from Kahuna

### Take: S3 thumbnails for grid cells

Kahuna uses pre-existing S3 thumbnails (`image.data.thumbnail`) — not
imgproxy. These are small (~460px wide), already exist for every image,
and are served via CloudFront/S3 (fast CDN). Kupua already has
`getThumbnailUrl()` in `image-urls.ts` and the S3 proxy infrastructure.

**No need for imgproxy-sized images in the grid.** S3 thumbnails are
perfectly adequate at the grid cell sizes we'll use (280-400px wide).

### Take: responsive column count from container width

`columns = floor(containerWidth / cellMinWidth)` is the right approach.
Kupua should observe the container width (via `ResizeObserver`) and
derive columns. TanStack Virtual supports this directly — set
`count = rows`, `estimateSize = () => rowHeight`, and compute row
membership from column count.

### Take: cell composition hierarchy (simplified)

Kahuna's cells have 9 layers (thumbnail, blur, checkbox, actions, fade,
info panel, bottom bar, overlays, seen state). Kupua v1 needs only:
thumbnail + description + date + focus highlight. The hierarchy is
correct — image dominates, metadata below — but stripped to essentials.

### Take: fixed equal cell height

Equal-size cells prevent differently-sized images from unconsciously
influencing editorial choices. 303px is kahuna's value — kupua may
adjust, but the principle (all cells identical) is confirmed. Use
`object-fit: contain` (centred, letterboxed) not `object-fit: cover`
(cropped). TanStack Virtual's fixed-size mode supports this directly.

### Don't take: visibility toggling

Kupua already has true virtualisation via TanStack Virtual. Only DOM
nodes for visible + overscan cells will exist. This is strictly better.

### Don't take: scroll-only keyboard navigation

Kahuna's grid has no concept of a focused cell — arrows just scroll.
Kupua's focus-based navigation is far superior. The grid view should
get focus-aware arrow navigation: left/right move between cells in a
row, up/down move between rows.

### Don't take: full route navigation for image click

Kahuna navigates to a separate image route (losing scroll context).
Kupua's overlay architecture already solves this — double-click opens
the image detail overlay, back returns to the grid at the same position.

---

## What Kupua Must Build

### 1. `ImageGrid.tsx` — the grid density component

New component consuming `useDataWindow()` for data. Uses TanStack Virtual
for virtualisation (consistency with ImageTable — same gap detection,
same `reportVisibleRange` pattern). Responsive column count via
`ResizeObserver` on the scroll container.

**Cell content (v1):**
- **Thumbnail** — S3 thumbnail via `getThumbnailUrl()`. `object-fit: contain`
  to centre within fixed-size cell without cropping. Dark background
  behind the image (matches kupua's dark theme, provides contrast for
  letterbox areas). `title` tooltip shows the rich description tooltip
  (same as on the description text — see below).
- **Description** — single line, truncated (`truncate` / `text-overflow:
  ellipsis`). Always visible, positioned below the thumbnail area.
  `title` tooltip shows rich format matching kahuna's description area:
  ```
  {description || title}
        By: {byline || '[none]'}
  Credit: {credit  || '[none]'}
  ```
  (whitespace-aligned, `By:` and `Credit:` indented under the text).
  Both the thumbnail and description areas use this same tooltip.
  Uses `image.metadata?.description` (same accessor as table's
  `metadata_description` field).
- **Upload date** — "Uploaded: d MMM yyyy, HH:mm". Always visible,
  below description. Matches kahuna's format. Uses `image.uploadTime`.
  `title` tooltip shows all three dates (extending kahuna which shows two):
  ```
  Uploaded: {uploadTime formatted}
     Taken: {dateTaken formatted || '[none]'}
  Modified: {lastModified formatted || '[none]'}
  ```
  The visible date text switches based on sort order (upload vs taken),
  matching kahuna. The tooltip always shows all three regardless of sort.
- **Focus highlight** — border or outline on the focused cell, matching
  the table's focus row highlight.
- **Placeholder skeleton** — `animate-pulse` skeleton for unloaded slots
  (same pattern as table placeholder rows).

**No hover overlays, no action buttons, no status icons for v1.**

**Local mode (no S3 proxy):** thumbnails are unavailable — cells will
just show the metadata text (description + date) without an image. This
is fine for local development; the grid is primarily useful against
TEST/PROD data where thumbnails are available.

### 2. Density switch (URL param `density=table|grid`)

A new URL param (display-only — doesn't affect search) to toggle
between densities. Simple toggle button in the toolbar for v1 (no
keyboard shortcut, no slider). Add `density` to `URL_DISPLAY_KEYS` so
switching doesn't trigger a search reset or scroll reset.

### 3. Keyboard navigation with grid geometry

`moveFocus` currently takes `delta: number` — works for table
(`columnsPerRow: 1`). Grid needs:
- Arrow left/right: `delta = ±1` (same as table)
- Arrow up/down: `delta = ±columnsPerRow`
- PageUp/PageDown: `delta = ±(columnsPerRow × rowsPerPage)`
- Home/End: first/last image

This is where `useListNavigation` extraction naturally happens — the
hook takes geometry callbacks and produces `moveFocus`, `pageFocus`,
`home`, `end`. Table passes `columnsPerRow: 1`. Grid passes
`columnsPerRow: N`.

### 4. Focus preservation across density switch

When switching from table (focused on image #47) to grid, the grid
virtualizer must scroll to image #47. `focusedImageId` +
`findImageIndex` already provide this — the grid just calls
`virtualizer.scrollToIndex(findImageIndex(focusedImageId))` on mount.

**Implemented:** Both `ImageGrid` and `ImageTable` use a `useLayoutEffect`
(synchronous before browser paint) to scroll to the focused image on mount.
This means switching density is seamless — no visible jump, no extra DOM cost
from keeping both views mounted. The grid effect computes columns directly
from `el.clientWidth` (not React state) because ResizeObserver hasn't fired
at useLayoutEffect time.

**Viewport position preservation:** The relative vertical position of the
focused item within the viewport is preserved across density switches via
`density-focus.ts` — a 5-line module-level bridge (no React, no Zustand).
On unmount, each density saves `(rowTop - scrollTop) / clientHeight` as a
ratio (0 = viewport top, 1 = viewport bottom). On mount, the other density
consumes the ratio and positions the focused row at that same relative offset.
If no ratio was saved (e.g. initial load), falls back to `align: "center"`.

---

## Architecture Stress Test

Building the grid validated these architectural assumptions — **all passed**:

| Assumption | Test | Result |
|---|---|---|
| `useDataWindow` is density-independent | Grid calls `useDataWindow()` and gets everything it needs | ✅ Zero data layer duplication |
| `reportVisibleRange` works for grid geometry | Grid reports 2D visible range as a flat index range | ✅ Works — `firstRow * cols` to `(lastRow+1) * cols - 1` |
| `focusedImageId` survives density switch | Table→grid→table preserves focus | ✅ Zustand store persists across mount/unmount |
| `imagePositions` Map works across densities | Same Map, same `findImageIndex` | ✅ Same store, same O(1) lookup |
| Overlay architecture works from grid | Double-click grid cell → image detail → back → grid at same position | ✅ Same opacity-0 pattern, scroll preserved |
| Keyboard nav can be parameterised by geometry | `moveFocus(delta)` with `delta = columnsPerRow` for up/down | ✅ Same pattern, different delta |
| Scroll reset on search works | Sort/query from grid resets to top (same `searchParams` effect) | ✅ Identical effect code |

The architecture held up well. The only new mechanism needed was
`density-focus.ts` for viewport position preservation — 5 lines of
module-level state, not a leak in the abstraction.

---

## Preliminary Analysis: What We Learned from Sort-Around-Focus

These observations from the sort-around-focus attempt (performance-analysis.md
findings #2, #4, #5) are relevant to grid view planning:

1. **`max_result_window` (100k) is a hard wall.** Any feature that needs
   to address positions beyond 100k via `from/size` will fail. The grid
   virtualizer count is already capped at `min(total, 100k)`. This is
   fine for now but means the grid can't show more than 100k images with
   a native scrollbar. Beyond 100k requires the scrubber +
   `search_after` — which is a separate project.

2. **`from/size` performance degrades with depth.** At offset 50k, ES
   must score and skip 50k docs. The grid will have more visible cells
   per viewport than the table (e.g. 5×8 = 40 vs ~30 table rows), so
   gap detection may fire slightly more aggressively. Not a concern at
   current depths but worth monitoring.

3. **The grid doesn't need its own data store.** It shares `useDataWindow`
   with the table. Same `results` sparse array, same `loadRange`, same
   gap detection. The grid is a pure rendering concern — it doesn't
   change the data architecture at all.

---

## Decided

1. ✅ **Density control UX** — simple toggle button in toolbar for v1.
2. ✅ **Grid cell metadata** — description (truncated, title tooltip) +
   upload date. Nothing else for v1.
3. ✅ **Aspect ratio handling** — fixed equal-size cells, `object-fit:
   contain`. Editorial neutrality: all images presented equally.
4. ✅ **Thumbnails** — S3 thumbnails via existing `getThumbnailUrl()`.
   No imgproxy for grid cells.

## Open Questions

1. **Cell dimensions** — kahuna uses 280px min-width × 303px height.
   The metadata area (description + date) below the thumbnail needs
   ~50-60px. So thumbnail area ≈ 240px tall. These are starting values
   — match kahuna and adjust based on how it looks. The density slider
   (future) will have multiple discrete steps — intermediate sizes that
   don't correspond to a whole-number column change aren't useful.

2. **Single-click vs double-click to open image detail** — for v1,
   match the table: single-click = focus, double-click = open, double-
   click again from detail = back to grid. This is consistent within
   kupua and preserves the nice table UX (dblclick to enter, dblclick
   to exit — kahuna doesn't have this).

   **However:** kahuna users are deeply habituated to single-click
   opening images. They will likely revolt. This is the hardest UX
   question ahead. The fundamental tension: kupua's focus concept
   (single-click highlights, enabling keyboard nav, future multi-select)
   is genuinely more powerful than kahuna's "click = navigate", but
   most users won't understand the distinction between focus and
   selection. Keeping two different UX patterns (table and grid behave
   differently) is worse than either individual choice.

   **Defer the hard decision.** Ship with table-consistent behaviour,
   observe reactions, then decide. Options to explore later:
   - Single-click = focus + navigate (merge the concepts for grid)
   - Single-click = focus everywhere, but add a prominent "press Enter
     or double-click to open" affordance so it's discoverable
   - Click-and-hold = focus, quick click = navigate (risky, unusual)
   - Accept that focus/selection is a power-user concept and make
     single-click navigate in grid (breaking table consistency)

---

## Non-Goals for v1

- Custom scrubber / `search_after` — separate project, not grid-specific
- Page eviction / sliding window — separate project
- Selection (multi-select, checkboxes, batch actions) — future
- Side-by-side view — falls out naturally from grid at `columnsPerRow: 2`
- Filmstrip — density peek, requires grid infrastructure first
- Metadata panel — separate concern, mounted independently of density
- Collections panel / collection chips on cells
- Graphic image blur
- GNM-owned / Agency Picks visual distinction
- Hover action buttons (crop, pop-out, mark-as-seen)
- Status icons (usage, cost, syndication, archive)
- Labels on cells
- Drag-and-drop
- Variable cell sizes / aspect-ratio-aware layout


