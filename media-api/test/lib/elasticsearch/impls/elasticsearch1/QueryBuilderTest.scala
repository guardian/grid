package lib.elasticsearch.impls.elasticsearch1

import lib.elasticsearch.ConditionFixtures
import lib.querysyntax.Negation
import org.elasticsearch.index.query.QueryBuilders._
import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json.Json

class QueryBuilderTest extends FunSpec with Matchers with ConditionFixtures {

  val queryBuilder = new QueryBuilder(matchFields = Seq.empty)

  describe("Query builder") {
    it("Nil conditions parameter should give the match all query") {
      val query = queryBuilder.makeQuery(Nil)

      query.toString shouldBe matchAllQuery.toString
    }

    it("empty conditions list should give match all query") {
      val query = queryBuilder.makeQuery(List.empty)

      query.toString shouldBe matchAllQuery.toString
    }

    it("single condition should give a must query") {
      val query = queryBuilder.makeQuery(List(fieldPhraseMatchCondition))

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \\ "must").size shouldBe 1
      (asJson \ "bool" \ "must" \\ "match").size shouldBe 1
      (asJson \ "bool" \ "must" \ "match" \ "afield").isDefined shouldBe true
      (asJson \ "bool" \ "must" \ "match" \ "afield" \ "query").isDefined shouldBe true
      (asJson \ "bool" \ "must" \ "match" \ "afield" \ "query").get.as[String] shouldBe "avalue"
      (asJson \ "bool" \ "must" \ "match" \ "afield" \ "type").get.as[String] shouldBe "phrase"
    }

    it("multiple conditions should give multiple must conditions") {
      val query = queryBuilder.makeQuery(List(fieldPhraseMatchCondition, anotherFieldPhraseMatchCondition))

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \\ "must").size shouldBe 1
      (asJson \ "bool" \ "must" \\ "match").size shouldBe 2
    }

    it("negated conditions should be expressed using must not clauses") {
      val negatedCondition = Negation(fieldPhraseMatchCondition)

      val query = queryBuilder.makeQuery(List(negatedCondition))

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \\ "must_not").size shouldBe 1
      (asJson \ "bool" \ "must_not" \ "match" \ "afield" \ "query").get.as[String] shouldBe "avalue"
      (asJson \ "bool" \ "must_not" \ "match" \ "afield" \ "type").get.as[String] shouldBe "phrase"
    }

    it("word list matches should set the AND operator so that all words need to match") {
      val query = queryBuilder.makeQuery(List(wordsMatchCondition))

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \ "must" \\ "match").size shouldBe 1
      (asJson \ "bool" \ "must" \ "match" \ "awordfield" \ "type").get.as[String] shouldBe "boolean"
      (asJson \ "bool" \ "must" \ "match" \ "awordfield" \ "query").get.as[String] shouldBe "foo bar"
      (asJson \ "bool" \ "must" \ "match" \ "awordfield" \ "operator").get.as[String] shouldBe "AND"
    }

    it("date ranges are expressed range queries which include the lower and upper bounds") {
      val query = queryBuilder.makeQuery(List(dateMatchCondition))

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \ "must" \\ "range").size shouldBe 1
      (asJson \ "bool" \ "must" \ "range" \ "adatefield" \ "from").get.as[String] shouldBe "2016-01-01T00:00:00.000Z"
      (asJson \ "bool" \ "must" \ "range" \ "adatefield" \ "to").get.as[String] shouldBe "2016-01-01T01:00:00.000Z"
      (asJson \ "bool" \ "must" \ "range" \ "adatefield" \ "include_lower").get.as[Boolean] shouldBe true
      (asJson \ "bool" \ "must" \ "range" \ "adatefield" \ "include_upper").get.as[Boolean] shouldBe true
    }
  }

}
