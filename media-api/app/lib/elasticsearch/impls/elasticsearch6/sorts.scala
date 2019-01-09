package lib.elasticsearch.impls.elasticsearch6

import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.searches.sort.{FieldSort, Sort, SortOrder}

object sorts {

  private val UploadTimeDescending: Sort = fieldSort("uploadTime").order(SortOrder.DESC)
  private val HasDescFieldPrefix = "-(.+)".r

  def createSort(sortBy: Option[String]): Seq[Sort] = {
    sortBy.fold(Seq(UploadTimeDescending))(parseSortBy)
  }

  private def parseSortBy(sortBy: String): Seq[FieldSort] = {
    sortBy.split(',').toList.map {
      case HasDescFieldPrefix(field) => fieldSort(field).order(SortOrder.DESC)
      case field => fieldSort(field).order(SortOrder.ASC)
    }
  }

}