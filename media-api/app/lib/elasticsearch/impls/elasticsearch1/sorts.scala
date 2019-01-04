package lib.elasticsearch.impls.elasticsearch1

import lib.querysyntax.{Condition, HierarchyField, Match, Phrase}
import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.index.query.FilterBuilders
import org.elasticsearch.search.sort.{SortBuilders, SortOrder}

object sorts {

  def createSort(sortBy: Option[String], query: List[Condition])(builder: SearchRequestBuilder) = {
    sortBy match {
      case Some("dateAddedToCollection") => addedToCollectionTimeSort(query)(builder)
      //for any other sortBy term
      case _ => uploadTimeSort(sortBy)(builder)
    }
  }

  def uploadTimeSort(sortBy: Option[String])(builder: SearchRequestBuilder): SearchRequestBuilder = {
    val sorts = sortBy.fold(Seq("uploadTime" -> SortOrder.DESC))(parseSorts)
    for ((field, order) <- sorts) builder.addSort(field, order)
    builder
  }

  def addedToCollectionTimeSort(query: List[Condition])(builder: SearchRequestBuilder): SearchRequestBuilder = {
    val pathHierarchyOpt = query.map {
      case Match(HierarchyField, Phrase(value)) => Some(value)
      case _ => None
    }.flatten.headOption

    pathHierarchyOpt.foreach { pathHierarchy =>
      val sort = SortBuilders.
        fieldSort("collections.actionData.date").
        order(SortOrder.DESC).
        setNestedFilter(FilterBuilders.termFilter("collections.pathHierarchy", pathHierarchy))
      builder.addSort(sort)
    }
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
