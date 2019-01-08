package lib.elasticsearch.impls.elasticsearch6

import com.sksamuel.elastic4s.http.ElasticDsl
import com.sksamuel.elastic4s.searches.SearchRequest
import lib.querysyntax.Condition

class QueryBuilder(index: String) {

  def makeQuery(conditions: List[Condition]): SearchRequest = {
    ElasticDsl.search(index)
  }

}
