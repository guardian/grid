package lib.elasticsearch.impls.elasticsearch6

import com.sksamuel.elastic4s.http.ElasticDsl
import com.sksamuel.elastic4s.http.search.queries.QueryBuilderFn
import com.sksamuel.elastic4s.searches.queries.matches.MatchPhrase
import com.sksamuel.elastic4s.searches.queries.{BoolQuery, Query}
import lib.querysyntax.{Match, Phrase, SingleField}
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

      query shouldBe ElasticDsl.matchAllQuery()
    }

    it("single condition should give a must query") {
      val conditions = List(Match(SingleField("afield"), Phrase("avalue")))

      val query = queryBuilder.makeQuery(conditions).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      query.must.head.asInstanceOf[MatchPhrase].field shouldBe "afield"
      query.must.head.asInstanceOf[MatchPhrase].value shouldBe "avalue"
    }

    it("multiple conditions should give multiple must conditions") {
      val conditions = List(
        Match(SingleField("afield"), Phrase("avalue")),
        Match(SingleField("anotherfield"), Phrase("anothervalue")),
      )

      val query = queryBuilder.makeQuery(conditions).asInstanceOf[BoolQuery]

      query.must.size shouldBe 2
      query.must.head.asInstanceOf[MatchPhrase].field shouldBe "afield"
      query.must.tail.asInstanceOf[MatchPhrase].field shouldBe "anotherfield"
    }
  }

  def asJsonString(query: Query) = {
    new String(QueryBuilderFn.apply(query).bytes)
  }

}