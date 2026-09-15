package lib.elasticsearch

import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.searches.sort.{FieldSort, NestedSort, Sort, SortMode, SortOrder}
import play.api.libs.json.{JsObject, JsString, JsValue}

object sorts {

  private val UploadTimeDescending: Sort = fieldSort("uploadTime").order(SortOrder.DESC)
  private val HasDescFieldPrefix = "-(.+)".r
  // extensible list of sort field replacements
  private val SortReplacements = List(
    ("taken", "metadata.dateTaken,-uploadTime")
  )

  def createSort(sortBy: Option[String]): Seq[Sort] = {
    sortBy.fold(Seq(UploadTimeDescending))(parseSortBy)
  }

  // This is a special case in the elastic1 code which does not fit well as it also effects the query criteria.
  // unmappedType prevents ES from erroring when no documents have collections (field not in mapping).
  def dateAddedToCollectionDescending: Seq[Sort] = Seq(fieldSort("collections.actionData.date").order(SortOrder.DESC).unmappedType("date"))

  // Ascending counterpart for the "-dateAddedToCollection" sort token. Same unmappedType guard.
  // Without this, "-dateAddedToCollection" falls through to parseSortBy → fieldSort on an unmapped
  // field with no unmappedType → ES error.
  def dateAddedToCollectionAscending: Seq[Sort] = Seq(fieldSort("collections.actionData.date").order(SortOrder.ASC).unmappedType("date"))

  // Flip the direction of every sort entry (used by reverse cursor pagination).
  def reverseSorts(sorts: Seq[Sort]): Seq[Sort] = sorts.map {
    case fs: FieldSort => fs.order(if (fs.order == SortOrder.DESC) SortOrder.ASC else SortOrder.DESC)
    case other         => other
  }

  // Deserialise one entry from the client-sent ES sort clause.
  // Handles flat {"field":"dir"} and nested-object {"field":{order,missing?,mode?,nested?}} shapes.
  // Malformed client input must surface as InvalidUriParams (→ 422), never as a raw JSON/collection
  // exception, so every shape assumption below is checked rather than assumed.
  def jsonToSort(entry: JsObject): Sort = {
    if (entry.fields.size != 1)
      throw InvalidUriParams(s"each sort entry must name exactly one field, got ${entry.fields.size}")
    val (field, spec) = entry.fields.head
    spec match {
      case JsString(dir) =>
        fieldSort(field).order(orderOf(dir))
      case obj: JsObject =>
        val order       = (obj \ "order").asOpt[String]
          .getOrElse(throw InvalidUriParams(s"missing or non-string sort order for field $field"))
        val base        = fieldSort(field).order(orderOf(order))
        val withMissing = optionalString(obj, "missing", field).fold(base)(base.missing)
        val withMode    = optionalString(obj, "mode", field).fold(withMissing)(m => withMissing.mode(sortModeOf(m)))
        val withNested  = (obj \ "nested").toOption match {
          case None => withMode: Sort
          case Some(nested: JsObject) => optionalString(nested, "path", field)
            .map(path => withMode.nested(NestedSort(Some(path))))
            .getOrElse(throw InvalidUriParams(s"missing nested path for field $field"))
          case Some(_) => throw InvalidUriParams(s"nested sort option must be an object for field $field")
        }
        withNested
      case _ =>
        throw InvalidUriParams(s"unrecognised sort spec for field $field")
    }
  }

  private def orderOf(s: String): SortOrder = s match {
    case "asc"  => SortOrder.ASC
    case "desc" => SortOrder.DESC
    case other  => throw InvalidUriParams(s"unrecognised sort order: $other")
  }

  private def optionalString(obj: JsObject, key: String, field: String): Option[String] =
    (obj \ key).toOption.map {
      case JsString(value) => value
      case _: JsValue      => throw InvalidUriParams(s"$key must be a string for field $field")
    }

  private def sortModeOf(s: String): SortMode = s match {
    case "min"    => SortMode.Min
    case "max"    => SortMode.Max
    case "avg"    => SortMode.Avg
    case "sum"    => SortMode.Sum
    case "median" => SortMode.Median
    case other    => throw InvalidUriParams(s"unrecognised sort mode: $other")
  }

  private def parseSortBy(sortBy: String): Seq[Sort] = {
    val sortString = SortReplacements.foldLeft(sortBy) { (str, replacement) =>
        str.replace(replacement._1, replacement._2)
      }
    sortString.split(',').toList.map {
        case HasDescFieldPrefix(field) => fieldSort(field).order(SortOrder.DESC)
        case field => fieldSort(field).order(SortOrder.ASC)
      }
  }

}
