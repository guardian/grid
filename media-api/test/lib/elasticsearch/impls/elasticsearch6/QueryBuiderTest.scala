package lib.elasticsearch.impls.elasticsearch6

import com.sksamuel.elastic4s.http.ElasticDsl
import com.sksamuel.elastic4s.http.search.queries.QueryBuilderFn
import com.sksamuel.elastic4s.searches.queries.Query
import org.scalatest.{FunSpec, Matchers}

class QueryBuiderTest extends FunSpec with Matchers {

  val queryBuilder = new QueryBuilder()

  describe("Query builder") {
    it("Nil conditions parameter should give the match all query") {
      val query = queryBuilder.makeQuery(Nil)

      query shouldBe ElasticDsl.matchAllQuery()
    }

    it("empty conditions list should give match all query") {
      val query = queryBuilder.makeQuery(List.empty)

      println(asJsonString(query))
      query shouldBe ElasticDsl.matchAllQuery()
    }

  }

  def asJsonString(query: Query) = {
    new String(QueryBuilderFn.apply(query).bytes)
  }

}