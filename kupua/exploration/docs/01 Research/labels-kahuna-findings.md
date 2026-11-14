# Kahuna Labels — Research Findings

**Audited:** 3 May 2026  
**Mode:** Read-only. No code changed. No commits.  
**Scope:** kahuna frontend + metadata-editor + media-api + common-lib.

---

## Premise check

All three premises hold:

1. **Labels are a per-image `List[String]` of free-text strings**, distinct from
   `usageRights`, `category`, and `keywords`.
   Source: `common-lib/src/main/scala/com/gu/mediaservice/model/Edits.scala:14`
2. **Labels are rendered visually on the grid tile**, not only in the side panel.
   Source: `kahuna/public/js/preview/image.html:89`
3. **Labels are user-editable from the grid tile** (add via `gr-add-label`,
   remove via the chip ×), and the edit goes through the metadata-editor API and
   propagates globally via Kinesis → Thrall → ES.
   Source: `kahuna/public/js/services/label.js:42–52`

No Section 0 needed.

---

## 1. Data model

**Where stored:**  
Labels live at `image.data.userMetadata.data.labels` in the image resource
returned by the media-api. On the server side this is the `Edits.labels` field:
`common-lib/src/main/scala/com/gu/mediaservice/model/Edits.scala:12–14`:

```scala
case class Edits(
  archived: Boolean = false,
  labels: List[String] = List(),
  ...
)
```

**Persistence store:** DynamoDB via `EditsStore`. Adding labels uses a DynamoDB
`ADD` set expression (`DynamoDB.scala:131–133`); removing uses a set delete.
The DynamoDB type is **StringSet**. Adding an existing label is a no-op (set
semantics). The `labels` key in Dynamo is the string constant `"labels"`:
`common-lib/.../model/Edits.scala:26`.

**ES mapping:** `nonAnalysedList("labels")` which resolves to `keywordField("labels")`
with `copyTo = Seq("metadata.englishAnalysedCatchAll")`:
`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala:267`.
Type is ES `keyword` — not analyzed, exact-match only.

**Constraints:**
- **Free-text** — no controlled vocabulary.
- **No length limit** enforced by server.
- **Whitespace** is trimmed and empty strings are dropped by the client before
  POST: `kahuna/public/js/services/label.js:45`.
- **Case-sensitive** due to keyword mapping; `"Blue"` and `"blue"` are distinct labels.
- **No per-label metadata** (colour, owner, description). Labels have no existence
  outside of the images they are attached to.

**Relationship to other taggy fields:**
- `keywords` / `subjects` — IPTC metadata baked into the file; read-only or
  editable from the detail view metadata panel. Same chip rendering in the UI.
- `collections` — first-class entities with their own metadata (path, colour,
  description); managed by the collections service.
- `usageRights` / `category` — controlled vocabularies for rights; not free-text.
- Labels are the only "user can invent anything" tagging layer at the image level
  that persists globally and is searchable.

---

## 2. Visual appearance on the grid cell

**Position:** Bottom of the tile info strip, inside `.preview__info`, between
the collections row and the description paragraph.

Exact template location:
`kahuna/public/js/preview/image.html:88–97`:

```html
<ui-list-editor-compact class="preview__labeller"
                     images="ctrl.imageAsArray"
                     disabled="ctrl.selectionMode"
                     ng-if="!ctrl.inputtingLabel"
                     add-to-images="ctrl.addLabelToImages"
                     remove-from-images="ctrl.removeLabelFromImages"
                     accessor="ctrl.labelAccessor"
                     query-filter="queryLabelFilter">
</ui-list-editor-compact>
```

`.preview__labeller` CSS (`kahuna/public/stylesheets/main.css:1700–1706`):

```css
.preview__labeller {
    height: 25px;
    white-space: nowrap;
    overflow: hidden;
}
```

**Label chip appearance** — each label is an `<li class="element">` containing
either a `<span>` (selection mode) or an `<a>` (normal mode):

Template: `kahuna/public/js/edits/list-editor-compact.html:1–14`:
```html
<li class="element" ng-repeat="element in ctrl.plainList">
    <span ng-if="ctrl.disabled" class="element__value element__value--compact">{{element}}</span>
    <a class="element__value element__value--compact element__link"
       ng-if="!ctrl.disabled"
       ui-sref="search.results(...)">{{element}}</a>
</li>
```

CSS (`kahuna/public/js/edits/list-editor.css:35–59`):
- **Background:** `#00adee` (Guardian blue)
- **Text:** `white`
- **Border radius:** `2px` (full radius for compact variant — `.element__value--compact { border-radius: 2px }`)
- **Padding:** `0 5px`
- **Hover:** inverts — `color: #00adee; background-color: white`

In short: each label is a small Guardian-blue pill with white text. No per-label
colour differentiation — all pills are the same `#00adee`.

**Multiple labels:** `white-space: nowrap; overflow: hidden` on the container.
If labels overflow the 25px-tall strip they are **silently clipped**. No "…+N"
count badge, no wrapping, no tooltip for clipped labels. This is a known FIXME
(`main.css:1695–1697`: "FIXME: this is a little targeted").

**Interaction states:**
- **Hover (not selected):** label pills are clickable links. Clicking a label
  appends `#labelname` to the search query (via `queryLabelFilter` filter and
  `ui-sref`). `list-editor-compact.html:8–12`.
- **Selection mode** (`ctrl.selectionMode = true`): `disabled` is true on
  `ui-list-editor-compact`, so labels render as plain `<span>` (not links).
  `gr-add-label` is also hidden. The labels are still visible.
  `preview/image.html:89,96–99`.
- **`gr-add-label` button:** Rendered at `preview/image.html:100–105` but CSS
  hides it unless active: `.preview .gr-add-label--inactive { display: none }`
  (`main.css:1708`). It only appears when `ctrl.inputtingLabel = true`, i.e.
  when the user has clicked the add button and the inline form is open.
  When the form is open, `ui-list-editor-compact` is hidden
  (`ng-if="!ctrl.inputtingLabel"`).

---

## 3. Visual appearance elsewhere

**Side panel (`gr-image-metadata`):**
`kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html:977–997`:
```html
<div class="image-info" role="region" aria-label="Labels">
    <dl class="image-info__group">
        <dt class="flex-container">
            <span class="metadata-line__key flex-spacer">Labels</span>
            <gr-add-label gr-small="true" images="ctrl.selectedImages"></gr-add-label>
        </dt>
        <dd class="labels">
            <ui-list-editor-info-panel
                is-editable="true"
                images="ctrl.selectedImages"
                add-to-images="ctrl.addLabelToImages"
                remove-from-images="ctrl.removeLabelFromImages"
                accessor="ctrl.labelAccessor"
                query-filter="queryLabelFilter"
                element-name="label">
            </ui-list-editor-info-panel>
        </dd>
    </dl>
</div>
```

`ui-list-editor-info-panel` template (`list-editor-info-panel.html:1–22`):
- Each label chip has the same `#00adee` pill style.
- A `library_add` button appears when the label is only on *some* selected images
  (partial state, `element--partial` class, grey/white) — clicking adds it to all.
- A `×` remove button appears on each label.
- Labels are still clickable search links.

**Detail/edit view (`image-editor.html`):**  
`kahuna/public/js/edits/image-editor.html:260–281`. Section labelled "Labels" in
"Organisation and grouping". Uses `gr-add-label` + `ui-list-editor-upload`.
The upload variant (`list-editor-upload.html`) adds a "⇔" batch-apply button
when `ctrl.withBatch` is true (for use during the upload workflow).

**Upload prompt / preset labels:**  
`kahuna/public/js/upload/prompt/prompt.html:8`. Shows `<gr-preset-labels>` which
renders a list of **locally-stored** preset labels (see §4). These are not labels
on an image; they are a user preference for auto-labelling new uploads.
Same `#00adee` chip style (`gr-preset-labels.css:25–33`).

**Search results page:** Labels do NOT appear in the search results list
(`search/results.html`) beyond what is shown per tile.

**No aggregation panel:** There is no faceted label browser in the search UI.
Labels are exposed only as an autocomplete in the search input.

---

## 4. Editing UX

**Add from grid tile:**  
Click the `add_box` icon (materialicon) in the tile info strip. This sets
`ctrl.inputtingLabel = true`, which: (a) hides the pill list, (b) shows an
inline `<form>` with a text input via `gr-add-label`.

Template: `kahuna/public/js/components/gr-add-label/gr-add-label.html:15–47`.

- Placeholder: `"label1, label2, label3…"` — comma-separated multi-label entry
  in a single submit. `gr-add-label.js:26`.
- Autocomplete: as-you-type completion via `gr-datalist`. Source is
  `ctrl.labelSearch(q)` → `mediaApi.labelSearch({q})` → `GET /images/edits/label?q=...`
  returning existing label names with counts. `gr-add-label.js:64–70`.
- Multi-label autocomplete append: the datalist updater appends the selected
  suggestion after the last comma rather than replacing the whole input.
  `gr-add-label.js:72–76`.
- Submit: saves all comma-separated labels via `labelService.batchAdd`.
  `gr-add-label.js:25–27`.
- Cancel: ESC or Cancel button → `ctrl.active = false`, `ctrl.newLabel = ''`.

**Remove from grid tile:** Not available from the compact tile list editor
(`list-editor-compact.html` renders no remove button). Removal is only available
from the side panel or detail view.

**Add/remove from side panel:**  
`gr-add-label` at the top of the Labels section. Per-label `×` remove button in
`ui-list-editor-info-panel`. When multiple images are selected, the `library_add`
button applies a partial-coverage label to all selected images.

**Bulk-label multiple images:** Supported. `labelService.batchAdd(images, labels)`
takes an array of images: `label.js:44`. The side panel passes
`ctrl.selectedImages` (an Immutable.js list of all currently selected images).

**Preset labels (upload only):**  
The upload prompt (`upload/prompt/prompt.html`) shows `gr-preset-labels`, a
locally stored list of labels (in `localStorage` under key `"preset-labels"`:
`preset-label.js:7`). After each image uploads successfully, the upload jobs
controller automatically calls `labelService.add(image, presetLabels)` if the
list is non-empty: `upload-jobs.js:115`. Preset labels are **per-browser**, not
per-user-account.

**Optimistic update:** None. `labelService.batchAdd` / `batchRemove` call the
API, then poll with `apiPoll` until `untilLabelsEqual` passes (checks that the
image's returned labels match the expected set): `label.js:26–33`. Visually the
label is absent until the poll succeeds and `images-updated` is emitted and the
image refreshed.

**Undo:** None. No undo after label removal.

---

## 5. Backend / API

**Service that owns labels:** `metadata-editor`.

**Routes** (`metadata-editor/conf/routes:13–15`):

| Verb | Path | Handler |
|---|---|---|
| `GET` | `/metadata/:id/labels` | `EditsController.getLabels` |
| `POST` | `/metadata/:id/labels` | `EditsController.addLabels` |
| `DELETE` | `/metadata/:id/labels/*label` | `EditsController.removeLabel` |

**Add payload:** `{ "data": ["label1", "label2"] }` — array under `"data"` key,
validated as `List[String]`. `EditsController.scala:126–127`.

**Remove path:** single label, URL-encoded in path. Controller decodes via
`decodeUriParam(label)`. `EditsController.scala:139–140`. `common-lib/.../Edits.scala:98`:
```scala
def setUnitEntity(id, setName, name) =
  EmbeddedEntity(entityUri(id, s"/$setName/${URLEncoder.encode(name, "UTF-8")}"), ...)
```

**Response:** Argo hypermedia collection — each label returned as an
`EmbeddedEntity[String]` with a `DELETE` URI embedded. The frontend uses these
embedded delete URIs directly (`label.js:75`: `label.delete()`).

**Storage pipeline:**  
1. POST/DELETE hits metadata-editor.  
2. `EditsStore.setAddV2` / `setDeleteV2` writes to **DynamoDB** StringSet.  
3. After DynamoDB write, metadata-editor publishes `UpdateImageUserMetadata`
   message to **Kinesis**: `EditsController.scala:131,141`.  
4. **Thrall** consumes the Kinesis event and calls
   `es.applyImageMetadataOverride` to update the image in **Elasticsearch**:
   `thrall/app/lib/kinesis/MessageProcessor.scala:141`.  
5. The frontend polls via `apiPoll` until the image re-fetched from media-api
   shows the expected labels. `label.js:26–33`.

**Permissions:** Standard `auth` only (any authenticated user can add/remove
labels). No `authorisedForEditMetadataOrUploader` guard — unlike `setMetadata`
which does check `EditMetadata`. `EditsController.scala:124,139`.

**Image persistence:** An image with any labels is permanently persisted and will
not be garbage-collected: `media-api/app/lib/ImagePersistenceReasons.scala:124–125`.

---

## 6. Search & filter integration

**Query syntax:**  
Two equivalent forms:
- `label:foo` — field-scoped query. `QuerySyntax.scala:127,139` maps `"label"` → ES field `userMetadata.labels`.
- `#foo` — shorthand. Frontend converts `#` prefix to `label:` via `syntax.ts:49`.
- Labels with spaces: `#"label with space"` or `label:"label with space"`. `query-syntax.js:3`.

**ES query:** `filters.terms("labels", labels)` (multi-value AND/OR) or `Match(SingleField("userMetadata.labels"), phrase)`.
`ElasticSearch.scala:187`, `QuerySyntax.scala:83–85`.

**Label autocomplete (inline add):**  
`GET /images/edits/label?q=...` (media-api) → `SuggestionController.editsSearch("label", q)`
→ ES terms aggregation on `userMetadata.labels` field with the query as a prefix
filter. Returns `{key: string, docCount: number}` pairs. Used in `gr-add-label`'s
datalist. `media-api/conf/routes:10`, `SuggestionController.scala:35–42`,
`ElasticSearch.scala:376–380`.

The media-api root advertises this as `Link("label-search", .../images/edits/label{?q})`.
`MediaApi.scala:107`.

**Label suggestions (`suggested-labels`):**  
`mediaApi.labelsSuggest({q})` follows `root.follow('suggested-labels', {q})`. This
link is **not present** in the media-api root index links (`MediaApi.scala:107` does
not include `"suggested-labels"`). The call is used by:
- `gr-preset-labels.js:47` (preset label datalist suggestion)
- `query-suggestions.ts:251–254` (structured query autocomplete for `label:` field)

Both would silently fail to find the link. See §9 Open questions.

**Structured query UI:**  
`query-suggestions.ts:124–125` registers `"label"` as an autocomplete field type
in the structured query panel, backed by `suggestLabels` → `labelsSuggest`.
`syntax.ts:96` renders the value as `#value` or `#"value"` in the query string.

**No faceted label browser:** Labels cannot be browsed/filtered from a dedicated
aggregation panel. The only label-aware UI is the search text input.

---

## 7. Edge cases & quirks

1. **Empty/whitespace labels silently dropped.** Client filters before POST:
   `label.js:45`. Server never sees them.

2. **Duplicate label add is no-op.** DynamoDB StringSet `ADD` is idempotent.
   The polling check (`untilLabelsEqual`) will pass immediately after the
   no-op write because the label was already present.

3. **Labels with spaces.** Fully supported; search-quoted as `#"multi word"`.
   URL-encoded in DELETE path. Comma-separated input parsing trims spaces around
   commas but preserves spaces within a single label value: `gr-add-label.js:26`.

4. **Case-sensitive.** ES keyword field, exact match. `"Blue"` ≠ `"blue"`.
   There is nothing in the UI to warn users of case sensitivity.

5. **No enforced length limit.** The server accepts arbitrarily long label strings.

6. **Concurrent edits.** DynamoDB StringSet ADD is atomic per-label. Two users
   adding different labels simultaneously is safe. Two users removing the same label
   simultaneously: both will succeed (idempotent delete). Two users adding the same
   label simultaneously: both succeed, one is a no-op.

7. **Overflow at small tile sizes.** `.preview__labeller { height: 25px; white-space:
   nowrap; overflow: hidden }`. Labels that overflow are clipped with no indicator.
   The FIXME comment in `main.css:1695` acknowledges this is a fragile workaround.

8. **`suggested-labels` link missing from API root.** The media-api root response
   does not include `suggested-labels` in its HATEOAS links (`MediaApi.scala:107`),
   but the frontend calls `root.follow('suggested-labels', {q})` in two places
   (`gr-preset-labels.js:47`, `query-suggestions.ts:253`). This call will fail to
   resolve the link at runtime — the preset label datalist and the structured query
   label autocomplete are effectively broken.

9. **Selection mode disables add but not display.** During selection mode, labels
   are visible on tiles (as non-clickable spans) but the add button is hidden and
   the chips are not search links. Remove is also unavailable from the tile.
   `preview/image.html:89–105`.

10. **Preset labels are per-browser, not per-user-account.** `localStorage`
    persistence means clearing browser storage wipes them and they do not follow
    the user to another device/browser. `preset-label.js:7–11`.

11. **No undo for removal.** Deleting a label cannot be undone from the UI.

---

## 8. Coupling map

| File | What label-related thing lives here |
|---|---|
| `kahuna/public/js/services/label.js` | Core label service: `add`, `remove`, `batchAdd`, `batchRemove`, polling |
| `kahuna/public/js/services/preset-label.js` | Preset label service: localStorage CRUD for auto-apply-on-upload list |
| `kahuna/public/js/services/image-accessor.js` | `readLabels(image)` — extracts `userMetadata.data.labels.data` |
| `kahuna/public/js/services/image-list.js` | `getLabels(images)` — flattens labels from image list (for multi-select panel) |
| `kahuna/public/js/components/gr-add-label/gr-add-label.js` | Inline add-label button+form; comma-separated multi-add; autocomplete datalist |
| `kahuna/public/js/components/gr-add-label/gr-add-label.html` | Add-label form template |
| `kahuna/public/js/components/gr-add-label/gr-add-label.css` | Inline form sizing (25px height, 150px input) |
| `kahuna/public/js/components/gr-preset-labels/gr-preset-labels.js` | Preset label editor for upload prompt; `suggestedLabelsSearch` (broken, see §7.8) |
| `kahuna/public/js/components/gr-preset-labels/gr-preset-labels.html` | Preset label list + add form |
| `kahuna/public/js/components/gr-preset-labels/gr-preset-labels.css` | Preset label chip styling (same blue, 0.75 opacity) |
| `kahuna/public/js/edits/list-editor.js` | `ui-list-editor-compact` + `ui-list-editor-info-panel` + `ui-list-editor-upload` directives |
| `kahuna/public/js/edits/list-editor-compact.html` | Compact chip list for grid tile (no remove button) |
| `kahuna/public/js/edits/list-editor-info-panel.html` | Full chip list for side panel (with ×, apply-to-all) |
| `kahuna/public/js/edits/list-editor-upload.html` | Upload view chip list (with batch-apply button) |
| `kahuna/public/js/edits/list-editor.css` | All chip/pill CSS: colour `#00adee`, radius, hover invert |
| `kahuna/public/js/preview/image.js` | Grid tile controller: wires `labelAccessor`, `addLabelToImages`, `removeLabelFromImages` |
| `kahuna/public/js/preview/image.html` | Grid tile template: `ui-list-editor-compact.preview__labeller` + `gr-add-label` |
| `kahuna/public/stylesheets/main.css:1700` | `.preview__labeller` — 25px height, overflow hidden |
| `kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html:977` | Side panel "Labels" section: `gr-add-label` + `ui-list-editor-info-panel` |
| `kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js:283` | Side panel label wiring: `addLabelToImages`, `removeLabelFromImages`, `labelAccessor`, `selectedLabels()` |
| `kahuna/public/js/edits/image-editor.html:262` | Detail view "Labels" section: `gr-add-label` + `ui-list-editor-upload` |
| `kahuna/public/js/edits/image-editor.js:135–155` | Detail view label add/remove functions (wrapper around labelService) |
| `kahuna/public/js/upload/jobs/upload-jobs.js:115` | Auto-applies preset labels after upload completion |
| `kahuna/public/js/upload/prompt/prompt.html:8` | Renders `gr-preset-labels` in upload prompt |
| `kahuna/public/js/services/api/media-api.js:110–115` | `labelSearch` + `labelsSuggest` API calls |
| `kahuna/public/js/search-query/query-syntax.js:2–18` | `addLabel`, `removeLabel`, `getLabel` helpers; `#` shorthand and quoted syntax |
| `kahuna/public/js/search/query-filter.js:59` | `queryLabelFilter` Angular filter: formats label value as `#label` or `#"label"` for `ui-sref` |
| `kahuna/public/js/search/structured-query/query-suggestions.ts:124,251` | Structured query autocomplete for `label:` field (uses broken `labelsSuggest`) |
| `kahuna/public/js/search/structured-query/syntax.ts:49,96` | Maps `#` shorthand to `label` field type; renders as `#value` |
| `kahuna/public/js/search/syntax/syntax.html:140` | Help text: `label:DMskybrown` example chip |
| `metadata-editor/conf/routes:13–15` | Three label routes: GET/POST/DELETE `/metadata/:id/labels[/*label]` |
| `metadata-editor/app/controllers/EditsController.scala:116–143` | `getLabels`, `addLabels`, `removeLabel` action handlers |
| `common-lib/src/main/scala/com/gu/mediaservice/model/Edits.scala` | `Edits` case class with `labels: List[String]`; `labelsUri`; `setUnitEntity` with URL encoding |
| `common-lib/src/main/scala/com/gu/mediaservice/lib/aws/DynamoDB.scala:131` | `setAddV2` — DynamoDB StringSet ADD expression |
| `common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala:267` | ES mapping: `keywordField("labels")` with `copyTo: englishAnalysedCatchAll` |
| `common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/PersistedQueries.scala:47` | `hasLabels` persistence predicate |
| `media-api/app/lib/ImagePersistenceReasons.scala:124` | `HasLabels` persistence reason — images with labels are never GC'd |
| `media-api/app/lib/elasticsearch/ElasticSearch.scala:187,376` | `labelFilter` for search; `editsSearch` terms aggregation for label autocomplete |
| `media-api/app/lib/querysyntax/QuerySyntax.scala:127,139` | Parser: `"label"` token → ES `userMetadata.labels` field |
| `media-api/app/controllers/SuggestionController.scala:35` | `editsSearch` handler for label autocomplete |
| `media-api/app/controllers/MediaApi.scala:107` | Root index link `"label-search"` = `/images/edits/label{?q}` (note: no `"suggested-labels"` link) |
| `thrall/app/lib/kinesis/MessageProcessor.scala:141` | Processes `UpdateImageUserMetadata` → `es.applyImageMetadataOverride` |

---

## 9. Open questions

1. **Is `suggested-labels` a dead feature?** `mediaApi.labelsSuggest` follows
   `root.follow('suggested-labels', ...)` but this link is not in the media-api
   root index (`MediaApi.scala:107`). Was it removed intentionally? Does it resolve
   via some other mechanism (e.g. a different root, a different service)? Used by
   both `gr-preset-labels.js:47` and `query-suggestions.ts:253`.

2. **Is there a `suggested-labels` route that is not visible here?** The search
   was restricted to the `media-api` routes file and controllers. Could it be
   served by another service (e.g. metadata-editor or a separate suggestion
   service)?

3. **Does `label-search` autocomplete do prefix-matching or full-text?** The
   `editsSearch` in `ElasticSearch.scala:376–380` uses a `termsAgg` but the
   query filtering inside `aggregateSearch` is not visible in this audit. The
   `q` parameter is in `AggregateSearchParams` but how it filters the aggregation
   is unclear.

4. **What happens when a label chip overflows the 25px strip?** The CSS clips it
   but there is no visible indicator. Is this a known UX gap? The FIXME comment
   suggests it is, but there's no linked issue.

5. **Are there any admin/config tools for labels?** No label management UI was
   found (no rename, no merge, no bulk-remove). Is there an admin script or
   Elasticsearch query tool for label housekeeping?

6. **Is there any rate-limiting or quota on label adds?** No evidence found in
   metadata-editor or media-api. A user could theoretically add thousands of labels
   to a single image.

---

## Appendix: Out-of-scope observations (cap 15)

1. `label.js` has two versions of single-image wrapper (`add` / `remove`) and
   batch versions — the single-image wrappers simply call batch with a one-element
   array. Minor code smell.
2. `editsSearch` in `ElasticSearch.scala:378` has a TODO: `val field = "labels" //
   TODO was - params.field` — the field is hardcoded, ignoring the requested
   field.
3. `preset-label.js` stores data in `localStorage` with no expiry. Stale preset
   labels accumulate silently.
4. The `batchRemove` function in `label.js:62–82` maps each image to find the
   label hypermedia resource, then calls `label.delete()` on the embedded entity
   URI directly — bypassing the explicit DELETE `/metadata/:id/labels/*label`
   route and relying on the embedded resource's self-link instead.
5. No test coverage for `label.js` or `preset-label.js` was found in
   `kahuna/test/`.
