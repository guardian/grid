package lib.elasticsearch.impls.elasticsearch6

import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.searches.sort.{Sort, SortOrder}

object sorts {

  def createSort(sortBy: Option[String]): Sort = {
    fieldSort("uploadTime").order(SortOrder.DESC)
  }

}