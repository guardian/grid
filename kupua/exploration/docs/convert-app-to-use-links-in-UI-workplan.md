# Convert App to Use Links in the UI — Workplan

> **Status:** Planning / not started. Research complete (2026-06-30).
> **Scope:** kupua frontend only.
> **Goal in one line:** make every "click takes me somewhere" affordance a
> real `<a href>` so that **cmd/ctrl-click, middle-click and right-click →
> "Open in New Tab"** launch the corresponding search or image-detail view in
> a new browser tab — exactly like the existing Kahuna (AngularJS) frontend.

This document is written so that a series of Sonnet agents can pick up one
phase at a time and execute it. **Sections 1–3 are the generalised picture and
the cross-cutting design decisions** — read them before touching any phase.
**Section 4 is the phased workplan.** Each phase is self-contained: scope,
files, concrete steps, the modifier-key contract, side-effects to preserve,
tests, and a "what done looks like" check.

---

## 1. The generalised picture

### 1.1 What we're doing and why

Today almost every clickable thing in kupua is a `<button>` or a `<div>` with
an `onClick` that calls `navigate()` programmatically. Programmatic navigation
**cannot** be opened in a new tab: the browser has no URL to hand to "Open in
New Tab", cmd-click does nothing, middle-click does nothing, and right-click
shows a generic context menu with no "Open Link in New Tab" entry.

Kahuna gets this for free because it renders real links everywhere via
AngularUI Router's `ui-sref` / `ng-href`, which compile to real `href`
attributes. Examples in the current codebase:

- Thumbnail → image detail: `ui-sref="image({imageId: ...})"`
  (`kahuna/public/js/preview/image.html`).
- Pop-out button: `ng-href="/images/{{::ctrl.image.data.id}}"` with
  `target="_blank"` (same file).
- Click-to-search value: `ui-sref="search.results({query: ..., nonFree: ...})"`.
- Collection node: `ui-sref="search.results({query: (pathId | queryCollectionFilter), ...})"`.
- Upload page: `ng-href="/search?uploadedBy={{user.email}}&nonFree=true"`.

We want the same affordances in kupua: a user can middle-click a byline to open
"all images by that person" in a background tab, right-click a thumbnail and
"Open in New Tab", cmd-click a collection to branch off a new search, etc.

### 1.2 Why this is viable (the foundation already holds)

- **URL = source of truth.** `src/hooks/useUrlSearchSync.ts` reconstructs the
  full search state from the URL alone on cold load. A brand-new tab opened
  from a pasted/cmd-clicked URL lands correctly: a fresh `?query=…` runs a
  search; a fresh `?image=…&query=…` opens the detail overlay over the right
  results (`src/components/ImageDetail.tsx` synthesises the bare-list history
  entry on the cold-load path). Nothing essential rides only in `sessionStorage`
  snapshots — those carry scroll position, which a new tab correctly does not
  inherit.
- **Single route.** Everything lives under `/search` with state in search
  params (`src/router.ts`, `src/routes/search.tsx`). `/` and `/images/$imageId`
  just redirect. So every link is `/search?…`.
- **Pattern already proven in kupua.** The logo is already a real
  `<a href="/search?nonFree=true">` with `e.preventDefault()` on plain click
  (`src/components/SearchBar.tsx`, `src/components/ImageDetail.tsx`). We are
  generalising an existing, working pattern.
- **TanStack Router `<Link>` is already a dependency** and is currently unused.
  It renders a real `href`, does client-side nav on plain left-click, and —
  crucially — **leaves cmd/ctrl/shift/middle-click to the browser** so native
  "open in new tab/window" just works. This is our primary mechanism.

### 1.3 The two URL shapes we ever need

1. **A search** — `/search?query=<cql>&<other current params…>`.
   Used by: metadata click-to-search, pills, facets, collection nodes.
2. **An image** — `/search?image=<id>&<other current params…>`.
   Used by: thumbnails, table rows.

There is **no third shape**: fullscreen preview has no URL (it uses the native
Fullscreen API), and detail prev/next traversal is intentionally in-tab
(`navigate({ replace: true })`), so those are out of scope (see §6).

### 1.4 The single most important convention: **the href encodes the _plain-click_ action**

Several click sites already overload modifier keys for in-app meaning:

- **Shift+click** on a metadata value = **append** the term (AND-refine the
  current query) — `src/components/metadata-primitives.tsx` `useMetadataSearch`.
- **Alt+click** = **exclude** the term (NOT) — same hook.

A static `href` can only encode **one** destination. We adopt Kahuna's
convention: **the `href` always encodes the plain-click result** (for
click-to-search that means *replace the query*; for a thumbnail that means
*open this image*). Therefore:

| Gesture | What happens | Who handles it |
|---|---|---|
| **Plain left-click** | the plain action, in-tab (client-side nav) | `<Link>` + our `onClick` side-effects |
| **Shift / Alt-click** (click-to-search only) | refine / exclude, **in-tab** | our `onClick` calls `preventDefault()` then runs the existing logic |
| **cmd/ctrl-click** | open the **plain action** in a new tab | browser (native, via real `href`) |
| **middle-click** | open the **plain action** in a new background tab | browser (native) |
| **right-click → Open in New Tab** | open the **plain action** in a new tab | browser (native) |

This keeps the powerful refine/exclude gestures **and** gives every site a
sensible new-tab destination, with zero ambiguity.

### 1.5 The modifier-key collision is already solved in our favour

The research surfaced one genuine risk and it turns out to be a non-issue:
**cmd/ctrl-click is already an explicit no-op** in the selection click policy
(`src/lib/interpretClick.ts`, the `meta-or-ctrl → []` rule). So making
thumbnails/rows into anchors introduces **no collision** with selection — the
modifier the browser wants for "new tab" is exactly the one selection doesn't
use. The only real behaviour change is **middle-click** (see §3.1).

---

## 2. Foundations (build these first — everything else depends on them)

### 2.1 Auto-sort parity helper (the subtle one — do not skip)

**Problem.** The collection/AI auto-sort logic lives **inside**
`useUpdateSearchParams()` (`src/hooks/useUrlSearchSync.ts`), *not* in the URL
serializer. When a `collection:` chip appears, that hook atomically also sets
`orderBy=dateAddedToCollection` (`COLLECTION_SORT`); when an `aiQuery` appears
it switches to the AI sort. A naive static href that only sets
`query=collection:x` would open a new tab **without** the auto-sort, diverging
from what a click does in-tab.

**Fix.** Extract the auto-sort decision into a **pure function** that both the
hook and the link layer call:

```
// e.g. src/lib/orchestration/apply-auto-sort.ts
applyAutoSort(prev: UrlSearchParams, merged: UrlSearchParams): UrlSearchParams
```

It encapsulates the existing collection-chip and AI-query sort switching
(including the `_preSortBeforeCollection` / `_preSortBeforeAi` revert logic —
note these are module-level `let`s today; the **pure** function must take/return
the revert target explicitly or the link layer should only ever use the
"appearing" direction, which is all link-building needs). Then:

- `useUpdateSearchParams()` is refactored to call it (behaviour-preserving).
- The link layer (§2.2) calls it when computing a link's `search` object.

**Done when:** `useUpdateSearchParams` still passes all existing unit/e2e tests
unchanged, and `applyAutoSort` has direct unit tests for: collection chip
appears → sort switches; collection chip absent → sort untouched; ai query
appears → AI sort.

### 2.2 The link helpers

Two thin helpers, both synchronous and pure-ish:

```
// src/lib/links.ts  (new)

// Full param object → "/search?…" string. Wraps router.buildLocation so it
// reuses the registered plainStringifySearch (correct encoding + key order).
buildSearchHref(params: Partial<UrlSearchParams>): string

// Convenience for the "search" shape: merge an update onto current params,
// apply auto-sort parity, return the param object suitable for <Link search=…>.
toSearchLinkParams(current: UrlSearchParams, updates: Partial<UrlSearchParams>): UrlSearchParams
```

Notes:
- `buildSearchHref` should call `router.buildLocation({ to: "/search", search })`
  and return `.href`. `plainStringifySearch` in `src/router.ts` is **not
  exported**; prefer `buildLocation` over exporting/duplicating it.
- **Click-to-search preserves the rest of the params.** `useMetadataSearch`
  does `{ ...currentParams, query: newQuery, image: undefined }` (a merge, not a
  bare `?query=`). Link `search` objects must do the same — keep `nonFree`,
  `until`, `dateField`, etc., and clear `image`.
- For most sites we will **not** hand-build href strings at all — we pass a
  `search` object to `<Link>` (§2.3) and let it build the href. `buildSearchHref`
  exists for the few places that need a literal string (e.g. an explicit
  `target="_blank"` pop-out, or non-React code).

### 2.3 Make the shared primitives `href`-aware (the choke-point)

Almost all click-to-search flows funnel through three tiny components. Convert
them to render an `<a>`/`<Link>` when a destination is available, else fall
back to today's `<button>`:

- `ValueLink` — `src/components/metadata-primitives.tsx` (scalar values).
- `SearchPill` and `MultiSearchPill` — `src/components/SearchPill.tsx` (list pills).

Recommended shape: each accepts the **computed `search` param object** (or a
prebuilt `href`) plus the existing `onSearch` callback. Render:

```
<Link to="/search" search={linkParams} onClick={(e) => onSearch(cqlKey, value, e)} … />
```

and `onSearch` keeps the refine/exclude/preventDefault logic (§3.2). When no
`search`/`href` is provided (e.g. a future non-navigating use), render the
current `<button>`. This is one edit per primitive and it covers **both** the
single-image and multi-image metadata panels at once.

`useMetadataSearch` (the choke-point hook) should additionally expose a
`buildSearchParams(cqlKey, value)` that returns
`toSearchLinkParams(current, { query: replaceQuery, image: undefined })`, so the
primitives get their `search` object from the same place that owns the click
logic.

**Done when:** clicking a byline still replaces the query in-tab; cmd-clicking
it opens the same search in a new tab; right-click shows "Open in New Tab";
shift/alt still refine/exclude in-tab; all metadata unit tests pass.

---

## 3. Cross-cutting design decisions (get user sign-off before Phases D & E)

### 3.1 Middle-click on a thumbnail/row — **fullscreen vs new-tab** (needs a decision)

Today middle-click on a grid cell / table row opens the **Fullscreen preview**
(`src/components/ImageGrid.tsx` ~L806/818 `e.button === 1`, mirrored in
`ImageTable.tsx`). Once a cell is an anchor, middle-click natively means "open
in new background tab".

- **Recommended:** let middle-click become **open-in-new-tab** (the universal
  convention) and **remove** the middle-click→fullscreen binding. Fullscreen
  stays reachable via the `f` key and the fullscreen button in detail view.
- **Alternative:** keep fullscreen on middle-click and suppress the new-tab —
  fragile across browsers (Chrome fires on mouseup, Firefox on mousedown) and
  fights user expectation. Not recommended.

This is a **behaviour change** and must be confirmed with the user before
Phase D ships.

### 3.2 Shift/Alt refine semantics are retained (no decision needed, just discipline)

For all click-to-search sites, `onClick` must:

```
if (e.metaKey || e.ctrlKey) return;        // let the browser open a new tab
e.preventDefault();                         // plain/shift/alt → handle in-tab
// …existing replace / append(shift) / exclude(alt) logic…
```

Note the current `useMetadataSearch` calls `e.preventDefault()` **un**conditionally
(`metadata-primitives.tsx`). That line must become gated on
`!(e.metaKey || e.ctrlKey)`, otherwise cmd-click would be swallowed and never
open a new tab. Middle-click does not fire `onClick` (it's `auxclick`), so the
native new-tab proceeds regardless.

### 3.3 Facet toggle-off has no natural href (accepted compromise)

Facets are **stateful toggles** (`src/components/FacetFilters.tsx`
`handleFacetClick`: add if absent, remove if present, flip polarity if
opposite). "Add this facet" has a clean href (current query + term); "remove
this active facet" does not. Decision: render an anchor **only when the facet is
inactive** (so new-tab = "search with this facet added"); when active, keep the
plain `<button>` toggle-off. This is fine — new-tab on a removal is meaningless
anyway. Facets are therefore the **lowest-value, highest-effort** surface (§4
orders them last).

---

## 4. Phased workplan

Phases are ordered by value-for-effort. Each is independently shippable.
**Run the test surfaces named in each phase before declaring it done.** Unit
tests are mandatory after any `src/` change; e2e is mandatory after any change
touching components/hooks/scroll/focus. **Before any Playwright run, warn the
user that port 3000 (and 3010/3020/3030 for tier-matrix) must be free and
wait for confirmation.**

### Phase A — Foundations
**Build:** §2.1 `applyAutoSort` extraction + §2.2 `src/lib/links.ts` +
unit tests. No UI changes yet.
**Files:** `src/hooks/useUrlSearchSync.ts` (refactor), new
`src/lib/orchestration/apply-auto-sort.ts`, new `src/lib/links.ts`,
`src/router.ts` (only if you choose to export a serializer — prefer not to).
**Tests:** `npm --prefix kupua test` (unit). New unit tests for both helpers.
**Done when:** helpers exist and are unit-tested; `useUpdateSearchParams`
behaviour is unchanged (existing tests green); no rendered output changed.

### Phase B — Metadata values + pills (the choke-point, biggest win)
**Build:** §2.3. Convert `ValueLink`, `SearchPill`, `MultiSearchPill` to
render `<Link>` with `search` from `useMetadataSearch().buildSearchParams(...)`;
gate `preventDefault` per §3.2.
**Covers (all via the three primitives):** byline, credit, copyright, source,
title, location sub-fields, imageType, fileType, uploader, bylineTitle,
suppliersReference, alias fields, subjects, people, keywords, labels,
collections-as-links — in **both** single-image (`ImageMetadata.tsx`) and
multi-image (`MultiImageMetadata.tsx`) panels. (Full inventory in the Appendix.)
**Files:** `src/components/metadata-primitives.tsx`,
`src/components/SearchPill.tsx`. No changes needed in `ImageMetadata.tsx` /
`MultiImageMetadata.tsx` if the primitives keep their existing props plus the
new optional `search`/`href`.
**Modifier contract:** §1.4 + §3.2. Plain = replace in-tab; shift = append;
alt = exclude; cmd/ctrl/middle/right = new tab with the replace-query search.
**Tests:** `npm --prefix kupua test`; then `npm --prefix kupua run test:e2e`
(metadata click-to-search specs, focus/selection specs). Add/extend an e2e
assertion that a metadata value renders an `<a href>` whose target equals the
replace-query URL.
**Done when:** every clickable metadata value/pill is an `<a>` with a correct
`href`; in-tab replace/refine/exclude all still work; cmd-click + right-click
open the right search in a new tab; unit + e2e green.

### Phase C — Collection-tree nodes
**Build:** convert the clickable node in `src/components/CollectionTree.tsx`
(currently `<div onClick>`) to `<Link>`. `pathId` is available synchronously at
render (`node.data.data?.pathId`); nodes without a `pathId` stay non-clickable
(no href). The `search` object **must** be computed via `toSearchLinkParams`
so the **collection auto-sort** (`orderBy=dateAddedToCollection`) is encoded —
this is the payoff of Phase A. The existing exclusive-collection strip
(`removeAllFieldTerms(current, "collection")` then add) is reused to compute the
query for the `search` object; clicking an already-active node remains a no-op
in-tab (its href just points at the same state — fine for new-tab).
**Files:** `src/components/CollectionTree.tsx`.
**Tests:** `npm --prefix kupua test`; `npm --prefix kupua run test:e2e`
(collections specs). Assert the node href includes both
`query=collection:<pathId>` and `orderBy=dateAddedToCollection`.
**Done when:** clicking a collection still filters + auto-sorts in-tab;
cmd/middle/right-click opens that collection (correctly sorted) in a new tab.

### Phase D — Thumbnails + table rows (image navigation)  ⚠ needs §3.1 sign-off
**Build:** wrap the grid cell (`src/components/ImageGrid.tsx` `GridCell`) and
the table row (`src/components/ImageTable.tsx` `EnrichedTableRow`) navigable
element in `<Link to="/search" search={{ ...current, image: id }}>`.
**Critical — preserve imperative side-effects on plain activation.** The
current `enterDetail` (ImageGrid.tsx ~L680) does, and these MUST still run in
`onClick` for plain left-click:
- `trace("open-detail", …)` (perf instrumentation),
- `setFocusedImageId(id)` (focus ring + return-from-detail centring),
- `storeImageOffset(id, globalOffset, searchKey, cursor)` (scroll-restore cache,
  `src/lib/image-offset-cache.ts`),
- the SPA-nav marking that `pushNavigate` does (so detail back-navigation isn't
  doubled — see `ImageDetail.tsx` history synthesis).
Pattern: keep `enterDetail` as the `onClick`; gate per §3.2 so cmd/ctrl-click
falls through to the browser (a fresh tab cold-loads and reconstructs; the
scroll-cache side-effects are irrelevant there). For plain click, either let
`<Link>` do the nav and have `enterDetail` do only the non-nav side-effects, or
keep `enterDetail`'s `pushNavigate` and call `e.preventDefault()` — **pick one
nav path; do not navigate twice.** Recommended: `<Link>` owns the nav on plain
click; `onClick` runs side-effects only (drop the `pushNavigate`, but keep the
SPA-nav marking call that `pushNavigate` performed).
**Middle-click:** per §3.1, remove the `e.button === 1 → enterFullscreenPreview`
handlers (ImageGrid.tsx ~L806/818 and the ImageTable equivalent) so native
new-tab wins. (Only after user sign-off.)
**Table specifics:** the navigable target is the whole row, but clickable data
cells (shift/alt click-to-search) bubble to the row. Either (a) scope the
anchor to the **thumbnail cell only**, or (b) add `e.stopPropagation()` to the
data-cell click handlers so a plain click on a non-navigating cell doesn't also
follow the row href. Column resize/`ColumnContextMenu` are header-only — no
conflict.
**Selection interplay:** plain/shift/tick selection still flows through
`interpretClick`; cmd/ctrl is already a no-op there, so anchors don't disturb
it. Long-press/range selection is unaffected (context menu already suppressed
during the gesture in `useLongPress.ts`).
**Files:** `src/components/ImageGrid.tsx`, `src/components/ImageTable.tsx`
(and the cell renderer in `src/hooks/useDataWindow.ts` if the anchor lives
there).
**Tests:** `npm --prefix kupua test`; **`npm --prefix kupua run test:e2e`**
(keyboard-nav, browser-history, scrubber, selection, return-from-detail specs —
this phase is the highest e2e risk). Verify: plain click opens detail in-tab
with working back-button; scroll position restores on back; cmd/middle/right
opens detail in a new tab; selection gestures unchanged.
**Done when:** all of the above pass and the middle-click behaviour matches the
§3.1 decision.

### Phase E — Filter facets (lowest value, do last)
**Build:** per §3.3, render `<Link>` only for **inactive** facet buckets in the
three sub-sections of `src/components/FacetFilters.tsx` (`FacetSection`,
`IsSection`, `UsageFacetSection`). The `search` object = current query +
upserted term (computed via the same `findFieldTerm`/`upsertFieldTerm` logic the
handlers already use, then `toSearchLinkParams`). Active buckets keep the plain
`<button>` toggle-off. Consider extracting a shared `FacetButton` primitive
since the three sub-sections duplicate the toggle logic — optional, only if it
reduces duplication cleanly.
**Files:** `src/components/FacetFilters.tsx`.
**Tests:** `npm --prefix kupua test`; `npm --prefix kupua run test:e2e`
(facet specs).
**Done when:** inactive facets are anchors (cmd/right-click opens the
facet-added search in a new tab); active facets still toggle off in-tab.

### Phase F — Consistency clean-ups (small, optional, bundle with B/D)
- **Rights category** is plain text in the single-image panel
  (`src/components/ImageMetadata.tsx` ~L283) but a clickable `ValueLink` in the
  multi-image panel, despite the field having `cqlKey: "category"`. Make the
  single-image one a `ValueLink` too (folds into Phase B).
- **`DataSearchPill`** in the table (`src/components/SearchPill.tsx`) is a
  non-keyboard-accessible `<span>` using event-delegation. Converting it to an
  anchor is more involved (delegated clicks read `data-cql-*`). Lower priority;
  only do it if Phase D's table work makes it cheap. Note plain table clicks
  open image detail (not search), so this is shift/alt-only today.

---

## 5. Testing strategy (applies to every phase)

1. **Unit first, failing-first where you can.** For helpers (Phase A) write the
   unit test before the implementation. For UI, add a test asserting the
   rendered element is an `<a>` with the expected `href`.
2. **Identify existing tests that assert the OLD behaviour before editing.**
   Grep the e2e specs for the behaviour you're changing (focus semantics,
   middle-click, facet toggling) and update or consciously confirm them — do
   not let them fail silently.
3. **Run the full relevant surface, not just the new test.** Unit
   (`npm --prefix kupua test`) after any `src/` change; e2e
   (`npm --prefix kupua run test:e2e`) after Phases B–E (all touch
   components/hooks). Per the AGENTS test directive, run via `npm --prefix
   kupua …` from the repo root, tee output to `"$TMPDIR/kupua-test-output.txt"`,
   foreground, no `tail`/`head`/`sleep`.
4. **Playwright port warning is mandatory** — warn + wait before any e2e/perf
   run (port 3000; 3010/3020/3030 for tier-matrix).
5. **A broken test may mean the change is wrong** — do not weaken an assertion
   without reasoning about which of (test wrong / fix wrong / behaviour change
   intentional) is true.

---

## 6. Out of scope / non-goals

- **Fullscreen preview** — no URL state (native Fullscreen API), nothing to
  link. (`src/components/FullscreenPreview.tsx`.)
- **Detail prev/next traversal** — deliberately in-tab via
  `navigate({ replace: true })` (`useImageTraversal`); a new tab per neighbour
  is not the intent. Could optionally gain a right-click affordance later, not
  now.
- **CqlSearchInput / AI search input** — these are editors, not links.
- **Toolbar actions** (crop, download, share, delete) — actions, not navigation;
  separate concern.
- **Drag-and-drop embed** — Kahuna attaches drag data to its image `<a>`s for
  Composer embedding. kupua's drag story (if any) is separate; note only that
  `<a>` elements are natively draggable, so if drag-to-select or drag-embed is
  added later, set `draggable` deliberately on the new anchors.

---

## 7. Risk register

| Risk | Phase | Mitigation |
|---|---|---|
| Auto-sort diverges between click and link | A/C | `applyAutoSort` pure fn shared by both; unit-tested |
| Double navigation (Link + pushNavigate both fire) | D | One nav path only; Link owns plain-click nav, onClick does side-effects |
| Lost scroll-restore on return-from-detail | D | Keep `storeImageOffset` in onClick; e2e return-from-detail spec |
| Doubled back-presses out of detail | D | Preserve the SPA-nav marking `pushNavigate` did |
| Middle-click behaviour change surprises users | D | §3.1 decision requires user sign-off |
| `preventDefault` swallows cmd-click | B/C/E | Gate `preventDefault` on `!(metaKey||ctrlKey)` (§3.2) |
| Table row href hijacks plain cell clicks | D | Scope anchor to thumbnail cell or `stopPropagation` on cell handlers |

---

## Appendix — site inventory (from research, with file refs)

**Foundation**
- Router / single route: `src/router.ts`, `src/routes/search.tsx`,
  `src/routes/image.tsx`.
- Params + the merge/auto-sort: `src/lib/search-params-schema.ts`,
  `src/hooks/useUrlSearchSync.ts` (`useUpdateSearchParams`).

**Click-to-search choke-point (Phase B)**
- `useMetadataSearch`, `ValueLink`, `FieldValue` —
  `src/components/metadata-primitives.tsx`.
- `SearchPill`, `MultiSearchPill`, `DataSearchPill` —
  `src/components/SearchPill.tsx`.
- Field clickability config (`cqlKey`, `detailClickable`, `pillVariant`,
  `detailListStyle`, `rawValue`) — `src/lib/field-registry.tsx`.
- Covered fields (both panels): byline, credit, copyright, source, title,
  location/city/state/country, imageType, fileType, uploader, bylineTitle,
  suppliersReference, alias fields, subjects, people, keywords, labels,
  collections-as-links. Non-clickable by design: description, special
  instructions, filename, date fields.

**Collections (Phase C)**
- `handleNodeClick` / node render — `src/components/CollectionTree.tsx`
  (`pathId` sync at render; exclusive-collection strip; auto-sort via the hook).

**Image navigation (Phase D)**
- Grid: `enterDetail`, `handleCellClick`, middle-click handler —
  `src/components/ImageGrid.tsx`; side-effects `src/lib/image-offset-cache.ts`,
  `pushNavigate`/`enterFullscreenPreview` in `src/lib/orchestration/search.ts`.
- Table: `EnrichedTableRow`, data-cell click, middle-click —
  `src/components/ImageTable.tsx`; cell rendering `src/hooks/useDataWindow.ts`.
- Selection policy (cmd/ctrl already no-op) — `src/lib/interpretClick.ts`;
  long-press `src/hooks/useLongPress.ts`.
- Return-from-detail / history — `src/hooks/useReturnFromDetail.ts`,
  `src/components/ImageDetail.tsx`,
  `src/lib/orchestration/history-key.ts`, `src/lib/history-snapshot.ts`.

**Facets (Phase E)**
- `handleFacetClick`, `FacetSection`, `IsSection`, `UsageFacetSection` —
  `src/components/FacetFilters.tsx`; query edit primitives
  `findFieldTerm`/`upsertFieldTerm` —
  `src/dal/adapters/elasticsearch/cql-query-edit.ts`.

**Consistency (Phase F)**
- Rights category plain-text vs clickable — `src/components/ImageMetadata.tsx`.
- `DataSearchPill` `<span>` delegation — `src/components/SearchPill.tsx`.

**Kahuna reference patterns**
- Thumbnail link `ui-sref="image(...)"`, pop-out `ng-href="/images/{id}"
  target="_blank"`, click-to-search `ui-sref="search.results({query, nonFree})"`,
  collection node `ui-sref="search.results({query: pathId|queryCollectionFilter})"`
  — `kahuna/public/js/preview/image.html`; flat-param hrefs e.g.
  `ng-href="/search?uploadedBy={{user.email}}&nonFree=true"` —
  `kahuna/public/js/upload/jobs/upload-jobs.html`.
