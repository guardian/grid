package lib.elasticsearch

import com.gu.mediaservice.model.{Agency, UsageRights}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.requests.common.Operator
import com.sksamuel.elastic4s.requests.searches.queries.QueryBuilderFn
import com.sksamuel.elastic4s.requests.searches.queries._
import com.sksamuel.elastic4s.requests.searches.queries.matches.{MatchPhrase, MatchQuery, MultiMatchQuery, MultiMatchQueryBuilderType}
import com.sksamuel.elastic4s.requests.searches.queries.term.{TermQuery, TermsQuery}
import lib.querysyntax.Negation
import org.scalatest.{FunSpec, Matchers}

class QueryBuilderTest extends FunSpec with Matchers with ConditionFixtures {

  val matchFields: Seq[String] = Seq("afield", "anothermatchfield")

  val queryBuilder = new QueryBuilder(matchFields, () => Nil)

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
      multiMatchClause.`type` shouldBe Some(MultiMatchQueryBuilderType.CROSS_FIELDS)
    }

    it("multiple field queries should query against the requested fields only") {
      val query = queryBuilder.makeQuery(List(multipleFieldWordsCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      val multiMatchClause = query.must.head.asInstanceOf[MultiMatchQuery]
      multiMatchClause.text shouldBe "cats and dogs"
      multiMatchClause.fields.map(_.field) shouldBe Seq("foo", "bar")
    }

    it("nested queries should be expressed using nested queries") {
      val query = queryBuilder.makeQuery(List(nestedCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      val nestedQuery = query.must.head.asInstanceOf[NestedQuery]
      val nestedMatchQuery = nestedQuery.query.asInstanceOf[BoolQuery].must.head.asInstanceOf[MatchQuery]
      nestedMatchQuery.field shouldBe "usages.status"
      nestedMatchQuery.value shouldBe "pending"
      nestedMatchQuery.operator shouldBe Some(Operator.AND)
    }

    it("multiple nested queries result in multiple must clauses") {
      val query = queryBuilder.makeQuery(List(nestedCondition, anotherNestedCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 2
    }
  }

  describe("is search filter") {
    it("should correctly construct an is owned photo query") {
      val query = queryBuilder.makeQuery(List(isOwnedPhotoCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1

      val isClause = query.must.head.asInstanceOf[BoolQuery]
      isClause.should.size shouldBe 1

      val termQuery = isClause.should.head.asInstanceOf[TermsQuery[String]]
      termQuery.field shouldBe "usageRights.category"

      val expected = UsageRights.photographer.map(_.category)

      termQuery.values shouldEqual expected
    }

    it("should correctly construct an is owned illustration query") {
      val query = queryBuilder.makeQuery(List(isOwnedIllustrationCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1

      val isClause = query.must.head.asInstanceOf[BoolQuery]
      isClause.should.size shouldBe 1

      val termQuery = isClause.should.head.asInstanceOf[TermsQuery[String]]
      termQuery.field shouldBe "usageRights.category"

      val expected = UsageRights.illustrator.map(_.category)

      termQuery.values shouldEqual expected
    }

    it("should correctly construct an is owned image query") {
      val query = queryBuilder.makeQuery(List(isOwnedImageCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1

      val isClause = query.must.head.asInstanceOf[BoolQuery]
      isClause.should.size shouldBe 1

      val termQuery = isClause.should.head.asInstanceOf[TermsQuery[String]]
      termQuery.field shouldBe "usageRights.category"

      val expected = UsageRights.whollyOwned.map(_.category)

      termQuery.values shouldEqual expected
    }

    it("should return the match none query on an invalid is query") {
      val query = queryBuilder.makeQuery(List(isInvalidCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      query.must.head shouldBe ElasticDsl.matchNoneQuery()
    }

    it("should return the match all query when no agencies are over quota") {
      val qBuilder = new QueryBuilder(matchFields, () => List.empty)
      val query = qBuilder.makeQuery(List(isUnderQuotaCondition)).asInstanceOf[BoolQuery]
      query.must.size shouldBe 1
      query.must.head shouldBe ElasticDsl.matchAllQuery()
    }

    it("should correctly construct an under quota query") {
      def overQuotaAgencies = List(Agency("Getty Images"), Agency("AP"))

      val qBuilder = new QueryBuilder(matchFields, () => overQuotaAgencies)
      val query = qBuilder.makeQuery(List(isUnderQuotaCondition)).asInstanceOf[BoolQuery]
      query.must.size shouldBe 1

      val mustQuery = query.must.head.asInstanceOf[BoolQuery]
      mustQuery.not.size shouldBe 1

      val notQuery = mustQuery.not.head.asInstanceOf[TermsQuery[String]]
      notQuery.field shouldBe "usageRights.supplier"

      val expected = overQuotaAgencies.map(_.supplier)
      notQuery.values shouldEqual expected
    }
  }

  def asJsonString(query: Query) = {
    new String(QueryBuilderFn.apply(query).bytes)
  }

}
