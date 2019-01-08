package lib.elasticsearch.impls.elasticsearch6

import com.sksamuel.elastic4s.http.ElasticDsl
import org.scalatest.{FunSpec, Matchers}

class QueryBuiderTest extends FunSpec with Matchers {

  val queryBuilder = new QueryBuilder()

  describe("Query builder") {
    it("Nil conditions parameter should give the match all query") {
      val query = queryBuilder.makeQuery(Nil)

      query shouldBe ElasticDsl.matchAllQuery()
    }

  }

}