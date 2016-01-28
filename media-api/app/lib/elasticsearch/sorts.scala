package lib.elasticsearch

import lib.querysyntax.Condition
import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.index.query.{FilterBuilders}
import org.elasticsearch.search.sort.{SortBuilders, SortOrder}


object sorts {

  def createSort(sortBy: Option[String], query: List[Condition])(builder: SearchRequestBuilder) = {
    parseFromRequest(sortBy)(builder)
    collectionSort(query)(builder)
  }

  def parseFromRequest(sortBy: Option[String])(builder: SearchRequestBuilder): SearchRequestBuilder = {
    val sorts = sortBy.fold(Seq("uploadTime" -> SortOrder.DESC))(parseSorts)
    for ((field, order) <- sorts) builder.addSort(field, order)
    builder
  }

  def collectionSort(query: List[Condition])(builder: SearchRequestBuilder): SearchRequestBuilder = {
    //TODO get relevant values from query
    builder.addSort(SortBuilders.fieldSort("collections.actionData.date").order(SortOrder.DESC).setNestedFilter(FilterBuilders.termFilter("collections.pathHierarchy", query)))
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
