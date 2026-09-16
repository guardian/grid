package lib.elasticsearch

import com.gu.mediaservice.model.{Agency, UsageRights}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.requests.common.Operator
import com.sksamuel.elastic4s.requests.searches.queries._
import com.sksamuel.elastic4s.requests.searches.queries.matches.{MatchPhraseQuery, MatchQuery, MultiMatchQuery, MultiMatchQueryBuilderType}
import lib.querysyntax.{Match, Negation, Phrase, SingleField}
import com.gu.mediaservice.lib.config.GridConfigResources
import com.sksamuel.elastic4s.handlers.searches.queries.QueryBuilderFn
import com.sksamuel.elastic4s.requests.searches.queries.compound.BoolQuery
import com.sksamuel.elastic4s.requests.searches.term.{TermQuery, TermsQuery}
import lib.MediaApiConfig
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.Configuration
import play.api.inject.ApplicationLifecycle

import scala.annotation.nowarn
import scala.concurrent.Future

class QueryBuilderTest extends AnyFunSpec with Matchers with ConditionFixtures with Fixtures {

  val matchFields: Seq[String] = Seq("afield", "anothermatchfield")

  private val commonConfigurations = USED_CONFIGS_IN_TEST ++ MOCK_CONFIG_KEYS.map(_ -> NOT_USED_IN_TEST).toMap

  private val mediaApiConfig = new MediaApiConfig(GridConfigResources(
    Configuration.from(commonConfigurations),
    null,
    new ApplicationLifecycle {
      override def addStopHook(hook: () => Future[_]): Unit = {}
      override def stop(): Future[_] = Future.successful(())
    }
  ))

  val queryBuilder = new QueryBuilder(matchFields, () => Nil, mediaApiConfig)

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
      query.must.head.asInstanceOf[MatchPhraseQuery].field shouldBe "afield"
      query.must.head.asInstanceOf[MatchPhraseQuery].value shouldBe "avalue"
    }

    it("multiple conditions should give multiple must conditions") {
      val query = queryBuilder.makeQuery(List(fieldPhraseMatchCondition, anotherFieldPhraseMatchCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 2
      query.must(0).asInstanceOf[MatchPhraseQuery].field shouldBe "afield"
      query.must(1).asInstanceOf[MatchPhraseQuery].field shouldBe "anotherfield"
    }

    it("negated conditions should be expressed using must not clauses") {
      val negatedCondition = Negation(fieldPhraseMatchCondition)

      val query = queryBuilder.makeQuery(List(negatedCondition)).asInstanceOf[BoolQuery]

      query.not.size shouldBe 1
      query.not.head.asInstanceOf[MatchPhraseQuery].field shouldBe "afield"
      query.not.head.asInstanceOf[MatchPhraseQuery].value shouldBe "avalue"
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

    it("any field words queries should be applied to all of the match fields with best fields type and fuzziness, operator and analyzers set") {
      val mediaApiConfigWithFuzzySearch = new MediaApiConfig(GridConfigResources(
        Configuration.from(commonConfigurations ++ Map("search.fuzziness.enabled" -> true)),
        null,
        new ApplicationLifecycle {
          override def addStopHook(hook: () => Future[_]): Unit = {}
          override def stop(): Future[_] = Future.successful(())
        }
      ))
      val queryBuilder = new QueryBuilder(matchFields, () => Nil, mediaApiConfigWithFuzzySearch)
      val query = queryBuilder.makeQuery(List(anyFieldWordsCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      val multiMatchClause = query.must.head.asInstanceOf[MultiMatchQuery]
      multiMatchClause.text shouldBe "cats dogs"
      multiMatchClause.fields.map(_.field) shouldBe matchFields
      multiMatchClause.operator shouldBe Some(Operator.AND)
      multiMatchClause.`type` shouldBe Some(MultiMatchQueryBuilderType.BEST_FIELDS)
      multiMatchClause.fuzziness shouldBe defined
      multiMatchClause.fuzziness shouldBe Some("AUTO")
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

  describe("field alias matchViaExistence queries") {
    // e.g. `fileMetadata.c2pa.isAvailable` is only ever indexed as `true`, so `:true`/`:false` are
    // translated into exists/not-exists queries rather than literal term matches (see FieldAlias.matchViaExistence).
    val c2paFieldAliasConfig = Map(
      "elasticsearchPath" -> "fileMetadata.c2pa.isAvailable",
      "alias" -> "c2paMetadataAvailable",
      "label" -> "C2PA Metadata Available",
      "matchViaExistence" -> true
    )
    val configWithC2paAlias = new MediaApiConfig(GridConfigResources(
      Configuration.from(commonConfigurations ++ Map("field.aliases" -> Seq(c2paFieldAliasConfig))),
      null,
      new ApplicationLifecycle {
        override def addStopHook(hook: () => Future[_]): Unit = {}
        override def stop(): Future[_] = Future.successful(())
      }
    ))
    val queryBuilderWithC2paAlias = new QueryBuilder(matchFields, () => Nil, configWithC2paAlias)

    def existsClauseOf(query: Query): ExistsQuery =
      query.asInstanceOf[BoolQuery].filters.head.asInstanceOf[ExistsQuery]

    it("alias:true is expressed as an exists query on the underlying elasticsearch path") {
      val condition = Match(SingleField("c2paMetadataAvailable"), Phrase("true"))
      val query = queryBuilderWithC2paAlias.makeQuery(List(condition)).asInstanceOf[BoolQuery]

      val existsClause = existsClauseOf(query.must.head)
      existsClause.field shouldBe "fileMetadata.c2pa.isAvailable"
    }

    it("alias:false is expressed as a not-exists query on the underlying elasticsearch path") {
      val condition = Match(SingleField("c2paMetadataAvailable"), Phrase("false"))
      val query = queryBuilderWithC2paAlias.makeQuery(List(condition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      val notClause = query.must.head.asInstanceOf[BoolQuery]
      val existsClause = existsClauseOf(notClause.not.head)
      existsClause.field shouldBe "fileMetadata.c2pa.isAvailable"
    }

    it("the underlying elasticsearch path:true also resolves to the same exists query as the alias") {
      val condition = Match(SingleField("fileMetadata.c2pa.isAvailable"), Phrase("true"))
      val query = queryBuilderWithC2paAlias.makeQuery(List(condition)).asInstanceOf[BoolQuery]

      val existsClause = existsClauseOf(query.must.head)
      existsClause.field shouldBe "fileMetadata.c2pa.isAvailable"
    }

    it("the underlying elasticsearch path:false also resolves to the same not-exists query as the alias") {
      val condition = Match(SingleField("fileMetadata.c2pa.isAvailable"), Phrase("false"))
      val query = queryBuilderWithC2paAlias.makeQuery(List(condition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      val notClause = query.must.head.asInstanceOf[BoolQuery]
      val existsClause = existsClauseOf(notClause.not.head)
      existsClause.field shouldBe "fileMetadata.c2pa.isAvailable"
    }

    it("boolean values are matched case-insensitively, e.g. alias:TRUE and alias:False") {
      val trueQuery = queryBuilderWithC2paAlias.makeQuery(
        List(Match(SingleField("c2paMetadataAvailable"), Phrase("TRUE")))
      ).asInstanceOf[BoolQuery]
      existsClauseOf(trueQuery.must.head).field shouldBe "fileMetadata.c2pa.isAvailable"

      val falseQuery = queryBuilderWithC2paAlias.makeQuery(
        List(Match(SingleField("c2paMetadataAvailable"), Phrase("False")))
      ).asInstanceOf[BoolQuery]
      falseQuery.must.size shouldBe 1
      val notClause = falseQuery.must.head.asInstanceOf[BoolQuery]
      existsClauseOf(notClause.not.head).field shouldBe "fileMetadata.c2pa.isAvailable"
    }

    it("a non-boolean value on a matchViaExistence field falls back to a literal phrase match, not an exists query") {
      val condition = Match(SingleField("c2paMetadataAvailable"), Phrase("maybe"))
      val query = queryBuilderWithC2paAlias.makeQuery(List(condition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      val phraseClause = query.must.head.asInstanceOf[MatchPhraseQuery]
      phraseClause.field shouldBe "fileMetadata.c2pa.isAvailable"
      phraseClause.value shouldBe "maybe"
    }

    it("fields with no matching alias or elasticsearch path still fall back to getFieldPath, unaffected by the new lookup") {
      queryBuilderWithC2paAlias.resolveFieldPath("someUnrelatedField") shouldBe "someUnrelatedField"
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

      termQuery.values shouldEqual expected.list.toList
    }

    it("should correctly construct an is owned illustration query") {
      val query = queryBuilder.makeQuery(List(isOwnedIllustrationCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1

      val isClause = query.must.head.asInstanceOf[BoolQuery]
      isClause.should.size shouldBe 1

      val termQuery = isClause.should.head.asInstanceOf[TermsQuery[String]]
      termQuery.field shouldBe "usageRights.category"

      val expected = UsageRights.illustrator.map(_.category)

      termQuery.values shouldEqual expected.list.toList
    }

    it("should correctly construct an is owned image query") {
      val query = queryBuilder.makeQuery(List(isOwnedImageCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1

      val isClause = query.must.head.asInstanceOf[BoolQuery]
      isClause.should.size shouldBe 1

      val termQuery = isClause.should.head.asInstanceOf[TermsQuery[String]]
      termQuery.field shouldBe "usageRights.category"

      val expected = UsageRights.whollyOwned.map(_.category)

      termQuery.values shouldEqual expected.list.toList
    }

    it("should return the match none query on an invalid is query") {
      val query = queryBuilder.makeQuery(List(isInvalidCondition)).asInstanceOf[BoolQuery]

      query.must.size shouldBe 1
      query.must.head shouldBe ElasticDsl.matchNoneQuery()
    }

    it("should return the match all query when no agencies are over quota") {
      val qBuilder = new QueryBuilder(matchFields, () => List.empty, mediaApiConfig)
      val query = qBuilder.makeQuery(List(isUnderQuotaCondition)).asInstanceOf[BoolQuery]
      query.must.size shouldBe 1
      query.must.head shouldBe ElasticDsl.matchAllQuery()
    }

    it("should correctly construct an under quota query") {
      def overQuotaAgencies = List(Agency("Getty Images"), Agency("AP"))

      val qBuilder = new QueryBuilder(matchFields, () => overQuotaAgencies, mediaApiConfig)
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

  describe("get elasticsearch path") {
    it("should return the field parameter itself (instead of an elasticsearchPath) if the particular config doesn't exist"){
      queryBuilder.resolveFieldPath("bbcElvisCollection") shouldBe "bbcElvisCollection"
    }

    it("should return the right elasticsearchPath"){
      queryBuilder.resolveFieldPath("credit") shouldBe "metadata.credit"
    }
  }

  @nowarn("cat=deprecation") // TODO QueryBuilderFn.bytes is deprecated but no upgrade path given
  def asJsonString(query: Query) = {
    new String(QueryBuilderFn.apply(query).bytes)
  }

}
