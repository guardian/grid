package lib.elasticsearch.impls.elasticsearch6

import com.sksamuel.elastic4s.Operator
import com.sksamuel.elastic4s.http.ElasticDsl
import com.sksamuel.elastic4s.http.search.queries.QueryBuilderFn
import com.sksamuel.elastic4s.searches.queries.matches.{MatchPhrase, MatchQuery, MultiMatchQuery, MultiMatchQueryBuilderType}
import com.sksamuel.elastic4s.searches.queries.term.TermQuery
import com.sksamuel.elastic4s.searches.queries.{BoolQuery, ExistsQuery, Query, RangeQuery}
import lib.elasticsearch.ConditionFixtures
import lib.querysyntax.Negation
import org.scalatest.{FunSpec, Matchers}

class QueryBuilderTest extends FunSpec with Matchers with ConditionFixtures {

  val matchFields: Seq[String] = Seq("afield", "anothermatchfield")

  val queryBuilder = new QueryBuilder(matchFields)

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

    it("has field conditions are expressed as exists filters") {
      val query = queryBuilder.makeQuery(List(hasFieldCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      val hasClause = query.must.head.asInstanceOf[BoolQuery]
      hasClause.must.size shouldBe 0
      hasClause.filters.size shouldBe 1
      hasClause.filters.head.asInstanceOf[ExistsQuery].field shouldBe "foo"
     }

    it("hierarchy field phrase is expressed as a term query") {
      val query = queryBuilder.makeQuery(List(hierarchyFieldPhraseCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      query.must.head.asInstanceOf[TermQuery].value shouldBe "foo"
    }

    it("any field phrase queries should be applied to all of the match fields") {
      val query = queryBuilder.makeQuery(List(anyFieldPhraseCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      val multiMatchClause = query.must.head.asInstanceOf[MultiMatchQuery]
      multiMatchClause.text shouldBe "cats and dogs"
      multiMatchClause.fields.map(_.field) shouldBe matchFields
      multiMatchClause.`type` shouldBe Some(MultiMatchQueryBuilderType.PHRASE)
    }

    it("any field words queries should be applied to all of the match fields with cross fields type, operator and analyzers set") {
      val query = queryBuilder.makeQuery(List(anyFieldWordsCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      val multiMatchClause = query.must.head.asInstanceOf[MultiMatchQuery]
      multiMatchClause.text shouldBe "cats dogs"
      multiMatchClause.fields.map(_.field) shouldBe matchFields
      multiMatchClause.operator shouldBe Some(Operator.AND)
      multiMatchClause.analyzer shouldBe Some("english_s_stemmer")
      multiMatchClause.`type` shouldBe Some(MultiMatchQueryBuilderType.CROSS_FIELDS)
    }

    it("multiple field queries should query against the requested fields only") {
      val query = queryBuilder.makeQuery(List(multipleFieldWordsCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      val multiMatchClause = query.must.head.asInstanceOf[MultiMatchQuery]
      multiMatchClause.text shouldBe "cats and dogs"
      multiMatchClause.fields.map(_.field) shouldBe Seq("foo", "bar")
    }
  }

  def asJsonString(query: Query) = {
    new String(QueryBuilderFn.apply(query).bytes)
  }

}