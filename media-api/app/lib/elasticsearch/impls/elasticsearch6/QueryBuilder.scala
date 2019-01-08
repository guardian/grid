package lib.elasticsearch.impls.elasticsearch6

import com.sksamuel.elastic4s.http.ElasticDsl
import com.sksamuel.elastic4s.searches.queries.Query
import lib.querysyntax.Condition

class QueryBuilder() {

  def makeQuery(conditions: List[Condition]): Query = {
    ElasticDsl.matchAllQuery()
  }

}
