# Kahuna Pills + Location + Leases — Multi-Select Findings
- Audited by: Claude Sonnet 4.6 on 2026-05-02
- Files surveyed: 18 (listed in Appendix B)
- Confidence: High overall. See per-section notes.

> **See also:** [`../00 Architecture and philosophy/field-catalogue.md`](../00%20Architecture%20and%20philosophy/field-catalogue.md) — the
> authoritative per-field reference (multi-select behaviour, ES presence,
> Kupua/Kahuna parity).
>
> **Companion document:** [`selections-kahuna-findings.md`](selections-kahuna-findings.md)
> covers Kahuna's selection-state architecture (`OrderedSet`, RxJS streams,
> mutation methods), the ~500-item perf root causes, drag/drop MIME schema, and
> the action toolbar. This doc is a per-field UI/edit catalogue and supersedes
> §2.6 ("Array-valued fields") of that doc.

---

## 1. Pills — Overview & Shared Mechanism

All five chip types (people, subjects, labels, keywords, and — when in scope — collections) share
a single Angular directive: `uiListEditorInfoPanel`, defined in
`kahuna/public/js/edits/list-editor.js:200` and rendered by
`kahuna/public/js/edits/list-editor-info-panel.html`.

The directive's controller (`ListEditorCtrl`, `list-editor.js:18`) calls
`imageList.getOccurrences(images.flatMap(img => ctrl.accessor(img)))` on every `images` change
to produce `ctrl.listWithOccurrences`: an array of `{data, count}` objects where `count` is the
number of selected images carrying that chip value. The template drives every visual
differentiator from this count:

```html
<!-- list-editor-info-panel.html:1–3 -->
<li class="element"
    ng-repeat="element in ctrl.listWithOccurrences"
    ng-class="{'element--partial': element.count < ctrl.images.size}">
```

**Visual mechanism (A1–A4 — applies to all chip types):**

- Full chip (count == images.size): dark pill, `background-color: #222; color: #aaa`
  (`list-editor.css:99–103`, `.image-info__pills .element__value`)
- Partial chip (count < images.size): white/hollow pill, `background-color: white; color: #222`
  (`list-editor.css:99–101`, `.image-info__pills .element--partial .element__value`)
- Mechanism: CSS class `element--partial`, not opacity, not a separate section, not a badge
- No count label shown on the chip itself
- No sort/grouping (chips render in union order — partial chips are not grouped separately)
- No hover tooltip showing "N of M images carry this"

**"Apply to all" button (B2 — applies to all chip types where `isEditable=true`):**
Partial chips show a `+` button (`library_add` icon), title "Apply {{ctrl.elementName}} to all",
that calls `ctrl.addElements([element.data])` which calls `ctrl.addToImages(ctrl.images, elements)`.
This is the same `addToImages` callback as new-chip addition, so it is idempotent (images already
carrying the chip are not changed by the ES field append logic).
`list-editor-info-panel.html:4–7`

**Remove button (B1 — applies to all chip types where `isEditable=true`):**
Always present when `ctrl.isEditable` is true, regardless of partial/full status.
Title: "Remove {{ctrl.elementName}}" for a chip on one image, "Remove {{ctrl.elementName}} from all"
if `count > 1`. Calls `ctrl.removeElement(element.data)` → `ctrl.removeFromImages(ctrl.images, element)`.
`list-editor-info-panel.html:17–21`

No confirm prompts on any chip add/remove in multi-select.

[Confidence: High — template and CSS are unambiguous]

---

## 2. Keywords

**In-template location:** `gr-image-metadata.html:1020–1059` — section is shown when
`ctrl.userCanEdit || ctrl.selectedImagesHasAny(ctrl.keywordAccessor)`.

**Chip display:** `ui-list-editor-info-panel` with `is-editable="ctrl.userCanEdit"`.

**A1–A5:** Partial chips: white pill (`element--partial`). No count label. No grouping. No hover tooltip.
`list-editor.css:99–101`, `list-editor-info-panel.html:3`

**B1:** Remove button always shown (when editable). Not gated by "partial only" or "full only".
`list-editor-info-panel.html:17–21`

**B2:** "Apply to all" (`+`) button on partial chips only.
`list-editor-info-panel.html:4–7`

**B3:** Remove calls `ctrl.removeKeywordFromImages(ctrl.images, keyword)` via the `removeFromImages`
callback. Removes from all images in the selection that carry it. Images lacking the keyword are
not affected (no-op by definition).
`gr-image-metadata.js` — `ctrl.removeKeywordFromImages` wired to `removeFromImages` attribute.

**B4:** A separate editable-text input is rendered above the chip list for typing new keywords.
`gr-image-metadata.html:1043–1050` (`editable-text="ctrl.newKeywords"`, `keywordsEditForm`).

**B5:** Adding via the input calls `ctrl.updateMetadataField('keywords', $data)` →
`ctrl.addKeywordToImages(imageArray, value)`. Applied to all N images. Idempotent because the
keyword-append path does not duplicate existing values.
`gr-image-metadata.js:updateMetadataField`

**B6:** No confirm prompts. No counts shown.

[Confidence: High]

---

## 3. Subjects

**In-template location:** `gr-image-metadata.html:983–995` — section shown when
`ctrl.selectedImagesHasAny(ctrl.subjectsAccessor)`.

**Chip display:** `ui-list-editor-info-panel` with `is-editable="false"`.

**A1–A5:** Same `element--partial` CSS mechanism as keywords. White pill for partial, dark for full.
No count label, no grouping, no tooltip.

**B1–B6 (editing):** `is-editable="false"` — no remove button, no "apply to all" button,
no add input is rendered for subjects in multi-select. Read-only chip display only.

If all images in the selection have no subjects, the section is hidden entirely
(`selectedImagesHasAny` returns false).

[Confidence: High]

---

## 4. People

**In-template location:** `gr-image-metadata.html:996–1018` — section shown when
`ctrl.userCanEdit || ctrl.selectedImagesHasAny(ctrl.peopleAccessor)`.

**Chip display:** `ui-list-editor-info-panel` with `is-editable="ctrl.userCanEdit"`.

**A1–A5:** Identical to keywords — `element--partial` CSS, white pill for partial. No count label,
no grouping, no tooltip.

**B1:** Remove button always shown (when editable). `list-editor-info-panel.html:17–21`

**B2:** "Apply to all" button on partial chips. `list-editor-info-panel.html:4–7`

**B3:** Remove calls `ctrl.removePersonFromImages` callback (same mechanism as keywords).

**B4:** An `add_box` icon button (`data-cy="it-edit-people-button"`) opens an editable-text input
(`editable-text="ctrl.newPeopleInImage"`, form `peopleInImageEditForm`).
`gr-image-metadata.html:997–1009`

**B5:** Add dispatches via `ctrl.updateMetadataField('peopleInImage', $data)` →
`ctrl.addPersonToImages(imageArray, value)`. Applied to all N selected images.
`gr-image-metadata.js:updateMetadataField`

**B6:** No confirm prompts. No counts shown.

**C1 (face detection):** No face-detection overlay, no detected-faces concept, no extra structure.
Editing flow is identical to keywords.

[Confidence: High]

---

## 5. Labels

**In-template location:** `gr-image-metadata.html` — "Labels" region, always rendered (no `ng-if`
guard on `singleImage`), uses `ui-list-editor-info-panel` with `is-editable="true"`.

**ES field:** `userMetadata.labels` (read via `imageAccessor.readLabels`).
`image-list.js:35–39` (`getLabels`)

**A1–A5:** Same `element--partial` mechanism. Full chips: dark (`#222`), Partial: white.
No count label, no grouping, no tooltip.

**B1–B4:** Remove button always present (editable). "Apply to all" on partial chips.
A separate `gr-add-label` component (`gr-add-label ng-blur="ctrl.cancel" gr-small="true"`)
provides the add-input experience — different component from keyword/person input but delegates to
the same `ui-list-editor-info-panel` for display.
`gr-image-metadata.html` Labels section

**B5:** Adding via `gr-add-label` calls `ctrl.addLabelToImages`. Applied to all N selected.

**B6:** No confirm prompts.

**C2:** Labels are an editorial workflow concept (not free-form; driven by a `labelService` with
`batchAdd`/`batchRemove`). Styling inside `image-info__pills` is identical to other chip types.
Different service (`labelService.batchAdd`/`batchRemove`) vs. keyword/person
(`editsService.batchUpdateMetadataField`). `gr-image-metadata.js:225–226`

[Confidence: High]

---

## 6. Collections

**Collections are not shown in multi-select at all.**

The Collections section is wrapped in:
```html
<div ng-if="ctrl.singleImage" class="image-info" role="region" aria-label="Collections">
```
`gr-image-metadata.html` — Collections region

When `ctrl.singleImage` is falsy (multi-select), this entire section is absent from the DOM.
There is no read-only fallback, no count, no "partial" state — nothing. Multi-select renders no
collection membership information.

**C3 confirmation:** Remove (`removeImageFromCollection`) is only reachable in single-image mode
because the section itself is single-image-only. The previous audit's note was correct in spirit
but understated the scope: it's not just removal that's gated — the entire Collections display is
gated on `singleImage`.

Adding to a collection in multi-select: not available from the metadata panel. Templates
(`gr-collection-overlay`) operate on `ctrl.image` (single) inside `applyTemplate()`.

[Confidence: High — `ng-if="ctrl.singleImage"` is unambiguous]

---

## 7. Location

**D1:** Four segments (`subLocation`, `city`, `state`, `country`) are rendered inline as a
comma-separated list (read mode) and as four independent text inputs in a single edit form.
`gr-image-metadata.html:509–527` (read mode `ng-repeat` over `['subLocation','city','state','country']`)
and lines 529–616 (edit form with four `edit-Location-form-row` divs).

**D2:** Each segment is reconciled independently via:
```js
ctrl.hasMultipleValues = (val) => Array.isArray(val) && val.length > 1;
// called per segment: ctrl.hasMultipleValues(ctrl.rawMetadata[prop])
```
`gr-image-metadata.js:180` and template `gr-image-metadata.html:516–520`

Each can independently be "all-same" (one value shown as a link), "mixed" (`(Multiple cities)` with
`image-info--multiple` class), or absent. They are fully independent in display.

**D3:** Edit form dispatches all four segments together in one save:
```js
ctrl.updateLocationField = function (data, value) {
    Object.keys(value).forEach(key => { if (value[key] === undefined) delete value[key]; });
    ctrl.updateMetadataField('location', value);
};
```
`gr-image-metadata.js:182–188` — `updateMetadataField('location', value)` →
`editsService.batchUpdateMetadataField(imageArray, 'location', value, ...)`

On save, the form submits all four segments at once. The `$data` payload for each field comes from
the editable-text model bound to `ctrl.metadata[prop]`, which holds the single-image-winner or
empty value. **There is no cross-field cascade** (editing `country` does not clear `city`), but all
four are written in one batch call. If you edit only `city` and leave others with their existing
winner values, the save overwrites all four across the selection.

**D4:** Section is shown if:
- Any of the four `rawMetadata[prop]` arrays have multiple values (any is "mixed"), OR
- `ctrl.hasLocationInformation()` is true (any image has any location data), OR
- `ctrl.userCanEdit` is true

When all four are empty across all selected images AND the user cannot edit: section is hidden.
When `userCanEdit` is true: section shown with "Unknown (click ✎ to add)" placeholder.
`gr-image-metadata.html:491–500` (dt/dd `ng-if` conditions)

[Confidence: High]

---

## 8. Leases

**E1:** Leases section in `gr-image-metadata.html:688–700` — `<div ng-if="ctrl.displayLeases()"
role="region" aria-label="Leases">`. Rendered above Title/Description (not a modal/separate
component). Uses the `<gr-leases>` component which maps to
`kahuna/public/js/leases/leases.js` + `leases.html`.

The `<gr-leases>` element receives `gr-images="ctrl.selectedImages"` (the entire current selection).
`gr-image-metadata.html:693–700`

**E2:** No reconciliation. `leaseService.flattenLeases()` (`services/api/leases.js:201–204`)
concatenates all leases across all images into a single flat array:
```js
function flattenLeases(leaseByMedias) {
  return {
    leases: leaseByMedias.map(l => l.leases).reduce((a, b) => a.concat(b)),
    lastModified: leaseByMedias.map(l => l.lastModified).sort()[0]
  };
}
```
No deduplication, no intersection, no identity matching, no "appears in N of M images" tracking.

**E3 (multi-select display):** When `ctrl.totalImages > 1` the component renders **only a summary
count string**, not individual lease items:
```html
<!-- leases.html -->
<div class="image-info__lease" ng-if="ctrl.totalImages > 1">
    {{ctrl.activeLeases(ctrl.leases)}} current leases + {{ctrl.inactiveLeases(ctrl.leases)}} inactive leases
</div>
```
The per-lease `<ul>` with details and delete buttons is inside `ng-if="ctrl.totalImages === 1"` —
it is **not rendered in multi-select**. No "applies to all" vs "applies to some" visual; just a
count summary. `leases.html:108–124`

**E4 (editing in multi-select):**
- **Add:** The add-lease form (`<form class="lease__form">`) is shown unconditionally (no
  `singleImage` guard on the form itself). Saving calls `leaseService.batchAdd(ctrl.newLease,
  ctrl.images)` which uses `trackAll` to call `add(image, lease)` per image with a unique
  `mediaId` assigned per image. Applied to all N selected images.
  `leases.js:107`, `services/api/leases.js:100–113`
- **Delete:** Not available in multi-select — the `<ul>` with delete buttons is gated
  `ng-if="ctrl.totalImages === 1"`. Deleting requires navigating to a single image.
- **Edit in place:** Not supported at all (single or multi).

**E5 (current lease concept):** `ctrl.isCurrent(lease) = lease.active && lease.access.match(/-use/i)`
— a lease is "current" if active AND is a use-type (not syndication). This is used in the
`leaseClass()` to add CSS classes (`lease__allow lease__use lease__active`) but **no special badge
or highlight** is given to current leases in the count summary shown in multi-select.
`leases.js:265`

**E6 (delete all / bulk-clear):** `leaseService.clear(image)` (single image, `services/api/leases.js:42`)
exists but is not exposed from the metadata panel in multi-select. `ctrl.batchRemoveLeases()` (which
broadcasts a remove event) is only active when `ctrl.withBatch` is true — this flag is only set on
the **upload page** batch-apply context, not in the search panel. There is no "delete all leases"
affordance in the normal multi-select metadata panel.

**E7 (API trace):** `batchAdd` → `trackAll` → `add(image, lease)` per image in a loop.
Not batched server-side. `services/api/leases.js:100–113`

`deleteLease(lease, images)` deletes by UUID via `leases/{id}.delete()`. UUID is globally unique
so it affects exactly one lease on one image. `services/api/leases.js:124–133`

**E8 (metadata templates interaction):** The `applyTemplate()` function in
`metadata-templates.js:153–186` acts on `ctrl.image` (single) not `ctrl.images`. It calls either
`leaseService.replace(ctrl.image, leases)` (if `templateLeases.replace` is true, replaces all
existing leases on that image with the template's leases) or `leaseService.addLeases(ctrl.image,
leases)` (appends template leases to existing). This template-apply path is single-image-scoped
even if accessed from a multi-select context. `metadata-templates.js:177–184`

One confirm prompt exists for leases: when adding a syndication-type lease and an existing
syndication lease is already present on one or more selected images, `$window.confirm()` fires:
"One or more of the selected images have syndication leases. These will be overwritten."
`leases.js:85–97`

[Confidence: High — code paths are clear. Low confidence on whether `ctrl.displayLeases()` hides
leases under any additional multi-select conditions — `displayLeases` was not traced; it may gate
the section further.]

---

## 9. Cross-Cutting Observations

- **Architecture doc claim refuted:** "Kahuna does no reconciliation — it shows the union of all chips
  with per-chip remove." This is wrong. The `ui-list-editor-info-panel` does reconcile: it tracks
  occurrence counts and visually differentiates partial chips (white pill) from full chips (dark pill)
  with a dedicated "apply to all" affordance. The union claim is correct in the sense that the union
  is shown, but "no reconciliation" is incorrect.

- **Shared component is the unit of pattern.** The chip behaviour is entirely defined in one place
  (`list-editor.js` / `list-editor-info-panel.html`). Kupua can replicate the whole pattern by
  matching this one component's logic.

- **No count badge on chips.** `getOccurrences` produces counts but they are used only for the
  partial/full CSS gate and "apply to all" button visibility. No "Reuters ×12" badge is rendered.

- **No hover tooltip.** There is no `gr-tooltip` or equivalent on individual chips in the panel.

- **Subjects is permanently read-only in multi-select** (`is-editable="false"`). You can see partial
  subjects but cannot remove or add them. Kupua's first-class subjects editing would be a departure
  from Kahuna.

- **Location edit form has one Save button for all four segments.** Kupua cannot replicate
  per-segment saves without structural changes.

- **Leases multi-select UX is deliberately minimal** — only a count summary is shown. The full lease
  list (with delete/details) is intentionally single-image-only.

---

---

## 10. Image Type

**Section visibility:** Rendered only when `window._clientConfig.imageTypes` is a non-empty array.
`gr-image-metadata.html:50` (`ng-if="ctrl.validImageTypes.length > 0"`)
`gr-image-metadata.js:66` (`ctrl.validImageTypes = window._clientConfig.imageTypes || []`)

The valid set is entirely client-config-driven. Kahuna itself imposes no hardcoded list.

**A1–A4 (visual in multi-select):**
- All-same: current value shown as plain text, no link (not search-filterable inline).
- Mixed: `"Multiple image types"` with class `image-info--multiple`. Same text/class pattern as
  byline/credit. `gr-image-metadata.html:81–85` (editable user), `gr-image-metadata.html:95–99`
  (read-only user).
- No chip/pill — rendered as a `<dd>` text node, not a list element.
- No count shown, no partial differentiator (it's a scalar, not a set).

**Editing:**
- Control: `editable-select` (x-editable `<select>` dropdown), options from `ctrl.validImageTypes`
  array, placeholder `"-- choose type --"`. `gr-image-metadata.html:70–72`
- Saves via `ctrl.updateMetadataField('imageType', $data)` → `editsService.batchUpdateMetadataField(imageArray, 'imageType', value)`.
- In multi-select with different values, the select opens with no pre-selected option (the
  winner value from `ctrl.metadata.imageType` is undefined when mixed). Saving sets all images
  to the chosen value.
- No confirm prompt.

[Confidence: High]

---

## 11. Rights & Restrictions (Usage Rights)

**Panel section position:** First section in the panel, above Image Type and all metadata.
`gr-image-metadata.html:17–47`

### Display (read mode)

Two mutually exclusive display paths controlled by `window._clientConfig.usageRightsSummary`:
`gr-image-metadata.js:63`

**Path A — plain text** (`usageRightsSummary` is false/absent):
- Shows `ctrl.usageCategory` — a string resolved by `selectedUsageCategory()` which fetches
  all categories from the API and finds the matching name for the common category code.
  If the selection has mixed categories, it returns `'multiple categories'`.
  `gr-image-metadata.js:462–471`
- Single plain `<dd>` text. No icons. `gr-image-metadata.html:30–32`

**Path B — BBC-style summary component** (`usageRightsSummary` is true):
- Renders the `<usage-rights-summary>` React component (`gr-usagerights-summary.tsx`).
- Component evaluates each image against four clauses and shows icon + label for each matching
  category (intersection across selection). Mixed results (no common match) render nothing.
  `gr-usagerights-summary.tsx:52–88`

**The "free / no rights / restricted" breakdown the user refers to is NOT in the metadata
panel — it lives in `gr-info-panel`**, the outer wrapper panel rendered above the metadata:
`gr-info-panel.html:1–55`

`gr-info-panel` shows a `<ul class="costs">` that iterates `ctrl.selectedCosts` — an
`getOccurrences(getCostState(images))` result — and renders one pill per distinct cost state:

| Cost state | `getCostState` derivation | Label shown |
|---|---|---|
| `free` | `hasRights && cost === 'free'` | `N free` |
| `no_rights` | `!hasRights` (empty `usageRights` object) | `N no rights` |
| `pay` | `hasRights && cost === 'pay'` | `N paid` |
| `overquota` | `hasRights && cost === 'overquota'` | `N over quota` |
| `conditional` | `hasRights && hasRestrictions` | `N restricted` |

(`image/service.js:33`, `services/image-list.js:33–34`, `gr-info-panel.html:15–47`)

`hasRestrictions` is true when `usageRights` is non-empty AND includes the `usageRestrictions`
key. `image/service.js:27–28`

**Lease effect on cost pills:** `gr-info-panel.js:55–63` — `stylePercentageLeased(cost, alt)` is
called on `pay`, `overquota`, and `conditional` pills (not on `free` or `no_rights`). It computes
what fraction of the images in that cost bucket have an **active `allow-use`** lease, and renders
the pill as a CSS `linear-gradient`: teal for the leased portion, the `alt` colour (red for pay,
orange for conditional) for the unleased portion.

```js
// gr-info-panel.js:57–60
const imageIsOfThisTypeAndIsLeased = (img) =>
  img.data.cost === cost.data &&
  img.data?.leases?.data?.leases?.some(lease =>
    lease.access === 'allow-use' && lease.active);
```

So the visual effect is: a `pay` pill that is 40% teal + 60% red means 40% of paid images have
an active allow-use lease. **`deny-use` / `allow-syndication` / `deny-syndication` leases do not
affect the pill colour.** Only `allow-use` + `active` does.

### Editing (usage rights editor)

The `<gr-usage-rights-editor>` component opens in-panel (not a modal) when the ✎ button is
clicked. `gr-image-metadata.html:22–27`

Editor receives `ctrl.usageRights` — an Immutable List of `{image, data}` pairs, one per selected
image. `gr-image-metadata.js:446–460`

In multi-select with mixed categories, the category `<select>` prepends a synthetic "Multiple
categories" entry (`multiCat`) and saving is disabled until the user picks a real category.
`usage-rights-editor.js:36` and `savingDisabled$` stream.

A warning banner "Multiple rights & restrictions" with a help icon is shown inside the form when
`ctrl.usageRights.length > 1`. `usage-rights-editor.html:43–47`

Category-specific property fields (photographer name, supplier, restrictions, etc.) are rendered
from the category's `properties` array from the API. For multi-select where values differ across
images, the model is pre-populated only for fields where all images share the same value
(`getSetOfProperties` intersection). Mixed fields appear blank. `usage-rights-editor.js:96–103`

No confirm prompt on save. Applies to all N selected images via `editsService` batch.

[Confidence: High for cost pills and lease colouring. Medium for editor multi-select behaviour —
the model initialisation logic was traced but not all edge cases in `categoryFromUserChange$`
were exhaustively verified.]

---

## 12. Description

**Section visibility:** Always rendered (no `ng-if` guard on count or `singleImage`).
`gr-image-metadata.html` — Title/Description group.

### Display (read mode)

- All-same: shows the shared description as a plain `<dd>` text (no search link).
- Mixed (editable user): `"Multiple descriptions (click ✎ to edit all)"` with
  `image-info--multiple` class. `gr-image-metadata.html` description section.
- Mixed (read-only user): `"Multiple descriptions"` (no edit affordance).

### Editing

Standard ✎ button opens an `editable-textarea` (x-editable) inline form (not modal).

**The "Add before / Add after" radio list is unique to Description among all metadata fields.**
It only appears when:
1. The selection has multiple different descriptions (`ctrl.hasMultipleValues(ctrl.rawMetadata.description)` is true), AND
2. The user can edit, AND
3. The edit form is open (`descriptionEditForm.$visible`)

`gr-image-metadata.html:249–253`

The three options come from `kahuna/public/js/util/constants/editOptions.js`:

```js
export const overwrite = {key: 'overwrite', value: 'Overwrite'};
export const prepend   = {key: 'prepend',   value: 'Add before'};
export const append    = {key: 'append',    value: 'Add after'};
export const editOptions = [overwrite, prepend, append];
```

Default on panel open: `overwrite`. `gr-image-metadata.js:200`

The selected option (`ctrl.descriptionOption`) is passed to
`editsService.batchUpdateMetadataField(imageArray, 'description', $data, ctrl.descriptionOption)`.
`gr-image-metadata.js:238`

The service processes it in `getNewFieldValue()`:
- `overwrite` → uses `value` as-is, replacing each image's existing description
- `prepend` → `value + ' ' + existingDescription` (space separator, no newline)
- `append` → `existingDescription + ' ' + value` (space separator, no newline)

`edits/service.js:318–326`

The radio is **only shown when descriptions are mixed**. When all images have the same
description (or no description), the radio is hidden and only Overwrite is silently used.

**Important:** `prepend` and `append` read the **current** field value per image at save time
(via `imageAccessor.readMetadata(image)[field]`), so they build per-image strings at the point
of save, not at the point of typing.

No confirm prompt.

[Confidence: High]

---

## 13. Photoshoots

**Section visibility:** Always rendered (no `ng-if` on `singleImage` or count).
`gr-image-metadata.html:1000–1006`

Renders `<gr-photoshoot images="ctrl.selectedImages"/>`.

### Multi-select reconciliation

`gr-photoshoot.js` has two explicit paths: `refreshForOne()` (single image) and
`refreshForMany()` (multi-image). `gr-photoshoot.js:33–56`

For multi-image:
- Collects all photoshoot records that exist (skipping images with no photoshoot data).
- Sets `ctrl.hasPhotoshootData = photoshoots.length > 0` (true if ANY image has a photoshoot).
- Sets `ctrl.hasSinglePhotoshoot = uniqueTitles.size === 1 && allImagesHavePhotoshoot`.
  Both conditions must be true: exactly one unique title AND every image in the selection has
  that title.

**Display states:**

| Condition | Shown |
|---|---|
| `!hasPhotoshootData` | "Unknown (click ✎ to add)" |
| `hasPhotoshootData && hasSinglePhotoshoot` | Title as search link |
| `hasPhotoshootData && !hasSinglePhotoshoot` | `"Multiple photoshoots (click ✎ to edit all)"` with `image-info--multiple` |

`gr-photoshoot.html:22–33`

"Multiple photoshoots" fires when:
- At least one image has a photoshoot but not all images have one, OR
- All images have photoshoots but with different titles.

Both produce `hasSinglePhotoshoot = false`. There is no further breakdown ("N of M have this
photoshoot") — just "multiple".

### Editing

- Input: `editable-text` with typeahead autocomplete from `ctrl.search()` (calls
  `mediaApi.metadataSearch('photoshoot', { q })`). `gr-photoshoot.html:9–20`
- Save: `ctrl.save(title)` → if title is non-empty: `photoshootService.batchAdd({ images, data: { title } })`. If title is empty: `photoshootService.batchRemove({ images })`.
  `gr-photoshoot.js:66–72`
- Applies to ALL images in the selection (both add and remove are batch operations).
- No confirm prompt.
- No "apply to all partial" affordance (the partial concept doesn't exist here — you either
  set the same title across everything or remove it from everything).

**Photoshoot is a single scalar field** — there is never more than one photoshoot per image in
this model. "Multiple photoshoots" means multiple images have different photoshoots, not that one
image has multiple.

[Confidence: High]

---

## Appendix A: Out-of-Scope Notices

1. `gr-photoshoot` component is rendered for multi-select (always shown); not audited. *(now covered in §13)*
2. `gr-syndication-rights` is single-image-only (`ng-if="ctrl.singleImage"`); same as collections. Not shown in multi-select at all.
3. `gr-add-label` vs `gr-add-keyword`: these are separate components for the add-input UI but both
   delegate to the same `ui-list-editor-info-panel` for list display.
4. The `ctrl.withBatch` upload-context lease affordances are separate from the search panel and
   should not be conflated with normal multi-select editing.
5. **Title** — scalar, same `image-info--multiple` / "Multiple titles (click ✎ to edit all)" pattern as byline/credit. No unique behaviour; batch-overwrites all images on save.
6. **Special instructions** — scalar, same `image-info--multiple` pattern as title. No unique behaviour.
7. **Taken on (dateTaken)** — scalar, same pattern. Uses `editable-datetime-local` widget; same batch-overwrite on save.
8. **Byline / Credit / Copyright** — plain scalars, identical `image-info--multiple` pattern. Credit has typeahead autocomplete; no other differences.
9. **Uploader / Filename** — read-only display fields; hidden in multi-select when values differ (`ng-if="!ctrl.hasMultipleValues(...)"`). No edit affordance.
10. **Domain metadata** — gated `ng-if="ctrl.singleImage && ctrl.userCanEdit"` or similar; not shown in multi-select.
11. **Additional metadata (extras)** — gated `ng-if="ctrl.singleImage && !ctrl.isAdditionalMetadataEmpty()"`. Not shown in multi-select.

---

## Appendix B: Files Surveyed

1. `kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html`
2. `kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js`
3. `kahuna/public/js/edits/list-editor.js`
4. `kahuna/public/js/edits/list-editor-info-panel.html`
5. `kahuna/public/js/edits/list-editor.css`
6. `kahuna/public/js/services/image-list.js`
7. `kahuna/public/js/leases/leases.js`
8. `kahuna/public/js/leases/leases.html`
9. `kahuna/public/js/services/api/leases.js`
10. `kahuna/public/js/metadata-templates/metadata-templates.js`
11. `kahuna/public/js/components/gr-info-panel/gr-info-panel.html`
12. `kahuna/public/js/components/gr-info-panel/gr-info-panel.js`
13. `kahuna/public/js/image/service.js`
14. `kahuna/public/js/components/gr-usagerights-summary/gr-usagerights-summary.tsx`
15. `kahuna/public/js/components/gr-usagerights-summary/gr-usagerights-bbc.tsx`
16. `kahuna/public/js/usage-rights/usage-rights-editor.js`
17. `kahuna/public/js/usage-rights/usage-rights-editor.html`
18. `kahuna/public/js/util/constants/editOptions.js`
19. `kahuna/public/js/edits/service.js` (partial — `batchUpdateMetadataField`, `getNewFieldValue`)
20. `kahuna/public/js/components/gr-photoshoot/gr-photoshoot.js`
21. `kahuna/public/js/components/gr-photoshoot/gr-photoshoot.html`
