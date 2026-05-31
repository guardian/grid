# media-api gap-01: SearchParams from JSON body — findings

Date: 2026-05-31  
Status: Read-only research. No files modified.

---

## 1. Does `Reads[SearchParams]` exist?

**No.** A workspace-wide grep for `Reads[SearchParams]`, `Json.reads[SearchParams]`,
and `implicit val searchParamsReads` returns zero hits.

`SearchParams` has exactly one constructor pathway: the companion object `apply(request:
Authentication.Request[Any])` in
[`media-api/app/lib/elasticsearch/ElasticSearchModel.scala`](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala)
(lines 133–195). It reads exclusively from `request.getQueryString(...)`.

There is also `toStringMap` (lines 197–225) which serialises to `Map[String, String]`
for logging/forwarding, but no Play JSON codec in either direction.

---

## 2. Does `Reads[Condition]` exist?

**No.** `Condition` and all its subtypes (`Negation`, `Match`, `NegationNested`, `Nested`)
are defined in
[`media-api/app/lib/querysyntax/model.scala`](../../../media-api/app/lib/querysyntax/model.scala)
as bare Scala sealed-trait/case-class hierarchy with **zero** JSON typeclass instances.

The only way to produce a `List[Condition]` today is:

```scala
val structuredQuery = query.map(Parser.run) getOrElse List()
```

where `query: Option[String]` is parsed from the `q` query-string key.  That is
exactly what we should do from the JSON body too — read `q` as a `String`, run it
through `Parser.run`. No `Reads[Condition]` is needed; the parser is the codec.

---

## 3. Does `Tier` have a JSON representation?

**No.** `Tier` is a sealed trait (`Internal`, `ReadOnly`, `Syndication`) defined in
[`common-lib/src/main/scala/com/gu/mediaservice/lib/auth/ApiAccessor.scala`](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/auth/ApiAccessor.scala)
with a string-factory `Tier.apply(String)` but no Play JSON `Reads` or `Writes`.

This is intentional: `tier` is **not a body field**. It is always derived from the
auth'd request: `request.user.accessor.tier`.  For the new endpoint,
`tier` is injected into the params by the controller after authentication, identical
to how `SearchParams.apply(request)` sources it today.

---

## 4. JSON instances that DO exist for field types in `SearchParams`

| Type | Reads | Writes | Location |
|---|---|---|---|
| `UsageStatus` | ✓ `JsPath.read[String].map(UsageStatus(_))` | ✓ | `common-lib/model/usage/UsageStatus.scala:33` |
| `SyndicationStatus` | ✓ `JsPath.read[String].map(SyndicationStatus(_))` | ✓ | `common-lib/model/SyndicationStatus.scala:24` |
| `PrintUsageFilters` | ✗ | ✗ | `common-lib/model/PrintUsageFilters.scala:5` — plain case class, no JSON |
| `Tier` | ✗ | ✗ | `common-lib/lib/auth/ApiAccessor.scala:7` — string factory only |
| `PayType` (Enumeration) | ✗ | ✗ | `ElasticSearchModel.scala:105` — string-factory only |

---

## 5. Fields in `SearchParams` that DON'T make sense for `search-after`

| Field | Verdict | Reason |
|---|---|---|
| `offset: Int` | **Drop** | Cursor pagination replaces offset. Force to 0 internally. Accepting it from the body would be a footgun. |
| `length: Int` | Keep | Still needed as page size. |
| `countAll: Option[Boolean]` | **Drop or force false** | ES `search_after` with a PIT does not support `track_total_hits` cheaply; it's always approximate or disabled. Accepting it silently is misleading. |
| `shouldFlagGraphicImages: Boolean` | **Not a body field** | Always `false` in `SearchParams.apply` today; server-side concern. |
| `orderBy: Option[String]` | **Restricted** | `search_after` requires stable sort. Only a fixed tie-breaking sort (e.g. `uploadTime DESC, _id ASC`) is safe. Accepting arbitrary `orderBy` risks cursor corruption. Either drop it or whitelist. |
| `ids: Option[List[String]]` | Unusual but harmless | Keep if needed; the client is unlikely to combine cursor + id list but it doesn't break anything. |
| All date/filter/label fields | Keep | All valid as filter constraints on a cursor-paged search. |

---

## 6. Design recommendation: Option A vs Option B

**Option A** — Standalone `SearchAfterParams` case class with its own `fromJson`  
**Option B** — Parse into a `SearchParams`, compose inside `SearchAfterParams`

### Recommendation: Option B (compose `SearchParams` inside `SearchAfterParams`)

Rationale:

- The ES query-building layer (`ElasticSearch.scala`) already takes `SearchParams`
  as its primary argument. A new `searchAfter` method can accept `SearchAfterParams`
  which carries a `SearchParams` plus the cursor fields.
- Avoids duplicating 30+ lines of per-field parsing logic that already lives in
  `SearchParams.object`.
- Keeps `SearchParams.validate()` (offset/length bounds checks) reusable.
- The "forbidden" fields (`offset`, `countAll`, `orderBy`) are handled by
  `fromJson` forcing/ignoring them before constructing `SearchParams` — the internal
  representation is still valid.

The only friction is that `readOrderBy` is `private` to `SearchParams.object`
(line 130). It's 3 lines; either make it `private[elasticsearch]` or duplicate it.

---

## 7. Concrete implementation sketch

```scala
// In ElasticSearchModel.scala — add below SearchParams:

case class SearchAfterParams(
  searchParams: SearchParams,
  searchAfter: Option[Seq[JsValue]], // ES sort values from last hit
  pit: Option[String]                // point-in-time id
)

object SearchAfterParams {

  // Re-exposes the private helper from SearchParams for use here.
  private def readOrderBy(raw: String): String =
    if (raw == "oldest") "uploadTime"
    else if (raw == "newest") "-uploadTime"
    else raw

  def fromJson(body: JsValue, tier: Tier): Either[JsError, SearchAfterParams] = {
    import SearchParams._
    import com.gu.mediaservice.lib.formatting.parseDateFromQuery

    def str(key: String): Option[String]       = (body \ key).asOpt[String]
    def commaSep(key: String): List[String]    = str(key).toList.flatMap(commasToList)

    val query           = str("q")
    val structuredQuery = query.map(Parser.run).getOrElse(List.empty)

    val printUsageFilters =
      str("printUsageIssueDate").flatMap(parseDateFromQuery).map { issueDate =>
        PrintUsageFilters(
          issueDate   = issueDate,
          sectionCode = str("printUsageSectionCode"),
          pageNumber  = str("printUsagePageNumber").flatMap(parseIntFromQuery),
          edition     = str("printUsageEdition").flatMap(parseIntFromQuery),
          orderedBy   = str("printUsageOrderedBy")
        )
      }

    val params = SearchParams(
      query             = query,
      structuredQuery   = structuredQuery,
      ids               = str("ids").map(_.split(",").toList),
      offset            = 0,           // cursor replaces offset; ignored
      length            = str("length").flatMap(parseIntFromQuery).getOrElse(10),
      orderBy           = None,        // see §5 — drop or whitelist; start with None
      since             = str("since").flatMap(parseDateFromQuery),
      until             = str("until").flatMap(parseDateFromQuery),
      modifiedSince     = str("modifiedSince").flatMap(parseDateFromQuery),
      modifiedUntil     = str("modifiedUntil").flatMap(parseDateFromQuery),
      takenSince        = str("takenSince").flatMap(parseDateFromQuery),
      takenUntil        = str("takenUntil").flatMap(parseDateFromQuery),
      archived          = str("archived").flatMap(parseBooleanFromQuery),
      hasExports        = str("hasExports").flatMap(parseBooleanFromQuery),
      hasIdentifier     = str("hasIdentifier"),
      missingIdentifier = str("missingIdentifier"),
      valid             = str("valid").flatMap(parseBooleanFromQuery),
      free              = str("free").flatMap(parseBooleanFromQuery),
      payType           = str("payType").flatMap(parsePayTypeFromQuery),
      hasRightsCategory = str("hasRightsCategory").flatMap(parseBooleanFromQuery),
      uploadedBy        = str("uploadedBy"),
      labels            = commaSep("labels"),
      hasMetadata       = commaSep("hasMetadata"),
      persisted         = str("persisted").flatMap(parseBooleanFromQuery),
      usageStatus       = commaSep("usageStatus").map(UsageStatus(_)),
      usagePlatform     = commaSep("usagePlatform"),
      tier              = tier,        // from auth'd request, never from body
      syndicationStatus = str("syndicationStatus").flatMap(parseSyndicationStatus),
      countAll          = None,        // see §5 — force off for cursor pagination
      printUsageFilters = printUsageFilters,
      shouldFlagGraphicImages = false, // server-side flag, not a body param
      useAISearch       = str("useAISearch").flatMap(parseBooleanFromQuery),
      vecWeight         = str("vecWeight").flatMap(parseBoundedDoubleFromQuery)
    )

    // Validate length (offset is always 0, no need to validate it)
    SearchParams.validateLength(params) match {
      case Left(err) => Left(JsError(err.message))
      case Right(_)  =>
        Right(SearchAfterParams(
          searchParams = params,
          searchAfter  = (body \ "searchAfter").asOpt[Seq[JsValue]],
          pit          = str("pit")
        ))
    }
  }
}
```

Key points:
- `tier` is injected from `request.user.accessor.tier` in the controller, never from `body`.
- `offset` is forced to 0; `countAll` to `None`; `orderBy` to `None`.
- All string-to-value helpers (`parseDateFromQuery`, `parseIntFromQuery`, etc.) are
  reused unchanged — they take `String`, not `JsValue`.
- `UsageStatus` has its own `Reads` but going via `commaSep(...).map(UsageStatus(_))`
  keeps parity with the query-string path (comma-separated list of status strings).
- `searchAfter` is typed `Option[Seq[JsValue]]` because ES sort values can be
  heterogeneous (String, Long, etc.); preserve raw JSON until the ES layer unwraps it.

---

## 8. Open questions not resolved by this research

1. **PIT lifecycle.** Does the controller open the PIT on first call and return it in
   the response, or does the client supply it on every call? Either is valid but the
   API contract differs.

2. **`orderBy` for cursor stability.** `search_after` requires a deterministic tiebreaker
   sort. The current `orderBy` values ("oldest"/"newest"/raw field) are not guaranteed
   to be unique. A secondary `_id` sort must always be appended in the ES layer.
   This is an ES-layer concern, not a params-parsing concern, but worth flagging.

3. **`readOrderBy` visibility.** Currently `private` in `SearchParams.object`. If
   Option B is chosen and `SearchAfterParams` wants to share it, the simplest fix is
   `private[elasticsearch]`. Alternatively duplicate the 3-line match.

4. **Body content-type validation.** The controller must use `auth.async(parse.json)`
   (Grid-wide pattern, see instructions §3). If the body is not valid JSON, Play will
   return a 400 before the handler fires — no extra validation needed.
