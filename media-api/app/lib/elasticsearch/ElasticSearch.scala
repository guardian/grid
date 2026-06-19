package lib.elasticsearch

import org.apache.pekko.actor.Scheduler
import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.lib.argo.model.{ExtraCount, ExtraCountConfig, ExtraCounts}
import com.gu.mediaservice.lib.elasticsearch.filters
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.elasticsearch.{CompletionPreview, ElasticSearchClient, ElasticSearchConfig, MigrationStatusProvider, Running}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap, Stopwatch, combineMarkers}
import com.gu.mediaservice.lib.metrics.FutureSyntax
import com.gu.mediaservice.model.{Agencies, Agency, AwaitingReviewForSyndication, Image}
import com.sksamuel.elastic4s.{ElasticDsl, Hit}
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.common.Operator
import com.sksamuel.elastic4s.requests.common.Operator.Or
import com.sksamuel.elastic4s.requests.get.{GetRequest, GetResponse}
import com.sksamuel.elastic4s.requests.script.{Script, ScriptField}
import com.sksamuel.elastic4s.requests.searches._
import com.sksamuel.elastic4s.requests.searches.aggs.Aggregation
import com.sksamuel.elastic4s.requests.searches.aggs.responses.Aggregations
import com.sksamuel.elastic4s.requests.searches.aggs.responses.bucket.{DateHistogram, Terms}
import com.sksamuel.elastic4s.requests.searches.queries.Query
import com.sksamuel.elastic4s.requests.searches.knn.Knn
import com.sksamuel.elastic4s.requests.searches.queries.matches.MultiMatchQueryBuilderType.BEST_FIELDS
import com.sksamuel.elastic4s.requests.searches.queries.matches.{FieldWithOptionalBoost, MultiMatchQuery}
import lib.querysyntax.{HierarchyField, Match, Parser, Phrase}
import lib.{MediaApiConfig, MediaApiMetrics, SupplierUsageSummary}
import play.api.libs.json.{JsError, JsObject, JsSuccess, Json}
import play.api.mvc.AnyContent
import play.api.mvc.Security.AuthenticatedRequest
import play.mvc.Http.Status
import scalaz.NonEmptyList
import scalaz.syntax.std.list._

import java.util.concurrent.TimeUnit
import scala.collection.immutable.ListMap
import scala.concurrent.duration.FiniteDuration
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

  // A dedicated, bounded thread pool for the CPU-heavy part of hybrid search:
  // deserialising each hit's _source into an Image and computing the clientside
  // cosine score. Running this off Play's shared request dispatcher means the
  // lexical and semantic responses can be streamed, parsed and deserialised
  // genuinely in parallel instead of contending for the same threads.
  private val hybridSearchExecutionContext: ExecutionContext = {
    val threadFactory = new java.util.concurrent.ThreadFactory {
      private val count = new java.util.concurrent.atomic.AtomicInteger(0)
      override def newThread(r: Runnable): Thread = {
        val thread = new Thread(r, s"hybrid-search-${count.incrementAndGet()}")
        thread.setDaemon(true)
        thread
      }
    }
    val parallelism = Math.max(2, Runtime.getRuntime.availableProcessors)
    ExecutionContext.fromExecutor(
      java.util.concurrent.Executors.newFixedThreadPool(parallelism, threadFactory)
    )
  }

  private def lexicalRequest(
    lexicalQuery: MultiMatchQuery,
    k: Int,
    filterOpt: Option[Query]
  ): SearchRequest =
    ElasticDsl
      .search(imagesCurrentAlias)
      .query(boolQuery().must(lexicalQuery).filter(filterOpt))
      .size(k)

  private def lexicalSearch(
    query: String,
    k: Int,
    filterOpt: Option[Query]
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SearchResults] = {
    val searchRequest = lexicalRequest(createMultiMatchQuery(query, operator = Or), k, filterOpt)

    executeAndLog(withSearchQueryTimeout(searchRequest), "lexical-only").map { r =>
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
    queryEmbedding: List[Float],
    k: Int,
    numCandidates: Int,
    filterOpt: Option[Query]
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SearchResults] = {
    if (!includeDenseVectorMappings) {
      // TODO: could we factor out this check into semanticRequest or elsewhere?
      logger.warn(logMarker, "semanticSearch called but includeDenseVectorMappings=false, returning empty results")
      Future.successful(SearchResults(Nil, total = 0, extraCounts = None))
    } else {
      val searchRequest = semanticRequest(queryEmbedding.map(_.toDouble), k, numCandidates, filterOpt)

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
    filterOpt: Option[Query],
    separateThreadPools: Boolean
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SearchResults] = {
    import HybridResult.{resolveHitAndFillInSemanticScore, fuseScoresAndGetTopK}

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

    if (separateThreadPools) {
      fuseOnSeparateThreadPools(lexicalSearchRequest, semanticSearchRequest, queryEmbedding, vecWeight, k)
    } else {
      fuseOnSharedDispatcher(lexicalSearchRequest, semanticSearchRequest, queryEmbedding, vecWeight, k)
    }
  }

  // Branch `js-separate-thread-pools` behaviour: deserialise and score each
  // query's hits on a dedicated thread pool, so the two response bodies are
  // processed genuinely in parallel rather than contending for Play's shared
  // request dispatcher.
  private def fuseOnSeparateThreadPools(
    lexicalSearchRequest: SearchRequest,
    semanticSearchRequest: SearchRequest,
    queryEmbedding: List[Double],
    vecWeight: Double,
    k: Int
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SearchResults] = {
    import HybridResult.{resolveHitAndFillInSemanticScore, fuseScoresAndGetTopK}

    // The CPU-heavy part of hybrid search is deserialising each hit's _source
    // into an Image and computing its clientside cosine score. We attach that
    // work to each query's own future via `.map` on hybridSearchExecutionContext,
    // so:
    //   - the lexical hits are deserialised as soon as they arrive, while the
    //     (slower) semantic query is still in flight, and
    //   - the two response bodies are processed on separate threads rather than
    //     contending for Play's shared request dispatcher.
    def deserialiseAndScore(hits: List[SearchHit], label: String): List[HybridResult] = {
      val results = hits.flatMap(hit => resolveHitAndFillInSemanticScore(hit, queryEmbedding, resolveHit))
      logger.info(logMarker, s"hybrid search: $label query deserialised ${results.length} of ${hits.length} hits " +
        s"on ${Thread.currentThread().getName}")
      results
    }

    // Assigning to vals here eagerly starts both requests, so they run in
    // parallel. Each `.map` runs on hybridSearchExecutionContext, keeping the two
    // pipelines genuinely concurrent end-to-end (stream -> parse -> deserialise).
    val lexicalResults: Future[List[HybridResult]] =
      executeAndLog(withSearchQueryTimeout(lexicalSearchRequest), "lexical-hybrid")
        .map(resp => deserialiseAndScore(resp.result.hits.hits.toList, "lexical"))(hybridSearchExecutionContext)

    val semanticResults: Future[List[HybridResult]] =
      executeAndLog(withSearchQueryTimeout(semanticSearchRequest), "semantic-hybrid")
        .map(resp => deserialiseAndScore(resp.result.hits.hits.toList, "semantic"))(hybridSearchExecutionContext)

    // The for-comprehension only sequences the *combination* of the already
    // deserialised, already scored results, which is cheap.
    for {
      lexical <- lexicalResults
      semantic <- semanticResults
    } yield {
      val lexicalIds = lexical.map(_.id).toSet
      val semanticIds = semantic.map(_.id).toSet

      // A document can appear in both result sets. The duplicate HybridResults are
      // identical (same BM25 from the semantic query's rescore, same clientside
      // cosine), so deduping by id and keeping either is safe.
      val distinctResults = (lexical ::: semantic).distinctBy(_.id)
      logger.info(logMarker, s"${lexical.length + semantic.length} total hits: ${lexical.length} lexical, " +
        s"${semantic.length} semantic; ${distinctResults.length} distinct")

      val topK = fuseScoresAndGetTopK(distinctResults, vecWeight, k)
      topK.foreach { r =>
        logger.info(logMarker, s"hybrid result ${r.id}: lexicalScore=${r.lexicalScore} semanticScore=${r.semanticScore} " +
          s"originallyFromLexical=${lexicalIds.contains(r.id)} originallyFromSemantic=${semanticIds.contains(r.id)}")
      }
      SearchResults(hits = topK.map(r => (r.id, r.image)), total = topK.length, extraCounts = None)
    }
  }

  // Branch `js-fill-missing-scores-with-two-rescore-queries` behaviour: run both
  // requests in parallel, then combine the raw hits and deserialise/score them
  // on the shared request dispatcher after deduping.
  private def fuseOnSharedDispatcher(
    lexicalSearchRequest: SearchRequest,
    semanticSearchRequest: SearchRequest,
    queryEmbedding: List[Double],
    vecWeight: Double,
    k: Int
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SearchResults] = {
    import HybridResult.{resolveHitAndFillInSemanticScore, fuseScoresAndGetTopK}

    // Assigning to vals here eagerly starts both requests, so they run in
    // parallel. The for-comprehension below only sequences the *combination*
    // of their results, not their execution.
    val lexicalSearchResponse = executeAndLog(withSearchQueryTimeout(lexicalSearchRequest), "lexical-hybrid")
    val semanticSearchResponse = executeAndLog(withSearchQueryTimeout(semanticSearchRequest), "semantic-hybrid")

    for {
      lexical <- lexicalSearchResponse
      semantic <- semanticSearchResponse
    } yield {
      val lexicalHits = lexical.result.hits.hits.toList
      val semanticHits = semantic.result.hits.hits.toList
      val allHits = lexicalHits ::: semanticHits
      logger.info(logMarker, s"${allHits.length} total hits: ${lexicalHits.length} lexical, ${semanticHits.length} semantic")

      // This is only valid because the queries ensure that all hits, including semantic,
      // have only the lexical score at this point.
      val distinctHits = allHits.distinctBy(_.id)
      logger.info(logMarker, s"${distinctHits.length} distinct hits")

      val lexicalIds = lexicalHits.map(_.id).toSet
      val semanticIds = semanticHits.map(_.id).toSet

      val resultsWithSemanticScoresFilledIn = distinctHits.flatMap { hit =>
        resolveHitAndFillInSemanticScore(hit, queryEmbedding, resolveHit)
      }
      val topK = fuseScoresAndGetTopK(resultsWithSemanticScoresFilledIn, vecWeight, k)
      topK.foreach { r =>
        logger.info(logMarker, s"hybrid result ${r.id}: lexicalScore=${r.lexicalScore} semanticScore=${r.semanticScore} " +
          s"originallyFromLexical=${lexicalIds.contains(r.id)} originallyFromSemantic=${semanticIds.contains(r.id)}")
      }
      SearchResults(hits = topK.map(r => (r.id, r.image)), total = topK.length, extraCounts = None)
    }
  }

  def hybridSearch(
    query: String,
    queryEmbedding: List[Float],
    k: Int,
    numCandidates: Int,
    vecWeight: Double,
    filterOpt: Option[Query],
    separateThreadPools: Boolean = true
  )(
    implicit ex: ExecutionContext,
    logMarker: LogMarker
  ): Future[SearchResults] = {
    if (!includeDenseVectorMappings) {
      logger.warn(logMarker, "hybridSearch called but includeDenseVectorMappings=false, returning empty results")
      Future.successful(SearchResults(Nil, total = 0, extraCounts = None))
    } else {
      val queryEmbeddingDouble: List[Double] = queryEmbedding.map(_.toDouble)

      val stopwatch = Stopwatch.start

      // When the weighting is entirely on one side, short-circuit to that side
      // alone rather than running both queries and fusing.
      val searchResults = vecWeight match {
        case 0.0 => lexicalSearch(query, k, filterOpt)
        case 1.0 => semanticSearch(queryEmbedding, k, numCandidates, filterOpt)
        case _ => fusedLexicalAndSemanticSearch(query, queryEmbeddingDouble, k, numCandidates, vecWeight, filterOpt, separateThreadPools)
      }

      searchResults.foreach { _ =>
        val elapsed = stopwatch.elapsed
        logger.info(
          combineMarkers(logMarker, elapsed),
          s"hybrid search completed in ${elapsed.toMillis} ms"
        )
      }

      searchResults
    }
  }

  def search(params: SearchParams)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal], logMarker: LogMarker = MarkerMap()): Future[SearchResults] = {
    val query: Query = queryBuilder.makeQuery(params.structuredQuery)

    val filterOpt: Option[Query] = queryBuilder.buildFilterOpt(params, searchFilters, syndicationFilter)

    val withFilter = filterOpt.map { f =>
      boolQuery() must (query) filter f
    }.getOrElse(query)

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

    val searchRequest = prepareSearch(withFilter)
      .trackTotalHits(trackTotalHits)
      .runtimeMappings(runtimeMappings)
      .storedFields("_source") // this needs to be explicit when using script fields
      .scriptfields(graphicImagesScriptFields)
      .aggregations(aggregationsNameToSearchClauseMap.map {
        case (name, ExtraCountConfig(searchClause, _, maybeSubAggregation)) =>
          filterAgg(name, queryBuilder.makeQuery(Parser.run(searchClause))).subAggregations(maybeSubAggregation)
      })
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
        extraCounts = Some(ExtraCounts(
          tickerCounts = aggregationsNameToSearchClauseMap.map {
            case (name, ExtraCountConfig(searchClause, backgroundColour, maybeSubAggregation)) =>
              val aggResult = r.result.aggregations.filter(name)
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
        ))
      )
    }
  }

  def usageForSupplier(id: String, numDays: Int)(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SupplierUsageSummary] = {
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
      SupplierUsageSummary(supplier, result.hits.total.value)
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

}
