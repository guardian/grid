package lib.elasticsearch.impls.elasticsearch6

import com.sksamuel.elastic4s.Operator
import com.sksamuel.elastic4s.http.ElasticDsl
import com.sksamuel.elastic4s.http.search.queries.QueryBuilderFn
import com.sksamuel.elastic4s.searches.queries.matches.{MatchPhrase, MatchQuery}
import com.sksamuel.elastic4s.searches.queries.{BoolQuery, Query, RangeQuery}
import lib.elasticsearch.ConditionFixtures
import lib.querysyntax.Negation
import org.scalatest.{FunSpec, Matchers}

class QueryBuilderTest extends FunSpec with Matchers with ConditionFixtures {

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
      val conditions = List(fieldPhraseMatchCondition)

      val query = queryBuilder.makeQuery(conditions).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      query.must.head.asInstanceOf[MatchPhrase].field shouldBe "afield"
      query.must.head.asInstanceOf[MatchPhrase].value shouldBe "avalue"
    }

    it("multiple conditions should give multiple must conditions") {
      val query = queryBuilder.makeQuery(List(fieldPhraseMatchCondition, anotherFieldPhraseMatchCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 2
      query.must(0).asInstanceOf[MatchPhrase].field shouldBe "afield"
      query.must(1).asInstanceOf[MatchPhrase].field shouldBe "anotherfield"
    }

    it("negated conditions should be expressed using must not clauses") {
      val negatedCondition = Negation(fieldPhraseMatchCondition)

      val query = queryBuilder.makeQuery(List(negatedCondition)).asInstanceOf[BoolQuery]

      query.not.size shouldBe 1
      query.not.head.asInstanceOf[MatchPhrase].field shouldBe "afield"
      query.not.head.asInstanceOf[MatchPhrase].value shouldBe "avalue"
    }

    it("word list matches should set the AND operator so that all words need to match") {
      val query = queryBuilder.makeQuery(List(wordsMatchCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      val wordsClause = query.must.head.asInstanceOf[MatchQuery]
      wordsClause.field shouldBe "awordfield"
      wordsClause.value shouldBe "foo bar"
      wordsClause.operator shouldBe Some(Operator.And)
    }

    it("date ranges are expressed range queries which include the lower and upper bounds") {
      val query = queryBuilder.makeQuery(List(dateMatchCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      val dateRangeClause = query.must.head.asInstanceOf[RangeQuery]
      dateRangeClause.gte shouldBe Some("2016-01-01T00:00:00.000Z")
      dateRangeClause.lte shouldBe Some("2016-01-01T01:00:00.000Z")
    }
  }

  def asJsonString(query: Query) = {
    new String(QueryBuilderFn.apply(query).bytes)
  }

}