# media-api gap-01: Argo response envelope for `POST /images/search-after` — findings

Date: 2026-05-31  
Status: Read-only research. No files modified.  
Sources: `ArgoHelpers.scala`, `CollectionResponse.scala`, `EntityResponse.scala`,
`EmbeddedEntity.scala`, `MediaApi.scala` (lines 550–600),
`kupua/src/dal/grid-api/types.ts`, `kupua/src/dal/grid-api/argo.ts`.

---

## 1. Do `respond` / `respondCollection` return a `Result` or an intermediate?

**They return `play.api.mvc.Result` directly.**

The call chain is:

```scala
// ArgoHelpers.scala:28
def respondCollection[T](...)(implicit writes: Writes[T]): Result = {
  val response = CollectionResponse(uri, offset, length, total, data, links, actions)
  serializeAndWrap(response, Ok)          // ← Result here
}

// ArgoHelpers.scala:88
protected def serializeAndWrap[T](response: T, status: Status)
                                 (implicit writes: Writes[T]): Result =
  status(Json.toJson(response)).as(ArgoMediaType)
```

There is no intermediate value, builder, or separate "seal" step.
`respondCollection` is a one-shot call that produces the HTTP 200 with the
correct body and content-type set atomically.

---

## 2. Content-type constant

```scala
// ArgoHelpers.scala:13
val ArgoMediaType = "application/vnd.argo+json"
```

This is defined on the `ArgoHelpers` trait, so any controller that mixes in
`ArgoHelpers` (as `MediaApi` does) can reference `ArgoMediaType` directly.

---

## 3. `CollectionResponse` — shape and extensibility

```scala
// CollectionResponse.scala
case class CollectionResponse[T](
  uri:     Option[URI]       = None,
  offset:  Option[Long]      = None,
  length:  Option[Long],
  total:   Option[Long]      = None,
  data:    Seq[T],
  links:   List[Link]        = List(),
  actions: Option[ExtraCounts] = None   // ← an admitted hack (see FIXME comment)
)
```

The `Writes` instance uses Play JSON's **functional combinator** pattern:

```scala
implicit def collectionResponseWrites[T: Writes]: Writes[CollectionResponse[T]] = (
  (__ \ "uri").writeNullable[String]...  ~
  (__ \ "offset").writeNullable[Long]    ~
  (__ \ "length").writeNullable[Long]    ~
  (__ \ "total").writeNullable[Long]     ~
  (__ \ "data").write[Seq[T]]            ~
  (__ \ "links").writeNullable[List[Link]]... ~
  (__ \ "actions").writeNullable[ExtraCounts]
)(unlift(CollectionResponse.unapply[T]))
```

The combinator arity matches the case class arity exactly; adding a field requires:
1. adding it to the case class,
2. extending the combinator chain (arity limit is 22 in Play JSON),
3. updating every call site.

`CollectionResponse` lives in `common-lib`, shared by all services.  Modifying it
is feasible but is a cross-cutting change.

---

## 4. How `imageSearch()` calls `respondCollection`

```scala
// MediaApi.scala:571
yield respondCollection(
  imageEntities,           // Seq[EmbeddedEntity[JsValue]]
  Some(searchParams.offset),
  Some(totalCount),
  extraCounts,             // Option[ExtraCounts] (tickerCounts)
  links                    // prev/next page links
)
```

Resulting JSON shape (abbreviated):

```json
{
  "offset": 0,
  "length": 50,
  "total": 1300000,
  "data": [
    { "uri": "https://.../images/abc", "data": { "id": "abc", ... }, "links": [...] },
    ...
  ],
  "links": [
    { "rel": "next", "href": "..." }
  ],
  "actions": { "tickerCounts": { ... } }
}
```

Content-type: `application/vnd.argo+json`.

---

## 5. Three options for the search-after response

### Required output shape

```json
{
  "data": [ ...EmbeddedEntity<Image>... ],
  "total": 1300000,
  "sortValues": [[1716000000000, "abc"], [1715999999000, "def"]],
  "nextSortValues": [1715999000000, "ghi"],
  "pitId": "refreshed-pit-id"
}
```

---

### Option (a) — Extend `CollectionResponse` with optional extra fields

Add `sortValues`, `nextSortValues`, `pitId` as optional fields to the shared
`CollectionResponse` case class and its `Writes`.

**Assessment: not recommended.**

- Modifies `common-lib`, which is compiled into every service.
- `CollectionResponse` already has the admitted `actions`-hack FIXME; this would
  be a second such hack.
- Requires coordination with the wider team; breaks the API contract for all
  consumers that parse `CollectionResponse`.
- The fields are only meaningful for cursor-based search — leaking them into
  the general collection response model is wrong semantically.

---

### Option (b) — Build the `Result` manually: `Ok(Json.obj(...)).as(ArgoMediaType)`

```scala
// Inside the controller (extends ArgoHelpers, so ArgoMediaType is in scope)
val json = Json.obj(
  "data"           -> Json.toJson(imageEntities),
  "total"          -> totalCount,
  "sortValues"     -> sortValues,        // JsArray
  "nextSortValues" -> nextSortValues,    // Option[JsArray] → omitted if None
  "pitId"          -> pitId              // Option[String]  → omitted if None
)
Ok(json).as(ArgoMediaType)
```

**Assessment: recommended.** See §6 below.

---

### Option (c) — Use `respond(JsObject)` with a hand-built JSON object as `data`

`respond()` wraps its argument in `{ "data": <arg>, "links": [...] }`.  Passing a
`JsObject` containing `data`, `total`, etc. as the argument produces:

```json
{ "data": { "data": [...], "total": ..., "sortValues": ... } }
```

This is a double-nesting that doesn't match any existing Argo shape.
Kupua would need custom unwrapping.  **Not recommended.**

---

## 6. Recommended approach: option (b)

`Ok(Json.obj(...)).as(ArgoMediaType)` is exactly what `serializeAndWrap` does
internally — it is not "bypassing" Argo, it is the same two-line pattern with a
custom JSON object.

**Reasons:**

1. **Zero shared code changes.** `common-lib` is untouched.
2. **Correct content-type.** Uses the same `ArgoMediaType` constant; the response
   is indistinguishable at the HTTP level from a `respondCollection` response.
3. **Minimal coupling.** A new `case class SearchAfterResults` with a plain
   `OWrites` (per instruction §20) can serialise the body; the controller
   just calls `Ok(Json.toJson(results)).as(ArgoMediaType)`.
4. **Idiomatic for non-standard shapes.** The `actions`-hack FIXME in
   `CollectionResponse` shows the authors were already uncomfortable stuffing
   extra fields there.  A bespoke `JsObject` is cleaner.

**Code sketch:**

```scala
// ElasticSearchModel.scala (per instruction §10, §20)
case class SearchAfterResults(
  data:           Seq[EmbeddedEntity[JsValue]],
  total:          Long,
  sortValues:     Seq[Seq[JsValue]],
  nextSortValues: Option[Seq[JsValue]],
  pitId:          Option[String]
)
object SearchAfterResults {
  implicit val jsonWrites: OWrites[SearchAfterResults] = Json.writes[SearchAfterResults]
}
```

```scala
// MediaApi.scala (inside the new handler method)
// imageEntities = hits map (hitToImageEntity _).tupled   (mirrors imageSearch)
val results = SearchAfterResults(
  data           = imageEntities,
  total          = totalCount,
  sortValues     = sortValsFromHits,
  nextSortValues = lastSortValues,
  pitId          = maybeNewPitId
)
Ok(Json.toJson(results)).as(ArgoMediaType)
```

Play's `Json.writes` macro handles `Option` naturally (absent key when `None`),
`Seq[JsValue]` serialises as a JSON array, and `Seq[Seq[JsValue]]` serialises as
an array of arrays — exactly the shape required.

---

## 7. Does kupua need the Argo envelope structure, or just the content-type?

**Short answer: it needs neither strictly, but the project has decided to use the
Argo content-type everywhere (§15.4 of conventions doc — "resolved").**

**Detail:**

- `kupua/src/dal/grid-api/grid-api-adapter.ts` calls `response.json()` directly —
  it does **not** inspect `Content-Type` before parsing.
- `SearchResponseRaw` (kupua's type for search API responses) already matches the
  flat shape: `{ data, total, offset, length, links, actions }`.  For
  `search-after`, kupua would define a new type with `sortValues`, `nextSortValues`,
  `pitId` at the top level — no Argo-specific envelope parsing is needed.
- The Argo *content-type* matters for Play's middleware (action composition,
  logging, CSP headers) and for any future consumers, so it should still be set.
- The Argo *envelope structure* (the `{ "uri", "data", "links", "actions" }` wrapper)
  is **not** required here: the cursor fields (`sortValues`, `nextSortValues`, `pitId`)
  must be top-level, not nested inside a `data` sub-object.  Option (b) satisfies
  this — the JSON has `data`, `total`, and the cursor fields all at the root, which
  is a reasonable Argo-compatible convention (the content-type is correct; the fields
  match what the client negotiated).

**Conclusion:** Use option (b).  Set `ArgoMediaType` as the content-type; put all
fields flat at the root; define a bespoke `SearchAfterResults` case class with its
own `OWrites`.  This matches the project's "full Argo everywhere" decision while
avoiding any modification to shared `common-lib` code.
