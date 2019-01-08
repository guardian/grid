package lib.elasticsearch.impls.elasticsearch1

import lib.querysyntax.{Match, Phrase, SingleField}
import org.elasticsearch.index.query.QueryBuilders._
import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json.Json

class QueryBuiderTest extends FunSpec with Matchers {

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
      val conditions = List(Match(SingleField("afield"), Phrase("avalue")))

      val query = queryBuilder.makeQuery(conditions)

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \\ "must").size shouldBe 1
      (asJson \ "bool" \ "must" \\ "match").size shouldBe 1
      (asJson \ "bool" \ "must" \ "match" \ "afield").isDefined shouldBe true
      (asJson \ "bool" \ "must" \ "match" \ "afield" \ "query").isDefined shouldBe true
      (asJson \ "bool" \ "must" \ "match" \ "afield" \ "query").get.as[String] shouldBe "avalue"
      (asJson \ "bool" \ "must" \ "match" \ "afield" \ "type").get.as[String] shouldBe "phrase"
    }

    it("multiple conditions should give multiple must conditions") {
      val conditions = List(
        Match(SingleField("afield"), Phrase("avalue")),
        Match(SingleField("anotherfield"), Phrase("anothervalue")),
      )

      val query = queryBuilder.makeQuery(conditions)

      val asJson = Json.parse(query.toString)
      (asJson \ "bool" \\ "must").size shouldBe 1
      (asJson \ "bool" \ "must" \\ "match").size shouldBe 2
    }
  }

}
