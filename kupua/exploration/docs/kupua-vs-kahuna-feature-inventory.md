# Kupua vs Kahuna — Feature Inventory

> Research draft produced 2026-05-19. Audience: engineers orienting
> themselves in differences. `showcase`-tagged entries are also legible to
> Guardian picture editors and are candidates for a later HTML/asset pass.
>
> **How to read scores:** each entry carries `(a/b/c)` where a = Noticeable
> (picture editor, 60 s), b = Hard for Kahuna (architecture, not just
> elbow-grease), c = Fixes pain (known Kahuna pain). All 0–3. Sorted sum
> descending within each category.
>
> **Confidence tags:**
> - `kahuna-code-confirmed-absent` — feature simply does not exist in Kahuna source
> - `kahuna-code-confirmed-partial` — Kahuna has a weaker version; Kahuna file:line cited
> - `kahuna-config-gated` — feature exists in source but behind a client-config flag; PROD status unknown
> - `inferred-from-doc-only` — Kupua doc claim accepted, Kahuna source not opened for this item

---

## 1. Scroll & Navigation

### 1.1 Universal position preservation — sort, query, density, panel, resize ("Never Lost")
**Score (a/b/c):** 3/3/3 = **9** | **Audience:** showcase | **Demo:** interactive

**What Kahuna does today:** `scrollPosition.js` saves a raw Y-offset and attempts to restore it on `gu-lazy-table:height-changed`, with a 30 ms retry. This breaks in every scenario that changes the grid layout:

- **Sort or filter change** — re-fetch returns different content; old Y-offset points to different images.
- **Opening a panel** — `gr-panel--locked` shifts the panel into document flow, narrowing the content area; column count changes, grid reflows; Y-offset is now meaningless. You are completely lost.
- **Panel auto-hides on scroll** — panels auto-dismiss when you scroll (`gr-panels.js:62–76`), causing a second reflow in the opposite direction.
- **Browser window resize** — same column-reflow problem, no compensation.
- **Route reload / back navigation** — `scrollPosition.resume()` requires a URL match; overlay state is not captured; hard reload loses position entirely.

In every case the result is the same: content shifts, the Y-offset becomes stale, you jump to an unrelated position.

**What Kupua does:** A two-layer anchor system guarantees that the same image stays at (approximately) the same viewport position across every layout-changing operation:

1. **Explicit focus** — keyboard-selected image, tracked as `focusedImageId`. After sort/filter/query changes the search store re-fetches and seeks the focused image back to its previous viewport ratio.
2. **Phantom focus** — viewport-centre anchor, silently updated on every scroll. Used as fallback when no explicit focus is set (most browser sessions). Ensures the image in the centre of your screen is still in the centre after a sort change.
3. **ResizeObserver anchor** (`ImageGrid.tsx:441–605`) — fires on every panel toggle, panel resize drag, and browser window resize. Captures the anchor image's viewport ratio *before* React re-renders (in the observer callback), then restores it in a `useLayoutEffect` *before paint*. No visible jump.

All three layers were stress-tested against 17 identified flash/jump scenarios; as of April 2026, **zero reproducible flash sites remain** (`position-preservation-reference.md` — full inventory).

**Why it's better:** Changing sort from "Upload date" to "Taken date", opening the filter panel, resizing the browser, or changing density between table and grid all leave the same image on screen at the same position. Deep in a 9 M-image result set this is the difference between "I know where I am" and starting over.

**Evidence — Kupua:**
- `kupua/exploration/docs/position-preservation-reference.md` (17-site flash inventory, all fixed)
- `kupua/exploration/docs/00 Architecture and philosophy/02-focus-and-position-preservation.md:45–113`
- `kupua/src/hooks/useScrollEffects.ts:46–105` (sort/query/density paths)
- `kupua/src/components/ImageGrid.tsx:441–605` (ResizeObserver → anchor capture → `useLayoutEffect` restore)

**Evidence — Kahuna:**
- `kahuna/public/js/services/scroll-position.js:20–44` (save/resume raw Y-offset only)
- `kahuna/public/js/components/gr-panels/gr-panels.js:62–76` (panels auto-hide on scroll, causing repeated reflows)
- `kahuna/public/js/components/gr-panels/gr-panels.css:14–20` (`gr-panel--locked` enters document flow — no position compensation)

**Confidence:** `kahuna-code-confirmed-partial`

---

### 1.2 Adaptive scrubber for large result sets
**Score (a/b/c):** 3/3/3 = **9** | **Audience:** showcase | **Demo:** video

**What Kahuna does today:** No scrubber exists. Navigation through large result sets is only possible by scrolling the main page or typing date-range filters. Confirmed absent after full text search across all Kahuna JS.

**What Kupua does:** A proportional scrubber track replaces the system scrollbar. It switches modes based on result count:
- ≤1 k results: position-proportional thumb (standard scroll)
- 1 k–65 k: indexed thumb over a position map
- >65 k: seek mode — drag anywhere to teleport instantly, using ES percentile estimation + binary search in ~50 ms

Tick marks are placed at *document-count* positions, making the track a miniature histogram of where content lives. The null zone (images missing the sort field) is visualised in red with its own label.

**Why it's better:** A picture editor can orient themselves quickly within any results set.

**Evidence — Kupua:**
- `kupua/src/components/Scrubber.tsx:1–135` (component)
- `kupua/exploration/docs/00 Architecture and philosophy/03-scroll-architecture.md:83–99, 623–652`
- `kupua/exploration/docs/00 Architecture and philosophy/scrubber-ticks-and-labels.md:30–50`

**Evidence — Kahuna:** No scrubber component or "scrubber" / "timeline" keyword found in `kahuna/public/js/**`. The only scrollbar references are third-party UI library width calculations in `public/dist/build.js`.

**Confidence:** `kahuna-code-confirmed-absent`

---

### 1.3 Virtualised scroll through millions of results without a depth cap
**Score (a/b/c):** 2/3/3 = **8** | **Audience:** both | **Demo:** interactive

**What Kahuna does today:** Uses `offset` + `length` (ES `from/size`) with a hard cap at `ctrl.maxResults = 100000`. Scrolling or even paginating beyond that is impossible; the user sees at most the first 100k results. Displaying any items beyond that requires filtering by date. Kahuna renders a single long DOM list with row virtualisation via `gu-lazy-table`.

**What Kupua does:** Uses `search_after` + PIT (point-in-time) cursors, which have no depth limit. The three-tier scroll architecture (scroll tier ≤1 k, indexed tier 1 k–65 k, seek tier >65 k) allows browsing any position in a 9 M-image index. The in-memory windowed buffer holds at most ~1 000 items; old pages are evicted as new ones load.

**Why it's better:** Searches returning "all Guardian archive images" are now browsable end-to-end; Kahuna silently truncates at 100 k.

**Evidence — Kupua:**
- `kupua/exploration/docs/00 Architecture and philosophy/03-scroll-architecture.md:107–121`
- `kupua/src/stores/search-store.ts` (PIT lifecycle, seek/extend/evict)

**Evidence — Kahuna:**
- `kahuna/public/js/search/results.js:~841` (`ctrl.maxResults = 100000`)
- `kahuna/public/js/services/api/media-api.js:42–62` (`offset: offset, length: length` → ES `from/size`)

**Confidence:** `kahuna-code-confirmed-partial`

---

### 1.4 Browser back/forward with exact scroll and overlay state restored
**Score (a/b/c):** 2/2/3 = **7** | **Audience:** both | **Demo:** video

**What Kahuna does today:** Two mechanisms, both non-trivial, both unreliable in practice.

1. **Browser history back from image detail.** Image detail is a separate route (`/images/:id`). Browser back returns to the `search` state. The UI-Router `deepStateRedirect` plugin (`search/index.js:80`) intercepts this, injects `isDeepStateRedirect: true`, and restores the remembered `search.results` state. This sets `isReloadingPreviousSearch = true`, which preserves `lastSearchFirstResultTime` — a module-level timestamp pinning the `until` boundary to when the search was first run, so newly arrived images are excluded from the re-run. `scrollPosition.resume()` is then called on `gu-lazy-table:height-changed` (and again after 30 ms) to restore the raw pixel Y-offset that was saved at `$scope.$destroy`.

2. **"Back to search" button** (`image/view.html:3`). Uses `ui-sref="search"` — not `ui-sref="search.results"` — specifically to trigger the same `deepStateRedirect` path above. The intent is to land back at the remembered search position rather than at `/`.

Both mechanisms try to be clever, and in ideal conditions (same tab, no hard reload, few new images arriving) they can work. But they degrade to scroll-to-top in several real scenarios: `lastSearchFirstResultTime` is module-level memory state — a hard reload or a new tab clears it entirely, re-running without the `until` boundary. Even with the boundary intact, the raw pixel Y-offset from `scrollPosition` is only valid if the lazy table has rendered all rows above the saved position before `height-changed` fires; the 30 ms retry is a best-effort patch, not a guarantee. And any images that arrived *before* you navigated to image detail are already counted — their presence shifts the Y-offset even with `until` set.

**What Kupua does:** Every committed history entry gets a `kupuaKey` → sessionStorage snapshot recording the focused image ID, viewport ratio, and scroll position. On `popstate` the snapshot is replayed: the search is re-run, the virtualiser seeks to the right position, and the focus ring is placed back on the exact image. Overlay open/close are also committed entries so the back button closes a fullscreen preview rather than leaving the page.

**Why it's better:** Browser history is much more reliable. The position anchor is an image ID (not a pixel offset), so it is invariant to any layout change. It also survives overlay open/close, which Kahuna's mechanism does not handle at all.

**Evidence — Kupua:**
- `kupua/exploration/docs/00 Architecture and philosophy/04-browser-history-architecture.md:94–135`
- `kupua/src/hooks/useUrlSearchSync.ts` (popstate restore)
- `kupua/e2e/local/browser-history.spec.ts:1`

**Evidence — Kahuna:**
- `kahuna/public/js/services/scroll-position.js:18–35` (raw Y-offset save/resume)
- `kahuna/public/js/search/index.js:80–85` (`deepStateRedirect` config)
- `kahuna/public/js/search/results.js:228–229` (`isReloadingPreviousSearch` preserves `lastSearchFirstResultTime`)
- `kahuna/public/js/search/results.js:908–915` (`save()` called on `$scope.$destroy`)
- `kahuna/public/js/image/view.html:3` (`ui-sref="search"` to trigger deep-state redirect)

**Confidence:** `kahuna-code-confirmed`

---

### 1.5 Off-screen range selection via server walk
**Score (a/b/c):** 3/2/3 = **8** | **Audience:** showcase | **Demo:** video

*(Described in §4 Selections — placed here because it is fundamentally a navigation problem. Cross-reference §4.1.)*

---

### 1.6 Focus snaps to nearest surviving neighbour after query change
**Score (a/b/c):** 2/2/2 = **6** | **Audience:** both | **Demo:** screenshot

**What Kahuna does today:** When a search is refined and the currently viewed image drops out of results, Kahuna resets to the first result.

**What Kupua does:** If the focused image is not in the new result set, focus is silently moved to the nearest image by position — the result at the same rank as the old image in the new set. The view does not jump to position 0.

**Why it's better:** Refining a search (e.g. adding a date constraint) doesn't discard your working context.

**Evidence — Kupua:**
- `kupua/exploration/docs/00 Architecture and philosophy/01-frontend-philosophy.md:49–73`
- `kupua/src/hooks/useDataWindow.ts` (viewportAnchor logic)

**Confidence:** `inferred-from-doc-only` (Kahuna reset-on-search not explicitly confirmed in code, but implied by absence of focus tracking in `results.js`)

---

## 2. Image Detail & Fullscreen

### 2.1 Fullscreen overlay that keeps you inside search
**Score (a/b/c):** 3/2/3 = **8** | **Audience:** showcase | **Demo:** video

**What Kahuna does today:** Clicking an image navigates to a *separate route* (`/images/:id`). The browser address bar changes; returning requires navigating back, which re-runs the search. `f` for fullscreen is possible only for that one image, only from that image page.

**What Kupua does:** Everything is the same page. Image detail is just an overlay as is fullscreen. `f` or middle-click opens a fullscreen overlay *on top of the search results* or image detail. The URL adds `?fullscreen=id` (a `replace` entry, not a push) so the back button dismisses the overlay and returns to the same search. The search buffer is live while the overlay is open.

**Why it's better:** Picture editors can rapid-fire through large results without losing their search context on every open/close.

**Evidence — Kupua:**
- `kupua/src/components/FullscreenPreview.tsx:1`
- `kupua/exploration/docs/00 Architecture and philosophy/01-frontend-philosophy.md:254–260`
- `kupua/e2e/local/browser-history.spec.ts:1`

**Evidence — Kahuna:**
- `kahuna/public/js/image/controller.js:107–135` (native Fullscreen API on the image detail page — separate route)

**Confidence:** `kahuna-code-confirmed-partial`

---

### 2.2 Pinch-to-zoom and wheel zoom with inertial panning
**Score (a/b/c):** 3/1/2 = **6** | **Audience:** showcase | **Demo:** video

**What Kahuna does today:** No user-controlled zoom. `imgops/service.js:15–18` adjusts the *requested image resolution* based on `devicePixelRatio` (HiDPI screens), but there is no interactive zoom control. `ui-crop-box.js:56` has `zoomable: false`.

**What Kupua does:** `usePinchZoom` handles pinch (touch), wheel (desktop), double-tap or click and keyboard (+/-) zoom. When zoomed in, the view pans with momentum (inertial deceleration). Higher-resolution image is fetched on demand as zoom increases.

**Why it's better:** Checking fine print on a document image or assessing sharpness at 100% is practical without downloading and opening the image separately.

**Evidence — Kupua:**
- `kupua/src/hooks/usePinchZoom.ts:1–150`
- `kupua/src/components/ImageDetail.tsx`

**Evidence — Kahuna:**
- `kahuna/public/js/imgops/service.js:15–18` (DPR-only, not interactive)
- `kahuna/public/js/directives/ui-crop-box/ui-crop-box.js:56` (`zoomable: false`)

**Confidence:** `kahuna-code-confirmed-absent`

---

### 2.3 Swipe navigation between images in detail view (mobile)
**Score (a/b/c):** 3/1/2 = **6** | **Audience:** showcase | **Demo:** video

**What Kahuna does today:** No swipe handling (Kahuna is not usable on mobile). The CSS contains a FIXME comment "what to do with touch devices" (`main.css:1697`). No touch event listeners found in `kahuna/public/js/**`.

**What Kupua does:** `useSwipeCarousel` handles left/right swipe gestures in image detail view or fullscreen to move to the previous/next image. `useSwipeDismiss` handles a downward swipe to close the overlay.

**Why it's better:** Picture editors working on tablets or phones can flick through a shoot without opening separate tabs or going in and back constantly.

**Evidence — Kupua:**
- `kupua/src/hooks/useSwipeCarousel.ts:1`
- `kupua/src/hooks/useSwipeDismiss.ts:1`

**Evidence — Kahuna:**
- `kahuna/public/stylesheets/main.css:1697` (FIXME comment, no implementation)

**Confidence:** `kahuna-code-confirmed-absent`

---

### 2.4 Keyboard traversal with prefetch (prev/next in detail)
**Score (a/b/c):** 2/1/2 = **5** | **Audience:** both | **Demo:** screenshot

**What Kahuna does today:** Kahuna doesn't offer image traversal.

**What Kupua does:** `useImageTraversal.ts` fires `prefetchNearbyImages` on detail-view mount and on every traversal step (direction-aware, throttled). `image-prefetch.ts` manages a cadence-aware pipeline: at normal pace it prefetches 4 ahead + 1 behind; during fast swiping it uses a sparse radius to avoid wasting bandwidth. Images are prefetched at screen-sized imgproxy resolution (not raw full-res).

**Why it's better:** Rapid keyboard triage through a shoot feels instant.

**Evidence — Kupua:**
- `kupua/src/hooks/useImageTraversal.ts`
- `kupua/src/lib/image-prefetch.ts`

**Confidence:** `inferred-from-doc-only` (Kahuna prefetch not confirmed absent from code)

---

## 3. Search & Query

### 3.1 CQL typeahead from live ES aggregations (no Grid API call)
**Score (a/b/c):** 2/2/2 = **6** | **Audience:** both | **Demo:** screenshot

**What Kahuna does today:** Kahuna also has `gr-cql-input` (`kahuna/public/js/components/gr-cql-input/gr-cql-input.ts:89`). The typeahead suggestions go through the media-api service and are offered only for a small handful of values.

**What Kupua does:** Typeahead suggestions are fetched directly from Elasticsearch aggregations via `lazy-typeahead.ts`. Suggestions are offered for any values that current mappings allow.

**Why it's better:** Richer suggestions with aggregation counts provide a common discovery mechanism per-field always aware of current search context.

**Evidence — Kupua:**
- `kupua/src/lib/lazy-typeahead.ts:1`
- `kupua/exploration/docs/deviations.md:80` (CQL typeahead via ES agg deviation)

**Evidence — Kahuna:**
- `kahuna/public/js/components/gr-cql-input/gr-cql-input.ts:89`

**Confidence:** `kahuna-code-confirmed-partial`

---

### 3.2 Improved Shift-click AND / Alt-click NOT on metadata values
**Score (a/b/c):** 2/1/2 = **5** | **Audience:** both | **Demo:** screenshot

**What Kahuna does today:** Clicking a metadata value in the info panel searches for that value replacing current search, with Shift appends as AND, with Alt appends with NOT.

**What Kupua does:** Kupua extends that concept to table cells and Filters panel.

**Why it's better:** Common pattern is more commmon.

**Evidence — Kupua:**
- `kupua/exploration/docs/00 Architecture and philosophy/01-frontend-philosophy.md:129–135`
- `kupua/src/components/ImageMetadata.tsx`

**Confidence:** `inferred-from-doc-only` (Kahuna metadata click behaviour not confirmed absent from code)

---

### 3.3 Multi-sort via field registry (38+ sortable fields)
**Score (a/b/c):** 2/2/2 = **6** | **Audience:** both | **Demo:** screenshot

**What Kahuna does today:** Five fixed sort options: Upload date (new/old), Taken date (new/old), Last modified (new/old), Added to collection. These are hardcoded in `gr-sort-control-config.ts:9–41`.

**What Kupua does:** The sort dropdown (`SORT_DROPDOWN_OPTIONS` in `field-registry.tsx`) exposes 12 options: Uploaded, Taken on, Last modified, Added to collection, Image type, Credit, Source, Uploader, Category, Width, Height, File type. Shift-clicking on column header or sort dropdown item offers secondary sort on any sortable field. Separate sort order UI prevents clutter.

**Why it's better:** More comprehensive and powerful sorting.

**Evidence — Kupua:**
- `kupua/src/lib/field-registry.tsx`
- `kupua/src/dal/adapters/elasticsearch/sort-builders.ts`
- `kupua/exploration/docs/deviations.md:98` (Width/Height split)

**Evidence — Kahuna:**
- `kahuna/public/js/components/gr-sort-control/gr-sort-control-config.ts:9–41` (5 fixed options)

**Confidence:** `kahuna-code-confirmed-partial`

---

### 3.4 Non-default indicator dots on sort and date filter; cleaner date keyboard entry
**Score (a/b/c):** 1/1/1 = **3** | **Audience:** both | **Demo:** screenshot

Two small UI polish differences, grouped here.

**Indicator dots.** Kupua renders a small accent dot on the sort button when sort is non-default (`orderBy !== "-uploadTime"`) and on the date filter button when any date constraint is active. Kahuna shows the active filter *content* in the collapsed button label but has no persistent dot badge. The dots are a quick orientation cue: glancing at the toolbar tells you whether you've deviated from defaults without reading the labels.

**Date keyboard entry.** Both Kupua and Kahuna offer the same presets (Anytime, Today, Past 24 h, Past week, Past 6 months, Past year) and the same field selector (Upload time / Date taken / Last modified). The difference is the custom-range input: Kahuna uses Pikaday — a third-party calendar widget driving a hidden `<input type="text" placeholder="DD-MM-YYYY">` — where keyboard date entry requires navigating the Pikaday grid. Kupua uses browser-native `<input type="date">` (`YYYY-MM-DD`), so keyboard users get their platform's native date picker directly.

**Evidence — Kupua:**
- `kupua/src/components/DateFilter.tsx:379–390` (accent dot on date button)
- `kupua/src/components/SearchFilters.tsx:192–196` (accent dot on sort button, `isNonDefaultSort`)
- `kupua/src/components/DateFilter.tsx:329–336` (`<input type="date">` for custom range)

**Evidence — Kahuna:**
- `kahuna/public/js/components/gu-date-range/gu-date-range.html:55–60` (Pikaday `<input type="text" placeholder="DD-MM-YYYY">`)
- `kahuna/public/js/components/gu-date-range/gu-date-range.html:1–9` (no active-state badge on collapsed button)

**Confidence:** `kahuna-code-confirmed-partial`

---

### 3.5 Faceted filter panel with live ES aggregation counts
**Score (a/b/c):** 3/2/3 = **8** | **Audience:** showcase | **Demo:** screenshot

**What Kahuna does today:** No faceted filter panel exists. Filtering requires typing CQL directly into the search box or using the fixed toolbar controls (date range, nonFree toggle, payType). There is no UI that shows what values exist for a given field across the current result set. No aggregation calls are made from `kahuna/public/js/**`.

**What Kupua does:** The left panel contains a `FacetFilters` accordion section. For every aggregatable field in the field registry (credit, copyright, source, image type, file type, uploader, category, etc.), it shows the top-10 values with live ES `terms` aggregation counts against the current search context. Clicking any value inserts or removes the corresponding CQL chip. Each section has a "Show more" control that expands to the full bucket list via a second aggregation call. An EMA-based circuit breaker in the search store skips the aggregation if it was very slow on the previous request and shows a "Refresh (slow)" opt-in link instead. Aggregations are fetched lazily — only while the Filters accordion is open. The elapsed time appears in the accordion header (e.g. "47 ms"). Clicking a bucket value applies scroll anchoring so the filter list doesn't jump.

**Why it's better:** Drilling into "which agencies are in this result set?" or "what file types appear here?" is point-and-click discovery rather than a CQL guess-and-check loop. Useful for any unfamiliar query.

**Evidence — Kupua:**
- `kupua/src/components/FacetFilters.tsx` (full component, scroll anchor, show-more)
- `kupua/src/stores/search-store.ts` (`fetchAggregations`, `aggCircuitOpen`, `expandedAggs`, `aggTook`)

**Evidence — Kahuna:** No aggregation component, no `terms` aggregation call, no facet list found in `kahuna/public/js/**`. The `search/syntax/syntax.html` shows a CQL help panel with example chips but no live-count filter UI.

**Confidence:** `kahuna-code-confirmed-absent`

---

## 4. Selections (Multi-Image)

### 4.1 Range selection that works across off-screen images
**Score (a/b/c):** 3/2/3 = **8** | **Audience:** showcase | **Demo:** video

**What Kahuna does today:** Shift-clicking a range selection calls `ctrl.images.slice(start, end)` — `ctrl.images` is the currently rendered array. Images that have not yet loaded into the virtualised viewport are not included. For large result sets (>~50 images) the shift-click range silently drops items you scrolled through since the selection-start.

**What Kupua does:** `useRangeSelection.ts` checks if both anchor points are in the current buffer. If not, it issues a "server walk" — a sequence of `search_after` queries — to enumerate every image between the two endpoints, then adds them all to the selection. The user gets feedback ("Selecting 234 images…") while the walk completes.

**Why it's better:** Selecting an entire day's worth of images (hundreds of results) with shift-click actually works.

**Evidence — Kupua:**
- `kupua/src/hooks/useRangeSelection.ts:1`
- `kupua/exploration/docs/00 Architecture and philosophy/05-selections.md:155–168`

**Evidence — Kahuna:**
- `kahuna/public/js/search/results.js:1038–1055` (`ctrl.images.slice(start, end)`, viewport-bounded)

**Confidence:** `kahuna-code-confirmed-partial`

---

### 4.2 Selection survives page reload and sort changes
**Score (a/b/c):** 2/1/2 = **5** | **Audience:** showcase | **Demo:** screenshot

**What Kahuna does today:** Selection is in-memory state on the controller, injected via the `selection` factory service. Sort and filter changes call `$state.go('search.results', ...)`, which triggers a full UI-Router state transition — the controller is re-instantiated and the selection service with it. Selection is cleared entirely. There is no persistence across sort changes, filter changes, or page reload.

**What Kupua does:** `selection-store.ts` uses Zustand `persist` middleware → `sessionStorage`. Selections survive hard reloads, sort changes, and filter changes within the same browser tab. A "hydration toast" fires on reload if the restored selection no longer matches all results, offering a "Reconcile" action.

**Why it's better:** Accidentally refreshing the page during a bulk selection task doesn't lose 20 minutes of work.

**Evidence — Kupua:**
- `kupua/src/stores/selection-store.ts:1`
- `kupua/exploration/docs/00 Architecture and philosophy/05-selections.md:268–278`

**Evidence — Kahuna:** `kahuna/public/js/services/selection.js` (in-memory factory, no sessionStorage); `kahuna/public/js/search/results.js:~160` (`$state.go('search.results', ...)` on sort/filter change re-instantiates controller).

**Confidence:** `kahuna-code-confirmed-absent`

---

### 4.3 Multi-image metadata panel with field frequency counts
**Score (a/b/c):** 2/1/2 = **5** | **Audience:** showcase | **Demo:** screenshot

**What Kahuna does today:** A multi-select count badge is shown and bulk actions are available. Metadata panel showing field values across the selection.

**What Kupua does:** `MultiImageMetadata.tsx` shows every field value with frequency counts ("Getty (31/50) · AP (12/50) · Mixed (7/50)") in tooltip. Values shared by 100% of the selection appear solid; partial values are hollow. Lazy reconciliation (`lib/reconcile.ts`) chunks the metadata fetch to avoid UI blocking. Array fields are sorted by popularity.

**Why it's better:** Better orientation and discovery for much larger selection sets.

**Evidence — Kupua:**
- `kupua/src/components/MultiImageMetadata.tsx`
- `kupua/src/lib/reconcile.ts`
- `kupua/exploration/docs/00 Architecture and philosophy/05-selections.md:173–248`

**Confidence:** `inferred-from-doc-only` (Kahuna multi-select panel not confirmed absent; no multi-image metadata component found in search)

---

### 4.4 Selection capacity ≥5,000 images (10× Kahuna)
**Score (a/b/c):** 1/2/2 = **5** | **Audience:** both | **Demo:** none

**What Kahuna does today:** Selection is an `OrderedSet` backed by Immutable.js. The performance ceiling is documented in Kupua's selections doc as ~500 items before the UI becomes sluggish.

**What Kupua does:** Set-based state with an LRU metadata cache. Designed to handle 5 000+ selected images without blocking. Incremental reconciliation prevents UI jank when adding a large range.

**Evidence — Kupua:**
- `kupua/exploration/docs/00 Architecture and philosophy/05-selections.md:23`

**Confidence:** `inferred-from-doc-only` (Kahuna OrderedSet capacity ceiling is Kupua's claim; not independently benchmarked here)

---

### 4.5 Long-press to enter selection mode (mobile)
**Score (a/b/c):** 2/1/2 = **5** | **Audience:** showcase | **Demo:** video

**What Kahuna does today:** No touch-specific selection gesture found. No `touchstart`/`touchend` event handlers in `kahuna/public/js/search/results.js`.

**What Kupua does:** `useLongPress.ts` fires on a sustained touch (500 ms hold) to toggle selection on the pressed image, matching the standard mobile long-press-to-select convention.

**Evidence — Kupua:**
- `kupua/src/hooks/useLongPress.ts`
- `kupua/exploration/docs/00 Architecture and philosophy/05-selections.md:293–299`

**Confidence:** `kahuna-code-confirmed-absent`

---

## 5. Table View

### 5.1 True column table view (grid-only in Kahuna)
**Score (a/b/c):** 3/2/3 = **8** | **Audience:** showcase | **Demo:** screenshot

**What Kahuna does today:** Kahuna has **no table/list view**. The `gu-lazy-table` directive is its virtualisation engine for the image grid — fixed cell width of 280 px, fixed cell height of 303 px (`results.html:157–158`). There are no column headers, no rows, no text-based layout.

**What Kupua does:** `ImageTable.tsx` renders a proper spreadsheet-style view: each row is one image, each column is a registered field. Columns show thumbnails, IDs, dates, credit, copyright, supplier reference, file type, dimensions, cost/validity badge, and more. The table is virtualised via the same windowed buffer as the grid view.

**Why it's better:** Auditing metadata or checking credit lines across 50 images is practical in table view; it requires opening each image individually in Kahuna.

**Evidence — Kupua:**
- `kupua/src/components/ImageTable.tsx:1`
- `kupua/src/lib/field-registry.tsx`

**Evidence — Kahuna:**
- `kahuna/public/js/search/results.html:156–164` (`gu:lazy-table-cell-min-width="280"`, `gu:lazy-table-cell-height="303"` — grid cells, not columns)

**Confidence:** `kahuna-code-confirmed-absent`

---

### 5.2 Configurable columns with context menu
**Score (a/b/c):** 2/2/2 = **6** | **Audience:** both | **Demo:** screenshot

**What Kahuna does today:** No table view → no column configuration.

**What Kupua does:** Right-clicking a column header opens `ColumnContextMenu.tsx`. The visible column set is persisted in `column-store.ts`. Adding or hiding columns takes one click.

**Evidence — Kupua:**
- `kupua/src/components/ColumnContextMenu.tsx`
- `kupua/src/stores/column-store.ts`

**Confidence:** `kahuna-code-confirmed-absent`

---

### 5.3 Secondary sort via shift-click column header
**Score (a/b/c):** 2/1/2 = **5** | **Audience:** both | **Demo:** screenshot

**What Kahuna does today:** Single sort from a five-option dropdown. No multi-sort.

**What Kupua does:** Shift-clicking a column header in table view appends a secondary sort key. The sort indicators (▲/▼ for primary and ▲▲/▼▼ for secondary sort) are visible in the header.

**Evidence — Kupua:**
- `kupua/src/components/ImageTable.tsx:~200` (secondary sort on shift-click)
- `kupua/src/dal/adapters/elasticsearch/sort-builders.ts`

**Evidence — Kahuna:**
- `kahuna/public/js/components/gr-sort-control/gr-sort-control-config.ts:9–41` (single sort only)

**Confidence:** `kahuna-code-confirmed-absent`

---

## 6. Grid View

### 6.1 Density continuum (table ↔ grid ↔ single image ↔ fullscreen)
**Score (a/b/c):** 3/2/2 = **7** | **Audience:** showcase | **Demo:** video

**What Kahuna does today:** Fixed grid view only (280 × 303 cells). No density control.

**What Kupua does:** A density toggle switches between table and grid views. The current focused image stays in the same viewport position as density changes (§1.1).

**Evidence — Kupua:**
- `kupua/exploration/docs/00 Architecture and philosophy/01-frontend-philosophy.md:11–24`
- `kupua/src/hooks/useScrollEffects.ts`

**Evidence — Kahuna:**
- `kahuna/public/js/search/results.html:157–158` (fixed cell dimensions)

**Confidence:** `kahuna-code-confirmed-absent`

---


## 7. Collections

### 7.1 Auto-sort to `dateAddedToCollection` on collection select, and auto-revert on deselect
**Score (a/b/c):** 2/1/2 = **5** | **Audience:** both | **Demo:** video

**What Kahuna does today:** When a collection query is entered, Kahuna's `SortControl` component switches to `dateAddedToCollection` sort. But when the collection is removed from the query, Kahuna does not revert to the previous sort — the user is left on `dateAddedToCollection` with a non-collection search, which is confusing.

**What Kupua does:** The collection store (`collection-store.ts`) injects the sort change atomically with the query change (single re-search, no two-request race). When the `collection:…` chip is removed, the sort atomically reverts to what it was before.

**Evidence — Kupua:**
- `kupua/exploration/docs/00 Architecture and philosophy/06-collections.md:110–144`
- `kupua/src/stores/collection-store.ts`

**Evidence — Kahuna:**
- `kahuna/public/js/components/gr-sort-control/gr-sort-control.tsx:54–68` (no revert logic; sort state is only updated on sort-select events)

**Confidence:** `kahuna-code-confirmed-partial`

---

### 7.2 Subtree image counts in collection tree
**Score (a/b/c):** 2/1/1 = **4** | **Audience:** both | **Demo:** screenshot

**What Kahuna does today:** Collection tree shows collection names. Subtree counts are not displayed.

**What Kupua does:** Each collection node displays a count of images in it and all its descendants, derived from an ES `terms` aggregation using `pathId` prefix matching.

**Evidence — Kupua:**
- `kupua/exploration/docs/00 Architecture and philosophy/06-collections.md:20–22`
- `kupua/src/stores/collection-store.ts`

**Confidence:** `inferred-from-doc-only`

---

## 8. Keyboard & Accessibility

### 8.1 All shortcuts fire from inside the search box (Alt+key)
**Score (a/b/c):** 2/1/3 = **6** | **Audience:** both | **Demo:** screenshot

**What Kahuna does today:** `gu-lazy-table-shortcuts.js:26–30` registers shortcuts with `allowIn: ['INPUT']` for arrow and page keys, but `home`/`end` explicitly *exclude* INPUT (`gu-lazy-table-shortcuts.js:48–56`). Shortcuts requiring bare key presses cannot fire when the search box has focus.

**What Kupua does:** Kupua uses an `Alt+key` pattern for shortcuts that need to work while the search box is active. For example `Alt+f` enters fullscreen for a focused image, `Alt+[` opens Browse panel, without conflicting with searchbox editing. Bare keys (no modifier) work only when focus is outside editable fields.

**Evidence — Kupua:**
- `kupua/src/lib/keyboard-shortcuts.ts:10–115`
- `kupua/exploration/docs/deviations.md:205`
- `kupua/exploration/docs/00 Architecture and philosophy/keyboard-navigation.md:37–50`

**Evidence — Kahuna:**
- `kahuna/public/js/components/gu-lazy-table-shortcuts/gu-lazy-table-shortcuts.js:48–56` (Home/End lack `allowIn: ['INPUT']`)

**Confidence:** `kahuna-code-confirmed-partial`

---

### 8.2 PgUp/PgDown "never re-see, never skip" precision
**Score (a/b/c):** 1/1/2 = **4** | **Audience:** both | **Demo:** none

**What Kahuna does today:** `gu-lazy-table-shortcuts.js` calls `scrollPrevPage`/`scrollNextPage`. The underlying implementation rounds by raw Y-offset divided by row height, which can re-show the last fully-visible row or skip the first partially-visible row, depending on fractional alignment.

**What Kupua does:** Page-up/down compute the exact first partially-visible row and ensure it is the last row of the previous page (or the first of the next). "Never re-see, never skip" is a stated guarantee.

**Evidence — Kupua:**
- `kupua/exploration/docs/00 Architecture and philosophy/keyboard-navigation.md:45–100`

**Evidence — Kahuna:**
- `kahuna/public/js/components/gu-lazy-table-shortcuts/gu-lazy-table-shortcuts.js:26–46`

**Confidence:** `kahuna-code-confirmed-partial`

---

### 8.3 Caret position in CQL box survives tab/window switching
**Score (a/b/c):** 1/1/2 = **4** | **Audience:** both | **Demo:** none

**What Kahuna does today:** No explicit caret preservation; the standard browser behaviour applies, which resets the caret to the end on re-focus in many browsers.

**What Kupua does:** On blur, the caret position is saved; on re-focus it is restored. Deviations doc records this as an intentional fix.

**Evidence — Kupua:**
- `kupua/exploration/docs/deviations.md:305`

**Confidence:** `inferred-from-doc-only`

---

### 8.4 Resizable, keyboard-toggled panels that don't auto-hide
**Score (a/b/c):** 2/1/2 = **5** | **Audience:** both | **Demo:** screenshot

**What Kahuna does today:** Panels are fixed-width overlays: left (Collections) is 250 px, right (Metadata) is 290 px, both `position: fixed` over the content. A scroll-debounce listener (`gr-panels.js:62–76`) hides any visible, unlocked panel automatically when the user scrolls the page. There is no resize handle, no keyboard shortcut to open/close panels, and widths are hardcoded in CSS.

**What Kupua does:** `PanelLayout.tsx` places panels in the normal flex flow (not overlays), so they narrow the main content area rather than covering it. Panels are resizable — a `ResizeHandle` component responds to mouse drag and updates panel width via a CSS custom property during the drag (zero React re-renders per frame); the final width is committed to the panel store and persisted to localStorage. Double-clicking the resize handle closes the panel. `[` and `]` toggle the left and right panels respectively; `Alt+[` / `Alt+]` fire the same actions when focus is inside the search box. Panels never auto-hide on scroll.

Critically, opening, closing, or resizing a panel triggers `ImageGrid`'s `ResizeObserver`, which anchors the current image and restores its viewport position before paint — see §1.1 for the full position-preservation story.

**Why it's better:** Keeping the left panel open while scrolling through thousands of images is possible (Kahuna auto-dismisses on scroll). Toggling a panel or dragging its edge doesn't lose your place in a long result set. Resize persistence means a user's preferred panel widths survive across sessions.

**Evidence — Kupua:**
- `kupua/src/components/PanelLayout.tsx` (`ResizeHandle`, `handleDoubleClick`, `useKeyboardShortcut`)
- `kupua/src/stores/panel-store.ts` (`setWidth`, `MIN_PANEL_WIDTH`, `MAX_PANEL_WIDTH_RATIO`, localStorage persist)

**Evidence — Kahuna:**
- `kahuna/public/js/components/gr-panels/gr-panels.js:62–76` (scroll-triggered auto-hide)
- `kahuna/public/js/components/gr-panels/gr-panels.css:7–32` (`position: fixed`, fixed widths)

**Confidence:** `kahuna-code-confirmed-partial`

---

## 9. Touch & Mobile

### 9.1 Full touch navigation suite
**Score (a/b/c):** 3/1/2 = **6** | **Audience:** showcase | **Demo:** video

**What Kahuna does today:** No touch gestures. `main.css:1697` notes "FIXME: what to do with touch devices". No `touchstart`/`touchend`/`pointerdown` event handlers found in `kahuna/public/js/**` search results.

**What Kupua does:** Three complementary touch hooks cover the main use cases:
- `useSwipeCarousel.ts` — left/right swipe to prev/next image in detail view
- `useSwipeDismiss.ts` — downward swipe to close overlay
- `usePinchZoom.ts` — pinch-to-zoom in fullscreen, with momentum panning
- `useLongPress.ts` — long-press to enter selection mode on a thumbnail

**Evidence — Kupua:**
- `kupua/src/hooks/useSwipeCarousel.ts:1`
- `kupua/src/hooks/useSwipeDismiss.ts:1`
- `kupua/src/hooks/usePinchZoom.ts:1`
- `kupua/src/hooks/useLongPress.ts`

**Evidence — Kahuna:**
- `kahuna/public/stylesheets/main.css:1697` (FIXME comment only)

**Confidence:** `kahuna-code-confirmed-absent`

---

### 9.2 Mobile autofocus suppression (keyboard doesn't obscure results)
**Score (a/b/c):** 1/0/1 = **2** | **Audience:** both | **Demo:** none

**What Kahuna does today:** Not handled; CQL input autofocuses on mount, which on mobile raises the on-screen keyboard and obscures most of the search results.

**What Kupua does:** `autoFocus` is suppressed on mobile viewports on initial mount so the keyboard doesn't interrupt first load.

**Evidence — Kupua:**
- `kupua/exploration/docs/deviations.md:268`

**Confidence:** `inferred-from-doc-only`

---

## 10. Performance

### 10.1 ES `search_after` + PIT — no hard depth limit, lower jitter
**Score (a/b/c):** 1/3/3 = **7** | **Audience:** both | **Demo:** none

*(Partially covered in §1.3 — emphasised here for the architecture win.)*

**What Kahuna does today:** `from/size` pagination. ES rejects `from` values above `index.max_result_window` (default 10 k; Kahuna raises `maxResults` to 100 k suggesting the Guardian have raised this limit). Each page recomputes ranks for all preceding pages — O(n) latency grows with depth.

**What Kupua does:** `search_after` with a PIT (point-in-time) snapshot has O(1) marginal cost per page regardless of depth. The PIT is kept alive and renewed automatically.

**Evidence — Kupua:**
- `kupua/src/dal/adapters/elasticsearch/es-adapter.ts`
- `kupua/exploration/docs/00 Architecture and philosophy/03-scroll-architecture.md:280–293`

**Evidence — Kahuna:**
- `kahuna/public/js/services/api/media-api.js:42–62` (`offset: offset, length: length`)
- `kahuna/public/js/search/results.js:~841` (`ctrl.maxResults = 100000`)

**Confidence:** `kahuna-code-confirmed-partial`

---

### 10.2 Velocity-aware extend trigger (no blank gaps at high scroll speed)
**Score (a/b/c):** 1/2/2 = **5** | **Audience:** both | **Demo:** comparison video

**What Kahuna does today:** Fixed lookahead via `gu-lazy-table-preloaded-rows="4"`. At high scroll speeds, content loads slightly behind the scroll position causing momentary blank rows.

**What Kupua does:** Scrolling is demonically faster. The extend-trigger lookahead widens automatically from 50 items at rest to 200 items during fast scrolling. Prepend compensation prevents "swimming" when new items are inserted above the viewport.

**Evidence — Kupua:**
- `kupua/exploration/docs/00 Architecture and philosophy/03-scroll-architecture.md:220–240` (velocity-aware forward threshold explanation)
- `kupua/src/hooks/useDataWindow.ts` (`forwardExtendThreshold()` — threshold widens from `EXTEND_THRESHOLD=50` to up to `PAGE_SIZE=200` based on EMA velocity)
- `kupua/src/constants/tuning.ts:50–70` (`VELOCITY_EMA_ALPHA`, `VELOCITY_LOOKAHEAD_MS`, `VELOCITY_IDLE_RESET_MS`)
- `kupua/src/hooks/useScrollEffects.ts:402–437` (prepend compensation)

**Evidence — Kahuna:**
- `kahuna/public/js/search/results.html:159` (`gu:lazy-table-preloaded-rows="4"`, static)

**Confidence:** `kahuna-code-confirmed-partial`

---

### 10.3 Purpose-driven animations that signal async state
**Score (a/b/c):** 1/1/2 = **4** | **Audience:** both | **Demo:** none

**What Kahuna does today:** No equivalent signaling animations. Async operations (sort, navigation) either complete fast enough to need no signal or produce no feedback at all. New images arriving via a "N new" ticker button appear without any visual distinction from existing images.

**What Kupua does:** Three animations in the codebase (`index.css:70` names two of them explicitly: "Two subtle animations for communicating state to the user"). None is decorative; each communicates a specific state the user would otherwise have no way to distinguish from a bug or a stale view:

1. **Sort-around-focus status pulse** (`StatusBar.tsx:175`). When a sort change triggers the position-preservation seek (§1.1) — finding the focused image in the new sort order via a server walk — the status bar shows a pulsing "Finding image…" or "Seeking…" label. This signals that the brief position-0 flash is intentional and temporary, not a failure. The design rationale from `deviations.md`: "showing stale data while computing is better than blocking — the alternative would freeze the UI for 100–300 ms."

2. **Scrubber loading dot** (`Scrubber.tsx:1216`). A pulsing `●` dot lives in the scrubber label at all times but is `visibility: hidden` at rest (always in the DOM to prevent layout-width twitch on state changes). When the scrubber seek is in flight — user dragged to a position but data hasn't arrived yet — the dot pulses, signalling "seek in progress, not broken."

3. **Arriving images slide-in** (`index.css: kupua-arrive`, `ImageGrid.tsx:911`, `ImageTable.tsx:472`). When new images are prepended to the buffer (e.g. after clicking the "N new" ticker), each newly arrived image plays a spring-eased slide-down from –8 px + fade-in over 0.8 s (`cubic-bezier(0.22, 1, 0.36, 1)`). The `_arrivingImageIds` set is written **atomically with the result data** in the same React render, so there is no one-frame flash of unclassed content. The set is cleared after 1 500 ms. This visually distinguishes newly prepended images from images already in the buffer — without it, they would appear silently among existing results with no indication of which ones are new.

The animations exist because the underlying operations do — each one closes the gap between what the system is doing asynchronously and what the user can perceive.

**Evidence — Kupua:**
- `kupua/src/index.css:69–106` (`kupua-arrive` keyframe + `.anim-arriving` class)
- `kupua/src/components/StatusBar.tsx:175` (`animate-pulse` on `sortAroundFocusStatus`)
- `kupua/src/stores/search-store.ts:1139,1387` (sets `"Finding image…"` / `"Seeking…"`)
- `kupua/src/components/Scrubber.tsx:1216` (`animate-pulse` dot, `visibility` toggled not presence)
- `kupua/src/stores/search-store.ts:1879,1911` (`_arrivingImageIds` set atomically, cleared after 1 500 ms)
- `kupua/exploration/docs/deviations.md:~1095` ("showing stale data while computing is better than blocking")

**Confidence:** `kahuna-code-confirmed-absent`

---

## 11. URL & Shareability

### 11.1 Kahuna URL compatibility + Zod-validated param schema
**Score (a/b/c):** 2/2/2 = **6** | **Audience:** both | **Demo:** none

**What Kahuna does today:** `$stateParams` encodes search state in the URL. The param names are `query`, `since`, `until`, `nonFree`, `orderBy`, `uploadedBy`, `useAISearch`, `dateField`, `takenSince`, `takenUntil`, etc. Image detail is a separate route: `/images/:id`. Unknown params are silently ignored.

**What Kupua does:** Two explicit compatibility guarantees for migration:

1. **Search param name parity.** Every Kahuna URL param (`query`, `since`, `until`, `nonFree`, `orderBy`, `uploadedBy`, `takenSince`, `takenUntil`, etc.) is preserved exactly in `search-params-schema.ts` / `types.ts`. A Kahuna bookmark or shared URL loads correctly in Kupua with no translation needed.

2. **Legacy image detail redirect.** Kupua's image detail is an overlay at `/search?image=:id`, not a separate route. `routes/image.tsx` registers `/images/:imageId` and immediately redirects to `/search?image=:imageId`, so Kahuna bookmarks and direct image links resolve to the overlay rather than a 404.

Additionally, the Zod schema applies `.catch(undefined)` to every field, so any malformed or unrecognised param value silently becomes `undefined` (safe default) rather than being forwarded as garbage to the ES query.

**Why it's better:** Migration risk is low. Existing Kahuna bookmarks, shared URLs, and integrations that link to `/images/:id` all continue to work in Kupua without any URL rewriting.

**Evidence — Kupua:**
- `kupua/src/lib/search-params-schema.ts` (Zod schema with `.catch(undefined)` on all fields)
- `kupua/src/dal/types.ts:27–29` (explicit comment: param names match Kahuna's URL)
- `kupua/src/routes/image.tsx` (`/images/:imageId` → `/search?image=:imageId` redirect)

**Evidence — Kahuna:**
- `kahuna/public/js/search/results.js:83–104` (`$stateParams` injection — param names are the canonical reference)

**Confidence:** `kahuna-code-confirmed-partial`

---

### 11.2 Selective history entry (no history spam on typing)
**Score (a/b/c):** 1/1/2 = **4** | **Audience:** both | **Demo:** none

**What Kahuna does today:** Every `$state.go()` call typically pushes a history entry. Debounced search-box typing can push multiple entries per keystroke, flooding the browser history.

**What Kupua does:** Debounced typing uses `history.replaceState`; only "committed" view changes (opening an image, changing sort, visiting a collection) use `pushState`. One meaningful back-button press undoes one meaningful action.

**Evidence — Kupua:**
- `kupua/exploration/docs/00 Architecture and philosophy/04-browser-history-architecture.md:40–54`

**Evidence — Kahuna:**
- `kahuna/public/js/search/results.js:~920` (`$state.transitionTo(…)` on every query change)

**Confidence:** `kahuna-code-confirmed-partial`

---

## 12. Metadata UI & Enrichment

### 12.1 Client-side syndication status fixes stale-deny lease bug
**Score (a/b/c):** 2/2/3 = **7** | **Audience:** both | **Demo:** screenshot

**What Kahuna does today:** Relies on the `active` flag stored in Elasticsearch (set by media-api when leases are created/modified). If the lease has expired but the index hasn't been reprocessed, images remain marked "syndication denied" even after the embargo lifts. This affects badge display in search results — expired deny-syndication leases stay shown as "blocked" indefinitely until a reindex.

**What Kupua does:** Syndication status is computed on the client from raw `syndicationRights`, `leases` (with `startDate`/`endDate`), and `usages` fields. The `active` flag is ignored. A six-state model (SY-0 through SY-5) is calculated in `calculate-syndication-status.ts`.

**Why it's better:** Expired embargoes clear automatically without waiting for a reindex.

**Evidence — Kupua:**
- `kupua/src/lib/syndication/calculate-syndication-status.ts` (comment: "date-based via `isLeaseActive` rather than trusting the stale ES `active` snapshot. Deviates from Kahuna/media-api’s Image.scala existence-only check.")
- `kupua/exploration/docs/deviations.md` (“expired deny-syndication leases remain in the ES array and Kahuna shows them as ‘blocked’ forever”)
- `kupua/exploration/docs/00 Architecture and philosophy/07-syndication-and-leases.md:87–95`
- Commit `528a51b61` (syndication and leases implementation)

**Confidence:** `kupua-code-confirmed` (Kupua source explicitly documents deviation from Kahuna’s stale-`active` behaviour)

---

### 12.2 Cost and validity computed client-side (works without Grid API)
**Score (a/b/c):** 1/2/2 = **5** | **Audience:** both | **Demo:** none

**What Kahuna does today:** Cost classification and validity indicators are derived server-side by media-api and returned in the API response.

**What Kupua does:** `lib/cost/` computes Free/Pay/Conditional cost from ES metadata fields locally. `lib/derive-enriched-image.ts` (`deriveImage()`) merges the ES baseline with TS-computed fields and an optional Grid API overlay. This makes Kupua fully functional against a bare Elasticsearch cluster with no Grid API.

**Evidence — Kupua:**
- `kupua/src/lib/derive-enriched-image.ts`
- `kupua/exploration/docs/00 Architecture and philosophy/enrichment-strategy.md:104–135`

**Confidence:** `inferred-from-doc-only`

---

### 12.3 Promoted metadata fields (no "Additional Metadata" accordion)
**Score (a/b/c):** 1/1/2 = **4** | **Audience:** both | **Demo:** screenshot

**What Kahuna does today:** Fields like Byline Title, Source, and Supplier's Reference are hidden inside a collapsed "Additional Metadata" section in the info panel. The `gr-image-metadata.html` template does not explicitly list these fields — they fall through to an `ng-repeat` loop that renders any remaining `rawMetadata` keys not claimed by the explicit panel sections.

**What Kupua does:** All registered fields are visible in the detail panel by default, ordered by `detailLayout` priority in the field registry. No collapsible "more" section exists.

**Evidence — Kupua:**
- `kupua/exploration/docs/00 Architecture and philosophy/field-catalogue.md:108,113,115` (`bylineTitle`, `source`, `suppliersReference` all marked `kupua-improves` / promoted from Additional Metadata)
- `kupua/src/lib/field-registry.tsx` (`detailLayout` property)

**Evidence — Kahuna:**
- `kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html:738–780` (Additional Metadata `ng-repeat` section; `bylineTitle`, `source`, `suppliersReference` absent from explicit `dt` list, confirmed falling through)

**Confidence:** `kahuna-code-confirmed`

---

## 13. Not Yet Better / Worse / Missing

Kupua is a read-only, search-and-browse frontend. Everything that requires writing to Grid is absent. This is a deliberate phase boundary, not an oversight — but it is a real gap.

1. **No metadata editing.** Kahuna provides full IPTC field editing inline (caption, credit, copyright, rights, keywords, etc.). Kupua is read-only. This is the most significant missing feature for editorial workflows. Reference: `kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js`.

2. **No image upload.** Kahuna's drag-and-drop uploader (`dnd-uploader.js`) and batch upload job queue are absent from Kupua. Kupua has no write operations against any Grid service.

3. **No crop / image operations tool.** Kahuna links to the crop editor and displays existing crops. Kupua shows metadata but has no image manipulation.

4. **No bulk write operations.** Kahuna supports batch Archive, Delete, Download, and Export from the multi-select toolbar (`results.html:112–152`). Kupua's selection UI exists but has no write actions wired up.

5. **No AI-assisted search (yet).** Kahuna source contains `$stateParams.useAISearch` and an `aiSearchResultLimit` config path (`results.js:~846`), suggesting an AI/vector search feature exists behind a flag. Kupua has no equivalent currently, but AI search is under active development and will be added. Confidence: `kahuna-config-gated` — PROD status unknown.

6. **No BBC-specific features.** Kahuna contains several features specific to BBC's deployment that Kupua currently lacks entirely: (a) **"Send to Photo Sales" dispatch** — a workflow triggered from the multi-select toolbar (`results.js:125`, `search/results.html:102`), gated by `_clientConfig.showSendToPhotoSales`; confirmed BBC-only by `sendToCapture-config.js` ("contact bbc-images-support@bbc.co.uk"). (b) **BBC usage rights summary** — `gr-usagerights-bbc.tsx` derives a bespoke rights label based on BBC credit detection logic, used by `gr-usagerights-summary.tsx`. Kupua shows syndication *status* from ES but has no dispatch action and no BBC-specific display logic.

7. **No usage rights management.** Kahuna's info panel includes usage rights editing (contracts, restrictions). Kupua shows usage rights data from ES but cannot modify them.

8. **No "More Like This" discovery.** Kahuna has a `gr-more-like-this` module (`results.js:780`) for similar-image discovery. Kupua has no discovery features.

9. **Authentication not yet integrated.** Kupua connects directly to ES with no per-user auth. Kahuna is fully auth-gated. This is a Phase 3 item (`GridApiDataSource`).

10. **No user help UI.** Kahuna ships three contextual help surfaces that Kupua lacks entirely: (a) a **search syntax help overlay** (`search/syntax/syntax.html`) — a dismissible panel explaining CQL filter syntax with worked examples (filter by credit, copyright, usage history, etc.), triggered from the search bar; (b) a **keyboard shortcut help overlay** — lists all registered shortcuts from the `gr-keyboard-shortcut` service; (c) a **usage rights documentation link** (`usage-rights/usage-rights-editor.html:9`) — a configurable external URL (`_clientConfig.usageRightsHelpLink`) linked from the usage rights editor panel.

11. **No user-permission awareness and no dynamic server config.** Kahuna reads `window._clientConfig` (injected at page load by the server) to gate features per deployment and per user: `usePermissionsFilter`, `showSendToPhotoSales`, `usageRightsHelpLink`, `useAISearch`, and others. Kupua currently has no equivalent — some values are mocked to avoid hardcoding constants, but there is no real dynamic config and no user-permission-aware UI. This means permission-gated features (e.g. the `is:` filter predicates based on user identity) and deployment-specific customisation cannot yet work. Both are planned but are a real current gap, separate from the auth-gating gap noted in §13.9.