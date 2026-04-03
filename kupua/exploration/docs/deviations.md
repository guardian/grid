# Deviations

> This file documents intentional differences between kupua and Grid/kahuna,
> and places where the code departs from library conventions or idiomatic
> patterns.  Its purpose is to stop future maintainers (human or agent)
> from "fixing" things that are intentional, and to make the trade-offs
> visible for review.
>
> **Update this file when a new deviation is introduced.**

Last updated: 2026-04-02

---

## From Grid / Kahuna

### 1. `nonFree` default is "show all" (unchecked)

In production kahuna, the `nonFree` default depends on the user's
`showPaid` permission (fetched from `mediaApi.getSession()`).  Most users
default to free-only; users with the `showPaid` permission see everything.

Kupua has no auth, so there is no session to query.  The default is
`nonFree=true` (show all images, checkbox unchecked).  When the user
checks "Free to use only", `nonFree` is removed from the URL and the
free-to-use category filter is applied.

When auth is added, this should be revisited to respect the user's
`showPaid` permission, matching kahuna's behaviour.

### 2. ~~Route path is `/` not `/search`~~ — RESOLVED

Kupua now serves the search page at `/search`, matching kahuna's URL schema.
The image detail view is an overlay within the search route (at
`/search?image=:imageId`), not a separate route.  `/images/:imageId`
redirects to `/search?image=:imageId&nonFree=true` for backward compat.
The root path `/` redirects to `/search?nonFree=true`.

### 3. Free-to-use filter is client-side category list

Kahuna delegates the free-to-use filter to the Grid media-api, which
evaluates it server-side using `SearchFilters.scala`.  Kupua talks
directly to Elasticsearch, so the filter is a hard-coded `terms` query on
`usageRights.category` in `es-adapter.ts`.  The category list was copied
from `SearchFilters.scala`'s `freeToUseCategories`.

If the canonical list changes in Grid, kupua's copy will drift.  This
would go away if kupua switches to the Grid API data source, but direct ES
access is an intentional architectural choice for read-only work.

### 4. Sort aliases live in the ES adapter, not in a shared config

Kahuna's sort aliases (e.g. `taken` → `metadata.dateTaken`) are defined in
the Scala API.  Kupua duplicates them in `buildSortClause` inside
`es-adapter.ts`.  Same drift risk as §3; same mitigation — keep the alias
map small and review if discrepancies appear.

### 5. `track_total_hits: true` on every search

Kahuna / the Grid API does not always request exact totals from ES (the
default ES 8.x cap is 10,000).  Kupua sets `track_total_hits: true` on
every search so the result count in the UI is always accurate.  This has a
minor performance cost on very large result sets.  No issues observed so
far against real ES clusters (~9M docs), but should be revisited if
query latency becomes a problem on expensive queries.

### 6. No `logoClick` custom event

Kahuna dispatches a `window.CustomEvent("logoClick")` when the logo is
clicked.  Several components (`gr-permissions-filter`, `gr-sort-control`,
`gr-my-uploads`) listen for this to reset their own state.  Kupua doesn't
need this — the logo is a `<Link>` that navigates to `/search?nonFree=true`,
and the URL-sync cycle resets all state automatically.

### 7. Fonts are self-hosted copies, not fetched at runtime

Kahuna serves Open Sans from its own Play Framework asset pipeline
(`/assets/stylesheets/fonts/…`).  Kupua copies the same woff2 files into
`public/fonts/` and references them with absolute-path `@font-face` `src`
URLs.  The font files are byte-identical to kahuna's — they are the same
modified builds, not vanilla Google Fonts downloads.

### 8. CQL typeahead uses ES aggregations instead of Grid API endpoints

Kahuna's CQL typeahead resolvers call the Grid media-api's
`/suggest/metadata/{field}` and `/edits/labels` endpoints.  Kupua has no
Grid API connection.  Instead, `typeahead-fields.ts` builds resolvers that
query ES directly via terms aggregations on keyword fields (e.g.
`metadata.credit`, `metadata.keywords`, `exports.author`).

The `buildTypeaheadFields` function takes the `ImageDataSource` as input.
When/if the DAL switches to `GridApiDataSource`, the resolvers will
automatically use live API suggestions with no CQL component changes.

### 9. Date filter UI improvements over kahuna

Kupua's date filter adds several improvements over kahuna's `gu-date-range`:
- Quick-range presets (Today, Yesterday, Last 7/30 days, Past year)
- Blue dot indicator when a non-default range is active
- Combined button label showing the active range and date type
- ESC to close dropdown

These are intentional enhancements, not parity deviations.

### 10. ~~Single "Dimensions" column replaces separate Width/Height~~ — REVERSED

Kupua initially merged Width and Height into a single "Dimensions" column
sorted by a Painless script (`w × h`). This was reversed because the
script sort was unusably slow for deep seeks — Strategy B (iterative
`search_after` with 10k chunks) took ~60s through SSH tunnels to reach
positions beyond 100k. The script sort prevented use of percentile
estimation (which only works on plain field values).

Kupua now has three columns: **Dimensions** (display-only, shows oriented
`w × h`), **Width** (sortable, `source.dimensions.width`), and **Height**
(sortable, `source.dimensions.height`). Both Width and Height are plain
integer fields that use the fast percentile estimation path (~200ms for any
depth). Users can sort by Width alone, Height alone, or both via
shift-click secondary sort — strictly more powerful than pixel count.

The entire script sort infrastructure was removed: `scriptSorts` map,
`isScript` flag in `parseSortField`, Strategy B iterative skip loop in
seek, script handling in `reverseSortClause`, `countBefore`, and
`searchAfter`. ~120 lines deleted.

**Migration impact:** No longer a concern — Width/Height are plain field
sorts that work with `fieldSort()` in media-api's `sorts.scala`.

### 11. CQL free-text search uses simpler `cross_fields` strategy

Kahuna's Scala `QueryBuilder` constructs free-text queries with
field-specific boosting, `minimum_should_match`, and other tuning.
Kupua's `parseCql()` uses a straightforward `multi_match` with
`type: "cross_fields"` and `operator: "and"` across the same field set.

Search results may rank differently for the same query.  This is
acceptable for read-only work and can be revisited if ranking parity
with kahuna becomes a priority.

### 12. End key scrolls to bottom of loaded results (not last item in index)

Kahuna's `scrollEnd` computes `rows - currentRowTop` to jump to the last
loaded row.  Kupua does the same — End scrolls to the bottom of
the scroll container, which also triggers `loadMore()` via the infinite
scroll handler.

When windowed scroll + `search_after` pagination is implemented, End will
need to issue a direct ES query for the **last page** of results — a seek
rather than a scroll.  The data window will be replaced with the last N
items, and the scrubber thumb will jump to 100%.  This is analogous to
Google Photos' "seeking" mode and is tracked in the scrollbar design notes
in `migration-plan.md`.

### 13. Typeahead value suggestions via terms aggregation for keyword fields

Kahuna's CQL typeahead has resolvers for some keyword fields (`credit`,
`source`, `supplier`, `category`, `label`, `uploader`) via the Grid API's
`/suggest/metadata/…` endpoints, plus completion suggesters for `credit`
and `photoshoot`.

Kupua replaces all of these with **terms aggregations** on the
corresponding keyword fields in ES.  This is simpler (one strategy instead
of two) and shows all values ranked by popularity immediately when the user
types `:` — completion suggesters require at least one character.

Additional keyword fields that kahuna left without resolvers (`croppedBy`,
`keyword`) now also have terms-aggregation resolvers.  `filename` is
registered as a field but has no resolver (filenames are nearly always
unique, so aggregation is pointless).

Text-analysed fields (`by`, `city`, `copyright`, `country`, `description`,
`illustrator`, `location`, `person`, `specialInstructions`, `state`,
`suppliersReference`, `title`) have no value suggestions — same as kahuna.
A better approach (e.g. keyword sub-fields or completion suggesters added
to the ES mapping) will be explored later.

### 14. Sort scrolls to top (violates "Never Lost" principle)

Sorting resets scroll position to the top of the table, matching every
major data table (Gmail, Sheets, Finder, Explorer) but deviating from
kupua's own "Never Lost" principle (`frontend-philosophy.md`).

Horizontal scroll (`scrollLeft`) is preserved on sort-only changes —
the user may have scrolled right to reach the column header they clicked.

**Why:** `search()` returns only the first page (~50 rows at offset 0).
Preserving scroll position at row N while only rows 0–49 have data causes
an infinite gap-detection → loadRange → placeholder pulsing loop
(performance-analysis.md finding #2).

**Sort-around-focus: attempted and reverted.** We built ~340 lines across
6 files to find the focused image's new position via ES `_count` and scroll
there. Hit three walls: (1) `max_result_window` caps `from/size` at 100k —
most unfiltered sorts land well beyond; (2) equal sort values — `_count`
returns position of the *value* not the *image*; (3) growing complexity for
diminishing returns. See performance-analysis.md findings #2, #4, #5 for full analysis.

**Real fix:** `search_after` + windowed scroll (scrubber). With cursor-based
pagination there's no depth cap. Until then, scroll-to-top is correct.

### 15. Alt+key modifier for keyboard shortcuts in editable fields

Kahuna's panel shortcuts (`L`, `M`) only work when focus is NOT in the
search box. This makes them unreliable — users think shortcuts are broken
half the time.

Kupua uses a universal pattern: bare key when focus is not in an editable
field, `Alt+key` when it is. Both combos work when not editing. This
means `[`/`]` (panels) always have a way to fire regardless of focus state.
`f` (fullscreen) uses the same system and is registered in both contexts:
in image detail view it toggles the detail container's fullscreen (via
`useFullscreen`), and in grid/table view it activates `FullscreenPreview`
— a lightweight true-fullscreen peek via the Fullscreen API. The shortcut
stack ensures only one handler is active: when ImageDetail mounts, its `f`
registration pushes on top and FullscreenPreview's becomes dormant. When
no image is focused in grid/table, `f` is a no-op (no ambiguity).

`Alt` was chosen over `Cmd`/`Ctrl` because:
- `Cmd+F` is browser Find — sacred, never intercept
- `Cmd+[`/`Cmd+]` are browser Back/Forward
- `Alt+letter` on macOS types dead characters (`ƒ`, `"`, `'`) — irrelevant
  in a CQL search field for an image DAM
- `Alt` has no browser or OS conflicts on any platform

**Trade-off:** macOS users can't type `"` (curly quote via Option+[) or `ƒ`
(Option+f) while the search box is focused. Zero practical impact — CQL
uses straight quotes and nobody searches for typographic symbols.

Centralised in `lib/keyboard-shortcuts.ts` with a single `document`
capture-phase listener. Components register via `useKeyboardShortcut` hook.

### 16. Direct ES access bypasses media-api — migration surface

Kupua talks to Elasticsearch directly for all read operations, bypassing
Grid's `media-api` entirely. Kahuna never touches ES — it calls
`media-api` (Scala/Play), which handles CQL parsing (`querysyntax/`),
query building (`QueryBuilder.scala`), filter construction
(`SearchFilters.scala`), sort aliases (`sorts.scala`), and response
shaping (`ImageResponse.scala`) — ~2,200 lines of Scala.

Kupua replicates this logic in ~1,760 lines of TypeScript across 5 files:

| Kupua file | Grid equivalent |
|---|---|
| `es-adapter.ts` (1020 lines) | `ElasticSearch.scala` + `sorts.scala` + `SearchFilters.scala` |
| `cql.ts` (477 lines) | `querysyntax/` + `QueryBuilder.scala` + `MatchFields.scala` |
| `field-registry.ts` (644 lines) | `ImageResponse.scala` (field extraction) + `sorts.scala` (sort keys) |
| `types.ts` (321 lines) | `ElasticSearchModel.scala` (param types) |
| `es-config.ts` (91 lines) | Config / safeguards (no Grid equivalent) |

**When kupua connects to media-api (Phase 3+, required for writes):**

The likely architecture is **dual-path** — direct ES for reads (fast,
flexible, supports custom aggregations), media-api for
writes (metadata editing, crops, leases, collections). This means the
ES read path stays as-is and writes go through a new
`GridApiDataSource` adapter.

If a single-path architecture is chosen instead (all traffic via
media-api), the following kupua-specific features need migration:

1. ~~**`_script:dimensions` sort**~~ — **Resolved.** Dimensions script sort
   removed; Width and Height are plain integer field sorts that work
   natively with media-api's `fieldSort()`. See §10.
2. **Typeahead via terms aggregations** — kupua runs terms aggs directly
   on ES for CQL value suggestions. media-api has
   `/suggest/metadata/{field}` but only for a subset of fields. See §13.
3. **CQL parsing** — kupua uses `@guardian/cql` (TypeScript); media-api
   uses its own Scala `querysyntax/Parser`. In the API path, the CQL
   string passes through verbatim to media-api which parses it
   server-side, so `cql.ts` is unused. But any kupua-specific CQL
   extensions (if added) would need to be upstreamed.
4. **Custom filters** — `es-adapter.ts` builds filter clauses
   (free-to-use, date ranges, hasCrops, etc.) that mirror media-api's
   `SearchFilters.scala`. In the API path these map to HTTP query params
   (`free`, `since`, `until`, `hasExports`, etc.) — straightforward
   1:1 mapping, ~100 lines.
5. **Response shape** — direct ES returns raw `_source` documents
   (kupua's `Image` type). media-api wraps them in HATEOAS JSON with
   links, actions, cost calculation, signed URLs. A `GridApiDataSource`
   would need to unwrap this or kupua's components would need to
   consume the richer shape.

**Recommendation:** Dual-path (ES for reads, API for writes) avoids all
of the above. The only new code is the write adapter. This is already
the plan in `migration-plan.md` Phase 3.

### 17. Prefetch pipeline — fire-and-forget replaces debounced abort

**What:** Kupua's `ImageDetail.tsx` (Era 3, commit `85673c0d4`) used
`fetch()` + `AbortController` with a 400ms debounce for prefetching
nearby images. Kupua now uses fire-and-forget `new Image().src` (Era 2
approach), direction-aware (4 ahead + 1 behind, PhotoSwipe model),
`fetchPriority="high"` on the main `<img>`, and a T=150ms throttle gate
that suppresses prefetch batches during held-key rapid traversal.

**Why:** The 400ms debounce killed the rolling pipeline at any browsing
speed faster than ~500ms/image. At 200ms/step (fast flick), prefetches
never fired — landing image was 500ms cold imgproxy latency. Experiment
data confirmed: landing dropped from 400-540ms to 0ms across 7/8 speed
tiers after the fix. The throttle gate (T=150ms) reduces imgproxy
contention at held-arrow-key speeds (<150ms/step) without ever firing at
normal browsing speeds (≥200ms/step).

**Trade-off:** Abandoned requests are never cancelled (unlike Era 3).
In-flight prefetches for images the user has already passed consume
imgproxy processing time and browser connections. At normal speeds this
is negligible (browser deduplicates same-URL requests). At extreme rapid
speeds the throttle gate halves the request volume. The net effect is
dramatically better: 0ms landing at moderate/fast speeds vs 400-540ms.

Full experiment data: `exploration/docs/traversal-perf-investigation.md`.

---

## From library defaults / conventions

> **Browser & CSS workarounds index** — fights with browsers, the web
> platform, and CSS that required overrides, hacks, or non-obvious
> patterns.  Each item lives in context with the feature it supports;
> this index exists for discoverability.
>
> | Workaround | Where | Why |
> |---|---|---|
> | `contain: strict` on scroll containers | `index.css` `.hide-scrollbar` / `.hide-scrollbar-y` | Firefox recalculates layout for the entire page on every virtualizer repositioning without it |
> | `scrollbar-width: none` + `::-webkit-scrollbar { display: none }` | `index.css` | No CSS way to hide only the vertical scrollbar cross-browser; hide both, add a proxy `<div>` for horizontal — see §19 (Grid/Kahuna), §9 below |
> | Horizontal scrollbar proxy `<div>` with bidirectional `scrollLeft` sync | `ImageTable.tsx` | The only cross-browser way to show h-scroll while hiding v-scroll (Chrome 121+ `scrollbar-width` kills the `::-webkit-scrollbar` pseudo-element axis model) |
> | `opacity-0 + pointer-events-none` instead of `display: none` for hidden search UI | `search.tsx` | `display: none` resets `scrollTop` to 0; opacity keeps scroll position intact |
> | Synthetic `scroll` event after programmatic `scrollTop = 0` | `scroll-reset.ts`, `ImageTable.tsx` | Programmatic `scrollTop` changes on hidden (`opacity-0`) containers don't always fire native scroll events; virtualizer needs the event |
> | Synthetic `mousemove` / `mouseup` with scroll-adjusted `clientX` during column resize drag | `ImageTable.tsx` resize handle | TanStack Table's `getResizeHandler()` has no scroll awareness; cursor stays still in viewport space while container scrolls — see §8 below |
> | Capture-phase `mouseup` blocker after resize drag with scroll | `ImageTable.tsx` resize handle | Real browser `mouseup` carries unadjusted `clientX`; must be blocked so only the synthetic (adjusted) event reaches TanStack — see §8 below |
> | `inline-block` / `inline-flex` layout instead of JS-computed widths | `ImageTable.tsx` table root + header | Browser rounds each cell's pixel width independently at non-100% zoom; JS sum diverges from rendered total — see §9 below |
> | CSS custom properties (`--col-<id>`) via `dangerouslySetInnerHTML` `<style>` tag | `ImageTable.tsx` | Avoids 300+ `getSize()` calls per render; browser applies widths via CSS — see §10 below |
> | Single-value CSS padding in CQL theme (not shorthand) | `CqlSearchInput.tsx` | Multi-value shorthand (e.g. `"2px 6px"`) breaks `calc()` inside the `@guardian/cql` shadow DOM |
> | Capture-phase `document` listener for Home/End keys | `keyboard-shortcuts.ts`, `ImageTable.tsx` | ProseMirror inside the CQL web component's shadow DOM swallows Home/End before bubble-phase handlers fire — see §7 below |
> | `customElements.define()` one-shot guard with module-level flag | `CqlSearchInput.tsx` | Browser API is one-shot — cannot re-register an element name — see §6 below |
> | `requestAnimationFrame` for post-seek focus | `ImageTable.tsx` scroll-reset | Ensures the CQL input focus happens after the browser has flushed layout from the `scrollTop` change |
> | `useLayoutEffect` for backward/forward extend scroll compensation | `ImageTable.tsx` | Must adjust `scrollTop` before paint to prevent one-frame content shift; `useEffect` would flicker — see §23 (Grid/Kahuna) |
> | `setPointerCapture` on resize handles and Scrubber thumb | `ImageTable.tsx`, `Scrubber.tsx` | Without capture, pointer events stop when cursor leaves the element during drag (especially fast drags that exit the window) |

### 1. Custom `parseSearch` / `stringifySearch` bypassing TanStack Router's built-in helpers

**What:** `router.ts` defines `plainParseSearch` and `plainStringifySearch`
using `URLSearchParams` directly, instead of using TanStack Router's
`parseSearchWith` / `stringifySearchWith` helpers.

**Why:** Two interacting problems in the built-in pipeline:

1. `parseSearchWith` delegates to `qss.decode`, whose `toValue` function
   converts `"true"` → `boolean true` and `"123"` → `number 123`.  Our
   Zod schema declares every param as `z.string().optional()`, so
   non-string values silently hit `.catch(undefined)` and are lost.  This
   made the `nonFree` checkbox permanently stuck.

2. The default `stringifySearchWith` uses `JSON.stringify`, wrapping string
   values in quotes: `"true"` → `'"true"'` → URL-encoded as
   `%22true%22`.  Grid URLs use bare `key=value` pairs.

**Trade-off:** We lose automatic type coercion (numbers, booleans, nested
objects in search params).  This is fine because all our search params are
plain strings per the Zod schema.  If a future param needs a non-string
type, the custom serialiser will need updating.

### 2. One-time default injection in `useUrlSearchSync`

**What:** The sync hook checks on first mount whether the URL has zero
search params.  If so, it navigates to `/search?nonFree=true` (a `replace`
navigation) before proceeding with the normal sync cycle.

**Why:** The user wanted the default landing URL to explicitly show
`nonFree=true`, but TanStack Router's Zod validation can't add defaults
to the *URL bar* (only to the parsed object).  Using `z.default("true")`
would make it impossible to represent the "free only" state (absent
`nonFree`) because Zod would always fill it back in.

**Trade-off:** A `useRef` flag (`hasAppliedDefaults`) prevents re-injection
after user interaction, but it means the default-injection logic is a
special case in the sync hook rather than declarative config.  The
`DEFAULT_SEARCH` constant is the single place to change if defaults evolve.

### 3. ~~`useSearch({ from: "/" })` hard-coded route path~~ — RESOLVED

All `useSearch` calls now use `from: "/search"` and `Link` components use
`to: "/search"`, matching the search route introduced in Grid/Kahuna §2.
The mechanical find-and-replace predicted by this deviation has been done.

### 4. All search params are `z.string().optional().catch(undefined)`

**What:** The Zod schema types every URL param as `string | undefined`,
even params like `nonFree` that are logically boolean.

**Why:** URL search params are inherently strings.  Using `z.boolean()`
or `z.coerce.boolean()` would fight with our custom plain-string parser
(which deliberately keeps everything as strings — see §1 above).  Keeping
them as strings avoids a second layer of coercion and makes the
parse→validate→use pipeline trivial.

**Trade-off:** Comparisons in business logic use string equality
(`params.nonFree === "true"`) rather than truthiness checks.  This is
slightly less ergonomic but completely explicit.

### 5. Store default `nonFree: "true"` is only cosmetic

**What:** The Zustand store's initial `params` includes
`nonFree: "true"`, but this value is immediately overwritten by the
URL-sync hook on mount.

**Why:** It exists so that if the store is ever read before the first sync
cycle completes (e.g. during SSR or a race), the default matches the
intended "show all" behaviour.  In practice it is always overwritten.

**Trade-off:** The store default and the `DEFAULT_SEARCH` constant in the
sync hook must stay in agreement.  There is no single source of truth for
"what is the default state" — it's split between the store initialiser and
the hook.

### 6. `<cql-input>` Web Component registered once with baked-in typeahead

**What:** `CqlSearchInput.tsx` calls `createCqlInput(typeahead, …)` and
`customElements.define("cql-input", …)` once, guarded by a module-level
`let registered` flag.  The `useEffect` that creates the DOM element has
`[]` deps, so it runs only on mount.

**Why:** `customElements.define()` is a one-shot browser API — you cannot
re-register an element name.  The `@guardian/cql` library bakes the
typeahead configuration into the class at creation time.

**Trade-off:** If the `dataSource` changes (e.g. a future DAL swap from
ES adapter to Grid API), the typeahead resolvers that were captured at
registration time become stale.  A page reload is required to pick up a
new DAL.  The `useMemo` in the component recalculates the `typeahead`
object when `dataSource` changes, but the registered custom element class
doesn't see it.

Possible fix: instead of re-registering the element, create a new
element instance with a different tag name, or use Shadow DOM scoping.
This can be addressed if/when the DAL actually swaps.

### 7. Two-phase keyboard handling for Home/End vs arrows

**What:** `ImageTable.tsx` registers two `document` keydown listeners:
a **bubble-phase** handler for arrows and PageUp/PageDown, and a
**capture-phase** handler for Home/End.

**Why:** The CQL search input uses `@guardian/cql`'s `<cql-input>` Web
Component, which contains a ProseMirror editor inside shadow DOM.
Arrow and Page keys are listed in `keysToPropagate` inside
`CqlSearchInput.tsx`, so they bubble out of the custom element
normally and reach the bubble-phase handler.  Home/End are NOT in
`keysToPropagate` — the CQL input's `stopUnhandled` listener would
swallow them.  But even if we propagated them, ProseMirror would have
already moved the cursor before our bubble-phase handler fires.

Using capture phase on `document` lets us intercept Home/End *before*
the event reaches the shadow DOM.  `preventDefault()` then stops
ProseMirror from also handling the key.

This matches kahuna's behaviour, where angular-hotkeys fires at the
`document` level before the `gr-chips` contenteditable processes the
event.  In kahuna, Home/End do NOT have `allowIn: ['INPUT']`, but
`gr-chips` isn't a native `<input>`, so angular-hotkeys doesn't
suppress them.

**Trade-off:** Home/End *never* move the cursor inside the search box.
Users must use mouse clicks or arrow keys to navigate within their
query text.  This is the same trade-off kahuna makes.

### 8. Column resize with auto-scroll via synthetic mouse events

**What:** When dragging a column resize handle to the edge of the scroll
container, the table auto-scrolls and the column keeps resizing.  This is
implemented by dispatching synthetic `mousemove` events on `document`
with a scroll-adjusted `clientX`.  On release, a synthetic `mouseup` with
the adjusted position is dispatched first, and the real browser `mouseup`
(with unadjusted `clientX`) is blocked via a capture-phase listener.

**Why:** TanStack Table's `getResizeHandler()` listens for `mousemove`
and `mouseup` on `document` and computes the column width delta from
`clientX - startOffset`.  It has no concept of scroll.  When the
container scrolls during a drag, `clientX` stays constant (the cursor
hasn't moved in viewport space), so TanStack stops resizing.  Synthesizing
events with `clientX + scrollDelta` makes TanStack see the cursor
"moving" by the scroll amount.

**Trade-off:** We're reaching around TanStack Table's public API by
dispatching synthetic DOM events.  This is fragile — if TanStack changes
its internal event handling (e.g. switches from `mousemove` to
`pointermove`), the synthetic events would stop working.  An alternative
would be to bypass `getResizeHandler()` entirely and call
`table.setColumnSizing()` directly, but that would duplicate the resize
delta math.

### 9. Horizontal scroll uses inline-block/inline-flex, not JS-computed widths

**What:** The table's scroll layout uses `inline-block` (wrapper) and
`inline-flex` (header) so the browser determines the scrollable width
from the rendered content.  No JS-computed width (e.g. `getTotalSize()`)
is used.

**Why:** At non-100% browser zoom, the browser rounds each cell's pixel
width independently.  A JS-computed sum (e.g. `getTotalSize()`) can
differ from the actual rendered total by several pixels, causing the last
column to be clipped.  By letting the browser determine the width from
the actual rendered cells, the scroll range is always correct at any zoom.

A 32px trailing spacer after the last header cell ensures the last
column's resize handle is accessible and content isn't flush against the
table edge.

**Trade-off:** The wrapper's width depends on in-flow content only (the
header).  Absolutely positioned rows don't contribute to it — they use
`left: 0; right: 0` to stretch to the wrapper width.  If a row somehow
had wider content than the header (shouldn't happen since they share
column definitions), it would be clipped.

### 10. CSS-variable column widths instead of per-cell `getSize()` calls

**What:** Column widths are set via CSS custom properties (`--col-<id>`)
injected in a `<style>` tag on `[data-table-root]`, instead of calling
`header.getSize()` / `cell.column.getSize()` inline on each cell.

**Why:** With 16 visible columns and ~30 visible rows (plus overscan),
the per-cell approach calls `getSize()` 300+ times per render.  Each call
walks TanStack Table's state tree.  The CSS-variable approach calls
`buildColumnSizeVars()` once per render to build a CSS string, and the
browser applies the variable values to all cells via CSS — no JS per cell.
This is the pattern used in TanStack's official "performant
column-resizing" example.

**Trade-off:** Column widths are no longer directly readable from the
DOM's `style.width` (they show `var(--col-…)` instead of a pixel value).
DevTools' Computed panel still shows the resolved pixel value.  The
`<style>` tag uses `dangerouslySetInnerHTML` — safe here because the
content is fully controlled (column IDs + pixel numbers, no user input).

### 11. Memoised table body freezes during resize drag

**What:** The virtualised body is extracted into a `React.memo` component
(`TableBody`).  During a column resize drag (while
`columnSizingInfo.isResizingColumn` is truthy), the `rows` and
`virtualItems` arrays are cached in refs and not updated, keeping the
memo's props reference-stable and preventing body re-renders.

**Why:** TanStack Table updates `columnSizingInfo` on every `mousemove`
during a resize drag, which re-renders the parent component.  Without
memoisation, every frame would re-render hundreds of row/cell elements.
Since column widths are driven by CSS variables (§10 above), the body
cells pick up new widths from CSS without React touching them.  This
matches the pattern in TanStack's official performant example but avoids
the bug in that example (#6121) where the memo comparison function
incorrectly referenced stale state.

**Trade-off:** If new data arrives (e.g. `loadMore()`) during a resize
drag, the body won't show the new rows until the drag ends and
`isResizingColumn` becomes falsy.  In practice, users don't scroll to
the bottom while dragging a column resize handle, so this is invisible.

### 12. `LazyTypeahead` — decoupled key/value resolution in CQL typeahead

**What:** `lazy-typeahead.ts` defines `LazyTypeahead`, a subclass of
`@guardian/cql`'s `Typeahead` that overrides `getSuggestions()` to
decouple key suggestions from value resolution.  Used in
`CqlSearchInput.tsx` as a drop-in replacement.

**Why:** CQL's built-in `Typeahead.suggestCqlField()` fires key
suggestions and value resolvers in parallel via `Promise.all`.  This
means typing `+by` (no colon yet) immediately fires the `by` field's
value resolver — an ES aggregation query — even though the user is still
choosing a field name.  If the resolver is slow, fails, or hits an
unaggregatable field, the *entire* popover stalls in a "pending" state
(animated gradient) because `Promise.all` blocks on the slowest promise.
Key suggestions (instant, synchronous field-name matching) are ready
immediately but can't render until the value promise resolves.

`LazyTypeahead.suggestField()` separates key and value resolution:
- Key suggestions are always returned immediately (synchronous filter).
- Value resolvers are only fired when the parser has produced a
  `CqlField` node (i.e. the user has typed `:` or started a chip).
  When `CqlField.value` is undefined (colon typed, nothing after it),
  the resolver fires with `""` — matching the original Typeahead's
  behaviour of showing all values on `:`.

This matches Grid/kahuna's sequential UX: pick a field, *then* see value
suggestions — without the popover stalling.

**Trade-off:** We duplicate ~80 lines of suggestion-assembly logic that
already exists in the parent class's private methods (`suggestCqlField`,
`suggestFieldKey`, `suggestFieldValue`), plus inline a small AST-walking
utility (`getCqlFieldsFromBinary`) and infer the `TypeaheadSuggestion`
type from the parent's return type — both because `@guardian/cql` doesn't
expose them via its package entry point.  We also stash a second copy of
the fields array (`_fields`, `_fieldOptions`) because the parent's are
private.  If `@guardian/cql` changes its AST shape or suggestion types,
our override may break.

**Upstream fix:** The eager evaluation is a library design issue.  The
fix belongs in `Typeahead.suggestCqlField()` in `@guardian/cql` — don't
fire value resolvers via `Promise.all` with key suggestions; return key
suggestions immediately and resolve values independently.  An issue / PR
should be opened on `@guardian/cql` with this fix.  Once merged,
`LazyTypeahead` can be deleted and replaced with the stock `Typeahead`.

### 13. Click-to-search flips polarity instead of adding duplicates; CQL editor remount on external query change

**What:** When the user shift-clicks a table cell to add `+key:value` and
then alt-clicks the same value, kupua flips the existing chip's polarity
to `-key:value` instead of appending a second chip.  Conversely, alt-click
then shift-click on the same value flips it back.  If the chip already has
the desired polarity, the click is a no-op.

Kahuna's click-to-search (in its AngularJS `gr-chips` directive) simply
appends a new chip each time, which can produce nonsensical queries like
`+credit:Getty -credit:Getty`.

**How:** `src/lib/cql-query-edit.ts` exports `findFieldTerm()` and
`upsertFieldTerm()`.  `findFieldTerm` uses `@guardian/cql`'s parser to
walk the CQL AST and structurally match a field term by key + value
(case-insensitive), returning token positions (`start`/`end`) and polarity.
`upsertFieldTerm` uses this to either append (not present), no-op (same
polarity), or splice-replace (opposite polarity) — using exact character
offsets from the AST tokens, not string `.includes()`.

**CQL editor remount workaround:** When `handleCellClick` updates the
query externally (bypassing the CQL editor), the `<cql-input>` web
component's `attributeChangedCallback` does not reliably re-render chips
when only polarity changes.  Its ProseMirror document model appears to
normalise `+field:value` and `-field:value` to the same document
structure, so `updateEditorView` either isn't called or produces no
visible change.  To work around this, `cancelSearchDebounce()` bumps a
generation counter (`_cqlInputGeneration`) that is used as a React `key`
on `CqlSearchInput`.  When the key changes, React unmounts and remounts
the component, creating a fresh `<cql-input>` that initialises with the
correct query.

Additionally, `cancelSearchDebounce()` clears any pending debounce timer
from the CQL editor's `queryChange` → `handleQueryChange` flow, and
records the externally-set query in `_externalQuery`.  The debounce
callback checks this at fire time and skips if its captured `queryStr`
differs from `_externalQuery` — a belt-and-suspenders guard against stale
timers reverting the URL.

**Trade-off:** Remounting destroys the ProseMirror editor and recreates it,
which costs ~10ms and may briefly flash.  This only happens on cell clicks
that change polarity — not on normal typing.  The alternative (patching
the CQL input's internal state) would require reaching into the web
component's shadow DOM and ProseMirror instance, which is fragile.

**Upstream fix:** The root cause is in `@guardian/cql`'s vendored
ProseMirror diff (`findDiffStartForContent` / `findDiffEndForContent`),
which compares child nodes by content only and ignores the `POLARITY`
node attribute.  The `sameMarkup` check was removed to fix #52
(transient `IS_SELECTED` attr causing cursor disruption); the fix
re-adds a targeted `sameContentMarkup` that skips transient attrs
while detecting semantic ones like `POLARITY`.

PR: https://github.com/guardian/cql/pull/121

Once merged and released, bump `@guardian/cql` in kupua and remove the
remount workaround (`_cqlInputGeneration` key + generation-bumping in
`cancelSearchDebounce`).  `setAttribute("value", ...)` will then work
directly for polarity changes.

### 17. No migration-aware dual-index search

During a Grid index migration (`ThrallMigrationClient`), the `media-api`
queries both the current index AND the migration index simultaneously,
with a filter excluding already-migrated docs from the current index.
This ensures users see each image exactly once — either from the old
index (not yet migrated) or the new index (already migrated).

Kupua queries ES directly via the `images` alias (which resolves to the
current index only). During migration, kupua does NOT query the migration
index. This means:

- Images already migrated to the new index may show slightly stale data
  (the current index copy hasn't been updated — the migration writes to
  the new index, not updates the current one).
- After migration completion (alias swap), kupua's PIT still references
  the old physical index until the next PIT refresh (≤10 minutes) or
  re-search.

**Why this is acceptable:** Migrations are rare (~a few times per year),
take hours, and the data difference between old and new index for any
given image is minimal (migration re-indexes the same data with a new
mapping, not new content). After the alias swap, the PIT refresh timer
handles the transition within 10 minutes. This is no worse than kahuna
for users who were mid-scroll during migration.

**When this goes away:** Phase 3 (`GridApiDataSource`) would inherit
media-api's migration-aware dual-index search automatically.

See `search-after-plan.md` → "PIT and Grid's index migration" for the
full analysis.

### 18. Tiebreaker sort uses `id` field, not `_id` meta field

The Elasticsearch documentation recommends `_id` as the tiebreaker for
`search_after` pagination. However, ES 8.x disables fielddata on `_id`
by default (`indices.id_field_data.enabled = false`). Sorting by `_id`
fails with "Fielddata access on the _id field is disallowed."

Grid's mapping includes a top-level `id` field (type `keyword`) that
contains the same value as `_id`. We use `{ id: "asc" }` as the
tiebreaker instead. This is functionally identical — `id` is unique per
document and keyword-typed (efficient for sorting) — but departs from
the standard ES `search_after` examples.

**Why not enable fielddata?** It's a cluster-level setting that affects
all indices. Changing it on shared clusters (TEST/PROD) is unnecessary
risk for zero benefit, since the `id` keyword field works perfectly.

**Trade-off:** None meaningful. The `id` field is always present in Grid
documents and always equals `_id`.

### 19. Native scrollbar hidden — Scrubber is the sole scroll control

The search-after-plan.md (line ~990-999) explicitly says to keep the
native scrollbar visible alongside the custom Scrubber in Phase 2, with
hiding deferred to Phase 6. We departed from this during implementation.

**Why:** The dual-scrollbar UX was actively confusing:
- After a deep seek, the native scrollbar sits at the top of a 200-item
  buffer. Users can't scroll "up" because the buffer starts there. The
  two scrollbars represent different ranges (200 items vs 1.3M) with no
  visual distinction.
- When the Scrubber hid for small result sets (total ≤ 0), the
  content area shifted horizontally by 12px (the Scrubber's width).
- After seeking to position 0, the native scrollbar might not be at top,
  requiring the user to manually scroll a second control.

**What we did:** Applied `.hide-scrollbar` (CSS `scrollbar-width: none` +
`::-webkit-scrollbar { display: none }`) to the table/grid scroll
containers. The Scrubber is always rendered — when total ≤ 0, it shows a
disabled empty track (opacity 0.15) to prevent layout shifts. When
total > 0, it operates in two modes:
- **Scroll mode** (total ≤ buffer): directly scrolls the content
  container via `scrollTop` manipulation. No seek.
- **Seek mode** (total > buffer): triggers `seek()` to reposition the
  windowed buffer.

Wheel/trackpad scrolling still works normally (the container is
`overflow: auto` — only the visual scrollbar is hidden). The virtualizer
functions as before.

**Trade-off:** We lose the native scrollbar's momentum/inertia physics
on the Scrubber itself. But wheel/trackpad scrolling retains native
physics (the browser handles it). Only click-to-position and drag are
custom — and those don't need momentum.

### 20. Scrubber drag is purely linear seeking, not fine-grained browsing

`scrubber-nonlinear-research.md` analysed two approaches for making drag
handle both fine browsing and fast seeking:

- **Approach A (position mapping, k=2 power curve):** Thumb stays under
  cursor. Dealbreaker: thumb snaps back on release because non-linear Y ≠
  linear(position/total).
- **Approach B (velocity-based delta accumulation):** No snap-back, but
  position races ahead of visual scroll (in-buffer browsing fails) OR
  can't reach distant positions (low gain).

After implementing and testing both, **we reverted to simple linear drag
with deferred seek.** The scrubber is a seeking tool: drag = teleport to
any position (thumb follows cursor linearly, one seek on pointer up).
Fine-grained browsing uses wheel/trackpad (native scroll physics, always
worked). This matches every real-world scrubber — Google Photos, Lightroom,
YouTube, Spotify — all use linear drag for seeking.

**Key improvement over the original linear drag:** No seeks fire during
drag. Only the thumb and tooltip move. One single seek on pointer up.
This eliminates the cascading seeks that caused "forever flashing."

**Trade-off:** 1px of drag ≈ 1,600 items on TEST, ≈ 11,000 on PROD.
You can't fine-browse via drag. But wheel/trackpad covers that.

### 21. Backward extend uses reverse `search_after`, not `from/size`

Kahuna's `gu-lazy-table` loads backward pages via `from/size` with a
computed offset. Kupua originally did the same, but `from/size` is
capped at `max_result_window` (101k on PROD, 10k local). After a deep
seek (e.g. scrubber drag to position 500k), backward scrolling silently
failed.

Kupua now uses **reverse `search_after`**: flip every sort field's
direction (asc↔desc), use `startCursor` as the `search_after` anchor,
fetch the page, then reverse the returned hits. This has no depth limit.

`reverseSortClause()` is exported from `es-adapter.ts`. The `searchAfter()`
DAL method accepts a `reverse: boolean` parameter. The reversal happens
inside the adapter — callers see hits in the correct (forward) order.

**Trade-off:** Reverse `search_after` requires `startCursor` to be valid.
After eviction (forward extend evicts from start, invalidating
`startCursor`), backward extend is blocked until the next seek or search
provides a fresh cursor. This is the same behaviour as forward extend
when `endCursor` is invalidated — consistent.

### 22. Sort-around-focus uses direct searchAfter, not generic seek

Kahuna doesn't have sort-around-focus — re-sorting always resets to the
top. Kupua implements the "Never Lost" pattern: on sort-only changes,
the initial search shows results immediately at position 0, then an
async background process finds the focused image's new position and
navigates to it.

The async flow is: fetch image by ID → get sort values via
`searchAfter({ids: imageId})` → `countBefore()` → if in buffer, focus;
if outside, **directly populate the buffer** using the image's exact sort
values as `searchAfter` cursors (forward + backward pages centered on the
image). This guarantees the image is in the resulting buffer.

The previous approach used generic `seek(offset)`, which for deep positions
(>10k) employed percentile estimation + `search_after`. Percentile
estimation is imprecise — the image could land outside the resulting
buffer. The new approach bypasses estimation entirely by using the
image's own sort values as cursors.

Status indicator ("Finding image…" / "Seeking…") appears in the
StatusBar. If anything fails (image not in results, network error,
abort), gracefully degrades to staying at the top.

**Trade-off:** There's a brief moment where the user sees results at
position 0 before the view jumps to the focused image's new position.
This is by design — showing stale data while computing is better than
blocking. Google Photos does the same (shows results, then animates to
the anchor). The alternative (blocking until position is found) would
freeze the UI for 100-300ms.

### 23. Backward extend scroll compensation via useLayoutEffect

When `extendBackward` prepends items to the buffer, the virtualizer count
grows but `scrollTop` doesn't change. The visible content shifts down —
the user suddenly sees different images. Without compensation, this
triggers another `extendBackward` (the shifted viewport still shows
near-start indices), creating a cascade of backward extends that causes
"flashing random pages."

Kupua tracks `_lastPrependCount` and `_prependGeneration` in the store.
Both ImageTable and ImageGrid watch these via `useLayoutEffect` and adjust
`scrollTop` by `prependCount * ROW_HEIGHT` (table) or
`ceil(prependCount / columns) * ROW_HEIGHT` (grid) before paint.

Kahuna's `gu-lazy-table` doesn't have this problem because it uses
`from/size` pagination where the virtualizer row count is always
`total` (not buffer length) — prepending data doesn't change the count.

**Trade-off:** `useLayoutEffect` blocks paint, adding a tiny synchronous
delay. In practice this is <1ms (a single scrollTop write). The
alternative (`useEffect`, after paint) would show one frame of content
shift — a visible flicker.

### 24. Scrubber sort label interpolates dates for out-of-buffer positions

During a scrubber drag, the thumb position maps to a global position that
may be far outside the loaded buffer. Kupua's `interpolateSortLabel()`
linearly extrapolates date values from the first and last buffer entries:

```
msPerPosition = (lastDate - firstDate) / (bufferLength - 1)
estimatedDate = firstDate + msPerPosition * (globalPosition - bufferOffset)
```

For keyword sorts, the nearest buffer edge value is shown (no
interpolation possible for text).

This differs from both kahuna (which doesn't have a scrubber) and from
the original kupua implementation (which clamped to buffer bounds,
showing a static date).

**Trade-off:** The extrapolated date is approximate — it assumes uniform
distribution of the sort field across the result set. In practice, upload
dates cluster around business hours and events, so the estimate may be
off by hours or days at the extremes. This is acceptable for scrubber
orientation (the user needs "am I in 2024 or 2020?", not "which hour?").
The position counter ("650,000 of 1,300,000") remains exact.

### 25. PIT fallback: retry without PIT on 404/410

When `searchAfter()` is called with a PIT ID and ES returns 404 or 410
(PIT expired or closed), kupua retries the same request without a PIT —
querying the index directly instead.

This is needed because `seek()` can read a stale PIT from the store
that was already closed by a concurrent `search()` (e.g. when a sort
change triggers both a new search and a scrubber seek in quick
succession). The old PIT is closed before the new one is stored.

Elasticsearch's PIT documentation says results should always use the
same PIT for consistency. Kupua intentionally breaks this — the retry
uses a non-PIT search, which means the results reflect the current
index state rather than a frozen snapshot.

**Trade-off:** A concurrent index update between the PIT-based search
and the fallback retry could cause a minor position inconsistency (a
document appearing or disappearing). In practice this is invisible:
(1) kupua is read-only — it never mutates the index; (2) the retry
only fires during seek(), which replaces the entire buffer anyway;
(3) the alternative (failing the seek entirely, leaving the user
staring at stale data) is worse. The fallback is logged as a console
warning for diagnostics.

### 26. Sort-around-focus uses ratio preservation, not centre alignment

When the user changes sort order with a focused image, kupua's
sort-around-focus finds the image at its new position and scrolls to it.
TanStack Virtual's `scrollToIndex(idx, { align: "center" })` would be
the obvious choice — but it always places the item dead-centre,
regardless of where it was before the sort.

Kupua instead captures the focused item's **viewport ratio** (0 = top,
1 = bottom) before the sort change, and restores it after the image is
found at its new position. This is the same "Never Lost" ratio
preservation used for density switches.

**Implementation:** `sort-focus.ts` (same module-level bridge pattern as
`density-focus.ts`). The scroll-reset `useLayoutEffect` captures the
ratio at the sort-only skip point; the `sortAroundFocusGeneration`
effect consumes it. Falls back to `align: "start"` if no ratio was saved.

**Trade-off:** Centre alignment is predictable; ratio preservation can
place the item near the edge of the viewport if it was near the edge
before the sort. Edge clamping ensures the item is always visible.

---

### DPR-aware image sizing uses a two-tier step function, not raw `devicePixelRatio`

**What:** `detectDpr()` in `image-urls.ts` returns 1 for DPR ≤1.3 and 1.5 for
DPR >1.3. This multiplier is applied to the CSS pixel dimensions when requesting
images from imgproxy. Kahuna uses `screen.width × screen.height` directly (but
only in Firefox — Chrome/Safari/Edge get no DPR scaling at all).

**Why:** Full 2× DPR means 4× pixel count → ~2× file size → ~2× imgproxy
processing time. This would push the prefetch contention cliff from the rapid
tier (80ms/step) into moderate (500ms/step), undoing the prefetch pipeline's work.
1.5× is visually indistinguishable from 2× for photographic content. Kupua's
approach is actually more DPR-aware than kahuna for most browsers (where kahuna
sends no DPR scaling at all).

**Trade-off:** Images on 2× Retina are 0.75× physical pixels (1800/2400) instead
of 1:1. For a DAM management tool this is acceptable — text overlaid on images
would look soft, but kupua doesn't overlay text on images.

---

### Single output format for all source types (no JPEG fallback)

**What:** Kupua serves all images in AVIF (imgproxy default q63, speed 8)
regardless of the source format. PNGs and TIFFs with transparency are handled
by AVIF's native alpha channel support — no special-casing.

Kahuna detects the source format and serves PNG for transparent images and JPEG
for everything else (via the eelpie imgops fork / nginx).

**Why:** AVIF (and WebP, JXL) supports alpha channels natively. JPEG doesn't.
Kahuna's format-switching logic exists because it uses JPEG as the primary format,
which can't represent transparency. AVIF was chosen over WebP (9-15% smaller at
DPR 1.5×, embeds sRGB ICC profile for correct colour on all monitors/browsers)
and JXL (Chrome's JXL decoder is immature — 2-4× worse jank, client-side decode
too slow for rapid image traversal; revisit when jxl-rs lands in stable Chrome).
See `image-optimisation-research.md` for full format comparison data.

**Trade-off:** None meaningful. The only downside is if we ever needed JPEG output
for compatibility (e.g. downloading images for external use) — but that's a
different feature (export/download) not a display concern.
