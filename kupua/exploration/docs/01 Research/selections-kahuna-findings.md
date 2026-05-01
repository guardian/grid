# Kahuna Selections — Findings
- Audited by: Claude Sonnet 4.6 on 2026-05-01
- Files surveyed: 14
- Confidence: High — selection state and reconciliation are clearly structured. Performance root causes are legible from the stream definitions. The action bar is rendered declaratively in one template so it's complete. Only `getAction` required tracing into a third-party library (theseus 0.5.2).

---

## Section 1: Selection state shape and lifecycle

### Where is state stored?

Selection state is created fresh per-route-render as a route `resolve` in
`kahuna/public/js/search/index.js:210`:

```js
selection: ['orderedSetFactory', function(orderedSetFactory) {
    return orderedSetFactory();
}]
```

There is no singleton service. A new `orderedSet` instance is constructed every
time the `search.results` route is activated.

### Shape

The underlying data structure is `Immutable.OrderedSet<string>` of **image URIs**
(`kahuna/public/js/lib/data-structure/ordered-set-factory.js:12`). The selection
does **not** cache full image payloads; it stores only string keys. Resolved image
objects are joined back on demand via the `selectedImages$` derived stream
(`kahuna/public/js/search/index.js:224–237`), which does a
`resultsImages.find(image => image.uri === imageUri)` lookup against the loaded
`compactResults$` list.

The factory exposes three RxJS streams built on a `Rx.Subject` operation queue
scanned over the `OrderedSet`:

| Stream | Type | Purpose |
|---|---|---|
| `items$` | `Observable<OrderedSet<string>>` | Full set of selected URIs |
| `count$` | `Observable<number>` | Count of selected items |
| `isEmpty$` | `Observable<boolean>` | Whether anything is selected |

(`kahuna/public/js/lib/data-structure/ordered-set-factory.js:18–22`)

### Mutation methods

All mutations queue operations onto an Rx `Subject`; the set is rebuilt
immutably on each operation:

| Method | Behaviour | Defined at |
|---|---|---|
| `add(uri)` | Adds single URI | ordered-set-factory.js:29 |
| `union(uris)` | Adds many URIs (shift-click range) | ordered-set-factory.js:33 |
| `remove(uri)` | Removes single URI | ordered-set-factory.js:37 |
| `toggle(uri)` | Add if absent, remove if present | ordered-set-factory.js:41 |
| `clear()` | Empties the set | ordered-set-factory.js:45 |

Call sites in `kahuna/public/js/search/results.js:689–731`.

### Persistence across route changes

None. The `selection` resolve is scoped to the `search.results` route state. Any
navigation (new search, image detail, back) destroys the route instance and
creates a fresh `OrderedSet`. User confirmation of "extremely bad" persistence:
confirmed — this is by design in the route architecture.

### "Selection mode" representation

Derived boolean: `const inSelectionMode$ = selection.isEmpty$.map(isEmpty => !isEmpty)`
(`kahuna/public/js/search/results.js:664`). There is no explicit flag; selection
mode is simply `count > 0`.

---

## Section 2: Reconciliation algorithm in the info panel

### Entry point

`$scope.$watchCollection('ctrl.selectedImages', function() { ... })`
at `kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js:69`.

This fires synchronously on every selection change (no debounce, no
memoisation). It recomputes all reconciled display state in one shot.

### Per-field comparison logic

The core function is `getSetOfProperties(objects)` in
`kahuna/public/js/services/image-list.js:57`:

```js
function getSetOfProperties(objects) {
    const keys = objects.flatMap(Object.keys);
    return keys.reduce((propertySets, key) => {
        const valueSet = objects.reduce((values, obj) => {
            return values.add(obj[key]);
        }, new Set());
        return propertySets.set(key, valueSet);
    }, new Map());
}
```

For each field key that appears across **any** selected image, it builds an
`Immutable.Set` of all values seen across the entire selection. "All the same"
means `valueSet.size === 1`. There is **no special handling** for type — strings,
numbers, and dates are all compared with the same `Immutable.Set` equality
(which uses `===` for primitives). No normalisation (e.g. case folding or date
canonicalisation) is applied.

The consumer transforms the set map via two functions
(`gr-image-metadata.js:476–505`):

- `displayMetadata()`: for each field, returns `values.first()` if size=1, else
  `undefined`. This is the value bound to editable inputs.
- `rawMetadata()`: for each field, returns `values.first()` if size=1, `undefined`
  if size=0, or `Array.from(values)` if size>1. This drives the "Multiple…"
  detection via `ctrl.hasMultipleValues(val)` = `Array.isArray(val) && val.length > 1`.

### Array-valued fields (keywords, people)

Keywords and people are **not** reconciled through `getSetOfProperties`. They are
rendered via the `<ui-list-editor-info-panel>` Angular component with per-image
accessors:

- Keywords: `ctrl.keywordAccessor = (image) => imageAccessor.readMetadata(image).keywords`
  (`gr-image-metadata.js:298`)
- People: `ctrl.peopleAccessor = (image) => imageAccessor.readPeopleInImage(image)`
  (`gr-image-metadata.js:295`)

The list editor component renders chips from each selected image's own array. It
does not compute set intersection or union across selected images — it operates
per-image. There is no "Multiple keywords" collapsed view; all chips from all
selected images are displayed. Editing (adding/removing a keyword) applies the
change individually to each image via `addXToImages` / `removeXFromImages`
(`gr-image-metadata.js:307–322`).

Labels use the same per-image chip pattern via `imageList.getLabels` +
`imageList.getOccurrences` (`kahuna/public/js/services/image-list.js:37–40`),
which flattens all labels across all images and counts occurrences.

### "Multiple values" messages

Field-specific messages; no single canonical string. Verbatim from the template
(`gr-image-metadata.html`):

| Field | Multi-value message (editor) | Multi-value message (viewer) |
|---|---|---|
| Image type | "Multiple image types (click ✎ to edit **all**)" | "Multiple image types" |
| Title | "Multiple titles (click ✎ to edit **all**)" | "Multiple titles" |
| Description | "Multiple descriptions (click ✎ to edit **all**)" | "Multiple descriptions" |
| Special instructions | "Multiple special instructions (click ✎ to edit **all**)" | "Multiple special instructions" |
| Date taken | "Multiple dates (click ✎ to edit **all**)" | "Multiple dates" |
| Byline | "Multiple bylines (click ✎ to edit **all**)" | "Multiple bylines" |
| Credit | "Multiple credits (click ✎ to edit **all**)" | "Multiple credits" |
| Location subfields | "(Multiple subLocations)", "(Multiple cities)", etc. | same |
| Copyright | "Multiple copyrights (click ✎ to edit **all**)" | "Multiple copyrights" |

### Empty/missing values: mixed state

If 5 of 10 selected images have `byline: "John"` and 5 have no `byline` key in
their metadata object, `getSetOfProperties` adds `undefined` to the value set
alongside `"John"`. The resulting set has size 2 → `rawMetadata.byline` = an
array → `hasMultipleValues()` returns `true` → the "Multiple bylines" message is
shown. `displayMetadata.byline` = `undefined`. For editable fields, if an editor
clicks the ✎ button the input is blank (not pre-filled), and saving writes the
new value to **all** N selected images.

If **all** images have the field empty/missing: the key either doesn't appear in
`Object.keys()` (undefined fields) or the Set contains only one value (empty
string), yielding `rawMetadata[field]` = `undefined` or `""` (both falsy). The
field is then hidden from non-editors via `|| ctrl.userCanEdit` guards (see below).

### "Important empty fields" behaviour

There is **no explicit list** of important fields. The distinction is structural:
certain fields have no outer `ng-if` guard and are therefore unconditionally
rendered. These fields show "Unknown" to non-editors even when all selected images
have empty values:

| Field | Template location | Shown when empty, even to non-editors? |
|---|---|---|
| Title | gr-image-metadata.html:130 | **Yes** — no outer ng-if |
| Description | gr-image-metadata.html:193 | **Yes** — no outer ng-if |
| Special instructions | gr-image-metadata.html:282 | **Yes** — no outer ng-if |
| Taken on (dateTaken) | gr-image-metadata.html:354 | **Yes** — no outer ng-if |
| Credit | gr-image-metadata.html:441 | **Yes** — no outer ng-if |

Fields with conditional visibility (`ng-if="ctrl.rawMetadata.X || ctrl.userCanEdit"` —
shown to non-editors only when a value exists, always shown to editors):

- Byline (`gr-image-metadata.html:394`)
- Copyright (`gr-image-metadata.html:613`)
- Location (`gr-image-metadata.html:491`)

Fields shown only when at least one image has the field populated:

- People (`ng-if="ctrl.userCanEdit || ctrl.selectedImagesHasAny(ctrl.peopleAccessor)"`,
  gr-image-metadata.html:694)
- Keywords (`ng-if="ctrl.userCanEdit || ctrl.selectedImagesHasAny(ctrl.keywordAccessor)"`,
  gr-image-metadata.html:1020)

The "shown to non-editors when empty" behaviour therefore applies to the five
fields with no outer guard (title, description, special instructions, date taken,
credit). These render "Unknown" in a non-editor context when empty.

### Recompute cadence

Full `O(N_selected × N_fields)` recompute on every `$watchCollection` fire. The
watch fires whenever `ctrl.selectedImages` reference changes, which happens on
every selection toggle. No debouncing, no memoisation, no incremental approach.
(`gr-image-metadata.js:69`)

### Fields that are never reconciled

These are suppressed or absent when multiple images are selected:

- `id` / `uri` — not accessed via the metadata path
- `uploadTime` — gated `ng-if="ctrl.singleImage"` (`gr-image-metadata.html:686`)
- `uploadedBy` (Uploader) — suppressed when `hasMultipleValues(ctrl.extraInfo.uploadedBy)`
  (`gr-image-metadata.html:680`)
- `filename` — suppressed when `hasMultipleValues(ctrl.extraInfo.filename)` or
  empty (`gr-image-metadata.html:683`)
- Domain metadata — gated `ng-if="ctrl.singleImage"` (`gr-image-metadata.html:773`)
- Additional metadata / Identifiers — gated `ng-if="ctrl.singleImage"` (`gr-image-metadata.html:737`)
- Collections — gated `ng-if="ctrl.singleImage"` (via `ctrl.removeImageFromCollection`)

### Edit affordance during multi-select

Yes. For every reconciled field showing "Multiple…", the template renders
`(click ✎ to edit **all**)` next to the message when `ctrl.userCanEdit`. Clicking
the ✎ icon shows a blank input; saving calls
`editsService.batchUpdateMetadataField(imageArray, field, value, option)`
(`gr-image-metadata.js:230`), which writes the entered value to all N selected
images. For description, a `gr-radio-list` option (`editOptions`) lets the user
choose between `overwrite` and other modes (`gr-image-metadata.js:252`).

---

## Section 3: Why ~500-item ceiling — ranked candidate causes

### Cause 1 — O(N_selected × N_loaded) stream mapping [DOMINANT, strongest code evidence]

In `kahuna/public/js/search/index.js:224–231`:

```js
selectedImages$: ['selection', 'compactResults$', function(selection, compactResults$) {
    return Rx.Observable.combineLatest(
        selection.items$,
        compactResults$,
        (selectedItems, resultsImages) => {
            return selectedItems.map(imageUri => {
                return resultsImages.find(image => image.uri === imageUri);
            });
        }
    )
```

`resultsImages` is an `Immutable.List` from `compactResults$`. `Immutable.List.find()`
is a **linear scan** — O(M) per call, where M = loaded results count. This is
called once per selected URI on every emission of either `selection.items$` or
`compactResults$`. Every selection toggle emits `selection.items$`, triggering a
full scan of N_selected × M_loaded comparisons.

At N=500 selected, M=500 loaded results: **250,000 comparisons per toggle**. No
caching, no index, no early exit once all selected URIs are resolved. This is the
most likely dominant cause of interactive freeze above ~500 items.

### Cause 2 — O(N²_selected × N_fields) reconciliation recompute [SIGNIFICANT — worse than it looks]

`$watchCollection('ctrl.selectedImages', function() { ... })` at
`gr-image-metadata.js:69` fires on every selection change and runs `getSetOfProperties`
over all N selected images. The implementation is:

```js
function getSetOfProperties(objects) {
    const keys = objects.flatMap(Object.keys);     // N × F entries, not deduplicated
    return keys.reduce((propertySets, key) => {
        const valueSet = objects.reduce((values, obj) => {
            return values.add(obj[key]);            // iterates all N images for EACH key occurrence
        }, new Set());
        return propertySets.set(key, valueSet);
    }, new Map());
}
```

`keys` has length **N × F** (one entry per image per field, not deduplicated). For
each of those N×F entries, the inner `objects.reduce` iterates all N images again.
Total inner loop iterations: **(N × F) × N = N² × F**.

At N=500 selected, F≈20 metadata fields: **5,000,000 `Immutable.Set.add()`
calls per toggle**. The result Map is correct (last computation for each key
key wins), but most work is redundant — the same field key is processed N times
instead of 1 due to the non-deduplicated `flatMap`.

There is no memoisation, no dirty-checking of which images changed. Adding one
image recomputes the entire reconciled view from scratch.

### Cause 3 — 500 Promise chains for `selectionIsDeletable$` [MODERATE]

At `kahuna/public/js/search/results.js:675–683`:

```js
const selectionIsDeletable$ = selectedImages$.flatMap(selectedImages => {
    const allDeletablePromise = $q.all(
        selectedImages.map(canBeDeleted).toArray()
    ).then(...);
    return Rx.Observable.fromPromise(allDeletablePromise);
});
```

`canBeDeleted(image)` calls `image.getAction('delete')`. Per the theseus library
(`kahuna/node_modules/theseus/src/theseus/resource.js:252–257`), `getAction`
resolves from `this.$response` — the **already-loaded** response Promise, not a
new network call. However, it still chains three `.then()` handlers per image.
At N=500, every selection toggle creates **500 Promise microtask chains**
simultaneously, flooding the microtask queue and delaying the next paint.

### Cause 4 — AngularJS digest cycle watcher pressure [WEAK, secondary]

Each rendered grid cell (via `gu-lazy-table`, typically 40–80 cells visible)
contains **4 calls** to `ctrl.imageHasBeenSelected(image)` per digest:
one in `ng-class`, two in `ng-if`, one as `is-selected` binding
(`kahuna/public/js/search/results.html:167–199`).

`ctrl.imageHasBeenSelected(image)` = `ctrl.selectedItems.has(image.uri)` which is
O(1) on `Immutable.OrderedSet`. With 60 rendered cells × 4 calls = ~240 O(1)
lookups per digest. The digest itself is not the bottleneck — but Causes 1–3
each trigger `$scope` updates via `inject$`, spawning multiple digest cycles per
toggle. The cumulative digest overhead compounds the synchronous work from Causes
1 and 2.

**Verdict**: Causes 1 and 2 are the co-dominant bottlenecks and both scale
quadratically with selection size (O(N×M) and O(N²×F) respectively). At N=500
both reach millions of operations per toggle, explaining the interactive freeze.
Cause 3 adds async microtask pressure that blocks paint. Cause 4 is minor in
isolation but contributes when multiple digest cycles chain. Definitive ranking
between Causes 1 and 2 would require profiling, but both must be addressed to
achieve usable performance at high selection counts.

---

## Section 4: Action bar inventory

All entries wired in `kahuna/public/js/search/results.html` in the
`<div class="results-toolbar">` block, unless noted. Listed in template
render order (top-to-bottom, right-to-left within `results-toolbar__right`).

| # | Action | Wired at | Note |
|---|---|---|---|
| 1 | **Clear selection** | results.html:81 / results.js:546 | Calls `selection.clear()`; always shown when `selectionCount > 0` |
| 2 | **Share with URL** | results.html:87 / results.js:550 | Copies search URL filtered to selected image IDs to clipboard; disabled and shows tooltip when ≥45 images selected |
| 3 | **Send To Photo Sales** | results.html:99 / results.js:584 | Marks valid images as syndicated in Capture system; conditional on `showSendToPhotoSales` client config and `showPaid` permission; disabled when ≥45 selected |
| 4 | **Batch export original images** (`gr-batch-export-original-images`) | results.html:113 / gr-batch-export-original-images.js:23 | Creates a "full" (uncropped) export crop for all selected images that don't already have one; two-click confirmation |
| 5 | **Download** (`gr-downloader`) | results.html:116 / gr-downloader.js:10 | Downloads selected images; filtered by per-image `download` action permission; entry point for choosing size/crop |
| 6 | **Delete** (`gr-delete-image`) | results.html:119 / gr-delete-image.js:40 | Soft-deletes all selected images; shown only when `selectionIsDeletable` and images are not already deleted |
| 7 | **Undelete** (`gr-un-delete-image`) | results.html:123 / gr-un-delete-image.js:27 | Restores soft-deleted images; shown only when `ctrl.isDeleted` is true |
| 8 | **Archive / Unarchive** (`gr-archiver`) | results.html:127 / gr-archiver.js:77 | Toggles the `archived` (persisted) flag on selected images; requires `canUserArchive` permission; not shown when images are deleted |

**Collections panel actions** (side panel, not main toolbar, but operate on selection):

| # | Action | Wired at | Note |
|---|---|---|---|
| 9 | **Add to collection** | gr-collections-panel.js:157 | Adds all selected images to a collection chosen from the tree |
| 10 | **Remove from collection** | gr-collections-panel.js:171 | Removes all selected images from a collection in the tree |

Total: 8 toolbar actions + 2 collections panel actions = 10 selection-operating
actions. Toolbar count (8) is within the expected 8–25 range.

---

## Section 5 — Drag and drop: payload shape and collection drop behaviour

### Overview

Kahuna has two drag mechanisms that interact with selection:

1. **Single-image drag** — any individual image in results or in the image detail
   view. Carries a rich multi-MIME payload.
2. **Multi-image drag (selection drag)** — fires when `selectionCount > 0` and the
   user drags from anywhere in the window. Carries a leaner payload. Both are
   implemented via native HTML5 drag-and-drop and `e.dataTransfer`.

### Single-image drag payload

Initiated by `uiDragData` attribute directive (`kahuna/public/js/main.js:456`),
evaluated lazily on `dragstart`. The filter `asImageDragData`
(`main.js:370`) produces the following MIME-keyed map set onto `dataTransfer`:

| MIME type | Value |
|---|---|
| `application/vnd.mediaservice.image+json` | `JSON.stringify({ data: image.data, uri: image.uri })` — full image data payload |
| `application/vnd.mediaservice.kahuna.uri` | Kahuna UI link for the image (from `ui:image` link rel) |
| `application/vnd.asset-handle+json` | `JSON.stringify({ source: "grid", sourceType: "original"\|"crop", thumbnail: <url>, embeddableUrl: <url>, aspectRatio, cropType })` |
| `text/plain` | The image URI (media-api URI) |
| `text/uri-list` | The image URI (media-api URI) |

When dragging a specific crop (`asImageAndCropDragData`, `main.js:400`), two extra
MIME entries are merged in:

| MIME type | Value |
|---|---|
| `application/vnd.mediaservice.crops+json` | `JSON.stringify(crop)` — the crop resource |
| `application/vnd.asset-handle+json` | Overwritten with crop-specific thumbnail and `sourceType: "crop"` |

Additionally, every `<img>` element in Kahuna sets
`application/vnd.mediaservice.kahuna.link = 'true'` on `dragstart`, and every
`<a>` sets `application/vnd.mediaservice.kahuna.image = 'true'`
(`main.js:559–570`). These are described as "internal hacks to identify when we're
dragging internal assets" and are explicitly not for external consumption.

### Multi-image drag payload (selection)

Handled by the `multiDrag` route view, a hidden `<div class="multidrag">` element
wired in `kahuna/public/js/search/index.js:267`:

```js
const windowDrag$ = Rx.DOM.fromEvent($window, 'dragstart');
const dragData$ = windowDrag$.withLatestFrom(selectedImages$, (event, imagesList) => {
    const images = imagesList.toJS();
    const dt = event.dataTransfer;
    return {images, dt};
});

const sub = dragData$.subscribe(({ images, dt }) => {
    if (images.length > 0) {
        const imageObjs = images.map(i => ({data: i.data}));
        dt.setData(vndMimeTypes.get('gridImagesData'), JSON.stringify(imageObjs));
        dt.setDragImage(dragImage, 0, 0);
    }
});
```

This fires on **every** `dragstart` event on the `$window`. When the selection is
non-empty it **augments** the existing `dataTransfer` by adding a single extra key:

| MIME type | Value |
|---|---|
| `application/vnd.mediaservice.images+json` | `JSON.stringify([{ data: image.data }, …])` — array of stripped image objects (no `uri` field, no `links`) |

Importantly: the multi-drag does **not** suppress or replace the single-image drag
data already set by `uiDragData`. Both are present simultaneously on the
`dataTransfer` if the user drags from an image element while images are selected.

The drag ghost is replaced: a custom `<div class="drag-icon">` containing a
`<span class="drag-count">N</span>` badge is created and passed to
`dt.setDragImage(dragImage, 0, 0)` (`search/index.js:304`).

### Drop target: collection tree nodes

Every node in the collections panel tree renders with
`gr-drop-into-collection="node.data.fullPath"` (`gr-collections-panel-node.html:5`).
The `grDropIntoCollection` directive (`gr-collections-panel.js:296`) listens for
`drop` events and handles the two image MIME types:

```js
element.on('drop', e => {
    const gridImagesData = dt.getData(vndMimeTypes.get('gridImagesData'));
    const gridImageData  = dt.getData(vndMimeTypes.get('gridImageData'));

    if (gridImagesData !== '' || gridImageData !== '') {
        const imagesData = gridImagesData !== ''
            ? JSON.parse(gridImagesData)
            : [JSON.parse(gridImageData)];          // single-image fallback

        const imageIds = imagesData.map(imageJson => imageJson.data.id);
        collections.addToCollectionUsingImageIds(imageIds, collectionPath);
    }
});
```

Preference order: `gridImagesData` (multi-image MIME) wins if present; falls back
to `gridImageData` (single-image MIME), wrapped in an array. The drop handler uses
`.data.id` from the payload, so the stripped `{ data: image.data }` shape (no
`uri`) is sufficient. The `addToCollectionUsingImageIds` call
(`gr-collections-panel.js:316`) is the same function used by the button-based
add action. `dragover` adds CSS class `collection-drop-drag-over`; `dragleave`
removes it (`gr-collections-panel.js:304–309`). No visual feedback beyond the CSS
class on the node; the "Adding…" spinner uses `scope.dropIntoCollectionSaving`.

### Collection-panel button controls for selected items

Each collection node shows two hover-revealed icon buttons when
`ctrl.hasImagesSelected` is true (i.e. `selectedImages$.size > 0`), rendered in
`gr-collections-panel-node.html:58–67`:

| Icon | Title attribute | Method | What it does |
|---|---|---|---|
| `indeterminate_check_box` | "Remove selected images from this collection" | `ctrl.removeImagesFromCollection()` | Emits on `remove$` Subject; `batchRemove(images, path)` on latest selection (`gr-collections-panel.js:165–171`) |
| `add_to_photos` | "Add selected images to this collection" | `ctrl.addImagesToCollection()` | Emits on `add$` Subject; `addToCollectionUsingImageResources(images, path)` on latest selection (`gr-collections-panel.js:151–157`) |

Both buttons are only shown when `!grCollectionTreeCtrl.editing` (i.e. not in
collection-rename/delete mode). In-flight state shows "Adding…" or "Removing…"
text in place of the buttons during the async call.

---

## Section 6 — Range selection (shift-click) implementation

Wired in `ctrl.onImageClick` at `kahuna/public/js/search/results.js:701–733`.
Only fires when `ctrl.inSelectionMode` is already true (i.e. shift-click has no
effect when nothing is selected — the user must tick at least one image first).

### Algorithm

```js
ctrl.onImageClick = function (image, $event) {
    if (ctrl.inSelectionMode) {
        if ($event.shiftKey) {
            var lastSelectedUri = ctrl.selectedItems.last();          // L706
            var lastSelectedIndex = ctrl.images.findIndex(image => {  // L707
                return image.uri === lastSelectedUri;
            });
            var imageIndex = ctrl.images.indexOf(image);              // L711

            if (imageIndex === lastSelectedIndex) {
                toggleSelection(image);
                return;
            }

            var start = Math.min(imageIndex, lastSelectedIndex);      // L718
            var end   = Math.max(imageIndex, lastSelectedIndex) + 1;  // L720

            const imageURIs = ctrl.images
              .slice(start, end)
              .map(image => image.uri);
            selection.union(imageURIs);                               // L725
        } else {
            toggleSelection(image);                                   // L731
        }
    }
};
```

### How it fails (the "silent gap" bug the user described)

Three structural reasons range-select silently undercounts in Kahuna:

1. **Anchor is `selectedItems.last()`, not a stored anchor.** `Immutable.OrderedSet`
   preserves insertion order, so "last" means "most recently added URI". If the
   user shift-clicks twice in a row, the second shift-click's anchor is the *last
   URI from the previous range expansion* (the highest-indexed URI of that
   range), not the original click point. There is no notion of a sticky anchor
   that survives multiple shift-clicks.

2. **`ctrl.images` only contains *loaded* image objects.** In Kahuna's lazy table
   (`gu-lazy-table`), `images` is the visible/loaded portion of the result list,
   not the full result set. `ctrl.images.slice(start, end)` therefore slices
   only the loaded subset between the two indices. Any image that has *not been
   scrolled into view* between the anchor and the target is **not present in
   `ctrl.images`** and is silently omitted from the union. This is the bug the
   user described: the user must "slowly scroll past all items so that they
   load visible, otherwise your selection silently won't include them".

3. **No deselection mode.** Shift-click is union-only (`selection.union(imageURIs)`);
   it can only add to the set. There is no shift-click-to-exclude. The user has
   already noted this and that Kupua should have a deselect-range affordance,
   though without complex XOR semantics (which users won't understand).

### Implications for Kupua

- Anchor must be **explicit and sticky** — set on first tick or first non-shift
  click, cleared only on `clear()` or explicit re-anchoring. Not derived from
  selection-set ordering.
- Range expansion must be **position-based, not loaded-image-based**. With
  Kupua's two-tier virtualisation and position map, the range between anchor
  position P1 and target position P2 is well-defined even when neither end is
  in the buffer. We need a DAL method (`getIdRange(cursorA, cursorB)` or similar)
  that walks `search_after` between two cursors to materialise the IDs without
  requiring the user to scroll.
- Range cap (e.g. >2000) should prompt a confirmation, not silently truncate.
  Silent failure is the single behaviour we must not replicate.

---

## Section 7 — Status bar selection counter

Wired in `kahuna/public/js/search/results.html:70–73`:

```html
<div class="results-toolbar-item results-toolbar-item--right results-toolbar-item--static"
     ng-if="ctrl.selectionCount > 0">
    {{ctrl.selectionCount}} selected
</div>
```

- **Format:** Plain template `{{N}} selected` — no thousands separator, no
  pluralisation (reads "1 selected", "500 selected"), no total count, no size
  estimate.
- **Visibility:** `ng-if="ctrl.selectionCount > 0"` — hidden entirely when nothing
  is selected. Appears the moment the first tick is set; disappears the moment
  selection clears.
- **Position:** Right side of the results toolbar (`results-toolbar__right`),
  rendered immediately before the action buttons (Clear, Share, Send to
  Photosales, Export, Download, Delete, Archive). It's the first "right-side"
  toolbar item and visually anchors the action cluster.
- **Source:** `ctrl.selectionCount` is bound from `selection.count$` via Kahuna's
  `inject$` pattern (a derived stream of the OrderedSet's size; see Section 1).
  Updates synchronously on every selection mutation.
- **No "of total" framing.** Kahuna does not show "500 of 14,399 visible" or
  similar — only the absolute selected count. This is fine in Kahuna because the
  selection set never drifts from the result set (selection dies on every
  search). For Kupua, where selections survive search, the counter design
  needs to handle the drift case (see UX question 6 in the planning notes).
- **No clear affordance attached to the counter itself.** Clearing requires
  clicking the separate "Clear selection" toolbar button (Section 4, action 1),
  not the counter. Worth considering a clickable counter chip in Kupua.

---

## Appendix A: Out-of-scope observations (≤10 items)

1. `ctrl.maxResults = 100000` (results.js:234) — hard cap on displayed results; the `gu-lazy-table` virtualises rendering but the `imagesAll` sparse array and `imagesPositions` Map hold references to all loaded image objects in memory.
2. The `selectionIsDeletable$` check fires even when the delete button is not displayed; could be deferred.
3. `ctrl.imageHasBeenSelected` is called 4× per rendered cell per digest; a single call with result cached to a local variable in the template would halve the repetition.
4. `selectedImages$` uses `resultsImages.find()` (Immutable List linear scan) rather than building a URI→image Map; converting `compactResults$` to a Map once would reduce Cause 1 from O(N×M) to O(N).
5. `checkForNewImages()` polls every 15 seconds and emits to `$rootScope`, potentially triggering spurious digest cycles during active selection.
6. The `gr-image-metadata` `updateHandler` (`gr-image-metadata.js:157`) replaces `ctrl.selectedImages` wholesale with `new List(updatedImages)` on the `images-updated` event, bypassing the route-level `selectedImages$` stream.
7. `gr-radio-list` is imported as a dependency in `gr-info-panel.js:14` but the overwrite-mode radio list is only used inside `gr-image-metadata` — the import is redundant.
8. There is no `track by` on the `ng-repeat` in `gr-radio-list`, which means Angular recreates DOM nodes on each digest when the options array reference changes.

---

## Appendix B: Files surveyed

```
kahuna/public/js/lib/data-structure/ordered-set-factory.js
kahuna/public/js/search/index.js
kahuna/public/js/search/results.js
kahuna/public/js/search/results.html
kahuna/public/js/services/image-list.js
kahuna/public/js/services/image-accessor.js
kahuna/public/js/components/gr-info-panel/gr-info-panel.js
kahuna/public/js/components/gr-info-panel/gr-info-panel.html
kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js
kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html
kahuna/public/js/components/gr-batch-export-original-images/gr-batch-export-original-images.js
kahuna/public/js/components/gr-collections-panel/gr-collections-panel.js
kahuna/public/js/components/gr-collections-panel/gr-collections-panel-node.html
kahuna/public/js/components/gr-archiver/gr-archiver.js
kahuna/public/js/components/gr-delete-image/gr-delete-image.js
kahuna/public/js/components/gr-undelete-image/gr-un-delete-image.js
kahuna/public/js/components/gu-lazy-table/gu-lazy-table.js
kahuna/public/js/main.js
kahuna/node_modules/theseus/src/theseus/resource.js
```
