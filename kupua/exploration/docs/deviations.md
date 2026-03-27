# Deviations

> This file documents intentional differences between kupua and Grid/kahuna,
> and places where the code departs from library conventions or idiomatic
> patterns.  Its purpose is to stop future maintainers (human or agent)
> from "fixing" things that are intentional, and to make the trade-offs
> visible for review.
>
> **Update this file when a new deviation is introduced.**

Last updated: 2026-03-26

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

### 10. Single "Dimensions" column replaces separate Width/Height

Kahuna displays width and height as separate values; Grid's API
pre-resolves orientation on the server side.

Kupua merges these into one "Dimensions" column (e.g. `5,997 × 4,000`)
that always shows oriented dimensions (`orientedDimensions` with fallback
to `dimensions`). Sorting uses a Painless script (`w × h`) to order by
total pixel count — orientation-agnostic since `w × h == h × w`. The
script sort is only evaluated by ES when the user actually sorts by this
field; zero cost otherwise.

**Trade-off:** The `_script` sort is slightly slower than a native field
sort (~10-20ms on large indexes), but only fires when explicitly
requested. A single meaningful sort (pixel count / image size) replaces
two misleading ones (sorting by raw width was wrong for rotated images).

**Migration impact (Phase 3+):** Grid's `sorts.scala` only supports plain
`fieldSort()` — no script sorts. When kupua connects to media-api for
reads, Dimensions sort must either: (a) degrade to
`source.dimensions.width` (loses the pixel-count ordering but still
works), or (b) a `dimensions` script-sort alias is added to
`sorts.scala` (trivial ~5-line change). Option (b) is preferred. If
kupua keeps direct ES access for reads and only uses media-api for
writes, this is a non-issue.

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
`f` (fullscreen) uses the same system but is only registered in image
detail view — on the search page it does nothing. Fullscreening a
search-page image was considered (open image detail + fullscreen in one
key) but rejected: ambiguous when nothing is focused, surprising when the
wrong image is focused, and likely to be obsoleted by quicklook or a
navigation paradigm change.

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
| `es-adapter.ts` (445 lines) | `ElasticSearch.scala` + `sorts.scala` + `SearchFilters.scala` |
| `cql.ts` (477 lines) | `querysyntax/` + `QueryBuilder.scala` + `MatchFields.scala` |
| `field-registry.ts` (617 lines) | `ImageResponse.scala` (field extraction) + `sorts.scala` (sort keys) |
| `types.ts` (131 lines) | `ElasticSearchModel.scala` (param types) |
| `es-config.ts` (91 lines) | Config / safeguards (no Grid equivalent) |

**When kupua connects to media-api (Phase 3+, required for writes):**

The likely architecture is **dual-path** — direct ES for reads (fast,
flexible, supports script sorts and custom aggregations), media-api for
writes (metadata editing, crops, leases, collections). This means the
ES read path stays as-is and writes go through a new
`GridApiDataSource` adapter.

If a single-path architecture is chosen instead (all traffic via
media-api), the following kupua-specific features need migration:

1. **`_script:dimensions` sort** — media-api's `sorts.scala` only does
   plain `fieldSort()`. Needs a 5-line upstream change or client-side
   degradation to `source.dimensions.width`. See §10.
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

---

## From library defaults / conventions

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
This is the pattern used in TanStack Table's official "performant
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

