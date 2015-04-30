package lib.elasticsearch

import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.search.sort.SortOrder


object sorts {

  def parseFromRequest(sortBy: Option[String])(builder: SearchRequestBuilder): SearchRequestBuilder = {
    val sorts = sortBy.fold(Seq("uploadTime" -> SortOrder.DESC))(parseSorts)
    for ((field, order) <- sorts) builder.addSort(field, order)
    builder
  }

  type Field = String

  val DescField = "-(.+)".r

  def parseSorts(sortBy: String): Seq[(Field, SortOrder)] =
    sortBy.split(',').toList.map {
      case DescField(field) => (field, SortOrder.DESC)
      case field            => (field, SortOrder.ASC)
    }

}
