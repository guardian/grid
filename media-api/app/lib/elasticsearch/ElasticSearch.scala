package lib.elasticsearch

import org.apache.pekko.actor.Scheduler
import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.lib.formatting.printDateTime
import com.gu.mediaservice.lib.argo.model.{ExtraCount, ExtraCountConfig, ExtraCounts}
import com.gu.mediaservice.lib.elasticsearch.filters
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.elasticsearch.{CompletionPreview, ElasticNotFoundException, ElasticSearchClient, ElasticSearchConfig, Mappings, MigrationStatusProvider, Running}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap, Stopwatch, combineMarkers}
import com.gu.mediaservice.lib.metrics.FutureSyntax
import com.gu.mediaservice.model.{Agencies, Agency, AwaitingReviewForSyndication, Image}
import com.gu.mediaservice.model.usage.{ComposerUsageReference, DigitalUsage, FrontUsageReference, InDesignUsageReference, PrintUsage, PublishedUsageStatus, RemovedUsageStatus, Usage, UnknownUsageStatus, UsageStatus, UsageType}
import com.sksamuel.elastic4s.{ElasticDsl, Hit, Response}
import com.sksamuel.elastic4s.fields.{ElasticField, NestedField, ObjectField}
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.common.Operator
import com.sksamuel.elastic4s.requests.common.Operator.Or
import com.sksamuel.elastic4s.requests.get.{GetRequest, GetResponse}
import com.sksamuel.elastic4s.requests.script.{Script, ScriptField}
import com.sksamuel.elastic4s.requests.searches._
import com.sksamuel.elastic4s.requests.searches.aggs.{AbstractAggregation, Aggregation, CompositeAggregation, HistogramOrder, TermsValueSource}
import com.sksamuel.elastic4s.requests.searches.aggs.CompositeAggregation.CompositeAggResult
import com.sksamuel.elastic4s.requests.searches.aggs.responses.Aggregations
import com.sksamuel.elastic4s.requests.searches.aggs.responses.bucket.{DateHistogram, Terms}
import com.sksamuel.elastic4s.requests.searches.queries.{Query, RangeQuery}
import com.sksamuel.elastic4s.requests.searches.knn.Knn
import com.sksamuel.elastic4s.requests.searches.queries.matches.MultiMatchQueryBuilderType.BEST_FIELDS
import com.sksamuel.elastic4s.requests.searches.queries.matches.{FieldWithOptionalBoost, MultiMatchQuery}
import com.sksamuel.elastic4s.requests.searches.sort.{FieldSort, Sort, SortMode, SortOrder}
import lib.elasticsearch.ResultSource.{Both, Lexical, Semantic}
import lib.querysyntax.{Condition, DateRange, HierarchyField, Match, Nested, Parser, Phrase, SingleField}
import lib.{MediaApiConfig, MediaApiMetrics, SupplierQuotaCount, ImageUsagesBySupplier, ImageUsagesBySupplierResult, UsageStore}
import play.api.libs.json.{JsError, JsNull, JsNumber, JsObject, JsString, JsSuccess, JsValue, Json}
import play.api.mvc.AnyContent
import play.api.mvc.Security.AuthenticatedRequest
import play.mvc.Http.Status
import scalaz.NonEmptyList
import scalaz.syntax.std.list._

import java.util.concurrent.TimeUnit
import scala.collection.immutable.ListMap
import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future}

class ElasticSearch(
  val config: MediaApiConfig,
  mediaApiMetrics: MediaApiMetrics,
  elasticConfig: ElasticSearchConfig,
  overQuotaAgencies: () => List[Agency],
  val scheduler: Scheduler
) extends ElasticSearchClient with ImageFields with MatchFields with FutureSyntax with GridLogging with MigrationStatusProvider {

  private val maybeOrgOwnedExtraCount: Option[(String, ExtraCountConfig)] =
    if (config.shouldDisplayOrgOwnedCountAndFilterCheckbox)
      Some(s"${config.staffPhotographerOrganisation}-owned" -> ExtraCountConfig(
        searchClause = s"is:${config.staffPhotographerOrganisation}-owned",
        backgroundColour = "#005689"
      ))
    else
      None

  private val maybeAgencyPicksExtraCount: Option[(String, ExtraCountConfig)] =
    config.maybeAgencyPickQuery.map(_ =>
      "agency picks" -> ExtraCountConfig(
        searchClause = "is:agency-pick",
        backgroundColour = config.agencyPicksColour,
        maybeSubAggregation = Some(
          termsAgg(name = "byAgency", field = "usageRights.supplier").size(9)
        )
      )
    )

  private val aggregationsNameToSearchClauseMap: Map[String, ExtraCountConfig] = List(
    maybeOrgOwnedExtraCount,
    maybeAgencyPicksExtraCount
  ).flatten.toMap

  lazy val imagesCurrentAlias = elasticConfig.aliases.current
  lazy val imagesMigrationAlias = elasticConfig.aliases.migration
  lazy val url = elasticConfig.url
  lazy val shards = elasticConfig.shards
  lazy val replicas = elasticConfig.replicas
  lazy val includeDenseVectorMappings = elasticConfig.includeDenseVectorMappings

  private val SearchQueryTimeout = FiniteDuration(10, TimeUnit.SECONDS)
  // there is 15 seconds timeout set on cluster level as well

  /**
   * int terms of search query timeout in GRID,
   * there is a additional config `allow_partial_search_results`
   * which is set to true by default,
   * which means for example if i ask ES to give me photos that have field foo=bar without timeout it can give me 6500 results
   * if i ask the same query with 1ms timeout it may give me for example 4000 results instead
   **/

  val searchFilters = new SearchFilters(config)
  val syndicationFilter = new SyndicationFilter(config)

  val queryBuilder = new QueryBuilder(matchFields, overQuotaAgencies, config)

  def getImageById(id: String)(implicit ex: ExecutionContext, logMarker: LogMarker): Future[Option[Image]] =
    getImageWithSourceById(id).map(_.map(_.instance))

  private def migrationAwareGetter[T](
    id: String,
    logMessagePart: String,
    requestFromIndexName: String => GetRequest,
    resultTransformer: GetResponse => Option[T]
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[Option[T]] = {
    val xlogMarker = logMarker

    {

    implicit val logMarker: LogMarker = xlogMarker + ("image-id" -> id)

    def getFromCurrentIndex = executeAndLog(
      request = requestFromIndexName(imagesCurrentAlias),
      message = s"get $logMessagePart by id $id from index with alias $imagesCurrentAlias"
    ).map { r =>
      r.status match {
        case Status.OK => resultTransformer(r.result)
        case _ => None
      }
    }
    migrationStatus match {
      case running: Running => executeAndLog(
        request = requestFromIndexName(running.migrationIndexName),
        message = s"get $logMessagePart by id $id from migration index ${running.migrationIndexName}"
      ).flatMap { r =>
        r.status match {
          case Status.OK => Future.successful(resultTransformer(r.result))
          case _ => getFromCurrentIndex
        }
      }
      case _ => getFromCurrentIndex
    }
  }}

  def getImageWithSourceById(id: String)(implicit ex: ExecutionContext, logMarker: LogMarker): Future[Option[SourceWrapper[Image]]] = {
    migrationAwareGetter(
      id,
      logMessagePart = "image",
      requestFromIndexName = indexName => get(indexName, id),
      resultTransformer = (result: GetResponse) => mapImageFrom(result.sourceAsString, id, result.index)
    )
  }

  def getImageUploaderById(id: String)(implicit ex: ExecutionContext, logMarker: LogMarker): Future[Option[String]] = {
    migrationAwareGetter(
      id,
      logMessagePart = "image uploader",
      requestFromIndexName = indexName => get(indexName, id).fetchSourceInclude("uploadedBy"),
      resultTransformer = _.sourceFieldOpt("uploadedBy").collect { case s: String => s }
    )
  }

  private val isPotentiallyGraphicFieldName = "isPotentiallyGraphic"

  private def resolveHit(hit: SearchHit) = mapImageFrom(
    hit.sourceAsString,
    hit.id,
    hit.index,
    fields = hit.fields match {
      case null => JsObject.empty
      case _ => Json.obj(
        isPotentiallyGraphicFieldName -> hit.fields.get(isPotentiallyGraphicFieldName).map(_.asInstanceOf[List[Boolean]].headOption)
      )
    }
  )

  def lookupIds(ids: List[String], offset: Int, length: Int)(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SearchResults] = {
    val query = filters.pinnedIds(ids)

    val searchRequest = prepareSearch(query)
      .trackTotalHits(true)
      .storedFields("_source")
      .from(offset)
      .size(length)

    executeAndLog(searchRequest, "ids lookup")
      .map { r =>
        val imageHits = r.result.hits.hits.map(resolveHit).toSeq.flatten.map(i => (i.instance.id, i))
        SearchResults(hits = imageHits, total = r.result.totalHits, extraCounts = None)
      }
  }

  private def createMultiMatchQuery(query: String, boost: Option[Double] = None, operator: Operator): MultiMatchQuery =
    MultiMatchQuery(
      text = query,
      fields = matchFields.map(field => FieldWithOptionalBoost(field, None)),
      `type` = Some(BEST_FIELDS),
      fuzziness = Some("AUTO"),
      maxExpansions = Some(50),
      operator = Some(operator),
      prefixLength = Some(1),
      boost = boost
    )

  private def maybeWithFilter(query: Query, filterOpt: Option[Query]): Query = {
    filterOpt.map { f =>
      boolQuery() must (query) filter f
    }.getOrElse(query)
  }

  private def lexicalRequest(
    lexicalQuery: MultiMatchQuery,
    k: Int,
    filterOpt: Option[Query]
  ): SearchRequest =
    ElasticDsl
      .search(imagesCurrentAlias)
      .query(maybeWithFilter(lexicalQuery, filterOpt))
      .size(k)

  private def lexicalSearch(
    query: String,
    k: Int,
    filterOpt: Option[Query]
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SearchResults] = {
    val searchRequest = lexicalRequest(createMultiMatchQuery(query, operator = Or), k, filterOpt)

    executeAndLog(withSearchQueryTimeout(searchRequest), "lexical search").map { r =>
      val imageHits = r.result.hits.hits.map(resolveHit).toSeq.flatten.map(i => (i.instance.id, i))
      SearchResults(hits = imageHits, total = imageHits.length, extraCounts = None)
    }
  }

  private def semanticRequest(
    queryEmbedding: List[Double],
    k: Int, numCandidates: Int,
    filterOpt: Option[Query]
  ): SearchRequest =
    ElasticDsl
      .search(imagesCurrentAlias)
      .knn(Knn("embedding.cohereEmbedV4.image", filter = filterOpt)
        .queryVector(queryEmbedding)
        .k(k)
        .numCandidates(numCandidates)
      )
      .size(k)

  def semanticSearch(
    queryEmbedding: List[Double],
    k: Int,
    numCandidates: Int,
    filterOpt: Option[Query]
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SearchResults] = {
    if (!includeDenseVectorMappings) {
      // TODO: could we factor out this check into semanticRequest or elsewhere?
      logger.warn(logMarker, "semanticSearch called but includeDenseVectorMappings=false, returning empty results")
      Future.successful(SearchResults(Nil, total = 0, extraCounts = None))
    } else {
      val searchRequest = semanticRequest(queryEmbedding, k, numCandidates, filterOpt)

      executeAndLog(withSearchQueryTimeout(searchRequest), "semantic search").map { r =>
        val imageHits = r.result.hits.hits.map(resolveHit).toSeq.flatten.map(i => (i.instance.id, i))
        SearchResults(hits = imageHits, total = imageHits.length, extraCounts = None)
      }
    }
  }

  // Runs lexical and semantic searches in parallel, fills in the missing scores
  // for each result clientside, then combines and re-ranks them.
  // This approach was inspired by
  // "An Analysis of Fusion Functions for Hybrid Retrieval"
  // https://arxiv.org/pdf/2210.11934
  private def fusedLexicalAndSemanticSearch(
    query: String,
    queryEmbedding: List[Double],
    k: Int,
    numCandidates: Int,
    vecWeight: Double,
    filterOpt: Option[Query]
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SearchResults] = {
    import HybridResult.{resolveHitAndFillInSemanticScore, fuseAndRank, renderRankedTable}

    val lexicalQuery = createMultiMatchQuery(query, operator = Or)
    val lexicalSearchRequest = lexicalRequest(lexicalQuery, k, filterOpt)

    val semanticSearchRequest = semanticRequest(queryEmbedding, k, numCandidates, filterOpt)
      .rescore(Rescore(lexicalQuery)
        .window(k)
        // We want to replace the knn score with the BM25 score,
        // because we can calculate cosine similarity clientside,
        // but can't do that for BM25.
        .originalQueryWeight(0)
        .rescoreQueryWeight(1)
      )

    // Assigning to vals here eagerly starts both requests, so they run in
    // parallel. The for-comprehension below only sequences the *combination*
    // of their results, not their execution.
    val lexicalSearchResponse = executeAndLog(withSearchQueryTimeout(lexicalSearchRequest), "lexical side of hybrid AI search")
    val semanticSearchResponse = executeAndLog(withSearchQueryTimeout(semanticSearchRequest), "semantic side of hybrid AI search")

    for {
      lexical <- lexicalSearchResponse
      semantic <- semanticSearchResponse
    } yield {
      val lexicalHits = lexical.result.hits.hits.toList
      val semanticHits = semantic.result.hits.hits.toList
      logger.info(logMarker, s"Hybrid AI search returned ${lexicalHits.length + semanticHits.length} initial hits: ${lexicalHits.length} lexical, ${semanticHits.length} semantic")

      // Resolve each side to images and fill in the client-side semantic score.
      // We keep the two sides separate so that fuseAndRank can tag each result
      // with where it originally came from (lexical, semantic, or both).
      val lexicalResults = lexicalHits.flatMap(resolveHitAndFillInSemanticScore(_, queryEmbedding, resolveHit))
      val semanticResults = semanticHits.flatMap(resolveHitAndFillInSemanticScore(_, queryEmbedding, resolveHit))

      val ranked = fuseAndRank(lexicalResults, semanticResults, vecWeight, k)
      val counts = ranked.groupBy(_.source).view.mapValues(_.size).toMap.withDefaultValue(0)
      logger.info(logMarker, s"Hybrid AI search returned ${ranked.length} hits (k=$k) after fusing and ranking, ${counts(Lexical)} from lexical, ${counts(Semantic)} from semantic, ${counts(Both)} from both")
      // This log will be noisy and we can get rid of it at a later stage if we want,
      // but I think it could be indispensable if we see weird results and we
      // want to understand why they're there. An alternative would be putting it
      // into the search response so we could see it in the network tab and even surface
      // in the UI if we wanted, but that would be a bigger change.
      logger.info(logMarker, s"Hybrid AI search ranked results:\n${renderRankedTable(ranked)}")
      SearchResults(hits = ranked.map(r => (r.result.id, r.result.image)), total = ranked.length, extraCounts = None)
    }
  }

  def hybridSearch(
    query: String,
    queryEmbedding: List[Double],
    k: Int,
    numCandidates: Int,
    vecWeight: Double,
    filterOpt: Option[Query]
  )(
    implicit ex: ExecutionContext,
    logMarker: LogMarker
  ): Future[SearchResults] = {
    if (!includeDenseVectorMappings) {
      logger.warn(logMarker, "hybridSearch called but includeDenseVectorMappings=false, returning empty results")
      Future.successful(SearchResults(Nil, total = 0, extraCounts = None))
    } else {
      val stopwatch = Stopwatch.start

      // When the weighting is entirely on one side, short-circuit to that side
      // alone rather than running both queries and fusing.
      val searchResults = vecWeight match {
        case 0.0 => lexicalSearch(query, k, filterOpt)
        case 1.0 => semanticSearch(queryEmbedding, k, numCandidates, filterOpt)
        case _ => fusedLexicalAndSemanticSearch(query, queryEmbedding, k, numCandidates, vecWeight, filterOpt)
      }

      // Run in parallel: how many images match the filters in total (so we can
      // show "Best k of N matches") along with the ticker count badges, both
      // computed over the whole filtered set.
      val filterTotalAndCounts = countMatchingFilterWithExtraCounts(filterOpt)

      (for {
        results <- searchResults
        (total, extraCounts) <- filterTotalAndCounts
      } yield results.copy(total = total, extraCounts = Some(extraCounts))).andThen { case _ =>
        val elapsed = stopwatch.elapsed
        logger.info(
          combineMarkers(logMarker, elapsed),
          s"Hybrid AI search completed in ${elapsed.toMillis} ms"
        )
      }
    }
  }

  // How many images match the active filters in total (so we can show
  // "Best k of N matches") along with the ticker count badges, both computed
  // over the whole filtered set in a single request.
  def countMatchingFilterWithExtraCounts(filterOpt: Option[Query])(implicit ex: ExecutionContext, logMarker: LogMarker): Future[(Long, ExtraCounts)] = {
    val searchRequest = ElasticDsl.search(imagesCurrentAlias)
      .query(filterOpt.getOrElse(matchAllQuery()))
      .trackTotalHits(true)
      .size(0)
      .aggregations(extraCountAggregations)

    executeAndLog(withSearchQueryTimeout(searchRequest), "hybrid AI search filter count and ticker counts").map { r =>
      (r.result.totalHits, extraCountsFrom(r.result.aggregations))
    }
  }

  def search(params: SearchParams)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal], logMarker: LogMarker = MarkerMap()): Future[SearchResults] = {
    val query: Query = queryBuilder.makeQuery(params.structuredQuery)

    val filterOpt: Option[Query] = queryBuilder.buildFilterOpt(params, searchFilters, syndicationFilter)

    val sort = params.orderBy match {
      case Some("dateAddedToCollection") => sorts.dateAddedToCollectionDescending
      case _ => sorts.createSort(params.orderBy)
    }

    val runtimeMappings = if (params.syndicationStatus.contains(AwaitingReviewForSyndication) && config.useRuntimeFieldsToFixSyndicationReviewQueueQuery) {
      Seq(syndicationFilter.syndicationReviewQueueFixMapping)
    } else {
      Seq.empty
    }

    // We need to set trackHits to ensure that the total number of hits we return to users is accurate.
    // See https://www.elastic.co/guide/en/elasticsearch/reference/current/breaking-changes-7.0.html#hits-total-now-object-search-response
    val trackTotalHits = params.countAll.getOrElse(true)

    val graphicImagesScriptFields =
      if (params.shouldFlagGraphicImages) {
        Seq(ScriptField(
          field = isPotentiallyGraphicFieldName,
          // the rest of the logic is in the client (in image.js)
          script = Script(
            //language=groovy -- it's actually painless, but that's pretty similar to groovy and this provides syntax highlighting
            script = "params['_source']?.fileMetadata?.xmp !=null && params['_source']?.fileMetadata?.xmp['pur:adultContentWarning'] != null",
            lang = Some("painless")
          )
        ))
      } else {
        Seq.empty
      }

    val searchRequest = prepareSearch(maybeWithFilter(query, filterOpt))
      .trackTotalHits(trackTotalHits)
      .runtimeMappings(runtimeMappings)
      .storedFields("_source") // this needs to be explicit when using script fields
      .scriptfields(graphicImagesScriptFields)
      .aggregations(extraCountAggregations)
      .from(params.offset)
      .size(params.length)
      .sortBy(sort)

    executeAndLog(searchRequest, "image search").
      toMetric(Some(mediaApiMetrics.searchQueries), List(mediaApiMetrics.searchTypeDimension("results")))(_.result.took).map { r =>
      logSearchQueryIfTimedOut(searchRequest, r.result)
      val imageHits = r.result.hits.hits.map(resolveHit).toSeq.flatten.map(i => (i.instance.id, i))
      // setting trackTotalHits to false means we don't get any hit count at all.
      // Requester has explicitly opted into not caring about the total hits, so give them what they want (nothing).
      SearchResults(
        hits = imageHits,
        total = if (trackTotalHits) r.result.totalHits else 0,
        extraCounts = Some(extraCountsFrom(r.result.aggregations))
      )
    }
  }

  // The aggregations used to compute the ticker count badges ("GNM-owned",
  // "agency picks" etc) shown above search results.
  private def extraCountAggregations = aggregationsNameToSearchClauseMap.map {
    case (name, ExtraCountConfig(searchClause, _, maybeSubAggregation)) =>
      filterAgg(name, queryBuilder.makeQuery(Parser.run(searchClause))).subAggregations(maybeSubAggregation)
  }

  private def extraCountsFrom(aggregations: Aggregations): ExtraCounts = ExtraCounts(
    tickerCounts = aggregationsNameToSearchClauseMap.map {
      case (name, ExtraCountConfig(searchClause, backgroundColour, maybeSubAggregation)) =>
        val aggResult = aggregations.filter(name)
        val maybeSubAggResult = maybeSubAggregation.map(_.name).map(aggResult.result[Terms])
        name -> ExtraCount(
          value = aggResult.docCount,
          searchClause,
          backgroundColour,
          subCounts = maybeSubAggResult.map { termsAgg =>
            ListMap(termsAgg.buckets.sortBy(_.docCount).reverse.map { bucket =>
              (bucket.key, bucket.docCount)
            }: _*) + ("other" -> termsAgg.otherDocCount)
          }.filter(_.exists { case (_, count) => count > 0 })
        )
    }
  )

  def usageForSupplier(id: String, numDays: Int)(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SupplierQuotaCount] = {
    val supplier = Agencies.get(id)
    val supplierName = supplier.supplier

    val bePublished = termQuery("usages.status", "published")
    val beInLastPeriod = rangeQuery("usages.dateAdded")
      .gte(s"now-${numDays}d/d")
      .lt("now/d")

    val haveUsageInLastPeriod = boolQuery().must(bePublished, beInLastPeriod)

    val beSupplier = termQuery("usageRights.supplier", supplierName)
    val haveNestedUsage = nestedQuery("usages", haveUsageInLastPeriod)

    val query = boolQuery().must(matchAllQuery()).filter(boolQuery().must(beSupplier, haveNestedUsage))

    val search = prepareSearch(query) size 0

    executeAndLog(search, s"$id usage search").map { r =>
      import r.result
      logSearchQueryIfTimedOut(search, result)
      SupplierQuotaCount(supplier, result.hits.total.value)
    }
  }

  def quotaCountBySupplier(id: String, numDays: Int)(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SupplierQuotaCount] = {
    val supplier = Agencies.get(id)
    val supplierName = supplier.supplier

    val haveQualifyingStatus   = termsQuery("usages.status", UsageStore.countQualifyingStatuses.map(_.toString))
    // lt("now+1d/d") instead of lte("now") so the query is day-rounded and fully request-cacheable
    val beInLastPeriod         = rangeQuery("usages.dateAdded").gt(s"now-${numDays}d/d").lt("now+1d/d")
    val haveQualifyingPlatform = termsQuery("usages.platform", UsageStore.countQualifyingPlatforms.map(_.toString))
    val haveQualifyingUsage    = nestedQuery("usages", boolQuery().must(haveQualifyingStatus, haveQualifyingPlatform, beInLastPeriod))

    val beSupplier = boolQuery().should(
      termQuery("usageRights.supplier", supplierName),
      matchQuery("usageRights.suppliers", supplierName)
    ).minimumShouldMatch(1)
    val query = boolQuery().must(matchAllQuery()).filter(boolQuery().must(beSupplier, haveQualifyingUsage))


    // Usage-level filters for counting inside the nested aggregation context
    val composerUsageFilter = boolQuery().must(
      haveQualifyingStatus, beInLastPeriod,
      termQuery("usages.platform", DigitalUsage.toString),
      termQuery("usages.references.type", ComposerUsageReference.toString)
    )
    val frontsUsageFilter = boolQuery().must(
      haveQualifyingStatus, beInLastPeriod,
      termQuery("usages.platform", DigitalUsage.toString),
      termQuery("usages.references.type", FrontUsageReference.toString)
    )
    val printUsageFilter = boolQuery().must(
      haveQualifyingStatus, beInLastPeriod,
      termQuery("usages.platform", PrintUsage.toString)
    )
    // Document-level filters: classify images by which quota bucket they fall into.
    val hasQualifyingComposer = nestedQuery("usages", composerUsageFilter)
    val hasQualifyingFronts = nestedQuery("usages", frontsUsageFilter)
    val hasQualifyingPrint = nestedQuery("usages", printUsageFilter)

    val imagesWithComposer = hasQualifyingComposer
    val imagesWithFrontsButNoComposer = boolQuery().must(hasQualifyingFronts).withNot(hasQualifyingComposer)
    val imagesWithPrintButNoComposer  = boolQuery().must(hasQualifyingPrint).withNot(hasQualifyingComposer)

    // Quota counting logic per image:
    // - Each Composer usage counts as 1; if any exist, Fronts and Print on the same image are not counted additionally.
    // - Multiple Fronts count as 1 in total.
    // - Multiple Print usages each count separately.
    // Three mutually exclusive aggregations:
    //  1. Images with composer: sum of composer usage counts
    //  2. Images with fronts, no composer: count of images (each image contributes 1)
    //  3. Images with print, no composer:  sum of print usage counts
    val composerQuotaAgg = filterAgg("has_composer", imagesWithComposer)
      .subAggregations(
        nestedAggregation("usages_agg", "usages")
          .subAggregations(
            filterAgg("qualifying", composerUsageFilter)
          )
      )
    val frontsQuotaAgg = filterAgg("fronts_no_composer", imagesWithFrontsButNoComposer)
    val printQuotaAgg  = filterAgg("print_no_composer", imagesWithPrintButNoComposer)
      .subAggregations(
        nestedAggregation("usages_agg", "usages")
          .subAggregations(
            filterAgg("qualifying", printUsageFilter)
          )
      )

    val search = prepareSearch(query).size(0).aggs(composerQuotaAgg, frontsQuotaAgg, printQuotaAgg)

    executeAndLog(search, s"$id quota count by supplier search").map { r =>
      import r.result
      logSearchQueryIfTimedOut(search, result)
      val aggs          = result.aggregations
      val composerQuota = aggs.filter("has_composer").nested("usages_agg").filter("qualifying").docCount.toInt
      val frontsQuota   = aggs.filter("fronts_no_composer").docCount.toInt
      val printQuota    = aggs.filter("print_no_composer").nested("usages_agg").filter("qualifying").docCount.toInt
      logger.info(s"Quota count for supplier $supplierName in last $numDays days: composer=$composerQuota, fronts=$frontsQuota, print=$printQuota")
      SupplierQuotaCount(supplier, composerQuota + frontsQuota + printQuota)
    }
  }

  def imageUsagesBySupplier(
    id: String,
    structuredQuery: List[Condition] = List.empty,
    offset: Int = 0,
    length: Int = 10
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[ImageUsagesBySupplierResult] = {
    if (offset + length > 10000)
      return Future.failed(new IllegalArgumentException(s"offset + length cannot exceed 10000 (Elasticsearch result window limit)"))

    val supplier = Agencies.get(id)
    val supplierName = supplier.supplier

    val haveQualifyingStatus = termsQuery("usages.status", UsageStore.countQualifyingStatuses.map(_.toString))
    val haveQualifyingPlatform = termsQuery("usages.platform", UsageStore.countQualifyingPlatforms.map(_.toString))

    // e.g. usages@<added:2026-07-31 usages@>added:2026-07-01 - each date bound is inclusive,
    // and since they all apply within the same nested "usages" entry, multiple bounds combine into a range.
    val dateAddedRanges = structuredQuery.collect {
      case Nested(SingleField("usages"), SingleField("dateAdded"), DateRange(start, end)) => (start, end)
    }
    val maybeDateAddedRange = dateAddedRanges match {
      case Nil => None
      case ranges =>
        val from = ranges.map(_._1).maxBy(_.getMillis)
        // `<date` is parsed as midnight of that day; extend to end of day to make the bound inclusive
        val to = ranges.map(_._2).minBy(_.getMillis).withTime(23, 59, 59, 999)
        Some((from, to))
    }

    val qualifyingUsageClauses = List(haveQualifyingStatus, haveQualifyingPlatform) ++
      maybeDateAddedRange.map { case (from, to) => rangeQuery("usages.dateAdded").gte(printDateTime(from)).lte(printDateTime(to)) }
    val haveQualifyingUsage = nestedQuery("usages", boolQuery().must(qualifyingUsageClauses))

    val beSupplier = boolQuery().should(
      termQuery("usageRights.supplier", supplierName),
      matchQuery("usageRights.suppliers", supplierName)
    ).minimumShouldMatch(1)

    val query = boolQuery().must(matchAllQuery()).filter(boolQuery().must(beSupplier, haveQualifyingUsage))

    val search = prepareSearch(query).trackTotalHits(true).from(offset).size(length)

    def isQualifyingUsage(usage: Usage): Boolean =
      UsageStore.countQualifyingStatuses.contains(usage.status) &&
        UsageStore.countQualifyingPlatforms.contains(usage.platform) &&
        maybeDateAddedRange.forall { case (from, to) =>
          usage.dateAdded.exists(dateAdded => !dateAdded.isBefore(from) && !dateAdded.isAfter(to))
        }

    executeAndLog(search, s"$id image usages by supplier search").map { r =>
      import r.result
      logSearchQueryIfTimedOut(search, result)
      val images = result.hits.hits.toList
        .flatMap(resolveHit)
        .map(sourceWrapperImage => sourceWrapperImage.instance)
        .map(image => ImageUsagesBySupplier(image.id, image.usageRights, image.usages.filter(isQualifyingUsage)))
        .distinctBy(_.id)
      ImageUsagesBySupplierResult(images, result.totalHits)
    }
  }

  def dateHistogramAggregate(params: AggregateSearchParams)(implicit ex: ExecutionContext, logMarker: LogMarker): Future[AggregateSearchResults] = {

    def fromDateHistogramAggregation(name: String, aggregations: Aggregations): Seq[BucketResult] = aggregations.result[DateHistogram](name).
      buckets.map(b => BucketResult(b.date, b.docCount))

    val aggregation = dateHistogramAgg(name = params.field, field = params.field).
      calendarInterval(DateHistogramInterval.Month).
      minDocCount(0)
    aggregateSearch(params.field, params, aggregation, fromDateHistogramAggregation)

  }

  def metadataSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext, logMarker: LogMarker): Future[AggregateSearchResults] = {
    aggregateSearch("metadata", params, termsAgg(name = "metadata", field = metadataField(params.field)), fromTermAggregation)
  }

  def editsSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext, logMarker: LogMarker): Future[AggregateSearchResults] = {
    logger.info(logMarker, "Edit aggregation requested with params.field: " + params.field)
    val field = "labels" // TODO was - params.field
    aggregateSearch("edits", params, termsAgg(name = "edits", field = editsField(field)), fromTermAggregation)
  }

  private def fromTermAggregation(name: String, aggregations: Aggregations): Seq[BucketResult] = aggregations.result[Terms](name).
    buckets.map(b => BucketResult(b.key, b.docCount))

  private def aggregateSearch(
    name: String,
    params: AggregateSearchParams,
    aggregation: Aggregation,
    extract: (String, Aggregations) => Seq[BucketResult]
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[AggregateSearchResults] = {
    logger.info(logMarker, "aggregate search: " + name + " / " + params + " / " + aggregation)
    val query = queryBuilder.makeQuery(params.structuredQuery)
    val search = prepareSearch(query) aggregations aggregation size 0

    executeAndLog(search, s"$name aggregate search")
      .toMetric(Some(mediaApiMetrics.searchQueries), List(mediaApiMetrics.searchTypeDimension("aggregate")))(_.result.took).map { r =>
      logSearchQueryIfTimedOut(search, r.result)
      searchResultToAggregateResponse(r.result, name, extract)
    }
  }

  private def searchResultToAggregateResponse(response: SearchResponse, aggregateName: String, extract: (String, Aggregations) => Seq[BucketResult]): AggregateSearchResults = {
    val results = extract(aggregateName, response.aggregations)
    AggregateSearchResults(results, results.size)
  }

  def completionSuggestion(name: String, q: String, size: Int)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[CompletionSuggestionResults] = {
    implicit val logMarker: MarkerMap = MarkerMap()
    val completionSuggestion =
      ElasticDsl.completionSuggestion(name, name).text(q).skipDuplicates(true)
    val search = ElasticDsl.search(imagesCurrentAlias) suggestions completionSuggestion
    executeAndLog(search, "completion suggestion query").
      toMetric(Some(mediaApiMetrics.searchQueries), List(mediaApiMetrics.searchTypeDimension("suggestion-completion")))(_.result.took).map { r =>
      logSearchQueryIfTimedOut(search, r.result)
      val x = r.result.suggestions.get(name).map { suggestions =>
        suggestions.flatMap { s =>
          s.toCompletion.options.map { o =>
            CompletionSuggestionResult(o.text, o.score.toFloat)
          }
        }
      }.getOrElse(Seq.empty)
      CompletionSuggestionResults(x.toList)
    }
  }


  def withSearchQueryTimeout(sr: SearchRequest): SearchRequest = sr timeout SearchQueryTimeout

  private def prepareSearch(query: Query): SearchRequest = {
    val indexes = migrationStatus match {
      case completionPreview: CompletionPreview => List(completionPreview.migrationIndexName)
      case running: Running => List(imagesCurrentAlias, running.migrationIndexName)
      case _ => List(imagesCurrentAlias)
    }
    val migrationAwareQuery = migrationStatus match {
      case running: Running => filters.and(query, filters.mustNot(filters.term("esInfo.migration.migratedTo", running.migrationIndexName)))
      case _ => query
    }
    val searchRequest = ElasticDsl.search(indexes) query migrationAwareQuery
    withSearchQueryTimeout(searchRequest)
  }

  private def mapImageFrom(sourceAsString: String, id: String, fromIndex: String, fields: JsObject = JsObject.empty) = {
    val source = Json.parse(sourceAsString)
    source.validate[Image] match {
      case i: JsSuccess[Image] => Some(SourceWrapper(source, i.value, fromIndex, fields))
      case e: JsError =>
        logger.error("Failed to parse image from source string " + id + ": " + e.toString)
        None
    }
  }

  private def logSearchQueryIfTimedOut(req: SearchRequest, res: SearchResponse) =
    if (res.isTimedOut) logger.info(s"SearchQuery was TimedOut after $SearchQueryTimeout \nquery: ${req.show}")

  // Reflection keeps this in sync with Image automatically; over-inclusion is harmless.
  private val imageSourceFields: Seq[String] =
    classOf[Image].getDeclaredFields.toIndexedSeq.map(_.getName)

  // Heavy fields excluded from Kupua-facing image reads. fieldAliasConfigs re-adds needed
  // leaf paths individually (e.g. pur:adultContentWarning, for client-side graphic-image blur).
  private val leanDropFields = Set("embedding", "originalMetadata", "fileMetadata")

  // _source here is missing the dropped fields, which the strict Image reader rejects.
  // Strip them from a copy before validating, but keep the full source for alias extraction.
  // Kept separate from resolveHit/mapImageFrom (production search), which must stay untouched.
  private def resolveLeanHit(hit: SearchHit): Option[SourceWrapper[Image]] = {
    val source   = Json.parse(hit.sourceAsString)
    val forImage = leanDropFields.foldLeft(source.as[JsObject])(_ - _)
    forImage.validate[Image] match {
      case JsSuccess(image, _) => Some(SourceWrapper(source, image, hit.index, JsObject.empty))
      case e: JsError =>
        logger.error("Failed to parse lean image from source string " + hit.id + ": " + e.toString)
        None
    }
  }

  // The Image schema minus leanDropFields, plus the alias leaf paths so their values survive
  // (e.g. fileMetadata.icc.Profile Description). The resulting PARTIAL fileMetadata is why
  // image reads must resolve hits with resolveLeanHit.
  private def withLeanImageSource(request: SearchRequest): SearchRequest = {
    val includes = imageSourceFields.filterNot(leanDropFields) ++ config.fieldAliasConfigs.map(_.elasticsearchPath)
    request.sourceInclude(includes.head, includes.tail: _*)
  }

  // Every Kupua-facing read starts here, so all of them share one query scope, target and timeout.
  private def admittedSearch(searchParams: SearchParams, pitId: Option[String], extraFilter: Option[Query] = None): SearchRequest = {
    val rawQuery = queryBuilder.makeQuery(searchParams.structuredQuery)
    val filteredQuery = queryBuilder.buildFilterOpt(searchParams, searchFilters, syndicationFilter)
      .map(f => boolQuery() must rawQuery filter f)
      .getOrElse(rawQuery)
    val query = extraFilter.map(f => boolQuery().must(filteredQuery).filter(f)).getOrElse(filteredQuery)

    val target = pitId match {
      case Some(pid) =>
        // Bypass prepareSearch: its migration dedup filter (must_not migratedTo) would silently
        // exclude already-migrated images from a PIT snapshot, shrinking results as migration
        // proceeds. search(Nil) lets ES resolve the target from the PIT ID directly.
        withSearchQueryTimeout(ElasticDsl.search(Nil).query(query)).pit(Pit(pid).keepAlive(1.minute))
      case None =>
        prepareSearch(query)
    }

    // Same conditional runtime mapping search() applies: without it the review-queue filter's
    // hasActiveDenySyndicationLease term is unmapped and silently matches nothing.
    val runtimeMappings =
      if (searchParams.syndicationStatus.contains(AwaitingReviewForSyndication) &&
          config.useRuntimeFieldsToFixSyndicationReviewQueueQuery)
        Seq(syndicationFilter.syndicationReviewQueueFixMapping)
      else
        Seq.empty

    target.runtimeMappings(runtimeMappings)
  }

  // Admits only the client-resolved clause shapes jsonToSort understands; this is not a sort builder.
  private def admitSortClause(sort: Seq[JsObject]): Seq[Sort] = {
    if (sort.isEmpty)
      throw InvalidUriParams("sort must be a non-empty array; positional reads need a deterministic sort")

    val sortFields = sort.flatMap(_.fields.map(_._1))
    val duplicateFields = sortFields.groupBy(identity).collect { case (field, occurrences) if occurrences.size > 1 => field }
    if (duplicateFields.nonEmpty)
      throw InvalidUriParams(s"duplicate sort fields are unsupported: ${duplicateFields.toSeq.sorted.mkString(", ")}")

    val unresolvedAliases = sortFields.filter(Set("usagesDateAdded", "dateAddedToCollection"))
    if (unresolvedAliases.nonEmpty)
      throw InvalidUriParams(s"unresolved sort aliases are unsupported: ${unresolvedAliases.distinct.sorted.mkString(", ")}")

    // A _shard_doc value is PIT-specific; publicTuple would otherwise keep it in public tuples.
    if (sortFields.contains("_shard_doc"))
      throw InvalidUriParams("_shard_doc is unsupported in sort; end the clause with a unique field such as id")

    val admitted = sort.map(sorts.jsonToSort).map {
      case fs: FieldSort =>
        requireMappedNestedPath(fs)
        if (MultiValuedSortDates(fs.field) && !isMultiValued(fs))
          throw InvalidUriParams(s"${fs.field} needs sort mode max; ordered reads position an image by its latest date")
        fs
      case other => other
    }

    // A continuation after a tie on a non-unique last clause would skip the remaining tied images.
    if (!sortFields.lastOption.contains("id"))
      throw InvalidUriParams("sort must end with the unique id field; otherwise continuations can skip tied images")
    admitted
  }

  // Null-zone filters, rank predicates and profiles wrap a clause in its nested path, so it must match Grid's mapping.
  private def requireMappedNestedPath(sort: FieldSort): Unit = {
    val mapped = MappedNestedPaths.toSeq.filter(path => sort.field.startsWith(s"$path.")).sortBy(-_.length).headOption
    val requested = sort.nested.flatMap(_.path)
    if (requested != mapped)
      throw InvalidUriParams(s"${sort.field} needs nested path ${mapped.getOrElse("none")}, not ${requested.getOrElse("none")}")
  }

  private def requireTupleMatches(sortValues: Seq[JsValue], sortClause: Seq[Sort]): Unit = {
    if (sortValues.contains(JsNull))
      throw InvalidUriParams("null sort values are supported only in the leading primary slot")
    if (sortValues.length != sortClause.length)
      throw InvalidUriParams(
        s"sortValues length ${sortValues.length} must equal sort clause length ${sortClause.length}")
  }

  private def requireSuccessfulRead(r: Response[SearchResponse], pitId: Option[String]): Unit =
    if (!r.isSuccess) {
      val missingContext = r.error.`type` == "search_context_missing_exception" ||
        (r.error.`type` == "search_phase_execution_exception" && r.error.rootCause.nonEmpty &&
          r.error.rootCause.forall(_.`type` == "search_context_missing_exception"))
      if (r.status == 404 && pitId.nonEmpty && missingContext) throw SearchAfterPitExpired
      else throw ElasticNotFoundException
    }

  // A PIT search's hit.sort carries an extra implicit _shard_doc tiebreaker. It is dropped
  // deliberately: tuples outlive the PIT (clients persist them, and retry without a PIT when
  // one expires), and a PIT-specific value in a non-PIT search_after is rejected by ES. Callers
  // must therefore end their sort clause with a unique tiebreaker such as id, or documents tied
  // on the clause can be skipped at a page boundary.
  private def publicTuple(hit: SearchHit, sortLength: Int): Seq[JsValue] =
    sortValuesToJsValues(hit.sort.getOrElse(Seq.empty).take(sortLength))

  // How a cursor read continues from a tuple. A null primary value means the null zone: read without
  // the primary clause, only images lacking it, and re-insert the null into the published tuples.
  private case class CursorRead(
    searchAfter: Option[Seq[JsValue]],
    sortClause:  Seq[Sort],
    filter:      Option[Query],
    publish:     Seq[Seq[JsValue]] => Seq[Seq[JsValue]],
  )

  private def cursorRead(baseSorts: Seq[Sort], effectiveSortClause: Seq[Sort], sortValues: Option[Seq[JsValue]]): CursorRead = {
    val read = sortValues.filter(_.headOption.contains(JsNull)) match {
      case Some(sv) =>
        val primarySort = baseSorts.collectFirst { case fs: FieldSort => fs }
          .getOrElse(throw InvalidUriParams("cannot detect primary sort field for null-zone cursor"))
        val primaryField = primarySort.field
        val nzSort   = effectiveSortClause.filterNot { case fs: FieldSort => fs.field == primaryField; case _ => false }
        // A root-level exists on a field inside a nested type matches no parent document, so the
        // must_not would exclude nothing and images that have the field would leak into the null zone.
        val nzExists = primarySort.nested.flatMap(_.path) match {
          case Some(path) => nestedQuery(path, existsQuery(primaryField))
          case None       => existsQuery(primaryField)
        }
        CursorRead(Some(sv.tail), nzSort, Some(boolQuery().withNot(nzExists)),
          remapNullZoneSortValues(_, baseSorts, primaryField))
      case None =>
        CursorRead(sortValues, effectiveSortClause, None, identity)
    }
    read.searchAfter.foreach(requireTupleMatches(_, read.sortClause))
    read
  }

  def searchAfter(params: SearchAfterParams)
                 (implicit ec: ExecutionContext, logMarker: LogMarker): Future[SearchAfterRawResults] =
    // Sort/cursor validation below throws before any Future exists, and the controller only recovers
    // failed futures — an escaping throw would surface as a 500 rather than the intended 422.
    try searchAfterQuery(params) catch { case e: InvalidUriParams => Future.failed(e) }

  private def searchAfterQuery(params: SearchAfterParams)
                              (implicit ec: ExecutionContext, logMarker: LogMarker): Future[SearchAfterRawResults] = {
    if (params.sort.isEmpty)
      throw InvalidUriParams("sort must be a non-empty array; cursor pagination needs a deterministic sort")
    if (params.searchParams.offset != 0)
      throw InvalidUriParams("offset is unsupported by cursor pagination; use sortValues instead")

    val baseSorts          = admitSortClause(params.sort)
    val withReverse        = if (params.reverse) sorts.reverseSorts(baseSorts) else baseSorts
    val effectiveSortClause = if (params.seekToEnd) {
      withReverse.headOption match {
        case Some(fs: FieldSort) => fs.missing("_first") +: withReverse.tail
        case _                   => withReverse
      }
    } else withReverse

    val cursor = cursorRead(baseSorts, effectiveSortClause, params.sortValues)

    val withSort = admittedSearch(params.searchParams, params.pitId, cursor.filter)
      .size(params.searchParams.length)
      .sortBy(cursor.sortClause)
      .trackTotalHits(params.searchParams.countAll.getOrElse(true))

    val request = cursor.searchAfter match {
      case Some(sv) => withSort.searchAfter(sv.map(jsValueToAny))
      case None     => withSort
    }

    executeAndLog(withLeanImageSource(request), "search-after", notFoundSuccessful = params.pitId.nonEmpty).map { r =>
      requireSuccessfulRead(r, params.pitId)

      val sortLen = cursor.sortClause.length

      val (rawHits, rawSortValues) = r.result.hits.hits.toSeq.flatMap { hit =>
        resolveLeanHit(hit).map(image => ((image.instance.id, image), publicTuple(hit, sortLen)))
      }.unzip

      val (orderedHits, orderedSortValues) =
        if (params.reverse) (rawHits.reverse, rawSortValues.reverse) else (rawHits, rawSortValues)

      val finalSortValues = cursor.publish(orderedSortValues)

      SearchAfterRawResults(
        hits           = orderedHits,
        total          = if (params.searchParams.countAll.getOrElse(true)) r.result.totalHits else 0L,
        sortValues     = finalSortValues,
        nextSortValues = finalSortValues.lastOption,
        pitId          = r.result.pitId.filter(_.nonEmpty).orElse(params.pitId),
      )
    }
  }

  // Kupua's shallow-seek threshold. Deeper positions use cursor, rank and profile reads, never from/size.
  private val ShallowWindowOffsetLimit = 10000

  def imageWindow(params: ImageWindowParams)
                 (implicit ec: ExecutionContext, logMarker: LogMarker): Future[ImageWindowRawResults] =
    try imageWindowQuery(params) catch { case e: InvalidUriParams => Future.failed(e) }

  private def imageWindowQuery(params: ImageWindowParams)
                              (implicit ec: ExecutionContext, logMarker: LogMarker): Future[ImageWindowRawResults] = {
    val searchParams = params.searchParams
    if (searchParams.offset >= ShallowWindowOffsetLimit)
      throw InvalidUriParams(s"offset must be below $ShallowWindowOffsetLimit; deeper positions need a cursor read")

    val sortClause = admitSortClause(params.sort)
    val countTotal = searchParams.countAll.getOrElse(true)

    val request = admittedSearch(searchParams, params.pitId)
      .from(searchParams.offset)
      .size(searchParams.length)
      .sortBy(sortClause)
      .trackTotalHits(countTotal)

    executeAndLog(withLeanImageSource(request), "image-window", notFoundSuccessful = params.pitId.nonEmpty).map { r =>
      requireSuccessfulRead(r, params.pitId)

      val rawHits = r.result.hits.hits.toSeq
      val (hits, tuples) = rawHits.flatMap { hit =>
        resolveLeanHit(hit).map(image => ((image.instance.id, image), publicTuple(hit, sortClause.length)))
      }.unzip

      ImageWindowRawResults(
        hits        = hits,
        sortValues  = tuples,
        total       = if (countTotal) Some(r.result.totalHits) else None,
        rawHitCount = rawHits.size,
        pitId       = r.result.pitId.filter(_.nonEmpty).orElse(params.pitId),
      )
    }
  }

  def imageRank(params: ImageRankParams)
               (implicit ec: ExecutionContext, logMarker: LogMarker): Future[ImageRankRawResults] =
    try imageRankQuery(params) catch { case e: InvalidUriParams => Future.failed(e) }

  private def imageRankQuery(params: ImageRankParams)
                            (implicit ec: ExecutionContext, logMarker: LogMarker): Future[ImageRankRawResults] =
    executeAndLog(imageRankRequest(params), "image-rank", notFoundSuccessful = params.pitId.nonEmpty).map { r =>
      requireSuccessfulRead(r, params.pitId)
      ImageRankRawResults(
        rank  = completeCount(r.result),
        pitId = r.result.pitId.filter(_.nonEmpty).orElse(params.pitId),
      )
    }

  // A size-0 _search rather than _count, because only _search can bind to a PIT.
  private[elasticsearch] def imageRankRequest(params: ImageRankParams): SearchRequest = {
    val sortClause = admitNullsLastSortClause(params.sort, "rank")
    if (params.sortValues.length != sortClause.length)
      throw InvalidUriParams(
        s"sortValues length ${params.sortValues.length} must equal sort clause length ${sortClause.length}")

    admittedSearch(params.searchParams, params.pitId, Some(sortsBeforeTuple(sortClause, params.sortValues)))
      .size(0)
      .trackTotalHits(true)
  }

  // Kupua sends one semantic sort (with any configured expansion) plus uploadTime and id. The bound
  // matters because the tie predicates grow quadratically with the clause count.
  private val MaxNullsLastSortClauses = 10

  // The rank predicates assume nulls sort last and multi-valued fields sort by their maximum.
  private def admitNullsLastSortClause(sort: Seq[JsObject], operation: String): Seq[FieldSort] = {
    if (sort.length > MaxNullsLastSortClauses)
      throw InvalidUriParams(s"$operation supports at most $MaxNullsLastSortClauses sort clauses, got ${sort.length}")

    admitSortClause(sort).map {
      case fs: FieldSort if fs.missing.exists(_ != "_last") =>
        throw InvalidUriParams(s"$operation supports only missing _last, not ${fs.missing.get}, for ${fs.field}")
      case fs: FieldSort if fs.sortMode.exists(_ != SortMode.Max) =>
        throw InvalidUriParams(s"$operation supports only sort mode max, not ${fs.sortMode.get}, for ${fs.field}")
      case fs: FieldSort => fs
      case other => throw InvalidUriParams(s"$operation supports only field sorts, not $other")
    }
  }

  // Ported from Kupua's countBefore: an image sorts before the tuple when it ties on every earlier
  // clause and sorts strictly before on one clause.
  private def sortsBeforeTuple(sortClause: Seq[FieldSort], sortValues: Seq[JsValue]): Query = {
    val clauses = sortClause.zip(sortValues)
    val alternatives = clauses.indices.map { i =>
      val (sort, value) = clauses(i)
      val ties = clauses.take(i).map { case (tiedSort, tiedValue) => tiesWith(tiedSort, tiedValue) }
      if (ties.isEmpty) sortsBefore(sort, value) else boolQuery().must(ties :+ sortsBefore(sort, value))
    }
    boolQuery().should(alternatives).minimumShouldMatch(1)
  }

  // A max-mode sort compares each image's greatest value, so "equal" also excludes greater values.
  private def tiesWith(sort: FieldSort, value: JsValue): Query = value match {
    case JsNull => boolQuery().not(hasSortValue(sort))
    case _ =>
      val bound = jsValueToAny(value)
      val atBound = sortRange(sort)(_.copy(gte = Some(bound), lte = Some(bound)))
      if (sort.sortMode.contains(SortMode.Max)) boolQuery().must(atBound).not(sortRange(sort)(_.copy(gt = Some(bound))))
      else atBound
  }

  // Nulls sort last in either direction, so everything with a value sorts before a null.
  private def sortsBefore(sort: FieldSort, value: JsValue): Query = value match {
    case JsNull => hasSortValue(sort)
    case _ =>
      val bound = jsValueToAny(value)
      if (sort.order == SortOrder.DESC) sortRange(sort)(_.copy(gt = Some(bound)))
      else if (sort.sortMode.contains(SortMode.Max)) boolQuery().must(hasSortValue(sort)).not(sortRange(sort)(_.copy(gte = Some(bound))))
      else sortRange(sort)(_.copy(lt = Some(bound)))
  }

  // Without the nested wrapper, queries on a field inside a nested type match no parent document.
  private def onSortField(sort: FieldSort)(query: Query): Query =
    sort.nested.flatMap(_.path).fold(query)(path => nestedQuery(path, query))

  private def hasSortValue(sort: FieldSort): Query = onSortField(sort)(existsQuery(sort.field))

  private def sortRange(sort: FieldSort)(bounds: RangeQuery => RangeQuery): Query =
    onSortField(sort)(bounds(rangeQuery(sort.field)))

  // A timed-out or partly failed search returns a smaller count without an error; publishing it
  // would place the caller at the wrong position.
  private[elasticsearch] def completeCount(result: SearchResponse)(implicit logMarker: LogMarker): Long = {
    requireCompleteExecution(result, ImageRankIncomplete, "rank count")
    result.totalHits
  }

  private def requireCompleteExecution(result: SearchResponse, incomplete: Exception, what: String)(implicit logMarker: LogMarker): Unit =
    if (result.isTimedOut || result.shards.failed > 0) {
      logger.warn(logMarker, s"Incomplete $what: timedOut=${result.isTimedOut}, failedShards=${result.shards.failed}")
      throw incomplete
    }

  def sortProfile(params: SortProfileParams)
                 (implicit ec: ExecutionContext, logMarker: LogMarker): Future[SortProfileRawResults] =
    try sortProfileQuery(params) catch { case e: InvalidUriParams => Future.failed(e) }

  private def sortProfileQuery(params: SortProfileParams)
                              (implicit ec: ExecutionContext, logMarker: LogMarker): Future[SortProfileRawResults] =
    executeAndLog(sortProfileRequest(params), "sort-profile", notFoundSuccessful = params.pitId.nonEmpty).map { r =>
      requireSuccessfulRead(r, params.pitId)
      SortProfileRawResults(
        result = readSortProfile(params, r.result),
        pitId  = r.result.pitId.filter(_.nonEmpty).orElse(params.pitId),
      )
    }

  // Profiles describe fields of the admitted sort only; each clause supplies its nested path,
  // direction and max-mode (multi-valued) semantics.
  private case class ProfiledSort(sortClause: Seq[FieldSort]) {
    def clauseFor(field: String): FieldSort = sortClause.find(_.field == field)
      .getOrElse(throw InvalidUriParams(s"$field is not a field of the admitted sort; profiles describe sorted fields only"))

    // The null zone is the images without the primary sort value, which sort last.
    def withoutPrimary(missingField: Option[String]): Option[Query] = missingField.map { field =>
      val primary = sortClause.head
      if (field != primary.field)
        throw InvalidUriParams(s"missingField must be the primary sort field ${primary.field}, not $field")
      boolQuery().not(hasSortValue(primary))
    }

    // Counts are images per value; admission has already matched any nested path to Grid's mapping.
    def keywordPageClause(field: String): FieldSort = {
      val primary = sortClause.head
      if (field != primary.field)
        throw InvalidUriParams(s"keyword pages walk the primary sort field ${primary.field}, not $field")
      if (primary.nested.isDefined || isMultiValued(primary))
        throw InvalidUriParams(s"keyword pages count plain values; nested or max-mode sort clauses are unsupported, not $field")
      primary
    }
  }

  private lazy val MappedNestedPaths: Set[String] = {
    def nestedPaths(prefix: String, fields: Seq[ElasticField]): Seq[String] = fields.flatMap {
      case nested: NestedField => s"$prefix${nested.name}" +: nestedPaths(s"$prefix${nested.name}.", nested.properties)
      case obj: ObjectField    => nestedPaths(s"$prefix${obj.name}.", obj.properties)
      case _                   => Nil
    }
    nestedPaths("", Mappings.imageMapping(includeDenseVectorMappings).properties).toSet
  }

  private val ProfileAggregation = "profile"
  private val MultiValuedSortDates = Set("usages.dateAdded", "collections.actionData.date")
  private val NestedProfileAggregation = "nested"
  private val CoveredParentsAggregation = "covered"
  private val BucketParentsAggregation = "parents"
  private val KeywordPageSource = "value"

  // Without the nested wrapper, aggregations on a field inside a nested type see no values.
  private def onSortFieldValues(sort: FieldSort)(aggregation: AbstractAggregation): AbstractAggregation =
    sort.nested.flatMap(_.path).fold(aggregation)(path => nestedAggregation(NestedProfileAggregation, path).subAggregations(aggregation))

  private def sortFieldValues(sort: FieldSort, aggregations: Aggregations): Option[Aggregations] =
    sort.nested.flatMap(_.path).fold(Option(aggregations))(_ => aggregations.getAgg(NestedProfileAggregation))
      .flatMap(_.getAgg(ProfileAggregation))

  private def isMultiValued(sort: FieldSort): Boolean = sort.sortMode.contains(SortMode.Max)

  private[elasticsearch] def sortProfileRequest(params: SortProfileParams): SearchRequest = {
    val profiled = ProfiledSort(admitNullsLastSortClause(params.sort, "sort profile"))
    def profileSearch(filter: Option[Query], aggregations: AbstractAggregation*): SearchRequest =
      admittedSearch(params.searchParams, params.pitId, filter)
        .size(0)
        .trackTotalHits(false)
        .aggregations(aggregations)

    params.operation match {
      case ScalarAnchor(field, percentile, scope) =>
        if (percentile < 0 || percentile > 100)
          throw InvalidUriParams(s"percentile must be between 0 and 100, got $percentile")
        val sort = profiled.clauseFor(field)
        val scopeFilter = if (scope.isEmpty) None else Some(boolQuery().filter(scope.map { case (scopeField, value) =>
          onSortField(profiled.clauseFor(scopeField))(termQuery(scopeField, value))
        }))
        profileSearch(scopeFilter,
          onSortFieldValues(sort)(percentilesAgg(ProfileAggregation, field).percents(Seq(percentile)).compression(200)))

      case DateStats(field, missingField) =>
        val sort = profiled.clauseFor(field)
        val stats = onSortFieldValues(sort)(statsAggregation(ProfileAggregation).field(field))
        val coveredParents = if (isMultiValued(sort)) Seq(filterAgg(CoveredParentsAggregation, hasSortValue(sort))) else Nil
        profileSearch(profiled.withoutPrimary(missingField), stats +: coveredParents: _*)

      case DateBuckets(field, missingField, bucketInterval) =>
        val sort = profiled.clauseFor(field)
        val interval = DateHistogramInterval.fromString(bucketInterval)
        val histogram = dateHistogramAgg(ProfileAggregation, field)
          .minDocCount(1)
          .order(if (sort.order == SortOrder.DESC) HistogramOrder.KEY_DESC else HistogramOrder.KEY_ASC)
        val intervalled =
          if (DateBucketInterval.Calendar(bucketInterval)) histogram.calendarInterval(interval) else histogram.fixedInterval(interval)
        val counted = if (sort.nested.isDefined) intervalled.subAggregations(reverseNestedAggregation(BucketParentsAggregation)) else intervalled
        profileSearch(profiled.withoutPrimary(missingField), onSortFieldValues(sort)(counted))

      case KeywordPage(field, after, size, includeCoveredCount) =>
        if (size < 1 || size > KeywordPage.MaxSize)
          throw InvalidUriParams(s"keyword page size must be between 1 and ${KeywordPage.MaxSize}, got $size")
        val sort = profiled.keywordPageClause(field)
        val page = CompositeAggregation(ProfileAggregation,
          sources = Seq(TermsValueSource(KeywordPageSource, field = Some(field), order = Some(if (sort.order == SortOrder.DESC) "desc" else "asc"))),
          size    = Some(size),
          after   = after.map(key => Map(KeywordPageSource -> jsValueToAny(key))),
        )
        val coveredParents = if (includeCoveredCount) Seq(filterAgg(CoveredParentsAggregation, hasSortValue(sort))) else Nil
        profileSearch(None, page +: coveredParents: _*)
    }
  }

  private[elasticsearch] def readSortProfile(params: SortProfileParams, result: SearchResponse)
                                            (implicit logMarker: LogMarker): SortProfileResult = {
    requireCompleteExecution(result, SortProfileIncomplete, "sort profile")
    val profiled = ProfiledSort(admitNullsLastSortClause(params.sort, "sort profile"))
    val aggregations = result.aggregations

    params.operation match {
      case ScalarAnchor(field, _, _) =>
        val percentiles = sortFieldValues(profiled.clauseFor(field), aggregations).flatMap(_.getAgg("values"))
        ScalarAnchorResult(percentiles.flatMap(_.dataAsMap.values.headOption).flatMap(finiteNumber))

      case DateStats(field, _) =>
        val sort = profiled.clauseFor(field)
        val stats = sortFieldValues(sort, aggregations).map(_.dataAsMap).getOrElse(Map.empty[String, Any])
        DateStatsResult(
          valueCount   = stats.get("count").flatMap(finiteNumber).fold(0L)(_.toLong),
          min          = stats.get("min").flatMap(finiteNumber).map(_.toLong),
          max          = stats.get("max").flatMap(finiteNumber).map(_.toLong),
          coveredCount = if (isMultiValued(sort)) Some(docCount(aggregations.getAgg(CoveredParentsAggregation))) else None,
        )

      case DateBuckets(field, _, _) =>
        val sort = profiled.clauseFor(field)
        val counts = sortFieldValues(sort, aggregations).toSeq
          .flatMap(values => DateHistogram(ProfileAggregation, values.dataAsMap).buckets)
          .map { bucket =>
            val images = if (sort.nested.isDefined) docCount(bucket.getAgg(BucketParentsAggregation)) else bucket.docCount
            bucket.date -> images
          }
          .filter { case (_, images) => images > 0 }
        val starts = counts.scanLeft(0L)(_ + _._2)
        DateBucketsResult(
          buckets       = counts.zip(starts).map { case ((key, count), start) => DateBucket(key, count, start) },
          positionKind  = if (isMultiValued(sort)) "approximate-evidence" else "exact-rank",
          evidenceCount = starts.last,
        )

      case KeywordPage(field, _, _, includeCoveredCount) =>
        profiled.keywordPageClause(field)
        val page = aggregations.compositeAgg(ProfileAggregation)
        KeywordPageResult(
          buckets      = page.buckets.map(bucket => KeywordBucket(keywordValue(bucket.key(KeywordPageSource)), bucket.docCount)),
          after        = page.afterKey.flatMap(_.get(KeywordPageSource)).map(keywordValue),
          coveredCount = if (includeCoveredCount) Some(docCount(aggregations.getAgg(CoveredParentsAggregation))) else None,
        )
    }
  }

  private def keywordValue(key: Any): JsValue = key match {
    case text: String             => JsString(text)
    case number: java.lang.Number => JsNumber(BigDecimal(number.toString))
    case other                    => JsString(other.toString)
  }

  private def finiteNumber(value: Any): Option[Double] = value match {
    case n: java.lang.Number if !n.doubleValue.isNaN && !n.doubleValue.isInfinite => Some(n.doubleValue)
    case _ => None
  }

  private def docCount(aggregation: Option[Aggregations]): Long =
    aggregation.flatMap(_.dataAsMap.get("doc_count")).flatMap(finiteNumber).fold(0L)(_.toLong)

  private def sortValueToJsValue(v: AnyRef): JsValue = v match {
    case null                  => JsNull
    case n: java.lang.Long if n == Long.MinValue || n == Long.MaxValue => JsNull
    case n: java.lang.Long     => JsNumber(BigDecimal(n))
    case n: java.lang.Double   => JsNumber(BigDecimal(n))
    case n: java.lang.Integer  => JsNumber(BigDecimal(n.toLong))
    case s: String             => JsString(s)
    case other                 => JsString(other.toString)
  }

  private def sortValuesToJsValues(sort: Seq[AnyRef]): Seq[JsValue] =
    sort.toSeq.map(sortValueToJsValue)

  private def jsValueToAny(v: JsValue): AnyRef = v match {
    case JsNull      => null
    case JsNumber(n) => if (n.isValidLong) java.lang.Long.valueOf(n.toLong) else java.lang.Double.valueOf(n.toDouble)
    case JsString(s) => s
    case other       => other.toString
  }

  // Re-insert JsNull at the primary sort field position in each sort-values array.
  private def remapNullZoneSortValues(
    sortValues:     Seq[Seq[JsValue]],
    fullSortClause: Seq[Sort],
    primaryField:   String,
  ): Seq[Seq[JsValue]] =
    sortValues.map { sv =>
      fullSortClause.foldLeft[(Seq[JsValue], Seq[JsValue])]((Seq.empty, sv)) {
        case ((acc, remaining), fs: FieldSort) if fs.field == primaryField =>
          (acc :+ JsNull, remaining)
        case ((acc, remaining), _) =>
          (acc :+ remaining.headOption.getOrElse(JsNull), remaining.drop(1))
      }._1
    }

}
