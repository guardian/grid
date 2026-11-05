# Soft Deletions Findings

**Date:** 2026-05-29
**Mode:** Research only. No code was changed.
**Deliverable:** Answers to Q1–Q10 from the soft-deletions-handoff.md, plus an
implementation sketch for Phase 1/2/3.

---

## Section 0 — Premise Check

All three premises were confirmed correct:

1. **Presence/absence of `softDeletedMetadata` field** — confirmed. The Scala model
   (`SoftDeletedMetadata.scala` L10–13) uses `Option[SoftDeletedMetadata]` on `Image`;
   `Image.ImageWrites` (`Image.scala` L154) uses `optionalField` — so the JSON key is
   absent when the image is not deleted, present when deleted. The ES mapping defines it
   as an object, not a boolean flag.

2. **Kahuna injects `-is:deleted` by default** — confirmed. `Parser.scala` L5–17 appends
   ` -is:deleted` to every query that doesn't already contain `is:deleted`.

3. **Kupua does not inject the suppression** — confirmed. `parseCql` in `cql.ts` is a
   pure CQL-to-clauses translator. Nothing in the search path injects a `mustNot` for
   `softDeletedMetadata`. Deleted images currently appear in Kupua default searches.

---

## Q1 — ES Field Shape

### Fields and types

The ES mapping is defined in `Mappings.scala` L372–375:

```scala
def softDeletedMetadataMapping(name: String) = nonDynamicObjectField(name).copy(properties = Seq(
  dateField("deleteTime"),
  keywordField("deletedBy")
))
```

- `softDeletedMetadata.deleteTime` — ES type `date`.
- `softDeletedMetadata.deletedBy` — ES type `keyword`.
- The container is a `nonDynamicObjectField` with `dynamic: "strict"` (`Mappings.scala`
  L376). It is a flat object mapping (not nested/nested-in-the-Lucene-sense), so there
  are no nested-query implications for filtering.

### Wire format of `deleteTime`

`SoftDeletedMetadata.SoftDeletedMetadataWrites` (`SoftDeletedMetadata.scala` L22–25)
uses `(__ \ "deleteTime").write[DateTime]` under `import play.api.libs.json.JodaWrites._`.
The project uses `play-json-joda` 3.0.4 (`build.sbt` L118). In play-json-joda 3.x, the
default `JodaDateTimeWrites` serialises `DateTime` as `JsString(d.toString())`. Joda's
`toString()` produces ISO-8601 with UTC offset, e.g. `"2021-06-01T12:00:00.000+00:00"`.
Because `deleteImage` creates the timestamp as
`DateTime.now(DateTimeZone.UTC)` (`MediaApi.scala` L371), the offset is `+00:00`.

The ES date field accepts ISO-8601 strings, so the stored `_source` value would be an
ISO-8601 string like `"2021-06-01T12:00:00.000+00:00"`. Kupua's TypeScript type
`deleteTime: string` is consistent with this.

### What `_source` looks like

A soft-deleted image's `_source` contains:

```json
{
  "softDeletedMetadata": {
    "deleteTime": "2021-06-01T12:00:00.000+00:00",
    "deletedBy": "user@guardian.co.uk"
  }
}
```

For reaped images, `deletedBy` is the literal string `"reaper"`.

When an image is undeleted, Thrall removes the entire key with the Painless script
`ctx._source.remove("softDeletedMetadata")` (`ElasticSearch.scala` L304). The field is
absent from `_source` entirely — there is no null/false residue.

A live fixture is not available from static analysis. The best confirmation is the
`applySoftDelete` Painless script in `ElasticSearch.scala` L279–286, which sets
`ctx._source.softDeletedMetadata = params.softDeletedMetadata` where the parameter is
`Json.toJson(softDeletedMetadata)` serialised by the same `SoftDeletedMetadataWrites`.

---

## Q2 — Default Suppression Gap

**Kupua currently shows deleted images in every search — including typed keyword
searches, field searches, and the empty-query initial view.**

Kahuna's `Parser.scala` L10–16 folds over `thingsToHideByDefault = List("is:deleted",
"usages@status:replaced")` and appends ` -is:deleted` to **every** query string before
parsing, unless the raw query already contains `is:deleted`. This is unconditional — it
applies to the empty default view, a `credit:"Getty"` search, a free-text keyword
search, everything. The only exception is when the user explicitly opts in to seeing
deleted images by including `is:deleted` in their query.

Kupua queries ES directly. The entry point for query building is `parseCql` in `cql.ts`
L475–499. It parses whatever CQL string it receives and returns `{ must, mustNot }`
clauses. There is no pre-processing step that injects default filters. Neither
`es-adapter.ts` nor any search-store path adds a `mustNot` for `softDeletedMetadata`.

The two places where `is:deleted` appears in Kupua's codebase are:
- `search-store.ts` L3853 and `typeahead-fields.ts` L371 — both use
  `parseCql("is:deleted").must[0]` as a filter chip query for explicit "show deleted"
  searches. Neither is a suppressor.

**Expected fix:** Add a single `mustNot.push({ exists: { field: "softDeletedMetadata" } })`
in `buildQuery()` (`es-adapter.ts` L455), gated by
`if (!queryStr.includes("is:deleted"))`. This is the structural equivalent of
`Parser.scala`'s behaviour — applied at the query-object assembly layer rather than as
string manipulation before `parseCql`. `buildQuery()` is where all system-policy filters
already live (free-filter, hasCrops, syndicationStatus). This approach does not affect
single-image detail fetches (`getById()` bypasses `buildQuery()` entirely), so deleted
images remain accessible via direct URL. See the Implementation Sketch for full rationale.

---

## Q3 — `is:deleted` Search Already Works

`buildIsQuery` in `cql.ts` L334–337:

```ts
if (v === "deleted") {
  return {
    query: { exists: { field: "softDeletedMetadata" } },
    negated,
  };
}
```

This exactly mirrors `IsDeleted.query` in `IsQueryFilter.scala` L68–70:

```scala
case class IsDeleted(isDeleted: Boolean) extends IsQueryFilter {
  override def query: Query = filters.or(
    (filters.existsOrMissing("softDeletedMetadata", _))(isDeleted)
  )
}
```

`filters.existsOrMissing(field, true)` in the Scala codebase produces an ES
`{ exists: { field: "softDeletedMetadata" } }` query — identical to Kupua's output.

The unit test at `cql.test.ts` L14–16 confirms this:

```ts
it("is:deleted → exists on softDeletedMetadata", () => {
  const { must } = parseCql("is:deleted");
  expect(must[0]).toEqual({ exists: { field: "softDeletedMetadata" } });
});
```

When negated (i.e. `-is:deleted`), `negated: true` causes `cql.ts` L489–493 to push the
query to `mustNot` rather than `must`, producing the correct ES `must_not: { exists: ...
}` clause.

---

## Q4 — SOURCE_INCLUDES Gap

`es-config.ts` L38–42 explicitly notes that `softDeletedMetadata` is excluded:

> "collections, softDeletedMetadata, identifiers, userMetadata — is excluded implicitly."

The `SOURCE_INCLUDES` array (`es-config.ts` L84–147) does not contain any of the
following strings:
- `"softDeletedMetadata"`
- `"softDeletedMetadata.deleteTime"`
- `"softDeletedMetadata.deletedBy"`

**Consequence:** In Kupua's current ES search responses, the `softDeletedMetadata`
property is never present on any image object, regardless of whether the image has been
deleted. This means `image.softDeletedMetadata === undefined` always in Kupua — making
the deleted banner and the `is:deleted` filter meaningless at the display level even if
the ES query were correct.

**What to add:** Either `"softDeletedMetadata"` (fetches the whole object — simpler and
correct since both subfields are always set together) or both dot-paths
`"softDeletedMetadata.deleteTime"` and `"softDeletedMetadata.deletedBy"`. The parent
object fetch is preferable: adding `"softDeletedMetadata"` to `SOURCE_INCLUDES` will
return both `deleteTime` and `deletedBy`. ES `_source` filtering, when a parent path is
included, returns the full nested object.

**Type note:** `types/image.ts` L144–147 defines `SoftDeletedMetadata` with both fields
as optional (`deleteTime?: string; deletedBy?: string`). The `grid-api/types.ts` L254–257
defines them as required. Once `softDeletedMetadata` is in `SOURCE_INCLUDES`, if the
field is present it will always have both subfields (they are written atomically in
`deleteImage`). The `types/image.ts` definition is over-cautious; the `grid-api/types.ts`
definition is more accurate for the non-null case.

---

## Q5 — Permission Gate for `is:deleted` Search

### The mechanism

`MediaApi.scala` L573–574:

```scala
val hasDeletePermission = authorisation.isUploaderOrHasPermission(request.user, "", DeleteImagePermission)
val canViewDeletedImages = _searchParams.query.contains("is:deleted") && !hasDeletePermission
```

Note: the empty string `""` in `isUploaderOrHasPermission` means the uploader check
always fails — so `hasDeletePermission` is true only if the user has the
`DeleteImagePermission` role permission globally.

`MediaApi.scala` L667–669:

```scala
val searchParams = if (canViewDeletedImages) {
  _searchParams.copy(uploadedBy = Some(Authentication.getIdentity(request.user)))
} else {
  _searchParams
}
```

### Semantics (verified)

- `canViewDeletedImages` is `true` when the query contains `is:deleted` AND the user
  does NOT have `DeleteImagePermission`. When true, `uploadedBy` is forced to the
  requesting user's identity — restricting results to the user's own deleted images only.

- `canViewDeletedImages` is `false` (no restriction applied) for users WITH
  `DeleteImagePermission` — they see all deleted images from any uploader.

- The variable name `canViewDeletedImages` is inverted/misleading: it actually means
  "should we restrict the deleted-image view to only the user's own uploads?" It is
  `true` for restricted users, not for privileged ones.

### What this means for Kupua

Kupua bypasses media-api entirely for ES searches. The `uploadedBy` restriction is never
applied. Any Kupua user who searches `is:deleted` will see all deleted images from all
uploaders — including images they didn't upload and wouldn't be permitted to see via
media-api.

This is a known, deliberate deviation in the development phase (Kupua is not yet
user-facing). When Kupua is deployed behind real infrastructure, the `/api` proxy can
replicate this filter server-side. This deviation **must** be documented in
`deviations.md` before Phase 2 ships.

---

## Q6 — Deletion Eligibility

`Image.scala` L38: `def canBeDeleted = !hasExports && !hasUsages`

- `hasExports = exports.nonEmpty` — any crop/export blocks deletion.
- `hasUsages = usages.nonEmpty` — any usage record blocks deletion.

In `deleteImage` (`MediaApi.scala` L362–388):

1. `imageCanBeDeleted = imageResponse.canBeDeleted(image)` — calls `image.canBeDeleted`
   (`ImageResponse.scala` L56).
2. If false → `ImageCannotBeDeleted`: 405 Method Not Allowed,
   `"cannot-delete: Cannot delete persisted images"` (`MediaApi.scala` L131).
3. If true but user lacks permission → `ImageDeleteForbidden`: 403 Forbidden,
   `"delete-not-allowed: No permission to delete this image"` (`MediaApi.scala` L132).
4. Permission check: `authorisation.isUploaderOrHasPermission(request.user,
   image.uploadedBy, DeleteImagePermission)` — user must either be the uploader or have
   the `DeleteImagePermission` role.

The hard-delete path (`hardDeleteImage`, `MediaApi.scala` L325–350) uses identical
eligibility rules but publishes `DeleteImage` instead of `SoftDeleteImage`.

---

## Q7 — Undelete Eligibility

`ImageExtras.userMayUndeleteImage` (`ImageExtras.scala` L94–98):

```scala
def userMayUndeleteImage(user: Principal, image: Image, authorisation: Authorisation): Boolean = {
  val canDelete = authorisation.isUploaderOrHasPermission(user, image.uploadedBy, DeleteImagePermission)
  val imageWasReaped = image.softDeletedMetadata.exists(_.deletedBy == "reaper")
  canDelete || imageWasReaped
}
```

- `canDelete`: user has `DeleteImagePermission` globally OR is the original uploader.
- `imageWasReaped`: `deletedBy` is the literal string `"reaper"` — set by
  `ReaperController` (`thrall/app/controllers/ReaperController.scala` L128) when Thrall's
  automated reaping runs.

### The "reaper" special case

The Reaper (`ReaperController.scala` L128) automatically soft-deletes images that are
eligible for reaping (not persisted, old enough, etc.) using `deletedBy = "reaper"`. The
logic is: if a human didn't choose to delete it, anyone should be able to restore it.
`imageWasReaped = true` makes `userMayUndeleteImage` return `true` regardless of
permissions.

**Discrepancy between Kahuna JS and Scala API:** `get-deleted-state.js` L14–21 grants
`canUndelete = true` when `userCanDeleteAnything || userUploadedThisImage || thisImageWasReaped`.
The JS also grants undelete to the uploader even if they lack `DeleteImagePermission`. The
Scala API (`ImageExtras.userMayUndeleteImage`) grants it for `canDelete` (which includes
the uploader check via `isUploaderOrHasPermission`) OR reaped. These are functionally
equivalent if `isUploaderOrHasPermission` includes the uploader as a true case — which it
does. So the discrepancy is not a real bug, but the JS effectively duplicates what
`isUploaderOrHasPermission` already handles.

---

## Q8 — Message Bus Flow

`MessageSubjects.scala` L8–9 confirms both subjects:

```scala
val SoftDeleteImage = "soft-delete-image"
val UnSoftDeleteImage = "un-soft-delete-image"
```

**Soft-delete write path:**

1. `deleteImage` (`MediaApi.scala` L371–382) writes `ImageStatusRecord` to DynamoDB via
   `softDeletedMetadataTable.setStatus(...)`, then publishes `UpdateMessage(subject =
   SoftDeleteImage, ...)` to Kinesis.
2. Thrall's `MessageProcessor.scala` L35 routes `SoftDeleteImageMessage` to
   `softDeleteImage` (`MessageProcessor.scala` L134–135).
3. `ElasticSearch.scala` L289–300: Painless script sets
   `ctx._source.softDeletedMetadata = params.softDeletedMetadata` on the ES document.

**Undelete write path:**

1. `unSoftDeleteImage` (`MediaApi.scala` L392–418) calls
   `softDeletedMetadataTable.updateStatus(id, isDeleted = false)` (sets `isDeleted =
   false` in DynamoDB, record remains), then publishes `UpdateMessage(subject =
   UnSoftDeleteImage, ...)`.
2. Thrall routes to `unSoftDeleteImage` (`MessageProcessor.scala` L36–138).
3. `ElasticSearch.scala` L304: Painless script: `ctx._source.remove("softDeletedMetadata")`.

The ES update is asynchronous — DynamoDB is updated synchronously first, making DynamoDB
the authoritative source during the brief window before Thrall applies the ES change.

---

## Q9 — DynamoDB Dual-Store

### Why two stores

This follows the CQRS pattern the Grid uses for all mutable image state. DynamoDB is the
**write-path authority** — fast synchronous writes, strong consistency within a single
item. ES is the **read-path replica** — eventually consistent but optimised for search.
If ES is rebuilt from scratch (migration, re-index), the soft-delete state is re-applied
from DynamoDB rather than being lost.

### `isDeleted: Boolean` — can it be false with a record present?

Yes. `SoftDeletedMetadataTable.updateStatus(imageId, isDeleted = false)`
(`SoftDeletedMetadataTable.scala` L36–46) updates the `isDeleted` flag to `false` on an
existing DynamoDB record without deleting the record. This is the write for undelete — the
record stays, but `isDeleted = false` marks it as not currently deleted. This is the
design choice: the deletion history (who originally deleted it, when) survives in DynamoDB
even after an undelete. The ES document has the field removed entirely.

### `updateStatus` vs `setStatus` vs `clearStatuses`

- **`setStatus`** (`SoftDeletedMetadataTable.scala` L21–23): puts a full `ImageStatusRecord`
  (upsert). Used in `deleteImage` to create the initial deletion record.
- **`setStatuses`** (`SoftDeletedMetadataTable.scala` L25–29): batch put. Used by the
  Reaper to write multiple reaped records at once.
- **`updateStatus`** (`SoftDeletedMetadataTable.scala` L36–46): partial update — changes
  `isDeleted` flag only, conditional on the item existing (`when(attributeExists("id"))`).
  Used in `unSoftDeleteImage`. Does not create a new record if none exists.
- **`clearStatuses`** (`SoftDeletedMetadataTable.scala` L31–34): deletes records entirely
  (batch delete). Used by the Reaper when hard-deleting reaped images — once an image is
  fully gone from ES, the DynamoDB record is no longer needed.

---

## Q10 — Kahuna Display Patterns

### What Kahuna shows for a deleted image

**Image detail view:**

`gr-metadata-validity.js` L16 sets `ctrl.isDeleted = image.data.softDeletedMetadata !==
undefined`. When true, the validity component (`gr-metadata-validity.html` L14–17) shows:

```html
<strong ng-if="ctrl.isDeleted">
    {{ctrl.unusableTextHeader}}
    <gr-icon title="This image cannot normally be used in content - image has been deleted">help</gr-icon>
</strong>
```

`unusableTextHeader` is a string from `$window._clientConfig` (server-injected
configuration). The list of `invalidReasons` is hidden when `isDeleted` is true (L18:
`ng-if="!ctrl.isDeleted"`). So deleted images show the unusable header plus the tooltip,
with the normal invalidity reasons suppressed.

**The Undelete button:**

`gr-archiver.html` L40: `<button ng-if="ctrl.canUndelete && ctrl.isDeleted">` shows an
"Undelete" button with an "Undeleting…" spinner state. When deleted but not undelectable,
`gr-archiver.html` L11–17 shows a disabled "Image Deleted" state.

**Search results grid:**

`results.js` L203 and L714 set `ctrl.isDeleted = true` when `softDeletedMetadata !==
undefined`. The template `results.html` L132 shows a deleted-state button
(`ng-if="ctrl.selectionCount > 0 && ctrl.isDeleted"`).

### What Kahuna does NOT show

**Neither `deletedBy` nor `deleteTime` is displayed anywhere in the Kahuna UI.**
`get-deleted-state.js` L15 reads `deletedBy` only to detect the `"reaper"` case for
permission logic — but this value is never rendered in any template. `deleteTime` is not
read from `softDeletedMetadata` anywhere in Kahuna's JavaScript or HTML.

### Gap Kupua can improve on

Kupua already has `softDeletedMetadata?: SoftDeletedMetadata` in `types/image.ts` L199.
Once the field is in `SOURCE_INCLUDES`, Kupua can display:

- **Who deleted it:** `deletedBy` — either a user email or `"reaper"`.
- **When it was deleted:** `deleteTime` — as a humanised relative date
  ("deleted 3 days ago") or a formatted absolute date. Kahuna shows nothing here.

This is strictly better UX than Kahuna's current display, requiring only UI work —
no new API calls, no new ES fields.

---

## Implementation Sketch

### Phase 1 — Read-only display (no permissions needed, implementable now)

Three changes, all in `kupua/`:

1. **`es-config.ts`:** Add `"softDeletedMetadata"` to `SOURCE_INCLUDES`. This single
   string fetches the whole object (both `deleteTime` and `deletedBy` subfields).
   Payload size impact is negligible — the field is only present on deleted images, which
   are a tiny fraction of the index; and even when present, it's ~80 bytes.

2. **Suppress deleted images from every search — `buildQuery()` in `es-adapter.ts`:**

   The structurally correct location for this is `buildQuery()` (`es-adapter.ts` L455),
   **not** string injection before `parseCql`. One extra `mustNot.push(...)` after the
   CQL parsing block:

   ```ts
   // After CQL parsing (~L465–468):
   if (queryStr) {
     const cql = parseCql(queryStr);
     must.push(...cql.must);
     mustNot.push(...cql.mustNot);
   }

   // Suppress deleted images unless the user explicitly opted in (is:deleted)
   if (!queryStr.includes("is:deleted")) {
     mustNot.push({ exists: { field: "softDeletedMetadata" } });
   }
   ```

   **Why `buildQuery()` rather than string injection before `parseCql`:**

   - **Operates at the right architectural layer.** `buildQuery()` is where all
     system-policy filters live (free-filter, hasCrops, syndicationStatus, date ranges).
     The deletion suppression is the same kind of concern — a blanket invariant — so it
     belongs alongside those, not in string preprocessing.
   - **Doesn't mutate the user's query text.** No fragile string concatenation. The
     user's raw CQL string flows into `parseCql` unmodified.
   - **Produces the identical ES clause** (`must_not: [{ exists: { field: "softDeletedMetadata" } }]`).
     Same performance — ES evaluates it the same way regardless of how it was assembled.
   - **One line of code.** The `includes("is:deleted")` substring check is the same
     compromise as Scala's `input.contains(thingToHide)` — applied as a policy gate,
     not as text editing.

   **Does NOT interfere with:**

   - **Direct URL to a deleted image** (`/search?image=abc` or `/images/abc`):
     The detail panel calls `getById()` (`es-adapter.ts` L786), which issues a direct
     `{ terms: { id: [id] } }` query to ES — completely bypasses `buildQuery()`. A
     deleted image loads normally and can show the "Deleted" banner.
   - **Explicit `is:deleted` searches** (`/search?query=is:deleted`):
     The query string contains `"is:deleted"` → the `mustNot` is not added. `parseCql`
     puts the `exists` clause into `must`. User sees only deleted images. Correct.
   - **Future deletion/undelete actions** (Phase 3):
     Write operations go through the `/api` proxy (to media-api). `buildQuery()` is
     read-path only.
   - **Future media-api integration** (replacing ES-direct):
     If Kupua switches to querying via media-api's `/images`, `buildQuery()` is dead
     code. Media-api already injects `-is:deleted` in `Parser.scala`. No conflict.
     In a hybrid phase, the per-adapter architecture means the suppression lives only
     in `ElasticsearchDataSource`. An API adapter wouldn't include it.

   This must apply to **all** searches — empty query, keyword searches, field searches,
   everything. It is not a "default view" tweak; it is a blanket invariant. Highest-
   priority fix: deleted images currently appear in every Kupua search result.

3. **Deleted banner in detail:** In the image detail panel, check
   `image.softDeletedMetadata`. If present, show a "Deleted" banner with `deletedBy`
   (humanised — "reaped automatically" if `deletedBy === "reaper"`) and a formatted
   `deleteTime`. This is a pure UI addition — no new API calls needed. Works because
   `getById()` fetches images regardless of deletion state (it bypasses `buildQuery()`).

### Phase 2 — `is:deleted` search (needs deviation documented)

`is:deleted` CQL already translates correctly (`cql.ts` L334–337, verified by test).
Users can type `is:deleted` in the Kupua search bar today and it will produce the correct
ES query — once `softDeletedMetadata` is in `SOURCE_INCLUDES` the results will render
with deletion metadata.

The deviation to document in `deviations.md`: Kupua bypasses media-api's
`canViewDeletedImages` filter. All Kupua users currently see all deleted images when
searching `is:deleted`, regardless of whether they uploaded them or have
`DeleteImagePermission`. When permissions land, Kupua's `/api` proxy can enforce the
same gate server-side. Until then, this is a deliberate development-phase deviation.

### Phase 3 — Soft-delete and undelete actions (needs edits + permissions phase)

- **Delete:** proxy `DELETE /images/:id` through Kupua's `/api`. Check eligibility:
  `image.canBeDeleted` (no exports, no usages — both fields already in `SOURCE_INCLUDES`).
  Check permission: user has `DeleteImagePermission` or is the uploader (need session
  permissions from `/api/session`).

- **Undelete:** proxy `PUT /images/:id/undelete`. Eligibility: `canDelete || deletedBy ==
  "reaper"` — same data already available once `softDeletedMetadata` is in
  `SOURCE_INCLUDES`.

- Neither action requires new ES fields — just the proxied API endpoints and the
  eligibility logic already described in Q6/Q7.

---

## Out-of-Scope Observations (≤ 10)

1. `types/image.ts` `SoftDeletedMetadata` has both fields optional; `grid-api/types.ts`
   has them required. Once the field is in `SOURCE_INCLUDES` the non-null case always
   has both — the `grid-api/types.ts` version is more accurate.

2. `unSoftDeleteImage` (`MediaApi.scala` L392) calls `softDeletedMetadataTable.updateStatus`
   (sets `isDeleted = false`) not `clearStatuses` (deletes the record) — so DynamoDB
   retains deletion history even after undelete.

3. `get-deleted-state.js` grants `canUndelete` to the uploader via JS-side check, but
   the API gate (`ImageExtras.userMayUndeleteImage`) also covers uploaders via
   `isUploaderOrHasPermission`. Not a bug, but redundant logic.

4. `ReaperController.scala` writes to both DynamoDB and ES directly (bypassing the
   Kinesis/Thrall path for batch soft-deletes) — `softDeleteNextBatchOfImages` is called
   on `es` directly. This is intentional for batch efficiency.

5. `SOURCE_EXCLUDES` in `es-config.ts` is now empty (`SOURCE_INCLUDES` whitelist approach
   superseded it) — the comment at L30 explains this is kept as an export only.

6. `MediaApi.scala` L573: `isUploaderOrHasPermission(request.user, "", DeleteImagePermission)`
   passes an empty string for `uploadedBy` in the permission-gate check — so uploader
   match always fails and `hasDeletePermission` is purely role-based.

7. The `gr-archiver.html` `canUndelete` button shows "Undeleting…" as a spinner label but
   the `undelete()` function (`gr-archiver.js` L118–129) doesn't await the API call before
   clearing `canUndelete` and `isDeleted` (it sets them in `.then()` callback without
   proper error rollback on failure, only `.catch()` alerts).

8. `ImageStatusRecord.isDeleted` Boolean in DynamoDB creates a three-state history:
   record absent (never deleted), record with `isDeleted = true` (currently deleted),
   record with `isDeleted = false` (was deleted, now undeleted). The ES document only has
   two states: field present or absent.

9. `usages@status:replaced` is also in `thingsToHideByDefault` (`Parser.scala` L7`) but
   Kupua does not suppress it either. The suppression gap applies to both tokens.

10. Hard delete (`DELETE /images/:id/hard-delete`) is a separate route from soft delete
    (`DELETE /images/:id`) — `hardDeleteImage` publishes `DeleteImage` (permanent removal
    from ES), not `SoftDeleteImage`. Not relevant for Kupua read-path but worth knowing
    for the edits phase.
