package lib.elasticsearch

import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.searches.sort.{FieldSort, NestedSort, Sort, SortMode, SortOrder}
import play.api.libs.json.{JsObject, JsString}

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
  // field with no unmappedType → ES error. See sorts companion note + Scala PR doc.
  def dateAddedToCollectionAscending: Seq[Sort] = Seq(fieldSort("collections.actionData.date").order(SortOrder.ASC).unmappedType("date"))

  // Flip the direction of every sort entry (used by reverse cursor pagination).
  def reverseSorts(sorts: Seq[Sort]): Seq[Sort] = sorts.map {
    case fs: FieldSort => fs.order(if (fs.order == SortOrder.DESC) SortOrder.ASC else SortOrder.DESC)
    case other         => other
  }

  // Deserialise one entry from the client-sent ES sort clause (Option B).
  // Handles flat {"field":"dir"} and nested-object {"field":{order,missing?,mode?,nested?}} shapes.
  def jsonToSort(entry: JsObject): Sort = {
    val (field, spec) = entry.fields.head
    spec match {
      case JsString(dir) =>
        fieldSort(field).order(orderOf(dir))
      case obj: JsObject =>
        val base        = fieldSort(field).order(orderOf((obj \ "order").as[String]))
        val withMissing = (obj \ "missing").asOpt[String].fold(base)(base.missing)
        val withMode    = (obj \ "mode").asOpt[String].fold(withMissing)(m => withMissing.mode(sortModeOf(m)))
        (obj \ "nested" \ "path").asOpt[String].fold(withMode: Sort)(p => withMode.nested(NestedSort(Some(p))))
      case _ =>
        throw InvalidUriParams(s"unrecognised sort spec for field $field")
    }
  }

  private def orderOf(s: String): SortOrder =
    if (s == "desc") SortOrder.DESC else SortOrder.ASC

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
