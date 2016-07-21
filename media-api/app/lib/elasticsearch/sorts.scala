package lib.elasticsearch

import scala.collection.JavaConversions._
import collection.JavaConverters._

import lib.querysyntax._
import lib.Config
import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.index.query.{FilterBuilders}
import org.elasticsearch.search.sort.{SortBuilders, SortOrder, ScriptSortBuilder}

import com.gu.mediaservice.model.Agency
import com.gu.mediaservice.lib.cleanup.Agencies

object sorts {
  def createSort(
    sortBy: Option[String],
    query: List[Condition],
    weighted: Boolean
  )(
    builder: SearchRequestBuilder
  ) = {
    sortBy match {
      case Some("dateAddedToCollection") => addedToCollectionTimeSort(query)(builder)
      case _ => weightedSort(sortBy, weighted)(builder)
    }
  }

  def weightedSort(sortBy: Option[String], active: Boolean = true)(builder: SearchRequestBuilder) = {
    val SortParams(dateFieldName, sortOrder) = parseSort(sortBy)

    val supplierWeights = Config.supplierWeights
      .map { case(k,v) => (Agencies.all.get(k), v) }
      .collect { case((Some(Agency(name,_,_)),v)) => name -> v }

    val sort = new ScriptSortBuilder("grid-supplier-weight-sort", "number")
    val weights = if (active) supplierWeights.asJava else Map()

    sort.param("supplier_weights", weights)
    sort.lang("native")
    sort.order(sortOrder)

    builder.addSort(sort)
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

  val DescField = "-(.+)".r
  type Field = String
  case class SortParams(field: Field, order: SortOrder)

  def parseSort(sortBy: Option[String]): SortParams = {
    val sorts = sortBy.map {
      case DescField(field) => SortParams(field, SortOrder.DESC)
      case field            => SortParams(field, SortOrder.ASC)
    }.getOrElse(SortParams("uploadTime", SortOrder.DESC))

    sorts
  }

}
