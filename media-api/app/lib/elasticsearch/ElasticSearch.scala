package lib.elasticsearch

import org.apache.pekko.actor.Scheduler
import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.lib.argo.model.{ExtraCount, ExtraCountConfig, ExtraCounts}
import com.gu.mediaservice.lib.elasticsearch.filters
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.elasticsearch.{CompletionPreview, ElasticSearchClient, ElasticSearchConfig, MigrationStatusProvider, Running}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap}
import com.gu.mediaservice.lib.metrics.FutureSyntax
import com.gu.mediaservice.model.{Agencies, Agency, AwaitingReviewForSyndication, Image}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.common.Operator.And
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
import com.sksamuel.elastic4s.requests.searches.sort.{FieldSort, Sort}
import lib.querysyntax.{HierarchyField, Match, Parser, Phrase}
import lib.{MediaApiConfig, MediaApiMetrics, SupplierUsageSummary}
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

  private def createMultiMatchQuery(query: String, boost: Option[Double] = None): MultiMatchQuery =
    MultiMatchQuery(
      text = query,
      fields = matchFields.map(field => FieldWithOptionalBoost(field, None)),
      `type` = Some(BEST_FIELDS),
      fuzziness = Some("AUTO"),
      maxExpansions = Some(50),
      operator = Some(And),
      prefixLength = Some(1),
      boost = boost
    )

  // BM25 scores are unbounded [0,inf] and typically much larger in magnitude
  // than cosine similarity (knn). So we get the max BM25 score for the query and use that to calculate
  // the scaling factor for the lexical part of the query, so that BM25 and knn scores are both between 0-1 scale
  // and can be effectively combined in a hybrid query.
  private def fetchMaxBm25Score(query: String, filterOpt: Option[Query])(implicit ex: ExecutionContext, logMarker: LogMarker): Future[Double] = {
    val baseQuery = createMultiMatchQuery(query)
    val filteredQuery = filterOpt.map(filter => boolQuery().must(baseQuery).filter(filter)).getOrElse(baseQuery)

    val maxScoreRequest = ElasticDsl.search(imagesCurrentAlias)
      .query(filteredQuery)

    executeAndLog(withSearchQueryTimeout(maxScoreRequest), "max BM25 score").map { r =>
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

    val multiMatchQuery = createMultiMatchQuery(query, boost = Some(multiMatchBoost))

    ElasticDsl.search(imagesCurrentAlias)
      .bool(BoolQuery().should(Seq(multiMatchQuery, knn)).filter(filterOpt))
      .size(k)
  }

  def hybridSearch(
    query: String,
    queryEmbedding: List[Float],
    k: Int,
    numCandidates: Int,
    vecWeight: Double,
    filterOpt: Option[Query]
  )(
    implicit ex: ExecutionContext,
    logMarker: LogMarker
  ): Future[SearchResults] = {
    val queryEmbeddingDouble: List[Double] = queryEmbedding.map(_.toDouble)

    for {
      maxScore <- fetchMaxBm25Score(query, filterOpt)
      searchRequest = makeHybridSearchRequest(query, queryEmbeddingDouble, k, numCandidates, vecWeight, maxScore, filterOpt)
      result <- executeAndLog(withSearchQueryTimeout(searchRequest), "hybrid search")
    } yield {
      val imageHits = result.result.hits.hits.map(resolveHit).toSeq.flatten.map(i => (i.instance.id, i))
      SearchResults(hits = imageHits, total = imageHits.length, extraCounts = None)
    }
  }

  def search(params: SearchParams)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal], logMarker: LogMarker = MarkerMap()): Future[SearchResults] = {
    val query: Query = queryBuilder.makeQuery(params.structuredQuery)

    val filterOpt: Option[Query] = queryBuilder.buildFilterOpt(params, searchFilters, syndicationFilter)

    val withFilter = filterOpt.map { f =>
      boolQuery() must (query) filter f
    }.getOrElse(query)

    val sort = params.orderBy match {
      case Some("dateAddedToCollection")  => sorts.dateAddedToCollectionDescending
      case Some("-dateAddedToCollection") => sorts.dateAddedToCollectionAscending
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

  // The Image schema is the source of truth for which _source fields exist; we read the field
  // names off the case class rather than hand-maintaining a list. Over-inclusion is harmless
  // (ES ignores unknown _source include paths); under-inclusion can't happen. Computed once.
  // See exploration/docs/.../phase-3-d3-searchafter-payload-perf-findings.md.
  private val imageSourceFields: Seq[String] =
    classOf[Image].getDeclaredFields.toIndexedSeq.map(_.getName)

  // Deliberately dropped from the (kupua-facing) search-after projection: the 1024-dim embedding
  // vector, the pre-edit metadata copy, and the fileMetadata bulk (EXIF/XMP/ICC/IPTC). The
  // fileMetadata alias leaves are added back from config.fieldAliasConfigs at call time.
  // Note: pur:adultContentWarning is included via fieldAliasConfigs (silent alias, both display
  // flags false) so kupua can compute graphic-image blur client-side without a Painless script.
  private val searchAfterDropFields = Set("embedding", "originalMetadata", "fileMetadata")

  // Search-after-only hit resolver. The search-after projection includes alias leaf paths
  // (e.g. fileMetadata.icc.Profile Description) but drops the heavy parent objects, so _source
  // carries a PARTIAL fileMetadata that Image's reader rejects (its iptc/exif/exifSub/xmp
  // sub-maps are required, not nullable). We strip every dropped field from a copy of the
  // source before validating as Image (absent -> default, which the reader tolerates), while
  // keeping the FULL source in the wrapper so ImageResponse.extractAliasFieldValues can still
  // read the alias leaves. Kept deliberately separate from the shared resolveHit/mapImageFrom
  // used by production search, which must stay untouched.
  private def resolveSearchAfterHit(hit: SearchHit): Option[SourceWrapper[Image]] = {
    val source   = Json.parse(hit.sourceAsString)
    val forImage = searchAfterDropFields.foldLeft(source.as[JsObject])(_ - _)
    forImage.validate[Image] match {
      case JsSuccess(image, _) => Some(SourceWrapper(source, image, hit.index, JsObject.empty))
      case e: JsError =>
        logger.error("Failed to parse search-after image from source string " + hit.id + ": " + e.toString)
        None
    }
  }

  def searchAfter(params: SearchAfterParams)
                 (implicit ec: ExecutionContext, logMarker: LogMarker): Future[SearchAfterRawResults] = {
    val rawQuery: Query = queryBuilder.makeQuery(params.searchParams.structuredQuery)
    val filterOpt: Option[Query] =
      queryBuilder.buildFilterOpt(params.searchParams, searchFilters, syndicationFilter)
    val filteredQuery: Query = filterOpt.map(f => boolQuery() must rawQuery filter f).getOrElse(rawQuery)

    val baseSorts          = params.sort.map(sorts.jsonToSort)
    val withReverse        = if (params.reverse) sorts.reverseSorts(baseSorts) else baseSorts
    val effectiveSortClause = if (params.seekToEnd) {
      withReverse.headOption match {
        case Some(fs: FieldSort) => fs.missing("_first") +: withReverse.tail
        case _                   => withReverse
      }
    } else withReverse

    val isNullZone = params.sortValues.exists(_.headOption.contains(JsNull))

    val (effectiveSortValues, workingSort, extraMustNot) = if (isNullZone) {
      val sv           = params.sortValues.get
      val primaryField = baseSorts.collectFirst { case fs: FieldSort => fs.field }
        .getOrElse(throw InvalidUriParams("cannot detect primary sort field for null-zone cursor"))
      val nzSort   = effectiveSortClause.filterNot { case fs: FieldSort => fs.field == primaryField; case _ => false }
      val nzFilter = boolQuery().withNot(existsQuery(primaryField))
      (Some(sv.tail), nzSort, Some(nzFilter))
    } else {
      (params.sortValues, effectiveSortClause, None)
    }

    effectiveSortValues.foreach { sv =>
      if (sv.length != workingSort.length)
        return Future.failed(InvalidUriParams(
          s"sortValues length ${sv.length} must equal sort clause length ${workingSort.length}"))
    }

    val effectiveQuery: Query = extraMustNot match {
      case Some(nzf) => boolQuery().must(filteredQuery).filter(nzf)
      case None      => filteredQuery
    }

    val baseRequest = params.pitId match {
      case Some(pid) =>
        // Bypass prepareSearch when a PIT is active. prepareSearch appends a migration dedup
        // filter (must_not esInfo.migration.migratedTo = <new>) to avoid returning the same
        // image twice when searching both the current and migration indexes live. With a PIT
        // that filter is actively harmful: the snapshot already captures the correct merged
        // view at open-time, but migrated images (which have esInfo.migration.migratedTo set)
        // would be silently excluded, causing results to shrink progressively as migration
        // proceeds. Use ElasticDsl.search(Nil) so ES resolves the search target from the PIT
        // ID directly, with no index list and no migration filter.
        // See media-api-work/phase-3-minimal-gap-derivation-findings.md §7 obs 5.
        withSearchQueryTimeout(ElasticDsl.search(Nil).query(effectiveQuery)).pit(Pit(pid).keepAlive(1.minute))
      case None =>
        prepareSearch(effectiveQuery)
    }

    val withSort = baseRequest
      .size(params.searchParams.length)
      .sortBy(workingSort)
      .trackTotalHits(params.searchParams.countAll.getOrElse(true))

    val request = effectiveSortValues match {
      case Some(sv) => withSort.searchAfter(sv.map(jsValueToAny))
      case None     => withSort
    }

    // Lean _source projection for this (kupua-facing) endpoint: the Image schema minus the
    // heavy unused giants (searchAfterDropFields), plus the specific alias leaf paths so their
    // values survive (e.g. fileMetadata.icc.Profile Description). This yields a PARTIAL
    // fileMetadata in _source; resolveSearchAfterHit strips the dropped fields before Image
    // validation while preserving the alias leaves for extractAliasFieldValues.
    val projectionIncludes: Seq[String] =
      imageSourceFields.filterNot(searchAfterDropFields) ++ config.fieldAliasConfigs.map(_.elasticsearchPath)

    val projected = request
      .sourceInclude(projectionIncludes.head, projectionIncludes.tail: _*)

    executeAndLog(projected, "search-after").map { r =>
      val sortLen = workingSort.length

      val (rawHits, rawSortValues) = r.result.hits.hits.toSeq.flatMap { hit =>
        resolveSearchAfterHit(hit).map { image =>
          ((image.instance.id, image), sortValuesToJsValues(hit.sort.getOrElse(Seq.empty).take(sortLen)))
        }
      }.unzip

      val (orderedHits, orderedSortValues) =
        if (params.reverse) (rawHits.reverse, rawSortValues.reverse) else (rawHits, rawSortValues)

      val finalSortValues = if (isNullZone) {
        val primaryField = baseSorts.collectFirst { case fs: FieldSort => fs.field }.get
        remapNullZoneSortValues(orderedSortValues, baseSorts, primaryField)
      } else orderedSortValues

      SearchAfterRawResults(
        hits           = orderedHits,
        total          = if (params.searchParams.countAll.getOrElse(true)) r.result.totalHits else 0L,
        sortValues     = finalSortValues,
        nextSortValues = finalSortValues.lastOption,
        pitId          = r.result.pitId.filter(_.nonEmpty).orElse(params.pitId),
      )
    }
  }

  private def sortValueToJsValue(v: AnyRef): JsValue = v match {
    case null                  => JsNull
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
  // Mirrors remapNullZoneSortValues in kupua/src/dal/null-zone.ts.
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
