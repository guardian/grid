# Convert App to Use Links in the UI — Workplan

> **Status:** Planning / not started. Research complete (2026-06-30).
> **Scope:** kupua frontend only.
> **Goal in one line:** make every "click takes me somewhere" affordance a
> real `<a href>` so that **cmd/ctrl-click, middle-click and right-click →
> "Open in New Tab"** launch the corresponding search or image-detail view in
> a new browser tab — exactly like the existing Kahuna (AngularJS) frontend.

> **Related task / execution order (2026-11-16):** [Section 8](#8-focus-indicators-separate-prerequisite-sized-task)
> specifies the mouse/keyboard focus-indicator policy, implementation boundaries,
> performance constraints and regression checks. Implement and validate it as a
> separate small change, preferably before the link phases; do not combine the
> two implementations into one unvalidated batch. This addition is planning,
> not authorization to start product changes. The June inventory and code-shape
> assumptions below must be rechecked against current source before each phase.

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
touching components/hooks/scroll/focus. Follow the [synthetic runner's port rules](../../e2e/README.md#local-projects-and-ports); leave the interactive app running.

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
4. Keep synthetic E2E separate from operator-run perf measurements.
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

## 8. Focus indicators: separate prerequisite-sized task

### 8.1 Problem and relationship to links

Kupua currently suppresses native outlines with
`:focus:not(:focus-visible) { outline: none; }` in `src/index.css`.
Reproduction: mouse-click a density button, optionally move the pointer away,
then press Escape. The same button retains DOM focus, becomes `:focus-visible`
and gains a ring. This is permitted browser behavior, not a density or router
bug. The CSS comment currently promises stronger suppression than it delivers.

The requested improvement is deliberate input-modality tracking: ordinary
keyboard activity during mouse use must not reveal a dormant control ring;
Tab navigation must reveal it. This is an established pattern, not a new user
setting. Blueprint documents the same policy as `onlyShowFocusOnTabs()`.
Do not add Blueprint or another dependency to obtain this small behavior.

Real anchors do not solve this problem: both anchors and buttons can retain
focus and match `:focus-visible`. Conversely, focus-indicator tracking does not
need href builders, auto-sort extraction, router changes or anchor conversion.
Keep actual DOM focus, Kupua's focused-image state and focus-indicator styling
distinct. In particular, this task must not change image focus/selection,
phantom/explicit focus modes, traversal, scrolling or position preservation.

### 8.2 Observable behavior contract

| Interaction | Required result |
|---|---|
| Mouse-click an ordinary button or link, then press Escape, Space, Enter or an unrelated key | No newly revealed accessibility ring solely because a key was pressed. The key's existing action still runs. |
| Same sequence after moving the pointer away | Same result; hover is not the visibility policy. |
| Tab or Shift+Tab | Enter keyboard-navigation mode before focus moves; the destination has a visible indicator. |
| Continue keyboard navigation/activation | Indicators remain available; do not suppress arrow-key navigation inside existing composite widgets or programmatic focus moves belonging to the keyboard interaction. |
| Pointer activation after keyboard navigation | Return ordinary control indicators to pointer mode without removing DOM focus. |
| Move the mouse, wheel-scroll, or let time elapse while using the keyboard | Do not switch modes or time out the indicator. |
| Focus a text-entry control | Preserve its useful existing focus/caret/border indication, including after pointer focus. Cover CQL/contenteditable and AI input as well as ordinary fields. |
| Assistive-technology or required programmatic focus | Preserve a visible indication where required; unclassified focus must not be indiscriminately hidden until someone presses Tab. |

The first row changes presentation only. It must not intercept Space/Enter,
cancel shortcuts or navigation, or promise that an action which replaces a
control leaves focus on that control. Do not make anchors emulate button
activation: native Enter activation must work; do not add Space-to-follow-link
as part of either task.

### 8.3 Implementation boundaries and performance

- Start with `src/index.css` and application initialization in `src/main.tsx`.
  Prefer one small document-level helper with one-time initialization and
  cleanup over component handlers, a React context, a Zustand store or a user
  preference. Handle development HMR without accumulating listeners.
- The baseline is capture-phase `keydown` recognition of Tab (Shift allowed;
  do not treat unrelated modified shortcuts as navigation) and a passive
  `pointerdown` listener. Keep state in one document attribute. Write it only
  on a real mode transition, never on every key repeat or pointer activation.
  Start conservatively so a missing/failed initializer leaves native focus
  indicators available. Any additional focus-origin handling must serve a
  concrete exception in the behavior contract, not become a general input
  framework.
- Account for editor, dialog/error and assistive-technology focus before
  applying a blanket CSS gate. Preserve existing required indicators and
  unknown-origin focus. Do not claim a two-listener boolean alone establishes
  screen-reader correctness; if preserving an existing focus contract needs
  materially broader work, report the specific user scenario before expanding.
- Audit the nearby `focus-visible` and `group-focus-visible` rules/classes,
  not just browser outlines: `SearchPill`, `AiSearchInput`, `SearchFilters`,
  `ImageGrid` action controls and metadata editor styles currently have their
  own visual affordances. Reuse the policy rather than leaving some ordinary
  controls governed by a different trigger. Do not suppress Kupua's independent
  focused-image decoration or erase unrelated hover, checked or active styles.
- Do not call `blur()`, prevent pointer focus, gate indicators on `:hover`,
  add `tabIndex=-1`, or use a universal `outline: none !important` workaround.
  Do not override native focus methods or modify editor shadow roots globally.
- Add no scroll, wheel, mousemove, pointermove or touchmove listener, polling,
  animation-frame loop, layout read, DOM scan, React rerender or per-item
  subscription to implement this policy. Do not call `preventDefault()` or
  `stopPropagation()` in the modality listeners.
- Expected cost is a constant-time check per relevant input event and an
  occasional attribute change/style recalculation when the mode changes.
  There should be no added JavaScript work per scrolling frame. Focus outlines
  affect paint, not layout; do not implement the indicator using geometry-
  changing borders. These are design expectations, not measured perf results.

The earlier estimate was roughly 30-50 production lines plus focused tests,
not a ceiling or permission to drop accessibility exceptions to meet a quota.
No implementation or performance campaign is authorized by this estimate.

### 8.4 Proportionate validation and completion

Inspect `e2e/local/keyboard-nav.spec.ts` and the nearest editor/dialog owning
tests first. `e2e/local/focus-preservation.spec.ts` chiefly concerns Kupua's
focused-image continuity, not the browser's `document.activeElement`; do not
rewrite that behavior to make a native-outline test pass. Identify assertions
that would change before editing. Reuse existing fixtures and journeys rather
than creating a new suite or a button-by-button matrix.

Cover the behavioral gap with approximately two focused browser journeys,
splitting only where an existing owning test is a better home:

1. On an ordinary toolbar button, prove the current mouse-click / pointer-away
   / Escape reproduction fails first. After the fix, assert DOM focus is
   retained but its indicator stays hidden. Include a representative other
   non-navigation key, Tab/Shift+Tab revealing indicators, and pointer activation
   switching them off again. Assert actual computed indicator styling, not
   just the mode attribute or `:focus-visible`, whose native match may persist.
2. Reuse editor/dialog checks to retain text-entry and required programmatic
   focus indications. Preserve existing keyboard image traversal/position tests
   unchanged unless a separately justified behavior change is approved.
   Do not fabricate a new guarantee about every assistive technology from
   Playwright's ordinary keyboard input; state any manual validation limits.

Use real pointer/keyboard events. Wait for actual dialog/menu readiness and
completion, and finish relevant finite animations before a settled visual
assertion; an immediate post-key snapshot can capture a transient ring before
an action dismisses a menu or moves focus. No arbitrary sleeps.

Run the focused regression first, then the required full unit and E2E gates
from section 5, including the port confirmation and foreground tee rules.
Do not run perf campaigns autonomously. Because this touches focus styling,
suggest the relevant existing jank/perceived checks under the standing test
directive if the final implementation affects those surfaces; do not claim
zero scroll impact without measurement or invent a new perf harness.

Done means the behavior table is satisfied on the touched surfaces, the
required suites pass, the old CSS comment is corrected, and listener lifecycle
and transition-only attribute writes are verified. Record implementation in
the normal changelog and any intentional library/browser-policy departure in
the deviations guide when product changes are actually authorized and made.

### 8.5 Execution order and integration with the link phases

Recommended: ship the focus-indicator change as a small independently validated
change first, then execute the authorized link phases against that baseline.
It is not a technical prerequisite or a reason to block independently approved
link work. Separate implementation and validation boundaries make a regression
attributable to styling/input policy versus changed HTML/navigation semantics.
Neither task supplies the outstanding Phase D middle-click sign-off.

For each later link phase, verify the converted representative control remains
Tab-reachable with a visible keyboard indicator, Enter follows the intended
href once, and modifier/new-tab gestures still follow section 1.4. Extend the
phase's existing journey; do not duplicate the entire modality regression for
each link. Shared validation is useful only after both changes have their own
focused evidence, not instead of that evidence.

Phase D also needs a current semantic-HTML check before adopting its suggested
whole-cell/row wrapper: existing selection buttons and metadata links must not
be nested inside another anchor, and table structure must remain valid. Preserve
the current deliberate tab-stop/roving-focus model rather than accidentally
adding a Tab stop for every rendered image or nested action. Choose a valid
link target in the current component structure; do not use the focus-indicator
task to conceal a link/keyboard-semantics regression.

References:

- [Blueprint focus management](https://blueprintjs.com/docs/#core/accessibility.focus-management)
  documents the Tab-initiated policy and preserved text-input styling.
- [CSS focus-visible specification](https://drafts.csswg.org/selectors/#the-focus-visible-pseudo)
  explicitly permits keyboard input to change the match without moving focus.
- [WCAG Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
  explains visible keyboard-focus requirements and why indicators must not
  simply time out.

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
