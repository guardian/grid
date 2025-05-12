package lib.elasticsearch

import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.searches.sort.{Sort, SortOrder}

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

  // This is a special case in the elastic1 code which does not fit well as it also effects the query criteria
  def dateAddedToCollectionDescending: Seq[Sort] = Seq(fieldSort("collections.actionData.date").order(SortOrder.DESC))

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
