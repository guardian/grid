package lib.elasticsearch

import org.apache.pekko.actor.Scheduler
import com.gu.mediaservice.lib.{ImageFields, VectorUtils}
import com.gu.mediaservice.lib.argo.model.{ExtraCount, ExtraCountConfig, ExtraCounts}
import com.gu.mediaservice.lib.elasticsearch.filters
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.elasticsearch.{CompletionPreview, ElasticSearchClient, ElasticSearchConfig, MigrationStatusProvider, Running}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap, Stopwatch, combineMarkers}
import com.gu.mediaservice.lib.metrics.FutureSyntax
import com.gu.mediaservice.model.{Agencies, Agency, AwaitingReviewForSyndication, Image}
import com.sksamuel.elastic4s.{ElasticDsl, Hit, Response}
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.common.Operator
import com.sksamuel.elastic4s.requests.common.Operator.{And, Or}
import com.sksamuel.elastic4s.requests.get.{GetRequest, GetResponse}
import com.sksamuel.elastic4s.requests.script.{Script, ScriptField}
import com.sksamuel.elastic4s.requests.searches._
import com.sksamuel.elastic4s.requests.searches.aggs.Aggregation
import com.sksamuel.elastic4s.requests.searches.aggs.responses.Aggregations
import com.sksamuel.elastic4s.requests.searches.aggs.responses.bucket.{DateHistogram, Terms}
import com.sksamuel.elastic4s.requests.searches.queries.Query
import com.sksamuel.elastic4s.requests.searches.knn.Knn
import com.sksamuel.elastic4s.requests.searches.queries.compound.BoolQuery
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

  def knnSearch(queryEmbedding: List[Float], k: Int, numCandidates: Int, filterOpt: Option[Query])
               (implicit ex: ExecutionContext, logMarker: LogMarker): Future[SearchResults] = {
    if (!includeDenseVectorMappings) {
      logger.warn(logMarker, "knnSearch called but includeDenseVectorMappings=false, returning empty results")
      Future.successful(SearchResults(Nil, total = 0, extraCounts = None))
    } else {
      val knn = Knn("embedding.cohereEmbedV4.image", filter = filterOpt)
        .queryVector(queryEmbedding.map(_.toDouble))
        .k(k)
        .numCandidates(numCandidates)

      val searchRequest = ElasticDsl.search(imagesCurrentAlias)
        .knn(knn)
        .size(k)

      executeAndLog(withSearchQueryTimeout(searchRequest), "knn search").map { r =>
        val imageHits = r.result.hits.hits.map(resolveHit).toSeq.flatten.map(i => (i.instance.id, i))
        SearchResults(hits = imageHits, total = imageHits.length, extraCounts = None)
      }
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

  // All hybrid-search ES requests go through this helper so the latency logging is
  // consistent across every mode. For each request it reports:
  //   - round-trip: wall-clock time from issuing the request to receiving the response
  //   - elasticsearch took: ES's own reported execution time (`result.took`), i.e. the
  //     internal work done by the cluster
  //   - network+overhead: round-trip minus took, i.e. transfer over the network plus
  //     any queueing/serialisation outside ES
  // The remaining time (deserialisation, computing missing scores, merging) is timed
  // separately by each mode as "local merge" / "full pipeline".
  private def executeHybridSearchWithTiming(request: SearchRequest, label: String)
                                           (implicit ex: ExecutionContext, logMarker: LogMarker): Future[Response[SearchResponse]] = {
    val stopwatch = Stopwatch.start
    val responseF = executeAndLog(withSearchQueryTimeout(request), s"hybrid search: $label")
    responseF.foreach { r =>
      val roundTripMs = stopwatch.elapsed.toMillis
      val esTookMs = r.result.took
      logger.info(
        logMarker,
        s"hybrid search timing: $label round-trip ${roundTripMs} ms " +
          s"(elasticsearch took ${esTookMs} ms, network+overhead ${roundTripMs - esTookMs} ms)"
      )
    }
    responseF
  }

  // BM25 scores are unbounded [0,inf] and typically much larger in magnitude
  // than cosine similarity (knn). So we get the max BM25 score for the query and use that to calculate
  // the scaling factor for the lexical part of the query, so that BM25 and knn scores are both between 0-1 scale
  // and can be effectively combined in a hybrid query.
  private def fetchMaxBm25Score(query: String, filterOpt: Option[Query])(implicit ex: ExecutionContext, logMarker: LogMarker): Future[Double] = {
    val baseQuery = createMultiMatchQuery(query, operator = And)
    val filteredQuery = filterOpt.map(filter => boolQuery().must(baseQuery).filter(filter)).getOrElse(baseQuery)

    val maxScoreRequest = ElasticDsl.search(imagesCurrentAlias)
      .query(filteredQuery)

    executeHybridSearchWithTiming(maxScoreRequest, "off max-bm25 query").map { r =>
      logger.info(logMarker, s"Max BM25 score for query '$query' is ${r.result.hits.maxScore}")
      if (r.result.hits.hits.isEmpty) 1.0 else r.result.hits.maxScore
    }
  }

  private def makeHybridSearchRequest(
    query: String,
    queryEmbedding: List[Double],
    k: Int,
    numCandidates: Int,
    vecWeight: Double,
    maxScore: Double,
    filterOpt: Option[Query]
  )(implicit logMarker: LogMarker): SearchRequest = {
    val knn = Knn("embedding.cohereEmbedV4.image", filter = filterOpt)
      .queryVector(queryEmbedding)
      .k(k)
      .numCandidates(numCandidates)
      .boost(if (vecWeight > 0.0) 1.0 else 0.0)

    val lexicalWeight = 1.0 - vecWeight

    // KNN results are in [0,1], but BM25 scores are unbounded and typically much
    // larger than cosine similarity, so we need to apply a scaling factor to the
    // BM25 score to bring it to the same range as the cosine similarity.
    val scalingFactor = if (maxScore > 0.0) 1.0 / maxScore else 1.0

    // We want to apply only one boost if we can help it, so we scale the
    // multi_match boost to be in line with the max_score and the desired
    // lexical_weight/vec_weight balance
    val multiMatchBoost = if (vecWeight > 0.0) (lexicalWeight / vecWeight) * scalingFactor else 1.0

    logger.info(logMarker, s"Scaling factor for BM25 score is $scalingFactor, multi-match boost is $multiMatchBoost")

    val multiMatchQuery = createMultiMatchQuery(query, boost = Some(multiMatchBoost), operator = And)

    ElasticDsl.search(imagesCurrentAlias)
      .bool(BoolQuery().should(Seq(multiMatchQuery, knn)).filter(filterOpt))
      .size(k)
  }

  private case class HybridResult(
    id: String,
    lexicalScore: Double,
    semanticScore: Double,
    image: SourceWrapper[Image]
  )

  private case object HybridResult {
    def resolveHitAndFillInSemanticScore(
      hit: SearchHit,
      queryEmbedding: List[Double]
    ): Option[HybridResult] =
      resolveHit(hit).map { image =>
        val semanticScore = image.instance.embedding
          .flatMap(_.cohereEmbedV4)
          // We can't use the dot product shortcut because image vectors
          // are truncated 256-dim versions of a normalised 1536-dim vector,
          // meaning they will not have magnitude 1.
          // Note this is true cosine similarity from -1 to 1,
          // *not* the ES-normalised score, but when we max-normalise
          // later it will end up in the range 0-1.
          .map(e => VectorUtils.cosineSimilarity(e.image, queryEmbedding))
          .getOrElse(-1.0)
        HybridResult(hit.id, lexicalScore = hit.score, semanticScore = semanticScore, image = image)
      }

    def combineScoresAndGetTopK(
      results: List[HybridResult],
      vecWeight: Double,
      k: Int
    ): List[HybridResult] = {
      // Account for the rare case in which KNN doesn't return the true closest vector,
      // and that true closest vector happens to be among the lexical-only results.
      val maxLexicalScore = results.maxBy(_.lexicalScore).lexicalScore
      val maxSemanticScore = results.maxBy(_.semanticScore).semanticScore

      def combinedScore(result: HybridResult): Double = {
        val normedLexicalScore = result.lexicalScore / maxLexicalScore
        // normedScore = (score - theoretical_min) / (max - theoretical_min)
        // This is theoretical min, i.e. -1, to actual max,
        // so it effectively does both the max-norming and the ES-score norming.
        val normedSemanticScore = (result.semanticScore + 1) / (maxSemanticScore + 1)
        (vecWeight * normedSemanticScore) + ((1 - vecWeight) * normedLexicalScore)
      }

      results.sortBy(combinedScore)(Ordering[Double].reverse).take(k)
    }
  }

  // Hybrid search mode "Option 2": run a lexical (BM25) query and a knn query in
  // parallel, take the union of their hits, fill in each hit's missing semantic score
  // by computing cosine similarity client-side, then max-normalise both score types and
  // combine them. Selected via `fillScores=option2`.
  private def fillScoresSearch(
    query: String,
    queryEmbedding: List[Double],
    k: Int,
    numCandidates: Int,
    vecWeight: Double,
    filterOpt: Option[Query]
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SearchResults] = {
    import HybridResult.{resolveHitAndFillInSemanticScore, combineScoresAndGetTopK}

    // Times the whole pipeline: parallel queries + local merge/scoring.
    val pipelineStopwatch = Stopwatch.start

    val lexicalQuery = createMultiMatchQuery(query, operator = Or)

    val lexicalSearchRequest = ElasticDsl
      .search(imagesCurrentAlias)
      .query(boolQuery().must(lexicalQuery).filter(filterOpt))
      .size(k)

    val semanticSearchRequest = ElasticDsl
      .search(imagesCurrentAlias)
      .knn(Knn("embedding.cohereEmbedV4.image", filter = filterOpt)
        .queryVector(queryEmbedding)
        .k(k)
        .numCandidates(numCandidates)
      )
      .rescore(Rescore(lexicalQuery)
        .window(k)
        // We want to replace the knn score with the BM25 score,
        // because we can calculate cosine similarity clientside,
        // but can't do that for BM25.
        .originalQueryWeight(0)
        .rescoreQueryWeight(1)
      )
      .size(k)

    // Assigning to vals here eagerly starts both requests, so they run in
    // parallel. The for-comprehension below only sequences the *combination*
    // of their results, not their execution.
    val lexicalSearchResponse = executeHybridSearchWithTiming(lexicalSearchRequest, "hybrid search timing: option2 lexical query")
    val semanticSearchResponse = executeHybridSearchWithTiming(semanticSearchRequest, "hybrid search timing: option2 semantic query")

    for {
      lexical <- lexicalSearchResponse
      semantic <- semanticSearchResponse
    } yield {
      // Local (in-memory) merge + scoring: deserialising hits, computing the missing
      // semantic scores and combining. Timed separately from the ES round trips.
      val mergeStopwatch = Stopwatch.start

      val lexicalHits = lexical.result.hits.hits.toList
      val semanticHits = semantic.result.hits.hits.toList
      val allHits = lexicalHits ::: semanticHits
      logger.info(logMarker, s"hybrid search (option2) ${allHits.length} total hits: ${lexicalHits.length} lexical, ${semanticHits.length} semantic")

      val distinctHits = allHits.distinctBy(_.id)
      logger.info(logMarker, s"hybrid search (option2) ${distinctHits.length} distinct hits")

      val resultsWithSemanticScoresFilledIn = distinctHits.flatMap { hit =>
        resolveHitAndFillInSemanticScore(hit, queryEmbedding)
      }
      val topK = combineScoresAndGetTopK(resultsWithSemanticScoresFilledIn, vecWeight, k)

      logger.info(logMarker, s"hybrid search timing: option2 local merge took ${mergeStopwatch.elapsed.toMillis} ms")
      val elapsed = pipelineStopwatch.elapsed
      logger.info(combineMarkers(logMarker, elapsed), s"hybrid search timing: option2 full pipeline took ${elapsed.toMillis} ms")

      SearchResults(hits = topK.map(r => (r.id, r.image)), total = topK.length, extraCounts = None)
    }
  }

  // Hybrid search mode "Option 1": run a knn query and a BM25 (multi_match) query in
  // parallel; for any knn hit missing from the BM25 top-k, fetch its exact BM25 score
  // with a second ids-filtered query; for any BM25 hit missing from the knn results,
  // compute its cosine similarity client-side. Max-normalise both score types and
  // combine. Selected via `fillScores=option1`.
  private def fillAndMaxNormalise(
    query: String,
    queryEmbedding: List[Double],
    k: Int,
    numCandidates: Int,
    vecWeight: Double,
    filterOpt: Option[Query]
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SearchResults] = {

    // Times the whole pipeline: parallel queries + conditional follow-up + local merge.
    val pipelineStopwatch = Stopwatch.start

    val knn = Knn("embedding.cohereEmbedV4.image", filter = filterOpt)
      .queryVector(queryEmbedding)
      .k(k)
      .numCandidates(numCandidates)

    val knnRequest = ElasticDsl.search(imagesCurrentAlias)
      .knn(knn)
      .size(k)

    val multiMatchQuery = createMultiMatchQuery(query, boost = Some(1.0), operator = Or)

    // Top-k BM25 results are our lexical contenders. We keep their source so we can read
    // each image's embedding and compute a local cosine for any contender absent from knn.
    val multiMatchRequest = ElasticDsl.search(imagesCurrentAlias)
      .query(filterOpt.map(f => boolQuery().must(multiMatchQuery).filter(f)).getOrElse(multiMatchQuery))
      .size(k)

    // Kick both queries off before awaiting either, so they execute in parallel.
    // Each is timed independently (by the helper) so we can see the individual request latencies.
    val knnResponseF = executeHybridSearchWithTiming(knnRequest, "hybrid search timing: option1 semantic query")
    val multiMatchResponseF = executeHybridSearchWithTiming(multiMatchRequest, "hybrid search timing: option1 lexical query")

    // Raw cosine similarity, mapped onto ES's Cosine `_score` scale of (1 + cos) / 2
    // so a locally-computed score is directly comparable to the knn scores ES returns.
    def knnScaledCosine(a: List[Double], b: List[Double]): Double = (1.0 + VectorUtils.cosineSimilarity(a, b)) / 2.0

    for {
      knnResponse <- knnResponseF
      multiMatchResponse <- multiMatchResponseF

      knnHits = knnResponse.result.hits.hits
      multiMatchHits = multiMatchResponse.result.hits.hits

      // Max scores for max-normalisation. Guard against empty result sets.
      knnMaxScore = if (knnHits.isEmpty) 0.0 else knnResponse.result.hits.maxScore
      bm25MaxScore = if (multiMatchHits.isEmpty) 0.0 else multiMatchResponse.result.hits.maxScore

      // knn id -> raw knn score (ES Cosine _score)
      knnScoreById = knnHits.map(h => h.id -> h.score.toDouble).toMap
      // bm25 top-k id -> raw bm25 score
      bm25ScoreById = multiMatchHits.map(h => h.id -> h.score.toDouble).toMap

      // id -> SourceWrapper[Image] for every candidate we've seen (union of both result sets)
      sourceById = (knnHits.toSeq ++ multiMatchHits.toSeq).flatMap(h => resolveHit(h).map(sw => h.id -> sw)).toMap

      // bm25 contender id -> image embedding, used to compute a local cosine when the
      // contender is absent from the knn result set.
      bm25EmbeddingById = multiMatchHits.flatMap { h =>
        resolveHit(h).flatMap(_.instance.embedding).flatMap(_.cohereEmbedV4).map(e => h.id -> e.image)
      }.toMap

      // knn ids missing an exact BM25 score (not in the bm25 top-k). We fetch their exact
      // BM25 score with a second, ids-filtered query (scores only, no source).
      missingBm25Ids = knnScoreById.keySet.diff(bm25ScoreById.keySet).toList

      followUpBm25ScoreById <- if (missingBm25Ids.isEmpty) Future.successful(Map.empty[String, Double]) else {
        val followUpRequest = ElasticDsl.search(imagesCurrentAlias)
          .query(boolQuery().must(multiMatchQuery).filter(filters.ids(missingBm25Ids)))
          .fetchSource(false)
          .size(missingBm25Ids.size)
        executeHybridSearchWithTiming(followUpRequest, s"option1 bm25 fill follow-up (${missingBm25Ids.length} ids)")
          .map(_.result.hits.hits.map(h => h.id -> h.score.toDouble).toMap)
      }
    } yield {
      // Time the local (in-memory) merge + scoring separately from the ES round trips.
      val mergeStopwatch = Stopwatch.start

      // Every candidate id: union of the knn results and the bm25 top-k.
      val candidateIds = knnScoreById.keySet ++ bm25ScoreById.keySet

      val scored = candidateIds.toSeq.flatMap { id =>
        sourceById.get(id).map { source =>
          // knn score: ES knn score if present, else local cosine mapped to ES Cosine scale.
          val rawKnnScore = knnScoreById.getOrElse(id,
            bm25EmbeddingById.get(id).map(emb => knnScaledCosine(queryEmbedding, emb)).getOrElse(0.0)
          )
          // bm25 score: bm25 top-k score if present, else exact follow-up score, else 0.
          val rawBm25Score = bm25ScoreById.getOrElse(id, followUpBm25ScoreById.getOrElse(id, 0.0))

          // HNSW is approximate, so a locally-computed knn score can nudge above maxScore - clamp to 1.
          val normKnn = if (knnMaxScore > 0.0) math.min(rawKnnScore / knnMaxScore, 1.0) else 0.0
          val normBm25 = if (bm25MaxScore > 0.0) rawBm25Score / bm25MaxScore else 0.0

          val combinedScore = vecWeight * normKnn + (1.0 - vecWeight) * normBm25
          (id, source, combinedScore)
        }
      }

      val ranked = scored.sortBy { case (_, _, score) => -score }.take(k)

      logger.info(logMarker, s"hybrid search timing: option1 local merge took ${mergeStopwatch.elapsed.toMillis} ms")
      val elapsed = pipelineStopwatch.elapsed
      logger.info(combineMarkers(logMarker, elapsed), s"hybrid search timing: option1 full pipeline took ${elapsed.toMillis} ms")

      logger.info(logMarker, s"hybrid search (option1) merged ${ranked.length} results " +
        s"(knn=${knnHits.length}, bm25=${multiMatchHits.length}, bm25-fill=${missingBm25Ids.length})")

      SearchResults(
        hits = ranked.map { case (id, source, _) => (id, source) },
        total = ranked.length,
        extraCounts = None
      )
    }
  }

  // Default production hybrid search (no score-filling). A single ES request combines the
  // knn and BM25 queries, with BM25 scaled by the max BM25 score so the two score types are
  // comparable. Selected via `fillScores=off` (the default).
  private def defaultHybridSearch(
    query: String,
    queryEmbedding: List[Double],
    k: Int,
    numCandidates: Int,
    vecWeight: Double,
    filterOpt: Option[Query]
  )(implicit ex: ExecutionContext, logMarker: LogMarker): Future[SearchResults] = {
    val pipelineStopwatch = Stopwatch.start
    for {
      maxScore <- fetchMaxBm25Score(query, filterOpt)
      searchRequest = makeHybridSearchRequest(query, queryEmbedding, k, numCandidates, vecWeight, maxScore, filterOpt)
      result <- executeHybridSearchWithTiming(searchRequest, "off combined query")
    } yield {
      // Local (in-memory) work: deserialising hits into images. Timed separately from
      // the ES round trips.
      val mergeStopwatch = Stopwatch.start
      val imageHits = result.result.hits.hits.map(resolveHit).toSeq.flatten.map(i => (i.instance.id, i))
      logger.info(logMarker, s"hybrid search timing: off local merge took ${mergeStopwatch.elapsed.toMillis} ms")
      val elapsed = pipelineStopwatch.elapsed
      logger.info(combineMarkers(logMarker, elapsed), s"hybrid search timing: off full pipeline took ${elapsed.toMillis} ms")
      SearchResults(hits = imageHits, total = imageHits.length, extraCounts = None)
    }
  }

  def hybridSearch(
    query: String,
    queryEmbedding: List[Float],
    k: Int,
    numCandidates: Int,
    vecWeight: Double,
    fillScoresMode: FillScoresMode,
    filterOpt: Option[Query]
  )(
    implicit ex: ExecutionContext,
    logMarker: LogMarker
  ): Future[SearchResults] = {
    if (!includeDenseVectorMappings) {
      logger.warn(logMarker, "hybridSearch called but includeDenseVectorMappings=false, returning empty results")
      Future.successful(SearchResults(Nil, total = 0, extraCounts = None))
    } else {
      val queryEmbeddingDouble: List[Double] = queryEmbedding.map(_.toDouble)
      logger.info(logMarker, s"hybrid search mode: ${fillScoresMode.name}")
      fillScoresMode match {
        case FillScoresMode.Option1 => fillAndMaxNormalise(query, queryEmbeddingDouble, k, numCandidates, vecWeight, filterOpt)
        case FillScoresMode.Option2 => fillScoresSearch(query, queryEmbeddingDouble, k, numCandidates, vecWeight, filterOpt)
        case FillScoresMode.Off => defaultHybridSearch(query, queryEmbeddingDouble, k, numCandidates, vecWeight, filterOpt)
      }
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
