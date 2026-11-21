# media-api gap-01: elastic4s PIT + search-after API — findings

Date: 2026-05-31  
Status: Read-only research. No files modified.  
Sources: `build.sbt`, GitHub `Philippus/elastic4s` series/8.x branch (exact same
codebase as the published `nl.gn0s1s` Maven artefacts).

---

## 1. Exact elastic4s version

`build.sbt` line 81:

```scala
val elastic4sVersion = "8.19.1"
```

Dependencies declared at lines 105–107:

```scala
"nl.gn0s1s" %% "elastic4s-core"         % elastic4sVersion,
"nl.gn0s1s" %% "elastic4s-client-esjava" % elastic4sVersion,
"nl.gn0s1s" %% "elastic4s-domain"        % elastic4sVersion,
```

Note: the group ID changed from `com.sksamuel.elastic4s` to `nl.gn0s1s` starting
at version 8.12.0. The codebase (package names, class names) is unchanged; this is
purely a Maven coordinate rename. The GitHub repo is `Philippus/elastic4s`,
`series/8.x` branch.

---

## 2. `SearchRequest.pit()` — the correct method signature

**Source:** `elastic4s-domain/src/main/scala/com/sksamuel/elastic4s/requests/searches/SearchRequest.scala`

```scala
def pit(pit: Pit): SearchRequest = {
  // When a pit is provided, no target must be given
  copy(pit = Some(pit), indexes = Indexes(Nil))
}
```

Key point: `.pit(...)` **automatically zeroes out `indexes`** in the same `copy`.
You do not need to call `ElasticDsl.search(Nil)` first.  Calling it on a request
already created with an index name (e.g. `ElasticDsl.search(imagesCurrentAlias)`)
is safe — the index is cleared for you.

---

## 3. `Pit` case class

**Source:** `elastic4s-domain/src/main/scala/com/sksamuel/elastic4s/requests/searches/Pit.scala`

```scala
case class Pit(id: String, keepAlive: Option[FiniteDuration] = None) {
  def keepAlive(keepAlive: FiniteDuration): Pit = copy(keepAlive = Some(keepAlive))
}
```

Construction examples:

```scala
import scala.concurrent.duration._
import com.sksamuel.elastic4s.requests.searches.Pit

Pit(pitId)                          // no keep-alive refresh on this search
Pit(pitId, Some(5.minutes))         // keep-alive via constructor
Pit(pitId).keepAlive(5.minutes)     // keep-alive via fluent method
```

---

## 4. `SearchRequest.searchAfter()` — confirmed present

**Source:** same `SearchRequest.scala`

```scala
def searchAfter(values: Seq[Any]): SearchRequest = copy(searchAfter = values)
```

Takes `Seq[Any]`. The sort tiebreaker values returned from the previous page's last
hit (`hit.sort` in the response) are passed directly as `Seq[Any]`.

---

## 5. URL path — elastic4s handles it automatically

**Source:** `elastic4s-core/src/main/scala/com/sksamuel/elastic4s/requests/searches/SearchHandlers.scala`

```scala
val endpoint = {
  if (request.indexes.values.isEmpty && request.pit.isDefined)
    "/_search"                          // ← PIT path: no index in URL
  else if (request.indexes.values.isEmpty)
    "/_all/_search"                     // empty + no PIT: all-indices
  else
    "/" + request.indexes.values
      .map(ElasticUrlEncoder.encodeUrlFragment)
      .mkString(",") + "/_search"
}
```

When `.pit()` has been called (which zeroes `indexes`), the handler routes to
`/_search` with no index component.  **We do not need any manual URL manipulation.**

---

## 6. JSON body serialisation

**Source:** `elastic4s-core/src/main/scala/com/sksamuel/elastic4s/requests/searches/SearchBodyBuilderFn.scala`

Both `pit` and `search_after` are serialised into the JSON body automatically:

```scala
// search_after
if (request.searchAfter.nonEmpty)
  builder.autoarray("search_after", request.searchAfter)

// pit
request.pit.foreach { pit =>
  builder.startObject("pit")
  builder.field("id", pit.id)
  pit.keepAlive.map(d => s"${d.toSeconds}s").foreach(builder.field("keep_alive", _))
  builder.endObject()
}
```

This produces exactly the ES wire format:

```json
{
  "pit": { "id": "<pitId>", "keep_alive": "5m" },
  "search_after": [1716998400000, "abc123"],
  "sort": [...],
  "query": {...},
  "size": 50
}
```

---

## 7. `createPointInTime` / `deletePointInTime` — confirmed in DSL

**Source:** `elastic4s-core/src/main/scala/com/sksamuel/elastic4s/api/PitApi.scala`

```scala
trait PitApi {
  def createPointInTime(index: Index): CreatePitRequest  = CreatePitRequest(index)
  def deletePointInTime(id: String):   DeletePitRequest  = DeletePitRequest(id)
}
```

Both are mixed into `ElasticDsl` via `ElasticApi` → `PitApi`.  Wire format
(from `PitHandlers.scala`):

- Create: `POST /{index}/_pit?keep_alive=Xs`
- Delete: `DELETE /_pit` with body `{ "id": [...] }`

`keepAlive` is set on the `CreatePitRequest` via `.keepAlive(duration: FiniteDuration)`,
not on `PitApi.createPointInTime(...)` directly.

---

## 8. How `prepareSearch` interacts — verdict

Current code at `ElasticSearch.scala:548`:

```scala
val searchRequest = ElasticDsl.search(indexes) query migrationAwareQuery
```

For the PIT path we can call the same `prepareSearch` or duplicate its essentials,
then chain:

```scala
val pitSearch = ElasticDsl.search(indexes)    // indexes will be overwritten anyway
  .query(migrationAwareQuery)
  .size(pageSize)
  .sortBy(tiebreakSort: _*)                   // must include _id tiebreaker
  .searchAfter(sortValues)
  .pit(Pit(pitId).keepAlive(keepAlive))
// → indexes is now Indexes(Nil), endpoint is /_search, body has pit + search_after
```

All the existing builder methods (`.query(...)`, `.sortBy(...)`, `.size(...)`)
are fully compatible with the PIT path.  The only methods that become irrelevant are
`.from(...)` / `.start(...)` (offset-based pagination), which must **not** be set
when using `search_after`.

---

## 9. Correct incantation — code snippet

```scala
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.requests.searches.Pit
import scala.concurrent.duration._

/** Build a PIT-based search-after request.
 *
 * @param pitId        Opaque PIT ID returned by a prior createPointInTime call.
 * @param sortValues   The `hit.sort` field from the last hit of the previous page.
 * @param query        The migration-aware query (same as in prepareSearch).
 * @param pageSize     Number of results to return (replaces `length`).
 * @param keepAlive    How long ES should extend the PIT on this search.
 * @param sorts        Sort definitions — MUST include a unique tiebreaker (e.g. _id).
 */
def buildPitSearchAfter(
  pitId:      String,
  sortValues: Seq[Any],
  query:      Query,
  pageSize:   Int,
  keepAlive:  FiniteDuration,
  sorts:      Seq[Sort]
): SearchRequest = {
  ElasticDsl
    .search(Nil)                        // indexes cleared by .pit() anyway; Nil is explicit intent
    .query(query)
    .size(pageSize)
    .sortBy(sorts)
    .searchAfter(sortValues)
    .pit(Pit(pitId).keepAlive(keepAlive))
  // .from() must NOT be called — offset pagination is incompatible with search_after
}
```

The `.timeout(...)` from `withSearchQueryTimeout` can be chained on top as usual.

---

## 10. Summary table

| Question | Answer |
|---|---|
| Exact version | `nl.gn0s1s:elastic4s-core_2.13:8.19.1` |
| Correct pit construction | `Pit(id).keepAlive(duration)` or `Pit(id, Some(duration))` |
| Does `.pit(Pit(...))` exist on `SearchRequest`? | Yes — defined in `elastic4s-domain` |
| Does `.pit()` clear the index automatically? | **Yes** — `copy(pit = Some(pit), indexes = Indexes(Nil))` |
| Does elastic4s use `/_search` (no index) for PIT? | **Yes** — `SearchHandlers` checks `pit.isDefined` |
| Does `.searchAfter(Seq[Any])` exist? | Yes — defined in `elastic4s-domain` |
| Does `SearchBodyBuilderFn` serialise both? | Yes — `pit` and `search_after` both emitted automatically |
| `createPointInTime` / `deletePointInTime` in DSL? | Yes — `ElasticApi` / `PitApi` trait |
| Can `.query()`, `.sortBy()`, `.size()` combine with PIT? | Yes — all chain normally |
| Must `.from()` be omitted? | **Yes** — offset pagination is incompatible with `search_after` |
