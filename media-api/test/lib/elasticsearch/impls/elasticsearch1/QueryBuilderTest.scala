package lib.elasticsearch.impls.elasticsearch1

import lib.elasticsearch.ConditionFixtures
import lib.querysyntax.Negation
import org.elasticsearch.index.query.QueryBuilders._
import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json.{JsArray, Json}

class QueryBuilderTest extends FunSpec with Matchers with ConditionFixtures {

  val matchFields: Seq[String] = Seq("afield", "anothermatchfield")

  val queryBuilder = new QueryBuilder(matchFields = matchFields)

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

    it("has field conditions are expressed as exists filters") {
      val query = queryBuilder.makeQuery(List(hasFieldCondition))

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \ "must" \ "bool" \ "must" \ "filtered" \ "filter" \ "exists" \ "field").get.as[String] shouldBe  "foo"
    }

    it("hierarchy field phrase is expressed as a term query") {
      val query = queryBuilder.makeQuery(List(hierarchyFieldPhraseCondition))

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \\ "must").size shouldBe 1
      (asJson \ "bool" \ "must" \ "term" \ "collections.pathHierarchy").get.as[String] shouldBe "foo"
    }

    it("any field phrase queries should be applied to all of the match fields") {
      val query = queryBuilder.makeQuery(List(anyFieldPhraseCondition))

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \\ "must").size shouldBe 1
      (asJson \ "bool" \ "must" \ "multi_match" \ "query").get.as[String] shouldBe "cats and dogs"
      (asJson \ "bool" \ "must" \ "multi_match" \ "fields").as[JsArray].value.map(_.as[String]) shouldBe matchFields
      (asJson \ "bool" \ "must" \ "multi_match" \ "type").get.as[String] shouldBe "phrase"
    }

    it("any field words queries should be applied to all of the match fields with cross fields type, operator and analyzers set") {
      val query = queryBuilder.makeQuery(List(anyFieldWordsCondition))

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \\ "must").size shouldBe 1
      (asJson \ "bool" \ "must" \ "multi_match" \ "query").get.as[String] shouldBe "cats dogs"
      (asJson \ "bool" \ "must" \ "multi_match" \ "fields").as[JsArray].value.map(_.as[String]) shouldBe matchFields
      (asJson \ "bool" \ "must" \ "multi_match" \ "type").get.as[String] shouldBe "cross_fields"
      (asJson \ "bool" \ "must" \ "multi_match" \ "operator").get.as[String] shouldBe "AND"
      (asJson \ "bool" \ "must" \ "multi_match" \ "analyzer").get.as[String] shouldBe "english_s_stemmer"
    }

    it("multiple field queries should query against the requested fields only") {
      val query = queryBuilder.makeQuery(List(multipleFieldWordsCondition))

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \\ "must").size shouldBe 1
      (asJson \ "bool" \ "must" \ "multi_match" \ "query").get.as[String] shouldBe "cats and dogs"
      (asJson \ "bool" \ "must" \ "multi_match" \ "fields").as[JsArray].value.map(_.as[String]) shouldBe Seq("foo", "bar")
    }

    it("nested queries should be expressed using nested queries") {
      val query = queryBuilder.makeQuery(List(nestedCondition))

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \ "must" \ "nested" \ "query").isDefined shouldBe true
      (asJson \ "bool" \ "must" \ "nested" \ "query" \ "bool" \ "must" \ "match" \ "usages.status").isDefined shouldBe true
      (asJson \ "bool" \ "must" \ "nested" \ "query" \ "bool" \ "must" \ "match" \ "usages.status" \ "query").get.as[String]  shouldBe "pending"
      (asJson \ "bool" \ "must" \ "nested" \ "query" \ "bool" \ "must" \ "match" \ "usages.status" \ "type").get.as[String]  shouldBe "boolean"
      (asJson \ "bool" \ "must" \ "nested" \ "query" \ "bool" \ "must" \ "match" \ "usages.status" \ "operator").get.as[String]  shouldBe "AND"
    }

    it("multiple nested queries result in multiple must clauses") {
      val query = queryBuilder.makeQuery(List(nestedCondition, anotherNestedCondition))

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \ "must").get.as[JsArray].value.size shouldBe 2
      (asJson \ "bool" \ "must" \\ "nested").size shouldBe 2
    }
  }

}
